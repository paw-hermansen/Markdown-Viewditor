let injected = false;

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
      .mermaid-block[data-fit-to-width="false"] svg {
        max-width: none !important;
        width: max-content !important;
        min-width: max-content !important;
        flex-shrink: 0 !important;
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
