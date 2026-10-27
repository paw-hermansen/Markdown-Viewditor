/**
 * The Viewer's render scheduler: one state machine for "render this
 * content soon, newest wins, and show the busy overlay only for major
 * renders".
 *
 * Extracted from Viewer.svelte (which keeps the DOM glue and the render
 * task bodies) so the debounce/supersede/busy-ownership matrix is unit
 * testable without mounting a component — see
 * `__tests__/render-scheduler.test.ts`. The contracts below are pinned by
 * Viewer.test.ts and AGENTS.md "Render busy overlay":
 *
 *   - The overlay shows for **major** renders only (first render of a
 *     document, theme change, forceRender/Reload). Routine typing
 *     re-renders never show it.
 *   - Major renders raise the overlay **synchronously** when they start
 *     (`delay: 0` runs inline, before `requestRender` returns): the early
 *     render phases are synchronous, so a render that finishes quickly
 *     never paints the overlay at all.
 *   - The overlay drops once the new DOM is on screen — the task calls
 *     `clearBusy()` after its `flush()` — with `finish()` as a fallback.
 *   - Per-request busy ownership: a request only clears the overlay it
 *     raised itself, so a stale render settling late can never take down a
 *     newer request's overlay.
 */
import { tick } from "svelte";

export interface RenderRequest {
  generation: number;
  promise: Promise<void>;
  superseded: Promise<void>;
  cancel: () => void;
  supersede: () => void;
}

export interface RenderScheduler {
  /**
   * Schedule a render. `task` receives the request's generation (check it
   * with `isCurrent` after every await — stale results must not commit)
   * and a `clearBusy` to drop the overlay once the DOM is on screen.
   */
  requestRender(
    task: (generation: number, clearBusy: () => void) => Promise<void>,
    delay: number,
    major?: boolean,
  ): RenderRequest;
  /** Wait for the newest request and the DOM update caused by it. */
  waitForRender(): Promise<void>;
  /** Whether `generation` still identifies the newest request. */
  isCurrent(generation: number): boolean;
  /** The busy-overlay flag (reactive). */
  readonly busy: boolean;
}

/**
 * Create a scheduler. `flush` is the "let the DOM update land" step
 * (Svelte's `tick` by default); injectable so tests run without a Svelte
 * runtime.
 */
export function createRenderScheduler(
  opts: { flush?: () => Promise<void> } = {},
): RenderScheduler {
  const flush = opts.flush ?? tick;

  let busy = $state(false);
  let renderGeneration = 0;
  let currentRender: RenderRequest | null = null;

  function requestRender(
    task: (generation: number, clearBusy: () => void) => Promise<void>,
    delay: number,
    major = false,
  ): RenderRequest {
    currentRender?.supersede();

    const generation = ++renderGeneration;
    let resolveRender!: () => void;
    let resolveSuperseded!: () => void;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    let settled = false;
    let wasSuperseded = false;
    let busyShown = false;

    const promise = new Promise<void>((resolve) => {
      resolveRender = resolve;
    });
    const superseded = new Promise<void>((resolve) => {
      resolveSuperseded = resolve;
    });

    // Per-request busy bookkeeping: a request only clears the overlay it
    // raised itself, so a stale render settling late can never take down a
    // newer request's overlay.
    const clearBusy = () => {
      if (busyShown) {
        busyShown = false;
        busy = false;
      }
    };

    const finish = () => {
      if (!settled) {
        settled = true;
        clearBusy();
        resolveRender();
      }
    };

    const supersede = () => {
      if (!wasSuperseded) {
        wasSuperseded = true;
        resolveSuperseded();
      }
      clearBusy();
      if (!started) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        finish();
      }
    };

    const request: RenderRequest = {
      generation,
      promise,
      superseded,
      cancel: supersede,
      supersede,
    };

    const run = () => {
      if (started || wasSuperseded) return;
      started = true;
      timeout = undefined;
      if (major) {
        busyShown = true;
        busy = true;
      }
      void task(generation, clearBusy).then(finish, finish);
    };

    currentRender = request;
    if (delay > 0) {
      timeout = setTimeout(run, delay);
    } else {
      run();
    }

    return request;
  }

  // Wait for the newest render request and the DOM update caused by it. If a
  // newer request supersedes the one being awaited, follow that request
  // instead of waiting for stale async work to finish.
  async function waitForRender(): Promise<void> {
    await flush();
    while (currentRender) {
      const request = currentRender;
      await Promise.race([request.promise, request.superseded]);
      await flush();
      if (request === currentRender) return;
    }
  }

  function isCurrent(generation: number): boolean {
    return generation === renderGeneration;
  }

  return {
    requestRender,
    waitForRender,
    isCurrent,
    get busy() {
      return busy;
    },
  };
}
