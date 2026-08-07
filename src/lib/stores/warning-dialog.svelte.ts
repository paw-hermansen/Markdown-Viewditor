export interface WarningDialogState {
  warnings: string[];
  savedPath: string;
}

export const warningDialogState = $state<{
  current: WarningDialogState | null;
}>({
  current: null,
});

export function showWarningDialog(warnings: string[], savedPath: string) {
  warningDialogState.current = { warnings, savedPath };
}

export function dismissWarningDialog() {
  warningDialogState.current = null;
}
