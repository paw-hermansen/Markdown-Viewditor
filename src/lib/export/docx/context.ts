/**
 * Explicit state for the DOCX document builder — the DOCX sibling of
 * `odt/context.ts`. The inline-format flags are flat toggles (not a stack),
 * mirroring the ODT exporter's deliberate preservation of unbalanced raw-HTML
 * tag behavior.
 */
import type { InvokeImpl } from "../assets";
import {
  OPTION_DOCX_RASTERIZE_MATH,
  OPTION_DOCX_RASTERIZE_SVG,
  OPTION_DOCX_RASTER_RESOLUTION,
  type ExportOptions,
} from "./options";
import type { ResolvedImage } from "../images";
import type { RunProps } from "./runs";
import type { NumEntry } from "./styles";

export type ContextType =
  "blockquote" | "bullet_list" | "ordered_list" | "task_list";

export interface RelEntry {
  id: string;
  /** Full relationship type URI (see `package.ts`). */
  type: string;
  target: string;
  external: boolean;
}

export interface FootnoteDef {
  /** `w:id` (integer), assigned in document order. */
  id: number;
  /** Citation label shown in the text (markdown footnote label). */
  label: string;
  /** Block XML for the note body (first paragraph carries the ref mark). */
  bodyXml: string;
}

export class InlineFormatState {
  boldActive = false;
  italicActive = false;
  underlineActive = false;
  strikeActive = false;
  subActive = false;
  superActive = false;
  markActive = false;
  kbdActive = false;
  /** Active hyperlink's relationship id (runs are wrapped in w:hyperlink). */
  linkRid: string | null = null;
  /** Overlay from a raw `<span style="…">` (color, bg, bold, italic, …). */
  spanProps: RunProps | null = null;

  runProps(): RunProps {
    const p: RunProps = {};
    if (this.kbdActive) p.style = "Code";
    if (this.boldActive) p.bold = true;
    if (this.italicActive) p.italic = true;
    if (this.strikeActive) p.strike = true;
    if (this.underlineActive) p.underline = true;
    if (this.markActive) p.highlight = true;
    if (this.subActive) p.vertAlign = "subscript";
    else if (this.superActive) p.vertAlign = "superscript";
    if (this.linkRid) p.style = "Hyperlink";
    return this.spanProps
      ? {
          ...p,
          ...this.spanProps,
          style: p.style ?? this.spanProps.style ?? null,
        }
      : p;
  }
}

export interface DocxBuildContext {
  invokeImpl: InvokeImpl;
  warnings: string[];
  options: ExportOptions;
  /** Package media entries keyed by the image's logical identity. */
  images: Map<string, ResolvedImage>;
  imageCounter: { n: number };
  /** Relationships collected for `word/_rels/document.xml.rels`. */
  rels: RelEntry[];
  relByKey: Map<string, string>;
  relCounter: { n: number };
  /** `wp:docPr` ids — unique per drawing. */
  docPrCounter: { n: number };
  /** `w:num` instances collected for `word/numbering.xml`. */
  nums: NumEntry[];
  numCounter: { n: number };
  footnoteDefs: FootnoteDef[];
  footnoteById: Map<string, FootnoteDef>;
  footnoteCounter: { n: number };
  contextStack: ContextType[];
  inlineState: InlineFormatState;
  /** True while rendering footnote bodies (paragraph style FootnoteText). */
  inFootnote: boolean;
  directiveStateMap: Array<[number, Record<string, unknown>]>;
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]>;
  smilesDirectiveStateMap: Array<[number, Record<string, unknown>]>;
  vegaLiteDirectiveStateMap: Array<[number, Record<string, unknown>]>;

  // Derived from `options`, hoisted for direct renderer access.
  rasterizeMath: boolean;
  rasterizeSvgFlag: boolean;
  rasterScale: number;
  mathTargetFontSize: number;

  addRel(type: string, target: string, external: boolean): string;
}

export function createBuildContext(input: {
  invokeImpl: InvokeImpl;
  warnings: string[];
  options: ExportOptions;
  directiveStateMap: Array<[number, Record<string, unknown>]>;
  mermaidDirectiveStateMap: Array<[number, Record<string, unknown>]>;
  smilesDirectiveStateMap?: Array<[number, Record<string, unknown>]>;
  vegaLiteDirectiveStateMap?: Array<[number, Record<string, unknown>]>;
}): DocxBuildContext {
  const { options } = input;
  const ctx: DocxBuildContext = {
    invokeImpl: input.invokeImpl,
    warnings: input.warnings,
    options,
    images: new Map(),
    imageCounter: { n: 1 },
    rels: [],
    relByKey: new Map(),
    relCounter: { n: 0 },
    docPrCounter: { n: 1 },
    nums: [],
    numCounter: { n: 2 }, // numId 1 is the shared bullet instance
    footnoteDefs: [],
    footnoteById: new Map(),
    footnoteCounter: { n: 1 },
    contextStack: [],
    inlineState: new InlineFormatState(),
    inFootnote: false,
    directiveStateMap: input.directiveStateMap,
    mermaidDirectiveStateMap: input.mermaidDirectiveStateMap,
    smilesDirectiveStateMap: input.smilesDirectiveStateMap ?? [],
    vegaLiteDirectiveStateMap: input.vegaLiteDirectiveStateMap ?? [],
    rasterizeMath: !!options[OPTION_DOCX_RASTERIZE_MATH],
    rasterizeSvgFlag: !!options[OPTION_DOCX_RASTERIZE_SVG],
    rasterScale: options[OPTION_DOCX_RASTER_RESOLUTION] ?? 2,
    // Target font size for rasterized math. Calibration (validated against
    // the ODT exporter's 11px for its 10pt body): KaTeX renders at
    // HOST_FONT_SIZE × 1.21em, so a body of `pt` points needs
    // `pt × 4/3 ÷ 1.21` — the DOCX body is 11pt (Calibri sz 22), giving
    // ≈ 12.1. (An earlier value of 15 skipped the ÷1.21 and rendered
    // formulas ~24% too large against the body text.)
    mathTargetFontSize: 12,
    addRel(type, target, external) {
      const key = `${type}|${target}|${external ? "x" : ""}`;
      const existing = ctx.relByKey.get(key);
      if (existing) return existing;
      const id = `rId${++ctx.relCounter.n}`;
      ctx.relByKey.set(key, id);
      ctx.rels.push({ id, type, target, external });
      return id;
    },
  };
  return ctx;
}
