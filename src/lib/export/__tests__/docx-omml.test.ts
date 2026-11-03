/**
 * MathML → OMML converter (EXPORT-PLAN 8.7). Handcrafted MathML fixtures pin
 * the construct mapping; a few real KaTeX cases pin the actual input shape.
 * `null` = the caller degrades to TeX source + warning.
 */
import { describe, it, expect } from "vitest";
import { mathmlToOmml, parseMathml } from "../docx/omml";
import { renderMathToMathml } from "../math-render";

function omml(inner: string): string | null {
  return mathmlToOmml(
    `<math xmlns="http://www.w3.org/1998/Math/MathML">${inner}</math>`,
  );
}

describe("parseMathml", () => {
  it("parses elements, attributes, text, and entities", () => {
    const root = parseMathml(
      '<math display="block"><mrow><mi>a</mi><mo>&lt;</mo>text</mrow></math>',
    );
    expect(root).not.toBeNull();
    expect(root!.name).toBe("math");
    expect(root!.attrs.display).toBe("block");
    const mrow = root!.children[0] as ReturnType<typeof parseMathml>;
    expect((mrow as { name: string }).name).toBe("mrow");
  });

  it("strips namespace prefixes from element names", () => {
    const root = parseMathml('<m:math xmlns:m="x"><m:mi>y</m:mi></m:math>');
    expect(root!.name).toBe("math");
    expect((root!.children[0] as { name: string }).name).toBe("mi");
  });
});

describe("mathmlToOmml run mapping", () => {
  it("italicizes single-letter mi, upright multi-char mi and mn", () => {
    const out = omml("<mi>x</mi><mn>2</mn><mi>sin</mi>")!;
    expect(out).toContain('<m:sty m:val="i"/>');
    expect(out).toContain('<m:t xml:space="preserve">x</m:t>');
    expect(out).toContain('<m:t xml:space="preserve">2</m:t>');
    // "sin" is upright — only one m:sty="i" (for x).
    expect(out.split('m:sty m:val="i"').length - 1).toBe(1);
    expect(out).toContain('m:sty m:val="p"');
  });

  it("honors mathvariant", () => {
    const out = omml('<mi mathvariant="bold-italic">v</mi>')!;
    expect(out).toContain('<m:sty m:val="bi"/>');
    const ds = omml('<mi mathvariant="double-struck">R</mi>')!;
    expect(ds).toContain('<m:scr m:val="double-struck"/>');
  });

  it("escapes text content", () => {
    const out = omml("<mtext>a &lt; b &amp; c</mtext>")!;
    expect(out).toContain('<m:t xml:space="preserve">a &lt; b &amp; c</m:t>');
  });
});

