import { describe, it, expect } from "vitest";
import { escapeHtml, escapeXml } from "../escape";

describe("escapeHtml", () => {
  it("escapes the four HTML metacharacters", () => {
    expect(escapeHtml(`& < > "`)).toBe("&amp; &lt; &gt; &quot;");
  });

  it("leaves apostrophes alone", () => {
    // HTML text and double-quoted attributes have no use for `&apos;`, and
    // emitting it would change every exported document that has one.
    expect(escapeHtml("it's")).toBe("it's");
  });

  it("escapes ampersands before anything else, so entities are not re-escaped", () => {
    // If `&` were replaced after `"` the `&` in `&quot;` would become
    // `&amp;quot;`.
    expect(escapeHtml(`"`)).toBe("&quot;");
    expect(escapeHtml(`&quot;`)).toBe("&amp;quot;");
  });

  it("returns empty string for null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("preserves everything else", () => {
    const s = "plain text — ünïcødé 1 + 2 = 3";
    expect(escapeHtml(s)).toBe(s);
  });
});

describe("escapeXml", () => {
  it("escapes the five XML metacharacters", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });

  it("matches escapeHtml on input without apostrophes", () => {
    for (const s of ["", `& < > "`, "plain", `a & b`, "<tag attr='x'>"]) {
      if (!s.includes("'")) expect(escapeXml(s)).toBe(escapeHtml(s));
    }
  });

  it("does not double-escape the entities it introduces", () => {
    // `&apos;` contains an `&`, which must survive un-re-escaped.
    expect(escapeXml("'")).toBe("&apos;");
    expect(escapeXml("'")).not.toContain("&amp;");
  });

  it("returns empty string for null and undefined", () => {
    expect(escapeXml(null)).toBe("");
    expect(escapeXml(undefined)).toBe("");
  });
});
