import { load as yamlLoad } from "js-yaml";

import type { Frontmatter, RenderResult } from "$lib/types";
import { analyzeTokens, type UsedFeature } from "$lib/utils/markdown-levels";
import {
  loadExtensionsForContent,
  preRenderExtensionsForContent,
} from "$lib/extensions/registry";
import { initMarkdownIt } from "./markdown-it-setup";
import { normalizeFootnoteLineMaps } from "./markdown-it-setup";

export function extractFrontmatter(
  raw: string | undefined,
): Frontmatter | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = yamlLoad(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Frontmatter;
    }
  } catch (yamlError) {
    console.error("YAML frontmatter parse error:", yamlError);
  }
  return null;
}

export async function renderMarkdown(
  content: string,
  filePath?: string | null,
): Promise<RenderResult> {
  if (content === null || content === undefined) {
    return {
      html: "<p>Error rendering markdown</p>",
      frontmatter: null,
      tokens: [],
    };
  }
  try {
    const parser = await initMarkdownIt();

    // Lazy-load extension plugins for this content.
    await loadExtensionsForContent(content, parser);

    const env: {
      frontmatter?: string;
      filePath?: string;
      directives?: Map<number, Map<string, Record<string, unknown>>>;
    } = {};
    if (filePath) {
      env.filePath = filePath;
    }
    const tokens = parser.parse(content, env);
    normalizeFootnoteLineMaps(tokens, content);
    await preRenderExtensionsForContent(content, { tokens, env });
    const html = parser.renderer.render(tokens, parser.options, env);

    let frontmatter: Frontmatter | null = null;
    if (typeof env.frontmatter === "string") {
      frontmatter = extractFrontmatter(env.frontmatter);
    }

    return { html, frontmatter, tokens };
  } catch (error) {
    console.error("Markdown parse error:", error);
    return {
      html: "<p>Error rendering markdown</p>",
      frontmatter: null,
      tokens: [],
    };
  }
}

export async function analyzeContent(content: string): Promise<UsedFeature[]> {
  if (content === null || content === undefined) return [];
  try {
    const parser = await initMarkdownIt();
    await loadExtensionsForContent(content, parser);
    const env: Record<string, unknown> = {};
    const tokens = parser.parse(content, env);
    return analyzeTokens(tokens, env);
  } catch (error) {
    console.error("Markdown analyze error:", error);
    return [];
  }
}
