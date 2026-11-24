#!/usr/bin/env python3
"""Audit assets/data/google/overview.json against the post prose, privacy rules, and self-containment."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "assets" / "data" / "google" / "overview.json"
POST = ROOT / "_posts" / "2026-11-24-reading-my-own-google-export.markdown"

d = json.loads(DATA.read_text())
raw = DATA.read_text()
post = POST.read_text()

# 1. Privacy firewall + self-containment (no cross-post comparisons!)
FORBIDDEN = [
    "@", "outlook", "nyu.edu", "zengwc", "175528786068", "8058002486", "805-800",
    "december 5", "medford", "malden", "somerville", "cambridge", "melrose",
    "watertown", "inglewood", "richmond hill", "second middlesex", "utm_",
    "gad_source", "doubleclick.net", "io_umov", "imbn6kn", "103.219.", "2601:188",
    "duolingo", "openai", "chatgpt",
]
for label, blob in [("overview.json", raw), ("post.markdown", post)]:
    low = blob.lower()
    for token in FORBIDDEN:
        assert token not in low, f"Privacy/self-containment check failed in {label} on token: {token}"
    assert not re.search(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", blob), f"IPv4 pattern found in {label}"
    assert not re.search(r"[0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4}:", low), f"IPv6 pattern found in {label}"

assert "{% post_url" not in post, "Post should remain self-contained without cross-post links"

# 2. Core archive totals and cross-checks.
t = d["totals"]
assert t["files"] == 7
assert t["watchRows"] == 7270
assert t["organicWatched"] == 3353
assert t["organicYT"] == 2727 and t["organicYTM"] == 626
assert t["watchAds"] == 3906 and round(t["watchAdShare"] * 100, 1) == 53.7
assert t["searchRows"] == 3742 and t["realSearches"] == 496 and t["searchAds"] == 3244
assert round(t["searchAdShare"] * 100, 1) == 86.7
assert t["adOverlap"] == 3189
assert t["adClicks"] == 7 and round(t["adCtr"] * 100, 2) == 0.18
assert t["selfViews"] == 179 and t["selfViewsNov"] == 147
assert t["uniqueChannels"] == 1076 and t["oneOffChannels"] == 787
assert round(t["oneOffChannels"] / t["uniqueChannels"] * 100, 1) == 73.1
assert round(t["uniqueYTVideos"] / t["organicYT"] * 100, 1) == 91.8
assert t["activeDays"] == 355 and t["spanDays"] == 531 and t["longestStreak"] == 58
assert t["sessions"] == 854 and t["searchSessions"] == 231 and t["feedSessions"] == 623
assert round(t["feedSessions"] / t["sessions"] * 100, 1) == 73.0
assert t["preOct19Rate"] == 4.33 and t["postOct19Rate"] == 33.61
assert t["logins"] == 2058 and t["bgLogins"] == 1390 and t["mapsBgLogins"] == 1019
assert round(t["bgLogins"] / t["logins"] * 100, 1) == 67.5
assert t["distinctRawGeos"] == 53
assert t["accessRows"] == 212345 and t["accessDays"] == 28 and t["accessUniqueIps"] == 642
assert round(t["accessOtherShare"] * 100, 1) == 91.6
assert round(t["accessRowShareAll"] * 100, 1) == 94.2
assert t["accessMaxPerSec"] == 64 and t["accessSec64Count"] == 15
assert t["devicesRows"] == 39

# 3. Monthly & October switch checks.
months = {m["m"]: m for m in d["months"]}
assert len(months) == 18
assert months["2026-03"]["adRatio"] == 0.1
assert months["2026-09"]["adRatio"] == 3.76
assert round(months["2026-09"]["zhShare"] * 100, 1) == 71.0
assert months["2026-11"]["wAds"] == 0
assert d["octSwitch"]["peakAdDay"] == {"d": "2026-10-11", "ads": 106, "yt": 11}
assert d["octSwitch"]["gapAfterLastAdSec"] == 149
assert len(d["octSwitch"]["burst"]) == 6

# 4. Rhythm, starfield, 672-hour grid, and sessions.
sf = d["rhythm"]["starfield"]
assert len(sf["yt"]) == 2727 * 2 and len(sf["ytm"]) == 626 * 2 and len(sf["ads"]) == 3906 * 2
clocks = d["rhythm"]["clocks"]
assert set(clocks.keys()) == {"yt", "ytRawEst", "ytm", "search", "ads", "tv", "humanAccess", "machineAccess"}
assert sum(clocks["yt"]) == 2727 and clocks["yt"][0] == 317 and clocks["yt"][4] == 0 and clocks["yt"][5] == 0
assert sum(clocks["ytm"]) == 626 and round((clocks["ytm"][16] + clocks["ytm"][17]) / 626 * 100, 1) == 35.0
assert sum(clocks["tv"][1:9]) == 0 and clocks["tv"][19] == 1049

S = d["sessions"]
assert S["ytmMedianSec"] == 178 and round(S["ytmSongWindowShare"] * 100, 1) == 49.5
assert round(S["ytUnder60Share"] * 100, 1) == 39.2
assert S["searchAvgLen"] == 6.07 and S["feedAvgLen"] == 3.13
assert len(S["xrays"]) == 6

assert len(d["accessLog"]["grid"]) == 28 and all(len(r) == 24 for r in d["accessLog"]["grid"])
hr = d["accessLog"]["hourly"]
assert round(sum(hr["human"][2:7]) / sum(hr["human"]) * 100, 1) == 0.8
assert round(sum(hr["machine"][2:7]) / sum(hr["machine"]) * 100, 1) == 17.6

# 5. Prose action links resolve cleanly to real figures.
fig_ids = set(re.findall(r'<figure[^>]+id="([^"]+)"', post))
assert fig_ids == {
    "goog-ads", "goog-culture", "goog-rhythm", "goog-sessions",
    "goog-geo", "goog-pings", "goog-account",
}
acts = re.findall(r'<a class="act" href="#([^"]+)"', post)
assert len(acts) >= 14, f"Expected >=14 action links, found {len(acts)}"
for target in acts:
    assert target in fig_ids, f"Broken action target: #{target}"

print("All privacy, self-containment, arithmetic, starfield, 672-hour grid, and prose-link assertions passed.")
