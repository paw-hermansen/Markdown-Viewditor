// @vitest-environment jsdom
/**
 * Zoom-normalized foreignObject label measurement (fo-measure.ts).
 *
 * jsdom has no layout and no page zoom, so the "buggy old WebKit" engine is
 * simulated with a `getBoundingClientRect` stub that scales rects of
 * foreignObject content by a fixed factor — exactly what WKWebView on older
 * macOS does under page zoom (webkit.org/show_bug.cgi?id=261109). The tests
 * pin that the wrapper divides those rects back out (and only those), and
 * that it never leaks the patched API past the render window.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  measureForeignObjectScale,
  withMeasurementScale,
  withZoomNormalizedLabelMeasurement,
} from "../fo-measure";

type RectFn = (this: Element) => DOMRect;

const restores: Array<() => void> = [];

afterEach(() => {
  while (restores.length > 0) restores.pop()!();
  document.body.innerHTML = "";
});

function proto(): { getBoundingClientRect: RectFn } {
  return Element.prototype as unknown as { getBoundingClientRect: RectFn };
}

function hasForeignObjectAncestor(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.localName?.toLowerCase() === "foreignobject") return true;
  }
  return false;
}

/**
 * Simulate an engine whose `getBoundingClientRect` returns page-zoom-scaled
 * rects (`scale` = zoom factor) for foreignObject content and local rects
 * for everything else. Honors an element's inline `width: Npx` so the probe
 * div (120px) measures like the real thing.
 */
function installScaledEngine(scale: number): RectFn {
  const original = proto().getBoundingClientRect;
  const stub: RectFn = function (this: Element): DOMRect {
    const s = hasForeignObjectAncestor(this) ? scale : 1;
    const styleWidth = (this as HTMLElement).style?.width ?? "";
    const baseWidth = /px$/.test(styleWidth) ? parseFloat(styleWidth) : 100;
    return new DOMRect(10 * s, 20 * s, baseWidth * s, 30 * s);
  };
  proto().getBoundingClientRect = stub;
  restores.push(() => {
    proto().getBoundingClientRect = original;
  });
  return stub;
}

interface TestTree {
  container: HTMLElement;
  label: Element;
  plain: Element;
}

/**
 * A Mermaid temp render container (`div#dmmd-*`) with foreignObject label
 * content and a non-label sibling, plus an outside foreignObject standing in
 * for a placed diagram in the viewer.
 */
function buildTree(): TestTree {
  const container = document.createElement("div");
  container.id = "dmmd-1";
  container.innerHTML =
    '<svg><g><foreignObject width="500" height="100">' +
    '<div id="label"></div></foreignObject></g></svg><div id="plain"></div>';
  document.body.appendChild(container);

  const placed = document.createElement("div");
  placed.className = "mermaid-block";
  placed.innerHTML =
    '<svg><foreignObject><div id="placed"></div></foreignObject></svg>';
  document.body.appendChild(placed);

  return {
    container,
    label: container.querySelector("#label")!,
    plain: container.querySelector("#plain")!,
  };
}

describe("measureForeignObjectScale", () => {
  it("is 1 without layout (no correction needed)", () => {
    expect(measureForeignObjectScale()).toBe(1);
  });

  it("is 1 on a spec-conformant engine", () => {
    installScaledEngine(1);
    expect(measureForeignObjectScale()).toBe(1);
  });

  it("detects the scaled-rect engine's zoom factor", () => {
    installScaledEngine(2);
    expect(measureForeignObjectScale()).toBeCloseTo(2, 10);
  });

  it("leaves the DOM clean", () => {
    installScaledEngine(2);
    measureForeignObjectScale();
    expect(document.body.children).toHaveLength(0);
  });
});

