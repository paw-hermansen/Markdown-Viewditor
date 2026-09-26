import type MarkdownIt from "markdown-it";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "./fence-options";
import {
  getDirectiveState,
  warnInvalidExplicitFenceOptions,
} from "./directives";
import { listExtensions } from "./registry";
import { mergeOptions } from "./directive-merge";

function injectDataLine(html: string, line: string): string {
  const firstTag = html.match(/^\s*<[A-Za-z][\w-]*(?:\s[^>]*)?\s*\/?>/);
  if (!firstTag || /\bdata-line\s*=/i.test(firstTag[0])) return html;

  return html.replace(
    /^(\s*<[A-Za-z][\w-]*)(?=\s|\/?>)/,
    `$1 data-line="${line}"`,
  );
}

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
          warnInvalidExplicitFenceOptions(parsed, ext.fenceOptionsSchema);
          fenceOpts = validateExplicitFenceOptions(
            parsed,
            ext.fenceOptionsSchema,
          );
        }

        // Merge defaults, positional directive state, and this fence's attrs.
        let mergedOpts: Record<string, unknown> = fenceOpts;
        if (ext.fenceOptionsSchema) {
          const directiveState = getDirectiveState(env, ext.id, idx);
          mergedOpts = mergeOptions(
            ext.fenceOptionsSchema,
            directiveState,
            fenceOpts,
          );
        }

        const rendered = ext.renderFence(token.content, lang, mergedOpts);
        if (rendered !== null) {
          // Inject data-line into the first tag for scroll-sync.
          if (token.map) {
            return injectDataLine(rendered, String(token.map[0] + 1));
          }
          return rendered;
        }
      }
    }

    // Fall through to default.
    return (
      defaultFence(tokens, idx, options, env, self) ??
      self.renderToken(tokens, idx, options)
    );
  };
}
