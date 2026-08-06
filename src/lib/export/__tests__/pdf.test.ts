// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: { printStyle: "printer-friendly" },
}));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));

import {
  buildPrintContainer,
  computeViewerLayoutWidth,
  scopeSyntaxCssForPrint,
} from "../exporters/pdf";
// @ts-expect-error -- @types/node is not installed; vitest runs in node.
import { readFileSync } from "node:fs";

// Note: importing the css via `?raw` returns an empty string under vitest's
// default CSS handling, so read the real theme file from disk instead.
const githubLightCss = readFileSync(
  "src/lib/styles/highlight/github-light.css",
  "utf8",
);

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
    const handle = buildPrintContainer("<p>hi</p>", "printer-friendly", layout);
    const div = document.querySelector(".print-content") as HTMLDivElement;
    expect(div).not.toBeNull();
    expect(div.classList.contains("viewer-content")).toBe(true);
    expect(div.innerHTML).toBe("<p>hi</p>");
    expect(div.style.width).toBe("832px");
    expect(div.style.zoom).toBe("0.86");
    expect(div.id).toBe("");
    handle.cleanup();
  });

  it("marks html/body as exporting with the style-mode class", () => {
    const handle = buildPrintContainer("<p>hi</p>", "printer-friendly", layout);
    expect(document.documentElement.classList.contains("exporting")).toBe(true);
    expect(document.documentElement.classList.contains("print-friendly")).toBe(
      true,
    );
    expect(document.body.classList.contains("exporting")).toBe(true);
    expect(document.body.classList.contains("print-friendly")).toBe(true);
    handle.cleanup();
  });

  it("paints a white full-bleed page background in printer-friendly mode", () => {
    const handle = buildPrintContainer("<p>hi</p>", "printer-friendly", layout);
    expect(document.documentElement.style.background).toContain(
      "rgb(255, 255, 255)",
    );
    expect(document.body.style.background).toContain("rgb(255, 255, 255)");
    const pageStyle = document.getElementById("print-page-background");
    // jsdom serializes rgb() to hex inside @page rules; accept either form.
    expect(pageStyle?.textContent).toMatch(
      /@page \{ background: (rgb\(255, 255, 255\)|#ffffff); \}/,
    );
    handle.cleanup();
    expect(document.getElementById("print-page-background")).toBeNull();
  });

  it("swaps the #viewer-content id in theme mode and restores it on cleanup", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", "theme", layout, live);
    const div = document.querySelector(".print-content") as HTMLDivElement;
    expect(div.id).toBe("viewer-content");
    expect(live.id).toBe("");

    handle.cleanup();
    expect(live.id).toBe("viewer-content");
    expect(document.querySelector(".print-content")).toBeNull();
  });

  it("uses the live viewer's background for the page in theme mode", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    live.style.backgroundColor = "rgb(13, 17, 23)";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", "theme", layout, live);
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

  it("cleanup removes the clone, classes, and inline styles", () => {
    const handle = buildPrintContainer("<p>hi</p>", "printer-friendly", layout);
    handle.cleanup();
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    expect(document.body.classList.contains("print-friendly")).toBe(false);
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

describe("scopeSyntaxCssForPrint", () => {
  const sample = `
pre code.hljs { display: block; padding: 1em }
/* a comment */
.hljs { color: #24292e; background: #ffffff }
.hljs-keyword,
.hljs-type { color: #d73a49 }
.hljs-addition { color: #116329; background-color: #dafbe1 }
#viewer-content { background: #0d1117; color: #c9d1d9 }
#viewer-content a { color: #58a6ff }
`;

  it("prefixes every selector with the export scope", () => {
    const out = scopeSyntaxCssForPrint(sample);
    expect(out).toContain(
      "body.print-friendly .print-content pre code.hljs { display: block; padding: 1em }",
    );
    expect(out).toContain(
      "body.print-friendly .print-content .hljs-keyword, body.print-friendly .print-content .hljs-type { color: #d73a49 }",
    );
  });

  it("drops the base .hljs background but keeps its text color", () => {
    const out = scopeSyntaxCssForPrint(sample);
    expect(out).toContain(
      "body.print-friendly .print-content .hljs { color: #24292e }",
    );
    expect(out).not.toContain("background: #ffffff");
  });

  it("keeps backgrounds on non-base rules (e.g. diff additions)", () => {
    const out = scopeSyntaxCssForPrint(sample);
    expect(out).toContain("background-color: #dafbe1");
  });

  it("drops #viewer-content theme rules entirely", () => {
    const out = scopeSyntaxCssForPrint(sample);
    expect(out).not.toContain("#viewer-content");
    expect(out).not.toContain("#0d1117");
    expect(out).not.toContain("#58a6ff");
  });

  it("scopes the real GitHub Light theme", () => {
    const out = scopeSyntaxCssForPrint(githubLightCss);
    expect(out).not.toContain("#viewer-content");
    expect(out).toContain("body.print-friendly .print-content .hljs-keyword");
    expect(out).toContain("body.print-friendly .print-content .hljs {");
  });
});
