/**
 * Flatten Mermaid's `<style>` CSS into SVG presentation attributes for
 * standalone-SVG consumers (vector ODT: LibreOffice's svgio importer).
 *
 * Mermaid paints almost everything through its generated `<style>` block,
 * using descendant-combinator rules (`#mmd-0 .node rect{fill:…}`,
 * `#mmd-0 .flowchart-link{stroke:…;fill:none}`). LibreOffice's svgio only
 * matches those selectors in flat structures: the first descendant hop
 * after `#id` must be a *direct child* (verified on LO 26.8 — tdf#129356),
 * while Mermaid nests every styled group one `<g class="root">` deeper.
 * Effectively no rule ever matches, the shapes fall back to the SVG
 * defaults `fill: black` / `stroke: none` (and the one rule that does
 * match, the bare `#id{fill:#333}` root rule, paints the black boxes
 * dark gray): node boxes come out solid with their label text invisible,
 * edge lines vanish while their (filled) arrowheads stay, and curved edge
 * paths paint black fill wedges. usvg/resvg (the Linux ODT PNG rasterizer)
 * has similarly limited CSS selector support.
 *
 * This pass resolves each element's effective paint the way a browser
 * would — rules matched with specificity + source order, presentation
 * attributes as the lowest cascade layer, inline `style` highest,
 * inheritance through ancestors, `var()` / `currentColor` / CSS-wide
 * keywords resolved — and writes the result onto the element as SVG 1.1
 * presentation attributes, then removes the `<style>` block. Removing it
 * is load-bearing: presentation attributes sit lowest in the cascade, so
 * any rule a consumer *does* partially parse would override them (Mermaid
 * has rule families that paint text the color of its own box).
 *
 * Scope is deliberately narrow and strict. Only the declaration and
 * selector shapes Mermaid emits today are understood (pinned by the
 * upgrade-contract suite); anything else makes the pass a no-op, leaving
 * the SVG exactly as it was — a diagram styled by an un-understood rule is
 * never half-rewritten. `transform`/`scale`/`filter` (the sequence
 * crosshead's `rotate(45deg)`, neo-look drop shadows) are on the skip
 * list: SVG 1.1 presentation attributes cannot express the CSS syntax, and
 * svgio ignores those rules today anyway, so skipping them is not a
 * regression.
 *
 * Runs in the export render tail (renderer.ts), after the label conversion
 * and before `namespaceSvgIds` — the ids the `<style>` selectors reference
 * are still the un-namespaced ones there, and `url(#…)` values written here
 * are rewritten by the namespacing pass like any other attribute.
 * Regression: `__tests__/svg-paint.test.ts` +
 * `__tests__/svg-paint-integration.test.ts`; see .agents/guides/
 * math-mermaid.md, "Mermaid Export Paint Materialization".
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Properties materialized as presentation attributes. Every one of these
 * has SVG 1.1 presentation-attribute syntax (so svgio parses it). All but
 * {@link NON_INHERITED_PROPERTIES} resolve through the ancestor chain
 * exactly like CSS does.
 */
const MATERIALIZED_PROPERTIES = new Set([
  // paint
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "marker-start",
  "marker-mid",
  "marker-end",
  // color / text
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "text-decoration",
  "text-anchor",
  // misc paint/geometry with presentation-attribute syntax
  "opacity",
  "shape-rendering",
  "visibility",
  "display",
  "rx",
  "ry",
  // gradient stops (theme gradients)
  "stop-color",
  "stop-opacity",
]);

/** Non-inherited properties in {@link MATERIALIZED_PROPERTIES}. */
const NON_INHERITED_PROPERTIES = new Set(["opacity", "display", "rx", "ry"]);

/**
 * Write order for {@link MATERIALIZED_PROPERTIES}: the `-opacity`
 * companions first, so a color's `rgba()` alpha (extracted at write time)
 * multiplies onto an already-written opacity instead of being overwritten.
 */
const WRITE_ORDER = [
  "fill-opacity",
  "fill",
  "stroke-opacity",
  "stroke",
  "stop-opacity",
  "stop-color",
];

