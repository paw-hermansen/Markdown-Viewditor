<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorState, Compartment } from '@codemirror/state';
  import { keymap, type ViewUpdate } from '@codemirror/view';
  import { updateContent, updateCursorPosition } from '$lib/stores/editor.svelte';
  import { settingsState } from '$lib/stores/settings.svelte';
  import { viewerState, getThemeType } from '$lib/stores/viewer.svelte';

  interface Props {
    content?: string;
    onContentChange?: (content: string) => void;
  }

  let { content = $bindable(''), onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView | undefined;
  let isUpdatingFromProp = false;
  const themeCompartment = new Compartment();

  const lightTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)'
    },
    '.cm-content': {
      caretColor: 'var(--accent)'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(233, 69, 96, 0.2)'
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

  function getThemeExtension() {
    return getThemeType() === 'dark' ? oneDark : lightTheme;
  }

  function createEditor() {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        themeCompartment.of(getThemeExtension()),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && !isUpdatingFromProp) {
            const newContent = update.state.doc.toString();
            content = newContent;
            updateContent(newContent);
            onContentChange?.(newContent);
          }
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          updateCursorPosition(line.number, pos - line.from);
        }),
        keymap.of([
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
          }
        ]),
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
  }

  $effect(() => {
    if (!editorView) return;
    const theme = viewerState.theme;
    editorView.dispatch({
      effects: themeCompartment.reconfigure(getThemeExtension())
    });
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
      return;
    }

    const replacement = before + (selectedText || 'text') + after;
    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + before.length, head: from + before.length + (selectedText.length || 4) }
    });
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
  }

  function insertFormatting(format: string) {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);

    let replacement = '';
    let cursorOffset = 0;

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
        return;
      }
      case 'code':
        replacement = `\`${selectedText || 'code'}\``;
        cursorOffset = 1;
        break;
      case 'codeblock':
        replacement = `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
        cursorOffset = 4;
        break;
      case 'link':
        insertLink();
        return;
      case 'image':
        replacement = `![${selectedText || 'alt'}](url)`;
        cursorOffset = 2;
        break;
      case 'bullet':
        replacement = `- ${selectedText || 'item'}`;
        cursorOffset = 2;
        break;
      case 'numbered':
        replacement = `1. ${selectedText || 'item'}`;
        cursorOffset = 3;
        break;
      case 'task':
        replacement = `- [ ] ${selectedText || 'task'}`;
        cursorOffset = 6;
        break;
      case 'quote':
        replacement = `> ${selectedText || 'quote'}`;
        cursorOffset = 2;
        break;
      case 'hr':
        replacement = `\n---\n`;
        editorView.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: from + 4, head: from + 4 }
        });
        return;
      case 'bold':
        wrapSelection('**', '**');
        return;
      case 'italic':
        toggleItalic();
        return;
      default:
        return;
    }

    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + cursorOffset,
        head: from + cursorOffset + (selectedText.length || format.length)
      }
    });
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
      editorView.destroy();
    }
  });

  export function setContent(newContent: string) {
    if (!editorView) return;
    const editorContent = editorView.state.doc.toString();
    if (newContent !== editorContent) {
      isUpdatingFromProp = true;
      editorView.dispatch({
        changes: { from: 0, to: editorContent.length, insert: newContent }
      });
      isUpdatingFromProp = false;
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
  }

  .editor-container :global(.cm-scroller) {
    overflow: auto;
  }
</style>
