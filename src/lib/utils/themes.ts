import { setTheme } from "$lib/utils/markdown";

export interface ThemeInfo {
  id: string;
  label: string;
  type: "light" | "dark";
  builtin: boolean;
  css?: string;
}

export const BUILTIN_THEMES: ThemeInfo[] = [
  { id: "github-dark", label: "GitHub Dark", type: "dark", builtin: true },
  { id: "github-light", label: "GitHub Light", type: "light", builtin: true },
  { id: "atom-one-dark", label: "Atom One Dark", type: "dark", builtin: true },
  {
    id: "atom-one-light",
    label: "Atom One Light",
    type: "light",
    builtin: true,
  },
  { id: "monokai", label: "Monokai", type: "dark", builtin: true },
  { id: "monokai-light", label: "Monokai Light", type: "light", builtin: true },
  { id: "nord", label: "Nord", type: "dark", builtin: true },
  { id: "nord-light", label: "Nord Light", type: "light", builtin: true },
  {
    id: "printer-friendly",
    label: "Printer Friendly / Neutral",
    type: "light",
    builtin: true,
  },
];

let userThemes: ThemeInfo[] = [];
let allThemes: ThemeInfo[] = [...BUILTIN_THEMES];

const builtinCssModules: Record<string, () => Promise<{ default: string }>> = {
  "github-dark": () => import("$lib/styles/highlight/github-dark.css?raw"),
  "github-light": () => import("$lib/styles/highlight/github-light.css?raw"),
  "atom-one-dark": () => import("$lib/styles/highlight/atom-one-dark.css?raw"),
  "atom-one-light": () =>
    import("$lib/styles/highlight/atom-one-light.css?raw"),
  monokai: () => import("$lib/styles/highlight/monokai.css?raw"),
  "monokai-light": () => import("$lib/styles/highlight/monokai-light.css?raw"),
  nord: () => import("$lib/styles/highlight/nord.css?raw"),
  "nord-light": () => import("$lib/styles/highlight/nord-light.css?raw"),
  "printer-friendly": () =>
    import("$lib/styles/highlight/printer-friendly.css?raw"),
};

export function getAllThemes(): ThemeInfo[] {
  return allThemes;
}

export function getThemesByType(type: "light" | "dark"): ThemeInfo[] {
  return allThemes.filter((t) => t.type === type);
}

export function getThemeById(id: string): ThemeInfo | undefined {
  return allThemes.find((t) => t.id === id);
}

export function getThemeLabel(id: string): string {
  const theme = getThemeById(id);
  return theme?.label ?? id;
}

export async function applyTheme(themeId: string): Promise<void> {
  const theme = getThemeById(themeId);
  if (!theme) {
    console.warn(`Theme "${themeId}" not found`);
    return;
  }

  if (theme.builtin) {
    const loader = builtinCssModules[themeId];
    if (loader) {
      const mod = await loader();
      setTheme(themeId, mod.default);
    }
  } else if (theme.css) {
    setTheme(themeId, theme.css);
  }
}

export function registerUserThemes(themes: ThemeInfo[]): void {
  userThemes = themes;
  allThemes = [...BUILTIN_THEMES, ...userThemes];
}
