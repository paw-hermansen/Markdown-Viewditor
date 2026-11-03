/**
 * MathML → OMML converter (EXPORT-PLAN 8.7).
 *
 * KaTeX renders math to HTML + MathML; native DOCX equations are OMML
 * (`m:oMath`). This module maps the presentation-MathML subset KaTeX emits
 * onto OMML constructs. It is deliberately conservative: **anything it cannot
 * map confidently returns `null`** for that equation and the caller degrades
 * to escaped TeX source plus a warning (the same contract as the ODT
 * exporter's MathML failure path — no silent PNG fallback).
 *
 * The parser is a small purpose-built reader (no DOM): the export tests run
 * in a node environment without `DOMParser`, and KaTeX's MathML is regular
 * enough that a tag/attribute/text scanner is the safer, deterministic tool.
 *
 * OMML element order is schema-enforced (compatibility rule 2) — the emitted
 * fragments follow CT_* sequences (e.g. `m:sSup`: sSupPr?, e, sup).
 */

export interface MathmlNode {
  /** Local name without namespace prefix (`mrow`, `mi`, …). */
  name: string;
  attrs: Record<string, string>;
  children: Array<MathmlNode | string>;
}

/* ────────────────────────────── parsing ───────────────────────────────── */

const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => NAMED_ENTITIES[m] ?? m);
}

function localName(tag: string): string {
  const i = tag.indexOf(":");
  return i >= 0 ? tag.slice(i + 1) : tag;
}

export function parseMathml(xml: string): MathmlNode | null {
  const stack: MathmlNode[] = [];
  let root: MathmlNode | null = null;
  const re = /<[^>]*>|[^<]+/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const tok = m[0];
    if (tok.startsWith("<")) {
      const inner = tok.slice(1, -1);
      if (inner.startsWith("?") || inner.startsWith("!")) continue;
      if (inner.startsWith("/")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const selfClosing = inner.endsWith("/");
      const body = selfClosing ? inner.slice(0, -1) : inner;
      const nameMatch = body.match(/^[:\w.-]+/);
      if (!nameMatch) continue;
      const node: MathmlNode = {
        name: localName(nameMatch[0]),
        attrs: {},
        children: [],
      };
      const attrRe = /([:\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(body)) !== null) {
        node.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? "");
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else if (!root) root = node;
      if (!selfClosing) stack.push(node);
    } else {
      const text = decodeEntities(tok);
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(text);
    }
  }
  return root;
}

/* ────────────────────────────── converting ────────────────────────────── */

interface State {
  /** `menclose notation="…strike…"` — runs carry `w:strike`. */
  strike?: boolean;
}

function isNode(x: MathmlNode | string): x is MathmlNode {
  return typeof x !== "string";
}

/** Concatenated text content of a leaf node. */
function textOf(node: MathmlNode): string {
  let out = "";
  for (const c of node.children) {
    if (typeof c === "string") out += c;
    else out += textOf(c);
  }
  return out;
}

