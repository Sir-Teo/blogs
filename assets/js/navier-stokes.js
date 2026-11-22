/* High-Performance Radial Proof Singularity for Alpöge & Buckmaster's Lean 4
   Navier–Stokes finite-time blow-up formalization (tristanbuckmaster/navier-stokes):
   - Two-layer astrophotography starfield + subtle baked 6,570-edge real import web
     across all 2,270 Lean modules (616,060 lines, 30,038 theorems/lemmas) in 12
     radial libraries & 95 semantic prefix-family clusters.
   - Harmonious 360-degree inner mandala of 116 verified real spine declarations
     and 265 real dependency arcs converging into Solution.lean at (0, 0).
   - Instant bidirectional import/caller arcs (amber imports, blue callers) and
     live full Lean 4 proof reading for EVERY ONE of the 2,270 modules right inside
     the graph, with zero-wait hover prefetch, live search popover, ▶ Cascade
     inward proof collapse, smooth trackpad/wheel zoom, momentum pan, and mobile
     bottom-sheet drawer. */
(function () {
  'use strict';
  const rootFig = document.getElementById('ns-mega');
  if (!rootFig) return;

  const $ = (s, e = document) => e.querySelector(s);
  const all = (s, e = document) => [...e.querySelectorAll(s)];
  const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtPath = s => esc(s).replace(/([/.])/g, '$1<wbr>');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexRgb(hex) {
    const h = (hex || '#6ea8ff').replace('#', '');
    return h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function alpha(hex, a) {
    if (!hex || !hex.startsWith('#')) return hex;
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
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

  const LEAN_TOK = /\b(import|open|namespace|end|section|variable|universe|set_option|theorem|lemma|def|abbrev|structure|inductive|class|instance|noncomputable|private|protected|axiom|where|let|have|show|from|fun|match|with|if|then|else|do|return|by|in|forall|exists|deriving|extends|mutual)\b|\b(intro|intros|exact|apply|refine|obtain|rcases|cases|induction|rw|simp|simp_all|linarith|nlinarith|positivity|ring|omega|norm_num|ext|rfl|change|calc|constructor|use|left|right|contradiction|exfalso|trivial|decide|aesop|field_simp|push_neg|by_contra|by_cases|haveI|letI|simpa|convert|congr|specialize|generalize|clear|subst|assumption|funext|gcongr|norm_cast|push_cast|sorry)\b|(:=|→|←|↔|∀|∃|≤|≥|≠|∧|∨|¬|λ|⟨|⟩|∘|⁻¹|∣|∈|∉|⊆|∪|∩|∑|∏|∫|ℝ|ℂ|ℕ|ℤ|ℚ)/g;

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
      const cls = lno === hiLine ? 'ns-ln hi' : 'ns-ln';
      parts.push(`<div class="${cls}" data-ln="${lno}"><span class="ns-lno">${lno}</span><span class="ns-ltxt">${highlightLeanLine(lines[i])}</span></div>`);
    }
    return parts.join('');
  }

  // ------------------------------------------------ mount full radial cosmos
  function mountCosmos(fig, A) {
    const COMMIT = A.meta.commit;
    const REPO = A.meta.repo || 'tristanbuckmaster/navier-stokes';
    const GH_TREE = `https://github.com/${REPO}/tree/${COMMIT}/lean`;
    const GH_BLOB = `https://github.com/${REPO}/blob/${COMMIT}/lean`;
    const GH_RAW = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/lean`;

    const clusters = A.clusters;   // [pIdx, tIdx, totFiles, dirFiles, totLines, x, y, label, ghSub]
    const files = A.files;         // [modName, cIdx, lines, thms, dist, x, y, [impIdx...]]
    const thms = A.theorems;       // {id, t, d, m, s, k, g, i, x, y, h, anc, desc, fi, ci, ln, u, code, tier}
    const edges = A.edges;         // [fromIdx (premise), toIdx (conclusion), rel]
    const terrs = A.territories;
    const megaLabels = A.megaLabels || [];
    const WRLD = A.world;
    const NC = clusters.length, NF = files.length, NT = thms.length;
    const MAX_H = WRLD.maxH || 14;

    const terrMid = terrs.map(tb => {
      const am = 0.5 * (tb.a0 + tb.a1);
      const ca = Math.cos(am), sa = Math.sin(am);
      return {
        am, ca, sa,
        ca0: Math.cos(tb.a0), sa0: Math.sin(tb.a0),
        rightSide: ca >= -0.05,
        fullLbl: `${tb.short} · ${tb.files}`,
        shortLbl: `${tb.short.replace('CellReduct', 'CellRed').replace('Weak · Trans', 'Weak').replace('Root & Spec', 'Root')} · ${tb.files}`,
      };
    });

    // ---- Precompute cluster hierarchy, file reverse callers, and lookup indices
    const clChildren = Array.from({ length: NC }, () => []);
    for (let i = 0; i < NC; i++) if (clusters[i][0] >= 0) clChildren[clusters[i][0]].push(i);
    for (let i = 0; i < NC; i++) clChildren[i].sort((a, b) => clusters[b][2] - clusters[a][2]);

    const clByTerrRoot = new Map();
    for (let i = 0; i < NC; i++) if (clusters[i][0] < 0) clByTerrRoot.set(terrs[clusters[i][1]].id, i);

    const clByTerr = Array.from({ length: terrs.length }, () => []);
    for (let i = 0; i < NC; i++) clByTerr[clusters[i][1]].push(i);
    const clBySize = Array.from({ length: NC }, (_, i) => i).sort((a, b) => clusters[b][2] - clusters[a][2]);

    const clFiles = Array.from({ length: NC }, () => []);
    const fileCallers = Array.from({ length: NF }, () => []);
    const fileByMod = new Map();
    const fileTerr = new Uint8Array(NF);
    const fileRad = new Float32Array(NF);

    for (let i = 0; i < NF; i++) {
      const f = files[i];
      fileByMod.set(f[0], i);
      clFiles[f[1]].push(i);
      fileTerr[i] = clusters[f[1]][1];
      fileRad[i] = clamp(1.35 + Math.log10(Math.max(10, f[2])) * 0.65, 1.5, 4.1);
      const imps = f[7];
      for (let j = 0; j < imps.length; j++) fileCallers[imps[j]].push(i);
    }

    const thmById = new Map(thms.map((t, i) => [t.id, i]));
    const thmsByFile = Array.from({ length: NF }, () => []);
    const clToThms = Array.from({ length: NC }, () => []);
    for (let i = 0; i < NT; i++) {
      if (thms[i].fi >= 0) thmsByFile[thms[i].fi].push(i);
      if (thms[i].ci >= 0) clToThms[thms[i].ci].push(i);
    }
    const thmDeps = Array.from({ length: NT }, () => []);
    const thmDependents = Array.from({ length: NT }, () => []);
    for (const [u, v] of edges) { thmDependents[u].push(v); thmDeps[v].push(u); }

    function fileStem(fi) {
      const m = files[fi][0];
      const dot = m.lastIndexOf('.');
      return dot >= 0 ? m.slice(dot + 1) : m;
    }
    function fileRelPath(fi) {
      return files[fi][0].replace(/\./g, '/');
    }

    // ---- Live Lean 4 source fetcher & parser (ALL 2,270 modules!)
    const leanCache = new Map();

    function parseLeanSource(text) {
      const lines = text.replace(/\r\n/g, '\n').split('\n');
      const imports = [], extImports = [], decls = [];
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const im = /^import\s+([A-Za-z0-9_.']+)/.exec(ln);
        if (im) {
          const mod = im[1];
          if (fileByMod.has(mod)) imports.push(mod);
          else extImports.push(mod);
          continue;
        }
        const dm = /^(?:(?:private|protected|noncomputable|unsafe|partial)\s+)*(theorem|lemma|def|abbrev|structure|inductive|class|instance|axiom)\s+([^\s:({\[=]+)/.exec(ln);
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
        })
        .catch(err => {
          leanCache.set(relPath, { status: 'err', err: String(err.message || err) });
          if (onDone) onDone(leanCache.get(relPath));
        });
    }

    // ---- Cached Theme Palette (zero per-frame getComputedStyle!)
    let cachedT = null, terrCols = [], terrRgb = [], stratColMap = {};
    const twCache = new Map();

    function refreshThemeCache() {
      cachedT = readTokens();
      terrCols = terrs.map(tb => cachedT[tb.color] || cachedT.blue);
      terrRgb = terrCols.map(hexRgb);
      stratColMap = { arith: cachedT.amber, est: cachedT.blue, ana: cachedT.good, dest: cachedT.blue };
      twCache.clear();
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

    // ---- Two-Layer Astrophotography + Baked 6,570-Edge Real Import Web!
    const BAKE_N = 2048, NEB_N = 512, BAKE_R = 738;
    const BAKE_SCALE = BAKE_N / (2 * BAKE_R);
    const NEB_SCALE = NEB_N / (2 * BAKE_R);
    let bakedTheme = null;

    const nebCanvas = document.createElement('canvas');
    nebCanvas.width = NEB_N; nebCanvas.height = NEB_N;
    const nebCtx = nebCanvas.getContext('2d');

    const starCanvas = document.createElement('canvas');
    starCanvas.width = BAKE_N; starCanvas.height = BAKE_N;
    const starCtx = starCanvas.getContext('2d');

    function bakeGalaxy(T) {
      // 1. Soft cosmic nebula bloom around dense semantic clusters
      nebCtx.clearRect(0, 0, NEB_N, NEB_N);
      const nh = NEB_N / 2;
      nebCtx.globalCompositeOperation = T.dark ? 'lighter' : 'source-over';
      for (let i = 0; i < NC; i++) {
        const c = clusters[i];
        if (c[3] < 8) continue;
        const px = nh + c[5] * NEB_SCALE;
        const py = nh + c[6] * NEB_SCALE;
        const col = terrCols[c[1]];
        const rad = (10 + 18 * Math.log10(c[3] / 5)) * (NEB_N / 512);
        const op = T.dark
          ? clamp(0.065 + 0.08 * Math.log10(c[3] / 6), 0.06, 0.24)
          : clamp(0.03 + 0.04 * Math.log10(c[3] / 6), 0.025, 0.11);
        const g = nebCtx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, alpha(col, op));
        g.addColorStop(0.55, alpha(col, op * 0.35));
        g.addColorStop(1, alpha(col, 0));
        nebCtx.fillStyle = g;
        nebCtx.beginPath(); nebCtx.arc(px, py, rad, 0, Math.PI * 2); nebCtx.fill();
      }
      nebCtx.globalCompositeOperation = 'source-over';

      // 2. Crisp 2048x2048 canvas: subtle ambient 6,570-edge real import filament web + all 2,270 glowing stars!
      starCtx.clearRect(0, 0, BAKE_N, BAKE_N);
      const bh = BAKE_N / 2;

      // Ambient 6,570 real import filaments grouped by source territory color
      starCtx.lineWidth = 0.7;
      for (let ti = 0; ti < terrs.length; ti++) {
        starCtx.beginPath();
        for (let i = 0; i < NF; i++) {
          if (fileTerr[i] !== ti) continue;
          const f = files[i], imps = f[7];
          const x0 = bh + f[5] * BAKE_SCALE, y0 = bh + f[6] * BAKE_SCALE;
          for (let j = 0; j < imps.length; j++) {
            const g = files[imps[j]];
            const x1 = bh + g[5] * BAKE_SCALE, y1 = bh + g[6] * BAKE_SCALE;
            const mx = (x0 + x1) * 0.5 + (bh - (x0 + x1) * 0.5) * 0.14;
            const my = (y0 + y1) * 0.5 + (bh - (y0 + y1) * 0.14) * 0.14;
            starCtx.moveTo(x0, y0);
            starCtx.quadraticCurveTo(mx, my, x1, y1);
          }
        }
        starCtx.strokeStyle = alpha(terrCols[ti], T.dark ? 0.075 : 0.055);
        starCtx.stroke();
      }

      // All 2,270 real .lean file stars (luminous halos + hot cores weighted by real line count!)
      for (let i = 0; i < NF; i++) {
        const f = files[i], ti = fileTerr[i], col = terrCols[ti];
        const px = bh + f[5] * BAKE_SCALE, py = bh + f[6] * BAKE_SCALE;
        const r = fileRad[i] * 1.45;
        const haloR = r * (f[2] > 500 ? 3.8 : 2.5);
        starCtx.fillStyle = alpha(col, T.dark ? 0.24 : 0.16);
        starCtx.beginPath(); starCtx.arc(px, py, haloR, 0, Math.PI * 2); starCtx.fill();
        starCtx.fillStyle = alpha(col, T.dark ? 0.92 : 0.82);
        starCtx.beginPath(); starCtx.arc(px, py, r, 0, Math.PI * 2); starCtx.fill();
        if (T.dark && f[2] > 180) {
          starCtx.fillStyle = 'rgba(255,255,255,0.72)';
          starCtx.beginPath(); starCtx.arc(px, py, r * 0.45, 0, Math.PI * 2); starCtx.fill();
        }
      }
    }

    function ensureBaked(T) {
      const key = T.dark ? 'dark' : 'light';
      if (bakedTheme !== key) {
        bakedTheme = key;
        bakeGalaxy(T);
      }
    }

    // ---- Landmarks & bottom quick-jump pills
    const LANDMARK_THMS = new Map([
      ['sol-both', 'Solution.lean'],
      ['sol-space', 'R³ blow-up'],
      ['sol-torus', 'T³ blow-up'],
      ['sol-ext-orbit', 'Thm 7.1 orbit'],
      ['sol-frac-cell', 'Frac α=501/500'],
      ['mod-fixed-point', 'FixedPointBox'],
      ['sol-piece-weak', 'Prop B.1 mult.'],
      ['mod-cell-calc', 'Prop B.4 cells'],
      ['mod-spectral', 'RealDichotomy'],
      ['mod-cutoff', 'Cutoff curl(ηA)'],
      ['mod-torus-red', 'Galilean T³'],
      ['mod-cert-torus-main', 'Weak → smooth'],
      ['mod-freqtr', 'FreqTr (59↑)'],
      ['sol-azim', 'Azimuthal gain'],
    ]);

    const JUMPS = [
      { id: 'sol-both', type: 'thm', label: 'Solution.lean' },
      { id: 'sol-space', type: 'thm', label: 'R³ Blow-up' },
      { id: 'sol-torus', type: 'thm', label: 'T³ Blow-up' },
      { id: 'sol-ext-orbit', type: 'thm', label: 'Thm 7.1' },
      { id: 'mod-fixed-point', type: 'thm', label: 'FixedPoint' },
      { id: 'sol-piece-weak', type: 'thm', label: 'Prop B.1' },
      { id: 'mod-cell-calc', type: 'thm', label: 'Prop B.4' },
      { id: 'sol-frac-cell', type: 'thm', label: 'Frac 501/500' },
      { id: 'CertCell', type: 'terr', label: 'CertCell 462' },
      { id: 'FracCell', type: 'terr', label: 'FracCell 488' },
    ];

    const defaultThm = thmById.has('sol-both') ? thmById.get('sol-both') : 0;
    const S = {
      fullscreen: false,
      drawerOpen: false,
      drawerWide: false,
      codeTab: 'full',
      showAllLines: false,
      dirFilter: '',
      dirLimit: 80,
      selType: 'thm',        // 'thm' | 'dir' | 'file'
      selThm: defaultThm,
      selDir: -1,            // cluster index
      selFile: -1,           // file index in files[]
      selLine: 0,
      history: [],
      hovType: null,         // 'thm' | 'dir' | 'file' | null
      hovIdx: -1,
      hovTerr: -1,
      peekPt: null,
      cam: { x: 0, y: 0, k: 0.40 },
      baseK: 0.40,
      camTarget: null,
      vel: { x: 0, y: 0 },
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
      const litCl = new Uint8Array(NC);
      const litFile = new Uint8Array(NF); // 1 = in cluster/caller, 2 = primary, 3 = import
      if (S.selType === 'thm' && S.selThm >= 0) {
        const start = S.selThm;
        const q1 = [start];
        while (q1.length) { const u = q1.pop(); for (const d of thmDeps[u]) if (!ancThm[d]) { ancThm[d] = 1; q1.push(d); } }
        const q2 = [start];
        while (q2.length) { const u = q2.pop(); for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; q2.push(c); } }
        if (thms[start].fi >= 0) litFile[thms[start].fi] = 2;
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        const q = [S.selDir];
        litCl[S.selDir] = 2;
        const seedThms = [];
        while (q.length) {
          const u = q.pop();
          for (const ti of clToThms[u]) { descThm[ti] = 1; seedThms.push(ti); }
          for (const fi of clFiles[u]) litFile[fi] = 1;
          for (const ch of clChildren[u]) if (!litCl[ch]) { litCl[ch] = 1; q.push(ch); }
        }
        while (seedThms.length) {
          const u = seedThms.pop();
          for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; seedThms.push(c); }
        }
      } else if (S.selType === 'file' && S.selFile >= 0) {
        const fi = S.selFile;
        litFile[fi] = 2;
        litCl[files[fi][1]] = 2;
        for (const im of files[fi][7]) litFile[im] = 3;
        for (const ca of fileCallers[fi]) if (!litFile[ca]) litFile[ca] = 1;
        const seed = [...thmsByFile[fi]];
        for (const ti of seed) descThm[ti] = 1;
        while (seed.length) {
          const u = seed.pop();
          for (const c of thmDependents[u]) if (!descThm[c]) { descThm[c] = 1; seed.push(c); }
        }
      }
      mask = { ancThm, descThm, litCl, litFile };
    }
    rebuildMask();

    function pushHistory() {
      const snap = S.selType === 'thm'
        ? { type: 'thm', thm: S.selThm }
        : S.selType === 'file' && S.selFile >= 0
          ? { type: 'file', fi: S.selFile }
          : S.selType === 'dir' && S.selDir >= 0
            ? { type: 'dir', ci: S.selDir }
            : null;
      if (!snap) return;
      const top = S.history[S.history.length - 1];
      if (top && top.type === snap.type && top.thm === snap.thm && top.ci === snap.ci && top.fi === snap.fi) return;
      S.history.push(snap);
      if (S.history.length > 30) S.history.shift();
    }

    function activeRelPath() {
      if (S.selType === 'file' && S.selFile >= 0) return fileRelPath(S.selFile);
      if (S.selType === 'thm' && S.selThm >= 0 && thms[S.selThm].m) return thms[S.selThm].m.replace(/\./g, '/');
      return null;
    }

    function maybeLoadProof() {
      const rel = activeRelPath();
      if (!rel || (!S.drawerOpen && S.selType !== 'file')) return;
      loadLeanFile(rel, () => { S.dirtyDom = true; requestDraw(); });
    }

    function selectTheorem(idx, { fit = true, animate = true, record = true } = {}) {
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.selType = 'thm'; S.selThm = idx; S.selDir = -1; S.selFile = -1;
      S.selLine = thms[idx].ln || 0;
      S.codeTab = 'full'; S.showAllLines = false;
      rebuildMask();
      maybeLoadProof();
      if (fit) {
        if (thms[idx].id === 'sol-both' && !S.drawerOpen) fitFullNow(animate);
        else fitSelection(animate);
      }
      S.dirtyDom = true; requestDraw();
    }

    function selectCluster(ci, { fit = true, animate = true, record = true } = {}) {
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.selType = 'dir'; S.selDir = ci; S.selThm = -1; S.selFile = -1;
      S.selLine = 0; S.dirFilter = ''; S.dirLimit = 80;
      rebuildMask();
      if (fit) fitSelection(animate);
      S.dirtyDom = true; requestDraw();
    }

    function selectFile(fi, { openDrawer = true, fit = true, animate = true, record = true, line = 0 } = {}) {
      if (fi < 0 || fi >= NF) return;
      if (record) pushHistory();
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0; S.peekPt = null;
      S.selType = 'file'; S.selFile = fi; S.selDir = files[fi][1]; S.selThm = -1;
      S.selLine = line; S.codeTab = 'full'; S.showAllLines = false;
      if (openDrawer) S.drawerOpen = true;
      rebuildMask();
      maybeLoadProof();
      if (fit) fitSelection(animate);
      S.dirtyDom = true; requestDraw();
    }

    function goBack() {
      const prev = S.history.pop();
      if (!prev) return;
      if (prev.type === 'thm') selectTheorem(prev.thm, { record: false });
      else if (prev.type === 'dir') selectCluster(prev.ci, { record: false });
      else if (prev.type === 'file') selectFile(prev.fi, { record: false });
    }

    // ---- Build pure minimal DOM shell
    const el = document.createElement('div');
    el.className = 'ns-body';
    el.innerHTML =
      `<div class="ns-stage">` +
        `<canvas class="ns-canvas"></canvas>` +
        `<div class="ns-hud-tl"><b>${num(A.meta.repoFiles)}</b><span class="ns-meta-long"> files · <b>${Math.round(A.meta.lines / 1000)}k</b> lines · <b>${num(A.meta.importEdges)}</b> imports</span> → <span class="blue">Solution.lean</span></div>` +
        `<div class="ns-hud-tr">` +
          `<div class="ns-search-wrap">` +
            `<input type="search" class="ns-search" placeholder="Search… (/)" aria-label="Search Lean theorems, libraries, and files">` +
            `<div class="ns-search-pop" hidden></div>` +
          `</div>` +
          `<button type="button" class="ns-cascade-btn" data-cascade aria-pressed="false" title="Replay inward proof collapse (Space)">▶ Cascade</button>` +
          `<div class="ns-hud-btns">` +
            `<button type="button" class="ns-zoom-read" data-hud="full" hidden title="Reset zoom to 1× (0)">1.0×</button>` +
            `<button type="button" data-hud="zin" title="Zoom in (+)">+</button>` +
            `<button type="button" data-hud="zout" title="Zoom out (−)">−</button>` +
            `<button type="button" data-hud="fit" title="Zoom to selection">Fit</button>` +
            `<button type="button" data-hud="full" title="Reset full cosmos (R / 0)">Reset</button>` +
            `<button type="button" data-hud="code" aria-pressed="false" title="Inspect Lean 4 proof (I)">{ }</button>` +
            `<button type="button" data-hud="fs" title="Fullscreen (F / Esc)">⤢</button>` +
          `</div>` +
        `</div>` +
        `<aside class="ns-drawer" hidden aria-label="Lean 4 proof inspector"></aside>` +
        `<div class="ns-hud-bot">` +
          JUMPS.map(j =>
            `<button type="button" data-jump="${esc(j.id)}" data-jtype="${j.type}" aria-pressed="${j.id === 'sol-both'}">${esc(j.label)}</button>`
          ).join('') +
        `</div>` +
      `</div>` +
      `<p class="ns-foot" aria-live="polite"></p>`;
    fig.insertBefore(el, $('figcaption', fig));
    fig.classList.add('ready');

    const stageEl = $('.ns-stage', el);
    const canvas = $('.ns-canvas', el);
    const ctx = canvas.getContext('2d', { alpha: false });
    const footEl = $('.ns-foot', el);
    const searchEl = $('.ns-search', el);
    const searchPop = $('.ns-search-pop', el);
    const cascadeBtn = $('[data-cascade]', el);
    const hudBtns = $('.ns-hud-btns', el);
    const zoomRead = $('.ns-zoom-read', el);
    const drawerEl = $('.ns-drawer', el);
    const hudBot = $('.ns-hud-bot', el);

    // ---- Cached Stage Geometry
    let stageW = 800, stageH = 600, canvasDpr = 1;

    function computeHeight(w) {
      if (S.fullscreen) return Math.max(360, Math.round(stageEl.clientHeight || window.innerHeight - 48));
      const vh = window.innerHeight || 800;
      if (w < 600) return clamp(Math.round(w * 1.12), 420, Math.round(vh * 0.72));
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
        canvas.style.width = nw + 'px';
        canvas.style.height = nh + 'px';
      }
      return changed;
    }
    syncStageSize();

    function drawerLayout(w, h) {
      if (!S.drawerOpen) return { rx: 0, ry: 0 };
      if (w <= 720) return { rx: 0, ry: Math.round(h * 0.55) };
      return { rx: S.drawerWide ? Math.min(560, Math.round(w * 0.56)) + 20 : 356, ry: 0 };
    }

    function fitFullTarget(w, h) {
      const padX = w < 640 ? 84 : 108;
      const padT = 50, padB = 54;
      const span = WRLD.r * 2;
      const k = Math.min((w - 2 * padX) / span, (h - padT - padB) / span);
      return { x: 0, y: (padB - padT) / (2 * k), k };
    }

    function fitFullNow(animate = false) {
      const tgt = fitFullTarget(stageW, stageH);
      S.baseK = tgt.k; S.vel.x = 0; S.vel.y = 0;
      if (!animate || reducedMotion()) { S.cam = { ...tgt }; S.camTarget = null; }
      else S.camTarget = tgt;
      S.camInited = true;
    }

    function fitSelection(animate = true) {
      const w = stageW, h = stageH;
      const { rx, ry } = drawerLayout(w, h);
      const availW = Math.max(180, w - (rx ? rx + 24 : 50));
      const availH = Math.max(160, h - (ry ? ry + 56 : 92));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      let maxK = 6.5;

      if (S.selType === 'file' && S.selFile >= 0) {
        const f = files[S.selFile];
        add(f[5], f[6]);
        // Frame the file cleanly with its local cluster neighborhood
        x0 -= 68; x1 += 68; y0 -= 68; y1 += 68;
        maxK = 4.6;
      } else if (S.selType === 'thm' && S.selThm >= 0) {
        const t = thms[S.selThm];
        if (t.id === 'sol-both') {
          const k = Math.min(availW / 760, availH / 760);
          const tgt = { x: (rx * 0.5) / k, y: (ry * 0.5 + 8) / k, k };
          if (!animate || reducedMotion()) { S.cam = { ...tgt }; S.camTarget = null; } else S.camTarget = tgt;
          return;
        }
        add(t.x, t.y);
        for (let i = 0; i < NT; i++) if (mask.ancThm[i] || mask.descThm[i]) add(thms[i].x, thms[i].y);
        if (t.fi >= 0) add(files[t.fi][5], files[t.fi][6]);
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        for (let i = 0; i < NF; i++) if (mask.litFile[i]) add(files[i][5], files[i][6]);
        if (!isFinite(x0)) add(clusters[S.selDir][5], clusters[S.selDir][6]);
        x0 -= 44; x1 += 44; y0 -= 44; y1 += 44;
      }
      if (!isFinite(x0)) { fitFullNow(animate); return; }
      const spanX = Math.max(140, (x1 - x0) + 100);
      const spanY = Math.max(140, (y1 - y0) + 100);
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
      const nk = clamp(base.k * factor, minK, 22);
      const nx = wx - (sx - stageW / 2) / nk;
      const ny = wy - (sy - stageH / 2) / nk;
      S.vel.x = 0; S.vel.y = 0;
      if (instant || reducedMotion()) { S.cam = { x: nx, y: ny, k: nk }; S.camTarget = null; }
      else S.camTarget = { x: nx, y: ny, k: nk };
      requestDraw();
    }

    // ---- Frosted Glass Lean 4 Proof Inspector Drawer
    function drawerHeaderHtml(titleText) {
      return (
        `<div class="ns-drawer-head">` +
          `<div class="ns-drawer-title" title="${esc(titleText)}">${esc(titleText)}</div>` +
          `<div class="ns-drawer-acts">` +
            (S.history.length ? `<button type="button" class="ns-drawer-btn" data-drawer-back title="Back ([)">←</button>` : '') +
            `<button type="button" class="ns-drawer-btn" data-drawer-wide aria-pressed="${S.drawerWide}" title="${S.drawerWide ? 'Compact drawer (W)' : 'Expand proof reader (W)'}">${S.drawerWide ? '⇥' : '⇤'}</button>` +
            `<button type="button" class="ns-drawer-btn" data-close-drawer aria-label="Close inspector">×</button>` +
          `</div>` +
        `</div>`
      );
    }

    function proofCodeSectionHtml(relPath, fallbackExcerpt, targetLine, ghUrl, preImps, preCallers) {
      const entry = relPath ? leanCache.get(relPath) : null;
      const hasFull = entry && entry.status === 'ok';
      const showFull = hasFull && S.codeTab === 'full';
      const isLoading = entry && entry.status === 'loading';
      const isErr = entry && entry.status === 'err';
      let barHtml = '';
      if (relPath) {
        barHtml =
          `<div class="ns-code-bar">` +
            `<div class="ns-code-tabs">` +
              `<button type="button" data-code-tab="full" aria-pressed="${S.codeTab === 'full'}">${hasFull ? `Full proof (${num(entry.lines.length)}L)` : isLoading ? 'Loading…' : 'Full proof'}</button>` +
              (fallbackExcerpt ? `<button type="button" data-code-tab="excerpt" aria-pressed="${S.codeTab === 'excerpt'}">Excerpt</button>` : '') +
            `</div>` +
            `<div class="ns-code-mini">` +
              (hasFull ? `<button type="button" data-copy-proof>Copy</button>` : '') +
              `<a href="${esc(ghUrl)}" target="_blank" rel="noopener">GitHub ↗</a>` +
            `</div>` +
          `</div>`;
      }

      let declsHtml = '', importsHtml = '', callersHtml = '', bodyHtml = '';
      if (showFull) {
        const lines = entry.lines;
        const cap = 420;
        let s0 = 0, e0 = lines.length;
        if (!S.showAllLines && lines.length > cap) {
          if (targetLine > 120) { s0 = Math.max(0, targetLine - 50); e0 = Math.min(lines.length, s0 + cap); }
          else e0 = cap;
        }
        bodyHtml =
          `<div class="ns-proof-box" data-proof-box>` +
            renderNumberedLean(lines, s0, e0, targetLine) +
            (e0 - s0 < lines.length
              ? `<div class="ns-proof-status"><button type="button" class="ns-drawer-btn" data-show-all-lines>Show all ${num(lines.length)} lines (currently L${s0 + 1}–${e0})</button></div>`
              : '') +
          `</div>`;
        if (entry.decls.length > 1) {
          declsHtml =
            `<div class="ns-drawer-sec"><span>Declarations in file (${entry.decls.length})</span></div>` +
            `<div class="ns-drawer-links">` +
              entry.decls.slice(0, 20).map(dc =>
                `<button type="button" class="dec" data-goto-line="${dc.line}" title="${esc(dc.kind + ' ' + dc.name)} · L${dc.line}">${esc(dc.name.split('.').slice(-1)[0])} <span style="opacity:.6">L${dc.line}</span></button>`
              ).join('') +
            `</div>`;
        }
      } else if (fallbackExcerpt) {
        const exLines = fallbackExcerpt.split('\n');
        bodyHtml =
          `<div class="ns-proof-box" data-proof-box>` +
            renderNumberedLean(exLines, 0, exLines.length, 0) +
            (isLoading ? `<div class="ns-proof-status">Fetching complete ${esc(relPath)}.lean…</div>` : '') +
            (isErr ? `<div class="ns-proof-status">Full source unavailable offline (${esc(entry.err)}). Showing cached declaration.</div>` : '') +
          `</div>`;
      } else if (isLoading) {
        bodyHtml = `<div class="ns-proof-box"><div class="ns-proof-status">Loading ${esc(relPath)}.lean…</div></div>`;
      } else if (isErr) {
        bodyHtml = `<div class="ns-proof-box"><div class="ns-proof-status">Could not fetch ${esc(relPath)}.lean (${esc(entry.err)}). <a class="ns-drawer-gh" href="${esc(ghUrl)}" target="_blank" rel="noopener">Open on GitHub ↗</a></div></div>`;
      }

      if (preImps && preImps.length) {
        importsHtml =
          `<div class="ns-drawer-sec"><span>Imports (${preImps.length} in-repo)</span>` +
            `<button type="button" data-fit-imports>Trace on map</button>` +
          `</div>` +
          `<div class="ns-drawer-links">` +
            preImps.slice(0, 26).map(fi =>
              `<button type="button" class="up" data-open-file="${fi}" title="Open ${esc(files[fi][0])}">${esc(fileStem(fi))}</button>`
            ).join('') +
          `</div>`;
      }
      if (preCallers && preCallers.length) {
        callersHtml =
          `<div class="ns-drawer-sec"><span>Imported by (${preCallers.length} modules)</span></div>` +
          `<div class="ns-drawer-links">` +
            preCallers.slice(0, 22).map(fi =>
              `<button type="button" class="dn" data-open-file="${fi}" title="Open ${esc(files[fi][0])}">${esc(fileStem(fi))}</button>`
            ).join('') +
          `</div>`;
      }

      return { barHtml, bodyHtml, declsHtml, importsHtml, callersHtml };
    }

    function collectClusterFiles(ci) {
      const out = [];
      const q = [ci];
      const seen = new Uint8Array(NC);
      seen[ci] = 1;
      while (q.length) {
        const u = q.pop();
        for (const fi of clFiles[u]) out.push(fi);
        for (const ch of clChildren[u]) if (!seen[ch]) { seen[ch] = 1; q.push(ch); }
      }
      out.sort((a, b) => files[b][2] - files[a][2]);
      return out;
    }

    function renderClusterFileList(ci) {
      const listEl = $('[data-file-list]', drawerEl);
      if (!listEl) return;
      const allF = collectClusterFiles(ci);
      const q = S.dirFilter.trim().toLowerCase();
      const hits = [];
      for (let i = 0; i < allF.length; i++) {
        const fi = allF[i];
        if (!q || files[fi][0].toLowerCase().includes(q)) {
          hits.push(fi);
          if (hits.length >= S.dirLimit + 1) break;
        }
      }
      const hasMore = hits.length > S.dirLimit;
      const show = hasMore ? hits.slice(0, S.dirLimit) : hits;
      const countEl = $('[data-file-count]', drawerEl);
      if (countEl) {
        countEl.textContent = q ? `${hasMore ? S.dirLimit + '+' : hits.length} matching of ${num(allF.length)}` : `${num(allF.length)} .lean proofs (by size)`;
      }
      if (!show.length) {
        listEl.innerHTML = `<div class="ns-proof-status">No .lean files match “${esc(S.dirFilter)}”.</div>`;
        return;
      }
      listEl.innerHTML =
        show.map(fi =>
          `<button type="button" data-open-file="${fi}">` +
            `<span class="fl-name">${esc(fileStem(fi))}.lean</span><span class="fl-go">${num(files[fi][2])}L →</span>` +
          `</button>`
        ).join('') +
        (hasMore ? `<button type="button" class="ns-file-more" data-more-files>+ Show 120 more</button>` : '');
    }

    function renderDrawer() {
      drawerEl.hidden = !S.drawerOpen;
      drawerEl.classList.toggle('wide', S.drawerWide);
      const codeBtn = $('[data-hud="code"]', hudBtns);
      if (codeBtn) codeBtn.setAttribute('aria-pressed', String(S.drawerOpen));
      if (!S.drawerOpen) return;

      if (S.selType === 'file' && S.selFile >= 0) {
        const fi = S.selFile, f = files[fi], cl = clusters[f[1]], tb = terrs[cl[1]];
        const rel = fileRelPath(fi), stem = fileStem(fi);
        const hosted = thmsByFile[fi];
        const ghUrl = `${GH_BLOB}/${rel}.lean${S.selLine ? `#L${S.selLine}` : ''}`;
        const sec = proofCodeSectionHtml(rel, '', S.selLine, ghUrl, f[7], fileCallers[fi]);
        drawerEl.innerHTML =
          drawerHeaderHtml(`${stem}.lean`) +
          `<div class="ns-drawer-scroll">` +
            `<div class="ns-drawer-meta">` +
              `<span class="ns-tag amber">Lean 4 file</span>` +
              `<span class="ns-tag">${esc(tb.short)}</span>` +
              `<span class="ns-tag">${num(f[2])} lines</span>` +
              `<span class="ns-tag good">${f[3]} thms</span>` +
            `</div>` +
            `<div class="ns-drawer-path">` +
              `<button type="button" data-jump-dir="${f[1]}">← ${esc(cl[7])} (${num(cl[2])})</button>` +
              `<span>${fmtPath(f[0])}</span>` +
            `</div>` +
            (hosted.length
              ? `<div class="ns-drawer-sec"><span>Verified spine declarations (${hosted.length})</span></div>` +
                `<div class="ns-drawer-links">${hosted.map(ti => `<button type="button" class="dn" data-jump-thm="${ti}">${esc(thms[ti].d.split('.').slice(-1)[0])}</button>`).join('')}</div>`
              : '') +
            sec.barHtml + sec.bodyHtml + sec.declsHtml + sec.importsHtml + sec.callersHtml +
          `</div>`;
      } else if (S.selType === 'thm' && S.selThm >= 0) {
        const idx = S.selThm, t = thms[idx];
        const up = thmDeps[idx], dn = thmDependents[idx];
        const rel = t.m ? t.m.replace(/\./g, '/') : '';
        const stratName = { arith: 'Cell & coercive supply', est: 'Certificate & fixed point', ana: 'Blow-up on R³ & T³', dest: 'Solution.lean' }[t.s] || t.s;
        const ghUrl = t.u || (rel ? `${GH_BLOB}/${rel}.lean` : GH_TREE);
        const fImps = t.fi >= 0 ? files[t.fi][7] : [];
        const fCallers = t.fi >= 0 ? fileCallers[t.fi] : [];
        const sec = proofCodeSectionHtml(rel, t.code, S.selLine, ghUrl, fImps, fCallers);
        drawerEl.innerHTML =
          drawerHeaderHtml(t.t) +
          `<div class="ns-drawer-scroll">` +
            `<div class="ns-drawer-meta">` +
              `<span class="ns-tag blue">${esc(stratName)}</span>` +
              `<span class="ns-tag">${esc(t.k)}</span>` +
              (t.tier ? `<span class="ns-tag good">${esc(t.tier)}</span>` : '') +
              `<span class="ns-tag">depth ${t.h}</span>` +
            `</div>` +
            `<p>${esc(t.g)}${t.i && t.i !== t.g ? ' ' + esc(t.i) : ''}</p>` +
            (t.fi >= 0
              ? `<div class="ns-drawer-path">` +
                  `<button type="button" data-open-file="${t.fi}" title="Fly to star in outer cosmos">✦ ${esc(fileStem(t.fi))}.lean (${num(files[t.fi][2])}L)</button>` +
                  `<button type="button" data-jump-dir="${t.ci}">${esc(clusters[t.ci][7])}</button>` +
                `</div>`
              : '') +
            sec.barHtml + sec.bodyHtml +
            (up.length ? `<div class="ns-drawer-sec"><span>Spine prerequisites (${up.length} · ${t.anc} total)</span></div>` +
              `<div class="ns-drawer-links">${up.map(u => `<button type="button" class="up" data-jump-thm="${u}" title="${esc(thms[u].t)}">${esc(thms[u].d.split('.').slice(-1)[0])}</button>`).join('')}</div>` : '') +
            (dn.length ? `<div class="ns-drawer-sec"><span>Used by (${dn.length} · ${t.desc} downstream)</span></div>` +
              `<div class="ns-drawer-links">${dn.map(v => `<button type="button" class="dn" data-jump-thm="${v}" title="${esc(thms[v].t)}">${esc(thms[v].d.split('.').slice(-1)[0])}</button>`).join('')}</div>` : '') +
            sec.declsHtml + sec.importsHtml +
          `</div>`;
      } else if (S.selType === 'dir' && S.selDir >= 0) {
        const ci = S.selDir, cl = clusters[ci], tb = terrs[cl[1]];
        const children = clChildren[ci];
        const pct = ((cl[2] / NF) * 100).toFixed(cl[2] >= 20 ? 1 : 2);
        const hosted = [];
        for (let i = 0; i < NC; i++) if (mask.litCl[i]) for (const ti of clToThms[i]) hosted.push(ti);
        const ghUrl = cl[8] ? `${GH_TREE}/${cl[8]}` : GH_TREE;
        drawerEl.innerHTML =
          drawerHeaderHtml(cl[7]) +
          `<div class="ns-drawer-scroll">` +
            `<div class="ns-drawer-meta">` +
              `<span class="ns-tag amber">${num(cl[2])} .lean files</span>` +
              `<span class="ns-tag">${num(cl[4])} lines</span>` +
              `<span class="ns-tag">${pct}% of repo</span>` +
              `<span class="ns-tag">${esc(tb.short)}</span>` +
            `</div>` +
            `<p><code>${fmtPath(cl[8] || 'lean/')}</code> · <strong>${num(cl[2])}</strong> Lean modules across <strong>${num(cl[4])}</strong> lines of proof code.</p>` +
            (children.length
              ? `<div class="ns-drawer-sec"><span>Sub-families (${children.length})</span></div>` +
                `<div class="ns-drawer-links">${children.slice(0, 14).map(ch => `<button type="button" class="up" data-jump-dir="${ch}">${esc(clusters[ch][7])} (${clusters[ch][2]})</button>`).join('')}</div>`
              : '') +
            (hosted.length
              ? `<div class="ns-drawer-sec"><span>Verified spine declarations (${hosted.length})</span></div>` +
                `<div class="ns-drawer-links">${hosted.slice(0, 14).map(ti => `<button type="button" class="dn" data-jump-thm="${ti}">${esc(thms[ti].d.split('.').slice(-1)[0])}</button>`).join('')}</div>`
              : '') +
            `<div class="ns-drawer-sec"><span data-file-count>${num(cl[2])} .lean proofs</span></div>` +
            `<input type="search" class="ns-dir-filter" data-dir-filter value="${esc(S.dirFilter)}" placeholder="Filter ${num(cl[2])} .lean proofs…">` +
            `<div class="ns-file-list" data-file-list></div>` +
            `<a class="ns-drawer-gh" href="${esc(ghUrl)}" target="_blank" rel="noopener">Browse on GitHub ↗</a>` +
          `</div>`;
        renderClusterFileList(ci);
      }

      if (S.selLine > 0) {
        const box = $('[data-proof-box]', drawerEl);
        const target = box ? $(`[data-ln="${S.selLine}"]`, box) : null;
        if (box && target) box.scrollTop = Math.max(0, target.offsetTop - 22);
      }
    }

    // --------------------------------------------------------- master render
    let view = { w: 800, h: 600, k: 0.4, ox: 400, oy: 300 };
    let lastZoomTxt = '';

    function render(updateDom = false) {
      const T = cachedT;
      const w = stageW, H = stageH;
      ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
      if (!S.camInited) fitFullNow(false);

      ensureBaked(T);

      const k = S.cam.k;
      const ox = w / 2 - S.cam.x * k;
      const oy = H / 2 - S.cam.y * k;
      const toSX = x => x * k + ox;
      const toSY = y => y * k + oy;
      view = { w, h: H, k, ox, oy };

      const relZoom = k / Math.max(0.01, S.baseK);
      const zTxt = relZoom > 1.12 ? `${relZoom.toFixed(1)}×` : '';
      if (zTxt !== lastZoomTxt) {
        lastZoomTxt = zTxt;
        zoomRead.hidden = !zTxt;
        if (zTxt) zoomRead.textContent = zTxt;
      }

      const cas = S.cascade;
      const casActive = cas >= 0;
      const waveR = casActive ? Math.max(0, 705 * (1 - clamp(cas / 0.90, 0, 1))) : -1;
      const waveH = casActive ? MAX_H * (1 - clamp((cas - 0.40) / 0.50, 0, 1)) : -1;

      // ---- 0. Deep radial cosmos backdrop
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, w, H);
      const cx0 = toSX(0), cy0 = toSY(0);
      const bgGlow = ctx.createRadialGradient(cx0, cy0, 8 * k, cx0, cy0, 760 * k);
      bgGlow.addColorStop(0, alpha(T.blue, T.dark ? 0.11 : 0.05));
      bgGlow.addColorStop(0.45, alpha(T.blue, T.dark ? 0.03 : 0.014));
      bgGlow.addColorStop(1, alpha(T.blue, 0));
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, w, H);

      const { ancThm, descThm, litCl, litFile } = mask;
      const hasThmSel = S.selType === 'thm' && S.selThm >= 0;
      const hasDirSel = S.selType === 'dir' && S.selDir >= 0;
      const hasFileSel = S.selType === 'file' && S.selFile >= 0;

      const placed = [];
      function tryPlace(x0, y0, x1, y1) {
        if (x1 < 4 || x0 > w - 4 || y1 < 34 || y0 > H - 40) return false;
        for (let i = 0; i < placed.length; i++) {
          const b = placed[i];
          if (x0 < b[2] + 3 && x1 > b[0] - 3 && y0 < b[3] + 2 && y1 > b[1] - 2) return false;
        }
        placed.push([x0, y0, x1, y1]);
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
      ctx.lineWidth = 0.85;
      for (let ri = 0; ri < rings.length; ri++) {
        const [rr, op, dash] = rings[ri];
        const rk = rr * k;
        if (cx0 + rk < -10 || cx0 - rk > w + 10 || cy0 + rk < -10 || cy0 - rk > H + 10) continue;
        ctx.save();
        if (dash) ctx.setLineDash(dash);
        ctx.strokeStyle = alpha(T.fg3, T.dark ? op : op * 0.9);
        ctx.beginPath(); ctx.arc(cx0, cy0, rk, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      if (k < 2.2) {
        ctx.beginPath();
        const tickR0 = (WRLD.rOut + 14) * k;
        const tickScale = clamp(k / 0.4, 0.7, 1.4);
        for (let deg = 0; deg < 360; deg += 5) {
          const a = (deg * Math.PI) / 180;
          const ca = Math.cos(a), sa = Math.sin(a);
          const len = (deg % 30 === 0 ? 7 : 3.5) * tickScale;
          ctx.moveTo(cx0 + tickR0 * ca, cy0 + tickR0 * sa);
          ctx.lineTo(cx0 + (tickR0 + len) * ca, cy0 + (tickR0 + len) * sa);
        }
        ctx.strokeStyle = alpha(T.fg3, T.dark ? 0.24 : 0.22);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      if (k > 0.34 && k < 3.2) {
        ctx.font = `600 8px ${T.mono}`;
        ctx.textAlign = 'center';
        const moatR = (WRLD.rCore + 12) * k;
        const whispers = [
          [-0.42, -0.906, 'CELL & COERCIVE SUPPLY', T.amber],
          [0.95, 0.30, 'BLOW-UP ON R³ & T³', T.good],
          [-0.55, 0.835, 'CERTIFICATE & FIXED POINT', T.blue],
        ];
        for (let i = 0; i < 3; i++) {
          const [ca, sa, txt, col] = whispers[i];
          const lx = cx0 + moatR * ca, ly = cy0 + moatR * sa;
          if (lx > 20 && lx < w - 20 && ly > 36 && ly < H - 44) {
            ctx.fillStyle = alpha(col, T.dark ? 0.56 : 0.62);
            ctx.fillText(txt, lx, ly + 3);
          }
        }
      }

      const rInK = (WRLD.rIn - 6) * k, rOutK = (WRLD.rOut + 14) * k, rArcK = (WRLD.rOut + 18) * k;
      for (let ti = 0; ti < terrs.length; ti++) {
        const tb = terrs[ti], tm = terrMid[ti], col = terrCols[ti];
        const isSelTerr = (hasDirSel && clusters[S.selDir][1] === ti) || (hasFileSel && fileTerr[S.selFile] === ti);
        const isHovTerr = S.hovTerr === ti;
        ctx.beginPath();
        ctx.arc(cx0, cy0, rOutK, tb.a0, tb.a1);
        ctx.arc(cx0, cy0, rInK, tb.a1, tb.a0, true);
        ctx.closePath();
        ctx.fillStyle = alpha(col, isSelTerr || isHovTerr ? (T.dark ? 0.095 : 0.068) : (T.dark ? 0.026 : 0.020));
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx0, cy0, rArcK, tb.a0, tb.a1);
        ctx.strokeStyle = alpha(col, isSelTerr || isHovTerr ? 1.0 : (hasDirSel ? 0.26 : 0.76));
        ctx.lineWidth = isSelTerr || isHovTerr ? 3.5 : 2.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx0 + rInK * tm.ca0, cy0 + rInK * tm.sa0);
        ctx.lineTo(cx0 + rOutK * tm.ca0, cy0 + rOutK * tm.sa0);
        ctx.strokeStyle = alpha(T.line2, T.dark ? 0.42 : 0.52);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // ---- 2. TWO-LAYER ASTROPHOTOGRAPHY: Nebula Bloom + Baked 6,570-edge Web + ALL 2,270 Stars!
      const bx = toSX(-BAKE_R), by = toSY(-BAKE_R), bw = 2 * BAKE_R * k;
      ctx.save();
      ctx.globalAlpha = hasDirSel ? 0.26 : hasFileSel ? 0.40 : 1.0;
      ctx.drawImage(nebCanvas, bx, by, bw, bw);
      ctx.restore();

      if (k < 1.35 && !hasDirSel && !hasFileSel) {
        ctx.save();
        ctx.globalAlpha = casActive && cas < 0.45 ? 0.80 : 1.0;
        ctx.drawImage(starCanvas, bx, by, bw, bw);
        ctx.restore();
      } else {
        // Draw faint ambient web + crisp live interactive vector stars for all 2,270 modules!
        ctx.save();
        ctx.globalAlpha = hasDirSel ? 0.22 : hasFileSel ? 0.30 : 0.45;
        ctx.drawImage(starCanvas, bx, by, bw, bw);
        ctx.restore();

        const starScale = clamp(Math.pow(k / 1.2, 0.36), 0.75, 1.95);
        for (let i = 0; i < NF; i++) {
          const f = files[i];
          const sx = f[5] * k + ox, sy = f[6] * k + oy;
          if (sx < -10 || sx > w + 10 || sy < -10 || sy > H + 10) continue;
          const lf = litFile[i];
          if ((hasDirSel || hasFileSel) && !lf && k < 1.35) continue;
          const col = lf === 3 ? T.amber : lf === 2 ? T.blue : terrCols[fileTerr[i]];
          const r = fileRad[i] * starScale * (lf === 2 ? 1.55 : lf ? 1.15 : 0.85);
          ctx.fillStyle = alpha(col, (!hasDirSel && !hasFileSel) || lf ? (T.dark ? 0.92 : 0.84) : 0.22);
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ---- 3. Subtle Semantic Cluster Branches
      const treeDim = hasDirSel || hasFileSel ? 0.18 : 0.48;
      for (let ti = 0; ti < terrs.length; ti++) {
        const col = terrCols[ti], list = clByTerr[ti];
        ctx.beginPath();
        for (let j = 0; j < list.length; j++) {
          const i = list[j], c = clusters[i], pi = c[0];
          if (pi < 0) continue;
          const p = clusters[pi];
          ctx.moveTo(p[5] * k + ox, p[6] * k + oy);
          ctx.lineTo(c[5] * k + ox, c[6] * k + oy);
        }
        ctx.strokeStyle = alpha(col, (T.dark ? 0.22 : 0.16) * treeDim);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // ---- 4. Luminous Host Bridge Fibers (116 Spine Theorems <-> 2,270-Star Ring)
      const casBridgeGlow = casActive ? Math.max(0, 1 - Math.abs(cas - 0.39) * 5.2) : 0;
      ctx.beginPath();
      for (let i = 0; i < NT; i++) {
        const t = thms[i];
        if (t.fi < 0) continue;
        const onCone = (hasThmSel && (i === S.selThm || ancThm[i] || descThm[i])) || ((hasDirSel || hasFileSel) && descThm[i]);
        if (onCone && !casActive) continue;
        const f = files[t.fi];
        const ax = f[5] * k + ox, ay = f[6] * k + oy, bx0 = t.x * k + ox, by0 = t.y * k + oy;
        const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.24;
        const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.24;
        ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
      }
      ctx.strokeStyle = casBridgeGlow > 0.05
        ? alpha(T.amber, 0.10 + casBridgeGlow * 0.55)
        : alpha(T.fg3, T.dark ? 0.085 : 0.068);
      ctx.lineWidth = 0.65 + casBridgeGlow * 1.1;
      ctx.stroke();

      if (!casActive) {
        for (let i = 0; i < NT; i++) {
          const t = thms[i];
          if (t.fi < 0) continue;
          const isPrimary = hasThmSel && i === S.selThm;
          const isAnc = hasThmSel && ancThm[i];
          const isDesc = (hasThmSel || hasDirSel || hasFileSel) && descThm[i];
          if (!isPrimary && !isAnc && !isDesc) continue;
          const f = files[t.fi];
          const ax = f[5] * k + ox, ay = f[6] * k + oy, bx0 = t.x * k + ox, by0 = t.y * k + oy;
          const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.24;
          const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.24;
          const col = isPrimary ? T.blue : isAnc ? T.amber : T.blue;
          ctx.save();
          if (!isPrimary) ctx.setLineDash([2.5, 3]);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
          ctx.strokeStyle = alpha(col, isPrimary ? 0.78 : 0.26);
          ctx.lineWidth = isPrimary ? 1.7 : 0.9;
          ctx.stroke(); ctx.restore();
          ctx.beginPath(); ctx.arc(ax, ay, isPrimary ? 5.0 : 3.0, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }

      // ---- 4B. LIVE BIDIRECTIONAL FILE IMPORT (AMBER) & CALLER (BLUE) ARCS FOR ANY OF THE 2,270 STARS!
      const photons = [];
      if (!casActive && (hasFileSel || (hasThmSel && S.drawerOpen && thms[S.selThm].fi >= 0))) {
        const fi = hasFileSel ? S.selFile : thms[S.selThm].fi;
        const srcX = hasFileSel ? toSX(files[fi][5]) : toSX(thms[S.selThm].x);
        const srcY = hasFileSel ? toSY(files[fi][6]) : toSY(thms[S.selThm].y);
        const imps = files[fi][7];
        for (let i = 0; i < imps.length && i < 28; i++) {
          const g = files[imps[i]];
          const ax = g[5] * k + ox, ay = g[6] * k + oy;
          const mx = (ax + srcX) * 0.5 + (cx0 - (ax + srcX) * 0.5) * 0.20;
          const my = (ay + srcY) * 0.5 + (cy0 - (ay + srcY) * 0.5) * 0.20;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, srcX, srcY);
          ctx.strokeStyle = alpha(T.amber, T.dark ? 0.20 : 0.14); ctx.lineWidth = 4.0; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, srcX, srcY);
          ctx.strokeStyle = alpha(T.amber, 0.86); ctx.lineWidth = 1.3; ctx.stroke();
          photons.push([ax, ay, mx, my, srcX, srcY, T.amber]);
          ctx.beginPath(); ctx.arc(ax, ay, 4.0, 0, Math.PI * 2);
          ctx.fillStyle = T.amber; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.2; ctx.stroke();
        }
        if (hasFileSel) {
          const callers = fileCallers[fi];
          for (let i = 0; i < callers.length && i < 22; i++) {
            const g = files[callers[i]];
            const bx0 = g[5] * k + ox, by0 = g[6] * k + oy;
            const mx = (srcX + bx0) * 0.5 + (cx0 - (srcX + bx0) * 0.5) * 0.20;
            const my = (srcY + by0) * 0.5 + (cy0 - (srcY + by0) * 0.5) * 0.20;
            ctx.beginPath(); ctx.moveTo(srcX, srcY); ctx.quadraticCurveTo(mx, my, bx0, by0);
            ctx.strokeStyle = alpha(T.blue, T.dark ? 0.18 : 0.13); ctx.lineWidth = 3.8; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(srcX, srcY); ctx.quadraticCurveTo(mx, my, bx0, by0);
            ctx.strokeStyle = alpha(T.blue, 0.82); ctx.lineWidth = 1.25; ctx.stroke();
            photons.push([srcX, srcY, mx, my, bx0, by0, T.blue]);
            ctx.beginPath(); ctx.arc(bx0, by0, 3.8, 0, Math.PI * 2);
            ctx.fillStyle = T.blue; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.2; ctx.stroke();
          }
        }
      }

      // ---- 5. All 265 Real Spine Dependency Arcs spiraling into Solution.lean
      const hovThm = S.hovType === 'thm' ? S.hovIdx : -1;
      for (let ei = 0; ei < edges.length; ei++) {
        const [u, v] = edges[ei];
        const a = thms[u], b = thms[v];
        const ax = a.x * k + ox, ay = a.y * k + oy, bx0 = b.x * k + ox, by0 = b.y * k + oy;
        if ((ax < -40 && bx0 < -40) || (ax > w + 40 && bx0 > w + 40) || (ay < -40 && by0 < -40) || (ay > H + 40 && by0 > H + 40)) continue;
        const mx = (ax + bx0) * 0.5 + (cx0 - (ax + bx0) * 0.5) * 0.26;
        const my = (ay + by0) * 0.5 + (cy0 - (ay + by0) * 0.5) * 0.26;

        if (casActive) {
          const lit = a.h >= waveH - 0.5;
          const fresh = Math.max(0, 1 - Math.abs(a.h - waveH) * 0.55);
          if (lit) {
            const col = fresh > 0.3 ? T.blue : T.amber;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
            ctx.strokeStyle = alpha(col, 0.14 + fresh * 0.26); ctx.lineWidth = 4.0 + fresh * 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
            ctx.strokeStyle = alpha(col, 0.72 + fresh * 0.28); ctx.lineWidth = 1.45 + fresh * 0.65; ctx.stroke();
            if (fresh > 0.15) photons.push([ax, ay, mx, my, bx0, by0, col]);
          } else {
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
            ctx.strokeStyle = alpha(T.fg3, 0.11); ctx.lineWidth = 0.7; ctx.stroke();
          }
          continue;
        }

        const isUp = hasThmSel && ((v === S.selThm && ancThm[u]) || (ancThm[v] && ancThm[u]));
        const isDn = (hasThmSel && ((u === S.selThm && descThm[v]) || (descThm[u] && descThm[v]))) ||
                     ((hasDirSel || hasFileSel) && descThm[u] && descThm[v]);
        const isHovEdge = hovThm >= 0 && (u === hovThm || v === hovThm);

        if (isUp || isDn) {
          const col = isUp ? T.amber : T.blue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
          ctx.strokeStyle = alpha(col, T.dark ? 0.15 : 0.11); ctx.lineWidth = 4.0; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
          ctx.strokeStyle = alpha(col, 0.85); ctx.lineWidth = 1.45; ctx.stroke();
          if (ei % 2 === 0 || isDn) photons.push([ax, ay, mx, my, bx0, by0, col]);
        } else if (isHovEdge) {
          const col = v === hovThm ? T.amber : T.blue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
          ctx.strokeStyle = alpha(col, 0.72); ctx.lineWidth = 1.4; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx0, by0);
          ctx.strokeStyle = alpha(T.fg3, T.dark ? 0.16 : 0.13);
          ctx.lineWidth = 0.75; ctx.stroke();
        }
      }

      // Fast animated photons
      S.lastPhotons = photons.length;
      const coreCol = T.dark ? '#ffffff' : T.bg;
      for (let i = 0; i < photons.length; i++) {
        const [ax, ay, mx, my, bx0, by0, col] = photons[i];
        const t = (S.phase + (i % 7) * 0.143) % 1;
        const [px, py] = quadPt(ax, ay, mx, my, bx0, by0, t);
        if (px < -10 || px > w + 10 || py < -10 || py > H + 10) continue;
        ctx.fillStyle = alpha(col, 0.28);
        ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = coreCol;
        ctx.beginPath(); ctx.arc(px, py, 1.1, 0, Math.PI * 2); ctx.fill();
      }

      // ---- 6. All 116 Verified Spine Declarations + Blazing Solution.lean Core Singularity
      const thmScale = clamp(Math.pow(k / 0.40, 0.30), 0.84, 1.75);
      for (let i = 0; i < NT; i++) {
        const t = thms[i];
        const sx = t.x * k + ox, sy = t.y * k + oy;
        if (sx < -24 || sx > w + 24 || sy < -24 || sy > H + 24) continue;
        const isMain = t.id === 'sol-both', isExp = t.k === 'export';
        const isSel = !casActive && hasThmSel && i === S.selThm;
        const isHov = i === hovThm;
        const isAnc = !casActive && hasThmSel && ancThm[i];
        const isDesc = !casActive && (hasThmSel || hasDirSel || hasFileSel) && descThm[i];
        const casLit = casActive && t.h >= waveH - 0.5;
        const casPeak = casActive ? Math.max(0, 1 - Math.abs(t.h - waveH) * 0.65) : 0;
        const onCone = isSel || isAnc || isDesc || casLit;
        const col = isMain || isExp ? T.blue : casPeak > 0.35 ? T.blue : isSel ? T.blue : (isAnc || casLit) ? T.amber : isDesc ? T.blue : stratColMap[t.s] || T.fg2;
        const r = (isMain ? 8.5 : isExp ? 5.2 : isSel ? 6.4 : casPeak > 0.35 ? 5.8 : onCone ? 4.3 : 3.3) * thmScale;

        if (isMain) {
          const boost = casActive && cas > 0.88 ? 1 + (cas - 0.88) * 10 : 1;
          const corona = ctx.createRadialGradient(sx, sy, 2, sx, sy, r * 4.8 * Math.min(1.8, boost));
          corona.addColorStop(0, alpha(T.blue, T.dark ? 0.70 : 0.45));
          corona.addColorStop(0.4, alpha(T.blue, T.dark ? 0.24 : 0.14));
          corona.addColorStop(1, alpha(T.blue, 0));
          ctx.fillStyle = corona; ctx.beginPath(); ctx.arc(sx, sy, r * 4.8 * Math.min(1.8, boost), 0, Math.PI * 2); ctx.fill();
        } else if (isSel || isExp || casPeak > 0.35) {
          ctx.fillStyle = alpha(col, 0.22);
          ctx.beginPath(); ctx.arc(sx, sy, r * 2.4, 0, Math.PI * 2); ctx.fill();
        }
        if (isHov && !isSel) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 4.8, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(col, 0.85); ctx.lineWidth = 1.5; ctx.stroke();
        }

        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isMain ? (T.dark ? '#ffffff' : T.blue) : (isSel || isExp || onCone ? col : T.bg);
        ctx.fill();
        ctx.lineWidth = isMain ? 2.5 : isSel ? 2.0 : onCone ? 1.3 : 1.1;
        ctx.strokeStyle = isMain ? T.blue : (isSel || isExp || onCone ? T.bg : alpha(col, hasThmSel || hasDirSel || hasFileSel ? 0.40 : 0.84));
        ctx.stroke();
      }

      // ---- 6A. Selected, Hovered & Drawer-Peek Reticles
      if (hasFileSel) {
        const f = files[S.selFile], sx = toSX(f[5]), sy = toSY(f[6]);
        const pulse = 1 + 0.16 * Math.sin(S.phase * Math.PI * 4);
        ctx.fillStyle = alpha(T.blue, 0.26);
        ctx.beginPath(); ctx.arc(sx, sy, 15 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, sy, 9.5 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(T.blue, 0.92); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, Math.PI * 2);
        ctx.fillStyle = T.dark ? '#ffffff' : T.blue; ctx.fill();
        ctx.strokeStyle = T.blue; ctx.lineWidth = 1.6; ctx.stroke();
      }
      if (S.hovType === 'file' && S.hovIdx >= 0) {
        const f = files[S.hovIdx], sx = f[5] * k + ox, sy = f[6] * k + oy;
        ctx.beginPath(); ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(T.dark ? '#ffffff' : T.blue, 0.9); ctx.lineWidth = 1.4; ctx.stroke();
      }
      if (S.peekPt) {
        const sx = toSX(S.peekPt.x), sy = toSY(S.peekPt.y);
        if (sx > -20 && sx < w + 20 && sy > -20 && sy < H + 20) {
          ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(T.amber, 0.92); ctx.lineWidth = 1.8; ctx.stroke();
          if (S.peekPt.label) haloText(ctx, S.peekPt.label, sx, sy - 16, T.amber, T.bg, 'center', `700 10px ${T.mono}`);
        }
      }

      // ---- 6B. Cinematic Cascade Wavefront Ring & Dual Q.E.D. Shockwave
      if (casActive) {
        if (cas < 0.90 && waveR > 10) {
          const wr = waveR * k;
          const r0 = Math.max(0, wr - 22), r1 = wr + 22;
          const peak = clamp((wr - r0) / Math.max(1, r1 - r0), 0.05, 0.95);
          const waveCol = cas < 0.42 ? T.amber : T.blue;
          const wg = ctx.createRadialGradient(cx0, cy0, r0, cx0, cy0, r1);
          wg.addColorStop(0, alpha(waveCol, 0));
          wg.addColorStop(peak, alpha(waveCol, T.dark ? 0.48 : 0.36));
          wg.addColorStop(1, alpha(waveCol, 0));
          ctx.strokeStyle = wg; ctx.lineWidth = 26;
          ctx.beginPath(); ctx.arc(cx0, cy0, wr, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = alpha(T.dark ? '#ffffff' : waveCol, 0.88);
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(cx0, cy0, wr, 0, Math.PI * 2); ctx.stroke();
        }
        if (cas >= 0.86) {
          const p = clamp((cas - 0.86) / 0.14, 0, 1);
          const shockR = (14 + p * 360) * k;
          const echoR = (10 + Math.max(0, p - 0.18) * 260) * k;
          ctx.strokeStyle = alpha(T.blue, (1 - p) * 0.92);
          ctx.lineWidth = 3.2 * (1 - p) + 0.9;
          ctx.beginPath(); ctx.arc(cx0, cy0, shockR, 0, Math.PI * 2); ctx.stroke();
          if (p > 0.18) {
            ctx.strokeStyle = alpha(T.amber, (1 - p) * 0.65);
            ctx.lineWidth = 1.6 * (1 - p) + 0.5;
            ctx.beginPath(); ctx.arc(cx0, cy0, echoR, 0, Math.PI * 2); ctx.stroke();
          }
          haloText(ctx, 'Q.E.D. (conditional) · 6 comparators · 3 axioms', cx0, cy0 + 28 * thmScale, T.blue, T.bg, 'center', `700 10.5px ${T.mono}`);
        }
      }

      // ---- 7. Crisp Collision-Free Labels
      if (hasFileSel) {
        const f = files[S.selFile], sx = toSX(f[5]), sy = toSY(f[6]);
        const lbl = `${fileStem(S.selFile)}.lean`, fnt = `700 10.5px ${T.mono}`, tw = measureW(fnt, lbl);
        tryPlace(sx - tw / 2, sy - 24, sx + tw / 2, sy - 10);
        haloText(ctx, lbl, sx, sy - 14, T.fg, T.bg, 'center', fnt);
        const impFnt = `600 8.8px ${T.mono}`;
        for (let i = 0; i < f[7].length && i < 8; i++) {
          const g = files[f[7][i]], ix = toSX(g[5]), iy = toSY(g[6]);
          const ilbl = fileStem(f[7][i]), itw = measureW(impFnt, ilbl);
          if (tryPlace(ix - itw / 2, iy + 6, ix + itw / 2, iy + 17)) {
            haloText(ctx, ilbl, ix, iy + 15, T.amber, T.bg, 'center', impFnt);
          }
        }
      } else if (hasThmSel) {
        const t = thms[S.selThm], sx = toSX(t.x), sy = toSY(t.y);
        const lbl = t.id === 'sol-both' ? 'Solution.lean · 6 comparators' : (LANDMARK_THMS.get(t.id) || t.d.split('.').slice(-1)[0]);
        const fnt = `700 11px ${T.sans}`, tw = measureW(fnt, lbl);
        const ly = t.id === 'sol-both' ? sy - 16 : sy - 11;
        tryPlace(sx - tw / 2, ly - 11, sx + tw / 2, ly + 2);
        haloText(ctx, lbl, sx, ly, T.fg, T.bg, 'center', fnt);
      } else if (hasDirSel) {
        const cl = clusters[S.selDir], sx = toSX(cl[5]), sy = toSY(cl[6]);
        const lbl = `${cl[7]} (${num(cl[2])})`, fnt = `700 11px ${T.sans}`, tw = measureW(fnt, lbl);
        tryPlace(sx - tw / 2, sy - 20, sx + tw / 2, sy - 7);
        haloText(ctx, lbl, sx, sy - 10, T.fg, T.bg, 'center', fnt);
      }

      // Outer 12 Territory Labels
      const rimR = (WRLD.rOut + 28) * k;
      const compactRim = w < 640;
      const tFontPx = clamp((compactRim ? 8.4 : 9.6) * Math.pow(k / 0.40, 0.2), 8.2, 12.2);
      const tFnt = `700 ${tFontPx.toFixed(1)}px ${T.sans}`;
      for (let ti = 0; ti < terrs.length; ti++) {
        const tm = terrMid[ti], col = terrCols[ti];
        const lx = cx0 + rimR * tm.ca, ly = cy0 + rimR * tm.sa;
        const fullLbl = compactRim ? tm.shortLbl : tm.fullLbl;
        const tw = measureW(tFnt, fullLbl);
        const bx0 = tm.rightSide ? lx : lx - tw;
        if (tryPlace(bx0, ly - tFontPx, bx0 + tw, ly + 3)) {
          haloText(ctx, fullLbl, lx, ly + 3, alpha(col, T.dark ? 0.96 : 0.92), T.bg, tm.rightSide ? 'left' : 'right', tFnt);
        }
      }

      // Top Prefix-Family Clusters inside the outer ring
      const mFnt = `600 8.8px ${T.mono}`;
      for (let m = 0; m < megaLabels.length; m++) {
        const ml = megaLabels[m];
        if (k < 0.52 && m >= 6) break;
        const sx = ml.x * k + ox, sy = ml.y * k + oy;
        const lbl = `${ml.label} (${ml.files})`;
        const tw = measureW(mFnt, lbl);
        const inwardRight = sx < cx0 - 25;
        const lx = inwardRight ? sx + 10 : sx - 10;
        const bx0 = inwardRight ? lx : lx - tw;
        if (tryPlace(bx0, sy - 6, bx0 + tw, sy + 6)) {
          haloText(ctx, lbl, lx, sy + 3, alpha(T.fg, T.dark ? 0.88 : 0.82), T.bg, inwardRight ? 'left' : 'right', mFnt);
        }
      }

      // Landmark theorems
      for (const [id, lbl] of LANDMARK_THMS) {
        const idx = thmById.get(id);
        if (idx === undefined || (hasThmSel && idx === S.selThm)) continue;
        const t = thms[idx], sx = t.x * k + ox, sy = t.y * k + oy;
        const onCone = (hasThmSel && (ancThm[idx] || descThm[idx])) || ((hasDirSel || hasFileSel) && descThm[idx]);
        const fnt = `${id === 'sol-both' || onCone ? '600' : '500'} ${id === 'sol-both' ? 10.5 : 9.2}px ${T.sans}`;
        const tw = measureW(fnt, lbl);
        const ly = sy + 14;
        if (tryPlace(sx - tw / 2, ly - 10, sx + tw / 2, ly + 2)) {
          haloText(ctx, lbl, sx, ly, id === 'sol-both' ? T.blue : onCone ? T.fg2 : alpha(T.fg3, 0.82), T.bg, 'center', fnt);
        }
      }

      // Deep-zoom semantic LOD labels (spine theorems + individual .lean filenames!)
      if (k > 0.78) {
        const lodFnt = `500 9.2px ${T.sans}`;
        for (let i = 0; i < NT; i++) {
          if (hasThmSel && i === S.selThm) continue;
          const t = thms[i], sx = t.x * k + ox, sy = t.y * k + oy;
          if (sx < 8 || sx > w - 8 || sy < 30 || sy > H - 40) continue;
          const lbl = t.d.split('.').slice(-1)[0], tw = measureW(lodFnt, lbl);
          if (tryPlace(sx - tw / 2, sy + 5, sx + tw / 2, sy + 16)) {
            haloText(ctx, lbl, sx, sy + 14, T.fg2, T.bg, 'center', lodFnt);
          }
        }
      }
      if (k > 1.45) {
        const fFnt = `500 8.6px ${T.mono}`;
        const cap = k > 3.0 ? 180 : 70;
        let shown = 0;
        for (let i = 0; i < NF && shown < cap; i++) {
          if (hasFileSel && i === S.selFile) continue;
          const f = files[i];
          if (k < 2.5 && f[2] < 240) continue;
          const sx = f[5] * k + ox, sy = f[6] * k + oy;
          if (sx < 8 || sx > w - 8 || sy < 30 || sy > H - 42) continue;
          const lbl = fileStem(i), tw = measureW(fFnt, lbl);
          if (tryPlace(sx - tw / 2, sy + 5, sx + tw / 2, sy + 15)) {
            haloText(ctx, lbl, sx, sy + 13, alpha(T.fg2, 0.88), T.bg, 'center', fFnt);
            shown++;
          }
        }
      }

      // ---- 8. Floating hover tooltip
      if (S.hovType === 'thm' && S.hovIdx >= 0) {
        const t = thms[S.hovIdx];
        drawTooltip(toSX(t.x), toSY(t.y), t.t, `${t.d} · ${t.anc} prereqs → ${t.desc} downstream`, w, H, T);
      } else if (S.hovType === 'file' && S.hovIdx >= 0) {
        const f = files[S.hovIdx];
        drawTooltip(toSX(f[5]), toSY(f[6]), `${fileStem(S.hovIdx)}.lean`,
          `${f[0]} · ${num(f[2])} lines · ${f[7].length} imports · ${fileCallers[S.hovIdx].length} callers`, w, H, T);
      } else if (S.hovType === 'dir' && S.hovIdx >= 0) {
        const cl = clusters[S.hovIdx];
        drawTooltip(toSX(cl[5]), toSY(cl[6]), cl[7],
          `${num(cl[2])} .lean files · ${num(cl[4])} lines · click to browse proofs`, w, H, T);
      } else if (S.hovTerr >= 0) {
        const tb = terrs[S.hovTerr], tm = terrMid[S.hovTerr];
        const tx = cx0 + (WRLD.rOut - 40) * k * tm.ca;
        const ty = cy0 + (WRLD.rOut - 40) * k * tm.sa;
        drawTooltip(tx, ty, tb.label, `${num(tb.files)} .lean files (${tb.pct}%) · ${num(tb.lines)} lines · click to dive in`, w, H, T);
      }

      // ---- 9. Update single-line inspector footer & drawer
      if (updateDom || S.dirtyDom) {
        S.dirtyDom = false;
        cascadeBtn.setAttribute('aria-pressed', String(casActive));
        cascadeBtn.textContent = casActive ? '● Playing' : '▶ Cascade';
        const curId = hasThmSel ? thms[S.selThm].id : hasDirSel && clusters[S.selDir][0] < 0 ? terrs[clusters[S.selDir][1]].id : '';
        all('[data-jump]', hudBot).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.jump === curId)));

        if (hasFileSel) {
          const f = files[S.selFile], rel = fileRelPath(S.selFile), stem = fileStem(S.selFile);
          footEl.innerHTML =
            `<span><strong>${esc(stem)}.lean</strong></span>` +
            `<span class="ink">${esc(f[0])} · ${num(f[2])} lines · ${f[3]} thms · <strong class="amber">${f[7].length}</strong> imports · <strong class="blue">${fileCallers[S.selFile].length}</strong> callers</span>` +
            `<span><a href="${esc(`${GH_BLOB}/${rel}.lean`)}" target="_blank" rel="noopener">GitHub</a></span>` +
            `<button type="button" class="ns-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide proof ✕' : 'Read proof { }'}</button>`;
        } else if (hasThmSel) {
          const t = thms[S.selThm];
          footEl.innerHTML =
            `<span><strong>${esc(t.t)}</strong></span>` +
            `<span class="ink">${esc(t.g)}</span>` +
            `<span><strong class="amber">${t.anc}</strong> prereqs → <strong class="blue">${t.desc}</strong> downstream</span>` +
            (t.u ? `<span class="ns-decl-link"><a href="${esc(t.u)}" target="_blank" rel="noopener" title="${esc(t.d)}"><code>${esc(t.d)}</code></a></span>` : '') +
            `<button type="button" class="ns-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide proof ✕' : 'Lean proof { }'}</button>`;
        } else if (hasDirSel) {
          const cl = clusters[S.selDir];
          const url = cl[8] ? `${GH_TREE}/${cl[8]}` : GH_TREE;
          footEl.innerHTML =
            `<span><strong>${esc(cl[7])}</strong></span>` +
            `<span class="ink"><strong>${num(cl[2])}</strong> .lean files (${num(cl[4])} lines) · click any star to trace imports and read proof</span>` +
            `<span><a href="${esc(url)}" target="_blank" rel="noopener">GitHub</a></span>` +
            `<button type="button" class="ns-code-toggle" data-toggle-drawer aria-pressed="${S.drawerOpen}">${S.drawerOpen ? 'Hide files ✕' : `Browse ${num(cl[2])} proofs { }`}</button>`;
        }
        renderDrawer();
      }
    }

    function drawTooltip(sx, sy, line1, line2, w, H, T) {
      const f1 = `600 10.5px ${T.sans}`, f2 = `500 9.5px ${T.mono}`;
      const w1 = measureW(f1, line1), w2 = measureW(f2, line2);
      const bw = Math.min(w - 20, Math.max(w1, w2) + 18), bh = 36;
      const bx = clamp(sx + 12, 8, w - bw - 8);
      const by = sy - bh - 12 < 42 ? sy + 14 : sy - bh - 12;
      ctx.save();
      ctx.shadowColor = T.dark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.16)';
      ctx.shadowBlur = 14; ctx.fillStyle = T.fg;
      rrect(ctx, bx, by, bw, bh, 6); ctx.fill(); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = T.bg;
      ctx.font = f1; ctx.fillText(line1, bx + 9, by + 15, bw - 18);
      ctx.fillStyle = alpha(T.bg, 0.78);
      ctx.font = f2; ctx.fillText(line2, bx + 9, by + 29, bw - 18);
    }

    // --------------------------------------------------- picking & multi-touch
    function pick(mx, my) {
      const { k, ox, oy } = view;
      let bestT = -1, bestTD = 15;
      for (let i = 0; i < NT; i++) {
        const d = Math.hypot(thms[i].x * k + ox - mx, thms[i].y * k + oy - my);
        if (d < bestTD) { bestTD = d; bestT = i; }
      }
      if (bestT >= 0) return { type: 'thm', idx: bestT, terr: -1 };

      // Pick ANY of the 2,270 individual .lean stars (works even at moderate zoom k >= 0.75!)
      const wx = (mx - ox) / k, wy = (my - oy) / k;
      if (k >= 0.75 || S.selType === 'file') {
        const thr = (k >= 1.2 ? 11 : 8) / k;
        let bestF = -1, bestFD2 = thr * thr;
        for (let i = 0; i < NF; i++) {
          const dx = files[i][5] - wx;
          if (dx > thr || dx < -thr) continue;
          const dy = files[i][6] - wy;
          if (dy > thr || dy < -thr) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestFD2) { bestFD2 = d2; bestF = i; }
        }
        if (bestF >= 0) return { type: 'file', idx: bestF, terr: fileTerr[bestF] };
      }

      let bestC = -1, bestCD = 13;
      for (let i = 0; i < NC; i++) {
        const dist = Math.hypot(clusters[i][5] * k + ox - mx, clusters[i][6] * k + oy - my);
        if (dist < bestCD) { bestCD = dist; bestC = i; }
      }
      if (bestC >= 0) return { type: 'dir', idx: bestC, terr: clusters[bestC][1] };

      const rad = Math.hypot(wx, wy);
      if (rad >= WRLD.rIn - 10 && rad <= WRLD.rOut + 42) {
        let ang = Math.atan2(wy, wx);
        if (ang < 0) ang += Math.PI * 2;
        for (let ti = 0; ti < terrs.length; ti++) {
          const tb = terrs[ti];
          let a = ang;
          if (a < tb.a0) a += Math.PI * 2;
          if (a >= tb.a0 && a <= tb.a1) {
            const rootC = clByTerrRoot.get(tb.id);
            return { type: 'terr', idx: rootC !== undefined ? rootC : -1, terr: ti };
          }
        }
      }
      return null;
    }

    const pointers = new Map();
    let dragging = false, panMoved = false, lastPt = [0, 0], lastDragTs = 0, pinchDist = 0;
    let pendingHoverPt = null, hoverPrefetchTimer = 0;

    canvas.addEventListener('pointerdown', ev => {
      canvas.setPointerCapture?.(ev.pointerId);
      const pt = ptOf(canvas, ev);
      pointers.set(ev.pointerId, pt);
      S.vel.x = 0; S.vel.y = 0; S.camTarget = null;
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinchDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        panMoved = true;
      } else {
        dragging = true; panMoved = false; lastPt = pt; lastDragTs = performance.now();
        canvas.classList.add('dragging');
      }
    });

    canvas.addEventListener('pointermove', ev => {
      const pt = ptOf(canvas, ev);
      if (pointers.has(ev.pointerId)) {
        pointers.set(ev.pointerId, pt);
        if (pointers.size === 2) {
          const [p1, p2] = [...pointers.values()];
          const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          if (pinchDist > 4 && d > 4) smoothZoomBy(d / pinchDist, (p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5, true);
          pinchDist = d;
          return;
        }
        if (dragging) {
          const now = performance.now();
          const dt = Math.max(0.004, Math.min(0.05, (now - lastDragTs) / 1000));
          const dx = pt[0] - lastPt[0], dy = pt[1] - lastPt[1];
          if (Math.abs(dx) + Math.abs(dy) > 2) panMoved = true;
          const wx = -dx / S.cam.k, wy = -dy / S.cam.k;
          S.cam.x += wx; S.cam.y += wy;
          S.vel.x = S.vel.x * 0.55 + (wx / dt) * 0.45;
          S.vel.y = S.vel.y * 0.55 + (wy / dt) * 0.45;
          lastPt = pt; lastDragTs = now;
          requestDraw();
          return;
        }
      }
      pendingHoverPt = pt;
      requestDraw();
    });

    const endPtr = ev => {
      const wasClick = pointers.size === 1 && dragging && !panMoved;
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
        const pk = pick(...ptOf(canvas, ev));
        if (pk) {
          if (pk.type === 'thm') selectTheorem(pk.idx, { fit: false });
          else if (pk.type === 'file') selectFile(pk.idx, { openDrawer: true, fit: false });
          else if (pk.type === 'terr' && pk.idx >= 0) selectCluster(pk.idx, { fit: true });
          else if (pk.idx >= 0) selectCluster(pk.idx, { fit: false });
        }
      }
    };
    canvas.addEventListener('pointerup', endPtr);
    canvas.addEventListener('pointercancel', endPtr);

    canvas.addEventListener('pointerleave', () => {
      pendingHoverPt = null;
      clearTimeout(hoverPrefetchTimer);
      if (S.hovType !== null || S.hovTerr !== -1) {
        S.hovType = null; S.hovIdx = -1; S.hovTerr = -1;
        requestDraw();
      }
    });

    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      const dy = ev.deltaMode === 1 ? ev.deltaY * 18 : ev.deltaMode === 2 ? ev.deltaY * 180 : ev.deltaY;
      const sens = ev.ctrlKey ? 0.011 : 0.0024;
      smoothZoomBy(clamp(Math.exp(-dy * sens), 0.55, 1.85), ...ptOf(canvas, ev), false);
    }, { passive: false });

    canvas.addEventListener('dblclick', ev => {
      const pt = ptOf(canvas, ev);
      const pk = pick(pt[0], pt[1]);
      if (pk && pk.type === 'thm') { S.drawerOpen = true; selectTheorem(pk.idx, { fit: true }); }
      else if (pk && pk.type === 'dir' && pk.idx >= 0) { S.drawerOpen = true; selectCluster(pk.idx, { fit: true }); }
      else smoothZoomBy(2.15, pt[0], pt[1], false);
    });

    function triggerCascade() {
      S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0;
      if (S.cascade >= 0) { S.cascade = -1; S.dirtyDom = true; requestDraw(); return; }
      S.selType = 'thm'; S.selThm = defaultThm; S.selDir = -1; S.selFile = -1;
      rebuildMask();
      fitFullNow(true);
      S.cascade = 0.001;
      S.dirtyDom = true;
      requestDraw();
    }

    function setFullscreen(on) {
      S.fullscreen = on;
      fig.classList.toggle('ns-fullscreen', on);
      document.body.style.overflow = on ? 'hidden' : '';
      const btn = $('[data-hud="fs"]', hudBtns);
      if (btn) btn.textContent = on ? '✕' : '⤢';
      requestAnimationFrame(() => { syncStageSize(); fitFullNow(false); S.dirtyDom = true; requestDraw(); });
    }

    function toggleDrawer(force) {
      S.drawerOpen = force !== undefined ? force : !S.drawerOpen;
      if (S.drawerOpen) maybeLoadProof();
      S.dirtyDom = true; requestDraw();
    }

    cascadeBtn.addEventListener('click', triggerCascade);

    all('[data-hud]', hudBtns).forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.hud;
      if (a === 'zin') smoothZoomBy(1.55);
      else if (a === 'zout') smoothZoomBy(1 / 1.55);
      else if (a === 'fit') { fitSelection(true); requestDraw(); }
      else if (a === 'full') { S.cascade = -1; S.cascadeFreeze = false; fitFullNow(true); S.dirtyDom = true; requestDraw(); }
      else if (a === 'code') toggleDrawer();
      else if (a === 'fs') setFullscreen(!S.fullscreen);
    }));

    all('[data-jump]', hudBot).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.jump, jt = b.dataset.jtype;
      if (jt === 'thm' && thmById.has(id)) selectTheorem(thmById.get(id), { fit: true });
      else if (jt === 'terr' && clByTerrRoot.has(id)) selectCluster(clByTerrRoot.get(id), { fit: true });
    }));

    footEl.addEventListener('click', ev => {
      if (ev.target.closest('[data-toggle-drawer]')) toggleDrawer();
    });

    // ---- Drawer hover prefetch + live canvas spotlight + clicks
    drawerEl.addEventListener('pointerover', ev => {
      const bt = ev.target.closest('[data-jump-thm]');
      if (bt) {
        const t = thms[+bt.dataset.jumpThm];
        if (t) {
          S.peekPt = { x: t.x, y: t.y, label: t.d.split('.').slice(-1)[0] };
          if (t.m) loadLeanFile(t.m.replace(/\./g, '/'));
          requestDraw();
        }
        return;
      }
      const of = ev.target.closest('[data-open-file]');
      if (of) {
        const fi = +of.dataset.openFile, f = files[fi];
        if (f) {
          S.peekPt = { x: f[5], y: f[6], label: `${fileStem(fi)}.lean` };
          loadLeanFile(fileRelPath(fi));
          requestDraw();
        }
      }
    });
    drawerEl.addEventListener('pointerleave', () => {
      if (S.peekPt) { S.peekPt = null; requestDraw(); }
    });

    drawerEl.addEventListener('click', ev => {
      if (ev.target.closest('[data-close-drawer]')) { toggleDrawer(false); return; }
      if (ev.target.closest('[data-drawer-wide]')) { S.drawerWide = !S.drawerWide; S.dirtyDom = true; requestDraw(); return; }
      if (ev.target.closest('[data-drawer-back]')) { goBack(); return; }
      const tabBtn = ev.target.closest('[data-code-tab]');
      if (tabBtn) { S.codeTab = tabBtn.dataset.codeTab; if (S.codeTab === 'full') maybeLoadProof(); S.dirtyDom = true; requestDraw(); return; }
      if (ev.target.closest('[data-show-all-lines]')) { S.showAllLines = true; S.dirtyDom = true; requestDraw(); return; }
      const copyBtn = ev.target.closest('[data-copy-proof]');
      if (copyBtn) {
        const rel = activeRelPath(), entry = rel ? leanCache.get(rel) : null;
        if (entry && entry.text && navigator.clipboard) {
          navigator.clipboard.writeText(entry.text).then(() => {
            copyBtn.textContent = 'Copied ✓';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
          }).catch(() => {});
        }
        return;
      }
      if (ev.target.closest('[data-fit-imports]')) {
        const fi = S.selType === 'file' ? S.selFile : S.selType === 'thm' ? thms[S.selThm].fi : -1;
        if (fi < 0) return;
        const { rx, ry } = drawerLayout(stageW, stageH);
        const availW = Math.max(180, stageW - (rx ? rx + 24 : 50));
        const availH = Math.max(160, stageH - (ry ? ry + 56 : 92));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
        add(files[fi][5], files[fi][6]);
        for (const im of files[fi][7]) add(files[im][5], files[im][6]);
        const spanX = Math.max(180, (x1 - x0) + 120), spanY = Math.max(180, (y1 - y0) + 120);
        const k = clamp(Math.min(availW / spanX, availH / spanY), 0.30, 5.5);
        S.camTarget = { x: (x0 + x1) / 2 + (rx * 0.5) / k, y: (y0 + y1) / 2 + (ry * 0.5 + 10) / k, k };
        requestDraw();
        return;
      }
      const glBtn = ev.target.closest('[data-goto-line]');
      if (glBtn) { S.selLine = +glBtn.dataset.gotoLine; S.showAllLines = true; S.dirtyDom = true; requestDraw(); return; }
      const bt = ev.target.closest('[data-jump-thm]');
      if (bt) { selectTheorem(+bt.dataset.jumpThm); return; }
      const bd = ev.target.closest('[data-jump-dir]');
      if (bd) { selectCluster(+bd.dataset.jumpDir); return; }
      const of = ev.target.closest('[data-open-file]');
      if (of) { selectFile(+of.dataset.openFile, { openDrawer: true, fit: true }); return; }
      if (ev.target.closest('[data-more-files]')) {
        S.dirLimit += 120;
        if (S.selType === 'dir' && S.selDir >= 0) renderClusterFileList(S.selDir);
      }
    });

    drawerEl.addEventListener('input', ev => {
      const fi = ev.target.closest('[data-dir-filter]');
      if (!fi || S.selType !== 'dir' || S.selDir < 0) return;
      S.dirFilter = fi.value; S.dirLimit = 80;
      renderClusterFileList(S.selDir);
    });

    // ---- Instant Zero-Latency Global Search Popover (116 theorems + 95 clusters + ALL 2,270 files!)
    let searchHits = [], searchSel = 0;

    function runSearch(q) {
      const ql = q.trim().toLowerCase();
      if (ql.length < 2) { searchPop.hidden = true; searchHits = []; return; }
      const hits = [];
      for (let i = 0; i < NT && hits.length < 4; i++) {
        const t = thms[i];
        if (t.id.toLowerCase().includes(ql) || t.d.toLowerCase().includes(ql) || t.t.toLowerCase().includes(ql)) {
          hits.push({ kind: 'thm', idx: i, title: t.t, sub: t.d });
        }
      }
      for (let j = 0; j < NC && hits.length < 6; j++) {
        const i = clBySize[j], c = clusters[i];
        if (c[7].toLowerCase().includes(ql) || c[8].toLowerCase().includes(ql)) {
          hits.push({ kind: 'dir', idx: i, title: c[7], sub: `${c[8] || 'lean/'} · ${num(c[2])} files` });
        }
      }
      for (let i = 0; i < NF && hits.length < 10; i++) {
        if (files[i][0].toLowerCase().includes(ql)) {
          hits.push({ kind: 'file', idx: i, title: `${fileStem(i)}.lean`, sub: `${files[i][0]} · ${num(files[i][2])}L` });
        }
      }
      searchHits = hits; searchSel = 0; searchPop.hidden = false;
      searchPop.innerHTML = hits.length
        ? hits.map((h, i) =>
            `<button type="button" class="${i === 0 ? 'active' : ''}" data-sh="${i}">` +
              `<span class="sp-k ${h.kind}">${h.kind}</span>` +
              `<span class="sp-txt">${esc(h.title)}<span class="sp-sub">${esc(h.sub)}</span></span>` +
            `</button>`
          ).join('')
        : `<div class="ns-search-empty">No matches for “${esc(q)}”</div>`;
    }

    function activateSearchHit(h) {
      if (!h) return;
      searchPop.hidden = true; searchEl.blur();
      if (h.kind === 'thm') { S.drawerOpen = true; selectTheorem(h.idx); }
      else if (h.kind === 'dir') { S.drawerOpen = true; selectCluster(h.idx); }
      else if (h.kind === 'file') selectFile(h.idx, { openDrawer: true, fit: true });
    }

    searchEl.addEventListener('input', () => runSearch(searchEl.value));
    searchEl.addEventListener('focus', () => { if (searchEl.value.trim().length >= 2) runSearch(searchEl.value); });
    searchEl.addEventListener('keydown', ev => {
      if (searchPop.hidden || !searchHits.length) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); searchSel = (searchSel + 1) % searchHits.length; }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); searchSel = (searchSel - 1 + searchHits.length) % searchHits.length; }
      else if (ev.key === 'Enter') { ev.preventDefault(); activateSearchHit(searchHits[searchSel]); return; }
      else if (ev.key === 'Escape') { searchPop.hidden = true; searchEl.blur(); return; }
      else return;
      all('[data-sh]', searchPop).forEach((b, i) => b.classList.toggle('active', i === searchSel));
    });
    searchPop.addEventListener('mousedown', ev => {
      const b = ev.target.closest('[data-sh]');
      if (b) { ev.preventDefault(); activateSearchHit(searchHits[+b.dataset.sh]); }
    });
    document.addEventListener('pointerdown', ev => {
      if (!ev.target.closest('.ns-search-wrap')) searchPop.hidden = true;
    });

    // Keyboard shortcuts (/, Space, I, W, F, R/0, +/-, [, Esc)
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
    });

    // Inline prose & harness dispatcher
    fig.nsAction = a => {
      S.cascade = -1; S.cascadeFreeze = false; S.vel.x = 0; S.vel.y = 0;
      if (a.cascade !== undefined) { S.cascade = +a.cascade; S.cascadeFreeze = a.freeze === '1'; }
      if (a.drawer !== undefined) { S.drawerOpen = a.drawer === '1'; }
      if (a.wide !== undefined) { S.drawerWide = a.wide === '1'; }
      if (a.file) {
        const mod = a.file.replace(/\.lean$/, '').replace(/\//g, '.');
        const fi = fileByMod.get(mod);
        if (fi !== undefined) {
          selectFile(fi, { openDrawer: a.drawer !== '0', fit: true, animate: false, record: false });
          render(true);
          return;
        }
      }
      if (a.thm && thmById.has(a.thm)) {
        selectTheorem(thmById.get(a.thm), { fit: a.fit === '1', animate: false, record: false });
        if (a.fit !== '1') fitFullNow(false);
        render(true);
      } else if (a.terr && clByTerrRoot.has(a.terr)) {
        selectCluster(clByTerrRoot.get(a.terr), { fit: true, animate: false, record: false });
        render(true);
      } else {
        fitFullNow(false); S.dirtyDom = true; render(true);
      }
    };

    new ResizeObserver(() => {
      if (syncStageSize()) {
        if (!S.camInited) fitFullNow(false);
        else S.baseK = fitFullTarget(stageW, stageH).k;
        requestDraw();
      }
    }).observe(stageEl);

    document.addEventListener('themechange', () => {
      refreshThemeCache();
      requestDraw();
    });

    let rafId = 0, lastTs = 0;

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

      if (pendingHoverPt && !dragging && S.cascade < 0) {
        const pt = pendingHoverPt;
        pendingHoverPt = null;
        const pk = pick(pt[0], pt[1]);
        const nt = pk && pk.type !== 'terr' ? pk.type : null;
        const ni = pk && pk.type !== 'terr' ? pk.idx : -1;
        const ntr = pk && pk.type === 'terr' ? pk.terr : -1;
        if (nt !== S.hovType || ni !== S.hovIdx || ntr !== S.hovTerr) {
          S.hovType = nt; S.hovIdx = ni; S.hovTerr = ntr;
          S.needsDraw = true;
          clearTimeout(hoverPrefetchTimer);
          if (nt === 'file' && ni >= 0) {
            hoverPrefetchTimer = setTimeout(() => loadLeanFile(fileRelPath(ni)), 110);
          }
        }
        canvas.style.cursor = pk ? 'pointer' : 'grab';
      }

      let animating = false;
      if (S.camTarget) {
        const t = 1 - Math.exp(-dt * 14);
        S.cam.x += (S.camTarget.x - S.cam.x) * t;
        S.cam.y += (S.camTarget.y - S.cam.y) * t;
        S.cam.k += (S.camTarget.k - S.cam.k) * t;
        if (Math.abs(S.camTarget.k - S.cam.k) < 0.0008 && Math.hypot(S.camTarget.x - S.cam.x, S.camTarget.y - S.cam.y) < 0.35) {
          S.cam = { ...S.camTarget }; S.camTarget = null;
        } else animating = true;
        S.needsDraw = true;
      }

      if (!dragging && (Math.abs(S.vel.x) > 4 || Math.abs(S.vel.y) > 4)) {
        S.cam.x += S.vel.x * dt; S.cam.y += S.vel.y * dt;
        const decay = Math.exp(-dt * 9.5);
        S.vel.x *= decay; S.vel.y *= decay;
        animating = true; S.needsDraw = true;
      } else if (!dragging) {
        S.vel.x = 0; S.vel.y = 0;
      }

      if (S.cascade >= 0 && !S.cascadeFreeze) {
        S.cascade += dt / 5.4;
        if (S.cascade >= 1.0) { S.cascade = -1; S.dirtyDom = true; }
        else animating = true;
        S.needsDraw = true;
      }

      const hasPhotons = !reducedMotion() && (S.lastPhotons > 0 || S.selType === 'file' || S.cascade >= 0);
      if (hasPhotons) {
        S.phase = (S.phase + dt * 0.22) % 1;
        S.needsDraw = true;
        animating = true;
      }

      if (S.needsDraw || S.dirtyDom) {
        S.needsDraw = false;
        render(S.dirtyDom);
      }

      if (animating || pendingHoverPt) {
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
    p.className = 'ns-error';
    p.innerHTML = `This figure could not load. <a href="${rootFig.dataset.atlas || rootFig.dataset.src}">Open the data</a> or reload the page.`;
    fig.insertBefore(p, $('figcaption', fig));
    fig.classList.add('ready');
  }

  const atlasUrl = rootFig.dataset.atlas || rootFig.dataset.src;
  fetch(atlasUrl).then(r => {
    if (!r.ok) throw Error('atlas unavailable');
    return r.json();
  }).then(A => {
    try { mountCosmos(rootFig, A); } catch (e) { console.error('ns-mega', e); failure(rootFig); }
  }).catch(e => {
    console.error(e);
    failure(rootFig);
  });

  document.addEventListener('click', ev => {
    const a = ev.target.closest('a.act[href="#ns-mega"]');
    if (!a) return;
    ev.preventDefault();
    if (rootFig && rootFig.nsAction) rootFig.nsAction(a.dataset);
    rootFig.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  });
})();
