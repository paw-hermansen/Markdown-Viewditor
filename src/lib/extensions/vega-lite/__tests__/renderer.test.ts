// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", async () => {
  const { tauriCoreMock } = await import("../../../../test/mocks/tauri-core");
  return tauriCoreMock();
});

import { invoke } from "@tauri-apps/api/core";
import {
  clearVegaLiteCache,
  parseVegaLiteSpec,
  preRenderVegaLiteBlocks,
  renderVegaLiteFence,
} from "../renderer";
import { VEGA_LITE_OPTIONS_SCHEMA } from "../schema";

const SPEC = JSON.stringify({
  data: {
    values: [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ],
  },
  mark: "line",
  encoding: {
    x: { field: "x", type: "quantitative" },
    y: { field: "y", type: "quantitative" },
  },
  width: 120,
  height: 80,
});

function fence(content: string, info = "vega-lite") {
  return { type: "fence", info, content, map: [0, 5] };
}

beforeEach(() => {
  clearVegaLiteCache();
});

describe("parseVegaLiteSpec", () => {
  it("returns the parsed object for valid JSON", () => {
    expect(parseVegaLiteSpec('{"a": 1}')).toEqual({ a: 1 });
  });

  it("maps parse errors to content-relative line/column", () => {
    try {
      parseVegaLiteSpec('{\n  "a": 1,\n  "b": }\n');
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("Invalid JSON");
      expect(message).toMatch(/\(line \d+, column \d+\)/);
    }
  });
});

describe("pre-render cache + renderVegaLiteFence", () => {
  it("renders a fence to wrapper HTML from the cache", async () => {
    const env: Record<string, unknown> = {};
    await preRenderVegaLiteBlocks([fence(SPEC)], env, VEGA_LITE_OPTIONS_SCHEMA);

    // Theme snapshot is taken exactly once, into the env (mermaid contract).
    expect(env.vegaLiteAppTheme).toBeDefined();

    const html = renderVegaLiteFence(SPEC, {}, env);
    expect(html).toContain('class="vega-lite-block"');
    expect(html).toContain('data-align="center"');
    expect(html).toContain("<svg");
    expect(html).not.toContain("vega-lite-error-block");
  });

  it("honors align and fitToWidth=false wrapper shape", async () => {
    const env: Record<string, unknown> = {};
    await preRenderVegaLiteBlocks([fence(SPEC)], env, VEGA_LITE_OPTIONS_SCHEMA);
    const html = renderVegaLiteFence(
      SPEC,
      { align: "left", fitToWidth: false },
      env,
    );
    expect(html).toContain('data-align="left"');
    expect(html).toContain('data-fit-to-width="false"');
    expect(html).toContain('class="vega-lite-scroll-content"');
  });

  it("renders a per-block error entry for invalid JSON with position", async () => {
    const env: Record<string, unknown> = {};
    const bad = '{\n  "mark": }\n';
    await preRenderVegaLiteBlocks([fence(bad)], env, VEGA_LITE_OPTIONS_SCHEMA);
    const html = renderVegaLiteFence(bad, {}, env);
    expect(html).toContain("vega-lite-error-block");
    expect(html).toContain("Invalid JSON");
    expect(html).toContain("&quot;mark&quot;"); // escaped source
  });

  it("renders a per-block error entry for url-based data", async () => {
    const env: Record<string, unknown> = {};
    const remote = JSON.stringify({ data: { url: "https://x/d.csv" } });
    await preRenderVegaLiteBlocks(
      [fence(remote)],
      env,
      VEGA_LITE_OPTIONS_SCHEMA,
    );
    const html = renderVegaLiteFence(remote, {}, env);
    expect(html).toContain("vega-lite-error-block");
    expect(html).toContain("inline data only");
  });

  it("keeps one bad fence from poisoning the others (per-fence errors)", async () => {
    const env: Record<string, unknown> = {};
    await preRenderVegaLiteBlocks(
      [fence("{oops"), fence(SPEC)],
      env,
      VEGA_LITE_OPTIONS_SCHEMA,
    );
    expect(renderVegaLiteFence("{oops", {}, env)).toContain(
      "vega-lite-error-block",
    );
    expect(renderVegaLiteFence(SPEC, {}, env)).toContain("<svg");
  });

  it("degrades a cache miss to an error block", () => {
    const html = renderVegaLiteFence(SPEC, {}, {});
    expect(html).toContain("vega-lite-error-block");
    expect(html).toContain("cache miss");
  });

  it("is sensitive to the theme in the cache key", async () => {
    const env: Record<string, unknown> = {};
    await preRenderVegaLiteBlocks([fence(SPEC)], env, VEGA_LITE_OPTIONS_SCHEMA);
    // Forcing a theme the pre-render did not use must miss the cache.
    const html = renderVegaLiteFence(SPEC, { theme: "dark" }, env);
    expect(html).toContain("cache miss");
  });
});

describe("image marks end-to-end (local image round-trip bug)", () => {
  const IMG_SPEC = JSON.stringify({
    data: { values: [{ x: 40, u: "square.png" }] },
    mark: { type: "image", width: 60, height: 60 },
    encoding: {
      x: { field: "x", type: "quantitative" },
      y: { datum: 0 },
      url: { field: "u", type: "nominal" },
    },
    width: 300,
    height: 100,
  });

  // jsdom never fires image load/error events; vega's preloader would hang.
  // The fake stores and returns `src` — vega's SVG writer emits the loaded
  // element's `src` readback as xlink:href.
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin: string | null = null;
    width = 60;
    height = 60;
    private _src = "";
    get src() {
      return this._src;
    }
    set src(v: string) {
      this._src = v;
      queueMicrotask(() => this.onload?.());
    }
  }
  const realImage = (globalThis as { Image?: unknown }).Image;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
  });

  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = realImage;
    vi.mocked(invoke).mockReset();
  });

  it("inlines local image paths to data: URIs in the rendered SVG", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === "read_file_as_base64" ? "QUJD" : undefined,
    );
    const env: Record<string, unknown> = { filePath: "/home/docs/notes.md" };
    await preRenderVegaLiteBlocks(
      [fence(IMG_SPEC)],
      env,
      VEGA_LITE_OPTIONS_SCHEMA,
    );
    const html = renderVegaLiteFence(IMG_SPEC, {}, env);
    expect(html).toContain("<image");
    expect(html).toContain("data:image/png;base64,QUJD");
    expect(html).not.toContain("localimg://");
    expect(html).not.toContain("vega-lite-warn-msg");
  });

  it("shows a warning under the chart when an image file cannot be read", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no such file"));
    const env: Record<string, unknown> = { filePath: "/home/docs/notes.md" };
    await preRenderVegaLiteBlocks(
      [fence(IMG_SPEC)],
      env,
      VEGA_LITE_OPTIONS_SCHEMA,
    );
    const html = renderVegaLiteFence(IMG_SPEC, {}, env);
    expect(html).toContain("vega-lite-warn-msg");
    expect(html).toContain("could not be loaded");
    expect(html).toContain("<svg"); // the chart still renders
  });
});
