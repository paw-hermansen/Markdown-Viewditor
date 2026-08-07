import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

import { buildStandaloneHtml } from "../document";

describe("buildStandaloneHtml", () => {
  beforeEach(() => {
    // jsdom-less test: document.styleSheets is unavailable; the builder
    // falls back to the cssText option.
  });

  it("produces a doctype, <title>, and an inlined <style>", async () => {
    const { html, warnings } = await buildStandaloneHtml(
      "<h1>Hello</h1>",
      null,
      "Doc",
      { cssText: "body{color:red}" },
    );
    expect(warnings).toEqual([]);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Doc</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("body{color:red}");
    expect(html).toContain("<h1>Hello</h1>");
  });

  it("derives <title> from frontmatter.name", async () => {
    const { html } = await buildStandaloneHtml(
      "<p>x</p>",
      { name: "My Skill" },
      "file",
      {
        cssText: "",
      },
    );
    expect(html).toContain("<title>My Skill</title>");
  });

  it("derives <title> from frontmatter.title when name is absent", async () => {
    const { html } = await buildStandaloneHtml(
      "<p>x</p>",
      { title: "Doc Title" },
      "file",
      {
        cssText: "",
      },
    );
    expect(html).toContain("<title>Doc Title</title>");
  });

  it("escapes the title", async () => {
    const { html } = await buildStandaloneHtml(
      "<p>x</p>",
      null,
      "<script>x</script>",
      {
        cssText: "",
      },
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<title><script>");
  });

  it("inlines url() font assets from the collected CSS", async () => {
    const cssText = '@font-face{src:url(fonts/F.woff2) format("woff2")}';
    const fontBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;
    const { html, warnings } = await buildStandaloneHtml(
      "<p>x</p>",
      null,
      "d",
      {
        cssText,
        fetchImpl,
      },
    );
    expect(warnings).toEqual([]);
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("fonts/F.woff2");
  });

  it("inlines localimg image srcs via invokeImpl", async () => {
    const filePath = "/img.png";
    const encodedPath = encodeURIComponent(filePath);
    const htmlBody = `<img src="localimg://localhost/${encodedPath}" alt="x">`;
    const base64 = "iVBORw0=";
    const invokeImpl = vi.fn(async (cmd: string) => {
      if (cmd === "read_file_as_base64") return base64;
      throw new Error(`Unexpected: ${cmd}`);
    }) as unknown as (
      cmd: string,
      args?: Record<string, unknown>,
    ) => Promise<unknown>;
    const { html, warnings } = await buildStandaloneHtml(htmlBody, null, "d", {
      cssText: "",
      invokeImpl,
    });
    expect(warnings).toEqual([]);
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("localimg://");
    expect(invokeImpl).toHaveBeenCalledWith("read_file_as_base64", {
      path: filePath,
    });
  });

  it("wraps the body in a .viewer-content container", async () => {
    const { html } = await buildStandaloneHtml("<p>hi</p>", null, "d", {
      cssText: "",
    });
    expect(html).toContain('class="viewer-content"');
    expect(html).toContain('id="viewer-content"');
  });
});
