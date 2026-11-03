/**
 * Print/PDF workaround: convert smiles-drawer's mask-based label knockout
 * into painted knockout shapes.
 *
 * The drawing erases bond segments under atom labels with an SVG `<mask>`:
 * a white rect plus one black circle per label (`SvgWrapper.drawText` pushes
 * them; `constructSvg` hangs the mask on the bond group as
 * `mask="url(#…-text-mask)"`). Screen rendering, HTML export (inline SVG)
 * and ODT (vector SVG opened by LibreOffice) all paint masks correctly, so
 * the letters overwrite the lines beneath them there.
 *
 * The PDF/print clone cannot rely on that: it is scaled with CSS `zoom`
 * (the print-dialog path) or a paint-time transform (the macOS capture
 * path), and WebKit's zoom handling mis-scales inline SVG resources (the
 * bug family pinned in .agents/guides/export-print.md "Print/PDF Fidelity
 * Contract" — foreignObject fonts scaled twice, geometry/markers distorting
 * under zoom). The mask is a casualty of the same family: its knockout
 * circles stop lining up with the labels (or are dropped entirely), so the
 * bond lines print straight through the letters. The plain `<circle>`
 * geometry of the same drawing prints fine — which is what this conversion
 * exploits.
 *
 * `prepareSmilesForPrint` replaces the masked knockout with the same
 * circles painted in the page background color, stacked between the bond
 * group and the labels: bonds paint first, discs erase the parts under
 * labels (invisibly, against the page), labels paint on top. The result is
 * pixel-equivalent to the mask on a solid background and engine-proof
 * (plain filled shapes print everywhere). Known deviation: a theme with a
 * background *image* gets solid-color discs (the mask needed no color at
 * all) — acceptable and documented in the guide.
 *
 * The conversion runs on the print clone only; the viewer, HTML export and
 * ODT keep the mask and its transparency properties. Idempotent: a second
 * pass finds no masked group and does nothing.
 */

/** `mask="url(#id)"` (optionally quoted) on the bond group. */
const MASK_REF = /^url\(\s*["']?#([^"')]+)["']?\s*\)$/;

function isKnockoutShape(el: Element): boolean {
  // smiles-drawer paints the knockout circles `fill="black"` (and the mask's
  // base rect `fill="white"`). Anything black hides the masked group, so
  // anything black is what the printed knockout needs.
  const fill = (el.getAttribute("fill") ?? "").trim().toLowerCase();
  return fill === "black" || fill === "#000" || fill === "#000000";
}

/**
 * Rewrite the SMILES SVGs under `root` (the print clone) from mask-based
 * label knockout to painted knockout shapes in `knockoutColor` (the printed
 * page background). Modifies in place; safe to call on markup without
 * SMILES blocks.
 */
export function prepareSmilesForPrint(
  root: HTMLElement,
  knockoutColor: string,
): void {
  for (const svg of root.querySelectorAll(".smiles-block svg")) {
    for (const masked of svg.querySelectorAll("[mask]")) {
      const ref = masked.getAttribute("mask") ?? "";
      const m = MASK_REF.exec(ref.trim());
      if (!m) continue;

      // Find the referenced mask. Match by attribute, not a CSS selector —
      // the id is a random uid (later namespaced by the print clone's id
      // scoping) and must not be interpolated into a selector.
      let maskEl: Element | null = null;
      for (const cand of svg.querySelectorAll("mask")) {
        if (cand.getAttribute("id") === m[1]) {
          maskEl = cand;
          break;
        }
      }
      if (!maskEl) continue;

      // Painted knockouts: the mask's black shapes, filled with the page
      // background, stacked right above the masked group (bonds) and below
      // whatever follows (the label group).
      const discs: Element[] = [];
      for (const shape of maskEl.children) {
        if (!isKnockoutShape(shape)) continue;
        const disc = shape.cloneNode(false) as Element;
        disc.setAttribute("fill", knockoutColor);
        discs.push(disc);
      }
      if (discs.length > 0) {
        masked.after(...discs);
      }

      masked.removeAttribute("mask");
      maskEl.remove();
    }
  }
}
