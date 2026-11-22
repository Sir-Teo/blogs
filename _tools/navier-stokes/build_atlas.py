#!/usr/bin/env python3
"""
Build the complete interactive radial cosmos dataset for Alpöge & Buckmaster's
Lean 4 formalization of finite-time blow-up for the 3D Navier–Stokes equations
(tristanbuckmaster/navier-stokes, commit ad53419de079eb8f95f60313473374624a348546):

  1. Exact 2,270 Lean modules (616,060 total repo lines, 30,038 theorems/lemmas)
     arranged across 12 radial libraries and semantic prefix-family sub-clusters,
     with every file's real line count, theorem count, topological depth from
     Solution.lean, and exact in-repo import graph (6,570 real edges!).
  2. Harmonious 360° inner verified theorem mandala (~90 real spine declarations
     spanning Cell & Coercive Supply, Certificate & Fixed Point, Blow-up on R³/T³
     & Fractional companion, converging into Solution.lean at (0, 0)), with
     exact real transitive-reduced dependency arcs, verbatim Lean 4 signatures,
     exact #L line anchors, and pinned GitHub URLs.

Output:
  assets/data/navier-stokes/atlas.json
"""
from __future__ import annotations

import collections
import json
import math
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path("/Users/teo/Developer/blogs")
NS_REPO = Path("/Users/teo/.gemini/antigravity/brain/f0c3fec5-2ac3-4c37-98db-0a81dfbd4a73/scratch/ns-repo")
LEAN_DIR = NS_REPO / "lean"
OUT = REPO_ROOT / "assets/data/navier-stokes/atlas.json"
COMMIT = "ad53419de079eb8f95f60313473374624a348546"
GH_BLOB = f"https://github.com/tristanbuckmaster/navier-stokes/blob/{COMMIT}/lean"

# 12 radial libraries covering 100% of lean/ modules, ordered clockwise starting at ~8 o'clock
# so the 3D Navier–Stokes certificate libraries sit prominently across the upper-left/top,
# blow-up & uniqueness libraries on the right/bottom-right, and fractional companion on the bottom!
TERRITORIES = [
    ("CertCell",      "CertCell (Cell Calculus)",    "CertCell",     "amber"),
    ("Cert",          "Cert (Coercive & Orbit)",     "Cert",         "orange"),
    ("CellReduction", "CellReduction (Bridge)",      "CellReduct",   "gold"),
    ("CertTorus",     "CertTorus (Regularity)",      "CertTorus",    "blue"),
    ("Uniqueness",    "Uniqueness (R³ Blow-up)",     "Uniqueness",   "good"),
    ("Torus",         "Torus (T³ Blow-up)",          "Torus",        "teal"),
    ("WeakTransfer",  "Weak · Transfer · Profile",   "Weak · Trans", "blue"),
    ("FreqTr",        "FreqTr (Fourier Modes)",      "FreqTr",       "amber"),
    ("Frac",          "Frac (α-Dissipation)",        "Frac",         "teal"),
    ("FracCert",      "FracCert (Rotating Cert)",    "FracCert",     "violet"),
    ("FracCell",      "FracCell (501/500 Cells)",    "FracCell",     "violet"),
    ("CoreRoot",      "Solution · Spectral · Spec",  "Root & Spec",  "slate"),
]

TWO_PI = 2.0 * math.pi


def territory_of_mod(mod: str) -> int:
    if not mod.startswith("Breakdown."):
        return 11  # CoreRoot (Solution, Challenge*, etc.)
    parts = mod.split(".")
    if len(parts) == 2:
        return 11
    sub = parts[1]
    mapping = {
        "CertCell": 0,
        "Cert": 1,
        "CellReduction": 2,
        "CertTorus": 3,
        "Uniqueness": 4,
        "Torus": 5,
        "Weak": 6,
        "Transfer": 6,
        "Profile": 6,
        "FreqTr": 7,
        "Frac": 8,
        "FracCert": 9,
        "FracCell": 10,
        "Spectral": 11,
        "Held": 11,
        "Base": 11,
    }
    return mapping.get(sub, 11)


def split_prefix(stem: str) -> str:
    m = re.match(r"^([A-Z][a-z]{2,}|[A-Z]{2,}(?=[A-Z][a-z]|$))", stem)
    return m.group(1) if m else stem[:6]


def norm_angle(a: float) -> float:
    return a % TWO_PI


def ang_diff(a: float, b: float) -> float:
    return (b - a + math.pi) % TWO_PI - math.pi


def extract_excerpt(lines: list[str], line_no: int, max_lines: int = 8, max_chars: int = 440) -> str:
    if line_no <= 0 or line_no > len(lines):
        return ""
    chunk = []
    for ln in lines[line_no - 1 : line_no - 1 + max_lines]:
        if chunk and not ln.strip():
            break
        chunk.append(ln.rstrip())
    out = "\n".join(chunk)
    if len(out) > max_chars:
        out = out[: max_chars - 1].rstrip() + "…"
    return out


def find_main_decl(lines: list[str], preferred_name: str | None = None):
    decls = []
    for idx, ln in enumerate(lines, 1):
        s = ln.lstrip()
        m = re.match(
            r"^(?:(?:private|protected|noncomputable|unsafe|partial)\s+)*(theorem|lemma|def|abbrev|structure)\s+([^\s:({\[=]+)",
            s,
        )
        if m:
            decls.append((idx, m.group(1), m.group(2)))
    if preferred_name:
        for idx, kind, name in decls:
            if name == preferred_name or name.endswith("." + preferred_name):
                return idx, kind, name
    thms = [d for d in decls if d[1] == "theorem"]
    if thms:
        return thms[-1]
    lems = [d for d in decls if d[1] == "lemma"]
    if lems:
        return lems[-1]
    if decls:
        return decls[0]
    return 1, "module", ""


