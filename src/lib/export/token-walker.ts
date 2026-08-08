import type Token from "markdown-it/lib/token.mjs";

/**
 * Callbacks for the token walker. Each callback is optional — unhandled
 * token types are silently skipped. For paired tokens (open/close),
 * `*Start` is called on the opening token and `*End` on the closing token.
 */
export interface TokenWalkerCallbacks {
  // Block-level tokens
  headingStart?: (level: number, token: Token) => void;
  headingEnd?: (level: number, token: Token) => void;
  paragraphStart?: (token: Token) => void;
  paragraphEnd?: (token: Token) => void;
  blockquoteStart?: (token: Token) => void;
  blockquoteEnd?: (token: Token) => void;
  bulletListStart?: (token: Token) => void;
  bulletListEnd?: (token: Token) => void;
  orderedListStart?: (start: number, token: Token) => void;
  orderedListEnd?: (token: Token) => void;
  listItemStart?: (token: Token) => void;
  listItemEnd?: (token: Token) => void;
  tableStart?: (token: Token) => void;
  tableEnd?: (token: Token) => void;
  theadStart?: (token: Token) => void;
  theadEnd?: (token: Token) => void;
  tbodyStart?: (token: Token) => void;
  tbodyEnd?: (token: Token) => void;
  trStart?: (token: Token) => void;
  trEnd?: (token: Token) => void;
  thStart?: (token: Token) => void;
  thEnd?: (token: Token) => void;
  tdStart?: (token: Token) => void;
  tdEnd?: (token: Token) => void;
  hr?: (token: Token) => void;
  codeBlock?: (content: string, token: Token) => void;
  fence?: (content: string, language: string, token: Token) => void;
  htmlBlock?: (content: string, token: Token) => void;
  htmlInline?: (content: string, token: Token) => void;
  mathBlock?: (tex: string, token: Token) => void;

  // Inline tokens (inside inline.children)
  text?: (content: string, token: Token) => void;
  codeInline?: (content: string, token: Token) => void;
  softbreak?: (token: Token) => void;
  hardbreak?: (token: Token) => void;
  emStart?: (token: Token) => void;
  emEnd?: (token: Token) => void;
  strongStart?: (token: Token) => void;
  strongEnd?: (token: Token) => void;
  sStart?: (token: Token) => void;
  sEnd?: (token: Token) => void;
  linkStart?: (href: string, title: string | null, token: Token) => void;
  linkEnd?: (token: Token) => void;
  image?: (
    src: string,
    alt: string,
    title: string | null,
    token: Token,
  ) => void;
  mathInline?: (tex: string, token: Token) => void;

  // Footnote tokens
  footnoteRef?: (id: string, label: string, token: Token) => void;
  footnoteStart?: (id: string, token: Token) => void;
  footnoteEnd?: (id: string, token: Token) => void;
  footnoteBlockStart?: (token: Token) => void;
  footnoteBlockEnd?: (token: Token) => void;
}

/**
 * Extract heading level from a heading_open tag ("h1" → 1, "h2" → 2, etc.).
 */
