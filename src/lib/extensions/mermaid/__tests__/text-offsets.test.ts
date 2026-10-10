// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { normalizeSvgTextOffsets } from "../text-offsets";

/** Render an SVG fragment and return the normalized markup. */
function normalize(inner: string): string {
  return normalizeSvgTextOffsets(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
  );
}

function attr(svg: string, id: string, name: string): string | null {
  const host = document.createElement("div");
  host.innerHTML = svg;
  return host.querySelector(`#${id}`)?.getAttribute(name) ?? null;
}

describe("normalizeSvgTextOffsets", () => {
  it("rewrites em-based dy to absolute user units", () => {
    const out = normalize(
      `<text id="a" y="10" dy="1em" style="font-size: 16px">Hello</text>`,
    );
    expect(attr(out, "a", "dy")).toBe("16.000");
  });

  it("uses the element's own font size for the conversion", () => {
    const out = normalize(
      `<text id="a" dy="1em" style="font-size: 12.5px">x</text>`,
    );
    expect(attr(out, "a", "dy")).toBe("12.500");
  });

  it("handles fractional and negative em values", () => {
    const out = normalize(
      `<text id="a" dy="-0.5em" style="font-size: 20px">x</text>` +
        `<text id="b" dx="0.25em" style="font-size: 20px">x</text>`,
    );
    expect(attr(out, "a", "dy")).toBe("-10.000");
    expect(attr(out, "b", "dx")).toBe("5.000");
  });

  it("rewrites tspan offsets too", () => {
    const out = normalize(
      `<text style="font-size: 16px"><tspan id="a" dy="1em">x</tspan></text>`,
    );
    expect(attr(out, "a", "dy")).toBe("16.000");
  });

  it("leaves absolute offsets untouched", () => {
    const out = normalize(
      `<text id="a" y="10" dy="16" style="font-size: 16px">Hello</text>` +
        `<text id="b" dy="2px" style="font-size: 16px">Hello</text>`,
    );
    expect(attr(out, "a", "dy")).toBe("16");
    expect(attr(out, "b", "dy")).toBe("2px");
  });

  it("is idempotent", () => {
    const once = normalize(
      `<text id="a" dy="1em" style="font-size: 16px">Hello</text>`,
    );
    expect(normalizeSvgTextOffsets(once)).toBe(once);
  });

  it("returns the input string unchanged when there is nothing to rewrite", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text id="a" dy="16">x</text></svg>`;
    expect(normalizeSvgTextOffsets(svg)).toBe(svg);
  });

  it("preserves unrelated markup while rewriting", () => {
    const out = normalize(
      `<g transform="translate(1,2)"><text id="a" text-anchor="middle" ` +
        `class="messageText" dy="1em" style="font-size: 16px">Hello Bob</text></g>` +
        `<line x1="0" y1="5" x2="10" y2="5" class="messageLine0"/>`,
    );
    expect(out).toContain('transform="translate(1,2)"');
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('class="messageText"');
    expect(out).toContain('class="messageLine0"');
    expect(attr(out, "a", "dy")).toBe("16.000");
  });

  it("resolves inherited font sizes", () => {
    const out = normalizeSvgTextOffsets(
      `<svg xmlns="http://www.w3.org/2000/svg" style="font-size: 30px">` +
        `<text id="a" dy="1em">x</text></svg>`,
    );
    expect(attr(out, "a", "dy")).toBe("30.000");
  });

  it("folds translate placement into x/y attributes", () => {
    const out = normalize(
      `<text id="a" x="0" y="0" transform="translate(350, 21.67) rotate(0)">100</text>`,
    );
    expect(attr(out, "a", "x")).toBe("350");
    expect(attr(out, "a", "y")).toBe("21.67");
    expect(attr(out, "a", "transform")).toBeNull();
  });

  it("folds plain translate and absent x/y too", () => {
    const out = normalize(
      `<text id="a" transform="translate(10, 20)">Q1</text>`,
    );
    expect(attr(out, "a", "x")).toBe("10");
    expect(attr(out, "a", "y")).toBe("20");
    expect(attr(out, "a", "transform")).toBeNull();
  });

  it("keeps non-zero rotation, re-anchored on the translate point", () => {
    const out = normalize(
      `<text id="a" x="0" y="0" transform="translate(100, 50) rotate(-45)">x</text>`,
    );
    expect(attr(out, "a", "x")).toBe("100");
    expect(attr(out, "a", "y")).toBe("50");
    expect(attr(out, "a", "transform")).toBe("rotate(-45, 100, 50)");
  });

  it("does not fold when the element already positions via x/y", () => {
    const out = normalize(
      `<text id="a" x="5" y="5" transform="translate(100, 50) rotate(0)">x</text>`,
    );
    expect(attr(out, "a", "x")).toBe("5");
    expect(attr(out, "a", "transform")).toBe("translate(100, 50) rotate(0)");
  });

  it("folding is idempotent", () => {
    const once = normalize(
      `<text id="a" x="0" y="0" transform="translate(350, 21.67) rotate(0)">100</text>`,
    );
    expect(normalizeSvgTextOffsets(once)).toBe(once);
  });
});
