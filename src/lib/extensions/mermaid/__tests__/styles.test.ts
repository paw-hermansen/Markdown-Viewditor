import { describe, expect, it } from "vitest";
import {
  LABEL_HOST_CLASS,
  LABEL_HOST_RULES,
  MERMAID_FONT_SIZE,
  MERMAID_STYLES,
} from "../styles";

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
    expect(naturalSvg).toContain("height: auto !important;");
    // No `width: auto`: it overrides the explicit width normalizeSvgForNaturalSize
    // writes and hands sizing to engine-dependent default object sizing
    // (WebKitGTK renders 10/9 of the natural size then — see styles.ts).
    expect(naturalSvg).not.toMatch(/(?:^|[;{])\s*width\s*:/);
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

  it("specifies the label font size on the foreignObject label roots", () => {
    const labels = ruleFor(".mermaid-block svg foreignObject > div");

    // Placed diagrams and Mermaid's pre-render temp container (where the
    // label clip box is measured) both need a *specified* size: an inherited
    // one can fall back to the page's 14px while the diagram root rule says
    // 16px, and Mermaid clips the label at whatever it measured.
    expect(labels).toContain('body > div[id^="dmmd-"] svg foreignObject > div');
    // The export/print label conversion host re-lays out the same label HTML
    // to measure it — the pin matters there just as much.
    expect(labels).toContain(`.${LABEL_HOST_CLASS} svg foreignObject > div`);
    expect(labels).toContain(`font-size: ${MERMAID_FONT_SIZE};`);
    expect(MERMAID_FONT_SIZE).toBe("16px");
  });

  it("resets KaTeX display margins inside labels only", () => {
    const katexDisplay = ruleFor(
      ".mermaid-block svg foreignObject .katex-display",
    );

    // KaTeX's `margin: 1em 0` inflates the label box Mermaid measures and
    // bakes into node geometry by 2em — a one-line formula then sits in a
    // box sized for three rows. Measurement happens in the pre-render temp
    // container, so that host needs the reset as much as the placed one.
    expect(katexDisplay).toContain(
      'body > div[id^="dmmd-"] svg foreignObject .katex-display',
    );
    // …and the export/print label conversion host, which re-measures label
    // HTML to place the exported formula image: unreset there pushes every
    // exported display formula one label row below where the viewer — and
    // Mermaid's baked node geometry — put it.
    expect(katexDisplay).toContain(
      `.${LABEL_HOST_CLASS} svg foreignObject .katex-display`,
    );
    expect(katexDisplay).toContain("margin: 0;");

    // Markdown math blocks outside diagrams must keep their margins: every
    // occurrence has to sit behind a foreignObject scope.
    expect(MERMAID_STYLES).not.toMatch(/(^|\n)\s*\.katex-display[\s,]*\{/m);
  });

  it("keeps the conversion host's self-injected rules in sync", () => {
    // fo-labels.ts injects LABEL_HOST_RULES scoped to LABEL_HOST_CLASS so
    // its measurement host works even where MERMAID_STYLES has not been
    // injected. The rule bodies must match the MERMAID_STYLES ones above,
    // or the conversion would measure labels differently from the viewer.
    expect(LABEL_HOST_RULES).toContain(
      `.${LABEL_HOST_CLASS} svg foreignObject > div`,
    );
    expect(LABEL_HOST_RULES).toContain(`font-size: ${MERMAID_FONT_SIZE};`);
    expect(LABEL_HOST_RULES).toContain(
      `.${LABEL_HOST_CLASS} svg foreignObject .katex-display`,
    );
    expect(LABEL_HOST_RULES).toContain("margin: 0;");
    // Same scoping discipline as MERMAID_STYLES: never a bare .katex-display
    // rule (prose math blocks keep their margins).
    expect(LABEL_HOST_RULES).not.toMatch(/(^|\n)\s*\.katex-display[\s,]*\{/m);
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
    // `height: auto` keeps the aspect ratio while max-width clamps; the
    // width comes from the explicit natural-size attributes — no `width:
    // auto`, which would hand sizing to engine-dependent default object
    // sizing (see the natural-mode rule).
    expect(printSvg).toContain("height: auto !important;");
    expect(printSvg).not.toMatch(/(?:^|[;{])\s*width\s*:/);
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
