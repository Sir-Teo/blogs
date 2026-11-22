#!/usr/bin/env python3
"""
Builds assets/data/riemann-hypothesis/atlas.json for the upgraded Radial Proof Singularity:
  - Center (0, 0): Main.lean (12 lines, 5 exported theorems).
  - Inner 360-degree mandala (r = 76..330): all 109 verified Lean declarations
    and 113 dependency call arcs from nasqret/riemann-rev (model.json), spread
    harmoniously across the full 360 degrees by concentric distance from Main.lean
    with generous spacing (zero clumping!), plus verbatim Lean 4 code excerpts,
    hypotheses, and verification tiers.
  - Outer 360-degree cosmic ring (r = 392..688): all 3,614 real Lean directories
    covering all 175,187 .lean files at pinned commit 40e56bab, arranged into
    12 radial libraries with non-crossing polar dendrogram branches and exact
    direct file counts so the browser renders all 175,187 individual .lean stars.
"""
from __future__ import annotations
import json
import math
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path("/Users/teo/Developer/blogs")
TREELESS = Path("/Users/teo/.gemini/antigravity/brain/f0c3fec5-2ac3-4c37-98db-0a81dfbd4a73/scratch/rh-treeless")
MODEL_JSON = Path("/Users/teo/.gemini/antigravity/brain/f0c3fec5-2ac3-4c37-98db-0a81dfbd4a73/scratch/riemann-rev/data/model.json")
OUT = REPO_ROOT / "assets/data/riemann-hypothesis/atlas.json"
COMMIT = "40e56bab026552e089d7afcfeff08d2defb9c005"

TERRITORIES = [
    ("Development/AbelianVarietyTheory",      "AbelianVarietyTheory",      "AbelianVariety",   "amber"),
    ("Development/AutomorphicArithmetic",     "AutomorphicArithmetic",     "AutomorphicArith", "orange"),
    ("Formalism",                             "Formalism",                 "Formalism",        "blue"),
    ("Development/AutomorphicSpectrum",       "AutomorphicSpectrum",       "AutomorphicSpec",  "gold"),
    ("Development/WeilBound",                 "WeilBound",                 "WeilBound",        "orange"),
    ("GroundTheory",                          "GroundTheory",              "GroundTheory",     "good"),
    ("ReciprocityTheory",                     "ReciprocityTheory",         "Reciprocity",      "violet"),
    ("CompanionTheory",                       "CompanionTheory",           "Companion",        "teal"),
    ("Development/EtaleCohomology",           "EtaleCohomology",           "EtaleCohom",       "amber"),
    ("Development/ResolutionOfSingularities", "ResolutionOfSingularities", "Resolution",       "orange"),
    ("PositivityTheory",                      "PositivityTheory",          "Positivity",       "violet"),
    ("__misc__",                              "Discrete · Lemmata · Root", "Root & Misc",      "slate"),
]

TWO_PI = 2.0 * math.pi


def territory_of(path: str) -> int:
    for idx, (pref, _, _, _) in enumerate(TERRITORIES):
        if pref != "__misc__" and (path == pref or path.startswith(pref + "/")):
            return idx
    return len(TERRITORIES) - 1


def norm_angle(a: float) -> float:
    return a % TWO_PI


def ang_diff(a: float, b: float) -> float:
    return (b - a + math.pi) % TWO_PI - math.pi


def trim_excerpt(text: str, max_lines: int = 6, max_chars: int = 420) -> str:
    if not text:
        return ""
    lines = [ln.rstrip() for ln in text.strip().splitlines() if ln.strip()]
    out = "\n".join(lines[:max_lines])
    if len(out) > max_chars:
        out = out[: max_chars - 1].rstrip() + "…"
    return out


