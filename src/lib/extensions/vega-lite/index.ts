import type { MarkdownExtension } from "../types";
import { VEGA_LITE_PATTERNS } from "../pre-scan";
import { mergeOptions } from "../directive-merge";
import { VEGA_LITE_OPTIONS_SCHEMA } from "./schema";

// Side-effect: register feature detectors on import.
import "./detectors";

// The render core (and its math-labels → $lib/export/math-render → KaTeX
// chain) loads with the first pre-render pass instead of at startup.
// renderFence is a synchronous cache lookup that only runs after
// preRenderBlocks has filled the cache and this handle — see
// extensions/registry.ts.
let renderer: typeof import("./renderer") | null = null;

function resolveOptions(
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return mergeOptions(VEGA_LITE_OPTIONS_SCHEMA, {}, opts);
}

/**
 * Vega-Lite charts from raw JSON fence bodies — a fence-only extension
 * (no markdown-it parser rules). Like Mermaid it uses an async pre-render
 * cache: `renderFence` is synchronous but vega rendering is not, so
 * `preRenderBlocks` renders each fence into the cache first and
 * `renderFence` is a lookup. The render core (render-core.ts) is the reuse
 * seam for a future `vega-down` fence.
 */
export const vegaLiteExtension: MarkdownExtension = {
  id: "vega-lite",
  label: "Vega-Lite Charts",
  triggerLanguages: ["vega-lite", "vegalite"],
  fenceOptionsSchema: VEGA_LITE_OPTIONS_SCHEMA,

  detect(content: string): boolean {
    return VEGA_LITE_PATTERNS.some((p) => p.test(content));
  },

  async loadStyles() {
    const { injectVegaLiteStyles } = await import("./styles");
    injectVegaLiteStyles();
  },

  async preRenderBlocks(_content, context) {
    renderer ??= await import("./renderer");
    await renderer.preRenderVegaLiteBlocks(
      context.tokens,
      context.env,
      VEGA_LITE_OPTIONS_SCHEMA,
    );
  },

  renderFence(
    content: string,
    _language: string,
    options: Record<string, unknown>,
    env?: Record<string, unknown>,
  ): string | null {
    if (!renderer) return null;
    // Use the pre-render pass's theme snapshot (if any) so the cache lookup
    // matches the keys the pass filled — the mermaid THEME_SNAPSHOT contract.
    return renderer.renderVegaLiteFence(content, resolveOptions(options), env);
  },

  featureDetectors() {
    return [];
  },
};

export { VEGA_LITE_OPTIONS_SCHEMA };
