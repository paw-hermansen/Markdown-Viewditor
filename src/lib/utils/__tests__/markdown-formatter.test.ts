import { describe, expect, it } from "vitest";
import { formatMarkdown } from "../markdown-formatter";

const fixedWidth = (text: string): number => text.length * 10;

describe("formatMarkdown", () => {
  it("joins and wraps paragraph lines using the available width", () => {
    const source = "one two\nthree four";

    expect(formatMarkdown(source, 100, fixedWidth)).toBe("one two\nthree four");
    expect(formatMarkdown(source, 200, fixedWidth)).toBe("one two three four");
  });

  it("moves a word before it would extend past the measured width", () => {
    const source = "one two three four";
    const result = formatMarkdown(source, 100, fixedWidth);

    expect(result).toBe("one two\nthree four");
    expect(result.split("\n").every((line) => fixedWidth(line) <= 100)).toBe(
      true,
    );
  });

  it("keeps prose with non-breaking hyphens within the measured width", () => {
    const source = [
      "Below is a concise decision‑matrix that covers every major design question you listed,",
      "adds a few missing topics, evaluates the practical options, and recommends the most",
      "balanced choices for a flexible, easily‑tunable prototype.",
    ].join("\n");
    const measureText = (text: string): number =>
      Array.from(text).reduce(
        (width, character) => width + (character === "‑" ? 9 : 8),
        0,
      );
    const width = 640;
    const result = formatMarkdown(source, width, measureText);

    expect(result.split("\n").every((line) => measureText(line) <= width)).toBe(
      true,
    );
  });

  it("measures blockquote prefixes as part of the visible line", () => {
    const source = "> one two three four";
    const result = formatMarkdown(source, 100, fixedWidth);

    expect(result).toBe("> one two\n> three\n> four");
    expect(result.split("\n").every((line) => fixedWidth(line) <= 100)).toBe(
      true,
    );
  });

  it("does not force narrow widths to twenty characters", () => {
    const result = formatMarkdown("one two", 30, fixedWidth);

    expect(result).toBe("one\ntwo");
  });

  it("keeps an unbreakable word on one line without retrying it", () => {
    const result = formatMarkdown("supercalifragilistic next", 30, fixedWidth);

    expect(result).toBe("supercalifragilistic\nnext");
  });

  it("preserves fenced code while wrapping prose around it", () => {
    const source = [
      "one two three four",
      "",
      "```ts",
      "const value = one two three four;",
      "```",
      "",
      "five six seven eight",
    ].join("\n");

    expect(formatMarkdown(source, 100, fixedWidth)).toBe(
      [
        "one two",
        "three four",
        "",
        "```ts",
        "const value = one two three four;",
        "```",
        "",
        "five six",
        "seven",
        "eight",
      ].join("\n"),
    );
  });
});
