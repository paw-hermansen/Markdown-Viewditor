// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPopupController, listNav, exclusiveGroup } from "../popup";

function makeEl(id: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return el;
}

describe("createPopupController", () => {
  let popup: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    popup = makeEl("popup");
    anchor = makeEl("anchor");
  });

  it("calls onDismiss('outside') on a document click outside", async () => {
    const onDismiss = vi.fn();
    const ctl = createPopupController(
      () => popup,
      () => anchor,
      {
        onDismiss,
      },
    );
    ctl.open();
    await new Promise((r) => requestAnimationFrame(r));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledWith("outside");
  });

  it("does not dismiss when clicking inside the popup", async () => {
    const onDismiss = vi.fn();
    const ctl = createPopupController(
      () => popup,
      () => anchor,
      {
        onDismiss,
      },
    );
    ctl.open();
    popup.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss('escape') on Escape", async () => {
    const onDismiss = vi.fn();
    const ctl = createPopupController(
      () => popup,
      () => anchor,
      {
        onDismiss,
      },
    );
    ctl.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  it("removes listeners on close", async () => {
    const onDismiss = vi.fn();
    const ctl = createPopupController(
      () => popup,
      () => anchor,
      {
        onDismiss,
      },
    );
    ctl.open();
    ctl.close();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("listNav", () => {
  it("handles ArrowDown/Up", () => {
    const a = makeEl("a");
    const b = makeEl("b");
    const items = [a, b];
    expect(
      listNav(new KeyboardEvent("keydown", { key: "ArrowDown" }), items, 0),
    ).toBe(true);
    expect(
      listNav(new KeyboardEvent("keydown", { key: "ArrowUp" }), items, 1),
    ).toBe(true);
    expect(
      listNav(new KeyboardEvent("keydown", { key: "Home" }), items, 1),
    ).toBe(true);
    expect(
      listNav(new KeyboardEvent("keydown", { key: "End" }), items, 0),
    ).toBe(true);
    expect(listNav(new KeyboardEvent("keydown", { key: "x" }), items, 0)).toBe(
      false,
    );
  });
});

describe("exclusiveGroup", () => {
  it("toggles and closes", () => {
    const g = exclusiveGroup(["x", "y"]);
    g.toggle("x");
    expect(g.openId).toBe("x");
    g.toggle("y");
    expect(g.openId).toBe("y");
    g.close();
    expect(g.openId).toBeNull();
  });
});
