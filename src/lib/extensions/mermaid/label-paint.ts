/**
 * Pin the paint of KaTeX glyph paths inside Mermaid's `<foreignObject>`
 * labels to `fill: currentColor; stroke: none`.
 *
 * Why this pass exists — Mermaid's theme CSS styles nodes and their label
 * contents with id-scoped rules (`#mmd-N …`), which outrank everything
 * KaTeX's stylesheet says, and two of them reach the `<path>` elements of
 * KaTeX's SVG glyphs (the `\sqrt` radical + vinculum, wide accents,
 * extensible arrows):
 *
 * - `#mmd-N .node .katex path { fill: #000; stroke: #000; stroke-width: 1px }`
 *   — flowchart styles, hard-coded black (the agentflow copy of the same
 *   rule uses `${nodeTextColor || textColor}` instead; the hard-coding is an
 *   upstream inconsistency, not a design choice).
 * - `#mmd-N .node rect, …, #mmd-N .node path { fill: mainBkg; … }` — the
 *   generic node-shape rule the `.katex` escape hatch above exists for,
 *   which still wins in diagram/theme combinations without the escape.
 *
 * Label text is HTML and inherits `color` (white in dark themes), but the
 * glyph paths resolve `fill` through those rules: they come out pure black.
 * Black ink reads fine on a light background — the bug hides in light
 * themes — and shows as "darker than the dark background" in dark ones. The
 * added `stroke` (Mermaid's edge gradient in some looks) also outlines
 * KaTeX's filled glyph shapes at `stroke-width: 1px`, fattening them.
 *
 * An inline `style` beats any stylesheet rule (Mermaid's rules carry no
 * `!important`), and `fill: currentColor` resolves to the label's actual
 * text color at paint time — theme-proof, unlike any fixed color. The two
 * values are exactly KaTeX's own CSS contract (`katex.css`:
 * `.katex svg { fill: currentColor; stroke: currentColor }`,
 * `.katex svg path { stroke: none }`), so the pin changes nothing wherever
 * Mermaid's rules do not apply.
 *
 * Scope is deliberately narrow: only `<path>` elements under a `.katex`
 * wrapper inside `<foreignObject>`. Mermaid's own diagram paths must keep
 * their theme paint, and label icons (`fa:fa-*`) are Mermaid's
 * `.label-icon path` business. KaTeX draws glyph shapes as `<path>` only —
 * its delimiters, letters and operators are font glyphs/HTML boxes and are
 * not affected by this bug.
 *
 * Run at cache-fill time and in the export/print render paths (renderer.ts),
 * next to `clampNegativeStrokeWidths`/`normalizeSvgTextOffsets`, and BEFORE
 * `rasterizeMermaidLabelMath`/`convertForeignObjectLabels` — those capture
 * the label markup to PNG and bake in whatever paint is in effect (that
 * capture is where the black square root shipped to users).
 *
 * Regression: `__tests__/label-paint.test.ts`; the upgrade-contract suite
 * pins that Mermaid still emits the black `.node .katex path` rule (if that
 * stops, this pass may be obsolete). See AGENTS.md, "Mermaid Label Math
 * Paint".
 */

/** Inline paint pin — values mirror KaTeX's own SVG CSS (see module doc). */
const PAINT_PIN = "fill: currentColor; stroke: none";

/**
 * The pin already applied at the end of an inline `style` attribute. The
 * `(^|;)` gate keeps lookalike declarations (e.g. `background-fill:…`)
 * out of the match.
 */
const PINNED = new RegExp(
  String.raw`(?:^|;)\s*fill\s*:\s*currentColor\s*;\s*stroke\s*:\s*none\s*;?\s*$`,
);

/**
 * Rewrite every KaTeX glyph `<path>` inside `svg`'s foreignObject labels to
 * carry the {@link PAINT_PIN} inline. Returns `svg` unchanged when there is
 * no label math, no DOM (node), or no path needs pinning — and is
 * idempotent.
 */
export function pinLabelMathPaint(svg: string): string {
  // Fast paths: label math is rare, and most diagrams must cost a regex.
  if (!/foreignObject/i.test(svg)) return svg;
  if (!/(class="[^"]*\bkatex\b|<math\b)/i.test(svg)) return svg;
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return svg;
  }

  const host = document.createElement("div");
  host.innerHTML = svg;

  let changed = false;
  for (const fo of host.querySelectorAll("foreignObject")) {
    for (const path of fo.querySelectorAll("path")) {
      if (!path.closest(".katex")) continue;
      const style = (path.getAttribute("style") ?? "").trim();
      if (PINNED.test(style)) continue;
      // Appended last on purpose: later declarations win over any earlier
      // fill/stroke in the same style attribute.
      path.setAttribute(
        "style",
        style ? `${style.replace(/;+\s*$/, "")}; ${PAINT_PIN}` : PAINT_PIN,
      );
      changed = true;
    }
  }

  return changed ? host.innerHTML : svg;
}
