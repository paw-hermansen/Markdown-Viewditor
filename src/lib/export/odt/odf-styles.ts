import { escapeXml } from "$lib/utils/escape";

/* ─────────────────────── ODF style names ──────────────────────────────── */

export const S = {
  heading: (level: number) => `Heading_20_${level}`,
  body: "Text_20_body",
  pre: "Preformatted_20_Text",
  quote: (level: number) => `Blockquote_20_${level}`,
  listBullet: "BulletList",
  listNumber: "NumberList",
  listTask: "TaskList",
  cell: "Table_20_Contents",
  cellHead: "Table_20_Heading",
  // Alignment variants for GFM pipe-table column alignment (`:--`, `:-:`,
  // `--:`). Left/absent maps to the base styles — left is the ODF default.
  cellAligned: (align: string): string =>
    align === "center"
      ? "Table_20_Contents_20_Center"
      : align === "right"
        ? "Table_20_Contents_20_Right"
        : "Table_20_Contents",
  cellHeadAligned: (align: string): string =>
    align === "center"
      ? "Table_20_Heading_20_Center"
      : align === "right"
        ? "Table_20_Heading_20_Right"
        : "Table_20_Heading",
  mathDisplay: "Math_20_Display",
  diagramDisplay: (align: string): string =>
    align === "left"
      ? "Diagram_20_Display_20_Left"
      : align === "right"
        ? "Diagram_20_Display_20_Right"
        : "Diagram_20_Display",
  fmTable: "FrontmatterTable",
  fmCell: "FrontmatterCell",
  fmHeading: "FrontmatterHeading",
  fmBody: "FrontmatterBody",
  fmDesc: "FrontmatterDesc",
  fmMetaKey: "FrontmatterMetaKey",
  fmMetaVal: "FrontmatterMetaVal",
} as const;

/* ─────────────────────── ODF XML templates ───────────────────────────── */

export function generateMimetype(): string {
  return "application/vnd.oasis.opendocument.text";
}

export function generateMetaXml(title: string, author: string): string {
  const dcTitle = title
    ? `    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(title)}</dc:title>\n`
    : "";
  const dcCreator = author
    ? `    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(author)}</dc:creator>\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.2">
  <office:meta>
    <meta:generator>Markdown Viewditor</meta:generator>
${dcTitle}${dcCreator}  </office:meta>
</office:document-meta>`;
}

export function generateListStyles(): string {
  const INDENT = 0.5; // cm per level

  // Bullet characters — cycle through these round-robin for levels 1-9
  const bulletChars = ["•", "◦", "▪", "▫", "■", "○", "◘", "◙", "◦"];
  // Ordered numbering formats — cycle through these round-robin
  const orderedFormats: { format: string; suffix: string }[] = [
    { format: "1", suffix: "." },
    { format: "a", suffix: "." },
    { format: "A", suffix: "." },
    { format: "i", suffix: "." },
    { format: "I", suffix: "." },
    { format: "1", suffix: ")" },
    { format: "a", suffix: ")" },
    { format: "A", suffix: ")" },
    { format: "i", suffix: ")" },
  ];

  function levelProps(level: number): string {
    const spaceBefore = `${(level * INDENT).toFixed(1)}cm`;
    return `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${spaceBefore}" fo:text-indent="-0.5cm" fo:margin-left="${spaceBefore}"/></style:list-level-properties>`;
  }

  function bulletLevel(level: number, char: string): string {
    return `    <text:list-level-style-bullet text:level="${level}" text:bullet-char="${char}">
      ${levelProps(level)}
    </text:list-level-style-bullet>`;
  }

  function numberLevel(level: number, format: string, suffix: string): string {
    return `    <text:list-level-style-number text:level="${level}" style:num-format="${format}" style:num-suffix="${suffix}">
      ${levelProps(level)}
    </text:list-level-style-number>`;
  }

  const bulletLevels = Array.from({ length: 9 }, (_, i) =>
    bulletLevel(i + 1, bulletChars[i]),
  ).join("\n");

  const numberLevels = Array.from({ length: 9 }, (_, i) => {
    const f = orderedFormats[i];
    return numberLevel(i + 1, f.format, f.suffix);
  }).join("\n");

  const taskLevels = Array.from({ length: 9 }, (_, i) =>
    bulletLevel(i + 1, " "),
  ).join("\n");

  return `<text:list-style style:name="${S.listBullet}">
${bulletLevels}
  </text:list-style>
  <text:list-style style:name="${S.listNumber}">
${numberLevels}
  </text:list-style>
  <text:list-style style:name="${S.listTask}">
${taskLevels}
  </text:list-style>`;
}

