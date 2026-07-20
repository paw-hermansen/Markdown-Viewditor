/**
 * Single source of truth for resolving markdown link/image hrefs.
 *
 * Designed to behave identically on Windows, macOS, and Linux without runtime
 * platform detection: the classification is purely string-based and covers
 * every form an absolute or relative local path can take on any OS, plus the
 * standard URL schemes.
 *
 * The returned {@link ResolvedLink} tells the caller *how* to route the href
 * (in-page anchor, external URL, or local-filesystem path) but does not
 * perform the routing itself — that stays in the component layer so this module
 * stays free of Tauri imports and is trivially unit-testable.
 */

export type ResolvedLink =
  /** In-page anchor like `#section`. */
  | { kind: "anchor"; id: string }
  /** Web URL, mailto:, custom schemes (slack://, vscode://), file:// URLs. */
  | { kind: "url"; href: string }
  /**
   * Absolute local path (Windows drive, UNC, or Unix) or a relative path
   * resolved against the base file's directory. Always normalized to forward
   * slashes.
   */
  | { kind: "local-path"; path: string };

const URL_SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const WIN_DRIVE_PREFIX_RE = /^[A-Za-z]:[\\/]/;

/**
 * Resolve a markdown link/image href against the file currently being viewed.
 *
 * @param baseFile Absolute path of the .md file containing the href, or null
 *                 if no file is open. When null, relative hrefs fall back to
 *                 the `url` branch (and `openUrl` will most likely fail).
 * @param href     Raw href as it appeared in the markdown source. May be
 *                 percent-encoded (markdown-it URL-encodes backslashes and
 *                 other special characters in link destinations, so a user
 *                 writing `C:\Users\file.md` will arrive here as
 *                 `C:%5CUsers%5Cfile.md`).
 */
export function resolveLink(
  baseFile: string | null,
  href: string,
): ResolvedLink {
  if (typeof href !== "string" || href.length === 0) {
    return { kind: "url", href };
  }

  // 1. In-page anchor. Anchors can be URL-encoded too (e.g. `#foo%20bar`).
  if (href.startsWith("#")) {
    return { kind: "anchor", id: decodeSafe(href.slice(1)) };
  }

  // markdown-it URL-encodes backslashes and other special characters in link
  // destinations, so a user writing `C:\Users\file.md` arrives here as
  // `C:%5CUsers%5Cfile.md`. Classification needs the decoded form so a
  // single-letter drive prefix is not mistaken for a URL scheme.
  const decoded = decodeSafe(href);

  // 2. URL scheme. A single letter followed by ":" (e.g. `C:`) is NOT a URL
  //    scheme — it's a Windows drive prefix. Require either a multi-letter
  //    scheme, or a single-letter scheme followed by `//` (e.g. `file://`).
  const schemeMatch = URL_SCHEME_RE.exec(decoded);
  if (schemeMatch) {
    const scheme = schemeMatch[1];
    const restStart = schemeMatch[0].length;
    const followedBySlashes = decoded.slice(restStart).startsWith("//");
    if (scheme.length > 1 || followedBySlashes) {
      // URLs are returned with the ORIGINAL href (not decoded) so the
      // browser/OS sees the properly percent-encoded form.
      return { kind: "url", href };
    }
  }

  // 3. UNC path: `\\server\share\...` or `//server/share/...`.
  if (/^[\\/]{2}/.test(decoded)) {
    return { kind: "local-path", path: normalizeSlashes(decoded) };
  }

  // 4. Windows drive-absolute: `C:\...` or `C:/...`.
  if (WIN_DRIVE_PREFIX_RE.test(decoded)) {
    return { kind: "local-path", path: decoded.replace(/\\/g, "/") };
  }

  // 5. Unix-absolute: `/...`.
  if (decoded.startsWith("/")) {
    return { kind: "local-path", path: decoded };
  }

  // 6. Relative path — resolve against the base file's directory.
  if (baseFile) {
    return { kind: "local-path", path: resolveRelative(baseFile, decoded) };
  }

  // Degenerate fallback: no base file, relative href. Let `openUrl` try.
  return { kind: "url", href };
}

