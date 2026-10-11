/**
 * foreignObject label → standalone SVG conversion for the export/print
 * pipelines.
 *
 * The viewer renders Mermaid labels as HTML inside `<foreignObject>`
 * (centered `table-cell` divs). Standalone-SVG consumers cannot render
 * those: usvg/resvg (Linux ODT PNG rasterization) and LibreOffice svgio
 * (vector SVG in ODT) drop `<foreignObject>` outright, and the WKWebView
 * PDF capture mis-scales it under CSS scaling (webkit.org/show_bug.cgi?id=279041).
 *
 * Mermaid's own `htmlLabels: false` text-label dialect is not a faithful
 * substitute — this is the root cause of the historical ODT label bugs:
 * node labels lose their CSS centering (mindmap drops its
 * `mindmap-node-label` class, state's `centerLabel` translate includes
 * min-width padding so text hugs the left edge, ER/mindmap-root labels sit
 * at `translate(0, …)` with start-anchored text so they spill right), and
 * journey's `<switch>` fallback `<text>` inherits the *section box* fill
 * (`class="section-type-0"`), rendering the label invisibly.
 *
 * This pass instead converts the viewer's label layout to plain SVG using
 * geometry measured from the live DOM, so exported diagrams show what the
 * app shows:
 *
 *   - Text runs become one `<text>` per rendered line, `text-anchor="middle"`
 *     at the measured line center, with the alphabetic baseline at the
 *     measured baseline. Centering is therefore self-consistent in every
 *     renderer even when the consumer resolves a different fallback font.
 *     Per-run `<tspan>`s carry computed font-weight/style/family/decoration
 *     and fill, so bold/italic/code spans survive. All of it is written as
 *     inline `style` so Mermaid's class CSS can never restyle it.
 *   - Inline `<svg>` icons (`fa:fa-*` labels) are cloned in place with
 *     `currentColor` materialized to the computed label color.
 *   - KaTeX in labels (`$$…$$`; the export config sets `forceLegacyMathML`
 *     so Mermaid emits KaTeX *HTML*, which html2canvas can paint) is
 *     captured as a PNG and embedded as an `<image>` at its measured box.
 *     If capture fails, the formula degrades to its plain text.
 *
 * Everything is measured in client px and mapped into SVG user units
 * through the foreignObject's own box, so app zoom and any display scaling
 * of the SVG cancel out (both sides of every ratio come from
 * `getBoundingClientRect`, see the same argument in `export/math-fit.ts`).
 *
 * Environments without layout (jsdom tests, DOM-less) degrade to a plain
 * `<text>` per label placed at the foreignObject box center — labels
 * survive, positioned far better than Mermaid's text dialect, without any
 * measurement.
 */

/** Client-pixel rectangle (viewport coordinates). */
export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Computed text style of one run, in export-fidelity form. */
export interface RunStyle {
  fontFamily: string | null;
  /** Declared font size in CSS px (zoom-normalized). */
  fontSizePx: number;
  fontWeight: string | null;
  fontStyle: string | null;
  textDecoration: string | null;
  color: string | null;
}

/** Measurement seam — injectable so tests can run without layout. */
export interface FoLabelMetrics {
  /** Viewport rect of an element, or null when unmeasurable. */
  elementRect(el: Element): LabelRect | null;
  /** Viewport rects of a range's rendered text fragments (one per line). */
  rangeRects(range: Range): LabelRect[];
  /** Computed run style of an element. */
  runStyle(el: Element): RunStyle;
  /**
   * Baseline position as a fraction of a text run's content-box height
   * (0 = top of the box, 1 = bottom), for `style`'s font. The alphabetic
   * baseline of a run is `rect.y + rect.height * ratio`, which keeps the
   * value independent of zoom and SVG display scaling.
   */
  baselineRatio(style: RunStyle): number | null;
  /** Computed background color of an element (transparent → null). */
  backgroundOf(el: Element): string | null;
}

/** Rasterizes an already-laid-out HTML element (e.g. KaTeX) to a PNG. */
export type HtmlRasterizer = (
  el: HTMLElement,
) => Promise<{ dataUri: string; widthPx: number; heightPx: number } | null>;

