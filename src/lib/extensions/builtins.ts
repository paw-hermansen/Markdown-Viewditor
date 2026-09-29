import { registerExtension, registerExtensionSchema } from "./registry";
import { katexExtension } from "./katex/index";
import { mermaidExtension } from "./mermaid/index";

/**
 * Register all built-in extensions. Called once during initMarkdownIt().
 * Future extensions (ABC, SMILES) are added here.
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
}
