export interface ExportConfirmRequest {
  themeLabel: string;
  actionLabel: string;
  isMacOS: boolean;
  resolve: (value: ExportConfirmResult) => void;
}

export interface ExportConfirmResult {
  confirmed: boolean;
  dontShowAgain: boolean;
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
