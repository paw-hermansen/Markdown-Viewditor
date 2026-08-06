import MarkdownIt from "markdown-it";
import { registerFeatureDetectors } from "./markdown-levels";

/**
 * Math support: adds `\(...\)` inline and `\[...\]` block delimiters on top of
 * the @vscode/markdown-it-katex plugin (which handles `$...$` / `$$...$$`,
 * bare `\begin{...}` blocks, and ```` ```math ```` fences). The @vscode plugin
 * must be registered first so its `math_inline` / `math_block` renderers are
 * already in place — this plugin only emits tokens of those same types, so
 * rendering flows through the @vscode KaTeX path unchanged.
 *
 * Also registers the `math-dollar` and `math-latex` syntax-level detectors
 * (toggles #8 / #9 from PLAN-MATH-SUPPORT.md). Keeping the detectors here
 * concentrates all math integration in one module; the registry is idempotent
 * on `id` so multiple imports are safe.
 */

// Inline-rule state type, extracted via indexed access so we don't rely on the
// `MarkdownIt.StateInline` namespace member (which verbatimModuleSyntax +
// `export =` make awkward to reach).
type InlineState = Parameters<
  Parameters<MarkdownIt["inline"]["ruler"]["at"]>[1]
>[0];

// --- Token-emitting rules --------------------------------------------------
// The rule functions are inlined into the ruler calls below so their `state`
// params pick up markdown-it's contextual typing (RuleInline / RuleBlock),
// matching the pattern used by the other custom plugins in markdown.ts and
// avoiding explicit `any` annotations.

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

// --- Backtick-safe dollar rules --------------------------------------------
// The @vscode/markdown-it-katex inline `$…$` / `$$…$$` rules search the raw
// source for the closing delimiter without respecting backtick code spans, so
// a `$` *inside* `` `$` `` gets picked as a closer and swallows everything
// between as a `math_inline` token (which KaTeX then renders as italic math
// variables — the classic "prices paragraph turns italic" bug). We replace
// those two inline rules with backtick-aware reimplementations that faithfully
// reproduce the @vscode pandoc delimiter logic but skip any candidate closer
// that falls inside an inline code span on the current line. The emitted token
// types / markup are identical, so the @vscode KaTeX renderers work unchanged.

function isWhitespace(c: string | undefined): boolean {
  return c !== undefined && /^\s$/u.test(c);
}

function isWordCharacterOrNumber(c: string | undefined): boolean {
  return c !== undefined && /^[\w\d]$/u.test(c);
}

function isValidInlineDelim(
  src: string,
  pos: number,
): { can_open: boolean; can_close: boolean } {
  const prevChar = src[pos - 1];
  const char = src[pos];
  const nextChar = src[pos + 1];
  if (char !== "$") return { can_open: false, can_close: false };
  let canOpen = false;
  let canClose = false;
  if (
    prevChar !== "$" &&
    prevChar !== "\\" &&
    (prevChar === undefined ||
      isWhitespace(prevChar) ||
      !isWordCharacterOrNumber(prevChar))
  ) {
    canOpen = true;
  }
  if (
    nextChar !== "$" &&
    (nextChar === undefined ||
      isWhitespace(nextChar) ||
      !isWordCharacterOrNumber(nextChar))
  ) {
    canClose = true;
  }
  return { can_open: canOpen, can_close: canClose };
}

function isValidBlockDelim(
  src: string,
  pos: number,
): { can_open: boolean; can_close: boolean } {
  const prevChar = src[pos - 1];
  const char = src[pos];
  const nextChar = src[pos + 1];
  const nextCharPlus1 = src[pos + 2];
  if (
    char === "$" &&
    prevChar !== "$" &&
    prevChar !== "\\" &&
    nextChar === "$" &&
    nextCharPlus1 !== "$"
  ) {
    return { can_open: true, can_close: true };
  }
  return { can_open: false, can_close: false };
}

/**
 * Find every backtick code span within `[posMin, posMax)` of `src` and return
 * them as half-open `[start, end)` ranges (end exclusive). Used to skip `$`
 * candidates that lie inside inline code when searching for a math closer.
 * Faithfully follows markdown-it's backtick matching: a span opens with a run
 * of `` ` `` and closes with a run of the same length; unmatched openings are
 * not spans.
 */
function findCodeSpanRanges(
  src: string,
  posMin: number,
  posMax: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = posMin;
  while (i < posMax) {
    if (src[i] !== "`") {
      i++;
      continue;
    }
    const openStart = i;
    while (i < posMax && src[i] === "`") i++;
    const openLen = i - openStart;
    let j = i;
    let closeStart = -1;
    while (j < posMax) {
      if (src[j] === "`") {
        let k = j;
        while (k < posMax && src[k] === "`") k++;
        if (k - j === openLen) {
          closeStart = j;
          break;
        }
        j = k;
      } else {
        j++;
      }
    }
    if (closeStart === -1) continue; // unmatched — not a span
    const closeEnd = closeStart + openLen;
    ranges.push([openStart, closeEnd]);
    i = closeEnd;
  }
  return ranges;
}

function inAnyRange(ranges: Array<[number, number]>, p: number): boolean {
  for (const [s, e] of ranges) {
    if (p >= s && p < e) return true;
  }
  return false;
}

