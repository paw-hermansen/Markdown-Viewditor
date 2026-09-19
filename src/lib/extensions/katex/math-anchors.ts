import type MarkdownIt from "markdown-it";
import katex from "katex";
import { memoizedKatex } from "./katex-cache";
import { mergeOptions } from "../directive-merge";
import { getDirectiveState } from "../directives";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "../fence-options";
import { KATEX_OPTIONS_SCHEMA } from "./renderer";

/**
 * Inject `data-line="${line}"` into the first opening tag of `html` so
 * scroll-sync can anchor the rendered element to its source line. Used for
 * math output (`<p class="katex-block">…`) which the line-numbers plugin
 * can't tag (its fence wrapper only injects into `<pre`, and `math_block`
 * has no `renderToken`-based rule to attrSet on).
 *
 * If the html already carries a `data-line` (e.g. the line-numbers fence
 * wrapper already tagged `<pre data-line="…">` for a non-math fence), the
 * injection is a no-op so we don't double-tag.
 */
function injectDataLine(html: string, line: number): string {
  if (html.includes('data-line="')) return html;
  const m = html.match(/<([a-zA-Z][\w-]*)/);
  if (!m || m.index === undefined) {
    return `<div data-line="${line}">${html}</div>`;
  }
  const insertPos = m.index + m[0].length;
  return (
    html.slice(0, insertPos) + ` data-line="${line}"` + html.slice(insertPos)
  );
}

/**
 * Wrap `math_block` and `math_inline` renderers to inject `data-line` on math
 * output and apply per-block KaTeX options from directives.
 *
 * Must run AFTER every plugin `.use()` so the katex fence wrapper
 * (installed when `enableFencedBlocks: true`) and the @vscode `math_block`
 * renderer are already in place.
 */
/**
 * Check if directive state contains any non-default values.
 * Returns false when all values match the schema defaults (meaning no
 * meaningful directives are active).
 */
function hasNonDefaultDirectives(state: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(state)) {
    const def = KATEX_OPTIONS_SCHEMA[key];
    if (def && value !== def.default) return true;
  }
  return false;
}

export function wrapMathAnchorRenderers(md: MarkdownIt): void {
  const mathBlockRule = md.renderer.rules.math_block;
  if (mathBlockRule) {
    md.renderer.rules.math_block = function (tokens, idx, options, env, self) {
      const token = tokens[idx];

      // Get directive state at this token's position.
      const pos = token.meta?._parentStreamIndex as number | undefined;
      const directiveState = getDirectiveState(env, "math", pos);

      const hasDirectives = hasNonDefaultDirectives(directiveState);

      let html: string;
      if (hasDirectives) {
        // Merge directives with schema defaults and render directly.
        const merged = mergeOptions(KATEX_OPTIONS_SCHEMA, directiveState, {});
        html = renderMathBlockWithOptions(token.content, true, merged);
      } else {
        // Use the default @vscode renderer.
        html = mathBlockRule(tokens, idx, options, env, self);
      }

      if (token.map) {
        return injectDataLine(html, token.map[0] + 1);
      }
      return html;
    };
  }

  const mathInlineRule = md.renderer.rules.math_inline;
  if (mathInlineRule) {
    md.renderer.rules.math_inline = function (tokens, idx, options, env, self) {
      const token = tokens[idx];

      // Get directive state at this token's parent position.
      const pos = token.meta?._parentStreamIndex as number | undefined;
      const directiveState = getDirectiveState(env, "math", pos);

      const hasDirectives = hasNonDefaultDirectives(directiveState);

      if (hasDirectives) {
        const merged = mergeOptions(KATEX_OPTIONS_SCHEMA, directiveState, {});
        return renderMathInlineWithOptions(token.content, merged);
      }

      return mathInlineRule(tokens, idx, options, env, self);
    };
  }

  const fenceRule = md.renderer.rules.fence;
  if (fenceRule) {
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const info = token.info.trim();
      const lang = info.split(/\s+/)[0].toLowerCase();

      // For ```math fences, check for directives and apply them.
      if (lang === "math") {
        const pos = idx;
        const directiveState = getDirectiveState(env, "math", pos);

        // Parse fence attributes from {key=val} in the info string.
        let fenceOpts: Record<string, unknown> = {};
        const rawAttrs = extractBraceAttrs(info);
        if (rawAttrs) {
          const parsed = parseAttrString(rawAttrs);
          fenceOpts = validateExplicitFenceOptions(
            parsed,
            KATEX_OPTIONS_SCHEMA,
          );
        }

        const hasDirectives = hasNonDefaultDirectives(directiveState);
        const hasFenceOpts = Object.keys(fenceOpts).length > 0;

        if (hasDirectives || hasFenceOpts) {
          const merged = mergeOptions(
            KATEX_OPTIONS_SCHEMA,
            directiveState,
            fenceOpts,
          );
          const html = renderMathBlockWithOptions(token.content, true, merged);
          if (token.map) {
            return injectDataLine(html, token.map[0] + 1);
          }
          return html;
        }
      }

      const html = fenceRule(tokens, idx, options, env, self);
      if (token.map) {
        return injectDataLine(html, token.map[0] + 1);
      }
      return html;
    };
  }
}

/**
 * Render a math block with per-block options. Applies fontsize via CSS
 * variable on a wrapper span.
 */
function renderMathBlockWithOptions(
  latex: string,
  displayMode: boolean,
  options: Record<string, unknown>,
): string {
  const leqno = options.leqno === true;
  const fleqn = options.fleqn === true;
  const fontsize = typeof options.fontsize === "number" ? options.fontsize : 1;

  const katexOpts: katex.KatexOptions = {
    displayMode,
    leqno,
    fleqn,
    throwOnError: false,
    errorColor: "#cc0000",
  };

  const html = memoizedKatex.renderToString(latex, katexOpts);

  if (fontsize !== 1) {
    return `<span class="katex-block" style="--katex-font-scale: ${fontsize}">${html}</span>`;
  }
  return html;
}

/**
 * Render inline math with per-block options.
 */
function renderMathInlineWithOptions(
  latex: string,
  options: Record<string, unknown>,
): string {
  const leqno = options.leqno === true;
  const fleqn = options.fleqn === true;
  const fontsize = typeof options.fontsize === "number" ? options.fontsize : 1;

  const katexOpts: katex.KatexOptions = {
    displayMode: false,
    leqno,
    fleqn,
    throwOnError: false,
    errorColor: "#cc0000",
  };

  const html = memoizedKatex.renderToString(latex, katexOpts);

  if (fontsize !== 1) {
    return `<span style="--katex-font-scale: ${fontsize}">${html}</span>`;
  }
  return html;
}
