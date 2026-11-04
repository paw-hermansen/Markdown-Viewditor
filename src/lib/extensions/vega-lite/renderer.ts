import { escapeHtml } from "$lib/utils/escape";
import {
  extractBraceAttrs,
  parseAttrString,
  validateExplicitFenceOptions,
} from "../fence-options";
import { getDirectiveState } from "../directives";
import { mergeOptions } from "../directive-merge";
import type { FenceOptionSchema } from "../types";
import {
  narrowVegaLiteOptions,
  resolveVegaLiteOptions,
  VEGA_LITE_OPTIONS_SCHEMA,
  type VegaLiteRenderOptions,
} from "./schema";
import { ensureVegaLoaded, renderVegaLiteSpec } from "./render-core";
import { getVegaAppTheme, type VegaAppThemeInfo } from "./theme-config";

/**
 * Vega-Lite fence renderer: the mermaid pattern, not the SMILES one.
 * `renderFence` must return synchronously but vega rendering is async, so
 * `preRenderVegaLiteBlocks` renders every fence into {@link svgCache} first
 * and the fence renderer is a cache lookup. The cache key carries the
 * resolved theme inputs (type + id + `theme=` choice) and the spec text —
 * alignment and `fitToWidth` are wrapper CSS and deliberately outside the
 * key.
 *
 * SVGs are single-pipeline: viewer and export both flow through
 * `renderVegaLiteSpec` (`variant` switches the neutral-document theme and
 * font). There is no `<foreignObject>` dialect to fork like Mermaid's.
 */

const THEME_SNAPSHOT_ENV_KEY = "vegaLiteAppTheme";
const ERROR_PREFIX = "error:";

interface VegaLiteFenceToken {
  type?: string;
  info?: string;
  content?: string;
}

/** svg string, or `error:<message>` for a fence that failed to render. */
const svgCache = new Map<string, string>();
let renderQueue: Promise<void> = Promise.resolve();

export function themeSnapshotFromEnv(
  env: Record<string, unknown> | undefined,
): VegaAppThemeInfo | undefined {
  return env?.[THEME_SNAPSHOT_ENV_KEY] as VegaAppThemeInfo | undefined;
}

function cacheKey(
  content: string,
  appTheme: VegaAppThemeInfo,
  options: VegaLiteRenderOptions,
): string {
  return JSON.stringify([
    appTheme.type,
    appTheme.themeId,
    options.theme,
    content,
  ]);
}

function isVegaLiteFence(token: VegaLiteFenceToken): boolean {
  if (token.type !== "fence") return false;
  const language = (token.info ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  return language === "vega-lite" || language === "vegalite";
}

/**
 * Resolve a fence token's host options exactly like the synchronous fence
 * renderer does (brace attrs + positional directive state + schema merge),
 * so pre-rendering and renderFence agree on the cache key inputs.
 */
function resolveFenceOptions(
  token: VegaLiteFenceToken,
  env: Record<string, unknown>,
  idx: number,
  schema: FenceOptionSchema,
): Record<string, unknown> {
  const rawAttrs = extractBraceAttrs((token.info ?? "").trim());
  const parsed = rawAttrs ? parseAttrString(rawAttrs) : {};
  const fenceOptions = validateExplicitFenceOptions(parsed, schema);
  const directiveOptions = getDirectiveState(env, "vega-lite", idx);
  return mergeOptions(schema, directiveOptions, fenceOptions);
}

/** Parse fence JSON; map parse-error positions to content line/column. */
export function parseVegaLiteSpec(content: string): object {
  try {
    return JSON.parse(content) as object;
  } catch (err) {
    throw new Error(jsonErrorMessage(err, content));
  }
}

function jsonErrorMessage(err: unknown, content: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const reason = message
    .replace(/ in JSON at position.*$/, "")
    .replace(/ at position.*$/, "");
  // Older engines report the error offset in the message; modern V8/WebKit
  // only include a snippet. Recover the offset by prefix scan when missing.
  const match = /position (\d+)/.exec(message);
  const offset = match ? Number(match[1]) : findJsonErrorOffset(content);
  if (offset === null) return `Invalid JSON: ${reason}`;
  const before = content.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return `Invalid JSON: ${reason} (line ${line}, column ${column})`;
}

/**
 * First offset at which the JSON prefix is *syntactically* wrong (as
 * opposed to merely incomplete). Incomplete prefixes — truncated objects,
 * unterminated strings — are expected mid-scan and skipped. Returns null
 * when the content is only ever incomplete (e.g. an unclosed brace) or
 * when the content is too large to scan prefix-by-prefix.
 */
function findJsonErrorOffset(content: string): number | null {
  const MAX_SCAN = 100_000;
  if (content.length > MAX_SCAN) return null;
  for (let end = 1; end <= content.length; end++) {
    try {
      JSON.parse(content.slice(0, end));
      // A prefix parsed cleanly: the remaining error (if any) is trailing
      // garbage whose first character is at `end`.
      return end < content.length ? end : null;
    } catch (prefixErr) {
      const msg = prefixErr instanceof Error ? prefixErr.message : "";
      if (/end of JSON input|Unterminated string/i.test(msg)) continue;
      return end - 1;
    }
  }
  return null;
}

/**
 * Async pre-render pass (called via the extension's `preRenderBlocks`):
 * snapshot the app theme into the env once (mid-render theme changes must
 * not scatter cache keys — the mermaid THEME_SNAPSHOT contract), then fill
 * the cache fence by fence, strictly sequentially. Failures land in the
 * cache as error entries so renderFence degrades per block.
 */
export function preRenderVegaLiteBlocks(
  tokens: readonly VegaLiteFenceToken[],
  env: Record<string, unknown>,
  schema: FenceOptionSchema,
): Promise<void> {
  const appTheme = getVegaAppTheme();
  env[THEME_SNAPSHOT_ENV_KEY] = appTheme;
  const queuedPass = renderQueue.then(() =>
    preRenderPass(tokens, env, schema, appTheme),
  );
  renderQueue = queuedPass.catch(() => undefined);
  return queuedPass;
}

async function preRenderPass(
  tokens: readonly VegaLiteFenceToken[],
  env: Record<string, unknown>,
  schema: FenceOptionSchema,
  appTheme: VegaAppThemeInfo,
): Promise<void> {
  let loaded = false;
  let loadFailed = false;

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (!isVegaLiteFence(token)) continue;

    const content = token.content ?? "";
    const options = narrowVegaLiteOptions(
      resolveFenceOptions(token, env, idx, schema),
    );
    const key = cacheKey(content, appTheme, options);
    if (svgCache.has(key)) continue;

    if (loadFailed) {
      svgCache.set(key, `${ERROR_PREFIX}vega-lite failed to load`);
      continue;
    }
    try {
      // Load inside the guarded region on purpose: a failed chunk load lands
      // in the error entry below and poisons the rest of the pass (mermaid's
      // loadFailed pattern); spec errors stay per-fence.
      if (!loaded) {
        await ensureVegaLoaded();
        loaded = true;
      }
      svgCache.set(
        key,
        await renderVegaLiteSpec(parseVegaLiteSpec(content), options, {
          variant: "viewer",
          baseFile: baseFileFromEnv(env),
        }),
      );
    } catch (err) {
      if (!loaded) {
        loadFailed = true;
        console.error("[vega-lite] Load error:", err);
      }
      const message = err instanceof Error ? err.message : String(err);
      svgCache.set(key, `${ERROR_PREFIX}${message}`);
    }
  }
}

