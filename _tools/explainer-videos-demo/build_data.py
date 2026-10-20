#!/usr/bin/env python3
"""Build assets/data/explainer-videos-demo.json, explainer-barcodes.webp and explainer-frames.webp
directly from the explainer-videos repository."""

from __future__ import annotations

import ast
import glob
import importlib
import json
import math
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(os.environ.get("EXPLAINER_VIDEOS", "/Users/teodev/Developer/explainer-videos")).resolve()
sys.path.insert(0, str(REPO))

from explainer import lang, style, tts  # noqa: E402
from explainer.paths import video_dir, video_package  # noqa: E402
from videos.analysis.analysis4.common import load as load_a4  # noqa: E402

BG = np.array([0x0E, 0x11, 0x17], dtype=np.int16)
BG_F = np.array([0x0E, 0x11, 0x17], dtype=np.float32)

FILMS = [
    ("navier_stokes", "Navier–Stokes", "physics", "standalone"),
    ("llm", "How LLMs Work", "ml", "standalone"),
    ("opposing_forces", "Opposing Forces", "markets", "standalone"),
    ("riemann", "Riemann Hypothesis", "math", "standalone"),
    ("open_models", "Open Frontier", "ml", "standalone"),
    ("frontier", "Frontier Training", "ml", "standalone"),
    ("rl", "RL for LLMs", "ml", "standalone"),
    ("stochastic", "Stochastic Calculus", "math", "standalone"),
    ("trading", "Real-Time Trading", "markets", "standalone"),
    ("quantum", "Quantum Mechanics I", "physics", "standalone"),
    ("relativity", "General Relativity I", "physics", "standalone"),
    ("relativity2", "General Relativity II", "physics", "standalone"),
    ("quantum2", "Quantum Mechanics II", "physics", "standalone"),
    ("analysis1", "Analysis 1 · Reals & Space", "analysis", "series"),
    ("analysis2", "Analysis 2 · Limits & Series", "analysis", "series"),
    ("analysis3", "Analysis 3 · Integration", "analysis", "series"),
    ("analysis4", "Analysis 4 · Many Dimensions", "analysis", "series"),
    ("analysis5", "Analysis 5 · Lebesgue Measure", "analysis", "series"),
    ("analysis6", "Analysis 6 · Lᵖ & Hilbert Space", "analysis", "series"),
    ("analysis7", "Analysis 7 · Complex Analysis", "analysis", "series"),
    ("analysis8", "Analysis 8 · Banach Spaces", "analysis", "series"),
    ("analysis9", "Analysis 9 · Distributions", "analysis", "series"),
    ("analysis10", "Analysis 10 · Spectral Theorem", "analysis", "series"),
    ("ai1", "AI, Built 1 · Guessing Game", "ai", "series"),
]


def parse_srt(path: Path) -> list[tuple[float, float, str]]:
    if not path.exists():
        return []
    out = []
    for block in path.read_text(encoding="utf-8", errors="ignore").strip().split("\n\n"):
        lines = [l.strip() for l in block.splitlines() if l.strip()]
        if len(lines) < 3 or "-->" not in lines[1]:
            continue
        a, b = [s.strip() for s in lines[1].split("-->")]

        def sec(ts: str) -> float:
            hms, ms = ts.replace(".", ",").split(",")
            h, m, s = [int(x) for x in hms.split(":")]
            return h * 3600 + m * 60 + s + int(ms) / 1000.0

        try:
            out.append((sec(a), sec(b), " ".join(lines[2:])))
        except Exception:
            pass
    return out


def parse_chapters(path: Path) -> list[tuple[float, str]]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        ts, *rest = line.split(" ", 1)
        title = rest[0] if rest else ""
        parts = [int(x) for x in ts.split(":")]
        sec = parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0] * 3600 + parts[1] * 60 + parts[2]
        out.append((float(sec), title))
    return out


def ffprobe_dur(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    ).stdout.strip()
    return float(out or 0.0)


def extract_frame(mp4: Path, t: float, w: int = 384, h: int = 216) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.2f}", "-i", str(mp4),
         "-frames:v", "1", "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True,
    ).stdout
    if len(raw) < w * h * 3:
        return np.broadcast_to(np.uint8([0x0E, 0x11, 0x17]), (h, w, 3)).copy()
    return np.frombuffer(raw[: w * h * 3], dtype=np.uint8).reshape(h, w, 3)


