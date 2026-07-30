import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { toastState, toast, dismiss, dismissAll } from "../toast.svelte";

describe("toast store", () => {
  beforeEach(() => {
    dismissAll();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("toast.error adds an error item", () => {
    toast.error("boom", "detail");
    expect(toastState.items).toHaveLength(1);
    expect(toastState.items[0].kind).toBe("error");
    expect(toastState.items[0].message).toBe("boom");
    expect(toastState.items[0].detail).toBe("detail");
  });

  it("toast.info adds an info item", () => {
    toast.info("hello");
    expect(toastState.items[0].kind).toBe("info");
  });

  it("toast.warning adds a warning item", () => {
    toast.warning("careful");
    expect(toastState.items[0].kind).toBe("warning");
  });

  it("dismiss removes the item by id", () => {
    toast.error("a");
    toast.error("b");
    expect(toastState.items).toHaveLength(2);
    const id = toastState.items[0].id;
    dismiss(id);
    expect(toastState.items).toHaveLength(1);
    expect(toastState.items[0].message).toBe("b");
  });

  it("items auto-dismiss after their delay", () => {
    toast.error("temp", undefined, 1000);
    expect(toastState.items).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(toastState.items).toHaveLength(0);
  });

  it("dismissAll clears all items", () => {
    toast.error("a");
    toast.error("b");
    toast.error("c");
    dismissAll();
    expect(toastState.items).toHaveLength(0);
  });

  it("each toast gets a unique increasing id", () => {
    toast.info("x");
    toast.info("y");
    expect(toastState.items[1].id).toBeGreaterThan(toastState.items[0].id);
  });
});
