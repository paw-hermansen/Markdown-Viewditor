export type ToastKind = "error" | "info" | "warning";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string;
}

export const toastState = $state({
  items: [] as ToastItem[],
});

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: number, delay: number) {
  if (timers.has(id)) clearTimeout(timers.get(id)!);
  const t = setTimeout(() => dismiss(id), delay);
  timers.set(id, t);
}

export function dismiss(id: number) {
  const i = toastState.items.findIndex((t) => t.id === id);
  if (i >= 0) toastState.items.splice(i, 1);
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

export function dismissAll() {
  toastState.items.splice(0, toastState.items.length);
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

export const toast = {
  error(message: string, detail?: string, delay = 6000) {
    push("error", message, detail, delay);
  },
  info(message: string, detail?: string, delay = 4000) {
    push("info", message, detail, delay);
  },
  warning(message: string, detail?: string, delay = 6000) {
    push("warning", message, detail, delay);
  },
};

function push(
  kind: ToastKind,
  message: string,
  detail: string | undefined,
  delay: number,
) {
  const id = nextId++;
  toastState.items.push({ id, kind, message, detail });
  scheduleDismiss(id, delay);
}
