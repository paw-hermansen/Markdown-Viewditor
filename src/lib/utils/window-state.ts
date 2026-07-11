import { invoke } from "@tauri-apps/api/core";

export async function restoreWindowState(): Promise<boolean> {
  try {
    return await invoke<boolean>("restore_window_state");
  } catch (error) {
    console.error("Failed to restore window state:", error);
    return false;
  }
}

export async function saveWindowState(): Promise<void> {
  try {
    await invoke("save_window_state");
  } catch (error) {
    console.error("Failed to save window state:", error);
  }
}
