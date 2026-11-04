// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
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
