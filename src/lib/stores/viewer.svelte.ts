import type { ViewerState } from "$lib/types";

export const viewerState = $state<ViewerState>({
  theme: "github-dark",
  scrollTop: 0,
});

export function setTheme(theme: string) {
  viewerState.theme = theme;
}

export function setScrollTop(scrollTop: number) {
  viewerState.scrollTop = scrollTop;
}
