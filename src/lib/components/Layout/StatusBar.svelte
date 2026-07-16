<script lang="ts">
  import { editorState } from '$lib/stores/editor.svelte';
  import { fileState, getFileName } from '$lib/stores/file.svelte';

  let fileName = $derived(fileState.currentFile ? getFileName(fileState.currentFile) : 'Untitled');
</script>

<footer class="statusbar">
  <div class="statusbar-left">
    <span class="file-name" title={fileState.currentFile || 'Untitled'}>
      {fileName}
      {#if editorState.isModified}*{/if}
    </span>
  </div>
  <div class="statusbar-center">
    <span>Line {editorState.cursorLine}, Col {editorState.cursorCol}</span>
    <span class="separator">|</span>
    <span>{editorState.wordCount} words</span>
  </div>
  <div class="statusbar-right">
    <span>Markdown</span>
    <span class="separator">|</span>
    <span>UTF-8</span>
  </div>
</footer>

<style>
  .statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-muted);
    height: 28px;
    user-select: none;
  }

  .statusbar-left,
  .statusbar-center,
  .statusbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .file-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .separator {
    opacity: 0.5;
  }

  @media (max-width: 640px) {
    .statusbar-right {
      display: none;
    }
  }
</style>
