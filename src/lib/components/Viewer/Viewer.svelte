<script lang="ts">
  import { tick } from 'svelte';
  import { renderMarkdown, syncViewerBackground } from '$lib/utils/markdown';
  import { resolveLink } from '$lib/utils/path';
  import { viewerState } from '$lib/stores/viewer.svelte';
  import { fileState } from '$lib/stores/file.svelte';
  import { createRenderScheduler } from '$lib/stores/render-scheduler.svelte';
  import { bustImageCache } from '$lib/utils/image-cache-bust';
  import {
    captureScrollAnchor,
    restoreScrollPosition,
    waitForImages
  } from '$lib/utils/scroll-restore';
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
    loading?: boolean;
    onViewerReady?: (element: HTMLDivElement) => void;
    onLocalMarkdownOpen?: (path: string) => void;
  }

  let { content, loading = false, onViewerReady, onLocalMarkdownOpen }: Props = $props();

  let html = $state('');
  let frontmatter: Frontmatter | null = $state(null);
  let renderKey = $state(0);
  let viewerElement: HTMLDivElement | undefined = $state(undefined);
  let viewerContentElement: HTMLDivElement | undefined = $state(undefined);
  // Non-reactive flag: tracks whether the viewer has rendered at least once.
  // Used to skip the debounce on the initial load without creating a
  // dependency on `html`/`frontmatter` (which would cause the effect to
  // re-fire whenever the render completes and schedule a spurious timer).
  let hasRenderedOnce = false;
  // Non-reactive: the theme of the last completed render, so the render
  // effect can tell a theme change (a major, cache-missing re-render) from a
  // routine content change. null = nothing rendered yet.
  let lastRenderedTheme: string | null = null;

  // Ghosted busy overlay ("Rendering…") semantics — major renders
  // only, synchronous raise, drop-on-DOM, per-request ownership — live in
  // the render scheduler (see $lib/stores/render-scheduler.svelte.ts and
  // .agents/guides/zoom-theme-ui.md "Render busy overlay").
  const scheduler = createRenderScheduler();

  $effect(() => {
    const currentContent = content;
    const theme = viewerState.theme;
    // A theme change re-renders every Mermaid diagram (the cache is
    // theme-keyed) — the expensive case the busy overlay exists for. The
    // first render of a document counts as major too (lazy extension init).
    const major = !hasRenderedOnce || theme !== lastRenderedTheme;
    // Major renders (first render of a document, theme change) start
    // immediately — they are discrete actions, not typing. Routine content
    // changes keep the 150 ms debounce.
    const request = scheduler.requestRender(async (generation, clearBusy) => {
      const result = await renderMarkdown(currentContent, fileState.currentFile);
      if (!scheduler.isCurrent(generation)) return;
      html = result.html;
      frontmatter = result.frontmatter;
      lastRenderedTheme = theme;
      hasRenderedOnce = true;
      await tick();
      // Drop the overlay once the new content is actually on screen; the
      // request's finish() clears it as a fallback for early returns.
      clearBusy();
    }, major ? 0 : 150, major);

    return request.cancel;
  });

  // Derive --viewer-bg from the theme's #viewer-content background. Runs
  // here — not from a startup rAF in setTheme — because at startup the
  // element does not exist yet when that rAF is scheduled, and a frame
  // flushed early (e.g. by the persisted zoom applying at launch) makes it
  // miss, leaving the app on the generic palette. See syncViewerBackground.
  $effect(() => {
    const el = viewerContentElement;
    void viewerState.theme;
    if (!el) return;
    syncViewerBackground();
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
      const target = e.target as HTMLElement;

      // Image tooltips take priority (an image inside a link shows the image
      // alt/src, not the URL).
      const imgWrapper = target?.closest?.('.img-tooltip-wrapper');
      if (imgWrapper) {
        if (imgWrapper !== activeWrapper) {
          const text = imgWrapper.getAttribute('data-tooltip');
          if (!text) {
            tooltip!.style.display = 'none';
            activeWrapper = null;
            return;
          }
          tooltip!.textContent = text;
          activeWrapper = imgWrapper;
        }
        tooltip!.style.display = 'block';
      } else {
        // Link URL tooltip: show the href when hovering a link.
        const link = target?.closest?.('a[data-href]');
        if (link) {
          if (link !== activeWrapper) {
            tooltip!.textContent = link.getAttribute('data-href');
            activeWrapper = link;
          }
          tooltip!.style.display = 'block';
        } else {
          if (activeWrapper) {
            tooltip!.style.display = 'none';
            activeWrapper = null;
          }
          return;
        }
      }

      // Let the tooltip render at its natural (unconstrained) width, then
      // measure and position with viewport clamping.
      tooltip!.style.maxWidth = 'none';
      const pad = 12;
      const tw = tooltip!.offsetWidth;
      const th = tooltip!.offsetHeight;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      let openLeft = false;
      if (x + tw > window.innerWidth - 4) {
        x = e.clientX - tw - pad;
        openLeft = true;
      }
      if (y + th > window.innerHeight - 4) {
        y = e.clientY - th - pad;
      }
      // Widen the tooltip to fill available space (up to its natural width)
      // so long URLs are more readable.
      const avail = openLeft
        ? e.clientX - pad - 4
        : window.innerWidth - e.clientX - pad - 4;
      if (tw > avail) {
        tooltip!.style.maxWidth = `${avail}px`;
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

  function ensureImageAlt(node: HTMLElement) {
    const images = node.querySelectorAll('img');
    images.forEach((img) => {
      if (!img.hasAttribute('alt')) {
        img.setAttribute('alt', '');
        img.setAttribute('role', 'presentation');
      } else if (img.getAttribute('alt') === '') {
        img.setAttribute('role', 'presentation');
      }
    });
  }

  $effect(() => {
    const el = viewerContentElement;
    void html; // Create dependency on html
    if (!el) return;
    tick().then(() => {
      if (viewerContentElement) ensureImageAlt(viewerContentElement);
    });
  });

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

  export function scrollToTop() {
    if (viewerElement) {
      viewerElement.scrollTop = 0;
    }
  }

  export function getViewerContentElement() {
    return viewerContentElement;
  }

  // Wait for the newest render request and the DOM update caused by it. If a
  // newer request supersedes the one being awaited, follow that request
  // instead of waiting for stale async work to finish.
  export function waitForRender(): Promise<void> {
    return scheduler.waitForRender();
  }

  let activeForceRender: Promise<void> | null = null;

  /** Reset `hasRenderedOnce` so the next content change uses 0ms debounce. */
  export function resetRenderState() {
    hasRenderedOnce = false;
  }

  // Re-render the current content immediately (bypassing the debounce) and
  // restore the scroll position afterwards. Used by Reload so that external
  // resources (e.g. dynamic or previously broken images) are re-fetched even
  // when the markdown itself has not changed. Concurrent calls share a single
  // in-flight render.
  export function forceRender(): Promise<void> {
    if (activeForceRender) return activeForceRender;
    // `restoreScrollPosition` does nothing without a viewer element, so
    // there is no case where this has to fall back to a remembered value.
    const savedScrollTop = viewerElement?.scrollTop ?? 0;
    const anchor = captureScrollAnchor(viewerElement, viewerContentElement);
    const currentContent = content;
    const request = scheduler.requestRender(async (generation, clearBusy) => {
      const result = await renderMarkdown(currentContent, fileState.currentFile);
      if (!scheduler.isCurrent(generation)) return;

      // Bumping the key forces the {#key} block around {@html} to destroy and
      // recreate the DOM even when the rendered HTML is identical (Svelte
      // skips the update for an unchanged string). This re-requests external
      // images and retries previously broken ones.
      renderKey += 1;
      html = bustImageCache(result.html, renderKey);
      frontmatter = result.frontmatter;
      await tick();
      // Reload is a major render: drop the overlay once the refreshed DOM is
      // on screen; scroll restore + image settling continue below.
      clearBusy();
      if (!scheduler.isCurrent(generation)) return;

      // First restore: positions the anchor correctly in the transient layout
      // where freshly recreated images have no dimensions yet.
      restoreScrollPosition(viewerElement, viewerContentElement, anchor, savedScrollTop);
      const scrollAfterRestore = viewerElement?.scrollTop;
      // Recreated images load asynchronously; when they finish, their heights
      // shift the layout above the anchor. Restore again against the settled
      // layout so the view ends up exactly where it was captured.
      await waitForImages(viewerContentElement);
      if (!scheduler.isCurrent(generation)) return;
      // If the user scrolled while images were loading, don't yank the view back.
      if (viewerElement && viewerElement.scrollTop === scrollAfterRestore) {
        restoreScrollPosition(viewerElement, viewerContentElement, anchor, savedScrollTop);
      }
    }, 0, true);
    activeForceRender = request.promise.finally(() => {
      activeForceRender = null;
    });
    return activeForceRender;
  }
</script>

<div class="viewer-wrapper">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="viewer-container"
    role="group"
    aria-label="Markdown view"
    bind:this={viewerElement}
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
  </div>
  {#if loading || scheduler.busy}
    <div class="loading-overlay" class:rendering-overlay={scheduler.busy && !loading} role="presentation">
      <div
        class="loading-overlay-content"
        role={loading ? "alert" : "status"}
        aria-live={loading ? "assertive" : "polite"}
        aria-label={loading ? "Loading document" : "Rendering document"}
      >
        <div class="loading-spinner" aria-hidden="true"></div>
        <span class="loading-label">{loading ? "Loading…" : "Rendering…"}</span>
      </div>
    </div>
  {/if}
  <div class="cursor-tooltip" bind:this={tooltipEl}></div>
</div>

<style>
  .viewer-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

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

  .cursor-tooltip {
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
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    animation: loading-fade-in 120ms ease-out;
    cursor: default;
  }

  /* The re-render overlay ghosts the stale content but stays out of the way:
     the editor, toolbar and viewer scrolling stay usable while a major
     render runs. */
  .loading-overlay.rendering-overlay {
    pointer-events: none;
  }

  @keyframes loading-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .loading-overlay-content {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    padding: 16px 24px;
    animation: loading-slide-up 120ms ease-out;
  }

  @keyframes loading-slide-up {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: loading-spin 600ms linear infinite;
  }

  @keyframes loading-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-label {
    font-size: 14px;
    color: var(--text-primary);
    user-select: none;
  }
</style>
