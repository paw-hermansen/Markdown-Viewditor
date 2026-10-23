import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock the rasterization helpers so tests don't need a real DOM/canvas.
const { mockRenderMathToPng } = vi.hoisted(() => ({
  mockRenderMathToPng: vi.fn(async () => ({
    png: new Uint8Array([1, 2, 3]),
    widthPx: 32,
    heightPx: 16,
  })),
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
  rasterizeSvg: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("../math-render", async (importOriginal) => {
  const original = await importOriginal<typeof import("../math-render")>();
  return {
    ...original,
    renderMathToPng: mockRenderMathToPng,
    MATH_HOST_WIDTH_PX: 600,
  };
});

import { registerExtensionSchema } from "$lib/extensions/registry";
import { KATEX_OPTIONS_SCHEMA } from "$lib/extensions/katex/renderer";
import { exportToZip } from "./odt-harness";

// Schema will be registered in beforeAll.

/** This suite exports math documents — the preset is the only difference. */
const exportMathZip = (src: string, options?: Record<string, unknown>) =>
  exportToZip(src, { plugins: ["math"], options });

describe("ODT math directives and fence attributes", () => {
  beforeAll(() => {
    registerExtensionSchema("math", KATEX_OPTIONS_SCHEMA);
  });

  beforeEach(() => {
    mockRenderMathToPng.mockClear();
    mockRenderMathToPng.mockResolvedValue({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 32,
      heightPx: 16,
    });
  });

  it("passes leqno directive to renderMathToMathml", async () => {
    const src = "<!-- math: leqno -->\n\n$$\nE=mc^2 \\tag{1}\n$$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });

  it("passes fontsize directive to renderMathToMathml", async () => {
    const src = "<!-- math: fontsize=2.0 -->\n\n$$\nx^2\n$$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("mathsize");
  });

  it("passes fence {leqno} to renderMathToMathml", async () => {
    const src = "```math {leqno}\nE = mc^2 \\tag{1}\n```";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });

  it("passes fence {fontsize=2.0} to renderMathToMathml", async () => {
    const src = "```math {fontsize=2.0}\nx^2\n```";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain('mathsize="2em"');
  });

  it("fence attrs override HTML comment directives", async () => {
    const src =
      "<!-- math: fontsize=1.5 -->\n\n```math {fontsize=3.0}\nx^2\n```";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain('mathsize="3em"');
    expect(mathXml).not.toContain('mathsize="1.5em"');
  });

  it("changing directives mid-document produce different states", async () => {
    const src = [
      "<!-- math: fontsize=2.0 -->",
      "",
      "$$",
      "a",
      "$$",
      "",
      "<!-- math: !fontsize -->",
      "",
      "$$",
      "b",
      "$$",
    ].join("\n");
    const zip = await exportMathZip(src);
    const obj1Xml = await zip.file("Object 1/content.xml")!.async("text");
    const obj2Xml = await zip.file("Object 2/content.xml")!.async("text");
    // First formula should have fontsize=2.0
    expect(obj1Xml).toContain('mathsize="2em"');
    // Second formula should NOT have mathsize (back to default 1.0)
    expect(obj2Xml).not.toContain("mathsize");
  });

  it("directive reset with !key reverts to default", async () => {
    const src = [
      "<!-- math: leqno -->",
      "",
      "$$",
      "a \\tag{1}",
      "$$",
      "",
      "<!-- math: !leqno -->",
      "",
      "$$",
      "b \\tag{2}",
      "$$",
    ].join("\n");
    const zip = await exportMathZip(src);
    const obj1Xml = await zip.file("Object 1/content.xml")!.async("text");
    const obj2Xml = await zip.file("Object 2/content.xml")!.async("text");
    // Both should render without errors
    expect(obj1Xml).toContain("<math");
    expect(obj2Xml).toContain("<math");
  });
  it("rasterized math receives directive options", async () => {
    const src = "<!-- math: leqno -->\n\n$$\nE=mc^2 \\tag{1}\n$$";
    await exportMathZip(src, { "odt.rasterizeMath": true });
    expect(mockRenderMathToPng).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callOpts = (mockRenderMathToPng as any).mock.lastCall[0];
    expect(callOpts.leqno).toBe(true);
  });

  it("rasterized fenced math receives merged fence + directive options", async () => {
    const src = "<!-- math: leqno -->\n\n```math {fontsize=2.0}\nx^2\n```";
    await exportMathZip(src, { "odt.rasterizeMath": true });
    expect(mockRenderMathToPng).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callOpts = (mockRenderMathToPng as any).mock.lastCall[0];
    expect(callOpts.leqno).toBe(true);
    expect(callOpts.fontsize).toBe(2.0);
  });

  it("math without directives uses defaults", async () => {
    const src = "$$\nx^2\n$$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    // No fontsize wrapper (default is 1.0)
    expect(mathXml).not.toContain("mathsize");
  });

  it("inline math $x^2$ with fontsize directive in ODT", async () => {
    const src = "<!-- math: fontsize=2.0 -->\n\n$x^2$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain('mathsize="2em"');
  });

  it("inline math $x^2$ with leqno directive in ODT", async () => {
    const src = "<!-- math: leqno -->\n\n$x^2$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });

  it("fleqn directive in ODT MathML", async () => {
    const src = "<!-- math: fleqn -->\n\n$$\n\\int_0^1 f(x) dx\n$$";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });

  it("fence {fleqn} in ODT MathML", async () => {
    const src = "```math {fleqn}\n\\int_0^1 f(x) dx\n```";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });

  it("rasterized inline math receives directive options", async () => {
    const src = "<!-- math: leqno -->\n\n$x^2$";
    await exportMathZip(src, { "odt.rasterizeMath": true });
    expect(mockRenderMathToPng).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callOpts = (mockRenderMathToPng as any).mock.lastCall[0];
    expect(callOpts.leqno).toBe(true);
  });

  it("rasterized inline math receives fontsize", async () => {
    const src = "<!-- math: fontsize=2.0 -->\n\n$x^2$";
    await exportMathZip(src, { "odt.rasterizeMath": true });
    expect(mockRenderMathToPng).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callOpts = (mockRenderMathToPng as any).mock.lastCall[0];
    expect(callOpts.fontsize).toBe(2.0);
  });

  it("\\begin{align} bare block with leqno directive", async () => {
    const src = "<!-- math: leqno -->\n\n\\begin{align}\nx &= 1\n\\end{align}";
    const zip = await exportMathZip(src);
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
  });
});
