import type { MermaidConfig } from "mermaid";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "../fence-options";
import { getDirectiveState } from "../directives";
import { mergeOptions } from "../directive-merge";
import type { FenceOptionSchema } from "../types";

type MermaidModule = typeof import("mermaid");
type AppTheme = "default" | "dark";
/**
 * Which Mermaid config / cache family a render belongs to. The viewer
 * inherits the page font and uses HTML labels; export must stand alone
 * in LibreOffice, usvg, and SVG-as-image, which drop `foreignObject`
 * and cannot resolve `font-family: inherit`.
 */
type RenderVariant = "viewer" | "export";

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

function getAppTheme(): AppTheme {
  // Read from DOM to avoid circular dependency with viewer store.
  if (typeof document !== "undefined") {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "default";
  }
  return "default";
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
  appTheme: AppTheme,
  variant: RenderVariant = "viewer",
): string {
  return JSON.stringify([appTheme, variant, content]);
}

async function ensureLoaded(): Promise<MermaidModule> {
  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
  }
  return mermaidModule;
}

async function ensureInitialized(
  mod: MermaidModule,
  theme: AppTheme,
  variant: RenderVariant = "viewer",
): Promise<void> {
  const key = `${variant}:${theme}`;
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
          theme: theme as MermaidConfig["theme"],
          securityLevel: "strict",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        };
  await mod.default.initialize(config);
  initialized = true;
  lastInitKey = key;
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
  const attributes = wrapperAttributes(options);

  if (cached === ERROR || cached === undefined) {
    const escaped = escapeHtml(content);
    return `<div class="mermaid-block mermaid-error-block"${attributes}><pre class="mermaid-error">${escaped}</pre><p class="mermaid-error-msg">Mermaid rendering failed</p></div>`;
  }

  const fitToWidth = options.fitToWidth !== false;
  const svg = fitToWidth ? cached : normalizeSvgForNaturalSize(cached);
  const namespacedSvg = namespaceSvgIds(svg, `mmd-svg-${nextWrapperId++}`);
  const body = fitToWidth
    ? namespacedSvg
    : `<div class="mermaid-scroll-content">${namespacedSvg}</div>`;

  return `<div class="mermaid-block"${attributes}>${body}</div>`;
}

export function clearMermaidCache(): void {
  svgCache.clear();
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
  const key = cacheKey(content, "default", "export");
  let raw = svgCache.get(key);
  if (raw === ERROR) raw = undefined;

  if (!raw) {
    const mod = await ensureLoaded();
    await ensureInitialized(mod, "default", "export");
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

function wrapperAttributes(options: Record<string, unknown>): string {
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
  return ` data-align="${align}"${fitAttribute} style="--mermaid-max-width: ${maxWidth}px"`;
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
          const selector = new RegExp(
            `#${escapeRegExp(id)}(?=[\\s.#:[>+~,]|$)`,
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
