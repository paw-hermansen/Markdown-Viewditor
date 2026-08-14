/**
 * ODT exporter — produces an OASIS Open Document Format (.odt) file.
 *
 * Always uses neutral / printer-friendly style (ignores the selected theme).
 * Math is rendered to MathML via KaTeX and embedded as Object sub-packages.
 * Code blocks use syntax highlighting with printer-friendly colors.
 *
 * The file is assembled from raw ODF XML and packaged with jszip.
 */

import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import hljs from "highlight.js";
import type Token from "markdown-it/lib/token.mjs";
import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import { renderMathToMathml, renderMathToPng } from "../math-render";
import { rasterizeSvg } from "../svg-rasterize";
import { fileState } from "$lib/stores/file.svelte";

/* ─────────────────────── option ids / helpers ─────────────────────────── */

export const OPTION_RASTERIZE_MATH = "odt.rasterizeMath";
export const OPTION_RASTERIZE_SVG = "odt.rasterizeSvg";
export const OPTION_RASTER_RESOLUTION = "odt.rasterResolution";

export interface ExportOptions {
  [OPTION_RASTERIZE_MATH]?: boolean;
  [OPTION_RASTERIZE_SVG]?: boolean;
  [OPTION_RASTER_RESOLUTION]?: 1 | 2 | 3 | 4;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asRes(v: unknown, fallback: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : fallback;
}

function readOptions(opts: Record<string, unknown> | undefined): ExportOptions {
  return {
    [OPTION_RASTERIZE_MATH]: asBool(opts?.[OPTION_RASTERIZE_MATH], false),
    [OPTION_RASTERIZE_SVG]: asBool(opts?.[OPTION_RASTERIZE_SVG], false),
    [OPTION_RASTER_RESOLUTION]: asRes(opts?.[OPTION_RASTER_RESOLUTION], 2),
  };
}

/**
 * Declare the per-export option groups the confirmation dialog renders.
 * Empty for non-ODT exporters (HTML/PDF return `[]`).
 */
export function odtOptionGroups(ctx: ExportContext): OptionGroup[] {
  // We only declare the shape of options today; future per-export logic
  // (e.g. size-aware defaults) can read from `ctx` without an API change.
  void ctx;
  return [
    {
      id: "math",
      label: "Math formulas",
      options: [
        {
          id: OPTION_RASTERIZE_MATH,
          label: "Rasterize as PNG images",
          hint: "Smaller file, renders everywhere. Native MathML is editable in LibreOffice but may not render in all viewers.",
          kind: "toggle",
          value: false,
        },
      ],
    },
    {
      id: "svg",
      label: "SVG images",
      options: [
        {
          id: OPTION_RASTERIZE_SVG,
          label: "Rasterize as PNG images",
          hint: "Applies to inline <svg>, <img src=*.svg>, and markdown ![…](*.svg). PNG: wider compatibility. SVG: vector, may not render in all viewers.",
          kind: "toggle",
          value: false,
        },
      ],
    },
    {
      id: "resolution",
      label: "Image resolution",
      options: [
        {
          id: OPTION_RASTER_RESOLUTION,
          label: "Resolution",
          hint: "Applies only when math or SVG rasterization is on. Higher = sharper print, larger file.",
          kind: "select",
          value: 2,
          choices: [
            { value: 1, label: "1× (96 DPI)" },
            { value: 2, label: "2× (192 DPI)" },
            { value: 3, label: "3× (288 DPI)" },
            { value: 4, label: "4× (384 DPI)" },
          ],
          disabledWhen: (current) =>
            !current[OPTION_RASTERIZE_MATH] && !current[OPTION_RASTERIZE_SVG],
        },
      ],
    },
  ];
}

/* ─────────────────────── hljs color map (printer-friendly theme) ──────── */

const HLJS_COLORS: Record<string, string> = {
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

/* ─────────────────────── ODF style names ──────────────────────────────── */

const S = {
  heading: (level: number) => `Heading_20_${level}`,
  body: "Text_20_body",
  pre: "Preformatted_20_Text",
  quote: (level: number) => `Blockquote_20_${level}`,
  listBullet: "BulletList",
  listNumber: "NumberList",
  listTask: "TaskList",
  cell: "Table_20_Contents",
  cellHead: "Table_20_Heading",
  mathDisplay: "Math_20_Display",
} as const;

/* ─────────────────────── XML escaping ─────────────────────────────────── */

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
}

/* ─────────────────────── leading-space ODF encoding ───────────────────── */

function escWithSpaces(s: string | null | undefined): string {
  if (s == null) return "";
  const str = String(s);
  // Count leading spaces and encode them as <text:s/> elements
  const match = str.match(/^( +)/);
  if (!match) return esc(str);
  const leadingCount = match[1].length;
  const rest = str.slice(leadingCount);
  return `<text:s text:c="${leadingCount}"/>${esc(rest)}`;
}

/* ─────────────────────── hljs → ODF span conversion ──────────────────── */

interface HljsSpan {
  text: string;
  color: string | null;
}

function hljsToSpans(code: string, language: string): HljsSpan[] {
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
        text: m[2],
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

function renderHighlightedLine(
  line: string,
  spans: HljsSpan[],
  styles: Map<string, string>,
): string {
  let xml = "";
  // Walk through spans, emitting each as a chunk.
  // hljsToSpans extracts text from the highlighted HTML, which matches
  // the source code exactly (hljs preserves the original text).
  // We map spans to source characters by position.
  let srcPos = 0;
  for (const span of spans) {
    if (srcPos >= line.length) break;
    const spanText = span.text;
    const takeLen = Math.min(spanText.length, line.length - srcPos);

    if (takeLen <= 0) continue;

    if (span.color) {
      const safeName = `T_hljs_${span.color.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (!styles.has(safeName)) {
        styles.set(
          safeName,
          `<style:style style:name="${safeName}" style:family="text"><style:text-properties fo:color="${esc(span.color)}"/></style:style>`,
        );
      }
      xml += `<text:span text:style-name="${safeName}">${esc(line.slice(srcPos, srcPos + takeLen))}</text:span>`;
    } else {
      xml += esc(line.slice(srcPos, srcPos + takeLen));
    }
    srcPos += takeLen;
  }

  // Remaining characters not covered by spans
  if (srcPos < line.length) {
    xml += esc(line.slice(srcPos));
  }

  return xml;
}

/* ─────────────────────── image resolution ────────────────────────────── */

type InvokeImpl = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

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

function mimeFromHref(href: string): string {
  const ext = href.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
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

function extensionFromMime(mime: string): string {
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

interface ResolvedImage {
  name: string;
  mime: string;
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
}

function sniffSvgDimensions(
  data: Uint8Array,
  src: string,
  warnings: string[],
): { width: number; height: number } | null {
  const chunkSize = Math.min(data.length, 8192);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    data.slice(0, chunkSize),
  );

  const tagMatch = text.match(/<svg\b[^>]*>/is);
  if (!tagMatch) {
    warnings.push(`SVG ${src} could not be parsed for dimensions`);
    return null;
  }

  const tag = tagMatch[0];

  function attr(name: string): string | null {
    const re = new RegExp(
      `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    );
    const m = tag.match(re);
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  }

  function parseDim(
    raw: string | null,
  ): { value: number; isPercent: boolean } | null {
    if (!raw) return null;
    const m = raw
      .trim()
      .match(/^([+-]?\d*\.?\d+)(%|px|pt|in|cm|mm|pc|em|ex|ch|rem)?$/i);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "%") return { value: num, isPercent: true };
    switch (unit) {
      case "px":
        return { value: num, isPercent: false };
      case "in":
        return { value: num * 96, isPercent: false };
      case "cm":
        return { value: num * (96 / 2.54), isPercent: false };
      case "mm":
        return { value: num * (96 / 25.4), isPercent: false };
      case "pt":
        return { value: num * (96 / 72), isPercent: false };
      case "pc":
        return { value: num * 16, isPercent: false };
      default:
        return { value: num, isPercent: false };
    }
  }

  const w = parseDim(attr("width"));
  const h = parseDim(attr("height"));

  if ((w && w.isPercent) || (h && h.isPercent)) {
    warnings.push(
      `SVG ${src} uses percentage dimensions \u2014 cannot determine absolute size for ODT export`,
    );
    return null;
  }

  if (w && !w.isPercent && h && !h.isPercent) {
    return { width: Math.round(w.value), height: Math.round(h.value) };
  }

  const vb = attr("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const vbW = parseFloat(parts[2]);
      const vbH = parseFloat(parts[3]);
      if (!isNaN(vbW) && !isNaN(vbH) && vbW > 0 && vbH > 0) {
        if (w && !w.isPercent) {
          const scale = w.value / vbW;
          return {
            width: Math.round(w.value),
            height: Math.round(vbH * scale),
          };
        }
        if (h && !h.isPercent) {
          const scale = h.value / vbH;
          return {
            width: Math.round(vbW * scale),
            height: Math.round(h.value),
          };
        }
        return { width: Math.round(vbW), height: Math.round(vbH) };
      }
    }
  }

