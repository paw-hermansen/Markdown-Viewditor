// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("$lib/stores/file.svelte", () => ({
  fileState: { currentFile: null },
}));
vi.mock("../math-fit", () => ({
  scaleWideMathForPrint: vi.fn(() => [1]),
}));
vi.mock("$lib/extensions/mermaid/renderer", () => ({
  prepareMermaidForPrint: vi.fn(async () => {}),
}));

import {
  buildPrintContainer,
  computeViewerLayoutWidth,
  exportPdf,
} from "../exporters/pdf";
import { scaleWideMathForPrint } from "../math-fit";
import { prepareMermaidForPrint } from "$lib/extensions/mermaid/renderer";

const layout = { layoutWidthPx: 832, scale: 0.86, scaleMode: "zoom" as const };

/** A4 sheet width in PDF points (210mm at 72dpi). */
const A4_WIDTH_PT = (210 / 25.4) * 72;
/** 10mm page margin in PDF points. */
const PAGE_MARGIN_PT = (10 / 25.4) * 72;
/** A4 printable width in PDF points (190mm at 72dpi). */
const PRINT_CONTENT_WIDTH_PT = ((210 - 2 * 10) / 25.4) * 72;

const transformLayout = {
  layoutWidthPx: 832,
  scale: PRINT_CONTENT_WIDTH_PT / 832,
  scaleMode: "transform" as const,
};

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

  it("scopes the clone's ids so url() references never resolve outside it", () => {
    // The live viewer keeps its own copy of the same markup (that is what
    // handlePrint clones) and is display:none at capture time. If the clone's
    // marker references resolved into that hidden copy, Blink would paint no
    // arrowheads in the PDF (Windows bug this guards against).
    const live = document.createElement("div");
    live.id = "viewer-content";
    live.innerHTML =
      '<svg id="mmd-1"><defs><marker id="mmd-1-arrow"><path d="M0 0"/></marker></defs>' +
      '<path marker-end="url(#mmd-1-arrow)"></path></svg>';
    document.body.appendChild(live);

    const handle = buildPrintContainer(live.innerHTML, layout, live);
    const clone = handle.printDiv;

    const cloneIds = [...clone.querySelectorAll("[id]")].map((el) =>
      el.getAttribute("id"),
    );
    expect(cloneIds.length).toBeGreaterThan(0);
    for (const id of cloneIds) {
      // No id in the clone may collide with the (hidden) live viewer.
      expect(live.querySelector(`[id="${id}"]`)).toBeNull();
    }

    // The marker reference must resolve to a marker inside the clone itself.
    const path = clone.querySelector("path[marker-end]")!;
    const ref = path.getAttribute("marker-end")!.match(/url\(#([^)]+)\)/)![1];
    expect(clone.querySelector(`[id="${ref}"]`)).not.toBeNull();
    expect(live.querySelector(`[id="${ref}"]`)).toBeNull();

    handle.cleanup();
    expect(live.querySelector("#mmd-1")).not.toBeNull();
  });

  it("does not add html/body exporting classes until beginPrint() is called", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("theme-export")).toBe(
      false,
    );
    expect(document.body.classList.contains("exporting")).toBe(false);
    expect(document.body.classList.contains("theme-export")).toBe(false);

    handle.beginPrint();

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

  it("does not swap the #viewer-content id until beginPrint() is called", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", layout, live);
    const div = handle.printDiv;
    expect(live.id).toBe("viewer-content");
    expect(div.id).toBe("");

    handle.beginPrint();
    expect(div.id).toBe("viewer-content");
    expect(live.id).toBe("");

    handle.cleanup();
    expect(live.id).toBe("viewer-content");
    expect(document.querySelector(".print-content")).toBeNull();
  });

  it("beginPrint is idempotent", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    handle.beginPrint();
    expect(() => handle.beginPrint()).not.toThrow();
    expect(document.body.classList.contains("exporting")).toBe(true);
    handle.cleanup();
  });

  it("cleanup is safe when beginPrint was never called", () => {
    const live = document.createElement("div");
    live.id = "viewer-content";
    document.body.appendChild(live);

    const handle = buildPrintContainer("<p>hi</p>", layout, live);
    expect(() => handle.cleanup()).not.toThrow();
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    expect(document.body.classList.contains("exporting")).toBe(false);
    expect(document.documentElement.style.background).toBe("");
    expect(document.body.style.background).toBe("");
    expect(live.id).toBe("viewer-content");
    expect(document.getElementById("print-page-background")).toBeNull();
  });

  it("cleanup removes the clone, classes (after beginPrint), and inline styles", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    handle.beginPrint();
    handle.cleanup();
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    expect(document.documentElement.classList.contains("theme-export")).toBe(
      false,
    );
    expect(document.body.classList.contains("theme-export")).toBe(false);
    expect(document.documentElement.style.background).toBe("");
    expect(document.body.style.background).toBe("");
  });
});

