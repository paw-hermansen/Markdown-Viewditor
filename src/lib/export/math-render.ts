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
 * by 4–10 px in practice). After capture, `cropTransparentBounds` strips
 * only the added symmetric safety rows; the inline line box remains in the
 * image for stable baseline alignment. Keep this in sync with the cap inside
 * `cropTransparentBounds`.
 */
const BUFFER_PX = 20;

/**
 * Horizontal safety buffer (CSS px) added to both sides of the expanded
 * capture root. After capture, symmetric horizontal cropping removes
 * equal amounts from both sides to preserve the formula's centering
 * position. At effective raster scale `r`, the capture contains roughly
 * `round(20 * r)` bitmap pixels of removable horizontal safety space
 * on each side.
 */
const HORIZONTAL_BUFFER_PX = 20;

export interface RenderedMathPng {
  png: Uint8Array;
  /** Logical width in CSS px, after cropping and target-font scaling.
   * This is the on-screen size of the formula and is what the consumer
   * should use for the displayed image size — typically by dividing by
   * 96 to convert CSS px to inches for ODT `svg:width`. The bitmap
   * inside `png` has more pixels (controlled by the resolution setting),
   * but those extra pixels only affect sharpness, not display size. */
  widthPx: number;
  /** Logical height in CSS px (see `widthPx`). */
  heightPx: number;
}

/**
 * Options for `renderMathToPng`. Using a named object makes the renderer
 * reusable by future exporters that may choose different layout widths
 * or font-size targets.
 */
export interface MathPngOptions {
  /** LaTeX source (without delimiters). */
  tex: string;
  /** True for display math ($$...$$), false for inline ($...$). */
  displayMode: boolean;
  /** Pixel-scale multiplier (1 = 96 DPI, 2 = Retina, etc.). Controls
   * bitmap sharpness only, not logical dimensions. */
  resolution: number;
  /** Page-like width (CSS px) used to lay out ordinary display math
   * and position equation tags. Defaults to `MATH_HOST_WIDTH_PX`. */
  layoutWidthPx?: number;
  /** If set, the returned `widthPx`/`heightPx` are scaled down by
   * `targetFontSize / HOST_FONT_SIZE` so the ODT image displays at
   * the target font size while the bitmap retains the full sharpness
   * of the larger host render (supersampling). */
  targetFontSize?: number;
}

/**
 * Measure the visual bounds of a rendered KaTeX formula, including
 * any content that overflows the target's CSS border box.
 *
 * Strategy:
 * 1. Start with the target's own `getBoundingClientRect()` so the
 *    page-like layout box and an automatic tag at its right edge
 *    remain part of the initial layout bounds.
 * 2. Walk every descendant of `.katex-html`, calling `getClientRects()`
 *    and unioning every non-empty rectangle. Use descendant rectangles
 *    rather than the `.katex-html` rectangle itself, because
 *    `.katex-html` is a block whose rectangle is the fixed layout
 *    width, not the formula's ink bounds.
 * 3. Skip `display:none` and `visibility:hidden` nodes. Restrict the
 *    walk to `.katex-html` so the hidden `.katex-mathml` tree cannot
 *    enlarge the bounds. Include `.tag` descendants and SVG viewport
 *    rectangles, but not the clipped SVG descendants themselves.
 * 4. Walk visible text nodes under `.katex-html`, create a `Range`
 *    for each, and union its non-empty `getClientRects()` as a
 *    supplement. Apply the same visibility filtering.
 * 5. Normalize the union to coordinates relative to the target's
 *    rectangle and return `left`, `right`, `top`, `bottom` values.
 *
 * @param target - The wrapper element containing KaTeX HTML output.
 * @returns Bounds relative to the target's rect, preserving negative
 *   left overflow and right overflow independently.
 */
