import type MarkdownIt from "markdown-it";

/**
 * Markdown syntax levels: named presets over a feature set, plus a custom mode
 * for per-feature toggles. See PLAN-SYNTAX-LEVELS.md.
 *
 * Levels are a lint-style compatibility indicator, NOT a hard restriction:
 * rendering always stays full-featured. The Viewer ignores levels entirely;
 * only the editor (lint diagnostics) and the status bar (badge) consume them.
 */

export type MarkdownLevel = "basic" | "github" | "advanced" | "custom";

export interface FeatureToggle {
  /** Stable toggle id, e.g. "tables", "raw-html". */
  id: string;
  /** Human-readable label, used in the checklist and warnings. */
  label: string;
  /** Preset membership. `basic` is always off (omits both keys). */
  presets: { github?: boolean; advanced: boolean };
}

export interface UsedFeature extends FeatureToggle {
  /** All occurrence line numbers (1-based, deduped). */
  lines: number[];
}

export interface FeatureDetector extends FeatureToggle {
  /**
   * Walk the token stream and return occurrence line numbers (1-based).
   * Empty array = feature not used in this document.
   */
  detect(tokens: Token[], env: Record<string, unknown>): number[];
}

type Token = ReturnType<MarkdownIt["parse"]>[number];

/**
 * Maximum number of occurrence lines shown per feature in the status-bar
 * popup (display-only; the editor marks ALL problem lines).
 */
export const MAX_DISPLAY_LINES = 5;

const detectors: FeatureDetector[] = [];

/**
 * Register feature detectors. Plan 2 (math) registers its own detectors via
 * this same entry point so presets auto-extend without touching the engine.
 */
export function registerFeatureDetectors(...dets: FeatureDetector[]): void {
  for (const d of dets) {
    if (!detectors.some((x) => x.id === d.id)) detectors.push(d);
  }
}

/** Remove a registered detector by id (primarily for tests). */
export function unregisterFeatureDetector(id: string): void {
  const i = detectors.findIndex((x) => x.id === id);
  if (i >= 0) detectors.splice(i, 1);
}

/** List all registered toggles (presets derive from this). */
export function listFeatureToggles(): FeatureToggle[] {
  return detectors.map(({ id, label, presets }) => ({ id, label, presets }));
}

/** Compute the enabledFeatures array for a named preset. */
export function presetFor(level: "basic" | "github" | "advanced"): string[] {
  if (level === "basic") return [];
  if (level === "github") {
    return listFeatureToggles()
      .filter((t) => t.presets.github)
      .map((t) => t.id);
  }
  return listFeatureToggles()
    .filter((t) => t.presets.advanced)
    .map((t) => t.id);
}

/**
 * Smallest preset that enables the toggle, or null if no preset enables it
 * (custom-only). Used to phrase warnings: "requires: advanced".
 */
export function requiredPreset(
  toggle: FeatureToggle,
): "basic" | "github" | "advanced" | null {
  if (toggle.presets.github) return "github";
  if (toggle.presets.advanced) return "advanced";
  return null;
}

/** Human-readable warning for a used-but-disabled feature. */
export function violationMessage(
  v: UsedFeature,
  currentLevel: MarkdownLevel,
): string {
  const required = requiredPreset(v);
  if (required === null) {
    return `${v.label} is disabled (custom level)`;
  }
  return `${v.label} is above the '${currentLevel}' level (requires: ${required})`;
}

/** Run all registered detectors over an existing token stream. */
export function analyzeTokens(
  tokens: Token[],
  env: Record<string, unknown>,
): UsedFeature[] {
  const out: UsedFeature[] = [];
  for (const det of detectors) {
    const lines = dedupe(det.detect(tokens, env));
    if (lines.length > 0) out.push({ ...det, lines });
  }
  return out;
}

