import { OPTION_INCLUDE_FRONTMATTER } from "../frontmatter-card";

export const OPTION_RASTERIZE_MATH = "odt.rasterizeMath";
export const OPTION_RASTERIZE_SVG = "odt.rasterizeSvg";
export const OPTION_RASTER_RESOLUTION = "odt.rasterResolution";
export const OPTION_ODT_INCLUDE_FRONTMATTER = `odt.${OPTION_INCLUDE_FRONTMATTER}`;

export interface ExportOptions {
  [OPTION_RASTERIZE_MATH]?: boolean;
  [OPTION_RASTERIZE_SVG]?: boolean;
  [OPTION_RASTER_RESOLUTION]?: 1 | 2 | 3 | 4;
  [OPTION_ODT_INCLUDE_FRONTMATTER]?: boolean;
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
    [OPTION_RASTERIZE_MATH]: asBool(opts?.[OPTION_RASTERIZE_MATH], false),
    [OPTION_RASTERIZE_SVG]: asBool(opts?.[OPTION_RASTERIZE_SVG], false),
    [OPTION_RASTER_RESOLUTION]: asRes(opts?.[OPTION_RASTER_RESOLUTION], 2),
    [OPTION_ODT_INCLUDE_FRONTMATTER]: asBool(
      opts?.[OPTION_ODT_INCLUDE_FRONTMATTER],
      true,
    ),
  };
}
