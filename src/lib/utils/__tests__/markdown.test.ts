import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("should render basic markdown", async () => {
    const html = await renderMarkdown("# Hello");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
  });

  it("should render paragraphs", async () => {
    const html = await renderMarkdown("Hello World");
    expect(html).toContain("<p");
    expect(html).toContain("Hello World");
  });

  it("should render bold text", async () => {
    const html = await renderMarkdown("**bold**");
    expect(html).toContain("<strong>");
    expect(html).toContain("bold");
  });

  it("should render italic text", async () => {
    const html = await renderMarkdown("*italic*");
    expect(html).toContain("<em>");
    expect(html).toContain("italic");
  });

  it("should render links", async () => {
    const html = await renderMarkdown("[link](https://example.com)");
    expect(html).toContain("<a");
    expect(html).toContain("https://example.com");
  });

  it("should render unordered lists", async () => {
    const html = await renderMarkdown("- item 1\n- item 2");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>");
  });

  it("should render ordered lists", async () => {
    const html = await renderMarkdown("1. item 1\n2. item 2");
    expect(html).toContain("<ol");
    expect(html).toContain("<li>");
  });

  it("should render code blocks", async () => {
    const html = await renderMarkdown("```\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
  });

  it("should render inline code", async () => {
    const html = await renderMarkdown("`code`");
    expect(html).toContain("<code>");
  });

  it("should render blockquotes", async () => {
    const html = await renderMarkdown("> quote");
    expect(html).toContain("<blockquote");
  });

  it("should render horizontal rules", async () => {
    const html = await renderMarkdown("---");
    expect(html).toContain("<hr");
  });

  it("should handle empty content", async () => {
    const html = await renderMarkdown("");
    expect(html).toBe("");
  });

  it("should return error message on parse failure", async () => {
    const html = await renderMarkdown(null as unknown as string);
    expect(html).toContain("Error rendering markdown");
  });
});
