#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  osascript -e 'display alert "Music Cue requires macOS" message "Apple Music control only works on Mac."' || true
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Node.js required" message "Install Node.js from https://nodejs.org, then double-click Start Music Cue again."' || true
  exit 1
fi

echo "Installing dependencies (first launch only)..."
npm install

echo "Building Music Cue..."
npm run build

echo "Starting Music Cue..."
NODE_ENV=production npm start &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

sleep 1
open "http://localhost:3847"

echo "Music Cue is running at http://localhost:3847"
echo "Leave this window open while you use the app. Press Ctrl+C to quit."
wait "$SERVER_PID"
