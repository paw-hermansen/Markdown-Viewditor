import { describe, it, expect } from "vitest";
import { mergeOptions } from "../directive-merge";
import { RESET } from "../fence-options";
import type { FenceOptionSchema } from "../types";

const schema: FenceOptionSchema = {
  leqno: { type: "boolean", default: false },
  fleqn: { type: "boolean", default: false },
  fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
  theme: { type: "string", default: "light", values: ["light", "dark"] },
};

describe("mergeOptions", () => {
  it("uses schema defaults when no overrides", () => {
    const r = mergeOptions(schema, {}, {});
    expect(r).toEqual({
      leqno: false,
      fleqn: false,
      fontsize: 1.0,
      theme: "light",
    });
  });

  it("applies directive options over defaults", () => {
    const r = mergeOptions(schema, { leqno: true, fontsize: 1.5 }, {});
    expect(r.leqno).toBe(true);
    expect(r.fontsize).toBe(1.5);
    expect(r.fleqn).toBe(false); // default
  });

  it("applies fence options over directives", () => {
    const r = mergeOptions(
      schema,
      { leqno: true, fontsize: 1.5 },
      { leqno: false, fontsize: 2.0 },
    );
    expect(r.leqno).toBe(false); // fence override
    expect(r.fontsize).toBe(2.0); // fence override
  });

  it("resets to default with RESET sentinel", () => {
    const r = mergeOptions(schema, { fontsize: 2.0 }, { fontsize: RESET });
    expect(r.fontsize).toBe(1.0); // back to default
  });

  it("resets boolean with RESET to default", () => {
    const r = mergeOptions(schema, { leqno: true }, { leqno: RESET });
    expect(r.leqno).toBe(false); // back to default
  });

  it("clamps numbers from directives", () => {
    const r = mergeOptions(schema, { fontsize: 10 }, {});
    expect(r.fontsize).toBe(5.0); // clamped to max
  });

  it("validates string values from fence options", () => {
    const r = mergeOptions(schema, {}, { theme: "invalid" });
    expect(r.theme).toBe("light"); // falls back to default
  });

  it("handles empty directive and fence options", () => {
    const r = mergeOptions(schema, {}, {});
    expect(r.leqno).toBe(false);
    expect(r.fontsize).toBe(1.0);
  });
});
