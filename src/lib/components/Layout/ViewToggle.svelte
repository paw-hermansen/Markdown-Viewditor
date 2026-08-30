<script lang="ts">
  import type { ViewMode } from '$lib/types';

  interface Props {
    viewMode: ViewMode;
    onchange: (mode: ViewMode) => void;
  }

  let { viewMode, onchange }: Props = $props();

  const modes: { value: ViewMode; label: string; icon: string }[] = [
    { value: 'editor', label: 'Edit', icon: '✎' },
    { value: 'split', label: 'Split', icon: '⊞' },
    { value: 'viewer', label: 'View', icon: '👁' },
  ];

  function handleKeydown(e: KeyboardEvent) {
    const buttons = Array.from(document.querySelectorAll('.view-toggle button')) as HTMLElement[];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (currentIndex + 1) % buttons.length;
      buttons[next]?.focus();
      buttons[next]?.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[prev]?.focus();
      buttons[prev]?.click();
    }
  }
</script>

<div class="view-toggle" role="radiogroup" aria-label="View mode" onkeydown={handleKeydown}>
  {#each modes as mode}
    <button
      role="radio"
      aria-checked={viewMode === mode.value}
      class:active={viewMode === mode.value}
      onclick={() => onchange(mode.value)}
      title={mode.label}
    >
      <span class="icon">{mode.icon}</span>
      <span class="label">{mode.label}</span>
    </button>
  {/each}
</div>

<style>
  .view-toggle {
    display: flex;
    gap: 4px;
    background: var(--bg-tertiary);
    padding: 4px;
    border-radius: 8px;
  }

  button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
    font-size: 13px;
  }

  button.active {
    background: var(--accent);
    color: white;
  }

  button:hover:not(.active) {
    background: var(--bg-hover);
  }

  .icon {
    font-size: 14px;
  }

  @media (max-width: 640px) {
    .label {
      display: none;
    }

    button {
      padding: 6px 8px;
    }
  }
</style>
