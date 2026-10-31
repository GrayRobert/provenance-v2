#!/usr/bin/env bash
# Import chord-explorer from the standalone repo into Provenance frontend.
# Run from frontend root: ./scripts/import-chord-explorer.sh [path-to-chord-explorer-repo]
#
# Default source: ../../chord-explorer (sibling of provenance under personal_projects)

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHORD_EXPLORER_REPO="${1:-$REPO_ROOT/../../chord-explorer}"
DEST_LIB="$REPO_ROOT/lib/chord-explorer"
DEST_PUBLIC="$REPO_ROOT/public"

if [[ ! -d "$CHORD_EXPLORER_REPO/src" ]]; then
  echo "Error: chord-explorer repo not found at $CHORD_EXPLORER_REPO (no src/)."
  echo "Usage: $0 [path-to-chord-explorer-repo]"
  exit 1
fi

echo "Importing chord-explorer from $CHORD_EXPLORER_REPO"
echo "  -> $DEST_LIB"
echo "  -> $DEST_PUBLIC (asset folders)"
echo ""

rm -rf "$DEST_LIB"
mkdir -p "$DEST_LIB"
cp -R "$CHORD_EXPLORER_REPO/src/"* "$DEST_LIB/"
echo "  Copied src/ -> lib/chord-explorer"

# Copy entire public dir (instruments + metronome samples) so they are reachable at /felt-piano/, /rhodes/, etc.
if [[ -d "$CHORD_EXPLORER_REPO/public" ]]; then
  mkdir -p "$DEST_PUBLIC"
  for item in "$CHORD_EXPLORER_REPO/public/"*; do
    [[ -e "$item" ]] || continue
    name="$(basename "$item")"
    rm -rf "$DEST_PUBLIC/$name"
    cp -R "$item" "$DEST_PUBLIC/$name"
    echo "  Copied public/$name"
  done
else
  echo "  Warning: chord-explorer public/ not found at $CHORD_EXPLORER_REPO/public (instrument/metronome samples will be missing)"
fi

echo ""
echo "Done. Ensure dependencies: npm i tone tonal driver.js"
