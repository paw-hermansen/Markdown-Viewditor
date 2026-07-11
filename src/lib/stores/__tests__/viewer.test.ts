import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: {
    viewerTheme: "github-dark",
  },
  updateTheme: vi.fn(),
}));

vi.mock("$lib/utils/themes", () => ({
  getThemeById: vi.fn((id: string) => {
    const themes: Record<string, { id: string; type: "light" | "dark" }> = {
      "github-dark": { id: "github-dark", type: "dark" },
      "github-light": { id: "github-light", type: "light" },
      monokai: { id: "monokai", type: "dark" },
    };
    return themes[id];
  }),
}));

import { getThemeType, setTheme, viewerState } from "../viewer.svelte";
import { updateTheme } from "$lib/stores/settings.svelte";

describe("viewer store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewerState.theme = "github-dark";
    viewerState.scrollTop = 0;
  });

  describe("getThemeType", () => {
    it("should return dark for dark themes", () => {
      viewerState.theme = "github-dark";
      expect(getThemeType()).toBe("dark");
    });

    it("should return light for light themes", () => {
      viewerState.theme = "github-light";
      expect(getThemeType()).toBe("light");
    });

    it("should default to dark for unknown themes", () => {
      viewerState.theme = "unknown-theme";
      expect(getThemeType()).toBe("dark");
    });
  });

  describe("setTheme", () => {
    it("should update viewerState.theme", () => {
      setTheme("monokai");
      expect(viewerState.theme).toBe("monokai");
    });

    it("should call updateTheme in settings", () => {
      setTheme("monokai");
      expect(updateTheme).toHaveBeenCalledWith("monokai");
    });

    it("should set theme type on document element", () => {
      const setAttribute = vi.fn();
      vi.stubGlobal("document", {
        documentElement: { setAttribute },
      });

      setTheme("github-light");

      expect(setAttribute).toHaveBeenCalledWith("data-theme", "light");

      vi.unstubAllGlobals();
    });
  });
});
