import { describe, it, expect } from "vitest";
import { smilesExtension } from "../index";
import { SMILES_OPTIONS_SCHEMA } from "../schema";

describe("smiles extension detection", () => {
  it("detects ```smiles and ```smi fences", () => {
    expect(smilesExtension.detect("```smiles\nCCO\n```")).toBe(true);
    expect(smilesExtension.detect("```smi\nCCO\n```")).toBe(true);
  });

  it("detects tilde fences and fence attributes", () => {
    expect(smilesExtension.detect("~~~smiles\nCCO\n~~~")).toBe(true);
    expect(smilesExtension.detect("```smiles {scale=1.5}\nCCO\n```")).toBe(
      true,
    );
  });

  it("detects uppercase fence info strings", () => {
    expect(smilesExtension.detect("```SMILES\nCCO\n```")).toBe(true);
  });

  it("does not match lookalike languages", () => {
    expect(smilesExtension.detect("```smile\nCCO\n```")).toBe(false);
    expect(smilesExtension.detect("```smith\nCCO\n```")).toBe(false);
    expect(smilesExtension.detect("```js\nsmiles\n```")).toBe(false);
    expect(smilesExtension.detect("plain text about SMILES")).toBe(false);
  });
});

describe("smiles extension definition", () => {
  it("is fence-only with the smiles/smi trigger languages", () => {
    expect(smilesExtension.id).toBe("smiles");
    expect(smilesExtension.triggerLanguages).toEqual(["smiles", "smi"]);
    expect(smilesExtension.loadPlugin).toBeUndefined();
  });

  it("declares the shared schema", () => {
    expect(smilesExtension.fenceOptionsSchema).toBe(SMILES_OPTIONS_SCHEMA);
  });
});
