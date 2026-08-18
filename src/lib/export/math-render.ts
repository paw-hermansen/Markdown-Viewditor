import katex from "katex";

// Side-effect: register the mhchem \ce and \pu macros on the global katex
// instance so chemical formulas (e.g. $\ce{H2O}$) and physical units
// (e.g. $\pu{123 kJ/mol}$) render in ODT/EPUB MathML exports. Ships inside
// katex; no extra dependency.
import "katex/contrib/mhchem";

/**
 * Fix MathML structural violations in KaTeX's MathML output so that
 * LibreOffice's strict parser can handle the formulas. Browsers and
 * MathJax are more forgiving; LibreOffice shows `¿` for unparseable
 * content such as dangling operators or illegally nested elements.
 *
 * Fixes applied:
 *   - Unwrap `<mi><munder>…</munder></mi>` → `<munder>…</munder>`.
 *   - Unwrap `<mo><mrow>…</mrow></mo>` → `<mrow>…</mrow>` (KaTeX wraps the
 *     base of `\underset` in `<mo>` instead of `<mrow>` when the base is
 *     a `\ce{}` expression).
 *   - Remove trailing empty `<mrow></mrow>` artefacts inside munder bodies.
 *   - Replace zero-width phantom `<mpadded width="0px"><mphantom>` with
 *     `<mrow/>`. KaTeX uses these as invisible bases for superscripts/
 *     subscripts in chemical formulas, but LibreOffice collapses them to
 *     nothing, leaving dangling `+`/`−` operators — hence `¿`.
 *   - Append `<mrow/>` after trailing `+`/`−`/`-` operators at the end of
 *     an `<mrow>`. LibreOffice's operator dictionary has no postfix entry
 *     for `+`/`−`, so it falls back to infix and expects a right operand.
 */
function sanitizeKaTeXMathml(mathml: string): string {
  let result = mathml;
  // <mi> (identifier) wrapping <munder> (underset) is illegal MathML —
  // KaTeX sometimes produces this when \underset{\text{…}}{\ce{…}} is
  // nested inside \ce{…}. Unwrap <mi>…</mi> around <munder>.
  result = result.replace(/<\s*mi\b[^>]*>\s*(<\s*munder\b[^>]*>)/g, "$1");
  result = result.replace(/(<\/munder>)\s*<\/mi>/g, "$1");
  // <mo> (operator) wrapping <mrow> is also illegal — KaTeX wraps the
  // \underset base in <mo> instead of <mrow> when the base is a \ce{}
  // expression. Unwrap <mo>…</mo> around <mrow>.
  result = result.replace(/<\s*mo\b[^>]*>\s*(<\s*mrow\b[^>]*>)/g, "$1");
  result = result.replace(/(<\/mrow>)\s*<\/mo>/g, "$1");
  // Remove trailing empty <mrow> artefacts inside munder bodies.
  result = result.replace(/<mrow>\s*<\/mrow>\s*(<\/mrow>)/g, "$1");
  // Replace KaTeX's zero-width phantom base (width="0px" mpadded
  // wrapping mphantom>mi>X) with an empty <mrow/>. LibreOffice treats
  // an empty row as {} — a valid operand — preventing dangling-operator
  // errors that manifest as ¿.
  result = result.replace(
    /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b[^>]*>\s*<\s*mi\b[^>]*>\s*X\s*<\/mi>\s*<\/mphantom>\s*<\/mpadded>\s*/g,
    "<mrow/>",
  );
  // Wrap bare <mo>+/-</mo> inside <msup>/<msub> in <mrow> so it becomes a
  // proper child element.  KaTeX puts charge signs like ^{−} as direct
  // children of <msup>: <msup><mrow/><mo>−</mo></msup>.  This is valid
  // MathML, but LibreOffice needs the operator to be inside an <mrow> so
  // it can be resolved as postfix (not infix).  The wrapper keeps msup's
  // child count at 2 (base + superscript).
  result = result.replace(
    /(<msu[bp]><mrow\/>)<mo\b([^>]*)>\s*([+−-])\s*<\/mo>(<\/msu[bp]>)/g,
    "$1<mrow><mo$2>$3</mo></mrow>$4",
  );
  // Append <mrow/> after trailing +/−/- at the end of any <mrow>.  The
  // empty <mrow/> provides the right operand that LibreOffice's operator
  // dictionary requires (it has no postfix entry for + or −).  Browsers
  // render this as a minimal-width empty group — essentially invisible.
  result = result.replace(
    /(<mo\b[^>]*>\s*[+−-]\s*<\/mo>)\s*(<\/mrow>)/g,
    "$1<mrow/>$2",
  );
  return result;
}

