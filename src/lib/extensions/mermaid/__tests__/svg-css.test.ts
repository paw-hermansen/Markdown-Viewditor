import { describe, it, expect } from "vitest";
import { clampNegativeStrokeWidths } from "../svg-css";

describe("clampNegativeStrokeWidths", () => {
  it("clamps negative stroke-width declarations in style blocks", () => {
    const out = clampNegativeStrokeWidths(
      `<svg><style>.edge-depth-5{stroke-width:-1;}</style></svg>`,
    );
    expect(out).toContain("stroke-width:2px");
    expect(out).not.toContain("stroke-width:-1");
  });

  it("clamps negative values with units and keeps surrounding CSS", () => {
    const out = clampNegativeStrokeWidths(
      `<svg><style>.a{stroke:red;stroke-width: -0.5px;fill:none}.b{stroke-width:-16}</style></svg>`,
    );
    expect(out).toBe(
      `<svg><style>.a{stroke:red;stroke-width: 2px;fill:none}.b{stroke-width:2px}</style></svg>`,
    );
  });

  it("clamps negative values in inline style attributes", () => {
    const out = clampNegativeStrokeWidths(
      `<path style="fill:none;stroke-width: -4;" d="M0 0"/>`,
    );
    expect(out).toContain("stroke-width: 2px;");
  });

  it("clamps negative stroke-width presentation attributes", () => {
    const out = clampNegativeStrokeWidths(`<line stroke-width="-1" x1="0"/>`);
    expect(out).toContain('stroke-width="2px"');
  });

  it("leaves non-negative values byte-identical", () => {
    const svg =
      `<svg><style>.a{stroke-width:11}.b{stroke-width: 0}.c{stroke-width:3.5px}</style>` +
      `<path style="stroke-width:2px" stroke-width="4"/></svg>`;
    expect(clampNegativeStrokeWidths(svg)).toBe(svg);
  });

  it("leaves lookalike properties and non-literal values untouched", () => {
    const svg =
      `<svg><style>.a{x-stroke-width:-5;-stroke-width:-5}` +
      `.b{stroke-width:calc(-1px)}.c{stroke-widthx:-1}</style></svg>`;
    expect(clampNegativeStrokeWidths(svg)).toBe(svg);
  });

  it("is idempotent", () => {
    const once = clampNegativeStrokeWidths(
      `<svg><style>.a{stroke-width:-1}</style></svg>`,
    );
    expect(clampNegativeStrokeWidths(once)).toBe(once);
  });
});
