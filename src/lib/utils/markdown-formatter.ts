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
      const blockLines = lines.slice(block.start, block.end);

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

      if (!joined) {
        for (let i = block.start; i < block.end; i++) {
          result.push(lines[i]);
        }
      } else {
        const wrapped = wrapText(joined, targetWidth, (text) =>
          measureText(commonPrefix + text),
        );

        for (const wl of wrapped) {
          result.push(commonPrefix + wl);
        }
      }
    }

    cursor = block.end;
  }

  for (let i = cursor; i < lineCount; i++) {
    result.push(lines[i]);
  }

  return result.join("\n");
}
