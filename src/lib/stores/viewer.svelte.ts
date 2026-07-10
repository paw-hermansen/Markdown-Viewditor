import type { ViewerState } from "$lib/types";
import { settingsState, updateTheme } from "$lib/stores/settings.svelte";

export const viewerState = $state<ViewerState>({
  theme: settingsState.viewerTheme || "github-dark",
  scrollTop: 0,
});

export function setTheme(theme: string) {
  viewerState.theme = theme;
  updateTheme(theme);
}

export function setScrollTop(scrollTop: number) {
  viewerState.scrollTop = scrollTop;
}
