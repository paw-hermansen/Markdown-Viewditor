// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ViewerToolbar from "../ViewerToolbar.svelte";
import {
  registerExporter,
  unregisterExporter,
} from "$lib/export/registry.svelte";

vi.mock("../ThemeSelector.svelte", () => ({
  default: () => "ThemeSelector",
}));

const FAKE_EXPORTER = {
  id: "test-html",
  label: "Export as HTML",
  extension: "html",
  themeCapable: true,
  export: vi.fn(async () => ({ warnings: [] })),
};

const FAKE_EXPORTER_2 = {
  id: "test-pdf",
  label: "Export as PDF",
  extension: "pdf",
  themeCapable: true,
  export: vi.fn(async () => ({ warnings: [] })),
};

describe("ViewerToolbar", () => {
  beforeEach(() => {
    registerExporter(FAKE_EXPORTER);
  });

  afterEach(() => {
    unregisterExporter("test-html");
    unregisterExporter("test-pdf");
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

  describe("with multiple exporters (dropdown)", () => {
    beforeEach(() => {
      registerExporter(FAKE_EXPORTER_2);
    });

    it("renders a dropdown with title attribute", () => {
      render(ViewerToolbar, { props: { onExport: vi.fn() } });
      expect(screen.getByTitle("Export document")).toBeInTheDocument();
    });

    it("opens dropdown and shows export choices", async () => {
      render(ViewerToolbar, { props: { onExport: vi.fn() } });
      const caret = screen.getByLabelText("More options");
      await fireEvent.click(caret);
      const dropdown = screen.getByRole("menu");
      expect(within(dropdown).getByText("Export as HTML")).toBeInTheDocument();
      expect(within(dropdown).getByText("Export as PDF")).toBeInTheDocument();
    });

    it("shows footer toggle in dropdown", async () => {
      render(ViewerToolbar, { props: { onExport: vi.fn() } });
      const caret = screen.getByLabelText("More options");
      await fireEvent.click(caret);
      expect(
        screen.getByText("Show export and print confirmation"),
      ).toBeInTheDocument();
    });

    it("calls onExport when a dropdown item is clicked", async () => {
      const onExport = vi.fn();
      render(ViewerToolbar, { props: { onExport } });
      const caret = screen.getByLabelText("More options");
      await fireEvent.click(caret);
      const dropdown = screen.getByRole("menu");
      await fireEvent.click(within(dropdown).getByText("Export as HTML"));
      expect(onExport).toHaveBeenCalledWith("test-html");
    });
  });
});
