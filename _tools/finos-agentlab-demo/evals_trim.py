"""Trim a `python -m evals --json` run to what the figure draws.

Run from FinOS-AgentLab/backend with its venv, after the scripted suite:

    .venv/bin/python -m evals --suite core --scripted --json raw.json
    .venv/bin/python evals_trim.py raw.json out.json

Keeps each scenario's id, what it guards, its checks and which passed, the
tools it called, rounds, tokens and seconds; and lists the core scenarios a
scripted run has to skip, with their reasons.
"""

from __future__ import annotations

import json
import sys
import warnings

warnings.simplefilter("ignore")

from evals.scenarios import SUITES  # noqa: E402


def main(raw: str, out: str) -> None:
    data = json.load(open(raw))
    ran = {r["id"] for r in data["results"]}
    results = []
    for r in data["results"]:
        failed = {f["name"] if isinstance(f, dict) else str(f) for f in r.get("failures") or []}
        checks = [[c if isinstance(c, str) else c.get("name"), (c if isinstance(c, str) else c.get("name")) not in failed]
                  for c in r.get("checks") or []]
        results.append({
            "id": r["id"],
            "ok": bool(r["ok"]),
            "mode": r.get("mode"),
            "prompt": (r.get("prompt") or "")[:140],
            "guards": (r.get("guards") or "")[:260],
            "checks": checks,
            "tools": r.get("tools") or [],
            "calls": len(r.get("calls") or []),
            "rounds": r.get("rounds"),
            "tokens": r.get("tokens"),
            "seconds": r.get("seconds"),
            "answer_chars": r.get("answer_chars"),
        })
    skipped = [
        {"id": s.id, "guards": (s.guards or "")[:200]}
        for s in SUITES["core"] if s.id not in ran
    ]
    summary = data["summary"]
    with open(out, "w") as fh:
        json.dump({
            "summary": {
                "scenarios": summary["scenarios"],
                "scenarios_passed": summary["scenarios_passed"],
                "checks": summary["checks"],
                "checks_passed": summary["checks_passed"],
                "seconds": summary["seconds"],
                "tokens": summary["tokens"],
                "commit": (summary.get("run") or {}).get("commit"),
                "finished": (summary.get("run") or {}).get("finished"),
                "check_kinds": list((summary.get("by_check") or {}).keys()),
            },
            "results": results,
            "skipped": skipped,
        }, fh, indent=0)
    print(f"{len(results)} ran, {len(skipped)} skipped, {len(summary.get('by_check') or {})} check kinds")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