def main():
    # 1. Exact 175,187 .lean file paths from pinned commit 40e56bab
    raw = subprocess.check_output(
        ["git", "-C", str(TREELESS), "-c", "core.quotePath=false", "ls-tree", "-r", "--name-only", COMMIT, "src/"],
        text=True,
    ).splitlines()
    lean_files = [p[4:] for p in raw if p.endswith(".lean")]
    assert len(lean_files) == 175187, f"Expected 175187 .lean files, got {len(lean_files)}"

    dir_total = Counter()
    dir_direct = Counter()
    dir_files = defaultdict(list)
    dir_samples = defaultdict(list)
    all_dirs = set()
    for p in lean_files:
        parts = p.split("/")
        parent = "/".join(parts[:-1]) if len(parts) > 1 else ""
        stem = parts[-1][:-5]
        assert "," not in stem and ":" not in stem and "\t" not in stem, f"Bad char in {stem}"
        dir_direct[parent] += 1
        dir_files[parent].append(stem)
        if len(dir_samples[parent]) < 3:
            dir_samples[parent].append(stem)
        if parent == "":
            all_dirs.add("")
            dir_total[""] += 1
        else:
            for k in range(1, len(parts)):
                d = "/".join(parts[:k])
                all_dirs.add(d)
                dir_total[d] += 1
    for fns in dir_files.values():
        fns.sort()

    sorted_dirs = sorted(d for d in all_dirs if d != "Development")
    assert "" in sorted_dirs
    dir_idx = {d: i for i, d in enumerate(sorted_dirs)}

    children_of = defaultdict(list)
    parent_of = {}
    for d in sorted_dirs:
        if d == "" or "/" not in d:
            parent_of[d] = None
        else:
            par = d.rsplit("/", 1)[0]
            if par == "Development":
                parent_of[d] = None
            else:
                parent_of[d] = par
                children_of[par].append(d)

    terr_roots = defaultdict(list)
    terr_files = Counter()
    terr_dir_cnt = Counter()
    for d in sorted_dirs:
        ti = territory_of(d)
        terr_dir_cnt[ti] += 1
        if parent_of[d] is None:
            terr_roots[ti].append(d)
            terr_files[ti] += dir_total[d]
    assert sum(terr_files.values()) == 175187

    # 2. Allocate 360-degree angular wedges for all 12 territories
    gap = 0.026
    usable = TWO_PI - gap * len(TERRITORIES)
    weights = [terr_files[i] ** 0.62 for i in range(len(TERRITORIES))]
    w_sum = sum(weights)

    cur_ang = math.radians(148.0)
    terr_out = []
    terr_arc = {}
    for i, (pref, label, short, col_key) in enumerate(TERRITORIES):
        span = usable * (weights[i] / w_sum)
        a0, a1 = cur_ang, cur_ang + span
        terr_arc[i] = (a0, a1)
        terr_out.append({
            "id": pref,
            "label": label,
            "short": short,
            "files": terr_files[i],
            "dirs": terr_dir_cnt[i],
            "pct": round(100.0 * terr_files[i] / 175187.0, 2),
            "color": col_key,
            "a0": round(a0, 4),
            "a1": round(a1, 4),
        })
        cur_ang = a1 + gap

    sub_depth = {}
    def get_sub_depth(d):
        if d in sub_depth:
            return sub_depth[d]
        kids = children_of[d]
        val = 0 if not kids else 1 + max(get_sub_depth(k) for k in kids)
        sub_depth[d] = val
        return val
    for d in sorted_dirs:
        get_sub_depth(d)

    # 3. Recursive polar dendrogram inside each angular territory [a0, a1] x [R_IN, R_OUT]
    R_IN = 396.0
    R_OUT = 686.0
    pos_dir = {}
    mega_labels = []

    def layout_polar(d, a0, a1, r_cur, depth_left):
        am = 0.5 * (a0 + a1)
        f_tot = dir_total[d]
        f_dir = dir_direct[d]
        span_a = max(0.002, a1 - a0)
        kids = children_of[d]

        if not kids:
            rad = r_cur
            spread_a = min(span_a * 0.44, 0.068)
            spread_r = min(48.0, 12.0 + 9.2 * math.log10(1.0 + f_dir))
            r_dot = min(7.2, max(1.0, 1.0 + 1.25 * math.log10(1.0 + f_dir)))
            x, y = rad * math.cos(am), rad * math.sin(am)
            pos_dir[d] = (x, y, r_dot, am, rad, spread_a, spread_r)
            return

        r_dot = min(5.4, max(1.2, 1.1 + 0.85 * math.log10(1.0 + f_tot)))
        x, y = r_cur * math.cos(am), r_cur * math.sin(am)
        pos_dir[d] = (x, y, r_dot, am, r_cur, min(span_a * 0.25, 0.03), 12.0)

        kids_sorted = sorted(kids, key=lambda k: -dir_total[k])
        ordered = []
        for idx_k, k in enumerate(kids_sorted):
            if idx_k % 2 == 0:
                ordered.append(k)
            else:
                ordered.insert(0, k)

        kw = [max(1.0, dir_total[k]) ** 0.72 for k in ordered]
        kw_sum = sum(kw)
        pad_a = min(0.004, span_a * 0.02)
        inner_span = max(0.001, span_a - 2 * pad_a)
        ca = a0 + pad_a

        rem_r = max(14.0, R_OUT - r_cur)
        step_r = rem_r / max(1.0, depth_left)

        for idx_k, k in enumerate(ordered):
            ks = inner_span * (kw[idx_k] / kw_sum)
            ka0, ka1 = ca, ca + ks
            ca = ka1
            k_kids = children_of[k]
            if not k_kids:
                stagger = ((idx_k * 0.61803398875) % 1.0)
                if dir_direct[k] >= 1500:
                    kr = r_cur + rem_r * (0.48 + 0.34 * stagger)
                else:
                    kr = r_cur + rem_r * (0.28 + 0.68 * stagger)
                layout_polar(k, ka0, ka1, min(R_OUT - 10.0, kr), 0)
            else:
                next_r = r_cur + max(24.0, min(72.0, step_r * (0.85 + 0.3 * ((idx_k * 0.618) % 1.0))))
                layout_polar(k, ka0, ka1, min(R_OUT - 38.0, next_r), max(1, sub_depth[k]))

    for ti in range(len(TERRITORIES)):
        a0, a1 = terr_arc[ti]
        roots = terr_roots[ti]
        if len(roots) == 1:
            r0 = roots[0]
            layout_polar(r0, a0, a1, R_IN, max(1, sub_depth[r0]))
        else:
            rw = [max(1.0, dir_total[r]) ** 0.72 for r in roots]
            rws = sum(rw)
            ca = a0
            for idx_r, r0 in enumerate(roots):
                rs = (a1 - a0) * (rw[idx_r] / rws)
                layout_polar(r0, ca, ca + rs, R_IN + 12.0, max(1, sub_depth[r0]))
                ca += rs

    assert len(pos_dir) == len(sorted_dirs)

    for d in sorted_dirs:
        if dir_direct[d] >= 1800:
            x, y, _, am, rad, _, _ = pos_dir[d]
            mega_labels.append({
                "idx": dir_idx[d],
                "label": d.rsplit("/", 1)[-1],
                "files": dir_direct[d],
                "x": round(x, 1),
                "y": round(y, 1),
            })
    mega_labels.sort(key=lambda m: -m["files"])

    dirs_packed = []
    for d in sorted_dirs:
        p = parent_of[d]
        p_idx = dir_idx[p] if p is not None else -1
        ti = territory_of(d)
        dep = 0 if d == "" else d.count("/") + 1
        x, y, r_dot, am, rad, sa, sr = pos_dir[d]
        short = "src (root)" if d == "" else d.rsplit("/", 1)[-1]
        samp = ",".join(dir_samples.get(d, [])[:3])
        dirs_packed.append([
            p_idx, ti, dep, dir_total[d], dir_direct[d],
            round(x, 1), round(y, 1), round(r_dot, 2),
            short, samp, round(sa, 4), round(sr, 1),
        ])

    # 4. Harmonious Full-360° Mandala Layout for ALL 109 Verified Lean Declarations!
    #    Key upgrade: partition the full 360 degrees proportionally by stratum node count
    #    so Arithmetic supply (49 nodes), Estimate (17), Analytic engine (18), and
    #    Destination (20 inner) fill the ENTIRE mandala cleanly with ZERO 12-o'clock clumping!
    with open(MODEL_JSON, encoding="utf-8") as f:
        model = json.load(f)

    m_nodes = model["nodes"]
    m_edges = model["edges"]
    comp_to_strat = {c["id"]: c["stratum"] for c in model["components"]}
    n_by_id = {n["id"]: n for n in m_nodes}
    n_idx = {n["id"]: i for i, n in enumerate(m_nodes)}

    deps = defaultdict(list)
    dependents = defaultdict(list)
    for e in m_edges:
        u, v = e["from"], e["to"]
        if u in n_by_id and v in n_by_id and u != v:
            deps[u].append(v)
            dependents[v].append(u)

    indeg = {nid: len(deps[nid]) for nid in n_by_id}
    q = [nid for nid, d in indeg.items() if d == 0]
    topo = []
    while q:
        u = q.pop(0)
        topo.append(u)
        for w in dependents[u]:
            indeg[w] -= 1
            if indeg[w] == 0:
                q.append(w)
    assert len(topo) == len(m_nodes)

    height = {nid: 0 for nid in n_by_id}
    for u in reversed(topo):
        if dependents[u]:
            height[u] = max(height[w] + 1 for w in dependents[u])
    max_h = max(height.values())  # 17

    manual_h = {
        "paper-chain": 7, "paper-behrend": 12, "behrend": 13,
        "moment-theorem": 6, "moment-target": 7, "moment-calculation": 8,
        "moment-majorant": 9, "moment-dominated": 9, "moment-laurent": 10,
    }
    for nid, hv in manual_h.items():
        if nid in height:
            height[nid] = hv

    OTHER_EXPORTS = ["main-prim", "main-right", "main-zeta", "main-strip"]
    pos_thm = {"main-rh": (0.0, 0.0)}
    ang_of = {"main-rh": 0.0}
    for k, eid in enumerate(OTHER_EXPORTS):
        a = math.radians(-45.0 + k * 90.0)
        ang_of[eid] = norm_angle(a)
        pos_thm[eid] = (38.0 * math.cos(a), 38.0 * math.sin(a))

    # Full-360° angular sectors for the 3 outer strata (matching outer ring orientation!)
    #   arith (49 nodes): 190° .. 354° (164° wide! spans upper-left AbelianVariety -> top AutomorphicArith!)
    #   est   (17 nodes): 358° .. 86°  (88° wide! right side beside Formalism!)
    #   ana   (18 nodes): 92°  .. 184° (92° wide! bottom beside GroundTheory & Reciprocity!)
    #   dest  (20 non-export nodes): inner convergence rings r = 74..132 spread evenly across full 360°!
    STRAT_ARC = {
        "arith": (math.radians(190.0), math.radians(354.0)),
        "est":   (math.radians(358.0), math.radians(446.0)),  # 358° -> 86°
        "ana":   (math.radians(92.0),  math.radians(184.0)),
    }

    # Group non-export nodes into (stratum, ring_h) and distribute evenly across each stratum's wide arc!
    def ring_r(nid: str) -> float:
        st = comp_to_strat[n_by_id[nid]["component"]]
        hv = max(1, height[nid])
        if st == "dest":
            return 74.0 + ((min(hv, 4) - 1) / 3.0) * 52.0
        # Spread outer strata richly across r = 136 .. 332!
        t = (hv - 1) / max(1, max_h - 1)
        return 128.0 + (t ** 0.78) * 204.0

    strat_shells = defaultdict(list)
    dest_nodes = []
    for n in m_nodes:
        nid = n["id"]
        if nid == "main-rh" or nid in OTHER_EXPORTS:
            continue
        st = comp_to_strat[n["component"]]
        if st == "dest":
            dest_nodes.append(nid)
        else:
            strat_shells[(st, max(1, height[nid]))].append(nid)

    # Place destination convergence nodes around the full 360° inner crown aligned to their incoming feeders
    dest_shells = defaultdict(list)
    for nid in dest_nodes:
        dest_shells[max(1, height[nid])].append(nid)
    for hv, ids in dest_shells.items():
        ids.sort(key=lambda z: (n_by_id[z]["component"], z))
        rad = 74.0 + ((min(hv, 4) - 1) / 3.0) * 52.0
        for k, nid in enumerate(ids):
            a = norm_angle(math.radians(210.0) + (k / max(1, len(ids))) * TWO_PI)
            ang_of[nid] = a
            pos_thm[nid] = (rad * math.cos(a), rad * math.sin(a))

    # Place arith / est / ana nodes across their full generous arcs
    for (st, hv), ids in strat_shells.items():
        a0, a1 = STRAT_ARC[st]
        # Sort by component & host directory angle so related families cluster naturally
        def sort_key(nid):
            mod = n_by_id[nid].get("module") or ""
            hd = "/".join(mod.split(".")[:-1]) if mod else None
            ha = pos_dir[hd][3] if hd in pos_dir else (a0 + a1) * 0.5
            return (n_by_id[nid]["component"], ha, nid)
        ids.sort(key=sort_key)
        n = len(ids)
        for k, nid in enumerate(ids):
            frac = (k + 0.5) / max(1, n)
            # Subtle golden stagger between adjacent rings so radii don't line up like rigid spokes
            jitter = ((hv * 0.6180339) % 1.0 - 0.5) * ((a1 - a0) / max(n + 2, 6)) * 0.45
            a = a0 + frac * (a1 - a0) + jitter
            ang_of[nid] = norm_angle(a)

    # 12 sweeps of angular barycentre smoothing INSIDE each stratum's arc (preserving full angular spread!)
    for sweep in range(12):
        h_seq = range(1, max_h + 1) if sweep % 2 == 0 else range(max_h, 0, -1)
        for hv in h_seq:
            for st in ("arith", "est", "ana"):
                ids = strat_shells.get((st, hv), [])
                if not ids:
                    continue
                a0, a1 = STRAT_ARC[st]
                rad = 128.0 + (((hv - 1) / max(1, max_h - 1)) ** 0.78) * 204.0
                # Compute target angle within [a0, a1] from neighbors
                scored = []
                for nid in ids:
                    nbs = [nb for nb in (deps[nid] + dependents[nid]) if nb != "main-rh"]
                    if nbs:
                        # Unwrap neighbor angles around midpoint of [a0, a1]
                        mid = 0.5 * (a0 + a1)
                        avg = mid + sum(ang_diff(mid, ang_of[nb]) for nb in nbs) / len(nbs)
                        # Clamp gently inside [a0 + margin, a1 - margin]
                        targ = max(a0 + 0.04, min(a1 - 0.04, avg))
                    else:
                        targ = a0 + (ang_diff(a0, ang_of[nid]) % TWO_PI)
                        targ = max(a0 + 0.04, min(a1 - 0.04, targ))
                    scored.append((targ, nid))
                scored.sort(key=lambda t: t[0])
                n = len(scored)
                # Blend neighbor barycentre with even angular slots across [a0, a1]
                # so crossings stay minimal while preventing pile-ups against sector walls!
                pad = 0.045
                span = max(0.08, (a1 - a0) - 2 * pad)
                angs = []
                for k, (targ, _) in enumerate(scored):
                    slot = a0 + pad + ((k + 0.5) / max(1, n)) * span
                    angs.append(0.32 * targ + 0.68 * slot)
                min_da = max(31.0 / rad, span / max(n + 0.8, 3.0) * 0.62)
                for k in range(1, n):
                    if angs[k] < angs[k - 1] + min_da:
                        angs[k] = angs[k - 1] + min_da
                if angs[-1] > a1 - pad:
                    sh = angs[-1] - (a1 - pad)
                    angs = [x - sh for x in angs]
                for k in range(n - 2, -1, -1):
                    if angs[k] > angs[k + 1] - min_da:
                        angs[k] = angs[k + 1] - min_da
                if angs[0] < a0 + pad:
                    sh = (a0 + pad) - angs[0]
                    angs = [x + sh for x in angs]
                for (_, nid), av in zip(scored, angs):
                    ang_of[nid] = norm_angle(av)

    # Smooth destination crown toward its incoming neighbors too
    for hv, ids in dest_shells.items():
        rad = 74.0 + ((min(hv, 4) - 1) / 3.0) * 52.0
        for nid in ids:
            nbs = [nb for nb in deps[nid] if nb != "main-rh"]
            if nbs:
                sx = sum(math.cos(ang_of[nb]) for nb in nbs)
                sy = sum(math.sin(ang_of[nb]) for nb in nbs)
                if abs(sx) + abs(sy) > 1e-5:
                    ang_of[nid] = norm_angle(math.atan2(sy, sx))
        ids.sort(key=lambda z: ang_of[z])
        n = len(ids)
        min_da = max(0.32, 30.0 / rad)
        if n > 1:
            for _ in range(10):
                for k in range(n):
                    a, b = ids[k], ids[(k + 1) % n]
                    diff = (ang_of[b] - ang_of[a]) % TWO_PI
                    if diff < min_da:
                        push = 0.52 * (min_da - diff)
                        ang_of[a] = norm_angle(ang_of[a] - push)
                        ang_of[b] = norm_angle(ang_of[b] + push)

    # Convert to Cartesian + strong 2D collision-free relaxation keeping radii inside [66, 336]!
    for n in m_nodes:
        nid = n["id"]
        if nid == "main-rh" or nid in OTHER_EXPORTS:
            continue
        r = ring_r(nid)
        a = ang_of[nid]
        pos_thm[nid] = (r * math.cos(a), r * math.sin(a))

    non_core = [n["id"] for n in m_nodes if n["id"] != "main-rh" and n["id"] not in OTHER_EXPORTS]
    for _ in range(32):
        for i in range(len(non_core)):
            u = non_core[i]
            ux, uy = pos_thm[u]
            for j in range(i + 1, len(non_core)):
                v = non_core[j]
                vx, vy = pos_thm[v]
                dx, dy = vx - ux, vy - uy
                dist = math.hypot(dx, dy)
                if 1e-6 < dist < 27.5:
                    push = (27.5 - dist) * 0.45 / dist
                    ux -= dx * push; uy -= dy * push
                    vx += dx * push; vy += dy * push
                    pos_thm[u] = (ux, uy)
                    pos_thm[v] = (vx, vy)
        # Keep cleanly inside the inner mandala moat [68, 336]
        for u in non_core:
            ux, uy = pos_thm[u]
            r = math.hypot(ux, uy)
            if r < 68.0 and r > 1e-6:
                pos_thm[u] = (ux * 68.0 / r, uy * 68.0 / r)
            elif r > 336.0:
                pos_thm[u] = (ux * 336.0 / r, uy * 336.0 / r)

    def closure(start, adj):
        vis = set()
        st = [start]
        while st:
            cur = st.pop()
            for nb in adj[cur]:
                if nb not in vis:
                    vis.add(nb); st.append(nb)
        return len(vis)

    thms_out = []
    for n in m_nodes:
        nid = n["id"]
        mod = n.get("module") or ""
        host_dir = "/".join(mod.split(".")[:-1]) if mod else None
        h_idx = dir_idx.get(host_dir, -1) if host_dir is not None else -1
        x, y = pos_thm[nid]
        thms_out.append({
            "id": nid,
            "t": n["title"],
            "d": n.get("declaration") or n["title"],
            "m": mod,
            "c": n["component"],
            "s": comp_to_strat[n["component"]],
            "k": n.get("kind", "reducer"),
            "g": n.get("contract") or "",
            "i": n.get("idea") or "",
            "x": round(x, 1),
            "y": round(y, 1),
            "h": height[nid],
            "anc": closure(nid, deps),
            "desc": closure(nid, dependents),
            "di": h_idx,
            "u": n.get("url") or "",
            "code": trim_excerpt(n.get("excerpt") or n.get("lean_head") or ""),
            "tier": n.get("tier") or "",
        })

    edges_out = []
    for e in m_edges:
        u, v = e["from"], e["to"]
        if u in n_idx and v in n_idx and u != v:
            edges_out.append([n_idx[v], n_idx[u], e.get("relation", "calls"), e.get("token", "")])

    atlas = {
        "world": {"r": 748, "rCore": 352, "rIn": R_IN, "rOut": R_OUT, "maxH": max_h},
        "meta": {
            "commit": COMMIT,
            "files": 175187,
            "lines": 17374215,
            "theoremsTotal": 818755,
            "dirs": len(dirs_packed),
            "theorems": len(thms_out),
            "edges": len(edges_out),
        },
        "territories": terr_out,
        "megaLabels": mega_labels[:12],
        "dirs": dirs_packed,
        "theorems": thms_out,
        "edges": edges_out,
    }

    # 5. Pack ALL 175,187 real .lean filenames into spatial size-capped shards (~280 KB target raw)!
    #    Neighboring directories in the same territory stay in the same small shard, while massive
    #    flat clusters (like DivisorProofs 42k) get their own dedicated shard so exploring any
    #    other folder in AbelianVarietyTheory never downloads DivisorProofs!
    shards_dir = OUT.parent / "files"
    shards_dir.mkdir(parents=True, exist_ok=True)
    for old_f in shards_dir.glob("*.txt"):
        old_f.unlink()

    SHARD_CAP = 280 * 1024  # ~280 KB raw (~75 KB gzipped) per shard
    encoded_by_terr = defaultdict(list)
    total_shard_files = 0
    for i, d in enumerate(sorted_dirs):
        fns = dir_files.get(d)
        if not fns:
            continue
        ti = territory_of(d)
        prev = ""
        enc = []
        for fn in fns:
            k = 0
            lim = min(len(prev), len(fn))
            while k < lim and prev[k] == fn[k]:
                k += 1
            enc.append(f"{k}:{fn[k:]}" if k >= 3 else fn)
            prev = fn
        line = f"{i}\t{','.join(enc)}"
        encoded_by_terr[ti].append((i, line, len(fns)))
        total_shard_files += len(fns)
    assert total_shard_files == 175187

    shards_out = []  # list of list[str]
    for ti in range(len(TERRITORIES)):
        cur_lines = []
        cur_bytes = 0
        for di, line, _ in encoded_by_terr[ti]:
            lb = len(line.encode("utf-8")) + 1
            if lb >= SHARD_CAP:
                shards_out.append([line])
                continue
            if cur_lines and cur_bytes + lb > SHARD_CAP:
                shards_out.append(cur_lines)
                cur_lines = []
                cur_bytes = 0
            cur_lines.append(line)
            cur_bytes += lb
        if cur_lines:
            shards_out.append(cur_lines)

    dir_shard = [-1] * len(sorted_dirs)
    for sid, lines in enumerate(shards_out):
        for ln in lines:
            dir_shard[int(ln.split("\t", 1)[0])] = sid

    for i, row in enumerate(dirs_packed):
        row.append(dir_shard[i])

    tot_shard_bytes = 0
    for sid, lines in enumerate(shards_out):
        sp = shards_dir / f"s{sid}.txt"
        sp.write_text("\n".join(lines), encoding="utf-8")
        tot_shard_bytes += sp.stat().st_size

    atlas["meta"]["shards"] = len(shards_out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(atlas, separators=(",", ":")), encoding="utf-8")

    min_d = 1e9
    for i in range(len(thms_out)):
        for j in range(i + 1, len(thms_out)):
            d = math.hypot(thms_out[i]["x"] - thms_out[j]["x"], thms_out[i]["y"] - thms_out[j]["y"])
            if d < min_d:
                min_d = d
    total_direct = sum(d[4] for d in dirs_packed)
    assert total_direct == 175187
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"Wrote {len(shards_out)} spatial size-capped shards in {shards_dir} ({tot_shard_bytes / 1024:.1f} KB total raw)")
    print(f"  Exact .lean file stars: {total_direct:,}")
    print(f"  Directories: {len(dirs_packed):,}, Territories: {len(terr_out)}, MegaClusters: {len(mega_labels)}")
    print(f"  Theorems: {len(thms_out)} (min pairwise dist = {min_d:.1f} px!), Edges: {len(edges_out)}")


if __name__ == "__main__":
    main()
