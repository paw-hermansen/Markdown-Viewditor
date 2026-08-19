<script lang="ts">
  import type { ViewMode } from '$lib/types';
  import { modLabel } from '$lib/utils/keyboard';
  import { listExporters } from '$lib/export/registry.svelte';

  interface Command {
    id: string;
    label: string;
    shortcut?: string;
    category: string;
    action: () => void;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    onNew: () => void;
    onOpen: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onReload: () => void;
    onQuit: () => void;
    onViewModeChange: (mode: ViewMode) => void;
    onAbout: () => void;
    onPrint?: () => void;
    onExport?: (id: string) => void;
    printLabel?: string;
  }

  let { open, onClose, onNew, onOpen, onSave, onSaveAs, onReload, onQuit, onViewModeChange, onAbout, onPrint, onExport, printLabel = 'Print Preview' }: Props = $props();

  let searchQuery = $state('');
  let selectedIndex = $state(0);
  let searchInput = $state<HTMLInputElement | undefined>();
  let commandsList = $state<HTMLDivElement | undefined>();

  // Export commands are registry-fed: any exporter registered via
  // `registerExporter` appears here automatically (File category).
  const exportCommands = $derived(
    onExport
      ? listExporters().map((e) => ({
          id: `export-${e.id}`,
          label: e.label,
          category: 'File',
          action: () => onExport(e.id),
        }))
      : [],
  );

  const commands: Command[] = $derived([
    { id: 'new', label: 'New File', shortcut: modLabel('Ctrl+N'), category: 'File', action: onNew },
    { id: 'open', label: 'Open File', shortcut: modLabel('Ctrl+O'), category: 'File', action: onOpen },
    { id: 'save', label: 'Save', shortcut: modLabel('Ctrl+S'), category: 'File', action: onSave },
    { id: 'save-as', label: 'Save As', shortcut: modLabel('Ctrl+Shift+S'), category: 'File', action: onSaveAs },
    { id: 'reload', label: 'Reload from Disk', shortcut: modLabel('Ctrl+R'), category: 'File', action: onReload },
    { id: 'quit', label: 'Quit', shortcut: modLabel('Ctrl+Q'), category: 'File', action: onQuit },
    ...exportCommands,
    { id: 'view-split', label: 'Split View', category: 'View', action: () => onViewModeChange('split') },
    { id: 'view-editor', label: 'Editor Only', category: 'View', action: () => onViewModeChange('editor') },
    { id: 'view-viewer', label: 'Viewer Only', category: 'View', action: () => onViewModeChange('viewer') },
    ...(onPrint ? [{ id: 'print', label: printLabel, shortcut: modLabel('Ctrl+P'), category: 'File', action: onPrint }] : []),
    { id: 'about', label: 'About', shortcut: 'F1', category: 'Help', action: onAbout },
  ]);

  let filteredCommands = $derived.by(() => {
    if (!searchQuery.trim()) return commands;
    const query = searchQuery.toLowerCase();
    const labelMatches: Command[] = [];
    const categoryMatches: Command[] = [];
    for (const cmd of commands) {
      const matchesLabel = cmd.label.toLowerCase().includes(query);
      const matchesCategory = cmd.category.toLowerCase().includes(query);
      if (matchesLabel) {
        labelMatches.push(cmd);
      } else if (matchesCategory) {
        categoryMatches.push(cmd);
      }
    }
    return [...labelMatches, ...categoryMatches];
  });

  $effect(() => {
    if (open) {
      searchQuery = '';
      selectedIndex = 0;
      setTimeout(() => searchInput?.focus(), 0);
    }
  });

  $effect(() => {
    void filteredCommands.length;
    if (selectedIndex >= filteredCommands.length) {
      selectedIndex = Math.max(0, filteredCommands.length - 1);
    }
  });

  $effect(() => {
    void selectedIndex;
    const selected = commandsList?.querySelector('.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
      return;
    }
  }

  function executeSelected() {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) {
      cmd.action();
      onClose();
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleOverlayKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={handleOverlayClick} onkeydown={handleOverlayKeydown}>
    <div class="palette" role="dialog" aria-label="Command palette">
      <div class="search-container">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          onkeydown={handleKeydown}
          type="text"
          class="search-input"
          placeholder="Type a command..."
          spellcheck="false"
        />
        <span class="shortcut-hint">Esc to close</span>
      </div>
      <div class="commands-list" bind:this={commandsList}>
        {#each filteredCommands as command, i}
          <button
            class="command-item"
            class:selected={i === selectedIndex}
            onclick={() => { command.action(); onClose(); }}
            onmouseenter={() => selectedIndex = i}
          >
            <span class="command-label">{command.label}</span>
            <span class="command-meta">
              <span class="command-category">{command.category}</span>
              {#if command.shortcut}
                <span class="command-shortcut">{command.shortcut}</span>
              {/if}
            </span>
          </button>
        {/each}
        {#if filteredCommands.length === 0}
          <div class="no-results">No matching commands</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .palette {
    width: 480px;
    max-width: 90vw;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .search-container {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    gap: 10px;
  }

  .search-icon {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 15px;
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .shortcut-hint {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .commands-list {
    max-height: 320px;
    overflow-y: auto;
    padding: 4px;
  }

  .command-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    font-size: 14px;
    gap: 12px;
  }

  .command-item:hover,
  .command-item.selected {
    background: var(--bg-hover);
  }

  .command-label {
    flex: 1;
    min-width: 0;
  }

  .command-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .command-category {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .command-shortcut {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }

  .no-results {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }

  .commands-list::-webkit-scrollbar {
    width: 6px;
  }

  .commands-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .commands-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .commands-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
</style>
