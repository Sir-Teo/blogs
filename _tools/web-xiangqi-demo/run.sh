#!/usr/bin/env bash
# Regenerates the web-xiangqi post's data and core bundle from web-xiangqi's
# own code and its shipped Pikafish build. Needs a web-xiangqi checkout beside
# this repo (or WEB_XIANGQI=/path) with `npm install` done, and esbuild from
# web-katrain (or ESBUILD=/path). Run from anywhere.
#
#   _tools/web-xiangqi-demo/run.sh [red level] [black level] [seed] [review depth]
#
# The post uses Easy (2) against Medium (3), seed 3, depth 16. Every search is
# single-threaded at a fixed depth, so a rerun gives the same game and numbers.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
export WEB_XIANGQI="${WEB_XIANGQI:-$(cd "$here/../../../web-xiangqi" && pwd)}"
export XQ_DEMO="$here"
esbuild="${ESBUILD:-$here/../../../web-katrain/node_modules/.bin/esbuild}"
out="$(mktemp -d)"
# The Pikafish loader copies the engine into TMPDIR as .cjs files.
export TMPDIR="$out"
"$esbuild" "$here/core.ts" --bundle --format=iife --global-name=WebXiangqiCore --minify \
  --outfile="$blog/assets/js/web-xiangqi-core.js" --log-level=warning
node "$here/perft.mjs" "$blog/assets/js/web-xiangqi-core.js"
"$esbuild" "$here/game.ts" --bundle --platform=node --format=esm --outfile="$out/game.mjs" --log-level=warning
node "$out/game.mjs" "$out/game.json" "${1:-2}" "${2:-3}" "${3:-3}" "${4:-16}"
node "$here/clock.cjs" "$out/clock-mate.json" "3k5/9/9/9/9/9/9/2N6/4A4/3AK4 w - - CLOCK 30" 14
node "$here/clock.cjs" "$out/clock-won.json" "4k4/4a4/4ba3/9/9/9/9/9/4A4/3AK1R2 w - - CLOCK 30" 14
node "$here/repetition.cjs" "$out/repetition.json"
node "$here/assemble.mjs" "$out/game.json" "$out/clock-mate.json" "$out/clock-won.json" "$out/repetition.json" \
  "$blog/assets/data/web-xiangqi-demo.json"