function headingLevel(tag: string): number {
  const m = /^h(\d)$/.exec(tag);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Walk a single inline token's children, invoking the appropriate callbacks.
 */
function walkInlineChildren(
  children: Token[],
  callbacks: TokenWalkerCallbacks,
): void {
  for (const child of children) {
    switch (child.type) {
      case "text":
        callbacks.text?.(child.content, child);
        break;
      case "code_inline":
        callbacks.codeInline?.(child.content, child);
        break;
      case "softbreak":
        callbacks.softbreak?.(child);
        break;
      case "hardbreak":
        callbacks.hardbreak?.(child);
        break;
      case "em_open":
        callbacks.emStart?.(child);
        break;
      case "em_close":
        callbacks.emEnd?.(child);
        break;
      case "strong_open":
        callbacks.strongStart?.(child);
        break;
      case "strong_close":
        callbacks.strongEnd?.(child);
        break;
      case "s_open":
        callbacks.sStart?.(child);
        break;
      case "s_close":
        callbacks.sEnd?.(child);
        break;
      case "link_open":
        callbacks.linkStart?.(
          child.attrGet("href") ?? "",
          child.attrGet("title"),
          child,
        );
        break;
      case "link_close":
        callbacks.linkEnd?.(child);
        break;
      case "image":
        callbacks.image?.(
          child.attrGet("src") ?? "",
          child.content,
          child.attrGet("title"),
          child,
        );
        break;
      case "math_inline":
        callbacks.mathInline?.(child.content, child);
        break;
      case "footnote_ref":
        callbacks.footnoteRef?.(
          child.meta?.id ?? "",
          child.meta?.label ?? "",
          child,
        );
        break;
      case "html_inline":
        callbacks.htmlInline?.(child.content, child);
        break;
    }
  }
}

/**
 * Recursively walk a markdown-it token stream, invoking callbacks for each
 * token type. For `inline` tokens, the walker descends into `token.children`.
 * For paired tokens (open/close), the appropriate start/end callback is called.
 * Unhandled token types are silently skipped.
 */
export function walkTokens(
  tokens: Token[],
  callbacks: TokenWalkerCallbacks,
): void {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    switch (token.type) {
      case "heading_open": {
        const level = headingLevel(token.tag);
        callbacks.headingStart?.(level, token);
        // Walk inline content between open and close
        const next = tokens[i + 1];
        if (next?.type === "inline" && next.children) {
          walkInlineChildren(next.children, callbacks);
        }
        // Find the closing token
        const closeIdx = findClosing(tokens, i, "heading_close");
        if (closeIdx >= 0) {
          callbacks.headingEnd?.(level, tokens[closeIdx]);
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }
      case "paragraph_open":
        callbacks.paragraphStart?.(token);
        // Walk inline content
        {
          const next = tokens[i + 1];
          if (next?.type === "inline" && next.children) {
            walkInlineChildren(next.children, callbacks);
          }
        }
        {
          const closeIdx = findClosing(tokens, i, "paragraph_close");
          if (closeIdx >= 0) {
            callbacks.paragraphEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "blockquote_open":
        callbacks.blockquoteStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "blockquote_close");
          if (closeIdx >= 0) {
            // Walk inner tokens
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.blockquoteEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "bullet_list_open":
        callbacks.bulletListStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "bullet_list_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.bulletListEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "ordered_list_open": {
        const start = parseInt(token.attrGet("start") ?? "1", 10) || 1;
        callbacks.orderedListStart?.(start, token);
        const closeIdx = findClosing(tokens, i, "ordered_list_close");
        if (closeIdx >= 0) {
          walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
          callbacks.orderedListEnd?.(tokens[closeIdx]);
          i = closeIdx + 1;
        } else {
          i++;
        }
        break;
      }
      case "list_item_open":
        callbacks.listItemStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "list_item_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.listItemEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "table_open":
        callbacks.tableStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "table_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.tableEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "thead_open":
        callbacks.theadStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "thead_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.theadEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "tbody_open":
        callbacks.tbodyStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "tbody_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.tbodyEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "tr_open":
        callbacks.trStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "tr_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.trEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "th_open":
        callbacks.thStart?.(token);
        {
          const next = tokens[i + 1];
          if (next?.type === "inline" && next.children) {
            walkInlineChildren(next.children, callbacks);
          }
          const closeIdx = findClosing(tokens, i, "th_close");
          if (closeIdx >= 0) {
            callbacks.thEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "td_open":
        callbacks.tdStart?.(token);
        {
          const next = tokens[i + 1];
          if (next?.type === "inline" && next.children) {
            walkInlineChildren(next.children, callbacks);
          }
          const closeIdx = findClosing(tokens, i, "td_close");
          if (closeIdx >= 0) {
            callbacks.tdEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "hr":
        callbacks.hr?.(token);
        i++;
        break;
      case "code_block":
        callbacks.codeBlock?.(token.content, token);
        i++;
        break;
      case "fence":
        callbacks.fence?.(token.content, token.info.trim(), token);
        i++;
        break;
      case "html_block":
        callbacks.htmlBlock?.(token.content, token);
        i++;
        break;
      case "html_inline":
        callbacks.htmlInline?.(token.content, token);
        i++;
        break;
      case "math_block":
        callbacks.mathBlock?.(token.content, token);
        i++;
        break;
      case "math_inline":
        callbacks.mathInline?.(token.content, token);
        i++;
        break;
      case "inline":
        if (token.children) {
          walkInlineChildren(token.children, callbacks);
        }
        i++;
        break;
      case "footnote_ref":
        callbacks.footnoteRef?.(
          token.meta?.id ?? "",
          token.meta?.label ?? "",
          token,
        );
        i++;
        break;
      case "footnote_open":
        callbacks.footnoteStart?.(token.meta?.id ?? "", token);
        {
          const closeIdx = findClosing(tokens, i, "footnote_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.footnoteEnd?.(token.meta?.id ?? "", tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      case "footnote_block_open":
        callbacks.footnoteBlockStart?.(token);
        {
          const closeIdx = findClosing(tokens, i, "footnote_block_close");
          if (closeIdx >= 0) {
            walkTokens(tokens.slice(i + 1, closeIdx), callbacks);
            callbacks.footnoteBlockEnd?.(tokens[closeIdx]);
            i = closeIdx + 1;
          } else {
            i++;
          }
        }
        break;
      default:
        // Unhandled token type — skip
        i++;
    }
  }
}

/**
 * Find the index of the matching closing token for a paired open token.
 * Scans forward from `startIdx + 1`, tracking nesting depth.
 * Returns -1 if not found.
 */
function findClosing(
  tokens: Token[],
  startIdx: number,
  closeType: string,
): number {
  const openType = tokens[startIdx].type;
  let depth = 1;
  for (let j = startIdx + 1; j < tokens.length; j++) {
    if (tokens[j].type === openType) depth++;
    if (tokens[j].type === closeType) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}
