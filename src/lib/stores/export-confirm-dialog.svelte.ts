import type { OptionGroup } from "$lib/export/types";

export interface ExportConfirmRequest {
  /** Dialog title shown in the header (e.g. "Export HTML", "Print / PDF"). */
  title: string;
  /** What kind of theme the export uses. ODT renders neutral; HTML/PDF use the viewer theme. */
  themeKind: "neutral" | "viewer";
  /** Theme label shown to the user (only meaningful when `themeKind === "viewer"`). */
  themeLabel: string;
  /** Action label on the primary button ("Export", "Print", "Save", …). */
  actionLabel: string;
  /** Whether we're on macOS (changes title copy). */
  isMacOS: boolean;
  /** Per-exporter option groups. Empty array = "no options for this export". */
  optionGroups: OptionGroup[];
  /** Current values for each option id (read from settings or defaults). */
  currentOptions: Record<string, unknown>;
  /** Resolve callback registered by the dialog component. */
  resolve: (value: ExportConfirmResult) => void;
}

export interface ExportConfirmResult {
  confirmed: boolean;
  dontShowAgain: boolean;
  /**
   * The user's final option values keyed by option id. Only populated when
   * `confirmed === true`; otherwise undefined.
   */
  options?: Record<string, unknown>;
}

export const exportConfirmState = $state<{
  current: ExportConfirmRequest | null;
}>({
  current: null,
});

export function showExportConfirmDialog(
  opts: Omit<ExportConfirmRequest, "resolve">,
): Promise<ExportConfirmResult> {
  return new Promise((resolve) => {
    exportConfirmState.current = { ...opts, resolve };
  });
}

export function resolveExportConfirm(result: ExportConfirmResult) {
  const req = exportConfirmState.current;
  exportConfirmState.current = null;
  if (req) req.resolve(result);
}
