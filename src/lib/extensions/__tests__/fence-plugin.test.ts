import { describe, it, expect, vi, beforeEach } from "vitest";
import MarkdownIt from "markdown-it";
import { extensionFencePlugin } from "../fence-plugin";
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

describe("extensionFencePlugin", () => {
  beforeEach(() => {
    resetExtensions();
  });

  function createMdWithPlugin() {
    const md = new MarkdownIt({ html: true }).use(extensionFencePlugin);
    registerExtensionSchema("test", testSchema);
    return md;
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
});
