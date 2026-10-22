// @vitest-environment node
/**
 * The export-option ↔ persisted-setting map must stay complete: every option
 * every registered exporter puts in the dialog has to have a mapping here,
 * or the dialog silently shows a default and forgets what the user picked.
 * The two switch statements this replaced had exactly that gap — HTML
 * Bundle's frontmatter toggle — and nothing caught it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(() =>
      Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() }),
    ),
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));
vi.mock("highlight.js", () => ({
  default: { highlight: vi.fn(), highlightAuto: vi.fn() },
}));
vi.mock("../svg-rasterize", () => ({ rasterizeSvg: vi.fn() }));
vi.mock("../math-render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../math-render")>()),
  renderMathToPng: vi.fn(),
}));

import type { ExportContext } from "../types";
import { OPTION_SETTING } from "../option-settings";
import { listExporters, registerBuiltinExporters } from "../registry.svelte";
import { settingsState } from "$lib/stores/settings.svelte";

const CTX: ExportContext = {
  markdown: "",
  html: "",
  frontmatter: { title: "t" },
  fileName: "test",
  tokens: [],
};

async function declaredOptionIds(): Promise<string[]> {
  await registerBuiltinExporters();
  return listExporters().flatMap((e) =>
    (e.optionGroups?.(CTX) ?? []).flatMap((g) => g.options.map((o) => o.id)),
  );
}

describe("OPTION_SETTING", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has an entry for every option the exporters declare", async () => {
    const ids = await declaredOptionIds();
    const missing = ids.filter((id) => !(id in OPTION_SETTING));
    expect(missing).toEqual([]);
  });

  it("declares more than one exporter's worth of options", async () => {
    // Guards against the enumeration silently returning nothing, which
    // would make the two completeness assertions vacuous.
    const ids = await declaredOptionIds();
    expect(ids.length).toBeGreaterThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no entry that no exporter declares", async () => {
    const ids = new Set(await declaredOptionIds());
    const orphans = Object.keys(OPTION_SETTING).filter((id) => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it("reads the persisted value for each mapped option", async () => {
    for (const id of await declaredOptionIds()) {
      expect(OPTION_SETTING[id].get()).not.toBeUndefined();
    }
  });

  it("coerces toggle values to booleans on write", () => {
    OPTION_SETTING["odt.rasterizeMath"].set(1);
    expect(settingsState.odtRasterizeMath).toBe(true);
    OPTION_SETTING["odt.rasterizeMath"].set(0);
    expect(settingsState.odtRasterizeMath).toBe(false);
  });

  it("keeps the previous resolution when the value is not a usable one", () => {
    OPTION_SETTING["odt.rasterResolution"].set(2);
    expect(settingsState.odtRasterResolution).toBe(2);
    OPTION_SETTING["odt.rasterResolution"].set(7);
    expect(settingsState.odtRasterResolution).toBe(2);
    OPTION_SETTING["odt.rasterResolution"].set(4);
    expect(settingsState.odtRasterResolution).toBe(4);
  });

  it("remembers the HTML Bundle frontmatter toggle", () => {
    // The regression this map exists to prevent: the toggle was in the
    // dialog but had no read or write mapping, so it reset every export.
    OPTION_SETTING["html-bundle.includeFrontmatter"].set(false);
    expect(settingsState.htmlBundleIncludeFrontmatter).toBe(false);
    expect(OPTION_SETTING["html-bundle.includeFrontmatter"].get()).toBe(false);
  });
});
