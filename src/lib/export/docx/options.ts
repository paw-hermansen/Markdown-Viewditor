import { OPTION_INCLUDE_FRONTMATTER } from "../frontmatter-card";

/**
 * Per-export options for the DOCX exporter. Parallel to `odt/options.ts`,
 * with two deliberate differences (EXPORT-PLAN Part 8):
 *
 * - `docx.rasterizeMath` selects PNG math vs **OMML** (not MathML — DOCX has
 *   no native MathML form).
 * - `docx.rasterizeSvg` defaults to **true** (PNG-only diagrams/images — the
 *   safe default). Turning it off embeds SVG + PNG fallback (svgBlip).
 */
export const OPTION_DOCX_RASTERIZE_MATH = "docx.rasterizeMath";
export const OPTION_DOCX_RASTERIZE_SVG = "docx.rasterizeSvg";
export const OPTION_DOCX_RASTER_RESOLUTION = "docx.rasterResolution";
export const OPTION_DOCX_INCLUDE_FRONTMATTER = `docx.${OPTION_INCLUDE_FRONTMATTER}`;

export interface ExportOptions {
  [OPTION_DOCX_RASTERIZE_MATH]?: boolean;
  [OPTION_DOCX_RASTERIZE_SVG]?: boolean;
  [OPTION_DOCX_RASTER_RESOLUTION]?: 1 | 2 | 3 | 4;
  [OPTION_DOCX_INCLUDE_FRONTMATTER]?: boolean;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function asRes(v: unknown, fallback: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : fallback;
}

export function readOptions(
  opts: Record<string, unknown> | undefined,
): ExportOptions {
  return {
    [OPTION_DOCX_RASTERIZE_MATH]: asBool(
      opts?.[OPTION_DOCX_RASTERIZE_MATH],
      false,
    ),
    // PNG-only is the compatibility-safe default (EXPORT-PLAN 8.3 rule 14).
    [OPTION_DOCX_RASTERIZE_SVG]: asBool(
      opts?.[OPTION_DOCX_RASTERIZE_SVG],
      true,
    ),
    [OPTION_DOCX_RASTER_RESOLUTION]: asRes(
      opts?.[OPTION_DOCX_RASTER_RESOLUTION],
      2,
    ),
    [OPTION_DOCX_INCLUDE_FRONTMATTER]: asBool(
      opts?.[OPTION_DOCX_INCLUDE_FRONTMATTER],
      true,
    ),
  };
}
