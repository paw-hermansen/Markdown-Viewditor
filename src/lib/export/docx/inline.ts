/**
 * Inline token → run pieces for the DOCX exporter (EXPORT-PLAN 8.9).
 *
 * Mirrors `odt/inline.ts` token-for-token, emitting {@link Piece}s instead of
 * ODF spans. Flat toggles preserve the ODT exporter's unbalanced-raw-HTML
 * behavior on purpose.
 */
import type Token from "markdown-it/lib/token.mjs";
import {
  resolveImage,
  sniffSvgDimensions,
  tryExtractInlineSvg,
  tryExtractInlineHtmlSvg,
} from "../images";
import type { DocxBuildContext } from "./context";
import { type Piece, textPiece, type RunProps } from "./runs";
import { isOpeningTag } from "./utils";
import {
  REL_HYPERLINK,
  buildMathRenderOpts,
  embedSvgGraphic,
  imageSizeEmu,
  mediaDrawingXml,
  renderMath,
} from "./media";
import type { ResolvedImage } from "../images";

function rawPiece(xml: string): Piece {
  return { kind: "raw", xml };
}

/** Build a drawing piece for a resolved markdown/HTML image. */
async function imagePiece(
  ctx: DocxBuildContext,
  src: string,
  alt: string,
  widthAttr: string | null,
  heightAttr: string | null,
): Promise<Piece> {
  const resolvedSrc = await resolveImage(
    src,
    ctx.invokeImpl,
    ctx.images,
    ctx.imageCounter,
    ctx.warnings,
    "word/media/",
  );
  if (resolvedSrc === src) {
    // Unresolvable source — degrade to a text placeholder (ODT parity).
    return textPiece(
      `[Image: ${alt || src}]`,
      ctx.inlineState.runProps(),
      ctx.inlineState.linkRid,
    );
  }
  const img: ResolvedImage | undefined = ctx.images.get(src);
  if (img && img.mime === "image/svg+xml") {
    const svgXml = new TextDecoder().decode(img.data);
    const dims = { width: img.widthPx, height: img.heightPx };
    const drawing = await embedSvgGraphic(
      ctx,
      svgXml,
      dims,
      `image(${src})`,
      alt || src,
      // Dedupe key = the image's source: raster mode supersedes the vector
      // entry, vector mode reuses it for the dual embed.
      src,
      img,
    );
    return rawPiece(drawing);
  }
  const frame = imageSizeEmu(img ?? null, widthAttr, heightAttr);
  if (img) {
    return rawPiece(mediaDrawingXml(ctx, img, frame, alt || src));
  }
  return textPiece(
    `[Image: ${alt || src}]`,
    ctx.inlineState.runProps(),
    ctx.inlineState.linkRid,
  );
}

/** Parse a raw `<span style="…">` into a run-props overlay (safe subset). */
function parseSpanStyle(cssStyle: string): RunProps {
  const p: RunProps = {};
  const colorMatch = cssStyle.match(/(?:^|[^-\w])color\s*:\s*([^;]+)/i);
  if (colorMatch) {
    const v = colorMatch[1].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) p.color = v;
  }
  const bgMatch = cssStyle.match(/background(?:-color)?\s*:\s*([^;]+)/i);
  if (bgMatch) {
    const v = bgMatch[1].trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) p.shd = v;
  }
  const sizeMatch = cssStyle.match(/font-size\s*:\s*([\d.]+)(pt|px)/i);
  if (sizeMatch) {
    const value = parseFloat(sizeMatch[1]);
    // w:sz is half-points: pt × 2, px × 1.5.
    p.sz =
      sizeMatch[2].toLowerCase() === "pt"
        ? Math.round(value * 2)
        : Math.round(value * 1.5);
  }
  const familyMatch = cssStyle.match(/font-family\s*:\s*([^;]+)/i);
  if (familyMatch) {
    const first = familyMatch[1]
      .split(",")[0]
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (first) p.rFonts = first;
  }
  if (/font-weight\s*:\s*(bold|[6-9]\d\d)/i.test(cssStyle)) p.bold = true;
  if (/font-style\s*:\s*italic/i.test(cssStyle)) p.italic = true;
  const decoMatch = cssStyle.match(/text-decoration\s*:\s*([^;]+)/i);
  if (decoMatch) {
    if (decoMatch[1].includes("underline")) p.underline = true;
    if (decoMatch[1].includes("line-through")) p.strike = true;
  }
  return p;
}

