<script lang="ts">
  import '../app.css';
  import { loadSettings, settingsState } from '$lib/stores/settings.svelte';
  import { loadUserThemes } from '$lib/utils/user-themes';
  import { applyTheme } from '$lib/utils/themes';
  import { setTheme } from '$lib/stores/viewer.svelte';
  import { onMount } from 'svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await loadSettings();
    await loadUserThemes();
    setTheme(settingsState.viewerTheme);
    await applyTheme(settingsState.viewerTheme);
    ready = true;
  });
</script>

{#if ready}
  {@render children()}
{/if}
