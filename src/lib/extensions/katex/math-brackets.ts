import type MarkdownIt from "markdown-it";

/**
 * Math bracket support: adds `\(...\)` inline and `\[...\]` block delimiters
 * on top of the @vscode/markdown-it-katex plugin (which handles `$...$` /
 * `$$...$$`, bare `\begin{...}` blocks, and ```` ```math ```` fences). The
 * @vscode plugin must be registered first so its `math_inline` / `math_block`
 * renderers are already in place — this plugin only emits tokens of those
 * same types, so rendering flows through the @vscode KaTeX path unchanged.
 */

export default function mathBracketsPlugin(md: MarkdownIt): void {
  /**
   * Inline rule: `\(...\)`. Registered BEFORE `escape` — the escape rule would
   * otherwise consume the backslash and render a literal `(`, hiding the
   * delimiter from us. Emits a `math_inline` token (same type as the @vscode
   * plugin's `$...$` rule) with `markup: '\('` so the levels detector can
   * distinguish bracket-form math from dollar-form.
   */
  md.inline.ruler.before("escape", "math_inline_bracket", (state, silent) => {
    const src = state.src;
    const start = state.pos;

    // Opening \( — backslash followed by (.
    if (src[start] !== "\\" || src[start + 1] !== "(") return false;

    // Honor backslash escaping: an odd run of backslashes before the opening
    // means this `(` is escaped, not a math delimiter.
    let backslashes = 0;
    let p = start - 1;
    while (p >= 0 && src[p] === "\\") {
      backslashes++;
      p--;
    }
    if (backslashes % 2 === 1) return false;

    // Find the closing `\)` on the same line (inline math cannot span lines).
    let pos = start + 2;
    let end = -1;
    while (pos < src.length) {
      if (src[pos] === "\\" && src[pos + 1] === ")") {
        // Count preceding backslashes; only unescaped `\)` closes.
        let bs = 0;
        let q = pos - 1;
        while (q > start && src[q] === "\\") {
          bs++;
          q--;
        }
        if (bs % 2 === 0) {
          end = pos;
          break;
        }
      }
      if (src[pos] === "\n") return false;
      pos++;
    }
    if (end === -1) return false;

    const content = src.slice(start + 2, end);
    // Empty `\(\)` is not a math expression.
    if (content.length === 0) return false;

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.markup = "\\(";
      token.content = content;
    }
    state.pos = end + 2;
    return true;
  });

  /**
   * Block rule: `\[...\]` on its own line(s). Registered before `paragraph`
   * so it claims the block before paragraph parsing. Emits a `math_block`
   * token (same type as the @vscode plugin's `$$...$$` rule) with
   * `markup: '\['` and `token.map = [startLine, nextLine]` — the map is
   * required so the post-registration anchor injector can tag the rendered
   * `<p class="katex-block">` with a `data-line` attribute for scroll-sync.
   */
  md.block.ruler.before(
    "paragraph",
    "math_block_bracket",
    (state, startLine, endLine, silent) => {
      const startBm = state.bMarks[startLine] + state.tShift[startLine];
      const startEm = state.eMarks[startLine];

      // Opening `\[` must be at the line start (after indentation) and consume
      // the rest of the line (only trailing whitespace allowed).
      if (startEm - startBm < 2) return false;
      if (state.src.slice(startBm, startBm + 2) !== "\\[") return false;

      const afterOpen = state.src.slice(startBm + 2, startEm);
      if (afterOpen.trim() !== "") return false;

      if (silent) return true;

      // Scan forward for the closing `\]` line. The closing delimiter must
      // also be on its own line.
      let nextLine = startLine + 1;
      let found = false;
      while (nextLine < endLine) {
        const bm = state.bMarks[nextLine] + state.tShift[nextLine];
        const em = state.eMarks[nextLine];
        const line = state.src.slice(bm, em);
        if (line.trim() === "\\]") {
          found = true;
          break;
        }
        // A line with negative indent (less than blkIndent) ends the block.
        if (bm < em && state.tShift[nextLine] < state.blkIndent) break;
        nextLine++;
      }
      if (!found) return false;

      // Body lines between the opening `\[` and closing `\]` (exclusive).
      const bodyStart = state.eMarks[startLine] + 1;
      const bodyEnd = state.bMarks[nextLine];
      const content = state.src.slice(bodyStart, bodyEnd).trim();

      const token = state.push("math_block", "math", 0);
      token.block = true;
      token.markup = "\\[";
      token.content = content;
      token.map = [startLine, nextLine + 1];

      state.line = nextLine + 1;
      return true;
    },
    {
      alt: ["paragraph", "reference", "blockquote", "list"],
    },
  );
}
