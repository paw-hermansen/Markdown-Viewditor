import type MarkdownIt from "markdown-it";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "./fence-options";
import { listExtensions } from "./registry";
import { mergeOptions } from "./directive-merge";

/**
 * Extension-aware fence renderer plugin. Always registered on the base md
 * instance. Delegates to extensions based on triggerLanguages.
 */
export function extensionFencePlugin(md: MarkdownIt): void {
  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const info = token.info.trim();
    const lang = info.split(/\s+/)[0].toLowerCase();

    // Check loaded extensions for a fence renderer.
    for (const ext of listExtensions()) {
      if (ext.renderFence && ext.triggerLanguages?.includes(lang)) {
        // Parse {key=val} attributes from info string.
        let fenceOpts: Record<string, unknown> = {};
        const rawAttrs = extractBraceAttrs(info);
        if (rawAttrs && ext.fenceOptionsSchema) {
          const parsed = parseAttrString(rawAttrs);
          fenceOpts = validateExplicitFenceOptions(
            parsed,
            ext.fenceOptionsSchema,
          );
        }

        // Merge with directive state.
        let mergedOpts: Record<string, unknown> = fenceOpts;
        if (ext.fenceOptionsSchema) {
          const directiveState = getDirectiveStateForExtension(env, ext.id);
          if (Object.keys(directiveState).length > 0) {
            mergedOpts = mergeOptions(
              ext.fenceOptionsSchema,
              directiveState,
              fenceOpts,
            );
          }
        }

        const rendered = ext.renderFence(token.content, lang, mergedOpts);
        if (rendered !== null) return rendered;
      }
    }

    // Fall through to default.
    return (
      defaultFence(tokens, idx, options, env, self) ??
      self.renderToken(tokens, idx, options)
    );
  };
}

/**
 * Get directive state for a specific extension from the env.
 * Directives are stored by the directive plugin as
 * `env.directives: Map<number, Map<string, Record<string, unknown>>>`.
 * We look up the last directive state for the given extension id.
 */
function getDirectiveStateForExtension(
  env: Record<string, unknown>,
  extensionId: string,
): Record<string, unknown> {
  const directives = env.directives as
    Map<number, Map<string, Record<string, unknown>>> | undefined;
  if (!directives || directives.size === 0) return {};

  // Walk backward through the directive map to find the most recent state
  // for this extension.
  const entries = [...directives.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = entries.length - 1; i >= 0; i--) {
    const nsMap = entries[i][1];
    const state = nsMap.get(extensionId);
    if (state) return state;
  }
  return {};
}
