import { registerFeatureDetectors } from "$lib/utils/markdown-levels";

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
    label: "Math $…$, $$…$$, ```math…```",
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
        // ```math fenced blocks.
        if (
          t.type === "fence" &&
          t.info.trim().split(/\s+/)[0].toLowerCase() === "math" &&
          t.map
        ) {
          lines.push(t.map[0] + 1);
        }
      }
      // Inline `math_inline` tokens live as children of `inline` tokens;
      // they carry no map themselves, so we also walk inline children to
      // attribute lines via the enclosing paragraph.
      for (const t of tokens) {
        if (t.type === "inline" && t.map && t.children) {
          let line = t.map[0] + 1;
          for (const c of t.children) {
            if (c.type === "softbreak" || c.type === "hardbreak") {
              line++;
            } else if (c.type === "math_inline" && c.markup === "$") {
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
    label: "Math: LaTeX delimiters",
    presets: { advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        // `\[ ... \]` blocks and bare `\begin{...}` blocks
        // (the @vscode plugin emits those as `math_block` with markup `$$`).
        if (t.type === "math_block" && t.map) {
          if (t.markup === "\\[" || isBareBlock(t.content)) {
            lines.push(t.map[0] + 1);
          }
        }
      }
      // `\(` inline math (lives inside inline token children).
      for (const t of tokens) {
        if (t.type === "inline" && t.map && t.children) {
          let line = t.map[0] + 1;
          for (const c of t.children) {
            if (c.type === "softbreak" || c.type === "hardbreak") {
              line++;
            } else if (c.type === "math_inline" && c.markup === "\\(") {
              lines.push(line);
            }
          }
        }
      }
      return lines;
    },
  },
  {
    id: "chemical-formulas",
    label: "Chemical formulas `\\ce{…}`",
    presets: { advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      const isChem = (content: string) =>
        content.includes("\\ce{") ||
        content.includes("\\pu{") ||
        content.includes("\\tripledash");
      for (const t of tokens) {
        if (
          (t.type === "math_inline" || t.type === "math_block") &&
          t.map &&
          isChem(t.content)
        ) {
          lines.push(t.map[0] + 1);
        }
      }
      for (const t of tokens) {
        if (t.type === "inline" && t.map && t.children) {
          let line = t.map[0] + 1;
          for (const c of t.children) {
            if (c.type === "softbreak" || c.type === "hardbreak") {
              line++;
            } else if (c.type === "math_inline" && isChem(c.content)) {
              lines.push(line);
            }
          }
        }
      }
      return lines;
    },
  },
);
