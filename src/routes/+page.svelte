<script lang="ts">
  import type { PersistedTab, ViewMode } from "$lib/types";
  import AppLayout from "$lib/components/Layout/AppLayout.svelte";
  import TabBar from "$lib/components/Layout/TabBar.svelte";
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
    hasUnsavedChanges,
    updateWordCount,
    DEFAULT_CONTENT,
  } from "$lib/stores/editor.svelte";
  import {
    fileState,
    showOpenDialog,
    saveFile,
    saveFileAs,
    showSaveDialog,
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
  import {
    tabsState,
    createTab,
    insertTab,
    tabById,
    tabPath,
    tabDirty,
    findTabByPath,
    neighborOf,
    removeTab,
    parkActive,
    loadTab,
    type DocTab,
  } from "$lib/stores/tabs.svelte";
  import {
    zoomIn,
    zoomOut,
    resetZoom,
    withNominalZoom,
    handleZoomWheel,
    registerZoomScrollAnchor,
  } from "$lib/stores/zoom.svelte";
  import {
    createEditorScrollAnchor,
    createViewerScrollAnchor,
  } from "$lib/utils/zoom-scroll-anchor";
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
  registerCommands,
  handleGlobalKeydown as registryHandleGlobalKeydown,
} from "$lib/commands/registry.svelte";
import { buildPageCommands } from "$lib/commands/page-commands";
  import {
    runExporter,
    ensureExporters,
    getExporter,
    listExporters,
  } from "$lib/export/registry.svelte";
  import { PDF_OPTION_ID } from "$lib/export/option-ids";
  import { OPTION_SETTING } from "$lib/export/option-settings";
  import { usesCapturePdf } from "$lib/export/pdf-mode";
  import { getThemeLabel } from "$lib/utils/themes";
  import { showExportConfirmDialog } from "$lib/stores/export-confirm-dialog.svelte";
  import { checkForUpdates, updaterState, initUpdaterEnabled } from "$lib/stores/update.svelte";

  // Capture-only platforms (macOS < 15) export PDFs via the save dialog +
  // create_pdf capture and have no print dialog; everything else prints.
  const exportOnly = usesCapturePdf();

  let viewMode = $state<ViewMode>(settingsState.viewMode);
  // The first tab stands for the live (still empty) document; onMount
  // restores the tabs saved at the last exit.
  tabsState.tabs = [createTab(settingsState.viewMode, settingsState.splitRatio)];
  tabsState.activeId = tabsState.tabs[0].id;
  const savedTabs = settingsState.openTabs;
  const savedActiveTab = settingsState.activeTab;
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
  let unregisterZoomAnchor: (() => void) | undefined;
  let isCheckingExternalChanges = false;
  let isSaving = false;

  function handleFormat(format: string) {
    if (editorComponent) {
      editorComponent.insertFormatting(format);
    }
  }

  function handleFormatDocument() {
    if (editorComponent) {
      editorComponent.formatDocument();
    }
  }

  function handleFormatParagraph() {
    if (editorComponent) {
      editorComponent.formatParagraph();
    }
  }

  /**
   * The unsaved-changes gate shared by New, Open and Exit: confirm, and on
   * "save" run the save and honour its outcome. Returns false when the user
   * cancelled or the save failed — the caller must not proceed.
   */
  async function confirmUnsavedChanges(message: string): Promise<boolean> {
    if (!hasUnsavedChanges()) return true;
    const choice = await confirmSaveDiscardCancel(message);
    if (choice !== "save" && choice !== "discard") return false;
    return choice !== "save" || (await handleSave());
  }

  /**
   * Load a file into the editor and viewer. Returns false when the file
   * could not be read, in which case the previous document is left as-is.
   */
  async function loadContentIntoEditor(path: string): Promise<boolean> {
    fileState.isLoadingContent = true;
    viewerComponent?.resetRenderState();
    try {
      const content = await readFile(path);
      if (content === null) return false;
      editorState.content = content;
      updateWordCount(content);
      editorComponent?.swapState(content);
      viewerComponent?.scrollToTop();
      markSaved();
      await viewerComponent?.waitForRender();
      return true;
    } finally {
      // Always clear the flag: a read that throws would otherwise leave the
      // loading overlay up forever.
      fileState.isLoadingContent = false;
    }
  }

  async function handleNew() {
    if (fileState.isLoading) return;
    await newTab();
  }

  /**
   * Switch to `tab`: park the live document in the active tab and load
   * `tab` into the live stores (see stores/tabs.svelte.ts). A tab restored
   * from settings reads its file on first activation.
   */
  async function activateTab(tab: DocTab) {
    // While a file loads, it must land in the tab that requested it.
    if (tab.id === tabsState.activeId || fileState.isLoadingContent) return;
    scrollSync?.pause();
    try {
      parkActive(viewMode, editorComponent?.swapState(tab.content, tab.cm));
      loadTab(tab);
      viewMode = tab.viewMode;
      viewerComponent?.resetRenderState();
      viewerComponent?.scrollToTop();
    } finally {
      scrollSync?.resume();
    }
    if (tab.pending && tab.file.currentFile) {
      tab.pending = false;
      if (!(await loadContentIntoEditor(tab.file.currentFile))) {
        await closeTab(tab.id);
      }
    } else {
      void checkActiveFileOnDisk();
    }
  }

  async function newTab() {
    await activateTab(insertTab(createTab(viewMode, settingsState.splitRatio)));
  }

  /** Close a tab, confirming unsaved changes. The last tab is replaced by an empty one. */
  async function closeTab(id: number) {
    const tab = tabById(id);
    if (!tab) return;
    if (tabDirty(tab)) {
      await activateTab(tab);
      if (!(await confirmUnsavedChanges(MSG.closeTabUnsaved))) return;
    }
    if (tabsState.tabs.length === 1) {
      await newTab();
    } else if (id === tabsState.activeId) {
      const isLast = tabsState.tabs.at(-1)?.id === id;
      await activateTab(neighborOf(id, isLast ? -1 : 1));
    }
    removeTab(id);
  }

  /**
   * Open files in tabs. With `path` given it is opened directly; otherwise
   * the picker runs first. An already open file is switched to; an
   * untouched Untitled tab is reused.
   *
   * Not safe to bind to a button: a DOM handler is called with its event as
   * the first argument, which would be taken for a path and handed to
   * `read_file`. Use {@link handleOpen} for that.
   */
  async function openFile(path?: string) {
    const targets = path ? [path] : await showOpenDialog();
    for (const target of targets ?? []) {
      const existing = findTabByPath(target);
      if (existing) {
        await activateTab(existing);
        continue;
      }
      const created = !!fileState.currentFile || hasUnsavedChanges();
      if (created) await newTab();
      if (!(await loadContentIntoEditor(target)) && created) {
        await closeTab(tabsState.activeId);
      }
    }
  }

  /**
   * Open handler for the toolbar and command palette. Deliberately
   * zero-argument: `onclick={onOpen}` passes a MouseEvent, which `openFile`
   * would read as a path.
   */
  async function handleOpen() {
    await openFile();
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
    for (const tab of [...tabsState.tabs]) {
      if (!tabDirty(tab)) continue;
      await activateTab(tab);
      if (!(await confirmUnsavedChanges(MSG.exitUnsaved))) return false;
    }
    try {
      await invoke("save_window_state");
    } catch {
      // best-effort; ignore persistence failures at exit
    }
    await invoke("force_close_window");
    return true;
  }

  /** Check the active file on disk (window focus, tab switch): offer reload or flag deletion. */
  async function checkActiveFileOnDisk() {
    if (!fileState.currentFile || isCheckingExternalChanges || isSaving) return;
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
   * the PDF exporter (see src/lib/export/exporters/pdf.ts), which also picks
   * the platform output route (system print dialog, or the legacy macOS
   * `invoke('create_pdf')` capture on macOS < 15). Preserves the
   * `print-friendly` / `theme-export` body classes that app.css keys off of.
   */
  async function handlePrint() {
    // Bail out before any dialog when the viewer pane is not mounted (e.g.
    // editor-only mode) — there is nothing to print, and the confirmation
    // dialog's hint points at the Export as… menu, which is only rendered
    // alongside the viewer. Mirrors handleExport's up-front guard.
    await viewerComponent?.waitForRender();
    const viewerContent = viewerComponent?.getViewerContentElement();
    if (!viewerContent) return;

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

    let resolvedIncludeFrontmatter = Boolean(
      OPTION_SETTING[PDF_OPTION_ID]?.get() ?? true,
    );

    if (!settingsState.exportConfirmDismissed) {
      const currentOptions: Record<string, unknown> = {
        [PDF_OPTION_ID]: resolvedIncludeFrontmatter,
      };
      const result = await showExportConfirmDialog({
        title: exportOnly ? 'Export PDF' : 'Print / PDF',
        themeKind: 'viewer',
        themeLabel: getThemeLabel(viewerState.theme),
        actionLabel: "Print",
        exportOnly,
        optionGroups: pdfOptionGroups,
        currentOptions,
      });
      if (!result.confirmed) return;
      if (result.options) {
        resolvedIncludeFrontmatter = !!result.options[PDF_OPTION_ID];
        OPTION_SETTING[PDF_OPTION_ID]?.set(result.options[PDF_OPTION_ID]);
      }
    }

    startExporting();
    try {
      // Lazy: pulls the print/export pipeline (mermaid print variant,
      // math-fit) into its own chunk. The entry bundle must not statically
      // import exporter implementations — see export/option-ids.ts.
      const { exportPdf } = await import("$lib/export/exporters/pdf");
      let htmlForPdf = viewerContent.innerHTML;
      if (!resolvedIncludeFrontmatter) {
        const clone = viewerContent.cloneNode(true) as HTMLElement;
        clone.querySelector(".frontmatter-card")?.remove();
        htmlForPdf = clone.innerHTML;
      }
      // Exports always run at zoom 1.0 (physical print scale must not follow
      // the on-screen zoom) — see withNominalZoom and the .agents/guides/export-print.md contract.
      const result = await withNominalZoom(() =>
        exportPdf(htmlForPdf, fileName, viewerContent),
      );
      if (result.savedPath) {
        toast.info("PDF saved", result.savedPath);
      }
      for (const w of result.warnings) toast.error("Export warning", w);
    } catch (e) {
      console.error("Print/PDF failed:", e);
      toast.error(exportOnly ? "Create PDF failed" : "Print failed", String(e));
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

    // The exporters load lazily on first use (keeps the export pipeline
    // out of the startup bundle) — make sure they are there before the
    // registry lookup. Idempotent and concurrency-safe.
    await ensureExporters();

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
          (resolvedOptions ??= {})[opt.id] =
            OPTION_SETTING[opt.id]?.get() ?? opt.value;
        }
      }
    }

    if (shouldShowDialog) {
      // Pre-fill the option values from settings.
      const currentOptions: Record<string, unknown> = {};
      for (const group of optionGroups) {
        for (const opt of group.options) {
          currentOptions[opt.id] = OPTION_SETTING[opt.id]?.get() ?? opt.value;
        }
      }
      const isNeutral = id === 'odt' || id === 'docx';
      const titleMap: Record<string, string> = { html: 'Export HTML', 'html-bundle': 'Export HTML Bundle', odt: 'Export ODT', docx: 'Export DOCX' };
      const result = await showExportConfirmDialog({
        title: titleMap[id] ?? (exportOnly ? 'Export' : 'Export / Print'),
        themeKind: isNeutral ? 'neutral' : 'viewer',
        themeLabel: getThemeLabel(viewerState.theme),
        actionLabel: "Export",
        exportOnly,
        optionGroups,
        currentOptions,
      });
      if (!result.confirmed) return;
      // Persist the chosen option values so future exports reflect the
      // last-used preference even when the dialog is dismissed.
      if (result.options) {
        for (const [k, v] of Object.entries(result.options)) {
          OPTION_SETTING[k]?.set(v);
        }
        resolvedOptions = result.options;
      }
    }

    startExporting();
    try {
      // Runs at zoom 1.0 like the PDF path (measurement-based exporters, e.g.
      // ODT rasterization, must not see the on-screen zoom).
      const result = await withNominalZoom(() =>
        runExporter(id, {
          markdown: editorState.content,
          html,
          frontmatter,
          fileName,
          tokens,
          options: resolvedOptions,
        }),
      );
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
    registryHandleGlobalKeydown(e, {
      isLoading: fileState.isLoading,
      exporting: exportingState.active,
    });
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

  // Persist the file tabs (untitled ones are skipped) for the next start.
  $effect(() => {
    const open: PersistedTab[] = [];
    let active = 0;
    for (const t of tabsState.tabs) {
      const path = tabPath(t);
      if (!path) continue;
      const isActive = t.id === tabsState.activeId;
      if (isActive) active = open.length;
      open.push({
        path,
        viewMode: isActive ? viewMode : t.viewMode,
        splitRatio: isActive ? settingsState.splitRatio : t.splitRatio,
      });
    }
    updateSetting("openTabs", open);
    updateSetting("activeTab", active);
  });

  // Register app commands once.
  registerCommands(
    buildPageCommands(
      {
        handleNew: () => { void handleNew(); },
        handleOpen: () => { void handleOpen(); },
        handleSave: () => { void handleSave(); },
        handleSaveAs: () => { void handleSaveAs(); },
        handleReload: () => { void handleReload(); },
        handleExit: () => { void handleExit(); },
        handlePrint: () => { void handlePrint(); },
        togglePalette: () => { showCommandPalette = !showCommandPalette; },
        cycleViewMode,
        nextTab: () => void activateTab(neighborOf(tabsState.activeId, 1)),
        prevTab: () => void activateTab(neighborOf(tabsState.activeId, -1)),
        zoomIn: () => void zoomIn(),
        zoomOut: () => void zoomOut(),
        resetZoom: () => void resetZoom(),
        handleFormatDocument: () => { void handleFormatDocument(); },
        handleFormatParagraph: () => { void handleFormatParagraph(); },
        handleAbout: () => { void handleAbout(); },
        handleFormat,
      },
      { exportOnly },
    ),
  );

  // Export commands derived from the exporter registry. The exporters
  // register lazily, so enumerate reactively: this used to be a one-shot
  // `for` over `listExporters()` at init — which saw the still-empty
  // registry — and the export commands never reached the CommandPalette.
  const registeredExportCommands = new Set<string>();
  $effect(() => {
    for (const e of listExporters()) {
      if (registeredExportCommands.has(e.id)) continue;
      registeredExportCommands.add(e.id);
      registerCommands([
        {
          id: `export-${e.id}`,
          title: e.label,
          category: "Export",
          run: () => handleExport(e.id),
        },
      ]);
    }
  });

  onMount(async () => {
    // Ctrl/Cmd+wheel (and macOS trackpad pinch) zoom. The listener must be
    // non-passive so handleZoomWheel can preventDefault the page gesture.
    window.addEventListener("wheel", handleZoomWheel, { passive: false });

    // Keep the visible line anchored across zoom changes (the content above
    // it re-flows: line wrapping, diagram fit). Scroll-sync is paused for the
    // whole capture/restore window so it cannot re-map one pane from the
    // other mid-restore.
    const editorAnchor = createEditorScrollAnchor(() =>
      editorComponent?.getEditorView(),
    );
    const viewerAnchor = createViewerScrollAnchor(() => viewerElement);
    unregisterZoomAnchor = registerZoomScrollAnchor({
      capture() {
        scrollSync?.pause();
        editorAnchor.capture();
        viewerAnchor.capture();
      },
      restore() {
        try {
          editorAnchor.restore();
          viewerAnchor.restore();
        } finally {
          // After the editor anchor's deferred (post-re-measure) restore.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => scrollSync?.resume()),
          );
        }
      },
    });

    // The built-in exporters (HTML, PDF, …) register lazily on the first
    // export interaction — see ensureExporters() — so the export pipeline
    // stays out of the startup bundle.

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
        if (focused) await checkActiveFileOnDisk();
      },
    );

    // Register the open-file listener BEFORE draining opened_urls so that no
    // RunEvent::Opened delivery (macOS Apple Event) is lost between the drain
    // and listener registration.
    unlistenOpenFile = await listen<string[]>("open-file", async (event) => {
      for (const path of event.payload) await openFile(path);
    });

    const initialUrls = await invoke<string[]>("opened_urls");
    if (savedTabs.length > 0) {
      // Restore lazily: only the active tab's file is read now.
      const first = tabsState.tabs[0];
      tabsState.tabs.push(
        ...savedTabs.map((t) => createTab(t.viewMode, t.splitRatio, t.path, true)),
      );
      await activateTab(
        tabsState.tabs[1 + Math.min(savedActiveTab, savedTabs.length - 1)],
      );
      // Unless a failed read fell back to it.
      if (first.id !== tabsState.activeId) removeTab(first.id);
    } else if (settingsState.lastOpenedFile && initialUrls.length === 0) {
      await loadContentIntoEditor(settingsState.lastOpenedFile);
    } else if (initialUrls.length === 0) {
      editorState.content = DEFAULT_CONTENT;
      updateWordCount(DEFAULT_CONTENT);
      editorComponent?.setContent(DEFAULT_CONTENT);
      markSaved();
    }
    for (const path of initialUrls) await openFile(path);

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
    unregisterZoomAnchor?.();
    window.removeEventListener("wheel", handleZoomWheel);
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
>
  {#snippet tabBar()}
    <TabBar
      onSelect={(id) => void activateTab(tabById(id))}
      onClose={(id) => void closeTab(id)}
    />
  {/snippet}
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
        loading={fileState.isLoadingContent}
        onViewerReady={handleViewerReady}
        onLocalMarkdownOpen={openFile}
      />
    </div>
  {/if}
</AppLayout>

<AboutDialog open={showAbout} onClose={handleCloseAbout} />
<CommandPalette
  open={showCommandPalette}
  onClose={handleCloseCommandPalette}
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
