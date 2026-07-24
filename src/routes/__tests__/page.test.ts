// @vitest-environment jsdom
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Page from "../+page.svelte";
import { hasUnsavedChanges } from "$lib/stores/editor.svelte";

const {
  mockInvoke,
  mockOpenFile,
  mockSaveFile,
  mockGetFileName,
  mockFileState,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue(null),
  mockOpenFile: vi.fn().mockResolvedValue(null),
  mockSaveFile: vi.fn().mockResolvedValue(true),
  mockGetFileName: vi.fn((path: string) => path.split("/").pop() ?? path),
  mockFileState: {
    currentFile: null as string | null,
    recentFiles: [] as string[],
    isLoading: false,
    error: null as string | null,
    currentFileMtime: null as number | null,
    externallyModified: false,
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  ask: vi.fn().mockResolvedValue(true),
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
  saveFileAs: vi.fn().mockResolvedValue(null),
  showSaveDialog: vi.fn().mockResolvedValue(null),
  readFile: vi.fn().mockResolvedValue(null),
  closeFile: vi.fn(),
  clearError: vi.fn(),
  getFileName: mockGetFileName,
  getFileMtime: vi.fn().mockResolvedValue(null),
  checkExternalModification: vi.fn().mockResolvedValue("unchanged"),
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

describe("+page.svelte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileState.currentFile = null;
    mockFileState.externallyModified = false;
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
    mockFileState.externallyModified = true;

    render(Page);
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(mockSaveFile).toHaveBeenCalled();
    });
  });
});
