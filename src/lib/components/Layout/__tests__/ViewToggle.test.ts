// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import ViewToggle from "../ViewToggle.svelte";
import { checkA11y } from "$lib/utils/__tests__/a11y-helper";

describe("ViewToggle", () => {
  it("renders three mode buttons", () => {
    render(ViewToggle, {
      props: { viewMode: "split", onchange: vi.fn() },
    });
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  it("renders Edit, Split, and View labels", () => {
    render(ViewToggle, {
      props: { viewMode: "split", onchange: vi.fn() },
    });
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
  });

  it("highlights the active mode", () => {
    render(ViewToggle, {
      props: { viewMode: "editor", onchange: vi.fn() },
    });
    const editButton = screen.getByTitle("Edit");
    expect(editButton).toHaveClass("active");

    const splitButton = screen.getByTitle("Split");
    expect(splitButton).not.toHaveClass("active");

    const viewButton = screen.getByTitle("View");
    expect(viewButton).not.toHaveClass("active");
  });

  it("calls onchange with 'editor' when Edit is clicked", async () => {
    const onchange = vi.fn();
    render(ViewToggle, {
      props: { viewMode: "split", onchange },
    });
    await fireEvent.click(screen.getByTitle("Edit"));
    expect(onchange).toHaveBeenCalledWith("editor");
  });

  it("calls onchange with 'viewer' when View is clicked", async () => {
    const onchange = vi.fn();
    render(ViewToggle, {
      props: { viewMode: "split", onchange },
    });
    await fireEvent.click(screen.getByTitle("View"));
    expect(onchange).toHaveBeenCalledWith("viewer");
  });

  it("calls onchange with 'split' when Split is clicked", async () => {
    const onchange = vi.fn();
    render(ViewToggle, {
      props: { viewMode: "editor", onchange },
    });
    await fireEvent.click(screen.getByTitle("Split"));
    expect(onchange).toHaveBeenCalledWith("split");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(ViewToggle, {
      props: { viewMode: "split", onchange: vi.fn() },
    });
    await checkA11y(container);
  });
});
