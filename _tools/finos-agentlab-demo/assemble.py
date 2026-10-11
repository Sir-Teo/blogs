"""Merge the generators' files into assets/data/finos-agentlab-demo.json.

    python3 -I assemble.py <dir with graph.json runs.json copilot.json specialists.json jobs.json evals.json> out.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(src: str, out: str) -> None:
    folder = Path(src)
    data = {
        name: json.loads((folder / f"{name}.json").read_text())
        for name in ("graph", "runs", "copilot", "specialists", "jobs", "evals")
    }
    text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    Path(out).write_text(text + "\n")
    print(f"{out}: {len(text.encode()):,} bytes")
    runs = data["runs"]["summary"]
    print(f"desk runs {runs['runs']}, decided {runs['decided']} {runs['actions']}, "
          f"parse_action agrees on {runs['parse_agree']}, junk answers {runs['junk_events']}")
    ev = data["evals"]["summary"]
    print(f"evals {ev['scenarios_passed']}/{ev['scenarios']} scenarios, "
          f"{ev['checks_passed']}/{ev['checks']} checks, {len(data['evals']['skipped'])} live-only")
    print("rungs", data["copilot"]["rungs"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
