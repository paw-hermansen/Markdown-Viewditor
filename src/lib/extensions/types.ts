import type { FeatureDetector } from "$lib/utils/markdown-levels";

/**
 * A lazy-loadable markdown-it extension. Extensions are detected in document
 * content, then their plugin + styles are loaded on first use and cached.
 */
export interface MarkdownExtension {
  /** Stable id, e.g. "katex", "mermaid", "abc-notation", "smiles" */
  id: string;

  /** Human-readable name for UI (status bar, settings) */
  label: string;

  /** Languages this extension handles in fenced code blocks, e.g. ["smiles", "smi"] */
  triggerLanguages?: string[];

  /**
   * Pre-scan raw markdown content for extension triggers.
   * Returns true if content MIGHT use this extension.
   * Should be fast (regex-based) — false positives are acceptable,
   * false negatives are not.
   */
  detect(content: string): boolean;

  /**
   * Lazily load and return the markdown-it plugin + options.
   * Called once; the system caches the loaded state.
   * Only needed for extensions that register markdown-it parser rules
   * (e.g. KaTeX's math_inline/math_block). Fence-only extensions skip this.
   */
  loadPlugin?(): Promise<MarkdownItPluginLoader>;

  /**
   * Lazily load and inject extension CSS into the document.
   * Called once; the system tracks injected stylesheets.
   */
  loadStyles?(): Promise<void>;

  /**
   * Post-registration hooks (e.g. KaTeX's makeDollarRulesBacktickSafe).
   * Called after the plugin is registered on the md instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postRegister?(md: any): void;

  /**
   * Pre-render blocks that require async processing (e.g. mermaid diagrams).
   * Called after parsing, so extensions can use the final token stream and
   * parser environment (including positional directive state), but before
   * rendering begins. Extensions cache rendered output so renderFence can
   * return synchronously.
   */
  preRenderBlocks?(
    content: string,
    context: MarkdownPreRenderContext,
  ): Promise<void>;

  /**
   * Schema for per-block fence attributes parsed from {key=val} after
   * the info string. The shared fence-options utility uses this to
   * validate and coerce parsed values. Extensions declare their accepted
   * properties here; the fence renderer passes the result to renderFence.
   */
  fenceOptionsSchema?: FenceOptionSchema;

  /**
   * Render a fenced code block to HTML. Called by the extension-aware
   * fence renderer when the fence language matches this extension's
   * triggerLanguages. Return null to fall through to default rendering.
   *
   * @param content - The raw text content inside the fence
   * @param language - The language identifier (e.g. "smiles")
   * @param options - Parsed and validated fence attributes from {key=val},
   *                  or an empty object if none provided
   */
  renderFence?(
    content: string,
    language: string,
    options: Record<string, unknown>,
  ): string | null;

  /**
   * Walk tokens and return which export assets are needed.
   * Only called for extensions detected in the document.
   */
  getExportAssets?(tokens: MdToken[]): ExportAsset[];

  /**
   * Feature detectors for the markdown-levels system.
   * Registered automatically when the extension loads.
   */
  featureDetectors?(): FeatureDetector[];
}

export interface MarkdownPreRenderContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokens: any[];
  env: Record<string, unknown>;
}

/** Schema for a single fence attribute property. */
export interface FencePropertySchema {
  type: "string" | "number" | "boolean";
  default: string | number | boolean;
  values?: readonly string[];
  min?: number;
  max?: number;
  description?: string;
}

/** Schema mapping property names to their definitions. */
export type FenceOptionSchema = Record<string, FencePropertySchema>;

export interface MarkdownItPluginLoader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugin: (md: any, ...params: any[]) => void;
  options?: unknown;
}

export interface ExportAsset {
  type: "css" | "font" | "image" | "svg";
  content?: string;
  path?: string;
  mimeType?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MdToken = any;
