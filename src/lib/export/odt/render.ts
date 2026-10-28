import type Token from "markdown-it/lib/token.mjs";
import type { InvokeImpl } from "../assets";
import type { ExportOptions } from "./options";
import {
  OPTION_RASTERIZE_MATH,
  OPTION_RASTERIZE_SVG,
  OPTION_RASTER_RESOLUTION,
} from "./options";
import {
  renderMathToMathml,
  renderMathToPng,
  type MathmlRenderOptions,
} from "../math-render";
import { lookupDirectiveState } from "$lib/extensions/directives";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "$lib/extensions/fence-options";
import { mergeOptions } from "$lib/extensions/directive-merge";
import { KATEX_OPTIONS_SCHEMA } from "$lib/extensions/katex/renderer";
import { rasterizeSvg } from "../svg-rasterize";
import { renderMermaidSvgForExport } from "$lib/extensions/mermaid/renderer";
import { MERMAID_OPTIONS_SCHEMA } from "$lib/extensions/mermaid/schema";
import { escapeXml } from "$lib/utils/escape";
import { findClosing } from "../token-walker";
import { S } from "./odf-styles";
import {
  cssLengthToInches,
  inchesAttr,
  sniffSvgDimensions,
  resolveImage,
  type ResolvedImage,
} from "./images";
import { fitFrameToPage, computeMermaidFrameDims } from "./dimensions";
import { escWithSpaces, isOpeningTag } from "./utils";
import { hljsToSpans, renderHighlightedLine } from "./highlight";
import { InlineFormatState } from "./context";
import { listStyleName } from "./odf-styles";
import type { AutomaticStyle, MathObject, ListKind } from "./odf-styles";

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
  const autoStyles: Map<string, string> = new Map();
  // Package entries keyed by the image's *logical identity*: its source URL
  // for images resolved from the document, or the generated package name for
  // synthesized ones (math rasters, inline SVGs), which are unique by
  // construction. Values carry the `Pictures/…` name actually written to the
  // zip. Keying resolved images by source is what deduplicates repeated
  // references; see `resolveImage`.
  const images = new Map<string, ResolvedImage>();
  const imageCounter = { n: 1 };
  const mathObjects: MathObject[] = [];
  let mathCounter = 0;
  const footnoteBodies = new Map<string, string>();
  const drawNameCount = new Map<string, number>();
  function uniqueDrawName(base: string): string {
    const count = drawNameCount.get(base) ?? 0;
    drawNameCount.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  }

  const rasterizeMath = !!options[OPTION_RASTERIZE_MATH];
  const rasterizeSvgFlag = !!options[OPTION_RASTERIZE_SVG];
  const rasterScale = options[OPTION_RASTER_RESOLUTION] ?? 2;
  // Target font size for rasterized math: the ODT body text is 10pt
  // (≈ 13.33px at 96 DPI).  KaTeX renders at HOST_FONT_SIZE × 1.21em,
  // so we pass 11px so the returned dimensions match 10pt:
  // 11px × 1.21 ≈ 13.31px ≈ 10pt.  The bitmap is rendered at 16px
  // (HOST_FONT_SIZE) for sharpness; only the reported dimensions are
  // scaled down (supersampling).
  const mathTargetFontSize = 11;

  // Build MathML/png render options for a given source line by looking up
  // the directive state at that line and merging with optional fence attrs.
  function buildMathRenderOpts(
    sourceLine: number,
    fenceOpts: Record<string, unknown> = {},
  ): MathmlRenderOptions {
    const dirState = lookupDirectiveState(directiveStateMap, sourceLine);
    const merged = mergeOptions(KATEX_OPTIONS_SCHEMA, dirState, fenceOpts);
    const opts: MathmlRenderOptions = {};
    if (merged.leqno !== undefined) opts.leqno = !!merged.leqno;
    if (merged.fleqn !== undefined) opts.fleqn = !!merged.fleqn;
    if (typeof merged.fontsize === "number" && merged.fontsize !== 1.0)
      opts.fontsize = merged.fontsize as number;
    return opts;
  }

  // Resolve the options for a mermaid diagram by looking up the
  // directive state at that line and merging with optional fence attrs.
  // Defaults match the viewer's `.mermaid-block` layout (align center,
  // maxWidth 800, fitToWidth true).
  function buildMermaidOptions(
    sourceLine: number,
    fenceOpts: Record<string, unknown> = {},
  ): { align: string; maxWidth: number; fitToWidth: boolean } {
    const dirState = lookupDirectiveState(mermaidDirectiveStateMap, sourceLine);
    const merged = mergeOptions(MERMAID_OPTIONS_SCHEMA, dirState, fenceOpts);
    return {
      align: typeof merged.align === "string" ? merged.align : "center",
      maxWidth: typeof merged.maxWidth === "number" ? merged.maxWidth : 800,
      fitToWidth:
        typeof merged.fitToWidth === "boolean" ? merged.fitToWidth : true,
    };
  }

  // ── inline formatter state ──
  const inlineState = new InlineFormatState();

  // ── context stack ──
  type ContextType =
    "blockquote" | "bullet_list" | "ordered_list" | "task_list";
  const contextStack: ContextType[] = [];

  function ensureAutoStyle(name: string, xml: string): void {
    if (!autoStyles.has(name)) {
      autoStyles.set(name, xml);
    }
  }

  function wrapSpan(text: string, styleName: string): string {
    return `<text:span text:style-name="${escapeXml(styleName)}">${escapeXml(text)}</text:span>`;
  }

  /** Register a rasterized PNG (post rasterization helper). */
  function addRasterImage(
    data: Uint8Array,
    widthPx: number,
    heightPx: number,
    graphicStyle = "fr1",
    cacheKey?: string,
  ): string {
    const name = `Pictures/image${imageCounter.n++}.png`;
    // `cacheKey` is the logical image identity (its markdown/HTML source) so
    // a replacement raster supersedes the entry it replaces and later
    // references reuse it. Without one, the image is synthesized and keyed
    // by its own package name, which is unique by construction.
    images.set(cacheKey ?? name, {
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

  /** Add a raw SVG as a Pictures/ entry and return its ODF XML. */
  function addSvgImage(
    svgXml: string,
    dims: { width: number; height: number },
  ): string {
    const bytes = new TextEncoder().encode(svgXml);
    const name = `Pictures/image${imageCounter.n++}.svg`;
    images.set(name, {
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

  /**
   * Convert an SVG to PNG if the rasterizeSvg option is on and the SVG has
   * parseable dimensions. Returns the resulting XML on success or null on
   * failure (caller falls back to the vector SVG).
   */
  async function tryRasterizeSvg(
    svgXml: string,
    dims: { width: number; height: number },
    srcLabel: string,
    cacheKey?: string,
  ): Promise<string | null> {
    if (!rasterizeSvgFlag) return null;
    if (dims.width <= 0 || dims.height <= 0) {
      warnings.push(
        `SVG ${srcLabel}: cannot rasterize without dimensions; embedded as vector SVG.`,
      );
      return null;
    }
    try {
      const png = await rasterizeSvg(
        svgXml,
        dims.width,
        dims.height,
        rasterScale,
      );
      return addRasterImage(png, dims.width, dims.height, "fr1", cacheKey);
    } catch (err) {
      warnings.push(
        `SVG ${srcLabel} rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Render one formula to ODF body XML.
   *
   * One three-step contract for inline and display math, which used to be
   * three copy-pasted blocks (inline, ` ```math ` fence, `math_block`) that
   * had already drifted apart in their warning wording:
   *
   * 1. a rasterized PNG frame, when the option is on and the capture works;
   * 2. otherwise a native MathObject reference (MathML, embedded as an
   *    OLE sub-package);
   * 3. otherwise the escaped source as plain text.
   *
   * `kind` selects everything the two spellings genuinely differ in: the
   * frame style (inline frames center vertically, block ones sit in a
   * centered paragraph and center horizontally), the framing, and the
   * warning labels. The MathML frame is `Formula` for both — only the PNG
   * frame switches to `fr1` for display math.
   */
  async function renderMathObject(
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

    if (rasterizeMath) {
      try {
        const { png, widthPx, heightPx } = await renderMathToPng({
          tex,
          displayMode: display,
          resolution: rasterScale,
          targetFontSize: mathTargetFontSize,
          ...renderOpts,
        });
        const { frameWidthPx, frameHeightPx } = fitFrameToPage(
          widthPx,
          heightPx,
        );
        // "Formula" centers inline frames vertically; "fr1" leaves block
        // frames to the centered Math_20_Display paragraph.
        return frameOf(
          addRasterImage(
            png,
            frameWidthPx,
            frameHeightPx,
            display ? "fr1" : "Formula",
          ),
        );
      } catch (err) {
        warnings.push(
          `${label} math rasterization failed (${err instanceof Error ? err.message : String(err)}); embedded as native formula.`,
        );
      }
    }

    try {
      const mathMl = renderMathToMathml(tex, display, renderOpts);
      const objId = `Object ${++mathCounter}`;
      mathObjects.push({ id: objId, mathml: mathMl });
      return frameOf(
        `<draw:frame draw:style-name="Formula" draw:name="${objId}" text:anchor-type="as-char" draw:z-index="0"><draw:object xlink:href="./${objId}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`,
      );
    } catch {
      warnings.push(`${label} math rendering failed for: ${tex.slice(0, 50)}…`);
      return display
        ? `      <text:p text:style-name="${S.body}">${escapeXml(tex)}</text:p>`
        : escapeXml(tex);
    }
  }

  function paragraphStyle(): string {
    let quoteDepth = 0;
    for (let j = 0; j < contextStack.length; j++) {
      if (contextStack[j] === "blockquote") quoteDepth++;
    }
    if (quoteDepth > 0) return S.quote(Math.min(quoteDepth, 9));
    return S.body;
  }

  function listItemParagraphStyle(): string {
    let quoteDepth = 0;
    for (let j = 0; j < contextStack.length; j++) {
      if (contextStack[j] === "blockquote") quoteDepth++;
    }
    return quoteDepth > 0
      ? `QuoteList_20_${Math.min(quoteDepth, 9)}`
      : "Standard";
  }

  /** Detect inline SVG in markdown-it text/softbreak tokens and reassemble. */
  function tryExtractInlineSvg(
    children: Token[],
    start: number,
  ): { svgXml: string; consumedCount: number } | null {
    const first = children[start];
    if (!first || first.type !== "text") return null;
    const trimmed = first.content.trimStart();
    if (!/^<svg\b/i.test(trimmed)) return null;

    let svgXml = first.content;
    let consumed = 1;

    if (/<\/svg>\s*$/i.test(svgXml)) {
      return { svgXml: svgXml.trim(), consumedCount: consumed };
    }

    for (let j = start + 1; j < children.length; j++) {
      const t = children[j];
      if (t.type === "softbreak") {
        svgXml += "\n";
      } else if (t.type === "text") {
        svgXml += t.content;
      } else {
        return null;
      }
      consumed++;
      if (/<\/svg>/i.test(t.content)) break;
      if (consumed > 100) return null;
    }

    if (!/<\/svg>/i.test(svgXml)) return null;
    return { svgXml: svgXml.trim(), consumedCount: consumed };
  }

  /** Detect inline SVG from html_inline token sequence (html:true mode). */
  function tryExtractInlineHtmlSvg(
    children: Token[],
    start: number,
  ): { svgXml: string; consumedCount: number } | null {
    const first = children[start];
    if (!first || first.type !== "html_inline") return null;
    const trimmed = first.content.trimStart();
    if (!/^<svg\b/i.test(trimmed)) return null;

    let svgXml = first.content;
    let consumed = 1;

    if (/<\/svg>\s*$/i.test(svgXml)) {
      return { svgXml: svgXml.trim(), consumedCount: consumed };
    }

    for (let j = start + 1; j < children.length; j++) {
      const t = children[j];
      if (t.type === "html_inline") {
        svgXml += t.content;
      } else if (t.type === "softbreak") {
        svgXml += "\n";
      } else {
        return null;
      }
      consumed++;
      if (/<\/svg>/i.test(t.content)) break;
      if (consumed > 100) return null;
    }

    if (!/<\/svg>/i.test(svgXml)) return null;
    return { svgXml: svgXml.trim(), consumedCount: consumed };
  }

  // ── render inline children into an XML string ──
  async function renderInline(
    children: Token[],
    sourceLine = 0,
  ): Promise<string> {
    let xml = "";
    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];
      switch (child.type) {
        case "text": {
          const svg = tryExtractInlineSvg(children, ci);
          if (svg) {
            const label = `inline-svg(text@${ci})`;
            const dims = sniffSvgDimensions(
              new TextEncoder().encode(svg.svgXml),
              label,
              warnings,
            ) ?? { width: 0, height: 0 };
            const rasterized = await tryRasterizeSvg(svg.svgXml, dims, label);
            xml += rasterized ?? addSvgImage(svg.svgXml, dims);
            ci += svg.consumedCount - 1;
            break;
          }
          if (inlineState.linkHref) {
            xml += `<text:a xlink:type="simple" xlink:href="${escapeXml(inlineState.linkHref)}"><text:span text:style-name="T_link">${escapeXml(child.content)}</text:span></text:a>`;
          } else {
            const styleName = inlineState.currentStyle();
            let inner = styleName
              ? wrapSpan(child.content, styleName)
              : escapeXml(child.content);
            if (inlineState.markActive) {
              inner = `<text:span text:style-name="T_mark">${inner}</text:span>`;
            }
            xml += inner;
          }
          break;
        }
        case "code_inline":
          xml += wrapSpan(child.content, "T4");
          break;
        case "softbreak":
          xml += " ";
          break;
        case "hardbreak":
          xml += "<text:line-break/>";
          break;
        case "em_open":
          inlineState.italicActive = true;
          break;
        case "em_close":
          inlineState.italicActive = false;
          break;
        case "strong_open":
          inlineState.boldActive = true;
          break;
        case "strong_close":
          inlineState.boldActive = false;
          break;
        case "s_open":
          inlineState.strikeActive = true;
          break;
        case "s_close":
          inlineState.strikeActive = false;
          break;
        case "mark_open":
          inlineState.markActive = true;
          break;
        case "mark_close":
          inlineState.markActive = false;
          break;
        case "link_open":
          inlineState.linkHref = child.attrGet("href") ?? "";
          break;
        case "link_close":
          inlineState.linkHref = null;
          break;
        case "image": {
          const src = child.attrGet("src") ?? "";
          const alt = child.content;
          // Check for width/height attributes from HTML img
          const widthAttr = child.attrGet("width");
          const heightAttr = child.attrGet("height");
          const resolvedSrc = await resolveImage(
            src,
            invokeImpl,
            images,
            imageCounter,
            warnings,
          );
          if (resolvedSrc !== src) {
            const img = images.get(src);
            // If rasterizeSvg is on and the resolved image is an SVG, swap
            // the vector file for a PNG raster.
            if (rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
              const rasterized = await tryRasterizeSvg(
                new TextDecoder().decode(img.data),
                { width: img.widthPx, height: img.heightPx },
                `image(${src})`,
                // Register the raster under the image's source key so it
                // supersedes the vector entry (which must not be packaged
                // unused) and later references reuse the same PNG.
                src,
              );
              if (rasterized) {
                xml += rasterized;
                break;
              }
              // Fall through to vector embed on rasterization failure.
            }
            let sizeAttrs = "";
            // Explicit dimensions, converted to the absolute unit ODF wants.
            // A dimension we cannot make absolute (a percentage, `em`, …) is
            // simply left out rather than written as a length it is not.
            const widthIn = widthAttr ? cssLengthToInches(widthAttr) : null;
            const heightIn = heightAttr ? cssLengthToInches(heightAttr) : null;
            if (widthIn !== null) {
              sizeAttrs += ` svg:width="${inchesAttr(widthIn)}"`;
            }
            if (heightIn !== null) {
              sizeAttrs += ` svg:height="${inchesAttr(heightIn)}"`;
            }
            // If no explicit size, use image pixel dimensions at 96 DPI
            if (
              !widthAttr &&
              !heightAttr &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              sizeAttrs = ` svg:width="${inchesAttr(img.widthPx / 96)}" svg:height="${inchesAttr(img.heightPx / 96)}"`;
            }
            // Proportional calculation when only one dimension is usable
            if (
              widthIn !== null &&
              heightIn === null &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              const ratio = img.heightPx / img.widthPx;
              sizeAttrs += ` svg:height="${inchesAttr(widthIn * ratio)}"`;
            }
            if (
              widthIn === null &&
              heightIn !== null &&
              img &&
              img.widthPx > 0 &&
              img.heightPx > 0
            ) {
              const ratio = img.widthPx / img.heightPx;
              sizeAttrs = ` svg:width="${inchesAttr(heightIn * ratio)}"${sizeAttrs}`;
            }
            const mimeAttr = img
              ? ` draw:mime-type="${escapeXml(img.mime)}"`
              : "";
            xml += `<draw:frame draw:style-name="fr1" draw:name="${escapeXml(uniqueDrawName(alt || "image"))}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
          } else {
            xml += `[Image: ${escapeXml(alt || src)}]`;
          }
          break;
        }
        case "math_inline": {
          xml += await renderMathObject(
            "inline",
            child.content,
            buildMathRenderOpts(sourceLine),
          );
          break;
        }
        case "footnote_ref": {
          const noteId = String(child.meta?.id ?? child.meta?.label ?? "0");
          const label = child.meta?.label ?? noteId;
          const body =
            footnoteBodies.get(noteId) ??
            `<text:p text:style-name="${S.body}"/>`;
          xml += `<text:note text:note-class="footnote" text:id="ftn${escapeXml(noteId)}"><text:note-citation>${escapeXml(label)}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`;
          break;
        }
        case "html_inline": {
          const raw = child.content;
          const lower = raw.trim().toLowerCase();
          if (lower.startsWith("<svg")) {
            const svgRes = tryExtractInlineHtmlSvg(children, ci);
            if (svgRes) {
              const label = `html_inline-svg(text@${ci})`;
              const dims = sniffSvgDimensions(
                new TextEncoder().encode(svgRes.svgXml),
                label,
                warnings,
              ) ?? { width: 0, height: 0 };
              const rasterized = await tryRasterizeSvg(
                svgRes.svgXml,
                dims,
                label,
              );
              xml += rasterized ?? addSvgImage(svgRes.svgXml, dims);
              ci += svgRes.consumedCount - 1;
              break;
            }
          }
          if (isOpeningTag(lower, "br")) {
            xml += "<text:line-break/>";
          } else if (isOpeningTag(lower, "sub")) {
            inlineState.subActive = true;
          } else if (lower === "</sub>") {
            inlineState.subActive = false;
          } else if (isOpeningTag(lower, "sup")) {
            inlineState.superActive = true;
          } else if (lower === "</sup>") {
            inlineState.superActive = false;
          } else if (
            lower === "<del>" ||
            lower === "<s>" ||
            lower === "<strike>"
          ) {
            inlineState.strikeActive = true;
          } else if (
            lower === "</del>" ||
            lower === "</s>" ||
            lower === "</strike>"
          ) {
            inlineState.strikeActive = false;
          } else if (lower === "<ins>" || lower === "<u>") {
            inlineState.underlineActive = true;
          } else if (lower === "</ins>" || lower === "</u>") {
            inlineState.underlineActive = false;
          } else if (lower === "<b>" || lower === "<strong>") {
            inlineState.boldActive = true;
          } else if (lower === "</b>" || lower === "</strong>") {
            inlineState.boldActive = false;
          } else if (lower === "<i>" || lower === "<em>") {
            inlineState.italicActive = true;
          } else if (lower === "</i>" || lower === "</em>") {
            inlineState.italicActive = false;
          } else if (lower === "<mark>") {
            inlineState.markActive = true;
          } else if (lower === "</mark>") {
            inlineState.markActive = false;
          } else if (lower.startsWith("<kbd")) {
            xml += '<text:span text:style-name="T_kbd">';
          } else if (lower === "</kbd>") {
            xml += "</text:span>";
          } else if (lower.startsWith("<span")) {
            // Parse style attributes from <span style="...">
            const styleMatch = raw.match(/style\s*=\s*"([^"]*)"/i);
            if (styleMatch) {
              const cssStyle = styleMatch[1];
              const spanStyleName = `T_span_${autoStyles.size}`;
              let odfXml =
                '<style:style style:name="' +
                spanStyleName +
                '" style:family="text"><style:text-properties';
              // Parse color
              const colorMatch = cssStyle.match(/color\s*:\s*([^;]+)/i);
              if (colorMatch)
                odfXml += ` fo:color="${escapeXml(colorMatch[1].trim())}"`;
              // Parse background-color
              const bgMatch = cssStyle.match(
                /background(?:-color)?\s*:\s*([^;]+)/i,
              );
              if (bgMatch)
                odfXml += ` fo:background-color="${escapeXml(bgMatch[1].trim())}"`;
              // Parse font-size
              const sizeMatch = cssStyle.match(/font-size\s*:\s*([^;]+)/i);
              if (sizeMatch)
                odfXml += ` fo:font-size="${escapeXml(sizeMatch[1].trim())}"`;
              // Parse font-family
              const familyMatch = cssStyle.match(/font-family\s*:\s*([^;]+)/i);
              if (familyMatch)
                odfXml += ` fo:font-family="${escapeXml(familyMatch[1].trim())}"`;
              // Parse font-weight
              const weightMatch = cssStyle.match(/font-weight\s*:\s*([^;]+)/i);
              if (weightMatch)
                odfXml += ` fo:font-weight="${escapeXml(weightMatch[1].trim())}"`;
              // Parse font-style
              const fstyleMatch = cssStyle.match(/font-style\s*:\s*([^;]+)/i);
              if (fstyleMatch)
                odfXml += ` fo:font-style="${escapeXml(fstyleMatch[1].trim())}"`;
              // Parse text-decoration
              const decoMatch = cssStyle.match(
                /text-decoration\s*:\s*([^;]+)/i,
              );
              if (decoMatch) {
                if (decoMatch[1].includes("underline"))
                  odfXml += ' style:text-underline-type="solid"';
                if (decoMatch[1].includes("line-through"))
                  odfXml +=
                    ' style:text-line-through-style="solid" style:text-line-through-type="single"';
              }
              odfXml += "/></style:style>";
              ensureAutoStyle(spanStyleName, odfXml);
              xml += `<text:span text:style-name="${spanStyleName}">`;
            }
          } else if (lower === "</span>") {
            // Check if we have an open span style (from <span style="...">)
            // We need to close it. Simple approach: just close any open span.
            // Actually, we track this by checking if the last opened was a span.
            // For safety, just emit closing span.
            xml += "</text:span>";
          } else if (lower.startsWith("<img")) {
            // HTML <img> tag — extract src, alt, width
            const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
            const altMatch = raw.match(/alt\s*=\s*["']([^"']*)["']/i);
            const widthMatch = raw.match(/width\s*=\s*["']([^"']+)["']/i);
            const heightMatch = raw.match(/height\s*=\s*["']([^"']+)["']/i);
            if (srcMatch) {
              const src = srcMatch[1];
              const alt = altMatch?.[1] ?? "";
              const resolvedSrc = await resolveImage(
                src,
                invokeImpl,
                images,
                imageCounter,
                warnings,
              );
              if (resolvedSrc !== src) {
                const img = images.get(src);
                // Same rasterization branch as the markdown-image token.
                if (rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
                  const rasterized = await tryRasterizeSvg(
                    new TextDecoder().decode(img.data),
                    { width: img.widthPx, height: img.heightPx },
                    `html_img(${src})`,
                    // Supersede the vector entry under the image's source
                    // key (see the markdown-image branch).
                    src,
                  );
                  if (rasterized) {
                    xml += rasterized;
                    break;
                  }
                }
                let sizeAttrs = "";
                // Same unit contract as the markdown-image branch: absolute
                // units only, and one given dimension sizes the other
                // proportionally so the image is never stretched.
                const widthIn = widthMatch
                  ? cssLengthToInches(widthMatch[1])
                  : null;
                const heightIn = heightMatch
                  ? cssLengthToInches(heightMatch[1])
                  : null;
                if (widthIn !== null) {
                  sizeAttrs += ` svg:width="${inchesAttr(widthIn)}"`;
                }
                if (heightIn !== null) {
                  sizeAttrs += ` svg:height="${inchesAttr(heightIn)}"`;
                }
                // If only width given, calculate proportional height
                if (
                  widthIn !== null &&
                  heightIn === null &&
                  img &&
                  img.widthPx > 0 &&
                  img.heightPx > 0
                ) {
                  const ratio = img.heightPx / img.widthPx;
                  sizeAttrs += ` svg:height="${inchesAttr(widthIn * ratio)}"`;
                }
                if (
                  widthIn === null &&
                  heightIn !== null &&
                  img &&
                  img.widthPx > 0 &&
                  img.heightPx > 0
                ) {
                  const ratio = img.widthPx / img.heightPx;
                  sizeAttrs = ` svg:width="${inchesAttr(heightIn * ratio)}"${sizeAttrs}`;
                }
                const mimeAttr = img
                  ? ` draw:mime-type="${escapeXml(img.mime)}"`
                  : "";
                xml += `<draw:frame draw:style-name="fr1" draw:name="${escapeXml(uniqueDrawName(alt || "image"))}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
              } else {
                xml += `[Image: ${escapeXml(alt || src)}]`;
              }
            }
          }
          // Other HTML tags are silently ignored
          break;
        }
      }
    }
    return xml;
  }

  /** Detect if a bullet list's immediate items contain task-list checkboxes. */
  function detectTaskList(innerTokens: Token[]): boolean {
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

  /** Render the full content of a list item, including any nested lists inline. */
  async function renderListItemContent(liInner: Token[]): Promise<string> {
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
            stripCheckbox(next.children),
            next.map?.[0] ?? 0,
          );
        }
        if (firstParagraph && checkboxPrefix) {
          content = escapeXml(checkboxPrefix) + content;
          firstParagraph = false;
        }
        const closeIdx = findClosing(liInner, i, "paragraph_close");
        result += `<text:p text:style-name="${listItemParagraphStyle()}">${content}</text:p>\n`;
        i = closeIdx >= 0 ? closeIdx + 1 : i + 1;
        continue;
      }
      // Standalone inline (tight lists skip paragraph_open)
      if (t.type === "inline" && t.children) {
        let content = await renderInline(
          stripCheckbox(t.children),
          t.map?.[0] ?? 0,
        );
        if (firstParagraph && checkboxPrefix) {
          content = escapeXml(checkboxPrefix) + content;
          firstParagraph = false;
        }
        result += `<text:p text:style-name="${listItemParagraphStyle()}">${content}</text:p>\n`;
        i++;
        continue;
      }
      i++;
    }
    return result;
  }

  /**
   * Render a list with proper nesting. Nested lists inside items are rendered
   * inline within their parent <text:list-item>.
   */
  async function renderList(
    innerTokens: Token[],
    kindHint: ListKind,
  ): Promise<string> {
    const kind: ListKind =
      kindHint === "bullet" && detectTaskList(innerTokens) ? "task" : kindHint;
    contextStack.push(
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
          const contentXml = await renderListItemContent(liInner);
          itemParts.push(
            `        <text:list-item>\n${contentXml}        </text:list-item>`,
          );
          j = liClose + 1;
          continue;
        }
      }
      j++;
    }

    contextStack.pop();
    return `      <text:list text:style-name="${sn}">\n${itemParts.join("\n")}\n      </text:list>`;
  }

  // ── main recursive token-to-XML renderer ──
  async function renderTokens(tokens: Token[]): Promise<string> {
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
            content = await renderInline(next.children, next.map?.[0] ?? 0);
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
            content = await renderInline(next.children, next.map?.[0] ?? 0);
          }
          const closeIdx = findClosing(tokens, i, "paragraph_close");
          const inList = contextStack.some(
            (c) =>
              c === "bullet_list" || c === "ordered_list" || c === "task_list",
          );
          const style = inList ? "Standard" : paragraphStyle();
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
            const isTopLevel = !contextStack.includes("blockquote");
            contextStack.push("blockquote");
            const innerXml = await renderTokens(tokens.slice(i + 1, closeIdx));
            contextStack.pop();
            if (isTopLevel) {
              parts.push(
                `<table:table table:style-name="QuoteTable">\n  <table:table-column/>\n  <table:table-row>\n    <table:table-cell table:style-name="QuoteTableCell">\n${innerXml}\n    </table:table-cell>\n  </table:table-row>\n</table:table>`,
              );
            } else {
              parts.push(innerXml);
            }
            i = closeIdx + 1;
            if (i < tokens.length && tokens[i].type === "blockquote_open") {
              parts.push(
                '<text:p text:style-name="Standard"><text:s/></text:p>',
              );
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
            const xml = await renderList(innerTokens, "bullet");
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
            const xml = await renderList(innerTokens, "number");
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
            const contentXml = await renderListItemContent(innerTokens);
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
            const innerXml = await renderTokens(innerTokens);
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
            const innerXml = await renderTokens(tokens.slice(i + 1, closeIdx));
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
            content = await renderInline(next.children, next.map?.[0] ?? 0);
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
            content = await renderInline(next.children, next.map?.[0] ?? 0);
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
                "block",
                token.content,
                buildMathRenderOpts(sourceLine, fenceOpts),
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
                warnings,
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
                svgXml,
                frameDims,
                label,
              );
              const inner = rasterized ?? addSvgImage(svgXml, frameDims);
              parts.push(
                `      <text:p text:style-name="${S.diagramDisplay(mermaidOpts.align)}">${inner}</text:p>`,
              );
              i++;
              break;
            } catch (err) {
              warnings.push(
                `Mermaid rendering failed (${err instanceof Error ? err.message : String(err)}); exported as source code.`,
              );
            }
          }
          const code = token.content.trimEnd();
          const lines = code.split("\n");
          for (const line of lines) {
            const lineSpans = hljsToSpans(line, language);
            const lineXml = renderHighlightedLine(line, lineSpans, autoStyles);
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
              warnings,
            ) ?? { width: 0, height: 0 };
            const rasterized = await tryRasterizeSvg(html, dims, label);
            const inner = rasterized ?? addSvgImage(html, dims);
            parts.push(
              `      <text:p text:style-name="${paragraphStyle()}">${inner}</text:p>`,
            );
          }
          i++;
          break;
        }

        // ── Math block ──
        case "math_block": {
          parts.push(
            await renderMathObject(
              "block",
              token.content,
              buildMathRenderOpts(token.map?.[0] ?? 0),
            ),
          );
          i++;
          break;
        }

        // ── Footnotes (pre-rendered into footnoteBodies map) ──
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
              token.children,
              token.map?.[0] ?? 0,
            );
            parts.push(
              `      <text:p text:style-name="${paragraphStyle()}">${content}</text:p>`,
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
            const bodyXml = await renderTokens(bodyTokens);
            footnoteBodies.set(noteId, bodyXml);
          }
          j = fnClose >= 0 ? fnClose + 1 : j + 1;
        } else {
          j++;
        }
      }
      break;
    }
  }

  const bodyXml = await renderTokens(tokens);

  return {
    bodyXml,
    autoStyles: Array.from(autoStyles.entries()).map(([name, xml]) => ({
      name,
      xml,
    })),
    images,
    mathObjects,
  };
}

/**
 * GFM pipe-table column alignment (`|:--|:-:|--:|`) arrives as
 * `style="text-align:<x>"` on `th_open`/`td_open` tokens (set by markdown-it's
 * table block rule). Returns the normalized alignment, defaulting to `left`
 * when the column has no alignment marker.
 */

function parseTextAlign(token: Token | undefined): "left" | "center" | "right" {
  const style = token?.attrGet("style") ?? "";
  const m = /text-align:\s*(left|center|right)/i.exec(style);
  const value = m?.[1].toLowerCase();
  return value === "center" || value === "right" ? value : "left";
}

function countTableColumns(tokens: Token[]): number {
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

/* ─────────────────────── frontmatter card (ODF) ──────────────────────── */

/**
 * Generate the frontmatter/skill card as ODF XML. Uses a single-column
 * table with a blue left accent border (matching the blockquote pattern)
 * and a light background, replicating the HTML card from Viewer.svelte.
 */