describe("buildPrintContainer transform scaling (macOS capture)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    document.getElementById("print-page-background")?.remove();
  });

  it("scales the clone with a transform inside a sized .print-scaler wrapper", () => {
    const handle = buildPrintContainer("<p>hi</p>", transformLayout);
    const div = handle.printDiv;
    const scaler = document.querySelector(".print-scaler") as HTMLDivElement;
    expect(scaler).not.toBeNull();
    expect(div.parentElement).toBe(scaler);
    expect(div.style.zoom).toBe("");
    expect(div.style.transform).toBe(`scale(${transformLayout.scale})`);
    expect(div.style.transformOrigin).toBe("top left");
    expect(scaler.style.width).toBe(`${832 * transformLayout.scale}px`);
    expect(scaler.style.overflow).toBe("hidden");
    handle.cleanup();
    expect(document.querySelector(".print-scaler")).toBeNull();
    expect(document.querySelector(".print-content")).toBeNull();
  });

  it("sizes the capture page to A4 with 10mm margins at beginPrint only", () => {
    const handle = buildPrintContainer("<p>hi</p>", transformLayout);
    // Build phase: the live app UI must keep its full-width layout.
    expect(document.body.style.width).toBe("");
    expect(document.documentElement.style.width).toBe("");

    handle.beginPrint();

    expect(document.documentElement.style.width).toBe(`${A4_WIDTH_PT}px`);
    expect(document.body.style.width).toBe(`${A4_WIDTH_PT}px`);
    expect(document.body.style.marginLeft).toBe("auto");
    expect(document.body.style.paddingTop).toBe(`${PAGE_MARGIN_PT}px`);

    handle.cleanup();
    expect(document.documentElement.style.width).toBe("");
    expect(document.body.style.width).toBe("");
    expect(document.body.style.marginLeft).toBe("");
    expect(document.body.style.paddingTop).toBe("");
  });

  it("does not constrain the page or add a scaler in zoom mode", () => {
    const handle = buildPrintContainer("<p>hi</p>", layout);
    handle.beginPrint();
    expect(document.body.style.width).toBe("");
    expect(document.querySelector(".print-scaler")).toBeNull();
    handle.cleanup();
  });

  it("syncScaleHeight sizes the wrapper to the scaled (transform-aware) height", () => {
    const handle = buildPrintContainer("<p>hi</p>", transformLayout);
    const scaler = document.querySelector(".print-scaler") as HTMLDivElement;
    vi.spyOn(handle.printDiv, "getBoundingClientRect").mockReturnValue({
      width: 538.58,
      height: 1024.4,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    handle.syncScaleHeight();

    expect(scaler.style.height).toBe("1025px");
    handle.cleanup();
  });

  it("syncScaleHeight is a no-op in zoom mode and on empty layouts", () => {
    const zoomHandle = buildPrintContainer("<p>hi</p>", layout);
    expect(() => zoomHandle.syncScaleHeight()).not.toThrow();
    zoomHandle.cleanup();

    const handle = buildPrintContainer("<p>hi</p>", transformLayout);
    const scaler = document.querySelector(".print-scaler") as HTMLDivElement;
    vi.spyOn(handle.printDiv, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    handle.syncScaleHeight();

    expect(scaler.style.height).toBe("");
    handle.cleanup();
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

describe("exportPdf print lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    document.getElementById("print-page-background")?.remove();
  });

  it("keeps the print clone until afterprint", async () => {
    let cloneWasPresentAtAfterprint = false;
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      queueMicrotask(() => {
        cloneWasPresentAtAfterprint =
          document.querySelector(".print-content") !== null;
        window.dispatchEvent(new Event("afterprint"));
      });
    });

    await exportPdf("<p>math</p>", "document");

    expect(cloneWasPresentAtAfterprint).toBe(true);
    expect(document.querySelector(".print-content")).toBeNull();
    printSpy.mockRestore();
  });

  it("resolves via window focus when afterprint never fires (WebKitGTK)", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const exportPromise = exportPdf("<p>math</p>", "document");

    // Let the build phase (font loading + layout rAFs) complete. The print
    // call happens after printAndWaitForCompletion attaches its listeners,
    // so polling on it is the exact "dialog is open" signal.
    await vi.waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(document.querySelector(".print-content")).not.toBeNull();
    expect(document.body.classList.contains("exporting")).toBe(true);

    // The dialog opens (blur) and closes without printing (focus) — exactly
    // the Linux cancel flow, where WebKitGTK never fires afterprint.
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));

    await expect(exportPromise).resolves.toEqual({ warnings: [] });
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.body.classList.contains("exporting")).toBe(false);
    expect(document.documentElement.classList.contains("exporting")).toBe(
      false,
    );
    printSpy.mockRestore();
  });

  it("fallback timer waits for the dialog to close when focus events never fire", async () => {
    vi.useFakeTimers();
    try {
      const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
      const hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(false);

      const exportPromise = exportPdf("<p>math</p>", "document");

      // Let the build phase (fonts.ready + layout rAFs) complete, then let
      // the fallback timer fire repeatedly while the dialog is still open.
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(2000);

      // Cleanup must NOT have run yet: the dialog may still be capturing.
      expect(document.querySelector(".print-content")).not.toBeNull();
      expect(document.body.classList.contains("exporting")).toBe(true);

      // Dialog closes — focus returns to the document, cleanup runs.
      hasFocusSpy.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(500);
      await expect(exportPromise).resolves.toEqual({ warnings: [] });

      expect(document.querySelector(".print-content")).toBeNull();
      expect(document.body.classList.contains("exporting")).toBe(false);
      expect(document.documentElement.classList.contains("exporting")).toBe(
        false,
      );
      printSpy.mockRestore();
      hasFocusSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fits wide display math on the clone after print mode starts", async () => {
    const fitMock = vi.mocked(scaleWideMathForPrint);
    fitMock.mockClear();
    let exportingAtFitTime: boolean | null = null;
    fitMock.mockImplementation((root) => {
      expect(root.classList.contains("print-content")).toBe(true);
      exportingAtFitTime = document.body.classList.contains("exporting");
      return [1];
    });

    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      queueMicrotask(() => window.dispatchEvent(new Event("afterprint")));
    });

    await exportPdf(
      '<p class="katex-block"><span class="katex-display">x</span></p>',
      "document",
    );

    expect(fitMock).toHaveBeenCalledTimes(1);
    // The fit must run after beginPrint(): the theme's metrics only apply to
    // the clone once the #viewer-content id swaps, and they change KaTeX's
    // em-based formula widths.
    expect(exportingAtFitTime).toBe(true);

    printSpy.mockRestore();
    fitMock.mockImplementation(() => [1]);
  });


  it("does not swap Mermaid diagrams on the print-dialog path", async () => {
    vi.mocked(prepareMermaidForPrint).mockClear();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      queueMicrotask(() => window.dispatchEvent(new Event("afterprint")));
    });

    await exportPdf("<p>math</p>", "document");

    expect(prepareMermaidForPrint).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });
});

