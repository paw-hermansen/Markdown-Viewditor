import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  Exporter,
  ExportResult,
  ExportContext,
  OptionGroup,
} from "../types";
import { fileState } from "$lib/stores/file.svelte";
import { OPTION_INCLUDE_FRONTMATTER } from "../frontmatter-card";

/**
 * PDF exporter. Reuses the in-app print path on every platform: it builds
 * the print container, then on Linux/Windows calls `window.print()` (the
 * user picks "Save as PDF" in the browser dialog) and on macOS calls
 * `invoke('create_pdf', …)`, which runs WKWebView's
 * `createPDFWithConfiguration` — an async capture of the laid-out page that
 * produces vector output. The macOS capture paginates the full document as
 * one long page (WKWebView can't tile a nil rect); that's accepted.
 *
 * Fidelity contract (see also the export section in app.css): the print
 * container carries the `.viewer-content` class — and in theme mode the
 * `#viewer-content` id — so markdown.css and the active theme CSS style it
 * exactly like the on-screen Viewer. The container is laid out at the
 * viewer's maximum content width and then scaled to the paper with CSS
 * `zoom`, so line wrapping in the PDF matches the viewer word-for-word.
 * KaTeX fonts are loaded in-document, so math prints correctly.
 *
 * Print mode is deferred until the moment of capture (see `beginPrint()` on
 * `PrintContainerHandle`): `buildPrintContainer()` only stages the clone
 * and the page background, leaving the live viewer styled and the
 * export-overlay spinner visible during the build phase (font loading,
 * layout settling). `exportPdf()` calls `beginPrint()` right before
 * `window.print()` / `invoke('create_pdf')`, which (a) swaps the
 * `#viewer-content` id to the clone so the active theme applies to it,
 * (b) adds `body.exporting` so the app shell hides and the clone becomes
 * the visible content, and (c) lets the `body.exporting .backdrop` rule
 * in app.css hide the spinner so it isn't captured into the PDF.
 */

export interface PrintContainerHandle {
  printDiv: HTMLDivElement;
  /**
   * Switch the document into print mode: swap the `#viewer-content` id from
   * the live viewer to the clone, then add the `exporting` classes (which
   * hide the app shell, reveal the clone, and hide the export-overlay
   * spinner via the `body.exporting .backdrop` rule in app.css). Call
   * once, immediately before the actual print/capture, so the live viewer
   * keeps its theme styling and the spinner stays visible during the
   * build phase. Idempotent.
   */
  beginPrint: () => void;
  /** Restore the document to its pre-export state. Idempotent. */
  cleanup: () => void;
}

export interface PrintLayout {
  /** Full laid-out width of the clone in CSS px, before scaling. */
  layoutWidthPx: number;
  /** CSS zoom factor mapping the laid-out width onto the paper. */
  zoom: number;
}

/* ===== Page geometry =====
   On Linux/Windows the paper target is A4 with 10mm margins: the @page rule
   in app.css makes A4 the preselected default in the print dialog and sizes
   the printable area in CSS px (96 dpi). On macOS the capture page is the
   webview's bounds (not A4 — WKWebView can't honor @page size), so the
   layout is scaled to fill the webview width instead. Both compute zoom so
   the laid-out 832px maps onto the target width, preserving the viewer's
   wrapping. */
const A4_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 10;
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

/** Printable width inside the A4 margins, in CSS px (Linux/Windows). */
const PRINT_CONTENT_WIDTH_PX =
  ((A4_WIDTH_MM - 2 * PAGE_MARGIN_MM) / MM_PER_INCH) * CSS_PX_PER_INCH;

/* ===== Viewer geometry =====
   Defaults mirror the Viewer: markdown.css caps .viewer-content at 800px and
   Viewer.svelte's .viewer-container adds 16px of padding on each side. The
   actual values are read from the live viewer at export time so custom themes
   that override max-width or padding still produce viewer-identical
   wrapping. */
const DEFAULT_VIEWER_MAX_WIDTH_PX = 800;
const DEFAULT_VIEWER_GUTTER_PX = 16;

/**
 * Compute the width the print clone must be laid out at so its content column
 * matches the viewer's maximum: the viewer content's computed max-width plus
 * its container's horizontal padding. Falls back to the built-in defaults
 * when the element (or a measurable value) is unavailable.
 */
