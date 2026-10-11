// @vitest-environment jsdom
/**
 * foreignObject label → standalone SVG conversion.
 *
 * The measurement seam is injected: jsdom has no layout, so the tests drive
 * the converter with synthetic rectangles (a procedural model keyed by
 * character offsets, which keeps working after `splitText` mutates nodes).
 * A separate integration describe renders REAL Mermaid diagrams and checks
 * the measurement-free fallback placement, which is what DOM-less consumers
 * get.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  convertForeignObjectLabels,
  type FoLabelMetrics,
  type LabelRect,
  type RunStyle,
} from "../fo-labels";

const BASE_STYLE: RunStyle = {
  fontFamily: "'trebuchet ms', verdana, arial, sans-serif",
  fontSizePx: 16,
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  color: "#333333",
};

interface FakeLayout {
  /** Viewport rect of the foreignObject itself. */
  foRect: LabelRect;
  /** Character offsets (into the label's text) where wrapped lines start. */
  breaks?: number[];
  charWidth?: number;
  lineHeight?: number;
  /** Client-px position of the label text's first character box. */
  origin?: { x: number; y: number };
  baselineRatio?: number;
  styleOf?: (el: Element) => RunStyle;
  elementRectOf?: (el: Element) => LabelRect | null;
  backgroundOf?: (el: Element) => string | null;
}

function fakeMetrics(layout: FakeLayout): FoLabelMetrics {
  const {
    foRect,
    breaks = [],
    charWidth = 10,
    lineHeight = 20,
    origin = { x: 0, y: 0 },
    baselineRatio = 0.8,
  } = layout;
  const lineStarts = [0, ...breaks];

  // Absolute character offset of (node, offset) within the label text —
  // anchored at the enclosing foreignObject so offsets stay stable after
  // `splitText` mutates nodes.
  const absolute = (node: Node, offset: number): number => {
    let root: Node | null = node;
    while (root && root.nodeName.toLowerCase() !== "foreignobject") {
      root = root.parentNode;
    }
    const probe = document.createRange();
    probe.setStart(root ?? node, 0);
    probe.setEnd(node, offset);
    return probe.toString().length;
  };

  return {
    elementRect: (el) =>
      el.tagName.toLowerCase() === "foreignobject"
        ? foRect
        : (layout.elementRectOf?.(el) ?? null),
    rangeRects: (range) => {
      const from = absolute(range.startContainer, range.startOffset);
      const to = absolute(range.endContainer, range.endOffset);
      const rects: LabelRect[] = [];
      for (let i = 0; i < lineStarts.length; i++) {
        const lineStart = lineStarts[i];
        const lineEnd = lineStarts[i + 1] ?? Number.MAX_SAFE_INTEGER;
        const a = Math.max(from, lineStart);
        const b = Math.min(to, lineEnd);
        if (b > a) {
          rects.push({
            x: origin.x + (a - lineStart) * charWidth,
            y: origin.y + i * lineHeight,
            width: (b - a) * charWidth,
            height: lineHeight,
          });
        }
      }
      return rects;
    },
    runStyle: (el) => layout.styleOf?.(el) ?? BASE_STYLE,
    baselineRatio: () => baselineRatio,
    backgroundOf: (el) => layout.backgroundOf?.(el) ?? null,
  };
}

