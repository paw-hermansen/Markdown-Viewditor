/**
 * Popup scaffold (PR-16): one placement + settle + dismissal contract for the
 * anchored popups, on top of the pure placement math in `popup-placement.ts`.
 */

import {
  anchorPopup,
  computePopupPlacement,
  findClipRect,
  naturalBoxHeight,
  type PopupRect,
} from "./popup-placement";

export type DismissReason =
  "outside" | "escape" | "scroll" | "resize" | "hover-out";

export interface PopupControllerConfig {
  anchor?: "trigger" | "cursor";
  clip?: "ancestor" | "viewport";
  align?: "left" | "right";
  openDirection?: "down" | "up" | "flip";
  gap?: number;
  capHeight?: boolean;
  onDismiss?: (reason: DismissReason) => void;
  focus?: { initial?: () => void; restore?: () => void };
}

export interface PopupController {
  /** Settle one frame, measure and write the inline styles. */
  place: () => void;
  /** Install dismissal listeners (bubble-phase outside click, Escape). */
  open: () => void;
  /** Remove listeners and clean up. */
  close: () => void;
  destroy: () => void;
}

function clampFlip(
  trigger: PopupRect,
  clip: PopupRect,
  popupHeight: number,
  gap: number,
): "down" | "up" {
  const spaceDown = clip.bottom - trigger.bottom - gap;
  const spaceUp = trigger.top - clip.top - gap;
  return spaceDown >= popupHeight || spaceDown >= spaceUp ? "down" : "up";
}

/**
 * Controller factory: owns rAF settle → measure → place, resize re-place,
 * bubble-phase outside-click, Escape, and listener cleanup.
 *
 * Style application is one convention: direct `style.*` writes (the StatusBar
 * tests read `pop.style.*`), so the surface keeps its `element.style` as the
 * source of truth.
 */
export function createPopupController(
  getPopup: () => HTMLElement | null,
  getAnchor: () => HTMLElement | null,
  config: PopupControllerConfig = {},
): PopupController {
  const {
    anchor = "trigger",
    clip = "ancestor",
    align = "right",
    openDirection = "down",
    gap = 4,
    capHeight = true,
    onDismiss,
    focus,
  } = config;

  let raf = 0;
  let attached = false;

  function place(): void {
    const popup = getPopup();
    const anchorEl = getAnchor();
    if (!popup) return;

    const clipRect =
      clip === "viewport"
        ? {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
          }
        : findClipRect(popup);

    const triggerRect: PopupRect =
      anchor === "cursor" && anchorEl
        ? anchorEl.getBoundingClientRect()
        : (anchorEl?.getBoundingClientRect() ?? {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          });

    const height = capHeight
      ? Math.min(naturalBoxHeight(popup), 400)
      : naturalBoxHeight(popup);

    const direction =
      openDirection === "flip"
        ? clampFlip(triggerRect, clipRect, height, gap)
        : openDirection;

    const placement = computePopupPlacement({
      trigger: triggerRect,
      clip: clipRect,
      popup: {
        width: popup.getBoundingClientRect().width,
        height,
      },
      align,
      openDirection: direction,
      gap,
    });

    const wrapper = anchorEl?.getBoundingClientRect() ?? triggerRect;
    const anch = anchorPopup(
      wrapper,
      placement,
      popup.getBoundingClientRect().width,
      align,
    );

    popup.style.left = anch.left;
    popup.style.right = anch.right;
    if (capHeight) {
      popup.style.maxHeight = `${placement.maxHeight}px`;
    }
    if (placement.maxWidth !== undefined) {
      popup.style.maxWidth = `${placement.maxWidth}px`;
    }
  }

  function onDocClick(e: MouseEvent): void {
    const popup = getPopup();
    const anchorEl = getAnchor();
    const target = e.target as Node;
    if (popup?.contains(target)) return;
    if (anchorEl?.contains(target)) return;
    onDismiss?.("outside");
  }

  function onDocKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      onDismiss?.("escape");
    }
  }

  function onScroll(): void {
    onDismiss?.("scroll");
  }

  function onResize(): void {
    place();
    onDismiss?.("resize");
  }

  function open(): void {
    if (attached) return;
    attached = true;
    // Bubble-phase so the StatusBar's stopPropagation dance still runs first.
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKeydown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(place);
  }

  function close(): void {
    if (!attached) return;
    attached = false;
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onDocKeydown);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(raf);
  }

  function destroy(): void {
    close();
    focus?.restore?.();
  }

  return { place, open, close, destroy };
}

/**
 * Shared keyboard navigation for list-style popups (DropdownButton,
 * SelectField): Arrow/Home/End/Enter/Space.
 */
export function listNav(
  e: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
): boolean {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
      return true;
    case "ArrowUp":
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
      return true;
    case "Home":
      e.preventDefault();
      items[0]?.focus();
      return true;
    case "End":
      e.preventDefault();
      items[items.length - 1]?.focus();
      return true;
    case "Enter":
    case " ":
      e.preventDefault();
      if (currentIndex >= 0) items[currentIndex]?.click();
      return true;
  }
  return false;
}

/**
 * Mutual-exclusion toggle group (StatusBar's popover trio): opening one
 * closes the others.
 */
export function exclusiveGroup(ids: string[]): {
  openId: string | null;
  toggle: (id: string) => void;
  close: () => void;
} {
  const known = new Set(ids);
  let openId: string | null = null;
  return {
    get openId() {
      return openId;
    },
    toggle(id: string) {
      if (!known.has(id)) return;
      openId = openId === id ? null : id;
    },
    close() {
      openId = null;
    },
  };
}
