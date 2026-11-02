let injected = false;

/**
 * SMILES block layout. `data-align` on the wrapper drives horizontal
 * alignment with the same mechanism (and values) as Mermaid's `align`.
 * The size contract (renderer.ts) sets explicit `width`/`height`
 * attributes on the SVG.
 *
 * Two width modes (mirroring Mermaid's `fitToWidth`):
 *
 * - default (`fitToWidth=true`): `max-width: 100%; height: auto` scales
 *   the structure down to the viewer column.
 * - `data-fit-to-width="false"`: the scaled size is kept and the block
 *   scrolls horizontally. Alignment is driven by auto margins on the
 *   `.smiles-scroll-content` inner wrapper, never `justify-content`:
 *   centered flex content overflows both ends and the left part becomes
 *   unreachable in a scroll container. Auto margins absorb free space
 *   when the structure is narrow (align works) and resolve to zero on
 *   overflow, so the structure always overflows rightward — fully
 *   scrollable (same trick, same wrapper, same axis fallback as Mermaid's
 *   scroll mode).
 */
export const SMILES_STYLES = `
      .smiles-block {
        box-sizing: border-box;
        display: flex;
        width: 100%;
        margin: 1em 0;
        overflow: visible;
        align-items: flex-start;
      }
      .smiles-block[data-align="left"] {
        justify-content: flex-start;
      }
      .smiles-block[data-align="center"] {
        justify-content: center;
      }
      .smiles-block[data-align="right"] {
        justify-content: flex-end;
      }
      .smiles-block.smiles-error-block {
        flex-direction: column;
        align-items: stretch;
      }
      .smiles-block svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      /* fitToWidth=false: keep the scaled size, scroll horizontally. */
      .smiles-block[data-fit-to-width="false"] {
        overflow-x: auto;
        /* Keep older WebViews from promoting the other axis to auto. */
        overflow-y: hidden;
        overflow-y: clip;
        justify-content: flex-start;
      }
      .smiles-block[data-fit-to-width="false"] .smiles-scroll-content {
        display: inline-block;
        flex: 0 0 auto;
        max-width: none;
        vertical-align: top;
        margin-left: auto;
        margin-right: auto;
      }
      .smiles-block[data-fit-to-width="false"][data-align="left"] .smiles-scroll-content {
        margin-left: 0;
        margin-right: 0;
      }
      .smiles-block[data-fit-to-width="false"][data-align="right"] .smiles-scroll-content {
        margin-left: auto;
        margin-right: 0;
      }
      .smiles-block[data-fit-to-width="false"] svg {
        max-width: none;
        height: auto;
      }
      .smiles-error {
        color: #cc0000;
        font-size: 0.9em;
        white-space: pre-wrap;
        padding: 0.5em;
        border: 1px solid #cc0000;
        border-radius: 4px;
        background: rgba(204, 0, 0, 0.05);
      }
      .smiles-error-msg {
        color: #cc0000;
        font-size: 0.85em;
        margin-top: 0.25em;
      }
      /* Print/PDF export (the .print-content clone in exporters/pdf.ts):
         there is no scrolling in print, so structures at natural size are
         scaled down to the content column (which the clone maps onto the
         printable page width) instead of being cut off. Keep a structure
         from being split across pages. */
      .print-content .smiles-block[data-fit-to-width="false"] {
        overflow: visible;
      }
      .print-content .smiles-block[data-fit-to-width="false"] .smiles-scroll-content {
        max-width: 100%;
      }
      .print-content .smiles-block[data-fit-to-width="false"] svg {
        max-width: 100%;
        height: auto;
      }
      .print-content .smiles-block {
        break-inside: avoid;
      }
    `;

export function injectSmilesStyles(): void {
  if (injected) return;
  if (typeof document === "undefined") return;

  if (!document.querySelector(`style[data-ext="smiles"]`)) {
    const style = document.createElement("style");
    style.dataset.ext = "smiles";
    style.textContent = SMILES_STYLES;
    document.head.appendChild(style);
  }

  injected = true;
}
