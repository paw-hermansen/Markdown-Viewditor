/**
 * WebKit page zoom workaround for smiles-drawer label placement: rewrite
 * the two fragile positioning mechanisms the library emits into absolute
 * user units. Same engine bug family as Mermaid's pinned drifts (see
 * `../mermaid/text-offsets.ts` and .agents/guides/math-mermaid.md "SMILES
 * SVG Contract"); same fix philosophy: convert to zoom-independent numbers
 * once at render time, so the SVG is correct at every zoom level.
 *
 * What smiles-drawer emits for every atom label:
 *
 *   <g style="transform: translateX(Xpx) translateY(Ypx)">
 *     <text class="element" dominant-baseline="alphabetic" y="0.36em" …>
 *       <tspan …>C</tspan>…
 *     </text>
 *   </g>
 *
 * and for stacked (up/down) labels `<tspan x="0px" y="±0.9em">` per line.
 * Both placement mechanisms drift under WebKit page zoom:
 *
 * 1. **em offsets** (`y="0.36em"`, `y="±0.9em"`) resolve against the
 *    *zoom-divided* computed font size while the drawing geometry scales
 *    normally, so the labels slide vertically as zoom changes (the pinned
 *    Mermaid `dy`/`dx` drift).
 * 2. **CSS-px translate placement** (`style="transform: translateX(..px)"`)
 *    is the CSS-zoom machinery's px resolution on SVG content — the same
 *    class as the pinned "translate-based text placement drifts
 *    catastrophically under WebKit page zoom" Mermaid bug.
 *
 * Plain user-unit attributes (bonds, masks, viewBox) are zoom-proof and
 * untouched — only the letters move, which is what users see.
 *
 * The rewrite is deterministic: the label font size is known from the
 * `font-size` attributes `bakeSvgFonts` writes (11pt/3pt), so no computed
 * styles or calibration probe (Mermaid needs those because its fonts come
 * from CSS cascades at runtime). A `<tspan>` inherits the size from its
 * enclosing `<text>`; 11pt is the fallback.
 *
 * Both passes are idempotent and geometrically exact at zoom 1: they only
 * change how the position is expressed, never where the glyphs land.
 */

const OFFSET_ATTRS = ["x", "y", "dx", "dy"] as const;

/** `<g style="transform: translateX(A) translateY(B)">` (the label groups). */
const G_TRANSLATE =
  /translateX\(\s*([^)\s]+)\s*\)\s*translateY\(\s*([^)\s]+)\s*\)/;

const EM_RE = /em\s*$/i;
const PT_RE = /pt\s*$/i;

/** Fallback when no font-size attribute is found: the `.element` label size. */
const DEFAULT_FONT_PX = 11 * (96 / 72);

/** Font size in user units from the nearest `font-size` attribute. */
function fontSizeUserUnits(el: Element): number {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const raw = e.getAttribute("font-size");
    if (!raw) continue;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    return PT_RE.test(raw.trim()) ? n * (96 / 72) : n;
  }
  return DEFAULT_FONT_PX;
}

/**
 * Resolve an SVG length attribute to user units: `em` against the font
 * size, everything else (unitless or `px` — identical in SVG attributes)
 * as-is. Returns null for unparseable values.
 */
function resolveLength(raw: string, fontPx: number): number | null {
  const trimmed = raw.trim();
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  return EM_RE.test(trimmed) ? n * fontPx : n;
}

/**
 * Normalize smiles-drawer label placement to zoom-proof absolute user
 * units, in place:
 *
 * 1. em-based `x`/`y`/`dx`/`dy` on `<text>`/`<tspan>` become absolute
 *    user units (relative offsets stay relative).
 * 2. Each label group's `style="transform: translateX(..) translateY(..)"`
 *    folds into `x`/`y` on the elements it wraps (explicit coordinates
 *    shift by the translate; `<text>` anchors always get coordinates;
 *    flowing `<tspan>`s — no `x`/`y` — keep flowing). The transform is
 *    then removed.
 */
export function normalizeSmilesTextPlacement(svg: SVGSVGElement): void {
  // Pass 1: em offsets -> absolute user units.
  for (const el of svg.querySelectorAll("text, tspan")) {
    const fontPx = fontSizeUserUnits(el);
    for (const attr of OFFSET_ATTRS) {
      const raw = el.getAttribute(attr);
      if (!raw || !EM_RE.test(raw.trim())) continue;
      const resolved = resolveLength(raw, fontPx);
      if (resolved === null) continue;
      el.setAttribute(attr, resolved.toFixed(3));
    }
  }

  // Pass 2: fold the label groups' translate placement into coordinates.
  for (const g of svg.querySelectorAll("g")) {
    const style = g.getAttribute("style");
    if (!style) continue;
    // Only label groups (text wrappers) may be folded; a transformed group
    // carrying geometry would lose its placement.
    if (!g.querySelector("text")) continue;
    const m = G_TRANSLATE.exec(style);
    if (!m) continue;
    const tx = parseFloat(m[1]);
    const ty = parseFloat(m[2]);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;

    for (const el of g.querySelectorAll("text, tspan")) {
      const isText = el.tagName.toLowerCase() === "text";
      for (const [attr, t] of [
        ["x", tx],
        ["y", ty],
      ] as const) {
        const raw = el.getAttribute(attr);
        if (raw !== null) {
          // Explicit coordinates are absolute in the group's user space —
          // shift them by the translate being folded in.
          const resolved = resolveLength(raw, fontSizeUserUnits(el));
          if (resolved === null) continue;
          el.setAttribute(attr, (resolved + t).toFixed(3));
        } else if (isText) {
          // The text anchor is the fold target (it defaults to 0,0 inside
          // the group). Tspans without coordinates flow from it and must
          // NOT get coordinates, or they would pile up at the anchor.
          el.setAttribute(attr, t.toFixed(3));
        }
      }
    }

    g.removeAttribute("style");
  }
}
