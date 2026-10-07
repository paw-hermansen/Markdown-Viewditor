/**
 * Popup placement inside a clipping box.
 *
 * Popups anchored to a trigger (dropdown menus, status bar popovers) cannot
 * use fixed CSS offsets: under app zoom the CSS viewport shrinks and the
 * popup's clipping ancestor (`.content { overflow: hidden }` in the app
 * layout — NOT the window) ends well before the window edge. Edge-anchored
 * CSS (`right: 0`) then parks most of the popup outside the clip box, and a
 * guessed `max-height: calc(100vh - Npx)` cuts entries at the clip edge.
 * Measure instead: clamp the placement into the clip box so every entry
 * stays reachable (scrolling when needed).
 */

export interface PopupRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PopupPlacement {
  /** Viewport x of the popup's left edge. */
  left: number;
  /** Max content height in the opening direction (scroll beyond it). */
  maxHeight: number;
  /** Set only when the popup is wider than the clip box allows. */
  maxWidth?: number;
}

export interface PopupPlacementInput {
  trigger: PopupRect;
  /** The box the popup is clipped by (see {@link findClipRect}). */
  clip: PopupRect;
  popup: { width: number; height: number };
  /** Which edge of the trigger the popup aligns to. Default "right". */
  align?: "left" | "right";
  /** Which way the popup opens from the trigger. Default "down". */
  openDirection?: "down" | "up";
  /** Clearance between trigger and popup. Default 4. */
  gap?: number;
  /** Minimum distance from the clip box edges. Default 8. */
  margin?: number;
}

/**
 * Pure placement math: keep `popup` inside `clip`, aligned to `trigger`.
 * `popup.height` should be the full content height (e.g. `scrollHeight`),
 * not a CSS-clamped height.
 */
export function computePopupPlacement(
  input: PopupPlacementInput,
): PopupPlacement {
  const {
    trigger,
    clip,
    popup,
    align = "right",
    openDirection = "down",
    gap = 4,
    margin = 8,
  } = input;

  // Vertical: never taller than the space between the trigger edge and the
  // clip edge in the opening direction.
  const space =
    openDirection === "up"
      ? trigger.top - clip.top - gap
      : clip.bottom - trigger.bottom - gap;
  const maxHeight = Math.max(0, Math.min(popup.height, space));

  // Horizontal: prefer the aligned position, then stay inside the clip box.
  const clipWidth = clip.right - clip.left;
  const marginX = Math.min(margin, clipWidth / 2);
  const allowedWidth = clipWidth - marginX * 2;
  const cappedWidth = Math.min(popup.width, allowedWidth);
  const desired =
    align === "right" ? trigger.right - cappedWidth : trigger.left;
  const minLeft = clip.left + marginX;
  const maxLeft = clip.right - marginX - cappedWidth;
  const left =
    maxLeft < minLeft ? minLeft : Math.min(Math.max(desired, minLeft), maxLeft);

  const placement: PopupPlacement = { left, maxHeight };
  if (cappedWidth < popup.width) {
    placement.maxWidth = allowedWidth;
  }
  return placement;
}

/**
 * The rect the popup will actually be clipped by: the nearest ancestor with
 * non-visible overflow, else the viewport. (In the app layout dropdowns are
 * clipped by the main content area, whose bottom edge sits at the status
 * bar — the window bottom is not the limit to respect.)
 */
export function findClipRect(el: HTMLElement): PopupRect {
  for (
    let ancestor = el.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    const style = getComputedStyle(ancestor);
    if (
      /(hidden|clip|auto|scroll)/.test(
        style.overflow + style.overflowX + style.overflowY,
      )
    ) {
      return ancestor.getBoundingClientRect();
    }
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}
