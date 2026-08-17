import type { Frontmatter } from "$lib/types";
import { inlineCssAssets, inlineImages } from "./assets";

/**
 * Build a self-contained standalone HTML document from rendered viewer HTML.
 * Collects the same-origin stylesheets (app + theme + KaTeX + markdown),
 * inlines their `url(...)` font assets to data URIs, and inlines
 * `localimg://` / `asset://` image srcs. The result has no external
 * dependencies and can be opened offline.
 */

/** Collect cssText from every same-origin stylesheet currently in the document. */
function collectStylesheets(cssTextFallback: string): string {
  if (typeof document === "undefined") return cssTextFallback;
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Cross-origin sheets throw on cssRules access; skip them.
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        out.push(rule.cssText);
      }
    } catch {
      // Cross-origin or restricted; skip silently.
    }
  }
  return out.length > 0 ? out.join("\n") : cssTextFallback;
}

/** Derive a sensible <title> from frontmatter or the file name. */
function deriveTitle(
  frontmatter: Frontmatter | null,
  fileName: string,
): string {
  if (frontmatter?.name && typeof frontmatter.name === "string") {
    return frontmatter.name;
  }
  if (frontmatter?.title && typeof frontmatter.title === "string") {
    return frontmatter.title;
  }
  return fileName || "Untitled";
}

function isTransparent(color: string): boolean {
  return (
    !color ||
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color === "rgba(0,0,0,0)"
  );
}

/**
 * Resolve the viewer-content background so the exported HTML can apply it
 * to <body>, making the content background bleed edge-to-edge. Falls back
 * to the body background, then white.
 */
function resolveViewerBackground(): string {
  if (typeof document === "undefined") return "";
  const viewerEl = document.getElementById("viewer-content");
  if (viewerEl) {
    const cs = getComputedStyle(viewerEl);
    if (!isTransparent(cs.backgroundColor)) return cs.backgroundColor;
  }
  const bodyColor = getComputedStyle(document.body).backgroundColor;
  return isTransparent(bodyColor) ? "#ffffff" : bodyColor;
}

export interface BuildStandaloneHtmlOptions {
  /** Fetch implementation (overridable for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Tauri invoke implementation (overridable for tests). */
  invokeImpl?: (
    cmd: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>;
  /** Pre-collected CSS (used when document.styleSheets is unavailable, e.g. tests). */
  cssText?: string;
}

export async function buildStandaloneHtml(
  html: string,
  frontmatter: Frontmatter | null,
  fileName: string,
  options: BuildStandaloneHtmlOptions = {},
): Promise<{ html: string; warnings: string[] }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const warnings: string[] = [];

  // 1. Collect CSS from the live document (app + theme + KaTeX + markdown).
  const rawCss = collectStylesheets(options.cssText ?? "");

  // 2. Inline url(...) font assets (woff2) into data URIs.
  const { value: inlinedCss, warnings: cssWarnings } = await inlineCssAssets(
    rawCss,
    fetchImpl,
  );
  warnings.push(...cssWarnings);

  // 3. Inline localimg:// / asset:// image srcs into data URIs.
  const { value: inlinedHtml, warnings: imgWarnings } = await inlineImages(
    html,
    fetchImpl,
    options.invokeImpl,
  );
  warnings.push(...imgWarnings);

  // 4. Resolve viewer-content background for edge-to-edge bleed.
  const viewerBg = resolveViewerBackground();
  const bodyBgCss = viewerBg
    ? `\nhtml, body { height: auto; }\nbody { background: ${viewerBg}; }`
    : "";

  const title = deriveTitle(frontmatter, fileName);

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${inlinedCss}${bodyBgCss}
</style>
</head>
<body>
<div class="viewer-content" id="viewer-content">
${inlinedHtml}
</div>
</body>
</html>
`;

  return { html: doc, warnings };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
