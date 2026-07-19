import { describe, it, expect, vi } from "vitest";

// renderMarkdown -> markdown-it's local-image plugin calls `convertFileSrc`
// from @tauri-apps/api/core, which requires `window`/`navigator`. The Node
// test environment doesn't have those, so mock the helper to expose the
// arguments it was called with via a deterministic URL form.
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("should render basic markdown", async () => {
    const result = await renderMarkdown("# Hello");
    expect(result.html).toContain("<h1");
    expect(result.html).toContain("Hello");
    expect(result.frontmatter).toBeNull();
  });

  it("should render paragraphs", async () => {
    const result = await renderMarkdown("Hello World");
    expect(result.html).toContain("<p");
    expect(result.html).toContain("Hello World");
  });

  it("should render bold text", async () => {
    const result = await renderMarkdown("**bold**");
    expect(result.html).toContain("<strong>");
    expect(result.html).toContain("bold");
  });

  it("should render italic text", async () => {
    const result = await renderMarkdown("*italic*");
    expect(result.html).toContain("<em>");
    expect(result.html).toContain("italic");
  });

  it("should render links", async () => {
    const result = await renderMarkdown("[link](https://example.com)");
    expect(result.html).toContain("<a");
    expect(result.html).toContain("https://example.com");
  });

  it("should render unordered lists", async () => {
    const result = await renderMarkdown("- item 1\n- item 2");
    expect(result.html).toContain("<ul");
    expect(result.html).toContain("<li>");
  });

  it("should render ordered lists", async () => {
    const result = await renderMarkdown("1. item 1\n2. item 2");
    expect(result.html).toContain("<ol");
    expect(result.html).toContain("<li>");
  });

  it("should render code blocks", async () => {
    const result = await renderMarkdown("```\nconst x = 1;\n```");
    expect(result.html).toContain("<pre>");
    expect(result.html).toContain("<code");
  });

  it("should render inline code", async () => {
    const result = await renderMarkdown("`code`");
    expect(result.html).toContain("<code>");
  });

  it("should render blockquotes", async () => {
    const result = await renderMarkdown("> quote");
    expect(result.html).toContain("<blockquote");
  });

  it("should render horizontal rules", async () => {
    // A single "---" with no closing delimiter is an <hr>, not frontmatter.
    const result = await renderMarkdown("---");
    expect(result.html).toContain("<hr");
    expect(result.frontmatter).toBeNull();
  });

  it("should handle empty content", async () => {
    const result = await renderMarkdown("");
    expect(result.html).toBe("");
    expect(result.frontmatter).toBeNull();
  });

  it("should return error message on parse failure", async () => {
    const result = await renderMarkdown(null as unknown as string);
    expect(result.html).toContain("Error rendering markdown");
    expect(result.frontmatter).toBeNull();
  });

  it("should strip frontmatter from body HTML", async () => {
    const result = await renderMarkdown(
      "---\nname: my-skill\ndescription: A skill.\n---\n\n# Body",
    );
    expect(result.html).not.toContain("<hr");
    expect(result.html).not.toContain("my-skill");
    expect(result.html).toContain("<h1");
    expect(result.html).toContain("Body");
  });

  it("should parse frontmatter into an object", async () => {
    const result = await renderMarkdown(
      "---\nname: my-skill\ndescription: A skill.\nlicense: MIT\n---\n\n# Body",
    );
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter?.name).toBe("my-skill");
    expect(result.frontmatter?.description).toBe("A skill.");
    expect(result.frontmatter?.license).toBe("MIT");
  });

  it("should detect a skill file when name and description are present", async () => {
    const result = await renderMarkdown(
      "---\nname: my-skill\ndescription: A skill.\n---\n\n# Body",
    );
    const isSkill =
      !!result.frontmatter?.name && !!result.frontmatter?.description;
    expect(isSkill).toBe(true);
  });

  it("should not treat plain metadata as a skill file", async () => {
    const result = await renderMarkdown(
      "---\ntitle: Some Doc\nauthor: Jane\n---\n\n# Body",
    );
    expect(result.frontmatter?.title).toBe("Some Doc");
    const isSkill =
      !!result.frontmatter?.name && !!result.frontmatter?.description;
    expect(isSkill).toBe(false);
  });

  it("should return null frontmatter for invalid YAML", async () => {
    // Unclosed flow mapping is invalid YAML.
    const result = await renderMarkdown(
      "---\nname: {unterminated\n---\n\n# Body",
    );
    expect(result.frontmatter).toBeNull();
    expect(result.html).toContain("<h1");
    expect(result.html).toContain("Body");
  });

  it("should not treat frontmatter not at the document start as frontmatter", async () => {
    const result = await renderMarkdown("# Title\n\n---\nname: late\n---\n");
    expect(result.frontmatter).toBeNull();
  });

  it("should render unchecked task list items", async () => {
    const result = await renderMarkdown("- [ ] todo item");
    expect(result.html).toContain("<input");
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).not.toContain("checked");
  });

  it("should render checked task list items", async () => {
    const result = await renderMarkdown("- [x] done item");
    expect(result.html).toContain("<input");
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain("checked");
  });

  it("should render footnotes", async () => {
    const result = await renderMarkdown(
      "Here is a footnote[^1].\n\n[^1]: This is the note.",
    );
    expect(result.html).toContain("<sup");
    expect(result.html).toContain("footnotes");
    expect(result.html).toContain("This is the note.");
  });

  it("should render footnote backref links", async () => {
    const result = await renderMarkdown("Text[^1].\n\n[^1]: Note content.");
    expect(result.html).toContain("footnote-backref");
    expect(result.html).toContain('href="#fnref1"');
  });

  it("should not tag footnote content with its original source data-line", async () => {
    // The `[^1]: note` definition lives on source line 3, but the footnote
    // plugin renders it at the bottom of the document. Its content must not
    // carry data-line="3", otherwise the viewer's line<->position mapping
    // becomes non-monotonic and scroll-sync breaks. The "After." paragraph on
    // line 5 keeps data-line="5"; the footnotes section is anchored to the
    // last line (5), not to the definition's source line (3).
    const result = await renderMarkdown(
      "Para[^1].\n\n[^1]: note text\n\nAfter.",
    );
    expect(result.html).not.toContain('data-line="3"');
    expect(result.html).toContain('data-line="5"');
  });

  it("should tag the footnotes section with the document's last line", async () => {
    // 5-line document -> the rendered footnotes section is anchored to the
    // last source line (5), so scrolling to the end of the editor lines up
    // with the footnotes section in the viewer.
    const result = await renderMarkdown(
      "Para[^1].\n\n[^1]: note text\n\nAfter.",
    );
    expect(result.html).toMatch(/<section class="footnotes" data-line="5">/);
  });

  it("should keep data-line values monotonic with rendered order for footnoted docs", async () => {
    // Mirrors Example.md: a footnote definition in the middle of the document
    // followed by more content. The data-line attributes, read in the order
    // they appear in the rendered HTML, must be non-decreasing so that
    // scroll-sync's interpolation (which assumes line and top are monotonic)
    // works correctly.
    const src = [
      "# Title",
      "",
      "Intro paragraph[^1].",
      "",
      "[^1]: the note",
      "",
      "Final paragraph.",
    ].join("\n");
    const result = await renderMarkdown(src);
    const dataLines = [...result.html.matchAll(/data-line="(\d+)"/g)].map((m) =>
      parseInt(m[1], 10),
    );
    // The footnote note (source line 5) must not appear as a data-line in the
    // middle of the rendered output.
    expect(dataLines).not.toContain(5);
    // data-line values should be non-decreasing in rendered order.
    for (let i = 1; i < dataLines.length; i++) {
      expect(dataLines[i]).toBeGreaterThanOrEqual(dataLines[i - 1]);
    }
  });

  it("should keep Example.md data-line values monotonic in rendered order", async () => {
    // Regression guard mirroring Example.md: footnote definitions sit in the
    // middle of the document (here on lines 3 and 9) but are rendered at the
    // bottom. The data-line attributes read in rendered order must stay
    // non-decreasing so scroll-sync's interpolation between editor and viewer
    // stays correct. Before the fix this sequence ended [..., 11, 3, 9].
    const src = [
      "# Examples of Markdown Formatting",
      "",
      "## Tables with aligned columns[^1]",
      "[^1]: https://example.org/colour",
      "",
      "| Left | Right |",
      "| :--- | ---: |",
      "| White | 24.8 |",
      "",
      "## Html Is Allowed[^2]",
      "[^2]: footnote rendered at the bottom",
      "",
      'A <i>clean</i> <span style="color:red">viewer</span> with live preview.',
    ].join("\n");
    const result = await renderMarkdown(src);
    const dataLines = [...result.html.matchAll(/data-line="(\d+)"/g)].map((m) =>
      parseInt(m[1], 10),
    );
    expect(dataLines.length).toBeGreaterThan(0);
    for (let i = 1; i < dataLines.length; i++) {
      expect(dataLines[i]).toBeGreaterThanOrEqual(dataLines[i - 1]);
    }
  });

  describe("local image src rewriting", () => {
    it("rewrites a relative image src to a localimg URL using the file's dir", async () => {
      const result = await renderMarkdown(
        "![alt](images/flower.png)",
        "/home/devel/r/Example.md",
      );
      // Resolved path is "/home/devel/r/images/flower.png"; the mock
      // URL-encodes it after the protocol prefix.
      expect(result.html).toContain(
        'src="localimg://localhost/%2Fhome%2Fdevel%2Fr%2Fimages%2Fflower.png"',
      );
      expect(result.html).not.toContain('src="images/flower.png"');
    });

    it("rewrites a parent-dir relative image src", async () => {
      const result = await renderMarkdown(
        "![alt](../assets/flower.png)",
        "/home/devel/r/Example.md",
      );
      expect(result.html).toContain("localimg");
      // Resolved path: "/home/devel/assets/flower.png"
      expect(result.html).toContain("%2Fhome%2Fdevel%2Fassets%2Fflower.png");
    });

    it("rewrites a Windows drive-absolute image src (forward-slash form)", async () => {
      // markdown-it URL-encodes backslashes in link destinations, so we use
      // the forward-slash form `C:/Users/...` which survives markdown parsing
      // unchanged. The backslash form is exercised in path.test.ts.
      const result = await renderMarkdown(
        "![alt](C:/Users/paw/flower.png)",
        "C:/Users/paw/repos/Example.md",
      );
      expect(result.html).toContain("localimg");
      // The path passed to convertFileSrc should be "C:/Users/paw/flower.png",
      // NOT joined onto the base dir or prefixed with "/C:/".
      expect(result.html).toContain("C%3A%2FUsers%2Fpaw%2Fflower.png");
      expect(result.html).not.toContain("repos");
      expect(result.html).not.toMatch(/%2FC%3A\//);
    });

    it("rewrites a different-drive image src (G:/...) without joining onto base", async () => {
      const result = await renderMarkdown(
        "![alt](G:/MyFolder/flower.png)",
        "C:/Users/paw/repos/Example.md",
      );
      expect(result.html).toContain("localimg");
      expect(result.html).toContain("G%3A%2FMyFolder%2Fflower.png");
      expect(result.html).not.toContain("Users");
    });

    it("rewrites a UNC image src (//server/share/...) as a UNC path", async () => {
      const result = await renderMarkdown(
        "![alt](//nas/share/images/flower.png)",
        "//nas/share/docs/Example.md",
      );
      expect(result.html).toContain("localimg");
      // The path should preserve the UNC form: //nas/share/images/flower.png.
      expect(result.html).toContain("%2F%2Fnas%2Fshare%2Fimages%2Fflower.png");
      expect(result.html).not.toMatch(/C%3A/);
    });

    it("rewrites a Windows drive-absolute image src with backslash form", async () => {
      // markdown-it URL-encodes backslashes, so the plugin receives
      // "C:%5CUsers%5Cpaw%5Cflower.png". resolveLink must decode it back to
      // "C:\Users\paw\flower.png" and then normalize to forward slashes.
      const result = await renderMarkdown(
        "![alt](C:\\Users\\paw\\flower.png)",
        "C:\\Users\\paw\\repos\\Example.md",
      );
      expect(result.html).toContain("localimg");
      expect(result.html).toContain("C%3A%2FUsers%2Fpaw%2Fflower.png");
      expect(result.html).not.toContain("repos");
    });

    it("leaves http(s) image srcs untouched", async () => {
      const result = await renderMarkdown(
        "![alt](https://example.com/flower.png)",
        "/home/devel/r/Example.md",
      );
      expect(result.html).toContain('src="https://example.com/flower.png"');
      expect(result.html).not.toContain("localimg");
    });

    it("leaves data: image srcs untouched", async () => {
      const result = await renderMarkdown(
        "![alt](data:image/png;base64,AAAA)",
        "/home/devel/r/Example.md",
      );
      expect(result.html).toContain('src="data:image/png;base64,AAAA"');
      expect(result.html).not.toContain("localimg");
    });

    it('rewrites <img src="..."> in raw HTML blocks', async () => {
      const result = await renderMarkdown(
        '<img src="images/flower.png" alt="x">',
        "/home/devel/r/Example.md",
      );
      expect(result.html).toContain("localimg");
      expect(result.html).not.toContain('src="images/flower.png"');
    });
  });
});
