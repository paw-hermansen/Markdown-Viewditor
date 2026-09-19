import type MarkdownIt from "markdown-it";

// Inline-rule state type, extracted via indexed access.
type InlineState = Parameters<
  Parameters<MarkdownIt["inline"]["ruler"]["at"]>[1]
>[0];

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
