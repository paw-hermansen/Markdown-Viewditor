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
});
