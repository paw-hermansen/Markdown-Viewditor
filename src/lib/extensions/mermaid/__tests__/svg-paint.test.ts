// @vitest-environment jsdom
/**
 * Unit tests for the `<style>` → presentation-attribute paint flattening
 * (`materializeSvgPaint`), the vector-ODT fix for LibreOffice svgio's
 * missing CSS combinator support (tdf#129356). Synthetic SVGs in Mermaid's
 * generated CSS dialect; real-Mermaid coverage lives in
 * svg-paint-integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import { materializeSvgPaint } from "../svg-paint";

function svgWith(css: string, body: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" id="mmd-0" viewBox="0 0 100 50">' +
    `<style>${css}</style>${body}</svg>`
  );
}

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("materializeSvgPaint", () => {
  it("writes rule paint as presentation attributes and removes the style block", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .node rect{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}",
        '<g class="node"><rect class="basic label-container" x="0" y="0" width="10" height="10"/></g>',
      ),
    );
    const rect = parse(out).querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("#ECECFF");
    expect(rect.getAttribute("stroke")).toBe("#9370DB");
    expect(rect.getAttribute("stroke-width")).toBe("1px");
    expect(out).not.toContain("<style");
  });

  it("pins edge paths to fill=none so open curves cannot paint fill wedges", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .flowchart-link{stroke:#333333;fill:none;}",
        '<path class="flowchart-link" d="M 0 0 C 1 1 2 2 3 3"/>',
      ),
    );
    const path = parse(out).querySelector("path")!;
    expect(path.getAttribute("fill")).toBe("none");
    expect(path.getAttribute("stroke")).toBe("#333333");
  });

  it("resolves inheritance through groups", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .cluster{fill:#ffffff;stroke:#333333;}",
        '<g class="cluster"><rect x="0" y="0" width="5" height="5"/></g>',
      ),
    );
    const rect = parse(out).querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("#ffffff");
    expect(rect.getAttribute("stroke")).toBe("#333333");
  });

  it("keeps existing presentation attributes when no rule covers them", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .task{stroke:#000000;}",
        '<rect class="task" fill="#4472c4" x="0" y="0" width="5" height="5"/>',
      ),
    );
    const rect = parse(out).querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("#4472c4");
    expect(rect.getAttribute("stroke")).toBe("#000000");
  });

  it("lets a rule override a presentation attribute (CSS outranks attributes)", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 rect{fill:#ECECFF;}",
        '<rect fill="#4472c4" x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#ECECFF",
    );
  });

  it("never writes a property the element declares in its inline style", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .katex path{fill:#000000;stroke:#000000;}",
        '<path class="katex" style="fill: currentColor; stroke: none;" d="M 0 0"/>',
      ),
    );
    const path = parse(out).querySelector("path")!;
    expect(path.getAttribute("style")).toContain("fill: currentColor");
    expect(path.getAttribute("fill")).toBeNull();
    expect(path.getAttribute("stroke")).toBeNull();
  });

  it("applies specificity, source order, and !important", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 rect{fill:#111111;}" +
          "#mmd-0 .special{fill:#222222;}" +
          "#mmd-0 .later{fill:#333333;}" +
          "#mmd-0 .loud{fill:#444444 !important;}",
        '<rect class="special later loud" x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#444444",
    );
  });

  it("resolves currentColor through the color chain", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0{color:#333333;}" + "#mmd-0 .icon path{fill:currentColor;}",
        '<g class="icon"><path d="M 0 0"/></g>',
      ),
    );
    expect(parse(out).querySelector("path")!.getAttribute("fill")).toBe(
      "#333333",
    );
  });

  it("expands var() with custom properties from the root rule", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0{--mermaid-font-family:'trebuchet ms',sans-serif;}" +
          "#mmd-0 text{font-family:var(--mermaid-font-family);}",
        "<text>Hi</text>",
      ),
    );
    expect(parse(out).querySelector("text")!.getAttribute("font-family")).toBe(
      "'trebuchet ms',sans-serif",
    );
  });

  it("uses the var() fallback when the custom property is undefined", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 text{font-family:var(--missing,sans-serif);}",
        "<text>Hi</text>",
      ),
    );
    expect(parse(out).querySelector("text")!.getAttribute("font-family")).toBe(
      "sans-serif",
    );
  });

  it("splits rgba() into a color and its -opacity companion", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .box{fill:rgba(200,100,50,0.5);}",
        '<rect class="box" x="0" y="0" width="5" height="5"/>',
      ),
    );
    const rect = parse(out).querySelector("rect")!;
    expect(rect.getAttribute("fill")).toBe("#c86432");
    expect(rect.getAttribute("fill-opacity")).toBe("0.5");
  });

  it("normalizes hsl()/hsla() to SVG 1.1 hex colors", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .edge{stroke:hsl(60, 100%, 73.5294117647%);}" +
          "#mmd-0 .tint{fill:hsla(120, 100%, 50%, 0.25);}",
        '<path class="edge" d="M 0 0"/><rect class="tint" x="0" y="0" width="5" height="5"/>',
      ),
    );
    const doc = parse(out);
    expect(doc.querySelector("path")!.getAttribute("stroke")).toBe("#ffff78");
    const tint = doc.querySelector("rect")!;
    expect(tint.getAttribute("fill")).toBe("#00ff00");
    expect(tint.getAttribute("fill-opacity")).toBe("0.25");
  });

  it("multiplies rgba alpha onto an already-resolved fill-opacity", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .box{fill:rgba(200,100,50,0.5);fill-opacity:0.8;}",
        '<rect class="box" x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill-opacity")).toBe(
      "0.4",
    );
  });

  it("materializes rx/ry and display, preserving hidden shapes", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .node{rx:5px;}" + "#mmd-0 .gone{display:none;}",
        '<rect class="node" x="0" y="0" width="5" height="5"/><circle class="gone" r="1"/>',
      ),
    );
    const doc = parse(out);
    expect(doc.querySelector("rect")!.getAttribute("rx")).toBe("5px");
    expect(doc.querySelector("circle")!.getAttribute("display")).toBe("none");
  });

  it("flattens paint inside marker definitions", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .arrowheadPath{fill:#333333;}",
        '<defs><marker id="mmd-0-arrowhead"><path class="arrowheadPath" d="M 0 0 L 2 1 L 0 2 z"/></marker></defs>',
      ),
    );
    const path = parse(out).querySelector("marker path")!;
    expect(path.getAttribute("fill")).toBe("#333333");
  });

  it("matches attribute selectors and the :root pseudo-class", () => {
    const out = materializeSvgPaint(
      svgWith(
        '#mmd-0 [data-look="neo"]{stroke:#9370DB;}' +
          "#mmd-0:root{font-size:16px;}",
        '<rect data-look="neo" x="0" y="0" width="5" height="5"/>',
      ),
    );
    const doc = parse(out);
    expect(doc.querySelector("rect")!.getAttribute("stroke")).toBe("#9370DB");
    expect(doc.documentElement.getAttribute("font-size")).toBe("16px");
  });

  it("ignores dynamic pseudo-class selectors without failing the pass", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 rect:hover{fill:#ff0000;}" + "#mmd-0 rect{fill:#00ff00;}",
        '<rect x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#00ff00",
    );
  });

  it("skips child-combinator and grouped selectors correctly", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .node .label, #mmd-0 text.actor>tspan{fill:#123456;}",
        '<g class="node"><g class="label"><text>outer</text></g></g><text class="actor"><tspan>inner</tspan></text>',
      ),
    );
    const doc = parse(out);
    // The descendant match inherits onto the nested text; the child match
    // lands on the tspan only.
    expect(doc.querySelector("g.label text")!.getAttribute("fill")).toBe(
      "#123456",
    );
    expect(doc.querySelector("text.actor")!.getAttribute("fill")).toBeNull();
    expect(doc.querySelector("tspan")!.getAttribute("fill")).toBe("#123456");
  });

  it("is a no-op when a matching rule carries an unknown property", () => {
    const svg = svgWith(
      "#mmd-0 rect{fill:#ECECFF;fancy-paint:sparkles;}",
      '<rect x="0" y="0" width="5" height="5"/>',
    );
    expect(materializeSvgPaint(svg)).toBe(svg);
  });

  it("still flattens when the unknown property only occurs in a non-matching rule", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 div.tip{position:absolute;fancy-paint:sparkles;}" +
          "#mmd-0 rect{fill:#ECECFF;}",
        '<rect x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#ECECFF",
    );
  });

  it("is a no-op on unsupported selector syntax", () => {
    const svg = svgWith(
      "#mmd-0 rect + circle{fill:#ECECFF;}",
      '<rect x="0" y="0" width="5" height="5"/>',
    );
    expect(materializeSvgPaint(svg)).toBe(svg);
  });

  it("is a no-op on statement at-rules", () => {
    const svg = svgWith(
      '@import url("x.css"); #mmd-0 rect{fill:#ECECFF;}',
      '<rect x="0" y="0" width="5" height="5"/>',
    );
    expect(materializeSvgPaint(svg)).toBe(svg);
  });

  it("ignores keyframes blocks entirely", () => {
    const out = materializeSvgPaint(
      svgWith(
        "@keyframes dash{from{stroke-dashoffset:900;}to{stroke-dashoffset:0;}}" +
          "#mmd-0 rect{fill:#ECECFF;}",
        '<rect x="0" y="0" width="5" height="5"/>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#ECECFF",
    );
  });

  it("resolves inherit and unset keywords", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .parent{fill:#123456;}" + "#mmd-0 .child{fill:inherit;}",
        '<g class="parent"><rect class="child" x="0" y="0" width="5" height="5"/></g>',
      ),
    );
    expect(parse(out).querySelector("rect")!.getAttribute("fill")).toBe(
      "#123456",
    );
  });

  it("flattens diagrams carrying captured formula images", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 .node rect{fill:#ECECFF;stroke:#9370DB;}",
        '<g class="node"><rect x="0" y="0" width="5" height="5"/>' +
          '<image x="1" y="1" width="3" height="2" href="data:image/png;base64,QUJD" xlink:href="data:image/png;base64,QUJD"/></g>',
      ).replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" '),
    );
    const doc = parse(out);
    expect(doc.querySelector("rect")!.getAttribute("fill")).toBe("#ECECFF");
    expect(doc.querySelector("image")!.getAttribute("xlink:href")).toBe(
      "data:image/png;base64,QUJD",
    );
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });

  it("keeps HTML inside foreignObject untouched", () => {
    const out = materializeSvgPaint(
      svgWith(
        "#mmd-0 div{background-color:#ff0000;}" +
          "#mmd-0 rect.node{fill:#ECECFF;}",
        '<rect class="node" x="0" y="0" width="5" height="5"/>' +
          '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="label">hi</div></foreignObject>',
      ),
    );
    const doc = parse(out);
    expect(doc.querySelector("rect")!.getAttribute("fill")).toBe("#ECECFF");
    // No fill attribute forced onto the XHTML label div.
    expect(doc.querySelector("div")!.getAttribute("fill")).toBeNull();
    expect(
      doc.querySelector("div")!.getAttribute("background-color"),
    ).toBeNull();
  });

  it("returns input unchanged when there is no style block", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#123456"/></svg>';
    expect(materializeSvgPaint(svg)).toBe(svg);
  });

  it("returns input unchanged for unparseable markup", () => {
    const svg = "<svg><rect></svg>";
    expect(materializeSvgPaint(svg)).toBe(svg);
  });
});
