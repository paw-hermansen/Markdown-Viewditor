import { MATH_HOST_WIDTH_PX } from "../math-render";
import { VIEWER_CONTENT_MAX_WIDTH_PX } from "$lib/constants/layout";

export const ODT_PAGE_CONTENT_WIDTH_PX = MATH_HOST_WIDTH_PX;

export const VIEWER_TO_PAGE_SCALE =
  ODT_PAGE_CONTENT_WIDTH_PX / VIEWER_CONTENT_MAX_WIDTH_PX;

export function fitFrameToPage(
  logicalWidthPx: number,
  logicalHeightPx: number,
): { frameWidthPx: number; frameHeightPx: number } {
  if (logicalWidthPx <= ODT_PAGE_CONTENT_WIDTH_PX) {
    return { frameWidthPx: logicalWidthPx, frameHeightPx: logicalHeightPx };
  }
  const fitScale = ODT_PAGE_CONTENT_WIDTH_PX / logicalWidthPx;
  return {
    frameWidthPx: logicalWidthPx * fitScale,
    frameHeightPx: logicalHeightPx * fitScale,
  };
}

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
    ? fitFrameToPage(frameWidthPx, frameHeightPx)
    : { frameWidthPx, frameHeightPx };
}
