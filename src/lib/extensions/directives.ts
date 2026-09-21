import type MarkdownIt from "markdown-it";
import { parseAttrString, validateFenceOptions } from "./fence-options";
import { getExtensionSchema } from "./registry";

/**
 * Pattern to match HTML comment directives:
 *   <!-- namespace: attrs -->
 *
 * Group 1: namespace (word characters)
 * Group 2: attribute string (rest of line before -->)
 */
const DIRECTIVE_RE = /^<!--\s*(\w+)\s*:\s*(.+?)\s*-->$/;

/**
 * Markdown-it core plugin that parses HTML comment directives.
 *
 * Walks all tokens after block parsing. For `html_block` tokens matching
 * `<!-- namespace: attrs -->`, extracts and validates attributes against
 * the extension's fenceOptionsSchema. Builds a cumulative state map
 * stored in `env.directives`.
 *
 * Also annotates `math_inline` child tokens with their parent `inline`
 * token's stream position so renderers can look up directive state.
 */
export function directivePlugin(md: MarkdownIt): void {
  md.core.ruler.push("directives", function (state) {
    const tokens = state.tokens;
    const env = state.env as Record<string, unknown>;

    // Directive state map: tokenStreamIndex → Map<namespace, options>
    const stateMap = new Map<number, Map<string, Record<string, unknown>>>();

    // Cumulative state per namespace (carried forward across tokens).
    const cumulative: Record<string, Record<string, unknown>> = {};

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Process html_block tokens for directives.
      if (token.type === "html_block") {
        const content = token.content;
        const lines = content.split("\n");
        let modified = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const match = DIRECTIVE_RE.exec(trimmed);
          if (!match) continue;

          const namespace = match[1];
          const rawAttrs = match[2];

          // Get the schema for this namespace.
          const schema = getExtensionSchema(namespace);
          if (!schema) {
            continue;
          }

          // Parse and validate attributes.
          const parsed = parseAttrString(rawAttrs);
          const validated = validateFenceOptions(parsed, schema);

          // Update cumulative state.
          if (!cumulative[namespace]) {
            cumulative[namespace] = {};
          }
          for (const [key, value] of Object.entries(validated)) {
            cumulative[namespace][key] = value;
          }

          // Store snapshot at this token index.
          const nsMap = new Map<string, Record<string, unknown>>();
          for (const [ns, state] of Object.entries(cumulative)) {
            nsMap.set(ns, { ...state });
          }
          stateMap.set(i, nsMap);

          // Remove the directive comment from the html_block content.
          token.content = token.content.replace(line, "");
          modified = true;
        }
        // Clean up empty html_block content.
        if (modified && token.content.trim() === "") {
          token.content = "";
        }
      }

      // Annotate inline token children with parent stream position.
      // This lets math_inline renderers look up directive state.
      if (token.type === "inline" && token.children) {
        for (const child of token.children) {
          if (child.type === "math_inline" || child.type === "math_block") {
            if (!child.meta) child.meta = {};
            child.meta._parentStreamIndex = i;
          }
        }
      }

      // Annotate top-level math_block tokens with their own stream position.
      if (token.type === "math_block") {
        if (!token.meta) token.meta = {};
        token.meta._parentStreamIndex = i;
      }
    }

    // Store the state map in env.
    env.directives = stateMap;
  });
}

/**
 * Get the directive state for a namespace at a specific token position.
 * Returns the cumulative state at the latest directive before or at `pos`.
 */
export function getDirectiveState(
  env: Record<string, unknown>,
  namespace: string,
  pos?: number,
): Record<string, unknown> {
  const stateMap = env.directives as
    Map<number, Map<string, Record<string, unknown>>> | undefined;
  if (!stateMap || stateMap.size === 0) return {};

  // If no position specified, return the latest state.
  const entries = [...stateMap.entries()].sort((a, b) => a[0] - b[0]);

  if (pos === undefined) {
    // Return the last entry's state for this namespace.
    for (let i = entries.length - 1; i >= 0; i--) {
      const nsState = entries[i][1].get(namespace);
      if (nsState) return nsState;
    }
    return {};
  }

  // Return the state at the latest directive before or at `pos`.
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i][0] <= pos) {
      const nsState = entries[i][1].get(namespace);
      if (nsState) return nsState;
    }
  }
  return {};
}

/**
 * Tracks fenced code block state across consecutive lines.
 * Used by raw-text scanners to skip directives inside fences.
 */
interface FenceState {
  inFence: boolean;
  fenceChar: string;
  fenceLen: number;
}

