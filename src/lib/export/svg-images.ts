import { extractLocalImgPath, mimeFromHref } from "./image-src";
import type { InvokeImpl } from "./assets";

/**
 * Inline `localimg://` / `asset://` image hrefs inside an SVG document to
 * `data:` URIs before it is embedded in a self-contained export (ODT/DOCX
 * vector embeds). The SVG's `<image>` hrefs point at the localimg protocol,
 * which only the app's webview can resolve — LibreOffice/Word would show
 * broken images. Rasterization paths (SVG→PNG via the webview) resolve
 * localimg fine and do not need this pass.
 *
 * Everything else (http(s), data:, blob:) passes through untouched.
 */
const LOCAL_HREF_RE =
  /^((localimg|asset):|https?:\/\/(localhost|localimg\.localhost|asset\.localhost)\/)/i;
const IMAGE_HREF_RE = /(<image\s[^>]*?(?:xlink:)?href=["'])([^"']+)(["'])/gi;

export async function inlineSvgImageHrefs(
  svgXml: string,
  invokeImpl: InvokeImpl,
): Promise<{ svg: string; warnings: string[] }> {
  const warnings: string[] = [];
  const matches = [...svgXml.matchAll(IMAGE_HREF_RE)];
  const uniqueSrcs = [
    ...new Set(
      matches.map((m) => m[2]).filter((src) => LOCAL_HREF_RE.test(src)),
    ),
  ];
  if (uniqueSrcs.length === 0) return { svg: svgXml, warnings };

  let out = svgXml;
  for (const src of uniqueSrcs) {
    const localPath = extractLocalImgPath(src);
    if (!localPath) continue;
    try {
      const base64 = (await invokeImpl("read_file_as_base64", {
        path: localPath,
      })) as string;
      const dataUri = `data:${mimeFromHref(localPath)};base64,${base64}`;
      // Safe: localimg/asset URLs are protocol-prefixed and unique enough
      // that a split/join cannot hit unrelated substrings (the assets.ts
      // inlining convention).
      out = out.split(src).join(dataUri);
    } catch (err) {
      warnings.push(
        `Image ${localPath} could not be inlined: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { svg: out, warnings };
}
