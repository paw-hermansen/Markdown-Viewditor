// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol = "asset") =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

import {
  registerExporter,
  unregisterExporter,
  listExporters,
  getExporter,
  runExporter,
  registerBuiltinExporters,
} from "../registry.svelte";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

describe("exporter registry", () => {
  it("register/list/unregister an exporter", () => {
    const fake = {
      id: "test-fake",
      label: "Fake",
      extension: "fake",
      export: vi.fn(async () => ({ warnings: [] })),
    };
    registerExporter(fake);
    expect(listExporters().some((e) => e.id === "test-fake")).toBe(true);
    const got = getExporter("test-fake");
    expect(got).toBeDefined();
    expect(got!.id).toBe("test-fake");
    expect(got!.label).toBe("Fake");
    unregisterExporter("test-fake");
    expect(getExporter("test-fake")).toBeUndefined();
  });

  it("runExporter throws for an unknown id", async () => {
    await expect(
      runExporter("nope", {
        markdown: "",
        html: "",
        frontmatter: null,
        fileName: "x",
        tokens: [],
      }),
    ).rejects.toThrow("Unknown exporter: nope");
  });

  it("registerBuiltinExporters registers html and pdf", async () => {
    await registerBuiltinExporters();
    const ids = listExporters().map((e) => e.id);
    expect(ids).toContain("html");
    expect(ids).toContain("pdf");
  }, 15000);
});

describe("html exporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls save dialog and write_file with standalone HTML", async () => {
    await registerBuiltinExporters();
    const htmlExporter = getExporter("html")!;

    vi.mocked(save).mockResolvedValue("/tmp/out.html");
    vi.mocked(invoke).mockResolvedValue(undefined);

    const result = await htmlExporter.export({
      markdown: "# Hi",
      html: "<h1>Hi</h1>",
      frontmatter: null,
      fileName: "doc",
      tokens: [],
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ name: "HTML", extensions: ["html", "htm"] }],
      }),
    );
    expect(invoke).toHaveBeenCalledWith("write_file", {
      path: "/tmp/out.html",
      content: expect.stringContaining("<!DOCTYPE html>"),
    });
    expect(result.savedPath).toBe("/tmp/out.html");
  });

  it("returns without writing when the save dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    const htmlExporter = getExporter("html")!;
    const result = await htmlExporter.export({
      markdown: "",
      html: "",
      frontmatter: null,
      fileName: "d",
      tokens: [],
    });
    expect(result.savedPath).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("pdf export (exportPdf, not in the registry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("on non-macOS, calls window.print() and returns", async () => {
    const { exportPdf } = await import("../exporters/pdf");
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    // jsdom navigator.userAgent is not Macintosh.
    const result = await exportPdf("<p>x</p>", "d");
    expect(printSpy).toHaveBeenCalled();
    expect(result.savedPath).toBeUndefined();
    printSpy.mockRestore();
  });
});
