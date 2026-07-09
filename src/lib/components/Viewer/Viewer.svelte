<script lang="ts">
  import { renderMarkdown } from '$lib/utils/markdown';
  import { viewerState } from '$lib/stores/viewer.svelte';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  let html = $derived(renderMarkdown(content));
  let viewerElement: HTMLDivElement | undefined = $state(undefined);

  function handleScroll() {
    if (viewerElement) {
      viewerState.scrollTop = viewerElement.scrollTop;
    }
  }
</script>

<div
  class="viewer-container"
  data-theme={viewerState.theme}
  bind:this={viewerElement}
  onscroll={handleScroll}
>
  <div class="viewer-content">
    {@html html}
  </div>
</div>

<style>
  .viewer-container {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .viewer-content {
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .viewer-content :global(h1) {
    font-size: 2em;
    margin-bottom: 0.5em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
  }

  .viewer-content :global(h2) {
    font-size: 1.5em;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }

  .viewer-content :global(h3) {
    font-size: 1.25em;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }

  .viewer-content :global(p) {
    margin-bottom: 1em;
  }

  .viewer-content :global(code) {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .viewer-content :global(pre) {
    background: var(--bg-tertiary);
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1em;
  }

  .viewer-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .viewer-content :global(ul),
  .viewer-content :global(ol) {
    margin-bottom: 1em;
    padding-left: 2em;
  }

  .viewer-content :global(li) {
    margin-bottom: 0.25em;
  }

  .viewer-content :global(blockquote) {
    border-left: 4px solid var(--accent);
    padding-left: 1em;
    margin-left: 0;
    margin-bottom: 1em;
    color: var(--text-secondary);
  }

  .viewer-content :global(a) {
    color: var(--accent);
    text-decoration: none;
  }

  .viewer-content :global(a:hover) {
    text-decoration: underline;
  }

  .viewer-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .viewer-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1em;
  }

  .viewer-content :global(th),
  .viewer-content :global(td) {
    border: 1px solid var(--border);
    padding: 8px 12px;
    text-align: left;
  }

  .viewer-content :global(th) {
    background: var(--bg-tertiary);
    font-weight: 600;
  }

  .viewer-content :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 2em 0;
  }

  .viewer-content :global(strong) {
    font-weight: 600;
  }

  .viewer-content :global(em) {
    font-style: italic;
  }
</style>
