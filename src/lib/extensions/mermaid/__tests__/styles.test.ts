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
    const naturalSvg = ruleFor('.mermaid-block[data-fit-to-width="false"] svg');

    expect(naturalWrapper).toContain("overflow-x: auto;");
    expect(naturalWrapper).toContain("overflow-y: hidden;");
    expect(naturalWrapper).toContain("overflow-y: clip;");
    expect(naturalWrapper).toContain("justify-content: flex-start;");
    expect(naturalWrapper).not.toContain("overflow: auto;");
    expect(naturalWrapper).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll);/);
    expect(naturalWrapper).not.toContain("height:");
    expect(naturalWrapper).not.toContain("max-height:");

    expect(naturalSvg).toContain("max-width: none !important;");
    expect(naturalSvg).toContain("width: max-content !important;");
    expect(naturalSvg).toContain("min-width: max-content !important;");
    expect(naturalSvg).toContain("flex-shrink: 0 !important;");
    expect(naturalSvg).not.toContain("height:");
    expect(naturalSvg).not.toContain("max-height:");
  });

  it("keeps fit-mode SVGs responsive without clipping their auto height", () => {
    const fitSvg = ruleFor(".mermaid-block svg");

    expect(fitSvg).toContain("max-width: 100%;");
    expect(fitSvg).toContain("height: auto;");
    expect(ruleFor(".mermaid-block {")).toContain("overflow: visible;");
    expect(MERMAID_STYLES).not.toContain("max-height:");
  });

  it("stacks error content instead of laying it out beside the message", () => {
    const errorRule = ruleFor(".mermaid-block.mermaid-error-block");

    expect(errorRule).toContain("flex-direction: column;");
    expect(errorRule).toContain("align-items: stretch;");
  });
});
