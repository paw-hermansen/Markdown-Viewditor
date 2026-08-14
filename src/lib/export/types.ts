import type { Frontmatter } from "$lib/types";
import type Token from "markdown-it/lib/token.mjs";

/**
 * Input handed to an exporter. `markdown` is the raw source; `html` is the
 * already-rendered viewer HTML (the export pipeline reuses the Viewer's
 * rendered output so what you see is what you get); `frontmatter` is the
 * parsed frontmatter (for `<title>`); `fileName` is the current file's name
 * without extension (used to default the save name); `options` carries the
 * per-export options the user picked in the confirmation dialog (or the
 * persisted defaults if the dialog was dismissed).
 */
export interface ExportContext {
  markdown: string;
  html: string;
  frontmatter: Frontmatter | null;
  fileName: string;
  tokens: Token[];
  /** Exporter-specific options resolved by the user in the confirmation dialog. */
  options?: Record<string, unknown>;
}

/** Result of running an exporter. */
export interface ExportResult {
  /** Path saved to, when applicable (HTML exporter). Empty for print paths. */
  savedPath?: string;
  /** Non-fatal warnings surfaced to the user (e.g. an image that failed to inline). */
  warnings: string[];
}

/* ──────────────────── Per-exporter option groups ─────────────────────── */

/** A single option the user can toggle/pick in the confirmation dialog. */
export interface OptionDef {
  /** Stable id (e.g. `odt.rasterizeMath`). Exporter reads `current[id]`. */
  id: string;
  label: string;
  /** Optional helper text shown under the control. */
  hint?: string;
  kind: "toggle" | "select";
  /** Initial value (must match the option's actual type). */
  value: unknown;
  /** Choices for `kind: "select"`. */
  choices?: { value: unknown; label: string }[];
  /**
   * Predicate that disables the control based on other options' current
   * values. Used to grey out the resolution picker when no rasterization
   * is active.
   */
  disabledWhen?: (current: Record<string, unknown>) => boolean;
}

/** A group of related options shown under a small heading in the dialog. */
export interface OptionGroup {
  id: string;
  label: string;
  options: OptionDef[];
}

/**
 * An exporter registers itself with the registry; the UI picks up the list
 * automatically. Adding a new format = one file + one registration.
 */
export interface Exporter {
  id: string;
  label: string;
  /** Short description shown in the export dropdown menu (e.g. "Standalone webpage"). */
  description?: string;
  /** File extension (without dot), used for the save dialog filter. */
  extension: string;
  /** Whether this export uses the current viewer theme (shows confirm dialog). */
  themeCapable?: boolean;
  /**
   * Optional option groups shown in the confirmation dialog. Empty array
   * (or omitted) = "no options for this export". Each exporter declares
   * its own options; adding new ones = one entry here + a read in the
   * exporter body.
   */
  optionGroups?: (ctx: ExportContext) => OptionGroup[];
  /** Run the export. Returns warnings; surfaces fatal errors via throw. */
  export(ctx: ExportContext): Promise<ExportResult>;
}
