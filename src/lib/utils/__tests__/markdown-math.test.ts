import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { renderMarkdown, analyzeContent } from "../markdown";

describe("math rendering — delimiter matrix", () => {
  it("renders inline $...$ math (Copilot / Gemini / GitHub)", async () => {
    const r = await renderMarkdown("The Pythagorean theorem: $a^2+b^2=c^2$.");
    expect(r.html).toContain("katex");
    expect(r.html).not.toContain("$a^2");
  });

  it("renders block $$...$$ math", async () => {
    const r = await renderMarkdown("$$\n\\frac{1}{2}\n$$");
    expect(r.html).toContain("katex-block");
    expect(r.html).toContain("katex-display");
  });

  it("renders inline \\(...\\) math (ChatGPT / Claude)", async () => {
    const r = await renderMarkdown("Euler: \\( e^{i\\pi}+1=0 \\).");
    expect(r.html).toContain("katex");
    expect(r.html).not.toContain("\\( e^{i\\pi}");
  });

  it("renders block \\[...\\] math", async () => {
    const r = await renderMarkdown("\\[\n\\int_0^1 x \\, dx\n\\]");
    expect(r.html).toContain("katex-block");
    expect(r.html).toContain("katex-display");
  });

  it("renders bare \\begin{align} blocks", async () => {
    const r = await renderMarkdown(
      "\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}",
    );
    expect(r.html).toContain("katex-block");
  });

  it("renders ```math fenced blocks", async () => {
    const r = await renderMarkdown(
      "```math\n\\sum_{n=1}^{\\infty} \\frac{1}{n^2}\n```",
    );
    expect(r.html).toContain("katex-block");
  });

  it("does NOT parse $5 and $10 as math (pandoc delimiter rules)", async () => {
    const r = await renderMarkdown("Prices: $5 and $10 are not math.");
    expect(r.html).toContain("$5");
    expect(r.html).toContain("$10");
    expect(r.html).not.toContain("katex");
  });

  it("renders invalid LaTeX without throwing (throwOnError: false)", async () => {
    // With throwOnError:false, KaTeX renders invalid commands as colored
    // inline text (errorColor #cc0000) rather than throwing or emitting a
    // .katex-error span. The key contract: renderMarkdown does NOT throw and
    // still returns katex-wrapped output.
    const r = await renderMarkdown("$$ \\undefinedcmd $$");
    expect(r.html).toContain("katex");
    expect(r.html).not.toContain("Error rendering markdown");
  });

  it("does NOT let a `$` inside inline code act as a math closer", async () => {
    // Regression: the @vscode inline `$` rule searched raw source for the
    // closer, so the `$` inside `$` ... `$` code spans got picked as the
    // closer for the bare `$5`/`$10`, swallowing the text in between as a
    // math_inline token (rendered as italic KaTeX variables). The fix skips
    // `$` candidates that lie inside a backtick code span.
    const r = await renderMarkdown(
      "A price like $5 and $10 is NOT math (pandoc rules: opening `$` not followed by space, closing `$` not followed by digit).",
    );
    // No math should be rendered for the prices paragraph.
    expect(r.html).not.toContain("katex");
    // The two `$` inside backticks must render as literal inline code.
    expect(r.html).toContain("<code>$</code>");
    // The bare $5 / $10 must survive as literal text (not be eaten).
    expect(r.html).toContain("$5");
    expect(r.html).toContain("$10");
  });

  it("does NOT let `$$` inside inline code act as a math-block closer", async () => {
    // Opening `$$` whose only candidate closer lies inside a code span must
    // NOT form a math block — the `$$` inside `$$` is skipped, and with no
    // other closer the opening `$$` becomes literal text.
    const r = await renderMarkdown("text $$math and code `$$` trailing");
    expect(r.html).not.toContain("katex-block");
    expect(r.html).toContain("<code>$$</code>");
  });
});

