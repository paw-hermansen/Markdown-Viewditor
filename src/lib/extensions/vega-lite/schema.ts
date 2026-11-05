import type { FenceOptionSchema } from "../types";
import { mergeOptions } from "../directive-merge";

/**
 * Fence/directive options for Vega-Lite chart blocks. Lives in its own
 * module so consumers that only need the schema (e.g. the ODT exporter)
 * don't pull in the renderer or the vega chunks.
 *
 * Scope rule (remove-katex-settings philosophy): only options that work in
 * both live preview and every export are settable. Chart sizing comes from
 * the spec itself (`width`/`height`/`autosize`), and fine-grained vega
 * knobs stay in the spec's `config` — see
 * .opencode/plans/vega-lite-extension.md §3.
 */
export const VEGA_LITE_OPTIONS_SCHEMA: FenceOptionSchema = {
  align: {
    type: "string",
    default: "center",
    values: ["left", "center", "right"],
    description: "Chart alignment (same semantics as mermaid's align)",
  },
  fitToWidth: {
    type: "boolean",
    default: true,
    description:
      "Scale the chart down to fit the viewer width (false = keep the spec's size with horizontal scrollbar)",
  },
  theme: {
    type: "string",
    default: "auto",
    values: ["auto", "light", "dark"],
    description: "Color theme (auto follows the app dark/light theme)",
  },
};

export interface VegaLiteRenderOptions {
  align: "left" | "center" | "right";
  fitToWidth: boolean;
  theme: "auto" | "light" | "dark";
}

/**
 * Narrow a merged options record (schema defaults + directive state + fence
 * attributes, via the shared fence-options path) to the typed shape. Values
 * are already coerced/clamped by the merge; the narrowing only pins types.
 */
export function narrowVegaLiteOptions(
  merged: Record<string, unknown>,
): VegaLiteRenderOptions {
  const align =
    merged.align === "left" || merged.align === "right"
      ? merged.align
      : "center";
  const theme =
    merged.theme === "light" || merged.theme === "dark" ? merged.theme : "auto";
  return {
    align,
    fitToWidth: merged.fitToWidth !== false,
    theme,
  };
}

/**
 * Merge schema defaults under the provided values and return a typed options
 * object. The same merge path fence attributes and directives take.
 */
export function resolveVegaLiteOptions(
  opts: Record<string, unknown>,
): VegaLiteRenderOptions {
  return narrowVegaLiteOptions(
    mergeOptions(VEGA_LITE_OPTIONS_SCHEMA, {}, opts),
  );
}
