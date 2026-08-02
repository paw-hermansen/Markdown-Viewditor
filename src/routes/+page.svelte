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
  import { confirmSaveDiscardCancel, confirmOverwrite, confirmReplace, confirmReload, confirmOk } from '$lib/stores/confirm.svelte';
  import { toast } from '$lib/stores/toast.svelte';
  import { MSG } from '$lib/constants/messages';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen } from '@tauri-apps/api/event';
  import { save } from '@tauri-apps/plugin-dialog';
  import { createScrollSync } from '$lib/utils/scroll-sync';
  import { modLabel } from '$lib/utils/keyboard';
  import { onMount, onDestroy } from 'svelte';

  const isMacOS = navigator.userAgent.includes('Macintosh');

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
  let unlistenOpenFile: (() => void) | undefined;
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

  async function handleLocalMarkdownOpen(path: string) {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.openUnsaved);
      if (choice !== 'save' && choice !== 'discard') return;
      if (choice === 'save') {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const content = await readFile(path);
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
      const overwrite = await confirmOverwrite(MSG.externalOverwrite);
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
        toast.error(MSG.readOnlySaveFailed, 'This file is read-only. Choose a different location.');
        return;
      }
      if (path === fileState.currentFile) {
        const status = await checkExternalModification();
        if (status === 'deleted') {
          // explicit recreate at the dead path; proceed
        } else if (status === 'modified') {
          const overwrite = await confirmOverwrite(MSG.saveAsOverwrite);
          if (!overwrite) {
            return;
          }
        }
      } else {
        const name = getFileName(path);
        const replace = await confirmReplace(
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

    if (isMacOS) {
      const defaultName = fileState.currentFile
        ? getFileName(fileState.currentFile).replace(/\.[^.]+$/, '') + '.pdf'
        : 'Untitled.pdf';
      const defaultDir = fileState.currentFile
        ? fileState.currentFile.replace(/[^/\\]+$/, '')
        : undefined;
      const savePath = await save({
        defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      const printDiv = document.createElement('div');
      printDiv.classList.add('print-content');
      printDiv.innerHTML = viewerContent.innerHTML;
      document.body.appendChild(printDiv);
      document.body.classList.add('pdf-export');

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      try {
        await invoke('create_pdf', { savePath });
        toast.info('PDF saved', savePath);
      } catch (e) {
        console.error('Create PDF failed:', e);
        toast.error('Create PDF failed', String(e));
      }

      document.body.classList.remove('pdf-export');
      printDiv.remove();
    } else {
      const printDiv = document.createElement('div');
      printDiv.classList.add('print-content');
      printDiv.innerHTML = viewerContent.innerHTML;
      document.body.appendChild(printDiv);
      window.print();
      printDiv.remove();
    }
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
    const key = e.key.toLowerCase();

    if (key === 'f1') {
      e.preventDefault();
      showAbout = !showAbout;
      return;
    }

    if (isMod && e.shiftKey && key === 's') {
      e.preventDefault();
      handleSaveAs();
      return;
    }

    if (isMod && !e.shiftKey && key === 's') {
      e.preventDefault();
      handleSave();
      return;
    }

    if (isMod && e.shiftKey && key === 'p') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
      return;
    }

    if (isMod && !e.shiftKey && key === 'p') {
      e.preventDefault();
      handlePrint();
      return;
    }

    if (isMod && key === 'n') {
      e.preventDefault();
      handleNew();
      return;
    }

    if (isMod && key === 'o') {
      e.preventDefault();
      handleOpen();
      return;
    }

    if (isMod && key === 'r') {
      e.preventDefault();
      handleReload();
      return;
    }

    if (isMod && key === 'q') {
      e.preventDefault();
      handleExit();
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
          const reload = await confirmReload(message, hasUnsavedChanges());
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

    // Register the open-file listener BEFORE draining opened_urls so that no
    // RunEvent::Opened delivery (macOS Apple Event) is lost between the drain
    // and listener registration.
    unlistenOpenFile = await listen<string[]>('open-file', async (event) => {
      if (event.payload.length > 0) {
        const content = await readFile(event.payload[0]);
        if (content !== null) {
          editorState.content = content;
          updateWordCount(content);
          editorComponent?.setContent(content);
          markSaved();
        }
      }
    });

    const initialUrls = await invoke<string[]>('opened_urls');
    if (initialUrls.length > 0) {
      const content = await readFile(initialUrls[0]);
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
    unlistenOpenFile?.();
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
      <ViewerToolbar
        onCopyHtml={handleCopyHtml}
        onPrint={handlePrint}
        printLabel={isMacOS ? 'Create PDF' : 'Print'}
        printTitle={isMacOS ? modLabel('Create PDF (Ctrl+P)') : modLabel('Print (Ctrl+P)')}
      />
      <Viewer
        bind:this={viewerComponent}
        content={editorState.content}
        onViewerReady={handleViewerReady}
        onLocalMarkdownOpen={handleLocalMarkdownOpen}
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
  printLabel={isMacOS ? 'Create PDF' : 'Print Preview'}
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
