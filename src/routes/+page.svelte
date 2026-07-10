<script lang="ts">
  import type { ViewMode } from '$lib/types';
  import AppLayout from '$lib/components/Layout/AppLayout.svelte';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import EditorToolbar from '$lib/components/Editor/EditorToolbar.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import ViewerToolbar from '$lib/components/Viewer/ViewerToolbar.svelte';
  import { editorState, markSaved, resetEditor, hasUnsavedChanges } from '$lib/stores/editor.svelte';
  import { fileState, openFile, saveFile, saveFileAs, closeFile, readFile, getFileName } from '$lib/stores/file.svelte';
  import { settingsState, updateViewMode } from '$lib/stores/settings.svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { createScrollSync } from '$lib/utils/scroll-sync';
  import { onMount, onDestroy } from 'svelte';

  let viewMode = $state<ViewMode>(settingsState.viewMode);
  let editorComponent = $state<Editor | undefined>(undefined);
  let viewerComponent = $state<Viewer | undefined>(undefined);
  let fileName = $derived(fileState.currentFile ? getFileName(fileState.currentFile) : 'Untitled');
  let scrollSync: ReturnType<typeof createScrollSync> | undefined;
  let viewerElement: HTMLDivElement | undefined;

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  async function handleNew() {
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
    const viewerContent = document.querySelector('.viewer-content');
    if (viewerContent) {
      navigator.clipboard.writeText(viewerContent.innerHTML);
    }
  }

  function handlePrint() {
    window.print();
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
    if (settingsState.lastOpenedFile) {
      const content = await readFile(settingsState.lastOpenedFile);
      if (content !== null) {
        editorState.content = content;
        editorComponent?.setContent(content);
        markSaved();
      }
    }
  });

  onDestroy(() => {
    if (scrollSync) {
      scrollSync.destroy();
    }
  });
</script>

<AppLayout
  {viewMode}
  onViewModeChange={handleViewModeChange}
  onSave={handleSave}
  onSaveAs={handleSaveAs}
  onOpen={handleOpen}
  onNew={handleNew}
  isModified={editorState.isModified}
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
