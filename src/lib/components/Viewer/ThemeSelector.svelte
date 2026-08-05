<script lang="ts">
  import { getAllThemes, applyTheme } from '$lib/utils/themes';
  import { viewerState, setTheme } from '$lib/stores/viewer.svelte';
  import DropdownButton, { type Choice } from '$lib/components/DropdownButton.svelte';

  const themes = getAllThemes();

  const choices: Choice<string>[] = themes.map((t) => ({
    value: t.id,
    label: t.label,
    description: t.type,
  }));

  async function handleSelect(themeId: string) {
    await applyTheme(themeId);
    setTheme(themeId);
  }
</script>

<DropdownButton
  {choices}
  bind:value={viewerState.theme}
  onSelect={handleSelect}
  title="Select theme"
  header="Theme"
>
  {#snippet leadingIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  {/snippet}
</DropdownButton>
