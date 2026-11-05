// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async () => {
  const { tauriCoreMock } = await import("../../../../test/mocks/tauri-core");
  return tauriCoreMock();
});

import { convertFileSrcStub } from "../../../../test/mocks/tauri-core";
import { resolveImageHref, rewriteImageHrefs } from "../image-hrefs";

const BASE = "/home/user/docs/notes.md";

describe("resolveImageHref", () => {
  it("passes remote, data, and already-resolved srcs through unchanged", () => {
    for (const href of [
      "https://example.com/pic.png",
      "http://example.com/pic.png",
      "data:image/png;base64,AA",
      "blob:http://x/y",
      "localimg://localhost/%2Fhome%2Fa.png",
      "asset://localhost/%2Fhome%2Fb.png",
    ]) {
      expect(resolveImageHref(href, BASE)).toBe(href);
    }
  });

  it("resolves absolute local paths through the localimg protocol", () => {
    expect(resolveImageHref("/home/user/pics/local.png", BASE)).toBe(
      convertFileSrcStub("/home/user/pics/local.png", "localimg"),
    );
  });

  it("resolves relative paths against the document file", () => {
    expect(resolveImageHref("pics/local.png", BASE)).toBe(
      convertFileSrcStub("/home/user/docs/pics/local.png", "localimg"),
    );
  });

  it("treats file:// URLs as local paths", () => {
    expect(resolveImageHref("file:///home/user/pic.png", BASE)).toBe(
      convertFileSrcStub("/home/user/pic.png", "localimg"),
    );
    // file:///C:/x arrives as "/C:/x" — the drive-letter slash is dropped.
    expect(resolveImageHref("file:///C:/Users/x.png", BASE)).toBe(
      convertFileSrcStub("C:/Users/x.png", "localimg"),
    );
  });

  it("leaves unknown hrefs alone when no file is open", () => {
    expect(resolveImageHref("pics/local.png", null)).toBe("pics/local.png");
  });
});

describe("rewriteImageHrefs", () => {
  function parse(svg: string): SVGSVGElement {
    return new DOMParser().parseFromString(svg, "image/svg+xml")
      .documentElement as unknown as SVGSVGElement;
  }

  it("rewrites both href and xlink:href on <image> elements", () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<image xlink:href="/home/user/a.png"></image>' +
        '<image href="pics/b.png"></image>' +
        '<image xlink:href="https://example.com/c.png"></image>' +
        "</svg>",
    );
    rewriteImageHrefs(root, BASE);
    const images = [...root.querySelectorAll("image")];
    expect(images[0].getAttribute("xlink:href")).toBe(
      convertFileSrcStub("/home/user/a.png", "localimg"),
    );
    expect(images[1].getAttribute("href")).toBe(
      convertFileSrcStub("/home/user/docs/pics/b.png", "localimg"),
    );
    expect(images[2].getAttribute("xlink:href")).toBe(
      "https://example.com/c.png",
    );
  });
});
