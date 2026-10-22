/**
 * Markup escaping, shared by every place this app builds markup from user
 * content. There used to be five copies: four identical HTML ones and an ODF
 * one that differed only by its apostrophe rule.
 */

/**
 * Escape text for embedding in HTML markup.
 */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape text for embedding in ODF (XML) markup — a superset of
 * {@link escapeHtml}. XML has no unquoted attribute form, so an apostrophe
 * inside a value must be an entity too, and ODF consumers parse strictly.
 */
export function escapeXml(s: string | null | undefined): string {
  return escapeHtml(s).replace(/'/g, "&apos;");
}
