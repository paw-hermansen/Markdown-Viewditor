<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tabBar?: Snippet;
  }

  // Test double for AppLayout: renders the tab bar snippet so tests can
  // interact with the tab strip. The content snippets are deliberately not
  // rendered — the mocked Editor/Viewer components don't implement the
  // imperative `bind:this` API (setContent, resetRenderState, ...) that
  // +page.svelte calls on them.
  let { tabBar }: Props = $props();
</script>

{@render tabBar?.()}
