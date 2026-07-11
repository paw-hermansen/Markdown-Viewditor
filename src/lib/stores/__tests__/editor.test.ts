import { describe, it, expect, beforeEach } from "vitest";
import {
  editorState,
  updateContent,
  updateCursorPosition,
  updateWordCount,
  markSaved,
  hasUnsavedChanges,
  resetEditor,
} from "../editor.svelte";

describe("editor store", () => {
  beforeEach(() => {
    resetEditor();
  });

  describe("updateWordCount", () => {
    it("should count words correctly", () => {
      updateWordCount("Hello World");
      expect(editorState.wordCount).toBe(2);
    });

    it("should handle empty string", () => {
      updateWordCount("");
      expect(editorState.wordCount).toBe(0);
    });

    it("should handle whitespace-only string", () => {
      updateWordCount("   ");
      expect(editorState.wordCount).toBe(0);
    });

    it("should count multiple words", () => {
      updateWordCount("one two three four five");
      expect(editorState.wordCount).toBe(5);
    });

    it("should handle multiple spaces between words", () => {
      updateWordCount("hello   world");
      expect(editorState.wordCount).toBe(2);
    });

    it("should handle newlines", () => {
      updateWordCount("line one\nline two");
      expect(editorState.wordCount).toBe(4);
    });
  });

  describe("updateContent", () => {
    it("should update content in state", () => {
      updateContent("# New Content");
      expect(editorState.content).toBe("# New Content");
    });

    it("should update word count", () => {
      updateContent("Hello World");
      expect(editorState.wordCount).toBe(2);
    });

    it("should mark as modified when content differs from saved", () => {
      markSaved();
      updateContent("changed content");
      expect(editorState.isModified).toBe(true);
    });

    it("should not be modified when content matches saved", () => {
      updateContent("same content");
      markSaved();
      updateContent("same content");
      expect(editorState.isModified).toBe(false);
    });
  });

  describe("updateCursorPosition", () => {
    it("should update cursor line and column", () => {
      updateCursorPosition(5, 12);
      expect(editorState.cursorLine).toBe(5);
      expect(editorState.cursorCol).toBe(12);
    });

    it("should handle position 1,1", () => {
      updateCursorPosition(1, 1);
      expect(editorState.cursorLine).toBe(1);
      expect(editorState.cursorCol).toBe(1);
    });
  });

  describe("markSaved", () => {
    it("should set isModified to false", () => {
      updateContent("changed");
      expect(editorState.isModified).toBe(true);
      markSaved();
      expect(editorState.isModified).toBe(false);
    });

    it("should save current content as baseline", () => {
      updateContent("saved content");
      markSaved();
      expect(hasUnsavedChanges()).toBe(false);
    });
  });

  describe("hasUnsavedChanges", () => {
    it("should return false for initial state", () => {
      expect(hasUnsavedChanges()).toBe(false);
    });

    it("should return true after content change", () => {
      markSaved();
      updateContent("new content");
      expect(hasUnsavedChanges()).toBe(true);
    });

    it("should return false after marking saved", () => {
      updateContent("content");
      markSaved();
      expect(hasUnsavedChanges()).toBe(false);
    });

    it("should return true when changing back to different content", () => {
      updateContent("original");
      markSaved();
      updateContent("changed");
      updateContent("original");
      expect(hasUnsavedChanges()).toBe(false);
    });
  });

  describe("resetEditor", () => {
    it("should reset all state to defaults", () => {
      updateContent("some content");
      updateCursorPosition(5, 10);
      markSaved();
      updateContent("changed");

      resetEditor();

      expect(editorState.content).toBe("");
      expect(editorState.cursorLine).toBe(1);
      expect(editorState.cursorCol).toBe(1);
      expect(editorState.wordCount).toBe(0);
      expect(editorState.isModified).toBe(false);
    });

    it("should reset saved content baseline", () => {
      updateContent("content");
      markSaved();
      resetEditor();
      expect(hasUnsavedChanges()).toBe(false);
    });
  });
});
