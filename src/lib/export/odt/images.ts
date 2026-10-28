import type { InvokeImpl } from "../assets";
import { fileState } from "$lib/stores/file.svelte";
import { base64ToBytes } from "$lib/utils/base64";
import {
  extensionFromMime,
  extractLocalImgPath,
  mimeFromHref,
} from "../image-src";

/* ─────────────────────── image resolution ────────────────────────────── */

/**
 * Parse a CSS/HTML length attribute into inches, or `null` when it is not a
 * length we can make absolute (`%`, `em`, …).
 *
 * Every `svg:width`/`svg:height` this exporter writes goes through here, so
 * ODF always gets a real absolute unit. The proportional-dimension math
 * especially needs this: it scales one given dimension by the image's aspect
 * ratio, and reading `2in` as 192 pixels (`value / 96` regardless of unit)
 * produced a 0.02in image.
 */
export function cssLengthToInches(raw: string): number | null {
  const match = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  switch (match[2].toLowerCase()) {
    case "":
      // HTML length attributes: a bare number means pixels.
      return value / 96;
    case "px":
      return value / 96;
    case "in":
      return value;
    case "cm":
      return value / 2.54;
    case "mm":
      return value / 25.4;
    case "pt":
      return value / 72;
    case "pc":
      return value / 6;
    default:
      return null;
  }
}

/** Format an inch length for an `svg:width` / `svg:height` attribute. */
export function inchesAttr(value: number): string {
  return `${value.toFixed(4)}in`;
}

export interface ResolvedImage {
  name: string;
  mime: string;
  data: Uint8Array;
  widthPx: number;
  heightPx: number;
}

