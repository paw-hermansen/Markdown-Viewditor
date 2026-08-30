// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommandPalette from "../CommandPalette.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

describe("CommandPalette", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onReload: vi.fn(),
    onQuit: vi.fn(),
    viewMode: "split" as const,
    onViewModeChange: vi.fn(),
    onAbout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    // "New File" and "Open File" match on label → should come first
    // "Save" and "Save As" match only on category → should come after
    expect(newFileIdx).toBeLessThan(saveIdx);
    expect(openFileIdx).toBeLessThan(saveIdx);
    expect(newFileIdx).toBeLessThan(saveAsIdx);
    expect(openFileIdx).toBeLessThan(saveAsIdx);
  });

  it("shows 'No matching commands' for non-matching query", async () => {
    render(CommandPalette, { props: defaultProps });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.input(input, { target: { value: "zzzznonexistent" } });
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    render(CommandPalette, { props: { ...defaultProps, onClose } });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls appropriate callback on Enter key", async () => {
    const onSave = vi.fn();
    render(CommandPalette, { props: { ...defaultProps, onSave } });
    const input = screen.getByPlaceholderText("Type a command...");
    await fireEvent.input(input, { target: { value: "Save" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", async () => {
    const onClose = vi.fn();
    render(CommandPalette, { props: { ...defaultProps, onClose } });
    const overlay = document.querySelector(".overlay");
    if (overlay) await fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("executes command and closes on click", async () => {
    const onClose = vi.fn();
    const onNew = vi.fn();
    render(CommandPalette, { props: { ...defaultProps, onClose, onNew } });
    await fireEvent.click(screen.getByText("New File"));
    expect(onNew).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows cycle view mode command", () => {
    render(CommandPalette, { props: defaultProps });
    expect(screen.getByText("Cycle View Mode")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(CommandPalette, { props: defaultProps });
    await checkA11y(container);
  });
});
