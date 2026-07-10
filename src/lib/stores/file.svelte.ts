import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export const fileState = $state({
  currentFile: null as string | null,
  recentFiles: [] as string[],
  isLoading: false,
  error: null as string | null,
});

export async function openFile(): Promise<string | null> {
  try {
    fileState.isLoading = true;
    fileState.error = null;

    const selected = await open({
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
}

export function getRecentFiles(): string[] {
  return [...fileState.recentFiles];
}

export function getFileName(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}
