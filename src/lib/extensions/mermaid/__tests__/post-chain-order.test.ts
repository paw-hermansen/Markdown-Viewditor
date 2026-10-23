/**
 * Post-chain parity: every render pipeline must run the engine-proof passes
 * in the pinned order (AGENTS.md "Mermaid Label Math Paint" /
 * "Mermaid Edge Stroke Width") — normalizeSvgTextOffsets, then
 * clampNegativeStrokeWidths, then pinLabelMathPaint — with the label pass
 * LAST, so whatever paint is in effect gets baked into its output. The
 * passes are mocked to record their call order; the invariant is asserted
 * per pipeline (viewer pre-render, export, print), which is exactly what a
 * fork of the shared postProcessSvg chain would break.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMermaidCache,
  preRenderMermaidBlocks,
  renderMermaidSvgForExport,
  renderMermaidSvgForPrint,
} from "../renderer";
import { MERMAID_OPTIONS_SCHEMA } from "../schema";

const RAW_SVG =
  '<svg width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320"><g /></svg>';

const order = vi.hoisted(() => [] as string[]);

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

vi.mock("../text-offsets", () => ({
  normalizeSvgTextOffsets: vi.fn((svg: string) => {
    order.push("normalize");
    return svg;
  }),
}));

vi.mock("../svg-css", () => ({
  clampNegativeStrokeWidths: vi.fn((svg: string) => {
    order.push("clamp");
    return svg;
  }),
}));

vi.mock("../label-paint", () => ({
  pinLabelMathPaint: vi.fn((svg: string) => {
    order.push("pin");
    return svg;
  }),
}));

vi.mock("../math-labels", () => ({
  rasterizeMermaidLabelMath: vi.fn(async (svg: string) => {
    order.push("rasterize");
    return svg;
  }),
}));

vi.mock("../fo-labels", () => ({
  convertForeignObjectLabels: vi.fn(async (svg: string) => {
    order.push("convert");
    return svg;
  }),
}));

function fenceToken(content: string): {
  type: "fence";
  info: string;
  content: string;
} {
  return { type: "fence", info: "mermaid", content };
}

describe("post-processing chain order", () => {
  beforeEach(() => {
    clearMermaidCache();
    order.length = 0;
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({ svg: RAW_SVG });
  });

  it("runs normalize → clamp → pin → rasterize for the viewer pipeline", async () => {
    await preRenderMermaidBlocks(
      [fenceToken("graph LR; A-->B")],
      {},
      MERMAID_OPTIONS_SCHEMA,
    );

    expect(order).toEqual(["normalize", "clamp", "pin", "rasterize"]);
  });

  it("runs normalize → clamp → pin → convert for the export pipeline", async () => {
    await renderMermaidSvgForExport("graph LR; A-->B");

    expect(order).toEqual(["normalize", "clamp", "pin", "convert"]);
  });

  it("runs normalize → clamp → pin → convert for the print pipeline", async () => {
    await renderMermaidSvgForPrint("graph LR; A-->B");

    expect(order).toEqual(["normalize", "clamp", "pin", "convert"]);
  });
});
