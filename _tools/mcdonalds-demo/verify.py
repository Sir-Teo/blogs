#!/usr/bin/env python3
"""
Audit assets/data/mcdonalds/overview.json and the McDonald's export blog post:
  1. Privacy firewall (no PII, IDs, device tokens, street addresses, or Greater Boston suburbs)
  2. Exact arithmetic invariants across all 6 figures
  3. House style rules (succinctness, no intensifiers, self-containment, action links wired)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "assets" / "data" / "mcdonalds" / "overview.json"
POST_PATH = ROOT / "_posts" / "2026-11-25-reading-my-own-mcdonalds-export.markdown"
JS_PATH = ROOT / "assets" / "js" / "mcdonalds.js"

# Strict PII + residential suburb firewall (checked case-insensitively on both JSON and post)
FORBIDDEN_PRIVACY = [
    "zengwc", "outlook.com", "december 5", "slez5rjtz6",
    "579086730", "157624354", "22840000059534696", "1000186226369",
    "2000200004749", "7131580589050672702", "1a1e2c06", "c7808f8f",
    "f1c5549e", "3a541663", "097609af", "ea8650", "4e2f1d",
    # Greater Boston residential suburbs & zip codes
    "medford", "malden", "somerville", "cambridge", "everett", "melrose",
    "watertown", "brookline", "needham", "dorchester", "milton",
    "jamaica plain", "allston", "02149", "02143", "02139", "02134",
    "128 broadway", "14 mcgrath", "463 massachusetts", "1223 commonwealth",
    "santa ana",
]

# House-style forbidden intensifiers & cross-post bleed (checked on post body)
FORBIDDEN_PROSE = [
    "exact same", "silently", "quietly", "directly", "straight out of",
    "literally", "duolingo", "openai", "chatgpt", "{% post_url",
]


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    raw_json = DATA_PATH.read_text(encoding="utf-8").lower()
    raw_post = POST_PATH.read_text(encoding="utf-8")
    raw_post_l = raw_post.lower()
    raw_js = JS_PATH.read_text(encoding="utf-8")

    # 1. Privacy firewall
    for tok in FORBIDDEN_PRIVACY:
        assert tok not in raw_json, f"PRIVACY LEAK in overview.json: {tok!r}"
        assert tok not in raw_post_l, f"PRIVACY LEAK in post: {tok!r}"
    # No email patterns anywhere
    assert not re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", raw_json), "Email pattern in JSON"
    assert not re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", raw_post_l), "Email pattern in post"

    # 2. Exact arithmetic invariants
    s = data["summary"]
    assert s["total_orders"] == 71 and s["pos_orders"] == 70 and s["loy_orders"] == 70
    assert s["pos_spend_extax"] == 657.66 and s["total_spend_all"] == 667.85
    assert s["deal_orders"] == 49 and s["deal_rate_pct"] == 70.0
    assert s["unique_stores"] == 36 and s["states_visited"] == 15
    assert s["total_miles"] == 23812 and s["home_orders"] == 45 and s["road_orders"] == 26
    assert s["home_deal_pct"] == 80.0 and s["road_deal_pct"] == 52.0
    assert s["breakfast_total"] == 4 and s["breakfast_road"] == 4
    assert s["dinner_peak_total"] == 27 and s["dinner_peak_home"] == 26
    assert data["points_ledger"][-1]["bal"] == 16163
    assert len(data["menu"]["categories"]) == 18

    assert s["comms_total"] == 157
    assert s["comms_pre"] == 83 and s["comms_pre_push"] == 83 and s["comms_pre_fff"] == 25
    assert s["comms_post"] == 74 and s["comms_post_mkt_push"] == 0
    assert s["comms_post_tx_push"] == 4 and s["comms_post_oas"] == 64 and s["comms_post_iam"] == 5 and s["comms_post_test"] == 1
    assert s["comms_pre"] + s["comms_post"] == s["comms_total"]
    assert (
        s["comms_post_mkt_push"]
        + s["comms_post_tx_push"]
        + s["comms_post_oas"]
        + s["comms_post_iam"]
        + s["comms_post_test"]
        == s["comms_post"]
    )
    assert sum(m["push"] + m["tx_push"] + m["oas"] + m["iam"] + m["test"] for m in data["monthly"]) == 157
    assert sum(m["orders"] for m in data["monthly"]) == 71

    assert s["pts_lifetime"] == 66701
    assert s["pts_franchise"] == 64013 and s["pts_mcopco"] == 2688
    assert s["pts_redeemed"] == 50000 and s["pts_expired"] == 538 and s["pts_balance"] == 16163
    assert s["pts_franchise"] + s["pts_mcopco"] == s["pts_lifetime"]
    assert s["pts_lifetime"] - s["pts_redeemed"] - s["pts_expired"] == s["pts_balance"]
    assert sum(r["pts"] for r in data["rewards"]) == 50000
    assert sum(abs(e["pts"]) for e in data["expirations"]) == 538

    assert s["insights_visits"] == 63 and s["insights_kiosk"] == 59 and s["insights_kiosk_pct"] == 93.7
    assert s["insights_mobile"] == 1 and s["insights_cash"] == 0
    assert s["insights_paid_sales"] == 622.75 and s["insights_profit_margin"] == 455.33 and s["insights_margin_pct"] == 73.1

    assert s["ip_matched"] == 33 and s["ip_wrong_state"] == 13 and s["ip_wrong_pct"] == 39.4
    assert s["ip_max_err_mi"] == 2579
    assert s["median_scan_s"] == 174 and s["min_scan_s"] == 79 and s["max_scan_s"] == 353

    # ML probability axiom violations
    imp = [p for p in data["ml"]["products"] if p["p30"] > p["p90"]]
    assert len(imp) == 5, f"Expected 5 impossible ML product categories, got {len(imp)}"
    cakes = next(p for p in data["ml"]["products"] if p["cat"] == "Cakes")
    assert cakes["p30"] == 1.0 and cakes["p90"] == 0.99 and cakes["actual_365"] == 0
    assert data["ml"]["churn_30"] == 0.06 and data["ml"]["churn_90"] == 0.03

    # Municipal tax gaps: 21 total = 15 PA + 3 CA + 3 MA, 0 unexplained
    gaps = [o for o in data["orders"] if o["gap_pts"]]
    assert len(gaps) == 21
    assert sum(1 for o in gaps if o["state"] == "PA") == 15
    assert sum(1 for o in gaps if o["state"] == "CA" and o["gap_pts"] == 10) == 3
    assert sum(1 for o in gaps if o["state"] == "MA" and o["gap_pts"] == 5) == 3
    assert all("rounding" not in (o["gap_reason"] or "") for o in gaps), "Unexplained tax gap!"

    # 3. Prose & wiring audit
    body = raw_post.split("---", 2)[2]
    body_no_methods = body.split("<details", 1)[0]
    for bad in FORBIDDEN_PROSE:
        assert bad not in body_no_methods.lower(), f"Forbidden prose phrase found: {bad!r}"

    # Check word count of main essay (succinct target: 850..1600 words)
    plain = re.sub(r"<[^>]+>", " ", body_no_methods)
    words = re.findall(r"[A-Za-z0-9’'-]+", plain)
    assert 850 <= len(words) <= 1650, f"Unexpected essay length: {len(words)} words"

    # Check every <figure id="mcd-..."> matches JS builder & every a.act resolves
    fig_ids = re.findall(r'id="(mcd-[a-z]+)"', raw_post)
    assert fig_ids == ["mcd-journey", "mcd-rhythm", "mcd-atlas", "mcd-menu", "mcd-deals", "mcd-kiosk", "mcd-mirror"], f"Unexpected figures: {fig_ids}"
    acts = re.findall(r'class="act"\s+href="#(mcd-[a-z]+)"\s+data-do="([a-z0-9-]+)"', raw_post)
    assert len(acts) >= 25, f"Expected >=25 inline action links, got {len(acts)}"
    for fid, do_key in acts:
        assert fid in fig_ids, f"Action link points to missing figure: {fid}"
        assert f"'{do_key}'" in raw_js, f"Action key {do_key!r} not handled in mcdonalds.js"

    print(
        f"PASS verify.py: 0 privacy leaks, all arithmetic invariants exact, "
        f"{len(words)} essay words, {len(fig_ids)} figures, {len(acts)} wired action links."
    )


if __name__ == "__main__":
    main()
