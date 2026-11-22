import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: { content: "" },
  getSavedContent: vi.fn(() => ""),
  hasUnsavedChanges: vi.fn(() => false),
  markSaved: vi.fn(),
  updateWordCount: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: { splitRatio: 50, recentFiles: [], lastOpenedFile: null },
  updateLastOpenedFile: vi.fn(),
}));

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: {
    currentFile: null as string | null,
    currentFileMtime: null,
    currentFileSize: null,
    changeStatus: "unchanged",
    externallyModified: false,
    isReadOnly: null,
    forceSaveAs: false,
  },
}));

import { tabsState, createTab, findTabByPath } from "../tabs.svelte";
import { fileState } from "$lib/stores/file.svelte";

// `tabsState` is a deep `$state` proxy: reads return reactive copies of the
// raw objects handed to createTab, so identity assertions go through `id`.
function expectFound(path: string, tabId: number) {
  expect(findTabByPath(path)?.id).toBe(tabId);
}

describe("tabs store", () => {
  beforeEach(() => {
    tabsState.tabs = [];
    tabsState.activeId = -1;
    fileState.currentFile = null;
  });

  describe("findTabByPath", () => {
    it("finds a parked tab by its exact path", () => {
      const tab = createTab("split", 50, "/home/paw/x.md");
      tabsState.tabs = [tab];

      expectFound("/home/paw/x.md", tab.id);
    });

    it("matches across slash styles (Windows)", () => {
      // A link-clicked path arrives with forward slashes (`C:/Users/...`,
      // see resolveLink) while the tab may hold the dialog's backslash
      // spelling — same file, different string. Regression: opening the same
      // file twice because `===` failed.
      const tab = createTab("split", 50, "C:\\Users\\paw\\x.md");
      tabsState.tabs = [tab];

      expectFound("C:/Users/paw/x.md", tab.id);
    });

    it("matches case-insensitively for Windows-shaped paths", () => {
      const tab = createTab("split", 50, "C:\\Users\\Paw\\x.md");
      tabsState.tabs = [tab];

      expectFound("c:/users/paw/X.md", tab.id);
    });

    it("keeps Unix paths case-sensitive", () => {
      const tab = createTab("split", 50, "/home/paw/x.md");
      tabsState.tabs = [tab];

      expect(findTabByPath("/home/Paw/x.md")).toBeUndefined();
    });

    it("ignores verbatim (\\\\?\\) prefixes on either side", () => {
      const tab = createTab("split", 50, "\\\\?\\C:\\Users\\paw\\x.md");
      tabsState.tabs = [tab];

      expectFound("C:/Users/paw/x.md", tab.id);
    });

    it("returns undefined when no tab matches", () => {
      tabsState.tabs = [createTab("split", 50, "/home/paw/x.md")];

      expect(findTabByPath("/home/paw/other.md")).toBeUndefined();
      expect(findTabByPath("/home/paw/x.md")).toBeDefined();
    });

    it("skips tabs without a path", () => {
      tabsState.tabs = [createTab("split", 50, null)];

      expect(findTabByPath("/home/paw/x.md")).toBeUndefined();
    });

    it("reads the active tab's path from the file store", () => {
      // The active tab lives in the global stores; its DocTab.file snapshot
      // is stale by design (see module doc in tabs.svelte.ts).
      const tab = createTab("split", 50, "C:\\Users\\paw\\stale.md");
      tabsState.tabs = [tab];
      tabsState.activeId = tab.id;
      fileState.currentFile = "C:/Users/paw/current.md";

      expectFound("C:/Users/paw/current.md", tab.id);
      expect(findTabByPath("C:/Users/paw/stale.md")).toBeUndefined();
    });
  });
});
