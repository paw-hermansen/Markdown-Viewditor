let injected = false;

/**
 * The font size every Mermaid HTML label (the root `<div>` inside its
 * `<foreignObject>`) must render at. Shared by the stylesheet below and by
 * `themeVariables.fontSize` in renderer.ts — the two sides MUST stay equal,
 * because Mermaid bakes each label's clip box from a measurement taken while
 * the diagram's injected stylesheet may not be resolved yet. See the rule
 * comment in MERMAID_STYLES for the failure mode this prevents.
 */
export const MERMAID_FONT_SIZE = "16px";

export const MERMAID_STYLES = `
      .mermaid-block {
        box-sizing: border-box;
        display: flex;
        width: min(var(--mermaid-max-width, 800px), 100%);
        max-width: 100%;
        min-width: 0;
        margin: 1em auto;
        overflow: visible;
        align-items: flex-start;
        justify-content: center;
      }
      .mermaid-block[data-align="left"] {
        margin-left: 0;
        margin-right: auto;
        justify-content: flex-start;
      }
      .mermaid-block[data-align="center"] {
        margin-left: auto;
        margin-right: auto;
        justify-content: center;
      }
      .mermaid-block[data-align="right"] {
        margin-left: auto;
        margin-right: 0;
        justify-content: flex-end;
      }
      .mermaid-block.mermaid-error-block {
        flex-direction: column;
        align-items: stretch;
      }
      .mermaid-block[data-fit-to-width="false"] {
        overflow-x: auto;
        /* Keep older WebViews from promoting the other axis to auto. */
        overflow-y: hidden;
        overflow-y: clip;
        justify-content: flex-start;
      }
      .mermaid-block svg {
        display: block;
        max-width: 100%;
        height: auto;
      }
      /* Label size contract: Mermaid sizes each HTML label's <foreignObject>
         clip box from a getBoundingClientRect() on the label root div, taken
         while the diagram's injected stylesheet is not guaranteed to be
         resolved across the foreignObject boundary (WebKitGTK). Measurement
         can then fall back to the page's 14px body font while paint uses the
         diagram root rule's 16px, clipping labels at exactly 14/16 = 87.5%
         ("start" -> "star"). A font-size specified on the label root beats
         inheritance in both states, so measure and paint always agree. It
         must stay equal to MERMAID_FONT_SIZE, which renderer.ts also pins as
         themeVariables.fontSize for the diagram root rule. The second host is
         Mermaid's pre-render temp container (render id "mmd-N" mirrors as
         "div#dmmd-N"), which is where the measurement happens. */
      .mermaid-block svg foreignObject > div,
      body > div[id^="dmmd-"] svg foreignObject > div {
        font-size: ${MERMAID_FONT_SIZE};
      }
      /* Inner wrapper so the SVG is not a direct flex item. WebKitGTK does not
         reliably resolve width: max-content on SVG flex items, causing the
         diagram to shrink to the host width instead of scrolling. */
      .mermaid-block[data-fit-to-width="false"] .mermaid-scroll-content {
        display: inline-block;
        flex: 0 0 auto;
        max-width: none;
        vertical-align: top;
      }
      .mermaid-block[data-fit-to-width="false"] svg {
        max-width: none !important;
        width: auto !important;
        height: auto !important;
      }
      .mermaid-error {
        color: #cc0000;
        font-size: 0.9em;
        white-space: pre-wrap;
        padding: 0.5em;
        border: 1px solid #cc0000;
        border-radius: 4px;
        background: rgba(204, 0, 0, 0.05);
      }
      .mermaid-error-msg {
        color: #cc0000;
        font-size: 0.85em;
        margin-top: 0.25em;
      }
      /* Print/PDF export (the .print-content clone in exporters/pdf.ts):
         there is no scrolling in print, so natural-size diagrams wider
         than the content column are scaled down to it instead of being
         cut off. Only what is too wide shrinks — diagrams whose natural
         size fits the column, and fitToWidth-scaled diagrams, render
         untouched. The host is widened to the full column so the clamp
         basis is the page width, not the maxWidth scroll viewport
         (meaningless in print); data-align still positions the diagram.
         The svg rule needs !important plus the extra .print-content
         specificity to outrank the viewer's max-width: none !important. */
      .print-content .mermaid-block[data-fit-to-width="false"] {
        width: 100%;
        max-width: 100%;
        overflow: visible;
        justify-content: center;
      }
      .print-content .mermaid-block[data-fit-to-width="false"][data-align="left"] {
        justify-content: flex-start;
      }
      .print-content .mermaid-block[data-fit-to-width="false"][data-align="right"] {
        justify-content: flex-end;
      }
      .print-content .mermaid-block[data-fit-to-width="false"] .mermaid-scroll-content {
        max-width: 100%;
      }
      .print-content .mermaid-block[data-fit-to-width="false"] svg {
        max-width: 100% !important;
        width: auto !important;
        height: auto !important;
      }
      /* Keep diagrams from being split across pages. */
      .print-content .mermaid-block {
        break-inside: avoid;
      }
    `;

export function injectMermaidStyles(): void {
  if (injected) return;
  if (typeof document === "undefined") return;

  if (!document.querySelector(`style[data-ext="mermaid"]`)) {
    const style = document.createElement("style");
    style.dataset.ext = "mermaid";
    style.textContent = MERMAID_STYLES;
    document.head.appendChild(style);
  }

  injected = true;
}
