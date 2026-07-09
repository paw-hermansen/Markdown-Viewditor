<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import EditorToolbar from '$lib/components/Editor/EditorToolbar.svelte';
  import { editorState, markSaved } from '$lib/stores/editor.svelte';

  let viewMode = $state<'split' | 'editor' | 'viewer'>('split');
  let editorComponent = $state<Editor | undefined>(undefined);

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  async function saveFile() {
    try {
      await invoke('write_file', { path: 'test.md', content: editorState.content });
      markSaved();
      console.log('File saved');
    } catch (error) {
      console.error('Failed to save:', error);
    }
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
        Save {#if editorState.isModified}*{/if}
      </button>
    </div>
  </header>

  {#if viewMode === 'split' || viewMode === 'editor'}
    <EditorToolbar onFormat={handleFormat} />
  {/if}

  <main class="content" class:split={viewMode === 'split'} class:editor-only={viewMode === 'editor'} class:viewer-only={viewMode === 'viewer'}>
    {#if viewMode === 'split' || viewMode === 'editor'}
      <div class="editor-pane">
        <Editor bind:this={editorComponent} />
      </div>
    {/if}

    {#if viewMode === 'split' || viewMode === 'viewer'}
      <div class="viewer-pane">
        <div class="preview">
          <p class="placeholder">Live preview will appear here</p>
        </div>
      </div>
    {/if}
  </main>

  <footer class="statusbar">
    <span>Line {editorState.cursorLine}, Col {editorState.cursorCol}</span>
    <span>{editorState.wordCount} words</span>
    <span>Markdown</span>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    height: 48px;
  }

  .app-name {
    font-weight: 600;
    font-size: 16px;
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    background: var(--bg-tertiary);
    padding: 4px;
    border-radius: 8px;
  }

  .view-toggle button {
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }

  .view-toggle button.active {
    background: var(--accent);
    color: white;
  }

  .view-toggle button:hover:not(.active) {
    background: var(--bg-hover);
  }

  .content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .editor-pane,
  .viewer-pane {
    flex: 1;
    overflow: auto;
  }

  .content.split .editor-pane,
  .content.split .viewer-pane {
    width: 50%;
  }

  .content.editor-only .editor-pane {
    width: 100%;
  }

  .content.viewer-only .viewer-pane {
    width: 100%;
  }

  .preview {
    padding: 16px;
    height: 100%;
  }

  .placeholder {
    color: var(--text-muted);
    font-style: italic;
  }

  .statusbar {
    display: flex;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
  }

  button {
    padding: 8px 16px;
    border: none;
    background: var(--accent);
    color: white;
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }

  button:hover {
    opacity: 0.9;
  }
</style>
