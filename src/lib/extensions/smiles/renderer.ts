import { escapeHtml } from "$lib/utils/escape";
import { mergeOptions } from "../directive-merge";
import { SMILES_OPTIONS_SCHEMA } from "./schema";
import { normalizeSmilesTextPlacement } from "./text-offsets";

/**
 * SMILES structure renderer (smiles-drawer SvgDrawer).
 *
 * Size/box contract (pinned by tests — see __tests__/renderer.test.ts and
 * .opencode/plans/smiles-extension.md §4):
 *
 *   1. Every structure is drawn with the library's `scale: 0`, then the box
 *      is fitted to the drawing's real painted ink: the union of the
 *      library's geometric bounds (the `<mask>` region — the pre-square
 *      bounds) and the measured `getBBox()` ink, plus a safety pad (see
 *      applyScale/measureInk). The library's text-bounds estimates are
 *      font- and engine-dependent and clip labels; measuring the painted
 *      ink is exact everywhere. The box hugs the drawing at every scale —
 *      no square filler whitespace on elongated molecules — while staying
 *      scale-proportional, so `align` and inter-block spacing behave
 *      identically at any multiplier. The library's own `scale>0` path
 *      (inline style width) is deliberately unused: it fights the
 *      responsive CSS and the export dimension sniffer.
 *   2. The user-facing `scale` multiplier is applied by overriding the SVG's
 *      `width`/`height` attributes (viewBox untouched) — a pure vector
 *      resize, lossless in HTML/PDF/ODT exports.
 *   3. Width fitting is the `fitToWidth` two-mode CSS (styles.ts): scale
 *      down to the column, or keep the scaled size with a horizontal
 *      scrollbar. Print clamps both modes to the page width.
 *
 * Unlike Mermaid, rendering is fully synchronous: smiles-drawer's callback
 * parse API wraps a synchronous parser, so no pre-render cache is needed.
 * `ensureSmilesLoaded()` (called from `preRenderBlocks` and the ODT exporter)
 * only exists to lazy-load the smiles-drawer chunk.
 *
 * Label placement is normalized after drawing (see text-offsets.ts):
 * smiles-drawer positions letters with em offsets and CSS-px translate
 * groups, both of which drift under WebKit page zoom. The normalizer folds
 * them into absolute user units so labels sit correctly at every zoom.
 */

/** The smiles-drawer module namespace (`import SmilesDrawer from "smiles-drawer"`). */
type SmilesDrawerModule = typeof import("smiles-drawer");

/** Drawer options (constructor) as merged by smiles-drawer with its defaults. */
interface SmilesDrawerOpts {
  fontFamily: string;
  fontSizeLarge: number;
  fontSizeSmall: number;
}

export interface SmilesRenderOptions {
  align: "left" | "center" | "right";
  scale: number;
  fitToWidth: boolean;
  theme: string;
  atomVisualization: string;
  showCarbons: string;
  explicitHydrogens: boolean;
  compactDrawing: boolean;
  isomeric: boolean;
}

let modulePromise: Promise<SmilesDrawerModule> | null = null;
let module: SmilesDrawerModule | null = null;

/**
 * Lazy-load the smiles-drawer chunk (code-split by Vite). Idempotent; a
 * failed load is not cached so a later render can retry. Callers that need
 * synchronous drawing (renderFence) get the module via `preRenderBlocks`;
 * on failure each fence degrades to an error block.
 */
export function ensureSmilesLoaded(): Promise<SmilesDrawerModule> {
  if (!modulePromise) {
    modulePromise = import("smiles-drawer").then(
      (m) => {
        module = m;
        return m;
      },
      (err) => {
        modulePromise = null;
        throw err;
      },
    );
  }
  return modulePromise;
}

/**
 * Merge schema defaults under the provided values and return a typed options
 * object. Values are coerced/clamped by the shared fence-options merge — the
 * same path fence attributes and directives take.
 */
export function resolveSmilesOptions(
  opts: Record<string, unknown>,
): SmilesRenderOptions {
  const merged = mergeOptions(SMILES_OPTIONS_SCHEMA, {}, opts);
  const align =
    merged.align === "left" || merged.align === "right"
      ? merged.align
      : "center";
  return {
    align,
    scale: typeof merged.scale === "number" ? merged.scale : 1,
    fitToWidth: merged.fitToWidth !== false,
    theme: typeof merged.theme === "string" ? merged.theme : "auto",
    atomVisualization:
      typeof merged.atomVisualization === "string"
        ? merged.atomVisualization
        : "default",
    showCarbons:
      typeof merged.showCarbons === "string" ? merged.showCarbons : "default",
    explicitHydrogens: merged.explicitHydrogens !== false,
    compactDrawing: merged.compactDrawing !== false,
    isomeric: merged.isomeric !== false,
  };
}

