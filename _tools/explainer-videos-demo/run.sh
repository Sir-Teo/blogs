#!/usr/bin/env bash
# Regenerates assets/data/explainer-videos-demo.json, explainer-barcodes.webp,
# and explainer-frames.webp from the explainer-videos repository.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
export EXPLAINER_VIDEOS="${EXPLAINER_VIDEOS:-$(cd "$here/../../../explainer-videos" && pwd)}"
"$EXPLAINER_VIDEOS/.venv/bin/python" "$here/build_data.py" "$blog/assets/data"