export function sniffSvgDimensions(
  data: Uint8Array,
  src: string,
  warnings: string[],
): { width: number; height: number } | null {
  const chunkSize = Math.min(data.length, 8192);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(
    data.slice(0, chunkSize),
  );

  const tagMatch = text.match(/<svg\b[^>]*>/is);
  if (!tagMatch) {
    warnings.push(`SVG ${src} could not be parsed for dimensions`);
    return null;
  }

  const tag = tagMatch[0];

  function attr(name: string): string | null {
    const re = new RegExp(
      `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    );
    const m = tag.match(re);
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  }

  function parseDim(
    raw: string | null,
  ): { value: number; isPercent: boolean } | null {
    if (!raw) return null;
    const m = raw
      .trim()
      .match(/^([+-]?\d*\.?\d+)(%|px|pt|in|cm|mm|pc|em|ex|ch|rem)?$/i);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const unit = (m[2] || "px").toLowerCase();
    if (unit === "%") return { value: num, isPercent: true };
    switch (unit) {
      case "px":
        return { value: num, isPercent: false };
      case "in":
        return { value: num * 96, isPercent: false };
      case "cm":
        return { value: num * (96 / 2.54), isPercent: false };
      case "mm":
        return { value: num * (96 / 25.4), isPercent: false };
      case "pt":
        return { value: num * (96 / 72), isPercent: false };
      case "pc":
        return { value: num * 16, isPercent: false };
      default:
        return { value: num, isPercent: false };
    }
  }

  const w = parseDim(attr("width"));
  const h = parseDim(attr("height"));

  if ((w && w.isPercent) || (h && h.isPercent)) {
    warnings.push(
      `SVG ${src} uses percentage dimensions \u2014 cannot determine absolute size for ODT export`,
    );
    return null;
  }

  if (w && !w.isPercent && h && !h.isPercent) {
    return { width: Math.round(w.value), height: Math.round(h.value) };
  }

  const vb = attr("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const vbW = parseFloat(parts[2]);
      const vbH = parseFloat(parts[3]);
      if (!isNaN(vbW) && !isNaN(vbH) && vbW > 0 && vbH > 0) {
        if (w && !w.isPercent) {
          const scale = w.value / vbW;
          return {
            width: Math.round(w.value),
            height: Math.round(vbH * scale),
          };
        }
        if (h && !h.isPercent) {
          const scale = h.value / vbH;
          return {
            width: Math.round(vbW * scale),
            height: Math.round(h.value),
          };
        }
        return { width: Math.round(vbW), height: Math.round(vbH) };
      }
    }
  }

  if (w || h) {
    warnings.push(
      `SVG ${src} has only one dimension without viewBox \u2014 cannot determine aspect ratio for ODT export`,
    );
    return null;
  }

  warnings.push(
    `SVG ${src} lacks width, height, or viewBox \u2014 may not render correctly in ODT`,
  );
  return null;
}

export function sniffImageDimensions(
  data: Uint8Array,
  mime: string,
  src: string,
  warnings: string[],
): {
  width: number;
  height: number;
} {
  if (mime === "image/svg+xml") {
    return sniffSvgDimensions(data, src, warnings) ?? { width: 0, height: 0 };
  }
  // PNG: IHDR chunk at offset 8, width 4 bytes BE at 16, height at 20
  if (mime === "image/png" && data.length > 24) {
    return {
      width: (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19],
      height: (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23],
    };
  }
  // GIF: width 2 bytes LE at 6, height at 8
  if (mime === "image/gif" && data.length > 9) {
    return {
      width: data[6] | (data[7] << 8),
      height: data[8] | (data[9] << 8),
    };
  }
  // JPEG: scan for SOF marker
  if (mime === "image/jpeg" && data.length > 4) {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xff) break;
      const marker = data[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: (data[offset + 5] << 8) | data[offset + 6],
          width: (data[offset + 7] << 8) | data[offset + 8],
        };
      }
      const segLen = (data[offset + 2] << 8) | data[offset + 3];
      offset += 2 + segLen;
    }
  }
  return { width: 0, height: 0 };
}

export async function resolveImage(
  src: string,
  invokeImpl: InvokeImpl,
  images: Map<string, ResolvedImage>,
  imageCounter: { n: number },
  warnings: string[],
): Promise<string> {
  // Keyed by source URL, not by the generated package name — that is what
  // makes a second reference to the same picture a cache hit instead of a
  // second embed plus a second IPC read.
  if (images.has(src)) return images.get(src)!.name;

  let bytes: Uint8Array | null = null;
  let mime = "image/png";

  const localPath = extractLocalImgPath(src);
  if (localPath) {
    try {
      const base64 = (await invokeImpl("read_file_as_base64", {
        path: localPath,
      })) as string;
      mime = mimeFromHref(localPath);
      bytes = base64ToBytes(base64);
    } catch (err) {
      warnings.push(
        `Image ${localPath} could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
      return src;
    }
  } else if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mime = match[1];
      bytes = base64ToBytes(match[2]);
    }
  } else if (/^https?:\/\//.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        mime = res.headers.get("content-type") ?? mimeFromHref(src);
        bytes = new Uint8Array(await res.arrayBuffer());
      } else {
        warnings.push(`Image ${src} returned ${res.status}`);
      }
    } catch (err) {
      warnings.push(
        `Image ${src} could not be fetched: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Relative path (e.g., ./ai_flower.png, image/foo.png) — resolve
    // against the current file's directory.
    const currentFile = fileState.currentFile;
    if (currentFile) {
      const dir = currentFile.replace(/[/\\][^/\\]+$/, "");
      // Decode URL-encoded characters (e.g., %20 → space)
      const decodedSrc = decodeURIComponent(src);
      // Normalize: strip leading ./ or .\
      const normalized = decodedSrc.replace(/^\.[/\\]/, "");
      const absPath = `${dir}/${normalized}`;
      try {
        const base64 = (await invokeImpl("read_file_as_base64", {
          path: absPath,
        })) as string;
        mime = mimeFromHref(absPath);
        bytes = base64ToBytes(base64);
      } catch (err) {
        warnings.push(
          `Image ${absPath} could not be read: ${err instanceof Error ? err.message : String(err)}`,
        );
        return src;
      }
    }
  }

  if (!bytes) return src;

  const ext = extensionFromMime(mime);
  const name = `Pictures/image${imageCounter.n++}.${ext}`;
  const dims = sniffImageDimensions(bytes, mime, src, warnings);
  images.set(src, {
    name,
    mime,
    data: bytes,
    widthPx: dims.width,
    heightPx: dims.height,
  });
  return name;
}