export function measureMathVisualBounds(target: HTMLElement): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const targetRect = target.getBoundingClientRect();

  // Find the .katex-html descendant (the visible rendering tree).
  const katexHtml = target.querySelector(".katex-html") as HTMLElement | null;
  const searchRoot = katexHtml ?? target;

  // Keep the layout box in the union.  Apart from preserving a display
  // equation's page-width layout, this keeps an inline formula's line box
  // available when its positioned descendants report only their ink.
  let minLeft = targetRect.left;
  let maxRight = targetRect.right;
  let minTop = targetRect.top;
  let maxBottom = targetRect.bottom;

  function isVisible(el: Element): boolean {
    const view = el.ownerDocument.defaultView;
    if (!view) return true;
    try {
      const style = view.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse"
      );
    } catch {
      // A detached or partially mocked DOM may not expose computed styles.
      return true;
    }
  }

  function unionRect(rect: DOMRect): void {
    // KaTeX uses zero-width .pstrut elements with a large vertical rect.
    // They establish layout, but have no paintable area and must not move
    // the capture region. Reject either non-positive axis, not just an
    // entirely empty rectangle.
    if (
      !(rect.width > 0 && rect.height > 0) ||
      !(rect.right > rect.left && rect.bottom > rect.top)
    ) {
      return;
    }
    if (rect.left < minLeft) minLeft = rect.left;
    if (rect.right > maxRight) maxRight = rect.right;
    if (rect.top < minTop) minTop = rect.top;
    if (rect.bottom > maxBottom) maxBottom = rect.bottom;
  }

  function hasHiddenAncestor(el: Element): boolean {
    let ancestor: Element | null = el;
    while (ancestor) {
      if (!isVisible(ancestor)) return true;
      if (ancestor === searchRoot) break;
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  function isSvgElement(el: Element): boolean {
    return el.tagName.toLowerCase() === "svg";
  }

  function isInsideSvg(el: Element): boolean {
    return el.closest("svg") !== null;
  }

  function isLayoutOnly(el: Element): boolean {
    // `.vlist-s` is a 1px-font table spacer used by KaTeX to complete a
    // vertical-list table. It has a positive box but paints no formula ink.
    return el.closest(".vlist-s") !== null;
  }

  function unionElementRects(el: Element): void {
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      unionRect(rects[i]);
    }

    // SVG implementations normally expose the viewport through
    // getClientRects(), but the fallback also keeps the measurement useful
    // in webviews and test DOMs that only implement getBoundingClientRect().
    if (isSvgElement(el) && rects.length === 0) {
      unionRect(el.getBoundingClientRect());
    }
  }

  // Walk all descendants of the search root, unioning their client rects.
  const walker = document.createTreeWalker(
    searchRoot,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (hasHiddenAncestor(el)) continue;
      if (isLayoutOnly(el)) continue;

      // The SVG viewport is the only reliable geometry for clipped KaTeX
      // symbols. Paths and <use> nodes can report their untransformed
      // viewBox dimensions (for example, 400000 units) and would inflate
      // the capture region far beyond what is actually visible.
      if (isInsideSvg(el) && !isSvgElement(el)) continue;

      unionElementRects(el);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      // Check visibility of parent element.
      const parent = textNode.parentElement;
      if (!parent) continue;
      if (
        hasHiddenAncestor(parent) ||
        isInsideSvg(parent) ||
        isLayoutOnly(parent)
      ) {
        continue;
      }

      // Create a Range for the text node and union its client rects.
      try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          unionRect(rects[i]);
        }
      } catch {
        // Some environments may not support Range — skip.
      }
    }
  }

  // Normalize to target-relative coordinates.
  return {
    left: minLeft - targetRect.left,
    right: maxRight - targetRect.left,
    top: minTop - targetRect.top,
    bottom: maxBottom - targetRect.top,
  };
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
 * @param options - Rendering options (see `MathPngOptions`).
 * @returns The PNG bytes and logical dimensions in CSS px.
 */
