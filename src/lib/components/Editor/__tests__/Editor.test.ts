// @vitest-environment jsdom
import { render } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Editor from "../Editor.svelte";

const {
  mockEditorState,
  mockSettingsState,
  mockViewerState,
  mockGetThemeType,
} = vi.hoisted(() => ({
  mockEditorState: {
    content: "",
    cursorLine: 1,
    cursorCol: 1,
    wordCount: 0,
    isModified: false,
  },
  mockSettingsState: {
    editorLineNumbers: true,
    editorWordWrap: false,
  },
  mockViewerState: { theme: "github-dark", scrollTop: 0 },
  mockGetThemeType: vi.fn().mockReturnValue("dark"),
}));

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: mockEditorState,
  updateContent: vi.fn(),
  updateCursorPosition: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  viewerState: mockViewerState,
  getThemeType: mockGetThemeType,
}));

vi.mock("$lib/utils/markdown", () => ({
  setTheme: vi.fn(),
}));

describe("Editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditorState.content = "";
    mockViewerState.theme = "github-dark";
    mockSettingsState.editorLineNumbers = true;
    mockSettingsState.editorWordWrap = false;
  });

  it("renders CodeMirror editor container", () => {
    render(Editor, { props: { content: "# Hello" } });
    expect(document.querySelector(".editor-container")).toBeInTheDocument();
  });

  it("renders a div element for CodeMirror mount", () => {
    render(Editor, { props: { content: "# Hello" } });
    const editorDiv = document.querySelector(".editor-container > div");
    expect(editorDiv).toBeInTheDocument();
  });

  it("accepts content prop", () => {
    const { component } = render(Editor, {
      props: { content: "# Test Content" },
    });
    expect(component).toBeDefined();
  });

  it("accepts onContentChange callback", () => {
    const onContentChange = vi.fn();
    const { component } = render(Editor, {
      props: { content: "# Test", onContentChange },
    });
    expect(component).toBeDefined();
  });
});
