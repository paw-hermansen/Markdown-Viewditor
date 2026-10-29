import {
  renderMathToMathml,
  renderMathToPng,
  type MathmlRenderOptions,
} from "../math-render";
import { lookupDirectiveState } from "$lib/extensions/directives";
import { mergeOptions } from "$lib/extensions/directive-merge";
import { KATEX_OPTIONS_SCHEMA } from "$lib/extensions/katex/renderer";
import { rasterizeSvg } from "../svg-rasterize";
import { MERMAID_OPTIONS_SCHEMA } from "$lib/extensions/mermaid/schema";
import { escapeXml } from "$lib/utils/escape";
import { S } from "./odf-styles";
import { fitFrameToPage } from "./dimensions";
import type { OdtBuildContext } from "./context";

export function uniqueDrawName(ctx: OdtBuildContext, base: string): string {
  const count = ctx.drawNameCount.get(base) ?? 0;
  ctx.drawNameCount.set(base, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

export function buildMathRenderOpts(
  ctx: OdtBuildContext,
  sourceLine: number,
  fenceOpts: Record<string, unknown> = {},
): MathmlRenderOptions {
  const dirState = lookupDirectiveState(ctx.directiveStateMap, sourceLine);
  const merged = mergeOptions(KATEX_OPTIONS_SCHEMA, dirState, fenceOpts);
  const opts: MathmlRenderOptions = {};
  if (merged.leqno !== undefined) opts.leqno = !!merged.leqno;
  if (merged.fleqn !== undefined) opts.fleqn = !!merged.fleqn;
  if (typeof merged.fontsize === "number" && merged.fontsize !== 1.0)
    opts.fontsize = merged.fontsize as number;
  return opts;
}

export function buildMermaidOptions(
  ctx: OdtBuildContext,
  sourceLine: number,
  fenceOpts: Record<string, unknown> = {},
): { align: string; maxWidth: number; fitToWidth: boolean } {
  const dirState = lookupDirectiveState(
    ctx.mermaidDirectiveStateMap,
    sourceLine,
  );
  const merged = mergeOptions(MERMAID_OPTIONS_SCHEMA, dirState, fenceOpts);
  return {
    align: typeof merged.align === "string" ? merged.align : "center",
    maxWidth: typeof merged.maxWidth === "number" ? merged.maxWidth : 800,
    fitToWidth:
      typeof merged.fitToWidth === "boolean" ? merged.fitToWidth : true,
  };
}

export function ensureAutoStyle(
  ctx: OdtBuildContext,
  name: string,
  xml: string,
): void {
  if (!ctx.autoStyles.has(name)) {
    ctx.autoStyles.set(name, xml);
  }
}

export function addRasterImage(
  ctx: OdtBuildContext,
  data: Uint8Array,
  widthPx: number,
  heightPx: number,
  graphicStyle = "fr1",
  cacheKey?: string,
): string {
  const name = `Pictures/image${ctx.imageCounter.n++}.png`;
  // `cacheKey` is the logical image identity (its markdown/HTML source) so
  // a replacement raster supersedes the entry it replaces and later
  // references reuse it. Without one, the image is synthesized and keyed
  // by its own package name, which is unique by construction.
  ctx.images.set(cacheKey ?? name, {
    name,
    mime: "image/png",
    data,
    widthPx,
    heightPx,
  });
  let sizeAttrs = "";
  if (widthPx > 0 && heightPx > 0) {
    sizeAttrs = ` svg:width="${(widthPx / 96).toFixed(4)}in" svg:height="${(heightPx / 96).toFixed(4)}in"`;
  }
  return `<draw:frame draw:style-name="${graphicStyle}" draw:name="${escapeXml(name)}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(name)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/></draw:frame>`;
}

export function addSvgImage(
  ctx: OdtBuildContext,
  svgXml: string,
  dims: { width: number; height: number },
): string {
  const bytes = new TextEncoder().encode(svgXml);
  const name = `Pictures/image${ctx.imageCounter.n++}.svg`;
  ctx.images.set(name, {
    name,
    mime: "image/svg+xml",
    data: bytes,
    widthPx: dims.width,
    heightPx: dims.height,
  });
  let sizeAttrs = "";
  if (dims.width > 0 && dims.height > 0) {
    sizeAttrs = ` svg:width="${(dims.width / 96).toFixed(4)}in" svg:height="${(dims.height / 96).toFixed(4)}in"`;
  }
  return `<draw:frame draw:style-name="fr1" draw:name="${escapeXml(name)}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(name)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/svg+xml"/></draw:frame>`;
}

export async function tryRasterizeSvg(
  ctx: OdtBuildContext,
  svgXml: string,
  dims: { width: number; height: number },
  srcLabel: string,
  cacheKey?: string,
): Promise<string | null> {
  if (!ctx.rasterizeSvgFlag) return null;
  if (dims.width <= 0 || dims.height <= 0) {
    ctx.warnings.push(
      `SVG ${srcLabel}: cannot rasterize without dimensions; embedded as vector SVG.`,
    );
    return null;
  }
  try {
    const png = await rasterizeSvg(
      svgXml,
      dims.width,
      dims.height,
      ctx.rasterScale,
    );
    return addRasterImage(ctx, png, dims.width, dims.height, "fr1", cacheKey);
  } catch (err) {
    ctx.warnings.push(
      `SVG ${srcLabel} rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function renderMathObject(
  ctx: OdtBuildContext,
  kind: "inline" | "block",
  tex: string,
  renderOpts: MathmlRenderOptions,
): Promise<string> {
  const display = kind === "block";
  const label = display ? "Block" : "Inline";
  const frameOf = (frame: string): string =>
    display
      ? `      <text:p text:style-name="${S.mathDisplay}">${frame}</text:p>`
      : frame;

  if (ctx.rasterizeMath) {
    try {
      const { png, widthPx, heightPx } = await renderMathToPng({
        tex,
        displayMode: display,
        resolution: ctx.rasterScale,
        targetFontSize: ctx.mathTargetFontSize,
        ...renderOpts,
      });
      const { frameWidthPx, frameHeightPx } = fitFrameToPage(widthPx, heightPx);
      // "Formula" centers inline frames vertically; "fr1" leaves block
      // frames to the centered Math_20_Display paragraph.
      return frameOf(
        addRasterImage(
          ctx,
          png,
          frameWidthPx,
          frameHeightPx,
          display ? "fr1" : "Formula",
        ),
      );
    } catch (err) {
      ctx.warnings.push(
        `${label} math rasterization failed (${err instanceof Error ? err.message : String(err)}); embedded as native formula.`,
      );
    }
  }

  try {
    const mathMl = renderMathToMathml(tex, display, renderOpts);
    const objId = `Object ${++ctx.mathCounter.n}`;
    ctx.mathObjects.push({ id: objId, mathml: mathMl });
    return frameOf(
      `<draw:frame draw:style-name="Formula" draw:name="${objId}" text:anchor-type="as-char" draw:z-index="0"><draw:object xlink:href="./${objId}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`,
    );
  } catch {
    ctx.warnings.push(
      `${label} math rendering failed for: ${tex.slice(0, 50)}…`,
    );
    return display
      ? `      <text:p text:style-name="${S.body}">${escapeXml(tex)}</text:p>`
      : escapeXml(tex);
  }
}
