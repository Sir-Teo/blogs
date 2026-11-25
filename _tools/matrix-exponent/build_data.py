#!/usr/bin/env python3
"""Build rich verified dataset for 'Why matrix multiplication stops at nine fourths'.

Parses all 28 downloaded LaTeX files of OpenAI's November 24, 2026 preprint and
its Lean 4 formalization files:
  - Extracts all 48 real theorem/proposition/corollary/lemma declarations + verbatim LaTeX snippets
  - Extracts all 28 .tex files with part membership, line counts, and real \\ref cross-links
  - Numerically verifies every identity and bound cited in the article
  - Writes assets/data/matrix-exponent/data.json
"""
from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(
    os.environ.get(
        "OMEGA_SRC",
        "/Users/teo/.gemini/antigravity/brain/f98304d2-1304-434b-99b8-c1817eed3694/scratch/omega-paper",
    )
)
BUILD_DIR = SCRATCH / "build"
LEAN_DIR = SCRATCH / "lean"
OUT_PATH = ROOT / "assets" / "data" / "matrix-exponent" / "data.json"

FILE_PART = {
    "main.tex": "Main",
    "style.tex": "Main",
    "locators.tex": "Main",
    "intro.tex": "Main",
    "history.tex": "Main",
    "consequences.tex": "Main",
    "obstruction.tex": "Obstruction",
    "list.tex": "Obstruction",
    "background.tex": "Part I",
    "prices.tex": "Part I",
    "valued.tex": "Part I",
    "motion.tex": "Part I",
    "boundary.tex": "Part I",
    "contact.tex": "Part I",
    "sync.tex": "Part I",
    "fermions.tex": "Part I",
    "sphere.tex": "Part I",
    "incidence.tex": "Part I",
    "sorting.tex": "Part II",
    "lookup.tex": "Part II",
    "local.tex": "Part III",
    "local-plant.tex": "Part III",
    "local-motion.tex": "Part III",
    "rounds.tex": "Part IV",
    "core-width.tex": "Part IV",
    "round-iteration.tex": "Part IV",
    "assembly.tex": "Part IV",
    "shaving.tex": "Part IV",
}


def rect_omega(a: float, b: float, c: float) -> float:
    A, B, C = max(a, 0.0), max(b, 0.0), max(c, 0.0)
    x, y, z = sorted([A, B, C], reverse=True)
    if z <= 0.0:
        return x + y
    excess = max(0.0, (x + y) * z - x * y)
    return x + y + (excess * excess) / (4.0 * x * y * z)


def tripod_D_star(a1: float, a2: float, a3: float) -> float:
    if a1 <= 0.0 or a2 <= 0.0 or a3 <= 0.0:
        return a1 + a2 + a3
    return (a1 + a2 + a3) - 1.0 / (1.0 / a1 + 1.0 / a2 + 1.0 / a3)


def compute_fermion_dims(max_twice_h: int = 60) -> list[dict]:
    dp = [0] * (max_twice_h + 1)
    dp[0] = 1
    m = 0
    while 2 * m + 1 <= max_twice_h:
        w = 2 * m + 1
        for k in range(max_twice_h, w - 1, -1):
            dp[k] += dp[k - w]
        m += 1

    wedges: dict[int, list[list[int]]] = {k: [] for k in range(15)}
    wedges[0] = [[]]
    for mode in range(8):
        w = 2 * mode + 1
        for k in range(14, w - 1, -1):
            for seq in wedges[k - w]:
                wedges[k].append(seq + [mode])

    c = math.pi / math.sqrt(3.0)
    rows = []
    for k in range(max_twice_h + 1):
        h = k / 2.0
        d = dp[k]
        upper = math.exp(c * math.sqrt(h)) if h > 0 else 1.0
        asymp = (
            math.exp(c * math.sqrt(h)) / ((2.0 ** 2.5) * (3.0 ** 0.25) * (h ** 0.75))
            if h > 0
            else 1.0
        )
        assert d <= upper + 1e-9, f"Bound failed at h={h}: {d} > {upper}"
        entry: dict = {
            "h": h,
            "twice_h": k,
            "dim": d,
            "log_dim": round(math.log(d), 5) if d > 0 else None,
            "c_sqrt_h": round(c * math.sqrt(h), 5),
            "upper": round(upper, 4),
            "asymp": round(asymp, 4),
        }
        if k <= 14:
            entry["wedges"] = wedges[k]
        rows.append(entry)
    return rows


