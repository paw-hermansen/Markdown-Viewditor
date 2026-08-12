import { describe, it, expect, vi, beforeEach } from "vitest";

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
        .replace(/>/g, "&gt;"),
    })),
    highlightAuto: vi.fn((code: string) => ({
      value: code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    })),
  },
}));

import JSZip from "jszip";
import katex from "katex";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import vscodeKatex from "@vscode/markdown-it-katex";
import mathBracketsPlugin from "$lib/utils/math-brackets";
import { odtExporter } from "../exporters/odt";
import type { ExportContext } from "../types";

function makeTokens(src: string) {
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
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

async function runOdtExport(src: string, fileName = "test") {
  const tokens = makeTokens(src);
  const md = new MarkdownIt({ html: true }).use(footnote).use(taskLists);
  const html = md.render(src);
  const ctx: ExportContext = {
    markdown: src,
    html,
    frontmatter: null,
    fileName,
    tokens,
  };
  return odtExporter.export(ctx);
}

async function getContentXml(src: string): Promise<string> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(save).mockResolvedValue("/tmp/test.odt");
  vi.mocked(invoke).mockResolvedValue(undefined);
  await runOdtExport(src);
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
    expect(odtExporter.themeCapable).toBe(false);
    expect(odtExporter.label).toContain("ODT");
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
      markdown:
        "$$\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}$$",
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
});
