// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  pinSvgDimensions,
  renderVegaLiteSpec,
  validateSpecInlineOnly,
} from "../render-core";
import { INLINE_ONLY_DATA_MESSAGE } from "../loader";
import { resolveVegaLiteOptions } from "../schema";

describe("validateSpecInlineOnly", () => {
  const inlineSpec = {
    data: { values: [{ x: 1, y: 2 }] },
    mark: "point",
    encoding: { x: { field: "x" }, y: { field: "y" } },
  };

  it("accepts inline values and inline generators", () => {
    expect(() => validateSpecInlineOnly(inlineSpec)).not.toThrow();
    expect(() =>
      validateSpecInlineOnly({
        data: { sequence: { start: 0, stop: 10, step: 1 } },
      }),
    ).not.toThrow();
  });

  it("rejects data.url at any nesting level", () => {
    for (const spec of [
      { data: { url: "https://example.com/d.csv" } },
      { layer: [{ data: { url: "d.csv" }, mark: "line" }] },
      {
        facet: {
          data: { url: "file:///etc/passwd" },
          facet: { field: "f" },
          spec: { mark: "point" },
        },
      },
      { vconcat: [{ hconcat: [{ data: { url: "data:x" } }] }] },
    ]) {
      expect(() => validateSpecInlineOnly(spec)).toThrow(
        INLINE_ONLY_DATA_MESSAGE,
      );
    }
  });
});

describe("pinSvgDimensions", () => {
  function parse(svg: string): SVGSVGElement {
    return new DOMParser().parseFromString(svg, "image/svg+xml")
      .documentElement as unknown as SVGSVGElement;
  }

  it("fills missing width/height attributes from the viewBox", () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"></svg>',
    );
    pinSvgDimensions(root);
    expect(root.getAttribute("width")).toBe("320");
    expect(root.getAttribute("height")).toBe("200");
  });

  it("keeps existing numeric dimensions", () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="377" height="247"></svg>',
    );
    pinSvgDimensions(root);
    expect(root.getAttribute("width")).toBe("377");
    expect(root.getAttribute("height")).toBe("247");
  });
});

describe("renderVegaLiteSpec (integration, real vega)", () => {
  const options = resolveVegaLiteOptions({});

  it("renders an inline spec to a standalone attribute-painted SVG", async () => {
    const { svg } = await renderVegaLiteSpec(
      {
        data: {
          values: [
            { x: 1, y: 2 },
            { x: 2, y: 4 },
          ],
        },
        mark: { type: "line", interpolate: "monotone" },
        encoding: {
          x: { field: "x", type: "quantitative" },
          y: { field: "y", type: "quantitative" },
        },
        width: 120,
        height: 80,
      },
      options,
    );
    expect(svg).toContain("<svg");
    // Export contract: root dimensions, no <style> block (attribute paint).
    expect(svg).toMatch(/<svg[^>]*\bwidth="[\d.]+"/);
    expect(svg).toMatch(/<svg[^>]*\bheight="[\d.]+"/);
    expect(svg).not.toContain("<style");
  });

  it("rejects url-based data with the inline-only message", async () => {
    await expect(
      renderVegaLiteSpec(
        { data: { url: "https://example.com/d.csv" }, mark: "point" },
        options,
      ),
    ).rejects.toThrow(INLINE_ONLY_DATA_MESSAGE);
  });

  it("renders regression and loess layers (the trend-line feature)", async () => {
    const { svg } = await renderVegaLiteSpec(
      {
        data: {
          values: [
            { x: 1, y: 2 },
            { x: 2, y: 3 },
            { x: 3, y: 5 },
          ],
        },
        layer: [
          {
            transform: [{ regression: "y", on: "x", method: "linear" }],
            mark: "line",
            encoding: {
              x: { field: "x", type: "quantitative" },
              y: { field: "y", type: "quantitative" },
            },
          },
          {
            transform: [{ loess: "y", on: "x" }],
            mark: "line",
            encoding: {
              x: { field: "x", type: "quantitative" },
              y: { field: "y", type: "quantitative" },
            },
          },
        ],
        width: 100,
        height: 100,
      },
      options,
    );
    expect(svg).toContain("<svg");
  });
});
