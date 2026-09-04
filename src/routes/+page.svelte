<script lang="ts">
  import type { ViewMode } from "$lib/types";
  import AppLayout from "$lib/components/Layout/AppLayout.svelte";
  import Editor from "$lib/components/Editor/Editor.svelte";
  import EditorToolbar from "$lib/components/Editor/EditorToolbar.svelte";
  import Viewer from "$lib/components/Viewer/Viewer.svelte";
  import ViewerToolbar from "$lib/components/Viewer/ViewerToolbar.svelte";
  import AboutDialog from "$lib/components/About/AboutDialog.svelte";
  import CommandPalette from "$lib/components/CommandPalette/CommandPalette.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import WarningDialog from "$lib/components/WarningDialog.svelte";
  import ExportConfirmDialog from "$lib/components/ExportConfirmDialog.svelte";
  import Toaster from "$lib/components/Toaster.svelte";
  import ExportOverlay from "$lib/components/ExportOverlay.svelte";
  import SkipLink from "$lib/components/SkipLink.svelte";
  import {
    editorState,
    markSaved,
    resetEditor,
    hasUnsavedChanges,
    updateWordCount,
  } from "$lib/stores/editor.svelte";
  import {
    fileState,
    openFile,
    saveFile,
    saveFileAs,
    showSaveDialog,
    closeFile,
    readFile,
    getFileName,
    getFileInfo,
    checkExternalModification,
    markCurrentFileDeleted,
  } from "$lib/stores/file.svelte";
  import {
    settingsState,
    updateViewMode,
    updateSetting,
  } from "$lib/stores/settings.svelte";
  import { viewerState } from "$lib/stores/viewer.svelte";
  import {
    confirmSaveDiscardCancel,
    confirmOverwrite,
    confirmReload,
    confirmOk,
  } from "$lib/stores/confirm.svelte";
  import { showWarningDialog } from "$lib/stores/warning-dialog.svelte";
  import { toast } from "$lib/stores/toast.svelte";
  import {
    startExporting,
    stopExporting,
    exportingState,
  } from "$lib/stores/exporting.svelte";
  import { MSG } from "$lib/constants/messages";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import { createScrollSync } from "$lib/utils/scroll-sync";
  import { onMount, onDestroy } from "svelte";
  import { renderMarkdown } from "$lib/utils/markdown";
  import {
    runExporter,
    registerBuiltinExporters,
    getExporter,
  } from "$lib/export/registry.svelte";
  import { exportPdf } from "$lib/export/exporters/pdf";
  import { PDF_OPTION_ID } from "$lib/export/exporters/pdf";
  import { getThemeLabel } from "$lib/utils/themes";
  import { showExportConfirmDialog } from "$lib/stores/export-confirm-dialog.svelte";
  import { updateStatus, checkForUpdates, updaterState, initUpdaterEnabled } from "$lib/stores/update.svelte";

  const isMacOS = navigator.userAgent.includes("Macintosh");

  let viewMode = $state<ViewMode>(settingsState.viewMode);
  let editorComponent = $state<Editor | undefined>(undefined);
  let viewerComponent = $state<Viewer | undefined>(undefined);
  let fileName = $derived(
    fileState.currentFile ? getFileName(fileState.currentFile) : "Untitled",
  );
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
      if (choice !== "save" && choice !== "discard") return;
      if (choice === "save") {
        const saved = await handleSave();
        if (!saved) return;
      }
    }
    resetEditor();
    editorComponent?.setContent("");
    closeFile();
  }

  async function handleOpen() {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.openUnsaved);
      if (choice !== "save" && choice !== "discard") return;
      if (choice === "save") {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const content = await openFile();
    if (content !== null) {
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.setContent(content, false);
      viewerComponent?.scrollToTop();
      markSaved();
    }
  }

  async function handleLocalMarkdownOpen(path: string) {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.openUnsaved);
      if (choice !== "save" && choice !== "discard") return;
      if (choice === "save") {
        const saved = await handleSave();
        if (!saved) return;
      }
    }

    const content = await readFile(path);
    if (content !== null) {
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.setContent(content, false);
      viewerComponent?.scrollToTop();
      markSaved();
    }
  }

  /** Returns true when the document was saved (or nothing needed saving), false on cancel/failure. */
  async function handleSave(): Promise<boolean> {
    if (
      fileState.currentFile &&
      !fileState.forceSaveAs &&
      !hasUnsavedChanges() &&
      fileState.changeStatus === "unchanged"
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
    if (status === "deleted") {
      await confirmOk(MSG.externalDeleted, "warning");
      return false;
    }
    if (status === "modified") {
      const overwrite = await confirmOverwrite(MSG.externalOverwrite);
      if (!overwrite) {
        return false;
      }
    }

    isSaving = true;
    try {
      const success = await saveFile(
        fileState.currentFile,
        editorState.content,
      );
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
        toast.error(
          MSG.readOnlySaveFailed,
          "This file is read-only. Choose a different location.",
        );
        return;
      }
      if (path === fileState.currentFile) {
        const status = await checkExternalModification();
        if (status === "deleted") {
          // explicit recreate at the dead path; proceed
        } else if (status === "modified") {
          const overwrite = await confirmOverwrite(MSG.saveAsOverwrite);
          if (!overwrite) {
            return;
          }
        }
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

    const status = await checkExternalModification();
    if (status === "deleted") {
      await confirmOk(MSG.externalDeleted, "warning");
      return;
    }

    if (hasUnsavedChanges()) {
      const reload = await confirmReload(MSG.reloadUnsaved, true);
      if (!reload) return;
    }

    const content = await readFile(fileState.currentFile);
    if (content !== null) {
      // Pause scroll-sync for the duration of the repopulation: the editor's
      // scroll restore is deferred to a rAF (see Editor.setContent) and on
      // WebView2 the editor's scrollTop is briefly clamped to 0 in the
      // meantime, which would otherwise propagate to the viewer and
      // overwrite the viewer's own anchor-based restore.
      scrollSync?.pause();
      try {
        editorState.content = content;
        updateWordCount(content);
        editorComponent?.setContent(content);
        await viewerComponent?.forceRender();
      } finally {
        scrollSync?.resume();
      }
      markSaved();
    }
  }

  /** Shared exit flow used by both window-close and Ctrl+Q. Returns true if the app closed. */
  async function handleExit(): Promise<boolean> {
    if (hasUnsavedChanges()) {
      const choice = await confirmSaveDiscardCancel(MSG.exitUnsaved);
      if (choice !== "save" && choice !== "discard") return false;
      if (choice === "save") {
        const saved = await handleSave();
        if (!saved) return false;
      }
    }
    try {
      await invoke("save_window_state");
    } catch {
      // best-effort; ignore persistence failures at exit
    }
    await invoke("force_close_window");
    return true;
  }

  function handleViewModeChange(mode: ViewMode) {
    viewMode = mode;
    updateViewMode(mode);
  }

  function cycleViewMode() {
    const next: ViewMode = viewMode === 'editor' ? 'split' : viewMode === 'split' ? 'viewer' : 'editor';
    handleViewModeChange(next);
  }

  /**
   * Print / Create PDF. Refactored to share the print-container builder with
   * the PDF exporter (see src/lib/export/exporters/pdf.ts). Preserves the
   * macOS `invoke('create_pdf')` branch and the `print-friendly` /
   * `theme-export` body classes that app.css keys off of.
   */
  async function handlePrint() {
    // Render markdown to detect frontmatter for the option dialog.
    const { frontmatter } = await renderMarkdown(
      editorState.content,
      fileState.currentFile,
    );

    const hasFrontmatter = frontmatter !== null;
    const pdfOptionGroups = [
      {
        id: "frontmatter",
        label: "Frontmatter",
        options: [
          {
            id: PDF_OPTION_ID,
            label: "Include frontmatter card",
            hint: "Show the frontmatter or skill card at the top of the exported document.",
            kind: "toggle" as const,
            value: true,
            disabledWhen: () => !hasFrontmatter,
          },
        ],
      },
    ];

    let resolvedIncludeFrontmatter = settingsState.pdfIncludeFrontmatter;

    if (!settingsState.exportConfirmDismissed) {
      const currentOptions: Record<string, unknown> = {
        [PDF_OPTION_ID]: settingsState.pdfIncludeFrontmatter,
      };
      const result = await showExportConfirmDialog({
        title: isMacOS ? 'Export PDF' : 'Print / PDF',
        themeKind: 'viewer',
        themeLabel: getThemeLabel(viewerState.theme),
        actionLabel: "Print",
        isMacOS,
        optionGroups: pdfOptionGroups,
        currentOptions,
      });
      if (!result.confirmed) return;
      if (result.dontShowAgain) {
        updateSetting("exportConfirmDismissed", true);
      }
      if (result.options) {
        resolvedIncludeFrontmatter = !!result.options[PDF_OPTION_ID];
        updateSetting("pdfIncludeFrontmatter", resolvedIncludeFrontmatter);
      }
    }

    const viewerContent = viewerComponent?.getViewerContentElement();
    if (!viewerContent) return;
    startExporting();
    try {
      let htmlForPdf = viewerContent.innerHTML;
      if (!resolvedIncludeFrontmatter) {
        const clone = viewerContent.cloneNode(true) as HTMLElement;
        clone.querySelector(".frontmatter-card")?.remove();
        htmlForPdf = clone.innerHTML;
      }
      const result = await exportPdf(htmlForPdf, fileName, viewerContent);
      if (result.savedPath) {
        toast.info("PDF saved", result.savedPath);
      }
      for (const w of result.warnings) toast.error("Export warning", w);
    } catch (e) {
      console.error("Print/PDF failed:", e);
      toast.error(isMacOS ? "Create PDF failed" : "Print failed", String(e));
    } finally {
      stopExporting();
    }
  }

  /**
   * Registry-fed export entry point. Used by the ViewerToolbar "Export ▾"
   * dropdown and the CommandPalette export commands. 'pdf' routes through
   * the same path as handlePrint; 'html' builds a self-contained standalone
   * document; 'odt' surfaces the per-export options dialog.
   */
  async function handleExport(id: string) {
    const viewerContent = viewerComponent?.getViewerContentElement();
    if (!viewerContent) return;

    if (id === "pdf") {
      await handlePrint();
      return;
    }

    const exporter = getExporter(id);
    if (!exporter) return;

    // Render markdown early so frontmatter is available for option groups.
    const { html, frontmatter, tokens } = await renderMarkdown(
      editorState.content,
      fileState.currentFile,
    );

    // Respect the user's "don't show again" preference for all exporters,
    // including those that expose per-export options. When the dialog is
    // skipped, saved option values are read from settings automatically.
    const optionGroups =
      exporter.optionGroups?.({
        markdown: editorState.content,
        html,
        frontmatter,
        fileName,
        tokens,
      }) ?? [];
    const hasOptions = optionGroups.length > 0;
    const shouldShowDialog =
      !settingsState.exportConfirmDismissed &&
      (exporter.themeCapable || hasOptions);

    let resolvedOptions: Record<string, unknown> | undefined;

    if (!shouldShowDialog && hasOptions) {
      for (const group of optionGroups) {
        for (const opt of group.options) {
          (resolvedOptions ??= {})[opt.id] = readSettingForOption(
            opt.id,
            opt.value,
          );
        }
      }
    }

    if (shouldShowDialog) {
      // Pre-fill the option values from settings.
      const currentOptions: Record<string, unknown> = {};
      for (const group of optionGroups) {
        for (const opt of group.options) {
          currentOptions[opt.id] = readSettingForOption(opt.id, opt.value);
        }
      }
      const isNeutral = id === 'odt';
      const titleMap: Record<string, string> = { html: 'Export HTML', 'html-bundle': 'Export HTML Bundle', odt: 'Export ODT' };
      const result = await showExportConfirmDialog({
        title: titleMap[id] ?? (isMacOS ? 'Export' : 'Export / Print'),
        themeKind: isNeutral ? 'neutral' : 'viewer',
        themeLabel: getThemeLabel(viewerState.theme),
        actionLabel: "Export",
        isMacOS,
        optionGroups,
        currentOptions,
      });
      if (!result.confirmed) return;
      if (result.dontShowAgain && exporter.themeCapable) {
        updateSetting("exportConfirmDismissed", true);
      }
      // Persist the chosen option values so future exports reflect the
      // last-used preference even when the dialog is dismissed.
      if (result.options) {
        for (const [k, v] of Object.entries(result.options)) {
          persistOption(k, v);
        }
        resolvedOptions = result.options;
      }
    }

    startExporting();
    try {
      const result = await runExporter(id, {
        markdown: editorState.content,
        html,
        frontmatter,
        fileName,
        tokens,
        options: resolvedOptions,
      });
      if (result.warnings.length > 0) {
        showWarningDialog(result.warnings, result.savedPath ?? "");
      } else if (result.savedPath) {
        toast.info("Exported", result.savedPath);
      }
    } catch (e) {
      console.error("Export failed:", e);
      toast.error("Export failed", String(e));
    } finally {
      stopExporting();
    }
  }

  /** Read a setting by its option-id suffix; falls back to the default. */
  function readSettingForOption(id: string, fallback: unknown): unknown {
    switch (id) {
      case "odt.rasterizeMath":
        return settingsState.odtRasterizeMath;
      case "odt.rasterizeSvg":
        return settingsState.odtRasterizeSvg;
      case "odt.rasterResolution":
        return settingsState.odtRasterResolution;
      case "html.includeFrontmatter":
        return settingsState.htmlIncludeFrontmatter;
      case "pdf.includeFrontmatter":
        return settingsState.pdfIncludeFrontmatter;
      case "odt.includeFrontmatter":
        return settingsState.odtIncludeFrontmatter;
      default:
        return fallback;
    }
  }

  function persistOption(id: string, value: unknown) {
    switch (id) {
      case "odt.rasterizeMath":
        updateSetting("odtRasterizeMath", !!value);
        break;
      case "odt.rasterizeSvg":
        updateSetting("odtRasterizeSvg", !!value);
        break;
      case "odt.rasterResolution":
        if (value === 1 || value === 2 || value === 3 || value === 4) {
          updateSetting("odtRasterResolution", value);
        }
        break;
      case "html.includeFrontmatter":
        updateSetting("htmlIncludeFrontmatter", !!value);
        break;
      case "pdf.includeFrontmatter":
        updateSetting("pdfIncludeFrontmatter", !!value);
        break;
      case "odt.includeFrontmatter":
        updateSetting("odtIncludeFrontmatter", !!value);
        break;
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
    if (fileState.isLoading || exportingState.active) return;

    const isMod = e.metaKey || e.ctrlKey;
    const code = e.code;

    if (code === "F1") {
      e.preventDefault();
      showAbout = !showAbout;
      return;
    }

    if (isMod && e.shiftKey && code === "KeyS") {
      e.preventDefault();
      handleSaveAs();
      return;
    }

    if (isMod && !e.shiftKey && code === "KeyS") {
      e.preventDefault();
      handleSave();
      return;
    }

    if (isMod && e.shiftKey && code === "KeyP") {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
      return;
    }

    if (isMod && !e.shiftKey && code === "KeyP") {
      e.preventDefault();
      handlePrint();
      return;
    }

    if (isMod && code === "KeyN") {
      e.preventDefault();
      handleNew();
      return;
    }

    if (isMod && code === "KeyO") {
      e.preventDefault();
      handleOpen();
      return;
    }

    if (isMod && code === "KeyR") {
      e.preventDefault();
      handleReload();
      return;
    }

    if (isMod && !e.shiftKey && code === "KeyQ") {
      e.preventDefault();
      handleExit();
      return;
    }

    if (isMod && e.shiftKey && code === "KeyV") {
      e.preventDefault();
      cycleViewMode();
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
    // Register the built-in exporters (HTML, PDF) so the toolbar dropdown
    // and command palette can list them. Idempotent.
    void registerBuiltinExporters();

    // Check whether the in-app updater is available (disabled in Flatpak, Windows Store).
    void initUpdaterEnabled();

    unlistenCloseRequested = await getCurrentWindow().onCloseRequested(
      async (event) => {
        event.preventDefault();
        await handleExit();
      },
    );

    unlistenFocusChanged = await getCurrentWindow().onFocusChanged(
      async ({ payload: focused }) => {
        if (
          !focused ||
          !fileState.currentFile ||
          isCheckingExternalChanges ||
          isSaving
        )
          return;
        isCheckingExternalChanges = true;
        try {
          const previousStatus = fileState.changeStatus;
          const status = await checkExternalModification();
          if (status === "modified") {
            if (previousStatus === "modified") return;
            const message = hasUnsavedChanges()
              ? MSG.externalModifiedDirty
              : MSG.externalModifiedClean;
            const reload = await confirmReload(message, hasUnsavedChanges());
            if (reload) {
              const content = await readFile(fileState.currentFile);
              if (content !== null) {
                scrollSync?.pause();
                try {
                  editorState.content = content;
                  updateWordCount(content);
                  editorComponent?.setContent(content);
                } finally {
                  scrollSync?.resume();
                }
                markSaved();
              }
            }
          } else if (status === "deleted") {
            if (previousStatus === "deleted") return;
            markCurrentFileDeleted();
            await confirmOk(MSG.externalDeleted, "warning");
          }
        } finally {
          isCheckingExternalChanges = false;
        }
      },
    );

    // Register the open-file listener BEFORE draining opened_urls so that no
    // RunEvent::Opened delivery (macOS Apple Event) is lost between the drain
    // and listener registration.
    unlistenOpenFile = await listen<string[]>("open-file", async (event) => {
      if (event.payload.length > 0) {
        const content = await readFile(event.payload[0]);
        if (content !== null) {
          editorState.content = content;
          updateWordCount(content);
          editorComponent?.setContent(content, false);
          viewerComponent?.scrollToTop();
          markSaved();
        }
      }
    });

    const initialUrls = await invoke<string[]>("opened_urls");
    if (initialUrls.length > 0) {
      const content = await readFile(initialUrls[0]);
      if (content !== null) {
        editorState.content = content;
        updateWordCount(content);
        editorComponent?.setContent(content, false);
        viewerComponent?.scrollToTop();
        markSaved();
      }
    } else if (settingsState.lastOpenedFile) {
      const content = await readFile(settingsState.lastOpenedFile);
      if (content !== null) {
        editorState.content = content;
        updateWordCount(content);
        editorComponent?.setContent(content, false);
        viewerComponent?.scrollToTop();
        markSaved();
      }
    }

    if (updaterState.enabled && settingsState.autoCheckUpdates) {
      setTimeout(() => {
        void checkForUpdates();
      }, 3000);
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

<SkipLink />

<AppLayout
  {viewMode}
  onViewModeChange={handleViewModeChange}
  onSave={handleSave}
  onSaveAs={handleSaveAs}
  onReload={handleReload}
  onOpen={handleOpen}
  onNew={handleNew}
  onAbout={handleAbout}
  onUpdateClick={handleAbout}
  updateAvailable={updateStatus.available}
  updateVersion={updateStatus.version}
  isModified={hasUnsavedChanges()}
  isLoading={fileState.isLoading}
  {fileName}
>
  {#if viewMode === "split" || viewMode === "editor"}
    <div class="editor-pane">
      <EditorToolbar onFormat={handleFormat} />
      <Editor bind:this={editorComponent} content={editorState.content} />
    </div>
  {/if}

  {#if viewMode === "split" || viewMode === "viewer"}
    <div class="viewer-pane">
      <ViewerToolbar onPrint={handlePrint} onExport={handleExport} />
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
  {viewMode}
  onViewModeChange={handleViewModeChange}
  onAbout={handleAbout}
  onPrint={handlePrint}
  onExport={handleExport}
  printLabel={isMacOS ? "Create PDF" : "Print Preview"}
/>

<ConfirmDialog />
<WarningDialog />
<ExportConfirmDialog />
<ExportOverlay />
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
