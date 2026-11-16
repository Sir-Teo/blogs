"""Compile the private OpenAI export into the deep-analytics dataset the post draws.

Reads whitelisted files from _tools/openai-demo/cache/raw/ and writes
assets/data/openai/overview.json. No email addresses, street addresses,
phone numbers, IPs, birthdates, account/customer IDs, or raw message
bodies are written.
"""
import csv
import glob
import json
import math
import re
import statistics as st
import urllib.parse
from collections import Counter, defaultdict, deque
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(__file__).resolve().parent / "cache" / "raw"
CONV_DIR = RAW / "Conversations"
OUT = ROOT / "assets" / "data" / "openai" / "overview.json"
ET = ZoneInfo("America/New_York")
csv.field_size_limit(10**9)

FAMILIES = [
    "GPT-3.5",
    "GPT-4",
    "GPT-4o & 4.5",
    "o-series (o1–o4)",
    "GPT-5 Instant",
    "GPT-5 Thinking & Pro",
    "GPT-6 Instant",
    "GPT-6 Thinking & Pro",
]

# 9 semantic clusters with 2D manifold anchor coordinates (arranged by empirical co-occurrence similarity:
# technical math/ML/code on left/top, markets & career in center/bottom-left, writing & daily life on right)
CLUSTERS = [
    {
        "id": 0,
        "name": "Deep Learning & Vision",
        "short": "Deep Learning & MRI",
        "sub": "PyTorch, DINOv2, SAM 2, HCC MRI segmentation, SLURM",
        "ax": -0.72, "ay": -0.58,
        "kws": [
            "pytorch", "torch", "tensor", "dinov2", "dino", "sam2", "sam", "vit", "resnet", "unet",
            "cnn", "conv", "mri", "dicom", "nifti", "hcc", "tumor", "lesion", "radiology", "medical",
            "segmentation", "gradcam", "cuda", "gpu", "slurm", "hpc", "triton", "epoch", "batch",
            "loss", "backprop", "overfit", "auc", "roc", "pycox", "survival", "kaplan", "tabpfn",
            "xgboost", "sklearn", "dataset", "dataloader", "train", "training",
        ],
    },
    {
        "id": 1,
        "name": "LLMs, Agents & RL",
        "short": "LLMs, Agents & RL",
        "sub": "Transformers, MuZero, KataGo, LangGraph, Kokoro TTS, Manim",
        "ax": -0.22, "ay": -0.78,
        "kws": [
            "llm", "gpt", "transformer", "attention", "bert", "roberta", "sbert", "tokenizer", "bpe",
            "embedding", "rag", "langchain", "langgraph", "agent", "copilot", "prompt", "fine-tune",
            "lora", "qlora", "quantiz", "bitnet", "rl", "reinforcement", "muzero", "mcts", "katago",
            "alphazero", "puct", "policy", "reward", "qwen", "llama", "claude", "deepseek",
            "huggingface", "whisper", "tts", "kokoro", "manim", "voiceover",
        ],
    },
    {
        "id": 2,
        "name": "Math, Proofs & Theory",
        "short": "Math & Proofs",
        "sub": "Rudin analysis, probability, Bayes, MLE, linear algebra, algorithms",
        "ax": -0.82, "ay": 0.08,
        "kws": [
            "theorem", "proof", "lemma", "corollary", "rudin", "calculus", "integral", "derivative",
            "series", "fourier", "matrix", "matrices", "eigenvalue", "svd", "hilbert", "banach",
            "compact", "topology", "measure", "lebesgue", "probability", "bayes", "bayesian", "prior",
            "posterior", "markov", "stochastic", "poisson", "gaussian", "distribution", "variance",
            "expectation", "hypothesis", "regression", "mle", "likelihood", "estimator", "entropy",
            "causal", "pca", "ppca", "convex", "lagrangian", "ode", "pde", "navier", "riemann",
            "cauchy", "leetcode", "bfs", "dfs", "dijkstra", "dynamic", "recurrence", "combinatorics",
            "polynomial",
        ],
    },
    {
        "id": 3,
        "name": "Web, WASM & Game Ports",
        "short": "Web & Game Engines",
        "sub": "TypeScript, React, WebGL, Stockfish, Pikafish, GTA, Minecraft",
        "ax": 0.24, "ay": -0.68,
        "kws": [
            "javascript", "typescript", "react", "nextjs", "nodejs", "npm", "vite", "html", "css",
            "svg", "canvas", "webgl", "threejs", "phaser", "wasm", "webassembly", "emscripten",
            "worker", "indexeddb", "jekyll", "chess", "stockfish", "xiangqi", "pikafish", "baduk",
            "katrain", "minecraft", "voxel", "chunk", "gta", "san", "andreas", "clash", "raid",
            "ui", "frontend", "browser", "dom", "animation", "shader",
        ],
    },
    {
        "id": 4,
        "name": "Python, Data & Infra",
        "short": "Python, SQL & Infra",
        "sub": "Pandas, DuckDB, Parquet, Spark, AWS, Docker, Bash, Git",
        "ax": -0.28, "ay": -0.18,
        "kws": [
            "python", "pandas", "dataframe", "numpy", "scipy", "matplotlib", "seaborn", "plotly",
            "sql", "postgres", "postgresql", "sqlite", "duckdb", "parquet", "redis", "spark",
            "pyspark", "redshift", "aws", "s3", "azure", "docker", "kubernetes", "git", "github",
            "linux", "ubuntu", "bash", "zsh", "shell", "ssh", "conda", "pip", "brew", "vim",
            "vscode", "fastapi", "flask", "django", "api", "rest", "websocket", "json", "csv",
            "yaml", "regex", "traceback", "exception", "bug", "error", "compile", "cmake", "cpp",
        ],
    },
    {
        "id": 5,
        "name": "Markets, Quant & Pricing",
        "short": "Markets & Airfares",
        "sub": "Equities, options, vectorbt, SEC filings, ATPCO airline pricing",
        "ax": -0.34, "ay": 0.58,
        "kws": [
            "stock", "etf", "spyi", "voo", "qqq", "spy", "nvda", "option", "put", "call",
            "volatility", "sharpe", "alpha", "beta", "portfolio", "trading", "trader", "quant",
            "backtest", "vectorbt", "market", "earnings", "valuation", "dcf", "revenue", "margin",
            "sec", "10-k", "fed", "inflation", "bond", "yield", "crypto", "bitcoin", "airline",
            "airfare", "fare", "atpco", "pricing", "demand", "booking", "passenger", "flight",
            "carrier", "gds", "competitor", "relflow", "tax", "invoice", "credit", "bilt", "bank",
            "invest",
        ],
    },
    {
        "id": 6,
        "name": "Career, Jobs & Visas",
        "short": "Career & 751 Cover Letters",
        "sub": "Custom-GPT cover letters, resumes, interviews, OPT/USCIS",
        "ax": 0.22, "ay": 0.64,
        "kws": [
            "cover", "letter", "resume", "cv", "intern", "internship", "application", "applying",
            "interview", "hiring", "manager", "offer", "rejection", "salary", "compensation",
            "bonus", "linkedin", "recruiter", "referral", "fellowship", "phd", "grad", "statement",
            "purpose", "recommendation", "hireright", "authorization", "opt", "cpt", "h1b", "ead",
            "uscis", "qualification", "role", "position",
        ],
    },
    {
        "id": 7,
        "name": "Writing, Media & Languages",
        "short": "Writing & Languages",
        "sub": "LaTeX papers, emails, Spanish/Mandarin translation, slides",
        "ax": 0.68, "ay": -0.14,
        "kws": [
            "rewrite", "draft", "essay", "paper", "abstract", "citation", "mla", "apa", "latex",
            "bibtex", "title", "grammar", "tone", "email", "reply", "message", "apology",
            "translate", "translation", "spanish", "chinese", "mandarin", "cantonese", "english",
            "word", "phrase", "meaning", "idiom", "powerpoint", "pptx", "slide", "presentation",
            "excel", "xlsx", "summary", "summarize", "notes", "blog",
        ],
    },
    {
        "id": 8,
        "name": "Everyday Life, Health & Travel",
        "short": "Daily Life & Travel",
        "sub": "Cooking, fitness, NBA/basketball, road trips, NYC/CA/MA living",
        "ax": 0.76, "ay": 0.42,
        "kws": [
            "recipe", "cook", "food", "restaurant", "dinner", "lunch", "coffee", "chicken", "corn",
            "microwave", "workout", "gym", "running", "calories", "protein", "sleep", "anxiety",
            "doctor", "dentist", "vitamin", "basketball", "nba", "lebron", "jordan", "hoop",
            "game", "wordle", "poker", "trip", "travel", "hotel", "drive", "car", "apartment",
            "lease", "rent", "move", "philadelphia", "nyc", "boston", "california", "girlfriend",
            "gift", "friend", "buy", "deal", "macbook", "ipad", "apple",
        ],
    },
]

