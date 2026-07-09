# Phase 2 Implementation Guide

## Quick Start: Implementing the Editor Component

### Step 1: Create Editor Component

Create file: `src/lib/components/Editor/Editor.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { markdown } from '@codemirror/lang-markdown';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorState } from '@codemirror/state';

  interface Props {
    content?: string;
    onContentChange?: (content: string) => void;
  }

  let { content = $bindable(''), onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView;

  onMount(() => {
    editorView = new EditorView({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            content = update.state.doc.toString();
            onContentChange?.(content);
          }
        })
      ],
      parent: editorElement
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  export function insertText(text: string) {
    const { from, to } = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from, to, insert: text }
    });
  }

  export function getCursorPos() {
    return editorView.state.selection.main.head;
  }
</script>

<div bind:this={editorElement} class="editor-container"></div>

<style>
  .editor-container {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .editor-container :global(.cm-editor) {
    height: 100%;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .editor-container :global(.cm-content) {
    padding: 16px;
  }
</style>
```

### Step 2: Create Editor Store

Create file: `src/lib/stores/editor.svelte.ts`

```typescript
export const editorState = $state({
  content: "",
  cursorLine: 1,
  cursorCol: 1,
  wordCount: 0,
  isModified: false,
});

export function updateContent(content: string) {
  editorState.content = content;
  editorState.isModified = true;
  updateWordCount();
}

export function updateCursor(line: number, col: number) {
  editorState.cursorLine = line;
  editorState.cursorCol = col;
}

function updateWordCount() {
  const words = editorState.content.trim().split(/\s+/).filter(Boolean);
  editorState.wordCount = words.length;
}

export function resetModified() {
  editorState.isModified = false;
}
```

### Step 3: Create Markdown Utility

Create file: `src/lib/utils/markdown.ts`

```typescript
import MarkdownIt from "markdown-it";

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export function renderMarkdown(content: string): string {
  try {
    return md.render(content);
  } catch (error) {
    console.error("Markdown parse error:", error);
    return "<p>Error rendering markdown</p>";
  }
}
```

### Step 4: Create Viewer Component

Create file: `src/lib/components/Viewer/Viewer.svelte`

```svelte
<script lang="ts">
  import { renderMarkdown } from '$lib/utils/markdown';

  interface Props {
    content: string;
    theme?: string;
  }

  let { content, theme = 'github-dark' }: Props = $props();

  let html = $derived(renderMarkdown(content));
</script>

<div class="viewer-container" data-theme={theme}>
  <div class="viewer-content">
    {@html html}
  </div>
</div>

<style>
  .viewer-container {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .viewer-content {
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .viewer-content :global(h1) {
    font-size: 2em;
    margin-bottom: 0.5em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
  }

  .viewer-content :global(h2) {
    font-size: 1.5em;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }

  .viewer-content :global(p) {
    margin-bottom: 1em;
  }

  .viewer-content :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .viewer-content :global(pre) {
    background: var(--bg-tertiary);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1em;
  }

  .viewer-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .viewer-content :global(ul),
  .viewer-content :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
  }

  .viewer-content :global(li) {
    margin-bottom: 0.25em;
  }

  .viewer-content :global(blockquote) {
    border-left: 4px solid var(--accent);
    padding-left: 1em;
    margin-left: 0;
    margin-bottom: 1em;
    color: var(--text-secondary);
  }

  .viewer-content :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .viewer-content :global(a:hover) {
    text-decoration: underline;
  }

  .viewer-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .viewer-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  .viewer-content :global(th),
  .viewer-content :global(td) {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
  }

  .viewer-content :global(th) {
    background: var(--bg-tertiary);
    font-weight: 600;
  }

  .viewer-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }
</style>
```

### Step 5: Update Main Page

Update file: `src/routes/+page.svelte`

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import { editorState, updateContent, resetModified } from '$lib/stores/editor.svelte';

  let viewMode = $state<'split' | 'editor' | 'viewer'>('split');

  async function saveFile() {
    try {
      await invoke('write_file', { path: 'test.md', content: editorState.content });
      resetModified();
      console.log('File saved');
    } catch (error) {
      console.error('Failed to save:', error);
    }
  }

  function handleContentChange(content: string) {
    updateContent(content);
  }
</script>

<div class="app">
  <header class="toolbar">
    <div class="toolbar-left">
      <span class="app-name">MarkEdiViewer</span>
    </div>
    <div class="toolbar-center">
      <div class="view-toggle">
        <button
          class:active={viewMode === 'split'}
          onclick={() => (viewMode = 'split')}
        >
          Split
        </button>
        <button
          class:active={viewMode === 'editor'}
          onclick={() => (viewMode = 'editor')}
        >
          Edit
        </button>
        <button
          class:active={viewMode === 'viewer'}
          onclick={() => (viewMode = 'viewer')}
        >
          View
        </button>
      </div>
    </div>
    <div class="toolbar-right">
      <button onclick={saveFile}>
        Save
        {#if editorState.isModified}
          <span class="modified-indicator">●</span>
        {/if}
      </button>
    </div>
  </header>

  <main class="content" class:split={viewMode === 'split'} class:editor-only={viewMode === 'editor'} class:viewer-only={viewMode === 'viewer'}>
    {#if viewMode === 'split' || viewMode === 'editor'}
      <div class="editor-pane">
        <Editor
          bind:content={editorState.content}
          onContentChange={handleContentChange}
        />
      </div>
    {/if}

    {#if viewMode === 'split' || viewMode === 'viewer'}
      <div class="viewer-pane">
        <Viewer content={editorState.content} />
      </div>
    {/if}
  </main>

  <footer class="statusbar">
    <span>Ln {editorState.cursorLine}, Col {editorState.cursorCol}</span>
    <span>{editorState.wordCount} words</span>
    <span>UTF-8</span>
    <span>Markdown</span>
  </footer>
</div>

<style>
  /* ... existing styles ... */

  .modified-indicator {
    color: var(--accent);
    margin-left: 4px;
  }
</style>
```

---

## Testing the Implementation

### 1. Run Development Server

```bash
npm run dev
```

### 2. Test Editor Features

- [ ] Type markdown text
- [ ] See syntax highlighting
- [ ] Verify live preview updates
- [ ] Test save functionality

### 3. Test View Modes

- [ ] Split mode shows editor and preview
- [ ] Editor mode shows only editor
- [ ] Viewer mode shows only preview

---

## Next Steps After Phase 2

1. **Add Theme System**
   - Create theme selector component
   - Implement multiple themes
   - Persist theme selection

2. **Implement Scroll Synchronization**
   - Sync editor and preview scroll positions
   - Handle edge cases

3. **Add File Dialog Integration**
   - Open file dialog
   - Save file dialog
   - Recent files

4. **Create Settings Persistence**
   - Save user preferences
   - Restore on app start

---

## Common Issues & Solutions

### Issue: CodeMirror not rendering

**Solution**: Ensure the parent element has a defined height:

```css
.editor-container {
  height: 100%;
  min-height: 200px;
}
```

### Issue: Live preview not updating

**Solution**: Check that `$derived` is used correctly:

```typescript
let html = $derived(renderMarkdown(content));
```

### Issue: Styles not applying to preview

**Solution**: Use `:global()` selector for HTML content:

```css
.viewer-content :global(h1) {
  /* styles */
}
```

---

## Resources

- [CodeMirror 6 Documentation](https://codemirror.net/6/docs/)
- [markdown-it Documentation](https://markdown-it.github.io/)
- [Svelte 5 Runes](https://svelte.dev/blog/runes)
- [Tauri v2 Documentation](https://v2.tauri.app/)
