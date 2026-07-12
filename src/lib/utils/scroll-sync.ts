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
  let isSyncing = false;
  let lastEditorScrollTime = 0;
  let lastViewerScrollTime = 0;
  let rafId: number | null = null;

  function getViewerLinePositions(): LinePosition[] {
    const positions: LinePosition[] = [];
    const elements = viewer.querySelectorAll("[data-line]");
    const viewerRect = viewer.getBoundingClientRect();
    const scrollTop = viewer.scrollTop;
    const paddingTop = parseFloat(getComputedStyle(viewer).paddingTop) || 0;

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
    const editorRect = editor.dom.getBoundingClientRect();

    let bestLine = 1;
    let bestDistance = Infinity;

    for (let i = 1; i <= editor.state.doc.lines; i++) {
      const lineInfo = editor.state.doc.line(i);
      const coords = editor.coordsAtPos(lineInfo.from);
      if (coords) {
        const distance = Math.abs(coords.top - editorRect.top);
        if (coords.top <= editorRect.top + 10 && distance < bestDistance) {
          bestDistance = distance;
          bestLine = i;
        }
      }
    }

    return bestLine;
  }

  function getEditorLinePositions(): LinePosition[] {
    const positions: LinePosition[] = [];
    const scroller = editor.scrollDOM;
    const scrollerRect = scroller.getBoundingClientRect();
    const scrollTop = scroller.scrollTop;
    const paddingTop =
      parseFloat(getComputedStyle(editor.contentDOM).paddingTop) || 0;

    for (let i = 1; i <= editor.state.doc.lines; i++) {
      const lineInfo = editor.state.doc.line(i);
      const coords = editor.coordsAtPos(lineInfo.from);
      if (coords) {
        const top = coords.top - scrollerRect.top + scrollTop - paddingTop;
        positions.push({ line: i, top });
      }
    }

    positions.sort((a, b) => a.line - b.line);
    return positions;
  }

  function interpolateViewerPosition(
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

  function getEditorLineFromViewerPosition(
    viewerScrollTop: number,
    positions: LinePosition[],
  ): number {
    if (positions.length === 0) return 1;
    if (positions.length === 1) return positions[0].line;

    if (viewerScrollTop <= positions[0].top) {
      return positions[0].line;
    }
    if (viewerScrollTop >= positions[positions.length - 1].top) {
      return positions[positions.length - 1].line;
    }

    let before = positions[0];
    let after = positions[1];

    for (let i = 0; i < positions.length - 1; i++) {
      if (
        positions[i].top <= viewerScrollTop &&
        positions[i + 1].top >= viewerScrollTop
      ) {
        before = positions[i];
        after = positions[i + 1];
        break;
      }
    }

    if (after.top === before.top) return before.line;

    const ratio = (viewerScrollTop - before.top) / (after.top - before.top);
    return Math.round(before.line + ratio * (after.line - before.line));
  }

  function handleEditorScroll() {
    if (isSyncing) return;

    const now = Date.now();
    if (now - lastEditorScrollTime < throttleMs) return;
    lastEditorScrollTime = now;

    isSyncing = true;

    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      const editorLine = getEditorVisibleLine();
      const positions = getViewerLinePositions();
      const viewerTop = interpolateViewerPosition(editorLine, positions);

      viewer.scrollTop = viewerTop;

      setTimeout(() => {
        isSyncing = false;
      }, 50);
    });
  }

  function handleViewerScroll() {
    if (isSyncing) return;

    const now = Date.now();
    if (now - lastViewerScrollTime < throttleMs) return;
    lastViewerScrollTime = now;

    isSyncing = true;

    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      const viewerPositions = getViewerLinePositions();
      const editorLine = getEditorLineFromViewerPosition(
        viewer.scrollTop,
        viewerPositions,
      );

      const editorPositions = getEditorLinePositions();
      const editorTop = interpolateViewerPosition(editorLine, editorPositions);

      editor.scrollDOM.scrollTop = editorTop;

      setTimeout(() => {
        isSyncing = false;
      }, 50);
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

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    },
  };
}