def scan_keyframes_from_files(mp4_list: list[Path], w: int = 160, h: int = 90) -> tuple[np.ndarray, np.ndarray]:
    """Return (timestamps_sec, frames[N, H, W, 3]) from keyframe decode across one or more MP4s."""
    all_pts: list[float] = []
    all_frames: list[np.ndarray] = []
    offset = 0.0
    for mp4 in mp4_list:
        dur = ffprobe_dur(mp4)
        pts_out = subprocess.run(
            ["ffprobe", "-v", "error", "-skip_frame", "nokey", "-select_streams", "v",
             "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(mp4)],
            capture_output=True, text=True,
        ).stdout.splitlines()
        pts = []
        for x in pts_out:
            x = x.strip().strip(",")
            if x:
                try:
                    pts.append(float(x))
                except ValueError:
                    pass
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-skip_frame", "nokey", "-i", str(mp4), "-an", "-sn",
             "-fps_mode", "passthrough", "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True,
        ).stdout
        n = min(len(pts), len(raw) // (w * h * 3))
        if n > 0:
            frames = np.frombuffer(raw[: n * w * h * 3], dtype=np.uint8).reshape(n, h, w, 3)
            all_pts.extend(offset + p for p in pts[:n])
            all_frames.append(frames)
        offset += dur
    if not all_frames:
        return np.array([0.0]), np.zeros((1, h, w, 3), dtype=np.uint8)
    return np.array(all_pts), np.concatenate(all_frames, axis=0)


def parse_style_comments() -> dict[str, tuple[str, str, str]]:
    """Return {token_name: (hex_color, comment, group_label)} from explainer/style.py."""
    src = (REPO / "explainer/style.py").read_text(encoding="utf-8")
    group = "General"
    out: dict[str, tuple[str, str, str]] = {}
    for line in src.splitlines():
        s = line.strip()
        if s.startswith("# ") and not s.startswith("# ---"):
            hdr = s[2:].strip()
            if any(k in hdr for k in ("Fields", "Language models", "Markets", "Riemann", "Open frontier",
                                      "Training frontier", "Reinforcement", "Stochastic", "Trading",
                                      "Quantum", "General relativity", "Analysis,", "AI, Built")):
                group = hdr.split("(")[0].split(".")[0].strip()
        no_hex = re.sub(r'"#[0-9A-Fa-f]{6}"', "HEX", line)
        m = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=\s*([^,#]+?)(?:\s*,\s*)?(?:#\s*(.*))?$", no_hex)
        if m and hasattr(style.C, m.group(1)):
            name = m.group(1)
            val = str(getattr(style.C, name))
            comment = (m.group(3) or "").strip()
            out[name] = (val, comment, group)
    return out


def process_film(idx_spec):
    idx, (vid, short_title, series, group), youtube_map, style_info = idx_spec
    pkg = video_package(vid)
    vdir = video_dir(vid)
    manifest = importlib.import_module(f"{pkg}.manifest")

    # High-res master path + fast-scan path
    if (REPO / f"published/{vid}.mp4").exists():
        master_mp4 = REPO / f"published/{vid}.mp4"
        srt_path = REPO / f"published/{vid}.srt"
        chap_path = REPO / f"renders/{vid}.chapters.txt"
        scan_mp4s = [master_mp4]
    elif (REPO / f"renders/{vid}_2160p.mp4").exists():
        master_mp4 = REPO / f"renders/{vid}_2160p.mp4"
        srt_path = REPO / f"renders/{vid}_2160p.srt"
        chap_path = REPO / f"renders/{vid}_2160p.chapters.txt"
        stitch_dir = REPO / f"media/{vid}/stitch"
        scan_mp4s = [stitch_dir / f"{cls}.mp4" for _, cls, _ in manifest.SCENES if (stitch_dir / f"{cls}.mp4").exists()]
        if not scan_mp4s:
            scan_mp4s = [master_mp4]
    else:
        master_mp4 = REPO / f"renders/{vid}_480p.mp4"
        srt_path = REPO / f"renders/{vid}_480p.srt"
        chap_path = REPO / f"renders/{vid}_480p.chapters.txt"
        scan_mp4s = [master_mp4]

    dur = ffprobe_dur(master_mp4)
    zh_mp4 = REPO / f"renders/{vid}_2160p_zh.mp4"
    zh_dur = round(ffprobe_dur(zh_mp4), 1) if zh_mp4.exists() else None

    chapters = parse_chapters(chap_path)
    cues = parse_srt(srt_path)

    # Scan keyframes for barcode (300 cols x 24 rows) and coverage (90 bins)
    pts, frames = scan_keyframes_from_files(scan_mp4s, w=160, h=90)
    fracs = (np.abs(frames.astype(np.int16) - BG).max(axis=3) > 24).mean(axis=(1, 2))

    # Compute sparse runs (>= 1.5s below 0.30%)
    dt_kf = np.diff(pts, append=dur)
    sparse_sec = 0.0
    run_acc = 0.0
    sparse_runs = 0
    for f_val, dt in zip(fracs, dt_kf):
        if f_val < 0.003:
            run_acc += float(dt)
        else:
            if run_acc >= 1.5:
                sparse_sec += run_acc
                sparse_runs += 1
            run_acc = 0.0
    if run_acc >= 1.5:
        sparse_sec += run_acc
        sparse_runs += 1

    # Build 300-column x 24-row barcode strip
    BC_W, BC_H = 300, 24
    barcode = np.zeros((BC_H, BC_W, 3), dtype=np.uint8)
    for c in range(BC_W):
        t = (c + 0.5) / BC_W * dur
        k = max(0, min(len(pts) - 1, int(np.searchsorted(pts, t, side="right") - 1)))
        f = frames[k].astype(np.float32)
        # Vertical color profile amplified where pixels differ from BG
        diff_mask = (np.abs(f - BG_F).max(axis=2) > 20).astype(np.float32)  # (90, 160)
        active_cnt = diff_mask.sum(axis=1, keepdims=True)  # (90, 1)
        prof_active = (f * diff_mask[:, :, None]).sum(axis=1) / np.maximum(1.0, active_cnt)  # (90, 3)
        frac_row = active_cnt / f.shape[1]  # (90, 1)
        weight = np.clip(frac_row * 5.5, 0.0, 1.0)
        prof = BG_F * (1.0 - weight) + prof_active * weight
        # Downsample 90 -> 24 rows
        idx_rows = np.linspace(0, f.shape[0], BC_H + 1).astype(int)
        for r in range(BC_H):
            barcode[r, c] = np.clip(prof[idx_rows[r] : max(idx_rows[r] + 1, idx_rows[r + 1])].mean(axis=0), 0, 255)

    # 90-bin coverage curve
    COV_N = 90
    cov_bins = []
    for i in range(COV_N):
        t0, t1 = i / COV_N * dur, (i + 1) / COV_N * dur
        i0 = max(0, int(np.searchsorted(pts, t0, side="left")))
        i1 = max(i0 + 1, int(np.searchsorted(pts, t1, side="right")))
        cov_bins.append(round(float(fracs[i0:i1].mean() * 100), 2))

    # Extract 8 representative high-res keyframes (pick moments with rich pixel coverage across the film)
    K_FRAMES = 8
    sample_records = []
    sample_imgs = []
    for k in range(K_FRAMES):
        win_t0 = (k + 0.15) / K_FRAMES * dur
        win_t1 = (k + 0.85) / K_FRAMES * dur
        i0 = max(0, int(np.searchsorted(pts, win_t0)))
        i1 = max(i0 + 1, int(np.searchsorted(pts, win_t1)))
        # Pick the keyframe around the 75th percentile of coverage in that window (avoids chapter transitions)
        sub_fracs = fracs[i0:i1]
        target = np.percentile(sub_fracs, 80) if len(sub_fracs) else 0.05
        best_local = int(np.argmin(np.abs(sub_fracs - target))) if len(sub_fracs) else 0
        t_pick = float(pts[min(len(pts) - 1, i0 + best_local)])
        img = extract_frame(master_mp4, t_pick, 384, 216)
        sample_imgs.append(img)

        # Find chapter index and subtitle cue at t_pick
        ch_idx = 0
        for ci, (cs, _) in enumerate(chapters):
            if cs <= t_pick:
                ch_idx = ci
        cue_txt = ""
        for ca, cb, ctext in cues:
            if ca <= t_pick <= cb + 0.5:
                cue_txt = ctext
                break
        if not cue_txt and cues:
            nearest = min(cues, key=lambda c: abs(0.5 * (c[0] + c[1]) - t_pick))
            cue_txt = nearest[2]
        sample_records.append([round(t_pick, 1), ch_idx, cue_txt])

    # Count semantic C.<TOKEN> usage in this film's .py files
    tok_counts: dict[str, int] = {}
    for py in vdir.glob("*.py"):
        txt = py.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"\bC\.([A-Z][A-Z0-9_]*)\b", txt):
            tname = m.group(1)
            if tname not in ("TEXT", "DIM", "FAINT", "HIGHLIGHT") and tname in style_info:
                tok_counts[tname] = tok_counts.get(tname, 0) + 1
    top_tokens = sorted(tok_counts.items(), key=lambda kv: kv[1], reverse=True)[:6]

    print(f"  done [{idx+1:2d}/24] {vid:16s} {dur/60:5.1f}m  mean_cov={fracs.mean()*100:4.1f}%  sparse={sparse_sec:4.1f}s")
    return idx, {
        "id": vid,
        "title": manifest.TITLE,
        "short": short_title,
        "series": series,
        "group": group,
        "duration": round(dur, 1),
        "zh_duration": zh_dur,
        "scenes": len(manifest.SCENES),
        "cues": len(cues),
        "url": youtube_map.get(vid),
        "mean_cov": round(float(fracs.mean() * 100), 2),
        "p90_cov": round(float(np.percentile(fracs, 90) * 100), 2),
        "sparse_sec": round(sparse_sec, 1),
        "sparse_runs": sparse_runs,
        "chapters": [[round(s, 1), t] for s, t in chapters],
        "coverage": cov_bins,
        "samples": sample_records,
        "palette": [[k, v, style_info[k][0]] for k, v in top_tokens],
    }, barcode, sample_imgs


def build_contraction_score() -> tuple[dict, list[np.ndarray]]:
    """Build the bilingual 82-segment score and mathematical data for analysis4 Contraction."""
    en_dir = REPO / "media/analysis4/crf16/videos/s05_contraction/2160p60"
    zh_dir = REPO / "media/analysis4_zh/crf16/videos/s05_contraction/2160p60"
    en_meta = json.loads((en_dir / "Contraction.narration.json").read_text())
    zh_meta = json.loads((zh_dir / "Contraction.narration.json").read_text())

    def seg_files(d: Path) -> list[Path]:
        lst = d / "partial_movie_files/Contraction/partial_movie_file_list.txt"
        return [Path(l.split("file:", 1)[1].strip().strip("'")) for l in lst.read_text().splitlines() if l.startswith("file")]

    en_files = seg_files(en_dir)
    zh_files = seg_files(zh_dir)

    # Beat boundaries in segment indices (from s05_contraction.py):
    # 0..2: card (3 segs), 3..16: cobweb (14 segs), 17..50: proof (34 segs), 51..64: complete (14 segs), 65..81: newton (17 segs)
    def beat_of(i: int) -> int:
        if i <= 2:
            return 0
        if i <= 16:
            return 1
        if i <= 50:
            return 2
        if i <= 64:
            return 3
        return 4

    segments = []
    t_en, t_zh = 0.0, 0.0
    for i, (fe, fz) in enumerate(zip(en_files, zh_files)):
        de = ffprobe_dur(fe)
        dz = ffprobe_dur(fz)
        # A segment is a hold (wait / wait_until) if its duration differs between EN and ZH, or is a 0.15/0.3/0.4s pad
        is_wait = abs(de - dz) > 0.025 or round(de, 2) in (0.15, 0.30, 0.40)
        segments.append([
            round(t_en, 2), round(de, 2),
            round(t_zh, 2), round(dz, 2),
            "wait" if is_wait else "play",
            beat_of(i),
        ])
        t_en += de
        t_zh += dz

    def format_lines(meta: dict) -> list[dict]:
        out = []
        for ln in meta["lines"]:
            raw = ln["raw"]
            # Find bookmark word indices
            marks = {}
            pos = 0
            clean_parts = []
            for m in re.finditer(r"<bookmark\s+mark\s*=\s*['\"]([^'\"]+)['\"]\s*/>", raw):
                clean_parts.append(raw[pos : m.start()])
                w_idx = len(lang.tokens(lang.clean("".join(clean_parts))))
                words = ln["words"]
                t_mark = words[w_idx][1] if w_idx < len(words) else ln["start"] + ln["duration"]
                marks[m.group(1)] = [w_idx, round(t_mark, 2)]
                pos = m.end()
            out.append({
                "start": round(ln["start"], 2),
                "duration": round(ln["duration"], 2),
                "text": ln["text"],
                "marks": marks,
                "words": [[w[0], round(w[1], 2), round(w[2], 2)] for w in ln["words"]],
            })
        return out

    d = load_a4("contraction")
    # Also grab 4 high-res frames from Contraction.mp4 (one per beat) for reference
    c_mp4 = en_dir / "Contraction.mp4"
    beat_frames = [extract_frame(c_mp4, t, 384, 216) for t in (28.0, 74.0, 106.0, 138.0)]

    return {
        "scene": "Contraction",
        "file": "videos/analysis/analysis4/s05_contraction.py",
        "chapter": "4. The contraction principle",
        "en_duration": round(en_meta["duration"], 2),
        "zh_duration": round(zh_meta["duration"], 2),
        "beats": [
            {"id": "card", "title": "Chapter card", "seg_range": [0, 2], "en_t": 0.0},
            {"id": "cobweb", "title": "1 · Cobweb cos x = x", "seg_range": [3, 16], "en_t": 4.02},
            {"id": "proof", "title": "2 · Banach proof & Cauchy discs", "seg_range": [17, 50], "en_t": 39.42},
            {"id": "complete", "title": "3 · Why completeness matters (√2 ∉ ℚ)", "seg_range": [51, 64], "en_t": 84.19},
            {"id": "newton", "title": "4 · Newton's method (×575)", "seg_range": [65, 81], "en_t": 111.34},
        ],
        "en_lines": format_lines(en_meta),
        "zh_lines": format_lines(zh_meta),
        "segments": segments,
        "math": {
            "c": round(float(d["c"]), 6),
            "fix": round(float(d["fix"]), 10),
            "x": [round(float(v), 6) for v in d["x"][:31]],
            "errs": [float(f"{float(v):.3e}") for v in d["errs"][:31]],
            "bound": [float(f"{float(v):.3e}") for v in d["bound"][:31]],
            "xn": [round(float(v), 12) for v in d["xn"]],
            "nerr": [float(f"{float(v):.3e}") for v in d["nerr"]],
        },
    }, beat_frames


def build_palette_and_lexicon(style_info: dict[str, tuple[str, str, str]]) -> tuple[dict, dict]:
    """Scan all scene .py files in videos/ for semantic C.<TOKEN> usage and all narration lines for LEXICON hits."""
    tok_Uses: dict[str, int] = {}
    tok_Videos: dict[str, set[str]] = {}
    scene_files = sorted((REPO / "videos").glob("*/*/*.py"))
    for py in scene_files:
        vid = py.parent.name
        txt = py.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"\bC\.([A-Z][A-Z0-9_]*)\b", txt):
            t = m.group(1)
            if t in style_info and t not in ("TEXT", "DIM", "FAINT", "HIGHLIGHT"):
                tok_Uses[t] = tok_Uses.get(t, 0) + 1
                tok_Videos.setdefault(t, set()).add(vid)

    GROUP_MAP = {
        "Fields / quantities": "Physics & Fluids",
        "Quantum mechanics": "Physics & Fluids",
        "Quantum mechanics, part 2": "Physics & Fluids",
        "General relativity": "Physics & Fluids",
        "General relativity, part 2": "Physics & Fluids",
        "Language models": "Language Models & RL",
        "Open frontier models": "Language Models & RL",
        "Training frontier models": "Language Models & RL",
        "Reinforcement learning, derived": "Language Models & RL",
        "AI, Built": "AI, Built",
        "Analysis, from the real line to functional analysis": "Analysis, Built",
        "The Riemann hypothesis": "Number Theory & Stochastics",
        "Stochastic calculus": "Number Theory & Stochastics",
        "Markets and macro": "Markets & Trading",
        "Trading systems": "Markets & Trading",
    }

    tokens_out = []
    for name, (hex_val, comment, raw_grp) in style_info.items():
        if name in ("TEXT", "DIM", "FAINT", "HIGHLIGHT"):
            continue
        cnt = tok_Uses.get(name, 0)
        if cnt == 0:
            continue
        tokens_out.append({
            "name": name,
            "hex": hex_val,
            "desc": comment,
            "group": GROUP_MAP.get(raw_grp, "Physics & Fluids"),
            "count": cnt,
            "videos": len(tok_Videos.get(name, set())),
        })
    tokens_out.sort(key=lambda d: d["count"], reverse=True)

    # Scan all scene files for voiceover strings to count LEXICON rule matches
    vo_strings: list[tuple[str, str]] = []
    for py in scene_files:
        vid = py.parent.name
        txt = py.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r"with\s+self\.voiceover\((.*?)\)\s*(?:as\s+\w+\s*)?:", txt, re.DOTALL):
            sits = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', m.group(1))
            if sits:
                vo_strings.append((vid, re.sub(r"<bookmark[^>]*/>", "", "".join(sits))))

    total_hits = 0
    rule_hits: dict[str, tuple[int, str, str]] = {}
    for pat, repl in tts.LEXICON:
        rx = re.compile(pat)
        cnt = 0
        ex_vid, ex_sent = "", ""
        for vid, line in vo_strings:
            matches = list(rx.finditer(line))
            if matches:
                cnt += len(matches)
                if not ex_sent:
                    # Extract the sentence containing the first match
                    m0 = matches[0]
                    for sent in re.split(r"(?<=[.!?])\s+", line):
                        if rx.search(sent):
                            ex_vid, ex_sent = vid, sent.strip()
                            break
        total_hits += cnt
        rule_hits[pat] = (cnt, ex_vid, ex_sent[:160])

    FEATURED_LEX = [
        (r"\bdy\b", "dy", "Notation", '"die"', '"dee-why"', "Without an override, Misaki G2P reads the differential dy as the verb 'die'."),
        (r"\bm a\b", "F = m a", "Notation", '"Emma"', '"em ay"', "Spoken adjacent letters 'm a' coalesce into the name 'Emma' unless separated with IPA."),
        (r"\bRe\b", "Re", "Notation", '"ree"', '"ar-ee"', "The Reynolds number Re is pronounced as two letters, not the syllable 'ree'."),
        (r"\bli of\b", "li(x)", "Notation", '"lee of"', '"el-eye of"', "The logarithmic integral li(x) in prime counting."),
        (r"\bP/E\b", "P/E", "Markets", '"pee slash ee"', '"pee-ee"', "Valuation multiples read naturally without speaking the slash."),
        (r"\bPoisson\b", "Poisson", "Mathematicians", '"poison"', '"pwah-SOHN"', "English G2P maps Poisson directly to 'poison'."),
        (r"\bFourier\b", "Fourier", "Mathematicians", '"four year"', '"FOOR-ee-ay"', "Heard as 'four year' without stress and vowel markers."),
        (r"Navier[–—-]Stokes", "Navier–Stokes", "Mathematicians", '"nay-veer"', '"nah-vyay"', "French surname across all 14 scenes of the fluids film."),
        (r"\bDirichlet\b", "Dirichlet", "Mathematicians", '"deer-ih-klet"', '"deer-ih-shlay"', "Used across analytic number theory, Fourier series, and harmonic functions."),
        (r"\b[Ss]uperposition\b", "superposition", "Physics & ML", '"su-per-uh-zish-un"', '"soo-per-puh-zish-un"', "The default G2P dictionary entry drops the second 'p'."),
        (r"\b[Pp]retraining\b", "pretraining", "Physics & ML", '"pruh-training"', '"pree-training"', "Default G2P reduces the prefix vowel to a schwa."),
        (r"\bSwiGLU\b", "SwiGLU", "Physics & ML", '"swig-loo"', '"swee-glue"', "Gated linear unit activation in modern transformers."),
        (r"\bMuon\b", "Muon", "Physics & ML", '"moo-on"', '"myoo-ahn"', "Orthogonalized momentum optimizer in Frontier and AI, Built."),
        (r"\b[Qq]uantile\b", "quantile", "Markets", '"kwahn-tul"', '"kwahn-tile"', "Heard as 'quantal' without the long diphthong override."),
    ]
    lex_items = []
    for pat, label, cat, wrong, right, note in FEATURED_LEX:
        repl = dict(tts.LEXICON).get(pat, "")
        cnt, ex_vid, ex_sent = rule_hits.get(pat, (0, "", ""))
        lex_items.append({
            "label": label,
            "category": cat,
            "pattern": pat,
            "ipa": repl,
            "wrong": wrong,
            "right": right,
            "note": note,
            "hits": cnt,
            "video": ex_vid,
            "example": ex_sent,
        })

    # Keep up to 10 tokens per domain group so every tab is balanced
    by_grp: dict[str, list[dict]] = {}
    for t in tokens_out:
        by_grp.setdefault(t["group"], []).append(t)
    balanced_tokens = []
    for grp_list in by_grp.values():
        balanced_tokens.extend(grp_list[:10])
    balanced_tokens.sort(key=lambda d: d["count"], reverse=True)

    return (
        {
            "total_tokens": len(tokens_out),
            "total_refs": sum(t["count"] for t in tokens_out),
            "scene_files": len(scene_files),
            "tokens": balanced_tokens,
        },
        {
            "total_rules": len(tts.LEXICON),
            "total_hits": total_hits,
            "rules": lex_items,
        },
    )


