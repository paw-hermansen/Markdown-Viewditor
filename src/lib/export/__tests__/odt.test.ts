import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the rasterization helpers so tests don't need a real DOM/canvas.
// Tests that exercise rasterization override these with their own behavior.
const { mockRasterizeSvg, mockRenderMathToPng } = vi.hoisted(() => ({
  mockRasterizeSvg: vi.fn(async () => new Uint8Array([1, 2, 3])),
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

// Pull the mocked fileState so tests can override per-test settings
// (e.g. simulating an editor with a file open for relative-path
// resolution).
import { fileState } from "$lib/stores/file.svelte";
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
    renderMathToPng: mockRenderMathToPng,
    MATH_HOST_WIDTH_PX: 600,
  };
});

import JSZip from "jszip";
import katex from "katex";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import vscodeKatex from "@vscode/markdown-it-katex";
import mark from "markdown-it-mark";
import mathBracketsPlugin from "$lib/utils/math-brackets";
import { odtExporter } from "../exporters/odt";
import type { ExportContext } from "../types";

function makeTokens(src: string) {
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  return md.parse(src, {});
}

function makeMarkTokens(src: string) {
  const md = new MarkdownIt({ html: true })
    .use(footnote)
    .use(taskLists)
    .use(mark);
  return md.parse(src, {});
}

function makeMathTokens(src: string) {
  const md = new MarkdownIt({ html: true })
    .use(footnote)
    .use(taskLists)
    .use(vscodeKatex, {
      katex,
      throwOnError: false,
      enableBareBlocks: true,
      enableFencedBlocks: true,
    })
    .use(mathBracketsPlugin);
  return md.parse(src, {});
}

async function runOdtExport(
  src: string,
  fileName = "test",
  options?: Record<string, unknown>,
) {
  const tokens = makeTokens(src);
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  const html = md.render(src);
  const ctx: ExportContext = {
    markdown: src,
    html,
    frontmatter: null,
    fileName,
    tokens,
    options,
  };
  return odtExporter.export(ctx);
}

async function runOdtExportWithMark(
  src: string,
  fileName = "test",
  options?: Record<string, unknown>,
) {
  const tokens = makeMarkTokens(src);
  const md = new MarkdownIt({ html: true })
    .use(footnote)
    .use(taskLists)
    .use(mark);
  const html = md.render(src);
  const ctx: ExportContext = {
    markdown: src,
    html,
    frontmatter: null,
    fileName,
    tokens,
    options,
  };
  return odtExporter.export(ctx);
}

async function runOdtExportWithMath(
  src: string,
  options?: Record<string, unknown>,
) {
  const tokens = makeMathTokens(src);
  const md = new MarkdownIt({ html: true })
    .use(footnote)
    .use(taskLists)
    .use(vscodeKatex, {
      katex,
      throwOnError: false,
      enableBareBlocks: true,
      enableFencedBlocks: true,
    })
    .use(mathBracketsPlugin);
  const html = md.render(src);
  const ctx: ExportContext = {
    markdown: src,
    html,
    frontmatter: null,
    fileName: "test",
    tokens,
    options,
  };
  return odtExporter.export(ctx);
}

async function getContentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await runOdtExport(src, "test", options);
  const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
  const buffer = new Uint8Array(content.content);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("content.xml")!.async("text");
}

async function getContentXmlWithMark(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await runOdtExportWithMark(src, "test", options);
  const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
  const buffer = new Uint8Array(content.content);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("content.xml")!.async("text");
}

/**
 * Return the list of file paths inside the exported ODT ZIP.
 * `readStubs` (optional) maps additional `invoke` commands to canned
 * responses — used by tests that hit the relative-path branch in
 * `resolveImage` which calls `read_file_as_base64`.
 */
async function getZipFileList(
  src: string,
  options?: Record<string, unknown>,
  readStubs?: Record<string, unknown>,
): Promise<string[]> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd) => {
    if (readStubs && cmd in readStubs) return readStubs[cmd];
    return undefined;
  });
  await runOdtExport(src, "test", options);
  // The ODT exporter writes via `write_file_binary`; find that call
  // regardless of any earlier `read_file_as_base64` etc.
  const writeCall = vi
    .mocked(invoke)
    .mock.calls.find((call) => call[0] === "write_file_binary");
  if (!writeCall) throw new Error("write_file_binary was never invoked");
  const args = writeCall[1] as { content: number[] };
  const buffer = new Uint8Array(args.content);
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files);
}

async function getMathContentXml(
  src: string,
  options?: Record<string, unknown>,
): Promise<string> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await runOdtExportWithMath(src, options);
  const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
  const buffer = new Uint8Array(content.content);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("content.xml")!.async("text");
}

async function getStylesXml(src: string): Promise<string> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await runOdtExport(src);
  const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
  const buffer = new Uint8Array(content.content);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("styles.xml")!.async("text");
}

