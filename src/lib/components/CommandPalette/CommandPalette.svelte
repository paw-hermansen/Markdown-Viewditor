<script lang="ts">
  import { listCommands, formatShortcut, runCommand } from "$lib/commands/registry.svelte";
  import { focusTrap } from "$lib/utils/focus-trap";
  import { createPopupController } from "$lib/utils/popup";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let searchQuery = $state("");
  let selectedIndex = $state(0);
  let searchInput = $state<HTMLInputElement | undefined>();
  let commandsList = $state<HTMLDivElement | undefined>();
  let paletteRef = $state<HTMLDivElement | undefined>();

  // Dismissal (overlay click + Escape) is owned by the popup controller;
  // placement stays a CSS-centered modal and `focusTrap` stays as-is.
  const popupController = createPopupController(
    () => paletteRef ?? null,
    () => paletteRef ?? null,
    {
      onDismiss: (reason) => {
        if (reason === "outside" || reason === "escape") onClose();
      },
    },
  );

  const commands = $derived(listCommands());

  let filteredCommands = $derived.by(() => {
    if (!searchQuery.trim()) return commands;
    const query = searchQuery.toLowerCase();
    const labelMatches: (typeof commands)[number][] = [];
    const categoryMatches: (typeof commands)[number][] = [];
    for (const cmd of commands) {
      const matchesLabel = cmd.title.toLowerCase().includes(query);
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
      searchQuery = "";
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
    const selected = commandsList?.querySelector(".selected");
    selected?.scrollIntoView({ block: "nearest" });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      executeSelected();
      return;
    }
  }

  async function executeSelected() {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) {
      await runCommand(cmd.id);
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      popupController.open();
      return () => popupController.close();
    }
  });
</script>

{#if open}
  <div class="overlay">
    <div class="palette" role="dialog" aria-label="Command palette" aria-modal="true" use:focusTrap={{ onEscape: onClose, initialFocus: searchInput }} bind:this={paletteRef}>
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
          aria-label="Search commands"
        />
        <span class="shortcut-hint">Esc to close</span>
      </div>
      <div class="commands-list" bind:this={commandsList} role="listbox" aria-label="Commands">
        {#each filteredCommands as command, i}
          <button
            class="command-item"
            class:selected={i === selectedIndex}
            role="option"
            aria-selected={i === selectedIndex}
            onclick={() => { runCommand(command.id); onClose(); }}
            onmouseenter={() => selectedIndex = i}
          >
            <span class="command-label">{command.title}</span>
            <span class="command-meta">
              <span class="command-category">{command.category}</span>
              {#if command.shortcut}
                <span class="command-shortcut">{formatShortcut(command.shortcut)}</span>
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
    /* Never taller than the space below the search box, so the list scrolls
       within the screen at high zoom. */
    max-height: min(320px, calc(100vh - 180px));
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
