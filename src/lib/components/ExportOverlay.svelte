<script lang="ts">
  import { exportingState } from '$lib/stores/exporting.svelte';
</script>

{#if exportingState.active}
  <div class="backdrop" role="presentation">
    <div class="overlay-content" role="alert" aria-live="assertive" aria-label="Exporting document">
      <div class="spinner" aria-hidden="true"></div>
      <span class="label">Exporting…</span>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 260;
    animation: fade-in 120ms ease-out;
    cursor: default;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .overlay-content {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    padding: 16px 24px;
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

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 600ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .label {
    font-size: 14px;
    color: var(--text-primary);
    user-select: none;
  }
</style>
