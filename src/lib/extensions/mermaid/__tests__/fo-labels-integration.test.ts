// @vitest-environment jsdom
/**
 * foreignObject label conversion against REAL Mermaid output — the diagram
 * families from the historical ODT label bug report (journey "Work"
 * invisible, mindmap/state/ER/block labels misplaced).
 *
 * jsdom has no layout, so the converter runs its measurement-free fallback
 * placement here: one centered `<text>` per label at the foreignObject box,
 * with the wrong-color `<switch>` fallback text of Mermaid's text dialect
 * gone. The measurable path is covered with synthetic metrics in
 * fo-labels.test.ts; this suite pins that the *diagram families* end up
 * with standalone SVG text labels at all.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installCanvasStub, installSvgLayoutShim } from "./svg-layout-shim";
import { convertForeignObjectLabels } from "../fo-labels";

const DIAGRAMS: Record<string, string> = {
  journey: `journey
    title My day
    section Work
        Write code: 5: Me
        Review: 3: Me, Team`,
  mindmap: `mindmap
    root((mindmap))
        Origins
            Long history
        Research
            On effectiveness`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Busy: work
    Busy --> [*]: done`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places`,
  block: `block-beta
    columns 2
    a b`,
};

const rendered: Record<string, string> = {};

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  installSvgLayoutShim();
  installCanvasStub();
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "strict",
    fontFamily: "'trebuchet ms', verdana, arial, sans-serif",
    htmlLabels: true,
    suppressErrorRendering: true,
    themeVariables: { fontSize: "16px" },
  });
  for (const [name, code] of Object.entries(DIAGRAMS)) {
    const { svg } = await mermaid.render(`fo_int_${name}`, code);
    rendered[name] = svg;
  }
}, 60000);

describe("foreignObject label conversion (real Mermaid output)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders labels as foreignObject HTML in the viewer dialect", () => {
    for (const [name, svg] of Object.entries(rendered)) {
      expect(svg, name).toContain("foreignObject");
    }
  });

  it("strips every foreignObject from the converted SVG", async () => {
    for (const [name, svg] of Object.entries(rendered)) {
      const out = await convertForeignObjectLabels(svg);
      expect(out, name).not.toContain("foreignObject");
    }
  });

  it("keeps every label as centered standalone text", async () => {
    const expected: Record<string, string[]> = {
      journey: ["Work", "Write code", "Review", "My day"],
      mindmap: [
        "mindmap",
        "Origins",
        "Long history",
        "Research",
        "On effectiveness",
      ],
      state: ["Idle", "Busy"],
      er: ["CUSTOMER", "ORDER"],
      block: ["a", "b"],
    };
    for (const [name, labels] of Object.entries(expected)) {
      const out = await convertForeignObjectLabels(rendered[name]);
      for (const label of labels) {
        expect(out, `${name}: ${label}`).toContain(`>${label}<`);
      }
      // Converted labels are centered on their foreignObject box — no
      // start-anchored spill (mindmap root, ER) and no left-hug (state).
      expect(out, name).toContain('text-anchor="middle"');
      expect(out, name).toContain('dominant-baseline="central"');
    }
  });

  it("drops the mis-colored switch fallback text of journey labels", async () => {
    // Mermaid's text dialect renders the journey section label in the
    // section box's fill (class `section-type-0`) — invisible in rasters.
    // The converted label is plain text with no shape classes.
    const out = await convertForeignObjectLabels(rendered.journey);
    expect(out.match(/Work/g)).toHaveLength(1);
    const workTag = out.match(/<text[^>]*>Work<\/text>/)?.[0] ?? "";
    expect(workTag).not.toBe("");
    expect(workTag).not.toContain("class");
    expect(out).not.toContain("switch");
  });

  it("survives the full export pipeline (all normalization passes)", async () => {
    const { clearMermaidCache, renderMermaidSvgForExport } =
      await import("../renderer");
    clearMermaidCache();
    for (const [name, code] of Object.entries(DIAGRAMS)) {
      const svg = await renderMermaidSvgForExport(code);
      expect(svg, name).not.toContain("foreignObject");
      expect(svg, name).not.toContain("switch");
      // normalizeSvgForNaturalSize turns the viewBox into explicit size.
      expect(svg, name).toMatch(/<svg[^>]*width="\d+"/);
      expect(svg, name).toMatch(/<svg[^>]*height="\d+"/);
    }
    // The invisible journey section label survives as a plain text label.
    const journey = await renderMermaidSvgForExport(DIAGRAMS.journey);
    expect(journey).toContain(">Work<");
    expect(journey).toContain('text-anchor="middle"');
    clearMermaidCache();
  });
});
