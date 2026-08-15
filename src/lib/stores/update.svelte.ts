import { check } from "@tauri-apps/plugin-updater";

export const updateStatus = $state({
  available: false,
  version: "" as string,
  pendingUpdate: null as Awaited<ReturnType<typeof check>> | null,
});

export async function checkForUpdates(): Promise<boolean> {
  try {
    const update = await check();
    updateStatus.pendingUpdate = update;
    if (update?.available) {
      updateStatus.available = true;
      updateStatus.version = update.version;
      return true;
    }
    updateStatus.available = false;
    updateStatus.version = "";
    return false;
  } catch {
    return false;
  }
}