export function generateTextStyles(): string {
  const flagCombos = [
    "P",
    "B",
    "I",
    "U",
    "S",
    "BI",
    "BU",
    "BS",
    "IU",
    "IS",
    "US",
    "BIU",
    "BIS",
    "BUS",
    "IUS",
    "BIUS",
  ];
  const positions = [
    { suffix: "", sub: false, sup: false },
    { suffix: "_sub", sub: true, sup: false },
    { suffix: "_sup", sub: false, sup: true },
  ];

  const styles: string[] = [];
  for (const combo of flagCombos) {
    for (const pos of positions) {
      let props = "";
      if (combo.includes("B")) props += ' fo:font-weight="bold"';
      if (combo.includes("I")) props += ' fo:font-style="italic"';
      if (combo.includes("U"))
        props +=
          ' style:text-underline-style="solid" style:text-underline-type="single"';
      if (combo.includes("S"))
        props +=
          ' style:text-line-through-style="solid" style:text-line-through-type="single"';
      if (pos.sub) props += ' style:text-position="sub 58%"';
      if (pos.sup) props += ' style:text-position="super 58%"';

      styles.push(
        `    <style:style style:name="Char_${combo}${pos.suffix}" style:family="text"><style:text-properties${props}/></style:style>`,
      );
    }
  }

  return styles.join("\n");
}

export function generateStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:text-properties
        fo:font-family="sans-serif"
        fo:font-size="10pt"
        style:font-family-generic="swiss"
        fo:language="en" fo:country="US"/>
    </style:default-style>
    <style:style style:name="Standard" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-bottom="0.04in"/>
    </style:style>
    <style:style style:name="${S.body}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0.08in" fo:margin-bottom="0.08in"/>
    </style:style>
    <style:style style:name="${S.mathDisplay}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.16in" fo:margin-bottom="0.16in"/>
    </style:style>
    <style:style style:name="${S.diagramDisplay("left")}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:text-align="left" fo:margin-top="0.16in" fo:margin-bottom="0.16in"/>
    </style:style>
    <style:style style:name="${S.diagramDisplay("center")}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.16in" fo:margin-bottom="0.16in"/>
    </style:style>
    <style:style style:name="${S.diagramDisplay("right")}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:text-align="right" fo:margin-top="0.16in" fo:margin-bottom="0.16in"/>
    </style:style>
    ${[1, 2, 3, 4, 5, 6]
      .map(
        (l) => `
    <style:style style:name="${S.heading(l)}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="${l === 1 ? "0.4in" : "0.2in"}" fo:margin-bottom="0.1in"/>
      <style:text-properties
        fo:font-size="${l === 1 ? "24pt" : l === 2 ? "18pt" : l === 3 ? "14pt" : "12pt"}"
        fo:font-weight="bold"
        style:font-family-generic="swiss"/>
    </style:style>`,
      )
      .join("")}
    <style:style style:name="${S.pre}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0"
        fo:background-color="#f6f8fa" fo:padding="0.1in"
        fo:wrap-option="no-wrap"/>
      <style:text-properties
        fo:font-family="monospace"
        fo:font-size="9pt"
        style:font-family-generic="modern"/>
    </style:style>
