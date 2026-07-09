import MarkdownIt from "markdown-it";

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

export function renderMarkdown(content: string): string {
  try {
    return md.render(content);
  } catch (error) {
    console.error("Markdown parse error:", error);
    return "<p>Error rendering markdown</p>";
  }
}
