/**
 * Block token → OOXML for the DOCX exporter. Mirrors `odt/blocks.ts`
 * structure (same token walk, same fallbacks) with the DOCX element set and
 * the compatibility rules from EXPORT-PLAN 8.3.
 */
import type Token from "markdown-it/lib/token.mjs";
import { findClosing } from "../token-walker";
import { sniffSvgDimensions } from "../images";
import { hljsToSpans } from "../highlight";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "$lib/extensions/fence-options";
import { KATEX_OPTIONS_SCHEMA } from "$lib/extensions/katex/renderer";
import { MERMAID_OPTIONS_SCHEMA } from "$lib/extensions/mermaid/schema";
import { renderMermaidSvgForExport } from "$lib/extensions/mermaid/renderer";
import { SMILES_OPTIONS_SCHEMA } from "$lib/extensions/smiles/schema";
import {
  ensureSmilesLoaded,
  renderSmilesSvg,
} from "$lib/extensions/smiles/renderer";
import { VEGA_LITE_OPTIONS_SCHEMA } from "$lib/extensions/vega-lite/schema";
import {
  ensureVegaLoaded,
  renderVegaLiteSvgForExport,
} from "$lib/extensions/vega-lite/renderer";
import { inlineSvgImageHrefs } from "../svg-images";
import type { DocxBuildContext } from "./context";
import { type Piece, textPiece, piecesToRunsXml } from "./runs";
import { wText } from "./utils";
import {
  buildMathRenderOpts,
  buildMermaidOptions,
  buildSmilesOptions,
  buildVegaLiteOptions,
  embedSvgGraphic,
  renderMath,
} from "./media";
import { renderInline } from "./inline";
import {
  computeMermaidFrameDims,
  computeVegaLiteFrameDims,
  fitDrawingToPage,
  CONTENT_WIDTH_TWIPS,
} from "./dimensions";
import { S } from "./styles";

export function paragraphStyle(ctx: DocxBuildContext): string {
  if (ctx.inFootnote) return S.footnoteText;
  let quoteDepth = 0;
  for (const c of ctx.contextStack) if (c === "blockquote") quoteDepth++;
  if (quoteDepth > 0) return S.quote;
  if (
    ctx.contextStack.some(
      (c) => c === "bullet_list" || c === "ordered_list" || c === "task_list",
    )
  ) {
    return S.list;
  }
  return S.normal;
}

/** `w:p` with optional style and extra pPr children (caller keeps schema order). */
export function paragraphXml(
  styleId: string,
  extraPPr: string,
  runsXml: string,
): string {
  const style =
    styleId && styleId !== S.normal ? `<w:pStyle w:val="${styleId}"/>` : "";
  const pPr = style || extraPPr ? `<w:pPr>${style}${extraPPr}</w:pPr>` : "";
  return `<w:p>${pPr}${runsXml}</w:p>`;
}

export function detectTaskList(innerTokens: Token[]): boolean {
  let liDepth = 0;
  for (let ti = 0; ti < innerTokens.length; ti++) {
    const t = innerTokens[ti];
    if (t.type === "list_item_open") {
      liDepth++;
      if (liDepth === 1) {
        for (let j = ti + 1; j < innerTokens.length; j++) {
          const inner = innerTokens[j];
          if (inner.type === "list_item_open") {
            const nc = findClosing(innerTokens, j, "list_item_close");
            if (nc >= 0) j = nc;
            continue;
          }
          if (
            inner.type === "bullet_list_open" ||
            inner.type === "ordered_list_open"
          ) {
            const nc = findClosing(
              innerTokens,
              j,
              inner.type.replace("_open", "_close"),
            );
            if (nc >= 0) {
              j = nc;
              continue;
            }
          }
          if (inner.type === "inline") {
            const fc = inner.children?.[0];
            if (
              fc?.type === "html_inline" &&
              fc.content.includes("task-list-item-checkbox")
            ) {
              return true;
            }
            break;
          }
          if (inner.type === "list_item_close") break;
        }
      }
    }
    if (t.type === "list_item_close") liDepth--;
  }
  return false;
}