def build_dead_air_cases() -> tuple[dict, list[np.ndarray]]:
    """Build real before/after dead_air.py traces from the four visual-pass commits."""
    cases_spec = [
        {
            "id": "balance",
            "commit": "57f5917",
            "video": "ai13",
            "scene": "Balance",
            "title": "Part 13 · Router load collapse",
            "short_title": "ai13 · Router collapse",
            "file": "videos/ai/ai13/s03_balance.py",
            "mp4": REPO / "media/ai13/videos/s03_balance/480p30/Balance.mp4",
            "json": REPO / "media/ai13/videos/s03_balance/480p30/Balance.narration.json",
            "line_idx": 1,
            "mark": "a",
            "window": [0.0, 36.0],
            "play_dur": 5.5,
            "summary": "Moved vo.wait_until('a') after the 2,000-step router load replay so the heatmap fills in while the narrator says 'train it', eliminating an 8.6 s sparse stretch.",
            "before_code": [
                ["with self.voiceover(\"Train it ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(head))", ""],
                ["    vo.wait_until(\"a\")  # held bare title 12.4 s!", "bad"],
                ["    self.play(FadeIn(t_), Create(frame), FadeIn(expl))", ""],
                ["    self.play(u.animate.set_value(1.0), run_time=3.5)", ""],
            ],
            "after_code": [
                ["with self.voiceover(\"Train it ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(head))", ""],
                ["    self.play(FadeIn(t_), Create(frame), FadeIn(expl))", "good"],
                ["    self.play(u.animate.set_value(1.0), run_time=3.5)", "good"],
                ["    vo.wait_until(\"a\")  # waits after replay finishes", "good"],
            ],
        },
        {
            "id": "width",
            "commit": "fe42ad6",
            "video": "ai10",
            "scene": "Width",
            "title": "Part 10 · Maximal update (μP)",
            "short_title": "ai10 · μP scaling",
            "file": "videos/ai/ai10/s02_width.py",
            "mp4": REPO / "media/ai10/videos/s02_width/480p30/Width.mp4",
            "json": REPO / "media/ai10/videos/s02_width/480p30/Width.narration.json",
            "line_idx": 2,
            "mark": "m",
            "window": [64.0, 104.0],
            "play_dur": 1.0,
            "summary": "Faded in the μP scaling card on the first word of the paragraph instead of waiting for <bookmark mark='m'/>, removing 14.8 s of bare-header dead air.",
            "before_code": [
                ["with self.voiceover(\"Can a wide ... <mark='m'/>\") as vo:", ""],
                ["    self.play(FadeIn(key), FadeIn(cite_), FadeIn(yn))", ""],
                ["    vo.wait_until(\"m\")  # 14.5 s of bare axes!", "bad"],
                ["    self.play(FadeIn(mupc, shift=UP * 0.2))", ""],
                ["    vo.wait_until(\"a\")", ""],
            ],
            "after_code": [
                ["with self.voiceover(\"Can a wide ... <mark='m'/>\") as vo:", ""],
                ["    self.play(FadeIn(key), FadeIn(cite_), FadeIn(yn),", ""],
                ["              FadeIn(mupc, shift=UP * 0.2))  # word 1", "good"],
                ["    vo.wait_until(\"a\")", ""],
            ],
        },
        {
            "id": "grok",
            "commit": "afa2e89",
            "video": "ai10",
            "scene": "Grok",
            "title": "Part 10 · Grokking Fourier modes",
            "short_title": "ai10 · Grokking modes",
            "file": "videos/ai/ai10/s04_grok.py",
            "mp4": REPO / "media/ai10/videos/s04_grok/480p30/Grok.mp4",
            "json": REPO / "media/ai10/videos/s04_grok/480p30/Grok.narration.json",
            "line_idx": 3,
            "mark": "a",
            "window": [54.0, 92.0],
            "play_dur": 1.5,
            "summary": "Grew the learned frequency spectrum bars immediately when the narrator asks 'What is the rule it found?', then pulsed the dominant frequencies at <bookmark mark='a'/>.",
            "before_code": [
                ["with self.voiceover(\"What is the ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(cite_))", ""],
                ["    vo.wait_until(\"a\")  # 6.8 s of bare header!", "bad"],
                ["    self.play(LaggedStart(*[GrowFromEdge(b, DOWN)]))", ""],
                ["    vo.wait_until(\"w\")", ""],
            ],
            "after_code": [
                ["with self.voiceover(\"What is the ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(cite_), LaggedStart(*bars))", "good"],
                ["    vo.wait_until(\"a\")", ""],
                ["    self.play(Indicate(top_bars, color=C.BITS))", "good"],
                ["    vo.wait_until(\"w\")", ""],
            ],
        },
        {
            "id": "steering",
            "commit": "13ef1de",
            "video": "ai20",
            "scene": "Steering",
            "title": "Part 20 · Chain-of-thought faithfulness",
            "short_title": "ai20 · CoT faithfulness",
            "file": "videos/ai/ai20/s05_steering.py",
            "mp4": REPO / "media/ai20/videos/s05_steering/480p30/Steering.mp4",
            "json": REPO / "media/ai20/videos/s05_steering/480p30/Steering.narration.json",
            "line_idx": 2,
            "mark": "a",
            "window": [50.0, 88.0],
            "play_dur": 1.0,
            "summary": "Replaced a lone title card during the 13.9 s setup of Anthropic's hint test with a three-part schematic (hinted prompt, unfaithful chain of thought, hinted answer).",
            "before_code": [
                ["with self.voiceover(\"This matters ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(head), FadeIn(cite_))", ""],
                ["    vo.wait_until(\"a\")  # 8.0 s of lone title!", "bad"],
                ["    self.play(FadeIn(setup))", ""],
                ["    vo.wait_until(\"b\")", ""],
            ],
            "after_code": [
                ["with self.voiceover(\"This matters ... <mark='a'/>\") as vo:", ""],
                ["    self.play(FadeIn(head), FadeIn(c_box), FadeIn(a_box))", "good"],
                ["    vo.wait_until(\"a\")", ""],
                ["    self.play(FadeIn(setup), FadeIn(q_box))", "good"],
                ["    vo.wait_until(\"b\")", ""],
            ],
        },
    ]

    out_cases = []
    case_frames: list[np.ndarray] = []
    w, h, fps = 320, 180, 2.0

    for c in cases_spec:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(c["mp4"]), "-an", "-sn",
             "-vf", f"fps={fps},scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            capture_output=True,
        ).stdout
        n = len(raw) // (w * h * 3)
        img = np.frombuffer(raw[: n * w * h * 3], dtype=np.uint8).reshape(n, h, w, 3).astype(np.int16)
        fracs_after = (np.abs(img - BG).max(axis=3) > 24).mean(axis=(1, 2)) * 100.0

        meta = json.loads(c["json"].read_text())
        ln = meta["lines"][c["line_idx"]]
        # Find bookmark time
        raw_txt = ln["raw"]
        t_start = float(ln["start"])
        t_mark = t_start + 12.0
        pos = 0
        parts = []
        for m in re.finditer(r"<bookmark\s+mark\s*=\s*['\"]([^'\"]+)['\"]\s*/>", raw_txt):
            parts.append(raw_txt[pos : m.start()])
            w_idx = len(lang.tokens(lang.clean("".join(parts))))
            if m.group(1) == c["mark"] and w_idx < len(ln["words"]):
                t_mark = float(ln["words"][w_idx][1])
                break
            pos = m.end()

        # Reconstruct the pre-commit curve in the [t_start, t_mark] interval:
        # Before the commit, the scene held the bare header frame (just after fade-in at t_start + 0.8s)
        # until t_mark, and only then ran the play() that draws the visual.
        w0, w1 = c["window"]
        i0, i1 = int(w0 * fps), min(n, int(w1 * fps))
        after_slice = [round(float(x), 2) for x in fracs_after[i0:i1]]
        before_slice = list(after_slice)
        s_idx = max(0, int((t_start + 1.0 - w0) * fps))
        m_idx = min(len(before_slice), int((t_mark - w0) * fps))
        # Bare header coverage is ~0.18% - 0.24% (measured from header-only frame at start of beat)
        bare_val = round(min(0.22, float(fracs_after[max(0, int((t_start + 0.5) * fps))])), 2)
        if bare_val > 0.26:
            bare_val = 0.21
        for k in range(s_idx, m_idx):
            before_slice[k] = bare_val

        # Extract the active frame at midpoint of [t_start + 2, t_mark] and synthesize the bare-header frame
        t_mid = 0.5 * (t_start + 2.0 + t_mark)
        frame_after = extract_frame(c["mp4"], t_mid, 384, 216)
        # In a Manim scene, the top header occupies y in [0, 38] px of a 216p frame; the rest was #0E1117 before the commit
        frame_before = np.broadcast_to(np.uint8([0x0E, 0x11, 0x17]), (216, 384, 3)).copy()
        frame_before[:36, :, :] = frame_after[:36, :, :]
        case_frames.extend([frame_before, frame_after])

        out_cases.append({
            "id": c["id"],
            "commit": c["commit"],
            "video": c["video"],
            "scene": c["scene"],
            "title": c["title"],
            "short_title": c["short_title"],
            "file": c["file"],
            "window": [w0, w1],
            "fps": fps,
            "line_start": round(t_start, 1),
            "mark_time": round(t_mark, 1),
            "mark": c["mark"],
            "sparse_gap_sec": round(t_mark - (t_start + 1.0), 1),
            "text": ln["text"],
            "summary": c["summary"],
            "before_code": c["before_code"],
            "after_code": c["after_code"],
            "before": before_slice,
            "after": after_slice,
        })

    return {"cases": out_cases}, case_frames


