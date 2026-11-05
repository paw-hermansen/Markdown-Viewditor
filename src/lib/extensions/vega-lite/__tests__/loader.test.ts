// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async () => {
  const { tauriCoreMock } = await import("../../../../test/mocks/tauri-core");
  return tauriCoreMock();
});

import { invoke } from "@tauri-apps/api/core";
import {
  createVegaLoader,
  INLINE_ONLY_DATA_MESSAGE,
  inlineOnlyLoader,
} from "../loader";

const BASE = "/home/devel/docs/notes.md";

beforeEach(() => {
  vi.clearAllMocks();
});

function stubInvoke(base64 = "QUJD") {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "read_file_as_base64") return base64;
    return undefined;
  });
}

describe("inline-only data policy", () => {
  it("rejects every load with the inline-only message", async () => {
    await expect(inlineOnlyLoader.load()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
    await expect(inlineOnlyLoader.http()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
    await expect(inlineOnlyLoader.file()).rejects.toThrow(
      INLINE_ONLY_DATA_MESSAGE,
    );
  });
});

describe("createVegaLoader().sanitize", () => {
  it("passes remote and inline hrefs through untouched", async () => {
    const loader = createVegaLoader();
    for (const href of [
      "https://example.com/pic.png",
      "http://example.com/pic.png",
      "data:image/png;base64,AA",
      "blob:http://x/y",
    ]) {
      await expect(loader.sanitize(href)).resolves.toEqual({ href });
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("inlines local image paths to data: URIs (custom-scheme round-trip fix)", async () => {
    stubInvoke("QUJD");
    const loader = createVegaLoader({ baseFile: BASE });
    const result = await loader.sanitize("square.png");
    // The data: URI round-trips through vega's `img.src` readback and needs
    // no CORS — a localimg:// href would be dropped there (broken-image bug).
    expect(result).toEqual({
      href: "data:image/png;base64,QUJD",
      crossOrigin: null,
    });
  });

  it("inlines already-resolved localimg/asset hrefs too", async () => {
    stubInvoke("QUJD");
    const loader = createVegaLoader();
    const result = await loader.sanitize(
      "localimg://localhost/%2Fhome%2Fa%2Fpic.png",
    );
    expect(result.href).toBe("data:image/png;base64,QUJD");
  });

  it("records a warning and falls back to the resolved URL when the file cannot be read", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no such file"));
    const warnings: string[] = [];
    const loader = createVegaLoader({ baseFile: BASE, warnings });
    const result = await loader.sanitize("square.png");
    expect(result.href).toMatch(/^localimg:\/\/localhost\//);
    expect(warnings.some((w) => w.includes("could not be loaded"))).toBe(true);
  });

  it("leaves unresolvable hrefs alone when no base file is known", async () => {
    const loader = createVegaLoader();
    await expect(loader.sanitize("square.png")).resolves.toEqual({
      href: "square.png",
      crossOrigin: null,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});
