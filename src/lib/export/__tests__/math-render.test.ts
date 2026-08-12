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

  it("opens and closes with <math>/</math> for valid LaTeX", () => {
    const result = renderMathToMathml("x + y");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
  });

  it("does NOT wrap output in katex <span>", () => {
    const result = renderMathToMathml("x^2");
    expect(result).not.toContain("<span");
    expect(result).not.toContain("class=\"katex\"");
  });

  it("renders \\ce{H2O} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\ce{H2O}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders \\pu{123 kJ/mol} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\pu{123 kJ/mol}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders \\ce{2H2 + O2 -> 2H2O} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\ce{2H2 + O2 -> 2H2O}", true);
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).toContain("mrow");
  });

  it("renders \\ce with isotopes", () => {
    const result = renderMathToMathml("\\ce{^{227}_{90}Th+}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders Zeise salt formula \\ce{[Pt(\\eta^2-C2H4)Cl3]-}", () => {
    const result = renderMathToMathml("\\ce{[Pt(\\eta^2-C2H4)Cl3]-}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
    expect(result).toContain('mathvariant="normal"');
  });

  it("renders \\ce with nested \\underset as valid MathML", () => {
    const tex =
      "\\ce{Zn^2+ <=>[+ 2OH-][+ 2H+] $\\underset{\\text{amphoteres Hydroxid}}{\\ce{Zn(OH)2 v}}$ <=>[+ 2OH-][+ 2H+] $\\underset{\\text{Hydroxozikat}}{\\ce{[Zn(OH)4]^2-}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("sanitizes structural MathML violations", () => {
    const tex =
      "\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result).not.toMatch(/<\/munder>\s*<\/mi>/);
    expect(result).toContain("<munder>");
    expect(result).toContain("<mtext>label</mtext>");
  });

  it("replaces zero-width phantom bases with empty rows", () => {
    const result = renderMathToMathml("\\ce{H2O}", false);
    expect(result).not.toMatch(
      /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b/,
    );
    expect(result).not.toContain("<mphantom>");
    expect(result).toContain("<mrow/>");
  });

  it("replaces zero-width phantoms in complex \\ce formula", () => {
    const tex =
      "\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result).not.toMatch(
      /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b/,
    );
    expect(result).not.toContain("<mphantom>");
    expect(result).toContain("<mrow/>");
    expect(result).not.toContain("katex-error");
  });

  it("appends <mrow/> after trailing + charge sign", () => {
    const result = renderMathToMathml("\\ce{Zn^2+}", true);
    expect(result).not.toContain("katex-error");
    // The + at end of <mrow> must have <mrow/> appended for LibreOffice
    expect(result).toMatch(/<mo[^>]*>\+<\/mo><mrow\/><\/mrow>/);
  });

  it("appends <mrow/> after trailing − charge sign", () => {
    const result = renderMathToMathml("\\ce{CrO4^2-}", true);
    expect(result).not.toContain("katex-error");
    // The − at end of <mrow> must have <mrow/> appended for LibreOffice
    expect(result).toMatch(
      /<mo[^>]*>[−-]<\/mo><mrow\/><\/mrow>/,
    );
  });

  it("appends <mrow/> after trailing − in msup (Zeise salt)", () => {
    const result = renderMathToMathml("\\ce{[Pt(\\eta^2-C2H4)Cl3]-}", false);
    expect(result).not.toContain("katex-error");
    // The − charge is wrapped: <msup><mrow/><mrow><mo>−</mo><mrow/></mrow></msup>
    expect(result).toMatch(
      /<mo[^>]*>[−-]<\/mo><mrow\/><\/mrow><\/msup>/,
    );
  });

  it("does NOT add <mrow/> for + in reaction equations", () => {
    const result = renderMathToMathml("\\ce{2H2 + O2 -> 2H2O}", true);
    expect(result).not.toContain("katex-error");
    // The + between terms should NOT have <mrow/> appended (it has a right operand)
    expect(result).not.toMatch(
      /<mo[^>]*>\+<\/mo><mrow\/><mrow>/,
    );
  });
});
