import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface BlockInfo {
  from: number;
  to: number;
  top: number;
  height: number;
  bottom: number;
}

interface MockEditor {
  dom: { getBoundingClientRect: () => DOMRect };
  scrollDOM: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    scrollTop: number;
  };
  state: {
    doc: {
      lines: number;
      line: (n: number) => { from: number; to: number };
    };
  };
  documentPadding: { top: number; bottom: number };
  lineBlockAt: ReturnType<typeof vi.fn>;
  lineBlockAtHeight: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
}

interface MockViewer {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  scrollTop: number;
  getBoundingClientRect: () => DOMRect;
  querySelectorAll: () => unknown[];
}

const LINE_HEIGHT = 20;

function createMockEditor(lineFroms: number[]): MockEditor {
  const scrollDOM = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    scrollTop: 0,
  };

  const lineBlockAt = vi.fn((pos: number) => {
    const lineIndex = lineFroms.indexOf(pos);
    const lineNumber = lineIndex >= 0 ? lineIndex + 1 : 1;
    const top = (lineNumber - 1) * LINE_HEIGHT;
    return {
      from: pos,
      to: pos + 10,
      top,
      height: LINE_HEIGHT,
      bottom: top + LINE_HEIGHT,
    } as BlockInfo;
  });

  const lineBlockAtHeight = vi.fn((height: number) => {
    const lineNumber = Math.max(
      1,
      Math.min(lineFroms.length, Math.floor(height / LINE_HEIGHT) + 1),
    );
    const from = lineFroms[lineNumber - 1] ?? 0;
    const top = (lineNumber - 1) * LINE_HEIGHT;
    return {
      from,
      to: from + 10,
      top,
      height: LINE_HEIGHT,
      bottom: top + LINE_HEIGHT,
    } as BlockInfo;
  });

  return {
    dom: {
      getBoundingClientRect: () => ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    },
    scrollDOM,
    state: {
      doc: {
        lines: lineFroms.length,
        line: (n: number) => ({
          from: lineFroms[n - 1] ?? 0,
          to: (lineFroms[n - 1] ?? 0) + 10,
        }),
      },
    },
    documentPadding: { top: 0, bottom: 0 },
    lineBlockAt,
    lineBlockAtHeight,
    dispatch: vi.fn(),
  };
}

function createMockViewer(elements: unknown[]): MockViewer {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();

  return {
    addEventListener,
    removeEventListener,
    scrollTop: 0,
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    querySelectorAll: () => elements,
  };
}

function getScrollListener(
  target: { addEventListener: ReturnType<typeof vi.fn> },
  event: string,
): () => void {
  const call = target.addEventListener.mock.calls.find(([e]) => e === event);
  if (!call) throw new Error(`${event} listener not registered`);
  return call[1] as () => void;
}

