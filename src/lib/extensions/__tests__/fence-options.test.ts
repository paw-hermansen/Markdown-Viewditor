import { describe, it, expect } from "vitest";
import {
  parseAttrString,
  validateFenceOptions,
  validateExplicitFenceOptions,
  extractBraceAttrs,
  RESET,
} from "../fence-options";
import type { FenceOptionSchema } from "../types";

describe("parseAttrString", () => {
  it("parses key=value pairs", () => {
    const r = parseAttrString("fontsize=1.5 leqno=true");
    expect(r).toEqual({ fontsize: 1.5, leqno: "true" });
  });

  it("parses bare flags as true", () => {
    const r = parseAttrString("leqno fleqn");
    expect(r).toEqual({ leqno: true, fleqn: true });
  });

  it("parses !key as false", () => {
    const r = parseAttrString("!leqno");
    expect(r).toEqual({ leqno: false });
  });

  it("coerces numeric values", () => {
    const r = parseAttrString("fontsize=2.0 width=400");
    expect(r).toEqual({ fontsize: 2.0, width: 400 });
  });

  it("handles quoted values", () => {
    const r = parseAttrString('title="hello world"');
    expect(r).toEqual({ title: "hello world" });
  });

  it("handles empty input", () => {
    expect(parseAttrString("")).toEqual({});
    expect(parseAttrString("  ")).toEqual({});
  });

  it("handles mixed forms", () => {
    const r = parseAttrString("leqno fontsize=1.5 !fleqn");
    expect(r).toEqual({ leqno: true, fontsize: 1.5, fleqn: false });
  });
});

describe("validateFenceOptions", () => {
  const schema: FenceOptionSchema = {
    leqno: { type: "boolean", default: false },
    fleqn: { type: "boolean", default: false },
    fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
    theme: {
      type: "string",
      default: "light",
      values: ["light", "dark"],
    },
  };

  it("applies defaults for missing keys", () => {
    const r = validateFenceOptions({}, schema);
    expect(r.leqno).toBe(false);
    expect(r.fontsize).toBe(1.0);
    expect(r.theme).toBe("light");
  });

  it("validates and coerces provided values", () => {
    const r = validateFenceOptions(
      { leqno: true, fontsize: "2.5", theme: "dark" },
      schema,
    );
    expect(r.leqno).toBe(true);
    expect(r.fontsize).toBe(2.5);
    expect(r.theme).toBe("dark");
  });

  it("clamps numbers to min/max", () => {
    const r = validateFenceOptions({ fontsize: 10 }, schema);
    expect(r.fontsize).toBe(5.0);

    const r2 = validateFenceOptions({ fontsize: 0.1 }, schema);
    expect(r2.fontsize).toBe(0.3);
  });

  it("rejects invalid string values", () => {
    const r = validateFenceOptions({ theme: "invalid" }, schema);
    expect(r.theme).toBe("light"); // falls back to default
  });

  it("converts false on non-boolean keys to RESET", () => {
    const r = validateFenceOptions({ fontsize: false }, schema);
    expect(r.fontsize).toBe(RESET);
  });

  it("handles false on boolean keys as false", () => {
    const r = validateFenceOptions({ leqno: false }, schema);
    expect(r.leqno).toBe(false);
  });
});

describe("extractBraceAttrs", () => {
  it("extracts attrs from brace-delimited info string", () => {
    expect(extractBraceAttrs("math {leqno fontsize=1.5}")).toBe(
      "leqno fontsize=1.5",
    );
  });

  it("returns null when no braces found", () => {
    expect(extractBraceAttrs("math")).toBeNull();
  });

  it("returns null for unclosed brace", () => {
    expect(extractBraceAttrs("math {leqno")).toBeNull();
  });

  it("handles empty braces", () => {
    expect(extractBraceAttrs("math {}")).toBe("");
  });
});

describe("validateExplicitFenceOptions", () => {
  const schema: FenceOptionSchema = {
    leqno: { type: "boolean", default: false },
    fleqn: { type: "boolean", default: false },
    fontsize: { type: "number", default: 1.0, min: 0.3, max: 5.0 },
    theme: {
      type: "string",
      default: "light",
      values: ["light", "dark"],
    },
  };

  it("returns only explicitly-provided keys, no defaults", () => {
    const r = validateExplicitFenceOptions({ leqno: true }, schema);
    expect(r).toEqual({ leqno: true });
    expect(r.fontsize).toBeUndefined();
    expect(r.fleqn).toBeUndefined();
    expect(r.theme).toBeUndefined();
  });

  it("returns empty object for empty input", () => {
    const r = validateExplicitFenceOptions({}, schema);
    expect(r).toEqual({});
  });

  it("coerces string number to number", () => {
    const r = validateExplicitFenceOptions({ fontsize: "2.5" }, schema);
    expect(r.fontsize).toBe(2.5);
  });

  it("clamps number to min/max", () => {
    const r = validateExplicitFenceOptions({ fontsize: 10 }, schema);
    expect(r.fontsize).toBe(5.0);

    const r2 = validateExplicitFenceOptions({ fontsize: 0.1 }, schema);
    expect(r2.fontsize).toBe(0.3);
  });

  it("rejects invalid string value and falls back to default", () => {
    const r = validateExplicitFenceOptions({ theme: "invalid" }, schema);
    expect(r.theme).toBe("light");
  });

  it("!key on boolean produces false", () => {
    const r = validateExplicitFenceOptions({ leqno: false }, schema);
    expect(r.leqno).toBe(false);
  });

  it("!key on non-boolean produces RESET", () => {
    const r = validateExplicitFenceOptions({ fontsize: false }, schema);
    expect(r.fontsize).toBe(RESET);
  });

  it("bare flag on boolean produces true", () => {
    const r = validateExplicitFenceOptions({ leqno: true }, schema);
    expect(r.leqno).toBe(true);
  });

  it("bare flag on non-boolean falls back to schema default", () => {
    const r = validateExplicitFenceOptions({ fontsize: true }, schema);
    expect(r.fontsize).toBe(1.0);
  });

  it("ignores unknown keys", () => {
    const r = validateExplicitFenceOptions(
      { unknown: "val", leqno: true },
      schema,
    );
    expect(r.unknown).toBeUndefined();
    expect(r.leqno).toBe(true);
  });
});
