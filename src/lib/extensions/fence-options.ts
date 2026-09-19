import type { FenceOptionSchema } from "./types";

/**
 * Sentinel value indicating that a non-boolean key should be reset to its
 * schema default. Parsed from `!key` syntax.
 */
export const RESET: unique symbol = Symbol("RESET");

// Attribute string patterns.
// Matches: !word, word=value (quoted or unquoted), or bare word
const TOKEN_RE =
  /(?:!([^\s=!]+))|(?:(\w[\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s}]+)))|(\b[\w][\w-]*)/g;
const NUM_RE = /^-?\d+(\.\d+)?$/;

/**
 * Parse a raw attribute string into a key-value record.
 *
 * Supported forms:
 *   key=value   → { key: value } (string or number)
 *   key         → { key: true }
 *   !key        → { key: false }
 *
 * Numeric values matching `/^-?\d+(\.\d+)?$/` are coerced to number.
 * Values may be quoted with single or double quotes (quotes stripped).
 */
export function parseAttrString(
  raw: string,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!raw || !raw.trim()) return result;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(raw)) !== null) {
    if (match[1]) {
      // !key → false
      result[match[1]] = false;
    } else if (match[2]) {
      // key=value
      const key = match[2];
      const value = match[3] ?? match[4] ?? match[5] ?? "";
      if (NUM_RE.test(value)) {
        result[key] = parseFloat(value);
      } else {
        result[key] = value;
      }
    } else if (match[6]) {
      // bare key → true
      result[match[6]] = true;
    }
  }

  return result;
}

/**
 * Validate and coerce a parsed record against an extension's schema.
 *
 * - Unknown keys are logged as warnings and ignored.
 * - `false` values for non-boolean keys are converted to `RESET` (the key
 *   will revert to its schema default during merge).
 * - Values are coerced to the schema type.
 * - String values are validated against allowed `values` list.
 * - Numbers are clamped to `min`/`max` range.
 * - Missing keys are filled with schema defaults.
 */
export function validateFenceOptions(
  parsed: Record<string, string | number | boolean>,
  schema: FenceOptionSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const raw = parsed[key];

    if (raw === undefined) {
      // Not provided — use default.
      result[key] = def.default;
      continue;
    }

    // Handle !key (false value): for booleans → false, for others → RESET.
    if (raw === false) {
      if (def.type === "boolean") {
        result[key] = false;
      } else {
        result[key] = RESET;
      }
      continue;
    }

    // Handle bare `key` (true value): for booleans → true, for others → warn + default.
    if (raw === true) {
      if (def.type === "boolean") {
        result[key] = true;
      } else {
        console.warn(
          `fence-options: bare flag "${key}" used on non-boolean type (${def.type}), using default`,
        );
        result[key] = def.default;
      }
      continue;
    }

    // Coerce and validate.
    switch (def.type) {
      case "boolean": {
        if (typeof raw === "boolean") {
          result[key] = raw;
        } else if (raw === "true" || raw === "1") {
          result[key] = true;
        } else if (raw === "false" || raw === "0") {
          result[key] = false;
        } else {
          console.warn(
            `fence-options: invalid boolean value "${raw}" for "${key}", using default`,
          );
          result[key] = def.default;
        }
        break;
      }
      case "number": {
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(num)) {
          console.warn(
            `fence-options: invalid number value "${raw}" for "${key}", using default`,
          );
          result[key] = def.default;
          break;
        }
        let clamped = num;
        if (def.min !== undefined && clamped < def.min) clamped = def.min;
        if (def.max !== undefined && clamped > def.max) clamped = def.max;
        result[key] = clamped;
        break;
      }
      case "string": {
        const str = String(raw);
        if (def.values && !def.values.includes(str)) {
          console.warn(
            `fence-options: invalid value "${str}" for "${key}", allowed: ${def.values.join(", ")}`,
          );
          result[key] = def.default;
        } else {
          result[key] = str;
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Extract the {attrs} portion from a fence token's info string.
 * Given info string "smiles {theme=dark width=400}", returns "theme=dark width=400".
 * Returns null if no braces found.
 */
export function extractBraceAttrs(info: string): string | null {
  const start = info.indexOf("{");
  if (start === -1) return null;
  const end = info.lastIndexOf("}");
  if (end === -1 || end <= start) return null;
  return info.slice(start + 1, end).trim();
}

/**
 * Validate only explicitly-provided fence attributes against a schema.
 * Unlike `validateFenceOptions`, this does NOT fill defaults for missing keys.
 * Used when merging fence attrs with directive state, so that missing keys
 * don't override directive values with schema defaults.
 */
export function validateExplicitFenceOptions(
  parsed: Record<string, string | number | boolean>,
  schema: FenceOptionSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(parsed)) {
    const def = schema[key];
    if (!def) continue;

    if (raw === false) {
      if (def.type === "boolean") {
        result[key] = false;
      } else {
        result[key] = RESET;
      }
      continue;
    }

    if (raw === true) {
      if (def.type === "boolean") {
        result[key] = true;
      } else {
        result[key] = def.default;
      }
      continue;
    }

    switch (def.type) {
      case "boolean": {
        if (typeof raw === "boolean") {
          result[key] = raw;
        } else if (raw === "true" || raw === "1") {
          result[key] = true;
        } else if (raw === "false" || raw === "0") {
          result[key] = false;
        } else {
          result[key] = def.default;
        }
        break;
      }
      case "number": {
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(num)) {
          result[key] = def.default;
          break;
        }
        let clamped = num;
        if (def.min !== undefined && clamped < def.min) clamped = def.min;
        if (def.max !== undefined && clamped > def.max) clamped = def.max;
        result[key] = clamped;
        break;
      }
      case "string": {
        const str = String(raw);
        if (def.values && !def.values.includes(str)) {
          result[key] = def.default;
        } else {
          result[key] = str;
        }
        break;
      }
    }
  }

  return result;
}