function mRun(text: string, state: State, node: MathmlNode): string {
  const mv = node.attrs.mathvariant ?? "";
  let sty = "p";
  let scr: string | null = null;
  if (mv === "italic") sty = "i";
  else if (mv === "bold") sty = "b";
  else if (mv === "bold-italic") sty = "bi";
  else if (mv === "normal") sty = "p";
  else if (
    /^(bold-)?(double-struck|fraktur|script|sans-serif|monospace)$/.test(mv)
  ) {
    scr = mv.replace(/^bold-/, "");
    sty = mv.startsWith("bold-") ? "b" : "p";
  } else if (node.name === "mi") {
    // Multi-character identifiers (sin, lim, log) are upright; single
    // letters are the italic math variables Word expects.
    sty = textOf(node).length > 1 ? "p" : "i";
  }
  const rPr =
    "<m:rPr>" +
    (scr ? `<m:scr m:val="${scr}"/>` : "") +
    `<m:sty m:val="${sty}"/>` +
    "</m:rPr>";
  const wRpr = state.strike ? "<w:rPr><w:strike/></w:rPr>" : "";
  return `<m:r>${rPr}${wRpr}<m:t xml:space="preserve">${escape(text)}</m:t></m:r>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Delimiter pairs recognized around an `mrow` (and `mfenced`). */
const CLOSE_TO_OPEN: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
  "⟩": "⟨",
  "〉": "〈",
  "⟫": "⟪",
  "⟧": "⟦",
  "⌉": "⌈",
  "⌋": "⌊",
  "⌝": "⌜",
  "⟯": "⟮",
  "|": "|",
  "‖": "‖",
};

function mDelimiter(open: string, close: string, inner: string): string {
  return (
    `<m:d><m:dPr><m:begChr m:val="${escape(open)}"/>` +
    `<m:endChr m:val="${escape(close)}"/></m:dPr>` +
    `<m:e>${inner}</m:e></m:d>`
  );
}

function compact(
  children: Array<MathmlNode | string>,
): Array<MathmlNode | string> {
  return children.filter((c) => isNode(c) || c.trim() !== "");
}

function convertSeq(
  children: Array<MathmlNode | string>,
  state: State,
): string | null {
  let out = "";
  for (const c of children) {
    if (typeof c === "string") {
      if (c.trim() === "") continue;
      // Stray text at sequence level becomes a plain run.
      out += mRun(c, state, { name: "mtext", attrs: {}, children: [c] });
      continue;
    }
    const xml = convertNode(c, state);
    if (xml === null) return null;
    out += xml;
  }
  return out;
}

function convertNode(node: MathmlNode, state: State): string | null {
  switch (node.name) {
    case "math":
      return convertSeq(node.children, state);

    case "mrow": {
      // `mstyle`, `merror`, `mpadded`, `mphantom` are transparent wrappers
      // too — KaTeX only uses mstyle for fontsize, which OMML sizes from the
      // document anyway.
    }
    // fallthrough to the shared wrapper logic below
    case "mstyle":
    case "merror":
    case "mpadded":
    case "mphantom": {
      const kids = compact(node.children);
      if (node.name === "mrow" && kids.length >= 2) {
        const first = kids[0];
        const last = kids[kids.length - 1];
        if (
          isNode(first) &&
          first.name === "mo" &&
          isNode(last) &&
          last.name === "mo"
        ) {
          const open = textOf(first);
          const close = textOf(last);
          if (CLOSE_TO_OPEN[close] === open) {
            const inner = convertSeq(kids.slice(1, -1), state);
            if (inner === null) return null;
            return mDelimiter(open, close, inner);
          }
        }
      }
      return convertSeq(node.children, state);
    }

    case "mi":
    case "mn":
    case "mo":
    case "mtext":
    case "ms": {
      const text = textOf(node);
      if (text === "") return "";
      return mRun(text, state, node);
    }

    case "mspace":
      return '<m:r><m:t xml:space="preserve"> </m:t></m:r>';

    case "msup": {
      const kids = compact(node.children);
      const base = convertNode(kids[0] as MathmlNode, state) ?? "";
      if (kids.length < 2) return null;
      const sup = convertNode(kids[1] as MathmlNode, state);
      if (sup === null) return null;
      return `<m:sSup><m:e>${base}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
    }

    case "msub": {
      const kids = compact(node.children);
      if (kids.length < 2) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const sub = convertNode(kids[1] as MathmlNode, state);
      if (base === null || sub === null) return null;
      return `<m:sSub><m:e>${base}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
    }

    case "msubsup": {
      const kids = compact(node.children);
      if (kids.length < 3) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const sub = convertNode(kids[1] as MathmlNode, state);
      const sup = convertNode(kids[2] as MathmlNode, state);
      if (base === null || sub === null || sup === null) return null;
      return (
        `<m:sSubSup><m:e>${base}</m:e>` +
        `<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`
      );
    }

    case "mfrac": {
      const kids = compact(node.children);
      if (kids.length < 2) return null;
      const num = convertNode(kids[0] as MathmlNode, state);
      const den = convertNode(kids[1] as MathmlNode, state);
      if (num === null || den === null) return null;
      return `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
    }

    case "msqrt": {
      const inner = convertSeq(node.children, state);
      if (inner === null) return null;
      return (
        '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr>' +
        `<m:deg/><m:e>${inner}</m:e></m:rad>`
      );
    }

    case "mroot": {
      const kids = compact(node.children);
      if (kids.length < 2) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const index = convertNode(kids[1] as MathmlNode, state);
      if (base === null || index === null) return null;
      return `<m:rad><m:deg>${index}</m:deg><m:e>${base}</m:e></m:rad>`;
    }

    case "munder": {
      const kids = compact(node.children);
      if (kids.length < 2) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const under = kids[1];
      if (base === null) return null;
      // \underbrace and friends: accent under → OMML groupChr.
      if (node.attrs.accentunder === "true" && isNode(under)) {
        const chr = textOf(under);
        const e = convertNode(under, state);
        if (chr && e !== null) {
          return (
            "<m:groupChr><m:groupChrPr>" +
            `<m:chr m:val="${escape(chr)}"/><m:pos m:val="bot"/>` +
            `</m:groupChrPr><m:e>${base}</m:e></m:groupChr>`
          );
        }
      }
      const lim = isNode(under)
        ? convertNode(under, state)
        : convertSeq([under], state);
      if (lim === null) return null;
      return `<m:limLow><m:e>${base}</m:e><m:lim>${lim}</m:lim></m:limLow>`;
    }

    case "mover": {
      const kids = compact(node.children);
      if (kids.length < 2) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const over = kids[1];
      if (base === null) return null;
      // \hat, \overrightarrow, \overbrace: accent over → OMML m:acc.
      if (node.attrs.accent === "true" && isNode(over)) {
        const chr = textOf(over);
        if (chr) {
          return (
            "<m:acc><m:accPr>" +
            `<m:chr m:val="${escape(chr)}"/></m:accPr>` +
            `<m:e>${base}</m:e></m:acc>`
          );
        }
      }
      const lim = isNode(over)
        ? convertNode(over, state)
        : convertSeq([over], state);
      if (lim === null) return null;
      return `<m:limUpp><m:e>${base}</m:e><m:lim>${lim}</m:lim></m:limUpp>`;
    }

    case "munderover": {
      const kids = compact(node.children);
      if (kids.length < 3) return null;
      const base = convertNode(kids[0] as MathmlNode, state);
      const under = convertNode(kids[1] as MathmlNode, state);
      const over = convertNode(kids[2] as MathmlNode, state);
      if (base === null || under === null || over === null) return null;
      return (
        `<m:limUpp><m:e><m:limLow><m:e>${base}</m:e>` +
        `<m:lim>${under}</m:lim></m:limLow></m:e>` +
        `<m:lim>${over}</m:lim></m:limUpp>`
      );
    }

    case "mtable": {
      const rows = node.children.filter(
        (c): c is MathmlNode => isNode(c) && c.name === "mtr",
      );
      if (rows.length === 0) return null;
      const cellsOf = (row: MathmlNode): MathmlNode[] =>
        compact(row.children).filter(
          (c): c is MathmlNode => isNode(c) && c.name === "mtd",
        );
      const singleColumn = rows.every((r) => cellsOf(r).length <= 1);
      if (singleColumn) {
        // cases / piecewise / eqnarray → OMML equation array.
        let out = "<m:eqArr>";
        for (const row of rows) {
          const cell = cellsOf(row)[0];
          const xml = cell ? convertSeq(cell.children, state) : "";
          if (xml === null) return null;
          out += `<m:e>${xml ?? ""}</m:e>`;
        }
        return out + "</m:eqArr>";
      }
      let out = "<m:m>";
      for (const row of rows) {
        out += "<m:mr>";
        for (const cell of cellsOf(row)) {
          const xml = convertSeq(cell.children, state);
          if (xml === null) return null;
          out += `<m:e>${xml}</m:e>`;
        }
        out += "</m:mr>";
      }
      return out + "</m:m>";
    }

    case "mfenced": {
      const open = node.attrs.open ?? "(";
      const close = node.attrs.close ?? ")";
      const seps = (node.attrs.separator ?? ",").trim();
      const kids = compact(node.children);
      let out =
        `<m:d><m:dPr><m:begChr m:val="${escape(open)}"/>` +
        `<m:endChr m:val="${escape(close)}"/></m:dPr>`;
      if (seps === "" || kids.length <= 1) {
        const inner = convertSeq(node.children, state);
        if (inner === null) return null;
        return out + `<m:e>${inner}</m:e></m:d>`;
      }
      for (const kid of kids) {
        const xml = isNode(kid)
          ? convertNode(kid, state)
          : convertSeq([kid], state);
        if (xml === null) return null;
        out += `<m:e>${xml}</m:e>`;
      }
      return out + "</m:d>";
    }

    case "semantics": {
      const first = node.children.find(
        (c) =>
          isNode(c) && c.name !== "annotation" && c.name !== "annotation-xml",
      );
      return first && isNode(first) ? convertNode(first, state) : null;
    }

    case "annotation":
    case "annotation-xml":
    case "malignmark":
    case "maligngroup":
      return "";

    case "menclose": {
      // Strike-through enclosures map to struck runs (m:r carries w:rPr).
      // Other notations (box, updiagonal, …) have no faithful OMML form —
      // render the content plain rather than fail the whole equation.
      const notation = node.attrs.notation ?? "";
      return convertSeq(node.children, {
        ...state,
        strike: state.strike || notation.includes("strike"),
      });
    }

    default:
      // Unknown construct — caller degrades to escaped TeX.
      return null;
  }
}

/**
 * Convert a KaTeX MathML `<math>…</math>` string to OMML — the inner content
 * of `m:oMath` (the caller wraps it for inline vs display). Returns `null`
 * when any construct has no faithful OMML mapping.
 */
export function mathmlToOmml(mathml: string): string | null {
  try {
    const root = parseMathml(mathml);
    if (!root) return null;
    return convertSeq(root.children, {});
  } catch {
    return null;
  }
}
