import { escapeXml } from "$lib/utils/escape";

export { decodeHtmlEntities } from "$lib/utils/escape";

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