/** `theme=auto` follows the app theme; anything else is a library theme name. */
function resolveThemeName(theme: string): string {
  if (theme !== "auto") return theme;
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** Safety pad around the ink-fitted box (stroke overshoot, antialiasing). */
const INK_PAD = 2;

/** Text pad when ink measurement is unavailable (jsdom) — 1x the label size. */
const FALLBACK_TEXT_PAD = 11 * (96 / 72);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The drawing's geometric bounds: the library's pre-square min/max, which
 * survive verbatim in the `<mask>` region (`constructSvg` writes its
 * `x`/`y`/`width`/`height` from the same min/max the `scale: 0` squaring
 * uses). Includes the label-anchor padding but only *estimated* label ink.
 */
function maskBounds(svg: SVGSVGElement): Box | null {
  const mask = svg.querySelector("mask");
  if (!mask) return null;
  const x = parseFloat(mask.getAttribute("x") ?? "");
  const y = parseFloat(mask.getAttribute("y") ?? "");
  const w = parseFloat(mask.getAttribute("width") ?? "");
  const h = parseFloat(mask.getAttribute("height") ?? "");
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) {
    return null;
  }
  return { x, y, w, h };
}

/**
 * Real painted ink bounds via `getBBox()` — the engine measuring the glyphs
 * it actually laid out (the fo-measure.ts lesson: measurement and paint
 * must agree). smiles-drawer only *estimates* text extents (`write()`:
 * anchor ± measured height), and real glyph ink extends past those
 * estimates — subscripts (CH₃), the 0.36em baseline shift,
 * `dominant-baseline` placement — by a font- and engine-dependent amount
 * (Arial vs its Linux fontconfig substitutes; Blink vs WebKit baseline
 * resolution). That variance clipped labels differently on Windows and
 * Linux; fitting to measured ink is exact on every font and engine.
 *
 * Measured through a hidden host: engines refuse (or mis-measure) detached
 * and `display: none` subtrees — same pattern as
 * normalizeSvgTextOffsets. Returns null when measurement is unavailable
 * (jsdom) or degenerate; the caller then falls back to the geometric box
 * plus a text pad.
 */
function measureInk(svg: SVGSVGElement): Box | null {
  if (typeof document === "undefined") return null;
  if (typeof svg.getBBox !== "function") return null;
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const b = svg.getBBox();
    if (!b || !(b.width > 0) || !(b.height > 0)) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Apply the user-facing `scale` multiplier and pin the box contract: the
 * viewBox is fitted to the drawing's real ink and the SVG's
 * `width`/`height` attributes become box × scale.
 *
 * The box = union(library geometric bounds, measured ink bounds) + a
 * safety pad. The library's squared `scale: 0` box is deliberately unused:
 * its square filler was huge whitespace on elongated molecules, and its
 * bounds — while scale-proportional — underestimate label ink (see
 * measureInk). The fitted box hugs the drawing at every scale and cannot
 * clip labels on any font or engine. Scaling stays a pure vector resize
 * (attributes only, viewBox untouched).
 */
function applyScale(svg: SVGSVGElement, scale: number): void {
  let bounds: Box | null = maskBounds(svg);
  if (!bounds) {
    // Defensive fallback (mask shape changed upstream): the library's
    // squared box rather than failing the render.
    const vb = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/);
    const w = parseFloat(vb[2] ?? "");
    const h = parseFloat(vb[3] ?? "");
    const side = Math.max(w, h);
    if (!Number.isFinite(side) || side <= 0) return;
    bounds = {
      x: parseFloat(vb[0] ?? "0"),
      y: parseFloat(vb[1] ?? "0"),
      w: side,
      h: side,
    };
  }

  const ink = measureInk(svg);
  if (ink) bounds = unionBox(bounds, ink);
  const pad = ink ? INK_PAD : FALLBACK_TEXT_PAD;
  bounds = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    w: bounds.w + 2 * pad,
    h: bounds.h + 2 * pad,
  };

  svg.setAttribute(
    "viewBox",
    `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`,
  );
  svg.setAttribute("width", String(Math.max(1, Math.round(bounds.w * scale))));
  svg.setAttribute("height", String(Math.max(1, Math.round(bounds.h * scale))));
}

/**
 * Bake the label font onto the text elements as presentation attributes.
 * smiles-drawer paints shapes via presentation attributes (LibreOffice-safe)
 * but puts the label font in an embedded `<style>` block
 * (`.element{font:…}`/`.sub{font:…}`), and SVG consumers with partial CSS
 * support (LibreOffice svgio, usvg) can drop those rules, silently degrading
 * every label to the fallback font. Presentation attributes sit lowest in
 * the cascade, so where the `<style>` block IS honored the same value wins —
 * baking is strictly safe.
 */
