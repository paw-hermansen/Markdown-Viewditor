/**
 * Append a cache-busting query parameter to image URLs so a forced render
 * re-fetches them instead of being served from the webview's in-memory
 * image cache. Covers markdown `<img src>` and SVG `<image>` hrefs (vega
 * image marks emit `xlink:href`). The localimg protocol handler ignores the
 * query string (it only reads request.uri().path()), so local file
 * resolution is unaffected. data:/blob: URLs carry no remote resource and
 * are left untouched.
 */
export function bustImageCache(html: string, nonce: number): string {
  const busted = html.replace(
    /(<img\s[^>]*?src=["'])([^"']+)(["'])/gi,
    (match, prefix, src, quote) => {
      if (/^(data:|blob:)/i.test(src)) return match;
      const sep = src.includes("?") ? "&" : "?";
      return `${prefix}${src}${sep}_r=${nonce}${quote}`;
    },
  );
  return busted.replace(
    /(<image\s[^>]*?(?:xlink:)?href=["'])([^"']+)(["'])/gi,
    (match, prefix, src, quote) => {
      if (/^(data:|blob:)/i.test(src)) return match;
      const sep = src.includes("?") ? "&" : "?";
      return `${prefix}${src}${sep}_r=${nonce}${quote}`;
    },
  );
}
