let injected = false;

/**
 * Vega-Lite block layout. `data-align` on the wrapper drives horizontal
 * alignment with the same mechanism (and values) as Mermaid's `align`.
 * The SVG carries explicit `width`/`height` attributes (render-core.ts
 * pins them).
 *
 * Two width modes (mirroring Mermaid/SMILES `fitToWidth`):
 *
 * - default (`fitToWidth=true`): `max-width: 100%; height: auto` scales
 *   the chart down to the viewer column.
 * - `data-fit-to-width="false"`: the spec's size is kept and the block
 *   scrolls horizontally. Alignment is driven by auto margins on the
 *   `.vega-lite-scroll-content` inner wrapper, never `justify-content`
 *   (centered flex content overflows both ends in a scroll container).
 */
export const VEGA_LITE_STYLES = `
      .vega-lite-block {
        box-sizing: border-box;
        display: flex;
        width: 100%;
        margin: 1em 0;
        overflow: visible;
        align-items: flex-start;
      }
      .vega-lite-block[data-align="left"] {
        justify-content: flex-start;
      }
      .vega-lite-block[data-align="center"] {
        justify-content: center;
      }
      .vega-lite-block[data-align="right"] {
        justify-content: flex-end;
      }
      .vega-lite-block.vega-lite-error-block {
        flex-direction: column;
        align-items: stretch;
      }
      .vega-lite-block svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      /* fitToWidth=false: keep the spec's size, scroll horizontally. */
      .vega-lite-block[data-fit-to-width="false"] {
        overflow-x: auto;
        /* Keep older WebViews from promoting the other axis to auto. */
        overflow-y: hidden;
        overflow-y: clip;
        justify-content: flex-start;
      }
      .vega-lite-block[data-fit-to-width="false"] .vega-lite-scroll-content {
        display: inline-block;
        flex: 0 0 auto;
        max-width: none;
        vertical-align: top;
        margin-left: auto;
        margin-right: auto;
      }
      .vega-lite-block[data-fit-to-width="false"][data-align="left"] .vega-lite-scroll-content {
        margin-left: 0;
        margin-right: 0;
      }
      .vega-lite-block[data-fit-to-width="false"][data-align="right"] .vega-lite-scroll-content {
        margin-left: auto;
        margin-right: 0;
      }
      .vega-lite-block[data-fit-to-width="false"] svg {
        max-width: none;
        height: auto;
      }
      .vega-lite-error {
        color: #cc0000;
        font-size: 0.9em;
        white-space: pre-wrap;
        padding: 0.5em;
        border: 1px solid #cc0000;
        border-radius: 4px;
        background: rgba(204, 0, 0, 0.05);
      }
      .vega-lite-error-msg {
        color: #cc0000;
        font-size: 0.85em;
        margin-top: 0.25em;
      }
      /* Print/PDF export (the .print-content clone in exporters/pdf.ts):
         there is no scrolling in print, so charts at natural size are
         scaled down to the content column instead of being cut off.
         Keep a chart from being split across pages. */
      .print-content .vega-lite-block[data-fit-to-width="false"] {
        overflow: visible;
      }
      .print-content .vega-lite-block[data-fit-to-width="false"] .vega-lite-scroll-content {
        max-width: 100%;
      }
      .print-content .vega-lite-block[data-fit-to-width="false"] svg {
        max-width: 100%;
        height: auto;
      }
      .print-content .vega-lite-block {
        break-inside: avoid;
      }
    `;

export function injectVegaLiteStyles(): void {
  if (injected) return;
  if (typeof document === "undefined") return;

  if (!document.querySelector(`style[data-ext="vega-lite"]`)) {
    const style = document.createElement("style");
    style.dataset.ext = "vega-lite";
    style.textContent = VEGA_LITE_STYLES;
    document.head.appendChild(style);
  }

  injected = true;
}