/**
 * Known but deliberately unmaterialized declarations: HTML-label leftovers
 * (the `foreignObject` content is converted to `<text>` before this pass
 * runs) and CSS-only features SVG 1.1 presentation attributes cannot
 * carry. Matched rules carrying these still apply for the properties above.
 */
const IGNORED_PROPERTIES = new Set([
  // HTML label boxes (foreignObject content)
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-radius",
  "box-shadow",
  "height",
  "justify-content",
  "align-items",
  "line-height",
  "margin",
  "max-width",
  "overflow",
  "padding",
  "position",
  "text-align",
  "vertical-align",
  "white-space",
  "width",
  "z-index",
  // interaction / engine-only paint
  "cursor",
  "pointer-events",
  "animation",
  "-webkit-animation",
  "filter",
  "transform",
  "scale",
]);

/** CSS-wide keywords this pass resolves; see {@link resolveValue}. */
const CSS_WIDE_KEYWORDS = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
]);

/**
 * Dynamic pseudo-classes: their state can never hold in an exported,
 * static document (and must not depend on where the user's pointer happens
 * to be during export), so a selector carrying one never matches.
 */
const DYNAMIC_PSEUDO_CLASSES = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "visited",
  "target",
  "link",
  "any-link",
]);

/** Initial values: the fallback of `initial`/`unset`-resolved declarations. */
const INITIAL_VALUES: Record<string, string> = {
  fill: "black",
  "fill-opacity": "1",
  "fill-rule": "nonzero",
  stroke: "none",
  "stroke-opacity": "1",
  "stroke-width": "1",
  "stroke-dasharray": "none",
  "stroke-dashoffset": "0",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "marker-start": "none",
  "marker-mid": "none",
  "marker-end": "none",
  color: "black",
  "font-size": "medium",
  "font-style": "normal",
  "font-weight": "normal",
  "font-variant": "normal",
  "text-decoration": "none",
  "text-anchor": "start",
  opacity: "1",
  "shape-rendering": "auto",
  visibility: "visible",
  display: "inline",
  rx: "0",
  ry: "0",
  "stop-color": "black",
  "stop-opacity": "1",
};

/**
 * Elements whose *own* paint is meaningless; they are not written to.
 * Children are still processed (marker/defs shapes carry the real paint).
 */
const NON_PAINTED_TAGS = new Set([
  "style",
  "script",
  "defs",
  "title",
  "desc",
  "metadata",
  "linearGradient",
  "radialGradient",
  "pattern",
  "clipPath",
  "mask",
  "filter",
  "symbol",
  "marker",
  "foreignObject",
]);

// ---------------------------------------------------------------------------
// CSS parsing (Mermaid's generated dialect only)
// ---------------------------------------------------------------------------

interface Declaration {
  prop: string;
  value: string;
  important: boolean;
}

/** One compound selector: `tag#id.cls.cls[attr][attr]`. */
interface CompoundSelector {
  tag: string | null;
  id: string | null;
  classes: string[];
  attrs: Array<{ name: string; op: string; value: string }>;
  root: boolean;
}

interface ComplexSelector {
  /** Left-to-right compounds; `combinatorBefore[0]` is unused. */
  compounds: CompoundSelector[];
  combinatorBefore: Array<"" | " " | ">">;
  /** Carries a dynamic pseudo-class — never matches (static export). */
  dynamic: boolean;
  /** CSS specificity (ids, classes+attrs+pseudos, tags). */
  specificity: [number, number, number];
}

interface Rule {
  selectors: ComplexSelector[];
  declarations: Declaration[];
  /** Set when a declaration is outside the understood property set. */
  unknownProperties: boolean;
}

/** Parse result; `null` means "cannot safely flatten" (caller keeps CSS). */
function parseStylesheet(css: string): Rule[] | null {
  const chunks = splitTopLevel(css);
  if (chunks === null) return null;

  const rules: Rule[] = [];
  for (const chunk of chunks) {
    if (chunk.head.startsWith("@")) {
      // `@keyframes` bodies were consumed wholesale by the splitter and
      // carry only animation frames. Anything else is outside the dialect.
      if (/^@(?:-\w+-)?keyframes\b/.test(chunk.head)) continue;
      return null;
    }
    const selectors = parseSelectorList(chunk.head);
    if (!selectors) return null;
    const declarations = parseDeclarations(chunk.body);
    if (!declarations) return null;
    const unknownProperties = declarations.some(
      (d) =>
        !MATERIALIZED_PROPERTIES.has(d.prop) &&
        !IGNORED_PROPERTIES.has(d.prop) &&
        !d.prop.startsWith("--"),
    );
    rules.push({ selectors, declarations, unknownProperties });
  }
  return rules;
}