export interface ConvertOptions {
  /** Overrides the DOM measurement seam (tests). `null` forces the
   *  measurement-free fallback placement. */
  metrics?: FoLabelMetrics | null;
  /** Overrides the KaTeX rasterizer (tests). */
  rasterizeHtml?: HtmlRasterizer | null;
}

const SVG_NS = "http://www.w3.org/2000/svg";

type TextItem = {
  kind: "text";
  node: Text;
  text: string;
  style: RunStyle;
  rect: LabelRect;
};

type MediaItem = {
  kind: "icon" | "math" | "mathml";
  el: Element;
  rect: LabelRect | null;
};

type Item = TextItem | MediaItem;

/**
 * Convert every `<foreignObject>` label in `svg` into standalone SVG text,
 * icons, and images measured from a live DOM host. Returns `svg` unchanged
 * when there is no DOM, no foreignObject, or the DOM cannot be parsed.
 */
export async function convertForeignObjectLabels(
  svg: string,
  options: ConvertOptions = {},
): Promise<string> {
  if (!/foreignObject/i.test(svg)) return svg;
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return svg;
  }

  const host = document.createElement("div");
  // Off-screen but *rendered*: html2canvas respects `visibility: hidden` and
  // would capture blank KaTeX images, so hide by position only (same pattern
  // as math-render.ts's capture host).
  host.style.cssText = "position:fixed;left:-99999px;top:0;pointer-events:none";
  host.style.width = `${naturalSvgWidth(svg)}px`;
  host.innerHTML = svg;
  const svgEl = host.querySelector("svg");
  if (!svgEl) return svg;

  // Match the viewer's font context so `font-family: inherit` labels (print
  // variant) measure and wrap exactly like they do inside `#viewer-content`.
  try {
    const reference =
      document.getElementById("viewer-content") ?? document.body;
    if (reference) {
      const cs = getComputedStyle(reference);
      host.style.fontFamily = cs.fontFamily;
      host.style.fontSize = cs.fontSize;
      host.style.color = cs.color;
    }
  } catch {
    // No getComputedStyle — the fallback placement does not need it.
  }

  document.body.appendChild(host);
  try {
    const metrics =
      options.metrics !== undefined ? options.metrics : safeMetrics();
    const rasterizeHtml = options.rasterizeHtml ?? defaultRasterizer;
    let changed = false;
    for (const fo of Array.from(svgEl.querySelectorAll("foreignObject"))) {
      // Only top-level labels (a foreignObject inside a foreignObject is not
      // a Mermaid label).
      if (fo.querySelector("foreignObject")) continue;
      const replacement = await buildReplacement(fo, metrics, rasterizeHtml);
      const target =
        fo.parentElement?.tagName.toLowerCase() === "switch"
          ? fo.parentElement
          : fo;
      target.replaceWith(replacement);
      changed = true;
    }
    return changed ? host.innerHTML : svg;
  } finally {
    host.remove();
  }
}

/* ──────────────────── label construction ─────────────────────────────── */

async function buildReplacement(
  fo: Element,
  metrics: FoLabelMetrics | null,
  rasterizeHtml: HtmlRasterizer,
): Promise<DocumentFragment> {
  const fragment = document.createDocumentFragment();
  const foRect = metrics?.elementRect(fo) ?? null;
  const box = foreignObjectBox(fo);
  const measurable =
    metrics !== null &&
    foRect !== null &&
    foRect.width > 0 &&
    foRect.height > 0 &&
    box.width > 0 &&
    box.height > 0;

  if (!measurable || !metrics || !foRect) {
    // No layout: keep the label as plain centered text at the foreignObject
    // box. Better than Mermaid's text dialect and always better than a
    // dropped label.
    const fallback = fallbackLabel(fo, box);
    if (fallback) fragment.appendChild(fallback);
    return fragment;
  }

  const scaleX = box.width / foRect.width;
  const scaleY = box.height / foRect.height;
  const toUserX = (clientX: number) => box.x + (clientX - foRect.x) * scaleX;
  const toUserY = (clientY: number) => box.y + (clientY - foRect.y) * scaleY;
  const toUserRect = (r: LabelRect): LabelRect => ({
    x: toUserX(r.x),
    y: toUserY(r.y),
    width: r.width * scaleX,
    height: r.height * scaleY,
  });

  // Label background (Mermaid's `labelBkg` div) as a plain rect behind text.
  const background = backgroundRect(fo, metrics, toUserRect);
  if (background) fragment.appendChild(background);

  const items = collectItems(fo, metrics);
  let segment: TextItem[] = [];
  const flushSegment = (): void => {
    for (const line of groupLines(segment)) {
      const text = buildLineText(line, metrics, toUserX, toUserY);
      if (text) fragment.appendChild(text);
    }
    segment = [];
  };

  for (const item of items) {
    if (item.kind === "text") {
      segment.push(item);
      continue;
    }
    flushSegment();
    const media = await buildMedia(item, metrics, rasterizeHtml, toUserRect);
    if (media) fragment.appendChild(media);
  }
  flushSegment();
  return fragment;
}

