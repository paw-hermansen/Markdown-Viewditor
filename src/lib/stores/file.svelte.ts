import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  settingsState,
  updateRecentFiles,
  updateLastOpenedFile,
} from "$lib/stores/settings.svelte";

export const fileState = $state({
  currentFile: settingsState.lastOpenedFile as string | null,
  recentFiles: [...settingsState.recentFiles] as string[],
  isLoading: false,
  error: null as string | null,
});

function getDefaultDir(): string | undefined {
  const path = fileState.currentFile || settingsState.lastOpenedFile;
  if (!path) return undefined;
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash > 0 ? path.substring(0, lastSlash) : undefined;
}

export async function openFile(): Promise<string | null> {
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
    addRecentFile(path);
    updateLastOpenedFile(path);
    return content;
  } catch (error) {
    fileState.error =
      error instanceof Error ? error.message : "Failed to open file";
    return null;
  } finally {
    fileState.isLoading = false;
  }
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
    addRecentFile(path);
    updateLastOpenedFile(path);
    return true;
  } catch (error) {
    fileState.error =
      error instanceof Error ? error.message : "Failed to save file";
    return false;
  } finally {
    fileState.isLoading = false;
  }
}

export async function saveFileAs(content: string): Promise<string | null> {
  try {
    fileState.isLoading = true;
    fileState.error = null;

    const path = await save({
      defaultPath: getDefaultDir(),
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (!path) return null;

    await invoke("write_file", { path, content });
    fileState.currentFile = path;
    addRecentFile(path);
    updateLastOpenedFile(path);
    return path;
  } catch (error) {
    fileState.error =
      error instanceof Error ? error.message : "Failed to save file";
    return null;
  } finally {
    fileState.isLoading = false;
  }
}

export async function readFile(path: string): Promise<string | null> {
  try {
    fileState.isLoading = true;
    fileState.error = null;

    const content = await invoke<string>("read_file", { path });
    fileState.currentFile = path;
    addRecentFile(path);
    updateLastOpenedFile(path);
    return content;
  } catch (error) {
    fileState.error =
      error instanceof Error ? error.message : "Failed to read file";
    return null;
  } finally {
    fileState.isLoading = false;
  }
}

export function closeFile() {
  fileState.currentFile = null;
  fileState.error = null;
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

export function getRecentFiles(): string[] {
  return [...fileState.recentFiles];
}

export function getFileName(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}
