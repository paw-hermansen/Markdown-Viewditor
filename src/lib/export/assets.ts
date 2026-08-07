/**
 * Asset inlining for self-contained HTML export. Rewrites `url(...)` in CSS
 * (woff2 fonts only — woff/ttf were stripped from katex.woff2.css) and
 * `localimg://` / `asset://` image srcs in HTML to `data:` URIs so the
 * exported file has no external dependencies.
 *
 * Per-asset failures are non-fatal: a warning is recorded and the original
 * URL is left in place, so a single broken image doesn't abort the export.
 */

export interface InlineResult<T> {
  value: T;
  warnings: string[];
}

/** Match `url(...)` references in CSS, capturing the inside. */
const CSS_URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

/**
 * Inline every `url(...)` in `cssText` to a `data:` URI by fetching the
 * referenced same-origin resource. Cross-origin URLs (http(s)) are left
 * untouched — inlining them would require CORS and inflate the file.
 *
 * Only same-origin paths (Vite-emitted assets, relative fonts) are inlined.
 */
export async function inlineCssAssets(
  cssText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InlineResult<string>> {
  const warnings: string[] = [];
  const matches = [...cssText.matchAll(CSS_URL_RE)];
  if (matches.length === 0) return { value: cssText, warnings };

  // Deduplicate: the same font URL may appear in multiple @font-face rules.
  const uniqueHrefs = [...new Set(matches.map((m) => m[2]))];
  const dataUriMap = new Map<string, string>();

  await Promise.all(
    uniqueHrefs.map(async (href) => {
      // Skip absolute URLs (http://, https://, data:, blob:).
      if (/^(https?:|data:|blob:)/i.test(href)) return;
      try {
        const res = await fetchImpl(href);
        if (!res.ok) {
          warnings.push(`CSS asset ${href} returned ${res.status}`);
          return;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") ?? mimeFromHref(href);
        dataUriMap.set(href, bytesToDataUri(buf, mime));
      } catch (err) {
        warnings.push(
          `CSS asset ${href} could not be inlined: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  let out = cssText;
  for (const [href, dataUri] of dataUriMap) {
    // Replace all occurrences of this href inside url(...).
    out = out.split(href).join(dataUri);
  }
  return { value: out, warnings };
}

/** Match `src="..."` and `src='...'` in <img> tags. */
const IMG_SRC_RE = /(<img\s[^>]*?src=)(['"])([^'"]+)\2/gi;

/** Tauri `invoke` call signature. */
type InvokeImpl = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Extract the filesystem path from a Tauri local-file URL.
 *
 * Handles both platform variants:
 * - Linux/macOS: `localimg://localhost/<encoded-path>`
 * - Windows:     `http://localimg.localhost/<encoded-path>`
 *
 * Returns null when the src is not a recognized local-file URL.
 */
function extractLocalImgPath(src: string): string | null {
  for (const prefix of [
    "localimg://localhost/",
    "http://localimg.localhost/",
    "asset://localhost/",
    "http://asset.localhost/",
  ]) {
    if (src.startsWith(prefix)) {
      return decodeURIComponent(src.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Inline `localimg://` / `asset://` / `http://localhost` image srcs by
 * rewriting them to `data:` URIs so the exported file has no external
 * dependencies.
 *
 * `localimg://` URLs are loaded via Tauri IPC (`read_file_as_base64`)
 * because the browser Fetch API does not support custom URI schemes.
 * Other local URLs (`http://localhost`) still go through `fetchImpl`.
 */
export async function inlineImages(
  html: string,
  fetchImpl: typeof fetch = fetch,
  invokeImpl?: InvokeImpl,
): Promise<InlineResult<string>> {
  const warnings: string[] = [];
  const matches = [...html.matchAll(IMG_SRC_RE)];
  if (matches.length === 0) return { value: html, warnings };

  const uniqueSrcs = [...new Set(matches.map((m) => m[3]))];
  const dataUriMap = new Map<string, string>();

  await Promise.all(
    uniqueSrcs.map(async (src) => {
      // Only inline Tauri-served local protocols; leave web URLs alone.
      // Matches: localimg://, asset://, http://localimg.localhost/,
      // http://asset.localhost/, http(s)://localhost/
      if (
        !/^((localimg|asset):|https?:\/\/(localhost|localimg\.localhost|asset\.localhost)\/)/i.test(
          src,
        )
      )
        return;

      const localPath = extractLocalImgPath(src);
      if (localPath && invokeImpl) {
        // localimg:// URLs: read the file via Tauri IPC. The Fetch API
        // does not support custom URI schemes, so fetch() would fail.
        try {
          const base64 = (await invokeImpl("read_file_as_base64", {
            path: localPath,
          })) as string;
          const mime = mimeFromHref(localPath);
          dataUriMap.set(src, `data:${mime};base64,${base64}`);
        } catch (err) {
          warnings.push(
            `Image ${src} could not be inlined: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        // http://localhost or asset:// — use fetch (works for http scheme).
        try {
          const res = await fetchImpl(src);
          if (!res.ok) {
            warnings.push(`Image ${src} returned ${res.status}`);
            return;
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          const mime = res.headers.get("content-type") ?? mimeFromHref(src);
          dataUriMap.set(src, bytesToDataUri(buf, mime));
        } catch (err) {
          warnings.push(
            `Image ${src} could not be inlined: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }),
  );

  let out = html;
  for (const [src, dataUri] of dataUriMap) {
    // Replace the src value (inside the matched src="..." attribute). Using
    // split/join on the raw src is safe because these are protocol-prefixed
    // URLs that won't accidentally match other substrings.
    out = out.split(src).join(dataUri);
  }
  return { value: out, warnings };
}

function mimeFromHref(href: string): string {
  const ext = href.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
