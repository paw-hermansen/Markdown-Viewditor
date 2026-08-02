import type { EditorView } from "@codemirror/view";

interface ScrollSyncOptions {
  throttleMs?: number;
}

interface LinePosition {
  line: number;
  top: number;
}

export function createScrollSync(
  editor: EditorView,
  viewer: HTMLElement,
  options: ScrollSyncOptions = {},
) {
  const { throttleMs = 16 } = options;
  // After a sync moves pane B, ignore pane B's scroll events for this long.
  // This breaks the feedback loop (A→B→A→B→…) that caused the editor and
  // viewer to slowly drift upward by themselves. 100ms is long enough that
  // the sync-induced scroll event (fired synchronously from scrollTop
  // assignment) is always caught, yet short enough that the user doesn't
  // notice a delay when manually switching which pane they scroll.
  const SYNC_COOLDOWN = 100;

  type Direction = "viewer-to-editor" | "editor-to-viewer";
  let syncDirection: Direction | null = null;
  let lastSyncTime = 0;
  let lastEditorScrollTime = 0;
  let lastViewerScrollTime = 0;
  let rafId: number | null = null;
  let editorTrailingTimer: ReturnType<typeof setTimeout> | null = null;
  let viewerTrailingTimer: ReturnType<typeof setTimeout> | null = null;
  // While paused, both scroll handlers are no-ops. Used by Reload (and the
  // external-modification reload) to suppress sync-induced scrolls while the
  // editor and viewer are being repopulated, so a transiently clamped scroll
  // position on one pane (e.g. WebView2 clamping the editor to 0 before its
  // new height is measured) cannot propagate to the other pane and overwrite
  // its own scroll-position restore.
  let paused = false;

  function pause(): void {
    paused = true;
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    // Drop any pending trailing syncs scheduled before the pause; their
    // captured direction/snapshot may no longer match the restored layout.
    if (editorTrailingTimer) {
      clearTimeout(editorTrailingTimer);
      editorTrailingTimer = null;
    }
    if (viewerTrailingTimer) {
      clearTimeout(viewerTrailingTimer);
      viewerTrailingTimer = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // Reset sync state so the first post-resume user scroll isn't mistaken
    // for a sync-induced scroll and dropped by the cooldown.
    syncDirection = null;
    lastSyncTime = 0;
  }

  function getViewerPaddingTop(): number {
    return parseFloat(getComputedStyle(viewer).paddingTop) || 0;
  }

  function getViewerLinePositions(): LinePosition[] {
    const positions: LinePosition[] = [];
    const elements = viewer.querySelectorAll("[data-line]");
    const viewerRect = viewer.getBoundingClientRect();
    const scrollTop = viewer.scrollTop;
    const paddingTop = getViewerPaddingTop();

    elements.forEach((el) => {
      const line = parseInt(el.getAttribute("data-line") || "0", 10);
      if (line > 0) {
        const rect = el.getBoundingClientRect();
        const top = rect.top - viewerRect.top + scrollTop - paddingTop;
        positions.push({ line, top });
      }
    });

    positions.sort((a, b) => a.line - b.line);
    return positions;
  }

  function getEditorVisibleLine(): number {
    const paddingTop = editor.documentPadding.top;
    const height = editor.scrollDOM.scrollTop - paddingTop;
    const block = editor.lineBlockAtHeight(Math.max(0, height));
    return editor.state.doc.lineAt(block.from).number;
  }

  function getEditorLinePositions(): LinePosition[] {
    const positions: LinePosition[] = [];

    for (let i = 1; i <= editor.state.doc.lines; i++) {
      const lineInfo = editor.state.doc.line(i);
      const block = editor.lineBlockAt(lineInfo.from);
      positions.push({ line: i, top: block.top });
    }

    positions.sort((a, b) => a.line - b.line);
    return positions;
  }

  function interpolatePosition(
    targetLine: number,
    positions: LinePosition[],
  ): number {
    if (positions.length === 0) return 0;
    if (positions.length === 1) return positions[0].top;

    if (targetLine <= positions[0].line) {
      return positions[0].top;
    }
    if (targetLine >= positions[positions.length - 1].line) {
      return positions[positions.length - 1].top;
    }

    let before = positions[0];
    let after = positions[1];

    for (let i = 0; i < positions.length - 1; i++) {
      if (
        positions[i].line <= targetLine &&
        positions[i + 1].line >= targetLine
      ) {
        before = positions[i];
        after = positions[i + 1];
        break;
      }
    }

    if (after.line === before.line) return before.top;

    const ratio = (targetLine - before.line) / (after.line - before.line);
    return before.top + ratio * (after.top - before.top);
  }

  function getLineFromPosition(
    targetTop: number,
    positions: LinePosition[],
  ): number {
    if (positions.length === 0) return 1;
    if (positions.length === 1) return positions[0].line;

    if (targetTop <= positions[0].top) {
      return positions[0].line;
    }
    if (targetTop >= positions[positions.length - 1].top) {
      return positions[positions.length - 1].line;
    }

    let before = positions[0];
    let after = positions[1];

    for (let i = 0; i < positions.length - 1; i++) {
      if (positions[i].top <= targetTop && positions[i + 1].top >= targetTop) {
        before = positions[i];
        after = positions[i + 1];
        break;
      }
    }

    if (after.top === before.top) return before.line;

    const ratio = (targetTop - before.top) / (after.top - before.top);
    return Math.round(before.line + ratio * (after.line - before.line));
  }

  function syncEditorToViewer(): void {
    const editorLine = getEditorVisibleLine();
    const viewerPositions = getViewerLinePositions();
    const viewerDocTop = interpolatePosition(editorLine, viewerPositions);
    const target = viewerDocTop + getViewerPaddingTop();

    lastSyncTime = Date.now();
    syncDirection = "editor-to-viewer";
    viewer.scrollTop = target;
  }

  function syncViewerToEditor(): void {
    const viewerDocTop = viewer.scrollTop - getViewerPaddingTop();
    const viewerPositions = getViewerLinePositions();
    const editorLine = getLineFromPosition(viewerDocTop, viewerPositions);
    const editorPositions = getEditorLinePositions();
    const editorDocTop = interpolatePosition(editorLine, editorPositions);
    const target = editorDocTop + editor.documentPadding.top;

    lastSyncTime = Date.now();
    syncDirection = "viewer-to-editor";
    editor.scrollDOM.scrollTop = target;
  }

  function handleEditorScroll() {
    if (paused) return;
    // Block sync-induced scrolls: if the last sync was viewer-to-editor
    // (i.e., the viewer moved the editor), ignore the editor's scroll
    // events for SYNC_COOLDOWN ms. This breaks the feedback loop that
    // caused both panes to drift upward indefinitely.
    if (
      syncDirection === "viewer-to-editor" &&
      Date.now() - lastSyncTime < SYNC_COOLDOWN
    ) {
      return;
    }

    syncDirection = "editor-to-viewer";

    const now = Date.now();
    if (now - lastEditorScrollTime < throttleMs) {
      // Throttled — schedule a trailing sync to ensure we don't miss the
      // final position after the last scroll event in a burst.
      if (editorTrailingTimer) clearTimeout(editorTrailingTimer);
      editorTrailingTimer = setTimeout(() => {
        editorTrailingTimer = null;
        if (syncDirection !== "editor-to-viewer") return;
        syncEditorToViewer();
      }, throttleMs);
      return;
    }
    lastEditorScrollTime = now;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (syncDirection !== "editor-to-viewer") return;
      syncEditorToViewer();
    });
  }

  function handleViewerScroll() {
    if (paused) return;
    // Block sync-induced scrolls: if the last sync was editor-to-viewer
    // (i.e., the editor moved the viewer), ignore the viewer's scroll
    // events for SYNC_COOLDOWN ms.
    if (
      syncDirection === "editor-to-viewer" &&
      Date.now() - lastSyncTime < SYNC_COOLDOWN
    ) {
      return;
    }

    syncDirection = "viewer-to-editor";

    const now = Date.now();
    if (now - lastViewerScrollTime < throttleMs) {
      // Throttled — schedule a trailing sync to catch the final position.
      if (viewerTrailingTimer) clearTimeout(viewerTrailingTimer);
      viewerTrailingTimer = setTimeout(() => {
        viewerTrailingTimer = null;
        if (syncDirection !== "viewer-to-editor") return;
        syncViewerToEditor();
      }, throttleMs);
      return;
    }
    lastViewerScrollTime = now;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (syncDirection !== "viewer-to-editor") return;
      syncViewerToEditor();
    });
  }

  editor.scrollDOM.addEventListener("scroll", handleEditorScroll, {
    passive: true,
  });
  viewer.addEventListener("scroll", handleViewerScroll, { passive: true });

  return {
    destroy() {
      editor.scrollDOM.removeEventListener("scroll", handleEditorScroll);
      viewer.removeEventListener("scroll", handleViewerScroll);

      if (rafId) cancelAnimationFrame(rafId);
      if (editorTrailingTimer) clearTimeout(editorTrailingTimer);
      if (viewerTrailingTimer) clearTimeout(viewerTrailingTimer);
    },
    pause,
    resume,
  };
}