interface ListCtx {
  numId: number;
  /** Nesting depth = `w:ilvl` (indent + bullet glyph variety). */
  ilvl: number;
}

function numPrXml(lc: ListCtx): string {
  return `<w:numPr><w:ilvl w:val="${lc.ilvl}"/><w:numId w:val="${lc.numId}"/></w:numPr>`;
}

/**
 * Paragraph-level props for a list item: style + `numPr`. Inside a quote the
 * Quote style's indent would beat the numbering level's, so the level indent
 * is repeated as direct formatting (direct > style > numbering).
 */
function listItemPPr(ctx: DocxBuildContext, lc: ListCtx): string {
  const style = paragraphStyle(ctx);
  let extra = numPrXml(lc);
  if (style === S.quote) {
    extra += `<w:ind w:left="${720 * (lc.ilvl + 1)}" w:hanging="360"/>`;
  }
  return extra;
}

export async function renderListItemContent(
  ctx: DocxBuildContext,
  liInner: Token[],
  lc: ListCtx,
): Promise<string> {
  // Detect checkbox prefix for task list items and strip checkbox HTML.
  let checkboxPrefix = "";
  function stripCheckbox(children: Token[]): Token[] {
    return children.filter(
      (c) =>
        !(
          c.type === "html_inline" &&
          c.content.includes("task-list-item-checkbox")
        ),
    );
  }
  for (const ct of liInner) {
    if (ct.type === "inline") {
      const ch = ct.children;
      if (ch?.[0]?.type === "html_inline") {
        const html = ch[0].content;
        if (
          html.includes("task-list-item-checkbox") &&
          html.includes("checked")
        ) {
          checkboxPrefix = "☑ ";
        } else if (html.includes("task-list-item-checkbox")) {
          checkboxPrefix = "☐ ";
        }
      }
      break;
    }
  }

  let result = "";
  let i = 0;
  let firstParagraph = true;
  while (i < liInner.length) {
    const t = liInner[i];
    if (t.type === "bullet_list_open" || t.type === "ordered_list_open") {
      const closeIdx = findClosing(
        liInner,
        i,
        t.type.replace("_open", "_close"),
      );
      if (closeIdx >= 0) {
        result += await renderList(
          ctx,
          liInner.slice(i + 1, closeIdx),
          t.type === "bullet_list_open" ? "bullet" : "number",
          lc.ilvl + 1,
        );
        i = closeIdx + 1;
        continue;
      }
    }
    const ppr = listItemPPr(ctx, lc);
    if (t.type === "paragraph_open") {
      const next = liInner[i + 1];
      let pieces: Piece[] = [];
      if (next?.type === "inline" && next.children) {
        pieces = await renderInline(
          ctx,
          stripCheckbox(next.children),
          next.map?.[0] ?? 0,
        );
      }
      if (firstParagraph && checkboxPrefix) {
        pieces.unshift(
          textPiece(
            checkboxPrefix,
            ctx.inlineState.runProps(),
            ctx.inlineState.linkRid,
          ),
        );
        firstParagraph = false;
      }
      const closeIdx = findClosing(liInner, i, "paragraph_close");
      result += paragraphXml(paragraphStyle(ctx), ppr, piecesToRunsXml(pieces));
      i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
      continue;
    }
    // Standalone inline (tight lists skip paragraph_open).
    if (t.type === "inline" && t.children) {
      const pieces = await renderInline(
        ctx,
        stripCheckbox(t.children),
        t.map?.[0] ?? 0,
      );
      if (firstParagraph && checkboxPrefix) {
        pieces.unshift(
          textPiece(
            checkboxPrefix,
            ctx.inlineState.runProps(),
            ctx.inlineState.linkRid,
          ),
        );
        firstParagraph = false;
      }
      result += paragraphXml(paragraphStyle(ctx), ppr, piecesToRunsXml(pieces));
      i++;
      continue;
    }
    i++;
  }
  return result;
}

/**
 * One markdown list block → paragraphs sharing one `w:num` instance.
 *
 * Every list block (top-level or nested) gets its own numId for ordered
 * lists so numbering restarts exactly as markdown shows it; `w:ilvl` carries
 * the nesting depth for indentation and bullet-glyph variety.
 */
