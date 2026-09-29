import type MarkdownIt from "markdown-it";
import type {
  MarkdownExtension,
  MarkdownPreRenderContext,
  FenceOptionSchema,
} from "./types";

const extensions = new Map<string, MarkdownExtension>();
const loadedPlugins = new Set<string>();
const injectedStyles = new Set<string>();
const loadingPlugins = new Map<string, Promise<void>>();
const loadingStyles = new Map<string, Promise<void>>();
const schemas = new Map<string, FenceOptionSchema>();

/** Register an extension. Idempotent on id. */
export function registerExtension(ext: MarkdownExtension): void {
  if (!extensions.has(ext.id)) {
    extensions.set(ext.id, ext);
    if (ext.fenceOptionsSchema) {
      schemas.set(ext.id, ext.fenceOptionsSchema);
    }
  }
}

/** Get all registered extensions. */
export function listExtensions(): MarkdownExtension[] {
  return [...extensions.values()];
}

/** Pre-scan content and return which extensions are triggered. */
export function detectExtensions(content: string): MarkdownExtension[] {
  const detected: MarkdownExtension[] = [];
  for (const ext of extensions.values()) {
    if (ext.detect(content)) {
      detected.push(ext);
    }
  }
  return detected;
}

/**
 * Load all triggered extensions' plugins and CSS.
 * Returns true if any NEW extensions were loaded (meaning re-render needed).
 */
export async function loadExtensionsForContent(
  content: string,
  md: MarkdownIt,
): Promise<boolean> {
  const detected = detectExtensions(content);
  let anyLoaded = false;

  for (const ext of detected) {
    anyLoaded = (await loadPlugin(ext, md)) || anyLoaded;
    await loadStyles(ext);
  }

  return anyLoaded;
}

/**
 * Pre-render blocks after Markdown-it has parsed the document. This gives
 * extensions access to positional parser state such as HTML directives.
 */
export async function preRenderExtensionsForContent(
  content: string,
  context: MarkdownPreRenderContext,
): Promise<void> {
  for (const ext of detectExtensions(content)) {
    if (ext.preRenderBlocks) {
      await ext.preRenderBlocks(content, context);
    }
  }
}

async function loadPlugin(
  ext: MarkdownExtension,
  md: MarkdownIt,
): Promise<boolean> {
  const inFlight = loadingPlugins.get(ext.id);
  if (inFlight) {
    await inFlight;
    return false;
  }

  if (!ext.loadPlugin || loadedPlugins.has(ext.id)) return false;

  const loading = (async () => {
    const loader = await ext.loadPlugin!();
    md.use(loader.plugin, loader.options);
    if (ext.postRegister) {
      ext.postRegister(md);
    }
    loadedPlugins.add(ext.id);
  })();
  loadingPlugins.set(ext.id, loading);

  try {
    await loading;
    return true;
  } finally {
    if (loadingPlugins.get(ext.id) === loading) {
      loadingPlugins.delete(ext.id);
    }
  }
}

async function loadStyles(ext: MarkdownExtension): Promise<void> {
  if (!ext.loadStyles || injectedStyles.has(ext.id)) return;

  const inFlight = loadingStyles.get(ext.id);
  if (inFlight) {
    await inFlight;
    return;
  }

  const loading = (async () => {
    await ext.loadStyles!();
    injectedStyles.add(ext.id);
  })();
  loadingStyles.set(ext.id, loading);

  try {
    await loading;
  } finally {
    if (loadingStyles.get(ext.id) === loading) {
      loadingStyles.delete(ext.id);
    }
  }
}

/** Ensure a specific extension's plugin is registered on md. */
export async function ensureExtensionLoaded(
  id: string,
  md: MarkdownIt,
): Promise<void> {
  const ext = extensions.get(id);
  if (!ext) return;

  await loadPlugin(ext, md);
  await loadStyles(ext);
}

/** Inject extension CSS if not already injected. */
export async function injectExtensionStyles(
  ext: MarkdownExtension,
): Promise<void> {
  await loadStyles(ext);
}

/** Register a fence options schema for an extension id. */
export function registerExtensionSchema(
  id: string,
  schema: FenceOptionSchema,
): void {
  schemas.set(id, schema);
}

/** Get the fence options schema for an extension id. */
export function getExtensionSchema(id: string): FenceOptionSchema | undefined {
  return schemas.get(id);
}

/** Reset all state (for tests). */
export function resetExtensions(): void {
  extensions.clear();
  loadedPlugins.clear();
  injectedStyles.clear();
  loadingPlugins.clear();
  loadingStyles.clear();
  schemas.clear();
}
