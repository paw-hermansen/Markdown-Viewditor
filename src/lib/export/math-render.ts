import katex from "katex";

// Side-effect: register the mhchem \ce and \pu macros on the global katex
// instance so chemical formulas (e.g. $\ce{H2O}$) and physical units
// (e.g. $\pu{123 kJ/mol}$) render in ODT/EPUB MathML exports. Ships inside
// katex; no extra dependency.
import "katex/contrib/mhchem";

/**
 * Fix MathML structural violations in KaTeX's MathML output so that
 * LibreOffice's strict parser can handle the formulas. Browsers and
 * MathJax are more forgiving; LibreOffice shows `¿` for unparseable
 * content such as dangling operators or illegally nested elements.
 *
 * Fixes applied:
 *   - Unwrap `<mi><munder>…</munder></mi>` → `<munder>…</munder>`.
 *   - Unwrap `<mo><mrow>…</mrow></mo>` → `<mrow>…</mrow>` (KaTeX wraps the
 *     base of `\underset` in `<mo>` instead of `<mrow>` when the base is
 *     a `\ce{}` expression).
 *   - Remove trailing empty `<mrow></mrow>` artefacts inside munder bodies.
 *   - Replace zero-width phantom `<mpadded width="0px"><mphantom>` with
 *     `<mrow/>`. KaTeX uses these as invisible bases for superscripts/
 *     subscripts in chemical formulas, but LibreOffice collapses them to
 *     nothing, leaving dangling `+`/`−` operators — hence `¿`.
 *   - Append `<mrow/>` after trailing `+`/`−`/`-` operators at the end of
 *     an `<mrow>`. LibreOffice's operator dictionary has no postfix entry
 *     for `+`/`−`, so it falls back to infix and expects a right operand.
 */
function sanitizeKaTeXMathml(mathml: string): string {
  let result = mathml;
  // <mi> (identifier) wrapping <munder> (underset) is illegal MathML —
  // KaTeX sometimes produces this when \underset{\text{…}}{\ce{…}} is
  // nested inside \ce{…}. Unwrap <mi>…</mi> around <munder>.
  result = result.replace(
    /<\s*mi\b[^>]*>\s*(<\s*munder\b[^>]*>)/g,
    "$1",
  );
  result = result.replace(
    /(<\/munder>)\s*<\/mi>/g,
    "$1",
  );
  // <mo> (operator) wrapping <mrow> is also illegal — KaTeX wraps the
  // \underset base in <mo> instead of <mrow> when the base is a \ce{}
  // expression. Unwrap <mo>…</mo> around <mrow>.
  result = result.replace(
    /<\s*mo\b[^>]*>\s*(<\s*mrow\b[^>]*>)/g,
    "$1",
  );
  result = result.replace(
    /(<\/mrow>)\s*<\/mo>/g,
    "$1",
  );
  // Remove trailing empty <mrow> artefacts inside munder bodies.
  result = result.replace(
    /<mrow>\s*<\/mrow>\s*(<\/mrow>)/g,
    "$1",
  );
  // Replace KaTeX's zero-width phantom base (width="0px" mpadded
  // wrapping mphantom>mi>X) with an empty <mrow/>. LibreOffice treats
  // an empty row as { } — a valid operand — preventing dangling-operator
  // errors that manifest as ¿.
  result = result.replace(
    /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b[^>]*>\s*<\s*mi\b[^>]*>\s*X\s*<\/mi>\s*<\/mphantom>\s*<\/mpadded>\s*/g,
    "<mrow/>",
  );
  // Wrap bare <mo>+/-</mo> inside <msup>/<msub> in <mrow> so it becomes a
  // proper child element.  KaTeX puts charge signs like ^{−} as direct
  // children of <msup>: <msup><mrow/><mo>−</mo></msup>.  This is valid
  // MathML, but LibreOffice needs the operator to be inside an <mrow> so
  // it can be resolved as postfix (not infix).  The wrapper keeps msup's
  // child count at 2 (base + superscript).
  result = result.replace(
    /(<msu[bp]><mrow\/>)<mo\b([^>]*)>\s*([+−-])\s*<\/mo>(<\/msu[bp]>)/g,
    "$1<mrow><mo$2>$3</mo></mrow>$4",
  );
  // Append <mrow/> after trailing +/−/- at the end of any <mrow>.  The
  // empty <mrow/> provides the right operand that LibreOffice's operator
  // dictionary requires (it has no postfix entry for + or −).  Browsers
  // render this as a minimal-width empty group — essentially invisible.
  result = result.replace(
    /(<mo\b[^>]*>\s*[+−-]\s*<\/mo>)\s*(<\/mrow>)/g,
    "$1<mrow/>$2",
  );
  return result;
}

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
    return sanitizeKaTeXMathml(html.slice(start, end + "</math>".length));
  }
  // Fallback: return as-is if no <math> found
  return html;
}
