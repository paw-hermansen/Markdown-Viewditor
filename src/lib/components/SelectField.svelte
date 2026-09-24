<script module lang="ts">
  let uid = 0;
</script>

<script lang="ts">
  import { untrack } from 'svelte';

  interface Choice {
    value: string;
    label: string;
  }

  interface Props {
    value: string;
    choices: Choice[];
    label: string;
    id?: string;
    disabled?: boolean;
    onSelect: (value: string) => void;
  }

  let { value, choices, label, id, disabled = false, onSelect }: Props = $props();

  const generatedId = `select-field-${++uid}`;

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state(undefined);
  let triggerEl: HTMLButtonElement | undefined = $state(undefined);
  let activeIndex = $state(0);
  let popupStyle = $state('');

  let triggerId = $derived(id ?? generatedId);
  let listboxId = $derived(`${triggerId}-listbox`);
  let currentLabel = $derived(choices.find((c) => c.value === value)?.label ?? value);

  function optionEls(): HTMLButtonElement[] {
    return Array.from(rootEl?.querySelectorAll('.option') ?? []) as HTMLButtonElement[];
  }

  function focusOption(index: number) {
    optionEls()[index]?.focus();
  }

  function placePopup() {
    const rect = triggerEl?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const estimatedHeight = Math.min(choices.length * 28 + 8, 208);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const flip = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const top = flip ? Math.max(gap, rect.top - gap - estimatedHeight) : rect.bottom + gap;
    popupStyle = `left:${rect.left}px;top:${top}px;min-width:${Math.max(rect.width, 120)}px;`;
  }

  function openMenu() {
    if (disabled) return;
    const selected = choices.findIndex((c) => c.value === value);
    activeIndex = selected >= 0 ? selected : 0;
    open = true;
  }

  function close(restoreFocus: boolean) {
    open = false;
    if (restoreFocus) triggerEl?.focus();
  }

  function toggle() {
    if (open) {
      close(true);
    } else {
      openMenu();
    }
  }

  function pick(v: string) {
    if (!open) return;
    onSelect(v);
    close(true);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    const n = choices.length;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = (activeIndex + 1) % n;
        focusOption(activeIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = (activeIndex - 1 + n) % n;
        focusOption(activeIndex);
        break;
      case 'Home':
        e.preventDefault();
        activeIndex = 0;
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        activeIndex = n - 1;
        focusOption(activeIndex);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (n > 0) pick(choices[activeIndex].value);
        break;
    }
  }

  $effect(() => {
    if (!open) return;
    untrack(() => {
      placePopup();
      focusOption(activeIndex);
    });

    function onDocClick(event: MouseEvent) {
      if (rootEl && !rootEl.contains(event.target as Node)) {
        close(false);
      }
    }
    function onViewportChange() {
      close(false);
    }

    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  });
</script>

<div class="select-field" bind:this={rootEl}>
  <button
    type="button"
    class="trigger"
    id={triggerId}
    bind:this={triggerEl}
    {disabled}
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? listboxId : undefined}
    onclick={toggle}
    onkeydown={onKeydown}
  >
    <span class="value">{currentLabel}</span>
    <svg
      class="chevron"
      class:open
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  {#if open}
    <div
      class="popup"
      style={popupStyle}
      role="listbox"
      id={listboxId}
      aria-label={label}
      tabindex="-1"
      onkeydown={onKeydown}
    >
      {#each choices as choice, i (choice.value)}
        <button
          type="button"
          class="option"
          class:selected={choice.value === value}
          role="option"
          aria-selected={choice.value === value}
          tabindex="-1"
          onclick={() => pick(choice.value)}
          onmouseenter={() => {
            activeIndex = i;
            focusOption(i);
          }}
        >
          <span class="option-label">{choice.label}</span>
          {#if choice.value === value}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .select-field {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 150ms ease-in-out;
  }

  .trigger:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .trigger:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    color: var(--text-secondary);
    transition: transform 150ms ease-in-out;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .popup {
    position: fixed;
    z-index: 400;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: var(--shadow-md);
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease-in-out;
  }

  .option:hover,
  .option:focus {
    background: var(--bg-hover);
  }

  .option.selected {
    background: var(--bg-hover);
    font-weight: 600;
    color: var(--accent);
  }

  .option-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
