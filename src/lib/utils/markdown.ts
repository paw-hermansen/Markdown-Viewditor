import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import highlightjs from "markdown-it-highlightjs";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import anchor from "markdown-it-anchor";
import { load as yamlLoad } from "js-yaml";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveLink } from "$lib/utils/path";

import type { Frontmatter, RenderResult } from "$lib/types";
import { analyzeTokens, type UsedFeature } from "$lib/utils/markdown-levels";

import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("shellscript", bash);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("sql", sql);

let md: MarkdownIt | null = null;
let currentThemeStyle: HTMLStyleElement | null = null;
let currentThemeId = "";

const FRONTMATTER_DELIMITER = "---";

function createFrontmatterPlugin() {
  return function frontmatterPlugin(md: MarkdownIt) {
    md.block.ruler.before(
      "hr",
      "front_matter",
      function frontMatterRule(state, startLine, _endLine, silent) {
        // Allow blank / whitespace-only lines before the opening delimiter.
        // Walk backward from startLine; if any non-blank line exists before it,
        // the delimiter is not at the document start.
        for (let i = startLine - 1; i >= 0; i--) {
          const ls = state.bMarks[i] + state.tShift[i];
          const le = state.eMarks[i];
          if (ls < le) return false;
        }

        // Opening line must be exactly "---" (no leading whitespace allowed).
        if (state.tShift[startLine] !== 0) return false;
        const openStart = state.bMarks[startLine];
        const openEnd = state.eMarks[startLine];
        if (
          state.src.slice(openStart, openEnd).trim() !== FRONTMATTER_DELIMITER
        )
          return false;

        // Scan for a closing "---" line.
        let closeLine = -1;
        for (let i = startLine + 1; i < state.lineMax; i++) {
          const ls = state.bMarks[i] + state.tShift[i];
          const le = state.eMarks[i];
          if (state.src.slice(ls, le).trim() === FRONTMATTER_DELIMITER) {
            closeLine = i;
            break;
          }
        }
        if (closeLine === -1) return false;

        if (silent) return true;

        // Extract the YAML body (between the opening and closing delimiters).
        const bodyStart = state.eMarks[startLine] + 1;
        const bodyEnd = state.bMarks[closeLine];
        state.env.frontmatter = state.src
          .slice(bodyStart, bodyEnd)
          .replace(/\s+$/, "");

        // Consume the frontmatter lines without emitting any token, so the
        // body HTML starts at the line after the closing delimiter.
        state.line = closeLine + 1;
        return true;
      },
      { alt: [] },
    );
  };
}

/**
 * Custom plugin to extract {#custom-id} from heading text.
 * If a heading ends with {#id}, that id is used as the heading's id attribute
 * and the {#id} text is removed from the displayed content.
 * This must be registered BEFORE markdown-it-anchor so the anchor plugin
 * reuses the existing id.
 */
function createCustomHeadingIdPlugin() {
  const CUSTOM_ID_RE = /\s*\{#([\w-]+)\}\s*$/;

  return function customHeadingIdPlugin(md: MarkdownIt) {
    md.core.ruler.push("custom_heading_id", function (state) {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== "heading_open") continue;

        // The inline token with the heading text is the next token
        const inlineToken = tokens[i + 1];
        if (!inlineToken || inlineToken.type !== "inline") continue;

        const match = CUSTOM_ID_RE.exec(inlineToken.content);
        if (match) {
          const customId = match[1];
          // Set the id attribute on the heading_open token
          tokens[i].attrSet("id", customId);
          // Remove the {#id} from the displayed content
          inlineToken.content = inlineToken.content.slice(0, match.index);
          // Also update the children tokens if they exist
          if (inlineToken.children) {
            const lastChild =
              inlineToken.children[inlineToken.children.length - 1];
            if (lastChild && lastChild.type === "text") {
              const childMatch = CUSTOM_ID_RE.exec(lastChild.content);
              if (childMatch) {
                lastChild.content = lastChild.content.slice(
                  0,
                  childMatch.index,
                );
              }
            }
          }
        }
      }
    });
  };
}

