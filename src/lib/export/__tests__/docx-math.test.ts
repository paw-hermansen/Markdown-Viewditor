/**
 * DOCX math option wiring (EXPORT-PLAN 8.7): OMML by default, PNG via
 * `docx.rasterizeMath`, raster failure → OMML, converter gap → TeX source +
 * warning (**no automatic PNG fallback** — explicit decision).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRenderMathToPng, mockMathmlToOmml } = vi.hoisted(() => ({
  mockRenderMathToPng: vi.fn(async () => ({
    png: new Uint8Array([1, 2, 3]),
    widthPx: 32,
    heightPx: 16,
  })),
  mockMathmlToOmml: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));
vi.mock("highlight.js", () => ({
  default: { highlight: vi.fn(), highlightAuto: vi.fn() },
}));
vi.mock("../svg-rasterize", () => ({
  rasterizeSvg: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("../math-render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../math-render")>()),
  renderMathToPng: mockRenderMathToPng,
}));
vi.mock("../docx/omml", async (importOriginal) => {
  const original = await importOriginal<typeof import("../docx/omml")>();
  // Default to the real converter; tests override per call to drive the
  // gap path.
  mockMathmlToOmml.mockImplementation((mathml: string) =>
    original.mathmlToOmml(mathml),
  );
  return { ...original, mathmlToOmml: mockMathmlToOmml };
});

import {
  getMathDocumentXml,
  runDocxExport,
  exportToZip,
  zipText,
} from "./docx-harness";

beforeEach(() => {
  // mockClear only — the factory-set converter delegation must survive.
  vi.clearAllMocks();
});

describe("docx math: OMML by default", () => {
  it("inline math becomes m:oMath", async () => {
    const xml = await getMathDocumentXml("value $x^2$ here");
    expect(xml).toContain("<m:oMath>");
    expect(xml).toContain("<m:sSup>");
    expect(xml).not.toContain("<w:drawing>");
    // Native equations handle their own baseline — no run-position shift.
    expect(xml).not.toContain("<w:position");
  });

  it("display math becomes m:oMathPara", async () => {
    const xml = await getMathDocumentXml("$$x^2$$");
    expect(xml).toContain("<m:oMathPara>");
  });

  it("fenced math blocks render as display math", async () => {
    const xml = await getMathDocumentXml("```math\n\\frac{1}{2}\n```");
    expect(xml).toContain("<m:oMathPara>");
    expect(xml).toContain("<m:f>");
  });
});

describe("docx math: raster mode", () => {
  it("embeds a PNG drawing with TeX alt text and no OMML", async () => {
    const xml = await getMathDocumentXml("value $x^2$ here", {
      "docx.rasterizeMath": true,
    });
    expect(xml).toContain("<w:drawing>");
    expect(xml).toContain('descr="x^2"');
    expect(xml).not.toContain("<m:oMath>");
    expect(mockRenderMathToPng).toHaveBeenCalledWith(
      expect.objectContaining({ targetFontSize: 12, trimToInk: true }),
    );
  });

  it("lowers inline math drawings to line-center via w:position", async () => {
    // Mocked raster: heightPx 16 → shift = 16/2 − 5 = 3px → −round(3×1.5)
    // half-points = -5 (negative = lowered; the ODT Formula-style look).
    const xml = await getMathDocumentXml("value $x^2$ here", {
      "docx.rasterizeMath": true,
    });
    expect(xml).toContain('<w:position w:val="-5"/>');
  });

  it("does not shift display math drawings (own centered paragraph)", async () => {
    const xml = await getMathDocumentXml("$$x^2$$", {
      "docx.rasterizeMath": true,
    });
    expect(xml).toContain("<w:drawing>");
    expect(xml).not.toContain("<w:position");
  });

  it("falls back to OMML with a warning when rasterization fails", async () => {
    // One rejection per export below (the second is the XML assertion run).
    mockRenderMathToPng.mockRejectedValueOnce(new Error("no canvas"));
    const result = await runDocxExport("value $x^2$ here", {
      plugins: ["math"],
      options: { "docx.rasterizeMath": true },
    });
    expect(
      result.warnings.some((w) => w.includes("rasterization failed")),
    ).toBe(true);
    mockRenderMathToPng.mockRejectedValueOnce(new Error("no canvas"));
    const zip = await exportToZip("value $x^2$ here", {
      plugins: ["math"],
      options: { "docx.rasterizeMath": true },
    });
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("<m:oMath>");
    expect(xml).not.toContain("<w:drawing>");
  });
});

describe("docx math: converter gaps degrade to TeX (no PNG fallback)", () => {
  it("emits escaped TeX source and a warning", async () => {
    mockMathmlToOmml.mockReturnValueOnce(null);
    const result = await runDocxExport("value $x < y$ here", {
      plugins: ["math"],
    });
    expect(result.warnings.some((w) => w.includes("no OMML mapping"))).toBe(
      true,
    );

    mockMathmlToOmml.mockReturnValueOnce(null);
    const xml = await getMathDocumentXml("value $x < y$ here");
    expect(xml).not.toContain("<m:oMath>");
    expect(xml).toContain('<w:rStyle w:val="Code"/>');
    expect(xml).toContain("x &lt; y");
    expect(xml).not.toContain("<w:drawing>"); // no silent PNG fallback
  });
});
