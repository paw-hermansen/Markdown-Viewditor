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
});