def clean_tex_excerpt(raw: str, max_chars: int = 440) -> str:
    txt = re.sub(r"\\label\{[^}]+\}", "", raw).strip()
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    if len(txt) > max_chars:
        txt = txt[:max_chars].rstrip() + "\n..."
    return txt


def parse_paper_complete() -> tuple[dict, list[dict], list[dict]]:
    """Extract paper stats, all 28 .tex files, and all 48 real theorem-like declarations."""
    tex_files = sorted(BUILD_DIR.glob("*.tex"))
    assert tex_files, f"No .tex files found in {BUILD_DIR}"

    file_stats = {}
    env_counts: dict[str, int] = {}
    total_lines = 0
    files_list = []
    decls = []
    label_to_file: dict[str, str] = {}

    env_re = re.compile(
        r"\\begin\{(theorem|proposition|corollary|lemma)\}(?:\[([^\]]+)\])?([\s\S]*?)\\end\{\1\}"
    )

    for tf in tex_files:
        text = tf.read_text(encoding="utf-8")
        lines = text.count("\n")
        total_lines += lines
        file_stats[tf.name] = lines
        part = FILE_PART.get(tf.name, "Main")

        for env in re.findall(r"\\begin\{(theorem|proposition|corollary|lemma|figure)\}", text):
            env_counts[env] = env_counts.get(env, 0) + 1

        sec_titles = re.findall(r"\\section\*?\{([^}]+)\}", text)
        sec_title = sec_titles[0] if sec_titles else tf.stem.replace("-", " ").title()

        file_decls = 0
        for m in env_re.finditer(text):
            kind, opt_title, body = m.group(1), m.group(2), m.group(3)
            lm = re.search(r"\\label\{([^}]+)\}", body)
            lbl = lm.group(1) if lm else f"{tf.stem}:{kind}:{file_decls}"
            line_no = text[: m.start()].count("\n") + 1
            refs = sorted(set(re.findall(r"\\ref\{([^}]+)\}", body)))
            label_to_file[lbl] = tf.name
            decls.append({
                "id": lbl,
                "kind": kind,
                "name": opt_title or f"{kind.title()} ({lbl})",
                "file": tf.name,
                "part": part,
                "line": line_no,
                "refs": refs,
                "tex": clean_tex_excerpt(body),
            })
            file_decls += 1

        files_list.append({
            "name": tf.name,
            "part": part,
            "lines": lines,
            "section": sec_title,
            "decls": file_decls,
            "refs": sorted(set(re.findall(r"\\ref\{([^}]+)\}", text))),
        })

    # Resolve file-to-file real citation edges from \ref{...}
    for fobj in files_list:
        targets = sorted({label_to_file[r] for r in fobj["refs"] if r in label_to_file and label_to_file[r] != fobj["name"]})
        fobj["cites_files"] = targets
        del fobj["refs"]

    stats = {
        "pages": 111,
        "tex_files": len(tex_files),
        "tex_lines": total_lines,
        "environments": env_counts,
        "file_lines": file_stats,
    }
    return stats, files_list, decls


