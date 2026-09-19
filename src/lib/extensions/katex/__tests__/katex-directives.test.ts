import { describe, it, expect } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { vi } from "vitest";
import { renderMarkdown, analyzeContent } from "$lib/utils/markdown";

describe("KaTeX directive rendering", () => {
  it("applies leqno directive to $$...$$ block math", async () => {
    const src = "<!-- math: leqno -->\n\n$$\nx^2\n$$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    // leqno adds the "leqno" CSS class to katex-display
    expect(r.html).toContain("leqno");
  });

  it("applies fontsize directive to inline math", async () => {
    const src = "<!-- math: fontsize=2.0 -->\n\n$x^2$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("--katex-font-scale: 2");
  });

  it("applies fontsize directive to block math", async () => {
    const src = "<!-- math: fontsize=1.5 -->\n\n$$\nx^2\n$$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("--katex-font-scale: 1.5");
  });

  it("does not apply fontsize wrapper when fontsize=1.0", async () => {
    const src = "<!-- math: fontsize=1.0 -->\n\n$x^2$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).not.toContain("--katex-font-scale");
  });

  it("applies directive to \\(...\\) inline math", async () => {
    const src = "<!-- math: fontsize=1.5 -->\n\n\\(x^2\\)";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("--katex-font-scale: 1.5");
  });

  it("applies directive to \\[...\\] block math", async () => {
    const src = "<!-- math: leqno -->\n\n\\[\nx^2\n\\]";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("leqno");
  });

  it("applies directive to ```math fenced block", async () => {
    const src = "<!-- math: fontsize=2.0 -->\n\n```math\nx^2\n```";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("--katex-font-scale: 2");
  });

  it("directive persists across multiple math blocks", async () => {
    const src = "<!-- math: leqno -->\n\n$$\na\n$$\n\n$$\nb\n$$";
    const r = await renderMarkdown(src);
    // Both blocks should have leqno class
    const leqnoCount = (r.html.match(/leqno/g) || []).length;
    expect(leqnoCount).toBeGreaterThanOrEqual(2);
  });

  it("directive can be changed mid-document", async () => {
    const src =
      "<!-- math: fontsize=2.0 -->\n\n$x$\n\n<!-- math: fontsize=1.0 -->\n\n$y$";
    const r = await renderMarkdown(src);
    // First math should have fontsize=2.0, second should not
    expect(r.html).toContain("--katex-font-scale: 2");
    const scaleMatches = r.html.match(/--katex-font-scale/g) || [];
    expect(scaleMatches.length).toBe(1); // only the first one
  });

  it("resets non-boolean directive with !key", async () => {
    const src =
      "<!-- math: fontsize=2.0 -->\n\n$x$\n\n<!-- math: !fontsize -->\n\n$y$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("--katex-font-scale: 2");
    const scaleMatches = r.html.match(/--katex-font-scale/g) || [];
    expect(scaleMatches.length).toBe(1);
  });

  it("resets boolean directive with !key", async () => {
    const src =
      "<!-- math: leqno -->\n\n$$\na\n$$\n\n<!-- math: !leqno -->\n\n$$\nb\n$$";
    const r = await renderMarkdown(src);
    // First should have leqno class, second should not
    const leqnoMatches = r.html.match(/\bleqno\b/g) || [];
    expect(leqnoMatches.length).toBe(1);
  });

  it("does not render HTML comments in output", async () => {
    const src = "<!-- math: leqno -->\n\n$x^2$";
    const r = await renderMarkdown(src);
    // The directive comment should not appear in rendered output
    expect(r.html).not.toContain("<!-- math:");
  });

  it("ignores unknown namespaces", async () => {
    const src = "<!-- unknown: foo=bar -->\n\n$x^2$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex"); // math still renders
  });

  it("ignores unknown keys for known namespaces", async () => {
    const src = "<!-- math: unknownkey=value -->\n\n$x^2$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex"); // math still renders
  });

  it("multiple directives on one line", async () => {
    const src = "<!-- math: leqno fontsize=2.0 -->\n\n$$\nx^2\n$$";
    const r = await renderMarkdown(src);
    expect(r.html).toContain("katex");
    expect(r.html).toContain("leqno");
    expect(r.html).toContain("--katex-font-scale: 2");
  });

  it("analyseContent still works with directives", async () => {
    const src = "<!-- math: leqno -->\n\n$x^2$";
    const used = await analyzeContent(src);
    const t = used.find((u) => u.id === "math-dollar");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBeGreaterThan(0);
  });

  it("applies fleqn directive to $$...$$ block math", async () => {
    const r = await renderMarkdown(
      "<!-- math: fleqn -->\n\n$$\n\\int_0^1 f(x) dx\n$$",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("fleqn");
  });

  it("applies leqno directive to \\begin{} bare block", async () => {
    const r = await renderMarkdown(
      "<!-- math: leqno -->\n\n\\begin{align}\nx &= 1\n\\end{align}",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("leqno");
  });

  it("applies fontsize directive to \\begin{} bare block", async () => {
    const r = await renderMarkdown(
      "<!-- math: fontsize=1.5 -->\n\n\\begin{align}\nx &= 1\n\\end{align}",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("--katex-font-scale: 1.5");
  });

  it("applies combined leqno + fontsize to $$...$$", async () => {
    const r = await renderMarkdown(
      "<!-- math: leqno fontsize=1.5 -->\n\n$$\nx^2 \\tag{1}\n$$",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("leqno");
    expect(r.html).toContain("--katex-font-scale: 1.5");
  });

  it("applies combined fleqn + fontsize to $$...$$", async () => {
    const r = await renderMarkdown(
      "<!-- math: fleqn fontsize=2.0 -->\n\n$$\n\\int_0^1 f(x) dx\n$$",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("fleqn");
    expect(r.html).toContain("--katex-font-scale: 2");
  });

  it("renders ```math {fleqn} with flush-left alignment", async () => {
    const r = await renderMarkdown("```math {fleqn}\n\\int_0^1 f(x) dx\n```");
    expect(r.html).toContain("katex");
    expect(r.html).toContain("fleqn");
  });

  it("renders ```math {leqno fontsize=2.0} with combined fence attrs", async () => {
    const r = await renderMarkdown(
      "```math {leqno fontsize=2.0}\nx^2 \\tag{1}\n```",
    );
    expect(r.html).toContain("katex");
    expect(r.html).toContain("leqno");
    expect(r.html).toContain("--katex-font-scale: 2");
  });
});