export function computeViewerLayoutWidth(
  viewerContentElement?: HTMLElement,
): number {
  const fallback = DEFAULT_VIEWER_MAX_WIDTH_PX + 2 * DEFAULT_VIEWER_GUTTER_PX;
  if (!viewerContentElement) return fallback;

  const contentStyle = getComputedStyle(viewerContentElement);
  const maxWidth = parseFloat(contentStyle.maxWidth);
  const column = Number.isFinite(maxWidth)
    ? maxWidth
    : DEFAULT_VIEWER_MAX_WIDTH_PX;

  let gutter = 2 * DEFAULT_VIEWER_GUTTER_PX;
  const container = viewerContentElement.parentElement;
  if (container) {
    const containerStyle = getComputedStyle(container);
    const left = parseFloat(containerStyle.paddingLeft);
    const right = parseFloat(containerStyle.paddingRight);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      gutter = left + right;
    }
  }
  return column + gutter;
}

function isTransparent(color: string): boolean {
  return (
    !color ||
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color === "rgba(0,0,0,0)"
  );
}

/**
 * Resolve the page background for theme-mode exports: the viewer content's
 * painted background (theme `#viewer-content` rule), falling back to the app
 * shell's body background (what the user sees around the viewer column), and
 * finally white. Also captures a background image for gradient themes.
 */
function resolvePageBackground(viewerContentElement?: HTMLElement): {
  color: string;
  image: string;
} {
  let color = "";
  let image = "";
  if (viewerContentElement) {
    const cs = getComputedStyle(viewerContentElement);
    if (!isTransparent(cs.backgroundColor)) color = cs.backgroundColor;
    if (cs.backgroundImage && cs.backgroundImage !== "none") {
      image = cs.backgroundImage;
    }
  }
  if (!color) {
    const bodyColor = getComputedStyle(document.body).backgroundColor;
    color = isTransparent(bodyColor) ? "#ffffff" : bodyColor;
  }
  return { color, image };
}

/**
 * Build the off-screen `.print-content` container used by both the in-app
 * Print button and this exporter. The clone carries the `.viewer-content`
 * class so markdown.css applies directly (single source of truth); it
 * takes over the `#viewer-content` id (and the `exporting` classes) only
 * when `beginPrint()` is called, so the live viewer keeps its theme
 * styling (and the export-overlay spinner stays visible) during the
 * build phase. The page background is applied inline to html/body now
 * because the clone already needs to size to the printed page area; the
 * inline value on html/body is hidden behind the app shell until
 * `beginPrint()` reveals the clone.
 */
export function buildPrintContainer(
  viewerHtml: string,
  layout: PrintLayout,
  viewerContentElement?: HTMLElement,
): PrintContainerHandle {
  // Resolve the page background now — the value comes from the live
  // viewer, which still owns the #viewer-content id until beginPrint().
  const pageBackground = resolvePageBackground(viewerContentElement);

  const printDiv = document.createElement("div");
  printDiv.classList.add("viewer-content", "print-content");
  printDiv.innerHTML = viewerHtml;
  printDiv.style.width = `${layout.layoutWidthPx}px`;
  printDiv.style.zoom = String(layout.zoom);
  document.body.appendChild(printDiv);

  // Full-bleed page background, two complementary mechanisms:
  // 1. Inline background on html/body — the root element's background
  //    propagates to the page content area (all engines) and paints the
  //    whole captured area in the macOS WKWebView path.
  // 2. An injected @page background rule — Chromium (Windows/WebView2)
  //    extends it over the full sheet including the @page margin areas,
  //    which the root background does not cover. Ignored harmlessly by
  //    engines without @page background support.
  // (Assigning "" to the background shorthand in cleanup clears all
  // background longhands, including the image.)
  document.documentElement.style.background = pageBackground.color;
  document.body.style.background = pageBackground.color;
  let pageRule = `@page { background: ${pageBackground.color}; }`;
  if (pageBackground.image) {
    document.documentElement.style.backgroundImage = pageBackground.image;
    document.body.style.backgroundImage = pageBackground.image;
    pageRule = `@page { background: ${pageBackground.color} ${pageBackground.image}; }`;
  }
  const pageStyleEl = document.createElement("style");
  pageStyleEl.id = "print-page-background";
  pageStyleEl.textContent = pageRule;
  document.head.appendChild(pageStyleEl);

  let inPrintMode = false;

  return {
    printDiv,
    beginPrint() {
      if (inPrintMode) return;
      inPrintMode = true;
      if (viewerContentElement) {
        printDiv.id = "viewer-content";
        viewerContentElement.id = "";
      }
      document.documentElement.classList.add("exporting", "theme-export");
      document.body.classList.add("exporting", "theme-export");
    },
    cleanup() {
      if (inPrintMode) {
        document.documentElement.classList.remove("exporting", "theme-export");
        document.body.classList.remove("exporting", "theme-export");
      }
      if (viewerContentElement) {
        viewerContentElement.id = "viewer-content";
      }
      document.documentElement.style.background = "";
      document.body.style.background = "";
      pageStyleEl.remove();
      printDiv.remove();
    },
  };
}

