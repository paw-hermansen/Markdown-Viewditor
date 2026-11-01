/**
 * Give exported `<img>` elements a native hover tooltip.
 *
 * The live viewer shows image tooltips through custom JS (Viewer.svelte
 * reads `data-tooltip` off `.img-tooltip-wrapper` and floats a div), but
 * exported HTML carries no JavaScript. Browsers only pop up a native hover
 * tooltip for the `title` attribute — `alt` is fallback text for broken
 * images — so the alt text is mirrored into `title` at export time.
 *
 * Only images with a non-empty alt get a title: the viewer falls back to
 * the src when alt is empty, but in the standalone export the src is a
 * huge inlined data URI, which would make a monstrous tooltip. An existing
 * `title` attribute (e.g. from `![alt](src "title")`) is left untouched.
 */

/** An `<img ...>` tag, tolerating `>` inside quoted attribute values. */
const IMG_TAG_RE = /<img\s(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;

/** The alt attribute (quoted or bare) of an `<img>` tag; groups hold the raw value. */
const ALT_RE = /(?:^|\s)alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** A `title` attribute (as opposed to e.g. `data-title`). */
const TITLE_RE = /(?:^|\s)title\s*=/i;

export function addImageTitles(html: string): string {
  return html.replace(IMG_TAG_RE, (tag) => {
    if (TITLE_RE.test(tag)) return tag;
    const alt = ALT_RE.exec(tag);
    if (!alt) return tag;
    const raw = alt[1] ?? alt[2] ?? alt[3] ?? "";
    if (!raw.trim()) return tag;
    // Copy the alt value verbatim — it is already escaped for its quoting
    // style — into a title attribute using the same quoting style. A bare
    // (unquoted) value cannot contain quotes, so double quotes are safe.
    const quote = alt[2] !== undefined ? "'" : '"';
    return tag.replace(alt[0], `${alt[0]} title=${quote}${raw}${quote}`);
  });
}
