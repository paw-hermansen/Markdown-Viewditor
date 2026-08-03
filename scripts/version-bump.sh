#!/usr/bin/env bash
set -euo pipefail

FILES_ONLY=false
BUMP_TYPE=""

usage() {
  echo "Usage: $0 [--files-only] <patch|minor|major>"
  echo ""
  echo "Bumps the version in package.json, Cargo.toml, and tauri.conf.json"
  echo "and updates CHANGELOG.md."
  echo ""
  echo "Options:"
  echo "  --files-only  Only update files, skip git operations (commit, tag)"
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --files-only)
      FILES_ONLY=true
      ;;
    patch|minor|major)
      BUMP_TYPE="$arg"
      ;;
    *)
      usage
      ;;
  esac
done

if [[ -z "$BUMP_TYPE" ]]; then
  usage
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CURRENT_VERSION=$(node -p "require('$ROOT/package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "Bumping version: $CURRENT_VERSION → $NEW_VERSION"

# Update package.json
node -e "
const fs = require('fs');
const path = '$ROOT/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"
echo "  Updated package.json"

# Update Cargo.toml (only the [package] version, not dependencies)
sed -i "0,/^version = \"$CURRENT_VERSION\"/{s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/}" "$ROOT/src-tauri/Cargo.toml"
echo "  Updated src-tauri/Cargo.toml"

# Update tauri.conf.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
echo "  Updated src-tauri/tauri.conf.json"

# Generate changelog entry
TAG_DATE=$(date +%Y-%m-%d)
CHANGELOG_FILE="$ROOT/CHANGELOG.md"

# Get the previous tag
PREV_TAG=$(git -C "$ROOT" describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -n "$PREV_TAG" ]; then
  LOG_RANGE="${PREV_TAG}..HEAD"
else
  LOG_RANGE="HEAD"
fi

COMMIT_LOG=$(git -C "$ROOT" log "$LOG_RANGE" --pretty=format:"- %s (%h)" --no-merges 2>/dev/null || echo "- Initial release")

# Build the new changelog entry (no trailing newline; echo supplies it)
NEW_ENTRY="## [$NEW_VERSION] - $TAG_DATE

$COMMIT_LOG"

# Create or update CHANGELOG.md
if [ -f "$CHANGELOG_FILE" ]; then
  # Insert new entry before the first release heading ("## [...]"), keeping
  # the title and Keep a Changelog preamble above it verbatim.
  NEW_ENTRY="$NEW_ENTRY" awk '
    !inserted && /^## \[/ {
      print ENVIRON["NEW_ENTRY"]
      print ""
      inserted=1
    }
    { print }
  ' "$CHANGELOG_FILE" > "$CHANGELOG_FILE.tmp"
  mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
else
  {
    echo "# Changelog"
    echo ""
    echo "All notable changes to this project will be documented in this file."
    echo ""
    echo "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)."
    echo ""
    echo "$NEW_ENTRY"
  } > "$CHANGELOG_FILE"
fi
echo "  Updated CHANGELOG.md"

if [ "$FILES_ONLY" = true ]; then
  echo ""
  echo "Done! Updated files for v$NEW_VERSION (git operations skipped)"
  echo "NEW_VERSION=$NEW_VERSION"
  exit 0
fi

# Stage, commit, and tag
git -C "$ROOT" add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
git -C "$ROOT" commit -m "chore: release v$NEW_VERSION"
git -C "$ROOT" tag "v$NEW_VERSION"

echo ""
echo "Done! Released v$NEW_VERSION"
echo "  Commit: $(git -C "$ROOT" rev-parse --short HEAD)"
echo "  Tag:    v$NEW_VERSION"
echo ""
echo "To push:  git push origin main --tags"