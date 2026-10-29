/**
 * Explicit state for the ODT document builder (PR-13).
 *
 * The 8 inline-format flags are **flat toggles**, not a stack — an
 * unbalanced raw-HTML tag (`<b>` with no close) leaks into later tokens
 * today, and that behaviour must be preserved. `currentStyle()` keeps the
 * fixed B, I, U, S letter order of the `Char_*` style names, sub winning
 * over sup, and `mark`/`link` as orthogonal overlays.
 */

import type { InvokeImpl } from "../assets";
import {
  OPTION_RASTERIZE_MATH,
  OPTION_RASTERIZE_SVG,
  OPTION_RASTER_RESOLUTION,
  type ExportOptions,
} from "./options";
import type { ResolvedImage } from "./images";
import type { MathObject } from "./odf-styles";

export type ContextType =
  "blockquote" | "bullet_list" | "ordered_list" | "task_list";

export class InlineFormatState {
  boldActive = false;
  italicActive = false;
  underlineActive = false;
  strikeActive = false;
  linkHref: string | null = null;
  subActive = false;
  superActive = false;
  markActive = false;

  currentStyle(): string | null {
    let flags = "";
    if (this.boldActive) flags += "B";
    if (this.italicActive) flags += "I";
    if (this.underlineActive) flags += "U";
    if (this.strikeActive) flags += "S";
    if (flags === "") flags = "P";

    let position = "";
    if (this.subActive) position = "_sub";
    else if (this.superActive) position = "_sup";

    if (flags === "P" && position === "") return null;

    return `Char_${flags}${position}`;
  }
}

/**
 * The mutable state threaded through every renderer. Renderers are plain
 * functions taking this as their first parameter (the god-function's closure
 * made explicit).
 */
export interface OdtBuildContext {
  autoStyles: Map<string, string>;
  /** Package entries keyed by the image's logical identity (see `resolveImage`). */
  images: Map<string, ResolvedImage>;
  imageCounter: { n: number };
  /** Counter box so it stays mutable through the context. */
  mathCounter: { n: number };
  mathObjects: MathObject[];
  footnoteBodies: Map<string, string>;
  drawNameCount: Map<string, number>;
  warnings: string[];
  options: ExportOptions;
  invokeImpl: InvokeImpl;
  directiveStateMap: Array<[number, Record<string, unknown>]>;
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]>;
  inlineState: InlineFormatState;
  contextStack: ContextType[];

  // Derived from `options`, hoisted for direct renderer access.
  rasterizeMath: boolean;
  rasterizeSvgFlag: boolean;
  rasterScale: number;
  mathTargetFontSize: number;
}

export function createBuildContext(input: {
  invokeImpl: InvokeImpl;
  warnings: string[];
  options: ExportOptions;
  directiveStateMap: Array<[number, Record<string, unknown>]>;
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]>;
}): OdtBuildContext {
  const { options } = input;
  return {
    autoStyles: new Map(),
    images: new Map(),
    imageCounter: { n: 1 },
    mathCounter: { n: 0 },
    mathObjects: [],
    footnoteBodies: new Map(),
    drawNameCount: new Map(),
    warnings: input.warnings,
    options,
    invokeImpl: input.invokeImpl,
    directiveStateMap: input.directiveStateMap,
    mermaidDirectiveStateMap: input.mermaidDirectiveStateMap,
    inlineState: new InlineFormatState(),
    contextStack: [],
    rasterizeMath: !!options[OPTION_RASTERIZE_MATH],
    rasterizeSvgFlag: !!options[OPTION_RASTERIZE_SVG],
    rasterScale: options[OPTION_RASTER_RESOLUTION] ?? 2,
    // Target font size for rasterized math: the ODT body text is 10pt
    // (≈ 13.33px at 96 DPI). KaTeX renders at HOST_FONT_SIZE × 1.21em, so we
    // pass 11px so the returned dimensions match 10pt (supersampling).
    mathTargetFontSize: 11,
  };
}
