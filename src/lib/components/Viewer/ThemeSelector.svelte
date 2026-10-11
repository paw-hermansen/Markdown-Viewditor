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

  // Local mirror for the dropdown instead of binding viewerState.theme
  // directly. The binding let DropdownButton write the theme state the moment
  // a theme was clicked — before applyTheme() had injected the theme CSS and
  // before setTheme() updated the data-theme* attributes — so the render
  // effect fired against the OLD attributes and Mermaid's cache keys
  // disagreed with the render: diagrams turned into "Mermaid rendering
  // failed" blocks or kept their old colors. Committing only through
  // setTheme() keeps the state change (and the re-render it triggers) atomic
  // with the CSS and attribute updates.
  let selected = $state(viewerState.theme);

  // Follow theme changes made elsewhere (e.g. settings import at startup).
  $effect(() => {
    selected = viewerState.theme;
  });

  async function handleSelect(themeId: string) {
    try {
      await applyTheme(themeId);
      setTheme(themeId);
    } catch (err) {
      // The theme state never changed; revert the dropdown to it.
      selected = viewerState.theme;
      console.error("[theme] failed to apply theme:", err);
    }
  }
</script>

<DropdownButton
  {choices}
  bind:value={selected}
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
