import type Token from "markdown-it/lib/token.mjs";
import { escapeXml } from "$lib/utils/escape";
import { S } from "./odf-styles";
import {
  cssLengthToInches,
  inchesAttr,
  sniffSvgDimensions,
  resolveImage,
} from "./images";
import { isOpeningTag } from "./utils";
import type { OdtBuildContext } from "./context";
import {
  buildMathRenderOpts,
  addSvgImage,
  tryRasterizeSvg,
  renderMathObject,
  uniqueDrawName,
  ensureAutoStyle,
} from "./media";

export function wrapSpan(text: string, styleName: string): string {
  return `<text:span text:style-name="${escapeXml(styleName)}">${escapeXml(text)}</text:span>`;
}

export function tryExtractInlineSvg(
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

export function tryExtractInlineHtmlSvg(
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

export async function renderInline(
  ctx: OdtBuildContext,
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
            ctx.warnings,
          ) ?? { width: 0, height: 0 };
          const rasterized = await tryRasterizeSvg(
            ctx,
            svg.svgXml,
            dims,
            label,
          );
          xml += rasterized ?? addSvgImage(ctx, svg.svgXml, dims);
          ci += svg.consumedCount - 1;
          break;
        }
        if (ctx.inlineState.linkHref) {
          xml += `<text:a xlink:type="simple" xlink:href="${escapeXml(ctx.inlineState.linkHref)}"><text:span text:style-name="T_link">${escapeXml(child.content)}</text:span></text:a>`;
        } else {
          const styleName = ctx.inlineState.currentStyle();
          let inner = styleName
            ? wrapSpan(child.content, styleName)
            : escapeXml(child.content);
          if (ctx.inlineState.markActive) {
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
        ctx.inlineState.italicActive = true;
        break;
      case "em_close":
        ctx.inlineState.italicActive = false;
        break;
      case "strong_open":
        ctx.inlineState.boldActive = true;
        break;
      case "strong_close":
        ctx.inlineState.boldActive = false;
        break;
      case "s_open":
        ctx.inlineState.strikeActive = true;
        break;
      case "s_close":
        ctx.inlineState.strikeActive = false;
        break;
      case "mark_open":
        ctx.inlineState.markActive = true;
        break;
      case "mark_close":
        ctx.inlineState.markActive = false;
        break;
      case "link_open":
        ctx.inlineState.linkHref = child.attrGet("href") ?? "";
        break;
      case "link_close":
        ctx.inlineState.linkHref = null;
        break;
      case "image": {
        const src = child.attrGet("src") ?? "";
        const alt = child.content;
        // Check for width/height attributes from HTML img
        const widthAttr = child.attrGet("width");
        const heightAttr = child.attrGet("height");
        const resolvedSrc = await resolveImage(
          src,
          ctx.invokeImpl,
          ctx.images,
          ctx.imageCounter,
          ctx.warnings,
        );
        if (resolvedSrc !== src) {
          const img = ctx.images.get(src);
          // If rasterizeSvg is on and the resolved image is an SVG, swap
          // the vector file for a PNG raster.
          if (ctx.rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
            const rasterized = await tryRasterizeSvg(
              ctx,
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
          xml += `<draw:frame draw:style-name="fr1" draw:name="${escapeXml(uniqueDrawName(ctx, alt || "image"))}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
        } else {
          xml += `[Image: ${escapeXml(alt || src)}]`;
        }
        break;
      }
      case "math_inline": {
        xml += await renderMathObject(
          ctx,
          "inline",
          child.content,
          buildMathRenderOpts(ctx, sourceLine),
        );
        break;
      }
      case "footnote_ref": {
        const noteId = String(child.meta?.id ?? child.meta?.label ?? "0");
        const label = child.meta?.label ?? noteId;
        const body =
          ctx.footnoteBodies.get(noteId) ??
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
              ctx.warnings,
            ) ?? { width: 0, height: 0 };
            const rasterized = await tryRasterizeSvg(
              ctx,
              svgRes.svgXml,
              dims,
              label,
            );
            xml += rasterized ?? addSvgImage(ctx, svgRes.svgXml, dims);
            ci += svgRes.consumedCount - 1;
            break;
          }
        }
        if (isOpeningTag(lower, "br")) {
          xml += "<text:line-break/>";
        } else if (isOpeningTag(lower, "sub")) {
          ctx.inlineState.subActive = true;
        } else if (lower === "</sub>") {
          ctx.inlineState.subActive = false;
        } else if (isOpeningTag(lower, "sup")) {
          ctx.inlineState.superActive = true;
        } else if (lower === "</sup>") {
          ctx.inlineState.superActive = false;
        } else if (
          lower === "<del>" ||
          lower === "<s>" ||
          lower === "<strike>"
        ) {
          ctx.inlineState.strikeActive = true;
        } else if (
          lower === "</del>" ||
          lower === "</s>" ||
          lower === "</strike>"
        ) {
          ctx.inlineState.strikeActive = false;
        } else if (lower === "<ins>" || lower === "<u>") {
          ctx.inlineState.underlineActive = true;
        } else if (lower === "</ins>" || lower === "</u>") {
          ctx.inlineState.underlineActive = false;
        } else if (lower === "<b>" || lower === "<strong>") {
          ctx.inlineState.boldActive = true;
        } else if (lower === "</b>" || lower === "</strong>") {
          ctx.inlineState.boldActive = false;
        } else if (lower === "<i>" || lower === "<em>") {
          ctx.inlineState.italicActive = true;
        } else if (lower === "</i>" || lower === "</em>") {
          ctx.inlineState.italicActive = false;
        } else if (lower === "<mark>") {
          ctx.inlineState.markActive = true;
        } else if (lower === "</mark>") {
          ctx.inlineState.markActive = false;
        } else if (lower.startsWith("<kbd")) {
          xml += '<text:span text:style-name="T_kbd">';
        } else if (lower === "</kbd>") {
          xml += "</text:span>";
        } else if (lower.startsWith("<span")) {
          // Parse style attributes from <span style="...">
          const styleMatch = raw.match(/style\s*=\s*"([^"]*)"/i);
          if (styleMatch) {
            const cssStyle = styleMatch[1];
            const spanStyleName = `T_span_${ctx.autoStyles.size}`;
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
            const decoMatch = cssStyle.match(/text-decoration\s*:\s*([^;]+)/i);
            if (decoMatch) {
              if (decoMatch[1].includes("underline"))
                odfXml += ' style:text-underline-type="solid"';
              if (decoMatch[1].includes("line-through"))
                odfXml +=
                  ' style:text-line-through-style="solid" style:text-line-through-type="single"';
            }
            odfXml += "/></style:style>";
            ensureAutoStyle(ctx, spanStyleName, odfXml);
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
              ctx.invokeImpl,
              ctx.images,
              ctx.imageCounter,
              ctx.warnings,
            );
            if (resolvedSrc !== src) {
              const img = ctx.images.get(src);
              // Same rasterization branch as the markdown-image token.
              if (ctx.rasterizeSvgFlag && img && img.mime === "image/svg+xml") {
                const rasterized = await tryRasterizeSvg(
                  ctx,
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
              xml += `<draw:frame draw:style-name="fr1" draw:name="${escapeXml(uniqueDrawName(ctx, alt || "image"))}" text:anchor-type="as-char"${sizeAttrs} draw:z-index="0"><draw:image xlink:href="${escapeXml(resolvedSrc)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"${mimeAttr}/></draw:frame>`;
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
