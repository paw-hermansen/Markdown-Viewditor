import type { MermaidConfig } from "mermaid";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "../fence-options";
import { getDirectiveState } from "../directives";
import { mergeOptions } from "../directive-merge";
import type { FenceOptionSchema } from "../types";
import { ensureConstructableStylesheet } from "./css-stylesheet-shim";

type MermaidModule = typeof import("mermaid");
type AppTheme = "default" | "dark";
interface AppThemeInfo {
  type: AppTheme;
  themeId: string;
}
/**
 * Which Mermaid config / cache family a render belongs to. The viewer
 * inherits the page font and uses HTML labels; export must stand alone
 * in LibreOffice, usvg, and SVG-as-image, which drop `foreignObject`
 * and cannot resolve `font-family: inherit`; print (the PDF print clone
 * on macOS) keeps the viewer's theme and inherited font but drops HTML
 * labels, because WebKit's CSS `zoom` handling mis-scales
 * `<foreignObject>` content (see prepareMermaidForPrint).
 */
type RenderVariant = "viewer" | "print" | "export";

let mermaidModule: MermaidModule | null = null;
let initialized = false;
let lastInitKey = "";
let nextRenderId = 0;
let nextWrapperId = 0;
let preRenderQueue: Promise<void> = Promise.resolve();

const ERROR = "ERROR";

/**
 * Concrete font stack for exported SVGs. Mermaid's own default stack,
 * kept unquoted-with-single-quotes so the same string works both in CSS
 * and as a `font-family="…"` presentation attribute. The trailing
 * `sans-serif` generic resolves on every platform via fontdb/LO font
 * substitution even when the named faces are missing.
 */
const EXPORT_FONT_FAMILY = "'trebuchet ms', verdana, arial, sans-serif";

// Cache only the raw SVG. Host layout options are applied when the wrapper is
// rendered, so changing alignment or sizing never duplicates Mermaid work.
const svgCache = new Map<string, string>();

// Diagram sources keyed by wrapper id (emitted as `data-mermaid-id`), so the
// PDF print clone can re-render a block in the print variant without needing
// the raw markdown again. Populated by renderMermaid, cleared with the cache.
const mermaidSources = new Map<number, string>();

function getAppTheme(): AppThemeInfo {
  // Read from DOM to avoid circular dependency with viewer store.
  if (typeof document !== "undefined") {
    const type: AppTheme =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "default";
    const themeId =
      document.documentElement.getAttribute("data-theme-id") ?? "unknown";
    return { type, themeId };
  }
  return { type: "default", themeId: "unknown" };
}

/**
 * Build the cache key from the diagram source, app theme, and render
 * variant. The variant is part of the key because viewer and export
 * SVGs have different label structure (foreignObject vs `<text>`) and
 * must never be reused across pipelines. Mermaid's own frontmatter
 * remains in `content`, so Mermaid can apply native config after this
 * extension initializes the site theme.
 */
function cacheKey(
  content: string,
  appTheme: AppThemeInfo,
  variant: RenderVariant = "viewer",
): string {
  return JSON.stringify([appTheme.type, appTheme.themeId, variant, content]);
}

async function ensureLoaded(): Promise<MermaidModule> {
  if (!mermaidModule) {
    // Must run before Mermaid's first render: it builds every diagram's CSS
    // with `new CSSStyleSheet()`, which older WebKit (WKWebView on
    // macOS <= 13.2 / iOS <= 16.4) rejects with "Illegal constructor".
    ensureConstructableStylesheet();
    mermaidModule = await import("mermaid");
  }
  return mermaidModule;
}

/**
 * Mermaid knobs that purge `<foreignObject>` HTML labels from every diagram
 * family, leaving only `<text>/<tspan>` label shapes. `htmlLabels: false`
 * covers flowcharts and friends; the sequence/journey/timeline/c4 family
 * picks its label renderer via `textPlacement` instead ("fo" builds a
 * `<switch><foreignObject>…` label), so those sections need their own
 * override. Only journey and timeline declare the knob in mermaid's types
 * (the runtime reads it for all four), hence the casts.
 */
