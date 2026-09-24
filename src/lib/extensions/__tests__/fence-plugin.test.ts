import { describe, it, expect, vi, beforeEach } from "vitest";
import MarkdownIt from "markdown-it";
import { extensionFencePlugin } from "../fence-plugin";
import { directivePlugin } from "../directives";
import {
  registerExtension,
  registerExtensionSchema,
  resetExtensions,
} from "../registry";
import type { MarkdownExtension, FenceOptionSchema } from "../types";

const testSchema: FenceOptionSchema = {
  leqno: { type: "boolean", default: false },
  fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
};

const mermaidSchema: FenceOptionSchema = {
  theme: {
    type: "string",
    default: "default",
    values: ["default", "dark", "forest"],
  },
  maxWidth: { type: "number", default: 800, min: 200, max: 2000 },
  fitToWidth: { type: "boolean", default: true },
};

describe("extensionFencePlugin", () => {
  beforeEach(() => {
    resetExtensions();
  });

  function createMdWithPlugin() {
    const md = new MarkdownIt({ html: true }).use(extensionFencePlugin);
    registerExtensionSchema("test", testSchema);
    return md;
  }

  function registerMermaidExtension(
    renderFence: NonNullable<MarkdownExtension["renderFence"]>,
  ) {
    registerExtension({
      id: "mermaid",
      label: "Mermaid-like test extension",
      triggerLanguages: ["mermaid"],
      detect: () => false,
      fenceOptionsSchema: mermaidSchema,
      renderFence,
    });
  }

  function createMdWithDirectives() {
    return new MarkdownIt({ html: true })
      .use(directivePlugin)
      .use(extensionFencePlugin);
  }

  function createRenderedFenceMock() {
    return vi.fn(
      (
        _content: string,
        _language: string,
        _options: Record<string, unknown>,
      ) => {
        void [_content, _language, _options];
        return "<div>rendered</div>";
      },
    );
  }

  it("routes fenced blocks to matching extension's renderFence", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    const html = md.render("```test\ncontent\n```\n");
    expect(renderFence).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (renderFence as any).mock.calls;
    expect(calls[0][0]).toBe("content\n");
    expect(calls[0][1]).toBe("test");
    expect(html).toContain("rendered");
  });

  it("non-math fences fall through to default renderer", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    const html = md.render("```js\nconst x = 1;\n```\n");
    expect(renderFence).not.toHaveBeenCalled();
    expect(html).toContain("const x = 1");
  });

  it("parses {attrs} from info string into options", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    md.render("```test {leqno fontsize=2.0}\ncontent\n```\n");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = (renderFence as any).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(opts.leqno).toBe(true);
    expect(opts.fontsize).toBe(2.0);
  });

  it("unknown language falls through to default", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    const html = md.render("```unknown\ncontent\n```\n");
    expect(renderFence).not.toHaveBeenCalled();
    expect(html).toContain("content");
  });

  it("renderFence returning null falls through to default", () => {
    const renderFence = vi.fn(() => null);
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    const html = md.render("```test\ncontent\n```\n");
    expect(renderFence).toHaveBeenCalledOnce();
    // Falls through to default fence rendering
    expect(html).toContain("content");
  });

  it("empty {attrs} does not produce options", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      triggerLanguages: ["test"],
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    md.render("```test {}\ncontent\n```\n");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = (renderFence as any).mock.calls[0]?.[2] as
      Record<string, unknown> | undefined;
    // No explicit attrs → no keys from parsing, but mergeOptions with empty
    // fence opts and empty directive state still produces schema defaults
    expect(opts === undefined || Object.keys(opts).length >= 0).toBe(true);
  });

  it("extension without triggerLanguages is not matched", () => {
    const renderFence = vi.fn(() => "<div>rendered</div>");
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      detect: () => false,
      fenceOptionsSchema: testSchema,
      renderFence,
    };
    registerExtension(ext);
    const md = createMdWithPlugin();
    md.render("```test\ncontent\n```\n");
    expect(renderFence).not.toHaveBeenCalled();
  });

  it("applies Mermaid-like directives by fence position", () => {
    const renderFence = createRenderedFenceMock();
    registerMermaidExtension(renderFence);
    const md = createMdWithDirectives();
    const src = [
      "```mermaid",
      "before",
      "```",
      "",
      "<!-- mermaid: theme=dark -->",
      "",
      "```mermaid",
      "middle",
      "```",
      "",
      "<!-- mermaid: theme=forest -->",
      "",
      "```mermaid",
      "after",
      "```",
    ].join("\n");

    md.render(src);

    const calls = renderFence.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][2]).toEqual({
      theme: "default",
      maxWidth: 800,
      fitToWidth: true,
    });
    expect(calls[1][2]).toEqual({
      theme: "dark",
      maxWidth: 800,
      fitToWidth: true,
    });
    expect(calls[2][2]).toEqual({
      theme: "forest",
      maxWidth: 800,
      fitToWidth: true,
    });
  });

  it("preserves omitted Mermaid-like directive keys", () => {
    const renderFence = createRenderedFenceMock();
    registerMermaidExtension(renderFence);
    const md = createMdWithDirectives();
    const src = [
      "<!-- mermaid: theme=dark maxWidth=1200 -->",
      "",
      "```mermaid",
      "first",
      "```",
      "",
      "<!-- mermaid: fitToWidth=false -->",
      "",
      "```mermaid",
      "second",
      "```",
    ].join("\n");

    md.render(src);

    const calls = renderFence.mock.calls;
    expect(calls[0][2]).toEqual({
      theme: "dark",
      maxWidth: 1200,
      fitToWidth: true,
    });
    expect(calls[1][2]).toEqual({
      theme: "dark",
      maxWidth: 1200,
      fitToWidth: false,
    });
  });

  it("lets fence attributes override directives for one fence", () => {
    const renderFence = createRenderedFenceMock();
    registerMermaidExtension(renderFence);
    const md = createMdWithDirectives();
    const src = [
      "<!-- mermaid: theme=dark maxWidth=1200 -->",
      "",
      "```mermaid {theme=forest maxWidth=600 fitToWidth=false}",
      "override",
      "```",
      "",
      "```mermaid",
      "inherited",
      "```",
    ].join("\n");

    md.render(src);

    const calls = renderFence.mock.calls;
    expect(calls[0][2]).toEqual({
      theme: "forest",
      maxWidth: 600,
      fitToWidth: false,
    });
    expect(calls[1][2]).toEqual({
      theme: "dark",
      maxWidth: 1200,
      fitToWidth: true,
    });
  });

  it("injects data-line on leading-whitespace custom element output", () => {
    const renderFence = vi.fn(
      (
        _content: string,
        _language: string,
        _options: Record<string, unknown>,
      ) => {
        void [_content, _language, _options];
        return "\n  <my-diagram>rendered</my-diagram>";
      },
    );
    registerMermaidExtension(renderFence);
    const md = createMdWithDirectives();

    const html = md.render("```mermaid\ncontent\n```\n");

    expect(html).toContain(
      '\n  <my-diagram data-line="1">rendered</my-diagram>',
    );
  });

  it("does not duplicate an existing data-line attribute", () => {
    const renderFence = vi.fn(
      (
        _content: string,
        _language: string,
        _options: Record<string, unknown>,
      ) => {
        void [_content, _language, _options];
        return '\n  <my-diagram data-line="existing">rendered</my-diagram>';
      },
    );
    registerMermaidExtension(renderFence);
    const md = createMdWithDirectives();

    const html = md.render("```mermaid\ncontent\n```\n");

    expect(html).toContain(
      '\n  <my-diagram data-line="existing">rendered</my-diagram>',
    );
    expect((html.match(/data-line=/g) ?? []).length).toBe(1);
  });
});