describe("odtExporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(odtExporter.id).toBe("odt");
    expect(odtExporter.extension).toBe("odt");
    // ODT now goes through the confirmation dialog to surface its
    // per-export options (themeCapable = true even though it ignores the
    // viewer's theme).
    expect(odtExporter.themeCapable).toBe(true);
    expect(odtExporter.label).toBe("Export as ODT");
  });

  it("declares three option groups", () => {
    const groups =
      odtExporter.optionGroups?.({
        markdown: "",
        html: "",
        frontmatter: null,
        fileName: "test",
        tokens: [],
      }) ?? [];
    expect(groups.length).toBe(4);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Frontmatter");
    expect(labels).toContain("Math formulas");
    expect(labels).toContain("SVG images");
    expect(labels).toContain("Image resolution");
  });

  it("disables resolution option when neither rasterization is on", () => {
    const groups =
      odtExporter.optionGroups?.({
        markdown: "",
        html: "",
        frontmatter: null,
        fileName: "test",
        tokens: [],
      }) ?? [];
    const resolutionGroup = groups.find((g) => g.label === "Image resolution");
    const resolutionOpt = resolutionGroup?.options[0];
    expect(resolutionOpt?.disabledWhen?.({})).toBe(true);
    expect(
      resolutionOpt?.disabledWhen?.({
        "odt.rasterizeMath": true,
        "odt.rasterizeSvg": false,
      }),
    ).toBe(false);
  });

  it("returns empty warnings when user cancels save dialog", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(save).mockResolvedValue(null);
    const result = await runOdtExport("# Hello");
    expect(result.warnings).toEqual([]);
    expect(result.savedPath).toBeUndefined();
  });

  it("produces a valid ZIP with correct structure", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    const result = await runOdtExport("# Hello World");
    expect(result.savedPath).toBe("/tmp/test.odt");
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    expect(zip.file("mimetype")).not.toBeNull();
    expect(zip.file("content.xml")).not.toBeNull();
    expect(zip.file("styles.xml")).not.toBeNull();
    expect(zip.file("meta.xml")).not.toBeNull();
    expect(zip.file("META-INF/manifest.xml")).not.toBeNull();
  });

  it("mimetype is correct", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await runOdtExport("hello");
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    expect(await zip.file("mimetype")!.async("text")).toBe(
      "application/vnd.oasis.opendocument.text",
    );
  });

  it("content.xml is well-formed XML", async () => {
    const xml = await getContentXml("Hello world");
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain("<office:document-content");
    expect(xml).toContain("</office:document-content>");
  });

  it("headings produce correct ODF heading elements", async () => {
    const xml = await getContentXml("# Title\n## Sub\n### Subsub");
    expect(xml).toContain("Heading_20_1");
    expect(xml).toContain("Heading_20_2");
    expect(xml).toContain("Heading_20_3");
  });

  it("paragraphs produce Text_20_body style", async () => {
    const xml = await getContentXml("Hello world");
    expect(xml).toContain('text:style-name="Text_20_body"');
    expect(xml).toContain("Hello world");
  });

  it("bold text uses combined style", async () => {
    const xml = await getContentXml("some **bold** text");
    expect(xml).toContain("bold");
  });

  it("italic text uses combined style", async () => {
    const xml = await getContentXml("some *italic* text");
    expect(xml).toContain("italic");
  });

  it("strikethrough uses correct ODF text-line-through attributes", async () => {
    const xml = await getContentXml("~~deleted~~");
    expect(xml).toContain("deleted");
    expect(xml).toContain('text:style-name="Char_S"');
  });

  it("bold+italic+strikethrough combined style", async () => {
    const xml = await getContentXml("***~~all~~***");
    expect(xml).toContain("all");
    expect(xml).toContain('text:style-name="Char_BIS"');
  });

  it("code inline uses T4 auto-style", async () => {
    const xml = await getContentXml("use `console.log`");
    expect(xml).toContain('text:style-name="T4"');
    expect(xml).toContain("console.log");
  });

  it("raw HTML <mark> uses T_mark highlight style", async () => {
    const xml = await getContentXml("this is <mark>highlighted</mark> text");
    expect(xml).toContain('text:style-name="T_mark"');
    expect(xml).toContain("highlighted");
  });

  it("==highlight== syntax uses T_mark highlight style", async () => {
    const xml = await getContentXmlWithMark("this is ==highlighted== text");
    expect(xml).toContain('text:style-name="T_mark"');
    expect(xml).toContain("highlighted");
  });

  it("T_mark style is defined in styles.xml", async () => {
    const xml = await getStylesXml("hello");
    expect(xml).toContain('style:name="T_mark"');
    expect(xml).toContain("#fff8c5");
  });

  it("bullet list uses BulletList style", async () => {
    const xml = await getContentXml("- item 1\n- item 2");
    expect(xml).toContain('text:style-name="BulletList"');
    expect(xml).toContain("<text:list-item");
    expect(xml).toContain("item 1");
    expect(xml).toContain("item 2");
  });

  it("ordered list uses NumberList style", async () => {
    const xml = await getContentXml("1. first\n2. second");
    expect(xml).toContain('text:style-name="NumberList"');
    expect(xml).toContain("<text:list-item");
    expect(xml).toContain("first");
    expect(xml).toContain("second");
  });

  it("table has correct column count", async () => {
    const xml = await getContentXml(
      "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |",
    );
    expect(xml).toContain("<table:table>");
    const colCount = (xml.match(/<table:table-column\/>/g) || []).length;
    expect(colCount).toBe(3);
    expect(xml).toContain("A");
    expect(xml).toContain("1");
  });

  it("code blocks use Preformatted_20_Text style", async () => {
    const xml = await getContentXml("```js\nconst x = 1;\n```");
    expect(xml).toContain('text:style-name="Preformatted_20_Text"');
    expect(xml).toContain("const x = 1");
  });

  it("fenced code blocks preserve leading indentation", async () => {
    const xml = await getContentXml(
      "```js\nfunction foo() {\n  return 1;\n}\n```",
    );
    expect(xml).toContain('<text:s text:c="2"/>');
    expect(xml).toContain("return 1;");
  });

  it("indented code blocks preserve leading indentation", async () => {
    // markdown-it strips the 4-space indent syntax, leaving internal indentation
    const xml = await getContentXml(
      "    function foo() {\n      return 1;\n    }",
    );
    expect(xml).toContain('<text:s text:c="2"/>');
    expect(xml).toContain("return 1;");
  });

  it("code blocks with special characters decode HTML entities", async () => {
    const xml = await getContentXml('```js\nconst x = "hello";\n```');
    // The double quote should appear as &quot; in XML (proper escaping),
    // not as &amp;quot; (double-escaped entity)
    expect(xml).toContain("&quot;hello&quot;");
    expect(xml).not.toContain("&amp;quot;");
  });

  it("code blocks with angle brackets decode HTML entities", async () => {
    const xml = await getContentXml(
      '```html\n<div class="test">content</div>\n```',
    );
    expect(xml).toContain("&lt;div");
    expect(xml).toContain("&gt;content&lt;/div&gt;");
    // Should NOT have double-encoded entities
    expect(xml).not.toContain("&amp;lt;");
    expect(xml).not.toContain("&amp;gt;");
  });

  it("code blocks with ampersand decode HTML entities", async () => {
    const xml = await getContentXml("```js\nconst x = a && b;\n```");
    expect(xml).toContain("&amp;&amp;");
    expect(xml).not.toContain("&amp;amp;");
  });

  it("code blocks with apostrophe decode HTML entities", async () => {
    const xml = await getContentXml("```js\nconst x = 'hello';\n```");
    expect(xml).toContain("&apos;hello&apos;");
    expect(xml).not.toContain("&#x27;");
    expect(xml).not.toContain("&amp;apos;");
  });

  it("links use T_link auto-style with xlink:href", async () => {
    const xml = await getContentXml("[click](https://example.com)");
    expect(xml).toContain('xlink:href="https://example.com"');
    expect(xml).toContain("click");
  });

  it("meta.xml contains document title", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await runOdtExport("# Hello", "my-doc");
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    expect(await zip.file("meta.xml")!.async("text")).toContain("my-doc");
  });

  it("empty document produces valid XML", async () => {
    const xml = await getContentXml("");
    expect(xml).toContain("<office:body>");
    expect(xml).toContain("</office:body>");
  });

  it("styles.xml contains all named styles", async () => {
    const styles = await getStylesXml("# Hello");
    expect(styles).toContain("Heading_20_1");
    expect(styles).toContain("Text_20_body");
    expect(styles).toContain("Preformatted_20_Text");
    expect(styles).toContain("BulletList");
    expect(styles).toContain("NumberList");
    expect(styles).toContain("TaskList");
    expect(styles).toContain("Blockquote");
    expect(styles).toContain("QuoteTable");
    expect(styles).toContain("QuoteTableCell");
    expect(styles).toContain("QuoteList_20_1");
  });

  it("styles.xml Preformatted_20_Text has no-wrap for whitespace preservation", async () => {
    const styles = await getStylesXml("# Hello");
    expect(styles).toContain('fo:wrap-option="no-wrap"');
  });

  it("blockquote wraps content in Blockquote-styled paragraphs", async () => {
    const xml = await getContentXml("> A quoted passage");
    expect(xml).toContain("Blockquote");
    expect(xml).toContain("A quoted passage");
  });

  it("hard break produces text:line-break", async () => {
    const xml = await getContentXml("line1  \nline2");
    expect(xml).toContain("<text:line-break/>");
  });

  it("horizontal rule uses Horizontal_20_Rule style", async () => {
    const xml = await getContentXml("---");
    expect(xml).toContain("Horizontal_20_Rule");
  });

  it("blockquote with multiple paragraphs", async () => {
    const xml = await getContentXml("> line one\n>\n> line two");
    expect(xml).toContain("Blockquote");
    expect(xml).toContain("line one");
    expect(xml).toContain("line two");
  });

  it("consecutive blockquotes are separated by a spacer paragraph", async () => {
    const xml = await getContentXml(
      "> first blockquote\n\n> second blockquote",
    );
    expect(xml).toContain("first blockquote");
    expect(xml).toContain("second blockquote");
    // A Standard (unbordered) paragraph separates the two blockquotes
    // to break the visual border continuity
    const afterFirst = xml.split("first blockquote")[1];
    expect(afterFirst).toContain('text:style-name="Standard"');
    expect(afterFirst).toContain("<text:s/>");
    expect(afterFirst).toContain("second blockquote");
  });

  it("paragraphs within a single blockquote do not get a spacer", async () => {
    const xml = await getContentXml("> line one\n>\n> line two");
    const between = xml.substring(
      xml.indexOf("line one"),
      xml.indexOf("line two"),
    );
    // No Standard paragraph with text:s/ between paragraphs of the same blockquote
    const spacerCount = (between.match(/text:style-name="Standard"/g) || [])
      .length;
    expect(spacerCount).toBe(0);
  });

  it("blockquote containing a bullet list applies quote style to list items", async () => {
    const xml = await getContentXml(
      "> This block quote has a list\n> - row 1\n> - row 2\n> - row 3",
    );
    expect(xml).toContain("Blockquote_20_1");
    expect(xml).toContain("BulletList");
    expect(xml).toContain("This block quote has a list");
    expect(xml).toContain("row 1");
    expect(xml).toContain("row 2");
    expect(xml).toContain("row 3");
    // List items inside the blockquote should use the quote style
    const listItemBlock = xml.match(
      /<text:list-item>[\s\S]*?<text:p text:style-name="(.*?)">.*?row 1/,
    );
    expect(listItemBlock).not.toBeNull();
    expect(listItemBlock![1]).toContain("QuoteList_20_1");
  });

  it("blockquote containing an ordered list applies quote style", async () => {
    const xml = await getContentXml(
      "> Steps to reproduce\n> 1. first step\n> 2. second step",
    );
    expect(xml).toContain("Blockquote_20_1");
    expect(xml).toContain("NumberList");
  });

  it("blockquote containing a task list applies quote style", async () => {
    const xml = await getContentXml(
      "> TODO\n> - [ ] task one\n> - [x] task two",
    );
    expect(xml).toContain("Blockquote_20_1");
    expect(xml).toContain("TaskList");
    expect(xml).toContain("\u2610");
    expect(xml).toContain("\u2611");
  });

  it("deeply nested blockquotes with a list apply correct depth", async () => {
    const xml = await getContentXml("> > - deeply nested item");
    expect(xml).toContain("QuoteList_20_2");
    expect(xml).toContain("BulletList");
  });

  it("regular lists not inside blockquote still use Standard style", async () => {
    const xml = await getContentXml("- plain list item");
    const listItemMatch = xml.match(
      /<text:list-item>[\s\S]*?<text:p text:style-name="(.*?)">plain list item/,
    );
    expect(listItemMatch).not.toBeNull();
    expect(listItemMatch![1]).toBe("Standard");
  });

  it("nested lists produce nested text:list elements", async () => {
    const xml = await getContentXml("- a\n  - b\n- c");
    expect(xml).toContain('text:style-name="BulletList"');
    expect(xml).toContain("<text:list-item");
    expect(xml).toContain("a");
    expect(xml).toContain("b");
    expect(xml).toContain("c");
    // Nested list should be inside a list-item, not a sibling
    expect(xml).toMatch(
      /<text:list-item>[\s\S]*<text:list[\s\S]*<\/text:list>[\s\S]*<\/text:list-item>/,
    );
  });

  it("mixed nested lists use correct styles for each type", async () => {
    const xml = await getContentXml(
      "- bullet1\n  1. ordered1\n     - nested-bullet\n       1. nested-ordered",
    );
    expect(xml).toContain('text:style-name="BulletList"');
    expect(xml).toContain('text:style-name="NumberList"');
    expect(xml).toContain("bullet1");
    expect(xml).toContain("ordered1");
    expect(xml).toContain("nested-bullet");
    expect(xml).toContain("nested-ordered");
  });

  it("task list nested inside bullet list uses TaskList style", async () => {
    const xml = await getContentXml("- item\n  - [ ] task1\n  - [x] task2");
    expect(xml).toContain('text:style-name="TaskList"');
    expect(xml).toContain("\u2610");
    expect(xml).toContain("\u2611");
  });

  it("task list items have exactly one checkbox (no raw HTML input)", async () => {
    const xml = await getContentXml("- [ ] unchecked\n- [x] checked");
    const uncheckedMatches = xml.match(/\u2610/g) || [];
    const checkedMatches = xml.match(/\u2611/g) || [];
    expect(uncheckedMatches.length).toBe(1);
    expect(checkedMatches.length).toBe(1);
    expect(xml).not.toContain("<input");

    const styles = await getStylesXml("- [ ] unchecked\n- [x] checked");
    expect(styles).not.toContain("\u2610");
    expect(styles).not.toContain("\u2611");
  });

  it("table with two columns has two table-column elements", async () => {
    const xml = await getContentXml("| X | Y |\n|---|---|\n| 1 | 2 |");
    expect((xml.match(/<table:table-column\/>/g) || []).length).toBe(2);
  });

  it("document with only frontmatter is valid", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    const tokens = makeTokens("some text");
    const md = new MarkdownIt({ html: true }).use(footnote);
    const ctx: ExportContext = {
      markdown: "some text",
      html: md.render("some text"),
      frontmatter: { name: "My Doc" },
      fileName: "test",
      tokens,
    };
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    expect(await zip.file("meta.xml")!.async("text")).toContain("My Doc");
  });

  it("footnote includes text content in note body", async () => {
    const xml = await getContentXml(
      "Hello[^1]\n\n[^1]: This is the footnote text.",
    );
    expect(xml).toContain("footnote");
    expect(xml).toContain("text:note-citation");
    expect(xml).toContain("text:note-body");
    expect(xml).toContain("This is the footnote text.");
  });

  it("multiple footnotes each include their text", async () => {
    const xml = await getContentXml(
      "Hello[^1] and bye[^2]\n\n[^1]: First note\n\n[^2]: Second note.",
    );
    expect(xml).toContain("First note");
    expect(xml).toContain("Second note.");
  });

  it("footnote with formatted text preserves formatting", async () => {
    const xml = await getContentXml(
      "Text[^1]\n\n[^1]: A note with **bold** and *italic*.",
    );
    expect(xml).toContain("A note with");
    expect(xml).toContain("bold");
    expect(xml).toContain("italic");
  });

  it("embeds single-line inline SVG as draw:image", async () => {
    const xml = await getContentXml(
      '<svg width="128" height="64"><circle cx="64" cy="32" r="30"/></svg>',
    );
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:image");
    expect(xml).toContain('xlink:href="Pictures/image1.svg"');
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).toContain('svg:width="1.3333in"');
    expect(xml).toContain('svg:height="0.6667in"');
  });

  it("embeds multi-line inline SVG as draw:image", async () => {
    const svgMd = `<svg width="128" height="64" viewBox="0 0 128 64">
  <circle cx="64" cy="32" r="30" fill="red"/>
</svg>`;
    const xml = await getContentXml(svgMd);
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:image");
    expect(xml).toContain('xlink:href="Pictures/image1.svg"');
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).toContain('svg:width="1.3333in"');
    expect(xml).toContain('svg:height="0.6667in"');
  });

  it("embeds SVG in a list item with br tag before it", async () => {
    const svgMd = `- SVG<br/>
  <svg width="150" height="60" viewBox="0 30 100 40">
    <ellipse cx="50" cy="50" rx="35" ry="20" fill="#4fd1ff"/>
  </svg>`;
    const xml = await getContentXml(svgMd);
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:image");
    expect(xml).toContain('xlink:href="Pictures/image1.svg"');
    expect(xml).not.toContain("&lt;svg");
  });

  it("embeds SVG inside a bullet list", async () => {
    const svgMd = `Before list
- <svg width="100" height="50"><rect width="100" height="50" fill="blue"/></svg>
After list`;
    const xml = await getContentXml(svgMd);
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
    expect(xml).not.toContain("&lt;svg");
  });

  it("does not embed non-SVG text starting with svg", async () => {
    const xml = await getContentXml("svgs are vector graphics");
    expect(xml).not.toContain("<draw:frame");
    expect(xml).toContain("svgs are vector graphics");
  });

  it("packs SVG files into ZIP", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await runOdtExport(
      '<svg width="128" height="128"><circle cx="64" cy="64" r="40"/></svg>',
    );
    const content = vi.mocked(invoke).mock.calls[0][1] as {
      content: number[];
    };
    const buffer = new Uint8Array(content.content);
    const zip = await JSZip.loadAsync(buffer);
    const svgFile = zip.file("Pictures/image1.svg");
    expect(svgFile).not.toBeNull();
    const svgContent = await svgFile!.async("text");
    expect(svgContent).toContain("<svg");
    expect(svgContent).toContain("</svg>");
  });

  it("puts SVG in manifest with correct media type", async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await runOdtExport(
      '<svg width="128" height="128"><circle cx="64" cy="64" r="40"/></svg>',
    );
    const content = vi.mocked(invoke).mock.calls[0][1] as {
      content: number[];
    };
    const buffer = new Uint8Array(content.content);
    const zip = await JSZip.loadAsync(buffer);
    const manifest = await zip.file("META-INF/manifest.xml")!.async("text");
    expect(manifest).toContain('media-type="image/svg+xml"');
  });

  // ── Math (KaTeX → ODF formula sub-packages) ──

  it("embeds inline math $x^2$ as draw:object in content.xml", async () => {
    const ctx: ExportContext = {
      markdown: "$x^2$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$x^2$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:object");
  });

  it("embeds display math $$\\int x dx$$ as draw:object in content.xml", async () => {
    const ctx: ExportContext = {
      markdown: "$$\n\\int x dx\n$$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$$\n\\int x dx\n$$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:object");
  });

  it("centers native MathML block formulas with Math_20_Display style", async () => {
    const ctx: ExportContext = {
      markdown: "$$\nx^2\n$$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$$\nx^2\n$$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(/<text:p[^>]*text:style-name="Math_20_Display"/);
    expect(xml).not.toMatch(
      /<text:p[^>]*text:style-name="Text_20_body"[^>]*>[^<]*<draw:frame[^>]*<draw:object/,
    );
  });

  it("does not center native MathML inline formulas", async () => {
    const ctx: ExportContext = {
      markdown: "inline $x^2$ math",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("inline $x^2$ math"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).not.toContain('text:style-name="Math_20_Display"');
    expect(xml).toContain('text:style-name="Text_20_body"');
  });

  it("uses Formula graphic style for native MathML objects", async () => {
    const ctx: ExportContext = {
      markdown: "$x^2$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$x^2$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain('draw:style-name="Formula"');
    expect(xml).toContain("<draw:object");
    // Must NOT use fr1 for MathML objects
    expect(xml).not.toMatch(/draw:style-name="fr1"[^>]*<draw:object/);
  });

  it("creates MathML sub-packages for math formulas", async () => {
    const ctx: ExportContext = {
      markdown: "$x^2$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$x^2$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).toContain("msup");
  });

  it("registers formula sub-packages in manifest", async () => {
    const ctx: ExportContext = {
      markdown: "$x^2$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$x^2$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const manifest = await zip.file("META-INF/manifest.xml")!.async("text");
    expect(manifest).toContain(
      'media-type="application/vnd.oasis.opendocument.formula"',
    );
  });

  it("embeds fenced math block ```math ... ``` as draw:object in content.xml", async () => {
    const ctx: ExportContext = {
      markdown: "```math\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n```",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens(
        "```math\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n```",
      ),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toContain("<draw:frame");
    expect(xml).toContain("<draw:object");
    // Must NOT render as preformatted code
    expect(xml).not.toContain("Preformatted_20_Text");
    expect(xml).not.toContain("sum_");
  });

  it("centers native MathML fenced math blocks with Math_20_Display style", async () => {
    const ctx: ExportContext = {
      markdown: "```math\nx^2\n```",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("```math\nx^2\n```"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(xml).toMatch(/<text:p[^>]*text:style-name="Math_20_Display"/);
    expect(xml).toContain('draw:style-name="Formula"');
    expect(xml).toContain("<draw:object");
  });

  it("creates MathML sub-packages for fenced math blocks", async () => {
    const ctx: ExportContext = {
      markdown: "```math\nx^2\n```",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("```math\nx^2\n```"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).toContain("msup");
  });

  it("rasterizes fenced math blocks as PNG when rasterizeMath is on", async () => {
    const ctx: ExportContext = {
      markdown: "```math\nx^2\n```",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("```math\nx^2\n```"),
      options: {
        "odt.rasterizeMath": true,
        "odt.rasterResolution": 2,
      },
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const xml = await zip.file("content.xml")!.async("text");
    expect(mockRenderMathToPng).toHaveBeenCalled();
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(xml).not.toContain("<draw:object");
  });

  it("renders \\ce{H2O} as valid MathML (mhchem)", async () => {
    const ctx: ExportContext = {
      markdown: "$\\ce{H2O}$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$\\ce{H2O}$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).not.toContain("katex-error");
  });

  it("renders Zeise salt as valid MathML with sanitization", async () => {
    const ctx: ExportContext = {
      markdown: "$\\ce{[Pt(\\eta^2-C2H4)Cl3]-}$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$\\ce{[Pt(\\eta^2-C2H4)Cl3]-}$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).not.toContain("katex-error");
    expect(mathXml).not.toContain("<mphantom>");
    expect(mathXml).toContain("<mrow/>");
  });

  it("renders \\ce{Zn^2+} with trailing + fix for LibreOffice", async () => {
    const ctx: ExportContext = {
      markdown: "$$\\ce{Zn^2+}$$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens("$$\\ce{Zn^2+}$$"),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).not.toContain("katex-error");
    expect(mathXml).not.toContain("<mphantom>");
    // Trailing + must have <mrow/> appended for LibreOffice
    expect(mathXml).toMatch(/<mo[^>]*>\+<\/mo><mrow\/><\/mrow>/);
  });

  it("sanitizes MathML for \\ce with nested \\underset", async () => {
    const ctx: ExportContext = {
      markdown: "$$\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}$$",
      html: "",
      frontmatter: null,
      fileName: "test",
      tokens: makeMathTokens(
        "$$\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}$$",
      ),
    };
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/test.odt");
    vi.mocked(invoke).mockResolvedValue(undefined);
    await odtExporter.export(ctx);
    const content = vi.mocked(invoke).mock.calls[0][1] as { content: number[] };
    const zip = await JSZip.loadAsync(new Uint8Array(content.content));
    const mathXml = await zip.file("Object 1/content.xml")!.async("text");
    expect(mathXml).toContain("<math");
    expect(mathXml).toContain("</math>");
    expect(mathXml).not.toContain("katex-error");
    expect(mathXml).toContain("<munder>");
    expect(mathXml).toContain("<mtext>label</mtext>");
    expect(mathXml).not.toMatch(/<\/munder>\s*<\/mi>/);
    expect(mathXml).not.toContain("<mphantom>");
    expect(mathXml).toContain("<mrow/>");
  });

  it("deduplicates draw:name for images sharing the same alt text", async () => {
    // Minimal valid 1x1 PNG data URI.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
      "Nl7BcQAAAABJRU5ErkJggg==";
    const src = `data:image/png;base64,${png}`;
    const xml = await getContentXml(
      `![photo](${src}) ![photo](${src}) ![photo](${src})`,
    );
    // First occurrence keeps the base name, subsequent ones get _2, _3.
    expect(xml).toContain('draw:name="photo"');
    expect(xml).toContain('draw:name="photo_2"');
    expect(xml).toContain('draw:name="photo_3"');
    // No bare duplicate should remain.
    const matches = xml.match(/draw:name="photo"/g);
    expect(matches).toHaveLength(1);
  });

  it("deduplicates draw:name for HTML img tags with the same alt", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
      "Nl7BcQAAAABJRU5ErkJggg==";
    const src = `data:image/png;base64,${png}`;
    const xml = await getContentXml(
      `<img src="${src}" alt="icon"/> <img src="${src}" alt="icon"/>`,
    );
    expect(xml).toContain('draw:name="icon"');
    expect(xml).toContain('draw:name="icon_2"');
    const matches = xml.match(/draw:name="icon"/g);
    expect(matches).toHaveLength(1);
  });

  it("uses distinct draw:name for images with different alt text", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
      "Nl7BcQAAAABJRU5ErkJggg==";
    const src = `data:image/png;base64,${png}`;
    const xml = await getContentXml(`![first](${src}) ![second](${src})`);
    expect(xml).toContain('draw:name="first"');
    expect(xml).toContain('draw:name="second"');
    // Neither should have a suffix.
    expect(xml).not.toContain('draw:name="first_2"');
    expect(xml).not.toContain('draw:name="second_2"');
  });

  it("falls back to 'image' base name for empty alt text and deduplicates", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
      "Nl7BcQAAAABJRU5ErkJggg==";
    const src = `data:image/png;base64,${png}`;
    // Markdown images with empty alt: ![](src)
    const xml = await getContentXml(`![](${src}) ![](${src})`);
    expect(xml).toContain('draw:name="image"');
    expect(xml).toContain('draw:name="image_2"');
    const matches = xml.match(/draw:name="image"/g);
    expect(matches).toHaveLength(1);
  });
});

describe("ODT rasterization options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRasterizeSvg.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockRenderMathToPng.mockResolvedValue({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 64,
      heightPx: 24,
    });
  });

  it("embeds inline SVG as PNG when rasterizeSvg is on", async () => {
    const xml = await getContentXml(
      '<svg width="64" height="32"><rect width="64" height="32" fill="green"/></svg>',
      { "odt.rasterizeSvg": true, "odt.rasterResolution": 1 },
    );
    expect(mockRasterizeSvg).toHaveBeenCalled();
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(xml).not.toContain('draw:mime-type="image/svg+xml"');
    expect(xml).not.toContain("<draw:object");
  });

  it("keeps SVG as vector when rasterizeSvg is off", async () => {
    mockRasterizeSvg.mockClear();
    const xml = await getContentXml(
      '<svg width="64" height="32"><rect width="64" height="32" fill="green"/></svg>',
      { "odt.rasterizeSvg": false },
    );
    expect(mockRasterizeSvg).not.toHaveBeenCalled();
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
  });

  it("rasterizes inline math as PNG when rasterizeMath is on", async () => {
    const xml = await getMathContentXml("$x^2$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 2,
    });
    expect(mockRenderMathToPng).toHaveBeenCalled();
    expect(xml).toContain('draw:mime-type="image/png"');
    expect(xml).not.toContain("<draw:object");
    // Inline math PNG must use the Formula graphic style for
    // vertical centering (style:vertical-pos="middle").
    expect(xml).toContain('draw:style-name="Formula"');
  });

  it("keeps math as MathML when rasterizeMath is off", async () => {
    mockRenderMathToPng.mockClear();
    const xml = await getMathContentXml("$x^2$", {
      "odt.rasterizeMath": false,
    });
    expect(mockRenderMathToPng).not.toHaveBeenCalled();
    expect(xml).toContain("<draw:object");
  });

  it("falls back to MathML when rasterization throws", async () => {
    mockRenderMathToPng.mockRejectedValueOnce(new Error("DOM missing"));
    const xml = await getMathContentXml("$x^2$", {
      "odt.rasterizeMath": true,
    });
    // Falls back to the existing MathML embed path.
    expect(xml).toContain("<draw:object");
  });

  it("falls back to vector SVG when rasterization throws", async () => {
    mockRasterizeSvg.mockRejectedValueOnce(new Error("canvas unavailable"));
    const xml = await getContentXml(
      '<svg width="64" height="32"><rect width="64" height="32" fill="green"/></svg>',
      { "odt.rasterizeSvg": true },
    );
    expect(xml).toContain('draw:mime-type="image/svg+xml"');
  });

  it("rasterizes an <img src=*.svg> when rasterizeSvg is on", async () => {
    const svg =
      '<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="18" fill="blue"/></svg>';
    // btoa is available in jsdom; no Buffer dependency needed.
    const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
    // Wrap in a paragraph so markdown-it emits an inline token (a bare
    // <img> at the start of a block becomes an html_block instead).
    const xml = await getContentXml(`see <img src="${dataUri}" alt="svg"/>`, {
      "odt.rasterizeSvg": true,
    });
    expect(mockRasterizeSvg).toHaveBeenCalled();
    expect(xml).toContain('draw:mime-type="image/png"');
  });

  it("passes the chosen resolution scale to rasterizeSvg", async () => {
    await getContentXml(
      '<svg width="10" height="10"><rect width="10" height="10"/></svg>',
      { "odt.rasterizeSvg": true, "odt.rasterResolution": 3 },
    );
    const args = mockRasterizeSvg.mock.calls[0] as unknown[];
    expect(args[3]).toBe(3); // scale argument
  });

  it("passes the 4× resolution scale to rasterizeSvg", async () => {
    await getContentXml(
      '<svg width="10" height="10"><rect width="10" height="10"/></svg>',
      { "odt.rasterizeSvg": true, "odt.rasterResolution": 4 },
    );
    const args = mockRasterizeSvg.mock.calls[0] as unknown[];
    expect(args[3]).toBe(4); // scale argument
  });

  it("passes the chosen resolution scale to renderMathToPng", async () => {
    await getMathContentXml("$x^2$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 3,
    });
    const args = mockRenderMathToPng.mock.calls[0] as unknown[];
    const opts = args[0] as Record<string, unknown>;
    expect(opts.resolution).toBe(3);
  });

  it("passes the 4× resolution scale to renderMathToPng", async () => {
    await getMathContentXml("$x^2$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 4,
    });
    const args = mockRenderMathToPng.mock.calls[0] as unknown[];
    const opts = args[0] as Record<string, unknown>;
    expect(opts.resolution).toBe(4);
  });

  it("centers the paragraph that wraps a rasterized math block", async () => {
    // Regression: previously the `math_block` rasterized branch reused
    // the body paragraph style, which left `fo:text-align` at the ODF
    // default ("start"/left) — so block math rendered flush left even
    // though the markdown preview centers it. The fix introduces a
    // `Math_20_Display` paragraph style with `fo:text-align="center"`.
    const xml = await getMathContentXml("$$\nx^2\n$$", {
      "odt.rasterizeMath": true,
    });
    // The rasterized frame must sit inside a paragraph whose style is
    // the dedicated display-math style.
    expect(xml).toMatch(/<text:p[^>]*text:style-name="Math_20_Display"/);
    // And the paragraph immediately before/around the PNG frame must
    // NOT be the body paragraph (which would imply the new style
    // wasn't used).
    expect(xml).not.toMatch(
      /<text:p[^>]*text:style-name="Text_20_body"[^>]*>[^<]*<draw:frame[^>]*draw:mime-type="image\/png"/,
    );
    // Confirm the style itself defines centering in styles.xml.
    // styles.xml is built once and doesn't depend on per-content
    // options, so any source works here.
    const styles = await getStylesXml("$$x^2$$");
    expect(styles).toContain('style:name="Math_20_Display"');
    expect(styles).toMatch(
      /<style:style[^>]*style:name="Math_20_Display"[\s\S]*?fo:text-align="center"[\s\S]*?<\/style:style>/,
    );
  });

  it("does not center the paragraph that wraps a rasterized inline formula", async () => {
    // Inline math lives inside the prose text flow; centering its
    // paragraph would misalign the surrounding sentence.
    const xml = await getMathContentXml("inline $x^2$ math", {
      "odt.rasterizeMath": true,
    });
    expect(xml).not.toContain('text:style-name="Math_20_Display"');
  });

  it("captures display math at page-content width so the formula centers and the tag lands at the right page-edge", async () => {
    // Regression: previously the host had no width constraint, so
    // `.katex-display` filled the viewport and `.tag { right: 0 }`
    // landed at the viewport edge — the captured widthPx was ~20 in
    // and ODT consumers either clipped the tag or shrink-to-fit-
    // collapsed it onto the formula. The fix pins the host width to
    // a page-content value (600 px = 6.25 in) so the formula centers
    // within the captured PNG and the tag lands at the right edge of
    // the page.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 600, // = 6.25 in at 96 DPI (page-content width)
      heightPx: 32,
    });
    const xml = await getMathContentXml("$$x^2 \\tag{7.a}$$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 2, // must NOT multiply to 1200
    });
    expect(mockRenderMathToPng).toHaveBeenCalledWith(
      expect.objectContaining({
        tex: expect.stringContaining("\\tag{7.a}"),
        displayMode: true,
        resolution: 2,
        targetFontSize: 11,
      }),
    );
    // Width should be 600/96 = 6.25 in. If the dimension-fix
    // regresses (returns post-scale dimensions or measures viewport)
    // this number balloons.
    expect(xml).toContain('svg:width="6.2500in"');
    expect(xml).toContain('svg:height="0.3333in"');
    // Sanity: must NOT be the page-spanning 20 in the old bug produced.
    expect(xml).not.toMatch(/svg:width="20\./);
    // The frame must sit in a centered paragraph so the page-edge
    // alignment matches the markdown preview.
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Math_20_Display"[^>]*>[\s\S]*?svg:width="6\.2500in"/,
    );
  });

  it("uses fr1 style (not Formula) for rasterized block math PNGs", async () => {
    // Block math PNGs are already centered via the Math_20_Display
    // paragraph style. They should keep fr1 for horizontal centering
    // at the paragraph level, not the Formula style which is for
    // inline vertical centering.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 600,
      heightPx: 32,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
    });
    // The block math PNG frame must use fr1 (horizontal centering),
    // not Formula (vertical centering for inline).
    expect(xml).toMatch(
      /<text:p[^>]*text:style-name="Math_20_Display"[^>]*>[^<]*<draw:frame[^>]*draw:style-name="fr1"/,
    );
  });

  it("does not package the original SVG when rasterizing a markdown image", async () => {
    // The example markdown uses `![svg from a file](./weird.svg)` which
    // goes through resolveImage → invoke.read_file → tryRasterizeSvg.
    // Stub the read so relative-path resolution finds the SVG bytes.
    const svg =
      '<svg width="64" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="64" height="32" fill="green"/></svg>';
    // Pretend the editor has a file open so the relative path resolves.
    fileState.currentFile = "/tmp/example.md";
    try {
      const files = await getZipFileList(
        `![svg](./weird.svg)`,
        { "odt.rasterizeSvg": true },
        { read_file_as_base64: btoa(svg) },
      );
      expect(files.some((f) => f.endsWith(".png"))).toBe(true);
      expect(files.some((f) => f.endsWith(".svg"))).toBe(false);
    } finally {
      fileState.currentFile = null;
    }
  });

  it("does not package the original SVG when rasterizing an <img src=*.svg>", async () => {
    const svg =
      '<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="20" cy="20" r="18" fill="blue"/></svg>';
    const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
    const files = await getZipFileList(
      `see <img src="${dataUri}" alt="svg"/>`,
      {
        "odt.rasterizeSvg": true,
      },
    );
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
    expect(files.some((f) => f.endsWith(".svg"))).toBe(false);
  });

  it("still packages SVGs as vectors when rasterization is off", async () => {
    const svg =
      '<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="40" height="40"/></svg>';
    const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
    const files = await getZipFileList(
      `see <img src="${dataUri}" alt="svg"/>`,
      {
        "odt.rasterizeSvg": false,
      },
    );
    expect(files.some((f) => f.endsWith(".svg"))).toBe(true);
  });

  it("packages the SVG when rasterization fails", async () => {
    // Forcing rasterizeSvg to throw makes the fallback vector embed kick in.
    mockRasterizeSvg.mockRejectedValueOnce(new Error("boom"));
    const svg =
      '<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="40" height="40"/></svg>';
    const dataUri = `data:image/svg+xml;base64,${btoa(svg)}`;
    const files = await getZipFileList(
      `see <img src="${dataUri}" alt="svg"/>`,
      {
        "odt.rasterizeSvg": true,
      },
    );
    expect(files.some((f) => f.endsWith(".svg"))).toBe(true);
    expect(files.some((f) => f.endsWith(".png"))).toBe(false);
  });

  it("scales a wide formula's frame to fit the ODT page-content width", async () => {
    // A formula that returns 800px wide (wider than the 600px page)
    // should be scaled down proportionally.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 800,
      heightPx: 40,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 2,
    });
    // fitScale = 600 / 800 = 0.75
    // frameWidth = 800 * 0.75 = 600 → 600/96 = 6.25 in
    // frameHeight = 40 * 0.75 = 30 → 30/96 = 0.3125 in
    expect(xml).toContain('svg:width="6.2500in"');
    expect(xml).toContain('svg:height="0.3125in"');
  });

  it("does not scale a narrow formula's frame", async () => {
    // A formula that returns 200px wide (narrower than the 600px page)
    // should keep its natural width.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 200,
      heightPx: 30,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 2,
    });
    // 200/96 = 2.0833 in
    expect(xml).toContain('svg:width="2.0833in"');
    expect(xml).toContain('svg:height="0.3125in"');
  });

  it("scales a wide formula's frame height by the same factor as width", async () => {
    // Verify proportional scaling: width and height must use the same
    // fitScale factor.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 1200,
      heightPx: 60,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
    });
    // fitScale = 600 / 1200 = 0.5
    // frameWidth = 1200 * 0.5 = 600 → 6.25 in
    // frameHeight = 60 * 0.5 = 30 → 0.3125 in
    expect(xml).toContain('svg:width="6.2500in"');
    expect(xml).toContain('svg:height="0.3125in"');
  });

  it("applies target-font-size scaling before page fitting", async () => {
    // The mock returns post-target-font-size dimensions (already scaled
    // by the renderer). The page-fit step operates on those logical
    // dimensions. If the renderer returns 800px (already scaled from
    // the host's 16px down to the target font), the page-fit should
    // still cap at 600px.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 800,
      heightPx: 40,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 2,
    });
    // The frame should be fitted to page width.
    expect(xml).toContain('svg:width="6.2500in"');
  });

  it("uses logical dimensions (not bitmap pixels) for page fitting", async () => {
    // The mock returns logical dimensions (post-crop, post-font-scale).
    // The page-fit must use these, not the bitmap pixel count.
    mockRenderMathToPng.mockResolvedValueOnce({
      png: new Uint8Array([1, 2, 3]),
      widthPx: 900,
      heightPx: 45,
    });
    const xml = await getMathContentXml("$$x^2$$", {
      "odt.rasterizeMath": true,
      "odt.rasterResolution": 4,
    });
    // fitScale = 600 / 900 = 0.6667
    // frameWidth = 900 * 0.6667 = 600 → 6.25 in
    // frameHeight = 45 * 0.6667 = 30 → 0.3125 in
    expect(xml).toContain('svg:width="6.2500in"');
    expect(xml).toContain('svg:height="0.3125in"');
  });
});