const TEXT_LABEL_CONFIG: MermaidConfig = {
  htmlLabels: false,
  journey: { textPlacement: "tspan" },
  timeline: { textPlacement: "tspan" },
  sequence: { textPlacement: "tspan" } as NonNullable<
    MermaidConfig["sequence"]
  >,
  c4: { textPlacement: "tspan" } as NonNullable<MermaidConfig["c4"]>,
};

async function ensureInitialized(
  mod: MermaidModule,
  theme: AppThemeInfo,
  variant: RenderVariant = "viewer",
): Promise<void> {
  const key = `${variant}:${theme.type}:${theme.themeId}`;
  if (initialized && lastInitKey === key) return;
  const config: MermaidConfig =
    variant === "export"
      ? {
          // Standalone-SVG safe: labels become <text>/<tspan> (not
          // <foreignObject>) and fonts are a concrete stack (not `inherit`).
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          fontFamily: EXPORT_FONT_FAMILY,
          htmlLabels: false,
          suppressErrorRendering: true,
        }
      : {
          startOnLoad: false,
          theme: theme.type as MermaidConfig["theme"],
          securityLevel: "strict",
          fontFamily: "inherit",
          suppressErrorRendering: true,
          ...getViewerThemeOverrides(theme.type),
          // Print adds the label-shape overrides on top of the viewer config:
          // same theme, same inherited font, no <foreignObject>.
          ...(variant === "print" ? TEXT_LABEL_CONFIG : null),
        };
  await mod.default.initialize(config);
  initialized = true;
  lastInitKey = key;
}

/**
 * Read theme-specific Mermaid overrides from the viewer's CSS.
 *
 * Some themes (e.g. Nord Light) define `--mermaid-main-bkg` to
 * override Mermaid's default `mainBkg` palette color, which would
 * otherwise be nearly invisible against the viewer background.
 * Custom themes can opt in by setting this CSS variable on
 * `#viewer-content`.
 */
function getViewerThemeOverrides(theme: AppTheme): {
  themeVariables?: Record<string, string>;
} {
  if (theme !== "default") return {};
  if (typeof document === "undefined") return {};
  const viewerEl = document.getElementById("viewer-content");
  if (!viewerEl) return {};
  const mainBkg = getComputedStyle(viewerEl)
    .getPropertyValue("--mermaid-main-bkg")
    .trim();
  if (!mainBkg) return {};
  return { themeVariables: { mainBkg } };
}

export function preRenderMermaidBlocks(
  tokens: readonly MermaidFenceToken[],
  env: Record<string, unknown>,
  schema: FenceOptionSchema,
): Promise<void> {
  const queuedPass = preRenderQueue.then(() =>
    preRenderMermaidBlocksPass(tokens, env, schema),
  );
  preRenderQueue = queuedPass.catch(() => undefined);
  return queuedPass;
}

async function preRenderMermaidBlocksPass(
  tokens: readonly MermaidFenceToken[],
  env: Record<string, unknown>,
  schema: FenceOptionSchema,
): Promise<void> {
  const appTheme = getAppTheme();
  const mermaidTokens = tokens.filter(isMermaidFence);
  if (mermaidTokens.length === 0) return;

  let mod: MermaidModule | null = null;
  let loadFailed = false;

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (!isMermaidFence(token)) continue;

    const diagramContent = token.content ?? "";
    // Resolve host options here so pre-rendering observes the same positional
    // directive and fence state as the synchronous fence renderer. They do not
    // participate in the raw SVG cache key.
    resolveFenceOptions(token, env, idx, schema);
    const key = cacheKey(diagramContent, appTheme);
    if (svgCache.has(key)) continue;

    if (loadFailed) {
      svgCache.set(key, ERROR);
      continue;
    }

    try {
      if (!mod) mod = await ensureLoaded();
      await ensureInitialized(mod, appTheme, "viewer");
      const { svg } = await mod.default.render(
        `mmd-${nextRenderId++}`,
        diagramContent,
      );
      svgCache.set(key, svg);
    } catch (err) {
      removeMermaidTempElements();
      if (!mod) {
        loadFailed = true;
        console.error("[mermaid] Load error:", err);
      } else {
        console.error("[mermaid] Render error:", err);
      }
      svgCache.set(key, ERROR);
    }
  }
}

