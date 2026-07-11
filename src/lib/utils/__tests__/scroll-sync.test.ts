import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockEditor {
  dom: { getBoundingClientRect: () => DOMRect };
  scrollDOM: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  state: {
    doc: {
      lines: number;
      line: (n: number) => { from: number; to: number };
    };
  };
  coordsAtPos: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
}

interface MockViewer {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  scrollTop: number;
  getBoundingClientRect: () => DOMRect;
  querySelectorAll: () => unknown[];
}

function createMockEditor(lines: number[]): MockEditor {
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
    scrollDOM: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    state: {
      doc: {
        lines: lines.length,
        line: (n: number) => ({
          from: lines[n - 1] ?? 0,
          to: (lines[n - 1] ?? 0) + 10,
        }),
      },
    },
    coordsAtPos: vi.fn((pos: number) => {
      const lineIndex = lines.indexOf(pos);
      if (lineIndex >= 0) {
        return { top: lineIndex * 20, bottom: lineIndex * 20 + 20 };
      }
      return null;
    }),
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

describe("createScrollSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
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
});
