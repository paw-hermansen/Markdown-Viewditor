import type { BundledTheme } from "shiki/bundle/web";

export interface ThemeInfo {
  name: BundledTheme;
  label: string;
  type: "light" | "dark";
}

export const AVAILABLE_THEMES: ThemeInfo[] = [
  { name: "github-dark", label: "GitHub Dark", type: "dark" },
  { name: "github-light", label: "GitHub Light", type: "light" },
  { name: "one-dark-pro", label: "One Dark Pro", type: "dark" },
  { name: "one-light", label: "One Light", type: "light" },
  { name: "dracula", label: "Dracula", type: "dark" },
  { name: "nord", label: "Nord", type: "dark" },
  { name: "solarized-dark", label: "Solarized Dark", type: "dark" },
  { name: "solarized-light", label: "Solarized Light", type: "light" },
  { name: "monokai", label: "Monokai", type: "dark" },
  { name: "material-theme", label: "Material Theme", type: "dark" },
  { name: "catppuccin-mocha", label: "Catppuccin Mocha", type: "dark" },
  { name: "catppuccin-latte", label: "Catppuccin Latte", type: "light" },
  { name: "tokyo-night", label: "Tokyo Night", type: "dark" },
  { name: "vitesse-dark", label: "Vitesse Dark", type: "dark" },
  { name: "vitesse-light", label: "Vitesse Light", type: "light" },
];

export function getThemeByName(name: string): ThemeInfo | undefined {
  return AVAILABLE_THEMES.find((t) => t.name === name);
}

export function getThemesByType(type: "light" | "dark"): ThemeInfo[] {
  return AVAILABLE_THEMES.filter((t) => t.type === type);
}

export function getThemeLabel(name: string): string {
  const theme = getThemeByName(name);
  return theme?.label ?? name;
}
