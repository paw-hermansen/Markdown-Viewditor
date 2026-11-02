// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  ensureSmilesLoaded,
  renderSmilesFence,
  renderSmilesSvg,
  resolveSmilesOptions,
  type SmilesRenderOptions,
} from "../renderer";

/** Aspirin — enough structure to give the drawing non-trivial bounds. */
const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";

const defaults = (
  over: Partial<SmilesRenderOptions> = {},
): SmilesRenderOptions => resolveSmilesOptions(over);

function svgAttrs(svg: string): { width: number; height: number; box: number } {
  const width = parseFloat(
    svg.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1] ?? "0",
  );
  const height = parseFloat(
    svg.match(/<svg[^>]*\bheight="([\d.]+)"/)?.[1] ?? "0",
  );
  const vb = svg.match(/<svg[^>]*\bviewBox="([^"]+)"/)?.[1] ?? "";
  const parts = vb
    .trim()
    .split(/[\s,]+/)
    .map(parseFloat);
  return { width, height, box: Math.max(parts[2] ?? 0, parts[3] ?? 0) };
}

beforeAll(async () => {
  await ensureSmilesLoaded();
});

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("renderSmilesSvg size contract", () => {
  it("squares the viewBox at natural size and reports it as the box side", () => {
    const svg = renderSmilesSvg(ASPIRIN, defaults());
    const { width, height, box } = svgAttrs(svg);
    // Contract: squared viewBox (drawn at library scale 0) with width/height
    // attributes = box × scale. At scale=1 the attributes equal the box side.
    expect(box).toBeGreaterThan(0);
    expect(width).toBe(height);
    expect(width).toBe(Math.round(box * 1));
  });

  it("scale=1.5 renders at 150% (width/height attributes only, viewBox untouched)", () => {
    const natural = svgAttrs(renderSmilesSvg(ASPIRIN, defaults()));
    const scaled = svgAttrs(renderSmilesSvg(ASPIRIN, defaults({ scale: 1.5 })));
    expect(scaled.box).toBe(natural.box);
    expect(scaled.width).toBe(Math.round(natural.box * 1.5));
    expect(scaled.width).toBe(scaled.height);
  });

  it("produces well-formed XML (no duplicate namespace declarations)", () => {
    const svg = renderSmilesSvg(ASPIRIN, defaults());
    expect(svg.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)?.length).toBe(
      1,
    );
    const doc = new DOMParser().parseFromString(svg, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  it("leaves no zoom-fragile label placement behind (WebKit page zoom)", () => {
    // smiles-drawer positions letters with em offsets and CSS-px translate
    // groups; both drift under WebKit page zoom and must be rewritten to
    // absolute user units (text-offsets.ts).
    const svg = renderSmilesSvg(ASPIRIN, defaults());
    expect(svg).not.toMatch(/transform:\s*translate/);
    expect(svg).not.toMatch(/(?:^|[\s"])(?:x|y|dx|dy)="[^"]*em"/);
    // The label anchors are present as absolute coordinates.
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const text = doc.querySelector("text");
    expect(text).not.toBeNull();
    expect(text!.hasAttribute("x")).toBe(true);
    expect(text!.hasAttribute("y")).toBe(true);
  });

  it("clamps out-of-range scales through the schema merge", () => {
    const opts = resolveSmilesOptions({ scale: 10 });
    expect(opts.scale).toBe(4);
    const tiny = resolveSmilesOptions({ scale: 0.01 });
    expect(tiny.scale).toBe(0.25);
  });
});

describe("theme handling", () => {
  it("theme=auto follows the app theme", () => {
    const light = renderSmilesSvg(ASPIRIN, defaults());
    document.documentElement.setAttribute("data-theme", "dark");
    const dark = renderSmilesSvg(ASPIRIN, defaults());
    // Bond strokes take the theme's C color: #222222 (light) vs #ffffff
    // (dark) in smiles-drawer's defaultOptions.themes. The `<text>` base
    // fill is hard-coded #ffffff in both, so assert on strokes only.
    expect(light).toContain('stroke="#222222"');
    expect(light).not.toContain('stroke="#ffffff"');
    expect(dark).toContain('stroke="#ffffff"');
    expect(dark).not.toContain('stroke="#222222"');
  });

  it("an explicit theme pins the palette regardless of app theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const pinned = renderSmilesSvg(ASPIRIN, defaults({ theme: "light" }));
    expect(pinned).toContain('stroke="#222222"');
    expect(pinned).not.toContain('stroke="#ffffff"');
  });
});

describe("renderSmilesFence", () => {
  it("wraps the structure in an aligned smiles-block", () => {
    const html = renderSmilesFence(ASPIRIN, defaults({ align: "left" }));
    expect(html).toMatch(/^<div class="smiles-block" data-align="left">/);
    expect(html).toContain("<svg");
    expect(html).not.toContain("smiles-error");
  });

  it("emits no fit marker or scroll wrapper by default (fitToWidth=true)", () => {
    const html = renderSmilesFence(ASPIRIN, defaults());
    expect(html).not.toContain("data-fit-to-width");
    expect(html).not.toContain("smiles-scroll-content");
  });

  it("adds the scroll wrapper and fit marker with fitToWidth=false", () => {
    const html = renderSmilesFence(
      ASPIRIN,
      defaults({ fitToWidth: false, align: "right" }),
    );
    expect(html).toMatch(
      /^<div class="smiles-block" data-align="right" data-fit-to-width="false">/,
    );
    expect(html).toMatch(/<div class="smiles-scroll-content"><svg/);
    // The svg must stay inside the scroll wrapper.
    expect(html).toMatch(/<\/svg><\/div><\/div>$/);
  });

  it("bakes the label font as presentation attributes (SVG CSS insurance)", () => {
    const html = renderSmilesFence(ASPIRIN, defaults());
    expect(html).toContain('font-family="Arial, Helvetica, sans-serif"');
  });

  it("renders an error block for unparseable SMILES", () => {
    const html = renderSmilesFence("not a smiles !!!", defaults());
    expect(html).toContain('class="smiles-block smiles-error-block"');
    expect(html).toContain("SMILES rendering failed");
    expect(html).toContain("not a smiles !!!");
  });

  it("escapes the source in the error block", () => {
    const html = renderSmilesFence("<b>&bad", defaults());
    expect(html).toContain("&lt;b&gt;&amp;bad");
    expect(html).not.toContain("<b>");
  });
});

describe("drawing options", () => {
  it("accepts the chemistry display toggles", () => {
    const svg = renderSmilesSvg(
      "CCO",
      defaults({
        atomVisualization: "balls",
        showCarbons: "all",
        explicitHydrogens: false,
        compactDrawing: false,
        isomeric: false,
      }),
    );
    expect(svg).toContain("<svg");
  });

  it("rejects unknown theme names back to the default", () => {
    const opts = resolveSmilesOptions({ theme: "neon" });
    expect(opts.theme).toBe("auto");
  });
});
