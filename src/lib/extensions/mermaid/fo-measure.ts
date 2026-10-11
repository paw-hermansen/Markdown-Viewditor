/**
 * Zoom-normalized measurement for Mermaid's `<foreignObject>` HTML labels.
 *
 * Mermaid sizes every HTML label at render time from `getBoundingClientRect()`
 * on the label `<div>` inside its `<foreignObject>` (its `addHtmlSpan` /
 * `labelHelper`) and bakes those numbers into the `foreignObject` width/height,
 * the label's centering translate, and the node box geometry. CSSOM-View says
 * those rects are local to the foreignObject's viewport and page-zoom-invariant
 * — what Blink, Gecko, and modern WebKit return. Older WebKit instead returns
 * page-viewport rects whose sizes are scaled by the page zoom factor
 * (webkit.org/show_bug.cgi?id=71819 and 261109, dup of 23963 — fixed upstream
 * only in Dec 2025, so WKWebView on macOS <= 26-era systems, e.g. macOS 12
 * Monterey, is affected).
 *
 * The failure this causes is sticky: a render that runs while the app is
 * zoomed bakes oversized label boxes with the text hugging their left/top
 * edge (and looking too small for its box), and because the finished SVG is
 * cached per content+theme — zoom is deliberately not part of rendering —
 * zooming afterwards, even back to 100%, never heals it. Renders made at
 * 100% zoom are correct even on the buggy engines.
 *
 * {@link withZoomNormalizedLabelMeasurement} fixes this at the source — and
 * must do so *exactly*, because Mermaid's label-wrap heuristic is a fragile
 * exact equality (`bbox.width === width` in `addHtmlSpan`, upstream
 * mermaid-js/mermaid#7794): any hair-off perturbation of the measured width
 * silently disables wrapping and long labels get clipped instead. Hence two
 * rules, both load-bearing:
 *
 * 1. **At 100% zoom the API is never touched.** No engine scales foreignObject
 *    rects at zoom 1 (the verified-good baseline on every platform), and a
 *    probe factor that drifts from 1 by sub-pixel measurement noise would
 *    perturb widths enough to break the wrap equality.
 * 2. **When correcting, divide by the app's exact zoom factor** (the bug
 *    scales by exactly the page zoom) — the probe only *classifies* the
 *    engine — and round the result to 1e-6 px so IEEE round-trip noise
 *    (`200 * 1.1 / 1.1 = 200.00000000000003`) cannot break the equality
 *    either. Values that were integral in the label's own coordinate space
 *    come out bit-exact again.
 *
 * The wrapper only matches foreignObject content inside Mermaid's temp
 * containers (`div[id^="dmmd-"]`, see removeMermaidTempElements in
 * renderer.ts); healthy engines, unzoomed renders, and everything outside
 * that sandbox are a plain pass-through. Keep every Mermaid render entry
 * point inside the wrapper, and never measure `<foreignObject>` content with
 * raw `getBoundingClientRect` elsewhere in app code without dividing out the
 * same factor (or using ratios of rects, like `fo-labels.ts` / `math-fit.ts`
 * do). The upgrade-contract suite pins that Mermaid still measures labels
 * this way. Regression: TEST-PLAN 15.29–15.31 (start the app zoomed).
 */

type RectFn = (this: Element) => DOMRect;

/** Width of the probe div, in CSS px. Arbitrary; only the ratio matters. */
const PROBE_WIDTH_PX = 120;

/**
 * How far the probed factor may sit from 1 (or from the zoom factor) and
 * still count as "that value". 1% comfortably separates sub-pixel probe
 * noise from real scaling: the zoom ladder's nearest non-100% steps are
 * 0.9 / 1.1 (see ZOOM_STEPS in stores/zoom.svelte.ts).
 */
const MEASURE_EPSILON = 0.01;

/**
 * Mermaid's temp render containers are `div#d<renderId>` with render ids
 * `mmd-*` (viewer, `mmd-export-*`, `mmd-print-*`), i.e. `div#dmmd-*`.
 */
const TEMP_CONTAINER_ID_PREFIX = "dmmd-";

/**
 * Run `run` (a Mermaid render) with foreignObject label measurement
 * normalized to page-zoom-invariant local rects. See module docs.
 *
 * @param zoomFactor The app's current page zoom (1 = 100%, i.e.
 * `currentZoom()` from stores/zoom.svelte.ts) — the exact value the buggy
 * engine scales by.
 */
