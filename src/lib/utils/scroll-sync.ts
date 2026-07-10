import { EditorView } from "@codemirror/view";

interface ScrollSyncOptions {
  throttleMs?: number;
}

export function createScrollSync(
  editor: EditorView,
  viewer: HTMLElement,
  options: ScrollSyncOptions = {},
) {
  const { throttleMs = 50 } = options;
  let isSyncing = false;
  let lastEditorScrollTime = 0;
  let lastViewerScrollTime = 0;
  let rafId: number | null = null;

  function getVisibleLineRange(scrollDom: HTMLElement): {
    startLine: number;
    endLine: number;
  } {
    const scrollTop = scrollDom.scrollTop;
    const scrollBottom = scrollTop + scrollDom.clientHeight;

    const lineHeight = parseFloat(getComputedStyle(scrollDom).lineHeight) || 24;
    const startLine = Math.floor(scrollTop / lineHeight) + 1;
    const endLine = Math.ceil(scrollBottom / lineHeight) + 1;

    return { startLine, endLine };
  }

  function getViewerLineElements(): Map<number, HTMLElement> {
    const lineMap = new Map<number, HTMLElement>();
    const elements = viewer.querySelectorAll("[data-line]");

    elements.forEach((el) => {
      const line = parseInt(el.getAttribute("data-line") || "0", 10);
      if (line > 0) {
        lineMap.set(line, el as HTMLElement);
      }
    });

    return lineMap;
  }

  function syncViewerToLine(startLine: number) {
    const lineElements = getViewerLineElements();
    const targetElement = lineElements.get(startLine);

    if (targetElement) {
      targetElement.scrollIntoView({ block: "start", behavior: "auto" });
    } else {
      const sortedLines = Array.from(lineElements.keys()).sort((a, b) => a - b);
      let closestLine = sortedLines[0];

      for (const line of sortedLines) {
        if (line <= startLine) {
          closestLine = line;
        } else {
          break;
        }
      }

      if (closestLine && lineElements.has(closestLine)) {
        lineElements
          .get(closestLine)!
          .scrollIntoView({ block: "start", behavior: "auto" });
      }
    }
  }

  function getViewerVisibleLine(): number {
    const scrollTop = viewer.scrollTop;
    const lineElements = getViewerLineElements();
    const sortedLines = Array.from(lineElements.keys()).sort((a, b) => a - b);

    let currentLine = sortedLines[0] || 1;

    for (const line of sortedLines) {
      const el = lineElements.get(line);
      if (el) {
        const rect = el.getBoundingClientRect();
        const viewerRect = viewer.getBoundingClientRect();
        const relativeTop = rect.top - viewerRect.top + scrollTop;

        if (relativeTop <= scrollTop) {
          currentLine = line;
        } else {
          break;
        }
      }
    }

    return currentLine;
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
      const scrollDom = editor.scrollDOM;
      const { startLine } = getVisibleLineRange(scrollDom);
      syncViewerToLine(startLine);

      setTimeout(() => {
        isSyncing = false;
      }, 100);
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
      const currentLine = getViewerVisibleLine();
      const editorLine = editor.state.doc.line(
        Math.min(currentLine, editor.state.doc.lines),
      );
      const pos = editorLine.from;

      editor.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: "start" }),
      });

      setTimeout(() => {
        isSyncing = false;
      }, 100);
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
