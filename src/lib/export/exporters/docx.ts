/**
 * DOCX exporter — produces an Office Open XML (.docx) file.
 *
 * Always uses neutral / printer-friendly style (ignores the selected theme),
 * like the ODT exporter. Hand-built OOXML (ECMA-376 Transitional,
 * conservative subset) packaged with jszip — see the DOCX Compatibility
 * Contract in EXPORT-PLAN Part 8 before changing any emitted markup.
 */
import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import { fileState } from "$lib/stores/file.svelte";
import { isSkill, formatValue, deriveTitle } from "../frontmatter-card";
import type { Frontmatter } from "$lib/types";
import type { InvokeImpl } from "../assets";
import { extractDirectiveStateMap } from "$lib/extensions/directives";

import {
  OPTION_DOCX_RASTERIZE_MATH,
  OPTION_DOCX_RASTERIZE_SVG,
  OPTION_DOCX_RASTER_RESOLUTION,
  OPTION_DOCX_INCLUDE_FRONTMATTER,
  type ExportOptions,
  readOptions,
} from "../docx/options";
export {
  OPTION_DOCX_RASTERIZE_MATH,
  OPTION_DOCX_RASTERIZE_SVG,
  OPTION_DOCX_RASTER_RESOLUTION,
  OPTION_DOCX_INCLUDE_FRONTMATTER,
};
export type { ExportOptions };

import { buildDocument } from "../docx/render";
import {
  generateContentTypesXml,
  generateRootRelsXml,
  generateDocumentRelsXml,
  generateSettingsXml,
  generateCoreXml,
  generateFootnotesXml,
  generateSectPrXml,
} from "../docx/package";
import { generateStylesXml, generateNumberingXml, S } from "../docx/styles";
import { wText } from "../docx/utils";

/* ─────────────────────── option ids / helpers ─────────────────────────── */

/**
 * Per-export option groups for the confirmation dialog. Mirrors the ODT
 * exporter's groups with the DOCX semantics (OMML vs PNG math; SVG dual
 * embed is opt-in, PNG-only is the safe default).
 */
export function docxOptionGroups(ctx: ExportContext): OptionGroup[] {
  void ctx;
  return [
    {
      id: "frontmatter",
      label: "Frontmatter",
      options: [
        {
          id: OPTION_DOCX_INCLUDE_FRONTMATTER,
          label: "Include frontmatter card",
          hint: "Show the frontmatter or skill card at the top of the exported document.",
          kind: "toggle",
          value: true,
          disabledWhen: () => ctx.frontmatter === null,
        },
      ],
    },
    {
      id: "math",
      label: "Math formulas",
      options: [
        {
          id: OPTION_DOCX_RASTERIZE_MATH,
          label: "Rasterize as PNG images",
          hint: "On: PNG images, not editable. Off: native Word equations, editable and scalable.",
          kind: "toggle",
          value: false,
        },
      ],
    },
    {
      id: "svg",
      label: "SVG images, Mermaid diagrams, SMILES",
      options: [
        {
          id: OPTION_DOCX_RASTERIZE_SVG,
          label: "Rasterize as PNG images",
          hint: "On: PNG only. Off: SVG with a PNG fallback — sharper zoom in Word 2016+, older viewers show the PNG.",
          kind: "toggle",
          value: true,
        },
      ],
    },
    {
      id: "resolution",
      label: "Image resolution",
      options: [
        {
          id: OPTION_DOCX_RASTER_RESOLUTION,
          label: "Resolution",
          hint: "Applies to rasterized math, diagrams, and SVG fallbacks. Higher = sharper print, larger file.",
          kind: "select",
          value: 2,
          choices: [
            { value: 1, label: "1× (96 DPI)" },
            { value: 2, label: "2× (192 DPI)" },
            { value: 3, label: "3× (288 DPI)" },
            { value: 4, label: "4× (384 DPI)" },
          ],
        },
      ],
    },
  ];
}

/* ─────────────────────── frontmatter card ─────────────────────────────── */

function tableRow(key: string, value: string): string {
  return (
    '<w:tr><w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr>' +
    `<w:p><w:r><w:rPr><w:b/><w:color w:val="656D76"/></w:rPr>${wText(key)}</w:r></w:p></w:tc>` +
    '<w:tc><w:tcPr><w:tcW w:w="7438" w:type="dxa"/></w:tcPr>' +
    `<w:p><w:r>${wText(value)}</w:r></w:p></w:tc></w:tr>`
  );
}

