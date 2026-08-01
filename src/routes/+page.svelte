<script lang="ts">
  import type { ViewMode } from '$lib/types';
  import AppLayout from '$lib/components/Layout/AppLayout.svelte';
  import Editor from '$lib/components/Editor/Editor.svelte';
  import EditorToolbar from '$lib/components/Editor/EditorToolbar.svelte';
  import Viewer from '$lib/components/Viewer/Viewer.svelte';
  import ViewerToolbar from '$lib/components/Viewer/ViewerToolbar.svelte';
  import AboutDialog from '$lib/components/About/AboutDialog.svelte';
  import CommandPalette from '$lib/components/CommandPalette/CommandPalette.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import { editorState, markSaved, resetEditor, hasUnsavedChanges, updateWordCount } from '$lib/stores/editor.svelte';
  import { fileState, openFile, saveFile, saveFileAs, showSaveDialog, closeFile, readFile, getFileName, getFileInfo, checkExternalModification, markCurrentFileDeleted } from '$lib/stores/file.svelte';
  import { settingsState, updateViewMode } from '$lib/stores/settings.svelte';
  import { confirmSaveDiscardCancel, confirmYesNo, confirmOk } from '$lib/stores/confirm.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import { MSG } from '$lib/constants/messages';
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
  let unlistenFocusChanged: (() => void) | undefined;
  let isCheckingExternalChanges = false;
  let isSaving = false;

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  async function handleNew() {
    if (fileState.isLoading) return;

    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.newUnsaved);
      if (choice !== 'save' && choice !== 'discard') return;
      if (choice === 'save') {
        const saved = await handleSave();
        if (!saved) return;
      }
    }
    resetEditor();
    editorComponent?.setContent('');
    closeFile();
  }

  async function handleOpen() {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.openUnsaved);
      if (choice !== 'save' && choice !== 'discard') return;
      if (choice === 'save') {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const content = await openFile();
    if (content !== null) {
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.setContent(content);
      markSaved();
    }
  }

  /** Returns true when the document was saved (or nothing needed saving), false on cancel/failure. */
  async function handleSave(): Promise<boolean> {
    if (
      fileState.currentFile &&
      !fileState.forceSaveAs &&
      !hasUnsavedChanges() &&
      fileState.changeStatus === 'unchanged'
    ) {
      return true;
    }

    if (!fileState.currentFile || fileState.forceSaveAs) {
      isSaving = true;
      try {
        const path = await saveFileAs(editorState.content);
        if (path) {
          markSaved();
          return true;
        }
        return false;
      } finally {
        isSaving = false;
      }
    }

    const status = await checkExternalModification();
    if (status === 'deleted') {
      await confirmOk(MSG.externalDeleted, 'warning');
      return false;
    }
    if (status === 'modified') {
      const overwrite = await confirmYesNo(MSG.externalOverwrite);
      if (!overwrite) {
        return false;
      }
    }

    isSaving = true;
    try {
      const success = await saveFile(fileState.currentFile, editorState.content);
      if (success) {
        markSaved();
        return true;
      }
      return false;
    } finally {
      isSaving = false;
    }
  }

  async function handleSaveAs() {
    const path = await showSaveDialog();
    if (!path) return;

    const info = await getFileInfo(path);
    if (info && info.exists) {
      if (info.readonly) {
        toast.error(MSG.readonlySave, 'This file is read-only. Choose a different location.');
        return;
      }
      if (path === fileState.currentFile) {
        const status = await checkExternalModification();
        if (status === 'deleted') {
          // explicit recreate at the dead path; proceed
        } else if (status === 'modified') {
          const overwrite = await confirmYesNo(MSG.saveAsOverwrite);
          if (!overwrite) {
            return;
          }
        }
      } else {
        const name = getFileName(path);
        const replace = await confirmYesNo(
          `A file named "${name}" already exists. Do you want to replace it?`,
        );
        if (!replace) return;
      }
    }

    isSaving = true;
    try {
      const success = await saveFile(path, editorState.content);
      if (success) {
        markSaved();
      }
    } finally {
      isSaving = false;
    }
  }

  async function handleReload() {
    if (!fileState.currentFile || fileState.isLoading) return;
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.reloadUnsaved);
      if (choice !== 'save' && choice !== 'discard') return;
      if (choice === 'save') {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const status = await checkExternalModification();
    if (status === 'deleted') {
      await confirmOk(MSG.externalDeleted, 'warning');
      return;
    }

    const content = await readFile(fileState.currentFile);
    if (content !== null) {
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.setContent(content);
      await viewerComponent?.forceRender();
      markSaved();
    }
  }

  /** Shared exit flow used by both window-close and Ctrl+Q. Returns true if the app closed. */
  async function handleExit(): Promise<boolean> {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.exitUnsaved);
      if (choice !== 'save' && choice !== 'discard') return false;
      if (choice === 'save') {
        const saved = await handleSave();
        if (!saved) return false;
      }
    }
    try {
      await invoke('save_window_state');
    } catch {
      // best-effort; ignore persistence failures at exit
    }
    await invoke('force_close_window');
    return true;
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

  async function handlePrint() {
    const viewerContent = viewerComponent?.getViewerContentElement();
    if (!viewerContent) return;

    const printDiv = document.createElement('div');
    printDiv.classList.add('print-content');
    printDiv.innerHTML = viewerContent.innerHTML;
    document.body.appendChild(printDiv);

    const isMacOS = navigator.userAgent.includes('Macintosh');
    if (isMacOS) {
      document.body.classList.add('pdf-export');

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      try {
        await invoke('print_pdf');
        toast.info('PDF opened in Preview', 'Press Cmd+P in Preview to print');
      } catch (e) {
        console.error('Print failed:', e);
        toast.error('Print failed', String(e));
      }

      document.body.classList.remove('pdf-export');
    } else {
      window.print();
    }

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

    if (isMod && e.key === 'r') {
      e.preventDefault();
      handleReload();
      return;
    }

    if (isMod && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      handleExit();
      return;
    }

    if (isMod && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
      return;
    }

    if (isMod && e.key === 'p') {
      e.preventDefault();
      handlePrint();
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
      await handleExit();
    });

    unlistenFocusChanged = await getCurrentWindow().onFocusChanged(async ({ payload: focused }) => {
      if (!focused || !fileState.currentFile || isCheckingExternalChanges || isSaving) return;
      isCheckingExternalChanges = true;
      try {
        const previousStatus = fileState.changeStatus;
        const status = await checkExternalModification();
        if (status === 'modified') {
          if (previousStatus === 'modified') return;
          const message = hasUnsavedChanges()
            ? MSG.externalModifiedDirty
            : MSG.externalModifiedClean;
          const reload = await confirmYesNo(message);
          if (reload) {
            const content = await readFile(fileState.currentFile);
            if (content !== null) {
              editorState.content = content;
              updateWordCount(content);
              editorComponent?.setContent(content);
              markSaved();
            }
          }
        } else if (status === 'deleted') {
          if (previousStatus === 'deleted') return;
          markCurrentFileDeleted();
          await confirmOk(MSG.externalDeleted, 'warning');
        }
      } finally {
        isCheckingExternalChanges = false;
      }
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
    unlistenFocusChanged?.();
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
  onReload={handleReload}
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
  onReload={handleReload}
  onQuit={handleExit}
  onViewModeChange={handleViewModeChange}
  onAbout={handleAbout}
  onCopyHtml={handleCopyHtml}
  onPrint={handlePrint}
/>

<ConfirmDialog />
<Toaster />

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