  if (w || h) {
    warnings.push(
      `SVG ${src} has only one dimension without viewBox \u2014 cannot determine aspect ratio for ODT export`,
    );
    return null;
  }

  warnings.push(
    `SVG ${src} lacks width, height, or viewBox \u2014 may not render correctly in ODT`,
  );
  return null;
}

function sniffImageDimensions(
  data: Uint8Array,
  mime: string,
  src: string,
  warnings: string[],
): {
  width: number;
  height: number;
} {
  if (mime === "image/svg+xml") {
    return sniffSvgDimensions(data, src, warnings) ?? { width: 0, height: 0 };
  }
  // PNG: IHDR chunk at offset 8, width 4 bytes BE at 16, height at 20
  if (mime === "image/png" && data.length > 24) {
    return {
      width: (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19],
      height: (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23],
    };
  }
  // GIF: width 2 bytes LE at 6, height at 8
  if (mime === "image/gif" && data.length > 9) {
    return {
      width: data[6] | (data[7] << 8),
      height: data[8] | (data[9] << 8),
    };
  }
  // JPEG: scan for SOF marker
  if (mime === "image/jpeg" && data.length > 4) {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: (data[offset + 5] << 8) | data[offset + 6],
          width: (data[offset + 7] << 8) | data[offset + 8],
        };
      }
      const segLen = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + segLen;
    }
  }
  return { width: 0, height: 0 };
}

