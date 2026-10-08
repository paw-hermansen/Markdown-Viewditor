// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StatusBar from "../StatusBar.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

const { mockEditorState, mockSettingsState, mockLevelState } = vi.hoisted(
  () => ({
    mockEditorState: {
      content: "test content",
      cursorLine: 5,
      cursorCol: 12,
      wordCount: 42,
    },
    mockSettingsState: {
      viewMode: "split" as const,
      markdownLevel: "advanced" as const,
      enabledFeatures: [
        "tables",
        "strikethrough",
        "task-lists",
        "autolinks",
        "footnotes",
        "raw-html",
        "frontmatter",
      ],
    },
    mockLevelState: {
      violations: [] as Array<{
        id: string;
        label: string;
        presets: { github?: boolean; advanced: boolean };
        lines: number[];
      }>,
    },
  }),
);

vi.mock("$lib/stores/editor.svelte", () => ({
  editorState: mockEditorState,
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
  updateSetting: vi.fn((key: string, value: unknown) => {
    (mockSettingsState as Record<string, unknown>)[key] = value;
  }),
}));

vi.mock("$lib/stores/markdown-levels.svelte", () => ({
  levelState: mockLevelState,
}));

vi.mock("$lib/utils/markdown-levels", () => ({
  MAX_DISPLAY_LINES: 5,
  listFeatureToggles: () => [
    {
      id: "tables",
      label: "Tables",
      presets: { github: true, advanced: true },
    },
    {
      id: "strikethrough",
      label: "Strikethrough `~~x~~`",
      presets: { github: true, advanced: true },
    },
    {
      id: "task-lists",
      label: "Task lists `- [ ]`",
      presets: { github: true, advanced: true },
    },
    {
      id: "autolinks",
      label: "Bare-URL autolinks",
      presets: { github: true, advanced: true },
    },
    {
      id: "footnotes",
      label: "Footnotes `[^x]`",
      presets: { github: true, advanced: true },
    },
    {
      id: "raw-html",
      label: "Raw HTML",
      presets: { github: true, advanced: true },
    },
    {
      id: "frontmatter",
      label: "YAML frontmatter",
      presets: { advanced: true },
    },
  ],
  presetFor: (level: "basic" | "github" | "advanced") =>
    level === "basic"
      ? []
      : level === "github"
        ? [
            "tables",
            "strikethrough",
            "task-lists",
            "autolinks",
            "footnotes",
            "raw-html",
          ]
        : [
            "tables",
            "strikethrough",
            "task-lists",
            "autolinks",
            "footnotes",
            "raw-html",
            "frontmatter",
          ],
  presetForEnabled: (enabledIds: string[]) => {
    const set = new Set(enabledIds);
    for (const level of ["advanced", "github", "basic"] as const) {
      const preset =
        level === "basic"
          ? []
          : level === "github"
            ? [
                "tables",
                "strikethrough",
                "task-lists",
                "autolinks",
                "footnotes",
                "raw-html",
              ]
            : [
                "tables",
                "strikethrough",
                "task-lists",
                "autolinks",
                "footnotes",
                "raw-html",
                "frontmatter",
              ];
      if (preset.length !== set.size) continue;
      if (preset.every((id) => set.has(id))) return level;
    }
    return "custom";
  },
  violationMessage: (v: { label: string }) => `${v.label} (warning)`,
  // Mirrors the real comparator (required-preset group, then label).
  compareFeatureToggles: (
    a: { label: string; presets: { github?: boolean; advanced: boolean } },
    b: { label: string; presets: { github?: boolean; advanced: boolean } },
  ) => {
    const rank = (t: { presets: { github?: boolean; advanced: boolean } }) =>
      t.presets.github ? 0 : t.presets.advanced ? 1 : 2;
    const group = rank(a) - rank(b);
    return group !== 0
      ? group
      : a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
          numeric: true,
        });
  },
}));

