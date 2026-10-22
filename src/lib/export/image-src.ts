/**
 * Image/asset source handling, shared by the export pipeline: what a
 * `localimg://` / `asset://` src actually points at, how a path maps to a
 * MIME type, and how a MIME type maps back to a packaged file extension.
 *
 * These were triplicated across `exporters/odt.ts`, `exporters/html-bundle.ts`
 * and `assets.ts`, and had already drifted: the ODT copy lacked the font
 * types the other two knew about.
 */

/** URL prefixes that mean "read this file off the local disk". */
const LOCAL_SRC_PREFIXES = [
  "localimg://localhost/",
  "http://localimg.localhost/",
  "asset://localhost/",
  "http://asset.localhost/",
];

/**
 * The local filesystem path a `localimg://` / `asset://` src refers to, or
 * `null` when the src is not one of those schemes.
 */
export function extractLocalImgPath(src: string): string | null {
  for (const prefix of LOCAL_SRC_PREFIXES) {
    if (src.startsWith(prefix)) {
      return decodeURIComponent(src.slice(prefix.length));
    }
  }
  return null;
}

/**
 * MIME type for a path or URL, from its extension. Covers the fonts the
 * export pipeline inlines alongside images; unknown types fall back to
 * `application/octet-stream`.
 */
export function mimeFromHref(href: string): string {
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

/**
 * File extension to package a given MIME type under. Unknown types get
 * `.bin`.
 */
export function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
