<script lang="ts">
  import {
    exportConfirmState,
    resolveExportConfirm,
  } from '$lib/stores/export-confirm-dialog.svelte';

  let dontShowAgain = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    if (!exportConfirmState.current) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      resolveExportConfirm({ confirmed: false, dontShowAgain: false });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resolveExportConfirm({ confirmed: true, dontShowAgain });
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
    resolveExportConfirm({ confirmed: true, dontShowAgain });
  }

  // Reset checkbox when dialog opens
  $effect(() => {
    if (exportConfirmState.current) {
      dontShowAgain = false;
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
      aria-label={req.isMacOS ? 'Export' : 'Export / Print'}
      aria-describedby="export-confirm-message"
    >
      <div class="icon-row">
        <span class="icon" aria-hidden="true">{'\u2139'}</span>
        <h2 class="title">{req.isMacOS ? 'Export' : 'Export / Print'}</h2>
      </div>
      <p id="export-confirm-message" class="message">
        {req.isMacOS
          ? 'Exports use the current viewer theme.'
          : 'Exports and prints use the current viewer theme.'}
      </p>
      <p class="theme-line">Current theme: <strong>{req.themeLabel}</strong></p>
      <p class="hint">
        To export with a neutral style, select "Printer Friendly / Neutral" in the theme selector before exporting.
      </p>
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
    max-width: 460px;
    width: 90vw;
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

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-primary);
    margin: 0 0 20px 0;
    cursor: pointer;
  }

  .checkbox-row input[type="checkbox"] {
    cursor: pointer;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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
    opacity: 0.9;
  }
</style>