function foreignObjectBox(fo: Element): LabelRect {
  return {
    x: numAttr(fo, "x"),
    y: numAttr(fo, "y"),
    width: numAttr(fo, "width"),
    height: numAttr(fo, "height"),
  };
}

function fallbackLabel(fo: Element, box: LabelRect): SVGTextElement | null {
  const text = (fo.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const el = document.createElementNS(SVG_NS, "text");
  el.setAttribute("x", String(box.x + box.width / 2));
  el.setAttribute("y", String(box.y + box.height / 2));
  el.setAttribute("text-anchor", "middle");
  el.setAttribute("dominant-baseline", "central");
  el.textContent = text;
  return el;
}

function backgroundRect(
  fo: Element,
  metrics: FoLabelMetrics,
  toUserRect: (r: LabelRect) => LabelRect,
): SVGRectElement | null {
  const root = firstElementChild(fo);
  if (!root) return null;
  const color = metrics.backgroundOf(root);
  const rect = metrics.elementRect(root);
  if (!color || !rect || rect.width <= 0 || rect.height <= 0) return null;
  const user = toUserRect(rect);
  const el = document.createElementNS(SVG_NS, "rect");
  el.setAttribute("x", String(user.x));
  el.setAttribute("y", String(user.y));
  el.setAttribute("width", String(user.width));
  el.setAttribute("height", String(user.height));
  el.setAttribute("fill", color);
  return el;
}

function buildLineText(
  line: TextItem[],
  metrics: FoLabelMetrics,
  toUserX: (x: number) => number,
  toUserY: (y: number) => number,
): SVGTextElement | null {
  if (line.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const item of line) {
    minX = Math.min(minX, item.rect.x);
    maxX = Math.max(maxX, item.rect.x + item.rect.width);
  }
  const first = line[0];
  const ratio = metrics.baselineRatio(first.style);
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(toUserX((minX + maxX) / 2)));
  text.setAttribute("text-anchor", "middle");
  if (ratio !== null) {
    // Explicit alphabetic baseline: renders identically in usvg, LibreOffice,
    // and browsers (no `dominant-baseline` support required).
    text.setAttribute(
      "y",
      String(toUserY(first.rect.y + first.rect.height * ratio)),
    );
  } else {
    const cy =
      line.reduce((acc, item) => acc + item.rect.y + item.rect.height / 2, 0) /
      line.length;
    text.setAttribute("y", String(toUserY(cy)));
    text.setAttribute("dominant-baseline", "central");
  }
  applyRunStyle(text, first.style);
  for (const item of line) {
    if (item === first && line.length === 1) {
      text.textContent = item.text;
      continue;
    }
    const tspan = document.createElementNS(SVG_NS, "tspan");
    if (item !== first) applyRunStyle(tspan, item.style);
    tspan.textContent = item.text;
    text.appendChild(tspan);
  }
  return text;
}

