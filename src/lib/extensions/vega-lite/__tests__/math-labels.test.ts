// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRenderMathToPng, mockEnsureMathFontsLoaded } = vi.hoisted(() => ({
  mockRenderMathToPng: vi.fn(),
  mockEnsureMathFontsLoaded: vi.fn(async () => undefined),
}));

vi.mock("$lib/export/math-render", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("$lib/export/math-render")>();
  return {
    ...original,
    renderMathToPng: mockRenderMathToPng,
    ensureMathFontsLoaded: mockEnsureMathFontsLoaded,
  };
});

import {
  OPTICAL_CENTER_RATIO,
  rasterizeVegaLabelMath,
  tokenizeMathLabel,
} from "../math-labels";

const PNG = { png: new Uint8Array([1, 2, 3]), widthPx: 32, heightPx: 16 };

beforeEach(() => {
  vi.clearAllMocks();
  mockRenderMathToPng.mockResolvedValue(PNG);
});

function svgWithLabel(inner: string, attrs = ""): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">' +
    `<text${attrs}>${inner}</text></svg>`
  );
}

describe("tokenizeMathLabel", () => {
  it("tokenizes whole-label math", () => {
    expect(tokenizeMathLabel("$x^2$")).toEqual([
      { kind: "math", value: "x^2", display: false },
    ]);
  });

  it("tokenizes display math and mixed labels", () => {
    expect(tokenizeMathLabel("$$a+b$$ tail")).toEqual([
      { kind: "math", value: "a+b", display: true },
      { kind: "text", value: " tail", display: false },
    ]);
    expect(tokenizeMathLabel("$x$ (samples)")).toEqual([
      { kind: "math", value: "x", display: false },
      { kind: "text", value: " (samples)", display: false },
    ]);
  });

  it("never treats prices as math", () => {
    expect(tokenizeMathLabel("$5 and $10")).toBeNull();
    expect(tokenizeMathLabel("cost $100 total")).toBeNull();
  });

  it("returns null for plain text", () => {
    expect(tokenizeMathLabel("sin(π/2) = 1")).toBeNull();
  });
});

describe("rasterizeVegaLabelMath", () => {
  it("replaces whole-label math with an image at the text anchor", async () => {
    mockRenderMathToPng.mockResolvedValue(PNG);
    const src = svgWithLabel(
      "$x^2$",
      ' transform="translate(100,3)" text-anchor="middle" font-size="10px" font-family="Helvetica" fill="#e6e6e6"',
    );
    const out = await rasterizeVegaLabelMath(src, { color: "#e6e6e6" });

    // Wrapper reuses the text's transform (rotation-safe placement).
    expect(out).toContain('<g transform="translate(100,3)"');
    // Anchor "middle": x = -width/2; optical-center heuristic for y.
    expect(out).toContain('x="-16"');
    expect(out).toContain(`y="${-OPTICAL_CENTER_RATIO * 10 - 8}"`);
    expect(out).toContain('width="32"');
    expect(out).toContain('height="16"');
    expect(out).toContain("data:image/png;base64,AQID");
    // The original label stays hidden in place for copy/paste.
    expect(out).toContain('visibility="hidden"');
    expect(out).toContain("$x^2$");
    // Theme foreground reaches the rasterizer.
    expect(mockRenderMathToPng).toHaveBeenCalledWith(
      expect.objectContaining({
        tex: "x^2",
        displayMode: false,
        targetFontSize: 10,
        color: "#e6e6e6",
      }),
    );
  });

  it("lays out mixed labels: math image plus text run tspans", async () => {
    mockRenderMathToPng.mockResolvedValue(PNG);
    const src = svgWithLabel(
      "$x$ (samples)",
      ' transform="translate(0,15)" text-anchor="start" font-size="10px"',
    );
    const out = await rasterizeVegaLabelMath(src, {
      measureTextWidth: () => 60,
    });
    // Math image first at x=0; the text run's tspan follows at x=32.
    expect(out).toContain('<image x="0"');
    expect(out).toContain('<tspan x="32" y="0"> (samples)</tspan>');
  });

  it("honors text-anchor end for the run origin", async () => {
    mockRenderMathToPng.mockResolvedValue(PNG);
    const src = svgWithLabel(
      "$x$ tail",
      ' transform="translate(50,0)" text-anchor="end" font-size="10px"',
    );
    const out = await rasterizeVegaLabelMath(src, {
      measureTextWidth: () => 20,
    });
    // total = 32 + 20 = 52; originX = -52.
    expect(out).toContain('<image x="-52"');
  });

  it("leaves price-like labels and plain text untouched", async () => {
    const src = svgWithLabel("$5 and $10");
    const out = await rasterizeVegaLabelMath(src);
    expect(out).toBe(src);
    expect(mockRenderMathToPng).not.toHaveBeenCalled();
  });

  it("leaves multi-line (tspan) labels untouched", async () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>$x$</tspan></text></svg>';
    const out = await rasterizeVegaLabelMath(src);
    expect(out).toBe(src);
    expect(mockRenderMathToPng).not.toHaveBeenCalled();
  });

  it("keeps the label when the rasterizer fails (never throws)", async () => {
    mockRenderMathToPng.mockRejectedValue(new Error("no rasterizer"));
    const src = svgWithLabel("$x^2$", ' transform="translate(0,0)"');
    const out = await rasterizeVegaLabelMath(src);
    expect(out).toBe(src);
  });

  it("keeps the label when text measurement is unavailable", async () => {
    mockRenderMathToPng.mockResolvedValue(PNG);
    const src = svgWithLabel("$x$ (samples)");
    const out = await rasterizeVegaLabelMath(src, {
      measureTextWidth: () => null,
    });
    expect(out).toBe(src);
    expect(mockRenderMathToPng).not.toHaveBeenCalled();
  });

  it("passes display mode for $$..$$ runs", async () => {
    mockRenderMathToPng.mockResolvedValue(PNG);
    await rasterizeVegaLabelMath(svgWithLabel("$$a+b$$"));
    expect(mockRenderMathToPng).toHaveBeenCalledWith(
      expect.objectContaining({ tex: "a+b", displayMode: true }),
    );
  });
});
