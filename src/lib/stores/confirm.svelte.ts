import { APP_TITLE } from "$lib/constants/messages";

export type ConfirmKind = "warning" | "error" | "info";

export interface ConfirmButton<T extends string = string> {
  label: string;
  value: T;
  /** Variant: primary, danger, or default. */
  variant?: "primary" | "danger" | "default";
}

interface PendingRequest {
  title: string;
  message: string;
  kind: ConfirmKind;
  buttons: ConfirmButton[];
  resolve: (value: string | null) => void;
}

/**
 * Singleton confirm-driver state. The `ConfirmDialog` component rendered once
 * at the app root observes `current` and resolves the pending promise when the
 * user picks a button (or `null` on dismiss/Escape/backdrop).
 */
export const confirmState = $state<{ current: PendingRequest | null }>({
  current: null,
});

export function isConfirmOpen(): boolean {
  return confirmState.current !== null;
}

function open(
  message: string,
  buttons: ConfirmButton[],
  kind: ConfirmKind = "warning",
  title: string = APP_TITLE,
): Promise<string | null> {
  return new Promise((resolve) => {
    confirmState.current = { title, message, kind, buttons, resolve };
  });
}

function resolveRequest(value: string | null) {
  const req = confirmState.current;
  confirmState.current = null;
  if (req) req.resolve(value);
}

/** Save / Don't Save / Cancel dialog. Returns 'save' | 'discard' | 'cancel' | null. */
export function confirmSaveDiscardCancel(
  message: string,
  kind: ConfirmKind = "warning",
): Promise<"save" | "discard" | "cancel" | null> {
  return open(
    message,
    [
      { label: "Cancel", value: "cancel", variant: "default" },
      { label: "Don't Save", value: "discard", variant: "default" },
      { label: "Save", value: "save", variant: "primary" },
    ],
    kind,
  ) as Promise<"save" | "discard" | "cancel" | null>;
}

/** Yes / No dialog as a drop-in replacement for the Tauri `ask` plugin call. */
export function confirmYesNo(
  message: string,
  kind: ConfirmKind = "warning",
): Promise<boolean> {
  return open(
    message,
    [
      { label: "No", value: "no", variant: "default" },
      { label: "Yes", value: "yes", variant: "primary" },
    ],
    kind,
  ).then((v) => v === "yes");
}

/** Single OK dialog for informational prompts. Returns true on OK, null on dismiss. */
export function confirmOk(
  message: string,
  kind: ConfirmKind = "info",
): Promise<boolean> {
  return open(
    message,
    [{ label: "OK", value: "ok", variant: "primary" }],
    kind,
  ).then((v) => v === "ok");
}

/** Resolve the open dialog. Exported for the ConfirmDialog component. */
export function resolveConfirm(value: string | null) {
  resolveRequest(value);
}