function borderlessTable(rowsXml: string): string {
  return (
    "<w:tbl><w:tblPr>" +
    `<w:tblW w:w="9638" w:type="dxa"/>` +
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="none" w:sz="0" w:space="0"/>`)
      .join("") +
    "</w:tblBorders>" +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    "</w:tblPr>" +
    '<w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="7438"/></w:tblGrid>' +
    rowsXml +
    "</w:tbl>"
  );
}

/** Frontmatter/skill card as neutral Word markup (title + key/value table). */
export function generateFrontmatterCardDocx(
  fm: Frontmatter,
  fileName: string,
): string {
  const parts: string[] = [];
  const skill = isSkill(fm);
  const title = deriveTitle(fm, fileName);
  if (title) {
    parts.push(
      `<w:p><w:pPr><w:pStyle w:val="${S.title}"/></w:pPr><w:r>${wText(title)}</w:r></w:p>`,
    );
  }
  if (skill) {
    parts.push(
      `<w:p><w:r><w:rPr><w:b/><w:color w:val="0969DA"/><w:sz w:val="18"/></w:rPr>${wText("SKILL")}</w:r></w:p>`,
    );
    if (fm.description) {
      parts.push(
        `<w:p><w:r><w:rPr><w:i/><w:color w:val="656D76"/></w:rPr>${wText(String(fm.description))}</w:r></w:p>`,
      );
    }
  }
  const skip = skill ? new Set(["name", "description"]) : new Set<string>();
  const rows: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (skip.has(key)) continue;
    rows.push(tableRow(key, formatValue(value)));
  }
  if (rows.length > 0) parts.push(borderlessTable(rows.join("")));
  return parts.join("\n");
}

/* ─────────────────────── main export function ────────────────────────── */

const DOCUMENT_NS =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main">';

async function exportDocx(ctx: ExportContext): Promise<ExportResult> {
  const warnings: string[] = [];
  const invokeImpl: InvokeImpl = (cmd, args) => invoke(cmd, args);
  const opts = readOptions(ctx.options);

  const directiveStateMap = extractDirectiveStateMap(ctx.markdown, "math");
  const mermaidDirectiveStateMap = extractDirectiveStateMap(
    ctx.markdown,
    "mermaid",
  );
  const smilesDirectiveStateMap = extractDirectiveStateMap(
    ctx.markdown,
    "smiles",
  );
  const vegaLiteDirectiveStateMap = extractDirectiveStateMap(
    ctx.markdown,
    "vega-lite",
  );

  const { bodyXml, images, rels, nums, footnoteDefs } = await buildDocument(
    ctx.tokens,
    invokeImpl,
    warnings,
    opts,
    directiveStateMap,
    mermaidDirectiveStateMap,
    smilesDirectiveStateMap,
    vegaLiteDirectiveStateMap,
  );

  let finalBodyXml = bodyXml;
  if (opts[OPTION_DOCX_INCLUDE_FRONTMATTER] && ctx.frontmatter) {
    finalBodyXml =
      generateFrontmatterCardDocx(ctx.frontmatter, ctx.fileName) + bodyXml;
  }

  const title = deriveTitle(ctx.frontmatter, ctx.fileName);
  const author =
    ctx.frontmatter?.author && typeof ctx.frontmatter.author === "string"
      ? ctx.frontmatter.author
      : "";

  const zip = new JSZip();
  zip.file("[Content_Types].xml", generateContentTypesXml());
  zip.file("_rels/.rels", generateRootRelsXml());
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      DOCUMENT_NS +
      "<w:body>" +
      finalBodyXml +
      generateSectPrXml() +
      "</w:body></w:document>",
  );
  zip.file("word/_rels/document.xml.rels", generateDocumentRelsXml(rels));
  zip.file("word/styles.xml", generateStylesXml());
  zip.file("word/numbering.xml", generateNumberingXml(nums));
  zip.file("word/footnotes.xml", generateFootnotesXml(footnoteDefs));
  zip.file("word/settings.xml", generateSettingsXml());
  zip.file("docProps/core.xml", generateCoreXml(title, author));
  for (const [, img] of images) {
    zip.file(img.name, img.data);
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const uint8 = new Uint8Array(buffer);

  const defaultName = ctx.fileName
    ? ctx.fileName.replace(/\.[^.]+$/, "") + ".docx"
    : "Untitled.docx";
  const defaultDir = fileState.currentFile
    ? fileState.currentFile.replace(/[^/\\]+$/, "")
    : undefined;

  const savePath = await save({
    defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
    filters: [{ name: "DOCX", extensions: ["docx"] }],
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

export const docxExporter: Exporter = {
  id: "docx",
  label: "Export as DOCX",
  description: "Word document",
  extension: "docx",
  /**
   * DOCX always renders in a neutral theme (like ODT). The confirmation
   * dialog still appears — not for the theme warning, but to surface the
   * per-export options (math/SVG rasterization, image resolution).
   */
  themeCapable: true,
  optionGroups: docxOptionGroups,
  async export(ctx) {
    return exportDocx(ctx);
  },
};
