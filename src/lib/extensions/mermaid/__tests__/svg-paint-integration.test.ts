// @vitest-environment jsdom
/**
 * Paint flattening (`materializeSvgPaint`) against REAL Mermaid output
 * through the full export pipeline (`renderMermaidSvgForExport`) — the
 * vector-ODT tripwire for LibreOffice svgio's missing CSS combinator
 * support (tdf#129356). Where Mermaid paints via `<style>` only, a
 * consumer that ignores the stylesheet falls back to `fill: black` /
 * `stroke: none`: black node boxes with invisible text, missing edge
 * lines, black fill wedges on curved edges.
 *
 * One diagram per affected family. If a Mermaid upgrade changes the
 * emitted CSS dialect enough that the flattener no-ops, the "no <style>"
 * assertions here fail loudly — see also upgrade-contract.test.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installCanvasStub, installSvgLayoutShim } from "./svg-layout-shim";

const DIAGRAMS: Record<string, string> = {
  flowchart: `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,
  gantt: `gantt
    title Plan
    section A
    Task one :a1, 2024-01-01, 30d
    Task two :a2, after a1, 20d`,
  timeline: `timeline
    title Our history
    2020 : Founded
    2022 : Launched product`,
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
  gitgraph: `gitGraph
    commit
    branch dev
    commit`,
  block: `block-beta
    columns 2
    a b`,
  sequence: `sequenceDiagram
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice`,
  "math-flowchart": `graph LR
    A["$$x^2$$"] --> B["some label"] --> C["$$\\frac{a}{b} + \\sqrt{2}$$"]`,
  "math-state": `stateDiagram-v2
    [*] --> Idle
    Idle --> Busy: $$\\int_0^1 f(x)\\,dx$$
    Busy --> [*]`,
};

const rendered: Record<string, string> = {};

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  installSvgLayoutShim();
  installCanvasStub();
  const { clearMermaidCache, renderMermaidSvgForExport } =
    await import("../renderer");
  clearMermaidCache();
  for (const [name, code] of Object.entries(DIAGRAMS)) {
    rendered[name] = await renderMermaidSvgForExport(code);
  }
  clearMermaidCache();
}, 60_000);

function doc(name: string): Document {
  return new DOMParser().parseFromString(rendered[name], "image/svg+xml");
}

describe("materializeSvgPaint with real Mermaid export output", () => {
  it.each(Object.keys(DIAGRAMS))(
    "%s: flattens the style block into presentation attributes",
    (name) => {
      expect(rendered[name], name).not.toContain("<style");
      // Flattening is all-or-nothing: if it had bailed on an un-understood
      // rule the `<style>` would still be there (asserted above) and these
      // paints would be missing.
      const shapes = [
        ...doc(name).querySelectorAll("rect, path, circle, line, polygon"),
      ];
      expect(shapes.length, name).toBeGreaterThan(0);
      for (const shape of shapes) {
        // Every shape resolves to some explicit paint — the SVG defaults
        // (fill=black, stroke=none) must never be load-bearing anymore.
        const painted =
          shape.hasAttribute("fill") ||
          shape.hasAttribute("stroke") ||
          (shape.getAttribute("style") ?? "").match(
            /(?:^|;)\s*(?:fill|stroke)\s*:/,
          );
        expect(
          painted,
          `${name}: ${shape.outerHTML.slice(0, 120)}`,
        ).toBeTruthy();
      }
    },
  );

  it("flowchart: node boxes carry fill/stroke and edge lines are fill=none with a stroke", () => {
    const d = doc("flowchart");
    const box = d.querySelector("rect.basic")!;
    expect(box.getAttribute("fill")).toMatch(/^#|rgb/);
    expect(box.getAttribute("stroke")).toMatch(/^#|rgb/);
    const link = [...d.querySelectorAll("path")].find((p) =>
      (p.getAttribute("class") ?? "").includes("flowchart-link"),
    )!;
    expect(link.getAttribute("stroke")).toMatch(/^#|rgb/);
    expect(link.getAttribute("fill")).toBe("none");
  });

  it("flowchart: arrowheads in defs keep their fill", () => {
    const markerPath = doc("flowchart").querySelector("marker path");
    expect(markerPath).not.toBeNull();
    expect(markerPath!.getAttribute("fill")).toMatch(/^#|rgb/);
  });

  it("mindmap: depth-ramped connectors keep an explicit stroke", () => {
    const edges = [...doc("mindmap").querySelectorAll("path")].filter((p) =>
      (p.getAttribute("class") ?? "").includes("edge-thickness"),
    );
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.getAttribute("stroke")).toMatch(/^#|rgb/);
    }
  });

  it("gitGraph: branch lines and labels are explicitly painted", () => {
    const d = doc("gitgraph");
    for (const line of d.querySelectorAll("line")) {
      expect(line.getAttribute("stroke")).toMatch(/^#|rgb/);
    }
    for (const text of d.querySelectorAll("text")) {
      expect(
        text.getAttribute("fill") ??
          (text.getAttribute("style") ?? "").includes("fill:"),
      ).toBeTruthy();
    }
  });

  it("journey: section titles and legend keep their fill", () => {
    const d = doc("journey");
    const section = [...d.querySelectorAll("text")].find((t) =>
      (t.getAttribute("class") ?? "").includes("journey-section"),
    );
    if (section) {
      expect(section.getAttribute("fill")).toMatch(/^#|rgb/);
    }
  });

  it("state: the start marker circle keeps its fill", () => {
    const start = doc("state").querySelector("circle.state-start");
    expect(start).not.toBeNull();
    expect(start!.getAttribute("fill")).toMatch(/^#|rgb/);
  });

  it("math labels: the diagram flattens and the SVG stays well-formed XML", () => {
    // Math labels (`$$…$$`) go through the KaTeX capture path, whose
    // `<image>` elements once carried an unbound `xlink:href` prefix —
    // invalid XML that silently no-opped the paint flattening (the
    // LibreOffice black-box symptoms then survived on exactly the math
    // diagrams). jsdom degrades the labels to text here; the capture
    // output itself is pinned as valid XML in fo-labels.test.ts.
    for (const name of ["math-flowchart", "math-state"] as const) {
      const svg = rendered[name];
      expect(svg, name).not.toContain("<style");
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(parsed.getElementsByTagName("parsererror"), name).toHaveLength(0);
    }
  });
});
