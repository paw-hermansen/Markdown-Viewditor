import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const {
  mockRenderVegaLiteSvgForExport,
  mockEnsureVegaLoaded,
  mockRasterizeSvg,
} = vi.hoisted(() => ({
  mockRenderVegaLiteSvgForExport: vi.fn(),
  mockEnsureVegaLoaded: vi.fn(async () => undefined),
  mockRasterizeSvg: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));
vi.mock("highlight.js", () => ({
  default: {
    highlight: vi.fn((code: string) => ({
      value: code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;"),
    })),
    highlightAuto: vi.fn((code: string) => ({
      value: code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;"),
    })),
  },
}));
vi.mock("../svg-rasterize", () => ({ rasterizeSvg: mockRasterizeSvg }));
vi.mock("../math-render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../math-render")>()),
  renderMathToPng: vi.fn(async () => ({
    png: new Uint8Array([1, 2, 3]),
    widthPx: 32,
    heightPx: 16,
  })),
}));
vi.mock("$lib/extensions/vega-lite/renderer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("$lib/extensions/vega-lite/renderer")>();
  return {
    ...original,
    ensureVegaLoaded: mockEnsureVegaLoaded,
    renderVegaLiteSvgForExport: mockRenderVegaLiteSvgForExport,
  };
});

import { exportToZip, runDocxExport, zipText } from "./docx-harness";
import {
  registerExtensionSchema,
  resetExtensions,
} from "$lib/extensions/registry";
import { VEGA_LITE_OPTIONS_SCHEMA } from "$lib/extensions/vega-lite/schema";

const VEGA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160"/></svg>';

const SPEC_SRC = JSON.stringify({
  data: { values: [{ x: 1, y: 2 }] },
  mark: "point",
  encoding: { x: { field: "x" }, y: { field: "y" } },
});

const DEFAULT_OPTS = {
  align: "center",
  fitToWidth: true,
  theme: "light", // auto → light: DOCX is a neutral document (SMILES contract)
};

describe("DOCX Vega-Lite export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: VEGA_SVG,
      warnings: [],
    });
  });

  beforeAll(() => {
    resetExtensions();
    registerExtensionSchema("vega-lite", VEGA_LITE_OPTIONS_SCHEMA);
  });

  it("embeds charts as PNG by default (rule 14)", async () => {
    const zip = await exportToZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("<w:drawing>");
    expect(xml).not.toContain("asvg:svgBlip");
    expect(mockRasterizeSvg).toHaveBeenCalled();
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      DEFAULT_OPTS,
    );
  });

  it("dual-embeds with a PNG fallback blip when vector mode is opted in", async () => {
    const zip = await exportToZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``, {
      options: { "docx.rasterizeSvg": false },
    });
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("asvg:svgBlip");
    // The dual-embed invariant: every svgBlip keeps a raster fallback blip.
    expect(xml).toMatch(/<a:blip r:embed=/);
  });

  it("resolves theme=auto to light and honors pinned themes", async () => {
    await exportToZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, theme: "light" },
    );
    await exportToZip(`\`\`\`vega-lite {theme=dark}\n${SPEC_SRC}\n\`\`\``);
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenLastCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, theme: "dark" },
    );
  });

  it("maps align to paragraph justification", async () => {
    const zip = await exportToZip(
      `<!-- vega-lite: align=left -->\n\n\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``,
    );
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain('<w:jc w:val="left"/>');
  });

  it("surfaces render warnings in the export warnings", async () => {
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: VEGA_SVG,
      warnings: ["Image /x/missing.png could not be loaded: no such file"],
    });
    const result = await runDocxExport(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(result.warnings.some((w) => w.includes("could not be loaded"))).toBe(
      true,
    );
  });

  it("falls back to source code when Vega-Lite rendering fails", async () => {
    mockRenderVegaLiteSvgForExport.mockImplementation(async () => {
      throw new Error("bad spec");
    });
    const result = await runDocxExport(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(
      result.warnings.some((w) => w.includes("Vega-Lite rendering failed")),
    ).toBe(true);
    const zip = await exportToZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).not.toContain("<w:drawing>");
    expect(xml).toContain("mark"); // escaped source kept
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });
});
