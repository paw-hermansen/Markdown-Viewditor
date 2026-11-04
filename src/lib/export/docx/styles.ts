/**
 * `word/styles.xml` and `word/numbering.xml` generation (EXPORT-PLAN 8.4/8.5).
 *
 * Style catalogue is the conservative cross-viewer set: built-in style IDs
 * (`Heading1`…`Heading6`, `Title`) so navigation panes and TOC insertion work
 * everywhere (rule 10), explicit fonts in `docDefaults` (rule 9 — no
 * `theme1.xml`), and shading as `w:val="clear"` (rule 5).
 */
import { esc } from "./utils";

/** Style ids used by the block/inline renderers. */
export const S = {
  normal: "Normal",
  title: "Title",
  quote: "Quote",
  list: "ListParagraph",
  codeBlock: "CodeBlock",
  code: "Code",
  hyperlink: "Hyperlink",
  footnoteText: "FootnoteText",
  footnoteRef: "FootnoteReference",
  heading: (level: number): string =>
    `Heading${Math.min(Math.max(level, 1), 6)}`,
} as const;

const HEADING_SIZES: Record<number, number> = {
  1: 32,
  2: 28,
  3: 26,
  4: 24,
  5: 23,
  6: 22,
};

function headingStyle(level: number): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${S.heading(level)}">` +
    `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    "<w:pPr><w:keepNext/><w:keepLines/>" +
    '<w:spacing w:before="240" w:after="60"/>' +
    `<w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:color w:val="1F2328"/>` +
    `<w:sz w:val="${HEADING_SIZES[level]}"/><w:szCs w:val="${HEADING_SIZES[level]}"/>` +
    "</w:rPr></w:style>"
  );
}

export function generateStylesXml(): string {
  const headings = [1, 2, 3, 4, 5, 6].map(headingStyle).join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
    "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>" +
    '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/>' +
    "</w:pPr></w:pPrDefault></w:docDefaults>" +
    `<w:style w:type="paragraph" w:default="1" w:styleId="${S.normal}">` +
    '<w:name w:val="Normal"/><w:qFormat/>' +
    "</w:style>" +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont">` +
    '<w:name w:val="Default Paragraph Font"/></w:style>' +
    `<w:style w:type="paragraph" w:styleId="${S.title}">` +
    '<w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>' +
    headings +
    `<w:style w:type="paragraph" w:styleId="${S.quote}">` +
    '<w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    "<w:pPr>" +
    '<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="8B949E"/></w:pBdr>' +
    '<w:ind w:left="432" w:right="432"/></w:pPr>' +
    '<w:rPr><w:color w:val="656D76"/></w:rPr></w:style>' +
    `<w:style w:type="paragraph" w:styleId="${S.list}">` +
    '<w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="0"/><w:contextualSpacing/></w:pPr></w:style>' +
    `<w:style w:type="paragraph" w:styleId="${S.codeBlock}">` +
    '<w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>' +
    "<w:pPr><w:keepLines/>" +
    '<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>' +
    '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>' +
    `<w:style w:type="character" w:styleId="${S.code}">` +
    '<w:name w:val="Code"/><w:rPr>' +
    '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/>' +
    '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>' +
    "</w:rPr></w:style>" +
    `<w:style w:type="character" w:styleId="${S.hyperlink}">` +
    '<w:name w:val="Hyperlink"/><w:rPr>' +
    '<w:color w:val="0969DA"/><w:u w:val="single"/></w:rPr></w:style>' +
    `<w:style w:type="paragraph" w:styleId="${S.footnoteText}">` +
    '<w:name w:val="footnote text"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
    `<w:style w:type="character" w:styleId="${S.footnoteRef}">` +
    '<w:name w:val="footnote reference"/><w:rPr>' +
    '<w:vertAlign w:val="superscript"/></w:rPr></w:style>' +
    "</w:styles>"
  );
}

/* ────────────────────────────── numbering ─────────────────────────────── */

export interface NumEntry {
  numId: number;
  abstractNumId: number;
}

const BULLET_CHARS = ["•", "◦", "▪"];

function bulletLevel(ilvl: number): string {
  return (
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/>` +
    '<w:numFmt w:val="bullet"/><w:suff w:val="tab"/>' +
    `<w:lvlText w:val="${esc(BULLET_CHARS[ilvl % 3])}"/>` +
    '<w:lvlJc w:val="left"/>' +
    `<w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="360"/></w:pPr>` +
    "</w:lvl>"
  );
}

function decimalLevel(ilvl: number): string {
  return (
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/>` +
    '<w:numFmt w:val="decimal"/><w:suff w:val="tab"/>' +
    // Own-counter-only display: each list block gets its own `w:num` and
    // restarts at 1, so level k shows "%k." — exactly what markdown shows.
    `<w:lvlText w:val="%${ilvl + 1}."/>` +
    '<w:lvlJc w:val="left"/>' +
    `<w:pPr><w:ind w:left="${720 * (ilvl + 1)}" w:hanging="360"/></w:pPr>` +
    "</w:lvl>"
  );
}

/**
 * `word/numbering.xml` for the collected `w:num` instances.
 *
 * abstractNum 0 = bullet (levels 0–8 cycle • ◦ ▪), abstractNum 1 = decimal.
 * Every ordered list block gets its own `w:num` (fresh numId) so numbering
 * restarts; bullet lists share `numId` 1.
 */
export function generateNumberingXml(nums: NumEntry[]): string {
  const bulletLevels = Array.from({ length: 9 }, (_, i) => bulletLevel(i)).join(
    "",
  );
  const decimalLevels = Array.from({ length: 9 }, (_, i) =>
    decimalLevel(i),
  ).join("");
  // numId 1 is the shared bullet instance — always present (a bullet list
  // does not register a num of its own).
  const allNums: NumEntry[] = [{ numId: 1, abstractNumId: 0 }, ...nums];
  const numEntries = allNums
    .map(
      (n) =>
        `<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.abstractNumId}"/></w:num>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0">' +
    '<w:multiLevelType w:val="hybridMultilevel"/>' +
    bulletLevels +
    "</w:abstractNum>" +
    '<w:abstractNum w:abstractNumId="1">' +
    '<w:multiLevelType w:val="hybridMultilevel"/>' +
    decimalLevels +
    "</w:abstractNum>" +
    numEntries +
    "</w:numbering>"
  );
}
