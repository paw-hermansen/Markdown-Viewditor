let injected = false;

/**
 * SMILES block layout. `data-align` on the wrapper drives horizontal
 * alignment with the same mechanism (and values) as Mermaid's `align`.
 * The size contract (renderer.ts) sets explicit `width`/`height`
 * attributes on the SVG; `max-width: 100%; height: auto` keeps large
 * `scale` values from overflowing the viewer column while preserving the
 * (square) aspect ratio.
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
         keep a structure from being split across pages. */
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
