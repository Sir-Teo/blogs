/* Eight deep-analytics interactive SVG figures for the OpenAI export post. Zero dependencies. */
(function () {
  'use strict';
  const first = document.getElementById('oai-run');
  if (!first) return;

  // ----------------------------------------------------------------- helpers
  const $ = (s, e = document) => e.querySelector(s);
  const all = (s, e = document) => [...e.querySelectorAll(s)];
  const num = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (n, d = 0) => num(n * 100, d) + '%';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DAY = 864e5;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ms = s => Date.parse((s.length === 7 ? s + '-01' : s.slice(0, 10)) + 'T00:00:00Z');
  const fmtMonth = ym => {
    const [y, m] = ym.split('-').map(Number);
    return `${MON[m - 1]} ${y}`;
  };
  const fmtDate = (s, yr = true) => {
    const d = new Date(ms(s));
    return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}${yr ? ', ' + d.getUTCFullYear() : ''}`;
  };
  const fmtDur = sec => {
    sec = Math.round(sec);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), r = sec % 60;
    if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
  };
  const hourLabel = h => h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? 'noon' : (h - 12) + ' pm';
  const f = v => (Math.round(v * 10) / 10).toString();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = (x, y, s, cls = '', anchor = 'start') => `<text x="${f(x)}" y="${f(y)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
  const line = (x1, y1, x2, y2, cls = 'grid') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}"/>`;
  const rect = (x, y, w, h, cls = '', extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" class="${cls}" ${extra}/>`;
  const circle = (x, y, r, cls = '', extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" class="${cls}" ${extra}/>`;
  const svg = (w, h, label, body) => `<svg class="oai-chart" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  const tabs = (name, items, cur) => `<div class="tabs" role="group" aria-label="${esc(name || 'View')}">${items.map(([id, l]) => `<button type="button" data-choice="${id}" aria-pressed="${id === cur}">${l}</button>`).join('')}</div>`;
  const legend = items => `<div class="oai-legend">${items.map(([c, l, pick]) => `<span class="${c}"${pick !== undefined ? ` data-pick="${pick}"` : ''}><i aria-hidden="true"></i>${l}</span>`).join('')}</div>`;

  function shell(fig, controlsHtml = '', legendHtml = '') {
    const el = document.createElement('div');
    el.className = 'oai-body';
    el.innerHTML = `<div class="fig-controls">${controlsHtml}<span class="fig-num"></span></div><div class="oai-leg-slot">${legendHtml}</div><div class="oai-view"></div><p class="oai-readout" aria-live="polite"></p>`;
    fig.insertBefore(el, $('figcaption', fig));
    fig.classList.add('ready');
    return {
      el,
      bar: $('.fig-controls', el),
      summary: $('.fig-num', el),
      leg: $('.oai-leg-slot', el),
      view: $('.oai-view', el),
      out: $('.oai-readout', el),
    };
  }
  function bindTabs(el, fn) {
    all('[data-choice]', el).forEach(b => b.addEventListener('click', () => fn(b.dataset.choice)));
  }
  function press(el, v) {
    all('[data-choice]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.choice === v)));
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

  // ----------------------------------- Figure 1: The throughput inversion
  function run(fig, D) {
    const months = D.months, n = months.length;
    const peakIdx = months.reduce((b, m, i) => m.prompts > months[b].prompts ? i : b, 0);
    const oct26Idx = months.findIndex(m => m.m === '2026-10');
    const era2Idx = months.findIndex(m => m.m === '2024-05');
    const era3Idx = months.findIndex(m => m.m === '2025-08');
    let mode = 'prompts', sel = peakIdx, range = null, dragStart = null, geo = null;

    const ui = shell(fig, tabs('Metric', [
      ['prompts', 'Prompts & chats'],
      ['thinking', 'Thinking hours (96.3h)'],
      ['tokens', 'Tokens (~82.8M)'],
    ], mode));

    function syncLegend() {
      if (mode === 'prompts') {
        ui.leg.innerHTML = legend([
          ['mid', 'User prompts (bars)'],
          ['line', 'Conversations started (line)'],
          ['soft', 'Reasoning reply share (top)'],
        ]);
      } else if (mode === 'tokens') {
        ui.leg.innerHTML = legend([
          ['ink', 'Fresh prompt tokens (~14.7M)'],
          ['amber', 'Re-sent history context (~34.0M)'],
          ['blue', 'Output + reasoning tokens (~34.2M)'],
        ]);
      } else {
        ui.leg.innerHTML = legend([
          ['blue', 'Recorded thinking hours (logged Apr ’25+)'],
          ['amber', 'Selected month'],
          ['soft', 'Reasoning reply share (top)'],
        ]);
      }
    }

    function draw() {
      syncLegend();
      const w = width(ui.view), x0 = 46, pw = w - x0 - 12, top = 20, th = 50, gap = 28;
      const bh = w < 500 ? 146 : 170, by = top + th + gap, H = by + bh + 28;
      const stepW = pw / n, bw = Math.max(2, stepW * 0.76);
      const X = i => x0 + (i + 0.5) * stepW;
      const ty = v => top + th - clamp(v, 0, 1) * th;
      let s = '';

      // Subtle regime boundary lines & labels across top
      if (era2Idx >= 0 && era3Idx >= 0) {
        const e2x = X(era2Idx) - stepW / 2, e3x = X(era3Idx) - stepW / 2;
        s += line(e2x, top, e2x, by + bh, 'bench');
        s += line(e3x, top, e3x, by + bh, 'bench');
        if (w >= 560) {
          s += text((x0 + e2x) / 2, top - 6, 'I · Search & math', 'small', 'middle');
          s += text((e2x + e3x) / 2, top - 6, 'II · Copy-paste workbench', 'small ink', 'middle');
          s += text((e3x + x0 + pw) / 2, top - 6, 'III · Agentic delegation', 'small blue', 'middle');
        }
      }

      s += line(x0, ty(0), x0 + pw, ty(0), 'axis') + line(x0, ty(1), x0 + pw, ty(1), 'grid');
      s += text(x0 - 6, ty(0) + 3, '0%', '', 'end') + text(x0 - 6, ty(1) + 4, '100%', 'ink', 'end');

      let rIdx = null;
      if (range) {
        const i0 = months.findIndex(m => m.m >= range[0]);
        let i1 = -1;
        months.forEach((m, i) => { if (m.m <= range[1]) i1 = i; });
        if (i0 >= 0 && i1 >= i0) {
          rIdx = [i0, i1];
          const rx0 = X(i0) - stepW / 2, rx1 = X(i1) + stepW / 2;
          s += rect(rx0, top, rx1 - rx0, by + bh - top, 'brush-band');
        }
      }

      let rLine = '', rArea = '';
      months.forEach((m, i) => {
        const xa = X(i) - stepW / 2, xb = xa + stepW, y = ty(m.reasShare);
        if (i === 0) {
          rLine += `M${f(xa)},${f(y)}H${f(xb)}`;
          rArea += `M${f(xa)},${f(ty(0))}L${f(xa)},${f(y)}H${f(xb)}`;
        } else {
          rLine += `L${f(xa)},${f(y)}H${f(xb)}`;
          rArea += `L${f(xa)},${f(y)}H${f(xb)}`;
        }
        if (i === n - 1) rArea += `L${f(xb)},${f(ty(0))}Z`;
      });
      s += `<path d="${rArea}" class="area"/><path d="${rLine}" class="step blue"/>`;

      if (mode === 'prompts') {
        const maxV = 1800, yy = v => by + bh - (v / maxV) * bh;
        for (const [v, lbl] of [[0, '0'], [600, '600'], [1200, '1.2k'], [1800, '1.8k']]) {
          s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
          s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
        }
        s += text(x0, by - 7, 'Monthly prompts & conversations', 'ink');
        let cPath = '';
        months.forEach((m, i) => {
          const inR = rIdx && i >= rIdx[0] && i <= rIdx[1];
          const cls = i === sel ? 'bar amber' : inR ? 'bar on' : 'bar mid';
          s += rect(X(i) - bw / 2, yy(m.prompts), bw, by + bh - yy(m.prompts), cls, 'rx="1"');
          cPath += (i === 0 ? 'M' : 'L') + `${f(X(i))},${f(yy(m.convs))}`;
        });
        s += `<path d="${cPath}" class="step" style="stroke:var(--fg-2);stroke-width:1.6"/>`;
        if (w >= 500) {
          s += text(X(peakIdx) + 6, yy(months[peakIdx].prompts) + 10, 'Peak · 1,705 prompts (Feb 2025)', 'ink halo');
        }
      } else if (mode === 'tokens') {
        const maxV = 7500000, yy = v => by + bh - (v / maxV) * bh;
        for (const [v, lbl] of [[0, '0'], [2500000, '2.5M'], [5000000, '5M'], [7500000, '7.5M']]) {
          s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
          s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
        }
        s += text(x0, by - 7, w < 500 ? 'Est. monthly tokens' : 'Estimated monthly tokens (fresh + re-sent history + output)', 'ink');
        months.forEach((m, i) => {
          const hF = (m.freshTok / maxV) * bh, hR = (m.resentTok / maxV) * bh, hO = ((m.outTok + m.reasTok) / maxV) * bh;
          const y0 = by + bh;
          const op = (rIdx && (i < rIdx[0] || i > rIdx[1])) ? ' style="opacity:0.42"' : '';
          s += rect(X(i) - bw / 2, y0 - hF, bw, hF, 'bar ink', op);
          s += rect(X(i) - bw / 2, y0 - hF - hR, bw, Math.max(0, hR - 0.5), 'bar amber', op);
          s += rect(X(i) - bw / 2, y0 - hF - hR - hO, bw, Math.max(0, hO - 0.5), 'bar on', op);
        });
        if (w >= 500) {
          const totFeb = months[peakIdx].freshTok + months[peakIdx].resentTok + months[peakIdx].outTok + months[peakIdx].reasTok;
          s += text(X(peakIdx) + 6, yy(totFeb) + 10, 'Peak · ~7.1M tokens (Feb 2025)', 'ink halo');
        }
      } else {
        const maxV = 27, yy = v => by + bh - (v / maxV) * bh;
        for (const [v, lbl] of [[0, '0'], [9, '9h'], [18, '18h'], [27, '27h']]) {
          s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
          s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
        }
        s += text(x0, by - 7, 'Recorded wall-clock thinking hours', 'ink');
        const apr25 = months.findIndex(m => m.m === '2025-04');
        if (apr25 >= 0) {
          const ax = X(apr25) - stepW / 2;
          s += line(ax, by, ax, by + bh, 'bench');
          if (w >= 520) s += text(ax - 6, by + 16, '← Timer logging begins (Apr ’25)', 'halo', 'end');
        }
        months.forEach((m, i) => {
          const hrs = m.thinkSec / 3600;
          const cls = i === sel ? 'bar amber' : 'bar on';
          s += rect(X(i) - bw / 2, yy(hrs), bw, by + bh - yy(hrs), cls, 'rx="1"');
        });
        if (w >= 520 && oct26Idx >= 0) {
          s += text(X(oct26Idx) - 8, yy(months[oct26Idx].thinkSec / 3600) + 8, 'Peak · 25.5h (Oct ’26)', 'amber halo', 'end');
        }
      }

      let lastY = '';
      months.forEach((m, i) => {
        const yr = m.m.slice(0, 4);
        if (yr !== lastY) {
          lastY = yr;
          const xx = X(i) - stepW / 2;
          s += line(xx, by + bh, xx, by + bh + 5, 'axis');
          s += text(xx + 3, by + bh + 18, yr);
        }
      });

      const sx = X(sel), sy = ty(months[sel].reasShare);
      s += line(sx, top, sx, by + bh, 'cursor');
      s += circle(sx, sy, 3.6, 'dot amber');
      s += rect(x0, top, pw, by + bh - top, 'hit');

      geo = { x0, pw, stepW, n };
      ui.view.innerHTML = svg(w, H, 'Monthly ChatGPT prompts, conversations, tokens, and thinking hours from February 2023 to November 2026', s);

      const m = months[sel];
      if (rIdx) {
        const slice = months.slice(rIdx[0], rIdx[1] + 1);
        const sConvs = slice.reduce((a, x) => a + x.convs, 0);
        const sPrompts = slice.reduce((a, x) => a + x.prompts, 0);
        const sTok = slice.reduce((a, x) => a + x.freshTok + x.resentTok + x.outTok + x.reasTok, 0);
        const sHrs = slice.reduce((a, x) => a + x.thinkSec, 0) / 3600;
        ui.summary.innerHTML = `<b>${fmtMonth(months[rIdx[0]].m)} – ${fmtMonth(months[rIdx[1]].m)}</b> · <span class="blue">${num(sPrompts)} prompts</span> (${num(sConvs)} chats)`;
        ui.out.innerHTML = `<span>Selected span (${slice.length} mo): <strong>${num(sPrompts)} prompts</strong> across <strong>${num(sConvs)} chats</strong></span><span>Est. tokens: <span class="ink">~${num(sTok / 1e6, 1)}M</span></span><span>Recorded thinking: <span class="blue">${num(sHrs, 1)}h</span></span>`;
      } else {
        ui.summary.innerHTML = `<b>${num(D.totals.prompts)} prompts</b> · <b>~${num(D.totals.allTok / 1e6, 1)}M tokens</b> · <span class="blue">${num(D.totals.thinkSec / 3600, 1)}h thinking</span>`;
        const mTok = m.freshTok + m.resentTok + m.outTok + m.reasTok;
        ui.out.innerHTML = `<span><strong>${fmtMonth(m.m)}</strong>: <strong>${num(m.prompts)} prompts</strong> in <strong>${num(m.convs)} chats</strong></span><span>Reasoning share: <span class="blue">${pct(m.reasShare, 1)}</span></span><span>Est. tokens: <strong>~${num(mTok / 1e6, 2)}M</strong> · Thinking: <span class="blue">${num(m.thinkSec / 3600, 1)}h</span></span>`;
      }
    }

    function idxAt(x) {
      if (!geo) return sel;
      return clamp(Math.floor((x - geo.x0) / geo.stepW), 0, n - 1);
    }
    ui.view.addEventListener('pointerdown', ev => {
      if (!$('svg', ui.view)) return;
      const [x] = local(ui.view, ev);
      dragStart = idxAt(x);
      sel = dragStart;
      range = null;
      draw();
    });
    ui.view.addEventListener('pointermove', ev => {
      if (!$('svg', ui.view)) return;
      const [x] = local(ui.view, ev);
      const i = idxAt(x);
      if (dragStart !== null && ev.buttons === 1) {
        const a = Math.min(dragStart, i), b = Math.max(dragStart, i);
        range = a === b ? null : [months[a].m, months[b].m];
      }
      if (i !== sel || dragStart !== null) { sel = i; draw(); }
    });
    window.addEventListener('pointerup', () => { dragStart = null; });
    keys(ui.view, d => { range = null; sel = clamp(sel + d, 0, n - 1); draw(); });
    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) { mode = ds.view; press(ui.bar, mode); }
      range = ds.range ? ds.range.split(',') : null;
      if (ds.month) {
        const i = months.findIndex(m => m.m === ds.month);
        if (i >= 0) sel = i;
      }
      draw();
    };
  }

  // ------------------------- Figure 2: Spectral TF-IDF Topic Map & Covariance Ellipses
  function atlas(fig, D) {
    const clusters = D.clusters, A = D.atlas, quarters = D.quarters;
    let mode = 'map', yr = 'all', selCluster = 0;

    const pillsHtml = `<div class="oai-pills" role="group" aria-label="Year filter">${[['all', 'All'], ['2023', '’23'], ['2024', '’24'], ['2025', '’25'], ['2026', '’26']].map(([k, l]) => `<button type="button" data-yr="${k}" aria-pressed="${k === yr}">${l}</button>`).join('')}</div>`;
    const ui = shell(fig, tabs('Topic view', [
      ['map', 'Spectral TF-IDF map'],
      ['stream', 'Quarterly topic stream'],
    ], mode) + pillsHtml);

    function draw() {
      const w = width(ui.view);
      if (mode === 'stream') {
        ui.leg.innerHTML = `<div class="oai-pills" style="margin-bottom:8px">${clusters.map((c, i) => `<button type="button" data-cl="${i}" aria-pressed="${i === selCluster}">${c.short.split(' ')[0].replace(/[,:]$/, '')}</button>`).join('')}</div>` + legend([
          ['blue', 'Selected cluster conversations per quarter'],
          ['amber', 'Peak quarter for selected cluster'],
          ['mid', 'Other clusters'],
        ]);
        const x0 = w < 460 ? 116 : 158, rCol = w < 460 ? 44 : 58, pw = w - x0 - rCol - 8;
        const top = 22, rowH = 27, bh = clusters.length * rowH, H = top + bh + 24;
        const qn = quarters.length, stepW = pw / qn, bw = Math.max(2.5, stepW * 0.78);
        const X = i => x0 + (i + 0.5) * stepW;
        let s = '';

        quarters.forEach((q, i) => {
          if (q.q.endsWith('Q1')) {
            const xx = X(i) - stepW / 2;
            s += line(xx, top, xx, top + bh, i === 0 ? 'axis' : 'grid');
            s += text(xx + 2, top - 6, q.q.slice(0, 4), 'small');
          }
        });
        s += text(w - 4, top - 6, 'Chats', 'ink', 'end');

        clusters.forEach((cl, ci) => {
          const y = top + ci * rowH, base = y + rowH - 4, isSel = ci === selCluster;
          const series = quarters.map(q => q.clusters[ci]);
          const maxV = Math.max(...series, 1), peakQ = series.indexOf(maxV);
          if (isSel) s += rect(2, y + 1, w - 4, rowH - 2, 'gap-band', 'rx="2"');
          s += `<g data-topic="${ci}">`;
          const lbl = w < 460 && cl.short.length > 16 ? cl.short.slice(0, 15) + '…' : cl.short;
          s += text(x0 - 8, y + rowH * 0.64, lbl, isSel ? 'strong' : 'ink', 'end');
          s += line(x0, base, x0 + pw, base, 'grid');
          series.forEach((v, qi) => {
            if (!v) return;
            const h = (v / maxV) * (rowH - 8);
            const cls = qi === peakQ && isSel ? 'bar amber' : isSel ? 'bar on' : 'bar mid';
            s += rect(X(qi) - bw / 2, base - h, bw, h, cls, 'rx="1"');
          });
          s += text(w - 4, y + rowH * 0.64, num(cl.total), isSel ? 'blue' : 'ink', 'end');
          s += rect(0, y, w, rowH, 'hit');
          s += `</g>`;
        });

        ui.view.innerHTML = svg(w, H, 'Quarterly conversation volume across nine TF-IDF topic clusters', s);
        const cur = clusters[selCluster];
        ui.summary.innerHTML = `<b>${esc(cur.name)}</b>: <span class="blue">${num(cur.total)} chats</span> (${pct(cur.total / D.totals.conversations, 1)})`;
        ui.out.innerHTML = `<span><strong>${esc(cur.name)}</strong> (${esc(cur.sub)})</span><span>By year: ’23: <strong>${num(cur.byYear[0])}</strong> · ’24: <strong>${num(cur.byYear[1])}</strong> · ’25: <strong>${num(cur.byYear[2])}</strong> · ’26: <strong>${num(cur.byYear[3])}</strong></span>`;
        all('[data-topic]', ui.view).forEach(g => g.addEventListener('click', () => { selCluster = Number(g.dataset.topic); draw(); }));
        all('[data-cl]', ui.leg).forEach(b => b.addEventListener('click', () => { selCluster = Number(b.dataset.cl); draw(); }));
        return;
      }

      // Spectral TF-IDF Map with empirical 1.85-sigma rotated covariance ellipses
      ui.leg.innerHTML = legend([
        ['blue', 'Selected cluster & empirical covariance ellipse'],
        ['mid', 'Other TF-IDF micro-clusters'],
        ['amber', 'Yearly mean centroid (2023 → 2026)'],
      ]);

      const padX = 16, padY = 16, mapH = w < 500 ? 270 : 308, H = mapH + 12;
      const pw = w - padX * 2, ph = mapH - padY * 2;
      const mx = x => padX + ((x + 1) / 2) * pw;
      const my = y => padY + ((y + 1) / 2) * ph;
      const yIdx = { '2023': 0, '2024': 1, '2025': 2, '2026': 3 }[yr];
      let s = '';

      s += rect(padX, padY, pw, ph, 'gap-band', 'rx="8"');
      s += line(mx(0), padY + 8, mx(0), padY + ph - 8, 'grid');
      s += line(padX + 8, my(0), padX + pw - 8, my(0), 'grid');
      if (w >= 460) {
        s += text(padX + 12, padY + 16, '← Axis 1: Math, code & ML systems', 'small');
        s += text(padX + pw - 12, padY + 16, 'Writing, career & daily life →', 'small', 'end');
      }

      const cellVal = c => yIdx !== undefined ? c.yrs[yIdx] : c.n;

      // Empirical rotated covariance ellipses from build_data.py
      clusters.forEach((cl, ci) => {
        const cx = mx(cl.ax), cy = my(cl.ay);
        const rx = clamp((cl.rx || 0.22) * (pw / 2) * 0.68, 26, w < 500 ? 44 : 64);
        const ry = clamp(Math.max((cl.ry || 0.18) * (ph / 2) * 0.68, rx * 0.66), 20, w < 500 ? 32 : 46);
        const ang = (cl.angle || 0) * 0.45;
        const isSel = ci === selCluster;
        s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(ang)} ${f(cx)} ${f(cy)})" class="island-hull${isSel ? ' active' : ''}" data-topic="${ci}"/>`;
      });

      // Draw organic continuous micro-cluster point clouds
      const maxCell = Math.max(...A.cells.map(cellVal), 1);
      A.cells.forEach(c => {
        const v = cellVal(c);
        if (!v) return;
        const cx = mx(c.x), cy = my(c.y);
        const r = clamp(1.9 + Math.sqrt(v / maxCell) * (w < 460 ? 7.2 : 10.2), 1.9, 12);
        const isSel = c.c === selCluster;
        const cls = isSel ? 'dot blue' : 'dot mid';
        const op = isSel ? '0.82' : '0.35';
        s += circle(cx, cy, r, cls, `style="opacity:${op}" data-topic="${c.c}"`);
      });

      // Draw 2023 -> 2026 empirical centroid shift
      const cents = A.centroids;
      let trail = '';
      cents.forEach((pt, i) => {
        const cx = mx(pt.x), cy = my(pt.y);
        trail += (i === 0 ? 'M' : 'L') + `${f(cx)},${f(cy)}`;
      });
      s += `<path d="${trail}" class="step amber" style="stroke-width:2.2"/>`;
      cents.forEach((pt, i) => {
        const cx = mx(pt.x), cy = my(pt.y);
        const isYr = yr === pt.year;
        s += circle(cx, cy, isYr ? 5.2 : 3.8, 'dot amber');
        const dx = i === 0 ? 6 : i === 1 ? -7 : i === 2 ? 7 : 0;
        const dy = i === 0 ? 13 : i === 1 ? 4 : i === 2 ? -6 : -8;
        const anc = i === 0 ? 'start' : i === 1 ? 'end' : i === 2 ? 'start' : 'middle';
        s += text(cx + dx, cy + dy, '’' + pt.year.slice(2), 'small amber halo', anc);
      });

      // Position cluster labels cleanly along the outer rim of each island with leader ticks
      const RIM_OFFSETS = [
        [0, -22, 'middle'],   // 0 Deep Learning
        [0, -20, 'middle'],   // 1 LLMs, Agents & RL
        [-8, 22, 'start'],    // 2 Math & Proofs
        [0, -20, 'middle'],   // 3 Web & Game Engines
        [-8, -18, 'end'],     // 4 Python, SQL & Infra
        [0, 22, 'middle'],    // 5 Markets & Airfares
        [0, 22, 'middle'],    // 6 Career & Cover Letters
        [8, -20, 'end'],      // 7 Writing & Languages
        [8, 22, 'end'],       // 8 Daily Life & Travel
      ];
      clusters.forEach((cl, ci) => {
        const cx = mx(cl.ax), cy = my(cl.ay), isSel = ci === selCluster;
        const cnt = yIdx !== undefined ? cl.byYear[yIdx] : cl.total;
        const [ox, oy, anc] = RIM_OFFSETS[ci] || [0, -18, 'middle'];
        const lx = clamp(cx + ox, padX + 8, padX + pw - 8);
        const ly = clamp(cy + oy, padY + 14, padY + ph - 6);
        const shortLbl = w < 520 ? cl.short.split(' ')[0].replace(/[,:]$/, '') : cl.short;
        s += `<g data-topic="${ci}">`;
        s += line(cx, cy, lx, ly + (oy < 0 ? 4 : -8), 'leader');
        s += circle(cx, cy, isSel ? 4.8 : 3.2, isSel ? 'dot amber' : 'dot ink');
        s += text(lx, ly, `${shortLbl} (${num(cnt)})`, isSel ? 'strong halo' : 'ink halo', anc);
        s += circle(cx, cy, 24, 'hit');
        s += `</g>`;
      });

      ui.view.innerHTML = svg(w, H, '2D spectral TF-IDF topic map of 12,429 conversations with empirical covariance ellipses', s);
      const cur = clusters[selCluster];
      const shownCnt = yIdx !== undefined ? cur.byYear[yIdx] : cur.total;
      const yrTot = yIdx !== undefined ? A.centroids[yIdx].n : D.totals.conversations;
      ui.summary.innerHTML = `<b>${esc(cur.short)}</b> · <span class="blue">${num(shownCnt)} chats</span> (${pct(shownCnt / (yrTot || 1), 1)} of ${yr === 'all' ? 'archive' : yr})`;
      ui.out.innerHTML = `<span><strong>${esc(cur.name)}</strong>: ${esc(cur.sub)}</span><span>2023 → 2026 trajectory: <strong>${num(cur.byYear[0])}</strong> (’23) → <strong>${num(cur.byYear[1])}</strong> (’24) → <strong>${num(cur.byYear[2])}</strong> (’25) → <span class="blue">${num(cur.byYear[3])}</span> (’26)</span>`;

      all('[data-topic]', ui.view).forEach(el => {
        el.addEventListener('click', () => { selCluster = Number(el.dataset.topic); draw(); });
      });
    }

    all('[data-yr]', ui.bar).forEach(b => {
      b.addEventListener('click', () => {
        yr = b.dataset.yr;
        all('[data-yr]', ui.bar).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.yr === yr)));
        draw();
      });
    });
    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) { mode = ds.view; press(ui.bar, mode); }
      if (ds.year) {
        yr = ds.year;
        all('[data-yr]', ui.bar).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.yr === yr)));
      }
      if (ds.cluster !== undefined) selCluster = Number(ds.cluster);
      draw();
    };
  }

  // -------------------------------------- Figure 3: 6 model generations & slugs
  function models(fig, D) {
    const months = D.months, n = months.length, slugs = D.topSlugs;
    const GENS = [
      ['f0', 'GPT-3.5'],
      ['f1', 'GPT-4'],
      ['f2', 'GPT-4o & 4.5'],
      ['f3', 'o-series (o1–o4)'],
      ['f4', 'GPT-5 family'],
      ['f5', 'GPT-6 family'],
    ];
    const genCounts = m => [
      m.fams[0],
      m.fams[1],
      m.fams[2],
      m.fams[3],
      m.fams[4] + m.fams[5],
      m.fams[6] + m.fams[7],
    ];

    let mode = 'share', sel = months.findIndex(m => m.m === '2025-02'), selSlug = 1, focusGen = null, geo = null;

    const ui = shell(fig, tabs('Model view', [
      ['share', 'Monthly share (%)'],
      ['catalog', 'Top 16 model slugs'],
    ], mode));

    function syncLegend() {
      if (mode === 'catalog') {
        ui.leg.innerHTML = legend([
          ['blue', 'Reasoning / Thinking model'],
          ['ink', 'Standard chat model'],
          ['amber', 'Selected slug'],
        ]);
      } else {
        ui.leg.innerHTML = legend(GENS.map(([c, label], gi) => [
          c + (focusGen === gi ? ' active' : ''),
          label,
          gi,
        ]));
        all('[data-pick]', ui.leg).forEach(el => {
          el.addEventListener('click', () => {
            const g = Number(el.dataset.pick);
            focusGen = focusGen === g ? null : g;
            draw();
          });
        });
      }
    }

    function draw() {
      syncLegend();
      const w = width(ui.view);
      if (mode === 'catalog') {
        const x0 = w < 460 ? 118 : 148, rCol = w < 460 ? 52 : 68, pw = w - x0 - rCol - 8;
        const top = 22, rowH = 22, bh = slugs.length * rowH, H = top + bh + 26;
        const t0 = ms('2023-02-01'), t1 = ms('2026-11-20');
        const tx = s => x0 + clamp((ms(s) - t0) / (t1 - t0), 0, 1) * pw;
        let s = '';

        for (const yr of ['2023', '2024', '2025', '2026']) {
          const xx = tx(yr + '-01-01');
          s += line(xx, top, xx, top + bh, yr === '2023' ? 'axis' : 'grid');
          s += text(xx + 2, top - 6, w < 520 ? '’' + yr.slice(2) : yr, 'small');
        }
        s += line(x0, top + bh, x0 + pw, top + bh, 'axis');
        s += text(w - 4, top - 6, 'Nodes', 'ink', 'end');

        slugs.forEach((item, i) => {
          const y = top + i * rowH, cy = y + rowH / 2;
          const isSel = i === selSlug;
          const isReas = item.family.includes('Thinking') || item.family.includes('o-series');
          if (isSel) s += rect(2, y + 1, w - 4, rowH - 2, 'gap-band', 'rx="2"');
          const lbl = w < 460 && item.slug.length > 15 ? item.slug.slice(0, 14) + '…' : item.slug;
          s += `<g data-slug="${i}">`;
          s += line(x0, cy, x0 + pw, cy, 'grid');
          s += text(x0 - 8, cy + 3.5, lbl, isSel ? 'mono strong' : 'mono ink', 'end');
          const xStart = tx(item.first), xEnd = Math.max(xStart + 5, tx(item.last));
          const barCls = isSel ? 'bar amber' : isReas ? 'bar on' : 'bar ink';
          s += rect(xStart, cy - 5, xEnd - xStart, 10, barCls, 'rx="2.5"');
          s += text(w - 4, cy + 3.5, num(item.nodes), isSel ? 'strong' : 'ink', 'end');
          s += rect(0, y, w, rowH, 'hit');
          s += `</g>`;
        });

        geo = null;
        ui.view.innerHTML = svg(w, H, 'Top 16 ChatGPT model slugs by active date range and assistant node count', s);
        const cur = slugs[selSlug];
        ui.summary.innerHTML = `<b>57 model slugs</b> · selected: <span class="blue">${esc(cur.slug)}</span>`;
        ui.out.innerHTML = `<span><strong>${esc(cur.slug)}</strong> (${esc(cur.family)})</span><span>Active: <span class="ink">${fmtDate(cur.first)} – ${fmtDate(cur.last)}</span></span><span>Nodes: <strong>${num(cur.nodes)}</strong> · Final replies: <strong>${num(cur.replies)}</strong> · Est. API value: <span class="amber">~$${num(cur.apiCost, 0)}</span></span>`;
        all('[data-slug]', ui.view).forEach(g => {
          g.addEventListener('click', () => { selSlug = Number(g.dataset.slug); draw(); });
          g.addEventListener('pointerenter', () => { selSlug = Number(g.dataset.slug); draw(); });
        });
        return;
      }

      const x0 = 46, pw = w - x0 - 12, top = 22, bh = w < 500 ? 186 : 214, H = top + bh + 28;
      const stepW = pw / n, bw = Math.max(2, stepW - 0.9);
      const X = i => x0 + (i + 0.5) * stepW;
      let s = '';

      const yy = v => top + bh - v * bh;
      for (const [v, lbl] of [[0, '0%'], [0.5, '50%'], [1, '100%']]) {
        s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
        s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
      }
      months.forEach((m, i) => {
        const gc = genCounts(m), tot = m.replies || 1;
        let acc = 0;
        gc.forEach((cnt, gi) => {
          if (!cnt) return;
          const h = (cnt / tot) * bh, y = top + bh - acc - h;
          acc += h;
          const dim = focusGen !== null && focusGen !== gi ? ' style="opacity:0.22"' : '';
          s += rect(X(i) - bw / 2, y, bw, h + 0.3, GENS[gi][0], dim);
        });
      });
      if (w >= 540) {
        const eras = [
          [1.5, '3.5'],
          [9, 'GPT-4'],
          [19, 'GPT-4o'],
          [25, 'o1 / o3'],
          [36, 'GPT-5 Thinking'],
          [44.3, 'GPT-6'],
        ];
        eras.forEach(([idx, lbl]) => {
          s += text(X(idx), top - 6, lbl, 'small strong', 'middle');
        });
      }

      let lastY = '';
      months.forEach((m, i) => {
        const yr = m.m.slice(0, 4);
        if (yr !== lastY) {
          lastY = yr;
          const xx = X(i) - stepW / 2;
          s += line(xx, top + bh, xx, top + bh + 5, 'axis');
          s += text(xx + 3, top + bh + 18, yr);
        }
      });

      const sx = X(sel);
      s += line(sx, top, sx, top + bh, 'cursor');
      s += rect(x0, top, pw, bh, 'hit');
      geo = { x0, stepW };
      ui.view.innerHTML = svg(w, H, 'Monthly assistant replies broken down across six OpenAI model generations', s);

      const m = months[sel], gc = genCounts(m);
      const topGi = gc.reduce((b, v, i) => v > gc[b] ? i : b, 0);
      ui.summary.innerHTML = `<b>25,518 final replies</b> across 6 model generations`;
      const parts = GENS.map(([, name], gi) => gc[gi] ? `${name}: <strong>${num(gc[gi])}</strong> (${pct(gc[gi] / (m.replies || 1), 0)})` : '').filter(Boolean);
      ui.out.innerHTML = `<span><strong>${fmtMonth(m.m)}</strong> (${num(m.replies)} replies) · Lead: <span class="blue">${GENS[topGi][1]}</span></span><span>${parts.join(' · ')}</span>`;
    }

    hover(ui.view, x => {
      if (!geo || mode === 'catalog') return;
      const i = clamp(Math.floor((x - geo.x0) / geo.stepW), 0, n - 1);
      if (i !== sel) { sel = i; draw(); }
    });
    keys(ui.view, d => {
      if (mode === 'catalog') selSlug = clamp(selSlug + d, 0, slugs.length - 1);
      else sel = clamp(sel + d, 0, n - 1);
      draw();
    });
    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) {
        mode = ds.view === 'counts' ? 'share' : ds.view;
        press(ui.bar, mode);
      }
      if (ds.month) {
        const i = months.findIndex(m => m.m === ds.month);
        if (i >= 0) sel = i;
      }
      if (ds.slug) {
        const i = slugs.findIndex(s => s.slug === ds.slug);
        if (i >= 0) selSlug = i;
      }
      draw();
    };
  }

  // -------------------- Figure 4: Turn X-ray barcode & unified log10 quantiles
  function thinking(fig, D) {
    const xrays = D.turnXrays, models = D.thinkingModels.slice(0, 8), efforts = D.thinkingEfforts;
    let mode = 'xray', selXray = 1, selRow = 1;

    const ui = shell(fig, tabs('Reasoning view', [
      ['xray', 'Turn X-ray (6 marathon runs)'],
      ['models', 'By model & effort (log₁₀)'],
    ], mode));

    const CLEAN_LABELS = {
      'Minecraft Explainer Video': 'Minecraft explainer video',
      'RelFlow competitor analysis': 'RelFlow competitor analysis',
      'TabPFN Explainer Video': 'TabPFN explainer video',
      'Competitor Analysis Benchmark': 'Competitor benchmark',
      'Compare OPT Volume': 'Compare OPT volume',
      'Poker Solver PowerPoint': 'Poker solver PowerPoint',
    };

    function draw() {
      const w = width(ui.view);
      if (mode === 'xray') {
        ui.leg.innerHTML = legend([
          ['blue', 'Internal thought block (T)'],
          ['amber', 'Mid-turn commentary update (C)'],
          ['ink', 'Final visible reply (F)'],
        ]);
        const x0 = w < 500 ? 116 : 184, rCol = w < 500 ? 48 : 66, pw = w - x0 - rCol - 8;
        const top = 20, rowH = 26, bh = xrays.length * rowH;
        const zTop = top + bh + 38, zBh = 104, H = zTop + zBh + 28;
        let s = '';

        s += text(x0 - 8, top - 6, 'Marathon turn', 'ink strong', 'end');
        s += text(x0, top - 6, w < 500 ? 'Node sequence' : 'Sequential assistant nodes in mapping tree (left → right)', 'ink');
        s += text(w - 4, top - 6, 'Duration', 'ink', 'end');

        xrays.forEach((x, i) => {
          const y = top + i * rowH, cy = y + rowH / 2, isSel = i === selXray;
          if (isSel) s += rect(2, y + 1, w - 4, rowH - 2, 'gap-band', 'rx="2"');
          const clean = CLEAN_LABELS[x.title] || x.title;
          const shortTitle = w < 500 && clean.length > 15 ? clean.slice(0, 14) + '…' : clean;
          s += `<g data-i="${i}">`;
          s += text(x0 - 8, cy + 4, shortTitle, isSel ? 'strong' : 'ink', 'end');
          const m = x.seq.length, sw = pw / m;
          x.seq.forEach(([kind, words], si) => {
            const cls = kind === 'T' ? 'bar on' : kind === 'C' ? 'bar amber' : 'bar ink';
            const h = kind === 'F' ? 15 : clamp(5 + Math.sqrt(words / 160) * 9.5, 5, 15);
            s += rect(x0 + si * sw, cy - h / 2, Math.max(1.1, sw - 0.6), h, cls, 'rx="0.6"');
          });
          s += text(w - 4, cy + 4, fmtDur(x.sec), isSel ? 'amber' : 'ink', 'end');
          s += rect(0, y, w, rowH, 'hit');
          s += `</g>`;
        });

        const cur = xrays[selXray], seq = cur.seq, m = seq.length;
        const cleanCur = CLEAN_LABELS[cur.title] || cur.title;
        s += line(4, zTop - 22, w - 4, zTop - 22, 'grid');
        const zoomTitle = w < 520
          ? `Words per node (${m} nodes in selected turn)`
          : `Internal node rhythm in "${cleanCur}" (${m} nodes · ${num(cur.tWords)} thought words → ${num(cur.fWords)}w final reply)`;
        s += text(4, zTop - 7, zoomTitle, 'ink strong');

        const internalWords = seq.slice(0, -1).map(d => d[1]);
        const maxInternal = Math.max(...internalWords, 60);
        const yy = v => zTop + zBh - (Math.sqrt(clamp(v, 0, maxInternal)) / Math.sqrt(maxInternal)) * zBh;
        s += line(x0, zTop + zBh, x0 + pw, zTop + zBh, 'axis');
        s += line(x0, zTop, x0 + pw, zTop, 'grid');
        s += text(x0 - 6, zTop + 9, `${num(maxInternal)}w`, 'small', 'end');
        s += text(x0 - 6, zTop + zBh, '0w', 'small', 'end');

        const stepW = pw / m, bw = Math.max(1.5, stepW * 0.8);
        seq.forEach(([kind, words], si) => {
          const isFinal = kind === 'F' || si === m - 1;
          const cls = isFinal ? 'bar ink' : kind === 'T' ? 'bar on' : 'bar amber';
          const yVal = isFinal ? zTop : yy(Math.max(1, words));
          const wBar = isFinal ? Math.max(3.5, bw) : bw;
          s += rect(x0 + si * stepW, yVal, wBar, zTop + zBh - yVal, cls, 'rx="0.6"');
        });
        if (w >= 500) {
          s += text(x0 + pw - 6, zTop + 13, `Final reply (${num(cur.fWords)}w) →`, 'small strong halo', 'end');
        }
        s += text(x0, zTop + zBh + 16, w < 500 ? 'Node 1' : 'Node 1 (prompt sent)', 'small');
        s += text(x0 + pw, zTop + zBh + 16, w < 500 ? `Node ${m}` : `Node ${m} (final answer)`, 'small', 'end');

        ui.view.innerHTML = svg(w, H, 'Node-by-node X-ray barcode of six marathon reasoning turns', s);
        ui.summary.innerHTML = `<b>${esc(cleanCur)}</b> · <span class="amber">${fmtDur(cur.sec)}</span> (${m} nodes)`;
        ui.out.innerHTML = `<span><strong>${esc(cleanCur)}</strong> (${cur.date}, <code>${esc(cur.model)}</code>): <strong>${m} assistant nodes</strong></span><span>Thoughts: <span class="blue">${cur.tBlocks} blocks</span> (${cur.tSteps} steps, <strong>${num(cur.tWords)} words</strong>) · Commentary: <span class="amber">${cur.cBlocks} updates</span> (${num(cur.cWords)} words)${cur.searches ? ` · Web searches: <strong>${cur.searches}</strong>` : ''} · Final reply: <strong>${num(cur.fWords)} words</strong></span>`;
        all('[data-i]', ui.view).forEach(g => g.addEventListener('click', () => { selXray = Number(g.dataset.i); draw(); }));
        return;
      }

      // Unified log10 duration quantiles by model (top) and effort tier (bottom)
      ui.leg.innerHTML = legend([
        ['soft', '25th–75th percentile (IQR box) & median'],
        ['line', '10th–90th percentile whisker'],
        ['amber', 'Longest single turn (dot)'],
      ]);
      const combined = [...models, ...efforts];
      const x0 = w < 460 ? 116 : 138, rCol = w < 460 ? 58 : 76, pw = w - x0 - rCol - 8;
      const top = 22, rowH = 22, gapMid = 20;
      const bh = combined.length * rowH + gapMid, H = top + bh + 18;
      const lx = sec => x0 + (Math.log10(clamp(sec, 1, 5000)) / Math.log10(5000)) * pw;
      let s = '';

      for (const [sec, lbl] of [[1, '1s'], [10, '10s'], [60, '1m'], [600, '10m'], [3600, '1h']]) {
        const xx = lx(sec);
        s += line(xx, top, xx, top + bh, sec === 1 ? 'axis' : 'grid');
        s += text(xx, top - 6, lbl, '', 'middle');
      }
      s += text(w - 4, top - 6, w < 500 ? 'Hours' : 'Total · med', 'ink', 'end');

      const divY = top + models.length * rowH + gapMid / 2;
      s += line(4, divY, w - 4, divY, 'axis');

      combined.forEach((m, i) => {
        const y = top + i * rowH + (i >= models.length ? gapMid : 0);
        const cy = y + rowH / 2, isSel = i === selRow;
        if (isSel) s += rect(2, y + 1, w - 4, rowH - 2, 'gap-band', 'rx="2"');
        const isModel = i < models.length;
        s += `<g data-i="${i}">`;
        s += text(x0 - 8, cy + 3.5, m.label, isSel ? (isModel ? 'mono strong' : 'strong') : (isModel ? 'mono ink' : 'ink'), 'end');
        s += line(lx(m.p10), cy, lx(m.p90), cy, isSel ? 'whisker blue' : 'whisker');
        const bx0 = lx(m.p25), bx1 = Math.max(bx0 + 3, lx(m.p75));
        s += rect(bx0, cy - 5, bx1 - bx0, 10, isSel ? 'iqr amber' : 'iqr', 'rx="2"');
        s += line(lx(m.med), cy - 6, lx(m.med), cy + 6, isSel ? 'med-line amber' : 'med-line');
        s += circle(lx(m.max), cy, 2.8, isSel ? 'dot amber' : 'dot blue');
        s += text(w - 4, cy + 3.5, `${num(m.hours, 1)}h · ${fmtDur(m.med)}`, isSel ? 'strong' : '', 'end');
        s += rect(0, y, w, rowH, 'hit');
        s += `</g>`;
      });

      ui.view.innerHTML = svg(w, H, 'Log-scale thinking duration quantiles across top reasoning models and effort tiers', s);
      const cm = combined[selRow];
      ui.summary.innerHTML = `<b>96.3 hours</b> across 6,438 timed turns · selected: <span class="blue">${esc(cm.label)}</span>`;
      ui.out.innerHTML = `<span><strong>${esc(cm.label)}</strong> (${num(cm.n)} timed turns, <span class="blue">${num(cm.hours, 2)}h</span>): median <strong>${fmtDur(cm.med)}</strong>, IQR ${fmtDur(cm.p25)}–${fmtDur(cm.p75)}, p90 ${fmtDur(cm.p90)}, max <span class="amber">${fmtDur(cm.max)}</span></span>`;
      all('[data-i]', ui.view).forEach(g => g.addEventListener('click', () => { selRow = Number(g.dataset.i); draw(); }));
    }

    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) {
        mode = ds.view === 'effort' ? 'models' : ds.view;
        press(ui.bar, mode);
      }
      if (ds.xray !== undefined) selXray = Number(ds.xray);
      if (ds.model) {
        const i = models.findIndex(m => m.label === ds.model);
        if (i >= 0) selRow = i;
      }
      if (ds.effort) {
        const i = efforts.findIndex(e => e.label.startsWith(ds.effort));
        if (i >= 0) selRow = models.length + i;
      }
      draw();
    };
  }

  // ------------ Figure 5: Real branching DAG trees & Kaplan-Meier survival curve
  function trees(fig, D) {
    const T = D.turns, sampleTrees = T.sampleTrees, surv = T.survival.slice(0, 12);
    let mode = 'trees', selTree = 0, selK = 0;

    const ui = shell(fig, tabs('Structure view', [
      ['trees', 'Branching trees (1,641)'],
      ['survival', 'Kaplan–Meier survival'],
    ], mode));

    function layoutTree(nodes) {
      const ch = Array.from({ length: nodes.length }, () => []);
      nodes.forEach(([, , p], i) => { if (p >= 0) ch[p].push(i); });
      const depth = new Array(nodes.length).fill(0);
      const yPos = new Array(nodes.length).fill(0);
      let leafIdx = 0, deepestNode = 0;
      function dfs(u, d) {
        depth[u] = d;
        if (d >= depth[deepestNode]) deepestNode = u;
        if (ch[u].length === 0) {
          yPos[u] = leafIdx++;
        } else {
          ch[u].forEach(v => dfs(v, d + 1));
          yPos[u] = ch[u].reduce((a, v) => a + yPos[v], 0) / ch[u].length;
        }
      }
      dfs(0, 0);
      const mainPath = new Set();
      let cur = deepestNode;
      while (cur >= 0) {
        mainPath.add(cur);
        cur = nodes[cur][2];
      }
      return { ch, depth, yPos, maxD: Math.max(...depth, 1), leaves: Math.max(leafIdx, 1), mainPath };
    }

    function draw() {
      const w = width(ui.view);
      if (mode === 'trees') {
        const treeLabels = ['PPCA (23 leaves)', '21-way root fan', 'JC Summary (15)', 'Flight data (98n)', 'Bayesian (13)'];
        ui.leg.innerHTML = `<div class="oai-pills" style="margin-bottom:8px">${sampleTrees.map((t, i) => `<button type="button" data-tree-pick="${i}" aria-pressed="${i === selTree}">${treeLabels[i] || t.title}</button>`).join('')}</div>` + legend([
          ['line', 'Deepest active thread'],
          ['dash', 'Edited / forked sibling branch'],
          ['blue', 'My prompt (U)'],
          ['ink', 'Assistant reply (A)'],
        ]);

        const cur = sampleTrees[selTree], nodes = cur.nodes;
        const { ch, depth, yPos, maxD, leaves, mainPath } = layoutTree(nodes);
        const padX = 28, padY = 22, treeH = w < 500 ? 202 : 232, H = treeH + 38;
        const tx = d => padX + (d / maxD) * (w - padX * 2);
        const ty = y => padY + (leaves <= 1 ? 0.5 : y / (leaves - 1)) * (treeH - padY * 2);
        let s = '';

        const stepD = maxD > 12 ? 2 : 1;
        for (let d = 0; d <= maxD; d += stepD) {
          const xx = tx(d);
          s += line(xx, 10, xx, treeH + 6, d === 0 ? 'axis' : 'grid');
          if (d === 0) s += text(xx, treeH + 22, 'Root', 'small', 'middle');
          else if (d === maxD) s += text(xx, treeH + 22, `Depth ${d}`, 'small ink', 'end');
          else if (w >= 460 && d % (stepD * 2) === 0) s += text(xx, treeH + 22, `d=${d}`, 'small', 'middle');
        }

        nodes.forEach(([, , p], i) => {
          if (p < 0) return;
          const x1 = tx(depth[p]), y1 = ty(yPos[p]), x2 = tx(depth[i]), y2 = ty(yPos[i]);
          const mx = (x1 + x2) / 2;
          const isMain = mainPath.has(p) && mainPath.has(i);
          const isFork = ch[p].length > 1;
          const cls = isMain ? 'tree-edge active' : isFork ? 'tree-edge branch' : 'tree-edge';
          s += `<path d="M${f(x1)},${f(y1)} C${f(mx)},${f(y1)} ${f(mx)},${f(y2)} ${f(x2)},${f(y2)}" class="${cls}"/>`;
        });

        nodes.forEach(([role, words], i) => {
          const cx = tx(depth[i]), cy = ty(yPos[i]);
          const r = i === 0 ? 4.4 : clamp(2.4 + Math.sqrt(words / 200) * 2.2, 2.4, 5.2);
          const cls = i === 0 ? 'dot amber' : role === 'U' ? 'dot blue' : 'dot ink';
          s += circle(cx, cy, r, cls);
        });

        ui.view.innerHTML = svg(w, H, `Conversation tree topology for ${cur.title} with ${cur.leaves} leaves and ${nodes.length} nodes`, s);
        ui.summary.innerHTML = `<b>1,641 branching trees</b> · <span class="blue">2,088 prompt edits (70.3%)</span> vs. 883 regenerations`;
        ui.out.innerHTML = `<span><strong>${esc(cur.title)}</strong> (${cur.date}): <strong>${cur.leaves} leaf branches</strong> across <strong>${nodes.length} nodes</strong> (max fan-out: ${cur.maxFan})</span><span>Archive total: <strong>2,088 prompt edits</strong> vs. <strong>883 regenerations</strong> across 2,211 branch points</span>`;

        all('[data-tree-pick]', ui.leg).forEach(b => {
          b.addEventListener('click', () => { selTree = Number(b.dataset.treePick); draw(); });
        });
        return;
      }

      ui.leg.innerHTML = legend([
        ['blue', 'Kaplan–Meier survival S(k): share of chats reaching turn k'],
        ['amber', 'Continuation probability P(turn k+1 | turn k) — Lindy effect'],
      ]);
      const x0 = 46, pw = w - x0 - 14, top = 18, bh = 188, H = top + bh + 28;
      const sn = surv.length, X = i => x0 + (i / (sn - 1)) * pw, yy = v => top + bh - clamp(v, 0, 1) * bh;
      let s = '';

      for (const [v, lbl] of [[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']]) {
        s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
        s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
      }

      let sPath = '', sArea = '', cPath = '';
      surv.forEach((r, i) => {
        const xx = X(i), ys = yy(r.survival), yc = yy(r.contRate);
        sPath += (i === 0 ? 'M' : 'L') + `${f(xx)},${f(ys)}`;
        sArea += (i === 0 ? `M${f(xx)},${f(yy(0))}L` : 'L') + `${f(xx)},${f(ys)}`;
        if (i === sn - 1) sArea += `L${f(xx)},${f(yy(0))}Z`;
        cPath += (i === 0 ? 'M' : 'L') + `${f(xx)},${f(yc)}`;
      });
      s += `<path d="${sArea}" class="area"/><path d="${sPath}" class="step blue"/>`;
      s += `<path d="${cPath}" class="step amber" style="stroke-width:2"/>`;

      surv.forEach((r, i) => {
        const xx = X(i), isSel = i === selK;
        if (isSel) s += line(xx, top, xx, top + bh, 'cursor');
        s += `<g data-i="${i}">`;
        s += circle(xx, yy(r.survival), isSel ? 4.4 : 3, 'dot blue');
        s += circle(xx, yy(r.contRate), isSel ? 4.4 : 3, 'dot amber');
        if (i === 0 || i === 1 || i === 3 || i === 5 || i === 8 || i === 11) {
          s += text(xx, top + bh + 18, `T${r.k}`, 'small', 'middle');
        }
        s += rect(xx - pw / sn / 2, top, pw / sn, bh, 'hit');
        s += `</g>`;
      });

      if (w >= 520) {
        s += text(X(5) + 6, yy(surv[5].contRate) - 8, '69.0% continue past Turn 6', 'amber halo');
        s += text(X(1) + 8, yy(surv[1].survival) + 14, '39.8% reach Turn 2', 'blue halo');
      }

      ui.view.innerHTML = svg(w, H, 'Kaplan-Meier conversation survival curve and turn-continuation probability from Turn 1 to Turn 12', s);
      const cur = surv[selK];
      ui.summary.innerHTML = `<b>Turn ${cur.k}</b>: survival <span class="blue">${pct(cur.survival, 1)}</span> · continuation <span class="amber">${pct(cur.contRate, 1)}</span>`;
      ui.out.innerHTML = `<span><strong>Turn ${cur.k}</strong> (${num(cur.atRisk)} chats active): <strong>${pct(cur.contRate, 1)} continue</strong> to Turn ${cur.k + 1}, while <strong>${pct(cur.forkRate, 1)} fork</strong> at this depth</span><span>My prompts: <strong>15w median</strong> vs. <strong>225.4w mean</strong> · 5,311 work sessions (<strong>98s median follow-up</strong>)</span>`;
      all('[data-i]', ui.view).forEach(g => g.addEventListener('click', () => { selK = Number(g.dataset.i); draw(); }));
    }

    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) {
        mode = ds.view === 'asymmetry' ? 'survival' : ds.view;
        press(ui.bar, mode);
      }
      if (ds.tree !== undefined) selTree = Number(ds.tree);
      if (ds.k !== undefined) selK = clamp(Number(ds.k) - 1, 0, surv.length - 1);
      draw();
    };
  }

  // ------------ Figure 6: Two-sided linguistic drift (2x2 small multiples + low-sample dashed segment)
  function drift(fig, D) {
    const quarters = D.quarters, qn = quarters.length;
    let side = 'assistant', aMetric = 'aiIsms', uMetric = 'polite', selQ = qn - 1;

    const ui = shell(fig, tabs('Voice', [
      ['assistant', 'The model’s prose (25,518 replies)'],
      ['user', 'My prompts (24,278)'],
    ], side));

    const A_METRICS = {
      aiIsms: {
        title: 'Classic GPT-isms ("delve", "crucial", "tapestry")',
        short: 'GPT-isms / 10k words',
        max: 20,
        ticks: [[0, '0'], [10, '10'], [20, '20']],
        fmt: v => `${num(v, 1)}/10kw`,
      },
      syco: {
        title: 'Sycophantic openers ("Certainly!", "Sure!")',
        short: 'Filler openers (%)',
        max: 0.24,
        ticks: [[0, '0%'], [0.12, '12%'], [0.24, '24%']],
        fmt: v => pct(v, 1),
      },
      emDashes: {
        title: 'Em-dashes (—) per 1,000 words (65× jump)',
        short: 'Em-dashes / 1k words',
        max: 6.4,
        ticks: [[0, '0'], [3.2, '3.2'], [6.4, '6.4']],
        fmt: v => `${num(v, 2)}/1kw`,
      },
      bold: {
        title: 'Boldface spans (**...**) per 1,000 words',
        short: 'Bold spans / 1k words',
        max: 42,
        ticks: [[0, '0'], [21, '21'], [42, '42']],
        fmt: v => `${num(v, 1)}/1kw`,
      },
    };

    const U_METRICS = {
      terse: {
        title: 'Terse directives ≤ 10 words',
        short: 'Terse ≤10w (%)',
        max: 0.76,
        ticks: [[0, '0%'], [0.38, '38%'], [0.76, '76%']],
        fmt: v => pct(v, 1),
      },
      paste: {
        title: 'Pasted code & docs ≥ 500 words',
        short: '500w+ pastes (%)',
        max: 0.32,
        ticks: [[0, '0%'], [0.16, '16%'], [0.32, '32%']],
        fmt: v => pct(v, 1),
      },
      pushback: {
        title: 'Error & pushback ("wrong", tracebacks)',
        short: 'Error / pushback (%)',
        max: 0.20,
        ticks: [[0, '0%'], [0.10, '10%'], [0.20, '20%']],
        fmt: v => pct(v, 1),
      },
      polite: {
        title: 'Politeness ("please", "thank you")',
        short: 'Polite prompts (%)',
        max: 0.16,
        ticks: [[0, '0%'], [0.08, '8%'], [0.16, '16%']],
        fmt: v => pct(v, 1),
      },
    };

    function draw() {
      const w = width(ui.view);
      const dict = side === 'assistant' ? A_METRICS : U_METRICS;
      const entries = Object.entries(dict);
      const curKey = side === 'assistant' ? aMetric : uMetric;
      const cfg = dict[curKey];

      ui.leg.innerHTML = `<div class="oai-pills" style="margin-bottom:8px">${entries.map(([k, v]) => `<button type="button" data-m="${k}" aria-pressed="${k === curKey}">${v.short}</button>`).join('')}</div>` + legend([
        ['blue', 'Quarterly trajectory (≥300 msgs/qtr)'],
        ['hollow', 'Early low-sample quarter (<300 msgs)'],
        ['amber', 'Peak & latest quarter'],
      ]);

      if (w >= 560) {
        const gapX = 24, gapY = 26, cellW = Math.floor((w - gapX) / 2), cellH = 128;
        const H = cellH * 2 + gapY + 8;
        let s = '';

        entries.forEach(([k, mCfg], idx) => {
          const col = idx % 2, row = Math.floor(idx / 2);
          const ox = col * (cellW + gapX), oy = row * (cellH + gapY);
          const isFocus = k === curKey;
          const px0 = ox + 40, ppw = cellW - 52, pTop = oy + 24, pBh = cellH - 46;
          const X = i => px0 + (i / (qn - 1)) * ppw;
          const yy = v => pTop + pBh - (clamp(v, 0, mCfg.max) / mCfg.max) * pBh;

          s += `<g data-panel="${k}">`;
          s += rect(ox, oy, cellW, cellH, isFocus ? 'panel-box active' : 'panel-box', 'rx="5"');
          s += text(ox + 10, oy + 15, mCfg.title, isFocus ? 'strong' : 'ink');

          mCfg.ticks.forEach(([v, lbl]) => {
            s += line(px0, yy(v), px0 + ppw, yy(v), v === 0 ? 'axis' : 'grid');
            s += text(px0 - 5, yy(v) + 3.5, lbl, 'small', 'end');
          });

          const vals = quarters.map(q => q[k]);
          const peakIdx = vals.indexOf(Math.max(...vals));
          // Low-sample segment (2023-Q1 and 2023-Q2 have <300 msgs) drawn dashed
          let lowPath = '', mainPath = '', dArea = '';
          quarters.forEach((q, i) => {
            const xx = X(i), y = yy(q[k]);
            if (i <= 2) lowPath += (i === 0 ? 'M' : 'L') + `${f(xx)},${f(y)}`;
            if (i >= 2) mainPath += (i === 2 ? 'M' : 'L') + `${f(xx)},${f(y)}`;
            dArea += (i === 0 ? `M${f(xx)},${f(yy(0))}L` : 'L') + `${f(xx)},${f(y)}`;
            if (i === qn - 1) dArea += `L${f(xx)},${f(yy(0))}Z`;
          });
          s += `<path d="${dArea}" class="area"/>`;
          s += `<path d="${lowPath}" class="step" style="stroke-dasharray:2.5 2.5;opacity:0.65"/>`;
          s += `<path d="${mainPath}" class="step blue"/>`;

          const sx = X(selQ);
          s += line(sx, pTop, sx, pTop + pBh, 'cursor');

          quarters.forEach((q, i) => {
            const xx = X(i), y = yy(q[k]);
            if (i < 2) {
              s += circle(xx, y, i === peakIdx ? 3.4 : 2.6, 'dot hollow');
            } else if (i === peakIdx || i === selQ || i === qn - 1) {
              s += circle(xx, y, i === selQ ? 3.8 : 3.0, i === peakIdx || i === selQ ? 'dot amber' : 'dot blue');
            }
            if (q.q.endsWith('Q1')) {
              s += text(xx + 1, pTop + pBh + 14, '’' + q.q.slice(2, 4), 'small');
            }
          });
          s += rect(ox, oy, cellW, cellH, 'hit');
          s += `</g>`;
        });

        ui.view.innerHTML = svg(w, H, `Four-panel quarterly linguistic drift across ${side === 'assistant' ? 'assistant replies' : 'user prompts'}`, s);
      } else {
        const x0 = 44, pw = w - x0 - 12, top = 22, bh = 168, H = top + bh + 28;
        const X = i => x0 + (i / (qn - 1)) * pw;
        const yy = v => top + bh - (clamp(v, 0, cfg.max) / cfg.max) * bh;
        let s = '';

        cfg.ticks.forEach(([v, lbl]) => {
          s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
          s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
        });
        s += text(x0, top - 7, cfg.short, 'ink strong');

        let lowPath = '', mainPath = '', dArea = '';
        const vals = quarters.map(q => q[curKey]);
        const peakIdx = vals.indexOf(Math.max(...vals));
        quarters.forEach((q, i) => {
          const xx = X(i), y = yy(q[curKey]);
          if (i <= 2) lowPath += (i === 0 ? 'M' : 'L') + `${f(xx)},${f(y)}`;
          if (i >= 2) mainPath += (i === 2 ? 'M' : 'L') + `${f(xx)},${f(y)}`;
          dArea += (i === 0 ? `M${f(xx)},${f(yy(0))}L` : 'L') + `${f(xx)},${f(y)}`;
          if (i === qn - 1) dArea += `L${f(xx)},${f(yy(0))}Z`;
        });
        s += `<path d="${dArea}" class="area"/>`;
        s += `<path d="${lowPath}" class="step" style="stroke-dasharray:2.5 2.5;opacity:0.65"/>`;
        s += `<path d="${mainPath}" class="step blue"/>`;

        quarters.forEach((q, i) => {
          const xx = X(i), y = yy(q[curKey]);
          const isEnd = i === peakIdx || i === qn - 1;
          s += circle(xx, y, isEnd ? 4.0 : 2.6, i < 2 ? 'dot hollow' : isEnd ? 'dot amber' : 'dot blue');
          if (q.q.endsWith('Q1')) {
            s += line(xx, top + bh, xx, top + bh + 5, 'axis');
            s += text(xx + 2, top + bh + 18, q.q.slice(0, 4), 'small');
          }
        });
        ui.view.innerHTML = svg(w, H, `Quarterly trajectory of ${cfg.title}`, s);
      }

      const vals = quarters.map(q => q[curKey]);
      const peakIdx = vals.indexOf(Math.max(...vals));
      const qPeak = quarters[peakIdx], qLast = quarters[qn - 1];
      ui.summary.innerHTML = `Peak <b>${qPeak.q} (${cfg.fmt(qPeak[curKey])})</b> → <b>${qLast.q} (<span class="blue">${cfg.fmt(qLast[curKey])}</span>)</b>`;
      ui.out.innerHTML = `<span><strong>${esc(cfg.short)}</strong>: peaked in <strong>${qPeak.q}</strong> at <span class="amber">${cfg.fmt(qPeak[curKey])}</span></span><span>By <strong>${qLast.q}</strong>: <span class="blue">${cfg.fmt(qLast[curKey])}</span> across ${num(side === 'assistant' ? qLast.replies : qLast.prompts)} ${side === 'assistant' ? 'replies' : 'prompts'}</span>`;

      all('[data-m]', ui.leg).forEach(b => {
        b.addEventListener('click', () => {
          if (side === 'assistant') aMetric = b.dataset.m;
          else uMetric = b.dataset.m;
          draw();
        });
      });
      all('[data-panel]', ui.view).forEach(g => {
        g.addEventListener('click', () => {
          if (side === 'assistant') aMetric = g.dataset.panel;
          else uMetric = g.dataset.panel;
          draw();
        });
      });
    }

    bindTabs(ui.bar, v => { side = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.side) { side = ds.side; press(ui.bar, side); }
      if (ds.metric) {
        if (side === 'assistant') aMetric = ds.metric;
        else uMetric = ds.metric;
      }
      draw();
    };
  }

  // ------------ Figure 7: Multi-year heatmap, 24h clock + matrix & 961 library files + search
  function rhythm(fig, D) {
    const days = D.days, C = D.clock, LF = D.libraryFiles || { total: 961, totalMB: 2043.1, byExt: [] };
    const years = ['2023', '2024', '2025', '2026'];
    const yrCounts = {};
    years.forEach(y => {
      yrCounts[y] = Object.keys(days).filter(k => k.startsWith(y) && days[k][0] > 0).length;
    });
    let mode = 'calendar', yr = 'all', selDay = '2025-02-25', selHour = 23;

    const ui = shell(fig, tabs('Rhythm & environment', [
      ['calendar', '1,114 active days & 252d streak'],
      ['clock', '24h clock & weekday matrix'],
      ['world', '961 files (2.04 GB), search & repos'],
    ], mode));

    function shade(cnt) {
      if (!cnt) return '';
      const a = clamp(0.24 + Math.sqrt(cnt / 122) * 0.76, 0.24, 1);
      return `style="fill:color-mix(in srgb, var(--oai-blue) ${Math.round(a * 100)}%, var(--bg))"`;
    }

    function draw() {
      const w = width(ui.view);
      if (mode === 'calendar') {
        const pillItems = [
          ['all', `All (${num(D.activeDays)}d)`],
          ['2026', `2026 (${yrCounts['2026']}d)`],
          ['2025', `2025 (${yrCounts['2025']}d)`],
          ['2024', `2024 (${yrCounts['2024']}d)`],
          ['2023', `2023 (${yrCounts['2023']}d)`],
        ];
        ui.leg.innerHTML = `<div class="oai-pills" style="margin-bottom:8px">${pillItems.map(([k, l]) => `<button type="button" data-cal-yr="${k}" aria-pressed="${k === yr}">${l}</button>`).join('')}</div>` + legend([
          ['ramp', 'Daily prompts (0 to 122)'],
          ['blue', 'Reasoning prompt on 24h strip'],
          ['ink', 'Standard prompt on 24h strip'],
        ]);

        const x0 = 36, cs = Math.min(11.2, (w - x0 - 4) / 53), gapY = 14, yh = cs * 7;
        let s = '';

        years.forEach((y, yi) => {
          const top = 16 + yi * (yh + gapY), jan1 = Date.UTC(+y, 0, 1), dec31 = Date.UTC(+y, 11, 31);
          const off = (new Date(jan1).getUTCDay() + 6) % 7;
          const dim = yr !== 'all' && yr !== y ? ' style="opacity:0.25"' : '';
          s += `<g${dim}>` + text(0, top + yh / 2 + 4, y, 'strong');
          if (yi === 0) {
            for (let m = 0; m < 12; m++) {
              const t = Date.UTC(+y, m, 1), c = Math.floor(((t - jan1) / DAY + off) / 7);
              if (w > 460 || m % 2 === 0) s += text(x0 + c * cs, top - 5, MON[m], 'small');
            }
          }
          for (let t = jan1; t <= dec31; t += DAY) {
            const key = new Date(t).toISOString().slice(0, 10);
            if (key > D.lastDate) break;
            const i = Math.round((t - jan1) / DAY) + off, c = Math.floor(i / 7), r = i % 7;
            const x = x0 + c * cs, yy = top + r * cs;
            const rec = days[key];
            const cnt = rec ? rec[0] : 0;
            const cls = 'cell' + (key === selDay ? ' sel' : '');
            s += rect(x + 0.5, yy + 0.5, Math.max(1.8, cs - 1.1), Math.max(1.8, cs - 1.1), cls, `rx="${Math.min(2, cs / 5)}" data-day="${key}" ${shade(cnt)}`);
          }
          s += `</g>`;
        });

        const stripTop = 16 + years.length * (yh + gapY) - gapY + 20, stripH = 20, pw = x0 + 53 * cs - x0;
        const rec = days[selDay] || [0, 0, []];
        const evs = rec[2] || [];
        s += text(x0, stripTop - 6, `${fmtDate(selDay)} · ${num(rec[0])} ${rec[0] === 1 ? 'prompt' : 'prompts'} (${num(rec[1])} reasoning)`, 'ink strong');
        s += rect(x0, stripTop, pw, stripH, 'gap-band', 'rx="3"');
        s += rect(x0, stripTop, pw * (5 / 24), stripH, 'brush-band', 'rx="2"');
        s += rect(x0 + pw * (20 / 24), stripTop, pw * (4 / 24), stripH, 'brush-band', 'rx="2"');
        for (const [hr, lbl] of [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p'], [24, '12a']]) {
          const hx = x0 + (hr / 24) * pw;
          s += line(hx, stripTop + stripH, hx, stripTop + stripH + 4, 'axis');
          const anchor = hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle';
          s += text(hx, stripTop + stripH + 15, lbl, 'small', anchor);
        }

        evs.forEach(packed => {
          const min = Math.floor(packed / 2), isReas = packed % 2 === 1;
          const ex = x0 + (min / 1440) * pw;
          s += line(ex, stripTop + 3, ex, stripTop + stripH - 3, isReas ? 'step blue' : 'step');
          s += circle(ex, stripTop + stripH / 2, 2.5, isReas ? 'dot blue' : 'dot ink');
        });

        const H = stripTop + stripH + 22;
        ui.view.innerHTML = svg(w, H, `Four-year ChatGPT activity calendar (2023–2026) and 24-hour prompt strip for ${selDay}`, s);
        ui.summary.innerHTML = `<b>1,114 active days</b> (81.5%) · longest streak: <span class="blue">252 days</span>`;
        ui.out.innerHTML = `<span>Selected: <strong>${fmtDate(selDay)}</strong> — <strong>${num(rec[0])} prompts</strong> (<span class="blue">${num(rec[1])} reasoning</span>, ${num(rec[0] - rec[1])} standard)</span><span>Longest unbroken run: <strong>252 days</strong> (Mar 7 – Nov 13, 2026)</span>`;

        all('[data-day]', ui.view).forEach(el => {
          el.addEventListener('pointerenter', ev => { if (ev.buttons === 0) { selDay = el.dataset.day; draw(); } });
          el.addEventListener('click', () => { selDay = el.dataset.day; draw(); });
        });
        all('[data-cal-yr]', ui.leg).forEach(b => {
          b.addEventListener('click', () => {
            yr = b.dataset.calYr;
            const defaults = { 'all': '2025-02-25', '2026': '2026-10-20', '2025': '2025-02-25', '2024': '2024-10-09', '2023': '2023-10-18' };
            if (yr !== 'all' && !selDay.startsWith(yr)) selDay = defaults[yr];
            draw();
          });
        });
        return;
      }

      if (mode === 'clock') {
        ui.leg.innerHTML = legend([
          ['blue', 'ChatGPT peak windows (2–5 pm & 9 pm–1 am)'],
          ['dash', 'Duolingo hourly curve (79% after 8 pm)'],
          ['ramp', 'Prompts per (weekday × hour)'],
        ]);
        const hrs = C.all, tot = hrs.reduce((a, b) => a + b, 0) || 1, maxH = Math.max(...hrs, 1);
        const sideBySide = w >= 580;
        const R = sideBySide ? Math.min(118, Math.round(w * 0.21)) : Math.min(118, Math.round(w * 0.34));
        const cx = sideBySide ? R + 34 : Math.round(w / 2);
        const cy = R + 26, r0 = R * 0.34;
        let s = '';

        s += circle(cx, cy, R, 'ring') + circle(cx, cy, (r0 + R) / 2, 'ring');
        s += text(cx, cy - R - 8, '12 am', 'small ink', 'middle');
        s += text(cx + R + 8, cy + 3, '6 am', 'small', 'start');
        s += text(cx, cy + R + 15, 'noon', 'small ink', 'middle');
        s += text(cx - R - 8, cy + 3, '6 pm', 'small', 'end');

        for (let h = 0; h < 24; h++) {
          const v = hrs[h], rr = r0 + (R - r0) * Math.sqrt(v / maxH);
          const a0 = (h / 24) * Math.PI * 2 - Math.PI / 2 + 0.015;
          const a1 = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2 - 0.015;
          const p = (a, r) => `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
          const isPeak = (h >= 14 && h <= 17) || h >= 21 || h <= 1;
          const cls = h === selHour ? 'wedge amber' : isPeak ? 'wedge on' : 'wedge';
          s += `<path data-i="${h}" d="M${p(a0, r0)}L${p(a0, rr)}A${f(rr)},${f(rr)} 0 0,1 ${p(a1, rr)}L${p(a1, r0)}A${f(r0)},${f(r0)} 0 0,0 ${p(a0, r0)}Z" class="${cls}"/>`;
        }
        s += text(cx, cy - 1, '3p & 11p', 'strong', 'middle');
        s += text(cx, cy + 11, 'two peaks', 'small', 'middle');

        if (C.duolingo) {
          const dMax = Math.max(...C.duolingo, 1);
          let dPts = '';
          for (let h = 0; h < 24; h++) {
            const rr = r0 + (R - r0) * Math.sqrt(C.duolingo[h] / dMax);
            const ang = ((h + 0.5) / 24) * Math.PI * 2 - Math.PI / 2;
            dPts += (h === 0 ? 'M' : 'L') + `${f(cx + rr * Math.cos(ang))},${f(cy + rr * Math.sin(ang))}`;
          }
          s += `<path d="${dPts}Z" class="step amber" style="stroke-width:1.8"/>`;
        }

        let H = cy + R + 28;
        if (sideBySide && C.wdHour) {
          const grid = C.wdHour;
          const gx = cx + R + 68, gy = 26, availW = w - gx - 42, cw = availW / 24, rh = 27;
          const maxCell = Math.max(1, ...grid.flat());
          s += text(gx, gy - 9, 'Hour × weekday (Eastern time)', 'ink strong');
          s += text(w - 4, gy - 9, 'Total', 'ink', 'end');
          s += rect(gx + selHour * cw - 0.5, gy - 2, cw + 1, 7 * rh + 4, 'brush-band', 'rx="1.5"');

          WD.forEach((dayName, d) => {
            const y = gy + d * rh;
            const rowTot = grid[d].reduce((a, b) => a + b, 0);
            s += text(gx - 7, y + rh * 0.66, dayName, 'small ink', 'end');
            for (let hr = 0; hr < 24; hr++) {
              const v = grid[d][hr];
              const op = v ? Math.round((0.20 + 0.80 * Math.sqrt(v / maxCell)) * 100) : 0;
              const style = v ? `style="fill:color-mix(in srgb, var(--oai-blue) ${op}%, var(--bg))"` : '';
              s += rect(gx + hr * cw + 0.6, y + 1.5, Math.max(1, cw - 1.2), rh - 3, 'cell', `rx="1.2" data-i="${hr}" ${style}`);
            }
            s += text(w - 4, y + rh * 0.66, num(rowTot), 'small ink', 'end');
          });
          for (const [hr, lbl] of [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p'], [23, '11p']]) {
            s += text(gx + (hr + 0.5) * cw, gy + 7 * rh + 15, lbl, hr === selHour ? 'small strong' : 'small', 'middle');
          }
          H = Math.max(H, gy + 7 * rh + 24);
        }

        ui.view.innerHTML = svg(w, H, '24-hour radial distribution of ChatGPT prompts and weekday-by-hour activity matrix compared with Duolingo', s);
        ui.summary.innerHTML = `<b>${hourLabel(selHour)}</b>: <span class="blue">${num(hrs[selHour])} prompts</span> (${pct(hrs[selHour] / tot, 1)}) · 8p–5a: 38.2% vs. 79.0%`;
        ui.out.innerHTML = `<span><strong>${hourLabel(selHour)} ET</strong>: <strong>${num(hrs[selHour])} prompts</strong> (${pct(hrs[selHour] / tot, 1)})</span><span>Afternoon peak (3 pm): <span class="blue">1,762</span> · Night peak (11 pm): <span class="blue">1,943</span> · Sleep trough (4–7 am): <strong>367</strong> (1.5%)</span>`;
        all('[data-i]', ui.view).forEach(el => {
          el.addEventListener('click', () => { selHour = Number(el.dataset.i); draw(); });
          el.addEventListener('pointerenter', () => { selHour = Number(el.dataset.i); draw(); });
        });
        return;
      }

      // World mode: 961 library files (2.04 GB), searched web domains, connected GitHub repos
      ui.leg.innerHTML = legend([
        ['blue', 'Top searched web domains (6,830 search groups)'],
        ['amber', 'Connected GitHub repos (1,690 turns) & 961 library files (2.04 GB)'],
      ]);
      const doms = D.searchedDomains.slice(0, 7), repos = D.connectedRepos.slice(0, 4);
      const x0 = w < 460 ? 116 : 148, rCol = w < 460 ? 48 : 64, pw = w - x0 - rCol - 8;
      const top = 22, rowH = 20, bh = doms.length * rowH;
      const rTop = top + bh + 34, rBh = repos.length * rowH, H = rTop + rBh + 14;
      let s = '';

      s += text(4, top - 6, w < 460 ? 'Searched web domains' : 'Most-searched external web domains', 'ink strong');
      s += text(w - 4, top - 6, 'Hits', 'ink', 'end');
      const maxD = doms[0].hits;
      doms.forEach((d, i) => {
        const y = top + i * rowH, cy = y + rowH / 2;
        const bw = Math.max(3, (d.hits / maxD) * pw);
        s += text(x0 - 8, cy + 4, d.domain, i < 2 ? 'mono strong' : 'mono ink', 'end');
        s += rect(x0, cy - 5.5, bw, 11, i < 2 ? 'bar on' : 'bar mid', 'rx="2"');
        s += text(w - 4, cy + 4, num(d.hits), i === 0 ? 'blue' : '', 'end');
      });

      s += line(4, rTop - 20, w - 4, rTop - 20, 'grid');
      s += text(4, rTop - 6, w < 460 ? 'Connected GitHub repos' : 'Directly attached GitHub repositories (Sir-Teo/*)', 'ink strong');
      s += text(w - 4, rTop - 6, 'Turns', 'ink', 'end');
      const maxR = repos[0].msgs;
      repos.forEach((r, i) => {
        const y = rTop + i * rowH, cy = y + rowH / 2;
        const bw = Math.max(3, (r.msgs / maxR) * pw);
        s += text(x0 - 8, cy + 4, r.repo, i < 2 ? 'mono strong' : 'mono ink', 'end');
        s += rect(x0, cy - 5.5, bw, 11, 'bar amber', 'rx="2"');
        s += text(w - 4, cy + 4, num(r.msgs), i < 2 ? 'amber' : '', 'end');
      });

      ui.view.innerHTML = svg(w, H, 'Top searched web domains and connected GitHub repositories across the export', s);
      ui.summary.innerHTML = `<b>${num(LF.total)} library files (2.04 GB)</b> · <b>reddit.com (2,271)</b> · <span class="amber">82 Codex tasks</span>`;
      ui.out.innerHTML = `<span><strong>${num(LF.total)} workspace files (${num(LF.totalMB, 1)} MB)</strong>: 248 PDFs, 285 images, 155 text/md, 64 Office docs, 37 ZIPs, 25 MP4 videos</span><span>Connected repos: <code>web-chess-dot-com</code> (783), <code>web-katrain</code> (770), <code>HCC</code> (114) · Codex: <strong>522 file snapshots</strong></span>`;
    }

    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) { mode = ds.view; press(ui.bar, mode); }
      if (ds.year) yr = ds.year;
      if (ds.day) selDay = ds.day;
      if (ds.hour !== undefined) selHour = Number(ds.hour);
      draw();
    };
  }

  // ------------ Figure 8: API-equivalent cost arbitrage & quadratic context tax
  function arbitrage(fig, D) {
    const months = D.months, n = months.length, B = D.billing, surv = D.turns.survival.slice(0, 10);
    const paidByMonth = {};
    B.charges.forEach(c => {
      if (c.paid) {
        const ym = c.date.slice(0, 7);
        paidByMonth[ym] = (paidByMonth[ym] || 0) + c.amount;
      }
    });

    let mode = 'arbitrage', sel = months.findIndex(m => m.m === '2026-10'), selK = 5, geo = null;

    const ui = shell(fig, tabs('Economics view', [
      ['arbitrage', 'Billed ($784) vs. API (~$1,100)'],
      ['context', 'Quadratic context tax (69.9%)'],
    ], mode));

    function draw() {
      const w = width(ui.view);
      if (mode === 'context') {
        ui.leg.innerHTML = legend([
          ['ink', 'Fresh prompt tokens at turn k'],
          ['amber', 'Re-transmitted prior history tokens at turn k'],
          ['line', 'Cumulative input tokens through turn k (quadratic growth)'],
        ]);
        const x0 = 48, rCol = w >= 520 ? 44 : 14, pw = w - x0 - rCol, top = 22, bh = 184, H = top + bh + 28;
        const sn = surv.length, stepW = pw / sn, bw = Math.min(32, stepW * 0.58);
        const X = i => x0 + (i + 0.5) * stepW;
        const maxTok = 8000, maxCum = 48000;
        const yy = v => top + bh - (clamp(v, 0, maxTok) / maxTok) * bh;
        const yCum = v => top + bh - (clamp(v, 0, maxCum) / maxCum) * bh;
        let s = '';

        for (const [v, lbl] of [[0, '0'], [2000, '2k'], [4000, '4k'], [6000, '6k'], [8000, '8k']]) {
          s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
          s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
        }
        if (w >= 520) {
          for (const [cv, clbl] of [[16000, '16k'], [32000, '32k'], [48000, '48k']]) {
            s += text(x0 + pw + 6, yCum(cv) + 4, clbl, 'small blue');
          }
        }
        s += text(x0, top - 7, w < 500 ? 'Per-turn vs. cumulative input tokens' : 'Per-turn input window (bars, left axis) & cumulative input tokens (blue curve, right axis)', 'ink strong');

        let cumPath = '';
        surv.forEach((r, i) => {
          const xx = X(i), hF = (r.freshTok / maxTok) * bh, hR = (r.resentTok / maxTok) * bh;
          const y0 = top + bh, isSel = i === selK;
          const cumV = r.cumTok || (r.freshTok + r.resentTok) * (i + 1);
          cumPath += (i === 0 ? 'M' : 'L') + `${f(xx)},${f(yCum(cumV))}`;
          s += `<g data-i="${i}">`;
          s += rect(xx - bw / 2, y0 - hF, bw, hF, 'bar ink', 'rx="1"');
          s += rect(xx - bw / 2, y0 - hF - hR, bw, hR, isSel ? 'bar on' : 'bar amber', 'rx="1"');
          if (w >= 460 || isSel || i === 0 || i % 2 === 1) {
            s += text(xx, y0 - hF - hR - 5, pct(r.resentShare, 0), isSel ? 'blue strong' : 'small', 'middle');
          }
          s += text(xx, top + bh + 18, w < 540 ? `T${r.k}` : `Turn ${r.k}`, isSel ? 'strong' : 'small', 'middle');
          s += rect(xx - stepW / 2, top, stepW, bh, 'hit');
          s += `</g>`;
        });
        s += `<path d="${cumPath}" class="step blue" style="stroke-width:2.1"/>`;
        surv.forEach((r, i) => {
          const xx = X(i), cumV = r.cumTok || 0;
          s += circle(xx, yCum(cumV), i === selK ? 4.2 : 2.8, 'dot blue');
        });
        if (w >= 540) {
          const lastC = surv[sn - 1];
          s += text(x0 + 10, top + 22, `By Turn 10: ${num(lastC.cumTok / 1000, 1)}k cumulative input tokens (49× Turn 1)`, 'blue halo');
        }

        geo = null;
        ui.view.innerHTML = svg(w, H, 'Multi-turn context re-transmission tokens and cumulative quadratic token growth from Turn 1 to Turn 10', s);
        const cur = surv[selK];
        ui.summary.innerHTML = `<b>~69.9% of input tokens</b> (~34.0M / 48.6M) are re-sent history`;
        ui.out.innerHTML = `<span><strong>Turn ${cur.k}</strong> window: <strong>${num(cur.freshTok)} fresh</strong> + <span class="amber">${num(cur.resentTok)} re-sent</span> (<strong>${pct(cur.resentShare, 1)} history</strong>) · Cumulative through Turn ${cur.k}: <span class="blue">${num(cur.cumTok)} input tokens</span></span>`;
        all('[data-i]', ui.view).forEach(g => g.addEventListener('click', () => { selK = Number(g.dataset.i); draw(); }));
        return;
      }

      // Arbitrage mode: Subscription paid vs API-equivalent value across 46 months
      ui.leg.innerHTML = legend([
        ['blue', 'Uncached API-equivalent value (~$1,102 total)'],
        ['amber', 'Actual subscription billed ($784.47 total)'],
        ['soft', 'Active Plus / Pro plan spans & state moves (top)'],
      ]);
      const x0 = 52, pw = w - x0 - 12;
      const t0 = ms('2023-02-01'), t1 = ms('2026-11-30');
      const tx = s => x0 + clamp((ms(s) - t0) / (t1 - t0), 0, 1) * pw;
      const stepW = pw / n, bw = Math.max(2, stepW * 0.76);
      const X = i => x0 + (i + 0.5) * stepW;
      const top = 16, spanH = 20, by = 58, bh = 154, H = by + bh + 28;
      let s = '';

      s += text(x0 - 6, top + 14, 'Plan', 'ink', 'end');
      B.spans.forEach(sp => {
        const xa = tx(sp.start), xb = Math.max(xa + 4, tx(sp.end));
        const cls = sp.kind.includes('pro') ? 'span pro' : sp.kind === 'free' || sp.kind === 'promo' ? 'span free' : 'span';
        s += rect(xa, top, xb - xa, spanH, cls, 'rx="3"');
        if (xb - xa > 46) s += text((xa + xb) / 2, top + 14, sp.state, 'small strong', 'middle');
      });

      const maxD = 135, yy = v => by + bh - (clamp(v, 0, maxD) / maxD) * bh;
      for (const [v, lbl] of [[0, '$0'], [40, '$40'], [80, '$80'], [120, '$120']]) {
        s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
        s += text(x0 - 6, yy(v) + 4, lbl, '', 'end');
      }
      s += text(x0, by - 7, w < 500 ? 'Est. API value (bars) vs. billed (line)' : 'Monthly uncached API-equivalent value (bars) vs. subscription billed (amber step)', 'ink');

      let paidPath = '';
      months.forEach((m, i) => {
        const apiV = m.apiCost, paidV = paidByMonth[m.m] || 0;
        const xa = X(i) - stepW / 2, xb = xa + stepW, yp = yy(paidV);
        const cls = i === sel ? 'bar amber' : 'bar on';
        s += rect(X(i) - bw / 2, yy(apiV), bw, by + bh - yy(apiV), cls, 'rx="1"');
        paidPath += (i === 0 ? `M${f(xa)},${f(yp)}H${f(xb)}` : `L${f(xa)},${f(yp)}H${f(xb)}`);
      });
      s += `<path d="${paidPath}" class="step amber" style="stroke-dasharray:none;stroke-width:2"/>`;

      if (w >= 540) {
        const octIdx = months.findIndex(m => m.m === '2026-10');
        if (octIdx >= 0) {
          s += text(X(octIdx) - 8, yy(months[octIdx].apiCost) + 8, '~$127 API value (Oct ’26)', 'amber halo', 'end');
        }
      }

      let lastY = '';
      months.forEach((m, i) => {
        const yr = m.m.slice(0, 4);
        if (yr !== lastY) {
          lastY = yr;
          const xx = X(i) - stepW / 2;
          s += line(xx, by + bh, xx, by + bh + 5, 'axis');
          s += text(xx + 3, by + bh + 18, yr);
        }
      });

      const sx = X(sel);
      s += line(sx, top, sx, by + bh, 'cursor');
      s += rect(x0, top, pw, by + bh - top, 'hit');
      geo = { x0, stepW };
      ui.view.innerHTML = svg(w, H, 'Monthly API-equivalent compute value versus subscription dollars paid from 2023 to 2026', s);

      const m = months[sel], paidV = paidByMonth[m.m] || 0, diff = m.apiCost - paidV;
      ui.summary.innerHTML = `Est. API value: <b>~$1,100</b> vs. <b>$784.47 paid</b> (<span class="blue">+~$317 surplus</span>)`;
      ui.out.innerHTML = `<span><strong>${fmtMonth(m.m)}</strong>: est. API value <span class="blue">~$${num(m.apiCost, 0)}</span> vs. billed <span class="amber">$${num(paidV, 2)}</span> (${diff >= 0 ? '+' : '−'}$${num(Math.abs(diff), 0)} net)</span><span>Est. tokens in ${fmtMonth(m.m)}: <strong>~${num((m.freshTok + m.resentTok + m.outTok + m.reasTok) / 1e6, 2)}M</strong></span>`;
    }

    hover(ui.view, x => {
      if (!geo || mode === 'context') return;
      const i = clamp(Math.floor((x - geo.x0) / geo.stepW), 0, n - 1);
      if (i !== sel) { sel = i; draw(); }
    });
    keys(ui.view, d => {
      if (mode === 'context') selK = clamp(selK + d, 0, surv.length - 1);
      else sel = clamp(sel + d, 0, n - 1);
      draw();
    });
    bindTabs(ui.bar, v => { mode = v; press(ui.bar, v); draw(); });
    observe(ui.view, draw);
    draw();

    fig._setAct = ds => {
      if (ds.view) { mode = ds.view; press(ui.bar, mode); }
      if (ds.month) {
        const i = months.findIndex(m => m.m === ds.month);
        if (i >= 0) sel = i;
      }
      if (ds.k !== undefined) selK = clamp(Number(ds.k) - 1, 0, surv.length - 1);
      draw();
    };
  }

  // ----------------------------------------------------------------- boot
  fetch(first.dataset.src)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(D => {
      const builders = {
        'oai-run': run,
        'oai-atlas': atlas,
        'oai-models': models,
        'oai-thinking': thinking,
        'oai-trees': trees,
        'oai-drift': drift,
        'oai-rhythm': rhythm,
        'oai-arbitrage': arbitrage,
      };
      Object.entries(builders).forEach(([id, fn]) => {
        const fig = document.getElementById(id);
        if (fig) fn(fig, D);
      });

      all('a.act[href^="#oai-"]').forEach(a => {
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
      all('figure.oai').forEach(fig => {
        const p = document.createElement('p');
        p.className = 'oai-error';
        p.textContent = 'Figure data could not be loaded.';
        fig.insertBefore(p, $('figcaption', fig));
      });
    });
})();
