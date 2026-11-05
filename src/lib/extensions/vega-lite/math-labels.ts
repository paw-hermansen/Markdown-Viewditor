/**
 * KaTeX math in Vega-Lite chart labels (plan §8): replace `$…$` / `$$…$$`
 * inside SVG `<text>` labels with rasterized `<image>` PNGs of the formula.
 *
 * Vega has no math typesetting, and this pass exists instead of a
 * `<foreignObject>` approach on purpose: ODT's svgio cannot paint
 * foreignObject content and WebKit's CSS-zoom handling mis-scales it (the
 * whole mermaid fo-labels/print contract). PNG-in-SVG is what Mermaid's
 * label math already does (`rasterizeMermaidLabelMath` /
 * `pinLabelMathPaint`) and it survives the viewer, the print clone, and
 * vector ODT/DOCX embeds unchanged — the images are `data:` URIs, so no
 * export-side handling is needed at all.
 *
 * The raster comes from the shared `renderMathToPng` (html2canvas-pro
 * capture with supersampling + `targetFontSize` scaling), colored with the
 * chart's theme foreground so math matches its labels on dark themes.
 *
 * Layout: vega positions text with `transform="translate(x,y)"` and the
 * baseline sits at local y=0. The replacement `<g>` reuses the text
 * element's exact `transform`, so rotated labels (axis titles use
 * composite `translate(…) rotate(…) translate(…)` chains) need no special
 * handling. Runs are placed left-to-right from the text-anchor-adjusted
 * origin; math images are centered on the text's optical center
 * ({@link OPTICAL_CENTER_RATIO}), text runs stay real `<text>` tspans on
 * the original baseline. The original label is kept hidden in place for
 * copy/paste and accessibility history.
 *
 * Contracts (pinned by tests):
 *   - Whole-label math and mixed labels (`$x$ (samples)`) both work.
 *   - A price-like `$5 and $10` is never treated as math (the katex
 *     dollar-rule convention).
 *   - Multi-tspan (multi-line) labels are left untouched.
 *   - This pass NEVER throws and never removes a label it could not
 *     replace: any measurement or raster failure keeps the original text.
 */

import {
  ensureMathFontsLoaded,
  renderMathToPng,
  type RenderedMathPng,
} from "../../export/math-render";
import { bytesToDataUri } from "$lib/utils/base64";

/**
 * Where a math image's vertical center sits above the text baseline, as a
 * fraction of the font size — the optical center of ordinary text (mid
 * x-height plus half the typical formula overshoot). One heuristic
 * constant; pinned by the placement tests.
 */
export const OPTICAL_CENTER_RATIO = 0.35;

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^\s$](?:[^$]*?[^\s$])?)\$(?!\d)/g;

export interface VegaMathLabelOptions {
  /** Theme foreground for the math glyphs (charts must match their labels). */
  color?: string;
  /** Bitmap supersampling (sharpness only). Default 2. */
  resolution?: number;
  /** Test hook: font readiness (default `ensureMathFontsLoaded`). */
  loadFonts?: () => Promise<void>;
  /** Test hook: the formula rasterizer (default `renderMathToPng`). */
  renderMath?: (opts: {
    tex: string;
    displayMode: boolean;
    resolution: number;
    targetFontSize: number;
    trimToInk: boolean;
    color?: string;
  }) => Promise<RenderedMathPng>;
  /** Test hook: plain-text width measurement (default: canvas measureText). */
  measureTextWidth?: (font: string, text: string) => number | null;
}

interface Run {
  kind: "text" | "math";
  value: string;
  display: boolean;
}

/**
 * Split a label into text/math runs. Returns null when the label contains
 * no math. `$$…$$` wins over `$…$`; price-like `$5 and $10` is rejected by
 * the MATH_RE guards (opening `$` needs a non-space, non-empty body,
 * closing `$` must not be followed by a digit).
 */
export function tokenizeMathLabel(label: string): Run[] | null {
  const runs: Run[] = [];
  let last = 0;
  MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MATH_RE.exec(label)) !== null) {
    if (match.index > last) {
      runs.push({
        kind: "text",
        value: label.slice(last, match.index),
        display: false,
      });
    }
    const display = match[1] !== undefined;
    runs.push({
      kind: "math",
      value: display ? match[1] : match[2],
      display,
    });
    last = match.index + match[0].length;
  }
  if (runs.length === 0) return null;
  if (last < label.length) {
    runs.push({ kind: "text", value: label.slice(last), display: false });
  }
  return runs.some((r) => r.kind === "math") ? runs : null;
}

function measureTextWidth(font: string, text: string): number | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext?.("2d");
    if (!ctx || typeof ctx.measureText !== "function") return null;
    ctx.font = font;
    const width = ctx.measureText(text).width;
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    return null;
  }
}

/**
 * Replace math-bearing labels in `svg` with rasterized formula images.
 * Returns `svg` unchanged when there is no label math, no DOM, or nothing
 * could be measured and captured — this never throws and never removes a
 * label without replacing it.
 */
export async function rasterizeVegaLabelMath(
  svg: string,
  options: VegaMathLabelOptions = {},
): Promise<string> {
  try {
    return await rasterizeLabelMathInner(svg, options);
  } catch {
    return svg;
  }
}

