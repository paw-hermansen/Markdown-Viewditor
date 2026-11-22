// @vitest-environment jsdom
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Page from "../+page.svelte";
import { hasUnsavedChanges, getSavedContent } from "$lib/stores/editor.svelte";
import { settingsState } from "$lib/stores/settings.svelte";
import { tabPath, tabsState } from "$lib/stores/tabs.svelte";
import { MSG } from "$lib/constants/messages";

const {
  mockInvoke,
  defaultInvoke,
  mockOpenFile,
  mockSaveFile,
  mockSaveFileAs,
  mockShowSaveDialog,
  mockReadFile,
  mockCloseFile,
  mockGetFileName,
  mockGetFileInfo,
  mockCheckExternalModification,
  mockMarkCurrentFileDeleted,
  mockConfirmSaveDiscardCancel,
  mockConfirmOverwrite,
  mockConfirmReload,
  mockConfirmOk,
  mockFileState,
  mockSetZoom,
  mockToastError,
} = vi.hoisted(() => {
  const mockFileState = {
    currentFile: null as string | null,
    recentFiles: [] as string[],
    isLoading: false,
    isLoadingContent: false,
    error: null as string | null,
    currentFileMtime: null as number | null,
    currentFileSize: null as number | null,
    changeStatus: "unchanged" as "unchanged" | "modified" | "deleted",
    externallyModified: false,
    isReadOnly: null as boolean | null,
    forceSaveAs: false,
  };
  // Mirrors the real `opened_urls` report and `canonicalize_paths` behavior
  // (identity) so startup flows the same way it does in the app.
  const defaultInvoke = (cmd: string, args?: { paths?: string[] }) => {
    if (cmd === "opened_urls")
      return Promise.resolve({ opened: [], missing: [] });
    if (cmd === "canonicalize_paths") return Promise.resolve(args?.paths ?? []);
    return Promise.resolve(null);
  };
  return {
    mockInvoke: vi.fn().mockImplementation(defaultInvoke),
    defaultInvoke,
    mockOpenFile: vi.fn().mockResolvedValue(null),
    mockSaveFile: vi.fn().mockResolvedValue(true),
    mockSaveFileAs: vi.fn().mockResolvedValue(null),
    mockShowSaveDialog: vi.fn().mockResolvedValue(null),
    // Like the real readFile: connects the path to the (mocked) file state.
    mockReadFile: vi.fn(),
    mockCloseFile: vi.fn(() => {
      mockFileState.currentFile = null;
      mockFileState.currentFileMtime = null;
      mockFileState.currentFileSize = null;
      mockFileState.changeStatus = "unchanged";
      mockFileState.externallyModified = false;
      mockFileState.isReadOnly = null;
      mockFileState.forceSaveAs = false;
      mockFileState.error = null;
    }),
    mockGetFileName: vi.fn((path: string) => path.split("/").pop() ?? path),
    mockGetFileInfo: vi.fn().mockResolvedValue(null),
    mockCheckExternalModification: vi.fn().mockResolvedValue("unchanged"),
    mockMarkCurrentFileDeleted: vi.fn(),
    mockConfirmSaveDiscardCancel: vi.fn().mockResolvedValue("discard"),
    mockConfirmOverwrite: vi.fn().mockResolvedValue(true),
    mockConfirmReload: vi.fn().mockResolvedValue(true),
    mockConfirmOk: vi.fn().mockResolvedValue(true),
    mockFileState,
    mockSetZoom: vi.fn().mockResolvedValue(undefined),
    mockToastError: vi.fn(),
  };
});

/** Invoke mock whose `opened_urls` report carries `opened`/`missing`. */
function stubOpenedUrls(opened: string[], missing: string[] = []) {
  mockInvoke.mockImplementation((cmd: string, args?: { paths?: string[] }) => {
    if (cmd === "opened_urls") return Promise.resolve({ opened, missing });
    if (cmd === "canonicalize_paths") return Promise.resolve(args?.paths ?? []);
    return Promise.resolve(null);
  });
}

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
  openPath: vi.fn(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(() => () => {}),
    onFocusChanged: vi.fn(() => () => {}),
  }),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: mockSetZoom }),
}));

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: mockFileState,
  openFile: mockOpenFile,
  showOpenDialog: vi.fn().mockResolvedValue(null),
  saveFile: mockSaveFile,
  saveFileAs: mockSaveFileAs,
  showSaveDialog: mockShowSaveDialog,
  readFile: mockReadFile,
  closeFile: mockCloseFile,
  clearError: vi.fn(),
  getFileName: mockGetFileName,
  getFileMtime: vi.fn().mockResolvedValue(null),
  getFileInfo: mockGetFileInfo,
  checkExternalModification: mockCheckExternalModification,
  markCurrentFileDeleted: mockMarkCurrentFileDeleted,
}));