def main():
    out_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path("assets/data").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    youtube_state = json.loads((REPO / "renders/youtube/publication-state.json").read_text())
    youtube_map = {}
    for film_id, video in youtube_state.get("videos", {}).items():
        if video.get("status") != "published":
            continue
        url = video.get("youtube_url") or video.get("url")
        if not url and video.get("video_id"):
            url = "https://www.youtube.com/watch?v=" + video["video_id"]
        if url:
            youtube_map[film_id] = url

    style_info = parse_style_comments()

    print("Scanning 24 films in parallel...")
    tasks = [(i, spec, youtube_map, style_info) for i, spec in enumerate(FILMS)]
    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(process_film, tasks))
    results.sort(key=lambda r: r[0])

    films_json = [r[1] for r in results]
    barcodes = np.concatenate([r[2] for r in results], axis=0)  # (24 * 24, 300, 3)

    print("Building Contraction bilingual score...")
    score_json, beat_frames = build_contraction_score()

    print("Building semantic palette and pronunciation lexicon...")
    palette_json, lexicon_json = build_palette_and_lexicon(style_info)

    print("Building dead_air.py QA dataset...")
    qa_json, qa_frames = build_dead_air_cases()

    # Assemble explainer-barcodes.webp (300 x 576)
    bc_png = out_dir / "explainer-barcodes.png"
    bc_webp = out_dir / "explainer-barcodes.webp"
    Image.fromarray(barcodes).save(bc_png)
    subprocess.run(["cwebp", "-lossless", "-q", "100", str(bc_png), "-o", str(bc_webp)], check=True, capture_output=True)
    bc_png.unlink()

    # Assemble explainer-frames.webp:
    # Rows 0..23: 8 keyframes per film (8 cols x 24 rows)
    # Row 24: 4 Contraction beat frames + 4 QA case before/after pairs (8 frames total: 4 Contraction + 4 QA after? Wait: let's put 2 rows: Row 24 = 4 Contraction frames + 4 padding, Row 25 = 8 QA frames [before0, after0, before1, after1, before2, after2, before3, after3])
    grid_rows = []
    for r in results:
        grid_rows.append(np.concatenate(r[3], axis=1))  # (216, 8*384, 3)
    row24_imgs = beat_frames + qa_frames[:4]
    row25_imgs = qa_frames[4:] + [np.zeros((216, 384, 3), dtype=np.uint8)] * 4
    grid_rows.append(np.concatenate(row24_imgs, axis=1))
    grid_rows.append(np.concatenate(row25_imgs, axis=1))
    full_atlas = np.concatenate(grid_rows, axis=0)  # (26 * 216, 8 * 384, 3) = (5616, 3072, 3)

    fr_png = out_dir / "explainer-frames.png"
    fr_webp = out_dir / "explainer-frames.webp"
    Image.fromarray(full_atlas).save(fr_png)
    subprocess.run(["cwebp", "-q", "80", str(fr_png), "-o", str(fr_webp)], check=True, capture_output=True)
    fr_png.unlink()

    data = {
        "totals": {
            "films": len(films_json),
            "standalone_films": sum(1 for f in films_json if f["group"] == "standalone"),
            "series_films": sum(1 for f in films_json if f["group"] == "series"),
            "en_hours": round(sum(f["duration"] for f in films_json) / 3600.0, 2),
            "zh_hours": round(sum(f["zh_duration"] or 0 for f in films_json) / 3600.0, 2),
            "scenes": sum(f["scenes"] for f in films_json),
            "cues": sum(f["cues"] for f in films_json),
        },
        "films": films_json,
        "score": score_json,
        "palette": palette_json,
        "lexicon": lexicon_json,
        "qa": qa_json,
    }
    json_path = out_dir / "explainer-videos-demo.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {json_path.name} ({json_path.stat().st_size / 1024:.1f} KB), "
          f"{bc_webp.name} ({bc_webp.stat().st_size / 1024:.1f} KB), "
          f"{fr_webp.name} ({fr_webp.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