export async function renderMathToPng(
  texOrOptions: string | MathPngOptions,
  displayMode?: boolean,
  scale?: number,
  targetFontSize?: number,
): Promise<RenderedMathPng> {
  // Support both the old positional signature and the new options object.
  const opts: MathPngOptions =
    typeof texOrOptions === "string"
      ? {
          tex: texOrOptions,
          displayMode: displayMode ?? false,
          resolution: scale ?? 1,
          targetFontSize,
        }
      : texOrOptions;

  const requestedScale = opts.resolution;
  if (!Number.isFinite(requestedScale) || requestedScale <= 0) {
    throw new Error(`renderMathToPng: invalid scale ${requestedScale}`);
  }

  const layoutWidth = opts.layoutWidthPx ?? MATH_HOST_WIDTH_PX;
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) {
    throw new Error(`renderMathToPng: invalid layout width ${layoutWidth}`);
  }
  const dimScale =
    opts.targetFontSize != null && opts.targetFontSize > 0
      ? opts.targetFontSize / HOST_FONT_SIZE
      : 1;
  if (!Number.isFinite(dimScale) || dimScale <= 0) {
    throw new Error("renderMathToPng: invalid target font scale");
  }

  const katexHtml = katex.renderToString(opts.tex, {
    output: "html",
    throwOnError: false,
    displayMode: opts.displayMode,
  });
  const hasDisplayTag =
    opts.displayMode && /\bclass="[^"]*\btag\b/.test(katexHtml);

  // A tagged display image contains the page-like layout area as well as the
  // formula. When the logical dimensions are scaled to the target font,
  // render that area at the inverse width so the scaled image still occupies
  // the requested page width. This keeps automatic equation tags at the page
  // edge while the formula glyphs receive the target-font scaling. Untagged
  // display math keeps the smaller host capture; its centered formula does
  // not need page-edge whitespace.
  const captureLayoutWidth =
    opts.displayMode && hasDisplayTag ? layoutWidth / dimScale : layoutWidth;

  // The browser-side dependencies are required for the raster pipeline.
  // Returning a clear error lets the ODT exporter fall back to MathML.
  const host = ensureHost(captureLayoutWidth);
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
  // inline math (shrink-wraps to the formula's natural width). Display
  // padding remains part of its block layout; inline math gets its safety
  // padding only from the outer capture root so the returned image retains
  // the line box without adding 40px to its logical height. KaTeX's strut
  // sits below the baseline via `vertical-align: -Xem`, fractions use
  // `.vlist` rows that can clip deep descenders, and
  // `getBoundingClientRect()` can under-report the actual rendered extent.
  // After capture we strip only the symmetric outer safety rows in
  // `cropTransparentBounds`.
  const wrapperStyle = opts.displayMode
    ? `display:block;padding:${BUFFER_PX}px 0;`
    : "display:inline-block;";
  const inlineBaselineProbe = opts.displayMode
    ? ""
    : '<span aria-hidden="true" style="display:inline-block;width:0;height:0;line-height:0;overflow:hidden;vertical-align:baseline;visibility:hidden;"></span>';

  // The zero-size inline participant gives the wrapper a stable baseline even
  // when KaTeX's positioned descendants have no useful line-box rectangle.
  // It is hidden and has no area, so it cannot affect visual-bounds scanning.
  host.innerHTML = `<div style="${wrapperStyle}">${inlineBaselineProbe}${katexHtml}</div>`;

  try {
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

    // ── Measure visual bounds (including overflow) ──
    const bounds = measureMathVisualBounds(target);
    const targetRect = target.getBoundingClientRect();

    // The layout width is the target's CSS box width (page-like for display
    // math, shrink-wrapped for inline).
    if (
      !Number.isFinite(targetRect.width) ||
      !Number.isFinite(targetRect.height) ||
      targetRect.width <= 0 ||
      targetRect.height <= 0
    ) {
      throw new Error("renderMathToPng: invalid target geometry");
    }
    const layoutCssW = Math.max(1, Math.ceil(targetRect.width));
    const layoutCssH = Math.max(1, Math.ceil(targetRect.height));

    // The capture region must cover the complete visual bounds plus safety
    // padding. For display math, overflow can extend on both sides.
    const visualLeft = bounds.left;
    const visualRight = bounds.right;
    const visualTop = bounds.top;
    const visualBottom = bounds.bottom;

    if (
      !Number.isFinite(visualLeft) ||
      !Number.isFinite(visualRight) ||
      !Number.isFinite(visualTop) ||
      !Number.isFinite(visualBottom) ||
      visualRight <= visualLeft ||
      visualBottom <= visualTop
    ) {
      throw new Error("renderMathToPng: invalid visual bounds");
    }

    // Capture width covers the full visual extent. Inline math always gets
    // horizontal safety padding because it is cropped symmetrically later.
    // Display math only needs the padding when it actually overflows its
    // page-like layout box; ordinary display math must retain the exact
    // layout width so its centering and equation-tag position are unchanged.
    const displayOverflowsHorizontally =
      visualLeft < 0 || visualRight > layoutCssW;
    const hBuffer =
      !opts.displayMode || displayOverflowsHorizontally
        ? HORIZONTAL_BUFFER_PX
        : 0;
    const captureCssW = Math.max(
      layoutCssW,
      Math.ceil(visualRight - visualLeft + 2 * hBuffer),
    );
    const captureCssH = Math.max(
      layoutCssH,
      Math.ceil(visualBottom - visualTop + 2 * BUFFER_PX),
    );

    if (
      !Number.isFinite(captureCssW) ||
      !Number.isFinite(captureCssH) ||
      captureCssW <= 0 ||
      captureCssH <= 0
    ) {
      throw new Error("renderMathToPng: invalid capture geometry");
    }

    // ── Compute effective scale in one pass ──
    // The maximum safe scale ensures both bitmap axes fit the 4096px limit.
    const maxScaleByAxis = Math.min(
      MAX_MATH_RASTER_AXIS_PX / captureCssW,
      MAX_MATH_RASTER_AXIS_PX / captureCssH,
    );
    const effectiveScale = Math.min(requestedScale, maxScaleByAxis);
    // Allow effectiveScale < 1: a formula wider than 4096 CSS px at 1x must
    // still be captured in full, at a lower bitmap density.
    if (!Number.isFinite(effectiveScale) || effectiveScale <= 0) {
      throw new Error("renderMathToPng: invalid effective raster scale");
    }

    // Bitmap dimensions from the capture region and effective scale.
    const bitmapW = Math.max(1, Math.round(captureCssW * effectiveScale));
    const bitmapH = Math.max(1, Math.round(captureCssH * effectiveScale));

    // Verify the bitmap fits the axis limit.
    if (
      !Number.isFinite(bitmapW) ||
      !Number.isFinite(bitmapH) ||
      bitmapW <= 0 ||
      bitmapH <= 0 ||
      bitmapW > MAX_MATH_RASTER_AXIS_PX ||
      bitmapH > MAX_MATH_RASTER_AXIS_PX
    ) {
      throw new Error(
        `renderMathToPng: bitmap ${bitmapW}×${bitmapH} exceeds ${MAX_MATH_RASTER_AXIS_PX}px axis limit`,
      );
    }

    // ── Build expanded capture root ──
    // Keep this root under the host. html2canvas clones the document and
    // relies on that ancestry to retain the host's 16px font and layout
    // inheritance; appending it directly to body changes KaTeX's metrics.
    const captureRoot = document.createElement("div");
    captureRoot.style.position = "absolute";
    captureRoot.style.left = "0";
    captureRoot.style.top = "0";
    captureRoot.style.overflow = "visible";
    captureRoot.style.width = `${captureCssW}px`;
    captureRoot.style.height = `${captureCssH}px`;

    // Position the target inside the capture root. Relative positioning keeps
    // its normal block/inline layout, while an explicit border-box width
    // prevents the wider root from changing display-math centering.
    const originalTargetStyle = target.getAttribute("style");
    const originalParent = target.parentNode;
    const originalNextSibling = target.nextSibling;
    const targetOffsetX = Math.max(0, -visualLeft + hBuffer);
    const targetOffsetY = Math.max(0, -visualTop + BUFFER_PX);
    target.style.position = "relative";
    target.style.boxSizing = "border-box";
    target.style.width = `${Math.max(0, targetRect.width)}px`;
    target.style.left = `${targetOffsetX}px`;
    target.style.top = `${targetOffsetY}px`;

    let canvas: HTMLCanvasElement;
    try {
      captureRoot.appendChild(target);
      host.appendChild(captureRoot);

      // Cast to `any` because the bundled `@types/html2canvas` is from v0.5
      // and doesn't know about `scale` / `windowWidth` / `windowHeight`,
      // which are standard options in html2canvas 1.x.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas = await (html2canvas as any)(captureRoot, {
        backgroundColor: null,
        scale: effectiveScale,
        logging: false,
        width: captureCssW,
        height: captureCssH,
        windowWidth: captureCssW + 200,
        windowHeight: captureCssH + 200,
      });
    } finally {
      // Restore the exact inline style and original position even when
      // html2canvas rejects, then detach the temporary root.
      if (originalTargetStyle === null) {
        target.removeAttribute("style");
      } else {
        target.setAttribute("style", originalTargetStyle);
      }
      if (originalParent) {
        if (originalNextSibling?.parentNode === originalParent) {
          originalParent.insertBefore(target, originalNextSibling);
        } else {
          originalParent.appendChild(target);
        }
      }
      captureRoot.remove();
    }

    // Verify the canvas covers the expected region. html2canvas normally
    // floors the scaled dimensions, so accept that final subpixel rounding
    // while rejecting a canvas that would silently omit formula pixels.
    const minimumBitmapW = Math.max(
      1,
      Math.floor(captureCssW * effectiveScale),
    );
    const minimumBitmapH = Math.max(
      1,
      Math.floor(captureCssH * effectiveScale),
    );
    if (
      canvas.width < minimumBitmapW ||
      canvas.height < minimumBitmapH ||
      canvas.width > MAX_MATH_RASTER_AXIS_PX ||
      canvas.height > MAX_MATH_RASTER_AXIS_PX
    ) {
      throw new Error(
        `renderMathToPng: incomplete canvas ${canvas.width}x${canvas.height} for ${captureCssW}x${captureCssH} at scale ${effectiveScale}`,
      );
    }

    // A correctly sized but empty canvas is just as unusable as a truncated
    // one. Pixel access is best-effort because some webviews reject
    // getImageData; cropTransparentBounds will safely retain the full canvas
    // in that case.
    const captureHasContent = canvasHasContent(canvas);
    if (captureHasContent === false) {
      throw new Error("renderMathToPng: capture contains no rendered math");
    }

    // ── Vertical crop (strip safety buffer rows) ──
    const croppedV = cropTransparentBounds(
      canvas,
      BUFFER_PX,
      effectiveScale,
      "vertical",
    );

    // ── Symmetric horizontal crop (inline math only) ──
    // Display math keeps its full page-width PNG so the formula centers
    // properly and equation tags land at the right page-edge.  Horizontal
    // cropping would strip the centering whitespace, making narrow display
    // formulas tiny in the ODT output.
    const croppedCanvas = opts.displayMode
      ? croppedV
      : cropTransparentBounds(
          croppedV,
          HORIZONTAL_BUFFER_PX,
          effectiveScale,
          "horizontal",
        );

    // ── Compute logical dimensions from cropped bitmap ──
    const croppedCssW = croppedCanvas.width / effectiveScale;
    const croppedCssH = croppedCanvas.height / effectiveScale;

    const png = await canvasToPng(croppedCanvas);

    // Apply supersampling scale: when targetFontSize < HOST_FONT_SIZE,
    // shrink the reported dimensions so the ODT image displays smaller
    // while the bitmap retains the full sharpness of the host render.
    return {
      png,
      widthPx: croppedCssW * dimScale,
      heightPx: croppedCssH * dimScale,
    };
  } finally {
    // Never leave a failed render in the shared host. This also runs after
    // PNG encoding failures, not only after the html2canvas call.
    host.innerHTML = "";
  }
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
function ensureHost(layoutWidth: number): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let host = document.getElementById("katex-raster-host") as HTMLElement | null;
  if (host) {
    host.style.width = `${layoutWidth}px`;
    return host;
  }
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
  host.style.width = `${layoutWidth}px`;
  document.body.appendChild(host);
  return host;
}

