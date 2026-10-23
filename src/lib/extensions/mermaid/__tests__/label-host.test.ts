// @vitest-environment jsdom
/**
 * The shared label-host harness. What is under test is the host contract
 * itself — the font-size pin surviving the viewer font context (the B2
 * regression), the label-host rules being present during measurement and
 * gone afterwards, and the font gate ordering — since both label passes
 * rely on it and neither can see its own host from the outside.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { naturalSvgWidth, round3, withLabelHost } from "../label-host";
import {
  LABEL_HOST_CLASS,
  LABEL_HOST_RULES,
  MERMAID_FONT_SIZE,
} from "../styles";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" style="max-width: 300px;">' +
  '<foreignObject width="100" height="40">' +
  '<div xmlns="http://www.w3.org/1999/xhtml" class="label">hi</div>' +
  "</foreignObject></svg>";

const hostOf = (svgEl: SVGSVGElement): HTMLElement => {
  const host = svgEl.parentElement;
  if (!host) throw new Error("no host");
  return host;
};

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

describe("withLabelHost", () => {
  it("pins the host font size even when the viewer context is smaller", async () => {
    // The B2 regression: copying the viewer's computed font-size over the
    // pin silently rasterizes/measures every label at 14px instead of
    // MERMAID_FONT_SIZE. Family and colour come from the viewer; the size
    // is always ours.
    const viewer = document.createElement("div");
    viewer.id = "viewer-content";
    viewer.style.fontSize = "14px";
    viewer.style.fontFamily = "serif";
    viewer.style.color = "rgb(1, 2, 3)";
    document.body.appendChild(viewer);

    await withLabelHost(SVG, async (svgEl) => {
      const cs = getComputedStyle(hostOf(svgEl));
      expect(cs.fontSize).toBe(MERMAID_FONT_SIZE);
      expect(cs.fontFamily).toBe("serif");
      expect(cs.color).toBe("rgb(1, 2, 3)");
      return false;
    });
  });

  it("keeps the font-size pin when no viewer element exists", async () => {
    await withLabelHost(SVG, async (svgEl) => {
      expect(getComputedStyle(hostOf(svgEl)).fontSize).toBe(MERMAID_FONT_SIZE);
      return false;
    });
  });

  it("carries the label-host class and rules during the body, and cleans up", async () => {
    await withLabelHost(SVG, async (svgEl) => {
      const host = document.querySelector(`.${LABEL_HOST_CLASS}`);
      expect(host).toBe(hostOf(svgEl));
      expect(
        Array.from(document.head.querySelectorAll("style")).some((s) =>
          (s.textContent ?? "").includes(LABEL_HOST_RULES),
        ),
      ).toBe(true);
      return false;
    });

    expect(document.querySelector(`.${LABEL_HOST_CLASS}`)).toBeNull();
    expect(document.head.textContent).not.toContain(LABEL_HOST_RULES);
    expect(document.body.textContent).not.toContain("hi");
  });

  it("cleans up when the body throws", async () => {
    await expect(
      withLabelHost(SVG, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(document.querySelector(`.${LABEL_HOST_CLASS}`)).toBeNull();
    expect(document.head.textContent).not.toContain(LABEL_HOST_RULES);
  });

  it("returns the changed markup only when the body reports a change", async () => {
    const unchanged = await withLabelHost(SVG, async (svgEl) => {
      svgEl.setAttribute("data-touched", "1");
      return false;
    });
    expect(unchanged).toBe(SVG);

    const changed = await withLabelHost(SVG, async (svgEl) => {
      svgEl.setAttribute("data-touched", "1");
      return true;
    });
    expect(changed).not.toBe(SVG);
    expect(changed).toContain('data-touched="1"');
  });

  it("awaits the font gate before running the body", async () => {
    const order: string[] = [];
    await withLabelHost(
      SVG,
      async () => {
        order.push("body");
        return false;
      },
      {
        loadFonts: async () => {
          order.push("fonts");
        },
      },
    );

    expect(order).toEqual(["fonts", "body"]);
  });

  it("never runs the body when the markup has no svg", async () => {
    const markup = "<div>not an svg</div>";
    const out = await withLabelHost(markup, async () => {
      throw new Error("body must not run");
    });
    expect(out).toBe(markup);
  });
});

describe("naturalSvgWidth", () => {
  it("prefers the Mermaid max-width style", () => {
    expect(naturalSvgWidth(SVG)).toBe(300);
  });

  it("falls back to the viewBox width", () => {
    expect(
      naturalSvgWidth(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><g/></svg>',
      ),
    ).toBe(100);
  });

  it("falls back to 2000 when neither is usable", () => {
    expect(naturalSvgWidth("<svg></svg>")).toBe(2000);
  });
});

describe("round3", () => {
  it("rounds to three decimals", () => {
    expect(round3(18.800000000000004)).toBe(18.8);
    expect(round3(1.23456)).toBe(1.235);
  });
});
