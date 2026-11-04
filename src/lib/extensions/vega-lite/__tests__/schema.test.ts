import { describe, expect, it } from "vitest";
import {
  narrowVegaLiteOptions,
  resolveVegaLiteOptions,
  VEGA_LITE_OPTIONS_SCHEMA,
} from "../schema";

describe("VEGA_LITE_OPTIONS_SCHEMA", () => {
  it("declares the three host options with sane defaults", () => {
    expect(Object.keys(VEGA_LITE_OPTIONS_SCHEMA).sort()).toEqual([
      "align",
      "fitToWidth",
      "theme",
    ]);
    expect(VEGA_LITE_OPTIONS_SCHEMA.align.default).toBe("center");
    expect(VEGA_LITE_OPTIONS_SCHEMA.fitToWidth.default).toBe(true);
    expect(VEGA_LITE_OPTIONS_SCHEMA.theme.default).toBe("auto");
    expect(VEGA_LITE_OPTIONS_SCHEMA.theme.values).toEqual([
      "auto",
      "light",
      "dark",
    ]);
  });
});

describe("resolveVegaLiteOptions", () => {
  it("fills defaults for an empty options record", () => {
    expect(resolveVegaLiteOptions({})).toEqual({
      align: "center",
      fitToWidth: true,
      theme: "auto",
    });
  });

  it("passes through valid explicit values", () => {
    expect(
      resolveVegaLiteOptions({
        align: "left",
        fitToWidth: false,
        theme: "dark",
      }),
    ).toEqual({ align: "left", fitToWidth: false, theme: "dark" });
  });

  it("degrades invalid values to defaults", () => {
    expect(
      resolveVegaLiteOptions({ align: "middle", theme: "forest" }),
    ).toEqual({ align: "center", fitToWidth: true, theme: "auto" });
  });
});

describe("narrowVegaLiteOptions", () => {
  it("narrows an already-merged record (pre-render path)", () => {
    expect(
      narrowVegaLiteOptions({
        align: "right",
        fitToWidth: true,
        theme: "light",
      }),
    ).toEqual({ align: "right", fitToWidth: true, theme: "light" });
  });

  it("treats non-boolean fitToWidth as true (only false disables)", () => {
    expect(narrowVegaLiteOptions({ fitToWidth: undefined }).fitToWidth).toBe(
      true,
    );
    expect(narrowVegaLiteOptions({ fitToWidth: false }).fitToWidth).toBe(false);
  });
});
