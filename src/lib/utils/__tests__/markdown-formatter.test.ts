import { describe, expect, it } from "vitest";
import {
  formatMarkdown,
  formatParagraphAt,
  findParagraphAtLine,
} from "../markdown-formatter";

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

describe("formatParagraphAt", () => {
  const source = [
    "one two three four",
    "",
    "five six",
    "seven eight",
    "",
    "```ts",
    "const value = one two three four;",
    "```",
    "",
    "# Heading",
  ].join("\n");

  it("formats only the paragraph containing the line", () => {
    // Line 2-3 is the second paragraph; wrap it narrowly.
    const result = formatParagraphAt(source, 3, 30, fixedWidth);

    expect(result).not.toBeNull();
    expect(result!.text).toBe("five\nsix\nseven\neight");
    // The replaced range covers only that paragraph's lines.
    expect(source.slice(result!.from, result!.to)).toBe(
      "five six\nseven eight",
    );
  });

  it("leaves the rest of the document untouched", () => {
    const result = formatParagraphAt(source, 0, 30, fixedWidth)!;
    const applied =
      source.slice(0, result.from) + result.text + source.slice(result.to);

    expect(applied).toBe(
      [
        "one\ntwo\nthree\nfour",
        "",
        "five six",
        "seven eight",
        "",
        "```ts",
        "const value = one two three four;",
        "```",
        "",
        "# Heading",
      ].join("\n"),
    );
  });

  it("preserves blockquote prefixes in the targeted paragraph", () => {
    const quoted = ["> one two three four", "", "rest"].join("\n");
    const result = formatParagraphAt(quoted, 0, 100, fixedWidth)!;

    expect(result.text).toBe("> one two\n> three\n> four");
  });

  it("returns null when the line is not in a prose paragraph", () => {
    expect(formatParagraphAt(source, 1, 30, fixedWidth)).toBeNull(); // blank line
    expect(formatParagraphAt(source, 5, 30, fixedWidth)).toBeNull(); // fence
    expect(formatParagraphAt(source, 6, 30, fixedWidth)).toBeNull(); // code line
    expect(formatParagraphAt(source, 9, 30, fixedWidth)).toBeNull(); // heading
    expect(formatParagraphAt(source, 99, 30, fixedWidth)).toBeNull(); // out of range
    expect(formatParagraphAt(source, 0, 0, fixedWidth)).toBeNull(); // zero width
  });
});

describe("findParagraphAtLine", () => {
  it("returns the line range of the containing paragraph", () => {
    const source = ["first line", "still first", "", "second"].join("\n");

    expect(findParagraphAtLine(source, 0)).toEqual({ start: 0, end: 2 });
    expect(findParagraphAtLine(source, 1)).toEqual({ start: 0, end: 2 });
    expect(findParagraphAtLine(source, 2)).toBeNull();
    expect(findParagraphAtLine(source, 3)).toEqual({ start: 3, end: 4 });
  });
});
