import { registerExtension, registerExtensionSchema } from "./registry";
import { katexExtension } from "./katex/index";

/**
 * Register all built-in extensions. Called once during initMarkdownIt().
 * Future extensions (mermaid, ABC, SMILES) are added here.
 */
export async function registerBuiltinExtensions(): Promise<void> {
  registerExtension(katexExtension);
  // Register the KaTeX schema under the "math" namespace alias so that
  // <!-- math: key=val --> directives are validated against the KaTeX schema.
  if (katexExtension.fenceOptionsSchema) {
    registerExtensionSchema("math", katexExtension.fenceOptionsSchema);
  }
}
