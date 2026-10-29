import type Token from "markdown-it/lib/token.mjs";
import { escapeXml } from "$lib/utils/escape";
import { S, listStyleName, type ListKind } from "./odf-styles";
import { findClosing } from "../token-walker";
import { escWithSpaces } from "./utils";
import { hljsToSpans, renderHighlightedLine } from "./highlight";
import { computeMermaidFrameDims } from "./dimensions";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "$lib/extensions/fence-options";
import { KATEX_OPTIONS_SCHEMA } from "$lib/extensions/katex/renderer";
import { MERMAID_OPTIONS_SCHEMA } from "$lib/extensions/mermaid/schema";
import { renderMermaidSvgForExport } from "$lib/extensions/mermaid/renderer";
import { sniffSvgDimensions } from "./images";
import type { OdtBuildContext } from "./context";
import {
  renderMathObject,
  buildMermaidOptions,
  buildMathRenderOpts,
  tryRasterizeSvg,
  addSvgImage,
} from "./media";
import { renderInline } from "./inline";

export function paragraphStyle(ctx: OdtBuildContext): string {
  let quoteDepth = 0;
  for (let j = 0; j < ctx.contextStack.length; j++) {
    if (ctx.contextStack[j] === "blockquote") quoteDepth++;
  }
  if (quoteDepth > 0) return S.quote(Math.min(quoteDepth, 9));
  return S.body;
}

export function listItemParagraphStyle(ctx: OdtBuildContext): string {
  let quoteDepth = 0;
  for (let j = 0; j < ctx.contextStack.length; j++) {
    if (ctx.contextStack[j] === "blockquote") quoteDepth++;
  }
  return quoteDepth > 0
    ? `QuoteList_20_${Math.min(quoteDepth, 9)}`
    : "Standard";
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

export async function renderListItemContent(
  ctx: OdtBuildContext,
  liInner: Token[],
): Promise<string> {
  // Detect checkbox prefix for task list items and strip checkbox HTML
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
          checkboxPrefix = "\u2611 ";
        } else if (html.includes("task-list-item-checkbox")) {
          checkboxPrefix = "\u2610 ";
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
        const nestedKind: ListKind =
          t.type === "bullet_list_open" ? "bullet" : "number";
        result += await renderList(
          ctx,
          liInner.slice(i + 1, closeIdx),
          nestedKind,
        );
        i = closeIdx + 1;
        continue;
      }
    }
    // Render inline/paragraph content
    if (t.type === "paragraph_open") {
      const next = liInner[i + 1];
      let content = "";
      if (next?.type === "inline" && next.children) {
        content = await renderInline(
          ctx,
          stripCheckbox(next.children),
          next.map?.[0] ?? 0,
        );
      }
      if (firstParagraph && checkboxPrefix) {
        content = escapeXml(checkboxPrefix) + content;
        firstParagraph = false;
      }
      const closeIdx = findClosing(liInner, i, "paragraph_close");
      result += `<text:p text:style-name="${listItemParagraphStyle(ctx)}">${content}</text:p>\n`;
      i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
      continue;
    }
    // Standalone inline (tight lists skip paragraph_open)
    if (t.type === "inline" && t.children) {
      let content = await renderInline(
        ctx,
        stripCheckbox(t.children),
        t.map?.[0] ?? 0,
      );
      if (firstParagraph && checkboxPrefix) {
        content = escapeXml(checkboxPrefix) + content;
        firstParagraph = false;
      }
      result += `<text:p text:style-name="${listItemParagraphStyle(ctx)}">${content}</text:p>\n`;
      i++;
      continue;
    }
    i++;
  }
  return result;
}

export async function renderList(
  ctx: OdtBuildContext,
  innerTokens: Token[],
  kindHint: ListKind,
): Promise<string> {
  const kind: ListKind =
    kindHint === "bullet" && detectTaskList(innerTokens) ? "task" : kindHint;
  ctx.contextStack.push(
    kind === "task"
      ? "task_list"
      : kind === "bullet"
        ? "bullet_list"
        : "ordered_list",
  );
  const sn = listStyleName(kind);

  const itemParts: string[] = [];
  let j = 0;
  while (j < innerTokens.length) {
    if (innerTokens[j].type === "list_item_open") {
      const liClose = findClosing(innerTokens, j, "list_item_close");
      if (liClose >= 0) {
        const liInner = innerTokens.slice(j + 1, liClose);
        const contentXml = await renderListItemContent(ctx, liInner);
        itemParts.push(
          `        <text:list-item>\n${contentXml}        </text:list-item>`,
        );
        j = liClose + 1;
        continue;
      }
    }
    j++;
  }

  ctx.contextStack.pop();
  return `      <text:list text:style-name="${sn}">\n${itemParts.join("\n")}\n      </text:list>`;
}

