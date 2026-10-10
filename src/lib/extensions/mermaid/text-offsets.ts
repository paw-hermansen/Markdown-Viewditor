/**
 * WebKit zoom workaround: rewrite em-based `dy`/`dx` text offsets on SVG
 * `<text>`/`<tspan>` elements to absolute user units.
 *
 * Mermaid positions label text with em-based offsets (e.g. sequence diagram
 * message labels use `dy="1em"`). Under WebKit page zoom — which is the CSS
 * `zoom` machinery (see AGENTS.md "App Zoom") — an em value resolves against
 * the *zoom-divided* computed font size (the same value
 * `getComputedStyle().fontSize` reports), while the diagram geometry scales
 * normally. The label therefore slides up as zoom grows: at 200% a sequence
 * message label sits closer to the *previous* message's line than to its own
 * (measured: gap to own line 11.4 -> 20.3 CSS px, gap to line above
 * 22.8 -> 13.9). Absolute user-unit offsets skip that resolution and stay
 * put at every zoom level (verified: gaps constant within 0.4px at
 * 100-200%). Blink resolves em correctly and is unaffected — the rewrite is
 * a no-op in effect there.
 *
 * The em -> user-unit factor is the element's font size at zoom 1. A
 * calibration probe (a 100px inline font-size) tells us how the engine
 * reports computed font sizes right now: WebKit under zoom reports
 * declared/z, Blink reports declared, so `declared / probe` yields the
 * zoom-1 scale without sniffing the user agent. At zoom 1 the probe reads
 * 100 and the rewrite equals what em already meant — the on-screen diagram
 * is unchanged.
 *
 * Second rewrite in the same pass: translate-based text placement
 * (`transform="translate(X, Y) rotate(0)"` with x/y at 0, xychart's axis
 * labels) drifts catastrophically under WebKit page zoom — at 300% the
 * labels collapse toward the top of the chart and disappear (measured
 * -278 user units). Folding the translate into plain x/y attributes (and
 * keeping a non-zero rotation as `rotate(theta, X, Y)` about the anchor)
 * is geometrically identical and zoom-proof (residual < 9 at 300%).
 *
 * The conversion is a one-time rewrite to zoom-independent numbers, so it
 * can run at cache-fill time regardless of the zoom level in effect.
 */

const OFFSET_ATTRS = ["dy", "dx"] as const;

/** `translate(X, Y)` optionally followed by `rotate(theta)`. */
const TRANSLATE_ROTATE =
  /^translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)(?:\s+rotate\(\s*(-?[\d.]+)\s*\))?$/;

/**
 * Rewrite fragile SVG text positioning to zoom-proof forms: em-based
 * `dy`/`dx` on `<text>`/`<tspan>` become absolute user units, and
 * translate-based placement folds into `x`/`y`. Returns `svg` unchanged
 * when there is no DOM (node) or nothing to rewrite.
 */
export function normalizeSvgTextOffsets(svg: string): string {
  // Test environments may expose a minimal `document` mock without
  // createElement (mirrors removeMermaidTempElements' defensive check).
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return svg;
  }

  // Detached elements have no computed styles; the host must be attached.
  // Only `font-size` is read, so the host needs no viewer classes — the
  // elements that carry em offsets specify their own font-size (Mermaid's
  // label rules and inline styles travel inside the SVG markup).
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
  host.innerHTML = svg;

  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;font-size:100px;line-height:1";
  const probeHost = document.createElement("div");
  probeHost.style.cssText =
    "position:absolute;left:-9999px;top:0;visibility:hidden";
  probeHost.appendChild(probe);
  document.body.appendChild(probeHost);
  document.body.appendChild(host);

  try {
    const probeSize = parseFloat(getComputedStyle(probe).fontSize);
    // Engines that already resolve em against the true font size report the
    // declared probe size (factor 1); WebKit under zoom reports declared/z.
    const factor =
      Number.isFinite(probeSize) && Math.abs(probeSize - 100) > 0.01
        ? 100 / probeSize
        : 1;

    let changed = false;
    for (const el of host.querySelectorAll("text, tspan")) {
      for (const attr of OFFSET_ATTRS) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const trimmed = value.trim();
        if (!trimmed.endsWith("em")) continue;
        const em = parseFloat(trimmed);
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (!Number.isFinite(em) || !Number.isFinite(fs) || fs <= 0) continue;
        el.setAttribute(attr, (em * fs * factor).toFixed(3));
        changed = true;
      }

      // Fold translate-based placement into x/y (see module doc). Only when
      // the element's own x/y are 0/absent, so the fold is position-neutral.
      const transform = el.getAttribute("transform");
      if (transform) {
        const m = TRANSLATE_ROTATE.exec(transform.trim());
        const x = el.getAttribute("x") ?? "0";
        const y = el.getAttribute("y") ?? "0";
        if (m && x === "0" && y === "0") {
          const [, tx, ty, rot] = m;
          el.setAttribute("x", tx);
          el.setAttribute("y", ty);
          if (rot && parseFloat(rot) !== 0) {
            // Rotation stays, but about the anchor point.
            el.setAttribute("transform", `rotate(${rot}, ${tx}, ${ty})`);
          } else {
            el.removeAttribute("transform");
          }
          changed = true;
        }
      }
    }

    return changed ? host.innerHTML : svg;
  } finally {
    probeHost.remove();
    host.remove();
  }
}
