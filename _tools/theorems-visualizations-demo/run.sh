#!/usr/bin/env bash
# Regenerates assets/js/theorems-visualizations-core.js and
# assets/data/theorems-visualizations-demo.json from the theorems-visualizations
# repository.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export THEOREMS_VIZ="${THEOREMS_VIZ:-$(cd "$here/../../../theorems-visualizations" && pwd)}"
node "$here/build_data.mjs"