function isInsideFence(line: string, state: FenceState): boolean {
  const trimmed = line.trimStart();

  if (!state.inFence) {
    // Check for fence opening: ``` or ~~~ (3+ chars)
    const match = trimmed.match(/^(`{3,}|~{3,})/);
    if (match) {
      state.inFence = true;
      state.fenceChar = match[1][0];
      state.fenceLen = match[1].length;
      return false; // Opening line itself is not "inside"
    }
    return false;
  }

  // Check for fence closing: same char, at least same length, only whitespace after
  const match = trimmed.match(/^(`{3,}|~{3,})\s*$/);
  if (
    match &&
    match[1][0] === state.fenceChar &&
    match[1].length >= state.fenceLen
  ) {
    state.inFence = false;
    return false; // Closing line itself is not "inside"
  }

  return true; // Inside a fence
}

/**
 * Extract all math directives from the entire document.
 * Returns ONLY explicitly-set values (no schema defaults).
 * Used by the export pipeline which doesn't go through the render chain.
 *
 * Lines inside fenced code blocks (``` or ~~~) are skipped.
 */
export function extractMathDirectives(
  content: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const schema = getExtensionSchema("math");
  if (!schema) return result;

  const lines = content.split("\n");
  const fence: FenceState = { inFence: false, fenceChar: "", fenceLen: 0 };
  for (const line of lines) {
    if (isInsideFence(line, fence)) continue;

    const match = DIRECTIVE_RE.exec(line.trim());
    if (!match) continue;

    const namespace = match[1];
    if (namespace !== "math") continue;

    const rawAttrs = match[2];
    const parsed = parseAttrString(rawAttrs);

    // Only include keys the user explicitly set, not schema defaults.
    for (const [key, raw] of Object.entries(parsed)) {
      const def = schema[key];
      if (!def) continue;

      if (raw === false && def.type === "boolean") {
        result[key] = false;
      } else if (raw === false) {
        // !key on non-boolean → reset to default (skip, don't override)
        delete result[key];
      } else if (raw === true && def.type === "boolean") {
        result[key] = true;
      } else if (raw === true) {
        // bare flag on non-boolean → use default (skip)
      } else {
        // Coerce numeric strings.
        if (def.type === "number") {
          const num = typeof raw === "number" ? raw : parseFloat(String(raw));
          if (Number.isFinite(num)) {
            let clamped = num;
            if (def.min !== undefined && clamped < def.min) clamped = def.min;
            if (def.max !== undefined && clamped > def.max) clamped = def.max;
            result[key] = clamped;
          }
        } else if (def.type === "string") {
          const str = String(raw);
          if (!def.values || def.values.includes(str)) {
            result[key] = str;
          }
        } else {
          result[key] = raw;
        }
      }
    }
  }

  return result;
}

/**
 * Build a line-based directive state map from markdown content.
 * Returns sorted entries of [lineNumber, state] where state contains
 * only explicitly-set values (no schema defaults). The line number
 * is the 0-based line where the directive appears.
 *
 * Callers look up the latest entry at or before a math token's source
 * line to get the effective directive state at that position.
 *
 * Lines inside fenced code blocks (``` or ~~~) are skipped.
 */
export function extractMathDirectiveStateMap(
  content: string,
): Array<[number, Record<string, unknown>]> {
  const schema = getExtensionSchema("math");
  if (!schema) return [];

  const entries: Array<[number, Record<string, unknown>]> = [];
  const cumulative: Record<string, unknown> = {};

  const lines = content.split("\n");
  const fence: FenceState = { inFence: false, fenceChar: "", fenceLen: 0 };
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    if (isInsideFence(lines[lineIdx], fence)) continue;

    const match = DIRECTIVE_RE.exec(lines[lineIdx].trim());
    if (!match) continue;

    const namespace = match[1];
    if (namespace !== "math") continue;

    const rawAttrs = match[2];
    const parsed = parseAttrString(rawAttrs);

    for (const [key, raw] of Object.entries(parsed)) {
      const def = schema[key];
      if (!def) continue;

      if (raw === false && def.type === "boolean") {
        cumulative[key] = false;
      } else if (raw === false) {
        // !key on non-boolean → reset to default
        delete cumulative[key];
      } else if (raw === true && def.type === "boolean") {
        cumulative[key] = true;
      } else if (raw === true) {
        // bare flag on non-boolean → skip
      } else {
        if (def.type === "number") {
          const num = typeof raw === "number" ? raw : parseFloat(String(raw));
          if (Number.isFinite(num)) {
            let clamped = num;
            if (def.min !== undefined && clamped < def.min) clamped = def.min;
            if (def.max !== undefined && clamped > def.max) clamped = def.max;
            cumulative[key] = clamped;
          }
        } else if (def.type === "string") {
          const str = String(raw);
          if (!def.values || def.values.includes(str)) {
            cumulative[key] = str;
          }
        } else {
          cumulative[key] = raw;
        }
      }
    }

    // Snapshot the current state at this line.
    entries.push([lineIdx, { ...cumulative }]);
  }

  return entries;
}

/**
 * Look up the directive state at a given source line from a state map.
 * Returns the state from the latest directive at or before `line`,
 * or an empty object if no directive precedes it.
 */
export function lookupDirectiveState(
  stateMap: Array<[number, Record<string, unknown>]>,
  line: number,
): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const [directiveLine, state] of stateMap) {
    if (directiveLine <= line) {
      result = state;
    } else {
      break;
    }
  }
  return result;
}