/** Wait two animation frames so the just-added .print-content has laid out. */
function waitForLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const isMacOS =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");

export async function exportPdf(
  viewerHtml: string,
  fileName: string,
  viewerContentElement?: HTMLElement,
): Promise<ExportResult> {
  const layoutWidthPx = computeViewerLayoutWidth(viewerContentElement);
  // macOS captures the page at the webview's bounds, so scale the laid-out
  // width up to fill the webview width (content fills the PDF edge-to-edge,
  // wrapping still computed at the viewer's 800px column). Other platforms
  // print to A4, so scale to the A4 printable width instead.
  const targetWidthPx = isMacOS ? window.innerWidth : PRINT_CONTENT_WIDTH_PX;
  const layout: PrintLayout = {
    layoutWidthPx,
    zoom: targetWidthPx / layoutWidthPx,
  };
  const handle = buildPrintContainer(viewerHtml, layout, viewerContentElement);

  try {
    let savePath: string | null = null;
    if (isMacOS) {
      const defaultName = fileName
        ? fileName.replace(/\.[^.]+$/, "") + ".pdf"
        : "Untitled.pdf";
      const defaultDir = fileState.currentFile
        ? fileState.currentFile.replace(/[^/\\]+$/, "")
        : undefined;
      savePath = await save({
        defaultPath: defaultDir ? defaultDir + defaultName : defaultName,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!savePath) return { warnings: [] };
    }

    // Ensure custom-theme @font-face fonts are loaded before layout and
    // pagination, so wrapping is computed with final font metrics. (The
    // optional chaining only guards non-browser test environments.)
    await document.fonts?.ready;

    // Switch to print mode right before the capture (macOS createPDF or
    // Linux/Windows window.print). Up to this point the live viewer keeps
    // its theme styling and the export-overlay spinner stays visible.
    // beginPrint() swaps the #viewer-content id to the clone and adds
    // body.exporting — which hides the app shell, reveals the clone, and
    // (via the body.exporting .backdrop rule in app.css) hides the
    // spinner so it isn't captured into the PDF.
    handle.beginPrint();

    // Wait for the just-applied print rules (max-width, padding, etc.) to
    // take effect and for the layout to settle before the capture fires.
    await waitForLayout();

    if (isMacOS && savePath) {
      // The capture paginates the full document from its top, so make sure
      // the live view isn't scrolled.
      window.scrollTo(0, 0);
      await invoke("create_pdf", { savePath });
      return { savedPath: savePath, warnings: [] };
    }
    if (!isMacOS) {
      window.print();
      return { warnings: [] };
    }
    return { warnings: [] };
  } finally {
    handle.cleanup();
  }
}

export const PDF_OPTION_ID = `pdf.${OPTION_INCLUDE_FRONTMATTER}`;

export function pdfOptionGroups(ctx: ExportContext): OptionGroup[] {
  return [
    {
      id: "frontmatter",
      label: "Frontmatter",
      options: [
        {
          id: PDF_OPTION_ID,
          label: "Include frontmatter card",
          hint: "Show the frontmatter or skill card at the top of the exported document.",
          kind: "toggle",
          value: true,
          disabledWhen: () => ctx.frontmatter === null,
        },
      ],
    },
  ];
}

export const pdfExporter: Exporter = {
  id: "pdf",
  label: isMacOS ? "Export as PDF" : "Export as PDF (Print…)",
  description: "Vector document",
  extension: "pdf",
  themeCapable: true,
  optionGroups: pdfOptionGroups,
  async export(ctx) {
    return exportPdf(ctx.html, ctx.fileName);
  },
};
