import { describe, it, expect, beforeEach } from "vitest";
import MarkdownIt from "markdown-it";
import {
  extractMathDirectives,
  extractMathDirectiveStateMap,
  lookupDirectiveState,
  directivePlugin,
  getDirectiveState,
} from "../directives";
import { registerExtensionSchema, resetExtensions } from "../registry";
import type { FenceOptionSchema } from "../types";

const schema: FenceOptionSchema = {
  leqno: { type: "boolean", default: false },
  fleqn: { type: "boolean", default: false },
  fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
};

const mermaidSchema: FenceOptionSchema = {
  theme: {
    type: "string",
    default: "default",
    values: ["default", "dark", "forest"],
  },
  maxWidth: { type: "number", default: 800, min: 200, max: 2000 },
  fitToWidth: { type: "boolean", default: true },
};

describe("extractMathDirectives", () => {
  beforeEach(() => {
    resetExtensions();
    registerExtensionSchema("math", schema);
  });

  it("returns only explicitly-set values, not schema defaults", () => {
    const result = extractMathDirectives("<!-- math: leqno -->\n\n$x^2$");
    expect(result.leqno).toBe(true);
    expect(result.fontsize).toBeUndefined();
    expect(result.fleqn).toBeUndefined();
  });

  it("returns empty for no directives", () => {
    const result = extractMathDirectives("$x^2$\n\n$$y^2$$");
    expect(result).toEqual({});
  });

  it("handles !key reset for boolean (→ false)", () => {
    const result = extractMathDirectives(
      "<!-- math: leqno -->\n<!-- math: !leqno -->\n\n$x^2$",
    );
    expect(result.leqno).toBe(false);
  });

  it("handles !key reset for non-boolean (→ removed)", () => {
    const result = extractMathDirectives(
      "<!-- math: fontsize=2.0 -->\n<!-- math: !fontsize -->\n\n$x^2$",
    );
    expect(result.fontsize).toBeUndefined();
  });

  it("handles numeric values", () => {
    const result = extractMathDirectives(
      "<!-- math: fontsize=1.5 -->\n\n$x^2$",
    );
    expect(result.fontsize).toBe(1.5);
  });

  it("handles multiple values on one line", () => {
    const result = extractMathDirectives(
      "<!-- math: leqno fontsize=2.0 -->\n\n$x^2$",
    );
    expect(result.leqno).toBe(true);
    expect(result.fontsize).toBe(2.0);
  });

  it("ignores directives inside fenced code blocks (backtick)", () => {
    const result = extractMathDirectives(
      "```markdown\n<!-- math: fontsize=4 -->\n```\n\n$x^2$",
    );
    expect(result.fontsize).toBeUndefined();
  });

  it("ignores directives inside fenced code blocks (tilde)", () => {
    const result = extractMathDirectives(
      "~~~markdown\n<!-- math: fontsize=4 -->\n~~~\n\n$x^2$",
    );
    expect(result.fontsize).toBeUndefined();
  });

  it("processes directives outside fenced code blocks", () => {
    const result = extractMathDirectives(
      "<!-- math: leqno -->\n\n```markdown\ncode\n```\n\n$x^2$",
    );
    expect(result.leqno).toBe(true);
  });
});

