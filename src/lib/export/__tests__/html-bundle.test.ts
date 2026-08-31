// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  extractFonts,
  extractImages,
  buildBundleHtml,
  htmlBundleExporter,
  stripKatexFontFaces,
} from "../exporters/html-bundle";
import { registerBuiltinExporters, getExporter } from "../registry.svelte";

describe("extractFonts", () => {
  it("extracts same-origin font url() references and rewrites CSS", async () => {
    const fontBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;

    const css =
      '@font-face{src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2")}';
    const result = await extractFonts(css, fetchImpl);

    expect(result.warnings).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].zipPath).toBe("fonts/KaTeX_Main-Regular.woff2");
    expect(result.entries[0].data).toEqual(fontBytes);
    expect(result.css).toContain("url(fonts/KaTeX_Main-Regular.woff2)");
  });

  it("skips absolute URLs", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const css = "@font-face{src:url(https://example.com/font.woff2)}";
    const result = await extractFonts(css, fetchImpl);
    expect(result.entries).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deduplicates the same font appearing in multiple rules", async () => {
    const fontBytes = new Uint8Array([5, 6]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;

    const css =
      "@font-face{src:url(fonts/F.woff2)} @font-face{src:url(fonts/F.woff2)}";
    const result = await extractFonts(css, fetchImpl);
    expect(result.entries).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records warning on fetch failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;

    const css = "@font-face{src:url(fonts/F.woff2)}";
    const result = await extractFonts(css, fetchImpl);
    expect(result.entries).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("could not be extracted");
  });
});

describe("stripKatexFontFaces", () => {
  it("removes @font-face blocks with KaTeX_ font-family", () => {
    const css = `
@font-face {
  font-family: KaTeX_Main;
  src: url(fonts/KaTeX_Main-Regular.woff2);
}
@font-face {
  font-family: MyApp;
  src: url(fonts/app.woff2);
}`;
    const result = stripKatexFontFaces(css);
    expect(result).not.toContain("KaTeX_Main");
    expect(result).toContain("MyApp");
    expect(result).toContain("app.woff2");
  });

  it("removes multiple KaTeX @font-face blocks", () => {
    const css =
      "@font-face{font-family:KaTeX_AMS;src:url(a.woff2)}" +
      "@font-face{font-family:KaTeX_Fraktur;src:url(b.woff2)}" +
      "@font-face{font-family:App;src:url(c.woff2)}";
    const result = stripKatexFontFaces(css);
    expect(result).not.toContain("KaTeX_");
    expect(result).toContain("App");
  });

  it("returns CSS unchanged when no KaTeX blocks present", () => {
    const css = "@font-face{font-family:App;src:url(app.woff2)}";
    const result = stripKatexFontFaces(css);
    expect(result).toBe(css);
  });

  it("handles empty CSS", () => {
    expect(stripKatexFontFaces("")).toBe("");
  });
});

describe("extractImages", () => {
  it("extracts localimg:// images and rewrites src to images/", async () => {
    const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const base64 = btoa(String.fromCharCode(...imgBytes));
    const invokeImpl = vi.fn(async (cmd: string) => {
      if (cmd === "read_file_as_base64") return base64;
      throw new Error(`Unexpected: ${cmd}`);
    });

    const html = '<img src="localimg://localhost/%2Ftmp%2Fphoto.png" alt="x">';
    const result = await extractImages(html, invokeImpl);

    expect(result.warnings).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].zipPath).toBe("images/photo.png");
    expect(result.entries[0].data).toEqual(imgBytes);
    expect(result.html).toContain('src="images/photo.png"');
    expect(result.html).not.toContain("localimg://");
  });

  it("handles filename collisions with counter suffix", async () => {
    const imgBytes = new Uint8Array([1, 2]);
    const base64 = btoa(String.fromCharCode(...imgBytes));
    const invokeImpl = vi.fn(async () => base64);

    const html =
      '<img src="localimg://localhost/%2Fa%2Flogo.png">' +
      '<img src="localimg://localhost/%2Fb%2Flogo.png">';
    const result = await extractImages(html, invokeImpl);

    expect(result.entries).toHaveLength(2);
    const paths = result.entries.map((e) => e.zipPath);
    expect(paths).toContain("images/logo.png");
    expect(paths).toContain("images/logo-1.png");
  });

  it("leaves non-local image URLs untouched", async () => {
    const invokeImpl = vi.fn();
    const html = '<img src="https://example.com/photo.jpg" alt="x">';
    const result = await extractImages(html, invokeImpl);
    expect(result.entries).toEqual([]);
    expect(result.html).toBe(html);
  });

  it("records warning and preserves src on read failure", async () => {
    const invokeImpl = vi.fn(async () => {
      throw new Error("read failed");
    });
    const html = '<img src="localimg://localhost/%2Fbad%2Fimg.png" alt="x">';
    const result = await extractImages(html, invokeImpl);
    expect(result.entries).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("could not be extracted");
    expect(result.html).toContain("localimg://");
  });
});