vi.mock("$lib/stores/confirm.svelte", () => ({
  confirmState: { current: null },
  confirmSaveDiscardCancel: mockConfirmSaveDiscardCancel,
  confirmOverwrite: mockConfirmOverwrite,
  confirmReload: mockConfirmReload,
  confirmOk: mockConfirmOk,
  resolveConfirm: vi.fn(),
}));

vi.mock("$lib/stores/toast.svelte", () => ({
  toastState: { items: [] },
  toast: { error: mockToastError, info: vi.fn(), warning: vi.fn() },
  dismiss: vi.fn(),
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  DEFAULT_CONTENT: "# Hello World\n\nStart writing markdown here...",
  editorState: {
    content: "",
    cursorLine: 1,
    cursorCol: 1,
    wordCount: 0,
  },
  updateContent: vi.fn(),
  updateCursorPosition: vi.fn(),
  markSaved: vi.fn(),
  getSavedContent: vi.fn(() => ""),
  resetEditor: vi.fn(),
  hasUnsavedChanges: vi.fn(() => false),
  updateWordCount: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: {
    viewMode: "split",
    editorFontSize: 14,
    editorFontFamily: "monospace",
    editorLineNumbers: true,
    editorWordWrap: false,
    viewerTheme: "github-dark",
    splitRatio: 0.5,
    lastOpenedFile: null,
    openTabs: [] as { path: string; viewMode: string; splitRatio: number }[],
    activeTab: 0,
    recentFiles: [],
    zoomLevel: 1,
  },
  loadSettings: vi.fn().mockResolvedValue(undefined),
  updateViewMode: vi.fn(),
  updateTheme: vi.fn(),
  updateRecentFiles: vi.fn(),
  updateLastOpenedFile: vi.fn(),
  updateSplitRatio: vi.fn(),
  updateSetting: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  viewerState: { theme: "github-dark" },
  setTheme: vi.fn(),
  getThemeType: () => "dark",
}));

vi.mock("$lib/utils/themes", () => ({
  applyTheme: vi.fn().mockResolvedValue(undefined),
  registerUserThemes: vi.fn(),
  getAllThemes: () => [],
  getThemeById: () => undefined,
  getThemeLabel: (id: string) => id,
}));

vi.mock("$lib/utils/markdown", () => ({
  renderMarkdown: vi.fn().mockResolvedValue({ html: "", frontmatter: null }),
}));

vi.mock("$lib/utils/theme-css", () => ({
  setTheme: vi.fn(),
}));

vi.mock("$lib/utils/scroll-sync", () => ({
  createScrollSync: vi.fn(() => ({
    destroy: vi.fn(),
    updateViewerElement: vi.fn(),
  })),
}));

vi.mock("$lib/components/Editor/Editor.svelte", () => ({
  default: () => "Editor",
}));
vi.mock("$lib/components/Viewer/Viewer.svelte", () => ({
  default: () => "Viewer",
}));
vi.mock("$lib/components/Editor/EditorToolbar.svelte", () => ({
  default: () => "EditorToolbar",
}));
vi.mock("$lib/components/Viewer/ViewerToolbar.svelte", () => ({
  default: () => "ViewerToolbar",
}));
vi.mock("$lib/components/Layout/AppLayout.svelte", async () => ({
  default: (await import("./AppLayoutStub.svelte")).default,
}));
vi.mock("$lib/components/CommandPalette/CommandPalette.svelte", () => ({
  default: () => "CommandPalette",
}));
vi.mock("$lib/components/About/AboutDialog.svelte", () => ({
  default: () => "AboutDialog",
}));
vi.mock("$lib/components/ConfirmDialog.svelte", () => ({
  default: () => "ConfirmDialog",
}));
vi.mock("$lib/components/Toaster.svelte", () => ({
  default: () => "Toaster",
}));

