/**
 * Unit tests for the render scheduler — the debounce/supersede/busy matrix
 * that Viewer.test.ts exercises through the mounted component. These run
 * without a DOM; the component suite stays as the integration net for the
 * DOM glue (scroll restore, cache-bust, {#key} recreate).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderScheduler } from "$lib/stores/render-scheduler.svelte";

/** A task that never settles until `settle()` is called. */
function deferredTask() {
  let settle!: () => void;
  const task = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  return { task, settle: () => settle() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRenderScheduler", () => {
  it("debounces routine renders until the delay elapses", () => {
    const s = createRenderScheduler();
    const { task } = deferredTask();
    s.requestRender(task, 150);

    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("starts a zero-delay render synchronously and raises its overlay before returning", () => {
    const s = createRenderScheduler();
    const { task } = deferredTask();
    const request = s.requestRender(task, 0, true);

    expect(task).toHaveBeenCalledTimes(1);
    expect(s.busy).toBe(true);
    expect(request.generation).toBe(1);
  });

  it("never raises the busy overlay for non-major renders", () => {
    const s = createRenderScheduler();
    const immediate = deferredTask();
    s.requestRender(immediate.task, 0);
    expect(s.busy).toBe(false);

    const debounced = deferredTask();
    s.requestRender(debounced.task, 150);
    vi.advanceTimersByTime(150);
    expect(debounced.task).toHaveBeenCalledTimes(1);
    expect(s.busy).toBe(false);
  });

  it("clearBusy drops the overlay the request raised (and is idempotent)", async () => {
    const s = createRenderScheduler();
    let clearBusy!: () => void;
    s.requestRender(
      async (_generation, clear) => {
        clearBusy = clear;
        await new Promise<void>(() => {});
      },
      0,
      true,
    );
    expect(s.busy).toBe(true);

    clearBusy();
    expect(s.busy).toBe(false);
    clearBusy();
    expect(s.busy).toBe(false);
  });

  it("drops a superseded request's overlay; a stale settle cannot take down its successor's", async () => {
    const s = createRenderScheduler();
    const a = deferredTask();
    const aRequest = s.requestRender(a.task, 0, true);
    expect(s.busy).toBe(true);

    // The newer major render supersedes A: A's overlay drops, then B raises
    // its own.
    const b = deferredTask();
    const bRequest = s.requestRender(b.task, 0, true);
    expect(s.busy).toBe(true);

    // A settling late must not clear B's overlay.
    a.settle();
    await aRequest.promise;
    expect(s.busy).toBe(true);

    b.settle();
    await bRequest.promise;
    expect(s.busy).toBe(false);
  });

  it("cancels an unstarted debounced request when superseded", async () => {
    const s = createRenderScheduler();
    const a = deferredTask();
    const aRequest = s.requestRender(a.task, 150);
    const b = deferredTask();
    s.requestRender(b.task, 150);

    // A's timer is gone and its promise settled without the task running.
    await aRequest.promise;
    expect(a.task).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(a.task).not.toHaveBeenCalled();
    expect(b.task).toHaveBeenCalledTimes(1);
  });

  it("waitForRender follows the newest request across a supersede", async () => {
    const s = createRenderScheduler();
    const a = deferredTask();
    s.requestRender(a.task, 0, true);

    const waiting = s.waitForRender();

    const b = deferredTask();
    const bRequest = s.requestRender(b.task, 0, true);
    b.settle();
    await bRequest.promise;

    // Resolves via B even though A's task never settles.
    await waiting;
    a.settle();
    expect(s.busy).toBe(false);
  });

  it("isCurrent invalidates superseded generations", () => {
    const s = createRenderScheduler();
    const a = deferredTask();
    const aRequest = s.requestRender(a.task, 150);
    expect(s.isCurrent(aRequest.generation)).toBe(true);

    const b = deferredTask();
    const bRequest = s.requestRender(b.task, 150);
    expect(s.isCurrent(aRequest.generation)).toBe(false);
    expect(s.isCurrent(bRequest.generation)).toBe(true);
  });

  it("finish() clears the overlay as a fallback when the task never does", async () => {
    const s = createRenderScheduler();
    const { task, settle } = deferredTask();
    const request = s.requestRender(task, 0, true);
    expect(s.busy).toBe(true);

    settle();
    await request.promise;
    expect(s.busy).toBe(false);
  });
});
