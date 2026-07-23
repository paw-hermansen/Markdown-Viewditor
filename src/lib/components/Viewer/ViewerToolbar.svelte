<script lang="ts">
  import ThemeSelector from './ThemeSelector.svelte';

  interface Props {
    onPrint?: () => void;
    onCopyHtml?: () => void;
  }

  let { onPrint, onCopyHtml }: Props = $props();
</script>

<div class="viewer-toolbar">
  <div class="toolbar-right">
    {#if onCopyHtml}
      <button class="toolbar-button" onclick={onCopyHtml} title="Copy HTML">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>Copy HTML</span>
      </button>
    {/if}

    {#if onPrint}
      <button class="toolbar-button" onclick={onPrint} title="Print">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        <span>Print</span>
      </button>
    {/if}

    <ThemeSelector />
  </div>
</div>

<style>
  .viewer-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 6px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    height: 40px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-button {
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

  .toolbar-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .toolbar-button span {
    display: none;
  }

  @media (min-width: 640px) {
    .toolbar-button span {
      display: inline;
    }
  }
</style>
