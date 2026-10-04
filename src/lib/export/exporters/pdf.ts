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
import { scaleWideMathForPrint } from "../math-fit";
import { scopeSubtreeIds } from "../id-scope";

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
 * One deliberate deviation from viewer-identical layout: display math that
 * is wider than the column (the Viewer scrolls it via `.katex-block`'s
 * horizontal scrollbar) is scaled down to fit the printable width — print
 * media cannot scroll, so unscaled wide formulas would be clipped at the
 * page edge. See `scaleWideMathForPrint()` in ../math-fit.ts.
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

/** Monotonic counter so each print clone's id scope is unique per export. */
let nextPrintScopeId = 0;

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
  // The clone normally copies the live viewer's markup wholesale (see
  // handlePrint in +page.svelte), so its element ids — Mermaid's
  // `<marker id="…">` above all — collide with the originals, which stay in
  // the document inside the display:none app shell at capture time. Blink
  // refuses to paint SVG resource references whose target sits under a
  // display:none ancestor, which is exactly how Mermaid's arrowheads vanish
  // from Windows PDFs while the plain edge paths still print. Renaming the
  // clone's ids (and its internal url(#…)/href/aria/style references) makes
  // it self-contained; see ../id-scope.ts.
  scopeSubtreeIds(printDiv, `print-clone-${nextPrintScopeId++}-`);
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

/**
 * Wait for the print dialog to finish. Three interchangeable signals, all
 * routed through one idempotent `finish()`:
 *
 * - `afterprint` — fired by Chromium (Windows/WebView2) when the print dialog
 *   closes, whether the user printed or cancelled. WebKitGTK (Linux) does not
 *   implement this event at all, so it is not sufficient on its own.
 * - blur → focus — the print dialog is a separate modal OS window: while it
 *   is open the webview is unfocused, and focus returns when it closes. Every
 *   engine captures the page from the DOM while the dialog is open (preview at
 *   open, final render at the Print click), so the moment focus returns the
 *   capture is guaranteed done or cancelled — the earliest safe cleanup point.
 *   Gating on a prior blur avoids finishing early from pre-dialog focus noise.
 * - a re-arming timer (last resort) — for environments where focus events
 *   never arrive. It never cleans up while `document.hasFocus()` is false (the
 *   dialog is still open); it re-arms instead and finishes once the document
 *   is focused again.
 *
 * The clone must stay alive until one of these fires: WebKitGTK can return
 * from window.print() before its native print operation has captured the
 * page, and cleanup mid-capture would make the dialog print the restored app
 * UI instead of the print clone.
 */
function printAndWaitForCompletion(): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let blurred = false;
    let rearmTimer: number | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(rearmTimer);
      resolve();
    };

    const onBlur = () => {
      blurred = true;
    };
    const onFocus = () => {
      if (blurred) finish();
    };

    const armTimer = () => {
      rearmTimer = window.setTimeout(() => {
        if (settled) return;
        if (document.hasFocus()) {
          finish();
        } else {
          armTimer();
        }
      }, 500);
    };

    window.addEventListener("afterprint", finish, { once: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    armTimer();

    try {
      window.print();
    } catch (error) {
      settled = true;
      window.clearTimeout(rearmTimer);
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      reject(error);
    }
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

    // Fit wide display math to the printable width. Runs after beginPrint()
    // on purpose: the theme's #viewer-content rules only apply to the clone
    // once the id swaps, and a theme's font size changes KaTeX's em-based
    // formula widths — measuring earlier would fit to the wrong metrics.
    scaleWideMathForPrint(handle.printDiv);

    // The fit changes formula font sizes (and therefore block heights), so
    // let the layout settle again before the capture.
    await waitForLayout();

    if (isMacOS && savePath) {
      // The capture paginates the full document from its top, so make sure
      // the live view isn't scrolled.
      window.scrollTo(0, 0);
      await invoke("create_pdf", { savePath });
      return { savedPath: savePath, warnings: [] };
    }
    if (!isMacOS) {
      await printAndWaitForCompletion();
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
