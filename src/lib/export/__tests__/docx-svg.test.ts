/**
 * DOCX SVG/diagram embedding (EXPORT-PLAN 8.8): PNG-only by default (rule
 * 14), opt-in `asvg:svgBlip` dual embed with a mandatory PNG fallback. The
 * dual-embed invariant — every svgBlip keeps a raster blip — is the safety
 * property under test.
 *
 * Note: markdown-it's `validateLink` refuses `data:image/svg+xml` image
 * sources, so SVG images here are exercised through the relative-path
 * resolution branch (`read_file_as_base64`), like the ODT suites do.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRasterizeSvg } = vi.hoisted(() => ({
  mockRasterizeSvg: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));
vi.mock("highlight.js", () => ({
  default: { highlight: vi.fn(), highlightAuto: vi.fn() },
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

import { fileState } from "$lib/stores/file.svelte";
import {
  exportToZip,
  getDocumentXml,
  runDocxExport,
  zipText,
} from "./docx-harness";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>';
const SVG_BASE64 = Buffer.from(SVG).toString("base64");
const MD = "![d](img/diagram.svg)";
const STUBS = { read_file_as_base64: SVG_BASE64 };

beforeEach(() => {
  vi.clearAllMocks();
  fileState.currentFile = "/tmp/doc.md";
});

describe("docx SVG: PNG-only by default (rule 14)", () => {
  it("rasterizes SVG images and ships no SVG part", async () => {
    const zip = await exportToZip(MD, { invokeStubs: STUBS });
    const entries = Object.keys(zip.files);
    expect(
      entries.filter((e) => e.startsWith("word/media/") && e.endsWith(".png"))
        .length,
    ).toBe(1);
    expect(entries.filter((e) => e.endsWith(".svg")).length).toBe(0);
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("<w:drawing>");
    expect(xml).not.toContain("asvg:svgBlip");
    expect(mockRasterizeSvg).toHaveBeenCalled();
  });

  it("degrades to dual embed when rasterization fails", async () => {
    mockRasterizeSvg.mockRejectedValue(new Error("no rasterizer"));
    const result = await runDocxExport(MD, { invokeStubs: STUBS });
    expect(
      result.warnings.some((w) => w.includes("rasterization failed")),
    ).toBe(true);
    const zip = await exportToZip(MD, { invokeStubs: STUBS });
    const xml = await zipText(zip, "word/document.xml");
    // Vector mode at least keeps the SVG visible where supported…
    expect(xml).toContain("asvg:svgBlip");
    // …and the rule-14 fallback blip still exists (transparent placeholder).
    expect(xml).toContain("<a:blip r:embed=");
    // Restore the working rasterizer for the tests that follow.
    mockRasterizeSvg.mockImplementation(async () => new Uint8Array([1, 2, 3]));
  });
});

describe("docx SVG: vector mode dual-embeds (opt-in)", () => {
  const opts = { "docx.rasterizeSvg": false };

  it("embeds SVG + PNG fallback with a resolving svgBlip relationship", async () => {
    const zip = await exportToZip(MD, { invokeStubs: STUBS, options: opts });
    const entries = Object.keys(zip.files);
    expect(entries.filter((e) => e.endsWith(".svg")).length).toBe(1);
    expect(
      entries.filter((e) => e.startsWith("word/media/") && e.endsWith(".png"))
        .length,
    ).toBe(1);

    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("asvg:svgBlip");
    // The primary blip is the PNG (fallback), the extension carries the SVG.
    const blip = /<a:blip r:embed="([^"]+)">/.exec(xml);
    const svgBlip = /<asvg:svgBlip r:embed="([^"]+)"/.exec(xml);
    expect(blip).not.toBeNull();
    expect(svgBlip).not.toBeNull();
    expect(blip![1]).not.toBe(svgBlip![1]);

    const rels = await zipText(zip, "word/_rels/document.xml.rels");
    expect(rels).toContain(`Id="${blip![1]}"`);
    expect(rels).toContain(`Id="${svgBlip![1]}"`);
    const types = await zipText(zip, "[Content_Types].xml");
    expect(types).toContain('Extension="svg" ContentType="image/svg+xml"');
  });

  it("rasterizes the PNG fallback at the chosen resolution", async () => {
    await exportToZip(MD, {
      invokeStubs: STUBS,
      options: { ...opts, "docx.rasterResolution": 3 },
    });
    expect(mockRasterizeSvg).toHaveBeenCalledWith(
      expect.any(String), // materializeSvgPaint-cleaned SVG
      20,
      10,
      3,
    );
  });

  it("packages one SVG and one PNG even for repeated references", async () => {
    const zip = await exportToZip(`${MD} and again ${MD}`, {
      invokeStubs: STUBS,
      options: opts,
    });
    const entries = Object.keys(zip.files);
    expect(entries.filter((e) => e.endsWith(".svg")).length).toBe(1);
    expect(
      entries.filter((e) => e.startsWith("word/media/") && e.endsWith(".png"))
        .length,
    ).toBe(1);
    const xml = await zipText(zip, "word/document.xml");
    expect(xml.split("<w:drawing>").length - 1).toBe(2);
  });
});

describe("docx SVG: block-level SVG", () => {
  it("embeds an html_block <svg> element", async () => {
    const xml = await getDocumentXml(`${SVG}\n\ntext`);
    expect(xml).toContain("<w:drawing>");
    expect(mockRasterizeSvg).toHaveBeenCalled();
  });
});
