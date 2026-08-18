<script lang="ts">
  import {
    exportConfirmState,
    resolveExportConfirm,
  } from '$lib/stores/export-confirm-dialog.svelte';
  import type { OptionGroup } from '$lib/export/types';

  let dontShowAgain = $state(false);
  /** Working copy of the option values — mutated as the user toggles. */
  let currentOptions = $state<Record<string, unknown>>({});
  /** Static option-group definitions, frozen at dialog open time. */
  let optionGroups = $state<OptionGroup[]>([]);

  function disabledFor(group: OptionGroup): boolean {
    return group.options.every((opt) => {
      if (!opt.disabledWhen) return false;
      return opt.disabledWhen(currentOptions);
    });
  }

  function setOption(id: string, value: unknown) {
    currentOptions = { ...currentOptions, [id]: value };
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!exportConfirmState.current) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    }
  }

  function handleCancel() {
    resolveExportConfirm({ confirmed: false, dontShowAgain: false });
  }

  function handleConfirm() {
    resolveExportConfirm({
      confirmed: true,
      dontShowAgain,
      options: { ...currentOptions },
    });
  }

  // Reset state when dialog opens.
  $effect(() => {
    const req = exportConfirmState.current;
    if (req) {
      dontShowAgain = false;
      currentOptions = { ...req.currentOptions };
      optionGroups = req.optionGroups;
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if exportConfirmState.current}
  {@const req = exportConfirmState.current}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={req.title}
      aria-describedby="export-confirm-message"
    >
      <div class="icon-row">
        <span class="icon" aria-hidden="true">{'\u2139'}</span>
        <h2 class="title">{req.title}</h2>
      </div>

      <!-- Theme description -->
      <p id="export-confirm-message" class="message">
        {#if req.themeKind === 'neutral'}
          This export always uses a neutral, printer-friendly style.
        {:else if req.isMacOS}
          Exports use the current viewer theme.
        {:else}
          Exports and prints use the current viewer theme.
        {/if}
      </p>
      {#if req.themeKind === 'viewer'}
        <p class="theme-line">Current theme: <strong>{req.themeLabel}</strong></p>
        <p class="hint">
          To export with a neutral style, select "Printer Friendly / Neutral" in the theme selector before exporting.
        </p>
      {/if}

      <!-- Options -->
      {#if optionGroups.length > 0}
        <div class="options">
          <h3 class="options-heading">Options</h3>
          {#each optionGroups as group (group.id)}
            <fieldset class="option-group" disabled={disabledFor(group)}>
              <legend class="option-group-label">{group.label}</legend>
              {#each group.options as opt (opt.id)}
                <div class="option-row">
                  {#if opt.kind === 'toggle'}
                    <label class="option-control toggle-row">
                      <input
                        type="checkbox"
                        checked={!!currentOptions[opt.id]}
                        onchange={(e) =>
                          setOption(opt.id, (e.currentTarget as HTMLInputElement).checked)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  {:else if opt.kind === 'select'}
                    <label class="option-control select-row">
                      <span class="select-label">{opt.label}</span>
                      <select
                        value={String(currentOptions[opt.id] ?? opt.value)}
                        onchange={(e) => {
                          const raw = (e.currentTarget as HTMLSelectElement).value;
                          const match = opt.choices?.find(
                            (c) => String(c.value) === raw,
                          );
                          setOption(opt.id, match ? match.value : raw);
                        }}
                      >
                        {#each opt.choices ?? [] as choice (String(choice.value))}
                          <option value={String(choice.value)}>{choice.label}</option>
                        {/each}
                      </select>
                    </label>
                  {/if}
                  {#if opt.hint}
                    <p class="option-hint">{opt.hint}</p>
                  {/if}
                </div>
              {/each}
            </fieldset>
          {/each}
        </div>
      {:else}
        <div class="options options-empty">
          <h3 class="options-heading">Options</h3>
          <p class="options-empty-text">No options for this export.</p>
        </div>
      {/if}

      <label class="checkbox-row">
        <input type="checkbox" bind:checked={dontShowAgain} />
        <span>Do not show this message again</span>
      </label>

      <div class="actions">
        <button class="btn" onclick={handleCancel}>Cancel</button>
        <button class="btn primary" onclick={handleConfirm}>{req.actionLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 250;
    animation: fade-in 120ms ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dialog {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 480px;
    width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px;
    animation: slide-up 120ms ease-out;
  }

  @keyframes slide-up {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .icon-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .icon {
    font-size: 20px;
    line-height: 1;
    color: var(--accent);
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }

  .message {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
    margin: 0 0 8px 28px;
  }

  .theme-line {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
    margin: 0 0 12px 28px;
  }

  .hint {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
    margin: 0 0 16px 28px;
    font-style: italic;
  }

  .options {
    margin: 16px 0 12px;
    padding: 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .options-empty {
    padding: 12px 12px 14px;
  }

  .options-heading {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin: 0 0 8px 0;
  }

  .options-empty-text {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: italic;
    margin: 0;
  }

  .option-group {
    border: none;
    padding: 0;
    margin: 0 0 10px 0;
    min-width: 0;
  }

  .option-group:last-child {
    margin-bottom: 0;
  }

  .option-group-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
    padding: 0;
  }

  .option-row {
    margin-bottom: 4px;
  }

  .option-control {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .select-row {
    flex-wrap: wrap;
  }

  .select-label {
    flex: 1;
  }

  .option-control select {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .option-group:disabled {
    opacity: 0.5;
  }

  .option-group:disabled .option-control {
    cursor: not-allowed;
  }

  .option-hint {
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-secondary);
    margin: 2px 0 0 24px;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-primary);
    margin: 16px 0 12px 0;
    cursor: pointer;
  }

  .checkbox-row input[type="checkbox"] {
    cursor: pointer;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn {
    padding: 7px 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: all 150ms ease-in-out;
    min-width: 72px;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent);
    border-color: var(--accent);
    opacity: 0.85;
  }
</style>