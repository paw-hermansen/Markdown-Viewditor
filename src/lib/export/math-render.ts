import katex from "katex";

/**
 * Render a LaTeX string to MathML using KaTeX. Suitable for ODT and EPUB
 * export where native MathML support is available.
 *
 * @param tex - LaTeX source (without delimiters)
 * @param displayMode - true for display math ($$...$$), false for inline ($...$)
 * @returns MathML markup string (the <math> element only, no KaTeX wrapper)
 */
export function renderMathToMathml(tex: string, displayMode = false): string {
  const html = katex.renderToString(tex, {
    output: "mathml",
    throwOnError: false,
    displayMode,
  });
  // KaTeX wraps the <math> element in <span class="katex">...</span>.
  // Extract just the <math>...</math> portion for use in ODF/EPUB.
  const start = html.indexOf("<math");
  const end = html.lastIndexOf("</math>");
  if (start >= 0 && end >= 0) {
    return html.slice(start, end + "</math>".length);
  }
  // Fallback: return as-is if no <math> found
  return html;
}
