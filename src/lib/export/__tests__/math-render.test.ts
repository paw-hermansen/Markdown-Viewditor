import { describe, it, expect } from "vitest";
import { renderMathToMathml } from "../math-render";

describe("renderMathToMathml", () => {
  it("produces MathML for inline math", () => {
    const result = renderMathToMathml("x^2");
    expect(result).toContain("<math");
    expect(result).toContain("</math>");
    expect(result).toContain("msup");
  });

  it("produces MathML for display math", () => {
    const result = renderMathToMathml("\\frac{a}{b}", true);
    expect(result).toContain("<math");
    expect(result).toContain("mfrac");
  });

  it("produces MathML for inline math (displayMode=false)", () => {
    const result = renderMathToMathml("E = mc^2", false);
    expect(result).toContain("<math");
    expect(result).toContain("mi"); // variable identifiers
  });

  it("handles invalid LaTeX gracefully (throwOnError=false)", () => {
    const result = renderMathToMathml("\\invalid{");
    // Should not throw; produces a .katex-error span or similar
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("renders Greek letters", () => {
    const result = renderMathToMathml("\\alpha + \\beta");
    expect(result).toContain("<math");
    expect(result).toContain("\u03b1"); // α
  });

  it("renders summation", () => {
    const result = renderMathToMathml("\\sum_{i=0}^{n} x_i", true);
    expect(result).toContain("<math");
    expect(result).toContain("munderover");
  });
});
