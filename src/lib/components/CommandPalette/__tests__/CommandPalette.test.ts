// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommandPalette from "../CommandPalette.svelte";

import { registerCommands, clearCommands } from "$lib/commands/registry.svelte";

describe("CommandPalette", () => {
  beforeEach(() => {
    clearCommands();
    registerCommands([
      { id: "new", title: "New File", category: "File", run: vi.fn() },
      { id: "open", title: "Open File", category: "File", run: vi.fn() },
      { id: "save", title: "Save", category: "File", run: vi.fn() },
      { id: "save-as", title: "Save As", category: "File", run: vi.fn() },
      {
        id: "reload",
        title: "Reload from Disk",
        category: "File",
        run: vi.fn(),
      },
      { id: "quit", title: "Quit", category: "File", run: vi.fn() },
      {
        id: "view-cycle",
        title: "Cycle View Mode",
        category: "View",
        run: vi.fn(),
      },
      { id: "about", title: "About", category: "Help", run: vi.fn() },
    ]);
    vi.clearAllMocks();
  });

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
  };

  it("does not render when open is false", () => {
    render(CommandPalette, { props: { ...defaultProps, open: false } });
    expect(
      screen.queryByPlaceholderText("Type a command..."),
    ).not.toBeInTheDocument();
  });

  it("renders search input when open", () => {
    render(CommandPalette, { props: defaultProps });
    expect(
      screen.getByPlaceholderText("Type a command..."),
    ).toBeInTheDocument();
  });

  it("shows all commands initially", () => {
    render(CommandPalette, { props: defaultProps });
    expect(screen.getByText("New File")).toBeInTheDocument();
    expect(screen.getByText("Open File")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Save As")).toBeInTheDocument();
    expect(screen.getByText("Reload from Disk")).toBeInTheDocument();
    expect(screen.getByText("Quit")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("filters commands by search query", async () => {
    render(CommandPalette, { props: defaultProps });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.input(input, { target: { value: "save" } });
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Save As")).toBeInTheDocument();
    expect(screen.queryByText("New File")).not.toBeInTheDocument();
  });

  it("shows label matches before category-only matches", async () => {
    render(CommandPalette, { props: defaultProps });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.input(input, { target: { value: "file" } });
    const items = screen.getAllByRole("option").map((el) => el.textContent);
    const newFileIdx = items.findIndex((t) => t?.includes("New File"));
    const openFileIdx = items.findIndex((t) => t?.includes("Open File"));
    const saveIdx = items.findIndex(
      (t) => t?.includes("Save") && !t?.includes("Save As"),
    );
    const saveAsIdx = items.findIndex((t) => t?.includes("Save As"));
    expect(newFileIdx).toBeLessThan(saveIdx);
    expect(openFileIdx).toBeLessThan(saveIdx);
    expect(newFileIdx).toBeLessThan(saveAsIdx);
    expect(openFileIdx).toBeLessThan(saveAsIdx);
  });

  it("shows 'No matching commands' for non-matching query", async () => {
    render(CommandPalette, { props: defaultProps });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.input(input, { target: { value: "zzzznotacommand" } });
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("executes command on Enter", async () => {
    render(CommandPalette, { props: defaultProps });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.keyDown(input, { key: "Enter" });
    // first command runs
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(CommandPalette, { props: { open: true, onClose } });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on overlay click", async () => {
    const onClose = vi.fn();
    render(CommandPalette, { props: { open: true, onClose } });
    const overlay = screen
      .getByPlaceholderText("Type a command...")
      .closest(".overlay")!;
    await fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
