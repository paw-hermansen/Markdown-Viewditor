// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SMILES_STYLES, injectSmilesStyles } from "../styles";

/**
 * CSS contract for the two width modes (see styles.ts). Mirrors
 * mermaid/__tests__/styles.test.ts: these pin the exact rules the
 * zoom/print contracts depend on, so an innocent restyle fails here first.
 */
describe("SMILES_STYLES width modes", () => {
  it("default mode scales structures down to the column", () => {
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\s+svg\s*{[^}]*max-width:\s*100%/,
    );
  });

  it("scroll mode keeps the scaled size and scrolls horizontally", () => {
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\[data-fit-to-width="false"\]\s*{[^}]*overflow-x:\s*auto/,
    );
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\[data-fit-to-width="false"\]\s+svg\s*{[^}]*max-width:\s*none/,
    );
  });

  it("scroll mode aligns via auto margins, never justify-content", () => {
    // Centered flex content overflows both ends in a scroll container and
    // the left part becomes unreachable; auto margins resolve to zero on
    // overflow instead (see styles.ts). The flex fallback is overridden to
    // flex-start and the margins carry left/center/right.
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\[data-fit-to-width="false"\]\s*{[^}]*justify-content:\s*flex-start/,
    );
    const wrapper = SMILES_STYLES.match(
      /\.smiles-block\[data-fit-to-width="false"\]\s+\.smiles-scroll-content\s*{([^}]*)}/,
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper![1]).toMatch(/margin-left:\s*auto/);
    expect(wrapper![1]).toMatch(/margin-right:\s*auto/);
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\[data-fit-to-width="false"\]\[data-align="left"\]\s+\.smiles-scroll-content\s*{[^}]*margin-left:\s*0/,
    );
    expect(SMILES_STYLES).toMatch(
      /\.smiles-block\[data-fit-to-width="false"\]\[data-align="right"\]\s+\.smiles-scroll-content\s*{[^}]*margin-left:\s*auto[^}]*margin-right:\s*0/,
    );
  });

  it("scroll mode keeps the inner wrapper unshrinkable (WebKitGTK)", () => {
    // An SVG flex item does not reliably shrink-to-content on WebKitGTK;
    // the plain-block inner wrapper is what makes the scrollbar appear.
    const wrapper = SMILES_STYLES.match(
      /\.smiles-block\[data-fit-to-width="false"\]\s+\.smiles-scroll-content\s*{([^}]*)}/,
    );
    expect(wrapper![1]).toMatch(/display:\s*inline-block/);
    expect(wrapper![1]).toMatch(/flex:\s*0 0 auto/);
    expect(wrapper![1]).toMatch(/max-width:\s*none/);
  });

  it("print clamps scroll-mode structures to the content column", () => {
    // No scrolling in print: wide structures scale down to the page width
    // the clone maps the content column onto (Mermaid's fitToWidth=false
    // print behavior).
    expect(SMILES_STYLES).toMatch(
      /\.print-content\s+\.smiles-block\[data-fit-to-width="false"\]\s*{[^}]*overflow:\s*visible/,
    );
    expect(SMILES_STYLES).toMatch(
      /\.print-content\s+\.smiles-block\[data-fit-to-width="false"\]\s+\.smiles-scroll-content\s*{[^}]*max-width:\s*100%/,
    );
    expect(SMILES_STYLES).toMatch(
      /\.print-content\s+\.smiles-block\[data-fit-to-width="false"\]\s+svg\s*{[^}]*max-width:\s*100%/,
    );
  });

  it("keeps structures whole across print pages", () => {
    expect(SMILES_STYLES).toMatch(
      /\.print-content\s+\.smiles-block\s*{[^}]*break-inside:\s*avoid/,
    );
  });

  it("never sets width: auto on the SVG (WebKitGTK object-sizing trap)", () => {
    // Same trap as the Mermaid natural-size contract: width: auto discards
    // the explicit width/height attributes and resolves through the
    // engine's default object sizing (WebKitGTK renders 10/9 of natural).
    expect(SMILES_STYLES).not.toMatch(/width:\s*auto/);
  });
});

describe("injectSmilesStyles", () => {
  it("is idempotent", () => {
    injectSmilesStyles();
    injectSmilesStyles();
    const tags = document.querySelectorAll('style[data-ext="smiles"]');
    expect(tags.length).toBeLessThanOrEqual(1);
  });
});
