// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Viewer from "../Viewer.svelte";
import { viewerState } from "$lib/stores/viewer.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

const {
  mockFileState,
  mockRenderMarkdown,
  mockOpenUrl,
  mockOpenPath,
  mockSyncViewerBackground,
} = vi.hoisted(() => ({
  mockFileState: { currentFile: "/home/user/test.md" },
  mockRenderMarkdown: vi.fn().mockResolvedValue({
    html: "<h1>Hello World</h1><p>Test content</p>",
    frontmatter: null,
  }),
  mockOpenUrl: vi.fn().mockResolvedValue(undefined),
  mockOpenPath: vi.fn().mockResolvedValue(undefined),
  mockSyncViewerBackground: vi.fn(),
}));

vi.mock(
  "$lib/stores/viewer.svelte",
  () => import("./viewer-state-mock.svelte"),
);

vi.mock("$lib/stores/file.svelte", () => ({
  fileState: mockFileState,
}));

vi.mock("$lib/utils/markdown", () => ({
  renderMarkdown: mockRenderMarkdown,
  syncViewerBackground: mockSyncViewerBackground,
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
    viewerState.theme = "github-dark";
    viewerState.scrollTop = 0;
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

  it("derives the app background (--viewer-bg) once mounted", async () => {
    // The theme background copy must happen here, not from a startup rAF:
    // see syncViewerBackground in utils/markdown.ts.
    render(Viewer, { props: { content: "# Hello" } });
    await waitFor(() => {
      expect(mockSyncViewerBackground).toHaveBeenCalled();
    });
  });

  it("renders immediately on first load, debounces subsequent changes", async () => {
    const { rerender } = render(Viewer, { props: { content: "initial" } });
    // First render is immediate — no debounce.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(1);

    // Subsequent content changes are debounced by 150 ms.
    rerender({ content: "updated" });
    await vi.advanceTimersByTimeAsync(50);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(2);
  });

  it("waitForRender waits for an initial render and the DOM flush", async () => {
    let resolveInitial!: (result: { html: string; frontmatter: null }) => void;
    const initialRender = new Promise<{
      html: string;
      frontmatter: null;
    }>((resolve) => {
      resolveInitial = resolve;
    });
    mockRenderMarkdown.mockImplementationOnce(() => initialRender);

    const view = render(Viewer, { props: { content: "initial" } });
    let ready = false;
    const renderReady = view.component.waitForRender().then(() => {
      ready = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(ready).toBe(false);
    expect(
      screen.queryByText("Delayed initial render"),
    ).not.toBeInTheDocument();

    resolveInitial({
      html: "<p>Delayed initial render</p>",
      frontmatter: null,
    });
    await renderReady;

    expect(screen.getByText("Delayed initial render")).toBeInTheDocument();
  });

  it("does not let a stale initial render replace newer content", async () => {
    let resolveInitial!: (result: { html: string; frontmatter: null }) => void;
    const initialRender = new Promise<{
      html: string;
      frontmatter: null;
    }>((resolve) => {
      resolveInitial = resolve;
    });
    mockRenderMarkdown
      .mockImplementationOnce(() => initialRender)
      .mockResolvedValueOnce({
        html: "<p>Current content</p>",
        frontmatter: null,
      });

    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);

    view.rerender({ content: "current" });
    await view.component.waitForRender();
    expect(screen.getByText("Current content")).toBeInTheDocument();

    resolveInitial({ html: "<p>Stale content</p>", frontmatter: null });
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText("Current content")).toBeInTheDocument();
    expect(screen.queryByText("Stale content")).not.toBeInTheDocument();
  });

  it("renders frontmatter card when present", async () => {
    mockRenderMarkdown.mockResolvedValueOnce({
      html: "<p>Content</p>",
      frontmatter: { name: "test-skill", description: "A test skill" },
    });
    render(Viewer, {
      props: { content: "---\nname: test-skill\n---\nContent" },
    });
    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(screen.getByText("test-skill")).toBeInTheDocument();
      expect(screen.getByText("Skill")).toBeInTheDocument();
    });
  });

  it("renders regular frontmatter when name/description not both present", async () => {
    mockRenderMarkdown.mockResolvedValueOnce({
      html: "<p>Content</p>",
      frontmatter: { license: "MIT" },
    });
    render(Viewer, { props: { content: "---\nlicense: MIT\n---\nContent" } });
    await vi.advanceTimersByTimeAsync(0);
    await waitFor(() => {
      expect(screen.getByText("MIT")).toBeInTheDocument();
    });
    expect(screen.queryByText("Frontmatter")).not.toBeInTheDocument();
    expect(screen.queryByText("Skill")).not.toBeInTheDocument();
  });

  it("forceRender recreates the DOM even when the HTML is unchanged", async () => {
    const view = render(Viewer, { props: { content: "# Hello World" } });
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(0);

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
    await vi.advanceTimersByTimeAsync(0);

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

  it("never shows the busy overlay for routine content re-renders", async () => {
    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(1);

    let resolveUpdate!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    view.rerender({ content: "updated" });
    // Past the debounce: the render has started and is still pending —
    // a major render would have raised the overlay at this point.
    await vi.advanceTimersByTimeAsync(160);
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();

    resolveUpdate({ html: "<p>Updated</p>", frontmatter: null });
    await view.component.waitForRender();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
  });

  it("shows the busy overlay for a theme change immediately while the render is pending", async () => {
    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(1);

    let resolveTheme!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTheme = resolve;
        }),
    );

    viewerState.theme = "github-light";
    // Theme-change renders are major: they start without the debounce and
    // raise the overlay at once.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRenderMarkdown).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Rendering…")).toBeInTheDocument();

    resolveTheme({ html: "<p>Themed</p>", frontmatter: null });
    await view.component.waitForRender();
    expect(screen.getByText("Themed")).toBeInTheDocument();
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
  });

  it("shows the busy overlay for the first render while it is pending", async () => {
    let resolveInitial!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        }),
    );

    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("Rendering…")).toBeInTheDocument();

    resolveInitial({ html: "<p>First</p>", frontmatter: null });
    await view.component.waitForRender();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
  });

  it("shows the busy overlay during forceRender and hides it once the DOM updates", async () => {
    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);

    let resolveForce!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveForce = resolve;
        }),
    );
    const done = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("Rendering…")).toBeInTheDocument();

    resolveForce({ html: "<p>Reloaded</p>", frontmatter: null });
    await done;
    expect(screen.getByText("Reloaded")).toBeInTheDocument();
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
  });

  it("drops the overlay when a major render is superseded and a stale settle cannot revive it", async () => {
    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);

    let resolveStale!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({ html: "<p>Current</p>", frontmatter: null });

    // Reload (major) raises the overlay and stays pending …
    const done = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("Rendering…")).toBeInTheDocument();

    // … until a routine content render supersedes it. Routine renders never
    // show the overlay, so it must drop immediately.
    view.rerender({ content: "current" });
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();

    // The superseded render settling late must not touch the overlay or the DOM.
    resolveStale({ html: "<p>Stale</p>", frontmatter: null });
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(screen.queryByText("Rendering…")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
  });

  it("keeps the re-render overlay non-blocking (pointer-events: none class)", async () => {
    const view = render(Viewer, { props: { content: "initial" } });
    await vi.advanceTimersByTimeAsync(0);

    let resolveForce!: (result: { html: string; frontmatter: null }) => void;
    mockRenderMarkdown.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveForce = resolve;
        }),
    );
    const done = view.component.forceRender();
    await vi.advanceTimersByTimeAsync(0);

    const overlay = document.querySelector(".loading-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains("rendering-overlay")).toBe(true);

    resolveForce({ html: "<p>Done</p>", frontmatter: null });
    await done;
  });

  it("keeps the file-open overlay blocking with its 'Loading…' label", async () => {
    render(Viewer, { props: { content: "initial", loading: true } });
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    const overlay = document.querySelector(".loading-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.classList.contains("rendering-overlay")).toBe(false);
  });

  it.skip("has no accessibility violations", async () => {
    // TODO: Fix timeout issue with $effect and tick()
    const { container } = render(Viewer, {
      props: { content: "# Hello World" },
    });
    await vi.advanceTimersByTimeAsync(200);
    await checkA11y(container);
  });
});
