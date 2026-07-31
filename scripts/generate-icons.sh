#!/usr/bin/env bash
#
# generate-icons.sh — Build all Tauri app icons from the SVG source.
#
# WHY per-size SVGs?
#   The source SVG uses absolute pixel width (8px on 1024px) for the cursor
#   beam. If we just scaled the 1024px SVG, the 8px beam at 16px output would
#   be 0.125px — invisible. We generate a tailored SVG for each target size
#   where the beam width is scaled proportionally but clamped to a minimum of
#   2px so it remains visible at every size.
#
#   Size -> proportional beam width -> clamped
#     1024 -> 8.0px -> 8px
#      512 -> 4.0px -> 4px
#      256 -> 2.0px -> 2px
#      128 -> 1.0px -> 2px  (clamped)
#       64 -> 0.5px -> 2px  (clamped)
#       48 -> 0.4px -> 2px  (clamped)
#       32 -> 0.25px -> 2px (clamped)
#       20 -> 0.16px -> 2px (clamped)
#       16 -> 0.125px -> 2px(clamped)
#
# Requirements: inkscape, imagemagick (convert)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ICONS_DIR="$ROOT_DIR/src-tauri/icons"

# ── Source SVG parameters (from icon-source.svg) ──────────────────────
BEAM_X=460
BEAM_Y=154
BEAM_W=8
BEAM_H=717
BEAM_RX=4
GLOW_STD=18
BG_RX=220