async function buildMedia(
  item: MediaItem,
  metrics: FoLabelMetrics,
  rasterizeHtml: HtmlRasterizer,
  toUserRect: (r: LabelRect) => LabelRect,
): Promise<Node | null> {
  const style = metrics.runStyle(item.el);
  const color = style.color ?? "#333";
  const rect = item.rect;

  if (item.kind === "icon" && rect) {
    return cloneIcon(item.el, rect, color, toUserRect);
  }

  if (item.kind === "math") {
    let raster: { dataUri: string } | null = null;
    try {
      raster = await rasterizeHtml(item.el as HTMLElement);
    } catch {
      raster = null;
    }
    if (raster && rect && rect.width > 0 && rect.height > 0) {
      const user = toUserRect(rect);
      const image = document.createElementNS(SVG_NS, "image");
      image.setAttribute("x", String(user.x));
      image.setAttribute("y", String(user.y));
      image.setAttribute("width", String(user.width));
      image.setAttribute("height", String(user.height));
      image.setAttribute("preserveAspectRatio", "none");
      image.setAttribute("href", raster.dataUri);
      image.setAttribute("xlink:href", raster.dataUri);
      return image;
    }
  }

  // KaTeX capture unavailable (or MathML input): degrade to the formula's
  // plain text at its measured box — never lose the label entirely.
  const flattened = (item.el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!flattened) return null;
  const text = document.createElementNS(SVG_NS, "text");
  if (rect && rect.width > 0 && rect.height > 0) {
    const user = toUserRect(rect);
    text.setAttribute("x", String(user.x + user.width / 2));
    text.setAttribute("y", String(user.y + user.height / 2));
  } else {
    text.setAttribute("x", "0");
    text.setAttribute("y", "0");
  }
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  applyRunStyle(text, style);
  text.textContent = flattened;
  return text;
}

function cloneIcon(
  el: Element,
  rect: LabelRect,
  color: string,
  toUserRect: (r: LabelRect) => LabelRect,
): Element {
  const clone = el.cloneNode(true) as Element;
  clone.removeAttribute("class");
  for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      if (/currentColor/i.test(attr.value)) {
        node.setAttribute(
          attr.name,
          attr.value.replace(/currentColor/gi, color),
        );
      }
    }
  }
  const user = toUserRect(rect);
  clone.setAttribute("x", String(user.x));
  clone.setAttribute("y", String(user.y));
  clone.setAttribute("width", String(user.width));
  clone.setAttribute("height", String(user.height));
  return clone;
}

/* ──────────────────── DOM walking ────────────────────────────────────── */

function collectItems(fo: Element, metrics: FoLabelMetrics): Item[] {
  const items: Item[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const textNode = node as Text;
      const data = textNode.data;
      if (!data) return;
      if (!/\S/.test(data)) {
        // Formatting whitespace (newlines between tags) drops; inter-word
        // spaces merge into the previous run so word spacing survives.
        if (data.includes("\n")) return;
        const prev = items[items.length - 1];
        if (prev && prev.kind === "text") prev.text += data;
        return;
      }
      for (const piece of splitTextByLines(textNode, metrics)) {
        const rect = unionRects(metrics.rangeRects(rangeOf(piece)));
        const parent = piece.parentElement;
        if (!rect || rect.width <= 0 || !parent) continue;
        items.push({
          kind: "text",
          node: piece,
          text: piece.data,
          style: metrics.runStyle(parent),
          rect,
        });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return;
    if (tag === "svg") {
      items.push({ kind: "icon", el, rect: metrics.elementRect(el) });
      return;
    }
    if (isKatexElement(el)) {
      items.push({ kind: "math", el, rect: metrics.elementRect(el) });
      return;
    }
    if (tag === "math") {
      items.push({ kind: "mathml", el, rect: metrics.elementRect(el) });
      return;
    }
    for (const child of Array.from(el.childNodes)) visit(child);
  };
  for (const child of Array.from(fo.childNodes)) visit(child);
  return items;
}

function isKatexElement(el: Element): boolean {
  return (
    typeof el.classList !== "undefined" &&
    (el.classList.contains("katex") || el.classList.contains("katex-display"))
  );
}

/**
 * Split a wrapped text node into one text node per rendered line, so each
 * piece has a single line rectangle. The boundary between line `i` and
 * `i + 1` is the largest prefix offset still spanning at most `i + 1`
 * lines, found by binary search over `Range.getClientRects().length`.
 */
function splitTextByLines(node: Text, metrics: FoLabelMetrics): Text[] {
  const rects = metrics.rangeRects(rangeOf(node));
  if (rects.length <= 1) return [node];
  const pieces: Text[] = [];
  let current = node;
  for (let line = 1; line < rects.length; line++) {
    // Largest prefix still inside the current line (one line is split off
    // per pass, so the prefix may span at most one line fragment).
    let lo = 1;
    let hi = current.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const count = metrics.rangeRects(rangeWithin(current, 0, mid)).length;
      if (count <= 1) lo = mid;
      else hi = mid - 1;
    }
    if (lo >= current.length) break;
    const rest = current.splitText(lo);
    pieces.push(current);
    current = rest;
  }
  pieces.push(current);
  return pieces;
}

