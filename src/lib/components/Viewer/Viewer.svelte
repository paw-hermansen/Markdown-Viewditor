<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { resolveLink } from '$lib/utils/path';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import { fileState } from '$lib/stores/file.svelte';
  import { openUrl, openPath } from '@tauri-apps/plugin-opener';
  import type { Frontmatter } from '$lib/types';
  import '$lib/styles/markdown.css';

  const isMacOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh');

  function isMarkdownFile(path: string): boolean {
    const lower = path.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
  }

  interface Props {
    content: string;
    onViewerReady?: (element: HTMLDivElement) => void;
    onLocalMarkdownOpen?: (path: string) => void;
  }

  let { content, onViewerReady, onLocalMarkdownOpen }: Props = $props();

  let html = $state('');
  let frontmatter: Frontmatter | null = $state(null);
  let renderKey = $state(0);
  let viewerElement: HTMLDivElement | undefined = $state(undefined);
  let viewerContentElement: HTMLDivElement | undefined = $state(undefined);
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
    const el = viewerContentElement;
    if (!el) return;
    el.addEventListener('error', handleImageError, true);
    return () => {
      el.removeEventListener('error', handleImageError, true);
    };
  });

  let tooltipEl: HTMLDivElement | undefined = $state(undefined);
  let activeWrapper: Element | null = null;

  $effect(() => {
    const container = viewerContentElement;
    const tooltip = tooltipEl;
    if (!container || !tooltip) return;

    function onMove(e: MouseEvent) {
      const wrapper = (e.target as HTMLElement)?.closest?.('.img-tooltip-wrapper');
      if (!wrapper) {
        if (activeWrapper) {
          tooltip!.style.display = 'none';
          activeWrapper = null;
        }
        return;
      }
      if (wrapper !== activeWrapper) {
        const text = wrapper.getAttribute('data-tooltip');
        if (!text) {
          tooltip!.style.display = 'none';
          activeWrapper = null;
          return;
        }
        tooltip!.textContent = text;
        activeWrapper = wrapper;
      }
      tooltip!.style.display = 'block';

      const pad = 12;
      const tw = tooltip!.offsetWidth;
      const th = tooltip!.offsetHeight;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      if (x + tw > window.innerWidth - 4) {
        x = e.clientX - tw - pad;
      }
      if (y + th > window.innerHeight - 4) {
        y = e.clientY - th - pad;
      }
      tooltip!.style.left = `${x}px`;
      tooltip!.style.top = `${y}px`;
    }

    function onLeave(e: MouseEvent) {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !activeWrapper?.contains(related)) {
        tooltip!.style.display = 'none';
        activeWrapper = null;
      }
    }

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
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

  async function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    e.preventDefault();

    const resolved = resolveLink(fileState.currentFile, href);

    switch (resolved.kind) {
      case 'anchor': {
        const el = viewerElement?.querySelector(`#${CSS.escape(resolved.id)}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }
      case 'url': {
        try {
          await openUrl(resolved.href);
        } catch (err) {
          console.warn('Failed to open URL:', err);
        }
        return;
      }
      case 'local-path': {
        try {
          if (isMacOS && isMarkdownFile(resolved.path) && onLocalMarkdownOpen) {
            onLocalMarkdownOpen(resolved.path);
          } else {
            await openPath(resolved.path);
          }
        } catch (err) {
          console.warn('Failed to open path:', err);
        }
        return;
      }
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

  function handleImageError(e: Event) {
    const img = e.target as HTMLImageElement;
    if (img.tagName !== 'IMG' || img.dataset.broken) return;
    img.dataset.broken = '1';
    if (!img.alt) {
      try {
        const url = new URL(img.src);
        const decoded = decodeURIComponent(url.pathname.split('/').pop() ?? '');
        img.alt = decoded || 'Image not found';
      } catch {
        img.alt = 'Image not found';
      }
    }
    img.removeAttribute('src');
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

  export function scrollToTop() {
    if (viewerElement) {
      viewerElement.scrollTop = 0;
    }
  }

  export function getViewerContentElement() {
    return viewerContentElement;
  }

  // Append a cache-busting query parameter to image URLs so a forced render
  // re-fetches them instead of being served from the webview's in-memory
  // image cache. The localimg protocol handler ignores the query string (it
  // only reads request.uri().path()), so local file resolution is unaffected.
  // data:/blob: URLs carry no remote resource and are left untouched.
  function bustImageCache(html: string, nonce: number): string {
    return html.replace(
      /(<img\s[^>]*?src=["'])([^"']+)(["'])/gi,
      (match, prefix, src, quote) => {
        if (/^(data:|blob:)/i.test(src)) return match;
        const sep = src.includes('?') ? '&' : '?';
        return `${prefix}${src}${sep}_r=${nonce}${quote}`;
      }
    );
  }

  // Capture the topmost visible data-line element and its fractional offset
  // from the container's top edge. Restoring via this anchor avoids the ~1px
  // per-reload drift caused by integer scrollTop round-trips.
  function captureScrollAnchor(): { line: string; offset: number } | null {
    if (!viewerElement || !viewerContentElement) return null;
    const containerTop = viewerElement.getBoundingClientRect().top;
    for (const el of viewerContentElement.querySelectorAll('[data-line]')) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > containerTop) {
        const line = el.getAttribute('data-line');
        if (line) {
          return { line, offset: rect.top - containerTop };
        }
      }
    }
    return null;
  }

  // Setting scrollTop snaps the scroll position to whole device pixels
  // (WebKit floors in device space). At a fractional devicePixelRatio (e.g.
  // 0.9 zoom) every assignment — even re-assigning the current value — can
  // shift the position by up to 1/dpr CSS pixels, and the integer getter
  // then reports a new value, so re-applying it on the next reload ratchets
  // the view ~1px per reload. Skipping sub-pixel adjustments avoids touching
  // scrollTop at all when the anchor is already where it was captured.
  const SCROLL_RESTORE_EPSILON_PX = 0.5;

  function restoreScrollPosition(
    anchor: { line: string; offset: number } | null,
    fallbackScrollTop: number
  ) {
    if (!viewerElement) return;
    if (anchor) {
      const newEl = viewerContentElement?.querySelector(`[data-line="${anchor.line}"]`);
      if (newEl) {
        const containerTop = viewerElement.getBoundingClientRect().top;
        const newOffset = newEl.getBoundingClientRect().top - containerTop;
        const adjustment = newOffset - anchor.offset;
        if (Math.abs(adjustment) >= SCROLL_RESTORE_EPSILON_PX) {
          viewerElement.scrollTop = viewerElement.scrollTop + adjustment;
        }
        return;
      }
    }
    if (Math.abs(viewerElement.scrollTop - fallbackScrollTop) >= SCROLL_RESTORE_EPSILON_PX) {
      viewerElement.scrollTop = fallbackScrollTop;
    }
  }

  const IMAGE_SETTLE_TIMEOUT_MS = 2000;

  // Resolve once all current images have finished loading (or failed), so
  // the scroll position can be restored against the final layout. Capped by
  // a timeout so slow external images don't delay the restore indefinitely.
  function waitForImages(): Promise<void> {
    const imgs = viewerContentElement
      ? Array.from(viewerContentElement.querySelectorAll('img'))
      : [];
    const pending = imgs
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
      );
    if (pending.length === 0) return Promise.resolve();
    return Promise.race([
      Promise.all(pending).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, IMAGE_SETTLE_TIMEOUT_MS)),
    ]);
  }

  let activeForceRender: Promise<void> | null = null;

  // Re-render the current content immediately (bypassing the debounce) and
  // restore the scroll position afterwards. Used by Reload so that external
  // resources (e.g. dynamic or previously broken images) are re-fetched even
  // when the markdown itself has not changed. Concurrent calls share a single
  // in-flight render.
  export function forceRender(): Promise<void> {
    if (activeForceRender) return activeForceRender;
    activeForceRender = doForceRender().finally(() => {
      activeForceRender = null;
    });
    return activeForceRender;
  }

  async function doForceRender() {
    const savedScrollTop = viewerElement?.scrollTop ?? viewerState.scrollTop;
    const anchor = captureScrollAnchor();
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = undefined;
    }
    const result = await renderMarkdown(content, fileState.currentFile);
    // Bumping the key forces the {#key} block around {@html} to destroy and
    // recreate the DOM even when the rendered HTML is identical (Svelte
    // skips the update for an unchanged string). This re-requests external
    // images and retries previously broken ones.
    renderKey += 1;
    html = bustImageCache(result.html, renderKey);
    frontmatter = result.frontmatter;
    await tick();
    // First restore: positions the anchor correctly in the transient layout
    // where freshly recreated images have no dimensions yet.
    restoreScrollPosition(anchor, savedScrollTop);
    const scrollAfterRestore = viewerElement?.scrollTop;
    // Recreated images load asynchronously; when they finish, their heights
    // shift the layout above the anchor. Restore again against the settled
    // layout so the view ends up exactly where it was captured.
    await waitForImages();
    // If the user scrolled while images were loading, don't yank the view back.
    if (viewerElement && viewerElement.scrollTop === scrollAfterRestore) {
      restoreScrollPosition(anchor, savedScrollTop);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="viewer-container"
  role="group"
  aria-label="Markdown view"
  bind:this={viewerElement}
  onscroll={handleScroll}
  onclick={handleLinkClick}
  onkeydown={handleKeydown}
>
  <div class="viewer-content" id="viewer-content" bind:this={viewerContentElement}>
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
    {#key renderKey}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html html}
    {/key}
  </div>
  <div class="img-cursor-tooltip" bind:this={tooltipEl}></div>
</div>

<style>
  .viewer-container {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: var(--viewer-bg);
    color: var(--text-primary);
  }

  /* .viewer-content and the markdown element styles — including the
     frontmatter-card/skill-* rules — live in src/lib/styles/markdown.css,
     shared with the export pipeline so exported HTML/PDF doesn't drift from
     the in-app look. */

  .img-cursor-tooltip {
    position: fixed;
    display: none;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    font-family: monospace;
    white-space: nowrap;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
</style>