/**
 * Split CSS text into top-level `{ head { body } }` rules. Comments and
 * strings are respected; at-rule bodies (`@keyframes` frames) are consumed
 * wholesale and their heads reported so the caller can skip them.
 * Statement at-rules (`@import x;`) outside a block are unsupported and
 * fail the split. Returns `null` on unbalanced input.
 */
function splitTopLevel(
  css: string,
): Array<{ head: string; body: string }> | null {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const chunks: Array<{ head: string; body: string }> = [];
  let i = 0;

  const skipToTopLevel = (stop: string[]): number => {
    // Returns the index of the first top-level char in `stop`, or -1.
    let depth = 0;
    let paren = 0;
    let inString: string | null = null;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === "\\") j++;
        else if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }
      if (ch === "(") {
        paren++;
        continue;
      }
      if (ch === ")") {
        paren = Math.max(0, paren - 1);
        continue;
      }
      if (paren !== 0) continue;
      if (stop.includes(ch)) return j;
      if (ch === "{") depth++;
      else if (ch === "}") {
        if (depth === 0) return -1; // unbalanced
        depth--;
      }
    }
    return -1;
  };

  while (i < text.length) {
    if (/[\s;]/.test(text[i])) {
      if (text[i] === ";") {
        // A statement at-rule (`@import …;`) — unsupported.
        if (text.slice(0, i).trim()) return null;
      }
      i++;
      continue;
    }
    const open = skipToTopLevel(["{", ";"]);
    if (open < 0) return text.slice(i).trim() ? null : chunks;
    const head = text.slice(i, open).trim();
    if (text[open] === ";") {
      // Statement at-rule with a non-empty head — unsupported.
      return null;
    }
    if (!head) return null;

    // Find the matching close brace for `open` (bodies nest).
    let depth = 0;
    let inString: string | null = null;
    let close = -1;
    for (let j = open; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === "\\") j++;
        else if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'") inString = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close < 0) return null;
    chunks.push({ head, body: text.slice(open + 1, close) });
    i = close + 1;
  }
  return chunks;
}

/** Parse a declaration block; `null` on anything unparseable. */
function parseDeclarations(body: string): Declaration[] | null {
  const declarations: Declaration[] = [];
  const push = (raw: string): boolean => {
    const text = raw.trim();
    if (!text) return true;
    const colon = topLevelColon(text);
    if (colon <= 0) return false;
    const prop = text.slice(0, colon).trim().toLowerCase();
    let value = text.slice(colon + 1).trim();
    if (!/^-?[\w-]+$/.test(prop) || !value) return false;
    const imp = /\s*!\s*important\s*$/i.exec(value);
    let important = false;
    if (imp) {
      important = true;
      value = value.slice(0, imp.index).trim();
    }
    if (!value) return false;
    declarations.push({ prop, value, important });
    return true;
  };

  let segment = "";
  let paren = 0;
  let inString: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      segment += ch;
      if (ch === "\\") {
        segment += body[i + 1] ?? "";
        i++;
      } else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      segment += ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    if (ch === ";" && paren === 0) {
      if (!push(segment)) return null;
      segment = "";
    } else {
      segment += ch;
    }
  }
  if (inString) return null;
  if (!push(segment)) return null;
  return declarations;
}

/** Index of the first `:` outside parens/strings, or -1. */
function topLevelColon(text: string): number {
  let paren = 0;
  let inString: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") inString = ch;
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === ":" && paren === 0) return i;
  }
  return -1;
}

/** Parse a comma-separated selector list; `null` on unsupported syntax. */
function parseSelectorList(head: string): ComplexSelector[] | null {
  const selectors: ComplexSelector[] = [];
  for (const piece of splitOnTopLevelCommas(head)) {
    const selector = parseComplexSelector(piece.trim());
    if (!selector) return null;
    selectors.push(selector);
  }
  return selectors.length > 0 ? selectors : null;
}

function splitOnTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") inString = ch;
    else if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Parse one complex selector into compound selectors joined by descendant
 * or child combinators. Sibling combinators are outside Mermaid's dialect
 * and fail the parse (the whole pass then no-ops).
 */
function parseComplexSelector(text: string): ComplexSelector | null {
  const compounds: CompoundSelector[] = [];
  const combinatorBefore: Array<"" | " " | ">"> = [];
  const specificity: [number, number, number] = [0, 0, 0];
  let dynamic = false;
  let pending: "" | " " | ">" = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === " ") {
      i++;
      if (compounds.length > 0 && pending === "") pending = " ";
      continue;
    }
    if (text[i] === ">") {
      if (compounds.length === 0) return null;
      pending = ">";
      i++;
      continue;
    }
    if (text[i] === "+" || text[i] === "~") return null;

    const compound: CompoundSelector = {
      tag: null,
      id: null,
      classes: [],
      attrs: [],
      root: false,
    };
    const start = i;

    const tagMatch = /^([\w-]+|\*)/.exec(text.slice(i));
    if (tagMatch) {
      compound.tag = tagMatch[1];
      i += tagMatch[1].length;
      specificity[2]++;
    }
    while (i < text.length && ".#[:".includes(text[i])) {
      const ch = text[i];
      if (ch === "#") {
        const m = /^#([\w-]+)/.exec(text.slice(i));
        if (!m) return null;
        compound.id = m[1];
        i += m[0].length;
        specificity[0]++;
      } else if (ch === ".") {
        const m = /^\.([\w-]+)/.exec(text.slice(i));
        if (!m) return null;
        compound.classes.push(m[1]);
        i += m[0].length;
        specificity[1]++;
      } else if (ch === "[") {
        const end = text.indexOf("]", i);
        if (end < 0) return null;
        const attr = parseAttributeSelector(text.slice(i + 1, end));
        if (!attr) return null;
        compound.attrs.push(attr);
        i = end + 1;
        specificity[1]++;
      } else {
        const rootMatch = /^:root\b/.exec(text.slice(i));
        if (rootMatch) {
          compound.root = true;
          i += rootMatch[0].length;
          specificity[1]++;
          continue;
        }
        const dyn = /^:([\w-]+)/.exec(text.slice(i));
        if (dyn && DYNAMIC_PSEUDO_CLASSES.has(dyn[1])) {
          dynamic = true;
          i += dyn[0].length;
          continue;
        }
        return null;
      }
    }
    if (i === start) return null;
    compounds.push(compound);
    combinatorBefore.push(pending);
    pending = "";
  }
  if (compounds.length === 0 || pending !== "") return null;
  return { compounds, combinatorBefore, dynamic, specificity };
}