async function resolveImage(
  src: string,
  invokeImpl: InvokeImpl,
  images: Map<string, ResolvedImage>,
  imageCounter: { n: number },
  warnings: string[],
): Promise<string> {
  if (images.has(src)) return images.get(src)!.name;

  let bytes: Uint8Array | null = null;
  let mime = "image/png";

  const localPath = extractLocalImgPath(src);
  if (localPath) {
    try {
      const base64 = (await invokeImpl("read_file_as_base64", {
        path: localPath,
      })) as string;
      mime = mimeFromHref(localPath);
      bytes = base64ToBytes(base64);
    } catch (err) {
      warnings.push(
        `Image ${localPath} could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
      return src;
    }
  } else if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mime = match[1];
      bytes = base64ToBytes(match[2]);
    }
  } else if (/^https?:\/\//.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        mime = res.headers.get("content-type") ?? mimeFromHref(src);
        bytes = new Uint8Array(await res.arrayBuffer());
      } else {
        warnings.push(`Image ${src} returned ${res.status}`);
      }
    } catch (err) {
      warnings.push(
        `Image ${src} could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Relative path (e.g., ./ai_flower.png, image/foo.png) — resolve
    // against the current file's directory.
    const currentFile = fileState.currentFile;
    if (currentFile) {
      const dir = currentFile.replace(/[/\\][^/\\]+$/, "");
      // Decode URL-encoded characters (e.g., %20 → space)
      const decodedSrc = decodeURIComponent(src);
      // Normalize: strip leading ./ or .\
      const normalized = decodedSrc.replace(/^\.[/\\]/, "");
      const absPath = `${dir}/${normalized}`;
      try {
        const base64 = (await invokeImpl("read_file_as_base64", {
          path: absPath,
        })) as string;
        mime = mimeFromHref(absPath);
        bytes = base64ToBytes(base64);
      } catch (err) {
        warnings.push(
          `Image ${absPath} could not be read: ${err instanceof Error ? err.message : String(err)}`,
        );
        return src;
      }
    }
  }

  if (!bytes) return src;

  const ext = extensionFromMime(mime);
  const name = `Pictures/image${imageCounter.n++}.${ext}`;
  const dims = sniffImageDimensions(bytes, mime, src, warnings);
  images.set(name, {
    name,
    mime,
    data: bytes,
    widthPx: dims.width,
    heightPx: dims.height,
  });
  return name;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ─────────────────────── ODF XML templates ───────────────────────────── */

function generateMimetype(): string {
  return "application/vnd.oasis.opendocument.text";
}

function generateMetaXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.2">
  <office:meta>
    <meta:generator>Markdown Viewditor</meta:generator>
${title ? `    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${esc(title)}</dc:title>` : ""}
  </office:meta>
</office:document-meta>`;
}

function generateListStyles(): string {
  const INDENT = 0.5; // cm per level

  // Bullet characters — cycle through these round-robin for levels 1-9
  const bulletChars = ["•", "◦", "▪", "▫", "■", "○", "◘", "◙", "◦"];
  // Ordered numbering formats — cycle through these round-robin
  const orderedFormats: { format: string; suffix: string }[] = [
    { format: "1", suffix: "." },
    { format: "a", suffix: "." },
    { format: "A", suffix: "." },
    { format: "i", suffix: "." },
    { format: "I", suffix: "." },
    { format: "1", suffix: ")" },
    { format: "a", suffix: ")" },
    { format: "A", suffix: ")" },
    { format: "i", suffix: ")" },
  ];

  function levelProps(level: number): string {
    const spaceBefore = `${(level * INDENT).toFixed(1)}cm`;
    return `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${spaceBefore}" fo:text-indent="-0.5cm" fo:margin-left="${spaceBefore}"/></style:list-level-properties>`;
  }

  function bulletLevel(level: number, char: string): string {
    return `    <text:list-level-style-bullet text:level="${level}" text:bullet-char="${char}">
      ${levelProps(level)}
    </text:list-level-style-bullet>`;
  }

  function numberLevel(level: number, format: string, suffix: string): string {
    return `    <text:list-level-style-number text:level="${level}" style:num-format="${format}" style:num-suffix="${suffix}">
      ${levelProps(level)}
    </text:list-level-style-number>`;
  }

  const bulletLevels = Array.from({ length: 9 }, (_, i) =>
    bulletLevel(i + 1, bulletChars[i]),
  ).join("\n");

  const numberLevels = Array.from({ length: 9 }, (_, i) => {
    const f = orderedFormats[i];
    return numberLevel(i + 1, f.format, f.suffix);
  }).join("\n");

  const taskLevels = Array.from({ length: 9 }, (_, i) =>
    bulletLevel(i + 1, " "),
  ).join("\n");

  return `<text:list-style style:name="${S.listBullet}">
${bulletLevels}
  </text:list-style>
  <text:list-style style:name="${S.listNumber}">
${numberLevels}
  </text:list-style>
  <text:list-style style:name="${S.listTask}">
${taskLevels}
  </text:list-style>`;
}

function generateTextStyles(): string {
  const flagCombos = [
    "P",
    "B",
    "I",
    "U",
    "S",
    "BI",
    "BU",
    "BS",
    "IU",
    "IS",
    "US",
    "BIU",
    "BIS",
    "BUS",
    "IUS",
    "BIUS",
  ];
  const positions = [
    { suffix: "", sub: false, sup: false },
    { suffix: "_sub", sub: true, sup: false },
    { suffix: "_sup", sub: false, sup: true },
  ];

  const styles: string[] = [];
  for (const combo of flagCombos) {
    for (const pos of positions) {
      let props = "";
      if (combo.includes("B")) props += ' fo:font-weight="bold"';
      if (combo.includes("I")) props += ' fo:font-style="italic"';
      if (combo.includes("U"))
        props +=
          ' style:text-underline-style="solid" style:text-underline-type="single"';
      if (combo.includes("S"))
        props +=
          ' style:text-line-through-style="solid" style:text-line-through-type="single"';
      if (pos.sub) props += ' style:text-position="sub 58%"';
      if (pos.sup) props += ' style:text-position="super 58%"';

      styles.push(
        `    <style:style style:name="Char_${combo}${pos.suffix}" style:family="text"><style:text-properties${props}/></style:style>`,
      );
    }
  }

  return styles.join("\n");
}

function generateStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:text-properties
        fo:font-family="sans-serif"
        fo:font-size="10pt"
        style:font-family-generic="swiss"
        fo:language="en" fo:country="US"/>
    </style:default-style>
    <style:style style:name="Standard" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-bottom="0.04in"/>
    </style:style>
    <style:style style:name="${S.body}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.08in" fo:margin-bottom="0.08in"/>
    </style:style>
    <style:style style:name="${S.mathDisplay}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.16in" fo:margin-bottom="0.16in"/>
    </style:style>
    ${[1, 2, 3, 4, 5, 6]
      .map(
        (l) => `
    <style:style style:name="${S.heading(l)}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="${l === 1 ? "0.4in" : "0.2in"}" fo:margin-bottom="0.1in"/>
      <style:text-properties
        fo:font-size="${l === 1 ? "24pt" : l === 2 ? "18pt" : l === 3 ? "14pt" : "12pt"}"
        fo:font-weight="bold"
        style:font-family-generic="swiss"/>
    </style:style>`,
      )
      .join("")}
    <style:style style:name="${S.pre}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0"
        fo:background-color="#f6f8fa" fo:padding="0.1in"/>
      <style:text-properties
        fo:font-family="monospace"
        fo:font-size="9pt"
        style:font-family-generic="modern"/>
    </style:style>
${Array.from({ length: 9 }, (_, i) => {
  const lvl = i + 1;
  const marginLeft = ((lvl - 1) * 0.4).toFixed(4);
  return `
    <style:style style:name="${S.quote(lvl)}" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-left="${marginLeft}in"
        fo:margin-top="0.05in"
        fo:margin-bottom="0.05in"/>
      <style:text-properties fo:color="#656d76"/>
    </style:style>`;
}).join("")}
    <style:style style:name="QuoteTable" style:family="table">
      <style:table-properties
        fo:margin-left="0.4000in"
        fo:padding-left="0.1000in"
        fo:margin-right="0.4000in"
        fo:margin-top="0.05in"
        fo:margin-bottom="0.05in"/>
    </style:style>
    <style:style style:name="QuoteTableCell" style:family="table-cell">
      <style:table-cell-properties
        fo:border-top="none"
        fo:border-bottom="none"
        fo:border-right="none"
        fo:border-left="2pt solid #d1d9e0"
        fo:padding-left="0.1000in"
        fo:padding-top="0"
        fo:padding-bottom="0"
        fo:padding-right="0"
        fo:background-color="#f6f8fa"/>
    </style:style>
${Array.from({ length: 9 }, (_, i) => {
  const lvl = i + 1;
  const marginLeft = ((lvl - 1) * 0.4).toFixed(4);
  return `
    <style:style style:name="QuoteList_20_${lvl}" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-left="${marginLeft}in"
        fo:margin-top="0"
        fo:margin-bottom="0"/>
      <style:text-properties fo:color="#656d76"/>
    </style:style>`;
}).join("")}
    ${generateListStyles()}
    <style:style style:name="${S.cell}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.05in"/>
    </style:style>
    <style:style style:name="${S.cellHead}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.05in"/>
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Horizontal_20_Rule" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-top="0.2in" fo:margin-bottom="0.2in"
        fo:border-bottom="1pt solid #d1d9e0"/>
      <style:text-properties fo:font-size="1pt"/>
    </style:style>
    <style:style style:name="Formula" style:family="graphic">
      <style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text"/>
    </style:style>
    <style:style style:name="Graphics" style:family="graphic">
      <style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/>
    </style:style>
    ${generateTextStyles()}
    <style:style style:name="T_link" style:family="text"><style:text-properties fo:color="#0969da" style:text-underline-type="solid" style:text-underline-style="solid"/></style:style>
    <style:style style:name="T4" style:family="text"><style:text-properties fo:font-family="monospace" style:font-family-generic="modern" fo:background-color="#f6f8fa"/></style:style>
    <style:style style:name="T_kbd" style:family="text"><style:text-properties fo:font-family="monospace" style:font-family-generic="modern" fo:background-color="#f0f0f0" fo:padding="0.02in 0.04in" fo:border="0.5pt solid #ccc"/></style:style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="Mpm1">
      <style:page-layout-properties
        fo:margin-top="1in" fo:margin-bottom="1in"
        fo:margin-left="1in" fo:margin-right="1in"/>
    </style:page-layout>
    <style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics">
      <style:graphic-properties style:horizontal-pos="center" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="baseline" style:mirror="none" fo:clip="rect(0in, 0in, 0in, 0in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>
    </style:style>
    <style:style style:name="Grf1" style:family="graphic" style:parent-style-name="Graphics">
      <style:graphic-properties style:horizontal-pos="center" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="baseline" style:mirror="none" fo:clip="rect(0in, 0in, 0in, 0in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>
    </style:style>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>
  </office:master-styles>
</office:document-styles>`;
}

interface AutomaticStyle {
  name: string;
  xml: string;
}

interface MathObject {
  id: string;
  mathml: string;
}

function generateContentXml(
  bodyElements: string,
  automaticStyles: AutomaticStyle[],
): string {
  const stylesBlock = automaticStyles.map((s) => `    ${s.xml}`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:math="http://www.w3.org/1998/Math/MathML"
  office:version="1.2">
  <office:automatic-styles>
${stylesBlock}
  </office:automatic-styles>
  <office:body>
    <office:text>
${bodyElements}
    </office:text>
  </office:body>
</office:document-content>`;
}

interface ManifestEntry {
  fullPath: string;
  mediaType: string;
}

function generateManifestXml(entries: ManifestEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `    <manifest:file-entry manifest:full-path="${esc(e.fullPath)}" manifest:media-type="${esc(e.mediaType)}"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest
  xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"
  manifest:version="1.2">
    <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text" manifest:version="1.2"/>
${items}
</manifest:manifest>`;
}

type ListKind = "bullet" | "number" | "task";

/** Return the named style for a list kind. */
function listStyleName(kind: ListKind): string {
  return kind === "bullet"
    ? S.listBullet
    : kind === "number"
      ? S.listNumber
      : S.listTask;
}

/* ─────────────────────── Document builder ────────────────────────────── */

interface BuildResult {
  bodyXml: string;
  autoStyles: AutomaticStyle[];
  images: Map<string, ResolvedImage>;
  mathObjects: MathObject[];
}