/** Used features not present in `enabledFeatures`. */
export function findViolations(
  used: UsedFeature[],
  enabledFeatures: string[],
): UsedFeature[] {
  const enabled = new Set(enabledFeatures);
  return used.filter((u) => !enabled.has(u.id));
}

function dedupe(lines: number[]): number[] {
  const out: number[] = [];
  for (const l of lines) {
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

function hasAttrClass(token: Token, name: string): boolean {
  if (!token.attrs) return false;
  for (const [k, v] of token.attrs) {
    if (k === "class" && v && v.split(/\s+/).includes(name)) return true;
  }
  return false;
}

/** Iterate inline token children, yielding the precise line number. */
function* inlineChildren(
  tokens: Token[],
): Iterable<{ child: Token; line: number }> {
  for (const t of tokens) {
    if (t.type === "inline" && t.map && t.children) {
      let line = t.map[0] + 1;
      for (const c of t.children) {
        if (c.type === "softbreak" || c.type === "hardbreak") {
          line++;
        } else {
          yield { child: c, line };
        }
      }
    }
  }
}

// --- The 7 detectors of this plan ------------------------------------------

registerFeatureDetectors(
  {
    id: "tables",
    label: "Tables",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        if (t.type === "table_open" && t.map) lines.push(t.map[0] + 1);
      }
      return lines;
    },
  },
  {
    id: "strikethrough",
    label: "Strikethrough ~~x~~",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const { child, line } of inlineChildren(tokens)) {
        if (child.type === "s_open") lines.push(line);
      }
      return lines;
    },
  },
  {
    id: "task-lists",
    label: "Task lists - [ ]",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        if (
          t.type === "list_item_open" &&
          t.map &&
          hasAttrClass(t, "task-list-item")
        ) {
          lines.push(t.map[0] + 1);
        }
      }
      return lines;
    },
  },
  {
    id: "autolinks",
    label: "Bare-URL autolinks",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const { child, line } of inlineChildren(tokens)) {
        // `markup === 'linkify'` = bare-URL autolink (the linkify rule).
        // `markup === 'autolink'` = CommonMark `<https://...>` (always allowed
        // at basic, NOT this toggle).
        if (child.type === "link_open" && child.markup === "linkify") {
          lines.push(line);
        }
      }
      return lines;
    },
  },
  {
    id: "footnotes",
    label: "Footnotes [^x]",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const { child, line } of inlineChildren(tokens)) {
        if (child.type === "footnote_ref") lines.push(line);
      }
      // Also detect `footnote_block_open` so a doc with only definitions
      // (no inline references) still flags the feature.
      for (const t of tokens) {
        if (t.type === "footnote_block_open" && t.map) {
          lines.push(t.map[0] + 1);
        }
      }
      return lines;
    },
  },
  {
    id: "raw-html",
    label: "Raw HTML",
    presets: { github: true, advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const t of tokens) {
        if (t.type === "html_block" && t.map) lines.push(t.map[0] + 1);
      }
      for (const { child, line } of inlineChildren(tokens)) {
        if (child.type === "html_inline") {
          // The markdown-it-task-lists plugin injects a checkbox <input> as an
          // html_inline token; that's plugin output, not HTML the user wrote,
          // so it must not trigger the raw-html toggle (otherwise every task
          // list item would also warn as raw HTML).
          if (child.content.includes("task-list-item-checkbox")) continue;
          lines.push(line);
        }
      }
      return lines;
    },
  },
  {
    id: "frontmatter",
    label: "YAML frontmatter",
    presets: { advanced: true },
    detect(_tokens, env) {
      if (
        typeof env.frontmatter === "string" &&
        env.frontmatter.trim().length > 0
      ) {
        return [1];
      }
      return [];
    },
  },
  {
    id: "highlight",
    label: "Highlight ==x==",
    presets: { advanced: true },
    detect(tokens) {
      const lines: number[] = [];
      for (const { child, line } of inlineChildren(tokens)) {
        if (child.type === "mark_open") lines.push(line);
      }
      return lines;
    },
  },
);