/**
 * Render a LaTeX string to MathML using KaTeX. Suitable for ODT and EPUB
 * export where native MathML support is available.
 *
 * @param tex - LaTeX source (without delimiters)
 * @param displayMode - true for display math ($$...$$), false for inline ($...$)
 * @returns MathML markup string (the <math> element only, no KaTeX wrapper)
 */
export function renderMathToMathml(tex: string, displayMode = false): string {
  const html = katex.renderToString(tex, {
    output: "mathml",
    throwOnError: false,
    displayMode,
  });
  // KaTeX wraps the <math> element in <span class="katex">...</span>.
  // Extract just the <math>...</math> portion for use in ODF/EPUB.
  const start = html.indexOf("<math");
  const end = html.lastIndexOf("</math>");
  if (start >= 0 && end >= 0) {
    return sanitizeKaTeXMathml(html.slice(start, end + "</math>".length));
  }
  // Fallback: return as-is if no <math> found
  return html;
}

/* ──────────────────── PNG rasterization ─────────────────────────────── */

export const MAX_MATH_RASTER_AXIS_PX = 4096;

/**
 * The font-size (CSS px) set on the off-screen KaTeX capture host.
 * KaTeX's `.katex { font: 1.21em ... }` multiplies this, so the actual
 * glyph size is `HOST_FONT_SIZE × 1.21`.  Keeping this larger than the
 * typical ODT body text (10pt ≈ 13px) and scaling the returned
 * dimensions down gives a *supersampling* effect — the bitmap has
 * more detail than the display size needs, producing sharp text.
 */
const HOST_FONT_SIZE = 16;

/**
 * Vertical safety buffer (CSS px) applied above and below the KaTeX
 * render before html2canvas captures it. Sized to comfortably absorb
 * the worst-case under-reporting of `getBoundingClientRect()` for
 * KaTeX's `.katex` element (KaTeX uses `.vlist > span { height: 0 }`
 * with positioned descendants, so the bbox can miss deep descenders
 * by 4–10 px in practice). After capture, `cropTransparentRows` strips
 * the resulting transparent rows from top and bottom so the ODT image
 * is exactly the formula's natural height. Keep this in sync with the
 * cap inside `cropTransparentRows`.
 */
const BUFFER_PX = 20;

export interface RenderedMathPng {
  png: Uint8Array;
  /** Layout width in CSS px. This is the on-screen size of the formula
   * (unscaled by the rasterization `scale` parameter) and is what the
   * consumer should use for the displayed image size — typically by
   * dividing by 96 to convert CSS px to inches for ODT `svg:width`. The
   * bitmap inside `png` has `widthPx * scale` pixels, but those extra
   * pixels only affect sharpness, not display size. Returning the
   * post-scale dimensions here would make the formula render N times
   * larger than the surrounding text when `scale` is N. */
  widthPx: number;
  /** Layout height in CSS px (see `widthPx`). */
  heightPx: number;
}

