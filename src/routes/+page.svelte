<script lang="ts">
  import type { ViewMode } from '$lib/types';
  import AppLayout from '$lib/components/Layout/AppLayout.svelte';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import EditorToolbar from '$lib/components/Editor/EditorToolbar.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import ViewerToolbar from '$lib/components/Viewer/ViewerToolbar.svelte';
  import { editorState, markSaved, resetEditor, hasUnsavedChanges } from '$lib/stores/editor.svelte';
  import { fileState, openFile, saveFile, saveFileAs, closeFile, getFileName } from '$lib/stores/file.svelte';
  import { ask } from '@tauri-apps/plugin-dialog';

  let viewMode = $state<ViewMode>('split');
  let editorComponent = $state<Editor | undefined>(undefined);
  let fileName = $derived(fileState.currentFile ? getFileName(fileState.currentFile) : 'Untitled');

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  async function handleNew() {
    if (hasUnsavedChanges()) {
      const confirmed = await ask('You have unsaved changes. Create new file?', { title: 'MarkEdiViewer', kind: 'warning' });
      if (!confirmed) return;
    }
    resetEditor();
    editorComponent?.setContent('');
    closeFile();
  }

  async function handleOpen() {
    if (hasUnsavedChanges()) {
      const confirmed = await ask('You have unsaved changes. Open a new file?', { title: 'MarkEdiViewer', kind: 'warning' });
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
      <Viewer content={editorState.content} />
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