describe("math rendering — Claude-style mixed delimiters", () => {
  it("handles $$...$$ and \\(...\\) in the same document", async () => {
    const src = "Inline: \\( x^2 \\).\n\nBlock:\n$$ y^2 $$\n";
    const r = await renderMarkdown(src);
    const katexCount = (r.html.match(/katex/g) || []).length;
    expect(katexCount).toBeGreaterThanOrEqual(2);
  });
});

describe("math scroll-sync anchors", () => {
  it("tags $$...$$ block with data-line", async () => {
    const r = await renderMarkdown("Intro.\n\n$$\nx^2\n$$");
    expect(r.html).toMatch(/<[a-z]+[^>]*data-line="3"/);
  });

  it("tags \\[...\\] block with data-line", async () => {
    const r = await renderMarkdown("Intro.\n\n\\[\nx^2\n\\]");
    expect(r.html).toMatch(/<[a-z]+[^>]*data-line="3"/);
  });

  it("tags ```math fence with data-line", async () => {
    const r = await renderMarkdown("Intro.\n\n```math\nx^2\n```");
    expect(r.html).toMatch(/<[a-z]+[^>]*data-line="3"/);
  });

  it("does not double-tag non-math fences (data-line appears once)", async () => {
    const r = await renderMarkdown("```js\nconst x = 1;\n```");
    const count = (r.html.match(/data-line="/g) || []).length;
    expect(count).toBe(1);
  });

  it("keeps data-line monotonic across a mixed fixture", async () => {
    const src = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "$$",
      "a^2 + b^2 = c^2",
      "$$",
      "",
      "Block bracket:",
      "",
      "\\[",
      "\\int_0^1 x \\, dx",
      "\\]",
      "",
      "```math",
      "\\sum_{n=1}^{\\infty} \\frac{1}{n^2}",
      "```",
      "",
      "Footnote ref[^1].",
      "",
      "[^1]: the note",
      "",
      "Final paragraph.",
    ].join("\n");
    const r = await renderMarkdown(src);
    const dataLines = [...r.html.matchAll(/data-line="(\d+)"/g)].map((m) =>
      parseInt(m[1], 10),
    );
    expect(dataLines.length).toBeGreaterThan(0);
    for (let i = 1; i < dataLines.length; i++) {
      expect(dataLines[i]).toBeGreaterThanOrEqual(dataLines[i - 1]);
    }
  });

  it("does not break footnote anchors when math is present", async () => {
    const r = await renderMarkdown(
      "Para[^1].\n\n$$ x $$\n\n[^1]: note\n\nAfter.",
    );
    // The footnote definition (source line 5) must not appear as a data-line
    // in the middle of the rendered output.
    expect(r.html).not.toMatch(/data-line="5"[^"]*(?!.*footnotes)/);
  });

  it("raw-HTML block containing $ keeps its anchor and is not math-parsed", async () => {
    const r = await renderMarkdown('<div data-price="$5">Price</div>');
    expect(r.html).toContain('data-line="1"');
    expect(r.html).not.toContain("katex");
  });
});

describe("math memo cache", () => {
  it("returns identical output on re-render of the same formula", async () => {
    const src = "$a^2 + b^2 = c^2$";
    const r1 = await renderMarkdown(src);
    const r2 = await renderMarkdown(src);
    expect(r1.html).toBe(r2.html);
  });
});

describe("math levels detection", () => {
  it("flags $...$ / $$...$$ as math-dollar", async () => {
    const used = await analyzeContent("Inline $x^2$ and block:\n$$ y^2 $$");
    const t = used.find((u) => u.id === "math-dollar");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("flags \\(...\\) / \\[...\\] / bare as math-latex", async () => {
    const used = await analyzeContent(
      ["\\( x \\)", "", "\\[", "y", "\\]", ""].join("\n"),
    );
    const t = used.find((u) => u.id === "math-latex");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("flags ```math fence as math-dollar (not math-latex)", async () => {
    const used = await analyzeContent("```math\nz\n```");
    const dollar = used.find((u) => u.id === "math-dollar");
    const latex = used.find((u) => u.id === "math-latex");
    expect(dollar).toBeDefined();
    expect(dollar!.lines.length).toBeGreaterThan(0);
    expect(latex).toBeUndefined();
  });

  it("classifies bare \\begin blocks as math-latex, NOT math-dollar", async () => {
    const used = await analyzeContent("\\begin{align}\nx &= 1\n\\end{align}");
    const latex = used.find((u) => u.id === "math-latex");
    const dollar = used.find((u) => u.id === "math-dollar");
    expect(latex).toBeDefined();
    expect(dollar).toBeUndefined();
  });

  it("does not flag plain text as math", async () => {
    const used = await analyzeContent("# Title\n\nA plain paragraph.");
    expect(used.find((u) => u.id === "math-dollar")).toBeUndefined();
    expect(used.find((u) => u.id === "math-latex")).toBeUndefined();
  });
});

describe("mhchem chemical formulas — rendering", () => {
  it("renders \\ce{H2O} inside $...$", async () => {
    const r = await renderMarkdown("Water: $\\ce{H2O}$.");
    expect(r.html).toContain("katex");
    // KaTeX renders \ce{H2O} into upright roman H₂O via mathrm
    expect(r.html).toContain("mathrm");
  });

  it("renders \\ce in $$...$$ block", async () => {
    const r = await renderMarkdown("$$\n\\ce{2H2 + O2 -> 2H2O}\n$$");
    expect(r.html).toContain("katex-block");
    expect(r.html).toContain("katex-display");
  });

  it("renders \\ce inside \\(...\\) delimiters", async () => {
    const r = await renderMarkdown("\\(\\ce{CO2}\\)");
    expect(r.html).toContain("katex");
    expect(r.html).toContain("mathrm");
  });

  it("renders \\ce inside \\[...\\] block", async () => {
    const r = await renderMarkdown("\\[\n\\ce{H2SO4}\n\\]");
    expect(r.html).toContain("katex-block");
  });

  it("renders \\ce in ```math fenced block", async () => {
    const r = await renderMarkdown("```math\n\\ce{CO2 + C -> 2CO}\n```");
    expect(r.html).toContain("katex-block");
  });

  it("renders \\pu for physical units", async () => {
    const r = await renderMarkdown("$\\pu{123 kJ/mol}$");
    expect(r.html).toContain("katex");
    // \pu renders units in upright roman via mathrm
    expect(r.html).toContain("mathrm");
  });

  it("renders \\ce with isotopes", async () => {
    const r = await renderMarkdown("$\\ce{^{227}_{90}Th+}$");
    expect(r.html).toContain("katex");
  });

  it("renders \\ce with reaction arrows", async () => {
    const r = await renderMarkdown("$\\ce{A -> B}$");
    expect(r.html).toContain("katex");
  });

  it("renders invalid \\ce without throwing", async () => {
    const r = await renderMarkdown("$\\ce{}$");
    expect(r.html).toContain("katex");
    expect(r.html).not.toContain("Error rendering markdown");
  });
});

describe("mhchem chemical formulas — level detection", () => {
  it("flags \\ce{...} as chemical-formulas", async () => {
    const used = await analyzeContent("Water is $\\ce{H2O}$.");
    const t = used.find((u) => u.id === "chemical-formulas");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("flags \\pu{...} as chemical-formulas", async () => {
    const used = await analyzeContent("Energy: $\\pu{123 kJ/mol}$.");
    const t = used.find((u) => u.id === "chemical-formulas");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("flags \\ce in $$...$$ blocks", async () => {
    const used = await analyzeContent("$$\n\\ce{2H2 + O2 -> 2H2O}\n$$");
    const t = used.find((u) => u.id === "chemical-formulas");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("does NOT flag plain math as chemical-formulas", async () => {
    const used = await analyzeContent("$a^2 + b^2 = c^2$");
    expect(used.find((u) => u.id === "chemical-formulas")).toBeUndefined();
  });

  it("does NOT flag plain text as chemical-formulas", async () => {
    const used = await analyzeContent("H2O is water.");
    expect(used.find((u) => u.id === "chemical-formulas")).toBeUndefined();
  });
});
