#!/usr/bin/env bash
# Regenerates assets/data/web-katrain-demo.json from web-katrain's own engine code.
# Needs a web-katrain checkout beside this repo (or WEB_KATRAIN=/path) with
# `npm install` and `npm run fetch:model` done. Run from anywhere.
#
#   _tools/web-katrain-demo/run.sh [seed] [visits] [slip]
#
# The post uses seed 2, 200 visits, slip 0.18. Search is not bit-for-bit
# deterministic across machines, so a rerun gives a similar game, not the same one.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export WEB_KATRAIN="${WEB_KATRAIN:-$(cd "$here/../../../web-katrain" && pwd)}"
export NODE_PATH="$WEB_KATRAIN/node_modules"
out="$(mktemp -d)"
build() {
  "$WEB_KATRAIN/node_modules/.bin/esbuild" "$here/$1.ts" --bundle --platform=node --format=cjs \
    '--external:@tensorflow/*' "--define:__dirname=\"$WEB_KATRAIN/test/helpers\"" \
    --outfile="$out/$1.cjs" --log-level=warning
}
build golden
build selfplay
node "$out/golden.cjs" "$out/golden.json"
node "$out/selfplay.cjs" "$out/game.json" "${1:-2}" "${2:-200}" "${3:-0.18}"
node "$here/assemble.mjs" "$out/golden.json" "$out/game.json" "$here/../../assets/data/web-katrain-demo.json"