async function buildDocument(
  tokens: Token[],
  invokeImpl: InvokeImpl,
  warnings: string[],
  options: ExportOptions,
): Promise<BuildResult> {
  const autoStyles: Map<string, string> = new Map();
  const images = new Map<string, ResolvedImage>();
  const imageCounter = { n: 1 };
  const mathObjects: MathObject[] = [];
  let mathCounter = 0;
  const footnoteBodies = new Map<string, string>();

  const rasterizeMath = !!options[OPTION_RASTERIZE_MATH];
  const rasterizeSvgFlag = !!options[OPTION_RASTERIZE_SVG];
  const rasterScale = options[OPTION_RASTER_RESOLUTION] ?? 2;

  // ── inline formatter state ──
  let boldActive = false;
  let italicActive = false;
  let underlineActive = false;
  let strikeActive = false;
  let linkHref: string | null = null;
  let subActive = false;
  let superActive = false;

  // ── context stack ──
  type ContextType =
    "blockquote" | "bullet_list" | "ordered_list" | "task_list";
  const contextStack: ContextType[] = [];

  function ensureAutoStyle(name: string, xml: string): void {
    if (!autoStyles.has(name)) {
      autoStyles.set(name, xml);
    }
  }

  function wrapSpan(text: string, styleName: string): string {
    return `<text:span text:style-name="${esc(styleName)}">${esc(text)}</text:span>`;
  }

  function currentTextStyle(): string | null {
    let flags = "";
    if (boldActive) flags += "B";
    if (italicActive) flags += "I";
    if (underlineActive) flags += "U";
    if (strikeActive) flags += "S";
    if (flags === "") flags = "P";

    let position = "";
    if (subActive) position = "_sub";
    else if (superActive) position = "_sup";

    if (flags === "P" && position === "") return null;

    return `Char_${flags}${position}`;
  }

  /** Register a rasterized PNG (post rasterization helper). */
  function addRasterImage(
    data: Uint8Array,
    widthPx: number,
    heightPx: number,
    srcLabel: string,
  ): string {
    const name = `Pictures/image${imageCounter.n++}.png`;
    images.set(name, {
      name,
      mime: "image/png",
      data,
      widthPx,
      heightPx,
    });
    let sizeAttrs = "";
    if (widthPx > 0 && heightPx > 0) {
      sizeAttrs = ` svg:width="${(widthPx / 96).toFixed(4)}in" svg:height="${(heightPx / 96).toFixed(4)}in"`;
    }
    void srcLabel;
    return `<draw:frame draw:style-name="fr1" draw:name="${esc(name)}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${esc(name)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/></draw:frame>`;
  }

  /** Add a raw SVG as a Pictures/ entry and return its ODF XML. */
  function addSvgImage(
    svgXml: string,
    dims: { width: number; height: number },
    srcLabel: string,
  ): string {
    const bytes = new TextEncoder().encode(svgXml);
    const name = `Pictures/image${imageCounter.n++}.svg`;
    images.set(name, {
      name,
      mime: "image/svg+xml",
      data: bytes,
      widthPx: dims.width,
      heightPx: dims.height,
    });
    let sizeAttrs = "";
    if (dims.width > 0 && dims.height > 0) {
      sizeAttrs = ` svg:width="${(dims.width / 96).toFixed(4)}in" svg:height="${(dims.height / 96).toFixed(4)}in"`;
    }
    void srcLabel;
    return `<draw:frame draw:style-name="fr1" draw:name="${esc(name)}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${esc(name)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/svg+xml"/></draw:frame>`;
  }

  /**
   * Convert an SVG to PNG if the rasterizeSvg option is on and the SVG has
   * parseable dimensions. Returns the resulting XML on success or null on
   * failure (caller falls back to the vector SVG).
   */
  async function tryRasterizeSvg(
    svgXml: string,
    dims: { width: number; height: number },
    srcLabel: string,
  ): Promise<string | null> {
    if (!rasterizeSvgFlag) return null;
    if (dims.width <= 0 || dims.height <= 0) {
      warnings.push(
        `SVG ${srcLabel}: cannot rasterize without dimensions; embedded as vector SVG.`,
      );
      return null;
    }
    try {
      const png = await rasterizeSvg(
        svgXml,
        dims.width,
        dims.height,
        rasterScale,
      );
      return addRasterImage(png, dims.width, dims.height, srcLabel);
    } catch (err) {
      warnings.push(
        `SVG ${srcLabel} rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  function paragraphStyle(): string {
    let quoteDepth = 0;
    for (let j = 0; j < contextStack.length; j++) {
      if (contextStack[j] === "blockquote") quoteDepth++;
    }
    if (quoteDepth > 0) return S.quote(Math.min(quoteDepth, 9));
    return S.body;
  }

  function listItemParagraphStyle(): string {
    let quoteDepth = 0;
    for (let j = 0; j < contextStack.length; j++) {
      if (contextStack[j] === "blockquote") quoteDepth++;
    }
    return quoteDepth > 0
      ? `QuoteList_20_${Math.min(quoteDepth, 9)}`
      : "Standard";
  }

  /** Detect inline SVG in markdown-it text/softbreak tokens and reassemble. */
  function tryExtractInlineSvg(
    children: Token[],
    start: number,
  ): { svgXml: string; consumedCount: number } | null {
    const first = children[start];
    if (!first || first.type !== "text") return null;
    const trimmed = first.content.trimStart();
    if (!/^<svg\b/i.test(trimmed)) return null;

    let svgXml = first.content;
    let consumed = 1;

    if (/<\/svg>\s*$/i.test(svgXml)) {
      return { svgXml: svgXml.trim(), consumedCount: consumed };
    }

    for (let j = start + 1; j < children.length; j++) {
      const t = children[j];
      if (t.type === "softbreak") {
        svgXml += "\n";
      } else if (t.type === "text") {
        svgXml += t.content;
      } else {
        return null;
      }
      consumed++;
      if (/<\/svg>/i.test(t.content)) break;
      if (consumed > 100) return null;
    }

    if (!/<\/svg>/i.test(svgXml)) return null;
    return { svgXml: svgXml.trim(), consumedCount: consumed };
  }

  /** Detect inline SVG from html_inline token sequence (html:true mode). */
  function tryExtractInlineHtmlSvg(
    children: Token[],
    start: number,
  ): { svgXml: string; consumedCount: number } | null {
    const first = children[start];
    if (!first || first.type !== "html_inline") return null;
    const trimmed = first.content.trimStart();
    if (!/^<svg\b/i.test(trimmed)) return null;

    let svgXml = first.content;
    let consumed = 1;

    if (/<\/svg>\s*$/i.test(svgXml)) {
      return { svgXml: svgXml.trim(), consumedCount: consumed };
    }

    for (let j = start + 1; j < children.length; j++) {
      const t = children[j];
      if (t.type === "html_inline") {
        svgXml += t.content;
      } else if (t.type === "softbreak") {
        svgXml += "\n";
      } else {
        return null;
      }
      consumed++;
      if (/<\/svg>/i.test(t.content)) break;
      if (consumed > 100) return null;
    }

    if (!/<\/svg>/i.test(svgXml)) return null;
    return { svgXml: svgXml.trim(), consumedCount: consumed };
  }

  // ── render inline children into an XML string ──
  async function renderInline(children: Token[]): Promise<string> {
    let xml = "";
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      switch (child.type) {
        case "text": {
          const svg = tryExtractInlineSvg(children, ci);
          if (svg) {
            const label = `inline-svg(text@${ci})`;
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(svg.svgXml),
              label,
              warnings,
            ) ?? { width: 0, height: 0 };
            const rasterized = await tryRasterizeSvg(svg.svgXml, dims, label);
            xml += rasterized ?? addSvgImage(svg.svgXml, dims, label);
            ci += svg.consumedCount - 1;
            break;
          }
          if (linkHref) {
            xml += `<text:a xlink:type="simple" xlink:href="${esc(linkHref)}"><text:span text:style-name="T_link">${esc(child.content)}</text:span></text:a>`;
          } else {
            const styleName = currentTextStyle();
            if (styleName) {
              xml += wrapSpan(child.content, styleName);
            } else {
              xml += esc(child.content);
            }
          }
          break;
        }
        case "code_inline":
          xml += wrapSpan(child.content, "T4");
          break;
        case "softbreak":
          xml += " ";
          break;
        case "hardbreak":
          xml += "<text:line-break/>";
          break;
        case "em_open":
          italicActive = true;
          break;
        case "em_close":
          italicActive = false;
          break;
        case "strong_open":
          boldActive = true;
          break;
        case "strong_close":
          boldActive = false;
          break;
        case "s_open":
          strikeActive = true;
          break;
        case "s_close":
          strikeActive = false;
          break;
        case "link_open":
          linkHref = child.attrGet("href") ?? "";
          break;
        case "link_close":
          linkHref = null;
          break;
        case "image": {
          const src = child.attrGet("src") ?? "";
          const alt = child.content;
          // Check for width/height attributes from HTML img
          const widthAttr = child.attrGet("width");
          const heightAttr = child.attrGet("height");
          const resolvedSrc = await resolveImage(
            src,
            invokeImpl,
            images,
            imageCounter,
            warnings,
          );
          if (resolvedSrc !== src) {
            const img = images.get(resolvedSrc);
            // If rasterizeSvg is on and the resolved image is an SVG, swap
            // the vector file for a PNG raster.
            if (rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
              const rasterized = await tryRasterizeSvg(
                new TextDecoder().decode(img.data),
                { width: img.widthPx, height: img.heightPx },
                `image(${src})`,
              );
              if (rasterized) {
                xml += rasterized;
                // resolveImage already added the SVG to `images`; drop it
                // so it isn't packaged unused alongside its PNG raster.
                images.delete(resolvedSrc);
                break;
              }
              // Fall through to vector embed on rasterization failure.
            }
            let sizeAttrs = "";
            // Calculate dimensions from pixel size at 96 DPI (CSS reference)
            if (widthAttr) {
              const w = widthAttr.endsWith("px")
                ? (parseFloat(widthAttr) / 96).toFixed(4) + "in"
                : widthAttr;
              sizeAttrs += ` svg:width="${esc(w)}"`;
            }
            if (heightAttr) {
              const h = heightAttr.endsWith("px")
                ? (parseFloat(heightAttr) / 96).toFixed(4) + "in"
                : heightAttr;
              sizeAttrs += ` svg:height="${esc(h)}"`;
            }
            // If no explicit size, use image pixel dimensions at 96 DPI
            if (
              !widthAttr &&
              !heightAttr &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              sizeAttrs = ` svg:width="${(img.widthPx / 96).toFixed(4)}in" svg:height="${(img.heightPx / 96).toFixed(4)}in"`;
            }
            // Proportional calculation when only one dimension given
            if (
              widthAttr &&
              !heightAttr &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              const widthIn =
                parseFloat(widthAttr.endsWith("px") ? widthAttr : widthAttr) /
                96;
              const ratio = img.heightPx / img.widthPx;
              sizeAttrs += ` svg:height="${(widthIn * ratio).toFixed(4)}in"`;
            }
            if (
              !widthAttr &&
              heightAttr &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              const heightIn =
                parseFloat(
                  heightAttr.endsWith("px") ? heightAttr : heightAttr,
                ) / 96;
              const ratio = img.widthPx / img.heightPx;
              sizeAttrs = ` svg:width="${(heightIn * ratio).toFixed(4)}in"${sizeAttrs}`;
            }
            const mimeAttr = img ? ` draw:mime-type="${esc(img.mime)}"` : "";
            xml += `<draw:frame draw:style-name="fr1" draw:name="${esc(alt || "image")}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${esc(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
          } else {
            xml += `[Image: ${esc(alt || src)}]`;
          }
          break;
        }
        case "math_inline": {
          if (rasterizeMath) {
            try {
              const { png, widthPx, heightPx } = await renderMathToPng(
                child.content,
                false,
                rasterScale,
              );
              xml += addRasterImage(
                png,
                widthPx,
                heightPx,
                `inline-math(${child.content.slice(0, 40)})`,
              );
              break;
            } catch (err) {
              warnings.push(
                `Inline math rasterization failed (${err instanceof Error ? err.message : String(err)}); embedded as native formula.`,
              );
              // Fall through to MathML embedding.
            }
          }
          try {
            const mathMl = renderMathToMathml(child.content, false);
            const objId = `Object ${++mathCounter}`;
            mathObjects.push({ id: objId, mathml: mathMl });
            xml += `<draw:frame draw:style-name="fr1" draw:name="${objId}" text:anchor-type="as-char" draw:z-index="0"><draw:object xlink:href="./${objId}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
          } catch {
            warnings.push(
              `Inline math rendering failed for: ${child.content.slice(0, 50)}…`,
            );
            xml += esc(child.content);
          }
          break;
        }
        case "footnote_ref": {
          const noteId = String(child.meta?.id ?? child.meta?.label ?? "0");
          const label = child.meta?.label ?? noteId;
          const body =
            footnoteBodies.get(noteId) ??
            `<text:p text:style-name="${S.body}"/>`;
          xml += `<text:note text:note-class="footnote" text:id="ftn${esc(noteId)}"><text:note-citation>${esc(label)}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`;
          break;
        }
        case "html_inline": {
          const raw = child.content;
          const lower = raw.trim().toLowerCase();
          if (lower.startsWith("<svg")) {
            const svgRes = tryExtractInlineHtmlSvg(children, ci);
            if (svgRes) {
              const label = `html_inline-svg(text@${ci})`;
              const dims = sniffSvgDimensions(
                new TextEncoder().encode(svgRes.svgXml),
                label,
                warnings,
              ) ?? { width: 0, height: 0 };
              const rasterized = await tryRasterizeSvg(
                svgRes.svgXml,
                dims,
                label,
              );
              xml += rasterized ?? addSvgImage(svgRes.svgXml, dims, label);
              ci += svgRes.consumedCount - 1;
              break;
            }
          }
          if (lower === "<br>" || lower === "<br/>" || lower === "<br />") {
            xml += "<text:line-break/>";
          } else if (lower === "<sub>" || lower === "<sub>") {
            subActive = true;
          } else if (lower === "</sub>") {
            subActive = false;
          } else if (lower === "<sup>" || lower === "<sup>") {
            superActive = true;
          } else if (lower === "</sup>") {
            superActive = false;
          } else if (
            lower === "<del>" ||
            lower === "<s>" ||
            lower === "<strike>"
          ) {
            strikeActive = true;
          } else if (
            lower === "</del>" ||
            lower === "</s>" ||
            lower === "</strike>"
          ) {
            strikeActive = false;
          } else if (lower === "<ins>" || lower === "<u>") {
            underlineActive = true;
          } else if (lower === "</ins>" || lower === "</u>") {
            underlineActive = false;
          } else if (lower === "<b>" || lower === "<strong>") {
            boldActive = true;
          } else if (lower === "</b>" || lower === "</strong>") {
            boldActive = false;
          } else if (lower === "<i>" || lower === "<em>") {
            italicActive = true;
          } else if (lower === "</i>" || lower === "</em>") {
            italicActive = false;
          } else if (lower.startsWith("<kbd")) {
            xml += '<text:span text:style-name="T_kbd">';
          } else if (lower === "</kbd>") {
            xml += "</text:span>";
          } else if (lower.startsWith("<span")) {
            // Parse style attributes from <span style="...">
            const styleMatch = raw.match(/style\s*=\s*"([^"]*)"/i);
            if (styleMatch) {
              const cssStyle = styleMatch[1];
              const spanStyleName = `T_span_${autoStyles.size}`;
              let odfXml =
                '<style:style style:name="' +
                spanStyleName +
                '" style:family="text"><style:text-properties';
              // Parse color
              const colorMatch = cssStyle.match(/color\s*:\s*([^;]+)/i);
              if (colorMatch)
                odfXml += ` fo:color="${esc(colorMatch[1].trim())}"`;
              // Parse background-color
              const bgMatch = cssStyle.match(
                /background(?:-color)?\s*:\s*([^;]+)/i,
              );
              if (bgMatch)
                odfXml += ` fo:background-color="${esc(bgMatch[1].trim())}"`;
              // Parse font-size
              const sizeMatch = cssStyle.match(/font-size\s*:\s*([^;]+)/i);
              if (sizeMatch)
                odfXml += ` fo:font-size="${esc(sizeMatch[1].trim())}"`;
              // Parse font-family
              const familyMatch = cssStyle.match(/font-family\s*:\s*([^;]+)/i);
              if (familyMatch)
                odfXml += ` fo:font-family="${esc(familyMatch[1].trim())}"`;
              // Parse font-weight
              const weightMatch = cssStyle.match(/font-weight\s*:\s*([^;]+)/i);
              if (weightMatch)
                odfXml += ` fo:font-weight="${esc(weightMatch[1].trim())}"`;
              // Parse font-style
              const fstyleMatch = cssStyle.match(/font-style\s*:\s*([^;]+)/i);
              if (fstyleMatch)
                odfXml += ` fo:font-style="${esc(fstyleMatch[1].trim())}"`;
              // Parse text-decoration
              const decoMatch = cssStyle.match(
                /text-decoration\s*:\s*([^;]+)/i,
              );
              if (decoMatch) {
                if (decoMatch[1].includes("underline"))
                  odfXml += ' style:text-underline-type="solid"';
                if (decoMatch[1].includes("line-through"))
                  odfXml +=
                    ' style:text-line-through-style="solid" style:text-line-through-type="single"';
              }
              odfXml += "/></style:style>";
              ensureAutoStyle(spanStyleName, odfXml);
              xml += `<text:span text:style-name="${spanStyleName}">`;
            }
          } else if (lower === "</span>") {
            // Check if we have an open span style (from <span style="...">)
            // We need to close it. Simple approach: just close any open span.
            // Actually, we track this by checking if the last opened was a span.
            // For safety, just emit closing span.
            xml += "</text:span>";
          } else if (lower.startsWith("<img")) {
            // HTML <img> tag — extract src, alt, width
            const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
            const altMatch = raw.match(/alt\s*=\s*["']([^"']*)["']/i);
            const widthMatch = raw.match(/width\s*=\s*["']([^"']+)["']/i);
            const heightMatch = raw.match(/height\s*=\s*["']([^"']+)["']/i);
            if (srcMatch) {
              const src = srcMatch[1];
              const alt = altMatch?.[1] ?? "";
              const resolvedSrc = await resolveImage(
                src,
                invokeImpl,
                images,
                imageCounter,
                warnings,
              );
              if (resolvedSrc !== src) {
                const img = images.get(resolvedSrc);
                // Same rasterization branch as the markdown-image token.
                if (rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
                  const rasterized = await tryRasterizeSvg(
                    new TextDecoder().decode(img.data),
                    { width: img.widthPx, height: img.heightPx },
                    `html_img(${src})`,
                  );
                  if (rasterized) {
                    xml += rasterized;
                    // Drop the eagerly-added SVG entry so it isn't
                    // packaged unused alongside its PNG raster.
                    images.delete(resolvedSrc);
                    break;
                  }
                }
                let sizeAttrs = "";
                if (widthMatch) {
                  const w = widthMatch[1].endsWith("px")
                    ? (parseFloat(widthMatch[1]) / 96).toFixed(4) + "in"
                    : widthMatch[1];
                  sizeAttrs += ` svg:width="${esc(w)}"`;
                }
                if (heightMatch) {
                  const h = heightMatch[1].endsWith("px")
                    ? (parseFloat(heightMatch[1]) / 96).toFixed(4) + "in"
                    : heightMatch[1];
                  sizeAttrs += ` svg:height="${esc(h)}"`;
                }
                // If only width given, calculate proportional height
                if (
                  widthMatch &&
                  !heightMatch &&
                  img &&
                  img.widthPx > 0 &&
                  img.heightPx > 0
                ) {
                  const widthIn = parseFloat(widthMatch[1]) / 96;
                  const ratio = img.heightPx / img.widthPx;
                  sizeAttrs += ` svg:height="${(widthIn * ratio).toFixed(4)}in"`;
                }
                const mimeAttr = img
                  ? ` draw:mime-type="${esc(img.mime)}"`
                  : "";
                xml += `<draw:frame draw:style-name="fr1" draw:name="${esc(alt || "image")}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${esc(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
              } else {
                xml += `[Image: ${esc(alt || src)}]`;
              }
            }
          }
          // Other HTML tags are silently ignored
          break;
        }
      }
    }
    return xml;
  }

  /** Detect if a bullet list's immediate items contain task-list checkboxes. */
  function detectTaskList(innerTokens: Token[]): boolean {
    let liDepth = 0;
    for (let ti = 0; ti < innerTokens.length; ti++) {
      const t = innerTokens[ti];
      if (t.type === "list_item_open") {
        liDepth++;
        if (liDepth === 1) {
          for (let j = ti + 1; j < innerTokens.length; j++) {
            const inner = innerTokens[j];
            if (inner.type === "list_item_open") {
              const nc = findClosing(innerTokens, j, "list_item_close");
              if (nc >= 0) j = nc;
              continue;
            }
            if (
              inner.type === "bullet_list_open" ||
              inner.type === "ordered_list_open"
            ) {
              const nc = findClosing(
                innerTokens,
                j,
                inner.type.replace("_open", "_close"),
              );
              if (nc >= 0) {
                j = nc;
                continue;
              }
            }
            if (inner.type === "inline") {
              const fc = inner.children?.[0];
              if (
                fc?.type === "html_inline" &&
                fc.content.includes("task-list-item-checkbox")
              ) {
                return true;
              }
              break;
            }
            if (inner.type === "list_item_close") break;
          }
        }
      }
      if (t.type === "list_item_close") liDepth--;
    }
    return false;
  }

  /** Render the full content of a list item, including any nested lists inline. */
  async function renderListItemContent(liInner: Token[]): Promise<string> {
    // Detect checkbox prefix for task list items and strip checkbox HTML
    let checkboxPrefix = "";
    function stripCheckbox(children: Token[]): Token[] {
      return children.filter(
        (c) =>
          !(
            c.type === "html_inline" &&
            c.content.includes("task-list-item-checkbox")
          ),
      );
    }
    for (const ct of liInner) {
      if (ct.type === "inline") {
        const ch = ct.children;
        if (ch?.[0]?.type === "html_inline") {
          const html = ch[0].content;
          if (
            html.includes("task-list-item-checkbox") &&
            html.includes("checked")
          ) {
            checkboxPrefix = "\u2611 ";
          } else if (html.includes("task-list-item-checkbox")) {
            checkboxPrefix = "\u2610 ";
          }
        }
        break;
      }
    }

    let result = "";
    let i = 0;
    let firstParagraph = true;
    while (i < liInner.length) {
      const t = liInner[i];
      if (t.type === "bullet_list_open" || t.type === "ordered_list_open") {
        const closeIdx = findClosing(
          liInner,
          i,
          t.type.replace("_open", "_close"),
        );
        if (closeIdx >= 0) {
          const nestedKind: ListKind =
            t.type === "bullet_list_open" ? "bullet" : "number";
          result += await renderList(
            liInner.slice(i + 1, closeIdx),
            nestedKind,
          );
          i = closeIdx + 1;
          continue;
        }
      }
      // Render inline/paragraph content
      if (t.type === "paragraph_open") {
        const next = liInner[i + 1];
        let content = "";
        if (next?.type === "inline" && next.children) {
          content = await renderInline(stripCheckbox(next.children));
        }
        if (firstParagraph && checkboxPrefix) {
          content = esc(checkboxPrefix) + content;
          firstParagraph = false;
        }
        const closeIdx = findClosing(liInner, i, "paragraph_close");
        result += `<text:p text:style-name="${listItemParagraphStyle()}">${content}</text:p>\n`;
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        continue;
      }
      // Standalone inline (tight lists skip paragraph_open)
      if (t.type === "inline" && t.children) {
        let content = await renderInline(stripCheckbox(t.children));
        if (firstParagraph && checkboxPrefix) {
          content = esc(checkboxPrefix) + content;
          firstParagraph = false;
        }
        result += `<text:p text:style-name="${listItemParagraphStyle()}">${content}</text:p>\n`;
        i++;
        continue;
      }
      i++;
    }
    return result;
  }

  /**
   * Render a list with proper nesting. Nested lists inside items are rendered
   * inline within their parent <text:list-item>.
   */
  async function renderList(
    innerTokens: Token[],
    kindHint: ListKind,
  ): Promise<string> {
    const kind: ListKind =
      kindHint === "bullet" && detectTaskList(innerTokens) ? "task" : kindHint;
    contextStack.push(
      kind === "task"
        ? "task_list"
        : kind === "bullet"
          ? "bullet_list"
          : "ordered_list",
    );
    const sn = listStyleName(kind);

    const itemParts: string[] = [];
    let j = 0;
    while (j < innerTokens.length) {
      if (innerTokens[j].type === "list_item_open") {
        const liClose = findClosing(innerTokens, j, "list_item_close");
        if (liClose >= 0) {
          const liInner = innerTokens.slice(j + 1, liClose);
          const contentXml = await renderListItemContent(liInner);
          itemParts.push(
            `        <text:list-item>\n${contentXml}        </text:list-item>`,
          );
          j = liClose + 1;
          continue;
        }
      }
      j++;
    }

    contextStack.pop();
    return `      <text:list text:style-name="${sn}">\n${itemParts.join("\n")}\n      </text:list>`;
  }

  // ── main recursive token-to-XML renderer ──
  async function renderTokens(tokens: Token[]): Promise<string> {
    const parts: string[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      switch (token.type) {
        // ── Headings ──
        case "heading_open": {
          const level = parseInt(token.tag.replace("h", ""), 10) || 1;
          const next = tokens[i + 1];
          let content = "";
          if (next?.type === "inline" && next.children) {
            content = await renderInline(next.children);
          }
          const closeIdx = findClosing(tokens, i, "heading_close");
          parts.push(
            `      <text:p text:style-name="${S.heading(level)}">${content}</text:p>`,
          );
          i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
          break;
        }

        // ── Paragraph ──
        case "paragraph_open": {
          const next = tokens[i + 1];
          let content = "";
          if (next?.type === "inline" && next.children) {
            content = await renderInline(next.children);
          }
          const closeIdx = findClosing(tokens, i, "paragraph_close");
          const inList = contextStack.some(
            (c) =>
              c === "bullet_list" || c === "ordered_list" || c === "task_list",
          );
          const style = inList ? "Standard" : paragraphStyle();
          parts.push(
            `      <text:p text:style-name="${esc(style)}">${content}</text:p>`,
          );
          i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
          break;
        }

        // ── Blockquote ──
        case "blockquote_open": {
          const closeIdx = findClosing(tokens, i, "blockquote_close");
          if (closeIdx >= 0) {
            const isTopLevel = !contextStack.includes("blockquote");
            contextStack.push("blockquote");
            const innerXml = await renderTokens(tokens.slice(i + 1, closeIdx));
            contextStack.pop();
            if (isTopLevel) {
              parts.push(
                `<table:table table:style-name="QuoteTable">\n  <table:table-column/>\n  <table:table-row>\n    <table:table-cell table:style-name="QuoteTableCell">\n${innerXml}\n    </table:table-cell>\n  </table:table-row>\n</table:table>`,
              );
            } else {
              parts.push(innerXml);
            }
            i = closeIdx + 1;
            if (i < tokens.length && tokens[i].type === "blockquote_open") {
              parts.push(
                '<text:p text:style-name="Standard"><text:s/></text:p>',
              );
            }
          } else {
            i++;
          }
          break;
        }

        // ── Bullet list ──
        case "bullet_list_open": {
          const closeIdx = findClosing(tokens, i, "bullet_list_close");
          if (closeIdx >= 0) {
            const innerTokens = tokens.slice(i + 1, closeIdx);
            const xml = await renderList(innerTokens, "bullet");
            parts.push(xml);
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        // ── Ordered list ──
        case "ordered_list_open": {
          const closeIdx = findClosing(tokens, i, "ordered_list_close");
          if (closeIdx >= 0) {
            const innerTokens = tokens.slice(i + 1, closeIdx);
            const xml = await renderList(innerTokens, "number");
            parts.push(xml);
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        // ── List item (fallback) ──
        case "list_item_open": {
          const closeIdx = findClosing(tokens, i, "list_item_close");
          if (closeIdx >= 0) {
            const innerTokens = tokens.slice(i + 1, closeIdx);
            const contentXml = await renderListItemContent(innerTokens);
            parts.push(
              `        <text:list-item>\n${contentXml}\n        </text:list-item>`,
            );
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }
        // ── Table ──
        case "table_open": {
          const closeIdx = findClosing(tokens, i, "table_close");
          if (closeIdx >= 0) {
            const innerTokens = tokens.slice(i + 1, closeIdx);
            const colCount = countTableColumns(innerTokens);
            const colsXml = Array(colCount)
              .fill("          <table:table-column/>")
              .join("\n");
            const innerXml = await renderTokens(innerTokens);
            parts.push(
              `      <table:table>\n        <table:table-columns>\n${colsXml}\n        </table:table-columns>\n${innerXml}\n      </table:table>`,
            );
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        case "thead_open":
        case "thead_close":
        case "tbody_open":
        case "tbody_close":
          i++;
          break;

        case "tr_open": {
          const closeIdx = findClosing(tokens, i, "tr_close");
          if (closeIdx >= 0) {
            const innerXml = await renderTokens(tokens.slice(i + 1, closeIdx));
            parts.push(
              `        <table:table-row>\n${innerXml}\n        </table:table-row>`,
            );
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        case "th_open": {
          const next = tokens[i + 1];
          let content = "";
          if (next?.type === "inline" && next.children) {
            content = await renderInline(next.children);
          }
          const closeIdx = findClosing(tokens, i, "th_close");
          parts.push(
            `          <table:table-cell><text:p text:style-name="${S.cellHead}">${content}</text:p></table:table-cell>`,
          );
          i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
          break;
        }

        case "td_open": {
          const next = tokens[i + 1];
          let content = "";
          if (next?.type === "inline" && next.children) {
            content = await renderInline(next.children);
          }
          const closeIdx = findClosing(tokens, i, "td_close");
          parts.push(
            `          <table:table-cell><text:p text:style-name="${S.cell}">${content}</text:p></table:table-cell>`,
          );
          i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
          break;
        }

        // ── Horizontal rule ──
        case "hr":
          parts.push(
            '      <text:p text:style-name="Horizontal_20_Rule"> </text:p>',
          );
          i++;
          break;

        // ── Code block (indented) ──
        case "code_block": {
          const lines = token.content.trimEnd().split("\n");
          for (const line of lines) {
            parts.push(
              `      <text:p text:style-name="${S.pre}">${escWithSpaces(line)}</text:p>`,
            );
          }
          i++;
          break;
        }

        // ── Fence (code block with language) ──
        case "fence": {
          const language = token.info.trim();
          const code = token.content.trimEnd();
          const lines = code.split("\n");
          for (const line of lines) {
            const lineSpans = hljsToSpans(line, language);
            const lineXml = renderHighlightedLine(line, lineSpans, autoStyles);
            parts.push(
              `      <text:p text:style-name="${S.pre}">${lineXml}</text:p>`,
            );
          }
          i++;
          break;
        }

        // ── HTML block ──
        case "html_block": {
          const html = token.content.trim();
          if (html.startsWith("<hr") || html.startsWith("<hr/>")) {
            parts.push(
              '      <text:p text:style-name="Horizontal_20_Rule"> </text:p>',
            );
          } else if (html.startsWith("<svg") && /<\/svg>\s*$/i.test(html)) {
            const label = `html_block-svg(token@${i})`;
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(html),
              label,
              warnings,
            ) ?? { width: 0, height: 0 };
            const rasterized = await tryRasterizeSvg(html, dims, label);
            const inner = rasterized ?? addSvgImage(html, dims, label);
            parts.push(
              `      <text:p text:style-name="${paragraphStyle()}">${inner}</text:p>`,
            );
          }
          i++;
          break;
        }

        // ── Math block ──
        case "math_block": {
          if (rasterizeMath) {
            try {
              const { png, widthPx, heightPx } = await renderMathToPng(
                token.content,
                true,
                rasterScale,
              );
              const inner = addRasterImage(
                png,
                widthPx,
                heightPx,
                `block-math(${token.content.slice(0, 40)})`,
              );
              parts.push(
                `      <text:p text:style-name="${S.mathDisplay}">${inner}</text:p>`,
              );
              i++;
              break;
            } catch (err) {
              warnings.push(
                `Block math rasterization failed (${err instanceof Error ? err.message : String(err)}); embedded as native formula.`,
              );
              // Fall through to MathML embedding.
            }
          }
          try {
            const mathMl = renderMathToMathml(token.content, true);
            const objId = `Object ${++mathCounter}`;
            mathObjects.push({ id: objId, mathml: mathMl });
            parts.push(
              `      <text:p text:style-name="${S.body}"><draw:frame draw:style-name="fr1" draw:name="${objId}" text:anchor-type="as-char" draw:z-index="0"><draw:object xlink:href="./${objId}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`,
            );
          } catch {
            warnings.push(
              `Math rendering failed for: ${token.content.slice(0, 50)}…`,
            );
            parts.push(
              `      <text:p text:style-name="${S.body}">${esc(token.content)}</text:p>`,
            );
          }
          i++;
          break;
        }

        // ── Footnotes (pre-rendered into footnoteBodies map) ──
        case "footnote_open": {
          const closeIdx = findClosing(tokens, i, "footnote_close");
          if (closeIdx >= 0) {
            // Body already pre-rendered and injected via footnote_ref inline
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        case "footnote_block_open": {
          const closeIdx = findClosing(tokens, i, "footnote_block_close");
          if (closeIdx >= 0) {
            i = closeIdx + 1;
          } else {
            i++;
          }
          break;
        }

        case "footnote_close":
        case "footnote_block_close":
          i++;
          break;

        // ── Standalone inline token ──
        case "inline":
          if (token.children) {
            const content = await renderInline(token.children);
            parts.push(
              `      <text:p text:style-name="${paragraphStyle()}">${content}</text:p>`,
            );
          }
          i++;
          break;

        // ── Ignored tokens ──
        case "paragraph_close":
        case "heading_close":
        case "blockquote_close":
        case "bullet_list_close":
        case "ordered_list_close":
        case "list_item_close":
        case "table_close":
        case "tr_close":
        case "th_close":
        case "td_close":
        case "math_inline":
        case "footnote_ref":
          i++;
          break;

        default:
          i++;
      }
    }

    return parts.join("\n");
  }

  // ── pre-render footnote bodies ──
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "footnote_block_open") {
      const blockClose = findClosing(tokens, i, "footnote_block_close");
      const end = blockClose >= 0 ? blockClose : tokens.length;
      let j = i + 1;
      while (j < end) {
        if (tokens[j].type === "footnote_open") {
          const noteId = String(
            tokens[j].meta?.id ?? tokens[j].meta?.label ?? "",
          );
          const fnClose = findClosing(tokens, j, "footnote_close");
          if (fnClose >= 0) {
            const innerTokens = tokens.slice(j + 1, fnClose);
            // Filter out footnote_anchor — ODT uses text:note-citation instead
            const bodyTokens = innerTokens.filter(
              (t) => t.type !== "footnote_anchor",
            );
            const bodyXml = await renderTokens(bodyTokens);
            footnoteBodies.set(noteId, bodyXml);
          }
          j = fnClose >= 0 ? fnClose + 1 : j + 1;
        } else {
          j++;
        }
      }
      break;
    }
  }

  const bodyXml = await renderTokens(tokens);

  return {
    bodyXml,
    autoStyles: Array.from(autoStyles.entries()).map(([name, xml]) => ({
      name,
      xml,
    })),
    images,
    mathObjects,
  };
}

function countTableColumns(tokens: Token[]): number {
  for (const token of tokens) {
    if (token.type === "tr_open") {
      const closeIdx = findClosing(tokens, tokens.indexOf(token), "tr_close");
      if (closeIdx >= 0) {
        let count = 0;
        for (let j = tokens.indexOf(token); j <= closeIdx; j++) {
          if (tokens[j].type === "th_open" || tokens[j].type === "td_open")
            count++;
        }
        if (count > 0) return count;
      }
    }
  }
  return 1;
}

function findClosing(
  tokens: Token[],
  startIdx: number,
  closeType: string,
): number {
  const openType = tokens[startIdx].type;
  let depth = 1;
  for (let j = startIdx + 1; j < tokens.length; j++) {
    if (tokens[j].type === openType) depth++;
    if (tokens[j].type === closeType) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/* ─────────────────────── main export function ────────────────────────── */

async function exportOdt(ctx: ExportContext): Promise<ExportResult> {
  const warnings: string[] = [];
  const invokeImpl: InvokeImpl = (cmd, args) => invoke(cmd, args);

  const opts = readOptions(ctx.options);

  const { bodyXml, autoStyles, images, mathObjects } = await buildDocument(
    ctx.tokens,
    invokeImpl,
    warnings,
    opts,
  );

  const title = ctx.frontmatter?.name ?? ctx.fileName ?? "";

  const zip = new JSZip();

  // mimetype must be first entry, stored uncompressed
  zip.file("mimetype", generateMimetype(), { compression: "STORE" });

  zip.file("content.xml", generateContentXml(bodyXml, autoStyles));
  zip.file("styles.xml", generateStylesXml());
  zip.file("meta.xml", generateMetaXml(title));

  // Add images
  for (const [, img] of images) {
    zip.file(img.name, img.data);
  }

  // Add math objects as sub-packages (ODF standard for embedded MathML)
  for (const mathObj of mathObjects) {
    // renderMathToMathml returns <math xmlns="...">...</math>.
    // ODF formula expects <math xmlns="..."> (default namespace, not prefixed).
    // Just use the output directly — it's already in the correct format.
    const mathXml = `<?xml version="1.0" encoding="UTF-8"?>
${mathObj.mathml}`;
    zip.file(`${mathObj.id}/content.xml`, mathXml);
  }

  // Build manifest
  const manifestEntries: ManifestEntry[] = [
    { fullPath: "content.xml", mediaType: "text/xml" },
    { fullPath: "styles.xml", mediaType: "text/xml" },
    { fullPath: "meta.xml", mediaType: "text/xml" },
  ];
  for (const [, img] of images) {
    manifestEntries.push({ fullPath: img.name, mediaType: img.mime });
  }
  for (const mathObj of mathObjects) {
    manifestEntries.push({
      fullPath: `${mathObj.id}/`,
      mediaType: "application/vnd.oasis.opendocument.formula",
    });
    manifestEntries.push({
      fullPath: `${mathObj.id}/content.xml`,
      mediaType: "text/xml",
    });
  }
  zip.file("META-INF/manifest.xml", generateManifestXml(manifestEntries));

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const uint8 = new Uint8Array(buffer);

  const defaultName = ctx.fileName
    ? ctx.fileName.replace(/\.[^.]+$/, "") + ".odt"
    : "Untitled.odt";
  const defaultDir = fileState.currentFile
    ? fileState.currentFile.replace(/[^/\\]+$/, "")
    : undefined;

  const savePath = await save({
    defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
    filters: [{ name: "ODT", extensions: ["odt"] }],
  });
  if (!savePath) {
    return { warnings: [] };
  }

  await invoke("write_file_binary", {
    path: savePath,
    content: Array.from(uint8),
  });

  return { savedPath: savePath, warnings };
}

/* ─────────────────────── exporter registration ───────────────────────── */

export const odtExporter: Exporter = {
  id: "odt",
  label: "Export as ODT",
  description: "OpenDocument format",
  extension: "odt",
  /**
   * ODT always renders in a neutral theme. The confirmation dialog still
   * appears for this exporter — not for the theme warning, but to surface
   * the per-export options (math/SVG rasterization, image resolution).
   */
  themeCapable: true,
  optionGroups: odtOptionGroups,
  async export(ctx) {
    return exportOdt(ctx);
  },
};
