// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import html2canvas from "html2canvas";
import {
  renderMathToMathml,
  renderMathToPng,
  cropTransparentRows,
  cropTransparentBounds,
  measureMathVisualBounds,
  MATH_HOST_WIDTH_PX,
} from "../math-render";

// jsdom can't run html2canvas for real (it walks the DOM and tries to
// paint through canvas APIs that aren't fully implemented). Mock it with
// a no-op so the dimension regression test below can run end-to-end
// against `renderMathToPng`. The mock canvas must also implement
// `toBlob` synchronously — jsdom's stock HTMLCanvasElement has a no-op
// `toBlob` that never calls its callback, which would hang the test.
// Other tests in this file don't hit the happy path so the mock is
// harmless for them.
vi.mock("html2canvas", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: vi.fn(async (el: HTMLElement, opts?: any) => {
    const canvas = document.createElement("canvas");
    // Use the options passed by the renderer to create a canvas with
    // the correct bitmap dimensions (width * scale × height * scale).
    const w = opts?.width ?? 1;
    const h = opts?.height ?? 1;
    const s = opts?.scale ?? 1;
    canvas.width = Math.max(1, Math.round(w * s));
    canvas.height = Math.max(1, Math.round(h * s));
    // jsdom prints "Not implemented: HTMLCanvasElement's getContext()" to
    // stderr.  Provide a minimal stub so the warning never fires.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any).getContext = () => ({
      drawImage: () => undefined,
      clearRect: () => undefined,
    });
    canvas.toBlob = function (cb: BlobCallback) {
      cb(new Blob([new Uint8Array([0])], { type: "image/png" }));
    };
    void el;
    return canvas;
  }),
}));

// `renderMathToPng` awaits two rAFs to let layout settle before
// html2canvas. jsdom's rAF is real-time (fires on a ~16ms tick) and
// silently no-ops when no visual context is active, which makes the
// test hang for the full timeout. Force synchronous rAF callbacks.
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

