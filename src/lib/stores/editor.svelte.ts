import type { EditorState } from "$lib/types";

export const editorState = $state<EditorState>({
  content: "# Hello World\n\nStart writing markdown here...",
  cursorLine: 1,
  cursorCol: 1,
  wordCount: 6,
});

let savedContent = $state(editorState.content);

export function updateContent(newContent: string) {
  editorState.content = newContent;
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
  savedContent = editorState.content;
}

export function hasUnsavedChanges(): boolean {
  return editorState.content !== savedContent;
}

export function resetEditor() {
  editorState.content = "";
  editorState.cursorLine = 1;
  editorState.cursorCol = 1;
  editorState.wordCount = 0;
  savedContent = "";
}
