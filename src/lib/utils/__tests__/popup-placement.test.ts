// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  anchorPopup,
  computePopupPlacement,
  naturalBoxHeight,
  type PopupRect,
} from "../popup-placement";

// A typical app clip box: the main content area ends at the status bar,
// i.e. well before the window bottom — the case that hid menu entries.
const CLIP: PopupRect = { left: 0, right: 800, top: 0, bottom: 572 };
const TRIGGER: PopupRect = { left: 300, right: 380, top: 96, bottom: 136 };

describe("naturalBoxHeight", () => {
  function box(css: string, scrollHeight: number): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("style", css);
    // jsdom has no layout; stand in for the content extent.
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight });
    return el;
  }

  it("adds the vertical borders that border-box max-height includes", () => {
    const el = box("border-top-width: 2px; border-bottom-width: 3px", 100);
    expect(naturalBoxHeight(el)).toBe(105);
  });

  it("returns the scroll height for a borderless box", () => {
    expect(naturalBoxHeight(box("", 100))).toBe(100);
  });

  it("rounds up so fractional border metrics cannot overflow", () => {
    // WebKitGTK rounds border metrics: a 1px border measures 1.11px at some
    // zoom levels — exact-fit heights then overflow by a fraction of a pixel.
    const el = box(
      "border-top-width: 1.111119px; border-bottom-width: 1.111119px",
      76,
    );
    expect(naturalBoxHeight(el)).toBe(79);
  });
});

describe("computePopupPlacement", () => {
  it("keeps a menu that fits at its aligned position", () => {
    const p = computePopupPlacement({
      trigger: TRIGGER,
      clip: CLIP,
      popup: { width: 240, height: 220 },
      align: "right",
    });
    expect(p.left).toBe(140); // trigger.right - width
    expect(p.maxHeight).toBe(220); // not clipped
    expect(p.maxWidth).toBeUndefined();
  });

  it("caps height to the space between trigger and clip edge (not the window)", () => {
    const p = computePopupPlacement({
      trigger: TRIGGER,
      clip: CLIP,
      popup: { width: 240, height: 600 },
      align: "right",
    });
    expect(p.maxHeight).toBe(572 - 136 - 4); // clip.bottom - trigger.bottom - gap
  });

  it("up-opening popovers cap to the space above the trigger", () => {
    const p = computePopupPlacement({
      trigger: { left: 600, right: 700, top: 500, bottom: 528 },
      clip: CLIP,
      popup: { width: 220, height: 700 },
      align: "right",
      openDirection: "up",
    });
    expect(p.maxHeight).toBe(500 - 0 - 4);
  });

  it("shifts a right-aligned menu into view when there is no room to the left", () => {
    // The 300%-zoom case: a 240px menu anchored near the clip box's left edge.
    const p = computePopupPlacement({
      trigger: { left: 20, right: 100, top: 96, bottom: 136 },
      clip: CLIP,
      popup: { width: 240, height: 100 },
      align: "right",
    });
    expect(p.left).toBe(8); // clamped to the margin
  });

  it("caps the width when the clip box is narrower than the menu", () => {
    const p = computePopupPlacement({
      trigger: { left: 20, right: 100, top: 96, bottom: 136 },
      clip: { left: 0, right: 200, top: 0, bottom: 300 },
      popup: { width: 240, height: 100 },
      align: "right",
    });
    expect(p.maxWidth).toBe(200 - 16);
    expect(p.left).toBe(8);
  });

  it("honours left alignment when there is room", () => {
    const p = computePopupPlacement({
      trigger: TRIGGER,
      clip: CLIP,
      popup: { width: 240, height: 100 },
      align: "left",
    });
    expect(p.left).toBe(TRIGGER.left);
  });

  it("keeps the menu inside the clip box's right edge", () => {
    const p = computePopupPlacement({
      trigger: { left: 700, right: 780, top: 96, bottom: 136 },
      clip: CLIP,
      popup: { width: 240, height: 100 },
      align: "left",
    });
    expect(p.left).toBe(800 - 8 - 240);
    expect(p.left + 240).toBeLessThanOrEqual(800 - 8);
  });

  it("never returns negative usable height", () => {
    const p = computePopupPlacement({
      trigger: { left: 0, right: 80, top: 590, bottom: 600 },
      clip: CLIP,
      popup: { width: 240, height: 100 },
    });
    expect(p.maxHeight).toBe(0);
  });
});

describe("anchorPopup", () => {
  // Status bar geometry: a right-packed row, so the trigger's right edge is
  // fixed and its left edge moves when the label changes width.
  const WRAPPER: PopupRect = { left: 320, right: 400, top: 740, bottom: 780 };
  const placeRight = (trigger: PopupRect) =>
    computePopupPlacement({
      trigger,
      clip: CLIP,
      popup: { width: 220, height: 100 },
      align: "right",
    });

  it("offsets a right-aligned popup from the wrapper's right edge", () => {
    const anchor = anchorPopup(WRAPPER, placeRight(WRAPPER), 220, "right");
    expect(anchor.left).toBe("auto");
    expect(anchor.right).toBe("0px"); // popup's right edge == trigger's right edge
  });

  it("keeps the anchor when the trigger's label narrows (preset switch relabel)", () => {
    // "Advanced" -> "Basic": the left edge moves right, the aligned right
    // edge stays put. The old left-based offset baked the trigger's width
    // into a constant and slid the popover by exactly the width delta.
    const wide = anchorPopup(WRAPPER, placeRight(WRAPPER), 220, "right");
    const narrow = anchorPopup(
      WRAPPER,
      placeRight({ left: 345, right: 400, top: 740, bottom: 780 }),
      220,
      "right",
    );
    expect(narrow.right).toBe(wide.right);
  });

  it("offsets a left-aligned popup from the wrapper's left edge", () => {
    const placement = computePopupPlacement({
      trigger: WRAPPER,
      clip: CLIP,
      popup: { width: 220, height: 100 },
      align: "left",
    });
    const anchor = anchorPopup(WRAPPER, placement, 220, "left");
    expect(anchor.right).toBe("auto");
    expect(anchor.left).toBe("0px");
  });

  it("keeps clip clamping in the anchor", () => {
    // No room to the left: the placement is clamped to the clip margin, and
    // the anchor must remember that shift, not the unclamped alignment.
    const trigger: PopupRect = { left: 20, right: 100, top: 96, bottom: 136 };
    const placement = computePopupPlacement({
      trigger,
      clip: CLIP,
      popup: { width: 240, height: 100 },
      align: "right",
    });
    expect(placement.left).toBe(8); // clamped
    expect(anchorPopup(trigger, placement, 240, "right").right).toBe("-148px");
  });
});