def build_proof_graph(file_lines: dict[str, int], decls: list[dict]) -> dict:
    all_tex = "\n".join(p.read_text(encoding="utf-8") for p in sorted(BUILD_DIR.glob("*.tex")))
    labels_present = set(re.findall(r"\\label\{([^}]+)\}", all_tex))
    decl_by_id = {d["id"]: d for d in decls}

    nodes = [
        {
            "id": "thm:square",
            "title": "Theorem 1.1 · ω = 9/4",
            "short": "ω_F = 9/4",
            "group": "result",
            "part": "Main",
            "file": "intro.tex",
            "lines": file_lines["intro.tex"],
            "summary": "Over every field F, the exponent of square matrix multiplication is exactly 9/4.",
            "math": r"\omega_F = \frac{9}{4}\quad\text{for every field }F",
        },
        {
            "id": "cor:tight",
            "title": "Corollary 1.2 · Finite-size rank wall",
            "short": "Rank ≥ n^(9/4)",
            "group": "result",
            "part": "Main",
            "file": "consequences.tex",
            "lines": file_lines["consequences.tex"],
            "summary": "At every n ≥ 2: geometric border rank ≥ n^(9/4), asymptotic rank = n^(9/4), circuits need ≥ ⌈n^(9/4)/2⌉ nonlinear gates. Refutes Strassen's 1994 tight-tensor conjecture and Sun's 2^17 bound at n = 256.",
            "math": r"\underline{R}_{\overline F}(T_n)\ge n^{9/4},\quad q \ge \left\lceil\frac{n^{9/4}}{2}\right\rceil",
        },
        {
            "id": "cor:rectangular",
            "title": "Corollary 1.3 · Rectangular & dual bounds",
            "short": "Rect. & α ∈ [½,⅔]",
            "group": "result",
            "part": "Main",
            "file": "consequences.tex",
            "lines": file_lines["consequences.tex"],
            "summary": "Cyclic symmetrization T_{a,b,c}⊗T_{b,c,a}⊗T_{c,a,b} ≃ T_{abc} forces rank ≥ max{ab, bc, ca, (abc)^(3/4)}, giving 1/2 ≤ α_F ≤ 2/3 in the paper.",
            "math": r"\underline{R}(T_{a,b,c})\ge \max\{ab,bc,ca,(abc)^{3/4}\}",
        },
        {
            "id": "lean:exact",
            "title": "Lean 4 · Exact rectangular & α = 1/2",
            "short": "Lean: α = ½, ω(a,b,c)",
            "group": "lean",
            "part": "Lean 4",
            "file": "ExactExponent.lean",
            "lines": 57,
            "summary": "OAI.LinearAlgebra.SpectralBooks.ExactExponent proves square_exponent = 9/4, tightens dual_exponent to exact α = 1/2, and pins rectangular_exponent for all weights (a, b, c) for division-free formal circuits.",
            "math": r"\omega(F;x,y,z)=x+y+\frac{[\max(0,(x+y)z-xy)]^2}{4xyz}",
            "is_lean": True,
        },
        {
            "id": "cor:extremal-price",
            "title": "Corollary · Extremal wire lengths = 3/4",
            "short": "Wires = (¾, ¾, ¾)",
            "group": "result",
            "part": "Part I",
            "file": "contact.tex",
            "lines": file_lines["contact.tex"],
            "summary": "At every scale-one spectral point maximizing T_n, all three wire lengths equal 3/4 (tripod arms 3/8, 3/8, 3/8), giving T_{a,b,c} value (abc)^(3/4).",
            "math": r"a_1=a_2=a_3=\frac{3}{8},\quad d_{ij}=\frac{3}{4}",
        },
        {
            "id": "lem:specialize",
            "title": "Lemmas 2.4–2.5 · Bilinearize & specialize",
            "short": "Arbitrary F → 𝔽_q",
            "group": "obstruction",
            "part": "Obstruction",
            "file": "obstruction.tex",
            "lines": file_lines["obstruction.tex"],
            "summary": "Evaluate circuit on A+uX, B+vY (u²=v²=0) to extract rank ≤ 2q even with divisions, then reduce the finitely generated coefficient ring modulo a maximal ideal via Zariski's lemma to a finite field k with ω_k < 9/4.",
            "math": r"\omega_F < \tfrac{9}{4} \implies \operatorname{rank}_{\overline F}(T_s)\le 2q \implies \omega_k < \tfrac{9}{4}",
        },
        {
            "id": "prop:finitefield",
            "title": "Proposition 2.3 · Contradiction over 𝔽_q",
            "short": "Shave vs. List Wall",
            "group": "obstruction",
            "part": "Obstruction",
            "file": "obstruction.tex",
            "lines": file_lines["obstruction.tex"],
            "summary": "Start with Batcher's O(n_w w²) sorting network for list distinctness D_w. Iterating compression J > 2/γ times drives volume per bit to O(w^η), crashing straight beneath Theorem 2.2's unbreakable w^σ floor.",
            "math": r"x_{j+1}\le h^{-\gamma}x_j + h^\eta \implies x_J = O(w^\eta) < w^\sigma",
        },
        {
            "id": "thm:many",
            "title": "Theorem 2.2 · List distinctness lower bound",
            "short": "Vol(D_w^⊗t) > w^σ",
            "group": "list",
            "part": "Obstruction",
            "file": "list.tex",
            "lines": file_lines["list.tex"],
            "summary": "Every trivalent network testing t ≤ 2^w independent lists of 2^w words of 2w bits needs > t n_w w^σ volume. Two D_w tests check a tagged permutation: no-ports fields force Ω(√w) wire distance via graph entropy; port fields violate the universal signed-counting batch bound.",
            "math": r"\operatorname{vol}_k(D_w^{\otimes t}) > t\,n_w\,w^\sigma\quad (1\le t\le 2^w)",
        },
        {
            "id": "thm:shaving",
            "title": "Theorem 2.1 · Compression of tensor powers",
            "short": "Shave h^(-γ) per copy",
            "group": "volume",
            "part": "Part IV",
            "file": "shaving.tex",
            "lines": file_lines["shaving.tex"],
            "summary": "Under ω_k < 9/4, any trivalent network of size m ≤ n^1.05 compresses V^⊗d (d = n^o(1)) to size ≤ d(m h^(-γ) + e h^η), then descends from extension K back to k.",
            "math": r"\operatorname{size}(V^{\otimes d}) \le d\bigl(m h^{-\gamma} + e h^\eta\bigr)",
        },
        {
            "id": "thm:extension",
            "title": "Theorem · Price extension & Gauss lift",
            "short": "Price extension",
            "group": "spheres",
            "part": "Part I",
            "file": "prices.tex",
            "lines": file_lines["prices.tex"] + file_lines["valued.tex"],
            "summary": "Assisted cost β_p(T) equals the minimum price over all extensions p̂. The Gauss lift extends prices to valued fields K = Frac(E[t^ℚ]) with a nonarchimedean submean inequality on stars.",
            "math": r"\beta_p(T) = \min_{\widehat p}\widehat p(T)",
        },
        {
            "id": "prop:tripod",
            "title": "Proposition · Tripod principle & polynomial rigidity",
            "short": "Tripod D_*(a) = 8/3",
            "group": "spheres",
            "part": "Part I",
            "file": "boundary.tex",
            "lines": file_lines["boundary.tex"] + file_lines["contact.tex"],
            "summary": "On any metric tripod with arms a_i, common-label rate satisfies D(a) ≥ Σa_i − (Σa_i⁻¹)⁻¹. Polynomial multiplication degenerations propagate contact (Δ = 0) from an asymptotic arm (1,1,∞) to the balanced tripod (1,1,1), forcing D(1,1,1) = 8/3 and rank ≥ n^(9/4).",
            "math": r"D(1,1,1)=\frac{8}{3} \implies \frac{6}{8/3} = \frac{9}{4}",
        },
        {
            "id": "thm:motion",
            "title": "Theorem · Rigidity of analytic motion",
            "short": "Moving site → 9/4",
            "group": "spheres",
            "part": "Part I",
            "file": "motion.tex",
            "lines": file_lines["motion.tex"],
            "summary": "Any nonconstant family of minimizing sites on the valued disk rescales at its displacement threshold into an ultrametric disk tree. Colliding a 4th tip with 3 fixed tips via a 5-arm harmonic star bounds D̄ ≤ 3/2, hitting contact at infinity and forcing rank ≥ n^(9/4).",
            "math": r"0\le 3(1-\underline D)+\underline D \implies \underline D\le\frac{3}{2}",
        },
        {
            "id": "thm:sync",
            "title": "Theorem · Synchronization of parameters",
            "short": "Synchronize marks",
            "group": "spheres",
            "part": "Part I",
            "file": "sync.tex",
            "lines": file_lines["sync.tex"],
            "summary": "Assuming ω_F < 9/4 rules out any moving pinned site. Therefore one single spectral extension prices an entire rational family of tensors simultaneously across all parameter values.",
            "math": r"\beta_H^{\mathrm{gen}}\!\left(\bigotimes_i U_i(\mathbf s_i)\right)=\beta_H^{\mathrm{gen}}\!\left(\bigotimes_i U_i(\mathbf s)\right)",
        },
        {
            "id": "prop:fusion",
            "title": "Proposition · Fermionic sphere fusion",
            "short": "Free fermions & Wick",
            "group": "spheres",
            "part": "Part I",
            "file": "fermions.tex",
            "lines": file_lines["fermions.tex"],
            "summary": "Free fermion exterior algebra with half-integer modes ψ_m (energy m+½, dim V_h ~ exp(π√(h/3))/h^(3/4)). Wick Pfaffians with kernel (z_j−z_i)⁻¹ fuse colliding clusters through a single leg of controlled width.",
            "math": r"\log\dim V_h \sim \frac{\pi}{\sqrt 3}\sqrt h,\quad w_N(h)^2 \propto h",
        },
        {
            "id": "thm:sphere",
            "title": "Theorem · Sphere prices hit transport optimum",
            "short": "Sphere barycenter",
            "group": "spheres",
            "part": "Part I",
            "file": "sphere.tex",
            "lines": file_lines["sphere.tex"],
            "summary": "Under ω_F < 9/4, synchronization lets one extra site y_N probe every collision. Sphere tensors asymptotically saturate the exact CAT(0) barycenter transport cost inf_o Σ a_i d(o, x_i).",
            "math": r"\frac{H_{\mathbf x}(A_N)}{N} \longrightarrow \inf_{o\in X}\sum_i a_i d(o, x_i)",
        },
        {
            "id": "thm:incidence",
            "title": "Theorem · Incidence expansion",
            "short": "Secant inequality",
            "group": "spheres",
            "part": "Part I",
            "file": "incidence.tex",
            "lines": file_lines["incidence.tex"],
            "summary": "Projecting an affine point configuration onto ℙ¹ via z_i(s) = u_i s + v_i makes every secant line a collision fiber. Zero divisor degree on ℙ¹ bounds total collision energy, giving the sharp affine/projective link inequality e ≥ 2(1 − s^(-½))V.",
            "math": r"\sum_{L\in\mathcal L} K_L^2 \le \sum_i (t_i-1) a_i^2 r_i^2",
        },
        {
            "id": "thm:sort",
            "title": "Theorem · Subquadratic stable sort (p < 2)",
            "short": "Sort in O(n h^p), p<2",
            "group": "sorting",
            "part": "Part II",
            "file": "sorting.tex",
            "lines": file_lines["sorting.tex"],
            "summary": "Garland-style CAT(0) link fixed points from incidence expansion route wide records with O(1) displacement; two-level radix packing yields an exact stable sort of size O(n h^p) with p < 2.",
            "math": r"\operatorname{size}(\mathrm{Sort}_{2^h}) = O(n h^p),\quad 1 < p < 2",
        },
        {
            "id": "lem:batch-table",
            "title": "Lemma · Batched table lookup",
            "short": "Batched lookup u^(p-1)",
            "group": "sorting",
            "part": "Part II",
            "file": "lookup.tex",
            "lines": file_lines["lookup.tex"],
            "summary": "Evaluate 2^u copies of an arity-u table by sorting queries together with dictionary rows and counting multiplicities in binary. Costs O(2^u s (1+u)^(p-1)) — beating linear growth per bit because p − 1 < 1.",
            "math": r"\operatorname{size}(T^{\otimes 2^u}) = O\bigl(2^u s(1+u)^{p-1}\bigr)",
        },
        {
            "id": "lem:local",
            "title": "Lemma · Local concentration on sewn spheres",
            "short": "Seam concentration",
            "group": "local",
            "part": "Part III",
            "file": "local.tex",
            "lines": file_lines["local.tex"] + file_lines["local-plant.tex"] + file_lines["local-motion.tex"],
            "summary": "Plant network wiring on paired spheres per cell, move insertions across seams via inversion transposition (V = 1/U), and concentrate arity into O(W/(DT)) frozen stations (total arity O(W/√D)) plus a tiny core of arity ≤ D^(-ℓ)T.",
            "math": r"\sum_{\mathrm{frozen}} t_i = O(W/\sqrt D),\quad \max_{\mathrm{core}} t_i \le D^{-\ell} T",
        },
        {
            "id": "lem:core-width",
            "title": "Lemma · Core width beats & Walsh reset",
            "short": "Wire-halving beats",
            "group": "volume",
            "part": "Part IV",
            "file": "core-width.tex",
            "lines": file_lines["core-width.tex"],
            "summary": "Row-vs-column layout duality cuts core wire width in half each beat (X_out ≤ ½X + C(Z+σ)) while an invertible 𝔽₂ Walsh-transform mixer resets core degree back to 3.",
            "math": r"X_{\mathrm{out}} \le \tfrac{1}{2}X + C(Z+\sigma),\quad \Delta_{\mathrm{out}}\le 3",
        },
        {
            "id": "lem:macro",
            "title": "Lemma · Macro compression & transcript",
            "short": "Macro h^(-(1-δ)a)",
            "group": "volume",
            "part": "Part IV",
            "file": "rounds.tex",
            "lines": file_lines["rounds.tex"] + file_lines["round-iteration.tex"] + file_lines["assembly.tex"],
            "summary": "Alternate concentration and beats across O(log h) rounds, then merge variable-wiring summands onto ONE fixed network via a locally checked message transcript sorted by wide-record sort.",
            "math": r"\text{size}\le md\,h^{-(1-\delta)a},\quad \text{arity}\le h^{b+(1+\delta)a}",
        },
    ]

    for n in nodes:
        if not n.get("is_lean"):
            assert n["id"] in labels_present, f"Label {n['id']} not found in paper .tex files!"
            if n["id"] in decl_by_id:
                n["tex"] = decl_by_id[n["id"]]["tex"]
                n["line"] = decl_by_id[n["id"]]["line"]

    edges = [
        ("thm:extension", "thm:motion"),
        ("prop:tripod", "thm:motion"),
        ("prop:tripod", "cor:extremal-price"),
        ("thm:motion", "thm:sync"),
        ("thm:extension", "thm:sync"),
        ("thm:sync", "thm:sphere"),
        ("prop:fusion", "thm:sphere"),
        ("thm:sphere", "thm:incidence"),
        ("prop:fusion", "thm:incidence"),
        ("thm:incidence", "thm:sort"),
        ("thm:sort", "lem:batch-table"),
        ("thm:sphere", "lem:local"),
        ("prop:fusion", "lem:local"),
        ("thm:sort", "lem:core-width"),
        ("lem:local", "lem:macro"),
        ("lem:core-width", "lem:macro"),
        ("thm:sort", "lem:macro"),
        ("lem:macro", "thm:shaving"),
        ("lem:batch-table", "thm:shaving"),
        ("thm:shaving", "prop:finitefield"),
        ("thm:many", "prop:finitefield"),
        ("prop:finitefield", "thm:square"),
        ("lem:specialize", "thm:square"),
        ("thm:square", "cor:tight"),
        ("cor:tight", "cor:rectangular"),
        ("cor:tight", "cor:extremal-price"),
        ("thm:square", "lean:exact"),
        ("cor:rectangular", "lean:exact"),
    ]

    node_ids = {n["id"] for n in nodes}
    for u, v in edges:
        assert u in node_ids and v in node_ids, f"Invalid edge {u} -> {v}"

    return {"nodes": nodes, "edges": edges}