describe("+page.svelte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(defaultInvoke);
    mockReadFile.mockImplementation(async (path: string) => {
      mockFileState.currentFile = path;
      return "# doc";
    });
    mockFileState.currentFile = null;
    mockFileState.externallyModified = false;
    mockFileState.changeStatus = "unchanged";
    mockFileState.isReadOnly = null;
    mockFileState.forceSaveAs = false;
    mockFileState.currentFileMtime = null;
    mockFileState.currentFileSize = null;
    mockConfirmSaveDiscardCancel.mockResolvedValue("discard");
    mockConfirmOverwrite.mockResolvedValue(true);
    mockConfirmReload.mockResolvedValue(true);
    mockConfirmOk.mockResolvedValue(true);
    mockCheckExternalModification.mockResolvedValue("unchanged");
    settingsState.openTabs = [];
    settingsState.activeTab = 0;
    settingsState.lastOpenedFile = null;
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
  });

  it("opens the initial file reported by Tauri on mount", async () => {
    stubOpenedUrls(["/home/user/initial.md"]);
    render(Page);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("opened_urls");
    });
    expect(mockReadFile).toHaveBeenCalledWith("/home/user/initial.md");
    expect(tabsState.tabs.map(tabPath)).toEqual(["/home/user/initial.md"]);
  });

  it("renders without errors", async () => {
    const { container } = render(Page);
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it("does not call saveFile when there are no unsaved changes and no external modifications", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
    mockFileState.currentFile = "/test/file.md";
    mockFileState.externallyModified = false;

    render(Page);
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(mockSaveFile).not.toHaveBeenCalled();
    });
  });

  it("calls saveFile when there are unsaved changes", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(true);
    mockFileState.currentFile = "/test/file.md";
    mockFileState.externallyModified = false;

    render(Page);
    await fireEvent.keyDown(window, { code: "KeyS", ctrlKey: true });

    await waitFor(() => {
      expect(mockSaveFile).toHaveBeenCalledWith(
        "/test/file.md",
        expect.any(String),
      );
    });
  });

  it("calls saveFile when file is externally modified even without unsaved changes", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
    mockFileState.currentFile = "/test/file.md";
    mockFileState.changeStatus = "modified";
    mockCheckExternalModification.mockResolvedValue("modified");

    render(Page);
    await fireEvent.keyDown(window, { code: "KeyS", ctrlKey: true });

    await waitFor(() => {
      expect(mockSaveFile).toHaveBeenCalled();
    });
  });

  it("triggers Save As on Ctrl+Shift+S with uppercase key", async () => {
    mockShowSaveDialog.mockResolvedValueOnce("/test/new-file.md");
    render(Page);
    await fireEvent.keyDown(window, {
      code: "KeyS",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(mockShowSaveDialog).toHaveBeenCalled();
    });
  });

  it("triggers Save As on Ctrl+Shift+S with lowercase key (macOS compat)", async () => {
    mockShowSaveDialog.mockResolvedValueOnce("/test/new-file.md");
    render(Page);
    await fireEvent.keyDown(window, {
      code: "KeyS",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(mockShowSaveDialog).toHaveBeenCalled();
    });
  });

  it("does not trigger Save As on Ctrl+S without Shift", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
    mockFileState.currentFile = "/test/file.md";
    render(Page);
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(mockShowSaveDialog).not.toHaveBeenCalled();
    });
  });

  it("triggers Quit on Ctrl+Q", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(false);
    render(Page);
    await fireEvent.keyDown(window, { code: "KeyQ", ctrlKey: true });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_window_state");
    });
  });

  it("opens a new tab on Ctrl+N without an unsaved-changes prompt", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(true);
    render(Page);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("opened_urls"));
    await fireEvent.keyDown(window, { code: "KeyN", ctrlKey: true });

    await waitFor(() => expect(tabsState.tabs).toHaveLength(2));
    expect(mockConfirmSaveDiscardCancel).not.toHaveBeenCalled();
  });

  it("restores saved tabs, reading only the active tab's file", async () => {
    settingsState.openTabs = [
      { path: "/a/one.md", viewMode: "split", splitRatio: 0.5 },
      { path: "/b/two.md", viewMode: "viewer", splitRatio: 0.3 },
    ];
    settingsState.activeTab = 1;
    mockReadFile.mockResolvedValue("# two");
    render(Page);

    await waitFor(() => expect(mockReadFile).toHaveBeenCalledWith("/b/two.md"));
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    // waitFor: the phantom first tab is dropped only after the active tab's
    // file read resolves.
    await waitFor(() =>
      expect(tabsState.tabs.map((t) => t.file.currentFile)).toEqual([
        "/a/one.md",
        "/b/two.md",
      ]),
    );
    mockReadFile.mockResolvedValue(null);
  });

  it("asks about every tab with unsaved changes on Quit", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(true);
    render(Page);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("opened_urls"));
    await fireEvent.keyDown(window, { code: "KeyN", ctrlKey: true });
    await waitFor(() => expect(tabsState.tabs).toHaveLength(2));
    // Parked tabs compare content "" against the saved baseline "x" → dirty.
    tabsState.tabs[0].saved = "x";
    vi.mocked(getSavedContent).mockReturnValue("x");
    // Give both tabs file paths so each prompt names its document.
    tabsState.tabs[0].file.currentFile = "/a/one.md";
    tabsState.tabs[1].file.currentFile = "/b/two.md";
    mockFileState.currentFile = "/b/two.md";

    await fireEvent.keyDown(window, { code: "KeyQ", ctrlKey: true });

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_window_state"),
    );
    expect(mockConfirmSaveDiscardCancel).toHaveBeenCalledTimes(2);
    // Each dialog is titled with the document it concerns.
    expect(mockConfirmSaveDiscardCancel.mock.calls.map((c) => c[2])).toEqual([
      "one.md",
      "two.md",
    ]);
    expect(mockConfirmSaveDiscardCancel.mock.calls.map((c) => c[0])).toEqual([
      MSG.exitUnsaved,
      MSG.exitUnsaved,
    ]);
    vi.mocked(getSavedContent).mockReturnValue("");
  });

  it("names the document in the unsaved-changes prompt when closing a tab", async () => {
    vi.mocked(hasUnsavedChanges).mockReturnValue(true);
    const { getByLabelText } = render(Page);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("opened_urls"));
    await fireEvent.keyDown(window, { code: "KeyN", ctrlKey: true });
    await waitFor(() => expect(tabsState.tabs).toHaveLength(2));
    // The first tab is parked now, so its label tracks its own reactive path.
    tabsState.tabs[0].file.currentFile = "/a/one.md";
    // Parked tabs compare content "" against the saved baseline "x" → dirty.
    tabsState.tabs[0].saved = "x";

    const close = await waitFor(() => getByLabelText("Close one.md"));
    await fireEvent.click(close);

    await waitFor(() =>
      expect(mockConfirmSaveDiscardCancel).toHaveBeenCalledWith(
        MSG.closeTabUnsaved,
        "warning",
        "one.md",
      ),
    );
  });

  it("zooms in on Ctrl+= and Ctrl++ (character-based, layout-safe)", async () => {
    settingsState.zoomLevel = 1;
    render(Page);
    await fireEvent.keyDown(window, { key: "=", ctrlKey: true });

    await waitFor(() => {
      expect(mockSetZoom).toHaveBeenCalledWith(1.1);
    });

    await fireEvent.keyDown(window, { key: "+", ctrlKey: true });
    await waitFor(() => {
      expect(mockSetZoom).toHaveBeenCalledWith(1.25);
    });
  });

  it("zooms out on Ctrl+-", async () => {
    settingsState.zoomLevel = 1;
    render(Page);
    await fireEvent.keyDown(window, { key: "-", ctrlKey: true });

    await waitFor(() => {
      expect(mockSetZoom).toHaveBeenCalledWith(0.9);
    });
  });

  it("resets zoom on Ctrl+0", async () => {
    settingsState.zoomLevel = 1;
    render(Page);
    await fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    await waitFor(() => {
      expect(mockSetZoom).toHaveBeenCalledWith(1.1);
    });

    await fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    await waitFor(() => {
      expect(mockSetZoom).toHaveBeenLastCalledWith(1);
    });
  });

  it("opens each command-line file in its own tab and activates the first", async () => {
    stubOpenedUrls(["/a/one.md", "/b/two.md"]);
    render(Page);

    await waitFor(() =>
      expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md", "/b/two.md"]),
    );
    expect(mockReadFile).toHaveBeenCalledWith("/a/one.md");
    expect(mockReadFile).toHaveBeenCalledWith("/b/two.md");
    // The first command-line file is the primary document.
    expect(tabsState.activeId).toBe(tabsState.tabs[0].id);
  });

  it("opens a file listed twice on the command line only once", async () => {
    stubOpenedUrls(["/a/one.md", "/a/one.md"]);
    render(Page);

    await waitFor(() =>
      expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md"]),
    );
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("opens a command-line file only once when it is also restored from a previous session", async () => {
    settingsState.openTabs = [
      { path: "/a/one.md", viewMode: "split", splitRatio: 0.5 },
      { path: "/b/two.md", viewMode: "split", splitRatio: 0.5 },
    ];
    settingsState.activeTab = 0;
    stubOpenedUrls(["/a/one.md"]);
    render(Page);

    await waitFor(() =>
      expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md", "/b/two.md"]),
    );
    // The restored tab is reused: the file is read exactly once.
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledWith("/a/one.md");
    expect(tabsState.activeId).toBe(tabsState.tabs[0].id);
  });

  it("restores a file persisted twice as a single tab", async () => {
    settingsState.openTabs = [
      { path: "/a/one.md", viewMode: "split", splitRatio: 0.5 },
      { path: "/a/one.md", viewMode: "viewer", splitRatio: 0.3 },
    ];
    settingsState.activeTab = 0;
    render(Page);

    await waitFor(() =>
      expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md"]),
    );
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("reuses the first tab for a command-line file instead of leaving a phantom tab", async () => {
    // fileState starts with the stale lastOpenedFile handle (store init).
    settingsState.lastOpenedFile = "/old.md";
    mockFileState.currentFile = "/old.md";
    stubOpenedUrls(["/new.md"]);
    render(Page);

    await waitFor(() => expect(mockReadFile).toHaveBeenCalledWith("/new.md"));
    // Only the command-line file's tab exists; no phantom "/old.md" tab.
    expect(tabsState.tabs.map(tabPath)).toEqual(["/new.md"]);
    expect(tabsState.activeId).toBe(tabsState.tabs[0].id);
  });

  it("opens a command-line file that is also the persisted last file once", async () => {
    settingsState.lastOpenedFile = "/a/one.md";
    mockFileState.currentFile = "/a/one.md";
    stubOpenedUrls(["/a/one.md"]);
    render(Page);

    // Without dropping the stale handle first, the empty first tab is
    // mistaken for the open file and the read never happens.
    await waitFor(() => expect(mockReadFile).toHaveBeenCalledWith("/a/one.md"));
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md"]);
    expect(tabsState.activeId).toBe(tabsState.tabs[0].id);
  });

  it("reports all missing command-line files in one error toast", async () => {
    stubOpenedUrls(["/a/one.md"], ["/nope1.md", "/nope2.md"]);
    render(Page);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        MSG.filesNotFound,
        "/nope1.md\n/nope2.md",
        10_000,
      ),
    );
    // The file that exists still opens.
    expect(tabsState.tabs.map(tabPath)).toEqual(["/a/one.md"]);
  });

  it("reports a single missing command-line file with the singular message", async () => {
    stubOpenedUrls([], ["/nope.md"]);
    render(Page);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        MSG.fileNotFound,
        "/nope.md",
        10_000,
      ),
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("offers reload when the active file was genuinely modified on disk", async () => {
    settingsState.openTabs = [
      { path: "/r/Rendering-All.md", viewMode: "split", splitRatio: 0.5 },
    ];
    settingsState.activeTab = 0;
    stubOpenedUrls(["/s/Simple.md", "/r/Rendering-All.md"]);
    mockCheckExternalModification.mockResolvedValue("modified");
    render(Page);

    await waitFor(() =>
      expect(mockConfirmReload).toHaveBeenCalledWith(
        MSG.externalModifiedClean,
        false,
      ),
    );
  });

  it("does not flag a freshly opened file when a tab switch races the disk check", async () => {
    settingsState.openTabs = [
      { path: "/r/Rendering-All.md", viewMode: "split", splitRatio: 0.5 },
    ];
    settingsState.activeTab = 0;
    stubOpenedUrls(["/s/Simple.md", "/r/Rendering-All.md"]);
    let resolveCheck: (status: string) => void = () => {};
    mockCheckExternalModification.mockImplementation(
      () => new Promise((r) => (resolveCheck = r)),
    );
    render(Page);

    // Startup switches across loaded tabs: restore Rendering-All, open
    // Simple, switch to the restored Rendering-All tab (dedupe) and back to
    // Simple (primary file). The disk check starts on Rendering-All and its
    // result is still in flight when the switch to Simple lands.
    await waitFor(() =>
      expect(mockCheckExternalModification).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(tabsState.activeId).toBe(
        tabsState.tabs.find((t) => tabPath(t) === "/s/Simple.md")!.id,
      ),
    );

    resolveCheck("modified");
    await new Promise((r) => setTimeout(r, 20));
    // The stale verdict must not surface against the newly opened file.
    expect(mockConfirmReload).not.toHaveBeenCalled();
    expect(mockFileState.changeStatus).toBe("unchanged");
    expect(mockFileState.externallyModified).toBe(false);
  });
});
