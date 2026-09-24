import MarkdownIt from "markdown-it";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mermaidExtension, MERMAID_OPTIONS_SCHEMA } from "../index";
import {
  clearMermaidCache,
  preRenderMermaidBlocks,
  renderMermaid,
} from "../renderer";
import { directivePlugin } from "../../directives";
import { extensionFencePlugin } from "../../fence-plugin";
import { registerExtension, resetExtensions } from "../../registry";

const RAW_SVG =
  '<svg width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320"><g /></svg>';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function setAppTheme(theme: "light" | "dark") {
  const getAttribute = vi.fn(() => theme);
  vi.stubGlobal("document", { documentElement: { getAttribute } });
  return getAttribute;
}

function fenceToken(
  content: string,
  info = "mermaid",
): { type: "fence"; info: string; content: string } {
  return { type: "fence", info, content };
}

async function renderWithExtension(content: string): Promise<string> {
  registerExtension(mermaidExtension);
  const md = new MarkdownIt({ html: true })
    .use(directivePlugin)
    .use(extensionFencePlugin);
  const env: Record<string, unknown> = {};
  const tokens = md.parse(content, env);
  await mermaidExtension.preRenderBlocks!(content, { tokens, env });
  return md.renderer.render(tokens, md.options, env);
}

describe("mermaid extension", () => {
  beforeEach(() => {
    resetExtensions();
    clearMermaidCache();
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({ svg: RAW_SVG });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("detection", () => {
    it("detects mermaid fenced blocks", () => {
      expect(
        mermaidExtension.detect("```mermaid\ngraph LR\n    A-->B\n```"),
      ).toBe(true);
    });

    it("detects mermaid with brace attributes", () => {
      expect(
        mermaidExtension.detect("```mermaid {align=left}\ngraph LR\n```"),
      ).toBe(true);
    });

    it("detects valid indented, tilde, extended, spaced, and mixed-case fences", () => {
      const validFences = [
        "```mermaid\ngraph LR\n```",
        "~~~ mermaid\ngraph LR\n~~~",
        "   ````\tMERMAID {align=left}\ngraph LR\n   ````",
        "  ~~~~~mermaid\ngraph LR\n  ~~~~~",
      ];

      for (const content of validFences) {
        expect(mermaidExtension.detect(content)).toBe(true);
      }
    });

    it("does not detect non-mermaid content", () => {
      expect(mermaidExtension.detect("just plain text")).toBe(false);
      expect(mermaidExtension.detect("```js\nconst x = 1;\n```")).toBe(false);
      expect(mermaidExtension.detect("inline ```mermaid text```")).toBe(false);
      expect(mermaidExtension.detect("    ```mermaid\ngraph LR\n    ```")).toBe(
        false,
      );
      expect(mermaidExtension.detect("```mermaidish\ngraph LR\n```")).toBe(
        false,
      );
    });
  });

  describe("schema", () => {
    it("uses host alignment instead of a Mermaid theme option", () => {
      expect(MERMAID_OPTIONS_SCHEMA).not.toHaveProperty("theme");

      const align = MERMAID_OPTIONS_SCHEMA.align;
      expect(align.type).toBe("string");
      expect(align.default).toBe("center");
      expect(align.values).toEqual(["left", "center", "right"]);
    });

    it("has maxWidth option with correct defaults", () => {
      const maxWidth = MERMAID_OPTIONS_SCHEMA.maxWidth;
      expect(maxWidth.type).toBe("number");
      expect(maxWidth.default).toBe(800);
      expect(maxWidth.min).toBe(200);
      expect(maxWidth.max).toBe(2000);
    });

    it("has fitToWidth option with correct defaults", () => {
      const fitToWidth = MERMAID_OPTIONS_SCHEMA.fitToWidth;
      expect(fitToWidth.type).toBe("boolean");
      expect(fitToWidth.default).toBe(true);
    });
  });

  describe("triggerLanguages", () => {
    it("triggers on mermaid language", () => {
      expect(mermaidExtension.triggerLanguages).toContain("mermaid");
    });
  });

  describe("renderFence", () => {
    it("returns error HTML when SVG not cached", () => {
      const result = mermaidExtension.renderFence?.(
        "graph LR\n    A-->B",
        "mermaid",
        {},
      );
      expect(result).toContain("mermaid-error");
      expect(result).toContain("mermaid-error-block");
      expect(result).toContain("graph LR");
      expect(result).toContain('data-align="center"');
      expect(result).toContain("--mermaid-max-width: 800px");
    });

    it("keeps layout attributes on an error wrapper", () => {
      const result = mermaidExtension.renderFence?.("graph LR", "mermaid", {
        fitToWidth: false,
        align: "right",
        maxWidth: 400,
      });
      expect(result).toContain("mermaid-error");
      expect(result).toContain('data-align="right"');
      expect(result).toContain('data-fit-to-width="false"');
      expect(result).toContain("--mermaid-max-width: 400px");
      expect(result).not.toContain("<svg");
    });
  });

  describe("pre-rendering and themes", () => {
    it("uses the selected dark app theme to initialize Mermaid", async () => {
      setAppTheme("dark");
      const source = "graph LR\n    A-->B\n";

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
      expect(mermaidMock.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mmd-/),
        source,
      );
    });

    it("uses Mermaid default for non-dark app themes", async () => {
      setAppTheme("light");

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "default" }),
      );
    });

    it("passes native YAML frontmatter unchanged for Mermaid to resolve", async () => {
      setAppTheme("dark");
      const source = [
        "---",
        "config:",
        "  theme: default",
        "---",
        "graph LR",
        "    A-->B",
        "",
      ].join("\n");

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
      expect(mermaidMock.render.mock.calls[0][1]).toBe(source);
      expect(mermaidMock.render.mock.calls[0][1]).toContain("  theme: default");
    });

    it("pre-renders parsed fence tokens instead of scanning raw markdown", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";

      await mermaidExtension.preRenderBlocks!("plain text", {
        tokens: [fenceToken(source)],
        env: {},
      });

      expect(mermaidMock.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mmd-/),
        source,
      );
    });
  });

  describe("directive and fence options", () => {
    it("merges positional directives with fence overrides", async () => {
      setAppTheme("light");
      const content = [
        "<!-- mermaid: align=left maxWidth=600 fitToWidth=false -->",
        "```mermaid {align=right maxWidth=300 fitToWidth=true}",
        "graph LR",
        "    A-->B",
        "```",
        "```mermaid",
        "graph LR",
        "    C-->D",
        "```",
      ].join("\n");

      const html = await renderWithExtension(content);
      const wrappers = [
        ...html.matchAll(/<div[^>]*class="mermaid-block"[^>]*>/g),
      ];

      expect(wrappers).toHaveLength(2);
      expect(wrappers[0][0]).toContain('data-align="right"');
      expect(wrappers[0][0]).not.toContain('data-fit-to-width="false"');
      expect(wrappers[0][0]).toContain("--mermaid-max-width: 300px");
      expect(wrappers[1][0]).toContain('data-align="left"');
      expect(wrappers[1][0]).toContain('data-fit-to-width="false"');
      expect(wrappers[1][0]).toContain("--mermaid-max-width: 600px");
      expect(wrappers[0][0]).toContain('data-line="2"');
      expect(wrappers[1][0]).toContain('data-line="6"');
    });

    it("ignores Mermaid theme attributes because theme is native source config", async () => {
      setAppTheme("light");
      const content = [
        "```mermaid {theme=forest align=left}",
        "graph LR",
        "    A-->B",
        "```",
      ].join("\n");

      const html = await renderWithExtension(content);

      expect(html).toContain('data-align="left"');
      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "default" }),
      );
      expect(mermaidMock.render.mock.calls[0][1]).toBe("graph LR\n    A-->B\n");
    });
  });

  describe("cache and natural sizing", () => {
    it("uses exact source keys and unique Mermaid render ids", async () => {
      setAppTheme("light");
      const first = "graph LR\nAa\n";
      const second = "graph LR\nBB\n";

      await preRenderMermaidBlocks(
        [fenceToken(first), fenceToken(second)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
      expect(mermaidMock.render.mock.calls[0][0]).toMatch(/^mmd-\d+$/);
      expect(mermaidMock.render.mock.calls[1][0]).toMatch(/^mmd-\d+$/);
      expect(mermaidMock.render.mock.calls[0][0]).not.toBe(
        mermaidMock.render.mock.calls[1][0],
      );
      expect(mermaidMock.render.mock.calls[0][1]).toBe(first);
      expect(mermaidMock.render.mock.calls[1][1]).toBe(second);
    });

    it("caches raw SVG independently of host layout options", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";

      await preRenderMermaidBlocks(
        [
          fenceToken(
            source,
            "mermaid {align=left maxWidth=300 fitToWidth=false}",
          ),
        ],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await preRenderMermaidBlocks(
        [
          fenceToken(
            source,
            "mermaid {align=right maxWidth=1200 fitToWidth=true}",
          ),
        ],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.render).toHaveBeenCalledOnce();
    });

    it("creates a fresh raw SVG when the app theme changes", async () => {
      const getAttribute = setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      const tokens = [fenceToken(source)];

      await preRenderMermaidBlocks(tokens, {}, MERMAID_OPTIONS_SCHEMA);
      getAttribute.mockReturnValue("dark");
      await preRenderMermaidBlocks(tokens, {}, MERMAID_OPTIONS_SCHEMA);

      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
      expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ theme: "default" }),
      );
      expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ theme: "dark" }),
      );
    });

    it("serializes overlapping passes and keeps each pass theme-scoped", async () => {
      const getAttribute = setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      let releaseFirstRender!: () => void;
      let resolveFirstRenderStarted!: () => void;
      let activeRenders = 0;
      let maximumActiveRenders = 0;
      const firstRenderStarted = new Promise<void>((resolve) => {
        resolveFirstRenderStarted = resolve;
      });
      const firstRenderGate = new Promise<void>((resolve) => {
        releaseFirstRender = resolve;
      });

      mermaidMock.render.mockImplementation(async () => {
        activeRenders += 1;
        maximumActiveRenders = Math.max(maximumActiveRenders, activeRenders);
        resolveFirstRenderStarted();
        await firstRenderGate;
        activeRenders -= 1;
        return { svg: RAW_SVG };
      });

      const firstPass = preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await firstRenderStarted;

      getAttribute.mockReturnValue("dark");
      const secondPass = preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.render).toHaveBeenCalledOnce();
      releaseFirstRender();
      await Promise.all([firstPass, secondPass]);

      expect(maximumActiveRenders).toBe(1);
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
      expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ theme: "default" }),
      );
      expect(mermaidMock.initialize).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ theme: "dark" }),
      );
      expect(renderMermaid(source, {})).not.toContain("mermaid-error");
    });

    it("isolates Mermaid render failures to the failed diagram", async () => {
      setAppTheme("light");
      const failedSource = "graph LR\n    A-->B\n";
      const successfulSource = "graph LR\n    C-->D\n";
      mermaidMock.render.mockRejectedValueOnce(new Error("render failed"));

      await preRenderMermaidBlocks(
        [fenceToken(failedSource), fenceToken(successfulSource)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(renderMermaid(failedSource, {})).toContain("mermaid-error");
      expect(renderMermaid(successfulSource, {})).toContain("<svg");
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });

    it("isolates Mermaid initialization failures to the failed diagram", async () => {
      setAppTheme("light");
      const failedSource = "graph LR\n    A-->B\n";
      const successfulSource = "graph LR\n    C-->D\n";
      mermaidMock.initialize.mockImplementationOnce(() => {
        throw new Error("initialize failed");
      });

      await preRenderMermaidBlocks(
        [fenceToken(failedSource), fenceToken(successfulSource)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(renderMermaid(failedSource, {})).toContain("mermaid-error");
      expect(renderMermaid(successfulSource, {})).toContain("<svg");
      expect(mermaidMock.render).toHaveBeenCalledOnce();
    });

    it("namespaces IDs and local references for each SVG wrapper", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      const referencedSvg = [
        '<svg id="diagram" aria-labelledby="title" aria-describedby="desc">',
        "<style>#diagram .node { fill: #fff; } .node text { fill: #333; }</style>",
        '<defs><marker id="arrow"><path /></marker></defs>',
        '<title id="title">arrow</title>',
        '<desc id="desc">description</desc>',
        '<use href="#arrow" xlink:href="#title" style="fill: url(#arrow)" />',
        '<path marker-end="url(#arrow)">arrow</path>',
        '<text aria-label="arrow title">arrow title</text>',
        "<text>url(#arrow)</text>",
        "</svg>",
      ].join("");
      mermaidMock.render.mockResolvedValue({ svg: referencedSvg });

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      const first = renderMermaid(source, {});
      const second = renderMermaid(source, {});

      expect(first).toContain('id="mmd-svg-0-diagram"');
      expect(first).toContain('id="mmd-svg-0-arrow"');
      expect(first).toContain('href="#mmd-svg-0-arrow"');
      expect(first).toContain('xlink:href="#mmd-svg-0-title"');
      expect(first).toContain("url(#mmd-svg-0-arrow)");
      expect(first).toContain('aria-labelledby="mmd-svg-0-title"');
      expect(first).toContain('aria-describedby="mmd-svg-0-desc"');
      expect(first).toContain(
        "#mmd-svg-0-diagram .node { fill: #fff; } .node text { fill: #333; }",
      );
      expect(first).toContain('aria-label="arrow title"');
      expect(first).toContain(">arrow title</text>");
      expect(first).toContain(">url(#arrow)</text>");
      expect(first).not.toContain("mmd-svg-1-");

      expect(second).toContain('id="mmd-svg-1-diagram"');
      expect(second).toContain('href="#mmd-svg-1-arrow"');
      expect(second).toContain("url(#mmd-svg-1-arrow)");
      expect(second).toContain('aria-labelledby="mmd-svg-1-title"');
      expect(second).not.toContain("mmd-svg-0-");
    });

    it("normalizes responsive SVG dimensions only for natural-size wrappers", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      const natural = renderMermaid(source, {
        align: "left",
        maxWidth: 300,
        fitToWidth: false,
      });
      const responsive = renderMermaid(source, {
        align: "center",
        maxWidth: 800,
        fitToWidth: true,
      });

      expect(natural).toContain('data-fit-to-width="false"');
      expect(natural).toContain('data-align="left"');
      expect(natural).toContain("--mermaid-max-width: 300px");
      expect(natural).toContain('width="640"');
      expect(natural).toContain('height="320"');
      expect(natural).not.toContain("max-width: 640px");
      expect(responsive).toContain('width="100%"');
      expect(responsive).toContain("max-width: 640px");
    });
  });

  describe("feature detector", () => {
    it("registers mermaid detector", () => {
      // The detector is registered via side-effect import.
      expect(mermaidExtension.featureDetectors?.()).toBeDefined();
    });
  });
});
