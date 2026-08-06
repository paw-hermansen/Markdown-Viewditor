import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { inlineCssAssets, inlineImages } from "../assets";

function mockFetch(
  responses: Record<
    string,
    { ok: boolean; status?: number; body?: Uint8Array; mime?: string }
  >,
) {
  return vi.fn(async (url: string) => {
    const r = responses[url];
    if (!r) {
      return {
        ok: false,
        status: 404,
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status ?? 500,
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const headers = new Map<string, string>();
    if (r.mime) headers.set("content-type", r.mime);
    return {
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => r.body!.buffer,
    };
  }) as unknown as typeof fetch;
}

describe("inlineCssAssets", () => {
  it("inlines a same-origin url() font to a data URI", async () => {
    const css = '@font-face{src:url(fonts/Foo.woff2) format("woff2")}';
    const fontBytes = new Uint8Array([0x77, 0x6f, 0x66, 0x32]); // "wof2"
    const fetchImpl = mockFetch({
      "fonts/Foo.woff2": { ok: true, body: fontBytes, mime: "font/woff2" },
    });
    const { value, warnings } = await inlineCssAssets(css, fetchImpl);
    expect(warnings).toEqual([]);
    expect(value).toContain("data:font/woff2;base64,");
    expect(value).not.toContain("fonts/Foo.woff2");
  });

  it("leaves absolute https URLs untouched", async () => {
    const css = "body{background:url(https://example.com/bg.png)}";
    const fetchImpl = mockFetch({});
    const { value, warnings } = await inlineCssAssets(css, fetchImpl);
    expect(value).toBe(css);
    expect(warnings).toEqual([]);
  });

  it("records a warning (not a throw) when a font fetch fails", async () => {
    const css = '@font-face{src:url(fonts/Missing.woff2) format("woff2")}';
    const fetchImpl = mockFetch({
      "fonts/Missing.woff2": { ok: false, status: 404 },
    });
    const { value, warnings } = await inlineCssAssets(css, fetchImpl);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Missing.woff2");
    // The original URL is left in place.
    expect(value).toContain("fonts/Missing.woff2");
  });

  it("deduplicates repeated font URLs", async () => {
    const css =
      "@font-face{src:url(fonts/Foo.woff2)}@font-face{src:url(fonts/Foo.woff2)}";
    const fontBytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;
    const { value } = await inlineCssAssets(css, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(value.match(/data:font\/woff2;base64,/g)!.length).toBe(2);
  });
});

describe("inlineImages", () => {
  it("inlines localimg:// srcs to data URIs", async () => {
    const html = '<img src="localimg://localhost/x.png" alt="x">';
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const fetchImpl = mockFetch({
      "localimg://localhost/x.png": {
        ok: true,
        body: imgBytes,
        mime: "image/png",
      },
    });
    const { value, warnings } = await inlineImages(html, fetchImpl);
    expect(warnings).toEqual([]);
    expect(value).toContain("data:image/png;base64,");
    expect(value).not.toContain("localimg://");
  });

  it("leaves https image srcs untouched", async () => {
    const html = '<img src="https://example.com/x.png" alt="x">';
    const fetchImpl = mockFetch({});
    const { value, warnings } = await inlineImages(html, fetchImpl);
    expect(value).toBe(html);
    expect(warnings).toEqual([]);
  });

  it("records a warning when an image fetch fails", async () => {
    const html = '<img src="localimg://localhost/broken.png" alt="x">';
    const fetchImpl = mockFetch({
      "localimg://localhost/broken.png": { ok: false, status: 500 },
    });
    const { value, warnings } = await inlineImages(html, fetchImpl);
    expect(warnings.length).toBe(1);
    expect(value).toContain("localimg://localhost/broken.png");
  });
});
