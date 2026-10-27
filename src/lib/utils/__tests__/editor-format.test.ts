/**
 * Characterization tests for the editor's formatting engine (pure
 * transforms). These pin the user-visible toggle heuristics that were
 * previously only covered by the manual test plan (TEST-PLAN 4.20):
 * wrap/unwrap symmetry, the italic ladder, the inline⇄fenced code
 * round-trip, the heading level cycle and cursor placement.
 */
import { describe, expect, it } from "vitest";
import {
  insertFormattingEdit,
  insertLinkEdit,
  toggleCodeEdit,
  toggleItalicEdit,
  wrapSelectionEdit,
} from "$lib/utils/editor-format";

describe("wrapSelectionEdit", () => {
  it("wraps the selection in the delimiters, selecting the text", () => {
    const edit = wrapSelectionEdit("hello world", 6, 11, "**", "**");
    expect(edit.changes).toEqual({ from: 6, to: 11, insert: "**world**" });
    expect(edit.selection).toEqual({ anchor: 8, head: 13 });
  });

  it("unwraps when the delimiters hug the selection", () => {
    const edit = wrapSelectionEdit("**world**", 2, 7, "**", "**");
    expect(edit.changes).toEqual({ from: 0, to: 9, insert: "world" });
    expect(edit.selection).toEqual({ anchor: 0, head: 5 });
  });

  it("round-trips: wrap then unwrap returns to the original text and selection", () => {
    const wrapped = wrapSelectionEdit("hello world", 6, 11, "**", "**");
    const docAfter = apply("hello world", wrapped);
    const unwrapped = wrapSelectionEdit(
      docAfter,
      wrapped.selection.anchor,
      wrapped.selection.head,
      "**",
      "**",
    );
    expect(apply(docAfter, unwrapped)).toBe("hello world");
    expect(unwrapped.selection).toEqual({ anchor: 6, head: 11 });
  });

  it("inserts a 'text' placeholder when nothing is selected", () => {
    const edit = wrapSelectionEdit("ab", 2, 2, "**", "**");
    expect(edit.changes).toEqual({ from: 2, to: 2, insert: "**text**" });
    expect(edit.selection).toEqual({ anchor: 4, head: 8 });
  });

  it("does the same for strikethrough and highlight delimiters", () => {
    const strike = wrapSelectionEdit("hello world", 6, 11, "~~", "~~");
    expect(strike.changes.insert).toBe("~~world~~");
    const highlight = wrapSelectionEdit("hello world", 6, 11, "==", "==");
    expect(highlight.changes.insert).toBe("==world==");
  });
});

describe("toggleItalicEdit", () => {
  it("wraps a plain selection in single asterisks", () => {
    const edit = toggleItalicEdit("hello", 2, 5);
    expect(edit.changes).toEqual({ from: 2, to: 5, insert: "*llo*" });
    expect(edit.selection).toEqual({ anchor: 3, head: 6 });
  });

  it("unwraps a single-asterisk wrap", () => {
    const edit = toggleItalicEdit("*x*", 1, 2);
    expect(edit.changes).toEqual({ from: 0, to: 3, insert: "x" });
    expect(edit.selection).toEqual({ anchor: 0, head: 1 });
  });

  it("climbs the ladder: **x** → ***x***", () => {
    const edit = toggleItalicEdit("**x**", 2, 3);
    expect(edit.changes).toEqual({ from: 0, to: 5, insert: "***x***" });
    expect(edit.selection).toEqual({ anchor: 3, head: 4 });
  });

  it("descends the ladder: ***x*** → **x**", () => {
    const edit = toggleItalicEdit("***x***", 3, 4);
    expect(edit.changes).toEqual({ from: 0, to: 7, insert: "**x**" });
    expect(edit.selection).toEqual({ anchor: 2, head: 3 });
  });

  it("inserts a 'text' placeholder when nothing is selected", () => {
    const edit = toggleItalicEdit("", 0, 0);
    expect(edit.changes).toEqual({ from: 0, to: 0, insert: "*text*" });
    expect(edit.selection).toEqual({ anchor: 1, head: 5 });
  });
});

describe("insertLinkEdit", () => {
  it("wraps the selection in a link template", () => {
    const edit = insertLinkEdit("hello", 2, 5);
    expect(edit.changes).toEqual({ from: 2, to: 5, insert: "[llo](url)" });
    expect(edit.selection).toEqual({ anchor: 3, head: 6 });
  });

  it("uses the 'text' placeholder when nothing is selected", () => {
    const edit = insertLinkEdit("ab", 2, 2);
    expect(edit.changes).toEqual({ from: 2, to: 2, insert: "[text](url)" });
    expect(edit.selection).toEqual({ anchor: 3, head: 7 });
  });
});

