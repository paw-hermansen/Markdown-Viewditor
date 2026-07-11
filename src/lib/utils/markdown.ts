import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import highlightjs from "markdown-it-highlightjs";

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
      if (token.map) {
        token.attrSet("data-line", String(token.map[0] + 1));
      }
      return defaultFence(tokens, idx, options, env, self);
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
  };
}

async function initMarkdownIt(): Promise<MarkdownIt> {
  if (!md) {
    md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })
      .use(createLineNumbersPlugin())
      .use(highlightjs, { hljs, auto: true, ignoreIllegals: true });
  }
  return md;
}

export async function renderMarkdown(content: string): Promise<string> {
  try {
    const parser = await initMarkdownIt();
    return parser.render(content);
  } catch (error) {
    console.error("Markdown parse error:", error);
    return "<p>Error rendering markdown</p>";
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
}

export function getAvailableLanguages(): string[] {
  return hljs.listLanguages();
}