function parseAttributeSelector(
  body: string,
): { name: string; op: string; value: string } | null {
  const m =
    /^\s*([\w-]+)\s*(?:([$*~|^]?=)\s*(?:(["'])(.*?)\3|([^\s\]]+))\s*|\s*)$/.exec(
      body,
    );
  if (!m) return null;
  return { name: m[1], op: m[2] ?? "", value: m[4] ?? m[5] ?? "" };
}

// ---------------------------------------------------------------------------
// Selector matching (right-to-left over the ancestor chain)
// ---------------------------------------------------------------------------

function matchesCompound(compound: CompoundSelector, el: Element): boolean {
  if (compound.root && el.parentNode?.parentNode != null) return false;
  if (compound.tag && compound.tag !== "*") {
    if (el.localName !== compound.tag) return false;
  }
  if (compound.id && el.getAttribute("id") !== compound.id) return false;
  if (compound.classes.length > 0) {
    const classes = (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean);
    for (const cls of compound.classes) {
      if (!classes.includes(cls)) return false;
    }
  }
  for (const attr of compound.attrs) {
    const value = el.getAttribute(attr.name);
    if (value === null) return false;
    if (!attr.op) continue;
    if (attr.op === "=") {
      if (value !== attr.value) return false;
    } else if (attr.op === "$=") {
      if (!value.endsWith(attr.value)) return false;
    } else if (attr.op === "^=") {
      if (!value.startsWith(attr.value)) return false;
    } else if (attr.op === "*=") {
      if (!value.includes(attr.value)) return false;
    } else if (attr.op === "~=") {
      if (!value.split(/\s+/).includes(attr.value)) return false;
    } else if (attr.op === "|=") {
      if (value !== attr.value && !value.startsWith(`${attr.value}-`)) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
}

function matchesSelector(selector: ComplexSelector, el: Element): boolean {
  if (selector.dynamic) return false;
  const { compounds, combinatorBefore } = selector;

  const matchFrom = (index: number, target: Element | null): boolean => {
    if (target === null) return false;
    if (!matchesCompound(compounds[index], target)) return false;
    if (index === 0) return true;
    if (combinatorBefore[index] === ">") {
      return matchFrom(index - 1, target.parentElement);
    }
    for (
      let ancestor = target.parentElement;
      ancestor !== null;
      ancestor = ancestor.parentElement
    ) {
      if (matchFrom(index - 1, ancestor)) return true;
    }
    return false;
  };

  return matchFrom(compounds.length - 1, el);
}

// ---------------------------------------------------------------------------
// Cascade + value resolution
// ---------------------------------------------------------------------------

interface ResolvedDeclaration {
  value: string;
  /** True when the value traces back to a `<style>` rule (own or inherited). */
  fromRule: boolean;
}

type Resolver = (el: Element, prop: string) => ResolvedDeclaration | null;

/** Selector matching, memoized: the cascade asks per element × property. */
type Matcher = (selector: ComplexSelector, el: Element) => boolean;

/**
 * Flatten Mermaid's `<style>` CSS into SVG presentation attributes and
 * remove the `<style>` block. Returns the input unchanged when the
 * stylesheet contains anything outside the understood dialect (see the
 * module docstring) — the diagram then keeps whatever the consumer's own
 * CSS handling does with it, which is today's behavior.
 */
export function materializeSvgPaint(svg: string): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svg;
  }
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return svg;
  const root = doc.documentElement;
  if (root.localName !== "svg") return svg;

  const styleElements = Array.from(doc.getElementsByTagName("style"));
  const css = styleElements.map((el) => el.textContent ?? "").join("\n");
  if (!css.trim()) return svg;

  const rules = parseStylesheet(css);
  if (rules === null) return svg;

  // Resolve every paintable element in the SVG namespace. HTML inside
  // `<foreignObject>` (converted away before this pass runs) is skipped:
  // its paint is HTML paint, not SVG presentation attributes.
  const elements = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => el.namespaceURI === SVG_NS && !NON_PAINTED_TAGS.has(el.localName),
  );

  // A rule with an un-understood property may never apply to an SVG shape;
  // if it does, flattening cannot be trusted and the whole pass no-ops.
  const matchCache = new Map<Element, Map<ComplexSelector, boolean>>();
  const matches: Matcher = (selector, el) => {
    let bySelector = matchCache.get(el);
    if (!bySelector) {
      bySelector = new Map();
      matchCache.set(el, bySelector);
    }
    const cached = bySelector.get(selector);
    if (cached !== undefined) return cached;
    const result = matchesSelector(selector, el);
    bySelector.set(selector, result);
    return result;
  };
  for (const rule of rules) {
    if (!rule.unknownProperties) continue;
    if (elements.some((el) => rule.selectors.some((s) => matches(s, el)))) {
      return svg;
    }
  }

  const inlineProps = new Map<Element, Set<string>>();
  for (const el of elements) {
    const inline = el.getAttribute("style");
    if (!inline) continue;
    const props = new Set<string>();
    for (const part of inline.split(";")) {
      const colon = part.indexOf(":");
      if (colon > 0) props.add(part.slice(0, colon).trim().toLowerCase());
    }
    inlineProps.set(el, props);
  }

  const resolve = makeCascadeResolver(rules, matches);
  const writeOrder = [
    ...WRITE_ORDER,
    ...[...MATERIALIZED_PROPERTIES].filter((p) => !WRITE_ORDER.includes(p)),
  ];

  for (const el of elements) {
    const protectedProps = inlineProps.get(el) ?? new Set<string>();
    for (const prop of writeOrder) {
      if (protectedProps.has(prop)) continue;
      const resolved = resolve(el, prop);
      if (!resolved?.fromRule) continue;
      writeProperty(el, prop, resolved.value);
    }
  }

  for (const styleEl of styleElements) styleEl.remove();
  return new XMLSerializer().serializeToString(doc);
}

function makeCascadeResolver(rules: Rule[], matches: Matcher): Resolver {
  const cache = new Map<Element, Map<string, ResolvedDeclaration | null>>();

  /** Winning declaration for `prop` on `el` itself (not inherited). */
  const ownDeclaration = (el: Element, prop: string): Declaration | null => {
    const inline = el.getAttribute("style");
    if (inline) {
      for (const part of inline.split(";")) {
        const colon = part.indexOf(":");
        if (colon <= 0) continue;
        if (part.slice(0, colon).trim().toLowerCase() !== prop) continue;
        let value = part.slice(colon + 1).trim();
        const imp = /\s*!\s*important\s*$/i.exec(value);
        if (imp) value = value.slice(0, imp.index).trim();
        // Inline style is the top cascade layer — but if the value is a
        // CSS-wide keyword the layer below may still supply the value.
        if (value && !CSS_WIDE_KEYWORDS.has(value)) {
          return { prop, value, important: true };
        }
      }
    }
    let best: Declaration | null = null;
    let bestScore = -1;
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (!matches(selector, el)) continue;
        for (const decl of rule.declarations) {
          if (decl.prop !== prop) continue;
          const score =
            (decl.important ? 1_000_000 : 0) +
            selector.specificity[0] * 10_000 +
            selector.specificity[1] * 100 +
            selector.specificity[2];
          // Ties keep the later declaration (source order).
          if (score >= bestScore) {
            bestScore = score;
            best = decl;
          }
        }
      }
    }
    if (best) return best;
    // Presentation attributes are the lowest cascade layer.
    const attr = el.getAttribute(prop);
    return attr === null ? null : { prop, value: attr, important: false };
  };

  /** Whether a CSS rule (any specificity) declares `prop` for `el`. */
  const ruleDeclares = (el: Element, prop: string): boolean => {
    for (const rule of rules) {
      if (!rule.declarations.some((d) => d.prop === prop)) continue;
      if (rule.selectors.some((s) => matches(s, el))) return true;
    }
    return false;
  };

  const resolve: Resolver = (el, prop) => {
    let byProp = cache.get(el);
    if (!byProp) {
      byProp = new Map();
      cache.set(el, byProp);
    }
    if (byProp.has(prop)) return byProp.get(prop) ?? null;

    const inherited = !NON_INHERITED_PROPERTIES.has(prop);
    let result: ResolvedDeclaration | null = null;

    const own = ownDeclaration(el, prop);
    if (own) {
      const value = resolveValue(own.value, prop, el, resolve, inherited);
      if (value !== null) {
        result = { value, fromRule: ruleDeclares(el, prop) };
      }
    }
    if (result === null && el.parentElement) {
      const parent = resolve(el.parentElement, prop);
      if (parent) result = parent;
    }

    byProp.set(prop, result);
    return result;
  };

  return resolve;
}

