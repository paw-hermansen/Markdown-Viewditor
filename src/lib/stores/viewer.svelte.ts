import type { ViewerState } from "$lib/types";
import { settingsState, updateTheme } from "$lib/stores/settings.svelte";
import { getThemeById } from "$lib/utils/themes";

export const viewerState = $state<ViewerState>({
  theme: settingsState.viewerTheme || "github-dark",
  scrollTop: 0,
});

export function getThemeType(): "light" | "dark" {
  return getThemeById(viewerState.theme)?.type ?? "dark";
}

export function setTheme(theme: string) {
  viewerState.theme = theme;
  updateTheme(theme);
  applyThemeType(getThemeType());
}

function applyThemeType(type: "light" | "dark") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", type);
  }
}

applyThemeType(getThemeType());
