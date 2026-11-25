/* Upgraded 3D, Physics, Reactor, and Cosmic Observatory Visualizations
   for 'Why matrix multiplication stops at nine fourths'.
   Zero dependencies · 60fps HiDPI Canvas · Real 3D Phong lighting & glass shaders:
     1. #mm-history  — 57-Year Shockwave Replay + Live Draggable 3D Matrix Tensor Cube T_n & Wall
     2. #mm-tripod   — True 3D Negatively Curved CAT(0) Saddle-Tripod + Normal-Mapped Simplex Relief
     3. #mm-rect     — 44x44 Phong-Lit 3D Rectangular Exponent Mountain + 3D Isometric Matrix Multiplier
     4. #mm-fermion  — True 3D Orbitable Glass Riemann Sphere (P^1) + Complex Pole Glow + 3D Wormhole Seam
     5. #mm-engine   — Live 96-Node Physical Tensor-Network Compression Reactor + Shattering w^σ Barrier
     6. #mm-map      — Pan/Zoom/Fullscreen Cosmic Radial Proof Singularity (28 .tex files · 48 decls · Lean 4)
*/
(function () {
  'use strict';

  const figs = [...document.querySelectorAll('figure.mm')];
  if (!figs.length) return;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hRand = i => {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtCompact(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return fmtInt(n);
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
      fg4: g('--fg4') || '#676767',
      fg5: g('--fg5') || '#969696',
      line: g('--line') || '#e6e5e3',
      line2: g('--line-2') || '#c8c7c4',
      blue: g('--accent') || '#0155bf',
      azure: g('--brand-azure') || '#0387e7',
      good: g('--good') || '#0e9972',
      amber: g('--amber') || '#b57614',
      gold: g('--brand-amber') || '#f7a224',
      bad: g('--bad') || '#ad2111',
      purple: g('--purple') || '#8f3f71',
      teal: '#1d6f72',
      sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      serif: '"Iowan Old Style", "Newsreader", Charter, Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    };
  }

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

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
    else ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
  }

  function haloText(ctx, str, x, y, color, bg, align = 'left', font = null) {
    if (font) ctx.font = font;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = bg;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function sizeCanvas(canvas, desktopH, mobileH) {
    const parent = canvas.parentElement;
    const w = Math.max(280, Math.round(parent.clientWidth || 860));
    const stacked = w < 620;
    const h = stacked && mobileH ? mobileH : Math.round(desktopH * clamp(w / 860, 0.78, 1.05));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, stacked };
  }

  function canvasXY(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const cy = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function insertShell(fig, html) {
    const cap = fig.querySelector('figcaption');
    const shell = document.createElement('div');
    shell.className = 'mm-shell';
    shell.innerHTML = html;
    fig.insertBefore(shell, cap || null);
    fig.style.removeProperty('--reserve');
    return shell;
  }

  function renderMathSafe(el) {
    if (window.BlogMath && typeof window.BlogMath.render === 'function') window.BlogMath.render(el);
  }

  // Subtle opt-in Web Audio harmonic synthesizer (only plays if user clicks Sound)
  const Sound = {
    enabled: false, ctx: null, master: null, lastAt: 0,
    notes: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00],
    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        this.init();
        this.chime(5, 0.14);
      }
      document.querySelectorAll('[data-sound-btn]').forEach(b => {
        b.setAttribute('aria-pressed', String(this.enabled));
        b.textContent = this.enabled ? '🔊 Sound' : '🔇 Sound';
      });
    },
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.ctx.destination);
      } catch {}
    },
    chime(idx = 4, vol = 0.12, chord = false) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastAt < 0.045) return;
      this.lastAt = now;
      const base = this.notes[clamp(Math.round(idx), 0, this.notes.length - 1)];
      const freqs = chord ? [base, base * 1.25, base * 1.5] : [base];
      freqs.forEach((fq, k) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = chord ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(fq, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(vol / (k + 1), now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + (chord ? 0.55 : 0.25));
        o.connect(g); g.connect(this.master);
        o.start(now); o.stop(now + 0.6);
      });
    },
  };

  function rectOmega(a, b, c) {
    const arr = [Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)].sort((u, v) => v - u);
    const [x, y, z] = arr;
    if (z <= 1e-12) return x + y;
    const ex = Math.max(0, (x + y) * z - x * y);
    return x + y + (ex * ex) / (4 * x * y * z);
  }

  function tripodDStar(a1, a2, a3) {
    if (a1 <= 1e-6 || a2 <= 1e-6 || a3 <= 1e-6) return a1 + a2 + a3;
    return (a1 + a2 + a3) - 1 / (1 / a1 + 1 / a2 + 1 / a3);
  }

  function highlightLean(code) {
    const kws = new Set(['import', 'namespace', 'end', 'theorem', 'def', 'abbrev', 'structure', 'inductive',
      'private', 'by', 'let', 'in', 'have', 'obtain', 'calc', 'unfold', 'congr', 'ext', 'simp', 'only',
      'apply', 'intro', 'rw', 'rcases', 'change', 'split_ifs', 'dsimp', 'grind', 'exact', 'show', 'ring',
      'sorry', 'open', 'scoped', 'variable', 'section', 'noncomputable', 'fun', 'where', 'Prop', 'Type']);
    const lines = code.replace(/\r/g, '').split('\n');
    return lines.map((line, i) => {
      const ln = `<span class="ln">${i + 1}</span>`;
      const ci = line.indexOf('--');
      const raw = ci >= 0 ? line.slice(0, ci) : line;
      const cm = ci >= 0 ? `<span class="cm">${esc(line.slice(ci))}</span>` : '';
      const hi = esc(raw).replace(/(\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_']*\b)/g, m => {
        if (/^\d/.test(m)) return `<span class="num">${m}</span>`;
        if (kws.has(m)) return `<span class="kw">${m}</span>`;
        if (/^[A-Z]/.test(m)) return `<span class="ty">${m}</span>`;
        return m;
      });
      return ln + hi + cm;
    }).join('\n');
  }

  const controllers = new Map();

  // =========================================================================
  // FIGURE 1: #mm-history — 57-Year Shockwave Replay + 3D Tensor Cube T_n & Wall
  // =========================================================================
  function initHistory(fig, data) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs" role="tablist">
          <button type="button" data-tab="race" aria-pressed="true">57-year race (1969–2026)</button>
          <button type="button" data-tab="finite" aria-pressed="false">3D Tensor Tₙ &amp; finite wall</button>
        </div>
        <div class="mm-actions" data-race-acts>
          <button type="button" class="mm-btn primary" data-replay>▶ Replay 57 yrs</button>
          <button type="button" class="mm-btn" data-zoom aria-pressed="false">Zoom: Fall 2026</button>
          <button type="button" class="mm-btn" data-sound-btn aria-pressed="false">🔇 Sound</button>
        </div>
        <div class="mm-actions" data-finite-acts hidden>
          <button type="button" class="mm-btn" data-n="2">n = 2 (Strassen 7)</button>
          <button type="button" class="mm-btn" data-n="16">n = 16</button>
          <button type="button" class="mm-btn primary" data-n="256">n = 256 (Sun)</button>
          <button type="button" class="mm-btn" data-n="1024">n = 1,024</button>
        </div>
      </div>
      <div class="mm-legend" data-legend></div>
      <div class="mm-stage">
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-foot">
        <div class="mm-controls-row" data-finite-slider hidden>
          <div class="mm-slider">
            <label for="mm-n-range">Matrix side n</label>
            <input id="mm-n-range" type="range" min="1" max="10" step="0.02" value="8">
            <output>256</output>
          </div>
        </div>
        <div class="mm-readout" data-readout></div>
        <p class="mm-note" data-note></p>
      </div>
    `);

    const canvas = shell.querySelector('canvas');
    const legendEl = shell.querySelector('[data-legend]');
    const readoutEl = shell.querySelector('[data-readout]');
    const noteEl = shell.querySelector('[data-note]');
    const tabBtns = [...shell.querySelectorAll('[data-tab]')];
    const raceActs = shell.querySelector('[data-race-acts]');
    const finiteActs = shell.querySelector('[data-finite-acts]');
    const finiteSliderRow = shell.querySelector('[data-finite-slider]');
    const nRange = shell.querySelector('#mm-n-range');
    const nOut = finiteSliderRow.querySelector('output');
    const zoomBtn = shell.querySelector('[data-zoom]');
    const replayBtn = shell.querySelector('[data-replay]');
    shell.querySelector('[data-sound-btn]').addEventListener('click', () => Sound.toggle());

    const upper = data.history.upper;
    const state = {
      tab: 'race',
      zoomTarget: 0,
      zoomCur: 0,
      selectedIdx: upper.length - 1,
      replaying: false,
      replayProg: 1, // 0..1
      shockR: 0,
      nVal: 256,
      cubeYaw: 0.62,
      cubePitch: 0.48,
      cubeSlice: 0,
      dragMode: null,
      lastX: 0, lastY: 0,
      pulse: 0,
      visible: true,
    };

    function updateChrome() {
      tabBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)));
      raceActs.hidden = state.tab !== 'race';
      finiteActs.hidden = state.tab !== 'finite';
      finiteSliderRow.hidden = state.tab !== 'finite';
      zoomBtn.setAttribute('aria-pressed', String(state.zoomTarget > 0.5));
      replayBtn.setAttribute('aria-pressed', String(state.replaying));
      if (state.tab === 'race') {
        legendEl.innerHTML = `
          <span class="blue"><i></i>Upper bound ω (algorithms)</span>
          <span class="bad"><i></i>Lower bound ω (Nov 24, 2026: 9/4)</span>
          <span class="amber"><i></i>Fall 2026 polynomial cliff</span>
        `;
      } else {
        legendEl.innerHTML = `
          <span class="blue"><i></i>3D Tensor Tₙ · rank ≥ ⌈n^(9/4)⌉</span>
          <span class="good"><i></i>Circuit gates ≥ ⌈n^(9/4)/2⌉</span>
          <span class="bad"><i></i>Sun's refuted 2¹⁷ claim (n=256)</span>
          <span class="dash"><i></i>Prior LBs (Bläser, Landsberg–Michałek)</span>
        `;
      }
      updateReadout();
    }

    function updateReadout() {
      if (state.tab === 'race') {
        const pt = upper[state.selectedIdx];
        const sealed = state.replayProg >= 0.99;
        readoutEl.innerHTML = `
          <span class="mm-kv"><span class="mm-k">Milestone</span><span class="mm-v">${esc(pt.date)} · ${esc(pt.label)}</span></span>
          <span class="mm-kv"><span class="mm-k">Upper ω</span><span class="mm-v blue">${pt.omega.toFixed(6)}</span></span>
          <span class="mm-kv"><span class="mm-k">Lower ω</span><span class="mm-v bad">${(pt.era === 'exact' && sealed) ? '2.250000 (EXACT)' : '2.000000 (trivial)'}</span></span>
        `;
        noteEl.innerHTML = `<b>${esc(pt.authors)}:</b> ${esc(pt.note)}`;
      } else {
        const n = state.nVal;
        const n94 = Math.ceil(Math.pow(n, 2.25) - 1e-12);
        const gates = Math.ceil(Math.pow(n, 2.25) / 2 - 1e-12);
        const blaser = Math.max(n * n, Math.round(2.5 * n * n - 3 * n));
        readoutEl.innerHTML = `
          <span class="mm-kv"><span class="mm-k">Side n</span><span class="mm-v">${fmtInt(n)}</span></span>
          <span class="mm-kv"><span class="mm-k">Rank ≥ ⌈n^(9/4)⌉</span><span class="mm-v blue">${fmtInt(n94)}</span></span>
          <span class="mm-kv"><span class="mm-k">Gates ≥ ⌈n^(9/4)/2⌉</span><span class="mm-v good">${fmtInt(gates)}</span></span>
          <span class="mm-kv"><span class="mm-k">Prior LB (Bläser)</span><span class="mm-v amber">${fmtInt(blaser)}</span></span>
          <span class="mm-kv"><span class="mm-k">Naive n³</span><span class="mm-v">${fmtCompact(n * n * n)}</span></span>
        `;
        if (Math.abs(n - 256) <= 6) {
          noteEl.innerHTML = `<b>At n = 2⁸ = 256:</b> Corollary 1.2 forces geometric border rank ≥ <b>2¹⁸ = 262,144</b> (and ≥ 131,072 nonlinear gates), refuting Sun's proposed 2¹⁷ = 131,072 border-rank bound and beating Strassen's tight-tensor prediction (n² = 65,536) by 4×.`;
        } else {
          noteEl.innerHTML = `<b>Orbit the 3D tensor cube Tₙ on the left:</b> every glowing node is one triple (i,j,k). Strassen covers the 2×2×2 cube in 7 rank-1 slices; Corollary 1.2 proves every n×n×n cube needs at least <b>⌈n^(9/4)⌉ = ${fmtInt(n94)}</b>.`;
        }
      }
    }

    function drawRace(ctx, w, h, T) {
      const pad = { l: w < 520 ? 44 : 56, r: w < 520 ? 18 : 28, t: 24, b: 38 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const z = state.zoomCur;
      const xMin = lerp(1968.2, 2026.58, z), xMax = lerp(2028.2, 2026.94, z);
      const yMin = lerp(1.94, 2.18, z), yMax = lerp(3.07, 2.41, z);
      const sx = yr => pad.l + ((yr - xMin) / (xMax - xMin)) * pw;
      const sy = om => pad.t + ((yMax - om) / (yMax - yMin)) * ph;

      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);

      const yTicks = z > 0.5 ? [2.20, 2.25, 2.30, 2.35, 2.40] : [2.0, 2.25, 2.5, 2.75, 3.0];
      ctx.font = `500 10.5px ${T.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const yt of yTicks) {
        const y = sy(yt);
        if (y < pad.t - 4 || y > pad.t + ph + 4) continue;
        const is94 = Math.abs(yt - 2.25) < 1e-4;
        ctx.strokeStyle = is94 ? rgba(T.bad, 0.34) : T.line;
        ctx.lineWidth = is94 ? 1.25 : 1;
        ctx.setLineDash(is94 ? [4, 3] : []);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = is94 ? T.bad : T.fg3;
        ctx.fillText(is94 ? '9/4' : yt.toFixed(2), pad.l - 8, y);
      }

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const xTicks = z > 0.5
        ? [{ v: 2026.64, l: 'Aug' }, { v: 2026.73, l: 'Sep 24' }, { v: 2026.753, l: 'Oct 2' }, { v: 2026.833, l: 'Nov 1' }, { v: 2026.898, l: 'Nov 24' }]
        : [{ v: 1970, l: '1970' }, { v: 1980, l: '1980' }, { v: 1990, l: '1990' }, { v: 2000, l: '2000' }, { v: 2010, l: '2010' }, { v: 2020, l: '2020' }, { v: 2026.9, l: '2026' }];
      for (const xt of xTicks) {
        const x = sx(xt.v);
        if (x < pad.l - 4 || x > pad.l + pw + 4) continue;
        ctx.strokeStyle = T.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, pad.t + ph); ctx.lineTo(x, pad.t + ph + 4); ctx.stroke();
        ctx.fillStyle = T.fg3; ctx.fillText(xt.l, x, pad.t + ph + 8);
      }

      ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();

      const y200 = sy(2.0), y225 = sy(2.25), xExact = sx(2026.898);
      const maxIdx = Math.min(upper.length - 1, Math.floor(state.replayProg * (upper.length - 1) + 1e-6));
      const slam = smoothstep(0.92, 1.0, state.replayProg);

      // Forbidden zone rises dramatically during final slam!
      if (slam > 0.01) {
        const curWallY = lerp(y200, y225, slam);
        ctx.fillStyle = rgba(T.bad, 0.07 * slam);
        ctx.fillRect(pad.l, curWallY, pw, Math.max(0, Math.min(pad.t + ph, y200) - curWallY));
        ctx.strokeStyle = rgba(T.bad, 0.095 * slam); ctx.lineWidth = 1;
        for (let d = -ph; d < pw + ph; d += 12) {
          ctx.beginPath(); ctx.moveTo(pad.l + d, curWallY); ctx.lineTo(pad.l + d - (y200 - curWallY), y200); ctx.stroke();
        }
        if (y200 - curWallY > 22) {
          ctx.fillStyle = rgba(T.bad, 0.82 * slam);
          ctx.font = `600 10.5px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(
            z >= 0.7 ? 'Forbidden zone (ω < 9/4) — sealed Nov 24, 2026' : 'Ruled out Nov 24, 2026: no formal arithmetic circuit over any field F can enter ω < 9/4',
            pad.l + 10, (curWallY + Math.min(pad.t + ph, y200)) * 0.5
          );
        }
      }

      // Upper staircase up to maxIdx
      ctx.beginPath();
      ctx.moveTo(sx(upper[0].year), sy(upper[0].omega));
      for (let i = 1; i <= maxIdx; i++) {
        ctx.lineTo(sx(upper[i].year), sy(upper[i - 1].omega));
        ctx.lineTo(sx(upper[i].year), sy(upper[i].omega));
      }
      const endX = maxIdx === upper.length - 1 ? sx(xMax) : sx(upper[maxIdx].year);
      ctx.lineTo(endX, sy(upper[maxIdx].omega));
      ctx.save();
      ctx.lineTo(endX, y225);
      ctx.lineTo(sx(upper[0].year), y225);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad.t, 0, y225);
      grad.addColorStop(0, rgba(T.blue, 0.16));
      grad.addColorStop(1, rgba(T.blue, 0.02));
      ctx.fillStyle = grad; ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(sx(upper[0].year), sy(upper[0].omega));
      for (let i = 1; i <= maxIdx; i++) {
        ctx.lineTo(sx(upper[i].year), sy(upper[i - 1].omega));
        ctx.lineTo(sx(upper[i].year), sy(upper[i].omega));
      }
      ctx.lineTo(endX, sy(upper[maxIdx].omega));
      ctx.strokeStyle = T.blue; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();

      // Lower-bound trajectory
      ctx.beginPath();
      ctx.moveTo(pad.l, y200);
      ctx.lineTo(Math.min(endX, xExact), y200);
      if (slam > 0.01) {
        ctx.lineTo(xExact, lerp(y200, y225, slam));
        if (slam > 0.98) ctx.lineTo(sx(xMax), y225);
      }
      ctx.strokeStyle = T.bad; ctx.lineWidth = 2.4; ctx.stroke();

      // Shockwave rings when corridor slams shut at (Nov 24, 2026, 2.25)
      if (slam > 0.8) {
        const pulseR = 10 + Math.sin(state.pulse * 2.6) * 3.5;
        ctx.beginPath(); ctx.arc(xExact, y225, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = rgba(T.bad, 0.18); ctx.fill();
        if (state.shockR > 0.01) {
          for (let k = 0; k < 2; k++) {
            const rr = (state.shockR * 95 + k * 24);
            const aa = Math.max(0, 0.55 - rr / 115);
            if (aa > 0.01) {
              ctx.beginPath(); ctx.arc(xExact, y225, rr, 0, Math.PI * 2);
              ctx.strokeStyle = rgba(T.bad, aa); ctx.lineWidth = 2; ctx.stroke();
            }
          }
        }
      }

      // Selected hairline & floating live callout pill
      const sel = upper[Math.min(state.selectedIdx, maxIdx)];
      const selX = sx(sel.year), selY = sy(sel.omega);
      ctx.strokeStyle = rgba(T.fg, 0.16); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(selX, pad.t); ctx.lineTo(selX, pad.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      if (state.replaying || state.selectedIdx !== upper.length - 1) {
        const tipTxt = `${sel.date} · ω = ${sel.omega.toFixed(4)}`;
        ctx.font = `600 10px ${T.mono}`;
        const tw = ctx.measureText(tipTxt).width + 16;
        const tx = clamp(selX - tw * 0.5, pad.l + 6, pad.l + pw - tw - 6);
        const ty = Math.max(pad.t + 6, selY - 30);
        ctx.fillStyle = rgba(T.bg, 0.94);
        rrect(ctx, tx, ty, tw, 20, 10); ctx.fill();
        ctx.strokeStyle = rgba(sel.era === 'exact' ? T.bad : T.blue, 0.55); ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = sel.era === 'exact' ? T.bad : T.fg;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tipTxt, tx + tw * 0.5, ty + 10);
      }

      for (let i = 0; i <= maxIdx; i++) {
        const pt = upper[i];
        const x = sx(pt.year), y = sy(pt.omega);
        if (x < pad.l - 12 || x > pad.l + pw + 12) continue;
        const isSel = i === state.selectedIdx;
        const isExact = pt.era === 'exact';
        ctx.beginPath(); ctx.arc(x, y, isSel ? 5.4 : (isExact ? 4.8 : 3.2), 0, Math.PI * 2);
        ctx.fillStyle = isExact ? T.bad : (pt.era === '2026' ? T.amber : T.blue);
        ctx.fill();
        ctx.lineWidth = isSel ? 2 : 1.3; ctx.strokeStyle = T.bg; ctx.stroke();
      }

      ctx.font = `600 10.5px ${T.sans}`;
      const annots = z > 0.5
        ? [
            { idx: 15, dx: 8, dy: -12, align: 'left', txt: 'AlphaEvolve 2.371177' },
            { idx: 16, dx: -8, dy: -14, align: 'right', txt: 'Staggered 2.371055' },
            { idx: 17, dx: -10, dy: 4, align: 'right', txt: 'Polynomial < 2.258 (Sep 24)' },
            { idx: 18, dx: 6, dy: -16, align: 'left', txt: 'ω ≤ 9/4 (Oct 2)' },
            { idx: 19, dx: -10, dy: -14, align: 'right', txt: 'EXACT ω = 9/4 (Nov 24)', col: T.bad },
          ]
        : [
            { idx: 1, dx: 8, dy: -6, align: 'left', txt: 'Strassen 1969 (2.807)' },
            { idx: 4, dx: 8, dy: -8, align: 'left', txt: 'Schönhage 1981' },
            { idx: 7, dx: 8, dy: 14, align: 'left', txt: 'CW 1990 (2.3755)' },
            { idx: 14, dx: -8, dy: -13, align: 'right', txt: '36-yr laser plateau → 2.371' },
            { idx: 19, dx: -10, dy: 14, align: 'right', txt: '9/4 exact', col: T.bad },
          ];
      for (const a of annots) {
        if (a.idx > maxIdx) continue;
        const pt = upper[a.idx];
        const x = sx(pt.year) + a.dx, y = sy(pt.omega) + a.dy;
        if (x < pad.l + 4 || x > pad.l + pw - 4 || y < pad.t + 8 || y > pad.t + ph - 6) continue;
        ctx.textAlign = a.align; ctx.textBaseline = 'middle';
        ctx.fillStyle = a.col || T.fg2;
        ctx.fillText(a.txt, x, y);
      }
      ctx.restore();

      ctx.strokeStyle = T.line2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph); ctx.stroke();
      ctx.fillStyle = T.fg3; ctx.font = `600 10.5px ${T.sans}`; ctx.textAlign = 'left';
      ctx.fillText('Exponent ω', pad.l + 6, pad.t - 10);
    }

    function draw3DTensorCube(ctx, box, T) {
      ctx.fillStyle = T.fg3; ctx.font = `600 10.5px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const dimShow = state.nVal <= 2 ? 2 : state.nVal <= 16 ? 3 : 4;
      ctx.fillText(`Drag 3D tensor T_${dimShow} (${dimShow}³ = ${dimShow ** 3} triples)`, box.x + 12, box.y + 10);

      const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.54;
      const sc = Math.min(box.w, box.h) * 0.28;
      const cY = Math.cos(state.cubeYaw), sY = Math.sin(state.cubeYaw);
      const cP = Math.cos(state.cubePitch), sP = Math.sin(state.cubePitch);
      const proj = (x, y, z) => {
        const xr = x * cY - z * sY, zr = x * sY + z * cY;
        const yp = y * cP - zr * sP, zp = y * sP + zr * cP;
        const persp = 4.2 / (4.2 - zp * 0.55);
        return [cx + xr * sc * persp, cy - yp * sc * persp, zp, persp];
      };

      // Wireframe glass cube [-1, 1]^3
      const corners = [];
      for (let sx = -1; sx <= 1; sx += 2)
        for (let sy = -1; sy <= 1; sy += 2)
          for (let sz = -1; sz <= 1; sz += 2) corners.push([sx, sy, sz]);
      const pCorners = corners.map(c => proj(c[0], c[1], c[2]));
      const cEdges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
      ctx.strokeStyle = rgba(T.fg3, 0.25); ctx.lineWidth = 1.1;
      for (const [a, b] of cEdges) {
        ctx.beginPath(); ctx.moveTo(pCorners[a][0], pCorners[a][1]); ctx.lineTo(pCorners[b][0], pCorners[b][1]); ctx.stroke();
      }

      // Sweeping translucent rank-1 slice planes + crystalline slice lattice!
      const sPos = Math.sin(state.cubeSlice) * 0.85;
      const slicePts = [
        proj(-1.05, sPos, -1.05), proj(1.05, sPos, -1.05),
        proj(1.05, sPos, 1.05), proj(-1.05, sPos, 1.05),
      ];
      ctx.beginPath();
      slicePts.forEach((p, idx) => idx ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = rgba(T.blue, 0.095); ctx.fill();
      ctx.strokeStyle = rgba(T.blue, 0.42); ctx.lineWidth = 1.1; ctx.stroke();

      // Secondary faint orthogonal emerald slice plane along i-axis
      const sPos2 = Math.cos(state.cubeSlice * 0.7) * 0.78;
      const slicePts2 = [
        proj(sPos2, -1.02, -1.02), proj(sPos2, 1.02, -1.02),
        proj(sPos2, 1.02, 1.02), proj(sPos2, -1.02, 1.02),
      ];
      ctx.beginPath();
      slicePts2.forEach((p, idx) => idx ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = rgba(T.good, 0.055); ctx.fill();
      ctx.strokeStyle = rgba(T.good, 0.24); ctx.lineWidth = 0.85; ctx.stroke();

      // Glowing intersection line where the two rank-1 planes meet!
      const il0 = proj(sPos2, sPos, -1.02), il1 = proj(sPos2, sPos, 1.02);
      ctx.beginPath(); ctx.moveTo(il0[0], il0[1]); ctx.lineTo(il1[0], il1[1]);
      ctx.strokeStyle = rgba(T.azure, 0.55); ctx.lineWidth = 1.6; ctx.stroke();

      // Internal subtle 3D grid fibers inside cube
      ctx.strokeStyle = rgba(T.blue, 0.08); ctx.lineWidth = 0.7;
      for (let a = 0; a < dimShow; a++) {
        const ca = dimShow === 1 ? 0 : lerp(-0.78, 0.78, a / (dimShow - 1));
        const p0 = proj(ca, sPos, -0.78), p1 = proj(ca, sPos, 0.78);
        const q0 = proj(-0.78, sPos, ca), q1 = proj(0.78, sPos, ca);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
      }

      // All n^3 jewel nodes of T_n = Σ e_ij ⊗ e_jk ⊗ e_ki
      const nodes = [];
      for (let i = 0; i < dimShow; i++) {
        for (let j = 0; j < dimShow; j++) {
          for (let k = 0; k < dimShow; k++) {
            const x = dimShow === 1 ? 0 : lerp(-0.78, 0.78, i / (dimShow - 1));
            const y = dimShow === 1 ? 0 : lerp(-0.78, 0.78, j / (dimShow - 1));
            const z = dimShow === 1 ? 0 : lerp(-0.78, 0.78, k / (dimShow - 1));
            const pr = proj(x, y, z);
            const nearSlice = Math.exp(-Math.pow((y - sPos) * 2.8, 2));
            nodes.push({ pr, nearSlice, i, j, k });
          }
        }
      }
      nodes.sort((a, b) => a.pr[2] - b.pr[2]);

      for (const nd of nodes) {
        const [px, py, zp, persp] = nd.pr;
        const depthA = clamp(0.32 + (zp + 1.3) * 0.28, 0.25, 0.96);
        const r = (dimShow === 2 ? 7.2 : dimShow === 3 ? 5.2 : 3.8) * persp * (1 + nd.nearSlice * 0.32);
        if (nd.nearSlice > 0.35) {
          ctx.beginPath(); ctx.arc(px, py, r * 2.1, 0, Math.PI * 2);
          ctx.fillStyle = rgba(T.azure, nd.nearSlice * 0.22); ctx.fill();
        }
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, nd.nearSlice > 0.5 ? T.azure : T.blue);
        g.addColorStop(1, nd.nearSlice > 0.5 ? T.blue : '#0d3166');
        ctx.globalAlpha = depthA;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Axis labels i, j, k
      const pI = proj(1.22, -1, -1), pJ = proj(-1, 1.22, -1), pK = proj(-1, -1, 1.22);
      ctx.font = `700 10.5px ${T.mono}`;
      haloText(ctx, 'i', pI[0], pI[1], T.blue, T.bg, 'center');
      haloText(ctx, 'j', pJ[0], pJ[1], T.good, T.bg, 'center');
      haloText(ctx, 'k', pK[0], pK[1], T.amber, T.bg, 'center');

      ctx.fillStyle = T.fg3; ctx.font = `500 10px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(
        dimShow === 2 ? 'Strassen: 7 slices · new wall ≥ ⌈2^(9/4)⌉ = 5' : `Rank wall ≥ ⌈${dimShow}^(9/4)⌉ = ${Math.ceil(Math.pow(dimShow, 2.25))} slices`,
        cx, box.y + box.h - 10
      );
    }

    let finiteBoxes = null;
    function drawFiniteSplit(ctx, w, h, stacked, T) {
      const leftBox = stacked ? { x: 0, y: 0, w, h: Math.round(h * 0.44) } : { x: 0, y: 0, w: Math.round(w * 0.38), h };
      const rightBox = stacked ? { x: 0, y: leftBox.h, w, h: h - leftBox.h } : { x: leftBox.w, y: 0, w: w - leftBox.w, h };
      finiteBoxes = { leftBox, rightBox };

      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      if (stacked) { ctx.moveTo(0, leftBox.h); ctx.lineTo(w, leftBox.h); }
      else { ctx.moveTo(leftBox.w, 0); ctx.lineTo(leftBox.w, h); }
      ctx.stroke();

      draw3DTensorCube(ctx, leftBox, T);

      // Right: log-log finite-size wall
      const pad = { l: 48, r: 16, t: 28, b: 36 };
      const pw = rightBox.w - pad.l - pad.r, ph = rightBox.h - pad.t - pad.b;
      const sx = n => rightBox.x + pad.l + ((Math.log2(n) - 1) / 9) * pw;
      const sy = v => rightBox.y + pad.t + ((31 - Math.log2(Math.max(1, v))) / 31) * ph;

      ctx.font = `500 10px ${T.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const p of [0, 5, 10, 15, 20, 25, 30]) {
        const y = sy(Math.pow(2, p));
        ctx.strokeStyle = T.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(rightBox.x + pad.l, y); ctx.lineTo(rightBox.x + pad.l + pw, y); ctx.stroke();
        ctx.fillStyle = T.fg3; ctx.fillText(`2^${p}`, rightBox.x + pad.l - 6, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const n of [2, 8, 32, 128, 256, 1024]) {
        const x = sx(n);
        ctx.strokeStyle = T.line;
        ctx.beginPath(); ctx.moveTo(x, rightBox.y + pad.t); ctx.lineTo(x, rightBox.y + pad.t + ph); ctx.stroke();
        ctx.fillStyle = n === 256 ? T.bad : T.fg3;
        ctx.fillText(String(n), x, rightBox.y + pad.t + ph + 7);
      }

      ctx.save(); ctx.beginPath(); ctx.rect(rightBox.x + pad.l, rightBox.y + pad.t, pw, ph); ctx.clip();
      ctx.beginPath();
      ctx.moveTo(sx(2), sy(Math.pow(2, 2.25)));
      for (let i = 0; i <= 70; i++) { const n = Math.pow(2, lerp(1, 10, i / 70)); ctx.lineTo(sx(n), sy(Math.pow(n, 2.25))); }
      ctx.lineTo(sx(1024), rightBox.y + pad.t + ph); ctx.lineTo(sx(2), rightBox.y + pad.t + ph); ctx.closePath();
      ctx.fillStyle = rgba(T.bad, 0.06); ctx.fill();

      const curves = [
        { fn: n => Math.pow(n, 3), col: rgba(T.fg3, 0.5), w: 1.2, dash: [3, 3], lbl: 'n³', at: 460, dy: -11 },
        { fn: n => Math.pow(n, Math.log2(7)), col: rgba(T.fg3, 0.72), w: 1.3, dash: [], lbl: 'Strassen', at: 420, dy: 12 },
        { fn: n => Math.pow(n, 2.25), col: T.blue, w: 2.6, dash: [], lbl: 'n^(9/4) wall', at: 280, dy: -20 },
        { fn: n => Math.pow(n, 2.25) / 2, col: T.good, w: 2.0, dash: [], lbl: 'n^(9/4)/2 gates', at: 430, dy: 16 },
        { fn: n => Math.max(1, 2.5 * n * n - 3 * n), col: T.amber, w: 1.5, dash: [5, 3], lbl: 'Bläser 2.5n²', at: 26, dy: -16 },
      ];
      for (const c of curves) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const n = Math.pow(2, lerp(1, 10, i / 80));
          i ? ctx.lineTo(sx(n), sy(c.fn(n))) : ctx.moveTo(sx(n), sy(c.fn(n)));
        }
        ctx.strokeStyle = c.col; ctx.lineWidth = c.w; ctx.setLineDash(c.dash); ctx.stroke(); ctx.setLineDash([]);
        const lx = clamp(sx(c.at), rightBox.x + pad.l + 6, rightBox.x + pad.l + pw - 96);
        const ly = sy(c.fn(c.at)) + c.dy;
        haloText(ctx, c.lbl, lx, ly, c.col, T.bg, 'left', `600 9.5px ${T.sans}`);
      }

      // Refuted Sun point at n = 256
      const sunX = sx(256), sunY = sy(Math.pow(2, 17)), wallY = sy(Math.pow(2, 18));
      ctx.strokeStyle = rgba(T.bad, 0.55); ctx.lineWidth = 1.4; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(sunX, wallY); ctx.lineTo(sunX, sunY); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = T.bad; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sunX - 5, sunY - 5); ctx.lineTo(sunX + 5, sunY + 5);
      ctx.moveTo(sunX + 5, sunY - 5); ctx.lineTo(sunX - 5, sunY + 5);
      ctx.stroke();
      haloText(ctx, "Sun 2¹⁷ (refuted)", sunX - 9, sunY - 14, T.bad, T.bg, 'right', `600 9.5px ${T.sans}`);

      const nx = sx(state.nVal);
      ctx.strokeStyle = rgba(T.fg, 0.22); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(nx, rightBox.y + pad.t); ctx.lineTo(nx, rightBox.y + pad.t + ph); ctx.stroke();
      for (const [fn, col] of [[n => Math.pow(n, 2.25), T.blue], [n => Math.pow(n, 2.25) / 2, T.good]]) {
        ctx.beginPath(); ctx.arc(nx, sy(fn(state.nVal)), 4.6, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = T.line2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rightBox.x + pad.l, rightBox.y + pad.t); ctx.lineTo(rightBox.x + pad.l, rightBox.y + pad.t + ph); ctx.lineTo(rightBox.x + pad.l + pw, rightBox.y + pad.t + ph); ctx.stroke();
      ctx.fillStyle = T.fg3; ctx.font = `600 10.5px ${T.sans}`; ctx.textAlign = 'left';
      ctx.fillText('Rank / gates (log₂)', rightBox.x + pad.l + 6, rightBox.y + 11);
    }

    function draw() {
      const T = readTokens();
      const { ctx, w, h, stacked } = sizeCanvas(canvas, 340, 560);
      if (state.tab === 'race') drawRace(ctx, w, h, T);
      else drawFiniteSplit(ctx, w, h, stacked, T);
    }

    function scrubRace(pt) {
      const w = canvas.clientWidth || 860;
      const padL = w < 520 ? 44 : 56, padR = w < 520 ? 18 : 28;
      const pw = w - padL - padR;
      const xMin = lerp(1968.2, 2026.58, state.zoomCur), xMax = lerp(2028.2, 2026.94, state.zoomCur);
      const yr = xMin + clamp((pt.x - padL) / pw, 0, 1) * (xMax - xMin);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < upper.length; i++) {
        const d = Math.abs(upper[i].year - yr);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best !== state.selectedIdx) {
        state.selectedIdx = best;
        state.replaying = false; state.replayProg = 1;
        updateReadout(); draw();
      }
    }

    function scrubFinitePlot(pt) {
      if (!finiteBoxes) return;
      const rb = finiteBoxes.rightBox;
      const pw = rb.w - 48 - 16;
      const p = clamp(1 + ((pt.x - (rb.x + 48)) / pw) * 9, 1, 10);
      state.nVal = Math.max(2, Math.round(Math.pow(2, p)));
      nRange.value = p.toFixed(2);
      nOut.textContent = fmtInt(state.nVal);
      updateReadout(); draw();
    }

    canvas.addEventListener('pointerdown', e => {
      const pt = canvasXY(canvas, e);
      if (state.tab === 'race') {
        state.dragMode = 'race'; scrubRace(pt);
      } else if (finiteBoxes && pt.x < finiteBoxes.leftBox.x + finiteBoxes.leftBox.w && pt.y < finiteBoxes.leftBox.y + finiteBoxes.leftBox.h) {
        state.dragMode = 'cube'; state.lastX = pt.x; state.lastY = pt.y;
        canvas.classList.add('dragging');
      } else {
        state.dragMode = 'finite'; scrubFinitePlot(pt);
      }
    });
    window.addEventListener('pointermove', e => {
      const pt = canvasXY(canvas, e);
      if (state.dragMode === 'cube') {
        state.cubeYaw += (pt.x - state.lastX) * 0.012;
        state.cubePitch = clamp(state.cubePitch + (pt.y - state.lastY) * 0.01, -1.2, 1.2);
        state.lastX = pt.x; state.lastY = pt.y;
        draw();
      } else if (state.dragMode === 'finite') scrubFinitePlot(pt);
      else if (state.tab === 'race' && !state.replaying && e.target === canvas) scrubRace(pt);
    });
    window.addEventListener('pointerup', () => { state.dragMode = null; canvas.classList.remove('dragging'); });

    tabBtns.forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; updateChrome(); draw(); }));
    zoomBtn.addEventListener('click', () => {
      state.zoomTarget = state.zoomTarget > 0.5 ? 0 : 1;
      if (state.zoomTarget > 0.5) { state.selectedIdx = upper.length - 1; state.replayProg = 1; state.replaying = false; }
      updateChrome();
    });
    replayBtn.addEventListener('click', () => {
      state.replaying = true; state.replayProg = 0; state.shockR = 0; state.zoomTarget = 0;
      state.selectedIdx = 0;
      updateChrome();
    });
    shell.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
      state.nVal = Number(b.dataset.n);
      nRange.value = Math.log2(state.nVal).toFixed(2);
      nOut.textContent = fmtInt(state.nVal);
      updateReadout(); draw();
    }));
    nRange.addEventListener('input', () => {
      state.nVal = Math.max(2, Math.round(Math.pow(2, Number(nRange.value))));
      nOut.textContent = fmtInt(state.nVal);
      updateReadout(); draw();
    });

    let lastT = performance.now(), prevStep = -1;
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible) {
        let dirty = false;
        const dz = state.zoomTarget - state.zoomCur;
        if (Math.abs(dz) > 0.001) { state.zoomCur += dz * Math.min(1, dt * 9); dirty = true; }
        else if (state.zoomCur !== state.zoomTarget) { state.zoomCur = state.zoomTarget; dirty = true; }

        if (state.replaying) {
          state.replayProg = Math.min(1, state.replayProg + dt * 0.24);
          const idx = Math.floor(state.replayProg * (upper.length - 1));
          if (idx !== prevStep) {
            prevStep = idx;
            state.selectedIdx = idx;
            Sound.chime(Math.round((idx / (upper.length - 1)) * 8), 0.1, idx === upper.length - 1);
            updateReadout();
          }
          if (state.replayProg >= 1) {
            state.replaying = false;
            state.shockR = 0.02;
            replayBtn.setAttribute('aria-pressed', 'false');
            updateReadout();
          }
          dirty = true;
        }
        if (state.shockR > 0) {
          state.shockR += dt * 1.1;
          if (state.shockR > 1.2) state.shockR = 0;
          dirty = true;
        }
        if (!reducedMotion()) {
          state.pulse += dt;
          if (state.tab === 'finite') {
            if (state.dragMode !== 'cube') state.cubeYaw += dt * 0.22;
            state.cubeSlice += dt * 1.45;
          }
          dirty = true;
        }
        if (dirty) draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    updateChrome(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-history', ds => {
      if (ds.tab) state.tab = ds.tab;
      if (ds.zoom !== undefined) {
        state.zoomTarget = Number(ds.zoom) ? 1 : 0;
        state.replayProg = 1; state.replaying = false;
        if (state.zoomTarget) state.selectedIdx = upper.length - 1;
      }
      if (ds.n) {
        state.nVal = Number(ds.n);
        nRange.value = Math.log2(state.nVal).toFixed(2);
        nOut.textContent = fmtInt(state.nVal);
      }
      updateChrome(); draw();
    });
  }

  // =========================================================================
  // FIGURE 2: #mm-tripod — True 3D Negatively Curved CAT(0) Saddle + Normal-Mapped Simplex
  // =========================================================================
  function initTripod(fig) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs" role="tablist">
          <button type="button" data-geom="cat0" aria-pressed="true">3D CAT(0) Saddle (9/4)</button>
          <button type="button" data-geom="euclid" aria-pressed="false">Euclidean Flat (2.00)</button>
        </div>
        <div class="mm-actions">
          <button type="button" class="mm-btn" data-preset="unit">Balanced (1,1,1)</button>
          <button type="button" class="mm-btn" data-preset="asym">Long arm (1,1,4)</button>
          <button type="button" class="mm-btn primary" data-collide aria-pressed="false">▶ Replay 4-tip collision</button>
          <button type="button" class="mm-btn" data-sound-btn aria-pressed="false">🔇 Sound</button>
        </div>
      </div>
      <div class="mm-legend">
        <span class="blue"><i></i>3D matrix wires (i, j, k) + streaming bits</span>
        <span class="bad"><i></i>Shared rank label ℓ (rate D*)</span>
        <span class="amber"><i></i>Harmonic core (Σ aᵢ⁻¹)⁻¹</span>
        <span class="good"><i></i>Sculpted AM–HM peak at 9/4</span>
      </div>
      <div class="mm-stage">
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-foot">
        <div class="mm-controls-row">
          <div class="mm-slider"><label for="mm-a1">Arm a₁ (A)</label><input id="mm-a1" type="range" min="0.05" max="2.4" step="0.01" value="1.00"><output>1.00</output></div>
          <div class="mm-slider"><label for="mm-a2">Arm a₂ (B)</label><input id="mm-a2" type="range" min="0.05" max="2.4" step="0.01" value="1.00"><output>1.00</output></div>
          <div class="mm-slider"><label for="mm-a3">Arm a₃ (C)</label><input id="mm-a3" type="range" min="0.05" max="2.4" step="0.01" value="1.00"><output>1.00</output></div>
        </div>
        <div class="mm-readout" data-readout></div>
        <p class="mm-note" data-note></p>
      </div>
    `);

    const canvas = shell.querySelector('canvas');
    const readoutEl = shell.querySelector('[data-readout]');
    const noteEl = shell.querySelector('[data-note]');
    const geomBtns = [...shell.querySelectorAll('[data-geom]')];
    const collideBtn = shell.querySelector('[data-collide]');
    const sliders = [shell.querySelector('#mm-a1'), shell.querySelector('#mm-a2'), shell.querySelector('#mm-a3')];
    const outs = sliders.map(s => s.parentElement.querySelector('output'));
    shell.querySelector('[data-sound-btn]').addEventListener('click', () => Sound.toggle());

    const state = {
      geom: 'cat0',
      flatTarget: 0,
      flatCur: 0,
      a: [1.0, 1.0, 1.0],
      yaw: 0.16,
      pitch: 0.96,
      colliding: false,
      colT: 0,
      dragMode: null,
      lastX: 0, lastY: 0,
      animT: 0,
      visible: true,
    };

    // Normal-mapped directional hillshaded topographic simplex bitmap!
    let simplexImg = null;
    const SIMP_S = 300;
    function buildSimplexBitmap() {
      const off = document.createElement('canvas');
      off.width = SIMP_S; off.height = SIMP_S;
      const octx = off.getContext('2d');
      const img = octx.createImageData(SIMP_S, SIMP_S);
      const v0 = [SIMP_S * 0.5, SIMP_S * 0.09];
      const v1 = [SIMP_S * 0.08, SIMP_S * 0.87];
      const v2 = [SIMP_S * 0.92, SIMP_S * 0.87];
      const denom = (v1[1] - v2[1]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[1] - v2[1]);

      const heightAt = (px, py) => {
        const w0 = ((v1[1] - v2[1]) * (px - v2[0]) + (v2[0] - v1[0]) * (py - v2[1])) / denom;
        const w1 = ((v2[1] - v0[1]) * (px - v2[0]) + (v0[0] - v2[0]) * (py - v2[1])) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) return -1;
        const dS = tripodDStar(w0 * 3, w1 * 3, w2 * 3);
        return dS > 1e-6 ? clamp((6 / dS - 2.0) / 0.25, 0, 1) : 0;
      };

      const lx = -0.55, ly = -0.62, lz = 0.56;
      for (let py = 0; py < SIMP_S; py++) {
        for (let px = 0; px < SIMP_S; px++) {
          const u = heightAt(px, py);
          if (u < 0) continue;
          const ux = heightAt(px + 1, py), uy = heightAt(px, py + 1);
          const gx = (ux >= 0 ? (ux - u) : 0) * 32;
          const gy = (uy >= 0 ? (uy - u) : 0) * 32;
          const nLen = Math.hypot(-gx, -gy, 1);
          const nx = -gx / nLen, ny = -gy / nLen, nz = 1 / nLen;
          const ndl = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
          const spec = Math.pow(clamp(nx * (-0.3) + ny * (-0.35) + nz * 0.88, 0, 1), 16) * 0.35;

          const contour = Math.abs(u * 8 - Math.round(u * 8)) < 0.065 && u > 0.05 && u < 0.96;
          // Editorial sunlit cobalt -> sapphire -> emerald peak palette
          let r, g, b;
          if (u < 0.55) {
            const t = u / 0.55;
            r = lerp(246, 98, t); g = lerp(244, 168, t); b = lerp(239, 232, t);
          } else if (u < 0.93) {
            const t = (u - 0.55) / 0.38;
            r = lerp(98, 1, t); g = lerp(168, 85, t); b = lerp(232, 191, t);
          } else {
            const t = (u - 0.93) / 0.07;
            r = lerp(1, 14, t); g = lerp(85, 165, t); b = lerp(191, 122, t);
          }
          const shade = 0.72 + ndl * 0.42;
          r = clamp(r * shade + spec * 255, 0, 255);
          g = clamp(g * shade + spec * 255, 0, 255);
          b = clamp(b * shade + spec * 255, 0, 255);
          if (contour) { r = lerp(r, 255, 0.42); g = lerp(g, 255, 0.42); b = lerp(b, 255, 0.42); }
          const idx = (py * SIMP_S + px) * 4;
          img.data[idx] = r | 0; img.data[idx + 1] = g | 0; img.data[idx + 2] = b | 0; img.data[idx + 3] = 250;
        }
      }
      octx.putImageData(img, 0, 0);
      return off;
    }

    function syncSliders() {
      for (let i = 0; i < 3; i++) {
        sliders[i].value = state.a[i].toFixed(2);
        outs[i].textContent = state.a[i].toFixed(2);
      }
    }

    function updateReadout() {
      const [a1, a2, a3] = state.a;
      const sumA = a1 + a2 + a3, perim = 2 * sumA;
      const h = (a1 > 1e-4 && a2 > 1e-4 && a3 > 1e-4) ? 1 / (1 / a1 + 1 / a2 + 1 / a3) : 0;
      const dRate = state.geom === 'euclid' ? sumA : (sumA - h);
      const ratio = dRate > 1e-6 ? perim / dRate : 2.0;

      if (state.colliding) {
        const p = state.colT;
        const msgs = [
          '<b>Stage 1 (4-branch disk tree):</b> Four branches of length ℓ radiate from O. Tip 4 slides toward tip 3 while the central trunk stretches to 2ℓ − h.',
          '<b>Stage 2 (5-arm harmonic star):</b> Balancing all 4 depths across the 5 star arms gives 0 ≤ 3(1 − D̄) + D̄, capping the 4-site rate at <b>D̄ ≤ 3/2</b>.',
          '<b>Stage 3 (Contact at infinity):</b> Near collision, the sparse-row rectangular decoder forces D(1, 1, b) − D*(1, 1, b) → 0 as b → ∞.',
          '<b>Stage 4 (Polynomial propagation to 9/4):</b> Proposition 4.1 carries Δ = 0 straight down the simplex ridge into (1, 1, 1), locking D = 8/3 and <b>ω ≥ 6 ÷ (8/3) = 9/4</b>!',
        ];
        const si = p < 0.32 ? 0 : p < 0.62 ? 1 : p < 0.84 ? 2 : 3;
        readoutEl.innerHTML = `
          <span class="mm-kv"><span class="mm-k">Collision</span><span class="mm-v blue">${Math.round(p * 100)}%</span></span>
          <span class="mm-kv"><span class="mm-k">4-site cap D̄</span><span class="mm-v amber">≤ 3/2 = 1.500</span></span>
          <span class="mm-kv"><span class="mm-k">Balanced tripod</span><span class="mm-v bad">D(1,1,1) = 8/3 → ω ≥ 9/4</span></span>
        `;
        noteEl.innerHTML = msgs[si];
        return;
      }

      const wires = [(a1 + a2) / dRate, (a2 + a3) / dRate, (a3 + a1) / dRate];
      readoutEl.innerHTML = `
        <span class="mm-kv"><span class="mm-k">Perimeter</span><span class="mm-v blue">${perim.toFixed(3)}</span></span>
        <span class="mm-kv"><span class="mm-k">Discount h</span><span class="mm-v amber">${state.geom === 'euclid' ? '0.000' : h.toFixed(3)}</span></span>
        <span class="mm-kv"><span class="mm-k">Shared label D*</span><span class="mm-v bad">${dRate.toFixed(3)}</span></span>
        <span class="mm-kv"><span class="mm-k">Bound ω ≥</span><span class="mm-v ${ratio > 2.245 ? 'good' : 'blue'}">${ratio.toFixed(4)}</span></span>
        <span class="mm-kv"><span class="mm-k">Scale-1 wires</span><span class="mm-v">(${wires.map(v => v.toFixed(2)).join(', ')})</span></span>
      `;
      if (state.geom === 'euclid') {
        noteEl.innerHTML = `<b>Euclidean flat limit:</b> Flattening the saddle sets mean width D = ½ perimeter (${sumA.toFixed(2)}), collapsing h to 0 and pinning <b>ω_lb = 2.0000</b> identically.`;
      } else if (Math.abs(ratio - 2.25) < 0.002) {
        noteEl.innerHTML = `<b>Exact AM–HM summit:</b> Equal arms maximize the harmonic discount at h = (Σ aᵢ)/9, dropping D* to 8/3 and locking <b>ω ≥ 6 ÷ (8/3) = 9/4</b> with scale-one wires <b>(3/4, 3/4, 3/4)</b>.`;
      } else {
        noteEl.innerHTML = `<b>Drag the 3D saddle to orbit, or click the simplex relief:</b> unequal arms shrink the harmonic discount h and drop the bound to <b>${ratio.toFixed(4)}</b>.`;
      }
    }

    let lastLayout = null;
    const ANGLES = [Math.PI / 2, (7 * Math.PI) / 6, -Math.PI / 6];

    function project3D(x, y, z, box) {
      const cY = Math.cos(state.yaw), sY = Math.sin(state.yaw);
      const cP = Math.cos(state.pitch), sP = Math.sin(state.pitch);
      const xr = x * cY - y * sY, yr = x * sY + y * cY;
      const yp = yr * cP - z * sP, zp = yr * sP + z * cP;
      const sc = Math.min(box.w, box.h) * 0.29;
      const persp = 4.2 / (4.2 - yp * 0.48);
      return [box.x + box.w * 0.5 + xr * sc * persp, box.y + box.h * 0.56 - zp * sc * persp, yp, persp];
    }

    function draw3DSaddleTripod(ctx, box, T) {
      const [a1, a2, a3] = state.a;
      const sumA = a1 + a2 + a3;
      const hDisc = (a1 > 1e-4 && a2 > 1e-4 && a3 > 1e-4) ? 1 / (1 / a1 + 1 / a2 + 1 / a3) : 0;
      const curv = 1 - state.flatCur; // 1 = negatively curved CAT(0) saddle, 0 = flat Euclidean sheet
      const dRate = lerp(sumA - hDisc, sumA, state.flatCur);
      const ratio = (2 * sumA) / Math.max(1e-6, dRate);

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(
        state.flatCur > 0.5
          ? 'Drag to orbit · Flattened Euclidean mean-width sheet (ω = 2.00)'
          : 'Drag to orbit · 3D CAT(0) negatively curved saddle-tripod',
        box.x + 14, box.y + 12
      );

      // Draw shaded 3D negatively-curved hyperbolic funnel / saddle surface under the tripod!
      const RINGS = 7, SEGS = 28;
      const zSurf = (r, th) => curv * (0.48 * Math.pow(r, 1.35) * (1 + 0.28 * Math.cos(3 * (th + Math.PI / 2))) - 0.36);

      // Depth-sorted translucent shaded surface quads for true 3D volume
      const sQuads = [];
      for (let ri = 0; ri < RINGS; ri++) {
        const r0 = (ri / RINGS) * 1.18, r1 = ((ri + 1) / RINGS) * 1.18;
        for (let si = 0; si < SEGS; si++) {
          const th0 = (si / SEGS) * Math.PI * 2, th1 = ((si + 1) / SEGS) * Math.PI * 2;
          const z00 = zSurf(r0, th0), z10 = zSurf(r1, th0), z11 = zSurf(r1, th1), z01 = zSurf(r0, th1);
          const p00 = project3D(Math.cos(th0) * r0, Math.sin(th0) * r0, z00, box);
          const p10 = project3D(Math.cos(th0) * r1, Math.sin(th0) * r1, z10, box);
          const p11 = project3D(Math.cos(th1) * r1, Math.sin(th1) * r1, z11, box);
          const p01 = project3D(Math.cos(th1) * r0, Math.sin(th1) * r0, z01, box);
          const depth = (p00[2] + p10[2] + p11[2] + p01[2]) * 0.25;
          const elev = clamp(((z00 + z10 + z11 + z01) * 0.25 + 0.38) / 0.85, 0, 1);
          sQuads.push({ pts: [p00, p10, p11, p01], depth, elev, ri });
        }
      }
      sQuads.sort((a, b) => a.depth - b.depth);
      for (const q of sQuads) {
        ctx.beginPath();
        ctx.moveTo(q.pts[0][0], q.pts[0][1]); ctx.lineTo(q.pts[1][0], q.pts[1][1]);
        ctx.lineTo(q.pts[2][0], q.pts[2][1]); ctx.lineTo(q.pts[3][0], q.pts[3][1]);
        ctx.closePath();
        if (curv > 0.1) {
          const aFill = lerp(0.14, 0.035, q.elev) * curv + 0.03 * (1 - curv);
          ctx.fillStyle = q.elev < 0.35 ? rgba(T.blue, aFill * 1.15) : rgba(T.azure, aFill);
          ctx.strokeStyle = rgba(T.blue, 0.08 + (q.ri / RINGS) * 0.09);
        } else {
          ctx.fillStyle = rgba(T.amber, 0.055);
          ctx.strokeStyle = rgba(T.amber, 0.11);
        }
        ctx.lineWidth = 0.65;
        ctx.fill(); ctx.stroke();
      }

      // Compute 3D hub O and 3 raised tips A, B, C
      const maxA = Math.max(1.25, a1, a2, a3);
      const hub3 = [0, 0, -0.36 * curv];
      const tips3 = state.a.map((len, i) => {
        const r = (len / maxA) * 1.08;
        return [Math.cos(ANGLES[i]) * r, Math.sin(ANGLES[i]) * r, zSurf(r, ANGLES[i]) + 0.08];
      });
      const pHub = project3D(hub3[0], hub3[1], hub3[2], box);
      const pTips = tips3.map(t => project3D(t[0], t[1], t[2], box));

      // Flat Euclidean glass fill when flat
      if (state.flatCur > 0.08) {
        ctx.beginPath();
        ctx.moveTo(pTips[0][0], pTips[0][1]);
        ctx.lineTo(pTips[1][0], pTips[1][1]);
        ctx.lineTo(pTips[2][0], pTips[2][1]);
        ctx.closePath();
        ctx.fillStyle = rgba(T.amber, 0.12 * state.flatCur);
        ctx.fill();
      }

      // Draw 3 curved 3D matrix index wires (i, j, k) with glowing streaming photon packets!
      const wirePairs = [
        { i: 0, j: 1, lbl: `i (${(a1 + a2).toFixed(2)})` },
        { i: 1, j: 2, lbl: `j (${(a2 + a3).toFixed(2)})` },
        { i: 2, j: 0, lbl: `k (${(a3 + a1).toFixed(2)})` },
      ];
      for (let wi = 0; wi < 3; wi++) {
        const wp = wirePairs[wi];
        const t0 = tips3[wp.i], t1 = tips3[wp.j];
        const mx = (t0[0] + t1[0]) * 0.5, my = (t0[1] + t1[1]) * 0.5;
        const ml = Math.hypot(mx, my) || 1;
        const ctrl = [mx + (mx / ml) * 0.58 * curv, my + (my / ml) * 0.58 * curv, (t0[2] + t1[2]) * 0.5 + 0.16 * curv];

        ctx.beginPath();
        const pts2d = [];
        for (let k = 0; k <= 24; k++) {
          const u = k / 24, v = 1 - u;
          const x = v * v * t0[0] + 2 * v * u * ctrl[0] + u * u * t1[0];
          const y = v * v * t0[1] + 2 * v * u * ctrl[1] + u * u * t1[1];
          const z = v * v * t0[2] + 2 * v * u * ctrl[2] + u * u * t1[2];
          const p = project3D(x, y, z, box);
          pts2d.push(p);
          k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        ctx.strokeStyle = rgba(T.blue, 0.8); ctx.lineWidth = 2.4; ctx.stroke();

        // Streaming photon packets along each wire
        if (!reducedMotion()) {
          for (let pk = 0; pk < 3; pk++) {
            const u = (((state.animT * 0.45 + wi * 0.21 + pk * 0.333) % 1) + 1) % 1;
            const idx = clamp(Math.floor(u * 24), 0, 23);
            const px = lerp(pts2d[idx][0], pts2d[idx + 1][0], u * 24 - idx);
            const py = lerp(pts2d[idx][1], pts2d[idx + 1][1], u * 24 - idx);
            ctx.beginPath(); ctx.arc(px, py, 5.2, 0, Math.PI * 2);
            ctx.fillStyle = rgba(T.azure, 0.24); ctx.fill();
            ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2);
            ctx.fillStyle = T.azure; ctx.fill();
          }
        }
        const midP = pts2d[12];
        const dx = midP[0] - pHub[0], dy = midP[1] - pHub[1], dl = Math.hypot(dx, dy) || 1;
        haloText(ctx, wp.lbl, midP[0] + (dx / dl) * 26, midP[1] + (dy / dl) * 22, T.blue, T.bg, 'center', `600 10.5px ${T.mono}`);
      }

      // Draw 3D inner tripod arms from deep hub O up to tips A, B, C
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 16; k++) {
          const u = k / 16;
          const x = lerp(hub3[0], tips3[i][0], u);
          const y = lerp(hub3[1], tips3[i][1], u);
          const z = lerp(hub3[2], tips3[i][2], u) - Math.sin(u * Math.PI) * 0.08 * curv;
          const p = project3D(x, y, z, box);
          k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        }
        ctx.strokeStyle = curv > 0.1 ? rgba(T.bad, 0.9) : rgba(T.fg3, 0.34);
        ctx.lineWidth = curv > 0.1 ? 3.0 : 1.3;
        ctx.setLineDash(curv > 0.1 ? [] : [4, 3]);
        ctx.stroke(); ctx.setLineDash([]);

        const mid = project3D(lerp(hub3[0], tips3[i][0], 0.54), lerp(hub3[1], tips3[i][1], 0.54), lerp(hub3[2], tips3[i][2], 0.54), box);
        haloText(ctx, state.a[i].toFixed(2), mid[0], mid[1], curv > 0.1 ? T.bad : T.fg3, T.bg, 'center', `600 10px ${T.mono}`);
      }

      // Glowing pulsing harmonic discount core at hub O!
      const coreR = (10 + hDisc * 24) * curv * (1 + Math.sin(state.animT * 3) * 0.07);
      if (coreR > 2) {
        const g = ctx.createRadialGradient(pHub[0], pHub[1], 2, pHub[0], pHub[1], coreR * 1.5);
        g.addColorStop(0, rgba(T.gold, 0.55));
        g.addColorStop(0.55, rgba(T.amber, 0.22));
        g.addColorStop(1, rgba(T.amber, 0));
        ctx.beginPath(); ctx.arc(pHub[0], pHub[1], coreR * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(pHub[0], pHub[1], coreR, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(T.amber, 0.7); ctx.lineWidth = 1.4; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(pHub[0], pHub[1], 8.5, 0, Math.PI * 2);
      ctx.fillStyle = curv > 0.1 ? T.bad : T.fg3; ctx.fill();
      ctx.strokeStyle = T.bg; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `600 11px ${T.serif}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ℓ', pHub[0], pHub[1] + 0.5);

      // Raised 3D tip badges A, B, C with vertical elevation stems down to base plane
      ['A', 'B', 'C'].forEach((nm, i) => {
        const p = pTips[i];
        if (curv > 0.1) {
          const pFoot = project3D(tips3[i][0], tips3[i][1], -0.36 * curv, box);
          ctx.strokeStyle = rgba(T.fg3, 0.28); ctx.lineWidth = 1.1; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(pFoot[0], pFoot[1]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(pFoot[0], pFoot[1], 2.5, 0, Math.PI * 2);
          ctx.fillStyle = rgba(T.fg3, 0.35); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, Math.PI * 2);
        ctx.fillStyle = T.bg; ctx.fill();
        ctx.strokeStyle = T.fg; ctx.lineWidth = 2.1; ctx.stroke();
        ctx.fillStyle = T.fg; ctx.font = `700 12px ${T.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(nm, p[0], p[1] + 0.5);
      });

      // Live ratio badge
      const bw = 136, bx = box.x + box.w - bw - 12, by = box.y + 34;
      ctx.fillStyle = ratio > 2.245 ? rgba(T.good, 0.13) : rgba(T.blue, 0.08);
      rrect(ctx, bx, by, bw, 40, 8); ctx.fill();
      ctx.fillStyle = T.fg3; ctx.font = `600 9.5px ${T.sans}`; ctx.textAlign = 'center';
      ctx.fillText('Lower bound ω ≥', bx + bw / 2, by + 12);
      ctx.fillStyle = ratio > 2.245 ? T.good : (state.flatCur > 0.5 ? T.fg2 : T.blue);
      ctx.font = `700 15px ${T.mono}`;
      ctx.fillText(Math.abs(ratio - 2.25) < 0.001 ? '9/4 = 2.250' : ratio.toFixed(4), bx + bw / 2, by + 29);
    }

    function drawCollision3D(ctx, box, T) {
      const p = state.colT;
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(
        box.w < 430 ? '4-Tip Collision → Contact → Tripod (1,1,1)' : '4-Tip Disk Tree Collision → Contact at Infinity → Tripod (1,1,1)',
        box.x + 14, box.y + 12
      );
      const colFrac = smoothstep(0.05, 0.58, p);
      const trunkHalf = colFrac * 0.72;
      const pairArm = (1 - colFrac * 0.86) * 0.75;
      const lb = project3D(-trunkHalf, 0, -0.15, box);
      const rb = project3D(trunkHalf, 0, -0.15, box);
      const p1 = project3D(-trunkHalf - pairArm * 0.7, -pairArm * 0.7, 0.25, box);
      const p2 = project3D(-trunkHalf - pairArm * 0.7, pairArm * 0.7, 0.25, box);
      const p3 = project3D(trunkHalf + pairArm * 0.7, -pairArm * 0.7, 0.25, box);
      const p4 = project3D(trunkHalf + pairArm * 0.7, pairArm * 0.7, 0.25, box);

      if (trunkHalf > 0.02) {
        ctx.strokeStyle = T.blue; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(lb[0], lb[1]); ctx.lineTo(rb[0], rb[1]); ctx.stroke();
        haloText(ctx, 'trunk = 2ℓ − h', (lb[0] + rb[0]) * 0.5, (lb[1] + rb[1]) * 0.5 - 12, T.blue, T.bg, 'center', `600 10.5px ${T.mono}`);
      }

      ctx.strokeStyle = T.fg2; ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(lb[0], lb[1]); ctx.lineTo(p2[0], p2[1]);
      ctx.moveTo(p3[0], p3[1]); ctx.lineTo(rb[0], rb[1]); ctx.lineTo(p4[0], p4[1]);
      ctx.stroke();

      if (p > 0.52) {
        const aGlow = smoothstep(0.52, 0.78, p);
        ctx.strokeStyle = rgba(T.bad, aGlow * 0.9); ctx.lineWidth = 3.8;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(lb[0], lb[1]); ctx.lineTo(p2[0], p2[1]);
        ctx.moveTo(lb[0], lb[1]); ctx.lineTo(rb[0], rb[1]); ctx.lineTo(p3[0], p3[1]);
        ctx.stroke();
      }

      for (const [pt, lbl, col] of [[p1, '1 (A)', T.fg], [p2, '2 (B)', T.fg], [p3, '3 (C)', T.fg], [p4, "4 (D')", T.bad]]) {
        ctx.beginPath(); ctx.arc(pt[0], pt[1], 6.5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.8; ctx.stroke();
        haloText(ctx, lbl, pt[0] + (pt[0] < (lb[0] + rb[0]) * 0.5 ? -11 : 11), pt[1], col, T.bg, pt[0] < (lb[0] + rb[0]) * 0.5 ? 'right' : 'left', `600 10.5px ${T.mono}`);
      }
      for (const bp of [lb, rb]) {
        ctx.beginPath(); ctx.arc(bp[0], bp[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = T.bg; ctx.fill(); ctx.strokeStyle = T.blue; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    function draw() {
      const T = readTokens();
      if (!simplexImg) simplexImg = buildSimplexBitmap();
      const { ctx, w, h, stacked } = sizeCanvas(canvas, 390, 650);
      const leftBox = stacked ? { x: 0, y: 0, w, h: Math.round(h * 0.52) } : { x: 0, y: 0, w: Math.round(w * 0.56), h };
      const rightBox = stacked ? { x: 0, y: leftBox.h, w, h: h - leftBox.h } : { x: leftBox.w, y: 0, w: w - leftBox.w, h };
      const sSize = Math.min(rightBox.w - 30, rightBox.h - 46);
      const sx0 = rightBox.x + (rightBox.w - sSize) * 0.5;
      const sy0 = rightBox.y + (rightBox.h - sSize) * 0.5 + 8;
      const sv0 = [sx0 + sSize * 0.5, sy0 + sSize * 0.09];
      const sv1 = [sx0 + sSize * 0.08, sy0 + sSize * 0.87];
      const sv2 = [sx0 + sSize * 0.92, sy0 + sSize * 0.87];
      lastLayout = { leftBox, rightBox, sSize, sx0, sy0, sv0, sv1, sv2 };

      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      if (stacked) { ctx.moveTo(0, leftBox.h); ctx.lineTo(w, leftBox.h); }
      else { ctx.moveTo(leftBox.w, 0); ctx.lineTo(leftBox.w, h); }
      ctx.stroke();

      if (state.colliding) drawCollision3D(ctx, leftBox, T);
      else draw3DSaddleTripod(ctx, leftBox, T);

      // Right: Sculpted normal-mapped AM-HM simplex relief
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Sculpted AM–HM relief (click or drag)', rightBox.x + 14, rightBox.y + 12);

      ctx.drawImage(simplexImg, sx0, sy0, sSize, sSize);
      ctx.beginPath(); ctx.moveTo(sv0[0], sv0[1]); ctx.lineTo(sv1[0], sv1[1]); ctx.lineTo(sv2[0], sv2[1]); ctx.closePath();
      ctx.strokeStyle = T.fg3; ctx.lineWidth = 1.4; ctx.stroke();

      ctx.font = `600 10.5px ${T.mono}`; ctx.fillStyle = T.fg2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('a₁ = 3 (2.00)', sv0[0], sv0[1] - 5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('a₂ = 3', sv1[0] - 4, sv1[1] + 5);
      ctx.textAlign = 'right'; ctx.fillText('a₃ = 3', sv2[0] + 4, sv2[1] + 5);

      const cxS = (sv0[0] + sv1[0] + sv2[0]) / 3, cyS = (sv0[1] + sv1[1] + sv2[1]) / 3;
      ctx.beginPath(); ctx.arc(cxS, cyS, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `700 10px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('9/4', cxS, cyS + 8);

      if (state.colliding && state.colT > 0.62) {
        const u = smoothstep(0.62, 0.96, state.colT);
        const stX = sv2[0] * 0.86 + (sv0[0] + sv1[0]) * 0.07;
        const stY = sv2[1] * 0.86 + (sv0[1] + sv1[1]) * 0.07;
        const curX = lerp(stX, cxS, u), curY = lerp(stY, cyS, u);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(stX, stY); ctx.lineTo(curX, curY); ctx.stroke();
        ctx.beginPath(); ctx.arc(curX, curY, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = T.bad; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        const sum = state.a[0] + state.a[1] + state.a[2];
        const px = (state.a[0] * sv0[0] + state.a[1] * sv1[0] + state.a[2] * sv2[0]) / sum;
        const py = (state.a[0] * sv0[1] + state.a[1] * sv1[1] + state.a[2] * sv2[1]) / sum;
        ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = T.bg; ctx.fill(); ctx.strokeStyle = T.bad; ctx.lineWidth = 2.6; ctx.stroke();
      }
    }

    function applySimplex(x, y) {
      if (!lastLayout) return;
      const { sv0, sv1, sv2 } = lastLayout;
      const denom = (sv1[1] - sv2[1]) * (sv0[0] - sv2[0]) + (sv2[0] - sv1[0]) * (sv0[1] - sv2[1]);
      let w0 = ((sv1[1] - sv2[1]) * (x - sv2[0]) + (sv2[0] - sv1[0]) * (y - sv2[1])) / denom;
      let w1 = ((sv2[1] - sv0[1]) * (x - sv2[0]) + (sv0[0] - sv2[0]) * (y - sv2[1])) / denom;
      let w2 = 1 - w0 - w1;
      w0 = Math.max(0.015, w0); w1 = Math.max(0.015, w1); w2 = Math.max(0.015, w2);
      const s = w0 + w1 + w2;
      state.a = [3 * w0 / s, 3 * w1 / s, 3 * w2 / s];
      state.colliding = false; collideBtn.setAttribute('aria-pressed', 'false');
      syncSliders(); updateReadout(); draw();
    }

    canvas.addEventListener('pointerdown', e => {
      if (!lastLayout) return;
      const pt = canvasXY(canvas, e);
      const rb = lastLayout.rightBox;
      if (pt.x >= rb.x && pt.x <= rb.x + rb.w && pt.y >= rb.y && pt.y <= rb.y + rb.h) {
        state.dragMode = 'simplex'; canvas.classList.add('dragging'); applySimplex(pt.x, pt.y);
      } else {
        state.dragMode = 'orbit'; state.lastX = pt.x; state.lastY = pt.y; canvas.classList.add('dragging');
      }
    });
    window.addEventListener('pointermove', e => {
      if (!state.dragMode) return;
      const pt = canvasXY(canvas, e);
      if (state.dragMode === 'simplex') applySimplex(pt.x, pt.y);
      else if (state.dragMode === 'orbit') {
        state.yaw += (pt.x - state.lastX) * 0.01;
        state.pitch = clamp(state.pitch + (pt.y - state.lastY) * 0.008, 0.14, 1.38);
        state.lastX = pt.x; state.lastY = pt.y;
        draw();
      }
    });
    window.addEventListener('pointerup', () => { state.dragMode = null; canvas.classList.remove('dragging'); });

    geomBtns.forEach(b => b.addEventListener('click', () => {
      state.geom = b.dataset.geom;
      state.flatTarget = state.geom === 'euclid' ? 1 : 0;
      state.colliding = false; collideBtn.setAttribute('aria-pressed', 'false');
      geomBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.geom === state.geom)));
      Sound.chime(state.geom === 'cat0' ? 7 : 2, 0.12, state.geom === 'cat0');
      updateReadout(); draw();
    }));

    shell.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      state.colliding = false; collideBtn.setAttribute('aria-pressed', 'false');
      state.geom = 'cat0'; state.flatTarget = 0;
      state.a = b.dataset.preset === 'unit' ? [1.0, 1.0, 1.0] : [0.6, 0.6, 2.4];
      geomBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.geom === 'cat0')));
      if (b.dataset.preset === 'unit') Sound.chime(6, 0.12, true);
      syncSliders(); updateReadout(); draw();
    }));

    collideBtn.addEventListener('click', () => {
      state.colliding = !state.colliding;
      if (state.colliding) { state.colT = 0; state.geom = 'cat0'; state.flatTarget = 0; geomBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.geom === 'cat0'))); }
      collideBtn.setAttribute('aria-pressed', String(state.colliding));
      updateReadout(); draw();
    });

    sliders.forEach((s, idx) => s.addEventListener('input', () => {
      state.colliding = false; collideBtn.setAttribute('aria-pressed', 'false');
      state.a[idx] = Number(s.value); outs[idx].textContent = state.a[idx].toFixed(2);
      updateReadout(); draw();
    }));

    let lastT = performance.now();
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible) {
        let dirty = false;
        const df = state.flatTarget - state.flatCur;
        if (Math.abs(df) > 0.001) { state.flatCur += df * Math.min(1, dt * 7); dirty = true; }
        else if (state.flatCur !== state.flatTarget) { state.flatCur = state.flatTarget; dirty = true; }

        if (state.colliding) {
          state.colT = Math.min(1, state.colT + dt * 0.17);
          updateReadout(); dirty = true;
        } else if (!reducedMotion()) {
          state.animT += dt;
          if (state.dragMode !== 'orbit') state.yaw += dt * 0.12;
          dirty = true;
        }
        if (dirty) draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    syncSliders(); updateReadout(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-tripod', ds => {
      if (ds.collide) { state.colliding = true; state.colT = 0; state.geom = 'cat0'; state.flatTarget = 0; collideBtn.setAttribute('aria-pressed', 'true'); }
      else if (ds.preset === 'euclid') { state.colliding = false; state.geom = 'euclid'; state.flatTarget = 1; state.a = [1, 1, 1]; collideBtn.setAttribute('aria-pressed', 'false'); }
      else if (ds.preset === 'unit') { state.colliding = false; state.geom = 'cat0'; state.flatTarget = 0; state.a = [1, 1, 1]; collideBtn.setAttribute('aria-pressed', 'false'); }
      geomBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.geom === state.geom)));
      syncSliders(); updateReadout(); draw();
    });
  }

  // =========================================================================
  // FIGURE 3: #mm-rect — 44x44 Phong-Lit 3D Mountain + 3D Isometric Matrix Multiplier
  // =========================================================================
  function initRect(fig, data) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs">
          <button type="button" data-t="0.30" aria-pressed="false">Free wing (t = 0.30)</button>
          <button type="button" data-t="0.50" aria-pressed="false">Dual knee (t = ½)</button>
          <button type="button" data-t="1.00" aria-pressed="true">Square peak (t = 1)</button>
          <button type="button" data-t="1.75" aria-pressed="false">Tall (t = 1.75)</button>
        </div>
        <div class="mm-actions">
          <button type="button" class="mm-btn" data-orbit aria-pressed="true">↻ Orbit</button>
          <button type="button" class="mm-btn" data-reset-cam>Reset angle</button>
        </div>
      </div>
      <div class="mm-legend">
        <span class="blue"><i></i>Lean exact ω(1, 1, t)</span>
        <span class="dash"><i></i>Paper cyclic LB ¾(2 + t)</span>
        <span class="good"><i></i>Free quadratic plains (α = ½)</span>
        <span class="bad"><i></i>Sunlit +¼ summit at (1, 1, 1)</span>
      </div>
      <div class="mm-stage">
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-foot">
        <div class="mm-controls-row">
          <div class="mm-slider">
            <label for="mm-t-range">Inner dimension exponent t (n×nᵗ by nᵗ×n)</label>
            <input id="mm-t-range" type="range" min="0.05" max="2.00" step="0.01" value="1.00">
            <output>1.00</output>
          </div>
        </div>
        <div class="mm-readout" data-readout></div>
        <p class="mm-note" data-note></p>
      </div>
    `);

    const canvas = shell.querySelector('canvas');
    const readoutEl = shell.querySelector('[data-readout]');
    const noteEl = shell.querySelector('[data-note]');
    const tRange = shell.querySelector('#mm-t-range');
    const tOut = tRange.parentElement.querySelector('output');
    const presetBtns = [...shell.querySelectorAll('[data-t]')];
    const orbitBtn = shell.querySelector('[data-orbit]');

    const state = {
      t: 1.0,
      yaw: -0.66,
      pitch: 0.56,
      autoOrbit: true,
      dragging: null,
      lastX: 0, lastY: 0,
      sweepT: 0,
      visible: true,
    };

    // Precompute high-res 40x40 height & analytical surface normal grid!
    const N = 38, lo = 0.12, hi = 2.0;
    const heights = [];
    for (let i = 0; i <= N; i++) {
      const row = [];
      const b = lerp(lo, hi, i / N);
      for (let j = 0; j <= N; j++) {
        const c = lerp(lo, hi, j / N);
        const ex = Math.max(0, rectOmega(1, b, c) - Math.max(1 + b, b + c, c + 1));
        row.push({ b, c, ex });
      }
      heights.push(row);
    }

    function updateReadout() {
      const t = state.t;
      const exact = rectOmega(1, 1, t);
      const ioFloor = Math.max(2, 1 + t);
      const excess = exact - ioFloor;
      const cyclic = Math.max(ioFloor, 0.75 * (2 + t));
      presetBtns.forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.t) - t) < 0.015)));
      tRange.value = t.toFixed(2); tOut.textContent = t.toFixed(2);
      readoutEl.innerHTML = `
        <span class="mm-kv"><span class="mm-k">Weights</span><span class="mm-v">(1, 1, ${t.toFixed(2)})</span></span>
        <span class="mm-kv"><span class="mm-k">Exact ω</span><span class="mm-v blue">${exact.toFixed(4)}</span></span>
        <span class="mm-kv"><span class="mm-k">I/O floor</span><span class="mm-v">${ioFloor.toFixed(4)}</span></span>
        <span class="mm-kv"><span class="mm-k">Excess</span><span class="mm-v ${excess < 1e-4 ? 'good' : 'bad'}">+${excess.toFixed(4)}</span></span>
        <span class="mm-kv"><span class="mm-k">Cyclic LB</span><span class="mm-v amber">${cyclic.toFixed(4)}</span></span>
      `;
      if (t <= 0.5001) {
        noteEl.innerHTML = `<b>Free quadratic plain (t ≤ 1/2):</b> (x + y)z − xy = ${(2 * t - 1).toFixed(2)} ≤ 0, so multiplication sits on the flat emerald floor <b>ω = 2.0000</b>. Lean's <code>dual_exponent</code> pins this knee at exact α = 1/2.`;
      } else if (Math.abs(t - 1.0) < 0.02) {
        noteEl.innerHTML = `<b>Square summit (t = 1):</b> Exact excess peaks at <b>+1/4</b> (ω = 9/4), where the paper's cyclic bound ¾(2 + t) kisses the hyperbola 1 + t + 1/(4t) with identical value 2.25 and slope 3/4.`;
      } else {
        noteEl.innerHTML = `<b>Hyperbolic ridge (t > 1/2):</b> Exact exponent follows <b>1 + t + 1/(4t) = ${exact.toFixed(4)}</b>, rising strictly above both the I/O floor (${ioFloor.toFixed(2)}) and the cyclic bound (${cyclic.toFixed(4)}).`;
      }
    }

    let lastBoxes = null;

    function project3D(bx, cy, ez, box) {
      const x = (bx - 1.06) * 0.94;
      const y = (cy - 1.06) * 0.94;
      const z = (ez - 0.085) * 4.0;
      const cY = Math.cos(state.yaw), sY = Math.sin(state.yaw);
      const cP = Math.cos(state.pitch), sP = Math.sin(state.pitch);
      const xr = x * cY - y * sY, yr = x * sY + y * cY;
      const yp = yr * cP - z * sP, zp = yr * sP + z * cP;
      const sc = Math.min(box.w, box.h) * 0.36;
      const persp = 4.0 / (4.0 - yp * 0.44);
      return { sx: box.x + box.w * 0.5 + xr * sc * persp, sy: box.y + box.h * 0.56 - zp * sc * persp, depth: yp };
    }

    function drawPhongMountain(ctx, box, T) {
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Drag to orbit · 40×40 Phong-lit excess terrain ω(1,b,c) − I/O', box.x + 14, box.y + 12);

      // Subtle floating drop-shadow base plinth at z = -0.05
      const basePts = [project3D(lo, lo, -0.04, box), project3D(hi, lo, -0.04, box), project3D(hi, hi, -0.04, box), project3D(lo, hi, -0.04, box)];
      ctx.beginPath(); basePts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
      ctx.fillStyle = 'rgba(20, 30, 50, 0.045)'; ctx.fill();

      const projGrid = heights.map(row => row.map(cell => ({ ...cell, p: project3D(cell.b, cell.c, cell.ex, box) })));
      const quads = [];
      const lx = -0.48, ly = -0.52, lz = 0.71;

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const q00 = projGrid[i][j], q10 = projGrid[i + 1][j], q11 = projGrid[i + 1][j + 1], q01 = projGrid[i][j + 1];
          const avgEx = (q00.ex + q10.ex + q11.ex + q01.ex) * 0.25;
          const depth = (q00.p.depth + q10.p.depth + q11.p.depth + q01.p.depth) * 0.25;
          // Real surface normal in world space
          const dExDb = ((q10.ex + q11.ex) - (q00.ex + q01.ex)) * 0.5 / ((hi - lo) / N);
          const dExDc = ((q01.ex + q11.ex) - (q00.ex + q10.ex)) * 0.5 / ((hi - lo) / N);
          const nx = -dExDb * 3.4, ny = -dExDc * 3.4, nz = 1.0;
          const nl = Math.hypot(nx, ny, nz);
          const ndl = clamp((nx * lx + ny * ly + nz * lz) / nl, 0, 1);
          const spec = Math.pow(clamp((nx * (-0.25) + ny * (-0.3) + nz * 0.92) / nl, 0, 1), 18) * 0.42;
          quads.push({ pts: [q00.p, q10.p, q11.p, q01.p], avgEx, depth, ndl, spec });
        }
      }
      quads.sort((a, b) => a.depth - b.depth);

      for (const q of quads) {
        const u = clamp(q.avgEx / 0.25, 0, 1);
        ctx.beginPath();
        ctx.moveTo(q.pts[0].sx, q.pts[0].sy); ctx.lineTo(q.pts[1].sx, q.pts[1].sy);
        ctx.lineTo(q.pts[2].sx, q.pts[2].sy); ctx.lineTo(q.pts[3].sx, q.pts[3].sy);
        ctx.closePath();

        if (u < 0.006) {
          ctx.fillStyle = 'rgba(14, 153, 114, 0.14)';
          ctx.strokeStyle = 'rgba(14, 153, 114, 0.22)';
          ctx.lineWidth = 0.5;
          ctx.fill(); ctx.stroke();
        } else {
          // Sunlit sapphire -> cobalt -> amber-crimson summit
          let r, g, b;
          if (u < 0.62) {
            const k = u / 0.62;
            r = lerp(188, 12, k); g = lerp(220, 102, k); b = lerp(246, 206, k);
          } else if (u < 0.9) {
            const k = (u - 0.62) / 0.28;
            r = lerp(12, 132, k); g = lerp(102, 58, k); b = lerp(206, 140, k);
          } else {
            const k = (u - 0.9) / 0.1;
            r = lerp(132, 198, k); g = lerp(58, 42, k); b = lerp(140, 44, k);
          }
          const sh = 0.65 + q.ndl * 0.52;
          const isContour = Math.abs(u * 6 - Math.round(u * 6)) < 0.08 && u > 0.06;
          r = clamp(r * sh + q.spec * 255 + (isContour ? 50 : 0), 0, 255) | 0;
          g = clamp(g * sh + q.spec * 255 + (isContour ? 50 : 0), 0, 255) | 0;
          b = clamp(b * sh + q.spec * 255 + (isContour ? 50 : 0), 0, 255) | 0;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.strokeStyle = isContour ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.09)';
          ctx.lineWidth = isContour ? 0.85 : 0.4;
          ctx.fill(); ctx.stroke();
        }
      }

      // Highlighted b = 1 ridge spline across the 3D mountain
      ctx.beginPath();
      for (let k = 0; k <= 50; k++) {
        const t = lerp(lo, hi, k / 50);
        const ex = Math.max(0, rectOmega(1, 1, t) - Math.max(2, 1 + t));
        const p = project3D(1.0, t, ex + 0.004, box);
        k ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.strokeStyle = T.bad; ctx.lineWidth = 1.8; ctx.stroke();

      // Active glowing laser plumb-line with pulsing summit beacon
      const curEx = Math.max(0, rectOmega(1, 1, state.t) - Math.max(2, 1 + state.t));
      const pBase = project3D(1.0, state.t, -0.02, box);
      const pTop = project3D(1.0, state.t, curEx, box);
      ctx.strokeStyle = T.bad; ctx.lineWidth = 1.6; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(pBase.sx, pBase.sy); ctx.lineTo(pTop.sx, pTop.sy); ctx.stroke(); ctx.setLineDash([]);
      const beaconR = 11 + Math.sin(state.sweepT * 3.5) * 3.5;
      ctx.beginPath(); ctx.arc(pTop.sx, pTop.sy, beaconR, 0, Math.PI * 2);
      ctx.fillStyle = rgba(T.bad, 0.22); ctx.fill();
      ctx.beginPath(); ctx.arc(pTop.sx, pTop.sy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = T.bad; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();

      const pB = project3D(hi + 0.12, lo + 0.05, 0, box);
      const pC = project3D(hi + 0.06, hi + 0.14, 0, box);
      const pPeak = project3D(1, 1, 0.25, box);
      haloText(ctx, 'b →', pB.sx, pB.sy + 6, T.fg2, T.bg, 'center', `600 10.5px ${T.mono}`);
      haloText(ctx, 'c →', pC.sx, pC.sy + 6, T.fg2, T.bg, 'center', `600 10.5px ${T.mono}`);
      haloText(ctx, '+¼ peak (1,1,1)', pPeak.sx, pPeak.sy - 14, T.bad, T.bg, 'center', `700 10.5px ${T.mono}`);
    }

    function drawIsoSlab(ctx, x, y, w, h, depth, fillTop, fillFront, fillSide, stroke) {
      const dx = depth * 0.65, dy = -depth * 0.45;
      // Top face
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w, y); ctx.closePath();
      ctx.fillStyle = fillTop; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
      // Right side face
      ctx.beginPath();
      ctx.moveTo(x + w, y); ctx.lineTo(x + w + dx, y + dy); ctx.lineTo(x + w + dx, y + h + dy); ctx.lineTo(x + w, y + h); ctx.closePath();
      ctx.fillStyle = fillSide; ctx.fill(); ctx.stroke();
      // Front face
      ctx.fillStyle = fillFront; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    }

    function drawSlice2D(ctx, box, T) {
      const pad = { l: 44, r: 16, t: 32, b: 36 };
      const pw = box.w - pad.l - pad.r, ph = box.h - pad.t - pad.b;
      const sx = t => box.x + pad.l + (t / 2.0) * pw;
      const sy = v => box.y + pad.t + ((4.1 - v) / (4.1 - 1.85)) * ph;

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Cross-section ω(1, 1, t) · Click or drag t', box.x + 14, box.y + 12);

      ctx.font = `500 10px ${T.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const yv of [2.0, 2.25, 2.5, 3.0, 3.5, 4.0]) {
        const y = sy(yv);
        ctx.strokeStyle = Math.abs(yv - 2.25) < 1e-4 ? rgba(T.bad, 0.28) : T.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(box.x + pad.l, y); ctx.lineTo(box.x + pad.l + pw, y); ctx.stroke();
        ctx.fillStyle = Math.abs(yv - 2.25) < 1e-4 ? T.bad : T.fg3;
        ctx.fillText(Math.abs(yv - 2.25) < 1e-4 ? '9/4' : yv.toFixed(1), box.x + pad.l - 6, y);
      }

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const [tv, lbl, col] of [[0, '0', T.fg3], [0.5, 'α=½', T.good], [2 / 3, '⅔', T.amber], [1.0, '1', T.bad], [1.5, '1.5', T.fg3], [2.0, '2', T.fg3]]) {
        const x = sx(tv);
        ctx.strokeStyle = tv === 0.5 ? rgba(T.good, 0.35) : T.line;
        ctx.beginPath(); ctx.moveTo(x, box.y + pad.t); ctx.lineTo(x, box.y + pad.t + ph); ctx.stroke();
        ctx.fillStyle = col; ctx.fillText(lbl, x, box.y + pad.t + ph + 7);
      }

      ctx.fillStyle = rgba(T.good, 0.08);
      ctx.fillRect(sx(0), box.y + pad.t, sx(0.5) - sx(0), ph);

      const slice = data.rectangular.slice;
      ctx.beginPath(); slice.forEach((p, i) => i ? ctx.lineTo(sx(p.t), sy(p.naive)) : ctx.moveTo(sx(p.t), sy(p.naive)));
      ctx.strokeStyle = rgba(T.fg4, 0.38); ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);

      ctx.beginPath(); slice.forEach((p, i) => i ? ctx.lineTo(sx(p.t), sy(p.io)) : ctx.moveTo(sx(p.t), sy(p.io)));
      ctx.strokeStyle = rgba(T.fg2, 0.52); ctx.lineWidth = 1.4; ctx.stroke();

      ctx.beginPath(); slice.forEach((p, i) => i ? ctx.lineTo(sx(p.t), sy(p.cyclic_lb)) : ctx.moveTo(sx(p.t), sy(p.cyclic_lb)));
      ctx.strokeStyle = T.amber; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);

      ctx.beginPath(); slice.forEach((p, i) => i ? ctx.lineTo(sx(p.t), sy(p.exact)) : ctx.moveTo(sx(p.t), sy(p.exact)));
      ctx.strokeStyle = T.blue; ctx.lineWidth = 2.7; ctx.stroke();

      for (const [tv, yv, col] of [[0.5, 2.0, T.good], [1.0, 2.25, T.bad]]) {
        ctx.beginPath(); ctx.arc(sx(tv), sy(yv), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.stroke();
      }

      const tx = sx(state.t), ty = sy(rectOmega(1, 1, state.t));
      ctx.strokeStyle = rgba(T.fg, 0.22); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(tx, box.y + pad.t); ctx.lineTo(tx, box.y + pad.t + ph); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = T.bad; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.8; ctx.stroke();

      // 3D Isometric Animated Matrix Block Multiplier inset!
      const mx = box.x + pad.l + 10, my = box.y + pad.t + 14;
      const side = 32, inner = clamp(side * (0.28 + 0.56 * state.t), 8, 48);
      const cardW = inner + side * 2 + 52;
      ctx.fillStyle = rgba(T.bg, 0.94);
      rrect(ctx, mx - 6, my - 10, cardW, side + 30, 8); ctx.fill();
      ctx.strokeStyle = T.line; ctx.lineWidth = 1; ctx.stroke();

      // 3D Slab A (n x n^t)
      drawIsoSlab(ctx, mx, my, inner, side, 7, rgba(T.blue, 0.14), rgba(T.blue, 0.22), rgba(T.blue, 0.34), T.blue);
      // Animated sweeping inner column on A
      const sw = (state.sweepT * 0.55) % 1;
      ctx.fillStyle = rgba(T.azure, 0.55);
      ctx.fillRect(mx + sw * (inner - 3), my, 3, side);

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('×', mx + inner + 12, my + side / 2);

      // 3D Slab B (n^t x n)
      const bx2 = mx + inner + 22;
      const bH = clamp(side * (0.28 + 0.56 * state.t), 8, side);
      const bY = my + (side - bH) * 0.5;
      drawIsoSlab(ctx, bx2, bY, side, bH, 7, rgba(T.good, 0.14), rgba(T.good, 0.22), rgba(T.good, 0.34), T.good);
      ctx.fillStyle = rgba(T.good, 0.65);
      ctx.fillRect(bx2, bY + sw * (bH - 3), side, 3);

      ctx.fillStyle = T.fg3; ctx.fillText('=', bx2 + side + 12, my + side / 2);

      // 3D Slab C (n x n) with live glowing dot-product intersection cell!
      const cx2 = bx2 + side + 22;
      drawIsoSlab(ctx, cx2, my, side, side, 7, rgba(T.amber, 0.14), rgba(T.amber, 0.22), rgba(T.amber, 0.34), T.amber);
      const swRow = ((state.sweepT * 0.22) % 1), swCol = ((state.sweepT * 0.37) % 1);
      ctx.fillStyle = rgba(T.amber, 0.32);
      ctx.fillRect(cx2, my + swRow * (side - 4), side, 3);
      ctx.fillRect(cx2 + swCol * (side - 4), my, 3, side);
      ctx.fillStyle = T.bad;
      ctx.fillRect(cx2 + swCol * (side - 4) - 1, my + swRow * (side - 4) - 1, 5, 5);
      ctx.fillStyle = T.fg3; ctx.font = `500 9.5px ${T.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`n×n^${state.t.toFixed(2)}  ·  n^${state.t.toFixed(2)}×n  =  n×n`, mx, my + side + 6);

      ctx.strokeStyle = T.line2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(box.x + pad.l, box.y + pad.t); ctx.lineTo(box.x + pad.l, box.y + pad.t + ph); ctx.lineTo(box.x + pad.l + pw, box.y + pad.t + ph); ctx.stroke();
    }

    function draw() {
      const T = readTokens();
      const { ctx, w, h, stacked } = sizeCanvas(canvas, 390, 650);
      const leftBox = stacked ? { x: 0, y: 0, w, h: Math.round(h * 0.52) } : { x: 0, y: 0, w: Math.round(w * 0.52), h };
      const rightBox = stacked ? { x: 0, y: leftBox.h, w, h: h - leftBox.h } : { x: leftBox.w, y: 0, w: w - leftBox.w, h };
      lastBoxes = { leftBox, rightBox };
      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      if (stacked) { ctx.moveTo(0, leftBox.h); ctx.lineTo(w, leftBox.h); }
      else { ctx.moveTo(leftBox.w, 0); ctx.lineTo(leftBox.w, h); }
      ctx.stroke();

      drawPhongMountain(ctx, leftBox, T);
      drawSlice2D(ctx, rightBox, T);
    }

    function scrubSlice(pt) {
      if (!lastBoxes) return;
      const rb = lastBoxes.rightBox;
      const pw = rb.w - 44 - 16;
      state.t = Math.round(clamp(((pt.x - (rb.x + 44)) / pw) * 2.0, 0.05, 2.0) * 100) / 100;
      updateReadout(); draw();
    }

    canvas.addEventListener('pointerdown', e => {
      if (!lastBoxes) return;
      const pt = canvasXY(canvas, e);
      const lb = lastBoxes.leftBox;
      if (pt.x >= lb.x && pt.x <= lb.x + lb.w && pt.y >= lb.y && pt.y <= lb.y + lb.h) {
        state.dragging = '3d'; state.autoOrbit = false; orbitBtn.setAttribute('aria-pressed', 'false');
        state.lastX = pt.x; state.lastY = pt.y; canvas.classList.add('dragging');
      } else {
        state.dragging = '2d'; scrubSlice(pt);
      }
    });
    window.addEventListener('pointermove', e => {
      if (!state.dragging) return;
      const pt = canvasXY(canvas, e);
      if (state.dragging === '3d') {
        state.yaw += (pt.x - state.lastX) * 0.01;
        state.pitch = clamp(state.pitch + (pt.y - state.lastY) * 0.008, 0.16, 1.32);
        state.lastX = pt.x; state.lastY = pt.y; draw();
      } else scrubSlice(pt);
    });
    window.addEventListener('pointerup', () => { state.dragging = null; canvas.classList.remove('dragging'); });

    presetBtns.forEach(b => b.addEventListener('click', () => { state.t = Number(b.dataset.t); updateReadout(); draw(); }));
    orbitBtn.addEventListener('click', () => {
      state.autoOrbit = !state.autoOrbit;
      orbitBtn.setAttribute('aria-pressed', String(state.autoOrbit));
    });
    shell.querySelector('[data-reset-cam]').addEventListener('click', () => { state.yaw = -0.66; state.pitch = 0.56; draw(); });
    tRange.addEventListener('input', () => { state.t = Number(tRange.value); updateReadout(); draw(); });

    let lastT = performance.now();
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible && !reducedMotion()) {
        if (state.autoOrbit && state.dragging !== '3d') state.yaw += dt * 0.18;
        state.sweepT += dt;
        draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    updateReadout(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-rect', ds => {
      if (ds.t !== undefined) { state.t = clamp(Number(ds.t), 0.05, 2.0); updateReadout(); draw(); }
    });
  }

  // =========================================================================
  // FIGURE 4: #mm-fermion — True 3D Glass Riemann Sphere + Pole Potential + 3D Wormhole Seam
  // =========================================================================
  function initFermion(fig, data) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs" role="tablist">
          <button type="button" data-mode="wick" aria-pressed="true">3D Riemann sphere &amp; Wick braids</button>
          <button type="button" data-mode="seam" aria-pressed="false">3D seam portal &amp; concentration</button>
        </div>
        <div class="mm-actions" data-wick-acts>
          <button type="button" class="mm-btn primary" data-collide-z>▶ Collide z₄ → z₁</button>
          <button type="button" class="mm-btn" data-reset-z>Reset</button>
          <button type="button" class="mm-btn" data-sound-btn aria-pressed="false">🔇 Sound</button>
        </div>
        <div class="mm-actions" data-seam-acts hidden>
          <button type="button" class="mm-btn primary" data-seam-play>▶ Launch across seam</button>
          <button type="button" class="mm-btn" data-seam-step="0">0 · Planted</button>
          <button type="button" class="mm-btn" data-seam-step="1">1 · Collide</button>
          <button type="button" class="mm-btn" data-seam-step="2">2 · Invert</button>
          <button type="button" class="mm-btn" data-seam-step="3">3 · Frozen</button>
        </div>
      </div>
      <div class="mm-legend" data-legend></div>
      <div class="mm-stage">
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-foot">
        <div class="mm-controls-row" data-wick-slider>
          <div class="mm-slider">
            <label for="mm-h-range">Fermion energy h (self-conjugate Young diagram size 2h)</label>
            <input id="mm-h-range" type="range" min="0" max="30" step="0.5" value="4.5">
            <output>4.5</output>
          </div>
        </div>
        <div class="mm-readout" data-readout></div>
        <p class="mm-note" data-note></p>
      </div>
    `);

    const canvas = shell.querySelector('canvas');
    const legendEl = shell.querySelector('[data-legend]');
    const readoutEl = shell.querySelector('[data-readout]');
    const noteEl = shell.querySelector('[data-note]');
    const modeBtns = [...shell.querySelectorAll('[data-mode]')];
    const wickActs = shell.querySelector('[data-wick-acts]');
    const seamActs = shell.querySelector('[data-seam-acts]');
    const wickSliderRow = shell.querySelector('[data-wick-slider]');
    const hRange = shell.querySelector('#mm-h-range');
    const hOut = hRange.parentElement.querySelector('output');
    shell.querySelector('[data-sound-btn]').addEventListener('click', () => Sound.toggle());

    const dims = data.fermions.dims;
    // Marked points live natively as 3D unit vectors on the Riemann sphere S^2 ≅ P^1!
    function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    const defaultS = [
      norm3([-0.68, -0.28, 0.68]),
      norm3([0.64, -0.36, 0.68]),
      norm3([0.52, 0.56, 0.64]),
      norm3([-0.26, 0.54, 0.80]),
    ];

    const state = {
      mode: 'wick',
      pts3: defaultS.map(v => [...v]),
      yaw: 0.14,
      pitch: 0.12,
      dragMode: null, // 'pt0'..'pt3' | 'globe'
      lastX: 0, lastY: 0,
      collidingZ: false,
      h: 4.5,
      seamT: 0, seamTarget: 0, seamPlaying: false,
      animT: 0,
      visible: true,
    };

    function chordDist(a, b) {
      return Math.max(0.08, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }

    function rotSphere(v) {
      const cY = Math.cos(state.yaw), sY = Math.sin(state.yaw);
      const cP = Math.cos(state.pitch), sP = Math.sin(state.pitch);
      const x1 = v[0] * cY + v[2] * sY;
      const z1 = -v[0] * sY + v[2] * cY;
      const y2 = v[1] * cP - z1 * sP;
      const z2 = v[1] * sP + z1 * cP;
      return [x1, y2, z2];
    }

    function invRotSphere(v) {
      const cY = Math.cos(-state.yaw), sY = Math.sin(-state.yaw);
      const cP = Math.cos(-state.pitch), sP = Math.sin(-state.pitch);
      const y1 = v[1] * cP - v[2] * sP;
      const z1 = v[1] * sP + v[2] * cP;
      const x2 = v[0] * cY + z1 * sY;
      const z2 = -v[0] * sY + z1 * cY;
      return norm3([x2, y1, z2]);
    }

    function updateChrome() {
      modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
      wickActs.hidden = state.mode !== 'wick';
      seamActs.hidden = state.mode !== 'seam';
      wickSliderRow.hidden = state.mode !== 'wick';
      if (state.mode === 'wick') {
        legendEl.innerHTML = `
          <span class="bad"><i></i>3D Wick braid K₁₄·K₂₃ (pole u⁻¹)</span>
          <span class="good"><i></i>Braid K₁₂·K₃₄</span>
          <span class="amber"><i></i>Braid −K₁₃·K₂₄</span>
          <span class="blue"><i></i>Extracted spectral wire (x₁ ↔ y_N)</span>
        `;
      } else {
        legendEl.innerHTML = `
          <span class="blue"><i></i>3D sewn spheres A (wormhole seam e → e')</span>
          <span class="purple"><i></i>Private sphere B (thin residue wire)</span>
          <span class="good"><i></i>Frozen collector station</span>
        `;
      }
      updateReadout();
    }

    function updateReadout() {
      if (state.mode === 'wick') {
        const d14 = chordDist(state.pts3[0], state.pts3[3]);
        const d23 = chordDist(state.pts3[1], state.pts3[2]);
        const m14 = 1 / (d14 * d23);
        const row = dims[Math.round(state.h * 2)] || dims[0];
        hOut.textContent = state.h.toFixed(1);
        readoutEl.innerHTML = `
          <span class="mm-kv"><span class="mm-k">|z₄ − z₁|</span><span class="mm-v ${d14 < 0.25 ? 'bad' : 'blue'}">${d14.toFixed(2)}</span></span>
          <span class="mm-kv"><span class="mm-k">|K₁₄K₂₃|</span><span class="mm-v bad">${m14.toFixed(2)}</span></span>
          <span class="mm-kv"><span class="mm-k">Energy h</span><span class="mm-v">${state.h.toFixed(1)}</span></span>
          <span class="mm-kv"><span class="mm-k">dim V_h</span><span class="mm-v blue">${fmtInt(row.dim)}</span></span>
          <span class="mm-kv"><span class="mm-k">Bound exp(c√h)</span><span class="mm-v good">${row.upper.toFixed(1)}</span></span>
        `;
        noteEl.innerHTML = d14 < 0.25
          ? `<b>Collision supernova (u = ${d14.toFixed(2)}):</b> Internal contraction K₁₄ explodes as u⁻¹, fusing z₁ and z₄ to the vacuum while firing an explicit wire of dimension dim V_g between spectral sites x₁ and y_N.`
          : `<b>Spin the 3D Riemann sphere or drag any zᵢ:</b> 3D spherical Wick braids evaluate C = K₁₂K₃₄ − K₁₃K₂₄ + K₁₄K₂₃. Scrub energy h to build color-coded self-conjugate Young diagrams (width² ∝ energy).`;
      } else {
        const st = Math.min(3, Math.floor(state.seamT + 0.05));
        const eSeam = Math.round(lerp(24, 14, smoothstep(0.9, 2.2, state.seamT)));
        const msgs = [
          '<b>Step 0 (Planted on paired 3D spheres):</b> Each cell holds a translucent sewn sphere A joined by a glowing seam throat, plus private sphere B below.',
          '<b>Step 1 (Collide with seam throat):</b> Movable station glides to the seam at Laurent order j ≤ −L, ready to cross to the neighboring cell.',
          '<b>Step 2 (Möbius inversion V = 1/U):</b> Lemma 14.1 transposes near and far fusion coefficients via S_j x, narrowing the seam throat (e: 24 → 14) while leaving a thin residue filament on sphere B.',
          '<b>Step 3 (Docked at frozen collector):</b> High-arity stations collect at O(W/(DT)) frozen sites (total arity O(W/√D)), keeping the squared budget Σ tᵢ² ≤ WT conserved.',
        ];
        readoutEl.innerHTML = `
          <span class="mm-kv"><span class="mm-k">Seam energy e</span><span class="mm-v blue">${eSeam}</span></span>
          <span class="mm-kv"><span class="mm-k">Drop Δe</span><span class="mm-v good">${eSeam < 24 ? '−' + (24 - eSeam) + ' (≥ μ)' : '0'}</span></span>
          <span class="mm-kv"><span class="mm-k">Frozen budget</span><span class="mm-v amber">O(W/√D)</span></span>
          <span class="mm-kv"><span class="mm-k">Core max arity</span><span class="mm-v purple">≤ D^(−ℓ)T</span></span>
        `;
        noteEl.innerHTML = msgs[st];
      }
    }

    let sphereGeom = null;

    function drawYoungCrystal(ctx, x, y, boxSz, modes) {
      const palette = ['#0155bf', '#0e9972', '#b57614', '#8f3f71', '#ad2111', '#1d6f72', '#0387e7'];
      const desc = [...modes].sort((a, b) => b - a);
      if (!desc.length) {
        ctx.beginPath(); ctx.arc(x + 7, y + 7, 4, 0, Math.PI * 2);
        ctx.fillStyle = palette[0]; ctx.fill();
        return;
      }
      desc.forEach((m, diag) => {
        const col = palette[m % palette.length];
        ctx.fillStyle = rgba(col, 0.28);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.05;
        for (let k = 0; k <= m; k++) {
          ctx.fillRect(x + (diag + k) * boxSz, y + diag * boxSz, boxSz - 0.8, boxSz - 0.8);
          ctx.strokeRect(x + (diag + k) * boxSz, y + diag * boxSz, boxSz - 0.8, boxSz - 0.8);
          if (k > 0) {
            ctx.fillRect(x + diag * boxSz, y + (diag + k) * boxSz, boxSz - 0.8, boxSz - 0.8);
            ctx.strokeRect(x + diag * boxSz, y + (diag + k) * boxSz, boxSz - 0.8, boxSz - 0.8);
          }
        }
      });
    }

    function draw3DRiemannSphere(ctx, box, T) {
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Drag globe to orbit or drag zᵢ on 3D ℙ¹ (Wick Pfaffian)', box.x + 14, box.y + 11);

      const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.48;
      const R = Math.min(box.w * 0.37, box.h * 0.34);
      sphereGeom = { cx, cy, R };

      // Soft contact shadow underneath the 3D sphere
      const shG = ctx.createRadialGradient(cx, cy + R * 1.07, 4, cx, cy + R * 1.07, R * 0.82);
      shG.addColorStop(0, 'rgba(15, 25, 45, 0.14)');
      shG.addColorStop(1, 'rgba(15, 25, 45, 0)');
      ctx.save(); ctx.translate(cx, cy + R * 1.05); ctx.scale(1, 0.22);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, Math.PI * 2); ctx.fillStyle = shG; ctx.fill(); ctx.restore();

      // Glass sphere base shading with specular Fresnel glow
      const g = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.34, R * 0.08, cx, cy, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#eef5fd');
      g.addColorStop(0.88, '#d5e6fa');
      g.addColorStop(1, '#bdd6f6');
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();

      // 3D Graticule (latitudes & meridians)
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      for (let lat = -60; lat <= 60; lat += 30) {
        const phi = (lat * Math.PI) / 180;
        const rL = Math.cos(phi), yL = Math.sin(phi);
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const th = (k / 48) * Math.PI * 2;
          const rv = rotSphere([Math.cos(th) * rL, yL, Math.sin(th) * rL]);
          const px = cx + rv[0] * R, py = cy + rv[1] * R;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = lat === 0 ? rgba(T.blue, 0.24) : rgba(T.blue, 0.12);
        ctx.lineWidth = lat === 0 ? 1.15 : 0.8;
        ctx.stroke();
      }
      for (let lon = 0; lon < 180; lon += 36) {
        const th = (lon * Math.PI) / 180;
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
          const ph = (k / 48) * Math.PI * 2;
          const rv = rotSphere([Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)]);
          const px = cx + rv[0] * R, py = cy + rv[1] * R;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = rgba(T.blue, 0.11); ctx.lineWidth = 0.8; ctx.stroke();
      }

      // Rotated 3D points & Pole Potential Supernova!
      const rPts = state.pts3.map(v => rotSphere(v));
      const d14 = chordDist(state.pts3[0], state.pts3[3]), d23 = chordDist(state.pts3[1], state.pts3[2]);
      const d12 = chordDist(state.pts3[0], state.pts3[1]), d34 = chordDist(state.pts3[2], state.pts3[3]);
      const d13 = chordDist(state.pts3[0], state.pts3[2]), d24 = chordDist(state.pts3[1], state.pts3[3]);

      // Complex pole glow around each puncture & supernova at collision z4->z1
      const colGlow = smoothstep(0.55, 0.12, d14);
      rPts.forEach((rv, i) => {
        if (rv[2] < -0.25) return;
        const px = cx + rv[0] * R, py = cy + rv[1] * R;
        const pr = (i === 0 || i === 3) ? R * (0.22 + colGlow * 0.36) : R * 0.18;
        const pg = ctx.createRadialGradient(px, py, 2, px, py, pr);
        pg.addColorStop(0, rgba(i === 3 || (i === 0 && colGlow > 0.3) ? T.bad : T.azure, 0.32 + colGlow * 0.38));
        pg.addColorStop(1, rgba(T.bad, 0));
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
      });
      if (colGlow > 0.15) {
        const mx = cx + ((rPts[0][0] + rPts[3][0]) * 0.5) * R;
        const my = cy + ((rPts[0][1] + rPts[3][1]) * 0.5) * R;
        for (let k = 0; k < 3; k++) {
          const rad = ((state.animT * 36 + k * 18) % 54) * (0.5 + colGlow * 0.7);
          ctx.beginPath(); ctx.arc(mx, my, rad, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(T.bad, (1 - rad / 65) * colGlow * 0.75);
          ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
      ctx.restore();

      // Sphere outer glass rim & glossy highlight
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(T.blue, 0.38); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx - R * 0.34, cy - R * 0.42, R * 0.24, R * 0.11, -0.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fill();

      // Draw 3D elevated spherical great-circle Wick matchings!
      const matchings = [
        { pairs: [[0, 1], [2, 3]], val: 1 / (d12 * d34), col: T.good, lbl: '+K₁₂K₃₄', lift: 1.13 },
        { pairs: [[0, 2], [1, 3]], val: 1 / (d13 * d24), col: T.amber, lbl: '−K₁₃K₂₄', lift: 1.19 },
        { pairs: [[0, 3], [1, 2]], val: 1 / (d14 * d23), col: T.bad, lbl: '+K₁₄K₂₃', lift: 1.09 },
      ];
      const maxM = Math.max(...matchings.map(m => m.val), 1);

      for (let mi = 0; mi < matchings.length; mi++) {
        const m = matchings[mi];
        const rel = clamp(m.val / maxM, 0.16, 1);
        for (const [i, j] of m.pairs) {
          const a = state.pts3[i], b = state.pts3[j];
          const segs = 26;
          const arcPts = [];
          for (let k = 0; k <= segs; k++) {
            const u = k / segs;
            const raw = norm3([lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]);
            const elev = 1 + Math.sin(u * Math.PI) * (m.lift - 1);
            const rv = rotSphere([raw[0] * elev, raw[1] * elev, raw[2] * elev]);
            arcPts.push([cx + rv[0] * R, cy + rv[1] * R, rv[2]]);
          }
          for (let k = 0; k < segs; k++) {
            const zAvg = (arcPts[k][2] + arcPts[k + 1][2]) * 0.5;
            const front = zAvg >= -0.05;
            ctx.beginPath();
            ctx.moveTo(arcPts[k][0], arcPts[k][1]);
            ctx.lineTo(arcPts[k + 1][0], arcPts[k + 1][1]);
            ctx.strokeStyle = rgba(m.col, (front ? 0.35 + rel * 0.65 : 0.14));
            ctx.lineWidth = (front ? 1.4 + rel * 2.8 : 1.0);
            ctx.stroke();
          }
          // Streaming fermion pulse bead along each 3D braid!
          if (!reducedMotion()) {
            const u = (((state.animT * (0.35 + rel * 0.45) + mi * 0.31) % 1) + 1) % 1;
            const idx = clamp(Math.floor(u * segs), 0, segs - 1);
            const p = arcPts[idx];
            if (p[2] > -0.1) {
              ctx.beginPath(); ctx.arc(p[0], p[1], 3.3, 0, Math.PI * 2);
              ctx.fillStyle = m.col; ctx.fill();
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
            }
          }
        }
      }

      // Draw 3D depth-sorted marked points z_1..z_4
      const order = [0, 1, 2, 3].sort((a, b) => rPts[a][2] - rPts[b][2]);
      const labels = ['z₁', 'z₂', 'z₃', 'z₄'];
      for (const i of order) {
        const rv = rPts[i];
        const px = cx + rv[0] * R, py = cy + rv[1] * R;
        const front = rv[2] >= 0;
        const rad = front ? 11.5 : 8.5;
        ctx.globalAlpha = front ? 1 : 0.42;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fillStyle = i === 3 ? T.bad : T.fg; ctx.fill();
        ctx.strokeStyle = T.bg; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = `600 10.5px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], px, py + 0.5);
      }
      ctx.globalAlpha = 1;

      // Pfaffian bars at bottom
      const barY = box.y + box.h - 40, barW = (box.w - 44) / 3;
      matchings.forEach((m, idx) => {
        const bx = box.x + 14 + idx * (barW + 8);
        const fillW = clamp(Math.log1p(m.val) / Math.log1p(Math.max(maxM, 6)), 0.08, 1) * barW;
        ctx.fillStyle = T.fg3; ctx.font = `600 9.5px ${T.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${m.lbl} (${m.val.toFixed(1)})`, bx, barY + 12);
        ctx.fillStyle = T.subtle; rrect(ctx, bx, barY + 15, barW, 8, 4); ctx.fill();
        ctx.fillStyle = m.col; rrect(ctx, bx, barY + 15, fillW, 8, 4); ctx.fill();
      });
    }

    function drawWick(ctx, w, h, stacked, T) {
      const leftBox = stacked ? { x: 0, y: 0, w, h: Math.round(h * 0.48) } : { x: 0, y: 0, w: Math.round(w * 0.48), h };
      const rTop = stacked ? { x: 0, y: leftBox.h, w, h: Math.round(h * 0.24) } : { x: leftBox.w, y: 0, w: w - leftBox.w, h: Math.round(h * 0.46) };
      const rBot = stacked ? { x: 0, y: leftBox.h + rTop.h, w, h: h - leftBox.h - rTop.h } : { x: leftBox.w, y: rTop.h, w: w - leftBox.w, h: h - rTop.h };

      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      if (stacked) { ctx.moveTo(0, leftBox.h); ctx.lineTo(w, leftBox.h); ctx.moveTo(0, rBot.y); ctx.lineTo(w, rBot.y); }
      else { ctx.moveTo(leftBox.w, 0); ctx.lineTo(leftBox.w, h); ctx.moveTo(leftBox.w, rBot.y); ctx.lineTo(w, rBot.y); }
      ctx.stroke();

      draw3DRiemannSphere(ctx, leftBox, T);

      // Right Top: Spectral CAT(0) Barycenter with glowing extracted wire laser
      const d14 = chordDist(state.pts3[0], state.pts3[3]);
      const wireStrength = smoothstep(0.65, 0.14, d14);
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('CAT(0) spectral barycenter · collision fires wire (x₁ ↔ y_N)', rTop.x + 14, rTop.y + 10);

      const bx = rTop.x + rTop.w * 0.5, by = rTop.y + rTop.h * 0.57;
      const rx = Math.min(rTop.w * 0.34, 130), ry = Math.min(rTop.h * 0.30, 46);
      const sites = [
        { x: bx - rx, y: by - ry * 0.65, lbl: 'x₁' },
        { x: bx + rx, y: by - ry * 0.72, lbl: 'x₂' },
        { x: bx + rx * 0.85, y: by + ry * 0.85, lbl: 'x₃' },
        { x: bx - rx * 0.75, y: by + ry * 0.82, lbl: 'x₄' },
      ];
      const yN = { x: lerp(bx - rx * 0.26, bx, wireStrength), y: lerp(by + ry * 0.22, by, wireStrength) };

      // Subtle CAT(0) geodesic distance contours around barycenter o
      for (const rr of [22, 44, 66]) {
        ctx.beginPath(); ctx.ellipse(bx, by, rr * 1.45, rr * 0.72, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(T.blue, 0.09); ctx.lineWidth = 1; ctx.stroke();
      }
      for (const s of sites) {
        ctx.strokeStyle = rgba(T.fg4, 0.3); ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.setLineDash([]);
      }
      // Glowing laser wire x1 <-> yN
      if (wireStrength > 0.1) {
        ctx.strokeStyle = rgba(T.azure, wireStrength * 0.32); ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(sites[0].x, sites[0].y); ctx.lineTo(yN.x, yN.y); ctx.stroke();
      }
      ctx.strokeStyle = rgba(T.blue, 0.45 + wireStrength * 0.55); ctx.lineWidth = 1.8 + wireStrength * 2.6;
      ctx.beginPath(); ctx.moveTo(sites[0].x, sites[0].y); ctx.lineTo(yN.x, yN.y); ctx.stroke();
      // Streaming spectral photons racing from x_1 into barycenter y_N!
      if (!reducedMotion()) {
        const nP = wireStrength > 0.35 ? 4 : 2;
        for (let k = 0; k < nP; k++) {
          const u = (((state.animT * (0.55 + wireStrength * 0.9) + k / nP) % 1) + 1) % 1;
          const px = lerp(sites[0].x, yN.x, u), py = lerp(sites[0].y, yN.y, u);
          ctx.beginPath(); ctx.arc(px, py, 2.5 + wireStrength * 1.4, 0, Math.PI * 2);
          ctx.fillStyle = wireStrength > 0.45 ? T.azure : T.blue; ctx.fill();
        }
      }
      const wx = yN.x - sites[0].x, wy = yN.y - sites[0].y, wl = Math.hypot(wx, wy) || 1;
      const wnx = (wy / wl) * 14, wny = (-wx / wl) * 14;
      haloText(ctx, 'wire dim V_g', (sites[0].x + yN.x) * 0.5 + wnx, (sites[0].y + yN.y) * 0.5 + wny, T.blue, T.bg, 'center', `600 10px ${T.mono}`);

      ctx.beginPath(); ctx.arc(yN.x, yN.y, 11 + wireStrength * 5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(T.blue, 0.16 + wireStrength * 0.16); ctx.fill();
      ctx.beginPath(); ctx.arc(yN.x, yN.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = T.blue; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.8; ctx.stroke();
      haloText(ctx, 'y_N → o', yN.x + 12, yN.y, T.blue, T.bg, 'left', `600 10px ${T.mono}`);

      for (const s of sites) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = T.fg; ctx.fill();
        haloText(ctx, s.lbl, s.x + (s.x < bx ? -9 : 9), s.y, T.fg2, T.bg, s.x < bx ? 'right' : 'left', `600 10px ${T.mono}`);
      }

      // Right Bottom: Energy vs Width + Color-Coded Self-Conjugate Young Diagrams
      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('log(dim V_h) vs. (π/√3)√h  &  self-conjugate hooks', rBot.x + 14, rBot.y + 10);

      const gL = rBot.x + 38, gR = rBot.x + rBot.w * 0.57, gT = rBot.y + 30, gB = rBot.y + rBot.h - 24;
      const sxH = hv => gL + (hv / 30) * (gR - gL);
      const syL = lv => gB - (lv / 10.5) * (gB - gT);

      ctx.strokeStyle = T.line2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gL, gT); ctx.lineTo(gL, gB); ctx.lineTo(gR, gB); ctx.stroke();
      ctx.beginPath();
      dims.forEach((d, i) => i ? ctx.lineTo(sxH(d.h), syL(d.c_sqrt_h)) : ctx.moveTo(sxH(d.h), syL(d.c_sqrt_h)));
      ctx.strokeStyle = T.good; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);

      for (const d of dims) {
        if (d.log_dim === null) continue;
        ctx.beginPath(); ctx.arc(sxH(d.h), syL(d.log_dim), 2.1, 0, Math.PI * 2);
        ctx.fillStyle = T.blue; ctx.fill();
      }
      const curRow = dims[Math.round(state.h * 2)] || dims[0];
      const curX = sxH(curRow.h);
      ctx.strokeStyle = rgba(T.bad, 0.45); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(curX, gT); ctx.lineTo(curX, gB); ctx.stroke();
      if (curRow.log_dim !== null) {
        ctx.beginPath(); ctx.arc(curX, syL(curRow.log_dim), 4.6, 0, Math.PI * 2);
        ctx.fillStyle = T.bad; ctx.fill();
      }
      ctx.fillStyle = T.fg3; ctx.font = `500 9.5px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('h = 0', gL, gB + 5); ctx.fillText('h = 30', gR, gB + 5);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('10', gL - 5, gT); ctx.fillText('0', gL - 5, gB);

      const yx = gR + 14, yy = rBot.y + 30, yw = rBot.x + rBot.w - yx - 10;
      ctx.fillStyle = T.fg2; ctx.font = `600 10px ${T.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`2h = ${curRow.twice_h} (${curRow.dim} states)`, yx, yy);

      if (curRow.wedges && curRow.wedges.length > 0) {
        const shown = curRow.wedges.slice(0, 4);
        const cols = shown.length > 2 ? 2 : shown.length;
        const cellW = Math.floor(yw / Math.max(1, cols));
        shown.forEach((modes, idx) => {
          const r = Math.floor(idx / 2), c = idx % 2;
          const dx = yx + c * cellW, dy = yy + 18 + r * 54;
          const maxM = modes.length ? Math.max(...modes) : 0;
          const bsz = clamp(Math.floor(38 / Math.max(2, maxM + 1)), 4, 9);
          drawYoungCrystal(ctx, dx, dy, bsz, modes);
          ctx.fillStyle = T.fg3; ctx.font = `500 9px ${T.mono}`;
          ctx.fillText(modes.length ? modes.map(m => `ψ${m}`).join('∧') : 'vac', dx, dy + Math.max(16, (maxM + 1) * bsz + 3));
        });
      } else {
        ctx.fillStyle = T.fg3; ctx.font = `400 10.5px ${T.sans}`;
        ctx.fillText(`dim V_${curRow.h} = ${fmtInt(curRow.dim)}`, yx, yy + 22);
        ctx.fillText(`exp(c√h) = ${curRow.upper.toFixed(1)}`, yx, yy + 38);
        ctx.fillText(`asymptotic ≈ ${curRow.asymp.toFixed(1)}`, yx, yy + 54);
        ctx.fillStyle = T.blue; ctx.fillText('(scrub h ≤ 7 to draw hooks)', yx, yy + 76);
      }
    }

    function drawGlassOrb(ctx, cx, cy, r, tintHex) {
      const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.34, r * 0.08, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.58, rgba(tintHex, 0.1));
      g.addColorStop(0.9, rgba(tintHex, 0.24));
      g.addColorStop(1, rgba(tintHex, 0.36));
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(tintHex, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = rgba(tintHex, 0.2); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(cx - r * 0.32, cy - r * 0.4, r * 0.22, r * 0.1, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.fill();
    }

    function drawSeamPortal(ctx, w, h, T) {
      const t = state.seamT;
      const topH = h * 0.72;
      const sY = topH * 0.48;
      const orbR = Math.min(w * 0.145, topH * 0.31);
      const nCx = w * 0.26, fCx = w * 0.74;

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Part III (Lemma 14.1) · 3D sewn-sphere seam portal & Möbius inversion V = 1/U', 14, 12);

      // 3D cylindrical wormhole throat between Near Sphere A and Far Sphere A!
      const seamL = nCx + orbR * 0.9, seamR = fCx - orbR * 0.9;
      const seamDrop = smoothstep(1.0, 2.2, t);
      const throatH = lerp(28, 14, seamDrop);
      const tGrad = ctx.createLinearGradient(0, sY - throatH, 0, sY + throatH);
      const tCol = seamDrop > 0.5 ? T.good : T.blue;
      tGrad.addColorStop(0, rgba(tCol, 0.35));
      tGrad.addColorStop(0.5, rgba(tCol, 0.08));
      tGrad.addColorStop(1, rgba(tCol, 0.35));
      ctx.beginPath();
      ctx.moveTo(seamL, sY - throatH);
      ctx.quadraticCurveTo((seamL + seamR) * 0.5, sY - throatH * 0.55, seamR, sY - throatH);
      ctx.lineTo(seamR, sY + throatH);
      ctx.quadraticCurveTo((seamL + seamR) * 0.5, sY + throatH * 0.55, seamL, sY + throatH);
      ctx.closePath();
      ctx.fillStyle = tGrad; ctx.fill();
      ctx.strokeStyle = rgba(tCol, 0.75); ctx.lineWidth = 1.6; ctx.stroke();

      // Animated energy rings pulsing through throat
      for (let k = 0; k < 4; k++) {
        const u = (k / 4 + state.animT * 0.22) % 1;
        const rx = lerp(seamL + 10, seamR - 10, u);
        const rh = throatH * (1 - 0.32 * Math.sin(u * Math.PI));
        ctx.beginPath(); ctx.ellipse(rx, sY, 5, rh, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(tCol, 0.38); ctx.lineWidth = 1.1; ctx.stroke();
      }

      // Draw 3D glass Near Sphere A, Far Sphere A, and Private Sphere B!
      drawGlassOrb(ctx, nCx, sY, orbR, T.blue);
      drawGlassOrb(ctx, fCx, sY, orbR, T.blue);
      const bR = orbR * 0.44, bY = sY + orbR + bR * 0.55;
      drawGlassOrb(ctx, nCx, Math.min(topH - bR - 10, bY), bR, T.purple);

      haloText(ctx, 'Near Sphere A', nCx, sY - orbR - 10, T.blue, T.bg, 'center', `600 10.5px ${T.mono}`);
      haloText(ctx, 'Far Sphere A', fCx, sY - orbR - 10, T.blue, T.bg, 'center', `600 10.5px ${T.mono}`);
      haloText(ctx, 'Private Sphere B', nCx + bR + 8, Math.min(topH - bR - 10, bY), T.purple, T.bg, 'left', `600 10px ${T.mono}`);

      const eCur = Math.round(lerp(24, 14, seamDrop));
      const mobiusActive = t > 1.05 && t < 2.45;
      const eLblY = sY - (mobiusActive ? Math.max(throatH * 1.65, 34) : throatH) - 12;
      haloText(ctx, `Seam energy e = ${eCur}`, (seamL + seamR) * 0.5, eLblY, T.fg, T.bg, 'center', `700 10.5px ${T.mono}`);

      // Golden Möbius inversion flash ring + shedding emerald energy sparks at throat midpoint!
      if (mobiusActive) {
        const fl = Math.sin(clamp((t - 1.05) / 1.4, 0, 1) * Math.PI);
        const midX = (seamL + seamR) * 0.5;
        ctx.beginPath(); ctx.ellipse(midX, sY, 16 * fl + 6, throatH * 1.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(T.gold, fl * 0.9); ctx.lineWidth = 2.6; ctx.stroke();
        if (!reducedMotion()) {
          for (let sp = 0; sp < 8; sp++) {
            const ang = (sp / 8) * Math.PI * 2 + state.animT * 1.4;
            const d = 14 + (((state.animT * 28 + sp * 9) % 34));
            ctx.beginPath(); ctx.arc(midX + Math.cos(ang) * d * 0.6, sY + Math.sin(ang) * d, 2.1, 0, Math.PI * 2);
            ctx.fillStyle = rgba(T.good, (1 - d / 50) * fl * 0.85); ctx.fill();
          }
        }
        haloText(ctx, 'V = 1/U · S_j x', midX, sY + Math.max(throatH * 1.55, 28) + 12, T.amber, T.bg, 'center', `700 10.5px ${T.mono}`);
      }

      // Frozen Collector jewel in Far Sphere A
      const colX = fCx + orbR * 0.36, colY = sY;
      ctx.beginPath(); ctx.arc(colX, colY, 15, 0, Math.PI * 2);
      ctx.fillStyle = rgba(T.good, 0.18); ctx.fill();
      ctx.strokeStyle = T.good; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = T.good; ctx.font = `700 9.5px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Col', colX, colY);

      // Moving station orb
      const mx = t < 1 ? lerp(nCx - orbR * 0.32, seamL, smoothstep(0, 1, t))
        : t < 2 ? lerp(seamL, seamR, smoothstep(1, 2, t))
        : lerp(seamR, colX, smoothstep(2, 3, t));
      const my = sY + Math.sin(t * Math.PI * 2) * 3;

      // Shimmering violet residue wire tethered to Private Sphere B
      const bCy = Math.min(topH - bR - 10, bY);
      if (t > 0.08) {
        ctx.strokeStyle = rgba(T.purple, 0.85); ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(nCx, bCy);
        ctx.bezierCurveTo(nCx + 40, bCy - 18, mx - 30, my + 56, mx, my + 10);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(nCx, bCy, 6, 0, Math.PI * 2);
        ctx.fillStyle = T.purple; ctx.fill();
      }

      // Station orb glow & badge
      ctx.beginPath(); ctx.arc(mx, my, 18, 0, Math.PI * 2);
      ctx.fillStyle = rgba(t > 2.8 ? T.good : T.bad, 0.22); ctx.fill();
      ctx.fillStyle = t > 2.8 ? T.good : T.bad;
      rrect(ctx, mx - 21, my - 11, 42, 22, 11); ctx.fill();
      ctx.strokeStyle = T.bg; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `700 10px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t > 2.8 ? 'Fused' : 'Tab', mx, my + 0.5);

      // Bottom quantitative budget meters
      const mY = topH + 14, mW = (w - 48) / 3, prog = clamp(t / 3, 0, 1);
      const meters = [
        { lbl: 'Frozen total arity', sub: 'O(W/√D)', pct: lerp(0.94, 0.32, prog), col: T.good },
        { lbl: 'Core max arity', sub: '≤ D^(−ℓ)T', pct: lerp(0.88, 0.14, prog), col: T.blue },
        { lbl: 'Squared budget Σ tᵢ²', sub: '≤ WT (conserved)', pct: 0.72, col: T.amber },
      ];
      meters.forEach((m, i) => {
        const x0 = 16 + i * (mW + 8);
        ctx.fillStyle = T.fg2; ctx.font = `600 10.5px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(m.lbl, x0, mY);
        ctx.fillStyle = m.col; ctx.font = `600 10px ${T.mono}`; ctx.textAlign = 'right';
        ctx.fillText(m.sub, x0 + mW, mY);
        ctx.fillStyle = T.subtle; rrect(ctx, x0, mY + 18, mW, 10, 5); ctx.fill();
        ctx.fillStyle = m.col; rrect(ctx, x0, mY + 18, mW * m.pct, 10, 5); ctx.fill();
      });
    }

    function draw() {
      const T = readTokens();
      const { ctx, w, h, stacked } = sizeCanvas(canvas, 405, 670);
      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      if (state.mode === 'wick') drawWick(ctx, w, h, stacked, T);
      else drawSeamPortal(ctx, w, h, T);
    }

    canvas.addEventListener('pointerdown', e => {
      if (state.mode !== 'wick' || !sphereGeom) return;
      const pt = canvasXY(canvas, e);
      let best = -1, bestD = 26;
      state.pts3.forEach((v, i) => {
        const rv = rotSphere(v);
        if (rv[2] < -0.15) return;
        const d = Math.hypot(pt.x - (sphereGeom.cx + rv[0] * sphereGeom.R), pt.y - (sphereGeom.cy + rv[1] * sphereGeom.R));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) {
        state.dragMode = 'pt' + best; state.collidingZ = false; canvas.classList.add('dragging');
      } else if (Math.hypot(pt.x - sphereGeom.cx, pt.y - sphereGeom.cy) <= sphereGeom.R * 1.15) {
        state.dragMode = 'globe'; state.lastX = pt.x; state.lastY = pt.y; canvas.classList.add('dragging');
      }
    });
    window.addEventListener('pointermove', e => {
      if (!state.dragMode || !sphereGeom) return;
      const pt = canvasXY(canvas, e);
      if (state.dragMode === 'globe') {
        state.yaw += (pt.x - state.lastX) * 0.011;
        state.pitch = clamp(state.pitch + (pt.y - state.lastY) * 0.009, -1.25, 1.25);
        state.lastX = pt.x; state.lastY = pt.y; draw();
      } else {
        const idx = Number(state.dragMode.slice(2));
        let nx = (pt.x - sphereGeom.cx) / sphereGeom.R;
        let ny = (pt.y - sphereGeom.cy) / sphereGeom.R;
        const m2 = nx * nx + ny * ny;
        if (m2 > 0.92) { const s = Math.sqrt(0.92 / m2); nx *= s; ny *= s; }
        const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
        state.pts3[idx] = invRotSphere([nx, ny, nz]);
        updateReadout(); draw();
      }
    });
    window.addEventListener('pointerup', () => { state.dragMode = null; canvas.classList.remove('dragging'); });

    modeBtns.forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; updateChrome(); draw(); }));
    shell.querySelector('[data-collide-z]').addEventListener('click', () => {
      state.collidingZ = true;
      Sound.chime(8, 0.14, true);
    });
    shell.querySelector('[data-reset-z]').addEventListener('click', () => {
      state.collidingZ = false; state.pts3 = defaultS.map(v => [...v]); state.yaw = 0.14; state.pitch = 0.12;
      updateReadout(); draw();
    });
    shell.querySelector('[data-seam-play]').addEventListener('click', () => {
      state.seamT = 0; state.seamTarget = 3; state.seamPlaying = true;
      Sound.chime(5, 0.12, false);
    });
    shell.querySelectorAll('[data-seam-step]').forEach(b => b.addEventListener('click', () => {
      state.seamPlaying = false; state.seamTarget = Number(b.dataset.seamStep);
      updateReadout(); draw();
    }));
    hRange.addEventListener('input', () => { state.h = Number(hRange.value); updateReadout(); draw(); });

    let lastT = performance.now();
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible) {
        let dirty = false;
        if (!reducedMotion()) {
          state.animT += dt;
          if (state.mode === 'wick' && !state.dragMode && !state.collidingZ) state.yaw += dt * 0.14;
          dirty = true;
        }
        if (state.mode === 'wick' && state.collidingZ) {
          const tgt = norm3([state.pts3[0][0] + 0.08, state.pts3[0][1] + 0.06, state.pts3[0][2] + 0.04]);
          state.pts3[3] = norm3([
            lerp(state.pts3[3][0], tgt[0], Math.min(1, dt * 4.5)),
            lerp(state.pts3[3][1], tgt[1], Math.min(1, dt * 4.5)),
            lerp(state.pts3[3][2], tgt[2], Math.min(1, dt * 4.5)),
          ]);
          if (chordDist(state.pts3[3], tgt) < 0.02) state.collidingZ = false;
          updateReadout(); dirty = true;
        }
        if (state.mode === 'seam') {
          if (state.seamPlaying) {
            state.seamT = Math.min(3, state.seamT + dt * 0.72);
            state.seamTarget = state.seamT;
            if (state.seamT >= 3) { state.seamPlaying = false; Sound.chime(9, 0.12, true); }
            updateReadout(); dirty = true;
          } else if (Math.abs(state.seamTarget - state.seamT) > 0.005) {
            state.seamT += (state.seamTarget - state.seamT) * Math.min(1, dt * 7.5);
            updateReadout(); dirty = true;
          } else if (state.seamT !== state.seamTarget) {
            state.seamT = state.seamTarget; updateReadout(); dirty = true;
          }
        }
        if (dirty) draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    updateChrome(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-fermion', ds => {
      if (ds.mode) state.mode = ds.mode;
      if (ds.collide) state.collidingZ = true;
      if (ds.step !== undefined) { state.seamT = 0; state.seamTarget = 3; state.seamPlaying = true; }
      updateChrome(); draw();
    });
  }

  // =========================================================================
  // FIGURE 5: #mm-engine — Live 96-Node Physical Tensor-Network Compression Reactor
  // =========================================================================
  function initEngine(fig) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs">
          <button type="button" data-p="1.72" aria-pressed="true">ω &lt; 9/4 (p = 1.72 → Shatter)</button>
          <button type="button" data-p="1.98" aria-pressed="false">Knife-edge (p ≈ 2)</button>
          <button type="button" data-p="2.08" aria-pressed="false">p = 2.08 (Overload)</button>
        </div>
        <div class="mm-actions">
          <button type="button" class="mm-btn" data-regime="noports" aria-pressed="true">No ports</button>
          <button type="button" class="mm-btn" data-regime="ports" aria-pressed="false">With ports</button>
          <button type="button" class="mm-btn primary" data-run>▶ Run shaving</button>
          <button type="button" class="mm-btn" data-sound-btn aria-pressed="false">🔇 Sound</button>
        </div>
      </div>
      <div class="mm-legend">
        <span class="blue"><i></i>Core trivalent nodes &amp; wires</span>
        <span class="good"><i></i>Frozen collector colonies</span>
        <span class="bad"><i></i>Unbreakable List-Distinctness barrier w^σ (Thm 2.2)</span>
        <span class="amber"><i></i>Batched lookup overhead when p ≥ 2</span>
      </div>
      <div class="mm-stage">
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-foot">
        <div class="mm-controls-row">
          <div class="mm-slider">
            <label for="mm-p-range">Sorting exponent p (critical knife-edge = 2.00)</label>
            <input id="mm-p-range" type="range" min="1.40" max="2.15" step="0.01" value="1.72">
            <output>1.72</output>
          </div>
          <div class="mm-slider">
            <label for="mm-w-range">Word scale w (list size 2ʷ)</label>
            <input id="mm-w-range" type="range" min="16" max="64" step="2" value="36">
            <output>36</output>
          </div>
        </div>
        <div class="mm-readout" data-readout></div>
        <p class="mm-note" data-note></p>
      </div>
    `);

    const canvas = shell.querySelector('canvas');
    const readoutEl = shell.querySelector('[data-readout]');
    const noteEl = shell.querySelector('[data-note]');
    const pRange = shell.querySelector('#mm-p-range');
    const pOut = pRange.parentElement.querySelector('output');
    const wRange = shell.querySelector('#mm-w-range');
    const wOut = wRange.parentElement.querySelector('output');
    const pBtns = [...shell.querySelectorAll('[data-p]')];
    const regBtns = [...shell.querySelectorAll('[data-regime]')];
    shell.querySelector('[data-sound-btn]').addEventListener('click', () => Sound.toggle());

    // Build deterministic 96-node Batcher trivalent network + 6 emerald frozen colony anchors!
    const N_NET = 96;
    const colonies = [];
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2 - Math.PI / 2;
      colonies.push({ x: Math.cos(a) * 0.42, y: Math.sin(a) * 0.42, ang: a });
    }
    const netNodes = [];
    for (let i = 0; i < N_NET; i++) {
      const ring = i < 24 ? 0.34 : i < 56 ? 0.62 : 0.88;
      const a = ((i * 2.39996) % (Math.PI * 2));
      const jr = (hRand(i * 7 + 1) - 0.5) * 0.14;
      const colIdx = i % 6;
      const dieAt = 0.5 + hRand(i * 13 + 3) * 8.2; // round when absorbed/pruned
      netNodes.push({
        x0: Math.cos(a) * (ring + jr),
        y0: Math.sin(a) * (ring + jr),
        colIdx,
        dieAt,
        seed: hRand(i * 19 + 5),
      });
    }
    const netEdges = [];
    for (let i = 0; i < N_NET; i++) {
      const a = netNodes[i];
      // Connect to 2 nearest neighbors for trivalent topology
      const dists = [];
      for (let j = i + 1; j < N_NET; j++) {
        const b = netNodes[j];
        dists.push([Math.hypot(a.x0 - b.x0, a.y0 - b.y0), j]);
      }
      dists.sort((u, v) => u[0] - v[0]);
      for (let k = 0; k < Math.min(2, dists.length); k++) {
        netEdges.push({ u: i, v: dists[k][1], dropAt: 0.4 + hRand(i * 31 + k) * 7.8 });
      }
    }

    const state = {
      p: 1.72,
      w: 36,
      regime: 'noports',
      animRound: 10,
      running: false,
      animT: 0,
      shatterBurst: 0.85,
      visible: true,
    };

    function simulate() {
      const delta = 0.01, a = 1.65;
      const netExp = a * ((1 - delta) - (1 + delta) * (state.p - 1));
      const sigma = 0.44, eta = 0.24, w = state.w;
      const floorWall = Math.pow(w, sigma), targetWall = Math.pow(w, eta);
      const x0 = w * w;
      const pts = [{ j: 0, x: x0, log2t: 0 }];
      let crashRound = -1;
      for (let j = 1; j <= 10; j++) {
        const prev = pts[j - 1];
        const nextX = netExp > 0
          ? prev.x * Math.pow(w, -netExp) + targetWall
          : Math.min(x0 * 10, prev.x * Math.pow(w, Math.min(0.45, -netExp * 0.7)) + targetWall);
        const log2t = prev.log2t + 0.14 * Math.pow(Math.log2(w), 1.5);
        pts.push({ j, x: nextX, log2t });
        if (crashRound < 0 && nextX < floorWall) crashRound = j;
      }
      return { netExp, floorWall, targetWall, pts, crashRound };
    }

    function updateReadout() {
      const sim = simulate();
      pRange.value = state.p.toFixed(2); pOut.textContent = state.p.toFixed(2);
      wRange.value = String(state.w); wOut.textContent = String(state.w);
      pBtns.forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.p) - state.p) < 0.015)));
      regBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.regime === state.regime)));

      const status = sim.crashRound >= 0
        ? `CONTRADICTION at round ${sim.crashRound}`
        : (sim.netExp > 0 ? 'Slow shaving (needs > 10 rounds)' : 'OVERLOAD (lookup ≥ saving)');
      readoutEl.innerHTML = `
        <span class="mm-kv"><span class="mm-k">Net exp / round</span><span class="mm-v ${sim.netExp > 0 ? 'good' : 'bad'}">${sim.netExp >= 0 ? '−' + sim.netExp.toFixed(3) : '+' + (-sim.netExp).toFixed(3)}</span></span>
        <span class="mm-kv"><span class="mm-k">Batcher x₀</span><span class="mm-v">${fmtInt(state.w * state.w)}</span></span>
        <span class="mm-kv"><span class="mm-k">Wall w^σ</span><span class="mm-v bad">${sim.floorWall.toFixed(1)}</span></span>
        <span class="mm-kv"><span class="mm-k">Final x₁₀</span><span class="mm-v blue">${sim.pts[10].x.toFixed(1)}</span></span>
        <span class="mm-kv"><span class="mm-k">Verdict</span><span class="mm-v ${sim.crashRound >= 0 ? 'bad' : 'amber'}">${status}</span></span>
      `;
      if (sim.crashRound >= 0) {
        noteEl.innerHTML = `<b>Reactor shatters the w^σ barrier (p = ${state.p.toFixed(2)} &lt; 2):</b> By round ${sim.crashRound}, seam concentration + wire-halving beats crush the 96-node Batcher web down to <b>${sim.pts[sim.crashRound].x.toFixed(1)} &lt; ${sim.floorWall.toFixed(1)}</b> per bit—violating Theorem 2.2 (${state.regime === 'noports' ? 'graph entropy Ω(√w)' : 'universal signed-counting batch bound'}).`;
      } else if (sim.netExp > 0) {
        noteEl.innerHTML = `<b>Near the knife-edge (p = ${state.p.toFixed(2)} &lt; 2):</b> Net shaving exponent is still positive (−${sim.netExp.toFixed(3)}), so enough rounds still crash through w^σ.`;
      } else {
        noteEl.innerHTML = `<b>Reactor overload (p = ${state.p.toFixed(2)} ≥ 2):</b> Batched lookup wires explode faster than beats prune them, proving why Part II's subquadratic sort (p &lt; 2) is essential.`;
      }
    }

    function drawReactor(ctx, box, sim, T) {
      const rCur = clamp(state.animRound, 0, 10);
      const collapsing = sim.netExp > 0;
      const compFrac = collapsing ? clamp(rCur / 8, 0, 1) : 0;
      const overload = !collapsing ? clamp(rCur / 8, 0, 1) : 0;

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`Live 96-node tensor network · Round j = ${rCur.toFixed(1)}`, box.x + 14, box.y + 11);

      const cx = box.x + box.w * 0.5, cy = box.y + box.h * 0.52;
      const R = Math.min(box.w * 0.42, box.h * 0.37);

      // Outer reference shell: initial Batcher web volume x_0
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(T.fg4, 0.2); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
      haloText(ctx, `Initial Batcher web (x₀ = ${fmtInt(state.w * state.w)})`, cx, cy - R * 0.95 - 7, T.fg3, T.bg, 'center', `500 9.5px ${T.mono}`);

      // Faint ghost silhouette of the original 96-node Batcher grid so collapse magnitude is visceral
      if (collapsing && compFrac > 0.25) {
        ctx.strokeStyle = rgba(T.blue, 0.055); ctx.lineWidth = 0.7;
        for (let k = 0; k < netEdges.length; k += 2) {
          const a = netNodes[netEdges[k].u], b = netNodes[netEdges[k].v];
          ctx.beginPath(); ctx.moveTo(cx + a.x0 * R, cy + a.y0 * R); ctx.lineTo(cx + b.x0 * R, cy + b.y0 * R); ctx.stroke();
        }
      }

      // Crimson circular w^σ barrier ring!
      const barrierR = R * 0.56;
      const breached = sim.crashRound >= 0 && rCur >= sim.crashRound;
      if (!breached) {
        ctx.beginPath(); ctx.arc(cx, cy, barrierR, 0, Math.PI * 2);
        ctx.fillStyle = rgba(T.bad, 0.035); ctx.fill();
        ctx.strokeStyle = rgba(T.bad, 0.65); ctx.lineWidth = 2.2; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
        haloText(ctx, `w^σ wall (${sim.floorWall.toFixed(1)})`, cx + barrierR * 0.68, cy - barrierR * 0.78, T.bad, T.bg, 'left', `600 9.5px ${T.mono}`);
      } else {
        // Dramatic shattered crimson barrier fragments + radiating fracture sparks!
        const sh = Math.max(0.35, state.shatterBurst);
        const aura = ctx.createRadialGradient(cx, cy, barrierR * 0.55, cx, cy, barrierR + 28);
        aura.addColorStop(0, rgba(T.good, 0.08));
        aura.addColorStop(0.6, rgba(T.bad, 0.11));
        aura.addColorStop(1, rgba(T.bad, 0));
        ctx.beginPath(); ctx.arc(cx, cy, barrierR + 28, 0, Math.PI * 2);
        ctx.fillStyle = aura; ctx.fill();

        for (let seg = 0; seg < 10; seg++) {
          const baseA = (seg / 10) * Math.PI * 2;
          const jitter = (hRand(seg * 17 + 3) - 0.5) * 0.16;
          const push = (8 + hRand(seg * 11 + 5) * 14) * sh + Math.sin(state.animT * 2.1 + seg) * 1.8;
          const a0 = baseA + 0.09 + jitter, a1 = baseA + 0.48 + jitter;
          const rShard = barrierR + push;
          ctx.beginPath(); ctx.arc(cx, cy, rShard, a0, a1);
          ctx.strokeStyle = rgba(T.bad, 0.85); ctx.lineWidth = 2.8; ctx.stroke();
          // Radial fracture spark
          const midA = (a0 + a1) * 0.5;
          const sx1 = cx + Math.cos(midA) * (rShard + 3), sy1 = cy + Math.sin(midA) * (rShard + 3);
          const sx2 = cx + Math.cos(midA) * (rShard + 11), sy2 = cy + Math.sin(midA) * (rShard + 11);
          ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
          ctx.strokeStyle = rgba(T.bad, 0.45); ctx.lineWidth = 1.2; ctx.stroke();
        }
        haloText(ctx, `w^σ wall SHATTERED`, cx, cy + barrierR + 24, T.bad, T.bg, 'center', `700 9.5px ${T.mono}`);
      }

      // Compute live node positions (sucked into 6 emerald frozen colonies if p < 2, or exploding outward if p >= 2!)
      const livePos = netNodes.map((nd, i) => {
        const col = colonies[nd.colIdx];
        if (collapsing) {
          const isResidual = i % 5 === 0; // Keep ~19 live orbiting core nodes inside the crushed lattice!
          const pull = isResidual
            ? smoothstep(Math.max(0, nd.dieAt - 2.2), nd.dieAt + 0.8, rCur) * 0.72
            : smoothstep(Math.max(0, nd.dieAt - 2.2), nd.dieAt + 0.8, rCur);
          const shrink = lerp(1, 0.38, compFrac);
          const orb = isResidual ? Math.sin(state.animT * 1.8 + i) * 0.045 : 0;
          const x = lerp(nd.x0 * shrink, col.x * 0.56, pull) + orb;
          const y = lerp(nd.y0 * shrink, col.y * 0.56, pull) - orb;
          return { sx: cx + x * R, sy: cy + y * R, alive: isResidual ? 0.85 : (1 - pull * 0.86), colIdx: nd.colIdx, isResidual };
        } else {
          const wob = Math.sin(state.animT * 4 + i) * 0.04 * overload;
          const grow = 1 + overload * 0.14;
          return { sx: cx + (nd.x0 * grow + wob) * R, sy: cy + (nd.y0 * grow - wob) * R, alive: 1, colIdx: nd.colIdx, isResidual: false };
        }
      });

      // Draw trivalent wires
      for (const e of netEdges) {
        const a = livePos[e.u], b = livePos[e.v];
        const keep = a.isResidual || b.isResidual;
        const op = collapsing
          ? Math.max(keep ? 0.24 : 0.03, (1 - smoothstep(e.dropAt - 0.8, e.dropAt + 0.6, rCur)) * 0.52)
          : (0.28 + overload * 0.42);
        if (op < 0.05) continue;
        ctx.strokeStyle = collapsing ? rgba(T.blue, op) : rgba(overload > 0.3 ? T.bad : T.amber, op);
        ctx.lineWidth = collapsing ? (keep ? 1.15 : 0.95) : (1.1 + overload * 0.8);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }

      // Extra chaotic lookup tangle wires when p >= 2!
      if (overload > 0.1) {
        ctx.strokeStyle = rgba(T.bad, overload * 0.32); ctx.lineWidth = 1.05;
        for (let k = 0; k < Math.floor(overload * 44); k++) {
          const u = (k * 17) % N_NET, v = (k * 43 + 11) % N_NET;
          ctx.beginPath(); ctx.moveTo(livePos[u].sx, livePos[u].sy); ctx.lineTo(livePos[v].sx, livePos[v].sy); ctx.stroke();
        }
      }

      // Draw hexagonal frozen-colony backbone & pulsing compression beams
      if (collapsing && compFrac > 0.08) {
        ctx.beginPath();
        colonies.forEach((col, c) => {
          const px = cx + col.x * 0.56 * R, py = cy + col.y * 0.56 * R;
          c ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = rgba(T.good, 0.45 * compFrac); ctx.lineWidth = 1.6; ctx.stroke();
        // Cross-chords through core center
        for (let c = 0; c < 3; c++) {
          const a = colonies[c], b = colonies[c + 3];
          ctx.beginPath();
          ctx.moveTo(cx + a.x * 0.56 * R, cy + a.y * 0.56 * R);
          ctx.lineTo(cx + b.x * 0.56 * R, cy + b.y * 0.56 * R);
          ctx.strokeStyle = rgba(T.good, 0.2 * compFrac); ctx.lineWidth = 1.1; ctx.stroke();
        }
      }

      // Draw core nodes
      for (let i = 0; i < N_NET; i++) {
        const p = livePos[i];
        if (p.alive < 0.15) continue;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, collapsing ? (p.isResidual ? 3.0 : 2.3 * p.alive + 0.8) : 2.8, 0, Math.PI * 2);
        ctx.fillStyle = collapsing ? rgba(p.isResidual ? T.azure : T.blue, p.alive * 0.92) : rgba(overload > 0.3 ? T.bad : T.amber, 0.85);
        ctx.fill();
      }

      // Draw 6 emerald Frozen Collector Colonies growing & breathing as they absorb nodes!
      if (collapsing && compFrac > 0.05) {
        for (let c = 0; c < 6; c++) {
          const col = colonies[c];
          const px = cx + col.x * 0.56 * R, py = cy + col.y * 0.56 * R;
          const pulse = 1 + Math.sin(state.animT * 2.8 + c * 1.1) * 0.08;
          const rad = (4 + compFrac * 7.2) * pulse;
          ctx.beginPath(); ctx.arc(px, py, rad * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = rgba(T.good, 0.17 * compFrac); ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fillStyle = T.good; ctx.fill();
          ctx.strokeStyle = T.bg; ctx.lineWidth = 1.6; ctx.stroke();
        }
      }

      // Status pill at bottom of reactor
      const pillTxt = breached
        ? 'BARRIER SHATTERED · Volume < w^σ (CONTRADICTION!)'
        : (collapsing ? `Compressing into 6 frozen colonies · ${Math.round((1 - compFrac * 0.84) * 100)}% wires` : 'OVERLOAD · Batched lookup wires outrun compression!');
      const pillCol = breached ? T.bad : (collapsing ? T.blue : T.amber);
      ctx.fillStyle = rgba(pillCol, 0.11);
      rrect(ctx, box.x + 14, box.y + box.h - 32, box.w - 28, 22, 11); ctx.fill();
      ctx.fillStyle = pillCol; ctx.font = `600 10px ${T.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pillTxt, cx, box.y + box.h - 21);
    }

    function drawStaircase(ctx, box, sim, T) {
      const pad = { l: 46, r: 16, t: 32, b: 68 };
      const pw = box.w - pad.l - pad.r, ph = box.h - pad.t - pad.b;

      ctx.fillStyle = T.fg3; ctx.font = `600 11px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Volume per bit xⱼ vs. w^σ floor (drag to scrub round j)', box.x + 14, box.y + 11);

      const maxY = Math.log10(Math.max(state.w * state.w * 2.4, sim.pts[Math.min(10, Math.ceil(state.animRound))].x * 1.3));
      const minY = Math.log10(1.2);
      const sx = j => box.x + pad.l + (j / 10) * pw;
      const sy = v => box.y + pad.t + ((maxY - Math.log10(Math.max(1.2, v))) / (maxY - minY)) * ph;

      ctx.font = `500 9.5px ${T.mono}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const yv of [2, 5, 10, 30, 100, 300, 1000, 3000]) {
        const y = sy(yv);
        if (y < box.y + pad.t - 2 || y > box.y + pad.t + ph + 2) continue;
        ctx.strokeStyle = T.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(box.x + pad.l, y); ctx.lineTo(box.x + pad.l + pw, y); ctx.stroke();
        ctx.fillStyle = T.fg3; ctx.fillText(fmtCompact(yv), box.x + pad.l - 6, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let j = 0; j <= 10; j += 2) ctx.fillText(`j=${j}`, sx(j), box.y + pad.t + ph + 6);

      ctx.save(); ctx.beginPath(); ctx.rect(box.x + pad.l, box.y + pad.t, pw, ph); ctx.clip();
      const yFloor = sy(sim.floorWall);
      ctx.fillStyle = rgba(T.bad, 0.085);
      ctx.fillRect(box.x + pad.l, yFloor, pw, box.y + pad.t + ph - yFloor);
      ctx.strokeStyle = T.bad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(box.x + pad.l, yFloor); ctx.lineTo(box.x + pad.l + pw, yFloor); ctx.stroke();
      ctx.fillStyle = T.bad; ctx.font = `600 9.5px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`w^σ = ${sim.floorWall.toFixed(1)} (Thm 2.2)`, box.x + pad.l + 6, yFloor - 4);

      const yTarget = sy(sim.targetWall);
      ctx.strokeStyle = T.good; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(box.x + pad.l, yTarget); ctx.lineTo(box.x + pad.l + pw, yTarget); ctx.stroke(); ctx.setLineDash([]);

      const maxJ = clamp(state.animRound, 0, 10), whole = Math.floor(maxJ), frac = maxJ - whole;
      ctx.beginPath(); ctx.moveTo(sx(0), sy(sim.pts[0].x));
      for (let j = 1; j <= whole; j++) ctx.lineTo(sx(j), sy(sim.pts[j].x));
      if (whole < 10 && frac > 0.001) ctx.lineTo(lerp(sx(whole), sx(whole + 1), frac), lerp(sy(sim.pts[whole].x), sy(sim.pts[whole + 1].x), frac));
      ctx.strokeStyle = sim.netExp > 0 ? T.blue : T.amber; ctx.lineWidth = 2.6; ctx.stroke();

      for (let j = 0; j <= whole; j++) {
        const pt = sim.pts[j], x = sx(j), y = sy(pt.x);
        if (j === sim.crashRound) {
          ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
          ctx.fillStyle = rgba(T.bad, 0.2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, j === sim.crashRound ? 5.2 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pt.x < sim.floorWall ? T.bad : (sim.netExp > 0 ? T.blue : T.amber);
        ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.4; ctx.stroke();
      }
      if (sim.crashRound >= 0 && whole >= sim.crashRound) {
        const cx = sx(sim.crashRound), cy = sy(sim.pts[sim.crashRound].x);
        const bx = clamp(cx + 8, box.x + pad.l + 6, box.x + pad.l + pw - 134);
        const by = Math.max(box.y + pad.t + 10, yFloor - 40);
        ctx.strokeStyle = rgba(T.bad, 0.6); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(bx + 18, by + 20); ctx.stroke();
        ctx.fillStyle = T.bad; rrect(ctx, bx, by, 128, 20, 10); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = `700 9.5px ${T.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`CRASH! x_${sim.crashRound} < w^σ`, bx + 64, by + 10);
      }
      // Interactive scrubber hairline at current animRound
      const scrubX = sx(maxJ);
      ctx.strokeStyle = rgba(T.blue, 0.25); ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(scrubX, box.y + pad.t); ctx.lineTo(scrubX, box.y + pad.t + ph); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();

      ctx.strokeStyle = T.line2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(box.x + pad.l, box.y + pad.t); ctx.lineTo(box.x + pad.l, box.y + pad.t + ph); ctx.lineTo(box.x + pad.l + pw, box.y + pad.t + ph); ctx.stroke();

      // Compact regime footer card inside right panel
      const regY = box.y + box.h - 42;
      const isNoPorts = state.regime === 'noports';
      const rc = isNoPorts ? T.teal : T.purple;
      ctx.fillStyle = rgba(rc, 0.08); ctx.strokeStyle = rgba(rc, 0.38); ctx.lineWidth = 1;
      rrect(ctx, box.x + 12, regY, box.w - 24, 32, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rc; ctx.font = `600 9.5px ${T.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(
        isNoPorts
          ? 'No-ports regime: 2×D_w → Tag(h,h) → graph entropy forces Ω(√w)'
          : 'With-ports regime: cheap D_w^⊗t → oracle descent breaks (U_ℓ*)^⊗j LB',
        box.x + 20, regY + 16
      );
    }

    let engineBoxes = null, engineScrub = false;
    function draw() {
      const T = readTokens(), sim = simulate();
      const { ctx, w, h, stacked } = sizeCanvas(canvas, 390, 660);
      const leftBox = stacked ? { x: 0, y: 0, w, h: Math.round(h * 0.5) } : { x: 0, y: 0, w: Math.round(w * 0.50), h };
      const rightBox = stacked ? { x: 0, y: leftBox.h, w, h: h - leftBox.h } : { x: leftBox.w, y: 0, w: w - leftBox.w, h };
      engineBoxes = { leftBox, rightBox };

      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      ctx.beginPath();
      if (stacked) { ctx.moveTo(0, leftBox.h); ctx.lineTo(w, leftBox.h); }
      else { ctx.moveTo(leftBox.w, 0); ctx.lineTo(leftBox.w, h); }
      ctx.stroke();

      drawReactor(ctx, leftBox, sim, T);
      drawStaircase(ctx, rightBox, sim, T);
    }

    function scrubEngineRound(pt) {
      if (!engineBoxes) return;
      const rb = engineBoxes.rightBox;
      const pw = rb.w - 46 - 16;
      state.running = false;
      state.animRound = clamp(((pt.x - (rb.x + 46)) / pw) * 10, 0, 10);
      const sim = simulate();
      state.shatterBurst = (sim.crashRound >= 0 && state.animRound >= sim.crashRound) ? clamp((state.animRound - sim.crashRound) * 0.5 + 0.35, 0.35, 1) : 0;
      draw();
    }
    canvas.addEventListener('pointerdown', e => {
      if (!engineBoxes) return;
      const pt = canvasXY(canvas, e), rb = engineBoxes.rightBox;
      if (pt.x >= rb.x && pt.x <= rb.x + rb.w && pt.y >= rb.y && pt.y <= rb.y + rb.h) {
        engineScrub = true; canvas.classList.add('dragging'); scrubEngineRound(pt);
      }
    });
    window.addEventListener('pointermove', e => { if (engineScrub) scrubEngineRound(canvasXY(canvas, e)); });
    window.addEventListener('pointerup', () => { engineScrub = false; canvas.classList.remove('dragging'); });

    pRange.addEventListener('input', () => { state.p = Number(pRange.value); state.animRound = 10; state.running = false; updateReadout(); draw(); });
    wRange.addEventListener('input', () => { state.w = Number(wRange.value); updateReadout(); draw(); });
    pBtns.forEach(b => b.addEventListener('click', () => { state.p = Number(b.dataset.p); state.animRound = 0; state.running = true; state.shatterBurst = 0; updateReadout(); draw(); }));
    regBtns.forEach(b => b.addEventListener('click', () => { state.regime = b.dataset.regime; updateReadout(); draw(); }));
    shell.querySelector('[data-run]').addEventListener('click', () => { state.animRound = 0; state.running = true; state.shatterBurst = 0; });

    let lastT = performance.now(), crashSounded = false;
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible) {
        let dirty = false;
        if (!reducedMotion()) { state.animT += dt; dirty = true; }
        if (state.running) {
          state.animRound = Math.min(10, state.animRound + dt * 3.4);
          const sim = simulate();
          if (sim.crashRound >= 0 && state.animRound >= sim.crashRound && !crashSounded) {
            crashSounded = true; state.shatterBurst = 0.01; Sound.chime(2, 0.16, true);
          }
          if (state.animRound >= 10) { state.running = false; crashSounded = false; }
          dirty = true;
        }
        if (state.shatterBurst > 0 && state.shatterBurst < 1) {
          state.shatterBurst = Math.min(1, state.shatterBurst + dt * 2.2);
          dirty = true;
        }
        if (dirty) draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    updateReadout(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-engine', ds => {
      if (ds.p !== undefined) state.p = Number(ds.p);
      if (ds.run) { state.animRound = 0; state.running = true; state.shatterBurst = 0; crashSounded = false; }
      updateReadout(); draw();
    });
  }

  // =========================================================================
  // FIGURE 6: #mm-map — Pan/Zoom/Fullscreen Radial Cosmic Proof Singularity
  // All 28 .tex files · All 48 real declarations · 21 spine milestones · Lean 4
  // =========================================================================
  function initMap(fig, data) {
    const shell = insertShell(fig, `
      <div class="mm-head">
        <div class="mm-tabs" role="tablist">
          <button type="button" data-filter="all" aria-pressed="true">Full cosmos (97)</button>
          <button type="button" data-filter="spine" aria-pressed="false">Spine</button>
          <button type="button" data-filter="spheres" aria-pressed="false">Part I · Spheres</button>
          <button type="button" data-filter="lean" aria-pressed="false">Lean 4</button>
        </div>
        <div class="mm-actions">
          <button type="button" class="mm-btn primary" data-cascade aria-pressed="false">▶ Cascade</button>
          <button type="button" class="mm-btn" data-theme-cos aria-pressed="true">🌌 Cosmos</button>
          <button type="button" class="mm-btn" data-fs aria-pressed="false">⛶ Fullscreen</button>
          <button type="button" class="mm-btn" data-sound-btn aria-pressed="false">🔇 Sound</button>
        </div>
      </div>
      <div class="mm-stage" style="position:relative">
        <div class="mm-hud-tl" data-hud><b>97 stars</b> · 28 .tex · 48 theorems/lemmas · 21 milestones → <b>ω = 9/4</b></div>
        <div class="mm-hud-tr">
          <div class="mm-search-wrap">
            <input class="mm-search" type="search" placeholder="Search (/)" aria-label="Search theorems and files" data-search>
            <div class="mm-search-pop" data-pop hidden></div>
          </div>
        </div>
        <div class="mm-hud-bl" data-zoombar>
          <button type="button" data-z="in">+</button>
          <button type="button" data-z="out">−</button>
          <button type="button" data-z="reset">Reset</button>
        </div>
        <canvas class="mm-canvas interactive"></canvas>
      </div>
      <div class="mm-inspector" data-inspector></div>
    `);

    const canvas = shell.querySelector('canvas');
    const inspEl = shell.querySelector('[data-inspector]');
    const hudEl = shell.querySelector('[data-hud]');
    const zoomBar = shell.querySelector('[data-zoombar]');
    const searchEl = shell.querySelector('[data-search]');
    const popEl = shell.querySelector('[data-pop]');
    const filterBtns = [...shell.querySelectorAll('[data-filter]')];
    const cascadeBtn = shell.querySelector('[data-cascade]');
    const themeBtn = shell.querySelector('[data-theme-cos]');
    const fsBtn = shell.querySelector('[data-fs]');
    shell.querySelector('[data-sound-btn]').addEventListener('click', () => Sound.toggle());

    const milestones = data.proof_graph.nodes;
    const msEdges = data.proof_graph.edges;
    const paperFiles = data.paper_files || [];
    const paperDecls = data.paper_decls || [];

    // Wide 2:1 elliptical galactic projection so all 97 stars fill the landscape observatory cleanly!
    const EX = 1.56, EY = 0.94;
    const SECTORS = {
      'Main':        { ang: -Math.PI * 0.50, col: '#10b981', colL: '#0e9972', label: 'Main & Corollaries' },
      'Lean 4':      { ang: -Math.PI * 0.22, col: '#34d399', colL: '#0e9972', label: 'Lean 4 Exact Exponent' },
      'Part I':      { ang:  Math.PI * 0.14, col: '#5ca2ff', colL: '#0155bf', label: 'Part I · Tripod & Spheres' },
      'Part II':     { ang:  Math.PI * 0.52, col: '#2dd4bf', colL: '#1d6f72', label: 'Part II · Sorting (p < 2)' },
      'Part III':    { ang:  Math.PI * 0.80, col: '#c084fc', colL: '#8f3f71', label: 'Part III · Sewn Seams' },
      'Part IV':     { ang:  Math.PI * 1.08, col: '#fbbf24', colL: '#b57614', label: 'Part IV · Compression' },
      'Obstruction': { ang:  Math.PI * 1.32, col: '#f87171', colL: '#ad2111', label: 'Obstruction & Lists' },
    };

    const stars = [];
    const starById = new Map();

    // 1. Place 21 milestones in spacious elliptical rings around ω_F = 9/4 singularity
    const msDist = {
      'thm:square': 0,
      'cor:tight': 1, 'cor:rectangular': 1, 'lean:exact': 1, 'cor:extremal-price': 1, 'prop:finitefield': 1, 'lem:specialize': 1,
      'thm:shaving': 2, 'thm:many': 2, 'lem:macro': 2, 'lem:batch-table': 2, 'lem:core-width': 2,
      'thm:sort': 3, 'lem:local': 3, 'thm:incidence': 3, 'thm:sphere': 3,
      'thm:sync': 4, 'prop:fusion': 4, 'thm:motion': 4, 'prop:tripod': 4, 'thm:extension': 4,
    };
    const byRing = new Map();
    milestones.forEach(m => {
      const r = msDist[m.id] ?? 2;
      if (!byRing.has(r)) byRing.set(r, []);
      byRing.get(r).push(m);
    });

    const ringRadii = [0, 82, 140, 192, 232];
    milestones.forEach(m => {
      const rIdx = msDist[m.id] ?? 2;
      let x = 0, y = 0;
      if (rIdx > 0) {
        const sec = SECTORS[m.part] || SECTORS['Main'];
        const ringList = byRing.get(rIdx).filter(o => o.part === m.part);
        const pos = ringList.indexOf(m);
        const spread = Math.min(0.46, (ringList.length - 1) * 0.16);
        const ang = sec.ang + (ringList.length > 1 ? lerp(-spread, spread, pos / (ringList.length - 1)) : 0);
        const rad = ringRadii[rIdx] + (pos % 2) * 10;
        x = Math.cos(ang) * rad * EX; y = Math.sin(ang) * rad * EY;
      }
      const st = {
        id: m.id, tier: 'milestone', ring: rIdx,
        x, y, r: rIdx === 0 ? 12.5 : (m.is_lean ? 8.2 : 6.2),
        label: m.short, title: m.title, part: m.part, file: m.file, lines: m.lines,
        summary: m.summary, math: m.math, tex: m.tex || '', is_lean: !!m.is_lean,
      };
      stars.push(st); starById.set(st.id, st);
    });

    // 2. Place all 48 real declarations in the middle constellation halo (r = 266..294)
    const declsByPart = new Map();
    paperDecls.forEach(d => {
      if (!declsByPart.has(d.part)) declsByPart.set(d.part, []);
      declsByPart.get(d.part).push(d);
    });
    paperDecls.forEach((d, idx) => {
      const sec = SECTORS[d.part] || SECTORS['Main'];
      const list = declsByPart.get(d.part);
      const pos = list.indexOf(d);
      const span = d.part === 'Part I' ? 0.56 : 0.28;
      const ang = sec.ang + (list.length > 1 ? lerp(-span, span, pos / (list.length - 1)) : 0);
      const rad = 268 + (pos % 3) * 13;
      const sid = 'decl:' + idx;
      const st = {
        id: sid, rawLabel: d.id, tier: 'decl', ring: 5,
        x: Math.cos(ang) * rad * EX, y: Math.sin(ang) * rad * EY,
        r: d.kind === 'theorem' ? 4.4 : (d.kind === 'proposition' ? 3.8 : 3.0),
        label: d.name.length > 26 ? d.name.slice(0, 24) + '…' : d.name,
        title: `${d.kind[0].toUpperCase() + d.kind.slice(1)} · ${d.name}`,
        part: d.part, file: d.file, line: d.line, lines: null,
        summary: `Formal ${d.kind} declared at line ${d.line} of build/${d.file} (label \\label{${d.id}}).`,
        math: '', tex: d.tex, refs: d.refs,
      };
      stars.push(st); starById.set(sid, st);
    });

    // 3. Place all 28 real .tex files in the outer archival rim (r = 318..336)
    const filesByPart = new Map();
    paperFiles.forEach(f => {
      if (!filesByPart.has(f.part)) filesByPart.set(f.part, []);
      filesByPart.get(f.part).push(f);
    });
    paperFiles.forEach(f => {
      const sec = SECTORS[f.part] || SECTORS['Main'];
      const list = filesByPart.get(f.part);
      const pos = list.indexOf(f);
      const span = f.part === 'Part I' ? 0.58 : 0.28;
      const ang = sec.ang + (list.length > 1 ? lerp(-span, span, pos / (list.length - 1)) : 0);
      const rad = 320 + (pos % 2) * 15;
      const sid = 'file:' + f.name;
      const st = {
        id: sid, tier: 'file', ring: 6,
        x: Math.cos(ang) * rad * EX, y: Math.sin(ang) * rad * EY,
        r: clamp(2.8 + Math.sqrt(f.lines) * 0.14, 3.2, 6.8),
        label: f.name, title: `build/${f.name} · ${f.section}`,
        part: f.part, file: f.name, lines: f.lines,
        summary: `${f.lines} lines of LaTeX (${f.decls} theorems/lemmas). Cites: ${f.cites_files.length ? f.cites_files.join(', ') : 'foundational / standalone'}.`,
        math: '', tex: '', cites_files: f.cites_files,
      };
      stars.push(st); starById.set(sid, st);
    });

    // Unified edges: milestone DAG + decl -> file + decl -> milestone
    const allEdges = [];
    const upMap = new Map(stars.map(s => [s.id, []]));
    const downMap = new Map(stars.map(s => [s.id, []]));
    function addEdge(u, v, kind) {
      if (!starById.has(u) || !starById.has(v) || u === v) return;
      allEdges.push({ u, v, kind });
      downMap.get(u).push(v);
      upMap.get(v).push(u);
    }
    msEdges.forEach(([u, v]) => addEdge(u, v, 'spine'));
    stars.filter(s => s.tier === 'decl').forEach(d => {
      addEdge('file:' + d.file, d.id, 'file');
      if (starById.has(d.rawLabel)) addEdge(d.id, d.rawLabel, 'decl');
      else {
        const msInFile = milestones.find(m => m.file === d.file);
        if (msInFile) addEdge(d.id, msInFile.id, 'decl');
      }
    });

    const spineIds = new Set([
      'prop:tripod', 'thm:motion', 'thm:sync', 'thm:sphere', 'thm:incidence',
      'thm:sort', 'lem:batch-table', 'lem:local', 'lem:macro', 'thm:shaving',
      'thm:many', 'prop:finitefield', 'lem:specialize', 'thm:square',
    ]);

    function collectCone(start, adj) {
      const seen = new Set(), q = [...(adj.get(start) || [])];
      while (q.length) {
        const cur = q.shift();
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const nxt of (adj.get(cur) || [])) q.push(nxt);
      }
      return seen;
    }

    const state = {
      selected: 'thm:square',
      hovered: null,
      filter: 'all',
      darkCosmos: true,
      camX: 0, camY: 0, camZ: 1,
      camTX: 0, camTY: 0, camTZ: 1,
      dragging: false, dragMoved: false, lastX: 0, lastY: 0,
      cascading: false, cascadeT: 0,
      leanTab: 'solution',
      animT: 0,
      visible: true,
    };

    function getBaseScale(w, h) {
      return Math.min(w / 1160, h / 730);
    }
    function worldToScreen(wx, wy, w, h) {
      const sc = getBaseScale(w, h) * state.camZ;
      return [w * 0.5 + (wx - state.camX) * sc, h * 0.52 + (wy - state.camY) * sc, sc];
    }
    function screenToWorld(sx, sy, w, h) {
      const sc = getBaseScale(w, h) * state.camZ;
      return [(sx - w * 0.5) / sc + state.camX, (sy - h * 0.52) / sc + state.camY];
    }

    const bgStars = Array.from({ length: 180 }, (_, i) => ({
      x: (hRand(i * 5 + 1) - 0.5) * 1400,
      y: (hRand(i * 5 + 2) - 0.5) * 860,
      r: 0.55 + hRand(i * 5 + 3) * 1.15,
      a: 0.1 + hRand(i * 5 + 4) * 0.36,
      ph: hRand(i * 7 + 3) * 6.28,
    }));

    function draw() {
      const T = readTokens();
      const dark = state.darkCosmos;
      const isFS = fig.classList.contains('mm-fullscreen');
      const stageH = isFS ? Math.max(380, canvas.parentElement.clientHeight || 540) : 480;
      const { ctx, w, h } = sizeCanvas(canvas, stageH, 420);

      hudEl.classList.toggle('light', !dark);
      searchEl.classList.toggle('light', !dark);
      zoomBar.classList.toggle('light', !dark);

      if (dark) {
        const bgG = ctx.createRadialGradient(w * 0.5, h * 0.52, 20, w * 0.5, h * 0.52, Math.max(w, h) * 0.68);
        bgG.addColorStop(0, '#101b33');
        bgG.addColorStop(0.55, '#090e1b');
        bgG.addColorStop(1, '#050810');
        ctx.fillStyle = bgG;
      } else {
        ctx.fillStyle = T.bg;
      }
      ctx.fillRect(0, 0, w, h);

      const [ox, oy, sc] = worldToScreen(0, 0, w, h);

      // Subtle sector nebula washes + twinkling dust stars in cosmos mode
      if (dark) {
        for (const [k, sec] of Object.entries(SECTORS)) {
          if (k === 'Lean 4') continue;
          const [nx, ny] = worldToScreen(Math.cos(sec.ang) * 210 * EX, Math.sin(sec.ang) * 210 * EY, w, h);
          const ng = ctx.createRadialGradient(nx, ny, 8, nx, ny, 165 * sc);
          ng.addColorStop(0, rgba(sec.col, 0.085));
          ng.addColorStop(1, rgba(sec.col, 0));
          ctx.beginPath(); ctx.arc(nx, ny, 165 * sc, 0, Math.PI * 2);
          ctx.fillStyle = ng; ctx.fill();
        }
        for (const bs of bgStars) {
          const [sx, sy] = worldToScreen(bs.x, bs.y, w, h);
          if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
          const tw = 0.72 + 0.28 * Math.sin(state.animT * 1.7 + bs.ph);
          ctx.beginPath(); ctx.arc(sx, sy, bs.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(198,218,255,${(bs.a * tw).toFixed(2)})`; ctx.fill();
        }
      }

      // Concentric elliptical orbital tracks
      for (const rr of [86, 168, 258, 326]) {
        ctx.beginPath(); ctx.ellipse(ox, oy, rr * EX * sc, rr * EY * sc, 0, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(130,165,230,0.095)' : rgba(T.fg4, 0.13);
        ctx.lineWidth = 1; ctx.stroke();
      }

      const focusId = state.hovered || state.selected;
      const anc = collectCone(focusId, upMap);
      const des = collectCone(focusId, downMap);

      function isLit(st) {
        if (state.filter === 'spine') return spineIds.has(st.id);
        if (state.filter === 'spheres') return st.part === 'Part I';
        if (state.filter === 'lean') return st.id === 'lean:exact' || st.id === 'thm:square' || st.id === 'cor:rectangular';
        return st.id === focusId || anc.has(st.id) || des.has(st.id);
      }

      // Draw curved galactic dependency filaments
      const filterActive = state.filter !== 'all';
      for (const e of allEdges) {
        const su = starById.get(e.u), sv = starById.get(e.v);
        const [x1, y1] = worldToScreen(su.x, su.y, w, h);
        const [x2, y2] = worldToScreen(sv.x, sv.y, w, h);
        const mx = (x1 + x2) * 0.5 + (oy - (y1 + y2) * 0.5) * 0.06;
        const my = (y1 + y2) * 0.5 + ((x1 + x2) * 0.5 - ox) * 0.06;

        const bothFilterLit = isLit(su) && isLit(sv);
        const onUp = !filterActive && (e.v === focusId || anc.has(e.v)) && (anc.has(e.u) || e.u === focusId);
        const onDown = !filterActive && (e.u === focusId || des.has(e.u)) && (des.has(e.v) || e.v === focusId);

        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2);
        if (filterActive && bothFilterLit) {
          const fc = state.filter === 'lean' ? '#34d399' : (state.filter === 'spheres' ? '#5ca2ff' : '#fbbf24');
          ctx.strokeStyle = dark ? rgba(fc, 0.85) : rgba(state.filter === 'lean' ? T.good : T.blue, 0.85);
          ctx.lineWidth = e.kind === 'spine' ? 2.2 : 1.3;
        } else if (onUp) {
          ctx.strokeStyle = dark ? 'rgba(251,191,36,0.58)' : rgba(T.amber, 0.65);
          ctx.lineWidth = e.kind === 'spine' ? 1.8 : 0.9;
        } else if (onDown) {
          ctx.strokeStyle = dark ? 'rgba(92,162,255,0.75)' : rgba(T.blue, 0.78);
          ctx.lineWidth = e.kind === 'spine' ? 1.9 : 1.0;
        } else {
          const dimA = filterActive ? 0.045 : (e.kind === 'spine' ? 0.14 : 0.065);
          ctx.strokeStyle = dark ? `rgba(140,165,215,${dimA})` : rgba(T.fg4, dimA);
          ctx.lineWidth = e.kind === 'spine' ? 1.0 : 0.65;
        }
        ctx.stroke();

        // Continuous living starlight pulses flowing gently along active proof filaments!
        if (!reducedMotion() && !state.cascading && e.kind === 'spine' && (onUp || onDown || (filterActive && bothFilterLit))) {
          const seed = (su.ring * 0.27 + sv.ring * 0.13);
          const p = (((state.animT * 0.34 + seed) % 1) + 1) % 1;
          const q = 1 - p;
          const px = q * q * x1 + 2 * q * p * mx + p * p * x2;
          const py = q * q * y1 + 2 * q * p * my + p * p * y2;
          ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = onDown || (filterActive && state.filter === 'lean')
            ? (dark ? '#7dd3fc' : T.blue)
            : (dark ? '#fde68a' : T.amber);
          ctx.fill();
        }

        // Traveling cascade photons racing inward from ring 6 -> ring 0
        if (state.cascading) {
          const waveR = lerp(6.4, -0.4, state.cascadeT);
          const uDist = su.ring, vDist = sv.ring;
          if (waveR <= uDist + 0.7 && waveR >= vDist - 0.7) {
            const p = clamp((uDist - waveR) / Math.max(0.5, uDist - vDist), 0, 1);
            const q = 1 - p;
            const px = q * q * x1 + 2 * q * p * mx + p * p * x2;
            const py = q * q * y1 + 2 * q * p * my + p * p * y2;
            ctx.beginPath(); ctx.arc(px, py, e.kind === 'spine' ? 4.4 : 2.6, 0, Math.PI * 2);
            ctx.fillStyle = dark ? '#fde68a' : T.amber; ctx.fill();
          }
        }
      }

      // Cascade inward shockwave ellipse
      if (state.cascading) {
        const waveR = Math.max(2, lerp(336, 0, state.cascadeT));
        ctx.beginPath(); ctx.ellipse(ox, oy, waveR * EX * sc, waveR * EY * sc, 0, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(253,224,71,0.58)' : rgba(T.amber, 0.55);
        ctx.lineWidth = 2.4; ctx.stroke();
      }

      // Draw all 97 stars first (so labels ALWAYS render cleanly on top!)
      const starScreen = new Map();
      for (const st of stars) {
        const [px, py] = worldToScreen(st.x, st.y, w, h);
        const sec = SECTORS[st.part] || SECTORS['Main'];
        const col = dark ? sec.col : sec.colL;
        const isSel = st.id === state.selected;
        const isHov = st.id === state.hovered;
        const lit = isLit(st);
        const rad = st.r * clamp(sc * 1.15, 0.68, 1.48);
        starScreen.set(st.id, { px, py, rad, col, isSel, isHov, lit });

        const waveHit = state.cascading && Math.abs(st.ring - lerp(6.4, 0, state.cascadeT)) < 0.85;
        if (st.ring === 0 || isSel || isHov || waveHit) {
          const hr = rad * (st.ring === 0 ? (3.0 + Math.sin(state.animT * 3) * 0.35) : 2.5);
          const hg = ctx.createRadialGradient(px, py, rad * 0.2, px, py, hr);
          hg.addColorStop(0, rgba(waveHit ? '#facc15' : col, dark ? 0.62 : 0.34));
          hg.addColorStop(1, rgba(col, 0));
          ctx.beginPath(); ctx.arc(px, py, hr, 0, Math.PI * 2);
          ctx.fillStyle = hg; ctx.fill();
        }
        // Subtle 4-point star flare on central singularity ω_F = 9/4
        if (st.ring === 0) {
          ctx.strokeStyle = rgba(col, dark ? 0.55 : 0.38); ctx.lineWidth = 1.3;
          const fl = rad * 2.4;
          ctx.beginPath();
          ctx.moveTo(px - fl, py); ctx.lineTo(px + fl, py);
          ctx.moveTo(px, py - fl); ctx.lineTo(px, py + fl);
          ctx.stroke();
        }

        ctx.globalAlpha = lit || waveHit ? 1 : (dark ? 0.24 : 0.2);
        ctx.beginPath();
        if (st.tier === 'decl') {
          // Diamond star for parsed declarations
          ctx.moveTo(px, py - rad); ctx.lineTo(px + rad, py); ctx.lineTo(px, py + rad); ctx.lineTo(px - rad, py); ctx.closePath();
        } else {
          ctx.arc(px, py, rad, 0, Math.PI * 2);
        }
        ctx.fillStyle = isSel ? (dark ? '#ffffff' : T.fg) : (waveHit ? '#fde047' : col);
        ctx.fill();
        if (st.tier === 'milestone' || isSel || isHov) {
          ctx.strokeStyle = isSel ? col : (dark ? '#090e1b' : T.bg);
          ctx.lineWidth = isSel ? 2.4 : 1.3; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Strict collision-free priority label placement!
      const placed = [
        { x: 0, y: 0, w: Math.min(w * 0.62, 430), h: 42 }, // protect top-left HUD pill
        { x: w - 180, y: 0, w: 180, h: 44 },               // protect top-right search box
        { x: 0, y: h - 42, w: 135, h: 42 },                // protect bottom-left zoom bar
      ];
      function canPlace(bx, by, bw, bh) {
        if (bx < 6 || bx + bw > w - 6 || by < 6 || by + bh > h - 6) return false;
        for (const p of placed) {
          if (bx < p.x + p.w && bx + bw > p.x && by < p.y + p.h && by + bh > p.y) return false;
        }
        return true;
      }

      // Reserve & render clean outer Sector titles first
      if (state.camZ < 1.55) {
        const secAnchors = [
          { k: 'Main',        wx: 0, wy: -322 * EY },
          { k: 'Lean 4',      wx: 275 * EX, wy: -245 * EY },
          { k: 'Part I',      wx: 342 * EX, wy: 158 * EY },
          { k: 'Part II',     wx: -15 * EX, wy: 348 * EY },
          { k: 'Part III',    wx: -308 * EX, wy: 242 * EY },
          { k: 'Part IV',     wx: -355 * EX, wy: -62 * EY },
          { k: 'Obstruction', wx: -255 * EX, wy: -265 * EY },
        ];
        ctx.font = `600 10px ${T.mono}`;
        for (const sa of secAnchors) {
          const sec = SECTORS[sa.k];
          const [lx, ly] = worldToScreen(sa.wx, sa.wy, w, h);
          const tw = ctx.measureText(sec.label).width + 10;
          const bx = clamp(lx - tw / 2, 10, w - tw - 10);
          const by = clamp(ly - 8, 44, h - 22);
          if (canPlace(bx, by, tw, 17)) {
            placed.push({ x: bx, y: by, w: tw, h: 17 });
            haloText(ctx, sec.label, bx + tw / 2, by + 9, dark ? sec.col : sec.colL, dark ? '#090e1b' : T.bg, 'center', `600 10px ${T.mono}`);
          }
        }
      }

      // Priority-sorted star labels: 0 = singularity/selected/hovered, 1 = direct neighbors & lean, 2 = other milestones, 3 = zoomed decls/files
      const directNeigh = new Set([...(upMap.get(focusId) || []), ...(downMap.get(focusId) || [])]);
      const candidates = [];
      for (const st of stars) {
        const ss = starScreen.get(st.id);
        if (ss.px < 10 || ss.px > w - 10 || ss.py < 10 || ss.py > h - 10) continue;
        let pri = 99;
        if (st.id === state.selected || st.id === state.hovered || st.ring === 0) pri = 0;
        else if (st.is_lean || (st.tier === 'milestone' && directNeigh.has(st.id) && ss.lit)) pri = 1;
        else if (st.tier === 'milestone' && ss.lit) pri = 2;
        else if (st.tier === 'milestone' && !filterActive) pri = 3;
        else if (state.camZ > 1.35 && ss.lit) pri = 4;
        if (pri < 99) candidates.push({ st, ss, pri });
      }
      candidates.sort((a, b) => a.pri - b.pri || a.st.ring - b.st.ring);

      for (const { st, ss, pri } of candidates) {
        const isHero = st.ring === 0 || ss.isSel || ss.isHov;
        const fSz = st.ring === 0 ? 11.5 : (isHero ? 10.5 : (st.tier === 'milestone' ? 9.6 : 8.8));
        ctx.font = `${isHero ? '700' : '600'} ${fSz}px ${T.sans}`;
        const tw = ctx.measureText(st.label).width + (isHero ? 14 : 8);
        const bh = isHero ? 19 : 16;

        // Try above star, then below star, then right of star
        const tries = [
          [ss.px - tw / 2, ss.py - ss.rad - bh - 3],
          [ss.px - tw / 2, ss.py + ss.rad + 4],
          [ss.px + ss.rad + 5, ss.py - bh / 2],
        ];
        let chosen = null;
        for (const [tx, ty] of tries) {
          if (pri === 0 || canPlace(tx - 2, ty - 2, tw + 4, bh + 4)) {
            chosen = [clamp(tx, 6, w - tw - 6), clamp(ty, 6, h - bh - 6)];
            break;
          }
        }
        if (!chosen) continue;
        placed.push({ x: chosen[0] - 2, y: chosen[1] - 2, w: tw + 4, h: bh + 4 });

        const lx = chosen[0] + tw / 2, ly = chosen[1] + bh / 2;
        if (isHero) {
          ctx.fillStyle = dark ? 'rgba(9, 14, 27, 0.86)' : 'rgba(255, 255, 255, 0.92)';
          rrect(ctx, chosen[0], chosen[1], tw, bh, 9); ctx.fill();
          ctx.strokeStyle = rgba(ss.col, 0.7); ctx.lineWidth = 1.1; ctx.stroke();
          ctx.fillStyle = dark ? '#ffffff' : T.fg;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(st.label, lx, ly + 0.5);
        } else {
          const txtCol = dark ? (ss.lit ? '#e2ebff' : 'rgba(180,198,230,0.6)') : (ss.lit ? T.fg2 : T.fg4);
          ctx.textBaseline = 'middle';
          haloText(ctx, st.label, lx, ly, txtCol, dark ? '#090e1b' : T.bg, 'center', `600 ${fSz}px ${T.sans}`);
        }
      }
      ctx.textBaseline = 'alphabetic';
    }

    function renderInspector() {
      const st = starById.get(state.selected) || starById.get('thm:square');
      const ups = (upMap.get(st.id) || []).filter(id => starById.get(id).tier === 'milestone');
      const dns = (downMap.get(st.id) || []).filter(id => starById.get(id).tier === 'milestone');

      const upHtml = ups.length
        ? `<span>Requires:</span>` + ups.map(id => `<button type="button" class="mm-insp-chip up" data-jump="${esc(id)}">← ${esc(starById.get(id).label)}</button>`).join('')
        : '';
      const dnHtml = dns.length
        ? `<span>Feeds:</span>` + dns.map(id => `<button type="button" class="mm-insp-chip down" data-jump="${esc(id)}">${esc(starById.get(id).label)} →</button>`).join('')
        : '';

      let codeBlock = '';
      if (st.is_lean) {
        const code = state.leanTab === 'solution' ? data.lean.exact_lean : data.lean.challenge_excerpt;
        codeBlock = `
          <div class="mm-insp-links" style="margin-top:2px">
            <button type="button" class="mm-btn" data-ltab="solution" aria-pressed="${state.leanTab === 'solution'}">ExactExponent.lean</button>
            <button type="button" class="mm-btn" data-ltab="challenge" aria-pressed="${state.leanTab === 'challenge'}">ComparatorChallenges/MatrixExponent.lean</button>
            <span style="font:500 10.5px var(--font-mono);color:var(--fg3)">Axioms: propext, Quot.sound, Classical.choice · enable_nanoda: false</span>
          </div>
          <div class="mm-code-box">${highlightLean(code)}</div>
        `;
      } else if (st.tex) {
        codeBlock = `<div class="mm-code-box" style="white-space:pre-wrap">${esc(st.tex)}</div>`;
      }

      const locTag = st.line ? `${st.file}:${st.line}` : (st.lines ? `${st.file} (${st.lines} lines)` : st.file);
      inspEl.innerHTML = `
        <div class="mm-insp-top">
          <h4 class="mm-insp-title">${esc(st.title)}</h4>
          <span class="mm-insp-badge">${esc(st.part)} · ${esc(locTag)}</span>
        </div>
        ${st.math ? `<div class="mm-insp-math"><span class="math-display" data-tex="${esc(st.math)}">${esc(st.math)}</span></div>` : ''}
        <p class="mm-insp-summary">${esc(st.summary)}</p>
        ${(upHtml || dnHtml) ? `<div class="mm-insp-links">${upHtml}${dnHtml}</div>` : ''}
        ${codeBlock}
      `;
      renderMathSafe(inspEl);
      inspEl.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
        state.selected = b.dataset.jump; state.filter = 'all';
        filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all')));
        renderInspector(); draw();
      }));
      inspEl.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => {
        state.leanTab = b.dataset.ltab; renderInspector();
      }));
    }

    function hitStar(pt) {
      const w = canvas.clientWidth || 860, h = canvas.clientHeight || 470;
      let best = null, bestD = 18;
      for (const st of stars) {
        const [px, py] = worldToScreen(st.x, st.y, w, h);
        const d = Math.hypot(pt.x - px, pt.y - py);
        if (d < bestD) { bestD = d; best = st.id; }
      }
      return best;
    }

    canvas.addEventListener('pointerdown', e => {
      const pt = canvasXY(canvas, e);
      state.dragging = true; state.dragMoved = false; state.lastX = pt.x; state.lastY = pt.y;
      canvas.classList.add('dragging');
    });
    window.addEventListener('pointermove', e => {
      const pt = canvasXY(canvas, e);
      if (state.dragging) {
        const dx = pt.x - state.lastX, dy = pt.y - state.lastY;
        if (Math.hypot(dx, dy) > 2) state.dragMoved = true;
        const sc = getBaseScale(canvas.clientWidth || 860, canvas.clientHeight || 480) * state.camZ;
        state.camX -= dx / sc; state.camY -= dy / sc;
        state.camTX = state.camX; state.camTY = state.camY;
        state.lastX = pt.x; state.lastY = pt.y;
        draw();
      } else if (e.target === canvas) {
        const hit = hitStar(pt);
        if (hit !== state.hovered) { state.hovered = hit; canvas.style.cursor = hit ? 'pointer' : 'grab'; draw(); }
      }
    });
    window.addEventListener('pointerup', e => {
      if (!state.dragging) return;
      state.dragging = false; canvas.classList.remove('dragging');
      if (!state.dragMoved) {
        const hit = hitStar(canvasXY(canvas, e));
        if (hit) {
          state.selected = hit; state.filter = 'all';
          filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all')));
          Sound.chime(6 - (starById.get(hit).ring % 6), 0.08, false);
          renderInspector(); draw();
        }
      }
    });

    canvas.addEventListener('wheel', e => {
      if (!e.ctrlKey && !fig.classList.contains('mm-fullscreen') && Math.abs(e.deltaY) < 40) return;
      e.preventDefault();
      const pt = canvasXY(canvas, e);
      const w = canvas.clientWidth || 860, h = canvas.clientHeight || 470;
      const before = screenToWorld(pt.x, pt.y, w, h);
      const factor = e.deltaY < 0 ? 1.16 : 0.86;
      state.camZ = clamp(state.camZ * factor, 0.65, 4.5);
      const after = screenToWorld(pt.x, pt.y, w, h);
      state.camX += before[0] - after[0];
      state.camY += before[1] - after[1];
      state.camTX = state.camX; state.camTY = state.camY; state.camTZ = state.camZ;
      draw();
    }, { passive: false });

    zoomBar.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.z === 'in') state.camTZ = clamp(state.camTZ * 1.35, 0.65, 4.5);
      else if (b.dataset.z === 'out') state.camTZ = clamp(state.camTZ / 1.35, 0.65, 4.5);
      else { state.camTX = 0; state.camTY = 0; state.camTZ = 1; }
      draw();
    }));

    // Live Search popover
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      if (!q) { popEl.hidden = true; return; }
      const hits = stars.filter(s =>
        s.title.toLowerCase().includes(q) || s.label.toLowerCase().includes(q) ||
        (s.file && s.file.toLowerCase().includes(q)) || (s.rawLabel && s.rawLabel.toLowerCase().includes(q))
      ).slice(0, 12);
      popEl.hidden = false;
      if (!hits.length) { popEl.innerHTML = `<div style="padding:8px;font:11px var(--font-sans);color:var(--fg3)">No matching star</div>`; return; }
      popEl.innerHTML = hits.map(s => {
        const kCls = s.tier === 'milestone' ? 'node' : (s.tier === 'decl' ? 'decl' : 'file');
        const kLbl = s.tier === 'milestone' ? 'spine' : s.tier;
        return `<button type="button" data-pick="${esc(s.id)}"><span class="sp-k ${kCls}">${kLbl}</span><span class="sp-txt">${esc(s.title)}</span></button>`;
      }).join('');
      popEl.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const st = starById.get(b.dataset.pick);
        state.selected = st.id; state.filter = 'all';
        state.camTX = st.x * 0.62; state.camTY = st.y * 0.62; state.camTZ = Math.max(state.camTZ, 1.65);
        popEl.hidden = true; searchEl.value = '';
        renderInspector(); draw();
      }));
    });
    document.addEventListener('click', e => { if (!searchEl.parentElement.contains(e.target)) popEl.hidden = true; });
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,textarea')) return;
      if (e.key === 'Escape' && fig.classList.contains('mm-fullscreen')) {
        fig.classList.remove('mm-fullscreen'); fsBtn.setAttribute('aria-pressed', 'false'); draw();
      } else if (e.key === '/' && state.visible) {
        e.preventDefault(); searchEl.focus();
      } else if (e.key === ' ' && state.visible) {
        e.preventDefault();
        state.cascading = true; state.cascadeT = 0;
        cascadeBtn.setAttribute('aria-pressed', 'true');
        Sound.chime(1, 0.1, false);
      }
    });

    filterBtns.forEach(b => b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === state.filter)));
      if (state.filter === 'lean') state.selected = 'lean:exact';
      else if (state.filter === 'spheres') state.selected = 'thm:sphere';
      else if (state.filter === 'spine') state.selected = 'prop:finitefield';
      renderInspector(); draw();
    }));

    cascadeBtn.addEventListener('click', () => {
      state.cascading = true; state.cascadeT = 0;
      cascadeBtn.setAttribute('aria-pressed', 'true');
      Sound.chime(1, 0.1, false);
    });
    themeBtn.addEventListener('click', () => {
      state.darkCosmos = !state.darkCosmos;
      themeBtn.setAttribute('aria-pressed', String(state.darkCosmos));
      themeBtn.textContent = state.darkCosmos ? '🌌 Cosmos' : '☀ Paper';
      draw();
    });
    fsBtn.addEventListener('click', () => {
      const on = fig.classList.toggle('mm-fullscreen');
      fsBtn.setAttribute('aria-pressed', String(on));
      setTimeout(draw, 40);
    });

    let lastT = performance.now(), lastWaveRing = 7;
    function tick(now) {
      const dt = clamp((now - lastT) / 1000, 0, 0.05);
      lastT = now;
      if (state.visible) {
        let dirty = false;
        if (!reducedMotion()) { state.animT += dt; dirty = true; }
        if (!state.dragging) {
          const ease = Math.min(1, dt * 8.5);
          if (Math.abs(state.camTX - state.camX) > 0.2 || Math.abs(state.camTY - state.camY) > 0.2 || Math.abs(state.camTZ - state.camZ) > 0.003) {
            state.camX += (state.camTX - state.camX) * ease;
            state.camY += (state.camTY - state.camY) * ease;
            state.camZ += (state.camTZ - state.camZ) * ease;
            dirty = true;
          }
        }
        if (state.cascading) {
          state.cascadeT = Math.min(1, state.cascadeT + dt * 0.34);
          const curRing = Math.floor(lerp(6.4, 0, state.cascadeT));
          if (curRing < lastWaveRing) {
            lastWaveRing = curRing;
            Sound.chime(8 - Math.max(0, curRing), 0.1, curRing <= 0);
          }
          if (state.cascadeT >= 1) {
            state.cascading = false; lastWaveRing = 7;
            cascadeBtn.setAttribute('aria-pressed', 'false');
          }
          dirty = true;
        }
        if (dirty) draw();
      }
      requestAnimationFrame(tick);
    }

    new IntersectionObserver(e => { state.visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(fig);
    new ResizeObserver(() => draw()).observe(shell);
    renderInspector(); draw(); requestAnimationFrame(tick);

    controllers.set('mm-map', ds => {
      if (ds.filter) {
        state.filter = ds.filter;
        filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === state.filter)));
        if (ds.filter === 'spine') state.selected = 'prop:finitefield';
      }
      if (ds.node && starById.has(ds.node)) {
        const st = starById.get(ds.node);
        state.selected = ds.node; state.filter = 'all';
        state.camTX = st.x * 0.45; state.camTY = st.y * 0.45; state.camTZ = 1.35;
        filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all')));
      }
      renderInspector(); draw();
    });
  }

  function wireActionLinks() {
    document.querySelectorAll('a.act[href^="#mm-"]').forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href').slice(1);
        const fn = controllers.get(id);
        if (!fn) return;
        e.preventDefault();
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        fn(a.dataset);
      });
    });
  }

  const srcUrl = figs[0].dataset.src;
  fetch(srcUrl)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      const f1 = document.getElementById('mm-history');
      const f2 = document.getElementById('mm-tripod');
      const f3 = document.getElementById('mm-rect');
      const f4 = document.getElementById('mm-fermion');
      const f5 = document.getElementById('mm-engine');
      const f6 = document.getElementById('mm-map');
      if (f1) initHistory(f1, data);
      if (f2) initTripod(f2, data);
      if (f3) initRect(f3, data);
      if (f4) initFermion(f4, data);
      if (f5) initEngine(f5, data);
      if (f6) initMap(f6, data);
      wireActionLinks();
      document.documentElement.dataset.mmReady = '1';
    })
    .catch(err => console.error('Matrix exponent figures failed to load:', err));
})();
