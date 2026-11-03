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

/** A long chain — several times wider than tall (the whitespace repro). */
const CHAIN = "Cc(C)cCCc(C)cccc(C)cccc(C)ccccc(C)cccc(C)cccc(C)CCcc(C)C";

const defaults = (
  over: Partial<SmilesRenderOptions> = {},
): SmilesRenderOptions => resolveSmilesOptions(over);

type Box = { x: number; y: number; w: number; h: number };

function svgAttrs(svg: string): {
  width: number;
  height: number;
  vb: Box;
  mask: Box;
} {
  const width = parseFloat(
    svg.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1] ?? "0",
  );
  const height = parseFloat(
    svg.match(/<svg[^>]*\bheight="([\d.]+)"/)?.[1] ?? "0",
  );
  const parts = (svg.match(/<svg[^>]*\bviewBox="([^"]+)"/)?.[1] ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(parseFloat);
  const maskTag = svg.match(/<mask\b[^>]*>/)?.[0] ?? "";
  const maskAttr = (name: string): number =>
    parseFloat(
      maskTag.match(new RegExp(`\\b${name}="([\\d.eE+-]+)"`))?.[1] ?? "NaN",
    );
  return {
    width,
    height,
    vb: { x: parts[0], y: parts[1], w: parts[2], h: parts[3] },
    mask: {
      x: maskAttr("x"),
      y: maskAttr("y"),
      w: maskAttr("width"),
      h: maskAttr("height"),
    },
  };
}

beforeAll(async () => {
  await ensureSmilesLoaded();
});

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("renderSmilesSvg size contract", () => {
  it("fits the box to the drawing's ink (never below the geometric bounds)", () => {
    const svg = renderSmilesSvg(ASPIRIN, defaults());
    const { width, height, vb, mask } = svgAttrs(svg);
    // Contract: the viewBox covers the library's pre-square drawing bounds
    // (the <mask> region) and grows only by the bounded safety pad — it
    // hugs the drawing without clipping. The display attributes follow it.
    expect(vb.w).toBeGreaterThan(0);
    expect(vb.x).toBeLessThanOrEqual(mask.x);
    expect(vb.y).toBeLessThanOrEqual(mask.y);
    expect(vb.x + vb.w).toBeGreaterThanOrEqual(mask.x + mask.w);
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(mask.y + mask.h);
    expect(vb.w).toBeLessThan(mask.w * 2);
    expect(vb.h).toBeLessThan(mask.h * 2);
    expect(width).toBe(Math.round(vb.w * 1));
    expect(height).toBe(Math.round(vb.h * 1));
  });

  it("expands the box to cover real ink (regression: clipped labels)", () => {
    // Real glyph ink extends past the library's estimates by a font- and
    // engine-dependent amount (the Windows/Linux clipping). Mock getBBox
    // to report ink overshooting the geometric bounds; the fitted box
    // must cover it.
    const proto = SVGSVGElement.prototype as unknown as {
      getBBox?: () => DOMRect;
    };
    const original = proto.getBBox;
    proto.getBBox = function (this: SVGSVGElement) {
      const m = this.querySelector("mask")!;
      const x = parseFloat(m.getAttribute("x")!);
      const y = parseFloat(m.getAttribute("y")!);
      const w = parseFloat(m.getAttribute("width")!);
      const h = parseFloat(m.getAttribute("height")!);
      // Ink overshooting the top edge by 10 user units.
      return { x, y: y - 10, width: w, height: h + 10 } as DOMRect;
    };
    try {
      const svg = renderSmilesSvg(ASPIRIN, defaults());
      const { vb, mask } = svgAttrs(svg);
      expect(vb.y).toBeLessThanOrEqual(mask.y - 10);
      expect(vb.y + vb.h).toBeGreaterThanOrEqual(mask.y + mask.h);
    } finally {
      if (original) proto.getBBox = original;
      else delete proto.getBBox;
    }
  });

  it("falls back to the padded geometric box when ink is unmeasurable", () => {
    const proto = SVGSVGElement.prototype as unknown as {
      getBBox?: () => DOMRect;
    };
    const original = proto.getBBox;
    proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    try {
      const svg = renderSmilesSvg(ASPIRIN, defaults());
      const { vb, mask } = svgAttrs(svg);
      expect(vb.x).toBeLessThan(mask.x);
      expect(vb.y).toBeLessThan(mask.y);
      expect(vb.x + vb.w).toBeGreaterThan(mask.x + mask.w);
      expect(vb.y + vb.h).toBeGreaterThan(mask.y + mask.h);
    } finally {
      if (original) proto.getBBox = original;
      else delete proto.getBBox;
    }
  });

  it("keeps elongated molecules elongated (regression: square-box whitespace)", () => {
    // The library's scale-0 draw squares the viewBox, which used to inflate
    // long chains into huge square boxes: half a screen of empty space above
    // and below the drawing, with the scroll host's scrollbar below that.
    const { vb } = svgAttrs(renderSmilesSvg(CHAIN, defaults()));
    expect(vb.w).toBeGreaterThan(vb.h * 2);
  });

  it("scale=1.5 renders at 150% (width/height attributes only, viewBox untouched)", () => {
    const natural = svgAttrs(renderSmilesSvg(ASPIRIN, defaults()));
    const scaled = svgAttrs(renderSmilesSvg(ASPIRIN, defaults({ scale: 1.5 })));
    expect(scaled.vb).toEqual(natural.vb);
    expect(scaled.width).toBe(Math.round(natural.vb.w * 1.5));
    expect(scaled.height).toBe(Math.round(natural.vb.h * 1.5));
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
