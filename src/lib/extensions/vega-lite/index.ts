import type { MarkdownExtension } from "../types";
import { VEGA_LITE_PATTERNS } from "../pre-scan";
import { mergeOptions } from "../directive-merge";
import { preRenderVegaLiteBlocks, renderVegaLiteFence } from "./renderer";
import { injectVegaLiteStyles } from "./styles";
import { VEGA_LITE_OPTIONS_SCHEMA } from "./schema";

// Side-effect: register feature detectors on import.
import "./detectors";

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
    injectVegaLiteStyles();
  },

  async preRenderBlocks(_content, context) {
    await preRenderVegaLiteBlocks(
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
    // Use the pre-render pass's theme snapshot (if any) so the cache lookup
    // matches the keys the pass filled — the mermaid THEME_SNAPSHOT contract.
    return renderVegaLiteFence(content, resolveOptions(options), env);
  },

  featureDetectors() {
    return [];
  },
};

export { VEGA_LITE_OPTIONS_SCHEMA };
