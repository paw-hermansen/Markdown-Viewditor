// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import AboutDialog from "../AboutDialog.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../LICENSE?raw", () => ({
  default: "MIT License\n\nCopyright (c) 2026 Paw Hermansen",
}));

const { mockUpdateStatus, mockCheckForUpdates } = vi.hoisted(() => ({
  mockUpdateStatus: {
    available: false,
    version: "",
    pendingUpdate: null as unknown,
  },
  mockCheckForUpdates: vi.fn().mockResolvedValue(false),
}));

vi.mock("$lib/stores/update.svelte", () => ({
  updateStatus: mockUpdateStatus,
  checkForUpdates: mockCheckForUpdates,
}));

const { mockSettingsState, mockUpdateSetting } = vi.hoisted(() => ({
  mockSettingsState: {
    autoCheckUpdates: false,
  },
  mockUpdateSetting: vi.fn((_key: string, value: boolean) => {
    mockSettingsState.autoCheckUpdates = value;
  }),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: mockSettingsState,
  updateSetting: mockUpdateSetting,
}));

describe("AboutDialog", () => {
  it("does not render when open is false", () => {
    render(AboutDialog, { props: { open: false, onClose: vi.fn() } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when open is true", () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows About tab content by default", () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    expect(screen.getByText("Author")).toBeInTheDocument();
    expect(screen.getByText("Paw Hermansen")).toBeInTheDocument();
  });

  it("shows all four tabs", () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    expect(screen.getByRole("tab", { name: "About" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Custom Themes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Dependencies" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "License" })).toBeInTheDocument();
  });

  it("switches to Dependencies tab on click", async () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    await fireEvent.click(screen.getByRole("tab", { name: "Dependencies" }));
    expect(screen.getByText("Tauri v2")).toBeInTheDocument();
    expect(screen.getByText("Svelte 5")).toBeInTheDocument();
  });

  it("switches to License tab on click", async () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    await fireEvent.click(screen.getByRole("tab", { name: "License" }));
    expect(
      screen.getByRole("heading", { name: "MIT License" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Copyright \(c\) 2026 Paw Hermansen/),
    ).toBeInTheDocument();
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    render(AboutDialog, { props: { open: true, onClose } });
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on close button click", async () => {
    const onClose = vi.fn();
    render(AboutDialog, { props: { open: true, onClose } });
    await fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on backdrop click", async () => {
    const onClose = vi.fn();
    render(AboutDialog, { props: { open: true, onClose } });
    const backdrop = screen.getByRole("presentation");
    await fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose on dialog content click", async () => {
    const onClose = vi.fn();
    render(AboutDialog, { props: { open: true, onClose } });
    const dialog = screen.getByRole("dialog");
    await fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows auto-check for updates toggle", () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    expect(
      screen.getByText("Auto-check for updates on startup"),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows Check for Updates button", () => {
    render(AboutDialog, { props: { open: true, onClose: vi.fn() } });
    expect(screen.getByText("Check for Updates")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(AboutDialog, {
      props: { open: true, onClose: vi.fn() },
    });
    await checkA11y(container);
  });
});
