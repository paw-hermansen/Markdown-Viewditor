<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ViewMode } from '$lib/types';
  import { settingsState, updateSplitRatio } from '$lib/stores/settings.svelte';
  import ViewToggle from './ViewToggle.svelte';
  import StatusBar from './StatusBar.svelte';

  interface Props {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onSave: () => void;
    onSaveAs: () => void;
    onOpen: () => void;
    onNew: () => void;
    onAbout: () => void;
    isModified: boolean;
    fileName?: string;
    children: Snippet;
  }

  let { viewMode, onViewModeChange, onSave, onSaveAs, onOpen, onNew, onAbout, isModified, fileName, children }: Props = $props();

  const EDGE_THRESHOLD = 0.05;

  let isDragging = $state(false);
  let splitRatio = $state(settingsState.splitRatio);
  let nearEdge = $state<'left' | 'right' | 'center' | null>(null);

  let displayRatio = $derived(isDragging ? splitRatio : settingsState.splitRatio);

  function getRatioFromClientX(clientX: number): number {
    const container = document.querySelector('.content');
    if (!container) return 0.5;
    const rect = container.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function handleDragStart(clientX: number) {
    isDragging = true;

    if (viewMode !== 'split') {
      splitRatio = getRatioFromClientX(clientX);
      onViewModeChange('split');
    }
  }

  function handleDragMove(clientX: number) {
    splitRatio = getRatioFromClientX(clientX);
    if (splitRatio < EDGE_THRESHOLD) {
      nearEdge = 'left';
    } else if (splitRatio > 1 - EDGE_THRESHOLD) {
      nearEdge = 'right';
    } else if (Math.abs(splitRatio - 0.5) < EDGE_THRESHOLD / 2) {
      nearEdge = 'center';
    } else {
      nearEdge = null;
    }
  }

  function handleDragEnd() {
    isDragging = false;
    nearEdge = null;

    if (splitRatio < EDGE_THRESHOLD) {
      onViewModeChange('viewer');
    } else if (splitRatio > 1 - EDGE_THRESHOLD) {
      onViewModeChange('editor');
    } else {
      if (Math.abs(splitRatio - 0.5) < EDGE_THRESHOLD / 2) {
        splitRatio = 0.5;
      }
      updateSplitRatio(splitRatio);
    }
  }

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    handleDragStart(e.clientX);

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const handleMouseUp = () => {
      handleDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    handleDragStart(e.touches[0].clientX);

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) handleDragMove(e.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      handleDragEnd();
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }
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
      {#if fileName}
        <span class="separator"></span>
        <span class="file-name">{fileName}{#if isModified} *{/if}</span>
      {/if}
    </div>
    <div class="toolbar-center">
      <ViewToggle {viewMode} onchange={onViewModeChange} />
    </div>
    <div class="toolbar-right">
      <button class="toolbar-btn" onclick={onAbout} title="About (F1)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
      </button>
    </div>
  </header>

  <main class="content" class:split={viewMode === 'split'} class:editor-only={viewMode === 'editor'} class:viewer-only={viewMode === 'viewer'} style="--split-ratio: {displayRatio}">
    {@render children()}
    <button
      class="resize-handle"
      class:dragging={isDragging}
      class:near-edge={nearEdge !== null}
      onmousedown={handleMouseDown}
      ontouchstart={handleTouchStart}
      aria-label="Resize editor and viewer panels"
    ></button>
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
    position: relative;
  }

  .content.split > :global(.editor-pane) {
    flex: 0 0 calc(var(--split-ratio, 0.5) * 100%);
    min-width: 0;
    order: 1;
  }

  .content.split > :global(.viewer-pane) {
    flex: 1;
    min-width: 0;
    order: 3;
  }

  .content.editor-only > :global(.editor-pane),
  .content.viewer-only > :global(.viewer-pane) {
    flex: 1;
  }

  .content.editor-only > :global(.viewer-pane),
  .content.viewer-only > :global(.editor-pane) {
    display: none;
  }

  .resize-handle {
    width: 4px;
    cursor: col-resize;
    background: var(--border);
    transition: background 150ms ease-in-out;
    flex-shrink: 0;
    border: none;
    outline: none;
  }

  .resize-handle:focus-visible {
    outline: none;
  }

  .resize-handle:hover,
  .resize-handle.dragging {
    background: var(--accent);
  }

  .resize-handle.near-edge {
    background: var(--accent-snap);
    opacity: 0.9;
  }

  .content.split > .resize-handle {
    order: 2;
  }

  .content.editor-only > :global(.editor-pane) {
    order: 1;
  }

  .content.editor-only > .resize-handle {
    order: 2;
  }

  .content.viewer-only > .resize-handle {
    order: 0;
  }

  .content.viewer-only > :global(.viewer-pane) {
    order: 1;
  }

</style>
