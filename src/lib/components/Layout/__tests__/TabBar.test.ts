// @vitest-environment jsdom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import TabBar from "../TabBar.svelte";

vi.mock("$lib/stores/tabs.svelte", () => {
  const tabs = [
    { id: 1, path: "/a/readme.md", dirty: false },
    { id: 2, path: "/b/readme.md", dirty: true },
    { id: 3, path: null, dirty: false },
  ];
  return {
    tabsState: { tabs, activeId: 2 },
    tabPath: (t: (typeof tabs)[number]) => t.path,
    tabDirty: (t: (typeof tabs)[number]) => t.dirty,
  };
});

function setup() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(TabBar, { onSelect, onClose });
  return { ...utils, onSelect, onClose };
}

describe("TabBar", () => {
  it("renders disambiguated labels with tooltips and marks the active tab", () => {
    const { getAllByRole } = setup();
    const tabs = getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("title"))).toEqual([
      "a/readme.md",
      "b/readme.md",
      "Untitled",
    ]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].textContent).toContain("●");
    expect(tabs[0].textContent).not.toContain("●");
  });

  it("selects on label click and closes on × without selecting", async () => {
    const { getAllByRole, getByLabelText, onSelect, onClose } = setup();
    await fireEvent.click(getAllByRole("tab")[0]);
    expect(onSelect).toHaveBeenCalledWith(1);

    await fireEvent.click(getByLabelText("Close Untitled"));
    expect(onClose).toHaveBeenCalledWith(3);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("scrolls horizontally with the wheel but leaves Ctrl+wheel (zoom) alone", async () => {
    const { getByRole } = setup();
    const strip = getByRole("tablist");
    await fireEvent.wheel(strip, { deltaY: 40 });
    expect(strip.scrollLeft).toBe(40);
    await fireEvent.wheel(strip, { deltaY: 40, ctrlKey: true });
    expect(strip.scrollLeft).toBe(40);
  });
});
