import { describe, it, expect } from "vitest";
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
});
