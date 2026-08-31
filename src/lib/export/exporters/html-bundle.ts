/**
 * HTML Bundle exporter — produces a .zip containing an index.html with
 * images and fonts stored in separate subdirectories instead of inlined
 * as data URIs. The HTML references them with relative paths so the
 * bundle can be unpacked and served from any static host.
 *
 *   bundle.zip
 *   ├── index.html
 *   ├── images/
 *   │   ├── photo.png
 *   │   └── diagram.jpg
 *   └── fonts/
 *       ├── KaTeX_Main-Regular.woff2
 *       └── ...
 */

import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import type { Frontmatter } from "$lib/types";
import { fileState } from "$lib/stores/file.svelte";
import {
  generateFrontmatterCardHtml,
  OPTION_INCLUDE_FRONTMATTER,
} from "../frontmatter-card";

/* ─────────────────────── option ids / helpers ─────────────────────────── */

export const OPTION_ID = `html-bundle.${OPTION_INCLUDE_FRONTMATTER}`;

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function readIncludeFrontmatter(
  opts: Record<string, unknown> | undefined,
): boolean {
  return asBool(opts?.[OPTION_ID], true);
}

export function htmlBundleOptionGroups(ctx: ExportContext): OptionGroup[] {
  return [
    {
      id: "frontmatter",
      label: "Frontmatter",
      options: [
        {
          id: OPTION_ID,
          label: "Include frontmatter card",
          hint: "Show the frontmatter or skill card at the top of the exported document.",
          kind: "toggle",
          value: true,
          disabledWhen: () => ctx.frontmatter === null,
        },
      ],
    },
  ];
}

/* ─────────────────────── shared helpers (copied from document.ts) ─────── */

