/**
 * Run construction for the DOCX exporter.
 *
 * A paragraph's inline content is built as a list of {@link Piece}s and then
 * serialized by {@link piecesToRunsXml}, which merges adjacent text runs with
 * identical properties (compatibility rule 16 — Word's fragmented-run
 * artifacts) and wraps link runs in `w:hyperlink` groups. Raw pieces (drawings,
 * math, footnote references, breaks) pass through untouched and break link
 * groups — `w:hyperlink` may only contain runs.
 */
import { wText, esc } from "./utils";

export interface RunProps {
  /** Character style id (Code, Hyperlink, …) as `w:rStyle`. */
  style?: string | null;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  /** `w:highlight` yellow (markdown `==mark==`). */
  highlight?: boolean;
  vertAlign?: "subscript" | "superscript";
  /** Hex color like `#d73a49` (hljs palette, inline `color:` styles). */
  color?: string | null;
  /** Signed character position in half-points (`w:position`; negative
   * lowers the run — used to line-center inline math drawings). */
  position?: number | null;
  /** Hex fill for `w:shd` (inline `background-color:` styles). */
  shd?: string | null;
  /** Explicit font override (`w:rFonts` ascii/hAnsi). */
  rFonts?: string | null;
  /** Size in half-points (`w:sz`). */
  sz?: number | null;
}

/**
 * `w:rPr` with children in schema order (CT_RPr): rStyle, rFonts, b, i,
 * strike, color, sz, highlight, u, shd, vertAlign. Element order is
 * schema-enforced (rule 2) — never emit these in another order.
 */
export function runPrXml(p: RunProps): string {
  let xml = "";
  if (p.style) xml += `<w:rStyle w:val="${esc(p.style)}"/>`;
  if (p.rFonts) {
    xml += `<w:rFonts w:ascii="${esc(p.rFonts)}" w:hAnsi="${esc(p.rFonts)}"/>`;
  }
  if (p.bold) xml += "<w:b/>";
  if (p.italic) xml += "<w:i/>";
  if (p.strike) xml += "<w:strike/>";
  if (p.color) xml += `<w:color w:val="${esc(p.color.replace(/^#/, ""))}"/>`;
  if (p.position) xml += `<w:position w:val="${Math.round(p.position)}"/>`;
  if (p.sz) xml += `<w:sz w:val="${Math.round(p.sz)}"/>`;
  if (p.highlight) xml += '<w:highlight w:val="yellow"/>';
  if (p.underline) xml += '<w:u w:val="single"/>';
  if (p.shd) {
    xml += `<w:shd w:val="clear" w:color="auto" w:fill="${esc(p.shd.replace(/^#/, ""))}"/>`;
  }
  if (p.vertAlign) xml += `<w:vertAlign w:val="${p.vertAlign}"/>`;
  return xml === "" ? "" : `<w:rPr>${xml}</w:rPr>`;
}

/** Stable identity for run-property comparison (rule 16 merging). */
export function propsKey(p: RunProps): string {
  return JSON.stringify([
    p.style ?? "",
    p.bold ? 1 : 0,
    p.italic ? 1 : 0,
    p.strike ? 1 : 0,
    p.underline ? 1 : 0,
    p.highlight ? 1 : 0,
    p.vertAlign ?? "",
    p.color ?? "",
    p.position ?? 0,
    p.shd ?? "",
    p.rFonts ?? "",
    p.sz ?? 0,
  ]);
}

export type Piece =
  | { kind: "text"; text: string; props: RunProps; linkRid: string | null }
  /** Pre-built run-level XML (drawings, math, breaks, footnote refs). */
  | { kind: "raw"; xml: string };

export function textPiece(
  text: string,
  props: RunProps,
  linkRid: string | null = null,
): Piece {
  return { kind: "text", text, props, linkRid };
}

/** Serialize pieces to run XML, merging equal runs and grouping hyperlinks. */
export function piecesToRunsXml(pieces: Piece[]): string {
  let out = "";
  let openLink: string | null = null;
  let bufText = "";
  let bufProps: RunProps | null = null;
  let bufLink: string | null = null;

  const flush = (): void => {
    if (bufProps === null) return;
    if (bufLink !== openLink) {
      if (openLink !== null) out += "</w:hyperlink>";
      if (bufLink !== null) {
        out += `<w:hyperlink r:id="${esc(bufLink)}" w:history="1">`;
      }
      openLink = bufLink;
    }
    out += `<w:r>${runPrXml(bufProps)}${wText(bufText)}</w:r>`;
    bufText = "";
    bufProps = null;
  };

  for (const piece of pieces) {
    if (piece.kind === "text") {
      if (piece.text === "") continue;
      if (
        bufProps !== null &&
        piece.linkRid === bufLink &&
        propsKey(piece.props) === propsKey(bufProps)
      ) {
        bufText += piece.text;
      } else {
        flush();
        bufProps = piece.props;
        bufLink = piece.linkRid;
        bufText = piece.text;
      }
    } else {
      flush();
      if (openLink !== null) {
        out += "</w:hyperlink>";
        openLink = null;
      }
      out += piece.xml;
    }
  }
  flush();
  if (openLink !== null) out += "</w:hyperlink>";
  return out;
}
