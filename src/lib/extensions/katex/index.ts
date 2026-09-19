import type { MarkdownExtension } from "../types";
import type MarkdownIt from "markdown-it";
import { MATH_PATTERNS } from "../pre-scan";
import { memoizedKatex } from "./katex-cache";
import { KATEX_OPTIONS_SCHEMA } from "./renderer";
import { default as mathBracketsPlugin } from "./math-brackets";
import { makeDollarRulesBacktickSafe } from "./math-dollar-safe";
import { wrapMathAnchorRenderers } from "./math-anchors";

// Side-effect: load the woff2-only KaTeX stylesheet so rendered math picks
// up fonts and layout. Bundled by Vite at build time.
import "$lib/styles/katex/katex.woff2.css";

// Side-effect: register feature detectors on import.
import "./detectors";

export { KATEX_OPTIONS_SCHEMA } from "./renderer";

// Track whether postRegister has already run (idempotent guard).
let postRegistered = false;

export const katexExtension: MarkdownExtension = {
  id: "katex",
  label: "KaTeX Math",
  fenceOptionsSchema: KATEX_OPTIONS_SCHEMA,

  detect(content: string): boolean {
    return MATH_PATTERNS.some((p) => p.test(content));
  },

  async loadPlugin() {
    const [{ default: vscodeKatex }] = await Promise.all([
      import("@vscode/markdown-it-katex"),
      import("katex/contrib/mhchem"), // side-effect: registers \ce and \pu
    ]);
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
    wrapMathAnchorRenderers(md);
  },

  featureDetectors() {
    return [];
  },
};
