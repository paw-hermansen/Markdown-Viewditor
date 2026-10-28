import { escapeXml } from "$lib/utils/escape";

const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&#x27;": "'",
  "&#39;": "'",
  "&amp;": "&",
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(
    /&quot;|&apos;|&lt;|&gt;|&#x27;|&#39;|&amp;/g,
    (m) => HTML_ENTITIES[m] ?? m,
  );
}

export function escWithSpaces(s: string | null | undefined): string {
  if (s == null) return "";
  const str = String(s);
  const match = str.match(/^( +)/);
  if (!match) return escapeXml(str);
  const leadingCount = match[1].length;
  const rest = str.slice(leadingCount);
  return `<text:s text:c="${leadingCount}"/>${escapeXml(rest)}`;
}

export function isOpeningTag(lower: string, name: string): boolean {
  return (
    lower === `<${name}>` ||
    lower === `<${name} >` ||
    lower === `<${name}/>` ||
    lower === `<${name} />`
  );
}
