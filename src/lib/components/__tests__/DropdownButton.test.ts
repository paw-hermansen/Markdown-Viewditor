// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DropdownButton, { type Choice } from "../DropdownButton.svelte";

const choices: Choice<string>[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("DropdownButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current label", () => {
    render(DropdownButton, {
      props: { choices, value: "a", onAction: () => {} },
    });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("opens the menu on caret click", async () => {
    render(DropdownButton, {
      props: { choices, value: "a", onAction: () => {} },
    });
    await fireEvent.click(screen.getByLabelText("More options"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(DropdownButton, {
      props: { choices, value: "a", onAction: () => {} },
    });
    await fireEvent.click(screen.getByLabelText("More options"));
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside click", async () => {
    render(DropdownButton, {
      props: { choices, value: "a", onAction: () => {} },
    });
    await fireEvent.click(screen.getByLabelText("More options"));
    await fireEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("selects an item and closes", async () => {
    const onSelect = vi.fn();
    render(DropdownButton, {
      props: { choices, value: "a", onSelect, onAction: () => {} },
    });
    await fireEvent.click(screen.getByLabelText("More options"));
    await fireEvent.click(screen.getByText("Beta"));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("restores focus to the main button on Escape", async () => {
    render(DropdownButton, {
      props: { choices, value: "a", onAction: () => {} },
    });
    const mainButton = screen.getAllByRole("button")[0];
    await fireEvent.click(screen.getByLabelText("More options"));
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(mainButton);
  });

  it("awaits onBeforeOpen before opening the menu in menu mode", async () => {
    let resolveLoad!: () => void;
    const onBeforeOpen = vi.fn(
      () => new Promise<void>((r) => (resolveLoad = r)),
    );
    render(DropdownButton, {
      props: {
        choices,
        fixedLabel: "Export as…",
        onSelect: () => {},
        onBeforeOpen,
      },
    });
    const click = fireEvent.click(screen.getByText("Export as…"));
    await Promise.resolve();
    expect(onBeforeOpen).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    resolveLoad();
    await click;
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("opens the menu even when onBeforeOpen fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const onBeforeOpen = vi.fn(() => Promise.reject(new Error("boom")));
    render(DropdownButton, {
      props: {
        choices,
        fixedLabel: "Export as…",
        onSelect: () => {},
        onBeforeOpen,
      },
    });
    await fireEvent.click(screen.getByText("Export as…"));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    err.mockRestore();
  });
});
