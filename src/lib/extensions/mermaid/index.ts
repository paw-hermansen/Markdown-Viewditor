import type { MarkdownExtension } from "../types";
import { MERMAID_PATTERNS } from "../pre-scan";
import { mergeOptions } from "../directive-merge";
import {
  preRenderMermaidBlocks,
  renderMermaid,
  themeSnapshotFromEnv,
} from "./renderer";
import { injectMermaidStyles } from "./styles";
import { MERMAID_OPTIONS_SCHEMA } from "./schema";

// Side-effect: register feature detectors on import.
import "./detectors";

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
    injectMermaidStyles();
  },

  async preRenderBlocks(_content, context) {
    await preRenderMermaidBlocks(
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
    // Use the pre-render pass's theme snapshot (if any) so the cache lookup
    // matches the keys the pass filled — see THEME_SNAPSHOT_ENV_KEY.
    return renderMermaid(
      content,
      resolveOptions(options),
      themeSnapshotFromEnv(env),
    );
  },

  featureDetectors() {
    return [];
  },
};

export { MERMAID_OPTIONS_SCHEMA };