/**
 * Resolve one declaration value: expand `var()`, CSS-wide keywords and
 * `currentColor`, and normalize `rgba()` to SVG 1.1. Returns `null` when
 * the value cannot be resolved to a single literal (the property is then
 * left unmaterialized).
 */
function resolveValue(
  raw: string,
  prop: string,
  el: Element,
  resolve: Resolver,
  inherited: boolean,
): string | null {
  const expanded = expandVars(raw.trim(), el, resolve);
  if (expanded === null) return null;

  const value = expanded.trim();
  if (CSS_WIDE_KEYWORDS.has(value)) {
    if (value === "initial") return INITIAL_VALUES[prop] ?? null;
    if (value === "revert" || value === "revert-layer") {
      // Mermaid's `stroke: revert` (label-icon paths) means "back to the
      // default origin" — closest deterministic approximation.
      return INITIAL_VALUES[prop] ?? null;
    }
    // `inherit` — explicit, valid for any property; `unset` — inherit for
    // inherited properties, initial otherwise.
    if (value === "inherit" || inherited) {
      const parent = el.parentElement;
      if (parent) {
        const ancestor = resolve(parent, prop);
        if (ancestor) return ancestor.value;
      }
    }
    return INITIAL_VALUES[prop] ?? null;
  }
  if (value === "currentColor" && prop !== "color") {
    const color = resolve(el, "color");
    if (color && color.value !== "currentColor") return color.value;
  }
  // `rgba()` normalization happens at write time (writeProperty), where
  // the alpha can still be combined into the -opacity companion attribute.
  return value;
}

