// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { editorState } from "$lib/stores/editor.svelte";
import { settingsState } from "$lib/stores/settings.svelte";
import type { MarkdownLevel } from "$lib/utils/markdown-levels";
import {
  levelState,
  startLevelAnalysis,
  flushLevelAnalysis,
} from "../markdown-levels.svelte";

describe("markdown-levels store", () => {
  let stop: (() => void) | undefined;
  let savedContent: string;
  let savedLevel: MarkdownLevel;
  let savedFeatures: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    savedContent = editorState.content;
    savedLevel = settingsState.markdownLevel;
    savedFeatures = settingsState.enabledFeatures;
    editorState.content = "# Hello\n\nA ~~strike~~ here.";
    settingsState.markdownLevel = "basic";
    settingsState.enabledFeatures = [];
    levelState.violations = [];
    stop = startLevelAnalysis();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    editorState.content = savedContent;
    settingsState.markdownLevel = savedLevel;
    settingsState.enabledFeatures = savedFeatures;
    vi.useRealTimers();
  });

  it("computes violations after the debounce window", async () => {
    expect(levelState.violations).toEqual([]);

    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() =>
      expect(levelState.violations.some((v) => v.id === "strikethrough")).toBe(
        true,
      ),
    );
  });

  it("violations clear when content changes to a clean doc (debounced)", async () => {
    await flushLevelAnalysis();
    expect(levelState.violations.some((v) => v.id === "strikethrough")).toBe(
      true,
    );

    editorState.content = "# Just a heading";
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(levelState.violations).toEqual([]));
  });

  it("violations clear when enabledFeatures enables the used feature", async () => {
    await flushLevelAnalysis();
    expect(levelState.violations.length).toBeGreaterThan(0);

    settingsState.enabledFeatures = ["strikethrough"];
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(levelState.violations).toEqual([]));
  });

  it("flushLevelAnalysis runs without waiting for the timer", async () => {
    await flushLevelAnalysis();
    expect(levelState.violations.some((v) => v.id === "strikethrough")).toBe(
      true,
    );
  });
});
