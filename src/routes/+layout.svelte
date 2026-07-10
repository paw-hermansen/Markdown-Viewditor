<script lang="ts">
  import '../app.css';
  import { loadSettings } from '$lib/stores/settings.svelte';
  import { onMount } from 'svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await loadSettings();
    ready = true;
  });
</script>

{#if ready}
  {@render children()}
{/if}
