/**
 * The shared label-host harness for Mermaid label passes.
 *
 * Both label passes — `math-labels.ts` (viewer rasterization) and
 * `fo-labels.ts` (export/print conversion) — re-lay out Mermaid's label HTML
 * in an off-screen host to measure it (and, for KaTeX, capture it). The host
 * must see exactly the rules the viewer paints with, or the measurements
 * diverge from the layout Mermaid baked into its node geometry. That host
 * setup is subtle enough to have produced bugs twice (the font-size pin
 * being clobbered by the viewer font context — B2; the missing
 * `.katex-display` margin reset shifting exported formulas one label row),
 * so it lives here **once**, as the only code allowed to build a label host.
 *
 * The construction contract (see `LABEL_HOST_CLASS` in `styles.ts` for the
 * rules and the host list):
 *
 *   - The host carries `LABEL_HOST_CLASS`, so the `LABEL_HOST_RULES` pin
 *     (`font-size: MERMAID_FONT_SIZE` on `foreignObject > div` label roots,
 *     plus the `.katex-display { margin: 0 }` reset) applies to the label
 *     HTML. The rules are also injected as a scoped `<style>` for
 *     environments where MERMAID_STYLES has not been injected.
 *   - Off-screen but *rendered* (`position: fixed` far left — never
 *     `visibility: hidden`): html2canvas respects visibility and would
 *     capture blank images.
 *   - Width = `naturalSvgWidth(svg)`, so the SVG renders at display scale 1:
 *     label geometry is baked in SVG user units, and a self-scaled SVG makes
 *     `getBoundingClientRect` report scaled sizes for label content.
 *   - The viewer font context supplies **family and colour only**; the size
 *     is the pin, applied *after* the context copy. Copying the viewer's
 *     computed `font-size` would replace the pin with the page's 14px (or
 *     the `medium` keyword where no viewer exists) — the B2 regression. The
 *     pin exists twice on purpose (inline on the host, CSS on the label
 *     roots): either alone defeats a context copy.
 *   - The font gate (`ensureMathFontsLoaded`) runs before any measurement or
 *     capture: KaTeX's web faces load lazily, and measurements taken before
 *     the swap use fallback metrics while captures paint fallback glyphs in
 *     KaTeX's slots.
 */

import {
  LABEL_HOST_CLASS,
  LABEL_HOST_RULES,
  MERMAID_FONT_SIZE,
} from "./styles";
import { bytesToBase64 } from "$lib/utils/base64";

/** Rasterizes an already-laid-out HTML element (e.g. KaTeX) to a PNG. */
export type LabelRasterizer = (
  el: HTMLElement,
) => Promise<{ dataUri: string; widthPx: number; heightPx: number } | null>;

export interface LabelHostContext {
  /**
   * The shared font gate. Already awaited before `body` runs; exposed for
   * bodies that re-measure after their own async work.
   */
  loadFonts: () => Promise<void>;
}

export interface LabelHostOptions {
  /** Overrides the font gate (tests). */
  loadFonts?: () => Promise<void>;
}

/**
 * Run `body` against `svg`'s label markup laid out in a shared label host.
 * `body` reports whether it changed the markup; the changed host markup (or
 * the untouched `svg`) is returned. The host and its injected rules are
 * always torn down — including when `body` throws (the error propagates).
 */
export async function withLabelHost(
  svg: string,
  body: (svgEl: SVGSVGElement, ctx: LabelHostContext) => Promise<boolean>,
  opts: LabelHostOptions = {},
): Promise<string> {
  const host = document.createElement("div");
  host.className = LABEL_HOST_CLASS;
  // Off-screen but *rendered* (see the module docstring).
  host.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none";
  host.style.width = `${naturalSvgWidth(svg)}px`;
  host.innerHTML = svg;
  const svgEl = host.querySelector("svg");
  if (!svgEl) return svg;

  // Match the viewer's font context so labels measure and capture with the
  // fonts they render with on screen (KaTeX resolves em against this). Size
  // is deliberately NOT taken from here — see the pin below.
  try {
    const reference =
      document.getElementById("viewer-content") ?? document.body;
    if (reference) {
      const cs = getComputedStyle(reference);
      host.style.fontFamily = cs.fontFamily;
      host.style.color = cs.color;
    }
  } catch {
    // No getComputedStyle — the fallback paths do not need it.
  }
  // The label font-size pin (LABEL_HOST_RULES sets it on
  // `foreignObject > div` label roots too): formulas must measure and
  // capture at the size they occupy in Mermaid's baked label slot, or the
  // replacement comes out smaller than the slot.
  //
  // Applied after the viewer font context on purpose — that context has no
  // font-size of its own (`#viewer-content` inherits from `html, body`), so
  // copying its size would replace this pin with the page's 14px, or with
  // the `medium` keyword where no viewer exists. Only family and colour
  // come from the viewer; the size is ours.
  host.style.fontSize = MERMAID_FONT_SIZE;

  document.body.appendChild(host);
  // Belt and braces alongside MERMAID_STYLES: inject the label-host rules
  // scoped to this host's class so measurement sees the pinned layout even
  // where the extension stylesheet has not been injected. The rules are
  // class-scoped (the live document has no such host outside this call), and
  // the element is removed with the host below.
  const hostStyle = document.createElement("style");
  hostStyle.textContent = LABEL_HOST_RULES;
  document.head.appendChild(hostStyle);
  try {
    // Font readiness first: the measured boxes and the captured glyphs must
    // come from the same font state.
    const loadFonts = opts.loadFonts ?? awaitFormulaFonts;
    await loadFonts();
    const changed = await body(svgEl, { loadFonts });
    return changed ? host.innerHTML : svg;
  } finally {
    hostStyle.remove();
    host.remove();
  }
}

/**
 * Default font gate: the shared KaTeX web-font loader. Lazy for the same
 * reason as the rasterizer below — documents without label math never touch
 * the capture module.
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
 * Default rasterizer: the same html2canvas-pro capture the export math
 * pipeline uses (`export/math-render.ts`), at 2x for sharpness. Lazy import
 * keeps html2canvas-pro out of documents without label math/KaTeX.
 */
export const defaultRasterizer: LabelRasterizer = async (el) => {
  const { captureElementToPng } = await import("$lib/export/math-render");
  const { png, widthPx, heightPx } = await captureElementToPng(el, 2);
  return {
    dataUri: `data:image/png;base64,${bytesToBase64(png)}`,
    widthPx,
    heightPx,
  };
};

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The width the SVG would lay out at in the viewer: its `max-width` style
 * if present (Mermaid sets one), else the viewBox width. The hidden host is
 * given this width so label wrapping matches the viewer — and so the SVG
 * renders 1:1 (display scale 1): Mermaid's label geometry is baked in SVG
 * user units, and a self-scaled SVG (its `width="100%"`) makes
 * `getBoundingClientRect` report scaled coordinates for label content,
 * which then measures and rasterizes formulas at the wrong size.
 */
export function naturalSvgWidth(svg: string): number {
  const opening = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const maxWidth = opening.match(/max-width\s*:\s*([\d.]+)/i);
  if (maxWidth && Number.isFinite(parseFloat(maxWidth[1]))) {
    return parseFloat(maxWidth[1]);
  }
  const viewBox = opening.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBox) {
    const width = parseFloat(viewBox[1].trim().split(/[\s,]+/)[2]);
    if (Number.isFinite(width) && width > 0) return width;
  }
  return 2000;
}
