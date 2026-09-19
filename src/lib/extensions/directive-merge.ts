import type { FenceOptionSchema } from "./types";
import { RESET } from "./fence-options";

/**
 * Merge schema defaults, directive options, and fence attributes into a
 * single resolved options object.
 *
 * Merge order per key (later overrides earlier):
 *   1. schema[key].default
 *   2. directiveOpts[key] (if present and not RESET)
 *   3. fenceOpts[key] (if present and not RESET)
 *
 * RESET values revert to the schema default.
 * Values are coerced to the schema type and validated against constraints.
 */
export function mergeOptions(
  schema: FenceOptionSchema,
  directiveOpts: Record<string, unknown>,
  fenceOpts: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    let value: unknown = def.default;

    // Apply directive value.
    const dirVal = directiveOpts[key];
    if (dirVal !== undefined) {
      if (dirVal === RESET) {
        value = def.default;
      } else {
        value = dirVal;
      }
    }

    // Apply fence override.
    const fenceVal = fenceOpts[key];
    if (fenceVal !== undefined) {
      if (fenceVal === RESET) {
        value = def.default;
      } else {
        value = fenceVal;
      }
    }

    // Coerce and validate.
    result[key] = coerceAndValidate(key, value, def);
  }

  return result;
}

function coerceAndValidate(
  key: string,
  value: unknown,
  def: FenceOptionSchema[string],
): unknown {
  switch (def.type) {
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "1") return true;
      if (value === "false" || value === "0") return false;
      return def.default;
    }
    case "number": {
      const num = typeof value === "number" ? value : parseFloat(String(value));
      if (!Number.isFinite(num)) return def.default;
      let clamped = num;
      if (def.min !== undefined && clamped < def.min) clamped = def.min;
      if (def.max !== undefined && clamped > def.max) clamped = def.max;
      return clamped;
    }
    case "string": {
      const str = String(value);
      if (def.values && !def.values.includes(str)) {
        console.warn(`merge-options: invalid value "${str}" for "${key}"`);
        return def.default;
      }
      return str;
    }
    default:
      return value;
  }
}
