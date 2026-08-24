// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import EditorToolbar from "../EditorToolbar.svelte";

describe("EditorToolbar", () => {
  it("renders all 13 format buttons", () => {
    render(EditorToolbar, { props: { onFormat: vi.fn() } });
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(13);
  });

  it("calls onFormat with correct format id on click", async () => {
    const onFormat = vi.fn();
    render(EditorToolbar, { props: { onFormat } });

    const boldButton = screen.getByTitle("Bold (Ctrl+B)");
    await fireEvent.click(boldButton);
    expect(onFormat).toHaveBeenCalledWith("bold");

    const italicButton = screen.getByTitle("Italic (Ctrl+I)");
    await fireEvent.click(italicButton);
    expect(onFormat).toHaveBeenCalledWith("italic");

    const linkButton = screen.getByTitle("Link (Ctrl+K)");
    await fireEvent.click(linkButton);
    expect(onFormat).toHaveBeenCalledWith("link");
  });

  it("calls onFormat for all format types", async () => {
    const onFormat = vi.fn();
    render(EditorToolbar, { props: { onFormat } });

    const expectedFormats = [
      { title: "Bold (Ctrl+B)", id: "bold" },
      { title: "Italic (Ctrl+I)", id: "italic" },
      { title: "Strikethrough (Ctrl+Shift+X)", id: "strikethrough" },
      { title: "Highlight (Ctrl+Shift+M)", id: "highlight" },
      { title: "Heading (Ctrl+Shift+H)", id: "heading" },
      { title: "Link (Ctrl+K)", id: "link" },
      { title: "Image (Ctrl+Shift+I)", id: "image" },
      { title: "Code (Ctrl+E, toggles)", id: "code" },
      { title: "Bullet List (Ctrl+Shift+8)", id: "bullet" },
      { title: "Numbered List (Ctrl+Shift+7)", id: "numbered" },
      { title: "Task List", id: "task" },
      { title: "Blockquote", id: "quote" },
      { title: "Horizontal Rule", id: "hr" },
    ];

    for (const { title, id } of expectedFormats) {
      onFormat.mockClear();
      const button = screen.getByTitle(title);
      await fireEvent.click(button);
      expect(onFormat).toHaveBeenCalledWith(id);
    }
  });

  it("prevents default on mousedown", async () => {
    const onFormat = vi.fn();
    render(EditorToolbar, { props: { onFormat } });

    const boldButton = screen.getByTitle("Bold (Ctrl+B)");
    const event = new MouseEvent("mousedown", { bubbles: true });
    const spy = vi.spyOn(event, "preventDefault");
    await fireEvent(boldButton, event);
    expect(spy).toHaveBeenCalled();
  });

  it("renders buttons with correct title attributes", () => {
    render(EditorToolbar, { props: { onFormat: vi.fn() } });

    expect(screen.getByTitle("Bold (Ctrl+B)")).toBeInTheDocument();
    expect(screen.getByTitle("Italic (Ctrl+I)")).toBeInTheDocument();
    expect(
      screen.getByTitle("Strikethrough (Ctrl+Shift+X)"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Highlight (Ctrl+Shift+M)")).toBeInTheDocument();
    expect(screen.getByTitle("Heading (Ctrl+Shift+H)")).toBeInTheDocument();
    expect(screen.getByTitle("Link (Ctrl+K)")).toBeInTheDocument();
    expect(screen.getByTitle("Image (Ctrl+Shift+I)")).toBeInTheDocument();
    expect(screen.getByTitle("Code (Ctrl+E, toggles)")).toBeInTheDocument();
    expect(screen.getByTitle("Bullet List (Ctrl+Shift+8)")).toBeInTheDocument();
    expect(
      screen.getByTitle("Numbered List (Ctrl+Shift+7)"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Task List")).toBeInTheDocument();
    expect(screen.getByTitle("Blockquote")).toBeInTheDocument();
    expect(screen.getByTitle("Horizontal Rule")).toBeInTheDocument();
  });
});