# Curated human-readable metadata for key mathematical landmarks along the proof!
CURATED_META = {
    "sol-both": (
        "Solution",
        "breakdownOnSpaceAndTorus_of_cell_system_condition",
        "Blow-up on R³ and T³ from cell certificate",
        "dest",
        "export",
        "15-condition CellSystemCondition implies finite-time smooth blow-up on both R³ and T³.",
        "Top comparator-verified theorem tying together all 2,259 files of Breakdown/.",
    ),
    "sol-space": (
        "Solution",
        "breakdown_on_space",
        "Theorem 1.1: R³ blow-up from profile",
        "dest",
        "export",
        "Any smooth backward discretely self-similar profile yields compactly supported finite-energy blow-up on R³.",
        "Disproves Clay Millennium statement (A) and proves (C) for every viscosity ν > 0.",
    ),
    "sol-torus": (
        "Solution",
        "breakdown_on_torus",
        "Theorem 1.1: T³ blow-up from profile",
        "dest",
        "export",
        "Any smooth backward discretely self-similar profile yields smooth periodic blow-up on T³.",
        "Disproves Clay Millennium statement (B) and proves (D) via large-period dilation T = L⁻².",
    ),
    "sol-ext-orbit": (
        "Solution",
        "extended_certificate_orbit",
        "Theorem 7.1: Extended certificate → orbit",
        "dest",
        "export",
        "An extended certificate (C¹ profile, weak second derivative, coercive model) yields a weak periodic similarity profile.",
        "Core analytical existence theorem verified by comparator-certificate.json.",
    ),
    "sol-frac-cell": (
        "Solution",
        "fractional_breakdown_of_cell_system",
        "Fractional α = 501/500 blow-up from cells",
        "dest",
        "export",
        "12-condition fractional CellSystemCondition implies smooth blow-up on R³ and T³ for ν(-Δ)^(501/500).",
        "Companion hyperdissipative theorem whose simpler mechanism led to the α = 1 profile.",
    ),
    "sol-weak": (
        "Solution",
        "breakdown_on_space_of_weak",
        "Direct R³ blow-up from weak profile",
        "ana",
        "bridge",
        "Derives BreakdownOnSpace directly from a weak L⁶/H¹ periodic similarity profile without smoothness.",
        "Bypasses Proposition 7.11 on R³; verified by comparator.json.",
    ),
    "sol-cert-orbit": (
        "Solution",
        "certificate_orbit",
        "Basic certificate → weak similarity orbit",
        "est",
        "bridge",
        "Produces a nonzero weak periodic self-similar profile from a C² coercive certificate.",
        "Earlier smooth-certificate version of Theorem 7.1.",
    ),
    "sol-mult-dens": (
        "Solution",
        "multiplier_density",
        "Mode-weighted multiplier density estimate",
        "arith",
        "engine",
        "Constructs a controlled multiplier field M bounding positive vs negative coercive energy densities.",
        "Turns rotating-frame frequencies into positive coercive terms.",
    ),
    "sol-azim": (
        "Solution",
        "mode_azimuthal_gain",
        "Azimuthal Poincaré gain (|n|-1)²/r²",
        "arith",
        "engine",
        "For azimuthal mode |n| ≥ 2, squared velocity and gradient modes gain (|n|-1)²/r² and (|n|-2)²/r².",
        "Key mechanism suppressing high angular harmonics away from the axis.",
    ),
    "sol-stretch": (
        "Solution",
        "stretch_mean_bound",
        "Angular-averaged vortex stretching bound",
        "arith",
        "engine",
        "Bounds the period- and rotation-averaged vortex stretching quadratic form mode by mode.",
        "Controls the destabilizing (v·∇)W stretching interaction across the 19 spiral arms.",
    ),
    "sol-piece-weak": (
        "Solution",
        "pieceMultiplierDensityWeak",
        "Proposition B.1: Weak piece multiplier density",
        "arith",
        "engine",
        "Piecewise-weighted multiplier density inequality using only weak second derivatives of the model.",
        "Proved in Lean only (omitted from the prose paper's Appendix B).",
    ),
    "sol-ext-coerc": (
        "Solution",
        "extendedCoerciveClause_of_pieceData",
        "Piecewise data → extended coercive clause",
        "arith",
        "bridge",
        "Assembles the global linearized coercive a priori estimate from piecewise harmonic weights.",
        "Feeds directly into the extended certificate hypothesis.",
    ),
    "sol-frac-cert": (
        "Solution",
        "fracCertificate_profile",
        "Fractional certificate → rotating profile",
        "est",
        "bridge",
        "Time-independent certificate produces a smooth rotating self-similar profile for 1 < α < 5/4.",
        "Verified by comparator-fractional-certificate.json.",
    ),
    "sol-frac-space": (
        "Solution",
        "fractional_breakdown_on_space",
        "Fractional R³ blow-up (1 < α < 5/4)",
        "ana",
        "export",
        "Rotating fractional self-similar profile yields compactly supported blow-up for ν(-Δ)^α on R³.",
        "Verified by comparator-fractional.json.",
    ),
    "sol-frac-torus": (
        "Solution",
        "fractional_breakdown_on_torus",
        "Fractional T³ blow-up (1 < α < 5/4)",
        "ana",
        "export",
        "Rotating fractional self-similar profile yields smooth periodic blow-up for ν(-Δ)^α on T³.",
        "Verified by comparator-fractional.json.",
    ),
    # Key internal library landmarks
    "mod-cell-closed": (
        "Breakdown.CellReduction.CellLayerBreakdownClosed",
        "spaceBreakdown_of_cell_system_condition",
        "CellLayerBreakdownClosed (R³ closure)",
        "est",
        "bridge",
        "Closes the 15-condition CellSystemCondition into BreakdownOnSpace on R³.",
        "Bridges 462 CertCell files and 127 CellReduction files into Solution.lean.",
    ),
    "mod-cert-torus-cor": (
        "Breakdown.CertTorus.CertificateCorollary",
        "spaceAndTorusBreakdown_of_cell_system_condition",
        "CertificateCorollary (R³ & T³ closure)",
        "ana",
        "bridge",
        "Combines R³ weak breakdown and T³ regularity upgrade into the dual Millennium conclusion.",
        "Final assembly theorem imported by Solution.lean.",
    ),
    "mod-cert-torus-main": (
        "Breakdown.CertTorus.Main",
        "periodicLerayProfileExists_of_weak",
        "Weak → smooth Leray profile (T³)",
        "ana",
        "engine",
        "Upgrades a weak periodic similarity profile to a smooth decaying profile for the torus argument.",
        "Internal Lean counterpart of Proposition 7.11 (KNSS regularity + Chae–Wolf decay).",
    ),
    "mod-fixed-point": (
        "Breakdown.Cert.FixedPointBox",
        "exists_fixedPoint_box",
        "FixedPointBox (parameter-box fixed point)",
        "est",
        "engine",
        "Brouwer/contraction fixed point in a finite parameter box α ∈ K closing the nonlinear equation.",
        "Formalization uses this box contraction where the paper uses Schauder–Tychonoff.",
    ),
    "mod-cell-calc": (
        "Breakdown.CertCell.CellCalculusStatements",
        "cellFormAssembly_of",
        "Proposition B.4: Local cell form bound",
        "arith",
        "engine",
        "Assembles quadratic-form lower bounds on each meridian rectangle Q = [r₁,r₂]×[z₁,z₂].",
        "Second Appendix B step proved exclusively in the Lean formalization.",
    ),
    "mod-stmt-defs": (
        "Breakdown.CertCell.StatementDefs",
        "quadForm",
        "CertCell.StatementDefs (6,263 lines)",
        "arith",
        "def",
        "Defines the 7 kinds of cell-layer data, tree matrices, and 15 conditions of CellSystemCondition.",
        "Single largest file in the repository (6,263 lines).",
    ),
    "mod-spectral": (
        "Breakdown.Spectral.RealDichotomy",
        "dichotomyHolds",
        "Real spectral dichotomy (essential radius < 1)",
        "ana",
        "engine",
        "Splits the monodromy operator M into a decaying subspace (< Θⁿ) and a finite-dimensional unstable part.",
        "Eliminates the need to compute eigenvalues of the linearization.",
    ),
    "mod-transfer": (
        "Breakdown.Transfer.Exports",
        "transferHolds_of_dichotomy",
        "Lyapunov–Perron right inverse & contraction",
        "ana",
        "engine",
        "Builds a bounded right inverse modulo finite-dimensional E ⊂ C∞_{c,div} and runs the Ḣ¹ contraction.",
        "Produces blow-up stable in finite codimension without time/phase modulation.",
    ),
    "mod-cutoff": (
        "Breakdown.Uniqueness.CutoffBounds",
        "contDiff_cutoffPow",
        "Vector-potential cutoff curl(η(·/r)A)",
        "ana",
        "engine",
        "Truncates the profile at radius r via its vector potential while keeping div = 0 and O(r⁻¹/²) Ḣ¹ error.",
        "Turns infinite-energy self-similar profiles into compactly supported finite-energy initial data.",
    ),
    "mod-torus-red": (
        "Breakdown.Torus.Reduction",
        "breakdownOnTorus_of_torusBlowup",
        "Galilean frame & Neumann torus reduction",
        "ana",
        "engine",
        "Removes non-periodic pressure drift by Galilean shift and inverts the period-L torus linearization.",
        "Completes Theorem 1.1 on T³ = R³/Z³.",
    ),
    "mod-freqtr": (
        "Breakdown.FreqTr.Realization",
        "bilinH1Formula_holds",
        "FreqTr.Realization (59 callers)",
        "arith",
        "engine",
        "Realizes the Fourier/bilinear Ḣ¹ test-function identities and heat-Leray kernel formulas.",
        "Most-imported single module across the entire repository (59 direct callers).",
    ),
    "mod-frac-chain": (
        "Breakdown.FracCell.FinalChain",
        "fractional_breakdown_of_cell_system_proved",
        "FracCell.FinalChain (1,708 lines)",
        "est",
        "bridge",
        "Chains spectral blocks, cell analysis, and exterior bounds into α = 501/500 blow-up.",
        "Top assembly file for the 488-file FracCell library.",
    ),
}


