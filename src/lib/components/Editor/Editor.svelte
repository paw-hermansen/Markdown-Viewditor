<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { oneDarkTheme, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags } from '@lezer/highlight';
  import { EditorState, Compartment, Prec } from '@codemirror/state';
  import { keymap, lineNumbers, type ViewUpdate } from '@codemirror/view';
  import { linter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import { updateContent, updateCursorPosition } from '$lib/stores/editor.svelte';
  import { settingsState } from '$lib/stores/settings.svelte';
  import { viewerState, getThemeType } from '$lib/stores/viewer.svelte';
  import { levelState } from '$lib/stores/markdown-levels.svelte';
  import { violationMessage } from '$lib/utils/markdown-levels';
  import { formatMarkdown, type TextMeasurer } from '$lib/utils/markdown-formatter';

  interface Props {
    content?: string;
    onContentChange?: (content: string) => void;
  }

  let { content = '', onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView | undefined;
  let isUpdatingFromProp = false;
  let preventNativeFormat: ((e: Event) => void) | undefined;
  let handleKeydown: ((e: KeyboardEvent) => void) | undefined;
  const themeCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const wordWrapCompartment = new Compartment();

  const MAX_DIAGNOSTICS = 100;

  // Shared diagnostics source: used both by the `linter()` extension (which
  // re-runs on doc changes, debounced by CodeMirror) and by the `$effect`
  // below (which dispatches diagnostics directly when the violations list or
  // the level preset changes without a doc edit). `forceLinting` is NOT used
  // because it is a no-op when no lint run is pending
  // (@codemirror/lint's `plugin.force()` early-returns on `this.set === false`).
  function levelLinterSource(view: EditorView): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc;
    const level = settingsState.markdownLevel;
    const violations = levelState.violations;
    let count = 0;
    for (const v of violations) {
      for (const lineNum of v.lines) {
        if (count >= MAX_DIAGNOSTICS) return diagnostics;
        if (lineNum < 1 || lineNum > doc.lines) continue;
        const line = doc.line(lineNum);
        diagnostics.push({
          from: line.from,
          to: Math.max(line.to, line.from),
          severity: 'warning',
          message: violationMessage(v, level)
        });
        count++;
      }
    }
    return diagnostics;
  }

  const levelLinter = linter(levelLinterSource);

  const lightTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--viewer-bg)',
      color: 'var(--text-primary)'
    },
    '.cm-content': {
      caretColor: 'var(--accent)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)'
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-hover)'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-muted)',
      borderRight: '1px solid var(--border)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-hover)'
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)'
    }
  });

  const lightHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: '#a626a4' },
    { tag: tags.operator, color: '#383a42' },
    { tag: tags.special(tags.variableName), color: '#0184bb' },
    { tag: tags.typeName, color: '#c18401' },
    { tag: tags.atom, color: '#0184bb' },
    { tag: tags.number, color: '#986801' },
    { tag: tags.definition(tags.variableName), color: '#4078f2' },
    { tag: tags.string, color: '#50a14f' },
    { tag: tags.special(tags.string), color: '#50a14f' },
    { tag: tags.comment, color: '#a0a1a7', fontStyle: 'italic' },
    { tag: tags.variableName, color: '#383a42' },
    { tag: tags.tagName, color: '#e45649' },
    { tag: tags.bracket, color: '#383a42' },
    { tag: tags.meta, color: '#a626a4' },
    { tag: tags.attributeName, color: '#986801' },
    { tag: tags.attributeValue, color: '#50a14f' },
    { tag: tags.heading, color: '#4078f2', fontWeight: 'bold' },
    { tag: tags.link, color: '#4078f2', textDecoration: 'underline' },
    { tag: tags.invalid, color: '#e45649' },
  ]);

  function getThemeExtension() {
    return getThemeType() === 'dark'
      ? [oneDarkTheme, syntaxHighlighting(oneDarkHighlightStyle)]
      : [lightTheme, syntaxHighlighting(lightHighlightStyle)];
  }

  function createEditor() {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        levelLinter,
        themeCompartment.of(getThemeExtension()),
        lineNumbersCompartment.of(settingsState.editorLineNumbers ? [] : lineNumbers()),
        wordWrapCompartment.of(settingsState.editorWordWrap ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && !isUpdatingFromProp) {
            const newContent = update.state.doc.toString();
            updateContent(newContent);
            onContentChange?.(newContent);
          }
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          updateCursorPosition(line.number, pos - line.from);
        }),
        Prec.high(keymap.of([
          {
            key: 'Mod-b',
            run: () => {
              wrapSelection('**', '**');
              return true;
            }
          },
          {
            key: 'Mod-i',
            run: () => {
              toggleItalic();
              return true;
            }
          },
          {
            key: 'Mod-k',
            run: () => {
              insertLink();
              return true;
            }
          },
          {
            key: 'Mod-Shift-x',
            run: () => {
              wrapSelection('~~', '~~');
              return true;
            }
          },
          {
            key: 'Mod-Shift-m',
            run: () => {
              wrapSelection('==', '==');
              return true;
            }
          },
          {
            key: 'Mod-Shift-h',
            run: () => {
              insertFormatting('heading');
              return true;
            }
          },
          {
            key: 'Mod-Shift-i',
            run: () => {
              insertFormatting('image');
              return true;
            }
          },
          {
            key: 'Mod-e',
            run: () => {
              toggleCode();
              return true;
            }
          },
          {
            key: 'Shift-Alt-f',
            run: () => {
              formatDocument();
              return true;
            }
          },
        ])),
        Prec.high(EditorView.domEventHandlers({
          keydown: (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod || !e.shiftKey) return false;

            if (e.code === 'Digit8') {
              e.preventDefault();
              insertFormatting('bullet');
              return true;
            }
            if (e.code === 'Digit7') {
              e.preventDefault();
              insertFormatting('numbered');
              return true;
            }
            return false;
          }
        })),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: settingsState.editorFontSize + 'px'
          },
          '.cm-scroller': {
            fontFamily: settingsState.editorFontFamily,
            lineHeight: '1.6'
          },
          '.cm-content': {
            padding: '16px 0'
          }
        })
      ]
    });

    editorView = new EditorView({
      state,
      parent: editorElement
    });

    preventNativeFormat = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'formatItalic' || ie.inputType === 'formatBold') {
        e.preventDefault();
      }
    };
    editorView.contentDOM.addEventListener('beforeinput', preventNativeFormat);

    handleKeydown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key !== 'i') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      toggleItalic();
      const after = editorView!.state.selection.main;
      requestAnimationFrame(() => {
        if (!editorView) return;
        const cur = editorView.state.selection.main;
        if (cur.from !== after.from || cur.to !== after.to) {
          editorView.dispatch({ selection: { anchor: after.anchor, head: after.head } });
        }
      });
    };
    editorElement.addEventListener('keydown', handleKeydown, { capture: true });
  }

  $effect(() => {
    void viewerState.theme;
    if (!editorView) return;
    editorView.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension())
    });
  });

  $effect(() => {
    if (!editorView) return;
    const showLineNumbers = settingsState.editorLineNumbers;
    editorView.dispatch({
      effects: lineNumbersCompartment.reconfigure(showLineNumbers ? [] : lineNumbers())
    });
  });

  $effect(() => {
    if (!editorView) return;
    const wordWrap = settingsState.editorWordWrap;
    editorView.dispatch({
      effects: wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    });
  });

  $effect(() => {
    // Re-apply diagnostics whenever the violations list or the level preset
    // changes. We dispatch `setDiagnostics` directly rather than calling
    // `forceLinting`, because the latter is a no-op when no lint run is
    // pending — and a level change doesn't touch the doc, so no run is.
    void levelState.violations;
    void settingsState.markdownLevel;
    if (!editorView) return;
    editorView.dispatch(
      setDiagnostics(editorView.state, levelLinterSource(editorView)),
    );
  });

  function wrapSelection(before: string, after: string) {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);

    const beforeText = editorView.state.sliceDoc(from - before.length, from);
    const afterText = editorView.state.sliceDoc(to, to + after.length);
    if (beforeText === before && afterText === after && selectedText.length > 0) {
      editorView.dispatch({
        changes: { from: from - before.length, to: to + after.length, insert: selectedText },
        selection: { anchor: from - before.length, head: from - before.length + selectedText.length }
      });
      editorView.focus();
      return;
    }

    const replacement = before + (selectedText || 'text') + after;
    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + before.length, head: from + before.length + (selectedText.length || 4) }
    });
    editorView.focus();
  }

  function toggleItalic() {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);

    const before1 = editorView.state.sliceDoc(from - 1, from);
    const after1 = editorView.state.sliceDoc(to, to + 1);
    const before2 = editorView.state.sliceDoc(from - 2, from);
    const after2 = editorView.state.sliceDoc(to, to + 2);
    const before3 = editorView.state.sliceDoc(from - 3, from);
    const after3 = editorView.state.sliceDoc(to, to + 3);

    if (before3 === '***' && after3 === '***' && selectedText.length > 0) {
      editorView.dispatch({
        changes: { from: from - 3, to: to + 3, insert: '**' + selectedText + '**' },
        selection: { anchor: from - 1, head: from - 1 + selectedText.length }
      });
    } else if (before2 === '**' && after2 === '**' && selectedText.length > 0) {
      editorView.dispatch({
        changes: { from: from - 2, to: to + 2, insert: '***' + selectedText + '***' },
        selection: { anchor: from + 1, head: from + 1 + selectedText.length }
      });
    } else if (before1 === '*' && after1 === '*' && selectedText.length > 0) {
      editorView.dispatch({
        changes: { from: from - 1, to: to + 1, insert: selectedText },
        selection: { anchor: from - 1, head: from - 1 + selectedText.length }
      });
    } else {
      const replacement = '*' + (selectedText || 'text') + '*';
      editorView.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + 1, head: from + 1 + (selectedText.length || 4) }
      });
    }
    editorView.focus();
  }

  function insertLink() {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);
    const replacement = `[${selectedText || 'text'}](url)`;
    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + 1,
        head: from + 1 + (selectedText.length || 4)
      }
    });
    editorView.focus();
  }

  function toggleCode() {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);
    const doc = editorView.state.doc;

    // Check if selection is wrapped in single backticks
    const before1 = editorView.state.sliceDoc(from - 1, from);
    const after1 = editorView.state.sliceDoc(to, to + 1);
    if (before1 === '`' && after1 === '`' && selectedText.length > 0 && !selectedText.includes('\n')) {
      // Inline code → code block
      const line = doc.lineAt(from);
      const isAtLineStart = from - 1 === line.from;
      const prefix = isAtLineStart ? '' : '\n';
      const isAtLineEnd = to + 1 === line.to;
      const suffix = isAtLineEnd ? '' : '\n';
      const charAfterBacktick = editorView.state.sliceDoc(to + 1, to + 2);
      const consumeTrailingSpace = charAfterBacktick === ' ';
      const replaceTo = consumeTrailingSpace ? to + 2 : to + 1;
      const replacement = `${prefix}\`\`\`\n${selectedText}\n\`\`\`${suffix}`;
      const cursorStart = from - 1 + prefix.length + 4;
      editorView.dispatch({
        changes: { from: from - 1, to: replaceTo, insert: replacement },
        selection: { anchor: cursorStart, head: cursorStart + selectedText.length }
      });
      editorView.focus();
      return;
    }

    // Check if inside a fenced code block (``` ... ```)
    const textBefore = editorView.state.sliceDoc(Math.max(0, from - 100), from);
    const textAfter = editorView.state.sliceDoc(to, Math.min(doc.length, to + 100));

    const fenceOpenMatch = textBefore.match(/```\n([^\n]*)$/);
    const fenceCloseMatch = textAfter.match(/^([^\n]*)\n```/);

    if (fenceOpenMatch && fenceCloseMatch) {
      // Inside a code block → inline code
      // The text between the fences
      const innerText = fenceOpenMatch[1] + selectedText + fenceCloseMatch[1];
      // Find the positions of the fences
      const openFenceStart = from - textBefore.length + textBefore.lastIndexOf('```');
      const closeFenceEnd = to + textAfter.indexOf('```') + 3;

      // Check if there's a newline before the opening ``` that we should remove.
      // Only remove it when toggling back to inline code if it was added by the
      // inline→block conversion (i.e., the line before the newline is not empty).
      // Preserve the newline if the previous line is also empty (or at doc start)
      // so toggling is symmetric and doesn't eat empty lines.
      const beforeOpen = editorView.state.sliceDoc(Math.max(0, openFenceStart - 1), openFenceStart);
      const hasLeadingNewline = beforeOpen === '\n';
      const prevChar = openFenceStart >= 2
        ? editorView.state.sliceDoc(openFenceStart - 2, openFenceStart - 1)
        : '';
      const prevLineIsEmpty = prevChar === '\n' || prevChar === '' && openFenceStart <= 1;
      const shouldRemoveLeadingNewline = hasLeadingNewline && !prevLineIsEmpty;

      // Symmetric check for trailing newline after the closing ```
      const afterClose = editorView.state.sliceDoc(closeFenceEnd, closeFenceEnd + 1);
      const hasTrailingNewline = afterClose === '\n';
      const nextChar = closeFenceEnd + 1 < doc.length
        ? editorView.state.sliceDoc(closeFenceEnd + 1, closeFenceEnd + 2)
        : '';
      const nextLineIsEmpty = nextChar === '\n' || (nextChar === '' && closeFenceEnd + 1 >= doc.length);
      const shouldRemoveTrailingNewline = hasTrailingNewline && !nextLineIsEmpty;

      const removeFrom = shouldRemoveLeadingNewline ? openFenceStart - 1 : openFenceStart;
      const removeTo = shouldRemoveTrailingNewline ? closeFenceEnd + 1 : closeFenceEnd;
      const trailingSpace = shouldRemoveTrailingNewline ? ' ' : '';
      const replacement = '`' + innerText + '`' + trailingSpace;
      const cursorPos = removeFrom + 1;
      editorView.dispatch({
        changes: { from: removeFrom, to: removeTo, insert: replacement },
        selection: { anchor: cursorPos, head: cursorPos + innerText.length }
      });
      editorView.focus();
      return;
    }

    // Default: insert inline code
    const replacement = '`' + (selectedText || 'code') + '`';
    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + 1, head: from + 1 + (selectedText.length || 4) }
    });
    editorView.focus();
  }

  function insertFormatting(format: string) {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);

    let replacement = '';
    let cursorOffset = 0;
    let placeholderLen = 0;
    let cursorBefore = false;

    switch (format) {
      case 'heading': {
        const line = editorView.state.doc.lineAt(from);
        const lineText = line.text;
        const match = lineText.match(/^(#{1,6})\s/);
        if (match) {
          const level = match[1].length;
          if (level >= 6) {
            const newLine = lineText.replace(/^#{1,6}\s/, '');
            editorView.dispatch({
              changes: { from: line.from, to: line.to, insert: newLine },
              selection: { anchor: line.from, head: line.from + newLine.length }
            });
          } else {
            const newLine = '#' + lineText;
            editorView.dispatch({
              changes: { from: line.from, to: line.to, insert: newLine },
              selection: { anchor: line.from + level + 2, head: line.to + 1 }
            });
          }
        } else {
          const newLine = `## ${lineText}`;
          editorView.dispatch({
            changes: { from: line.from, to: line.to, insert: newLine },
            selection: { anchor: line.from + 3, head: line.from + newLine.length }
          });
        }
        editorView.focus();
        return;
      }
      case 'code':
        toggleCode();
        return;
      case 'codeblock':
        toggleCode();
        return;
      case 'link':
        insertLink();
        return;
      case 'image':
        replacement = `![${selectedText || 'alt'}](url)`;
        cursorOffset = 2;
        placeholderLen = 3;
        break;
      case 'bullet':
        replacement = `- ${selectedText || 'item'}`;
        cursorOffset = 2;
        placeholderLen = 4;
        cursorBefore = true;
        break;
      case 'numbered':
        replacement = `1. ${selectedText || 'item'}`;
        cursorOffset = 3;
        placeholderLen = 4;
        cursorBefore = true;
        break;
      case 'task':
        replacement = `- [ ] ${selectedText || 'task'}`;
        cursorOffset = 6;
        placeholderLen = 4;
        cursorBefore = true;
        break;
      case 'quote':
        replacement = `> ${selectedText || 'quote'}`;
        cursorOffset = 2;
        placeholderLen = 5;
        break;
      case 'hr':
        replacement = `\n---\n`;
        editorView.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: from + 4, head: from + 4 }
        });
        editorView.focus();
        return;
      case 'bold':
        wrapSelection('**', '**');
        return;
      case 'italic':
        toggleItalic();
        return;
      case 'strikethrough':
        wrapSelection('~~', '~~');
        return;
      case 'highlight':
        wrapSelection('==', '==');
        return;
      default:
        return;
    }

    const textLen = selectedText.length || placeholderLen;
    const selStart = from + cursorOffset;
    const selEnd = selStart + textLen;

    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: cursorBefore ? selEnd : selStart,
        head: cursorBefore ? selStart : selEnd
      }
    });
    editorView.focus();
  }

  $effect(() => {
    if (!editorView) return;
    const editorContent = editorView.state.doc.toString();
    if (content !== editorContent) {
      isUpdatingFromProp = true;
      editorView.dispatch({
        changes: { from: 0, to: editorContent.length, insert: content }
      });
      isUpdatingFromProp = false;
    }
  });

  onMount(() => {
    createEditor();
  });

  onDestroy(() => {
    if (editorView) {
      if (preventNativeFormat) {
        editorView.contentDOM.removeEventListener('beforeinput', preventNativeFormat);
      }
      editorView.destroy();
    }
    if (handleKeydown) {
      editorElement.removeEventListener('keydown', handleKeydown, { capture: true });
    }
  });

  export function setContent(newContent: string, preserveScroll = true) {
    if (!editorView) return;
    const editorContent = editorView.state.doc.toString();
    if (newContent !== editorContent) {
      const savedHead = editorView.state.selection.main.head;
      const savedScrollTop = editorView.scrollDOM.scrollTop;
      isUpdatingFromProp = true;
      editorView.dispatch({
        changes: { from: 0, to: editorContent.length, insert: newContent },
        selection: { anchor: Math.min(savedHead, newContent.length) }
      });
      if (preserveScroll) {
        // CodeMirror updates the content height on its own rAF measure cycle,
        // not synchronously. On WebView2 (Chromium), scrollHeight is still ~0 at
        // this point, so an immediate scrollTop assignment gets clamped to 0 and
        // the editor jumps to the top on reload. Restore after two rAFs so the
        // new layout has been measured and the scroll range is non-zero.
        requestAnimationFrame(() => {
          if (!editorView) return;
          editorView.scrollDOM.scrollTop = savedScrollTop;
          requestAnimationFrame(() => {
            if (!editorView) return;
            editorView.scrollDOM.scrollTop = savedScrollTop;
          });
        });
      } else {
        requestAnimationFrame(() => {
          if (!editorView) return;
          editorView.scrollDOM.scrollTop = 0;
        });
      }
      isUpdatingFromProp = false;
    }
  }

  function cssPixels(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getVisibleTextWidth(view: EditorView): number {
    const scroll = view.scrollDOM;
    const line = view.contentDOM.querySelector<HTMLElement>('.cm-line');
    if (!line || !scroll.clientWidth) return 0;

    const scrollRect = scroll.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const scrollStyle = getComputedStyle(scroll);
    const lineStyle = getComputedStyle(line);
    const scaleX = scroll.offsetWidth > 0 ? scrollRect.width / scroll.offsetWidth : 1;
    const borderLeft = cssPixels(scrollStyle.borderLeftWidth);
    const paddingRight = cssPixels(scrollStyle.paddingRight);

    // The line can be horizontally scrolled, so restore its unscrolled text
    // origin before comparing it with the visible right edge of the scroller.
    const textStart = lineRect.left +
      (scroll.scrollLeft + cssPixels(lineStyle.paddingLeft)) * scaleX;
    const visibleRight = scrollRect.left +
      (borderLeft + scroll.clientWidth - paddingRight) * scaleX;

    return (visibleRight - textStart) / scaleX - cssPixels(lineStyle.paddingRight);
  }

  interface TextProbe {
    measure: TextMeasurer;
    destroy: () => void;
  }

  function getTextMeasurer(view: EditorView): TextProbe | undefined {
    const line = view.contentDOM.querySelector<HTMLElement>('.cm-line');
    if (!line || !document.body) return undefined;

    const style = getComputedStyle(line);
    const probe = document.createElement('span');
    probe.dataset.markdownFormatProbe = 'true';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.position = 'fixed';
    probe.style.left = '-100000px';
    probe.style.top = '-100000px';
    probe.style.display = 'inline-block';
    probe.style.width = 'max-content';
    probe.style.whiteSpace = 'pre';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.padding = '0';
    probe.style.margin = '0';
    probe.style.border = '0';
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontStyle = style.fontStyle;
    probe.style.fontVariant = style.fontVariant;
    probe.style.fontWeight = style.fontWeight;
    probe.style.fontStretch = style.fontStretch;
    probe.style.letterSpacing = style.letterSpacing;
    probe.style.wordSpacing = style.wordSpacing;
    probe.style.fontKerning = style.fontKerning;
    probe.style.fontFeatureSettings = style.fontFeatureSettings;
    document.body.appendChild(probe);

    return {
      measure: (text) => {
        probe.textContent = text;
        return probe.getBoundingClientRect().width;
      },
      destroy: () => probe.remove(),
    };
  }

  export function formatDocument() {
    if (!editorView) return;

    const contentWidth = getVisibleTextWidth(editorView);
    if (contentWidth <= 0) return;

    const { from, to } = editorView.state.selection.main;
    const hasSelection = from !== to;

    let targetFrom: number;
    let targetTo: number;
    let original: string;

    if (hasSelection) {
      const startLine = editorView.state.doc.lineAt(from);
      const endLine = editorView.state.doc.lineAt(to);
      targetFrom = startLine.from;
      targetTo = endLine.to;
      original = editorView.state.sliceDoc(targetFrom, targetTo);
    } else {
      targetFrom = 0;
      targetTo = editorView.state.doc.length;
      original = editorView.state.sliceDoc(targetFrom, targetTo);
    }

    if (!original.trim()) return;

    const textProbe = getTextMeasurer(editorView);
    if (!textProbe) return;

    try {
      const formatted = formatMarkdown(original, contentWidth - 1, textProbe.measure);
      if (formatted === original) return;

      editorView.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: formatted },
      });
      editorView.focus();
    } finally {
      textProbe.destroy();
    }
  }

  export function getEditorView() {
    return editorView;
  }

  export { insertFormatting };
</script>

<div class="editor-container" bind:this={editorElement}></div>

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
    background: var(--viewer-bg);
  }

  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
</style>
