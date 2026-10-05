/**
 * Rewrite `#id` CSS selector references to follow an id rename map.
 *
 * One contract, two callers that must agree: the Mermaid renderer's SVG id
 * scoping (`extensions/mermaid/renderer.ts` → `namespaceSvgIds`) and the print
 * clone's `scopeSubtreeIds()` (`export/id-scope.ts`). The clone renames the
 * ids the first pass already renamed, so a selector form one pass handles and
 * the other misses silently undoes the first fix.
 *
 * Mermaid serializes its per-diagram CSS **compactly** (css-tree), so an id
 * selector can sit directly against a declaration block — `#mmd-0{font-size:
 * 16px;…}` — and the lookahead must accept `{` for that case. A missed
 * selector means the rule is orphaned by the rename; for Mermaid's root rule
 * that drops the diagram's `font-family`/`font-size`/`fill`, and labels then
 * render at whatever the engine inherits into `<foreignObject>` (which
 * WebKitGTK additionally mis-scales by the device scale factor and under CSS
 * `zoom`) while the node boxes keep the measured size.
 */
export function rewriteIdSelectors(
  css: string,
  idMap: ReadonlyMap<string, string>,
): string {
  let out = css;
  for (const [id, renamed] of idMap) {
    out = out.replace(idSelectorPattern(id), `#${renamed}`);
  }
  return out;
}

/**
 * Matches `#id` when followed by a selector delimiter (whitespace, combinator,
 * pseudo/attribute/class start) or a declaration block, or at end of input.
 */
function idSelectorPattern(id: string): RegExp {
  return new RegExp(`#${escapeRegExp(id)}(?=[\\s.#:[>+~,{]|$)`, "g");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
