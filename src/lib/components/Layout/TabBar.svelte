<script lang="ts">
  import { tabsState, tabPath, tabDirty } from '$lib/stores/tabs.svelte';
  import { tabLabels } from '$lib/utils/tab-labels';

  interface Props {
    onSelect: (id: number) => void;
    onClose: (id: number) => void;
  }

  let { onSelect, onClose }: Props = $props();

  let strip: HTMLDivElement;
  let canLeft = $state(false);
  let canRight = $state(false);

  // State read directly from stores (StatusBar precedent).
  const labels = $derived(tabLabels(tabsState.tabs.map(tabPath)));

  function updateOverflow() {
    canLeft = strip.scrollLeft > 0;
    canRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  }

  function handleWheel(e: WheelEvent) {
    // Ctrl/Cmd+wheel is the app zoom (handleZoomWheel on window).
    if (e.ctrlKey || e.metaKey) return;
    strip.scrollLeft += e.deltaY || e.deltaX;
  }

  // Re-measure when the strip resizes or the tab set/labels change.
  $effect(() => {
    void labels;
    updateOverflow();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(strip);
    return () => observer.disconnect();
  });

  // Keep the active tab in view.
  $effect(() => {
    void tabsState.activeId;
    strip.querySelector('.tab.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
</script>

<div class="tab-bar" class:can-left={canLeft} class:can-right={canRight}>
  <div class="tab-strip" role="tablist" bind:this={strip} onwheel={handleWheel} onscroll={updateOverflow}>
    {#each tabsState.tabs as tab, i (tab.id)}
      <div class="tab" class:active={tab.id === tabsState.activeId}>
        <button
          class="tab-label"
          role="tab"
          aria-selected={tab.id === tabsState.activeId}
          title={labels[i]}
          onclick={() => onSelect(tab.id)}
        >{labels[i]}{#if tabDirty(tab)}<span class="dirty"> ●</span>{/if}</button>
        <button class="tab-close" title="Close" aria-label="Close {labels[i]}" onclick={() => onClose(tab.id)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .tab-bar {
    position: relative;
    display: flex;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }

  .tab-strip {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-strip::-webkit-scrollbar {
    display: none;
  }

  /* Scroll indicators: a fade with a chevron on each side that has more tabs. */
  .tab-bar::before,
  .tab-bar::after {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 24px;
    display: none;
    align-items: center;
    color: var(--text-secondary);
    pointer-events: none;
    z-index: 1;
  }

  .tab-bar.can-left::before {
    content: '‹';
    display: flex;
    left: 0;
    padding-left: 4px;
    background: linear-gradient(to right, var(--bg-secondary) 50%, transparent);
  }

  .tab-bar.can-right::after {
    content: '›';
    display: flex;
    right: 0;
    justify-content: flex-end;
    padding-right: 4px;
    background: linear-gradient(to left, var(--bg-secondary) 50%, transparent);
  }

  /* Shrinks from the full label down to just the close button, then the
     strip scrolls. The explicit min-width overrides the min-content size. */
  .tab {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 28px;
    border-right: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .tab:hover {
    background: var(--bg-hover);
  }

  .tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: inset 0 -2px 0 var(--accent);
  }

  .tab-label {
    flex: 0 1 auto;
    min-width: 0;
    padding: 8px 4px 8px 12px;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .dirty {
    color: var(--accent);
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    margin-right: 4px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .tab-close:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .tab-label:focus-visible,
  .tab-close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
</style>
