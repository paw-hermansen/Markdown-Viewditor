import type { FenceOptionSchema } from "../types";

/**
 * KaTeX fence options schema. Defines the per-block attributes settable
 * via fence syntax (```math {key=val}) and HTML comment directives
 * (<!-- math: key=val -->).
 */
export const KATEX_OPTIONS_SCHEMA: FenceOptionSchema = {
  leqno: {
    type: "boolean",
    default: false,
    description: "Left-side equation numbers",
  },
  fleqn: {
    type: "boolean",
    default: false,
    description: "Flush-left display math",
  },
  fontsize: {
    type: "number",
    default: 1.0,
    min: 0.3,
    max: 5.0,
    description: "Font size scaling factor (multiplies base KaTeX 1.21em)",
  },
};
