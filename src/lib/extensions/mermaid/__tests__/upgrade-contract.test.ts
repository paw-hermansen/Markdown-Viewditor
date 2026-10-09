// @vitest-environment jsdom
/**
 * Upgrade contract: renders REAL Mermaid output and pins the label-positioning
 * internals that `text-offsets.ts` and `fo-measure.ts` compensate for.
 *
 * The other tests here verify the normalizer against synthetic SVG; these
 * verify that the *library* still produces the fragile markup the normalizer
 * was written for. If a Mermaid upgrade fails one of these, re-verify before
 * touching the fix: the failure means either upstream changed the placement
 * mechanism (extend `text-offsets.ts`) or stopped using it (the pass may be
 * obsolete). Use `testing/tools/zoom-sweep/` to re-measure on a real engine.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installSvgLayoutShim } from "./svg-layout-shim";
import { normalizeSvgTextOffsets } from "../text-offsets";

const DIAGRAMS = {
  sequence:
    "sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice",
  gantt:
    "gantt\n    title Plan\n    section A\n    Task one :a1, 2024-01-01, 30d",
  timeline:
    "timeline\n    title History\n    2020 : Founded\n    2022 : Launched",
  xychart:
    'xychart-beta\n    title "Sales"\n    x-axis [Q1, Q2]\n    y-axis "Revenue" 0 --> 100\n    bar [20, 55]',
};

const EM_OFFSET = /d[xy]="[^"]*em"/;
const TRANSLATE_PLACE = /transform="translate\([^"]*\)\s*rotate\(0\)"/;

const rendered: Record<string, string> = {};

beforeAll(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  installSvgLayoutShim();
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false });
  for (const [name, code] of Object.entries(DIAGRAMS)) {
    const { svg } = await mermaid.render(`contract_${name}`, code);
    rendered[name] = svg;
  }
}, 60000);

describe("mermaid upgrade contract (real output)", () => {
  it("em-offset families still place labels with em-based dy/dx", () => {
    for (const name of ["sequence", "gantt", "timeline"] as const) {
      expect(
        EM_OFFSET.test(rendered[name]),
        `${name}: Mermaid no longer emits em-based dy/dx — re-verify whether ` +
          "normalizeSvgTextOffsets is still needed (see AGENTS.md, zoom-sweep)",
      ).toBe(true);
    }
  });

  it("xychart still places labels via translate transforms", () => {
    expect(
      TRANSLATE_PLACE.test(rendered.xychart),
      "xychart: Mermaid no longer places text via translate(x, y) rotate(0) — " +
        "re-verify whether the transform fold in text-offsets.ts is still needed",
    ).toBe(true);
  });

  it("normalizeSvgTextOffsets removes all fragile positioning from real output", () => {
    for (const [name, svg] of Object.entries(rendered)) {
      const out = normalizeSvgTextOffsets(svg);
      expect(EM_OFFSET.test(out), `${name}: em offsets survived`).toBe(false);
      expect(
        TRANSLATE_PLACE.test(out),
        `${name}: translate placement survived`,
      ).toBe(false);
    }
  });

  it("is idempotent on real output", () => {
    for (const [name, svg] of Object.entries(rendered)) {
      const once = normalizeSvgTextOffsets(svg);
      expect(normalizeSvgTextOffsets(once), name).toBe(once);
    }
  });

  it("still measures HTML labels with getBoundingClientRect in foreignObject", async () => {
    // fo-measure.ts normalizes exactly this measurement (older WebKit scales
    // it by the page zoom). If Mermaid switches to another measurement API,
    // the wrapper is dead code and the zoom fix must move to the new one.
    const measured: Element[] = [];
    const proto = Element.prototype as unknown as {
      getBoundingClientRect: (this: Element) => DOMRect;
    };
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function (this: Element): DOMRect {
      measured.push(this);
      return original.call(this);
    };
    try {
      const mermaid = (await import("mermaid")).default;
      await mermaid.render(
        "contract_fo_measure",
        "graph TD\n  A[Start] --> B[End]",
      );
    } finally {
      proto.getBoundingClientRect = original;
    }
    const inForeignObject = (el: Element): boolean => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.localName?.toLowerCase() === "foreignobject") return true;
      }
      return false;
    };
    expect(
      measured.some(inForeignObject),
      "Mermaid no longer measures <foreignObject> label content with " +
        "getBoundingClientRect — re-verify whether the fo-measure.ts zoom " +
        "normalization is still needed (see AGENTS.md, Mermaid Label " +
        "Measurement)",
    ).toBe(true);
  });
});