describe("exportPdf macOS capture lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
    document.getElementById("print-page-background")?.remove();
    // Fresh module graph so pdf.ts re-reads navigator.userAgent on import.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function importAsMacOS() {
    vi.stubGlobal("navigator", {
      userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    return await import("../exporters/pdf");
  }

  it("scales with transform, swaps diagrams, and captures via create_pdf", async () => {
    const { exportPdf: exportPdfMac } = await importAsMacOS();
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const { prepareMermaidForPrint: prepareMock } =
        await import("$lib/extensions/mermaid/renderer");
    vi.mocked(save).mockResolvedValue("/tmp/Document.pdf");

    let scalerAtCapture = false;
    let bodyWidthAtCapture = "";
    let cloneTransformAtCapture = "";
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "create_pdf") {
        scalerAtCapture = document.querySelector(".print-scaler") !== null;
        bodyWidthAtCapture = document.body.style.width;
        cloneTransformAtCapture =
            (document.querySelector(".print-content") as HTMLElement | null)
                ?.style.transform ?? "";
      }
      return undefined;
    });

    const viewerHtml =
        '<p>math</p><div class="mermaid-block" data-mermaid-id="0"></div>';
    const result = await exportPdfMac(viewerHtml, "Document");

    expect(result.savedPath).toBe("/tmp/Document.pdf");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_pdf", {
      savePath: "/tmp/Document.pdf",
    });

    // Diagrams were swapped for the print variant before the capture.
    expect(prepareMock).toHaveBeenCalledTimes(1);
    const preparedRoot = vi.mocked(prepareMock).mock.calls[0][0];
    expect(preparedRoot.classList.contains("print-content")).toBe(true);
    expect(preparedRoot.querySelector(".mermaid-block")).not.toBeNull();

    // The capture ran with transform scaling inside the A4-sized page.
    expect(scalerAtCapture).toBe(true);
    expect(cloneTransformAtCapture).toBe(
        `scale(${PRINT_CONTENT_WIDTH_PT / 832})`,
    );
    expect(bodyWidthAtCapture).toBe(`${A4_WIDTH_PT}px`);

    // Cleanup restored the document.
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.querySelector(".print-scaler")).toBeNull();
    expect(document.body.style.width).toBe("");
    expect(document.body.style.paddingTop).toBe("");
    expect(document.body.classList.contains("exporting")).toBe(false);
  });

  it("keeps the A4 printable width as the scale target", async () => {
    const { exportPdf: exportPdfMac } = await importAsMacOS();
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue("/tmp/Document.pdf");
    vi.mocked(invoke).mockResolvedValue(undefined);

    let scalerWidthAtCapture = "";
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "create_pdf") {
        scalerWidthAtCapture = (
            document.querySelector(".print-scaler") as HTMLElement
        ).style.width;
      }
      return undefined;
    });

    await exportPdfMac("<p>math</p>", "Document");

    // The 832px layout column maps onto the 190mm printable width in PDF
    // points — the same physical content width as the Linux/Windows A4
    // print output.
    expect(parseFloat(scalerWidthAtCapture)).toBeCloseTo(
        PRINT_CONTENT_WIDTH_PT,
        3,
    );
  });

  it("cancels cleanly when the save dialog is dismissed", async () => {
    const { exportPdf: exportPdfMac } = await importAsMacOS();
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(save).mockResolvedValue(null);

    const result = await exportPdfMac("<p>math</p>", "Document");

    expect(result).toEqual({ warnings: [] });
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
    expect(document.querySelector(".print-content")).toBeNull();
    expect(document.querySelector(".print-scaler")).toBeNull();
  });
});
