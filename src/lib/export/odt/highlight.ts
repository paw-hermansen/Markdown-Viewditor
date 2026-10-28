import hljs from "highlight.js";
import { escapeXml } from "$lib/utils/escape";
import { decodeHtmlEntities, escWithSpaces } from "./utils";

export const HLJS_COLORS: Record<string, string> = {
  "hljs-keyword": "#d73a49",
  "hljs-doctag": "#d73a49",
  "hljs-template-tag": "#d73a49",
  "hljs-template-variable": "#d73a49",
  "hljs-type": "#d73a49",
  "hljs-variable.language_": "#d73a49",
  "hljs-title": "#6f42c1",
  "hljs-title.class_": "#6f42c1",
  "hljs-title.class_.inherited__": "#6f42c1",
  "hljs-title.function_": "#6f42c1",
  "hljs-attr": "#005cc5",
  "hljs-attribute": "#005cc5",
  "hljs-literal": "#005cc5",
  "hljs-meta": "#005cc5",
  "hljs-number": "#005cc5",
  "hljs-operator": "#005cc5",
  "hljs-variable": "#005cc5",
  "hljs-selector-attr": "#005cc5",
  "hljs-selector-class": "#005cc5",
  "hljs-selector-id": "#005cc5",
  "hljs-regexp": "#032f62",
  "hljs-string": "#032f62",
  "hljs-meta .hljs-string": "#032f62",
  "hljs-built_in": "#e36209",
  "hljs-symbol": "#e36209",
  "hljs-comment": "#6a737d",
  "hljs-code": "#6a737d",
  "hljs-formula": "#6a737d",
  "hljs-name": "#22863a",
  "hljs-quote": "#22863a",
  "hljs-selector-tag": "#22863a",
  "hljs-selector-pseudo": "#22863a",
  "hljs-subst": "#24292e",
  "hljs-section": "#005cc5",
  "hljs-bullet": "#735c0f",
};

export interface HljsSpan {
  text: string;
  color: string | null;
}

export function hljsToSpans(code: string, language: string): HljsSpan[] {
  let result: { value: string };
  try {
    result = language
      ? hljs.highlight(code, { language })
      : hljs.highlightAuto(code);
  } catch {
    return [{ text: code, color: null }];
  }

  const spans: HljsSpan[] = [];
  const tagRe = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(result.value)) !== null) {
    if (m[2] !== undefined) {
      spans.push({
        text: decodeHtmlEntities(m[2]),
        color:
          stack.length > 0
            ? (HLJS_COLORS[stack[stack.length - 1]] ?? null)
            : null,
      });
    } else if (m[0] === "</span>") {
      stack.pop();
    } else if (m[1]) {
      stack.push(m[1]);
    }
  }
  return spans;
}

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
