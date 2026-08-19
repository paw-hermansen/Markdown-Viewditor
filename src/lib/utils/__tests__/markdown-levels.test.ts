import { describe, it, expect, vi } from "vitest";

// markdown.ts imports `convertFileSrc` from @tauri-apps/api/core, which needs
// a browser environment. Mock it deterministically (same pattern as
// markdown.test.ts).
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

import { analyzeContent } from "../markdown";
import {
  listFeatureToggles,
  presetFor,
  registerFeatureDetectors,
  unregisterFeatureDetector,
  analyzeTokens,
  findViolations,
  requiredPreset,
  violationMessage,
  type FeatureDetector,
} from "../markdown-levels";

describe("markdown-levels registry & presets", () => {
  it("registers the 11 toggles from plans 1, 2, mhchem, and highlight", () => {
    const ids = listFeatureToggles().map((t) => t.id);
    expect(ids).toEqual([
      "tables",
      "strikethrough",
      "task-lists",
      "autolinks",
      "footnotes",
      "raw-html",
      "frontmatter",
      "highlight",
      "math-dollar",
      "math-latex",
      "chemical-formulas",
    ]);
  });

  it("basic preset enables no toggles", () => {
    expect(presetFor("basic")).toEqual([]);
  });

  it("github preset enables toggles #1-6 and math-dollar (not frontmatter, not math-latex)", () => {
    expect(presetFor("github").sort()).toEqual(
      [
        "tables",
        "strikethrough",
        "task-lists",
        "autolinks",
        "footnotes",
        "raw-html",
        "math-dollar",
      ].sort(),
    );
  });

  it("advanced preset enables all 11 toggles", () => {
    expect(presetFor("advanced").sort()).toEqual(
      [
        "tables",
        "strikethrough",
        "task-lists",
        "autolinks",
        "footnotes",
        "raw-html",
        "frontmatter",
        "math-dollar",
        "math-latex",
        "chemical-formulas",
        "highlight",
      ].sort(),
    );
  });

  it("extends presets when a new detector is registered (Plan 2 mechanism)", () => {
    const beforeGithub = presetFor("github").length;
    const beforeAdvanced = presetFor("advanced").length;
    const fakeDetector: FeatureDetector = {
      id: "fake-math",
      label: "Fake Math",
      presets: { github: true, advanced: true },
      detect: () => [7],
    };
    registerFeatureDetectors(fakeDetector);
    try {
      expect(presetFor("github").length).toBe(beforeGithub + 1);
      expect(presetFor("github")).toContain("fake-math");
      expect(presetFor("advanced").length).toBe(beforeAdvanced + 1);
    } finally {
      unregisterFeatureDetector("fake-math");
    }
  });

  it("requiredPreset returns github for GFM toggles", () => {
    const t = listFeatureToggles().find((x) => x.id === "tables")!;
    expect(requiredPreset(t)).toBe("github");
  });

  it("requiredPreset returns advanced for frontmatter", () => {
    const t = listFeatureToggles().find((x) => x.id === "frontmatter")!;
    expect(requiredPreset(t)).toBe("advanced");
  });
});

