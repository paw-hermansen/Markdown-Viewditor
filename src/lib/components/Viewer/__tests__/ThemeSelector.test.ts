// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ThemeSelector from "../ThemeSelector.svelte";

const { mockViewerState, mockSetTheme, mockApplyTheme } = vi.hoisted(() => ({
  mockViewerState: { theme: "github-dark", scrollTop: 0 },
  mockSetTheme: vi.fn(),
  mockApplyTheme: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/stores/viewer.svelte", () => ({
  viewerState: mockViewerState,
  setTheme: mockSetTheme,
}));

vi.mock("$lib/utils/themes", () => ({
  getAllThemes: () => [
    { id: "github-dark", label: "GitHub Dark", type: "dark", builtin: true },
    { id: "github-light", label: "GitHub Light", type: "light", builtin: true },
    {
      id: "atom-one-dark",
      label: "Atom One Dark",
      type: "dark",
      builtin: true,
    },
  ],
  getThemeLabel: (id: string) => {
    const themes: Record<string, string> = {
      "github-dark": "GitHub Dark",
      "github-light": "GitHub Light",
      "atom-one-dark": "Atom One Dark",
    };
    return themes[id] ?? id;
  },
  applyTheme: mockApplyTheme,
}));

describe("ThemeSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewerState.theme = "github-dark";
  });

  it("renders theme button with current theme name", () => {
    render(ThemeSelector);
    expect(screen.getByText("GitHub Dark")).toBeInTheDocument();
  });

  it("opens dropdown on button click", async () => {
    render(ThemeSelector);
    await fireEvent.click(screen.getByTitle("Select theme"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("shows all available themes in dropdown", async () => {
    render(ThemeSelector);
    await fireEvent.click(screen.getByTitle("Select theme"));
    const themeLabels = screen.getAllByText("GitHub Dark");
    expect(themeLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("GitHub Light")).toBeInTheDocument();
    expect(screen.getByText("Atom One Dark")).toBeInTheDocument();
  });

  it("highlights the active theme", async () => {
    render(ThemeSelector);
    await fireEvent.click(screen.getByTitle("Select theme"));
    const dropdownItems = screen.getAllByText("GitHub Dark");
    const activeItem = dropdownItems.find((el) =>
      el.closest(".dropdown-item")?.classList.contains("active"),
    );
    expect(activeItem).toBeDefined();
  });

  it("calls applyTheme and setTheme on theme select", async () => {
    render(ThemeSelector);
    await fireEvent.click(screen.getByTitle("Select theme"));
    await fireEvent.click(screen.getByText("GitHub Light"));
    expect(mockApplyTheme).toHaveBeenCalledWith("github-light");
    expect(mockSetTheme).toHaveBeenCalledWith("github-light");
  });

  it("closes dropdown after selecting a theme", async () => {
    render(ThemeSelector);
    await fireEvent.click(screen.getByTitle("Select theme"));
    await fireEvent.click(screen.getByText("GitHub Light"));
    expect(screen.queryByText("Theme")).not.toBeInTheDocument();
  });
});
