import { measureMathVisualBounds } from "./math-render";

/**
 * Scale wide display math to fit the printable width at export time.
 *
 * The on-screen Viewer keeps wide display equations inside the column with
 * `.katex-block { overflow-x: auto }` (see markdown.css) — the user scrolls.
 * Print media cannot scroll: the overflow is clipped at the page edge, so
 * wide formulas were cut off in PDF output. The print clone therefore scales
 * each overflowing display formula down to the printable width.
 *
 * The scaling mechanism is KaTeX's `--katex-font-scale` CSS variable (the
 * same one the `fontsize` directive uses): KaTeX's HTML output is em-based
 * throughout, so shrinking `font-size` scales a formula *uniformly* — width,
 * height, glyphs, stretchy delimiters and equation tags all shrink together,
 * and the block's layout height shrinks with it (no `transform: scale()`
 * height-compensation needed). The math stays real vector text in the PDF.
 *
 * Measurement is zoom-safe: both the formula's ink extent
 * (`measureMathVisualBounds`) and the available width (the `.katex` element's
 * border box) are read through `getBoundingClientRect()`, i.e. in the same
 * visual coordinate space, so the ratio is unaffected by the `zoom` applied
 * to the print clone. The border box is the right bound even for `fleqn`
 * (whose `padding-left: 2em` is em-based and therefore scales away with the
 * formula): the clip edge of the `.katex-block` scroll container coincides
 * with the `.katex` border box, so "ink extent measured from the box's left
 * edge fits inside the box" is exactly the no-clipping condition.
 */

/** Default safety margin (visual px) subtracted from the available width so
 *  sub-pixel rounding cannot leave a residual overflow that print media
 *  would clip. */
const FIT_SAFETY_PX = 1;

/** How the formula width and the printable width are measured. Injectable
 *  for tests: jsdom performs no layout, so unit tests stub the measure and
 *  exercise the factor math and the style application. */
export interface MathFitMeasure {
  /** Ink width of the formula, including any overflow past its layout box,
   *  in visual px. */
  naturalWidth(katexEl: HTMLElement): number;
  /** Width available to the formula, in the same visual px space. */
  availableWidth(katexEl: HTMLElement): number;
}

/**
 * Compute the uniform scale factor that makes `naturalWidthPx` fit into
 * `availableWidthPx`, leaving `safetyPx` of slack. Returns 1 when the
 * formula already fits, and 1 for non-finite or non-positive inputs (an
 * unmeasurable formula is left untouched rather than scaled blindly).
 */
export function computeMathFitFactor(
  naturalWidthPx: number,
  availableWidthPx: number,
  safetyPx: number = FIT_SAFETY_PX,
): number {
  if (
    !Number.isFinite(naturalWidthPx) ||
    naturalWidthPx <= 0 ||
    !Number.isFinite(availableWidthPx) ||
    availableWidthPx <= 0
  ) {
    return 1;
  }
  const target = availableWidthPx - Math.max(0, safetyPx);
  if (target <= 0) return 1;
  return Math.min(1, target / naturalWidthPx);
}

/**
 * The effective `--katex-font-scale` on an element: the inline value set by
 * the `fontsize` directive (which sets it on the `.katex-block` wrapper) or
 * by a previous fit pass, resolved up the ancestor chain the same way custom
 * properties inherit. Falls back to the computed value (covers declarations
 * from stylesheets) and finally to 1. Custom properties are token streams,
 * so zoom quirks cannot skew the parsed number.
 */
function currentFontScale(katexEl: HTMLElement): number {
  let el: HTMLElement | null = katexEl;
  while (el) {
    const raw = el.style.getPropertyValue("--katex-font-scale");
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    el = el.parentElement;
  }
  if (typeof window !== "undefined") {
    const raw = window
      .getComputedStyle(katexEl)
      .getPropertyValue("--katex-font-scale");
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

/**
 * Multiply the element's `--katex-font-scale` by `factor`, preserving any
 * `fontsize` directive value already in effect (e.g. `fontsize=2.0` on a
 * 2×-too-wide formula becomes 1.0 — big print, exactly filling the page).
 */
function applyFontScale(katexEl: HTMLElement, factor: number): void {
  const merged = currentFontScale(katexEl) * factor;
  // Round to keep the inline style tidy; 4 decimals is far below any
  // visible or layout-relevant precision.
  katexEl.style.setProperty("--katex-font-scale", String(round4(merged)));
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Production measurement: both quantities in visual (zoomed) px. */
const rectMeasure: MathFitMeasure = {
  naturalWidth(katexEl) {
    const bounds = measureMathVisualBounds(katexEl);
    return bounds.right - bounds.left;
  },
  availableWidth(katexEl) {
    return katexEl.getBoundingClientRect().width;
  },
};

/**
 * Fit every *display* formula under `root` (the print clone) to the
 * printable width. Inline math is intentionally untouched: it cannot scroll
 * in the Viewer either, and shrinking mid-sentence formulas would change
 * the text flow the fidelity contract preserves.
 *
 * Only `.katex-display > .katex` elements are considered — KaTeX wraps
 * display math (from `$$…$$`, `\[…\]`, bare `\begin{…}` and ```math fences)
 * in a `.katex-display` block, while inline `$…$` math gets a bare `.katex`.
 *
 * @returns The fit factor applied to each display formula (1 = untouched),
 *   in document order. Mostly for tests and diagnostics.
 */
export function scaleWideMathForPrint(
  root: HTMLElement,
  measure: MathFitMeasure = rectMeasure,
  safetyPx: number = FIT_SAFETY_PX,
): number[] {
  const factors: number[] = [];
  const displayFormulas = root.querySelectorAll<HTMLElement>(
    ".katex-display > .katex",
  );
  for (const katexEl of displayFormulas) {
    const natural = measure.naturalWidth(katexEl);
    const available = measure.availableWidth(katexEl);
    const factor = computeMathFitFactor(natural, available, safetyPx);
    factors.push(factor);
    if (factor < 1) {
      applyFontScale(katexEl, factor);
    }
  }
  return factors;
}
