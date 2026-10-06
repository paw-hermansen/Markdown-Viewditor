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
import { prepareMermaidForPrint } from "$lib/extensions/mermaid/renderer";

/**
 * PDF exporter. Reuses the in-app print path on every platform: it builds
 * the print container, then on Linux/Windows calls `window.print()` (the
 * user picks "Save as PDF" in the browser dialog) and on macOS calls
 * `invoke('create_pdf', …)`, which runs WKWebView's
 * `createPDFWithConfiguration` — an async capture of the laid-out page that
 * produces vector output. The macOS capture has no paper size and no
 * pagination: one page per capture rect (see `PrintLayout` and the A4
 * geometry notes below).
 *
 * Fidelity contract (see also the export section in app.css): the print
 * container carries the `.viewer-content` class — and in theme mode the
 * `#viewer-content` id — so markdown.css and the active theme CSS style it
 * exactly like the on-screen Viewer. The container is laid out at the
 * viewer's maximum content width and then scaled to the paper (see
 * `PrintLayout`), so line wrapping in the PDF matches the viewer
 * word-for-word. KaTeX fonts are loaded in-document, so math prints
 * correctly.
 *
 * Scaling is platform-split because WebKit's CSS `zoom` mis-scales inline
 * SVG (font-size inside `<foreignObject>` gets the zoom factor applied
 * twice — webkit.org/show_bug.cgi?id=279041 — and SVG geometry/markers
 * distort under zoom on older WebKit):
 *   - Linux/Windows print through the print dialog, which needs
 *     layout-affecting scaling to paginate the clone across A4 pages →
 *     CSS `zoom`.
 *   - macOS captures one page sized to the capture rect we pass to
 *     `createPDFWithConfiguration` (1 CSS px = 1 PDF pt) → a paint-time
 *     `transform: scale()` inside a sized wrapper, which leaves the SVG
 *     geometry untouched. The scale targets the A4 printable width in
 *     points, so the PDF's physical scale matches the Linux/Windows A4
 *     output. Diagrams are additionally swapped for their
 *     foreignObject-free text-label variant (`prepareMermaidForPrint`)
 *     before the capture.
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
  /**
   * Size the transform-mode scaler wrapper to the scaled clone (see
   * `PrintLayout.scaleMode`), so the capture rect (whose height is measured
   * from the document) neither clips the bottom of the document nor extends
   * past the scaled height. Call after the print layout has settled
   * (post-`beginPrint()`); no-op in zoom mode.
   */
  syncScaleHeight: () => void;
  /** Restore the document to its pre-export state. Idempotent. */
  cleanup: () => void;
}

export interface PrintLayout {
  /** Full laid-out width of the clone in CSS px, before scaling. */
  layoutWidthPx: number;
  /** Scale factor mapping the laid-out width onto the paper width. */
  scale: number;
  /**
   * How the scale is applied to the clone:
   * - "zoom" — CSS `zoom` on the clone (Linux/Windows print path). Zoom is
   *   layout-affecting, which is what lets the print engine paginate the
   *   clone across A4 pages.
   * - "transform" — paint-time `transform: scale()` on the clone inside a
   *   sized `.print-scaler` wrapper (macOS capture path). Layout still
   *   happens at the un-scaled `layoutWidthPx`, so wrapping matches the
   *   viewer exactly, but no SVG is laid out under CSS `zoom`.
   */
  scaleMode: "zoom" | "transform";
}

/* ===== Page geometry =====
   On Linux/Windows the paper target is A4 with 10mm margins: the @page rule
   in app.css makes A4 the preselected default in the print dialog and sizes
   the printable area in CSS px (96 dpi). On macOS createPDF has no paper
   size and no pagination — WKWebView can't honor @page size, and the capture
   rect passed to it *is* the page — and it maps 1 CSS px to 1 PDF point
   (72 dpi). The rect is therefore given the A4 width in points, with the
   same 190mm printable width expressed in points — which gives the macOS
   PDF the same physical content width (and the same zoom-100% appearance in
   a PDF viewer) as the Linux/Windows output. Both compute a scale so the
   laid-out 832px maps onto the target width, preserving the viewer's
   wrapping. */
const A4_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 10;
const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;
const POINTS_PER_INCH = 72;

/** Printable width inside the A4 margins, in CSS px (Linux/Windows). */
const PRINT_CONTENT_WIDTH_PX =
  ((A4_WIDTH_MM - 2 * PAGE_MARGIN_MM) / MM_PER_INCH) * CSS_PX_PER_INCH;

/** Printable width inside the A4 margins, in PDF points (macOS capture). */
const PRINT_CONTENT_WIDTH_PT =
  ((A4_WIDTH_MM - 2 * PAGE_MARGIN_MM) / MM_PER_INCH) * POINTS_PER_INCH;

/** Full A4 sheet width in PDF points — the macOS capture page width. */
const A4_WIDTH_PT = (A4_WIDTH_MM / MM_PER_INCH) * POINTS_PER_INCH;

