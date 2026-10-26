import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import {
  injectDataLine,
  tagOpeningTag,
  withDataLine,
} from "$lib/utils/data-line";

describe("injectDataLine", () => {
  it("tags the first opening tag, right after the tag name", () => {
    expect(injectDataLine('<p class="x">hi</p>', 3)).toBe(
      '<p data-line="3" class="x">hi</p>',
    );
  });

  it("preserves leading whitespace (fence-plugin pin shape)", () => {
    expect(injectDataLine("\n  <my-diagram>rendered</my-diagram>", 1)).toBe(
      '\n  <my-diagram data-line="1">rendered</my-diagram>',
    );
  });

  it("is idempotent: an already-tagged first tag is returned unchanged", () => {
    const tagged = '\n  <my-diagram data-line="existing">rendered</my-diagram>';
    expect(injectDataLine(tagged, 1)).toBe(tagged);
    expect((injectDataLine(tagged, 1).match(/data-line=/g) ?? []).length).toBe(
      1,
    );
  });

  it("skips leading comments and tags the first real tag", () => {
    expect(injectDataLine("<!-- note --><div>hi</div>", 2)).toBe(
      '<!-- note --><div data-line="2">hi</div>',
    );
  });

  it("wraps tag-less content in a data-line div so the anchor is never lost", () => {
    expect(injectDataLine("plain text", 4)).toBe(
      '<div data-line="4">plain text</div>',
    );
  });
});

describe("tagOpeningTag", () => {
  const FOOTNOTES =
    '<hr class="footnotes-sep">\n<section class="footnotes">\n<ol class="footnotes-list">\n';

  it("appends data-line before the targeted tag's '>' (markdown.test pin)", () => {
    const out = tagOpeningTag(FOOTNOTES, '<section class="footnotes">', 5);
    expect(out).toMatch(/<section class="footnotes" data-line="5">/);
    expect(out).not.toMatch(/<hr[^>]*data-line/);
    expect(out).not.toMatch(/<ol[^>]*data-line/);
  });

  it("returns html unchanged when the literal is absent", () => {
    expect(tagOpeningTag("<p>hi</p>", '<section class="footnotes">', 5)).toBe(
      "<p>hi</p>",
    );
  });

  it("is idempotent: a tagged tag no longer matches the literal", () => {
    const once = tagOpeningTag(FOOTNOTES, '<section class="footnotes">', 5);
    const twice = tagOpeningTag(once, '<section class="footnotes">', 5);
    expect(twice).toBe(once);
    expect((twice.match(/data-line=/g) ?? []).length).toBe(1);
  });
});

describe("withDataLine", () => {
  it("attr strategy: tags renderToken-based rules via the token", () => {
    const md = new MarkdownIt();
    withDataLine(md, "paragraph_open");
    expect(md.render("hello\n")).toBe('<p data-line="1">hello</p>\n');
  });

  it("first-tag strategy: tags the fence's <pre>", () => {
    const md = new MarkdownIt();
    withDataLine(md, "fence", { strategy: "first-tag" });
    expect(md.render("```\ncode\n```\n")).toContain('<pre data-line="1">');
  });

  it("wrap strategy: wraps raw html blocks", () => {
    const md = new MarkdownIt({ html: true });
    withDataLine(md, "html_block", { strategy: "wrap" });
    expect(md.render("<details>\nfoo\n</details>\n")).toContain(
      '<div data-line="1">',
    );
  });

  it("openingTag strategy: tags the targeted tag (not the first) via the fallback", () => {
    type RuleFn = NonNullable<MarkdownIt["renderer"]["rules"][string]>;
    const md = new MarkdownIt(); // no footnote plugin: the rule is undefined
    withDataLine(md, "footnote_block_open", {
      strategy: { openingTag: '<section class="footnotes">' },
      fallback: (_tokens, _idx, options) =>
        (options.xhtmlOut
          ? '<hr class="footnotes-sep" />\n'
          : '<hr class="footnotes-sep">\n') +
        '<section class="footnotes">\n<ol class="footnotes-list">\n',
    });

    const rule = md.renderer.rules.footnote_block_open as RuleFn;
    const tokens = [{ map: [4, 5] }] as unknown as Parameters<RuleFn>[0];
    const html = rule(
      tokens,
      0,
      { xhtmlOut: false } as Parameters<RuleFn>[2],
      {} as Parameters<RuleFn>[3],
      md.renderer,
    );

    expect(html).toMatch(/<section class="footnotes" data-line="5">/);
    expect(html).not.toMatch(/<hr[^>]*data-line/);
    expect(html).not.toMatch(/<ol[^>]*data-line/);
  });

  it("keeps exactly one data-line through any fence wrapper nesting order", () => {
    // The fence stack has several wrappers that may tag (line-numbers,
    // extension fences, math anchors). Whichever order they install in,
    // exactly one may win: every tagging path is idempotent, so the others
    // no-op on the first one's tag.
    const outer = (md: MarkdownIt): void => {
      const prev = md.renderer.rules.fence;
      if (!prev) return;
      md.renderer.rules.fence = (tokens, idx, options, env, self) =>
        injectDataLine(
          prev(tokens, idx, options, env, self),
          (tokens[idx].map?.[0] ?? 0) + 1,
        );
    };

    const innerFirst = new MarkdownIt();
    withDataLine(innerFirst, "fence", { strategy: "first-tag" });
    outer(innerFirst);

    const outerFirst = new MarkdownIt();
    outer(outerFirst);
    withDataLine(outerFirst, "fence", { strategy: "first-tag" });

    for (const md of [innerFirst, outerFirst]) {
      const html = md.render("```\ncode\n```\n");
      expect((html.match(/data-line="/g) ?? []).length).toBe(1);
    }
  });
});
