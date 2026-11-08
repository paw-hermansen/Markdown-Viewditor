// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import type { Snippet } from "svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppLayout from "../AppLayout.svelte";
import { registerCommands, clearCommands } from "$lib/commands/registry.svelte";
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
    zoomLevel: 1,
  },
  mockUpdateSplitRatio: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
  updateSplitRatio: mockUpdateSplitRatio,
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: { content: "" },
  hasUnsavedChanges: () => false,
}));

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null, isLoading: false },
  getFileName: (p: string) => p.split("/").pop() ?? p,
}));

vi.mock("$lib/stores/update.svelte", () => ({
  updateStatus: { available: false, version: "" },
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearCommands();
    registerCommands([
      {
        id: "file.new",
        title: "New File",
        category: "File",
        shortcut: { code: "KeyN", mod: true, shift: "any" },
        run: vi.fn(),
      },
      {
        id: "file.open",
        title: "Open File",
        category: "File",
        shortcut: { code: "KeyO", mod: true, shift: "any" },
        run: vi.fn(),
      },
      {
        id: "file.save",
        title: "Save",
        category: "File",
        shortcut: { code: "KeyS", mod: true, shift: false },
        run: vi.fn(),
      },
      {
        id: "file.save-as",
        title: "Save As",
        category: "File",
        shortcut: { code: "KeyS", mod: true, shift: true },
        run: vi.fn(),
      },
      {
        id: "file.reload",
        title: "Reload from Disk",
        category: "File",
        shortcut: { code: "KeyR", mod: true, shift: "any" },
        run: vi.fn(),
      },
      {
        id: "help.about",
        title: "About",
        category: "Help",
        shortcut: { code: "F1", mod: false, shift: false },
        run: vi.fn(),
      },
    ]);
    mockSettingsState.splitRatio = 0.5;
  });

  it("renders header toolbar with action buttons", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet("content") },
    });
    expect(screen.getByTitle("New File (Ctrl+N)")).toBeInTheDocument();
    expect(screen.getByTitle("Open File (Ctrl+O)")).toBeInTheDocument();
    expect(screen.getByTitle("Save (Ctrl+S)")).toBeInTheDocument();
    expect(screen.getByTitle("About (F1)")).toBeInTheDocument();
  });

  it("calls file.new on New button click", async () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("New File (Ctrl+N)"));
    const cmd = (await import("$lib/commands/registry.svelte")).getCommand(
      "file.new",
    );
    expect(cmd?.run).toHaveBeenCalled();
  });

  it("calls file.open on Open button click", async () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("Open File (Ctrl+O)"));
    const cmd = (await import("$lib/commands/registry.svelte")).getCommand(
      "file.open",
    );
    expect(cmd?.run).toHaveBeenCalled();
  });

  it("invokes toolbar commands with no arguments", async () => {
    const reg = await import("$lib/commands/registry.svelte");
    const onNew = reg.getCommand("file.new")!.run as ReturnType<typeof vi.fn>;
    const onOpen = reg.getCommand("file.open")!.run as ReturnType<typeof vi.fn>;
    const onSave = reg.getCommand("file.save")!.run as ReturnType<typeof vi.fn>;
    const onSaveAs = reg.getCommand("file.save-as")!.run as ReturnType<
      typeof vi.fn
    >;
    const onReload = reg.getCommand("file.reload")!.run as ReturnType<
      typeof vi.fn
    >;
    const onAbout = reg.getCommand("help.about")!.run as ReturnType<
      typeof vi.fn
    >;

    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("New File (Ctrl+N)"));
    await fireEvent.click(screen.getByTitle("Open File (Ctrl+O)"));
    await fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    await fireEvent.click(screen.getByTitle("Save As (Ctrl+Shift+S)"));
    await fireEvent.click(screen.getByTitle("Reload from Disk (Ctrl+R)"));
    await fireEvent.click(screen.getByTitle("About (F1)"));

    expect(onNew).toHaveBeenCalledWith();
    expect(onOpen).toHaveBeenCalledWith();
    expect(onSave).toHaveBeenCalledWith();
    expect(onSaveAs).toHaveBeenCalledWith();
    expect(onReload).toHaveBeenCalledWith();
    expect(onAbout).toHaveBeenCalledWith();
  });

  it("calls file.save on Save button click", async () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("Save (Ctrl+S)"));
    const cmd = (await import("$lib/commands/registry.svelte")).getCommand(
      "file.save",
    );
    expect(cmd?.run).toHaveBeenCalled();
  });

  it("calls help.about on About button click", async () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("About (F1)"));
    const cmd = (await import("$lib/commands/registry.svelte")).getCommand(
      "help.about",
    );
    expect(cmd?.run).toHaveBeenCalled();
  });

  it("renders resize handle", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    expect(document.querySelector(".resize-handle")).toBeInTheDocument();
  });

  it("does not show update icon when updateAvailable is false", () => {
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    expect(screen.queryByTitle(/Update available/)).not.toBeInTheDocument();
  });

  it("shows update icon when updateAvailable is true", async () => {
    const { updateStatus } = await import("$lib/stores/update.svelte");
    updateStatus.available = true;
    updateStatus.version = "1.2.0";
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    expect(screen.getByTitle("Update available: v1.2.0")).toBeInTheDocument();
    updateStatus.available = false;
    updateStatus.version = "";
  });

  it("calls help.about when update icon is clicked", async () => {
    const { updateStatus } = await import("$lib/stores/update.svelte");
    updateStatus.available = true;
    updateStatus.version = "1.2.0";
    render(AppLayout, {
      props: { ...defaultProps, children: snippet() },
    });
    await fireEvent.click(screen.getByTitle("Update available: v1.2.0"));
    const cmd = (await import("$lib/commands/registry.svelte")).getCommand(
      "help.about",
    );
    expect(cmd?.run).toHaveBeenCalled();
    updateStatus.available = false;
    updateStatus.version = "";
  });

  it("has no accessibility violations", async () => {
    const { container } = render(AppLayout, {
      props: { ...defaultProps, children: snippet("content") },
    });
    await checkA11y(container);
  });

  describe("split resize handle", () => {
    function setup(viewMode: "split" | "editor" | "viewer") {
      const onViewModeChange = vi.fn();
      render(AppLayout, {
        props: { viewMode, onViewModeChange, children: snippet("content") },
      });
      const content = document.querySelector(".content")!;
      vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        top: 0,
        right: 1000,
        bottom: 800,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect);
      const handle = document.querySelector(".resize-handle")!;
      return { onViewModeChange, handle };
    }

    function drag(handle: Element, fromX: number, toX: number) {
      fireEvent.mouseDown(handle, { clientX: fromX });
      fireEvent.mouseMove(document, { clientX: toX });
      fireEvent.mouseUp(document);
    }

    it("dragging to the left edge switches to viewer-only mode", () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 5);
      expect(onViewModeChange).toHaveBeenCalledWith("viewer");
      expect(mockUpdateSplitRatio).not.toHaveBeenCalled();
    });

    it("dragging to the right edge switches to editor-only mode", () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 995);
      expect(onViewModeChange).toHaveBeenCalledWith("editor");
      expect(mockUpdateSplitRatio).not.toHaveBeenCalled();
    });

    it("dragging in the middle keeps split mode and saves the ratio", () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 300);
      expect(onViewModeChange).not.toHaveBeenCalled();
      expect(mockUpdateSplitRatio).toHaveBeenCalledWith(0.3);
    });

    it("dropping near the center snaps to a 50% split", () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 490);
      expect(onViewModeChange).not.toHaveBeenCalled();
      expect(mockUpdateSplitRatio).toHaveBeenCalledWith(0.5);
    });

    it("starting a drag outside split mode switches to split first", () => {
      const { onViewModeChange, handle } = setup("editor");
      fireEvent.mouseDown(handle, { clientX: 500 });
      expect(onViewModeChange).toHaveBeenCalledWith("split");
      fireEvent.mouseUp(document);
    });

    it("double-clicking the handle resets to a 50% split", () => {
      const { onViewModeChange, handle } = setup("editor");
      fireEvent.doubleClick(handle);
      expect(onViewModeChange).toHaveBeenCalledWith("split");
      expect(mockUpdateSplitRatio).toHaveBeenCalledWith(0.5);
    });

    it("pressing without moving is a click: no ratio commit, no mode change", () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 900); // previous drag ended at 0.9
      mockUpdateSplitRatio.mockClear();
      fireEvent.mouseDown(handle, { clientX: 500 });
      fireEvent.mouseUp(document);
      expect(mockUpdateSplitRatio).not.toHaveBeenCalled();
      expect(onViewModeChange).not.toHaveBeenCalled();
    });

    it("pressing the handle shows the saved ratio, not the previous drag position", async () => {
      const { handle } = setup("split");
      drag(handle, 500, 900); // previous drag's raw position: 0.9
      const content = document.querySelector(".content")!;
      fireEvent.mouseDown(handle, { clientX: 500 });
      await tick();
      expect(content.getAttribute("style")).toMatch(/--split-ratio:\s*0\.5\b/);
      fireEvent.mouseUp(document);
    });

    it("pressing the handle picks up a saved ratio changed outside a drag", async () => {
      const { handle } = setup("split");
      // The saved ratio can change after mount (settings load, double-click).
      mockSettingsState.splitRatio = 0.7;
      const content = document.querySelector(".content")!;
      fireEvent.mouseDown(handle, { clientX: 500 });
      await tick();
      expect(content.getAttribute("style")).toMatch(/--split-ratio:\s*0\.7\b/);
      fireEvent.mouseUp(document);
    });

    it("a click without movement outside split mode is a no-op", () => {
      const { onViewModeChange, handle } = setup("editor");
      fireEvent.mouseDown(handle, { clientX: 500 });
      expect(onViewModeChange).toHaveBeenLastCalledWith("split");
      fireEvent.mouseUp(document);
      expect(onViewModeChange).toHaveBeenLastCalledWith("editor");
      expect(mockUpdateSplitRatio).not.toHaveBeenCalled();
    });

    it("double-click centers even after an edge drag left a stale ratio", async () => {
      const { onViewModeChange, handle } = setup("split");
      drag(handle, 500, 995); // edge: mode switches, ratio unsaved, drag copy = 0.995
      mockUpdateSplitRatio.mockClear();
      onViewModeChange.mockClear();
      // A real double-click is two full click sequences followed by dblclick.
      for (let i = 0; i < 2; i++) {
        fireEvent.mouseDown(handle, { clientX: 500 });
        fireEvent.mouseUp(document);
        fireEvent.click(handle);
        expect(mockUpdateSplitRatio).not.toHaveBeenCalled();
        expect(onViewModeChange).not.toHaveBeenCalled();
      }
      fireEvent.doubleClick(handle);
      expect(mockUpdateSplitRatio).toHaveBeenLastCalledWith(0.5);
      // Both ratio copies are in sync now: the next press shows 0.5.
      const content = document.querySelector(".content")!;
      fireEvent.mouseDown(handle, { clientX: 500 });
      await tick();
      expect(content.getAttribute("style")).toMatch(/--split-ratio:\s*0\.5\b/);
      fireEvent.mouseUp(document);
    });
  });
});