${Array.from({ length: 9 }, (_, i) => {
  const lvl = i + 1;
  const marginLeft = ((lvl - 1) * 0.4).toFixed(4);
  return `
    <style:style style:name="${S.quote(lvl)}" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-left="${marginLeft}in"
        fo:margin-top="0.05in"
        fo:margin-bottom="0.05in"/>
      <style:text-properties fo:color="#656d76"/>
    </style:style>`;
}).join("")}
    <style:style style:name="QuoteTable" style:family="table">
      <style:table-properties
        fo:margin-left="0.4000in"
        fo:padding-left="0.1000in"
        fo:margin-right="0.4000in"
        fo:margin-top="0.05in"
        fo:margin-bottom="0.05in"/>
    </style:style>
    <style:style style:name="QuoteTableCell" style:family="table-cell">
      <style:table-cell-properties
        fo:border-top="none"
        fo:border-bottom="none"
        fo:border-right="none"
        fo:border-left="2pt solid #d1d9e0"
        fo:padding-left="0.1000in"
        fo:padding-top="0"
        fo:padding-bottom="0"
        fo:padding-right="0"
        fo:background-color="#f6f8fa"/>
    </style:style>
${Array.from({ length: 9 }, (_, i) => {
  const lvl = i + 1;
  const marginLeft = ((lvl - 1) * 0.4).toFixed(4);
  return `
    <style:style style:name="QuoteList_20_${lvl}" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-left="${marginLeft}in"
        fo:margin-top="0"
        fo:margin-bottom="0"/>
      <style:text-properties fo:color="#656d76"/>
    </style:style>`;
}).join("")}
    ${generateListStyles()}
    <style:style style:name="${S.cell}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.05in"/>
    </style:style>
    <style:style style:name="${S.cellHead}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.05in"/>
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
${(["center", "right"] as const)
  .map(
    (align) => `
    <style:style style:name="${S.cellAligned(align)}" style:family="paragraph">
      <style:paragraph-properties fo:text-align="${align}" fo:margin-top="0" fo:margin-bottom="0.05in"/>
    </style:style>
    <style:style style:name="${S.cellHeadAligned(align)}" style:family="paragraph">
      <style:paragraph-properties fo:text-align="${align}" fo:margin-top="0" fo:margin-bottom="0.05in"/>
      <style:text-properties fo:font-weight="bold"/>
    </style:style>`,
  )
  .join("")}
    <style:style style:name="Horizontal_20_Rule" style:family="paragraph" style:class="text">
      <style:paragraph-properties
        fo:margin-top="0.2in" fo:margin-bottom="0.2in"
        fo:border-bottom="1pt solid #d1d9e0"/>
      <style:text-properties fo:font-size="1pt"/>
    </style:style>
    <style:style style:name="${S.fmTable}" style:family="table">
      <style:table-properties
        fo:margin-top="0.16in" fo:margin-bottom="0.16in"
        fo:padding="0.08in"/>
    </style:style>
    <style:style style:name="${S.fmCell}" style:family="table-cell">
      <style:table-cell-properties
        fo:border-top="1pt solid #d1d9e0"
        fo:border-bottom="1pt solid #d1d9e0"
        fo:border-right="1pt solid #d1d9e0"
        fo:border-left="3pt solid #0969da"
        fo:padding="0.08in 0.12in"
        fo:background-color="#f6f8fa"/>
    </style:style>
    <style:style style:name="${S.fmHeading}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.06in"/>
      <style:text-properties
        fo:font-size="8pt"
        fo:font-weight="bold"
        fo:text-transform="uppercase"
        fo:color="#656d76"
        style:letter-spacing="0.08em"/>
    </style:style>
    <style:style style:name="${S.fmBody}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.04in"/>
    </style:style>
    <style:style style:name="${S.fmDesc}" style:family="paragraph" style:class="text">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.08in"/>
      <style:text-properties fo:color="#656d76"/>
    </style:style>
    <style:style style:name="${S.fmMetaKey}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.02in"/>
      <style:text-properties fo:font-weight="bold" fo:color="#656d76"/>
    </style:style>
    <style:style style:name="${S.fmMetaVal}" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0" fo:margin-bottom="0.04in"/>
    </style:style>
    <style:style style:name="Formula" style:family="graphic">
      <style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text"/>
    </style:style>
    <style:style style:name="Graphics" style:family="graphic">
      <style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/>
    </style:style>
    ${generateTextStyles()}
    <style:style style:name="T_link" style:family="text"><style:text-properties fo:color="#0969da" style:text-underline-type="solid" style:text-underline-style="solid"/></style:style>
    <style:style style:name="T4" style:family="text"><style:text-properties fo:font-family="monospace" style:font-family-generic="modern" fo:background-color="#f6f8fa"/></style:style>
    <style:style style:name="T_kbd" style:family="text"><style:text-properties fo:font-family="monospace" style:font-family-generic="modern" fo:background-color="#f0f0f0" fo:padding="0.02in 0.04in" fo:border="0.5pt solid #ccc"/></style:style>
    <style:style style:name="T_mark" style:family="text"><style:text-properties fo:background-color="#fff8c5"/></style:style>
    <style:style style:name="T_fm_accent" style:family="text"><style:text-properties fo:color="#0969da" fo:font-weight="bold" fo:font-size="7pt"/></style:style>
    <style:style style:name="T_fm_name" style:family="text"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/></style:style>
  </office:styles>
  <office:automatic-styles>
    <style:page-layout style:name="Mpm1">
      <style:page-layout-properties
        fo:margin-top="1in" fo:margin-bottom="1in"
        fo:margin-left="1in" fo:margin-right="1in"/>
    </style:page-layout>
    <style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics">
      <style:graphic-properties style:horizontal-pos="center" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="baseline" style:mirror="none" fo:clip="rect(0in, 0in, 0in, 0in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>
    </style:style>
    <style:style style:name="Grf1" style:family="graphic" style:parent-style-name="Graphics">
      <style:graphic-properties style:horizontal-pos="center" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="baseline" style:mirror="none" fo:clip="rect(0in, 0in, 0in, 0in)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>
    </style:style>
  </office:automatic-styles>
  <office:master-styles>
    <style:master-page style:name="Standard" style:page-layout-name="Mpm1"/>
  </office:master-styles>
