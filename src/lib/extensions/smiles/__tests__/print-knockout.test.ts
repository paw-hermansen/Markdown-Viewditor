// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { prepareSmilesForPrint } from "../print-knockout";
import {
  ensureSmilesLoaded,
  renderSmilesFence,
  resolveSmilesOptions,
} from "../renderer";

/** The knockout shape smiles-drawer emits (SvgWrapper.constructSvg): a
 * white base rect + one black circle per label, hung on the bond group. */
function smilesBlock(): HTMLDivElement {
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="smiles-block" data-align="center">
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <defs><radialGradient id="g1"/></defs>
        <mask id="u1-text-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
          <rect x="0" y="0" width="200" height="200" fill="white"/>
          <circle cx="50" cy="50" r="8.25" fill="black"/>
          <circle cx="150" cy="150" r="12" fill="black"/>
        </mask>
        <g/>
        <g mask="url(#u1-text-mask)">
          <line x1="0" y1="0" x2="200" y2="200" stroke="url(#g1)"/>
        </g>
        <g><text class="element" x="50" y="50">O</text></g>
      </svg>
    </div>`;
  return div;
}

describe("prepareSmilesForPrint", () => {
  it("replaces the mask knockout with painted discs in the page color", () => {
    const root = smilesBlock();
    prepareSmilesForPrint(root, "#ffffff");

    const svg = root.querySelector("svg")!;
    expect(svg.querySelector("mask")).toBeNull();
    const masked = svg.querySelector("g[mask]");
    expect(masked).toBeNull();

    const discs = [...svg.querySelectorAll("circle")];
    expect(discs.length).toBe(2);
    for (const disc of discs) {
      expect(disc.getAttribute("fill")).toBe("#ffffff");
    }
  });

  it("stacks the discs between the bond group and the labels", () => {
    const root = smilesBlock();
    prepareSmilesForPrint(root, "#ffffff");

    const svg = root.querySelector("svg")!;
    const children = [...svg.children];
    const bondIdx = children.findIndex(
      (el) => el.tagName === "g" && el.querySelector("line"),
    );
    const discIdx = children.findIndex((el) => el.tagName === "circle");
    const labelIdx = children.findIndex((el) => el.querySelector("text"));
    expect(bondIdx).toBeGreaterThanOrEqual(0);
    expect(discIdx).toBeGreaterThan(bondIdx);
    expect(labelIdx).toBeGreaterThan(discIdx);
  });

  it("preserves the knockout geometry", () => {
    const root = smilesBlock();
    prepareSmilesForPrint(root, "#ffffff");

    const discs = [...root.querySelectorAll("circle")];
    expect(discs[0].getAttribute("cx")).toBe("50");
    expect(discs[0].getAttribute("cy")).toBe("50");
    expect(discs[0].getAttribute("r")).toBe("8.25");
    expect(discs[1].getAttribute("r")).toBe("12");
  });

  it("keeps the bond strokes and other markup untouched", () => {
    const root = smilesBlock();
    prepareSmilesForPrint(root, "#ffffff");

    expect(root.querySelector("line")!.getAttribute("stroke")).toBe("url(#g1)");
    expect(root.querySelector("text")!.textContent).toBe("O");
  });

  it("is idempotent", () => {
    const root = smilesBlock();
    prepareSmilesForPrint(root, "#ffffff");
    const once = root.innerHTML;
    prepareSmilesForPrint(root, "#ffffff");
    expect(root.innerHTML).toBe(once);
  });

  it("leaves non-SMILES SVGs and unmasked markup alone", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="smiles-block"><svg><g id="plain"><rect/></g></svg></div>
      <svg id="other"><mask id="m1"><rect fill="white"/></mask><g mask="url(#m1)"/></svg>`;
    const before = root.innerHTML;
    prepareSmilesForPrint(root, "#ffffff");
    expect(root.innerHTML).toBe(before);
  });

  it("converts real smiles-drawer output", async () => {
    await ensureSmilesLoaded();
    const root = document.createElement("div");
    root.innerHTML = renderSmilesFence(
      "CC(=O)Oc1ccccc1C(=O)O",
      resolveSmilesOptions({}),
    );

    // Sanity: the library's knockout is mask-based.
    expect(root.querySelector("mask")).not.toBeNull();
    expect(root.querySelector("g[mask]")).not.toBeNull();

    prepareSmilesForPrint(root, "#ffffff");

    expect(root.querySelector("mask")).toBeNull();
    expect(root.querySelector("g[mask]")).toBeNull();
    // One knockout disc per atom label, now painted in the page color. (The
    // bond group's ring circles are `fill="none"` and stay untouched.)
    const discs = [...root.querySelectorAll('circle[fill="#ffffff"]')];
    expect(discs.length).toBeGreaterThan(0);
    expect(root.querySelector('circle[fill="none"]')).not.toBeNull();
    // Labels still sit above the knockout discs.
    const children = [...root.querySelector("svg")!.children];
    const firstDisc = children.findIndex((el) => el.tagName === "circle");
    const labelGroup = children.findIndex((el) => el.querySelector("text"));
    expect(firstDisc).toBeGreaterThanOrEqual(0);
    expect(labelGroup).toBeGreaterThan(firstDisc);
  });
});
