#!/usr/bin/env node
/**
 * Clear the webview cache for Markdown Viewditor.
 *
 * Workaround for the upstream WebKitGTK bug that makes the app start with a
 * page reading "WebKit encountered an internal error"
 * (WebLoaderStrategy.cpp: internallyFailedLoadTimerFired —
 * https://bugs.webkit.org/show_bug.cgi?id=276312). When that error hits the
 * initial page load, the cache can get into a state where every subsequent
 * start fails the same way until the cache is deleted.
 *
 * Only cache directories are removed — app settings (settings.json),
 * window state (window-state.json) and the plugin stores are kept.
 *
 * Usage: npm run clean:webview-cache
 */
import { existsSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const ID = "com.github.paw-hermansen.markdown-viewditor";

function cacheDirs() {
  switch (platform()) {
    case "linux": {
      // WebKitGTK website data directory (see tauri.conf.json identifier).
      const base =
        process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
      return [join(base, ID, "WebKitCache"), join(base, ID, "CacheStorage")];
    }
    case "darwin":
      // WKWebView website data directory.
      return [join(homedir(), "Library", "WebKit", ID)];
    case "win32": {
      // WebView2 user data folder (browser cache subdirectory).
      const base = process.env.LOCALAPPDATA || "";
      return [join(base, ID, "EBWebView")];
    }
    default:
      return [];
  }
}

const dirs = cacheDirs();
let removed = 0;
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  try {
    rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
    removed++;
  } catch (error) {
    console.warn(
      `could not remove ${dir}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

if (removed > 0) {
  console.log(
    "\nWebview cache cleared. Start the app again (npm run tauri dev).",
  );
} else if (dirs.length === 0) {
  console.log(`Unsupported platform: ${platform()}`);
} else {
  console.log("No webview cache found — nothing to clear.");
}
