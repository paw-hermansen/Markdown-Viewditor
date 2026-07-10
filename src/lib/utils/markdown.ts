import MarkdownIt from "markdown-it";
import {
  createHighlighter,
  type Highlighter,
  type BundledTheme,
  type BundledLanguage,
} from "shiki/bundle/web";

let highlighter: Highlighter | null = null;
let md: MarkdownIt | null = null;

const DEFAULT_THEMES: BundledTheme[] = ["github-dark", "github-light"];
const DEFAULT_LANGS: BundledLanguage[] = [
  "javascript",
  "typescript",
  "python",
  "css",
  "html",
  "json",
  "shellscript",
  "markdown",
  "sql",
  "svelte",
];

async function initHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: DEFAULT_THEMES,
      langs: DEFAULT_LANGS,
    });
  }
  return highlighter;
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

function createShikiPlugin(highlighter: Highlighter) {
  return function shikiPlugin(md: MarkdownIt) {
    const defaultFence =
      md.renderer.rules.fence ||
      function (tokens, idx, options, _env, self) {
        return self.renderToken(tokens, idx, options);
      };

    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const info = token.info.trim();
      const lang = info.split(/\s+/)[0] as BundledLanguage;

      if (!lang || !highlighter.getLoadedLanguages().includes(lang)) {
        return defaultFence(tokens, idx, options, env, self);
      }

      try {
        const html = highlighter.codeToHtml(token.content, {
          lang,
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
          defaultColor: false,
        });
        return html;
      } catch {
        return defaultFence(tokens, idx, options, env, self);
      }
    };
  };
}

async function initMarkdownIt(): Promise<MarkdownIt> {
  if (!md) {
    const hl = await initHighlighter();
    md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    })
      .use(createLineNumbersPlugin())
      .use(createShikiPlugin(hl));
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

export function getAvailableThemes(): string[] {
  if (highlighter) {
    return highlighter.getLoadedThemes();
  }
  return [...DEFAULT_THEMES];
}

export async function loadTheme(theme: BundledTheme): Promise<void> {
  const hl = await initHighlighter();
  const loadedThemes = hl.getLoadedThemes();
  if (!loadedThemes.includes(theme)) {
    await hl.loadTheme(theme);
  }
}

export async function loadLanguage(lang: BundledLanguage): Promise<void> {
  const hl = await initHighlighter();
  const loadedLangs = hl.getLoadedLanguages();
  if (!loadedLangs.includes(lang)) {
    await hl.loadLanguage(lang);
  }
}