export async function withZoomNormalizedLabelMeasurement<T>(
  run: () => Promise<T>,
  zoomFactor: number,
): Promise<T> {
  // Rule 1: at 100% zoom there is nothing to correct on any engine, and the
  // probe's sub-pixel noise must never perturb the measurement.
  if (
    zoomFactor === 1 ||
    !Number.isFinite(zoomFactor) ||
    zoomFactor <= 0 ||
    typeof document === "undefined"
  ) {
    return run();
  }
  const probed = measureForeignObjectScale();
  // Healthy engines report the probe's local width regardless of zoom.
  if (Math.abs(probed - 1) < MEASURE_EPSILON) return run();
  // Rule 2: the bug scales by exactly the page zoom — prefer the exact value
  // over the noisy probe; fall back to the probe for unknown behaviors.
  const factor =
    Math.abs(probed - zoomFactor) < MEASURE_EPSILON * zoomFactor
      ? zoomFactor
      : probed;
  const restore = installScale(factor);
  try {
    return await run();
  } finally {
    restore();
  }
}

/**
 * Like {@link withZoomNormalizedLabelMeasurement} with an explicit scale
 * factor (1 = no-op). Exported as the test seam; production code should use
 * the probing entry point so the engine decides.
 */
export async function withMeasurementScale<T>(
  factor: number,
  run: () => Promise<T>,
): Promise<T> {
  if (factor === 1 || typeof document === "undefined") return run();
  const restore = installScale(factor);
  try {
    return await run();
  } finally {
    restore();
  }
}

/**
 * How far off this engine's `getBoundingClientRect` is for foreignObject
 * content: measured width of a probe div with a known CSS width. Returns 1
 * on spec-conformant engines and at 100% page zoom (nothing to correct), the
 * page zoom factor on engines with the scaled-rect bug, and 1 when there is
 * no DOM or no layout to probe. Used only to classify the engine — the
 * correction divides by the exact zoom factor (see rule 2).
 */
export function measureForeignObjectScale(): number {
  if (typeof document === "undefined" || !document.body) return 1;
  const host = document.createElement("div");
  host.style.cssText =
    "position:absolute;left:-10000px;top:0;width:400px;height:120px;" +
    "overflow:hidden;visibility:hidden";
  host.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120">' +
    '<foreignObject x="0" y="0" width="400" height="120">' +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;` +
    `width:${PROBE_WIDTH_PX}px;height:24px;margin:0;padding:0;border:0"></div>` +
    "</foreignObject></svg>";
  document.body.appendChild(host);
  try {
    const probe = host.querySelector("foreignObject > div");
    const measured = probe?.getBoundingClientRect().width ?? 0;
    return measured > 0 ? measured / PROBE_WIDTH_PX : 1;
  } finally {
    host.remove();
  }
}

/**
 * Wrap `Element.prototype.getBoundingClientRect` so foreignObject content in
 * Mermaid's temp containers reports local rects. Nested installs chain and
 * unwind in order, so overlapping windows are safe.
 */
function installScale(factor: number): () => void {
  const proto = Element.prototype as unknown as {
    getBoundingClientRect: RectFn;
  };
  const previous = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function patchedGetBoundingClientRect(
    this: Element,
  ): DOMRect {
    const rect = previous.call(this);
    return isMermaidLabelContent(this) ? scaleRect(rect, factor) : rect;
  };
  return () => {
    proto.getBoundingClientRect = previous;
  };
}

/**
 * Whether `el` is HTML label content Mermaid measures for geometry: inside a
 * foreignObject inside one of Mermaid's temp render containers. Placed
 * diagrams in the viewer are deliberately NOT matched — app code measuring
 * them must not see normalized rects.
 */
function isMermaidLabelContent(el: Element): boolean {
  let inForeignObject = false;
  let inTempContainer = false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const name = node.localName ? node.localName.toLowerCase() : "";
    if (name === "foreignobject") inForeignObject = true;
    const id =
      typeof node.getAttribute === "function" ? node.getAttribute("id") : null;
    if (id && id.startsWith(TEMP_CONTAINER_ID_PREFIX)) inTempContainer = true;
    if (inForeignObject && inTempContainer) return true;
  }
  return false;
}

function scaleRect(rect: DOMRect, factor: number): DOMRect {
  const x = snap(rect.x / factor);
  const y = snap(rect.y / factor);
  const width = snap(rect.width / factor);
  const height = snap(rect.height / factor);
  if (typeof DOMRect === "function") {
    return new DOMRect(x, y, width, height);
  }
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({
      x,
      y,
      width,
      height,
      top: y,
      right: x + width,
      bottom: y + height,
      left: x,
    }),
  } as unknown as DOMRect;
}

/**
 * Round away IEEE round-trip noise (`200 * 1.1 / 1.1` is 200.00000000000003)
 * while keeping genuine fractional layout values. Mermaid's wrap heuristic
 * compares the normalized width to an integer with `===`, so this rounding is
 * what keeps wrapping working on corrected renders.
 */
function snap(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
