/**
 * The inline-only data loader handed to every Vega View (plan §6).
 *
 * Vega-Lite fences present small, self-contained datasets: only inline
 * `data.values` (and inline generators such as the `sequence` transform)
 * render. `load` rejects every fetch — that is a defense-in-depth backstop
 * only: vega **swallows** loader rejections (runAsync resolves and the
 * dataset is simply empty), so the user-facing error comes from the spec
 * pre-validation in render-core.ts.
 *
 * `sanitize` is a deliberate pass-through (async — vega awaits it): vega's
 * default URL sanitizer empties `localimg://` / `asset://` hrefs and rewrites
 * `file:///x` to `/x`, which would break the image-href rewrite contract
 * (image-hrefs.ts) and pre-resolved srcs in shared documents.
 */
export const INLINE_ONLY_DATA_MESSAGE =
  "vega-lite fences support inline data only (data.values)";

function reject(): Promise<never> {
  return Promise.reject(new Error(INLINE_ONLY_DATA_MESSAGE));
}

export const inlineOnlyLoader = {
  load: reject,
  http: reject,
  file: reject,
  sanitize: async (uri: string) => ({ href: uri }),
};