export async function renderInline(
  ctx: DocxBuildContext,
  children: Token[],
  sourceLine = 0,
): Promise<Piece[]> {
  const pieces: Piece[] = [];
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
          pieces.push(
            rawPiece(
              await embedSvgGraphic(ctx, svg.svgXml, dims, label, "inline SVG"),
            ),
          );
          ci += svg.consumedCount - 1;
          break;
        }
        pieces.push(
          textPiece(
            child.content,
            ctx.inlineState.runProps(),
            ctx.inlineState.linkRid,
          ),
        );
        break;
      }
      case "code_inline":
        pieces.push(
          textPiece(
            child.content,
            { ...ctx.inlineState.runProps(), style: "Code" },
            ctx.inlineState.linkRid,
          ),
        );
        break;
      case "softbreak":
        pieces.push(
          textPiece(" ", ctx.inlineState.runProps(), ctx.inlineState.linkRid),
        );
        break;
      case "hardbreak":
        pieces.push(rawPiece("<w:r><w:br/></w:r>"));
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
      case "link_open": {
        const href = child.attrGet("href") ?? "";
        ctx.inlineState.linkRid = ctx.addRel(REL_HYPERLINK, href, true);
        break;
      }
      case "link_close":
        ctx.inlineState.linkRid = null;
        break;
      case "image": {
        pieces.push(
          await imagePiece(
            ctx,
            child.attrGet("src") ?? "",
            child.content,
            child.attrGet("width"),
            child.attrGet("height"),
          ),
        );
        break;
      }
      case "math_inline": {
        pieces.push(
          rawPiece(
            await renderMath(
              ctx,
              "inline",
              child.content,
              buildMathRenderOpts(ctx, sourceLine),
            ),
          ),
        );
        break;
      }
      case "footnote_ref": {
        const noteId = String(child.meta?.id ?? child.meta?.label ?? "0");
        let def = ctx.footnoteById.get(noteId);
        if (!def) {
          // A reference without a pre-rendered body (shouldn't happen with
          // markdown-it-footnote, but never emit a dangling reference).
          def = {
            id: ctx.footnoteCounter.n++,
            label: String(child.meta?.label ?? noteId),
            bodyXml: "",
          };
          ctx.footnoteById.set(noteId, def);
          ctx.footnoteDefs.push(def);
        }
        pieces.push(
          rawPiece(
            `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>` +
              `<w:footnoteReference w:id="${def.id}"/></w:r>`,
          ),
        );
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
            pieces.push(
              rawPiece(
                await embedSvgGraphic(
                  ctx,
                  svgRes.svgXml,
                  dims,
                  label,
                  "inline SVG",
                ),
              ),
            );
            ci += svgRes.consumedCount - 1;
            break;
          }
        }
        if (isOpeningTag(lower, "br")) {
          pieces.push(rawPiece("<w:r><w:br/></w:r>"));
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
          ctx.inlineState.kbdActive = true;
        } else if (lower === "</kbd>") {
          ctx.inlineState.kbdActive = false;
        } else if (lower.startsWith("<span")) {
          const styleMatch = raw.match(/style\s*=\s*"([^"]*)"/i);
          if (styleMatch) {
            ctx.inlineState.spanProps = parseSpanStyle(styleMatch[1]);
          }
        } else if (lower === "</span>") {
          ctx.inlineState.spanProps = null;
        } else if (lower.startsWith("<img")) {
          const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
          if (srcMatch) {
            const altMatch = raw.match(/alt\s*=\s*["']([^"']*)["']/i);
            const widthMatch = raw.match(/width\s*=\s*["']([^"']+)["']/i);
            const heightMatch = raw.match(/height\s*=\s*["']([^"']+)["']/i);
            pieces.push(
              await imagePiece(
                ctx,
                srcMatch[1],
                altMatch?.[1] ?? "",
                widthMatch?.[1] ?? null,
                heightMatch?.[1] ?? null,
              ),
            );
          }
        }
        // Other HTML tags are silently ignored.
        break;
      }
    }
  }
  return pieces;
}
