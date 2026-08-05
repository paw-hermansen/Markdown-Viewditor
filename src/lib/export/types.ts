import type { Frontmatter } from "$lib/types";

/**
 * Input handed to an exporter. `markdown` is the raw source; `html` is the
 * already-rendered viewer HTML (the export pipeline reuses the Viewer's
 * rendered output so what you see is what you get); `frontmatter` is the
 * parsed frontmatter (for `<title>`); `fileName` is the current file's name
 * without extension (used to default the save name).
 */
export interface ExportContext {
  markdown: string;
  html: string;
  frontmatter: Frontmatter | null;
  fileName: string;
}

/** Result of running an exporter. */
export interface ExportResult {
  /** Path saved to, when applicable (HTML exporter). Empty for print paths. */
  savedPath?: string;
  /** Non-fatal warnings surfaced to the user (e.g. an image that failed to inline). */
  warnings: string[];
}

/**
 * An exporter registers itself with the registry; the UI picks up the list
 * automatically. Adding a new format = one file + one registration.
 */
export interface Exporter {
  id: string;
  label: string;
  /** File extension (without dot), used for the save dialog filter. */
  extension: string;
  /** Run the export. Returns warnings; surfaces fatal errors via throw. */
  export(ctx: ExportContext): Promise<ExportResult>;
}