function baseFileFromEnv(env: Record<string, unknown>): string | null {
  const filePath = env?.filePath;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
}

/**
 * Render one fence to viewer HTML from the pre-render cache: a
 * `.vega-lite-block` wrapper whose `data-align` drives alignment (the same
 * mechanism as Mermaid/SMILES), or a `.vega-lite-error-block` fallback.
 * With `fitToWidth=false` the SVG is nested in a `.vega-lite-scroll-content`
 * inner wrapper (the SMILES scroll-mode pattern).
 */
export function renderVegaLiteFence(
  content: string,
  options: Record<string, unknown>,
  env?: Record<string, unknown>,
): string {
  const typed = resolveVegaLiteOptions(options);
  const appTheme = themeSnapshotFromEnv(env) ?? getVegaAppTheme();
  const key = cacheKey(content, appTheme, typed);
  const entry = svgCache.get(key);

  if (entry === undefined) {
    return errorBlock(
      content,
      typed.align,
      "block was not pre-rendered (cache miss)",
    );
  }
  if (entry.startsWith(ERROR_PREFIX)) {
    return errorBlock(content, typed.align, entry.slice(ERROR_PREFIX.length));
  }
  const fitAttribute = typed.fitToWidth ? "" : ' data-fit-to-width="false"';
  const body = typed.fitToWidth
    ? entry
    : `<div class="vega-lite-scroll-content">${entry}</div>`;
  return `<div class="vega-lite-block" data-align="${typed.align}"${fitAttribute}>${body}</div>`;
}

function errorBlock(content: string, align: string, message: string): string {
  return (
    `<div class="vega-lite-block vega-lite-error-block" data-align="${align}">` +
    `<pre class="vega-lite-error">${escapeHtml(content.trimEnd())}</pre>` +
    `<p class="vega-lite-error-msg">Vega-Lite rendering failed: ${escapeHtml(message)}</p>` +
    `</div>`
  );
}

/**
 * Render fence content to a bare SVG string for export/print pipelines
 * (ODT/DOCX call this). Not cached — exports render fresh so the neutral
 * document theme and export font apply regardless of the viewer cache.
 */
export async function renderVegaLiteSvg(
  content: string,
  options: VegaLiteRenderOptions,
  baseFile: string | null = null,
): Promise<string> {
  return renderVegaLiteSpec(parseVegaLiteSpec(content), options, {
    variant: "viewer",
    baseFile,
  });
}

/** Export variant: forced light theme + concrete font stack (plan §7/§10). */
export async function renderVegaLiteSvgForExport(
  content: string,
  options: VegaLiteRenderOptions,
  baseFile: string | null = null,
): Promise<string> {
  return renderVegaLiteSpec(parseVegaLiteSpec(content), options, {
    variant: "export",
    baseFile,
  });
}

export function clearVegaLiteCache(): void {
  svgCache.clear();
}

export { ensureVegaLoaded, VEGA_LITE_OPTIONS_SCHEMA };
