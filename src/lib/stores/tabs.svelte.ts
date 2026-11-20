import type { EditorState as CmState } from "@codemirror/state";
import type { ViewMode } from "$lib/types";
import {
  editorState,
  getSavedContent,
  hasUnsavedChanges,
  markSaved,
  updateWordCount,
} from "$lib/stores/editor.svelte";
import { fileState } from "$lib/stores/file.svelte";
import {
  settingsState,
  updateLastOpenedFile,
} from "$lib/stores/settings.svelte";

/**
 * Document tabs. The ACTIVE tab lives in the global stores (`editorState`,
 * `fileState`, `settingsState.splitRatio`, the page's `viewMode`), so all
 * existing single-document code keeps working unchanged; inactive tabs are
 * parked snapshots. Switching = `parkActive()` + `loadTab()`. A tab's fields
 * (except `id`) are therefore only meaningful while it is inactive — read the
 * active tab's path/dirty state through `tabPath()` / `tabDirty()`.
 */

const FILE_KEYS = [
  "currentFile",
  "currentFileMtime",
  "currentFileSize",
  "changeStatus",
  "externallyModified",
  "isReadOnly",
  "forceSaveAs",
] as const;
type FileSnapshot = Pick<typeof fileState, (typeof FILE_KEYS)[number]>;

export interface DocTab {
  id: number;
  content: string;
  /** Saved baseline (`savedContent`) at parking time. */
  saved: string;
  viewMode: ViewMode;
  splitRatio: number;
  file: FileSnapshot;
  /** CodeMirror state (undo history, selection); absent → fresh state. */
  cm?: CmState;
  /** Restored from settings; the file is read on first activation. */
  pending?: boolean;
}

export const tabsState = $state({ tabs: [] as DocTab[], activeId: -1 });

let nextId = 0;

export function createTab(
  viewMode: ViewMode,
  splitRatio: number,
  path: string | null = null,
  pending = false,
): DocTab {
  return {
    id: nextId++,
    content: "",
    saved: "",
    viewMode,
    splitRatio,
    pending,
    file: {
      currentFile: path,
      currentFileMtime: null,
      currentFileSize: null,
      changeStatus: "unchanged",
      externallyModified: false,
      isReadOnly: null,
      forceSaveAs: false,
    },
  };
}

/** Insert right after the active tab. Returns the stored (reactive) tab. */
export function insertTab(tab: DocTab): DocTab {
  const at = tabsState.tabs.findIndex((t) => t.id === tabsState.activeId);
  tabsState.tabs.splice(at + 1 || tabsState.tabs.length, 0, tab);
  return tabById(tab.id);
}

export function tabById(id: number): DocTab {
  return tabsState.tabs.find((t) => t.id === id)!;
}

function activeTab(): DocTab {
  return tabById(tabsState.activeId);
}

const isActive = (tab: DocTab) => tab.id === tabsState.activeId;

export function tabPath(tab: DocTab): string | null {
  return isActive(tab) ? fileState.currentFile : tab.file.currentFile;
}

export function tabDirty(tab: DocTab): boolean {
  return isActive(tab) ? hasUnsavedChanges() : tab.content !== tab.saved;
}

export function findTabByPath(path: string): DocTab | undefined {
  return tabsState.tabs.find((t) => tabPath(t) === path);
}

/** The tab `step` positions from `id`, wrapping around. */
export function neighborOf(id: number, step: 1 | -1): DocTab {
  const { tabs } = tabsState;
  const i = tabs.findIndex((t) => t.id === id);
  return tabs[(i + step + tabs.length) % tabs.length];
}

export function removeTab(id: number): void {
  tabsState.tabs = tabsState.tabs.filter((t) => t.id !== id);
}

/** Copy the live stores into the active tab. */
export function parkActive(viewMode: ViewMode, cm?: CmState): void {
  const tab = activeTab();
  tab.content = editorState.content;
  tab.saved = getSavedContent();
  tab.viewMode = viewMode;
  tab.splitRatio = settingsState.splitRatio;
  tab.cm = cm;
  for (const k of FILE_KEYS)
    (tab.file as Record<string, unknown>)[k] = fileState[k];
}

/** Make `tab` active and copy it into the live stores (except `viewMode`). */
export function loadTab(tab: DocTab): void {
  tabsState.activeId = tab.id;
  Object.assign(fileState, tab.file);
  editorState.content = tab.content;
  updateWordCount(tab.content);
  markSaved(tab.saved);
  settingsState.splitRatio = tab.splitRatio;
  updateLastOpenedFile(tab.file.currentFile);
}
