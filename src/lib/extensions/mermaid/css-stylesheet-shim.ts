/**
 * Feature-detected fallback for the `CSSStyleSheet` constructor.
 *
 * Mermaid (>= 11.6) builds every diagram's CSS through the Constructable
 * Stylesheets API: `createCssStyles()` does `new CSSStyleSheet()` and fills
 * it with `insertRule()` calls (the C4 diagram chunk also uses
 * `CSSStyleRule.style.setProperty()`), then serializes `cssRules` into the
 * generated `<svg><style>`. WebKit only allowed *constructing* a
 * `CSSStyleSheet` from Safari 16.4 (macOS 13.3 / iOS 16.4) on; older
 * WKWebViews expose the interface object but throw
 * `TypeError: Illegal constructor`, so every diagram fails. Windows
 * (WebView2 / Chromium) and Linux (WebKitGTK >= 2.40) are unaffected.
 *
 * This is an upstream regression: mermaid-js/mermaid#6666. Remove this shim
 * once Mermaid ships a fallback of its own.
 *
 * The shim constructor returns a *real* `CSSStyleSheet` obtained from a
 * `<style>` element, so Mermaid's output is serialized by the engine's own
 * CSSOM and stays byte-identical across platforms. On healthy engines
 * {@link ensureConstructableStylesheet} is a no-op.
 */

type StylesheetConstructor = new () => CSSStyleSheet;

/** Marks our shim so repeated calls never wrap it again. */
const SHIM_FLAG = "__mdvConstructableStylesheetShim";

/**
 * Install the shim on `globalThis` unless the engine can already construct a
 * working `CSSStyleSheet`. Safe to call repeatedly; no-op in DOM-less
 * environments (node-based tests), where Mermaid cannot render anyway.
 */
export function ensureConstructableStylesheet(): void {
  const globals = globalThis as unknown as { CSSStyleSheet?: unknown };
  const current = globals.CSSStyleSheet;
  if (
    typeof current === "function" &&
    (current as unknown as Record<string, unknown>)[SHIM_FLAG]
  ) {
    return;
  }
  if (isStylesheetConstructor(current)) return;
  // Without a DOM there is no CSSOM to back the shim with; nothing can
  // render Mermaid diagrams there either.
  if (typeof document === "undefined" || !document.head) return;

  const shim = createShimConstructor(current);
  (shim as unknown as Record<string, unknown>)[SHIM_FLAG] = true;
  globals.CSSStyleSheet = shim;
}

/**
 * Whether `value` behaves like a usable `CSSStyleSheet` constructor.
 * Throws (Webkit < 16.4: "Illegal constructor") or a missing CSSOM API
 * (insertRule/cssRules) both count as unusable.
 */
function isStylesheetConstructor(value: unknown): boolean {
  if (typeof value !== "function") return false;
  try {
    const sheet = new (value as StylesheetConstructor)();
    return (
      typeof sheet.insertRule === "function" &&
      sheet.cssRules != null &&
      typeof sheet.cssRules.length === "number"
    );
  } catch {
    return false;
  }
}

function createShimConstructor(original: unknown): StylesheetConstructor {
  const shim = function CSSStyleSheet(): CSSStyleSheet {
    const backing = createBackingSheet();
    installReplaceMethods(backing);
    return backing;
  };

  // `instanceof CSSStyleSheet` keeps working: sheets created from a
  // `<style>` element inherit from the engine's `CSSStyleSheet.prototype`,
  // which the non-constructible interface object still exposes — so link
  // the shim's prototype to it.
  const prototype = (original as { prototype?: unknown } | null)?.prototype;
  if (prototype) {
    shim.prototype = prototype;
  }
  return shim as unknown as StylesheetConstructor;
}

/**
 * Backing `<style>` elements created in the live document (fallback tier),
 * removed once their sheet is garbage-collected. Best-effort: the elements
 * are inert (`media="not all"`), so a delayed cleanup is harmless.
 */
const liveBackings = new FinalizationRegistry<HTMLStyleElement>((style) => {
  style.remove();
});

function createBackingSheet(): CSSStyleSheet {
  // Tier 1: a detached document keeps the backing `<style>` out of the
  // app's DOM entirely; it is garbage-collected together with the sheet.
  const detachedDoc = document.implementation.createHTMLDocument("");
  const detachedStyle = detachedDoc.createElement("style");
  detachedDoc.head.appendChild(detachedStyle);
  if (detachedStyle.sheet) {
    return detachedStyle.sheet;
  }

  // Tier 2: some engines only associate a sheet with elements in the live
  // document. `media="not all"` keeps it inert — the rules never match
  // anything in the app, and Mermaid only reads the CSSOM back.
  const liveStyle = document.createElement("style");
  liveStyle.media = "not all";
  document.head.appendChild(liveStyle);
  if (!liveStyle.sheet) {
    liveStyle.remove();
    throw new Error(
      "CSSStyleSheet shim: unable to obtain a backing CSSOM stylesheet",
    );
  }
  liveBackings.register(liveStyle.sheet, liveStyle);
  return liveStyle.sheet;
}

/**
 * Old engines have no `replaceSync`/`replace` on stylesheet objects, and
 * engines that have them may still reject non-constructed sheets (e.g.
 * jsdom throws `NotAllowedError` on style-backed sheets). Always install our
 * own implementation on the sheets this shim hands out: the text is parsed
 * by a throwaway `<style>` element and the resulting rules are copied into
 * the held sheet via `insertRule`, so the `CSSStyleSheet` object Mermaid
 * holds keeps its identity (swapping a backing element's text can make
 * engines hand out a *new* sheet object).
 */
function installReplaceMethods(sheet: CSSStyleSheet): void {
  const target = sheet as unknown as {
    replaceSync: (text: string) => void;
    replace: (text: string) => Promise<CSSStyleSheet>;
  };
  target.replaceSync = (text: string) => {
    const rules = parseCssRules(text);
    while (sheet.cssRules.length > 0) {
      sheet.deleteRule(sheet.cssRules.length - 1);
    }
    rules.forEach((ruleText, index) => {
      try {
        sheet.insertRule(ruleText, index);
      } catch {
        // Skip rules the engine rejects, mirroring replaceSync semantics.
      }
    });
  };
  target.replace = (text: string) => {
    target.replaceSync(text);
    return Promise.resolve(sheet);
  };
}

/** Parse CSS text into serialized rule strings using the engine's parser. */
function parseCssRules(text: string): string[] {
  // A live-document `<style media="not all">` is the one backing every
  // engine can parse with (see createBackingSheet); it is inert and removed
  // immediately after parsing.
  const temp = document.createElement("style");
  temp.media = "not all";
  document.head.appendChild(temp);
  try {
    temp.textContent = text;
    return temp.sheet
      ? [...temp.sheet.cssRules].map((rule) => rule.cssText)
      : [];
  } finally {
    temp.remove();
  }
}
