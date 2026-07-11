<script lang="ts">
  import { getAllThemes, getThemeLabel, applyTheme } from '$lib/utils/themes';
  import { viewerState, setTheme } from '$lib/stores/viewer.svelte';

  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement | undefined = $state(undefined);

  const themes = getAllThemes();

  async function handleThemeChange(themeId: string) {
    await applyTheme(themeId);
    setTheme(themeId);
    isOpen = false;
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="theme-selector" bind:this={dropdownRef}>
  <button class="theme-button" onclick={toggleDropdown} title="Select theme">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
    <span class="theme-name">{getThemeLabel(viewerState.theme)}</span>
    <svg class="chevron" class:open={isOpen} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if isOpen}
    <div class="dropdown">
      <div class="dropdown-header">Theme</div>
      {#each themes as theme}
        <button
          class="dropdown-item"
          class:active={viewerState.theme === theme.id}
          onclick={() => handleThemeChange(theme.id)}
        >
          <span class="theme-label">{theme.label}</span>
          <span class="theme-type">{theme.type}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .theme-selector {
    position: relative;
  }

  .theme-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 150ms ease-in-out;
  }

  .theme-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .theme-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    transition: transform 150ms ease-in-out;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    min-width: 220px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .dropdown-header {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 150ms ease-in-out;
  }

  .dropdown-item:hover {
    background: var(--bg-hover);
  }

  .dropdown-item.active {
    background: var(--accent);
    color: white;
  }

  .dropdown-item.active .theme-type {
    color: rgba(255, 255, 255, 0.7);
  }

  .theme-label {
    flex: 1;
    text-align: left;
  }

  .theme-type {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: capitalize;
  }
</style>