describe("buildBundleHtml", () => {
  it("produces HTML with relative font and image paths", async () => {
    const fontBytes = new Uint8Array([10, 20]);
    const imgBytes = new Uint8Array([30, 40]);
    const imgBase64 = btoa(String.fromCharCode(...imgBytes));

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;

    const invokeImpl = vi.fn(async (cmd: string) => {
      if (cmd === "read_file_as_base64") return imgBase64;
      throw new Error(`Unexpected: ${cmd}`);
    });

    const htmlBody =
      '<p>Hi</p><img src="localimg://localhost/%2Fimg%2Fpic.png" alt="x">';
    const result = await buildBundleHtml(htmlBody, null, "doc", {
      cssText: "@font-face{src:url(fonts/F.woff2)}",
      fetchImpl,
      invokeImpl,
    });

    expect(result.warnings).toEqual([]);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<title>doc</title>");
    expect(result.html).toContain('src="images/pic.png"');
    expect(result.html).toContain("url(fonts/F.woff2)");
    expect(result.fontEntries).toHaveLength(1);
    expect(result.imageEntries).toHaveLength(1);
  });

  it("derives <title> from frontmatter.name", async () => {
    const result = await buildBundleHtml(
      "<p>x</p>",
      { name: "My Skill" },
      "f",
      { cssText: "" },
    );
    expect(result.html).toContain("<title>My Skill</title>");
  });

  it("derives <title> from frontmatter.title when name is absent", async () => {
    const result = await buildBundleHtml(
      "<p>x</p>",
      { title: "Doc Title" },
      "f",
      { cssText: "" },
    );
    expect(result.html).toContain("<title>Doc Title</title>");
  });

  it("escapes the title", async () => {
    const result = await buildBundleHtml(
      "<p>x</p>",
      null,
      "<script>x</script>",
      {
        cssText: "",
      },
    );
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<title><script>");
  });

  it("wraps the body in a .viewer-content container", async () => {
    const result = await buildBundleHtml("<p>hi</p>", null, "d", {
      cssText: "",
    });
    expect(result.html).toContain('class="viewer-content"');
    expect(result.html).toContain('id="viewer-content"');
  });

  it("strips KaTeX fonts when document has no math", async () => {
    const appFontBytes = new Uint8Array([1, 2]);
    const katexFontBytes = new Uint8Array([3, 4]);
    const fetchImpl = vi.fn(async (href: string) => ({
      ok: true,
      status: 200,
      headers: new Map([
        [
          "content-type",
          (href as string).includes("KaTeX") ? "font/woff2" : "font/woff2",
        ],
      ]),
      arrayBuffer: async () =>
        (href as string).includes("KaTeX")
          ? katexFontBytes.buffer
          : appFontBytes.buffer,
    })) as unknown as typeof fetch;

    const css =
      "@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2)}" +
      "@font-face{font-family:AppFont;src:url(fonts/app.woff2)}";
    const result = await buildBundleHtml("<p>no math here</p>", null, "d", {
      cssText: css,
      fetchImpl,
    });

    expect(result.fontEntries).toHaveLength(1);
    expect(result.fontEntries[0].zipPath).toBe("fonts/app.woff2");
    expect(result.html).not.toContain("KaTeX_Main");
    expect(result.html).toContain("AppFont");
  });

  it("includes KaTeX fonts when document has math", async () => {
    const fontBytes = new Uint8Array([5, 6]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "font/woff2"]]),
      arrayBuffer: async () => fontBytes.buffer,
    })) as unknown as typeof fetch;

    const css =
      "@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2)}" +
      "@font-face{font-family:AppFont;src:url(fonts/app.woff2)}";
    const htmlWithMath =
      '<p>Math: <span class="katex"><span>x</span></span></p>';
    const result = await buildBundleHtml(htmlWithMath, null, "d", {
      cssText: css,
      fetchImpl,
    });

    expect(result.fontEntries).toHaveLength(2);
    const paths = result.fontEntries.map((e) => e.zipPath);
    expect(paths).toContain("fonts/KaTeX_Main-Regular.woff2");
    expect(paths).toContain("fonts/app.woff2");
  });
});

describe("htmlBundleExporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is registered by registerBuiltinExporters", async () => {
    await registerBuiltinExporters();
    const exporter = getExporter("html-bundle");
    expect(exporter).toBeDefined();
    expect(exporter!.label).toBe("Export as HTML Bundle");
    expect(exporter!.extension).toBe("zip");
  });

  it("shows save dialog and writes a zip via write_file_binary", async () => {
    vi.mocked(save).mockResolvedValue("/tmp/out.zip");
    vi.mocked(invoke).mockResolvedValue(undefined);

    const result = await htmlBundleExporter.export({
      markdown: "# Hi",
      html: "<h1>Hi</h1>",
      frontmatter: null,
      fileName: "doc",
      tokens: [],
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith("write_file_binary", {
      path: "/tmp/out.zip",
      content: expect.any(Array),
    });
    expect(result.savedPath).toBe("/tmp/out.zip");
  });

  it("returns without writing when save dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const result = await htmlBundleExporter.export({
      markdown: "",
      html: "",
      frontmatter: null,
      fileName: "d",
      tokens: [],
    });
    expect(result.savedPath).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});
