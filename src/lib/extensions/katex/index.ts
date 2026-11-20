import type { MarkdownExtension } from "../types";
import type MarkdownIt from "markdown-it";
import { MATH_PATTERNS } from "../pre-scan";
import { KATEX_OPTIONS_SCHEMA } from "./renderer";
import { default as mathBracketsPlugin } from "./math-brackets";
import { makeDollarRulesBacktickSafe } from "./math-dollar-safe";

// Side-effect: load the woff2-only KaTeX stylesheet so rendered math picks
// up fonts and layout. Bundled by Vite at build time. (The woff2 files are
// only fetched when something renders with the KaTeX fonts, so keeping the
// stylesheet eager is cheap — the KaTeX JS is what loadPlugin defers.)
import "$lib/styles/katex/katex.woff2.css";

// Side-effect: register feature detectors on import.
import "./detectors";

export { KATEX_OPTIONS_SCHEMA } from "./renderer";

// Track whether postRegister has already run (idempotent guard).
let postRegistered = false;

// Set by loadPlugin; used by postRegister, which the extension pipeline
// only calls after loadPlugin resolves (see extensions/registry.ts).
let wrapMathAnchorRenderers: ((md: MarkdownIt) => void) | null = null;

export const katexExtension: MarkdownExtension = {
  id: "katex",
  label: "KaTeX Math",
  fenceOptionsSchema: KATEX_OPTIONS_SCHEMA,

  detect(content: string): boolean {
    return MATH_PATTERNS.some((p) => p.test(content));
  },

  async loadPlugin() {
    // katex-cache and math-anchors pull in KaTeX core, so they load here —
    // only for documents with math — and stay out of the startup bundle.
    const [{ default: vscodeKatex }, { memoizedKatex }, mathAnchors] =
      await Promise.all([
        import("@vscode/markdown-it-katex"),
        import("./katex-cache"),
        import("./math-anchors"),
        import("katex/contrib/mhchem"), // side-effect: registers \ce and \pu
      ]);
    wrapMathAnchorRenderers = mathAnchors.wrapMathAnchorRenderers;
    return {
      plugin: vscodeKatex,
      options: {
        katex: memoizedKatex,
        throwOnError: false,
        errorColor: "#cc0000",
        enableBareBlocks: true,
        enableFencedBlocks: true,
      },
    };
  },

  async loadStyles() {
    const { injectKaTeXStyles } = await import("./styles");
    await injectKaTeXStyles();
  },

  postRegister(md: MarkdownIt) {
    if (postRegistered) return;
    postRegistered = true;
    // Register the \(...\) / \[...\] bracket rules (must run after the @vscode
    // plugin so its math_inline/math_block renderers are in place).
    md.use(mathBracketsPlugin);
    // Replace dollar rules with backtick-aware versions.
    makeDollarRulesBacktickSafe(md);
    // Wrap renderers for data-line scroll-sync and directive-aware options.
    if (!wrapMathAnchorRenderers) {
      throw new Error("katex: postRegister called before loadPlugin");
    }
    wrapMathAnchorRenderers(md);
  },

  featureDetectors() {
    return [];
  },
};
