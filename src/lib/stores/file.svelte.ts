import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  settingsState,
  updateRecentFiles,
  updateLastOpenedFile,
} from "$lib/stores/settings.svelte";
import { toast } from "$lib/stores/toast.svelte";
import { MSG } from "$lib/constants/messages";

export type ChangeStatus = "unchanged" | "modified" | "deleted";

export interface FileInfoMeta {
  exists: boolean;
  mtime_ms: number;
  size: number;
  readonly: boolean;
}

export const fileState = $state({
  currentFile: settingsState.lastOpenedFile as string | null,
  recentFiles: [...settingsState.recentFiles] as string[],
  /** Reentrancy guard for file operations (open/save/read). */
  isLoading: false,
  error: null as string | null,
  currentFileMtime: null as number | null,
  currentFileSize: null as number | null,
  /** Single source of truth for external modification state. */
  changeStatus: "unchanged" as ChangeStatus,
  /** UI flag derived from changeStatus (kept for toolbar indicator). */
  externallyModified: false,
  /** null = unknown / untitled; true/false once a file is connected. */
  isReadOnly: null as boolean | null,
  /** When true, the next Save routes to Save As instead of recreating a dead path. */
  forceSaveAs: false,
});

function getDefaultDir(): string | undefined {
  const path = fileState.currentFile || settingsState.lastOpenedFile;
  if (!path) return undefined;
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash > 0 ? path.substring(0, lastSlash) : undefined;
}

export async function getFileInfo(path: string): Promise<FileInfoMeta | null> {
  try {
    return await invoke<FileInfoMeta>("get_file_info", { path });
  } catch {
    return null;
  }
}

export async function getFileMtime(path: string): Promise<number | null> {
  const info = await getFileInfo(path);
  return info && info.exists ? info.mtime_ms : null;
}

/** Read-only probe (Unix ACL aware). Kept for callers that only need RO. */
export async function isFileWritable(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>("is_file_writable", { path });
  } catch {
    return false;
  }
}

function setChangeStatus(status: ChangeStatus) {
  fileState.changeStatus = status;
  fileState.externallyModified = status !== "unchanged";
  if (status === "unchanged") fileState.forceSaveAs = false;
}

/** Refresh mtime/size/readonly baseline from disk and mark the file unchanged. */
export async function syncFromDisk(): Promise<void> {
  if (!fileState.currentFile) return;
  const info = await getFileInfo(fileState.currentFile);
  if (info && info.exists) {
    fileState.currentFileMtime = info.mtime_ms;
    fileState.currentFileSize = info.size;
    fileState.isReadOnly = info.readonly;
  }
  setChangeStatus("unchanged");
}

async function refreshMeta(path: string): Promise<void> {
  const info = await getFileInfo(path);
  if (info && info.exists) {
    fileState.currentFileMtime = info.mtime_ms;
    fileState.currentFileSize = info.size;
    fileState.isReadOnly = info.readonly;
  }
}

/**
 * Compare the on-disk file against the stored baseline (mtime OR size). Updates
 * `changeStatus`, `externallyModified` and `isReadOnly` as a single source of
 * truth so callers no longer manage those flags separately.
 */
export async function checkExternalModification(): Promise<ChangeStatus> {
  if (!fileState.currentFile || fileState.currentFileMtime === null) {
    setChangeStatus("unchanged");
    return "unchanged";
  }
  const info = await getFileInfo(fileState.currentFile);
  if (!info || !info.exists) {
    fileState.isReadOnly = true;
    setChangeStatus("deleted");
    return "deleted";
  }
  fileState.isReadOnly = info.readonly;
  if (
    info.mtime_ms !== fileState.currentFileMtime ||
    info.size !== fileState.currentFileSize
  ) {
    setChangeStatus("modified");
    return "modified";
  }
  setChangeStatus("unchanged");
  return "unchanged";
}

const SAVE_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "Text", extensions: ["txt"] },
  { name: "All Files", extensions: ["*"] },
];

export async function showSaveDialog(): Promise<string | null> {
  if (fileState.isLoading) return null;
  return await save({ defaultPath: getDefaultDir(), filters: SAVE_FILTERS });
}

