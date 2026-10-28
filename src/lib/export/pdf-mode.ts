import { invoke } from "@tauri-apps/api/core";

/**
 * Print/PDF output route, per platform and macOS version.
 *
 * - `"dialog"` — the system print dialog (Linux/Windows, and macOS 15+):
 *   `window.print()` on the engines that implement it, or Rust-driven
 *   `NSPrintPanel` on macOS (WKWebView has no JS `window.print()`). The user
 *   prints or picks "Save as PDF" in the dialog themselves.
 * - `"capture"` — the legacy macOS path: a save dialog followed by
 *   `invoke('create_pdf')`, WKWebView's `createPDFWithConfiguration` capture.
 *   Kept for macOS < 15 only, where the WKWebView print operation was
 *   unusable (see the Print/PDF Fidelity Contract in .agents/guides/export-print.md).
 */
export type PdfMode = "dialog" | "capture";

/** First macOS major version whose WKWebView print path is trusted (Sequoia). */
export const MACOS_PRINT_DIALOG_MIN_MAJOR = 15;

const isMacOS =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");

/**
 * Conservative default: macOS starts in "capture" (the always-working legacy
 * path) until `initPdfMode()` has probed the OS version, so a label flash or
 * a failed probe degrades to the old behavior instead of a broken dialog.
 */
let mode: PdfMode = isMacOS ? "capture" : "dialog";
let init: Promise<PdfMode> | null = null;

/**
 * Resolve the PDF mode once (macOS only needs the Rust-side version probe —
 * the WKWebView user agent is frozen at "Mac OS X 10_15_7" and cannot tell
 * one macOS release from the next). Idempotent; awaited by app startup and
 * by `exportPdf()`.
 */
export function initPdfMode(): Promise<PdfMode> {
  init ??= (async () => {
    if (isMacOS) {
      try {
        const major = await invoke<number>("macos_major_version");
        mode = major >= MACOS_PRINT_DIALOG_MIN_MAJOR ? "dialog" : "capture";
      } catch {
        mode = "capture";
      }
    }
    return mode;
  })();
  return init;
}

/** Synchronous read for UI labels. Call `initPdfMode()` at app startup first. */
export function pdfMode(): PdfMode {
  return mode;
}

/** True when PDFs are produced by the legacy macOS capture path (macOS < 15). */
export function usesCapturePdf(): boolean {
  return mode === "capture";
}
