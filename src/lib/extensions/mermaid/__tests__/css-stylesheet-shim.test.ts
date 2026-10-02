// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureConstructableStylesheet } from "../css-stylesheet-shim";

type Ctor = new () => CSSStyleSheet;

const originalCSSStyleSheet = globalThis.CSSStyleSheet;

/**
 * Serializes a sheet exactly like Mermaid's `cssStyleSheetToString()`
 * (mermaid.core.mjs): `[...sheet.cssRules].map((rule) => rule.cssText)`.
 */
function sheetToString(sheet: CSSStyleSheet): string {
  return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
}

function shimmedConstructor(): Ctor {
  return globalThis.CSSStyleSheet as unknown as Ctor;
}

/**
 * Mimics WebKit before Safari 16.4 (e.g. WKWebView on macOS 12 Monterey):
 * the `CSSStyleSheet` interface object exists — prototype included — but
 * constructing throws `TypeError: Illegal constructor`.
 */
function installBrokenConstructor(): void {
  const native = globalThis.CSSStyleSheet;
  function BrokenCSSStyleSheet(): never {
    throw new TypeError("Illegal constructor");
  }
  if (native) {
    BrokenCSSStyleSheet.prototype = native.prototype;
  }
  (globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet =
    BrokenCSSStyleSheet;
}

function installShim(): Ctor {
  installBrokenConstructor();
  const broken = globalThis.CSSStyleSheet;
  ensureConstructableStylesheet();
  expect(globalThis.CSSStyleSheet).not.toBe(broken);
  return shimmedConstructor();
}

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet =
    originalCSSStyleSheet;
  document.head
    .querySelectorAll('style[media="not all"]')
    .forEach((node) => node.remove());
});

describe("ensureConstructableStylesheet", () => {
  it("leaves a working native constructor untouched", () => {
    const before = globalThis.CSSStyleSheet;
    expect(() => new before()).not.toThrow();
    ensureConstructableStylesheet();
    expect(globalThis.CSSStyleSheet).toBe(before);
  });

  it("installs a shim when the constructor throws 'Illegal constructor'", () => {
    const Shim = installShim();
    expect(() => new Shim()).not.toThrow();
    const sheet = new Shim();
    expect(typeof sheet.insertRule).toBe("function");
    expect(sheet.cssRules.length).toBe(0);
  });

  it("is idempotent and never wraps its own shim", () => {
    installShim();
    const first = globalThis.CSSStyleSheet;
    ensureConstructableStylesheet();
    ensureConstructableStylesheet();
    expect(globalThis.CSSStyleSheet).toBe(first);
  });

  it("does nothing without a DOM", () => {
    vi.stubGlobal("document", undefined);
    installBrokenConstructor();
    const broken = globalThis.CSSStyleSheet;
    expect(() => ensureConstructableStylesheet()).not.toThrow();
    expect(globalThis.CSSStyleSheet).toBe(broken);
  });

  it("keeps `instanceof CSSStyleSheet` working", () => {
    const Shim = installShim();
    const sheet = new Shim();
    expect(sheet instanceof CSSStyleSheet).toBe(true);
  });

  it("reproduces Mermaid's createCssStyles usage (insertRule + cssRules)", () => {
    const Shim = installShim();
    const sheet = new Shim();

    // mermaid.core.mjs createCssStyles(): rules are appended at
    // `cssRules.length` and serialized via rule.cssText.
    const index = sheet.insertRule(
      `:root { --mermaid-font-family: inherit}`,
      sheet.cssRules.length,
    );
    sheet.insertRule(
      `.cluster > * { stroke: blue !important; }`,
      sheet.cssRules.length,
    );

    expect(index).toBe(0);
    expect(sheet.cssRules.length).toBe(2);
    const css = sheetToString(sheet);
    expect(css).toContain("--mermaid-font-family: inherit");
    expect(css).toContain(".cluster > *");
  });

  it("reproduces Mermaid's themeCSS path (replaceSync guard)", () => {
    const Shim = installShim();
    const sheet = new Shim();

    // mermaid.core.mjs only takes the parsed themeCSS path when
    // `typeof cssStyles.replaceSync === "function"`.
    expect(typeof sheet.replaceSync).toBe("function");
    sheet.replaceSync(".a { fill: red; }\n.b { stroke: blue; }");
    const css = sheetToString(sheet);
    expect(css).toContain("fill: red");
    expect(css).toContain("stroke: blue");
  });

  it("reproduces the C4 chunk's elementFontStyles usage (CSSStyleRule.style)", () => {
    const Shim = installShim();
    const sheet = new Shim();

    // mermaid.core.mjs c4Diagram elementFontStyles(): insertRule returns an
    // index, the rule is mutated via style.setProperty(), and only rules
    // with `style.length > 0` are serialized.
    const rule = sheet.cssRules[
      sheet.insertRule(`.c4-shape.c4-person .label {}`, sheet.cssRules.length)
    ] as CSSStyleRule;
    rule.style.setProperty("font-family", "Arial");
    rule.style.setProperty("font-size", "14px");

    expect(rule.style.length).toBe(2);
    const css = sheetToString(sheet);
    expect(css).toContain(".c4-shape.c4-person .label");
    expect(css).toContain("font-family: Arial");
    expect(css).toContain("font-size: 14px");
  });

  it("keeps native insertRule error parity for invalid CSS", () => {
    const Shim = installShim();
    const sheet = new Shim();
    let thrown: unknown;
    try {
      sheet.insertRule("not a rule", 0);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect((thrown as Error).name).toBe("SyntaxError");
  });
});