function createLineNumbersPlugin() {
  return function lineNumbersPlugin(md: MarkdownIt) {
    const defaultRender =
      md.renderer.rules.paragraph_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.paragraph_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultRender(tokens, idx, options, env, self);
    };

    const defaultHeadingOpen =
      md.renderer.rules.heading_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.heading_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultHeadingOpen(tokens, idx, options, env, self);
    };

    const defaultFence =
      md.renderer.rules.fence ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const html = defaultFence(tokens, idx, options, env, self);
      if (token.map) {
        const line = String(token.map[0] + 1);
        return html.replace(/<pre(?=\s|>)/, `<pre data-line="${line}"`);
      }
      return html;
    };

    const defaultBulletListOpen =
      md.renderer.rules.bullet_list_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.bullet_list_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultBulletListOpen(tokens, idx, options, env, self);
    };

    const defaultOrderedListOpen =
      md.renderer.rules.ordered_list_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.ordered_list_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultOrderedListOpen(tokens, idx, options, env, self);
    };

    const defaultBlockquoteOpen =
      md.renderer.rules.blockquote_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.blockquote_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultBlockquoteOpen(tokens, idx, options, env, self);
    };

    const defaultTableOpen =
      md.renderer.rules.table_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultTableOpen(tokens, idx, options, env, self);
    };

    // The footnote plugin renders all footnote definitions as a single block
    // at the end of the document. Tag that block (its <section>) with a
    // data-line anchored to the end of the source so scroll-sync can map it
    // correctly. The inner footnote content is handled separately in
    // renderMarkdown (its source-line maps are stripped, since that content is
    // rendered at the bottom rather than at its original source location).
    const defaultFootnoteBlockOpen =
      md.renderer.rules.footnote_block_open ||
      function (_tokens, _idx, options) {
        return (
          (options.xhtmlOut
            ? '<hr class="footnotes-sep" />\n'
            : '<hr class="footnotes-sep">\n') +
          '<section class="footnotes">\n<ol class="footnotes-list">\n'
        );
      };

    md.renderer.rules.footnote_block_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      const out = defaultFootnoteBlockOpen(tokens, idx, options, env, self);
      if (token.map) {
        return out.replace(
          '<section class="footnotes">',
          `<section class="footnotes" data-line="${token.map[0] + 1}">`,
        );
      }
      return out;
    };

    // Tag <hr> elements with data-line.
    const defaultHr =
      md.renderer.rules.hr ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.hr = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultHr(tokens, idx, options, env, self);
    };

    // Tag list items (<li>) with data-line. This fills the gap between
    // bullet_list_open/ordered_list_open (which only tags the first line)
    // and the next block element, which can be many lines away for long
    // lists (e.g. Example.md's HTML/SVG bullet list spans 13 lines but
    // only the opening line was tagged).
    const defaultListItemOpen =
      md.renderer.rules.list_item_open ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.list_item_open = function (
      tokens,
      idx,
      options,
      env,
      self,
    ) {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultListItemOpen(tokens, idx, options, env, self);
    };

    // Tag raw HTML blocks with data-line. html_block renders raw HTML
    // content (e.g. <details>, <svg>), so we wrap it in a <div
    // data-line="..."> since the raw HTML can't have attributes added to
    // it directly. This is safe because html_block is always block-level.
    const defaultHtmlBlock =
      md.renderer.rules.html_block ||
      function (tokens, idx, _options, _env, self) {
        return self.renderToken(tokens, idx, _options);
      };

    md.renderer.rules.html_block = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const html = defaultHtmlBlock(tokens, idx, options, env, self);
      if (token.map) {
        const line = String(token.map[0] + 1);
        return `<div data-line="${line}">${html}</div>`;
      }
      return html;
    };
  };
}

/**
 * Resolve an image href against the base file's directory. Returns the
 * absolute local path if the href is a local-path reference (relative,
 * drive-absolute, UNC, or Unix-absolute); returns null for URLs (http(s):,
 * data:, asset:, blob:, etc.) so the caller can leave the src untouched.
 */
function tryResolveLocalPath(
  basePath: string,
  href: string,
): { isLocal: true; path: string } | { isLocal: false } {
  const resolved = resolveLink(basePath, href);
  if (resolved.kind === "local-path") {
    return { isLocal: true, path: resolved.path };
  }
  return { isLocal: false };
}

function resolveHtmlImagePaths(html: string, filePath: string): string {
  return html.replace(
    /(<img\s[^>]*?)src=["']([^"']+)["']/gi,
    (match, prefix, src) => {
      if (src.match(/^(https?:\/\/|data:|asset:|blob:)/)) {
        return match;
      }
      const resolved = tryResolveLocalPath(filePath, src);
      if (!resolved.isLocal) {
        return match;
      }
      return `${prefix}src="${convertFileSrc(resolved.path, "localimg")}"`;
    },
  );
}

function createLocalImagePlugin() {
  return function localImagePlugin(md: MarkdownIt) {
    const defaultImageRenderer =
      md.renderer.rules.image ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.image = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const srcIndex = token.attrIndex("src");

      if (srcIndex >= 0 && env.filePath) {
        const src = token.attrs![srcIndex][1];

        if (!src.match(/^(https?:\/\/|data:|asset:|blob:)/)) {
          const resolved = tryResolveLocalPath(env.filePath, src);
          if (resolved.isLocal) {
            token.attrs![srcIndex][1] = convertFileSrc(
              resolved.path,
              "localimg",
            );
          }
        }
      }

      return defaultImageRenderer(tokens, idx, options, env, self);
    };

    const defaultHtmlBlock =
      md.renderer.rules.html_block ||
      function (tokens, idx, _options, _env, self) {
        return self.renderToken(tokens, idx, _options);
      };

    md.renderer.rules.html_block = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      if (env.filePath) {
        token.content = resolveHtmlImagePaths(token.content, env.filePath);
      }
      return defaultHtmlBlock(tokens, idx, options, env, self);
    };

    const defaultHtmlInline =
      md.renderer.rules.html_inline ||
      function (tokens, idx, _options, _env, self) {
        return self.renderToken(tokens, idx, _options);
      };

    md.renderer.rules.html_inline = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      if (env.filePath) {
        token.content = resolveHtmlImagePaths(token.content, env.filePath);
      }
      return defaultHtmlInline(tokens, idx, options, env, self);
    };
  };
}