function removeMermaidTempElements(): void {
  if (
    typeof document === "undefined" ||
    typeof document.querySelectorAll !== "function"
  ) {
    return;
  }
  document
    .querySelectorAll('body > div[id^="dmmd-"], body > iframe[id^="immd-"]')
    .forEach((node) => node.remove());
}

export function renderMermaid(
  content: string,
  options: Record<string, unknown>,
): string {
  const key = cacheKey(content, getAppTheme());
  const cached = svgCache.get(key);
  // Tag the wrapper with a stable id and remember its diagram source so the
  // PDF print clone can re-render the block in the print variant later
  // (prepareMermaidForPrint). The id doubles as the SVG id namespace below.
  const wrapperId = nextWrapperId++;
  mermaidSources.set(wrapperId, content);
  const attributes = wrapperAttributes(options, wrapperId);

  if (cached === ERROR || cached === undefined) {
    const escaped = escapeHtml(content);
    return `<div class="mermaid-block mermaid-error-block"${attributes}><pre class="mermaid-error">${escaped}</pre><p class="mermaid-error-msg">Mermaid rendering failed</p></div>`;
  }

  const fitToWidth = options.fitToWidth !== false;
  const svg = fitToWidth ? cached : normalizeSvgForNaturalSize(cached);
  const namespacedSvg = namespaceSvgIds(svg, `mmd-svg-${wrapperId}`);
  const body = fitToWidth
    ? namespacedSvg
    : `<div class="mermaid-scroll-content">${namespacedSvg}</div>`;

  return `<div class="mermaid-block"${attributes}>${body}</div>`;
}

export function clearMermaidCache(): void {
  svgCache.clear();
  mermaidSources.clear();
  initialized = false;
  lastInitKey = "";
  nextRenderId = 0;
  nextWrapperId = 0;
}

/**
 * Render a Mermaid diagram to a standalone SVG for export pipelines (ODT).
 *
 * Uses an export-specific Mermaid config so the SVG survives consumers
 * that are not a live HTML document (LibreOffice svgio, usvg/resvg, and
 * `Image`-based SVG rasterization):
 *   - `htmlLabels: false` — labels are `<text>/<tspan>`, not
 *     `<foreignObject>` HTML, which those consumers drop outright.
 *   - concrete `fontFamily` — `font-family: inherit` has no parent in a
 *     standalone SVG and is dropped or mis-resolved.
 *   - `materializeSvgFonts` then copies the font stack onto every
 *     `<text>/<tspan>` as a presentation attribute, which LibreOffice
 *     honors more reliably than Mermaid's class/descendant CSS.
 *
 * Always uses Mermaid's light ("default") theme so exports stay neutral /
 * printer-friendly regardless of the app theme. The raw SVG is cached
 * under an export-variant key so it is never mixed up with the viewer's
 * foreignObject output. IDs are namespaced per call so several diagrams
 * can coexist in one exported document, and the SVG is normalized to
 * explicit width/height so dimension sniffing never sees percentage sizes.
 *
 * @throws If Mermaid fails to load or render the source.
 */