/**
 * Render a LaTeX expression to a PNG bitmap by mounting KaTeX's HTML
 * output in a hidden off-screen container and capturing it via
 * `html2canvas`. Used by the ODT exporter when the user opts to embed
 * formulas as raster images instead of editable MathML.
 *
 * The function depends on a browser DOM (`document`, `document.fonts`,
 * `OffscreenCanvas`). In environments without those it throws — callers
 * (the ODT exporter) catch the throw and fall back to the MathML path.
 *
 * @param tex - LaTeX source (without delimiters)
 * @param displayMode - true for display math ($$...$$), false for inline ($...$)
 * @param scale - Pixel-scale multiplier (1 = 96 DPI, 2 = Retina, etc.)
 * @param targetFontSize - If set, the returned `widthPx`/`heightPx` are
 *   scaled down by `targetFontSize / HOST_FONT_SIZE` so the ODT image
 *   displays at the target font size while the bitmap retains the full
 *   sharpness of the larger host render (supersampling). Omit to get the
 *   raw host-size dimensions.
 */
export async function renderMathToPng(
  tex: string,
  displayMode: boolean,
  scale: number,
  targetFontSize?: number,
): Promise<RenderedMathPng> {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`renderMathToPng: invalid scale ${scale}`);
  }

  // The browser-side dependencies are required for the raster pipeline.
  // Returning a clear error lets the ODT exporter fall back to MathML.
  const host = ensureHost();
  if (!host) {
    throw new Error("renderMathToPng: no DOM available");
  }
  // html2canvas 1.4.1 is patched in patches/html2canvas+1.4.1.patch so its
  // canvas baseline probe includes KaTeX's italic font style and weight.
  const html2canvas = (await import("html2canvas")).default;

  // KaTeX HTML output is a <span class="katex">…</span> (inline) or
  // <span class="katex-display">…</span> (display). Wrap it in a div
  // that mirrors the page-content layout: `display: block` for display
  // math (fills the host, anchors `.katex`'s `text-align: center` so
  // the formula centers within the captured PNG and `.tag { right: 0 }`
  // lands at the right edge of the page); `display: inline-block` for
  // inline math (shrink-wraps to the formula's natural width). The
  // vertical padding (BUFFER_PX) gives html2canvas generous safety
  // margin above and below the formula — KaTeX's strut sits below the
  // baseline via `vertical-align: -Xem`, fractions use `.vlist` rows
  // that can clip deep descenders, and `getBoundingClientRect()` can
  // under-report the actual rendered extent. After capture we strip
  // the empty rows from top and bottom in `cropTransparentRows` so the
  // returned PNG is exactly the formula's natural height with no
  // wasted vertical space in the ODT.
  const katexHtml = katex.renderToString(tex, {
    output: "html",
    throwOnError: false,
    displayMode,
  });
  const wrapperStyle = displayMode
    ? `display:block;padding:${BUFFER_PX}px 0;`
    : `display:inline-block;padding:${BUFFER_PX}px 0;`;
  host.innerHTML = `<div style="${wrapperStyle}">${katexHtml}</div>`;

  // Wait for the woff2 KaTeX fonts (already loaded by the document) so the
  // text isn't captured as the fallback font's glyphs.
  if (typeof document !== "undefined" && (document as Document).fonts) {
    try {
      const fonts = (document as Document).fonts;
      await Promise.all([
        fonts.load("normal 16px KaTeX_Main"),
        fonts.load("italic 16px KaTeX_Math"),
        fonts.ready,
      ]);
    } catch {
      // Some headless environments reject fonts.ready — non-fatal.
    }
  }
  // Two RAFs let layout settle before capture.
  if (typeof requestAnimationFrame !== "undefined") {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }

  const target = host.firstElementChild as HTMLElement | null;
  if (!target) throw new Error("renderMathToPng: empty render");
  const rect = target.getBoundingClientRect();
  const cssW = Math.max(1, Math.ceil(rect.width));
  const cssH = Math.max(1, Math.ceil(rect.height));

  const targetW = Math.min(MAX_MATH_RASTER_AXIS_PX, Math.round(cssW * scale));
  const targetH = Math.min(MAX_MATH_RASTER_AXIS_PX, Math.round(cssH * scale));

  // Re-measure after clamping in case the formula was oversized. The
  // bitmap is rendered at `cssScale` (≥ 1) — that controls *sharpness*,
  // not display size. The returned `widthPx`/`heightPx` are the on-screen
  // CSS dimensions, so a higher `scale` makes the PNG sharper without
  // making the formula larger in the document.
  const cssScaleX = targetW / cssW;
  const cssScaleY = targetH / cssH;
  const cssScale = Math.min(cssScaleX, cssScaleY);

  // Cast to `any` because the bundled `@types/html2canvas` is from v0.5
  // and doesn't know about `scale` / `windowWidth` / `windowHeight`,
  // which are standard options in html2canvas 1.x.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas: HTMLCanvasElement = await (html2canvas as any)(target, {
    // `backgroundColor: null` is the documented way to make the
    // canvas transparent; passing `background` (the wrong option name)
    // was silently ignored, so html2canvas fell back to the document
    // body's white background and the empty padding rows came out
    // opaque white — which made `cropTransparentRows`'s alpha===0
    // check miss them entirely.
    backgroundColor: null,
    scale: cssScale,
    logging: false,
    width: cssW,
    height: cssH,
    windowWidth: cssW,
    windowHeight: cssH,
  });

  // Strip the safety buffer from top/bottom of the captured PNG by
  // scanning pixel rows for non-transparent content. The returned
  // `heightPx` is the cropped CSS height (no buffer), so the ODT
  // image is exactly the formula's natural height.
  const croppedCanvas = cropTransparentRows(canvas, BUFFER_PX, cssScale);
  const croppedCssH = Math.max(1, croppedCanvas.height / cssScale);

  const png = await canvasToPng(croppedCanvas);

  // Reset the host so the next call doesn't pick up stale content.
  host.innerHTML = "";

  // Apply supersampling scale: when targetFontSize < HOST_FONT_SIZE,
  // shrink the reported dimensions so the ODT image displays smaller
  // while the bitmap retains the full sharpness of the host render.
  const dimScale =
    targetFontSize != null && targetFontSize > 0
      ? targetFontSize / HOST_FONT_SIZE
      : 1;
  return {
    png,
    widthPx: cssW * dimScale,
    heightPx: croppedCssH * dimScale,
  };
}

