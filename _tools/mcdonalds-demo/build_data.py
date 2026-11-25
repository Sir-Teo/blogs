#!/usr/bin/env python3
"""
Build the privacy-scrubbed aggregate JSON for the McDonald's privacy export post.

Inputs (not checked into git):
  - Pre-extracted McDonald's Access & Portability Request PDF text + parsed sections
    (or raw PDF parsed via Apple PDFKit when --pdf is provided)
  - Mixpanel CSV export (events.csv, profiles.csv)

Output:
  - assets/data/mcdonalds/overview.json

Privacy firewall:
  - Strips name, email, DOB, all customer/account/DCS/household/device IDs,
    IDFV/IFA/push tokens, request reference IDs, and street addresses.
  - Folds all Greater Boston residential suburbs (Everett, Malden, Somerville,
    Cambridge, Allston, Dorchester, Jamaica Plain, etc.) into "Greater Boston, MA".
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import subprocess
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

STATE_TZ = {
    "NY": "America/New_York", "NJ": "America/New_York", "PA": "America/New_York",
    "MA": "America/New_York", "CT": "America/New_York", "NH": "America/New_York",
    "ME": "America/New_York", "VA": "America/New_York", "OH": "America/New_York",
    "IL": "America/Chicago", "IN": "America/Chicago", "MN": "America/Chicago", "TX": "America/Chicago",
    "WY": "America/Denver",
    "CA": "America/Los_Angeles",
}
HOME_CITIES = {"Manhattan, NY", "Jersey City, NJ", "Hoboken, NJ", "Philadelphia, PA", "Greater Boston, MA"}

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "assets" / "data" / "mcdonalds" / "overview.json"
DEFAULT_SCRATCH = Path(
    "/Users/teo/.gemini/antigravity/brain/8eff5b0e-76e6-4c05-b1c6-c45cace043a2/scratch"
)

# Public regional coordinates for the 36 stores (Greater Boston suburbs folded into metro center)
STORE_META: dict[str, tuple[str, str, float, float, str]] = {
    # store_id: (display_city, state, lat, lon, owner_note)
    "38711": ("Philadelphia, PA", "PA", 39.9537, -75.2016, "franchise"),
    "6919":  ("Philadelphia, PA", "PA", 39.9701, -75.1369, "franchise"),
    "1888":  ("Sayre, PA", "PA", 41.9789, -76.5155, "franchise"),
    "18759": ("Jersey City, NJ", "NJ", 40.7270, -74.0383, "franchise"),
    "3876":  ("Hoboken, NJ", "NJ", 40.7399, -74.0303, "franchise"),
    "14106": ("Manhattan, NY", "NY", 40.7577, -73.9818, "franchise"),
    "2813":  ("Manhattan, NY", "NY", 40.7450, -73.9786, "franchise"),
    "2968":  ("Manhattan, NY", "NY", 40.7377, -73.9963, "franchise"),
    "3835":  ("Manhattan, NY", "NY", 40.7460, -73.9911, "franchise"),
    "5518":  ("Newburgh, NY", "NY", 41.5193, -74.0706, "franchise"),
    "996":   ("Utica, NY", "NY", 43.1125, -75.2216, "franchise"),
    # Greater Boston privacy firewall: fold all 7 Boston/inner-ring stores into metro center
    "31643": ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "11729": ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "1720":  ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "26788": ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "2912":  ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "7059":  ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "20986": ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise"),
    "373":   ("Worcester, MA", "MA", 42.2495, -71.8195, "franchise"),
    "18799": ("Manchester, CT", "CT", 41.8058, -72.5504, "franchise"),
    "4523":  ("Concord, NH", "NH", 43.1945, -71.5318, "franchise"),
    "33187": ("Littleton, NH", "NH", 44.3062, -71.7701, "franchise"),
    "1881":  ("Gorham, NH", "NH", 44.3878, -71.1731, "franchise"),
    "1952":  ("North Conway, NH", "NH", 44.0419, -71.1235, "franchise"),
    "34252": ("Bangor, ME", "ME", 44.7975, -68.7810, "franchise"),
    "2517":  ("Calais, ME", "ME", 45.1889, -67.2786, "franchise"),
    "11373": ("Virginia Beach, VA", "VA", 36.7740, -75.9982, "franchise"),
    "6381":  ("Troutville, VA", "VA", 37.4165, -79.8764, "franchise"),
    "13667": ("Painesville, OH", "OH", 41.6820, -81.2590, "franchise"),
    "29828": ("Chesterton, IN", "IN", 41.6106, -87.0642, "franchise"),
    "39148": ("Chicago Global HQ, IL", "IL", 41.8842, -87.6536, "franchise"),
    "34406": ("Hinckley, MN", "MN", 46.0113, -92.9424, "franchise"),
    "39265": ("Houston (NASA Pkwy), TX", "TX", 29.5515, -95.0980, "franchise"),
    "7608":  ("Douglas, WY", "WY", 42.7594, -105.3822, "franchise"),
    "7889":  ("Los Angeles (LAX), CA", "CA", 33.9456, -118.3712, "mcopco"),
    "2419":  ("Sunnyvale, CA", "CA", 37.3688, -122.0258, "franchise"),
}

# Approximate coordinates for Mixpanel IP-derived cities/states (for ballistic error arcs)
IP_COORDS: dict[tuple[str, str], tuple[str, float, float]] = {
    ("San Diego", "California"): ("San Diego, CA", 32.7157, -117.1611),
    ("", "Delaware"): ("Delaware (state IP)", 39.1582, -75.5244),
    ("Brooklyn", "New York"): ("Brooklyn, NY", 40.6782, -73.9442),
    ("Queens", "New York"): ("Queens, NY", 40.7282, -73.7949),
    ("New York", "New York"): ("New York, NY", 40.7128, -74.0060),
    ("South Portland", "Maine"): ("South Portland, ME", 43.6415, -70.2409),
    ("", "Connecticut"): ("Connecticut (state IP)", 41.6032, -73.0877),
    ("", "Rhode Island"): ("Rhode Island (state IP)", 41.5801, -71.4774),
    ("", "Colorado"): ("Colorado (state IP)", 39.7392, -104.9903),
    ("", "Illinois"): ("Illinois (state IP)", 41.8781, -87.6298),
    ("Philadelphia", "Pennsylvania"): ("Philadelphia, PA", 39.9526, -75.1652),
    ("Texas City", "Texas"): ("Texas City, TX", 29.3838, -94.9027),
    ("Littleton", "New Hampshire"): ("Littleton, NH", 44.3062, -71.7701),
    ("Minneapolis", "Minnesota"): ("Minneapolis, MN", 44.9778, -93.2650),
    ("Los Angeles", "California"): ("Los Angeles, CA", 34.0522, -118.2437),
    ("Santa Ana", "California"): ("Southern California, CA", 33.7455, -117.8677),
    # Fold Boston-area IP suburbs to Greater Boston
    ("Cambridge", "Massachusetts"): ("Greater Boston, MA", 42.3601, -71.0589),
    ("Dorchester", "Massachusetts"): ("Greater Boston, MA", 42.3601, -71.0589),
    ("Jamaica Plain", "Massachusetts"): ("Greater Boston, MA", 42.3601, -71.0589),
    ("Boston", "Massachusetts"): ("Greater Boston, MA", 42.3601, -71.0589),
    ("", "Massachusetts"): ("Massachusetts (state IP)", 42.3601, -71.0589),
}

STATE_FULL = {
    "CA": "California", "CT": "Connecticut", "IL": "Illinois", "IN": "Indiana",
    "MA": "Massachusetts", "ME": "Maine", "MN": "Minnesota", "NH": "New Hampshire",
    "NJ": "New Jersey", "NY": "New York", "OH": "Ohio", "PA": "Pennsylvania",
    "TX": "Texas", "VA": "Virginia", "WY": "Wyoming",
}


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def gf(f: dict[str, str], *subs: str) -> str:
    for k, v in f.items():
        kl = k.lower().replace("_", " ")
        if all(s.lower() in kl for s in subs):
            return v
    return ""


def parse_comm_logs(raw_txt: str) -> list[dict]:
    """Parse all 157 communication log records cleanly from unclipped PDF text."""
    clean_txt = re.sub(r"\n\d+ / 259\n=== PAGE \d+ ===\n", "\n", raw_txt)
    # Locate the communication log section of the PDF and split by part heading
    hdr_re = re.compile(
        r"Log of events for email or push notification compaigns where a customer was sent, clicked,\s*"
        r"opened, or bounced part (\d+)"
    )
    matches = list(hdr_re.finditer(clean_txt))
    # Group duplicate consecutive headings (faux bold double-strike) by part number
    by_part: dict[int, str] = {}
    for idx, m in enumerate(matches):
        part = int(m.group(1))
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(clean_txt)
        chunk = clean_txt[start:end]
        # Truncate chunk at next non-comm section heading (only needed on the very last comm part)
        if idx + 1 == len(matches):
            stop_m = re.search(
                r"\n(?:Offers |Point of Sale|Your Customer|Loyalty |Product |Occasion |Historical |Restaurant |Summary |Digital offer|List of all|Description of prizes|Achievements |Types of events)",
                chunk,
            )
            if stop_m:
                chunk = chunk[: stop_m.start()]
        if "Territory" in chunk and "Event" in chunk:
            by_part[part] = chunk

    comms = []
    for part, body in sorted(by_part.items()):
        lines = [ln.strip() for ln in body.splitlines() if ln.strip() and ln.strip() != "_"]
        s = re.sub(r"\s+", " ", " ".join(lines))

        def extract_between(start_pat: str, end_pat: str | None) -> str:
            if end_pat:
                mm = re.search(start_pat + r"\s*(.*?)\s*" + end_pat, s)
            else:
                mm = re.search(start_pat + r"\s*(.*)$", s)
            if not mm:
                return ""
            val = mm.group(1).strip()
            val = re.sub(r"\s+_", "_", val)
            val = re.sub(r"_\s+", "_", val)
            return val.strip("_ ")

        ts = extract_between(r"Event\s+Timestamp_?\s+UTC", r"Campaign_?\s+Description")
        camp = extract_between(r"Campaign_?\s+Description", r"Canvas_?\s+Description")
        canvas = extract_between(r"Canvas_?\s+Description", r"Campaign_?\s+Cohort_?\s+Code")
        cohort = extract_between(r"Campaign_?\s+Cohort_?\s+Code", r"Campaign_?\s+Version_?\s+Code")
        ver = extract_between(r"Campaign_?\s+Version_?\s+Code", r"Communication_?\s+Type")
        ct = extract_between(r"Communication_?\s+Type", r"Url_?\s+Clicked")
        if not ct:
            mm_ct = re.search(r"\bType\s+(Push|PUSH|OAS|IAM|BOTH)\b", s)
            if mm_ct:
                ct = mm_ct.group(1)

        name_raw = camp or canvas
        name_slug = (
            re.sub(r"\s+", "_", name_raw)
            if any(k in name_raw for k in ("NATL", "LCL", "GD_", "Random"))
            else name_raw
        )
        name_slug = re.sub(r"_+", "_", name_slug)
        cohort_s = re.sub(r"\s+", "_", cohort)
        ver_s = re.sub(r"\s+", "_", ver)

        ct_norm = ct.upper().strip()
        if ct_norm == "PUSH":
            channel = "push"
        elif ct_norm == "OAS":
            channel = "oas"
        elif ct_norm == "IAM":
            channel = "iam"
        elif ct_norm == "BOTH":
            channel = "test"
        else:
            channel = ct_norm.lower() or "other"

        is_holdout = ("HOLDOUT" in (name_slug + " " + cohort_s + " " + ver_s).upper()) or (ver_s.upper() == "HO")
        is_transactional = "NearReadyNotification" in name_slug
        is_test = "Random_bucket_number_test" in name_slug

        comms.append({
            "part": part,
            "ts": ts[:19],
            "month": ts[:7],
            "channel": channel,
            "name": name_slug,
            "cohort": cohort_s,
            "version": ver_s,
            "holdout": is_holdout,
            "transactional": is_transactional,
            "test": is_test,
        })
    comms.sort(key=lambda c: (c["ts"], c["part"]))
    return comms


def build_overview(scratch_dir: Path) -> dict:
    raw_txt = (scratch_dir / "mcd_pdf.txt").read_text(encoding="utf-8")
    secs = json.loads((scratch_dir / "mcd_parsed_v2.json").read_text(encoding="utf-8"))
    events = list(csv.DictReader((scratch_dir / "mcd_data" / "events.csv").open(encoding="utf-8")))
    events.sort(key=lambda e: int(e["time"]))

    def by_p(prefix: str) -> list[dict]:
        return [s["fields"] for s in secs if s["title"].lower().startswith(prefix.lower())]

    # 1. COMMUNICATION LOGS (157)
    comms = parse_comm_logs(raw_txt)
    assert len(comms) == 157, f"Expected 157 comm logs, got {len(comms)}"
    assert all(re.match(r"^202\d-\d\d-\d\d \d\d:\d\d:\d\d$", c["ts"]) for c in comms), "Malformed comm ts"

    optout_ts = "2024-06-20 17:38:41"
    pre_comms = [c for c in comms if c["ts"] < optout_ts]
    post_comms = [c for c in comms if c["ts"] >= optout_ts]
    pre_push = sum(1 for c in pre_comms if c["channel"] == "push")
    post_mkt_push = sum(1 for c in post_comms if c["channel"] == "push" and not c["transactional"])
    post_tx_push = sum(1 for c in post_comms if c["channel"] == "push" and c["transactional"])
    post_oas = sum(1 for c in post_comms if c["channel"] == "oas")
    post_iam = sum(1 for c in post_comms if c["channel"] == "iam")
    post_test = sum(1 for c in post_comms if c["test"])
    fff_count = sum(1 for c in pre_comms if "FREEFRIESFRIDAY" in c["name"].upper())

    # 2. TRANSACTIONS, LOYALTY POINTS, STORES, PROMOTIONS, MUNICIPAL TAXES
    pos_rows = by_p("Point of Sale Transaction Level Header")
    pos_promos = by_p("Point of Sale Transaction Promotion")
    loy_tx = by_p("Summary of overall transactions")
    loy_pts = by_p("Loyalty transactional point history")
    stores_raw = by_p("Restaurant location characteristics")
    rewards_raw = by_p("Loyalty rewards details")
    reward_names_raw = by_p("List of all Loyalty Offers")
    dig_off = by_p("Digital offer type or promotion")
    bal_raw = by_p("Loyalty point balance")
    ins = [s["fields"] for s in secs if "customer insights profile" in s["title"].lower()][0]
    ml_pref = by_p("Product Preference Machine Learning")
    ml_occ = by_p("Occasion Propensity Machine Learning")
    l3_hist = [s["fields"] for s in secs if "level 3 product category" in s["title"].lower()]
    occ_hist = [s["fields"] for s in secs if "each occasion segment" in s["title"].lower()]
    rfm_rows = by_p("Product Relevancy Model")
    churn_row = [s["fields"] for s in secs if "stop engaging" in s["title"].lower()][0]
    clv_row = [s["fields"] for s in secs if "activation customer lifetime" in s["title"].lower()][0]
    ltv_rows = [s["fields"] for s in secs if "how often they will visit" in s["title"].lower()]

    assert len(pos_rows) == 70, f"Expected 70 POS headers, got {len(pos_rows)}"
    assert len(loy_tx) == 70, f"Expected 70 Loyalty summary tx, got {len(loy_tx)}"
    assert len(stores_raw) == 36, f"Expected 36 stores, got {len(stores_raw)}"

    # Build lookup maps
    loc_to_sn: dict[str, str] = {}
    oid_to_sn: dict[str, str] = {}
    oid_to_base_pts: dict[str, int] = defaultdict(int)
    oid_to_bonus_pts: dict[str, int] = defaultdict(int)
    oid_to_ts: dict[str, str] = {}
    expirations: list[dict] = []

    for lp in loy_pts:
        loc = lp.get("McD_Global_Location_ID", "")
        sn = lp.get("Store_Number", "")
        oid = lp.get("POS_Order_ID", "")
        pt_type = lp.get("Point_Type_Name", "")
        change = lp.get("Point_Change_Name", "")
        qty = int(float(lp.get("Point_Mod_Quantity") or 0))
        ts = lp.get("Last_Updated_Date_UTC", "")[:19]
        if loc and sn:
            loc_to_sn[loc] = sn
        if oid and sn:
            oid_to_sn[oid] = sn
        if oid and qty > 0:
            if pt_type == "Base Earn":
                oid_to_base_pts[oid] += qty
                oid_to_ts[oid] = ts
            else:
                oid_to_bonus_pts[oid] += qty
        if qty < 0 and ("Expir" in change or abs(qty) in (85, 453)):
            expirations.append({"date": ts[:10], "pts": qty, "type": pt_type})

    for lt in loy_tx:
        oid = lt["POS_Order_Key"]
        sn = lt["National Store Number"]
        loc = lt["McD_Global_Location_ID"]
        oid_to_sn[oid] = sn
        if loc and sn:
            loc_to_sn[loc] = sn

    # Map POS promos by order ID
    promo_by_oid: dict[str, list[dict]] = defaultdict(list)
    for pp in pos_promos:
        promo_by_oid[pp["POS Order ID"]].append({
            "desc": pp.get("POS Promotion Short Description", ""),
            "discount_type": pp.get("Promotion Applied Discount Type", ""),
            "offer_type": pp.get("POS Offer Type", ""),
        })

    # Union of all 71 unique transactions (70 POS + 1 loyalty-only on 2025-07-06)
    pos_by_oid = {p["POS Order ID"]: p for p in pos_rows}
    loy_by_oid = {lt["POS_Order_Key"]: lt for lt in loy_tx}
    all_oids = sorted(
        set(pos_by_oid) | set(loy_by_oid),
        key=lambda oid: (
            pos_by_oid[oid]["Business Date"] if oid in pos_by_oid else loy_by_oid[oid]["POS_Date"],
            oid_to_ts.get(oid, ""),
            oid,
        ),
    )
    assert len(all_oids) == 71, f"Expected 71 unique orders, got {len(all_oids)}"

    # Match Mixpanel mcflow_purchase rows to orders
    mcflow_rows = [e for e in events if e["event_name"] == "mcflow_purchase"]
    assert len(mcflow_rows) == 34
    nov22_mp_ts = next(
        (
            datetime.fromtimestamp(int(e["time"]), tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            for e in mcflow_rows
            if datetime.fromtimestamp(int(e["time"]), tz=timezone.utc).strftime("%Y-%m-%d") == "2026-11-22"
        ),
        "2026-11-22 17:49:02",
    )

    orders = []
    prev_lat, prev_lon, prev_bdate = None, None, None
    cum_mi = 0.0
    cum_spend = 0.0
    for idx, oid in enumerate(all_oids, 1):
        p = pos_by_oid.get(oid)
        lt = loy_by_oid.get(oid)
        in_pos = p is not None
        in_loy = lt is not None
        bdate = p["Business Date"] if p else lt["POS_Date"]
        sn = oid_to_sn.get(oid) or (loc_to_sn.get(p["Business Location"], "") if p else "")
        spend = round(float(p["Total Amount excluding tax"]), 2) if p else round(oid_to_base_pts.get(oid, 0) / 100.0, 2)
        base_pts = oid_to_base_pts.get(oid, 0)
        bonus_pts = oid_to_bonus_pts.get(oid, 0)
        ts = oid_to_ts.get(oid, "")
        if not ts:
            if bdate == "2024-08-25":
                ts = "2024-08-25 18:54:06"  # exact reward redemption timestamp for $0.00 Virginia Beach order
            elif bdate == "2026-11-22":
                ts = nov22_mp_ts
            else:
                ts = f"{bdate} 12:00:00"
        promos = promo_by_oid.get(oid, [])
        offer_types = sorted(set(pr["offer_type"] for pr in promos if pr["offer_type"]))
        promo_label = promos[0]["desc"] if promos else ""
        # Store metadata (privacy-scrubbed)
        if sn in STORE_META:
            city, state, lat, lon, owner = STORE_META[sn]
        else:
            # Nov 22, 2026 order not yet synced to Restaurant location characteristics (Boston Mixpanel IP)
            city, state, lat, lon, owner = ("Greater Boston, MA", "MA", 42.3601, -71.0589, "franchise")
            sn = sn or "unsynced"

        tz = ZoneInfo(STATE_TZ.get(state, "America/New_York"))
        dt_loc = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).astimezone(tz)
        era = "nyc" if bdate < "2025-01-15" else ("philly" if bdate < "2026-01-01" else "boston")
        is_home = city in HOME_CITIES
        hop_mi = round(haversine_miles(prev_lat, prev_lon, lat, lon)) if prev_lat is not None else 0
        cum_mi += hop_mi
        cum_spend = round(cum_spend + spend, 2)
        cur_dt_d = datetime.strptime(bdate, "%Y-%m-%d")
        gap_days = (cur_dt_d - prev_bdate).days if prev_bdate is not None else 0
        prev_lat, prev_lon, prev_bdate = lat, lon, cur_dt_d

        # Tax/fee gap = round(spend * 100) - base_pts (only meaningful when in both POS & Loyalty)
        gap_pts = (round(spend * 100) - base_pts) if (in_pos and in_loy and base_pts > 0) else None
        gap_reason = None
        if gap_pts:
            if state == "PA" and gap_pts == 39:
                gap_reason = "Philadelphia beverage tax (26 oz × 1.5¢)"
            elif state == "PA" and gap_pts == 60:
                gap_reason = "Philadelphia beverage tax (40 oz × 1.5¢)"
            elif state == "PA" and gap_pts == 78:
                gap_reason = "Philadelphia beverage tax (2× 26 oz)"
            elif state == "MA" and gap_pts == 5:
                gap_reason = "Boston 5¢ checkout bag fee"
            elif state == "CA" and gap_pts == 10:
                gap_reason = "California 10¢ checkout bag fee"
            else:
                gap_reason = "Non-qualifying fee / rounding"

        overflow_order_num = None
        if p and str(p.get("Order Number", "")).startswith("-"):
            overflow_order_num = int(p["Order Number"])

        orders.append({
            "idx": idx,
            "date": bdate,
            "month": bdate[:7],
            "ts": ts,
            "local_date": dt_loc.strftime("%Y-%m-%d"),
            "local_hour": dt_loc.hour,
            "local_min": dt_loc.minute,
            "local_wd": dt_loc.weekday(),
            "local_hhmm": dt_loc.strftime("%H:%M"),
            "era": era,
            "is_home": is_home,
            "gap_days": gap_days,
            "hop_mi": hop_mi,
            "cum_mi": round(cum_mi),
            "cum_spend": cum_spend,
            "store": sn,
            "city": city,
            "state": state,
            "lat": lat,
            "lon": lon,
            "owner": owner,
            "spend": spend,
            "base_pts": base_pts,
            "bonus_pts": bonus_pts,
            "gap_pts": gap_pts,
            "gap_reason": gap_reason,
            "in_pos": in_pos,
            "in_loy": in_loy,
            "has_deal": len(promos) > 0,
            "offer_type": offer_types[0] if offer_types else None,
            "promo_desc": promo_label,
            "is_mobile": oid.startswith("FOE0016:2528362374"),
            "overflow_order_num": overflow_order_num,
        })

    # Attach Mixpanel telemetry (IP geolocation + scan-to-pay latency) to orders
    mixpanel_matches = []
    used_orders = set()
    for e in mcflow_rows:
        t = int(e["time"])
        dt_utc = datetime.fromtimestamp(t, tz=timezone.utc)
        d_utc = dt_utc.strftime("%Y-%m-%d")
        amt = round(float(e.get("total_amount") or 0), 2)
        tax = round(float(e.get("tax_amount") or 0), 2)
        # Match to order by date (+/-1d) and spend
        best = None
        for o in orders:
            if o["idx"] in used_orders:
                continue
            dd = abs((datetime.strptime(o["date"], "%Y-%m-%d") - datetime.strptime(d_utc, "%Y-%m-%d")).days)
            if dd <= 1 and abs(o["spend"] - amt) < 0.02:
                best = o
                break
        nearby = [
            x for x in events
            if x["event_name"] not in ("mcflow_purchase", "offer_association", "offer_redemption")
            and -600 <= (int(x["time"]) - t) <= 120
        ]
        ip_reg = next((x["$region"] for x in reversed(nearby) if x["$region"]), "")
        ip_city = next((x["$city"] for x in reversed(nearby) if x["$city"]), "")
        scans = [int(x["time"]) for x in nearby if x["event_name"] in ("Viewed Loyalty > Scan Pass", "Viewed QR Code Screen View")]
        scan_s = (t - scans[0]) if scans else None
        app_s = (t - int(nearby[0]["time"])) if nearby else None
        sdk = "new" if any(x["event_name"] == "Viewed QR Code Screen View" for x in nearby) else "legacy"

        ip_label, ip_lat, ip_lon = IP_COORDS.get((ip_city, ip_reg), (f"{ip_reg} (IP)", 39.8, -98.5))
        if best:
            used_orders.add(best["idx"])
            best["tax"] = tax
            best["scan_s"] = scan_s
            best["app_s"] = app_s
            best["sdk"] = sdk
            best["in_mixpanel"] = True
            # Only count the 33 orders whose store is in Restaurant location characteristics for state-mismatch accuracy
            known_store = best["store"] != "unsynced"
            wrong_state = known_store and bool(ip_reg) and (ip_reg != STATE_FULL.get(best["state"], ""))
            dist_mi = round(haversine_miles(best["lat"], best["lon"], ip_lat, ip_lon)) if known_store else 0
            best["ip_label"] = ip_label
            best["ip_state_wrong"] = wrong_state
            best["ip_err_mi"] = dist_mi if wrong_state else 0
            mixpanel_matches.append({
                "idx": best["idx"],
                "date": best["date"],
                "ts": dt_utc.strftime("%Y-%m-%d %H:%M:%S"),
                "spend": amt,
                "tax": tax,
                "city": best["city"],
                "state": best["state"],
                "lat": best["lat"],
                "lon": best["lon"],
                "known_store": known_store,
                "ip_label": ip_label,
                "ip_lat": ip_lat,
                "ip_lon": ip_lon,
                "wrong_state": wrong_state,
                "err_mi": dist_mi if wrong_state else 0,
                "scan_s": scan_s,
                "app_s": app_s,
                "sdk": sdk,
                "is_mobile": best["is_mobile"],
            })

    # Verify exact 13/33 IP mismatch rate
    known_mp = [m for m in mixpanel_matches if m["known_store"]]
    wrong_mp = [m for m in known_mp if m["wrong_state"]]
    assert len(known_mp) == 33 and len(wrong_mp) == 13, f"Expected 13/33 IP mismatches, got {len(wrong_mp)}/{len(known_mp)}"

    # Verify scan latencies across 33 kiosk visits (34 mcflow - 1 mobile order)
    kiosk_scans = sorted(m["scan_s"] for m in mixpanel_matches if m["scan_s"] is not None)
    assert len(kiosk_scans) == 33
    median_scan_s = int(statistics.median(kiosk_scans))

    # 3. MONTHLY TIMELINE (Aug 2022 .. Nov 2026 = 52 months)
    months = []
    y, mo = 2022, 8
    while (y, mo) <= (2026, 11):
        months.append(f"{y:04d}-{mo:02d}")
        mo += 1
        if mo == 13:
            y, mo = y + 1, 1

    monthly = []
    for ym in months:
        mc = [c for c in comms if c["month"] == ym]
        mo_ord = [o for o in orders if o["month"] == ym]
        monthly.append({
            "m": ym,
            "push": sum(1 for c in mc if c["channel"] == "push" and not c["transactional"]),
            "tx_push": sum(1 for c in mc if c["channel"] == "push" and c["transactional"]),
            "oas": sum(1 for c in mc if c["channel"] == "oas"),
            "iam": sum(1 for c in mc if c["channel"] == "iam"),
            "test": sum(1 for c in mc if c["test"]),
            "holdout": sum(1 for c in mc if c["holdout"]),
            "orders": len(mo_ord),
            "home_orders": sum(1 for o in mo_ord if o["is_home"]),
            "road_orders": sum(1 for o in mo_ord if not o["is_home"]),
            "spend": round(sum(o["spend"] for o in mo_ord), 2),
            "home_spend": round(sum(o["spend"] for o in mo_ord if o["is_home"]), 2),
            "road_spend": round(sum(o["spend"] for o in mo_ord if not o["is_home"]), 2),
            "pts": sum(o["base_pts"] + o["bonus_pts"] for o in mo_ord),
            "deals": sum(1 for o in mo_ord if o["has_deal"]),
            "notable": [
                {"ts": c["ts"], "ch": c["channel"], "name": c["name"], "ver": c["version"], "cohort": c["cohort"]}
                for c in mc
                if any(w in (c["name"] + c["version"] + c["cohort"]).upper() for w in [
                    "SAUCEBOSS", "GRANZHYPEBEAST", "GRIMACE", "TAYLOR", "NOSTALGIA",
                    "BURGERBUYERS", "PACKERS", "FAIRMONT", "HOLDOUT", "RANDOM_BUCKET", "NEARREADY", "PRIVACY_POLICY"
                ]) or c["channel"] in ("iam", "test")
            ][:3],
        })

    # 4. 17-SECOND OPT-OUT MICROSCOPE (June 20, 2024)
    optout_replay = [
        {"t": -113, "ts": "17:36:31", "actor": "app", "label": "iPhone registered in GMA", "detail": "First active session after 663 dormant days"},
        {"t": 0,    "ts": "17:38:24", "actor": "pos", "label": "First loyalty purchase ($9.99)", "detail": "Manhattan kiosk · 999 base pts + 1,500 welcome bonus"},
        {"t": 17,   "ts": "17:38:41", "actor": "user", "label": "Push notifications switched OFF", "detail": "Subscription ID 11 → Opt-In = N (17 seconds after paying)"},
        {"t": 34,   "ts": "17:38:58", "actor": "user", "label": "Delivery terms declined", "detail": "DoorDash TermsOfUse → Acceptance = N"},
        {"t": 42,   "ts": "17:39:06", "actor": "push", "label": "Transactional push still fires", "detail": "NearReadyNotification (1 of 4 summer order-ready pings; 0 marketing pushes ever again)"},
    ]

    # 5. DYNAMIC OFFER SHRINKFLATION (55 SO_* offers) + MAY 4 REWARD INFLATION (12 rewards)
    seg_offers = []
    for d in dig_off:
        nm = gf(d, "promotion", "name")
        if not nm.startswith("SO_"):
            continue
        # Parse start date YYMMDD from SO_YYMMDD-...
        dm = re.match(r"SO_(\d{2})(\d{2})(\d{2})-", nm)
        if not dm:
            continue
        start_ym = f"20{dm.group(1)}-{dm.group(2)}"
        start_d = f"20{dm.group(1)}-{dm.group(2)}-{dm.group(3)}"
        tier = next((t for t in ["V7-1", "V8-10", "M/L", "LOW", "H/M"] if t in nm), "other")
        # Extract item & discount %
        item, pct = None, None
        if "McFlurry" in nm:
            item = "McFlurry"
            pm = re.search(r"(\d+)%off", nm)
            pct = int(pm.group(1)) if pm else None
        elif "10pcNug" in nm:
            item = "10pc Nuggets"
            pm = re.search(r"(\d+)%off", nm)
            pct = int(pm.group(1)) if pm else (50 if "BOGO" in nm else None)
        elif "20pcNug" in nm:
            item = "20pc Nuggets"
            pm = re.search(r"(\d+)%off", nm)
            pct = int(pm.group(1)) if pm else None
        elif "DBCor6pc" in nm or "DblCBo6pc" in nm:
            item = "DBC / 6pc Nuggets"
            pm = re.search(r"(\d+)%off", nm)
            pct = int(pm.group(1)) if pm else (50 if "BOGO" in nm else None)
        elif "BOGONugg" in nm:
            item = "10pc Nuggets"
            pct = 50
        elif "99cCoffee" in nm:
            item = "99¢ Coffee"
            pct = None
        else:
            item = "Other BAU"
        seg_offers.append({
            "date": start_d,
            "month": start_ym,
            "tier": tier,
            "item": item,
            "pct": pct,
            "slug": nm,
        })
    seg_offers.sort(key=lambda x: (x["date"], x["item"] or ""))

    # Build monthly tier track (Jun 2024 .. Nov 2026) for Figure 2 staircase
    bau_months = []
    by_bau_m = defaultdict(list)
    for so in seg_offers:
        # Bucket BAU cycle start into canonical month (e.g. 2025-03-31 AprBAU -> 2025-04)
        bm = re.search(r"_(Jan|Feb|Mar|March|Apr|April|May|June|July|Aug|August|Sept|Oct|Nov|Dec)BAU_", so["slug"])
        m_map = {"Jan": 1, "Feb": 2, "Mar": 3, "March": 3, "Apr": 4, "April": 4, "May": 5, "June": 6,
                 "July": 7, "Aug": 8, "August": 8, "Sept": 9, "Oct": 10, "Nov": 11, "Dec": 12}
        if bm:
            yr = int(so["date"][:4])
            mo_num = m_map[bm.group(1)]
            if so["date"][5:7] == "12" and mo_num == 1:
                yr += 1
            canon_m = f"{yr:04d}-{mo_num:02d}"
        else:
            canon_m = so["month"]
        by_bau_m[canon_m].append(so)

    # Order counts per month for overlay
    ord_by_m = Counter(o["month"] for o in orders)
    for ym in [m for m in months if m >= "2024-06"]:
        items = by_bau_m.get(ym, [])
        # Determine dominant tier in that BAU cycle (ignore V8-10 duplicate coffee row)
        tiers = [it["tier"] for it in items if it["tier"] != "V8-10"]
        tier = Counter(tiers).most_common(1)[0][0] if tiers else None
        pct_map = {it["item"]: it["pct"] for it in items if it["pct"] is not None}
        bau_months.append({
            "m": ym,
            "tier": tier,
            "orders": ord_by_m[ym],
            "offers": [{"item": it["item"], "pct": it["pct"], "slug": it["slug"]} for it in items if it["tier"] != "V8-10"],
            "mcflurry": pct_map.get("McFlurry"),
            "nug10": pct_map.get("10pc Nuggets"),
            "nug20": pct_map.get("20pc Nuggets"),
            "dbc6": pct_map.get("DBC / 6pc Nuggets"),
        })

    # 12 Reward redemptions + May 4, 2026 inflation comparison
    rname_map = {r["Loyalty_Reward_ID"]: r["Reward_Name"].replace("\ufffd", "").strip() for r in reward_names_raw}
    rewards = []
    for r in rewards_raw:
        rid = r["Loyalty_Reward_ID"]
        ts = r["Customer_Reward_Redemption_Timestamp"][:19]
        pts = int(float(r["Point_Redeem_Quantity"]))
        rewards.append({
            "id": rid,
            "name": rname_map.get(rid, f"Reward {rid}"),
            "date": ts[:10],
            "ts": ts,
            "pts": pts,
            "post_deval": ts[:10] >= "2026-05-04",
        })
    rewards.sort(key=lambda r: r["ts"])
    assert sum(r["pts"] for r in rewards) == 50000

    # Accounting balance
    mcopco_bal = next(int(b["Loyalty_Point_Balance"]) for b in bal_raw if "MCOPCO" in b["Point_Account_Name"])
    mcopco_life = next(int(b["Lifetime_Points_Earned"]) for b in bal_raw if "MCOPCO" in b["Point_Account_Name"])
    fran_bal = next(int(b["Loyalty_Point_Balance"]) for b in bal_raw if "FRANCHISE" in b["Point_Account_Name"])
    fran_life = next(int(b["Lifetime_Points_Earned"]) for b in bal_raw if "FRANCHISE" in b["Point_Account_Name"])
    total_life = mcopco_life + fran_life
    total_redeemed = sum(r["pts"] for r in rewards)
    total_expired = sum(abs(e["pts"]) for e in expirations)
    total_bal = mcopco_bal + fran_bal
    assert total_life == 66701 and total_redeemed == 50000 and total_expired == 538 and total_bal == 16163
    assert total_life - total_redeemed - total_expired == total_bal
    # Verify Store #7889 LAX base earn equals exact 2,688 MCOPCO balance
    lax_pts = sum(o["base_pts"] for o in orders if o["store"] == "7889")
    assert lax_pts == mcopco_life == 2688, f"Expected LAX 2688 == MCOPCO {mcopco_life}"

    # 5b. EXACT RUNNING POINTS BANK LEDGER (0 -> peak -> 16,163 exact!)
    # Group same-second REWARD STORE debits so base+bonus split redemptions appear as one reward event
    raw_ledger = []
    reward_by_approx_ts = {}
    for rw in rewards:
        t_sec = int(datetime.strptime(rw["ts"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
        reward_by_approx_ts[t_sec] = rw

    red_buckets: dict[str, int] = defaultdict(int)
    for lp in loy_pts:
        q = int(float(lp.get("Point_Mod_Quantity") or 0))
        ts = lp.get("Last_Updated_Date_UTC", "")[:19]
        pt = lp.get("Point_Type_Name", "")
        ch = lp.get("Point_Change_Name", "")
        sn = lp.get("Store_Number", "")
        if not ts or q == 0:
            continue
        if q < 0 and ch == "REWARD STORE":
            red_buckets[ts] += q
        elif q < 0:
            raw_ledger.append({"ts": ts, "date": ts[:10], "delta": q, "kind": "expire", "label": f"Points expired ({q} pts)", "reward_id": None})
        else:
            city_lbl = STORE_META.get(sn, ("Greater Boston, MA",))[0] if sn else ""
            if pt != "Base Earn":
                lbl = "Welcome Bonus (+1,500)" if q == 1500 else f"Aug 2025 2× Bonus (+{q})"
                kind = "bonus"
            elif sn == "7889":
                lbl = f"LAX MCOPCO (+{q})"
                kind = "mcopco"
            else:
                lbl = f"{city_lbl} (+{q})"
                kind = "earn"
            raw_ledger.append({"ts": ts, "date": ts[:10], "delta": q, "kind": kind, "label": lbl, "reward_id": None})

    for ts, q in sorted(red_buckets.items()):
        t_sec = int(datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
        matched_rw = None
        for rts, rw in reward_by_approx_ts.items():
            if abs(rts - t_sec) <= 35 and rw["pts"] == abs(q):
                matched_rw = rw
                break
        r_lbl = f"Redeemed {matched_rw['name']} (ID {matched_rw['id']})" if matched_rw else f"Reward redemption ({q})"
        raw_ledger.append({
            "ts": ts, "date": ts[:10], "delta": q, "kind": "redeem",
            "label": r_lbl, "reward_id": matched_rw["id"] if matched_rw else None,
            "post_deval": ts[:10] >= "2026-05-04",
        })
    raw_ledger.sort(key=lambda x: (x["ts"], 0 if x["delta"] > 0 else 1))
    bal_run = 0
    fran_run = 0
    mcopco_run = 0
    points_ledger = []
    for ev in raw_ledger:
        bal_run += ev["delta"]
        if ev["kind"] == "mcopco":
            mcopco_run += ev["delta"]
        else:
            fran_run += ev["delta"]
        points_ledger.append({**ev, "bal": bal_run, "fran_bal": fran_run, "mcopco_bal": mcopco_run})
    assert points_ledger[-1]["bal"] == total_bal == 16163, f"Ledger mismatch: {points_ledger[-1]['bal']}"
    assert points_ledger[-1]["mcopco_bal"] == mcopco_bal == 2688
    assert points_ledger[-1]["fran_bal"] == fran_bal == 13475
    peak_pts_balance = max(ev["bal"] for ev in points_ledger)

    # 5c. PERSONAL RHYTHM (LOCAL HOUR x WEEKDAY x HOME vs ROAD)
    wd_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    by_hour = [{"h": h, "total": 0, "home": 0, "road": 0, "deals": 0, "orders": []} for h in range(24)]
    by_weekday = [{"wd": w, "name": wd_names[w], "total": 0, "home": 0, "road": 0, "orders": []} for w in range(7)]
    wh_cells = {}
    for o in orders:
        h = o["local_hour"]
        w = o["local_wd"]
        by_hour[h]["total"] += 1
        by_hour[h]["home" if o["is_home"] else "road"] += 1
        by_hour[h]["deals"] += int(o["has_deal"])
        by_hour[h]["orders"].append(o["idx"])
        by_weekday[w]["total"] += 1
        by_weekday[w]["home" if o["is_home"] else "road"] += 1
        by_weekday[w]["orders"].append(o["idx"])
        k = (w, h)
        if k not in wh_cells:
            wh_cells[k] = {"wd": w, "h": h, "total": 0, "home": 0, "road": 0, "orders": []}
        wh_cells[k]["total"] += 1
        wh_cells[k]["home" if o["is_home"] else "road"] += 1
        wh_cells[k]["orders"].append(o["idx"])

    rhythm = {
        "by_hour": by_hour,
        "by_weekday": by_weekday,
        "matrix": sorted(wh_cells.values(), key=lambda c: (c["wd"], c["h"])),
        "insights_dayparts": [
            {"label": "Dinner", "n": int(ins["Dinner Customer Visits"])},
            {"label": "Lunch", "n": int(ins["Lunch Customer Visits"])},
            {"label": "Evening", "n": int(ins["Evening Customer Visits"])},
            {"label": "Breakfast", "n": int(ins["Breakfast Customer Visits"])},
            {"label": "Snack", "n": int(ins["Snack-Time Customer Visits"])},
            {"label": "Late-Night", "n": int(ins["Late-Night Customer Visits"])},
        ],
        "urban_rural": [
            {"label": "Urban", "n": int(ins["Urban Location Transaction Count"])},
            {"label": "Rural / Highway", "n": int(ins["Rural Location Transaction Count"])},
            {"label": "Suburban", "n": int(ins["Suburban Location Transaction Count"])},
        ],
        "avg_items": float(ins["Average Non-Miscellaneous Items per Order"]),
        "max_items": int(ins["Maximum Non-Miscellaneous Items in One Order"]),
        "highest_order": float(ins["Highest Order Amount"]),
        "purchase_days": int(ins["Number of Purchase Days"]),
        "avg_per_day": float(ins["Average Spend per Purchase Day"]),
    }

    # 5d. CURATED ROAD-TRIP & LIFE-CHAPTER POSTCARDS (for 3D Atlas interactive tour)
    trips = [
        {
            "key": "nyc", "title": "I · NYC & Jersey City", "dates": "Jun–Dec 2024",
            "yaw": -0.34, "pitch": 0.84, "dist": 1.48, "cx": 0.90, "cz": -0.18,
            "cities": ["Manhattan, NY", "Jersey City, NJ", "Hoboken, NJ", "Newburgh, NY"],
            "story": "14 home orders around Manhattan & Jersey City — the $5 Meal Deal era, kicked off by a $9.99 kiosk meal and a 17-second push opt-out.",
        },
        {
            "key": "philly", "title": "II · Philadelphia Hub", "dates": "Aug 2024–Dec 2025",
            "yaw": -0.32, "pitch": 0.84, "dist": 1.45, "cx": 0.85, "cz": -0.12,
            "cities": ["Philadelphia, PA"],
            "story": "15 visits (including 4 in 7 days in June 2025, three at exactly $11.78). Every single order reveals Philadelphia's 1.5¢/oz soda tax inside loyalty points.",
        },
        {
            "key": "maine", "title": "Maine Border & New England", "dates": "Mar 2025–Aug 2026",
            "yaw": -0.36, "pitch": 0.82, "dist": 1.38, "cx": 0.98, "cz": -0.36,
            "cities": ["Calais, ME", "Bangor, ME", "Gorham, NH", "North Conway, NH", "Littleton, NH", "Concord, NH", "Worcester, MA", "Manchester, CT"],
            "story": "From the Canadian border in Calais, ME to a July 12 White Mountains double-header (Gorham 8:59 am breakfast + North Conway 3:15 pm) and a $18.79 stop in CT.",
        },
        {
            "key": "chicago", "title": "Chicago Global HQ", "dates": "Feb 15–16, 2026",
            "yaw": -0.16, "pitch": 0.80, "dist": 1.62, "cx": 0.36, "cz": -0.16,
            "cities": ["Chicago Global HQ, IL", "Chesterton, IN"],
            "story": "Broke a 75-day winter dry spell at McDonald's Global HQ restaurant ($8.99), ordering Spain's Chocolate Hazelnut McPops — the pastry that broke the Cake ML model.",
        },
        {
            "key": "west", "title": "Houston, Wyoming & Minnesota", "dates": "Jul–Oct 2026",
            "yaw": 0.08, "pitch": 0.76, "dist": 2.05, "cx": -0.25, "cz": 0.04,
            "cities": ["Houston (NASA Pkwy), TX", "Douglas, WY", "Hinckley, MN"],
            "story": "Three long-haul 2026 trips spanning Space Center Houston, a September Black Hills run through Douglas, WY, and a Saturday morning breakfast stop in Hinckley, MN.",
        },
        {
            "key": "lax", "title": "LAX Corporate Store #7889", "dates": "Oct 13–15, 2026",
            "yaw": 0.28, "pitch": 0.76, "dist": 1.62, "cx": -0.78, "cz": 0.14,
            "cities": ["Los Angeles (LAX), CA", "Sunnyvale, CA"],
            "story": "Four visits in 72 hours (including a 10:12 pm PT late-night stop) at my ONLY corporate-owned (MCOPCO) restaurant — earning 2,688 separate points to the exact digit.",
        },
    ]

    # 6. LOCATIONS SUMMARY (aggregated by display_city for clean 3D map, folding 7 Greater Boston stores)
    city_agg: dict[tuple[str, str], dict] = {}
    for o in orders:
        key = (o["city"], o["state"])
        if key not in city_agg:
            city_agg[key] = {
                "city": o["city"],
                "state": o["state"],
                "lat": o["lat"],
                "lon": o["lon"],
                "visits": 0,
                "spend": 0.0,
                "pts": 0,
                "stores": set(),
                "first": o["date"],
                "last": o["date"],
                "owner": o["owner"],
            }
        ca = city_agg[key]
        ca["visits"] += 1
        ca["spend"] = round(ca["spend"] + o["spend"], 2)
        ca["pts"] += o["base_pts"]
        if o["store"] != "unsynced":
            ca["stores"].add(o["store"])
        ca["first"] = min(ca["first"], o["date"])
        ca["last"] = max(ca["last"], o["date"])
    locations = []
    for ca in sorted(city_agg.values(), key=lambda x: (-x["visits"], x["first"])):
        locations.append({
            "city": ca["city"],
            "state": ca["state"],
            "lat": ca["lat"],
            "lon": ca["lon"],
            "visits": ca["visits"],
            "spend": ca["spend"],
            "pts": ca["pts"],
            "store_count": len(ca["stores"]),
            "first": ca["first"],
            "last": ca["last"],
            "is_mcopco": ca["owner"] == "mcopco",
            "note": (
                "Only corporate-owned (MCOPCO) restaurant · 2,688 pts exact" if ca["owner"] == "mcopco" else
                "Global HQ international menu · Spanish Chocolate Hazelnut McPops" if "Global HQ" in ca["city"] else
                "Home hub (7 metro stores folded)" if ca["city"] == "Greater Boston, MA" else
                "Former campus hub · 39¢ Philadelphia beverage tax visible in points" if ca["city"] == "Philadelphia, PA" else
                "First loyalty order (Jun 20, 2024)" if ca["city"] == "Manhattan, NY" else
                ""
            ),
        })

    # 7. ML MODELS (17 Product Preference + L3 actuals mapping + 14 Occasion Propensity + actuals + Insights 73.1% margin)
    l3_counts = {
        gf(x, "category"): {
            "d30": int(gf(x, "30") or 0),
            "d90": int(gf(x, "90") or 0),
            "d365": int(gf(x, "365") or 0),
        }
        for x in l3_hist
    }
    # Map Level-3 actual categories to the 17 ML Product Preference categories cleanly
    L3_TO_ML = {
        "Potato Sides": ["McDonalds French Fries", "Hash Browns"],
        "Burgers / Sandwiches": ["McDoubles", "McChickens", "Big Macs", "Filet-O-Fishes"],
        "Sharing and Bundles": ["Cross Menu Product Bundles"],
        "Ice Cream": ["McFlurries"],
        "Carbonated Beverages": ["Carbonated Soft Drinks"],
        "Nuggets": ["Chicken McNuggets"],
        "Coffee": ["Hot Brewed Coffees"],
        "Breakfast Sandwiches": ["McMuffins"],
        "Non-Food Products": ["Merchandise"],
        "Non-Carbonated Beverages": ["Refreshers"],
        "Cakes": [],  # 0 cakes/hotcakes! (Only 1 Spanish McPop pastry at Chicago HQ)
        "Other Breakfast": [],
        "Breakfast Multiple Product Bundles": [],
        "Dessert Pies": [],
        "Teas": [],
        "Wraps": [],
        "Other Sides": [],
    }
    ml_products = []
    for m in ml_pref:
        cat = gf(m, "category") or gf(m, "product")
        p30 = float(gf(m, "30") or 0)
        p90 = float(gf(m, "90") or 0)
        mapped = L3_TO_ML.get(cat, [])
        a365 = sum(l3_counts.get(k, {}).get("d365", 0) for k in mapped)
        a90 = sum(l3_counts.get(k, {}).get("d90", 0) for k in mapped)
        note = ""
        if cat == "Cakes":
            note = "0 Cake orders in 365 days (likely triggered by 1 Spanish McPop pastry at Chicago HQ)"
        elif cat == "Coffee":
            note = "1 Hot Brewed Coffee in 365 days · +20pp impossible inversion"
        elif p30 > p90:
            note = f"Impossible: P(30d) exceeds P(90d) by +{round((p30 - p90)*100)}pp"
        ml_products.append({
            "cat": cat,
            "p30": round(p30, 2),
            "p90": round(p90, 2),
            "actual_365": a365,
            "actual_90": a90,
            "impossible": p30 > p90,
            "note": note,
        })
    ml_products.sort(key=lambda x: (-x["p30"], -x["p90"]))
    assert sum(1 for x in ml_products if x["impossible"]) == 5

    # 14 Occasion Propensity ML vs 9 actual occasion segments
    occ_act_map = {}
    for oh in occ_hist:
        nm = gf(oh, "segment", "name").lower().replace(" ", "_")
        occ_act_map[nm] = {
            "d30": int(gf(oh, "30") or 0),
            "d90": int(gf(oh, "90") or 0),
            "d365": int(gf(oh, "365") or 0),
        }
    ml_occasions = []
    for mo_row in ml_occ:
        slug = gf(mo_row, "occasion", "segment")
        p30_s = gf(mo_row, "30")
        p90_s = gf(mo_row, "90")
        p30 = round(float(p30_s), 2) if p30_s else None
        p90 = round(float(p90_s), 2) if p90_s else None
        act = occ_act_map.get(slug, {"d30": 0, "d90": 0, "d365": 0})
        ml_occasions.append({
            "slug": slug,
            "label": slug.replace("_", " ").capitalize(),
            "p30": p30,
            "p90": p90,
            "actual_365": act["d365"],
            "actual_90": act["d90"],
        })
    ml_occasions.sort(key=lambda x: (-(x["actual_365"]), -(x["p90"] or 0)))

    # 7b. MENU DNA (All 18 Level-3 categories + RFM Top 15 + Monopoly prizes + Price points)
    TRAY_META = {
        "Carbonated Soft Drinks": ("drink", "Core quartet · paired with nearly every meal"),
        "McDonalds French Fries": ("fries", "Core quartet · #1 redeemed reward (7× free fries)"),
        "Chicken McNuggets": ("nuggets", "Core quartet · locked 1:1 with 27 Dips / Sauces"),
        "Dips / Sauces": ("dip", "Exact 27-for-27 pairing with Chicken McNuggets"),
        "McDoubles": ("burger", "Value backbone · exact 16-for-16 match with $5 Meal Deals"),
        "Cross Menu Product Bundles": ("bundle", "Exact 16-for-16 match with McDoubles ($5 Meal Deals)"),
        "Restaurant Operations": ("ops", "Hidden fee category · Philly drink tax + LA/Boston bag fees"),
        "McFlurries": ("mcflurry", "Mini Oreo & Mini Derpy McFlurry (#1 RFM rank)"),
        "McChickens": ("burger", "Appears in $5 McChicken Meal Deals"),
        "Big Macs": ("burger", "Occasional classic splurge (4× in 365d)"),
        "Hash Browns": ("breakfast", "Exact 3-for-3 road-trip breakfast pair with McMuffins"),
        "McMuffins": ("breakfast", "100% road-trip morning stops (Gorham NH, Hinckley MN, Littleton NH)"),
        "Filet-O-Fishes": ("burger", "Twice in 365 days"),
        "Merchandise": ("rare", "Collector tie-in promo merch (2×)"),
        "Other Condiments": ("dip", "Extra condiment packs (2×)"),
        "Hot Brewed Coffees": ("breakfast", "1 coffee all year — yet ML says 52% in 30d vs 32% in 90d"),
        "McPops": ("rare", "Spain's Chocolate Hazelnut McPops at Chicago Global HQ (likely triggered 100% Cake ML!)"),
        "Refreshers": ("drink", "1 specialty refresher all year"),
    }
    menu_categories = []
    for k, v in sorted(l3_counts.items(), key=lambda kv: (-kv[1]["d365"], kv[0])):
        grp, note = TRAY_META.get(k, ("other", ""))
        menu_categories.append({
            "name": k, "d30": v["d30"], "d90": v["d90"], "d365": v["d365"],
            "group": grp, "note": note,
        })
    prizes_raw = by_p("Description of prizes redeemed")
    menu_prizes = [
        {"name": p.get("Prize_Name", ""), "type": p.get("Prize_Type", "")}
        for p in prizes_raw
    ]
    amt_counts = Counter(round(o["spend"], 2) for o in orders)
    price_clusters = [{"amt": a, "n": n} for a, n in amt_counts.most_common(10)]
    menu = {
        "categories": menu_categories,
        "rfm_top15": [r.get("Recency, Frequency, Monetary Derived Top Products", "") for r in rfm_rows[:15]],
        "prizes": menu_prizes,
        "price_clusters": price_clusters,
    }

    # Insights Profit Margin & Channel Split (snapshot 2026-10-18)
    kiosk_sales = float(ins["Total Kiosk Paid Sales"])
    dt_sales = float(ins["Total Drive-Thru Paid Sales"])
    mob_sales = float(ins["Mobile Order and Pay Net Sales Amount"])
    other_sales = float(ins["Total Other Paid Sales"])
    total_paid_ins = round(kiosk_sales + dt_sales + mob_sales + other_sales, 2)
    profit_margin = float(ins["Profit Margin Amount"])
    margin_pct = round(100.0 * profit_margin / total_paid_ins, 1)
    assert total_paid_ins == 622.75 and profit_margin == 455.33 and margin_pct == 73.1

    # 8. FOUR REPLAYABLE MIXPANEL SESSIONS (privacy-scrubbed, concise event traces)
    def build_session_trace(date_str: str, h0: str, h1: str, title: str, subtitle: str, key_moment: str) -> dict:
        rows = []
        for e in events:
            dt = datetime.fromtimestamp(int(e["time"]), tz=timezone.utc)
            s = dt.strftime("%Y-%m-%d %H:%M:%S")
            if s.startswith(date_str) and h0 <= s[11:19] <= h1:
                rows.append((int(e["time"]), s, e))
        t0 = rows[0][0]
        steps = []
        for t, s, e in rows:
            en = e["event_name"]
            lane = "server" if en in ("mcflow_purchase", "offer_redemption", "offer_association", "Push Notification Sends") else "app"
            tag = "normal"
            detail = ""
            if en == "Error" or e.get("error.code") or e.get("error_code"):
                tag = "error"
                ec = e.get("error_code") or e.get("error.code")
                em = e.get("error_message") or e.get("error.message")
                detail = f"{ec}: {em}"
            elif en == "mcflow_purchase":
                tag = "pay"
                detail = f"Paid ${float(e['total_amount']):.2f} (+${float(e.get('tax_amount') or 0):.2f} tax)"
            elif en in ("Viewed Loyalty > Scan Pass", "Viewed QR Code Screen View"):
                tag = "scan"
                detail = "Displayed 4-digit / QR code at kiosk"
            elif en == "Ordering > Place Order":
                tag = "bug"
                cal = e.get("transaction.calories", "")
                detail = f"Logged transaction.calories = {int(cal):,}" if cal else "Placed mobile order"
            elif en in ("Product Action: remove_from_cart", "Ordering > Item Remove"):
                tag = "warn"
                pn = e.get("local_item_name") or e.get("product.name") or "basket item"
                detail = f"Removed {pn}"
            elif en == "Viewed Global > Splash":
                detail = f"Promo splash: {e.get('content.name', '')}"
            elif en == "Ordering > Item Add":
                detail = f"Added {e.get('product.name', '')}"
            elif en == "Offers > Deal Applied":
                detail = (e.get("offers.name") or "").replace("\n", " ")[:60]
            elif en == "offer_redemption":
                tag = "deal"
                detail = "Server redeemed digital offer"
            elif en == "Sign-In Successful":
                tag = "deal"
                detail = "Authenticated via Google OAuth"
            steps.append({
                "t": t - t0,
                "ts": s[11:19],
                "ev": en,
                "lane": lane,
                "tag": tag,
                "detail": detail,
            })
        return {
            "id": date_str,
            "title": title,
            "subtitle": subtitle,
            "key_moment": key_moment,
            "duration_s": rows[-1][0] - t0,
            "event_count": len(rows),
            "app_version": next((r[2].get("$app_version_string") for r in rows if r[2].get("$app_version_string") and r[2].get("$app_version_string") != "null"), ""),
            "steps": steps,
        }

    sessions = [
        build_session_trace(
            "2026-11-10", "22:45:00", "22:50:00",
            "Nov 10 · Ghost of Google+",
            "Logged out at kiosk → Error 41484 invokes Google+ (shut down Apr 2019)",
            "At +23s, Error 41484 instructs: \"please use Googleplus to login\"",
        ),
        build_session_trace(
            "2026-04-08", "23:20:00", "23:29:00",
            "Apr 8 · Only Mobile Order",
            "Lured by HUNTR/X splash → 2× CART_INVALID_ITEMS → 1,580,000 cal & int32 overflow",
            "Order ID 2528362374 overflowed signed 32-bit int to -1766604922",
        ),
        build_session_trace(
            "2026-08-30", "18:30:00", "18:37:00",
            "Aug 30 · Basket Bailout",
            "Built $1.99 Fries mobile order (2,150,000 cal), abandoned checkout for kiosk",
            "Tapped Place Order (+119s), bailed to Scan Pass (+146s), paid at kiosk (+263s)",
        ),
        build_session_trace(
            "2026-10-13", "18:30:00", "19:35:00",
            "Oct 13 · LAX Cart Purge",
            "Deleted 4 mobile cart items in 6s, then scanned kiosk at LAX corporate store 52m later",
            "4× remove_from_cart in 6 seconds (+37s..+43s) → kiosk order +52 min later",
        ),
    ]

    # 9. SIX UNSYNCHRONIZED SNAPSHOT CLOCKS
    clocks = [
        {"system": "Test & Learn Jobs", "date": "2022-10-25", "lag_days": 1491, "visits": None, "note": "4-year-old experiment table still bundled in a Nov 2026 PDF"},
        {"system": "Customer Insights Profile", "date": "2026-10-18", "lag_days": 37, "visits": 63, "note": "63 visits, 39 locations, $622.75 paid sales, $455.33 profit margin"},
        {"system": "ML & RFM Scoring", "date": "2026-10-29", "lag_days": 26, "visits": None, "note": "Product Preference (Cakes=100%), Churn (6% vs 3%), CLV ('Can't Lose'), RFM Top 15"},
        {"system": "Loyalty Attributes & History", "date": "2026-11-14", "lag_days": 10, "visits": 70, "note": "70 transactions & 36 store addresses; misses Nov 22 order, keeps Jul 6 2025 VA order"},
        {"system": "NSO Category Relevancy", "date": "2026-11-20", "lag_days": 4, "visits": None, "note": "Alternate category ranks (Fries, 10pc Nuggets, McFlurry) updated 4 days prior"},
        {"system": "POS Transaction Headers", "date": "2026-11-22", "lag_days": 2, "visits": 70, "note": "70 POS orders ($657.66); includes Nov 22 ($16.72), drops Jul 6 2025 VA order"},
        {"system": "Mixpanel Telemetry Export", "date": "2026-11-24", "lag_days": 0, "visits": 34, "note": "674 events (580 iPhone + 94 server mParticle), trailing 365 days through Nov 24"},
    ]

    overview = {
        "meta": {
            "account_created": "2022-08-27",
            "first_order": "2024-06-20",
            "dormant_days": 663,
            "optout_delay_s": 17,
            "export_date": "2026-11-24",
            "pdf_pages": 259,
            "pdf_sections": len(secs),
            "mixpanel_events": len(events),
            "mixpanel_client_events": sum(1 for e in events if e["event_name"] not in ("mcflow_purchase", "offer_association", "offer_redemption")),
            "mixpanel_server_events": sum(1 for e in events if e["event_name"] in ("mcflow_purchase", "offer_association", "offer_redemption")),
        },
        "summary": {
            "total_orders": len(orders),
            "pos_orders": len(pos_rows),
            "loy_orders": len(loy_tx),
            "pos_spend_extax": round(sum(float(p["Total Amount excluding tax"]) for p in pos_rows), 2),
            "total_spend_all": round(sum(o["spend"] for o in orders), 2),
            "median_spend": round(statistics.median(o["spend"] for o in orders), 2),
            "total_miles": round(cum_mi),
            "home_orders": sum(1 for o in orders if o["is_home"]),
            "road_orders": sum(1 for o in orders if not o["is_home"]),
            "home_deal_pct": round(100.0 * sum(1 for o in orders if o["in_pos"] and o["is_home"] and o["has_deal"]) / sum(1 for o in orders if o["in_pos"] and o["is_home"]), 1),
            "road_deal_pct": round(100.0 * sum(1 for o in orders if o["in_pos"] and (not o["is_home"]) and o["has_deal"]) / sum(1 for o in orders if o["in_pos"] and not o["is_home"]), 1),
            "breakfast_total": sum(by_hour[h]["total"] for h in range(5, 11)),
            "breakfast_road": sum(by_hour[h]["road"] for h in range(5, 11)),
            "dinner_peak_total": by_hour[18]["total"] + by_hour[19]["total"],
            "dinner_peak_home": by_hour[18]["home"] + by_hour[19]["home"],
            "longest_dry_spell": max(o["gap_days"] for o in orders),
            "peak_pts_balance": peak_pts_balance,
            "unique_stores": len(stores_raw),
            "states_visited": len(set(o["state"] for o in orders)),
            "deal_orders": sum(1 for o in orders if o["in_pos"] and o["has_deal"]),
            "deal_rate_pct": round(100.0 * sum(1 for o in orders if o["in_pos"] and o["has_deal"]) / len(pos_rows), 1),
            "comms_total": len(comms),
            "comms_pre": len(pre_comms),
            "comms_pre_push": pre_push,
            "comms_pre_fff": fff_count,
            "comms_post": len(post_comms),
            "comms_post_mkt_push": post_mkt_push,
            "comms_post_tx_push": post_tx_push,
            "comms_post_oas": post_oas,
            "comms_post_iam": post_iam,
            "comms_post_test": post_test,
            "pts_lifetime": total_life,
            "pts_franchise": fran_life,
            "pts_mcopco": mcopco_life,
            "pts_redeemed": total_redeemed,
            "pts_expired": total_expired,
            "pts_balance": total_bal,
            "insights_visits": int(ins["Total Customer Visits or Transactions"]),
            "insights_kiosk": int(ins["Kiosk Transaction Count"]),
            "insights_kiosk_pct": round(100.0 * int(ins["Kiosk Transaction Count"]) / int(ins["Total Customer Visits or Transactions"]), 1),
            "insights_mobile": int(ins["Mobile Order and Pay Transaction Count"]),
            "insights_drivethru": int(ins["Drive-Thru Transaction Count"]),
            "insights_cash": int(ins["Cash Transaction Count"]),
            "insights_paid_sales": total_paid_ins,
            "insights_profit_margin": profit_margin,
            "insights_margin_pct": margin_pct,
            "ip_matched": len(known_mp),
            "ip_wrong_state": len(wrong_mp),
            "ip_wrong_pct": round(100.0 * len(wrong_mp) / len(known_mp), 1),
            "ip_max_err_mi": max(m["err_mi"] for m in wrong_mp),
            "median_scan_s": median_scan_s,
            "min_scan_s": min(kiosk_scans),
            "max_scan_s": max(kiosk_scans),
            "ml_impossible_cats": sum(1 for x in ml_products if x["impossible"]),
        },
        "monthly": monthly,
        "optout_replay": optout_replay,
        "bau_months": bau_months,
        "rewards": rewards,
        "devaluation": [
            {"item": "Medium French Fries", "before": 3000, "after": 3500, "pct": 16.7, "same_id": False, "note": "Jul–Aug 2024 vs Jul 21, 2026"},
            {"item": "Large French Fries", "before": 4500, "after": 5000, "pct": 11.1, "same_id": True, "note": "Identical Reward ID 1137: Apr 15 → Jun 3, 2026"},
            {"item": "10 pc. McNuggets", "before": 6000, "after": 7000, "pct": 16.7, "same_id": False, "note": "Pre-May 4 tier vs Jul 12, 2026 redemption"},
        ],
        "expirations": expirations,
        "points_ledger": points_ledger,
        "rhythm": rhythm,
        "menu": menu,
        "trips": trips,
        "locations": locations,
        "orders": [
            {
                "idx": o["idx"], "date": o["date"], "month": o["month"],
                "local_date": o["local_date"], "local_hour": o["local_hour"], "local_min": o["local_min"],
                "local_wd": o["local_wd"], "local_hhmm": o["local_hhmm"],
                "era": o["era"], "is_home": o["is_home"],
                "gap_days": o["gap_days"], "hop_mi": o["hop_mi"], "cum_mi": o["cum_mi"], "cum_spend": o["cum_spend"],
                "city": o["city"], "state": o["state"],
                "lat": o["lat"], "lon": o["lon"], "spend": o["spend"],
                "base_pts": o["base_pts"], "bonus_pts": o["bonus_pts"],
                "gap_pts": o["gap_pts"], "gap_reason": o["gap_reason"], "owner": o["owner"],
                "has_deal": o["has_deal"], "offer_type": o["offer_type"], "is_mobile": o["is_mobile"],
                "in_pos": o["in_pos"], "in_loy": o["in_loy"],
            }
            for o in orders
        ],
        "mixpanel_orders": mixpanel_matches,
        "ml": {
            "clv_segment": clv_row.get("Value Progression Segment (Next 30 Days)", "Can't Lose"),
            "tactical_segment": clv_row.get("Tactical Segment Based on Spending & Visits (Next 30 Days)", "Mid-Tiers"),
            "value_trend": clv_row.get("Value Trend of Customer (Next 30 Days)", "Downgraded"),
            "pred_aov": float(clv_row.get("Predicted Average Order Value (Next 30 Days)", 12.35)),
            "pred_visits_30": float(clv_row.get("Predicted Visit Frequency (Next 30 Days)", 3.27)),
            "pred_visits_90": float(clv_row.get("Predicted Visit Frequency (Next 90 Days)", 8.83)),
            "churn_30": float(churn_row.get("Churn Probability of Customer (Next 30 Days)", 0.06)),
            "churn_90": float(churn_row.get("Churn Probability of Customer (Next 90 Days)", 0.03)),
            "est_churn_days": int(float(churn_row.get("Estimated Days Until Customer Churns", 365))),
            "ltv_6wk": float(ltv_rows[0].get("Predicted Spend (Next 6 Weeks)", 76.91)) if ltv_rows else 76.91,
            "rfm_top": [r.get("Recency, Frequency, Monetary Derived Top Products", "") for r in rfm_rows[:10]],
            "products": ml_products,
            "occasions": ml_occasions,
            "l3_ops_count": l3_counts.get("Restaurant Operations", {}).get("d365", 17),
        },
        "sessions": sessions,
        "clocks": clocks,
    }
    return overview


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scratch", type=Path, default=DEFAULT_SCRATCH)
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    data = build_overview(args.scratch)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    size_kb = args.out.stat().st_size / 1024
    s = data["summary"]
    print(f"Wrote {args.out} ({size_kb:.1f} KB)")
    print(f"  Orders: {s['total_orders']} ({s['pos_orders']} POS, ${s['pos_spend_extax']}, {s['deal_rate_pct']}% deal rate)")
    print(f"  Comms:  {s['comms_total']} (pre={s['comms_pre']}, pre_push={s['comms_pre_push']}, FFF={s['comms_pre_fff']} | post={s['comms_post']}, post_mkt_push={s['comms_post_mkt_push']}, tx_push={s['comms_post_tx_push']}, OAS={s['comms_post_oas']}, IAM={s['comms_post_iam']}, test={s['comms_post_test']})")
    print(f"  Points: {s['pts_lifetime']} = {s['pts_franchise']} Fran + {s['pts_mcopco']} MCOPCO - {s['pts_redeemed']} red - {s['pts_expired']} exp = {s['pts_balance']}")
    print(f"  Margin: ${s['insights_profit_margin']} / ${s['insights_paid_sales']} = {s['insights_margin_pct']}% ({s['insights_kiosk']}/{s['insights_visits']} kiosk = {s['insights_kiosk_pct']}%)")
    print(f"  IP Err: {s['ip_wrong_state']}/{s['ip_matched']} ({s['ip_wrong_pct']}%), max={s['ip_max_err_mi']} mi | Scan median={s['median_scan_s']}s ({s['min_scan_s']}..{s['max_scan_s']}s)")


if __name__ == "__main__":
    main()
