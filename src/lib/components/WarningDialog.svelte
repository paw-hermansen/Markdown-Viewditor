<script lang="ts">
  import {
    warningDialogState,
    dismissWarningDialog,
  } from '$lib/stores/warning-dialog.svelte';

  function handleKeydown(e: KeyboardEvent) {
    if (!warningDialogState.current) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      dismissWarningDialog();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) dismissWarningDialog();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if warningDialogState.current}
  {@const req = warningDialogState.current}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label="Export Warnings"
      aria-describedby="warning-dialog-message"
    >
      <div class="icon-row">
        <span class="icon" aria-hidden="true">{'\u26A0'}</span>
        <h2 class="title">Export Warnings</h2>
      </div>
      {#if req.savedPath}
        <p class="saved-path">Exported to: {req.savedPath}</p>
      {/if}
      <p id="warning-dialog-message" class="sr-only">
        {req.warnings.length} warning{req.warnings.length !== 1 ? 's' : ''} occurred during export.
      </p>
      <ul class="warning-list">
        {#each req.warnings as warning}
          <li class="warning-item">{warning}</li>
        {/each}
      </ul>
      <div class="actions">
        <button class="btn primary" onclick={dismissWarningDialog}>OK</button>
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
    max-width: 500px;
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
    color: var(--accent-warning, #f59e0b);
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .saved-path {
    font-size: 12px;
    color: var(--text-secondary);
    margin: 0 0 12px 28px;
    word-break: break-all;
  }

  .warning-list {
    list-style: none;
    padding: 0;
    margin: 0 0 20px 28px;
    max-height: 60vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .warning-item {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-primary);
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    word-break: break-all;
  }

  .warning-item::before {
    content: '\2022 ';
    color: var(--accent-warning, #f59e0b);
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
