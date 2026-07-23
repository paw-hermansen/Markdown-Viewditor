<script lang="ts">
  import type { ViewMode } from '$lib/types';
  import AppLayout from '$lib/components/Layout/AppLayout.svelte';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import EditorToolbar from '$lib/components/Editor/EditorToolbar.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import ViewerToolbar from '$lib/components/Viewer/ViewerToolbar.svelte';
  import AboutDialog from '$lib/components/About/AboutDialog.svelte';
  import CommandPalette from '$lib/components/CommandPalette/CommandPalette.svelte';
  import { editorState, markSaved, resetEditor, hasUnsavedChanges, updateWordCount } from '$lib/stores/editor.svelte';
  import { fileState, openFile, saveFile, saveFileAs, closeFile, readFile, getFileName } from '$lib/stores/file.svelte';
  import { settingsState, updateViewMode } from '$lib/stores/settings.svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { createScrollSync } from '$lib/utils/scroll-sync';
  import { onMount, onDestroy } from 'svelte';

  let viewMode = $state<ViewMode>(settingsState.viewMode);
  let editorComponent = $state<Editor | undefined>(undefined);
  let viewerComponent = $state<Viewer | undefined>(undefined);
  let fileName = $derived(fileState.currentFile ? getFileName(fileState.currentFile) : 'Untitled');
  let scrollSync: ReturnType<typeof createScrollSync> | undefined;
  let viewerElement: HTMLDivElement | undefined;
  let showAbout = $state(false);
  let showCommandPalette = $state(false);
  let unlistenCloseRequested: (() => void) | undefined;

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  async function handleNew() {
    if (fileState.isLoading) return;

    if (hasUnsavedChanges()) {
      const confirmed = await ask('You have unsaved changes. Create new file?', { title: 'Markdown Viewditor', kind: 'warning' });
      if (!confirmed) return;
    }
    resetEditor();
    editorComponent?.setContent('');
    closeFile();
  }

  async function handleOpen() {
    if (hasUnsavedChanges()) {
      const confirmed = await ask('You have unsaved changes. Open a new file?', { title: 'Markdown Viewditor', kind: 'warning' });
      if (!confirmed) return;
    }

    const content = await openFile();
    if (content !== null) {
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.setContent(content);
      markSaved();
    }
  }

  async function handleSave() {
    if (fileState.currentFile) {
      const success = await saveFile(fileState.currentFile, editorState.content);
      if (success) {
        markSaved();
      }
    } else {
      const path = await saveFileAs(editorState.content);
      if (path) {
        markSaved();
      }
    }
  }

  async function handleSaveAs() {
    const path = await saveFileAs(editorState.content);
    if (path) {
      markSaved();
    }
  }

  function handleViewModeChange(mode: ViewMode) {
    viewMode = mode;
    updateViewMode(mode);
  }

  function handleCopyHtml() {
    const viewerContent = viewerComponent?.getViewerContentElement();
    if (viewerContent) {
      navigator.clipboard.writeText(viewerContent.innerHTML);
    }
  }

  function handlePrint() {
    const viewerContent = viewerComponent?.getViewerContentElement();
    if (!viewerContent) return;

    const printDiv = document.createElement('div');
    printDiv.classList.add('print-content');
    printDiv.innerHTML = viewerContent.innerHTML;
    document.body.appendChild(printDiv);
    window.print();
    printDiv.remove();
  }

  function handleAbout() {
    showAbout = true;
  }

  function handleCloseAbout() {
    showAbout = false;
  }

  function handleCloseCommandPalette() {
    showCommandPalette = false;
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (fileState.isLoading) return;

    const isMod = e.metaKey || e.ctrlKey;

    if (e.key === 'F1') {
      e.preventDefault();
      showAbout = !showAbout;
      return;
    }

    if (isMod && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
      return;
    }

    if (isMod && e.key === 'S' && e.shiftKey) {
      e.preventDefault();
      handleSaveAs();
      return;
    }

    if (isMod && e.key === 'n') {
      e.preventDefault();
      handleNew();
      return;
    }

    if (isMod && e.key === 'o') {
      e.preventDefault();
      handleOpen();
      return;
    }

    if (isMod && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
      return;
    }

    if (isMod && e.key === 'p') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
      return;
    }
  }

  function initScrollSync() {
    if (scrollSync) {
      scrollSync.destroy();
    }

    const editorView = editorComponent?.getEditorView();
    if (editorView && viewerElement) {
      scrollSync = createScrollSync(editorView, viewerElement);
    }
  }

  function handleViewerReady(element: HTMLDivElement) {
    viewerElement = element;
    initScrollSync();
  }

  $effect(() => {
    if (editorComponent && viewerElement) {
      initScrollSync();
    }
  });

  onMount(async () => {
    unlistenCloseRequested = await getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (hasUnsavedChanges()) {
        const confirmed = await ask('You have unsaved changes. Quit anyway?', { title: 'Markdown Viewditor', kind: 'warning' });
        if (!confirmed) return;
      }
      await invoke('force_close_window');
    });

    const initialFile = await invoke<string | null>('get_initial_file');
    if (initialFile) {
      const content = await readFile(initialFile);
      if (content !== null) {
        editorState.content = content;
        updateWordCount(content);
        editorComponent?.setContent(content);
        markSaved();
      }
    } else if (settingsState.lastOpenedFile) {
      const content = await readFile(settingsState.lastOpenedFile);
      if (content !== null) {
        editorState.content = content;
        updateWordCount(content);
        editorComponent?.setContent(content);
        markSaved();
      }
    }
  });

  onDestroy(() => {
    unlistenCloseRequested?.();
    if (scrollSync) {
      scrollSync.destroy();
    }
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<AppLayout
  {viewMode}
  onViewModeChange={handleViewModeChange}
  onSave={handleSave}
  onSaveAs={handleSaveAs}
  onOpen={handleOpen}
  onNew={handleNew}
  onAbout={handleAbout}
  isModified={editorState.isModified}
  isLoading={fileState.isLoading}
  {fileName}
>
  {#if viewMode === 'split' || viewMode === 'editor'}
    <div class="editor-pane">
      <EditorToolbar onFormat={handleFormat} />
      <Editor bind:this={editorComponent} content={editorState.content} />
    </div>
  {/if}

  {#if viewMode === 'split' || viewMode === 'viewer'}
    <div class="viewer-pane">
      <ViewerToolbar onCopyHtml={handleCopyHtml} onPrint={handlePrint} />
      <Viewer
        bind:this={viewerComponent}
        content={editorState.content}
        onViewerReady={handleViewerReady}
      />
    </div>
  {/if}
</AppLayout>

<AboutDialog open={showAbout} onClose={handleCloseAbout} />
<CommandPalette
  open={showCommandPalette}
  onClose={handleCloseCommandPalette}
  onNew={handleNew}
  onOpen={handleOpen}
  onSave={handleSave}
  onSaveAs={handleSaveAs}
  onViewModeChange={handleViewModeChange}
  onAbout={handleAbout}
  onCopyHtml={handleCopyHtml}
  onPrint={handlePrint}
/>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .viewer-pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
</style>