/**
 * Expand `var(--x[, fallback])` using the element's inherited custom
 * properties. Returns `null` when a variable is unresolvable and has no
 * fallback (the declaration is invalid at computed-value time).
 */
function expandVars(
  value: string,
  el: Element,
  resolve: Resolver,
  depth = 0,
): string | null {
  if (depth > 8) return null;
  let out = "";
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf("var(", i);
    if (start < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, start);
    const end = findClosingParen(value, start + 3);
    if (end < 0) return null;
    const inner = value.slice(start + 4, end);
    const parts = splitOnTopLevelCommas(inner);
    const name = parts[0]?.trim() ?? "";
    const fallback =
      parts.length > 1
        ? expandVars(parts.slice(1).join(","), el, resolve, depth + 1)
        : null;
    const resolved = name.startsWith("--")
      ? (resolve(el, name)?.value ?? null)
      : null;
    const replacement = resolved ?? fallback;
    if (replacement === null) return null;
    out += replacement;
    i = end + 1;
  }
  return out;
}

function findClosingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse a CSS `rgb()`/`rgba()`/`hsl()`/`hsla()` color into channels, or
 * `null` for any other value (hex, keywords, `url(…)`, `none`, …).
 */
function parseFunctionalColor(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const rgb =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/.exec(
      value,
    );
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : parseFloat(rgb[4]);
    return {
      r: channel(rgb[1]),
      g: channel(rgb[2]),
      b: channel(rgb[3]),
      a: clamp01(alpha),
    };
  }
  const hsl =
    /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+)\s*)?\)$/.exec(
      value,
    );
  if (hsl) {
    const alpha = hsl[4] === undefined ? 1 : parseFloat(hsl[4]);
    const { r, g, b } = hslToRgb(
      ((parseFloat(hsl[1]) % 360) + 360) % 360,
      clamp01(parseFloat(hsl[2]) / 100),
      clamp01(parseFloat(hsl[3]) / 100),
    );
    return { r, g, b, a: clamp01(alpha) };
  }
  return null;
}

const channel = (v: string): number =>
  Math.min(255, Math.max(0, Math.round(parseFloat(v))));

const clamp01 = (v: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * `rgba()`/`hsla()` are CSS Color syntax that SVG 1.1 paint attributes do
 * not accept (LibreOffice's svgio parses SVG 1.1), so alpha moves to
 * `fill-opacity` / `stroke-opacity` / `stop-opacity` and the color becomes
 * `#rrggbb` — the same contract as fo-labels' `applyFill`. Other values
 * pass through unchanged.
 */
function normalizeColorValue(value: string, prop: string): string {
  if (
    prop !== "fill" &&
    prop !== "stroke" &&
    prop !== "stop-color" &&
    prop !== "color"
  ) {
    return value;
  }
  const parsed = parseFunctionalColor(value);
  if (!parsed) return value;
  const hex = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${hex(parsed.r)}${hex(parsed.g)}${hex(parsed.b)}`;
}

function writeProperty(el: Element, prop: string, value: string): void {
  if (!value) return;

  // Extract a trailing alpha from the value's functional form before it
  // normalizes away, and multiply it onto the -opacity companion
  // (effective alpha = color alpha × fill-opacity, per SVG).
  const alpha = parseFunctionalColor(value)?.a ?? 1;

  el.setAttribute(prop, normalizeColorValue(value, prop));

  if (
    alpha < 1 &&
    (prop === "fill" || prop === "stroke" || prop === "stop-color")
  ) {
    const opacityProp = `${prop}-opacity`;
    const existing = el.getAttribute(opacityProp);
    const combined = existing === null ? alpha : parseFloat(existing) * alpha;
    if (Number.isFinite(combined)) {
      el.setAttribute(opacityProp, String(combined));
    }
  }
}
