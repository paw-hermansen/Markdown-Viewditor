/**
 * Scroll anchoring across zoom changes.
 *
 * WebKit's page zoom preserves `scrollTop` in CSS px exactly, but the content
 * above the anchor changes height when the zoom changes: long lines re-wrap
 * into more rows in the narrower (or wider) zoomed viewport, fit-to-width
 * diagrams shrink, and per-element heights quantize slightly. The preserved
 * offset then lands on a different document position and the view visibly
 * jumps. Capturing the line (or rendered block) at the vertical middle before
 * the zoom and restoring it afterwards keeps the same rendered line at the
 * middle at the new zoom level.
 */

import type { EditorView } from "@codemirror/view";

/** A line/block position at a fraction of the viewport's vertical middle. */
export interface ViewportAnchor {
  /** Source line number (editor) or `data-line` value (viewer). */
  line: number;
  /** Position of the anchor point within its line/block, 0..1. */
  fraction: number;
}

/** Capture/restore pair invoked around a zoom change (see zoom.svelte.ts). */
export interface ZoomScrollAnchor {
  capture(): void;
  restore(): void;
}

/**
 * Pure scroll math: put `fraction` of the anchor block at the viewport's
 * vertical middle, clamped to the scroll range.
 */
export function scrollTopForAnchor(input: {
  anchorTop: number;
  anchorHeight: number;
  fraction: number;
  viewportHeight: number;
  maxScrollTop: number;
}): number {
  const target =
    input.anchorTop +
    input.fraction * input.anchorHeight -
    input.viewportHeight / 2;
  return Math.min(Math.max(target, 0), Math.max(0, input.maxScrollTop));
}

/** Fraction (0..1) of `viewportCenter` within a block, clamped. */
export function fractionWithinBlock(
  viewportCenter: number,
  blockTop: number,
  blockHeight: number,
): number {
  if (blockHeight <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportCenter - blockTop) / blockHeight));
}

/**
 * Editor anchor: the CodeMirror line at the scroller's vertical middle.
 * The line's height changes when lines re-wrap, so the fraction within the
 * line (not a pixel offset) is what makes the anchor zoom-stable.
 */
export function createEditorScrollAnchor(
  getView: () => EditorView | undefined,
): ZoomScrollAnchor {
  let saved: ViewportAnchor | undefined;

  return {
    capture() {
      saved = undefined;
      const view = getView();
      if (!view) return;
      const sc = view.scrollDOM;
      const centerY = sc.scrollTop + sc.clientHeight / 2;
      const block = view.lineBlockAtHeight(centerY);
      saved = {
        line: view.state.doc.lineAt(block.from).number,
        fraction: fractionWithinBlock(centerY, block.top, block.height),
      };
    },
    restore() {
      const anchor = saved;
      saved = undefined;
      const view = getView();
      if (!anchor || !view) return;
      // Line heights change when lines re-wrap; let CodeMirror re-measure
      // before reading the new block geometry (one settle frame).
      view.requestMeasure();
      requestAnimationFrame(() => {
        const sc = view.scrollDOM;
        const doc = view.state.doc;
        const line = Math.min(Math.max(anchor.line, 1), doc.lines);
        const block = view.lineBlockAt(doc.line(line).from);
        sc.scrollTop = scrollTopForAnchor({
          anchorTop: block.top,
          anchorHeight: block.height,
          fraction: anchor.fraction,
          viewportHeight: sc.clientHeight,
          maxScrollTop: sc.scrollHeight - sc.clientHeight,
        });
      });
    },
  };
}

/**
 * Viewer anchor: the rendered `[data-line]` block at the scroller's vertical
 * middle (the same coordinate convention as scroll-sync.ts).
 */
export function createViewerScrollAnchor(
  getViewer: () => HTMLElement | undefined,
): ZoomScrollAnchor {
  let saved: ViewportAnchor | undefined;

  function blocks(viewer: HTMLElement): HTMLElement[] {
    return Array.from(viewer.querySelectorAll<HTMLElement>("[data-line]"));
  }

  /** Content offset of an element in the viewer's scrollTop coordinates. */
  function contentTop(viewer: HTMLElement, el: HTMLElement): number {
    return (
      el.getBoundingClientRect().top -
      viewer.getBoundingClientRect().top +
      viewer.scrollTop
    );
  }

  /** The last block starting at or above `position`, else the first. */
  function blockAt(
    viewer: HTMLElement,
    position: number,
  ): HTMLElement | undefined {
    const els = blocks(viewer);
    let best: HTMLElement | undefined;
    for (const el of els) {
      if (contentTop(viewer, el) <= position) best = el;
      else break;
    }
    return best ?? els[0];
  }

  /** The block whose `data-line` is closest to (but not after) `line`. */
  function findBlock(
    viewer: HTMLElement,
    line: number,
  ): HTMLElement | undefined {
    const els = blocks(viewer);
    let best: HTMLElement | undefined;
    for (const el of els) {
      if (Number(el.dataset.line ?? 0) <= line) best = el;
      else break;
    }
    return best ?? els[0];
  }

  return {
    capture() {
      saved = undefined;
      const viewer = getViewer();
      if (!viewer) return;
      const el = blockAt(viewer, viewer.scrollTop + viewer.clientHeight / 2);
      if (!el) return;
      const top = contentTop(viewer, el);
      saved = {
        line: Number(el.dataset.line ?? 0),
        fraction: fractionWithinBlock(
          viewer.scrollTop + viewer.clientHeight / 2,
          top,
          el.getBoundingClientRect().height,
        ),
      };
    },
    restore() {
      const anchor = saved;
      saved = undefined;
      const viewer = getViewer();
      if (!anchor || !viewer) return;
      const el = findBlock(viewer, anchor.line);
      if (!el) return;
      viewer.scrollTop = scrollTopForAnchor({
        anchorTop: contentTop(viewer, el),
        anchorHeight: el.getBoundingClientRect().height,
        fraction: anchor.fraction,
        viewportHeight: viewer.clientHeight,
        maxScrollTop: viewer.scrollHeight - viewer.clientHeight,
      });
    },
  };
}
