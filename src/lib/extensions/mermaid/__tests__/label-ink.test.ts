// @vitest-environment jsdom
/**
 * Label math ink for converted (export/print) diagrams:
 * `themeTextColorFromSvg` (the theme `textColor` out of Mermaid's generated
 * root rule) and the wiring that hands it to the label conversion — the
 * export variant must bake captured formula bitmaps in the *theme's* ink,
 * never the app theme's viewer colour (a dark theme's light gray ink
 * washed out inside the light-themed export). See .agents/guides/
 * math-mermaid.md, "Mermaid Label Math Ink".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMermaidCache,
  renderMermaidSvgForExport,
  renderMermaidSvgForPrint,
  themeTextColorFromSvg,
} from "../renderer";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

const conversions = vi.hoisted(
  () =>
    [] as Array<{
      svg: string;
      options: { labelColor?: string } | undefined;
    }>,
);

vi.mock("../fo-labels", () => ({
  convertForeignObjectLabels: vi.fn(
    async (svg: string, options?: { labelColor?: string }) => {
      conversions.push({ svg, options });
      return svg;
    },
  ),
}));

// Engine-proof passes are not what this suite exercises — skip their real
// DOM/CSSOM work (see post-chain-order.test.ts for the order contract).
vi.mock("../text-offsets", () => ({
  normalizeSvgTextOffsets: (svg: string) => svg,
}));
vi.mock("../svg-css", () => ({
  clampNegativeStrokeWidths: (svg: string) => svg,
}));
vi.mock("../label-paint", () => ({
  pinLabelMathPaint: (svg: string) => svg,
}));
vi.mock("../math-labels", () => ({
  rasterizeMermaidLabelMath: async (svg: string) => svg,
}));

function svgWithRootRule(css: string | null): string {
  const style = css === null ? "" : `<style>${css}</style>`;
  return (
    '<svg id="mmd-test" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"' +
    ' width="20" height="20">' +
    style +
    "<g /></svg>"
  );
}

beforeEach(() => {
  clearMermaidCache();
  conversions.length = 0;
  mermaidMock.initialize.mockReset();
  mermaidMock.render.mockReset();
});

describe("themeTextColorFromSvg", () => {
  it("reads the fill of the diagram root rule", () => {
    const svg = svgWithRootRule(
      "#mmd-test{font-family:x;font-size:16px;fill:#333;}",
    );
    expect(themeTextColorFromSvg(svg)).toBe("#333");
  });

  it("tolerates spacing variants in the root rule", () => {
    const svg = svgWithRootRule(
      "#mmd-test { font-size: 16px; fill : #123456 ; }",
    );
    expect(themeTextColorFromSvg(svg)).toBe("#123456");
  });

  it("ignores rules for other ids and other properties", () => {
    const svg = svgWithRootRule(
      "#other .nodeLabel{color:#123456;}#mmd-test{stroke:#0f0;fill:#abcdef;}",
    );
    expect(themeTextColorFromSvg(svg)).toBe("#abcdef");
  });

  it("returns null without a stylesheet or root rule", () => {
    expect(themeTextColorFromSvg(svgWithRootRule(null))).toBeNull();
    expect(
      themeTextColorFromSvg(svgWithRootRule("#mmd-test{stroke:#0f0;}")),
    ).toBeNull();
  });
});

describe("export/print label ink wiring", () => {
  function stubRender(svg: string): void {
    mermaidMock.render.mockResolvedValue({ svg });
  }

  it("passes the theme ink to the label conversion for exports", async () => {
    stubRender(
      svgWithRootRule("#mmd-test{font-family:x;font-size:16px;fill:#123456;}"),
    );
    await renderMermaidSvgForExport("graph TD; A-->B");
    expect(conversions).toHaveLength(1);
    expect(conversions[0].options).toEqual({ labelColor: "#123456" });
  });

  it("falls back to the export theme's #333 when the root rule is unparseable", async () => {
    stubRender(svgWithRootRule(null));
    await renderMermaidSvgForExport("graph TD; A-->B");
    expect(conversions[0].options).toEqual({ labelColor: "#333" });
  });

  it("keeps the viewer ink for the print variant", async () => {
    stubRender(
      svgWithRootRule("#mmd-test{font-family:x;font-size:16px;fill:#123456;}"),
    );
    await renderMermaidSvgForPrint("graph TD; A-->B");
    expect(conversions).toHaveLength(1);
    expect(conversions[0].options).toBeUndefined();
  });
});
