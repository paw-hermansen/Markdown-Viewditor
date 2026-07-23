// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommandPalette from "../CommandPalette.svelte";

describe("CommandPalette", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onReload: vi.fn(),
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

  it("shows view mode commands", () => {
    render(CommandPalette, { props: defaultProps });
    expect(screen.getByText("Split View")).toBeInTheDocument();
    expect(screen.getByText("Editor Only")).toBeInTheDocument();
    expect(screen.getByText("Viewer Only")).toBeInTheDocument();
  });
});
