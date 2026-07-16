<script lang="ts">
  import { renderMarkdown } from '$lib/utils/markdown';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import { fileState } from '$lib/stores/file.svelte';
  import { openUrl, openPath } from '@tauri-apps/plugin-opener';
  import type { Frontmatter } from '$lib/types';

  interface Props {
    content: string;
    onViewerReady?: (element: HTMLDivElement) => void;
  }

  let { content, onViewerReady }: Props = $props();

  let html = $state('');
  let frontmatter: Frontmatter | null = $state(null);
  let viewerElement: HTMLDivElement | undefined = $state(undefined);
  let renderTimeout: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }

    const currentContent = content;
    renderTimeout = setTimeout(async () => {
      const result = await renderMarkdown(currentContent, fileState.currentFile);
      html = result.html;
      frontmatter = result.frontmatter;
    }, 150);

    return () => {
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
    };
  });

  $effect(() => {
    if (viewerElement && onViewerReady) {
      onViewerReady(viewerElement);
    }
  });

  function handleScroll() {
    if (viewerElement) {
      viewerState.scrollTop = viewerElement.scrollTop;
    }
  }

  function resolveRelativePath(href: string): string {
    if (!fileState.currentFile) return href;
    const currentDir = fileState.currentFile.substring(0, fileState.currentFile.lastIndexOf('/'));
    const parts = (currentDir + '/' + href).split('/');
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }
    return '/' + resolved.join('/');
  }

  async function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    e.preventDefault();

    if (href.startsWith('#')) {
      const el = viewerElement?.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('file://')) {
      try {
        await openUrl(href);
      } catch (err) {
        console.warn('Failed to open URL:', err);
      }
      return;
    }

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
      try {
        await openUrl(href);
      } catch (err) {
        console.warn('Failed to open URL:', err);
      }
      return;
    }

    if (href.startsWith('/')) {
      try {
        await openPath(href);
      } catch (err) {
        console.warn('Failed to open path:', err);
      }
      return;
    }

    if (fileState.currentFile) {
      const resolved = resolveRelativePath(href);
      try {
        await openPath(resolved);
      } catch (err) {
        console.warn('Failed to open path:', err);
      }
      return;
    }

    try {
      await openUrl(href);
    } catch (err) {
      console.warn('Failed to open URL:', err);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A') {
        handleLinkClick(e as unknown as MouseEvent);
      }
    }
  }

  // A frontmatter block with both `name` and `description` is treated as a
  // skill file and rendered as a prominent skill card.
  const isSkill = $derived.by(() => {
    if (!frontmatter) return false;
    return Boolean(frontmatter.name) && Boolean(frontmatter.description);
  });

  // Extra metadata entries beyond the skill-specific fields.
  const extraEntries = $derived.by(() => {
    if (!frontmatter) return [];
    const skip = new Set(['name', 'description']);
    return Object.entries(frontmatter).filter(([k]) => !skip.has(k));
  });

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  export function getViewerElement() {
    return viewerElement;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="viewer-container"
  role="group"
  aria-label="Markdown preview"
  bind:this={viewerElement}
  onscroll={handleScroll}
  onclick={handleLinkClick}
  onkeydown={handleKeydown}
>
  <div class="viewer-content" id="viewer-content">
    {#if frontmatter}
      <div class="frontmatter-card" data-line="1">
        {#if isSkill}
          <div class="skill-badge">Skill</div>
          {#if frontmatter.name}
            <div class="skill-name">{frontmatter.name}</div>
          {/if}
          {#if frontmatter.description}
            <p class="skill-description">{frontmatter.description}</p>
          {/if}
          {#if extraEntries.length > 0}
            <dl class="skill-meta">
              {#each extraEntries as [key, value]}
                <dt>{key}</dt>
                <dd>{formatValue(value)}</dd>
              {/each}
            </dl>
          {/if}
        {:else}
          <div class="frontmatter-title">Frontmatter</div>
          <dl class="skill-meta">
            {#each Object.entries(frontmatter) as [key, value]}
              <dt>{key}</dt>
              <dd>{formatValue(value)}</dd>
            {/each}
          </dl>
        {/if}
      </div>
    {/if}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
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

  .frontmatter-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-tertiary);
    padding: 16px 24px;
    margin-bottom: 24px;
  }

  .skill-badge {
    display: inline-block;
    font-size: 0.7em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--bg-primary);
    background: var(--accent);
    padding: 2px 8px;
    border-radius: 4px;
    margin-bottom: 8px;
  }

  .skill-name {
    font-size: 1.25em;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .skill-description {
    margin: 0 0 12px 0;
    color: var(--text-secondary);
  }

  .frontmatter-title {
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .skill-meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0;
  }

  .skill-meta dt {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .skill-meta dd {
    margin: 0;
    word-break: break-word;
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

  .viewer-content :global(.task-list-item) {
    list-style: none;
    margin-left: -1.5em;
  }

  .viewer-content :global(.task-list-item input[type="checkbox"]) {
    margin-right: 0.5em;
  }

  .viewer-content :global(.footnotes-sep) {
    border-top: 1px solid var(--border);
    margin-top: 2em;
  }

  .viewer-content :global(.footnotes) {
    font-size: 0.85em;
    color: var(--text-secondary);
  }

  .viewer-content :global(.footnotes ol) {
    padding-left: 1.5em;
  }

  .viewer-content :global(.footnotes .footnote-backref) {
    color: var(--accent);
    text-decoration: none;
    margin-left: 0.25em;
  }
</style>
