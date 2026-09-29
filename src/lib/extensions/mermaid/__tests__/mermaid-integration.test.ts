import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

import { renderMarkdown } from "$lib/utils/markdown";
import { clearMermaidCache } from "../renderer";

describe("Mermaid Markdown integration", () => {
  beforeEach(() => {
    clearMermaidCache();
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 120 60"><g /></svg>',
    });
  });

  it("applies positional directives without affecting earlier diagrams", async () => {
    const source = [
      "```mermaid",
      "graph LR",
      "    A-->B",
      "```",
      "",
      "<!-- mermaid: align=left maxWidth=600 -->",
      "",
      "```mermaid",
      "graph LR",
      "    C-->D",
      "```",
      "",
      "<!-- mermaid: fitToWidth=false -->",
      "",
      "```mermaid",
      "graph LR",
      "    E-->F",
      "```",
    ].join("\n");

    const result = await renderMarkdown(source);
    const wrappers = [
      ...result.html.matchAll(/<div[^>]*class="mermaid-block[^>]*>/g),
    ].map(([wrapper]) => wrapper);

    expect(wrappers).toHaveLength(3);
    expect(wrappers[0]).toContain('data-align="center"');
    expect(wrappers[0]).toContain("--mermaid-max-width: 800px");
    expect(wrappers[0]).not.toContain('data-fit-to-width="false"');
    expect(wrappers[1]).toContain('data-align="left"');
    expect(wrappers[1]).toContain("--mermaid-max-width: 600px");
    expect(wrappers[1]).not.toContain('data-fit-to-width="false"');
    expect(wrappers[2]).toContain('data-align="left"');
    expect(wrappers[2]).toContain("--mermaid-max-width: 600px");
    expect(wrappers[2]).toContain('data-fit-to-width="false"');
    expect(mermaidMock.render).toHaveBeenCalledTimes(3);
  });
});
