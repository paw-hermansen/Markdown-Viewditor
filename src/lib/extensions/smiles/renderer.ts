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
 *   1. Every structure is drawn with the library's `scale: 0`, which produces
 *      a squared, centered viewBox at natural size (1 unit = 1 px).
 *   2. The user-facing `scale` multiplier is applied by overriding the SVG's
 *      `width`/`height` attributes (viewBox untouched). The box therefore
 *      stays square and centered at every scale, so `align` behaves
 *      identically at `scale=1` and `scale=1.5`, and the vector is lossless
 *      in HTML/PDF/ODT exports. The library's own `scale>0` path (inline
 *      style width on a hugged, non-square box) is deliberately unused.
 *   3. Responsive safety is CSS (`max-width: 100%; height: auto` in
 *      styles.ts) — a large `scale` can never overflow the viewer column.
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

/**
 * Apply the user-facing `scale` multiplier by overriding the SVG's
 * `width`/`height` attributes. The viewBox stays untouched (drawn squared at
 * natural size), so scaling is a pure vector resize.
 */
function applyScale(svg: SVGSVGElement, scale: number): void {
  const vb = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/);
  const w = parseFloat(vb[2] ?? "");
  const h = parseFloat(vb[3] ?? "");
  const side = Math.max(w, h);
  if (!Number.isFinite(side) || side <= 0) return;
  const size = String(Math.max(1, Math.round(side * scale)));
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
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
 * carries squared viewBox + explicit `width`/`height` attributes (the size
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
  applyScale(svg, options.scale);
  bakeSvgFonts(svg, drawer.opts as unknown as SmilesDrawerOpts);
  // Zoom-proof label placement (WebKit page zoom drifts em offsets and
  // CSS-px translates) — must run after bakeSvgFonts so the font-size
  // attributes it reads are in place.
  normalizeSmilesTextPlacement(svg);
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
 */
export function renderSmilesFence(
  content: string,
  options: SmilesRenderOptions,
): string {
  try {
    const svg = renderSmilesSvg(content, options);
    return `<div class="smiles-block" data-align="${options.align}">${svg}</div>`;
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
