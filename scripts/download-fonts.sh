#!/usr/bin/env bash
# Download bundled UI fonts (Inter + JetBrains Mono) woff2 files and their
# OFL-1.1 license texts. Run this script when upgrading fonts; the fetched
# files are committed to the repo so builds are self-contained.
#
# Pinned versions — update these when upgrading:
#   Inter       v4.1   https://github.com/rsms/inter/releases/tag/v4.1
#   JetBrains Mono  v2.304 https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO_ROOT/src/lib/styles/fonts"
mkdir -p "$OUT_DIR"

# --- Inter (v4.1) -----------------------------------------------------------
INTER_TAG="v4.1"
INTER_BASE="https://raw.githubusercontent.com/rsms/inter/${INTER_TAG}/docs/font-files"

for weight in Regular SemiBold Bold; do
  curl -fsSL "${INTER_BASE}/Inter-${weight}.woff2" -o "${OUT_DIR}/Inter-${weight}.woff2"
  echo "  fetched Inter-${weight}.woff2"
done

# OFL-1.1 license text (required by the license to accompany the font files)
curl -fsSL "https://raw.githubusercontent.com/rsms/inter/${INTER_TAG}/LICENSE.txt" -o "${OUT_DIR}/OFL-Inter.txt"
echo "  fetched OFL-Inter.txt"

# --- JetBrains Mono (v2.304) -------------------------------------------------
JB_TAG="v2.304"
JB_BASE="https://raw.githubusercontent.com/JetBrains/JetBrainsMono/${JB_TAG}"

curl -fsSL "${JB_BASE}/fonts/webfonts/JetBrainsMono-Regular.woff2" -o "${OUT_DIR}/JetBrainsMono-Regular.woff2"
echo "  fetched JetBrainsMono-Regular.woff2"

curl -fsSL "${JB_BASE}/OFL.txt" -o "${OUT_DIR}/OFL-JetBrainsMono.txt"
echo "  fetched OFL-JetBrainsMono.txt"

echo
echo "Done — all fonts and licenses written to ${OUT_DIR}"
