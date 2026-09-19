import katex from "katex";
import type { FenceOptionSchema } from "../types";
import { memoizedKatex } from "./katex-cache";
import { mergeOptions } from "../directive-merge";

/**
 * KaTeX fence options schema. Defines the per-block attributes settable
 * via fence syntax (```math {key=val}) and HTML comment directives
 * (<!-- math: key=val -->).
 */
export const KATEX_OPTIONS_SCHEMA: FenceOptionSchema = {
  leqno: {
    type: "boolean",
    default: false,
    description: "Left-side equation numbers",
  },
  fleqn: {
    type: "boolean",
    default: false,
    description: "Flush-left display math",
  },
  fontsize: {
    type: "number",
    default: 1.0,
    min: 0.3,
    max: 5.0,
    description: "Font size scaling factor (multiplies base KaTeX 1.21em)",
  },
  throwOnError: {
    type: "boolean",
    default: false,
    description: "Throw on invalid LaTeX",
  },
  errorColor: {
    type: "string",
    default: "#cc0000",
    description: "Error color for invalid LaTeX",
  },
  strict: {
    type: "string",
    default: "warn",
    values: ["ignore", "warn", "error"],
    description: "KaTeX strictness level",
  },
  trust: {
    type: "boolean",
    default: false,
    description: "Allow dangerous commands (href, includegraphics)",
  },
};

/**
 * Render math with directive-aware option merging.
 * Merges schema defaults + directive state + fence options, then calls
 * KaTeX with the resolved options.
 *
 * @param latex - LaTeX source (without delimiters)
 * @param displayMode - true for display math, false for inline
 * @param directiveState - Cumulative directive state from HTML comments
 * @param fenceOpts - Per-block fence attributes
 * @returns Rendered HTML string
 */
export function renderMathWithDirectives(
  latex: string,
  displayMode: boolean,
  directiveState: Record<string, unknown>,
  fenceOpts: Record<string, unknown>,
): string {
  const merged = mergeOptions(KATEX_OPTIONS_SCHEMA, directiveState, fenceOpts);

  const leqno = merged.leqno === true;
  const fleqn = merged.fleqn === true;
  const throwOnError = merged.throwOnError === true;
  const errorColor =
    typeof merged.errorColor === "string" ? merged.errorColor : "#cc0000";
  const strict = typeof merged.strict === "string" ? merged.strict : "warn";
  const trust = merged.trust === true;
  const fontsize = typeof merged.fontsize === "number" ? merged.fontsize : 1.0;

  const katexOpts: katex.KatexOptions = {
    displayMode,
    leqno,
    fleqn,
    throwOnError,
    errorColor,
    strict: strict as katex.KatexOptions["strict"],
    trust,
  };

  const html = memoizedKatex.renderToString(latex, katexOpts);

  // Apply fontsize via CSS variable if non-default.
  if (fontsize !== 1.0) {
    const wrapperClass = displayMode ? "katex-block" : "";
    const classAttr = wrapperClass ? ` class="${wrapperClass}"` : "";
    return `<span${classAttr} style="--katex-font-scale: ${fontsize}">${html}</span>`;
  }

  return html;
}
