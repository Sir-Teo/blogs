"""The desk runs recorded in FinOS-AgentLab's committed static export.

`deploy/static/site/__snapshot` holds every API answer one workspace gave on
2026-09-08, filed under the request key the app's own client computes
(fnv1a32 of the path names the index file). This reads the run list and each
run's transcript, keeps the shape of every event (agent, stage, byte count)
and the error messages, and drops the prose. The runner's own `parse_action`
and `_unusable_answer` are run over the recorded text, so the figure can say
which recorded answers the current desk would redraw; the two it flags are a
safety classifier's labels, not prose, and are kept verbatim.

    python3 -I runs.py /path/to/FinOS-AgentLab out.json
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

# TradingAgents files each debate turn into the transcript as "\nBull Analyst: …",
# "\nRisky Analyst: …"; the runner's guard sees the model's reply before that
# label is added, so the label comes off before the guard reads it.
SPEAKER = re.compile(r"^\s*[A-Z][A-Za-z]+ (?:Analyst|Researcher|Manager|Judge|Trader):\s*")


def fnv1a32(text: str) -> str:
    h = 0x811C9DC5
    for byte in text.encode():
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def load_runner(repo: Path):
    spec = importlib.util.spec_from_file_location("runner", repo / "agents-runtime" / "runner.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def recorded(root: Path, path: str) -> dict | None:
    index = root / "idx" / f"{fnv1a32(path)}.json"
    if not index.exists():
        return None
    entries = json.loads(index.read_text())
    key = f"GET\x1f{path}\x1f\x1f\x1f"
    entry = entries.get(key) or next(iter(entries.values()))
    return json.loads((root / entry["f"]).read_text())["body"]


def main(repo: str, out: str) -> None:
    repo_path = Path(repo)
    root = repo_path / "deploy" / "static" / "site" / "__snapshot"
    runner = load_runner(repo_path)
    runs = []
    for row in recorded(root, "/api/agents/runs") or []:
        detail = recorded(root, f"/api/agents/runs/{row['id']}") or {}
        events = []
        for event in detail.get("events") or []:
            kind = event.get("type")
            if kind in ("report", "debate"):
                content = event.get("content") or ""
                said = SPEAKER.sub("", content, count=1)
                junk = bool(runner._unusable_answer(said))
                events.append({
                    "k": kind,
                    "a": event.get("agent"),
                    "g": event.get("stage") or event.get("group"),
                    "b": len(content.encode()),
                    "junk": junk,
                })
                if junk:
                    # A classifier's label, not an agent's prose: the one
                    # recorded text the figure shows.
                    events[-1]["said"] = said.strip()
            elif kind == "decision":
                content = event.get("content") or ""
                events.append({
                    "k": "decision",
                    "a": "Decision",
                    "b": len(content.encode()),
                    "parsed": runner.parse_action(content),
                })
            elif kind == "error":
                events.append({"k": "error", "msg": (event.get("message") or "")[:160]})
        runs.append({
            "id": row["id"][:6],
            "symbol": row["symbol"],
            "date": row["date"],
            "created": row.get("created_at"),
            "analysts": row.get("analysts") or [],
            "action": detail.get("action"),
            "events": events,
        })
    runs.sort(key=lambda r: r["created"] or "")
    decided = [r for r in runs if r["action"]]
    agree = sum(
        1 for r in decided
        for e in r["events"] if e["k"] == "decision" and e["parsed"] == r["action"]
    )
    summary = {
        "runs": len(runs),
        "decided": len(decided),
        "actions": {a: sum(1 for r in decided if r["action"] == a) for a in ("BUY", "HOLD", "SELL")},
        "parse_agree": agree,
        "junk_events": sum(1 for r in runs for e in r["events"] if e.get("junk")),
        "largest_event": max((e["b"] for r in runs for e in r["events"] if "b" in e), default=0),
        "recorded_on": "2026-09-08",
    }
    with open(out, "w") as fh:
        json.dump({"summary": summary, "runs": runs}, fh, indent=0)
    print(json.dumps(summary))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
