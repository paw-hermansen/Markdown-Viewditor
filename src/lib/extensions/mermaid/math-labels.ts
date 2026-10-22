/**
 * Rasterize KaTeX / MathML formulas inside Mermaid's `<foreignObject>`
 * labels to `<img>` elements.
 *
 * Why this pass exists — Mermaid renders `$$…$$` label math as KaTeX HTML
 * (the viewer config sets `forceLegacyMathML`), and KaTeX's output is built
 * from CSS-positioned boxes (`.katex`, `.katex-html`, `.base`, `.vlist`,
 * `.katex-mathml`). WebKitGTK (and older WKWebView) paint those wrong: a
 * positioned element inside a `<foreignObject>` paints at **untransformed**
 * coordinates — ignoring ancestor `<g transform>` and the SVG viewBox scale
 * — while layout accounts for them. Mermaid labels always sit under
 * transformed groups (the node and label `translate()`s), so every formula
 * paints up and left of where layout put it: the node box is right, the
 * formula hangs off its top-left corner. Measured on WebKitGTK 2.52: paint
 * diverges from `getBoundingClientRect()` by the negated cumulative group
 * translate; Blink and Gecko paint correctly. Minimal repro and
 * measurements in the change history of this file.
 *
 * No CSS workaround exists. Layerization (`translateZ(0)`,
 * `will-change`, `opacity`, `filter`, `isolation`, `backface-visibility`)
 * on the content or its parents does not move the paint, and `position:
 * static` overrides are not an option — KaTeX's super/subscripts position
 * through `top` offsets on relative boxes. Replaced content (`<img>`) is
 * plain static layout and paints exactly where layout says (verified
 * pixel-exact), so the viewer replaces each formula box with a rasterized
 * image of itself. The raster comes from html2canvas-pro
 * (`captureElementToPng`), which paints from computed styles — not the
 * engine's paint — and is therefore immune to the bug.
 *
 * The replacement is sized from the formula's **layout box** (`offsetWidth`
 * / `offsetHeight` are pure layout units: no page zoom, no SVG display
 * scaling), with the fractional `getBoundingClientRect()` size used when
 * the two agree (every modern engine; see the hybrid in {@link measureBox}).
 * The `<img>` therefore occupies exactly the box the live formula did, so
 * Mermaid's baked label geometry — measured before this pass runs — stays
 * correct.
 *
 * This runs on the *viewer* pipeline only (and on all platforms: rasterized
 * math is pixel-identical everywhere, and export/print consumers embed the
 * same SVGs). The export/print variants keep their own path: they convert
 * labels to SVG text + `<image>` via `fo-labels.ts`, which rasterizes the
 * same way and must not see pre-replaced images.
 *
 * Failures degrade per formula: when layout or capture is unavailable
 * (jsdom tests, missing html2canvas), the live markup is kept unchanged —
 * today's behavior, misplaced on WebKit but never missing.
 */

import { MERMAID_FONT_SIZE } from "./styles";
import { naturalSvgWidth } from "./fo-labels";
import { bytesToBase64 } from "$lib/utils/base64";

/** Rasterizes a laid-out element to a data URI plus its captured size. */
export type FormulaRasterizer = (
  el: HTMLElement,
) => Promise<{ dataUri: string; widthPx: number; heightPx: number } | null>;

/** Measures an element's layout box in CSS px. Returns null when unmeasurable. */
export type FormulaMeasurer = (
  el: HTMLElement,
) => { widthPx: number; heightPx: number } | null;

export interface MathLabelOptions {
  /**
   * Awaited before any measurement or capture (tests). Defaults to the
   * KaTeX web-font loader — formula geometry and the raster must agree on
   * font metrics, and the faces load lazily (see
   * `ensureMathFontsLoaded` in `$lib/export/math-render`).
   */
  loadFonts?: () => Promise<void>;
  /** Overrides the layout measurement (tests). */
  measure?: FormulaMeasurer;
  /** Overrides the rasterizer (tests). */
  rasterize?: FormulaRasterizer;
}

/**
 * Replace every formula box inside `svg`'s foreignObject labels with a
 * rasterized `<img>` of itself. Returns `svg` unchanged when there is no
 * label math, no DOM, or no formula can be measured and captured — this
 * never throws and never removes a formula without replacing it.
 */
