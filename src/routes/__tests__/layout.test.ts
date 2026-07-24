// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/svelte";
import type { Snippet } from "svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Layout from "../+layout.svelte";

const snippet = (content = "") => (() => content) as unknown as Snippet;

const { mockLoadSettings } = vi.hoisted(() => ({
  mockLoadSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: {
    viewerTheme: "github-dark",
    viewMode: "split",
    splitRatio: 0.5,
    editorFontSize: 14,
    editorFontFamily: "monospace",
    editorLineNumbers: true,
    editorWordWrap: false,
    lastOpenedFile: null,
    recentFiles: [],
  },
  loadSettings: mockLoadSettings,
}));

vi.mock("$lib/utils/themes", () => ({
  applyTheme: vi.fn().mockResolvedValue(undefined),
  registerUserThemes: vi.fn(),
}));

vi.mock("$lib/utils/user-themes", () => ({
  loadUserThemes: vi.fn().mockResolvedValue([]),
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  setTheme: vi.fn(),
  viewerState: { theme: "github-dark", scrollTop: 0 },
  getThemeType: () => "dark",
}));

describe("+layout.svelte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls loadSettings on mount", async () => {
    render(Layout, { props: { children: snippet("content") } });
    await waitFor(() => {
      expect(mockLoadSettings).toHaveBeenCalled();
    });
  });

  it("renders without errors", () => {
    const { container } = render(Layout, { props: { children: snippet() } });
    expect(container).toBeTruthy();
  });
});
