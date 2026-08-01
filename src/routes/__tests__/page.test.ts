// @vitest-environment jsdom
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Page from "../+page.svelte";
import { hasUnsavedChanges } from "$lib/stores/editor.svelte";

const {
  mockInvoke,
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
  mockConfirmYesNo,
  mockConfirmOk,
  mockFileState,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue(null),
  mockOpenFile: vi.fn().mockResolvedValue(null),
  mockSaveFile: vi.fn().mockResolvedValue(true),
  mockSaveFileAs: vi.fn().mockResolvedValue(null),
  mockShowSaveDialog: vi.fn().mockResolvedValue(null),
  mockReadFile: vi.fn().mockResolvedValue(null),
  mockCloseFile: vi.fn(),
  mockGetFileName: vi.fn((path: string) => path.split("/").pop() ?? path),
  mockGetFileInfo: vi.fn().mockResolvedValue(null),
  mockCheckExternalModification: vi.fn().mockResolvedValue("unchanged"),
  mockMarkCurrentFileDeleted: vi.fn(),
  mockConfirmSaveDiscardCancel: vi.fn().mockResolvedValue("discard"),
  mockConfirmYesNo: vi.fn().mockResolvedValue(true),
  mockConfirmOk: vi.fn().mockResolvedValue(true),
  mockFileState: {
    currentFile: null as string | null,
    recentFiles: [] as string[],
    isLoading: false,
    error: null as string | null,
    currentFileMtime: null as number | null,
    currentFileSize: null as number | null,
    changeStatus: "unchanged" as "unchanged" | "modified" | "deleted",
    externallyModified: false,
    isReadOnly: null as boolean | null,
    forceSaveAs: false,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
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

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: mockFileState,
  openFile: mockOpenFile,
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
  confirmYesNo: mockConfirmYesNo,
  confirmOk: mockConfirmOk,
  isConfirmOpen: () => false,
  resolveConfirm: vi.fn(),
}));

vi.mock("$lib/stores/toast.svelte", () => ({
  toastState: { items: [] },
  toast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  dismiss: vi.fn(),
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: {
    content: "",
    cursorLine: 1,
    cursorCol: 1,
    wordCount: 0,
    isModified: false,
  },
  updateContent: vi.fn(),
  updateCursorPosition: vi.fn(),
  markSaved: vi.fn(),
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
    recentFiles: [],
  },
  loadSettings: vi.fn().mockResolvedValue(undefined),
  updateViewMode: vi.fn(),
  updateTheme: vi.fn(),
  updateRecentFiles: vi.fn(),
  updateLastOpenedFile: vi.fn(),
  updateSplitRatio: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  viewerState: { theme: "github-dark", scrollTop: 0 },
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
vi.mock("$lib/components/Layout/AppLayout.svelte", () => ({
  default: () => "AppLayout",
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
    mockFileState.currentFile = null;
    mockFileState.externallyModified = false;
    mockFileState.changeStatus = "unchanged";
    mockFileState.isReadOnly = null;
    mockFileState.forceSaveAs = false;
    mockFileState.currentFileMtime = null;
    mockFileState.currentFileSize = null;
    mockConfirmSaveDiscardCancel.mockResolvedValue("discard");
    mockConfirmYesNo.mockResolvedValue(true);
    mockConfirmOk.mockResolvedValue(true);
    mockCheckExternalModification.mockResolvedValue("unchanged");
  });

  it("loads initial file from Tauri on mount", async () => {
    mockInvoke.mockResolvedValueOnce("/home/user/initial.md");
    render(Page);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_initial_file");
    });
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
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

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
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(mockSaveFile).toHaveBeenCalled();
    });
  });

  it("triggers Save As on Ctrl+Shift+S with uppercase key", async () => {
    mockShowSaveDialog.mockResolvedValueOnce("/test/new-file.md");
    render(Page);
    await fireEvent.keyDown(window, {
      key: "S",
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
      key: "s",
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
    await fireEvent.keyDown(window, { key: "q", ctrlKey: true });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_window_state");
    });
  });
});
