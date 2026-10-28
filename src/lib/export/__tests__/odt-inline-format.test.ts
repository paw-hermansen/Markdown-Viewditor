import { describe, it, expect } from "vitest";
import { InlineFormatState } from "../odt/context";

describe("InlineFormatState", () => {
  it("returns null for plain text", () => {
    const s = new InlineFormatState();
    expect(s.currentStyle()).toBeNull();
  });

  it("flat toggle leaks: bold stays on without a close", () => {
    const s = new InlineFormatState();
    s.boldActive = true;
    expect(s.currentStyle()).toBe("Char_B");
    // no close toggled -> still bold
    expect(s.currentStyle()).toBe("Char_B");
  });

  it("combines flags in B, I, U, S order", () => {
    const s = new InlineFormatState();
    s.italicActive = true;
    s.boldActive = true;
    s.strikeActive = true;
    s.underlineActive = true;
    expect(s.currentStyle()).toBe("Char_BIUS");
  });

  it("sub wins over sup", () => {
    const s = new InlineFormatState();
    s.subActive = true;
    s.superActive = true;
    expect(s.currentStyle()).toBe("Char_P_sub");
  });

  it("mark and link do not alter the Char_ style name", () => {
    const s = new InlineFormatState();
    s.boldActive = true;
    s.markActive = true;
    s.linkHref = "https://example.com";
    expect(s.currentStyle()).toBe("Char_B");
  });

  it("position suffixes render", () => {
    const s = new InlineFormatState();
    s.superActive = true;
    expect(s.currentStyle()).toBe("Char_P_sup");
  });
});
