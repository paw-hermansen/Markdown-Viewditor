// @vitest-environment jsdom
/**
 * Tests for the "print" render variant used by the PDF export on macOS:
 * foreignObject-free (text-label) SVGs that survive the WKWebView capture,
 * and the prepareMermaidForPrint swap that installs them into the print
 * clone. Runs against the real jsdom document (data-theme attributes instead
 * of stubbed globals) because the swap manipulates real DOM subtrees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMermaidCache,
  preRenderMermaidBlocks,
  prepareMermaidForPrint,
  renderMermaid,
  renderMermaidSvgForPrint,
} from "../renderer";
import { MERMAID_OPTIONS_SCHEMA } from "../schema";

const VIEWER_SVG = [
  '<svg id="diagram" width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320">',
  '<foreignObject width="20" height="20"><div xmlns="http://www.w3.org/1999/xhtml" class="label">Label</div></foreignObject>',
  "</svg>",
].join("");

const PRINT_SVG = [
  '<svg id="diagram" width="100%" height="auto" style="max-width: 640px;" viewBox="0 0 640 320">',
  "<style>.label { font-family: inherit; }</style>",
  '<text class="label">Label</text>',
  "</svg>",
].join("");

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function setAppTheme(type: "default" | "dark", themeId?: string): void {
  document.documentElement.setAttribute("data-theme", type);
  document.documentElement.setAttribute(
    "data-theme-id",
    themeId ?? (type === "dark" ? "github-dark" : "github-light"),
  );
}

function fenceToken(content: string): {
  type: "fence";
  info: string;
  content: string;
} {
  return { type: "fence", info: "mermaid", content };
}

async function renderViewerBlock(
  source: string,
  options: Record<string, unknown>,
): Promise<HTMLDivElement> {
  await preRenderMermaidBlocks(
    [fenceToken(source)],
    {},
    MERMAID_OPTIONS_SCHEMA,
  );
  const root = document.createElement("div");
  root.innerHTML = renderMermaid(source, options);
  return root;
}

function renderCallCount(prefix: string): number {
  return mermaidMock.render.mock.calls.filter(([id]) =>
    String(id).startsWith(prefix),
  ).length;
}

describe("mermaid print variant (PDF clone)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    clearMermaidCache();
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockImplementation(async (id: string) => ({
      svg: String(id).startsWith("mmd-print-") ? PRINT_SVG : VIEWER_SVG,
    }));
    setAppTheme("default");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("renderMermaidSvgForPrint", () => {
    it("uses text labels with the viewer theme and inherited font", async () => {
      setAppTheme("dark");

      await renderMermaidSvgForPrint("graph LR\n    A-->B");

      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "dark",
          fontFamily: "inherit",
          htmlLabels: false,
          journey: { textPlacement: "tspan" },
          timeline: { textPlacement: "tspan" },
          sequence: { textPlacement: "tspan" },
          c4: { textPlacement: "tspan" },
        }),
      );
      expect(mermaidMock.render).toHaveBeenCalledWith(
        expect.stringMatching(/^mmd-print-/),
        "graph LR\n    A-->B",
      );
    });

    it("normalizes dimensions and namespaces ids per call", async () => {
      const first = await renderMermaidSvgForPrint("graph LR\n    A-->B");
      const second = await renderMermaidSvgForPrint("graph LR\n    A-->B");

      expect(first).toContain('width="640"');
      expect(first).toContain('height="320"');
      expect(first).not.toContain("max-width: 640px");
      expect(first).toMatch(/id="mmd-print-\d+-diagram"/);
      expect(second).toMatch(/id="mmd-print-\d+-diagram"/);
      // Namespacing is applied per call so several embeds never collide.
      expect(first).not.toEqual(second);
    });

    it("keeps font-family: inherit for the in-document clone", async () => {
      const svg = await renderMermaidSvgForPrint("graph LR\n    A-->B");

      // Unlike the export variant, fonts are NOT materialized: the clone is
      // a live HTML document where `inherit` resolves like in the viewer.
      expect(svg).toContain("font-family: inherit");
      expect(svg).not.toContain("trebuchet");
    });

    it("caches print renders without re-rendering", async () => {
      await renderMermaidSvgForPrint("graph LR\n    A-->B");
      await renderMermaidSvgForPrint("graph LR\n    A-->B");

      expect(renderCallCount("mmd-print-")).toBe(1);
    });

    it("keeps the print cache separate from the viewer cache", async () => {
      await preRenderMermaidBlocks(
        [fenceToken("graph LR\n    A-->B")],
        {},
        MERMAID_OPTIONS_SCHEMA,
      );
      await renderMermaidSvgForPrint("graph LR\n    A-->B");

      expect(renderCallCount("mmd-print-")).toBe(1);
      expect(renderCallCount("mmd-")).toBe(2);
    });
  });

  describe("prepareMermaidForPrint", () => {
    it("swaps wrapper SVGs for the print variant and drops foreignObject", async () => {
      const source = "graph LR\n    A-->B\n";
      const root = await renderViewerBlock(source, {
        align: "left",
        maxWidth: 400,
      });
      expect(root.querySelector("foreignObject")).not.toBeNull();

      await prepareMermaidForPrint(root);

      expect(root.querySelector("foreignObject")).toBeNull();
      expect(root.querySelector("text.label")).not.toBeNull();
      expect(root.innerHTML).toMatch(/id="mmd-print-\d+-diagram"/);
      // Wrapper markup (host options, scroll-sync anchor, source tag) stays.
      expect(root.innerHTML).toContain('data-mermaid-id="');
      expect(root.innerHTML).toContain('data-align="left"');
      expect(root.innerHTML).toContain("--mermaid-max-width: 400px");
    });

    it("keeps the scroll wrapper on fitToWidth=false blocks", async () => {
      const source = "graph LR\n    A-->B\n";
      const root = await renderViewerBlock(source, { fitToWidth: false });

      await prepareMermaidForPrint(root);

      const scroll = root.querySelector(".mermaid-scroll-content");
      expect(scroll).not.toBeNull();
      expect(scroll!.querySelector("foreignObject")).toBeNull();
      expect(scroll!.querySelector("text.label")).not.toBeNull();
    });

    it("leaves error blocks untouched", async () => {
      clearMermaidCache();
      const root = document.createElement("div");
      root.innerHTML = renderMermaid("graph LR", {});
      expect(root.querySelector(".mermaid-error-block")).not.toBeNull();

      await prepareMermaidForPrint(root);

      expect(root.querySelector(".mermaid-error-block")).not.toBeNull();
      expect(root.querySelector(".mermaid-error")).not.toBeNull();
      expect(renderCallCount("mmd-print-")).toBe(0);
    });

    it("ignores blocks whose source is unknown", async () => {
      const root = document.createElement("div");
      root.innerHTML =
        '<div class="mermaid-block" data-mermaid-id="999"><svg id="old"></svg></div>';

      await prepareMermaidForPrint(root);

      expect(root.innerHTML).toContain('id="old"');
      expect(mermaidMock.render).not.toHaveBeenCalled();
    });

    it("renders each distinct source once across blocks", async () => {
      const source = "graph LR\n    A-->B\n";
      const root = await renderViewerBlock(source, {});
      root.appendChild(document.createElement("div")).innerHTML = renderMermaid(
        source,
        {},
      );

      await prepareMermaidForPrint(root);

      expect(renderCallCount("mmd-print-")).toBe(1);
      expect(root.querySelectorAll("foreignObject")).toHaveLength(0);
      expect(root.querySelectorAll("text.label")).toHaveLength(2);
    });

    it("keeps the viewer SVG when the print render fails", async () => {
      const source = "graph LR\n    A-->B\n";
      const root = await renderViewerBlock(source, {});
      mermaidMock.render.mockImplementation(async (id: string) => {
        if (String(id).startsWith("mmd-print-")) {
          throw new Error("render failed");
        }
        return { svg: VIEWER_SVG };
      });

      await expect(prepareMermaidForPrint(root)).resolves.toBeUndefined();

      expect(root.querySelector("foreignObject")).not.toBeNull();
    });

    it("forgets sources when the cache is cleared", async () => {
      const source = "graph LR\n    A-->B\n";
      const root = await renderViewerBlock(source, {});

      clearMermaidCache();
      await prepareMermaidForPrint(root);

      expect(root.querySelector("foreignObject")).not.toBeNull();
      expect(renderCallCount("mmd-print-")).toBe(0);
    });
  });
});
