"""Audit assets/data/duolingo/overview.json against the post prose and privacy rules."""
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "assets" / "data" / "duolingo" / "overview.json"
POST = ROOT / "_posts" / "2026-11-09-reading-my-own-duolingo-export.markdown"

d = json.loads(DATA.read_text())
raw = DATA.read_text()
post = POST.read_text()

# 1. Privacy: no identifiers or sensitive attributes in the published JSON.
FORBIDDEN = [
    "@", "outlook", "sirteo", "101241880055447543995", "625409208",
    "24.218.", "174.242.", "174.196.", "2001-10-12", "masculine", "feminine",
]
for token in FORBIDDEN:
    assert token not in raw.lower(), f"Privacy check failed on token: {token}"

# 2. League totals and milestones.
weeks = d["weeks"]
assert len(weeks) == 151
assert sum(w["xp"] for w in weeks) == 128780
assert sum(w["xp"] for w in weeks if w["week"].startswith("2024")) == 99018
assert sum(w["xp"] for w in weeks if w["week"].startswith("2025")) == 18630
assert sum(w["xp"] for w in weeks if w["week"].startswith("2026")) == 11132
peak = max(weeks, key=lambda w: w["xp"])
assert (peak["week"], peak["xp"]) == ("2024-07-01", 5833)

league_weeks = [w for w in weeks if w["kind"] == "league"]
results = Counter(w.get("result") for w in league_weeks)
assert results["up"] == 53 and results["down"] == 44 and results["stay"] == 49
amethyst_weeks = sum(1 for w in league_weeks if w["tier"] == 6)
assert amethyst_weeks == 34

# First climb: 9 promotions in a row from 2024-01-09 to 2024-03-11, 40,705 XP across 10 weeks.
climb = [w for w in league_weeks if "2024-01-09" <= w["week"] <= "2024-03-11"]
assert len(climb) == 10 and sum(w["xp"] for w in climb) == 40705
assert [w["tier"] for w in climb] == list(range(10))

# Second climb into Diamond: 5,272 XP in Mar 2024 vs 266 XP in Sep 2026.
w_mar24 = next(w for w in league_weeks if w["week"] == "2024-03-04")
w_sep26 = next(w for w in league_weeks if w["week"] == "2026-09-27")
assert w_mar24["xp"] == 5272 and w_sep26["xp"] == 266

# 3. Store items, active days, and study hours.
events = d["events"]
assert len(events) == 1266
non_sub = [e for e in events if e["kind"] != "subscription"]
assert len(non_sub) == 1263
assert sum(1 for e in events if e["kind"] == "boost") == 1011
assert sum(1 for e in events if e["kind"] == "boost" and e["t"].startswith("2024-02")) == 147

days = d["days"]
assert len(days) == 535
assert max(days.items(), key=lambda kv: kv[1]) == ("2024-03-20", 15)

sorted_days = sorted(date.fromisoformat(k) for k in days)
best = cur = 1
best_end = sorted_days[0]
for a, b in zip(sorted_days, sorted_days[1:]):
    cur = cur + 1 if (b - a).days == 1 else 1
    if cur > best:
        best, best_end = cur, b
assert (best, best_end.isoformat()) == (36, "2024-03-07")

hours = Counter(int(e["t"][11:13]) for e in non_sub)
assert round(hours[23] / len(non_sub) * 100) == 23
night_all = sum(v for h, v in hours.items() if h >= 20 or h < 5) / len(non_sub)
assert round(night_all * 100) == 79
after_midnight = sum(v for h, v in hours.items() if h < 5) / len(non_sub)
assert after_midnight > 0.25

for yr, expected in [("2024", 75), ("2026", 88)]:
    sub = [e for e in non_sub if e["t"].startswith(yr)]
    share = sum(1 for e in sub if int(e["t"][11:13]) >= 20 or int(e["t"][11:13]) < 5) / len(sub)
    assert round(share * 100) == expected

# 4. Courses, path, and tracked skills.
courses = {c["name"]: c["xp"] for c in d["courses"]}
assert len(courses) == 8
assert courses["Spanish"] == 125265 and courses["French"] == 2110 and courses["Chinese"] == 180
total_course_xp = sum(v for v in courses.values() if v)
assert total_course_xp == 127555
assert round(courses["Spanish"] / total_course_xp * 100, 1) == 98.2

assert len(d["path"]["credits"]) == 88 and d["path"]["section"] == 5
k = d["knowledge"]
assert len(k) == 73
seen = sum(x["seen"] for x in k)
right = sum(x["right"] for x in k)
assert seen == 432 and right == 375 and round(right / seen * 100) == 87

# 5. Prose action links resolve to real figures.
fig_ids = set(re.findall(r'<figure[^>]+id="([^"]+)"', post))
assert fig_ids == {
    "duo-run", "duo-ladder", "duo-calendar", "duo-clock",
    "duo-receipts", "duo-courses", "duo-now",
}
for target in re.findall(r'<a class="act" href="#([^"]+)"', post):
    assert target in fig_ids, f"Broken action target: #{target}"

print("All privacy, arithmetic, and prose-link assertions passed.")
