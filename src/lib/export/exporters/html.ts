import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import { buildStandaloneHtml } from "../document";
import { fileState, getFileName } from "$lib/stores/file.svelte";
import {
  generateFrontmatterCardHtml,
  OPTION_INCLUDE_FRONTMATTER,
} from "../frontmatter-card";

export const OPTION_ID = `html.${OPTION_INCLUDE_FRONTMATTER}`;

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function readIncludeFrontmatter(
  opts: Record<string, unknown> | undefined,
): boolean {
  return asBool(opts?.[OPTION_ID], true);
}

export function htmlOptionGroups(ctx: ExportContext): OptionGroup[] {
  return [
    {
      id: "frontmatter",
      label: "Frontmatter",
      options: [
        {
          id: OPTION_ID,
          label: "Include frontmatter card",
          hint: "Show the frontmatter or skill card at the top of the exported document.",
          kind: "toggle",
          value: true,
          disabledWhen: () => ctx.frontmatter === null,
        },
      ],
    },
  ];
}

/**
 * HTML exporter: builds a self-contained standalone HTML document and writes
 * it via the existing `write_file` Rust command. No new Rust surface —
 * reuses the same IPC path the editor's Save uses.
 */
export async function exportHtml(
  markdown: string,
  html: string,
  frontmatter: Parameters<typeof buildStandaloneHtml>[1],
  fileName: string,
  options?: Record<string, unknown>,
): Promise<ExportResult> {
  const warnings: string[] = [];

  // Default save name: current file name with .html, or "Untitled.html".
  const defaultName = fileName
    ? fileName.replace(/\.[^.]+$/, "") + ".html"
    : "Untitled.html";
  const defaultDir = fileState.currentFile
    ? fileState.currentFile.replace(/[^/\\]+$/, "")
    : undefined;

  const savePath = await save({
    defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
    filters: [{ name: "HTML", extensions: ["html", "htm"] }],
  });
  if (!savePath) {
    return { warnings: [] };
  }

  const includeFrontmatter = readIncludeFrontmatter(options);
  const frontmatterCardHtml =
    includeFrontmatter && frontmatter
      ? generateFrontmatterCardHtml(frontmatter)
      : undefined;

  const { html: standalone, warnings: buildWarnings } =
    await buildStandaloneHtml(html, frontmatter, fileName, {
      invokeImpl: invoke,
      frontmatterCardHtml,
    });
  warnings.push(...buildWarnings);

  await invoke("write_file", { path: savePath, content: standalone });

  return { savedPath: savePath, warnings };
}

export const htmlExporter: Exporter = {
  id: "html",
  label: "Export as HTML",
  description: "Standalone webpage",
  extension: "html",
  themeCapable: true,
  optionGroups: htmlOptionGroups,
  async export(ctx) {
    return exportHtml(
      ctx.markdown,
      ctx.html,
      ctx.frontmatter,
      ctx.fileName,
      ctx.options,
    );
  },
};

// Re-export for callers that need the file name helper without pulling the
// whole store module (keeps the import graph lean in tests).
export { getFileName };
