import type { EditorState } from "$lib/types";

export const editorState = $state<EditorState>({
  content: "# Hello World\n\nStart writing markdown here...",
  cursorLine: 1,
  cursorCol: 1,
  wordCount: 0,
  isModified: false,
});

export function updateContent(newContent: string) {
  editorState.content = newContent;
  editorState.isModified = true;
  updateWordCount(newContent);
}

export function updateCursorPosition(line: number, col: number) {
  editorState.cursorLine = line;
  editorState.cursorCol = col;
}

export function updateWordCount(content: string) {
  const trimmed = content.trim();
  if (trimmed === "") {
    editorState.wordCount = 0;
  } else {
    editorState.wordCount = trimmed.split(/\s+/).length;
  }
}

export function markSaved() {
  editorState.isModified = false;
}

export function resetEditor() {
  editorState.content = "";
  editorState.cursorLine = 1;
  editorState.cursorCol = 1;
  editorState.wordCount = 0;
  editorState.isModified = false;
}
