import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Exporter, ExportResult } from "../types";
import { settingsState } from "$lib/stores/settings.svelte";
import { fileState } from "$lib/stores/file.svelte";

/**
 * PDF exporter. Reuses the in-app print path: on macOS it builds the print
 * container and calls `invoke('create_pdf', …)` (WKWebView `createPDF` with an
 * A4-sized capture rect); on other platforms it falls back to `window.print()`
 * so the user picks "Save as PDF" in the browser dialog.
 *
 * Fidelity contract (see also the export section in app.css): the print
 * container carries the `.viewer-content` class — and in theme mode the
 * `#viewer-content` id — so markdown.css and the active theme CSS style it
 * exactly like the on-screen Viewer. The container is laid out at the
 * viewer's maximum content width and then scaled to the paper with CSS
 * `zoom`, so line wrapping in the PDF matches the viewer word-for-word.
 * KaTeX fonts are loaded in-document, so math prints correctly.
 */

export interface PrintContainerHandle {
  printDiv: HTMLDivElement;
  /** Restore the document to its pre-export state (remove the clone, etc.). */
  cleanup: () => void;
}

export interface PrintLayout {
  /** Full laid-out width of the clone in CSS px, before scaling. */
  layoutWidthPx: number;
  /** CSS zoom factor mapping the laid-out width onto the paper. */
  zoom: number;
  /**
   * When set (macOS capture path), constrain the page body to this width in
   * CSS px so the WKWebView capture rect maps 1:1 onto the document.
   */
  pageWidthPx?: number;
}

/* ===== Page geometry =====
   The paper target is A4 with 10mm margins on every path. On the
   `window.print()` path the @page rule in app.css makes A4 the preselected
   default in the print dialog and sizes the printable area in CSS px
   (96 dpi); on the macOS capture path the Rust side passes an A4 rect (in
   points, 72 dpi) to WKPDFConfiguration. Both map the same laid-out width
   onto the same physical 190mm, so output is identical across platforms. */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 10;
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const PT_PER_INCH = 72;

/** Printable width inside the A4 margins, in CSS px (for window.print()). */
const PRINT_CONTENT_WIDTH_PX =
  ((A4_WIDTH_MM - 2 * PAGE_MARGIN_MM) / MM_PER_INCH) * CSS_PX_PER_INCH;

/** A4 page size in PDF points (for the macOS WKPDFConfiguration rect). */
export const A4_PAGE_WIDTH_PT = (A4_WIDTH_MM / MM_PER_INCH) * PT_PER_INCH;
export const A4_PAGE_HEIGHT_PT = (A4_HEIGHT_MM / MM_PER_INCH) * PT_PER_INCH;

/** Printable width inside the A4 margins, in points (macOS capture). */
const MAC_CAPTURE_CONTENT_WIDTH_PT =
  A4_PAGE_WIDTH_PT - 2 * ((PAGE_MARGIN_MM / MM_PER_INCH) * PT_PER_INCH);

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
 * class so markdown.css applies directly (single source of truth); in theme
 * mode it also takes over the `#viewer-content` id so the theme CSS applies.
 * The page background is applied inline to html/body so it propagates to the
 * full page canvas (full bleed, including @page margins).
 */
export function buildPrintContainer(
  viewerHtml: string,
  style: "printer-friendly" | "theme",
  layout: PrintLayout,
  viewerContentElement?: HTMLElement,
): PrintContainerHandle {
  const themeMode = style === "theme";

  // Resolve the page background BEFORE the id swap detaches the theme rules
  // from the live viewer element.
  const pageBackground = themeMode
    ? resolvePageBackground(viewerContentElement)
    : { color: "#ffffff", image: "" };

  const printDiv = document.createElement("div");
  printDiv.classList.add("viewer-content", "print-content");
  printDiv.innerHTML = viewerHtml;
  printDiv.style.width = `${layout.layoutWidthPx}px`;
  printDiv.style.zoom = String(layout.zoom);
  document.body.appendChild(printDiv);

  if (themeMode && viewerContentElement) {
    printDiv.id = "viewer-content";
    viewerContentElement.id = "";
  }

  const exportClass = themeMode ? "theme-export" : "print-friendly";
  document.documentElement.classList.add("exporting", exportClass);
  document.body.classList.add("exporting", exportClass);

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
  if (layout.pageWidthPx !== undefined) {
    document.body.style.width = `${layout.pageWidthPx}px`;
  }

  return {
    printDiv,
    cleanup() {
      document.documentElement.classList.remove(
        "exporting",
        "print-friendly",
        "theme-export",
      );
      document.body.classList.remove(
        "exporting",
        "print-friendly",
        "theme-export",
      );
      document.documentElement.style.background = "";
      document.body.style.background = "";
      document.body.style.width = "";
      pageStyleEl.remove();
      printDiv.remove();
      if (themeMode && viewerContentElement) {
        viewerContentElement.id = "viewer-content";
      }
    },
  };
}

