/**
 * ODF-specific image helpers. The format-agnostic pieces (resolution,
 * dimension sniffing, inline-SVG token extraction) live in `../images.ts`
 * and are re-exported here so ODT call sites keep their import paths.
 */
export {
  cssLengthToInches,
  sniffSvgDimensions,
  sniffImageDimensions,
  resolveImage,
  tryExtractInlineSvg,
  tryExtractInlineHtmlSvg,
  type ResolvedImage,
} from "../images";

/** Format an inch length for an `svg:width` / `svg:height` attribute. */
export function inchesAttr(value: number): string {
  return `${value.toFixed(4)}in`;
}
