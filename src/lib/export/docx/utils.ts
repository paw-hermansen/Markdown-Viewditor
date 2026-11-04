/**
 * XML helpers for the DOCX exporter.
 *
 * Compatibility contract (EXPORT-PLAN 8.3): all text is XML-escaped and
 * stripped of control characters (markdown is untrusted input); `w:t` nodes
 * always carry `xml:space="preserve"` so leading/multiple spaces survive
 * (rule 7 — never a newline inside `w:t`; line breaks are separate runs).
 */
import { escapeXml } from "$lib/utils/escape";

/**
 * Strip characters XML 1.0 cannot represent (C0 controls except tab/LF/CR,
 * plus DEL). Written as a codepoint filter so the source needs no regex
 * escapes.
 */
export function sanitizeXmlText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c !== 0x7f)) {
      out += ch;
    }
  }
  return out;
}

/** Escape text content or an attribute value. */
export function esc(s: string | null | undefined): string {
  return escapeXml(sanitizeXmlText(s ?? ""));
}

/** A `w:t` node with whitespace preserved. */
export function wText(s: string): string {
  return `<w:t xml:space="preserve">${esc(s)}</w:t>`;
}

/** Recognize `<br>`, `<br/>`, `<br />` in lowercased html_inline content. */
export function isOpeningTag(lower: string, name: string): boolean {
  return (
    lower === `<${name}>` ||
    lower === `<${name} >` ||
    lower === `<${name}/>` ||
    lower === `<${name} />`
  );
}
