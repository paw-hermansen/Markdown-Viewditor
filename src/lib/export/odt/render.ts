import type Token from "markdown-it/lib/token.mjs";
import type { InvokeImpl } from "../assets";
import type { ExportOptions } from "./options";
import type { ResolvedImage } from "./images";
import type { AutomaticStyle, MathObject } from "./odf-styles";
import { createBuildContext } from "./context";
import { renderTokens } from "./blocks";
import { findClosing } from "../token-walker";

interface BuildResult {
  bodyXml: string;
  autoStyles: AutomaticStyle[];
  images: Map<string, ResolvedImage>;
  mathObjects: MathObject[];
}

export async function buildDocument(
  tokens: Token[],
  invokeImpl: InvokeImpl,
  warnings: string[],
  options: ExportOptions,
  directiveStateMap: Array<[number, Record<string, unknown>]> = [],
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]> = [],
): Promise<BuildResult> {
  const ctx = createBuildContext({
    invokeImpl,
    warnings,
    options,
    directiveStateMap,
    mermaidDirectiveStateMap,
  });

  // ── pre-render footnote bodies ──
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
          const fnClose = findClosing(tokens, j, "footnote_close");
          if (fnClose >= 0) {
            const innerTokens = tokens.slice(j + 1, fnClose);
            // Filter out footnote_anchor — ODT uses text:note-citation instead
            const bodyTokens = innerTokens.filter(
              (t) => t.type !== "footnote_anchor",
            );
            const bodyXml = await renderTokens(ctx, bodyTokens);
            ctx.footnoteBodies.set(noteId, bodyXml);
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
    autoStyles: Array.from(ctx.autoStyles.entries()).map(([name, xml]) => ({
      name,
      xml,
    })),
    images: ctx.images,
    mathObjects: ctx.mathObjects,
  };
}
