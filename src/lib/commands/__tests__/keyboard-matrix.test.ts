// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearCommands,
  registerCommands,
  handleGlobalKeydown,
} from "../registry.svelte";
import { buildPageCommands, type PageCommandHandlers } from "../page-commands";

/**
 * Regression net for the keyboard matrix. Drives the *real* command table
 * (buildPageCommands) through the global matcher, pinning each binding's
 * current shift/alt semantics — including the quirks (Mod+N/O/R fire with
 * Shift held) that PR-15 preserved.
 */

function makeHandlers() {
  return {
    handleNew: vi.fn(),
    handleOpen: vi.fn(),
    handleSave: vi.fn(),
    handleSaveAs: vi.fn(),
    handleReload: vi.fn(),
    handleExit: vi.fn(),
    handlePrint: vi.fn(),
    togglePalette: vi.fn(),
    cycleViewMode: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetZoom: vi.fn(),
    handleFormatDocument: vi.fn(),
    handleAbout: vi.fn(),
    handleFormat: vi.fn(),
  } satisfies PageCommandHandlers;
}

type H = ReturnType<typeof makeHandlers>;

function setup(): H {
  clearCommands();
  const h = makeHandlers();
  registerCommands(buildPageCommands(h, { exportOnly: false }));
  return h;
}

function press(init: KeyboardEventInit): boolean {
  return handleGlobalKeydown(new KeyboardEvent("keydown", init), {});
}

describe("keyboard matrix", () => {
  beforeEach(() => setup());

  it.each([
    ["file.new", "KeyN", { ctrlKey: true }, "handleNew"],
    [
      "file.new (Shift quirk)",
      "KeyN",
      { ctrlKey: true, shiftKey: true },
      "handleNew",
    ],
    ["file.open", "KeyO", { ctrlKey: true }, "handleOpen"],
    [
      "file.open (Shift quirk)",
      "KeyO",
      { ctrlKey: true, shiftKey: true },
      "handleOpen",
    ],
    ["file.reload", "KeyR", { ctrlKey: true }, "handleReload"],
    [
      "file.reload (Shift quirk)",
      "KeyR",
      { ctrlKey: true, shiftKey: true },
      "handleReload",
    ],
    ["file.save-as", "KeyS", { ctrlKey: true, shiftKey: true }, "handleSaveAs"],
  ] as const)("%s fires", (_label, code, mods, handler) => {
    const h = setup();
    press({ code, ...mods } as KeyboardEventInit);
    expect(h[handler]).toHaveBeenCalledTimes(1);
  });

  it("file.save fires on Ctrl+S but not Ctrl+Shift+S", () => {
    const h = setup();
    press({ code: "KeyS", ctrlKey: true });
    expect(h.handleSave).toHaveBeenCalledTimes(1);
    press({ code: "KeyS", ctrlKey: true, shiftKey: true });
    expect(h.handleSave).toHaveBeenCalledTimes(1); // not again
    expect(h.handleSaveAs).toHaveBeenCalledTimes(1);
  });

  it("file.new fires with Shift (quirk), not on a bare key", () => {
    const h = setup();
    press({ code: "KeyN", ctrlKey: true, shiftKey: true });
    expect(h.handleNew).toHaveBeenCalledTimes(1);
    press({ code: "KeyN" });
    expect(h.handleNew).toHaveBeenCalledTimes(1); // bare N does nothing
  });

  it("palette.toggle and file.print split on Shift", () => {
    const h = setup();
    press({ code: "KeyP", ctrlKey: true });
    expect(h.handlePrint).toHaveBeenCalledTimes(1);
    expect(h.togglePalette).not.toHaveBeenCalled();
    press({ code: "KeyP", ctrlKey: true, shiftKey: true });
    expect(h.togglePalette).toHaveBeenCalledTimes(1);
    expect(h.handlePrint).toHaveBeenCalledTimes(1);
  });

  it("view.cycle requires Shift", () => {
    const h = setup();
    press({ code: "KeyV", ctrlKey: true });
    expect(h.cycleViewMode).not.toHaveBeenCalled();
    press({ code: "KeyV", ctrlKey: true, shiftKey: true });
    expect(h.cycleViewMode).toHaveBeenCalledTimes(1);
  });

  it("zoom matches e.key symbols, not codes", () => {
    const h = setup();
    press({ code: "Equal", key: "=", ctrlKey: true });
    press({ code: "Equal", key: "+", ctrlKey: true, shiftKey: true });
    expect(h.zoomIn).toHaveBeenCalledTimes(2);
    press({ code: "Minus", key: "-", ctrlKey: true });
    press({ code: "Minus", key: "_", ctrlKey: true, shiftKey: true });
    expect(h.zoomOut).toHaveBeenCalledTimes(2);
    press({ code: "Digit0", key: "0", ctrlKey: true });
    expect(h.resetZoom).toHaveBeenCalledTimes(1);
  });

  it("zoom reset also matches Numpad0 reporting Insert", () => {
    const h = setup();
    press({ code: "Numpad0", key: "Insert", ctrlKey: true });
    expect(h.resetZoom).toHaveBeenCalledTimes(1);
  });

  it("format.document fires on Shift+Alt+F without mod", () => {
    const h = setup();
    press({ code: "KeyF", shiftKey: true, altKey: true });
    expect(h.handleFormatDocument).toHaveBeenCalledTimes(1);
  });

  it("help.about fires on F1, not with mod", () => {
    const h = setup();
    press({ code: "F1" });
    expect(h.handleAbout).toHaveBeenCalledTimes(1);
    press({ code: "F1", ctrlKey: true });
    expect(h.handleAbout).toHaveBeenCalledTimes(1);
  });

  it("matchable:false editor commands never fire from the matcher", () => {
    const h = setup();
    press({ code: "KeyB", ctrlKey: true }); // edit.bold
    press({ code: "KeyX", ctrlKey: true, shiftKey: true }); // edit.strikethrough
    expect(h.handleFormat).not.toHaveBeenCalled();
  });

  it("guards block everything", () => {
    const h = setup();
    handleGlobalKeydown(
      new KeyboardEvent("keydown", { code: "KeyN", ctrlKey: true }),
      {
        isLoading: true,
      },
    );
    handleGlobalKeydown(
      new KeyboardEvent("keydown", { code: "KeyN", ctrlKey: true }),
      {
        exporting: true,
      },
    );
    expect(h.handleNew).not.toHaveBeenCalled();
  });
});
