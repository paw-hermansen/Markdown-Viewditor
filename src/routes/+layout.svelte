<script lang="ts">
  import '../app.css';
  import { loadSettings, settingsState } from '$lib/stores/settings.svelte';
  import { applySavedZoom } from '$lib/stores/zoom.svelte';
  import { loadUserThemes } from '$lib/utils/user-themes';
  import { applyTheme } from '$lib/utils/themes';
  import { setTheme } from '$lib/stores/viewer.svelte';
  import { initPdfMode } from '$lib/export/pdf-mode';
  import { onMount } from 'svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await loadSettings();
    await loadUserThemes();
    setTheme(settingsState.viewerTheme);
    await applyTheme(settingsState.viewerTheme);
    await applySavedZoom();
    // Resolve the print/PDF output route (macOS version probe) before any
    // UI renders, so toolbar/palette labels never flip after mount.
    await initPdfMode();
    ready = true;

    document.addEventListener('contextmenu', (e) => e.preventDefault());
  });
</script>

{#if ready}
  {@render children()}
{/if}
