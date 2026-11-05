import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveLink } from "$lib/utils/path";

/**
 * Image-mark href rewriting (plan §6): vega image marks get the same policy
 * as markdown `<img>` srcs. `https:`/`http:`/`data:`/`blob:` and already
 * resolved `localimg:`/`asset:` srcs pass through untouched; local paths
 * (and `file:` URLs) are routed through the same resolution markdown images
 * use — `resolveLink` → `convertFileSrc(path, "localimg")` — so export
 * inlining (`export/image-src.ts`) and the Rust-side asset scope rules apply
 * unchanged. Cache-busting is the Viewer's job (`bustImageCache` covers SVG
 * `<image>` hrefs too).
 */
const PASS_THROUGH = /^(data:|blob:|https?:|localimg:|asset:)/i;

function fileUrlToPath(href: string): string {
  let path = decodeURIComponent(href.replace(/^file:\/\//i, ""));
  // file:///C:/x arrives as "/C:/x" — drop the slash before a drive letter.
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

function toLocalimgHref(path: string): string {
  return convertFileSrc(path, "localimg");
}

/**
 * Resolve one raw image href to its display URL. Pure string work plus
 * `resolveLink`/`convertFileSrc` — unit-tested with the tauri-core mock.
 */
export function resolveImageHref(raw: string, baseFile: string | null): string {
  const href = raw.trim();
  if (!href || PASS_THROUGH.test(href)) return href;
  if (/^file:\/\//i.test(href)) return toLocalimgHref(fileUrlToPath(href));
  const resolved = resolveLink(baseFile, href);
  return resolved.kind === "local-path" ? toLocalimgHref(resolved.path) : href;
}

/**
 * Rewrite every `<image>` href in an SVG document in place. Vega emits
 * image URLs as `xlink:href`; `href` is handled too (SVG 2 consumers).
 */
export function rewriteImageHrefs(
  root: SVGSVGElement,
  baseFile: string | null,
): void {
  for (const image of root.querySelectorAll("image")) {
    for (const attr of ["href", "xlink:href"]) {
      const raw = image.getAttribute(attr);
      if (!raw) continue;
      const resolved = resolveImageHref(raw, baseFile);
      if (resolved !== raw) image.setAttribute(attr, resolved);
    }
  }
}
