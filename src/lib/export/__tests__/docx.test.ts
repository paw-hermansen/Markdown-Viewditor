// @vitest-environment jsdom
/**
 * DOCX exporter — package integrity, the compatibility-contract invariants
 * (EXPORT-PLAN 8.3/8.12), and the markdown → OOXML mapping.
 *
 * The safety core is the integrity suite: relationship ids resolve, media
 * parts exist, style/num/footnote references exist, and every XML part is
 * well-formed. Those invariants are what keep Word from ever showing its
 * "unreadable content" repair prompt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  renderMathToPng: mockRenderMathToPng,
}));

import hljs from "highlight.js";
import { runPrXml } from "../docx/runs";
import {
  exportToZip,
  getDocumentXml,
  getDocumentXmlWithMark,
  getFootnotesXml,
  getNumberingXml,
  getStylesXml,
  getZipFileList,
  runDocxExport,
  zipText,
} from "./docx-harness";

/** 1×1 transparent PNG. */
const PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const REQUIRED_PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/styles.xml",
  "word/numbering.xml",
  "word/footnotes.xml",
  "word/settings.xml",
  "docProps/core.xml",
];

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("docxExporter package integrity", () => {
  it("produces a ZIP with the minimal part set", async () => {
    const entries = await getZipFileList("# Hi");
    for (const part of REQUIRED_PARTS) {
      expect(entries).toContain(part);
    }
  });

  it("every XML part is well-formed", async () => {
    const zip = await exportToZip("# Hi\n\nSome **bold** text.");
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
      const text = await zipText(zip, name);
      const doc = new DOMParser().parseFromString(text, "application/xml");
      expect(
        doc.querySelector("parsererror"),
        `${name} is not well-formed XML`,
      ).toBeNull();
    }
  });

  it("relationship ids resolve and every referenced part exists", async () => {
    const src = `# T\n\n![alt](${PNG_DATA_URI})\n\n[link](https://example.com)`;
    const zip = await exportToZip(src);
    const documentXml = await zipText(zip, "word/document.xml");
    const relsXml = await zipText(zip, "word/_rels/document.xml.rels");

    // Every r:id / r:embed used in the document has a Relationship.
    const used = new Set<string>();
    for (const m of documentXml.matchAll(/r:(?:id|embed)="([^"]+)"/g)) {
      used.add(m[1]);
    }
    const defined = new Set<string>();
    for (const m of relsXml.matchAll(/<Relationship Id="([^"]+)"/g)) {
      defined.add(m[1]);
    }
    for (const id of used) {
      expect(defined.has(id), `dangling relationship ${id}`).toBe(true);
    }

    // Every internal relationship target exists in the package.
    for (const m of relsXml.matchAll(/<Relationship [^>]+\/>/g)) {
      const target = /Target="([^"]+)"/.exec(m[0])?.[1] ?? "";
      if (!m[0].includes('TargetMode="External"')) {
        expect(
          Object.keys(zip.files).includes(`word/${target}`),
          `missing part word/${target}`,
        ).toBe(true);
      }
    }
  });

  it("styles, numbering, and footnote references resolve", async () => {
    const src = `# H\n\n- a\n- b\n\n1. x\n\nnote[^1]\n\n[^1]: body`;
    const zip = await exportToZip(src);
    const documentXml = await zipText(zip, "word/document.xml");
    const stylesXml = await zipText(zip, "word/styles.xml");
    const numberingXml = await zipText(zip, "word/numbering.xml");
    const footnotesXml = await zipText(zip, "word/footnotes.xml");

    for (const m of documentXml.matchAll(/<w:pStyle w:val="([^"]+)"/g)) {
      expect(
        stylesXml.includes(`w:styleId="${m[1]}"`),
        `undefined style ${m[1]}`,
      ).toBe(true);
    }
    for (const m of documentXml.matchAll(/<w:numId w:val="(\d+)"/g)) {
      expect(
        numberingXml.includes(`<w:num w:numId="${m[1]}"`),
        `undefined numId ${m[1]}`,
      ).toBe(true);
    }
    for (const m of documentXml.matchAll(
      /<w:footnoteReference w:id="(\d+)"/g,
    )) {
      expect(
        footnotesXml.includes(`<w:footnote w:id="${m[1]}">`),
        `undefined footnote ${m[1]}`,
      ).toBe(true);
    }
  });

  it("ends the body with an explicit sectPr (rule 8)", async () => {
    const xml = await getDocumentXml("hi");
    expect(xml).toContain("<w:sectPr>");
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(xml.indexOf("<w:sectPr>")).toBeGreaterThan(xml.indexOf("</w:p>"));
    expect(xml.indexOf("</w:sectPr>")).toBeLessThan(xml.indexOf("</w:body>"));
  });

  it("cancelling the save dialog writes nothing", async () => {
    const result = await runDocxExport("hi", { savePath: null });
    expect(result.savedPath).toBeUndefined();
  });

  it("saves via write_file_binary, never write_file", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await runDocxExport("hi", { savePath: "/tmp/out.docx" });
    expect(result.savedPath).toBe("/tmp/out.docx");
    for (const call of vi.mocked(invoke).mock.calls) {
      expect(call[0]).toBe("write_file_binary");
    }
  });
});

