// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

async function loadInject() {
  vi.resetModules();
  const mod = await import("../styles");
  return mod.injectKaTeXStyles;
}

describe("injectKaTeXStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("injects the --katex-font-scale rule", async () => {
    const inject = await loadInject();
    await inject();
    const el = document.querySelector('style[data-ext="katex-fontscale"]');
    expect(el?.textContent).toContain("--katex-font-scale");
  });

  it("pins the vlist-s baseline anchor to 2px (WebKit zoom workaround)", async () => {
    const inject = await loadInject();
    await inject();
    const el = document.querySelector('style[data-ext="katex-vlist-anchor"]');
    // The bundled KaTeX stylesheet says font-size: 1px here; under WebKit
    // page zoom that sub-pixel font collapses and the formula's plain-baseline
    // content (relations, delimiters) drifts ~one font-size below the vlist
    // content. Keep this rule in sync with the AGENTS.md KaTeX contract.
    expect(el?.textContent).toContain(".katex .vlist-s");
    expect(el?.textContent).toContain("font-size: 2px");
    expect(el?.textContent).not.toContain("1px");
  });

  it("is idempotent", async () => {
    const inject = await loadInject();
    await inject();
    await inject();
    expect(
      document.querySelectorAll('style[data-ext="katex-vlist-anchor"]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('style[data-ext="katex-fontscale"]'),
    ).toHaveLength(1);
  });
});
