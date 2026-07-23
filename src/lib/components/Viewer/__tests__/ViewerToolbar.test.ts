// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import ViewerToolbar from "../ViewerToolbar.svelte";

vi.mock("../ThemeSelector.svelte", () => ({
  default: () => "ThemeSelector",
}));

describe("ViewerToolbar", () => {
  it("renders Copy HTML button when onCopyHtml is provided", () => {
    render(ViewerToolbar, {
      props: { onCopyHtml: vi.fn(), onPrint: vi.fn() },
    });
    expect(screen.getByTitle("Copy HTML")).toBeInTheDocument();
  });

  it("renders Print button when onPrint is provided", () => {
    render(ViewerToolbar, {
      props: { onCopyHtml: vi.fn(), onPrint: vi.fn() },
    });
    expect(screen.getByTitle("Print")).toBeInTheDocument();
  });

  it("does not render Copy HTML button when onCopyHtml is not provided", () => {
    render(ViewerToolbar, { props: { onPrint: vi.fn() } });
    expect(screen.queryByTitle("Copy HTML")).not.toBeInTheDocument();
  });

  it("does not render Print button when onPrint is not provided", () => {
    render(ViewerToolbar, { props: { onCopyHtml: vi.fn() } });
    expect(screen.queryByTitle("Print")).not.toBeInTheDocument();
  });

  it("calls onCopyHtml on Copy HTML click", async () => {
    const onCopyHtml = vi.fn();
    render(ViewerToolbar, {
      props: { onCopyHtml, onPrint: vi.fn() },
    });
    await fireEvent.click(screen.getByTitle("Copy HTML"));
    expect(onCopyHtml).toHaveBeenCalled();
  });

  it("calls onPrint on Print click", async () => {
    const onPrint = vi.fn();
    render(ViewerToolbar, {
      props: { onCopyHtml: vi.fn(), onPrint },
    });
    await fireEvent.click(screen.getByTitle("Print"));
    expect(onPrint).toHaveBeenCalled();
  });
});
