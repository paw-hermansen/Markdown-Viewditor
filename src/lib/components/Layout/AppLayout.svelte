<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ViewMode } from '$lib/types';
  import ViewToggle from './ViewToggle.svelte';
  import StatusBar from './StatusBar.svelte';

  interface Props {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onSave: () => void;
    onSaveAs: () => void;
    onOpen: () => void;
    onNew: () => void;
    isModified: boolean;
    fileName?: string;
    children: Snippet;
  }

  let { viewMode, onViewModeChange, onSave, onSaveAs, onOpen, onNew, isModified, fileName, children }: Props = $props();
</script>

<div class="app-layout">
  <header class="toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn" onclick={onNew} title="New file (Ctrl+N)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 1h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10 1v3h3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M6 8h4M8 6v4" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="toolbar-btn" onclick={onOpen} title="Open file (Ctrl+O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H2V4z" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button class="toolbar-btn" onclick={onSave} title="Save (Ctrl+S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 15H3a1 1 0 01-1-1V2a1 1 0 011-1h8l3 3v10a1 1 0 01-1 1z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10 1v3H5V1M5 10h6" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        {#if isModified}
          <span class="modified-dot">●</span>
        {/if}
      </button>
      <button class="toolbar-btn" onclick={onSaveAs} title="Save As (Ctrl+Shift+S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 15H3a1 1 0 01-1-1V2a1 1 0 011-1h8l3 3v10a1 1 0 01-1 1z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M10 1v3H5V1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M5 10h2M5 13h6" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <span class="separator"></span>
      <span class="app-name">Markdown Viewditor</span>
      {#if fileName}
        <span class="separator"></span>
        <span class="file-name">{fileName}{#if isModified} *{/if}</span>
      {/if}
    </div>
    <div class="toolbar-center">
      <ViewToggle {viewMode} onchange={onViewModeChange} />
    </div>
    <div class="toolbar-right">
      <!-- Placeholder for future actions -->
    </div>
  </header>

  <main class="content" class:split={viewMode === 'split'} class:editor-only={viewMode === 'editor'} class:viewer-only={viewMode === 'viewer'}>
    {@render children()}
  </main>

  <StatusBar />
</div>

<style>
  .app-layout {
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
    user-select: none;
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-left {
    flex: 1;
  }

  .toolbar-right {
    flex: 1;
    justify-content: flex-end;
  }

  .app-name {
    font-weight: 600;
    font-size: 15px;
    color: var(--text-primary);
  }

  .file-name {
    font-size: 13px;
    color: var(--text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
    position: relative;
  }

  .toolbar-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .modified-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 8px;
    color: var(--accent);
    line-height: 1;
  }

  .content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .content.split > :global(*) {
    flex: 1;
    min-width: 0;
  }

  .content.editor-only > :global(.editor-pane),
  .content.viewer-only > :global(.viewer-pane) {
    flex: 1;
  }

  .content.editor-only > :global(.viewer-pane),
  .content.viewer-only > :global(.editor-pane) {
    display: none;
  }

  @media (max-width: 640px) {
    .toolbar-left .app-name {
      display: none;
    }
  }
</style>
