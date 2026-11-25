/* Seven single-form minimalist interactive visualizations for "Reading my own McDonald's export".
   Zero third-party dependencies — vanilla SVG, two draggable 3D Canvas sculptures, and subtle WebAudio. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmtMoney = v => '$' + Number(v).toFixed(2);
  const fmtInt = v => Math.round(Number(v)).toLocaleString('en-US');
  const fmtYM = ym => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
  const fmtYMShort = ym => { const [y, m] = ym.split('-'); return `${MONTHS[+m - 1]} ’${y.slice(2)}`; };
  const fmtDate = d => { const [y, m, dd] = d.split('-'); return `${MONTHS[+m - 1]} ${+dd}, ${y}`; };
  const fmtDateShort = d => { const [, m, dd] = d.split('-'); return `${MONTHS[+m - 1]} ${+dd}`; };
  const fmtHr = h => h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? 'noon' : `${h - 12} pm`;
  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------- WebAudio (lazy, user-gesture only) */
  const Sound = (() => {
    let ctx = null, lastChime = 0;
    const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
    function ensure() {
      if (reducedMotion) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function tick() {
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(1180, c.currentTime);
      g.gain.setValueAtTime(0.03, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.03);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.035);
    }
    function latch() {
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(440, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.16);
      g.gain.setValueAtTime(0.055, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.2);
    }
    function chime(idx, warm = false) {
      const c = ensure(); if (!c) return;
      const now = c.currentTime;
      if (now - lastChime < 0.045) return;
      lastChime = now;
      const o = c.createOscillator(), g = c.createGain();
      o.type = warm ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(SCALE[Math.abs(idx) % SCALE.length], now);
      g.gain.setValueAtTime(0.038, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(g); g.connect(c.destination); o.start(now); o.stop(now + 0.2);
    }
    return { tick, latch, chime };
  })();

  /* ------------------------------------------------------------- DOM / SVG / Theme helpers */
  function el(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function stageW(node) {
    const r = node.getBoundingClientRect();
    return Math.max(280, Math.round(r.width || node.clientWidth || 720));
  }
  function observeWidth(node, fn) {
    let last = 0;
    if (typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(() => {
      const w = stageW(node);
      if (Math.abs(w - last) >= 4) { last = w; fn(); }
    }).observe(node);
  }
  function readTheme(fig) {
    const cs = getComputedStyle(fig);
    const root = getComputedStyle(document.documentElement);
    const get = (k, fb) => (cs.getPropertyValue(k) || root.getPropertyValue(k) || fb).trim();
    const bg = get('--bg', '#ffffff');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return {
      dark: isDark, bg,
      fg: get('--fg', isDark ? '#f0ede8' : '#181817'),
      fg2: get('--fg-2', isDark ? '#b5b0a6' : '#55544e'),
      fg3: get('--fg-3', isDark ? '#7d786f' : '#85837c'),
      line: get('--line', isDark ? 'rgba(255,255,255,0.11)' : 'rgba(24,24,23,0.11)'),
      line2: get('--line-2', isDark ? 'rgba(255,255,255,0.20)' : 'rgba(24,24,23,0.20)'),
      blue: get('--m-blue', isDark ? '#7aa7ff' : '#1b59c8'),
      teal: get('--m-teal', isDark ? '#49b6a4' : '#1d6f63'),
      amber: get('--m-amber', isDark ? '#e2a24a' : '#b36b14'),
      red: get('--m-red', isDark ? '#e56b5d' : '#b53a2d'),
      sans: get('--sans', 'system-ui, -apple-system, sans-serif'),
      mono: get('--mono', 'ui-monospace, SFMono-Regular, monospace'),
    };
  }
  function rgba(hexOrRgb, a) {
    const s = hexOrRgb.trim();
    if (s.startsWith('#')) {
      const n = s.length === 4
        ? [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)]
        : [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
    }
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : s;
  }

  function setReadout(elOut, leftHtml, rightHtml) {
    elOut.innerHTML = `<span>${leftHtml}</span>${rightHtml ? `<span>${rightHtml}</span>` : ''}`;
  }
  function makeShell(fig, legendItems, buttons) {
    const body = fig.querySelector('.mcd-body');
    body.innerHTML = '';
    const head = h('div', 'mcd-head');
    const leg = h('div', 'mcd-legend');
    for (const it of legendItems) {
      const sp = h('span', it.cls || '');
      sp.appendChild(h('i'));
      sp.appendChild(document.createTextNode(it.label));
      leg.appendChild(sp);
    }
    head.appendChild(leg);

    const actions = h('div', 'mcd-actions');
    const btns = {};
    for (const b of buttons) {
      const btn = h('button', b.cls || '', b.label);
      btn.type = 'button';
      btn.dataset.act = b.key;
      if (b.pressed !== undefined) btn.setAttribute('aria-pressed', b.pressed ? 'true' : 'false');
      actions.appendChild(btn);
      btns[b.key] = btn;
    }
    head.appendChild(actions);
    body.appendChild(head);

    const subpills = h('div', 'mcd-subpills');
    subpills.hidden = true;
    body.appendChild(subpills);

    const stage = h('div', 'mcd-stage');
    stage.tabIndex = 0;
    body.appendChild(stage);

    const readout = h('div', 'mcd-readout');
    readout.setAttribute('aria-live', 'polite');
    body.appendChild(readout);

    fig.classList.add('ready');
    return { body, head, leg, actions, btns, subpills, stage, readout };
  }
  function bindKeys(stage, onStep) {
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onStep(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onStep(-1); }
    });
  }

  /* ------------------------------------------------------------- Shared Draggable 3D Canvas Engine */
  const themeWatchers = [];
  new MutationObserver(() => themeWatchers.forEach(fn => fn())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function makeCanvas3D(container, heightPx, initCam, drawFn, hoverFn, clickFn, hintText) {
    const wrap = h('div', 'mcd-canvas-wrap');
    const canvas = document.createElement('canvas');
    const hint = h('div', 'mcd-canvas-hint', hintText || 'drag to orbit · hover or click');
    wrap.append(canvas, hint);
    container.appendChild(wrap);

    const cam = {
      yaw: initCam.yaw, pitch: initCam.pitch, dist: initCam.dist || 2.5,
      tYaw: initCam.yaw, tPitch: initCam.pitch, tDist: initCam.dist || 2.5,
      cx: initCam.cx || 0, cz: initCam.cz || 0,
      tCx: initCam.cx || 0, tCz: initCam.cz || 0,
      fW: initCam.fW || 0.72, fH: initCam.fH || 1.32, cyFrac: initCam.cyFrac || 0.56,
    };
    let cw = 700, ch = heightPx, dpr = Math.min(2, window.devicePixelRatio || 1);
    let dragging = false, moved = false, lx = 0, ly = 0, downX = 0, downY = 0;
    let mx = -1, my = -1, raf = 0, cachedTheme = null, pulse = 0, keepAlive = null;

    function resize() {
      const r = wrap.getBoundingClientRect();
      cw = Math.max(280, Math.round(r.width || 700));
      ch = cw < 460 ? Math.round(heightPx * 0.85) : heightPx;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      schedule();
    }
    function project(x, y, z) {
      const dx = x - cam.cx, dz = z - cam.cz;
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp + cam.dist;
      const f = Math.min(cw * cam.fW, ch * cam.fH);
      const s = f / Math.max(0.45, z2);
      return { x: cw / 2 + x1 * s, y: ch * cam.cyFrac - y2 * s, z: z2, s };
    }
    function render() {
      const fig = wrap.closest('figure');
      if (!cachedTheme) cachedTheme = readTheme(fig || document.body);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      drawFn(ctx, cw, ch, project, cachedTheme, mx, my, pulse);
    }
    function tick() {
      raf = 0;
      const moving =
        Math.abs(cam.yaw - cam.tYaw) > 0.002 ||
        Math.abs(cam.pitch - cam.tPitch) > 0.002 ||
        Math.abs(cam.dist - cam.tDist) > 0.003 ||
        Math.abs(cam.cx - cam.tCx) > 0.002 ||
        Math.abs(cam.cz - cam.tCz) > 0.002;
      if (moving && !dragging) {
        cam.yaw = lerp(cam.yaw, cam.tYaw, 0.16);
        cam.pitch = lerp(cam.pitch, cam.tPitch, 0.16);
        cam.dist = lerp(cam.dist, cam.tDist, 0.16);
        cam.cx = lerp(cam.cx, cam.tCx, 0.16);
        cam.cz = lerp(cam.cz, cam.tCz, 0.16);
      }
      render();
      if ((moving && !dragging) || (keepAlive && keepAlive())) schedule();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(tick); }

    wrap.addEventListener('pointerdown', e => { dragging = true; moved = false; lx = downX = e.clientX; ly = downY = e.clientY; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', e => {
      const r = wrap.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      if (dragging) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
        cam.yaw += (e.clientX - lx) * 0.0075;
        cam.pitch = clamp(cam.pitch + (e.clientY - ly) * 0.0065, 0.18, 1.54);
        cam.tYaw = cam.yaw; cam.tPitch = cam.pitch;
        lx = e.clientX; ly = e.clientY;
      }
      if (hoverFn) hoverFn(mx, my);
      schedule();
    });
    wrap.addEventListener('pointerup', e => {
      if (dragging && !moved && clickFn) { const r = wrap.getBoundingClientRect(); clickFn(e.clientX - r.left, e.clientY - r.top); schedule(); }
      dragging = false;
    });
    wrap.addEventListener('pointercancel', () => { dragging = false; });
    wrap.addEventListener('pointerleave', () => { dragging = false; mx = -1; my = -1; if (hoverFn) hoverFn(-1, -1); schedule(); });

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(wrap);
    themeWatchers.push(() => { cachedTheme = null; render(); });
    resize();

    return {
      wrap, canvas, cam, render: schedule,
      setKeepAlive(fn) { keepAlive = fn; },
      setPulse(p) { pulse = p; schedule(); },
      flyTo(yaw, pitch, dist = 2.45, cx = 0, cz = 0) {
        cam.tYaw = yaw; cam.tPitch = pitch; cam.tDist = dist; cam.tCx = cx; cam.tCz = cz;
        if (reducedMotion) { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; cam.cx = cx; cam.cz = cz; }
        schedule();
      },
    };
  }

  /* ============================================================================
     FIGURE 1 (#mcd-journey): Drag-Brush 52-Month Mirror Timeline + Gliding Spend Dot + 17s Pulse
     ============================================================================ */
  function buildJourney(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'blue', label: 'Home (45)' },
      { cls: 'amber', label: 'Road (26)' },
      { cls: 'hollow', label: 'Dormant pushes (83)' },
      { cls: 'teal', label: 'Cum. spend ($667.85)' },
    ], [
      { key: 'replay17', label: '▶ Replay 17s', cls: 'red-act', pressed: false },
    ]);

    const months = data.monthly;
    const cumSpendM = [];
    let csAcc = 0;
    for (const m of months) { csAcc = Math.round((csAcc + m.spend) * 100) / 100; cumSpendM.push(csAcc); }

    let brush = null, hoverIdx = 22, dragState = null;
    let replaySec = null, replayRaf = 0;

    const svg = el('svg', { class: 'mcd-chart brushable' });
    shell.stage.appendChild(svg);

    function stopReplay() {
      cancelAnimationFrame(replayRaf);
      replaySec = null;
      shell.btns.replay17.textContent = '▶ Replay 17s';
      shell.btns.replay17.setAttribute('aria-pressed', 'false');
    }

    function draw() {
      const W = stageW(shell.stage), narrow = W < 520, H = narrow ? 298 : 322;
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const ml = narrow ? 36 : 46, mr = narrow ? 14 : 44, mt = 30, mb = 28;
      const pw = W - ml - mr;
      const spineY = Math.round(mt + (H - mt - mb) * 0.54);
      const topH = spineY - mt, botH = H - mb - spineY;
      const step = pw / months.length;
      const bw = Math.max(3.4, step - (narrow ? 1.4 : 3.0));
      const xAt = i => ml + (i + 0.5) * step;
      const cumY = i => H - mb - (cumSpendM[i] / 700) * (botH - 8);

      const optX = ml + 22 * step, phX = ml + 29 * step, bosX = ml + 41 * step;

      const defs = el('defs');
      const gDorm = el('linearGradient', { id: 'mcd-j-dorm', x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
      gDorm.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--m-amber)', 'stop-opacity': '0.025' }));
      gDorm.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--m-amber)', 'stop-opacity': '0.085' }));
      defs.appendChild(gDorm);
      svg.appendChild(defs);

      svg.appendChild(el('rect', { x: ml, y: mt, width: optX - ml, height: H - mt - mb, fill: 'url(#mcd-j-dorm)' }));
      svg.appendChild(el('rect', { x: bosX, y: mt, width: ml + pw - bosX, height: H - mt - mb, fill: 'var(--m-blue)', opacity: 0.032 }));

      for (const [xx, cls] of [[optX, 'bench red'], [phX, 'bench'], [bosX, 'bench blue']]) {
        svg.appendChild(el('line', { class: cls, x1: xx.toFixed(1), y1: mt - 4, x2: xx.toFixed(1), y2: H - mb }));
      }
      if (!narrow) {
        svg.appendChild(el('text', { class: 'small amber', x: (ml + optX) / 2, y: mt - 10, 'text-anchor': 'middle' }, 'Dormant · 663d · 83 pushes'));
        svg.appendChild(el('text', { class: 'small ink', x: (optX + phX) / 2, y: mt - 10, 'text-anchor': 'middle' }, 'I · NYC & NJ'));
        svg.appendChild(el('text', { class: 'small ink', x: (phX + bosX) / 2, y: mt - 10, 'text-anchor': 'middle' }, 'II · Philadelphia'));
        svg.appendChild(el('text', { class: 'small blue', x: (bosX + ml + pw) / 2, y: mt - 10, 'text-anchor': 'middle' }, 'III · Boston & Trips'));
      } else {
        svg.appendChild(el('text', { class: 'small amber', x: (ml + optX) / 2, y: mt - 10, 'text-anchor': 'middle' }, '663d dormant'));
        svg.appendChild(el('text', { class: 'small blue', x: (optX + ml + pw) / 2, y: mt - 10, 'text-anchor': 'middle' }, 'NYC → Philly → Boston'));
      }

      const maxTop = 8, maxSp = 90;
      for (const v of [4, 8]) {
        const y = spineY - (v / maxTop) * topH;
        svg.appendChild(el('line', { class: 'grid', x1: ml, y1: y, x2: ml + pw, y2: y }));
        svg.appendChild(el('text', { class: 'mono small', x: ml - 6, y: y + 3.5, 'text-anchor': 'end' }, `${v}`));
      }
      for (const sp of [30, 60]) {
        const y = spineY + (sp / maxSp) * botH;
        svg.appendChild(el('line', { class: 'grid', x1: ml, y1: y, x2: ml + pw, y2: y }));
        svg.appendChild(el('text', { class: 'mono small', x: ml - 6, y: y + 3.5, 'text-anchor': 'end' }, `$${sp}`));
      }
      svg.appendChild(el('line', { class: 'axis', x1: ml, y1: spineY, x2: ml + pw, y2: spineY }));
      svg.appendChild(el('text', { class: 'small', x: ml + 3, y: mt + 11 }, narrow ? 'Meals / mo ↑' : 'Meals / mo ↑ (dormant pushes scaled)'));
      svg.appendChild(el('text', { class: 'small', x: ml + 3, y: spineY + 13 }, 'Monthly spend ↓'));

      if (brush) {
        const bx0 = ml + brush[0] * step, bx1 = ml + (brush[1] + 1) * step;
        svg.appendChild(el('rect', { class: 'brush-band', x: bx0.toFixed(1), y: mt, width: (bx1 - bx0).toFixed(1), height: H - mt - mb }));
        svg.appendChild(el('line', { class: 'brush-edge', x1: bx0.toFixed(1), y1: mt, x2: bx0.toFixed(1), y2: H - mb }));
        svg.appendChild(el('line', { class: 'brush-edge', x1: bx1.toFixed(1), y1: mt, x2: bx1.toFixed(1), y2: H - mb }));
      }

      const curCol = el('rect', { x: -40, y: mt, width: step, height: H - mt - mb, fill: 'var(--fg)', opacity: 0.05, 'pointer-events': 'none' });
      const curLine = el('line', { class: 'cursor', x1: -20, y1: mt, x2: -20, y2: H - mb });
      svg.append(curCol, curLine);

      months.forEach((m, i) => {
        const x = ml + i * step + (step - bw) / 2;
        const inBrush = !brush || (i >= brush[0] && i <= brush[1]);
        const op = inBrush ? 0.92 : 0.2;
        if (i < 22 && m.push > 0) {
          const bh = (Math.min(13, m.push) * 0.55 / maxTop) * topH;
          svg.appendChild(el('rect', { x: x.toFixed(1), y: (spineY - bh).toFixed(1), width: bw.toFixed(1), height: Math.max(2, bh).toFixed(1), rx: 1.2, fill: 'var(--m-amber)', opacity: inBrush ? 0.34 : 0.1, stroke: 'var(--m-amber)', 'stroke-width': 0.8 }));
        } else if (m.orders > 0) {
          let curY = spineY;
          if (m.home_orders > 0) {
            const bh = (m.home_orders / maxTop) * topH; curY -= bh;
            svg.appendChild(el('rect', { class: 'bar blue', x: x.toFixed(1), y: curY.toFixed(1), width: bw.toFixed(1), height: Math.max(2, bh).toFixed(1), rx: 1.2, opacity: op }));
          }
          if (m.road_orders > 0) {
            const bh = (m.road_orders / maxTop) * topH; curY -= bh;
            svg.appendChild(el('rect', { class: 'bar amber', x: x.toFixed(1), y: curY.toFixed(1), width: bw.toFixed(1), height: Math.max(2, bh).toFixed(1), rx: 1.2, opacity: op }));
          }
        }
        if (m.spend > 0) {
          const sh = (m.spend / maxSp) * botH;
          svg.appendChild(el('rect', { class: 'bar ink', x: x.toFixed(1), y: (spineY + 0.8).toFixed(1), width: bw.toFixed(1), height: Math.max(2, sh).toFixed(1), rx: 1.2, opacity: inBrush ? 0.72 : 0.18 }));
        }
        if (m.m.endsWith('-01')) {
          svg.appendChild(el('text', { class: 'mono small', x: xAt(i).toFixed(1), y: H - 8, 'text-anchor': 'middle' }, m.m.slice(0, 4)));
        }
      });

      const cumPts = months.map((m, i) => `${xAt(i).toFixed(1)},${cumY(i).toFixed(1)}`);
      svg.appendChild(el('polyline', { class: 'line teal', points: cumPts.join(' '), opacity: 0.9, 'pointer-events': 'none' }));
      if (!narrow) svg.appendChild(el('text', { class: 'teal mono small', x: ml + pw + 5, y: cumY(months.length - 1) + 3 }, '$668'));

      // Gliding cumulative-spend jewel dot on curve!
      const cumDot = el('circle', { cx: -20, cy: -20, r: 4, fill: 'var(--bg)', stroke: 'var(--m-teal)', 'stroke-width': 2, 'pointer-events': 'none' });
      svg.appendChild(cumDot);

      // Subtle milestone diamond markers (Chicago HQ Feb '26, LAX Oct '26)
      for (const [ym, col] of [['2026-02', 'var(--m-red)'], ['2026-10', 'var(--m-teal)']]) {
        const mi = months.findIndex(m => m.m === ym);
        if (mi >= 0) {
          const mx = xAt(mi), my = spineY - (months[mi].orders / maxTop) * topH - 7;
          svg.appendChild(el('polygon', { points: `${mx},${my - 3.5} ${mx + 3.5},${my} ${mx},${my + 3.5} ${mx - 3.5},${my}`, fill: col, opacity: 0.85, 'pointer-events': 'none' }));
        }
      }

      // Live inline 17s opt-out annotation right on the Jun 20 spine
      const optLabel = replaySec !== null
        ? (replaySec >= 17 ? '+17.0s · PUSHES: OFF FOREVER' : `Jun 20 ’24 · +${replaySec.toFixed(1)}s after paying…`)
        : (narrow ? 'Opt-out (+17s)' : 'Jun 20 ’24 · 1st meal & +17s opt-out');
      svg.appendChild(el('text', { class: 'red halo small', x: optX + 5, y: mt + 24 }, optLabel));
      if (replaySec !== null) {
        const pulseR = 4 + (replaySec % 1) * 11;
        svg.appendChild(el('circle', { cx: optX.toFixed(1), cy: spineY, r: pulseR.toFixed(1), fill: 'none', stroke: 'var(--m-red)', 'stroke-width': 1.6, opacity: Math.max(0.15, 1 - (replaySec % 1)) }));
      }

      const hit = el('rect', { class: 'hit', x: ml, y: mt, width: pw, height: H - mt - mb });
      const idxFromEvt = e => {
        const r = svg.getBoundingClientRect();
        return clamp(Math.floor(((e.clientX - r.left) * (W / r.width) - ml) / step), 0, months.length - 1);
      };
      hit.addEventListener('pointerdown', e => { stopReplay(); dragState = { start: idxFromEvt(e), moved: false }; hit.setPointerCapture(e.pointerId); });
      hit.addEventListener('pointermove', e => {
        const i = idxFromEvt(e);
        if (dragState) {
          if (i !== dragState.start) dragState.moved = true;
          brush = [Math.min(dragState.start, i), Math.max(dragState.start, i)];
          draw(); return;
        }
        if (!brush && replaySec === null) { hoverIdx = i; updateReadout(); }
      });
      hit.addEventListener('pointerup', e => {
        if (!dragState) return;
        if (!dragState.moved) { brush = null; hoverIdx = idxFromEvt(e); draw(); }
        dragState = null;
      });
      hit.addEventListener('pointercancel', () => { dragState = null; });
      svg.appendChild(hit);

      function updateReadout() {
        if (replaySec !== null) {
          cumDot.setAttribute('cx', xAt(22).toFixed(1)); cumDot.setAttribute('cy', cumY(22).toFixed(1));
          const ev = replaySec < 17 ? '17:38:24 UTC (+0s) · Paid $9.99 at Manhattan kiosk'
            : replaySec < 34 ? '17:38:41 UTC (+17s) · Switched Push Notifications OFF (83 → 0 forever)'
            : '17:39:06 UTC (+42s) · Order-ready ping still fires; 0 marketing pushes ever again';
          setReadout(shell.readout, `<strong>+${replaySec.toFixed(1)}s</strong> · <span class="${replaySec >= 17 ? 'red' : 'blue'}">${ev}</span>`, 'Jun 20, 2024');
          return;
        }
        if (brush) {
          curCol.setAttribute('x', -99); curLine.setAttribute('x1', -99); curLine.setAttribute('x2', -99);
          cumDot.setAttribute('cx', xAt(brush[1]).toFixed(1)); cumDot.setAttribute('cy', cumY(brush[1]).toFixed(1));
          const slice = months.slice(brush[0], brush[1] + 1);
          const totOrd = slice.reduce((a, m) => a + m.orders, 0);
          const totHome = slice.reduce((a, m) => a + m.home_orders, 0);
          const totRoad = slice.reduce((a, m) => a + m.road_orders, 0);
          const totSp = slice.reduce((a, m) => a + m.spend, 0);
          const totDeals = slice.reduce((a, m) => a + m.deals, 0);
          const totPush = slice.reduce((a, m) => a + m.push, 0);
          const totPts = slice.reduce((a, m) => a + m.pts, 0);
          const spanLbl = `${fmtYMShort(months[brush[0]].m)} – ${fmtYMShort(months[brush[1]].m)} (${slice.length} mo)`;
          if (totOrd === 0) {
            setReadout(shell.readout, `<strong>${spanLbl}</strong> · <span class="amber">${totPush} marketing pushes</span>, 0 meals, $0.00`, 'Click chart to clear brush');
          } else {
            setReadout(shell.readout,
              `<strong>${spanLbl}</strong> · <strong>${totOrd} meals</strong> (<span class="blue">${totHome} home</span>, <span class="amber">${totRoad} road</span>) · <span class="teal">${fmtMoney(totSp)}</span>`,
              `Avg ${fmtMoney(totSp / totOrd)} · ${Math.round((totDeals / totOrd) * 100)}% deals · ${fmtInt(totPts)} pts`
            );
          }
          return;
        }
        const m = months[clamp(hoverIdx, 0, months.length - 1)];
        const cx = xAt(hoverIdx);
        curCol.setAttribute('x', (ml + hoverIdx * step).toFixed(1));
        curLine.setAttribute('x1', cx.toFixed(1)); curLine.setAttribute('x2', cx.toFixed(1));
        cumDot.setAttribute('cx', cx.toFixed(1)); cumDot.setAttribute('cy', cumY(hoverIdx).toFixed(1));
        const extra = m.m === '2026-02' ? ' · <span class="red">Chicago Global HQ</span>' : (m.m === '2026-10' ? ' · <span class="teal">LAX MCOPCO (4×)</span>' : '');
        if (hoverIdx < 22) {
          const tag = m.notable && m.notable.length ? ` · <span class="ink">${escHtml((m.notable[0].ver || m.notable[0].name).slice(0, 28))}</span>` : '';
          setReadout(shell.readout, `<strong>${fmtYM(m.m)}</strong> · Dormant (<span class="amber">${m.push} pushes</span>, $0 spent)${tag}`, 'Drag across months to sum any span');
        } else {
          setReadout(shell.readout,
            `<strong>${fmtYM(m.m)}</strong> · <strong>${m.orders} meal${m.orders === 1 ? '' : 's'}</strong> (<span class="blue">${m.home_orders} home</span>, <span class="amber">${m.road_orders} road</span>) · ${fmtMoney(m.spend)}${extra}`,
            `Cumulative: <span class="teal">${fmtMoney(cumSpendM[hoverIdx])}</span> · drag to brush`
          );
        }
      }
      updateReadout();
    }

    function startReplay17() {
      if (replaySec !== null) { stopReplay(); draw(); return; }
      brush = null; hoverIdx = 22; replaySec = 0;
      shell.btns.replay17.textContent = '❚❚ Stop';
      shell.btns.replay17.setAttribute('aria-pressed', 'true');
      let lastTs = performance.now(), latched = false;
      function step(now) {
        if (replaySec === null) return;
        const dt = Math.min(0.08, (now - lastTs) / 1000); lastTs = now;
        const prev = Math.floor(replaySec);
        replaySec += dt * 7.5;
        if (Math.floor(replaySec) !== prev && replaySec < 17) Sound.tick();
        if (!latched && replaySec >= 17) { latched = true; Sound.latch(); }
        if (replaySec >= 43) { stopReplay(); draw(); return; }
        draw();
        replayRaf = requestAnimationFrame(step);
      }
      replayRaf = requestAnimationFrame(step);
    }

    shell.btns.replay17.addEventListener('click', startReplay17);
    bindKeys(shell.stage, d => { stopReplay(); brush = null; hoverIdx = clamp(hoverIdx + d, 0, months.length - 1); draw(); });
    observeWidth(shell.stage, draw);
    draw();

    const ERAS = { dormant: [0, 21], nyc: [22, 28], philly: [29, 40], boston: [41, 51] };
    return {
      setEra(k) { stopReplay(); brush = ERAS[k] ? [...ERAS[k]] : null; draw(); },
      replay17() { startReplay17(); },
    };
  }

  /* ============================================================================
     FIGURE 2 (#mcd-rhythm): Twin Synchronized 24-Hour Watch Dials (Home vs. Road + Linked Mon–Sun)
     ============================================================================ */
  function buildRhythm(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'blue', label: 'Home (45)' },
      { cls: 'amber', label: 'Road (26)' },
      { cls: 'hollow', label: '11p–7a empty (0)' },
    ], [
      { key: 'sweep', label: '▶ Sweep 24h', cls: 'accent', pressed: false },
      { key: 'snd', label: '♪ Sound', pressed: false },
    ]);

    const orders = data.orders;
    let activeHr = 19;    // 0..23 synchronized hand position (starts at 7 pm peak!)
    let lockedWd = null;  // 0..6 weekday cross-filter (null = all days)
    let sweeping = false, soundOn = false, sweepTimer = 0;

    const svg = el('svg', { class: 'mcd-chart' });
    shell.stage.appendChild(svg);

    function stopSweep() {
      sweeping = false; clearInterval(sweepTimer);
      shell.btns.sweep.textContent = '▶ Sweep 24h';
      shell.btns.sweep.setAttribute('aria-pressed', 'false');
    }

    function draw() {
      const W = stageW(shell.stage);
      const stack = W < 540;
      const dialR = stack ? Math.min(82, W * 0.28) : Math.min(96, W * 0.16);
      const rIn = dialR * 0.26;
      const panelPadTop = 40;
      const barOffset = 78;
      const panelBot = barOffset + 22; // weekday labels sit at barOffset + 13
      const cy1 = dialR + panelPadTop;
      const midY = Math.round(cy1 + dialR + panelBot + 10);
      const cy2 = Math.round(midY + dialR + panelPadTop + 6);
      const H = stack ? Math.round(cy2 + dialR + panelBot + 4) : Math.round(cy1 + dialR + panelBot + 6);
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const subset = lockedWd === null ? orders : orders.filter(o => o.local_wd === lockedWd);
      const homeOrds = subset.filter(o => o.is_home);
      const roadOrds = subset.filter(o => !o.is_home);

      // Same radial max scale across BOTH dials so visual area/length is 100% honest 1-to-1!
      const hBins = Array.from({ length: 24 }, () => []);
      const rBins = Array.from({ length: 24 }, () => []);
      homeOrds.forEach(o => hBins[o.local_hour].push(o));
      roadOrds.forEach(o => rBins[o.local_hour].push(o));
      const maxHr = Math.max(4, ...hBins.map(a => a.length), ...rBins.map(a => a.length));

      // Weekday totals (always computed from ALL orders so clicking any day bar works anytime!)
      const wdHomeAll = Array.from({ length: 7 }, (_, w) => orders.filter(o => o.is_home && o.local_wd === w).length);
      const wdRoadAll = Array.from({ length: 7 }, (_, w) => orders.filter(o => !o.is_home && o.local_wd === w).length);
      const maxWd = Math.max(...wdHomeAll, ...wdRoadAll);
      const angOf = hr => (hr / 24) * Math.PI * 2 - Math.PI / 2;

      const drawClockSide = (sideIdx, cx, cy, title, subTag, bins, wdCounts, col, isHome) => {
        // Title above dial
        svg.appendChild(el('text', { class: (isHome ? 'blue ' : 'amber ') + 'title', x: cx, y: cy - dialR - 24, 'text-anchor': 'middle' }, title));

        // Subtle outer bezel & sleep corridor (11 pm .. 7 am)
        svg.appendChild(el('circle', { cx, cy, r: dialR + 5, fill: 'var(--m-paper)', stroke: 'var(--line-2)', 'stroke-width': 1.1 }));
        svg.appendChild(el('circle', { cx, cy, r: dialR, fill: 'var(--bg)', stroke: 'var(--line)', 'stroke-width': 0.85 }));

        const aS0 = angOf(23), aS1 = angOf(31);
        const sx0 = cx + Math.cos(aS0) * dialR, sy0 = cy + Math.sin(aS0) * dialR;
        const sx1 = cx + Math.cos(aS1) * dialR, sy1 = cy + Math.sin(aS1) * dialR;
        svg.appendChild(el('path', {
          d: `M${cx},${cy} L${sx0.toFixed(1)},${sy0.toFixed(1)} A${dialR},${dialR} 0 0 1 ${sx1.toFixed(1)},${sy1.toFixed(1)} Z`,
          fill: 'var(--fg)', opacity: 0.045,
        }));

        // Concentric reference ring (50% of max) + 24 crisp watch ticks
        svg.appendChild(el('circle', { cx, cy, r: (rIn + (dialR - rIn) * 0.5).toFixed(1), fill: 'none', stroke: 'var(--line)', 'stroke-width': 0.7, 'stroke-dasharray': '2.5 2.5' }));
        for (let hr = 0; hr < 24; hr++) {
          const a = angOf(hr), maj = hr % 6 === 0;
          const t0 = dialR - (maj ? 6 : 3), t1 = dialR - 0.5;
          svg.appendChild(el('line', {
            x1: (cx + Math.cos(a) * t0).toFixed(1), y1: (cy + Math.sin(a) * t0).toFixed(1),
            x2: (cx + Math.cos(a) * t1).toFixed(1), y2: (cy + Math.sin(a) * t1).toFixed(1),
            stroke: maj ? 'var(--fg-2)' : 'var(--line-2)', 'stroke-width': maj ? 1.2 : 0.7,
          }));
        }

        // Cardinal clock labels (12a, 6a, 12p, 6p)
        for (const [hr, lbl] of [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p']]) {
          const a = angOf(hr);
          const lx = cx + Math.cos(a) * (dialR + 14), ly = cy + Math.sin(a) * (dialR + 14) + 3.5;
          svg.appendChild(el('text', { class: 'mono small strong', x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': 'middle' }, lbl));
        }

        // 24 radial hour petals (square-root scaled so area tracks volume honestly!)
        const pad = 0.032;
        for (let hr = 0; hr < 24; hr++) {
          const n = bins[hr].length;
          if (!n) continue;
          const a0 = angOf(hr) + pad, a1 = angOf(hr + 1) - pad;
          const rOut = rIn + Math.sqrt(n / maxHr) * (dialR - rIn - 5);
          const p0x = cx + Math.cos(a0) * rIn, p0y = cy + Math.sin(a0) * rIn;
          const p1x = cx + Math.cos(a0) * rOut, p1y = cy + Math.sin(a0) * rOut;
          const p2x = cx + Math.cos(a1) * rOut, p2y = cy + Math.sin(a1) * rOut;
          const p3x = cx + Math.cos(a1) * rIn, p3y = cy + Math.sin(a1) * rIn;
          const isHot = hr === activeHr;
          svg.appendChild(el('path', {
            d: `M${p0x.toFixed(1)},${p0y.toFixed(1)} L${p1x.toFixed(1)},${p1y.toFixed(1)} A${rOut.toFixed(1)},${rOut.toFixed(1)} 0 0 1 ${p2x.toFixed(1)},${p2y.toFixed(1)} L${p3x.toFixed(1)},${p3y.toFixed(1)} A${rIn.toFixed(1)},${rIn.toFixed(1)} 0 0 0 ${p0x.toFixed(1)},${p0y.toFixed(1)} Z`,
            fill: col, opacity: isHot ? 0.98 : 0.68,
            stroke: isHot ? 'var(--fg)' : 'none', 'stroke-width': isHot ? 1.4 : 0,
          }));
        }

        // Synchronized sweeping mechanical clock hand (points to activeHr + 0.5!)
        const hAng = angOf(activeHr + 0.5);
        const hx = cx + Math.cos(hAng) * (dialR - 5), hy = cy + Math.sin(hAng) * (dialR - 5);
        const tx = cx - Math.cos(hAng) * 10, ty = cy - Math.sin(hAng) * 10;
        svg.appendChild(el('line', { x1: tx.toFixed(1), y1: ty.toFixed(1), x2: hx.toFixed(1), y2: hy.toFixed(1), stroke: 'var(--fg)', 'stroke-width': 1.5, 'stroke-linecap': 'round', opacity: 0.72, 'pointer-events': 'none' }));

        // Center hub jewel displaying active-hour count on THIS clock
        const curCnt = bins[activeHr].length;
        svg.appendChild(el('circle', { cx, cy, r: rIn, fill: 'var(--bg)', stroke: curCnt > 0 ? col : 'var(--line-2)', 'stroke-width': curCnt > 0 ? 1.6 : 1 }));
        svg.appendChild(el('text', { class: (curCnt > 0 ? (isHome ? 'blue ' : 'amber ') : '') + 'mono strong', x: cx, y: cy + 4, 'text-anchor': 'middle', style: 'font-size:12px' }, String(curCnt)));

        // Direct pointer interaction across the entire dial (hover or drag sweeps BOTH clock hands!)
        const dialHit = el('circle', { cx, cy, r: dialR + 12, fill: 'transparent', style: 'cursor:pointer' });
        const pickFromEvt = e => {
          const r = svg.getBoundingClientRect();
          const sx = (e.clientX - r.left) * (W / r.width) - cx;
          const sy = (e.clientY - r.top) * (H / r.height) - cy;
          let ang = Math.atan2(sy, sx) + Math.PI / 2;
          if (ang < 0) ang += Math.PI * 2;
          const hr = clamp(Math.floor((ang / (Math.PI * 2)) * 24), 0, 23);
          if (hr !== activeHr) { activeHr = hr; draw(); }
        };
        dialHit.addEventListener('pointermove', e => { if (!sweeping) pickFromEvt(e); });
        dialHit.addEventListener('click', e => { stopSweep(); pickFromEvt(e); });
        svg.appendChild(dialHit);

        // Crisp subtitle badge below dial
        svg.appendChild(el('text', { class: 'small', x: cx, y: cy + dialR + 28, 'text-anchor': 'middle' }, subTag));

        // Linked Mon–Sun clickable weekday cadence strip right beneath each dial!
        const stripW = Math.min(dialR * 2.18, stack ? W - 36 : W * 0.41);
        const sx = cx - stripW / 2;
        const barBase = cy + dialR + barOffset;
        const barMaxH = 26;
        const cellW = stripW / 7;
        const peakWd = wdCounts.indexOf(Math.max(...wdCounts));
        svg.appendChild(el('line', { class: 'axis', x1: sx.toFixed(1), y1: barBase, x2: (sx + stripW).toFixed(1), y2: barBase }));

        WDAYS.forEach((dLbl, wd) => {
          const v = wdCounts[wd];
          const bh = (v / maxWd) * barMaxH;
          const bx = sx + wd * cellW + cellW * 0.16;
          const bw = cellW * 0.68;
          const isLock = lockedWd === wd;
          const dim = lockedWd !== null && !isLock;
          if (v > 0) {
            svg.appendChild(el('rect', {
              x: bx.toFixed(1), y: (barBase - bh).toFixed(1), width: bw.toFixed(1), height: Math.max(2, bh).toFixed(1), rx: 2,
              fill: col, opacity: dim ? 0.18 : (isLock ? 1 : 0.78),
              stroke: isLock ? 'var(--fg)' : 'none', 'stroke-width': isLock ? 1.2 : 0,
            }));
          }
          if ((lockedWd === null && wd === peakWd) || isLock) {
            svg.appendChild(el('text', {
              class: (isHome ? 'blue ' : 'amber ') + 'mono small strong',
              x: (sx + (wd + 0.5) * cellW).toFixed(1), y: (barBase - bh - 4).toFixed(1), 'text-anchor': 'middle',
            }, String(v)));
          }
          svg.appendChild(el('text', {
            class: (isLock ? (isHome ? 'blue ' : 'amber ') + 'strong ' : '') + 'mono small',
            x: (sx + (wd + 0.5) * cellW).toFixed(1), y: barBase + 13, 'text-anchor': 'middle',
          }, dLbl.slice(0, stack && W < 360 ? 2 : 3)));
          const hit = el('rect', { class: 'hit', x: (sx + wd * cellW).toFixed(1), y: barBase - barMaxH - 12, width: cellW.toFixed(1), height: barMaxH + 28 });
          hit.addEventListener('click', () => { stopSweep(); lockedWd = lockedWd === wd ? null : wd; draw(); });
          svg.appendChild(hit);
        });
      };

      const narrowHalf = (stack ? W : W / 2) < 320;
      const homeSub = lockedWd !== null
        ? `${WDAYS[lockedWd]} · ${homeOrds.length} home meal${homeOrds.length === 1 ? '' : 's'}`
        : (narrowHalf ? '6–7 pm: 26 · Breakfasts: 0 · Peak Wed' : '6–7 pm peak: 26 · Breakfasts: 0 · Peak: Wed (13)');
      const roadSub = lockedWd !== null
        ? `${WDAYS[lockedWd]} · ${roadOrds.length} road stop${roadOrds.length === 1 ? '' : 's'}`
        : (narrowHalf ? 'Breakfasts: 4/4 · 11a–12p: 11 · Peak Sun' : 'Breakfasts: 4/4 · 11a–12p: 11 · Peak: Sun (11)');

      if (stack) {
        drawClockSide(0, W / 2, cy1, `Home Clock · ${homeOrds.length} meals`, homeSub, hBins, wdHomeAll, 'var(--m-blue)', true);
        svg.appendChild(el('line', { class: 'grid', x1: 18, y1: midY, x2: W - 18, y2: midY }));
        drawClockSide(1, W / 2, cy2, `Road Clock · ${roadOrds.length} stops`, roadSub, rBins, wdRoadAll, 'var(--m-amber)', false);
      } else {
        // Vertical architectural divider + synchronized hour badge between the two dials
        svg.appendChild(el('line', { class: 'grid', x1: (W / 2).toFixed(1), y1: 16, x2: (W / 2).toFixed(1), y2: H - 14 }));
        if (W >= 620) {
          const bw = 44, bh = 20;
          svg.appendChild(el('rect', { x: (W / 2 - bw / 2).toFixed(1), y: (cy1 - bh / 2).toFixed(1), width: bw, height: bh, rx: 10, fill: 'var(--bg)', stroke: 'var(--line-2)', 'stroke-width': 1 }));
          svg.appendChild(el('text', { class: 'mono small strong ink', x: (W / 2).toFixed(1), y: (cy1 + 3.5).toFixed(1), 'text-anchor': 'middle' }, fmtHr(activeHr)));
        }
        drawClockSide(0, W * 0.25, cy1, `Home Clock · ${homeOrds.length} meals`, homeSub, hBins, wdHomeAll, 'var(--m-blue)', true);
        drawClockSide(1, W * 0.75, cy1, `Road Clock · ${roadOrds.length} stops`, roadSub, rBins, wdRoadAll, 'var(--m-amber)', false);
      }

      const hList = hBins[activeHr], rList = rBins[activeHr];
      const dayTag = lockedWd !== null ? `${WDAYS[lockedWd]} only · ` : '';
      const samples = [...hList, ...rList].slice(0, 2).map(o => `${fmtDateShort(o.date)} ${o.city.split(',')[0]} (${fmtMoney(o.spend)})`).join(' · ');
      setReadout(shell.readout,
        `<strong>${dayTag}${fmtHr(activeHr)}</strong> · <span class="blue">Home: ${hList.length}</span> vs. <span class="amber">Road: ${rList.length}</span>`,
        samples || (activeHr >= 23 || activeHr < 7 ? 'Overnight empty corridor (0 meals 11 pm–7 am)' : 'Click any weekday bar below to filter both dials')
      );
    }

    function startSweep() {
      if (sweeping) { stopSweep(); return; }
      lockedWd = null; sweeping = true; activeHr = 7;
      shell.btns.sweep.textContent = '❚❚ Pause';
      shell.btns.sweep.setAttribute('aria-pressed', 'true');
      draw();
      sweepTimer = setInterval(() => {
        activeHr = (activeHr + 1) % 24;
        if (soundOn) {
          const hc = orders.filter(o => o.is_home && o.local_hour === activeHr).length;
          const rc = orders.filter(o => !o.is_home && o.local_hour === activeHr).length;
          if (hc > 0) Sound.chime(Math.floor(activeHr / 3), false);
          if (rc > 0) Sound.chime(Math.floor(activeHr / 3) + 2, true);
        }
        draw();
        if (activeHr === 23) { stopSweep(); }
      }, reducedMotion ? 340 : 210);
    }

    shell.btns.sweep.addEventListener('click', startSweep);
    shell.btns.snd.addEventListener('click', () => {
      soundOn = !soundOn;
      shell.btns.snd.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      shell.btns.snd.textContent = soundOn ? '♪ Sound ON' : '♪ Sound';
      if (soundOn) Sound.chime(4);
    });
    bindKeys(shell.stage, d => { stopSweep(); activeHr = (activeHr + d + 24) % 24; draw(); });
    observeWidth(shell.stage, draw);
    draw();

    return {
      filterWeekday(wd, focusHr) { stopSweep(); lockedWd = wd; if (focusHr !== undefined) activeHr = focusHr; draw(); },
      startSweep() { soundOn = true; shell.btns.snd.setAttribute('aria-pressed', 'true'); shell.btns.snd.textContent = '♪ Sound ON'; if (!sweeping) startSweep(); },
    };
  }

  /* ============================================================================
     FIGURE 3 (#mcd-atlas): Draggable 3D USA Road-Trip Atlas + Live Hop Distance Badge
     ============================================================================ */
  const US_OUTLINE = [
    [-124.7, 48.4], [-122.4, 49.0], [-117.0, 49.0], [-104.0, 49.0], [-95.2, 49.0],
    [-95.0, 48.6], [-89.5, 48.0], [-84.8, 46.5], [-82.5, 45.8], [-82.4, 43.0],
    [-83.0, 42.3], [-80.5, 42.0], [-79.0, 43.2], [-76.2, 44.0], [-74.8, 45.0],
    [-71.5, 45.0], [-70.2, 45.9], [-69.2, 47.4], [-67.8, 47.0], [-67.0, 44.9],
    [-68.2, 44.3], [-70.3, 43.6], [-70.8, 42.4], [-69.9, 41.7], [-71.5, 41.3],
    [-73.7, 40.9], [-74.0, 40.5], [-74.9, 38.9], [-75.5, 39.6], [-75.1, 38.5],
    [-76.0, 36.9], [-75.5, 35.2], [-78.0, 33.9], [-80.8, 32.1], [-81.4, 30.7],
    [-80.1, 26.0], [-80.4, 25.2], [-81.8, 25.9], [-82.7, 27.9], [-84.0, 30.0],
    [-87.5, 30.3], [-89.4, 29.2], [-91.2, 29.5], [-93.8, 29.7], [-95.2, 29.0],
    [-97.2, 27.8], [-97.2, 25.9], [-99.5, 27.5], [-101.4, 29.7], [-103.3, 29.0],
    [-106.5, 31.8], [-111.0, 31.3], [-114.8, 32.7], [-117.1, 32.5], [-118.4, 33.8],
    [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-124.2, 40.5], [-124.5, 42.8],
    [-124.0, 46.2], [-124.7, 48.4],
  ];
  const GREAT_LAKES = [
    [[-92.1, 46.8], [-90.0, 47.9], [-85.0, 47.5], [-84.6, 46.5], [-87.5, 46.5], [-92.1, 46.8]],
    [[-87.8, 41.7], [-87.9, 44.8], [-85.0, 45.8], [-85.8, 43.2], [-86.8, 41.7], [-87.8, 41.7]],
  ];
  const US_REGIONS = [
    [[-104.0, 49.0], [-104.0, 32.0]],
    [[-95.2, 49.0], [-94.6, 36.5], [-94.0, 29.7]],
    [[-82.5, 42.0], [-82.0, 36.5], [-81.0, 32.1]],
  ];

  function buildAtlas(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'blue', label: 'Franchise (35)' },
      { cls: 'teal', label: 'LAX MCOPCO' },
      { cls: 'red', label: 'HQ / IP ghosts' },
    ], [
      { key: 'play', label: '▶ Play 23,812 mi', cls: 'accent', pressed: false },
      { key: 'ghosts', label: 'IP ghosts (13/33)', cls: 'red-act', pressed: false },
      { key: 'snd', label: '♪ Sound', pressed: false },
    ]);

    const locs = data.locations, orders = data.orders, trips = data.trips;
    const wrongArcs = data.mixpanel_orders.filter(m => m.wrong_state);

    let showGhosts = false, soundOn = false, scrubMax = orders.length, playing = false, playTimer = 0;
    let hoveredLoc = null, lockedLoc = null, hoveredArc = null, hitLocs = [], hitArcs = [];

    const toPlane = (lon, lat) => [((lon + 96.2) / 29.0) * 1.18, ((38.6 - lat) / 14.5) * 0.68];

    const stage3d = makeCanvas3D(
      shell.stage, 410, { yaw: -0.20, pitch: 0.78, dist: 2.38 },
      (ctx, cw, ch, project, th, mx, my, pulse) => {
        hitLocs = []; hitArcs = [];
        ctx.save();
        ctx.strokeStyle = rgba(th.line, 0.55); ctx.lineWidth = 0.7;
        for (const lon of [-120, -110, -100, -90, -80, -70]) {
          const [x0, z0] = toPlane(lon, 25), [x1, z1] = toPlane(lon, 49);
          const p0 = project(x0, 0, z0), p1 = project(x1, 0, z1);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        for (const lat of [30, 35, 40, 45]) {
          const [x0, z0] = toPlane(-124, lat), [x1, z1] = toPlane(-67, lat);
          const p0 = project(x0, 0, z0), p1 = project(x1, 0, z1);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        ctx.beginPath();
        US_OUTLINE.forEach(([lon, lat], i) => { const [x, z] = toPlane(lon, lat); const p = project(x, -0.032, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.closePath(); ctx.fillStyle = th.dark ? 'rgba(0,0,0,0.45)' : 'rgba(24,24,23,0.07)'; ctx.fill();

        ctx.beginPath();
        US_OUTLINE.forEach(([lon, lat], i) => { const [x, z] = toPlane(lon, lat); const p = project(x, 0, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.closePath(); ctx.fillStyle = th.dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.88)'; ctx.fill();
        ctx.strokeStyle = rgba(th.line2, 0.95); ctx.lineWidth = 1.25; ctx.stroke();

        ctx.strokeStyle = rgba(th.line, 0.72); ctx.lineWidth = 0.7;
        for (const seg of US_REGIONS) { ctx.beginPath(); seg.forEach(([lon, lat], i) => { const [x, z] = toPlane(lon, lat); const p = project(x, 0, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke(); }
        ctx.strokeStyle = rgba(th.line2, 0.62); ctx.lineWidth = 0.85;
        for (const lake of GREAT_LAKES) { ctx.beginPath(); lake.forEach(([lon, lat], i) => { const [x, z] = toPlane(lon, lat); const p = project(x, 0, z); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke(); }

        const visibleOrders = orders.slice(0, scrubMax);
        const focusCity = (hoveredLoc || lockedLoc)?.city || null;
        const visitCounts = new Map();
        for (const o of visibleOrders) { const k = `${o.city}|${o.state}`; visitCounts.set(k, (visitCounts.get(k) || 0) + 1); }

        let activeHopApex = null, activeHopMi = 0;
        for (let i = 1; i < visibleOrders.length; i++) {
          const a = visibleOrders[i - 1], b = visibleOrders[i];
          if (a.city === b.city && a.state === b.state) continue;
          const [ax, az] = toPlane(a.lon, a.lat), [bx, bz] = toPlane(b.lon, b.lat);
          const peak = Math.min(0.42, 0.07 + Math.hypot(bx - ax, bz - az) * 0.22);
          ctx.beginPath();
          let midP = null;
          for (let s = 0; s <= 18; s++) {
            const t = s / 18;
            const pr = project(lerp(ax, bx, t), Math.sin(t * Math.PI) * peak, lerp(az, bz, t));
            if (s === 0) ctx.moveTo(pr.x, pr.y); else ctx.lineTo(pr.x, pr.y);
            if (s === 9) midP = pr;
          }
          const touches = focusCity && (a.city === focusCity || b.city === focusCity);
          const isLatest = i === visibleOrders.length - 1;
          const isRecent = i >= visibleOrders.length - 3;
          ctx.strokeStyle = rgba(th.blue, isLatest && scrubMax < orders.length ? 0.92 : (touches ? 0.78 : (focusCity ? 0.09 : (isRecent ? 0.62 : 0.22))));
          ctx.lineWidth = (isLatest && scrubMax < orders.length) ? 2.4 : (touches || isRecent ? 1.8 : 0.95);
          ctx.stroke();
          if (isLatest && scrubMax < orders.length && b.hop_mi >= 120 && midP) { activeHopApex = midP; activeHopMi = b.hop_mi; }
        }
        if (activeHopApex) {
          const ht = `+${fmtInt(activeHopMi)} mi`;
          ctx.font = `600 10px ${th.mono}`; ctx.textAlign = 'center';
          ctx.lineWidth = 3.8; ctx.strokeStyle = th.bg; ctx.strokeText(ht, activeHopApex.x, activeHopApex.y - 7);
          ctx.fillStyle = th.blue; ctx.fillText(ht, activeHopApex.x, activeHopApex.y - 7);
        }

        if (showGhosts) {
          const activeIds = new Set(visibleOrders.map(o => o.idx));
          for (const arc of wrongArcs) {
            if (!activeIds.has(arc.idx)) continue;
            const [ax, az] = toPlane(arc.lon, arc.lat), [bx, bz] = toPlane(arc.ip_lon, arc.ip_lat);
            const peak = Math.min(0.62, 0.13 + Math.hypot(bx - ax, bz - az) * 0.30);
            const isHot = hoveredArc && hoveredArc.idx === arc.idx, isSD = arc.err_mi > 2000;
            ctx.beginPath(); let midScreen = null;
            for (let s = 0; s <= 28; s++) {
              const t = s / 28, pr = project(lerp(ax, bx, t), Math.sin(t * Math.PI) * peak, lerp(az, bz, t));
              if (s === 0) ctx.moveTo(pr.x, pr.y); else ctx.lineTo(pr.x, pr.y);
              if (s === 14) midScreen = pr;
            }
            ctx.setLineDash(isHot || isSD ? [] : [3.5, 3]);
            ctx.strokeStyle = rgba(isSD ? th.red : th.amber, isHot ? 1 : (isSD ? 0.88 : 0.62));
            ctx.lineWidth = isHot ? 2.8 : (isSD ? 2.2 : 1.3); ctx.stroke(); ctx.setLineDash([]);
            if (isSD) {
              const tp = (pulse % 1 + 1) % 1, bp = project(lerp(ax, bx, tp), Math.sin(tp * Math.PI) * peak, lerp(az, bz, tp));
              ctx.beginPath(); ctx.arc(bp.x, bp.y, 4.0, 0, Math.PI * 2); ctx.fillStyle = th.red; ctx.fill();
              ctx.beginPath(); ctx.arc(bp.x, bp.y, 8.5, 0, Math.PI * 2); ctx.strokeStyle = rgba(th.red, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
            }
            const dest = project(bx, 0, bz);
            ctx.beginPath(); ctx.arc(dest.x, dest.y, isSD ? 5.0 : 3.4, 0, Math.PI * 2);
            ctx.fillStyle = th.bg; ctx.fill(); ctx.strokeStyle = isSD ? th.red : th.amber; ctx.lineWidth = 1.7; ctx.stroke();
            if (midScreen) hitArcs.push({ arc, x: midScreen.x, y: midScreen.y, dx: dest.x, dy: dest.y });
            if (isSD && dest.x > 0 && dest.x < cw && dest.y > 0 && dest.y < ch) {
              const sdTxt = cw < 440 ? 'San Diego IP (2,579 mi)' : 'San Diego IP (2,579 mi error)';
              ctx.font = `600 10.5px ${th.sans}`; const tw = ctx.measureText(sdTxt).width;
              const lx = clamp(dest.x + 12, tw / 2 + 8, cw - tw / 2 - 8), ly = clamp(dest.y + 16, 14, ch - 10);
              ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = th.bg; ctx.strokeText(sdTxt, lx, ly);
              ctx.fillStyle = th.red; ctx.fillText(sdTxt, lx, ly);
            }
          }
        }

        const latestStopCity = visibleOrders[visibleOrders.length - 1]?.city;
        const pillars = locs.map(loc => {
          const [px, pz] = toPlane(loc.lon, loc.lat);
          const v = visitCounts.get(`${loc.city}|${loc.state}`) || 0;
          return { loc, v, base: project(px, 0, pz), top: project(px, v > 0 ? (0.055 + Math.sqrt(v) * 0.115) : 0, pz) };
        }).filter(p => p.v > 0).sort((a, b) => b.base.z - a.base.z);

        for (const p of pillars) {
          const isHot = focusCity === p.loc.city || (scrubMax < orders.length && p.loc.city === latestStopCity);
          const col = p.loc.is_mcopco ? th.teal : (p.loc.city.includes('Global HQ') ? th.red : th.blue);
          const half = clamp(2.2 + Math.sqrt(p.v) * 0.65, 2.5, 4.6) * (isHot ? 1.28 : 1);
          if (isHot) {
            ctx.beginPath(); ctx.ellipse(p.base.x, p.base.y, half * 3.1, half * 1.5, 0, 0, Math.PI * 2);
            ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1.2; ctx.stroke();
          }
          ctx.beginPath(); ctx.ellipse(p.base.x, p.base.y, half * 2.1, half * 1.0, 0, 0, Math.PI * 2);
          ctx.fillStyle = rgba(col, isHot ? 0.34 : 0.15); ctx.fill();
          ctx.beginPath(); ctx.moveTo(p.base.x - half, p.base.y); ctx.lineTo(p.base.x, p.base.y + half * 0.45);
          ctx.lineTo(p.top.x, p.top.y + half * 0.45); ctx.lineTo(p.top.x - half, p.top.y); ctx.closePath();
          ctx.fillStyle = rgba(col, isHot ? 0.96 : 0.84); ctx.fill();
          ctx.beginPath(); ctx.moveTo(p.base.x, p.base.y + half * 0.45); ctx.lineTo(p.base.x + half, p.base.y);
          ctx.lineTo(p.top.x + half, p.top.y); ctx.lineTo(p.top.x, p.top.y + half * 0.45); ctx.closePath();
          ctx.fillStyle = rgba(col, isHot ? 0.72 : 0.56); ctx.fill();
          ctx.beginPath(); ctx.moveTo(p.top.x, p.top.y - half * 0.45); ctx.lineTo(p.top.x + half, p.top.y);
          ctx.lineTo(p.top.x, p.top.y + half * 0.45); ctx.lineTo(p.top.x - half, p.top.y); ctx.closePath();
          ctx.fillStyle = th.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = isHot ? 2 : 1.4; ctx.stroke();
          hitLocs.push({ loc: p.loc, v: p.v, x: p.top.x, y: p.top.y, bx: p.base.x, by: p.base.y });
        }

        const anchors = new Set(cw < 440
          ? ['Greater Boston, MA', 'Philadelphia, PA', 'Chicago Global HQ, IL', 'Houston (NASA Pkwy), TX', 'Los Angeles (LAX), CA']
          : ['Greater Boston, MA', 'Philadelphia, PA', 'Chicago Global HQ, IL', 'Houston (NASA Pkwy), TX', 'Douglas, WY', 'Los Angeles (LAX), CA']);
        const placedBoxes = [];
        ctx.font = `500 ${cw < 440 ? 9.5 : 10.5}px ${th.sans}`;
        for (const p of pillars) {
          const isHot = focusCity === p.loc.city;
          if (!anchors.has(p.loc.city) && !isHot) continue;
          if (p.top.x < -10 || p.top.x > cw + 10 || p.top.y < 10 || p.top.y > ch - 10) continue;
          const shortName = p.loc.city.replace('Greater Boston, MA', `Boston (${p.v})`).replace('Philadelphia, PA', `Philly (${p.v})`)
            .replace('Chicago Global HQ, IL', 'Chicago HQ').replace('Houston (NASA Pkwy), TX', 'Houston')
            .replace('Douglas, WY', 'Wyoming').replace('Los Angeles (LAX), CA', cw < 440 ? 'LAX' : 'LAX (MCOPCO)');
          const tw = ctx.measureText(shortName).width;
          let lx = p.top.x, ly = p.top.y - 10;
          if (p.loc.city.includes('Philadelphia')) { lx = p.top.x - tw * 0.5 - 12; ly = p.top.y + 3; }
          lx = clamp(lx, tw / 2 + 8, cw - tw / 2 - 8); ly = clamp(ly, 14, ch - 10);
          const box = { x0: lx - tw / 2 - 2, x1: lx + tw / 2 + 2, y0: ly - 10, y1: ly + 3 };
          if (!isHot && placedBoxes.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
          placedBoxes.push(box);
          ctx.textAlign = 'center'; ctx.lineWidth = 3.8; ctx.strokeStyle = th.bg; ctx.strokeText(shortName, lx, ly);
          ctx.fillStyle = p.loc.is_mcopco ? th.teal : (p.loc.city.includes('Global HQ') ? th.red : th.fg);
          ctx.fillText(shortName, lx, ly);
        }
        ctx.restore();
      },
      (mx, my) => {
        if (mx < 0) { hoveredLoc = null; hoveredArc = null; updateReadout(); return; }
        let bestL = null, bd = 22;
        for (const hl of hitLocs) { const d = Math.min(Math.hypot(mx - hl.x, my - hl.y), Math.hypot(mx - hl.bx, my - hl.by)); if (d < bd) { bd = d; bestL = hl.loc; } }
        if (bestL) { hoveredLoc = bestL; hoveredArc = null; updateReadout(); return; }
        let bestA = null, bda = 22;
        for (const ha of hitArcs) { const d = Math.min(Math.hypot(mx - ha.x, my - ha.y), Math.hypot(mx - ha.dx, my - ha.dy)); if (d < bda) { bda = d; bestA = ha.arc; } }
        hoveredLoc = null; hoveredArc = bestA; updateReadout();
      },
      (cx, cy) => {
        let bestL = null, bd = 24;
        for (const hl of hitLocs) { const d = Math.min(Math.hypot(cx - hl.x, cy - hl.y), Math.hypot(cx - hl.bx, cy - hl.by)); if (d < bd) { bd = d; bestL = hl.loc; } }
        lockedLoc = (bestL && lockedLoc && lockedLoc.city === bestL.city) ? null : bestL;
        updateReadout();
      },
      'drag to orbit 3D US map · click any city prism to isolate routes'
    );

    if (!reducedMotion) {
      let ph = 0.25;
      setInterval(() => { if (showGhosts && !document.hidden) { ph = (ph + 0.015) % 1; stage3d.setPulse(ph); } }, 65);
    }

    const scRow = h('div', 'mcd-scrub-row');
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = 1; slider.max = orders.length; slider.value = orders.length;
    slider.setAttribute('aria-label', 'Scrub 71 stops chronologically');
    const odoLbl = h('span', '', '');
    scRow.append(slider, odoLbl);
    shell.stage.appendChild(scRow);

    function updateReadout() {
      const vis = orders.slice(0, scrubMax), o = vis[vis.length - 1];
      const stCnt = new Set(vis.map(x => x.state)).size;
      odoLbl.textContent = `${scrubMax}/71 · ${fmtInt(o.cum_mi)} mi · ${stCnt}/15 states · ${fmtMoney(o.cum_spend)}`;
      if (hoveredArc) {
        setReadout(shell.readout, `<strong>${fmtDate(hoveredArc.date)}</strong> · Kiosk: ${escHtml(hoveredArc.city)} → <span class="red">Mixpanel IP: ${escHtml(hoveredArc.ip_label)}</span>`, `<span class="red">${fmtInt(hoveredArc.err_mi)} miles off</span>`);
        return;
      }
      const loc = hoveredLoc || lockedLoc;
      if (loc) {
        const note = loc.note ? ` · <span class="ink">${escHtml(loc.note)}</span>` : '';
        setReadout(shell.readout, `<strong>${escHtml(loc.city)}</strong> · ${loc.visits} visit${loc.visits === 1 ? '' : 's'} (${fmtMoney(loc.spend)})${note}`, `${loc.first.slice(0, 7)} → ${loc.last.slice(0, 7)}`);
        return;
      }
      if (showGhosts) {
        setReadout(shell.readout, '<strong>Mixpanel IP Ghosts ON</strong> · Carrier IPs guessed the <span class="red">wrong state 13 of 33 times (39.4%)</span>', 'Worst miss: Boston → San Diego (2,579 mi)');
      } else {
        setReadout(shell.readout, `<strong>Stop #${o.idx}: ${escHtml(o.city)}</strong> (${fmtDate(o.date)} · ${fmtMoney(o.spend)})`, `${fmtInt(o.cum_mi)} miles across ${stCnt} states`);
      }
    }

    function stopPlay() { playing = false; clearInterval(playTimer); shell.btns.play.textContent = '▶ Play 23,812 mi'; shell.btns.play.setAttribute('aria-pressed', 'false'); }
    slider.addEventListener('input', () => { stopPlay(); scrubMax = parseInt(slider.value, 10); updateReadout(); stage3d.render(); });
    shell.btns.ghosts.addEventListener('click', () => { showGhosts = !showGhosts; shell.btns.ghosts.setAttribute('aria-pressed', showGhosts ? 'true' : 'false'); updateReadout(); stage3d.render(); });
    shell.btns.snd.addEventListener('click', () => { soundOn = !soundOn; shell.btns.snd.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); shell.btns.snd.textContent = soundOn ? '♪ Sound ON' : '♪ Sound'; if (soundOn) Sound.chime(4); });
    shell.btns.play.addEventListener('click', () => {
      if (playing) { stopPlay(); return; }
      lockedLoc = null; playing = true; scrubMax = 1; slider.value = 1;
      shell.btns.play.textContent = '❚❚ Pause'; shell.btns.play.setAttribute('aria-pressed', 'true');
      playTimer = setInterval(() => {
        scrubMax += 1;
        if (soundOn) Sound.chime(scrubMax, !orders[scrubMax - 1].is_home);
        if (scrubMax >= orders.length) { scrubMax = orders.length; slider.value = scrubMax; updateReadout(); stage3d.render(); stopPlay(); return; }
        slider.value = scrubMax; updateReadout(); stage3d.render();
      }, reducedMotion ? 160 : 88);
    });
    updateReadout();

    return {
      focusTrip(key) {
        stopPlay(); scrubMax = orders.length; slider.value = scrubMax; showGhosts = false; shell.btns.ghosts.setAttribute('aria-pressed', 'false');
        const tr = trips.find(t => t.key === key);
        if (tr) {
          stage3d.flyTo(tr.yaw, tr.pitch, tr.dist, tr.cx, tr.cz);
          lockedLoc = locs.find(l => tr.cities.includes(l.city)) || null;
          setReadout(shell.readout, `<strong>${escHtml(tr.title)}</strong> · ${escHtml(tr.story)}`, escHtml(tr.dates));
        }
      },
      focusGhosts() { stopPlay(); scrubMax = orders.length; slider.value = scrubMax; showGhosts = true; lockedLoc = null; shell.btns.ghosts.setAttribute('aria-pressed', 'true'); stage3d.flyTo(-0.20, 0.78, 2.38, 0, 0); updateReadout(); },
      startPlay() { if (!playing) shell.btns.play.click(); },
    };
  }

  /* ============================================================================
     FIGURE 4 (#mcd-menu): Wide Interactive Architectural Serving Tray
     ============================================================================ */
  function buildMenu(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'blue', label: 'Core quartet' },
      { cls: 'teal', label: '$5 Meal pair (16:16)' },
      { cls: 'amber', label: 'Breakfast & rare' },
      { cls: 'red', label: 'Hidden fees (17×)' },
    ], [
      { key: 'd365', label: '365d', cls: 'accent', pressed: true },
      { key: 'd90', label: '90d', pressed: false },
      { key: 'd30', label: '30d', pressed: false },
    ]);

    const cats = data.menu.categories;
    const catByName = new Map(cats.map(c => [c.name, c]));
    const TRAY_ORDER = [
      'Carbonated Soft Drinks', 'McDonalds French Fries', 'McDoubles', 'Cross Menu Product Bundles',
      'Chicken McNuggets', 'Dips / Sauces', 'McFlurries', 'McMuffins', 'Hash Browns', 'McPops', 'Restaurant Operations',
    ];
    let winKey = 'd365', selectedCat = 'Chicken McNuggets';

    const svg = el('svg', { class: 'mcd-chart' });
    shell.stage.appendChild(svg);

    const PAIRS = {
      'Chicken McNuggets': 'Dips / Sauces', 'Dips / Sauces': 'Chicken McNuggets',
      'McDoubles': 'Cross Menu Product Bundles', 'Cross Menu Product Bundles': 'McDoubles',
      'McMuffins': 'Hash Browns', 'Hash Browns': 'McMuffins',
    };

    function draw() {
      const W = stageW(shell.stage), narrow = W < 540;
      const vw = narrow ? 390 : 680, vh = narrow ? 354 : 346;
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);

      svg.appendChild(el('rect', { x: 8, y: 8, width: vw - 16, height: vh - 16, rx: 18, fill: 'var(--bg)', stroke: 'var(--line-2)', 'stroke-width': 1.5 }));
      svg.appendChild(el('rect', { x: 20, y: 20, width: vw - 40, height: vh - 40, rx: 10, fill: 'var(--m-paper)', stroke: 'var(--line)', 'stroke-dasharray': '4 3' }));

      svg.appendChild(el('text', { class: 'mono small', x: 32, y: 36 }, `MY ${winKey.slice(1)}-DAY SERVING TRAY · CLICK ANY ITEM`));
      if (!narrow) svg.appendChild(el('text', { class: 'mono small', x: vw - 32, y: 36, 'text-anchor': 'end' }, 'AVG 3.3 ITEMS / ORDER · 73.1% MARGIN'));

      const maxWin = winKey === 'd365' ? 29 : winKey === 'd90' ? 10 : 2;
      const pos = narrow ? {
        drink: [68, 86], fries: [152, 86], mcdouble: [242, 86], bundle: [324, 86],
        nuggets: [96, 182], dips: [222, 182], mcflurry: [324, 182],
        mcmuffin: [68, 278], hashbrown: [162, 278], mcpops: [248, 278], ops: [326, 278],
      } : {
        drink: [98, 88], fries: [236, 88], mcdouble: [404, 88], bundle: [568, 88],
        nuggets: [152, 184], dips: [352, 184], mcflurry: [552, 184],
        mcmuffin: [98, 278], hashbrown: [256, 278], mcpops: [426, 278], ops: [576, 278],
      };

      const pairedWith = PAIRS[selectedCat] || null;
      const hasPairFocus = pairedWith !== null;
      const tether = (a, b, lbl, col, active) => {
        const pad = narrow ? 22 : 31;
        const pw = narrow ? 34 : 40;
        svg.appendChild(el('line', { x1: a[0] + pad, y1: a[1], x2: b[0] - pad, y2: b[1], stroke: col, 'stroke-width': active ? 2.2 : 1.3, 'stroke-dasharray': '4 3', opacity: active ? 0.96 : 0.38 }));
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        svg.appendChild(el('rect', { x: mx - pw / 2, y: my - 8, width: pw, height: 16, rx: 8, fill: 'var(--bg)', stroke: col, 'stroke-width': active ? 1.5 : 0.9 }));
        svg.appendChild(el('text', { class: 'mono small', x: mx, y: my + 3, 'text-anchor': 'middle', style: `fill:${col};font-size:9px;font-weight:600` }, lbl));
      };
      tether(pos.nuggets, pos.dips, `${catByName.get('Chicken McNuggets')[winKey]}:${catByName.get('Dips / Sauces')[winKey]}`, 'var(--m-blue)', selectedCat === 'Chicken McNuggets' || selectedCat === 'Dips / Sauces');
      tether(pos.mcdouble, pos.bundle, `${catByName.get('McDoubles')[winKey]}:${catByName.get('Cross Menu Product Bundles')[winKey]}`, 'var(--m-teal)', selectedCat === 'McDoubles' || selectedCat === 'Cross Menu Product Bundles');
      tether(pos.mcmuffin, pos.hashbrown, `${catByName.get('McMuffins')[winKey]}:${catByName.get('Hash Browns')[winKey]}`, 'var(--m-amber)', selectedCat === 'McMuffins' || selectedCat === 'Hash Browns');

      const addItem = (catName, xy, col, drawIcon, shortLbl) => {
        const c = catByName.get(catName) || { d365: 0, d90: 0, d30: 0 };
        const val = c[winKey];
        const sel = selectedCat === catName;
        const isPair = pairedWith === catName;
        const baseR = narrow ? 18 : 22;
        const r = baseR + (val > 0 ? Math.sqrt(val / maxWin) * (narrow ? 4 : 7) : -2);
        const dim = (val === 0 && !sel) ? 0.34 : (hasPairFocus && !sel && !isPair ? 0.62 : 1);
        const g = el('g', {
          class: 'mcd-tray-item',
          transform: `translate(${xy[0]},${xy[1]}) scale(${sel ? 1.09 : 1})`,
          opacity: dim,
        });
        // Subtle architectural plate drop shadow
        g.appendChild(el('circle', { cx: 0, cy: 2.5, r: r.toFixed(1), fill: 'var(--fg)', opacity: sel ? 0.08 : 0.035 }));
        g.appendChild(el('circle', { cx: 0, cy: 0, r: r.toFixed(1), fill: sel ? col : 'var(--bg)', 'fill-opacity': sel ? 0.13 : 0.9, stroke: sel || isPair ? col : 'var(--line)', 'stroke-width': sel ? 2 : (isPair ? 1.5 : 0.9) }));

        const frac = clamp(val / maxWin, 0, 0.999);
        if (frac > 0.01) {
          const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2;
          const x0 = Math.cos(a0) * (r + 3), y0 = Math.sin(a0) * (r + 3);
          const x1 = Math.cos(a1) * (r + 3), y1 = Math.sin(a1) * (r + 3);
          g.appendChild(el('path', {
            d: `M${x0.toFixed(1)},${y0.toFixed(1)} A${(r + 3).toFixed(1)},${(r + 3).toFixed(1)} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`,
            fill: 'none', stroke: col, 'stroke-width': sel ? 2.8 : 2, 'stroke-linecap': 'round', opacity: sel ? 1 : 0.72,
          }));
        }
        drawIcon(g, col);
        g.appendChild(el('text', { class: 'small strong halo', x: 0, y: (r + 14).toFixed(1), 'text-anchor': 'middle', style: sel ? `fill:${col}` : '' }, `${shortLbl} (${val})`));
        g.addEventListener('click', () => { selectedCat = catName; draw(); });
        g.addEventListener('pointerenter', () => { selectedCat = catName; draw(); });
        svg.appendChild(g);
      };

      addItem('Carbonated Soft Drinks', pos.drink, 'var(--m-blue)', (g, col) => {
        g.appendChild(el('path', { d: 'M-10,-11 L10,-11 L7.5,14 L-7.5,14 Z', fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-width': 1.6 }));
        g.appendChild(el('line', { x1: -12, y1: -11, x2: 12, y2: -11, stroke: col, 'stroke-width': 2 }));
        g.appendChild(el('path', { d: 'M2,-11 L5,-21 L11,-22', fill: 'none', stroke: col, 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
      }, 'Drinks');

      addItem('McDonalds French Fries', pos.fries, 'var(--m-blue)', (g, col) => {
        for (const fx of [-8, -4, 0, 4, 8]) g.appendChild(el('rect', { x: fx - 1.5, y: -18 + Math.abs(fx) * 0.4, width: 3, height: 14, rx: 1, fill: 'var(--m-amber)', opacity: 0.88 }));
        g.appendChild(el('path', { d: 'M-12,-6 Q0,-1 12,-6 L9,14 L-9,14 Z', fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-width': 1.6 }));
      }, 'Fries');

      addItem('McDoubles', pos.mcdouble, 'var(--m-teal)', (g, col) => {
        g.appendChild(el('path', { d: 'M-14,-2 A14,10 0 0 1 14,-2 Z', fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 1.5 }));
        g.appendChild(el('rect', { x: -15, y: 0, width: 30, height: 4, rx: 2, fill: 'var(--m-amber)', opacity: 0.85 }));
        g.appendChild(el('rect', { x: -15, y: 5.5, width: 30, height: 4, rx: 2, fill: col, opacity: 0.7 }));
        g.appendChild(el('rect', { x: -13, y: 11, width: 26, height: 4.5, rx: 2, fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-width': 1.3 }));
      }, 'McDoubles');

      addItem('Cross Menu Product Bundles', pos.bundle, 'var(--m-teal)', (g, col) => {
        g.appendChild(el('rect', { x: -14, y: -12, width: 28, height: 24, rx: 5, fill: col, 'fill-opacity': 0.16, stroke: col, 'stroke-width': 1.6, 'stroke-dasharray': '3 2' }));
        g.appendChild(el('text', { class: 'mono strong', x: 0, y: 4, 'text-anchor': 'middle', style: `fill:${col};font-size:12px` }, '$5'));
      }, 'Bundles');

      addItem('Chicken McNuggets', pos.nuggets, 'var(--m-blue)', (g, col) => {
        g.appendChild(el('rect', { x: -15, y: -11, width: 30, height: 22, rx: 4, fill: col, 'fill-opacity': 0.2, stroke: col, 'stroke-width': 1.6 }));
        for (const [nx, ny] of [[-6, -4], [4, -4], [-4, 4.5], [6, 4]]) g.appendChild(el('ellipse', { cx: nx, cy: ny, rx: 4.2, ry: 3, fill: 'var(--m-amber)', opacity: 0.85 }));
      }, 'McNuggets');

      addItem('Dips / Sauces', pos.dips, 'var(--m-blue)', (g, col) => {
        g.appendChild(el('path', { d: 'M-12,-6 L12,-6 L9,9 L-9,9 Z', fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 1.6 }));
        g.appendChild(el('ellipse', { cx: 0, cy: -6, rx: 12, ry: 3.8, fill: 'var(--m-amber)', opacity: 0.72, stroke: col, 'stroke-width': 1.2 }));
      }, 'Dips');

      addItem('McFlurries', pos.mcflurry, 'var(--m-amber)', (g, col) => {
        g.appendChild(el('path', { d: 'M-9,-7 L9,-7 L7,13 L-7,13 Z', fill: col, 'fill-opacity': 0.2, stroke: col, 'stroke-width': 1.5 }));
        g.appendChild(el('path', { d: 'M-8,-7 C-5,-16 5,-16 8,-7', fill: 'none', stroke: col, 'stroke-width': 1.8 }));
        g.appendChild(el('line', { x1: 3, y1: -18, x2: 1, y2: 9, stroke: 'var(--fg)', 'stroke-width': 1.6 }));
      }, 'McFlurry');

      addItem('McMuffins', pos.mcmuffin, 'var(--m-amber)', (g, col) => {
        g.appendChild(el('circle', { cx: 0, cy: 0, r: 11, fill: col, 'fill-opacity': 0.2, stroke: col, 'stroke-width': 1.5 }));
        g.appendChild(el('circle', { cx: 0, cy: 0, r: 4.5, fill: 'var(--m-amber)', opacity: 0.9 }));
      }, 'McMuffin');

      addItem('Hash Browns', pos.hashbrown, 'var(--m-amber)', (g, col) => {
        g.appendChild(el('rect', { x: -12, y: -8, width: 24, height: 16, rx: 5, fill: col, 'fill-opacity': 0.24, stroke: col, 'stroke-width': 1.5 }));
        g.appendChild(el('line', { x1: -6, y1: -2, x2: 6, y2: -2, stroke: col, 'stroke-width': 1.2 }));
        g.appendChild(el('line', { x1: -4, y1: 3, x2: 4, y2: 3, stroke: col, 'stroke-width': 1.2 }));
      }, 'Hash Brown');

      addItem('McPops', pos.mcpops, 'var(--m-amber)', (g, col) => {
        for (const [px, py] of [[-5.5, 3], [5.5, 3], [0, -5]]) g.appendChild(el('circle', { cx: px, cy: py, r: 5, fill: col, 'fill-opacity': 0.3, stroke: col, 'stroke-width': 1.4 }));
      }, 'McPops');

      addItem('Restaurant Operations', pos.ops, 'var(--m-red)', (g, col) => {
        g.appendChild(el('rect', { x: -10, y: -12, width: 20, height: 24, rx: 2, fill: col, 'fill-opacity': 0.14, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': '2.5 2' }));
        g.appendChild(el('text', { class: 'mono strong', x: 0, y: 4, 'text-anchor': 'middle', style: `fill:${col};font-size:9.5px` }, 'TAX'));
      }, 'Rest. Ops');

      const cur = catByName.get(selectedCat) || cats[0];
      setReadout(shell.readout, `<strong>${escHtml(cur.name)}</strong> · ${cur.d365} orders (365d), ${cur.d90} (90d), ${cur.d30} (30d)`, `<span class="ink">${escHtml(cur.note)}</span>`);
    }

    for (const k of ['d365', 'd90', 'd30']) {
      shell.btns[k].addEventListener('click', () => {
        winKey = k;
        for (const x of ['d365', 'd90', 'd30']) shell.btns[x].setAttribute('aria-pressed', x === k ? 'true' : 'false');
        draw();
      });
    }
    bindKeys(shell.stage, d => {
      const idx = TRAY_ORDER.indexOf(selectedCat);
      selectedCat = TRAY_ORDER[(idx + d + TRAY_ORDER.length) % TRAY_ORDER.length];
      draw();
    });
    observeWidth(shell.stage, draw);
    draw();

    return { selectCat(name) { winKey = 'd365'; for (const x of ['d365', 'd90', 'd30']) shell.btns[x].setAttribute('aria-pressed', x === 'd365' ? 'true' : 'false'); selectedCat = name; draw(); } };
  }

  /* ============================================================================
     FIGURE 5 (#mcd-deals): Drag-Scrubbable 30-Month Coupon Staircase + Perforated Ticket
     ============================================================================ */
  function buildDeals(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'teal', label: 'Band A: 50%→40%' },
      { cls: 'blue', label: 'Band B: 40%→30%' },
      { cls: 'red', label: 'Visits (H/M = −10pp)' },
    ], [
      { key: 'sweep', label: '▶ Sweep 30m', cls: 'accent', pressed: false },
    ]);

    const bau = data.bau_months;
    let activeM = bau.length - 2, sweeping = false, sweepTimer = 0, scrubbing = false;

    const strip = h('div', 'mcd-coupon-strip');
    const svg = el('svg', { class: 'mcd-chart' });
    shell.stage.append(strip, svg);

    function stopSweep() { sweeping = false; clearInterval(sweepTimer); shell.btns.sweep.textContent = '▶ Sweep 30m'; shell.btns.sweep.setAttribute('aria-pressed', 'false'); }

    function draw() {
      const W = stageW(shell.stage), narrow = W < 520, H = narrow ? 298 : 316;
      svg.innerHTML = ''; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

      const ml = 42, mr = 14, mt = 14, mb = 26, pw = W - ml - mr;
      const step = pw / bau.length, xAt = i => ml + (i + 0.5) * step;
      const bA0 = mt + 14, bAH = 74, bB0 = bA0 + bAH + 28, bBH = 74, v0 = bB0 + bBH + 22, vH = H - mb - v0;

      const drawBand = (y0, bh, title, pHi, pLo, series, strokeCls, colVar) => {
        svg.appendChild(el('text', { class: 'title', x: ml, y: y0 - 4 }, title));
        bau.forEach((m, i) => {
          if (m.tier === 'LOW' || m.tier === 'H/M') svg.appendChild(el('rect', { class: 'zone-band ' + (m.tier === 'LOW' ? 'lo' : 'hi'), x: (ml + i * step).toFixed(1), y: y0, width: (step + 0.5).toFixed(1), height: bh }));
        });
        for (const p of [pHi, pLo]) {
          const yy = y0 + (p === pHi ? 14 : bh - 12);
          svg.appendChild(el('line', { class: 'grid', x1: ml, y1: yy, x2: ml + pw, y2: yy }));
          svg.appendChild(el('text', { class: 'mono small', x: ml - 6, y: yy + 3.5, 'text-anchor': 'end' }, `${p}%`));
        }
        const yOf = p => y0 + 14 + ((pHi - p) / (pHi - pLo)) * (bh - 26);
        let d = '', prevY = null;
        bau.forEach((m, i) => {
          const val = series(m);
          if (val == null || val > pHi || val < pLo) { prevY = null; return; }
          const cx = xAt(i), cy = yOf(val);
          d += prevY === null ? `M${cx.toFixed(1)},${cy.toFixed(1)}` : `H${cx.toFixed(1)}V${cy.toFixed(1)}`;
          prevY = cy;
        });
        if (d) svg.appendChild(el('path', { class: `line ${strokeCls}`, d }));
        bau.forEach((m, i) => {
          const val = series(m); if (val == null || val > pHi || val < pLo) return;
          svg.appendChild(el('circle', { cx: xAt(i).toFixed(1), cy: yOf(val).toFixed(1), r: i === activeM ? 5 : 3.2, fill: i === activeM ? colVar : 'var(--bg)', stroke: colVar, 'stroke-width': 1.8 }));
        });
      };

      drawBand(bA0, bAH, narrow ? 'Band A · McFlurry & 10pc (50%→40%)' : 'Band A · McFlurry & 10pc Nuggets (50% → 40%)', 50, 40, m => m.nug10 || m.mcflurry, 'teal', 'var(--m-teal)');
      drawBand(bB0, bBH, narrow ? 'Band B · 20pc & 6pc (40%→30%)' : 'Band B · 20pc & DBC / 6pc Nuggets (40% → 30%)', 40, 30, m => m.dbc6 || m.nug20, 'blue', 'var(--m-blue)');

      // Crisp inline callout on desktop for the two 0-visit +10pp reprieves (Nov '25 & Mar '26)
      if (!narrow) {
        const mar26 = bau.findIndex(m => m.m === '2026-03');
        if (mar26 >= 0) {
          svg.appendChild(el('text', { class: 'teal small halo', x: xAt(mar26).toFixed(1), y: bB0 + 9, 'text-anchor': 'middle' }, '0 visits → +10pp back'));
        }
      }

      svg.appendChild(el('text', { class: 'small', x: ml, y: v0 - 4 }, narrow ? 'Monthly visits (red = H/M · teal = LOW)' : 'Monthly visits (crimson = H/M tier · teal = LOW tier)'));
      svg.appendChild(el('line', { class: 'axis', x1: ml, y1: v0 + vH, x2: ml + pw, y2: v0 + vH }));
      bau.forEach((m, i) => {
        const bw = Math.max(4, step - 3.5), bh = (m.orders / 6) * (vH - 4);
        if (m.orders > 0) svg.appendChild(el('rect', { class: 'bar ' + (m.tier === 'H/M' ? 'red' : m.tier === 'LOW' ? 'teal' : 'soft'), x: (ml + i * step + (step - bw) / 2).toFixed(1), y: (v0 + vH - bh).toFixed(1), width: bw.toFixed(1), height: Math.max(2, bh).toFixed(1), rx: 1.2, opacity: i === activeM ? 1 : 0.82 }));
        const tickEvery = narrow ? 8 : 4;
        if ((i % tickEvery === 0 && i < bau.length - (narrow ? 6 : 3)) || i === bau.length - 1) {
          svg.appendChild(el('text', { class: 'mono small', x: xAt(i).toFixed(1), y: H - 8, 'text-anchor': i === bau.length - 1 ? 'end' : 'middle' }, fmtYMShort(m.m)));
        }
      });

      const curX = xAt(activeM);
      svg.appendChild(el('line', { class: 'cursor', x1: curX.toFixed(1), y1: bA0, x2: curX.toFixed(1), y2: v0 + vH }));

      // Full-plot hover + drag scrubber
      const hit = el('rect', { class: 'hit', x: ml, y: bA0, width: pw, height: H - mb - bA0 });
      const idxFromEvt = e => {
        const r = svg.getBoundingClientRect();
        return clamp(Math.floor(((e.clientX - r.left) * (W / r.width) - ml) / step), 0, bau.length - 1);
      };
      hit.addEventListener('pointerdown', e => { stopSweep(); scrubbing = true; hit.setPointerCapture(e.pointerId); activeM = idxFromEvt(e); draw(); });
      hit.addEventListener('pointermove', e => { if (!sweeping && (scrubbing || e.pointerType === 'mouse')) { const i = idxFromEvt(e); if (i !== activeM) { activeM = i; draw(); } } });
      hit.addEventListener('pointerup', () => { scrubbing = false; });
      hit.addEventListener('pointercancel', () => { scrubbing = false; });
      svg.appendChild(hit);

      const m = bau[activeM];
      const isHM = m.tier === 'H/M', isLow = m.tier === 'LOW';
      const pct = m.nug10 || m.mcflurry || m.dbc6 || m.nug20 || (isHM ? 40 : 50);
      const itemLbl = m.nug10 ? '10pc McNuggets' : m.mcflurry ? 'McFlurry' : m.dbc6 ? 'DBC / 6pc Nuggets' : 'Segmented Offer';
      const slug = (m.offers && m.offers.length) ? m.offers[0].slug : 'No segmented BAU offer issued';
      strip.className = 'mcd-coupon-strip ' + (isHM ? 'is-hm' : isLow ? 'is-low' : '');
      strip.innerHTML = `
        <div class="c-left">
          <span class="c-eye">${fmtYM(m.m)} · TIER ${escHtml(m.tier || '—')} · ${m.orders} VISIT${m.orders === 1 ? '' : 'S'}</span>
          <span class="c-title">${pct}% off ${escHtml(itemLbl)}</span>
          <span class="c-slug">${escHtml(slug)}</span>
        </div>
        <div class="c-right">
          <span class="c-num">${pct}%</span>
          <span class="c-delta">${isHM ? '−10pp LOYALTY PENALTY' : isLow ? 'MAX BASELINE DISCOUNT' : 'EARLY COHORT'}</span>
        </div>`;
      setReadout(shell.readout, `<strong>${fmtYM(m.m)}</strong> · Tier <span class="${isHM ? 'red' : 'teal'}">${escHtml(m.tier || '—')}</span> · ${m.orders} visit${m.orders === 1 ? '' : 's'}`, isHM ? '<span class="red">−10pp loyalty penalty active</span>' : '<span class="teal">50% / 40% baseline</span>');
    }

    shell.btns.sweep.addEventListener('click', () => {
      if (sweeping) { stopSweep(); return; }
      sweeping = true; activeM = 0; shell.btns.sweep.textContent = '❚❚ Pause'; shell.btns.sweep.setAttribute('aria-pressed', 'true');
      draw();
      sweepTimer = setInterval(() => {
        activeM += 1;
        if (activeM >= bau.length) { activeM = bau.length - 1; draw(); stopSweep(); return; }
        draw();
      }, reducedMotion ? 220 : 135);
    });
    bindKeys(shell.stage, d => { stopSweep(); activeM = clamp(activeM + d, 0, bau.length - 1); draw(); });
    observeWidth(shell.stage, draw);
    draw();

    return {
      jumpMonth(ym) { stopSweep(); const i = bau.findIndex(x => x.m === ym); if (i >= 0) { activeM = i; draw(); } },
      startSweep() { if (!sweeping) shell.btns.sweep.click(); },
    };
  }

  /* ============================================================================
     FIGURE 6 (#mcd-kiosk): Clickable Wireframe iPhone + Directional Dual-Lane Oscilloscope
     ============================================================================ */
  function buildKiosk(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'blue', label: 'iPhone event' },
      { cls: 'amber', label: 'mParticle server' },
      { cls: 'red', label: 'Error / overflow' },
      { cls: 'teal', label: 'Purchase' },
    ], [
      { key: 'play', label: '▶ Play session', cls: 'accent', pressed: false },
    ]);

    const sessions = data.sessions;
    let activeSess = 0, curStep = 0, playing = false, timer = 0;
    const SESSION_CALLOUTS = {
      '2026-11-10': { tag: 'error', lbl: 'Error 41484 (Googleplus)' },
      '2026-04-08': { tag: 'bug', lbl: '1,580,000 cal · Order #−1766604922' },
      '2026-08-30': { tag: 'bug', lbl: '2,150,000 cal → bailed to kiosk' },
      '2026-10-13': { tag: 'warn', lbl: '4× remove_from_cart in 6s' },
    };

    shell.subpills.hidden = false;
    const pBtns = sessions.map((s, idx) => {
      const b = h('button', '', s.title);
      b.type = 'button'; b.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      b.addEventListener('click', () => selectSession(idx));
      shell.subpills.appendChild(b);
      return b;
    });

    const split = h('div', 'mcd-kiosk-grid');
    const phone = h('div', 'mcd-phone');
    const laneWrap = h('div', '');
    const laneSvg = el('svg', { class: 'mcd-chart' });
    const scRow = h('div', 'mcd-scrub-row');
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = 0; slider.max = 10; slider.value = 0;
    slider.setAttribute('aria-label', 'Scrub session event step');
    const scLbl = h('span', '', '');
    scRow.append(slider, scLbl);
    laneWrap.append(laneSvg, scRow);
    split.append(phone, laneWrap);
    shell.stage.appendChild(split);

    function renderPhone(sess, stepObj) {
      const cls = (stepObj.tag === 'error' || stepObj.tag === 'bug') ? 'is-error' : stepObj.tag === 'pay' ? 'is-pay' : stepObj.tag === 'scan' ? 'is-scan' : '';
      const badge = stepObj.tag === 'error' ? 'ERROR 41484 / CART' : stepObj.tag === 'bug' ? 'OVERFLOW / CAL BUG' : stepObj.tag === 'pay' ? 'MCFLOW PURCHASE' : stepObj.tag === 'scan' ? 'KIOSK QR CODE' : stepObj.lane === 'server' ? 'MPARTICLE SERVER' : 'MCDONALD’S iOS';
      let extra = '';
      if (stepObj.tag === 'scan') {
        const pat = [1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1];
        extra = `<div class="mcd-phone-qr" aria-hidden="true">${pat.map(b => `<i class="${b ? '' : 'w'}"></i>`).join('')}</div>`;
      } else if (sess.id === '2026-04-08' && stepObj.tag === 'bug') {
        extra = `<div class="mcd-phone-detail" style="color:var(--m-red);font-weight:600">Order # −1766604922 (int32!)</div>`;
      }
      phone.innerHTML = `
        <div class="mcd-phone-notch"></div>
        <div class="mcd-phone-status"><span>${escHtml(stepObj.ts)}</span><span>v${escHtml(sess.app_version || '26.x')}</span></div>
        <div class="mcd-phone-screen ${cls}" title="Click screen to step forward">
          <span class="mcd-phone-badge">${badge}</span>
          <div class="mcd-phone-ev">${escHtml(stepObj.ev)}</div>
          <div class="mcd-phone-detail">${escHtml(stepObj.detail || sess.key_moment)}</div>
          ${extra}
          <div class="mcd-phone-tap">tap screen → (${curStep + 1}/${sess.steps.length})</div>
        </div>`;
      phone.querySelector('.mcd-phone-screen').addEventListener('click', () => { stopPlay(); curStep = (curStep + 1) % sess.steps.length; drawSession(); });
    }

    function drawSession() {
      const sess = sessions[activeSess], steps = sess.steps;
      slider.max = steps.length - 1; slider.value = curStep;
      const cur = steps[curStep];
      scLbl.textContent = `event ${curStep + 1} / ${steps.length} (+${cur.t}s)`;
      renderPhone(sess, cur);

      const W = Math.max(260, stageW(laneWrap)), H = 196;
      laneSvg.innerHTML = ''; laneSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const ml = 62, mr = 14, mt = 26, mb = 26, pw = W - ml - mr;
      const yApp = mt + 44, ySrv = mt + 108;
      const xAt = i => ml + (steps.length > 1 ? (i / (steps.length - 1)) * pw : pw / 2);

      laneSvg.appendChild(el('text', { class: 'title', x: ml, y: 14 }, sess.title));
      if (W >= 420) laneSvg.appendChild(el('text', { class: 'mono small', x: ml + pw, y: 14, 'text-anchor': 'end' }, '33 kiosk visits · med 174s'));

      laneSvg.appendChild(el('line', { class: 'axis', x1: ml, y1: yApp, x2: ml + pw, y2: yApp }));
      laneSvg.appendChild(el('line', { class: 'axis', x1: ml, y1: ySrv, x2: ml + pw, y2: ySrv }));
      laneSvg.appendChild(el('text', { class: 'mono small strong', x: ml - 10, y: yApp + 3.5, 'text-anchor': 'end' }, 'iPhone'));
      laneSvg.appendChild(el('text', { class: 'mono small amber', x: ml - 10, y: ySrv + 3.5, 'text-anchor': 'end' }, 'Server'));

      for (let i = 1; i <= curStep; i++) {
        const a = steps[i - 1], b = steps[i];
        const x1 = xAt(i - 1), y1 = a.lane === 'server' ? ySrv : yApp;
        const x2 = xAt(i), y2 = b.lane === 'server' ? ySrv : yApp;
        if (a.lane !== b.lane) {
          const midX = (x1 + x2) / 2;
          laneSvg.appendChild(el('path', { d: `M${x1.toFixed(1)},${y1} C${midX.toFixed(1)},${y1} ${midX.toFixed(1)},${y2} ${x2.toFixed(1)},${y2}`, fill: 'none', stroke: 'var(--m-amber)', 'stroke-width': 1.6, 'stroke-dasharray': '3 2', opacity: 0.85 }));
          const dir = y2 > y1 ? 1 : -1;
          laneSvg.appendChild(el('polygon', { points: `${x2.toFixed(1)},${(y2 - dir * 5).toFixed(1)} ${(x2 - 3.2).toFixed(1)},${(y2 - dir * 10).toFixed(1)} ${(x2 + 3.2).toFixed(1)},${(y2 - dir * 10).toFixed(1)}`, fill: 'var(--m-amber)', opacity: 0.9 }));
        } else {
          laneSvg.appendChild(el('line', { x1: x1.toFixed(1), y1, x2: x2.toFixed(1), y2, stroke: a.lane === 'server' ? 'var(--m-amber)' : 'var(--m-blue)', 'stroke-width': 1.6, opacity: 0.35 }));
        }
      }

      const cx = xAt(curStep), cy = cur.lane === 'server' ? ySrv : yApp;
      laneSvg.appendChild(el('line', { class: 'cursor', x1: cx.toFixed(1), y1: mt + 8, x2: cx.toFixed(1), y2: H - mb }));
      laneSvg.appendChild(el('circle', { cx: cx.toFixed(1), cy, r: 10.5, fill: 'none', stroke: cur.tag === 'error' || cur.tag === 'bug' ? 'var(--m-red)' : 'var(--m-blue)', 'stroke-width': 1.2, opacity: 0.38 }));

      steps.forEach((st, i) => {
        const x = xAt(i), y = st.lane === 'server' ? ySrv : yApp;
        const isErr = st.tag === 'error' || st.tag === 'bug';
        const col = isErr ? 'var(--m-red)' : st.tag === 'pay' ? 'var(--m-teal)' : (st.lane === 'server' ? 'var(--m-amber)' : 'var(--m-blue)');
        laneSvg.appendChild(el('circle', { cx: x.toFixed(1), cy: y, r: i === curStep ? 6.2 : (isErr ? 4.8 : 3.6), fill: i <= curStep ? col : 'var(--bg)', stroke: col, 'stroke-width': 1.7, opacity: i <= curStep ? 1 : 0.45 }));
        const hit = el('circle', { cx: x.toFixed(1), cy: y, r: 12, fill: 'transparent', style: 'cursor:pointer' });
        hit.addEventListener('pointerenter', () => { if (!playing) { curStep = i; drawSession(); } });
        hit.addEventListener('click', () => { stopPlay(); curStep = i; drawSession(); });
        laneSvg.appendChild(hit);
      });

      const call = SESSION_CALLOUTS[sess.id];
      const specIdx = call ? steps.findIndex(st => st.tag === call.tag) : -1;
      if (specIdx >= 0) {
        laneSvg.appendChild(el('text', { class: 'red halo small', x: clamp(xAt(specIdx), ml + 76, ml + pw - 76).toFixed(1), y: yApp - 18, 'text-anchor': 'middle' }, call.lbl));
      }
      laneSvg.appendChild(el('text', { class: 'mono small', x: ml, y: H - 7 }, `${steps[0].ts} (+0s)`));
      laneSvg.appendChild(el('text', { class: 'mono small', x: ml + pw, y: H - 7, 'text-anchor': 'end' }, `${steps[steps.length - 1].ts} (+${sess.duration_s}s)`));

      const detailTxt = cur.detail ? ` · <span class="${cur.tag === 'error' || cur.tag === 'bug' ? 'red' : 'ink'}">${escHtml(cur.detail)}</span>` : '';
      setReadout(shell.readout, `<strong>+${cur.t}s (${cur.ts} UTC)</strong> · ${escHtml(cur.ev)}${detailTxt}`, `<span class="ink">${cur.lane === 'server' ? 'mParticle Server' : 'iPhone v' + (sess.app_version || '26.x')}</span>`);
    }

    function stopPlay() { playing = false; clearInterval(timer); shell.btns.play.textContent = '▶ Play session'; shell.btns.play.setAttribute('aria-pressed', 'false'); }
    function selectSession(idx, autoPlay = false) {
      stopPlay(); activeSess = clamp(idx, 0, sessions.length - 1);
      pBtns.forEach((b, i) => b.setAttribute('aria-pressed', i === activeSess ? 'true' : 'false'));
      const st = sessions[activeSess].steps;
      const keyIdx = st.findIndex(x => x.tag === 'error' || x.tag === 'bug' || x.tag === 'warn');
      curStep = autoPlay ? 0 : (keyIdx >= 0 ? keyIdx : Math.min(3, st.length - 1));
      drawSession();
      if (autoPlay) startPlay();
    }
    function startPlay() {
      stopPlay(); playing = true;
      if (curStep >= sessions[activeSess].steps.length - 1) curStep = 0;
      shell.btns.play.textContent = '❚❚ Pause'; shell.btns.play.setAttribute('aria-pressed', 'true');
      timer = setInterval(() => {
        curStep += 1;
        if (curStep >= sessions[activeSess].steps.length) { curStep = sessions[activeSess].steps.length - 1; drawSession(); stopPlay(); return; }
        drawSession();
      }, reducedMotion ? 560 : 340);
    }

    slider.addEventListener('input', () => { stopPlay(); curStep = parseInt(slider.value, 10); drawSession(); });
    shell.btns.play.addEventListener('click', () => { if (playing) stopPlay(); else startPlay(); });
    bindKeys(shell.stage, d => { stopPlay(); curStep = clamp(curStep + d, 0, sessions[activeSess].steps.length - 1); drawSession(); });
    observeWidth(shell.stage, drawSession);
    selectSession(0, false);

    return { openSession(id) { const idx = sessions.findIndex(s => s.id === id); selectSession(idx >= 0 ? idx : 0, true); } };
  }

  /* ============================================================================
     FIGURE 7 (#mcd-mirror): Draggable 3D Kolmogorov Cake Manifold + Pulsing Beacon + Axis Ticks
     ============================================================================ */
  function buildMirror(fig, data) {
    const shell = makeShell(fig, [
      { cls: 'red', label: 'P(30d) > P(90d)' },
      { cls: 'blue', label: 'Valid (height = orders)' },
      { cls: 'hollow', label: '0-order ghost' },
    ], [
      { key: 'topdown', label: 'Top-down 2D', cls: 'accent', pressed: false },
      { key: 'churn', label: '+ Churn (6%>3%)', cls: 'red-act', pressed: false },
    ]);

    let isTopDown = false, showChurn = false, hoveredItem = null, lockedItem = null, hitNodes = [];

    const m3d = makeCanvas3D(
      shell.stage, 412,
      { yaw: -0.58, pitch: 0.56, dist: 3.05, fW: 0.76, fH: 1.24, cyFrac: 0.68 },
      (ctx, cw, ch, project, th, mx, my, pulse) => {
        hitNodes = [];
        const toX = p90 => (p90 - 0.5) * 1.9, toZ = p30 => (0.5 - p30) * 1.9, toY = ord => (ord / 31) * 0.72;

        ctx.save();
        const c00 = project(toX(0), 0, toZ(0)), c10 = project(toX(1), 0, toZ(0)), c11 = project(toX(1), 0, toZ(1)), c01 = project(toX(0), 0, toZ(1));
        ctx.beginPath(); ctx.moveTo(c00.x, c00.y); ctx.lineTo(c10.x, c10.y); ctx.lineTo(c11.x, c11.y); ctx.closePath();
        ctx.fillStyle = th.dark ? 'rgba(255,255,255,0.03)' : 'rgba(24,24,23,0.025)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(c00.x, c00.y); ctx.lineTo(c01.x, c01.y); ctx.lineTo(c11.x, c11.y); ctx.closePath();
        ctx.fillStyle = rgba(th.red, th.dark ? 0.14 : 0.085); ctx.fill();

        ctx.strokeStyle = rgba(th.line2, 0.7); ctx.lineWidth = 0.75;
        for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
          const a = project(toX(p), 0, toZ(0)), b = project(toX(p), 0, toZ(1));
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const c = project(toX(0), 0, toZ(p)), d = project(toX(1), 0, toZ(p));
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        }

        const wH = 0.28, w00 = project(toX(0), wH, toZ(0)), w11 = project(toX(1), wH, toZ(1));
        ctx.beginPath(); ctx.moveTo(c00.x, c00.y); ctx.lineTo(c11.x, c11.y); ctx.lineTo(w11.x, w11.y); ctx.lineTo(w00.x, w00.y); ctx.closePath();
        ctx.fillStyle = rgba(th.red, th.dark ? 0.12 : 0.07); ctx.fill();
        ctx.strokeStyle = rgba(th.red, 0.72); ctx.lineWidth = 1.35; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(c00.x, c00.y); ctx.lineTo(c11.x, c11.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = rgba(th.red, 0.35); ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(w00.x, w00.y); ctx.lineTo(w11.x, w11.y); ctx.stroke();

        // Crisp floor axis labels & 0% / 100% corner ticks
        ctx.font = `500 9.5px ${th.mono}`; ctx.fillStyle = th.fg3; ctx.textAlign = 'center';
        const lbl90 = project(toX(0.55), 0, toZ(-0.11));
        ctx.fillText('P(≤90d) →', clamp(lbl90.x, 40, cw - 40), clamp(lbl90.y, 14, ch - 8));
        const lbl30 = project(toX(-0.13), 0, toZ(0.52));
        ctx.fillText('P(≤30d) →', clamp(lbl30.x, 40, cw - 40), clamp(lbl30.y, 14, ch - 8));
        for (const [tx, tz, str] of [[0, -0.06, '0%'], [1, -0.06, '100%'], [-0.07, 1, '100%']]) {
          const tp = project(toX(tx), 0, toZ(tz));
          ctx.fillText(str, clamp(tp.x, 18, cw - 18), clamp(tp.y, 14, ch - 8));
        }

        const impLbl = project(toX(0.20), 0.02, toZ(0.84));
        ctx.font = `600 10px ${th.sans}`; ctx.fillStyle = th.red;
        ctx.fillText('IMPOSSIBLE ZONE: P(30d) > P(90d)', clamp(impLbl.x, 96, cw - 96), clamp(impLbl.y, 16, ch - 12));

        const list = [...data.ml.products];
        if (showChurn) list.push({ cat: 'Churn (6%>3%)', p30: data.ml.churn_30, p90: data.ml.churn_90, actual_365: 0, impossible: true, note: 'Even Churn violates monotonicity: 6% (30d) vs 3% (90d)' });

        const activeIt = hoveredItem || lockedItem;
        const nodes = list.map(it => {
          const x = toX(it.p90), z = toZ(it.p30), y = toY(it.actual_365);
          return { it, base: project(x, 0, z), top: project(x, y, z), diagBase: project(toX(it.p90), 0, toZ(it.p90)) };
        }).sort((a, b) => b.base.z - a.base.z);

        for (const n of nodes) {
          const it = n.it, isHot = activeIt && activeIt.cat === it.cat;
          const col = it.impossible ? th.red : (it.actual_365 > 0 ? th.blue : th.fg3);
          if (it.impossible) {
            ctx.beginPath(); ctx.moveTo(n.base.x, n.base.y); ctx.lineTo(n.diagBase.x, n.diagBase.y);
            ctx.strokeStyle = rgba(th.red, 0.55); ctx.lineWidth = 1.4; ctx.setLineDash([2.5, 2.5]); ctx.stroke(); ctx.setLineDash([]);
          }
          if (it.actual_365 > 0) {
            const half = isHot ? 5.6 : 4.2;
            ctx.beginPath(); ctx.ellipse(n.base.x, n.base.y, half * 1.9, half * 0.9, 0, 0, Math.PI * 2);
            ctx.fillStyle = rgba(col, isHot ? 0.28 : 0.16); ctx.fill();
            ctx.beginPath(); ctx.moveTo(n.base.x - half, n.base.y); ctx.lineTo(n.base.x, n.base.y + half * 0.45);
            ctx.lineTo(n.top.x, n.top.y + half * 0.45); ctx.lineTo(n.top.x - half, n.top.y); ctx.closePath();
            ctx.fillStyle = rgba(col, isHot ? 0.98 : 0.80); ctx.fill();
            ctx.beginPath(); ctx.moveTo(n.base.x, n.base.y + half * 0.45); ctx.lineTo(n.base.x + half, n.base.y);
            ctx.lineTo(n.top.x + half, n.top.y); ctx.lineTo(n.top.x, n.top.y + half * 0.45); ctx.closePath();
            ctx.fillStyle = rgba(col, isHot ? 0.76 : 0.52); ctx.fill();
            ctx.beginPath(); ctx.moveTo(n.top.x, n.top.y - half * 0.45); ctx.lineTo(n.top.x + half, n.top.y);
            ctx.lineTo(n.top.x, n.top.y + half * 0.45); ctx.lineTo(n.top.x - half, n.top.y); ctx.closePath();
            ctx.fillStyle = th.bg; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = isHot ? 2 : 1.5; ctx.stroke();
          } else {
            const isCake = it.cat === 'Cakes';
            if (isCake) {
              const pr = 9 + (pulse % 1) * 10;
              ctx.beginPath(); ctx.arc(n.base.x, n.base.y, pr, 0, Math.PI * 2);
              ctx.strokeStyle = rgba(th.red, Math.max(0.08, 0.55 * (1 - (pulse % 1)))); ctx.lineWidth = 1.4; ctx.stroke();
              ctx.beginPath(); ctx.arc(n.base.x, n.base.y, 11.5, 0, Math.PI * 2);
              ctx.strokeStyle = rgba(th.red, 0.35); ctx.lineWidth = 1.2; ctx.setLineDash([2.5, 2.5]); ctx.stroke(); ctx.setLineDash([]);
            }
            ctx.beginPath(); ctx.arc(n.base.x, n.base.y, isCake ? 6.2 : (isHot ? 5.8 : 4.4), 0, Math.PI * 2);
            ctx.fillStyle = it.impossible ? th.red : th.bg; ctx.fill();
            ctx.strokeStyle = it.impossible ? th.bg : th.fg3; ctx.lineWidth = 1.6; ctx.stroke();
          }
          hitNodes.push({ it, x: n.top.x, y: n.top.y, bx: n.base.x, by: n.base.y });
        }

        const showSet = new Set(['Cakes', 'Potato Sides', 'Carbonated Beverages', 'Nuggets', 'Coffee', 'Breakfast Multiple Product Bundles', 'Churn (6%>3%)']);
        const placed = [];
        ctx.font = `600 10px ${th.sans}`;
        const labelNodes = nodes
          .filter(n => showSet.has(n.it.cat) || (activeIt && activeIt.cat === n.it.cat))
          .sort((a, b) => (a.it.cat === 'Cakes' ? -1 : b.it.cat === 'Cakes' ? 1 : b.it.actual_365 - a.it.actual_365));
        for (const n of labelNodes) {
          const it = n.it, isHot = activeIt && activeIt.cat === it.cat;
          const lbl = it.cat === 'Cakes' ? 'Cakes: 100% > 99% (0 orders!)'
            : it.cat === 'Potato Sides' ? 'Fries (31)'
            : it.cat === 'Carbonated Beverages' ? 'Drinks (29)'
            : it.cat === 'Nuggets' ? 'Nuggets (27)'
            : it.cat === 'Coffee' ? 'Coffee 52%>32%'
            : it.cat === 'Breakfast Multiple Product Bundles' ? 'Bkfst Bundles' : it.cat;
          const tw = ctx.measureText(lbl).width;
          let align = 'center', lx = n.top.x, ly = n.top.y - 11, leader = null;
          if (it.cat === 'Cakes') {
            align = 'right'; lx = clamp(n.base.x - 36, tw + 10, cw - 10); ly = clamp(n.base.y - 18, 18, ch - 12);
            leader = [n.base.x - 6, n.base.y - 5, lx + 4, ly - 3];
          } else if (it.cat === 'Potato Sides') {
            align = 'center'; lx = clamp(n.top.x + 2, tw / 2 + 8, cw - tw / 2 - 8); ly = clamp(n.top.y - 11, 16, ch - 12);
          } else if (it.cat === 'Carbonated Beverages' || it.cat === 'Nuggets') {
            align = 'left'; lx = clamp(n.top.x + 16, 8, cw - tw - 8); ly = clamp(n.top.y + (it.cat === 'Nuggets' ? 12 : 2), 18, ch - 12);
            leader = [n.top.x + 5, n.top.y, lx - 3, ly - 3];
          } else if (it.cat === 'Coffee') {
            align = 'right'; lx = clamp(n.base.x - 14, tw + 8, cw - 8); ly = clamp(n.base.y + 4, 18, ch - 12);
            leader = [n.base.x - 4, n.base.y, lx + 3, ly - 3];
          } else {
            lx = clamp(n.top.x, tw / 2 + 8, cw - tw / 2 - 8); ly = clamp(n.top.y - 11, 16, ch - 12);
          }
          const x0 = align === 'left' ? lx - 2 : (align === 'right' ? lx - tw - 2 : lx - tw / 2 - 2);
          const x1 = align === 'left' ? lx + tw + 2 : (align === 'right' ? lx + 2 : lx + tw / 2 + 2);
          const box = { x0, x1, y0: ly - 10, y1: ly + 3 };
          if (!isHot && it.cat !== 'Cakes' && placed.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
          placed.push(box);
          if (leader) {
            ctx.beginPath(); ctx.moveTo(leader[0], leader[1]); ctx.lineTo(leader[2], leader[3]);
            ctx.strokeStyle = rgba(it.impossible ? th.red : th.blue, 0.5); ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.textAlign = align; ctx.lineWidth = 4; ctx.strokeStyle = th.bg; ctx.strokeText(lbl, lx, ly);
          ctx.fillStyle = it.impossible ? th.red : th.blue; ctx.fillText(lbl, lx, ly);
        }
        ctx.restore();
      },
      (mx, my) => {
        if (mx < 0) { hoveredItem = null; updateReadout(); return; }
        let best = null, bd = 24;
        for (const hn of hitNodes) { const d = Math.min(Math.hypot(mx - hn.x, my - hn.y), Math.hypot(mx - hn.bx, my - hn.by)); if (d < bd) { bd = d; best = hn.it; } }
        hoveredItem = best; updateReadout();
      },
      (cx, cy) => {
        let best = null, bd = 24;
        for (const hn of hitNodes) { const d = Math.min(Math.hypot(cx - hn.x, cy - hn.y), Math.hypot(cx - hn.bx, cy - hn.by)); if (d < bd) { bd = d; best = hn.it; } }
        lockedItem = best; updateReadout();
      },
      'drag to orbit 3D manifold · click any tower or ghost dot'
    );

    if (!reducedMotion) {
      let ph = 0;
      setInterval(() => { if (!document.hidden) { ph = (ph + 0.022) % 1; m3d.setPulse(ph); } }, 75);
    }

    function updateReadout() {
      const it = hoveredItem || lockedItem;
      if (it) {
        const v = it.impossible ? `<span class="red">IMPOSSIBLE (+${Math.round((it.p30 - it.p90) * 100)}pp)</span>` : `<span class="blue">${it.actual_365} actual orders in 365d</span>`;
        setReadout(shell.readout, `<strong>${escHtml(it.cat)}</strong> · P(30d)=${Math.round(it.p30 * 100)}%, P(90d)=${Math.round(it.p90 * 100)}% · ${v}`, escHtml(it.note || `${it.actual_365} orders in 365d`));
      } else {
        setReadout(shell.readout, '<strong>5 of 17 cross the crimson wall</strong> · <span class="red">Cakes 100% > 99% (0 orders)</span>', 'CLV: Can’t Lose (Downgraded)');
      }
    }

    shell.btns.topdown.addEventListener('click', () => {
      isTopDown = !isTopDown;
      shell.btns.topdown.setAttribute('aria-pressed', isTopDown ? 'true' : 'false');
      if (isTopDown) m3d.flyTo(0.0, 1.52, 2.45, 0, 0);
      else m3d.flyTo(-0.58, 0.56, 3.05, 0, 0);
    });
    shell.btns.churn.addEventListener('click', () => {
      showChurn = !showChurn;
      shell.btns.churn.setAttribute('aria-pressed', showChurn ? 'true' : 'false');
      m3d.render();
    });
    updateReadout();

    return {
      showChurn() { showChurn = true; shell.btns.churn.setAttribute('aria-pressed', 'true'); m3d.render(); },
      showTopDown() { isTopDown = true; shell.btns.topdown.setAttribute('aria-pressed', 'true'); m3d.flyTo(0.0, 1.52, 2.45, 0, 0); },
    };
  }

  /* ------------------------------------------------------------- Bootstrap & Wire All Inline Action Links */
  const BUILDERS = { journey: buildJourney, rhythm: buildRhythm, atlas: buildAtlas, menu: buildMenu, deals: buildDeals, kiosk: buildKiosk, mirror: buildMirror };

  function wireActions(apis) {
    document.querySelectorAll('a.act[data-do]').forEach(link => {
      link.addEventListener('click', e => {
        const href = link.getAttribute('href') || '';
        const target = href.startsWith('#') ? document.querySelector(href) : null;
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); }
        const doKey = link.getAttribute('data-do');
        switch (doKey) {
          case 'era-dormant': apis.journey && apis.journey.setEra('dormant'); break;
          case 'era-nyc': apis.journey && apis.journey.setEra('nyc'); break;
          case 'era-philly': apis.journey && apis.journey.setEra('philly'); break;
          case 'era-boston': apis.journey && apis.journey.setEra('boston'); break;
          case 'replay-17s': apis.journey && apis.journey.replay17(); break;
          case 'clock-wed': apis.rhythm && apis.rhythm.filterWeekday(2, 19); break;
          case 'clock-sun': apis.rhythm && apis.rhythm.filterWeekday(6, 12); break;
          case 'clock-sweep': apis.rhythm && apis.rhythm.startSweep(); break;
          case 'trip-maine': apis.atlas && apis.atlas.focusTrip('maine'); break;
          case 'trip-chicago': apis.atlas && apis.atlas.focusTrip('chicago'); break;
          case 'trip-lax': apis.atlas && apis.atlas.focusTrip('lax'); break;
          case 'ip-ghosts': apis.atlas && apis.atlas.focusGhosts(); break;
          case 'play-trip': apis.atlas && apis.atlas.startPlay(); break;
          case 'tray-nuggets': apis.menu && apis.menu.selectCat('Chicken McNuggets'); break;
          case 'tray-value': apis.menu && apis.menu.selectCat('McDoubles'); break;
          case 'tray-breakfast': apis.menu && apis.menu.selectCat('McMuffins'); break;
          case 'tray-hq': apis.menu && apis.menu.selectCat('McPops'); break;
          case 'tray-ops': apis.menu && apis.menu.selectCat('Restaurant Operations'); break;
          case 'bau-low': apis.deals && apis.deals.jumpMonth('2025-06'); break;
          case 'bau-hm': apis.deals && apis.deals.jumpMonth('2026-10'); break;
          case 'sweep-bau': apis.deals && apis.deals.startSweep(); break;
          case 'sess-googleplus': apis.kiosk && apis.kiosk.openSession('2026-11-10'); break;
          case 'sess-mobile': apis.kiosk && apis.kiosk.openSession('2026-04-08'); break;
          case 'sess-bailout': apis.kiosk && apis.kiosk.openSession('2026-08-30'); break;
          case 'sess-lax': apis.kiosk && apis.kiosk.openSession('2026-10-13'); break;
          case 'ml-churn': apis.mirror && apis.mirror.showChurn(); break;
          case 'ml-topdown': apis.mirror && apis.mirror.showTopDown(); break;
        }
      });
    });
  }

  function init() {
    const figs = [...document.querySelectorAll('figure[data-mcd]')];
    if (!figs.length) return;
    const src = figs[0].getAttribute('data-src');
    if (!src) return;
    fetch(src)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        const apis = {};
        for (const fig of figs) {
          const kind = fig.getAttribute('data-mcd');
          if (BUILDERS[kind]) apis[kind] = BUILDERS[kind](fig, data);
        }
        wireActions(apis);
      })
      .catch(err => {
        console.error('Failed to initialize McDonald’s visualizations:', err);
        figs.forEach(f => { const b = f.querySelector('.mcd-body'); if (b) b.textContent = 'Could not load visualization data.'; });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
