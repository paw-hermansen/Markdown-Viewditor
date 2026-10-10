/**
 * Clamp negative `stroke-width` values in generated SVG to a visible
 * minimum.
 *
 * Mermaid sizes mindmap/timeline/kanban edges with a per-depth ramp
 * (`.edge-depth-N { stroke-width: … }`, `17 - 3 * i` for the default look)
 * that goes negative from `edge-depth-5` on (`-1`, `-4`, …). Only mindmap's
 * "neo" look floors the ramp at 2. Worse, mindmap levels are indent
 * *widths* in characters (the parser passes the indent token length as the
 * node level), so `edge-depth-N` (`N = level + 1`) jumps with the
 * indentation step: a two-level mindmap indented with 4 spaces emits
 * `edge-depth-5` = `stroke-width: -1` on its second-level edges.
 *
 * A negative stroke width is invalid CSS/SVG. Engines that drop the
 * declaration fall back to the generic `#id .edge { stroke-width: 3 }` rule
 * and the connector draws (Blink, current WebKitGTK); Monterey's older
 * WebKit keeps the declaration and paints the stroke with a non-positive
 * width, so those connectors are missing on screen and in PDFs. Mermaid
 * round-trips its theme CSS through the CSSOM (`new CSSStyleSheet()` →
 * `cssRules[].cssText`), so each engine's parser decision is already baked
 * into the generated `<style>` before we see it.
 *
 * Clamping to {@link CLAMPED_STROKE_WIDTH} makes every engine compute the
 * same visible width. Run at cache-fill time and in the export/print
 * render paths (renderer.ts), next to `normalizeSvgTextOffsets`. Deep
 * edges keep their taper intent — thin, but visible — at 2px, the smallest
 * width the ramp itself uses (and mindmap "neo" look's floor).
 *
 * Regression: `__tests__/svg-css.test.ts`; the upgrade-contract suite pins
 * that Mermaid still emits the negative values (if that stops, this pass
 * may be removable). See AGENTS.md, "Mermaid Edge Stroke Width".
 */

/** Deep edges taper to this width once clamped (SVG user units == px). */
const CLAMPED_STROKE_WIDTH = "2px";

/** A CSS length literal, e.g. `-1`, `-0.5`, `12.5`. */
const LENGTH = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
/** Optional unit; bare numbers are user units in SVG CSS. */
const UNIT = String.raw`(?:px|em|rem|ex|ch|%)?`;

/**
 * `stroke-width: <value>` declarations — in `<style>` blocks and inline
 * `style=""` attributes alike. The leading `(^|[^-\w])` keeps lookalikes
 * such as `x-stroke-width:` out (and avoids lookbehind, which older WebKit
 * lacks).
 */
const STROKE_WIDTH_DECL = new RegExp(
  String.raw`(^|[^-\w])stroke-width:(\s*)(${LENGTH})(${UNIT})(?=[;}\s]|$)`,
  "g",
);

/** `stroke-width="<value>"` presentation attributes. */
const STROKE_WIDTH_ATTR = new RegExp(
  String.raw`(^|[^-\w])stroke-width=(["'])(${LENGTH})(${UNIT})\2`,
  "g",
);

/**
 * Rewrite every negative `stroke-width` in `svg` to
 * {@link CLAMPED_STROKE_WIDTH}. Non-negative values (and anything that is
 * not a literal length, e.g. `calc()`) are returned byte-identical, so the
 * pass is a no-op on diagrams without the degenerate ramp and idempotent.
 */
export function clampNegativeStrokeWidths(svg: string): string {
  const clamped = svg
    .replace(
      STROKE_WIDTH_DECL,
      (match: string, prefix: string, spacing: string, value: string) =>
        parseFloat(value) < 0
          ? `${prefix}stroke-width:${spacing}${CLAMPED_STROKE_WIDTH}`
          : match,
    )
    .replace(
      STROKE_WIDTH_ATTR,
      (match: string, prefix: string, quote: string, value: string) =>
        parseFloat(value) < 0
          ? `${prefix}stroke-width=${quote}${CLAMPED_STROKE_WIDTH}${quote}`
          : match,
    );
  return clamped;
}
