import katex from "katex";

/**
 * Render a LaTeX string to MathML using KaTeX. Suitable for ODT and EPUB
 * export where native MathML support is available.
 *
 * @param tex - LaTeX source (without delimiters)
 * @param displayMode - true for display math ($$...$$), false for inline ($...$)
 * @returns MathML markup string
 */
export function renderMathToMathml(tex: string, displayMode = false): string {
  return katex.renderToString(tex, {
    output: "mathml",
    throwOnError: false,
    displayMode,
  });
}