describe("renderMathToMathml", () => {
  it("produces MathML for inline math", () => {
    const result = renderMathToMathml("x^2");
    expect(result).toContain("<math");
    expect(result).toContain("</math>");
    expect(result).toContain("msup");
  });

  it("produces MathML for display math", () => {
    const result = renderMathToMathml("\\frac{a}{b}", true);
    expect(result).toContain("<math");
    expect(result).toContain("mfrac");
  });

  it("produces MathML for inline math (displayMode=false)", () => {
    const result = renderMathToMathml("E = mc^2", false);
    expect(result).toContain("<math");
    expect(result).toContain("mi"); // variable identifiers
  });

  it("handles invalid LaTeX gracefully (throwOnError=false)", () => {
    const result = renderMathToMathml("\\invalid{");
    // Should not throw; produces a .katex-error span or similar
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("renders Greek letters", () => {
    const result = renderMathToMathml("\\alpha + \\beta");
    expect(result).toContain("<math");
    expect(result).toContain("\u03b1"); // α
  });

  it("renders summation", () => {
    const result = renderMathToMathml("\\sum_{i=0}^{n} x_i", true);
    expect(result).toContain("<math");
    expect(result).toContain("munderover");
  });

  it("opens and closes with <math>/</math> for valid LaTeX", () => {
    const result = renderMathToMathml("x + y");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
  });

  it("does NOT wrap output in katex <span>", () => {
    const result = renderMathToMathml("x^2");
    expect(result).not.toContain("<span");
    expect(result).not.toContain('class="katex"');
  });

  it("renders \\ce{H2O} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\ce{H2O}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders \\pu{123 kJ/mol} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\pu{123 kJ/mol}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders \\ce{2H2 + O2 -> 2H2O} (mhchem) as valid MathML", () => {
    const result = renderMathToMathml("\\ce{2H2 + O2 -> 2H2O}", true);
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).toContain("mrow");
  });

  it("renders \\ce with isotopes", () => {
    const result = renderMathToMathml("\\ce{^{227}_{90}Th+}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("renders Zeise salt formula \\ce{[Pt(\\eta^2-C2H4)Cl3]-}", () => {
    const result = renderMathToMathml("\\ce{[Pt(\\eta^2-C2H4)Cl3]-}");
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
    expect(result).toContain('mathvariant="normal"');
  });

  it("renders \\ce with nested \\underset as valid MathML", () => {
    const tex =
      "\\ce{Zn^2+ <=>[+ 2OH-][+ 2H+] $\\underset{\\text{amphoteres Hydroxid}}{\\ce{Zn(OH)2 v}}$ <=>[+ 2OH-][+ 2H+] $\\underset{\\text{Hydroxozikat}}{\\ce{[Zn(OH)4]^2-}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result.startsWith("<math")).toBe(true);
    expect(result.endsWith("</math>")).toBe(true);
    expect(result).not.toContain("katex-error");
  });

  it("sanitizes structural MathML violations", () => {
    const tex = "\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result).not.toMatch(/<\/munder>\s*<\/mi>/);
    expect(result).toContain("<munder>");
    expect(result).toContain("<mtext>label</mtext>");
  });

  it("replaces zero-width phantom bases with empty rows", () => {
    const result = renderMathToMathml("\\ce{H2O}", false);
    expect(result).not.toMatch(
      /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b/,
    );
    expect(result).not.toContain("<mphantom>");
    expect(result).toContain("<mrow/>");
  });

  it("replaces zero-width phantoms in complex \\ce formula", () => {
    const tex = "\\ce{Zn^2+ $\\underset{\\text{label}}{\\ce{Zn(OH)2 v}}$}";
    const result = renderMathToMathml(tex, true);
    expect(result).not.toMatch(
      /<\s*mpadded\b[^>]*\bwidth\s*=\s*"0px"[^>]*>\s*<\s*mphantom\b/,
    );
    expect(result).not.toContain("<mphantom>");
    expect(result).toContain("<mrow/>");
    expect(result).not.toContain("katex-error");
  });

  it("appends <mrow/> after trailing + charge sign", () => {
    const result = renderMathToMathml("\\ce{Zn^2+}", true);
    expect(result).not.toContain("katex-error");
    // The + at end of <mrow> must have <mrow/> appended for LibreOffice
    expect(result).toMatch(/<mo[^>]*>\+<\/mo><mrow\/><\/mrow>/);
  });

  it("appends <mrow/> after trailing − charge sign", () => {
    const result = renderMathToMathml("\\ce{CrO4^2-}", true);
    expect(result).not.toContain("katex-error");
    // The − at end of <mrow> must have <mrow/> appended for LibreOffice
    expect(result).toMatch(/<mo[^>]*>[−-]<\/mo><mrow\/><\/mrow>/);
  });

  it("appends <mrow/> after trailing − in msup (Zeise salt)", () => {
    const result = renderMathToMathml("\\ce{[Pt(\\eta^2-C2H4)Cl3]-}", false);
    expect(result).not.toContain("katex-error");
    // The − charge is wrapped: <msup><mrow/><mrow><mo>−</mo><mrow/></mrow></msup>
    expect(result).toMatch(/<mo[^>]*>[−-]<\/mo><mrow\/><\/mrow><\/msup>/);
  });

  it("does NOT add <mrow/> for + in reaction equations", () => {
    const result = renderMathToMathml("\\ce{2H2 + O2 -> 2H2O}", true);
    expect(result).not.toContain("katex-error");
    // The + between terms should NOT have <mrow/> appended (it has a right operand)
    expect(result).not.toMatch(/<mo[^>]*>\+<\/mo><mrow\/><mrow>/);
  });
});

describe("renderMathToPng", () => {
  it("rejects invalid scale", async () => {
    await expect(renderMathToPng("x", false, 0)).rejects.toThrow(/scale/);
    await expect(renderMathToPng("x", false, -1)).rejects.toThrow(/scale/);
  });

  it("rejects invalid resolution in options object", async () => {
    await expect(
      renderMathToPng({ tex: "x", displayMode: false, resolution: 0 }),
    ).rejects.toThrow(/scale/);
    await expect(
      renderMathToPng({ tex: "x", displayMode: false, resolution: -1 }),
    ).rejects.toThrow(/scale/);
  });

  it("rejects invalid layout width before rasterization", async () => {
    await expect(
      renderMathToPng({
        tex: "x",
        displayMode: true,
        resolution: 1,
        layoutWidthPx: 0,
      }),
    ).rejects.toThrow(/layout width/);
    await expect(
      renderMathToPng({
        tex: "x",
        displayMode: true,
        resolution: 1,
        layoutWidthPx: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(/layout width/);
  });

  it("throws when called without a DOM", async () => {
    // jsdom DOES provide document, but the test should still cover the
    // explicit error path. Force the host factory to return null by
    // stubbing document via vi.stubGlobal to undefined.
    const originalDocument = (globalThis as { document?: unknown }).document;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).document;
      await expect(renderMathToPng("x", false, 1)).rejects.toThrow(
        /no DOM available/,
      );
    } finally {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
  });

  it("returns CSS-px dimensions (not post-scale) so ODT display size is correct", async () => {
    // Regression: previously the returned `widthPx`/`heightPx` were
    // multiplied by `scale`, which made rasterized math render N times
    // larger than the surrounding text (and clip the line) when the user
    // picked a scale > 1. The `scale` parameter only controls bitmap
    // sharpness; display size must stay at the CSS-px size.
    //
    // In jsdom the mock canvas has no real pixels, so
    // `cropTransparentBounds` short-circuits and the returned width
    // includes the horizontal buffer (HORIZONTAL_BUFFER_PX on each side).
    // The width assertion verifies that `scale` doesn't inflate the
    // returned dimensions.
    const FAKE_W = 50;
    const FAKE_H = 20;
    const HORIZONTAL_BUFFER = 20;
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: FAKE_H,
        right: FAKE_W,
        width: FAKE_W,
        height: FAKE_H,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      // In jsdom, horizontal crop can't work (no getImageData), so the
      // returned width includes the horizontal buffer on both sides.
      const expectedW = FAKE_W + 2 * HORIZONTAL_BUFFER;
      const r1 = await renderMathToPng("x^2", false, 1);
      expect(r1.widthPx).toBe(expectedW);

      // Same width regardless of scale — `scale` only affects the
      // bitmap inside the PNG, not the CSS layout size.
      const r2 = await renderMathToPng("x^2", false, 2);
      expect(r2.widthPx).toBe(expectedW);

      const r3 = await renderMathToPng("x^2", false, 3);
      expect(r3.widthPx).toBe(expectedW);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("accepts options object signature", async () => {
    const FAKE_W = 50;
    const FAKE_H = 20;
    const HORIZONTAL_BUFFER = 20;
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: FAKE_H,
        right: FAKE_W,
        width: FAKE_W,
        height: FAKE_H,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const r = await renderMathToPng({
        tex: "x^2",
        displayMode: false,
        resolution: 2,
        targetFontSize: 11,
      });
      const expectedScale = 11 / 16;
      // In jsdom, horizontal crop can't work, so width includes buffer.
      const expectedW = (FAKE_W + 2 * HORIZONTAL_BUFFER) * expectedScale;
      expect(r.widthPx).toBeCloseTo(expectedW, 4);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("requests the bundled KaTeX font faces before capture", async () => {
    const load = vi.fn(async () => []);
    const fonts = {
      load,
      ready: Promise.resolve(),
    } as unknown as FontFaceSet;
    const originalFonts = (document as unknown as { fonts?: unknown }).fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: fonts,
    });
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 24,
        right: 80,
        width: 80,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    };

    try {
      await renderMathToPng("a+b=c", false, 1);
      expect(load).toHaveBeenCalledWith("normal 16px KaTeX_Main");
      expect(load).toHaveBeenCalledWith("italic 16px KaTeX_Math");
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: originalFonts,
      });
    }
  });

  it("keeps the capture under the host and cleans up after capture failure", async () => {
    let capturedRoot: HTMLElement | undefined;
    let capturedTarget: HTMLElement | undefined;
    let baselineProbe: HTMLElement | undefined;
    let parentAtCapture: Element | null | undefined;
    const originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 24,
        right: 80,
        width: 80,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const mockedHtml2Canvas = vi.mocked(html2canvas);
    mockedHtml2Canvas.mockImplementationOnce(async (element) => {
      const target = element.firstElementChild as HTMLElement;
      capturedRoot = element;
      capturedTarget = target;
      baselineProbe = target.firstElementChild as HTMLElement;
      parentAtCapture = element.parentElement;
      throw new Error("capture failed");
    });

    try {
      await expect(renderMathToPng("x^2", false, 1)).rejects.toThrow(
        "capture failed",
      );

      expect(parentAtCapture?.id).toBe("katex-raster-host");
      expect(capturedTarget?.parentElement).toBeNull();
      expect(capturedTarget?.style.display).toBe("inline-block");
      expect(capturedTarget?.style.paddingTop).toBe("");
      expect(capturedTarget?.style.paddingBottom).toBe("");
      expect(baselineProbe?.getAttribute("aria-hidden")).toBe("true");
      expect(baselineProbe?.style.width).toBe("0px");
      expect(baselineProbe?.style.height).toBe("0px");
      expect(capturedTarget?.style.position).toBe("");
      expect(capturedTarget?.style.width).toBe("");
      expect(capturedTarget?.style.boxSizing).toBe("");
      expect(capturedRoot?.isConnected).toBe(false);
      expect(document.getElementById("katex-raster-host")?.innerHTML).toBe("");
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it("captures display math at the host's page-content width (not the formula width)", async () => {
    // Regression: display math should be centered on the page with the
    // tag at the right page-edge, matching the markdown preview's
    // `.katex-display` layout. The host is pinned to a fixed width
    // (see `MATH_HOST_WIDTH_PX`), so we verify display math captures
    // that width regardless of the formula's intrinsic width.
    const HOST_W = MATH_HOST_WIDTH_PX;
    const FORMULA_H = 24;
    const origRect = Element.prototype.getBoundingClientRect;
    // Stub only the wrapper (firstElementChild of host). With
    // `display: block` on the wrapper, the stub's reported rect is
    // the captured region.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      // Match every element so KaTeX's internal layout doesn't break
      // mid-render; only the wrapper's effective rect matters for the
      // assertion.
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: FORMULA_H + 40, // 20 px top + formula + 20 px bottom padding
        right: HOST_W,
        width: HOST_W,
        height: FORMULA_H + 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const r = await renderMathToPng("x^2 \\tag{7.a}", true, 1);
      // Display math keeps its full page-width PNG (no horizontal crop).
      expect(r.widthPx).toBe(HOST_W);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("captures inline math at the formula's natural width (shrink-wrap)", async () => {
    // Regression guard: the host's fixed width must not pull inline
    // math out to page-width — inline math lives inside prose, so its
    // wrapper (`display: inline-block`) shrink-wraps to the formula.
    const FORMULA_W = 80;
    const LINE_BOX_H = 24;
    const HORIZONTAL_BUFFER = 20;
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: LINE_BOX_H,
        right: FORMULA_W,
        width: FORMULA_W,
        height: LINE_BOX_H,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const r = await renderMathToPng("x^2", false, 1);
      // The inline target is line-box-sized; the mock has no pixels to
      // exercise the vertical crop, so this assertion focuses on width.
      expect(r.widthPx).toBe(FORMULA_W + 2 * HORIZONTAL_BUFFER);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("scales returned dimensions when targetFontSize is set (supersampling)", async () => {
    // With host at 16px and targetFontSize=11, the returned width
    // should be 11/16 = 0.6875× the CSS width — the bitmap stays
    // at 16px sharpness but the ODT displays at 10pt size.
    const FORMULA_W = 100;
    const LINE_BOX_H = 20;
    const HORIZONTAL_BUFFER = 20;
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: LINE_BOX_H,
        right: FORMULA_W,
        width: FORMULA_W,
        height: LINE_BOX_H,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const r = await renderMathToPng("x^2", false, 1, 11);
      const expectedScale = 11 / 16;
      // In jsdom, horizontal crop can't work, so width includes buffer.
      const expectedW = (FORMULA_W + 2 * HORIZONTAL_BUFFER) * expectedScale;
      expect(r.widthPx).toBeCloseTo(expectedW, 4);
      // Without targetFontSize, width should be unscaled (but still
      // includes the buffer in jsdom).
      const r2 = await renderMathToPng("x^2", false, 1);
      expect(r2.widthPx).toBe(FORMULA_W + 2 * HORIZONTAL_BUFFER);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("uses custom layoutWidthPx from options", async () => {
    const CUSTOM_W = 400;
    const FORMULA_H = 24;
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: FORMULA_H + 40,
        right: CUSTOM_W,
        width: CUSTOM_W,
        height: FORMULA_H + 40,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const r = await renderMathToPng({
        tex: "x^2",
        displayMode: true,
        resolution: 1,
        layoutWidthPx: CUSTOM_W,
      });
      // Display math keeps its full page-width PNG (no horizontal crop).
      expect(r.widthPx).toBe(CUSTOM_W);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
    }
  });

  it("cropTransparentRows strips equal empty rows from top and bottom (white background)", () => {
    // Unit test for the cropping logic. jsdom doesn't implement
    // `getContext('2d').getImageData`, so we stub a fake 2D context
    // globally for this test. The input canvas is fabricated and the
    // output canvas (created internally by `document.createElement`)
    // also picks up the stub via the prototype override.
    //
    // The background is white (255,255,255,255) — what html2canvas
    // produces when `backgroundColor: null` isn't honored or the
    // webview fills unoccupied pixels with the document body's
    // background. This test guards the regression where the crop
    // logic only checked `alpha === 0` and missed opaque backgrounds.
    const BUFFER = 20;
    const FORMULA_TOP = 22; // first content row (0-indexed)
    const FORMULA_BOTTOM = 29; // last content row
    const W = 80;
    const H = 40;

    const drawCalls: Array<unknown[]> = [];
    const fakeImageData = (w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const isContent = y >= FORMULA_TOP && y <= FORMULA_BOTTOM;
          // White background (matches what html2canvas + body
          // background produces), opaque black formula pixels.
          data[i] = isContent ? 0 : 255;
          data[i + 1] = isContent ? 0 : 255;
          data[i + 2] = isContent ? 0 : 255;
          data[i + 3] = 255;
        }
      }
      return { data, width: w, height: h } as ImageData;
    };

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) =>
          fakeImageData(w, h),
        drawImage: (...args: unknown[]) => {
          drawCalls.push(args);
        },
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentRows(inputCanvas, BUFFER, 1);

      // 22 empty white rows above, 10 empty white rows below. Strip =
      // min(22, 10, BUFFER) = 10. Output height = 40 - 20 = 20.
      expect(outputCanvas.height).toBe(H - 2 * 10);
      expect(outputCanvas.width).toBe(W);
      // drawImage should have been called with src (0, 10, W, 20) and
      // dst (0, 0, W, 20) — i.e., the cropped middle region.
      expect(drawCalls.length).toBe(1);
      const args = drawCalls[0];
      expect(args[0]).toBe(inputCanvas);
      expect(args[1]).toBe(0); // sx
      expect(args[2]).toBe(10); // sy
      expect(args[3]).toBe(W); // sw
      expect(args[4]).toBe(20); // sh
      expect(args[5]).toBe(0); // dx
      expect(args[6]).toBe(0); // dy
      expect(args[7]).toBe(W); // dw
      expect(args[8]).toBe(20); // dh
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds vertical matches cropTransparentRows behavior", () => {
    // Verify that the new unified helper produces the same result as
    // the legacy vertical-only helper.
    const BUFFER = 20;
    const FORMULA_TOP = 22;
    const FORMULA_BOTTOM = 29;
    const W = 80;
    const H = 40;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const isContent = y >= FORMULA_TOP && y <= FORMULA_BOTTOM;
              data[i] = isContent ? 0 : 255;
              data[i + 1] = isContent ? 0 : 255;
              data[i + 2] = isContent ? 0 : 255;
              data[i + 3] = 255;
            }
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputRows = cropTransparentRows(inputCanvas, BUFFER, 1);
      const outputBounds = cropTransparentBounds(
        inputCanvas,
        BUFFER,
        1,
        "vertical",
      );
      expect(outputBounds.height).toBe(outputRows.height);
      expect(outputBounds.width).toBe(outputRows.width);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds horizontal removes equal columns from both sides", () => {
    // Content occupies columns 30-49 in an 80-wide canvas.
    // Background is white. Symmetric crop should remove equal columns
    // from both sides.
    const W = 80;
    const H = 10;
    const CONTENT_LEFT = 30;
    const CONTENT_RIGHT = 49;

    const drawCalls: Array<unknown[]> = [];
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const isContent = x >= CONTENT_LEFT && x <= CONTENT_RIGHT;
              data[i] = isContent ? 0 : 255;
              data[i + 1] = isContent ? 0 : 255;
              data[i + 2] = isContent ? 0 : 255;
              data[i + 3] = 255;
            }
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: (...args: unknown[]) => {
          drawCalls.push(args);
        },
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        20,
        1,
        "horizontal",
      );

      // firstContent = 30, lastContent = 49
      // edgeGuardPx = max(1, round(2 * 1)) = 2
      // leftRemovable = max(0, 30 - 2) = 28
      // rightRemovable = max(0, 80 - 1 - 49 - 2) = 28
      // bufferPx = round(20 * 1) = 20
      // leftCapped = min(28, 20) = 20
      // rightCapped = min(28, 20) = 20
      // symmetricCrop = min(20, 20) = 20
      // newW = 80 - 2 * 20 = 40
      expect(outputCanvas.width).toBe(40);
      expect(outputCanvas.height).toBe(H);
      expect(drawCalls.length).toBe(1);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds horizontal preserves asymmetric margins", () => {
    // Content occupies columns 5-19 in a 40-wide canvas.
    // Left margin = 5, right margin = 20.
    // Symmetric crop removes min(removable left, removable right).
    const W = 40;
    const H = 10;
    const CONTENT_LEFT = 5;
    const CONTENT_RIGHT = 19;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const isContent = x >= CONTENT_LEFT && x <= CONTENT_RIGHT;
              data[i] = isContent ? 0 : 255;
              data[i + 1] = isContent ? 0 : 255;
              data[i + 2] = isContent ? 0 : 255;
              data[i + 3] = 255;
            }
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        20,
        1,
        "horizontal",
      );

      // firstContent = 5, lastContent = 19
      // edgeGuardPx = max(1, round(2 * 1)) = 2
      // leftRemovable = max(0, 5 - 2) = 3
      // rightRemovable = max(0, 40 - 1 - 19 - 2) = 18
      // bufferPx = round(20 * 1) = 20
      // leftCapped = min(3, 20) = 3
      // rightCapped = min(18, 20) = 18
      // symmetricCrop = min(3, 18) = 3
      // newW = 40 - 2 * 3 = 34
      expect(outputCanvas.width).toBe(34);
      expect(outputCanvas.height).toBe(H);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds horizontal does not crop when no removable margin", () => {
    // Content fills the entire canvas — no removable columns.
    const W = 20;
    const H = 10;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          // All content — black pixels everywhere.
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        20,
        1,
        "horizontal",
      );

      // firstContent = 0, lastContent = 19
      // edgeGuardPx = 2
      // leftRemovable = max(0, 0 - 2) = 0
      // symmetricCrop = min(0, ...) = 0
      // No crop — output equals input.
      expect(outputCanvas.width).toBe(W);
      expect(outputCanvas.height).toBe(H);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds works on transparent backgrounds too", () => {
    // The transparent-background case still works: empty rows are
    // (0,0,0,0), content rows are opaque. The top-left pixel sample
    // is (0,0,0,0) and content differs enough to be detected.
    const BUFFER = 20;
    const FORMULA_TOP = 22;
    const FORMULA_BOTTOM = 29;
    const W = 80;
    const H = 40;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const isContent = y >= FORMULA_TOP && y <= FORMULA_BOTTOM;
              data[i] = 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
              data[i + 3] = isContent ? 255 : 0;
            }
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        BUFFER,
        1,
        "vertical",
      );
      expect(outputCanvas.height).toBe(H - 2 * 10);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds preserves asymmetry when one side has less buffer", () => {
    // Formula sits flush against the bottom of the capture region (no
    // empty rows below), 22 empty rows above. Strip = min(22, 0, BUFFER)
    // = 0 — no crop happens, the buffer wasn't quite enough on one side.
    const W = 80;
    const H = 40;
    const drawCalls: Array<unknown[]> = [];
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string) {
      if (id !== "2d") return null;
      return {
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              // Content starts at row 22 and goes to the last row (39)
              // — zero empty rows at the bottom.
              const isContent = y >= 22;
              data[i] = isContent ? 0 : 255;
              data[i + 1] = isContent ? 0 : 255;
              data[i + 2] = isContent ? 0 : 255;
              data[i + 3] = 255;
            }
          }
          return { data, width: w, height: h } as ImageData;
        },
        drawImage: (...args: unknown[]) => {
          drawCalls.push(args);
        },
      } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;

    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = W;
      inputCanvas.height = H;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        20,
        1,
        "vertical",
      );

      // No crop — output dimensions equal input.
      expect(outputCanvas.height).toBe(H);
      expect(outputCanvas.width).toBe(W);
      expect(drawCalls.length).toBe(0);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });

  it("cropTransparentBounds returns the original canvas when getContext fails", () => {
    // jsdom fallback: getContext returns null. The function should
    // bail out and return the input canvas unchanged.
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = 40;
      inputCanvas.height = 60;

      const outputCanvas = cropTransparentBounds(
        inputCanvas,
        20,
        1,
        "vertical",
      );
      expect(outputCanvas).toBe(inputCanvas);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });
});