describe("docxExporter content mapping", () => {
  it("maps headings to built-in Heading styles with outlineLvl (rule 10)", async () => {
    const xml = await getDocumentXml("# One\n\n## Two\n\n### Three");
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading3"/>');
    const styles = await getStylesXml("# One");
    expect(styles).toContain('<w:outlineLvl w:val="0"/>');
    expect(styles).toContain('<w:outlineLvl w:val="5"/>');
  });

  it("merges adjacent runs with equal properties (rule 16)", async () => {
    const xml = await getDocumentXml("hello world");
    expect(count(xml, "<w:r>")).toBe(1);
  });

  it("emits w:position in schema order before sz (rule 2)", () => {
    const rPr = runPrXml({ position: -5, sz: 20 });
    expect(rPr.indexOf("<w:position")).toBeLessThan(rPr.indexOf("<w:sz"));
    expect(rPr.indexOf("<w:color")).toBeLessThan(rPr.indexOf("<w:position"));
  });

  it("maps inline formatting to ordered run properties", async () => {
    const xml = await getDocumentXmlWithMark(
      "_i_ ~~s~~ **bold ==marked== text** H<sub>2</sub>O x<sup>2</sup> `c`",
    );
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    expect(xml).toContain("<w:strike/>");
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:rStyle w:val="Code"/>');
    // CT_RPr order inside the bold+marked run: b before highlight (rule 2).
    const hl = xml.indexOf('<w:highlight w:val="yellow"/>');
    const rPr = xml.slice(
      xml.lastIndexOf("<w:rPr>", hl),
      xml.indexOf("</w:rPr>", hl),
    );
    expect(rPr).toContain("<w:b/>");
    expect(rPr.indexOf("<w:b/>")).toBeLessThan(rPr.indexOf("<w:highlight"));
  });

  it("maps links to hyperlink relationships (rule 11)", async () => {
    const zip = await exportToZip("See [docs](https://example.com/a).");
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("<w:hyperlink ");
    expect(xml).toContain('w:history="1"');
    expect(xml).toContain('<w:rStyle w:val="Hyperlink"/>');
    const rels = await zipText(zip, "word/_rels/document.xml.rels");
    expect(rels).toContain('Target="https://example.com/a"');
    expect(rels).toContain('TargetMode="External"');
  });

  it("maps hr to a paragraph border, not a table", async () => {
    const xml = await getDocumentXml("a\n\n---\n\nb");
    expect(xml).toContain("<w:pBdr>");
    expect(xml).toContain('<w:bottom w:val="single"');
    expect(xml).not.toContain("<w:tbl>");
  });

  it("maps blockquotes to the Quote style", async () => {
    const xml = await getDocumentXml("> quoted");
    expect(xml).toContain('<w:pStyle w:val="Quote"/>');
  });

  it("maps bullet lists to numbering with ilvl depth", async () => {
    const xml = await getDocumentXml("- a\n- b\n  - nested");
    expect(xml).toContain('<w:numId w:val="1"/>');
    expect(xml).toContain('<w:ilvl w:val="0"/>');
    expect(xml).toContain('<w:ilvl w:val="1"/>');
  });

  it("gives each ordered list its own numId so numbering restarts", async () => {
    // A paragraph between the lists (markdown-it merges consecutive
    // continuing lists into one block).
    const xml = await getDocumentXml("1. a\n1. b\n\npara\n\n1. c");
    const ids = [...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
    const unique = new Set(ids);
    expect(unique.size).toBe(2);
    expect(unique.has("2")).toBe(true);
    expect(unique.has("3")).toBe(true);
    const numbering = await getNumberingXml("1. a");
    expect(count(numbering, "<w:abstractNum ")).toBe(2);
  });

  it("renders task list checkboxes as glyphs in bullet items", async () => {
    const xml = await getDocumentXml("- [ ] todo\n- [x] done");
    expect(xml).toContain("☐ ");
    expect(xml).toContain("☑ ");
    expect(xml).toContain('<w:numId w:val="1"/>');
  });

  it("maps tables to fixed DXA grids that sum to the content width (rule 4)", async () => {
    const xml = await getDocumentXml("| a | bb |\n| --- | --- |\n| 1 | 2 |");
    expect(xml).toContain('<w:tblW w:w="9638" w:type="dxa"/>');
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    const widths = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths.length).toBe(2);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(9638);
    // Header row: repeat + clear shading (rule 5), never solid.
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain(
      '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>',
    );
    expect(xml).not.toContain('w:val="solid"');
  });

  it("maps aligned columns to cell paragraph justification", async () => {
    const xml = await getDocumentXml(
      "| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |",
    );
    expect(count(xml, '<w:jc w:val="center"/>')).toBeGreaterThanOrEqual(1);
    expect(count(xml, '<w:jc w:val="right"/>')).toBeGreaterThanOrEqual(1);
  });

  it("maps code fences to CodeBlock paragraphs with preserved spaces", async () => {
    const xml = await getDocumentXml("```js\nlet x = 1;\n\n  indented();\n```");
    expect(count(xml, '<w:pStyle w:val="CodeBlock"/>')).toBe(3);
    expect(xml).toContain("  indented();");
    expect(xml).toContain('xml:space="preserve"');
  });

  it("colors syntax-highlighted runs from the printer-friendly palette", async () => {
    vi.mocked(hljs.highlight).mockReturnValueOnce({
      value: '<span class="hljs-keyword">let</span> x',
    } as never);
    const xml = await getDocumentXml("```js\nlet x\n```");
    expect(xml).toContain('<w:color w:val="d73a49"/>');
  });

  it("maps html spans (kbd/mark/sub/sup) and ignores unknown tags", async () => {
    const xml = await getDocumentXmlWithMark(
      "press <kbd>Ctrl</kbd> <mark>m</mark> <sub>s</sub><sup>p</sup> <blink>x</blink>",
    );
    expect(xml).toContain('<w:rStyle w:val="Code"/>');
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).not.toContain("blink");
  });
});

