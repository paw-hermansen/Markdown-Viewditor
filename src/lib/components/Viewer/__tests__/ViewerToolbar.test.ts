// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ViewerToolbar from "../ViewerToolbar.svelte";
import {
  registerExporter,
  unregisterExporter,
} from "$lib/export/registry.svelte";

vi.mock("../ThemeSelector.svelte", () => ({
  default: () => "ThemeSelector",
}));

// The toolbar exposes two controls (plus the theme selector): a single
// "Export as HTML" button (registry-fed) and a "Print / PDF" button.
// jsdom's navigator.userAgent is not Macintosh, so the Print button is
// shown (on macOS it would be hidden).

const FAKE_EXPORTER = {
  id: "test-html",
  label: "Export as HTML",
  extension: "html",
  export: vi.fn(async () => ({ warnings: [] })),
};

describe("ViewerToolbar", () => {
  beforeEach(() => {
    registerExporter(FAKE_EXPORTER);
  });

  afterEach(() => {
    unregisterExporter("test-html");
  });

  it("renders the Export button when an exporter is registered", () => {
    render(ViewerToolbar, { props: { onExport: vi.fn() } });
    expect(screen.getByTitle("Export as HTML")).toBeInTheDocument();
  });

  it("renders the Print button when onPrint is provided", () => {
    render(ViewerToolbar, { props: { onPrint: vi.fn() } });
    expect(screen.getByTitle("Print / PDF (Ctrl+P)")).toBeInTheDocument();
  });

  it("does not render the Export button when onExport is not provided", () => {
    render(ViewerToolbar, { props: { onPrint: vi.fn() } });
    expect(screen.queryByTitle("Export as HTML")).not.toBeInTheDocument();
  });

  it("does not render the Print button when onPrint is not provided", () => {
    render(ViewerToolbar, { props: { onExport: vi.fn() } });
    expect(screen.queryByTitle("Print / PDF (Ctrl+P)")).not.toBeInTheDocument();
  });

  it("calls onExport when the Export button is clicked", async () => {
    const onExport = vi.fn();
    render(ViewerToolbar, { props: { onExport } });
    await fireEvent.click(screen.getByTitle("Export as HTML"));
    expect(onExport).toHaveBeenCalledWith("test-html");
  });

  it("calls onPrint when the Print button is clicked", async () => {
    const onPrint = vi.fn();
    render(ViewerToolbar, { props: { onPrint } });
    await fireEvent.click(screen.getByTitle("Print / PDF (Ctrl+P)"));
    expect(onPrint).toHaveBeenCalled();
  });
});
