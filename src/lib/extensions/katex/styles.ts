/**
 * Dynamic CSS injection for KaTeX styles.
 *
 * The KaTeX woff2 stylesheet is imported statically via the extension module
 * (katex/index.ts) so Vite bundles it at build time. This module only
 * injects the --katex-font-scale CSS variable rule.
 */

let fontscaleInjected = false;

export async function injectKaTeXStyles(): Promise<void> {
  if (fontscaleInjected) return;
  if (typeof document === "undefined") return;

  // Inject the --katex-font-scale CSS variable rule.
  if (!document.querySelector(`style[data-ext="katex-fontscale"]`)) {
    const style = document.createElement("style");
    style.dataset.ext = "katex-fontscale";
    style.textContent = `.katex { font-size: calc(1.21em * var(--katex-font-scale, 1)); }`;
    document.head.appendChild(style);
  }

  // WebKit zoom workaround: KaTeX anchors every vlist table's baseline on a
  // `.vlist-s` cell with `font-size: 1px` (its own CSS calls this a Safari
  // workaround). Under WebKit page zoom — which is the CSS `zoom` machinery
  // (see AGENTS.md "App Zoom") — any zoom factor < 1 makes that font
  // sub-pixel and its metrics collapse: the cell loses its baseline, the
  // inline-table re-anchors, and every plain-baseline element in the formula
  // (relations like `=`, `\left(...\right)` delimiters, `\text{}`) drops by
  // roughly one KaTeX font-size below the vlist-positioned content (matrix
  // rows, cases rows). Measured on WebKitGTK at 85% zoom: ~16px drift.
  // A 2px anchor survives the zoom multiplication (1.4px at the 70% zoom
  // floor) and is geometry-identical to stock KaTeX at 100% zoom (verified with a
  // WebKitGTK zoom sweep over matrices/cases formulas). !important because
  // the bundled KaTeX stylesheet may load after this rule.
  if (!document.querySelector(`style[data-ext="katex-vlist-anchor"]`)) {
    const style = document.createElement("style");
    style.dataset.ext = "katex-vlist-anchor";
    style.textContent = `.katex .vlist-s { font-size: 2px !important; }`;
    document.head.appendChild(style);
  }

  fontscaleInjected = true;
}
