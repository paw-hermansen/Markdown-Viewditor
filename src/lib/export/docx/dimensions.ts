/**
 * Page geometry and unit conversions for the DOCX exporter.
 *
 * A4 page with 2 cm margins (EXPORT-PLAN 8.8) — consistent with the PDF
 * exporter's A4 target. All OOXML lengths are twips (1/20 pt, 1440/inch) for
 * text/tables and EMU (914400/inch) for drawings.
 */
import { VIEWER_CONTENT_MAX_WIDTH_PX } from "$lib/constants/layout";

export const PAGE_WIDTH_TWIPS = 11906; // A4
export const PAGE_HEIGHT_TWIPS = 16838;
export const MARGIN_TWIPS = 1134; // 2 cm
export const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * MARGIN_TWIPS; // 9638

/** Content width in CSS px at 96 DPI — the drawing clamp target. */
export const CONTENT_WIDTH_PX = (CONTENT_WIDTH_TWIPS / 1440) * 96; // ≈ 642.5

/** Scale from viewer layout px to page px (mirrors `odt/dimensions.ts`). */
export const VIEWER_TO_PAGE_SCALE =
  CONTENT_WIDTH_PX / VIEWER_CONTENT_MAX_WIDTH_PX;

export const EMU_PER_PX = 9525; // 914400 EMU/in ÷ 96 px/in

export function pxToEmu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

export function pxToTwips(px: number): number {
  return Math.round(px * 15); // 1 px = 1/96 in = 15 twips
}

/**
 * Height above the text baseline of a body-text line box's center.
 *
 * Calibri 11pt with the `docDefaults` rule `w:line=276 w:lineRule="auto"`
 * (1.15 spacing): single line ≈ 17.5px, ×1.15 ≈ 20px, whose center sits
 * ≈ 5px above the baseline. The inline-math `w:position` shift aims the
 * formula's ink at this height — the placement the ODT exporter's `Formula`
 * graphic style (`vertical-pos="middle" vertical-rel="text"`) produces.
 * One tunable constant; verified against ODT output in TEST-PLAN 7.10.
 */
export const LINE_CENTER_ABOVE_BASELINE_PX = 5;

/**
 * Vertical shift (CSS px, positive = down) that moves an inline drawing
 * from Word's bottom-edge-on-the-baseline placement to line-centered:
 * the frame center sits `H/2` above the baseline and must land at
 * {@link LINE_CENTER_ABOVE_BASELINE_PX}.
 */
export function inlineMathShiftPx(frameHeightPx: number): number {
  return frameHeightPx / 2 - LINE_CENTER_ABOVE_BASELINE_PX;
}

/** CSS px → signed half-points for `w:position` (1 px = 0.75 pt = 1.5 hps). */
export function pxToHalfPoints(px: number): number {
  return Math.max(-2000, Math.min(2000, Math.round(px * 1.5)));
}

/** Clamp a drawing to the page content width, preserving aspect ratio. */
export function fitDrawingToPage(
  logicalWidthPx: number,
  logicalHeightPx: number,
): { frameWidthPx: number; frameHeightPx: number } {
  if (logicalWidthPx <= CONTENT_WIDTH_PX) {
    return { frameWidthPx: logicalWidthPx, frameHeightPx: logicalHeightPx };
  }
  const fitScale = CONTENT_WIDTH_PX / logicalWidthPx;
  return {
    frameWidthPx: logicalWidthPx * fitScale,
    frameHeightPx: logicalHeightPx * fitScale,
  };
}

/**
 * Display size for a Mermaid diagram, matching the viewer's layout logic
 * (`computeMermaidFrameDims` in `odt/dimensions.ts`, retargeted at the DOCX
 * content width).
 */
export function computeMermaidFrameDims(
  naturalWidthPx: number,
  naturalHeightPx: number,
  opts: { maxWidth: number; fitToWidth: boolean },
): { frameWidthPx: number; frameHeightPx: number } {
  if (naturalWidthPx <= 0 || naturalHeightPx <= 0) {
    return { frameWidthPx: naturalWidthPx, frameHeightPx: naturalHeightPx };
  }
  const displayWidthPx =
    opts.fitToWidth === false
      ? naturalWidthPx
      : Math.min(naturalWidthPx, opts.maxWidth, VIEWER_CONTENT_MAX_WIDTH_PX);
  const scale = (displayWidthPx / naturalWidthPx) * VIEWER_TO_PAGE_SCALE;
  const frameWidthPx = naturalWidthPx * scale;
  const frameHeightPx = naturalHeightPx * scale;
  return opts.fitToWidth === false
    ? fitDrawingToPage(frameWidthPx, frameHeightPx)
    : { frameWidthPx, frameHeightPx };
}

/**
 * Vega-Lite frames: the mermaid model minus `maxWidth` (charts size
 * themselves from the spec; `fitToWidth` caps the viewer column the same
 * way). Mirrors `computeVegaLiteFrameDims` in `odt/dimensions.ts`.
 */
export function computeVegaLiteFrameDims(
  naturalWidthPx: number,
  naturalHeightPx: number,
  opts: { fitToWidth: boolean },
): { frameWidthPx: number; frameHeightPx: number } {
  return computeMermaidFrameDims(naturalWidthPx, naturalHeightPx, {
    maxWidth: Number.POSITIVE_INFINITY,
    fitToWidth: opts.fitToWidth,
  });
}
