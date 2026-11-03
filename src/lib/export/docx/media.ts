/**
 * Drawings, math, and diagrams for the DOCX exporter (EXPORT-PLAN 8.7/8.8).
 *
 * Everything visual becomes an inline `w:drawing` (rule 6 — never floating).
 * SVG-derived content is PNG-only by default (`docx.rasterizeSvg` on); the
 * opt-in vector mode embeds `asvg:svgBlip` **with its mandatory PNG fallback**
 * (rule 14 — a dual embed is the only SVG form OOXML has).
 */
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
import { SMILES_OPTIONS_SCHEMA } from "$lib/extensions/smiles/schema";
import {
  resolveSmilesOptions,
  type SmilesRenderOptions,
} from "$lib/extensions/smiles/renderer";
import { materializeSvgPaint } from "$lib/extensions/mermaid/svg-paint";
import { base64ToBytes } from "$lib/utils/base64";
import type { DocxBuildContext } from "./context";
import { cssLengthToInches, type ResolvedImage } from "../images";
import { mathmlToOmml } from "./omml";
import { esc, wText } from "./utils";
import {
  pxToEmu,
  fitDrawingToPage,
  inlineMathShiftPx,
  pxToHalfPoints,
} from "./dimensions";

export const REL_IMAGE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
export const REL_HYPERLINK =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * A 1×1 transparent PNG — the last-resort fallback blip for a vector embed
 * whose PNG fallback could not be rasterized (rule 14: every `svgBlip` keeps
 * a raster fallback; the SVG still shows in viewers that understand it).
 */
const TRANSPARENT_PNG = base64ToBytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
);

/** Register synthesized media bytes under `word/media/imageN.ext`. */
function registerMedia(
  ctx: DocxBuildContext,
  data: Uint8Array,
  mime: string,
  cacheKey?: string,
): ResolvedImage {
  const ext = MIME_EXT[mime] ?? "bin";
  const name = `word/media/image${ctx.imageCounter.n++}.${ext}`;
  const entry: ResolvedImage = {
    name,
    mime,
    data,
    widthPx: 0,
    heightPx: 0,
  };
  // `cacheKey` is the logical image identity (its markdown/HTML source) so a
  // replacement raster supersedes the entry it replaces (see odt/media.ts).
  ctx.images.set(cacheKey ?? name, entry);
  return entry;
}

interface DrawingOpts {
  rId: string;
  /** Relationship id of the SVG part when dual-embedding (svgBlip). */
  svgRid?: string;
  cx: number; // EMU
  cy: number;
  /** `wp:docPr` id — unique per drawing (ctx.docPrCounter). */
  id: number;
  name: string;
  descr: string;
  /** Signed `w:position` half-points for the run (negative lowers it). */
  positionHps?: number;
}

/**
 * The `w:drawing` run for one inline picture (rules 2, 6). `a:blip` carries
 * the raster image; the optional `asvg:svgBlip` extension adds the vector
 * variant understood by Word 2016+.
 */
