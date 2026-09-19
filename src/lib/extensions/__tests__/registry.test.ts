import { describe, it, expect, vi, beforeEach } from "vitest";
import MarkdownIt from "markdown-it";
import {
  registerExtension,
  registerExtensionSchema,
  getExtensionSchema,
  detectExtensions,
  resetExtensions,
  listExtensions,
  loadExtensionsForContent,
} from "../registry";
import type { MarkdownExtension, FenceOptionSchema } from "../types";

const katexSchema: FenceOptionSchema = {
  leqno: { type: "boolean", default: false },
  fleqn: { type: "boolean", default: false },
  fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
};

const dummyExtension: MarkdownExtension = {
  id: "katex",
  label: "KaTeX Math",
  fenceOptionsSchema: katexSchema,
  detect(content: string): boolean {
    return /\$\$|\$[^$\s]/.test(content);
  },
};

describe("registry", () => {
  beforeEach(() => {
    resetExtensions();
  });

  it("registers extension with schema under its id", () => {
    registerExtension(dummyExtension);
    const schema = getExtensionSchema("katex");
    expect(schema).toBeDefined();
    expect(schema!.leqno.type).toBe("boolean");
  });

  it("registers schema under an alias (math → katex)", () => {
    registerExtension(dummyExtension);
    registerExtensionSchema("math", katexSchema);
    const schema = getExtensionSchema("math");
    expect(schema).toBeDefined();
    expect(schema).toEqual(katexSchema);
  });

  it("getExtensionSchema returns undefined for unregistered id", () => {
    expect(getExtensionSchema("nonexistent")).toBeUndefined();
  });

  it("detectExtensions finds math content", () => {
    registerExtension(dummyExtension);
    const detected = detectExtensions("$$ x^2 $$");
    expect(detected).toHaveLength(1);
    expect(detected[0].id).toBe("katex");
  });

  it("detectExtensions returns empty for non-math content", () => {
    registerExtension(dummyExtension);
    const detected = detectExtensions("just plain text");
    expect(detected).toHaveLength(0);
  });

  it("listExtensions returns all registered", () => {
    registerExtension(dummyExtension);
    expect(listExtensions()).toHaveLength(1);
    expect(listExtensions()[0].id).toBe("katex");
  });
});

describe("loadExtensionsForContent", () => {
  beforeEach(() => {
    resetExtensions();
  });

  function createMockExtension(
    id: string,
    shouldDetect: boolean,
  ): MarkdownExtension & {
    loadPlugin: ReturnType<typeof vi.fn>;
    loadStyles: ReturnType<typeof vi.fn>;
    postRegister: ReturnType<typeof vi.fn>;
  } {
    const pluginFn = vi.fn();
    return {
      id,
      label: `Test ${id}`,
      detect: vi.fn(() => shouldDetect),
      loadPlugin: vi.fn(async () => ({ plugin: pluginFn, options: {} })),
      loadStyles: vi.fn(async () => {}),
      postRegister: vi.fn(),
    };
  }

  it("loads plugin when content matches", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    await loadExtensionsForContent("TRIGGER content", md);
    expect(ext.loadPlugin).toHaveBeenCalledOnce();
  });

  it("returns true when new extensions loaded", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    const result = await loadExtensionsForContent("TRIGGER", md);
    expect(result).toBe(true);
  });

  it("returns false when no extensions detected", async () => {
    const ext = createMockExtension("test", false);
    registerExtension(ext);
    const md = new MarkdownIt();
    const result = await loadExtensionsForContent("plain text", md);
    expect(result).toBe(false);
    expect(ext.loadPlugin).not.toHaveBeenCalled();
  });

  it("returns false on second call (idempotent)", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    await loadExtensionsForContent("TRIGGER", md);
    const result = await loadExtensionsForContent("TRIGGER", md);
    expect(result).toBe(false);
    expect(ext.loadPlugin).toHaveBeenCalledOnce();
  });

  it("calls postRegister after loading", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    await loadExtensionsForContent("TRIGGER", md);
    expect(ext.postRegister).toHaveBeenCalledWith(md);
  });

  it("calls loadStyles on first detection", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    await loadExtensionsForContent("TRIGGER", md);
    expect(ext.loadStyles).toHaveBeenCalledOnce();
  });

  it("does not call loadStyles on second detection", async () => {
    const ext = createMockExtension("test", true);
    registerExtension(ext);
    const md = new MarkdownIt();
    await loadExtensionsForContent("TRIGGER", md);
    await loadExtensionsForContent("TRIGGER", md);
    expect(ext.loadStyles).toHaveBeenCalledOnce();
  });

  it("shares concurrent plugin and style loading", async () => {
    let releasePlugin!: () => void;
    let releaseStyles!: () => void;
    let pluginStarted!: () => void;
    let stylesStarted!: () => void;
    const pluginGate = new Promise<void>((resolve) => {
      releasePlugin = resolve;
    });
    const stylesGate = new Promise<void>((resolve) => {
      releaseStyles = resolve;
    });
    const pluginStartedPromise = new Promise<void>((resolve) => {
      pluginStarted = resolve;
    });
    const stylesStartedPromise = new Promise<void>((resolve) => {
      stylesStarted = resolve;
    });
    const plugin = vi.fn();
    const ext: MarkdownExtension = {
      id: "test",
      label: "Test",
      detect: () => true,
      loadPlugin: vi.fn(async () => {
        pluginStarted();
        await pluginGate;
        return { plugin, options: {} };
      }),
      loadStyles: vi.fn(async () => {
        stylesStarted();
        await stylesGate;
      }),
      postRegister: vi.fn(),
    };
    registerExtension(ext);
    const md = new MarkdownIt();

    const first = loadExtensionsForContent("TRIGGER", md);
    await pluginStartedPromise;
    const second = loadExtensionsForContent("TRIGGER", md);
    releasePlugin();
    await stylesStartedPromise;
    releaseStyles();

    await expect(Promise.all([first, second])).resolves.toEqual([true, false]);
    expect(ext.loadPlugin).toHaveBeenCalledOnce();
    expect(ext.loadStyles).toHaveBeenCalledOnce();
    expect(ext.postRegister).toHaveBeenCalledOnce();
  });
});
