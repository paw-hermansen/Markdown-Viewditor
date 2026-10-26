import type MarkdownIt from "markdown-it";

/**
 * The one `data-line` injection contract.
 *
 * Every rendered block element that scroll-sync / zoom-scroll-anchor should
 * follow carries exactly one `data-line="N"` (its 1-based source line); the
 * values must stay unique per element and monotonic in rendered order (see
 * `scroll-sync.ts`). This module is the only place allowed to write that
 * attribute into rendered HTML. It used to live in three copies — the
 * line-numbers plugin (`<pre` regex replace, no idempotency), the extension
 * fence plugin (first-tag inject, first-tag idempotency) and the math
 * anchors (first-tag inject, whole-output idempotency, div-wrap fallback) —
 * so "exactly one `data-line` per element" depended on plugin install
 * order. All tagging is idempotent here, which makes the invariant
 * structural: a wrapper that runs after another wrapper in the rule stack
 * sees the tag and no-ops.
 *
 * Two placements exist because two outputs pin them (both asserted in
 * __tests__/data-line.test.ts):
 *
 *   - **after the tag name** ({@link injectDataLine}) — the generic case,
 *     pinned by fence-plugin.test.ts (`<my-diagram data-line="1">`);
 *   - **before the tag's `>`** ({@link tagOpeningTag}) for one exact
 *     opening-tag literal — pinned by markdown.test.ts
 *     (`<section class="footnotes" data-line="5">`), whose target is the
 *     middle of three opening tags. Matching the literal including its `>`
 *     also makes tagging naturally idempotent: an already-tagged tag no
 *     longer matches.
 */

type RenderRule = NonNullable<MarkdownIt["renderer"]["rules"][string]>;

/** First opening tag name (never `</closing>` or `<!--comment-->`). */
const FIRST_OPENING_TAG = /<([a-zA-Z][\w-]*)(?=[\s/>])/;

/**
 * Tag the first opening tag of `html` with `data-line="N"`, inserted right
 * after the tag name. Idempotent: if that tag already carries a `data-line`,
 * `html` is returned unchanged. When `html` has no opening tag at all it is
 * wrapped in `<div data-line="N">`, so the anchor is never silently lost.
 */
export function injectDataLine(html: string, line: number): string {
  const match = FIRST_OPENING_TAG.exec(html);
  if (!match || match.index === undefined) {
    return `<div data-line="${line}">${html}</div>`;
  }
  const firstTag = html.slice(match.index).match(/^[^>]*>/)?.[0] ?? "";
  if (/\bdata-line\s*=/i.test(firstTag)) return html;
  const insertAt = match.index + match[0].length;
  return (
    html.slice(0, insertAt) + ` data-line="${line}"` + html.slice(insertAt)
  );
}

/**
 * Tag one exact opening-tag literal (including its `>`), e.g.
 * `<section class="footnotes">`. `data-line` is appended before the tag's
 * `>`. Returns `html` unchanged when the literal is absent — which also
 * makes it idempotent (a tagged tag no longer matches the literal).
 */
export function tagOpeningTag(
  html: string,
  openingTag: string,
  line: number,
): string {
  return html.replace(
    openingTag,
    () => `${openingTag.slice(0, -1)} data-line="${line}">`,
  );
}

export type DataLineStrategy =
  /** `attrSet` on the token — for rules that render via `renderToken`. */
  | "attr"
  /** {@link injectDataLine} into the rendered HTML (fences). */
  | "first-tag"
  /** Wrap the rendered HTML in `<div data-line="N">` (raw html blocks). */
  | "wrap"
  /** {@link tagOpeningTag} on one exact opening-tag literal. */
  | { openingTag: string };

export interface DataLineOptions {
  /** How the anchor is written. Defaults to `"attr"`. */
  strategy?: DataLineStrategy;
  /**
   * Renderer to delegate to when the rule is undefined. Defaults to
   * `self.renderToken` (correct for `renderToken`-based rules like the
   * `*_open` tokens); string-rendering rules without a markdown-it default
   * (e.g. `footnote_block_open`) pass their own.
   */
  fallback?: RenderRule;
}

/**
 * Wrap `md.renderer.rules[ruleName]` so its output/token carries
 * `data-line="N"` from `token.map`. Existing rules are delegated to (the
 * wrapper captures the current rule at install time, so stacking wrappers
 * preserves all of them), and tokens without a `map` are left untouched.
 */
export function withDataLine(
  md: MarkdownIt,
  ruleName: string,
  opts: DataLineOptions = {},
): void {
  const strategy = opts.strategy ?? "attr";
  const fallback: RenderRule =
    opts.fallback ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));
  const prev = md.renderer.rules[ruleName] ?? fallback;

  md.renderer.rules[ruleName] = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    if (!token.map) return prev(tokens, idx, options, env, self);
    const line = token.map[0] + 1;
    if (strategy === "attr") {
      token.attrSet("data-line", String(line));
      return prev(tokens, idx, options, env, self);
    }
    const html = prev(tokens, idx, options, env, self);
    if (strategy === "wrap") return `<div data-line="${line}">${html}</div>`;
    if (strategy === "first-tag") return injectDataLine(html, line);
    return tagOpeningTag(html, strategy.openingTag, line);
  };
}