const FO_SVG = (
  inner: string,
  attrs = 'x="10" y="20" width="200" height="40"',
) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="100%" style="max-width: 300px;">` +
  `<foreignObject ${attrs}>${inner}</foreignObject></svg>`;

const label = (html: string) =>
  `<div xmlns="http://www.w3.org/1999/xhtml" class="label nodeLabel">${html}</div>`;

describe("convertForeignObjectLabels", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is a no-op without foreignObject markup", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>';
    expect(await convertForeignObjectLabels(svg)).toBe(svg);
  });

  it("converts a label to centered text on the measured baseline", async () => {
    const out = await convertForeignObjectLabels(FO_SVG(label("Hello")), {
      metrics: fakeMetrics({
        foRect: { x: 500, y: 300, width: 200, height: 40 },
        origin: { x: 520, y: 310 },
      }),
    });

    expect(out).not.toContain("foreignObject");
    // Line box: x=520..570 (5 chars × 10), y=310..330 → center x 545,
    // baseline 310 + 20 × 0.8 = 326 — mapped into the foreignObject's user
    // box (x=10, y=20, 200×40 at a 1:1 scale): 10+(545-500)=55,
    // 20+(326-300)=46.
    expect(out).toMatch(/<text[^>]*x="55"/);
    expect(out).toMatch(/<text[^>]*y="46"/);
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain(">Hello<");
  });

  it("uses explicit baselines (no dominant-baseline) when measurable", async () => {
    const out = await convertForeignObjectLabels(FO_SVG(label("Hello")), {
      metrics: fakeMetrics({ foRect: { x: 0, y: 0, width: 200, height: 40 } }),
    });
    expect(out).not.toContain("dominant-baseline");
  });

  it("keeps bold/italic runs as styled tspans inside one centered line", async () => {
    const out = await convertForeignObjectLabels(
      FO_SVG(label("Hello <strong>world</strong>!")),
      {
        metrics: fakeMetrics({
          foRect: { x: 0, y: 0, width: 200, height: 40 },
          styleOf: (el) =>
            el.tagName.toLowerCase() === "strong"
              ? { ...BASE_STYLE, fontWeight: "bold" }
              : BASE_STYLE,
        }),
      },
    );

    const text = out.match(/<text[^>]*>[\s\S]*?<\/text>/)?.[0] ?? "";
    expect(text).toContain('text-anchor="middle"');
    expect(text).toMatch(/<tspan[^>]*font-weight="bold"[^>]*>world<\/tspan>/);
    expect(text).toMatch(/font-weight:bold/);
    expect(text).toContain(">Hello <");
    expect(text).toContain(">!</");
  });

  it("emits one text element per wrapped line", async () => {
    // "Hello world" (11 chars) wrapping after the space: "Hello " | "world".
    const out = await convertForeignObjectLabels(
      FO_SVG(label("Hello world"), 'x="0" y="0" width="200" height="40"'),
      {
        metrics: fakeMetrics({
          foRect: { x: 0, y: 0, width: 200, height: 40 },
          breaks: [6],
          origin: { x: 20, y: 10 },
          lineHeight: 20,
        }),
      },
    );

    const texts = out.match(/<text[^>]*>[\s\S]*?<\/text>/g) ?? [];
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain(">Hello <");
    expect(texts[1]).toContain(">world<");
    // Second line sits one line height lower.
    expect(texts[0]).toMatch(/y="26"/); // 10 + 20 × 0.8
    expect(texts[1]).toMatch(/y="46"/); // 30 + 20 × 0.8
  });

  it("clones inline icons with currentColor materialized", async () => {
    const svg = FO_SVG(
      label(
        '<span>Go</span><svg class="label-icon" viewBox="0 0 16 16"><path fill="currentColor" d="M0 0h16v16H0z"/></svg>',
      ),
    );
    const out = await convertForeignObjectLabels(svg, {
      metrics: fakeMetrics({
        foRect: { x: 0, y: 0, width: 200, height: 40 },
        styleOf: () => ({ ...BASE_STYLE, color: "#123456" }),
        elementRectOf: (el) =>
          el.tagName.toLowerCase() === "svg"
            ? { x: 40, y: 10, width: 20, height: 20 }
            : null,
      }),
    });

    expect(out).not.toContain("foreignObject");
    // Icon box (40,10) maps through the foreignObject box (10,20).
    expect(out).toMatch(
      /<svg[^>]*x="50"[^>]*y="30"[^>]*width="20"[^>]*height="20"/,
    );
    expect(out).toContain('fill="#123456"');
    expect(out).not.toContain("currentColor");
  });

  it("rasterizes KaTeX labels to an image at the measured box", async () => {
    const svg = FO_SVG(label('<span class="katex">x<sup>2</sup></span>'));
    const out = await convertForeignObjectLabels(svg, {
      metrics: fakeMetrics({
        foRect: { x: 0, y: 0, width: 200, height: 40 },
        elementRectOf: (el) =>
          el.classList?.contains("katex")
            ? { x: 10, y: 12, width: 60, height: 16 }
            : null,
      }),
      rasterizeHtml: async () => ({
        dataUri: "data:image/png;base64,QUJD",
        widthPx: 60,
        heightPx: 16,
      }),
    });

    expect(out).not.toContain("foreignObject");
    // KaTeX box (10,12) maps through the foreignObject box (10,20).
    expect(out).toMatch(
      /<image[^>]*x="20"[^>]*y="32"[^>]*width="60"[^>]*height="16"/,
    );
    expect(out).toContain("data:image/png;base64,QUJD");
    expect(out).not.toContain("katex");
  });

  it("degrades KaTeX to plain text when rasterization fails", async () => {
    const svg = FO_SVG(label('<span class="katex">x2</span>'));
    const out = await convertForeignObjectLabels(svg, {
      metrics: fakeMetrics({
        foRect: { x: 0, y: 0, width: 200, height: 40 },
        elementRectOf: (el) =>
          el.classList?.contains("katex")
            ? { x: 10, y: 12, width: 60, height: 16 }
            : null,
      }),
      rasterizeHtml: async () => null,
    });

    expect(out).not.toContain("<image");
    expect(out).toContain(">x2<");
    expect(out).toContain('text-anchor="middle"');
  });

  it("removes the switch wrapper together with its fallback text", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">' +
      '<switch><foreignObject x="10" y="20" width="200" height="40">' +
      label("Work") +
      '</foreignObject><text x="30" y="40">Work</text></switch></svg>';
    const out = await convertForeignObjectLabels(svg, {
      metrics: fakeMetrics({
        foRect: { x: 0, y: 0, width: 200, height: 40 },
      }),
    });

    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("switch");
    // Exactly one "Work" survives — the converted label, not the fallback.
    expect(out.match(/Work/g)).toHaveLength(1);
    expect(out).toContain('text-anchor="middle"');
  });

  it("emits a label background rect for labelBkg labels", async () => {
    const out = await convertForeignObjectLabels(
      FO_SVG(label('<span class="labelBkg">Hi</span>')),
      {
        metrics: fakeMetrics({
          foRect: { x: 0, y: 0, width: 200, height: 40 },
          elementRectOf: (el) =>
            el.tagName.toLowerCase() === "div"
              ? { x: 5, y: 5, width: 50, height: 30 }
              : null,
          backgroundOf: () => "rgba(232, 232, 232, 0.8)",
        }),
      },
    );

    expect(out).toMatch(/<rect[^>]*fill="rgba\(232, 232, 232, 0\.8\)"/);
  });

  it("drops empty labels", async () => {
    const out = await convertForeignObjectLabels(FO_SVG(label("   ")), {
      metrics: fakeMetrics({ foRect: { x: 0, y: 0, width: 200, height: 40 } }),
    });
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("<text");
  });

  describe("without measurement (DOM-less consumers)", () => {
    it("places the label at the foreignObject box center", async () => {
      const out = await convertForeignObjectLabels(FO_SVG(label("Work")), {
        metrics: null,
      });

      expect(out).not.toContain("foreignObject");
      // Box x=10 y=20 w=200 h=40 → center (110, 40).
      expect(out).toMatch(/<text[^>]*x="110"[^>]*y="40"/);
      expect(out).toContain('text-anchor="middle"');
      expect(out).toContain('dominant-baseline="central"');
      expect(out).toContain(">Work<");
    });

    it("falls back for unmeasurable boxes too", async () => {
      const out = await convertForeignObjectLabels(
        '<svg xmlns="http://www.w3.org/2000/svg"><switch>' +
          '<foreignObject width="0" height="0">' +
          label("Empty box") +
          "</foreignObject></switch></svg>",
        {
          metrics: fakeMetrics({
            foRect: { x: 0, y: 0, width: 0, height: 0 },
          }),
        },
      );
      expect(out).not.toContain("foreignObject");
      expect(out).toContain(">Empty box<");
    });
  });
});
