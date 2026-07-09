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
    }).use(createShikiPlugin(hl));
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
