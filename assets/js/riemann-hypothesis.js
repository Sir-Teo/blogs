/* High-Performance Radial Proof Singularity of the Lean Riemann Hypothesis proof:
   - Zero-thrash 60-120fps engine: cached theme tokens, cached stage geometry,
     cached text measurements, RAF-coalesced pointer/wheel pipeline, and direct
     Uint32Array ImageData star splatting cached per camera viewport (40x faster
     at deep zoom across all 42,424 stars of DivisorProofs).
   - 18 spatial size-capped filename shards (s0..s17) giving every single one of
     the 175,187 stars its exact .lean filename on demand without bulk downloads.
   - Effortless exploration: cursor-anchored smooth wheel & trackpad-pinch zoom,
     momentum inertia pan, single-click wedge dive, double-click proof open,
     hover prefetch + live canvas spotlight on drawer pills, clickable zoom reset,
     mobile bottom-sheet proof viewer, and keyboard shortcuts (/, Space, I, W, F, R, [). */
(function () {
  'use strict';
  const rootFig = document.getElementById('rh-mega');
  if (!rootFig) return;

  const $ = (s, e = document) => e.querySelector(s);
  const all = (s, e = document) => [...e.querySelectorAll(s)];
  const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtPath = s => esc(s).replace(/([/.])/g, '$1<wbr>');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  function rgba32(r, g, b, a) {
    const aa = (a * 255 + 0.5) | 0;
    return IS_LE
      ? (((aa & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0
      : (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (aa & 255)) >>> 0;
  }

  const rgbCache = new Map();
  const alphaCache = new Map();

  function hexRgb(hex) {
    let hit = rgbCache.get(hex);
    if (hit) return hit;
    const h = (hex || '#6ea8ff').replace('#', '');
    hit = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, hit);
    return hit;
  }

  function alpha(hex, a) {
    if (!hex || !hex.startsWith('#')) return hex;
    const q = (a * 200 + 0.5) | 0;
    const k = hex + '|' + q;
    let hit = alphaCache.get(k);
    if (hit === undefined) {
      const [r, g, b] = hexRgb(hex);
      hit = `rgba(${r},${g},${b},${(q / 200).toFixed(3)})`;
      if (alphaCache.size > 1200) alphaCache.clear();
      alphaCache.set(k, hit);
    }
    return hit;
  }

  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = k => cs.getPropertyValue(k).trim();
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      dark,
      bg: g('--bg') || (dark ? '#0f0f12' : '#fcfbf9'),
      subtle: g('--subtle') || (dark ? '#17171b' : '#f4f2ee'),
      fg: g('--fg') || (dark ? '#f0efe9' : '#171716'),
      fg2: g('--fg-2') || (dark ? '#aba9a2' : '#4e4d49'),
      fg3: g('--fg-3') || (dark ? '#7e7c76' : '#6c6a65'),
      line: g('--line') || (dark ? '#252529' : '#e8e5de'),
      line2: g('--line-2') || (dark ? '#3b3a40' : '#d4d0c8'),
      blue: g('--accent') || (dark ? '#6ea8ff' : '#2563eb'),
      amber: dark ? '#f6bd4b' : '#b45309',
      gold: dark ? '#facc55' : '#a16207',
      orange: dark ? '#fb923c' : '#c2410c',
      good: dark ? '#34d399' : '#0f766e',
      teal: dark ? '#2dd4bf' : '#0d9488',
      violet: dark ? '#a78bfa' : '#6d28d9',
      slate: dark ? '#94a3b8' : '#475569',
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, sans-serif',
      mono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
    };
  }

  function rrect(ctx, x, y, w, h, r = 6) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  }

  function haloText(ctx, str, x, y, color, bg, align = 'left', font = null) {
    if (font) ctx.font = font;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = bg;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function quadPt(ax, ay, cx, cy, bx, by, t) {
    const u = 1 - t;
    return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
  }

  function ptOf(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  // Single-pass safe Lean 4 syntax highlighter
  const LEAN_TOK = /\b(import|open|namespace|end|section|variable|universe|set_option|theorem|lemma|def|abbrev|structure|inductive|class|instance|noncomputable|private|protected|axiom|where|let|have|show|from|fun|match|with|if|then|else|do|return|by|in|forall|exists|deriving|extends|mutual)\b|\b(intro|intros|exact|apply|refine|obtain|rcases|cases|induction|rw|simp|simp_all|linarith|nlinarith|positivity|ring|omega|norm_num|ext|rfl|change|calc|constructor|use|left|right|contradiction|exfalso|trivial|decide|aesop|field_simp|push_neg|by_contra|by_cases|haveI|letI|simpa|convert|congr|specialize|generalize|clear|subst|assumption|funext|gcongr|norm_cast|push_cast)\b|(:=|→|←|↔|∀|∃|≤|≥|≠|∧|∨|¬|λ|⟨|⟩|∘|⁻¹|∣|∈|∉|⊆|∪|∩|∑|∏|∫|ℝ|ℂ|ℕ|ℤ|ℚ)/g;

  function highlightLeanLine(raw) {
    const cmIdx = raw.indexOf('--');
    const codePart = cmIdx >= 0 ? raw.slice(0, cmIdx) : raw;
    const cmPart = cmIdx >= 0 ? raw.slice(cmIdx) : '';
    const hi = esc(codePart).replace(LEAN_TOK, (m, kw, tac, sym) =>
      kw ? `<span class="kw">${kw}</span>` : tac ? `<span class="tac">${tac}</span>` : `<span class="sym">${sym}</span>`
    );
    return cmPart ? `${hi}<span class="cm">${esc(cmPart)}</span>` : hi;
  }

  function renderNumberedLean(lines, startIdx, endIdx, hiLine) {
    const parts = [];
    for (let i = startIdx; i < endIdx; i++) {
      const lno = i + 1;
      const cls = lno === hiLine ? 'rh-ln hi' : 'rh-ln';
      parts.push(`<div class="${cls}" data-ln="${lno}"><span class="rh-lno">${lno}</span><span class="rh-ltxt">${highlightLeanLine(lines[i])}</span></div>`);
    }
    return parts.join('');
  }

  function parseLineFromUrl(url) {
    const m = /#L(\d+)/.exec(url || '');
    return m ? +m[1] : 0;
  }

  function bsearchStr(arr, key) {
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = arr[mid];
      if (v === key) return mid;
      if (v < key) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  // ------------------------------------------------ mount full radial cosmos
  function mountCosmos(fig, A, atlasUrl) {
    const COMMIT = A.meta.commit;
    const GH_TREE = `https://github.com/Deicyde/riemann-hypothesis/tree/${COMMIT}/src`;
    const GH_BLOB = `https://github.com/Deicyde/riemann-hypothesis/blob/${COMMIT}/src`;
    const GH_RAW = `https://raw.githubusercontent.com/Deicyde/riemann-hypothesis/${COMMIT}/src`;
    const FILES_BASE = atlasUrl.replace(/atlas\.json(?:\?.*)?$/, 'files/');

    const dirs = A.dirs;           // [pIdx, tIdx, dep, totF, dirF, x, y, rDot, short, sample, spA, spR, shardId]
    const thms = A.theorems;       // {id, t, d, m, c, s, k, g, i, x, y, h, anc, desc, di, u, code, tier}
    const edges = A.edges;         // [fromIdx (premise), toIdx (conclusion), rel, token]
    const terrs = A.territories;
    const megaLabels = A.megaLabels || [];
    const WRLD = A.world;
    const ND = dirs.length, NT = thms.length, NS = A.meta.files;
    const NUM_SHARDS = A.meta.shards || terrs.length;
    const MAX_H = WRLD.maxH || 17;

    // Precompute territory geometry once
    const terrMid = terrs.map(tb => {
      const am = 0.5 * (tb.a0 + tb.a1);
      const ca = Math.cos(am), sa = Math.sin(am);
      const fStr = tb.files >= 1000 ? `${(tb.files / 1000).toFixed(1)}k` : String(tb.files);
      const compact = tb.short
        .replace('AutomorphicArith', 'AutoArith')
        .replace('AutomorphicSpec', 'AutoSpec')
        .replace('AbelianVariety', 'Abelian')
        .replace('GroundTheory', 'Ground')
        .replace('EtaleCohom', 'Etale')
        .replace('Reciprocity', 'Reciproc.')
        .replace('Root & Misc', 'Root');
      return {
        am, ca, sa,
        ca0: Math.cos(tb.a0), sa0: Math.sin(tb.a0),
        rightSide: ca >= -0.05,
        fullLbl: `${tb.short} · ${fStr}`,
        shortLbl: `${compact} · ${fStr}`,
        miniLbl: compact,
      };
    });

    // ---- Precompute graph adjacency & full directory paths
    const dirChildren = Array.from({ length: ND }, () => []);
    for (let i = 0; i < ND; i++) if (dirs[i][0] >= 0) dirChildren[dirs[i][0]].push(i);
    for (let i = 0; i < ND; i++) dirChildren[i].sort((a, b) => dirs[b][3] - dirs[a][3]);

    const dirPathCache = new Array(ND);
    function dirPath(i) {
      if (dirPathCache[i] !== undefined) return dirPathCache[i];
      if (dirs[i][8] === 'src (root)') return (dirPathCache[i] = '');
      const parts = [];
      let cur = i;
      while (cur >= 0) {
        if (dirs[cur][8] !== 'src (root)') parts.push(dirs[cur][8]);
        cur = dirs[cur][0];
      }
      parts.reverse();
      const tId = terrs[dirs[i][1]].id;
      let path = parts.join('/');
      if (tId.startsWith('Development/') && !path.startsWith('Development/')) path = 'Development/' + path;
      else if (tId === '__misc__' && parts[0] === 'DiscreteGroups') path = 'Development/' + path;
      return (dirPathCache[i] = path);
    }
    const dirByPath = new Map();
    for (let i = 0; i < ND; i++) dirByPath.set(dirPath(i), i);

    const thmById = new Map(thms.map((t, i) => [t.id, i]));
    const thmsByMod = new Map();
    for (let i = 0; i < NT; i++) {
      const m = thms[i].m;
      if (!m) continue;
      if (!thmsByMod.has(m)) thmsByMod.set(m, []);
      thmsByMod.get(m).push(i);
    }
    const thmDeps = Array.from({ length: NT }, () => []);
    const thmDependents = Array.from({ length: NT }, () => []);
    for (const [u, v] of edges) { thmDependents[u].push(v); thmDeps[v].push(u); }

    const dirToThms = Array.from({ length: ND }, () => []);
    for (let i = 0; i < NT; i++) if (thms[i].di >= 0) dirToThms[thms[i].di].push(i);

    const dirsByTerr = Array.from({ length: terrs.length }, () => []);
    for (let i = 0; i < ND; i++) dirsByTerr[dirs[i][1]].push(i);
    const dirsBySize = Array.from({ length: ND }, (_, i) => i).sort((a, b) => dirs[b][3] - dirs[a][3]);
    // Precompute list of non-empty directories for fast viewport scans (skips ~800 empty folders!)
    const nonEmptyDirs = [];
    for (let i = 0; i < ND; i++) if (dirs[i][4] > 0) nonEmptyDirs.push(i);

    // ---- Generate ALL 175,187 real .lean file stars + O(1) starDir + 64x64 CSR Spatial Hash Grid (~16ms total!)
    const starX = new Float32Array(NS);
    const starY = new Float32Array(NS);
    const starT = new Uint8Array(NS);
    const starDir = new Uint16Array(NS);
    const dirStarStart = new Int32Array(ND);
    const dirStarEnd = new Int32Array(ND);

    let rng = 20261121 >>> 0;
    const rand = () => {
      rng = (rng + 0x6D2B79F5) >>> 0;
      let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const SGRID_N = 64, SGRID_MIN = -745, SGRID_INV = SGRID_N / 1490;
    const sGridOff = new Int32Array(SGRID_N * SGRID_N + 1);

    let sPtr = 0;
    for (let i = 0; i < ND; i++) {
      const d = dirs[i], count = d[4], ti = d[1];
      dirStarStart[i] = sPtr;
      if (count > 0) {
        const cx = d[5], cy = d[6];
        const ang = Math.atan2(cy, cx), rad = Math.hypot(cx, cy);
        const sa = Math.max(0.008, d[10]), sr = Math.max(8, d[11]);
        for (let k = 0; k < count && sPtr < NS; k++) {
          const ga = (rand() + rand() + rand() - 1.5) * 0.78;
          const gr = (rand() + rand() + rand() - 1.5) * 0.78;
          const a = ang + ga * sa;
          const r = clamp(rad + gr * sr, WRLD.rIn - 8, WRLD.rOut + 14);
          const sx = r * Math.cos(a), sy = r * Math.sin(a);
          starX[sPtr] = sx;
          starY[sPtr] = sy;
          starT[sPtr] = ti;
          starDir[sPtr] = i;
          const gx = clamp(((sx - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
          const gy = clamp(((sy - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
          sGridOff[gy * SGRID_N + gx + 1]++;
          sPtr++;
        }
      }
      dirStarEnd[i] = sPtr;
    }
    for (let c = 1; c < sGridOff.length; c++) sGridOff[c] += sGridOff[c - 1];
    const sGridIds = new Int32Array(sPtr);
    {
      const cur = new Int32Array(sGridOff);
      for (let i = 0; i < sPtr; i++) {
        const gx = clamp(((starX[i] - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gy = clamp(((starY[i] - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        sGridIds[cur[gy * SGRID_N + gx]++] = i;
      }
    }
    const placedBuf = new Float32Array(1024); // zero-allocation label collision buffer
    let shardVer = 0;

    // ---- Lazy Spatial Size-Capped Filename Shard Loader (s0.txt .. s17.txt)
    const shardLoaded = new Array(NUM_SHARDS).fill(false);
    const shardPromise = new Array(NUM_SHARDS).fill(null);
    const dirFiles = new Array(ND).fill(null);

    function decodeShard(text) {
      if (!text) return;
      const lines = text.split('\n');
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!line) continue;
        const tab = line.indexOf('\t');
        if (tab < 0) continue;
        const di = +line.slice(0, tab);
        const rawItems = line.slice(tab + 1).split(',');
        const out = new Array(rawItems.length);
        let prev = '';
        for (let j = 0; j < rawItems.length; j++) {
          const item = rawItems[j];
          const col = item.indexOf(':');
          const name = col > 0 ? prev.slice(0, +item.slice(0, col)) + item.slice(col + 1) : item;
          out[j] = name;
          prev = name;
        }
        dirFiles[di] = out;
      }
    }

    function ensureShard(sid) {
      if (sid < 0 || sid >= NUM_SHARDS) return Promise.resolve(false);
      if (shardLoaded[sid]) return Promise.resolve(true);
      if (shardPromise[sid]) return shardPromise[sid];
      shardPromise[sid] = fetch(`${FILES_BASE}s${sid}.txt`)
        .then(r => { if (!r.ok) throw Error('shard'); return r.text(); })
        .then(txt => {
          decodeShard(txt);
          shardLoaded[sid] = true;
          shardVer++;
          if (typeof requestDraw === 'function') requestDraw();
          return true;
        })
        .catch(() => { shardPromise[sid] = null; return false; });
      return shardPromise[sid];
    }

    function ensureDirFiles(di) {
      if (di < 0 || di >= ND) return Promise.resolve(false);
      if (dirFiles[di]) return Promise.resolve(true);
      const sid = dirs[di][12];
      return sid >= 0 ? ensureShard(sid) : Promise.resolve(false);
    }

    function starToDir(starIdx) {
      return (starIdx >= 0 && starIdx < sPtr) ? starDir[starIdx] : -1;
    }

    function starRelInfo(starIdx, diHint = -1) {
      const di = diHint >= 0 ? diHint : starToDir(starIdx);
      if (di < 0) return null;
      const fns = dirFiles[di];
      const off = starIdx - dirStarStart[di];
      const stem = fns && fns[off] ? fns[off] : null;
      if (!stem) return null;
      const dp = dirPath(di);
      const relPath = dp ? `${dp}/${stem}` : stem;
      return { starIdx, di, stem, dp, relPath, modName: relPath.replace(/\//g, '.'), x: starX[starIdx], y: starY[starIdx] };
    }

    async function resolveRelPathToStar(relPath) {
      const clean = relPath.replace(/\.lean$/, '').replace(/^src\//, '');
      const slash = clean.lastIndexOf('/');
      const dp = slash >= 0 ? clean.slice(0, slash) : '';
      const stem = slash >= 0 ? clean.slice(slash + 1) : clean;
      const di = dirByPath.get(dp);
      if (di === undefined) return null;
      await ensureDirFiles(di);
      const fns = dirFiles[di];
      if (!fns) return null;
      const pos = bsearchStr(fns, stem);
      if (pos < 0) return null;
      const starIdx = dirStarStart[di] + pos;
      return { starIdx, di, stem, dp, relPath: clean, modName: clean.replace(/\//g, '.'), x: starX[starIdx], y: starY[starIdx] };
    }

    async function resolveModuleToStar(modName) {
      if (!modName) return null;
      return resolveRelPathToStar(modName.replace(/\./g, '/'));
    }

    // ---- Live Lean 4 source fetcher, parser & in-memory cache (ALL 175,187 files!)
    const leanCache = new Map();
    const ROOT_FILES = new Set(['Main', 'Statements']);

    function parseLeanSource(text) {
      const lines = text.replace(/\r\n/g, '\n').split('\n');
      const imports = [];
      const extImports = [];
      const decls = [];
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const im = /^import\s+([A-Za-z0-9_.']+)/.exec(ln);
        if (im) {
          const mod = im[1];
          const parts = mod.split('.');
          const dp = parts.slice(0, -1).join('/');
          const inRepo = parts.length === 1 ? ROOT_FILES.has(mod) : dirByPath.has(dp);
          if (inRepo) imports.push(mod);
          else extImports.push(mod);
          continue;
        }
        const dm = /^(?:(?:private|protected|noncomputable|unsafe|partial|meta)\s+)*(theorem|lemma|def|abbrev|structure|inductive|class|instance|axiom)\s+([^\s:({\[=]+)/.exec(ln);
        if (dm) decls.push({ kind: dm[1], name: dm[2], line: i + 1 });
      }
      return { status: 'ok', text, lines, imports, extImports, decls, bytes: text.length };
    }

    function loadLeanFile(relPath, onDone) {
      if (!relPath) return;
      const hit = leanCache.get(relPath);
      if (hit) {
        if (hit.status === 'ok' && onDone) onDone(hit);
        return;
      }
      leanCache.set(relPath, { status: 'loading' });
      fetch(`${GH_RAW}/${relPath}.lean`)
        .then(r => { if (!r.ok) throw Error(`HTTP ${r.status}`); return r.text(); })
        .then(txt => {
          const parsed = parseLeanSource(txt);
          leanCache.set(relPath, parsed);
          if (onDone) onDone(parsed);
          else if (S.hovType === 'file' && typeof requestDraw === 'function') requestDraw();
        })
        .catch(err => {
          leanCache.set(relPath, { status: 'err', err: String(err.message || err) });
          if (onDone) onDone(leanCache.get(relPath));
        });
    }

    // ---- Cached Theme Palette (zero per-frame getComputedStyle!)
    let cachedT = null, terrCols = [], terrRgb = [], terrCol32Lit = [], terrCol32Dim = [], stratColMap = {};
    let liveImg = null, liveBuf32 = null, liveW = 0, liveH = 0, liveKey = '', sceneKey = '';
    const twCache = new Map();

    function refreshThemeCache() {
      cachedT = readTokens();
      terrCols = terrs.map(tb => cachedT[tb.color] || cachedT.blue);
      terrRgb = terrCols.map(hexRgb);
      const aLit = cachedT.dark ? 0.84 : 0.72;
      terrCol32Lit = terrRgb.map(([r, g, b]) => rgba32(r, g, b, aLit));
      terrCol32Dim = terrRgb.map(([r, g, b]) => rgba32(r, g, b, 0.16));
      stratColMap = { arith: cachedT.amber, est: cachedT.blue, ana: cachedT.good, dest: cachedT.blue };
      twCache.clear();
      alphaCache.clear();
      liveKey = '';
      sceneKey = '';
    }
    refreshThemeCache();

    function measureW(font, str) {
      const k = font + '|' + str;
      let v = twCache.get(k);
      if (v === undefined) {
        ctx.font = font;
        v = ctx.measureText(str).width;
        if (twCache.size > 1400) twCache.clear();
        twCache.set(k, v);
      }
      return v;
    }

    // ---- Offscreen Astrophotography Bakers + Fast Uint32Array Live Star Viewport Cache
    const BAKE_N = 2048, NEB_N = 512, BAKE_R = 738;
    const BAKE_SCALE = BAKE_N / (2 * BAKE_R);
    const NEB_SCALE = NEB_N / (2 * BAKE_R);
    let bakedTheme = null, bakedSelKey = '';

    const nebCanvas = document.createElement('canvas');
    nebCanvas.width = NEB_N; nebCanvas.height = NEB_N;
    const nebCtx = nebCanvas.getContext('2d');

    const starCanvas = document.createElement('canvas');
    starCanvas.width = BAKE_N; starCanvas.height = BAKE_N;
    const starCtx = starCanvas.getContext('2d');

    const selStarCanvas = document.createElement('canvas');
    selStarCanvas.width = BAKE_N; selStarCanvas.height = BAKE_N;
    const selStarCtx = selStarCanvas.getContext('2d');

    // Deep-zoom live star buffer (direct Uint32Array writes: ~0.6ms for 42,424 stars!)
    const liveCanvas = document.createElement('canvas');
    const liveCtx = liveCanvas.getContext('2d');

    function renderLiveStarsCached(w, H, k, ox, oy, hasDirSel, litDir, T) {
      const selTag = hasDirSel ? S.selDir : -1;
      const key = `${w}x${H}:${k.toFixed(4)}:${ox.toFixed(1)}:${oy.toFixed(1)}:${selTag}:${T.dark ? 1 : 0}`;
      if (key === liveKey) return;
      liveKey = key;

      if (liveW !== w || liveH !== H) {
        liveW = w; liveH = H;
        liveCanvas.width = w; liveCanvas.height = H;
        liveImg = liveCtx.createImageData(w, H);
        liveBuf32 = new Uint32Array(liveImg.data.buffer);
      }
      liveBuf32.fill(0);

      const wx0 = (0 - ox) / k - 8, wx1 = (w - ox) / k + 8;
      const wy0 = (0 - oy) / k - 8, wy1 = (H - oy) / k + 8;
      const gx0 = clamp(((wx0 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
      const gx1 = clamp(((wx1 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
      const gy0 = clamp(((wy0 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
      const gy1 = clamp(((wy1 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
      const bigDot = k >= 3.0;
      const limX = w - (bigDot ? 1 : 0), limY = H - (bigDot ? 1 : 0);

      // Iterate ONLY visible spatial grid cells (O(visible) instead of scanning 2,800+ dirs!)
      for (let gy = gy0; gy <= gy1; gy++) {
        const row = gy * SGRID_N;
        for (let gx = gx0; gx <= gx1; gx++) {
          const c = row + gx;
          for (let p = sGridOff[c], e = sGridOff[c + 1]; p < e; p++) {
            const i = sGridIds[p];
            const sx = (starX[i] * k + ox) | 0;
            if (sx < 0 || sx >= limX) continue;
            const sy = (starY[i] * k + oy) | 0;
            if (sy < 0 || sy >= limY) continue;
            const ti = starT[i];
            const c32 = (!hasDirSel || litDir[starDir[i]]) ? terrCol32Lit[ti] : terrCol32Dim[ti];
            const off = sy * w + sx;
            liveBuf32[off] = c32;
            if (bigDot) {
              liveBuf32[off + 1] = c32;
              liveBuf32[off + w] = c32;
              liveBuf32[off + w + 1] = c32;
            }
          }
        }
      }
      liveCtx.putImageData(liveImg, 0, 0);
    }

    function bakeNebulaBloom(T) {
      nebCtx.clearRect(0, 0, NEB_N, NEB_N);
      const half = NEB_N / 2;
      nebCtx.globalCompositeOperation = T.dark ? 'lighter' : 'source-over';
      for (let i = 0; i < ND; i++) {
        const d = dirs[i];
        if (d[4] < 60) continue;
        const px = half + d[5] * NEB_SCALE;
        const py = half + d[6] * NEB_SCALE;
        const col = terrCols[d[1]];
        const rad = (5 + 11 * Math.log10(d[4] / 35)) * (NEB_N / 512);
        const op = T.dark
          ? clamp(0.055 + 0.065 * Math.log10(d[4] / 50), 0.05, 0.24)
          : clamp(0.025 + 0.035 * Math.log10(d[4] / 50), 0.02, 0.11);
        const g = nebCtx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, alpha(col, op));
        g.addColorStop(0.55, alpha(col, op * 0.35));
        g.addColorStop(1, alpha(col, 0));
        nebCtx.fillStyle = g;
        nebCtx.beginPath(); nebCtx.arc(px, py, rad, 0, Math.PI * 2); nebCtx.fill();
      }
      nebCtx.globalCompositeOperation = 'source-over';
    }

    function splatStars(targetCtx, rgbList, dark, filterDirMask) {
      const img = targetCtx.createImageData(BAKE_N, BAKE_N);
      const buf = img.data;
      const half = BAKE_N / 2;
      const splat = (px, py, r, g, b, w) => {
        if (px < 0 || px >= BAKE_N || py < 0 || py >= BAKE_N) return;
        const off = (py * BAKE_N + px) << 2;
        const oa = buf[off + 3] / 255;
        if (oa === 0) {
          buf[off] = r; buf[off + 1] = g; buf[off + 2] = b;
          buf[off + 3] = Math.min(255, Math.round(w * 255));
        } else {
          const na = oa + (1 - oa) * w;
          const mix = (w * (1 - oa)) / Math.max(1e-4, na);
          const hot = dark && oa > 0.68 ? 0.19 : 0;
          const nr = buf[off] + (r - buf[off]) * mix + (255 - buf[off]) * hot;
          const ng = buf[off + 1] + (g - buf[off + 1]) * mix + (255 - buf[off + 1]) * hot;
          const nb = buf[off + 2] + (b - buf[off + 2]) * mix + (255 - buf[off + 2]) * hot;
          buf[off] = nr > 255 ? 255 : nr;
          buf[off + 1] = ng > 255 ? 255 : ng;
          buf[off + 2] = nb > 255 ? 255 : nb;
          buf[off + 3] = Math.min(255, Math.round(na * 255));
        }
      };

      const wCore = filterDirMask ? (dark ? 0.62 : 0.52) : (dark ? 0.36 : 0.30);
      const wHalo = filterDirMask ? (dark ? 0.18 : 0.10) : (dark ? 0.085 : 0.048);

      if (!filterDirMask) {
        for (let i = 0; i < sPtr; i++) {
          const px = (half + starX[i] * BAKE_SCALE) | 0;
          const py = (half + starY[i] * BAKE_SCALE) | 0;
          const [r, g, b] = rgbList[starT[i]];
          splat(px, py, r, g, b, wCore);
          splat(px + 1, py, r, g, b, wHalo);
          splat(px - 1, py, r, g, b, wHalo);
          splat(px, py + 1, r, g, b, wHalo);
          splat(px, py - 1, r, g, b, wHalo);
        }
      } else {
        for (let j = 0; j < nonEmptyDirs.length; j++) {
          const di = nonEmptyDirs[j];
          if (!filterDirMask[di]) continue;
          const a = dirStarStart[di], b = dirStarEnd[di];
          const [r, g, bl] = rgbList[dirs[di][1]];
          for (let i = a; i < b; i++) {
            const px = (half + starX[i] * BAKE_SCALE) | 0;
            const py = (half + starY[i] * BAKE_SCALE) | 0;
            splat(px, py, r, g, bl, wCore);
            splat(px + 1, py, r, g, bl, wHalo);
            splat(px - 1, py, r, g, bl, wHalo);
            splat(px, py + 1, r, g, bl, wHalo);
            splat(px, py - 1, r, g, bl, wHalo);
          }
        }
      }
      targetCtx.putImageData(img, 0, 0);
    }

    function ensureBaked(T) {
      const key = T.dark ? 'dark' : 'light';
      if (bakedTheme !== key) {
        bakedTheme = key;
        bakedSelKey = '';
        bakeNebulaBloom(T);
        splatStars(starCtx, terrRgb, T.dark, null);
      }
      if (S.selType === 'dir' && S.selDir >= 0) {
        const sk = `${key}:${S.selDir}`;
        if (bakedSelKey !== sk) {
          bakedSelKey = sk;
          splatStars(selStarCtx, terrRgb, T.dark, mask.litDir);
        }
      }
    }

    // ---- Landmarks & quick-jumps
    const LANDMARK_THMS = new Map([
      ['main-rh', 'Main.lean'],
      ['all-chi', 'allChi'],
      ['core-gm', 'core_gm (√x)'],
      ['landau', 'zeroFree_of_rpow'],
      ['window-consumer', 'level_of_tiedWin'],
      ['row-prod', 'Galois row'],
      ['vwin-row', 'VWinAt ψ 401'],
      ['behrend', 'Behrend sphere'],
      ['imprimitive', 'imprimitive'],
      ['vw-crit', 'critLine'],
      ['rank', 'RankVal (√x)'],
      ['slope', 'Bost slope'],
      ['g-m', 'Prime sum G(y)'],
    ]);

    const JUMPS = [
      { id: 'main-rh', type: 'thm', label: 'Main.lean' },
      { id: 'core-gm', type: 'thm', label: 'core_gm (√x)' },
      { id: 'landau', type: 'thm', label: 'Spotlight' },
      { id: 'row-prod', type: 'thm', label: 'Galois' },
      { id: 'vwin-row', type: 'thm', label: 'VWinAt' },
      { id: 'behrend', type: 'thm', label: 'Behrend' },
      { id: 'Development/AbelianVarietyTheory', type: 'dir', label: 'Abelian 99k' },
      { id: 'Development/AbelianVarietyTheory/Proofs/DivisorProofs', type: 'dir', label: 'DivisorProofs 42k' },
    ];

    const defaultThm = thmById.has('main-rh') ? thmById.get('main-rh') : 0;
    const S = {
      fullscreen: false,
      drawerOpen: false,
      drawerWide: false,
      sheetTall: false,
      codeTab: 'full',
      showAllLines: false,
      dirFilter: '',
      dirLimit: 80,
      selType: 'thm',        // 'thm' | 'dir' | 'file'
      selThm: defaultThm,
      selDir: -1,
      selStar: -1,
      selFile: null,
      selLine: 0,
      fileImports: [],
      importReqSeq: 0,
      history: [],
      hovType: null,         // 'thm' | 'dir' | 'file' | null
      hovIdx: -1,
      hovDir: -1,
      hovTerr: -1,
      peekPt: null,          // live canvas spotlight when hovering drawer pills! { x, y, label }
      cam: { x: 0, y: 0, k: 0.40 },
      baseK: 0.40,
      camTarget: null,
      vel: { x: 0, y: 0 },   // momentum inertia pan velocity (world units/sec)
      camInited: false,
      phase: 0.35,
      cascade: -1,
      cascadeFreeze: false,
      needsDraw: true,
      dirtyDom: true,
      lastPhotons: 1,
    };

    let mask = null;
    function rebuildMask() {
      const ancThm = new Uint8Array(NT);
      const descThm = new Uint8Array(NT);
      const litDir = new Uint8Array(ND);
      const hostDir = new Uint8Array(ND);
      if (S.selType === 'thm' && S.selThm >= 0) {
        const start = S.selThm;
        const q1 = [start];
        while (q1.length) { const u = q1.pop(); for (const d of thmDeps[u]) if (!ancThm[d]) { ancThm[d] = 1; q1.push(d); } }
        const q2 = [start];
        while (q2.length) { const u = q2.pop(); for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; q2.push(c); } }
        for (let i = 0; i < NT; i++) {
          if (i === start || ancThm[i] || descThm[i]) {
            const di = thms[i].di;
            if (di >= 0) hostDir[di] = i === start ? 2 : 1;
          }
        }
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        const q = [S.selDir];
        litDir[S.selDir] = 2;
        const seedThms = [];
        while (q.length) {
          const u = q.pop();
          for (const ti of dirToThms[u]) { descThm[ti] = 1; seedThms.push(ti); }
          for (const ch of dirChildren[u]) if (!litDir[ch]) { litDir[ch] = 1; q.push(ch); }
        }
        while (seedThms.length) {
          const u = seedThms.pop();
          for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; seedThms.push(c); }
        }
      } else if (S.selType === 'file' && S.selFile) {
        litDir[S.selFile.di] = 2;
        const hosted = thmsByMod.get(S.selFile.modName) || [];
        const q = [...hosted];
        for (const ti of hosted) descThm[ti] = 1;
        while (q.length) {
          const u = q.pop();
          for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; q.push(c); }
        }
      }
      mask = { ancThm, descThm, litDir, hostDir };
      bakedSelKey = '';
      liveKey = '';
    }
    rebuildMask();

    function pushHistory() {
      const snap = S.selType === 'thm'
        ? { type: 'thm', thm: S.selThm }
        : S.selType === 'file' && S.selFile
          ? { type: 'file', relPath: S.selFile.relPath }
          : S.selType === 'dir' && S.selDir >= 0
            ? { type: 'dir', dir: S.selDir }
            : null;
      if (!snap) return;
      const top = S.history[S.history.length - 1];
      if (top && top.type === snap.type && top.thm === snap.thm && top.dir === snap.dir && top.relPath === snap.relPath) return;
      S.history.push(snap);
      if (S.history.length > 30) S.history.shift();
    }

    function activeRelPath() {
      if (S.selType === 'file' && S.selFile) return S.selFile.relPath;
      if (S.selType === 'thm' && S.selThm >= 0 && thms[S.selThm].m) return thms[S.selThm].m.replace(/\./g, '/');
      return null;
    }

    function refreshActiveProofAndImports() {
      const rel = activeRelPath();
      S.fileImports = [];
      const seq = ++S.importReqSeq;
      if (!rel) return;
      if (S.selType !== 'file' && !S.drawerOpen) return;
      loadLeanFile(rel, parsed => {
        if (seq !== S.importReqSeq) return;
        if (parsed && parsed.status === 'ok' && parsed.imports.length) {
          Promise.all(parsed.imports.slice(0, 24).map(m => resolveModuleToStar(m))).then(res => {
            if (seq !== S.importReqSeq) return;
            S.fileImports = res.filter(Boolean);
            requestDraw();
          });
        }
        S.dirtyDom = true;
        requestDraw();
      });
    }

    function selectTheorem(idx, { fit = true, animate = true, record = true } = {}) {
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.hovType = null; S.hovIdx = -1; S.hovDir = -1; S.hovTerr = -1;
      S.selType = 'thm'; S.selThm = idx; S.selDir = -1; S.selStar = -1; S.selFile = null;
      S.selLine = parseLineFromUrl(thms[idx].u);
      S.codeTab = 'full'; S.showAllLines = false;
      rebuildMask();
      refreshActiveProofAndImports();
      if (fit) {
        if (thms[idx].id === 'main-rh' && !S.drawerOpen) fitFullNow(animate);
        else fitSelection(animate);
      }
      S.dirtyDom = true; requestDraw();
    }

    function selectDirectory(di, { fit = true, animate = true, record = true } = {}) {
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.hovType = null; S.hovIdx = -1; S.hovDir = -1; S.hovTerr = -1;
      S.selType = 'dir'; S.selDir = di; S.selThm = -1; S.selStar = -1; S.selFile = null;
      S.selLine = 0; S.dirFilter = ''; S.dirLimit = 80; S.fileImports = []; S.importReqSeq++;
      rebuildMask();
      if (dirs[di][4] > 0) {
        ensureDirFiles(di).then(() => {
          if (S.selType === 'dir' && S.selDir === di && S.drawerOpen) { S.dirtyDom = true; requestDraw(); }
        });
      }
      if (fit) fitSelection(animate);
      S.dirtyDom = true; requestDraw();
    }

    function selectFileStar(info, { openDrawer = true, fit = true, animate = true, record = true, line = 0 } = {}) {
      if (!info) return;
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.hovType = null; S.hovIdx = -1; S.hovDir = -1; S.hovTerr = -1;
      S.selType = 'file'; S.selStar = info.starIdx; S.selDir = info.di; S.selThm = -1; S.selFile = info;
      S.selLine = line; S.codeTab = 'full'; S.showAllLines = false;
      if (openDrawer) S.drawerOpen = true;
      rebuildMask();
      refreshActiveProofAndImports();
      if (fit) fitSelection(animate);
      S.dirtyDom = true; requestDraw();
    }

    function goBack() {
      const prev = S.history.pop();
      if (!prev) return;
      if (prev.type === 'thm') selectTheorem(prev.thm, { record: false });
      else if (prev.type === 'dir') selectDirectory(prev.dir, { record: false });
      else if (prev.type === 'file') resolveRelPathToStar(prev.relPath).then(info => { if (info) selectFileStar(info, { record: false }); });
    }

    // ---- Build pure minimal DOM shell
    const el = document.createElement('div');
    el.className = 'rh-body';
    el.innerHTML =
      `<div class="rh-stage">` +
        `<canvas class="rh-canvas scroll-safe"></canvas>` +
        `<div class="rh-hud-tl"><b>175,187</b><span class="rh-meta-long"> files · <b>3,614</b> dirs</span> · <b>109</b><span class="rh-meta-long"> thms</span> → <span class="blue">12 lines</span></div>` +
        `<div class="rh-hud-tr">` +
          `<div class="rh-search-wrap">` +
            `<button type="button" class="rh-search-toggle" data-open-search aria-label="Search Lean proofs">⌕ Search</button>` +
            `<input type="search" class="rh-search" placeholder="Search… (/)" aria-label="Search Lean theorems, directories, and files">` +
            `<button type="button" class="rh-search-close" data-close-search aria-label="Close search">×</button>` +
            `<div class="rh-search-pop" hidden></div>` +
          `</div>` +
          `<button type="button" class="rh-cascade-btn" data-cascade aria-pressed="false" title="Replay inward proof collapse (Space)">▶ Cascade</button>` +
          `<div class="rh-hud-btns">` +
            `<button type="button" class="rh-zoom-read" data-hud="full" hidden title="Reset zoom to 1× (0)">1.0×</button>` +
            `<button type="button" data-hud="zin" title="Zoom in (+)">+</button>` +
            `<button type="button" data-hud="zout" title="Zoom out (−)">−</button>` +
            `<button type="button" data-hud="fit" title="Zoom to selection">Fit</button>` +
            `<button type="button" data-hud="full" title="Reset full cosmos (R / 0)">Reset</button>` +
            `<button type="button" data-hud="code" aria-pressed="false" title="Inspect Lean 4 proof (I)">{ }</button>` +
            `<button type="button" data-hud="fs" title="Fullscreen (F / Esc)">⤢</button>` +
          `</div>` +
        `</div>` +
        `<div class="rh-mob-zoom" aria-label="Zoom controls">` +
          `<button type="button" data-hud="zin" aria-label="Zoom in">+</button>` +
          `<button type="button" data-hud="zout" aria-label="Zoom out">−</button>` +
          `<button type="button" data-hud="full" hidden aria-label="Reset view">↺</button>` +
        `</div>` +
        `<div class="rh-gesture-toast" aria-hidden="true">Pinch to zoom · tap ⤢ for fullscreen</div>` +
        `<div class="rh-sheet-scrim" hidden></div>` +
        `<aside class="rh-drawer" hidden aria-label="Lean 4 proof inspector"></aside>` +
        `<div class="rh-hud-bot">` +
          JUMPS.map(j =>
            `<button type="button" data-jump="${esc(j.id)}" data-jtype="${j.type}" aria-pressed="${j.id === 'main-rh'}">${esc(j.label)}</button>`
          ).join('') +
        `</div>` +
      `</div>` +
      `<p class="rh-foot" aria-live="polite"></p>` +
      `<button type="button" class="rh-back-pill" hidden>↩ Back to article</button>`;
    fig.insertBefore(el, $('figcaption', fig));
    fig.classList.add('ready');

    const stageEl = $('.rh-stage', el);
    const canvas = $('.rh-canvas', el);
    const ctx = canvas.getContext('2d', { alpha: false });
    const sceneCanvas = document.createElement('canvas');
    const sceneCtx = sceneCanvas.getContext('2d', { alpha: false });
    let cachedPhotons = [];
    const footEl = $('.rh-foot', el);
    const searchEl = $('.rh-search', el);
    const searchPop = $('.rh-search-pop', el);
    const searchOpenBtn = $('[data-open-search]', el);
    const searchCloseBtn = $('[data-close-search]', el);
    const cascadeBtn = $('[data-cascade]', el);
    const hudBtns = $('.rh-hud-btns', el);
    const mobZoom = $('.rh-mob-zoom', el);
    const mobResetBtn = $('[data-hud="full"]', mobZoom);
    const zoomRead = $('.rh-zoom-read', el);
    const gestureToast = $('.rh-gesture-toast', el);
    const scrimEl = $('.rh-sheet-scrim', el);
    const drawerEl = $('.rh-drawer', el);
    const hudBot = $('.rh-hud-bot', el);
    const backPill = $('.rh-back-pill', el);

    const isMobileSheet = () => window.innerWidth <= 720;
    const isCoarsePtr = () => matchMedia('(pointer: coarse)').matches;
    let touchUnlocked = false, toastTimer = 0;

    function syncTouchAction() {
      const relZ = S.cam.k / Math.max(0.01, S.baseK);
      const offCenter = Math.hypot(S.cam.x, S.cam.y) > 28;
      const freePan = S.fullscreen || touchUnlocked || relZ > 1.12 || !isCoarsePtr();
      canvas.classList.toggle('scroll-safe', !freePan);
      if (mobResetBtn) mobResetBtn.hidden = !(relZ > 1.12 || offCenter);
    }

    function flashGestureToast(msg) {
      if (!gestureToast) return;
      if (msg) gestureToast.textContent = msg;
      gestureToast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => gestureToast.classList.remove('show'), 1800);
    }

    // ---- Cached Stage Geometry (zero getBoundingClientRect inside render!)
    let stageW = 800, stageH = 600, canvasDpr = 1;

    function computeHeight(w) {
      if (S.fullscreen) {
        const vvH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return Math.max(320, Math.round(stageEl.clientHeight || vvH - 64));
      }
      const vh = window.innerHeight || 800;
      if (w < 640) return clamp(Math.round(w * 1.18), 440, Math.round(vh * 0.68));
      return clamp(Math.round(w * 0.72), 480, Math.min(680, Math.round(vh * 0.76)));
    }

    function syncStageSize() {
      const nw = Math.max(300, Math.round(stageEl.clientWidth || stageEl.getBoundingClientRect().width || 800));
      const nh = computeHeight(nw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const changed = nw !== stageW || nh !== stageH || dpr !== canvasDpr;
      stageW = nw; stageH = nh; canvasDpr = dpr;
      if (canvas.width !== Math.round(nw * dpr) || canvas.height !== Math.round(nh * dpr)) {
        canvas.width = Math.round(nw * dpr);
        canvas.height = Math.round(nh * dpr);
        sceneCanvas.width = canvas.width;
        sceneCanvas.height = canvas.height;
        canvas.style.width = nw + 'px';
        canvas.style.height = nh + 'px';
        liveKey = '';
        sceneKey = '';
      }
      return changed;
    }
    syncStageSize();

    // ---- Camera math (responsive to side drawer on desktop AND fixed bottom sheet on mobile!)
    function drawerLayout(w, h) {
      if (!S.drawerOpen) return { rx: 0, ry: 0 };
      if (isMobileSheet()) return { rx: 0, ry: S.fullscreen && !S.sheetTall ? Math.round(h * 0.56) : 0 };
      return { rx: S.drawerWide ? Math.min(560, Math.round(w * 0.56)) + 20 : 356, ry: 0 };
    }

    function fitFullTarget(w, h) {
      const padX = w < 640 ? Math.round(clamp(w * 0.10, 32, 48)) : 112;
      const padT = w < 640 ? 50 : 44, padB = w < 640 ? 54 : 54;
      const span = WRLD.r * 2;
      const k = Math.min((w - 2 * padX) / span, (h - padT - padB) / span);
      return { x: 0, y: (padB - padT) / (2 * k), k };
    }

    function fitFullNow(animate = false) {
      const tgt = fitFullTarget(stageW, stageH);
      S.baseK = tgt.k;
      S.vel.x = 0; S.vel.y = 0;
      touchUnlocked = false;
      if (!animate || reducedMotion()) { S.cam = { ...tgt }; S.camTarget = null; }
      else S.camTarget = tgt;
      S.camInited = true;
      syncTouchAction();
    }

    function fitSelection(animate = true) {
      const w = stageW, h = stageH;
      const { rx, ry } = drawerLayout(w, h);
      const availW = Math.max(180, w - (rx ? rx + 24 : 50));
      const availH = Math.max(160, h - (ry ? ry + 56 : 92));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      let maxK = 7.0;

      if (S.selType === 'file' && S.selFile) {
        const fx = S.selFile.x, fy = S.selFile.y;
        const rad = clamp(dirs[S.selFile.di][11] * 0.62, 22, 58);
        x0 = fx - rad; x1 = fx + rad; y0 = fy - rad; y1 = fy + rad;
        maxK = 9.0;
      } else if (S.selType === 'thm' && S.selThm >= 0) {
        const t = thms[S.selThm];
        if (t.id === 'main-rh') {
          const k = Math.min(availW / 760, availH / 760);
          const tgt = { x: (rx * 0.5) / k, y: (ry * 0.5 + 8) / k, k };
          if (!animate || reducedMotion()) { S.cam = { ...tgt }; S.camTarget = null; } else S.camTarget = tgt;
          return;
        }
        add(t.x, t.y);
        for (let i = 0; i < NT; i++) if (mask.ancThm[i] || mask.descThm[i]) add(thms[i].x, thms[i].y);
        if (t.di >= 0) add(dirs[t.di][5], dirs[t.di][6]);
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        const d0 = dirs[S.selDir];
        add(d0[5], d0[6]);
        let litCount = 0;
        for (let i = 0; i < ND; i++) if (mask.litDir[i]) { add(dirs[i][5], dirs[i][6]); litCount++; }
        const padR = litCount === 1 ? clamp(d0[11] * 0.92, 30, 72) : Math.max(40, d0[11] * 1.95);
        x0 -= padR; x1 += padR; y0 -= padR; y1 += padR;
      }
      if (!isFinite(x0)) { fitFullNow(animate); return; }
      const spanX = Math.max(130, (x1 - x0) + (S.selType === 'file' ? 56 : 112));
      const spanY = Math.max(130, (y1 - y0) + (S.selType === 'file' ? 56 : 112));
      const k = clamp(Math.min(availW / spanX, availH / spanY), 0.30, maxK);
      const tgt = { x: (x0 + x1) / 2 + (rx * 0.5) / k, y: (y0 + y1) / 2 + (ry * 0.5 + 10) / k, k };
      S.vel.x = 0; S.vel.y = 0;
      if (!animate || reducedMotion()) { S.cam = { ...tgt }; S.camTarget = null; }
      else S.camTarget = tgt;
    }

    function smoothZoomBy(factor, sx = stageW / 2, sy = stageH / 2, instant = false) {
      const minK = fitFullTarget(stageW, stageH).k * 0.78;
      const base = S.camTarget || S.cam;
      const wx = base.x + (sx - stageW / 2) / base.k;
      const wy = base.y + (sy - stageH / 2) / base.k;
      const nk = clamp(base.k * factor, minK, 28);
      const nx = wx - (sx - stageW / 2) / nk;
      const ny = wy - (sy - stageH / 2) / nk;
      S.vel.x = 0; S.vel.y = 0;
      if (instant || reducedMotion()) {
        S.cam = { x: nx, y: ny, k: nk };
        S.camTarget = null;
      } else {
        S.camTarget = { x: nx, y: ny, k: nk };
      }
      requestDraw();
    }

    function preloadVisibleShards(wx0, wx1, wy0, wy1) {
      let queued = 0;
      for (let j = 0; j < nonEmptyDirs.length && queued < 3; j++) {
        const di = nonEmptyDirs[j], d = dirs[di];
        const sid = d[12];
        if (sid < 0 || shardLoaded[sid] || shardPromise[sid]) continue;
        const pad = d[11] + 24;
        if (d[5] + pad >= wx0 && d[5] - pad <= wx1 && d[6] + pad >= wy0 && d[6] - pad <= wy1) {
          ensureShard(sid);
          queued++;
        }
      }
    }

    // ---- Render Frosted Glass Full Lean 4 Proof Inspector Drawer
    const fmtTitle = s => esc(s).replace(/\.lean$/, '<wbr>.lean').replace(/([a-z])([A-Z])/g, '$1<wbr>$2');
    function drawerHeaderHtml(titleText) {
      return (
        `<div class="rh-sheet-grab" data-sheet-grab role="button" tabindex="0" aria-label="Drag to resize or close inspector"></div>` +
        `<div class="rh-drawer-head">` +
          `<div class="rh-drawer-title" title="${esc(titleText)}">${fmtTitle(titleText)}</div>` +
          `<div class="rh-drawer-acts">` +
            (S.history.length ? `<button type="button" class="rh-drawer-btn" data-drawer-back title="Back ([)">←</button>` : '') +
            `<button type="button" class="rh-drawer-btn" data-drawer-tall aria-pressed="${S.sheetTall}" aria-label="${S.sheetTall ? 'Half sheet' : 'Expand sheet'}">${S.sheetTall ? '↓' : '↑'}</button>` +
            `<button type="button" class="rh-drawer-btn" data-drawer-wide aria-pressed="${S.drawerWide}" title="${S.drawerWide ? 'Compact drawer (W)' : 'Expand proof reader (W)'}">${S.drawerWide ? '⇥' : '⇤'}</button>` +
            `<button type="button" class="rh-drawer-btn" data-close-drawer aria-label="Close inspector">×</button>` +
          `</div>` +
        `</div>`
      );
    }

    function proofCodeSectionHtml(relPath, fallbackExcerpt, targetLine, ghUrl) {
      const entry = relPath ? leanCache.get(relPath) : null;
      const hasFull = entry && entry.status === 'ok';
      const showFull = hasFull && S.codeTab === 'full';
      const isLoading = entry && entry.status === 'loading';
      const isErr = entry && entry.status === 'err';
      let barHtml = '';
      if (relPath) {
        barHtml =
          `<div class="rh-code-bar">` +
            `<div class="rh-code-tabs">` +
              `<button type="button" data-code-tab="full" aria-pressed="${S.codeTab === 'full'}">${hasFull ? `Full proof (${num(entry.lines.length)}L)` : isLoading ? 'Loading…' : 'Full proof'}</button>` +
              (fallbackExcerpt ? `<button type="button" data-code-tab="excerpt" aria-pressed="${S.codeTab === 'excerpt'}">Excerpt</button>` : '') +
            `</div>` +
            `<div class="rh-code-mini">` +
              (hasFull ? `<button type="button" data-copy-proof>Copy</button>` : '') +
              `<a href="${esc(ghUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` +
            `</div>` +
          `</div>`;
      }

      let declsHtml = '', importsHtml = '', bodyHtml = '';
      if (showFull) {
        const lines = entry.lines;
        const cap = 420;
        let s0 = 0, e0 = lines.length;
        if (!S.showAllLines && lines.length > cap) {
          if (targetLine > 120) { s0 = Math.max(0, targetLine - 50); e0 = Math.min(lines.length, s0 + cap); }
          else e0 = cap;
        }
        bodyHtml =
          `<div class="rh-proof-box" data-proof-box>` +
            renderNumberedLean(lines, s0, e0, targetLine) +
            (e0 - s0 < lines.length
              ? `<div class="rh-proof-status"><button type="button" class="rh-drawer-btn" data-show-all-lines>Show all ${num(lines.length)} lines (currently L${s0 + 1}–${e0})</button></div>`
              : '') +
          `</div>`;

        if (entry.decls.length > 1) {
          declsHtml =
            `<div class="rh-drawer-sec"><span>Declarations in file (${entry.decls.length})</span></div>` +
            `<div class="rh-drawer-links">` +
              entry.decls.slice(0, 20).map(dc =>
                `<button type="button" class="dec" data-goto-line="${dc.line}" title="${esc(dc.kind + ' ' + dc.name)} · L${dc.line}">${esc(dc.name.split('.').slice(-1)[0])} <span style="opacity:.6">L${dc.line}</span></button>`
              ).join('') +
            `</div>`;
        }
        if (entry.imports.length || entry.extImports.length) {
          importsHtml =
            `<div class="rh-drawer-sec"><span>Imports (${entry.imports.length} in-repo${entry.extImports.length ? ` · ${entry.extImports.length} ext` : ''})</span>` +
              (entry.imports.length ? `<button type="button" data-fit-imports>Trace on map</button>` : '') +
            `</div>` +
            `<div class="rh-drawer-links">` +
              entry.imports.slice(0, 24).map(m =>
                `<button type="button" class="up" data-jump-mod="${esc(m)}" title="Open ${esc(m)}.lean">${esc(m.split('.').slice(-1)[0])}</button>`
              ).join('') +
              entry.extImports.slice(0, 6).map(m => `<span class="rh-tag">${esc(m)}</span>`).join('') +
            `</div>`;
        }
      } else if (fallbackExcerpt) {
        const exLines = fallbackExcerpt.split('\n');
        bodyHtml =
          `<div class="rh-proof-box" data-proof-box>` +
            renderNumberedLean(exLines, 0, exLines.length, 0) +
            (isLoading ? `<div class="rh-proof-status">Fetching complete ${esc(relPath)}.lean…</div>` : '') +
            (isErr ? `<div class="rh-proof-status">Full source unavailable offline (${esc(entry.err)}). Showing cached declaration.</div>` : '') +
          `</div>`;
      } else if (isLoading) {
        bodyHtml = `<div class="rh-proof-box"><div class="rh-proof-status">Loading ${esc(relPath)}.lean…</div></div>`;
      } else if (isErr) {
        bodyHtml = `<div class="rh-proof-box"><div class="rh-proof-status">Could not fetch ${esc(relPath)}.lean (${esc(entry.err)}). <a class="rh-drawer-gh" href="${esc(ghUrl)}" target="_blank" rel="noopener">Open on GitHub ↗</a></div></div>`;
      }

      return { barHtml, bodyHtml, declsHtml, importsHtml };
    }

    function renderDirectoryFileList(di) {
      const listEl = $('[data-file-list]', drawerEl);
      if (!listEl) return;
      const fns = dirFiles[di];
      if (!fns) {
        listEl.innerHTML = `<div class="rh-proof-status">Loading ${num(dirs[di][4])} real .lean filenames…</div>`;
        return;
      }
      const q = S.dirFilter.trim().toLowerCase();
      const hits = [];
      for (let i = 0; i < fns.length; i++) {
        if (!q || fns[i].toLowerCase().includes(q)) {
          hits.push(i);
          if (hits.length >= S.dirLimit + 1) break;
        }
      }
      const hasMore = hits.length > S.dirLimit;
      const show = hasMore ? hits.slice(0, S.dirLimit) : hits;
      const countEl = $('[data-file-count]', drawerEl);
      if (countEl) {
        countEl.textContent = q ? `${hasMore ? S.dirLimit + '+' : hits.length} matching of ${num(fns.length)}` : `${num(fns.length)} .lean proofs`;
      }
      if (!show.length) {
        listEl.innerHTML = `<div class="rh-proof-status">No .lean files match “${esc(S.dirFilter)}”.</div>`;
        return;
      }
      listEl.innerHTML =
        show.map(off =>
          `<button type="button" data-open-star="${dirStarStart[di] + off}" data-open-di="${di}">` +
            `<span class="fl-name">${esc(fns[off])}.lean</span><span class="fl-go">Proof →</span>` +
          `</button>`
        ).join('') +
        (hasMore ? `<button type="button" class="rh-file-more" data-more-files>+ Show 120 more</button>` : '');
    }

    function renderDrawer() {
      const sheetMode = S.drawerOpen && isMobileSheet();
      drawerEl.hidden = !S.drawerOpen;
      drawerEl.classList.toggle('wide', S.drawerWide);
      drawerEl.classList.toggle('sheet-tall', S.sheetTall);
      if (scrimEl) scrimEl.hidden = !sheetMode;
      document.body.style.overflow = (S.fullscreen || sheetMode) ? 'hidden' : '';
      const codeBtn = $('[data-hud="code"]', hudBtns);
      if (codeBtn) codeBtn.setAttribute('aria-pressed', String(S.drawerOpen));
      if (!S.drawerOpen) return;

      if (S.selType === 'file' && S.selFile) {
        const f = S.selFile, d = dirs[f.di], tb = terrs[d[1]];
        const entry = leanCache.get(f.relPath);
        const hosted = thmsByMod.get(f.modName) || [];
        const fns = dirFiles[f.di];
        const totalSibs = fns ? fns.length : d[4];
        const pos = f.starIdx - dirStarStart[f.di];
        const hasSibs = totalSibs > 1 && pos >= 0 && pos < totalSibs;
        const prevStar = hasSibs ? dirStarStart[f.di] + ((pos - 1 + totalSibs) % totalSibs) : -1;
        const nextStar = hasSibs ? dirStarStart[f.di] + ((pos + 1) % totalSibs) : -1;
        if (hasSibs && fns) {
          const nextStem = fns[(pos + 1) % totalSibs];
          if (nextStem) loadLeanFile(f.dp ? `${f.dp}/${nextStem}` : nextStem); // zero-wait sibling prefetch!
        }
        const ghUrl = `${GH_BLOB}/${f.relPath}.lean${S.selLine ? `#L${S.selLine}` : ''}`;
        const sec = proofCodeSectionHtml(f.relPath, '', S.selLine, ghUrl);
        drawerEl.innerHTML =
          drawerHeaderHtml(`${f.stem}.lean`) +
          `<div class="rh-drawer-scroll">` +
            `<div class="rh-drawer-meta">` +
              `<span class="rh-tag amber">Lean 4 file</span>` +
              `<span class="rh-tag">${esc(tb.short)}</span>` +
              (entry && entry.status === 'ok'
                ? `<span class="rh-tag">${num(entry.lines.length)} lines</span>` +
                  `<span class="rh-tag good">${entry.decls.length} decls</span>` +
                  `<span class="rh-tag blue">${entry.imports.length}↑${entry.extImports.length ? ` · ${entry.extImports.length} ext` : ''}</span>`
                : '') +
            `</div>` +
            `<div class="rh-drawer-path">` +
              `<button type="button" data-jump-dir="${f.di}">← ${esc(d[8])} (${num(d[4])})</button>` +
              (hasSibs
                ? `<span class="rh-sib-nav">` +
                    `<button type="button" data-open-star="${prevStar}" data-open-di="${f.di}" title="Previous file in folder (,)">‹</button>` +
                    `<span class="rh-sib-pos">${pos + 1}/${num(totalSibs)}</span>` +
                    `<button type="button" data-open-star="${nextStar}" data-open-di="${f.di}" title="Next file in folder (.)">›</button>` +
                  `</span>`
                : '') +
              `<span>${fmtPath(f.dp || 'src/')}</span>` +
            `</div>` +
            (hosted.length
              ? `<div class="rh-drawer-sec"><span>Verified spine declarations (${hosted.length})</span></div>` +
                `<div class="rh-drawer-links">${hosted.map(ti => `<button type="button" class="dn" data-jump-thm="${ti}">${esc(thms[ti].d.split('.').slice(-1)[0])}</button>`).join('')}</div>`
              : '') +
            sec.barHtml + sec.bodyHtml + sec.declsHtml + sec.importsHtml +
          `</div>`;
      } else if (S.selType === 'thm' && S.selThm >= 0) {
        const idx = S.selThm, t = thms[idx];
        const up = thmDeps[idx];
        const dn = thmDependents[idx];
        const relPath = t.m ? t.m.replace(/\./g, '/') : '';
        const hostPath = t.di >= 0 ? dirPath(t.di) : '';
        const stratName = { arith: 'Arithmetic supply', est: 'The estimate', ana: 'Analytic engine', dest: 'Destination' }[t.s] || t.s;
        const ghUrl = t.u || (relPath ? `${GH_BLOB}/${relPath}.lean` : GH_TREE);
        const sec = proofCodeSectionHtml(relPath, t.code, S.selLine, ghUrl);
        drawerEl.innerHTML =
          drawerHeaderHtml(t.t) +
          `<div class="rh-drawer-scroll">` +
            `<div class="rh-drawer-meta">` +
              `<span class="rh-tag blue">${esc(stratName)}</span>` +
              `<span class="rh-tag">${esc(t.k)}</span>` +
              (t.tier ? `<span class="rh-tag good">${esc(t.tier)}</span>` : '') +
              `<span class="rh-tag">depth ${t.h}</span>` +
            `</div>` +
            `<p>${esc(t.g)}${t.i && t.i !== t.g ? ' ' + esc(t.i) : ''}</p>` +
            (relPath
              ? `<div class="rh-drawer-path">` +
                  `<button type="button" data-jump-mod="${esc(t.m)}" title="Fly to star in outer cosmos">✦ ${esc(t.m.split('.').slice(-1)[0])}.lean</button>` +
                  (t.di >= 0 ? `<button type="button" data-jump-dir="${t.di}">${esc(dirs[t.di][8])}</button>` : '') +
                `</div>`
              : '') +
            sec.barHtml + sec.bodyHtml +
            (up.length ? `<div class="rh-drawer-sec"><span>Direct prerequisites (${up.length} · ${t.anc} total)</span></div>` +
              `<div class="rh-drawer-links">${up.map(u => `<button type="button" class="up" data-jump-thm="${u}" title="${esc(thms[u].t)}">${esc(thms[u].d.split('.').slice(-1)[0])}</button>`).join('')}</div>` : '') +
            (dn.length ? `<div class="rh-drawer-sec"><span>Used by (${dn.length} · ${t.desc} downstream)</span></div>` +
              `<div class="rh-drawer-links">${dn.map(v => `<button type="button" class="dn" data-jump-thm="${v}" title="${esc(thms[v].t)}">${esc(thms[v].d.split('.').slice(-1)[0])}</button>`).join('')}</div>` : '') +
            sec.declsHtml + sec.importsHtml +
            (!relPath && hostPath ? `<div class="rh-drawer-sec"><span>Hosted in module</span></div><div class="rh-drawer-links"><button type="button" class="dn" data-jump-dir="${t.di}">${esc(hostPath)}</button></div>` : '') +
          `</div>`;
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        const di = S.selDir, d = dirs[di], pth = dirPath(di), tb = terrs[d[1]];
        const children = dirChildren[di];
        const subCount = mask.litDir.reduce((acc, v) => acc + (v ? 1 : 0), 0) - 1;
        const pct = ((d[3] / NS) * 100).toFixed(d[3] >= 1000 ? 1 : 3);
        const hosted = [];
        for (let i = 0; i < ND; i++) if (mask.litDir[i]) for (const ti of dirToThms[i]) hosted.push(ti);
        const url = pth ? `${GH_TREE}/${pth}` : GH_TREE;
        drawerEl.innerHTML =
          drawerHeaderHtml(d[8]) +
          `<div class="rh-drawer-scroll">` +
            `<div class="rh-drawer-meta">` +
              `<span class="rh-tag amber">${num(d[3])} .lean files</span>` +
              `<span class="rh-tag">${pct}% of proof</span>` +
              `<span class="rh-tag">${esc(tb.short)}</span>` +
            `</div>` +
            `<p><code>${fmtPath(pth || 'src/')}</code> holds <strong>${num(d[4])}</strong> direct Lean files` +
              (subCount > 0 ? ` across <strong>${num(subCount)}</strong> subdirectories.` : '.') + `</p>` +
            (children.length
              ? `<div class="rh-drawer-sec"><span>Subdirectories (${children.length})</span></div>` +
                `<div class="rh-drawer-links">${children.slice(0, 14).map(ci => `<button type="button" class="up" data-jump-dir="${ci}">${esc(dirs[ci][8])} (${dirs[ci][3] >= 1000 ? (dirs[ci][3] / 1000).toFixed(1) + 'k' : dirs[ci][3]})</button>`).join('')}</div>`
              : '') +
            (hosted.length
              ? `<div class="rh-drawer-sec"><span>Verified spine declarations (${hosted.length})</span></div>` +
                `<div class="rh-drawer-links">${hosted.slice(0, 14).map(ti => `<button type="button" class="dn" data-jump-thm="${ti}">${esc(thms[ti].d.split('.').slice(-1)[0])}</button>`).join('')}</div>`
              : '') +
            (d[4] > 0
              ? `<div class="rh-drawer-sec"><span data-file-count>${num(d[4])} .lean proofs</span></div>` +
                (d[4] > 12 ? `<input type="search" class="rh-dir-filter" data-dir-filter value="${esc(S.dirFilter)}" placeholder="Filter ${num(d[4])} .lean proofs…">` : '') +
                `<div class="rh-file-list" data-file-list></div>`
              : '') +
            `<a class="rh-drawer-gh" href="${esc(url)}" target="_blank" rel="noopener">Browse directory on GitHub ↗</a>` +
          `</div>`;
        if (d[4] > 0) renderDirectoryFileList(di);
      }

      if (S.selLine > 0) {
        const box = $('[data-proof-box]', drawerEl);
        const target = box ? $(`[data-ln="${S.selLine}"]`, box) : null;
        if (box && target) box.scrollTop = Math.max(0, target.offsetTop - 22);
      }
    }

    // --------------------------------------------------------- master render
    // Two-layer architecture: static scene cached into sceneCanvas (batched draw calls + CSR spatial grid +
    // zero-alloc label boxes), while dynamic photons, pulsing reticles & 3-line point cards draw on top in < 0.2ms!
    let view = { w: 800, h: 600, k: 0.4, ox: 400, oy: 300 };
    let lastZoomTxt = '';

    function renderStaticScene(sc, w, H, k, ox, oy, T, relZoom, cas, casActive, waveR, waveH, hasThmSel, hasDirSel, hasFileSel) {
      sc.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
      const toSX = x => x * k + ox;
      const toSY = y => y * k + oy;

      const wx0 = (0 - ox) / k - 20, wx1 = (w - ox) / k + 20;
      const wy0 = (0 - oy) / k - 20, wy1 = (H - oy) / k + 20;
      if (k >= 1.25) preloadVisibleShards(wx0, wx1, wy0, wy1);

      // ---- 0. Deep radial cosmos backdrop
      sc.fillStyle = T.bg;
      sc.fillRect(0, 0, w, H);
      const cx0 = ox, cy0 = oy;
      const bgGlow = sc.createRadialGradient(cx0, cy0, 8 * k, cx0, cy0, 760 * k);
      bgGlow.addColorStop(0, alpha(T.blue, T.dark ? 0.11 : 0.05));
      bgGlow.addColorStop(0.45, alpha(T.blue, T.dark ? 0.03 : 0.014));
      bgGlow.addColorStop(1, alpha(T.blue, 0));
      sc.fillStyle = bgGlow;
      sc.fillRect(0, 0, w, H);

      const { ancThm, descThm, litDir, hostDir } = mask;

      let placedN = 0;
      function tryPlace(x0, y0, x1, y1) {
        if (placedN >= 256 || x1 < 4 || x0 > w - 4 || y1 < 34 || y0 > H - 40) return false;
        for (let i = 0; i < placedN; i++) {
          const o = i << 2;
          if (x0 < placedBuf[o + 2] + 3 && x1 > placedBuf[o] - 3 && y0 < placedBuf[o + 3] + 2 && y1 > placedBuf[o + 1] - 2) return false;
        }
        const o = placedN << 2;
        placedBuf[o] = x0; placedBuf[o + 1] = y0; placedBuf[o + 2] = x1; placedBuf[o + 3] = y1;
        placedN++;
        return true;
      }

      // ---- 1. Swiss Astronomical Astrolabe Rings, 72 Degree Ticks & 12 Sector Arcs
      const rings = [
        [38, 0.24, null],
        [128, 0.10, [2, 4]],
        [236, 0.08, [2, 5]],
        [WRLD.rCore, 0.24, [3, 4]],
        [WRLD.rIn - 6, 0.16, null],
        [WRLD.rOut + 14, 0.22, null],
      ];
      sc.lineWidth = 0.85;
      for (let ri = 0; ri < rings.length; ri++) {
        const [rr, op, dash] = rings[ri];
        const rk = rr * k;
        if (cx0 + rk < -10 || cx0 - rk > w + 10 || cy0 + rk < -10 || cy0 - rk > H + 10) continue;
        sc.save();
        if (dash) sc.setLineDash(dash);
        sc.strokeStyle = alpha(T.fg3, T.dark ? op : op * 0.9);
        sc.beginPath(); sc.arc(cx0, cy0, rk, 0, Math.PI * 2); sc.stroke();
        sc.restore();
      }

      if (k < 2.2) {
        sc.beginPath();
        const tickR0 = (WRLD.rOut + 14) * k;
        const tickScale = clamp(k / 0.4, 0.7, 1.4);
        for (let deg = 0; deg < 360; deg += 5) {
          const a = (deg * Math.PI) / 180;
          const ca = Math.cos(a), sa = Math.sin(a);
          const len = (deg % 30 === 0 ? 7 : 3.5) * tickScale;
          sc.moveTo(cx0 + tickR0 * ca, cy0 + tickR0 * sa);
          sc.lineTo(cx0 + (tickR0 + len) * ca, cy0 + (tickR0 + len) * sa);
        }
        sc.strokeStyle = alpha(T.fg3, T.dark ? 0.24 : 0.22);
        sc.lineWidth = 0.75;
        sc.stroke();
      }

      if (k > 0.34 && k < 3.2) {
        sc.font = `600 8px ${T.mono}`;
        sc.textAlign = 'center';
        const moatR = (WRLD.rCore + 12) * k;
        const whispers = [
          [0, -1, 'ARITHMETIC SUPPLY', T.amber],
          [0.7431, 0.6691, 'THE ESTIMATE · √x', T.blue],
          [-0.7431, 0.6691, 'ANALYTIC ENGINE', T.good],
        ];
        for (let i = 0; i < 3; i++) {
          const [ca, sa, txt, col] = whispers[i];
          const lx = cx0 + moatR * ca, ly = cy0 + moatR * sa;
          if (lx > 20 && lx < w - 20 && ly > 36 && ly < H - 44) {
            sc.fillStyle = alpha(col, T.dark ? 0.56 : 0.62);
            sc.fillText(txt, lx, ly + 3);
          }
        }
      }

      const rInK = (WRLD.rIn - 6) * k, rOutK = (WRLD.rOut + 14) * k, rArcK = (WRLD.rOut + 18) * k;
      for (let ti = 0; ti < terrs.length; ti++) {
        const tb = terrs[ti], tm = terrMid[ti], col = terrCols[ti];
        const isSelTerr = (hasDirSel && dirs[S.selDir][1] === ti) || (hasFileSel && dirs[S.selFile.di][1] === ti);
        const isHovTerr = S.hovTerr === ti;
        sc.beginPath();
        sc.arc(cx0, cy0, rOutK, tb.a0, tb.a1);
        sc.arc(cx0, cy0, rInK, tb.a1, tb.a0, true);
        sc.closePath();
        sc.fillStyle = alpha(col, isSelTerr || isHovTerr ? (T.dark ? 0.095 : 0.068) : (T.dark ? 0.026 : 0.020));
        sc.fill();

        sc.beginPath();
        sc.arc(cx0, cy0, rArcK, tb.a0, tb.a1);
        sc.strokeStyle = alpha(col, isSelTerr || isHovTerr ? 1.0 : (hasDirSel ? 0.26 : 0.76));
        sc.lineWidth = isSelTerr || isHovTerr ? 3.5 : 2.2;
        sc.stroke();

        sc.beginPath();
        sc.moveTo(cx0 + rInK * tm.ca0, cy0 + rInK * tm.sa0);
        sc.lineTo(cx0 + rOutK * tm.ca0, cy0 + rOutK * tm.sa0);
        sc.strokeStyle = alpha(T.line2, T.dark ? 0.42 : 0.52);
        sc.lineWidth = 0.75;
        sc.stroke();
      }

      // ---- 2. TWO-LAYER ASTROPHOTOGRAPHY: Nebula Bloom + ALL 175,187 REAL .LEAN FILE STARS!
      const bx = toSX(-BAKE_R), by = toSY(-BAKE_R), bw = 2 * BAKE_R * k;
      const starDim = hasDirSel ? 0.22 : hasFileSel ? 0.52 : (casActive && cas < 0.45 ? 0.78 : 1.0);

      sc.save();
      sc.globalAlpha = hasDirSel ? 0.25 : hasFileSel ? 0.45 : 1.0;
      sc.drawImage(nebCanvas, bx, by, bw, bw);
      sc.restore();

      if (k < 2.15) {
        sc.save();
        sc.globalAlpha = starDim;
        sc.drawImage(starCanvas, bx, by, bw, bw);
        sc.restore();
        if (hasDirSel) sc.drawImage(selStarCanvas, bx, by, bw, bw);
      } else {
        // Direct Uint32Array cached viewport star layer via CSR spatial grid (~0.4ms render!)
        renderLiveStarsCached(w, H, k, ox, oy, hasDirSel, litDir, T);
        sc.drawImage(liveCanvas, 0, 0, w, H);
      }

      // ---- 3. Polar Phylogenetic Directory Branches + Directory Hubs
      const treeDim = hasDirSel || hasFileSel ? 0.16 : 0.56;
      const treeLW = clamp(0.62 * Math.sqrt(k / 0.4), 0.42, 1.3);
      for (let ti = 0; ti < terrs.length; ti++) {
        const col = terrCols[ti], list = dirsByTerr[ti];
        const boosted = S.hovTerr === ti ? 1.55 : 1.0;
        sc.beginPath();
        for (let j = 0; j < list.length; j++) {
          const i = list[j], d = dirs[i], pi = d[0];
          if (pi < 0) continue;
          const p = dirs[pi];
          const x0 = p[5] * k + ox, y0 = p[6] * k + oy, x1 = d[5] * k + ox, y1 = d[6] * k + oy;
          if ((x0 < -20 && x1 < -20) || (x0 > w + 20 && x1 > w + 20) || (y0 < -20 && y1 < -20) || (y0 > H + 20 && y1 > H + 20)) continue;
          sc.moveTo(x0, y0); sc.lineTo(x1, y1);
        }
        sc.strokeStyle = alpha(col, Math.min(0.65, (T.dark ? 0.25 : 0.19) * treeDim * boosted));
        sc.lineWidth = treeLW;
        sc.stroke();

        if (k > 0.58) {
          sc.beginPath();
          const hr = clamp(1.3 * Math.pow(k / 0.8, 0.3), 1.0, 2.8);
          for (let j = 0; j < list.length; j++) {
            const i = list[j], d = dirs[i];
            if (litDir[i] || hostDir[i]) continue;
            const sx = d[5] * k + ox, sy = d[6] * k + oy;
            if (sx < -6 || sx > w + 6 || sy < -6 || sy > H + 6) continue;
            sc.moveTo(sx + hr, sy); sc.arc(sx, sy, hr, 0, Math.PI * 2);
          }
          sc.fillStyle = alpha(col, (T.dark ? 0.55 : 0.44) * treeDim);
          sc.fill();
        }
      }

      if (hasDirSel) {
        const selCol = terrCols[dirs[S.selDir][1]];
        sc.beginPath();
        for (let i = 0; i < ND; i++) {
          if (!litDir[i]) continue;
          const d = dirs[i], pi = d[0];
          if (pi >= 0 && litDir[pi]) { sc.moveTo(dirs[pi][5] * k + ox, dirs[pi][6] * k + oy); sc.lineTo(d[5] * k + ox, d[6] * k + oy); }
        }
        sc.strokeStyle = alpha(selCol, 0.88); sc.lineWidth = 1.35; sc.stroke();
        const sd = dirs[S.selDir], sx = sd[5] * k + ox, sy = sd[6] * k + oy;
        const g = sc.createRadialGradient(sx, sy, 2, sx, sy, 24);
        g.addColorStop(0, alpha(selCol, 0.58)); g.addColorStop(1, alpha(selCol, 0));
        sc.fillStyle = g; sc.beginPath(); sc.arc(sx, sy, 24, 0, Math.PI * 2); sc.fill();
        sc.beginPath(); sc.arc(sx, sy, 5.5, 0, Math.PI * 2); sc.fillStyle = selCol; sc.fill();
        sc.strokeStyle = T.bg; sc.lineWidth = 1.8; sc.stroke();
      }

      // ---- 4. Luminous Host Bridge Fibers
      const casBridgeGlow = casActive ? Math.max(0, 1 - Math.abs(cas - 0.39) * 5.2) : 0;
      sc.beginPath();
      for (let i = 0; i < NT; i++) {
        const t = thms[i];
        if (t.di < 0) continue;
        const onCone = (hasThmSel && (i === S.selThm || ancThm[i] || descThm[i])) || ((hasDirSel || hasFileSel) && descThm[i]);
        if (onCone && !casActive) continue;
        const d = dirs[t.di];
        const ax = d[5] * k + ox, ay = d[6] * k + oy, bx0 = t.x * k + ox, by0 = t.y * k + oy;
        const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.25;
        const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.25;
        sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, bx0, by0);
      }
      sc.strokeStyle = casBridgeGlow > 0.05
        ? alpha(T.amber, 0.10 + casBridgeGlow * 0.55)
        : alpha(T.fg3, T.dark ? 0.085 : 0.068);
      sc.lineWidth = 0.65 + casBridgeGlow * 1.1;
      sc.stroke();

      if (!casActive) {
        for (let i = 0; i < NT; i++) {
          const t = thms[i];
          if (t.di < 0) continue;
          const isPrimary = hasThmSel && i === S.selThm;
          const isAnc = hasThmSel && ancThm[i];
          const isDesc = (hasThmSel || hasDirSel || hasFileSel) && descThm[i];
          if (!isPrimary && !isAnc && !isDesc) continue;
          const d = dirs[t.di];
          const ax = d[5] * k + ox, ay = d[6] * k + oy, bx0 = t.x * k + ox, by0 = t.y * k + oy;
          const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.25;
          const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.25;
          const col = isPrimary ? T.blue : isAnc ? T.amber : T.blue;
          sc.save();
          if (!isPrimary) sc.setLineDash([2.5, 3]);
          sc.beginPath(); sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, bx0, by0);
          sc.strokeStyle = alpha(col, isPrimary ? 0.78 : 0.28);
          sc.lineWidth = isPrimary ? 1.7 : 0.9;
          sc.stroke(); sc.restore();
          sc.beginPath(); sc.arc(ax, ay, isPrimary ? 5.2 : 3.2, 0, Math.PI * 2);
          sc.fillStyle = col; sc.fill(); sc.strokeStyle = T.bg; sc.lineWidth = 1.2; sc.stroke();
        }
      }

      // ---- 4B. LIVE CROSS-COSMOS FILE IMPORT ARCS (batched!)
      const photons = [];
      if (!casActive && S.fileImports.length) {
        let srcX = 0, srcY = 0, hasSrc = false;
        if (hasFileSel) { srcX = toSX(S.selFile.x); srcY = toSY(S.selFile.y); hasSrc = true; }
        else if (hasThmSel && S.drawerOpen) { srcX = toSX(thms[S.selThm].x); srcY = toSY(thms[S.selThm].y); hasSrc = true; }
        if (hasSrc) {
          sc.beginPath();
          for (let i = 0; i < S.fileImports.length; i++) {
            const imp = S.fileImports[i];
            const ax = imp.x * k + ox, ay = imp.y * k + oy;
            const mx = (ax + srcX) * 0.5 + (cx0 - (ax + srcX) * 0.5) * 0.22;
            const my = (ay + srcY) * 0.5 + (cy0 - (ay + srcY) * 0.5) * 0.22;
            sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, srcX, srcY);
            photons.push([ax, ay, mx, my, srcX, srcY, 0]);
          }
          sc.strokeStyle = alpha(T.amber, T.dark ? 0.22 : 0.16); sc.lineWidth = 4.2; sc.stroke();
          sc.strokeStyle = alpha(T.amber, 0.88); sc.lineWidth = 1.35; sc.stroke();

          sc.beginPath();
          for (let i = 0; i < S.fileImports.length; i++) {
            const imp = S.fileImports[i], ax = imp.x * k + ox, ay = imp.y * k + oy;
            sc.moveTo(ax + 4.2, ay); sc.arc(ax, ay, 4.2, 0, Math.PI * 2);
          }
          sc.fillStyle = T.amber; sc.fill();
          sc.strokeStyle = T.bg; sc.lineWidth = 1.3; sc.stroke();
        }
      }

      // ---- 5. All 113 Verified Call Arcs (BATCHED into ~5 GPU stroke calls!)
      if (casActive) {
        for (let ei = 0; ei < edges.length; ei++) {
          const [u, v] = edges[ei], a = thms[u], b = thms[v];
          const ax = a.x * k + ox, ay = a.y * k + oy, bx0 = b.x * k + ox, by0 = b.y * k + oy;
          if ((ax < -40 && bx0 < -40) || (ax > w + 40 && bx0 > w + 40) || (ay < -40 && by0 < -40) || (ay > H + 40 && by0 > H + 40)) continue;
          const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.26;
          const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.26;
          const lit = a.h >= waveH - 0.5;
          const fresh = Math.max(0, 1 - Math.abs(a.h - waveH) * 0.55);
          if (lit) {
            const col = fresh > 0.3 ? T.blue : T.amber;
            sc.beginPath(); sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, bx0, by0);
            sc.strokeStyle = alpha(col, 0.14 + fresh * 0.28); sc.lineWidth = 4.2 + fresh * 2; sc.stroke();
            sc.strokeStyle = alpha(col, 0.75 + fresh * 0.25); sc.lineWidth = 1.5 + fresh * 0.7; sc.stroke();
            if (fresh > 0.15) photons.push([ax, ay, mx, my, bx0, by0, fresh > 0.3 ? 1 : 0]);
          } else {
            sc.beginPath(); sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, bx0, by0);
            sc.strokeStyle = alpha(T.fg3, 0.12); sc.lineWidth = 0.75; sc.stroke();
          }
        }
      } else {
        const upArcs = [], dnArcs = [];
        sc.beginPath();
        for (let ei = 0; ei < edges.length; ei++) {
          const [u, v] = edges[ei], a = thms[u], b = thms[v];
          const ax = a.x * k + ox, ay = a.y * k + oy, bx0 = b.x * k + ox, by0 = b.y * k + oy;
          if ((ax < -40 && bx0 < -40) || (ax > w + 40 && bx0 > w + 40) || (ay < -40 && by0 < -40) || (ay > H + 40 && by0 > H + 40)) continue;
          const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.26;
          const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.26;
          const isUp = hasThmSel && ((v === S.selThm && ancThm[u]) || (ancThm[v] && ancThm[u]));
          const isDn = (hasThmSel && ((u === S.selThm && descThm[v]) || (descThm[u] && descThm[v]))) ||
                       ((hasDirSel || hasFileSel) && descThm[u] && descThm[v]);
          if (isUp) {
            upArcs.push(ax, ay, mx, my, bx0, by0);
            photons.push([ax, ay, mx, my, bx0, by0, 0]);
          } else if (isDn) {
            dnArcs.push(ax, ay, mx, my, bx0, by0);
            photons.push([ax, ay, mx, my, bx0, by0, 1]);
          } else {
            sc.moveTo(ax, ay); sc.quadraticCurveTo(mx, my, bx0, by0);
          }
        }
        sc.strokeStyle = alpha(T.fg3, T.dark ? 0.22 : 0.17); sc.lineWidth = 0.85; sc.stroke();

        const strokeBatch = (arr, col, glowA, coreA, glowW, coreW) => {
          if (!arr.length) return;
          sc.beginPath();
          for (let i = 0; i < arr.length; i += 6) {
            sc.moveTo(arr[i], arr[i + 1]); sc.quadraticCurveTo(arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5]);
          }
          if (glowW > 0) { sc.strokeStyle = alpha(col, glowA); sc.lineWidth = glowW; sc.stroke(); }
          sc.strokeStyle = alpha(col, coreA); sc.lineWidth = coreW; sc.stroke();
        };
        strokeBatch(upArcs, T.amber, T.dark ? 0.18 : 0.14, 0.90, 4.6, 1.6);
        strokeBatch(dnArcs, T.blue, T.dark ? 0.18 : 0.14, 0.90, 4.6, 1.6);
      }

      cachedPhotons = photons;
      S.lastPhotons = photons.length;

      // ---- 6. All 109 Verified Lean Declarations + Blazing Main.lean Core Singularity
      const thmScale = clamp(Math.pow(k / 0.40, 0.30), 0.84, 1.75);
      for (let i = 0; i < NT; i++) {
        const t = thms[i];
        const sx = t.x * k + ox, sy = t.y * k + oy;
        if (sx < -24 || sx > w + 24 || sy < -24 || sy > H + 24) continue;
        const isMain = t.id === 'main-rh', isExp = t.k === 'export';
        const isSel = !casActive && hasThmSel && i === S.selThm;
        const isAnc = !casActive && hasThmSel && ancThm[i];
        const isDesc = !casActive && (hasThmSel || hasDirSel || hasFileSel) && descThm[i];
        const casLit = casActive && t.h >= waveH - 0.5;
        const casPeak = casActive ? Math.max(0, 1 - Math.abs(t.h - waveH) * 0.65) : 0;
        const onCone = isSel || isAnc || isDesc || casLit;
        const col = isMain || isExp ? T.blue : casPeak > 0.35 ? T.blue : isSel ? T.blue : (isAnc || casLit) ? T.amber : isDesc ? T.blue : stratColMap[t.s] || T.fg2;
        const r = (isMain ? 8.5 : isExp ? 5.2 : isSel ? 6.4 : casPeak > 0.35 ? 5.8 : onCone ? 4.4 : 3.4) * thmScale;

        if (isMain) {
          const boost = casActive && cas > 0.88 ? 1 + (cas - 0.88) * 10 : 1;
          const corona = sc.createRadialGradient(sx, sy, 2, sx, sy, r * 4.8 * Math.min(1.8, boost));
          corona.addColorStop(0, alpha(T.blue, T.dark ? 0.70 : 0.45));
          corona.addColorStop(0.4, alpha(T.blue, T.dark ? 0.24 : 0.14));
          corona.addColorStop(1, alpha(T.blue, 0));
          sc.fillStyle = corona; sc.beginPath(); sc.arc(sx, sy, r * 4.8 * Math.min(1.8, boost), 0, Math.PI * 2); sc.fill();
        } else if (isSel || isExp || casPeak > 0.35) {
          sc.fillStyle = alpha(col, 0.22);
          sc.beginPath(); sc.arc(sx, sy, r * 2.4, 0, Math.PI * 2); sc.fill();
        }

        sc.beginPath(); sc.arc(sx, sy, r, 0, Math.PI * 2);
        sc.fillStyle = isMain ? (T.dark ? '#ffffff' : T.blue) : (isSel || isExp || onCone ? col : T.bg);
        sc.fill();
        sc.lineWidth = isMain ? 2.5 : isSel ? 2.0 : onCone ? 1.3 : 1.1;
        sc.strokeStyle = isMain ? T.blue : (isSel || isExp || onCone ? T.bg : alpha(col, hasThmSel || hasDirSel || hasFileSel ? 0.40 : 0.84));
        sc.stroke();
      }

      // ---- 6B. Cinematic Cascade Wavefront Ring & Dual Q.E.D. Shockwave
      if (casActive) {
        if (cas < 0.90 && waveR > 10) {
          const wr = waveR * k;
          const r0 = Math.max(0, wr - 22), r1 = wr + 22;
          const peak = clamp((wr - r0) / Math.max(1, r1 - r0), 0.05, 0.95);
          const waveCol = cas < 0.42 ? T.amber : T.blue;
          const wg = sc.createRadialGradient(cx0, cy0, r0, cx0, cy0, r1);
          wg.addColorStop(0, alpha(waveCol, 0));
          wg.addColorStop(peak, alpha(waveCol, T.dark ? 0.48 : 0.36));
          wg.addColorStop(1, alpha(waveCol, 0));
          sc.strokeStyle = wg; sc.lineWidth = 26;
          sc.beginPath(); sc.arc(cx0, cy0, wr, 0, Math.PI * 2); sc.stroke();
          sc.strokeStyle = alpha(T.dark ? '#ffffff' : waveCol, 0.88);
          sc.lineWidth = 1.6;
          sc.beginPath(); sc.arc(cx0, cy0, wr, 0, Math.PI * 2); sc.stroke();
        }
        if (cas >= 0.86) {
          const p = clamp((cas - 0.86) / 0.14, 0, 1);
          const shockR = (14 + p * 360) * k;
          const echoR = (10 + Math.max(0, p - 0.18) * 260) * k;
          sc.strokeStyle = alpha(T.blue, (1 - p) * 0.92);
          sc.lineWidth = 3.2 * (1 - p) + 0.9;
          sc.beginPath(); sc.arc(cx0, cy0, shockR, 0, Math.PI * 2); sc.stroke();
          if (p > 0.18) {
            sc.strokeStyle = alpha(T.amber, (1 - p) * 0.65);
            sc.lineWidth = 1.6 * (1 - p) + 0.5;
            sc.beginPath(); sc.arc(cx0, cy0, echoR, 0, Math.PI * 2); sc.stroke();
          }
          haloText(sc, 'Q.E.D. · 4 kernels · 3 axioms', cx0, cy0 + 28 * thmScale, T.blue, T.bg, 'center', `700 11px ${T.mono}`);
        }
      }

      // ---- 7. Crisp Collision-Free Labels (zero-allocation placedBuf + deep-zoom .lean star labels!)
      if (hasFileSel) {
        const sx = toSX(S.selFile.x), sy = toSY(S.selFile.y);
        const lbl = `${S.selFile.stem}.lean`, fnt = `700 10.5px ${T.mono}`;
        const tw = measureW(fnt, lbl);
        tryPlace(sx - tw / 2, sy - 24, sx + tw / 2, sy - 10);
        tryPlace(sx - 18, sy - 7, sx + 18, sy + 18); // reserve pulsing reticle space below label
        haloText(sc, lbl, sx, sy - 14, T.fg, T.bg, 'center', fnt);
        const impFnt = `600 8.8px ${T.mono}`;
        for (let i = 0; i < S.fileImports.length && i < 8; i++) {
          const imp = S.fileImports[i], ix = toSX(imp.x), iy = toSY(imp.y);
          const itw = measureW(impFnt, imp.stem);
          if (tryPlace(ix - itw / 2, iy + 6, ix + itw / 2, iy + 17)) {
            haloText(sc, imp.stem, ix, iy + 15, T.amber, T.bg, 'center', impFnt);
          }
        }
      } else if (hasThmSel) {
        const t = thms[S.selThm], sx = toSX(t.x), sy = toSY(t.y);
        const lbl = t.id === 'main-rh' ? 'Main.lean · 12 lines' : (LANDMARK_THMS.get(t.id) || t.d.split('.').slice(-1)[0]);
        const fnt = `700 11px ${T.sans}`, tw = measureW(fnt, lbl);
        const ly = t.id === 'main-rh' ? sy - 16 : sy - 11;
        tryPlace(sx - tw / 2, ly - 11, sx + tw / 2, ly + 2);
        haloText(sc, lbl, sx, ly, T.fg, T.bg, 'center', fnt);
      } else if (hasDirSel) {
        const d = dirs[S.selDir], sx = toSX(d[5]), sy = toSY(d[6]);
        const lbl = `${d[8]} (${num(d[3])})`, fnt = `700 11px ${T.sans}`, tw = measureW(fnt, lbl);
        tryPlace(sx - tw / 2, sy - 20, sx + tw / 2, sy - 7);
        haloText(sc, lbl, sx, sy - 10, T.fg, T.bg, 'center', fnt);
      }

      // Outer 12 Territory Labels (edge-clamped & compact on narrow phones!)
      const narrowMob = w < 520;
      const compactRim = w < 640;
      const rimR = (WRLD.rOut + (narrowMob ? 15 : 28)) * k;
      const tFontPx = clamp((narrowMob ? 8.6 : compactRim ? 8.8 : 9.6) * Math.pow(k / 0.40, 0.2), 8.2, 12.2);
      const tFnt = `700 ${tFontPx.toFixed(1)}px ${T.sans}`;
      for (let ti = 0; ti < terrs.length; ti++) {
        const tm = terrMid[ti], col = terrCols[ti];
        const rx = cx0 + rimR * tm.ca, ly = cy0 + rimR * tm.sa;
        const fullLbl = (narrowMob && relZoom < 1.35) ? tm.miniLbl : compactRim ? tm.shortLbl : tm.fullLbl;
        const tw = measureW(tFnt, fullLbl);
        const rawX0 = tm.rightSide ? rx : rx - tw;
        const bx0 = narrowMob ? clamp(rawX0, 6, Math.max(6, w - 6 - tw)) : rawX0;
        if (tryPlace(bx0, ly - tFontPx, bx0 + tw, ly + 3)) {
          haloText(sc, fullLbl, narrowMob ? bx0 : rx, ly + 3, alpha(col, T.dark ? 0.96 : 0.92), T.bg, narrowMob ? 'left' : (tm.rightSide ? 'left' : 'right'), tFnt);
        }
      }

      // Top Mega-Clusters
      const mFnt = `600 ${narrowMob ? 8.4 : 9}px ${T.mono}`;
      const maxMega = narrowMob && relZoom < 1.25 ? 3 : (k < 0.52 ? 6 : megaLabels.length);
      for (let m = 0; m < megaLabels.length && m < maxMega; m++) {
        const ml = megaLabels[m];
        const sx = ml.x * k + ox, sy = ml.y * k + oy;
        const lbl = `${ml.label} ${(ml.files / 1000).toFixed(1)}k`;
        const tw = measureW(mFnt, lbl);
        const inwardRight = sx < cx0;
        const lx = inwardRight ? sx + 11 : sx - 11;
        const bx0 = inwardRight ? lx : lx - tw;
        if (tryPlace(bx0, sy - 6, bx0 + tw, sy + 6)) {
          haloText(sc, lbl, lx, sy + 3, alpha(T.fg, T.dark ? 0.90 : 0.84), T.bg, inwardRight ? 'left' : 'right', mFnt);
        }
      }

      // Landmark theorems
      for (const [id, lbl] of LANDMARK_THMS) {
        const idx = thmById.get(id);
        if (idx === undefined || (hasThmSel && idx === S.selThm)) continue;
        const t = thms[idx], sx = t.x * k + ox, sy = t.y * k + oy;
        const onCone = (hasThmSel && (ancThm[idx] || descThm[idx])) || ((hasDirSel || hasFileSel) && descThm[idx]);
        const fnt = `${id === 'main-rh' || onCone ? '600' : '500'} ${id === 'main-rh' ? 10.5 : 9.2}px ${T.sans}`;
        const tw = measureW(fnt, lbl);
        const ly = sy + 14;
        if (tryPlace(sx - tw / 2, ly - 10, sx + tw / 2, ly + 2)) {
          haloText(sc, lbl, sx, ly, id === 'main-rh' ? T.blue : onCone ? T.fg2 : alpha(T.fg3, 0.82), T.bg, 'center', fnt);
        }
      }

      // Deep-zoom semantic LOD labels (theorems, directories & individual .lean stars!)
      if (k > 0.78) {
        const lodFnt = `500 9.2px ${T.sans}`;
        for (let i = 0; i < NT; i++) {
          if (hasThmSel && i === S.selThm) continue;
          const t = thms[i], sx = t.x * k + ox, sy = t.y * k + oy;
          if (sx < 8 || sx > w - 8 || sy < 30 || sy > H - 40) continue;
          const lbl = t.d.split('.').slice(-1)[0], tw = measureW(lodFnt, lbl);
          if (tryPlace(sx - tw / 2, sy + 5, sx + tw / 2, sy + 16)) {
            haloText(sc, lbl, sx, sy + 14, T.fg2, T.bg, 'center', lodFnt);
          }
        }
      }
      if (k > 1.35 && k < 4.5) {
        const dFnt = `500 8.8px ${T.mono}`;
        const cap = k > 3.0 ? 48 : 80;
        let shown = 0;
        for (let j = 0; j < ND && shown < cap; j++) {
          const i = dirsBySize[j], d = dirs[i];
          if (hasDirSel && i === S.selDir) continue;
          if (k < 2.8 && d[3] < 35) break;
          const sx = d[5] * k + ox, sy = d[6] * k + oy;
          if (sx < 8 || sx > w - 8 || sy < 30 || sy > H - 42) continue;
          const lbl = d[8], tw = measureW(dFnt, lbl);
          if (tryPlace(sx - tw / 2, sy + 5, sx + tw / 2, sy + 15)) {
            haloText(sc, lbl, sx, sy + 13, alpha(T.fg2, 0.88), T.bg, 'center', dFnt);
            shown++;
          }
        }
      }
      // Deep-zoom individual .lean star labels via CSR spatial grid (bounded O(visible), crisp & airy!)
      if (k >= 2.35) {
        const sFnt = `500 8.5px ${T.mono}`;
        const gx0 = clamp(((wx0 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gx1 = clamp(((wx1 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gy0 = clamp(((wy0 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gy1 = clamp(((wy1 - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const cap = k >= 4.2 ? 52 : 34;
        let shown = 0;
        for (let gy = gy0; gy <= gy1 && shown < cap; gy++) {
          const row = gy * SGRID_N;
          for (let gx = gx0; gx <= gx1 && shown < cap; gx++) {
            const c = row + gx;
            const p0 = sGridOff[c], p1 = sGridOff[c + 1];
            const step = (p1 - p0) > 16 ? ((p1 - p0) / 16) | 0 : 1;
            for (let p = p0; p < p1 && shown < cap; p += step) {
              const i = sGridIds[p];
              if (hasFileSel && i === S.selStar) continue;
              const di = starDir[i];
              if (hasDirSel && !litDir[di]) continue;
              const fns = dirFiles[di];
              if (!fns) continue;
              const sx = starX[i] * k + ox, sy = starY[i] * k + oy;
              if (sx < 14 || sx > w - 14 || sy < 36 || sy > H - 44) continue;
              const stem = fns[i - dirStarStart[di]];
              if (!stem) continue;
              const lbl = stem.length > 28 ? stem.slice(0, 26) + '…' : stem;
              const tw = measureW(sFnt, lbl);
              if (sx - tw / 2 < 8 || sx + tw / 2 > w - 8) continue;
              if (tryPlace(sx - tw / 2 - 6, sy + 4, sx + tw / 2 + 6, sy + 18)) {
                haloText(sc, lbl, sx, sy + 13, alpha(T.fg2, litDir[di] ? 0.92 : 0.82), T.bg, 'center', sFnt);
                shown++;
              }
            }
          }
        }
      }
    }

    function render(updateDom = false) {
      const T = cachedT;
      const w = stageW, H = stageH;
      if (!S.camInited) fitFullNow(false);

      ensureBaked(T);

      const k = S.cam.k;
      const ox = w / 2 - S.cam.x * k;
      const oy = H / 2 - S.cam.y * k;
      const toSX = x => x * k + ox;
      const toSY = y => y * k + oy;
      view = { w, h: H, k, ox, oy };

      // Live clickable zoom pill (zero DOM churn unless text changes!)
      const relZoom = k / Math.max(0.01, S.baseK);
      const zTxt = relZoom > 1.12 ? `${relZoom.toFixed(1)}×` : '';
      if (zTxt !== lastZoomTxt) {
        lastZoomTxt = zTxt;
        zoomRead.hidden = !zTxt;
        if (zTxt) zoomRead.textContent = zTxt;
        syncTouchAction();
      }

      const cas = S.cascade;
      const casActive = cas >= 0;
      const waveR = casActive ? Math.max(0, 705 * (1 - clamp(cas / 0.90, 0, 1))) : -1;
      const waveH = casActive ? MAX_H * (1 - clamp((cas - 0.40) / 0.50, 0, 1)) : -1;
      const hasThmSel = S.selType === 'thm' && S.selThm >= 0;
      const hasDirSel = S.selType === 'dir' && S.selDir >= 0;
      const hasFileSel = S.selType === 'file' && !!S.selFile;

      // 1. Rebuild cached static scene ONLY when camera, selection, sector-hover, shards, imports, cascade, or theme change!
      //    (Zero rebuilds while sweeping hover across any of the 175,187 individual stars or 109 theorems!)
      const sKey = `${w}x${H}x${canvasDpr}|${T.dark ? 1 : 0}|${S.cam.x.toFixed(2)},${S.cam.y.toFixed(2)},${k.toFixed(5)}|` +
        `${S.selType}:${S.selThm}:${S.selDir}:${S.selStar}|${S.hovTerr}|` +
        `${S.drawerOpen ? 1 : 0}|${S.importReqSeq}:${S.fileImports.length}|${shardVer}|` +
        `${casActive ? cas.toFixed(3) : -1}`;
      if (sKey !== sceneKey) {
        sceneKey = sKey;
        renderStaticScene(sceneCtx, w, H, k, ox, oy, T, relZoom, cas, casActive, waveR, waveH, hasThmSel, hasDirSel, hasFileSel);
      }

      // 2. Single GPU texture blit of cached static scene (< 0.1ms!)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sceneCanvas, 0, 0);
      ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);

      // 3. Zero-rebuild dynamic hover reticles, theorem hover edges & drawer spotlight (< 0.2ms!)
      const hovFile = !casActive && S.hovType === 'file' && S.hovIdx >= 0 ? S.hovIdx : -1;
      const hovThm = !casActive && S.hovType === 'thm' && S.hovIdx >= 0 ? S.hovIdx : -1;
      if (hovFile >= 0) {
        const sx = starX[hovFile] * k + ox, sy = starY[hovFile] * k + oy;
        ctx.beginPath(); ctx.arc(sx, sy, 8.2, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(T.dark ? '#ffffff' : T.blue, 0.94); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = T.dark ? '#ffffff' : T.blue; ctx.fill();
      } else if (hovThm >= 0) {
        const thmScale = clamp(Math.pow(k / 0.40, 0.30), 0.84, 1.75);
        const hUp = [], hDn = [];
        for (let ei = 0; ei < edges.length; ei++) {
          const [u, v] = edges[ei];
          if (u !== hovThm && v !== hovThm) continue;
          const a = thms[u], b = thms[v];
          const ax = a.x * k + ox, ay = a.y * k + oy, bx0 = b.x * k + ox, by0 = b.y * k + oy;
          const mx = (ax + bx0) * 0.5 + (ox - (ax + bx0) * 0.5) * 0.26;
          const my = (ay + by0) * 0.5 + (oy - (ay + by0) * 0.5) * 0.26;
          (v === hovThm ? hUp : hDn).push(ax, ay, mx, my, bx0, by0);
        }
        const drawH = (arr, col) => {
          if (!arr.length) return;
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 6) {
            ctx.moveTo(arr[i], arr[i + 1]); ctx.quadraticCurveTo(arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5]);
          }
          ctx.strokeStyle = alpha(col, 0.82); ctx.lineWidth = 1.55; ctx.stroke();
        };
        drawH(hUp, T.amber); drawH(hDn, T.blue);
        if (!hasThmSel || hovThm !== S.selThm) {
          const t = thms[hovThm], sx = toSX(t.x), sy = toSY(t.y);
          const r = (t.id === 'main-rh' ? 8.5 : t.k === 'export' ? 5.2 : 4.4) * thmScale;
          ctx.beginPath(); ctx.arc(sx, sy, r + 4.8, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(T.blue, 0.88); ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
      if (S.peekPt) {
        const sx = toSX(S.peekPt.x), sy = toSY(S.peekPt.y);
        if (sx > -20 && sx < w + 20 && sy > -20 && sy < H + 20) {
          ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(T.amber, 0.92); ctx.lineWidth = 1.8; ctx.stroke();
          if (S.peekPt.label) haloText(ctx, S.peekPt.label, sx, sy - 16, T.amber, T.bg, 'center', `700 10px ${T.mono}`);
        }
      }

      // 4. Batched animated photons (6 GPU fill calls total!)
      const coreCol = T.dark ? '#ffffff' : T.bg;
      if (cachedPhotons.length) {
        const ambPts = [], bluPts = [];
        for (let i = 0; i < cachedPhotons.length; i++) {
          const p = cachedPhotons[i];
          const t = (S.phase + (i % 7) * 0.143) % 1;
          const mt = 1 - t;
          const px = mt * mt * p[0] + 2 * mt * t * p[2] + t * t * p[4];
          const py = mt * mt * p[1] + 2 * mt * t * p[3] + t * t * p[5];
          if (px < -10 || px > w + 10 || py < -10 || py > H + 10) continue;
          (p[6] === 0 ? ambPts : bluPts).push(px, py);
        }
        const drawPhotonBatch = (pts, col) => {
          if (!pts.length) return;
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + 4.8, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], 4.8, 0, Math.PI * 2); }
          ctx.fillStyle = alpha(col, 0.30); ctx.fill();
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + 2.3, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], 2.3, 0, Math.PI * 2); }
          ctx.fillStyle = col; ctx.fill();
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + 1.15, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], 1.15, 0, Math.PI * 2); }
          ctx.fillStyle = coreCol; ctx.fill();
        };
        drawPhotonBatch(ambPts, T.amber);
        drawPhotonBatch(bluPts, T.blue);
      }

      // 5. Pulsing active file-star reticle
      if (hasFileSel) {
        const sx = toSX(S.selFile.x), sy = toSY(S.selFile.y);
        const pulse = 1 + 0.16 * Math.sin(S.phase * Math.PI * 4);
        ctx.fillStyle = alpha(T.blue, 0.26);
        ctx.beginPath(); ctx.arc(sx, sy, 15 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, 9.5 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(T.blue, 0.92); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = T.dark ? '#ffffff' : T.blue; ctx.fill();
        ctx.strokeStyle = T.blue; ctx.lineWidth = 1.6; ctx.stroke();
      }

      // 6. Rich 3-Line Per-Point Hover Telemetry Card (drawer-aware & theme-native!)
      const pl = (n, s) => `${num(n)} ${s}${n === 1 ? '' : 's'}`;
      if (S.hovType === 'thm' && S.hovIdx >= 0) {
        const t = thms[S.hovIdx];
        drawPointCard(toSX(t.x), toSY(t.y), t.t, t.tier || t.k, T.blue,
          `${pl(t.anc, 'prereq')} → ${t.desc} downstream · depth ${t.h}`, `${t.d} · click for Lean 4 proof`, w, H, T);
      } else if (S.hovType === 'file' && S.hovIdx >= 0) {
        const di = S.hovDir >= 0 ? S.hovDir : starToDir(S.hovIdx);
        const d = di >= 0 ? dirs[di] : null, tb = d ? terrs[d[1]] : null, col = d ? terrCols[d[1]] : T.blue;
        const info = starRelInfo(S.hovIdx, di);
        const pos = di >= 0 ? S.hovIdx - dirStarStart[di] + 1 : 0;
        if (info) {
          const entry = leanCache.get(info.relPath);
          const l2 = entry && entry.status === 'ok'
            ? `${pl(entry.lines.length, 'line')} · ${pl(entry.decls.length, 'decl')} · ${pl(entry.imports.length, 'import')}`
            : `${d[8]} · file #${num(pos)} of ${num(d[4])}`;
          drawPointCard(toSX(info.x), toSY(info.y), `${info.stem}.lean`, tb.short, col,
            l2, `${info.dp || 'src/'} · click for Lean 4 proof`, w, H, T);
        } else {
          drawPointCard(toSX(starX[S.hovIdx]), toSY(starY[S.hovIdx]),
            d ? `${d[8]} · star #${num(pos)}` : 'Lean 4 star', tb ? tb.short : '', col,
            `Loading filename shard (${num(d ? d[4] : 0)} files)…`, `${d ? (dirPath(di) || 'src/') : 'src/'} · click to open proof`, w, H, T);
        }
      } else if (S.hovType === 'dir' && S.hovIdx >= 0) {
        const d = dirs[S.hovIdx], tb = terrs[d[1]], col = terrCols[d[1]];
        drawPointCard(toSX(d[5]), toSY(d[6]), d[8], tb.short, col,
          `${pl(d[3], '.lean file')} (${num(d[4])} direct)`, `${dirPath(S.hovIdx) || 'src/'} · click to dive & browse`, w, H, T);
      } else if (S.hovTerr >= 0) {
        const tb = terrs[S.hovTerr], tm = terrMid[S.hovTerr], col = terrCols[S.hovTerr];
        const tx = ox + (WRLD.rOut - 40) * k * tm.ca;
        const ty = oy + (WRLD.rOut - 40) * k * tm.sa;
        drawPointCard(tx, ty, tb.label, `${tb.pct}%`, col,
          `${pl(tb.files, '.lean file')} in sector`, `Click to fly into ${tb.short}`, w, H, T);
      }

      // ---- 6. Update single-line inspector footer (structured card on mobile!) & drawer
      if (updateDom || S.dirtyDom) {
        S.dirtyDom = false;
        const { litDir } = mask;
        cascadeBtn.setAttribute('aria-pressed', String(casActive));
        cascadeBtn.textContent = casActive ? '● Playing' : '▶ Cascade';
        const curId = hasThmSel ? thms[S.selThm].id : hasDirSel ? dirPath(S.selDir) : '';
        let activeJumpBtn = null;
        all('[data-jump]', hudBot).forEach(b => {
          const on = b.dataset.jump === curId;
          b.setAttribute('aria-pressed', String(on));
          if (on) activeJumpBtn = b;
        });
        if (activeJumpBtn && hudBot.scrollWidth > hudBot.clientWidth + 4) {
          const targetLeft = Math.max(0, activeJumpBtn.offsetLeft - hudBot.clientWidth / 2 + activeJumpBtn.offsetWidth / 2);
          hudBot.scrollTo({ left: targetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
        }

        if (hasFileSel) {
          const f = S.selFile;
          const entry = leanCache.get(f.relPath);
          const stat = entry && entry.status === 'ok'
            ? `${num(entry.lines.length)} lines · ${entry.decls.length} decls · ${entry.imports.length} imports`
            : 'loading Lean 4 proof…';
          footEl.innerHTML =
            `<span class="rh-ft-title"><strong>${esc(f.stem)}.lean</strong></span>` +
            `<span class="ink">${esc(f.dp || 'src/')} · ${esc(stat)}</span>` +
            `<span class="rh-ft-meta">` +
              `<span><a href="${esc(`${GH_BLOB}/${f.relPath}.lean`)}" target="_blank" rel="noopener">GitHub ↗</a></span>` +
            `</span>` +
            `<button type="button" class="rh-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide proof ✕' : 'Read proof { }'}</button>`;
        } else if (hasThmSel) {
          const t = thms[S.selThm];
          footEl.innerHTML =
            `<span class="rh-ft-title"><strong>${esc(t.t)}</strong></span>` +
            `<span class="ink">${esc(t.g)}</span>` +
            `<span class="rh-ft-meta">` +
              `<span><strong class="amber">${t.anc}</strong> prereqs → <strong class="blue">${t.desc}</strong> downstream</span>` +
              (t.u ? `<span><a href="${esc(t.u)}" target="_blank" rel="noopener"><code>${esc(t.d)}</code></a></span>` : '') +
            `</span>` +
            `<button type="button" class="rh-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide proof ✕' : 'Lean proof { }'}</button>`;
        } else if (hasDirSel) {
          const d = dirs[S.selDir], pth = dirPath(S.selDir);
          const subCount = litDir.reduce((acc, v) => acc + (v ? 1 : 0), 0) - 1;
          const url = pth ? `${GH_TREE}/${pth}` : GH_TREE;
          footEl.innerHTML =
            `<span class="rh-ft-title"><strong>${esc(pth || 'src/')}</strong></span>` +
            `<span class="ink"><strong>${num(d[3])}</strong> .lean files (${num(d[4])} direct${subCount > 0 ? `, ${num(subCount)} sub-folders` : ''}) · tap any zoomed star for proof</span>` +
            `<span class="rh-ft-meta">` +
              `<span><a href="${esc(url)}" target="_blank" rel="noopener">GitHub ↗</a></span>` +
            `</span>` +
            `<button type="button" class="rh-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide files ✕' : `Browse ${d[4] > 0 ? num(d[4]) + ' ' : ''}proofs { }`}</button>`;
        }
        syncTouchAction();
        renderDrawer();
      }
    }

    function drawPointCard(sx, sy, title, badge, badgeCol, line2, line3, w, H, T) {
      const { rx } = drawerLayout(w, H);
      const availRight = Math.max(220, w - rx - 8);
      const f1 = `600 11px ${T.sans}`, fb = `700 8.5px ${T.mono}`, f2 = `600 9.6px ${T.mono}`, f3 = `500 9.2px ${T.mono}`;
      const wt = measureW(f1, title), wb = badge ? measureW(fb, badge) + 12 : 0;
      const w2 = measureW(f2, line2), w3 = line3 ? measureW(f3, line3) : 0;
      const bw = Math.min(availRight - 10, Math.max(wt + wb + (badge ? 8 : 0), w2, w3) + 20);
      const bh = line3 ? 52 : 38;
      const bx = clamp(sx + 14, 8, Math.max(8, availRight - bw));
      const by = sy - bh - 14 < 44 ? Math.min(H - bh - 46, sy + 16) : sy - bh - 14;
      ctx.save();
      ctx.shadowColor = T.dark ? 'rgba(0,0,0,0.68)' : 'rgba(15,23,42,0.16)';
      ctx.shadowBlur = T.dark ? 16 : 18;
      ctx.fillStyle = T.dark ? '#17171c' : '#ffffff';
      rrect(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = alpha(badgeCol || T.blue, T.dark ? 0.45 : 0.36);
      ctx.lineWidth = 1;
      rrect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 8); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = T.dark ? '#f4f4f0' : '#18181b';
      ctx.font = f1;
      ctx.fillText(title, bx + 10, by + 16, bw - wb - 24);
      if (badge) {
        const px = bx + bw - wb - 8, py = by + 6;
        ctx.fillStyle = alpha(badgeCol || T.blue, T.dark ? 0.22 : 0.13);
        rrect(ctx, px, py, wb, 14, 999); ctx.fill();
        ctx.fillStyle = badgeCol || T.blue;
        ctx.font = fb; ctx.textAlign = 'center';
        ctx.fillText(badge, px + wb / 2, py + 10);
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = T.dark ? 'rgba(244,244,240,0.86)' : 'rgba(24,24,27,0.84)';
      ctx.font = f2;
      ctx.fillText(line2, bx + 10, by + 31, bw - 20);
      if (line3) {
        ctx.fillStyle = T.dark ? 'rgba(244,244,240,0.58)' : 'rgba(24,24,27,0.56)';
        ctx.font = f3;
        ctx.fillText(line3, bx + 10, by + 44, bw - 20);
      }
    }

    // --------------------------------------------------- O(1) CSR spatial grid picking & multi-touch
    function pick(mx, my, touch = false) {
      const { k, ox, oy } = view;
      let bestT = -1, bestTD = touch ? 26 : 15;
      for (let i = 0; i < NT; i++) {
        const d = Math.hypot(thms[i].x * k + ox - mx, thms[i].y * k + oy - my);
        if (d < bestTD) { bestTD = d; bestT = i; }
      }
      if (bestT >= 0) return { type: 'thm', idx: bestT, di: -1, terr: -1 };

      if (S.fileImports.length) {
        let bestImp = null, bestID = touch ? 22 : 12;
        for (let i = 0; i < S.fileImports.length; i++) {
          const imp = S.fileImports[i];
          const dist = Math.hypot(imp.x * k + ox - mx, imp.y * k + oy - my);
          if (dist < bestID) { bestID = dist; bestImp = imp; }
        }
        if (bestImp) return { type: 'file', idx: bestImp.starIdx, di: bestImp.di, terr: dirs[bestImp.di][1] };
      }

      const wx = (mx - ox) / k, wy = (my - oy) / k;
      if (k >= 1.0 || (S.selType === 'dir' && k >= 0.72) || S.selType === 'file') {
        const pxThr = touch ? (k >= 1.8 ? 20 : 14) : (k >= 1.8 ? 11 : 8);
        const thr = pxThr / k;
        const gx0 = clamp(((wx - thr - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gx1 = clamp(((wx + thr - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gy0 = clamp(((wy - thr - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        const gy1 = clamp(((wy + thr - SGRID_MIN) * SGRID_INV) | 0, 0, SGRID_N - 1);
        let bestS = -1, bestSD2 = thr * thr;
        for (let gy = gy0; gy <= gy1; gy++) {
          const row = gy * SGRID_N;
          for (let gx = gx0; gx <= gx1; gx++) {
            const c = row + gx;
            for (let p = sGridOff[c], e = sGridOff[c + 1]; p < e; p++) {
              const i = sGridIds[p];
              const dx = starX[i] - wx;
              if (dx > thr || dx < -thr) continue;
              const dy = starY[i] - wy;
              if (dy > thr || dy < -thr) continue;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestSD2) { bestSD2 = d2; bestS = i; }
            }
          }
        }
        if (bestS >= 0) {
          const di = starDir[bestS];
          return { type: 'file', idx: bestS, di, terr: starT[bestS] };
        }
      }

      let bestD = -1, bestDD = touch ? 22 : 12;
      for (let i = 0; i < ND; i++) {
        const dist = Math.hypot(dirs[i][5] * k + ox - mx, dirs[i][6] * k + oy - my);
        if (dist < bestDD) { bestDD = dist; bestD = i; }
      }
      if (bestD >= 0) return { type: 'dir', idx: bestD, di: bestD, terr: dirs[bestD][1] };

      const rad = Math.hypot(wx, wy);
      if (rad >= WRLD.rIn - 10 && rad <= WRLD.rOut + 42) {
        let ang = Math.atan2(wy, wx);
        if (ang < 0) ang += Math.PI * 2;
        for (let ti = 0; ti < terrs.length; ti++) {
          const tb = terrs[ti];
          let a = ang;
          if (a < tb.a0) a += Math.PI * 2;
          if (a >= tb.a0 && a <= tb.a1) {
            const rootDir = dirByPath.get(tb.id);
            return { type: 'terr', idx: rootDir !== undefined ? rootDir : -1, di: rootDir !== undefined ? rootDir : -1, terr: ti };
          }
        }
      }
      return null;
    }

    // Cooperative scroll-safe touch + native two-finger pinch+pan + double-tap + RAF coalesced mouse!
    const pointers = new Map();
    let dragging = false, panMoved = false, downPt = [0, 0], lastPt = [0, 0], lastDragTs = 0;
    let pinchDist = 0, pinchMid = [0, 0], lastTapTs = 0, lastTapPt = [0, 0];
    let pendingHoverPt = null, hoverPrefetchTimer = 0;

    // Prevent browser page-pinch when two fingers touch the canvas, while leaving 1-finger vertical scroll native!
    canvas.addEventListener('touchstart', ev => {
      if (ev.touches.length >= 2) {
        ev.preventDefault();
        touchUnlocked = true;
        syncTouchAction();
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', ev => {
      if (ev.touches.length >= 2) ev.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', ev => {
      const isTouch = ev.pointerType === 'touch';
      const pt = ptOf(canvas, ev);
      pointers.set(ev.pointerId, pt);
      S.vel.x = 0; S.vel.y = 0; S.camTarget = null;
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinchDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        pinchMid = [(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5];
        panMoved = true;
        touchUnlocked = true;
        syncTouchAction();
      } else {
        if (!isTouch || !canvas.classList.contains('scroll-safe')) {
          canvas.setPointerCapture?.(ev.pointerId);
        }
        dragging = true; panMoved = false; downPt = pt; lastPt = pt; lastDragTs = performance.now();
        if (!isTouch) canvas.classList.add('dragging');
      }
    });

    canvas.addEventListener('pointermove', ev => {
      const isTouch = ev.pointerType === 'touch';
      const pt = ptOf(canvas, ev);
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, pt);
        if (pointers.size === 2) {
          const [p1, p2] = [...pointers.values()];
          const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          const mid = [(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5];
          // Simultaneous 2-finger pan + pinch zoom (native Maps feel!)
          S.cam.x -= (mid[0] - pinchMid[0]) / S.cam.k;
          S.cam.y -= (mid[1] - pinchMid[1]) / S.cam.k;
          if (pinchDist > 4 && d > 4) {
            smoothZoomBy(d / pinchDist, mid[0], mid[1], true);
          } else {
            requestDraw();
          }
          pinchDist = d;
          pinchMid = mid;
          return;
        }
        if (dragging) {
          if (isTouch && canvas.classList.contains('scroll-safe')) {
            const tdx = pt[0] - downPt[0], tdy = pt[1] - downPt[1];
            if (Math.hypot(tdx, tdy) > 10) panMoved = true;
            if (Math.abs(tdx) > Math.abs(tdy) * 1.4 && Math.abs(tdx) > 26) {
              flashGestureToast('Pinch to zoom · tap ⤢ for fullscreen');
            }
            return;
          }
          const now = performance.now();
          const dt = Math.max(0.004, Math.min(0.05, (now - lastDragTs) / 1000));
          const dx = pt[0] - lastPt[0], dy = pt[1] - lastPt[1];
          const slop = isTouch ? 10 : 3;
          if (Math.hypot(pt[0] - downPt[0], pt[1] - downPt[1]) > slop) panMoved = true;
          if (panMoved) {
            const wx = -dx / S.cam.k, wy = -dy / S.cam.k;
            S.cam.x += wx; S.cam.y += wy;
            S.vel.x = S.vel.x * 0.55 + (wx / dt) * 0.45;
            S.vel.y = S.vel.y * 0.55 + (wy / dt) * 0.45;
            requestDraw();
          }
          lastPt = pt; lastDragTs = now;
          return;
        }
      }
      if (!isTouch) {
        pendingHoverPt = pt;
        requestDraw();
      }
    });

    const endPtr = ev => {
      const isTouch = ev.pointerType === 'touch';
      const wasClick = pointers.size === 1 && dragging && !panMoved && ev.type === 'pointerup';
      const now = performance.now();
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        dragging = false;
        canvas.classList.remove('dragging');
        if (now - lastDragTs > 75 || reducedMotion()) { S.vel.x = 0; S.vel.y = 0; }
        else if (Math.hypot(S.vel.x, S.vel.y) > 20) requestDraw();
      }
      if (wasClick) {
        S.vel.x = 0; S.vel.y = 0;
        const pt = ptOf(canvas, ev);
        const pk = pick(pt[0], pt[1], isTouch);
        const isDblTap = isTouch && (now - lastTapTs < 320) && Math.hypot(pt[0] - lastTapPt[0], pt[1] - lastTapPt[1]) < 32;
        lastTapTs = isDblTap ? 0 : now;
        lastTapPt = pt;

        if (isDblTap) {
          if (pk && pk.type === 'thm') { S.drawerOpen = true; selectTheorem(pk.idx, { fit: true }); }
          else if (pk && pk.type === 'dir' && pk.idx >= 0) { S.drawerOpen = true; selectDirectory(pk.idx, { fit: true }); }
          else { touchUnlocked = true; smoothZoomBy(2.1, pt[0], pt[1], false); syncTouchAction(); }
        } else if (pk) {
          if (pk.type === 'thm') selectTheorem(pk.idx, { fit: false });
          else if (pk.type === 'file') {
            const info = starRelInfo(pk.idx, pk.di);
            if (info) selectFileStar(info, { openDrawer: true, fit: false });
            else if (pk.di >= 0) {
              ensureDirFiles(pk.di).then(() => {
                const i2 = starRelInfo(pk.idx, pk.di);
                if (i2) selectFileStar(i2, { openDrawer: true, fit: false });
              });
            }
          } else if (pk.type === 'terr' && pk.idx >= 0) {
            touchUnlocked = true;
            selectDirectory(pk.idx, { fit: true });
          } else if (pk.idx >= 0) {
            selectDirectory(pk.idx, { fit: false });
          }
        }
      }
    };
    canvas.addEventListener('pointerup', endPtr);
    canvas.addEventListener('pointercancel', endPtr);

    canvas.addEventListener('pointerleave', () => {
      pendingHoverPt = null;
      clearTimeout(hoverPrefetchTimer);
      if (S.hovType !== null || S.hovTerr !== -1) {
        S.hovType = null; S.hovIdx = -1; S.hovDir = -1; S.hovTerr = -1;
        requestDraw();
      }
    });

    // Smooth cursor-anchored wheel & Mac trackpad pinch zoom!
    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      const dy = ev.deltaMode === 1 ? ev.deltaY * 18 : ev.deltaMode === 2 ? ev.deltaY * 180 : ev.deltaY;
      const sens = ev.ctrlKey ? 0.011 : 0.0024;
      const factor = clamp(Math.exp(-dy * sens), 0.55, 1.85);
      smoothZoomBy(factor, ...ptOf(canvas, ev), false);
    }, { passive: false });

    // Smart double-click: open proof / dive into folder / zoom into empty space!
    canvas.addEventListener('dblclick', ev => {
      const pt = ptOf(canvas, ev);
      const pk = pick(pt[0], pt[1]);
      if (pk && pk.type === 'thm') {
        S.drawerOpen = true;
        selectTheorem(pk.idx, { fit: true });
      } else if (pk && pk.type === 'dir' && pk.idx >= 0) {
        S.drawerOpen = true;
        selectDirectory(pk.idx, { fit: true });
      } else {
        smoothZoomBy(2.15, pt[0], pt[1], false);
      }
    });

    function triggerCascade() {
      S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0;
      if (S.cascade >= 0) { S.cascade = -1; S.dirtyDom = true; requestDraw(); return; }
      S.selType = 'thm'; S.selThm = defaultThm; S.selDir = -1; S.selStar = -1; S.selFile = null; S.fileImports = [];
      rebuildMask();
      fitFullNow(true);
      S.cascade = 0.001;
      S.dirtyDom = true;
      requestDraw();
    }

    function setFullscreen(on) {
      S.fullscreen = on;
      fig.classList.toggle('rh-fullscreen', on);
      document.body.style.overflow = (on || (S.drawerOpen && isMobileSheet())) ? 'hidden' : '';
      const btn = $('[data-hud="fs"]', hudBtns);
      if (btn) btn.textContent = on ? '✕' : '⤢';
      syncTouchAction();
      requestAnimationFrame(() => { syncStageSize(); fitFullNow(false); S.dirtyDom = true; requestDraw(); });
    }

    function toggleDrawer(force) {
      S.drawerOpen = force !== undefined ? force : !S.drawerOpen;
      if (!S.drawerOpen) S.sheetTall = false;
      if (S.drawerOpen) {
        if (S.selType === 'dir' && S.selDir >= 0 && dirs[S.selDir][4] > 0) {
          ensureDirFiles(S.selDir).then(() => { S.dirtyDom = true; requestDraw(); });
        }
        refreshActiveProofAndImports();
      }
      S.dirtyDom = true; requestDraw();
    }

    cascadeBtn.addEventListener('click', triggerCascade);

    function handleHudAction(a) {
      if (a === 'zin') { touchUnlocked = true; smoothZoomBy(1.55); syncTouchAction(); }
      else if (a === 'zout') { smoothZoomBy(1 / 1.55); syncTouchAction(); }
      else if (a === 'fit') { touchUnlocked = true; fitSelection(true); syncTouchAction(); requestDraw(); }
      else if (a === 'full') { S.cascade = -1; S.cascadeFreeze = false; fitFullNow(true); S.dirtyDom = true; requestDraw(); }
      else if (a === 'code') toggleDrawer();
      else if (a === 'fs') setFullscreen(!S.fullscreen);
    }
    all('[data-hud]', hudBtns).forEach(b => b.addEventListener('click', () => handleHudAction(b.dataset.hud)));
    all('[data-hud]', mobZoom).forEach(b => b.addEventListener('click', () => handleHudAction(b.dataset.hud)));

    all('[data-jump]', hudBot).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.jump, jt = b.dataset.jtype;
      if (jt === 'thm' && thmById.has(id)) selectTheorem(thmById.get(id), { fit: true });
      else if (jt === 'dir' && dirByPath.has(id)) selectDirectory(dirByPath.get(id), { fit: true });
    }));

    footEl.addEventListener('click', ev => {
      if (ev.target.closest('[data-toggle-drawer]')) toggleDrawer();
    });

    if (scrimEl) scrimEl.addEventListener('click', () => toggleDrawer(false));

    // Native mobile bottom-sheet drag handle (swipe up = full 90dvh, swipe down = half/close, tap = toggle!)
    let sheetDrag = null;
    drawerEl.addEventListener('pointerdown', ev => {
      const grab = ev.target.closest('[data-sheet-grab]');
      if (!grab || !isMobileSheet()) return;
      grab.setPointerCapture?.(ev.pointerId);
      sheetDrag = { id: ev.pointerId, y0: ev.clientY, dy: 0, h0: drawerEl.getBoundingClientRect().height };
      drawerEl.classList.add('sheet-dragging');
    });
    drawerEl.addEventListener('pointermove', ev => {
      if (!sheetDrag || ev.pointerId !== sheetDrag.id) return;
      const dy = ev.clientY - sheetDrag.y0;
      sheetDrag.dy = dy;
      if (dy < 0) {
        drawerEl.style.transform = '';
        drawerEl.style.height = clamp(sheetDrag.h0 - dy, 180, window.innerHeight * 0.92) + 'px';
      } else if (S.sheetTall) {
        const nextH = sheetDrag.h0 - dy;
        if (nextH >= window.innerHeight * 0.45) {
          drawerEl.style.transform = '';
          drawerEl.style.height = nextH + 'px';
        } else {
          drawerEl.style.height = Math.round(window.innerHeight * 0.45) + 'px';
          drawerEl.style.transform = `translateY(${Math.round(window.innerHeight * 0.45 - nextH)}px)`;
        }
      } else {
        drawerEl.style.height = '';
        drawerEl.style.transform = `translateY(${Math.max(0, dy)}px)`;
      }
    });
    const endSheetDrag = ev => {
      if (!sheetDrag || ev.pointerId !== sheetDrag.id) return;
      const { dy } = sheetDrag;
      sheetDrag = null;
      drawerEl.classList.remove('sheet-dragging');
      drawerEl.style.height = '';
      drawerEl.style.transform = '';
      if (Math.abs(dy) < 10) { S.sheetTall = !S.sheetTall; renderDrawer(); }
      else if (dy < -55) { S.sheetTall = true; renderDrawer(); }
      else if (dy > 85) {
        if (S.sheetTall && dy < 220) { S.sheetTall = false; renderDrawer(); }
        else toggleDrawer(false);
      }
    };
    drawerEl.addEventListener('pointerup', endSheetDrag);
    drawerEl.addEventListener('pointercancel', endSheetDrag);

    // ---- Drawer interactive events + hover prefetch + live canvas spotlight!
    drawerEl.addEventListener('pointerover', ev => {
      const bt = ev.target.closest('[data-jump-thm]');
      if (bt) {
        const t = thms[+bt.dataset.jumpThm];
        if (t) {
          S.peekPt = { x: t.x, y: t.y, label: t.d.split('.').slice(-1)[0] };
          if (t.m) loadLeanFile(t.m.replace(/\./g, '/')); // prefetch silently!
          requestDraw();
        }
        return;
      }
      const bm = ev.target.closest('[data-jump-mod]');
      if (bm) {
        const mod = bm.dataset.jumpMod;
        loadLeanFile(mod.replace(/\./g, '/')); // instant zero-wait prefetch!
        const imp = S.fileImports.find(x => x.modName === mod);
        if (imp) { S.peekPt = { x: imp.x, y: imp.y, label: `${imp.stem}.lean` }; requestDraw(); }
        return;
      }
      const os = ev.target.closest('[data-open-star]');
      if (os) {
        const info = starRelInfo(+os.dataset.openStar, +os.dataset.openDi);
        if (info) {
          S.peekPt = { x: info.x, y: info.y, label: `${info.stem}.lean` };
          loadLeanFile(info.relPath); // instant zero-wait prefetch!
          requestDraw();
        }
      }
    });
    drawerEl.addEventListener('pointerleave', () => {
      if (S.peekPt) { S.peekPt = null; requestDraw(); }
    });

    drawerEl.addEventListener('click', ev => {
      if (ev.target.closest('[data-close-drawer]')) { toggleDrawer(false); return; }
      if (ev.target.closest('[data-drawer-tall]')) { S.sheetTall = !S.sheetTall; renderDrawer(); return; }
      if (ev.target.closest('[data-drawer-wide]')) { S.drawerWide = !S.drawerWide; S.dirtyDom = true; requestDraw(); return; }
      if (ev.target.closest('[data-drawer-back]')) { goBack(); return; }
      const tabBtn = ev.target.closest('[data-code-tab]');
      if (tabBtn) {
        S.codeTab = tabBtn.dataset.codeTab;
        if (S.codeTab === 'full') refreshActiveProofAndImports();
        S.dirtyDom = true; requestDraw(); return;
      }
      if (ev.target.closest('[data-show-all-lines]')) { S.showAllLines = true; S.dirtyDom = true; requestDraw(); return; }
      const copyBtn = ev.target.closest('[data-copy-proof]');
      if (copyBtn) {
        const rel = activeRelPath();
        const entry = rel ? leanCache.get(rel) : null;
        if (entry && entry.text && navigator.clipboard) {
          navigator.clipboard.writeText(entry.text).then(() => {
            copyBtn.textContent = 'Copied ✓';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
          }).catch(() => {});
        }
        return;
      }
      if (ev.target.closest('[data-fit-imports]')) {
        if (!S.fileImports.length) return;
        const { rx, ry } = drawerLayout(stageW, stageH);
        const availW = Math.max(180, stageW - (rx ? rx + 24 : 50));
        const availH = Math.max(160, stageH - (ry ? ry + 56 : 92));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
        if (S.selType === 'file' && S.selFile) add(S.selFile.x, S.selFile.y);
        else if (S.selType === 'thm' && S.selThm >= 0) add(thms[S.selThm].x, thms[S.selThm].y);
        for (const imp of S.fileImports) add(imp.x, imp.y);
        const spanX = Math.max(180, (x1 - x0) + 120), spanY = Math.max(180, (y1 - y0) + 120);
        const k = clamp(Math.min(availW / spanX, availH / spanY), 0.30, 7.0);
        S.camTarget = { x: (x0 + x1) / 2 + (rx * 0.5) / k, y: (y0 + y1) / 2 + (ry * 0.5 + 10) / k, k };
        requestDraw();
        return;
      }
      const glBtn = ev.target.closest('[data-goto-line]');
      if (glBtn) { S.selLine = +glBtn.dataset.gotoLine; S.showAllLines = true; S.dirtyDom = true; requestDraw(); return; }
      const bt = ev.target.closest('[data-jump-thm]');
      if (bt) { selectTheorem(+bt.dataset.jumpThm); return; }
      const bd = ev.target.closest('[data-jump-dir]');
      if (bd) { selectDirectory(+bd.dataset.jumpDir); return; }
      const bm = ev.target.closest('[data-jump-mod]');
      if (bm) {
        resolveModuleToStar(bm.dataset.jumpMod).then(info => {
          if (info) selectFileStar(info, { openDrawer: true, fit: true });
        });
        return;
      }
      const os = ev.target.closest('[data-open-star]');
      if (os) {
        const sIdx = +os.dataset.openStar, di = +os.dataset.openDi;
        const info = starRelInfo(sIdx, di);
        if (info) selectFileStar(info, { openDrawer: true, fit: true });
        else if (di >= 0) {
          ensureDirFiles(di).then(() => {
            const i2 = starRelInfo(sIdx, di);
            if (i2) selectFileStar(i2, { openDrawer: true, fit: true });
          });
        }
        return;
      }
      if (ev.target.closest('[data-more-files]')) {
        S.dirLimit += 120;
        if (S.selType === 'dir' && S.selDir >= 0) renderDirectoryFileList(S.selDir);
      }
    });

    drawerEl.addEventListener('input', ev => {
      const fi = ev.target.closest('[data-dir-filter]');
      if (!fi || S.selType !== 'dir' || S.selDir < 0) return;
      S.dirFilter = fi.value;
      S.dirLimit = 80;
      renderDirectoryFileList(S.selDir);
    });

    // ---- Upgraded Live Search Popover (Theorems + Directories + Individual .lean Files!)
    let searchHits = [], searchSel = 0, searchTimer = 0;

    function runSearch(q, allowLoadMore = true) {
      const ql = q.trim().toLowerCase();
      if (ql.length < 2) { searchPop.hidden = true; searchHits = []; return; }
      const hits = [];

      for (let i = 0; i < NT && hits.length < 4; i++) {
        const t = thms[i];
        if (t.id.toLowerCase().includes(ql) || t.d.toLowerCase().includes(ql) || t.t.toLowerCase().includes(ql)) {
          hits.push({ kind: 'thm', idx: i, title: t.t, sub: t.d });
        }
      }
      for (let j = 0; j < ND && hits.length < 7; j++) {
        const i = dirsBySize[j], p = dirPath(i);
        if (p.toLowerCase().includes(ql)) {
          hits.push({ kind: 'dir', idx: i, title: dirs[i][8], sub: `${p || 'src/'} · ${num(dirs[i][3])} files` });
        }
      }
      for (let j = 0; j < nonEmptyDirs.length && hits.length < 10; j++) {
        const di = nonEmptyDirs[j], fns = dirFiles[di];
        if (!fns) continue;
        for (let k = 0; k < fns.length && hits.length < 10; k++) {
          if (fns[k].toLowerCase().includes(ql)) {
            hits.push({ kind: 'file', starIdx: dirStarStart[di] + k, di, title: `${fns[k]}.lean`, sub: dirPath(di) || 'src/' });
          }
        }
      }

      searchHits = hits;
      searchSel = 0;
      searchPop.hidden = false;
      if (!hits.length) {
        const anyUnloaded = shardLoaded.some(v => !v);
        searchPop.innerHTML = `<div class="rh-search-empty">${anyUnloaded ? 'Scanning 175,187 .lean filenames…' : `No matches for “${esc(q)}”`}</div>`;
      } else {
        searchPop.innerHTML = hits.map((h, i) =>
          `<button type="button" class="${i === 0 ? 'active' : ''}" data-sh="${i}">` +
            `<span class="sp-k ${h.kind}">${h.kind}</span>` +
            `<span class="sp-txt">${esc(h.title)}<span class="sp-sub">${esc(h.sub)}</span></span>` +
          `</button>`
        ).join('');
      }

      // Lazily load fast small shards (s1..s17) first, then s0 (DivisorProofs) only if still < 3 hits
      if (allowLoadMore && ql.length >= 3 && hits.length < 5) {
        const fast = [];
        for (let sid = 1; sid < NUM_SHARDS; sid++) if (!shardLoaded[sid]) fast.push(ensureShard(sid));
        if (fast.length) {
          Promise.all(fast).then(() => { if (searchEl.value.trim().toLowerCase() === ql) runSearch(q, true); });
        } else if (!shardLoaded[0] && hits.length < 3) {
          ensureShard(0).then(() => { if (searchEl.value.trim().toLowerCase() === ql) runSearch(q, false); });
        }
      }
    }

    function closeMobileSearch() {
      stageEl.classList.remove('search-open');
      searchPop.hidden = true;
      searchEl.blur();
    }

    function activateSearchHit(h) {
      if (!h) return;
      closeMobileSearch();
      if (h.kind === 'thm') { S.drawerOpen = true; selectTheorem(h.idx); }
      else if (h.kind === 'dir') { S.drawerOpen = true; selectDirectory(h.idx); }
      else if (h.kind === 'file') {
        const info = starRelInfo(h.starIdx, h.di);
        if (info) selectFileStar(info, { openDrawer: true, fit: true });
      }
    }

    if (searchOpenBtn) {
      searchOpenBtn.addEventListener('click', () => {
        stageEl.classList.add('search-open');
        searchEl.focus();
        if (searchEl.value.trim().length >= 2) runSearch(searchEl.value);
      });
    }
    if (searchCloseBtn) {
      searchCloseBtn.addEventListener('click', () => {
        searchEl.value = '';
        closeMobileSearch();
      });
    }

    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(searchEl.value), 70);
    });
    searchEl.addEventListener('focus', () => { if (searchEl.value.trim().length >= 2) runSearch(searchEl.value); });
    searchEl.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { closeMobileSearch(); return; }
      if (searchPop.hidden || !searchHits.length) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); searchSel = (searchSel + 1) % searchHits.length; }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); searchSel = (searchSel - 1 + searchHits.length) % searchHits.length; }
      else if (ev.key === 'Enter') { ev.preventDefault(); activateSearchHit(searchHits[searchSel]); return; }
      else return;
      all('[data-sh]', searchPop).forEach((b, i) => b.classList.toggle('active', i === searchSel));
    });
    searchPop.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sh]');
      if (b) { ev.preventDefault(); activateSearchHit(searchHits[+b.dataset.sh]); }
    });
    document.addEventListener('pointerdown', ev => {
      if (!ev.target.closest('.rh-search-wrap')) {
        searchPop.hidden = true;
        if (stageEl.classList.contains('search-open')) stageEl.classList.remove('search-open');
      }
    });

    // Power-user keyboard navigation (/, Space, I, W, F, R/0, +/-, [, Esc)
    let isVisible = true;
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') {
        if (!searchPop.hidden) { searchPop.hidden = true; searchEl.blur(); return; }
        if (S.drawerOpen) { toggleDrawer(false); return; }
        if (S.fullscreen) { setFullscreen(false); return; }
      }
      if (!isVisible || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable)) return;
      if (ev.key === '/') { ev.preventDefault(); searchEl.focus(); searchEl.select(); }
      else if (ev.key === ' ') { ev.preventDefault(); triggerCascade(); }
      else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); setFullscreen(!S.fullscreen); }
      else if (ev.key === 'r' || ev.key === 'R' || ev.key === '0') { ev.preventDefault(); S.cascade = -1; S.cascadeFreeze = false; fitFullNow(true); S.dirtyDom = true; requestDraw(); }
      else if (ev.key === 'i' || ev.key === 'I') { ev.preventDefault(); toggleDrawer(); }
      else if ((ev.key === 'w' || ev.key === 'W') && S.drawerOpen) { ev.preventDefault(); S.drawerWide = !S.drawerWide; S.dirtyDom = true; requestDraw(); }
      else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); smoothZoomBy(1.45); }
      else if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); smoothZoomBy(1 / 1.45); }
      else if ((ev.key === '[' || ev.key === 'Backspace') && S.history.length) { ev.preventDefault(); goBack(); }
      else if ((ev.key === ',' || ev.key === '.') && S.selType === 'file' && S.selFile) {
        ev.preventDefault();
        const di = S.selFile.di, fns = dirFiles[di];
        const n = fns ? fns.length : dirs[di][4];
        if (n > 1) {
          const pos = S.selFile.starIdx - dirStarStart[di];
          const nextStar = dirStarStart[di] + ((pos + (ev.key === '.' ? 1 : -1) + n) % n);
          const info = starRelInfo(nextStar, di);
          if (info) selectFileStar(info, { openDrawer: S.drawerOpen, fit: true });
        }
      }
    });

    // Inline prose & harness dispatcher
    fig.rhAction = a => {
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0;
      if (a.cascade !== undefined) { S.cascade = +a.cascade; S.cascadeFreeze = a.freeze === '1'; }
      if (a.drawer !== undefined) { S.drawerOpen = a.drawer === '1'; }
      if (a.wide !== undefined) { S.drawerWide = a.wide === '1'; }
      if (a.file) {
        resolveRelPathToStar(a.file).then(info => {
          if (info) {
            selectFileStar(info, { openDrawer: a.drawer !== '0', fit: true, animate: false, record: false });
            render(true);
          }
        });
        return;
      }
      if (a.thm && thmById.has(a.thm)) {
        selectTheorem(thmById.get(a.thm), { fit: a.fit === '1', animate: false, record: false });
        if (a.fit !== '1') fitFullNow(false);
        render(true);
      } else if (a.dir && dirByPath.has(a.dir)) {
        selectDirectory(dirByPath.get(a.dir), { fit: true, animate: false, record: false });
        render(true);
      } else {
        fitFullNow(false); S.dirtyDom = true; render(true);
      }
    };

    // Resize, visualViewport (mobile toolbar/rotation), theme, and smart demand-driven 60-120fps RAF loop!
    new ResizeObserver(() => {
      if (syncStageSize()) {
        if (!S.camInited) fitFullNow(false);
        else { S.baseK = fitFullTarget(stageW, stageH).k; }
        syncTouchAction();
        if (S.drawerOpen) renderDrawer();
        requestDraw();
      }
    }).observe(stageEl);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (S.fullscreen && syncStageSize()) requestDraw();
      });
    }

    // "Back to article" floating return pill after jumping from inline prose links
    let returnScrollY = null, returnArmed = false;
    fig.showReturnPill = prevY => {
      returnScrollY = prevY;
      returnArmed = false;
      if (backPill) backPill.hidden = false;
    };
    if (backPill) {
      backPill.addEventListener('click', () => {
        const y = returnScrollY;
        returnScrollY = null;
        returnArmed = false;
        backPill.hidden = true;
        if (y !== null) window.scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
      });
      window.addEventListener('scroll', () => {
        if (returnScrollY === null) return;
        if (window.scrollY < returnScrollY - 220) returnArmed = true;
        if (returnArmed && window.scrollY >= returnScrollY - 120) {
          returnScrollY = null;
          returnArmed = false;
          backPill.hidden = true;
        }
      }, { passive: true });
    }

    document.addEventListener('themechange', () => {
      refreshThemeCache();
      requestDraw();
    });

    let rafId = 0, lastTs = 0, lastIdleDraw = 0;

    function requestDraw() {
      S.needsDraw = true;
      if (S.dirtyDom && !isVisible) { render(true); return; }
      if (!rafId && isVisible && !document.hidden) {
        lastTs = 0;
        rafId = requestAnimationFrame(tick);
      }
    }

    function tick(ts) {
      rafId = 0;
      if (!isVisible || document.hidden) return;
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;

      // Coalesced hover pick (at most 1x per animation frame, never during drag/cascade!)
      if (pendingHoverPt && !dragging && S.cascade < 0) {
        const pt = pendingHoverPt;
        pendingHoverPt = null;
        const pk = pick(pt[0], pt[1]);
        const nt = pk && pk.type !== 'terr' ? pk.type : null;
        const ni = pk && pk.type !== 'terr' ? pk.idx : -1;
        const ndi = pk && pk.type === 'file' ? pk.di : -1;
        const ntr = pk && pk.type === 'terr' ? pk.terr : -1;
        if (nt !== S.hovType || ni !== S.hovIdx || ndi !== S.hovDir || ntr !== S.hovTerr) {
          S.hovType = nt; S.hovIdx = ni; S.hovDir = ndi; S.hovTerr = ntr;
          S.needsDraw = true;
          // Gentle hover prefetch for individual stars (auto-loads shard if needed!)
          clearTimeout(hoverPrefetchTimer);
          if (nt === 'file' && ni >= 0) {
            const info = starRelInfo(ni, ndi);
            if (info) {
              hoverPrefetchTimer = setTimeout(() => loadLeanFile(info.relPath), 110);
            } else if (ndi >= 0) {
              ensureDirFiles(ndi).then(() => {
                if (S.hovType === 'file' && S.hovIdx === ni) {
                  const i2 = starRelInfo(ni, ndi);
                  if (i2) loadLeanFile(i2.relPath);
                  requestDraw();
                }
              });
            }
          }
        }
        canvas.style.cursor = pk ? 'pointer' : 'grab';
      }

      // Smooth exponential camera target tween (zoom & landmark glides)
      let activeAnim = false;
      if (S.camTarget) {
        const t = 1 - Math.exp(-dt * 14);
        S.cam.x += (S.camTarget.x - S.cam.x) * t;
        S.cam.y += (S.camTarget.y - S.cam.y) * t;
        S.cam.k += (S.camTarget.k - S.cam.k) * t;
        if (Math.abs(S.camTarget.k - S.cam.k) < 0.0008 && Math.hypot(S.camTarget.x - S.cam.x, S.camTarget.y - S.cam.y) < 0.35) {
          S.cam = { ...S.camTarget }; S.camTarget = null;
        } else {
          activeAnim = true;
        }
        S.needsDraw = true;
      }

      // Momentum inertia pan glide
      if (!dragging && (Math.abs(S.vel.x) > 4 || Math.abs(S.vel.y) > 4)) {
        S.cam.x += S.vel.x * dt;
        S.cam.y += S.vel.y * dt;
        const decay = Math.exp(-dt * 9.5);
        S.vel.x *= decay; S.vel.y *= decay;
        activeAnim = true;
        S.needsDraw = true;
      } else if (!dragging) {
        S.vel.x = 0; S.vel.y = 0;
      }

      // Cascade progression
      if (S.cascade >= 0 && !S.cascadeFreeze) {
        S.cascade += dt / 5.4;
        if (S.cascade >= 1.0) { S.cascade = -1; S.dirtyDom = true; }
        else activeAnim = true;
        S.needsDraw = true;
      }

      // Full 60-120fps during active camera/cascade/hover; battery-friendly 30fps static-scene blit when idle!
      const hasPhotons = !reducedMotion() && (S.lastPhotons > 0 || S.selType === 'file' || S.cascade >= 0);
      if (hasPhotons) {
        S.phase = (S.phase + dt * 0.22) % 1;
        if (activeAnim || S.needsDraw || S.dirtyDom || (ts - lastIdleDraw >= 32)) {
          S.needsDraw = true;
          lastIdleDraw = ts;
        }
      }

      if (S.needsDraw || S.dirtyDom) {
        S.needsDraw = false;
        render(S.dirtyDom);
      }

      if (activeAnim || hasPhotons || pendingHoverPt) {
        rafId = requestAnimationFrame(tick);
      }
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        isVisible = es[0].isIntersecting;
        if (isVisible) requestDraw();
      }, { threshold: 0.05 }).observe(fig);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });

    render(true);
    requestDraw();
  }

  // ------------------------------------------------------------------- boot
  function failure(fig) {
    const p = document.createElement('p');
    p.className = 'rh-error';
    p.innerHTML = `This figure could not load. <a href="${rootFig.dataset.atlas || rootFig.dataset.src}">Open the data</a> or reload the page.`;
    fig.insertBefore(p, $('figcaption', fig));
    fig.classList.add('ready');
  }

  const atlasUrl = rootFig.dataset.atlas || rootFig.dataset.src;
  fetch(atlasUrl).then(r => {
    if (!r.ok) throw Error('atlas unavailable');
    return r.json();
  }).then(A => {
    try { mountCosmos(rootFig, A, atlasUrl); } catch (e) { console.error('rh-mega', e); failure(rootFig); }
  }).catch(e => {
    console.error(e);
    failure(rootFig);
  });

  document.addEventListener('click', ev => {
    const a = ev.target.closest('a.act[href="#rh-mega"]');
    if (!a) return;
    ev.preventDefault();
    const prevY = window.scrollY;
    const figTop = rootFig.getBoundingClientRect().top + prevY;
    if (rootFig && rootFig.rhAction) rootFig.rhAction(a.dataset);
    rootFig.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (prevY > figTop + 260 && rootFig.showReturnPill) rootFig.showReturnPill(prevY);
  });
})();
