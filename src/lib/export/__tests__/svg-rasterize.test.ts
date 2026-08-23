// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Minimal valid PNG (a 1×1 transparent pixel).
const PNG_BYTES = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
];

// Mock Tauri core to a controlled stub. The mock returns the PNG bytes
// unless overridden in a specific test.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => PNG_BYTES),
}));

// Pull in the mocked invoke for inspection per test.
import { invoke } from "@tauri-apps/api/core";
const invokeMock = vi.mocked(invoke);

// jsdom doesn't expose OffscreenCanvas. Provide a minimal mock so the
// WebView fallback (used when the Rust path throws) can be exercised.
class FakeOffscreenCanvas {
  width: number;
  height: number;
  private ctx = { drawImage: () => undefined };
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): { drawImage: () => void } {
    return this.ctx;
  }
  async convertToBlob(): Promise<Blob> {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    return new Blob([pngBytes], { type: "image/png" });
  }
}

if (
  typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas ===
  "undefined"
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).OffscreenCanvas = FakeOffscreenCanvas;
}

import { rasterizeSvg, MAX_RASTER_AXIS_PX } from "../svg-rasterize";

interface FakeImage {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

class FakeImageCtor implements FakeImage {
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

function makeImageCtor(): new () => FakeImage {
  return function FakeImage() {
    const inst = new FakeImageCtor();
    Object.defineProperty(inst, "src", {
      set() {
        setTimeout(() => inst.onload?.(), 0);
      },
      get() {
        return "";
      },
    });
    return inst;
  } as unknown as new () => FakeImage;
}

function makeFailingImageCtor(): new () => FakeImage {
  return function FailingImage() {
    const inst = new FakeImageCtor();
    Object.defineProperty(inst, "src", {
      set() {
        setTimeout(() => inst.onerror?.(), 0);
      },
      get() {
        return "";
      },
    });
    return inst;
  } as unknown as new () => FakeImage;
}

describe("rasterizeSvg (Linux path: invoke resvg)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(PNG_BYTES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = makeImageCtor();
    // Suppress the expected "resvg failed, trying WebView fallback"
    // console.warn from tests that intentionally trigger the fallback.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid dimensions", async () => {
    await expect(rasterizeSvg("<svg/>", 0, 10, 1)).rejects.toThrow(/widthPx/);
    await expect(rasterizeSvg("<svg/>", 10, -1, 1)).rejects.toThrow(/heightPx/);
    await expect(rasterizeSvg("<svg/>", 10, 10, 0)).rejects.toThrow(/scale/);
  });

  it("rejects oversized raster", async () => {
    const bigW = MAX_RASTER_AXIS_PX + 1;
    await expect(rasterizeSvg("<svg/>", bigW, 10, 1)).rejects.toThrow(
      /exceeds/,
    );
  });

  it("invokes the Rust resvg command on Linux", async () => {
    const svg =
      '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="32" height="32" fill="red"/></svg>';
    const png = await rasterizeSvg(svg, 32, 32, 1);
    expect(invoke).toHaveBeenCalledWith(
      "rasterize_svg",
      expect.objectContaining({ width: 32, height: 32, scale: 1 }),
    );
    expect(png[0]).toBe(0x89);
  });

  it("injects xmlns and xlink namespaces before invoking when missing", async () => {
    const svg =
      '<svg width="150" height="60" viewBox="0 30 100 40">' +
      '<animate xlink:href="#x"/></svg>';
    await rasterizeSvg(svg, 150, 60, 1);
    const sentSvg = (invokeMock.mock.calls[0]?.[1] as { svg: string }).svg;
    expect(sentSvg).toMatch(/\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(sentSvg).toMatch(
      /\bxmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/,
    );
  });

  it("does not duplicate existing xmlns declarations", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="32" height="32"><rect width="32" height="32" fill="red"/></svg>';
    await rasterizeSvg(svg, 32, 32, 1);
    const sentSvg = (invokeMock.mock.calls[0]?.[1] as { svg: string }).svg;
    // The header <svg ...> must contain exactly one xmlns= and one
    // xmlns:xlink= (each existing once) — measured by counting "xmlns"
    // declarations inside the opening <svg> tag only.
    const openingTag = sentSvg.match(/^<svg[^>]*>/)?.[0] ?? "";
    expect((openingTag.match(/\bxmlns(?::xlink)?=/g) ?? []).length).toBe(2);
    // Each of width= / height= on the <svg> opening tag should appear
    // exactly once (our injected values, not duplicated from the input).
    expect((openingTag.match(/\swidth=/g) ?? []).length).toBe(1);
    expect((openingTag.match(/\sheight=/g) ?? []).length).toBe(1);
  });

  it("returns PNG bytes from invoke", async () => {
    const svg =
      '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="8" cy="8" r="6"/></svg>';
    const png = await rasterizeSvg(svg, 16, 16, 1);
    expect(png).toBeInstanceOf(Uint8Array);
    // PNG signature: 89 50 4E 47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it("falls back to the WebView path when invoke rejects", async () => {
    invokeMock.mockRejectedValueOnce(new Error("resvg parse failed"));
    const svg =
      '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="32" height="32" fill="green"/></svg>';
    const png = await rasterizeSvg(svg, 32, 32, 1);
    expect(png.length).toBeGreaterThan(0);
  });

  it("throws when invoke and the WebView fallback both fail", async () => {
    invokeMock.mockRejectedValueOnce(new Error("resvg parse failed"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = makeFailingImageCtor();
    const svg =
      '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="32" height="32" fill="green"/></svg>';
    await expect(rasterizeSvg(svg, 32, 32, 1)).rejects.toThrow(
      /failed to load/,
    );
  });
});

describe("rasterizeSvg (non-Linux path: WebView Image)", () => {
  let originalUserAgent: string;

  beforeEach(() => {
    originalUserAgent = navigator.userAgent;
    // Pretend we're running on macOS so the IS_LINUX guard short-circuits.
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      configurable: true,
    });
    invokeMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = makeImageCtor();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("does not call invoke on non-Linux", async () => {
    const svg =
      '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="32" height="32" fill="red"/></svg>';
    await rasterizeSvg(svg, 32, 32, 1);
    expect(invoke).not.toHaveBeenCalled();
  });
});