describe("StatusBar", () => {
  beforeEach(() => {
    mockSettingsState.markdownLevel = "advanced";
    mockSettingsState.enabledFeatures = [
      "tables",
      "strikethrough",
      "task-lists",
      "autolinks",
      "footnotes",
      "raw-html",
      "frontmatter",
    ];
    mockLevelState.violations = [];
  });

  it("displays cursor position", () => {
    render(StatusBar);
    expect(screen.getByText("Line 5, Col 12")).toBeInTheDocument();
  });

  it("displays word count", () => {
    render(StatusBar);
    expect(screen.getByText("42 words")).toBeInTheDocument();
  });

  it("displays Markdown and UTF-8 indicators", () => {
    render(StatusBar);
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getByText("UTF-8")).toBeInTheDocument();
  });

  it("renders a level dropdown button showing the current level label", () => {
    render(StatusBar);
    const btn = screen.getByLabelText(
      "Markdown compatibility level",
    ) as HTMLButtonElement;
    expect(btn).toBeInTheDocument();
    // Default level is 'advanced' -> label shows "Advanced".
    expect(btn.textContent).toContain("Advanced");
  });

  it("opens the level popover and selecting a preset calls updateSetting", async () => {
    const { updateSetting } = await import("$lib/stores/settings.svelte");
    render(StatusBar);
    const levelBtn = screen.getByLabelText("Markdown compatibility level");
    await fireEvent.click(levelBtn);
    const basicBtn = screen.getByRole("button", { name: "Basic" });
    await fireEvent.click(basicBtn);
    expect(updateSetting).toHaveBeenCalledWith("enabledFeatures", []);
    expect(updateSetting).toHaveBeenCalledWith("markdownLevel", "basic");
  });

  it("shows the feature checklist in the popover and toggling flips to custom", async () => {
    const { updateSetting } = await import("$lib/stores/settings.svelte");
    render(StatusBar);
    const levelBtn = screen.getByLabelText("Markdown compatibility level");
    await fireEvent.click(levelBtn);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(7);
    // Uncheck the "Tables" toggle; the enabledFeatures array should drop
    // "tables" (kept in registry order) and the level should flip to "custom".
    await fireEvent.click(screen.getByRole("checkbox", { name: "Tables" }));
    expect(updateSetting).toHaveBeenCalledWith("enabledFeatures", [
      "strikethrough",
      "task-lists",
      "autolinks",
      "footnotes",
      "raw-html",
      "frontmatter",
    ]);
    expect(updateSetting).toHaveBeenCalledWith("markdownLevel", "custom");
  });

  it("sorts the checklist by required preset group, then label", async () => {
    render(StatusBar);
    await fireEvent.click(
      screen.getByLabelText("Markdown compatibility level"),
    );
    const labels = screen
      .getAllByRole("checkbox")
      .map((cb) => (cb.closest("label") as HTMLElement).title);
    expect(labels).toEqual([
      // github preset group, alphabetical
      "Bare-URL autolinks",
      "Footnotes `[^x]`",
      "Raw HTML",
      "Strikethrough `~~x~~`",
      "Tables",
      "Task lists `- [ ]`",
      // advanced-only group, alphabetical
      "YAML frontmatter",
    ]);
  });

  it("hides the violation badge when there are no violations", () => {
    render(StatusBar);
    const badge = screen.queryByLabelText(/markdown feature violations/);
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain("hidden");
  });

  it("shows the violation badge when violations exist and lists them", async () => {
    mockLevelState.violations = [
      {
        id: "raw-html",
        label: "Raw HTML",
        presets: { github: true, advanced: true },
        lines: [3],
      },
    ];
    render(StatusBar);
    const badge = screen.getByLabelText(
      "1 markdown feature violations",
    ) as HTMLButtonElement;
    expect(badge).toBeInTheDocument();
    await fireEvent.click(badge);
    expect(screen.getByText("Raw HTML (warning)")).toBeInTheDocument();
    expect(screen.getByText(/line: 3/)).toBeInTheDocument();
  });

  it("sorts violation rows by required preset group, then label", async () => {
    mockLevelState.violations = [
      {
        id: "frontmatter",
        label: "YAML frontmatter",
        presets: { advanced: true },
        lines: [1],
      },
      {
        id: "tables",
        label: "Tables",
        presets: { github: true, advanced: true },
        lines: [4],
      },
      {
        id: "highlight",
        label: "Highlight ==x==",
        presets: { advanced: true },
        lines: [9],
      },
      {
        id: "raw-html",
        label: "Raw HTML",
        presets: { github: true, advanced: true },
        lines: [2],
      },
    ];
    const { container } = render(StatusBar);
    await fireEvent.click(
      screen.getByLabelText("4 markdown feature violations"),
    );
    const msgs = Array.from(container.querySelectorAll(".violation-msg")).map(
      (el) => el.textContent,
    );
    expect(msgs).toEqual([
      // github preset group, alphabetical
      "Raw HTML (warning)",
      "Tables (warning)",
      // advanced-only group, alphabetical
      "Highlight ==x== (warning)",
      "YAML frontmatter (warning)",
    ]);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(StatusBar);
    await checkA11y(container);
  });
});
