/**
 * The editor's markdown formatting engine.
 *
 * The top half is **pure**: each command is a text/offset transform from
 * `(docText, { from, to })` to a `{ changes, selection }` spec, with no
 * CodeMirror involved — that is what makes the toggle heuristics
 * (wrap/unwrap symmetry, the italic ladder, the inline⇄fenced code
 * round-trip) unit-testable without a DOM. The bottom half is a thin
 * CodeMirror adapter that reads the selection, runs the pure transform and
 * dispatches the result (plus `focus()`, which every command does).
 *
 * Behavior here is user-visible and pinned by
 * __tests__/editor-format.test.ts; the manual regression is TEST-PLAN 4.20.
 */
import type { EditorView } from "codemirror";

/** A whole-or-partial document replacement. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** A selection placement inside the edited text. */
export interface SelectionSpec {
  anchor: number;
  head: number;
}

/** One command's dispatch payload. */
export interface FormatEdit {
  changes: TextEdit;
  selection: SelectionSpec;
}

/* ──────────────────── pure transforms ────────────────────────────────── */

/** `sliceDoc` with CodeMirror's clamping of out-of-range positions. */
function slice(docText: string, from: number, to: number): string {
  const start = Math.max(0, Math.min(docText.length, from));
  const end = Math.max(start, Math.min(docText.length, to));
  return docText.slice(start, end);
}

/** The (content) line containing `pos`, like `doc.lineAt(pos)` (0-based). */
function lineAt(
  docText: string,
  pos: number,
): { from: number; to: number; text: string } {
  const p = Math.max(0, Math.min(docText.length, pos));
  const from = docText.lastIndexOf("\n", p - 1) + 1;
  let to = docText.indexOf("\n", p);
  if (to === -1) to = docText.length;
  return { from, to, text: docText.slice(from, to) };
}

/**
 * Toggle-wrap the selection in delimiters (`**`, `~~`, `==`): unwrap when
 * the delimiters hug the selection, otherwise wrap it (with a `text`
 * placeholder when nothing is selected and the placeholder selected).
 */
export function wrapSelectionEdit(
  docText: string,
  from: number,
  to: number,
  before: string,
  after: string,
): FormatEdit {
  const selectedText = slice(docText, from, to);
  const beforeText = slice(docText, from - before.length, from);
  const afterText = slice(docText, to, to + after.length);
  if (beforeText === before && afterText === after && selectedText.length > 0) {
    return {
      changes: {
        from: from - before.length,
        to: to + after.length,
        insert: selectedText,
      },
      selection: {
        anchor: from - before.length,
        head: from - before.length + selectedText.length,
      },
    };
  }

  const replacement = before + (selectedText || "text") + after;
  return {
    changes: { from, to, insert: replacement },
    selection: {
      anchor: from + before.length,
      head: from + before.length + (selectedText.length || 4),
    },
  };
}

/**
 * The 4-state italic ladder: `***x***` → `**x**` → `***x***` → …, `*x*`
 * unwraps, anything else gets wrapped in `*…*`.
 */
export function toggleItalicEdit(
  docText: string,
  from: number,
  to: number,
): FormatEdit {
  const selectedText = slice(docText, from, to);

  const before1 = slice(docText, from - 1, from);
  const after1 = slice(docText, to, to + 1);
  const before2 = slice(docText, from - 2, from);
  const after2 = slice(docText, to, to + 2);
  const before3 = slice(docText, from - 3, from);
  const after3 = slice(docText, to, to + 3);

  if (before3 === "***" && after3 === "***" && selectedText.length > 0) {
    return {
      changes: {
        from: from - 3,
        to: to + 3,
        insert: "**" + selectedText + "**",
      },
      selection: {
        anchor: from - 1,
        head: from - 1 + selectedText.length,
      },
    };
  } else if (before2 === "**" && after2 === "**" && selectedText.length > 0) {
    return {
      changes: {
        from: from - 2,
        to: to + 2,
        insert: "***" + selectedText + "***",
      },
      selection: {
        anchor: from + 1,
        head: from + 1 + selectedText.length,
      },
    };
  } else if (before1 === "*" && after1 === "*" && selectedText.length > 0) {
    return {
      changes: { from: from - 1, to: to + 1, insert: selectedText },
      selection: {
        anchor: from - 1,
        head: from - 1 + selectedText.length,
      },
    };
  } else {
    const replacement = "*" + (selectedText || "text") + "*";
    return {
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + 1,
        head: from + 1 + (selectedText.length || 4),
      },
    };
  }
}

/** Insert a `[text](url)` template around the selection (or `text`). */
export function insertLinkEdit(
  docText: string,
  from: number,
  to: number,
): FormatEdit {
  const selectedText = slice(docText, from, to);
  const replacement = `[${selectedText || "text"}](url)`;
  return {
    changes: { from, to, insert: replacement },
    selection: {
      anchor: from + 1,
      head: from + 1 + (selectedText.length || 4),
    },
  };
}

