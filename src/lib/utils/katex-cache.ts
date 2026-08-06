import katex from "katex";

/**
 * Bounded LRU-ish memo cache around `katex.renderToString`. Whole-document
 * re-renders (the Viewer re-renders 150 ms after typing pauses) then cost ~0
 * for unchanged formulas, keeping math-heavy documents smooth. The cache key
 * is `(displayMode, latex)` — the plugin's other KaTeX options (throwOnError,
 * errorColor) are fixed at registration time so they don't need to participate
 * in the key.
 *
 * Used by the @vscode/markdown-it-katex plugin via its `katex` option, which
 * expects a `typeof katex`-shaped object. We spread the real katex and
 * override `renderToString` so anything else the plugin touches (e.g.
 * `katex.version`) keeps working.
 */
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, string>();

function memoizedRenderToString(
  latex: string,
  options?: katex.KatexOptions,
): string {
  const displayMode = options?.displayMode === true;
  const key = (displayMode ? "1|" : "0|") + latex;
  const hit = cache.get(latex === "" ? key : key);
  if (hit !== undefined) return hit;
  const out = katex.renderToString(latex, options);
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, out);
  return out;
}

/**
 * katex-shaped wrapper with the memoized renderToString. Spread onto the real
 * `katex` so any other surface the @vscode plugin might touch stays intact.
 */
export const memoizedKatex = {
  ...katex,
  renderToString: memoizedRenderToString,
} as typeof katex;
