import { describe, it, expect } from "vitest";
import { addImageTitles } from "../image-title";

describe("addImageTitles", () => {
  it("mirrors a double-quoted alt into title", () => {
    const out = addImageTitles('<img src="a.png" alt="a flower">');
    expect(out).toBe('<img src="a.png" alt="a flower" title="a flower">');
  });

  it("mirrors a single-quoted alt into title", () => {
    const out = addImageTitles("<img src='a.png' alt='a flower'>");
    expect(out).toBe("<img src='a.png' alt='a flower' title='a flower'>");
  });

  it("mirrors a bare (unquoted) alt into a double-quoted title", () => {
    const out = addImageTitles("<img src=a.png alt=flower>");
    expect(out).toBe('<img src=a.png alt=flower title="flower">');
  });

  it("keeps a single-quoted alt's double quotes intact by reusing the quoting style", () => {
    const out = addImageTitles(`<img src="a.png" alt='say "hi"'>`);
    expect(out).toBe(`<img src="a.png" alt='say "hi"' title='say "hi"'>`);
  });

  it("copies already-escaped entities verbatim without double-escaping", () => {
    const out = addImageTitles(
      '<img src="a.png" alt="a &quot;nice&quot; flower">',
    );
    expect(out).toBe(
      '<img src="a.png" alt="a &quot;nice&quot; flower" title="a &quot;nice&quot; flower">',
    );
  });

  it("preserves an existing title attribute", () => {
    const out = addImageTitles(
      '<img src="a.png" alt="a flower" title="the title">',
    );
    expect(out).toBe('<img src="a.png" alt="a flower" title="the title">');
  });

  it("does not mistake data-title for a title attribute", () => {
    const out = addImageTitles(
      '<img src="a.png" alt="a flower" data-title="x">',
    );
    expect(out).toBe(
      '<img src="a.png" alt="a flower" title="a flower" data-title="x">',
    );
  });

  it("skips images with empty or whitespace-only alt", () => {
    const out = addImageTitles(
      '<img src="a.png" alt=""><img src="b.png" alt="   "><img src="c.png">',
    );
    expect(out).toBe(
      '<img src="a.png" alt=""><img src="b.png" alt="   "><img src="c.png">',
    );
  });

  it("handles '>' inside quoted attribute values without truncating the tag", () => {
    const out = addImageTitles(
      '<img src="a.png" alt="a > b" data-note="x > y">',
    );
    expect(out).toBe(
      '<img src="a.png" alt="a > b" title="a > b" data-note="x > y">',
    );
  });

  it("titles every image in a multi-image document", () => {
    const out = addImageTitles(
      '<img src="a.png" alt="one"><img src="b.png" alt="two">',
    );
    expect(out).toBe(
      '<img src="a.png" alt="one" title="one"><img src="b.png" alt="two" title="two">',
    );
  });

  it("returns markup without images unchanged", () => {
    const html = "<p>no images here</p>";
    expect(addImageTitles(html)).toBe(html);
  });
});
