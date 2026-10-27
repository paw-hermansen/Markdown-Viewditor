/**
 * Scroll-restore helpers for the Viewer's reload path (forceRender): a
 * data-line-anchored capture/restore pair that survives layout shifts from
 * recreated images, plus the image-settle wait the second restore needs.
 * Pure DOM measurement — no component state.
 */

export interface ScrollAnchor {
  line: string;
  offset: number;
}

/**
 * Capture the topmost visible data-line element and its fractional offset
 * from the container's top edge. Restoring via this anchor avoids the ~1px
 * per-reload drift caused by integer scrollTop round-trips.
 */
export function captureScrollAnchor(
  container: HTMLElement | undefined,
  content: HTMLElement | undefined,
): ScrollAnchor | null {
  if (!container || !content) return null;
  const containerTop = container.getBoundingClientRect().top;
  for (const el of content.querySelectorAll("[data-line]")) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom > containerTop) {
      const line = el.getAttribute("data-line");
      if (line) {
        return { line, offset: rect.top - containerTop };
      }
    }
  }
  return null;
}

/**
 * Setting scrollTop snaps the scroll position to whole device pixels
 * (WebKit floors in device space). At a fractional devicePixelRatio (e.g.
 * 0.9 zoom) every assignment — even re-assigning the current value — can
 * shift the position by up to 1/dpr CSS pixels, and the integer getter
 * then reports a new value, so re-applying it on the next reload ratchets
 * the view ~1px per reload. Skipping sub-pixel adjustments avoids touching
 * scrollTop at all when the anchor is already where it was captured.
 */
const SCROLL_RESTORE_EPSILON_PX = 0.5;

export function restoreScrollPosition(
  container: HTMLElement | undefined,
  content: HTMLElement | undefined,
  anchor: ScrollAnchor | null,
  fallbackScrollTop: number,
): void {
  if (!container) return;
  if (anchor) {
    const newEl = content?.querySelector(`[data-line="${anchor.line}"]`);
    if (newEl) {
      const containerTop = container.getBoundingClientRect().top;
      const newOffset = newEl.getBoundingClientRect().top - containerTop;
      const adjustment = newOffset - anchor.offset;
      if (Math.abs(adjustment) >= SCROLL_RESTORE_EPSILON_PX) {
        container.scrollTop = container.scrollTop + adjustment;
      }
      return;
    }
  }
  if (
    Math.abs(container.scrollTop - fallbackScrollTop) >=
    SCROLL_RESTORE_EPSILON_PX
  ) {
    container.scrollTop = fallbackScrollTop;
  }
}

const IMAGE_SETTLE_TIMEOUT_MS = 2000;

/**
 * Resolve once all current images have finished loading (or failed), so
 * the scroll position can be restored against the final layout. Capped by
 * a timeout so slow external images don't delay the restore indefinitely.
 */
export function waitForImages(content: HTMLElement | undefined): Promise<void> {
  const imgs = content ? Array.from(content.querySelectorAll("img")) : [];
  const pending = imgs
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    );
  if (pending.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) =>
      setTimeout(resolve, IMAGE_SETTLE_TIMEOUT_MS),
    ),
  ]);
}
