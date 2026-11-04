import { describe, expect, it } from "vitest";
import { vegaLiteExtension } from "../index";

describe("vegaLiteExtension", () => {
  it("is a fence-only extension over the vega-lite languages", () => {
    expect(vegaLiteExtension.id).toBe("vega-lite");
    expect(vegaLiteExtension.triggerLanguages).toEqual([
      "vega-lite",
      "vegalite",
    ]);
    expect(vegaLiteExtension.fenceOptionsSchema).toBeDefined();
    expect(vegaLiteExtension.loadPlugin).toBeUndefined();
  });

  it("detects fenced vega-lite blocks (attrs allowed after the language)", () => {
    expect(vegaLiteExtension.detect("```vega-lite\n{}\n```")).toBe(true);
    expect(vegaLiteExtension.detect("~~~vegalite {theme=dark}\n{}\n~~~")).toBe(
      true,
    );
    expect(vegaLiteExtension.detect("text\n```vega-lite\n{}\n```")).toBe(true);
  });

  it("does not false-negative on language suffixes but avoids prefix collisions", () => {
    // "vega-litefoo" is NOT a trigger (the (?=$|[ \t{]) lookahead).
    expect(vegaLiteExtension.detect("```vega-litefoo\n{}\n```")).toBe(false);
    expect(vegaLiteExtension.detect("no fences here")).toBe(false);
    // "vl" is deliberately not accepted.
    expect(vegaLiteExtension.detect("```vl\n{}\n```")).toBe(false);
  });
});
