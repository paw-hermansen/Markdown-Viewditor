/**
 * Package parts for the DOCX exporter (EXPORT-PLAN 8.2).
 *
 * The part list is deliberately minimal — every part is a failure mode in
 * some viewer. No `theme1.xml` (fonts are declared explicitly), no
 * `fontTable.xml`, no headers/footers. `word/settings.xml` carries the two
 * footnote separator declarations and `compatibilityMode` 15.
 */
import { esc } from "./utils";
import type { RelEntry, FootnoteDef } from "./context";

export const REL_ROOT_DOC =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
export const REL_ROOT_CORE =
  "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
export const REL_STYLES =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
export const REL_NUMBERING =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
export const REL_FOOTNOTES =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
export const REL_SETTINGS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings";

const CT_DOCUMENT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const CT_STYLES =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const CT_NUMBERING =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const CT_FOOTNOTES =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml";
const CT_SETTINGS =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml";
const CT_CORE = "application/vnd.openxmlformats-package.core-properties+xml";

export function generateContentTypesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Default Extension="gif" ContentType="image/gif"/>' +
    '<Default Extension="svg" ContentType="image/svg+xml"/>' +
    `<Override PartName="/word/document.xml" ContentType="${CT_DOCUMENT}"/>` +
    `<Override PartName="/word/styles.xml" ContentType="${CT_STYLES}"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="${CT_NUMBERING}"/>` +
    `<Override PartName="/word/footnotes.xml" ContentType="${CT_FOOTNOTES}"/>` +
    `<Override PartName="/word/settings.xml" ContentType="${CT_SETTINGS}"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="${CT_CORE}"/>` +
    "</Types>"
  );
}

export function generateRootRelsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL_ROOT_DOC}" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="${REL_ROOT_CORE}" Target="docProps/core.xml"/>` +
    "</Relationships>"
  );
}

/** `word/_rels/document.xml.rels` — styles/numbering/footnotes/settings + media + links. */
export function generateDocumentRelsXml(rels: RelEntry[]): string {
  const fixed: RelEntry[] = [
    {
      id: "rIdStyles",
      type: REL_STYLES,
      target: "styles.xml",
      external: false,
    },
    {
      id: "rIdNumbering",
      type: REL_NUMBERING,
      target: "numbering.xml",
      external: false,
    },
    {
      id: "rIdFootnotes",
      type: REL_FOOTNOTES,
      target: "footnotes.xml",
      external: false,
    },
    {
      id: "rIdSettings",
      type: REL_SETTINGS,
      target: "settings.xml",
      external: false,
    },
  ];
  const entries = [...fixed, ...rels]
    .map(
      (r) =>
        `<Relationship Id="${esc(r.id)}" Type="${esc(r.type)}" Target="${esc(r.target)}"` +
        `${r.external ? ' TargetMode="External"' : ""}/>`,
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    entries +
    "</Relationships>"
  );
}

/** `word/settings.xml` — child order is schema-enforced (rule 2). */
export function generateSettingsXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:defaultTabStop w:val="720"/>' +
    '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" ' +
    'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    "</w:settings>"
  );
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function generateCoreXml(title: string, author: string): string {
  const now = isoNow();
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(title)}</dc:title>` +
    `<dc:creator>${esc(author)}</dc:creator>` +
    `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

/** `word/footnotes.xml` — separator + continuationSeparator + real notes. */
export function generateFootnotesXml(defs: FootnoteDef[]): string {
  const notes = defs
    .map((d) => `<w:footnote w:id="${d.id}">${d.bodyXml}</w:footnote>`)
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:footnote w:type="separator" w:id="-1">' +
    "<w:p><w:r><w:separator/></w:r></w:p></w:footnote>" +
    '<w:footnote w:type="continuationSeparator" w:id="0">' +
    "<w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>" +
    notes +
    "</w:footnotes>"
  );
}

/** The document's closing `w:sectPr` (rule 8 — explicit page geometry). */
export function generateSectPrXml(): string {
  return (
    "<w:sectPr>" +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ' +
    'w:header="708" w:footer="708" w:gutter="0"/>' +
    '<w:cols w:space="708"/>' +
    '<w:docGrid w:linePitch="360"/>' +
    "</w:sectPr>"
  );
}
