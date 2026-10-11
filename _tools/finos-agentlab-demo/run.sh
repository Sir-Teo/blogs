#!/usr/bin/env bash
# Regenerates the FinOS-AgentLab post's data from the project's own code.
# Needs a FinOS-AgentLab checkout beside this repo (or FINOS=/path) with its
# three venvs synced (`make install`, and `uv sync --frozen --extra dev` in
# agents-runtime). Nothing here calls a model or the network: the scripted
# eval suite refuses outbound connections itself.
#
#   _tools/finos-agentlab-demo/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
blog="$here/../.."
export FINOS="${FINOS:-$(cd "$here/../../../FinOS-AgentLab" && pwd)}"
backend="$FINOS/backend"
py="$backend/.venv/bin/python"
out="$(mktemp -d)"
echo "FinOS-AgentLab at $FINOS ($(git -C "$FINOS" rev-parse --short HEAD))"

( cd "$out" && OPENAI_API_KEY=sk-offline "$FINOS/agents-runtime/.venv/bin/python" "$here/graph.py" "$out/graph.json" )
python3 -I "$here/runs.py" "$FINOS" "$out/runs.json"
( cd "$backend" && PYTHONPATH="$backend" DATABASE_URL="sqlite:///$out/scratch.db" "$py" "$here/copilot_measure.py" "$out/copilot.json" )
( cd "$backend" && PYTHONPATH="$backend" DATABASE_URL="sqlite:///$out/scratch.db" "$py" "$here/specialists.py" "$out/specialists.json" )
( cd "$backend" && PYTHONPATH="$backend" DATABASE_URL="sqlite:///$out/scratch.db" "$py" "$here/jobs_sim.py" "$out/jobs.json" 2>/dev/null )
( cd "$backend" && DATABASE_URL="sqlite:///$out/evals.db" "$py" -m evals --suite core --scripted --json "$out/evals-raw.json" | tail -4 )
( cd "$backend" && PYTHONPATH="$backend" DATABASE_URL="sqlite:///$out/scratch.db" "$py" "$here/evals_trim.py" "$out/evals-raw.json" "$out/evals.json" )
python3 -I "$here/assemble.py" "$out" "$blog/assets/data/finos-agentlab-demo.json"