/**
 * The off-screen container into which KaTeX HTML is mounted before
 * html2canvas captures it. Width is pinned to a value matching the
 * typical ODT page-content area (≈ 600 px, i.e. A4 with 1 in margins)
 * so `.katex-display` (which is `display: block` and fills its
 * parent) anchors to a stable, page-like width. That anchors the
 * formula's `text-align: center` so the formula centers within the
 * captured PNG, and places `.tag { right: 0 }` at the right edge of
 * the page instead of the right edge of the formula. Inline math is
 * unaffected because its wrapper inside the host is `display:
 * inline-block` and shrink-wraps to the formula's natural width.
 */
function ensureHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let host = document.getElementById("katex-raster-host") as HTMLElement | null;
  if (host) return host;
  host = document.createElement("div");
  host.id = "katex-raster-host";
  host.setAttribute("aria-hidden", "true");
  // Off-screen but rendered (so html2canvas sees the laid-out pixels).
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  // Pin KaTeX's `font: 1.21em KaTeX_Main` to a predictable 16 px
  // host, and neutralize any inherited `line-height` so the layout box
  // doesn't include leading that html2canvas then clips.
  host.style.fontSize = "16px";
  host.style.lineHeight = "normal";
  // Force pure-black text so the rasterized formula isn't tinted by
  // the app theme's --text-primary (dark-gray in light mode).
  host.style.color = "#000";
  // Anchor `.katex-display`'s parent-width layout (see host docstring).
  host.style.width = `${MATH_HOST_WIDTH_PX}px`;
  document.body.appendChild(host);
  return host;
}

/** Width of the off-screen KaTeX capture host, in CSS px. Matches the
 * typical ODT page-content area (A4 with 1 in margins → ~6.27 in) so a
 * display-math rasterization produces a PNG that, at 96 DPI, fits the
 * page-content column. The captured PNG width drives the ODT image
 * width (via `widthPx / 96`), so the host width directly determines
 * the on-page formula/tag layout. */
