/**
 * Custom (user) theme discovery and registration.
 *
 * Moved here from the manual test plan: the interesting behavior — deriving a
 * theme id/label from the filename, guessing light/dark from the CSS, skipping
 * unreadable files and registering what remains — is pure logic over the
 * `list_files`/`read_file` commands and needs no UI. The visual "the theme
 * actually applies" part stays in the manual plan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvoke, mockAppConfigDir } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockAppConfigDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ appConfigDir: mockAppConfigDir }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { loadUserThemes } from "../user-themes";
import { getThemeById, registerUserThemes } from "$lib/utils/themes";

function fileEntry(name: string) {
  return {
    path: `/config/themes/${name}`,
    name,
    is_dir: false,
    size: 100,
  };
}

describe("loadUserThemes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerUserThemes([]);
    mockAppConfigDir.mockResolvedValue("/config");
  });

  it("returns no themes when the themes directory does not exist", async () => {
    mockInvoke.mockRejectedValue(new Error("dir not found"));

    const themes = await loadUserThemes();

    expect(themes).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("list_files", {
      dir: "/config/themes",
    });
  });

  it("loads .css files with derived id/label and registers them", async () => {
    const css = "/* dark */\nbody { background: #0d1117; }";
    mockInvoke.mockImplementation(
      async (cmd: string, args: { path?: string }) => {
        if (cmd === "list_files") {
          return [
            fileEntry("theme-kaleidoscope.css"),
            fileEntry("notes.md"),
            { ...fileEntry("subdir"), is_dir: true },
          ];
        }
        if (
          cmd === "read_file" &&
          args.path?.endsWith("theme-kaleidoscope.css")
        ) {
          return css;
        }
        throw new Error(`unexpected call: ${cmd}`);
      },
    );

    const themes = await loadUserThemes();

    expect(themes).toEqual([
      {
        id: "theme-kaleidoscope",
        label: "Theme Kaleidoscope",
        type: "dark",
        builtin: false,
        css,
      },
    ]);
    expect(getThemeById("theme-kaleidoscope")).toBeDefined();
  });

  it("derives safe ids from awkward filenames", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_files") return [fileEntry("my_theme v2.css")];
      return "body { background: #fff; } /* light */";
    });

    const themes = await loadUserThemes();

    expect(themes[0].id).toBe("my-theme-v2");
    expect(themes[0].label).toBe("My Theme V2");
    expect(themes[0].type).toBe("light");
  });

  it("guesses dark themes from dark markers in the CSS", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_files") return [fileEntry("night.css")];
      return ":root { --bg: #282c34; color-scheme: dark; }";
    });

    const themes = await loadUserThemes();

    expect(themes[0].type).toBe("dark");
  });

  it("skips files that fail to load and registers the rest", async () => {
    mockInvoke.mockImplementation(
      async (cmd: string, args: { path?: string }) => {
        if (cmd === "list_files") {
          return [fileEntry("broken.css"), fileEntry("good.css")];
        }
        if (cmd === "read_file" && args.path?.endsWith("good.css")) {
          return "body { background: #fff; } /* light */";
        }
        throw new Error("read failed");
      },
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const themes = await loadUserThemes();

      expect(themes.map((t) => t.id)).toEqual(["good"]);
      expect(getThemeById("good")).toBeDefined();
      expect(getThemeById("broken")).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it("registers nothing when every theme file fails to load", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_files") return [fileEntry("broken.css")];
      throw new Error("read failed");
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const themes = await loadUserThemes();

      expect(themes).toEqual([]);
      expect(getThemeById("broken")).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});