function setupElementRects(
  elements: { getAttribute: (n: string) => string | null }[],
  documentTops: Record<string, number>,
  viewer: MockViewer,
) {
  elements.forEach((el) => {
    const line = el.getAttribute("data-line") as string;
    (
      el as unknown as { getBoundingClientRect: () => DOMRect }
    ).getBoundingClientRect = () => ({
      top: documentTops[line] - viewer.scrollTop,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
}

describe("createScrollSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("getComputedStyle", () => ({ paddingTop: "0px" }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should add scroll listeners to editor and viewer", async () => {
    const { createScrollSync } = await import("../scroll-sync");
    const editor = createMockEditor([0, 100, 200]);
    const viewer = createMockViewer([]);

    createScrollSync(editor as never, viewer as unknown as HTMLElement);

    expect(editor.scrollDOM.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      { passive: true },
    );
    expect(viewer.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      { passive: true },
    );
  });

  it("should remove listeners on destroy", async () => {
    const { createScrollSync } = await import("../scroll-sync");
    const editor = createMockEditor([0, 100, 200]);
    const viewer = createMockViewer([]);

    const sync = createScrollSync(
      editor as never,
      viewer as unknown as HTMLElement,
    );
    sync.destroy();

    expect(editor.scrollDOM.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(viewer.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
  });

  it("should accept custom throttle option", async () => {
    const { createScrollSync } = await import("../scroll-sync");
    const editor = createMockEditor([0]);
    const viewer = createMockViewer([]);

    createScrollSync(editor as never, viewer as unknown as HTMLElement, {
      throttleMs: 32,
    });

    expect(editor.scrollDOM.addEventListener).toHaveBeenCalled();
  });

  it("should scroll the editor to the bottom when the viewer scrolls to a bottom-anchored footnote", async () => {
    const lineCount = 350;
    const lineFroms = Array.from({ length: lineCount }, (_, i) => i * 10);
    const editor = createMockEditor(lineFroms);

    const elements = [
      { getAttribute: (n: string) => (n === "data-line" ? "1" : null) },
      { getAttribute: (n: string) => (n === "data-line" ? "60" : null) },
      { getAttribute: (n: string) => (n === "data-line" ? "350" : null) },
    ];
    const viewer = createMockViewer(elements);

    const documentTops: Record<string, number> = {
      "1": 0,
      "60": 59 * LINE_HEIGHT,
      "350": 349 * LINE_HEIGHT,
    };
    setupElementRects(elements, documentTops, viewer);

    const { createScrollSync } = await import("../scroll-sync");
    createScrollSync(editor as never, viewer as unknown as HTMLElement);

    viewer.scrollTop = documentTops["350"];
    await vi.advanceTimersByTimeAsync(16);
    getScrollListener(viewer, "scroll")();

    expect(editor.scrollDOM.scrollTop).toBeGreaterThan(59 * LINE_HEIGHT);
    expect(editor.scrollDOM.scrollTop).toBeCloseTo(documentTops["350"], -2);
    expect(editor.lineBlockAt).toHaveBeenCalled();
  });

  it("should not oscillate: sync-induced editor scroll must not sync back to viewer", async () => {
    // The core anti-oscillation test: when the viewer scrolls and the
    // editor is synced, the editor's sync-induced scroll must NOT trigger
    // a sync back to the viewer. Without the directional guard, each sync
    // triggers a counter-sync, creating a feedback loop where both panes
    // drift upward indefinitely.
    const lineCount = 100;
    const lineFroms = Array.from({ length: lineCount }, (_, i) => i * 10);
    const editor = createMockEditor(lineFroms);

    const elements = [
      { getAttribute: (n: string) => (n === "data-line" ? "1" : null) },
      { getAttribute: (n: string) => (n === "data-line" ? "50" : null) },
    ];
    const viewer = createMockViewer(elements);
    const documentTops: Record<string, number> = {
      "1": 0,
      "50": 49 * LINE_HEIGHT,
    };
    setupElementRects(elements, documentTops, viewer);

    const { createScrollSync } = await import("../scroll-sync");
    createScrollSync(editor as never, viewer as unknown as HTMLElement);

    // Step 1: user scrolls viewer to line 50.
    viewer.scrollTop = documentTops["50"];
    await vi.advanceTimersByTimeAsync(16);
    getScrollListener(viewer, "scroll")();

    const editorScrollTopAfterSync = editor.scrollDOM.scrollTop;
    expect(editorScrollTopAfterSync).toBeCloseTo(documentTops["50"], -2);

    // Step 2: simulate the editor's sync-induced scroll event firing.
    // The directional guard should block it from syncing back to the viewer.
    const viewerScrollBefore = viewer.scrollTop;
    getScrollListener(editor.scrollDOM, "scroll")();

    // Viewer must NOT have moved — no feedback.
    expect(viewer.scrollTop).toBe(viewerScrollBefore);

    // Step 3: advance past the cooldown (100ms). The editor's scroll is
    // now unblocked, but since no new scroll event fires, nothing happens.
    await vi.advanceTimersByTimeAsync(100);
    expect(viewer.scrollTop).toBe(viewerScrollBefore);
  });

  it("should correct for padding when syncing viewer to editor", async () => {
    const lineCount = 100;
    const lineFroms = Array.from({ length: lineCount }, (_, i) => i * 10);
    const editor = createMockEditor(lineFroms);
    editor.documentPadding = { top: 16, bottom: 0 };

    const elements = [
      { getAttribute: (n: string) => (n === "data-line" ? "1" : null) },
      { getAttribute: (n: string) => (n === "data-line" ? "50" : null) },
    ];
    const viewer = createMockViewer(elements);

    vi.stubGlobal("getComputedStyle", () => ({ paddingTop: "16px" }));

    const documentTops: Record<string, number> = {
      "1": 0,
      "50": 49 * LINE_HEIGHT,
    };
    setupElementRects(elements, documentTops, viewer);

    const { createScrollSync } = await import("../scroll-sync");
    createScrollSync(editor as never, viewer as unknown as HTMLElement);

    // Scroll viewer so line 50 is at the top: raw scrollTop = docTop + padding.
    viewer.scrollTop = documentTops["50"] + 16;
    await vi.advanceTimersByTimeAsync(16);
    getScrollListener(viewer, "scroll")();

    // Editor should be at docTop + editorPadding = 980 + 16 = 996.
    // Without padding correction it would be 980 (off by ~1 line).
    expect(editor.scrollDOM.scrollTop).toBeCloseTo(996, 0);
  });

  it("should catch the final position via trailing throttle after a burst of scroll events", async () => {
    // Simulates a smooth scroll: many scroll events fire at intermediate
    // positions, with the last one throttled. The trailing throttle must
    // fire and sync to the final position.
    const lineCount = 350;
    const lineFroms = Array.from({ length: lineCount }, (_, i) => i * 10);
    const editor = createMockEditor(lineFroms);

    const elements = [
      { getAttribute: (n: string) => (n === "data-line" ? "1" : null) },
      { getAttribute: (n: string) => (n === "data-line" ? "350" : null) },
    ];
    const viewer = createMockViewer(elements);
    const documentTops: Record<string, number> = {
      "1": 0,
      "350": 349 * LINE_HEIGHT,
    };
    setupElementRects(elements, documentTops, viewer);

    const { createScrollSync } = await import("../scroll-sync");
    createScrollSync(editor as never, viewer as unknown as HTMLElement);

    const viewerScrollHandler = getScrollListener(viewer, "scroll");

    // Fire an event at an intermediate position.
    viewer.scrollTop = 100;
    await vi.advanceTimersByTimeAsync(16);
    viewerScrollHandler();

    const intermediate = editor.scrollDOM.scrollTop;
    expect(intermediate).toBeGreaterThan(0);
    expect(intermediate).toBeLessThan(documentTops["350"]);

    // Fire another event at the final position, but throttled.
    viewer.scrollTop = documentTops["350"];
    viewerScrollHandler(); // throttled — schedules trailing timer

    // Advance past the throttle window so the trailing timer fires.
    await vi.advanceTimersByTimeAsync(16);

    expect(editor.scrollDOM.scrollTop).toBeCloseTo(documentTops["350"], -2);
  });
});
