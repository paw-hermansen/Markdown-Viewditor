/**
 * SVG → PNG rasterization. Used by the ODT exporter when the user opts to
 * embed SVGs as raster images instead of vector SVG (broader compatibility
 * with ODT consumers that don't render inline SVG well).
 *
 * Platform split:
 *   - Linux (WebKitGTK): the WebView refuses to decode SVG data URIs
 *     through the image element, so we route to a Rust-side
 *     `resvg` command (`invoke('rasterize_svg')`). That command is only
 *     compiled into Linux builds via `[target.'cfg(target_os = "linux")'.
 *     dependencies]` in Cargo.toml, so Windows/macOS bundles don't pay
 *     the resvg binary-size cost.
 *   - Windows/macOS (WebView2 / WKWebView): the WebView handles SVG via
 *     `Image` + data URI reliably, so we use the browser-native path.
 *     `IS_LINUX` skips the Tauri invoke entirely there.
 *
 * Both paths produce the same PNG byte contract: a `Uint8Array` ready
 * to drop into the ODT `Pictures/` directory.
 */

import { invoke } from "@tauri-apps/api/core";

export const MAX_RASTER_AXIS_PX = 4096;

/**
 * True only on the Linux Tauri build, where the Rust resvg path runs.
 * Read at call time (not module-load) so tests can swap the user agent
 * to verify platform-conditional behavior.
 */
function isLinux(): boolean {
  return typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent);
}

/**
 * Rasterize an SVG markup string to PNG bytes.
 *
 * @param svgXml - The raw `<svg>…</svg>` markup.
 * @param widthPx - Intrinsic SVG width in CSS px (must be > 0).
 * @param heightPx - Intrinsic SVG height in CSS px (must be > 0).
 * @param scale - Pixel-scale multiplier (1 = 96 DPI, 2 = Retina, etc.).
 * @returns PNG file bytes.
 * @throws If width/height aren't usable, or every rasterization path
 *   fails (callers fall back to embedding the SVG as a vector).
 */
export async function rasterizeSvg(
  svgXml: string,
  widthPx: number,
  heightPx: number,
  scale: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(widthPx) || widthPx <= 0) {
    throw new Error(`rasterizeSvg: invalid widthPx ${widthPx}`);
  }
  if (!Number.isFinite(heightPx) || heightPx <= 0) {
    throw new Error(`rasterizeSvg: invalid heightPx ${heightPx}`);
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`rasterizeSvg: invalid scale ${scale}`);
  }

  const targetW = Math.round(widthPx * scale);
  const targetH = Math.round(heightPx * scale);
  if (targetW > MAX_RASTER_AXIS_PX || targetH > MAX_RASTER_AXIS_PX) {
    throw new Error(
      `rasterizeSvg: raster size ${targetW}x${targetH} exceeds ${MAX_RASTER_AXIS_PX}px limit`,
    );
  }

  // Always size the SVG before any path — resvg and Image both want
  // explicit width/height attributes so they can rasterize at the
  // caller's intended pixel density. `injectSvgDimensions` also adds
  // xmlns + xmlns:xlink when missing, which usvg's strict parser
  // requires (browsers accept inline SVG without the namespace).
  const sizedSvg = injectSvgDimensions(svgXml, widthPx, heightPx);

  // Linux → Rust-side resvg. Windows/macOS → skip the invoke entirely.
  if (isLinux()) {
    try {
      const png = await invoke<number[]>("rasterize_svg", {
        svg: sizedSvg,
        width: widthPx,
        height: heightPx,
        scale,
      });
      return new Uint8Array(png);
    } catch (err) {
      // resvg parse/PNG-encode failed; fall through to the WebView path
      // as a last resort. If the WebView also fails, the caller logs the
      // warning and embeds the SVG as a vector.
      console.warn("rasterizeSvg: resvg failed, trying WebView fallback", err);
    }
  }

  return rasterizeSvgViaWebView(sizedSvg, targetW, targetH);
}

/**
 * WebView-native fallback: load the SVG through a data URI into an
 * `Image`, draw onto a canvas, return PNG bytes. Works on WebView2 and
 * WKWebView; on WebKitGTK it usually fails (caller catches the throw).
 * `sizedSvg` should already have its namespace + dimensions injected
 * (`injectSvgDimensions` at the top of `rasterizeSvg`).
 */
