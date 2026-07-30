<script lang="ts">
  import { toastState, dismiss } from '$lib/stores/toast.svelte';

  function iconFor(kind: string): string {
    if (kind === 'error') return '\u26A0';
    if (kind === 'warning') return '\u26A0';
    return '\u2139';
  }
</script>

{#if toastState.items.length > 0}
  <div class="toaster" role="region" aria-label="Notifications">
    {#each toastState.items as item (item.id)}
      <div class="toast {item.kind}" role="alert">
        <span class="icon" aria-hidden="true">{iconFor(item.kind)}</span>
        <div class="content">
          <div class="message">{item.message}</div>
          {#if item.detail}
            <div class="detail">{item.detail}</div>
          {/if}
        </div>
        <button class="close" aria-label="Dismiss" onclick={() => dismiss(item.id)}>
          {'\u00D7'}
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toaster {
    position: fixed;
    top: 56px;
    right: 16px;
    z-index: 300;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 360px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
    animation: slide-in 150ms ease-out;
  }

  @keyframes slide-in {
    from {
      transform: translateX(16px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast.error {
    border-left: 3px solid #e06c75;
  }

  .toast.warning {
    border-left: 3px solid var(--accent-warning, #f59e0b);
  }

  .toast.info {
    border-left: 3px solid var(--accent);
  }

  .icon {
    font-size: 16px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .toast.error .icon {
    color: #e06c75;
  }

  .toast.warning .icon {
    color: var(--accent-warning, #f59e0b);
  }

  .toast.info .icon {
    color: var(--accent);
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  .message {
    font-weight: 500;
    line-height: 1.4;
  }

  .detail {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-word;
  }

  .close {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    border-radius: 4px;
  }

  .close:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
</style>