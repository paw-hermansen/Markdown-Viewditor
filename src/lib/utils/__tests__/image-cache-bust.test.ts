import { describe, expect, it } from "vitest";
import { bustImageCache } from "../image-cache-bust";

describe("bustImageCache", () => {
  it("busts markdown <img src> URLs", () => {
    const html = '<p><img src="https://x/a.png" alt="a"></p>';
    expect(bustImageCache(html, 7)).toBe(
      '<p><img src="https://x/a.png?_r=7" alt="a"></p>',
    );
  });

  it("busts SVG <image> href and xlink:href (vega image marks)", () => {
    const svg =
      '<svg><image xlink:href="localimg://localhost/%2Fa.png"></image>' +
      '<image href="https://x/b.png"></image></svg>';
    const out = bustImageCache(svg, 7);
    expect(out).toContain('xlink:href="localimg://localhost/%2Fa.png?_r=7"');
    expect(out).toContain('href="https://x/b.png?_r=7"');
  });

  it("leaves data: and blob: URLs untouched in both forms", () => {
    const html =
      '<img src="data:image/png;base64,AA">' +
      '<image href="data:image/png;base64,AA"></image>';
    expect(bustImageCache(html, 7)).toBe(html);
  });

  it("appends with & when the URL already has a query string", () => {
    const html = '<img src="https://x/a.png?w=1">';
    expect(bustImageCache(html, 7)).toContain("https://x/a.png?w=1&_r=7");
  });
});
