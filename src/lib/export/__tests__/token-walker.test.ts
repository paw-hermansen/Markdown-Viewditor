import { describe, it, expect, vi } from "vitest";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { walkTokens, type TokenWalkerCallbacks } from "../token-walker";

function parseMd(src: string) {
  const md = new MarkdownIt().use(footnote);
  return md.parse(src, {});
}

function collectCallbacks(): TokenWalkerCallbacks & {
  calls: [string, ...unknown[]][];
} {
  const calls: [string, ...unknown[]][] = [];
  const cb: TokenWalkerCallbacks = {};
  // Dynamically create callbacks for all known types
  const names = [
    "headingStart",
    "headingEnd",
    "paragraphStart",
    "paragraphEnd",
    "blockquoteStart",
    "blockquoteEnd",
    "bulletListStart",
    "bulletListEnd",
    "orderedListStart",
    "orderedListEnd",
    "listItemStart",
    "listItemEnd",
    "tableStart",
    "tableEnd",
    "theadStart",
    "theadEnd",
    "tbodyStart",
    "tbodyEnd",
    "trStart",
    "trEnd",
    "thStart",
    "thEnd",
    "tdStart",
    "tdEnd",
    "hr",
    "codeBlock",
    "fence",
    "htmlBlock",
    "htmlInline",
    "mathBlock",
    "text",
    "codeInline",
    "softbreak",
    "hardbreak",
    "emStart",
    "emEnd",
    "strongStart",
    "strongEnd",
    "sStart",
    "sEnd",
    "linkStart",
    "linkEnd",
    "image",
    "mathInline",
    "footnoteRef",
    "footnoteStart",
    "footnoteEnd",
    "footnoteBlockStart",
    "footnoteBlockEnd",
  ];
  for (const name of names) {
    (cb as Record<string, unknown>)[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  }
  return { ...cb, calls };
}

describe("walkTokens", () => {
  it("invokes headingStart/End with correct level", () => {
    const tokens = parseMd("# Hello\n## World");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const starts = cb.calls.filter((c) => c[0] === "headingStart");
    expect(starts.length).toBe(2);
    expect(starts[0][1]).toBe(1);
    expect(starts[1][1]).toBe(2);
    const ends = cb.calls.filter((c) => c[0] === "headingEnd");
    expect(ends.length).toBe(2);
  });

  it("invokes paragraphStart/End", () => {
    const tokens = parseMd("Hello world");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "paragraphStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "paragraphEnd")).toBe(true);
  });

  it("walks inline children: text, em, strong", () => {
    const tokens = parseMd("normal *italic* **bold**");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "text")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "emStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "emEnd")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "strongStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "strongEnd")).toBe(true);
  });

  it("walks code_inline", () => {
    const tokens = parseMd("use `foo`");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const codeCalls = cb.calls.filter((c) => c[0] === "codeInline");
    expect(codeCalls.length).toBe(1);
    expect(codeCalls[0][1]).toBe("foo");
  });

  it("walks bullet list with list items", () => {
    const tokens = parseMd("- a\n- b\n- c");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "bulletListStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "bulletListEnd")).toBe(true);
    const itemStarts = cb.calls.filter((c) => c[0] === "listItemStart");
    expect(itemStarts.length).toBe(3);
  });

  it("walks ordered list with start attribute", () => {
    const tokens = parseMd("3. a\n4. b");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const starts = cb.calls.filter((c) => c[0] === "orderedListStart");
    expect(starts.length).toBe(1);
    expect(starts[0][1]).toBe(3);
  });

  it("walks code_block", () => {
    const tokens = parseMd("    hello");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const codeCalls = cb.calls.filter((c) => c[0] === "codeBlock");
    expect(codeCalls.length).toBe(1);
    expect((codeCalls[0][1] as string).trim()).toBe("hello");
  });

  it("walks fence with language", () => {
    const tokens = parseMd("```js\nconsole.log('hi')\n```");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const fenceCalls = cb.calls.filter((c) => c[0] === "fence");
    expect(fenceCalls.length).toBe(1);
    expect(fenceCalls[0][2]).toBe("js");
  });

  it("walks links", () => {
    const tokens = parseMd("[click](https://example.com 'title')");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const linkStarts = cb.calls.filter((c) => c[0] === "linkStart");
    expect(linkStarts.length).toBe(1);
    expect(linkStarts[0][1]).toBe("https://example.com");
    expect(linkStarts[0][2]).toBe("title");
    expect(cb.calls.some((c) => c[0] === "linkEnd")).toBe(true);
  });

  it("walks images", () => {
    const tokens = parseMd("![alt text](img.png 'title')");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const imgCalls = cb.calls.filter((c) => c[0] === "image");
    expect(imgCalls.length).toBe(1);
    expect(imgCalls[0][1]).toBe("img.png");
    expect(imgCalls[0][2]).toBe("alt text");
    expect(imgCalls[0][3]).toBe("title");
  });

  it("walks blockquote", () => {
    const tokens = parseMd("> quoted");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "blockquoteStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "blockquoteEnd")).toBe(true);
  });

  it("walks hr", () => {
    const tokens = parseMd("---");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "hr")).toBe(true);
  });

  it("walks softbreak and hardbreak", () => {
    const tokens = parseMd("line1\nline2  \nline3");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "softbreak")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "hardbreak")).toBe(true);
  });

  it("walks strikethrough", () => {
    const tokens = parseMd("~~deleted~~");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "sStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "sEnd")).toBe(true);
  });

  it("walks footnotes", () => {
    const tokens = parseMd("text[^1]\n\n[^1]: footnote content");
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "footnoteRef")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "footnoteBlockStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "footnoteBlockEnd")).toBe(true);
  });

  it("walks nested lists", () => {
    const md = "- a\n  - b\n    - c";
    const tokens = parseMd(md);
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    const itemStarts = cb.calls.filter((c) => c[0] === "listItemStart");
    expect(itemStarts.length).toBe(3);
  });

  it("walks table structure", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const tokens = parseMd(md);
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "tableStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "theadStart")).toBe(true);
    expect(cb.calls.some((c) => c[0] === "tbodyStart")).toBe(true);
    const trStarts = cb.calls.filter((c) => c[0] === "trStart");
    expect(trStarts.length).toBe(2);
    const thStarts = cb.calls.filter((c) => c[0] === "thStart");
    expect(thStarts.length).toBe(2);
    const tdStarts = cb.calls.filter((c) => c[0] === "tdStart");
    expect(tdStarts.length).toBe(2);
  });

  it("handles empty token array", () => {
    const cb = collectCallbacks();
    walkTokens([], cb);
    expect(cb.calls.length).toBe(0);
  });

  it("skips unknown token types without error", () => {
    const tokens = parseMd("hello");
    const cb = collectCallbacks();
    // Should not throw even with minimal callbacks
    walkTokens(tokens, {});
    // Also verify with the full callback set
    walkTokens(tokens, cb);
    expect(cb.calls.some((c) => c[0] === "text")).toBe(true);
  });

  it("handles inline tokens with no children gracefully", () => {
    const tokens = parseMd("hello");
    // Manually create an inline token with null children
    const md = new MarkdownIt();
    const parsed = md.parse("hello", {});
    for (const t of parsed) {
      if (t.type === "inline") t.children = null;
    }
    const cb = collectCallbacks();
    walkTokens(parsed, cb);
    // Should not throw
  });

  it("walks a complex document end-to-end", () => {
    const md = `# Title

A paragraph with **bold** and *italic*.

- item 1
- item 2

\`\`\`ts
const x = 1;
\`\`\`

> A blockquote

---

[link](https://example.com)
`;
    const tokens = parseMd(md);
    const cb = collectCallbacks();
    walkTokens(tokens, cb);
    // Should have collected many different token types
    const uniqueTypes = new Set(cb.calls.map((c) => c[0]));
    expect(uniqueTypes.size).toBeGreaterThan(10);
  });
});
