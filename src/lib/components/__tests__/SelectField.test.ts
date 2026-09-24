// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";
import SelectField from "$lib/components/SelectField.svelte";

const choices = [
  { value: "1", label: "1x (96 DPI)" },
  { value: "2", label: "2x (192 DPI)" },
  { value: "3", label: "3x (288 DPI)" },
];

describe("SelectField", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the label of the current value on the trigger", () => {
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    expect(trigger).toHaveTextContent("2x (192 DPI)");
  });

  it("exposes listbox semantics on the trigger", () => {
    render(SelectField, {
      props: { value: "1", choices, label: "Resolution", onSelect: () => {} },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the listbox with all choices on click", async () => {
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    await fireEvent.click(trigger);
    await tick();

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Resolution" });
    expect(trigger).toHaveAttribute("aria-controls", listbox.id);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "1x (96 DPI)",
      "2x (192 DPI)",
      "3x (288 DPI)",
    ]);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("selects a choice and closes the listbox", async () => {
    const onSelect = vi.fn();
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Resolution" }));
    await tick();
    await fireEvent.click(screen.getByRole("option", { name: "3x (288 DPI)" }));

    expect(onSelect).toHaveBeenCalledWith("3");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves focus back to the trigger after selecting", async () => {
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    await fireEvent.click(trigger);
    await tick();
    await fireEvent.click(screen.getByRole("option", { name: "3x (288 DPI)" }));
    await tick();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on outside click without selecting", async () => {
    const onSelect = vi.fn();
    const { container } = render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Resolution" }));
    await tick();
    await fireEvent.click(document.body);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("opens on ArrowDown and navigates and selects with the keyboard", async () => {
    const onSelect = vi.fn();
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await tick();

    // Opens with the current value focused.
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "2x (192 DPI)" }),
    );

    await fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "3x (288 DPI)" }),
    );

    await fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "2x (192 DPI)" }),
    );

    await fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "3x (288 DPI)" }),
    );

    await fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: "1x (96 DPI)" }),
    );

    await fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("1");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await tick();
    expect(screen.getByRole("listbox")).toBeTruthy();

    await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not open when disabled", async () => {
    render(SelectField, {
      props: {
        value: "2",
        choices,
        label: "Resolution",
        disabled: true,
        onSelect: () => {},
      },
    });
    const trigger = screen.getByRole("button", { name: "Resolution" });
    expect(trigger).toBeDisabled();
    await fireEvent.click(trigger);
    await tick();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("has no accessibility violations (closed)", async () => {
    const { container } = render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    await checkA11y(container);
  });

  it("has no accessibility violations (open)", async () => {
    const { container } = render(SelectField, {
      props: { value: "2", choices, label: "Resolution", onSelect: () => {} },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Resolution" }));
    await tick();
    await checkA11y(container);
  });
});
