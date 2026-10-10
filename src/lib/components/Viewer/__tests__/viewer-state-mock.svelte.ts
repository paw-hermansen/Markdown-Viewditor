// Reactive stand-in for `$lib/stores/viewer.svelte` in Viewer tests. Backed
// by `$state` like the real store, so theme-only changes track through the
// render $effect exactly as in the app (a plain-object mock would not).
export const viewerState = $state({
  theme: "github-dark",
  scrollTop: 0,
});