describe("docxExporter images", () => {
  it("embeds a PNG image as an inline drawing with alt text", async () => {
    const zip = await exportToZip(`![my alt](${PNG_DATA_URI})`);
    const entries = Object.keys(zip.files);
    expect(entries.some((e) => e.startsWith("word/media/"))).toBe(true);
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("<w:drawing>");
    expect(xml).toContain("<wp:inline");
    expect(xml).toContain('descr="my alt"');
    expect(xml).not.toContain("asvg:svgBlip"); // PNG-only by default (rule 14)
    expect(xml).not.toContain("<w:position"); // images sit on the baseline
  });

  it("degrades unresolved images to a text placeholder", async () => {
    const xml = await getDocumentXml("![gone](missing/nope.png)");
    expect(xml).toContain("[Image: gone]");
    expect(xml).not.toContain("<w:drawing>");
  });

  it("deduplicates repeated image references", async () => {
    const src = `![a](${PNG_DATA_URI}) and ![b](${PNG_DATA_URI})`;
    const entries = await getZipFileList(src);
    // (JSZip also lists implicit folder entries like "word/media/".)
    expect(
      entries.filter((e) => e.startsWith("word/media/") && e.endsWith(".png"))
        .length,
    ).toBe(1);
    const xml = await getDocumentXml(src);
    expect(count(xml, "<w:drawing>")).toBe(2);
  });
});