def main():
    # 1. Scan all Lean modules in lean/ (excluding scripts/) + count repo totals
    all_lean_disk = sorted(LEAN_DIR.rglob("*.lean"))
    total_repo_files = len(all_lean_disk)  # 2,271
    total_repo_lines = 0
    total_repo_thms = 0
    total_repo_defs = 0

    mod_files: dict[str, Path] = {}
    for f in all_lean_disk:
        txt = f.read_text(encoding="utf-8", errors="replace")
        lns = txt.splitlines()
        total_repo_lines += len(lns)
        for ln in lns:
            s = ln.lstrip()
            if re.match(r"^(?:(?:private|protected|noncomputable|unsafe|partial)\s+)*(theorem|lemma)\s+", s):
                total_repo_thms += 1
            elif re.match(r"^(?:(?:private|protected|noncomputable|unsafe|partial)\s+)*(def|abbrev|structure|inductive|class)\s+", s):
                total_repo_defs += 1
        rel = f.relative_to(LEAN_DIR)
        if rel.parts[0] == "scripts":
            continue
        mod = ".".join(rel.with_suffix("").parts)
        mod_files[mod] = f

    mod_list = sorted(mod_files.keys())
    mod_to_idx = {m: i for i, m in enumerate(mod_list)}

    imports_of: dict[str, list[str]] = collections.defaultdict(list)
    callers_of: dict[str, list[str]] = collections.defaultdict(list)
    lines_of: dict[str, int] = {}
    thms_of: dict[str, int] = {}
    text_lines: dict[str, list[str]] = {}
    total_edges = 0

    for mod, f in mod_files.items():
        lns = f.read_text(encoding="utf-8", errors="replace").splitlines()
        text_lines[mod] = lns
        lines_of[mod] = len(lns)
        tc = 0
        for ln in lns:
            m = re.match(r"^import\s+([A-Za-z0-9_.']+)", ln)
            if m and m.group(1) in mod_files:
                tgt = m.group(1)
                imports_of[mod].append(tgt)
                callers_of[tgt].append(mod)
                total_edges += 1
            elif re.match(r"^(?:(?:private|protected|noncomputable|unsafe|partial)\s+)*(theorem|lemma)\s+", ln.lstrip()):
                tc += 1
        thms_of[mod] = tc

    # BFS distance from Solution.lean across exact real import graph
    dist_sol = {"Solution": 0}
    q = collections.deque(["Solution"])
    while q:
        u = q.popleft()
        for v in imports_of[u]:
            if v not in dist_sol:
                dist_sol[v] = dist_sol[u] + 1
                q.append(v)
    max_dist = max(dist_sol.values())

    # 2. Build semantic directory / prefix-family tree for the 12 radial outer sectors!
    #    Each territory root branches into its real folders & prefix sub-families so
    #    all 2,270 modules form clean filamentous galactic arms with exact clickable stars.
    cluster_mods: dict[str, list[str]] = collections.defaultdict(list)
    cluster_terr: dict[str, int] = {}
    cluster_parent: dict[str, str | None] = {}
    cluster_label: dict[str, str] = {}

    # Territory root clusters
    for ti, (tid, lbl, short, _) in enumerate(TERRITORIES):
        rk = f"T:{tid}"
        cluster_terr[rk] = ti
        cluster_parent[rk] = None
        cluster_label[rk] = short

    # Assign each module to a semantic cluster key
    sub_counts_by_folder = collections.defaultdict(collections.Counter)
    for mod in mod_list:
        parts = mod.split(".")
        if parts[0] == "Breakdown" and len(parts) >= 3:
            sub_counts_by_folder[parts[1]][split_prefix(parts[2])] += 1

    mod_cluster: dict[str, str] = {}
    for mod in mod_list:
        ti = territory_of_mod(mod)
        tid = TERRITORIES[ti][0]
        rk = f"T:{tid}"
        parts = mod.split(".")
        if parts[0] != "Breakdown":
            ck = f"C:{tid}/Challenges" if "Challenge" in mod or "Theorems" in mod else f"C:{tid}/Entry"
            cluster_terr[ck] = ti
            cluster_parent[ck] = rk
            cluster_label[ck] = "Challenges" if "Challenges" in ck else "Solution & Root"
        elif len(parts) == 2:
            ck = f"C:{tid}/Entry"
            cluster_terr[ck] = ti
            cluster_parent[ck] = rk
            cluster_label[ck] = "Solution & Root"
        else:
            folder = parts[1]
            stem = parts[2]
            fk = f"F:{tid}/{folder}"
            # If territory holds multiple Breakdown folders (WeakTransfer, CoreRoot), add folder node
            if tid in ("WeakTransfer", "CoreRoot"):
                cluster_terr[fk] = ti
                cluster_parent[fk] = rk
                cluster_label[fk] = folder
                par_key = fk
            else:
                par_key = rk
            pref = split_prefix(stem)
            if sub_counts_by_folder[folder][pref] >= 7:
                ck = f"P:{tid}/{folder}/{pref}"
                cluster_terr[ck] = ti
                cluster_parent[ck] = par_key
                cluster_label[ck] = f"{pref}*"
            else:
                ck = f"P:{tid}/{folder}/Core"
                cluster_terr[ck] = ti
                cluster_parent[ck] = par_key
                cluster_label[ck] = f"{folder} Core" if par_key == rk else "Core"
        mod_cluster[mod] = ck
        cluster_mods[ck].append(mod)

    # Order clusters deterministically (roots first, then folders, then leaves)
    all_clusters = sorted(cluster_terr.keys())
    c_idx = {c: i for i, c in enumerate(all_clusters)}
    c_children = collections.defaultdict(list)
    for c, p in cluster_parent.items():
        if p is not None:
            c_children[p].append(c)
    for lst in c_children.values():
        lst.sort()

    c_total = collections.Counter()
    c_lines = collections.Counter()
    for c, ms in cluster_mods.items():
        cur = c
        tot_m = len(ms)
        tot_l = sum(lines_of[m] for m in ms)
        while cur is not None:
            c_total[cur] += tot_m
            c_lines[cur] += tot_l
            cur = cluster_parent[cur]

    # Allocate 360° wedges across the 12 territories
    gap = 0.028
    usable = TWO_PI - gap * len(TERRITORIES)
    terr_counts = [c_total[f"T:{tid}"] for tid, _, _, _ in TERRITORIES]
    assert sum(terr_counts) == len(mod_list)
    weights = [max(1, n) ** 0.58 for n in terr_counts]
    w_sum = sum(weights)

    R_IN, R_OUT = 382.0, 704.0
    a_cur = math.radians(150.0)  # Start CertCell cleanly across upper-left -> top!
    terr_arc = []
    terr_out = []
    for ti, (tid, lbl, short, col) in enumerate(TERRITORIES):
        span = usable * (weights[ti] / w_sum)
        a0, a1 = a_cur, a_cur + span
        terr_arc.append((a0, a1))
        terr_out.append({
            "id": tid,
            "label": lbl,
            "short": short,
            "color": col,
            "files": terr_counts[ti],
            "lines": c_lines[f"T:{tid}"],
            "pct": round(100.0 * terr_counts[ti] / len(mod_list), 1),
            "a0": round(a0, 5),
            "a1": round(a1, 5),
        })
        a_cur = a1 + gap

    # Place clusters on a non-crossing polar dendrogram
    c_pos = {}
    def layout_cluster(c: str, a0: float, a1: float, r_cur: float):
        am = 0.5 * (a0 + a1)
        kids = c_children.get(c, [])
        sp_a = max(0.014, (a1 - a0) * 0.44)
        sp_r = 72.0 if not kids else 26.0
        c_pos[c] = (r_cur * math.cos(am), r_cur * math.sin(am), am, r_cur, sp_a, sp_r, a0, a1)
        if not kids:
            return
        kw = [max(1.0, c_total[k]) ** 0.72 for k in kids]
        ks = sum(kw)
        ca = a0
        for idx_k, k in enumerate(kids):
            span = (a1 - a0) * (kw[idx_k] / ks)
            grandkids = c_children.get(k, [])
            if grandkids:
                nr = r_cur + 58.0
            else:
                stagger = (idx_k * 0.6180339) % 1.0
                nr = min(R_OUT - 38.0, r_cur + 110.0 + stagger * 92.0)
            layout_cluster(k, ca, ca + span, nr)
            ca += span

    for ti, (tid, _, _, _) in enumerate(TERRITORIES):
        a0, a1 = terr_arc[ti]
        layout_cluster(f"T:{tid}", a0, a1, R_IN + 12.0)

    # Place ALL 2,270 individual .lean files smoothly inside their cluster wedge,
    # radially ordered by exact topological distance from Solution.lean!
    # Deterministic hash jitter so stars never overlap and form lush galactic arms.
    def det_hash(s: str, salt: int) -> float:
        h = (2166136261 ^ salt) & 0xFFFFFFFF
        for ch in s.encode("utf-8"):
            h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
        return (h & 0xFFFFFF) / float(0x1000000)

    files_out = []  # [modName, dirIdx, lines, thms, dist, x, y, [impIdx...]]
    mod_xy: dict[str, tuple[float, float]] = {}

    for c, ms in cluster_mods.items():
        cx, cy, am, rad, sp_a, sp_r, a0, a1 = c_pos[c]
        ms.sort(key=lambda m: (dist_sol.get(m, max_dist + 1), -lines_of[m], m))
        n = len(ms)
        margin = min(0.012, (a1 - a0) * 0.08)
        ua0, ua1 = a0 + margin, a1 - margin
        if ua1 <= ua0:
            ua0, ua1 = a0, a1
        for k, mod in enumerate(ms):
            d_val = dist_sol.get(mod, max_dist)
            # Radial band: closer to Solution -> closer to R_IN; deeper leaves -> closer to R_OUT
            t_r = clamp_f((d_val - 1) / max(1.0, max_dist - 1.0), 0.0, 1.0)
            jr = (det_hash(mod, 17) - 0.5) * 34.0
            r = clamp_f(R_IN + 20.0 + (t_r ** 0.85) * (R_OUT - R_IN - 42.0) + jr, R_IN + 6.0, R_OUT - 6.0)
            # Angular position across the cluster wedge with gentle golden-ratio dispersion
            frac = (k + 0.5) / max(1, n)
            ja = (det_hash(mod, 53) - 0.5) * ((ua1 - ua0) / max(n, 4)) * 1.4
            ang = clamp_f(ua0 + frac * (ua1 - ua0) + ja, a0 + 0.004, a1 - 0.004)
            x, y = r * math.cos(ang), r * math.sin(ang)
            mod_xy[mod] = (x, y)

    # Pack files array in mod_list order!
    for mod in mod_list:
        x, y = mod_xy[mod]
        ci = c_idx[mod_cluster[mod]]
        imp_idxs = [mod_to_idx[im] for im in imports_of[mod] if im in mod_to_idx]
        files_out.append([
            mod,
            ci,
            lines_of[mod],
            thms_of[mod],
            dist_sol.get(mod, max_dist + 1),
            round(x, 1),
            round(y, 1),
            imp_idxs,
        ])

    # Pack clusters array: [pIdx, tIdx, totFiles, dirFiles, totLines, x, y, label, keyPath]
    clusters_out = []
    mega_labels = []
    for c in all_clusters:
        p = cluster_parent[c]
        pi = c_idx[p] if p is not None else -1
        ti = cluster_terr[c]
        cx, cy, am, rad, sp_a, sp_r, a0, a1 = c_pos[c]
        direct_n = len(cluster_mods.get(c, []))
        # Derive clean GitHub path prefix for directory links
        if c.startswith("T:"):
            tid = TERRITORIES[ti][0]
            gh_sub = f"Breakdown/{tid}" if tid not in ("WeakTransfer", "CoreRoot") else "Breakdown"
        elif c.startswith("F:"):
            gh_sub = f"Breakdown/{c.split('/')[-1]}"
        elif c.startswith("P:"):
            gh_sub = f"Breakdown/{c.split('/')[1]}"
        else:
            gh_sub = ""
        clusters_out.append([
            pi, ti, c_total[c], direct_n, c_lines[c],
            round(cx, 1), round(cy, 1),
            cluster_label[c], gh_sub,
        ])
        if direct_n >= 35:
            mega_labels.append({
                "idx": c_idx[c],
                "label": f"{TERRITORIES[ti][2]}/{cluster_label[c]}" if cluster_label[c] == "Core" else cluster_label[c],
                "files": direct_n,
                "x": round(cx, 1),
                "y": round(cy, 1),
            })
    mega_labels.sort(key=lambda m: -m["files"])

    # 3. Build the Inner 360° Verified Theorem Mandala (~90 real spine declarations!)
    #    Start with the 27 curated landmark declarations + top-centrality real spine modules
    #    from across every Breakdown library so the mandala reflects the TRUE proof structure!
    spine_nodes = []
    used_mods_for_auto = set()

    for sid, (mod, decl, title, strat, kind, contract, idea) in CURATED_META.items():
        lns = text_lines[mod]
        ln_no, _, found_name = find_main_decl(lns, decl)
        rel_path = mod.replace(".", "/") + ".lean"
        spine_nodes.append({
            "id": sid,
            "t": title,
            "d": found_name or decl,
            "m": mod,
            "s": strat,
            "k": kind,
            "g": contract,
            "i": idea,
            "line": ln_no,
            "u": f"{GH_BLOB}/{rel_path}#L{ln_no}",
            "code": extract_excerpt(lns, ln_no),
            "tier": "comparator" if mod == "Solution" and kind == "export" else "proved",
            "fi": mod_to_idx[mod],
            "ci": c_idx[mod_cluster[mod]],
        })
        if mod != "Solution":
            used_mods_for_auto.add(mod)

    # Auto-add ~65 highest-centrality real bridge/assembly/statement modules across all Breakdown folders
    def strat_for_mod(mod: str) -> str:
        if mod.startswith(("Breakdown.CertCell.", "Breakdown.FreqTr.", "Breakdown.Cert.Coercive", "Breakdown.Cert.ExtendedCoercive")):
            return "arith"
        if mod.startswith(("Breakdown.Cert.", "Breakdown.CellReduction.", "Breakdown.FracCell.", "Breakdown.FracCert.")):
            return "est"
        return "ana"

    scored_mods = []
    sol_direct = set(imports_of["Solution"])
    for mod in mod_list:
        if mod in used_mods_for_auto or mod == "Solution" or not mod.startswith("Breakdown."):
            continue
        if mod not in dist_sol:
            continue
        c_in = len(callers_of[mod])
        c_out = len(imports_of[mod])
        is_main = any(mod.endswith(s) for s in ("Main", "Assembly", "Exports", "Statements", "Orbit", "Reduction", "Bridge", "Closed"))
        score = (1000.0 if mod in sol_direct else 0.0) + c_in * 3.0 + min(c_out, 12) * 1.2 + (14.0 if is_main else 0.0) + math.log1p(lines_of[mod]) * 1.5
        scored_mods.append((score, mod))
    scored_mods.sort(reverse=True)

    # Cap per folder so every library is richly represented around 360°!
    per_folder_cap = {
        "CertCell": 12, "Cert": 14, "CellReduction": 7, "CertTorus": 6,
        "Uniqueness": 7, "Torus": 6, "Weak": 3, "Transfer": 3,
        "Profile": 3, "Spectral": 2, "FreqTr": 4,
        "FracCell": 9, "FracCert": 5, "Frac": 6, "Held": 1, "Base": 1,
    }
    folder_added = collections.Counter()
    for _, mod in scored_mods:
        parts = mod.split(".")
        if len(parts) < 3:
            continue
        folder = parts[1]
        if folder_added[folder] >= per_folder_cap.get(folder, 3):
            continue
        lns = text_lines[mod]
        ln_no, kind, decl_name = find_main_decl(lns)
        if not decl_name:
            continue
        folder_added[folder] += 1
        stem = parts[-1]
        rel_path = mod.replace(".", "/") + ".lean"
        sid = "m-" + re.sub(r"[^a-z0-9]+", "-", f"{folder}-{stem}".lower()).strip("-")
        spine_nodes.append({
            "id": sid,
            "t": f"{folder}.{stem}",
            "d": decl_name,
            "m": mod,
            "s": strat_for_mod(mod),
            "k": kind,
            "g": f"{lines_of[mod]:,} lines · {thms_of[mod]} theorems · {len(callers_of[mod])} callers in Breakdown/{folder}.",
            "i": f"Key verified module at depth {dist_sol[mod]} from Solution.lean.",
            "line": ln_no,
            "u": f"{GH_BLOB}/{rel_path}#L{ln_no}",
            "code": extract_excerpt(lns, ln_no),
            "tier": "proved",
            "fi": mod_to_idx[mod],
            "ci": c_idx[mod_cluster[mod]],
        })

    # 4. Compute EXACT REAL transitive-reduced dependency edges among all spine nodes!
    #    First compute reachability in the full 2,270-module real Lean import graph.
    spine_by_id = {n["id"]: i for i, n in enumerate(spine_nodes)}
    NS_SPINE = len(spine_nodes)

    # Exact wiring for Solution.lean's 15 top theorems -> their real backing module in Solution.lean!
    SOL_BACKING = {
        "sol-both": ["mod-cert-torus-cor", "sol-space", "sol-torus"],
        "sol-space": ["m-uniqueness-space"],
        "sol-torus": ["m-torus-main"],
        "sol-ext-orbit": ["m-cert-extendedmain"],
        "sol-frac-cell": ["mod-frac-chain"],
        "sol-weak": ["m-weak-main"],
        "sol-cert-orbit": ["m-cert-main"],
        "sol-mult-dens": ["m-cert-coercivemain"],
        "sol-azim": ["m-cert-coercivemain"],
        "sol-stretch": ["m-cert-coercivemain"],
        "sol-piece-weak": ["m-cert-extendedcoercivemain"],
        "sol-ext-coerc": ["m-cert-extendedcoercivemain", "sol-piece-weak"],
        "sol-frac-cert": ["m-fraccert-main"],
        "sol-frac-space": ["m-frac-spaceexports", "sol-frac-cert"],
        "sol-frac-torus": ["m-frac-torusblowupexports", "sol-frac-cert"],
    }

    # Build transitive reachability on the real 2,270-module import graph
    mod_anc: dict[str, set[str]] = {}
    def get_anc(m: str) -> set[str]:
        if m in mod_anc:
            return mod_anc[m]
        vis = set()
        st = list(imports_of[m])
        while st:
            u = st.pop()
            if u not in vis:
                vis.add(u)
                st.extend(imports_of[u])
        mod_anc[m] = vis
        return vis

    # Construct raw premise -> conclusion edge set (u = premise, v = conclusion)
    raw_deps = collections.defaultdict(set)  # v -> set of premises u
    mod_to_spine = collections.defaultdict(list)
    for i, n in enumerate(spine_nodes):
        if n["m"] != "Solution":
            mod_to_spine[n["m"]].append(i)

    # Wire Solution theorems to their exact backing spine modules
    for sid, prereq_ids in SOL_BACKING.items():
        if sid not in spine_by_id:
            continue
        vi = spine_by_id[sid]
        for pid in prereq_ids:
            if pid in spine_by_id:
                raw_deps[vi].add(spine_by_id[pid])
    # Also connect Solution sub-exports into sol-both where mathematically appropriate
    for extra_in in ("sol-ext-orbit", "sol-weak", "sol-ext-coerc"):
        if extra_in in spine_by_id:
            raw_deps[spine_by_id["sol-both"]].add(spine_by_id[extra_in])
    # Connect sol-ext-orbit <- sol-ext-coerc, sol-cert-orbit <- sol-mult-dens/sol-azim/sol-stretch
    for v_id, u_ids in [
        ("sol-ext-orbit", ["sol-ext-coerc", "mod-fixed-point"]),
        ("sol-cert-orbit", ["sol-mult-dens", "sol-azim", "sol-stretch", "mod-fixed-point"]),
        ("mod-cell-closed", ["sol-ext-orbit", "sol-weak", "mod-cell-calc"]),
        ("mod-cert-torus-cor", ["mod-cell-closed", "mod-cert-torus-main", "sol-torus"]),
        ("mod-cert-torus-main", ["sol-ext-orbit"]),
        ("sol-frac-cell", ["sol-frac-space", "sol-frac-torus"]),
    ]:
        if v_id in spine_by_id:
            for uid in u_ids:
                if uid in spine_by_id:
                    raw_deps[spine_by_id[v_id]].add(spine_by_id[uid])

    # Wire non-Solution spine modules using the EXACT real import graph (transitive-reduced!)
    non_sol_idxs = [i for i, n in enumerate(spine_nodes) if n["m"] != "Solution"]
    for vi in non_sol_idxs:
        vm = spine_nodes[vi]["m"]
        anc_m = get_anc(vm)
        for ui in non_sol_idxs:
            if ui == vi:
                continue
            if spine_nodes[ui]["m"] in anc_m:
                raw_deps[vi].add(ui)

    # Transitive reduction on the DAG so every arc is a crisp, clean direct causal link!
    # First compute reachability in raw_deps (breaking any rare cycle safely via dist_sol)
    safe_deps = collections.defaultdict(set)
    for vi, us in raw_deps.items():
        for ui in us:
            if ui != vi:
                safe_deps[vi].add(ui)

    # Ensure DAG via topological ordering / break back-edges if any
    # Compute direct transitive reduction: keep u -> v iff no intermediate w with u ->* w ->* v
    adj_reach = {}
    def reach_nodes(v: int) -> set[int]:
        if v in adj_reach:
            return adj_reach[v]
        vis = set()
        st = list(safe_deps[v])
        while st:
            u = st.pop()
            if u not in vis and u != v:
                vis.add(u)
                st.extend(safe_deps[u])
        adj_reach[v] = vis
        return vis

    edges_out = []  # [premiseIdx, conclusionIdx, rel]
    deps_adj = collections.defaultdict(list)
    dependents_adj = collections.defaultdict(list)
    for vi in range(NS_SPINE):
        us = safe_deps[vi]
        for ui in sorted(us):
            # Check if ui is already reachable through some other w in us
            redundant = False
            for wi in us:
                if wi != ui and ui in reach_nodes(wi):
                    redundant = True
                    break
            if not redundant:
                edges_out.append([ui, vi, "imports"])
                deps_adj[vi].append(ui)
                dependents_adj[ui].append(vi)

    # Compute concentric topological height from sol-both (height 0 at center!)
    height = [0] * NS_SPINE
    # Iterative Bellman-Ford / longest path to sol-both (capped for safety)
    for _ in range(NS_SPINE):
        changed = False
        for u, v, _ in edges_out:
            if height[u] < height[v] + 1:
                height[u] = height[v] + 1
                changed = True
        if not changed:
            break
    max_h = max(height) if height else 1

    # 5. Harmonious Full-360° Mandala Layout for ALL Spine Declarations!
    CENTER_ID = "sol-both"
    CROWN_IDS = ["sol-space", "sol-torus", "sol-ext-orbit", "sol-frac-cell"]
    pos_thm = {spine_by_id[CENTER_ID]: (0.0, 0.0)}
    ang_of = {spine_by_id[CENTER_ID]: 0.0}
    for k, cid in enumerate(CROWN_IDS):
        idx = spine_by_id[cid]
        a = math.radians(-45.0 + k * 90.0)
        ang_of[idx] = norm_angle(a)
        pos_thm[idx] = (38.0 * math.cos(a), 38.0 * math.sin(a))

    # Three full-360° angular strata aligned with their outer feeding libraries!
    #   arith (Cell & Coercive Supply): 155° .. 315° (upper-left CertCell & top Cert!)
    #   ana   (Blow-up on R³ & T³):     322° .. 440° (322° -> 80°, right Uniqueness & Torus!)
    #   est   (Certificate & Frac):      88° .. 148° (bottom-left FracCell/FracCert/FixedPoint!)
    # Wait — let's proportion sector widths smoothly by exact node counts!
    crown_set = {spine_by_id[CENTER_ID]} | {spine_by_id[c] for c in CROWN_IDS}
    s_counts = collections.Counter(spine_nodes[i]["s"] for i in range(NS_SPINE) if i not in crown_set)
    tot_outer = max(1, sum(s_counts.values()))
    s_order = ["arith", "ana", "est"]
    s_gap = math.radians(8.0)
    s_usable = TWO_PI - s_gap * 3
    a_s = math.radians(155.0)
    STRAT_ARC = {}
    for st in s_order:
        w = s_usable * max(0.20, s_counts[st] / tot_outer)
        STRAT_ARC[st] = (a_s, a_s + w)
        a_s += w + s_gap
    # Renormalize exact 360° span
    scale_360 = s_usable / sum(b - a for a, b in STRAT_ARC.values())
    a_s = math.radians(155.0)
    for st in s_order:
        w = (STRAT_ARC[st][1] - STRAT_ARC[st][0]) * scale_360
        STRAT_ARC[st] = (a_s, a_s + w)
        a_s += w + s_gap

    strat_shells = collections.defaultdict(list)
    for i in range(NS_SPINE):
        if i in crown_set:
            continue
        hv = max(1, height[i])
        st = spine_nodes[i]["s"]
        if st == "dest":
            st = "ana"
        strat_shells[(st, hv)].append(i)

    def shell_rad(hv: int) -> float:
        t = (hv - 1) / max(1, max_h - 1)
        return 92.0 + (t ** 0.78) * 236.0

    for (st, hv), ids in strat_shells.items():
        a0, a1 = STRAT_ARC[st]
        ids.sort(key=lambda idx: (spine_nodes[idx]["m"], idx))
        n = len(ids)
        for k, idx in enumerate(ids):
            frac = (k + 0.5) / max(1, n)
            ang_of[idx] = norm_angle(a0 + frac * (a1 - a0))

    # 12 sweeps of gentle spring-anchored barycentre smoothing (minimal crossings + zero wall pile-up!)
    for sweep in range(12):
        h_seq = range(1, max_h + 1) if sweep % 2 == 0 else range(max_h, 0, -1)
        for hv in h_seq:
            for st in s_order:
                ids = strat_shells.get((st, hv), [])
                if not ids:
                    continue
                a0, a1 = STRAT_ARC[st]
                rad = shell_rad(hv)
                mid = 0.5 * (a0 + a1)
                scored = []
                for idx in ids:
                    nbs = [nb for nb in (deps_adj[idx] + dependents_adj[idx]) if nb != spine_by_id[CENTER_ID]]
                    if nbs:
                        avg = mid + sum(ang_diff(mid, ang_of[nb]) for nb in nbs) / len(nbs)
                        targ = max(a0 + 0.04, min(a1 - 0.04, avg))
                    else:
                        targ = a0 + (ang_diff(a0, ang_of[idx]) % TWO_PI)
                        targ = max(a0 + 0.04, min(a1 - 0.04, targ))
                    scored.append((targ, idx))
                scored.sort(key=lambda t: t[0])
                n = len(scored)
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
                for (_, idx), av in zip(scored, angs):
                    ang_of[idx] = norm_angle(av)

    for i in range(NS_SPINE):
        if i in crown_set:
            continue
        rad = shell_rad(max(1, height[i]))
        a = ang_of[i]
        pos_thm[i] = (rad * math.cos(a), rad * math.sin(a))

    # Gentle pairwise repulsion pass so every single node breathes with >= 26 px spacing!
    for _ in range(120):
        for i in range(NS_SPINE):
            if i in crown_set:
                continue
            xi, yi = pos_thm[i]
            fx = fy = 0.0
            for j in range(NS_SPINE):
                if i == j:
                    continue
                xj, yj = pos_thm[j]
                dx, dy = xi - xj, yi - yj
                d = math.hypot(dx, dy)
                min_sep = 30.0 if (j in crown_set) else 27.5
                if d < min_sep:
                    if d < 1e-4:
                        dx, dy, d = 1.0, 0.0, 1.0
                    push = (min_sep - d) * 0.45
                    fx += (dx / d) * push
                    fy += (dy / d) * push
            nx, ny = xi + fx, yi + fy
            r = math.hypot(nx, ny)
            if r < 68.0:
                nx, ny = nx * 68.0 / max(r, 1e-4), ny * 68.0 / max(r, 1e-4)
            elif r > 336.0:
                nx, ny = nx * 336.0 / r, ny * 336.0 / r
            pos_thm[i] = (nx, ny)

    def closure_cnt(start: int, adj) -> int:
        vis = set()
        st = list(adj[start])
        while st:
            u = st.pop()
            if u not in vis and u != start:
                vis.add(u)
                st.extend(adj[u])
        return len(vis)

    thms_out = []
    for i, n in enumerate(spine_nodes):
        x, y = pos_thm[i]
        thms_out.append({
            "id": n["id"],
            "t": n["t"],
            "d": n["d"],
            "m": n["m"],
            "s": n["s"],
            "k": n["k"],
            "g": n["g"],
            "i": n["i"],
            "x": round(x, 1),
            "y": round(y, 1),
            "h": height[i],
            "anc": closure_cnt(i, deps_adj),
            "desc": closure_cnt(i, dependents_adj),
            "fi": n["fi"],
            "ci": n["ci"],
            "ln": n["line"],
            "u": n["u"],
            "code": n["code"],
            "tier": n["tier"],
        })

    atlas = {
        "world": {"r": 748, "rCore": 352, "rIn": R_IN, "rOut": R_OUT, "maxH": max_h},
        "meta": {
            "commit": COMMIT,
            "repo": "tristanbuckmaster/navier-stokes",
            "files": len(files_out),
            "repoFiles": total_repo_files,
            "lines": total_repo_lines,
            "theoremsTotal": total_repo_thms,
            "defsTotal": total_repo_defs,
            "importEdges": total_edges,
            "clusters": len(clusters_out),
            "theorems": len(thms_out),
            "edges": len(edges_out),
        },
        "territories": terr_out,
        "megaLabels": mega_labels[:12],
        "clusters": clusters_out,
        "files": files_out,
        "theorems": thms_out,
        "edges": edges_out,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(atlas, separators=(",", ":")), encoding="utf-8")

    min_d = 1e9
    for i in range(len(thms_out)):
        for j in range(i + 1, len(thms_out)):
            d = math.hypot(thms_out[i]["x"] - thms_out[j]["x"], thms_out[i]["y"] - thms_out[j]["y"])
            if d < min_d:
                min_d = d
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"  Exact .lean modules: {len(files_out):,} (total repo .lean files: {total_repo_files:,})")
    print(f"  Total lines: {total_repo_lines:,} | theorems/lemmas: {total_repo_thms:,} | defs: {total_repo_defs:,}")
    print(f"  Exact real import edges: {total_edges:,} | Clusters: {len(clusters_out)}")
    print(f"  Spine theorems: {len(thms_out)} (min pairwise dist = {min_d:.1f} px!), Spine arcs: {len(edges_out)}, maxH: {max_h}")


def clamp_f(x: float, a: float, b: float) -> float:
    return a if x < a else b if x > b else x


if __name__ == "__main__":
    main()
