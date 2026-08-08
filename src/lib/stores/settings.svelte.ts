import { Store } from "@tauri-apps/plugin-store";
import type { Settings, ViewMode } from "$lib/types";
import { presetFor } from "$lib/utils/markdown-levels";

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
  enabledFeatures: presetFor("advanced"),
};

export const settingsState = $state<Settings>({ ...DEFAULT_SETTINGS });

let store: Store | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function loadSettings(): Promise<void> {
  try {
    store = await Store.load(STORE_FILE);
    const saved = await store.get<Partial<Settings>>("settings");
    if (saved) {
      Object.assign(settingsState, { ...DEFAULT_SETTINGS, ...saved });
    }
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