/** Width of the off-screen KaTeX capture host, in CSS px. Matches the
 * typical ODT page-content area (A4 with 1 in margins → ~6.27 in) so a
 * display-math rasterization produces a PNG that, at 96 DPI, fits the
 * page-content column. The captured PNG width drives the ODT image
 * width (via `widthPx / 96`), so the host width directly determines
 * the on-page formula/tag layout. */
export const MATH_HOST_WIDTH_PX = 600;

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof canvas.toBlob === "function") {
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob && blob.size > 0) {
      return new Uint8Array(await blob.arrayBuffer());
    }
  }
  if (typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    if (comma >= 0) {
      const bytes = base64ToBytes(dataUrl.slice(comma + 1));
      if (bytes.length > 0) return bytes;
    }
  }
  throw new Error("renderMathToPng: PNG encoding returned no data");
}

/**
 * Return whether a canvas contains any pixels different from its sampled
 * background. A null result means pixel access is unavailable and callers
 * should not treat that as a rasterization failure.
 */
function canvasHasContent(canvas: HTMLCanvasElement): boolean | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }
  if (data.length < 4) return false;

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const bgA = data[3];
  const TOLERANCE = 4;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - bgR) > TOLERANCE ||
      Math.abs(data[i + 1] - bgG) > TOLERANCE ||
      Math.abs(data[i + 2] - bgB) > TOLERANCE ||
      Math.abs(data[i + 3] - bgA) > TOLERANCE
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Strip background-colored rows or columns from `canvas`, returning a
 * new canvas (or the input itself if no crop is possible).
 *
 * For **vertical** cropping (`direction = "vertical"`), equal amounts
 * are stripped from top and bottom to preserve the formula's natural
 * vertical centering. The `bufferCssPx` caps how many rows are removed
 * on each side.
 *
 * For **horizontal** cropping (`direction = "horizontal"`), symmetric
 * cropping removes equal columns from both sides to preserve the
 * formula's position relative to the image center. The helper finds
 * the first and last columns containing formula pixels, retains a
 * small `edgeGuardPx` on both sides, and removes the same number of
 * columns from each side. If one side has no removable empty space,
 * no unequal crop is performed.
 *
 * The background color is sampled from the top-left pixel rather than
 * assumed transparent — html2canvas fills unoccupied pixels with the
 * element's computed background, which in many webviews is white (the
 * document body's background), not transparent. Sampling the corner
 * pixel lets us crop correctly against whatever fill html2canvas used.
 *
 * Returns the original canvas unchanged when 2D context, pixel data,
 * or no-content rows/columns can't be obtained, so callers can safely
 * chain it.
 *
 * Exported for unit testing with synthetic pixel data — jsdom doesn't
 * implement `getContext('2d').getImageData`, so the production path
 * can't be exercised end-to-end in jsdom.
 *
 * @param canvas - The html2canvas output (scaled by `effectiveScale`).
 * @param bufferCssPx - The amount of padding added at capture time.
 * @param scale - The effective pixel-scale multiplier.
 * @param direction - "vertical" for row cropping, "horizontal" for
 *   symmetric column cropping.
 */
