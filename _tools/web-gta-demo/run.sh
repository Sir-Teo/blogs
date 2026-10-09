#!/usr/bin/env bash
# Rebuilds assets/js/web-gta-core.js and web-gta-vm.js from web-gta's own
# source. Needs a web-gta checkout beside this repo (or WEB_GTA=/path) and
# esbuild from web-katrain (or ESBUILD=/path). The post has no data file: every
# figure runs these bundles on inputs made up in assets/js/web-gta.js.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
esbuild="${ESBUILD:-$here/../../../web-katrain/node_modules/.bin/esbuild}"
for n in core vm; do
  global=$([ "$n" = core ] && echo WebGtaCore || echo WebGtaVm)
  "$esbuild" "$here/$n.ts" --bundle --format=iife --global-name="$global" --target=es2022 --minify \
    --tsconfig-raw='{}' --outfile="$blog/assets/js/web-gta-$n.js" --log-level=warning
done
