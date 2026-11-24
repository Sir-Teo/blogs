/* Inkling 2 Mini — Minimal 60fps Prompt-to-Output Walkthrough + Live Internals (#ink-mega)
   Five clean controls + one silky video-like scrubber. Watch a glowing thought
   orb solve a real prompt step-by-step across Input → Prelude → 3× Shared Loop
   (Reset to Prelude + Rank-64 Gate + Goodfire d_2027) → Coda MXFP8 → Output +
   DSpark +7 drafts, while three live internal telemetry gauges reveal Block AttnRes
   mixing [v0..v4], the 16×8 (8/128) MoE expert matrix + sublayer pipeline, and
   Goodfire's d_2027 waveform across all 48 visits. Click any block or gauge for
   exact math, 1→5 pass benchmarks, d_2027 ablation, and verbatim Python code. */
(function () {
  'use strict';

  const rootFig = document.getElementById('ink-mega');
  if (!rootFig) return;

  const $ = (s, e = document) => e.querySelector(s);
  const all = (s, e = document) => [...e.querySelectorAll(s)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rgbCache = new Map();
  function hexRgb(hex) {
    let hit = rgbCache.get(hex);
    if (hit) return hit;
    const h = (hex || '#0155bf').replace('#', '');
    hit = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, hit);
    return hit;
  }
  function rgba(hex, a) {
    if (!hex || !hex.startsWith('#')) return hex;
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
  }

  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = k => cs.getPropertyValue(k).trim();
    return {
      bg: g('--bg') || '#ffffff',
      subtle: g('--bg_code') || '#f3f3f2',
      fg: g('--fg') || '#282828',
      fg2: g('--fg2') || '#504945',
      fg3: g('--fg3') || '#6b6866',
      fg4: g('--fg4') || '#85827f',
      line: g('--line') || '#e6e5e3',
      line2: g('--line-2') || '#c8c7c4',
      blue: g('--accent') || '#0155bf',
      azure: g('--brand-azure') || '#0387e7',
      good: g('--good') || '#0e9972',
      amber: g('--amber') || '#b57614',
      gold: g('--brand-amber') || '#f7a224',
      red: g('--bad') || '#ad2111',
      purple: g('--purple') || '#8f3f71',
      sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    };
  }

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
  }

  function drawArrow(ctx, x, y, ang, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.75, -size * 0.56);
    ctx.lineTo(-size * 0.45, 0);
    ctx.lineTo(-size * 0.75, size * 0.56);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function highlightPython(code, startLine) {
    const kws = new Set(['class', 'def', 'return', 'if', 'else', 'elif', 'for', 'in', 'not', 'and', 'or', 'None', 'True', 'False', 'self', 'super', 'import', 'from', 'as', 'is', 'with', 'pass', 'raise']);
    const lines = code.split('\n');
    const indents = lines.filter(l => l.trim().length > 0).map(l => l.match(/^\s*/)[0].length);
    const minIndent = indents.length ? Math.min(...indents) : 0;
    return lines.map((rawLine, i) => {
      const line = rawLine.slice(minIndent);
      const ln = `<span class="ln">${startLine + i}</span>`;
      const ci = line.indexOf('#');
      const raw = ci >= 0 ? line.slice(0, ci) : line;
      const cm = ci >= 0 ? `<span class="cm">${esc(line.slice(ci))}</span>` : '';
      const hi = esc(raw).replace(/(&quot;[^&]*?&quot;|'[^']*?'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g, m => {
        if (m.startsWith('&quot;') || m.startsWith("'")) return `<span class="str">${m}</span>`;
        if (/^\d/.test(m)) return `<span class="num">${m}</span>`;
        if (kws.has(m)) return `<span class="kw">${m}</span>`;
        if (/^[A-Z][A-Za-z0-9_]*$/.test(m)) return `<span class="fn">${m}</span>`;
        return m;
      });
      return ln + hi + cm;
    }).join('\n');
  }

  // Deterministic Top-8 of 128 MoE expert picker for any (example, layer, lap)
  function pickActiveExperts(exIdx, layerIdx, lap) {
    const set = new Set();
    let seed = ((exIdx + 1) * 7919 + (layerIdx + 3) * 104729 + (lap + 1) * 3571) >>> 0;
    while (set.size < 8) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      set.add((seed >>> 16) & 127);
    }
    return set;
  }

  // Goodfire coordinate d_2027 trajectory across visits v0..v48 (RMS-norm at L17: exact +32.4 on Pass 1 & 2, -26.5 cleanup on Pass 3)
  function d2027AtVisit(v, ablated) {
    if (ablated) return 0;
    const e1 = Math.exp(-Math.pow((v - 17.0) / 1.15, 2));
    const e2 = Math.exp(-Math.pow((v - 29.0) / 1.15, 2));
    const e3 = Math.exp(-Math.pow((v - 41.0) / 1.15, 2));
    const peakEnv = clamp(e1 + e2 + e3, 0, 1);
    const base = (1 - peakEnv) * (v > 5 && v < 42 ? 0.8 * Math.sin(v * 0.45) : 0.25 * Math.sin(v * 0.7));
    return 32.4 * e1 + 32.4 * e2 - 26.5 * e3 + base;
  }

  // Three concrete prompts where each loop pass visibly solves one deeper step!
  const EXAMPLES = [
    {
      id: 'hop',
      label: '3-Hop Logic',
      spans: [
        { txt: 'A → B', role: 'p1' },
        { txt: ' ,  ', role: 'sep' },
        { txt: 'B → E', role: 'p2' },
        { txt: ' ,  ', role: 'sep' },
        { txt: 'E → Dan', role: 'p3' },
        { txt: ' .   3-hop(A) →', role: 'q' },
      ],
      cands: [
        { tok: 'Dan', probs: [0.16, 0.68, 0.98] },
        { tok: 'B',   probs: [0.46, 0.14, 0.01] },
        { tok: 'E',   probs: [0.29, 0.16, 0.01] },
      ],
      passNotes: {
        p1Orb: 'reads A→B',
        p1Clue: 'saves "B"',
        p2Orb: 'follows B→E',
        p2Clue: 'saves "E"',
        p3Orb: 'finds E→Dan',
        p1Say: '<b>Pass 1 of 3 (v6–v17):</b> The 12 shared layers attend to <b>A → B</b> and only see one hop ahead (guessing <b>B · 46%</b>). At L17 (v17), coordinate <b>d₂₀₂₇</b> spikes <b>+32.4</b> so Pass 2 locks onto Block 3.',
        p2Say: '<b>Pass 2 of 3 (v18–v29):</b> Resets depth memory to Prelude <b>[v₀, v₁]</b> and opens the purple <b>Rank-64 Gate</b> (pulling 85% from prev Block 3), following <b>B → E</b> to push <b>Dan (68%)</b> to the top.',
        p3Say: '<b>Pass 3 of 3 (v30–v41):</b> Final orbit over the same 12 weights follows <b>E → Dan</b> and locks <b>Dan (98%)</b> — then L17 (v41) fires a crimson <b>d₂₀₂₇ cleanup (−26.5)</b> spike before exiting to the Coda.',
      },
      drafts: ['(', 'A→B', '→E', '→Dan', ')'],
    },
    {
      id: 'code',
      label: 'Python Code',
      spans: [
        { txt: 'def fib', role: 'p1' },
        { txt: ' ( ', role: 'sep' },
        { txt: 'n', role: 'p2' },
        { txt: ' ):  ', role: 'sep' },
        { txt: 'return', role: 'p3' },
      ],
      cands: [
        { tok: 'n',   probs: [0.28, 0.72, 0.97] },
        { tok: 'fib', probs: [0.44, 0.18, 0.02] },
        { tok: '1',   probs: [0.20, 0.08, 0.01] },
      ],
      passNotes: {
        p1Orb: 'reads fib',
        p1Clue: 'saves "fib"',
        p2Orb: 'checks base n',
        p2Clue: 'saves "n≤1"',
        p3Orb: 'plans return n',
        p1Say: '<b>Pass 1 of 3 (v6–v17):</b> First lap spots <b>def fib</b> and impulsively favors recursive <b>fib (44%)</b>. At L17 (v17), <b>d₂₀₂₇</b> spikes <b>+32.4</b> to hand Block 3 context into Pass 2.',
        p2Say: '<b>Pass 2 of 3 (v18–v29):</b> Resets to Prelude <b>[v₀, v₁]</b>, pulls Pass 1 through the <b>Rank-64 Gate</b>, checks base-case argument <b>n</b>, and shifts top probability to <b>n (72%)</b>.',
        p3Say: '<b>Pass 3 of 3 (v30–v41):</b> Final lap plans the one-line guard (<b>return n if n <= 1 ...</b>), locking <b>n (97%)</b> before firing a negative <b>d₂₀₂₇ cleanup (−26.5)</b> spike.',
      },
      drafts: ['if', 'n <= 1', 'else', 'fib(n-1)+fib(n-2)'],
    },
    {
      id: 'cal',
      label: 'Calendar',
      spans: [
        { txt: 'Jan 1 = Thu', role: 'p1' },
        { txt: ' .   ', role: 'sep' },
        { txt: 'Feb = 28d', role: 'p2' },
        { txt: ' .   ', role: 'sep' },
        { txt: 'Mar 1 =', role: 'p3' },
      ],
      cands: [
        { tok: 'Sun', probs: [0.27, 0.69, 0.96] },
        { tok: 'Sat', probs: [0.42, 0.19, 0.02] },
        { tok: 'Fri', probs: [0.21, 0.09, 0.01] },
      ],
      passNotes: {
        p1Orb: 'reads Thu',
        p1Clue: 'saves "+59d"',
        p2Orb: 'sums 31+28',
        p2Clue: 'saves "59%7"',
        p3Orb: 'Thu+3 = Sun',
        p1Say: '<b>Pass 1 of 3 (v6–v17):</b> A single pass estimates loosely from <b>Jan 1 = Thu</b> and slips off by a day (<b>Sat · 42%</b>). L17 (v17) spikes <b>d₂₀₂₇ = +32.4</b> to carry the day sum into Pass 2.',
        p2Say: '<b>Pass 2 of 3 (v18–v29):</b> Resets to Prelude <b>[v₀, v₁]</b>, opens the <b>Rank-64 Gate</b>, sums <b>31 + 28 = 59 days</b>, and pivots cleanly toward <b>Sun (69%)</b>.',
        p3Say: '<b>Pass 3 of 3 (v30–v41):</b> Final lap resolves <b>59 mod 7 = 3 → Thu + 3 = Sun (96%)</b>, then L17 (v41) fires a crimson <b>d₂₀₂₇ cleanup (−26.5)</b> spike before exiting to the Coda.',
      },
      drafts: ['(59', 'days', '=', '8w', '+ 3d)'],
    },
  ];

  // 6 milestone stops along continuous timeline u ∈ [0, 1]
  const CHAPTERS = [
    { id: 'input',   label: 'Input',   u: 0.05 },
    { id: 'prelude', label: 'Prelude', u: 0.17 },
    { id: 'pass1',   label: 'Pass 1',  u: 0.30 },
    { id: 'pass2',   label: 'Pass 2',  u: 0.51 },
    { id: 'pass3',   label: 'Pass 3',  u: 0.70 },
    { id: 'output',  label: 'Output',  u: 0.94 },
  ];

  // Clean fixed world coordinates (860 × 588) — zero overlaps, crisp 2× DPR on all screens!
  const WW = 860, WH = 588;
  const BOXES = {
    input:      { x: 30,  y: 204, w: 98,  h: 92 },
    prelude:    { x: 158, y: 204, w: 108, h: 92 },
    core:       { x: 312, y: 174, w: 248, h: 122 }, // 12 Shared Layers: Block 2 (L6–11) | Block 3 (L12–17)
    gate:       { x: 326, y: 330, w: 136, h: 34 },  // Rank-64 Cross-Pass Gate above return rail
    d2027:      { x: 474, y: 330, w: 108, h: 34 },  // Goodfire d_2027 relay/cleanup beacon
    coda:       { x: 604, y: 204, w: 98,  h: 92 },
    output:     { x: 728, y: 204, w: 104, h: 92 },
    dspark:     { x: 158, y: 410, w: 674, h: 32 },
    // Live Internal Telemetry Strip (3 clickable gauges!)
    attnres:    { x: 30,  y: 454, w: 252, h: 108 },
    moe:        { x: 294, y: 454, w: 274, h: 108 },
    d2027_wave: { x: 580, y: 454, w: 252, h: 108 },
  };
  const RAIL_Y = 250; // Center highway Y
  const RET_Y = 372;  // Clean lower return rail Y (right below Gate & d_2027 cards!)

  function mountWalkthrough(fig, D) {
    const layers = (D.arch && D.arch.layers) || [];
    const state = {
      exIdx: 0,
      u: 0.0,
      playing: !reducedMotion(),
      t: 0,
      ablateD2027: false,
      hoverKey: null,
      inspectKey: null,
      fullscreen: false,
      lastVoiceHtml: '',
      lastChapterIdx: -1,
    };

    const shell = document.createElement('div');
    shell.className = 'ink-shell';
    shell.innerHTML = `
      <div class="ink-bar">
        <div class="ink-presets" data-role="presets">
          ${EXAMPLES.map((ex, i) => `<button type="button" data-ex="${i}" aria-pressed="${i === 0}">${esc(ex.label)}</button>`).join('')}
        </div>
        <div class="ink-actions">
          <button type="button" class="ink-play-btn" data-role="play" aria-pressed="${state.playing}">${state.playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button type="button" class="ink-expand-btn" data-role="expand" title="Fullscreen">⤢</button>
        </div>
      </div>

      <div class="ink-stage-wrap" data-role="stage-wrap">
        <canvas class="ink-canvas"></canvas>
      </div>

      <div class="ink-foot">
        <p class="ink-voiceover" data-role="voice"></p>
        <div class="ink-scrub-wrap">
          <input class="ink-scrubber" type="range" min="0" max="1000" step="1" value="0" data-role="scrub" aria-label="Scrub forward pass timeline">
          <div class="ink-chapters" data-role="chapters">
            ${CHAPTERS.map((ch, i) => `<button type="button" data-chap="${i}">${esc(ch.label)}</button>`).join('')}
          </div>
        </div>
      </div>

      <aside class="ink-sheet" data-role="sheet" hidden></aside>
    `;

    fig.insertBefore(shell, fig.querySelector('figcaption'));
    fig.classList.add('ready');

    const wrap = $('[data-role="stage-wrap"]', shell);
    const canvas = $('.ink-canvas', shell);
    const ctx = canvas.getContext('2d');
    const playBtn = $('[data-role="play"]', shell);
    const expandBtn = $('[data-role="expand"]', shell);
    const scrubEl = $('[data-role="scrub"]', shell);
    const voiceEl = $('[data-role="voice"]', shell);
    const chapBtns = all('[data-chap]', shell);
    const sheetEl = $('[data-role="sheet"]', shell);

    let T = readTokens();
    let CW = WW, CH = WH, DPR = 2;

    function resize() {
      const r = wrap.getBoundingClientRect();
      CW = Math.max(300, Math.floor(r.width));
      CH = Math.max(200, Math.floor(r.height));
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(CW * DPR) || canvas.height !== Math.floor(CH * DPR)) {
        canvas.width = Math.floor(CW * DPR);
        canvas.height = Math.floor(CH * DPR);
      }
    }

    // Core slice X center helper (Block 2 = i 0..5, center divider, Block 3 = i 6..11)
    function coreSliceX(i) {
      return BOXES.core.x + 14 + (i < 6 ? i * 17.5 : 6 * 17.5 + 14 + (i - 6) * 17.5);
    }

    // Compute exact orb position, visit number (0..48), physical layer (0..23), AttnRes weights, MoE state & voiceover
    function evaluateTimeline(u) {
      const ex = EXAMPLES[state.exIdx];
      const B = BOXES;
      const coreL = coreSliceX(0) + 7, coreR = coreSliceX(11) + 7;
      const lxRight = 590, lxLeft = 294;

      function returnPos(f) {
        if (f < 0.22) {
          const p = f / 0.22;
          return [lerp(coreR, lxRight, p), lerp(RAIL_Y, RET_Y, smoothstep(0, 1, p))];
        }
        if (f < 0.78) {
          const p = (f - 0.22) / 0.56;
          return [lerp(lxRight, lxLeft, p), RET_Y];
        }
        const p = (f - 0.78) / 0.22;
        return [lerp(lxLeft, coreL, p), lerp(RET_Y, RAIL_Y, smoothstep(0, 1, p))];
      }

      // Smooth evolving probabilities aligned with chapter stops
      const p12 = state.ablateD2027 ? 0.12 : smoothstep(0.43, 0.49, u);
      const p23 = state.ablateD2027 ? 0.0 : smoothstep(0.63, 0.69, u);
      const liveProbs = ex.cands.map(c => {
        const v12 = lerp(c.probs[0], c.probs[1], p12);
        return { tok: c.tok, prob: lerp(v12, c.probs[2], p23) };
      }).sort((a, b) => b.prob - a.prob);

      let ox = 80, oy = RAIL_Y, orbCol = T.blue, bubble = 'v₀';
      let bubblePos = 'above';
      let activeBox = 'input', lap = 0, coreSlice = -1, preSlice = -1, codaSlice = -1;
      let visit = 0, physLayer = -1, subStep = -1; // subStep 0:AttnRes, 1:Conv+Rel, 2:MoE, 3:SwiGLU
      let attnRole = null;
      let resetGlow = 0, returnGlow = 0, d2State = 'idle';
      let draftAlpha = 0, outLocked = false, outBeamProg = 0;
      let phaseChip = 'Visit v0 / 48 · Input Embed + 23L ViT';
      let chapIdx = 0, voiceHtml = '';

      // Live Block AttnRes softmax weights [v0, v1, v2, v3, v4] + Cross-pass message share m3 (prev Block 3)
      let blkW = [1.0, 0, 0, 0, 0];
      let crossMemActive = false, crossM3Share = 0.85;

      if (u < 0.11) {
        const f = u / 0.11;
        ox = lerp(B.input.x + 16, B.input.x + B.input.w - 6, f);
        oy = RAIL_Y;
        orbCol = T.blue;
        bubble = 'Token → v₀';
        bubblePos = 'above';
        activeBox = 'input';
        visit = 0;
        physLayer = -1;
        blkW = [1.0, 0, 0, 0, 0];
        phaseChip = 'Visit v0 / 48 · 201K Embed + 23L ViT';
        chapIdx = 0;
        voiceHtml = '<b>1. Input → Block 0 (v₀):</b> Your prompt splits into tokens (201K vocab, d = 2,304) and RMS-normalizes into <b>v₀</b>. Block Attention Residuals never overwrite v₀, so every future layer can attend back to raw input.';
      } else if (u < 0.23) {
        const f = (u - 0.11) / 0.12;
        ox = lerp(B.prelude.x + 10, B.prelude.x + B.prelude.w - 6, f);
        oy = RAIL_Y;
        orbCol = T.good;
        preSlice = Math.min(5, Math.floor(f * 6));
        physLayer = preSlice;
        visit = 1 + preSlice;
        subStep = Math.floor((f * 6 - preSlice) * 4);
        const lInfo = layers[physLayer] || {};
        bubble = `L${preSlice} → v₁`;
        bubblePos = 'above';
        activeBox = 'prelude';
        blkW = [lerp(0.55, 0.34, f), lerp(0.45, 0.66, f), 0, 0, 0];
        phaseChip = `Visit v${visit} / 48 · L${physLayer} ${lInfo.attn === 'global' ? 'Global 1M' : 'SW-1024'} · NVFP4`;
        chapIdx = 1;
        voiceHtml = '<b>2. Prelude (L0–L5, runs once · v1–v5):</b> Five sliding-1024 layers + one global layer at L5 build <b>Block 1 (v₁)</b>. Watch 8 of 128 NVFP4 MoE experts light up inside the active layer gauge below.';
      } else if (u < 0.36) {
        const f = (u - 0.23) / 0.13;
        coreSlice = Math.min(11, Math.floor(f * 12));
        physLayer = 6 + coreSlice;
        visit = 6 + coreSlice;
        subStep = Math.floor((f * 12 - coreSlice) * 4);
        ox = coreSliceX(coreSlice) + 7;
        oy = 245;
        orbCol = T.purple;
        lap = 1;
        attnRole = 'p1';
        bubble = ex.passNotes.p1Orb;
        bubblePos = 'below-core';
        activeBox = 'core';
        const inB3 = coreSlice >= 6;
        blkW = inB3 ? [0.14, 0.24, 0.34, 0.28, 0] : [0.22, 0.40, 0.38, 0, 0];
        const lInfo = layers[physLayer] || {};
        phaseChip = `Visit v${visit} / 48 · Pass 1 · L${physLayer} ${lInfo.attn === 'global' ? 'Global' : 'SW-1024'}`;
        chapIdx = 2;
        voiceHtml = ex.passNotes.p1Say;
      } else if (u < 0.43) {
        const f = (u - 0.36) / 0.07;
        [ox, oy] = returnPos(f);
        orbCol = state.ablateD2027 ? T.red : T.purple;
        lap = 1;
        visit = 17;
        physLayer = 17;
        subStep = 0;
        returnGlow = 1;
        resetGlow = smoothstep(0.45, 0.95, f);
        d2State = state.ablateD2027 ? 'ablated' : 'relay';
        crossMemActive = true;
        crossM3Share = state.ablateD2027 ? 0.14 : 0.85;
        blkW = [0.38, 0.62, 0, 0, 0]; // Visibly RESETS active blocks back to [v0, v1]!
        bubble = state.ablateD2027 ? 'd₂₀₂₇ ablated!' : (f < 0.5 ? `d₂₀₂₇ +32.4 · ${ex.passNotes.p1Clue}` : 'Reset + Rank-64 Gate');
        bubblePos = 'below-return';
        activeBox = f < 0.5 ? 'd2027' : 'gate';
        phaseChip = state.ablateD2027 ? 'Visit v17 · d₂₀₂₇ = 0.0 (relay broken)' : 'Looping v17 → v18 · Reset [v₀, v₁] + Rank-64 Gate';
        chapIdx = 2;
        voiceHtml = state.ablateD2027
          ? '<b>Causal Surgery (d₂₀₂₇ = 0):</b> Look at the bottom-right sparkline — flattening d₂₀₂₇ at L17 breaks Pass 2’s lock onto Block 3 (m₃ drops to 14%), preventing Passes 2 &amp; 3 from refining the answer!'
          : '<b>Reset + Cross-Pass Gate (v17 → v18):</b> Watch the Block AttnRes gauge reset to <b>[v₀, v₁]</b> while Pass 1’s Block 3 (tagged by <b>d₂₀₂₇ = +32.4</b>) feeds 85% of the cross-pass message through the <b>Rank-64 Gate</b>.';
      } else if (u < 0.56) {
        const f = (u - 0.43) / 0.13;
        coreSlice = Math.min(11, Math.floor(f * 12));
        physLayer = 6 + coreSlice;
        visit = 18 + coreSlice;
        subStep = Math.floor((f * 12 - coreSlice) * 4);
        ox = coreSliceX(coreSlice) + 7;
        oy = 245;
        orbCol = T.purple;
        lap = 2;
        attnRole = state.ablateD2027 ? 'p1' : 'p2';
        resetGlow = Math.max(0, 1 - f * 3);
        crossMemActive = true;
        crossM3Share = state.ablateD2027 ? 0.14 : 0.85;
        const inB3 = coreSlice >= 6;
        blkW = inB3 ? [0.12, 0.22, 0.30, 0.36, 0] : [0.20, 0.38, 0.42, 0, 0];
        bubble = state.ablateD2027 ? 'relay lost!' : ex.passNotes.p2Orb;
        bubblePos = 'below-core';
        activeBox = 'core';
        const lInfo = layers[physLayer] || {};
        phaseChip = `Visit v${visit} / 48 · Pass 2 · L${physLayer} ${lInfo.attn === 'global' ? 'Global' : 'SW-1024'}`;
        chapIdx = 3;
        voiceHtml = state.ablateD2027
          ? '<b>Pass 2 (d₂₀₂₇ ablated):</b> Without L17’s +32.4 beacon, Pass 2 barely reads Pass 1’s clue from Block 3 and stays stuck near the Pass 1 guess.'
          : ex.passNotes.p2Say;
      } else if (u < 0.63) {
        const f = (u - 0.56) / 0.07;
        [ox, oy] = returnPos(f);
        orbCol = state.ablateD2027 ? T.red : T.purple;
        lap = 2;
        visit = 29;
        physLayer = 17;
        subStep = 0;
        returnGlow = 1;
        resetGlow = smoothstep(0.45, 0.95, f);
        d2State = state.ablateD2027 ? 'ablated' : 'relay';
        crossMemActive = true;
        crossM3Share = state.ablateD2027 ? 0.14 : 0.86;
        blkW = [0.36, 0.64, 0, 0, 0];
        bubble = state.ablateD2027 ? 'd₂₀₂₇ ablated!' : (f < 0.5 ? `d₂₀₂₇ +32.4 · ${ex.passNotes.p2Clue}` : 'Reset + Rank-64 Gate');
        bubblePos = 'below-return';
        activeBox = f < 0.5 ? 'd2027' : 'gate';
        phaseChip = state.ablateD2027 ? 'Visit v29 · d₂₀₂₇ = 0.0 (relay broken)' : 'Looping v29 → v30 · Reset [v₀, v₁] + Rank-64 Gate';
        chapIdx = 3;
        voiceHtml = state.ablateD2027
          ? '<b>Causal Surgery (d₂₀₂₇ = 0):</b> Cross-pass message gain stays degraded heading into Pass 3.'
          : '<b>Reset + Gate (v29 → v30):</b> Depth memory resets back to Prelude <b>[v₀, v₁]</b> once more while L17’s second <b>d₂₀₂₇ = +32.4</b> spike relays Lap 2’s refined state into Pass 3.';
      } else if (u < 0.78) {
        const f = (u - 0.63) / 0.15;
        coreSlice = Math.min(11, Math.floor(Math.min(0.99, f / 0.88) * 12));
        physLayer = 6 + coreSlice;
        visit = 30 + coreSlice;
        subStep = Math.floor((Math.min(0.99, f / 0.88) * 12 - coreSlice) * 4);
        ox = coreSliceX(coreSlice) + 7;
        oy = 245;
        const cleaning = f > 0.78 && !state.ablateD2027;
        orbCol = cleaning || state.ablateD2027 ? T.red : T.purple;
        lap = 3;
        attnRole = state.ablateD2027 ? 'p1' : 'p3';
        d2State = state.ablateD2027 ? 'ablated' : (cleaning ? 'cleanup' : 'idle');
        crossMemActive = !cleaning;
        crossM3Share = state.ablateD2027 ? 0.14 : 0.86;
        const inB3 = coreSlice >= 6;
        blkW = inB3 ? [0.10, 0.18, 0.28, 0.44, 0] : [0.18, 0.34, 0.48, 0, 0];
        bubble = state.ablateD2027 ? 'd₂₀₂₇ = 0.0 (ablated)' : (cleaning ? 'd₂₀₂₇ cleanup (−26.5)' : ex.passNotes.p3Orb);
        bubblePos = 'below-core';
        activeBox = cleaning ? 'd2027' : 'core';
        const lInfo = layers[physLayer] || {};
        phaseChip = state.ablateD2027
          ? `Visit v${visit} / 48 · Pass 3 · d₂₀₂₇ ablated (0.0)`
          : cleaning
            ? 'Visit v41 / 48 · Pass 3 · L17 d₂₀₂₇ cleanup (−26.5)'
            : `Visit v${visit} / 48 · Pass 3 · L${physLayer} ${lInfo.attn === 'global' ? 'Global' : 'SW-1024'}`;
        chapIdx = 4;
        voiceHtml = state.ablateD2027
          ? '<b>Pass 3 (d₂₀₂₇ ablated):</b> Because the cross-loop relay was broken, final accuracy drops sharply (click Restore d₂₀₂₇ in the inspector to recover).'
          : ex.passNotes.p3Say;
      } else if (u < 0.88) {
        const f = (u - 0.78) / 0.10;
        ox = lerp(B.coda.x + 8, B.coda.x + B.coda.w - 6, f);
        oy = RAIL_Y;
        orbCol = T.amber;
        lap = 3;
        codaSlice = Math.min(5, Math.floor(f * 6));
        physLayer = 18 + codaSlice;
        visit = 42 + codaSlice;
        subStep = Math.floor((f * 6 - codaSlice) * 4);
        const isMx = codaSlice >= 2;
        const lInfo = layers[physLayer] || {};
        bubble = isMx ? `L${physLayer} MXFP8` : `L${physLayer} NVFP4`;
        bubblePos = 'above';
        activeBox = 'coda';
        blkW = [0.09, 0.15, 0.21, 0.27, lerp(0.16, 0.28, f)];
        phaseChip = `Visit v${visit} / 48 · L${physLayer} ${lInfo.attn === 'global' ? 'Global' : 'SW-1024'} · ${isMx ? 'MXFP8 8.25b' : 'NVFP4 4.5b'}`;
        chapIdx = 5;
        voiceHtml = '<b>6. Coda (L18–L23, runs once · v42–v47):</b> Exiting the loop into Block 4 (<b>v₄</b>), layers <b>L20–L23</b> switch from 4.5-bit NVFP4 to 8.25-bit <b>MXFP8</b> (watch the MoE expert grid turn gold below!).';
      } else {
        const f = (u - 0.88) / 0.12;
        ox = B.output.x + B.output.w / 2;
        oy = B.output.y;
        orbCol = state.ablateD2027 ? T.red : T.good;
        lap = 3;
        visit = 48;
        physLayer = 23;
        subStep = 3;
        outLocked = true;
        outBeamProg = smoothstep(0.0, 0.52, f);
        draftAlpha = smoothstep(0.35, 0.78, f);
        blkW = [0.08, 0.13, 0.19, 0.26, 0.34];
        bubble = state.ablateD2027
          ? `${liveProbs[0].tok} · ${Math.round(liveProbs[0].prob * 100)}% (ablated!)`
          : `${liveProbs[0].tok} · ${Math.round(liveProbs[0].prob * 100)}%`;
        bubblePos = 'output-beam';
        activeBox = f > 0.48 ? 'dspark' : 'output';
        phaseChip = state.ablateD2027
          ? 'Visit v48 / 48 · Wrong answer (d₂₀₂₇ ablated)'
          : 'Visit v48 / 48 · Final AttnRes + Softcap 30 + DSpark';
        chapIdx = 5;
        voiceHtml = state.ablateD2027
          ? `<b>Output (d₂₀₂₇ ablated):</b> Without the cross-pass relay beacon, logits collapse to wrong token <b>"${esc(liveProbs[0].tok)}" (${Math.round(liveProbs[0].prob * 100)}%)</b> — click Restore d₂₀₂₇ in the inspector to recover.`
          : `<b>Output + DSpark (+7 drafts · v48):</b> Final AttnRes mixes all 5 blocks <b>[v₀..v₄]</b> into softcapped 201K logits to emit <b>"${esc(liveProbs[0].tok)}" (${Math.round(liveProbs[0].prob * 100)}%)</b>, while 0.64 GB <b>DSpark</b> taps <b>[v5, v23, v41, v48]</b> to draft <b>7 continuation tokens</b>.`;
      }

      return {
        ox, oy, orbCol, bubble, bubblePos, activeBox, lap, coreSlice, preSlice, codaSlice,
        visit, physLayer, subStep, blkW, crossMemActive, crossM3Share,
        attnRole, resetGlow, returnGlow, d2State, draftAlpha, outLocked, outBeamProg,
        phaseChip, liveProbs, chapIdx, voiceHtml,
      };
    }

    // --------------------------------------------------- 60fps Canvas Renderer
    function drawFrame() {
      const ex = EXAMPLES[state.exIdx];
      const ev = evaluateTimeline(state.u);
      const B = BOXES;

      if (ev.voiceHtml !== state.lastVoiceHtml) {
        state.lastVoiceHtml = ev.voiceHtml;
        voiceEl.innerHTML = ev.voiceHtml;
      }
      if (ev.chapIdx !== state.lastChapterIdx) {
        state.lastChapterIdx = ev.chapIdx;
        chapBtns.forEach((b, i) => b.classList.toggle('active', i === ev.chapIdx));
      }
      scrubEl.value = String(Math.round(state.u * 1000));
      scrubEl.style.setProperty('--prog', `${(state.u * 100).toFixed(2)}%`);

      const scale = Math.min(CW / WW, CH / WH);
      const offX = (CW - WW * scale) / 2;
      const offY = (CH - WH * scale) / 2;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, CW, CH);

      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);

      // Subtle architectural blueprint dots
      ctx.fillStyle = rgba(T.line2, 0.30);
      for (let gx = 20; gx < WW; gx += 28) {
        for (let gy = 20; gy < WH; gy += 28) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1.1, 1.1);
        }
      }

      function fillOpaqueCard(x, y, w, h, r, tintCol, tintAlpha) {
        rrect(ctx, x, y, w, h, r);
        ctx.fillStyle = T.bg;
        ctx.fill();
        if (tintAlpha > 0) {
          rrect(ctx, x, y, w, h, r);
          ctx.fillStyle = rgba(tintCol, tintAlpha);
          ctx.fill();
        }
      }

      // ============================================ BAND 1: LIVE PROMPT BANNER
      const pCardX = 30, pCardY = 16, pCardW = 802, pCardH = 66;
      rrect(ctx, pCardX, pCardY, pCardW, pCardH, 12);
      ctx.fillStyle = T.subtle;
      ctx.fill();
      ctx.strokeStyle = T.line;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = `700 9px ${T.mono}`;
      ctx.fillStyle = T.fg4;
      ctx.fillText('PROMPT', pCardX + 16, pCardY + 19);

      // Live visit & layer readout in top-right of Prompt Banner!
      ctx.textAlign = 'right';
      ctx.font = `600 9.1px ${T.mono}`;
      ctx.fillStyle = ev.orbCol;
      ctx.fillText(ev.phaseChip, pCardX + pCardW - 16, pCardY + 19);

      ctx.textAlign = 'left';
      ctx.font = `600 15.5px ${T.mono}`;
      let curX = pCardX + 16;
      const textY = pCardY + 46;
      let attendedSpanCx = null;

      ex.spans.forEach(sp => {
        const w = ctx.measureText(sp.txt).width;
        const isAtt = ev.attnRole && sp.role === ev.attnRole;
        if (isAtt) {
          attendedSpanCx = curX + w / 2;
          rrect(ctx, curX - 4, textY - 17, w + 8, 24, 6);
          ctx.fillStyle = rgba(T.blue, 0.14);
          ctx.fill();
          ctx.strokeStyle = rgba(T.blue, 0.72);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.fillStyle = isAtt ? T.blue : (sp.role === 'q' ? T.fg2 : T.fg);
        ctx.fillText(sp.txt, curX, textY);
        curX += w;
      });

      curX += 10;
      const top = ev.liveProbs[0];
      const showGuess = state.u >= 0.24;
      const ablateFail = ev.outLocked && state.ablateD2027;
      const guessTxt = !showGuess ? ' ? ' : (ablateFail ? `${top.tok}  ${Math.round(top.prob * 100)}% ✗` : `${top.tok}  ${Math.round(top.prob * 100)}%`);
      ctx.font = `700 14px ${T.mono}`;
      const slotW = Math.max(82, ctx.measureText(guessTxt).width + 20);
      const answerSlotCx = curX + slotW / 2;
      rrect(ctx, curX, textY - 18, slotW, 26, 7);
      ctx.fillStyle = ablateFail
        ? rgba(T.red, 0.14)
        : ev.outLocked
          ? rgba(T.good, 0.16)
          : showGuess
            ? rgba(T.gold, 0.18)
            : T.bg;
      ctx.fill();
      ctx.strokeStyle = ablateFail ? T.red : (ev.outLocked ? T.good : (showGuess ? T.amber : T.line2));
      ctx.lineWidth = ev.outLocked ? 2 : 1.3;
      if (!showGuess) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'center';
      ctx.fillStyle = ablateFail ? T.red : (ev.outLocked ? T.good : (showGuess ? T.amber : T.fg4));
      ctx.fillText(guessTxt, answerSlotCx, textY - 0.5);

      if (ev.draftAlpha > 0.02 && !state.ablateD2027) {
        ctx.save();
        ctx.globalAlpha = ev.draftAlpha;
        let dx = curX + slotW + 8;
        ctx.font = `500 11.5px ${T.mono}`;
        ctx.textAlign = 'left';
        ex.drafts.forEach(d => {
          const dw = ctx.measureText(d).width + 10;
          if (dx + dw > pCardX + pCardW - 10) return;
          rrect(ctx, dx, textY - 14, dw, 20, 5);
          ctx.fillStyle = rgba(T.good, 0.10);
          ctx.fill();
          ctx.strokeStyle = rgba(T.good, 0.45);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = T.good;
          ctx.fillText(d, dx + 5, textY - 0.5);
          dx += dw + 5;
        });
        ctx.restore();
      }

      // High-arc dashed blue ATTENTION BEAM (cruises cleanly above Reset → Prelude!)
      if (attendedSpanCx !== null) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ev.ox, B.core.y);
        ctx.bezierCurveTo(ev.ox, 100, attendedSpanCx, 100, attendedSpanCx, pCardY + pCardH + 2);
        ctx.strokeStyle = rgba(T.blue, 0.58);
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = -state.t * 28;
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, attendedSpanCx, pCardY + pCardH + 1, -Math.PI / 2, 5.5, T.blue);
        ctx.restore();
      }

      // Glowing OUTPUT BEAM rising from 5 · OUTPUT up into the Prompt Answer Slot!
      let outOrbX = ev.ox, outOrbY = ev.oy;
      if (ev.outLocked) {
        const sx = B.output.x + B.output.w / 2, sy = B.output.y;
        const exX = answerSlotCx, exY = pCardY + pCardH + 2;
        const beamCol = state.ablateD2027 ? T.red : T.good;
        const cp1x = sx, cp1y = 112, cp2x = exX, cp2y = 112;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, exX, exY);
        ctx.strokeStyle = rgba(beamCol, 0.72);
        ctx.lineWidth = 2.6;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -state.t * 32;
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, exX, exY, -Math.PI / 2, 5.8, beamCol);
        ctx.restore();

        const bt = lerp(0.18, 0.56, ev.outBeamProg);
        const mt = 1 - bt;
        outOrbX = mt * mt * mt * sx + 3 * mt * mt * bt * cp1x + 3 * mt * bt * bt * cp2x + bt * bt * bt * exX;
        outOrbY = mt * mt * mt * sy + 3 * mt * mt * bt * cp1y + 3 * mt * bt * bt * cp2y + bt * bt * bt * exY;
      }

      // ============================================ BAND 2: HIGHWAYS & CONDUITS
      ctx.strokeStyle = state.u < 0.11 ? T.blue : T.line2;
      ctx.lineWidth = state.u < 0.11 ? 2.2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(B.input.x + B.input.w / 2, pCardY + pCardH);
      ctx.lineTo(B.input.x + B.input.w / 2, B.input.y - 4);
      ctx.stroke();
      drawArrow(ctx, B.input.x + B.input.w / 2, B.input.y - 4, Math.PI / 2, 5, state.u < 0.11 ? T.blue : T.line2);

      const drawPipe = (x1, x2, col, hot) => {
        ctx.beginPath();
        ctx.moveTo(x1, RAIL_Y);
        ctx.lineTo(x2 - 5, RAIL_Y);
        ctx.strokeStyle = hot ? col : T.line2;
        ctx.lineWidth = hot ? 3 : 2;
        ctx.stroke();
        drawArrow(ctx, x2 - 4, RAIL_Y, 0, 5.5, hot ? col : T.line2);
      };
      drawPipe(B.input.x + B.input.w, B.prelude.x, T.blue, state.u >= 0.08 && state.u <= 0.24);
      drawPipe(B.prelude.x + B.prelude.w, B.core.x, T.good, state.u >= 0.20 && state.u <= 0.45);
      drawPipe(B.core.x + B.core.w, B.coda.x, T.amber, state.u >= 0.74);
      drawPipe(B.coda.x + B.coda.w, B.output.x, T.amber, state.u >= 0.85);

      // EMERALD "RESET TO PRELUDE [v₀, v₁]" CONDUIT
      {
        const rx1 = B.prelude.x + B.prelude.w / 2;
        const rx2 = B.core.x + 24;
        const ryTop = 144;
        const hot = ev.resetGlow > 0.08;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rx1, B.prelude.y);
        ctx.lineTo(rx1, ryTop);
        ctx.lineTo(rx2, ryTop);
        ctx.lineTo(rx2, B.core.y - 4);
        ctx.strokeStyle = hot ? T.good : rgba(T.good, 0.48);
        ctx.lineWidth = hot ? 2.8 : 1.5;
        ctx.setLineDash([5, 4]);
        if (hot) ctx.lineDashOffset = -state.t * 32;
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, rx2, B.core.y - 4, Math.PI / 2, 5.2, hot ? T.good : rgba(T.good, 0.58));
        const mx = (rx1 + rx2) / 2;
        rrect(ctx, mx - 68, ryTop - 9, 136, 18, 9);
        ctx.fillStyle = T.bg;
        ctx.fill();
        ctx.strokeStyle = rgba(T.good, hot ? 0.9 : 0.45);
        ctx.lineWidth = hot ? 1.4 : 1;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `600 8.8px ${T.mono}`;
        ctx.fillStyle = T.good;
        ctx.fillText('Reset → Prelude [v₀, v₁]', mx, ryTop + 3);
        ctx.restore();
      }

      // PURPLE LOWER RETURN LOOP TRACK (runs cleanly along RET_Y = 372 right below Gate & d_2027!)
      {
        const lxRight = 590;
        const lxLeft = 294;
        const hot = ev.returnGlow > 0.08;
        const col = state.ablateD2027 ? T.red : T.purple;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(B.core.x + B.core.w, RAIL_Y + 14);
        ctx.quadraticCurveTo(lxRight, RAIL_Y + 14, lxRight, RAIL_Y + 32);
        ctx.lineTo(lxRight, RET_Y - 12);
        ctx.quadraticCurveTo(lxRight, RET_Y, lxRight - 12, RET_Y);
        ctx.lineTo(lxLeft + 12, RET_Y);
        ctx.quadraticCurveTo(lxLeft, RET_Y, lxLeft, RET_Y - 12);
        ctx.lineTo(lxLeft, RAIL_Y + 32);
        ctx.quadraticCurveTo(lxLeft, RAIL_Y + 14, B.core.x - 4, RAIL_Y + 14);
        ctx.strokeStyle = hot ? col : rgba(col, 0.40);
        ctx.lineWidth = hot ? 3.0 : 1.7;
        ctx.setLineDash([6, 4]);
        if (hot) ctx.lineDashOffset = -state.t * 34;
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, B.core.x - 4, RAIL_Y + 14, 0, 5.5, hot ? col : rgba(col, 0.52));

        [B.gate, B.d2027].forEach(bx => {
          ctx.beginPath();
          ctx.moveTo(bx.x + bx.w / 2, bx.y + bx.h);
          ctx.lineTo(bx.x + bx.w / 2, RET_Y);
          ctx.strokeStyle = hot ? col : rgba(col, 0.40);
          ctx.lineWidth = 1.6;
          ctx.stroke();
        });
        ctx.restore();
      }

      // DSPARK GOLD TAPS [v5, v23, v41, v48] (lines drawn behind cards; pill badges drawn cleanly on top of DSpark!)
      const dsHot = ev.draftAlpha > 0.05 && !state.ablateD2027;
      const dsparkTaps = [
        { x: B.prelude.x + B.prelude.w - 14, y: B.prelude.y + B.prelude.h, lbl: 'v5',  lit: ev.visit >= 5 },
        { x: coreSliceX(5) + 7,              y: B.core.y + B.core.h,       lbl: 'v23', lit: ev.visit >= 23 },
        { x: coreSliceX(11) + 7,             y: B.core.y + B.core.h,       lbl: 'v41', lit: ev.visit >= 41 },
        { x: B.output.x + B.output.w / 2,    y: B.output.y + B.output.h,   lbl: 'v48', lit: ev.visit >= 48 },
      ];
      {
        ctx.save();
        dsparkTaps.forEach(tp => {
          const activeTap = dsHot || tp.lit;
          ctx.beginPath();
          ctx.moveTo(tp.x, tp.y);
          ctx.lineTo(tp.x, B.dspark.y);
          ctx.strokeStyle = rgba(T.gold, dsHot ? 0.92 : (tp.lit ? 0.58 : 0.30));
          ctx.lineWidth = dsHot ? 1.8 : 1.1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, 2.8, 0, Math.PI * 2);
          ctx.fillStyle = activeTap ? T.amber : rgba(T.gold, 0.45);
          ctx.fill();
        });
        ctx.restore();
      }

      // ============================================ BAND 3: OPAQUE CLEAN STAGES
      const drawStageCard = (key, title, sub1, sub2, accent, hot) => {
        const b = B[key];
        const hov = state.hoverKey === key || state.inspectKey === key;
        fillOpaqueCard(b.x, b.y, b.w, b.h, 11, accent, hot ? 0.08 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.strokeStyle = hot || hov ? accent : T.line2;
        ctx.lineWidth = hot ? 2.2 : hov ? 1.8 : 1.2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `700 10.5px ${T.sans}`;
        ctx.fillStyle = accent;
        ctx.fillText(title, b.x + b.w / 2, b.y + 18);
        ctx.font = `600 9.3px ${T.mono}`;
        ctx.fillStyle = T.fg;
        ctx.fillText(sub1, b.x + b.w / 2, b.y + 33);
        ctx.font = `500 8.2px ${T.mono}`;
        ctx.fillStyle = T.fg3;
        ctx.fillText(sub2, b.x + b.w / 2, b.y + b.h - 8);
      };

      // 1) INPUT
      drawStageCard('input', '1 · INPUT', 'Tokens → v₀', '201K · d=2304', T.blue, ev.activeBox === 'input');
      {
        const b = B.input;
        for (let i = 0; i < 8; i++) {
          const h = 8 + ((i * 7 + state.exIdx * 3) % 13);
          ctx.fillStyle = i % 2 === 0 ? rgba(T.blue, 0.72) : rgba(T.good, 0.72);
          rrect(ctx, b.x + 17 + i * 8, b.y + 58 - h / 2, 5.5, h, 2);
          ctx.fill();
        }
      }

      // 2) PRELUDE (L0–L5)
      drawStageCard('prelude', '2 · PRELUDE', 'L0–L5 (1×)', '5 SW : 1 G · v₁', T.good, ev.activeBox === 'prelude');
      {
        const b = B.prelude;
        for (let i = 0; i < 6; i++) {
          const isGlb = i === 5;
          const isLit = ev.preSlice === i;
          const bx = b.x + 16 + i * 13;
          rrect(ctx, bx, b.y + 42, 9.5, 27, 3);
          ctx.fillStyle = isLit ? (isGlb ? T.blue : T.good) : rgba(isGlb ? T.blue : T.good, 0.24);
          ctx.fill();
          if (isGlb) {
            ctx.textAlign = 'center';
            ctx.font = `700 7.2px ${T.mono}`;
            ctx.fillStyle = isLit ? '#fff' : T.blue;
            ctx.fillText('G', bx + 4.75, b.y + 65);
          }
        }
      }

      // 3) THE 3× SHARED LOOP CORE (L6–L17: Block 2 → v₂ | Block 3 → v₃)
      {
        const b = B.core;
        const hot = ev.activeBox === 'core';
        const hov = state.hoverKey === 'core' || state.inspectKey === 'core';
        fillOpaqueCard(b.x, b.y, b.w, b.h, 14, T.purple, hot ? 0.06 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 14);
        ctx.strokeStyle = hot || hov ? T.purple : T.line2;
        ctx.lineWidth = hot ? 2.4 : hov ? 1.8 : 1.3;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `700 10.4px ${T.sans}`;
        ctx.fillStyle = T.purple;
        ctx.fillText('3 · 12 SHARED LAYERS (L6–L17)', b.x + b.w / 2, b.y + 18);

        // 3 Lap pills with exact visit ranges!
        const passMeta = ['Pass 1 · v6–17', 'Pass 2 · v18–29', 'Pass 3 · v30–41'];
        for (let lp = 1; lp <= 3; lp++) {
          const px = b.x + 10 + (lp - 1) * 78;
          const py = b.y + 26;
          const active = ev.lap === lp && hot;
          const done = ev.lap > lp || (ev.lap === lp && !hot && state.u > 0.36);
          rrect(ctx, px, py, 72, 17, 8.5);
          ctx.fillStyle = active ? T.purple : (done ? rgba(T.purple, 0.14) : T.subtle);
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.font = `700 7.9px ${T.mono}`;
          ctx.fillStyle = active ? '#fff' : (done ? T.purple : T.fg4);
          ctx.fillText(passMeta[lp - 1], px + 36, py + 11.4);
        }

        // Subtle vertical divider separating Block 2 (L6–L11) and Block 3 (L12–L17)
        const divX = b.x + b.w / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(divX, b.y + 50);
        ctx.lineTo(divX, b.y + 112);
        ctx.strokeStyle = rgba(T.line2, 0.8);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.restore();

        // 12 physical layer slices (Block 2: L6–L11 | Block 3: L12–L17)
        for (let i = 0; i < 12; i++) {
          const sx = coreSliceX(i);
          const sy = b.y + 51;
          const isGlb = i === 5 || i === 11; // L11, L17 Global
          const isLit = ev.coreSlice === i;
          rrect(ctx, sx, sy, 14, 42, 3.5);
          ctx.fillStyle = isLit
            ? (isGlb ? T.blue : T.purple)
            : rgba(isGlb ? T.blue : T.purple, isGlb ? 0.28 : 0.14);
          ctx.fill();

          if (isGlb) {
            ctx.textAlign = 'center';
            ctx.font = `700 7.4px ${T.mono}`;
            ctx.fillStyle = isLit ? '#fff' : T.blue;
            ctx.fillText('G', sx + 7, sy + 37);
          }

          if (isLit) {
            for (let e = 0; e < 4; e++) {
              const exY = sy + 6 + ((e * 8 + Math.floor(state.t * 14 + i * 3)) % 24);
              ctx.beginPath();
              ctx.arc(sx + 7, exY, 1.7, 0, Math.PI * 2);
              ctx.fillStyle = '#fff';
              ctx.fill();
            }
          }
        }

        // Crisp Block 2 / Block 3 labels directly beneath each 6-layer group!
        ctx.textAlign = 'center';
        ctx.font = `600 8.1px ${T.mono}`;
        ctx.fillStyle = T.fg3;
        ctx.fillText('Block 2 (L6–11) → v₂', b.x + b.w * 0.255, b.y + b.h - 11);
        ctx.fillText('Block 3 (L12–17) → v₃', b.x + b.w * 0.745, b.y + b.h - 11);
      }

      // 3b) RANK-64 CROSS-PASS GATE CARD
      {
        const b = B.gate;
        const hot = ev.activeBox === 'gate' || ev.returnGlow > 0.2;
        const hov = state.hoverKey === 'gate' || state.inspectKey === 'gate';
        const col = state.ablateD2027 ? T.red : T.purple;
        fillOpaqueCard(b.x, b.y, b.w, b.h, 9, col, hot ? 0.13 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 9);
        ctx.strokeStyle = hot || hov ? col : T.line2;
        ctx.lineWidth = hot ? 2 : 1.2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `700 9.1px ${T.sans}`;
        ctx.fillStyle = col;
        ctx.fillText('48 Rank-64 Gates', b.x + b.w / 2, b.y + 14);
        ctx.font = `500 8px ${T.mono}`;
        ctx.fillStyle = T.fg3;
        ctx.fillText(state.ablateD2027 ? 'degraded (ablated)' : 'κ⊙x + γ⊙m (0.11%)', b.x + b.w / 2, b.y + 26);
      }

      // 3c) GOODFIRE d_2027 BEACON CARD
      {
        const b = B.d2027;
        const isClean = ev.d2State === 'cleanup';
        const isRel = ev.d2State === 'relay';
        const isAbl = ev.d2State === 'ablated';
        const hov = state.hoverKey === 'd2027' || state.inspectKey === 'd2027';
        const col = isClean || isAbl ? T.red : T.purple;
        fillOpaqueCard(b.x, b.y, b.w, b.h, 9, col, (isClean || isRel || isAbl) ? 0.15 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 9);
        ctx.strokeStyle = isClean || isRel || isAbl || hov ? col : T.line2;
        ctx.lineWidth = isClean || isRel || isAbl ? 2 : 1.2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `700 9.1px ${T.mono}`;
        ctx.fillStyle = col;
        ctx.fillText('L17 · d₂₀₂₇', b.x + b.w / 2, b.y + 14);
        ctx.font = `600 8px ${T.mono}`;
        ctx.fillStyle = isClean || isAbl ? T.red : (isRel ? T.purple : T.fg4);
        ctx.fillText(isAbl ? '0.0 (ablated)' : isClean ? '−26.5 cleanup' : isRel ? '+32.4 relay!' : 'relay flag', b.x + b.w / 2, b.y + 26);
      }

      // 4) CODA (L18–L23, L20–23 MXFP8 + L23 Global!)
      drawStageCard('coda', '4 · CODA', 'L18–L23 (1×)', 'L20–23 MXFP8 · v₄', T.amber, ev.activeBox === 'coda');
      {
        const b = B.coda;
        for (let i = 0; i < 6; i++) {
          const isMx = i >= 2;
          const isGlb = i === 5;
          const isLit = ev.codaSlice === i;
          const bx = b.x + 12 + i * 12.5;
          rrect(ctx, bx, b.y + 42, 9, 27, 3);
          ctx.fillStyle = isLit
            ? (isGlb ? T.blue : (isMx ? T.amber : T.good))
            : rgba(isGlb ? T.blue : (isMx ? T.amber : T.good), 0.25);
          ctx.fill();
          if (isGlb) {
            ctx.textAlign = 'center';
            ctx.font = `700 7px ${T.mono}`;
            ctx.fillStyle = isLit ? '#fff' : T.blue;
            ctx.fillText('G', bx + 4.5, b.y + 65);
          }
        }
      }

      // 5) OUTPUT (Live Top-3 Probability Bars + softcap 30!)
      {
        const b = B.output;
        const hot = ev.activeBox === 'output' || ev.outLocked;
        const hov = state.hoverKey === 'output' || state.inspectKey === 'output';
        const accent = ablateFail ? T.red : (ev.outLocked ? T.good : T.amber);
        fillOpaqueCard(b.x, b.y, b.w, b.h, 11, accent, hot ? 0.08 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.strokeStyle = hot || hov ? accent : T.line2;
        ctx.lineWidth = hot ? 2.2 : hov ? 1.8 : 1.2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `700 10.5px ${T.sans}`;
        ctx.fillStyle = accent;
        ctx.fillText('5 · OUTPUT', b.x + b.w / 2, b.y + 18);

        ev.liveProbs.forEach((p, idx) => {
          const ry = b.y + 28 + idx * 15;
          ctx.textAlign = 'left';
          ctx.font = `700 8.4px ${T.mono}`;
          ctx.fillStyle = idx === 0 ? T.fg : T.fg3;
          ctx.fillText(p.tok, b.x + 9, ry + 7);
          const barX = b.x + 35, barW = 39;
          rrect(ctx, barX, ry + 1, barW, 6.2, 3.1);
          ctx.fillStyle = T.line;
          ctx.fill();
          rrect(ctx, barX, ry + 1, Math.max(2, barW * p.prob), 6.2, 3.1);
          ctx.fillStyle = idx === 0 ? accent : rgba(T.blue, 0.55);
          ctx.fill();
          ctx.textAlign = 'right';
          ctx.font = `600 8px ${T.mono}`;
          ctx.fillStyle = T.fg3;
          ctx.fillText(`${Math.round(p.prob * 100)}%`, b.x + b.w - 7, ry + 7);
        });

        ctx.textAlign = 'center';
        ctx.font = `500 8px ${T.mono}`;
        ctx.fillStyle = T.fg3;
        ctx.fillText('softcap 30 · 201K', b.x + b.w / 2, b.y + b.h - 7);
      }

      // 6) DSPARK SPECULATOR BAR
      {
        const b = B.dspark;
        const hot = ev.draftAlpha > 0.05 && !state.ablateD2027;
        const hov = state.hoverKey === 'dspark' || state.inspectKey === 'dspark';
        if (hot) fillOpaqueCard(b.x, b.y, b.w, b.h, 9, T.gold, 0.14);
        else { rrect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fillStyle = T.subtle; ctx.fill(); }
        rrect(ctx, b.x, b.y, b.w, b.h, 9);
        ctx.strokeStyle = hot || hov ? T.amber : T.line;
        ctx.lineWidth = hot ? 1.8 : 1.1;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = `700 9.1px ${T.sans}`;
        ctx.fillStyle = hot ? T.amber : T.fg3;
        ctx.fillText('DSPARK SPECULATOR (0.64 GB)', b.x + 14, b.y + 21.5);
        ctx.font = `500 8.7px ${T.mono}`;
        ctx.fillStyle = T.fg3;
        ctx.fillText('3L (2 SW + 1 GLB) · taps [v5, v23, v41, v48] → +7 drafts · ~4,400 tok/s', b.x + 188, b.y + 21.5);

        // Crisp foreground tap badges [v5, v23, v41, v48] cleanly straddling DSpark top edge!
        dsparkTaps.forEach(tp => {
          const activeTap = dsHot || tp.lit;
          rrect(ctx, tp.x - 13, b.y - 6.5, 26, 12.5, 6);
          ctx.fillStyle = T.bg;
          ctx.fill();
          ctx.strokeStyle = rgba(T.amber, activeTap ? 0.90 : 0.45);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.font = `700 7.4px ${T.mono}`;
          ctx.fillStyle = activeTap ? T.amber : T.fg4;
          ctx.fillText(tp.lbl, tp.x, b.y + 2.4);
        });
      }

      // ============================================ BAND 4: LIVE INTERNAL TELEMETRY STRIP (3 Clickable Gauges!)
      // GAUGE A: BLOCK ATTNRES MIX [v₀..v₄]
      {
        const b = B.attnres;
        const hov = state.hoverKey === 'attnres' || state.inspectKey === 'attnres';
        fillOpaqueCard(b.x, b.y, b.w, b.h, 11, T.good, ev.resetGlow > 0.15 ? 0.06 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.strokeStyle = hov ? T.blue : (ev.resetGlow > 0.15 ? T.good : T.line);
        ctx.lineWidth = hov ? 1.8 : 1.15;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = `700 8.8px ${T.sans}`;
        ctx.fillStyle = T.fg;
        ctx.fillText('BLOCK ATTNRES MIX', b.x + 12, b.y + 17);

        ctx.textAlign = 'right';
        ctx.font = `600 8px ${T.mono}`;
        ctx.fillStyle = ev.resetGlow > 0.15 ? T.good : (ev.crossMemActive ? T.purple : T.fg4);
        ctx.fillText(
          ev.resetGlow > 0.15
            ? 'RESET → [v₀, v₁]'
            : ev.crossMemActive
              ? `m₃ share: ${Math.round(ev.crossM3Share * 100)}%`
              : 'depth softmax',
          b.x + b.w - 12, b.y + 17
        );

        // 5 discrete residual blocks [v0, v1, v2, v3, v4]
        const blkMeta = [
          { lbl: 'v₀', sub: 'In',   col: T.blue },
          { lbl: 'v₁', sub: 'Pre',  col: T.good },
          { lbl: 'v₂', sub: 'B2',   col: T.purple },
          { lbl: 'v₃', sub: 'B3',   col: T.purple },
          { lbl: 'v₄', sub: 'Coda', col: T.amber },
        ];
        const barMaxH = 38;
        const baseY = b.y + 68;
        blkMeta.forEach((bm, idx) => {
          const wVal = ev.blkW[idx];
          const cx = b.x + 30 + idx * 48;
          // Track
          rrect(ctx, cx - 12, baseY - barMaxH, 24, barMaxH, 4);
          ctx.fillStyle = T.subtle;
          ctx.fill();
          // Live filled bar
          if (wVal > 0.01) {
            const fh = Math.max(4, barMaxH * wVal);
            rrect(ctx, cx - 12, baseY - fh, 24, fh, 4);
            ctx.fillStyle = rgba(bm.col, 0.82);
            ctx.fill();
          }
          // Percentage label
          ctx.textAlign = 'center';
          ctx.font = `700 7.6px ${T.mono}`;
          ctx.fillStyle = wVal > 0.01 ? T.fg : T.fg4;
          ctx.fillText(wVal > 0.01 ? `${Math.round(wVal * 100)}%` : '—', cx, baseY - barMaxH - 3.5);
          // Block label
          ctx.font = `700 8.2px ${T.mono}`;
          ctx.fillStyle = wVal > 0.01 ? bm.col : T.fg4;
          ctx.fillText(bm.lbl, cx, baseY + 11);
          ctx.font = `500 7.4px ${T.sans}`;
          ctx.fillStyle = T.fg4;
          ctx.fillText(bm.sub, cx, baseY + 21);
        });

        ctx.textAlign = 'center';
        ctx.font = `500 7.7px ${T.sans}`;
        ctx.fillStyle = T.fg4;
        ctx.fillText('Preserves raw v₀ · Pass 2–3 read prev B3 via gate', b.x + b.w / 2, b.y + b.h - 7);
      }

      // GAUGE B: INSIDE LAYER · SUBLAYER PIPELINE + LIVE 16×8 (8 / 128) MoE EXPERT MATRIX!
      {
        const b = B.moe;
        const hov = state.hoverKey === 'moe' || state.inspectKey === 'moe';
        const lObj = ev.physLayer >= 0 ? (layers[ev.physLayer] || {}) : null;
        const isMx = lObj && lObj.precision === 'MXFP8';
        const isGlb = lObj && lObj.attn === 'global';
        const moeCol = isMx ? T.amber : (isGlb ? T.blue : T.purple);

        fillOpaqueCard(b.x, b.y, b.w, b.h, 11, moeCol, lObj ? 0.045 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.strokeStyle = hov ? T.blue : T.line;
        ctx.lineWidth = hov ? 1.8 : 1.15;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = `700 8.8px ${T.sans}`;
        ctx.fillStyle = T.fg;
        ctx.fillText('INSIDE LAYER · MoE 8 / 128', b.x + 11, b.y + 17);

        ctx.textAlign = 'right';
        ctx.font = `600 8px ${T.mono}`;
        ctx.fillStyle = lObj ? moeCol : T.fg4;
        ctx.fillText(
          lObj ? `L${ev.physLayer} · ${isGlb ? 'Global' : 'SW-1024'} · ${lObj.precision}` : 'Waiting for L0',
          b.x + b.w - 11, b.y + 17
        );

        // 4-step live sublayer micro-pipeline!
        const steps = ['AttnRes', 'Conv4+Rel', 'MoE 8/128', 'SwiGLU'];
        const chipW = 58, chipGap = 7;
        let cx = b.x + 11;
        steps.forEach((st, idx) => {
          const lit = ev.subStep === idx && ev.physLayer >= 0;
          rrect(ctx, cx, b.y + 24, chipW, 15, 4.5);
          ctx.fillStyle = lit ? moeCol : T.subtle;
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.font = `600 7.4px ${T.mono}`;
          ctx.fillStyle = lit ? '#fff' : T.fg3;
          ctx.fillText(st, cx + chipW / 2, b.y + 34);
          if (idx < 3) {
            ctx.fillStyle = T.fg4;
            ctx.font = `600 8px ${T.sans}`;
            ctx.fillText('›', cx + chipW + 3.5, b.y + 34.5);
          }
          cx += chipW + chipGap;
        });

        // REAL 16 × 8 = 128 MoE Expert Matrix (8 active sparkling experts!)
        const activeSet = ev.physLayer >= 0 ? pickActiveExperts(state.exIdx, ev.physLayer, ev.lap) : new Set();
        const gx0 = b.x + 12, gy0 = b.y + 46;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 16; c++) {
            const idx = r * 16 + c;
            const on = activeSet.has(idx);
            const sx = gx0 + c * 9.0, sy = gy0 + r * 6.8;
            rrect(ctx, sx, sy, 6.8, 4.8, 1.4);
            ctx.fillStyle = on ? moeCol : rgba(T.line2, 0.55);
            ctx.fill();
          }
        }

        // Crisp live specs beside the 128-expert matrix
        const rx = b.x + 164;
        ctx.textAlign = 'left';
        ctx.font = `700 8.3px ${T.mono}`;
        ctx.fillStyle = lObj ? moeCol : T.fg3;
        ctx.fillText(isMx ? 'MXFP8 (8.25b)' : 'NVFP4 (4.5b)', rx, b.y + 56);
        ctx.font = `500 7.9px ${T.mono}`;
        ctx.fillStyle = T.fg2;
        ctx.fillText('24Q : 8KV · d128', rx, b.y + 69);
        ctx.fillText(lObj ? (lObj.kvConv === 'dynamic' ? 'Dyn ShortConv k=4' : 'Static Conv k=4') : 'ShortConv k=4', rx, b.y + 82);
        ctx.fillStyle = T.fg4;
        ctx.fillText('Pruned 384 → 128', rx, b.y + 95);
      }

      // GAUGE C: GOODFIRE d_2027 WAVEFORM SPARKLINE (L17 · v0→v48)!
      {
        const b = B.d2027_wave;
        const hov = state.hoverKey === 'd2027_wave' || state.inspectKey === 'd2027_wave' || state.inspectKey === 'd2027';
        const curVal = d2027AtVisit(ev.visit, state.ablateD2027);
        const curCol = state.ablateD2027 ? T.red : (curVal < -8 ? T.red : (curVal > 8 ? T.purple : T.fg3));

        fillOpaqueCard(b.x, b.y, b.w, b.h, 11, curCol, Math.abs(curVal) > 8 || state.ablateD2027 ? 0.06 : 0);
        rrect(ctx, b.x, b.y, b.w, b.h, 11);
        ctx.strokeStyle = hov ? T.blue : (state.ablateD2027 ? T.red : T.line);
        ctx.lineWidth = hov ? 1.8 : 1.15;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = `700 8.8px ${T.sans}`;
        ctx.fillStyle = T.fg;
        ctx.fillText('GOODFIRE d₂₀₂₇ (v0→v48)', b.x + 11, b.y + 17);

        ctx.textAlign = 'right';
        ctx.font = `700 8.2px ${T.mono}`;
        ctx.fillStyle = curCol;
        ctx.fillText(
          state.ablateD2027 ? '0.0 ABLATED' : `${curVal >= 0 ? '+' : ''}${curVal.toFixed(1)} RMS`,
          b.x + b.w - 11, b.y + 17
        );

        // Plot bounds
        const px0 = b.x + 28, px1 = b.x + b.w - 12;
        const py0 = b.y + 26, py1 = b.y + 85;
        const pw = px1 - px0, ph = py1 - py0;
        const yMin = -37, yMax = 44;
        const mapX = v => px0 + (v / 48) * pw;
        const mapY = val => py1 - ((val - yMin) / (yMax - yMin)) * ph;

        // Zero baseline
        const y0 = mapY(0);
        ctx.strokeStyle = T.line2;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(px0, y0); ctx.lineTo(px1, y0); ctx.stroke();
        ctx.setLineDash([]);

        // Tiny Y axis ticks (+32, 0, -26)
        ctx.textAlign = 'right';
        ctx.font = `500 7px ${T.mono}`;
        ctx.fillStyle = T.fg4;
        ctx.fillText('+32', px0 - 3, mapY(32) + 2.5);
        ctx.fillText('0', px0 - 3, y0 + 2.5);
        ctx.fillText('−26', px0 - 3, mapY(-26) + 2.5);

        // Faint ghost reference curve when ablated so user sees what was wiped!
        if (state.ablateD2027) {
          ctx.beginPath();
          for (let s = 0; s <= 96; s++) {
            const v = (s / 96) * 48;
            const x = mapX(v), y = mapY(d2027AtVisit(v, false));
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = rgba(T.purple, 0.20);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        // Actual d_2027 waveform curve (purple positive relay peaks, red negative cleanup plunge!)
        ctx.lineWidth = 1.8;
        for (let s = 0; s < 96; s++) {
          const vA = (s / 96) * 48, vB = ((s + 1) / 96) * 48;
          const valA = d2027AtVisit(vA, state.ablateD2027);
          const valB = d2027AtVisit(vB, state.ablateD2027);
          ctx.beginPath();
          ctx.moveTo(mapX(vA), mapY(valA));
          ctx.lineTo(mapX(vB), mapY(valB));
          ctx.strokeStyle = state.ablateD2027 ? T.red : ((valA + valB) < -4 ? T.red : T.purple);
          ctx.stroke();
        }

        // Compact peak labels on chart (clean clearance above/below playhead!)
        if (!state.ablateD2027) {
          ctx.textAlign = 'center';
          ctx.font = `700 7px ${T.mono}`;
          ctx.fillStyle = T.purple;
          ctx.fillText('P1', mapX(17), mapY(32.4) - 5.5);
          ctx.fillText('P2', mapX(29), mapY(32.4) - 5.5);
          ctx.fillStyle = T.red;
          ctx.fillText('P3', mapX(41), mapY(-26.5) + 10.5);
        }

        // Live moving playhead hairline & glowing dot!
        const phX = mapX(ev.visit);
        const phY = mapY(curVal);
        ctx.beginPath();
        ctx.moveTo(phX, py0);
        ctx.lineTo(phX, py1);
        ctx.strokeStyle = rgba(ev.orbCol, 0.45);
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(phX, phY, 4.0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = curCol;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = `500 7.7px ${T.sans}`;
        ctx.fillStyle = T.fg4;
        ctx.fillText('1 of 2,304 dims · 45.6% sq. norm at L17', b.x + b.w / 2, b.y + b.h - 7);
      }

      // ============================================ LUMINOUS THOUGHT ORB!!
      {
        const drawX = ev.outLocked ? outOrbX : ev.ox;
        const drawY = ev.outLocked ? outOrbY : ev.oy;

        const g = ctx.createRadialGradient(drawX, drawY, 2, drawX, drawY, 22);
        g.addColorStop(0, rgba(ev.orbCol, 0.62));
        g.addColorStop(0.5, rgba(ev.orbCol, 0.20));
        g.addColorStop(1, rgba(ev.orbCol, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(drawX, drawY, 22, 0, Math.PI * 2); ctx.fill();

        ctx.beginPath();
        ctx.arc(drawX, drawY, 7.0, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = ev.orbCol;
        ctx.lineWidth = 2.8;
        ctx.stroke();

        // Dedicated zero-overlap floating thought bubble placement!
        ctx.font = `700 9.1px ${T.mono}`;
        const bw = ctx.measureText(ev.bubble).width + 16;
        let bx = clamp(drawX - bw / 2, 16, WW - bw - 16);
        let by = 176;
        if (ev.bubblePos === 'above') {
          by = B.input.y - 28;
        } else if (ev.bubblePos === 'below-core') {
          by = B.core.y + B.core.h + 7; // y = 303 — clean open lane between Core & Gate/d_2027!
        } else if (ev.bubblePos === 'below-return') {
          by = RET_Y + 10; // y = 382 — clean open lane below return track & above DSpark!
        } else if (ev.bubblePos === 'output-beam') {
          bx = clamp(drawX + 14, 16, WW - bw - 16);
          by = clamp(drawY - 9.5, 100, 174);
        }
        rrect(ctx, bx, by, bw, 19, 9.5);
        ctx.fillStyle = ev.orbCol;
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(ev.bubble, bx + bw / 2, by + 12.6);
      }

      // Subtle architectural spec footer strip
      ctx.textAlign = 'left';
      ctx.font = `500 8.3px ${T.mono}`;
      ctx.fillStyle = T.fg4;
      ctx.fillText('26.4B total · 5.4B active (3.4B unique) · 19.53 GB NVFP4 · 8 Global KV (32 GiB @ 1M)', 30, WH - 9);

      ctx.textAlign = 'right';
      ctx.font = `500 8.5px ${T.sans}`;
      ctx.fillStyle = T.fg4;
      ctx.fillText('Click any block or gauge to inspect math & code', WW - 28, WH - 9);

      ctx.restore();
    }

    // ----------------------------------- Progressive-Disclosure Inspector Sheet
    function renderCodeBlock(key, title) {
      const sn = D.codeSnippets && D.codeSnippets[key];
      if (!sn) return '';
      const gh = `${D.meta.transformersUrl}#L${sn.startLine}-L${sn.endLine}`;
      return `
        <div class="ink-code-wrap">
          <div class="ink-code-head">
            <span>${esc(title)} · L${sn.startLine}–${sn.endLine}</span>
            <a href="${esc(gh)}" target="_blank" rel="noopener">GitHub ↗</a>
          </div>
          <pre class="ink-code-pre">${highlightPython(sn.code, sn.startLine)}</pre>
        </div>
      `;
    }

    function renderVarloopMiniTable() {
      const topRows = (D.varloop || []).slice(0, 4);
      if (!topRows.length) return '';
      return `
        <table class="ink-sheet-tbl">
          <thead>
            <tr><th>TML-d24-varloop Eval</th><th>1×</th><th>2×</th><th class="hi">3×</th><th>5×</th></tr>
          </thead>
          <tbody>
            ${topRows.map(r => `
              <tr>
                <td>${esc(r.name.replace(/\s*\([^)]*\)/g, ''))}</td>
                <td>${r.passes[0]}%</td>
                <td>${r.passes[1]}%</td>
                <td class="hi">${r.passes[2]}%</td>
                <td>${r.passes[4]}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    function renderGoodfireReadersTable() {
      const rows = (D.goodfire && D.goodfire.layer13Readers) || [];
      if (!rows.length) return '';
      return `
        <table class="ink-sheet-tbl">
          <thead>
            <tr><th>L13 AttnRes Reader</th><th class="hi">d₂₀₂₇ share</th><th>Top-5 dims</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><code>${esc(r.reader)}</code></td>
                <td class="hi">${r.d2027Pct}%</td>
                <td>${r.top5Pct}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    function openSheet(key) {
      const normKey = key === 'd2027_wave' ? 'd2027' : key;
      state.inspectKey = normKey;
      if (!normKey) { sheetEl.hidden = true; return; }
      sheetEl.hidden = false;

      const close = `<button type="button" class="ink-sheet-close" data-close aria-label="Close">✕</button>`;
      const specs = {
        input: {
          title: '1 · Input Embedding & ViT (Block 0 · v₀)',
          desc: 'Prompt tokens (201,024 vocab, d = 2,304) and optional 20×20 image patches from the 23-layer Perception ViT (292M, d = 1,024) RMS-normalize into v₀. Block Attention Residuals preserve v₀ untouched for every downstream layer.',
          stats: [['Vocabulary', '201,024 (200,058)'], ['Hidden Dim', 'd = 2,304'], ['Vision Encoder', '23L ViT · 292M'], ['Max Context', '1,048,576 tok']],
          code: ['blockAttnRes', 'Inkling2LoopBlockAttentionResidual'],
        },
        prelude: {
          title: '2 · Prelude (Layers L0–L5 · runs once)',
          desc: 'Six physical layers run once per token (visits v1–v5): 5 sliding-window layers (1,024 tokens, static k=4 short conv, hidden-conditioned RelBias, NoPE) plus 1 global layer at L5 with dynamic k=4 conv, log-length scaling (floor 8,192, α = 0.1), and 3 separate AttnRes queries (Q, K, V).',
          stats: [['Attention Ratio', '5 SW : 1 Global'], ['Heads (GQA)', '24 Q : 8 KV (d=128)'], ['RelBias', 'd_rel=16 · ext 1024'], ['DSpark Tap #1', 'Visit v5 (L5)']],
          code: ['relPosBias', 'Inkling2LoopRelativePositionBias'],
        },
        core: {
          title: '3 · Loop Core (12 Shared Layers × 3 Passes)',
          desc: 'Layers L6–L17 execute three times on identical stored weights (cutting weight storage in half), grouped into Block 2 (L6–L11 → v₂) and Block 3 (L12–L17 → v₃) with separate per-pass KV caches (only 8 global visits scale with context = 32 GiB @ 1M vs 192 GiB all-global).',
          stats: [['Stored → Visits', '24L → 48 visits'], ['Eff. Active', '5.4B (3.4B unique)'], ['Checkpoint', '19.53 GB NVFP4'], ['KV @ 1M Context', '32 GiB (8 global)']],
          extraHtml: renderVarloopMiniTable(),
          code: ['textLoopForward', 'Inkling2LoopTextModel.forward'],
          ablate: true,
        },
        gate: {
          title: '48 Rank-64 Cross-Pass Message Gates',
          desc: 'Every loop pass resets its active depth blocks to Prelude [v₀, v₁] and pulls Pass t−1’s Block 2 & Block 3 exclusively through 48 rank-64 keep/gain controllers: κ = 1 − tanh(Fz), γ = tanh(Gz), x′ = κ⊙x + γ⊙m. Zero-init makes extra passes start as identity.',
          stats: [['Controllers', '48 (Q, K, V, MoE)'], ['Bottleneck Rank', 'r = 64'], ['Total Params', '28.31M (0.11%)'], ['Block 3 Share', '~85% dominant']],
          code: ['messageGate', 'Inkling2LoopMessageGate'],
          ablate: true,
        },
        d2027: {
          title: 'Goodfire Discovery · Coordinate d₂₀₂₇ (L17)',
          desc: 'Goodfire found that a single coordinate out of 2,304 — d₂₀₂₇ — spikes to +32.4 RMS-norm (45.6% of total squared norm!) at L17 on Passes 1 & 2 so Pass 2/3 readers lock onto Block 3, then fires a sharp negative cleanup spike on Pass 3 before Coda.',
          stats: [['Peak RMS-Norm', '+32.4 (Pass 1–2)'], ['Sq. Norm Share', '45.6% (1 of 2304)'], ['Pass 3 Action', '−26.5 cleanup'], ['Total Readers', '56 depth + 48 cross']],
          extraHtml: renderGoodfireReadersTable(),
          code: ['fullLoop', 'Inkling2LoopFullLoopDecoderLayer'],
          ablate: true,
        },
        attnres: {
          title: 'Block Attention Residuals ([v₀, v₁, v₂, v₃, v₄])',
          desc: 'Instead of a single additive residual stream, every 6 physical layers accumulate into a discrete RMS-normalized block vector. Downstream layers compute learned depth-wise softmax weights over all prior blocks (and global layers learn 3 separate queries for Q, K, and V).',
          stats: [['Block Size', '6 physical layers'], ['Depth Readers', '56 learned queries'], ['Cross Readers', '48 cross-pass'], ['Loop Reset', 'Resets to [v₀, v₁]']],
          code: ['blockAttnRes', 'Inkling2LoopBlockAttentionResidual'],
        },
        moe: {
          title: 'Inside Each Layer · Pruned 128-Expert MoE',
          desc: 'Every layer runs AttnRes → ShortConv (k=4, static on SW / dynamic on Global) + NoPE RelBias + Attention Sink + σ-Gated Output → Top-8 of 128 MoE (pruned from 384 during training, d_ff = 1,152, route scale 8.0) → Softcapped SwiGLU (gate 4.0, up 25.0).',
          stats: [['Active Experts', '8 / 128 (from 384)'], ['MoE Parameters', '24.46B (92.7%)'], ['L0–L19 MoE', 'NVFP4 (4.5 b/p)'], ['L20–L23 MoE', 'MXFP8 (8.25 b/p)']],
          code: ['topKRouter', 'Inkling2LoopTopKRouter'],
        },
        coda: {
          title: '4 · Coda (Layers L18–L23 · MXFP8 Tail)',
          desc: 'Runs once after exiting the loop (visits v42–v47) to translate refined latent thoughts into Block 4 (v₄). While L0–L19 store MoE weights in native 4.5-bit NVFP4 (with stochastic-rounding MXFP8 backward), L20–L23 stay in 8.25-bit MXFP8.',
          stats: [['L18–L19 MoE', 'NVFP4 (4.5 b/p)'], ['L20–L23 MoE', 'MXFP8 (8.25 b/p)'], ['SwiGLU Caps', 'gate 4.0 / up 25.0'], ['L23 Global', 'Dynamic Conv4']],
          code: ['softcapSwiGLU', 'Inkling2LoopSoftcappedSwiGLU'],
        },
        output: {
          title: '5 · Final AttnRes & Softcapped Logits',
          desc: 'Final depth-wise Block AttnRes mixes all five blocks [v₀, v₁, v₂, v₃, v₄] through RMSNorm into the 201,024-token unembedding matrix (0.93B embed+unembed params), softcapped at 30.0 before softmax sampling.',
          stats: [['Final Mix', '[v₀, v₁, v₂, v₃, v₄]'], ['Logit Softcap', '30.0'], ['Embed + Unembed', '0.93B params'], ['License', 'Apache 2.0']],
          code: ['textLoopForward', 'Inkling2LoopTextModel.forward'],
        },
        dspark: {
          title: 'DSpark 3-Layer MTP Speculator (0.64 GB)',
          desc: 'Shipped directly inside the checkpoint (mtp.safetensors), DSpark reads hidden states tapped at visits [5, 23, 41, 48] and proposes up to 7 continuation tokens per verification step (block size 8) — serving ~4,400 tok/s/GPU on 1× GB200.',
          stats: [['Target Taps', '[v5, v23, v41, v48]'], ['Draft Layers', '3 (2 SW + 1 GLB)'], ['Checkpoint Size', '0.64 GB'], ['1× GB200 Speed', '~4,400 tok/s/GPU']],
          code: ['textLoopForward', 'Inkling2LoopTextModel.forward'],
        },
      };

      const sp = specs[normKey] || specs.core;
      sheetEl.innerHTML = `
        <div class="ink-sheet-top"><h3 class="ink-sheet-title">${esc(sp.title)}</h3>${close}</div>
        <p class="ink-sheet-desc">${esc(sp.desc)}</p>
        <div class="ink-sheet-stats">
          ${sp.stats.map(([k, v]) => `<div class="ink-stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
        </div>
        ${sp.extraHtml || ''}
        ${sp.ablate ? `
          <div class="ink-ablate-row">
            <span><b>Experiment:</b> Zero out d₂₀₂₇ at L17 and watch Pass 2–3 break</span>
            <button type="button" class="ink-ablate-btn" data-ablate aria-pressed="${state.ablateD2027}">${state.ablateD2027 ? 'Restore d₂₀₂₇' : 'Ablate d₂₀₂₇'}</button>
          </div>
        ` : ''}
        ${renderCodeBlock(sp.code[0], sp.code[1])}
      `;

      $('[data-close]', sheetEl)?.addEventListener('click', () => openSheet(null));
      $('[data-ablate]', sheetEl)?.addEventListener('click', () => {
        state.ablateD2027 = !state.ablateD2027;
        openSheet(state.inspectKey);
      });
    }

    // --------------------------------------------------- Pointer Hit Testing
    function hitCanvas(ev) {
      const r = canvas.getBoundingClientRect();
      const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      const scale = Math.min(CW / WW, CH / WH);
      const wx = (sx - (CW - WW * scale) / 2) / scale;
      const wy = (sy - (CH - WH * scale) / 2) / scale;
      for (const [key, b] of Object.entries(BOXES)) {
        if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return key;
      }
      return null;
    }

    canvas.addEventListener('pointermove', ev => {
      const hit = hitCanvas(ev);
      state.hoverKey = hit;
      canvas.classList.toggle('hovering', !!hit);
    });
    canvas.addEventListener('mouseleave', () => {
      state.hoverKey = null;
      canvas.classList.remove('hovering');
    });
    canvas.addEventListener('click', ev => {
      const hit = hitCanvas(ev);
      const norm = hit === 'd2027_wave' ? 'd2027' : hit;
      if (norm) openSheet(state.inspectKey === norm ? null : norm);
      else if (state.inspectKey) openSheet(null);
    });

    // --------------------------------------------------- Minimal Controls
    function syncPlay() {
      playBtn.setAttribute('aria-pressed', String(state.playing));
      playBtn.textContent = state.playing ? '❚❚ Pause' : '▶ Play';
    }

    all('[data-ex]', shell).forEach(btn => {
      btn.addEventListener('click', () => {
        state.exIdx = Number(btn.dataset.ex);
        all('[data-ex]', shell).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.ex) === state.exIdx)));
        state.u = 0;
        state.playing = true;
        syncPlay();
      });
    });

    playBtn.addEventListener('click', () => {
      state.playing = !state.playing;
      syncPlay();
    });

    scrubEl.addEventListener('input', e => {
      state.playing = false;
      syncPlay();
      state.u = Number(e.target.value) / 1000;
    });

    chapBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const ch = CHAPTERS[Number(btn.dataset.chap)];
        state.playing = false;
        syncPlay();
        state.u = ch.u;
      });
    });

    expandBtn.addEventListener('click', () => {
      state.fullscreen = !state.fullscreen;
      fig.classList.toggle('ink-fullscreen', state.fullscreen);
      expandBtn.textContent = state.fullscreen ? '✕' : '⤢';
      document.body.style.overflow = state.fullscreen ? 'hidden' : '';
      requestAnimationFrame(resize);
    });

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) return;
      const r = rootFig.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;
      if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); state.playing = false; syncPlay(); state.u = clamp(state.u + 0.08, 0, 0.99); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); state.playing = false; syncPlay(); state.u = clamp(state.u - 0.08, 0, 0.99); }
      else if (e.key === 'Escape') {
        if (state.inspectKey) openSheet(null);
        else if (state.fullscreen) expandBtn.click();
      }
    });

    // Wire prose <a class="act" href="#ink-mega" ...> deep links!
    all('a.act[href="#ink-mega"]').forEach(a => {
      a.addEventListener('click', ev => {
        ev.preventDefault();
        const ds = a.dataset;
        if (ds.ex !== undefined) {
          state.exIdx = Number(ds.ex);
          all('[data-ex]', shell).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.ex) === state.exIdx)));
        }
        if (ds.u !== undefined) {
          state.playing = false;
          syncPlay();
          state.u = clamp(Number(ds.u), 0, 1);
        }
        if (ds.inspect) openSheet(ds.inspect);
        else openSheet(null);
        rootFig.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      });
    });

    new ResizeObserver(() => resize()).observe(wrap);
    resize();

    let lastTs = 0;
    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      state.t += dt;
      if (state.playing && !state.inspectKey) {
        state.u = (state.u + dt / 16.0) % 1.0; // Calm, readable 16s movie loop
      }
      drawFrame();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  fetch(rootFig.dataset.src)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(D => mountWalkthrough(rootFig, D))
    .catch(err => console.error('Inkling 2 Mini Walkthrough failed:', err));
})();
