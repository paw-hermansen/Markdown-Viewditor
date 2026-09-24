import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { mockRenderMermaidSvgForExport, mockRasterizeSvg } = vi.hoisted(() => ({
  mockRenderMermaidSvgForExport: vi.fn(),
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
vi.mock("$lib/extensions/mermaid/renderer", () => ({
  renderMermaidSvgForExport: mockRenderMermaidSvgForExport,
}));

import JSZip from "jszip";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import { odtExporter, odtOptionGroups } from "../exporters/odt";
import type { ExportContext } from "../types";

const MERMAID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160"/></svg>';

const WIDE_MERMAID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect width="1200" height="400"/></svg>';

const MERMAID_SRC = "graph LR\n    A-->B";

function makeTokens(src: string) {
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  return md.parse(src, {});
}

async function runOdtExport(src: string, options?: Record<string, unknown>) {
  const tokens = makeTokens(src);
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  const html = md.render(src);
  const ctx: ExportContext = {
    markdown: src,
    html,
    frontmatter: null,
    fileName: "test",
    tokens,
    options,
  };
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await odtExporter.export(ctx);
  const calls = vi.mocked(invoke).mock.calls;
  const content = calls[calls.length - 1][1] as { content: number[] };
  const buffer = new Uint8Array(content.content);
  return JSZip.loadAsync(buffer);
}

describe("ODT Mermaid diagram export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderMermaidSvgForExport.mockResolvedValue(MERMAID_SVG);
  });

  beforeAll(() => {
    // Nothing to register — the exporter path is driven by fence tokens.
  });

  it("embeds a mermaid fence as a vector SVG image by default", async () => {
    const zip = await runOdtExport(`\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\``);
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).not.toContain("Preformatted_20_Text");
    expect(mockRenderMermaidSvgForExport).toHaveBeenCalledWith(
      `${MERMAID_SRC}\n`,
    );
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("stores the SVG under Pictures/ in the package", async () => {
    const zip = await runOdtExport(`\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\``);
    const names = Object.keys(zip.files);
    expect(
      names.some((n) => n.startsWith("Pictures/") && n.endsWith(".svg")),
    ).toBe(true);
  });

  it("rasterizes mermaid as PNG when the shared SVG/diagram option is on", async () => {
    const zip = await runOdtExport(`\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\``, {
      "odt.rasterizeSvg": true,
      "odt.rasterResolution": 2,
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(xml).not.toContain('draw:mime-type="image/svg+xml"');
    expect(mockRasterizeSvg).toHaveBeenCalledWith(MERMAID_SVG, 320, 160, 2);
  });

  it("fits wide diagrams to the ODT page content width", async () => {
    mockRenderMermaidSvgForExport.mockResolvedValue(WIDE_MERMAID_SVG);
    const zip = await runOdtExport(`\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\``, {
      "odt.rasterizeSvg": true,
      "odt.rasterResolution": 1,
    });
    // Page content width is 600px; 1200×400 scales to 600×200.
    expect(mockRasterizeSvg).toHaveBeenCalledWith(
      WIDE_MERMAID_SVG,
      600,
      200,
      1,
    );
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('svg:width="6.2500in"');
    expect(xml).toContain('svg:height="2.0833in"');
  });

  it("falls back to source code when Mermaid rendering fails", async () => {
    mockRenderMermaidSvgForExport.mockRejectedValue(new Error("bad diagram"));
    const zip = await runOdtExport(`\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\``, {
      "odt.rasterizeSvg": true,
    });
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(xml).not.toContain("<draw:image");
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
  });

  it("keeps other fenced code blocks as source", async () => {
    const zip = await runOdtExport("```js\nconst x = 1;\n```");
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("Preformatted_20_Text");
    expect(mockRenderMermaidSvgForExport).not.toHaveBeenCalled();
  });

  it("embeds each mermaid fence as its own image", async () => {
    const src = `\`\`\`mermaid\n${MERMAID_SRC}\n\`\`\`\n\n\`\`\`mermaid\ngraph TB\n    C-->D\n\`\`\``;
    mockRenderMermaidSvgForExport.mockResolvedValue(MERMAID_SVG);
    const zip = await runOdtExport(src);
    expect(mockRenderMermaidSvgForExport).toHaveBeenCalledTimes(2);
    const xml = await zip.file("content.xml")!.async("text");
    const frames = xml.match(/<draw:frame/g) ?? [];
    expect(frames.length).toBe(2);
  });

  it("names the option group to cover Mermaid diagrams", () => {
    const groups = odtOptionGroups({
      markdown: "",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: [],
    });
    const svgGroup = groups.find((g) => g.id === "svg");
    expect(svgGroup?.label).toBe("SVG images & Mermaid diagrams");
    expect(svgGroup?.options[0].hint).toMatch(/Mermaid diagrams/);
  });
});
