// @vitest-environment jsdom
/**
 * Label-math rasterization, with the layout measurement and the rasterizer
 * injected: jsdom has no layout and no canvas. What is under test is the
 * replacement contract — which formula boxes become images, at what size,
 * and that a failed measurement or capture never costs the formula.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rasterizeMermaidLabelMath } from "../math-labels";

const DATA_URI = "data:image/png;base64,AAAA";

function svgWithLabel(inner: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">' +
    '<foreignObject width="100" height="40">' +
    '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">' +
    inner +
    "</span></div></foreignObject></svg>"
  );
}

function katexDisplay(inner = "x2"): string {
  return (
    '<div style="display:flex"><span class="katex-display">' +
    '<span class="katex"><span class="katex-html">' +
    `<span class="base">${inner}</span>` +
    "</span></span></span></div>"
  );
}

const measure = () => ({ widthPx: 18.8, heightPx: 24 });
const rasterize = async () => ({
  dataUri: DATA_URI,
  widthPx: 18.8,
  heightPx: 24,
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("mermaid label math rasterization", () => {
  it("replaces a formula box with an image at the raster's size", async () => {
    const out = await rasterizeMermaidLabelMath(svgWithLabel(katexDisplay()), {
      measure,
      rasterize,
    });

    expect(out).toContain(`<img`);
    expect(out).toContain(`src="${DATA_URI}"`);
    expect(out).toContain("display:block;");
    expect(out).toContain("width:18.8px;");
    expect(out).toContain("height:24px;");
    expect(out).not.toContain('class="katex');
  });

  it("sizes the image from the raster, not the measurement", async () => {
    // A bitmap displayed at a different box than it was captured at shows up
    // stretched (oversized, overlapping glyphs) — the capture's geometry is
    // the single source of truth.
    const out = await rasterizeMermaidLabelMath(svgWithLabel(katexDisplay()), {
      measure: () => ({ widthPx: 30, heightPx: 40 }),
      rasterize,
    });

    expect(out).toContain("width:18.8px;");
    expect(out).toContain("height:24px;");
  });

  it("replaces only the outermost formula box", async () => {
    const rasterizeSpy = vi.fn(rasterize);
    const out = await rasterizeMermaidLabelMath(svgWithLabel(katexDisplay()), {
      measure,
      rasterize: rasterizeSpy,
    });

    expect(rasterizeSpy).toHaveBeenCalledTimes(1);
    expect(out.match(/<img/g)).toHaveLength(1);
  });

  it("replaces bare MathML formulas too", async () => {
    const out = await rasterizeMermaidLabelMath(
      svgWithLabel(
        '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>',
      ),
      { measure, rasterize },
    );

    expect(out).toContain(`<img`);
    expect(out).not.toContain("<math");
  });

  it("stays on the line as an inline-block for inline formulas", async () => {
    const out = await rasterizeMermaidLabelMath(
      svgWithLabel(
        'before <span class="katex"><span class="base">x</span></span> after',
      ),
      { measure, rasterize },
    );

    expect(out).toContain("display:inline-block;");
    expect(out).toContain("before ");
    expect(out).toContain(" after");
  });

  it("carries the formula's text as alt text, without the hidden MathML copy", async () => {
    const out = await rasterizeMermaidLabelMath(
      svgWithLabel(
        '<span class="katex-display"><span class="katex">' +
          '<span class="katex-mathml"><math><mi>E</mi></math></span>' +
          '<span class="katex-html"><span class="base">E = m</span></span>' +
          "</span></span>",
      ),
      { measure, rasterize },
    );

    expect(out).toContain('alt="E = m"');
    expect(out).not.toContain('alt="E = mE = m"');
  });

  it("keeps the live formula when rasterization fails", async () => {
    const svg = svgWithLabel(katexDisplay());
    const out = await rasterizeMermaidLabelMath(svg, {
      measure,
      rasterize: async () => null,
    });
    expect(out).toBe(svg);

    const throwing = await rasterizeMermaidLabelMath(svg, {
      measure,
      rasterize: async () => {
        throw new Error("capture failed");
      },
    });
    expect(throwing).toBe(svg);
  });

  it("keeps the live formula when the box cannot be measured", async () => {
    const svg = svgWithLabel(katexDisplay());
    const out = await rasterizeMermaidLabelMath(svg, {
      measure: () => null,
      rasterize,
    });
    expect(out).toBe(svg);
  });

  it("keeps the live formula when the whole pass throws", async () => {
    const svg = svgWithLabel(katexDisplay());
    const out = await rasterizeMermaidLabelMath(svg, {
      measure: () => {
        throw new Error("no layout");
      },
      rasterize,
    });
    expect(out).toBe(svg);
  });

  it("awaits font loading before measuring and capturing", async () => {
    const order: string[] = [];
    await rasterizeMermaidLabelMath(svgWithLabel(katexDisplay()), {
      loadFonts: async () => {
        order.push("fonts");
      },
      measure: () => {
        order.push("measure");
        return { widthPx: 18.8, heightPx: 24 };
      },
      rasterize: async () => {
        order.push("rasterize");
        return { dataUri: DATA_URI, widthPx: 18.8, heightPx: 24 };
      },
    });

    expect(order).toEqual(["fonts", "measure", "rasterize"]);
  });

  it("leaves labels without math untouched and never rasterizes", async () => {
    const svg = svgWithLabel("<p>some label</p>");
    const rasterizeSpy = vi.fn(rasterize);
    const out = await rasterizeMermaidLabelMath(svg, {
      measure,
      rasterize: rasterizeSpy,
    });

    expect(out).toBe(svg);
    expect(rasterizeSpy).not.toHaveBeenCalled();
  });

  it("returns non-label SVGs unchanged without touching the DOM", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>$$x$$</text></svg>';
    const out = await rasterizeMermaidLabelMath(svg, { measure, rasterize });
    expect(out).toBe(svg);
  });

  it("is idempotent: an already-rasterized diagram costs nothing", async () => {
    const once = await rasterizeMermaidLabelMath(svgWithLabel(katexDisplay()), {
      measure,
      rasterize,
    });
    const rasterizeSpy = vi.fn(rasterize);
    const twice = await rasterizeMermaidLabelMath(once, {
      measure,
      rasterize: rasterizeSpy,
    });

    expect(twice).toBe(once);
    expect(rasterizeSpy).not.toHaveBeenCalled();
  });
});
