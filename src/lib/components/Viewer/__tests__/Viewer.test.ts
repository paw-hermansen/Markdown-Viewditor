// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  resolveLink: vi.fn((href: string, base: string) => {
    if (href.startsWith("http")) return { kind: "url", url: href };
    if (href.startsWith("#")) return { kind: "anchor", id: href.slice(1) };
    return { kind: "local-path", path: href };
  }),
}));

describe("Viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

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
});
