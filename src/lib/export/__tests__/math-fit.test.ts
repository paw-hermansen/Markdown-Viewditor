// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import {
  computeMathFitFactor,
  scaleWideMathForPrint,
  type MathFitMeasure,
} from "../math-fit";

/**
 * jsdom performs no layout, so the measure is injected: the tests exercise
 * the factor math, the selector scope (display math only), and the
 * --katex-font-scale merging — the DOM parts of the fit. The 1px fit safety
 * margin is disabled (`safetyPx = 0`) so the expected factors are exact.
 */

function stubMeasure(
  naturalWidth: number,
  availableWidth: number,
): MathFitMeasure {
  return {
    naturalWidth: () => naturalWidth,
    availableWidth: () => availableWidth,
  };
}

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "print-content";
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

const wideDisplay = `
  <p class="katex-block">
    <span class="katex-display">
      <span class="katex" data-id="wide"><span class="katex-html">x</span></span>
    </span>
  </p>`;

describe("computeMathFitFactor", () => {
  it("returns 1 when the formula fits", () => {
    expect(computeMathFitFactor(600, 800, 0)).toBe(1);
  });

  it("returns 1 when the formula exactly fills the width", () => {
    expect(computeMathFitFactor(800, 800, 0)).toBe(1);
  });

  it("scales a too-wide formula down to the available width", () => {
    expect(computeMathFitFactor(1600, 800, 0)).toBe(0.5);
    expect(computeMathFitFactor(2000, 800, 0)).toBe(0.4);
  });

  it("leaves a safety margin so rounding cannot clip the formula", () => {
    // Default safety is 1px: 800px available fits 799px of formula.
    expect(computeMathFitFactor(800, 800)).toBeCloseTo(799 / 800, 10);
  });

  it("clamps at 1 so fitting formulas are never enlarged", () => {
    expect(computeMathFitFactor(100, 800, 0)).toBe(1);
  });

  it("returns 1 for unmeasurable input instead of scaling blindly", () => {
    expect(computeMathFitFactor(0, 800, 0)).toBe(1);
    expect(computeMathFitFactor(800, 0, 0)).toBe(1);
    expect(computeMathFitFactor(NaN, 800, 0)).toBe(1);
    expect(computeMathFitFactor(800, NaN, 0)).toBe(1);
    expect(computeMathFitFactor(-5, 800, 0)).toBe(1);
  });
});

describe("scaleWideMathForPrint", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shrinks a display formula that overflows the printable width", () => {
    const root = mount(wideDisplay);
    const factors = scaleWideMathForPrint(root, stubMeasure(1600, 800), 0);

    expect(factors).toEqual([0.5]);
    const katex = root.querySelector<HTMLElement>(".katex")!;
    expect(katex.style.getPropertyValue("--katex-font-scale")).toBe("0.5");
  });

  it("leaves a display formula that fits untouched", () => {
    const root = mount(wideDisplay);
    const factors = scaleWideMathForPrint(root, stubMeasure(600, 800), 0);

    expect(factors).toEqual([1]);
    const katex = root.querySelector<HTMLElement>(".katex")!;
    expect(katex.style.getPropertyValue("--katex-font-scale")).toBe("");
  });

  it("does not touch inline math (no .katex-display wrapper)", () => {
    const root = mount(`
      <p>text <span class="katex"><span class="katex-html">y</span></span></p>
      ${wideDisplay}`);
    const factors = scaleWideMathForPrint(root, stubMeasure(1600, 800), 0);

    expect(factors).toEqual([0.5]);
    const scaled = root.querySelectorAll<HTMLElement>(
      '[style*="--katex-font-scale"]',
    );
    expect(scaled).toHaveLength(1);
    expect(scaled[0].closest(".katex-display")).not.toBeNull();
  });

  it("scales each display formula independently, in document order", () => {
    const root = mount(`
      ${wideDisplay}
      ${wideDisplay}
      ${wideDisplay}`);
    const katexEls = root.querySelectorAll<HTMLElement>(".katex");
    const measures: MathFitMeasure = {
      naturalWidth: (el) =>
        el === katexEls[0] ? 1600 : el === katexEls[1] ? 800 : 3200,
      availableWidth: () => 800,
    };

    const factors = scaleWideMathForPrint(root, measures, 0);

    expect(factors).toEqual([0.5, 1, 0.25]);
    expect(katexEls[0].style.getPropertyValue("--katex-font-scale")).toBe(
      "0.5",
    );
    expect(katexEls[1].style.getPropertyValue("--katex-font-scale")).toBe("");
    expect(katexEls[2].style.getPropertyValue("--katex-font-scale")).toBe(
      "0.25",
    );
  });

  it("merges with a fontsize directive value set on the .katex-block wrapper", () => {
    // ```math {fontsize=2.0} renders <span class="katex-block" style="--katex-font-scale: 2">
    const root = mount(`
      <span class="katex-block" style="--katex-font-scale: 2">
        <span class="katex-display">
          <span class="katex"><span class="katex-html">x</span></span>
        </span>
      </span>`);
    scaleWideMathForPrint(root, stubMeasure(1600, 800), 0);

    const katex = root.querySelector<HTMLElement>(".katex")!;
    // 2.0 (directive) × 0.5 (fit) = 1.0 — big print, exactly filling the page.
    expect(katex.style.getPropertyValue("--katex-font-scale")).toBe("1");
  });

  it("merges with a scale set directly on the formula", () => {
    const root = mount(`
      <p class="katex-block">
        <span class="katex-display">
          <span class="katex" style="--katex-font-scale: 4"><span class="katex-html">x</span></span>
        </span>
      </p>`);
    scaleWideMathForPrint(root, stubMeasure(1600, 800), 0);

    const katex = root.querySelector<HTMLElement>(".katex")!;
    expect(katex.style.getPropertyValue("--katex-font-scale")).toBe("2");
  });
});
