import { appConfigDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { type ThemeInfo, registerUserThemes } from "$lib/utils/themes";

interface FileInfo {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
}

const THEMES_DIR = "themes";

function themeIdFromFilename(filename: string): string {
  return filename.replace(/\.css$/i, "").replace(/[^a-z0-9-]/g, "-");
}

function themeLabelFromFilename(filename: string): string {
  return filename
    .replace(/\.css$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function loadUserThemes(): Promise<ThemeInfo[]> {
  try {
    const configDir = await appConfigDir();
    const themesPath = `${configDir}/${THEMES_DIR}`;

    let entries: FileInfo[];
    try {
      entries = await invoke<FileInfo[]>("list_files", { dir: themesPath });
    } catch {
      console.log(
        `User themes directory not found at: ${themesPath}\n` +
          `Create this directory and add .css files to use custom themes.`,
      );
      return [];
    }

    const cssFiles = entries.filter(
      (e) => !e.is_dir && e.name.endsWith(".css"),
    );

    const themes: ThemeInfo[] = [];
    for (const file of cssFiles) {
      try {
        const css = await invoke<string>("read_file", { path: file.path });
        themes.push({
          id: themeIdFromFilename(file.name),
          label: themeLabelFromFilename(file.name),
          type: guessThemeType(css),
          builtin: false,
          css,
        });
      } catch (err) {
        console.warn(`Failed to load user theme "${file.name}":`, err);
      }
    }

    if (themes.length > 0) {
      registerUserThemes(themes);
      console.log(`Loaded ${themes.length} user theme(s) from: ${themesPath}`);
    }

    return themes;
  } catch (err) {
    console.warn("Failed to load user themes:", err);
    return [];
  }
}

function guessThemeType(css: string): "light" | "dark" {
  const lower = css.toLowerCase();
  const lightKeywords = ["light", "white", "#fff", "#fafafa", "#f5f5f5"];
  const darkKeywords = ["dark", "#1e1e2e", "#282c34", "#272822", "#0d1117"];

  let lightScore = 0;
  let darkScore = 0;

  for (const kw of lightKeywords) {
    if (lower.includes(kw)) lightScore++;
  }
  for (const kw of darkKeywords) {
    if (lower.includes(kw)) darkScore++;
  }

  return darkScore >= lightScore ? "dark" : "light";
}
