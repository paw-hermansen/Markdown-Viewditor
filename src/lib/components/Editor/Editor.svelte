<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { EditorState, Compartment, Prec } from '@codemirror/state';
  import { keymap, lineNumbers, type ViewUpdate } from '@codemirror/view';
  import { linter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import { search } from '@codemirror/search';
  import { updateContent, updateCursorPosition } from '$lib/stores/editor.svelte';
  import { settingsState } from '$lib/stores/settings.svelte';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import { levelState } from '$lib/stores/markdown-levels.svelte';
  import { violationMessage } from '$lib/utils/markdown-levels';
  import { formatMarkdown } from '$lib/utils/markdown-formatter';
  import {
    applyInsertFormatting,
    applyInsertLink,
    applyToggleCode,
    applyToggleItalic,
    applyWrapSelection
  } from '$lib/utils/editor-format';
  import { getThemeExtension } from '$lib/utils/editor-theme';
  import { getTextMeasurer, getVisibleTextWidth } from '$lib/utils/text-measure';

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

  function createEditor() {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        search({
          scrollToMatch: (range) => {
            return EditorView.scrollIntoView(range, { y: 'center' });
          }
        }),
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
          // Mod-i has no keymap entry on purpose: the capture-phase
          // handleKeydown below owns it (the webview's native
          // select-paragraph command would bypass the keymap entirely).
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

    // Mod-i lives ONLY here (capture phase), not in the keymap: WebKitGTK
    // and WebView2 treat Ctrl+I as a native select-paragraph command (and
    // Ctrl+B as native bold — see preventNativeFormat) that bypasses
    // CodeMirror's keymap entirely, so this handler intercepts the event on
    // the ancestor first, stops the native command, runs the toggle itself,
    // and re-pins the selection the webview may move below JS. Manual
    // regression: TEST-PLAN 4.20.
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

  // Thin wrappers over the extracted formatting engine
  // ($lib/utils/editor-format), which owns the text transforms and the
  // dispatch. Each reads the current selection, runs the pure edit and
  // dispatches it (+ focus), exactly as the inlined versions did.
  function wrapSelection(before: string, after: string) {
    if (editorView) applyWrapSelection(editorView, before, after);
  }

  function toggleItalic() {
    if (editorView) applyToggleItalic(editorView);
  }

  function insertLink() {
    if (editorView) applyInsertLink(editorView);
  }

  function toggleCode() {
    if (editorView) applyToggleCode(editorView);
  }

  function insertFormatting(format: string) {
    if (editorView) applyInsertFormatting(editorView, format);
  }

  /**
   * Replace the whole document when it differs from `newContent`, guarding
   * the update listener with `isUpdatingFromProp` and restoring (or
   * resetting) the scroll afterwards. Shared by the content-prop `$effect`
   * below (the safety net for store writes not paired with `setContent`)
   * and by `setContent` itself, so the whole-doc replace + guard + scroll
   * handling exist exactly once.
   */
  function applyContent(newContent: string, preserveScroll: boolean) {
    if (!editorView) return;
    const editorContent = editorView.state.doc.toString();
    if (newContent === editorContent) return;
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

  $effect(() => {
    // Safety net for unpaired `editorState.content` writes (every
    // `setContent` call writes the store first, so this no-ops for those).
    applyContent(content, true);
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
    applyContent(newContent, preserveScroll);
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
