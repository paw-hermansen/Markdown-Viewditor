import MarkdownIt from "markdown-it";

const BLOCKQUOTE_RE = /^(\s*>+\s?)/;

const parseMd = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

interface BlockRange {
  start: number;
  end: number;
  type: "paragraph" | "heading";
}

export type TextMeasurer = (text: string) => number;

function collectBlockRanges(
  tokens: ReturnType<MarkdownIt["parse"]>,
): BlockRange[] {
  const ranges: BlockRange[] = [];

  for (const token of tokens) {
    if (!token.map) continue;
    if (token.type === "paragraph_open") {
      ranges.push({
        start: token.map[0],
        end: token.map[1],
        type: "paragraph",
      });
    } else if (token.type === "heading_open") {
      ranges.push({ start: token.map[0], end: token.map[1], type: "heading" });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function wrapText(
  text: string,
  width: number,
  measureText: TextMeasurer,
): string[] {
  if (!text.trim()) return [""];

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (measureText(candidate) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }

  return lines;
}

/**
 * Re-wrap a single paragraph block (its lines, including any blockquote
 * prefix) to `targetWidth` measurement units. Returns the formatted lines.
 */
function formatParagraphLines(
  blockLines: string[],
  targetWidth: number,
  measureText: TextMeasurer,
): string[] {
  // Detect the shared prefix (blockquote markers like "> " or ">> ").
  const prefixes = blockLines.map((l) => BLOCKQUOTE_RE.exec(l)?.[1] ?? "");
  const hasPrefix = prefixes.some((p) => p.length > 0);
  const commonPrefix = hasPrefix
    ? (prefixes.find((p) => p.length > 0) ?? "")
    : "";

  // Strip the common prefix from every line, then join.
  const stripped = blockLines.map((l) =>
    commonPrefix ? l.replace(commonPrefix, "") : l,
  );
  const joined = stripped.join(" ").trim();

  if (!joined) return [...blockLines];

  const wrapped = wrapText(joined, targetWidth, (text) =>
    measureText(commonPrefix + text),
  );
  return wrapped.map((wl) => commonPrefix + wl);
}

/**
 * Format markdown prose by wrapping paragraphs to `targetWidth` measurement units.
 * Consecutive lines within a paragraph are joined before wrapping, so
 * both breaking and rejoining work correctly. Code blocks, fences,
 * tables, horizontal rules, and frontmatter are left untouched.
 */
export function formatMarkdown(
  content: string,
  targetWidth: number,
  measureText: TextMeasurer = (text) => text.length,
): string {
  if (targetWidth <= 0) return content;

  const lines = content.split("\n");
  const lineCount = lines.length;

  const tokens = parseMd.parse(content, {});
  const blocks = collectBlockRanges(tokens);

  const result: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    for (let i = cursor; i < block.start; i++) {
      result.push(lines[i]);
    }

    if (block.type === "heading") {
      for (let i = block.start; i < block.end; i++) {
        result.push(lines[i]);
      }
    } else {
      for (const l of formatParagraphLines(
        lines.slice(block.start, block.end),
        targetWidth,
        measureText,
      )) {
        result.push(l);
      }
    }

    cursor = block.end;
  }

  for (let i = cursor; i < lineCount; i++) {
    result.push(lines[i]);
  }

  return result.join("\n");
}

export interface ParagraphFormatResult {
  /** Char offset of the paragraph start in `content`. */
  from: number;
  /** Char offset just past the paragraph end (exclusive). */
  to: number;
  /** The formatted paragraph text (no trailing newline). */
  text: string;
}

/**
 * Find the prose paragraph block (markdown-it `paragraph_open`) whose line
 * range contains `line` (0-based). Returns `null` when the line is not in a
 * paragraph — blank lines, headings, code fences, tables, etc.
 */
export function findParagraphAtLine(
  content: string,
  line: number,
): { start: number; end: number } | null {
  const tokens = parseMd.parse(content, {});
  for (const block of collectBlockRanges(tokens)) {
    if (block.type === "paragraph" && line >= block.start && line < block.end) {
      return { start: block.start, end: block.end };
    }
  }
  return null;
}

/**
 * Format only the paragraph containing `line` (0-based) the same way
 * `formatMarkdown` formats paragraphs. Returns the replacement range and
 * text, or `null` when the line is not in a prose paragraph (or nothing
 * would change the caller's target width).
 */
export function formatParagraphAt(
  content: string,
  line: number,
  targetWidth: number,
  measureText: TextMeasurer = (text) => text.length,
): ParagraphFormatResult | null {
  if (targetWidth <= 0) return null;

  const range = findParagraphAtLine(content, line);
  if (!range) return null;

  const lines = content.split("\n");
  const formatted = formatParagraphLines(
    lines.slice(range.start, range.end),
    targetWidth,
    measureText,
  );

  let from = 0;
  for (let i = 0; i < range.start; i++) from += lines[i].length + 1;
  let to = from;
  for (let i = range.start; i < range.end; i++) to += lines[i].length + 1;
  to -= 1; // drop the trailing newline of the block's last line

  return { from, to, text: formatted.join("\n") };
}
