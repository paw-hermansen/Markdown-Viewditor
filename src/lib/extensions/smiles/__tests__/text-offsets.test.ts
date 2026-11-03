// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { normalizeSmilesTextPlacement } from "../text-offsets";

/** Parse an SVG fragment into a live SVGSVGElement. */
function parseSvg(inner: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`,
    "image/svg+xml",
  );
  return doc.documentElement as unknown as SVGSVGElement;
}

function attr(svg: SVGSVGElement, sel: string, name: string): string | null {
  return svg.querySelector(sel)?.getAttribute(name) ?? null;
}

/**
 * The two label shapes smiles-drawer emits (SvgWrapper.drawText):
 * horizontal labels use text y="0.36em" with flowing tspans; stacked
 * (up/down) labels use per-line tspan x="0px" y="±Nem". Both are placed by
 * a wrapper `<g style="transform: translateX(..px) translateY(..px)">`.
 */
const HORIZONTAL_LABEL = `
  <g style="transform: translateX(200px) translateY(100px)">
    <text class="element" dominant-baseline="alphabetic" y="0.36em"
          font-family="Arial" font-size="11pt">
      <tspan fill="#222222">C</tspan><tspan fill="#e74c3c">O</tspan>
    </text>
  </g>`;

const STACKED_LABEL = `
  <g style="transform: translateX(50.5px) translateY(-3px)">
    <text class="element" dominant-baseline="central" font-size="11pt">
      <tspan x="0px" y="0em">C</tspan>
      <tspan x="0px" y="0.9em">O</tspan>
    </text>
  </g>`;

describe("normalizeSmilesTextPlacement", () => {
  it("folds the label group translate into the text anchor", () => {
    const svg = parseSvg(HORIZONTAL_LABEL);
    normalizeSmilesTextPlacement(svg);
    // x: 200 (translate) + 0 (implicit anchor). y: 100 + 0.36em at 11pt
    // (11 * 96/72 = 14.667 user units -> 0.36em = 5.28).
    expect(attr(svg, "text", "x")).toBe("200.000");
    expect(parseFloat(attr(svg, "text", "y")!)).toBeCloseTo(105.28, 2);
    expect(svg.querySelector("g")!.getAttribute("style")).toBeNull();
  });

  it("keeps flowing tspans flowing (no coordinates are invented)", () => {
    const svg = parseSvg(HORIZONTAL_LABEL);
    normalizeSmilesTextPlacement(svg);
    for (const tspan of svg.querySelectorAll("tspan")) {
      expect(tspan.hasAttribute("x")).toBe(false);
      expect(tspan.hasAttribute("y")).toBe(false);
    }
  });

  it("folds stacked-label tspan coordinates and resolves their em offsets", () => {
    const svg = parseSvg(STACKED_LABEL);
    normalizeSmilesTextPlacement(svg);
    const [first, second] = [...svg.querySelectorAll("tspan")];
    // tspan x/y are absolute in the group's space, so both shift by the
    // translate (50.5, -3); the 0.9em line gap resolves at 11pt (13.2).
    expect(parseFloat(first.getAttribute("x")!)).toBeCloseTo(50.5, 3);
    expect(parseFloat(first.getAttribute("y")!)).toBeCloseTo(-3, 3);
    expect(parseFloat(second.getAttribute("x")!)).toBeCloseTo(50.5, 3);
    expect(parseFloat(second.getAttribute("y")!)).toBeCloseTo(10.2, 2);
    // The text anchor carries the translate too.
    expect(parseFloat(attr(svg, "text", "x")!)).toBeCloseTo(50.5, 3);
    expect(parseFloat(attr(svg, "text", "y")!)).toBeCloseTo(-3, 3);
  });

  it("resolves tspan em against the enclosing text's font size", () => {
    const svg = parseSvg(
      `<g style="transform: translateX(0px) translateY(0px)">` +
        `<text font-size="3pt"><tspan y="1em">x</tspan></text></g>`,
    );
    normalizeSmilesTextPlacement(svg);
    // 3pt = 4 user units.
    expect(parseFloat(attr(svg, "tspan", "y")!)).toBeCloseTo(4, 3);
  });

  it("converts em offsets outside translate groups too", () => {
    const svg = parseSvg(
      `<text id="a" y="1em" font-size="16px">x</text>` +
        `<text id="b" dy="-0.5em" font-size="20px"><tspan dx="0.25em">y</tspan></text>`,
    );
    normalizeSmilesTextPlacement(svg);
    expect(attr(svg, "#a", "y")).toBe("16.000");
    expect(attr(svg, "#b", "dy")).toBe("-10.000");
    expect(attr(svg, "tspan", "dx")).toBe("5.000");
  });

  it("preserves text-anchor and other attributes", () => {
    const svg = parseSvg(
      `<g style="transform: translateX(10px) translateY(20px)">` +
        `<text text-anchor="end" dominant-baseline="alphabetic" y="0em" ` +
        `class="element" fill="#fff">x</text></g>`,
    );
    normalizeSmilesTextPlacement(svg);
    expect(attr(svg, "text", "text-anchor")).toBe("end");
    expect(attr(svg, "text", "dominant-baseline")).toBe("alphabetic");
    expect(attr(svg, "text", "class")).toBe("element");
    expect(attr(svg, "text", "fill")).toBe("#fff");
    expect(parseFloat(attr(svg, "text", "y")!)).toBeCloseTo(20, 3);
  });

  it("leaves transformed geometry groups alone", () => {
    const svg = parseSvg(
      `<g id="geo" style="transform: translateX(10px) translateY(20px)">` +
        `<rect x="1" y="2" width="3" height="4"/></g>`,
    );
    normalizeSmilesTextPlacement(svg);
    expect(attr(svg, "#geo", "style")).toContain("translateX(10px)");
  });

  it("is idempotent", () => {
    const svg = parseSvg(HORIZONTAL_LABEL + STACKED_LABEL);
    normalizeSmilesTextPlacement(svg);
    const once = new XMLSerializer().serializeToString(svg);
    normalizeSmilesTextPlacement(svg);
    expect(new XMLSerializer().serializeToString(svg)).toBe(once);
  });

  it("leaves nothing zoom-fragile behind", () => {
    const svg = parseSvg(HORIZONTAL_LABEL + STACKED_LABEL);
    normalizeSmilesTextPlacement(svg);
    const out = new XMLSerializer().serializeToString(svg);
    expect(out).not.toMatch(/transform:\s*translate/);
    expect(out).not.toMatch(/(?:^|[\s"])(?:x|y|dx|dy)="[^"]*em"/);
  });
});
