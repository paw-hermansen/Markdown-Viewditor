import { describe, it, expect } from "vitest";
import {
  AVAILABLE_THEMES,
  getThemeByName,
  getThemesByType,
  getThemeLabel,
} from "../themes";

describe("themes", () => {
  describe("AVAILABLE_THEMES", () => {
    it("should contain at least 10 themes", () => {
      expect(AVAILABLE_THEMES.length).toBeGreaterThanOrEqual(10);
    });

    it("should have valid structure for each theme", () => {
      for (const theme of AVAILABLE_THEMES) {
        expect(theme).toHaveProperty("name");
        expect(theme).toHaveProperty("label");
        expect(theme).toHaveProperty("type");
        expect(["light", "dark"]).toContain(theme.type);
      }
    });

    it("should include github-dark and github-light", () => {
      const names = AVAILABLE_THEMES.map((t) => t.name);
      expect(names).toContain("github-dark");
      expect(names).toContain("github-light");
    });
  });

  describe("getThemeByName", () => {
    it("should return theme for valid name", () => {
      const theme = getThemeByName("github-dark");
      expect(theme).toBeDefined();
      expect(theme?.name).toBe("github-dark");
      expect(theme?.type).toBe("dark");
    });

    it("should return undefined for unknown name", () => {
      const theme = getThemeByName("nonexistent-theme");
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
      const dark = getThemesByType("dark");
      const light = getThemesByType("light");
      expect(dark.length + light.length).toBe(AVAILABLE_THEMES.length);
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
