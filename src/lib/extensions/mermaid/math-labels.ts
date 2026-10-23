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

import {
  defaultRasterizer,
  round3,
  withLabelHost,
  type LabelRasterizer,
} from "./label-host";

/** Rasterizes a laid-out element to a data URI plus its captured size. */
export type FormulaRasterizer = LabelRasterizer;

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

  return withLabelHost(
    svg,
    async (svgEl) => {
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

      return changed;
    },
    { loadFonts: options.loadFonts },
  );
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
