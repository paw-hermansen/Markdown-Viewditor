// @vitest-environment jsdom
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import StatusBar from "../StatusBar.svelte";

const { mockEditorState, mockFileState } = vi.hoisted(() => ({
  mockEditorState: {
    content: "test content",
    cursorLine: 5,
    cursorCol: 12,
    wordCount: 42,
    isModified: false,
  },
  mockFileState: {
    currentFile: "/home/user/document.md" as string | null,
    recentFiles: [] as string[],
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: mockEditorState,
}));

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: mockFileState,
  getFileName: vi.fn((path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  }),
}));

describe("StatusBar", () => {
  it("displays the filename from currentFile", () => {
    render(StatusBar);
    expect(screen.getByText("document.md")).toBeInTheDocument();
  });

  it("displays 'Untitled' when no file is open", () => {
    mockFileState.currentFile = null;
    render(StatusBar);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
    mockFileState.currentFile = "/home/user/document.md";
  });

  it("displays cursor position", () => {
    render(StatusBar);
    expect(screen.getByText("Line 5, Col 12")).toBeInTheDocument();
  });

  it("displays word count", () => {
    render(StatusBar);
    expect(screen.getByText("42 words")).toBeInTheDocument();
  });

  it("displays Markdown and UTF-8 indicators", () => {
    render(StatusBar);
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getByText("UTF-8")).toBeInTheDocument();
  });

  it("shows modified indicator when isModified is true", () => {
    mockEditorState.isModified = true;
    render(StatusBar);
    const fileNameSpan = screen.getByText((_, element) => {
      return element?.classList.contains("file-name") === true;
    });
    expect(fileNameSpan.textContent).toContain("*");
    mockEditorState.isModified = false;
  });
});
