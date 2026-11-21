import type { MarkdownExtension } from "../types";
import { MERMAID_PATTERNS } from "../pre-scan";
import { mergeOptions } from "../directive-merge";
import { MERMAID_OPTIONS_SCHEMA } from "./schema";

// Side-effect: register feature detectors on import.
import "./detectors";

// The renderer (with its foreignObject label machinery) loads with the
// first pre-render pass instead of at startup. renderFence is a
// synchronous cache lookup that only runs after preRenderBlocks has
// filled the cache and this handle — see extensions/registry.ts.
let renderer: typeof import("./renderer") | null = null;

function resolveOptions(
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return mergeOptions(MERMAID_OPTIONS_SCHEMA, {}, opts);
}

export const mermaidExtension: MarkdownExtension = {
  id: "mermaid",
  label: "Mermaid Diagrams",
  triggerLanguages: ["mermaid"],
  fenceOptionsSchema: MERMAID_OPTIONS_SCHEMA,

  detect(content: string): boolean {
    return MERMAID_PATTERNS.some((p) => p.test(content));
  },

  async loadStyles() {
    const { injectMermaidStyles } = await import("./styles");
    injectMermaidStyles();
  },

  async preRenderBlocks(_content, context) {
    renderer ??= await import("./renderer");
    await renderer.preRenderMermaidBlocks(
      context.tokens,
      context.env,
      MERMAID_OPTIONS_SCHEMA,
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
    // matches the keys the pass filled — see THEME_SNAPSHOT_ENV_KEY.
    return renderer.renderMermaid(
      content,
      resolveOptions(options),
      renderer.themeSnapshotFromEnv(env),
    );
  },

  featureDetectors() {
    return [];
  },
};

export { MERMAID_OPTIONS_SCHEMA };