/**
 * 3-way code toggle: inline `` ` `` ⇄ fenced ``` ``` ```. Inline → block
 * inserts the fences on their own lines (adding newlines only where the
 * cursor isn't already at a line edge, consuming one trailing space);
 * block → inline removes the fences and — symmetrically — only the
 * newlines the block conversion would have added (empty lines around the
 * block survive a round-trip).
 */
export function toggleCodeEdit(
  docText: string,
  from: number,
  to: number,
): FormatEdit {
  const selectedText = slice(docText, from, to);
  const docLength = docText.length;

  // Check if selection is wrapped in single backticks
  const before1 = slice(docText, from - 1, from);
  const after1 = slice(docText, to, to + 1);
  if (
    before1 === "`" &&
    after1 === "`" &&
    selectedText.length > 0 &&
    !selectedText.includes("\n")
  ) {
    // Inline code → code block
    const line = lineAt(docText, from);
    const isAtLineStart = from - 1 === line.from;
    const prefix = isAtLineStart ? "" : "\n";
    const isAtLineEnd = to + 1 === line.to;
    const suffix = isAtLineEnd ? "" : "\n";
    const charAfterBacktick = slice(docText, to + 1, to + 2);
    const consumeTrailingSpace = charAfterBacktick === " ";
    const replaceTo = consumeTrailingSpace ? to + 2 : to + 1;
    const replacement = `${prefix}\`\`\`\n${selectedText}\n\`\`\`${suffix}`;
    const cursorStart = from - 1 + prefix.length + 4;
    return {
      changes: { from: from - 1, to: replaceTo, insert: replacement },
      selection: {
        anchor: cursorStart,
        head: cursorStart + selectedText.length,
      },
    };
  }

  // Check if inside a fenced code block (``` ... ```)
  const textBefore = slice(docText, Math.max(0, from - 100), from);
  const textAfter = slice(docText, to, Math.min(docLength, to + 100));

  const fenceOpenMatch = textBefore.match(/```\n([^\n]*)$/);
  const fenceCloseMatch = textAfter.match(/^([^\n]*)\n```/);

  if (fenceOpenMatch && fenceCloseMatch) {
    // Inside a code block → inline code
    // The text between the fences
    const innerText = fenceOpenMatch[1] + selectedText + fenceCloseMatch[1];
    // Find the positions of the fences
    const openFenceStart =
      from - textBefore.length + textBefore.lastIndexOf("```");
    const closeFenceEnd = to + textAfter.indexOf("```") + 3;

    // Check if there's a newline before the opening ``` that we should remove.
    // Only remove it when toggling back to inline code if it was added by the
    // inline→block conversion (i.e., the line before the newline is not empty).
    // Preserve the newline if the previous line is also empty (or at doc start)
    // so toggling is symmetric and doesn't eat empty lines.
    const beforeOpen = slice(
      docText,
      Math.max(0, openFenceStart - 1),
      openFenceStart,
    );
    const hasLeadingNewline = beforeOpen === "\n";
    const prevChar =
      openFenceStart >= 2
        ? slice(docText, openFenceStart - 2, openFenceStart - 1)
        : "";
    const prevLineIsEmpty =
      prevChar === "\n" || (prevChar === "" && openFenceStart <= 1);
    const shouldRemoveLeadingNewline = hasLeadingNewline && !prevLineIsEmpty;

    // Symmetric check for trailing newline after the closing ```
    const afterClose = slice(docText, closeFenceEnd, closeFenceEnd + 1);
    const hasTrailingNewline = afterClose === "\n";
    const nextChar =
      closeFenceEnd + 1 < docLength
        ? slice(docText, closeFenceEnd + 1, closeFenceEnd + 2)
        : "";
    const nextLineIsEmpty =
      nextChar === "\n" || (nextChar === "" && closeFenceEnd + 1 >= docLength);
    const shouldRemoveTrailingNewline = hasTrailingNewline && !nextLineIsEmpty;

    const removeFrom = shouldRemoveLeadingNewline
      ? openFenceStart - 1
      : openFenceStart;
    const removeTo = shouldRemoveTrailingNewline
      ? closeFenceEnd + 1
      : closeFenceEnd;
    const trailingSpace = shouldRemoveTrailingNewline ? " " : "";
    const replacement = "`" + innerText + "`" + trailingSpace;
    const cursorPos = removeFrom + 1;
    return {
      changes: { from: removeFrom, to: removeTo, insert: replacement },
      selection: {
        anchor: cursorPos,
        head: cursorPos + innerText.length,
      },
    };
  }

  // Default: insert inline code
  const replacement = "`" + (selectedText || "code") + "`";
  return {
    changes: { from, to, insert: replacement },
    selection: {
      anchor: from + 1,
      head: from + 1 + (selectedText.length || 4),
    },
  };
}