function bakeSvgFonts(svg: SVGSVGElement, opts: SmilesDrawerOpts): void {
  for (const el of svg.querySelectorAll("text.element")) {
    el.setAttribute("font-family", opts.fontFamily);
    el.setAttribute("font-size", `${opts.fontSizeLarge}pt`);
  }
  for (const el of svg.querySelectorAll("text.sub")) {
    el.setAttribute("font-family", opts.fontFamily);
    el.setAttribute("font-size", `${opts.fontSizeSmall}pt`);
  }
}

/**
 * Render one SMILES string to a standalone `<svg>` string. The returned SVG
 * carries a tight-box viewBox + explicit `width`/`height` attributes (the size
 * contract above), so export dimension sniffing works directly on it.
 *
 * Throws on unparseable SMILES (or when the chunk is not loaded yet) —
 * callers wanting a graceful HTML fallback use {@link renderSmilesFence}.
 */
export function renderSmilesSvg(
  content: string,
  options: SmilesRenderOptions,
): string {
  if (!module) {
    throw new Error("smiles-drawer is not loaded yet");
  }
  const SmilesDrawer = module.default;

  const smiles = content.trim();
  let tree: unknown = null;
  let parseError: unknown = null;
  SmilesDrawer.parse(
    smiles,
    (t: unknown) => {
      tree = t;
    },
    (e: unknown) => {
      parseError = e;
    },
  );
  if (parseError !== null || tree === null) {
    throw parseError instanceof Error
      ? parseError
      : new Error(String(parseError ?? "SMILES parse failed"));
  }

  const drawer = new SmilesDrawer.SvgDrawer({
    // The draw target's initial width/height are replaced by applyScale, and
    // the library's own scale path is deliberately unused (contract above).
    width: 500,
    height: 500,
    scale: 0,
    atomVisualization: options.atomVisualization,
    showCarbons: options.showCarbons,
    explicitHydrogens: options.explicitHydrogens,
    compactDrawing: options.compactDrawing,
    isomeric: options.isomeric,
  });

  const svg = drawer.draw(
    tree as never,
    null,
    resolveThemeName(options.theme),
  ) as SVGSVGElement;
  bakeSvgFonts(svg, drawer.opts as unknown as SmilesDrawerOpts);
  // Zoom-proof label placement (WebKit page zoom drifts em offsets and
  // CSS-px translates) — must run after bakeSvgFonts so the font-size
  // attributes it reads are in place.
  normalizeSmilesTextPlacement(svg);
  // Box fitting runs last, on the final text: it measures the real painted
  // ink (getBBox) so the box cannot clip labels regardless of the font or
  // engine's text metrics.
  applyScale(svg, options.scale);
  // smiles-drawer sets xmlns/xmlns:xlink as plain attributes on the target
  // it creates; XMLSerializer emits its own namespace declarations next to
  // those, so the serialized SVG carries them twice and strict consumers
  // (LibreOffice, usvg) reject it as malformed XML. Drop the manual copies —
  // the serializer re-adds exactly what the content needs.
  svg.removeAttribute("xmlns");
  svg.removeAttribute("xmlns:xlink");
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Render a SMILES fence to viewer HTML: a `.smiles-block` wrapper whose
 * `data-align` drives alignment (same mechanism as Mermaid), or a
 * `.smiles-error-block` fallback on parse/render failure.
 *
 * With `fitToWidth=false` the wrapper carries `data-fit-to-width="false"`
 * and the SVG is nested in a `.smiles-scroll-content` inner wrapper (the
 * Mermaid pattern: WebKitGTK does not reliably shrink-to-content an SVG
 * flex item, so the scroll host needs a plain-block child). The CSS keeps
 * the scaled size and adds a horizontal scrollbar; print rules clamp it
 * back to the page width. See styles.ts.
 */
export function renderSmilesFence(
  content: string,
  options: SmilesRenderOptions,
): string {
  try {
    const svg = renderSmilesSvg(content, options);
    const fitAttribute = options.fitToWidth ? "" : ' data-fit-to-width="false"';
    const body = options.fitToWidth
      ? svg
      : `<div class="smiles-scroll-content">${svg}</div>`;
    return `<div class="smiles-block" data-align="${options.align}"${fitAttribute}>${body}</div>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      `<div class="smiles-block smiles-error-block" data-align="${options.align}">` +
      `<pre class="smiles-error">${escapeHtml(content.trimEnd())}</pre>` +
      `<p class="smiles-error-msg">SMILES rendering failed: ${escapeHtml(message)}</p>` +
      `</div>`
    );
  }
}
