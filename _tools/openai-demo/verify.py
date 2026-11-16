"""Audit assets/data/openai/overview.json against the post prose and privacy rules."""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "assets" / "data" / "openai" / "overview.json"
POST = ROOT / "_posts" / "2026-11-15-reading-my-own-openai-export.markdown"

d = json.loads(DATA.read_text())
raw = DATA.read_text()
post = POST.read_text()

# 1. Privacy: no identifiers, emails, addresses, or IPs in the published JSON.
FORBIDDEN = [
    "@", "outlook", "cus_", "user-", "ch_3", "in_1", "sub_1", "173.75.", "2601:188",
]
for token in FORBIDDEN:
    assert token not in raw.lower(), f"Privacy check failed on token: {token}"

# 2. Archive totals and milestones.
t = d["totals"]
assert t["conversations"] == 12429
assert t["prompts"] == 24278
assert t["replies"] == 25518
assert t["commentary"] == 3837
assert t["thoughtBlocks"] == 19050
assert t["nonEmptyThoughts"] == 16815
assert t["recaps"] == 6753
assert t["timedTurns"] == 6438
assert t["thinkSec"] == 346708
assert round(t["thinkSec"] / 3600, 2) == 96.31
assert t["uWords"] == 5472642
assert t["aWords"] == 10397571
assert t["aFinalWords"] == 10263995
assert t["aCommWords"] == 133576
assert t["tWords"] == 794744
assert t["allWords"] == 16664957
assert t["uMedianWords"] == 15 and t["uMeanWords"] == 225.4
assert t["aMedianWords"] == 291 and t["aMeanWords"] == 402.2
assert t["codeBlocks"] == 57544 and t["codeReplies"] == 7830
assert t["paidTotal"] == 784.47 and t["paidCharges"] == 36
assert t["apiCost"] == 1101.65
assert t["freshTok"] == 14660335
assert t["resentTok"] == 33967695
assert t["outTok"] == 20816182
assert t["reasTok"] == 13380920
assert t["allTok"] == 82825132
assert t["resentShare"] == 0.6985
assert t["sessions"] == 5311 and t["multiChatSessions"] == 2568 and t["medianFollowUpSec"] == 98
assert len(d["clusters"]) == 9 and len(d["atlas"]["cells"]) == 389
assert d["libraryFiles"]["total"] == 961 and d["libraryFiles"]["totalMB"] == 2043.1
assert d["turns"]["survival"][9]["cumTok"] == 45361
assert d["turns"]["survival"][0]["survival"] == 0.9999 and d["turns"]["survival"][0]["contRate"] == 0.3977
assert d["quarters"][1]["aiIsms"] == 18.45 and d["quarters"][14]["aiIsms"] == 1.83
assert d["quarters"][3]["emDashes"] == 0.09 and d["quarters"][11]["emDashes"] == 5.89

# 3. Monthly series checks.
months = {m["m"]: m for m in d["months"]}
assert len(months) == 46
assert months["2023-02"]["convs"] == 27 and months["2023-02"]["prompts"] == 77
assert months["2025-02"]["convs"] == 1024 and months["2025-02"]["prompts"] == 1705
assert round(months["2025-02"]["reasShare"] * 100, 1) == 53.4
assert round(months["2026-05"]["reasShare"] * 100, 1) == 99.2
assert round(months["2026-09"]["thinkSec"] / 3600, 1) == 17.6
assert round(months["2026-10"]["thinkSec"] / 3600, 1) == 25.5
assert round(months["2026-11"]["thinkSec"] / 3600, 1) == 18.7

sprint = [m for m in d["months"] if "2024-10" <= m["m"] <= "2025-03"]
assert sum(m["convs"] for m in sprint) == 4382
assert sum(m["prompts"] for m in sprint) == 7170

# 4. Active days, peak days, and 252-day streak.
days = d["days"]
assert len(days) == 1114 and d["spanDays"] == 1367
assert days["2025-02-25"][0] == 122
assert days["2024-10-09"][0] == 102
assert days["2026-10-20"][0] == 106

sorted_days = sorted(date.fromisoformat(k) for k in days)
best = cur = 1
best_start = best_end = cur_start = sorted_days[0]
for a, b in zip(sorted_days, sorted_days[1:]):
    if (b - a).days == 1:
        cur += 1
    else:
        cur = 1
        cur_start = b
    if cur > best:
        best, best_start, best_end = cur, cur_start, b
assert (best, best_start.isoformat(), best_end.isoformat()) == (252, "2026-03-07", "2026-11-13")

# 5. Clock, turn structure, and Codex checks.
clock_all = d["clock"]["all"]
assert sum(clock_all) == 24278
assert clock_all[15] == 1762 and clock_all[23] == 1943 and clock_all[0] == 1698
assert sum(clock_all[4:8]) == 367

turns = d["turns"]
assert turns["singleTurnConvs"] == 7486 and turns["twoTurnConvs"] == 2482
assert turns["branchConvs"] == 1641 and turns["branchPoints"] == 2211 and turns["extraBranches"] == 2995
assert turns["promptEdits"] == 2088 and turns["assistantRegens"] == 883
assert len(turns["sampleTrees"]) == 5
assert len(d["turnXrays"]) == 6
assert d["turnXrays"][0]["sec"] == 4598 and d["turnXrays"][1]["nodes"] == 187
assert d["turnXrays"][5]["tWords"] == 7741 and d["turnXrays"][5]["fWords"] == 25
assert len(d["quarters"]) == 16
assert d["searchedDomains"][0] == {"domain": "reddit.com", "hits": 2271}
assert d["connectedRepos"][0] == {"repo": "web-chess-dot-com", "msgs": 783}
b0, b4 = turns["promptBuckets"][0], turns["promptBuckets"][4]
assert b0["uMsgs"] == 12447 and b0["uWords"] == 84217
assert b4["uMsgs"] == 1526 and b4["uWords"] == 3205667

cx = d["codex"]
assert cx["tasks"] == 82 and cx["turns"] == 151 and cx["files"] == 522 and cx["uniquePaths"] == 130

# 6. Prose action links resolve to real figures.
fig_ids = set(re.findall(r'<figure[^>]+id="([^"]+)"', post))
assert fig_ids == {
    "oai-run", "oai-atlas", "oai-models", "oai-thinking",
    "oai-trees", "oai-drift", "oai-rhythm", "oai-arbitrage",
}
for target in re.findall(r'<a class="act" href="#([^"]+)"', post):
    assert target in fig_ids, f"Broken action target: #{target}"

print("All privacy, arithmetic, and prose-link assertions passed.")