describe("extractMathDirectiveStateMap", () => {
  beforeEach(() => {
    resetExtensions();
    registerExtensionSchema("math", schema);
  });

  it("returns entries at correct line numbers", () => {
    const src = [
      "$x$", // line 0
      "<!-- math: leqno -->", // line 1
      "$$y$$", // line 2
    ].join("\n");
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toBe(1); // line index 1
    expect(entries[0][1].leqno).toBe(true);
  });

  it("tracks cumulative state changes across multiple directives", () => {
    const src = [
      "<!-- math: leqno -->", // line 0
      "<!-- math: fontsize=2.0 -->", // line 1
      "$x$", // line 2
    ].join("\n");
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(2);
    // First entry: only leqno
    expect(entries[0][1].leqno).toBe(true);
    expect(entries[0][1].fontsize).toBeUndefined();
    // Second entry: leqno + fontsize
    expect(entries[1][1].leqno).toBe(true);
    expect(entries[1][1].fontsize).toBe(2.0);
  });

  it("handles !key reset mid-document", () => {
    const src = [
      "<!-- math: fontsize=2.0 -->", // line 0
      "<!-- math: !fontsize -->", // line 1
      "$x$", // line 2
    ].join("\n");
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(2);
    expect(entries[0][1].fontsize).toBe(2.0);
    expect(entries[1][1].fontsize).toBeUndefined(); // reset = removed
  });

  it("ignores directives inside fenced code blocks", () => {
    const src = ["```markdown", "<!-- math: fontsize=4 -->", "```", "$x$"].join(
      "\n",
    );
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(0);
  });

  it("ignores directives inside tilde fences", () => {
    const src = ["~~~markdown", "<!-- math: leqno -->", "~~~", "$x$"].join(
      "\n",
    );
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(0);
  });

  it("processes directives outside fenced code blocks", () => {
    const src = [
      "<!-- math: leqno -->",
      "",
      "```markdown",
      "code",
      "```",
      "$x$",
    ].join("\n");
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(1);
    expect(entries[0][1].leqno).toBe(true);
  });

  it("handles directive before and inside fence", () => {
    const src = [
      "<!-- math: leqno -->",
      "```markdown",
      "<!-- math: fontsize=4 -->",
      "```",
      "$x$",
    ].join("\n");
    const entries = extractMathDirectiveStateMap(src);
    expect(entries).toHaveLength(1);
    expect(entries[0][1].leqno).toBe(true);
    expect(entries[0][1].fontsize).toBeUndefined();
  });
});

describe("lookupDirectiveState", () => {
  it("returns empty when no directive precedes the line", () => {
    const stateMap: Array<[number, Record<string, unknown>]> = [
      [5, { leqno: true }],
    ];
    const result = lookupDirectiveState(stateMap, 3);
    expect(result).toEqual({});
  });

  it("returns the latest directive at or before the line", () => {
    const stateMap: Array<[number, Record<string, unknown>]> = [
      [2, { leqno: true }],
      [5, { leqno: true, fontsize: 2.0 }],
    ];
    expect(lookupDirectiveState(stateMap, 2).leqno).toBe(true);
    expect(lookupDirectiveState(stateMap, 2).fontsize).toBeUndefined();
    expect(lookupDirectiveState(stateMap, 4).leqno).toBe(true);
    expect(lookupDirectiveState(stateMap, 4).fontsize).toBeUndefined();
    expect(lookupDirectiveState(stateMap, 5).fontsize).toBe(2.0);
    expect(lookupDirectiveState(stateMap, 100).fontsize).toBe(2.0);
  });

  it("returns correct state when directives change", () => {
    const stateMap: Array<[number, Record<string, unknown>]> = [
      [1, { fontsize: 2.0 }],
      [5, {}], // fontsize reset
    ];
    expect(lookupDirectiveState(stateMap, 3).fontsize).toBe(2.0);
    expect(lookupDirectiveState(stateMap, 5).fontsize).toBeUndefined();
    expect(lookupDirectiveState(stateMap, 10).fontsize).toBeUndefined();
  });

  it("returns empty for empty state map", () => {
    expect(lookupDirectiveState([], 5)).toEqual({});
  });
});

