#!/bin/bash
# Generate macOS .icns file from iconset directory
# Run this script on macOS before building

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONSET="$SCRIPT_DIR/src-tauri/icons/icon.iconset"
ICNS="$SCRIPT_DIR/src-tauri/icons/icon.icns"

if [ ! -d "$ICONSET" ]; then
    echo "Error: iconset directory not found at $ICONSET"
    echo "Run the icon generation script first."
    exit 1
fi

if ! command -v iconutil &> /dev/null; then
    echo "Error: iconutil not found. This script must be run on macOS."
    exit 1
fi

echo "Generating $ICNS from $ICONSET..."
iconutil -c icns "$ICONSET" -o "$ICNS"
echo "Done. Generated: $ICNS"