export function cropTransparentBounds(
  canvas: HTMLCanvasElement,
  bufferCssPx: number,
  scale: number,
  direction: "vertical" | "horizontal",
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return canvas;
  }

  // Sample the top-left pixel as the background reference.
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

  if (direction === "vertical") {
    return cropVertical(canvas, data, w, h, matchesBg, bufferCssPx, scale);
  }
  return cropHorizontal(canvas, data, w, h, matchesBg, bufferCssPx, scale);
}

function cropVertical(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  matchesBg: (i: number) => boolean,
  bufferCssPx: number,
  scale: number,
): HTMLCanvasElement {
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
  if (firstContent < 0 || lastContent < 0 || lastContent < firstContent) {
    return canvas;
  }

  const topEmpty = firstContent;
  const bottomEmpty = h - 1 - lastContent;
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

function cropHorizontal(
  canvas: HTMLCanvasElement,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  matchesBg: (i: number) => boolean,
  bufferCssPx: number,
  scale: number,
): HTMLCanvasElement {
  const colHasContent = (x: number): boolean => {
    for (let y = 0; y < h; y++) {
      if (!matchesBg((y * w + x) * 4)) return true;
    }
    return false;
  };

  let firstContent = -1;
  for (let x = 0; x < w; x++) {
    if (colHasContent(x)) {
      firstContent = x;
      break;
    }
  }
  let lastContent = -1;
  for (let x = w - 1; x >= 0; x--) {
    if (colHasContent(x)) {
      lastContent = x;
      break;
    }
  }
  if (firstContent < 0 || lastContent < 0 || lastContent < firstContent) {
    return canvas;
  }

  // Retain a small edge guard so near-background antialiased edges aren't
  // removed. At least 1 bitmap pixel.
  const edgeGuardPx = Math.max(1, Math.round(2 * scale));
  const bufferPx = Math.max(0, Math.round(bufferCssPx * scale));

  // How many columns can be removed from each side.
  const leftRemovable = Math.max(0, firstContent - edgeGuardPx);
  const rightRemovable = Math.max(0, w - 1 - lastContent - edgeGuardPx);

  // Cap at the buffer size.
  const leftCapped = Math.min(leftRemovable, bufferPx);
  const rightCapped = Math.min(rightRemovable, bufferPx);

  // Symmetric crop: remove the same amount from both sides.
  const symmetricCrop = Math.min(leftCapped, rightCapped);
  if (symmetricCrop <= 0) return canvas;

  const newW = w - 2 * symmetricCrop;
  if (newW <= 0) return canvas;

  const cropped = document.createElement("canvas");
  cropped.width = newW;
  cropped.height = h;
  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) return canvas;
  croppedCtx.drawImage(canvas, symmetricCrop, 0, newW, h, 0, 0, newW, h);
  return cropped;
}

/**
 * Crop transparent/background rows from the top and bottom of `canvas`.
 * This is the legacy vertical-only helper, kept for backward compatibility
 * with existing callers. New code should use `cropTransparentBounds`.
 *
 * @deprecated Use `cropTransparentBounds(canvas, buffer, scale, "vertical")`.
 */
export function cropTransparentRows(
  canvas: HTMLCanvasElement,
  bufferCssPx: number,
  scale: number,
): HTMLCanvasElement {
  return cropTransparentBounds(canvas, bufferCssPx, scale, "vertical");
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
