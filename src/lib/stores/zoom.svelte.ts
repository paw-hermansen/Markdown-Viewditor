import { getCurrentWebview } from "@tauri-apps/api/webview";
import { settingsState, updateSetting } from "./settings.svelte";

/**
 * App-wide zoom, implemented as the webview's native *page* zoom
 * (`getCurrentWebview().setZoom()`: WebKitGTK `set_zoom_level`, WKWebView
 * `setPageZoom`, WebView2 `SetZoomFactor`).
 *
 * Deliberately NOT CSS `zoom`: WebKit mis-scales inline SVG under it
 * (`<foreignObject>` font sizes and SVG geometry — the reason the macOS PDF
 * path refuses CSS zoom; see AGENTS.md). Page zoom is engine-native and
 * scales Mermaid/KaTeX/tables uniformly.
 *
 * The `zoomLevel` setting (1 = 100%) is the single source of truth and is
 * persisted in `settings.json` alongside the theme and last-opened file.
 */

/** Zoom ladder (VS Code-like steps), 50% – 300%. */
export const ZOOM_STEPS = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
];

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

/** Current zoom level (1 = 100%). */
export function currentZoom(): number {
  return settingsState.zoomLevel;
}

/** "125%" — the level as shown in the status bar. */
export function zoomLabel(level: number = currentZoom()): string {
  return `${Math.round(level * 100)}%`;
}

/**
 * Next level on the ZOOM_STEPS ladder in the given direction. Levels that
 * are not on the ladder (e.g. a saved 1.3) step to the nearest neighbor, and
 * the result is clamped to [MIN_ZOOM, MAX_ZOOM].
 */
export function nextZoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    for (const step of ZOOM_STEPS) {
      if (step > current + 1e-9) return step;
    }
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current - 1e-9) return ZOOM_STEPS[i];
  }
  return ZOOM_STEPS[0];
}

/**
 * Apply a zoom level to the webview. Never throws: outside Tauri (tests,
 * `npm run dev` in a plain browser) or when the `core:webview:` permission
 * is missing, zooming simply does nothing — the UI must not break over it.
 * (Note: wry's Android implementation is a no-op as well.)
 */
async function applyZoomLevel(level: number): Promise<void> {
  try {
    await getCurrentWebview().setZoom(level);
  } catch (error) {
    console.warn("Failed to apply zoom level:", error);
  }
}

/**
 * Set the zoom level (clamped to [MIN_ZOOM, MAX_ZOOM]), apply it to the
 * webview, and persist it. Used by the stepping shortcuts; accepts any
 * value so programmatic callers are not forced onto the ladder.
 */
export async function setZoom(level: number): Promise<void> {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
  settingsState.zoomLevel = clamped;
  updateSetting("zoomLevel", clamped);
  await applyZoomLevel(clamped);
}

export async function zoomIn(): Promise<void> {
  await setZoom(nextZoomStep(currentZoom(), 1));
}

export async function zoomOut(): Promise<void> {
  await setZoom(nextZoomStep(currentZoom(), -1));
}

export async function resetZoom(): Promise<void> {
  await setZoom(1);
}

/** Re-apply the saved zoom level on startup (after `loadSettings()`). */
export async function applySavedZoom(): Promise<void> {
  await applyZoomLevel(
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, settingsState.zoomLevel)),
  );
}

// ===== Export guard =========================================================
//
// Exports and prints are calibrated in physical units (A4, points) and must
// run at zoom 1.0 regardless of the on-screen zoom — otherwise the macOS
// `create_pdf` capture rect and `window.print()` output scale with the zoom,
// and the wide-math fit measurement (scaleWideMathForPrint) would measure a
// zoomed layout. See the "Print/PDF Fidelity Contract" in AGENTS.md.

let guardDepth = 0;
let guardedLevel = 1;

/**
 * Run `fn` at zoom 1.0, then restore the previous level. Re-entrant: nested
 * calls (e.g. handleExport('pdf') -> handlePrint) share one guard.
 */
export async function withNominalZoom<T>(fn: () => Promise<T>): Promise<T> {
  if (guardDepth === 0) {
    guardedLevel = currentZoom();
    await applyZoomLevel(1);
  }
  guardDepth++;
  try {
    return await fn();
  } finally {
    guardDepth--;
    if (guardDepth === 0) {
      await applyZoomLevel(guardedLevel);
    }
  }
}

// ===== Ctrl/Cmd + mouse wheel ==============================================

/** Accumulated wheel delta per zoom step (one mouse notch ≈ 100). */
const WHEEL_STEP = 50;
/** Accumulator reset after this idle time, so each gesture is one series. */
const WHEEL_IDLE_MS = 200;

let wheelAccumulator = 0;
let wheelResetTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ctrl/Cmd + wheel (and macOS trackpad pinch, which arrives as `wheel` with
 * `ctrlKey`) zooms in steps. Must be registered with `{ passive: false }`
 * so `preventDefault()` works. Plain scrolling is left untouched.
 */
export function handleZoomWheel(e: WheelEvent): void {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();

  // Normalize line/page deltas (Firefox) to pixels.
  const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;

  wheelAccumulator += delta;
  if (wheelResetTimer) clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => {
    wheelAccumulator = 0;
    wheelResetTimer = null;
  }, WHEEL_IDLE_MS);

  while (wheelAccumulator <= -WHEEL_STEP) {
    wheelAccumulator += WHEEL_STEP;
    void zoomIn();
  }
  while (wheelAccumulator >= WHEEL_STEP) {
    wheelAccumulator -= WHEEL_STEP;
    void zoomOut();
  }
}
