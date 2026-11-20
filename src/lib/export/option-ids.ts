/**
 * Every export-dialog option id in one dependency-free place.
 *
 * `option-settings.ts` (the id ↔ persisted-setting map) and `+page.svelte`
 * need these ids without the exporter implementations: statically importing
 * `exporters/*` from the entry bundle drags the whole export pipeline
 * (jszip, KaTeX, the diagram exporters) into the startup chunk and defeats
 * the exporter registry's lazy `import()`s. Keep this module a leaf — the
 * exporters import their ids from here, never the other way around.
 */
import { OPTION_INCLUDE_FRONTMATTER } from "./frontmatter-card";

export const HTML_OPTION_ID = `html.${OPTION_INCLUDE_FRONTMATTER}`;
export const HTML_BUNDLE_OPTION_ID = `html-bundle.${OPTION_INCLUDE_FRONTMATTER}`;
export const PDF_OPTION_ID = `pdf.${OPTION_INCLUDE_FRONTMATTER}`;

// The rasterization options live with their exporters' `readOptions`
// helpers; re-exported so every id can be imported from one place.
export {
  OPTION_RASTERIZE_MATH,
  OPTION_RASTERIZE_SVG,
  OPTION_RASTER_RESOLUTION,
  OPTION_ODT_INCLUDE_FRONTMATTER,
} from "./odt/options";
export {
  OPTION_DOCX_RASTERIZE_MATH,
  OPTION_DOCX_RASTERIZE_SVG,
  OPTION_DOCX_RASTER_RESOLUTION,
  OPTION_DOCX_INCLUDE_FRONTMATTER,
} from "./docx/options";
