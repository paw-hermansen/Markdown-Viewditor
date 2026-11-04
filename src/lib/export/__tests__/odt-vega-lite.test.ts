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
vi.mock("../svg-rasterize", () => ({
  rasterizeSvg: mockRasterizeSvg,
}));
vi.mock("../math-render", async (importOriginal) => {
  const original = await importOriginal<typeof import("../math-render")>();
  return {
    ...original,
    renderMathToPng: vi.fn(async () => ({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 32,
      heightPx: 16,
    })),
    MATH_HOST_WIDTH_PX: 600,
  };
});
vi.mock("$lib/extensions/vega-lite/renderer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("$lib/extensions/vega-lite/renderer")>();
  return {
    ...original,
    ensureVegaLoaded: mockEnsureVegaLoaded,
    renderVegaLiteSvgForExport: mockRenderVegaLiteSvgForExport,
  };
});

import { exportToZip, runOdtExport } from "./odt-harness";
import {
  registerExtensionSchema,
  resetExtensions,
} from "$lib/extensions/registry";
import { VEGA_LITE_OPTIONS_SCHEMA } from "$lib/extensions/vega-lite/schema";

/**
 * 320×160 at the viewer→page scale (600/800 = 0.75) = 240×120 px =
 * 2.5×1.25 in. Wide charts clamp to the 600 px page content width
 * (6.25 in) like Mermaid diagrams.
 */
const VEGA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160"/></svg>';

const WIDE_VEGA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400"/></svg>';

const IMG_VEGA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="320" height="160" viewBox="0 0 320 160">' +
  '<image xlink:href="localimg://localhost/%2Fhome%2Fa%2Fpic.png" width="320" height="160"/></svg>';

const SPEC_SRC = JSON.stringify({
  data: { values: [{ x: 1, y: 2 }] },
  mark: "point",
  encoding: { x: { field: "x" }, y: { field: "y" } },
});

const DEFAULT_OPTS = {
  align: "center",
  fitToWidth: true,
  // theme=auto resolves to light: ODT is a neutral document (white page,
  // no theme background). Explicit pins are honored (the SMILES contract).
  theme: "light",
};

/** This suite exports plain markdown — no math plugins. */
const exportBaseZip = (src: string, options?: Record<string, unknown>) =>
  exportToZip(src, { options });

describe("ODT Vega-Lite export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: VEGA_SVG,
      warnings: [],
    });
  });

  beforeAll(() => {
    // Register the Vega-Lite schema so `<!-- vega-lite: ... -->` directives
    // are validated during export (mirrors builtins.ts registration).
    resetExtensions();
    registerExtensionSchema("vega-lite", VEGA_LITE_OPTIONS_SCHEMA);
  });

  it("embeds a vega-lite fence as a vector SVG image by default", async () => {
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).not.toContain("Preformatted_20_Text");
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      DEFAULT_OPTS,
    );
    expect(mockEnsureVegaLoaded).toHaveBeenCalled();
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("renders ```vegalite fences too", async () => {
    const zip = await exportBaseZip(`\`\`\`vegalite\n${SPEC_SRC}\n\`\`\``);
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      DEFAULT_OPTS,
    );
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
  });

  it("stores the SVG under Pictures/ in the package", async () => {
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const names = Object.keys(zip.files);
    expect(
      names.some((n) => n.startsWith("Pictures/") && n.endsWith(".svg")),
    ).toBe(true);
  });

  it("rasterizes as PNG when the shared SVG/diagram option is on", async () => {
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``, {
      "odt.rasterizeSvg": true,
      "odt.rasterResolution": 2,
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(mockRasterizeSvg).toHaveBeenCalled();
  });

  it("frames at the viewer's scaled size (2.5 x 1.25 in for 320x160)", async () => {
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('svg:width="2.5000in"');
    expect(xml).toContain('svg:height="1.2500in"');
  });

  it("clamps wide charts to the page content width", async () => {
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: WIDE_VEGA_SVG,
      warnings: [],
    });
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    // 1200px natural → capped at the 800px viewer column → 0.75 scale →
    // 600px page content width = 6.25in.
    expect(xml).toContain('svg:width="6.2500in"');
  });

  it("passes fitToWidth=false through and still clamps to the page", async () => {
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: WIDE_VEGA_SVG,
      warnings: [],
    });
    const zip = await exportBaseZip(
      `\`\`\`vega-lite {fitToWidth=false}\n${SPEC_SRC}\n\`\`\``,
    );
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, fitToWidth: false },
    );
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('svg:width="6.2500in"');
  });

  it("renders theme=auto with the light look (neutral ODT page)", async () => {
    await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, theme: "light" },
    );
  });

  it("honors an explicitly pinned theme from fence attributes", async () => {
    await exportBaseZip(`\`\`\`vega-lite {theme=dark}\n${SPEC_SRC}\n\`\`\``);
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, theme: "dark" },
    );
  });

  it("honors align directives and lets fence attributes override them", async () => {
    const zip = await exportBaseZip(
      `<!-- vega-lite: align=left -->\n\n\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``,
    );
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, align: "left" },
    );
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Diagram_20_Display_20_Left"[^>]*>[\s\S]*?<draw:frame/,
    );

    const overrideZip = await exportBaseZip(
      `<!-- vega-lite: align=left -->\n\n\`\`\`vega-lite {align=right}\n${SPEC_SRC}\n\`\`\``,
    );
    expect(mockRenderVegaLiteSvgForExport).toHaveBeenLastCalledWith(
      `${SPEC_SRC}\n`,
      { ...DEFAULT_OPTS, align: "right" },
    );
    const overrideXml = await overrideZip.file("content.xml")!.async("text");
    expect(overrideXml).toMatch(
      /<text:p[^>]*text:style-name="Diagram_20_Display_20_Right"[^>]*>[\s\S]*?<draw:frame/,
    );
  });

  it("inlines localimg image hrefs in the embedded SVG", async () => {
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: IMG_VEGA_SVG,
      warnings: [],
    });
    const zip = await exportToZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``, {
      invokeStubs: { read_file_as_base64: "QUJD" },
    });
    const svgEntry = Object.keys(zip.files).find(
      (n) => n.startsWith("Pictures/") && n.endsWith(".svg"),
    );
    expect(svgEntry).toBeDefined();
    const svgText = await zip.file(svgEntry!)!.async("text");
    expect(svgText).toContain("data:image/png;base64,QUJD");
    expect(svgText).not.toContain("localimg://");
  });

  it("surfaces render warnings (e.g. unreadable images) in the export warnings", async () => {
    mockRenderVegaLiteSvgForExport.mockResolvedValue({
      svg: VEGA_SVG,
      warnings: ["Image /x/missing.png could not be loaded: no such file"],
    });
    const result = await runOdtExport(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(result.warnings.some((w) => w.includes("could not be loaded"))).toBe(
      true,
    );
  });

  it("falls back to source code when Vega-Lite rendering fails", async () => {
    mockRenderVegaLiteSvgForExport.mockImplementation(async () => {
      throw new Error("bad spec");
    });
    const result = await runOdtExport(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    expect(
      result.warnings.some((w) => w.includes("Vega-Lite rendering failed")),
    ).toBe(true);
    const zip = await exportBaseZip(`\`\`\`vega-lite\n${SPEC_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(xml).not.toContain("<draw:image");
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("keeps other fenced code blocks as source", async () => {
    const zip = await exportBaseZip("```js\nconst x = 1;\n```");
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(mockRenderVegaLiteSvgForExport).not.toHaveBeenCalled();
    expect(mockEnsureVegaLoaded).not.toHaveBeenCalled();
  });
});
