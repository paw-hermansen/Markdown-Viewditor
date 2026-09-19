/**
 * Regex patterns for pre-scanning markdown content to detect which extensions
 * are triggered. False positives are acceptable (the extension just loads and
 * finds nothing to render); false negatives are not.
 */
export const MATH_PATTERNS = [
  /\$\$/,
  /\$[^$\s]/,
  /\\\(/,
  /\\\[/,
  /\\begin\{/,
  /```math\b/,
];

export const MERMAID_PATTERNS = [/```mermaid\b/];

export const ABC_PATTERNS = [/```abc\b/];

export const SMILES_PATTERNS = [/```smiles\b/, /```smi\b/];