const MATH_HOST_WIDTH_PX = 600;

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof canvas.toBlob === "function") {
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob) return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return base64ToBytes(dataUrl.slice(comma + 1));
  }
  throw new Error("renderMathToPng: canvas has no PNG export method");
}

/**
 * Strip background-colored rows from the top and bottom of `canvas`,
 * returning a new canvas (or the input itself if no crop is possible).
 * The `bufferCssPx` is the amount of vertical safety padding that was
 * applied above and below the formula before capture — we never strip
 * more than that on either side, so a formula that was so tall the
 * buffer wasn't quite enough on one side doesn't get re-clipped.
 *
 * The background color is sampled from the top-left pixel rather than
 * assumed transparent — html2canvas fills unoccupied pixels with the
 * element's computed background, which in many webviews is white (the
 * document body's background), not transparent. Sampling the corner
 * pixel lets us crop correctly against whatever fill html2canvas used.
 *
 * Equal amounts are stripped from top and bottom to preserve the
 * formula's natural vertical centering — the formula stays where KaTeX
 * put it; we only remove the empty buffer rows above and below it.
 *
 * Returns the original canvas unchanged when 2D context, pixel data,
 * or no-content rows can't be obtained, so callers can safely chain it.
 *
 * Exported for unit testing with synthetic pixel data — jsdom doesn't
 * implement `getContext('2d').getImageData`, so the production path
 * can't be exercised end-to-end in jsdom.
 *
 * @param canvas - The html2canvas output (scaled by `scale`).
 * @param bufferCssPx - The amount of padding added at capture time.
 * @param scale - The pixel-scale multiplier passed to html2canvas.
 */
export function cropTransparentRows(
  canvas: HTMLCanvasElement,
  bufferCssPx: number,
  scale: number,
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Some headless environments reject getImageData (tainted canvas).
    // Returning the un-cropped canvas is safer than throwing here —
    // the formula will render with its safety padding intact.
    return canvas;
  }

  // Sample the top-left pixel as the background reference. This is in
  // the wrapper's padding area, which is empty by construction, so it
  // reflects whatever html2canvas fills unoccupied space with.
  // Tolerate a few levels of variation so antialiased edge pixels
  // (which sit just inside the content area) are correctly classified.
  const TOLERANCE = 4;
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const bgA = data[3];

  const matchesBg = (i: number): boolean =>
    Math.abs(data[i] - bgR) <= TOLERANCE &&
    Math.abs(data[i + 1] - bgG) <= TOLERANCE &&
    Math.abs(data[i + 2] - bgB) <= TOLERANCE &&
    Math.abs(data[i + 3] - bgA) <= TOLERANCE;

  const rowHasContent = (y: number): boolean => {
    const base = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (!matchesBg(base + x * 4)) return true;
    }
    return false;
  };

  let firstContent = -1;
  for (let y = 0; y < h; y++) {
    if (rowHasContent(y)) {
      firstContent = y;
      break;
    }
  }
  let lastContent = -1;
  for (let y = h - 1; y >= 0; y--) {
    if (rowHasContent(y)) {
      lastContent = y;
      break;
    }
  }
  // Fully empty or content bounds invalid — leave the canvas alone.
  if (firstContent < 0 || lastContent < 0 || lastContent < firstContent) {
    return canvas;
  }

  const topEmpty = firstContent;
  const bottomEmpty = h - 1 - lastContent;
  // Cap at the buffer size in *canvas pixels*. This protects against
  // edge cases where the formula extends to the very edge of the
  // capture region (buffer wasn't enough on one side) — we'd rather
  // keep a few empty pixels than clip formula ink.
  const bufferPx = Math.max(0, Math.round(bufferCssPx * scale));
  const strip = Math.min(topEmpty, bottomEmpty, bufferPx);

  if (strip <= 0) return canvas;
  const newH = h - 2 * strip;
  if (newH <= 0) return canvas;

  const cropped = document.createElement("canvas");
  cropped.width = w;
  cropped.height = newH;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) return canvas;
  croppedCtx.drawImage(canvas, 0, strip, w, newH, 0, 0, w, newH);
  return cropped;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
