import { registerExtension, registerExtensionSchema } from "./registry";
import { katexExtension } from "./katex/index";
import { mermaidExtension } from "./mermaid/index";
import { smilesExtension } from "./smiles/index";
import { vegaLiteExtension } from "./vega-lite/index";

/**
 * Register all built-in extensions. Called once during initMarkdownIt().
 * Future extensions (ABC) are added here.
 */
export async function registerBuiltinExtensions(): Promise<void> {
  registerExtension(katexExtension);
  // Register the KaTeX schema under the "math" namespace alias so that
  // <!-- math: key=val --> directives are validated against the KaTeX schema.
  if (katexExtension.fenceOptionsSchema) {
    registerExtensionSchema("math", katexExtension.fenceOptionsSchema);
  }

  registerExtension(mermaidExtension);
  // Register the mermaid schema under the "mermaid" namespace alias so that
  // <!-- mermaid: key=val --> directives are validated against the mermaid schema.
  if (mermaidExtension.fenceOptionsSchema) {
    registerExtensionSchema("mermaid", mermaidExtension.fenceOptionsSchema);
  }

  registerExtension(smilesExtension);
  // Register the SMILES schema under the "smiles" namespace alias so that
  // <!-- smiles: key=val --> directives are validated against the SMILES schema.
  if (smilesExtension.fenceOptionsSchema) {
    registerExtensionSchema("smiles", smilesExtension.fenceOptionsSchema);
  }

  registerExtension(vegaLiteExtension);
  // Register the Vega-Lite schema under the "vega-lite" namespace alias so
  // that <!-- vega-lite: key=val --> directives are validated against it.
  if (vegaLiteExtension.fenceOptionsSchema) {
    registerExtensionSchema("vega-lite", vegaLiteExtension.fenceOptionsSchema);
  }
}
