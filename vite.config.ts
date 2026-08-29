import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  clearScreen: false,
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
