"""Compile the private Duolingo export into the aggregates the post draws.

Reads only whitelisted files from cache/ (see README) and writes
assets/data/duolingo/overview.json. No identifiers, contact details, IPs,
device tokens, birthdates, or avatar inferences are read or written.
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / "cache"
OUT = ROOT / "assets" / "data" / "duolingo" / "overview.json"
ET = ZoneInfo("America/New_York")
csv.field_size_limit(10**9)

TIERS = ["Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald",
         "Amethyst", "Pearl", "Obsidian", "Diamond"]
COURSE_NAMES = {
    "es<-en": "Spanish", "fr<-en": "French", "ko<-en": "Korean",
    "zh-CN<-en": "Chinese", "en<-zh-CN": "English (from Chinese)",
    "es<-zh-CN": "Spanish (from Chinese)", "en<-hi": "English (from Hindi)",
    "zh-HK<-zh-CN": "Cantonese (from Chinese)",
}
LANG_XP_KEY = {"es": "es<-en", "fr": "fr<-en", "ko": "ko<-en", "zs": "zh-CN<-en"}


def utc(s):
    s = s.replace("Z", "+00:00")
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def rows(name):
    with open(CACHE / name, newline="") as f:
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


# ---------------------------------------------------------------- leagues
def leagues():
    out = []
    for r in rows("leaderboards.csv"):
        end = utc(r["timestamp"]).astimezone(ET)  # first activity in that league week
        out.append({
            "week": end.date().isoformat(),
            "kind": "tournament" if r["leaderboard"] == "diamond-tournament" else "league",
            "tier": int(r["tier"]),
            "xp": int(r["score"]),
        })
    out.sort(key=lambda w: w["week"])
    # Result of each league week: compare with the following league week.
    league = [w for w in out if w["kind"] == "league"]
    for a, b in zip(league, league[1:]):
        a["result"] = "up" if b["tier"] > a["tier"] else "down" if b["tier"] < a["tier"] else "stay"
    return out


# --------------------------------------------------------------- inventory
def classify(r, start, end):
    if r["item_type"] != "Store Item":
        return {"Duolingo Plus subscription": "subscription", "Streak freeze": "streak",
                "Streak repair": "streak", "Gem wager": "wager",
                "Health refill": "gems"}.get(r["item_type"], "other")
    if r["payment_processor"] == "Immersive Plus" or "Free Trial" in r["product"]:
        return "pass"
    if end:
        minutes = (end - start).total_seconds() / 60
        if 0 < minutes <= 60:
            return "boost"
        if 60 < minutes <= 3 * 1440:
            return "day"
    if r["price_in_virtual_currency"]:
        return "gems"
    return "other"


def inventory():
    events, subs = [], []
    for r in rows("inventory.csv"):
        start = utc(r["purchase_datetime"])
        end = utc(r["expected_expiration"]) if r["expected_expiration"] else None
        kind = classify(r, start, end)
        local = start.astimezone(ET)
        ev = {"t": local.strftime("%Y-%m-%dT%H:%M"), "kind": kind}
        if end and kind in ("boost", "day"):
            ev["min"] = round((end - start).total_seconds() / 60)
        if r["item_type"] in ("Streak freeze", "Streak repair", "Gem wager"):
            ev["label"] = r["item_type"] + (f" ({r['wager_day']} days)" if r["wager_day"] else "")
        events.append(ev)
        if kind == "subscription":
            subs.append({
                "start": local.date().isoformat(),
                "end": end.astimezone(ET).date().isoformat() if end else None,
                "plan": r["product"].replace("Duolingo Plus Subscription", "").strip()
                        .replace("1 month", "Monthly").replace("12 month Family", "Family, yearly")
                        .replace("12 month", "Yearly"),
            })
        if kind == "pass" and "Free Trial" in r["product"]:
            subs.append({"start": local.date().isoformat(),
                         "end": end.astimezone(ET).date().isoformat(), "plan": "Free trial"})
    events.sort(key=lambda e: e["t"])
    subs.sort(key=lambda s: s["start"])
    return events, subs


# ------------------------------------------------------------------ courses
def courses():
    xp = {LANG_XP_KEY[r["learning_language"]]: int(r["points"]) for r in rows("languages.csv")}
    out = []
    with open(CACHE / "user-tree-backend.csv", newline="") as f:
        for r in csv.DictReader(f):
            key = r["language"]
            out.append({
                "id": key,
                "name": COURSE_NAMES.get(key, key),
                "last": utc(r["event_timestamp"]).astimezone(ET).date().isoformat(),
                "xp": xp.get(key),
            })
    out.sort(key=lambda c: -(c["xp"] or -1))
    return out


def path_state():
    with open(CACHE / "user-tree-backend.csv", newline="") as f:
        es = next(r for r in csv.DictReader(f) if r["language"] == "es<-en")["true_progress"]
    credits = []
    for seg in es.split("recent_path_credit_segments {")[1:]:
        for kind, sec in re.findall(r'credits \{\s*type: "(\w+)"\s*timestamp \{\s*seconds: (\d+)', seg):
            t = datetime.fromtimestamp(int(sec), timezone.utc).astimezone(ET)
            credits.append({"t": t.strftime("%Y-%m-%dT%H:%M"), "kind": kind})
    credits.sort(key=lambda c: c["t"])
    unit = int(re.search(r"unit_index_optional \{\s*value: (\d+)", es).group(1))
    section = int(re.search(r"section_index_optional \{\s*value: (\d+)", es).group(1))
    return {"unit": unit + 1, "section": section + 1, "credits": credits}


def knowledge():
    with open(CACHE / "user-tree-backend-kc-interactions.csv", newline="") as f:
        blob = next(csv.DictReader(f))["kc_interaction_history"]
    out = []
    kinds = {"lex": "word", "grm": "grammar", "grp": "pattern"}
    for b in blob.split("interaction_history_by_kc_id {")[1:]:
        kid = re.search(r'key: "(\w+)"', b).group(1)
        overall = b.split('key: "TEACH"')[0]

        def count(name):
            m = re.search(name + r" \{\s*count: (\d+)", overall)
            return int(m.group(1)) if m else 0

        last = max(map(int, re.findall(r"seconds: (\d+)", overall)), default=0)
        out.append({
            "kind": kinds.get(kid[:3], "other"),
            "seen": count("target_kc_seen"),
            "right": count("target_kc_correct"),
            "wrong": count("target_kc_incorrect"),
            "last": datetime.fromtimestamp(last, timezone.utc).astimezone(ET).date().isoformat() if last else None,
        })
    out.sort(key=lambda k: (-k["seen"], k["wrong"]))
    return out


def main():
    profile = {r["name"]: r["value"] for r in rows("profile.csv")}
    activity = json.loads((CACHE / "user-activity.json").read_text())
    weeks = leagues()
    events, subs = inventory()
    # A day counts as active when any store item was activated on it (ET).
    days = Counter(e["t"][:10] for e in events if e["kind"] != "subscription")
    data = {
        "generated": "2026-11-09",
        "joined": utc(profile["joined_at"]).astimezone(ET).date().isoformat(),
        "returned": activity["last_resurrection_timestamp"][0][:10],
        "dailyGoal": int(profile["daily_goal"]),
        "tiers": TIERS,
        "weeks": weeks,
        "events": events,
        "days": dict(sorted(days.items())),
        "subscriptions": subs,
        "courses": courses(),
        "path": path_state(),
        "knowledge": knowledge(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.1f} KiB): "
          f"{len(weeks)} weeks, {len(events)} items, {len(days)} active days")


if __name__ == "__main__":
    main()
