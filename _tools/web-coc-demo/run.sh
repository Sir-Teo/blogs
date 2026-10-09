#!/usr/bin/env bash
# Regenerates assets/data/web-coc-demo.json from Crown & Clan's own simulation.
# Needs a web-coc checkout beside this repo (or WEB_COC=/path) with `npm ci`
# done, and esbuild from web-katrain (or ESBUILD=/path). Run from anywhere.
#
# Every battle is stepped at a fixed 0.05 s with no randomness but the player's
# input, so a rerun writes the same file.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
esbuild="${ESBUILD:-$here/../../../web-katrain/node_modules/.bin/esbuild}"
out="$(mktemp -d)"
"$esbuild" "$here/raids.ts" --bundle --platform=node --format=esm --outfile="$out/raids.mjs" --log-level=warning
node "$out/raids.mjs" "$blog/assets/data/web-coc-demo.json"
