// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import type { Snippet } from "svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppLayout from "../AppLayout.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

const snippet = (content = "") => (() => content) as unknown as Snippet;

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
    markdownLevel: "advanced" as const,
    enabledFeatures: [] as string[],
  },
  mockUpdateSplitRatio: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
  updateSplitRatio: mockUpdateSplitRatio,
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: { content: "" },
}));

vi.mock("$lib/stores/markdown-levels.svelte", () => ({
  startLevelAnalysis: () => () => {},
  levelState: { violations: [] },
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
    onUpdateClick: vi.fn(),
    updateAvailable: false,
    updateVersion: "",
    isModified: false,
    fileName: "test.md",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsState.splitRatio = 0.5;
  });

  it("renders header toolbar with action buttons", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet("content") },
    });
    expect(screen.getByTitle("New file (Ctrl+N)")).toBeInTheDocument();
    expect(screen.getByTitle("Open file (Ctrl+O)")).toBeInTheDocument();
    expect(screen.getByTitle("Save (Ctrl+S)")).toBeInTheDocument();
    expect(screen.getByTitle("About (F1)")).toBeInTheDocument();
  });

  it("calls onNew on New button click", async () => {
    const onNew = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onNew, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("New file (Ctrl+N)"));
    expect(onNew).toHaveBeenCalled();
  });

  it("calls onOpen on Open button click", async () => {
    const onOpen = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onOpen, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("Open file (Ctrl+O)"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("calls onSave on Save button click", async () => {
    const onSave = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onSave, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onAbout on About button click", async () => {
    const onAbout = vi.fn();
    render(AppLayout, {
      props: { ...defaultProps, onAbout, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("About (F1)"));
    expect(onAbout).toHaveBeenCalled();
  });

  it("renders resize handle", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    expect(document.querySelector(".resize-handle")).toBeInTheDocument();
  });

  it("does not show update icon when updateAvailable is false", () => {
    render(AppLayout, {
      props: { ...defaultProps, updateAvailable: false, children: snippet() },
    });
    expect(screen.queryByTitle(/Update available/)).not.toBeInTheDocument();
  });

  it("shows update icon when updateAvailable is true", () => {
    render(AppLayout, {
      props: {
        ...defaultProps,
        updateAvailable: true,
        updateVersion: "1.2.0",
        children: snippet(),
      },
    });
    expect(screen.getByTitle("Update available: v1.2.0")).toBeInTheDocument();
  });

  it("calls onUpdateClick when update icon is clicked", async () => {
    const onUpdateClick = vi.fn();
    render(AppLayout, {
      props: {
        ...defaultProps,
        updateAvailable: true,
        updateVersion: "1.2.0",
        onUpdateClick,
        children: snippet(),
      },
    });
    await fireEvent.click(screen.getByTitle("Update available: v1.2.0"));
    expect(onUpdateClick).toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(AppLayout, {
      props: { ...defaultProps, children: snippet("content") },
    });
    await checkA11y(container);
  });
});
