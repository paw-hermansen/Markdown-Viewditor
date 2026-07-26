// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Viewer from "../Viewer.svelte";

const {
  mockViewerState,
  mockFileState,
  mockRenderMarkdown,
  mockOpenUrl,
  mockOpenPath,
} = vi.hoisted(() => ({
  mockViewerState: { theme: "github-dark", scrollTop: 0 },
  mockFileState: { currentFile: "/home/user/test.md" },
  mockRenderMarkdown: vi.fn().mockResolvedValue({
    html: "<h1>Hello World</h1><p>Test content</p>",
    frontmatter: null,
  }),
  mockOpenUrl: vi.fn().mockResolvedValue(undefined),
  mockOpenPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  viewerState: mockViewerState,
}));

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: mockFileState,
}));

vi.mock("$lib/utils/markdown", () => ({
  renderMarkdown: mockRenderMarkdown,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mockOpenUrl,
  openPath: mockOpenPath,
}));

vi.mock("$lib/utils/path", () => ({
  resolveLink: vi.fn((href: string) => {
    if (href.startsWith("http")) return { kind: "url", url: href };
    if (href.startsWith("#")) return { kind: "anchor", id: href.slice(1) };
    return { kind: "local-path", path: href };
  }),
}));

describe("Viewer", () => {
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  function makeRect(top: number, bottom: number): DOMRect {
    return {
      x: 0,
      y: top,
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  // Simulate layout: the viewer container's top edge sits at y=100 and the
  // data-line="5" paragraph's screen position responds to scroll changes.
  function stubAnchorRects(getParaTop: () => number) {
    HTMLElement.prototype.getBoundingClientRect = function (
      this: HTMLElement,
    ): DOMRect {
      if (this.classList.contains("viewer-container")) {
        return makeRect(100, 600);
      }
      if (this.getAttribute("data-line") === "5") {
        const top = getParaTop();
        return makeRect(top, top + 20);
      }
      return originalGetBoundingClientRect.call(this);
    };
  }

  it("renders markdown content as HTML after debounce", async () => {
    render(Viewer, { props: { content: "# Hello World" } });
    await vi.advanceTimersByTimeAsync(200);
    expect(mockRenderMarkdown).toHaveBeenCalledWith(
      "# Hello World",
      "/home/user/test.md",
    );
  });

  it("calls onViewerReady with viewer element", async () => {
    const onViewerReady = vi.fn();
    render(Viewer, { props: { content: "# Test", onViewerReady } });
    await waitFor(() => {
      expect(onViewerReady).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });
  });

  it("debounces rendering on rapid content changes", async () => {
    render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(50);
    expect(mockRenderMarkdown).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(1);
  });

  it("renders frontmatter card when present", async () => {
    mockRenderMarkdown.mockResolvedValueOnce({
      html: "<p>Content</p>",
      frontmatter: { name: "test-skill", description: "A test skill" },
    });
    render(Viewer, {
      props: { content: "---\nname: test-skill\n---\nContent" },
    });
    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => {
      expect(screen.getByText("test-skill")).toBeInTheDocument();
    });
  });

  it("renders regular frontmatter when name/description not both present", async () => {
    mockRenderMarkdown.mockResolvedValueOnce({
      html: "<p>Content</p>",
      frontmatter: { license: "MIT" },
    });
    render(Viewer, { props: { content: "---\nlicense: MIT\n---\nContent" } });
    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => {
      expect(screen.getByText("Frontmatter")).toBeInTheDocument();
    });
  });

  it("forceRender recreates the DOM even when the HTML is unchanged", async () => {
    const view = render(Viewer, { props: { content: "# Hello World" } });
    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    const heading = screen.getByText("Hello World");
    heading.setAttribute("data-marker", "stale");

    await view.component.forceRender();

    const recreated = screen.getByText("Hello World");
    expect(recreated).not.toBe(heading);
    expect(recreated.hasAttribute("data-marker")).toBe(false);
  });

  it("forceRender restores the scroll position", async () => {
    const view = render(Viewer, { props: { content: "# Hello World" } });
    await vi.advanceTimersByTimeAsync(200);
    await waitFor(() => {
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    const container = document.querySelector(
      ".viewer-container",
    ) as HTMLDivElement;
    container.scrollTop = 123;

    await view.component.forceRender();

    expect(container.scrollTop).toBe(123);
  });

  it("forceRender appends a cache-busting parameter to external and local image URLs", async () => {
    mockRenderMarkdown.mockResolvedValue({
      html:
        '<p><img src="https://picsum.photos/128" alt="pic"></p>' +
        '<p><img src="localimg://localhost/img.png" alt="local"></p>' +
        '<p><img src="https://example.com/a.png?x=1" alt="has-query"></p>',
      frontmatter: null,
    });
    const view = render(Viewer, { props: { content: "images" } });
    await vi.advanceTimersByTimeAsync(200);

    const renderDone = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(2100);
    await renderDone;

    const imgs = document.querySelectorAll("img");
    expect(imgs[0].getAttribute("src")).toMatch(
      /^https:\/\/picsum\.photos\/128\?_r=\d+$/,
    );
    expect(imgs[1].getAttribute("src")).toMatch(
      /^localimg:\/\/localhost\/img\.png\?_r=\d+$/,
    );
    expect(imgs[2].getAttribute("src")).toMatch(
      /^https:\/\/example\.com\/a\.png\?x=1&_r=\d+$/,
    );
  });

  it("forceRender uses a fresh cache-busting nonce on each call", async () => {
    mockRenderMarkdown.mockResolvedValue({
      html: '<p><img src="https://picsum.photos/128" alt="pic"></p>',
      frontmatter: null,
    });
    const view = render(Viewer, { props: { content: "images" } });
    await vi.advanceTimersByTimeAsync(200);

    const firstRender = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(2100);
    await firstRender;
    const first = document.querySelector("img")?.getAttribute("src");
    const secondRender = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(2100);
    await secondRender;
    const second = document.querySelector("img")?.getAttribute("src");

    expect(first).not.toBe(second);
  });

  it("forceRender leaves data: image URLs untouched", async () => {
    mockRenderMarkdown.mockResolvedValue({
      html: '<p><img src="data:image/png;base64,AAA" alt="inline"></p>',
      frontmatter: null,
    });
    const view = render(Viewer, { props: { content: "images" } });
    await vi.advanceTimersByTimeAsync(200);

    const renderDone = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(2100);
    await renderDone;

    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("forceRender compensates a layout shift via the data-line anchor", async () => {
    mockRenderMarkdown.mockResolvedValue({
      html: '<p data-line="5">Anchor</p>',
      frontmatter: null,
    });
    const view = render(Viewer, { props: { content: "anchor" } });
    await vi.advanceTimersByTimeAsync(200);

    const container = document.querySelector(
      ".viewer-container",
    ) as HTMLDivElement;
    container.scrollTop = 123;
    // Paragraph sits 10px above the container top at scrollTop=123; its
    // screen position tracks the scroll offset.
    let shift = 0;
    stubAnchorRects(() => 90 + shift + (123 - container.scrollTop));

    const renderDone = view.component.forceRender();
    shift = -5; // content above the anchor shrank by 5px during re-render
    await vi.advanceTimersByTimeAsync(2100);
    await renderDone;

    expect(container.scrollTop).toBe(118);
  });

  it("forceRender skips sub-pixel scroll adjustments", async () => {
    mockRenderMarkdown.mockResolvedValue({
      html: '<p data-line="5">Anchor</p>',
      frontmatter: null,
    });
    const view = render(Viewer, { props: { content: "anchor" } });
    await vi.advanceTimersByTimeAsync(200);

    const container = document.querySelector(
      ".viewer-container",
    ) as HTMLDivElement;
    container.scrollTop = 123;
    let shift = 0;
    stubAnchorRects(() => 90 + shift + (123 - container.scrollTop));

    const renderDone = view.component.forceRender();
    // At fractional devicePixelRatio, assigning scrollTop snaps the position
    // to whole device pixels (losing up to 1/dpr CSS px per assignment), so
    // sub-pixel adjustments must not touch scrollTop at all.
    shift = -0.3;
    await vi.advanceTimersByTimeAsync(2100);
    await renderDone;

    expect(container.scrollTop).toBe(123);
  });
});