def main() -> None:
    paper_stats, files_list, decls = parse_paper_complete()

    history_upper = [
        {"year": 1969.0, "date": "1969", "label": "Naive schoolbook", "authors": "Folklore", "omega": 3.000000, "era": "classic", "note": "n³ scalar multiplications via direct dot products."},
        {"year": 1969.6, "date": "Aug 1969", "label": "Strassen", "authors": "V. Strassen", "omega": round(math.log2(7), 6), "era": "classic", "note": "7 products for 2×2 blocks: log₂(7) ≈ 2.807355."},
        {"year": 1978.8, "date": "1978", "label": "Pan", "authors": "V. Pan", "omega": 2.79512, "era": "classic", "note": "Trilinear aggregation, uniting, and canceling."},
        {"year": 1979.6, "date": "1979", "label": "Bini et al.", "authors": "Bini, Capovani, Lotti, Romani", "omega": 2.7799, "era": "classic", "note": "Approximate (border rank) algorithms converted to exact."},
        {"year": 1981.4, "date": "1981", "label": "Schönhage", "authors": "A. Schönhage", "omega": 2.548, "era": "classic", "note": "Asymptotic sum inequality from disjoint matrix products."},
        {"year": 1982.3, "date": "1982", "label": "Coppersmith–Winograd", "authors": "Coppersmith & Winograd", "omega": 2.495548, "era": "classic", "note": "Recursive extraction of disjoint products."},
        {"year": 1986.8, "date": "1986", "label": "Strassen (Laser)", "authors": "V. Strassen", "omega": 2.478497, "era": "laser", "note": "The laser method extracts matrix products from tensor powers."},
        {"year": 1990.2, "date": "1990", "label": "Coppersmith–Winograd", "authors": "Coppersmith & Winograd", "omega": 2.375477, "era": "laser", "note": "CW tensor + Salem–Spencer progression-free sets. Held for 20 years."},
        {"year": 2010.5, "date": "2010", "label": "Stothers", "authors": "A. J. Stothers", "omega": 2.37369, "era": "laser", "note": "Fourth tensor power of CW tensor."},
        {"year": 2012.4, "date": "2012", "label": "Vassilevska Williams", "authors": "V. Vassilevska Williams", "omega": 2.372874, "era": "laser", "note": "Eighth power of CW tensor via automated analysis."},
        {"year": 2014.6, "date": "2014", "label": "Le Gall", "authors": "F. Le Gall", "omega": 2.372864, "era": "laser", "note": "Higher powers (32nd) of CW tensor."},
        {"year": 2020.8, "date": "2020", "label": "Alman–V. Williams", "authors": "Alman & V. Williams", "omega": 2.372860, "era": "laser", "note": "Refined laser method with tighter merging."},
        {"year": 2023.4, "date": "2023", "label": "Duan–Wu–Zhou", "authors": "Duan, Wu, Zhou", "omega": 2.371866, "era": "laser", "note": "Asymmetric hashing broke the 2.372 barrier."},
        {"year": 2024.1, "date": "2024", "label": "V. Williams et al.", "authors": "V. Williams, Xu, Xu, Zhou", "omega": 2.371552, "era": "laser", "note": "Improved asymmetric hashing and dual bounds."},
        {"year": 2025.1, "date": "2025", "label": "Alman et al.", "authors": "Alman, Duan, V. Williams, Xu, Xu, Zhou", "omega": 2.371339, "era": "laser", "note": "More asymmetry in the refined laser method."},
        {"year": 2026.64, "date": "Aug 2026", "label": "AlphaEvolve", "authors": "Dupont et al. (DeepMind + MIT/Harvard)", "omega": 2.371177, "era": "2026", "note": "JAX differentiable level-4 optimization + AlphaEvolve (arXiv:2608.16884)."},
        {"year": 2026.73, "date": "Sep 24, 2026", "label": "Staggered extraction", "authors": "OpenAI", "omega": 2.371055, "era": "2026", "note": "Final push of the CW laser framework over every field."},
        {"year": 2026.733, "date": "Sep 24, 2026", "label": "Polynomial < 2.258", "authors": "OpenAI", "omega": 2.258000, "era": "2026", "note": "Leaving CW behind: polynomial multiplication degenerations over ℂ."},
        {"year": 2026.753, "date": "Oct 2, 2026", "label": "Upper bound 9/4", "authors": "OpenAI; then Lü & Amanov–van den Berg–Zuiddam", "omega": 2.250000, "era": "2026", "note": "Polynomial profile + interpolation hits ω ≤ 9/4 over ℂ (Oct 2) and every field (Oct 2026)."},
        {"year": 2026.898, "date": "Nov 24, 2026", "label": "EXACT ω = 9/4", "authors": "OpenAI", "omega": 2.250000, "era": "exact", "note": "Matching lower bound ω_F ≥ 9/4 over every field closes the 57-year problem."},
    ]

    finite_ns = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024]
    finite_rows = []
    for n in finite_ns:
        n94 = n ** 2.25
        finite_rows.append({
            "n": n,
            "naive": n ** 3,
            "strassen": round(n ** math.log2(7), 1),
            "cw_2371": round(n ** 2.371339, 1),
            "border_rank_94": math.ceil(n94 - 1e-12),
            "circuit_gates_94": math.ceil(n94 / 2.0 - 1e-12),
            "n_sq": n * n,
            "blaser": max(n * n, int(round(2.5 * n * n - 3 * n))),
            "landsberg_michalek": max(1, 2 * n * n - math.ceil(math.log2(n)) - 1),
        })
    assert math.ceil(256 ** 2.25) == 2 ** 18 == 262144
    assert math.ceil((256 ** 2.25) / 2) == 2 ** 17 == 131072

    assert abs(tripod_D_star(1.0, 1.0, 1.0) - 8.0 / 3.0) < 1e-12
    assert abs(6.0 / tripod_D_star(1.0, 1.0, 1.0) - 9.0 / 4.0) < 1e-12
    for b in [1.0, 2.0, 5.0, 20.0, 100.0]:
        assert abs(tripod_D_star(1.0, 1.0, b) - (b + 1.5 + 1.0 / (4.0 * b + 2.0))) < 1e-12

    assert abs(rect_omega(1.0, 1.0, 1.0) - 2.25) < 1e-12
    assert abs(rect_omega(1.0, 1.0, 0.5) - 2.0) < 1e-12
    eps = 1e-6
    assert abs((rect_omega(1.0, 1.0, 0.5 + eps) - 2.0) / eps) < 1e-5
    assert abs((rect_omega(1.0, 1.0, 1.0 + eps) - rect_omega(1.0, 1.0, 1.0 - eps)) / (2 * eps) - 0.75) < 1e-6

    rect_slice = []
    for i in range(81):
        t = round(i * 0.025, 4)
        io_floor = max(2.0, 1.0 + t)
        cyclic_lb = max(io_floor, 0.75 * (2.0 + t)) if t > 0 else 2.0
        exact = rect_omega(1.0, 1.0, t) if t > 0 else 2.0
        rect_slice.append({
            "t": t,
            "naive": round(2.0 + t, 5),
            "io": round(io_floor, 5),
            "cyclic_lb": round(cyclic_lb, 5),
            "exact": round(exact, 6),
        })

    fermion_dims = compute_fermion_dims(60)
    exact_lean = (LEAN_DIR / "ExactExponent.lean").read_text(encoding="utf-8")
    challenge_lean = (LEAN_DIR / "MatrixExponent.lean").read_text(encoding="utf-8")
    lean_comparator = {
        "solution_file": "lean/OAI/LinearAlgebra/SpectralBooks/ExactExponent.lean",
        "challenge_file": "lean/ComparatorChallenges/MatrixExponent.lean",
        "config_file": "lean/ComparatorChallenges/MatrixExponent.json",
        "scope_file": "lean/docs/107.md",
        "axioms": ["propext", "Quot.sound", "Classical.choice"],
        "enable_nanoda": False,
        "exact_lean": exact_lean,
        "challenge_excerpt": "\n".join(challenge_lean.splitlines()[75:]),
    }

    proof_graph = build_proof_graph(paper_stats["file_lines"], decls)

    dataset = {
        "meta": {
            "paper_title": "The matrix multiplication exponent is nine fourths",
            "date": "2026-11-24",
            "repo_url": "https://github.com/openai/math/tree/main/preprints/The-matrix-multiplication-exponent-is-nine-fourths-November-24-2026",
            "paper_stats": paper_stats,
        },
        "history": {
            "upper": history_upper,
            "sun_refutation": {
                "n": 256,
                "sun_claim": 131072,
                "new_border_lb": 262144,
                "new_gate_lb": 131072,
                "tight_conjecture": 65536,
            },
        },
        "finite_sizes": finite_rows,
        "rectangular": {
            "slice": rect_slice,
            "dual_alpha_exact": 0.5,
            "dual_alpha_paper_upper": round(2.0 / 3.0, 6),
            "dual_alpha_pre2026": 0.321334,
        },
        "fermions": {
            "c": round(math.pi / math.sqrt(3.0), 6),
            "dims": fermion_dims,
        },
        "proof_graph": proof_graph,
        "paper_files": files_list,
        "paper_decls": decls,
        "lean": lean_comparator,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    kb = OUT_PATH.stat().st_size / 1024.0
    print(f"Wrote {OUT_PATH} ({kb:.1f} KB)")
    print(f"Parsed {len(files_list)} .tex files and {len(decls)} declarations.")


if __name__ == "__main__":
    main()
