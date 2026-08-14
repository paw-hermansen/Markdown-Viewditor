<script module lang="ts">
  export interface Choice<T extends string> {
    value: T;
    label: string;
    description?: string;
  }
</script>

<script lang="ts" generics="T extends string">
  import type { Snippet } from 'svelte';

  interface Props {
    choices: Choice<T>[];
    value?: T;
    fixedLabel?: string;
    onAction?: (value: T) => void;
    onSelect?: (value: T) => void;
    leadingIcon?: Snippet;
    footer?: Snippet;
    formatLabel?: (choice: Choice<T>) => string;
    title?: string;
    header?: string;
    align?: 'left' | 'right';
    disabled?: boolean;
  }

  let {
    choices,
    value = $bindable(),
    fixedLabel,
    onAction,
    onSelect,
    leadingIcon,
    footer,
    formatLabel,
    title,
    header,
    align = 'right',
    disabled = false,
  }: Props = $props();

  let isOpen = $state(false);
  let rootRef: HTMLDivElement | undefined = $state(undefined);

  let current = $derived(value !== undefined ? choices.find((c) => c.value === value) ?? choices[0] : undefined);
  let label = $derived(fixedLabel ?? (current ? (formatLabel ? formatLabel(current) : current.label) : ''));
  let isMenuMode = $derived(fixedLabel !== undefined);

  function toggle() {
    if (disabled) return;
    isOpen = !isOpen;
  }

  function pick(v: T) {
    if (!isMenuMode) {
      value = v;
    }
    isOpen = false;
    onSelect?.(v);
  }

  function fire() {
    if (disabled) return;
    if (isMenuMode) {
      toggle();
    } else if (onAction) {
      onAction(value!);
    } else {
      toggle();
    }
  }

  function onDocClick(event: MouseEvent) {
    if (rootRef && !rootRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  function onDocKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') isOpen = false;
  }

  $effect(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKeydown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKeydown);
    };
  });
</script>

<div class="dropdown-button" class:menu-mode={isMenuMode} bind:this={rootRef}>
  <button
    class="main-button"
    onclick={fire}
    {title}
    {disabled}
    aria-haspopup="menu"
    aria-expanded={isOpen}
  >
    {#if leadingIcon}
      <span class="icon">
        {@render leadingIcon()}
      </span>
    {/if}
    <span class="label">{label}</span>
  </button>

  {#if !isMenuMode}
    <button
      class="caret-button"
      onclick={toggle}
      disabled={disabled}
      aria-label="More options"
      aria-haspopup="menu"
      aria-expanded={isOpen}
    >
      <svg class="chevron" class:open={isOpen} xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  {/if}

  {#if isOpen}
    <div class="dropdown" class:align-left={align === 'left'} class:align-right={align === 'right'} role="menu">
      {#if header}
        <div class="dropdown-header">{header}</div>
      {/if}
      {#each choices as choice}
        <button
          class="dropdown-item"
          class:active={!isMenuMode && choice.value === value}
          onclick={() => pick(choice.value)}
          role="menuitemradio"
          aria-checked={choice.value === value}
        >
          <span class="item-text">
            <span class="item-label">{choice.label}</span>
            {#if choice.description}
              <span class="item-description">{choice.description}</span>
            {/if}
          </span>
          {#if !isMenuMode && choice.value === value}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          {/if}
        </button>
      {/each}
      {#if footer}
        <div class="dropdown-footer">
          {@render footer()}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropdown-button {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .main-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border-radius: 6px 0 0 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: all 150ms ease-in-out;
  }

  .main-button:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .main-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .menu-mode .main-button {
    border-radius: 6px;
  }

  .caret-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 6px;
    border: none;
    border-left: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }

  .caret-button:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .caret-button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }

  .dropdown-button .label {
    display: none;
  }

  @media (min-width: 640px) {
    .dropdown-button .label {
      display: inline;
    }
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
    margin-top: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    min-width: 240px;
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .dropdown.align-right {
    right: 0;
  }

  .dropdown.align-left {
    left: 0;
  }

  .dropdown-header {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dropdown-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .dropdown-footer :global(label) {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .dropdown-footer :global(input[type="checkbox"]) {
    cursor: pointer;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: all 150ms ease-in-out;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg-hover);
  }

  .dropdown-item.active {
    background: var(--accent);
    color: white;
  }

  .item-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .item-label {
    font-weight: 500;
  }

  .item-description {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .dropdown-item.active .item-description {
    color: rgba(255, 255, 255, 0.8);
  }
</style>
