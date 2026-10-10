import MarkdownIt from "markdown-it";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mermaidExtension, MERMAID_OPTIONS_SCHEMA } from "../index";
import {
  clearMermaidCache,
  diagramRenderWidth,
  isContainerSizedDiagram,
  preRenderMermaidBlocks,
  renderMermaid,
  renderMermaidSvgForExport,
} from "../renderer";
import { directivePlugin } from "../../directives";
import { extensionFencePlugin } from "../../fence-plugin";
import { registerExtension, resetExtensions } from "../../registry";
import { MERMAID_FONT_SIZE, MERMAID_STYLES } from "../styles";

const RAW_SVG =
  '<svg width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320"><g /></svg>';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function setAppTheme(
  theme: "light" | "dark",
  themeId?: string,
  mermaidMainBkg?: string,
) {
  const id = themeId ?? (theme === "dark" ? "github-dark" : "github-light");
  const getAttribute = vi.fn((attr: string) =>
    attr === "data-theme-id" ? id : theme,
  );
  const viewerEl = {
    style: { setProperty: vi.fn() },
  };
  const getElementById = vi.fn((elementId: string) =>
    elementId === "viewer-content" ? viewerEl : null,
  );
  const getComputedStyle = vi.fn(() => ({
    getPropertyValue: (prop: string) =>
      prop === "--mermaid-main-bkg" ? (mermaidMainBkg ?? "") : "",
  }));
  vi.stubGlobal("document", {
    documentElement: { getAttribute },
    getElementById,
  });
  vi.stubGlobal("getComputedStyle", getComputedStyle);
  return { getAttribute, getElementById, getComputedStyle };
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

    it("keeps pre-render and fence cache keys in sync when the theme changes mid-render", async () => {
      setAppTheme("dark", "github-dark");
      registerExtension(mermaidExtension);
      const md = new MarkdownIt({ html: true })
        .use(directivePlugin)
        .use(extensionFencePlugin);
      const env: Record<string, unknown> = {};
      const source = "graph LR\n    A-->B\n";
      const tokens = md.parse("```mermaid\n" + source + "```\n", env);

      await mermaidExtension.preRenderBlocks!("", { tokens, env });

      // The theme flips after the pre-render pass but before the fence
      // renderer runs. The fence lookup must use the pass's theme snapshot —
      // reading the DOM again here used to miss the cache and render every
      // diagram as a "Mermaid rendering failed" error block (or pick up a
      // stale theme's cached SVGs).
      setAppTheme("light", "github-light");
      const html = md.renderer.render(tokens, md.options, env);

      expect(html).toContain("<svg");
      expect(html).not.toContain("mermaid-error-block");
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    it("passes themeVariables.mainBkg when viewer defines --mermaid-main-bkg", async () => {
      setAppTheme("light", "nord-light", "#D8DEE9");

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "default",
          themeVariables: { mainBkg: "#D8DEE9", fontSize: MERMAID_FONT_SIZE },
        }),
      );
    });

    it("passes only the pinned label font size when no --mermaid-main-bkg is set", async () => {
      setAppTheme("light", "github-light");

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          themeVariables: { fontSize: MERMAID_FONT_SIZE },
        }),
      );
    });

    it("keeps the pinned label font size for dark themes", async () => {
      setAppTheme("dark", "github-dark", "#D8DEE9");

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          themeVariables: { fontSize: MERMAID_FONT_SIZE },
        }),
      );
    });

    it("pins the same label font size in the config and the stylesheet", async () => {
      setAppTheme("light");

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      // The stylesheet specifies the size on the <foreignObject> label roots,
      // which is what label measurement sees before Mermaid's injected
      // diagram stylesheet resolves. If the config's root rule and this rule
      // ever disagree, labels are measured at one size and painted at another
      // and get clipped — so both sides read one constant.
      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          themeVariables: { fontSize: MERMAID_FONT_SIZE },
        }),
      );
      expect(MERMAID_FONT_SIZE).toBe("16px");
      expect(MERMAID_STYLES).toContain(`font-size: ${MERMAID_FONT_SIZE};`);
    });

    it("gives Nord Light its own SVG cache separate from other light themes", async () => {
      setAppTheme("light", "github-light");
      const source = "graph LR\n    A-->B\n";

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);

      clearMermaidCache();
      setAppTheme("light", "nord-light", "#D8DEE9");

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
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
      const { getAttribute } = setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      const tokens = [fenceToken(source)];

      await preRenderMermaidBlocks(tokens, {}, MERMAID_OPTIONS_SCHEMA);
      getAttribute.mockImplementation((attr: string) =>
        attr === "data-theme-id" ? "github-dark" : "dark",
      );
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
      const { getAttribute } = setAppTheme("light");
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

      getAttribute.mockImplementation((attr: string) =>
        attr === "data-theme-id" ? "github-dark" : "dark",
      );
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

    it("initializes Mermaid with suppressErrorRendering", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ suppressErrorRendering: true }),
      );
    });

    it("removes a failed render's leftover temp nodes without sweeping siblings", async () => {
      const leftoverDiv = { remove: vi.fn() };
      const leftoverIframe = { remove: vi.fn() };
      const querySelectorAll = vi.fn(() => [{ remove: vi.fn() }]);
      const getElementById = vi.fn((id: string) => {
        // Mermaid mirrors the render id (`mmd-0` after clearMermaidCache) as
        // `div#dmmd-0` / `iframe#immd-0`.
        if (id === "dmmd-0") return leftoverDiv;
        if (id === "immd-0") return leftoverIframe;
        return null;
      });
      vi.stubGlobal("document", {
        documentElement: { getAttribute: () => "light" },
        getElementById,
        querySelectorAll,
      });
      mermaidMock.render.mockRejectedValueOnce(new Error("render failed"));

      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(getElementById).toHaveBeenCalledWith("dmmd-0");
      expect(getElementById).toHaveBeenCalledWith("immd-0");
      expect(leftoverDiv.remove).toHaveBeenCalled();
      expect(leftoverIframe.remove).toHaveBeenCalled();
      // Cleanup is scoped to the failing render's own temp containers
      // (never a blanket sweep of every leftover).
      expect(querySelectorAll).not.toHaveBeenCalled();
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

    it("rewrites compact style selectors that butt against a declaration block", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B\n";
      // Mermaid serializes its <style> CSS compactly, so id selectors are
      // followed directly by `{`. The root rule carries the diagram's
      // font-family/font-size/fill and must follow the renamed id — if it is
      // orphaned, labels render at whatever the engine inherits into
      // <foreignObject> instead of the size the layout was measured at.
      const compactSvg = [
        '<svg id="diagram" viewBox="0 0 10 10">',
        "<style>#diagram{font-family:inherit;font-size:16px;fill:#333;}" +
          "#diagram .label{color:#333;}</style>",
        '<rect id="node" />',
        "</svg>",
      ].join("");
      mermaidMock.render.mockResolvedValue({ svg: compactSvg });

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      const out = renderMermaid(source, {});

      expect(out).toContain(
        "#mmd-svg-0-diagram{font-family:inherit;font-size:16px;fill:#333;}",
      );
      expect(out).toContain("#mmd-svg-0-diagram .label{color:#333;}");
      // Invariant: no pre-rename id selector may survive in the style block.
      expect(out).not.toMatch(/#diagram(?![\w-])/);
      expect(out).not.toMatch(/#node(?![\w-])/);
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

  describe("render width (container-sized diagrams)", () => {
    it("classifies gantt sources as container-sized", () => {
      expect(isContainerSizedDiagram("gantt\n    title Plan\n")).toBe(true);
      expect(isContainerSizedDiagram("  gantt\n")).toBe(true);
      // Mermaid's own detection strips frontmatter and init directives before
      // matching the leading keyword — see the detectType agreement test.
      expect(
        isContainerSizedDiagram(
          "---\nconfig:\n  gantt:\n    useWidth: 400\n---\ngantt\n",
        ),
      ).toBe(true);
      expect(
        isContainerSizedDiagram("%%{init: {'theme':'forest'}}%%\ngantt\n"),
      ).toBe(true);
      expect(isContainerSizedDiagram("%% note\n\ngantt\n")).toBe(true);
    });

    it("classifies content-sized families as width-independent", () => {
      expect(isContainerSizedDiagram("graph LR\n    A-->B\n")).toBe(false);
      expect(
        isContainerSizedDiagram(
          "---\nconfig:\n  theme: forest\n---\ngraph TD\n    F-->G\n",
        ),
      ).toBe(false);
      expect(isContainerSizedDiagram("sequenceDiagram\n    A->>B: hi\n")).toBe(
        false,
      );
      expect(isContainerSizedDiagram("flowchart TD\n  gantt\n")).toBe(false);
    });

    it("fits the diagram to the column by default", () => {
      // No #viewer-content -> the built-in column fallback (800px).
      expect(diagramRenderWidth({ maxWidth: 800, fitToWidth: true })).toBe(800);
      expect(diagramRenderWidth({ maxWidth: 300, fitToWidth: true })).toBe(300);
      // Wider than the column: built at the column, not scaled down later.
      expect(diagramRenderWidth({ maxWidth: 1200, fitToWidth: true })).toBe(
        800,
      );
      expect(diagramRenderWidth({})).toBe(800);
    });

    it("builds natural-size diagrams for the requested maxWidth", () => {
      expect(diagramRenderWidth({ maxWidth: 1200, fitToWidth: false })).toBe(
        1200,
      );
      expect(diagramRenderWidth({ maxWidth: 400, fitToWidth: false })).toBe(
        400,
      );
    });

    it("measures the column from the live viewer so custom themes win", () => {
      vi.stubGlobal("document", {
        getElementById: (id: string) =>
          id === "viewer-content" ? { id } : null,
      });
      vi.stubGlobal("getComputedStyle", () => ({ maxWidth: "1000px" }));

      expect(diagramRenderWidth({ maxWidth: 1200, fitToWidth: true })).toBe(
        1000,
      );
      expect(diagramRenderWidth({ maxWidth: 700, fitToWidth: true })).toBe(700);
    });

    it("pins gantt.useWidth to the diagram display width", async () => {
      setAppTheme("light");
      await preRenderMermaidBlocks(
        [fenceToken("gantt\n    title Plan\n")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ gantt: { useWidth: 800 } }),
      );
    });

    it("pins gantt.useWidth to maxWidth for natural-size diagrams", async () => {
      setAppTheme("light");
      await preRenderMermaidBlocks(
        [
          fenceToken(
            "gantt\n    title Plan\n",
            "mermaid {fitToWidth=false maxWidth=1200}",
          ),
        ],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ gantt: { useWidth: 1200 } }),
      );
    });

    it("rebuilds container-sized diagrams when the render width changes", async () => {
      setAppTheme("light");
      const source = "gantt\n    title Plan\n";

      await preRenderMermaidBlocks(
        [fenceToken(source, "mermaid {maxWidth=400}")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await preRenderMermaidBlocks(
        [fenceToken(source, "mermaid {maxWidth=800}")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });

    it("reuses a container-sized render when only alignment changes", async () => {
      setAppTheme("light");
      const source = "gantt\n    title Plan\n";

      await preRenderMermaidBlocks(
        [fenceToken(source, "mermaid {align=left maxWidth=400}")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await preRenderMermaidBlocks(
        [fenceToken(source, "mermaid {align=right maxWidth=400}")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      expect(mermaidMock.render).toHaveBeenCalledOnce();
    });

    it("keeps pre-render and fence cache keys in sync for gantt", async () => {
      setAppTheme("light");

      const html = await renderWithExtension(
        "```mermaid {maxWidth=400}\ngantt\n    title Plan\n```\n",
      );

      expect(html).not.toContain("mermaid-error-block");
      expect(html).toContain('class="mermaid-block"');
      expect(mermaidMock.render).toHaveBeenCalledOnce();
    });
  });

  describe("renderMermaidSvgForExport", () => {
    it("returns a normalized SVG with explicit width/height and namespaced ids", async () => {
      setAppTheme("dark");
      mermaidMock.render.mockResolvedValue({
        svg: '<svg id="diagram" width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320"><rect id="box" width="10" height="10"/></svg>',
      });

      const svg = await renderMermaidSvgForExport("graph LR\n    A-->B");

      expect(svg).toContain('width="640"');
      expect(svg).toContain('height="320"');
      expect(svg).not.toContain("max-width: 640px");
      expect(svg).toContain('id="mmd-exp-0-diagram"');
      expect(svg).toContain('id="mmd-exp-0-box"');
    });

    it("forces neutral theme, HTML labels (converted after render), and a concrete font stack", async () => {
      setAppTheme("dark");

      await renderMermaidSvgForExport("graph LR\n    A-->B");

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "default",
          // Labels render with the viewer's HTML layout and are rewritten
          // to measured <text> by convertForeignObjectLabels afterwards —
          // Mermaid's htmlLabels:false text dialect misplaces node labels.
          htmlLabels: true,
          fontFamily: "'trebuchet ms', verdana, arial, sans-serif",
          themeVariables: { fontSize: MERMAID_FONT_SIZE },
        }),
      );
      expect(mermaidMock.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mmd-export-/),
        "graph LR\n    A-->B",
      );
    });

    it("materializes font-family as presentation attributes on text shapes", async () => {
      setAppTheme("light");
      mermaidMock.render.mockResolvedValue({
        svg: '<svg viewBox="0 0 100 50" width="100" height="50"><style>.label { font-family: inherit; }</style><text class="label"><tspan>Hello</tspan></text></svg>',
      });

      const svg = await renderMermaidSvgForExport("graph LR\n    A-->B");

      // `inherit` is meaningless in a standalone SVG.
      expect(svg).not.toMatch(/font-family:\s*inherit\b/);
      expect(svg).toContain(
        "font-family: 'trebuchet ms', verdana, arial, sans-serif",
      );
      // Presentation attributes survive LibreOffice svgio and usvg, which
      // don't reliably apply Mermaid's class/descendant CSS to <text>.
      expect(svg).toMatch(/<text[^>]+font-family="/);
      expect(svg).toMatch(/<tspan[^>]+font-family="/);
    });

    it("does not override an explicit font-family already on a text shape", async () => {
      setAppTheme("light");
      mermaidMock.render.mockResolvedValue({
        svg: '<svg viewBox="0 0 100 50" width="100" height="50"><text font-family="monospace">Hi</text></svg>',
      });

      const svg = await renderMermaidSvgForExport("graph LR\n    A-->B");

      expect(svg).toContain('font-family="monospace"');
      expect(svg).not.toContain("trebuchet");
    });

    it("caches the raw SVG across calls without re-rendering", async () => {
      setAppTheme("light");
      mermaidMock.render.mockResolvedValue({
        svg: '<svg viewBox="0 0 640 320" width="640" height="320"><rect id="box" width="10" height="10"/></svg>',
      });
      const source = "graph LR\n    A-->B";

      const first = await renderMermaidSvgForExport(source);
      const second = await renderMermaidSvgForExport(source);

      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
      // Namespacing is applied per call so each embed is unique.
      expect(first).toContain("mmd-exp-0-box");
      expect(second).toContain("mmd-exp-1-box");
    });

    it("keeps the export cache separate from the viewer cache even in the same theme", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B";

      await preRenderMermaidBlocks(
        [fenceToken(source)],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await renderMermaidSvgForExport(source);

      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });

    it("re-initializes the viewer config after an export render", async () => {
      setAppTheme("light");
      const source = "graph LR\n    A-->B";

      await renderMermaidSvgForExport(source);
      await preRenderMermaidBlocks(
        [fenceToken("graph TB\n    C-->D")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );

      const configs = mermaidMock.initialize.mock.calls.map((c) => c[0]);
      expect(configs[0]).toMatchObject({ htmlLabels: true });
      expect(configs[1]).toMatchObject({ fontFamily: "inherit" });
    });

    it("throws when Mermaid fails to render", async () => {
      setAppTheme("light");
      mermaidMock.render.mockRejectedValue(new Error("bad diagram"));

      await expect(renderMermaidSvgForExport("nonsense")).rejects.toThrow(
        /bad diagram/,
      );
    });
  });

  describe("feature detector", () => {
    it("registers mermaid detector", () => {
      // The detector is registered via side-effect import.
      expect(mermaidExtension.featureDetectors?.()).toBeDefined();
    });
  });
});
