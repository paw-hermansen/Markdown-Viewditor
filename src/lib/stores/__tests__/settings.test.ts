import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(() => Promise.resolve(mockStore)),
  },
}));

import {
  settingsState,
  updateViewMode,
  updateTheme,
  updateRecentFiles,
  updateLastOpenedFile,
  updateSplitRatio,
  updateSetting,
  loadSettings,
  saveSettings,
} from "../settings.svelte";
import { presetFor } from "$lib/utils/markdown-levels";

describe("settings store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    settingsState.viewMode = "split";
    settingsState.editorFontSize = 14;
    settingsState.editorFontFamily = "'JetBrains Mono', 'Fira Code', monospace";
    settingsState.editorLineNumbers = true;
    settingsState.editorWordWrap = false;
    settingsState.viewerTheme = "github-dark";
    settingsState.splitRatio = 0.5;
    settingsState.lastOpenedFile = null;
    settingsState.recentFiles = [];
    settingsState.markdownLevel = "advanced";
    settingsState.enabledFeatures = presetFor("advanced");
  });

  describe("updateViewMode", () => {
    it("should update viewMode in state", () => {
      updateViewMode("editor");
      expect(settingsState.viewMode).toBe("editor");
    });

    it("should accept viewer mode", () => {
      updateViewMode("viewer");
      expect(settingsState.viewMode).toBe("viewer");
    });

    it("should accept split mode", () => {
      updateViewMode("editor");
      updateViewMode("split");
      expect(settingsState.viewMode).toBe("split");
    });
  });

  describe("updateTheme", () => {
    it("should update viewerTheme in state", () => {
      updateTheme("monokai");
      expect(settingsState.viewerTheme).toBe("monokai");
    });
  });

  describe("updateRecentFiles", () => {
    it("should update recentFiles in state", () => {
      const files = ["/a.md", "/b.md"];
      updateRecentFiles(files);
      expect(settingsState.recentFiles).toEqual(files);
    });

    it("should create a copy of the files array", () => {
      const files = ["/a.md"];
      updateRecentFiles(files);
      expect(settingsState.recentFiles).not.toBe(files);
    });
  });

  describe("updateLastOpenedFile", () => {
    it("should update lastOpenedFile in state", () => {
      updateLastOpenedFile("/test.md");
      expect(settingsState.lastOpenedFile).toBe("/test.md");
    });

    it("should accept null to clear lastOpenedFile", () => {
      updateLastOpenedFile("/test.md");
      updateLastOpenedFile(null);
      expect(settingsState.lastOpenedFile).toBeNull();
    });
  });

  describe("updateSplitRatio", () => {
    it("should update splitRatio in state", () => {
      updateSplitRatio(0.7);
      expect(settingsState.splitRatio).toBe(0.7);
    });

    it("should clamp ratio to minimum 0.2", () => {
      updateSplitRatio(0.1);
      expect(settingsState.splitRatio).toBe(0.2);
    });

    it("should clamp ratio to maximum 0.8", () => {
      updateSplitRatio(0.9);
      expect(settingsState.splitRatio).toBe(0.8);
    });

    it("should accept boundary values", () => {
      updateSplitRatio(0.2);
      expect(settingsState.splitRatio).toBe(0.2);
      updateSplitRatio(0.8);
      expect(settingsState.splitRatio).toBe(0.8);
    });
  });

  describe("updateSetting", () => {
    it("should update a generic setting", () => {
      updateSetting("editorFontSize", 18);
      expect(settingsState.editorFontSize).toBe(18);
    });

    it("should update editorWordWrap", () => {
      updateSetting("editorWordWrap", true);
      expect(settingsState.editorWordWrap).toBe(true);
    });

    it("should update editorLineNumbers", () => {
      updateSetting("editorLineNumbers", false);
      expect(settingsState.editorLineNumbers).toBe(false);
    });

    it("should update markdownLevel", () => {
      updateSetting("markdownLevel", "basic");
      expect(settingsState.markdownLevel).toBe("basic");
    });

    it("should update enabledFeatures", () => {
      updateSetting("enabledFeatures", ["tables"]);
      expect(settingsState.enabledFeatures).toEqual(["tables"]);
    });
  });

  describe("markdown level defaults", () => {
    it("defaults to the advanced preset", () => {
      expect(settingsState.markdownLevel).toBe("advanced");
      expect(settingsState.enabledFeatures).toEqual(presetFor("advanced"));
    });

    it("loads saved markdownLevel and enabledFeatures over defaults", async () => {
      mockStore.get.mockResolvedValue({
        markdownLevel: "basic",
        enabledFeatures: [],
      });
      await loadSettings();
      expect(settingsState.markdownLevel).toBe("basic");
      expect(settingsState.enabledFeatures).toEqual([]);
    });

    it("fills in advanced defaults when saved settings omit the new keys", async () => {
      mockStore.get.mockResolvedValue({ viewMode: "editor" });
      await loadSettings();
      expect(settingsState.markdownLevel).toBe("advanced");
      expect(settingsState.enabledFeatures).toEqual(presetFor("advanced"));
    });
  });

  describe("loadSettings", () => {
    it("should load saved settings from store", async () => {
      mockStore.get.mockResolvedValue({
        viewMode: "editor",
        editorFontSize: 16,
        viewerTheme: "monokai",
      });

      await loadSettings();

      expect(settingsState.viewMode).toBe("editor");
      expect(settingsState.editorFontSize).toBe(16);
      expect(settingsState.viewerTheme).toBe("monokai");
    });

    it("should keep defaults when no saved settings", async () => {
      mockStore.get.mockResolvedValue(null);

      await loadSettings();

      expect(settingsState.viewMode).toBe("split");
      expect(settingsState.editorFontSize).toBe(14);
    });

    it("should handle store load error gracefully", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { Store } = await import("@tauri-apps/plugin-store");
      vi.mocked(Store.load).mockRejectedValueOnce(new Error("store error"));

      await loadSettings();

      expect(settingsState.viewMode).toBe("split");
      errorSpy.mockRestore();
    });
  });

  describe("saveSettings", () => {
    it("should save current settings to store", async () => {
      settingsState.viewMode = "editor";
      await saveSettings();
      vi.advanceTimersByTime(600);

      await vi.waitFor(() => {
        expect(mockStore.set).toHaveBeenCalledWith(
          "settings",
          expect.objectContaining({
            viewMode: "editor",
          }),
        );
        expect(mockStore.save).toHaveBeenCalled();
      });
    });

    it("should debounce multiple saves", async () => {
      updateViewMode("editor");
      updateTheme("monokai");
      updateSplitRatio(0.6);

      vi.advanceTimersByTime(600);

      await vi.waitFor(() => {
        expect(mockStore.set).toHaveBeenCalledTimes(1);
      });
    });
  });
});
