#!/usr/bin/env bash
# Regenerate the woff2-only KaTeX stylesheet and copy the matching woff2
# fonts into src/lib/styles/katex/. Run after upgrading the `katex` npm
# package. See PLAN-MATH-SUPPORT.md (Part A) for the rationale: woff2-only
# avoids shipping ~800 KB of woff/ttf fonts that no modern webview needs.
#
# Usage:
#   scripts/update-katex-css.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_CSS="$REPO_ROOT/node_modules/katex/dist/katex.min.css"
SRC_FONTS_DIR="$REPO_ROOT/node_modules/katex/dist/fonts"
OUT_DIR="$REPO_ROOT/src/lib/styles/katex"
OUT_CSS="$OUT_DIR/katex.woff2.css"
OUT_FONTS_DIR="$OUT_DIR/fonts"

if [[ ! -f "$SRC_CSS" ]]; then
  echo "error: $SRC_CSS not found. Run 'npm install katex' first." >&2
  exit 1
fi

mkdir -p "$OUT_FONTS_DIR"

# Strip the `,url(fonts/X.woff) format("woff"),url(fonts/X.ttf) format("truetype")"
# tail from every @font-face src declaration, leaving only the woff2 entry.
# Works on the minified single-line form shipped by katex.
node -e '
const fs = require("fs");
const src = fs.readFileSync(process.argv[1], "utf8");
const stripped = src.replace(
  /,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
  ""
);
if (stripped === src) {
  console.error("warning: no woff/ttf entries removed — katex.min.css format changed?");
}
fs.writeFileSync(process.argv[2], stripped);
' "$SRC_CSS" "$OUT_CSS"

# Replace any woff2 fonts that changed. rm first so obsolete font files (e.g.
# from a KaTeX downgrade that dropped a face) do not linger.
rm -f "$OUT_FONTS_DIR"/*.woff2
cp "$SRC_FONTS_DIR"/*.woff2 "$OUT_FONTS_DIR"/

echo "Wrote $OUT_CSS"
echo "Copied $(ls "$OUT_FONTS_DIR"/*.woff2 | wc -l) woff2 fonts to $OUT_FONTS_DIR"
