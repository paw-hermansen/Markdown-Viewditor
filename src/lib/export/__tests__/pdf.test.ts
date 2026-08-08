// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));

import {
  buildPrintContainer,
  computeViewerLayoutWidth,
} from "../exporters/pdf";

const layout = { layoutWidthPx: 832, zoom: 0.86 };

describe("buildPrintContainer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    document.getElementById("print-page-background")?.remove();
  });

  it("creates a .viewer-content.print-content clone with inline geometry", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    const div = document.querySelector(".print-content") as HTMLDivElement;
    expect(div).not.toBeNull();
    expect(div.classList.contains("viewer-content")).toBe(true);
    expect(div.innerHTML).toBe("<p>hi</p>");
    expect(div.style.width).toBe("832px");
    expect(div.style.zoom).toBe("0.86");
    handle.cleanup();
  });

  it("marks html/body as exporting with theme-export class", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    expect(document.documentElement.classList.contains("exporting")).toBe(true);
    expect(document.documentElement.classList.contains("theme-export")).toBe(
      true,
    );
    expect(document.body.classList.contains("exporting")).toBe(true);
    expect(document.body.classList.contains("theme-export")).toBe(true);
    handle.cleanup();
  });

  it("resolves the page background from the live viewer", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    live.style.backgroundColor = "rgb(13, 17, 23)";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", layout, live);
    expect(document.documentElement.style.background).toContain(
      "rgb(13, 17, 23)",
    );
    expect(document.body.style.background).toContain("rgb(13, 17, 23)");
    const pageStyle = document.getElementById("print-page-background");
    // jsdom serializes rgb() to hex inside @page rules; accept either form.
    expect(pageStyle?.textContent).toMatch(
      /@page \{ background: (rgb\(13, 17, 23\)|#0d1117); \}/,
    );
    handle.cleanup();
    expect(document.getElementById("print-page-background")).toBeNull();
  });

  it("swaps the #viewer-content id and restores it on cleanup", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", layout, live);
    const div = document.querySelector(".print-content") as HTMLDivElement;
    expect(div.id).toBe("viewer-content");
    expect(live.id).toBe("");

    handle.cleanup();
    expect(live.id).toBe("viewer-content");
    expect(document.querySelector(".print-content")).toBeNull();
  });

  it("cleanup removes the clone, classes, and inline styles", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    handle.cleanup();
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    expect(document.body.classList.contains("theme-export")).toBe(false);
    expect(document.documentElement.style.background).toBe("");
    expect(document.body.style.background).toBe("");
  });
});

describe("computeViewerLayoutWidth", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("falls back to the built-in 832px without an element", () => {
    expect(computeViewerLayoutWidth()).toBe(832);
  });

  it("falls back to the 800px column plus container padding", () => {
    const container = document.createElement("div");
    container.style.padding = "0 16px";
    const el = document.createElement("div");
    container.appendChild(el);
    document.body.appendChild(container);
    expect(computeViewerLayoutWidth(el)).toBe(832);
  });

  it("combines the theme's max-width with the container padding", () => {
    const container = document.createElement("div");
    container.style.paddingLeft = "20px";
    container.style.paddingRight = "20px";
    const el = document.createElement("div");
    el.style.maxWidth = "600px";
    container.appendChild(el);
    document.body.appendChild(container);
    expect(computeViewerLayoutWidth(el)).toBe(640);
  });
});