export async function renderTokens(
  ctx: OdtBuildContext,
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
        let content = "";
        if (next?.type === "inline" && next.children) {
          content = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "heading_close");
        parts.push(
          `      <text:p text:style-name="${S.heading(level)}">${content}</text:p>`,
        );
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      // ── Paragraph ──
      case "paragraph_open": {
        const next = tokens[i + 1];
        let content = "";
        if (next?.type === "inline" && next.children) {
          content = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "paragraph_close");
        const inList = ctx.contextStack.some(
          (c) =>
            c === "bullet_list" || c === "ordered_list" || c === "task_list",
        );
        const style = inList ? "Standard" : paragraphStyle(ctx);
        parts.push(
          `      <text:p text:style-name="${escapeXml(style)}">${content}</text:p>`,
        );
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      // ── Blockquote ──
      case "blockquote_open": {
        const closeIdx = findClosing(tokens, i, "blockquote_close");
        if (closeIdx >= 0) {
          const isTopLevel = !ctx.contextStack.includes("blockquote");
          ctx.contextStack.push("blockquote");
          const innerXml = await renderTokens(
            ctx,
            tokens.slice(i + 1, closeIdx),
          );
          ctx.contextStack.pop();
          if (isTopLevel) {
            parts.push(
              `<table:table table:style-name="QuoteTable">\n  <table:table-column/>\n  <table:table-row>\n    <table:table-cell table:style-name="QuoteTableCell">\n${innerXml}\n    </table:table-cell>\n  </table:table-row>\n</table:table>`,
            );
          } else {
            parts.push(innerXml);
          }
          i = closeIdx + 1;
          if (i < tokens.length && tokens[i].type === "blockquote_open") {
            parts.push('<text:p text:style-name="Standard"><text:s/></text:p>');
          }
        } else {
          i++;
        }
        break;
      }

      // ── Bullet list ──
      case "bullet_list_open": {
        const closeIdx = findClosing(tokens, i, "bullet_list_close");
        if (closeIdx >= 0) {
          const innerTokens = tokens.slice(i + 1, closeIdx);
          const xml = await renderList(ctx, innerTokens, "bullet");
          parts.push(xml);
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      // ── Ordered list ──
      case "ordered_list_open": {
        const closeIdx = findClosing(tokens, i, "ordered_list_close");
        if (closeIdx >= 0) {
          const innerTokens = tokens.slice(i + 1, closeIdx);
          const xml = await renderList(ctx, innerTokens, "number");
          parts.push(xml);
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
          const innerTokens = tokens.slice(i + 1, closeIdx);
          const contentXml = await renderListItemContent(ctx, innerTokens);
          parts.push(
            `        <text:list-item>\n${contentXml}\n        </text:list-item>`,
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
          const innerTokens = tokens.slice(i + 1, closeIdx);
          const colCount = countTableColumns(innerTokens);
          const colsXml = Array(colCount)
            .fill("          <table:table-column/>")
            .join("\n");
          const innerXml = await renderTokens(ctx, innerTokens);
          parts.push(
            `      <table:table>\n        <table:table-columns>\n${colsXml}\n        </table:table-columns>\n${innerXml}\n      </table:table>`,
          );
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
        i++;
        break;

      case "tr_open": {
        const closeIdx = findClosing(tokens, i, "tr_close");
        if (closeIdx >= 0) {
          const innerXml = await renderTokens(
            ctx,
            tokens.slice(i + 1, closeIdx),
          );
          parts.push(
            `        <table:table-row>\n${innerXml}\n        </table:table-row>`,
          );
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      case "th_open": {
        const next = tokens[i + 1];
        let content = "";
        if (next?.type === "inline" && next.children) {
          content = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "th_close");
        parts.push(
          `          <table:table-cell><text:p text:style-name="${S.cellHeadAligned(parseTextAlign(tokens[i]))}">${content}</text:p></table:table-cell>`,
        );
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      case "td_open": {
        const next = tokens[i + 1];
        let content = "";
        if (next?.type === "inline" && next.children) {
          content = await renderInline(ctx, next.children, next.map?.[0] ?? 0);
        }
        const closeIdx = findClosing(tokens, i, "td_close");
        parts.push(
          `          <table:table-cell><text:p text:style-name="${S.cellAligned(parseTextAlign(tokens[i]))}">${content}</text:p></table:table-cell>`,
        );
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        break;
      }

      // ── Horizontal rule ──
      case "hr":
        parts.push(
          '      <text:p text:style-name="Horizontal_20_Rule"> </text:p>',
        );
        i++;
        break;

      // ── Code block (indented) ──
      case "code_block": {
        const lines = token.content.trimEnd().split("\n");
        for (const line of lines) {
          parts.push(
            `      <text:p text:style-name="${S.pre}">${escWithSpaces(line)}</text:p>`,
          );
        }
        i++;
        break;
      }

      // ── Fence (code block with language) ──
      case "fence": {
        const language = token.info.trim();
        const fenceLang = language.split(/\s+/)[0].toLowerCase();
        // Fenced math blocks (```math ... ```) stay as fence tokens
        // because @vscode/markdown-it-katex only overrides the HTML
        // renderer, not the token type. Route them to math rendering.
        if (fenceLang === "math") {
          // Parse fence attributes {key=val} from info string and merge
          // with HTML comment directives (fence attrs override).
          let fenceOpts: Record<string, unknown> = {};
          const rawAttrs = extractBraceAttrs(language);
          if (rawAttrs) {
            const parsed = parseAttrString(rawAttrs);
            fenceOpts = validateExplicitFenceOptions(
              parsed,
              KATEX_OPTIONS_SCHEMA,
            );
          }
          const sourceLine = token.map?.[0] ?? 0;
          parts.push(
            await renderMathObject(
              ctx,
              "block",
              token.content,
              buildMathRenderOpts(ctx, sourceLine, fenceOpts),
            ),
          );
          i++;
          break;
        }
        // Mermaid diagrams embed as an image (vector SVG, or PNG when the
        // shared SVG/diagram rasterize option is on). The frame sits in a
        // paragraph whose text-align mirrors the viewer's horizontal
        // alignment (align option, default center). On render failure we
        // fall through and keep the source as a preformatted code block.
        if (fenceLang === "mermaid") {
          const label = `mermaid(token@${i})`;
          // Parse fence attributes {key=val} from info string and merge
          // with HTML comment directives (fence attrs override).
          let mermaidFenceOpts: Record<string, unknown> = {};
          const mermaidRawAttrs = extractBraceAttrs(language);
          if (mermaidRawAttrs) {
            const parsed = parseAttrString(mermaidRawAttrs);
            mermaidFenceOpts = validateExplicitFenceOptions(
              parsed,
              MERMAID_OPTIONS_SCHEMA,
            );
          }
          const mermaidOpts = buildMermaidOptions(
            ctx,
            token.map?.[0] ?? 0,
            mermaidFenceOpts,
          );
          try {
            // Pass the resolved host options: mermaid diagrams are built
            // for the width the viewer displays them at (gantt lays its
            // geometry out for exactly that — see diagramRenderWidth), so
            // the export matches the screen.
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
            const rasterized = await tryRasterizeSvg(
              ctx,
              svgXml,
              frameDims,
              label,
            );
            const inner = rasterized ?? addSvgImage(ctx, svgXml, frameDims);
            parts.push(
              `      <text:p text:style-name="${S.diagramDisplay(mermaidOpts.align)}">${inner}</text:p>`,
            );
            i++;
            break;
          } catch (err) {
            ctx.warnings.push(
              `Mermaid rendering failed (${err instanceof Error ? err.message : String(err)}); exported as source code.`,
            );
          }
        }
        const code = token.content.trimEnd();
        const lines = code.split("\n");
        for (const line of lines) {
          const lineSpans = hljsToSpans(line, language);
          const lineXml = renderHighlightedLine(
            line,
            lineSpans,
            ctx.autoStyles,
          );
          parts.push(
            `      <text:p text:style-name="${S.pre}">${lineXml}</text:p>`,
          );
        }
        i++;
        break;
      }

      // ── HTML block ──
      case "html_block": {
        const html = token.content.trim();
        if (html.startsWith("<hr") || html.startsWith("<hr/>")) {
          parts.push(
            '      <text:p text:style-name="Horizontal_20_Rule"> </text:p>',
          );
        } else if (html.startsWith("<svg") && /<\/svg>\s*$/i.test(html)) {
          const label = `html_block-svg(token@${i})`;
          const dims = sniffSvgDimensions(
            new TextEncoder().encode(html),
            label,
            ctx.warnings,
          ) ?? { width: 0, height: 0 };
          const rasterized = await tryRasterizeSvg(ctx, html, dims, label);
          const inner = rasterized ?? addSvgImage(ctx, html, dims);
          parts.push(
            `      <text:p text:style-name="${paragraphStyle(ctx)}">${inner}</text:p>`,
          );
        }
        i++;
        break;
      }

      // ── Math block ──
      case "math_block": {
        parts.push(
          await renderMathObject(
            ctx,
            "block",
            token.content,
            buildMathRenderOpts(ctx, token.map?.[0] ?? 0),
          ),
        );
        i++;
        break;
      }

      // ── Footnotes (pre-rendered into ctx.footnoteBodies map) ──
      case "footnote_open": {
        const closeIdx = findClosing(tokens, i, "footnote_close");
        if (closeIdx >= 0) {
          // Body already pre-rendered and injected via footnote_ref inline
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      case "footnote_block_open": {
        const closeIdx = findClosing(tokens, i, "footnote_block_close");
        if (closeIdx >= 0) {
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }

      case "footnote_close":
      case "footnote_block_close":
        i++;
        break;

      // ── Standalone inline token ──
      case "inline":
        if (token.children) {
          const content = await renderInline(
            ctx,
            token.children,
            token.map?.[0] ?? 0,
          );
          parts.push(
            `      <text:p text:style-name="${paragraphStyle(ctx)}">${content}</text:p>`,
          );
        }
        i++;
        break;

      // ── Ignored tokens ──
      case "paragraph_close":
      case "heading_close":
      case "blockquote_close":
      case "bullet_list_close":
      case "ordered_list_close":
      case "list_item_close":
      case "table_close":
      case "tr_close":
      case "th_close":
      case "td_close":
      case "math_inline":
      case "footnote_ref":
        i++;
        break;

      default:
        i++;
    }
  }

  return parts.join("\n");
}

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