/** Backtick-aware reimplementation of @vscode's `inlineMath` (`$…$`). */
function inlineMathDollar(state: InlineState, silent: boolean): boolean {
  const src = state.src;
  if (src[state.pos] !== "$") return false;

  // Mirror the @vscode guard: bail if we're inside an opening inline HTML tag
  // so `$` inside e.g. `<a href="x$y">` doesn't trigger math.
  const lastToken = state.tokens.at(-1);
  if (lastToken?.type === "html_inline") {
    if (/^<\w+.+[^/]>$/.test(lastToken.content)) return false;
  }

  let res = isValidInlineDelim(src, state.pos);
  if (!res.can_open) {
    if (!silent) state.pending += "$";
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  const posMax = state.posMax;
  const codeRanges = findCodeSpanRanges(src, state.pos, posMax);

  let match = start;
  let end = -1;
  while (match < posMax) {
    const idx = src.indexOf("$", match);
    if (idx === -1 || idx >= posMax) break;
    if (inAnyRange(codeRanges, idx)) {
      match = idx + 1;
      continue;
    }
    let p = idx - 1;
    while (src[p] === "\\") p -= 1;
    if ((idx - p) % 2 === 1) {
      end = idx;
      break;
    }
    match = idx + 1;
  }

  if (end === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }
  if (end - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return true;
  }
  res = isValidInlineDelim(src, end);
  if (!res.can_close) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = src.slice(start, end);
  }
  state.pos = end + 1;
  return true;
}

/** Backtick-aware reimplementation of @vscode's `inlineMathBlock` (`$$…$$`). */
function inlineMathBlockDollar(state: InlineState, silent: boolean): boolean {
  const src = state.src;
  if (src.slice(state.pos, state.pos + 2) !== "$$") return false;

  let res = isValidBlockDelim(src, state.pos);
  if (!res.can_open) {
    if (!silent) state.pending += "$$";
    state.pos += 2;
    return true;
  }

  const start = state.pos + 2;
  const posMax = state.posMax;
  const codeRanges = findCodeSpanRanges(src, state.pos, posMax);

  let match = start;
  let end = -1;
  while (match < posMax) {
    const idx = src.indexOf("$$", match);
    if (idx === -1 || idx >= posMax) break;
    if (inAnyRange(codeRanges, idx) || inAnyRange(codeRanges, idx + 1)) {
      match = idx + 1;
      continue;
    }
    let p = idx - 1;
    while (src[p] === "\\") p -= 1;
    if ((idx - p) % 2 === 1) {
      end = idx;
      break;
    }
    match = idx + 2;
  }

  if (end === -1) {
    if (!silent) state.pending += "$$";
    state.pos = start;
    return true;
  }
  if (end - start === 0) {
    if (!silent) state.pending += "$$$$";
    state.pos = start + 2;
    return true;
  }
  res = isValidBlockDelim(src, end);
  if (!res.can_close) {
    if (!silent) state.pending += "$$";
    state.pos = start;
    return true;
  }
  if (!silent) {
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.markup = "$$";
    token.content = src.slice(start, end);
  }
  state.pos = end + 2;
  return true;
}

/**
 * Replace the @vscode dollar inline rules with the backtick-aware versions.
 * Must be called AFTER the @vscode plugin is registered (so the `math_inline`
 * / `math_inline_block` rules exist to replace). Idempotent in the sense that
 * re-running just overwrites with the same functions.
 */
export function makeDollarRulesBacktickSafe(md: MarkdownIt): void {
  md.inline.ruler.at("math_inline", inlineMathDollar);
  md.inline.ruler.at("math_inline_block", inlineMathBlockDollar);
}

// --- Levels detectors ------------------------------------------------------

/**
 * True when a math token's content is a bare `\begin{...}...\end{...}` block.
 * The @vscode plugin emits these as `math_block` tokens with `markup: '$$'`
 * (same as `$$...$$`), so we use the content to tell them apart: bare blocks
 * always start with `\begin` after trimming leading whitespace.
 */
function isBareBlock(content: string): boolean {
  return content.trimStart().startsWith("\\begin");
}

registerFeatureDetectors(
  {
    id: "math-dollar",
    label: "Math `$…$` / `$$…$$`",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        if (t.type === "math_inline" && t.markup === "$" && t.map) {
          lines.push(t.map[0] + 1);
        } else if (
          t.type === "math_block" &&
          t.markup === "$$" &&
          t.map &&
          !isBareBlock(t.content)
        ) {
          lines.push(t.map[0] + 1);
        }
      }
      // Inline `math_inline` tokens live as children of `inline` tokens;
      // they carry no map themselves, so we also walk inline children to
      // attribute lines via the enclosing paragraph.
      for (const t of tokens) {
        if (t.type === "inline" && t.map && t.children) {
          const line = t.map[0] + 1;
          for (const c of t.children) {
            if (c.type === "math_inline" && c.markup === "$") {
              lines.push(line);
            }
          }
        }
      }
      return lines;
    },
  },
  {
    id: "math-latex",
    label: "Math: LaTeX delimiters & fences",
    presets: { advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        // `\[ ... \]` blocks (this plan) and bare `\begin{...}` blocks
        // (the @vscode plugin emits those as `math_block` with markup `$$`).
        if (t.type === "math_block" && t.map) {
          if (t.markup === "\\[" || isBareBlock(t.content)) {
            lines.push(t.map[0] + 1);
          }
        }
        // ```math fences.
        if (
          t.type === "fence" &&
          t.info.trim().toLowerCase() === "math" &&
          t.map
        ) {
          lines.push(t.map[0] + 1);
        }
      }
      // `\(` inline math (lives inside inline token children).
      for (const t of tokens) {
        if (t.type === "inline" && t.map && t.children) {
          const line = t.map[0] + 1;
          for (const c of t.children) {
            if (c.type === "math_inline" && c.markup === "\\(") {
              lines.push(line);
            }
          }
        }
      }
      return lines;
    },
  },
);
