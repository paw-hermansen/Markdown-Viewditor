// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppLayout from "../AppLayout.svelte";

const { mockSettingsState, mockUpdateSplitRatio } = vi.hoisted(() => ({
  mockSettingsState: {
    splitRatio: 0.5,
    viewMode: "split" as const,
    editorFontSize: 14,
    editorFontFamily: "monospace",
    editorLineNumbers: true,
    editorWordWrap: false,
    viewerTheme: "github-dark",
    lastOpenedFile: null,
    recentFiles: [],
  },
  mockUpdateSplitRatio: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
  updateSplitRatio: mockUpdateSplitRatio,
}));

vi.mock("../ViewToggle.svelte", () => ({
  default: () => "ViewToggle",
}));

vi.mock("../StatusBar.svelte", () => ({
  default: () => "StatusBar",
}));

describe("AppLayout", () => {
  const defaultProps = {
    viewMode: "split" as const,
    onViewModeChange: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onReload: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onAbout: vi.fn(),
    isModified: false,
    fileName: "test.md",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsState.splitRatio = 0.5;
  });

  it("renders header toolbar with action buttons", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: () => "content" },
    });
    expect(screen.getByTitle("New file (Ctrl+N)")).toBeInTheDocument();
    expect(screen.getByTitle("Open file (Ctrl+O)")).toBeInTheDocument();
    expect(screen.getByTitle("Save (Ctrl+S)")).toBeInTheDocument();
    expect(screen.getByTitle("About (F1)")).toBeInTheDocument();
  });

  it("calls onNew on New button click", async () => {
    const onNew = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onNew, children: () => "" },
    });
    await fireEvent.click(screen.getByTitle("New file (Ctrl+N)"));
    expect(onNew).toHaveBeenCalled();
  });

  it("calls onOpen on Open button click", async () => {
    const onOpen = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onOpen, children: () => "" },
    });
    await fireEvent.click(screen.getByTitle("Open file (Ctrl+O)"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("calls onSave on Save button click", async () => {
    const onSave = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onSave, children: () => "" },
    });
    await fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onAbout on About button click", async () => {
    const onAbout = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onAbout, children: () => "" },
    });
    await fireEvent.click(screen.getByTitle("About (F1)"));
    expect(onAbout).toHaveBeenCalled();
  });

  it("renders resize handle", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: () => "" },
    });
    expect(document.querySelector(".resize-handle")).toBeInTheDocument();
  });
});
