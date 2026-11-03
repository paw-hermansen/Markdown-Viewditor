// @vitest-environment jsdom
/**
 * Keyboard formatting shortcuts in the real CodeMirror editor.
 *
 * The pure transforms behind each shortcut are pinned by
 * `src/lib/utils/__tests__/editor-format.test.ts`; this file pins the wiring —
 * that each key combination reaches the right transform through the real
 * keymap / capture handlers (moved here from the manual test plan, which used
 * to check these by hand).
 *
 * The events are constructed the way browsers deliver them (shifted letters
 * arrive as the shifted character, e.g. `key: "X"` for Ctrl+Shift+X, with the
 * physical `keyCode` intact), because CodeMirror's key lookup falls back to
 * the unshifted name via `keyCode`.
 */
import { render } from "@testing-library/svelte";
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

type KeySpec = KeyboardEventInit & { key: string; keyCode: number };

/** Dispatch a keydown the way a browser would deliver it. */
function press(view: EditorView, spec: KeySpec) {
  const init: KeyboardEventInit = { bubbles: true, cancelable: true, ...spec };
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", init));
}

function select(view: EditorView, from: number, to = from) {
  view.dispatch({ selection: { anchor: from, head: to } });
}

function mountWith(content: string) {
  const { component } = render(Editor, { props: { content } });
  return component.getEditorView()!;
}

describe("Editor keyboard formatting shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsState.editorLineNumbers = true;
    mockSettingsState.editorWordWrap = false;
    mockSettingsState.markdownLevel = "advanced";
    mockSettingsState.enabledFeatures = [];
    mockLevelState.violations = [];
    mockViewerState.theme = "github-dark";
  });

  it("Ctrl+B wraps the selection in bold and toggles it back off", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "b", keyCode: 66, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("**hello** world");

    select(view, 2, 7);
    press(view, { key: "b", keyCode: 66, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("hello world");
  });

  it("Ctrl+I toggles italic (capture handler, no keymap entry)", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "i", keyCode: 73, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("*hello* world");

    select(view, 1, 6);
    press(view, { key: "i", keyCode: 73, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("hello world");
  });

  it("Ctrl+Shift+X toggles strikethrough", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "X", keyCode: 88, ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe("~~hello~~ world");
  });

  it("Ctrl+Shift+M toggles highlight", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "M", keyCode: 77, ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe("==hello== world");
  });

  it("Ctrl+Shift+H cycles heading levels", () => {
    const view = mountWith("hello world");
    select(view, 3);

    press(view, { key: "H", keyCode: 72, ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe("## hello world");

    press(view, { key: "H", keyCode: 72, ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe("### hello world");
  });

  it("Ctrl+K inserts a link around the selection", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "k", keyCode: 75, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("[hello](url) world");
  });

  it("Ctrl+Shift+I inserts an image around the selection", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "I", keyCode: 73, ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe("![hello](url) world");
  });

  it("Ctrl+E toggles inline code and then a fenced block", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, { key: "e", keyCode: 69, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("`hello` world");

    select(view, 1, 6);
    press(view, { key: "e", keyCode: 69, ctrlKey: true });
    expect(view.state.doc.toString()).toBe("```\nhello\n```\nworld");
  });

  it("Ctrl+Shift+8 adds a bullet list prefix", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, {
      key: "8",
      code: "Digit8",
      keyCode: 56,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(view.state.doc.toString()).toBe("- hello world");
  });

  it("Ctrl+Shift+7 adds a numbered list prefix", () => {
    const view = mountWith("hello world");
    select(view, 0, 5);

    press(view, {
      key: "7",
      code: "Digit7",
      keyCode: 55,
      ctrlKey: true,
      shiftKey: true,
    });
    expect(view.state.doc.toString()).toBe("1. hello world");
  });
});