export async function renderList(
  ctx: DocxBuildContext,
  innerTokens: Token[],
  kindHint: "bullet" | "number",
  ilvl: number,
): Promise<string> {
  const kind =
    kindHint === "bullet" && detectTaskList(innerTokens) ? "task" : kindHint;
  ctx.contextStack.push(
    kind === "task"
      ? "task_list"
      : kind === "bullet"
        ? "bullet_list"
        : "ordered_list",
  );

  let numId = 1; // shared bullet instance
  if (kindHint === "number") {
    numId = ctx.numCounter.n++;
    ctx.nums.push({ numId, abstractNumId: 1 });
  }
  const lc: ListCtx = { numId, ilvl: Math.min(ilvl, 8) };

  const itemParts: string[] = [];
  let j = 0;
  while (j < innerTokens.length) {
    if (innerTokens[j].type === "list_item_open") {
      const liClose = findClosing(innerTokens, j, "list_item_close");
      if (liClose >= 0) {
        const liInner = innerTokens.slice(j + 1, liClose);
        itemParts.push(await renderListItemContent(ctx, liInner, lc));
        j = liClose + 1;
        continue;
      }
    }
    j++;
  }

  ctx.contextStack.pop();
  return itemParts.join("\n");
}

/* ────────────────────────────── tables ────────────────────────────────── */

export function parseTextAlign(
  token: Token | undefined,
): "left" | "center" | "right" {
  const style = token?.attrGet("style") ?? "";
  const m = /text-align:\s*(left|center|right)/i.exec(style);
  const value = m?.[1].toLowerCase();
  return value === "center" || value === "right" ? value : "left";
}

export function countTableColumns(tokens: Token[]): number {
  for (const token of tokens) {
    if (token.type === "tr_open") {
      const closeIdx = findClosing(tokens, tokens.indexOf(token), "tr_close");
      if (closeIdx >= 0) {
        let count = 0;
        for (let j = tokens.indexOf(token); j <= closeIdx; j++) {
          if (tokens[j].type === "th_open" || tokens[j].type === "td_open")
            count++;
        }
        if (count > 0) return count;
      }
    }
  }
  return 1;
}

/**
 * Column widths in twips from content heuristics, normalized so the widths
 * sum **exactly** to the content width (rule 4 — Google Docs needs DXA widths
 * that add up).
 */
export function columnTwips(textLens: number[], colCount: number): number[] {
  const weights = Array.from({ length: colCount }, (_, c) =>
    Math.max(4, textLens[c] ?? 0),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) =>
    Math.floor((CONTENT_WIDTH_TWIPS * w) / total),
  );
  widths[colCount - 1] +=
    CONTENT_WIDTH_TWIPS - widths.reduce((a, b) => a + b, 0);
  return widths;
}