type MdToken = ReturnType<MarkdownIt["parse"]>[number];

function normalizeFootnoteLineMaps(tokens: MdToken[], content: string) {
  // The footnote plugin pulls every `[^x]: ...` definition out of its source
  // location and re-renders all of them as a single block at the end of the
  // document. The inner tokens keep their original `.map` (pointing at the
  // definition's source line), which would tag the footnote content - rendered
  // at the bottom of the viewer - with a `data-line` from the middle of the
  // document. That makes the viewer's `line -> top` mapping non-monotonic and
  // breaks scroll-sync interpolation.
  //
  // Fix: strip those maps so footnote content carries no `data-line`, and
  // anchor the footnote block itself to the last source line so scrolling to
  // the end of the editor lines up with the rendered footnotes section.
  let inFootnotes = false;
  const lastLine = content.split("\n").length;
  for (const token of tokens) {
    if (token.type === "footnote_block_open") {
      inFootnotes = true;
      token.map = [lastLine - 1, lastLine - 1];
    } else if (token.type === "footnote_block_close") {
      inFootnotes = false;
    } else if (inFootnotes && token.map) {
      token.map = null;
    }
  }
}

/**
 * GitHub-style slugification: lowercase, spaces to hyphens, strip special chars.
 */
function githubSlugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function initMarkdownIt(): Promise<MarkdownIt> {
  if (!md) {
    md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })
      .use(createFrontmatterPlugin())
      .use(footnote)
      .use(createLineNumbersPlugin())
      .use(createCustomHeadingIdPlugin())
      .use(anchor, {
        slugify: githubSlugify,
        permalink: false,
        uniqueSlugStartIndex: 1,
        tabIndex: false,
      })
      .use(createLocalImagePlugin())
      .use(taskLists)
      .use(highlightjs, { hljs, auto: true, ignoreIllegals: true });
  }
  return md;
}

export async function renderMarkdown(
  content: string,
  filePath?: string | null,
): Promise<RenderResult> {
  if (content === null || content === undefined) {
    return { html: "<p>Error rendering markdown</p>", frontmatter: null };
  }
  try {
    const parser = await initMarkdownIt();
    const env: { frontmatter?: string; filePath?: string } = {};
    if (filePath) {
      env.filePath = filePath;
    }
    const tokens = parser.parse(content, env);
    normalizeFootnoteLineMaps(tokens, content);
    const html = parser.renderer.render(tokens, parser.options, env);

    let frontmatter: Frontmatter | null = null;
    if (
      typeof env.frontmatter === "string" &&
      env.frontmatter.trim().length > 0
    ) {
      try {
        const parsed = yamlLoad(env.frontmatter);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          frontmatter = parsed as Frontmatter;
        }
      } catch (yamlError) {
        console.error("YAML frontmatter parse error:", yamlError);
      }
    }

    return { html, frontmatter };
  } catch (error) {
    console.error("Markdown parse error:", error);
    return { html: "<p>Error rendering markdown</p>", frontmatter: null };
  }
}

/**
 * Parse-only analysis of a markdown document using the existing markdown-it
 * singleton. Reuses the same parser the Viewer renders with, but skips
 * rendering entirely — only the token stream and env are inspected by the
 * registered feature detectors. Used by the levels store so analysis works in
 * all view modes (the Viewer is unmounted in editor-only mode).
 */
export async function analyzeContent(content: string): Promise<UsedFeature[]> {
  if (content === null || content === undefined) return [];
  try {
    const parser = await initMarkdownIt();
    const env: Record<string, unknown> = {};
    const tokens = parser.parse(content, env);
    return analyzeTokens(tokens, env);
  } catch (error) {
    console.error("Markdown analyze error:", error);
    return [];
  }
}

export function setTheme(themeId: string, css: string): void {
  if (currentThemeId === themeId) return;

  if (!currentThemeStyle) {
    currentThemeStyle = document.createElement("style");
    currentThemeStyle.id = "hljs-theme";
    document.head.appendChild(currentThemeStyle);
  }

  currentThemeStyle.textContent = css;
  currentThemeId = themeId;

  requestAnimationFrame(() => {
    const el = document.getElementById("viewer-content");
    if (el) {
      const bg = getComputedStyle(el).backgroundColor;
      document.documentElement.style.setProperty("--viewer-bg", bg);
    }
  });
}

export function getAvailableLanguages(): string[] {
  return hljs.listLanguages();
}