async function rasterizeLabelMathInner(
  svg: string,
  options: VegaMathLabelOptions,
): Promise<string> {
  // Fast path: label math is rare and most charts must cost one indexOf.
  if (!svg.includes("$")) return svg;
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return svg;
  }
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return svg;

  const renderMath = options.renderMath ?? renderMathToPng;
  const loadFonts = options.loadFonts ?? ensureMathFontsLoaded;
  const measure = options.measureTextWidth ?? measureTextWidth;
  const resolution = options.resolution ?? 2;

  const labels = Array.from(root.querySelectorAll("text")).filter(
    (t) => t.children.length === 0 && (t.textContent ?? "").includes("$"),
  );
  if (labels.length === 0) return svg;

  let fontsReady = false;
  let changed = false;

  for (const text of labels) {
    try {
      const label = (text.textContent ?? "").trim();
      const runs = tokenizeMathLabel(label);
      if (!runs) continue;

      const fontSizePx = parseFontSize(text.getAttribute("font-size"));
      const anchor = text.getAttribute("text-anchor") ?? "start";
      const font = fontString(text, fontSizePx);

      // Measure plain runs first — cheap and side-effect free, so a label we
      // cannot lay out never costs a rasterization. Any failure keeps this
      // label untouched.
      const widths: number[] = [];
      let measurable = true;
      for (const run of runs) {
        if (run.kind === "text") {
          const width = measure(font, run.value);
          if (width === null) {
            measurable = false;
            break;
          }
          widths.push(width);
        } else {
          widths.push(0); // filled after rasterization
        }
      }
      if (!measurable) continue;

      // Rasterize the math runs only once the layout is known to work.
      const rasters: Array<RenderedMathPng & { dataUri: string }> = [];
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        if (run.kind !== "math") continue;
        if (!fontsReady) {
          await loadFonts();
          fontsReady = true;
        }
        const raster = await renderMath({
          tex: run.value,
          displayMode: run.display,
          resolution,
          targetFontSize: fontSizePx,
          trimToInk: true,
          color: options.color,
        });
        widths[i] = raster.widthPx;
        rasters.push({
          ...raster,
          dataUri: bytesToDataUri(raster.png, "image/png"),
        });
      }
      if (rasters.length === 0) continue;

      const total = widths.reduce((a, b) => a + b, 0);
      const originX =
        anchor === "middle" ? -total / 2 : anchor === "end" ? -total : 0;

      const g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      const transform = text.getAttribute("transform");
      if (transform) g.setAttribute("transform", transform);
      g.setAttribute("role", "img");
      const spoken = text.getAttribute("aria-label") ?? label;
      g.setAttribute("aria-label", spoken);

      let x = originX;
      let rasterIndex = 0;
      for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        if (run.kind === "math") {
          const raster = rasters[rasterIndex++];
          const image = doc.createElementNS(
            "http://www.w3.org/2000/svg",
            "image",
          );
          image.setAttribute("x", String(round3(x)));
          image.setAttribute(
            "y",
            String(
              round3(-OPTICAL_CENTER_RATIO * fontSizePx - raster.heightPx / 2),
            ),
          );
          image.setAttribute("width", String(round3(raster.widthPx)));
          image.setAttribute("height", String(round3(raster.heightPx)));
          image.setAttribute("href", raster.dataUri);
          image.setAttribute("xlink:href", raster.dataUri);
          g.appendChild(image);
        } else {
          let t = g.querySelector("text.run-host");
          if (!t) {
            t = doc.createElementNS("http://www.w3.org/2000/svg", "text");
            t.setAttribute("class", "run-host");
            copyAttr(text, t, "font-family");
            copyAttr(text, t, "font-size");
            copyAttr(text, t, "font-weight");
            copyAttr(text, t, "font-style");
            copyAttr(text, t, "fill");
            g.appendChild(t);
          }
          const tspan = doc.createElementNS(
            "http://www.w3.org/2000/svg",
            "tspan",
          );
          tspan.setAttribute("x", String(round3(x)));
          tspan.setAttribute("y", "0");
          tspan.textContent = run.value;
          t.appendChild(tspan);
        }
        x += widths[i];
      }

      // Keep the original label hidden in place (copy/paste, history) and
      // put the replacement beside it — the original owns its transform.
      text.setAttribute("visibility", "hidden");
      text.setAttribute("aria-hidden", "true");
      text.parentNode?.insertBefore(g, text);
      changed = true;
    } catch {
      // Keep this label as-is; a broken formula must never cost the chart.
    }
  }

  if (!changed) return svg;
  return new XMLSerializer().serializeToString(root);
}

function parseFontSize(value: string | null): number {
  const parsed = parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 11;
}

/**
 * Canvas font shorthand from the text element's presentation attributes.
 * Vega writes `font-family="depends on user agent"` when no font is
 * configured — invalid as a canvas font, mapped to the generic default.
 */
function fontString(text: Element, fontSizePx: number): string {
  const style = text.getAttribute("font-style");
  const weight = text.getAttribute("font-weight");
  let family = text.getAttribute("font-family") ?? "sans-serif";
  if (!family || /depends on user agent/i.test(family)) family = "sans-serif";
  return `${style ? `${style} ` : ""}${weight ? `${weight} ` : ""}${fontSizePx}px ${family}`;
}

function copyAttr(from: Element, to: Element, name: string): void {
  const value = from.getAttribute(name);
  if (value !== null) to.setAttribute(name, value);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