/** Top/bottom page margin on the macOS capture, in PDF points. */
const PAGE_MARGIN_PT = (PAGE_MARGIN_MM / MM_PER_INCH) * POINTS_PER_INCH;

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
 *
 * In `scaleMode: "transform"` (macOS) the clone is wrapped in a sized
 * `.print-scaler` div and scaled with a paint-time transform instead of
 * CSS `zoom`, because WebKit's zoom handling mis-scales inline SVG (see
 * PrintLayout). The wrapper clips the clone's un-scaled layout overflow so
 * the document height (which the capture rect's height is measured from)
 * stays at the scaled size.
 */
export function buildPrintContainer(
  viewerHtml: string,
  layout: PrintLayout,
  viewerContentElement?: HTMLElement,
): PrintContainerHandle {
  // Resolve the page background now — the value comes from the live
  // viewer, which still owns the #viewer-content id until beginPrint().
  const pageBackground = resolvePageBackground(viewerContentElement);
  const useTransform = layout.scaleMode === "transform";

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
  // it self-contained; see ../id-scope.ts. The `<style>` rewrite is
  // load-bearing for more than styling: it must follow Mermaid's compact
  // `#id{font-size:16px;…}` root rule, or the labels fall back to an
  // implicitly inherited font size — which WebKitGTK mis-scales under this
  // container's CSS `zoom`, shrinking the label text inside correctly sized
  // boxes in Linux PDFs.
  scopeSubtreeIds(printDiv, `print-clone-${nextPrintScopeId++}-`);
  printDiv.style.width = `${layout.layoutWidthPx}px`;

  let scalerDiv: HTMLDivElement | null = null;
  if (useTransform) {
    printDiv.style.transform = `scale(${layout.scale})`;
    printDiv.style.transformOrigin = "top left";
    scalerDiv = document.createElement("div");
    scalerDiv.classList.add("print-scaler");
    scalerDiv.style.width = `${layout.layoutWidthPx * layout.scale}px`;
    // The clone lays out at layoutWidthPx inside a scaled-width wrapper;
    // clip that (painted-transposed) overflow or the capture's content
    // bounds would extend to the un-scaled size.
    scalerDiv.style.overflow = "hidden";
    scalerDiv.style.margin = "0 auto";
    scalerDiv.appendChild(printDiv);
    document.body.appendChild(scalerDiv);
  } else {
    printDiv.style.zoom = String(layout.scale);
    document.body.appendChild(printDiv);
  }

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
      if (useTransform && scalerDiv) {
        // Position the content for the A4 capture rect: exportPdf passes the
        // A4 width to create_pdf as the capture rect, so constrain the
        // document to that width (with 10mm vertical margins around the
        // clone, which the .print-scaler auto margins center horizontally)
        // — the content column lands centered at 10mm margins inside the
        // rect. Applied only now so the live app UI keeps its full-width
        // layout during the build phase. The root background still paints
        // the whole captured page.
        document.documentElement.style.width = `${A4_WIDTH_PT}px`;
        document.body.style.width = `${A4_WIDTH_PT}px`;
        document.body.style.margin = "0 auto";
        document.body.style.padding = `${PAGE_MARGIN_PT}px 0`;
      }
    },
    syncScaleHeight() {
      if (!scalerDiv) return;
      // getBoundingClientRect is transform-aware (offsetHeight is not):
      // size the wrapper to the painted height so the capture can neither
      // clip the last lines nor extend past the scaled content.
      const scaledHeight = printDiv.getBoundingClientRect().height;
      if (scaledHeight > 0) {
        scalerDiv.style.height = `${Math.ceil(scaledHeight)}px`;
      }
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
      document.documentElement.style.width = "";
      document.body.style.width = "";
      document.body.style.margin = "";
      document.body.style.padding = "";
      pageStyleEl.remove();
      scalerDiv?.remove();
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
  // Both platforms scale the laid-out width onto the A4 printable width —
  // macOS in PDF points (1 CSS px = 1 pt in the capture, so the PDF's
  // physical scale matches the A4 print output), Linux/Windows in print CSS
  // px — so wrapping still happens at the viewer's 800px column on both.
  const targetWidthPx = isMacOS
    ? PRINT_CONTENT_WIDTH_PT
    : PRINT_CONTENT_WIDTH_PX;
  const layout: PrintLayout = {
    layoutWidthPx,
    scale: targetWidthPx / layoutWidthPx,
    // The macOS capture lays the SVGs under a paint-time transform (WebKit's
    // CSS `zoom` mis-scales inline SVG); the print path needs zoom's
    // layout-affecting scaling so the print engine paginates the clone.
    scaleMode: isMacOS ? "transform" : "zoom",
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

    // macOS: swap the Mermaid diagrams for their foreignObject-free
    // text-label variant before the capture (belt and braces alongside the
    // transform scaling — WebKit mis-scales <foreignObject> content even
    // under transforms on older releases).
    if (isMacOS) {
      await prepareMermaidForPrint(handle.printDiv);
    }

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

    handle.syncScaleHeight();

    if (isMacOS && savePath) {
      // The capture paginates the full document from its top, so make sure
      // the live view isn't scrolled.
      window.scrollTo(0, 0);
      // createPDF has no paper size and no pagination — the rect passed to
      // it *is* the page. Give it the A4 sheet width (the document is
      // constrained to it by beginPrint()) and the full document height, so
      // the result is exactly one A4-wide page with the content column
      // centered at 10mm margins — the same physical scale as the
      // Linux/Windows A4 output.
      const captureHeight = Math.ceil(document.documentElement.scrollHeight);
      await invoke("create_pdf", {
        savePath,
        width: A4_WIDTH_PT,
        height: captureHeight,
      });
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