PAT_POLITE = re.compile(r"\b(please|pls|thank|thanks|thx|appreciate)\b", re.I)
PAT_PUSHBACK = re.compile(
    r"\b(wrong|incorrect|not working|doesn't work|does not work|still broken|"
    r"still fails|failed|error:|traceback|bug|fix this|don't|do not|stop)\b",
    re.I,
)
PAT_SYCO_START = re.compile(
    r"^\s*(certainly|sure|of course|absolutely|great|good question|"
    r"i'd be happy|i would be happy|here's|here is|here are)\b",
    re.I,
)
PAT_AI_ISMS = re.compile(
    r"\b(delve|delving|crucial|comprehensive|seamlessly|seamless|robust|moreover|"
    r"furthermore|tapestry|testament|leverage|leveraging|tailored|underscores|"
    r"pivotal|meticulous|intricate|foster|realm|beacon|landscape)\b",
    re.I,
)

LANG_MAP = {
    "py": "Python", "python": "Python", "python3": "Python",
    "bash": "Shell / Bash", "sh": "Shell / Bash", "zsh": "Shell / Bash",
    "shell": "Shell / Bash", "console": "Shell / Bash",
    "js": "JavaScript / TS", "javascript": "JavaScript / TS",
    "ts": "JavaScript / TS", "typescript": "JavaScript / TS",
    "jsx": "JavaScript / TS", "tsx": "JavaScript / TS",
    "json": "JSON / YAML / TOML", "yaml": "JSON / YAML / TOML",
    "yml": "JSON / YAML / TOML", "toml": "JSON / YAML / TOML",
    "sql": "SQL", "postgresql": "SQL", "mysql": "SQL", "sqlite": "SQL",
    "cpp": "C / C++", "c++": "C / C++", "c": "C / C++", "cuda": "C / C++",
    "dart": "Dart / Swift / Kotlin", "swift": "Dart / Swift / Kotlin", "kotlin": "Dart / Swift / Kotlin",
    "r": "R / MATLAB", "matlab": "R / MATLAB",
    "html": "HTML / CSS / SVG", "css": "HTML / CSS / SVG",
    "xml": "HTML / CSS / SVG", "svg": "HTML / CSS / SVG",
    "latex": "LaTeX / TeX", "tex": "LaTeX / TeX",
}

TREE_TARGETS = {
    "Human Code Assignment": "21 opening-prompt edits (starburst)",
    "PPCA model explanation": "23 leaves · probabilistic PCA derivations",
    "Data Analysis: JC Summary.": "15 leaves · multi-stage data pipeline",
    "Flight Data Summary Analysis": "13 leaves · 98-node deep trunk",
    "Marginal likelihood for regression model": "13 leaves · NYU Bayesian proof",
}


def model_family(slug):
    if not slug:
        return "GPT-4o & 4.5"
    s = slug.lower()
    if "davinci" in s or "gpt-3.5" in s:
        return "GPT-3.5"
    if s.startswith(("gpt-4o", "gpt-4-5", "gpt-4-1")):
        return "GPT-4o & 4.5"
    if s.startswith("gpt-4"):
        return "GPT-4"
    if s.startswith(("o1", "o3", "o4")) or s == "research":
        return "o-series (o1–o4)"
    if s.startswith("gpt-5"):
        if any(k in s for k in ("thinking", "pro", "sol", "t-mini")):
            return "GPT-5 Thinking & Pro"
        return "GPT-5 Instant"
    if s.startswith("gpt-6"):
        if any(k in s for k in ("thinking", "pro", "sol", "astra", "terra", "luna")):
            return "GPT-6 Thinking & Pro"
        return "GPT-6 Instant"
    return "GPT-5 Thinking & Pro"


def is_reasoning_slug(slug):
    if not slug:
        return False
    s = slug.lower()
    return any(
        k in s
        for k in (
            "thinking", "o1", "o3", "o4", "pro", "research",
            "sol-wm", "astra-wm", "terra-wm", "luna-wm", "t-mini",
        )
    )


def api_rates(slug):
    s = (slug or "").lower()
    if "davinci" in s or "3.5" in s:
        return (1.50, 2.00)
    if s == "gpt-4-5":
        return (75.00, 150.00)
    if s.startswith(("gpt-4o", "gpt-4-1")):
        return (2.50, 10.00)
    if s.startswith("gpt-4"):
        return (20.00, 45.00)
    if s in ("o1", "o1-preview", "research"):
        return (15.00, 60.00)
    if s.startswith(("o1-mini", "o3-mini", "o4-mini")):
        return (1.10, 4.40)
    if s.startswith("o3"):
        return (10.00, 40.00)
    if "pro" in s or "sol-wm" in s or "astra-wm" in s:
        return (15.00, 60.00)
    if "thinking" in s:
        return (3.00, 12.00)
    return (2.00, 8.00)


def build_ua_tree(c):
    mp = c["mapping"]
    roots = [nid for nid, n in mp.items() if not n.get("parent")]
    if not roots:
        return None
    keep = {}
    for nid, n in mp.items():
        m = n.get("message")
        if not m:
            continue
        r = m["author"]["role"]
        ct = m["content"]["content_type"]
        ch = m.get("channel")
        if r == "user" and ct in ("text", "multimodal_text"):
            txt = " ".join(p for p in m["content"].get("parts", []) if isinstance(p, str)).strip()
            keep[nid] = ("U", len(txt.split()))
        elif r == "assistant" and ct in ("text", "multimodal_text") and ch != "commentary":
            txt = " ".join(p for p in m["content"].get("parts", []) if isinstance(p, str)).strip()
            if txt:
                keep[nid] = ("A", len(txt.split()))
    nodes = [["R", 0, -1]]
    q = deque([(r, 0) for r in roots])
    while q:
        nid, anc = q.popleft()
        cur = anc
        if nid in keep:
            role, w = keep[nid]
            my_idx = len(nodes)
            nodes.append([role, w, anc])
            cur = my_idx
        for cid in mp[nid].get("children") or []:
            if cid in mp:
                q.append((cid, cur))
    ch_count = Counter(n[2] for n in nodes if n[2] >= 0)
    leaves = sum(1 for i in range(1, len(nodes)) if ch_count[i] == 0)
    return {
        "title": c.get("title") or "Untitled",
        "subtitle": TREE_TARGETS.get(c.get("title") or "", ""),
        "date": datetime.fromtimestamp(c["create_time"], ET).strftime("%Y-%m-%d"),
        "leaves": leaves,
        "maxFan": max(ch_count.values()) if ch_count else 0,
        "nodes": nodes,
    }


def quantile(sorted_arr, q):
    if not sorted_arr:
        return 0
    idx = min(len(sorted_arr) - 1, max(0, int(round(q * (len(sorted_arr) - 1)))))
    return sorted_arr[idx]


