import { analyzeContent } from "$lib/utils/markdown";
import { findViolations, type UsedFeature } from "$lib/utils/markdown-levels";
import { editorState } from "./editor.svelte";
import { settingsState } from "./settings.svelte";

/**
 * Levels analysis store. Derives `violations` from the editor content and the
 * enabled feature set. Runs in all view modes (the Viewer is unmounted in
 * editor-only mode, so a viewer-driven analysis would not suffice); parse-only
 * analysis is cheap (~1-5 ms typical) and debounced ~200 ms.
 *
 * Started via `startLevelAnalysis()` from AppLayout so the $effect.root runs
 * in a component context (browser only). Returns a cleanup function.
 */

export const levelState = $state<{ violations: UsedFeature[] }>({
  violations: [],
});

const DEBOUNCE_MS = 200;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let dirty = false;
let pendingContent = "";
let pendingEnabled: string[] = [];

async function recompute(content: string, enabled: string[]): Promise<void> {
  const used = await analyzeContent(content);
  levelState.violations = findViolations(used, enabled);
}

function schedule(content: string, enabled: string[]): void {
  pendingContent = content;
  pendingEnabled = enabled;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, DEBOUNCE_MS);
}

async function run(): Promise<void> {
  if (inFlight) {
    dirty = true;
    return;
  }
  inFlight = true;
  try {
    await recompute(pendingContent, pendingEnabled);
  } finally {
    inFlight = false;
  }
  if (dirty) {
    dirty = false;
    await run();
  }
}

export function startLevelAnalysis(): () => void {
  return $effect.root(() => {
    $effect(() => {
      const content = editorState.content;
      const enabled = [...settingsState.enabledFeatures];
      // Touch markdownLevel so a preset change re-runs the effect even when
      // enabledFeatures happens to be array-equal (rare but possible).
      void settingsState.markdownLevel;
      schedule(content, enabled);
    });
  });
}

/** Synchronously re-run the analysis (used by tests with fake timers). */
export async function flushLevelAnalysis(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await recompute(pendingContent, pendingEnabled);
}