async function rasterizeSvgViaWebView(
  sizedSvg: string,
  targetW: number,
  targetH: number,
): Promise<Uint8Array> {
  const dataUri = svgToDataUri(sizedSvg);
  const image = await loadSvgImage(dataUri);

  try {
    const canvas = createCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("rasterizeSvg: 2d context unavailable");
    ctx.drawImage(image, 0, 0, targetW, targetH);
    return await canvasToPng(canvas);
  } finally {
    image.src = "";
  }
}

/**
 * Build the option-group entry the ODT exporter exposes for SVG
 * rasterization, so the dialog can show its hint consistently.
 */
export const SVG_RASTER_HINT =
  "Render all SVGs (inline, <img>, ![…](*.svg)) as PNG images instead of vector SVG.";

/* ──────────────────── helpers ────────────────────────────────────────── */

function injectSvgDimensions(
  svgXml: string,
  widthPx: number,
  heightPx: number,
): string {
  // Only touches the very first <svg …> tag. Also injects the SVG XML
  // namespace (and xlink namespace, used by SVG 1.1 `xlink:href` on
  // `<use>` / `<animate>` / etc.) when missing — usvg/resvg's parser is
  // strict and rejects unprefixed attributes without a namespace (browsers
  // accept inline SVG because the HTML host provides the namespace).
  return svgXml.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    // Strip width/height and namespaces in a single pass to avoid
    // re-matching just-stripped attrs when stripAttr is called twice
    // (which would duplicate them in the output).
    const cleaned = stripAttrs(attrs, ["width", "height"]);
    const xmlns = /\bxmlns(?:\s*:\s*svg)?\s*=/.test(attrs)
      ? ""
      : ' xmlns="http://www.w3.org/2000/svg"';
    const xlink = /\bxmlns\s*:\s*xlink\s*=/.test(attrs)
      ? ""
      : ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    return `<svg${cleaned}${xmlns}${xlink} width="${widthPx}" height="${heightPx}">`;
  });
}

/**
 * Remove every attribute in `names` from a tag-fragment string.
 * Used by `injectSvgDimensions` to drop existing width/height once.
 */
function stripAttrs(attrs: string, names: string[]): string {
  let out = attrs;
  for (const n of names) {
    out = out
      .replace(new RegExp(`\\s+${n}\\s*=\\s*"[^"]*"`, "i"), "")
      .replace(new RegExp(`\\s+${n}\\s*=\\s*'[^']*'`, "i"), "")
      .replace(new RegExp(`\\s+${n}\\s*=\\s*[^\\s>]+`, "i"), "");
  }
  return out;
}

function svgToDataUri(svgXml: string): string {
  // UTF-8 encode then base64 (handles any non-ASCII bytes in the markup).
  const bytes = new TextEncoder().encode(svgXml);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * Load an SVG data URI into an `HTMLImageElement` and resolve once the
 * bitmap is decoded. Rejects on `onerror` so the caller can fall back.
 */
function loadSvgImage(dataUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("rasterizeSvg: no Image constructor available"));
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          `rasterizeSvg: image failed to load (${img.src.slice(0, 80)}…)`,
        ),
      );
    img.src = dataUri;
  });
}

/** Canvas factory — prefers OffscreenCanvas; falls back to HTMLCanvasElement. */
export function createCanvas(width: number, height: number): RasterCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as RasterCanvas;
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas") as RasterCanvas;
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("rasterizeSvg: no canvas implementation available");
}

export interface RasterCanvas {
  width: number;
  height: number;
  getContext(id: "2d"): {
    drawImage: (
      image: CanvasImageSource,
      dx: number,
      dy: number,
      dw?: number,
      dh?: number,
    ) => void;
  } | null;
  convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
  toBlob?: (
    cb: (b: Blob | null) => void,
    type?: string,
    quality?: unknown,
  ) => void;
  toDataURL?: (type?: string, quality?: unknown) => string;
}

async function canvasToPng(canvas: RasterCanvas): Promise<Uint8Array> {
  if (typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof canvas.toBlob === "function") {
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob!((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("rasterizeSvg: toBlob returned null");
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return base64ToBytes(dataUrl.slice(comma + 1));
  }
  throw new Error("rasterizeSvg: canvas has no PNG export method");
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
