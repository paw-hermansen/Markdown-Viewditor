import { describe, it, expect } from "vitest";
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
});