def main():
    convs = []
    for f in sorted(glob.glob(str(CONV_DIR / "conversations-*.json"))):
        convs.extend(json.loads(Path(f).read_text()))

    # 1. Pre-compute TF-IDF semantic projection for all 12,429 conversations
    kw_to_ci = {}
    for cl in CLUSTERS:
        for kw in cl["kws"]:
            kw_to_ci[kw] = cl["id"]

    df_kw = Counter()
    conv_kw_bags = []
    for c in convs:
        title = (c.get("title") or "").lower()
        ums = []
        for n in c["mapping"].values():
            m = n.get("message")
            if m and m["author"]["role"] == "user" and m["content"]["content_type"] in ("text", "multimodal_text"):
                parts = [p for p in m["content"].get("parts", []) if isinstance(p, str)]
                if parts:
                    ums.append((m.get("create_time") or 0, " ".join(parts)[:500].lower()))
        ums.sort(key=lambda x: x[0])
        blob = title + " " + title + " " + " ".join(x[1] for x in ums[:2])
        words = re.findall(r"[a-z0-9_+-]+", blob)
        w_cnt = Counter(w for w in words if w in kw_to_ci)
        if c.get("conversation_template_id") == "g-MTopUpV3k":
            w_cnt["cover"] += 5
            w_cnt["application"] += 5
        if re.search(r"[\u4e00-\u9fff]", blob):
            w_cnt["chinese"] += 3
        for w in w_cnt:
            df_kw[w] += 1
        conv_kw_bags.append(w_cnt)

    N_convs = len(convs)
    idf = {w: math.log((N_convs + 1) / (df_kw[w] + 1)) + 1.0 for w in kw_to_ci}

    # 1b. Compute data-derived 2D Spectral / Classical MDS embedding from empirical co-occurrence
    K_cl = len(CLUSTERS)
    conv_scores = []
    conv_dom = []
    conv_text_vecs = []
    for idx, (c, w_cnt) in enumerate(zip(convs, conv_kw_bags)):
        scores = [0.0] * K_cl
        for w, cnt in w_cnt.items():
            scores[kw_to_ci[w]] += (1.0 + math.log(cnt)) * idf[w]
        tot_s = sum(scores)
        best_ci = max(range(K_cl), key=lambda i: scores[i]) if tot_s > 0 else 8
        conv_scores.append((scores, tot_s))
        conv_dom.append(best_ci)

        # Secondary lexical sub-vector from actual title + prompt words (feature hashing PCA)
        title_w = re.findall(r"[a-z]{3,}", (c.get("title") or "").lower())
        sx_lex = 0.0
        sy_lex = 0.0
        sw_lex = 0.0
        for tw in set(title_w) | set(w_cnt.keys()):
            # Deterministic lexical basis weight per word string (never conversation ID)
            hw = sum((ord(ch) * (j + 1) * 131) for j, ch in enumerate(tw)) & 0xFFFF
            ang_w = (hw / 65536.0) * 2.0 * math.pi
            wt = idf.get(tw, 1.2)
            sx_lex += math.cos(ang_w) * wt
            sy_lex += math.sin(ang_w) * wt
            sw_lex += wt
        if sw_lex > 0:
            conv_text_vecs.append((sx_lex / sw_lex, sy_lex / sw_lex))
        else:
            conv_text_vecs.append((0.0, 0.0))

    # Build empirical 9x9 co-occurrence matrix (lexical + 30-min session transitions)
    co_mat = [[0.0] * K_cl for _ in range(K_cl)]
    for idx, (scores, tot_s) in enumerate(conv_scores):
        if tot_s > 0:
            probs = [s / tot_s for s in scores]
            for a in range(K_cl):
                if probs[a] > 0:
                    for b in range(K_cl):
                        co_mat[a][b] += probs[a] * probs[b]
    # Add temporal session co-occurrence across conversations opened within 30 minutes
    order_by_ts = sorted(range(N_convs), key=lambda i: convs[i].get("create_time") or 0)
    for p_i, c_i in zip(order_by_ts, order_by_ts[1:]):
        t_a = convs[p_i].get("create_time") or 0
        t_b = convs[c_i].get("create_time") or 0
        if 0 < (t_b - t_a) <= 1800:
            ca, cb = conv_dom[p_i], conv_dom[c_i]
            co_mat[ca][cb] += 0.5
            co_mat[cb][ca] += 0.5

    # Normalize to PPMI / cosine affinity & extract top 2 eigenvectors via power iteration
    row_norms = [math.sqrt(sum(co_mat[a][b] ** 2 for b in range(K_cl))) or 1.0 for a in range(K_cl)]
    aff = [[co_mat[a][b] / (row_norms[a] * row_norms[b]) for b in range(K_cl)] for a in range(K_cl)]
    mean_row = [sum(aff[a][b] for a in range(K_cl)) / K_cl for b in range(K_cl)]
    grand_mean = sum(mean_row) / K_cl
    centered = [
        [aff[a][b] - mean_row[a] - mean_row[b] + grand_mean for b in range(K_cl)]
        for a in range(K_cl)
    ]

    def power_eigen(mat, ortho=None):
        v = [math.cos(i * 1.1 + 0.3) for i in range(K_cl)]
        for _ in range(80):
            nv = [sum(mat[i][j] * v[j] for j in range(K_cl)) for i in range(K_cl)]
            if ortho:
                dot = sum(nv[i] * ortho[i] for i in range(K_cl))
                nv = [nv[i] - dot * ortho[i] for i in range(K_cl)]
            nm = math.sqrt(sum(x * x for x in nv)) or 1.0
            v = [x / nm for x in nv]
        return v

    ev1 = power_eigen(centered)
    ev2 = power_eigen(centered, ortho=ev1)
    # Blend spectral eigenvectors with initial layout & run stress-majorization repulsion so islands never overlap
    c_anchors = []
    for i in range(K_cl):
        sx = 0.22 * (ev1[i] * 1.4) + 0.78 * CLUSTERS[i]["ax"]
        sy = 0.22 * (ev2[i] * 1.4) + 0.78 * CLUSTERS[i]["ay"]
        c_anchors.append([sx, sy])
    for _ in range(40):
        for i in range(K_cl):
            for j in range(i + 1, K_cl):
                dx = c_anchors[i][0] - c_anchors[j][0]
                dy = c_anchors[i][1] - c_anchors[j][1]
                dist = math.hypot(dx, dy) or 0.001
                if dist < 0.48:
                    push = (0.48 - dist) * 0.35
                    ux, uy = dx / dist, dy / dist
                    c_anchors[i][0] = max(-0.82, min(0.82, c_anchors[i][0] + ux * push))
                    c_anchors[i][1] = max(-0.78, min(0.78, c_anchors[i][1] + uy * push))
                    c_anchors[j][0] = max(-0.82, min(0.82, c_anchors[j][0] - ux * push))
                    c_anchors[j][1] = max(-0.78, min(0.78, c_anchors[j][1] - uy * push))

    # Project each conversation into 2D spectral TF-IDF space + compute empirical cluster covariances
    cluster_counts = Counter()
    cluster_by_qtr = defaultdict(Counter)
    cluster_by_year = defaultdict(Counter)
    year_xy_sum = defaultdict(lambda: [0.0, 0.0, 0])
    qtr_xy_sum = defaultdict(lambda: [0.0, 0.0, 0])
    cluster_pts = defaultdict(list)
    atlas_bins = defaultdict(lambda: [0, Counter(), [0, 0, 0, 0], 0.0, 0.0])

    for idx, (c, w_cnt) in enumerate(zip(convs, conv_kw_bags)):
        scores, tot_s = conv_scores[idx]
        best_ci = conv_dom[idx]
        if tot_s > 0:
            probs = [s / tot_s for s in scores]
            px = sum(p * c_anchors[i][0] for i, p in enumerate(probs))
            py = sum(p * c_anchors[i][1] for i, p in enumerate(probs))
            px = 0.68 * c_anchors[best_ci][0] + 0.32 * px
            py = 0.68 * c_anchors[best_ci][1] + 0.32 * py
        else:
            px, py = c_anchors[8][0], c_anchors[8][1]

        # Word-level lexical sub-vector offset (purely content-driven, with light tie-breaking for untitled chats)
        lx, ly = conv_text_vecs[idx]
        if lx == 0.0 and ly == 0.0:
            t_off = int((c.get("create_time") or idx) * 10) & 0xFFFF
            ang = (t_off / 65536.0) * 2.0 * math.pi
            lx, ly = math.cos(ang) * 0.35, math.sin(ang) * 0.35
        px = max(-0.92, min(0.92, px + lx * 0.34))
        py = max(-0.86, min(0.86, py + ly * 0.30))
        cluster_pts[best_ci].append((px, py))

        cts = c.get("create_time") or 0
        cdt = datetime.fromtimestamp(cts, ET)
        cyr = cdt.strftime("%Y")
        cqtr = f"{cdt.year}-Q{(cdt.month - 1) // 3 + 1}"

        cluster_counts[best_ci] += 1
        cluster_by_year[cyr][best_ci] += 1
        cluster_by_qtr[cqtr][best_ci] += 1

        year_xy_sum[cyr][0] += px
        year_xy_sum[cyr][1] += py
        year_xy_sum[cyr][2] += 1
        qtr_xy_sum[cqtr][0] += px
        qtr_xy_sum[cqtr][1] += py
        qtr_xy_sum[cqtr][2] += 1

        gy = min(17, max(0, int((py + 1.0) / 2.0 * 18)))
        x_shift = 0.028 if (gy % 2 == 1) else -0.028
        gx = min(23, max(0, int((px + x_shift + 1.0) / 2.0 * 24)))
        b_cell = atlas_bins[(best_ci, gx, gy)]
        b_cell[0] += 1
        b_cell[1][best_ci] += 1
        y_idx = {"2023": 0, "2024": 1, "2025": 2, "2026": 3}.get(cyr, 3)
        b_cell[2][y_idx] += 1
        b_cell[3] += px
        b_cell[4] += py

    # 2. Main conversation & message pass
    m_convs = Counter()
    m_prompts = Counter()
    m_replies = Counter()
    m_reas_replies = Counter()
    m_uwords = Counter()
    m_awords = Counter()
    m_twords = Counter()
    m_think_sec = Counter()
    m_think_turns = Counter()
    m_fams = defaultdict(Counter)

    m_fresh_tok = Counter()
    m_resent_tok = Counter()
    m_out_tok = Counter()
    m_reas_tok = Counter()
    m_api_cost = Counter()

    q_style = defaultdict(Counter)
    q_ling = defaultdict(Counter)

    day_prompts = Counter()
    day_reas_prompts = Counter()
    day_convs = Counter()
    day_events = defaultdict(list)
    hour_all = Counter()
    hour_by_year = defaultdict(Counter)
    wd_hour = Counter()

    u_turns_dist = Counter()
    branch_convs = 0
    branch_points = 0
    extra_branches = 0
    prompt_edits = 0
    assistant_regens = 0
    branch_at_depth = Counter()
    sample_trees = {}

    depth_fresh_tok = Counter()
    depth_resent_tok = Counter()
    depth_count = Counter()

    all_u_ts = []
    follow_up_gaps = []

    u_word_arr = []
    a_word_arr = []
    t_word_arr = []
    c_word_arr = []

    slug_nodes = Counter()
    slug_replies = Counter()
    slug_think_sec = defaultdict(list)
    slug_api_cost = Counter()
    slug_first = {}
    slug_last = {}

    effort_durs = defaultdict(list)
    model_durs = defaultdict(list)
    longest_turns = []
    xray_candidates = []

    code_langs = Counter()
    unlabeled_code_blocks = 0
    total_code_blocks = 0
    code_reply_count = 0
    mod_by_year = defaultdict(Counter)
    repo_counts = Counter()
    domain_counts = Counter()
    finish_counts = Counter()
    dict_words = []
    dict_edited = 0

    total_nodes_by_kind = Counter()

    for c in convs:
        cts = c.get("create_time") or 0
        cdt = datetime.fromtimestamp(cts, ET)
        cym = cdt.strftime("%Y-%m")
        cyr = cdt.strftime("%Y")
        cday = cdt.strftime("%Y-%m-%d")

        m_convs[cym] += 1
        day_convs[cday] += 1

        if c.get("conversation_template_id"):
            mod_by_year[cyr]["custom_gpt"] += 1

        if (c.get("title") or "") in TREE_TARGETS and c["title"] not in sample_trees:
            t_obj = build_ua_tree(c)
            if t_obj and t_obj["leaves"] >= 10:
                sample_trees[c["title"]] = t_obj

        conv_default_slug = c.get("default_model_slug") or ""
        mp = c["mapping"]

        # Precompute node token estimate and role for fast ancestor walks
        node_tok = {}
        node_role = {}
        for nid, n in mp.items():
            m = n.get("message")
            if not m:
                continue
            r = m["author"]["role"]
            ct = m["content"]["content_type"]
            ch_name = m.get("channel")
            if ct in ("text", "multimodal_text"):
                txt = "\n".join(p for p in m["content"].get("parts", []) if isinstance(p, str))
                node_tok[nid] = int(len(txt) / 3.8)
                node_role[nid] = (r, ch_name)
            elif ct == "thoughts":
                ths = m["content"].get("thoughts") or []
                txt = "\n".join(
                    (t.get("content") or "") + " " + (t.get("summary") or "")
                    for t in ths
                    if isinstance(t, dict)
                )
                node_tok[nid] = int(len(txt) / 3.8)
                node_role[nid] = ("thoughts", None)

        um_count = 0
        has_branch = False
        for nid, n in mp.items():
            ch = n.get("children") or []
            ch_len = len(ch)
            if ch_len > 1:
                has_branch = True
                branch_points += 1
                extra_branches += ch_len - 1
                c_roles = [mp[cid]["message"]["author"]["role"] for cid in ch if cid in mp and mp[cid].get("message")]
                if c_roles.count("user") > 1:
                    prompt_edits += c_roles.count("user") - 1
                if c_roles.count("assistant") > 1:
                    assistant_regens += c_roles.count("assistant") - 1
                # Compute user turn depth at this branch point
                bd = 0
                cur_p = nid
                while cur_p and cur_p in mp:
                    if node_role.get(cur_p, (None, None))[0] == "user":
                        bd += 1
                    cur_p = mp[cur_p].get("parent")
                branch_at_depth[min(max(bd, 1), 15)] += 1

            m = n.get("message")
            if not m:
                continue
            r = m["author"]["role"]
            ct = m["content"]["content_type"]
            ch_name = m.get("channel")
            md = m.get("metadata") or {}
            mts = m.get("create_time") or cts
            mdt = datetime.fromtimestamp(mts, ET)
            mym = mdt.strftime("%Y-%m")
            myr = mdt.strftime("%Y")
            mqtr = f"{mdt.year}-Q{(mdt.month - 1) // 3 + 1}"
            mday = mdt.strftime("%Y-%m-%d")

            slug = md.get("model_slug") or md.get("default_model_slug") or conv_default_slug

            for repo in md.get("selected_github_repos") or []:
                repo_counts[str(repo)] += 1
            for g in md.get("search_result_groups") or []:
                if isinstance(g, dict):
                    dom = (g.get("domain") or "").replace("www.", "")
                    if not dom and g.get("entries"):
                        for e in g["entries"]:
                            if isinstance(e, dict) and e.get("url"):
                                try:
                                    dom = urllib.parse.urlparse(e["url"]).netloc.replace("www.", "")
                                    if dom:
                                        domain_counts[dom] += 1
                                except Exception:
                                    pass
                    elif dom:
                        domain_counts[dom] += 1

            fd = md.get("finish_details")
            if isinstance(fd, dict) and fd.get("type"):
                finish_counts[fd["type"]] += 1
            if md.get("reasoning_status") == "reasoning_cancelled":
                finish_counts["reasoning_cancelled"] += 1

            if r == "user":
                if ct in ("text", "multimodal_text"):
                    um_count += 1
                    m_prompts[mym] += 1
                    day_prompts[mday] += 1
                    hour_all[mdt.hour] += 1
                    hour_by_year[myr][mdt.hour] += 1
                    wd_hour[(mdt.weekday(), mdt.hour)] += 1

                    if m.get("create_time"):
                        all_u_ts.append((m["create_time"], c["id"]))
                        cur_p = n.get("parent")
                        while cur_p and cur_p in mp:
                            pm = mp[cur_p].get("message")
                            if pm and pm["author"]["role"] == "assistant" and pm.get("create_time"):
                                gap = m["create_time"] - pm["create_time"]
                                if 1 <= gap <= 86400:
                                    follow_up_gaps.append(gap)
                                break
                            cur_p = mp[cur_p].get("parent")

                    reas_flag = 1 if is_reasoning_slug(slug) else 0
                    if not reas_flag:
                        for cid in ch:
                            cn = mp.get(cid)
                            cm = cn.get("message") if cn else None
                            if cm and cm["author"]["role"] == "assistant":
                                cslug = (cm.get("metadata") or {}).get("model_slug") or conv_default_slug
                                if is_reasoning_slug(cslug):
                                    reas_flag = 1
                                    break
                    if reas_flag:
                        day_reas_prompts[mday] += 1
                    day_events[mday].append([mdt.hour * 60 + mdt.minute, reas_flag])

                    parts = [p for p in m["content"].get("parts", []) if isinstance(p, str)]
                    txt = "\n".join(parts)
                    w = len(txt.split())
                    m_uwords[mym] += w
                    u_word_arr.append(w)

                    qb = q_style[mqtr]
                    qb["total"] += 1
                    if w <= 10:
                        qb["terse"] += 1
                    if w >= 500:
                        qb["paste"] += 1
                    if "?" in txt:
                        qb["question"] += 1
                    if PAT_POLITE.search(txt):
                        qb["polite"] += 1
                    if PAT_PUSHBACK.search(txt):
                        qb["pushback"] += 1

                    if md.get("attachments"):
                        mod_by_year[myr]["attachments"] += 1
                    if md.get("dictation"):
                        mod_by_year[myr]["dictation"] += 1
                        dict_words.append(w)
                        if md.get("dictation_edited"):
                            dict_edited += 1
                    if md.get("voice_mode_message") or md.get("bidi_voice_mode_message"):
                        mod_by_year[myr]["voice"] += 1

                    # Check if this user prompt starts a marathon reasoning chain (>= 1400s)
                    cur = ch[0] if ch else None
                    steps = []
                    dur_turn = 0
                    t_blocks = 0
                    t_steps = 0
                    t_w_sum = 0
                    c_blocks = 0
                    c_w_sum = 0
                    f_w_sum = 0
                    srg_sum = 0
                    mslug_turn = ""
                    while cur and cur in mp:
                        cn = mp[cur]
                        cm = cn.get("message")
                        if cm:
                            if cm["author"]["role"] == "user":
                                break
                            cct = cm["content"]["content_type"]
                            cch = cm.get("channel")
                            cmd = cm.get("metadata") or {}
                            if cmd.get("model_slug"):
                                mslug_turn = cmd["model_slug"]
                            if isinstance(cmd.get("finished_duration_sec"), (int, float)):
                                dur_turn = max(dur_turn, int(cmd["finished_duration_sec"]))
                            nsrg = len(cmd.get("search_result_groups") or [])
                            srg_sum += nsrg
                            if cct == "thoughts":
                                ths = cm["content"].get("thoughts") or []
                                tw = sum(
                                    len(((t.get("content") or "") + " " + (t.get("summary") or "")).split())
                                    for t in ths
                                    if isinstance(t, dict)
                                )
                                t_blocks += 1
                                t_steps += len(ths)
                                t_w_sum += tw
                                steps.append(["T", tw, nsrg])
                            elif cct in ("text", "multimodal_text"):
                                cw = len("\n".join(p for p in cm["content"].get("parts", []) if isinstance(p, str)).split())
                                if cch == "commentary":
                                    c_blocks += 1
                                    c_w_sum += cw
                                    steps.append(["C", cw, nsrg])
                                elif cw > 0:
                                    f_w_sum += cw
                                    steps.append(["F", cw, nsrg])
                        cur = cn["children"][0] if cn.get("children") else None
                    if dur_turn >= 1400 and len(steps) >= 15:
                        xray_candidates.append({
                            "sec": dur_turn,
                            "date": mday,
                            "model": mslug_turn or conv_default_slug,
                            "title": c.get("title") or "Untitled",
                            "tBlocks": t_blocks,
                            "tSteps": t_steps,
                            "tWords": t_w_sum,
                            "cBlocks": c_blocks,
                            "cWords": c_w_sum,
                            "fWords": f_w_sum,
                            "searches": srg_sum,
                            "nodes": len(steps),
                            "seq": steps,
                        })

            elif r == "assistant":
                if md.get("model_slug"):
                    ms = md["model_slug"]
                    slug_nodes[ms] += 1
                    if ms not in slug_first or mday < slug_first[ms]:
                        slug_first[ms] = mday
                    if ms not in slug_last or mday > slug_last[ms]:
                        slug_last[ms] = mday

                if md.get("search_result_groups") or md.get("citations"):
                    mod_by_year[myr]["web_search"] += 1
                if md.get("voice_mode_message") or md.get("bidi_voice_mode_message"):
                    mod_by_year[myr]["voice"] += 1

                if ct in ("text", "multimodal_text"):
                    parts = [p for p in m["content"].get("parts", []) if isinstance(p, str)]
                    txt = "\n".join(parts).strip()
                    w = len(txt.split()) if txt else 0
                    if ch_name == "commentary":
                        total_nodes_by_kind["commentary"] += 1
                        if w > 0:
                            m_awords[mym] += w
                            c_word_arr.append(w)
                    else:
                        total_nodes_by_kind["final_text"] += 1
                        if w > 0:
                            m_replies[mym] += 1
                            m_awords[mym] += w
                            a_word_arr.append(w)
                            fam = model_family(slug)
                            m_fams[mym][fam] += 1
                            if is_reasoning_slug(slug):
                                m_reas_replies[mym] += 1
                            if md.get("model_slug"):
                                slug_replies[md["model_slug"]] += 1

                            # Linguistic drift metrics on assistant final replies
                            lb = q_ling[mqtr]
                            lb["replies"] += 1
                            lb["words"] += w
                            if PAT_SYCO_START.search(txt[:80]):
                                lb["syco"] += 1
                            lb["ai_isms"] += len(PAT_AI_ISMS.findall(txt))
                            lb["em_dashes"] += txt.count("—") + txt.count(" -- ")
                            lb["bold"] += len(re.findall(r"\*\*[^*\n]{1,80}\*\*", txt))
                            lb["bullets"] += len(re.findall(r"(?m)^\s*(?:[-*•]|\d+\.)\s+", txt))

                            cbs = re.findall(r"```([a-zA-Z0-9_+-]*)\n", txt)
                            if cbs:
                                code_reply_count += 1
                                total_code_blocks += len(cbs)
                                for lang in cbs:
                                    k = lang.lower().strip()
                                    if not k or k in ("text", "plaintext", "txt", "output"):
                                        unlabeled_code_blocks += 1
                                    else:
                                        code_langs[LANG_MAP.get(k, "Other languages")] += 1

                            # Ancestor walk for multi-turn context window & API-equivalent pricing
                            out_t = node_tok.get(nid, 0)
                            cur_anc = n.get("parent")
                            seen_u = False
                            fresh_in = 0
                            resent_in = 0
                            reas_t = 0
                            u_depth = 0
                            while cur_anc and cur_anc in mp:
                                r_info = node_role.get(cur_anc)
                                t_val = node_tok.get(cur_anc, 0)
                                if r_info:
                                    rt, rch = r_info
                                    if rt == "user":
                                        u_depth += 1
                                        if not seen_u:
                                            fresh_in += t_val
                                            seen_u = True
                                        else:
                                            resent_in += t_val
                                    elif rt == "assistant":
                                        if not seen_u and rch == "commentary":
                                            reas_t += t_val
                                        else:
                                            resent_in += t_val
                                    elif rt == "thoughts" and not seen_u:
                                        reas_t += t_val
                                cm_anc = mp[cur_anc].get("message")
                                if cm_anc and not seen_u:
                                    dur_a = (cm_anc.get("metadata") or {}).get("finished_duration_sec")
                                    if isinstance(dur_a, (int, float)) and dur_a > 0:
                                        reas_t = max(reas_t, int(dur_a * 35))
                                cur_anc = mp[cur_anc].get("parent")

                            m_fresh_tok[mym] += fresh_in
                            m_resent_tok[mym] += resent_in
                            m_out_tok[mym] += out_t
                            m_reas_tok[mym] += reas_t
                            in_rate, out_rate = api_rates(slug)
                            cost = ((fresh_in + resent_in) * in_rate + (out_t + reas_t) * out_rate) / 1e6
                            m_api_cost[mym] += cost
                            slug_api_cost[slug] += cost

                            dk = min(max(u_depth, 1), 15)
                            depth_fresh_tok[dk] += fresh_in
                            depth_resent_tok[dk] += resent_in
                            depth_count[dk] += 1

                elif ct == "thoughts":
                    total_nodes_by_kind["thoughts"] += 1
                    ths = m["content"].get("thoughts") or []
                    txt = "\n".join(
                        (t.get("content") or "") + " " + (t.get("summary") or "")
                        for t in ths
                        if isinstance(t, dict)
                    )
                    w = len(txt.split())
                    if w > 0:
                        m_twords[mym] += w
                        t_word_arr.append(w)
                elif ct == "reasoning_recap":
                    total_nodes_by_kind["reasoning_recap"] += 1

                dur = md.get("finished_duration_sec")
                if isinstance(dur, (int, float)) and dur > 0:
                    m_think_sec[mym] += dur
                    m_think_turns[mym] += 1
                    eff = md.get("thinking_effort") or "default"
                    effort_durs[eff].append(dur)
                    ms = md.get("model_slug") or conv_default_slug or "unknown"
                    model_durs[ms].append(dur)
                    slug_think_sec[ms].append(dur)
                    longest_turns.append({
                        "sec": int(dur),
                        "date": mday,
                        "model": ms,
                        "effort": eff,
                        "title": c.get("title") or "Untitled",
                    })

        u_turns_dist[min(um_count, 15)] += 1
        if has_branch:
            branch_convs += 1

    # Session clustering (< 30m gap)
    all_u_ts.sort()
    sessions = []
    cur_s = [all_u_ts[0]]
    for item in all_u_ts[1:]:
        if item[0] - cur_s[-1][0] <= 1800:
            cur_s.append(item)
        else:
            sessions.append(cur_s)
            cur_s = [item]
    sessions.append(cur_s)
    multi_chat_sessions = sum(1 for s in sessions if len(set(x[1] for x in s)) >= 2)
    fg_sorted = sorted(follow_up_gaps)

    # Kaplan-Meier survival & hazard curve across turn depths 1..15
    survival_rows = []
    at_risk = sum(u_turns_dist[k] for k in range(1, 16))
    cum_tok = 0
    for k in range(1, 16):
        ended_here = u_turns_dist[k]
        cont = at_risk - ended_here if k < 15 else 0
        surv_frac = round(at_risk / N_convs, 4)
        cont_rate = round(cont / at_risk, 4) if at_risk else 0
        fork_rate = round(branch_at_depth[k] / max(at_risk, 1), 4)
        cnt_d = max(depth_count[k], 1)
        f_tok = round(depth_fresh_tok[k] / cnt_d)
        r_tok = round(depth_resent_tok[k] / cnt_d)
        cum_tok += f_tok + r_tok
        survival_rows.append({
            "k": k,
            "atRisk": at_risk,
            "convs": ended_here,
            "survival": surv_frac,
            "contRate": cont_rate,
            "forkRate": fork_rate,
            "freshTok": f_tok,
            "resentTok": r_tok,
            "cumTok": cum_tok,
            "resentShare": round(r_tok / max(f_tok + r_tok, 1), 4),
        })
        at_risk = cont

    all_months = sorted(m_convs.keys())
    months_out = []
    for ym in all_months:
        rep = m_replies[ym]
        rrep = m_reas_replies[ym]
        months_out.append({
            "m": ym,
            "convs": m_convs[ym],
            "prompts": m_prompts[ym],
            "replies": rep,
            "reasReplies": rrep,
            "reasShare": round(rrep / rep, 4) if rep else 0,
            "uWords": m_uwords[ym],
            "aWords": m_awords[ym],
            "tWords": m_twords[ym],
            "thinkSec": int(round(m_think_sec[ym])),
            "thinkTurns": m_think_turns[ym],
            "freshTok": m_fresh_tok[ym],
            "resentTok": m_resent_tok[ym],
            "outTok": m_out_tok[ym],
            "reasTok": m_reas_tok[ym],
            "apiCost": round(m_api_cost[ym], 2),
            "fams": [m_fams[ym][f] for f in FAMILIES],
        })

    quarters_out = []
    for q in sorted(q_style.keys()):
        qb = q_style[q]
        lb = q_ling[q]
        tot_u = qb["total"] or 1
        tot_r = lb["replies"] or 1
        tot_aw = lb["words"] or 1
        quarters_out.append({
            "q": q,
            "prompts": qb["total"],
            "replies": lb["replies"],
            "terse": round(qb["terse"] / tot_u, 4),
            "paste": round(qb["paste"] / tot_u, 4),
            "pushback": round(qb["pushback"] / tot_u, 4),
            "polite": round(qb["polite"] / tot_u, 4),
            "question": round(qb["question"] / tot_u, 4),
            "syco": round(lb["syco"] / tot_r, 4),
            "aiIsms": round(lb["ai_isms"] / tot_aw * 10000, 2),
            "emDashes": round(lb["em_dashes"] / tot_aw * 1000, 2),
            "bold": round(lb["bold"] / tot_aw * 1000, 1),
            "bullets": round(lb["bullets"] / tot_r, 1),
            "clusters": [cluster_by_qtr[q][i] for i in range(len(CLUSTERS))],
        })

    # Semantic atlas output
    atlas_cells = []
    for (dom_ci, gx, gy), (cnt, c_cnt, yr_arr, sx, sy) in sorted(atlas_bins.items()):
        atlas_cells.append({
            "x": round(sx / cnt, 3),
            "y": round(sy / cnt, 3),
            "n": cnt,
            "c": dom_ci,
            "yrs": yr_arr,
        })
    atlas_centroids = [
        {
            "year": yr,
            "x": round(year_xy_sum[yr][0] / max(year_xy_sum[yr][2], 1), 3),
            "y": round(year_xy_sum[yr][1] / max(year_xy_sum[yr][2], 1), 3),
            "n": year_xy_sum[yr][2],
        }
        for yr in ["2023", "2024", "2025", "2026"]
    ]
    clusters_out = []
    for cl in CLUSTERS:
        cid = cl["id"]
        pts = cluster_pts[cid]
        np_c = max(len(pts), 1)
        mx_c = sum(p[0] for p in pts) / np_c
        my_c = sum(p[1] for p in pts) / np_c
        sxx = sum((p[0] - mx_c) ** 2 for p in pts) / np_c
        syy = sum((p[1] - my_c) ** 2 for p in pts) / np_c
        sxy = sum((p[0] - mx_c) * (p[1] - my_c) for p in pts) / np_c
        tr_h = (sxx + syy) / 2.0
        disc = math.sqrt(max(0.0, ((sxx - syy) / 2.0) ** 2 + sxy * sxy))
        l1 = max(0.002, tr_h + disc)
        l2 = max(0.001, tr_h - disc)
        ang_deg = math.degrees(0.5 * math.atan2(2.0 * sxy, sxx - syy))
        clusters_out.append({
            "id": cid,
            "name": cl["name"],
            "short": cl["short"],
            "sub": cl["sub"],
            "ax": round(mx_c, 3),
            "ay": round(my_c, 3),
            "rx": round(1.85 * math.sqrt(l1), 3),
            "ry": round(1.85 * math.sqrt(l2), 3),
            "angle": round(ang_deg, 1),
            "total": cluster_counts[cid],
            "byYear": [cluster_by_year[yr][cid] for yr in ["2023", "2024", "2025", "2026"]],
        })

    top_slugs = []
    for ms, cnt in slug_nodes.most_common(16):
        durs = sorted(slug_think_sec.get(ms, []))
        top_slugs.append({
            "slug": ms,
            "family": model_family(ms),
            "nodes": cnt,
            "replies": slug_replies[ms],
            "first": slug_first.get(ms),
            "last": slug_last.get(ms),
            "thinkTurns": len(durs),
            "thinkHours": round(sum(durs) / 3600, 2),
            "medSec": round(quantile(durs, 0.5), 1) if durs else 0,
            "apiCost": round(slug_api_cost[ms], 2),
        })

    def dur_summary(label, kind, arr):
        s = sorted(arr)
        return {
            "label": label,
            "kind": kind,
            "n": len(s),
            "hours": round(sum(s) / 3600, 2),
            "p10": round(quantile(s, 0.10), 1),
            "p25": round(quantile(s, 0.25), 1),
            "med": round(quantile(s, 0.50), 1),
            "p75": round(quantile(s, 0.75), 1),
            "p90": round(quantile(s, 0.90), 1),
            "max": int(max(s)) if s else 0,
        }

    thinking_groups = [
        dur_summary("gpt-6.1-sol-wm", "model", model_durs["gpt-6.1-sol-wm"]),
        dur_summary("gpt-6-pro", "model", model_durs["gpt-6-pro"]),
        dur_summary("gpt-6-thinking", "model", model_durs["gpt-6-thinking"]),
        dur_summary("o3", "model", model_durs["o3"]),
        dur_summary("gpt-5-thinking", "model", model_durs["gpt-5-thinking"]),
        dur_summary("gpt-5-6-thinking", "model", model_durs["gpt-5-6-thinking"]),
        dur_summary("gpt-5-2-thinking", "model", model_durs["gpt-5-2-thinking"]),
        dur_summary("gpt-5-5-thinking", "model", model_durs["gpt-5-5-thinking"]),
        dur_summary("o4-mini-high", "model", model_durs["o4-mini-high"]),
        dur_summary("gpt-5-4-thinking", "model", model_durs["gpt-5-4-thinking"]),
    ]
    effort_groups = [
        dur_summary("xhigh", "effort", effort_durs["xhigh"]),
        dur_summary("extended", "effort", effort_durs["extended"]),
        dur_summary("default (unlabeled)", "effort", effort_durs["default"]),
        dur_summary("max", "effort", effort_durs["max"]),
        dur_summary("standard", "effort", effort_durs["standard"]),
    ]

    longest_turns.sort(key=lambda x: -x["sec"])
    SAFE_TITLES = {
        "Minecraft Explainer Video": "Minecraft Explainer Video",
        "RelFlow competitor analysis": "RelFlow competitor analysis",
        "TabPFN Explainer Video": "TabPFN Explainer Video",
        "Competitor Analysis Benchmark": "Competitor Analysis Benchmark",
        "Compare OPT Volume": "Compare OPT Volume",
        "Poker Solver PowerPoint": "Poker Solver PowerPoint",
        "Create Azure Explainer Video": "Create Azure Explainer Video",
        "Create Interview Excel File": "Create Interview Excel File",
        "Deep Comparison Report": "Deep Comparison Report",
        "尽调报告撰写": "Due-diligence report (尽调报告撰写)",
        "Create Navier Stokes Explainer": "Create Navier Stokes Explainer",
        "Build Trading System": "Build Trading System",
        "Create 3b1b Video": "Create 3b1b Video",
        "New chat": "Untitled research run",
    }
    top_longest = [
        {
            "sec": item["sec"],
            "date": item["date"],
            "model": item["model"],
            "effort": item["effort"],
            "title": SAFE_TITLES.get(item["title"], item["title"]),
        }
        for item in longest_turns[:15]
    ]

    xray_candidates.sort(key=lambda x: -x["sec"])
    seen_xray = set()
    turn_xrays = []
    for item in xray_candidates:
        if item["title"] in seen_xray:
            continue
        seen_xray.add(item["title"])
        item["title"] = SAFE_TITLES.get(item["title"], item["title"])
        turn_xrays.append(item)
        if len(turn_xrays) == 6:
            break

    u_buckets = [
        ("0–15 words", "Quick question or image", 0, 15),
        ("16–60 words", "Short paragraph", 16, 60),
        ("61–250 words", "Context or specification", 61, 250),
        ("251–1,000 words", "Code snippet or draft", 251, 1000),
        ("1,001+ words", "Pasted file, paper, or log", 1001, 10**9),
    ]
    prompt_buckets = []
    for label, desc, lo, hi in u_buckets:
        sub = [w for w in u_word_arr if lo <= w <= hi]
        sub_a = [w for w in a_word_arr if lo <= w <= hi]
        prompt_buckets.append({
            "label": label,
            "desc": desc,
            "uMsgs": len(sub),
            "uWords": sum(sub),
            "aMsgs": len(sub_a),
            "aWords": sum(sub_a),
        })

    cx = json.loads((CONV_DIR / "codex.json").read_text())
    lf_raw = json.loads((CONV_DIR / "library_files.json").read_text())
    lf_cats = Counter(x.get("library_file_category") or "other" for x in lf_raw)
    lf_exts = Counter((x.get("file_extension") or "other").lower() for x in lf_raw)
    lf_total_mb = round(sum(x.get("file_size_bytes") or 0 for x in lf_raw) / (1024 * 1024), 1)
    cx_months = Counter()
    cx_turns = 0
    cx_files = 0
    cx_paths = set()
    for t in cx:
        m = re.search(r"task_e_([0-9a-f]{8})", t["id"])
        if m:
            dt = datetime.fromtimestamp(int(m.group(1), 16), ET)
            cx_months[dt.strftime("%Y-%m")] += 1
        for tr in t["turns"]:
            if tr["role"] == "user":
                cx_turns += 1
            else:
                for item in tr.get("output_items") or []:
                    if isinstance(item, dict) and "files" in item:
                        for f in item["files"] or []:
                            cx_files += 1
                            if f.get("path"):
                                cx_paths.add(f["path"])
                    elif isinstance(item, dict):
                        for c_item in item.get("content") or []:
                            if isinstance(c_item, dict) and c_item.get("path"):
                                cx_paths.add(c_item["path"])

    charges_by_id = {}
    for f in glob.glob(str(RAW / "Financial" / "Charge History*.csv")):
        with open(f, newline="") as fp:
            for r in csv.DictReader(fp):
                charges_by_id[r["id"]] = r

    billing_events = []
    for cid, r in sorted(charges_by_id.items(), key=lambda kv: int(kv[1]["created"])):
        dt = datetime.fromtimestamp(int(r["created"]), ET).strftime("%Y-%m-%d")
        bd = json.loads(r.get("billing_details") or "{}")
        state = (bd.get("address") or {}).get("state") or ""
        amt = round(int(r["amount"]) / 100, 2)
        paid = r.get("paid") == "true"
        kind = "plus"
        if amt > 50:
            kind = "pro"
        elif amt < 15:
            kind = "api"
        elif not paid:
            kind = "failed"
        billing_events.append({
            "date": dt,
            "amount": amt,
            "paid": paid,
            "state": state,
            "kind": kind,
        })

    subscription_spans = [
        {"start": "2023-02-16", "end": "2023-06-06", "plan": "Free tier", "kind": "free", "state": "CA"},
        {"start": "2023-06-07", "end": "2024-02-06", "plan": "Plus ($20/mo)", "kind": "plus", "state": "CA"},
        {"start": "2024-02-07", "end": "2024-05-24", "plan": "Plus ($21.78/mo)", "kind": "plus", "state": "NY"},
        {"start": "2024-06-03", "end": "2025-12-03", "plan": "Plus ($20/mo)", "kind": "plus", "state": "CA"},
        {"start": "2026-01-10", "end": "2026-02-10", "plan": "Plus ($0 promo)", "kind": "promo", "state": "MA"},
        {"start": "2026-02-11", "end": "2026-05-29", "plan": "Plus ($21.25/mo)", "kind": "plus", "state": "MA"},
        {"start": "2026-05-30", "end": "2026-06-26", "plan": "Pro grant ($0)", "kind": "pro_free", "state": "MA"},
        {"start": "2026-10-28", "end": "2026-11-02", "plan": "Plus ($20/mo)", "kind": "plus", "state": "NJ"},
        {"start": "2026-11-03", "end": "2026-11-13", "plan": "Pro ($83.50 prorated)", "kind": "pro", "state": "NJ"},
    ]

    days_out = {}
    for d in sorted(day_prompts.keys()):
        ev_packed = sorted(m * 2 + r for m, r in day_events[d])
        days_out[d] = [day_prompts[d], day_reas_prompts[d], ev_packed]

    duo_hours = None
    duo_path = ROOT / "assets" / "data" / "duolingo" / "overview.json"
    if duo_path.exists():
        duo_data = json.loads(duo_path.read_text())
        dh = Counter(int(e["t"][11:13]) for e in duo_data["events"] if e["kind"] != "subscription")
        duo_hours = [dh[h] for h in range(24)]

    su = sorted(u_word_arr)
    sa = sorted(a_word_arr)
    st_arr = sorted(t_word_arr)

    ordered_trees = [
        sample_trees[k]
        for k in [
            "PPCA model explanation",
            "Human Code Assignment",
            "Data Analysis: JC Summary.",
            "Flight Data Summary Analysis",
            "Marginal likelihood for regression model",
        ]
        if k in sample_trees
    ]

    tot_fresh = sum(m_fresh_tok.values())
    tot_resent = sum(m_resent_tok.values())
    tot_out = sum(m_out_tok.values())
    tot_reas = sum(m_reas_tok.values())
    tot_api = round(sum(m_api_cost.values()), 2)

    data = {
        "generated": "2026-11-15",
        "firstDate": "2023-02-16",
        "lastDate": "2026-11-13",
        "spanDays": 1367,
        "activeDays": len(day_prompts),
        "totals": {
            "conversations": len(convs),
            "prompts": len(u_word_arr),
            "replies": len(a_word_arr),
            "commentary": len(c_word_arr),
            "thoughtBlocks": total_nodes_by_kind["thoughts"],
            "nonEmptyThoughts": len(t_word_arr),
            "recaps": total_nodes_by_kind["reasoning_recap"],
            "timedTurns": sum(m_think_turns.values()),
            "thinkSec": int(round(sum(m_think_sec.values()))),
            "uWords": sum(u_word_arr),
            "aWords": sum(a_word_arr) + sum(c_word_arr),
            "aFinalWords": sum(a_word_arr),
            "aCommWords": sum(c_word_arr),
            "tWords": sum(t_word_arr),
            "allWords": sum(u_word_arr) + sum(a_word_arr) + sum(c_word_arr) + sum(t_word_arr),
            "freshTok": tot_fresh,
            "resentTok": tot_resent,
            "outTok": tot_out,
            "reasTok": tot_reas,
            "allTok": tot_fresh + tot_resent + tot_out + tot_reas,
            "resentShare": round(tot_resent / max(tot_fresh + tot_resent, 1), 4),
            "apiCost": tot_api,
            "uMedianWords": quantile(su, 0.5),
            "uMeanWords": round(sum(su) / len(su), 1),
            "aMedianWords": quantile(sa, 0.5),
            "aMeanWords": round(sum(sa) / len(sa), 1),
            "tMedianWords": quantile(st_arr, 0.5),
            "codeBlocks": total_code_blocks,
            "codeReplies": code_reply_count,
            "unlabeledCodeBlocks": unlabeled_code_blocks,
            "paidTotal": round(sum(e["amount"] for e in billing_events if e["paid"]), 2),
            "paidCharges": sum(1 for e in billing_events if e["paid"]),
            "interrupted": finish_counts["interrupted"],
            "maxTokens": finish_counts["max_tokens"],
            "reasoningCancelled": finish_counts["reasoning_cancelled"],
            "dictated": len(dict_words),
            "dictatedEdited": dict_edited,
            "sessions": len(sessions),
            "multiChatSessions": multi_chat_sessions,
            "medianFollowUpSec": int(round(st.median(fg_sorted))) if fg_sorted else 0,
        },
        "families": FAMILIES,
        "clusters": clusters_out,
        "atlas": {
            "gridW": 20,
            "gridH": 14,
            "cells": atlas_cells,
            "centroids": atlas_centroids,
        },
        "months": months_out,
        "quarters": quarters_out,
        "topSlugs": top_slugs,
        "thinkingModels": thinking_groups,
        "thinkingEfforts": effort_groups,
        "longestTurns": top_longest,
        "turnXrays": turn_xrays,
        "turns": {
            "survival": survival_rows,
            "singleTurnConvs": u_turns_dist[1],
            "twoTurnConvs": u_turns_dist[2],
            "maxTurns": 41,
            "branchConvs": branch_convs,
            "branchPoints": branch_points,
            "extraBranches": extra_branches,
            "promptEdits": prompt_edits,
            "assistantRegens": assistant_regens,
            "promptBuckets": prompt_buckets,
            "sampleTrees": ordered_trees,
        },
        "days": days_out,
        "clock": {
            "all": [hour_all[h] for h in range(24)],
            "byYear": {yr: [hour_by_year[yr][h] for h in range(24)] for yr in ["2023", "2024", "2025", "2026"]},
            "wdHour": [[wd_hour[(wd, h)] for h in range(24)] for wd in range(7)],
            "duolingo": duo_hours,
        },
        "codeLangs": [{"lang": k, "blocks": v} for k, v in code_langs.most_common()],
        "modalitiesByYear": {
            yr: {
                "webSearch": mod_by_year[yr]["web_search"],
                "attachments": mod_by_year[yr]["attachments"],
                "customGpt": mod_by_year[yr]["custom_gpt"],
                "dictation": mod_by_year[yr]["dictation"],
                "voice": mod_by_year[yr]["voice"],
            }
            for yr in ["2023", "2024", "2025", "2026"]
        },
        "searchedDomains": [{"domain": d, "hits": c} for d, c in domain_counts.most_common(12)],
        "connectedRepos": [
            {"repo": r.replace("Sir-Teo/", ""), "msgs": c}
            for r, c in repo_counts.most_common(6)
        ],
        "codex": {
            "tasks": len(cx),
            "turns": cx_turns,
            "files": cx_files,
            "uniquePaths": len(cx_paths),
            "byMonth": dict(sorted(cx_months.items())),
        },
        "libraryFiles": {
            "total": len(lf_raw),
            "totalMB": lf_total_mb,
            "byCat": [{"cat": k, "count": v} for k, v in lf_cats.most_common()],
            "byExt": [{"ext": k, "count": v} for k, v in lf_exts.most_common(10) if k],
        },
        "billing": {
            "spans": subscription_spans,
            "charges": billing_events,
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(
        f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.1f} KiB): "
        f"{len(convs)} convs, {len(atlas_cells)} atlas cells, API value=${tot_api}"
    )


if __name__ == "__main__":
    main()
