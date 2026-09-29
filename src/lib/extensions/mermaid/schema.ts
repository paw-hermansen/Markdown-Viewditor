import type { FenceOptionSchema } from "../types";

/**
 * Fence/directive options for mermaid diagrams. Lives in its own module so
 * consumers that only need the schema (e.g. the ODT exporter) don't pull in
 * the renderer or its side effects.
 */
export const MERMAID_OPTIONS_SCHEMA: FenceOptionSchema = {
  align: {
    type: "string",
    default: "center",
    values: ["left", "center", "right"],
    description: "Diagram alignment",
  },
  maxWidth: {
    type: "number",
    default: 800,
    min: 200,
    max: 2000,
    description: "Max container width in px",
  },
  fitToWidth: {
    type: "boolean",
    default: true,
    description:
      "Scale diagram to fit container width (false = show at full size with scrollbars)",
  },
};
