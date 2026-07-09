<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorState } from '@codemirror/state';
  import { keymap, type ViewUpdate } from '@codemirror/view';
  import { updateContent, updateCursorPosition } from '$lib/stores/editor.svelte';
  import { editorState } from '$lib/stores/editor.svelte';

  let editorElement: HTMLDivElement;
  let editorView: EditorView | undefined;

  function createEditor() {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: editorState.content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            updateContent(newContent);
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
              wrapSelection('*', '*');
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
            fontSize: '14px'
          },
          '.cm-scroller': {
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineHeight: '1.6'
          },
          '.cm-content': {
            padding: '16px 0'
          },
          '.cm-gutters': {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
            borderRight: '1px solid var(--border)'
          }
        })
      ]
    });

    editorView = new EditorView({
      state,
      parent: editorElement
    });
  }

  function wrapSelection(before: string, after: string) {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(from, to);
    const replacement = before + (selectedText || 'text') + after;
    editorView.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + before.length, head: from + before.length + (selectedText.length || 4) }
    });
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
      case 'heading':
        replacement = `## ${selectedText || 'Heading'}`;
        cursorOffset = 3;
        break;
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
        cursorOffset = 5;
        break;
      case 'bold':
        wrapSelection('**', '**');
        return;
      case 'italic':
        wrapSelection('*', '*');
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

  onMount(() => {
    createEditor();
  });

  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
    }
  });

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
