// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import {
  createEditorScrollAnchor,
  createViewerScrollAnchor,
  fractionWithinBlock,
  scrollTopForAnchor,
} from "../zoom-scroll-anchor";

function rect(top: number, height: number): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
  } as DOMRect;
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("scrollTopForAnchor", () => {
  it("puts the anchor fraction at the viewport middle", () => {
    expect(
      scrollTopForAnchor({
        anchorTop: 200,
        anchorHeight: 40,
        fraction: 0.5,
        viewportHeight: 100,
        maxScrollTop: 1000,
      }),
    ).toBe(200 + 20 - 50);
  });

  it("clamps at the top", () => {
    expect(
      scrollTopForAnchor({
        anchorTop: 0,
        anchorHeight: 40,
        fraction: 0,
        viewportHeight: 100,
        maxScrollTop: 1000,
      }),
    ).toBe(0);
  });

  it("clamps at the bottom", () => {
    expect(
      scrollTopForAnchor({
        anchorTop: 900,
        anchorHeight: 40,
        fraction: 1,
        viewportHeight: 100,
        maxScrollTop: 800,
      }),
    ).toBe(800);
  });
});

describe("fractionWithinBlock", () => {
  it("computes the fraction within the block", () => {
    expect(fractionWithinBlock(170, 100, 100)).toBeCloseTo(0.7);
  });

  it("clamps to 0..1 and survives zero height", () => {
    expect(fractionWithinBlock(0, 100, 100)).toBe(0);
    expect(fractionWithinBlock(200, 100, 100)).toBe(1);
    expect(fractionWithinBlock(150, 100, 0)).toBe(0);
  });
});

describe("createViewerScrollAnchor", () => {
  /** Three rendered blocks whose geometry can change (as zoom reflows do). */
  function makeViewer() {
    const layout = {
      blocks: [
        { line: 0, top: 0, height: 100 },
        { line: 10, top: 100, height: 100 },
        { line: 20, top: 200, height: 100 },
      ],
      clientHeight: 100,
      scrollHeight: 300,
    };
    const viewer = document.createElement("div");
    let scrollTop = 0;
    Object.defineProperty(viewer, "scrollTop", {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    Object.defineProperty(viewer, "clientHeight", {
      get: () => layout.clientHeight,
    });
    Object.defineProperty(viewer, "scrollHeight", {
      get: () => layout.scrollHeight,
    });
    viewer.getBoundingClientRect = () => rect(0, layout.clientHeight);

    const els = layout.blocks.map((b) => {
      const el = document.createElement("div");
      el.dataset.line = String(b.line);
      // Real DOM rects are viewport coordinates: content top - scrollTop.
      el.getBoundingClientRect = () => rect(b.top - scrollTop, b.height);
      viewer.appendChild(el);
      return el;
    });
    return { viewer, layout, els, getScroll: () => scrollTop };
  }

  it("keeps the block at the viewport middle anchored across a reflow", async () => {
    const { viewer, layout, getScroll } = makeViewer();
    const anchor = createViewerScrollAnchor(() => viewer);

    viewer.scrollTop = 120; // center 170 -> block data-line 10 at fraction 0.7
    anchor.capture();

    // Zoom reflow: every block doubles in height, the viewport halves.
    layout.blocks.forEach((b) => {
      b.top *= 2;
      b.height *= 2;
    });
    layout.clientHeight = 50;
    layout.scrollHeight = 600;

    anchor.restore();
    await frame();
    // block top 200 + 0.7 * 200 - 50/2 = 315
    expect(getScroll()).toBe(315);
  });

  it("clamps the restore at the scroll bounds", async () => {
    const { viewer, layout, getScroll } = makeViewer();
    const anchor = createViewerScrollAnchor(() => viewer);

    viewer.scrollTop = 250; // center 300 -> last block (data-line 20), fraction 1
    anchor.capture();

    layout.clientHeight = 50;
    layout.scrollHeight = 280; // max scroll 230

    anchor.restore();
    await frame();
    // target: 200 + 1 * 100 - 25 = 275 -> clamped to 280 - 50 = 230
    expect(getScroll()).toBe(230);
  });

  it("is a no-op without a viewer or capture", async () => {
    const anchor = createViewerScrollAnchor(() => undefined);
    anchor.capture();
    anchor.restore(); // must not throw
    const { viewer, getScroll } = makeViewer();
    const anchor2 = createViewerScrollAnchor(() => viewer);
    anchor2.restore(); // restore without capture: no-op
    expect(getScroll()).toBe(0);
  });
});

describe("createEditorScrollAnchor", () => {
  /** Stub EditorView with block geometry that can change (rewrap on zoom). */
  function makeView() {
    const layout = {
      blocks: [
        { from: 0, line: 1, top: 0, height: 20 },
        { from: 10, line: 2, top: 20, height: 20 },
        { from: 20, line: 3, top: 40, height: 20 },
      ],
      clientHeight: 100,
      scrollHeight: 1000,
    };
    let scrollTop = 0;
    const scrollDOM = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(v: number) {
        scrollTop = v;
      },
      clientHeight: layout.clientHeight,
      scrollHeight: layout.scrollHeight,
    } as unknown as HTMLElement;
    Object.defineProperty(scrollDOM, "clientHeight", {
      get: () => layout.clientHeight,
    });
    Object.defineProperty(scrollDOM, "scrollHeight", {
      get: () => layout.scrollHeight,
    });

    const doc = {
      lines: 3,
      lineAt: (pos: number) => ({
        number: layout.blocks.findLast((b) => b.from <= pos)?.line ?? 1,
      }),
      line: (n: number) => ({ from: layout.blocks[n - 1]?.from ?? 0 }),
    };
    const view = {
      scrollDOM,
      requestMeasure: vi.fn(),
      state: { doc },
      lineBlockAtHeight: (y: number) =>
        layout.blocks.findLast((b) => b.top <= y) ?? layout.blocks[0],
      lineBlockAt: (pos: number) =>
        layout.blocks.findLast((b) => b.from <= pos) ?? layout.blocks[0],
    } as unknown as EditorView;
    return { view, layout, getScroll: () => scrollTop };
  }

  it("keeps the line at the viewport middle anchored across a rewrap", async () => {
    const { view, layout, getScroll } = makeView();
    const anchor = createEditorScrollAnchor(() => view);

    // center 50 -> line 3 (top 40, height 20), fraction 0.5
    anchor.capture();

    // Rewrap: each line becomes twice as tall, the viewport halves.
    layout.blocks.forEach((b) => {
      b.top *= 2;
      b.height *= 2;
    });
    layout.clientHeight = 50;
    layout.scrollHeight = 2000;

    anchor.restore();
    await frame();
    expect(view.requestMeasure).toHaveBeenCalled();
    // line 3: top 80 + 0.5 * 40 - 25 = 75
    expect(getScroll()).toBe(75);
  });
});