/** Percent-decode a string, returning the input unchanged on malformed input. */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Normalize backslashes to forward slashes and collapse leading slash runs. */
function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "//");
}

/**
 * Resolve a relative href against a base file's directory, preserving the
 * absolute prefix of the base (Windows drive letter, UNC `//server/share`, or
 * Unix `/`). `..` cannot pop past the absolute root. The returned path uses
 * forward slashes only.
 */
function resolveRelative(baseFile: string, href: string): string {
  const normalizedBase = baseFile.replace(/\\/g, "/");
  const normalizedHref = href.replace(/\\/g, "/");

  // Drop the file name — keep only the directory portion.
  const lastSlash = normalizedBase.lastIndexOf("/");
  const baseDir = lastSlash >= 0 ? normalizedBase.slice(0, lastSlash) : "";

  const parsed = parseAbsolute(baseDir);
  const body = applySegments(parsed.bodySegments, normalizedHref);
  return assemble(parsed, body);
}

type ParsedPath = {
  /** Reconstructable prefix that `..` cannot pop past. */
  prefix: string;
  /** Body segments after the prefix. */
  bodySegments: string[];
  /** Whether the path is absolute (has a recognized prefix). */
  absolute: boolean;
};

/**
 * Split an already-forward-slashed path into its absolute prefix and body
 * segments. For UNC, the prefix includes `//server/share` (the share is the
 * unpoppable root). For drive paths, the prefix is `C:`. For Unix paths, the
 * prefix is `/`.
 */
function parseAbsolute(dir: string): ParsedPath {
  // UNC: `//server/share[/...]`
  if (dir.startsWith("//")) {
    const rest = dir.slice(2);
    const parts = rest.split("/").filter((s) => s.length > 0);
    if (parts.length >= 2) {
      const prefix = `//${parts[0]}/${parts[1]}`;
      return {
        prefix,
        bodySegments: parts.slice(2),
        absolute: true,
      };
    }
    // Degenerate: `//server` with no share. Treat the whole thing as prefix.
    return {
      prefix: dir,
      bodySegments: [],
      absolute: true,
    };
  }

  // Windows drive: `C:/...`
  if (
    dir.length >= 2 &&
    /^[A-Za-z]:$/.test(dir.slice(0, 2)) &&
    (dir.length === 2 || dir[2] === "/")
  ) {
    const prefix = dir.slice(0, 2);
    const body = dir.length > 2 ? dir.slice(3) : "";
    return {
      prefix,
      bodySegments: body.length > 0 ? body.split("/") : [],
      absolute: true,
    };
  }

  // Unix absolute: `/...`
  if (dir.startsWith("/")) {
    const prefix = "/";
    const body = dir.slice(1);
    return {
      prefix,
      bodySegments: body.length > 0 ? body.split("/") : [],
      absolute: true,
    };
  }

  // Relative base dir (shouldn't normally happen for an open file, but
  // handle it gracefully by treating the whole thing as body segments).
  return {
    prefix: "",
    bodySegments:
      dir.length > 0 ? dir.split("/").filter((s) => s.length > 0) : [],
    absolute: false,
  };
}

/** Apply href segments (`..`, `.`, normal) on top of the base body segments. */
function applySegments(baseSegments: string[], href: string): string[] {
  const out = [...baseSegments];
  for (const seg of href.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out;
}

/** Reassemble the parsed prefix with the (possibly modified) body segments. */
function assemble(parsed: ParsedPath, body: string[]): string {
  const bodyStr = body.join("/");
  if (parsed.prefix.length === 0) return bodyStr;
  // UNC prefix already contains `//server/share`; join with `/` if there's
  // body content.
  if (parsed.prefix.startsWith("//")) {
    return bodyStr.length > 0 ? `${parsed.prefix}/${bodyStr}` : parsed.prefix;
  }
  // Drive prefix (`C:`) needs a `/` separator before body content.
  if (/^[A-Za-z]:$/.test(parsed.prefix)) {
    return bodyStr.length > 0 ? `${parsed.prefix}/${bodyStr}` : parsed.prefix;
  }
  // Unix prefix is `/`; join with body.
  return bodyStr.length > 0 ? `/${bodyStr}` : parsed.prefix;
}
