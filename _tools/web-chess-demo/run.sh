#!/usr/bin/env bash
# Regenerates the web-chess post's data and core bundle from web-chess's own
# code. Needs a web-chess checkout beside this repo (or WEB_CHESS=/path) with
# `npm install` done. Run from anywhere.
#
#   _tools/web-chess-demo/run.sh [depth] [all-moves depth]
#
# The post uses depth 16 (the app's default review depth) and 14. Single-thread
# fixed-depth search repeats exactly, so a rerun gives the same numbers.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
export WEB_CHESS="${WEB_CHESS:-$(cd "$here/../../../web-chess" && pwd)}"
export NODE_PATH="$WEB_CHESS/node_modules"
esbuild="$WEB_CHESS/node_modules/.bin/esbuild"
out="$(mktemp -d)"
"$esbuild" "$here/core.ts" --bundle --format=iife --global-name=WebChessCore --minify \
  --define:import.meta.env.BASE_URL='"/"' --outfile="$blog/assets/js/web-chess-core.js" --log-level=warning
"$esbuild" "$here/review.ts" --bundle --platform=node --format=esm \
  --define:import.meta.env.BASE_URL='"/"' --outfile="$out/review.mjs" --log-level=warning
node "$out/review.mjs" "$out/review.json" "${1:-16}" "${2:-14}" \
  "$WEB_CHESS/scripts/fixtures/opera-game.pgn" "$here/games/club-vs-intermediate.pgn"
node "$here/assemble.mjs" "$out/review.json" "$blog/assets/data/web-chess-demo.json"