export async function openFile(): Promise<string | null> {
  if (fileState.isLoading) return null;

  try {
    fileState.isLoading = true;
    fileState.error = null;

    const selected = await open({
      defaultPath: getDefaultDir(),
      multiple: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (!selected) return null;

    const path = typeof selected === "string" ? selected : selected;
    const content = await invoke<string>("read_file", { path });
    fileState.currentFile = path;
    await refreshMeta(path);
    setChangeStatus("unchanged");
    fileState.forceSaveAs = false;
    addRecentFile(path);
    updateLastOpenedFile(path);
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : MSG.openFailed;
    fileState.error = msg;
    toast.error(MSG.openFailed, msg);
    return null;
  } finally {
    fileState.isLoading = false;
  }
}

function describeWriteError(error: unknown): string {
  return error instanceof Error ? error.message : MSG.saveFailed;
}

export async function saveFile(
  path: string,
  content: string,
): Promise<boolean> {
  try {
    fileState.isLoading = true;
    fileState.error = null;
    await invoke("write_file", { path, content });
    fileState.currentFile = path;
    await refreshMeta(path);
    setChangeStatus("unchanged");
    fileState.forceSaveAs = false;
    addRecentFile(path);
    updateLastOpenedFile(path);
    return true;
  } catch (error) {
    const msg = describeWriteError(error);
    fileState.error = msg;
    if (msg.startsWith("File is read-only")) {
      fileState.isReadOnly = true;
      toast.error(MSG.readOnlySaveFailed, msg);
    } else {
      toast.error(MSG.saveFailed, msg);
    }
    return false;
  } finally {
    fileState.isLoading = false;
  }
}

/**
 * Save-As flow: pick a path via the OS dialog, then write. Reuses
 * `showSaveDialog()` + `saveFile()` so the dialog filter list and state update
 * logic are defined in exactly one place.
 */
export async function saveFileAs(content: string): Promise<string | null> {
  if (fileState.isLoading) return null;
  const path = await showSaveDialog();
  if (!path) return null;
  const ok = await saveFile(path, content);
  return ok ? path : null;
}

export async function readFile(path: string): Promise<string | null> {
  try {
    fileState.isLoading = true;
    fileState.error = null;
    const content = await invoke<string>("read_file", { path });
    fileState.currentFile = path;
    await refreshMeta(path);
    setChangeStatus("unchanged");
    fileState.forceSaveAs = false;
    addRecentFile(path);
    updateLastOpenedFile(path);
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : MSG.readFailed;
    fileState.error = msg;
    toast.error(MSG.readFailed, msg);
    return null;
  } finally {
    fileState.isLoading = false;
  }
}

export function closeFile() {
  fileState.currentFile = null;
  fileState.currentFileMtime = null;
  fileState.currentFileSize = null;
  fileState.changeStatus = "unchanged";
  fileState.isReadOnly = null;
  fileState.forceSaveAs = false;
  fileState.error = null;
  updateLastOpenedFile(null);
}

/** Mark the current file as deleted on disk (focus-listener path). */
export function markCurrentFileDeleted() {
  setChangeStatus("deleted");
  fileState.forceSaveAs = true;
  fileState.isReadOnly = true;
  if (fileState.currentFile) removeRecentFile(fileState.currentFile);
  updateLastOpenedFile(null);
}

export function clearError() {
  fileState.error = null;
}

function addRecentFile(path: string) {
  const index = fileState.recentFiles.indexOf(path);
  if (index > -1) {
    fileState.recentFiles.splice(index, 1);
  }
  fileState.recentFiles.unshift(path);
  if (fileState.recentFiles.length > 10) {
    fileState.recentFiles.pop();
  }
  updateRecentFiles(fileState.recentFiles);
}

export function removeRecentFile(path: string) {
  const index = fileState.recentFiles.indexOf(path);
  if (index > -1) {
    fileState.recentFiles.splice(index, 1);
    updateRecentFiles(fileState.recentFiles);
  }
}

export function getRecentFiles(): string[] {
  return [...fileState.recentFiles];
}

export function getFileName(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}
