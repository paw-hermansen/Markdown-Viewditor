import type { FenceOptionSchema } from "../types";

/**
 * Fence/directive options for SMILES structure blocks. Lives in its own
 * module so consumers that only need the schema (e.g. the ODT exporter)
 * don't pull in the renderer or the smiles-drawer chunk.
 *
 * Scope rule (remove-katex-settings philosophy): only options that work in
 * both live preview and every export are settable. Fine-grained drawing
 * knobs (bondLength, bondThickness, fonts, padding, overlap tuning) stay at
 * library defaults — see .opencode/plans/smiles-extension.md.
 */
export const SMILES_OPTIONS_SCHEMA: FenceOptionSchema = {
  align: {
    type: "string",
    default: "center",
    values: ["left", "center", "right"],
    description: "Structure alignment (same semantics as mermaid's align)",
  },
  scale: {
    type: "number",
    default: 1,
    min: 0.25,
    max: 4,
    description: "Display-size multiplier (1.5 = 150% of natural size)",
  },
  fitToWidth: {
    type: "boolean",
    default: true,
    description:
      "Scale the structure down to fit the viewer width (false = keep scaled size with horizontal scrollbar)",
  },
  theme: {
    type: "string",
    default: "auto",
    values: [
      "auto",
      "light",
      "dark",
      "oldschool",
      "solarized",
      "solarized-dark",
      "matrix",
      "github",
      "carbon",
      "cyberpunk",
      "gruvbox",
      "gruvbox-dark",
    ],
    description: "Color theme (auto follows the app dark/light theme)",
  },
  atomVisualization: {
    type: "string",
    default: "default",
    values: ["default", "balls", "none"],
    description: "Atom rendering style",
  },
  showCarbons: {
    type: "string",
    default: "default",
    values: ["none", "default", "terminal", "acyclic", "all"],
    description: "Carbon label visibility",
  },
  explicitHydrogens: {
    type: "boolean",
    default: true,
    description: "Show hydrogen atoms",
  },
  compactDrawing: {
    type: "boolean",
    default: true,
    description: "Abbreviate terminal groups",
  },
  isomeric: {
    type: "boolean",
    default: true,
    description: "Draw stereochemistry",
  },
};
