/**
 * Minimal SVG layout shim so real Mermaid can render under jsdom.
 *
 * Mermaid measures text with `getBBox()` / `getComputedTextLength()` and
 * transforms with `getScreenCTM()` — none of which jsdom implements. The
 * numbers only affect geometry, and the upgrade-contract tests assert
 * *markup* patterns (label placement attributes), so crude constants are
 * fine. Never install this outside tests: real rendering must use the
 * engine's own text measurement.
 */

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function installSvgLayoutShim(): void {
  const ctor = (
    globalThis as unknown as {
      SVGElement?: { prototype: Record<string, unknown> };
    }
  ).SVGElement;
  if (!ctor) {
    throw new Error("SVGLayoutShim requires jsdom (no SVGElement)");
  }
  const proto = ctor.prototype;
  if (typeof proto.getBBox !== "function") {
    proto.getBBox = function getBBox(): BBox {
      return { x: 0, y: 0, width: 10, height: 10 };
    };
  }
  if (typeof proto.getComputedTextLength !== "function") {
    proto.getComputedTextLength = function getComputedTextLength(): number {
      return 10;
    };
  }
  if (typeof proto.getScreenCTM !== "function") {
    proto.getScreenCTM = function getScreenCTM() {
      return {
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
        inverse() {
          return this;
        },
      };
    };
  }
}

/**
 * 2D context stub so cytoscape (the mindmap layout engine) can measure text
 * under jsdom, which has no canvas. Crude constant widths, like the layout
 * shim above — geometry only, never used outside tests.
 */
export function installCanvasStub(): void {
  const proto = (
    globalThis as unknown as {
      HTMLCanvasElement?: { prototype: Record<string, unknown> };
    }
  ).HTMLCanvasElement?.prototype;
  if (!proto) return;
  const ctx = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "measureText") {
          return (s: string) => ({ width: String(s).length * 8 });
        }
        if (prop === "canvas") return { width: 300, height: 150 };
        if (prop === "getImageData") {
          return () => ({ data: new Uint8ClampedArray(4) });
        }
        return () => undefined;
      },
    },
  );
  // Always override: jsdom's getContext exists but throws "not implemented".
  proto.getContext = () => ctx;
}