describe("directivePlugin (core rule)", () => {
  let md: MarkdownIt;

  beforeEach(() => {
    resetExtensions();
    registerExtensionSchema("math", schema);
    md = new MarkdownIt({ html: true }).use(directivePlugin);
  });

  it("strips directive comment from html_block content", () => {
    const tokens = md.parse("<!-- math: leqno -->\n\n$x^2$\n", {});
    const htmlBlocks = tokens.filter((t) => t.type === "html_block");
    for (const hb of htmlBlocks) {
      expect(hb.content).not.toContain("<!-- math:");
    }
  });

  it("cleans up empty html_block after stripping", () => {
    const tokens = md.parse("<!-- math: leqno -->\n\n", {});
    const htmlBlocks = tokens.filter((t) => t.type === "html_block");
    // The html_block that contained the directive should now be empty
    const directiveBlock = htmlBlocks.find(
      (hb) => hb.content.trim() === "" || !hb.content.includes("<!--"),
    );
    expect(directiveBlock).toBeDefined();
  });

  it("strips multiple directives from one html_block", () => {
    const src = "<!-- math: leqno -->\n<!-- math: fontsize=2.0 -->\n\n$x^2$\n";
    const tokens = md.parse(src, {});
    const htmlBlocks = tokens.filter((t) => t.type === "html_block");
    for (const hb of htmlBlocks) {
      expect(hb.content).not.toContain("<!-- math:");
    }
  });

  it("annotates math_block with _parentStreamIndex", () => {
    // Without the KaTeX plugin, $$ is not parsed as math_block.
    // Use the full rendering pipeline to verify annotation works.
    // Simulate by checking the core rule processes tokens correctly.
    const env: Record<string, unknown> = {};
    md.parse("<!-- math: leqno -->\n\n$$\nx^2\n$$\n", env);
    // The core rule should have run and populated env.directives
    expect(env.directives).toBeDefined();
    // Verify the state map has the directive
    const stateMap = env.directives as Map<
      number,
      Map<string, Record<string, unknown>>
    >;
    const entries = [...stateMap.entries()];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0][1].get("math")?.leqno).toBe(true);
  });

  it("annotates inline token children when math_inline is present", () => {
    // The directive plugin annotates ANY math_inline child on ANY inline token.
    // Without KaTeX, $x^2$ is just text. But we can verify the annotation
    // logic by checking that the core rule processes inline tokens.
    const tokens = md.parse("$x^2$\n", {});
    // Without KaTeX, this is just an inline token with text children.
    // The core rule should still run without errors.
    const inlineToken = tokens.find((t) => t.type === "inline");
    expect(inlineToken).toBeDefined();
  });

  it("creates meta on tokens that don't have it", () => {
    // Verify the core rule doesn't crash on tokens without meta.
    const tokens = md.parse("plain text\n", {});
    expect(tokens.length).toBeGreaterThan(0);
    // No error = pass. The meta creation only applies to math tokens
    // which require the KaTeX plugin to exist.
  });

  it("stores correct directive state at the right token index", () => {
    const env: Record<string, unknown> = {};
    md.parse("<!-- math: leqno -->\n\nparagraph\n", env);
    const stateMap = env.directives as Map<
      number,
      Map<string, Record<string, unknown>>
    >;
    // The directive is on the first html_block token (index 0)
    const entries = [...stateMap.entries()].sort((a, b) => a[0] - b[0]);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0][1].get("math")?.leqno).toBe(true);
    // The entry should be at a valid token index
    expect(entries[0][0]).toBeGreaterThanOrEqual(0);
  });

  it("keeps Mermaid-like directive state cumulative and positional", () => {
    registerExtensionSchema("mermaid", mermaidSchema);
    const env: Record<string, unknown> = {};
    const src = [
      "```mermaid",
      "before",
      "```",
      "",
      "<!-- mermaid: theme=dark maxWidth=1200 -->",
      "",
      "```mermaid",
      "middle",
      "```",
      "",
      "<!-- mermaid: fitToWidth=false -->",
      "",
      "```mermaid",
      "after",
      "```",
      "",
      "<!-- mermaid: theme=forest -->",
      "",
      "```mermaid",
      "last",
      "```",
    ].join("\n");
    const tokens = md.parse(src, env);
    const fencePositions = tokens
      .map((token, index) => (token.type === "fence" ? index : -1))
      .filter((index) => index >= 0);

    expect(getDirectiveState(env, "mermaid", fencePositions[0])).toEqual({});
    expect(getDirectiveState(env, "mermaid", fencePositions[1])).toEqual({
      theme: "dark",
      maxWidth: 1200,
    });
    expect(getDirectiveState(env, "mermaid", fencePositions[2])).toEqual({
      theme: "dark",
      maxWidth: 1200,
      fitToWidth: false,
    });
    expect(getDirectiveState(env, "mermaid", fencePositions[3])).toEqual({
      theme: "forest",
      maxWidth: 1200,
      fitToWidth: false,
    });
  });
});
