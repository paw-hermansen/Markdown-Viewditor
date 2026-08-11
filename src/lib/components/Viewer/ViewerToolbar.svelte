<script lang="ts">
  import ThemeSelector from './ThemeSelector.svelte';
  import DropdownButton from '$lib/components/DropdownButton.svelte';
  import { getThemeLabel } from '$lib/utils/themes';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import { settingsState, updateSetting } from '$lib/stores/settings.svelte';
  import { modLabel } from '$lib/utils/keyboard';
  import { listExporters } from '$lib/export/registry.svelte';

  interface Props {
    onPrint?: () => void;
    onExport?: (id: string) => void;
  }

  let { onPrint, onExport }: Props = $props();

  const isMacOS = navigator.userAgent.includes('Macintosh');

  const themeLabel = $derived(getThemeLabel(viewerState.theme));

  const exportChoices = $derived(
    listExporters().map((e) => ({ value: e.id, label: e.label, description: e.description })),
  );

  function handleExportAction(id: string) {
    onExport?.(id);
  }
</script>

<div class="viewer-toolbar">
  <div class="toolbar-right">
    {#if onExport && exportChoices.length === 1}
      <button
        class="toolbar-button"
        onclick={() => handleExportAction(exportChoices[0].value)}
        title={exportChoices[0].label}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{exportChoices[0].label}</span>
      </button>
    {:else if onExport && exportChoices.length > 1}
      <DropdownButton
        choices={exportChoices}
        fixedLabel="Export as…"
        onSelect={handleExportAction}
        title="Export document"
        header={themeLabel}
      >
        {#snippet leadingIcon()}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        {/snippet}
        {#snippet footer()}
          <label>
            <input
              type="checkbox"
              checked={!settingsState.exportConfirmDismissed}
              onchange={() => updateSetting('exportConfirmDismissed', !settingsState.exportConfirmDismissed)}
            />
            {isMacOS ? 'Show export confirmation' : 'Show export and print confirmation'}
          </label>
        {/snippet}
      </DropdownButton>
    {/if}

    {#if !isMacOS && onPrint}
      <button class="toolbar-button" onclick={() => onPrint?.()} title={modLabel('Print / PDF (Ctrl+P)')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        <span>Print / PDF</span>
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