describe("measureMathVisualBounds", () => {
  it("keeps the target box and ignores non-ink layout geometry", () => {
    const target = document.createElement("div");
    const katexHtml = document.createElement("span");
    katexHtml.className = "katex-html";
    const pstrut = document.createElement("span");
    pstrut.className = "pstrut";
    const vlistSpacer = document.createElement("span");
    vlistSpacer.className = "vlist-s";
    const glyph = document.createElement("span");
    glyph.textContent = "x";
    katexHtml.append(pstrut, vlistSpacer, glyph);
    target.appendChild(katexHtml);
    document.body.appendChild(target);

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this === target) {
        return {
          x: 100,
          y: 200,
          top: 200,
          left: 100,
          bottom: 250,
          right: 200,
          width: 100,
          height: 50,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === pstrut) {
        return {
          x: 112,
          y: 178,
          top: 178,
          left: 112,
          bottom: 300,
          right: 112,
          width: 0,
          height: 122,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === vlistSpacer) {
        return {
          x: 112,
          y: 210,
          top: 210,
          left: 112,
          bottom: 235,
          right: 500,
          width: 388,
          height: 25,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 112,
        y: 210,
        top: 210,
        left: 112,
        bottom: 235,
        right: 125,
        width: 13,
        height: 25,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const origGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function (this: Element) {
      if (this === pstrut) {
        return [
          {
            x: 112,
            y: 178,
            top: 178,
            left: 112,
            bottom: 300,
            right: 112,
            width: 0,
            height: 122,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      if (this === vlistSpacer) {
        return [
          {
            x: 112,
            y: 210,
            top: 210,
            left: 112,
            bottom: 235,
            right: 500,
            width: 388,
            height: 25,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      if (this === glyph) {
        return [
          {
            x: 112,
            y: 210,
            top: 210,
            left: 112,
            bottom: 235,
            right: 125,
            width: 13,
            height: 25,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    };

    try {
      const bounds = measureMathVisualBounds(target);
      expect(bounds.left).toBe(0);
      expect(bounds.right).toBe(100);
      expect(bounds.top).toBe(0);
      expect(bounds.bottom).toBe(50);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      Element.prototype.getClientRects = origGetClientRects;
      target.remove();
    }
  });

  it("uses an SVG viewport but ignores clipped path geometry", () => {
    const target = document.createElement("div");
    const katexHtml = document.createElement("span");
    katexHtml.className = "katex-html";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(path);
    katexHtml.appendChild(svg);
    target.appendChild(katexHtml);
    document.body.appendChild(target);

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this === target) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 40,
          right: 84,
          width: 84,
          height: 40,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this === svg) {
        return {
          x: 0,
          y: 8,
          top: 8,
          left: 0,
          bottom: 32,
          right: 84,
          width: 84,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 8,
        top: 8,
        left: 0,
        bottom: 32,
        right: 7758,
        width: 7758,
        height: 24,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const origGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function (this: Element) {
      if (this === svg) {
        return [
          {
            x: 0,
            y: 8,
            top: 8,
            left: 0,
            bottom: 32,
            right: 84,
            width: 84,
            height: 24,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      if (this === path) {
        return [
          {
            x: 0,
            y: 8,
            top: 8,
            left: 0,
            bottom: 32,
            right: 7758,
            width: 7758,
            height: 24,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    };

    try {
      const bounds = measureMathVisualBounds(target);
      expect(bounds.right).toBe(84);
      expect(bounds.bottom).toBe(40);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      Element.prototype.getClientRects = origGetClientRects;
      target.remove();
    }
  });

  it("returns target rect when no .katex-html descendant exists", () => {
    const div = document.createElement("div");
    div.style.width = "100px";
    div.style.height = "50px";
    document.body.appendChild(div);

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 10,
        y: 20,
        top: 20,
        left: 10,
        bottom: 70,
        right: 110,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const bounds = measureMathVisualBounds(div);
      // Without .katex-html, the bounds equal the target rect
      // (normalized to target-relative coordinates = 0,0 to w,h).
      expect(bounds.left).toBe(0);
      expect(bounds.right).toBe(100);
      expect(bounds.top).toBe(0);
      expect(bounds.bottom).toBe(50);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      div.remove();
    }
  });

  it("includes descendant elements that extend beyond the target", () => {
    const div = document.createElement("div");
    const katexHtml = document.createElement("span");
    katexHtml.className = "katex-html";
    const inner = document.createElement("span");
    inner.textContent = "wide formula";
    katexHtml.appendChild(inner);
    div.appendChild(katexHtml);
    document.body.appendChild(div);

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      // The target div is 100px wide.
      // The inner span extends to 150px (right overflow).
      if (this === div) {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 50,
          right: 100,
          width: 100,
          height: 50,
          toJSON: () => ({}),
        } as DOMRect;
      }
      // Inner span extends beyond the target.
      return {
        x: 0,
        y: 10,
        top: 10,
        left: 0,
        bottom: 40,
        right: 150,
        width: 150,
        height: 30,
        toJSON: () => ({}),
      } as DOMRect;
    };
    // Also mock getClientRects for the inner element.
    const origGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      if (this === inner) {
        return [
          {
            x: 0,
            y: 10,
            top: 10,
            left: 0,
            bottom: 40,
            right: 150,
            width: 150,
            height: 30,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    };
    try {
      const bounds = measureMathVisualBounds(div);
      // The inner span extends to 150px, so right should be 150.
      expect(bounds.right).toBe(150);
      // Left should still be 0 (target left).
      expect(bounds.left).toBe(0);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      Element.prototype.getClientRects = origGetClientRects;
      div.remove();
    }
  });

  it("does not include hidden MathML in bounds", () => {
    const div = document.createElement("div");
    const katexHtml = document.createElement("span");
    katexHtml.className = "katex-html";
    div.appendChild(katexHtml);
    // Hidden MathML tree — should not contribute to bounds.
    const mathml = document.createElement("span");
    mathml.className = "katex-mathml";
    mathml.style.display = "none";
    div.appendChild(mathml);
    document.body.appendChild(div);

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 50,
        right: 100,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const origGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      if (this === katexHtml) {
        return [
          {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 50,
            right: 100,
            width: 100,
            height: 50,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;
      }
      return [] as unknown as DOMRectList;
    };
    try {
      const bounds = measureMathVisualBounds(div);
      // MathML is hidden (display:none), so bounds should only reflect
      // the katex-html content.
      expect(bounds.right).toBe(100);
      expect(bounds.left).toBe(0);
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      Element.prototype.getClientRects = origGetClientRects;
      div.remove();
    }
  });
});