describe("mathmlToOmml structure mapping", () => {
  it("msup/msub/msubsup → m:sSup/m:sSub/m:sSubSup", () => {
    expect(omml("<msup><mi>x</mi><mn>2</mn></msup>")).toContain(
      "<m:sSup><m:e>",
    );
    expect(omml("<msub><mi>x</mi><mn>2</mn></msub>")).toContain("<m:sSub>");
    const both = omml("<msubsup><mi>x</mi><mn>2</mn><mn>3</mn></msubsup>")!;
    expect(both).toContain("<m:sSubSup>");
    expect(both.indexOf("<m:sub>")).toBeLessThan(both.indexOf("<m:sup>"));
  });

  it("mfrac → m:f with num/den", () => {
    const out = omml("<mfrac><mi>a</mi><mi>b</mi></mfrac>")!;
    expect(out).toContain("<m:f>");
    expect(out).toContain("<m:num>");
    expect(out).toContain("<m:den>");
  });

  it("msqrt hides its degree; mroot carries one", () => {
    const sqrt = omml("<msqrt><mi>x</mi></msqrt>")!;
    expect(sqrt).toContain('<m:degHide m:val="1"/>');
    expect(sqrt).toContain("<m:deg/>");
    const root = omml("<mroot><mi>x</mi><mn>3</mn></mroot>")!;
    expect(root).toContain("<m:deg>");
    expect(root).not.toContain("degHide");
  });

  it("fenced mrow → m:d with begChr/endChr", () => {
    const out = omml(
      '<mrow><mo fence="true" stretchy="true">(</mo><mi>x</mi><mo fence="true" stretchy="true">)</mo></mrow>',
    )!;
    expect(out).toContain("<m:d>");
    expect(out).toContain('<m:begChr m:val="("/>');
    expect(out).toContain('<m:endChr m:val=")"/>');
  });

  it("leaves unbalanced fences as plain sequence", () => {
    const out = omml('<mrow><mo fence="true">(</mo><mi>x</mi></mrow>')!;
    expect(out).not.toContain("<m:d>");
    expect(out).toContain(">x<");
  });

  it("munder/mover/munderover → limit placement", () => {
    const under = omml("<munder><mi>x</mi><mi>i</mi></munder>")!;
    expect(under).toContain("<m:limLow>");
    const over = omml("<mover><mi>x</mi><mi>i</mi></mover>")!;
    expect(over).toContain("<m:limUpp>");
    const both = omml(
      "<munderover><mo>∑</mo><mi>i</mi><mi>n</mi></munderover>",
    )!;
    expect(both).toContain("<m:limUpp>");
    expect(both).toContain("<m:limLow>");
  });

  it("accent over → m:acc with the accent char", () => {
    const out = omml(
      '<mover accent="true"><mi>x</mi><mo stretchy="true">→</mo></mover>',
    )!;
    expect(out).toContain("<m:acc>");
    expect(out).toContain('<m:chr m:val="→"/>');
  });

  it("mtable → m:m rows; single column → m:eqArr", () => {
    const matrix = omml(
      "<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr>" +
        "<mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable>",
    )!;
    expect(matrix).toContain("<m:m>");
    expect(matrix.split("<m:mr>").length - 1).toBe(2);
    const cases = omml(
      "<mtable><mtr><mtd><mi>a</mi></mtd></mtr><mtr><mtd><mi>b</mi></mtd></mtr></mtable>",
    )!;
    expect(cases).toContain("<m:eqArr>");
    expect(cases).not.toContain("<m:m>");
  });

  it("menclose strike → struck runs; other notations pass through", () => {
    const out = omml(
      '<menclose notation="horizontalstrike"><mi>x</mi></menclose>',
    )!;
    expect(out).toContain("<w:strike/>");
    const boxed = omml('<menclose notation="box"><mi>x</mi></menclose>')!;
    expect(boxed).not.toContain("<w:strike/>");
  });

  it("mstyle is transparent (fontsize wrapper from renderMathToMathml)", () => {
    const out = omml('<mstyle mathsize="2em"><mi>x</mi></mstyle>')!;
    expect(out).toContain("<m:r>");
    expect(out).not.toContain("mstyle");
  });

  it("unknown constructs return null (caller degrades to TeX)", () => {
    expect(omml("<mweird>x</mweird>")).toBeNull();
    expect(mathmlToOmml("not xml at all")).toBeNull();
    expect(mathmlToOmml("")).toBeNull();
  });
});

describe("mathmlToOmml against real KaTeX output", () => {
  it("converts fractions, roots, and scripts", () => {
    for (const tex of ["\\frac{1}{2}", "x^2", "\\sqrt{x + 1}", "a_{i}^{n}"]) {
      const mathml = renderMathToMathml(tex, true);
      const out = mathmlToOmml(mathml);
      expect(out, `no OMML for ${tex}`).not.toBeNull();
      expect(out).not.toContain("mweird");
    }
    expect(mathmlToOmml(renderMathToMathml("\\frac{1}{2}", true))).toContain(
      "<m:f>",
    );
  });

  it("converts delimiters and mhchem", () => {
    for (const tex of ["\\left( x \\right)", "\\ce{H2O}", "\\sum_{i}^{n}"]) {
      const out = mathmlToOmml(renderMathToMathml(tex, true));
      expect(out, `no OMML for ${tex}`).not.toBeNull();
    }
    expect(
      mathmlToOmml(renderMathToMathml("\\left( x \\right)", true)),
    ).toContain("<m:d>");
  });
});
