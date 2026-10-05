/**
 * ID scoping for cloned content (the PDF/print clone, see
 * exporters/pdf.ts).
 *
 * The print clone is a copy of the live viewer's markup inserted into the
 * same document while the original stays in the DOM (hidden with
 * `display: none` inside the app shell at capture time). Every SVG id the
 * clone carries — Mermaid's `<defs><marker id="…">` in particular — therefore
 * exists twice in the document, and `url(#…)` references resolve to the
 * *first* element in document order: the copy inside the hidden, unlaid-out
 * viewer. Blink (Windows/WebView2) does not paint SVG resource references
 * (`marker-end: url(#…)`, `fill: url(#…)`) whose target sits under a
 * `display: none` ancestor, so Mermaid's arrowheads silently vanish from the
 * PDF while the plain stroked edge paths still print. WebKitGTK (Linux) and
 * WKWebView (macOS) paint them regardless, which is why the bug is
 * Windows-only.
 *
 * The fix: rename every id in the cloned subtree and rewrite all references
 * *within* that subtree to match, so the clone is self-contained and its ids
 * are document-unique. References to ids outside the subtree are left alone
 * (they already resolved outside before the clone existed).
 *
 * Reference forms handled:
 * - `url(#id)` / `url('#id')` / `url("#id")` in any attribute or CSS text
 *   (Mermaid sets `marker-end="url(#…)"` as an attribute; paint servers can
 *   appear in `style` attributes).
 * - `href` / `xlink:href="#id"` (`<use>`, footnote backrefs, KaTeX refs).
 * - IDREF attributes: `for` and the `aria-*` id-reference attributes.
 * - Inside `<style>` elements in the subtree: `url(#…)` and bare `#id`
 *   selectors. This one is load-bearing for Mermaid: its diagram CSS is keyed
 *   on `#<svgRootId> .marker { … }`, so a renamed root id whose stylesheet
 *   selectors do not follow would leave the diagram unstyled.
 */

/** Attributes whose whitespace-separated tokens are element references. */
const IDREF_ATTRIBUTES = new Set([
  "for",
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
]);

/** `url(#id)`, with optional quotes/whitespace around the fragment. */
const URL_REFERENCE_PATTERN = /url\(\s*(["']?)\s*#([^)"'\s]+)\s*\1\s*\)/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rename every `id` under `root` with `prefix` and rewrite the subtree's own
 * references to those ids. `root` itself is not renamed (the print container
 * takes over the `#viewer-content` id later, in `beginPrint()`).
 *
 * Returns the old-id → new-id map. Duplicate ids inside the subtree are made
 * unique; references resolve to the first occurrence in document order, which
 * is what browsers do with duplicates anyway.
 */
export function scopeSubtreeIds(
  root: Element,
  prefix: string,
): Map<string, string> {
  const idMap = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const el of root.querySelectorAll("[id]")) {
    const id = el.getAttribute("id");
    if (!id) continue;

    let namespaced = `${prefix}${id}`;
    for (let n = 2; usedNames.has(namespaced); n++) {
      namespaced = `${prefix}${id}-${n}`;
    }
    usedNames.add(namespaced);

    // First occurrence wins, mirroring getElementById on duplicated ids.
    if (!idMap.has(id)) idMap.set(id, namespaced);
    el.setAttribute("id", namespaced);
  }

  if (idMap.size === 0) return idMap;

  const mapRef = (id: string): string => idMap.get(id) ?? id;

  const rewriteUrlRefs = (value: string): string =>
    value.replace(URL_REFERENCE_PATTERN, (match, quote: string, id: string) =>
      match.replace(`#${id}`, `#${mapRef(id)}`),
    );

  for (const el of root.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "id") continue;

      const value = attr.value;
      let next = rewriteUrlRefs(value);
      if (name === "href" || name === "xlink:href") {
        if (next.startsWith("#")) next = `#${mapRef(next.slice(1))}`;
      } else if (IDREF_ATTRIBUTES.has(name)) {
        next = next.split(/\s+/).map(mapRef).join(" ");
      }
      if (next !== value) el.setAttribute(attr.name, next);
    }
  }

  for (const styleEl of root.querySelectorAll("style")) {
    const text = styleEl.textContent ?? "";
    let next = rewriteUrlRefs(text);
    for (const [id, namespaced] of idMap) {
      next = next.replace(
        new RegExp(`#${escapeRegExp(id)}(?=[\\s.#:[>+~,]|$)`, "g"),
        `#${namespaced}`,
      );
    }
    if (next !== text) styleEl.textContent = next;
  }

  return idMap;
}
