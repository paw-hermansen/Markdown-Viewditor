/**
 * ODF-specific highlighting glue: hljs spans → `<text:span>` XML with
 * automatic character styles. The span extraction and color palette live in
 * `../highlight.ts` and are re-exported here so ODT call sites keep their
 * import paths.
 */
import { escapeXml } from "$lib/utils/escape";
import { escWithSpaces } from "./utils";
import type { HljsSpan } from "../highlight";

export { HLJS_COLORS, hljsToSpans, type HljsSpan } from "../highlight";

export function renderHighlightedLine(
  line: string,
  spans: HljsSpan[],
  styles: Map<string, string>,
): string {
  let xml = "";
  let srcPos = 0;
  for (const span of spans) {
    if (srcPos >= line.length) break;
    const spanText = span.text;
    const takeLen = Math.min(spanText.length, line.length - srcPos);

    if (takeLen <= 0) continue;

    const chunk = line.slice(srcPos, srcPos + takeLen);
    const escFn = srcPos === 0 ? escWithSpaces : escapeXml;

    if (span.color) {
      const safeName = `T_hljs_${span.color.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (!styles.has(safeName)) {
        styles.set(
          safeName,
          `<style:style style:name="${safeName}" style:family="text"><style:text-properties fo:color="${escapeXml(span.color)}"/></style:style>`,
        );
      }
      xml += `<text:span text:style-name="${safeName}">${escFn(chunk)}</text:span>`;
    } else {
      xml += escFn(chunk);
    }
    srcPos += takeLen;
  }

  if (srcPos < line.length) {
    const escFn = srcPos === 0 ? escWithSpaces : escapeXml;
    xml += escFn(line.slice(srcPos));
  }

  return xml;
}