async function renderTable(
  ctx: DocxBuildContext,
  innerTokens: Token[],
): Promise<string> {
  const colCount = countTableColumns(innerTokens);
  interface Cell {
    pieces: Piece[];
    align: "left" | "center" | "right";
    header: boolean;
  }
  const rows: Cell[][] = [];
  let inHeader = false;

  let i = 0;
  while (i < innerTokens.length) {
    const t = innerTokens[i];
    if (t.type === "thead_open") inHeader = true;
    else if (t.type === "thead_close") inHeader = false;
    else if (t.type === "tr_open") {
      const closeIdx = findClosing(innerTokens, i, "tr_close");
      const row: Cell[] = [];
      if (closeIdx >= 0) {
        let j = i + 1;
        while (j < closeIdx) {
          const c = innerTokens[j];
          if (c.type === "th_open" || c.type === "td_open") {
            const isTh = c.type === "th_open";
            const cClose = findClosing(
              innerTokens,
              j,
              c.type.replace("_open", "_close"),
            );
            let pieces: Piece[] = [];
            const next = innerTokens[j + 1];
            if (next?.type === "inline" && next.children) {
              pieces = await renderInline(
                ctx,
                next.children,
                next.map?.[0] ?? 0,
              );
            }
            row.push({
              pieces,
              align: parseTextAlign(c),
              header: isTh || inHeader,
            });
            j = cClose >= 0 ? cClose + 1 : j + 1;
            continue;
          }
          j++;
        }
        rows.push(row);
        i = closeIdx + 1;
        continue;
      }
    }
    i++;
  }

  // Content heuristics for widths: longest plain text per column.
  const textLens = rows.map((row) =>
    row.map((cell) =>
      cell.pieces.reduce(
        (n, p) => (p.kind === "text" ? n + p.text.length : n),
        0,
      ),
    ),
  );
  const colLens = Array.from({ length: colCount }, (_, c) =>
    Math.max(0, ...textLens.map((row) => row[c] ?? 0)),
  );
  const widths = columnTwips(colLens, colCount);

  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const rowsXml: string[] = [];
  for (const row of rows) {
    const header = row.length > 0 && row.every((c) => c.header);
    const cellsXml: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? {
        pieces: [],
        align: "left" as const,
        header: false,
      };
      let runs = "";
      if (header) {
        // Bold the header row (in addition to the shading below).
        runs = piecesToRunsXml(
          cell.pieces.map((p) =>
            p.kind === "text" ? { ...p, props: { ...p.props, bold: true } } : p,
          ),
        );
      } else {
        runs = piecesToRunsXml(cell.pieces);
      }
      const jc =
        cell.align === "center"
          ? '<w:jc w:val="center"/>'
          : cell.align === "right"
            ? '<w:jc w:val="right"/>'
            : "";
      const shd = header
        ? '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>'
        : "";
      cellsXml.push(
        `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>${shd}</w:tcPr>` +
          paragraphXml("", jc, runs) +
          "</w:tc>",
      );
    }
    rowsXml.push(
      `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cellsXml.join("")}</w:tr>`,
    );
  }

  return (
    "<w:tbl><w:tblPr>" +
    `<w:tblW w:w="${CONTENT_WIDTH_TWIPS}" w:type="dxa"/>` +
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map(
        (side) =>
          `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D1D9E0"/>`,
      )
      .join("") +
    "</w:tblBorders>" +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    "</w:tblPr>" +
    `<w:tblGrid>${grid}</w:tblGrid>` +
    rowsXml.join("") +
    "</w:tbl>"
  );
}

/* ──────────────────────────── footnotes ───────────────────────────────── */

/**
 * Footnote body block XML: the first paragraph carries the `w:footnoteRef`
 * mark plus the citation space (as Word writes it), remaining blocks render
 * normally in footnote context (FootnoteText paragraphs).
 */
export async function renderFootnoteBody(
  ctx: DocxBuildContext,
  innerTokens: Token[],
): Promise<string> {
  const refRun =
    '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' +
    "<w:r>" +
    wText(" ") +
    "</w:r>";

  ctx.inFootnote = true;
  const body = await renderTokens(ctx, innerTokens);
  ctx.inFootnote = false;

  // Splice the ref mark into the first paragraph, after its pPr (pPr must
  // stay the paragraph's first child — rule 2), or prepend a marker
  // paragraph when the body does not start with one.
  if (body.startsWith("<w:p><w:pPr>")) {
    const insertAt = body.indexOf("</w:pPr>") + "</w:pPr>".length;
    return body.slice(0, insertAt) + refRun + body.slice(insertAt);
  }
  if (body.startsWith("<w:p>")) {
    return body.slice(0, 5) + refRun + body.slice(5);
  }
  return paragraphXml(S.footnoteText, "", refRun) + body;
}

/* ───────────────────────────── main walk ──────────────────────────────── */

