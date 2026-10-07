import { describe, expect, it } from "vitest";
import { computePopupPlacement, type PopupRect } from "../popup-placement";

// A typical app clip box: the main content area ends at the status bar,
// i.e. well before the window bottom — the case that hid menu entries.
const CLIP: PopupRect = { left: 0, right: 800, top: 0, bottom: 572 };
const TRIGGER: PopupRect = { left: 300, right: 380, top: 96, bottom: 136 };

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
