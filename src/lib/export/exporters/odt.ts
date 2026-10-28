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

import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import { fileState } from "$lib/stores/file.svelte";
import { isSkill, formatValue, deriveTitle } from "../frontmatter-card";
import type { Frontmatter } from "$lib/types";

import { escapeXml } from "$lib/utils/escape";
import type { InvokeImpl } from "../assets";
import { extractDirectiveStateMap } from "$lib/extensions/directives";
import type { ManifestEntry } from "../odt/odf-styles";
/* ─────────────────────── option ids / helpers ─────────────────────────── */

import {
  OPTION_RASTERIZE_MATH,
  OPTION_RASTERIZE_SVG,
  OPTION_RASTER_RESOLUTION,
  OPTION_ODT_INCLUDE_FRONTMATTER,
  type ExportOptions,
  readOptions,
} from "../odt/options";

// Re-export for backward compatibility (option-settings.ts, etc.).
export {
  OPTION_RASTERIZE_MATH,
  OPTION_RASTERIZE_SVG,
  OPTION_RASTER_RESOLUTION,
  OPTION_ODT_INCLUDE_FRONTMATTER,
};
export type { ExportOptions };

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
      id: "frontmatter",
      label: "Frontmatter",
      options: [
        {
          id: OPTION_ODT_INCLUDE_FRONTMATTER,
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
      label: "SVG images & Mermaid diagrams",
      options: [
        {
          id: OPTION_RASTERIZE_SVG,
          label: "Rasterize as PNG images",
          hint: "Applies to inline <svg>, <img src=*.svg>, markdown ![…](.svg), and Mermaid diagrams. PNG: wider compatibility. SVG: vector, may not render in all viewers.",
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
          hint: "Applies only when math or image/diagram rasterization is on. Higher = sharper print, larger file.",
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

import { S } from "../odt/odf-styles";
import { buildDocument } from "../odt/render";

import {
  generateMimetype,
  generateMetaXml,
  generateStylesXml,
  generateContentXml,
  generateManifestXml,
} from "../odt/odf-styles";

/* ─────────────────────── Document builder ────────────────────────────── */

function generateFrontmatterCardOdf(fm: Frontmatter): string {
  const skill = isSkill(fm);
  const rows: string[] = [];

  if (skill) {
    // Badge row: "SKILL" in accent color, bold, uppercase.
    rows.push(
      `<table:table-row><table:table-cell table:number-columns-spanned="2">` +
        `<text:p text:style-name="${S.fmHeading}">` +
        `<text:span text:style-name="T_fm_accent">${escapeXml("SKILL")}</text:span>` +
        `</text:p></table:table-cell><table:table-cell table:number-columns-spanned="2"/></table:table-row>`,
    );
    // Name row.
    if (fm.name) {
      rows.push(
        `<table:table-row><table:table-cell table:number-columns-spanned="2">` +
          `<text:p text:style-name="${S.fmBody}"><text:span text:style-name="T_fm_name">${escapeXml(String(fm.name))}</text:span></text:p>` +
          `</table:table-cell><table:table-cell table:number-columns-spanned="2"/></table:table-row>`,
      );
    }
    // Description row.
    if (fm.description) {
      rows.push(
        `<table:table-row><table:table-cell table:number-columns-spanned="2">` +
          `<text:p text:style-name="${S.fmDesc}">${escapeXml(String(fm.description))}</text:p>` +
          `</table:table-cell><table:table-cell table:number-columns-spanned="2"/></table:table-row>`,
      );
    }
    // Extra metadata rows.
    const skip = new Set(["name", "description"]);
    for (const [key, value] of Object.entries(fm)) {
      if (skip.has(key)) continue;
      rows.push(
        `<table:table-row><table:table-cell>` +
          `<text:p text:style-name="${S.fmMetaKey}">${escapeXml(key)}</text:p>` +
          `</table:table-cell><table:table-cell>` +
          `<text:p text:style-name="${S.fmMetaVal}">${escapeXml(formatValue(value))}</text:p>` +
          `</table:table-cell></table:table-row>`,
      );
    }
  } else {
    // Plain frontmatter.
    for (const [key, value] of Object.entries(fm)) {
      rows.push(
        `<table:table-row><table:table-cell>` +
          `<text:p text:style-name="${S.fmMetaKey}">${escapeXml(key)}</text:p>` +
          `</table:table-cell><table:table-cell>` +
          `<text:p text:style-name="${S.fmMetaVal}">${escapeXml(formatValue(value))}</text:p>` +
          `</table:table-cell></table:table-row>`,
      );
    }
  }

  return (
    `<table:table table:style-name="${S.fmTable}">` +
    `<table:table-column/>` +
    `<table:table-column/>` +
    rows.join("") +
    `</table:table>`
  );
}

/* ─────────────────────── main export function ────────────────────────── */

async function exportOdt(ctx: ExportContext): Promise<ExportResult> {
  const warnings: string[] = [];
  const invokeImpl: InvokeImpl = (cmd, args) => invoke(cmd, args);

  const opts = readOptions(ctx.options);

  // Extract HTML comment directives from the markdown source as
  // line-based state maps so each math/mermaid token can look up its
  // own state.
  const directiveStateMap = extractDirectiveStateMap(ctx.markdown, "math");
  const mermaidDirectiveStateMap = extractDirectiveStateMap(
    ctx.markdown,
    "mermaid",
  );

  const { bodyXml, autoStyles, images, mathObjects } = await buildDocument(
    ctx.tokens,
    invokeImpl,
    warnings,
    opts,
    directiveStateMap,
    mermaidDirectiveStateMap,
  );

  // Prepend frontmatter/skill card if the option is enabled.
  let finalBodyXml = bodyXml;
  if (opts[OPTION_ODT_INCLUDE_FRONTMATTER] && ctx.frontmatter) {
    finalBodyXml = generateFrontmatterCardOdf(ctx.frontmatter) + bodyXml;
  }

  const title = deriveTitle(ctx.frontmatter, ctx.fileName);
  const author =
    ctx.frontmatter?.author && typeof ctx.frontmatter.author === "string"
      ? ctx.frontmatter.author
      : "";

  const zip = new JSZip();

  // mimetype must be first entry, stored uncompressed
  zip.file("mimetype", generateMimetype(), { compression: "STORE" });

  zip.file("content.xml", generateContentXml(finalBodyXml, autoStyles));
  zip.file("styles.xml", generateStylesXml());
  zip.file("meta.xml", generateMetaXml(title, author));

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
