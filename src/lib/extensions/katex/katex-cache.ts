import katex from "katex";

/**
 * Bounded LRU-ish memo cache around `katex.renderToString`. Whole-document
 * re-renders (the Viewer re-renders 150 ms after typing pauses) then cost ~0
 * for unchanged formulas, keeping math-heavy documents smooth.
 *
 * The cache key includes rendering-affecting options (displayMode, leqno,
 * fleqn, strict, trust, errorColor) so formulas with different directive
 * states produce distinct cached entries.
 */
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, string>();

/**
 * Compute a compact fingerprint from KaTeX options that affect rendering
 * output. Options that don't change the HTML (like throwOnError) are excluded.
 */
function computeOptionsFingerprint(options?: katex.KatexOptions): string {
  if (!options) return "";
  const parts: string[] = [];
  if (options.displayMode) parts.push("D");
  if (options.leqno) parts.push("L");
  if (options.fleqn) parts.push("F");
  if (options.strict && options.strict !== "warn")
    parts.push(`S:${options.strict}`);
  if (options.trust) parts.push("T");
  if (options.errorColor && options.errorColor !== "#cc0000")
    parts.push(`E:${options.errorColor}`);
  return parts.join(",");
}

function memoizedRenderToString(
  latex: string,
  options?: katex.KatexOptions,
): string {
  const displayMode = options?.displayMode === true;
  const fingerprint = computeOptionsFingerprint(options);
  const key =
    (displayMode ? "1|" : "0|") +
    (fingerprint ? fingerprint + "|" : "") +
    latex;
  const hit = cache.get(key);
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
