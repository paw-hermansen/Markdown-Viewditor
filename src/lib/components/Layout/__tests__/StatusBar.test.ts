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
  violationMessage: (v: { label: string }) => `${v.label} (warning)`,
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
    // Uncheck the first toggle ("tables"); the enabledFeatures array should
    // drop "tables" and the level should flip to "custom".
    await fireEvent.click(checkboxes[0]);
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

  it("hides the violation badge when there are no violations", () => {
    render(StatusBar);
    expect(screen.queryByLabelText(/markdown feature violations/)).toBeNull();
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

  it("has no accessibility violations", async () => {
    const { container } = render(StatusBar);
    await checkA11y(container);
  });
});