describe("markdown-levels detection", () => {
  it("detects a table", async () => {
    const used = await analyzeContent("| a | b |\n|---|---|\n| 1 | 2 |");
    const t = used.find((u) => u.id === "tables");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("detects strikethrough", async () => {
    const used = await analyzeContent("a ~~strike~~ b");
    const t = used.find((u) => u.id === "strikethrough");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("detects task lists", async () => {
    const used = await analyzeContent("- [ ] todo\n- [x] done");
    const t = used.find((u) => u.id === "task-lists");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1, 2]);
  });

  it("does NOT flag task lists as raw HTML (plugin-injected checkbox)", async () => {
    // markdown-it-task-lists injects a <input class="task-list-item-checkbox">
    // as an html_inline token; the raw-html detector must skip it so a task
    // list only warns as a task list, not as raw HTML.
    const used = await analyzeContent("- [ ] todo\n- [x] done");
    expect(used.find((u) => u.id === "raw-html")).toBeUndefined();
  });

  it("detects bare-URL autolinks", async () => {
    const used = await analyzeContent("see https://example.com here");
    const t = used.find((u) => u.id === "autolinks");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("does NOT trigger autolinks for CommonMark <https://...> autolinks", async () => {
    const used = await analyzeContent("see <https://example.com> here");
    expect(used.find((u) => u.id === "autolinks")).toBeUndefined();
  });

  it("detects footnotes", async () => {
    const used = await analyzeContent("Body with ref[^1].\n\n[^1]: the note");
    const t = used.find((u) => u.id === "footnotes");
    expect(t).toBeDefined();
    expect(t!.lines).toContain(1);
  });

  it("does not detect an orphan footnote definition (no matching reference)", async () => {
    // The footnote plugin only emits footnote_ref / footnote_block_open when a
    // matching inline reference exists, so a lone definition is not flagged.
    const used = await analyzeContent("[^1]: orphan definition");
    expect(used.find((u) => u.id === "footnotes")).toBeUndefined();
  });

  it("detects raw inline HTML", async () => {
    const used = await analyzeContent("an <b>inline html</b> tag");
    const t = used.find((u) => u.id === "raw-html");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("detects raw block HTML", async () => {
    const used = await analyzeContent(
      "Para.\n\n<div>\n  <span>x</span>\n</div>\n\nAfter.",
    );
    const t = used.find((u) => u.id === "raw-html");
    expect(t).toBeDefined();
    expect(t!.lines).toContain(3);
  });

  it("detects YAML frontmatter", async () => {
    const used = await analyzeContent(
      "---\nname: skill\ndescription: A skill.\n---\n\n# Body",
    );
    const t = used.find((u) => u.id === "frontmatter");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("detects highlight ==text==", async () => {
    const used = await analyzeContent("this is ==highlighted== text");
    const t = used.find((u) => u.id === "highlight");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([1]);
  });

  it("returns no features for a plain CommonMark document", async () => {
    const used = await analyzeContent(
      "# Title\n\nA paragraph with **bold** and *italic*.\n\n- one\n- two\n\n> quote\n\n```js\nx\n```",
    );
    expect(used).toEqual([]);
  });

  it("line numbers come from the enclosing block for inline features", async () => {
    // Strikethrough on line 3 of a 5-line doc.
    const used = await analyzeContent(
      "Para one.\n\nPara two.\n\nA ~~strike~~ here.",
    );
    const t = used.find((u) => u.id === "strikethrough");
    expect(t).toBeDefined();
    expect(t!.lines).toEqual([5]);
  });

  it("returns all occurrence lines (no cap in the data model)", async () => {
    // 6 tables across 6 lines — all 6 should be recorded. The display cap
    // (MAX_DISPLAY_LINES) is applied only in the status-bar popup, not here.
    const src = Array.from(
      { length: 6 },
      (_, i) => `| a${i} | b${i} |\n|---|---|\n| 1 | 2 |`,
    ).join("\n\n");
    const used = await analyzeContent(src);
    const t = used.find((u) => u.id === "tables");
    expect(t).toBeDefined();
    expect(t!.lines.length).toBe(6);
  });
});

describe("findViolations", () => {
  it("flags used features not in enabledFeatures", () => {
    const used = [
      {
        id: "tables",
        label: "Tables",
        presets: { github: true, advanced: true },
        lines: [1],
      },
      {
        id: "strikethrough",
        label: "Strikethrough",
        presets: { github: true, advanced: true },
        lines: [2],
      },
    ];
    const v = findViolations(used, ["tables"]);
    expect(v.map((x) => x.id)).toEqual(["strikethrough"]);
  });

  it("returns empty when everything is enabled", () => {
    const used = [
      {
        id: "tables",
        label: "Tables",
        presets: { github: true, advanced: true },
        lines: [1],
      },
    ];
    expect(findViolations(used, ["tables"])).toEqual([]);
  });
});

describe("violationMessage", () => {
  it("names the required preset when above a preset level", () => {
    const t = listFeatureToggles().find((x) => x.id === "raw-html")!;
    const msg = violationMessage({ ...t, lines: [3] }, "basic");
    expect(msg).toBe("Raw HTML is above the 'basic' level (requires: github)");
  });

  it("says 'disabled (custom level)' when no preset enables the feature", () => {
    const fake: FeatureDetector = {
      id: "custom-only",
      label: "Custom Only",
      presets: { advanced: false },
      detect: () => [],
    };
    const msg = violationMessage({ ...fake, lines: [1] }, "custom");
    expect(msg).toBe("Custom Only is disabled (custom level)");
  });
});

describe("analyzeTokens (pure unit)", () => {
  it("returns empty array for an empty token stream", () => {
    expect(analyzeTokens([], {})).toEqual([]);
  });
});