</office:document-styles>`;
}

export interface AutomaticStyle {
  name: string;
  xml: string;
}

export interface MathObject {
  id: string;
  mathml: string;
}

export function generateContentXml(
  bodyElements: string,
  automaticStyles: AutomaticStyle[],
): string {
  const stylesBlock = automaticStyles.map((s) => `    ${s.xml}`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:math="http://www.w3.org/1998/Math/MathML"
  office:version="1.2">
  <office:automatic-styles>
${stylesBlock}
  </office:automatic-styles>
  <office:body>
    <office:text>
${bodyElements}
    </office:text>
  </office:body>
</office:document-content>`;
}

export interface ManifestEntry {
  fullPath: string;
  mediaType: string;
}

export function generateManifestXml(entries: ManifestEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `    <manifest:file-entry manifest:full-path="${escapeXml(e.fullPath)}" manifest:media-type="${escapeXml(e.mediaType)}"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest
  xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"
  manifest:version="1.2">
    <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text" manifest:version="1.2"/>
${items}
</manifest:manifest>`;
}

export type ListKind = "bullet" | "number" | "task";

/** Return the named style for a list kind. */
export function listStyleName(kind: ListKind): string {
  return kind === "bullet"
    ? S.listBullet
    : kind === "number"
      ? S.listNumber
      : S.listTask;
}