export async function rasterizeMermaidLabelMath(
  svg: string,
  options: MathLabelOptions = {},
): Promise<string> {
  try {
    return await rasterizeLabelMathInner(svg, options);
  } catch {
    // A broken capture must never cost the diagram: keep the live markup.
    return svg;
  }
}

async function rasterizeLabelMathInner(
  svg: string,
  options: MathLabelOptions,
): Promise<string> {
  // Fast paths: label math is rare, and most diagrams must cost a regex.
  if (!/foreignObject/i.test(svg)) return svg;
  if (!/(class="[^"]*\bkatex\b|<math\b)/i.test(svg)) return svg;
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return svg;
  }

  const host = document.createElement("div");
  // Off-screen but *rendered*: html2canvas respects `visibility: hidden`
  // and would capture blank images (same pattern as fo-labels.ts).
  host.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none";
  // Natural SVG width, so the SVG renders at display scale 1: label
  // geometry is baked in SVG user units, and a self-scaled SVG makes
  // getBoundingClientRect report scaled sizes for label content (the
  // image would then not fill Mermaid's slot — see naturalSvgWidth).
  host.style.width = `${naturalSvgWidth(svg)}px`;
  host.innerHTML = svg;
  const svgEl = host.querySelector("svg");
  if (!svgEl) return svg;

  // Match the viewer's font context so formulas rasterize with the fonts
  // they render with on screen (KaTeX resolves em against this). Size is
  // deliberately NOT taken from here — see the pin below.
  try {
    const reference =
      document.getElementById("viewer-content") ?? document.body;
    if (reference) {
      const cs = getComputedStyle(reference);
      host.style.fontFamily = cs.fontFamily;
      host.style.color = cs.color;
    }
  } catch {
    // No getComputedStyle — the default rasterizer needs it, ours may not.
  }
  // The label font-size pin (MERMAID_STYLES sets it on
  // `foreignObject > div` in Mermaid's render hosts): formulas must
  // measure and capture at the size they occupy in Mermaid's baked label
  // slot, or the replacement image comes out smaller than the slot.
  //
  // Applied after the viewer font context on purpose — that context has no
  // font-size of its own (`#viewer-content` inherits from `html, body`), so
  // copying its size would replace this pin with the page's 14px, or with
  // the `medium` keyword where no viewer exists. Only family and colour
  // come from the viewer; the size is ours.
  host.style.fontSize = MERMAID_FONT_SIZE;

  document.body.appendChild(host);
  try {
    // Font readiness first: the measured box and the captured glyphs must
    // come from the same font state. (KaTeX's faces load lazily; a capture
    // that races the swap paints fallback glyphs in KaTeX's slots —
    // oversized, overlapping characters.)
    const loadFonts = options.loadFonts ?? awaitFormulaFonts;
    await loadFonts();

    const measure = options.measure ?? measureBox;
    const rasterize = options.rasterize ?? defaultRasterizer;
    let changed = false;

    for (const fo of Array.from(svgEl.querySelectorAll("foreignObject"))) {
      // Only top-level labels (a foreignObject inside a foreignObject is not
      // a Mermaid label).
      if (fo.querySelector("foreignObject")) continue;
      for (const el of outermostFormulaElements(fo)) {
        const box = measure(el as HTMLElement);
        if (!box || box.widthPx <= 0 || box.heightPx <= 0) continue;

        let raster: {
          dataUri: string;
          widthPx: number;
          heightPx: number;
        } | null = null;
        try {
          raster = await rasterize(el as HTMLElement);
        } catch {
          raster = null;
        }
        if (!raster) continue; // keep the live formula

        // Size the image from the raster's own geometry (which the capture
        // pins to its measured box), never from a separate measurement: a
        // bitmap displayed at a different size shows up stretched —
        // oversized, overlapping characters.
        const img = buildFormulaImage(
          el,
          raster.dataUri,
          raster.widthPx,
          raster.heightPx,
        );
        el.replaceWith(img);
        changed = true;
      }
    }

    return changed ? host.innerHTML : svg;
  } finally {
    host.remove();
  }
}

/**
 * Formula boxes to replace, outermost first: a `.katex-display` contains a
 * `.katex` which contains a `<math>`, and only the outermost box owns the
 * layout slot the replacement must fill.
 */
