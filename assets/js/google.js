/* Seven single-form minimalist 2D + 3D visualizations for the Google export post.
   Zero dependencies, warm-paper architectural aesthetic, 100% self-contained Google data. */
(function () {
  'use strict';
  const first = document.getElementById('goog-ads');
  if (!first) return;

  // ----------------------------------------------------------------- helpers
  const $ = (s, e = document) => e.querySelector(s);
  const all = (s, e = document) => [...e.querySelectorAll(s)];
  const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (n, d = 0) => num(n * 100, d) + '%';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ms = s => Date.parse((s.length === 7 ? s + '-01' : s.slice(0, 10)) + 'T00:00:00Z');
  const fmtMonth = ym => { const [y, m] = ym.split('-').map(Number); return `${MON[m - 1]} ${y}`; };
  const fmtDate = (s, yr = true) => {
    const d = new Date(ms(s));
    return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}${yr ? ', ' + d.getUTCFullYear() : ''}`;
  };
  const hourLabel = h => h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? 'noon' : (h - 12) + ' pm';
  const f = v => (Math.round(v * 10) / 10).toString();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const trunc = (s, maxCols) => {
    let cols = 0, out = '';
    for (const ch of String(s)) {
      const cw = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 1.85 : 1;
      if (cols + cw > maxCols) return out.trimEnd() + '…';
      out += ch;
      cols += cw;
    }
    return out;
  };
  const text = (x, y, s, cls = '', anchor = 'start') => `<text x="${f(x)}" y="${f(y)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
  const line = (x1, y1, x2, y2, cls = 'grid') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}"/>`;
  const rect = (x, y, w, h, cls = '', extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" class="${cls}" ${extra}/>`;
  const circle = (x, y, r, cls = '', extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" class="${cls}" ${extra}/>`;
  const svg = (w, h, label, body) => `<svg class="goog-chart" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  const legend = items => `<div class="goog-legend">${items.map(([c, l]) => `<span class="${c}"><i aria-hidden="true"></i>${l}</span>`).join('')}</div>`;
  const hRand = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

  // Monotone cubic Hermite spline (symmetric under reversal, zero overshoot)
  function smoothPath(pts) {
    const n = pts.length;
    if (n < 2) return '';
    if (n === 2) return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;
    const s = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      s.push(Math.abs(dx) < 1e-6 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx);
    }
    const m = new Array(n);
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (s[i - 1] * s[i] <= 0) m[i] = 0;
      else {
        const hm = 2 / (1 / s[i - 1] + 1 / s[i]);
        const lim = 3 * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]));
        m[i] = clamp(hm, -lim, lim);
      }
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1], dx = (p2[0] - p1[0]) / 3;
      d += `C${f(p1[0] + dx)},${f(p1[1] + m[i] * dx)} ${f(p2[0] - dx)},${f(p2[1] - m[i + 1] * dx)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d;
  }

  // Deterministic spiral circle packing
  function packCircles(items, cx, cy, pad = 2.5, aspect = 1.05) {
    const placed = [];
    for (const it of items) {
      let x = 0, y = 0;
      if (placed.length > 0) {
        for (let step = 1; step < 4500; step++) {
          const ang = step * 0.31, rad = 4.0 * Math.sqrt(step);
          const tx = Math.cos(ang) * rad * aspect, ty = Math.sin(ang) * rad;
          let hit = false;
          for (const p of placed) {
            const minD = it.r + p.r + pad;
            if ((tx - p.x) * (tx - p.x) + (ty - p.y) * (ty - p.y) < minD * minD) { hit = true; break; }
          }
          if (!hit) { x = tx; y = ty; break; }
        }
      }
      placed.push({ ...it, x, y });
    }
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    placed.forEach(p => {
      minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r);
      minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r);
    });
    const ox = cx - (minX + maxX) / 2, oy = cy - (minY + maxY) / 2;
    return { nodes: placed.map(p => ({ ...p, x: p.x + ox, y: p.y + oy })), w: maxX - minX, h: maxY - minY };
  }

  // Subtle Web Audio synthesizer (lazy-initialized strictly on user gesture)
  const Sound = {
    ctx: null, master: null, lastTick: 0, lastChime: 0,
    scale: [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0],
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 3200;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(lp); lp.connect(this.ctx.destination);
        return true;
      } catch { return false; }
    },
    chime(hour, isMusic = false) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastChime < 0.06) return;
      this.lastChime = now;
      const idx = clamp(Math.floor((hour / 24) * this.scale.length), 0, this.scale.length - 1);
      const freqs = isMusic ? [this.scale[idx], this.scale[idx] * 1.25, this.scale[idx] * 1.5] : [this.scale[idx]];
      freqs.forEach((fq, k) => {
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
        osc.type = isMusic ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(fq, now);
        const dur = isMusic ? 0.44 : 0.22;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(isMusic ? 0.085 / (k + 1) : 0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(now); osc.stop(now + dur + 0.02);
      });
    },
    tick() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastTick < 0.04) return;
      this.lastTick = now;
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1650 + Math.random() * 480, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
      osc.connect(g); g.connect(this.master);
      osc.start(now); osc.stop(now + 0.02);
    },
  };

  // Minimalist figure chrome (one hairline header, unobstructed stage, one hairline readout)
  function shell(fig, legItems, actionsHtml = '') {
    const el = document.createElement('div');
    el.className = 'goog-body';
    el.innerHTML = `<div class="goog-head">${legend(legItems)}<div class="goog-actions">${actionsHtml}</div></div><div class="goog-subpills" hidden></div><div class="goog-view"></div><p class="goog-readout" aria-live="polite"></p>`;
    fig.insertBefore(el, $('figcaption', fig));
    fig.classList.add('ready');
    return {
      el, actions: $('.goog-actions', el), subpills: $('.goog-subpills', el),
      view: $('.goog-view', el), out: $('.goog-readout', el),
    };
  }
  function observe(el, draw) {
    let old = 0;
    new ResizeObserver(es => {
      const w = Math.round(es[0].contentRect.width);
      if (w > 0 && w !== old) { old = w; draw(); }
    }).observe(el);
  }
  const width = el => Math.max(280, Math.round(el.getBoundingClientRect().width));
  function local(view, ev) {
    const s = $('svg', view), r = s.getBoundingClientRect(), vb = s.viewBox.baseVal;
    return [(ev.clientX - r.left) * vb.width / r.width, (ev.clientY - r.top) * vb.height / r.height];
  }
  function hover(view, pick) {
    view.addEventListener('pointermove', ev => { if ($('svg', view)) pick(...local(view, ev), ev); });
    view.addEventListener('click', ev => { if ($('svg', view)) pick(...local(view, ev), ev); });
  }
  function keys(view, step) {
    view.tabIndex = 0;
    view.addEventListener('keydown', ev => {
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 1, ArrowUp: -1 }[ev.key];
      if (d) { ev.preventDefault(); step(d); }
    });
  }

  // Read live CSS theme tokens for crisp warm-paper & dark-mode 3D Canvas rendering
  function themeColors(fig) {
    const cs = getComputedStyle(fig);
    const get = (k, fb) => cs.getPropertyValue(k).trim() || fb;
    const isDark = document.documentElement.dataset.theme === 'dark';
    return {
      isDark,
      bg: get('--bg', isDark ? '#141311' : '#fcfbf8'),
      subtle: get('--subtle', isDark ? '#1e1c19' : '#f3f1ec'),
      fg: get('--fg', isDark ? '#ece9e2' : '#181817'),
      fg2: get('--fg-2', isDark ? '#b4afa4' : '#4a4843'),
      fg3: get('--fg-3', isDark ? '#8a857b' : '#78746c'),
      line: get('--line', isDark ? '#2c2924' : '#e6e2da'),
      line2: get('--line-2', isDark ? '#3d3932' : '#cfc9be'),
      blue: get('--g-blue', isDark ? '#6ba3ff' : '#0056d2'),
      teal: get('--g-teal', isDark ? '#49b3b8' : '#1d6f72'),
      amber: get('--g-amber', isDark ? '#e09e45' : '#b56e17'),
    };
  }

  // Paper-haloed text helper on Canvas so floating 3D labels stay razor-clean
  function label3d(ctx, txt, x, y, fill, bg, align = 'left', font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif') {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = bg;
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  // Reusable HiDPI 3D orbital stage directly on the open paper canvas
  function createOrbitStage(fig, view, opts) {
    const stage = document.createElement('div');
    stage.className = 'goog-3d-stage';
    stage.innerHTML = `<canvas aria-label="${esc(opts.label)}"></canvas><span class="goog-3d-hint">Drag to orbit · Double-click to reset</span>`;
    view.appendChild(stage);
    const cv = $('canvas', stage);
    const ctx = cv.getContext('2d');

    const st = {
      yaw: opts.yaw, pitch: opts.pitch, zoom: opts.zoom || 1,
      tYaw: opts.yaw, tPitch: opts.pitch, tZoom: opts.zoom || 1,
      dragging: false, ptrIn: false, ptrX: -999, ptrY: -999,
      cw: 720, ch: 368, tSec: 0, visible: true, raf: 0, lastTs: 0,
      canvas: cv, ctx, stage,
      reset() {
        st.tYaw = opts.yaw; st.tPitch = opts.pitch; st.tZoom = opts.zoom || 1;
        st.wake();
      },
      snapCamera(y, p, z) {
        st.yaw = st.tYaw = y; st.pitch = st.tPitch = p;
        if (z !== undefined) st.zoom = st.tZoom = z;
        st.renderOnce();
      },
      proj(x, y, z) {
        const cosY = Math.cos(st.yaw), sinY = Math.sin(st.yaw);
        const cosP = Math.cos(st.pitch), sinP = Math.sin(st.pitch);
        const sc = Math.min(st.cw, st.ch) * (opts.scaleFactor || 0.38) * st.zoom;
        const fov = 4.4, camD = 4.4;
        const cx = st.cw * 0.5, cy = st.ch * (opts.cyFrac || 0.50);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        const p = fov / Math.max(0.85, camD - z2);
        return [cx + x1 * sc * p, cy - y2 * sc * p, z2, p, sc];
      },
      renderOnce() {
        const C = themeColors(fig);
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, st.cw, st.ch);
        opts.draw(ctx, st, C);
      },
      wake() {
        if (!st.raf) { st.lastTs = 0; st.raf = requestAnimationFrame(loop); }
      },
    };

    function resize() {
      const r = stage.getBoundingClientRect();
      st.cw = Math.max(280, Math.round(r.width));
      st.ch = Math.max(260, Math.round(r.height));
      cv.width = st.cw * 2;
      cv.height = st.ch * 2;
      st.renderOnce();
    }

    function loop(ts) {
      st.raf = 0;
      if (!st.visible && !(opts.keepAlive && opts.keepAlive())) return;
      if (!st.lastTs) st.lastTs = ts;
      const dt = Math.min(0.05, (ts - st.lastTs) / 1000);
      st.lastTs = ts;
      st.tSec += dt;
      if (!st.dragging && opts.drift) st.tYaw += dt * opts.drift;
      st.yaw += (st.tYaw - st.yaw) * 0.11;
      st.pitch += (st.tPitch - st.pitch) * 0.11;
      st.zoom += (st.tZoom - st.zoom) * 0.12;
      if (opts.tick) opts.tick(dt, st);
      st.renderOnce();
      st.raf = requestAnimationFrame(loop);
    }

    let lx = 0, ly = 0;
    stage.addEventListener('pointerdown', ev => {
      st.dragging = true; lx = ev.clientX; ly = ev.clientY;
      try { stage.setPointerCapture(ev.pointerId); } catch {}
      st.wake();
    });
    stage.addEventListener('pointermove', ev => {
      const r = stage.getBoundingClientRect();
      st.ptrX = ev.clientX - r.left; st.ptrY = ev.clientY - r.top; st.ptrIn = true;
      if (st.dragging) {
        const dx = ev.clientX - lx, dy = ev.clientY - ly;
        lx = ev.clientX; ly = ev.clientY;
        st.tYaw -= dx * 0.007;
        st.tPitch = clamp(st.tPitch + dy * 0.006, opts.minPitch ?? -1.05, opts.maxPitch ?? 1.24);
      }
      st.wake();
    });
    const endDrag = () => { st.dragging = false; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', () => { st.dragging = false; st.ptrIn = false; });
    stage.addEventListener('dblclick', () => { st.reset(); if (opts.onReset) opts.onReset(); });

    observe(stage, resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => {
        st.visible = es[0].isIntersecting;
        if (st.visible) st.wake();
      }, { threshold: 0.02 }).observe(fig);
    }
    // Re-render cleanly on theme attribute changes
    new MutationObserver(() => st.renderOnce()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    resize();
    st.wake();
    return st;
  }

  // ----------------------------------- Figure 1: The Ad Cliff & Live 39-Second Guillotine
  function figAds(fig, D) {
    const months = D.months, days = D.octSwitch.days, burst = D.octSwitch.burst;
    let selD = days.findIndex(d => d.d === '2026-10-23');
    let burstSec = 200, playing = false, soundOn = false, rafId = 0, lastTs = 0, firedMask = 0;
    let geo = null;

    const ui = shell(fig, [
      ['blue', 'YouTube video (up)'],
      ['teal', 'YouTube Music (up)'],
      ['amber', 'Google Ads (down)'],
    ], `<button type="button" class="accent" data-replay aria-pressed="false">▶ Replay Oct 23 23:48</button><button type="button" data-snd aria-pressed="false">♪ Sound</button>`);

    const repBtn = $('[data-replay]', ui.actions);
    const sndBtn = $('[data-snd]', ui.actions);

    function stopPlay() {
      playing = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      repBtn.setAttribute('aria-pressed', 'false');
      repBtn.textContent = '▶ Replay Oct 23 23:48';
    }

    function startReplay() {
      playing = true; burstSec = 0; lastTs = 0; firedMask = 0;
      selD = days.findIndex(d => d.d === '2026-10-23');
      repBtn.setAttribute('aria-pressed', 'true');
      repBtn.textContent = '❚❚ Pause burst';
      rafId = requestAnimationFrame(tickPlay);
    }

    function tickPlay(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      burstSec = Math.min(200, burstSec + dt * 28);
      if (soundOn) {
        burst.forEach((b, idx) => {
          if (burstSec >= b.sec && !(firedMask & (1 << idx))) {
            firedMask |= (1 << idx);
            Sound.tick();
          }
        });
        if (burstSec >= 198 && !(firedMask & (1 << 10))) {
          firedMask |= (1 << 10);
          Sound.chime(14, true);
        }
      }
      draw();
      if (burstSec >= 200) { stopPlay(); draw(); return; }
      rafId = requestAnimationFrame(tickPlay);
    }

    repBtn.addEventListener('click', () => { if (playing) { stopPlay(); draw(); } else startReplay(); });
    sndBtn.addEventListener('click', () => {
      if (!soundOn && Sound.init()) { soundOn = true; if (!playing) startReplay(); }
      else soundOn = false;
      sndBtn.setAttribute('aria-pressed', String(soundOn));
      sndBtn.textContent = soundOn ? '♪ Sound ON' : '♪ Sound';
    });

    function draw() {
      const w = width(ui.view), x0 = 40, pw = w - x0 - 12;
      // Quiet 18-month escalation sparkline integrated cleanly at top
      const spTop = 16, spH = 30;
      const top = spTop + spH + 30, upH = 92, downH = 92, mid = top + upH;
      const stripY = mid + downH + 28, stripH = 44, H = stripY + stripH + 14;
      const n = days.length, stepW = pw / n, bw = Math.max(2, stepW * 0.76);
      const X = i => x0 + (i + 0.5) * stepW;
      const maxUp = 85, maxDn = 115;
      const uy = v => mid - (clamp(v, 0, maxUp) / maxUp) * upH;
      const dy = v => mid + (clamp(v, 0, maxDn) / maxDn) * downH;
      let s = '';

      // 18-month ads/video sparkline (0.10x Mar 3 -> 3.76x Sep -> 0 Nov)
      const spX = i => x0 + (i / (months.length - 1)) * pw;
      const spY = r => spTop + spH - (clamp(r, 0, 4) / 4) * spH;
      const spPts = months.map((m, i) => [spX(i), spY(m.adRatio)]);
      const spLine = smoothPath(spPts);
      s += line(x0, spTop + spH, x0 + pw, spTop + spH, 'grid');
      s += `<path d="${spLine}L${f(spX(months.length - 1))},${f(spTop + spH)}L${f(spX(0))},${f(spTop + spH)}Z" class="area-amber"/>`;
      s += `<path d="${spLine}" class="step amber"/>`;
      s += text(x0, spTop - 4, w < 480 ? '18m ad load: 0.10× → 3.76× → 0' : '18-month ad load (ads per video): 0.10× on Mar 3 (“Good”) → 3.76× in Sep → 0 in Nov', 'small ink');
      const iMar = months.findIndex(m => m.m === '2026-03');
      const iSep = months.findIndex(m => m.m === '2026-09');
      if (iMar >= 0) s += circle(spX(iMar), spY(months[iMar].adRatio), 2.5, 'dot ink');
      if (iSep >= 0) {
        s += circle(spX(iSep), spY(months[iSep].adRatio), 2.8, 'dot amber');
        if (w >= 420) s += text(spX(iSep) - 6, spY(months[iSep].adRatio) + 3, '3.76×', 'amber small halo', 'end');
      }

      // Main diverging daily October-November cliff
      const i24 = days.findIndex(d => d.d === '2026-10-24');
      if (i24 >= 0) {
        const zx = X(i24) - stepW / 2;
        s += rect(zx, mid, x0 + pw - zx, downH, 'panel-box');
        if (w >= 460) s += text((zx + x0 + pw) / 2, mid + 52, '0 ads logged across 31 days · pace jumps 7.7×', 'blue small', 'middle');
      }

      for (const v of [40, 80]) { s += line(x0, uy(v), x0 + pw, uy(v), 'grid') + text(x0 - 6, uy(v) + 3.5, '+' + v, '', 'end'); }
      s += line(x0, mid, x0 + pw, mid, 'axis') + text(x0 - 6, mid + 3.5, '0', 'strong', 'end');
      for (const v of [50, 100]) { s += line(x0, dy(v), x0 + pw, dy(v), 'grid') + text(x0 - 6, dy(v) + 3.5, '−' + v, 'amber', 'end'); }

      days.forEach((d, i) => {
        const bx = X(i) - bw / 2;
        const hYT = mid - uy(d.yt), hYTM = mid - uy(d.yt + d.ytm) - hYT, hAd = dy(d.ads) - mid;
        const hi = i === selD ? '' : ' style="opacity:0.84"';
        if (d.yt) s += rect(bx, mid - hYT, bw, hYT, 'bar on', `rx="0.8"${hi}`);
        if (d.ytm) s += rect(bx, mid - hYT - hYTM, bw, hYTM, 'bar teal', `rx="0.8"${hi}`);
        if (d.ads) s += rect(bx, mid, bw, hAd, 'bar amber', `rx="0.8"${hi}`);
      });

      const i11 = days.findIndex(d => d.d === '2026-10-11');
      const i19 = days.findIndex(d => d.d === '2026-10-19');
      const i23 = days.findIndex(d => d.d === '2026-10-23');
      if (i19 >= 0) {
        const x19 = X(i19) - stepW / 2;
        s += line(x19, top - 2, x19, mid + downH, 'bench');
        s += text(x19 + 4, top - 6, w < 440 ? 'Oct 19: Music starts' : 'Oct 19: YouTube Music begins', 'teal small');
      }
      if (i11 >= 0 && w >= 420) s += text(X(i11) + 5, dy(106) - 2, 'Oct 11: 106 ads', 'amber small halo');
      if (i23 >= 0 && w >= 520) s += text(X(i23) + 5, dy(7) + 14, 'Oct 23: 7-ad leak during 3h 41m Google One lapse', 'amber small halo');

      const tickDates = w < 460
        ? ['2026-10-01', '2026-10-19', '2026-11-05', '2026-11-23']
        : ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15', '2026-11-23'];
      tickDates.forEach(lblD => {
        const idx = days.findIndex(d => d.d === lblD);
        if (idx >= 0) {
          const anc = idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle';
          s += text(X(idx), mid + downH + 15, fmtDate(lblD, false), 'small', anc);
        }
      });
      s += line(X(selD), top, X(selD), mid + downH, 'cursor');

      // Scrubbable 200-second micro-timeline (23:48:00 -> 23:51:20 EDT)
      const bX = sec => x0 + (clamp(sec, 0, 200) / 200) * pw;
      const trackY = stripY + 21;
      s += rect(x0, stripY, pw, stripH, 'panel-box', 'rx="4"');
      s += text(x0 + 8, stripY + 13, w < 480 ? 'Oct 23 · 23:48:00 → 23:51:18 (+149s)' : 'Zoom · Oct 23 final 39-second burst (23:48:10–49) → Google One restored 149s later', 'small ink');
      s += line(x0 + 8, trackY + 6, x0 + pw - 8, trackY + 6, 'axis');
      const x49 = bX(49), x198 = bX(198);
      s += rect(x49, trackY + 3, Math.max(0, Math.min(bX(burstSec), x198) - x49), 6, 'brush-band', 'rx="2"');
      burst.forEach(b => {
        const bx = bX(b.sec), lit = burstSec >= b.sec;
        if (playing && lit && burstSec - b.sec < 18) s += circle(bx, trackY + 6, 8.5, 'ring-arc');
        s += circle(bx, trackY + 6, lit ? 3.7 : 2.4, lit ? 'dot amber' : 'dot');
      });
      const wallLit = burstSec >= 198;
      s += line(x198, stripY + 16, x198, stripY + stripH - 4, wallLit ? 'step blue' : 'bench');
      if (w >= 460) s += text(x198 - 6, stripY + stripH - 5, '23:51:18 restored', wallLit ? 'blue small' : 'small', 'end');
      if (w >= 460) s += text(bX(28), stripY + stripH - 5, '6 ads in 39s', 'amber small', 'middle');
      if (playing) s += line(bX(burstSec), stripY + 15, bX(burstSec), stripY + stripH - 3, 'cursor');

      s += rect(x0, top, pw, mid + downH - top, 'hit');
      geo = { x0, stepW, n, top, bot: mid + downH, stripY, stripH, pw };
      ui.view.innerHTML = svg(w, H, 'Daily organic YouTube plays versus Google Ads with 18-month sparkline and October 23 burst replay', s);

      if (playing) {
        const activeAd = [...burst].reverse().find(b => burstSec >= b.sec);
        const status = burstSec >= 198
          ? '<span class="blue">23:51:18 EDT — Google One restored. Zero ads for the next 31 days.</span>'
          : activeAd
            ? `<span class="amber">${activeAd.time} EDT</span> — Ad fired: <strong>${esc(activeAd.title)}</strong>`
            : '23:48:00 EDT — inside 3h 41m Google One lapse…';
        ui.out.innerHTML = `<span>${status}</span><span>4.3/day → <span class="blue">33.6/day</span> (7.7×)</span>`;
      } else {
        const d = days[selD];
        const extra = d.d === '2026-10-23' ? ' · <span class="amber">7 leaked ads; stopped 149s before restoration</span>'
          : d.d === '2026-10-19' ? ' · <span class="teal">First day of YouTube Music (30 tracks)</span>'
          : d.d === '2026-10-11' ? ' · <span class="amber">Single-day ad record (9.6× video)</span>' : '';
        ui.out.innerHTML = `<span><strong>${fmtDate(d.d)}</strong>: <span class="blue">${d.yt}</span> YT, <span class="teal">${d.ytm}</span> Music, <span class="amber">${d.ads}</span> ads${extra}</span><span>3,906 ads · 0.18% CTR</span>`;
      }
    }

    hover(ui.view, (x, y) => {
      if (!geo) return;
      if (y >= geo.stripY && y <= geo.stripY + geo.stripH) {
        stopPlay(); burstSec = clamp(((x - geo.x0) / geo.pw) * 200, 0, 200); draw();
      } else if (y >= geo.top && y <= geo.bot && !playing) {
        const i = clamp(Math.floor((x - geo.x0) / geo.stepW), 0, geo.n - 1);
        if (i !== selD) { selD = i; draw(); }
      }
    });
    keys(ui.view, d => { stopPlay(); selD = clamp(selD + d, 0, days.length - 1); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      stopPlay();
      if (ds.day) { const i = days.findIndex(d => d.d === ds.day); if (i >= 0) selD = i; }
      draw();
      if (ds.replay === '1') startReplay();
    };
  }

  // ----------------------------------- Figure 2: Discovery Cloud & Live 33⅓ RPM Spinning Vinyl
  function figCulture(fig, D) {
    const chs = D.topChannels.slice(0, 16), songs = D.topYtmSongs.slice(0, 8);
    let selOrb = 0, selSong = 0, vinylSpin = false, vinylAngle = 0, vinylRaf = 0, lastTs = 0, geo = null;

    const ui = shell(fig, [
      ['amber', 'My own channel (#1 · 179)'],
      ['blue', 'Chinese / Mandopop'],
      ['teal', 'YouTube Music grooves'],
      ['ink', '787 one-off channels'],
    ], `<button type="button" class="accent" data-spin aria-pressed="false">▶ Spin vinyl (33⅓ RPM)</button>`);

    const spinBtn = $('[data-spin]', ui.actions);
    function stopVinyl() {
      vinylSpin = false;
      if (vinylRaf) { cancelAnimationFrame(vinylRaf); vinylRaf = 0; }
      spinBtn.setAttribute('aria-pressed', 'false');
      spinBtn.textContent = '▶ Spin vinyl (33⅓ RPM)';
    }
    function tickVinyl(ts) {
      if (!vinylSpin) { vinylRaf = 0; return; }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      vinylAngle = (vinylAngle + dt * 66) % 360;
      const g = $('.vinyl-platter', ui.view);
      if (g && geo) g.setAttribute('transform', `rotate(${f(vinylAngle)} ${f(geo.rightCX)} ${f(geo.rightCY)})`);
      vinylRaf = requestAnimationFrame(tickVinyl);
    }
    function startVinyl() {
      vinylSpin = true; lastTs = 0;
      spinBtn.setAttribute('aria-pressed', 'true');
      spinBtn.textContent = '❚❚ Stop turntable';
      if (!vinylRaf) vinylRaf = requestAnimationFrame(tickVinyl);
    }
    spinBtn.addEventListener('click', () => { if (vinylSpin) stopVinyl(); else startVinyl(); });

    function draw() {
      const w = width(ui.view), wide = w >= 560;
      const H = wide ? 268 : 420;
      const leftCX = wide ? w * 0.27 : w / 2, leftCY = wide ? 142 : 124;
      const rightCX = wide ? w * 0.72 : w / 2 - 6, rightCY = wide ? 142 : 316;
      let s = '';

      // Left: 1,076-channel Discovery Cloud + 787 one-off stipple dust
      const maxR = wide ? 27 : 22, maxC = chs[0].n;
      const nodes = chs.map((c, i) => ({ ...c, idx: i, r: clamp(Math.sqrt(c.n / maxC) * maxR, 7, maxR) }));
      const packed = packCircles(nodes, leftCX, leftCY, 2.2, 1.05);
      const maxW = wide ? w * 0.45 : w - 40, maxH = wide ? 194 : 168;
      const sc = Math.min(1, maxW / Math.max(1, packed.w + 36), maxH / Math.max(1, packed.h + 36));

      s += text(leftCX, 14, 'YouTube Video · 91.8% one-off discovery', 'strong small', 'middle');
      const haloR = (Math.max(packed.w, packed.h) * sc) / 2 + 12;
      for (let d = 0; d < 88; d++) {
        const ang = (d / 88) * Math.PI * 2 + (d % 3) * 0.04, rr = haloR + (d % 5) * 3.8;
        const dx = leftCX + Math.cos(ang) * rr, dy = leftCY + Math.sin(ang) * rr;
        if (dx > 8 && dx < (wide ? w * 0.49 : w - 8) && dy > 24 && dy < (wide ? H - 22 : 216)) {
          s += `<circle cx="${f(dx)}" cy="${f(dy)}" r="1.35" style="fill:var(--fg-3);opacity:0.4"/>`;
        }
      }
      const orbHits = [];
      packed.nodes.forEach(p => {
        const x = leftCX + (p.x - leftCX) * sc, y = leftCY + (p.y - leftCY) * sc, r = p.r * sc;
        const isSel = p.idx === selOrb;
        const col = p.topic === 'self' ? 'var(--g-amber)' : (p.topic === 'mandopop' || p.topic === 'variety') ? 'var(--g-blue)' : 'var(--g-fill-strong)';
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" class="bubble" style="fill:${col};fill-opacity:${isSel ? 0.88 : 0.68};stroke:${isSel ? 'var(--fg)' : 'var(--bg)'};stroke-width:${isSel ? 1.8 : 1}"/>`;
        if (r >= 14) s += text(x, y + 3.5, String(p.n), 'small halo strong', 'middle');
        orbHits.push({ idx: p.idx, x, y, r });
      });
      s += text(leftCX, wide ? H - 8 : 226, '787 of 1,076 channels watched once (outer dust)', 'small', 'middle');

      // Right: Minimalist spinning vinyl turntable + articulated hairline tonearm
      const maxPlay = songs[0].n, vTopY = wide ? 14 : 244;
      s += text(rightCX, vTopY, 'YouTube Music · 39.5% repeat plays', 'strong small', 'middle');
      const rOut = wide ? 88 : 72, rStep = wide ? 9.1 : 7.4;
      s += circle(rightCX, rightCY, rOut + 5, 'panel-box');
      let platter = '';
      const grooveHits = [];
      songs.forEach((sg, i) => {
        const rr = rOut - i * rStep;
        const frac = clamp((sg.n / maxPlay) * 0.86, 0.14, 0.86);
        const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2;
        const x0 = rightCX + Math.cos(a0) * rr, y0 = rightCY + Math.sin(a0) * rr;
        const x1 = rightCX + Math.cos(a1) * rr, y1 = rightCY + Math.sin(a1) * rr;
        const large = frac > 0.5 ? 1 : 0, isSel = i === selSong;
        platter += circle(rightCX, rightCY, rr, 'ring');
        const col = isSel ? 'var(--g-amber)' : i < 3 ? 'var(--g-teal)' : 'var(--g-blue)';
        platter += `<path d="M${f(x0)},${f(y0)} A${f(rr)},${f(rr)} 0 ${large} 1 ${f(x1)},${f(y1)}" class="groove" style="stroke:${col};stroke-width:${isSel ? 5.2 : 3.8};opacity:${isSel ? 1 : 0.78}"/>`;
        grooveHits.push({ idx: i, rr });
      });
      platter += circle(rightCX, rightCY, 14, 'panel-box');
      platter += circle(rightCX, rightCY - 8, 2.2, 'dot amber');
      platter += circle(rightCX, rightCY, 2.3, 'dot ink');
      s += `<g class="vinyl-platter" transform="rotate(${f(vinylAngle)} ${f(rightCX)} ${f(rightCY)})">${platter}</g>`;

      // Articulated tonearm dropping precisely onto selected song groove
      const selR = rOut - selSong * rStep;
      const pivX = Math.min(w - 14, rightCX + rOut + 18), pivY = rightCY - rOut + 12;
      const tipX = rightCX + Math.cos(0.42) * selR, tipY = rightCY + Math.sin(0.42) * selR;
      const elbowX = pivX - 4, elbowY = (pivY + tipY) * 0.54;
      s += circle(pivX, pivY, 6.5, 'panel-box') + circle(pivX, pivY, 2.4, 'dot ink');
      s += `<path d="M${f(pivX)},${f(pivY)} L${f(elbowX)},${f(elbowY)} L${f(tipX)},${f(tipY)}" fill="none" stroke="var(--fg-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"/>`;
      s += circle(tipX, tipY, 3.2, 'dot amber');

      s += text(rightCX, wide ? H - 8 : H - 6, w < 380 ? 'Top grooves: Good Day (17×), Out of Time (14×)' : 'Outer groove: It Was A Good Day (17×) → Out of Time (14×)', 'small', 'middle');

      geo = { wide, splitX: wide ? w * 0.50 : 0, splitY: wide ? 0 : 235, orbHits, rightCX, rightCY, grooveHits };
      ui.view.innerHTML = svg(w, H, 'Channel discovery cloud of 1,076 YouTube channels beside an interactive spinning vinyl turntable for YouTube Music', s);

      const ch = chs[selOrb] || chs[0], sg = songs[selSong] || songs[0];
      ui.out.innerHTML = `<span>Channel: <strong>${esc(ch.name)}</strong> (<span class="blue">${ch.n}</span> views)</span><span>Groove #${selSong + 1}: <strong>${esc(sg.song)}</strong> — ${esc(sg.artist)} (<span class="teal">${sg.n}×</span>)</span>`;
    }

    hover(ui.view, (x, y) => {
      if (!geo) return;
      const isRight = geo.wide ? x >= geo.splitX : y >= geo.splitY;
      if (!isRight) {
        let best = selOrb, bd = 1e9;
        geo.orbHits.forEach(h => { const d = Math.hypot(x - h.x, y - h.y); if (d <= h.r + 6 && d < bd) { bd = d; best = h.idx; } });
        if (best !== selOrb) { selOrb = best; draw(); }
      } else {
        const dist = Math.hypot(x - geo.rightCX, y - geo.rightCY);
        let best = selSong, bd = 1e9;
        geo.grooveHits.forEach(g => { const d = Math.abs(dist - g.rr); if (d < 8 && d < bd) { bd = d; best = g.idx; } });
        if (best !== selSong) { selSong = best; draw(); }
      }
    });
    keys(ui.view, d => { selSong = (selSong + d + songs.length) % songs.length; draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.ch !== undefined) selOrb = clamp(Number(ds.ch), 0, chs.length - 1);
      if (ds.song !== undefined) selSong = clamp(Number(ds.song), 0, songs.length - 1);
      draw();
      if (ds.spin === '1') startVinyl();
    };
  }

  // ----------------------------------- Figure 3: Minimalist 3D Circadian Glass Helix (Warm Paper!)
  function figRhythm(fig, D) {
    const R = D.rhythm, sf = R.starfield, dtot = R.dayTotals, baseMs = ms(R.baseDate), spanDays = R.spanDays;
    let rawEst = false, rawBlend = 0, sweeping = false, soundOn = false, activeDay = spanDays - 1, prevDay = spanDays - 1;

    const ui = shell(fig, [
      ['blue', 'YouTube video (2,727)'],
      ['teal', 'YouTube Music (626)'],
      ['amber', 'Google Ads (3,906)'],
    ], `<button type="button" data-raw aria-pressed="false">Show EST −1h bug</button><button type="button" class="accent" data-sweep aria-pressed="false">▶ Sweep 18m</button><button type="button" data-snd aria-pressed="false">♪ Sound</button><button type="button" data-rst>↺ Reset</button>`);

    const rawBtn = $('[data-raw]', ui.actions), swpBtn = $('[data-sweep]', ui.actions);
    const sndBtn = $('[data-snd]', ui.actions), rstBtn = $('[data-rst]', ui.actions);

    // Precompute all 7,259 3D points (both DST-corrected and unfixed raw EST for live morphing!)
    const pts = [];
    for (let i = 0; i < sf.yt.length; i += 2) {
      const idx = i / 2, j = (hRand(idx * 3 + 1) - 0.5) * 0.14;
      const day = sf.yt[i], mTrue = sf.yt[i + 1], mRaw = sf.ytRaw[i + 1];
      const y = (day / (spanDays - 1) - 0.5) * 1.72, r = 0.65 + j;
      const aT = (mTrue / 1440) * Math.PI * 2, aR = (mRaw / 1440) * Math.PI * 2;
      pts.push({ day, type: 0, y, r, aT, aR });
    }
    for (let i = 0; i < sf.ytm.length; i += 2) {
      const idx = 4000 + i / 2, j = (hRand(idx * 3 + 1) - 0.5) * 0.10;
      const day = sf.ytm[i], mTrue = sf.ytm[i + 1];
      const y = (day / (spanDays - 1) - 0.5) * 1.72, r = 0.34 + j, a = (mTrue / 1440) * Math.PI * 2;
      pts.push({ day, type: 1, y, r, aT: a, aR: a });
    }
    for (let i = 0; i < sf.ads.length; i += 2) {
      const idx = 6000 + i / 2, j = (hRand(idx * 3 + 1) - 0.5) * 0.13;
      const day = sf.ads[i], mTrue = sf.ads[i + 1];
      const y = (day / (spanDays - 1) - 0.5) * 1.72, r = 0.96 + j, a = (mTrue / 1440) * Math.PI * 2;
      pts.push({ day, type: 2, y, r, aT: a, aR: a });
    }

    const rings = [
      { day: 0, lbl: '', r: 1.02, side: -1, tone: 'muted' },
      { day: Math.round((ms('2026-01-01') - baseMs) / 864e5), lbl: 'Jan ’26', r: 1.02, side: 1, tone: 'muted' },
      { day: Math.round((ms('2026-03-03') - baseMs) / 864e5), lbl: 'Mar 3 · “Good” (0.10×)', r: 1.03, side: 1, tone: 'ink' },
      { day: Math.round((ms('2026-10-19') - baseMs) / 864e5), lbl: 'Oct 19 · Music starts', r: 1.04, side: -1, tone: 'teal' },
      { day: Math.round((ms('2026-10-23') - baseMs) / 864e5), lbl: 'Oct 23 · Ad guillotine', r: 1.07, side: 1, tone: 'amber' },
    ];

    const orbit = createOrbitStage(fig, ui.view, {
      label: 'Draggable 3D circadian helix of all 7,259 YouTube videos, Music tracks, and Google Ads across 531 days',
      yaw: 0.58, pitch: 0.34, zoom: 0.86, scaleFactor: 0.38, cyFrac: 0.48, drift: 0.10,
      keepAlive: () => sweeping,
      tick(dt) {
        const targetB = rawEst ? 1 : 0;
        rawBlend += (targetB - rawBlend) * Math.min(1, dt * 8);
        if (sweeping) {
          prevDay = activeDay;
          activeDay += dt * 28;
          if (activeDay >= spanDays - 1) {
            activeDay = spanDays - 1; sweeping = false;
            swpBtn.setAttribute('aria-pressed', 'false'); swpBtn.textContent = '▶ Sweep 18m';
          }
          const dCur = Math.floor(activeDay);
          if (dCur !== Math.floor(prevDay)) {
            updateReadout();
            if (soundOn) {
              const iso = new Date(baseMs + dCur * 864e5).toISOString().slice(0, 10);
              const rec = dtot[iso] || [0, 0, 0, 0];
              if (rec[1] > 0) Sound.chime((dCur * 3) % 24, true);
              else if (rec[0] > 0) Sound.chime((dCur * 5) % 24, false);
              if (rec[2] > 0) {
                const ticks = Math.min(3, Math.ceil(rec[2] / 14));
                for (let k = 0; k < ticks; k++) setTimeout(() => Sound.tick(), k * 46);
              }
            }
          }
        }
      },
      draw(ctx, st, C) {
        // Subtle 4–5 am sleep corridor wedge on the base plane
        ctx.beginPath();
        const bY = -0.86;
        const [ox, oy] = st.proj(0, bY, 0);
        ctx.moveTo(ox, oy);
        for (let k = 0; k <= 12; k++) {
          const a = ((3.5 + (k / 12) * 2.5) / 24) * Math.PI * 2;
          const [sx, sy] = st.proj(Math.cos(a) * 1.02, bY, Math.sin(a) * 1.02);
          ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle = C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(24,24,23,0.04)';
        ctx.fill();

        // Architectural hairline meridians (12 am, 6 am, noon, 6 pm)
        [[0, '12 am'], [6, '6 am'], [12, 'noon'], [18, '6 pm']].forEach(([hr, lbl]) => {
          const a = (hr / 24) * Math.PI * 2;
          const [x0, y0] = st.proj(Math.cos(a) * 1.02, -0.86, Math.sin(a) * 1.02);
          const [x1, y1] = st.proj(Math.cos(a) * 1.02, 0.86, Math.sin(a) * 1.02);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
          ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke();
          const [tx, ty] = st.proj(Math.cos(a) * 1.14, -0.90, Math.sin(a) * 1.14);
          label3d(ctx, lbl, tx, ty, hr === 0 ? C.fg : C.fg3, C.bg, 'center', '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace');
        });

        // Architectural horizon rings
        rings.forEach(rg => {
          const y = (rg.day / (spanDays - 1) - 0.5) * 1.72;
          ctx.beginPath();
          for (let k = 0; k <= 64; k++) {
            const a = (k / 64) * Math.PI * 2;
            const [sx, sy] = st.proj(Math.cos(a) * rg.r, y, Math.sin(a) * rg.r);
            if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = rg.tone === 'amber' ? C.amber : rg.tone === 'teal' ? C.teal : rg.tone === 'ink' ? C.line2 : C.line;
          ctx.lineWidth = rg.tone === 'amber' ? 1.5 : rg.tone === 'teal' ? 1.1 : 0.75;
          ctx.stroke();
          if (rg.lbl && (st.cw >= 460 || rg.tone === 'amber' || rg.tone === 'teal')) {
            const [lx, ly] = st.proj(rg.side * (rg.r + 0.06), y, 0);
            const col = rg.tone === 'amber' ? C.amber : rg.tone === 'teal' ? C.teal : rg.tone === 'ink' ? C.fg2 : C.fg3;
            label3d(ctx, rg.lbl, lx + rg.side * 4, ly + 3, col, C.bg, rg.side > 0 ? 'left' : 'right',
              (rg.tone === 'amber' || rg.tone === 'teal' ? '600 ' : '500 ') + '9.5px ui-monospace, SFMono-Regular, Menlo, monospace');
          }
        });

        // Draw all 7,259 real points with clean depth-graded paper contrast
        const cols = [C.blue, C.teal, C.amber];
        const filtered = sweeping || activeDay < spanDays - 1;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const a = p.aT + (p.aR - p.aT) * rawBlend;
          const [sx, sy, z2, persp] = st.proj(Math.cos(a) * p.r, p.y, Math.sin(a) * p.r);
          const depthA = clamp(0.18 + ((z2 + 1.1) / 2.2) * 0.68, 0.14, 0.88);
          let alpha = p.type === 2 ? depthA * 0.62 : p.type === 1 ? depthA * 0.96 : depthA * 0.78;
          let rad = (p.type === 1 ? 2.15 : p.type === 0 ? 1.75 : 1.45) * persp;
          if (filtered) {
            if (p.day > activeDay) alpha *= 0.09;
            else if (activeDay - p.day < 7) { alpha = 1; rad *= 1.55; }
          }
          ctx.globalAlpha = alpha;
          ctx.fillStyle = cols[p.type];
          ctx.beginPath(); ctx.arc(sx, sy, rad, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Active sweep hairline laser ring
        if (filtered) {
          const syW = (activeDay / (spanDays - 1) - 0.5) * 1.72;
          ctx.beginPath();
          for (let k = 0; k <= 64; k++) {
            const a = (k / 64) * Math.PI * 2;
            const [sx, sy] = st.proj(Math.cos(a) * 1.09, syW, Math.sin(a) * 1.09);
            if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
        }
      },
      onReset() {
        sweeping = false; activeDay = spanDays - 1;
        swpBtn.setAttribute('aria-pressed', 'false'); swpBtn.textContent = '▶ Sweep 18m';
        updateReadout();
      },
    });

    // Slim minimalist timeline scrubber right below the 3D helix
    const scRow = document.createElement('div');
    scRow.className = 'goog-scrub-row';
    scRow.innerHTML = `<span>Jun ’25</span><input type="range" min="0" max="${spanDays - 1}" value="${spanDays - 1}" aria-label="Helix date scrubber"><span data-hdate>Nov 23, 2026</span>`;
    ui.view.appendChild(scRow);
    const scInp = $('input', scRow), scDate = $('[data-hdate]', scRow);

    function updateReadout() {
      const d = clamp(Math.round(activeDay), 0, spanDays - 1);
      const iso = new Date(baseMs + d * 864e5).toISOString().slice(0, 10);
      scInp.value = String(d);
      scDate.textContent = fmtDate(iso);
      const rec = dtot[iso] || [0, 0, 0, 0];
      ui.out.innerHTML = `<span><strong>${fmtDate(iso)}</strong>: <span class="blue">${rec[0]}</span> YouTube, <span class="teal">${rec[1]}</span> Music, <span class="amber">${rec[2]}</span> ads, <strong>${rec[3]}</strong> searches</span><span>${rawEst ? '<span class="amber">Unfixed Takeout EST (−1h summer shift)</span>' : 'True Eastern time · 0 plays at 4–5 am'}</span>`;
    }

    rawBtn.addEventListener('click', () => {
      rawEst = !rawEst;
      rawBtn.setAttribute('aria-pressed', String(rawEst));
      rawBtn.textContent = rawEst ? 'EST −1h bug: ON' : 'Show EST −1h bug';
      updateReadout(); orbit.wake();
    });
    swpBtn.addEventListener('click', () => {
      sweeping = !sweeping;
      if (sweeping && activeDay >= spanDays - 2) activeDay = 0;
      swpBtn.setAttribute('aria-pressed', String(sweeping));
      swpBtn.textContent = sweeping ? '❚❚ Pause' : '▶ Sweep 18m';
      updateReadout(); orbit.wake();
    });
    sndBtn.addEventListener('click', () => {
      if (!soundOn && Sound.init()) {
        soundOn = true;
        if (!sweeping) { if (activeDay >= spanDays - 2) activeDay = 0; sweeping = true; swpBtn.setAttribute('aria-pressed', 'true'); swpBtn.textContent = '❚❚ Pause'; }
      } else soundOn = false;
      sndBtn.setAttribute('aria-pressed', String(soundOn));
      sndBtn.textContent = soundOn ? '♪ Sound ON' : '♪ Sound';
      orbit.wake();
    });
    rstBtn.addEventListener('click', () => {
      rawEst = false; rawBtn.setAttribute('aria-pressed', 'false'); rawBtn.textContent = 'Show EST −1h bug';
      sweeping = false; activeDay = spanDays - 1;
      swpBtn.setAttribute('aria-pressed', 'false'); swpBtn.textContent = '▶ Sweep 18m';
      orbit.reset(); updateReadout();
    });
    scInp.addEventListener('input', () => {
      sweeping = false; swpBtn.setAttribute('aria-pressed', 'false'); swpBtn.textContent = '▶ Sweep 18m';
      activeDay = Number(scInp.value);
      updateReadout(); orbit.wake();
    });
    updateReadout();

    fig._setAct = ds => {
      if (ds.raw === '1' || ds.raw === '0') {
        rawEst = ds.raw === '1';
        rawBtn.setAttribute('aria-pressed', String(rawEst));
        rawBtn.textContent = rawEst ? 'EST −1h bug: ON' : 'Show EST −1h bug';
      }
      if (ds.sweep === '1') {
        activeDay = 0; sweeping = true;
        swpBtn.setAttribute('aria-pressed', 'true'); swpBtn.textContent = '❚❚ Pause';
      }
      if (ds.day) {
        sweeping = false; activeDay = clamp(Math.round((ms(ds.day) - baseMs) / 864e5), 0, spanDays - 1);
      }
      updateReadout(); orbit.wake();
    };
  }

  // ----------------------------------- Figure 4: Kinetic Rabbit-Hole Arc Replay
  function figSessions(fig, D) {
    const xrays = D.sessions.xrays;
    const shortNames = ['Midnight 39v', 'NBA 42v', 'Shorts 48v', 'Uploads 30v', '130m binge', 'Mandopop 34t'];
    let selXray = 0, selItem = 0, playing = false, timer = 0, geo = null;

    const ui = shell(fig, [
      ['blue', 'Same-topic loop'],
      ['amber', 'Topic jump & search'],
      ['teal', 'YouTube Music'],
    ], `<button type="button" class="accent" data-play aria-pressed="false">▶ Replay session</button>`);

    const playBtn = $('[data-play]', ui.actions);
    ui.subpills.hidden = false;
    ui.subpills.innerHTML = shortNames.map((l, i) => `<button type="button" data-xr="${i}" aria-pressed="${i === 0}">${l}</button>`).join('');

    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = 0; }
      playBtn.setAttribute('aria-pressed', 'false');
      playBtn.textContent = '▶ Replay session';
    }
    function startPlay() {
      stopPlay(); playing = true;
      if (selItem >= xrays[selXray].items.length - 1) selItem = 0;
      playBtn.setAttribute('aria-pressed', 'true');
      playBtn.textContent = '❚❚ Pause';
      draw();
      timer = setInterval(() => {
        selItem++;
        if (selItem >= xrays[selXray].items.length) { selItem = xrays[selXray].items.length - 1; stopPlay(); }
        draw();
      }, 210);
    }

    playBtn.addEventListener('click', () => { if (playing) { stopPlay(); draw(); } else startPlay(); });
    all('[data-xr]', ui.subpills).forEach(b => b.addEventListener('click', () => {
      stopPlay(); selXray = Number(b.dataset.xr); selItem = 0;
      all('[data-xr]', ui.subpills).forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.xr) === selXray)));
      draw();
    }));

    function draw() {
      const xr = xrays[selXray], w = width(ui.view), x0 = 20, pw = w - x0 - 16;
      const top = 44, trackY = 146, H = 190, maxT = Math.max(xr.durMin, 1);
      const X = t => x0 + (clamp(t, 0, maxT) / maxT) * pw;
      let s = '';

      s += text(x0, 15, trunc(`${xr.label} (${fmtDate(xr.date)}, ${xr.start})`, w < 440 ? 38 : 58), 'strong');
      if (w >= 540) s += text(x0 + pw, 15, xr.sub, 'small', 'end');

      for (let i = 1; i < xr.items.length; i++) {
        const a = xr.items[i - 1], b = xr.items[i];
        const x1 = X(a.t), x2 = X(b.t), span = Math.max(4, x2 - x1);
        const arcH = clamp(12 + span * 0.36, 12, 68);
        const same = a.ch === b.ch || a.topic === b.topic, active = i === selItem, lit = i <= selItem;
        const col = same ? 'var(--g-blue)' : 'var(--g-amber)';
        s += `<path d="M${f(x1)},${f(trackY)} Q${f((x1 + x2) / 2)},${f(trackY - arcH)} ${f(x2)},${f(trackY)}" class="arc-hop" style="stroke:${col};stroke-width:${active ? 2.4 : lit ? 1.5 : 0.85};stroke-opacity:${active ? 0.98 : lit ? 0.62 : 0.22}"/>`;
      }

      s += line(x0, trackY, x0 + pw, trackY, 'axis');
      [0, 0.25, 0.5, 0.75, 1].forEach((fT, idx) => {
        const tx = x0 + fT * pw, tVal = Math.round(fT * maxT);
        s += line(tx, trackY - 3.5, tx, trackY + 3.5, 'axis');
        s += text(tx, trackY + 19, tVal === 0 ? '0m' : `+${tVal}m`, 'small', idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle');
      });

      const rowEnd = [-999, -999], rowYs = [top + 24, top + 2];
      xr.queries.forEach(q => {
        const qx = X(Math.max(0, q.t));
        const qTxt = '“' + trunc(q.q, 12) + '”', estW = qTxt.length * 6.0 + 8;
        const anchor = qx > x0 + pw - 72 ? 'end' : qx < x0 + 54 ? 'start' : 'middle';
        const xLeft = anchor === 'start' ? qx : anchor === 'end' ? qx - estW : qx - estW / 2;
        let row = -1;
        for (let r = 0; r < 2; r++) { if (xLeft >= rowEnd[r] + 6) { row = r; break; } }
        const qy = row >= 0 ? rowYs[row] : rowYs[0];
        s += line(qx, qy + 4, qx, trackY - 6, 'bench') + circle(qx, qy + 4, 2.8, 'dot amber');
        if (row >= 0 && (w >= 360 || xr.queries.length <= 2)) {
          s += text(qx, qy - 3, qTxt, 'amber small halo', anchor);
          rowEnd[row] = xLeft + estW;
        }
      });

      const hits = [];
      xr.items.forEach((it, i) => {
        const ix = X(it.t), iy = trackY + ((i % 3) - 1) * 5, isSel = i === selItem;
        if (isSel) s += circle(ix, iy, 8.5, 'ring-arc');
        s += circle(ix, iy, isSel ? 4.5 : 2.9, isSel ? 'dot amber' : it.ytm ? 'dot teal' : 'dot blue');
        hits.push({ i, ix, iy });
      });

      geo = { hits };
      ui.view.innerHTML = svg(w, H, `Arc replay diagram of ${xr.label}`, s);
      const it = xr.items[selItem] || xr.items[0];
      ui.out.innerHTML = `<span><strong>+${num(it.t, 1)}m</strong> (#${selItem + 1}/${xr.n}): <span class="${it.ytm ? 'teal' : 'blue'}">${esc(it.ch)}</span> — ${esc(it.title)}</span><span>${xr.queries.length} searches · ${num(xr.durMin, 0)}m</span>`;
    }

    hover(ui.view, (x, y) => {
      if (!geo) return;
      stopPlay();
      let best = selItem, bd = 1e9;
      geo.hits.forEach(h => { const d = Math.hypot(x - h.ix, y - h.iy); if (d < 24 && d < bd) { bd = d; best = h.i; } });
      if (best !== selItem) { selItem = best; draw(); }
    });
    keys(ui.view, d => { stopPlay(); selItem = clamp(selItem + d, 0, xrays[selXray].items.length - 1); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      stopPlay();
      if (ds.xray !== undefined) {
        selXray = clamp(Number(ds.xray), 0, xrays.length - 1); selItem = 0;
        all('[data-xr]', ui.subpills).forEach(x => x.setAttribute('aria-pressed', String(Number(x.dataset.xr) === selXray)));
      }
      draw();
      if (ds.play === '1') startPlay();
    };
  }

  // ----------------------------------- Figure 5: Minimalist 3D Rotating Earth Travel Globe (Warm Paper!)
  function figGeo(fig, D) {
    const hubs = D.geo.hubs, t0Ms = ms('2026-02-27'), t1Ms = ms('2026-11-23');
    const homeHub = hubs.find(h => h.home) || hubs[0];
    let selHub = hubs.findIndex(h => h.name.includes('Black Hills'));
    if (selHub < 0) selHub = 1;
    let replayFrac = 1, playing = false;

    const WORLD_LAND = [
      [[-166,60],[-156,71],[-136,69],[-110,68],[-94,63],[-92,58],[-78,52],[-78,62],[-64,60],[-56,52],[-64,45],[-70,42],[-74,40],[-76,35],[-81,25],[-83,29],[-90,29],[-97,26],[-97,19],[-87,21],[-83,10],[-78,8],[-85,11],[-92,15],[-105,20],[-110,23],[-117,32],[-122,37],[-124,42],[-124,48],[-132,54],[-145,60],[-162,55],[-166,60]],
      [[-44,60],[-22,70],[-18,81],[-52,82],[-68,76],[-54,68],[-44,60]],
      [[-78,9],[-62,10],[-50,0],[-35,-6],[-38,-14],[-41,-22],[-53,-34],[-65,-42],[-68,-55],[-75,-52],[-72,-35],[-71,-18],[-81,-5],[-78,9]],
      [[-9,37],[-9,43],[-2,43],[-4,48],[2,51],[9,54],[11,58],[5,61],[15,69],[28,71],[40,66],[30,60],[21,55],[28,46],[26,41],[23,37],[16,38],[12,42],[9,44],[3,43],[-5,36],[-9,37]],
      [[-17,15],[-6,36],[10,37],[25,32],[32,31],[43,12],[51,12],[41,-2],[35,-24],[20,-35],[15,-26],[12,-6],[9,4],[-8,5],[-17,15]],
      [[26,41],[40,42],[40,66],[68,72],[104,77],[140,73],[178,66],[162,60],[156,51],[140,54],[135,44],[128,35],[122,38],[122,31],[120,23],[114,22],[108,21],[109,12],[103,1],[98,16],[88,22],[80,8],[72,20],[66,25],[56,26],[59,22],[44,13],[35,29],[36,37],[26,41]],
      [[130,31],[136,34],[141,38],[145,44],[140,42],[136,37],[130,33],[130,31]],
      [[114,-22],[130,-12],[142,-11],[153,-28],[148,-38],[136,-35],[115,-34],[114,-22]],
    ];
    const ll2xyz = (lat, lon, R = 1.06) => {
      const ph = (lat * Math.PI) / 180, la = (lon * Math.PI) / 180, cp = Math.cos(ph);
      return [R * cp * Math.sin(la), R * Math.sin(ph), R * cp * Math.cos(la)];
    };

    const awayArcs = hubs.map((h, idx) => {
      if (h.home) return null;
      const a = ll2xyz(homeHub.lat, homeHub.lon, 1), b = ll2xyz(h.lat, h.lon, 1);
      const omega = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -0.999, 0.999));
      const sinO = Math.max(1e-4, Math.sin(omega)), steps = 28;
      const lift = clamp(0.07 + (omega / Math.PI) * 0.24, 0.08, 0.27);
      const curve = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, wa = Math.sin((1 - t) * omega) / sinO, wb = Math.sin(t * omega) / sinO;
        const R = 1.06 + Math.sin(t * Math.PI) * lift;
        curve.push([(a[0] * wa + b[0] * wb) * R, (a[1] * wa + b[1] * wb) * R, (a[2] * wa + b[2] * wb) * R]);
      }
      return { idx, hub: h, curve, phase: (idx * 0.19) % 1 };
    }).filter(Boolean);

    const ui = shell(fig, [
      ['amber', 'Home (Boston) & CN remote'],
      ['blue', 'Away hub (≥50% silent)'],
      ['hollow', 'Mostly interactive'],
    ], `<button type="button" class="accent" data-play aria-pressed="false">▶ Replay 270 days</button><button type="button" data-rst>↺ Reset</button>`);

    const playBtn = $('[data-play]', ui.actions), rstBtn = $('[data-rst]', ui.actions);
    const keyLabels = new Set(['Greater Boston, MA', 'Los Angeles, CA', 'SF Bay Area, CA', 'Black Hills, SD/WY/NE', 'Honolulu, HI', 'Dallas–Fort Worth, TX', 'Guangdong, CN (Linux remote)']);

    const orbit = createOrbitStage(fig, ui.view, {
      label: 'Draggable 3D minimalist Earth travel globe reconstructed from 2,058 Google Account IP logins',
      yaw: -1.68, pitch: 0.50, zoom: 0.94, scaleFactor: 0.37, cyFrac: 0.54, drift: 0.055,
      keepAlive: () => playing,
      tick(dt) {
        if (playing) {
          replayFrac = Math.min(1, replayFrac + dt * 0.14);
          updateReadout();
          if (replayFrac >= 1) {
            playing = false;
            playBtn.setAttribute('aria-pressed', 'false');
            playBtn.textContent = '▶ Replay 270 days';
          }
        }
      },
      draw(ctx, st, C) {
        const curMs = t0Ms + replayFrac * (t1Ms - t0Ms);
        const [cx, cy, , pC, sc] = st.proj(0, 0, 0);
        const rPx = sc * 1.06 * pC;

        // Clean architectural paper-and-stone sphere
        const sph = ctx.createRadialGradient(cx - rPx * 0.28, cy - rPx * 0.30, rPx * 0.06, cx, cy, rPx);
        sph.addColorStop(0, C.bg);
        sph.addColorStop(0.75, C.subtle);
        sph.addColorStop(1, C.line);
        ctx.fillStyle = sph;
        ctx.beginPath(); ctx.arc(cx, cy, rPx, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.line2; ctx.lineWidth = 1.1; ctx.stroke();

        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, rPx - 0.5, 0, Math.PI * 2); ctx.clip();

        // Delicate 30° graticule hairlines
        ctx.strokeStyle = C.line; ctx.lineWidth = 0.65;
        for (let lat = -60; lat <= 60; lat += 30) {
          ctx.beginPath(); let pen = false;
          for (let lon = -180; lon <= 180; lon += 6) {
            const [x, y, z] = ll2xyz(lat, lon, 1.06);
            const [sx, sy, z2] = st.proj(x, y, z);
            if (z2 > -0.04) { if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy); } else pen = false;
          }
          ctx.stroke();
        }
        for (let lon = -180; lon < 180; lon += 30) {
          ctx.beginPath(); let pen = false;
          for (let lat = -84; lat <= 84; lat += 6) {
            const [x, y, z] = ll2xyz(lat, lon, 1.06);
            const [sx, sy, z2] = st.proj(x, y, z);
            if (z2 > -0.04) { if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy); } else pen = false;
          }
          ctx.stroke();
        }

        // Paper-cut continents with crisp hairline coastlines
        WORLD_LAND.forEach(poly => {
          ctx.beginPath(); let pen = false, anyFront = false;
          for (let i = 0; i < poly.length; i++) {
            const [lon, lat] = poly[i], [x, y, z] = ll2xyz(lat, lon, 1.062);
            const [sx, sy, z2] = st.proj(x, y, z);
            if (z2 > -0.02) { anyFront = true; if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy); }
            else pen = false;
          }
          if (anyFront) {
            ctx.fillStyle = C.bg; ctx.fill();
            ctx.strokeStyle = C.line2; ctx.lineWidth = 0.95; ctx.stroke();
          }
        });
        ctx.restore();

        // 3D elevated great-circle hairline arcs + crisp traveling comets
        awayArcs.forEach(ar => {
          if (ms(ar.hub.first) > curMs) return;
          const isSel = ar.idx === selHub;
          ctx.beginPath(); let pen = false;
          for (let i = 0; i < ar.curve.length; i++) {
            const [x, y, z] = ar.curve[i], [sx, sy, z2] = st.proj(x, y, z);
            if (z2 > -0.14) { if (!pen) { ctx.moveTo(sx, sy); pen = true; } else ctx.lineTo(sx, sy); } else pen = false;
          }
          ctx.strokeStyle = ar.hub.remote ? C.amber : C.blue;
          ctx.globalAlpha = isSel || ar.hub.remote ? 0.88 : 0.28;
          ctx.lineWidth = isSel ? 1.85 : ar.hub.remote ? 1.45 : 0.95;
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Subtle moving comet pulse along key arcs
          if (isSel || ar.hub.remote || ar.hub.n >= 10) {
            const ct = (st.tSec * 0.25 + ar.phase) % 1;
            const ci = Math.min(ar.curve.length - 1, Math.floor(ct * (ar.curve.length - 1)));
            const [cx3, cy3, cz3] = ar.curve[ci], [psx, psy, pz2] = st.proj(cx3, cy3, cz3);
            if (pz2 > -0.02) {
              ctx.fillStyle = ar.hub.remote ? C.amber : C.teal;
              ctx.beginPath(); ctx.arc(psx, psy, 2.3, 0, Math.PI * 2); ctx.fill();
            }
          }
        });

        // Hub pins + minimalist labels
        let hoverHub = -1, bestD = 20;
        hubs.forEach((h, i) => {
          if (!h.home && ms(h.first) > curMs) return;
          const [x, y, z] = ll2xyz(h.lat, h.lon, 1.068), [sx, sy, z2] = st.proj(x, y, z);
          if (z2 < 0.04) return;
          const isSel = i === selHub;
          const r = h.home ? 6.0 : h.remote ? 4.4 : clamp(2.4 + Math.sqrt(h.n) * 0.45, 2.4, 5.8);
          if (isSel) {
            ctx.beginPath(); ctx.arc(sx, sy, r + 4.5, 0, Math.PI * 2);
            ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.setLineDash([3, 2.5]); ctx.stroke(); ctx.setLineDash([]);
          }
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
          if (h.home || h.remote) { ctx.fillStyle = C.amber; ctx.fill(); }
          else if (h.bg / h.n >= 0.5) { ctx.fillStyle = C.blue; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
          else { ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.6; ctx.stroke(); }

          if (st.ptrIn && !st.dragging) {
            const d = Math.hypot(st.ptrX - sx, st.ptrY - sy);
            if (d < bestD) { bestD = d; hoverHub = i; }
          }
          if (keyLabels.has(h.name) || isSel) {
            const nm = h.name.replace(', MA', '').replace(', CA', '').replace(', ON', '').replace('–Fort Worth, TX', '').replace(', SD/WY/NE', '').replace(', HI', '').replace('Greater ', '').replace(' (Linux remote)', ' (CN remote)');
            const off = {
              'Greater Boston, MA': [r + 6, 3, 'left'],
              'SF Bay Area, CA': [-(r + 6), -5, 'right'],
              'Los Angeles, CA': [0, r + 11, 'center'],
              'Black Hills, SD/WY/NE': [0, -(r + 9), 'center'],
              'Dallas–Fort Worth, TX': [r + 6, 8, 'left'],
              'Honolulu, HI': [-(r + 5), 3, 'right'],
            }[h.name] || [r + 5, 3, 'left'];
            label3d(ctx, nm, sx + off[0], sy + off[1], isSel || h.remote ? C.amber : h.home ? C.fg : C.fg2, C.bg, off[2],
              (isSel || h.home || h.remote ? '600 ' : '500 ') + '10px -apple-system, BlinkMacSystemFont, sans-serif');
          }
        });
        if (hoverHub >= 0 && hoverHub !== selHub) { selHub = hoverHub; updateReadout(); }
      },
      onReset() {
        playing = false; replayFrac = 1;
        playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Replay 270 days';
        updateReadout();
      },
    });

    const scRow = document.createElement('div');
    scRow.className = 'goog-scrub-row';
    scRow.innerHTML = `<span>Feb 27</span><input type="range" min="0" max="100" value="100" aria-label="270-day travel replay scrubber"><span data-gdate>Nov 23, 2026</span>`;
    ui.view.appendChild(scRow);
    const scInp = $('input', scRow), scDate = $('[data-gdate]', scRow);

    function updateReadout() {
      const curIso = new Date(t0Ms + replayFrac * (t1Ms - t0Ms)).toISOString().slice(0, 10);
      scInp.value = String(Math.round(replayFrac * 100));
      scDate.textContent = fmtDate(curIso);
      const h = hubs[selHub] || hubs[0];
      ui.out.innerHTML = playing
        ? `<span><strong>Replaying through ${fmtDate(curIso)}</strong> — Timeline: <strong>OFF</strong> (deleted May 2024)</span><span>2,058 logins · 67.5% silent</span>`
        : `<span><strong>${esc(h.name)}</strong>: <span class="blue">${num(h.n)}</span> logins (${num(h.bg)} silent, ${num(h.inter)} interactive) · ${esc(h.topApp)}</span><span>Maps iOS: <span class="blue">1,019</span> (100% silent)</span>`;
    }

    playBtn.addEventListener('click', () => {
      if (playing) { playing = false; playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Replay 270 days'; }
      else { playing = true; if (replayFrac >= 0.99) replayFrac = 0; playBtn.setAttribute('aria-pressed', 'true'); playBtn.textContent = '❚❚ Pause'; orbit.wake(); }
      updateReadout();
    });
    rstBtn.addEventListener('click', () => { orbit.reset(); orbit.onReset && orbit.onReset(); playing = false; replayFrac = 1; playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Replay 270 days'; updateReadout(); });
    scInp.addEventListener('input', () => {
      playing = false; playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Replay 270 days';
      replayFrac = Number(scInp.value) / 100; updateReadout(); orbit.wake();
    });
    updateReadout();

    fig._setAct = ds => {
      if (ds.hub) {
        const i = hubs.findIndex(h => h.name.toLowerCase().includes(ds.hub.toLowerCase()));
        if (i >= 0) {
          selHub = i; replayFrac = 1; playing = false;
          // Smoothly rotate the 3D globe directly to the requested hub!
          orbit.tYaw = (hubs[i].lon * Math.PI) / 180;
          orbit.tPitch = clamp((hubs[i].lat * Math.PI) / 180 * 0.85, -0.8, 0.95);
          playBtn.setAttribute('aria-pressed', 'false'); playBtn.textContent = '▶ Replay 270 days';
        }
      }
      if (ds.replay === '1') {
        playing = true; replayFrac = 0;
        orbit.tYaw = -1.68; orbit.tPitch = 0.50;
        playBtn.setAttribute('aria-pressed', 'true'); playBtn.textContent = '❚❚ Pause';
      }
      updateReadout(); orbit.wake();
    };
  }

  // ----------------------------------- Figure 6: Minimalist 3D Isometric 212k Server Seismograph (Warm Paper!)
  function figPings(fig, D) {
    const grid = D.accessLog.grid, daily = D.accessLog.daily;
    let selD = 5, selH = 9; // Default spotlight: Nov 1, 9 am (6,007 pings)

    const ui = shell(fig, [
      ['amber', 'Linux Chrome v155 storm (50.4k)'],
      ['ink', 'Blank UA surge (93.0k)'],
      ['blue', 'Mac, iOS & TV traffic'],
    ], `<button type="button" data-sleep aria-pressed="false">2–6 am sleep view</button><button type="button" data-rst>↺ Reset</button>`);

    const sleepBtn = $('[data-sleep]', ui.actions), rstBtn = $('[data-rst]', ui.actions);

    const orbit = createOrbitStage(fig, ui.view, {
      label: 'Draggable 3D isometric seismograph of all 672 hourly Access Log buckets across 28 days',
      yaw: -0.62, pitch: 0.56, zoom: 0.85, scaleFactor: 0.36, cyFrac: 0.49, drift: 0.035,
      draw(ctx, st, C) {
        const floorY = -0.48, maxH = 1.14;
        const xOf = d => ((d / 27) - 0.5) * 2.18;
        const zOf = h => ((h / 23) - 0.5) * 1.48;

        // Subtle 2–6 am sleep corridor highlight strip on floor
        const s0 = st.proj(xOf(0), floorY, zOf(2)), s1 = st.proj(xOf(27), floorY, zOf(2));
        const s2 = st.proj(xOf(27), floorY, zOf(6)), s3 = st.proj(xOf(0), floorY, zOf(6));
        ctx.beginPath();
        ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.closePath();
        ctx.fillStyle = C.isDark ? 'rgba(255,255,255,0.045)' : 'rgba(24,24,23,0.045)';
        ctx.fill();

        // Crisp hairline perspective floor grid
        ctx.strokeStyle = C.line; ctx.lineWidth = 0.7;
        for (let d = 0; d < 28; d += 3) {
          const [x0, y0] = st.proj(xOf(d), floorY, zOf(0)), [x1, y1] = st.proj(xOf(d), floorY, zOf(23));
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
        for (let h = 0; h < 24; h += 4) {
          const [x0, y0] = st.proj(xOf(0), floorY, zOf(h)), [x1, y1] = st.proj(xOf(27), floorY, zOf(h));
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }

        // Floor axis labels
        [[0, 'Oct 27'], [5, 'Nov 1'], [15, 'Nov 11'], [27, 'Nov 23']].forEach(([d, lbl]) => {
          const [lx, ly] = st.proj(xOf(d), floorY, zOf(23) + 0.14);
          label3d(ctx, lbl, lx, ly, d === 5 ? C.amber : C.fg3, C.bg, 'center', '500 9.5px ui-monospace, SFMono-Regular, Menlo, monospace');
        });
        [[0, '12a'], [6, '6a'], [12, 'noon'], [18, '6p']].forEach(([h, lbl]) => {
          const [lx, ly] = st.proj(xOf(0) - 0.14, floorY, zOf(h));
          label3d(ctx, lbl, lx, ly + 3, C.fg3, C.bg, 'right', '500 9.5px ui-monospace, SFMono-Regular, Menlo, monospace');
        });

        // Depth-sorted architectural 3D pins for all 672 hourly buckets
        const bars = [];
        for (let d = 0; d < 28; d++) {
          for (let h = 0; h < 24; h++) {
            const [tot, blk, lnx] = grid[d][h];
            if (tot < 8) continue;
            const hNorm = Math.pow(clamp(tot / 6007, 0, 1), 0.56);
            const x = xOf(d), z = zOf(h), topY = floorY + hNorm * maxH;
            const p0 = st.proj(x, floorY, z), p1 = st.proj(x, topY, z);
            bars.push({ x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], z2: p0[2], tot, blk, lnx, d, h, hNorm });
          }
        }
        bars.sort((a, b) => a.z2 - b.z2);

        let hitD = -1, hitH = -1, bestDist = 14;
        bars.forEach(b => {
          const isSel = b.d === selD && b.h === selH;
          const col = b.lnx > b.tot * 0.4 ? C.amber : b.blk > b.tot * 0.6 ? C.fg2 : C.blue;
          ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1);
          ctx.strokeStyle = col;
          ctx.globalAlpha = isSel ? 1 : (0.28 + b.hNorm * 0.68);
          ctx.lineWidth = isSel ? 3.8 : (1.5 + b.hNorm * 2.1);
          ctx.lineCap = 'round';
          ctx.stroke();
          if (b.hNorm > 0.25 || isSel) {
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(b.x1, b.y1, isSel ? 3.4 : 1.5 + b.hNorm * 1.1, 0, Math.PI * 2); ctx.fill();
          }
          if (isSel) {
            ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(b.x1, b.y1, 7, 0, Math.PI * 2);
            ctx.strokeStyle = C.amber; ctx.lineWidth = 1.4; ctx.setLineDash([2.5, 2]); ctx.stroke(); ctx.setLineDash([]);
          }
          if (st.ptrIn && !st.dragging) {
            const dd = Math.hypot(st.ptrX - b.x1, st.ptrY - b.y1);
            if (dd < bestDist) { bestDist = dd; hitD = b.d; hitH = b.h; }
          }
        });
        ctx.globalAlpha = 1;

        // Floating dashed 64/sec ceiling plane frame
        const capY = floorY + maxH + 0.06;
        const c0 = st.proj(xOf(0), capY, zOf(0)), c1 = st.proj(xOf(27), capY, zOf(0));
        const c2 = st.proj(xOf(27), capY, zOf(23)), c3 = st.proj(xOf(0), capY, zOf(23));
        ctx.beginPath();
        ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath();
        ctx.strokeStyle = C.teal; ctx.globalAlpha = 0.45; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;

        // Clean architectural peak annotations
        const pNov1 = st.proj(xOf(5), floorY + maxH + 0.04, zOf(9));
        label3d(ctx, 'Nov 1 · Linux storm (38.4k)', pNov1[0], pNov1[1] - 8, C.amber, C.bg, 'center', '600 10px -apple-system, BlinkMacSystemFont, sans-serif');
        const pNov5 = st.proj(xOf(9), floorY + maxH * 0.84, zOf(18));
        label3d(ctx, 'Nov 4–5 · Blank UA (50.3k)', pNov5[0] + 16, pNov5[1] - 8, C.fg, C.bg, 'left', '600 10px -apple-system, BlinkMacSystemFont, sans-serif');
        label3d(ctx, '64/sec ceiling', c2[0] + 6, c2[1] + 3, C.teal, C.bg, 'left', '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace');

        if (hitD >= 0 && (hitD !== selD || hitH !== selH)) { selD = hitD; selH = hitH; updateReadout(); }
      },
    });

    function updateReadout() {
      const [tot, blk, lnx, mac, iotv] = grid[selD][selH];
      ui.out.innerHTML = `<span><strong>${fmtDate(daily[selD].d)} · ${hourLabel(selH)}</strong>: <strong>${num(tot)}</strong> pings — Linux <span class="amber">${num(lnx)}</span>, Blank UA <span class="ink">${num(blk)}</span>, Mac <span class="blue">${num(mac)}</span>, iOS+TV ${num(iotv)}</span><span>91.6% Other · max 64/sec</span>`;
    }

    let sleepMode = false;
    sleepBtn.addEventListener('click', () => {
      sleepMode = !sleepMode;
      sleepBtn.setAttribute('aria-pressed', String(sleepMode));
      if (sleepMode) { orbit.tYaw = 0.06; orbit.tPitch = 0.36; orbit.tZoom = 1.02; }
      else orbit.reset();
      orbit.wake();
    });
    rstBtn.addEventListener('click', () => {
      sleepMode = false; sleepBtn.setAttribute('aria-pressed', 'false');
      selD = 5; selH = 9; orbit.reset(); updateReadout();
    });
    updateReadout();

    fig._setAct = ds => {
      if (ds.day) { const i = daily.findIndex(d => d.d === ds.day); if (i >= 0) selD = i; }
      if (ds.hour !== undefined) selH = clamp(Number(ds.hour), 0, 23);
      if (ds.angle === 'sleep') {
        sleepMode = true; sleepBtn.setAttribute('aria-pressed', 'true');
        orbit.tYaw = 0.06; orbit.tPitch = 0.36; orbit.tZoom = 1.02;
      } else {
        sleepMode = false; sleepBtn.setAttribute('aria-pressed', 'false');
        orbit.tYaw = -0.62; orbit.tPitch = 0.56;
      }
      updateReadout(); orbit.wake();
    };
  }

  // ----------------------------------- Figure 7: Telescoping Geological Core Sample
  function figAccount(fig, D) {
    const horizons = [...D.account.horizons].reverse();
    let selL = 3, geo = null;

    const ui = shell(fig, [
      ['blue', 'Outer retention strata (telescoping zoom)'],
      ['amber', '28-day sliver = 0.9% of time, 94.2% of rows'],
    ]);

    function draw() {
      const w = width(ui.view), x0 = 10, pw = w - x0 * 2;
      const top = 12, layerH = 28, gap = 24, H = top + horizons.length * (layerH + gap) + 4;
      let s = '';

      horizons.forEach((h, i) => {
        const y = top + i * (layerH + gap), isLast = i === horizons.length - 1, isSel = i === selL;
        if (!isLast) {
          const nextD = horizons[i + 1].days, frac = clamp(nextD / h.days, 0.018, 0.95);
          const slW = Math.max(8, pw * frac), slX = x0 + pw - slW, nextY = y + layerH + gap;
          s += `<polygon points="${f(slX)},${f(y + layerH)} ${f(x0 + pw)},${f(y + layerH)} ${f(x0 + pw)},${f(nextY)} ${f(x0)},${f(nextY)}" class="${i === horizons.length - 2 ? 'geo-lens amber' : 'geo-lens'}"/>`;
          s += rect(slX, y, slW, layerH, i === horizons.length - 2 ? 'bar amber' : 'bar on', 'rx="2" style="opacity:0.32"');
        }
        const barCls = isLast || isSel ? 'panel-box active' : 'panel-box';
        s += rect(x0, y, pw, layerH, barCls, `rx="4"${isLast ? ' style="stroke:var(--g-amber);fill:var(--g-amber-soft)"' : ''}`);
        const leftLbl = w < 440 ? trunc(h.name, 19) : `${h.name} · ${h.span}`;
        const rightLbl = `${num(h.days)}d · ${num(h.rows)} rows`;
        s += text(x0 + 9, y + 18, leftLbl, isLast ? 'amber small' : isSel ? 'blue small' : 'strong small');
        s += text(x0 + pw - 9, y + 18, rightLbl, isLast ? 'amber small' : 'small ink', 'end');
      });

      geo = { top, step: layerH + gap, count: horizons.length };
      ui.view.innerHTML = svg(w, H, 'Telescoping four-layer geological core sample showing 28 days holds 94.2 percent of all Takeout rows', s);
      const h = horizons[selL];
      ui.out.innerHTML = `<span><strong>${esc(h.name)}</strong> (${esc(h.span)}): <span class="blue">${num(h.days)} days</span>, <span class="amber">${num(h.rows)} rows</span></span><span>${esc(h.note)}</span>`;
    }

    hover(ui.view, (x, y) => {
      if (!geo) return;
      const i = clamp(Math.floor((y - geo.top) / geo.step), 0, geo.count - 1);
      if (i !== selL) { selL = i; draw(); }
    });
    keys(ui.view, d => { selL = clamp(selL + d, 0, horizons.length - 1); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.layer !== undefined) selL = clamp(Number(ds.layer), 0, horizons.length - 1);
      draw();
    };
  }

  // ----------------------------------------------------------------- boot
  fetch(first.dataset.src)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(D => {
      const builders = {
        'goog-ads': figAds,
        'goog-culture': figCulture,
        'goog-rhythm': figRhythm,
        'goog-sessions': figSessions,
        'goog-geo': figGeo,
        'goog-pings': figPings,
        'goog-account': figAccount,
      };
      Object.entries(builders).forEach(([id, fn]) => {
        const fig = document.getElementById(id);
        if (fig) fn(fig, D);
      });

      all('a.act[href^="#goog-"]').forEach(a => {
        a.addEventListener('click', ev => {
          const fig = $(a.getAttribute('href'));
          if (fig && fig._setAct) {
            ev.preventDefault();
            fig._setAct(a.dataset);
            fig.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      });
    })
    .catch(() => {
      all('figure.goog').forEach(fig => {
        const p = document.createElement('p');
        p.className = 'goog-error';
        p.textContent = 'Figure data could not be loaded.';
        fig.insertBefore(p, $('figcaption', fig));
      });
    });
})();