/** Group same-line runs into one `<text>` (they share a baseline). */
function groupLines(items: TextItem[]): TextItem[][] {
  const lines: TextItem[][] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    if (line && line.length > 0) {
      const ref = line[0];
      const refCy = ref.rect.y + ref.rect.height / 2;
      const cy = item.rect.y + item.rect.height / 2;
      const tolerance = Math.min(ref.rect.height, item.rect.height) * 0.6;
      if (Math.abs(cy - refCy) <= Math.max(tolerance, 1)) {
        line.push(item);
        continue;
      }
    }
    lines.push([item]);
  }
  return lines;
}

/* ──────────────────── styling helpers ────────────────────────────────── */

function applyRunStyle(el: Element, style: RunStyle): void {
  const css: string[] = [];
  if (style.fontFamily) {
    css.push(`font-family:${style.fontFamily}`);
    el.setAttribute("font-family", style.fontFamily);
  }
  if (Number.isFinite(style.fontSizePx) && style.fontSizePx > 0) {
    css.push(`font-size:${style.fontSizePx}px`);
    el.setAttribute("font-size", String(round3(style.fontSizePx)));
  }
  if (
    style.fontWeight &&
    style.fontWeight !== "normal" &&
    style.fontWeight !== "400"
  ) {
    css.push(`font-weight:${style.fontWeight}`);
    el.setAttribute("font-weight", style.fontWeight);
  }
  if (style.fontStyle && style.fontStyle !== "normal") {
    css.push(`font-style:${style.fontStyle}`);
    el.setAttribute("font-style", style.fontStyle);
  }
  if (style.color) {
    css.push(`fill:${style.color}`);
    el.setAttribute("fill", style.color);
  }
  if (style.textDecoration && style.textDecoration !== "none") {
    css.push(`text-decoration:${style.textDecoration}`);
    el.setAttribute("text-decoration", style.textDecoration);
  }
  // Inline style outranks Mermaid's class CSS in every consumer (usvg folds
  // style-attr declarations last, CSS engines per spec).
  if (css.length > 0) el.setAttribute("style", css.join(";"));
}

/* ──────────────────── DOM measurement ────────────────────────────────── */

function safeMetrics(): FoLabelMetrics | null {
  try {
    return domLabelMetrics();
  } catch {
    return null;
  }
}

/**
 * Real-layout measurement. Rect ratios make every value zoom- and
 * scale-invariant; the zoom probe normalizes computed font sizes the same
 * way `text-offsets.ts` does (WebKit reports declared/zoom under page zoom).
 */