function drawingXml(opts: DrawingOpts): string {
  const svgExt = opts.svgRid
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">` +
      `<asvg:svgBlip r:embed="${esc(opts.svgRid)}"/></a:ext></a:extLst>`
    : "";
  const rPr =
    opts.positionHps !== undefined && opts.positionHps !== 0
      ? `<w:rPr><w:position w:val="${Math.round(opts.positionHps)}"/></w:rPr>`
      : "";
  return (
    `<w:r>${rPr}<w:drawing>` +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${opts.cx}" cy="${opts.cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${opts.id}" name="${esc(opts.name)}" descr="${esc(opts.descr)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${opts.id}" name="${esc(opts.name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${esc(opts.rId)}">${svgExt}</a:blip>` +
    "<a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${opts.cx}" cy="${opts.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
  );
}

/** Raster drawing (PNG/JPEG/GIF) from already-resolved media bytes. */
export function mediaDrawingXml(
  ctx: DocxBuildContext,
  img: ResolvedImage,
  size: { cx: number; cy: number }, // EMU
  descr: string,
  positionHps?: number,
): string {
  const rId = ctx.addRel(REL_IMAGE, img.name.replace(/^word\//, ""), false);
  return drawingXml({
    rId,
    cx: size.cx,
    cy: size.cy,
    id: ctx.docPrCounter.n++,
    name: img.name.replace(/^word\/media\//, ""),
    descr,
    positionHps,
  });
}

/** `fitDrawingToPage` result → EMU size. */
function frameToEmu(frame: { frameWidthPx: number; frameHeightPx: number }): {
  cx: number;
  cy: number;
} {
  return {
    cx: pxToEmu(frame.frameWidthPx),
    cy: pxToEmu(frame.frameHeightPx),
  };
}

/**
 * Rasterize an SVG and return a raster drawing, or `null` on failure (with a
 * warning). `cacheKey` supersedes a previously registered vector entry.
 */
async function rasterizedDrawing(
  ctx: DocxBuildContext,
  svgXml: string,
  dims: { width: number; height: number },
  srcLabel: string,
  descr: string,
  cacheKey?: string,
): Promise<string | null> {
  if (dims.width <= 0 || dims.height <= 0) {
    ctx.warnings.push(`SVG ${srcLabel}: cannot rasterize without dimensions.`);
    return null;
  }
  try {
    const png = await rasterizeSvg(
      svgXml,
      dims.width,
      dims.height,
      ctx.rasterScale,
    );
    const entry = registerMedia(ctx, png, "image/png", cacheKey);
    const frame = fitDrawingToPage(dims.width, dims.height);
    return mediaDrawingXml(ctx, entry, frameToEmu(frame), descr);
  } catch (err) {
    ctx.warnings.push(
      `SVG ${srcLabel} rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Dual embed: `asvg:svgBlip` + PNG fallback blip. The SVG goes through
 * `materializeSvgPaint` first (CSS → presentation attributes — the
 * LibreOffice-safe form from the ODT work). When the fallback cannot be
 * rasterized, the 1×1 transparent placeholder keeps the rule-14 invariant
 * (every svgBlip has a raster blip) and the SVG still renders in viewers
 * that understand it.
 */
async function dualEmbedDrawing(
  ctx: DocxBuildContext,
  svgXml: string,
  dims: { width: number; height: number },
  srcLabel: string,
  descr: string,
  cacheKey?: string,
  existingSvg?: ResolvedImage,
): Promise<string> {
  const painted = materializeSvgPaint(svgXml);
  const svgBytes = new TextEncoder().encode(painted);
  let fallback: Uint8Array = TRANSPARENT_PNG;
  try {
    if (dims.width > 0 && dims.height > 0) {
      fallback = await rasterizeSvg(
        painted,
        dims.width,
        dims.height,
        ctx.rasterScale,
      );
    } else {
      ctx.warnings.push(
        `SVG ${srcLabel}: no dimensions for the PNG fallback; embedding a placeholder.`,
      );
    }
  } catch (err) {
    ctx.warnings.push(
      `SVG ${srcLabel} PNG fallback failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const pngEntry = registerMedia(
    ctx,
    fallback,
    "image/png",
    // The fallback PNG must not supersede a resolveImage-registered SVG
    // entry under the same cache key (that entry IS the packaged vector
    // part) — give it its own key.
    cacheKey !== undefined ? `${cacheKey}|png` : undefined,
  );
  // Reuse a resolveImage-registered vector entry (it is packaged once);
  // otherwise register the painted SVG under its own name.
  let svgEntry = existingSvg;
  if (svgEntry) {
    svgEntry.data = svgBytes;
  } else {
    svgEntry = registerMedia(ctx, svgBytes, "image/svg+xml");
  }
  const frame = fitDrawingToPage(
    dims.width > 0 ? dims.width : 1,
    dims.height > 0 ? dims.height : 1,
  );
  const pngRid = ctx.addRel(
    REL_IMAGE,
    pngEntry.name.replace(/^word\//, ""),
    false,
  );
  const svgRid = ctx.addRel(
    REL_IMAGE,
    svgEntry.name.replace(/^word\//, ""),
    false,
  );
  return drawingXml({
    rId: pngRid,
    svgRid,
    ...frameToEmu(frame),
    id: ctx.docPrCounter.n++,
    name: pngEntry.name.replace(/^word\/media\//, ""),
    descr,
  });
}

/**
 * Embed an SVG graphic (diagram fence, inline `<svg>`, `.svg` image) per the
 * `docx.rasterizeSvg` toggle:
 *
 * - ON (default): PNG-only. Rasterization failure degrades to dual embed.
 * - OFF: SVG + PNG fallback (vector in Word 2016+, PNG everywhere else).
 */
export async function embedSvgGraphic(
  ctx: DocxBuildContext,
  svgXml: string,
  dims: { width: number; height: number },
  srcLabel: string,
  descr: string,
  cacheKey?: string,
  existingSvg?: ResolvedImage,
): Promise<string> {
  if (ctx.rasterizeSvgFlag) {
    const raster = await rasterizedDrawing(
      ctx,
      svgXml,
      dims,
      srcLabel,
      descr,
      cacheKey,
    );
    return (
      raster ??
      dualEmbedDrawing(
        ctx,
        svgXml,
        dims,
        srcLabel,
        descr,
        cacheKey,
        existingSvg,
      )
    );
  }
  return dualEmbedDrawing(
    ctx,
    svgXml,
    dims,
    srcLabel,
    descr,
    cacheKey,
    existingSvg,
  );
}

/* ────────────────────────────── math ──────────────────────────────────── */

export function buildMathRenderOpts(
  ctx: DocxBuildContext,
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

function texFallbackXml(tex: string, display: boolean): string {
  const run = `<w:r><w:rPr><w:rStyle w:val="Code"/></w:rPr>${wText(tex)}</w:r>`;
  return display
    ? `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>${run}</w:p>`
    : run;
}

/**
 * Render one math expression (EXPORT-PLAN 8.7). Two modes via
 * `docx.rasterizeMath`:
 *
 * - off (default): native OMML equations. A construct the converter cannot
 *   map degrades to escaped TeX source + warning — **no automatic PNG
 *   fallback** (explicit decision, mirroring ODT's degrade path).
 * - on: PNG images; failure falls back to the OMML path (as ODT's raster
 *   path falls back to MathML), then TeX + warning.
 */
export async function renderMath(
  ctx: DocxBuildContext,
  kind: "inline" | "block",
  tex: string,
  renderOpts: MathmlRenderOptions,
): Promise<string> {
  const display = kind === "block";
  const label = display ? "Block" : "Inline";
  const wrapBlock = (inner: string): string =>
    display
      ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${inner}</w:p>`
      : inner;

  if (ctx.rasterizeMath) {
    try {
      const { png, widthPx, heightPx } = await renderMathToPng({
        tex,
        displayMode: display,
        resolution: ctx.rasterScale,
        targetFontSize: ctx.mathTargetFontSize,
        // Trim the captured line box to the ink: an inline drawing sits
        // with its bottom edge on the text baseline, so the ink-trimmed
        // image degrades to a natural baseline placement in viewers that
        // ignore the `w:position` shift below.
        trimToInk: true,
        ...renderOpts,
      });
      const entry = registerMedia(ctx, png, "image/png");
      entry.widthPx = widthPx;
      entry.heightPx = heightPx;
      const frame = fitDrawingToPage(widthPx, heightPx);
      // Inline math only: lower the drawing off Word's
      // bottom-edge-on-the-baseline placement so the ink centers on the
      // text line — the look of the ODT exporter's `Formula` graphic style
      // (vertical-pos=middle, vertical-rel=text). Display math lives in its
      // own centered paragraph and needs no shift.
      const positionHps = display
        ? undefined
        : -pxToHalfPoints(inlineMathShiftPx(frame.frameHeightPx));
      return wrapBlock(
        mediaDrawingXml(ctx, entry, frameToEmu(frame), tex, positionHps),
      );
    } catch (err) {
      ctx.warnings.push(
        `${label} math rasterization failed (${err instanceof Error ? err.message : String(err)}); embedded as native equation.`,
      );
    }
  }

  try {
    const mathml = renderMathToMathml(tex, display, renderOpts);
    const omml = mathmlToOmml(mathml);
    if (omml === null) {
      ctx.warnings.push(
        `${label} math has no OMML mapping; exported as TeX source: ${tex.slice(0, 50)}…`,
      );
      return texFallbackXml(tex, display);
    }
    return display
      ? wrapBlock(`<m:oMathPara><m:oMath>${omml}</m:oMath></m:oMathPara>`)
      : `<m:oMath>${omml}</m:oMath>`;
  } catch {
    ctx.warnings.push(
      `${label} math rendering failed for: ${tex.slice(0, 50)}…`,
    );
    return texFallbackXml(tex, display);
  }
}

/* ──────────────────────────── diagrams ────────────────────────────────── */

export function buildMermaidOptions(
  ctx: DocxBuildContext,
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

export function buildSmilesOptions(
  ctx: DocxBuildContext,
  sourceLine: number,
  fenceOpts: Record<string, unknown> = {},
): SmilesRenderOptions {
  const dirState = lookupDirectiveState(
    ctx.smilesDirectiveStateMap,
    sourceLine,
  );
  const merged = mergeOptions(SMILES_OPTIONS_SCHEMA, dirState, fenceOpts);
  const opts = resolveSmilesOptions(merged);
  // DOCX is a neutral document — white page, black text (same contract as
  // ODT's forced-light SMILES theme). Dark palettes paint white strokes and
  // labels on transparency, which would be invisible there.
  if (opts.theme === "auto") opts.theme = "light";
  return opts;
}

/* ───────────────────────────── images ─────────────────────────────────── */

/**
 * Size an image drawing in EMU. Absolute units only (explicit width/height
 * via {@link cssLengthToInches}, else natural pixels at 96 DPI); one given
 * dimension sizes the other proportionally so the image is never stretched.
 */
export function imageSizeEmu(
  img: ResolvedImage | null,
  widthAttr: string | null,
  heightAttr: string | null,
): { cx: number; cy: number } {
  const inW = widthAttr ? cssLengthToInches(widthAttr) : null;
  const inH = heightAttr ? cssLengthToInches(heightAttr) : null;
  let wPx = inW !== null ? inW * 96 : 0;
  let hPx = inH !== null ? inH * 96 : 0;
  const natW = img?.widthPx ?? 0;
  const natH = img?.heightPx ?? 0;
  if (wPx <= 0 && hPx <= 0) {
    wPx = natW;
    hPx = natH;
  } else if (hPx <= 0 && wPx > 0 && natW > 0 && natH > 0) {
    hPx = wPx * (natH / natW);
  } else if (wPx <= 0 && hPx > 0 && natW > 0 && natH > 0) {
    wPx = hPx * (natW / natH);
  }
  const frame = fitDrawingToPage(wPx > 0 ? wPx : 1, hPx > 0 ? hPx : 1);
  return { cx: pxToEmu(frame.frameWidthPx), cy: pxToEmu(frame.frameHeightPx) };
}
