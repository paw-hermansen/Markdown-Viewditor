import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILTIN_THEMES,
  getAllThemes,
  getThemeById,
  getThemesByType,
  getThemeLabel,
} from "../themes";

describe("themes", () => {
  describe("BUILTIN_THEMES", () => {
    it("should contain at least 4 themes", () => {
      expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(4);
    });

    it("should have valid structure for each theme", () => {
      for (const theme of BUILTIN_THEMES) {
        expect(theme).toHaveProperty("id");
        expect(theme).toHaveProperty("label");
        expect(theme).toHaveProperty("type");
        expect(theme).toHaveProperty("builtin");
        expect(["light", "dark"]).toContain(theme.type);
        expect(theme.builtin).toBe(true);
      }
    });

    it("should include github-dark and github-light", () => {
      const ids = BUILTIN_THEMES.map((t) => t.id);
      expect(ids).toContain("github-dark");
      expect(ids).toContain("github-light");
    });
  });

  describe("getThemeById", () => {
    it("should return theme for valid id", () => {
      const theme = getThemeById("github-dark");
      expect(theme).toBeDefined();
      expect(theme?.id).toBe("github-dark");
      expect(theme?.type).toBe("dark");
    });

    it("should return undefined for unknown id", () => {
      const theme = getThemeById("nonexistent-theme");
      expect(theme).toBeUndefined();
    });
  });

  describe("getThemesByType", () => {
    it("should return only dark themes", () => {
      const darkThemes = getThemesByType("dark");
      expect(darkThemes.length).toBeGreaterThan(0);
      for (const theme of darkThemes) {
        expect(theme.type).toBe("dark");
      }
    });

    it("should return only light themes", () => {
      const lightThemes = getThemesByType("light");
      expect(lightThemes.length).toBeGreaterThan(0);
      for (const theme of lightThemes) {
        expect(theme.type).toBe("light");
      }
    });

    it("should cover all themes between dark and light", () => {
      const all = getAllThemes();
      const dark = getThemesByType("dark");
      const light = getThemesByType("light");
      expect(dark.length + light.length).toBe(all.length);
    });
  });

  describe("getThemeLabel", () => {
    it("should return label for known theme", () => {
      expect(getThemeLabel("github-dark")).toBe("GitHub Dark");
    });

    it("should return name as fallback for unknown theme", () => {
      expect(getThemeLabel("unknown")).toBe("unknown");
    });
  });

  describe("theme css fidelity", () => {
    const REQUIRED_VARS = [
      "--border",
      "--bg-tertiary",
      "--accent",
      "--text-secondary",
      "--text-primary",
      "--bg-primary",
      "--bg-secondary",
      "--bg-hover",
    ];

    // Vite's CSS pipeline swallows `?raw` imports of .css files under vitest,
    // so the raw theme source is read from disk here instead.
    const themeDir = fileURLToPath(
      new URL("../../styles/highlight/", import.meta.url),
    );
    const themeCss: Record<string, string> = {};

    beforeAll(() => {
      for (const theme of BUILTIN_THEMES) {
        themeCss[theme.id] = readFileSync(
          join(themeDir, `${theme.id}.css`),
          "utf8",
        );
      }
    });

    it("every built-in theme defines fallback vars on #viewer-content", () => {
      for (const theme of BUILTIN_THEMES) {
        const css = themeCss[theme.id];
        expect(css, theme.id).toBeDefined();
        const block = css.match(/#viewer-content\s*\{[^}]*\}/)?.[0] ?? "";
        for (const v of REQUIRED_VARS) {
          expect(block, `${theme.id} ${v}`).toContain(`${v}:`);
        }
      }
    });

    it("github themes underline h2 and mute h6 like github.com", () => {
      for (const id of ["github-dark", "github-light"]) {
        const css = themeCss[id];
        expect(css, id).toMatch(/#viewer-content h2\s*\{[^}]*border-bottom/);
        expect(css, id).toMatch(/#viewer-content h6\s*\{[^}]*color/);
      }
    });

    it("github themes use gray blockquote borders (not accent)", () => {
      expect(themeCss["github-light"]).toContain("border-left-color: #d0d7de");
      expect(themeCss["github-dark"]).toContain("border-left-color: #30363d");
    });

    it("github-dark code blocks are lighter than the page background", () => {
      expect(themeCss["github-dark"]).toMatch(
        /#viewer-content pre \{\s*background: #161b22;/,
      );
    });

    it("monokai uses classic Sublime colors (yellow strings, purple numbers)", () => {
      const css = themeCss["monokai"];
      expect(css).toContain("color: #E6DB74");
      expect(css).toContain("color: #AE81FF");
      expect(css).toContain("color: #F8F8F2");
    });

    it("monokai-light follows the Monokai Light origin palette", () => {
      const css = themeCss["monokai-light"];
      expect(css).toContain("color: #998f2f");
      expect(css).toContain("color: #684d99");
      expect(css).toContain("color: #f9005a");
    });

    it("atom-one-dark stays on the documented hue palette", () => {
      const css = themeCss["atom-one-dark"];
      expect(css).not.toContain("#e5c07b");
      expect(css).not.toContain("#61afef");
    });
  });
});
