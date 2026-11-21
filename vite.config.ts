import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  clearScreen: false,
  resolve: {
    // @vscode/markdown-it-katex is CJS and does require("katex"), which
    // resolves to katex's CJS build (dist/katex.js) while app code imports
    // the ESM build (dist/katex.mjs) — two module instances and a second,
    // unused ~270 KB copy of KaTeX core in the bundle. Point every bare
    // "katex" at the ESM build so there is exactly one copy. (The plugin's
    // own katex is only a fallback — the app injects memoizedKatex.)
    alias: [{ find: /^katex$/, replacement: "katex/dist/katex.mjs" }],
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    assetsInlineLimit: (filePath: string) => {
      if (/\.(woff2?|ttf|otf)$/.test(filePath)) return false;
      return undefined;
    },
  },
});
