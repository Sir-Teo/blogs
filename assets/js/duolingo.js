/* Seven interactive SVG figures for the Duolingo export post. Zero dependencies. */
(function () {
  'use strict';
  const first = document.getElementById('duo-run');
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
  const ms = s => Date.parse(s.slice(0, 10) + 'T00:00:00Z');
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const fmt = (s, yr = true) => {
    const d = new Date(ms(s));
    return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}${yr ? ', ' + d.getUTCFullYear() : ''}`;
  };
  const hourLabel = h => h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? 'noon' : (h - 12) + ' pm';
  const f = v => (Math.round(v * 10) / 10).toString();
  const text = (x, y, s, cls = '', anchor = 'start') => `<text x="${f(x)}" y="${f(y)}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
  const line = (x1, y1, x2, y2, cls = 'grid') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}"/>`;
  const rect = (x, y, w, h, cls = '', extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" class="${cls}" ${extra}/>`;
  const circle = (x, y, r, cls = '', extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" class="${cls}" ${extra}/>`;
  const svg = (w, h, label, body) => `<svg class="duo-chart" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" role="img" aria-label="${label}">${body}</svg>`;
  const tabs = (name, items, cur) => `<div class="tabs" role="group" aria-label="${name}">${items.map(([id, l]) => `<button type="button" data-choice="${id}" aria-pressed="${id === cur}">${l}</button>`).join('')}</div>`;
  const legend = items => `<div class="duo-legend">${items.map(([c, l]) => `<span class="${c}"><i aria-hidden="true"></i>${l}</span>`).join('')}</div>`;

  function shell(fig, controlsHtml = '') {
    const el = document.createElement('div');
    el.className = 'duo-body';
    el.innerHTML = `<div class="fig-controls">${controlsHtml}<span class="fig-num"></span></div><div class="duo-view"></div><p class="duo-readout" aria-live="polite"></p>`;
    fig.insertBefore(el, $('figcaption', fig));
    fig.classList.add('ready');
    return { el, bar: $('.fig-controls', el), summary: $('.fig-num', el), view: $('.duo-view', el), out: $('.duo-readout', el) };
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
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 }[ev.key];
      if (d) { ev.preventDefault(); step(d); }
    });
  }

  // ------------------------------------------------ Figure 1: the whole run
  function run(fig, D) {
    const weeks = D.weeks, total = weeks.reduce((a, w) => a + w.xp, 0);
    const y2024 = weeks.filter(w => w.week.startsWith('2024')).reduce((a, w) => a + w.xp, 0);
    const peakIdx = weeks.reduce((best, w, i) => w.xp > weeks[best].xp ? i : best, 0);
    let mode = 'weeks', sel = peakIdx, range = null, dragStart = null;

    const ui = shell(fig, tabs('Time axis', [['weeks', 'Weeks played (151)'], ['calendar', 'Calendar time (2020–26)']], mode));
    const t0 = ms('2020-04-20'), t1 = ms('2026-11-23');
    const tierVal = w => w.kind === 'tournament' ? 9 + (w.tier + 1) * 0.32 : w.tier;
    let geo = null;

    function draw() {
      const w = width(ui.view), x0 = 56, pw = w - x0 - 12, top = 12, th = 68, gap = 26, bh = w < 500 ? 142 : 168, by = top + th + gap;
      const n = weeks.length;
      const X = mode === 'calendar' ? (i => x0 + (ms(weeks[i].week) - t0) / (t1 - t0) * pw) : (i => x0 + (i + 0.5) / n * pw);
      const stepW = mode === 'calendar' ? pw * 7 / ((t1 - t0) / DAY) : pw / n;
      const bw = Math.max(1.2, stepW * (mode === 'calendar' ? 0.82 : 0.74));
      const ty = v => top + th - v / 10 * th, yy = v => by + bh - v / 6000 * bh;
      let s = '';

      // Grid & axes
      s += line(x0, ty(0), x0 + pw, ty(0)) + line(x0, ty(9), x0 + pw, ty(9), 'bench');
      s += text(x0 - 8, ty(0) + 4, 'Bronze', '', 'end') + text(x0 - 8, ty(9) + 4, 'Diamond', 'ink', 'end');
      for (const v of [0, 2000, 4000, 6000]) {
        s += line(x0, yy(v), x0 + pw, yy(v), v === 0 ? 'axis' : 'grid');
        s += text(x0 - 8, yy(v) + 4, v ? (v / 1000) + 'k' : '0', '', 'end');
      }
      s += text(x0, by - 7, 'Weekly XP', 'ink');

      if (mode === 'calendar') {
        const a = x0 + (ms('2020-06-20') - t0) / (t1 - t0) * pw, b = x0 + (ms('2024-01-02') - t0) / (t1 - t0) * pw;
        s += rect(a, top, b - a, by + bh - top, 'gap-band');
        s += text((a + b) / 2, by + bh * 0.44, '3½ years without a lesson', 'ink', 'middle');
        s += text((a + b) / 2, by + bh * 0.44 + 15, 'Jun 2020 – Jan 2024', '', 'middle');
        for (let y = 2021; y <= 2026; y++) {
          const xx = x0 + (Date.UTC(y, 0, 1) - t0) / (t1 - t0) * pw;
          s += line(xx, by + bh, xx, by + bh + 5, 'axis') + text(xx, by + bh + 18, y, '', 'middle');
        }
      } else {
        // Mark the 2020 -> 2024 break after week index 1
        const gx = (X(1) + X(2)) / 2;
        s += line(gx, top, gx, by + bh, 'bench');
        let last = '';
        weeks.forEach((wk, i) => {
          const y = wk.week.slice(0, 4);
          if (y !== last) {
            last = y;
            const xx = X(i) - stepW / 2;
            s += line(xx, by + bh, xx, by + bh + 5, 'axis');
            if (y === '2024') {
              s += text(xx + 4, by + bh + 18, w >= 460 ? '2024 (after 3½-yr gap from ’20)' : '2024');
            } else if (y !== '2020') {
              s += text(xx + 3, by + bh + 18, y);
            }
          }
        });
      }

      // Highlighted range band if active
      let rIdx = null;
      if (range) {
        const i0 = weeks.findIndex(wk => wk.week >= range[0]);
        let i1 = -1;
        weeks.forEach((wk, i) => { if (wk.week <= range[1]) i1 = i; });
        if (i0 >= 0 && i1 >= i0) {
          rIdx = [i0, i1];
          const rx0 = X(i0) - stepW / 2, rx1 = X(i1) + stepW / 2;
          s += rect(rx0, top, rx1 - rx0, by + bh - top, 'brush-band');
        }
      }

      // League step line & soft area fill
      let dLine = '', dArea = '', segStart = null, prevX = 0;
      weeks.forEach((wk, i) => {
        const brk = i === 0 || (mode === 'calendar' && ms(wk.week) - ms(weeks[i - 1].week) > 21 * DAY) || (mode === 'weeks' && i === 2);
        const xa = X(i) - stepW / 2, xb = xa + stepW, y = ty(tierVal(wk));
        if (brk) {
          if (segStart !== null) dArea += `L${f(prevX)},${f(ty(0))}L${f(segStart)},${f(ty(0))}Z`;
          segStart = xa;
          dLine += `M${f(xa)},${f(y)}H${f(xb)}`;
          dArea += `M${f(xa)},${f(y)}H${f(xb)}`;
        } else {
          dLine += `L${f(xa)},${f(y)}H${f(xb)}`;
          dArea += `L${f(xa)},${f(y)}H${f(xb)}`;
        }
        prevX = xb;
      });
      if (segStart !== null) dArea += `L${f(prevX)},${f(ty(0))}L${f(segStart)},${f(ty(0))}Z`;
      s += `<path d="${dArea}" class="area"/><path d="${dLine}" class="step blue"/>`;

      // XP bars
      weeks.forEach((wk, i) => {
        const inR = rIdx && i >= rIdx[0] && i <= rIdx[1];
        const cls = i === sel ? 'bar amber' : inR ? 'bar on' : wk.week.startsWith('2024') ? 'bar mid' : 'bar';
        s += rect(X(i) - bw / 2, yy(wk.xp), bw, by + bh - yy(wk.xp), cls);
      });

      // Direct annotations on canvas
      if (w >= 480) {
        const px = X(peakIdx), py = yy(weeks[peakIdx].xp);
        s += text(px + (mode === 'calendar' ? 8 : 6), py + 9, 'Peak · 5,833 XP (Jul 1, 2024)', 'ink halo');
      }

      // Active week cursor & dot on step line
      const sx = X(sel), sy = ty(tierVal(weeks[sel]));
      s += line(sx, top, sx, by + bh, 'cursor');
      s += circle(sx, sy, 3.8, 'dot amber');
      s += rect(x0, top, pw, by + bh - top, 'hit');

      geo = { X, n, x0, pw };
      ui.view.innerHTML = legend([
        ['line', 'League tier (Bronze → Diamond + Tournament)'],
        ['mid', '2024 sprint (99.0k XP)'],
        ['', '2025–26 tail (29.8k XP)'],
        ['amber', 'Selected week']
      ]) + svg(w, by + bh + 26, `Weekly XP bars and league tier step-line across ${n} weeks.`, s);

      // Summary & readout
      if (rIdx) {
        const slice = weeks.slice(rIdx[0], rIdx[1] + 1), sum = slice.reduce((a, w) => a + w.xp, 0);
        ui.summary.innerHTML = `<span class="blue">${num(sum)} XP</span> across <b>${slice.length}</b> weeks · avg <b>${num(sum / slice.length)}</b>/wk`;
      } else {
        ui.summary.innerHTML = `<b>${num(total)}</b> XP total · <span class="blue">${num(y2024)} in 2024</span> (77%) · <b>${n}</b> weeks`;
      }
      say();
    }

    const RES = { up: '<span class="blue">promoted ↑</span>', down: '<span class="amber">demoted ↓</span>', stay: 'stayed in league' };
    function say() {
      const wk = weeks[sel];
      const where = wk.kind === 'tournament' ? `Diamond Tournament · round ${wk.tier + 1} of 3` : `${D.tiers[wk.tier]} League (tier ${wk.tier + 1}/10)`;
      ui.out.innerHTML = `<span><strong>Week of ${fmt(wk.week)}</strong></span><span class="ink">${where}</span><span><strong>${num(wk.xp)} XP</strong></span>${wk.result ? `<span>${RES[wk.result]}</span>` : '<span class="blue">tournament round</span>'}`;
    }

    function nearest(x) {
      let best = 0, bd = 1e9;
      for (let i = 0; i < geo.n; i++) {
        const dd = Math.abs(geo.X(i) - x);
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    }

    bindTabs(ui.el, v => { mode = v; press(ui.el, v); draw(); });
    ui.view.addEventListener('pointerdown', ev => {
      if (!$('svg', ui.view)) return;
      const [x] = local(ui.view, ev);
      dragStart = nearest(x);
      sel = dragStart;
      range = null;
      draw();
    });
    ui.view.addEventListener('pointermove', ev => {
      if (!$('svg', ui.view) || !geo) return;
      const [x] = local(ui.view, ev);
      const idx = nearest(x);
      if (ev.buttons === 1 && dragStart !== null && Math.abs(idx - dragStart) >= 1) {
        const a = Math.min(dragStart, idx), b = Math.max(dragStart, idx);
        range = [weeks[a].week, weeks[b].week];
        sel = idx;
        draw();
      } else if (idx !== sel) {
        sel = idx;
        draw();
      }
    });
    window.addEventListener('pointerup', () => { dragStart = null; });
    keys(ui.view, d => { sel = clamp(sel + d, 0, weeks.length - 1); draw(); });

    fig.duoAction = a => {
      if (a.view) { mode = a.view; press(ui.el, mode); }
      range = a.range ? a.range.split(',') : null;
      if (a.week) {
        const i = weeks.findIndex(w => w.week >= a.week);
        if (i >= 0) sel = i;
      }
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ---------------------------------------------- Figure 2: the league ladder
  function ladder(fig, D) {
    const weeks = D.weeks.filter(w => w.week >= '2024');
    const lw = weeks.filter(w => w.kind === 'league');
    const ups = lw.filter(w => w.result === 'up').length, downs = lw.filter(w => w.result === 'down').length;
    const rows = [...D.tiers, 'Tournament'];
    const rowOf = wk => wk.kind === 'tournament' ? 10 : wk.tier;
    const counts = rows.map((_, r) => weeks.filter(w => rowOf(w) === r).length);

    let preset = 'all', sel = weeks.findIndex(w => w.tier === 9), focusTier = null;
    const SPANS = {
      all: null,
      first: ['2024-01-09', '2024-03-11'],
      second: ['2026-08-02', '2026-11-09'],
    };

    const ui = shell(fig, tabs('Climb window', [
      ['all', 'All 149 weeks'],
      ['first', 'Climb 1 · Jan–Mar 2024'],
      ['second', 'Climb 2 · Aug–Nov 2026'],
    ], preset));
    let geo = null;

    function draw() {
      const w = width(ui.view), side = w >= 540;
      const x0 = w < 480 ? 74 : 84, histW = side ? Math.min(138, Math.round(w * 0.22)) : 0;
      const gapX = side ? 20 : 0, pw = w - x0 - histW - gapX - 8, hx = x0 + pw + gapX;
      const top = 14, rh = w < 480 ? 18 : 21, ph = rh * rows.length;
      const n = weeks.length, X = i => x0 + (i + 0.5) / n * pw, Y = r => top + ph - (r + 0.5) * rh;
      let s = '';

      // Column headers
      s += text(x0, top - 4, w < 480 ? 'League path (dot size = XP)' : 'Weekly league path (dot size = weekly XP)', 'ink');
      if (side) s += text(hx, top - 4, 'Weeks at tier', 'ink');

      // Rows + right-hand marginal histogram
      const maxC = Math.max(...counts);
      rows.forEach((name, r) => {
        const y = Y(r), activeRow = focusTier === r || rowOf(weeks[sel]) === r;
        s += line(x0, y, x0 + pw, y, r === 9 ? 'bench' : 'grid');
        s += text(x0 - 8, y + 4, name, activeRow ? 'strong' : (r >= 9 ? 'ink' : ''), 'end');
        if (side && counts[r] > 0) {
          const bw = (counts[r] / maxC) * (histW - 32);
          const barCls = focusTier === r ? 'bar amber' : r === 6 ? 'bar on' : r >= 9 ? 'bar mid' : 'bar';
          s += `<g data-tier="${r}">` +
            rect(hx, y - rh * 0.36, histW, rh * 0.72, 'hit') +
            rect(hx, y - rh * 0.32, Math.max(2, bw), rh * 0.64, barCls, 'rx="1.5"') +
            text(hx + Math.max(2, bw) + 5, y + 4, counts[r], activeRow ? 'strong' : '') +
            '</g>';
        }
      });

      // Highlighted climb span
      const span = SPANS[preset];
      if (span) {
        const a = weeks.findIndex(wk => wk.week >= span[0]);
        let b = -1;
        weeks.forEach((wk, i) => { if (wk.week <= span[1]) b = i; });
        if (a >= 0 && b >= a) {
          s += rect(X(a) - pw / n / 2, top, (b - a + 1) * pw / n, ph, 'brush-band');
        }
      }

      // Path polyline
      let d = '';
      weeks.forEach((wk, i) => { d += (i ? 'L' : 'M') + f(X(i)) + ',' + f(Y(rowOf(wk))); });
      s += `<path d="${d}" class="step"/>`;

      // Week dots (radius encodes sqrt of XP so 5k XP weeks visibly dwarf 200 XP weeks)
      weeks.forEach((wk, i) => {
        const r = rowOf(wk), rad = i === sel ? 5.2 : 1.9 + Math.sqrt(wk.xp / 5833) * 3.1;
        const dim = focusTier !== null && focusTier !== r ? ' style="opacity:0.22"' : '';
        const cls = wk.kind === 'tournament' ? 'dot blue'
          : wk.result === 'up' ? 'dot blue'
          : wk.result === 'down' ? 'dot amber'
          : 'dot hollow';
        s += circle(X(i), Y(r), rad, cls, dim);
      });

      // Direct callouts comparing the two climbs into Diamond
      if (w >= 520) {
        const iMar = weeks.findIndex(wk => wk.week === '2024-03-04');
        const iSep = weeks.findIndex(wk => wk.week === '2026-09-27');
        if (iMar >= 0) {
          s += line(X(iMar), Y(8) + 6, X(iMar), Y(4) + 2, 'axis');
          s += text(X(iMar) + 5, Y(4) + 4, 'Mar ’24 · 5,272 XP ↑', 'blue halo');
        }
        if (iSep >= 0) s += text(X(iSep) - 8, Y(8) + 4, 'Sep ’26 · 266 XP ↑', 'blue halo', 'end');
      }

      // Year ticks
      let last = '';
      weeks.forEach((wk, i) => {
        const y = wk.week.slice(0, 4);
        if (y !== last) {
          last = y;
          s += line(X(i), top + ph, X(i), top + ph + 5, 'axis') + text(X(i) + 3, top + ph + 18, y);
        }
      });

      s += line(X(sel), top, X(sel), top + ph, 'cursor');
      s += rect(x0, top, pw, ph, 'hit');
      geo = { X, n, x0, pw };

      ui.summary.innerHTML = `<span class="blue">${ups} promotions</span> · <span class="amber">${downs} demotions</span> · <b>${counts[6]} wks</b> in Amethyst`;
      ui.view.innerHTML = legend([
        ['blue round', 'Promoted ↑'],
        ['amber round', 'Demoted ↓'],
        ['hollow', 'Stayed · dot area ∝ weekly XP'],
      ]) + svg(w, top + ph + 24, 'Weekly league path from Bronze to Diamond Tournament alongside weeks spent in each tier.', s);

      all('[data-tier]', ui.view).forEach(g => {
        const t = +g.dataset.tier;
        g.addEventListener('pointerenter', () => { focusTier = t; draw(); });
        g.addEventListener('click', () => { focusTier = focusTier === t ? null : t; draw(); });
      });
      say();
    }

    function say() {
      if (focusTier !== null) {
        const tierWeeks = weeks.filter(w => rowOf(w) === focusTier);
        const avg = Math.round(tierWeeks.reduce((a, w) => a + w.xp, 0) / Math.max(1, tierWeeks.length));
        ui.out.innerHTML = `<span><strong>${rows[focusTier]}</strong></span><span class="ink"><strong>${counts[focusTier]}</strong> weeks (${pct(counts[focusTier] / weeks.length, 1)})</span><span>avg <strong>${num(avg)} XP</strong>/week</span>`;
        return;
      }
      const wk = weeks[sel], r = rowOf(wk);
      const where = wk.kind === 'tournament' ? `Diamond Tournament · round ${wk.tier + 1}` : `${D.tiers[wk.tier]} League`;
      const res = { up: '<span class="blue">promoted ↑</span>', down: '<span class="amber">demoted ↓</span>', stay: 'stayed' }[wk.result] || '<span class="blue">tournament</span>';
      ui.out.innerHTML = `<span><strong>Week of ${fmt(wk.week)}</strong></span><span class="ink">${where} (${counts[r]} wks total)</span><span><strong>${num(wk.xp)} XP</strong></span><span>${res}</span>`;
    }

    bindTabs(ui.el, v => {
      preset = v;
      focusTier = null;
      if (v === 'first') sel = weeks.findIndex(w => w.week === '2024-03-11');
      if (v === 'second') sel = weeks.findIndex(w => w.week === '2026-10-05');
      press(ui.el, v);
      draw();
    });
    hover(ui.view, x => {
      if (!geo || x < geo.x0 || x > geo.x0 + geo.pw) return;
      focusTier = null;
      let b = 0, bd = 1e9;
      for (let i = 0; i < geo.n; i++) {
        const d = Math.abs(geo.X(i) - x);
        if (d < bd) { bd = d; b = i; }
      }
      if (b !== sel) { sel = b; draw(); }
    });
    keys(ui.view, d => { focusTier = null; sel = clamp(sel + d, 0, weeks.length - 1); draw(); });

    fig.duoAction = a => {
      focusTier = a.view === 'time' ? 6 : null;
      if (a.span) {
        preset = a.span.startsWith('2024') ? 'first' : 'second';
      } else {
        preset = 'all';
      }
      press(ui.el, preset);
      if (a.week) {
        const i = weeks.findIndex(w => w.week >= a.week);
        if (i >= 0) sel = i;
      }
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ------------------------------------------------ Figure 3: the calendar
  function calendar(fig, D) {
    const days = D.days, keysAll = Object.keys(days).sort();
    const byYear = y => keysAll.filter(k => k.startsWith(y)).length;
    const kinds = {};
    D.events.forEach(e => {
      if (e.kind === 'subscription') return;
      const k = e.t.slice(0, 10);
      (kinds[k] = kinds[k] || []).push(e);
    });

    let focus = 'all', sel = '2024-03-20';
    const ui = shell(fig, tabs('Year filter', [
      ['all', `All (${keysAll.length}d)`],
      ['2024', `2024 (${byYear('2024')}d)`],
      ['2025', `2025 (${byYear('2025')}d)`],
      ['2026', `2026 (${byYear('2026')}d)`],
    ], focus));

    const years = ['2024', '2025', '2026'], last = D.generated;
    const shade = c => c >= 7 ? 1 : c >= 4 ? 0.78 : c >= 2 ? 0.54 : 0.32;
    let cells = [];

    function draw() {
      const w = width(ui.view), x0 = 36, cs = (w - x0 - 4) / 53, gapY = 24, yh = cs * 7;
      let s = '';
      cells = [];

      years.forEach((y, yi) => {
        const top = 16 + yi * (yh + gapY), jan1 = Date.UTC(+y, 0, 1), off = (new Date(jan1).getUTCDay() + 6) % 7;
        const dim = focus !== 'all' && focus !== y ? ' style="opacity:0.25"' : '';
        s += `<g${dim}>` + text(0, top + yh / 2 + 4, y, 'strong');
        for (let m = 0; m < 12; m++) {
          const t = Date.UTC(+y, m, 1), c = Math.floor(((t - jan1) / DAY + off) / 7);
          if (w > 460 || m % 2 === 0) s += text(x0 + c * cs, top - 5, MON[m]);
        }
        for (let t = jan1; new Date(t).getUTCFullYear() === +y; t += DAY) {
          const k = iso(t);
          if (k > last) break;
          const i = (t - jan1) / DAY + off, c = Math.floor(i / 7), r = i % 7, x = x0 + c * cs, yy = top + r * cs, v = days[k] || 0;
          const extra = v ? `style="fill:var(--duo-blue);fill-opacity:${shade(v)}"` : '';
          s += rect(x + 0.65, yy + 0.65, cs - 1.3, cs - 1.3, k === sel ? 'cell sel' : 'cell', `rx="${Math.min(2, cs / 5)}" ${extra}`);
          cells.push([x, yy, cs, k]);
        }
        s += '</g>';
      });

      // Bottom interactive 24-hour zoom strip for the selected day
      const stripTop = 16 + 3 * (yh + gapY) - gapY + 18, stripH = 18, sx0 = x0, spw = w - sx0 - 8;
      const list = kinds[sel] || [];
      const dObj = new Date(ms(sel));
      const stripTitle = w < 480
        ? `${fmt(sel)} · ${list.length} item${list.length === 1 ? '' : 's'} (24h ET)`
        : `${WD[(dObj.getUTCDay() + 6) % 7]}, ${fmt(sel)} — ${list.length ? list.length + ' item' + (list.length > 1 ? 's' : '') + ' across the 24-hour clock' : 'no items recorded'}`;
      s += text(sx0, stripTop - 5, stripTitle, 'ink');
      // Base 24h track + shaded 8 pm - 5 am night regions (00:00-05:00 and 20:00-24:00)
      s += rect(sx0, stripTop, spw, stripH, 'gap-band', 'rx="3"');
      s += rect(sx0, stripTop, spw * (5 / 24), stripH, 'brush-band', 'rx="2"');
      s += rect(sx0 + spw * (20 / 24), stripTop, spw * (4 / 24), stripH, 'brush-band', 'rx="2"');
      [[0, '12 am'], [6, '6 am'], [12, 'noon'], [18, '6 pm'], [24, '12 am']].forEach(([hr, lbl]) => {
        const xx = sx0 + (hr / 24) * spw;
        s += line(xx, stripTop + stripH, xx, stripTop + stripH + 4, 'axis');
        s += text(xx, stripTop + stripH + 15, lbl, '', hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle');
      });
      list.forEach(e => {
        const mins = (+e.t.slice(11, 13)) * 60 + (+e.t.slice(14, 16));
        const xx = sx0 + (mins / 1440) * spw;
        const cls = e.kind === 'streak' || e.kind === 'wager' ? 'dot amber' : 'dot blue';
        s += line(xx, stripTop + 2, xx, stripTop + stripH - 2, 'step blue');
        s += circle(xx, stripTop + stripH / 2, 3.2, cls);
      });

      ui.summary.innerHTML = `Longest streak: <span class="blue">36 days</span> (Jan 31 – Mar 7, 2024) · busiest: <b>15 items</b>`;
      ui.view.innerHTML = `<div class="duo-legend"><span>Fewer</span><span class="ramp"><i aria-hidden="true"></i>More items</span><span class="soft"><i aria-hidden="true"></i>8 pm–5 am window on day strip</span></div>` +
        svg(w, stripTop + stripH + 22, `Calendar heat map of ${keysAll.length} active days and 24-hour timestamp strip for ${sel}.`, s);
      say(list);
    }

    const KIND = { boost: 'XP boost', day: 'day item', pass: 'week pass', gems: 'gem item', streak: 'streak item', wager: 'gem wager', other: 'other item' };
    function say(list) {
      const c = {};
      list.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; });
      const parts = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<strong>${v}</strong> ${KIND[k]}${v > 1 ? 's' : ''}`);
      const d = new Date(ms(sel));
      ui.out.innerHTML = `<span><strong>${WD[(d.getUTCDay() + 6) % 7]}, ${fmt(sel)}</strong></span>` +
        (list.length
          ? `<span class="ink">${parts.join(' · ')}</span><span>first at <strong>${list[0].t.slice(11)}</strong>, last at <strong>${list[list.length - 1].t.slice(11)}</strong> ET</span>`
          : '<span>No store items activated on this date</span>');
    }

    bindTabs(ui.el, v => { focus = v; press(ui.el, v); draw(); });
    hover(ui.view, (x, y) => {
      const c = cells.find(([cx, cy, cs]) => x >= cx && x < cx + cs && y >= cy && y < cy + cs);
      if (c && c[3] !== sel) { sel = c[3]; draw(); }
    });
    keys(ui.view, d => {
      const t = ms(sel) + d * DAY;
      if (iso(t) >= '2024-01-01' && iso(t) <= last) { sel = iso(t); draw(); }
    });
    fig.duoAction = a => {
      focus = a.year || 'all';
      press(ui.el, focus);
      if (a.day) sel = a.day;
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // --------------------------------------------------- Figure 4: the clock
  function clock(fig, D) {
    const ev = D.events.filter(e => e.kind !== 'subscription');
    let year = 'all', selHour = 23, selWd = null;
    const ui = shell(fig, tabs('Year', [
      ['all', `All (${num(ev.length)})`],
      ['2024', '2024 (763)'],
      ['2025', '2025 (228)'],
      ['2026', '2026 (272)'],
    ], year));
    let geo = null;

    function aggregate() {
      const list = year === 'all' ? ev : ev.filter(e => e.t.startsWith(year));
      const h = Array(24).fill(0), wd = Array(7).fill(0);
      const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
      list.forEach(e => {
        const hr = +e.t.slice(11, 13), d = (new Date(ms(e.t)).getUTCDay() + 6) % 7;
        h[hr]++;
        wd[d]++;
        grid[d][hr]++;
      });
      return { list, h, wd, grid };
    }

    function draw() {
      const { list, h, wd, grid } = aggregate();
      const w = width(ui.view), side = w >= 600;
      const R = side ? Math.min(136, Math.round(w * 0.25)) : Math.min(132, w / 2 - 42);
      const cx = R + 36, cy = R + 26, r0 = R * 0.36, maxH = Math.max(1, ...h);
      const nightCount = h.reduce((a, v, i) => a + (i >= 20 || i < 5 ? v : 0), 0);
      const nightShare = nightCount / Math.max(1, list.length);
      let s = '';

      // Radial clock rings & outer night-window arc (8 pm -> 5 am)
      s += circle(cx, cy, R, 'ring') + circle(cx, cy, (r0 + R) / 2, 'ring');
      const arcR = R + 5;
      const a8pm = (20 / 24) * 2 * Math.PI - Math.PI / 2, a5am = (5 / 24) * 2 * Math.PI - Math.PI / 2;
      s += `<path d="M${f(cx + arcR * Math.cos(a8pm))},${f(cy + arcR * Math.sin(a8pm))}A${f(arcR)},${f(arcR)} 0 0 1 ${f(cx + arcR * Math.cos(a5am))},${f(cy + arcR * Math.sin(a5am))}" class="ring-arc"/>`;

      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * 2 * Math.PI - Math.PI / 2 + 0.014, a1 = ((i + 1) / 24) * 2 * Math.PI - Math.PI / 2 - 0.014;
        const rr = r0 + (R - r0) * Math.sqrt(h[i] / maxH);
        const p = (a, r) => f(cx + r * Math.cos(a)) + ',' + f(cy + r * Math.sin(a));
        const lit = i >= 20 || i < 5;
        const active = i === selHour ? 'style="stroke:var(--fg);stroke-width:1.6"' : '';
        s += `<path d="M${p(a0, r0)}L${p(a0, rr)}A${f(rr)},${f(rr)} 0 0 1 ${p(a1, rr)}L${p(a1, r0)}A${f(r0)},${f(r0)} 0 0 0 ${p(a0, r0)}Z" class="wedge${lit ? ' on' : ''}" data-i="${i}" ${active}/>`;
      }

      [[0, '12 am'], [6, '6 am'], [12, 'noon'], [18, '6 pm']].forEach(([i, l]) => {
        const a = (i / 24) * 2 * Math.PI - Math.PI / 2, rr = R + 17;
        s += text(cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 4, l, i === 0 ? 'ink' : '', 'middle');
      });
      s += text(cx, cy - 2, pct(nightShare), 'strong big', 'middle') + text(cx, cy + 12, '8 pm–5 am', '', 'middle');

      // Right-hand (or stacked) 7 × 24 Hour × Weekday matrix + weekday marginal totals
      const gx = side ? cx + R + 74 : 38, gy = side ? 28 : cy + R + 42;
      const availW = w - gx - 38, cw = availW / 24, rh = side ? 28 : 22;
      const maxCell = Math.max(1, ...grid.flat());

      s += text(gx, gy - 10, 'Hour × weekday (Eastern time)', 'ink') + text(w - 4, gy - 10, 'Total', '', 'end');

      // Highlight selected hour column
      s += rect(gx + selHour * cw - 0.5, gy - 2, cw + 1, 7 * rh + 4, 'brush-band', 'rx="1.5"');

      WD.forEach((dayName, d) => {
        const y = gy + d * rh;
        s += text(gx - 8, y + rh * 0.66, dayName, selWd === d ? 'strong' : '', 'end');
        for (let hr = 0; hr < 24; hr++) {
          const v = grid[d][hr];
          const op = v ? (0.22 + 0.78 * Math.sqrt(v / maxCell)).toFixed(2) : 0;
          const extra = v ? `style="fill:var(--duo-blue);fill-opacity:${op}"` : '';
          const isSel = selHour === hr && selWd === d;
          s += rect(gx + hr * cw + 0.6, y + 1.5, Math.max(1, cw - 1.2), rh - 3, isSel ? 'cell sel' : 'cell', `rx="1.5" ${extra}`);
        }
        s += text(w - 4, y + rh * 0.66, wd[d], selWd === d ? 'strong' : 'ink', 'end');
      });

      [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p'], [23, '11p']].forEach(([hr, lbl]) => {
        s += text(gx + (hr + 0.5) * cw, gy + 7 * rh + 15, lbl, hr === selHour ? 'strong' : '', 'middle');
      });

      const H = Math.max(cy + R + 28, gy + 7 * rh + 24);
      geo = { cx, cy, r0, R, gx, gy, cw, rh };

      ui.summary.innerHTML = `<span class="blue">${pct(nightShare)}</span> between 8 pm & 5 am · 11 pm hour: <b>${num(h[23])}</b> (${pct(h[23] / Math.max(1, list.length))})`;
      ui.view.innerHTML = legend([
        ['blue', 'Night window (8 pm – 5 am)'],
        ['', 'Daytime (5 am – 8 pm)'],
        ['ramp', 'Items per (weekday × hour)'],
      ]) + svg(w, H, `24-hour radial study clock and weekday-by-hour activity matrix; ${pct(nightShare)} of activity falls between 8 pm and 5 am.`, s);
      say(h, grid, list.length);
    }

    function say(h, grid, n) {
      const span = `${hourLabel(selHour)} – ${hourLabel((selHour + 1) % 24)}`;
      if (selWd !== null) {
        const cellV = grid[selWd][selHour];
        ui.out.innerHTML = `<span><strong>${WD[selWd]} · ${span}</strong></span><span class="ink"><strong>${cellV}</strong> item${cellV === 1 ? '' : 's'} in this slot</span><span>Hour total across all weekdays: <strong>${num(h[selHour])}</strong> (${pct(h[selHour] / Math.max(1, n), 1)})</span>`;
      } else {
        ui.out.innerHTML = `<span><strong>${span}</strong></span><span class="ink"><strong>${num(h[selHour])}</strong> items (${pct(h[selHour] / Math.max(1, n), 1)} of ${year === 'all' ? 'all years' : year})</span><span>Peak weekday at this hour: <strong>${WD[grid.reduce((best, r, d) => r[selHour] > grid[best][selHour] ? d : best, 0)]}</strong></span>`;
      }
    }

    bindTabs(ui.el, v => { year = v; press(ui.el, v); draw(); });
    hover(ui.view, (x, y) => {
      if (!geo) return;
      const dx = x - geo.cx, dy = y - geo.cy, r = Math.hypot(dx, dy);
      if (r >= geo.r0 * 0.5 && r <= geo.R + 10) {
        const i = Math.floor(((Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * 24);
        if (i !== selHour || selWd !== null) { selHour = i; selWd = null; draw(); }
        return;
      }
      if (x >= geo.gx && x < geo.gx + 24 * geo.cw && y >= geo.gy && y < geo.gy + 7 * geo.rh) {
        const hr = clamp(Math.floor((x - geo.gx) / geo.cw), 0, 23);
        const wd = clamp(Math.floor((y - geo.gy) / geo.rh), 0, 6);
        if (hr !== selHour || wd !== selWd) { selHour = hr; selWd = wd; draw(); }
      }
    });
    keys(ui.view, d => { selWd = null; selHour = (selHour + d + 24) % 24; draw(); });

    fig.duoAction = a => {
      if (a.year) { year = a.year; press(ui.el, year); }
      if (a.hour !== undefined) { selHour = +a.hour; selWd = null; }
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ------------------------------------------------ Figure 5: the receipts
  function receipts(fig, D) {
    const ev = D.events, months = [];
    for (let y = 2024, m = 0; y < 2026 || (y === 2026 && m <= 10); m++) {
      if (m === 12) { m = 0; y++; }
      months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    }
    const count = (k, mo) => ev.filter(e => e.kind === k && e.t.startsWith(mo)).length;
    const boosts = months.map(mo => count('boost', mo));
    const dayItems = months.map(mo => count('day', mo));
    const passes = months.map(mo => count('pass', mo));
    const nb = ev.filter(e => e.kind === 'boost').length;

    let filter = 'all', sel = months.indexOf('2024-02');
    const ui = shell(fig, tabs('Item type', [
      ['all', 'All items (1,266)'],
      ['boost', `XP boosts (${num(nb)})`],
      ['day', 'Day & week passes (113)'],
      ['special', 'Streak & wagers (3)'],
    ], filter));
    let geo = null;

    function draw() {
      const w = width(ui.view), x0 = w < 480 ? 74 : 96, pw = w - x0 - 10, n = months.length;
      const X = i => x0 + i / n * pw, cw = pw / n;
      const t0 = ms('2024-01-01'), t1 = ms('2026-12-01'), T = s => x0 + (ms(s) - t0) / (t1 - t0) * pw;
      let s = '', y = 10;

      // Year vertical reference lines first (behind everything)
      const totalH = w < 480 ? 228 : 248;
      for (let yr = 2024; yr <= 2026; yr++) {
        const xx = T(`${yr}-01-01`);
        s += line(xx, 4, xx, totalH, 'grid') + text(xx + 4, totalH + 15, yr, 'ink');
      }

      // Lane 1: Super subscriptions
      s += text(x0 - 8, y + 14, 'Super plan', 'ink', 'end');
      D.subscriptions.forEach(sub => {
        if (sub.plan === 'Free trial') return; // 3-day trial before Family plan
        const a = T(sub.start), b = Math.min(T(sub.end), x0 + pw), fam = sub.plan.startsWith('Family');
        s += rect(a, y + 2, Math.max(4, b - a), 18, fam ? 'span family' : 'span', 'rx="3"');
        const label = sub.plan === 'Monthly' ? (w < 540 ? '' : '1 mo') : sub.plan + (sub.end > D.generated ? (w < 480 ? ' →' : ' (to Jun ’27) →') : '');
        if (label && b - a > 34) s += text(a + 6, y + 15, label, fam ? 'amber' : 'blue');
      });
      y += 34;

      // Lane 2: XP boosts per month
      const bh = w < 480 ? 86 : 104, max = Math.max(...boosts);
      const dimBoost = filter !== 'all' && filter !== 'boost' ? ' style="opacity:0.22"' : '';
      s += `<g${dimBoost}>`;
      s += text(x0 - 8, y + 12, 'XP boosts', 'ink', 'end') + text(x0 - 8, y + 25, '10–30 min', '', 'end');
      for (const v of [0, 75, 150]) {
        const yy = y + bh - (v / 150) * bh;
        s += line(x0, yy, x0 + pw, yy, v === 0 ? 'axis' : 'grid');
      }
      boosts.forEach((v, i) => {
        const h = (v / 150) * bh;
        s += rect(X(i) + cw * 0.14, y + bh - h, cw * 0.72, h, i === sel ? 'bar amber' : 'bar on', 'rx="1"');
      });
      if (w >= 480) {
        [[1, '147'], [2, '122'], [33, '52']].forEach(([idx, lbl]) => {
          const h = (boosts[idx] / 150) * bh;
          s += text(X(idx) + cw / 2, y + bh - h - 4, lbl, idx === sel ? 'amber halo' : 'ink halo', 'middle');
        });
      }
      s += '</g>';
      y += bh + 16;

      // Lane 3: Day-long items + week passes
      const dh = 30, dmax = Math.max(1, ...months.map((_, i) => dayItems[i] + passes[i]));
      const dimDay = filter !== 'all' && filter !== 'day' ? ' style="opacity:0.22"' : '';
      s += `<g${dimDay}>`;
      s += text(x0 - 8, y + 14, 'Day & week', 'ink', 'end') + text(x0 - 8, y + 27, 'passes', '', 'end');
      s += line(x0, y + dh, x0 + pw, y + dh, 'axis');
      months.forEach((_, i) => {
        const hDay = (dayItems[i] / dmax) * dh, hPass = (passes[i] / dmax) * dh;
        s += rect(X(i) + cw * 0.14, y + dh - hDay, cw * 0.72, hDay, 'bar mid');
        if (hPass > 0) s += rect(X(i) + cw * 0.14, y + dh - hDay - hPass, cw * 0.72, hPass, 'bar on');
      });
      s += '</g>';
      y += dh + 18;

      // Lane 4: One-off decisions (Gem wager & Streak repair/freeze) with leader callouts
      const dimSpec = filter !== 'all' && filter !== 'special' ? ' style="opacity:0.25"' : '';
      s += `<g${dimSpec}>`;
      s += text(x0 - 8, y + 14, 'One-offs', 'ink', 'end');
      s += line(x0, y + 10, x0 + pw, y + 10, 'grid');
      const xWager = T('2024-12-22'), xStreak = T('2026-11-08');
      s += circle(xWager, y + 10, 4.2, 'dot amber');
      s += text(xWager, y + 25, w < 520 ? '7-day wager' : '7-day gem wager (Dec ’24)', 'amber halo', 'middle');
      s += circle(xStreak, y + 10, 4.2, 'dot amber');
      s += text(xStreak - 8, y + 14, w < 520 ? 'Streak repair + freeze' : 'Streak repair + freeze (Nov 8–9, ’26)', 'amber halo', 'end');
      s += '</g>';

      s += line(X(sel) + cw / 2, 4, X(sel) + cw / 2, totalH, 'cursor');
      s += rect(x0, 0, pw, totalH, 'hit');
      geo = { X, cw, x0, pw };

      ui.summary.innerHTML = `<b>4</b> Super plans · <span class="blue">${num(nb)}</span> XP boosts · <b>99</b> day items · <span class="amber">1</span> streak repair`;
      ui.view.innerHTML = legend([
        ['soft', 'Super plan'],
        ['blue', 'XP boosts (10–30 min)'],
        ['mid', 'Day-long items'],
        ['amber round', 'Wager & streak repair'],
      ]) + svg(w, totalH + 22, 'Timeline of Super subscriptions, monthly XP boost counts, day-long items, and one-off streak events.', s);
      say();
    }

    function say() {
      const mo = months[sel], d = new Date(ms(mo + '-01'));
      const plan = D.subscriptions.filter(s => s.start.slice(0, 7) <= mo && s.end.slice(0, 7) >= mo).map(s => s.plan).join(' + ') || 'no paid plan (3-month gap)';
      ui.out.innerHTML = `<span><strong>${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}</strong></span><span class="ink"><strong>${boosts[sel]}</strong> XP boosts</span><span><strong>${dayItems[sel]}</strong> day items · <strong>${passes[sel]}</strong> week passes</span><span>Plan: <strong>${plan}</strong></span>`;
    }

    bindTabs(ui.el, v => {
      filter = v;
      if (v === 'boost') sel = months.indexOf('2024-02');
      if (v === 'day') sel = months.indexOf('2026-09');
      if (v === 'special') sel = months.indexOf('2026-11');
      press(ui.el, v);
      draw();
    });
    hover(ui.view, x => {
      if (!geo || x < geo.x0) return;
      const i = clamp(Math.floor((x - geo.X(0)) / geo.cw), 0, months.length - 1);
      if (i !== sel) { sel = i; draw(); }
    });
    keys(ui.view, d => { sel = clamp(sel + d, 0, months.length - 1); draw(); });
    fig.duoAction = a => {
      if (a.month) sel = Math.max(0, months.indexOf(a.month));
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ------------------------------------------------- Figure 6: the courses
  function courses(fig, D) {
    let scale = 'linear', sel = 0;
    const list = D.courses, tot = list.reduce((a, c) => a + (c.xp || 0), 0);
    const PAIR = {
      'es<-en': 'EN→ES', 'fr<-en': 'EN→FR', 'zh-CN<-en': 'EN→ZH', 'en<-hi': 'HI→EN',
      'en<-zh-CN': 'ZH→EN', 'es<-zh-CN': 'ZH→ES', 'ko<-en': 'EN→KO', 'zh-HK<-zh-CN': 'ZH→YUE',
    };
    const ui = shell(fig, tabs('Scale', [['linear', 'Linear scale'], ['log', 'Log₁₀ scale']], scale));
    const t0 = ms('2024-01-01'), t1 = ms('2026-11-20');

    function draw() {
      const w = width(ui.view), showDate = w >= 540;
      const x0 = w < 480 ? 148 : 176;
      const dateW = showDate ? 136 : 0, gapX = showDate ? 24 : 0;
      const pw = w - x0 - dateW - gapX - (w < 480 ? 54 : 68), dx0 = w - dateW - 8;
      const rh = 30, max = 125265, H = list.length * rh;
      const L = v => scale === 'log' ? (v <= 0 ? 0 : Math.log10(v) / Math.log10(max)) : v / max;
      let s = '';

      s += text(x0, 10, scale === 'log' ? 'Course XP (log₁₀ scale)' : 'Course XP (linear scale)', 'ink');
      if (showDate) {
        s += text(dx0, 10, 'Last opened (2024–26)', 'ink');
        for (const [yr, lbl] of [['2024-01-01', "'24"], ['2025-01-01', "'25"], ['2026-01-01', "'26"]]) {
          const tx = dx0 + (ms(yr) - t0) / (t1 - t0) * (dateW - 8);
          s += line(tx, 16, tx, 16 + H, 'grid') + text(tx + 2, 16 + H + 15, lbl);
        }
      }

      if (scale === 'log') {
        (w < 480 ? [10, 1000, 100000] : [10, 100, 1000, 10000, 100000]).forEach(v => {
          const xx = x0 + L(v) * pw;
          s += line(xx, 16, xx, 16 + H, 'grid') + text(xx, 16 + H + 15, v >= 1000 ? (v / 1000) + 'k' : num(v), '', 'middle');
        });
      }

      list.forEach((c, i) => {
        const y = 16 + i * rh, isSel = i === sel;
        s += `<g data-i="${i}">` + rect(0, y, w, rh, 'hit');
        s += text(x0 - 8, y + 19, c.name, isSel ? 'strong' : 'ink', 'end');
        if (c.xp) {
          const bw = Math.max(2.5, L(c.xp) * pw);
          s += rect(x0, y + 7, bw, rh - 14, i === 0 ? 'bar on' : 'bar mid', 'rx="1.5"');
          s += text(x0 + bw + 6, y + 19, num(c.xp), isSel ? 'strong' : 'ink');
        } else {
          s += line(x0, y + 8, x0, y + rh - 8, 'axis');
          s += text(x0 + 7, y + 19, c.xp === 0 ? '0 XP' : (w < 480 ? 'no XP kept' : 'opened · no XP kept'));
        }
        if (showDate) {
          const tx = dx0 + (ms(c.last) - t0) / (t1 - t0) * (dateW - 8);
          s += line(dx0, y + 15, dx0 + dateW - 8, y + 15, 'grid');
          s += circle(tx, y + 15, isSel ? 4.2 : 3, i === 0 ? 'dot blue' : c.xp ? 'dot mid' : 'dot hollow');
        }
        s += '</g>';
      });

      ui.summary.innerHTML = `<span class="blue">98.2%</span> in Spanish (<b>125,265</b> XP) · French <b>2,110</b> · Chinese <b>180</b>`;
      ui.view.innerHTML = svg(w, 16 + H + (scale === 'log' || showDate ? 22 : 6), `XP across 8 opened courses on a ${scale} scale, plus last-opened date.`, s);
      all('[data-i]', ui.view).forEach(g => {
        const pick = () => { if (+g.dataset.i !== sel) { sel = +g.dataset.i; draw(); } };
        g.addEventListener('pointerenter', pick);
        g.addEventListener('click', pick);
      });
      const c = list[sel];
      ui.out.innerHTML = `<span><strong>${c.name}</strong> (${PAIR[c.id]})</span><span class="ink">${c.xp ? `<strong>${num(c.xp)} XP</strong> · ${pct(c.xp / tot, c.xp / tot < 0.01 ? 2 : 1)} of course XP` : 'Opened out of curiosity · 0 XP recorded'}</span><span>last touched <strong>${fmt(c.last)}</strong></span>`;
    }

    bindTabs(ui.el, v => { scale = v; press(ui.el, v); draw(); });
    keys(ui.view, d => { sel = clamp(sel - d, 0, list.length - 1); draw(); });
    fig.duoAction = a => {
      if (a.scale) { scale = a.scale; press(ui.el, scale); }
      if (a.course) sel = Math.max(0, list.findIndex(c => c.name === a.course || c.id === a.course));
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ------------------------------------------------ Figure 7: where I am now
  function now(fig, D) {
    let mode = 'path', filter = 'all', sel = null;
    const credits = D.path.credits, K = D.knowledge;
    const TYPES = [
      ['CHEST', 'Lesson chest'],
      ['PRACTICE', 'Practice'],
      ['STORY', 'Story'],
      ['DUORADIO', 'DuoRadio'],
      ['VIDEO_CALL', 'Video call'],
      ['UNIT_REVIEW', 'Unit review'],
    ];
    const rowIdx = Object.fromEntries(TYPES.map(([k], i) => [k, i]));
    const seen = K.reduce((a, k) => a + k.seen, 0), right = K.reduce((a, k) => a + k.right, 0);

    const ui = shell(fig,
      tabs('View', [['path', 'Path sequence (88)'], ['skills', 'Tracked skills (73)']], mode) +
      `<div class="duo-pills" hidden role="group" aria-label="Skill kind">` +
      [['all', 'All (73)'], ['pattern', 'Patterns (53)'], ['word', 'Words (15)'], ['grammar', 'Grammar (5)']]
        .map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('') +
      `</div>`);
    const pillBox = $('.duo-pills', ui.el);
    all('[data-kind]', pillBox).forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.kind;
      all('[data-kind]', pillBox).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.kind === filter)));
      draw();
    }));

    let pts = [];
    function draw() {
      const w = width(ui.view);
      let s = '';
      pts = [];
      pillBox.hidden = mode !== 'skills';

      if (mode === 'path') {
        const x0 = w < 480 ? 84 : 100, pw = w - x0 - 30, rh = 30;
        const t0 = ms('2026-09-08'), t1 = ms('2026-11-11'), X = t => x0 + (Date.parse(t + ':00Z') - t0) / (t1 - t0) * pw;
        const Y = r => r * rh + 18;

        // Grid rows + right-hand counts
        TYPES.forEach(([k, l], r) => {
          const y = Y(r), cnt = credits.filter(c => c.kind === k).length;
          s += line(x0, y, x0 + pw, y) + text(x0 - 9, y + 4, l, 'ink', 'end') + text(x0 + pw + 8, y + 4, cnt, 'mono');
        });

        // Connect consecutive path steps completed within 36 hours so the 6-step unit cycle is visible
        for (let i = 1; i < credits.length; i++) {
          const a = credits[i - 1], b = credits[i];
          const dt = Date.parse(b.t + ':00Z') - Date.parse(a.t + ':00Z');
          if (dt <= 36 * 3600e3 && rowIdx[a.kind] !== rowIdx[b.kind]) {
            s += `<path d="M${f(X(a.t))},${f(Y(rowIdx[a.kind]))}L${f(X(b.t))},${f(Y(rowIdx[b.kind]))}" class="thread"/>`;
          }
        }

        // Activity dots
        const cur = sel && sel.kind ? sel : credits[credits.length - 1];
        credits.forEach(c => {
          const r = rowIdx[c.kind], x = X(c.t), y = Y(r);
          const speak = c.kind === 'VIDEO_CALL' || c.kind === 'STORY' || c.kind === 'DUORADIO';
          const cls = c === cur ? 'dot amber' : speak ? 'dot blue' : 'dot mid';
          s += circle(x, y, c === cur ? 5 : 3.8, cls);
          pts.push([x, y, c]);
        });

        const H = TYPES.length * rh;
        for (const d of ['2026-09-15', '2026-10-01', '2026-10-15', '2026-11-01']) {
          const xx = X(d + 'T00:00');
          s += line(xx, H, xx, H + 5, 'axis') + text(xx, H + 18, fmt(d, false), '', 'middle');
        }
        ui.summary.innerHTML = `Section <b>${D.path.section}</b>, Unit <b>${D.path.unit}</b> · <b>${credits.length}</b> steps since Sep 9`;
        ui.view.innerHTML = legend([
          ['blue round', 'Story, DuoRadio & Lily video call'],
          ['mid round', 'Chest, practice & unit review'],
          ['line', 'Same-session step chain'],
        ]) + svg(w, H + 24, 'Connected dot timeline of 88 Spanish path activities across the six recurring lesson steps.', s);
        ui.out.innerHTML = `<span><strong>${TYPES[rowIdx[cur.kind]][1]}</strong></span><span class="ink">${fmt(cur.t)} at <strong>${cur.t.slice(11)} ET</strong></span><span>Each unit cycles through all 6 steps (~15 completed of each)</span>`;
      } else {
        const x0 = 44, pw = w - x0 - 14, ph = 216, top = 14, xmax = 22;
        const X = v => x0 + 12 + v / xmax * (pw - 18), Y = a => top + ph - (a - 0.4) / 0.6 * ph;
        for (const a of [0.4, 0.6, 0.8, 1]) {
          s += line(x0, Y(a), x0 + pw, Y(a), a === 0.4 ? 'axis' : 'grid') + text(x0 - 7, Y(a) + 4, pct(a), '', 'end');
        }
        // Overall 87% accuracy benchmark line (375 / 432 tests)
        const avgAcc = right / seen;
        s += line(x0, Y(avgAcc), x0 + pw, Y(avgAcc), 'bench');
        s += text(x0 + pw - 4, Y(avgAcc) - 5, `Overall average · ${pct(avgAcc, 0)} (${right}/${seen} tests)`, 'ink halo', 'end');

        for (const v of [0, 5, 10, 15, 20]) {
          s += line(X(v), top + ph, X(v), top + ph + 4, 'axis') + text(X(v), top + ph + 17, v, '', 'middle');
        }
        s += text(x0 + pw / 2, top + ph + 34, 'Times tested →', '', 'middle');

        const totals = {}, used = {};
        K.forEach(k => {
          const acc = k.seen ? k.right / k.seen : 1, key = k.seen + ':' + acc.toFixed(3);
          totals[key] = (totals[key] || 0) + 1;
        });
        const cur = sel && sel.seen !== undefined ? sel : K[0];
        K.forEach(k => {
          const acc = k.seen ? k.right / k.seen : 1, key = k.seen + ':' + acc.toFixed(3);
          const j = (used[key] = (used[key] || 0) + 1) - 1, cnt = totals[key];
          const dx = (j - (cnt - 1) / 2) * 2.2;
          const x = Math.max(x0 + 10, X(k.seen) + dx), y = Y(Math.max(0.4, acc));
          const dim = filter !== 'all' && filter !== k.kind ? ' style="opacity:0.18"' : '';
          const cls = k === cur ? 'dot amber' : k.kind === 'word' ? 'dot blue' : k.kind === 'grammar' ? 'dot amber hollow' : 'dot mid';
          s += circle(x, y, k === cur ? 5.2 : 4, cls, dim);
          pts.push([x, y, k]);
        });

        ui.summary.innerHTML = `<b>73</b> tracked skills · <b>${num(seen)}</b> tests · <span class="blue">${pct(avgAcc, 0)}</span> correct`;
        ui.view.innerHTML = legend([
          ['mid round', 'Sentence pattern (53 · 87.3%)'],
          ['blue round', 'Vocabulary word (15 · 85.4%)'],
          ['amber round', 'Grammar rule (5 · 87.5%)'],
        ]) + svg(w, top + ph + 40, 'Scatter plot of 73 tracked Spanish knowledge components by times tested and accuracy.', s);

        const label = { word: 'Vocabulary word', pattern: 'Sentence pattern', grammar: 'Grammar rule' }[cur.kind];
        ui.out.innerHTML = `<span><strong>${label}</strong> (hashed ID)</span><span class="ink">tested <strong>${cur.seen}×</strong></span><span><strong>${cur.right}</strong> right · <span class="${cur.wrong ? 'amber' : ''}">${cur.wrong} wrong</span> (${pct(cur.right / cur.seen, 0)})</span><span>last tested <strong>${fmt(cur.last)}</strong></span>`;
      }
    }

    bindTabs(ui.el, v => { mode = v; sel = null; press(ui.el, v); draw(); });
    hover(ui.view, (x, y) => {
      let b = null, bd = 20;
      pts.forEach(p => {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < bd) { bd = d; b = p[2]; }
      });
      if (b && b !== sel) { sel = b; draw(); }
    });
    fig.duoAction = a => {
      if (a.view) { mode = a.view; sel = null; press(ui.el, mode); }
      draw();
    };
    observe(ui.view, draw);
    draw();
  }

  // ------------------------------------------------------------------- boot
  const figures = {
    'duo-run': run,
    'duo-ladder': ladder,
    'duo-calendar': calendar,
    'duo-clock': clock,
    'duo-receipts': receipts,
    'duo-courses': courses,
    'duo-now': now,
  };
  function failure(fig) {
    const p = document.createElement('p');
    p.className = 'duo-error';
    p.innerHTML = `This figure could not load. <a href="${first.dataset.src}">Open the data</a> or reload the page.`;
    fig.insertBefore(p, $('figcaption', fig));
    fig.classList.add('ready');
  }
  fetch(first.dataset.src).then(r => {
    if (!r.ok) throw Error('data unavailable');
    return r.json();
  }).then(D => {
    for (const [id, mount] of Object.entries(figures)) {
      const fig = document.getElementById(id);
      if (!fig) continue;
      try { mount(fig, D); } catch (e) { console.error(id, e); failure(fig); }
    }
  }).catch(e => {
    console.error(e);
    Object.keys(figures).forEach(id => {
      const fig = document.getElementById(id);
      if (fig) failure(fig);
    });
  });

  document.addEventListener('click', ev => {
    const a = ev.target.closest('a.act[href^="#duo-"]');
    if (!a) return;
    const fig = document.getElementById(a.getAttribute('href').slice(1));
    if (fig && fig.duoAction) fig.duoAction(a.dataset);
  });
})();
