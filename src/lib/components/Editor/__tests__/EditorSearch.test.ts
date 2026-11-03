// @vitest-environment jsdom
/**
 * Find & replace in the editor's search panel.
 *
 * Moved here from the manual test plan: the search UI is plain
 * @codemirror/search panel DOM driven by keyboard events, so opening the
 * panel, searching and "replace all" are all testable without a human.
 */
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EditorView } from "codemirror";
import Editor from "../Editor.svelte";

const {
  mockEditorState,
  mockSettingsState,
  mockViewerState,
  mockGetThemeType,
  mockLevelState,
} = vi.hoisted(() => ({
  mockEditorState: {
    content: "",
    cursorLine: 1,
    cursorCol: 1,
    wordCount: 0,
  },
  mockSettingsState: {
    editorLineNumbers: true,
    editorWordWrap: false,
    markdownLevel: "advanced",
    enabledFeatures: [] as string[],
  },
  mockViewerState: { theme: "github-dark" },
  mockGetThemeType: vi.fn().mockReturnValue("dark"),
  mockLevelState: {
    violations: [] as Array<{
      id: string;
      label: string;
      presets: { github?: boolean; advanced: boolean };
      lines: number[];
    }>,
  },
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

vi.mock("$lib/stores/markdown-levels.svelte", () => ({
  levelState: mockLevelState,
}));

vi.mock("$lib/utils/markdown-levels", () => ({
  violationMessage: (v: { label: string }) => `${v.label} (warning)`,
}));

vi.mock("$lib/utils/theme-css", () => ({
  setTheme: vi.fn(),
}));

function pressCtrl(view: EditorView, key: string, keyCode: number) {
  const init: KeyboardEventInit = {
    key,
    keyCode,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  };
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", init));
}

function mountWith(content: string) {
  const { component } = render(Editor, { props: { content } });
  return component.getEditorView()!;
}

function field(name: "search" | "replace"): HTMLInputElement {
  return document.querySelector(`input[name="${name}"]`)!;
}

describe("Editor find & replace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsState.editorLineNumbers = true;
    mockSettingsState.editorWordWrap = false;
    mockSettingsState.markdownLevel = "advanced";
    mockSettingsState.enabledFeatures = [];
    mockLevelState.violations = [];
    mockViewerState.theme = "github-dark";
  });

  it("Ctrl+F opens the search panel and Escape closes it", () => {
    const view = mountWith("alpha beta");

    pressCtrl(view, "f", 70);
    expect(document.querySelector(".cm-panel.cm-search")).toBeInTheDocument();
    expect(field("search")).toBeInTheDocument();

    const init: KeyboardEventInit = {
      key: "Escape",
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    };
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", init));
    expect(
      document.querySelector(".cm-panel.cm-search"),
    ).not.toBeInTheDocument();
  });

  it("typing a term in the Find field sets the search query", async () => {
    const view = mountWith("alpha beta alpha gamma alpha");

    pressCtrl(view, "f", 70);
    const search = field("search");
    search.value = "alpha";
    await fireEvent.keyUp(search);

    const { getSearchQuery } = await import("@codemirror/search");
    expect(getSearchQuery(view.state).search).toBe("alpha");
  });

  it("replace all replaces every occurrence and updates the document", async () => {
    const view = mountWith("alpha beta alpha gamma alpha");

    pressCtrl(view, "f", 70);
    const search = field("search");
    search.value = "alpha";
    await fireEvent.keyUp(search);

    const replace = field("replace");
    replace.value = "omega";
    await fireEvent.keyUp(replace);

    await fireEvent.click(document.querySelector('button[name="replaceAll"]')!);
    expect(view.state.doc.toString()).toBe("omega beta omega gamma omega");
  });

  it("replace single replaces the current match (first click selects it)", async () => {
    const view = mountWith("alpha beta alpha");

    pressCtrl(view, "f", 70);
    const search = field("search");
    search.value = "alpha";
    await fireEvent.keyUp(search);

    const replace = field("replace");
    replace.value = "omega";
    await fireEvent.keyUp(replace);

    // First click only moves to the match; the second replaces it.
    // NB: the replace *field* also has name="replace" — select the button.
    const replaceButton = document.querySelector('button[name="replace"]')!;
    await fireEvent.click(replaceButton);
    await fireEvent.click(replaceButton);
    expect(view.state.doc.toString()).toBe("omega beta alpha");
  });
});
