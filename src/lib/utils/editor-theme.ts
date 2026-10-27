/**
 * The editor's CodeMirror chrome theme + syntax-highlight palette for the
 * light color mode (the dark mode uses the stock One Dark pair). Chrome
 * colors are CSS variables so the editor follows the app theme; the
 * highlight palette is the One Dark–style light scheme.
 */
import { EditorView } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  oneDarkTheme,
  oneDarkHighlightStyle,
} from "@codemirror/theme-one-dark";
import { tags } from "@lezer/highlight";
import { getThemeType } from "$lib/stores/viewer.svelte";

export const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--viewer-bg)",
    color: "var(--text-primary)",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--accent-tint, rgba(127, 127, 127, 0.2))",
    },
  ".cm-activeLine": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg-secondary)",
    color: "var(--text-muted)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--bg-hover)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
  },
});

export const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#a626a4" },
  { tag: tags.operator, color: "#383a42" },
  { tag: tags.special(tags.variableName), color: "#0184bb" },
  { tag: tags.typeName, color: "#c18401" },
  { tag: tags.atom, color: "#0184bb" },
  { tag: tags.number, color: "#986801" },
  { tag: tags.definition(tags.variableName), color: "#4078f2" },
  { tag: tags.string, color: "#50a14f" },
  { tag: tags.special(tags.string), color: "#50a14f" },
  { tag: tags.comment, color: "#a0a1a7", fontStyle: "italic" },
  { tag: tags.variableName, color: "#383a42" },
  { tag: tags.tagName, color: "#e45649" },
  { tag: tags.bracket, color: "#383a42" },
  { tag: tags.meta, color: "#a626a4" },
  { tag: tags.attributeName, color: "#986801" },
  { tag: tags.attributeValue, color: "#50a14f" },
  { tag: tags.heading, color: "#4078f2", fontWeight: "bold" },
  { tag: tags.link, color: "#4078f2", textDecoration: "underline" },
  { tag: tags.invalid, color: "#e45649" },
]);

export function getThemeExtension(): Extension[] {
  return getThemeType() === "dark"
    ? [oneDarkTheme, syntaxHighlighting(oneDarkHighlightStyle)]
    : [lightTheme, syntaxHighlighting(lightHighlightStyle)];
}
