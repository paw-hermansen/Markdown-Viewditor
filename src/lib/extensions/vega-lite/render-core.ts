import type { VegaLiteRenderOptions } from "./schema";
import { inlineOnlyLoader, INLINE_ONLY_DATA_MESSAGE } from "./loader";
import {
  buildVegaConfig,
  EXPORT_FONT_STACK,
  resolveThemeChoice,
} from "./theme-config";
import { rewriteImageHrefs } from "./image-hrefs";

/**
 * The render core — the reuse seam for a future `vega-down` fence
 * (plan §2): an already-parsed Vega-Lite spec in, a post-processed SVG
 * string out. No fence, JSON, or wrapper knowledge lives here.
 *
 * Rendering is CSP-safe end to end (plan §5, pinned by the
 * upgrade-contract test): `vega.parse(spec, undefined, { ast: true })` plus
 * the vega-interpreter as the View's `expr` evaluator — the default
 * `Function`-constructor path is never taken, so the Tauri CSP stays
 * `script-src 'self' 'unsafe-inline'` with no `unsafe-eval`.
 */
type VegaLiteModule = typeof import("vega-lite");
type VegaModule = typeof import("vega");
type VegaInterpreterModule = typeof import("vega-interpreter");

interface VegaModules {
  vl: VegaLiteModule;
  vega: VegaModule;
  expressionInterpreter: VegaInterpreterModule["expressionInterpreter"];
}

let modulesPromise: Promise<VegaModules> | null = null;

/**
 * Lazy-load the vega + vega-lite + vega-interpreter chunks (code-split by
 * Vite). Idempotent; a failed load is not cached so a later render can
 * retry (the SMILES convention).
 */
export function ensureVegaLoaded(): Promise<VegaModules> {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("vega-lite"),
      import("vega"),
      import("vega-interpreter"),
    ]).then(
      ([vl, vega, interpreter]): VegaModules => ({
        vl,
        vega,
        expressionInterpreter: interpreter.expressionInterpreter,
      }),
      (err) => {
        modulesPromise = null;
        throw err;
      },
    );
  }
  return modulesPromise;
}

/**
 * Reject any non-inline data source (plan §6): every `data` object with a
 * `url` key — top-level, in layers, facets, concats, repeats. Vega swallows
 * loader rejections (runAsync resolves with an empty dataset), so this walk
 * is the user-facing enforcement; the loader's rejecting `load` is the
 * backstop.
 */
export function validateSpecInlineOnly(spec: unknown): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    const data = obj.data;
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof (data as Record<string, unknown>).url === "string"
    ) {
      throw new Error(INLINE_ONLY_DATA_MESSAGE);
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(spec);
}

export interface VegaRenderContext {
  /** `export` renders the neutral-document look (light theme, concrete font). */
  variant?: "viewer" | "export";
  /** Document file for local image-href resolution (may be null). */
  baseFile?: string | null;
}

function postProcessSvg(svg: string, baseFile: string | null): string {
  if (typeof DOMParser === "undefined") return svg;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement as unknown as SVGSVGElement | null;
  if (!root || root.tagName.toLowerCase() !== "svg") return svg;
  pinSvgDimensions(root);
  rewriteImageHrefs(root, baseFile);
  return new XMLSerializer().serializeToString(root);
}

/**
 * Guarantee numeric `width`/`height` attributes on the root `<svg>` from the
 * viewBox when missing — `sniffSvgDimensions` (ODT/DOCX) depends on them.
 * Vega's `toSVG()` already emits them; this is the safety net, pinned by the
 * upgrade-contract test.
 */
export function pinSvgDimensions(root: SVGSVGElement): void {
  const parts = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const pairs: Array<["width" | "height", number]> = [
    ["width", 2],
    ["height", 3],
  ];
  for (const [name, index] of pairs) {
    const current = parseFloat(root.getAttribute(name) ?? "");
    if (Number.isFinite(current) && current > 0) continue;
    const fromViewBox = parts[index];
    if (Number.isFinite(fromViewBox) && fromViewBox > 0) {
      root.setAttribute(name, String(Math.round(fromViewBox * 100) / 100));
    }
  }
}

/**
 * Render one parsed Vega-Lite spec to a standalone SVG string (explicit
 * root dimensions, attribute-painted, no `<style>` block — the export
 * contract, plan §10). Throws on invalid specs; callers wanting a graceful
 * HTML fallback go through `renderVegaLiteFence` in renderer.ts.
 */
export async function renderVegaLiteSpec(
  spec: object,
  options: VegaLiteRenderOptions,
  context: VegaRenderContext = {},
): Promise<string> {
  validateSpecInlineOnly(spec);
  const { vl, vega, expressionInterpreter } = await ensureVegaLoaded();
  const variant = context.variant ?? "viewer";
  // Export/print are neutral documents (white page, no theme background):
  // `theme=auto` resolves to light there, while an explicitly pinned theme
  // is the writer's deliberate choice and is honored (the SMILES ODT
  // contract). The export font stack is forced either way.
  const theme =
    variant === "export"
      ? options.theme === "auto"
        ? "light"
        : options.theme
      : resolveThemeChoice(options.theme);
  const config = buildVegaConfig(
    theme,
    variant === "export" ? { font: EXPORT_FONT_STACK } : undefined,
  );
  const compiled = vl.compile(spec as never, { config });
  const runtime = vega.parse(compiled.spec, undefined, { ast: true });
  const view = new vega.View(runtime, {
    expr: expressionInterpreter,
    renderer: "svg",
    loader: inlineOnlyLoader,
  });
  try {
    await view.runAsync();
    const svg = await view.toSVG();
    return postProcessSvg(svg, context.baseFile ?? null);
  } finally {
    view.finalize();
  }
}
