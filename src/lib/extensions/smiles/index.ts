import type { MarkdownExtension } from "../types";
import { SMILES_PATTERNS } from "../pre-scan";
import {
  ensureSmilesLoaded,
  renderSmilesFence,
  resolveSmilesOptions,
} from "./renderer";
import { injectSmilesStyles } from "./styles";
import { SMILES_OPTIONS_SCHEMA } from "./schema";

// Side-effect: register feature detectors on import.
import "./detectors";

/**
 * SMILES molecular structures — a fence-only extension: no markdown-it
 * parser rules, no tokens, and (unlike Mermaid) no render cache. Rendering
 * is synchronous once the smiles-drawer chunk is loaded; `preRenderBlocks`
 * exists only to trigger that lazy load before the sync fence renderer runs.
 */
export const smilesExtension: MarkdownExtension = {
  id: "smiles",
  label: "SMILES Molecular Structures",
  triggerLanguages: ["smiles", "smi"],
  fenceOptionsSchema: SMILES_OPTIONS_SCHEMA,

  detect(content: string): boolean {
    return SMILES_PATTERNS.some((p) => p.test(content));
  },

  async loadStyles() {
    injectSmilesStyles();
  },

  async preRenderBlocks() {
    // Load the drawing chunk before the synchronous fence renderer needs it.
    // A load failure is non-fatal here: renderFence degrades to a per-block
    // error fallback, keeping the rest of the document rendering.
    await ensureSmilesLoaded().catch(() => undefined);
  },

  renderFence(
    content: string,
    _language: string,
    options: Record<string, unknown>,
  ): string | null {
    return renderSmilesFence(content, resolveSmilesOptions(options));
  },

  featureDetectors() {
    return [];
  },
};

export { SMILES_OPTIONS_SCHEMA };