function outermostFormulaElements(fo: Element): Element[] {
  const candidates = Array.from(
    fo.querySelectorAll(".katex-display, .katex, math"),
  );
  return candidates.filter((el) => {
    let parent = el.parentElement;
    while (parent && parent !== fo) {
      if (candidates.includes(parent)) return false;
      parent = parent.parentElement;
    }
    return true;
  });
}

/**
 * The `<img>` that stands in for a formula. Sized to the formula's layout
 * box so Mermaid's baked label geometry is untouched. Block display for
 * block-level formulas — in Mermaid labels the formula is a flex item of
 * the per-line wrapper Mermaid builds around `$$…$$` output — and
 * inline-block otherwise, so a formula mid-sentence stays on its line.
 */
function buildFormulaImage(
  original: Element,
  dataUri: string,
  widthPx: number,
  heightPx: number,
): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("src", dataUri);
  img.setAttribute("alt", formulaAltText(original));
  const display = blockLike(original) ? "block" : "inline-block";
  img.setAttribute(
    "style",
    `display:${display};width:${round3(widthPx)}px;height:${round3(heightPx)}px;vertical-align:top`,
  );
  return img;
}

/**
 * The formula's spoken form: KaTeX's output carries the MathML copy in
 * `.katex-mathml` alongside the visible `.katex-html`, so plain
 * `textContent` reads every symbol twice. Drop the hidden copy first.
 */
function formulaAltText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(".katex-mathml").forEach((node) => node.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function blockLike(el: Element): boolean {
  // Unconditional: KaTeX pins `display: block` on the wrapper and Mermaid
  // always makes it a flex item (blockified) of its per-line wrapper div.
  // Computed style alone would miss it where KaTeX's stylesheet is absent
  // while measuring (jsdom) — the image must still fill the same slot.
  if (el.classList?.contains("katex-display")) return true;
  try {
    const display = getComputedStyle(el).display;
    return display === "block" || display.startsWith("block");
  } catch {
    return true;
  }
}

/**
 * Layout box in CSS px. Prefers the fractional `getBoundingClientRect()`
 * size when it agrees with `offsetWidth`/`offsetHeight` (pure layout units,
 * rounded to integers) — they only disagree when the engine scales
 * foreignObject rects by the page zoom (the class of bug fo-measure.ts
 * normalizes during Mermaid's own measurement), in which case the layout
 * units win: the `<img>` is sized in the same CSS-px space the label's
 * foreignObject content lays out in.
 */
function measureBox(el: HTMLElement): {
  widthPx: number;
  heightPx: number;
} | null {
  const layoutW = el.offsetWidth;
  const layoutH = el.offsetHeight;
  let rect: DOMRect | null = null;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    rect = null;
  }
  const rectW = rect && Number.isFinite(rect.width) ? rect.width : 0;
  const rectH = rect && Number.isFinite(rect.height) ? rect.height : 0;

  if (layoutW > 0 && layoutH > 0) {
    if (
      Math.abs(rectW - layoutW) <= 1 &&
      Math.abs(rectH - layoutH) <= 1 &&
      rectW > 0 &&
      rectH > 0
    ) {
      return { widthPx: rectW, heightPx: rectH };
    }
    return { widthPx: layoutW, heightPx: layoutH };
  }
  if (rectW > 0 && rectH > 0) return { widthPx: rectW, heightPx: rectH };
  return null;
}

/**
 * Default font gate: the shared KaTeX web-font loader. Lazy for the same
 * reason as the rasterizer below — math-free documents never touch the
 * capture module.
 */
async function awaitFormulaFonts(): Promise<void> {
  try {
    const { ensureMathFontsLoaded } = await import("$lib/export/math-render");
    await ensureMathFontsLoaded();
  } catch {
    // Fidelity only: proceed with whatever fonts are active.
  }
}

/**
 * Default rasterizer: the same html2canvas-pro capture the export label
 * conversion uses (fo-labels.ts), at 2x for sharpness. Lazy import keeps
 * html2canvas-pro out of documents without label math.
 */
const defaultRasterizer: FormulaRasterizer = async (el) => {
  const { captureElementToPng } = await import("$lib/export/math-render");
  const { png, widthPx, heightPx } = await captureElementToPng(el, 2);
  return {
    dataUri: `data:image/png;base64,${bytesToBase64(png)}`,
    widthPx,
    heightPx,
  };
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
