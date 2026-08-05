<script lang="ts">
  import ThemeSelector from './ThemeSelector.svelte';
  import DropdownButton, { type Choice } from '$lib/components/DropdownButton.svelte';
  import { settingsState, updatePrintStyle } from '$lib/stores/settings.svelte';
  import { getThemeLabel } from '$lib/utils/themes';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import type { PrintStyle } from '$lib/types';
  import { modLabel } from '$lib/utils/keyboard';
  import { listExporters } from '$lib/export/registry.svelte';

  interface Props {
    onPrint?: (style: PrintStyle) => void;
    onExport?: (id: string) => void;
  }

  let { onPrint, onExport }: Props = $props();

  const isMacOS = navigator.userAgent.includes('Macintosh');
  const prefix = isMacOS ? 'Create PDF' : 'Print';

  const themeLabel = $derived(getThemeLabel(viewerState.theme));

  const choices: Choice<PrintStyle>[] = [
    {
      value: 'printer-friendly',
      label: 'Printer-friendly',
      description: 'Clean black-on-white layout',
    },
    {
      value: 'theme',
      label: 'Current theme',
      description: 'Use the selected viewer theme (enable "Background graphics" in the print dialog for colored backgrounds)',
    },
  ];

  // Export dropdown is registry-fed: any exporter registered via
  // `registerExporter` shows up here automatically. With a single exporter
  // (the built-in HTML exporter) this renders as one button; a future second
  // format (DOCX/EPUB) automatically becomes a dropdown.
  const exportChoices = $derived(
    listExporters().map((e) => ({ value: e.id, label: e.label })),
  );

  function handleSelect(style: PrintStyle) {
    updatePrintStyle(style);
  }

  function handleAction(style: PrintStyle) {
    onPrint?.(style);
  }

  function handleExportAction(id: string) {
    onExport?.(id);
  }

  function formatLabel(choice: Choice<PrintStyle>): string {
    if (choice.value === 'theme') {
      return `${prefix}: ${themeLabel}`;
    }
    return `${prefix}: ${choice.label}`;
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
        value={exportChoices[0]?.value ?? ''}
        onAction={handleExportAction}
        title="Export document"
      >
        {#snippet leadingIcon()}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        {/snippet}
      </DropdownButton>
    {/if}

    {#if onPrint}
      <DropdownButton
        {choices}
        bind:value={settingsState.printStyle}
        onAction={handleAction}
        onSelect={handleSelect}
        title={modLabel(`${prefix} (Ctrl+P)`)}
        {formatLabel}
      >
        {#snippet leadingIcon()}
          {#if isMacOS}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          {/if}
        {/snippet}
      </DropdownButton>
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
