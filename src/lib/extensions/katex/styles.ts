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

  fontscaleInjected = true;
}
