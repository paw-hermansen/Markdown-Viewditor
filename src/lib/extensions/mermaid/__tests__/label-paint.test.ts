// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { pinLabelMathPaint } from "../label-paint";

/** A Mermaid-like diagram whose label holds `inner` inside a `.nodeLabel`. */
function svgWithLabel(inner: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">' +
    "<style>#mmd-0 .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}</style>" +
    '<g><path class="edgePath" d="M0 0L10 10"/></g>' +
    '<foreignObject width="100" height="40">' +
    '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">' +
    inner +
    "</span></div></foreignObject></svg>"
  );
}

/** KaTeX's wrapper around its output. */
function katex(inner: string): string {
  return '<span class="katex">' + inner + "</span>";
}

const KATEX_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" ' +
  'viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice">' +
  '<path d="M95,702 c-2.7,0 -7.17,-2.2 -11.57,-5.5"/></svg>';

const LABEL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" class="label-icon" viewBox="0 0 16 16">' +
  '<path fill="currentColor" d="M0 0h16v16H0z"/></svg>';

/**
 * Every `<path>` under a `.katex` box inside a label. Scoped queries per
 * `<foreignObject>` on purpose: jsdom's selector engine drops cross-boundary
 * descendant matches for `querySelectorAll("foreignObject path")` (while
 * `querySelector` finds them) — mirror how math-labels.ts walks labels.
 */
function labelPaths(svg: string): Element[] {
  const host = document.createElement("div");
  host.innerHTML = svg;
  const paths: Element[] = [];
  for (const fo of Array.from(host.querySelectorAll("foreignObject"))) {
    for (const path of Array.from(fo.querySelectorAll("path"))) {
      if (path.closest(".katex")) paths.push(path);
    }
  }
  return paths;
}

describe("pinLabelMathPaint", () => {
  it("pins KaTeX glyph paths in labels to currentColor paint", () => {
    const out = pinLabelMathPaint(svgWithLabel(katex(KATEX_GLYPH)));
    const paths = labelPaths(out);
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute("style")).toBe(
      "fill: currentColor; stroke: none",
    );
  });

  it("reaches display math nested under .katex-display", () => {
    const out = pinLabelMathPaint(
      svgWithLabel(
        '<span class="katex-display">' + katex(KATEX_GLYPH) + "</span>",
      ),
    );
    expect(labelPaths(out)[0].getAttribute("style")).toBe(
      "fill: currentColor; stroke: none",
    );
  });

  it("merges into an existing style attribute and wins over earlier paint", () => {
    const out = pinLabelMathPaint(
      svgWithLabel(
        katex(KATEX_GLYPH.replace("<path ", '<path style="fill:#000" ')),
      ),
    );
    const style = labelPaths(out)[0].getAttribute("style");
    expect(style).toBe("fill:#000; fill: currentColor; stroke: none");
  });

  it("leaves Mermaid diagram paths outside foreignObject untouched", () => {
    const out = pinLabelMathPaint(svgWithLabel(katex(KATEX_GLYPH)));
    const host = document.createElement("div");
    host.innerHTML = out;
    const edge = host.querySelector("path.edgePath");
    expect(edge).not.toBeNull();
    expect(edge!.hasAttribute("style")).toBe(false);
  });

  it("leaves non-KaTeX label paths (icons) untouched", () => {
    const out = pinLabelMathPaint(svgWithLabel(LABEL_ICON));
    const host = document.createElement("div");
    host.innerHTML = out;
    const fo = host.querySelector("foreignObject")!;
    const icon = fo.querySelector("path")!;
    expect(icon.getAttribute("style")).toBeNull();
    expect(icon.getAttribute("fill")).toBe("currentColor");
  });

  it("passes label-math-free markup byte-identical", () => {
    const svg = svgWithLabel("<span>some label</span>");
    expect(pinLabelMathPaint(svg)).toBe(svg);
  });

  it("is idempotent", () => {
    const once = pinLabelMathPaint(svgWithLabel(katex(KATEX_GLYPH)));
    expect(pinLabelMathPaint(once)).toBe(once);
  });
});