/**
 * The toolbar/keyboard dispatch table over the 14 format ids
 * (EditorToolbar's `format.id` list): heading (with the 1–6 level cycle),
 * code/codeblock/link (delegating to their toggles), image, bullet,
 * numbered, task, quote, hr, bold, italic, strikethrough, highlight.
 * Returns `null` for unknown ids (no-op).
 */
export function insertFormattingEdit(
  docText: string,
  from: number,
  to: number,
  format: string,
): FormatEdit | null {
  const selectedText = slice(docText, from, to);

  let replacement = "";
  let cursorOffset = 0;
  let placeholderLen = 0;
  let cursorBefore = false;

  switch (format) {
    case "heading": {
      const line = lineAt(docText, from);
      const lineText = line.text;
      const match = lineText.match(/^(#{1,6})\s/);
      if (match) {
        const level = match[1].length;
        if (level >= 6) {
          const newLine = lineText.replace(/^#{1,6}\s/, "");
          return {
            changes: { from: line.from, to: line.to, insert: newLine },
            selection: {
              anchor: line.from,
              head: line.from + newLine.length,
            },
          };
        } else {
          const newLine = "#" + lineText;
          return {
            changes: { from: line.from, to: line.to, insert: newLine },
            selection: {
              anchor: line.from + level + 2,
              head: line.to + 1,
            },
          };
        }
      } else {
        const newLine = `## ${lineText}`;
        return {
          changes: { from: line.from, to: line.to, insert: newLine },
          selection: {
            anchor: line.from + 3,
            head: line.from + newLine.length,
          },
        };
      }
    }
    case "code":
    case "codeblock":
      return toggleCodeEdit(docText, from, to);
    case "link":
      return insertLinkEdit(docText, from, to);
    case "image":
      replacement = `![${selectedText || "alt"}](url)`;
      cursorOffset = 2;
      placeholderLen = 3;
      break;
    case "bullet":
      replacement = `- ${selectedText || "item"}`;
      cursorOffset = 2;
      placeholderLen = 4;
      cursorBefore = true;
      break;
    case "numbered":
      replacement = `1. ${selectedText || "item"}`;
      cursorOffset = 3;
      placeholderLen = 4;
      cursorBefore = true;
      break;
    case "task":
      replacement = `- [ ] ${selectedText || "task"}`;
      cursorOffset = 6;
      placeholderLen = 4;
      cursorBefore = true;
      break;
    case "quote":
      replacement = `> ${selectedText || "quote"}`;
      cursorOffset = 2;
      placeholderLen = 5;
      break;
    case "hr":
      replacement = `\n---\n`;
      return {
        changes: { from, to, insert: replacement },
        selection: { anchor: from + 4, head: from + 4 },
      };
    case "bold":
      return wrapSelectionEdit(docText, from, to, "**", "**");
    case "italic":
      return toggleItalicEdit(docText, from, to);
    case "strikethrough":
      return wrapSelectionEdit(docText, from, to, "~~", "~~");
    case "highlight":
      return wrapSelectionEdit(docText, from, to, "==", "==");
    default:
      return null;
  }

  const textLen = selectedText.length || placeholderLen;
  const selStart = from + cursorOffset;
  const selEnd = selStart + textLen;

  return {
    changes: { from, to, insert: replacement },
    selection: {
      anchor: cursorBefore ? selEnd : selStart,
      head: cursorBefore ? selStart : selEnd,
    },
  };
}

/* ──────────────────── CodeMirror adapter ─────────────────────────────── */

function currentDocSelection(view: EditorView): {
  docText: string;
  from: number;
  to: number;
} {
  const { from, to } = view.state.selection.main;
  return { docText: view.state.doc.toString(), from, to };
}

function applyEdit(view: EditorView, edit: FormatEdit): void {
  view.dispatch({ changes: edit.changes, selection: edit.selection });
  view.focus();
}

export function applyWrapSelection(
  view: EditorView,
  before: string,
  after: string,
): void {
  const { docText, from, to } = currentDocSelection(view);
  applyEdit(view, wrapSelectionEdit(docText, from, to, before, after));
}

export function applyToggleItalic(view: EditorView): void {
  const { docText, from, to } = currentDocSelection(view);
  applyEdit(view, toggleItalicEdit(docText, from, to));
}

export function applyInsertLink(view: EditorView): void {
  const { docText, from, to } = currentDocSelection(view);
  applyEdit(view, insertLinkEdit(docText, from, to));
}

export function applyToggleCode(view: EditorView): void {
  const { docText, from, to } = currentDocSelection(view);
  applyEdit(view, toggleCodeEdit(docText, from, to));
}

export function applyInsertFormatting(view: EditorView, format: string): void {
  const { docText, from, to } = currentDocSelection(view);
  const edit = insertFormattingEdit(docText, from, to, format);
  if (edit) applyEdit(view, edit);
}
