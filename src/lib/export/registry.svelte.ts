import type { Exporter, ExportContext, ExportResult } from "./types";

/**
 * Exporter registry. Adding a new format (HTML, PDF, future DOCX/EPUB/native
 * PDF) = one file that calls `registerExporter` at import time + one
 * registration import in `registerBuiltinExporters`. The UI (ViewerToolbar,
 * CommandPalette) reads `listExporters()` so it picks new formats up
 * automatically.
 *
 * Implemented as a `.svelte.ts` module so the exporter list is held in
 * `$state` — that way the toolbar's `$derived` re-runs when a new exporter is
 * registered (e.g. the lazy `registerBuiltinExporters()` call from onMount),
 * without the toolbar needing to know anything about registration timing.
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
 * Register the built-in exporters (HTML, PDF). Idempotent — safe to call
 * multiple times. Imported lazily so a test that only loads the registry
 * doesn't pull in the exporter implementations (and their Tauri/dialog deps).
 */
let builtinsRegistered = false;
export async function registerBuiltinExporters(): Promise<void> {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  const { htmlExporter } = await import("./exporters/html");
  registerExporter(htmlExporter);
  const { pdfExporter } = await import("./exporters/pdf");
  registerExporter(pdfExporter);
  const { odtExporter } = await import("./exporters/odt");
  registerExporter(odtExporter);
}
