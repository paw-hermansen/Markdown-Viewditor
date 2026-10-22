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
  return MIME_BY_EXTENSION[extensionOfHref(href)] ?? "application/octet-stream";
}

const MIME_BY_EXTENSION: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

/**
 * The lowercased extension of a path or URL.
 *
 * `?query` and `#fragment` are URL delimiters, not part of a name, so
 * `font.woff2?v=1.2` is a woff2 — reading the extension off the raw string
 * would see `woff2?v=1` and miss, and a dotted version query (`?v=1.2.3`)
 * would look like the extension entirely.
 *
 * This is also called with decoded filesystem paths though (the output of
 * {@link extractLocalImgPath}), where `?` and `#` are legal filename
 * characters — `my#pic.png` reaches here decoded from `%23`. So when
 * dropping the delimiters costs us a type we recognize, read the name as
 * written instead. That keeps the old behavior for such names and only
 * improves the URL cases.
 */
function extensionOfHref(href: string): string {
  const cleaned = rawExtension(href.split(/[?#]/, 1)[0]);
  return cleaned in MIME_BY_EXTENSION ? cleaned : rawExtension(href);
}

function rawExtension(href: string): string {
  return href.split(".").pop()?.toLowerCase() ?? "";
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
