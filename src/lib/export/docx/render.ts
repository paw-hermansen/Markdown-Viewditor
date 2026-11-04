/**
 * Top-level document build for the DOCX exporter (mirrors `odt/render.ts`):
 * pre-render footnote bodies in document order, then walk the main token
 * stream once. All mutable state lives in the {@link DocxBuildContext}.
 */
import type Token from "markdown-it/lib/token.mjs";
import type { InvokeImpl } from "../assets";
import type { ExportOptions } from "./options";
import type { ResolvedImage } from "../images";
import type { FootnoteDef, RelEntry } from "./context";
import type { NumEntry } from "./styles";
import { createBuildContext } from "./context";
import { renderFootnoteBody, renderTokens } from "./blocks";
import { findClosing } from "../token-walker";

export interface BuildResult {
  bodyXml: string;
  images: Map<string, ResolvedImage>;
  rels: RelEntry[];
  nums: NumEntry[];
  footnoteDefs: FootnoteDef[];
}

export async function buildDocument(
  tokens: Token[],
  invokeImpl: InvokeImpl,
  warnings: string[],
  options: ExportOptions,
  directiveStateMap: Array<[number, Record<string, unknown>]> = [],
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]> = [],
  smilesDirectiveStateMap: Array<[number, Record<string, unknown>]> = [],
): Promise<BuildResult> {
  const ctx = createBuildContext({
    invokeImpl,
    warnings,
    options,
    directiveStateMap,
    mermaidDirectiveStateMap,
    smilesDirectiveStateMap,
  });

  // ── pre-render footnote bodies (document order = w:id order) ──
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === "footnote_block_open") {
      const blockClose = findClosing(tokens, i, "footnote_block_close");
      const end = blockClose >= 0 ? blockClose : tokens.length;
      let j = i + 1;
      while (j < end) {
        if (tokens[j].type === "footnote_open") {
          const noteId = String(
            tokens[j].meta?.id ?? tokens[j].meta?.label ?? "",
          );
          const label = String(tokens[j].meta?.label ?? noteId);
          const fnClose = findClosing(tokens, j, "footnote_close");
          if (fnClose >= 0 && !ctx.footnoteById.has(noteId)) {
            const innerTokens = tokens
              .slice(j + 1, fnClose)
              .filter((t) => t.type !== "footnote_anchor");
            const def: FootnoteDef = {
              id: ctx.footnoteCounter.n++,
              label,
              bodyXml: await renderFootnoteBody(ctx, innerTokens),
            };
            ctx.footnoteById.set(noteId, def);
            ctx.footnoteDefs.push(def);
          }
          j = fnClose >= 0 ? fnClose + 1 : j + 1;
        } else {
          j++;
        }
      }
      break;
    }
  }

  const bodyXml = await renderTokens(ctx, tokens);

  return {
    bodyXml,
    images: ctx.images,
    rels: ctx.rels,
    nums: ctx.nums,
    footnoteDefs: ctx.footnoteDefs,
  };
}