describe("withMeasurementScale", () => {
  it("divides foreignObject label rects in Mermaid temp containers", async () => {
    installScaledEngine(2);
    const { label } = buildTree();
    await withMeasurementScale(2, async () => {
      // The scaled engine reports (20, 40, 200, 60); the local rect is back.
      const rect = label.getBoundingClientRect();
      expect(rect.x).toBeCloseTo(10, 10);
      expect(rect.y).toBeCloseTo(20, 10);
      expect(rect.width).toBeCloseTo(100, 10);
      expect(rect.height).toBeCloseTo(30, 10);
    });
  });

  it("passes non-label elements through unchanged", async () => {
    installScaledEngine(2);
    const { plain } = buildTree();
    await withMeasurementScale(2, async () => {
      const rect = plain.getBoundingClientRect();
      expect(rect.width).toBe(100);
      expect(rect.height).toBe(30);
    });
  });

  it("never normalizes foreignObject content outside the temp containers", async () => {
    installScaledEngine(2);
    buildTree();
    const placed = document.querySelector("#placed")!;
    await withMeasurementScale(2, async () => {
      expect(placed.getBoundingClientRect().width).toBe(200);
    });
  });

  it("is a no-op at factor 1 (the API is not touched)", async () => {
    const stub = installScaledEngine(2);
    buildTree();
    await withMeasurementScale(1, async () => {
      expect(proto().getBoundingClientRect).toBe(stub);
    });
  });

  it("restores the API after the window and after a throw", async () => {
    const stub = installScaledEngine(2);
    buildTree();
    await withMeasurementScale(2, async () => {
      expect(proto().getBoundingClientRect).not.toBe(stub);
    });
    expect(proto().getBoundingClientRect).toBe(stub);

    await expect(
      withMeasurementScale(2, async () => {
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");
    expect(proto().getBoundingClientRect).toBe(stub);
  });
});

describe("withZoomNormalizedLabelMeasurement", () => {
  it("probes the engine and corrects automatically", async () => {
    installScaledEngine(2);
    const { label, plain } = buildTree();
    await withZoomNormalizedLabelMeasurement(async () => {
      expect(label.getBoundingClientRect().width).toBeCloseTo(100, 10);
      expect(plain.getBoundingClientRect().width).toBe(100);
    }, 2);
  });

  it("does not patch anything on a healthy engine", async () => {
    const stub = installScaledEngine(1);
    buildTree();
    await withZoomNormalizedLabelMeasurement(async () => {
      expect(proto().getBoundingClientRect).toBe(stub);
    }, 2);
  });

  it("never touches the API at 100% zoom — probe noise must not perturb widths", async () => {
    // Regression: a probe factor a hair off 1 (sub-pixel noise) used to
    // install the wrapper and divide label widths by ~1.000x, which broke
    // Mermaid's exact `bbox.width === width` wrap heuristic — long labels
    // stopped wrapping and got clipped instead.
    for (const noisy of [2, 1.00005, 0.99997]) {
      document.body.innerHTML = "";
      const stub = installScaledEngine(noisy);
      const { label } = buildTree();
      await withZoomNormalizedLabelMeasurement(async () => {
        expect(proto().getBoundingClientRect).toBe(stub);
        expect(label.getBoundingClientRect().width).toBe(100 * noisy);
      }, 1);
      restores.pop()!();
    }
  });

  it("lands exact widths after correction (Mermaid's wrap equality)", async () => {
    // fl(200 * 1.1) = 220.00000000000003; dividing back must snap to exactly
    // 200 so `bbox.width === width` still triggers Mermaid's wrap branch.
    installScaledEngine(1.1);
    const { label } = buildTree();
    label.setAttribute("style", "width:200px");
    await withZoomNormalizedLabelMeasurement(async () => {
      expect(label.getBoundingClientRect().width).toBe(200);
    }, 1.1);
  });

  it("keeps genuine fractional widths fractional after correction", async () => {
    installScaledEngine(1.1);
    const { label } = buildTree();
    label.setAttribute("style", "width:150.5px");
    await withZoomNormalizedLabelMeasurement(async () => {
      expect(label.getBoundingClientRect().width).toBe(150.5);
    }, 1.1);
  });
});
