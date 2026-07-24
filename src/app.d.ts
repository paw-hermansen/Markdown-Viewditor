// See https://tauri.app/v2/guides/debugging/application/#development
export {};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      transformCallback: (cb: (...args: unknown[]) => void) => number;
    };
  }
}