/** Collect cssText from every same-origin stylesheet currently in the document. */
function collectStylesheets(cssTextFallback: string): string {
  if (typeof document === "undefined") return cssTextFallback;
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ─────────────────────── asset helpers (from assets.ts) ───────────────── */

/** Match `url(...)` references in CSS, capturing the inside. */
const CSS_URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

/** Match `src="..."` and `src='...'` in <img> tags. */
const IMG_SRC_RE = /(<img\s[^>]*?src=)(['"])([^'"]+)\2/gi;

type InvokeImpl = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Extract the filesystem path from a Tauri local-file URL.
 *
 * Handles both platform variants:
 * - Linux/macOS: `localimg://localhost/<encoded-path>`
 * - Windows:     `http://localimg.localhost/<encoded-path>`
 *
 * Returns null when the src is not a recognized local-file URL.
 */
function extractLocalImgPath(src: string): string | null {
  for (const prefix of [
    "localimg://localhost/",
    "http://localimg.localhost/",
    "asset://localhost/",
    "http://asset.localhost/",
  ]) {
    if (src.startsWith(prefix)) {
      return decodeURIComponent(src.slice(prefix.length));
    }
  }
  return null;
}

function mimeFromHref(href: string): string {
  const ext = href.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/** Return the basename of a URL path or href (last segment). */
function basename(href: string): string {
  const clean = href.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || "unknown";
}

/* ─────────────────────── font extraction ──────────────────────────────── */

export interface ZipEntry {
  zipPath: string;
  data: Uint8Array;
  mime: string;
}

/**
 * Extract same-origin font assets from CSS `url(...)` references, returning
 * raw bytes and rewritten CSS with relative `fonts/` paths. Cross-origin
 * URLs are left untouched.
 */
export async function extractFonts(
  cssText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ entries: ZipEntry[]; css: string; warnings: string[] }> {
  const warnings: string[] = [];
  const matches = [...cssText.matchAll(CSS_URL_RE)];
  if (matches.length === 0) return { entries: [], css: cssText, warnings };

  const uniqueHrefs = [...new Set(matches.map((m) => m[2]))];
  const entries: ZipEntry[] = [];
  const rewriteMap = new Map<string, string>();

  await Promise.all(
    uniqueHrefs.map(async (href) => {
      if (/^(https?:|data:|blob:)/i.test(href)) return;
      try {
        const res = await fetchImpl(href);
        if (!res.ok) {
          warnings.push(`CSS asset ${href} returned ${res.status}`);
          return;
        }
        const data = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") ?? mimeFromHref(href);
        const name = basename(href);
        const zipPath = `fonts/${name}`;
        entries.push({ zipPath, data, mime });
        rewriteMap.set(href, zipPath);
      } catch (err) {
        warnings.push(
          `CSS asset ${href} could not be extracted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  let css = cssText;
  for (const [href, zipPath] of rewriteMap) {
    css = css.split(href).join(zipPath);
  }
  return { entries, css, warnings };
}

/* ─────────────────────── image extraction ─────────────────────────────── */

/**
 * Extract `localimg://` / `asset://` / `http://localhost` image srcs,
 * returning raw bytes and rewritten HTML with relative `images/` paths.
 * Non-local image URLs are left untouched.
 */
export async function extractImages(
  html: string,
  invokeImpl?: InvokeImpl,
): Promise<{ entries: ZipEntry[]; html: string; warnings: string[] }> {
  const warnings: string[] = [];
  const matches = [...html.matchAll(IMG_SRC_RE)];
  if (matches.length === 0) return { entries: [], html, warnings };

  const uniqueSrcs = [...new Set(matches.map((m) => m[3]))];
  const entries: ZipEntry[] = [];
  const rewriteMap = new Map<string, string>();

  // Track used names to handle collisions (e.g. two different paths both
  // ending in "logo.png").
  const usedNames = new Map<string, number>();

  await Promise.all(
    uniqueSrcs.map(async (src) => {
      if (
        !/^((localimg|asset):|https?:\/\/(localhost|localimg\.localhost|asset\.localhost)\/)/i.test(
          src,
        )
      )
        return;

      const localPath = extractLocalImgPath(src);
      let data: Uint8Array;
      let mime: string;

      try {
        if (localPath && invokeImpl) {
          const base64 = (await invokeImpl("read_file_as_base64", {
            path: localPath,
          })) as string;
          // Decode base64 to bytes.
          const binary = atob(base64);
          data = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            data[i] = binary.charCodeAt(i);
          }
          mime = mimeFromHref(localPath);
        } else {
          // http://localhost or asset:// — use fetch.
          const res = await fetch(src);
          if (!res.ok) {
            warnings.push(`Image ${localPath ?? src} returned ${res.status}`);
            return;
          }
          data = new Uint8Array(await res.arrayBuffer());
          mime = res.headers.get("content-type") ?? mimeFromHref(src);
        }
      } catch (err) {
        warnings.push(
          `Image ${localPath ?? src} could not be extracted: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      // Derive a unique filename, appending -N on collision.
      const rawName = basename(localPath ?? src);
      const count = usedNames.get(rawName) ?? 0;
      usedNames.set(rawName, count + 1);
      const name = count === 0 ? rawName : addSuffix(rawName, count);

      const zipPath = `images/${name}`;
      entries.push({ zipPath, data, mime });
      rewriteMap.set(src, zipPath);
    }),
  );

  let out = html;
  for (const [src, zipPath] of rewriteMap) {
    out = out.split(src).join(zipPath);
  }
  return { entries, html: out, warnings };
}

/**
 * Insert a numeric suffix before the file extension: "photo.png" → "photo-1.png".
 */
function addSuffix(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${n}`;
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
}

/* ─────────────────────── bundle HTML builder ──────────────────────────── */

export interface BuildBundleHtmlOptions {
  fetchImpl?: typeof fetch;
  invokeImpl?: InvokeImpl;
  cssText?: string;
  frontmatterCardHtml?: string;
}

export interface BuildBundleHtmlResult {
  html: string;
  fontEntries: ZipEntry[];
  imageEntries: ZipEntry[];
  warnings: string[];
}

/**
 * Build an HTML document with relative paths for images and fonts.
 * Returns the HTML string plus the extracted font and image zip entries.
 */
export async function buildBundleHtml(
  htmlBody: string,
  frontmatter: Frontmatter | null,
  fileName: string,
  options: BuildBundleHtmlOptions = {},
): Promise<BuildBundleHtmlResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const warnings: string[] = [];

  // 1. Collect CSS from the live document.
  const rawCss = collectStylesheets(options.cssText ?? "");

  // 2. Extract font assets → zip entries + rewritten CSS.
  const fontResult = await extractFonts(rawCss, fetchImpl);
  warnings.push(...fontResult.warnings);

  // 3. Extract image assets → zip entries + rewritten HTML.
  const imgResult = await extractImages(htmlBody, options.invokeImpl);
  warnings.push(...imgResult.warnings);

  // 4. Resolve viewer-content background.
  const viewerBg = resolveViewerBackground();
  const bodyBgCss = viewerBg
    ? `\nhtml, body { height: auto; background: ${viewerBg}; }`
    : "";

  const title = deriveTitle(frontmatter, fileName);
  const cardHtml = options.frontmatterCardHtml ?? "";

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontResult.css}${bodyBgCss}
</style>
</head>
<body>
<div class="viewer-content" id="viewer-content">
${cardHtml}${imgResult.html}
</div>
</body>
</html>
`;

  return {
    html: doc,
    fontEntries: fontResult.entries,
    imageEntries: imgResult.entries,
    warnings,
  };
}

/* ─────────────────────── export entry point ───────────────────────────── */

export async function exportHtmlBundle(
  markdown: string,
  html: string,
  frontmatter: Frontmatter | null,
  fileName: string,
  options?: Record<string, unknown>,
): Promise<ExportResult> {
  void markdown;
  const warnings: string[] = [];

  const defaultName = fileName
    ? fileName.replace(/\.[^.]+$/, "") + ".zip"
    : "Untitled.zip";
  const defaultDir = fileState.currentFile
    ? fileState.currentFile.replace(/[^/\\]+$/, "")
    : undefined;

  const savePath = await save({
    defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
    filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
  });
  if (!savePath) {
    return { warnings: [] };
  }

  const includeFrontmatter = readIncludeFrontmatter(options);
  const frontmatterCardHtml =
    includeFrontmatter && frontmatter
      ? generateFrontmatterCardHtml(frontmatter)
      : undefined;

  const bundle = await buildBundleHtml(html, frontmatter, fileName, {
    invokeImpl: invoke,
    frontmatterCardHtml,
  });
  warnings.push(...bundle.warnings);

  const zip = new JSZip();
  zip.file("index.html", bundle.html);
  for (const entry of bundle.fontEntries) {
    zip.file(entry.zipPath, entry.data);
  }
  for (const entry of bundle.imageEntries) {
    zip.file(entry.zipPath, entry.data);
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const uint8 = new Uint8Array(buffer);

  await invoke("write_file_binary", {
    path: savePath,
    content: Array.from(uint8),
  });

  return { savedPath: savePath, warnings };
}

/* ─────────────────────── exporter registration ────────────────────────── */

export const htmlBundleExporter: Exporter = {
  id: "html-bundle",
  label: "Export as HTML Bundle",
  description: "HTML with images folder",
  extension: "zip",
  themeCapable: true,
  optionGroups: htmlBundleOptionGroups,
  async export(ctx) {
    return exportHtmlBundle(
      ctx.markdown,
      ctx.html,
      ctx.frontmatter,
      ctx.fileName,
      ctx.options,
    );
  },
};
