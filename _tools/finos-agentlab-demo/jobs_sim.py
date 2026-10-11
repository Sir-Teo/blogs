"""A week on the backend's scheduler, with its real rules.

`app.services.jobs` decides, every minute, which unattended pass fires. This
drives that module's own `tick` (so `decide`, `slot` and the refire cap are the
shipped ones) over one simulated week for the ten system jobs, with their state
kept in a dict instead of SQLite and each pass replaced by a stub that succeeds
or fails as the scenario says. Run from FinOS-AgentLab/backend with its venv.

    DATABASE_URL=sqlite:////tmp/x.db .venv/bin/python jobs_sim.py out.json
"""

from __future__ import annotations

import asyncio
import json
import sys
import warnings
from datetime import datetime, timedelta

warnings.simplefilter("ignore")

from app.services import jobs  # noqa: E402

START = datetime(2026, 10, 5)  # a Monday, local time
MINUTES = 7 * 24 * 60


def minute(day: int, hour: int, minute: int = 0) -> int:
    return day * 1440 + hour * 60 + minute


SCENARIOS = {
    # Every pass succeeds; the market is open Monday to Friday.
    "normal": {},
    # Every pass fails between Tuesday 20:30 and 23:30.
    "outage": {"outage": [[minute(1, 20, 30), minute(1, 23, 30)]]},
    # The box goes down on Wednesday at 06:01, with the thesis scan it fired a
    # minute earlier still running, and comes back at 11:40.
    "restart": {"down": [[minute(2, 6, 1), minute(2, 11, 40)]], "cut_off": ["thesis-scan"]},
    # Monday is a market holiday.
    "holiday": {"closed_days": [0]},
}


def simulate(name: str, spec: dict) -> dict:
    state: dict[str, dict] = {}
    events: list[list] = []
    now_box = {"m": 0}
    names = []

    def load(key: str) -> dict:
        return dict(state.get(key, {}))

    def save(key: str, value: dict) -> None:
        state[key] = value
        status = value.get("status")
        code = {"running": None, "done": 0, "failed": 1, "skipped": 2}.get(status)
        if code is None:
            return
        events.append([names.index(key), now_box["m"], code, int(value.get("fires") or 0)])

    outages = spec.get("outage", [])
    downs = spec.get("down", [])
    closed = set(spec.get("closed_days", []))

    def in_window(windows, m: int) -> bool:
        return any(a <= m < b for a, b in windows)

    jobs._load_state = load
    jobs._save_state = save
    jobs.is_trading_day = lambda now: ((now - START).days % 7) not in closed

    system = []
    for job in jobs.system_jobs():
        names.append(job.key)

        async def run(key=job.key):
            if in_window(outages, now_box["m"]):
                raise RuntimeError("provider unavailable")

        system.append(jobs.Job(job.key, job.title, job.schedule, run))

    async def week() -> None:
        cut = set(spec.get("cut_off", []))
        for m in range(MINUTES):
            now_box["m"] = m
            if in_window(downs, m):
                if cut and any(a == m for a, _ in downs):
                    # The box went down with these passes mid-flight: their
                    # state says "running" and nothing will ever finish it.
                    for key in cut:
                        if key in state:
                            state[key] = {**state[key], "status": "running"}
                continue
            jobs._running.clear()
            jobs.tick(system, START + timedelta(minutes=m))
            for _ in range(3):
                await asyncio.sleep(0)

    asyncio.run(week())
    return {
        "down": downs,
        "outage": outages,
        "closed_days": sorted(closed),
        "events": events,
    }


def main(out: str) -> None:
    table = [
        {
            "key": job.key,
            "title": job.title,
            "cadence": job.schedule.cadence,
            "hour": job.schedule.hour_local,
            "catchup": job.schedule.catchup_hours,
            "skip_closed": job.schedule.skip_closed,
        }
        for job in jobs.system_jobs()
    ]
    scenarios = {name: simulate(name, spec) for name, spec in SCENARIOS.items()}
    with open(out, "w") as fh:
        json.dump({
            "start": START.isoformat(timespec="minutes"),
            "minutes": MINUTES,
            "cap": jobs.SLOT_FIRE_CAP,
            "tick_seconds": jobs.TICK_SECONDS,
            "jobs": table,
            "scenarios": scenarios,
        }, fh, indent=0)
    for name, s in scenarios.items():
        codes = [e[2] for e in s["events"]]
        print(name, "events", len(codes), "ok", codes.count(0), "fail", codes.count(1), "skip", codes.count(2))


if __name__ == "__main__":
    main(sys.argv[1])
