import type { Exporter, ExportContext, ExportResult } from "./types";

/**
 * Exporter registry. Adding a new format (HTML, PDF, future DOCX/EPUB/native
 * PDF) = one file that calls `registerExporter` at import time + one
 * registration import in `ensureExporters`. The UI (ViewerToolbar,
 * CommandPalette) reads `listExporters()` so it picks new formats up
 * automatically.
 *
 * Implemented as a `.svelte.ts` module so the exporter list is held in
 * `$state` — that way the toolbar's `$derived` re-runs when a new exporter is
 * registered (e.g. the lazy `ensureExporters()` call from the export entry
 * points), without the toolbar needing to know anything about registration
 * timing.
 */

const exporters = $state<Exporter[]>([]);

export function registerExporter(exporter: Exporter): void {
  if (!exporters.some((e) => e.id === exporter.id)) {
    exporters.push(exporter);
  }
}

export function unregisterExporter(id: string): void {
  const i = exporters.findIndex((e) => e.id === id);
  if (i >= 0) exporters.splice(i, 1);
}

export function listExporters(): Exporter[] {
  return exporters;
}

export function getExporter(id: string): Exporter | undefined {
  return exporters.find((e) => e.id === id);
}

export async function runExporter(
  id: string,
  ctx: ExportContext,
): Promise<ExportResult> {
  const exporter = exporters.find((e) => e.id === id);
  if (!exporter) {
    throw new Error(`Unknown exporter: ${id}`);
  }
  return exporter.export(ctx);
}

/**
 * Load and register the built-in exporters (HTML, HTML Bundle, PDF, ODT,
 * DOCX). Idempotent and concurrency-safe: the first call starts the
 * dynamic imports and later calls await the same load. The export entry
 * points (toolbar dropdown, CommandPalette, `handleExport`) call this on
 * first use, so the export pipeline — jszip, KaTeX export math, the
 * diagram exporters — stays out of the startup bundle and is only loaded
 * when the user actually exports. A test that only loads the registry
 * likewise doesn't pull in the exporter implementations (and their
 * Tauri/dialog deps).
 */
let builtinsLoad: Promise<void> | null = null;
export function ensureExporters(): Promise<void> {
  if (!builtinsLoad) {
    builtinsLoad = (async () => {
      const { htmlExporter } = await import("./exporters/html");
      registerExporter(htmlExporter);
      const { htmlBundleExporter } = await import("./exporters/html-bundle");
      registerExporter(htmlBundleExporter);
      const { pdfExporter } = await import("./exporters/pdf");
      registerExporter(pdfExporter);
      const { odtExporter } = await import("./exporters/odt");
      registerExporter(odtExporter);
      const { docxExporter } = await import("./exporters/docx");
      registerExporter(docxExporter);
    })().catch((e) => {
      // Don't cache the failure: the next export attempt retries.
      builtinsLoad = null;
      throw e;
    });
  }
  return builtinsLoad;
}
