/**
 * Upgrade contract: pins the KaTeX internals that the `.vlist-s` anchor fix
 * (`extensions/katex/styles.ts`, 2px pin) relies on.
 *
 * The other tests verify our injected rules against themselves; these verify
 * that the *library* still builds the anchor structure and ships the CSS rule
 * we override. If a KaTeX upgrade fails one of these, the pin is stale —
 * re-verify it before touching the fix (KaTeX 0.18 renames CSS classes
 * outright, see its changelog "prefix css classes"). Re-render the S15e
 * regression formulas on a real engine afterwards (manual test plan).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import katex from "katex";

// The generated artifact on disk (rebuilt by scripts/update-katex-css.sh on
// KaTeX upgrades) — read it directly so the contract checks the shipped file.
const katexCss = readFileSync(
  fileURLToPath(
    new URL("../../../styles/katex/katex.woff2.css", import.meta.url),
  ),
  "utf8",
);

/** The S15e regression formulas: relations/delimiters vs vlist rows. */
const MATRICES = String.raw`\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}`;

const CASES = String.raw`f(x) = \begin{cases}
1 & \text{if } x > 0 \\
0 & \text{if } x \leq 0
\end{cases}`;

describe("katex upgrade contract (real output)", () => {
  it("bundled stylesheet still defines the vlist-s anchor at font-size: 1px", () => {
    expect(
      /\.katex \.vlist-s\s*\{[^}]*font-size:\s*1px/.test(katexCss),
      "KaTeX's generated CSS no longer pins .vlist-s at font-size: 1px — the " +
        "2px override in extensions/katex/styles.ts has lost its target; " +
        "re-verify the WebKit zoom fix (AGENTS.md 'Math (KaTeX) Integration')",
    ).toBe(true);
  });

  for (const [name, tex] of [
    ["matrices", MATRICES],
    ["cases", CASES],
  ] as const) {
    it(`rendered ${name} formula still contains the vlist-s anchor`, () => {
      const html = katex.renderToString(tex, {
        displayMode: true,
        throwOnError: true,
      });
      expect(
        html,
        `${name}: KaTeX no longer emits .vlist-s inside .vlist-t — the anchor ` +
          "fix targets a structure that has changed; re-verify the pin and the " +
          "S15e zoom checks",
      ).toContain("vlist-s");
      expect(html).toContain("vlist-t");
    });
  }
});
