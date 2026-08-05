import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Exporter, ExportResult } from "../types";
import { settingsState } from "$lib/stores/settings.svelte";
import { fileState } from "$lib/stores/file.svelte";

/**
 * PDF exporter. Reuses the existing print path: on macOS it builds the print
 * container and calls `invoke('create_pdf', { savePath })` (WKWebView
 * `createPDF`); on other platforms it falls back to `window.print()` so the
 * user picks "Save as PDF" in the browser dialog.
 *
 * The print-container builder is shared with the in-app Print button via
 * `buildPrintContainer`, so the two paths can't drift. The `body.pdf-export`
 * CSS hook and the `@media print` rules in app.css already cover math
 * (`.katex-block { break-inside: avoid; }`) — KaTeX fonts are loaded
 * in-document so math prints correctly.
 */

export interface PrintContainerHandle {
  printDiv: HTMLDivElement;
  /** Restore the document to its pre-export state (remove the clone, etc.). */
  cleanup: () => void;
}

/**
 * Build the off-screen `.print-content` container used by both the in-app
 * Print button and this exporter. Mirrors the layout `handlePrint` in
 * `+page.svelte` used to build inline; kept here so the export pipeline
 * doesn't depend on the route component.
 */
export function buildPrintContainer(
  viewerHtml: string,
  style: "printer-friendly" | "theme",
  viewerContentElement?: HTMLElement,
): PrintContainerHandle {
  const printDiv = document.createElement("div");
  printDiv.classList.add("print-content");
  printDiv.innerHTML = viewerHtml;
  document.body.appendChild(printDiv);

  const themeMode = style === "theme";
  if (themeMode && viewerContentElement) {
    printDiv.id = "viewer-content";
    viewerContentElement.id = "";
  }

  const exportClass = themeMode ? "theme-export" : "print-friendly";
  document.documentElement.classList.add("exporting", exportClass);
  document.body.classList.add("exporting", exportClass);

  return {
    printDiv,
    cleanup() {
      document.documentElement.classList.remove(
        "exporting",
        "print-friendly",
        "theme-export",
      );
      document.body.classList.remove(
        "exporting",
        "print-friendly",
        "theme-export",
      );
      printDiv.remove();
      if (themeMode && viewerContentElement) {
        viewerContentElement.id = "viewer-content";
      }
    },
  };
}

/** Wait two animation frames so the just-added .print-content has laid out. */
function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const isMacOS =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");

export async function exportPdf(
  viewerHtml: string,
  fileName: string,
  viewerContentElement?: HTMLElement,
): Promise<ExportResult> {
  const style = settingsState.printStyle;
  const handle = buildPrintContainer(viewerHtml, style, viewerContentElement);

  try {
    let savePath: string | null = null;
    if (isMacOS) {
      const defaultName = fileName
        ? fileName.replace(/\.[^.]+$/, "") + ".pdf"
        : "Untitled.pdf";
      const defaultDir = fileState.currentFile
        ? fileState.currentFile.replace(/[^/\\]+$/, "")
        : undefined;
      savePath = await save({
        defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!savePath) return { warnings: [] };
    }

    await waitForLayout();

    // Wait for all declared @font-face fonts to finish loading. Without this,
    // font-display:swap means the browser may still be showing the system
    // fallback when window.print() / WKWebView capture fires — producing a
    // PDF rendered in the fallback font instead of Inter / JetBrains Mono.
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }

    if (isMacOS && savePath) {
      await invoke("create_pdf", { savePath });
      return { savedPath: savePath, warnings: [] };
    }
    if (!isMacOS) {
      window.print();
      return { warnings: [] };
    }
    return { warnings: [] };
  } finally {
    handle.cleanup();
  }
}

export const pdfExporter: Exporter = {
  id: "pdf",
  label: isMacOS ? "Export as PDF" : "Export as PDF (Print…)",
  extension: "pdf",
  async export(ctx) {
    return exportPdf(ctx.html, ctx.fileName);
  },
};
