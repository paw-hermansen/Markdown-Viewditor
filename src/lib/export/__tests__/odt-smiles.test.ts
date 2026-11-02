import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { mockRenderSmilesSvg, mockEnsureSmilesLoaded, mockRasterizeSvg } =
  vi.hoisted(() => ({
    mockRenderSmilesSvg: vi.fn(),
    mockEnsureSmilesLoaded: vi.fn(async () => undefined),
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
vi.mock("$lib/extensions/smiles/renderer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("$lib/extensions/smiles/renderer")>();
  return {
    ...original,
    ensureSmilesLoaded: mockEnsureSmilesLoaded,
    renderSmilesSvg: mockRenderSmilesSvg,
  };
});

import { exportToZip, runOdtExport } from "./odt-harness";
import {
  registerExtensionSchema,
  resetExtensions,
} from "$lib/extensions/registry";
import { SMILES_OPTIONS_SCHEMA } from "$lib/extensions/smiles/schema";

/** A squared SMILES box: 288px = 3.0000in, so frame-size assertions are crisp. */
const SMILES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288"><rect width="288" height="288"/></svg>';

const WIDE_SMILES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200"/></svg>';

const SCALED_SMILES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432"><rect width="432" height="432"/></svg>';

const SMILES_SRC = "CC(=O)Oc1ccccc1C(=O)O";

const DEFAULT_OPTS = {
  align: "center",
  scale: 1,
  theme: "auto",
  atomVisualization: "default",
  showCarbons: "default",
  explicitHydrogens: true,
  compactDrawing: true,
  isomeric: true,
};

/** This suite exports plain markdown — no math plugins. */
const exportBaseZip = (src: string, options?: Record<string, unknown>) =>
  exportToZip(src, { options });

describe("ODT SMILES export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderSmilesSvg.mockReturnValue(SMILES_SVG);
  });

  beforeAll(() => {
    // Register the SMILES schema so `<!-- smiles: ... -->` directives are
    // validated during export (mirrors builtins.ts registration).
    resetExtensions();
    registerExtensionSchema("smiles", SMILES_OPTIONS_SCHEMA);
  });

  it("embeds a smiles fence as a vector SVG image by default", async () => {
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).not.toContain("Preformatted_20_Text");
    expect(mockRenderSmilesSvg).toHaveBeenCalledWith(
      `${SMILES_SRC}\n`,
      DEFAULT_OPTS,
    );
    expect(mockEnsureSmilesLoaded).toHaveBeenCalled();
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("stores the SVG under Pictures/ in the package", async () => {
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const names = Object.keys(zip.files);
    expect(
      names.some((n) => n.startsWith("Pictures/") && n.endsWith(".svg")),
    ).toBe(true);
  });

  it("rasterizes SMILES as PNG when the shared SVG/diagram option is on", async () => {
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``, {
      "odt.rasterizeSvg": true,
      "odt.rasterResolution": 2,
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(mockRasterizeSvg).toHaveBeenCalled();
  });

  it("gives the frame the renderer's scaled dimensions", async () => {
    // 288px at 96dpi = 3.0in — the scale multiplier is already baked into
    // the renderer's width/height attributes, so the frame follows it.
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('svg:width="3.0000in"');
    expect(xml).toContain('svg:height="3.0000in"');
  });

  it("passes scale through and frames at the scaled size", async () => {
    mockRenderSmilesSvg.mockReturnValue(SCALED_SMILES_SVG);
    const zip = await exportBaseZip(
      `\`\`\`smiles {scale=1.5}\n${SMILES_SRC}\n\`\`\``,
    );
    expect(mockRenderSmilesSvg).toHaveBeenCalledWith(`${SMILES_SRC}\n`, {
      ...DEFAULT_OPTS,
      scale: 1.5,
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('svg:width="4.5000in"');
  });

  it("clamps structures wider than the page to the page content width", async () => {
    mockRenderSmilesSvg.mockReturnValue(WIDE_SMILES_SVG);
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    // 600px page content width (MATH_HOST_WIDTH_PX mock) = 6.25in.
    expect(xml).toContain('svg:width="6.2500in"');
  });

  it("centers structures by default", async () => {
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Diagram_20_Display"[^>]*>[\s\S]*?<draw:frame/,
    );
  });

  it("honors align directives", async () => {
    const zip = await exportBaseZip(
      `<!-- smiles: align=left -->\n\n\`\`\`smiles\n${SMILES_SRC}\n\`\`\``,
    );
    expect(mockRenderSmilesSvg).toHaveBeenCalledWith(`${SMILES_SRC}\n`, {
      ...DEFAULT_OPTS,
      align: "left",
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Diagram_20_Display_20_Left"[^>]*>[\s\S]*?<draw:frame/,
    );
  });

  it("lets fence attributes override smiles directives", async () => {
    const zip = await exportBaseZip(
      `<!-- smiles: align=left -->\n\n\`\`\`smiles {align=right}\n${SMILES_SRC}\n\`\`\``,
    );
    expect(mockRenderSmilesSvg).toHaveBeenCalledWith(`${SMILES_SRC}\n`, {
      ...DEFAULT_OPTS,
      align: "right",
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Diagram_20_Display_20_Right"[^>]*>[\s\S]*?<draw:frame/,
    );
  });

  it("renders ```smi fences too", async () => {
    const zip = await exportBaseZip(`\`\`\`smi\n${SMILES_SRC}\n\`\`\``);
    expect(mockRenderSmilesSvg).toHaveBeenCalledWith(
      `${SMILES_SRC}\n`,
      DEFAULT_OPTS,
    );
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
  });

  it("falls back to source code when SMILES rendering fails", async () => {
    mockRenderSmilesSvg.mockImplementation(() => {
      throw new Error("bad smiles");
    });
    const result = await runOdtExport(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    expect(
      result.warnings.some((w) => w.includes("SMILES rendering failed")),
    ).toBe(true);
    const zip = await exportBaseZip(`\`\`\`smiles\n${SMILES_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(xml).not.toContain("<draw:image");
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("keeps other fenced code blocks as source", async () => {
    const zip = await exportBaseZip("```js\nconst x = 1;\n```");
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(mockRenderSmilesSvg).not.toHaveBeenCalled();
    expect(mockEnsureSmilesLoaded).not.toHaveBeenCalled();
  });
});
