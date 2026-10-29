import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Pins the point of the PR-14 markdown split: `theme-css.ts` must stay a leaf
 * DOM module. `themes.ts` (a pure theme registry) previously imported
 * `setTheme` from `$lib/utils/markdown`, dragging markdown-it + highlight.js +
 * js-yaml into every theme-registry consumer.
 */
describe("theme-css module boundary", () => {
  const src = readFileSync(new URL("../theme-css.ts", import.meta.url), "utf8");

  it("imports nothing from the markdown engine graph", () => {
    expect(src).not.toMatch(/from\s+["'][^"']*markdown/);
    expect(src).not.toMatch(/markdown-it|highlight\.js|js-yaml/);
  });

  it("exports only injectThemeCss, setTheme and syncViewerBackground", () => {
    const exports = [
      ...src.matchAll(/export\s+(?:function|const|let|class)\s+(\w+)/g),
    ].map((m) => m[1]);
    expect(exports.sort()).toEqual([
      "injectThemeCss",
      "setTheme",
      "syncViewerBackground",
    ]);
  });
});