generate_svg() {
  local size="$1"
  local beam_w beam_x beam_y beam_h beam_rx glow_std bg_rx

  beam_w=$(awk "BEGIN { w = $BEAM_W * $size / 1024; printf \"%.1f\", (w < 2 ? 2 : w) }")
  beam_x=$(awk "BEGIN { printf \"%.1f\", $BEAM_X * $size / 1024 }")
  beam_y=$(awk "BEGIN { printf \"%.1f\", $BEAM_Y * $size / 1024 }")
  beam_h=$(awk "BEGIN { printf \"%.1f\", $BEAM_H * $size / 1024 }")
  beam_rx=$(awk "BEGIN { r = $BEAM_RX * $size / 1024; printf \"%.1f\", (r < 0.5 ? 0.5 : r) }")
  glow_std=$(awk "BEGIN { printf \"%.1f\", $GLOW_STD * $size / 1024 }")
  bg_rx=$(awk "BEGIN { printf \"%.1f\", $BG_RX * $size / 1024 }")

  cat <<SVGEOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $size $size" width="$size" height="$size">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="$glow_std" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="$size" height="$size" rx="$bg_rx" fill="url(#bg)"/>
  <rect x="$beam_x" y="$beam_y" width="$beam_w" height="$beam_h" rx="$beam_rx" fill="#e94560" filter="url(#glow)"/>
  <rect x="$beam_x" y="$beam_y" width="$beam_w" height="$beam_h" rx="$beam_rx" fill="#e94560"/>
</svg>
SVGEOF
}

render_svg_to_png() {
  local size="$1" out="$2"
  local tmp_svg
  tmp_svg=$(mktemp /tmp/icon-gen-XXXXXX.svg)
  generate_svg "$size" > "$tmp_svg"
  inkscape "$tmp_svg" \
    --export-type=png \
    --export-width="$size" \
    --export-height="$size" \
    -o "$out" \
    >/dev/null 2>&1
  rm -f "$tmp_svg"
}

# ── Desktop PNGs ──────────────────────────────────────────────────────
echo "=== Generating icons ==="
echo "Desktop PNGs..."
for size in 32 48 64 128 256 512; do
  out="$ICONS_DIR/icon_${size}.png"
  echo "  icon_${size}.png"
  render_svg_to_png "$size" "$out"
done

echo "  icon_1024.png (master)"
render_svg_to_png 1024 "$ICONS_DIR/icon_1024.png"

# ── ICO (Windows) — 16, 32, 48, 256 in one file ─────────────────────
echo "icon.ico (Windows)..."
tmp_ico_dir=$(mktemp -d /tmp/ico-XXXXXX)
for size in 16 32 48 256; do
  render_svg_to_png "$size" "$tmp_ico_dir/icon_${size}.png"
done
convert "$tmp_ico_dir"/icon_*.png "$ICONS_DIR/icon.ico"
rm -rf "$tmp_ico_dir"

# ── macOS iconset ─────────────────────────────────────────────────────
echo "macOS iconset..."
ICONSET="$ICONS_DIR/icon.iconset"
mkdir -p "$ICONSET"

declare -A ICONSET_MAP=(
  ["icon_16x16.png"]=16
  ["icon_16x16@2x.png"]=32
  ["icon_32x32.png"]=32
  ["icon_32x32@2x.png"]=64
  ["icon_128x128.png"]=128
  ["icon_128x128@2x.png"]=256
  ["icon_256x256.png"]=256
  ["icon_256x256@2x.png"]=512
  ["icon_512x512.png"]=512
  ["icon_512x512@2x.png"]=1024
)

for fname in $(echo "${!ICONSET_MAP[@]}" | tr ' ' '\n' | sort); do
  size="${ICONSET_MAP[$fname]}"
  echo "  icon.iconset/$fname (${size}x${size})"
  render_svg_to_png "$size" "$ICONSET/$fname"
done

if command -v iconutil &>/dev/null; then
  echo "  icon.icns (via iconutil)"
  iconutil -c icns "$ICONSET" -o "$ICONS_DIR/icon.icns"
else
  echo "  icon.icns (via Pillow)"
  python3 -c "
from PIL import Image
import os, glob
iconset = '$ICONSET'
imgs = []
for f in sorted(glob.glob(os.path.join(iconset, 'icon_*.png'))):
    imgs.append(Image.open(f))
if imgs:
    imgs[0].save('$ICONS_DIR/icon.icns', format='ICNS', append_images=imgs[1:])
" || echo "  [WARN] ICNS generation failed — install python3-pillow or build on macOS"
fi

# ── Android icons ─────────────────────────────────────────────────────
echo "Android icons..."
declare -A ANDROID_MAP=(
  ["mipmap-mdpi"]=48
  ["mipmap-hdpi"]=72
  ["mipmap-xhdpi"]=96
  ["mipmap-xxhdpi"]=144
  ["mipmap-xxxhdpi"]=192
)

for dir in $(echo "${!ANDROID_MAP[@]}" | tr ' ' '\n' | sort); do
  size="${ANDROID_MAP[$dir]}"
  out_dir="$ICONS_DIR/android/$dir"
  mkdir -p "$out_dir"
  echo "  $dir/ (${size}x${size})"
  render_svg_to_png "$size" "$out_dir/ic_launcher.png"
  cp "$out_dir/ic_launcher.png" "$out_dir/ic_launcher_round.png"
done

# ── iOS icons ─────────────────────────────────────────────────────────
echo "iOS icons..."
IOS_DIR="$ICONS_DIR/ios"
mkdir -p "$IOS_DIR"

declare -A IOS_MAP=(
  ["AppIcon-20.png"]=20
  ["AppIcon-20@2x.png"]=40
  ["AppIcon-20@3x.png"]=60
  ["AppIcon-29.png"]=29
  ["AppIcon-29@2x.png"]=58
  ["AppIcon-29@3x.png"]=87
  ["AppIcon-40.png"]=40
  ["AppIcon-40@2x.png"]=80
  ["AppIcon-40@3x.png"]=120
  ["AppIcon-60@2x.png"]=120
  ["AppIcon-60@3x.png"]=180
  ["AppIcon-76.png"]=76
  ["AppIcon-76@2x.png"]=152
  ["AppIcon-83.5@2x.png"]=167
  ["AppIcon-1024.png"]=1024
)

for fname in $(echo "${!IOS_MAP[@]}" | tr ' ' '\n' | sort); do
  size="${IOS_MAP[$fname]}"
  echo "  $fname (${size}x${size})"
  render_svg_to_png "$size" "$IOS_DIR/$fname"
done

# ── Summary ───────────────────────────────────────────────────────────
echo ""
echo "=== Done! ==="
echo "Generated:"
echo "  - Desktop PNGs:  icon_{32,48,64,128,256,512}.png"
echo "  - Windows ICO:   icon.ico"
echo "  - macOS ICNS:    icon.icns + icon.iconset/"
echo "  - Android:       android/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/"
echo "  - iOS:           ios/AppIcon-*.png (15 sizes)"
echo ""
echo "Beam width clamping (min 2px):"
echo "  1024px -> 8.0px | 512px -> 4.0px | 256px -> 2.0px"
echo "   128px -> 2.0px |  64px -> 2.0px |  32px -> 2.0px"
echo "    16px -> 2.0px"
