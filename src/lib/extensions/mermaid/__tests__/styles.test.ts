import { describe, expect, it } from "vitest";
import { MERMAID_STYLES } from "../styles";

function ruleFor(selector: string): string {
  const start = MERMAID_STYLES.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = MERMAID_STYLES.indexOf("}", start);
  expect(end).toBeGreaterThan(start);

  return MERMAID_STYLES.slice(start, end);
}

describe("Mermaid host-layout styles", () => {
  it("bounds the wrapper to the available content width", () => {
    const wrapper = ruleFor(".mermaid-block {");

    expect(wrapper).toContain(
      "width: min(var(--mermaid-max-width, 800px), 100%);",
    );
    expect(wrapper).toContain("max-width: 100%;");
    expect(wrapper).toContain("min-width: 0;");
    expect(wrapper).toContain("overflow: visible;");
  });

  it("documents left, center, and right alignment for bounded fit mode", () => {
    const alignments = [
      ["left", "margin-left: 0;", "margin-right: auto;", "flex-start"],
      ["center", "margin-left: auto;", "margin-right: auto;", "center"],
      ["right", "margin-left: auto;", "margin-right: 0;", "flex-end"],
    ] as const;

    for (const [align, leftMargin, rightMargin, justification] of alignments) {
      const rule = ruleFor(`.mermaid-block[data-align="${align}"]`);

      expect(rule).toContain(leftMargin);
      expect(rule).toContain(rightMargin);
      expect(rule).toContain(`justify-content: ${justification};`);
    }
  });

  it("keeps natural mode start-aligned with horizontal overflow only", () => {
    const naturalWrapper = ruleFor('.mermaid-block[data-fit-to-width="false"]');
    const naturalScroll = ruleFor(
      '.mermaid-block[data-fit-to-width="false"] .mermaid-scroll-content',
    );
    const naturalSvg = ruleFor('.mermaid-block[data-fit-to-width="false"] svg');

    expect(naturalWrapper).toContain("overflow-x: auto;");
    expect(naturalWrapper).toContain("overflow-y: hidden;");
    expect(naturalWrapper).toContain("overflow-y: clip;");
    expect(naturalWrapper).toContain("justify-content: flex-start;");
    expect(naturalWrapper).not.toContain("overflow: auto;");
    expect(naturalWrapper).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll);/);
    expect(naturalWrapper).not.toContain("height:");
    expect(naturalWrapper).not.toContain("max-height:");

    expect(naturalScroll).toContain("display: inline-block;");
    expect(naturalScroll).toContain("flex: 0 0 auto;");
    expect(naturalScroll).toContain("max-width: none;");
    expect(naturalScroll).toContain("vertical-align: top;");
    expect(naturalScroll).not.toContain("height:");
    expect(naturalScroll).not.toContain("max-height:");

    expect(naturalSvg).toContain("max-width: none !important;");
    expect(naturalSvg).toContain("width: auto !important;");
    expect(naturalSvg).toContain("height: auto !important;");
    expect(naturalSvg).not.toContain("flex-shrink:");
    expect(naturalSvg).not.toContain("min-width:");
  });

  it("keeps fit-mode SVGs responsive without clipping their auto height", () => {
    const fitSvg = ruleFor(".mermaid-block svg");

    expect(fitSvg).toContain("max-width: 100%;");
    expect(fitSvg).toContain("height: auto;");
    expect(ruleFor(".mermaid-block {")).toContain("overflow: visible;");
    expect(MERMAID_STYLES).not.toContain("max-height:");
    expect(MERMAID_STYLES).not.toContain(".print-content .mermaid-block svg");
  });

  it("clamps over-wide natural-size diagrams to the column in print", () => {
    const printWrapper = ruleFor(
      '.print-content .mermaid-block[data-fit-to-width="false"]',
    );
    const printScroll = ruleFor(
      '.print-content .mermaid-block[data-fit-to-width="false"] .mermaid-scroll-content',
    );
    const printSvg = ruleFor(
      '.print-content .mermaid-block[data-fit-to-width="false"] svg',
    );

    expect(printWrapper).toContain("width: 100%;");
    expect(printWrapper).toContain("max-width: 100%;");
    expect(printWrapper).toContain("overflow: visible;");
    expect(printWrapper).toContain("justify-content: center;");
    expect(printWrapper).not.toContain("overflow-x: auto;");

    expect(printScroll).toContain("max-width: 100%;");

    expect(printSvg).toContain("max-width: 100% !important;");
    expect(printSvg).toContain("width: auto !important;");
    expect(printSvg).toContain("height: auto !important;");
  });

  it("honors data-align for natural-size diagrams in print", () => {
    expect(
      ruleFor(
        '.print-content .mermaid-block[data-fit-to-width="false"][data-align="left"]',
      ),
    ).toContain("justify-content: flex-start;");
    expect(
      ruleFor(
        '.print-content .mermaid-block[data-fit-to-width="false"][data-align="right"]',
      ),
    ).toContain("justify-content: flex-end;");
  });

  it("keeps diagrams from being split across pages in print", () => {
    expect(ruleFor(".print-content .mermaid-block {")).toContain(
      "break-inside: avoid;",
    );
  });

  it("stacks error content instead of laying it out beside the message", () => {
    const errorRule = ruleFor(".mermaid-block.mermaid-error-block");

    expect(errorRule).toContain("flex-direction: column;");
    expect(errorRule).toContain("align-items: stretch;");
  });
});