describe("toggleCodeEdit", () => {
  it("inserts inline code with the 'code' placeholder when nothing is selected", () => {
    const edit = toggleCodeEdit("ab", 2, 2);
    expect(edit.changes).toEqual({ from: 2, to: 2, insert: "`code`" });
    expect(edit.selection).toEqual({ anchor: 3, head: 7 });
  });

  it("converts inline code to a fenced block, consuming one trailing space", () => {
    // "say `hi` now" with "hi" selected (5..7).
    const edit = toggleCodeEdit("say `hi` now", 5, 7);
    expect(edit.changes).toEqual({
      from: 4,
      to: 9,
      insert: "\n```\nhi\n```\n",
    });
    expect(edit.selection).toEqual({ anchor: 9, head: 11 });
    expect(apply("say `hi` now", edit)).toBe("say \n```\nhi\n```\nnow");
  });

  it("round-trips: inline → block → inline restores the exact text and selection", () => {
    const toBlock = toggleCodeEdit("say `hi` now", 5, 7);
    const docAfter = apply("say `hi` now", toBlock);
    const toInline = toggleCodeEdit(
      docAfter,
      toBlock.selection.anchor,
      toBlock.selection.head,
    );
    expect(apply(docAfter, toInline)).toBe("say `hi` now");
    expect(toInline.selection).toEqual({ anchor: 5, head: 7 });
  });

  it("keeps an empty line above the block when unwrapping (symmetric toggling)", () => {
    // "\n```\nhi\n```\nx" with "hi" selected (5..7): the blank line before
    // the block was not added by the inline→block conversion, so the
    // leading newline survives the unwrap.
    const edit = toggleCodeEdit("\n```\nhi\n```\nx", 5, 7);
    expect(apply("\n```\nhi\n```\nx", edit)).toBe("\n`hi` x");
  });
});

describe("insertFormattingEdit", () => {
  it("cycles the heading level 1 → 2 … 6 → plain", () => {
    // Plain line → "## …" with the text selected.
    const plain = insertFormattingEdit("hello", 2, 2, "heading")!;
    expect(plain.changes).toEqual({ from: 0, to: 5, insert: "## hello" });
    expect(plain.selection).toEqual({ anchor: 3, head: 8 });

    // "## hello" → "### hello".
    const up = insertFormattingEdit("## hello", 4, 4, "heading")!;
    expect(up.changes).toEqual({ from: 0, to: 8, insert: "### hello" });
    expect(up.selection).toEqual({ anchor: 4, head: 9 });

    // "###### hello" (level 6) → strips the heading markers.
    const off = insertFormattingEdit("###### hello", 9, 9, "heading")!;
    expect(off.changes).toEqual({ from: 0, to: 12, insert: "hello" });
    expect(off.selection).toEqual({ anchor: 0, head: 5 });
  });

  it("places the cursor around the placeholder for list formats", () => {
    // cursorBefore formats select the placeholder with the caret at its start.
    const bullet = insertFormattingEdit("ab", 2, 2, "bullet")!;
    expect(bullet.changes).toEqual({ from: 2, to: 2, insert: "- item" });
    expect(bullet.selection).toEqual({ anchor: 8, head: 4 });

    const numbered = insertFormattingEdit("ab", 2, 2, "numbered")!;
    expect(numbered.changes).toEqual({ from: 2, to: 2, insert: "1. item" });
    expect(numbered.selection).toEqual({ anchor: 9, head: 5 });

    const task = insertFormattingEdit("ab", 2, 2, "task")!;
    expect(task.changes).toEqual({ from: 2, to: 2, insert: "- [ ] task" });
    expect(task.selection).toEqual({ anchor: 12, head: 8 });

    const quote = insertFormattingEdit("ab", 2, 2, "quote")!;
    expect(quote.changes).toEqual({ from: 2, to: 2, insert: "> quote" });
    expect(quote.selection).toEqual({ anchor: 4, head: 9 });

    const image = insertFormattingEdit("ab", 2, 2, "image")!;
    expect(image.changes).toEqual({ from: 2, to: 2, insert: "![alt](url)" });
    expect(image.selection).toEqual({ anchor: 4, head: 7 });
  });

  it("keeps the selected text in list/image replacements", () => {
    const bullet = insertFormattingEdit("ab", 0, 2, "bullet")!;
    expect(bullet.changes).toEqual({ from: 0, to: 2, insert: "- ab" });
    expect(bullet.selection).toEqual({ anchor: 4, head: 2 });

    const image = insertFormattingEdit("ab", 0, 2, "image")!;
    expect(image.changes).toEqual({ from: 0, to: 2, insert: "![ab](url)" });
  });

  it("inserts an hr below the cursor", () => {
    const edit = insertFormattingEdit("x", 1, 1, "hr")!;
    expect(edit.changes).toEqual({ from: 1, to: 1, insert: "\n---\n" });
    expect(edit.selection).toEqual({ anchor: 5, head: 5 });
  });

  it("delegates the toggle formats to their commands", () => {
    expect(insertFormattingEdit("hello", 2, 5, "bold")).toEqual(
      wrapSelectionEdit("hello", 2, 5, "**", "**"),
    );
    expect(insertFormattingEdit("hello", 2, 5, "italic")).toEqual(
      toggleItalicEdit("hello", 2, 5),
    );
    expect(insertFormattingEdit("hello", 2, 5, "strikethrough")).toEqual(
      wrapSelectionEdit("hello", 2, 5, "~~", "~~"),
    );
    expect(insertFormattingEdit("hello", 2, 5, "highlight")).toEqual(
      wrapSelectionEdit("hello", 2, 5, "==", "=="),
    );
    expect(insertFormattingEdit("ab", 2, 2, "code")).toEqual(
      toggleCodeEdit("ab", 2, 2),
    );
    expect(insertFormattingEdit("hello", 2, 5, "link")).toEqual(
      insertLinkEdit("hello", 2, 5),
    );
  });

  it("is a no-op for unknown format ids", () => {
    expect(insertFormattingEdit("hello", 2, 5, "bogus")).toBeNull();
  });
});

/** Apply an edit to a document string (test helper). */
function apply(
  docText: string,
  edit: { changes: { from: number; to: number; insert: string } },
): string {
  return (
    docText.slice(0, edit.changes.from) +
    edit.changes.insert +
    docText.slice(edit.changes.to)
  );
}