export async function renderTokens(
  ctx: DocxBuildContext,
  tokens: Token[],
): Promise<string> {
  const parts: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    switch (token.type) {
      // ── Headings ──
      case "heading_open": {
        const level = parseInt(token.tag.replace("h", ""), 10) || 1;
        const next = tokens[i + 1];
        let pieces: Piece[] = [];
        if (next?.type === "inline" && next.children) {
          pieces = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "heading_close");
        parts.push(paragraphXml(S.heading(level), "", piecesToRunsXml(pieces)));
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      // ── Paragraph ──
      case "paragraph_open": {
        const next = tokens[i + 1];
        let pieces: Piece[] = [];
        if (next?.type === "inline" && next.children) {
          pieces = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "paragraph_close");
        parts.push(
          paragraphXml(paragraphStyle(ctx), "", piecesToRunsXml(pieces)),
        );
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      // ── Blockquote ──
      case "blockquote_open": {
        const closeIdx = findClosing(tokens, i, "blockquote_close");
        if (closeIdx >= 0) {
          ctx.contextStack.push("blockquote");
          const innerXml = await renderTokens(
            ctx,
            tokens.slice(i + 1, closeIdx),
          );
          ctx.contextStack.pop();
          parts.push(innerXml);
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      // ── Bullet / ordered lists ──
      case "bullet_list_open": {
        const closeIdx = findClosing(tokens, i, "bullet_list_close");
        if (closeIdx >= 0) {
          parts.push(
            await renderList(ctx, tokens.slice(i + 1, closeIdx), "bullet", 0),
          );
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      case "ordered_list_open": {
        const closeIdx = findClosing(tokens, i, "ordered_list_close");
        if (closeIdx >= 0) {
          parts.push(
            await renderList(ctx, tokens.slice(i + 1, closeIdx), "number", 0),
          );
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      // ── List item (fallback) ──
      case "list_item_open": {
        const closeIdx = findClosing(tokens, i, "list_item_close");
        if (closeIdx >= 0) {
          parts.push(
            await renderListItemContent(ctx, tokens.slice(i + 1, closeIdx), {
              numId: 1,
              ilvl: 0,
            }),
          );
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      // ── Table ──
      case "table_open": {
        const closeIdx = findClosing(tokens, i, "table_close");
        if (closeIdx >= 0) {
          parts.push(await renderTable(ctx, tokens.slice(i + 1, closeIdx)));
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      case "thead_open":
      case "thead_close":
      case "tbody_open":
      case "tbody_close":
      case "tr_open":
      case "tr_close":
      case "th_open":
      case "th_close":
      case "td_open":
      case "td_close":
        // Handled inside renderTable.
        i++;
        break;

      // ── Horizontal rule (paragraph bottom border, never a table) ──
      case "hr":
        parts.push(
          "<w:p><w:pPr>" +
            '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D9E0"/></w:pBdr>' +
            '<w:spacing w:after="160"/></w:pPr></w:p>',
        );
        i++;
        break;

      // ── Code block (indented) ──
      case "code_block": {
        const lines = token.content.replace(/\n$/, "").split("\n");
        for (const line of lines) {
          parts.push(
            paragraphXml(S.codeBlock, "", `<w:r>${wText(line)}</w:r>`),
          );
        }
        i++;
        break;
      }

      // ── Fence (code block with language) ──
      case "fence": {
        const language = token.info.trim();
        const fenceLang = language.split(/\s+/)[0].toLowerCase();
        // Fenced math blocks route to math rendering (ODT parity).
        if (fenceLang === "math") {
          let fenceOpts: Record<string, unknown> = {};
          const rawAttrs = extractBraceAttrs(language);
          if (rawAttrs) {
            fenceOpts = validateExplicitFenceOptions(
              parseAttrString(rawAttrs),
              KATEX_OPTIONS_SCHEMA,
            );
          }
          parts.push(
            await renderMath(
              ctx,
              "block",
              token.content,
              buildMathRenderOpts(ctx, token.map?.[0] ?? 0, fenceOpts),
            ),
          );
          i++;
          break;
        }
        if (fenceLang === "mermaid") {
          const label = `mermaid(token@${i})`;
          let mermaidFenceOpts: Record<string, unknown> = {};
          const mermaidRawAttrs = extractBraceAttrs(language);
          if (mermaidRawAttrs) {
            mermaidFenceOpts = validateExplicitFenceOptions(
              parseAttrString(mermaidRawAttrs),
              MERMAID_OPTIONS_SCHEMA,
            );
          }
          const mermaidOpts = buildMermaidOptions(
            ctx,
            token.map?.[0] ?? 0,
            mermaidFenceOpts,
          );
          try {
            const svgXml = await renderMermaidSvgForExport(
              token.content,
              mermaidOpts,
            );
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(svgXml),
              label,
              ctx.warnings,
            ) ?? { width: 0, height: 0 };
            const { frameWidthPx, frameHeightPx } = computeMermaidFrameDims(
              dims.width,
              dims.height,
              mermaidOpts,
            );
            const frameDims = {
              width: Math.round(frameWidthPx),
              height: Math.round(frameHeightPx),
            };
            const drawing = await embedSvgGraphic(
              ctx,
              svgXml,
              frameDims,
              label,
              "Mermaid diagram",
            );
            const jc =
              mermaidOpts.align === "left"
                ? '<w:jc w:val="left"/>'
                : mermaidOpts.align === "right"
                  ? '<w:jc w:val="right"/>'
                  : '<w:jc w:val="center"/>';
            parts.push(paragraphXml("", jc, drawing));
            i++;
            break;
          } catch (err) {
            ctx.warnings.push(
              `Mermaid rendering failed (${err instanceof Error ? err.message : String(err)}); exported as source code.`,
            );
          }
        }
        if (fenceLang === "smiles" || fenceLang === "smi") {
          const label = `smiles(token@${i})`;
          let smilesFenceOpts: Record<string, unknown> = {};
          const smilesRawAttrs = extractBraceAttrs(language);
          if (smilesRawAttrs) {
            smilesFenceOpts = validateExplicitFenceOptions(
              parseAttrString(smilesRawAttrs),
              SMILES_OPTIONS_SCHEMA,
            );
          }
          const smilesOpts = buildSmilesOptions(
            ctx,
            token.map?.[0] ?? 0,
            smilesFenceOpts,
          );
          try {
            await ensureSmilesLoaded();
            const svgXml = renderSmilesSvg(token.content, smilesOpts);
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(svgXml),
              label,
              ctx.warnings,
            ) ?? { width: 0, height: 0 };
            const { frameWidthPx, frameHeightPx } = fitDrawingToPage(
              dims.width,
              dims.height,
            );
            const frameDims = {
              width: Math.round(frameWidthPx),
              height: Math.round(frameHeightPx),
            };
            const drawing = await embedSvgGraphic(
              ctx,
              svgXml,
              frameDims,
              label,
              "Molecule",
            );
            const jc =
              smilesOpts.align === "left"
                ? '<w:jc w:val="left"/>'
                : smilesOpts.align === "right"
                  ? '<w:jc w:val="right"/>'
                  : '<w:jc w:val="center"/>';
            parts.push(paragraphXml("", jc, drawing));
            i++;
            break;
          } catch (err) {
            ctx.warnings.push(
              `SMILES rendering failed (${err instanceof Error ? err.message : String(err)}); exported as source code.`,
            );
          }
        }
        // Vega-Lite charts embed like Mermaid diagrams and SMILES structures
        // (dual-embed vector SVG with PNG fallback via embedSvgGraphic). The
        // export render resolves `theme=auto` to the neutral light look, and
        // localimg image hrefs are inlined to data: URIs so the vector blip
        // stands alone outside the webview. On render failure we fall through
        // and keep the source as a preformatted code block.
        if (fenceLang === "vega-lite" || fenceLang === "vegalite") {
          const label = `vega-lite(token@${i})`;
          let vegaLiteFenceOpts: Record<string, unknown> = {};
          const vegaLiteRawAttrs = extractBraceAttrs(language);
          if (vegaLiteRawAttrs) {
            vegaLiteFenceOpts = validateExplicitFenceOptions(
              parseAttrString(vegaLiteRawAttrs),
              VEGA_LITE_OPTIONS_SCHEMA,
            );
          }
          const vegaLiteOpts = buildVegaLiteOptions(
            ctx,
            token.map?.[0] ?? 0,
            vegaLiteFenceOpts,
          );
          try {
            // Lazy-load the vega chunks outside the render so a load
            // failure propagates to the fallthrough below.
            await ensureVegaLoaded();
            const rendered = await renderVegaLiteSvgForExport(
              token.content,
              vegaLiteOpts,
              ctx.filePath,
            );
            ctx.warnings.push(...rendered.warnings);
            const inlined = await inlineSvgImageHrefs(
              rendered.svg,
              ctx.invokeImpl,
            );
            const svgXml = inlined.svg;
            ctx.warnings.push(...inlined.warnings);
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(svgXml),
              label,
              ctx.warnings,
            ) ?? { width: 0, height: 0 };
            const { frameWidthPx, frameHeightPx } = computeVegaLiteFrameDims(
              dims.width,
              dims.height,
              vegaLiteOpts,
            );
            const frameDims = {
              width: Math.round(frameWidthPx),
              height: Math.round(frameHeightPx),
            };
            const drawing = await embedSvgGraphic(
              ctx,
              svgXml,
              frameDims,
              label,
              "Vega-Lite chart",
            );
            const jc =
              vegaLiteOpts.align === "left"
                ? '<w:jc w:val="left"/>'
                : vegaLiteOpts.align === "right"
                  ? '<w:jc w:val="right"/>'
                  : '<w:jc w:val="center"/>';
            parts.push(paragraphXml("", jc, drawing));
            i++;
            break;
          } catch (err) {
            ctx.warnings.push(
              `Vega-Lite rendering failed (${err instanceof Error ? err.message : String(err)}); exported as source code.`,
            );
          }
        }
        // Syntax-highlighted code, one paragraph per line (never a `\n`
        // inside a run — rule 7).
        const code = token.content.replace(/\n$/, "");
        for (const line of code.split("\n")) {
          const spans = hljsToSpans(line, language);
          const pieces: Piece[] = [];
          let srcPos = 0;
          for (const span of spans) {
            if (srcPos >= line.length) break;
            const takeLen = Math.min(span.text.length, line.length - srcPos);
            if (takeLen <= 0) continue;
            const chunk = line.slice(srcPos, srcPos + takeLen);
            pieces.push(
              textPiece(chunk, span.color ? { color: span.color } : {}),
            );
            srcPos += takeLen;
          }
          if (srcPos < line.length) {
            pieces.push(textPiece(line.slice(srcPos), {}));
          }
          parts.push(paragraphXml(S.codeBlock, "", piecesToRunsXml(pieces)));
        }
        i++;
        break;
      }

      // ── HTML block ──
      case "html_block": {
        const html = token.content.trim();
        if (html.startsWith("<hr") || html.startsWith("<hr/>")) {
          parts.push(
            "<w:p><w:pPr>" +
              '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D1D9E0"/></w:pBdr>' +
              '<w:spacing w:after="160"/></w:pPr></w:p>',
          );
        } else if (html.startsWith("<svg") && /<\/svg>\s*$/i.test(html)) {
          const label = `html_block-svg(token@${i})`;
          const dims = sniffSvgDimensions(
            new TextEncoder().encode(html),
            label,
            ctx.warnings,
          ) ?? { width: 0, height: 0 };
          const drawing = await embedSvgGraphic(
            ctx,
            html,
            dims,
            label,
            "inline SVG",
          );
          parts.push(paragraphXml(paragraphStyle(ctx), "", drawing));
        }
        i++;
        break;
      }

      // ── Math block ──
      case "math_block": {
        parts.push(
          await renderMath(
            ctx,
            "block",
            token.content,
            buildMathRenderOpts(ctx, token.map?.[0] ?? 0),
          ),
        );
        i++;
        break;
      }

      // ── Footnotes (bodies pre-rendered into ctx.footnoteDefs) ──
      case "footnote_open": {
        const closeIdx = findClosing(tokens, i, "footnote_close");
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      case "footnote_block_open": {
        const closeIdx = findClosing(tokens, i, "footnote_block_close");
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      case "footnote_close":
      case "footnote_block_close":
      case "footnote_anchor":
        i++;
        break;

      // ── Standalone inline token ──
      case "inline":
        if (token.children) {
          const pieces = await renderInline(
            ctx,
            token.children,
            token.map?.[0] ?? 0,
          );
          parts.push(
            paragraphXml(paragraphStyle(ctx), "", piecesToRunsXml(pieces)),
          );
        }
        i++;
        break;

      default:
        i++;
    }
  }

  return parts.join("\n");
}