export function domLabelMetrics(): FoLabelMetrics | null {
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function" ||
    typeof getComputedStyle !== "function"
  ) {
    return null;
  }
  const zoomFactor = measureZoomFactor();
  const ratioCache = new Map<string, number | null>();

  return {
    elementRect(el: Element): LabelRect | null {
      try {
        return rectOf(el.getBoundingClientRect());
      } catch {
        return null;
      }
    },
    rangeRects(range: Range): LabelRect[] {
      try {
        return Array.from(range.getClientRects())
          .map((r) => rectOf(r))
          .filter(
            (r): r is LabelRect => r !== null && r.width >= 0 && r.height > 0,
          );
      } catch {
        return [];
      }
    },
    runStyle(el: Element): RunStyle {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      return {
        fontFamily: cs.fontFamily || null,
        fontSizePx: Number.isFinite(size) ? size * zoomFactor : 0,
        fontWeight: cs.fontWeight || null,
        fontStyle: cs.fontStyle || null,
        textDecoration: cs.textDecorationLine || cs.textDecoration || null,
        color: cs.color || null,
      };
    },
    baselineRatio(style: RunStyle): number | null {
      const key = `${style.fontFamily}|${style.fontWeight}|${style.fontStyle}`;
      if (!ratioCache.has(key)) {
        ratioCache.set(key, measureBaselineRatio(style));
      }
      return ratioCache.get(key) ?? null;
    },
    backgroundOf(el: Element): string | null {
      try {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        if (
          !bg ||
          bg === "transparent" ||
          /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)
        ) {
          return null;
        }
        return bg;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Baseline offset as a fraction of the font's content-box height. A hidden
 * sample line is laid out in the page's font context; a zero-size
 * `vertical-align: baseline` probe sits on its baseline, so
 * `probe.bottom - sample.top` is the ascent and `sample.height` the
 * ascent+descent of the same box type that `Range.getClientRects` reports
 * for text runs.
 */
function measureBaselineRatio(style: RunStyle): number | null {
  try {
    const sample = document.createElement("span");
    sample.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;line-height:normal;font-size:100px";
    if (style.fontFamily) sample.style.fontFamily = style.fontFamily;
    if (style.fontWeight) sample.style.fontWeight = style.fontWeight;
    if (style.fontStyle) sample.style.fontStyle = style.fontStyle;
    sample.textContent = "Hxg";
    const probe = document.createElement("span");
    probe.style.cssText =
      "display:inline-block;width:0;height:0;vertical-align:baseline";
    sample.appendChild(probe);
    document.body.appendChild(sample);
    try {
      const box = sample.getBoundingClientRect();
      const baseline = probe.getBoundingClientRect().bottom;
      if (!Number.isFinite(box.height) || box.height <= 0) return null;
      const ratio = (baseline - box.top) / box.height;
      return Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : null;
    } finally {
      sample.remove();
    }
  } catch {
    return null;
  }
}

function measureZoomFactor(): number {
  try {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;font-size:100px;line-height:1";
    const host = document.createElement("div");
    host.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden";
    host.appendChild(probe);
    document.body.appendChild(host);
    try {
      const reported = parseFloat(getComputedStyle(probe).fontSize);
      // Engines that resolve computed font sizes against the true size
      // report the declared probe size (factor 1); WebKit under page zoom
      // reports declared/zoom.
      return Number.isFinite(reported) && Math.abs(reported - 100) > 0.01
        ? 100 / reported
        : 1;
    } finally {
      host.remove();
    }
  } catch {
    return 1;
  }
}

/**
 * Default KaTeX rasterizer: capture the laid-out `.katex` element with
 * html2canvas (the same pipeline `export/math-render.ts` uses for
 * rasterized math). Lazy import keeps html2canvas out of diagrams that
 * have no math labels.
 */
const defaultRasterizer: HtmlRasterizer = async (el) => {
  const { captureElementToPng } = await import("$lib/export/math-render");
  const { png, widthPx, heightPx } = await captureElementToPng(el, 2);
  return {
    dataUri: `data:image/png;base64,${bytesToBase64(png)}`,
    widthPx,
    heightPx,
  };
};

/* ──────────────────── small utilities ────────────────────────────────── */

function rectOf(rect: DOMRect): LabelRect | null {
  if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y))
    return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function unionRects(rects: LabelRect[]): LabelRect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rangeOf(node: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}

function rangeWithin(node: Node, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function firstElementChild(el: Element): Element | null {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 1) return child as Element;
  }
  return null;
}

function numAttr(el: Element, name: string): number {
  const value = parseFloat(el.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : 0;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The width the SVG would lay out at in the viewer: its `max-width` style
 * if present (Mermaid sets one), else the viewBox width. The hidden host is
 * given this width so label wrapping matches the viewer.
 */
function naturalSvgWidth(svg: string): number {
  const opening = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const maxWidth = opening.match(/max-width\s*:\s*([\d.]+)/i);
  if (maxWidth && Number.isFinite(parseFloat(maxWidth[1]))) {
    return parseFloat(maxWidth[1]);
  }
  const viewBox = opening.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBox) {
    const width = parseFloat(viewBox[1].trim().split(/[\s,]+/)[2]);
    if (Number.isFinite(width) && width > 0) return width;
  }
  return 2000;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
