import { describe, it, expect } from "vitest";
import {
  extractLocalImgPath,
  extensionFromMime,
  mimeFromHref,
} from "../image-src";

describe("extractLocalImgPath", () => {
  it.each([
    ["localimg://localhost/", "localimg://localhost/tmp/a%20b.png"],
    ["http://localimg.localhost/", "http://localimg.localhost/tmp/a.png"],
    ["asset://localhost/", "asset://localhost/tmp/a.png"],
    ["http://asset.localhost/", "http://asset.localhost/tmp/a.png"],
  ])("recognizes %s", (prefix, src) => {
    expect(extractLocalImgPath(src)).toBe(
      decodeURIComponent(src.slice(prefix.length)),
    );
  });

  it("URL-decodes the path", () => {
    // Tauri's convertFileSrc percent-encodes the whole path, so the leading
    // slash of an absolute path arrives inside the encoded segment.
    const src = `localimg://localhost/${encodeURIComponent("/tmp/my pic.png")}`;
    expect(extractLocalImgPath(src)).toBe("/tmp/my pic.png");
  });

  it("returns null for anything else", () => {
    for (const src of [
      "https://example.com/x.png",
      "data:image/png;base64,AAA",
      "./relative.png",
      "/absolute.png",
      "",
    ]) {
      expect(extractLocalImgPath(src)).toBeNull();
    }
  });
});

describe("mimeFromHref", () => {
  it("maps image extensions", () => {
    expect(mimeFromHref("a.png")).toBe("image/png");
    expect(mimeFromHref("a.jpg")).toBe("image/jpeg");
    expect(mimeFromHref("a.jpeg")).toBe("image/jpeg");
    expect(mimeFromHref("a.gif")).toBe("image/gif");
    expect(mimeFromHref("a.svg")).toBe("image/svg+xml");
    expect(mimeFromHref("a.webp")).toBe("image/webp");
  });

  it("maps font extensions", () => {
    // The export pipeline inlines these alongside images; the ODT copy of
    // this function used to miss them and fall through to octet-stream.
    expect(mimeFromHref("KaTeX_Main-Regular.woff2")).toBe("font/woff2");
    expect(mimeFromHref("KaTeX_Main-Regular.woff")).toBe("font/woff");
    expect(mimeFromHref("KaTeX_Main-Regular.ttf")).toBe("font/ttf");
  });

  it("is case-insensitive on the extension", () => {
    expect(mimeFromHref("a.PNG")).toBe("image/png");
    expect(mimeFromHref("a.WOFF2")).toBe("font/woff2");
  });

  it("falls back to octet-stream for unknown and missing extensions", () => {
    expect(mimeFromHref("a.unknown")).toBe("application/octet-stream");
    expect(mimeFromHref("noextension")).toBe("application/octet-stream");
    expect(mimeFromHref("")).toBe("application/octet-stream");
  });
});

describe("extensionFromMime", () => {
  it("maps image MIME types to packaged extensions", () => {
    expect(extensionFromMime("image/png")).toBe("png");
    expect(extensionFromMime("image/jpeg")).toBe("jpg");
    expect(extensionFromMime("image/gif")).toBe("gif");
    expect(extensionFromMime("image/svg+xml")).toBe("svg");
    expect(extensionFromMime("image/webp")).toBe("webp");
  });

  it("falls back to .bin for anything else", () => {
    expect(extensionFromMime("font/woff2")).toBe("bin");
    expect(extensionFromMime("application/octet-stream")).toBe("bin");
    expect(extensionFromMime("")).toBe("bin");
  });

  it("round-trips every image type mimeFromHref produces", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "svg", "webp"]) {
      const mime = mimeFromHref(`a.${ext}`);
      expect(extensionFromMime(mime)).toBe(ext === "jpeg" ? "jpg" : ext);
    }
  });
});
