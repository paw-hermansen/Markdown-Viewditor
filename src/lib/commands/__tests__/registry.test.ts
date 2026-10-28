// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerCommands,
  clearCommands,
  listCommands,
  getCommand,
  runCommand,
  handleGlobalKeydown,
} from "../registry.svelte";

describe("command registry", () => {
  beforeEach(() => clearCommands());

  it("registers and lists commands", () => {
    registerCommands([
      { id: "a", title: "A", category: "File", run: () => {} },
    ]);
    expect(listCommands()).toHaveLength(1);
    expect(getCommand("a")?.title).toBe("A");
  });

  it("runCommand calls run with zero arguments", async () => {
    const run = vi.fn();
    registerCommands([{ id: "b", title: "B", category: "File", run }]);
    await runCommand("b");
    expect(run).toHaveBeenCalledWith();
  });

  it("runCommand respects enabled", async () => {
    const run = vi.fn();
    registerCommands([
      { id: "c", title: "C", category: "File", run, enabled: () => false },
    ]);
    await runCommand("c");
    expect(run).not.toHaveBeenCalled();
  });

  it("matcher uses e.code for letters", () => {
    const run = vi.fn();
    registerCommands([
      {
        id: "d",
        title: "D",
        category: "File",
        shortcut: { code: "KeyN", mod: true, shift: "any" },
        run,
      },
    ]);
    const e = new KeyboardEvent("keydown", { code: "KeyN", ctrlKey: true });
    const handled = handleGlobalKeydown(e, {});
    expect(handled).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it("matcher uses e.key for zoom symbols incl Numpad0", () => {
    const run = vi.fn();
    registerCommands([
      {
        id: "z",
        title: "Z",
        category: "View",
        shortcut: { keys: ["0"], code: "Numpad0", mod: true, shift: "any" },
        run,
      },
    ]);
    const e = new KeyboardEvent("keydown", {
      code: "Numpad0",
      key: "Insert",
      ctrlKey: true,
    });
    expect(handleGlobalKeydown(e, {})).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it("guard blocks when loading", () => {
    const run = vi.fn();
    registerCommands([
      {
        id: "g",
        title: "G",
        category: "File",
        shortcut: { code: "KeyN", mod: true, shift: "any" },
        run,
      },
    ]);
    const e = new KeyboardEvent("keydown", { code: "KeyN", ctrlKey: true });
    expect(handleGlobalKeydown(e, { isLoading: true })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
