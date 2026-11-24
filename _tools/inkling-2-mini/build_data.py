#!/usr/bin/env python3
"""Build verified JSON dataset for the Inkling 2 Mini blog post and interactive figures.

Reads primary extracted artifacts (Hugging Face config.json, safetensors index,
varloop model card 53-benchmark series, announcement chart series, and model card
comparison tables) and emits assets/data/inkling-2-mini/data.json.
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = "/Users/teo/.gemini/antigravity/brain/0acd030e-a233-456c-aa3c-6d0d2f879140/scratch"
OUT_DIR = os.path.join(ROOT, "assets", "data", "inkling-2-mini")
os.makedirs(OUT_DIR, exist_ok=True)


def parse_varloop_scores(path):
    """Parse all 53 benchmark series from the TML-d24-varloop-research model card."""
    categories = [
        ("DeepSWE", "Coding"),
        ("SWEBench", "Coding"),
        ("PMPP-Hard", "Coding"),
        ("BrowseComp", "Search & Agent"),
        ("DeepSearchQA", "Search & Agent"),
        ("MCP Atlas", "Search & Agent"),
        ("JobBench", "Search & Agent"),
        ("EnterpriseOps", "Search & Agent"),
        ("Diligence Bench", "Search & Agent"),
        ("GDP.pdf", "Vision"),
        ("PerceptionBench", "Vision"),
        ("MMMU Pro", "Vision"),
        ("OmniDocBench", "Vision"),
        ("BabyVision", "Vision"),
        ("ScreenSpot Pro", "Vision"),
        ("Charxiv", "Vision"),
        ("Chartography", "Vision"),
        ("ZeroBench", "Vision"),
        ("Humanity", "Vision"),
        ("MathVision", "Vision"),
        ("MuirBench", "Vision"),
        ("BVB", "Vision"),
        ("SimpleQA", "Factuality"),
        ("AA-Omniscience", "Factuality"),
        ("SimpleVQA", "Factuality"),
        ("WorldVQA", "Factuality"),
        ("AA-LCR", "Long Context"),
        ("LongBench", "Long Context"),
        ("GraphWalks", "Long Context"),
        ("MRCR", "Long Context"),
        ("HLE", "Reasoning"),
        ("GPQA", "Reasoning"),
        ("Apex 2025", "Reasoning"),
        ("ComplexConstraints", "Reasoning"),
        ("ARC-AGI", "Reasoning"),
        ("FORTRESS", "Safety"),
        ("StrongREJECT", "Safety"),
        ("PatchEval", "Safety"),
        ("Destructive actions", "Safety"),
    ]

    def categorize(name):
        for prefix, cat in categories:
            if name.startswith(prefix):
                return cat
        return "Other"

    items = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Format: [0] Name (optional sub), score [in percent]. Inkling 2 Mini (3 passes): X%. TML-d24-varloop-research: 1 pass, A%; 2 passes, B%; 3 passes, C%; 4 passes, D%; 5 passes, E%.
            m = re.match(
                r"^\[\d+\]\s+(.+?),\s+score(?:\s+in\s+(percent))?\.\s+"
                r"Inkling 2 Mini \(3 passes\):\s+([\d.]+)%?\.\s+"
                r"TML-d24-varloop-research:\s+"
                r"1 pass,\s+([\d.]+)%?;\s+"
                r"2 passes,\s+([\d.]+)%?;\s+"
                r"3 passes,\s+([\d.]+)%?;\s+"
                r"4 passes,\s+([\d.]+)%?;\s+"
                r"5 passes,\s+([\d.]+)%?\.$",
                line,
            )
            if not m:
                raise ValueError(f"Failed to parse varloop line: {line}")
            name, pct, mini, p1, p2, p3, p4, p5 = m.groups()
            unit = "%" if pct else "AUC"
            lower_better = "↓" in name
            passes = [float(p1), float(p2), float(p3), float(p4), float(p5)]
            items.append(
                {
                    "name": name,
                    "cat": categorize(name),
                    "unit": unit,
                    "lower": lower_better,
                    "mini": float(mini),
                    "passes": passes,
                    "delta15": round(passes[4] - passes[0], 1),
                }
            )
    return items


def build_architecture(cfg):
    tc = cfg["text_config"]
    local_set = set(tc["local_layer_ids"])
    core_start = tc["loop_config"]["core_start"]
    core_end = tc["loop_config"]["core_end"]

    layers = []
    for i in range(tc["num_hidden_layers"]):
        block = i // tc["n_layers_per_attn_res_block"] + 1  # 1..4
        is_local = i in local_set
        is_loop = core_start <= i < core_end
        is_mxfp8 = i >= 20
        is_block_end = (i % 6) == 5
        role = "Prelude" if block == 1 else ("Core B2" if block == 2 else ("Core B3" if block == 3 else "Coda"))
        layers.append(
            {
                "id": i,
                "block": block,
                "role": role,
                "attn": "sliding" if is_local else "global",
                "kvConv": "static" if is_local else "dynamic",
                "attnResQ": 0 if i == 0 else (1 if is_local else 3),
                "isLoop": is_loop,
                "precision": "MXFP8" if is_mxfp8 else "NVFP4",
                "blockEnd": is_block_end,
            }
        )

    return {
        "hiddenSize": tc["hidden_size"],
        "numLayers": tc["num_hidden_layers"],
        "coreStart": core_start,
        "coreEnd": core_end,
        "defaultPasses": tc["loop_config"]["num_passes"],
        "gateRank": tc["loop_config"]["gate_rank"],
        "vocabSize": tc["vocab_size"],
        "unpaddedVocabSize": tc["unpadded_vocab_size"],
        "maxContext": tc["model_max_length"],
        "numHeads": tc["num_attention_heads"],
        "numKvHeads": tc["num_key_value_heads"],
        "headDim": tc["head_dim"],
        "slidingWindow": tc["sliding_window_size"],
        "dRel": tc["d_rel"],
        "relExtent": tc["rel_extent"],
        "sconvKernel": tc["sconv_kernel_size"],
        "logScaleFloor": tc["log_scaling_n_floor"],
        "logScaleAlpha": tc["log_scaling_alpha"],
        "qkL2Clip": round(tc["qk_l2_clip_threshold"], 4),
        "relL2Clip": tc["rel_l2_clip_threshold"],
        "nExperts": tc["n_routed_experts"],
        "nExpertsBeforePrune": 384,
        "topK": tc["num_experts_per_tok"],
        "expertInter": tc["intermediate_size"],
        "routeScale": tc["route_scale"],
        "mlpGateSoftcap": tc["mlp_gate_softcap"],
        "mlpUpSoftcap": tc["mlp_up_softcap"],
        "finalLogitSoftcap": tc["final_logit_softcapping"],
        "dsparkTapVisits": cfg["mtp_config"]["target_layer_ids"],
        "dsparkLayers": cfg["mtp_config"]["num_hidden_layers"],
        "dsparkBlockSize": cfg["mtp_config"]["block_size"],
        "visionLayers": cfg["vision_config"]["num_hidden_layers"],
        "visionHidden": cfg["vision_config"]["hidden_size"],
        "visionPatch": cfg["vision_config"]["native_patch_size"],
        "checkpointBytes": 19525870752,
        "mtpBytes": 640000000,
        "params": {
            "totalB": 26.4,
            "uniqueActiveB": 3.4,
            "effectiveActive3B": 5.4,
            "perExtraPassB": 1.0,
            "moeTotalB": 24.46,
            "attnRouterB": 0.65,
            "controllersM": 28.31,
            "embedUnembedB": 0.93,
            "visionB": 0.29,
        },
        "layers": layers,
    }


def extract_code_snippets(py_path):
    """Extract verbatim line-numbered excerpts from modeling_inkling2_loop.py."""
    lines = open(py_path).read().splitlines()
    specs = {
        "messageGate": (79, 96),
        "messageAttnRes": (145, 173),
        "relPosBias": (239, 270),
        "dynShortConv": (396, 455),
        "gatedOutProj": (531, 543),
        "softcapSwiGLU": (760, 771),
        "blockAttnRes": (828, 853),
        "slidingLoop": (937, 997),
        "fullLoop": (1091, 1149),
        "topKRouter": (1152, 1172),
        "textLoopForward": (1378, 1447),
    }
    out = {}
    for k, (s, e) in specs.items():
        out[k] = {"startLine": s, "endLine": e, "code": "\n".join(lines[s - 1 : e])}
    return out


def main():
    cfg = json.load(open(os.path.join(SCRATCH, "hf_Inkling-2-Mini_config.json")))
    varloop = parse_varloop_scores(os.path.join(SCRATCH, "varloop_all_scores.txt"))
    assert len(varloop) == 53, f"Expected 53 varloop benchmarks, got {len(varloop)}"
    snippets = extract_code_snippets(os.path.join(SCRATCH, "modeling_inkling2_loop.py"))

    data = {
        "meta": {
            "model": "thinkingmachines/Inkling-2-Mini",
            "varloopModel": "thinkingmachines/TML-d24-varloop-research",
            "releaseDate": "2026-11-20",
            "license": "Apache 2.0",
            "downloads72h": {
                "unslothGGUF": 1292888,
                "ggmlGGUF": 497658,
                "official": 41888,
                "mlx4bit": 13578,
            },
            "transformersUrl": "https://github.com/huggingface/transformers/blob/main/src/transformers/models/inkling2_loop/modeling_inkling2_loop.py",
        },
        "arch": build_architecture(cfg),
        "varloop": varloop,
        # Exact N-Hop Lookup accuracy (%) from announcement chart aria-label [14]
        "nhop": {
            "hops": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            "random": 20.0,
            "series": [
                {"passes": 1, "acc": [91.6, 64.9, 33.6, 15.5, 17.0, 19.6, 23.1, 29.2, 19.4, 19.6]},
                {"passes": 2, "acc": [100.0, 98.6, 70.9, 30.9, 20.1, 20.0, 21.2, 24.0, 20.4, 21.4]},
                {"passes": 3, "acc": [100.0, 99.4, 95.1, 65.9, 33.5, 23.8, 21.8, 22.1, 19.4, 20.0]},
                {"passes": 5, "acc": [100.0, 99.6, 98.6, 88.1, 58.9, 32.1, 23.6, 22.5, 23.2, 21.2]},
                {"passes": 10, "acc": [100.0, 99.5, 99.2, 89.2, 64.4, 43.4, 28.5, 29.5, 20.8, 24.5]},
            ],
        },
        # Exact Think Fast No-CoT 50% time horizon (human seconds) + 95% bootstrap CI
        "thinkFast": [
            {"label": "1 pass", "passes": 1, "sec": 16, "lo": 0.2, "hi": 25.2, "model": "varloop"},
            {"label": "2 passes", "passes": 2, "sec": 26, "lo": 1.3, "hi": 37.8, "model": "varloop"},
            {"label": "3 passes", "passes": 3, "sec": 37, "lo": 3.6, "hi": 51.6, "model": "varloop"},
            {"label": "5 passes", "passes": 5, "sec": 42, "lo": 4.8, "hi": 56.4, "model": "varloop"},
            {"label": "10 passes", "passes": 10, "sec": 40, "lo": 4.8, "hi": 52.8, "model": "varloop"},
            {"label": "Mini (3×)", "passes": 3, "sec": 41, "lo": 3.0, "hi": 59.4, "model": "mini"},
        ],
        # Exact accuracy vs reasoning tokens (GPQA Diamond & DeepSWE v1.1) from announcement [15],[16]
        "tokenEff": {
            "gpqa": [
                {"name": "1 pass", "pts": [[5343, 61.4], [6204, 63.3], [9006, 66.4], [11896, 67.8], [12083, 71.4]]},
                {"name": "2 passes", "pts": [[3029, 73.2], [3064, 74.4], [5087, 77.5], [6791, 80.7], [7962, 81.5]]},
                {"name": "3 passes", "pts": [[2337, 77.5], [2649, 77.3], [4557, 80.0], [6196, 81.3], [7053, 82.0]]},
                {"name": "5 passes", "pts": [[2082, 74.4], [2319, 77.3], [4306, 81.8], [5942, 84.1], [7157, 82.8]]},
                {"name": "Inkling 2 Mini", "pts": [[1599, 78.0], [1887, 77.5], [5638, 83.3], [13287, 87.0], [16342, 86.1]]},
            ],
            "deepswe": [
                {"name": "1 pass", "pts": [[78859, 0.0], [73349, 0.2], [74103, 0.2], [76607, 0.0], [73840, 0.0]]},
                {"name": "2 passes", "pts": [[54598, 20.5], [59431, 20.4], [77348, 26.8], [105142, 26.8], [130256, 29.9]]},
                {"name": "3 passes", "pts": [[46283, 32.5], [49500, 38.1], [79662, 42.6], [118100, 40.9], [151774, 43.2]]},
                {"name": "5 passes", "pts": [[44017, 35.6], [48395, 38.1], [85385, 40.8], [123903, 45.8], [159133, 49.5]]},
                {"name": "Inkling 2 Mini", "pts": [[32902, 28.8], [35303, 29.3], [87893, 44.2], [110250, 42.2], [110660, 44.6]]},
            ],
        },
        # CoT legibility statistics on matched correctly solved GPQA Diamond items
        "cotStats": [
            {"passes": 1, "tokens": 3703, "wordsPerSent": 8.9, "dictPct": 94.6, "uncertainty": 9.7},
            {"passes": 3, "tokens": 1731, "wordsPerSent": 8.7, "dictPct": 94.5, "uncertainty": 3.9},
            {"passes": 5, "tokens": 1661, "wordsPerSent": 8.7, "dictPct": 94.4, "uncertainty": 3.6},
        ],
        # LinuxArena stealth rate with weaker monitor Qwen3.6-35B-A3B (1% FPR, 184 pairs)
        "linuxArena": [
            {"label": "Qwen3.8-27B", "toolsOnly": 20.5, "withCot": 0.4},
            {"label": "Inkling 2 Small", "toolsOnly": 3.2, "withCot": 0.5},
            {"label": "Mini (helpful-only)", "toolsOnly": 3.9, "withCot": 1.3},
            {"label": "Varloop (1 pass)", "toolsOnly": 1.0, "withCot": 0.3},
            {"label": "Varloop (2 passes)", "toolsOnly": 2.5, "withCot": 0.4},
            {"label": "Varloop (3 passes)", "toolsOnly": 4.0, "withCot": 0.6},
            {"label": "Varloop (4 passes)", "toolsOnly": 2.8, "withCot": 0.3},
            {"label": "Varloop (5 passes)", "toolsOnly": 5.0, "withCot": 0.0},
        ],
        # Theoretical speed vs coding accuracy frontier (<100B, BF16 @ 614 GB/s, batch 1)
        "frontier": {
            "deepswe": [
                {"name": "Ripple-65B (Preview)", "tps": 4.7, "score": 44.3},
                {"name": "Gemma 4 31B", "tps": 10.0, "score": 0.3},
                {"name": "Muse Glimmer", "tps": 10.2, "score": 4.4},
                {"name": "Qwen3.8-27B", "tps": 11.4, "score": 42.2},
                {"name": "Inkling 2 Mini", "tps": 54.4, "score": 48.2, "highlight": True},
                {"name": "Gemma 4 26B A4B", "tps": 80.8, "score": 0.0},
                {"name": "Recursive Flint", "tps": 122.8, "score": 10.81},
            ],
            "sweProHard": [
                {"name": "Ripple-65B (Preview)", "tps": 4.7, "score": 79.1},
                {"name": "Gemma 4 31B", "tps": 10.0, "score": 14.2},
                {"name": "Muse Glimmer", "tps": 10.2, "score": 44.3},
                {"name": "Qwen3.8-27B", "tps": 11.4, "score": 73.8},
                {"name": "Qwen3.6-27B", "tps": 11.4, "score": 37.25},
                {"name": "Inkling 2 Mini", "tps": 54.4, "score": 77.9, "highlight": True},
                {"name": "Gemma 4 26B A4B", "tps": 80.8, "score": 11.8},
                {"name": "Qwen3.6-35B-A3B", "tps": 102.3, "score": 28.1},
            ],
        },
        # vLLM measured GB200 (TP1, 4K context, forward only)
        "vllmBench": [
            {"label": "1 pass", "passes": 1, "shared": False, "b1ms": 1.51, "b32ms": 3.81, "kvCapK": 352},
            {"label": "2 passes", "passes": 2, "shared": False, "b1ms": 2.67, "b32ms": 5.92, "kvCapK": 233},
            {"label": "3 passes", "passes": 3, "shared": False, "b1ms": 3.85, "b32ms": 8.11, "kvCapK": 175},
            {"label": "3 passes (shared KV)", "passes": 3, "shared": True, "b1ms": 3.86, "b32ms": 8.10, "kvCapK": 194},
        ],
        # Stanford Intelligence per Watt (NVIDIA DGX Spark)
        "ipw": [
            {"name": "Inkling 2 Mini (MXFP8, low)", "score": 0.703, "highlight": True},
            {"name": "Qwen3.6-35B-A3B (NVFP4)", "score": 0.430},
            {"name": "Gemma-4-26B-A4B (NVFP4)", "score": 0.159},
            {"name": "Qwen3.5-27B (INT4)", "score": 0.036},
        ],
        # Goodfire d_2027 outlier contribution to layer 13 cross-loop readers
        "goodfire": {
            "d2027RmsNorm": 32.4,
            "d2027SqNormSharePct": 45.6,
            "layer13Readers": [
                {"reader": "u_Q", "d2027Pct": 17, "top5Pct": 60},
                {"reader": "u_V", "d2027Pct": 19, "top5Pct": 62},
                {"reader": "u_K", "d2027Pct": 11, "top5Pct": 32},
                {"reader": "u_MoE", "d2027Pct": 6, "top5Pct": 30},
            ],
            "writerTotal": 3538944,
            "readerTotal": 104,
            "depthReaders": 56,
            "crossReaders": 48,
            "topPairsAbove030": 3490,
        },
        "codeSnippets": snippets,
    }

    out_path = os.path.join(OUT_DIR, "data.json")
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {out_path} ({os.path.getsize(out_path):,} bytes), {len(varloop)} varloop benchmarks.")


if __name__ == "__main__":
    main()
