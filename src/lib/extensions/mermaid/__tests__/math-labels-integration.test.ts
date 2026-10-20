// @vitest-environment jsdom
/**
 * Label-math rasterization against REAL Mermaid output — the exact SVG the
 * viewer caches for `A["$$x^2$$"]`.
 *
 * jsdom has no layout and no canvas, so the measurement and rasterizer
 * seams are injected; what this suite pins is that Mermaid's KaTeX label
 * markup is *found* and fully replaced (and that math-free diagrams are
 * passed through byte-identical). The measurable path is covered with
 * synthetic boxes in math-labels.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasStub, installSvgLayoutShim } from "./svg-layout-shim";
import { rasterizeMermaidLabelMath } from "../math-labels";
import { pinLabelMathPaint } from "../label-paint";

const DIAGRAMS = {
  math: `graph LR
    A["$$x^2$$"] --> B`,
  // SVG-drawn glyph (the sqrt radical): the case label-paint.ts pins.
  mathGlyph: `graph LR
    A["$$\\sqrt{2}$$"] --> B`,
  plain: `graph LR
    A["some label"] --> B`,
};

const rendered: Record<string, string> = {};
const DATA_URI = "data:image/png;base64,TEST";

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  installSvgLayoutShim();
  installCanvasStub();
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
    fontFamily: "inherit",
    htmlLabels: true,
    forceLegacyMathML: true,
    suppressErrorRendering: true,
    themeVariables: { fontSize: "16px" },
  });
  for (const [name, code] of Object.entries(DIAGRAMS)) {
    const { svg } = await mermaid.render(`mathlbl_${name}`, code);
    rendered[name] = svg;
  }
}, 60000);

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("label math rasterization (real Mermaid output)", () => {
  it("Mermaid emits live KaTeX markup for $$…$$ labels", () => {
    expect(rendered.math).toContain('class="katex');
    expect(rendered.math).toContain("foreignObject");
    expect(rendered.plain).not.toContain('class="katex');
  });

  it("replaces every formula box with an image and leaves no live KaTeX", async () => {
    const out = await rasterizeMermaidLabelMath(rendered.math, {
      measure: () => ({ widthPx: 19, heightPx: 24 }),
      rasterize: async () => ({ dataUri: DATA_URI, widthPx: 19, heightPx: 24 }),
    });

    expect(out).toContain(`<img`);
    expect(out).toContain(`src="${DATA_URI}"`);
    expect(out).not.toContain('class="katex');
    expect(out).not.toContain("<math");
  });

  it("preserves the foreignObject label box Mermaid baked", async () => {
    const before = rendered.math.match(/<foreignObject[^>]*>/)?.[0];
    const out = await rasterizeMermaidLabelMath(rendered.math, {
      measure: () => ({ widthPx: 19, heightPx: 24 }),
      rasterize: async () => ({ dataUri: DATA_URI, widthPx: 19, heightPx: 24 }),
    });
    const after = out.match(/<foreignObject[^>]*>/)?.[0];

    expect(before).toBeDefined();
    expect(after).toBe(before);
  });

  it("keeps the live formula when capture is unavailable", async () => {
    const out = await rasterizeMermaidLabelMath(rendered.math, {
      measure: () => ({ widthPx: 19, heightPx: 24 }),
      rasterize: async () => null,
    });
    expect(out).toBe(rendered.math);
  });

  it("passes math-free diagrams through byte-identical", async () => {
    const out = await rasterizeMermaidLabelMath(rendered.plain, {
      measure: () => ({ widthPx: 19, heightPx: 24 }),
      rasterize: async () => ({ dataUri: DATA_URI, widthPx: 19, heightPx: 24 }),
    });
    expect(out).toBe(rendered.plain);
  });

  it("pinned label math still rasterizes (the viewer pipeline order)", async () => {
    // pinLabelMathPaint runs before rasterizeMermaidLabelMath at cache-fill
    // time (renderer.ts) — the pin must not break formula discovery.
    const pinned = pinLabelMathPaint(rendered.mathGlyph);
    expect(pinned).toContain("fill: currentColor; stroke: none");
    const out = await rasterizeMermaidLabelMath(pinned, {
      measure: () => ({ widthPx: 19, heightPx: 24 }),
      rasterize: async () => ({ dataUri: DATA_URI, widthPx: 19, heightPx: 24 }),
    });
    expect(out).toContain(`<img`);
    expect(out).toContain(`src="${DATA_URI}"`);
    expect(out).not.toContain('class="katex');
  });
});
