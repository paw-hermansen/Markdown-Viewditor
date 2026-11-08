import { Store } from "@tauri-apps/plugin-store";
import type { Settings, ViewMode } from "$lib/types";
import { onDetectorsChanged, presetFor } from "$lib/utils/markdown-levels";

const STORE_FILE = "settings.json";

const DEFAULT_SETTINGS: Settings = {
  viewMode: "split",
  editorFontSize: 14,
  editorFontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  editorLineNumbers: true,
  editorWordWrap: false,
  viewerTheme: "github-dark",
  splitRatio: 0.5,
  lastOpenedFile: null,
  recentFiles: [],
  markdownLevel: "advanced",
  // Best-effort snapshot: the detector registry is incomplete at module load
  // (extension detectors register lazily), so syncPresetFeatures() re-derives
  // this preset set as the registry grows and on load.
  enabledFeatures: presetFor("advanced"),
  exportConfirmDismissed: false,
  odtRasterizeMath: false,
  odtRasterizeSvg: false,
  odtRasterResolution: 2,
  autoCheckUpdates: false,
  htmlIncludeFrontmatter: true,
  htmlBundleIncludeFrontmatter: true,
  pdfIncludeFrontmatter: true,
  odtIncludeFrontmatter: true,
  docxRasterizeMath: false,
  docxRasterizeSvg: true,
  docxRasterResolution: 2,
  docxIncludeFrontmatter: true,
  zoomLevel: 1,
};

export const settingsState = $state<Settings>({ ...DEFAULT_SETTINGS });

let store: Store | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Named presets derive their `enabledFeatures` from the detector registry
 * (patterns.md / PLAN-SYNTAX-LEVELS), but the registry is not complete when
 * this module first evaluates: extension detectors register lazily, when
 * their extension module loads. Saved sets can also predate newly added
 * toggles. Re-derive the set for preset levels whenever it drifts; custom
 * sets are user-authored and left untouched.
 */
function syncPresetFeatures(): void {
  const level = settingsState.markdownLevel;
  if (level === "custom") return;
  const preset = presetFor(level);
  const current = settingsState.enabledFeatures;
  if (
    preset.length === current.length &&
    preset.every((id) => current.includes(id))
  ) {
    return;
  }
  settingsState.enabledFeatures = preset;
  saveSettings();
}

onDetectorsChanged(syncPresetFeatures);

export async function loadSettings(): Promise<void> {
  try {
    store = await Store.load(STORE_FILE);
    const saved = await store.get<Partial<Settings>>("settings");
    if (saved) {
      Object.assign(settingsState, { ...DEFAULT_SETTINGS, ...saved });
    }
    // Heal a stale saved (or default) preset set now that saved settings
    // have been applied — late detector registrations heal it via
    // onDetectorsChanged above.
    syncPresetFeatures();
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

export async function saveSettings(): Promise<void> {
  if (!store) return;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      await store!.set("settings", { ...settingsState });
      await store!.save();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }, 500);
}

export function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): void {
  (settingsState as Settings)[key] = value;
  saveSettings();
}

export function updateViewMode(mode: ViewMode): void {
  settingsState.viewMode = mode;
  saveSettings();
}

export function updateTheme(theme: string): void {
  settingsState.viewerTheme = theme;
  saveSettings();
}

export function updateRecentFiles(files: string[]): void {
  settingsState.recentFiles = [...files];
  saveSettings();
}

export function updateLastOpenedFile(path: string | null): void {
  settingsState.lastOpenedFile = path;
  saveSettings();
}

export function updateSplitRatio(ratio: number): void {
  settingsState.splitRatio = Math.max(0.2, Math.min(0.8, ratio));
  saveSettings();
}

/**
 * Label for the `exportConfirmDismissed` setting. Shared by the Export as…
 * menu checkbox and the export confirmation dialog hint so the two can never
 * drift apart — the hint quotes this label verbatim.
 */
export function exportConfirmSettingLabel(exportOnly: boolean): string {
  return exportOnly
    ? "Show export confirmation"
    : "Show export and print confirmation";
}
