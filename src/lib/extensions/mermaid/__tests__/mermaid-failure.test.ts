import { afterEach, describe, expect, it, vi } from "vitest";

describe("Mermaid lazy-load failures", () => {
  afterEach(() => {
    vi.doUnmock("mermaid");
    vi.resetModules();
  });

  it("caches an error wrapper when the Mermaid module cannot load", async () => {
    vi.resetModules();
    vi.doMock("mermaid", () => {
      throw new Error("Mermaid module failed to load");
    });

    const [{ MERMAID_OPTIONS_SCHEMA }, renderer] = await Promise.all([
      import("../index"),
      import("../renderer"),
    ]);
    const source = "graph LR\n    A-->B\n";

    await renderer.preRenderMermaidBlocks(
      [{ type: "fence", info: "mermaid", content: source }],
      {},
      MERMAID_OPTIONS_SCHEMA,
    );

    const output = renderer.renderMermaid(source, {});
    expect(output).toContain("mermaid-error");
    expect(output).toContain("graph LR");
    expect(output).not.toContain("<svg");
  });
});