/* ===== Printer-friendly syntax highlighting =====
   Printer-friendly output must not depend on the selected viewer theme, but
   the theme's global `.hljs` token rules would otherwise bleed into the
   export. The GitHub Light rules are re-scoped to the export container with
   higher-specificity selectors, making the printer-friendly look fully
   deterministic. */

let cachedPrinterFriendlySyntaxCss: string | null = null;

/**
 * Re-scope a theme's highlight rules to the printer-friendly export
 * container. Rules targeting `#viewer-content` are dropped (structure is
 * styled by the printer-friendly palette in app.css), and the base `.hljs`
 * rule loses its background so code keeps the palette's neutral chip/panel
 * backgrounds while tokens get GitHub Light colors.
 */
export function scopeSyntaxCssForPrint(css: string): string {
  const scope = "body.print-friendly .print-content";
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  for (const chunk of withoutComments.split("}")) {
    const braceIndex = chunk.indexOf("{");
    if (braceIndex === -1) continue;
    const selectorText = chunk.slice(0, braceIndex).trim();
    let declarations = chunk.slice(braceIndex + 1).trim();
    if (!selectorText || !declarations) continue;
    if (selectorText.includes("#viewer-content")) continue;
    if (selectorText === ".hljs") {
      declarations = declarations
        .split(";")
        .filter((d) => !/^\s*background(-color)?\s*:/.test(d))
        .join(";")
        .trim();
      if (!declarations) continue;
    }
    const scoped = selectorText
      .split(",")
      .map((s) => `${scope} ${s.trim()}`)
      .join(", ");
    out.push(`${scoped} { ${declarations} }`);
  }
  return out.join("\n");
}

/**
 * Inject the re-scoped GitHub Light syntax rules for the duration of a
 * printer-friendly export. Returns a remover function.
 */
async function injectPrinterFriendlySyntax(): Promise<() => void> {
  if (cachedPrinterFriendlySyntaxCss === null) {
    const mod = await import("$lib/styles/highlight/github-light.css?raw");
    cachedPrinterFriendlySyntaxCss = scopeSyntaxCssForPrint(mod.default);
  }
  const styleEl = document.createElement("style");
  styleEl.id = "print-friendly-syntax";
  styleEl.textContent = cachedPrinterFriendlySyntaxCss;
  document.head.appendChild(styleEl);
  return () => styleEl.remove();
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
  const style = settingsState.printStyle;
  const removeSyntaxStyle =
    style === "printer-friendly" ? await injectPrinterFriendlySyntax() : null;

  const layoutWidthPx = computeViewerLayoutWidth(viewerContentElement);
  const layout: PrintLayout = isMacOS
    ? {
        layoutWidthPx,
        zoom: MAC_CAPTURE_CONTENT_WIDTH_PT / layoutWidthPx,
        pageWidthPx: A4_PAGE_WIDTH_PT,
      }
    : {
        layoutWidthPx,
        zoom: PRINT_CONTENT_WIDTH_PX / layoutWidthPx,
      };
  const handle = buildPrintContainer(
    viewerHtml,
    style,
    layout,
    viewerContentElement,
  );

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
    await waitForLayout();

    if (isMacOS && savePath) {
      // The capture rect is in web page coordinates starting at the document
      // origin; make sure the live view isn't scrolled.
      window.scrollTo(0, 0);
      await invoke("create_pdf", {
        savePath,
        pageWidth: A4_PAGE_WIDTH_PT,
        pageHeight: A4_PAGE_HEIGHT_PT,
      });
      return { savedPath: savePath, warnings: [] };
    }
    if (!isMacOS) {
      window.print();
      return { warnings: [] };
    }
    return { warnings: [] };
  } finally {
    handle.cleanup();
    removeSyntaxStyle?.();
  }
}

export const pdfExporter: Exporter = {
  id: "pdf",
  label: isMacOS ? "Export as PDF" : "Export as PDF (Print…)",
  extension: "pdf",
  async export(ctx) {
    return exportPdf(ctx.html, ctx.fileName);
  },
};
