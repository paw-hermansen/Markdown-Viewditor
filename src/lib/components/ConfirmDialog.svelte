<script lang="ts">
  import {
    confirmState,
    resolveConfirm,
    type ConfirmButton,
  } from '$lib/stores/confirm.svelte';
  import { focusTrap } from '$lib/utils/focus-trap';

  function pick(btn: ConfirmButton) {
    resolveConfirm(btn.value);
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) resolveConfirm(null);
  }
</script>

{#if confirmState.current}
  {@const req = confirmState.current}
  <div class="backdrop" role="presentation" onclick={handleBackdropClick}>
    <div
      class="dialog {req.kind}"
      role="alertdialog"
      aria-modal="true"
      aria-label={req.title}
      aria-describedby="confirm-message"
      use:focusTrap={{ onEscape: () => resolveConfirm(null) }}
    >
      <div class="icon-row">
        <span class="icon" aria-hidden="true">
          {#if req.kind === 'error'}{'\u26D4'}{:else}{'\u26A0'}{/if}
        </span>
        <h2 class="title">{req.title}</h2>
      </div>
      <p id="confirm-message" class="message">{req.message}</p>
      <div class="actions">
        {#each req.buttons as btn}
          <button
            class="btn {btn.variant ?? 'default'}"
            onclick={() => pick(btn)}
          >
            {btn.label}
          </button>
        {/each}
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
    max-width: 420px;
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

  .dialog.error .icon {
    color: var(--accent-danger);
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
    margin: 0 0 20px 28px;
    white-space: pre-wrap;
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
    background: var(--accent);
    border-color: var(--accent);
    opacity: 0.85;
  }

  .btn.danger {
    background: var(--accent-danger);
    color: #fff;
    border-color: var(--accent-danger);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--accent-danger);
    border-color: var(--accent-danger);
    opacity: 0.85;
  }
</style>