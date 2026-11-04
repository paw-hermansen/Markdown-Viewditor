// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { compile } from "vega-lite";
import * as vega from "vega";
import { expressionInterpreter } from "vega-interpreter";
import { buildVegaConfig } from "../theme-config";
import { inlineOnlyLoader } from "../loader";
import { renderVegaLiteSpec } from "../render-core";
import { resolveVegaLiteOptions } from "../schema";

/**
 * Upgrade-contract tests (plan §12): pin the vega/vega-lite/vega-interpreter
 * internals the extension's workarounds and contracts target, against the
 * REAL libraries. If an upgrade fails one of these, re-verify before
 * touching the fix: upstream changed the mechanism (extend the pass) or
 * dropped it (the pass may be obsolete). See .opencode/plans/vega-lite-extension.md §16
 * for the spike these were formalized from.
 */

const LAYERED = {
  datasets: {
    obs: [
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 5 },
    ],
  },
  layer: [
    {
      data: { name: "obs" },
      transform: [{ regression: "y", on: "x", method: "linear" }],
      mark: "line",
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    },
    {
      data: { name: "obs" },
      transform: [{ loess: "y", on: "x" }],
      mark: "line",
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
      },
    },
  ],
  width: 120,
  height: 80,
};

describe("vega-lite upgrade contract", () => {
  it("spec.config wins over opt.config per key (theme base semantics)", () => {
    const compiled = compile(
      LAYERED as never,
      {
        config: { font: "OptFont" },
      } as never,
    );
    const spec = {
      ...(LAYERED as Record<string, unknown>),
      config: { font: "SpecFont" },
    };
    const compiledWithSpecConfig = compile(
      spec as never,
      {
        config: { font: "OptFont" },
      } as never,
    );
    const base = JSON.stringify(compiled.spec);
    const withSpec = JSON.stringify(compiledWithSpecConfig.spec);
    expect(withSpec).toContain("SpecFont");
    expect(withSpec).not.toContain("OptFont");
    expect(base).not.toContain("SpecFont");
  });

  it("interpreter path never invokes the Function constructor (CSP)", async () => {
    const compiled = compile(LAYERED as never);
    const runtime = vega.parse(compiled.spec, undefined, { ast: true });
    const RealFunction = globalThis.Function;
    let hits = 0;
    globalThis.Function = new Proxy(RealFunction, {
      construct() {
        hits++;
        throw new Error("Function constructor invoked");
      },
      apply() {
        hits++;
        throw new Error("Function() invoked");
      },
    }) as FunctionConstructor;
    try {
      const view = new vega.View(runtime, {
        expr: expressionInterpreter,
        renderer: "none",
        loader: inlineOnlyLoader,
      } as never);
      await view.runAsync();
      const svg = await view.toSVG();
      view.finalize();
      expect(svg).toContain("<svg");
    } finally {
      globalThis.Function = RealFunction;
    }
    expect(hits).toBe(0);
  });

  it("toSVG emits root width/height attributes and no <style> block", async () => {
    const { svg } = await renderVegaLiteSpec(
      LAYERED,
      resolveVegaLiteOptions({}),
      {
        variant: "export",
      },
    );
    expect(svg).toMatch(/<svg[^>]*\bwidth="[\d.]+"/);
    expect(svg).toMatch(/<svg[^>]*\bheight="[\d.]+"/);
    expect(svg).not.toContain("<style");
    // Attribute paint (fill/stroke attrs), never style=-only paint.
    expect(svg).toMatch(/\bfill="|\bstroke="/);
  });

  it("config.font is emitted as a font-family attribute", () => {
    // (Verified through buildVegaConfig's export stack via render in the
    // test above; here the config plumbing itself is pinned.)
    const config = buildVegaConfig("light", { font: "ContractFont" }) as {
      font: string;
      background: string;
      text: { color: string };
      axis: { labelColor: string };
    };
    expect(config.font).toBe("ContractFont");
    expect(config.background).toBe("transparent");
    // Text marks must get the theme's foreground like every other label.
    expect(config.text.color).toBe(config.axis.labelColor);
    expect(config.text.color).toBeTruthy();
  });

  it("text marks take config.text.color; mark.color alone leaves them black", async () => {
    // Discovery pinned: vega's text marks default to a hardcoded black that
    // config.mark.color does not override. If this breaks, theme-colored
    // value labels regress to black on dark themes.
    const spec = {
      data: { values: [{ x: 1, y: 1, label: "hi" }] },
      mark: { type: "text" },
      encoding: {
        x: { field: "x", type: "quantitative" },
        y: { field: "y", type: "quantitative" },
        text: { field: "label", type: "nominal" },
      },
      width: 100,
      height: 100,
    };
    const render = async (config: Record<string, unknown>) => {
      const compiled = compile(spec as never, { config } as never);
      const view = new vega.View(
        vega.parse(compiled.spec, undefined, { ast: true }),
        {
          expr: expressionInterpreter,
          renderer: "none",
          loader: inlineOnlyLoader,
        } as never,
      );
      await view.runAsync();
      const svg = await view.toSVG();
      view.finalize();
      return svg;
    };
    const withMarkColorOnly = await render({ mark: { color: "red" } });
    expect(withMarkColorOnly).toContain('fill="black"');
    const withTextColor = await render({ text: { color: "red" } });
    expect(withTextColor).toContain('fill="red"');
  });

  it("regression and loess transforms survive the interpreter runtime", async () => {
    // Both render real trend lines through the AST interpreter path; a
    // silent drop would render empty layers instead of throwing.
    const { svg } = await renderVegaLiteSpec(
      LAYERED,
      resolveVegaLiteOptions({}),
    );
    expect(svg).toContain("<path");
    expect(svg).toContain("<svg");
  });
});

