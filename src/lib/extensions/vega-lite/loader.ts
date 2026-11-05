import { invoke } from "@tauri-apps/api/core";
import { extractLocalImgPath, mimeFromHref } from "$lib/export/image-src";
import { resolveImageHref } from "./image-hrefs";

/**
 * The image-aware, inline-only data loader handed to every Vega View
 * (plan §6).
 *
 * DATA: vega-Lite fences present small, self-contained datasets: only
 * inline `data.values` (and inline generators such as the `sequence`
 * transform) render. `load` rejects every fetch — that is a
 * defense-in-depth backstop only: vega **swallows** loader rejections
 * (runAsync resolves and the dataset is simply empty), so the
 * user-facing error comes from the spec pre-validation in render-core.ts.
 *
 * IMAGES: `sanitize` is where image hrefs are resolved and inlined.
 * vega's image pipeline preloads each image through `new Image()` and the
 * SVG writer emits the loaded element's `src` readback as `xlink:href`
 * (vega-scenegraph `attr$4`), and it preloads with
 * `crossOrigin = "anonymous"`. Both are hostile to custom URL schemes:
 * the readback can drop `localimg://` URLs and the CORS-mode preload can
 * fail on the localimg protocol, leaving an empty or broken href (the
 * broken-image glyph bug). So local images are read at render time and
 * returned as `data:` URIs — which round-trip through every engine, need
 * no CORS, and make the chart self-contained in the viewer, print clone,
 * and every export. Remote (http/https) and inline (data/blob) hrefs pass
 * through untouched, matching the markdown image policy. `crossOrigin` is
 * explicitly cleared so remote preloads are plain requests too.
 *
 * A file that cannot be read is NOT fatal: the resolved URL is returned,
 * a warning is recorded in the render's warning sink, and the chart still
 * renders (the image shows as broken, with the warning surfaced).
 */
export const INLINE_ONLY_DATA_MESSAGE =
  "vega-lite fences support inline data only (data.values)";

const PASS_THROUGH = /^(data:|blob:|https?:)/i;

function reject(): Promise<never> {
  return Promise.reject(new Error(INLINE_ONLY_DATA_MESSAGE));
}

export interface VegaLoaderOptions {
  /** Document file for relative image path resolution (may be null). */
  baseFile?: string | null;
  /** Sink for non-fatal image warnings (e.g. unreadable files). */
  warnings?: string[];
}

async function readAsDataUri(path: string): Promise<string> {
  const base64 = (await invoke("read_file_as_base64", { path })) as string;
  return `data:${mimeFromHref(path)};base64,${base64}`;
}

export function createVegaLoader(options: VegaLoaderOptions = {}) {
  const baseFile = options.baseFile ?? null;
  const warnings = options.warnings;
  return {
    load: reject,
    http: reject,
    file: reject,
    sanitize: async (uri: string) => {
      const href = uri.trim();
      if (!href || PASS_THROUGH.test(href)) return { href };
      const resolved = resolveImageHref(href, baseFile);
      const path = extractLocalImgPath(resolved);
      if (!path) return { href: resolved, crossOrigin: null };
      try {
        return { href: await readAsDataUri(path), crossOrigin: null };
      } catch (err) {
        warnings?.push(
          `Image ${path} could not be loaded: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { href: resolved, crossOrigin: null };
      }
    },
  };
}

/** The stateless default (no base file, warnings discarded). */
export const inlineOnlyLoader = createVegaLoader();