describe("docxExporter footnotes", () => {
  it("emits real footnotes with separators and resolving ids (rule 12)", async () => {
    const src = "text[^a]\n\n[^a]: the *note* body";
    const xml = await getDocumentXml(src);
    expect(xml).toContain('<w:footnoteReference w:id="1"/>');
    expect(xml).toContain('<w:rStyle w:val="FootnoteReference"/>');

    const footnotes = await getFootnotesXml(src);
    expect(footnotes).toContain('<w:footnote w:type="separator" w:id="-1">');
    expect(footnotes).toContain(
      '<w:footnote w:type="continuationSeparator" w:id="0">',
    );
    expect(footnotes).toContain('<w:footnote w:id="1">');
    expect(footnotes).toContain("<w:footnoteRef/>");
    expect(footnotes).toContain("the ");
    expect(footnotes).toContain("<w:i/>");
    expect(footnotes).toContain('<w:pStyle w:val="FootnoteText"/>');
  });

  it("numbers multiple footnotes in document order", async () => {
    const src = "a[^1] b[^2]\n\n[^1]: one\n\n[^2]: two";
    const xml = await getDocumentXml(src);
    expect(xml).toContain('<w:footnoteReference w:id="1"/>');
    expect(xml).toContain('<w:footnoteReference w:id="2"/>');
    const footnotes = await getFootnotesXml(src);
    expect(footnotes).toContain('<w:footnote w:id="1">');
    expect(footnotes).toContain('<w:footnote w:id="2">');
    const stripped = footnotes.replace(/<[^>]+>/g, "");
    expect(stripped.indexOf("one")).toBeLessThan(stripped.indexOf("two"));
  });
});

describe("docxExporter frontmatter and meta", () => {
  const fm = { title: "My Doc", author: "Ada" };

  it("prepends the frontmatter card and fills docProps", async () => {
    const zip = await exportToZip("body", { frontmatter: fm });
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain("My Doc");
    expect(xml).toContain("<w:tbl>");
    const core = await zipText(zip, "docProps/core.xml");
    expect(core).toContain("<dc:title>My Doc</dc:title>");
    expect(core).toContain("<dc:creator>Ada</dc:creator>");
  });

  it("omits the card when the option is off but keeps docProps", async () => {
    const zip = await exportToZip("body", {
      frontmatter: fm,
      options: { "docx.includeFrontmatter": false },
    });
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).not.toContain('<w:pStyle w:val="Title"/>');
    const core = await zipText(zip, "docProps/core.xml");
    expect(core).toContain("<dc:title>My Doc</dc:title>");
  });

  it("renders skill cards with the SKILL badge", async () => {
    const zip = await exportToZip("body", {
      frontmatter: {
        name: "my-skill",
        description: "does things",
        license: "MIT",
      },
    });
    const xml = await zipText(zip, "word/document.xml");
    expect(xml).toContain("SKILL");
    expect(xml).toContain("my-skill");
    expect(xml).toContain("does things");
    expect(xml).toContain("MIT");
  });
});

describe("docxExporter escaping (rule 15)", () => {
  it("escapes XML metacharacters and strips control characters", async () => {
    const ctrl = String.fromCharCode(1);
    const xml = await getDocumentXml(`a < b & c > d "q" 's' ${ctrl}ctrl`);
    expect(xml).toContain("a &lt; b &amp; c &gt; d");
    expect(xml).toContain("&quot;q&quot;");
    expect(xml).toContain("&apos;s&apos;");
    expect(xml).not.toContain(ctrl);
    expect(xml).toContain(" ctrl");
  });
});