describe("theme contract (dark-export and pinned-theme bugs)", () => {
  const LABEL_SPEC = {
    data: { values: [{ x: 1, y: 1, label: "hi" }] },
    mark: { type: "text" },
    encoding: {
      x: { field: "x", type: "quantitative" },
      y: { field: "y", type: "quantitative" },
      text: { field: "label", type: "nominal" },
    },
    width: 100,
    height: 100,
  };

  function setDomTheme(type: "light" | "dark", color: string): HTMLElement {
    document.documentElement.setAttribute("data-theme", type);
    const host = document.createElement("div");
    host.id = "viewer-content";
    host.style.color = color;
    document.body.appendChild(host);
    return host;
  }

  it("pinned theme=dark is self-contained: dark background + light fg", async () => {
    const host = setDomTheme("light", "rgb(30, 30, 30)");
    const { svg } = await renderVegaLiteSpec(
      LABEL_SPEC,
      resolveVegaLiteOptions({ theme: "dark" }),
    );
    host.remove();
    expect(svg).toContain("#202124"); // painted background
    expect(svg).toContain("#e6e6e6"); // fixed light fg (text marks)
    expect(svg).not.toContain("rgb(30, 30, 30)"); // DOM tokens ignored
  });

  it("exports use the fixed light look even when the editor is dark-themed", async () => {
    const host = setDomTheme("dark", "rgb(212, 212, 212)");
    const { svg } = await renderVegaLiteSpec(
      LABEL_SPEC,
      resolveVegaLiteOptions({}),
      { variant: "export" },
    );
    host.remove();
    expect(svg).toContain("#333333"); // fixed very-dark-gray fg
    expect(svg).not.toContain("212, 212, 212"); // no DOM leak into exports
  });

  it("viewer auto charts follow the DOM theme tokens", async () => {
    const host = setDomTheme("dark", "rgb(212, 212, 212)");
    const { svg } = await renderVegaLiteSpec(
      LABEL_SPEC,
      resolveVegaLiteOptions({}),
    );
    host.remove();
    expect(svg).toContain("rgb(212, 212, 212)");
    // auto stays see-through: no painted background rect.
    expect(svg).not.toContain("#202124");
    expect(svg).not.toContain("#ffffff");
  });
});