export async function renderMermaidSvgForExport(
  content: string,
): Promise<string> {
  const exportTheme: AppThemeInfo = { type: "default", themeId: "export" };
  const key = cacheKey(content, exportTheme, "export");
  let raw = svgCache.get(key);
  if (raw === ERROR) raw = undefined;

  if (!raw) {
    const mod = await ensureLoaded();
    await ensureInitialized(mod, exportTheme, "export");
    try {
      const { svg } = await mod.default.render(
        `mmd-export-${nextRenderId++}`,
        content,
      );
      raw = svg;
      svgCache.set(key, raw);
    } catch (err) {
      removeMermaidTempElements();
      svgCache.set(key, ERROR);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  return materializeSvgFonts(
    normalizeSvgForNaturalSize(
      namespaceSvgIds(raw, `mmd-exp-${nextWrapperId++}`),
    ),
  );
}

/**
 * Render a Mermaid diagram for the PDF print clone (macOS capture path).
 *
 * Same pipeline as {@link renderMermaidSvgForExport} (per-call id
 * namespacing, explicit width/height), but the render variant keeps the
 * viewer's theme and `font-family: inherit` — the clone is a live HTML
 * document, so `inherit` resolves against the viewer styles exactly like
 * the on-screen diagram — and fonts are deliberately NOT materialized.
 *
 * The point of this variant is the label shape: `htmlLabels: false` plus
 * `textPlacement: "tspan"` (see TEXT_LABEL_CONFIG) produce pure
 * `<text>/<tspan>` labels with no `<foreignObject>`. WebKit's CSS `zoom`
 * handling mis-scales SVG (font-size in `<foreignObject>` gets the zoom
 * factor applied twice — webkit.org/show_bug.cgi?id=279041 — and SVG
 * geometry/markers distort under zoom on older WebKit), so the print clone
 * swaps these foreignObject-free SVGs in before the capture.
 *
 * @throws If Mermaid fails to load or render the source.
 */
export async function renderMermaidSvgForPrint(
  content: string,
): Promise<string> {
  const appTheme = getAppTheme();
  const key = cacheKey(content, appTheme, "print");
  let raw = svgCache.get(key);
  if (raw === ERROR) raw = undefined;

  if (!raw) {
    const mod = await ensureLoaded();
    await ensureInitialized(mod, appTheme, "print");
    try {
      const { svg } = await mod.default.render(
        `mmd-print-${nextRenderId++}`,
        content,
      );
      raw = svg;
      svgCache.set(key, raw);
    } catch (err) {
      removeMermaidTempElements();
      svgCache.set(key, ERROR);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  return normalizeSvgForNaturalSize(
    namespaceSvgIds(raw, `mmd-print-${nextWrapperId++}`),
  );
}

/**
 * Swap every Mermaid diagram inside `root` for its foreignObject-free print
 * variant (see {@link renderMermaidSvgForPrint}). Used by the PDF exporter on
 * macOS before the WKWebView capture.
 *
 * Walks `.mermaid-block` wrappers tagged by `renderMermaid` with
 * `data-mermaid-id`, re-renders each diagram source in the print variant,
 * and replaces the wrapper's inner SVG — preserving the wrapper markup
 * (data-align / --mermaid-max-width / data-line) and the
 * `.mermaid-scroll-content` inner wrapper on `fitToWidth=false` blocks so
 * the print styles keep applying unchanged. Error blocks are left as-is,
 * and a block whose source is unknown (e.g. after a reload) keeps its
 * current SVG — the capture then behaves like today's viewer output.
 *
 * Rendering is sequential and cached, so a document with N diagrams costs
 * at most one Mermaid render per distinct source.
 */
export async function prepareMermaidForPrint(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLElement>(
    ".mermaid-block[data-mermaid-id]",
  );
  for (const block of blocks) {
    if (block.classList.contains("mermaid-error-block")) continue;
    const source = mermaidSources.get(Number(block.dataset.mermaidId));
    if (source === undefined) continue;

    let svg: string;
    try {
      svg = await renderMermaidSvgForPrint(source);
    } catch {
      // Keep the viewer SVG rather than failing the whole export.
      continue;
    }

    block.innerHTML =
      block.dataset.fitToWidth === "false"
        ? `<div class="mermaid-scroll-content">${svg}</div>`
        : svg;
  }
}

/**
 * Make text survive standalone SVG consumers. Mermaid emits `font-family`
 * only in CSS class/descendant rules (and used `inherit` for the viewer);
 * LibreOffice's svgio and usvg don't reliably apply those to `<text>`.
 * This pass (1) replaces the CSS-wide keyword `inherit` with the concrete
 * export stack and (2) copies that stack onto every `<text>`/`<tspan>` as
 * a presentation attribute, which all three consumers honor.
 */
function materializeSvgFonts(svg: string): string {
  let out = svg.replace(
    /font-family\s*:\s*inherit\b/gi,
    `font-family: ${EXPORT_FONT_FAMILY}`,
  );
  // Presentation attribute on the text shapes themselves. Skip tags that
  // already carry one so we never override a more specific Mermaid style.
  out = out.replace(
    /<(text|tspan)\b([^>]*?)(\/?)>/gi,
    (_tag, name: string, attrs: string, slash: string) => {
      if (/\sfont-family\s*=/i.test(attrs)) return _tag;
      return `<${name}${attrs} font-family="${EXPORT_FONT_FAMILY}"${slash}>`;
    },
  );
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MermaidFenceToken {
  type?: string;
  info?: string;
  content?: string;
}

function isMermaidFence(token: MermaidFenceToken): boolean {
  if (token.type !== "fence") return false;
  const language = (token.info ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return language === "mermaid";
}

function resolveFenceOptions(
  token: MermaidFenceToken,
  env: Record<string, unknown>,
  idx: number,
  schema: FenceOptionSchema,
): Record<string, unknown> {
  const rawAttrs = extractBraceAttrs((token.info ?? "").trim());
  const parsed = rawAttrs ? parseAttrString(rawAttrs) : {};
  const fenceOptions = validateExplicitFenceOptions(parsed, schema);
  const directiveOptions = getDirectiveState(env, "mermaid", idx);
  return mergeOptions(schema, directiveOptions, fenceOptions);
}

function wrapperAttributes(
  options: Record<string, unknown>,
  wrapperId: number,
): string {
  const align =
    options.align === "left" ||
    options.align === "right" ||
    options.align === "center"
      ? options.align
      : "center";
  const maxWidthValue = Number(options.maxWidth);
  const maxWidth = Number.isFinite(maxWidthValue) ? maxWidthValue : 800;
  const fitToWidth = options.fitToWidth !== false;
  const fitAttribute = fitToWidth ? "" : ' data-fit-to-width="false"';
  return ` data-mermaid-id="${wrapperId}" data-align="${align}"${fitAttribute} style="--mermaid-max-width: ${maxWidth}px"`;
}

function namespaceSvgIds(svg: string, namespace: string): string {
  const idMap = new Map<string, string>();
  const idAttributePattern =
    /(\s)id(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const withNamespacedIds = svg.replace(/<[^>]+>/g, (tag) =>
    tag.replace(
      idAttributePattern,
      (
        _match,
        leading: string,
        equals: string,
        doubleQuoted: string | undefined,
        singleQuoted: string | undefined,
        bare: string | undefined,
      ) => {
        const id = doubleQuoted ?? singleQuoted ?? bare ?? "";
        const namespaced = `${namespace}-${id}`;
        idMap.set(id, namespaced);
        const quote =
          doubleQuoted !== undefined
            ? '"'
            : singleQuoted !== undefined
              ? "'"
              : "";
        return `${leading}id${equals}${quote}${namespaced}${quote}`;
      },
    ),
  );

  if (idMap.size === 0) return svg;

  const reference = (id: string): string => idMap.get(id) ?? id;

  const ariaIdReferenceAttributes = new Set([
    "aria-activedescendant",
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
  ]);

  return withNamespacedIds.replace(
    /<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>/gi,
    (fragment) => {
      let result = fragment.replace(
        /url\((\s*)#([^)]*?)(\s*)\)/gi,
        (_match, leading: string, id: string, trailing: string) =>
          `url(${leading}#${reference(id)}${trailing})`,
      );

      if (/^<style\b/i.test(fragment)) {
        for (const [id, namespaced] of idMap) {
          // The lookahead must accept `{` as well: Mermaid serializes its CSS
          // compactly (css-tree), so the root rule that carries the diagram's
          // `font-family`/`font-size`/`fill` looks like `#mmd-0{…}`. Missing
          // that case orphaned the rule after the id rename and labels fell
          // back to the engine's inherited font size — which WebKitGTK scales
          // by the device scale factor when crossing into <foreignObject>
          // (16px labels rendered at 12.6px with 90% desktop text scaling,
          // leaving node boxes sized for lines that were never drawn).
          const selector = new RegExp(
            `#${escapeRegExp(id)}(?=[\\s.#:[>+~,{]|$)`,
            "g",
          );
          result = result.replace(selector, `#${namespaced}`);
        }
        return result;
      }

      result = result.replace(
        /(\s)((?:xlink:)?href)(\s*=\s*)(["'])#([^"']+)\4/gi,
        (
          _match,
          leading: string,
          attribute: string,
          equals: string,
          quote: string,
          id: string,
        ) => `${leading}${attribute}${equals}${quote}#${reference(id)}${quote}`,
      );

      return result.replace(
        /(\s)(aria-[\w-]+)(\s*=\s*)(["'])([^"']*)\4/gi,
        (
          _match,
          leading: string,
          attribute: string,
          equals: string,
          quote: string,
          value: string,
        ) => {
          if (!ariaIdReferenceAttributes.has(attribute.toLowerCase())) {
            return _match;
          }
          const namespacedValue = value.replace(/\S+/g, (id) => reference(id));
          return `${leading}${attribute}${equals}${quote}${namespacedValue}${quote}`;
        },
      );
    },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSvgForNaturalSize(svg: string): string {
  const openingTag = svg.match(/<svg\b[^>]*>/i);
  if (!openingTag || openingTag.index === undefined) return svg;

  const viewBox = openingTag[0].match(/\bviewBox\s*=\s*(["'])([^"']+)\1/i);
  if (!viewBox) return svg;

  const dimensions = viewBox[2]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    dimensions.length !== 4 ||
    !Number.isFinite(dimensions[2]) ||
    !Number.isFinite(dimensions[3]) ||
    dimensions[2] <= 0 ||
    dimensions[3] <= 0
  ) {
    return svg;
  }

  let attributes = openingTag[0].slice(4, -1);
  const width = String(dimensions[2]);
  const height = String(dimensions[3]);
  attributes = replaceSvgAttribute(attributes, "width", width);
  attributes = replaceSvgAttribute(attributes, "height", height);

  const styleMatch = attributes.match(/\sstyle\s*=\s*(["'])(.*?)\1/i);
  if (styleMatch && /(?:^|;)\s*max-width\s*:/i.test(styleMatch[2])) {
    const style = styleMatch[2]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(
        (declaration) => declaration && !/^max-width\s*:/i.test(declaration),
      )
      .join("; ");
    attributes = style
      ? attributes.replace(styleMatch[0], ` style="${style}"`)
      : attributes.replace(styleMatch[0], "");
  }

  const normalizedOpeningTag = `<svg${attributes}>`;
  return (
    svg.slice(0, openingTag.index) +
    normalizedOpeningTag +
    svg.slice(openingTag.index + openingTag[0].length)
  );
}

function replaceSvgAttribute(
  attributes: string,
  name: "width" | "height",
  value: string,
): string {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
  if (pattern.test(attributes)) {
    return attributes.replace(pattern, ` ${name}="${value}"`);
  }
  return `${attributes} ${name}="${value}"`;
}
