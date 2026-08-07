import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Exporter, ExportResult } from "../types";
import { buildStandaloneHtml } from "../document";
import { fileState, getFileName } from "$lib/stores/file.svelte";

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

  const { html: standalone, warnings: buildWarnings } =
    await buildStandaloneHtml(html, frontmatter, fileName, {
      invokeImpl: invoke,
    });
  warnings.push(...buildWarnings);

  await invoke("write_file", { path: savePath, content: standalone });

  return { savedPath: savePath, warnings };
}

export const htmlExporter: Exporter = {
  id: "html",
  label: "Export as HTML",
  extension: "html",
  async export(ctx) {
    return exportHtml(ctx.markdown, ctx.html, ctx.frontmatter, ctx.fileName);
  },
};

// Re-export for callers that need the file name helper without pulling the
// whole store module (keeps the import graph lean in tests).
export { getFileName };
