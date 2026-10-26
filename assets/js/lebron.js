/* Source-backed figures for the LeBron James post. No chart library or live API. */
(function () {
  'use strict';
  const {
    careerPath, careerAtSeason, topCareerScorers, createSeasonState,
    shotMix, hexbinShots, densityRadius, shotShareLevel, hexEfficiency, seriesProgress
  } = window.LeBronCharts;

  const NS = 'http://www.w3.org/2000/svg';
  const BRON = 'LeBron James';
  const ERAS = [
    { idx: 0, team: 'Cleveland', code: 'CLE', label: '03–10', start: 2004, end: 2010, color: 'var(--lbj-era-0)' },
    { idx: 1, team: 'Miami', code: 'MIA', label: '10–14', start: 2011, end: 2014, color: 'var(--lbj-era-1)' },
    { idx: 2, team: 'Cleveland', code: 'CLE', label: '14–18', start: 2015, end: 2018, color: 'var(--lbj-era-2)' },
    { idx: 3, team: 'Los Angeles', code: 'LAL', label: '18–26', start: 2019, end: 2026, color: 'var(--lbj-era-3)' }
  ];
  const STAT_NAMES = { pts: 'points', ast: 'assists', trb: 'rebounds', stl: 'steals', blk: 'blocks' };
  const SHORT_NAMES = {
    [BRON]: 'LeBron',
    'Kareem Abdul-Jabbar': 'Kareem',
    'Karl Malone': 'Malone',
    'Kobe Bryant': 'Kobe',
    'Kevin Durant': 'Durant',
    'Michael Jordan': 'Jordan',
    'Dirk Nowitzki': 'Nowitzki',
    'Wilt Chamberlain': 'Wilt',
    'James Harden': 'Harden',
    "Shaquille O'Neal": 'Shaq',
    'Magic Johnson': 'Magic',
    'John Stockton': 'Stockton',
    'Chris Paul': 'CP3',
    'Jason Kidd': 'Kidd',
    'Bill Russell': 'Russell',
    'Tim Duncan': 'Duncan'
  };

  const controllers = {};
  const sharedSeason = createSeasonState(2004, 2026);
  const cache = new Map();

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const dec = n => (n == null ? '—' : n.toFixed(1));
  const pct = n => (n == null ? '—' : (n * 100).toFixed(1) + '%');
  const signedPct = n => (n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n * 100).toFixed(1) + '%');
  const season = y => (y - 1) + '–' + String(y).slice(2);
  const shortName = name => SHORT_NAMES[name] || name.split(' ').at(-1);
  const total = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
  const eraForYear = y => ERAS.find(e => y >= e.start && y <= e.end) || ERAS[0];

  function el(tag, attrs = {}, parent) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    });
    if (parent) parent.append(node);
    return node;
  }

  function svg(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    if (parent) parent.append(node);
    return node;
  }

  function get(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then(r => {
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.json();
      }).catch(err => {
        cache.delete(url);
        throw err;
      }));
    }
    return cache.get(url);
  }

  function tabs(parent, label, options, value, change) {
    const group = el('div', { class: 'tabs', role: 'group', 'aria-label': label }, parent);
    const buttons = options.map(([v, t]) => {
      const b = el('button', { type: 'button', text: t, 'aria-pressed': String(v === value) }, group);
      b.addEventListener('click', () => { set(v); change(v); });
      return [v, b];
    });
    function set(v) { buttons.forEach(([key, b]) => b.setAttribute('aria-pressed', String(v === key))); }
    return { set, node: group };
  }

  function pills(parent, label, options, value, change) {
    const group = el('div', { class: 'lbj-pills', role: 'group', 'aria-label': label }, parent);
    const buttons = options.map(([v, t]) => {
      const b = el('button', { type: 'button', text: t, 'aria-pressed': String(v === value) }, group);
      b.addEventListener('click', () => { set(v); change(v); });
      return [v, b];
    });
    function set(v) { buttons.forEach(([key, b]) => b.setAttribute('aria-pressed', String(v === key))); }
    return { set, node: group };
  }

  function mount(fig) {
    const body = el('div', { class: 'fig-body' });
    fig.prepend(body);
    fig.classList.add('ready');
    return body;
  }

  function readout(parent) {
    return el('div', { class: 'lbj-readout', 'aria-live': 'polite', 'aria-atomic': 'true' }, parent);
  }

  function describe(node, title, text) {
    node.replaceChildren();
    el('strong', { text: title + ' ' }, node);
    node.append(document.createTextNode(text));
  }

  function responsive(container, render) {
    let last = 0;
    new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width);
      if (w && w !== last) { last = w; render(); }
    }).observe(container);
  }

  // Piecewise RGB ramp for court FG% delta vs NBA zone baseline (-10 pp .. +10 pp).
  function effColor(shrunkDelta, dark) {
    const stops = dark
      ? [[91, 143, 209], [112, 138, 168], [126, 119, 109], [217, 154, 78], [239, 90, 68]]
      : [[53, 99, 156], [108, 134, 163], [152, 143, 130], [202, 124, 38], [197, 57, 41]];
    const u = (Math.max(-0.1, Math.min(0.1, shrunkDelta)) + 0.1) / 0.2 * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(u)), t = u - i;
    const a = stops[i], b = stops[i + 1];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  }

  function timeline(data) {
    const host = document.getElementById('lbj-timeline');
    if (!host || host.childElementCount) return;
    const heading = el('div', { class: 'lbj-timeline-heading' }, host);
    const output = el('output', { for: 'lbj-shared-season', 'aria-live': 'off' }, heading);
    const context = el('span', { class: 'lbj-timeline-context' }, heading);
    const track = el('div', { class: 'lbj-timeline-track' }, host);
    const prev = el('button', { type: 'button', text: '‹', 'aria-label': 'Previous season' }, track);
    const range = el('div', { class: 'lbj-timeline-range' }, track);
    const slider = el('input', {
      type: 'range', id: 'lbj-shared-season', min: 2004, max: 2026, step: 1,
      value: sharedSeason.year, 'aria-label': 'Shared season',
      'aria-describedby': 'lbj-timeline-help', 'aria-controls': 'lbj-peak lbj-career lbj-shots'
    }, range);
    const eraBar = el('div', { class: 'lbj-timeline-eras', 'aria-hidden': 'true' }, range);
    const eraSpans = ERAS.map(e => el('span', { text: e.code }, eraBar));
    const next = el('button', { type: 'button', text: '›', 'aria-label': 'Next season' }, track);

    slider.addEventListener('input', () => sharedSeason.select(slider.value, 'timeline'));
    prev.addEventListener('click', () => sharedSeason.select(sharedSeason.year - 1, 'timeline'));
    next.addEventListener('click', () => sharedSeason.select(sharedSeason.year + 1, 'timeline'));

    function render() {
      const s = data.seasons.find(r => r.phase === 'rs' && r.year === sharedSeason.year);
      slider.value = s.year;
      output.textContent = season(s.year);
      context.textContent = s.team + ' · Age ' + s.age + ' · Yr ' + (s.year - 2003) + '/23';
      slider.setAttribute('aria-valuetext', season(s.year) + ', ' + s.team + ', age ' + s.age + ', season ' + (s.year - 2003) + ' of 23');
      prev.disabled = s.year === 2004;
      next.disabled = s.year === 2026;
      eraSpans.forEach((sp, i) => sp.classList.toggle('active', s.year >= ERAS[i].start && s.year <= ERAS[i].end));
      host.dataset.year = s.year;
    }
    sharedSeason.subscribe('timeline', render);
    render();
    host.hidden = false;
  }

  function chart(holder, options) {
    holder.replaceChildren();
    const w = Math.max(280, Math.round(holder.getBoundingClientRect().width));
    const h = options.height || 300;
    const pad = { left: options.left || 38, right: options.right || 18, top: options.top || 26, bottom: options.bottom || 38 };
    const iw = w - pad.left - pad.right, ih = h - pad.top - pad.bottom;
    const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'lbj-chart', role: 'img', 'aria-label': options.label }, holder);
    const x = v => pad.left + (v - options.xmin) / (options.xmax - options.xmin) * iw;
    const y = v => pad.top + ih - (v - options.ymin) / (options.ymax - options.ymin) * ih;
    (options.yticks || []).forEach(v => {
      svg('line', { x1: pad.left, x2: w - pad.right, y1: y(v), y2: y(v), class: 'lbj-grid' }, root);
      svg('text', { x: pad.left - 8, y: y(v) + 3.5, 'text-anchor': 'end', text: options.yfmt ? options.yfmt(v) : v }, root);
    });
    (options.xticks || []).forEach(v => {
      svg('text', { x: x(v), y: h - 18, 'text-anchor': 'middle', text: options.xfmt ? options.xfmt(v) : v }, root);
    });
    svg('line', { x1: pad.left, x2: w - pad.right, y1: y(options.ymin), y2: y(options.ymin), class: 'lbj-axis' }, root);
    if (options.ylabel) svg('text', { x: pad.left, y: 12, text: options.ylabel, class: 'lbj-axis-title' }, root);
    if (options.xlabel) svg('text', { x: w - pad.right, y: h - 3, 'text-anchor': 'end', text: options.xlabel, class: 'lbj-axis-title' }, root);
    return { root, x, y, w, h, pad };
  }

  /* ------------------------------------------------ Figure 1: Career & Peak */
  function peak(fig, data) {
    const b = mount(fig), all = data.players, cohort = topCareerScorers(all);
    let year = sharedSeason.year, mode = 'career', rival = 'Kareem Abdul-Jabbar', n = 7;

    const bar = el('div', { class: 'fig-controls', id: 'lbj-peak-best' }, b);
    const modeTabs = tabs(bar, 'Scoring comparison mode', [
      ['career', 'Cumulative career'],
      ['best', 'Peak seasons']
    ], mode, v => { mode = v; render(); });

    const windowWrap = el('label', { class: 'lbj-inline-range', hidden: '' }, bar);
    windowWrap.append(document.createTextNode('Top '));
    const slider = el('input', { type: 'range', min: 1, max: 23, value: n, 'aria-label': 'Number of highest-scoring seasons' }, windowWrap);
    const windowOut = el('output', {}, windowWrap);
    slider.addEventListener('input', () => { n = +slider.value; render(); });

    const summary = el('span', { class: 'fig-num' }, bar);
    const holder = el('div', {}, b);
    const keys = el('div', { class: 'lbj-rank-keys', role: 'group', 'aria-label': 'Top ten career scorers' }, b);
    const detail = readout(b);

    let paths = [], keyButtons = [];

    function inspectPlayer(player, isHover = false) {
      paths.forEach(([p, path]) => path.classList.toggle('inspected', isHover && p.name === player.name && p.name !== BRON && p.name !== rival));
      keyButtons.forEach(([p, btn]) => btn.classList.toggle('inspected', isHover && p.name === player.name && p.name !== rival));
      const count = year - 2003;
      const point = careerAtSeason(player, count);
      const bronPt = careerAtSeason(cohort.find(p => p.name === BRON), count);
      const diff = point.pts - bronPt.pts;
      const cmp = player.name === BRON ? '' : fmt(Math.abs(diff)) + (diff > 0 ? ' ahead of LeBron · ' : ' behind LeBron · ');
      describe(detail, player.name, cmp + dec(point.pts / point.g) + ' PPG · ' + fmt(point.g) + ' GP · ' + point.n + ' seasons played.');
    }

    function renderCareer() {
      keys.hidden = false;
      windowWrap.hidden = true;
      const count = year - 2003;
      const ranked = cohort.map(player => ({ player, point: careerAtSeason(player, count) }))
        .sort((a, b) => b.point.pts - a.point.pts || b.player.pts - a.player.pts);
      const bronRow = ranked.find(r => r.player.name === BRON);
      const rivalRow = ranked.find(r => r.player.name === rival) || ranked[1];
      const diff = bronRow.point.pts - rivalRow.point.pts;

      summary.innerHTML = `<span class="accent">${fmt(bronRow.point.pts)} pts</span> · Yr ${count} · ${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs <span class="rival">${shortName(rivalRow.player.name)}</span>`;

      const narrow = holder.getBoundingClientRect().width < 520;
      const c = chart(holder, {
        height: narrow ? 285 : 315, right: narrow ? 54 : 78,
        xmin: 0, xmax: 23, ymin: 0, ymax: 46000,
        xticks: narrow ? [0, 10, 20, 23] : [0, 5, 10, 15, 20, 23],
        yticks: [0, 10000, 20000, 30000, 40000],
        yfmt: v => (v ? v / 1000 + 'k' : '0'),
        xlabel: 'Seasons played', ylabel: 'Cumulative points',
        label: `Cumulative regular-season points through ${count} seasons. LeBron has ${fmt(bronRow.point.pts)} points.`
      });

      const defs = svg('defs', {}, c.root);
      const grad = svg('linearGradient', { id: 'lbj-peak-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svg('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.13' }, grad);
      svg('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.0' }, grad);

      const line = rows => rows.map((s, i) => (i ? 'L' : 'M') + c.x(s.n).toFixed(1) + ',' + c.y(s.pts).toFixed(1)).join(' ');
      all.forEach(p => svg('path', { d: line(careerPath(p)), class: 'lbj-context-career', 'aria-hidden': 'true' }, c.root));

      // Kareem's 38,387 record benchmark line & Season 20 passing mark
      const kareemMark = 38387;
      svg('line', { x1: c.pad.left, x2: c.x(23), y1: c.y(kareemMark), y2: c.y(kareemMark), class: 'lbj-benchmark' }, c.root);
      if (count >= 20) {
        svg('circle', { cx: c.x(20), cy: c.y(kareemMark), r: 4.2, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.2, opacity: 0.7 }, c.root);
      }

      // Soft area fill under LeBron's curve up to selected season
      const bronCurve = careerPath(bronRow.player).filter(p => p.n <= count);
      if (bronCurve.length > 1) {
        const lastPt = bronCurve.at(-1);
        svg('path', {
          d: line(bronCurve) + `L${c.x(lastPt.n).toFixed(1)},${c.y(0).toFixed(1)}L${c.x(0).toFixed(1)},${c.y(0).toFixed(1)}Z`,
          fill: 'url(#lbj-peak-grad)', 'aria-hidden': 'true'
        }, c.root);
      }

      // Subtle stint boundary ticks along LeBron's baseline
      [7, 11, 15].forEach(boundary => {
        if (boundary < count) {
          svg('line', { x1: c.x(boundary), x2: c.x(boundary), y1: c.y(0) - 4, y2: c.y(0) + 4, stroke: 'var(--line-2)' }, c.root);
        }
      });
      svg('line', { x1: c.x(count), x2: c.x(count), y1: c.pad.top, y2: c.y(0), class: 'lbj-crosshair' }, c.root);

      paths = [];
      keyButtons = [];
      keys.replaceChildren();

      const ordered = cohort.filter(p => p.name !== BRON && p.name !== rival)
        .concat(cohort.filter(p => p.name === rival && p.name !== BRON))
        .concat(cohort.filter(p => p.name === BRON));

      ordered.forEach(player => {
        const isBron = player.name === BRON, isRival = player.name === rival && !isBron;
        const point = careerAtSeason(player, count);
        const group = svg('g', { class: 'lbj-path-player', 'data-player': player.name }, c.root);
        const path = svg('path', {
          d: line(careerPath(player).filter(p => p.n <= count)),
          class: isBron ? 'lbj-line' : 'lbj-career-peer' + (isRival ? ' rival' : '')
        }, group);
        paths.push([player, path]);
        svg('path', { d: line(careerPath(player)), fill: 'none', stroke: 'transparent', 'stroke-width': 12, class: 'lbj-hit' }, group);
        svg('circle', {
          cx: c.x(point.n), cy: c.y(point.pts),
          r: isBron ? 4.4 : isRival ? 3.5 : 2.3,
          fill: isBron ? 'var(--accent)' : isRival ? 'var(--lbj-rival)' : 'var(--lbj-peer)',
          stroke: 'var(--bg)', 'stroke-width': 1.2
        }, group);
        group.addEventListener('pointerenter', () => inspectPlayer(player, true));
        group.addEventListener('pointerleave', () => inspectPlayer(cohort.find(p => p.name === rival) || bronRow.player, false));
        group.addEventListener('click', () => { if (player.name !== BRON) rival = player.name; render(); });
      });

      // Direct 2D non-overlapping labels on LeBron + active rival + key landmarks
      const placed = [];
      const labelTargets = [BRON, rival, 'Kareem Abdul-Jabbar', 'Karl Malone', 'Michael Jordan', 'Wilt Chamberlain']
        .filter((v, i, arr) => arr.indexOf(v) === i);
      labelTargets.forEach(name => {
        const player = cohort.find(p => p.name === name);
        if (!player) return;
        const pt = careerAtSeason(player, count);
        const isBron = name === BRON, isRival = name === rival && !isBron;
        const cls = isBron ? 'lbj-bron-label' : isRival ? 'lbj-rival-label' : 'lbj-direct-label';
        const txt = shortName(name) + (narrow ? '' : ' ' + (pt.pts / 1000).toFixed(1) + 'k');
        const node = svg('text', { text: txt, class: cls }, c.root);
        const wText = node.getComputedTextLength();
        let lx = c.x(pt.n) + 7, ly = c.y(pt.pts) + (isBron ? -7 : 3.5), anchor = 'start';
        if (lx + wText > c.w - 2) {
          lx = c.x(pt.n) - 7;
          anchor = 'end';
        }
        const box = {
          left: anchor === 'end' ? lx - wText : lx,
          right: anchor === 'end' ? lx : lx + wText,
          top: ly - 11,
          bottom: ly + 3
        };
        if (!isBron && !isRival && placed.some(b => box.left < b.right + 5 && box.right > b.left - 5 && box.top < b.bottom + 2 && box.bottom > b.top - 2)) {
          node.remove();
          return;
        }
        node.setAttribute('x', lx);
        node.setAttribute('y', ly);
        node.setAttribute('text-anchor', anchor);
        placed.push(box);
      });

      ranked.forEach(({ player, point }, idx) => {
        const isBron = player.name === BRON, isRival = player.name === rival && !isBron;
        const btn = el('button', {
          type: 'button',
          class: 'lbj-rank-key' + (isBron ? ' is-bron' : isRival ? ' is-rival' : ''),
          'aria-pressed': String(isRival || isBron),
          title: player.name
        }, keys);
        el('small', { text: idx + 1 }, btn);
        el('span', { text: shortName(player.name) }, btn);
        el('strong', { text: fmt(point.pts) }, btn);
        keyButtons.push([player, btn]);
        btn.addEventListener('pointerenter', () => inspectPlayer(player, true));
        btn.addEventListener('pointerleave', () => inspectPlayer(cohort.find(p => p.name === rival) || bronRow.player, false));
        btn.addEventListener('click', () => { if (!isBron) rival = player.name; render(); });
      });

      c.root.setAttribute('tabindex', '0');
      c.root.setAttribute('role', 'slider');
      c.root.setAttribute('aria-label', 'Inspect scoring season');
      c.root.setAttribute('aria-valuemin', '2004');
      c.root.setAttribute('aria-valuemax', '2026');
      c.root.setAttribute('aria-valuenow', String(year));
      c.root.addEventListener('click', e => {
        if (e.target.closest('.lbj-path-player')) return;
        const rect = c.root.getBoundingClientRect(), px = (e.clientX - rect.left) * c.w / rect.width;
        if (px < c.pad.left || px > c.w - c.pad.right) return;
        sharedSeason.select(2003 + Math.max(1, Math.round((px - c.pad.left) / (c.w - c.pad.left - c.pad.right) * 23)), fig.id);
      });
      c.root.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        sharedSeason.select(e.key === 'Home' ? 2004 : e.key === 'End' ? 2026 : year + (e.key === 'ArrowRight' ? 1 : -1), fig.id);
        holder.querySelector('svg')?.focus({ preventScroll: true });
      });

      inspectPlayer(cohort.find(p => p.name === rival) || bronRow.player);
    }

    function renderBest() {
      keys.hidden = true;
      windowWrap.hidden = false;
      slider.value = n;
      windowOut.textContent = n + (n === 1 ? ' season' : ' seasons');
      holder.replaceChildren();

      const rows = cohort.map(player => {
        const top = [...player.seasons].sort((a, b) => b.pts - a.pts).slice(0, n);
        const chronological = [...top].sort((a, b) => a.year - b.year);
        return { player, seasons: chronological, value: total(top, 'pts'), g: total(top, 'g') };
      }).sort((a, b) => b.value - a.value);

      const maxVal = rows[0].value;
      const bronRow = rows.find(r => r.player.name === BRON);
      const rivalRow = rows.find(r => r.player.name === rival) || rows.find(r => r.player.name !== BRON);
      const diff = bronRow.value - rivalRow.value;
      summary.innerHTML = `<span class="accent">LeBron ${fmt(bronRow.value)}</span> · ${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs <span class="rival">${shortName(rivalRow.player.name)} ${fmt(rivalRow.value)}</span>`;

      const head = el('div', { class: 'lbj-bars-head' }, holder);
      el('span', { text: 'Player' }, head);
      el('span', { text: `Each block = 1 season (chronological)` }, head);
      el('span', { text: 'PTS' }, head);
      el('span', { text: 'PPG' }, head);
      const list = el('div', { class: 'lbj-bars' }, holder);
      rows.forEach(row => {
        const isBron = row.player.name === BRON, isRival = row.player.name === rival && !isBron;
        const btn = el('button', {
          type: 'button',
          class: 'lbj-bar' + (isBron ? ' lebron' : isRival ? ' rival' : ''),
          'aria-pressed': String(isRival || isBron)
        }, list);
        el('span', { text: row.player.name }, btn);
        const track = el('span', { class: 'lbj-bar-track', 'aria-hidden': 'true' }, btn);
        row.seasons.forEach(s => {
          el('span', { class: 'lbj-bar-seg', style: `width:${(s.pts / maxVal * 100).toFixed(2)}%` }, track);
        });
        el('span', { class: 'lbj-bar-value', text: fmt(row.value) }, btn);
        el('span', { class: 'lbj-bar-rate', text: dec(row.value / row.g) }, btn);
        btn.addEventListener('click', () => {
          if (!isBron) rival = row.player.name;
          renderBest();
        });
      });

      const inspected = rows.find(r => r.player.name === rival) || bronRow;
      describe(
        detail,
        inspected.player.name,
        `${fmt(inspected.value)} PTS · ${dec(inspected.value / inspected.g)} PPG across ${inspected.seasons.length} peak ${inspected.seasons.length === 1 ? 'season' : 'seasons'} (${inspected.seasons.map(s => season(s.year)).join(', ')}).`
      );
    }

    function render() {
      fig.dataset.year = year;
      modeTabs.set(mode);
      if (mode === 'best') renderBest();
      else renderCareer();
    }

    sharedSeason.subscribe(fig.id, value => { year = value; if (mode === 'career') render(); });
    controllers[fig.id] = opts => {
      if (opts.player && cohort.some(p => p.name === opts.player) && opts.player !== BRON) rival = opts.player;
      if (opts.window) { n = +opts.window; mode = 'best'; render(); return; }
      mode = 'career';
      if (opts.year && sharedSeason.select(opts.year, fig.id)) return;
      render();
    };
    controllers['lbj-peak-best'] = controllers[fig.id];
    responsive(holder, render);
    render();
  }

  /* ------------------------------------ Figure 2: Shot Diet & Hardwood Map */
  function courtLines(root) {
    // 500x470 NBA half-court: 1 unit = 0.1 ft, hoop at (250, 422.5), baseline y = 470, FT line y = 280.
    svg('rect', { x: 170, y: 280, width: 160, height: 190, class: 'lbj-court-key-fill', 'aria-hidden': 'true' }, root);
    const g = svg('g', { class: 'lbj-court-lines', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.25 }, root);
    // Outer lane (16 ft), inner lane (12 ft), 3pt line (22 ft corners + 23.75 ft arc), 28-ft hashes, backboard
    svg('path', {
      d: 'M170 470V280H330V470 M190 470V280 M310 470V280 M30 470V333A237.5 237.5 0 0 1 470 333V470 M0 190H12 M488 190H500 M165 400H170 M165 390H170 M165 360H170 M165 330H170 M330 400H335 M330 390H335 M330 360H335 M330 330H335'
    }, g);
    // Solid upper FT circle + dashed lower FT circle
    svg('path', { d: 'M190 280A60 60 0 0 1 310 280' }, g);
    svg('path', { d: 'M190 280A60 60 0 0 0 310 280', 'stroke-dasharray': '5 5' }, g);
    // 4-ft restricted area arc
    svg('path', { d: 'M210 430V422.5A40 40 0 0 1 290 422.5V430' }, g);
    // Half-court center circles at y = 0
    svg('path', { d: 'M190 0A60 60 0 0 0 310 0 M230 0A20 20 0 0 0 270 0' }, g);
    // Backboard & rim
    svg('path', { d: 'M220 430H280', 'stroke-width': 1.8 }, g);
    svg('circle', { cx: 250, cy: 422.5, r: 7.5, class: 'lbj-court-rim', 'stroke-width': 1.8, fill: 'none' }, root);
  }

  function shootingEvolution(parent, data, source) {
    const seasons = data.seasons.filter(s => s.phase === 'rs');
    let year = sharedSeason.year;
    const labels = ['At the rim', 'Other paint', 'Mid-range', '3pt + heaves'];
    const keys = ['rim', 'paint', 'mid', 'three'];

    const topBar = el('div', { class: 'lbj-legend', 'aria-label': 'Shot location shares' }, parent);
    const holder = el('div', {}, parent);

    function render() {
      const chosen = seasons.find(s => s.year === year), profile = shotMix(chosen);
      parent.dataset.year = year;
      topBar.replaceChildren();
      labels.forEach((name, i) => {
        const item = el('span', {}, topBar);
        el('i', { class: 'lbj-mix-' + keys[i] }, item);
        item.append(document.createTextNode(name + ' '));
        el('strong', { text: pct(profile.shares[i]) }, item);
      });
      const num = el('span', { class: 'fig-num' }, topBar);
      num.innerHTML = `<b>${season(year)}</b> · ${fmt(profile.located)} FGA`;

      holder.replaceChildren();
      const w = Math.max(280, Math.round(holder.getBoundingClientRect().width));
      const left = 38, right = w - 10, mixTop = 20, mixBottom = 148, effTop = 212, effBottom = 298;
      const x = v => left + (v - 2003.5) / 23 * (right - left);
      const mixY = sh => mixBottom - sh * (mixBottom - mixTop);
      const effY = v => effBottom - (v + 5) / 20 * (effBottom - effTop);

      const root = svg('svg', {
        viewBox: `0 0 ${w} 332`,
        class: 'lbj-chart lbj-shot-history',
        tabindex: 0, role: 'slider',
        'aria-label': 'Explore shooting evolution season',
        'aria-valuemin': 2004, 'aria-valuemax': 2026, 'aria-valuenow': year,
        'aria-valuetext': `${season(year)}: ${labels.map((n, i) => n + ' ' + pct(profile.shares[i])).join(', ')}. True shooting ${(profile.relativeTS >= 0 ? '+' : '') + dec(profile.relativeTS)} pp vs NBA.`
      }, holder);

      const defs = svg('defs', {}, root);
      const posClip = svg('clipPath', { id: 'lbj-ts-above' }, defs);
      svg('rect', { x: left, y: effTop - 6, width: right - left, height: effY(0) - (effTop - 6) }, posClip);
      const negClip = svg('clipPath', { id: 'lbj-ts-below' }, defs);
      svg('rect', { x: left, y: effY(0), width: right - left, height: effBottom - effY(0) + 6 }, negClip);

      svg('text', { x: left, y: 12, text: 'Share of located attempts', class: 'lbj-axis-title' }, root);
      [0, 0.5, 1].forEach(tick => {
        svg('line', { x1: left, x2: right, y1: mixY(tick), y2: mixY(tick), class: 'lbj-grid' }, root);
        svg('text', { x: left - 7, y: mixY(tick) + 3.5, 'text-anchor': 'end', text: tick * 100 + '%' }, root);
      });

      const barW = (right - left) / 23 * 0.78;
      seasons.forEach(s => {
        let cum = 0;
        const prof = shotMix(s), isSel = s.year === year;
        const g = svg('g', { 'data-year': s.year, 'aria-hidden': 'true' }, root);
        prof.shares.forEach((sh, i) => {
          const h = sh * (mixBottom - mixTop);
          if (h > 0.4) {
            svg('rect', {
              x: x(s.year) - barW / 2, y: mixY(cum + sh),
              width: barW, height: Math.max(0.5, h - 0.8),
              class: 'lbj-mix-' + keys[i],
              opacity: isSel ? 1 : 0.72
            }, g);
          }
          cum += sh;
        });
        if (isSel) {
          svg('rect', {
            x: x(s.year) - barW / 2 - 1.5, y: mixTop - 1.5,
            width: barW + 3, height: mixBottom - mixTop + 3,
            fill: 'none', stroke: 'var(--fg)', 'stroke-width': 1.1, rx: 1.5
          }, g);
        }
      });

      ERAS.forEach(era => {
        const sX = x(era.start) - barW / 2, eX = x(era.end) + barW / 2;
        svg('line', { x1: sX + 1, x2: eX - 1, y1: 160, y2: 160, stroke: era.start <= year && year <= era.end ? 'var(--fg-2)' : 'var(--line-2)', 'stroke-width': 1 }, root);
        svg('text', {
          x: (sX + eX) / 2, y: 174, 'text-anchor': 'middle',
          text: w < 520 ? era.code : era.team,
          fill: era.start <= year && year <= era.end ? 'var(--fg)' : 'var(--fg-3)'
        }, root);
      });

      svg('text', { x: left, y: 198, text: 'True shooting vs NBA (percentage points)', class: 'lbj-axis-title' }, root);
      [-5, 0, 5, 10, 15].forEach(tick => {
        svg('line', { x1: left, x2: right, y1: effY(tick), y2: effY(tick), class: tick === 0 ? 'lbj-benchmark' : 'lbj-grid' }, root);
        svg('text', { x: left - 7, y: effY(tick) + 3.5, 'text-anchor': 'end', text: (tick > 0 ? '+' : '') + tick }, root);
      });

      const pts = seasons.map((s, i) => (i ? 'L' : 'M') + x(s.year).toFixed(1) + ',' + effY(shotMix(s).relativeTS).toFixed(1)).join(' ');
      const area = `${pts}L${x(2026).toFixed(1)},${effY(0).toFixed(1)}L${x(2004).toFixed(1)},${effY(0).toFixed(1)}Z`;
      svg('path', { d: area, fill: 'var(--lbj-wash)', 'clip-path': 'url(#lbj-ts-above)', 'aria-hidden': 'true' }, root);
      svg('path', { d: area, fill: 'color-mix(in srgb, var(--lbj-hot) 14%, transparent)', 'clip-path': 'url(#lbj-ts-below)', 'aria-hidden': 'true' }, root);
      svg('path', { d: pts, class: 'lbj-line' }, root);

      svg('line', { x1: x(year), x2: x(year), y1: effTop, y2: effBottom, class: 'lbj-crosshair' }, root);
      svg('circle', { cx: x(year), cy: effY(profile.relativeTS), r: 4, fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 1.4 }, root);
      const anchor = year <= 2005 ? 'start' : year >= 2024 ? 'end' : 'middle';
      const labelDx = year <= 2005 ? 6 : year >= 2024 ? -2 : 0;
      svg('text', {
        x: x(year) + labelDx,
        y: effY(profile.relativeTS) - 9,
        'text-anchor': anchor,
        text: (profile.relativeTS >= 0 ? '+' : '−') + Math.abs(profile.relativeTS).toFixed(1) + ' pp',
        class: 'lbj-bron-label'
      }, root);

      (w < 500 ? [2004, 2011, 2018, 2026] : [2004, 2010, 2014, 2018, 2026]).forEach(t => {
        svg('text', { x: x(t), y: 318, 'text-anchor': t === 2004 ? 'start' : t === 2026 ? 'end' : 'middle', text: w < 430 ? "'" + String(t).slice(2) : season(t) }, root);
      });

      function scrub(e) {
        const box = root.getBoundingClientRect(), px = (e.clientX - box.left) * w / box.width;
        if (px < left || px > right) return;
        sharedSeason.select(Math.round(2003.5 + (px - left) / (right - left) * 23), source);
      }
      root.addEventListener('click', scrub);
      root.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') scrub(e); });
      root.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        sharedSeason.select(e.key === 'Home' ? 2004 : e.key === 'End' ? 2026 : year + (e.key === 'ArrowRight' ? 1 : -1), source);
        holder.querySelector('svg')?.focus({ preventScroll: true });
      });
    }

    sharedSeason.subscribe('shot-evolution', val => { year = val; render(); });
    responsive(holder, render);
    render();
  }

  function shooting(fig, data) {
    const outer = mount(fig);
    const evolution = el('div', { class: 'lbj-shooting-evolution' }, outer);
    shootingEvolution(evolution, data, fig.id);

    const section = el('section', { class: 'lbj-court-evolution', id: 'lbj-court-time', 'aria-label': 'Half-court shot map' }, outer);
    let year = sharedSeason.year, phase = 'rs', zone = -1, view = 'profile';
    let rows = [], bins = [], selected = -1, hovered = -1, serial = 0, pending = true, warmed = false, loadError = false;

    const bar = el('div', { class: 'fig-controls' }, section);
    const viewTabs = tabs(bar, 'Court display mode', [
      ['profile', 'Shot profile'],
      ['frequency', 'Share'],
      ['shots', 'Every shot']
    ], view, v => { view = v; selected = -1; hovered = -1; draw(); });

    const phasePills = pills(bar, 'Season phase', [
      ['rs', 'Regular'],
      ['po', 'Playoffs']
    ], phase, v => { phase = v; zone = -1; load(); });

    const statSummary = el('span', { class: 'fig-num' }, bar);

    const layout = el('div', { class: 'lbj-court-layout' }, section);
    const leftCol = el('div', {}, layout);
    const court = el('div', { class: 'lbj-court-wrap' }, leftCol);
    const lines = svg('svg', { viewBox: '0 0 500 470', 'aria-hidden': 'true' }, court);
    courtLines(lines);
    const canvas = el('canvas', { tabindex: '0', role: 'img', 'aria-label': 'LeBron half-court shot map' }, court);
    const ctx = canvas.getContext('2d');
    const tip = el('div', { class: 'lbj-court-tip', hidden: '' }, court);
    const courtMessage = el('p', { class: 'lbj-court-message', role: 'status', hidden: '' }, court);
    const scaleRow = el('div', { class: 'lbj-court-scale' }, leftCol);

    const rightCol = el('div', { class: 'lbj-zones' }, layout);
    const milestones = pills(rightCol, 'Milestone seasons', [
      [2004, 'Rookie ’04'],
      [2013, 'Miami ’13'],
      [2020, 'Lakers ’20'],
      [2026, 'Age 41']
    ], year, v => { phase = 'rs'; zone = -1; if (!sharedSeason.select(v, fig.id)) load(); });
    milestones.node.classList.add('lbj-milestones');

    const zoneHead = el('div', { class: 'lbj-zones-head' }, rightCol);
    zoneHead.innerHTML = '<span>Zone FG% · click to isolate</span><span><i></i>NBA avg</span>';
    const zoneBars = el('div', {}, rightCol);
    const detail = readout(rightCol);

    function hexPath(cx, cy, r) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    function updateScaleLegend() {
      scaleRow.replaceChildren();
      if (view === 'profile') {
        el('span', { text: 'Hex size: attempts' }, scaleRow);
        const ramp = el('span', { class: 'lbj-scale-ramp' }, scaleRow);
        ramp.append(document.createTextNode('−8%'));
        el('i', { class: 'lbj-scale-bar' }, ramp);
        ramp.append(document.createTextNode('+8% vs NBA'));
      } else if (view === 'frequency') {
        el('span', { text: '% of season shots' }, scaleRow);
        const cells = el('span', { class: 'lbj-share-cells' }, scaleRow);
        ['<0.1', '0.3', '1', '3', '≥10%'].forEach((lbl, idx) => {
          const sp = el('span', { style: 'display:inline-flex;align-items:center;gap:3px' }, cells);
          el('i', { class: 'lbj-share-cell', style: `opacity:${[0.18, 0.34, 0.55, 0.78, 1][idx]}` }, sp);
          sp.append(document.createTextNode(lbl));
        });
      } else {
        scaleRow.innerHTML = '<span><b style="color:var(--accent)">●</b> Made field goal</span><span><b>×</b> Missed attempt</span>';
      }
    }

    function positionTip(cx, cy, text) {
      if (!text) { tip.hidden = true; return; }
      tip.textContent = text;
      tip.hidden = false;
      const pctX = Math.max(18, Math.min(82, cx / 500 * 100));
      const pctY = Math.max(8, Math.min(92, cy / 470 * 100));
      tip.style.left = pctX + '%';
      tip.style.top = pctY + '%';
      tip.style.transform = cy < 65 ? 'translate(-50%, 35%)' : 'translate(-50%, -130%)';
    }

    function draw() {
      viewTabs.set(view);
      phasePills.set(phase);
      milestones.set(phase === 'rs' ? year : -1);
      updateScaleLegend();
      zoneBars.querySelectorAll('button').forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === zone)));

      const rect = court.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      if (!rect.width) return;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(canvas.width / 500, 0, 0, canvas.height / 470, 0, 0);

      const s = data.seasons.find(r => r.year === year && r.phase === phase);
      if (pending) {
        tip.hidden = true;
        courtMessage.hidden = false;
        courtMessage.replaceChildren();
        courtMessage.textContent = loadError ? 'Shot locations failed to load. ' : 'Loading ' + season(year) + '…';
        if (loadError) {
          const retry = el('button', { class: 'btn', type: 'button', text: 'Retry' }, courtMessage);
          retry.addEventListener('click', load);
        }
        return;
      }
      if (!rows.length) {
        tip.hidden = true;
        courtMessage.hidden = false;
        courtMessage.textContent = 'No playoff appearances in ' + season(year) + '.';
        describe(detail, season(year) + ' playoffs.', 'LeBron did not appear in this postseason.');
        return;
      }
      courtMessage.hidden = true;

      const dark = document.documentElement.dataset.theme === 'dark';
      const style = getComputedStyle(fig);
      const blue = style.getPropertyValue('--accent').trim();
      const gray = style.getPropertyValue('--fg-3').trim();
      const fg = style.getPropertyValue('--fg').trim();

      if (view !== 'shots') {
        const filtered = rows.filter(r => zone < 0 || r[9] === zone);
        bins = hexbinShots(filtered, view === 'frequency' ? 20 : 13);
        if (!bins.length) {
          tip.hidden = true;
          courtMessage.hidden = false;
          courtMessage.textContent = 'No attempts in this zone.';
          return;
        }
        const activeIdx = hovered >= 0 && hovered < bins.length ? hovered
          : selected >= 0 && selected < bins.length ? selected
          : bins.reduce((best, b, i) => (b.n > bins[best].n ? i : best), 0);

        const hexR = n => view === 'frequency' ? 18.6 : Math.min(12.6, 1.5 + 0.9 * densityRadius(n));
        bins.forEach(bin => {
          const r = hexR(bin.n);
          if (view === 'profile') {
            const eff = hexEfficiency(bin, filtered, s.leagueZones);
            ctx.fillStyle = effColor(eff.shrunk, dark);
            ctx.globalAlpha = 0.9;
            hexPath(bin.x, bin.y, r);
            ctx.fill();
            if (r > 4.2) {
              ctx.globalAlpha = dark ? 0.34 : 0.28;
              ctx.strokeStyle = dark ? '#000' : '#fff';
              ctx.lineWidth = 0.75;
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = blue;
            ctx.globalAlpha = [0.15, 0.28, 0.44, 0.64, 0.82, 0.98][shotShareLevel(bin.n, rows.length)];
            hexPath(bin.x, bin.y, r);
            ctx.fill();
          }
        });

        const activeBin = bins[activeIdx];
        if (activeBin && activeBin.y >= 0 && activeBin.y <= 470) {
          const r = hexR(activeBin.n) + 1.2;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = style.getPropertyValue('--lbj-court-bg').trim() || (dark ? '#181613' : '#f7f2e8');
          ctx.lineWidth = 3.2;
          hexPath(activeBin.x, activeBin.y, r);
          ctx.stroke();
          ctx.strokeStyle = fg;
          ctx.lineWidth = 1.5;
          hexPath(activeBin.x, activeBin.y, r);
          ctx.stroke();
        }
        const eff = hexEfficiency(activeBin, filtered, s.leagueZones);
        describe(
          detail,
          `${fmt(activeBin.made)} / ${fmt(activeBin.n)} (${pct(eff.fg)} FG)`,
          `${signedPct(eff.delta)} vs NBA zone avg · ${pct(activeBin.n / rows.length)} of season shots.`
        );
        if (hovered >= 0 && activeBin.y >= 0 && activeBin.y <= 470) {
          positionTip(activeBin.x, activeBin.y, `${activeBin.made}/${activeBin.n} · ${pct(eff.fg)} (${signedPct(eff.delta)})`);
        } else {
          tip.hidden = true;
        }
      } else {
        rows.forEach(sh => {
          if (sh[1] > 422.5 || sh[1] < -47.5 || Math.abs(sh[0]) > 250) return;
          const inZone = zone < 0 || sh[9] === zone;
          ctx.globalAlpha = inZone ? 0.72 : 0.08;
          const px = sh[0] + 250, py = 422.5 - sh[1];
          if (sh[2]) {
            ctx.fillStyle = blue;
            ctx.beginPath();
            ctx.arc(px, py, 2.1, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = gray;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px - 1.7, py - 1.7); ctx.lineTo(px + 1.7, py + 1.7);
            ctx.moveTo(px + 1.7, py - 1.7); ctx.lineTo(px - 1.7, py + 1.7);
            ctx.stroke();
          }
        });
        const activeIdx = hovered >= 0 && hovered < rows.length ? hovered : Math.max(0, selected);
        const sh = rows[activeIdx];
        if (sh) {
          const px = sh[0] + 250, py = 422.5 - sh[1];
          if (py >= 0 && py <= 470 && px >= 0 && px <= 500) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = fg;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 5.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          const g = data.games.find(gm => gm.game === sh[5]);
          describe(
            detail,
            sh[4] + (g ? (g.home ? ' vs ' : ' @') + g.opp : ''),
            `${sh[2] ? 'Made' : 'Missed'} ${sh[3] ? '3PT' : '2PT'} · ${data.zones[sh[9]]} · Q${sh[7]} ${Math.floor(sh[8] / 60)}:${String(sh[8] % 60).padStart(2, '0')}.`
          );
          if (hovered >= 0 && py >= 0 && py <= 470) {
            positionTip(px, py, `${sh[2] ? 'Made' : 'Missed'} ${sh[3] ? '3PT' : '2PT'} · ${sh[4]}`);
          } else {
            tip.hidden = true;
          }
        }
      }
    }

    async function load() {
      const token = ++serial;
      pending = true;
      loadError = false;
      rows = [];
      bins = [];
      hovered = -1;
      fig.dataset.year = year;
      section.dataset.year = year;

      const s = data.seasons.find(r => r.year === year && r.phase === phase);
      const totalShots = s.zones.reduce((sum, z) => sum + z[0], 0);
      statSummary.innerHTML = s.g
        ? `<b>${season(year)}</b> · ${fmt(s.g)} GP · ${fmt(totalShots)} FGA · <span class="accent">${pct(s.ts)} TS</span> (${pct(s.leagueTS)} NBA)`
        : `<b>${season(year)}</b> · 0 GP`;

      zoneBars.replaceChildren();
      data.zones.forEach((zName, i) => {
        const [att, makes] = s.zones[i];
        if (!att) return;
        const rate = makes / att;
        const [lAtt, lMakes] = s.leagueZones[i];
        const lRate = lAtt ? lMakes / lAtt : null;
        const diff = lRate != null ? rate - lRate : null;

        const row = el('button', {
          type: 'button', class: 'lbj-zone', 'aria-pressed': String(zone === i),
          'aria-label': `${zName}: ${makes} of ${att}, ${pct(rate)}`
        }, zoneBars);
        const head = el('span', { class: 'lbj-zone-head' }, row);
        el('span', { class: 'lbj-zone-name', text: zName }, head);
        el('span', { class: 'lbj-zone-vol', text: `${fmt(makes)}/${fmt(att)}` }, head);
        el('span', { class: 'lbj-zone-fg', text: pct(rate) }, head);
        el('span', {
          class: 'lbj-zone-diff' + (diff != null && diff > 0.015 ? ' pos' : diff != null && diff < -0.015 ? ' neg' : ''),
          text: diff != null ? signedPct(diff) : '—'
        }, head);
        const track = el('span', { class: 'lbj-zone-track', 'aria-hidden': 'true' }, row);
        el('span', {
          class: 'lbj-zone-fill' + (diff != null && diff > 0.015 ? ' pos' : diff != null && diff < -0.015 ? ' neg' : ''),
          style: `width:${Math.min(100, rate / 0.85 * 100).toFixed(1)}%`
        }, track);
        if (lRate != null) el('i', { style: `left:${Math.min(100, lRate / 0.85 * 100).toFixed(1)}%` }, track);
        row.addEventListener('click', () => { zone = zone === i ? -1 : i; selected = -1; hovered = -1; draw(); });
      });

      draw();
      try {
        const result = await get(new URL(`shots-${year}-${phase}.json`, fig.dataset.src).href);
        if (token !== serial) return;
        pending = false;
        rows = result;
        selected = -1;
        canvas.dataset.year = year;
        canvas.dataset.phase = phase;
        draw();

        const nearby = [year - 1, year + 1];
        if (phase === 'rs' && !warmed) { nearby.push(2004, 2013, 2020, 2026); warmed = true; }
        nearby.filter(v => v >= 2004 && v <= 2026 && v !== year).forEach(v => {
          get(new URL(`shots-${v}-${phase}.json`, fig.dataset.src).href).catch(() => {});
        });
      } catch (e) {
        if (token !== serial) return;
        loadError = true;
        draw();
      }
    }

    function locatePointer(e, commit = false) {
      if (pending || !rows.length) return;
      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * 500;
      const py = (e.clientY - r.top) / r.height * 470;
      let best = Infinity, idx = -1;
      if (view !== 'shots') {
        bins.forEach((b, i) => {
          const d = Math.hypot(b.x - px, b.y - py);
          if (d < best && d < 28) { best = d; idx = i; }
        });
      } else {
        rows.forEach((sh, i) => {
          if (zone >= 0 && sh[9] !== zone) return;
          const d = Math.hypot(sh[0] + 250 - px, 422.5 - sh[1] - py);
          if (d < best && d < 18) { best = d; idx = i; }
        });
      }
      if (commit && idx >= 0) selected = idx;
      if (hovered !== idx || commit) { hovered = idx; draw(); }
    }

    canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') locatePointer(e, false); });
    canvas.addEventListener('pointerleave', () => { if (hovered !== -1) { hovered = -1; draw(); } });
    canvas.addEventListener('click', e => locatePointer(e, true));
    canvas.addEventListener('keydown', e => {
      const len = view === 'shots' ? rows.length : bins.length;
      if (!len || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const cur = selected < 0 ? 0 : selected;
      selected = e.key === 'Home' ? 0 : e.key === 'End' ? len - 1 : Math.max(0, Math.min(len - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      hovered = -1;
      draw();
    });

    sharedSeason.subscribe(fig.id, val => { year = val; load(); });
    controllers[fig.id] = o => {
      phase = o.phase || 'rs';
      zone = o.zone === undefined ? -1 : +o.zone;
      if (!o.year || !sharedSeason.select(o.year, fig.id)) load();
    };
    controllers['lbj-court-time'] = controllers[fig.id];
    responsive(court, draw);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    load();
  }

  /* ------------------------------ Figure 3: Age Trends & Role Chapters */
  function career(fig, data) {
    const b = mount(fig), seasons = data.seasons.filter(s => s.phase === 'rs');
    let year = sharedSeason.year, view = 'trends', range = 'all', other = 'Kareem Abdul-Jabbar';

    const PEERS = ['Kareem Abdul-Jabbar', 'Michael Jordan', 'Kobe Bryant', 'Tim Duncan', 'Karl Malone'];
    const bar = el('div', { class: 'fig-controls' }, b);
    const modeTabs = tabs(bar, 'Career evolution view', [
      ['trends', 'Season trends'],
      ['role', 'Scoring + creation']
    ], view, v => { view = v; render(); });

    const trendControls = el('div', { style: 'display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-left:auto' }, bar);
    const peerPills = pills(trendControls, 'Peer at same age', PEERS.map(n => [n, shortName(n)]), other, v => { other = v; render(); });
    const lateBtn = el('div', { class: 'lbj-pills' }, trendControls);
    const lateToggle = el('button', { type: 'button', text: 'Age 35+', 'aria-pressed': 'false' }, lateBtn);
    lateToggle.addEventListener('click', () => {
      range = range === 'late' ? 'all' : 'late';
      if (range === 'late' && year < 2020) sharedSeason.select(2020, fig.id);
      else render();
    });

    const legend = el('div', { class: 'lbj-legend' }, b);
    const holder = el('div', {}, b);
    const detail = readout(b);

    const metrics = [
      { key: 'pts', label: 'Points / game', max: 40, ticks: [0, 20, 40], benchmark: 20, format: dec },
      { key: 'ast', label: 'Assists / game', max: 15, ticks: [0, 7.5, 15], format: dec },
      { key: 'trb', label: 'Rebounds / game', max: 20, ticks: [0, 10, 20], format: dec },
      { key: 'g', label: 'Games played', max: 82, ticks: [0, 41, 82], format: fmt }
    ];
    const metricVal = (s, m) => (m.key === 'g' ? s.g : s[m.key] / s.g);

    function bindKeys(root) {
      root.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const minY = view === 'trends' && range === 'late' ? 2020 : 2004;
        sharedSeason.select(
          e.key === 'Home' ? minY : e.key === 'End' ? 2026 : Math.max(minY, year + (e.key === 'ArrowRight' ? 1 : -1)),
          fig.id
        );
        holder.querySelector('svg')?.focus({ preventScroll: true });
      });
    }

    function renderTrends(chosen, peer, sameAge) {
      legend.replaceChildren();
      const l1 = el('span', {}, legend);
      el('i', { class: 'line', style: 'color:var(--accent)' }, l1);
      l1.append(document.createTextNode(BRON + ' (Age ' + chosen.age + ')'));
      const l2 = el('span', {}, legend);
      el('i', { class: 'dashed', style: 'color:var(--lbj-rival)' }, l2);
      l2.append(document.createTextNode(other + (sameAge ? ' (Age ' + chosen.age + ')' : ' (retired before ' + chosen.age + ')')));

      const w = Math.max(280, Math.round(holder.getBoundingClientRect().width));
      const cols = w >= 580 ? 2 : 1, gap = 28, panelW = (w - gap * (cols - 1)) / cols, rowH = 176;
      const first = range === 'late' ? 2020 : 2004, last = 2026;
      const root = svg('svg', {
        viewBox: `0 0 ${w} ${Math.ceil(metrics.length / cols) * rowH}`,
        class: 'lbj-chart lbj-career-chart',
        tabindex: 0, role: 'slider',
        'aria-label': 'Explore career season by age',
        'aria-valuemin': first, 'aria-valuemax': 2026, 'aria-valuenow': year
      }, holder);

      const defs = svg('defs', {}, root);
      const grad = svg('linearGradient', { id: 'lbj-trend-grad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      svg('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.12' }, grad);
      svg('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.0' }, grad);

      metrics.forEach((m, idx) => {
        const left = (idx % cols) * (panelW + gap), top = Math.floor(idx / cols) * rowH;
        const pLeft = left + 28, pRight = left + panelW - 6, pTop = top + 34, pBottom = top + 146;
        const x = yr => pLeft + (yr - first) / (last - first) * (pRight - pLeft);
        const y = v => pBottom - v / m.max * (pBottom - pTop);

        svg('text', { x: left, y: top + 16, text: m.label, class: 'lbj-metric-label' }, root);
        const bronV = m.format(metricVal(chosen, m));
        const peerV = sameAge ? m.format(metricVal(sameAge, m)) : '—';
        const valText = svg('text', { x: pRight, y: top + 16, 'text-anchor': 'end', class: 'lbj-metric-value' }, root);
        svg('tspan', { text: bronV }, valText);
        svg('tspan', { text: ' / ' + peerV, class: 'lbj-comparison-value' }, valText);

        m.ticks.forEach(t => {
          const isBench = m.benchmark !== undefined && t === m.benchmark;
          svg('line', { x1: pLeft, x2: pRight, y1: y(t), y2: y(t), class: isBench ? 'lbj-benchmark' : 'lbj-grid' }, root);
          svg('text', { x: pLeft - 6, y: y(t) + 3.5, 'text-anchor': 'end', text: t, class: 'lbj-range-label' }, root);
        });

        if (range === 'all') {
          svg('line', { x1: x(2020), x2: x(2020), y1: pTop, y2: pBottom, stroke: 'var(--line)', 'stroke-dasharray': '2 2' }, root);
        }
        svg('line', { x1: x(year), x2: x(year), y1: pTop, y2: pBottom, class: 'lbj-crosshair' }, root);

        const bronVis = seasons.filter(s => s.age + 1985 >= first && s.age <= 41);
        if (bronVis.length > 1) {
          const dLine = bronVis.map((s, i) => (i ? 'L' : 'M') + x(s.age + 1985).toFixed(1) + ',' + y(metricVal(s, m)).toFixed(1)).join(' ');
          svg('path', {
            d: `${dLine}L${x(bronVis.at(-1).age + 1985).toFixed(1)},${pBottom}L${x(bronVis[0].age + 1985).toFixed(1)},${pBottom}Z`,
            fill: 'url(#lbj-trend-grad)', 'aria-hidden': 'true'
          }, root);
        }

        [[peer.seasons, false], [seasons, true]].forEach(([list, isBron]) => {
          let prev = null;
          const vis = list.filter(s => s.age != null && s.age + 1985 >= first && s.age <= 41);
          if (!vis.length) return;
          const d = vis.map(s => {
            const cmd = prev && s.age === prev.age + 1 ? 'L' : 'M';
            prev = s;
            return cmd + x(s.age + 1985).toFixed(1) + ',' + y(metricVal(s, m)).toFixed(1);
          }).join(' ');
          svg('path', { d, class: isBron ? 'lbj-line' : 'lbj-peer-line' }, root);
          vis.filter(s => s.age === chosen.age || s.g < 40).forEach(s => {
            const col = isBron ? 'var(--accent)' : 'var(--lbj-rival)';
            svg('circle', {
              cx: x(s.age + 1985), cy: y(metricVal(s, m)),
              r: s.age === chosen.age ? 4 : 2.2,
              fill: s.g < 40 ? 'var(--bg)' : col,
              stroke: col, 'stroke-width': 1.3
            }, root);
          });
        });

        if (idx >= metrics.length - cols) {
          const xTicks = range === 'late' ? [2020, 2023, 2026] : [2004, 2010, 2015, 2020, 2026];
          xTicks.forEach(yr => {
            const anchor = yr === first ? 'start' : yr === last ? 'end' : 'middle';
            const lbl = yr === first || yr === last ? 'Age ' + (yr - 1985) : String(yr - 1985);
            svg('text', { x: x(yr), y: top + 165, 'text-anchor': anchor, text: lbl, class: 'lbj-panel-year' }, root);
          });
        }
      });

      function inspect(e) {
        const box = root.getBoundingClientRect();
        const px = (e.clientX - box.left) * w / box.width, py = (e.clientY - box.top) * w / box.width;
        const col = Math.floor(px / (panelW + gap)), local = px - col * (panelW + gap);
        if (col >= cols || local < 28 || local > panelW - 6 || (py % rowH) < 30 || (py % rowH) > 152) return;
        sharedSeason.select(Math.round(first + (local - 28) / (panelW - 34) * (last - first)), fig.id);
      }
      root.addEventListener('click', inspect);
      root.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') inspect(e); });
      bindKeys(root);

      const peerSummary = sameAge
        ? `vs ${shortName(other)} (${dec(sameAge.pts / sameAge.g)} PPG · ${dec(sameAge.ast / sameAge.g)} APG · ${sameAge.g} GP).`
        : `(${shortName(other)} had retired before age ${chosen.age}).`;
      describe(
        detail,
        `Age ${chosen.age} (${season(year)} · ${chosen.team})`,
        `${dec(chosen.pts / chosen.g)} PPG · ${dec(chosen.ast / chosen.g)} APG · ${dec(chosen.trb / chosen.g)} RPG · ${chosen.g} GP ${peerSummary}`
      );
    }

    function renderRole(chosen) {
      legend.replaceChildren();
      ERAS.forEach(era => {
        const sp = el('span', {}, legend);
        el('i', { class: 'round', style: `background:${era.color}` }, sp);
        sp.append(document.createTextNode(`${era.team} ${era.label}`));
      });

      const c = chart(holder, {
        height: 345, xmin: 18, xmax: 34, ymin: 4, ymax: 12,
        xticks: [20, 24, 28, 32], yticks: [4, 6, 8, 10, 12],
        ylabel: 'Assists per game', xlabel: 'Points per game',
        label: `Scoring and creation across 23 seasons; ${season(year)} highlighted.`
      });

      const defs = svg('defs', {}, c.root);
      const marker = svg('marker', { id: 'lbj-role-arrow', viewBox: '0 0 8 8', refX: 6, refY: 4, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
      svg('path', { d: 'M0 0L8 4L0 8Z', fill: 'var(--accent)' }, marker);

      // Career average crosshair (26.8 PPG, 7.4 APG)
      const meanPts = total(seasons, 'pts') / total(seasons, 'g');
      const meanAst = total(seasons, 'ast') / total(seasons, 'g');
      svg('line', { x1: c.x(meanPts), x2: c.x(meanPts), y1: c.pad.top, y2: c.y(4), class: 'lbj-benchmark' }, c.root);
      svg('line', { x1: c.pad.left, x2: c.w - c.pad.right, y1: c.y(meanAst), y2: c.y(meanAst), class: 'lbj-benchmark' }, c.root);
      svg('text', { x: c.w - c.pad.right - 4, y: c.y(meanAst) - 5, 'text-anchor': 'end', text: `Career avg (${dec(meanPts)} / ${dec(meanAst)})`, class: 'lbj-range-label' }, c.root);

      // Faint era-colored connectors across all 23 seasons
      seasons.slice(1).forEach((s, i) => {
        const prev = seasons[i], era = eraForYear(s.year);
        svg('line', {
          x1: c.x(prev.pts / prev.g), y1: c.y(prev.ast / prev.g),
          x2: c.x(s.pts / s.g), y2: c.y(s.ast / s.g),
          stroke: era.color, 'stroke-width': 1, opacity: 0.24, 'stroke-dasharray': '3 3'
        }, c.root);
      });

      // Five-season active directional trail
      const trail = seasons.filter(s => s.year <= year).slice(-5);
      trail.slice(1).forEach((s, i) => {
        const prev = trail[i];
        const x1 = c.x(prev.pts / prev.g), y1 = c.y(prev.ast / prev.g);
        const x2 = c.x(s.pts / s.g), y2 = c.y(s.ast / s.g);
        const dist = Math.hypot(x2 - x1, y2 - y1), isLast = i === trail.length - 2;
        const trim = isLast && dist > 16 ? 8 : 0;
        const p = svg('path', {
          d: `M${x1.toFixed(1)},${y1.toFixed(1)}L${(x2 - (dist ? trim * (x2 - x1) / dist : 0)).toFixed(1)},${(y2 - (dist ? trim * (y2 - y1) / dist : 0)).toFixed(1)}`,
          class: 'lbj-line',
          opacity: (0.35 + 0.65 * (i + 1) / Math.max(1, trail.length - 1)).toFixed(2)
        }, c.root);
        if (isLast && dist > 16) p.setAttribute('marker-end', 'url(#lbj-role-arrow)');
      });

      seasons.forEach(s => {
        const era = eraForYear(s.year), isSel = s.year === year, inTrail = trail.includes(s);
        svg('circle', {
          cx: c.x(s.pts / s.g), cy: c.y(s.ast / s.g),
          r: isSel ? 5.5 : inTrail ? 3.8 : 3.2,
          fill: isSel ? 'var(--accent)' : era.color,
          'fill-opacity': isSel ? 1 : inTrail ? 0.9 : 0.62,
          stroke: 'var(--bg)', 'stroke-width': 1.2,
          'data-year': s.year
        }, c.root);
      });

      const placed = [];
      [year, 2004, 2006, 2013, 2020, 2026].filter((v, i, a) => a.indexOf(v) === i).forEach(ly => {
        const s = seasons.find(r => r.year === ly);
        const px = c.x(s.pts / s.g), py = c.y(s.ast / s.g);
        const lbl = svg('text', { text: season(s.year), class: s.year === year ? 'lbj-bron-label' : 'lbj-direct-label' }, c.root);
        const wText = lbl.getComputedTextLength();
        const cands = [
          { x: px + 9, y: py - 9 }, { x: px - wText - 9, y: py - 9 },
          { x: px + 9, y: py + 17 }, { x: px - wText - 9, y: py + 17 }
        ];
        const pos = cands.find(p =>
          p.x >= c.pad.left && p.x + wText <= c.w - c.pad.right &&
          p.y >= c.pad.top + 10 && p.y <= c.y(4) - 4 &&
          !placed.some(b => p.x < b.right + 4 && p.x + wText > b.left - 4 && p.y - 11 < b.bottom + 3 && p.y + 3 > b.top - 3)
        );
        if (!pos) { lbl.remove(); return; }
        lbl.setAttribute('x', pos.x);
        lbl.setAttribute('y', pos.y);
        placed.push({ left: pos.x, right: pos.x + wText, top: pos.y - 11, bottom: pos.y + 3 });
      });

      function inspect(e) {
        const rect = c.root.getBoundingClientRect();
        const px = (e.clientX - rect.left) * c.w / rect.width, py = (e.clientY - rect.top) * c.w / rect.width;
        const nearest = seasons.reduce((best, s) => {
          const d = Math.hypot(c.x(s.pts / s.g) - px, c.y(s.ast / s.g) - py);
          return d < best.d ? { year: s.year, d } : best;
        }, { year, d: Infinity });
        if (nearest.d < 30) sharedSeason.select(nearest.year, fig.id);
      }
      c.root.setAttribute('tabindex', '0');
      c.root.setAttribute('role', 'slider');
      c.root.setAttribute('aria-label', 'Explore scoring and creation season');
      c.root.setAttribute('aria-valuemin', '2004');
      c.root.setAttribute('aria-valuemax', '2026');
      c.root.setAttribute('aria-valuenow', String(year));
      c.root.addEventListener('click', inspect);
      c.root.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') inspect(e); });
      bindKeys(c.root);

      const era = eraForYear(chosen.year);
      describe(
        detail,
        `${season(year)} · ${era.team} (Age ${chosen.age})`,
        `${dec(chosen.pts / chosen.g)} PPG · ${dec(chosen.ast / chosen.g)} APG · ${dec(chosen.trb / chosen.g)} RPG · ${pct(chosen.ts)} TS (${chosen.g} GP).`
      );
    }

    function render() {
      const chosen = seasons.find(s => s.year === year);
      const peer = data.players.find(p => p.name === other);
      const sameAge = peer.seasons.find(s => s.age === chosen.age);
      fig.dataset.year = year;
      modeTabs.set(view);
      peerPills.set(other);
      lateToggle.setAttribute('aria-pressed', String(range === 'late'));
      trendControls.hidden = view !== 'trends';
      holder.replaceChildren();
      if (view === 'role') renderRole(chosen);
      else renderTrends(chosen, peer, sameAge);
    }

    function control(opts) {
      if (opts.view) view = opts.view;
      if (opts.player && PEERS.includes(opts.player)) other = opts.player;
      if (opts.age) {
        view = 'trends';
        range = +opts.age >= 35 ? 'late' : 'all';
        const match = seasons.find(s => s.age === +opts.age);
        if (match && sharedSeason.select(match.year, fig.id)) return;
      }
      if (opts.year && sharedSeason.select(opts.year, fig.id)) return;
      render();
    }

    sharedSeason.subscribe(fig.id, val => { year = val; if (year < 2020) range = 'all'; render(); });
    controllers[fig.id] = control;
    controllers['lbj-age'] = control;
    responsive(holder, render);
    render();
  }

  /* ------------------------------------ Figure 4: Two-Jobs Career Scatter */
  function scatter(fig, data) {
    const b = mount(fig), players = data.players.filter(p => p.scatter);
    let active = BRON;

    const QUICK = [BRON, 'John Stockton', 'Chris Paul', 'Magic Johnson', 'Michael Jordan', 'Kareem Abdul-Jabbar', 'Wilt Chamberlain'];
    const bar = el('div', { class: 'fig-controls' }, b);
    const key = el('div', { class: 'lbj-legend', style: 'margin:0' }, bar);
    [
      ['var(--accent)', 'LeBron'],
      ['var(--lbj-teal)', '10k+ AST'],
      ['var(--lbj-rival)', '10k+ REB'],
      ['var(--lbj-peer)', 'Top-40 scorer']
    ].forEach(([col, text]) => {
      const sp = el('span', {}, key);
      el('i', { class: 'round', style: `background:${col}` }, sp);
      sp.append(document.createTextNode(text));
    });

    const quickPills = pills(bar, 'Highlight historical leader', QUICK.map(n => [n, shortName(n)]), active, v => { active = v; render(); });
    quickPills.node.style.marginLeft = 'auto';

    const holder = el('div', { class: 'lbj-paired-plots' }, b);
    const detail = readout(b);

    function dotColor(p) {
      if (p.name === BRON) return 'var(--accent)';
      if (p.ast >= 10000) return 'var(--lbj-teal)';
      if (p.trb >= 10000) return 'var(--lbj-rival)';
      return 'var(--lbj-peer)';
    }

    function show(p) {
      const note = p.seasons.some(s => s.trb == null) ? ' (pre-1950–51 rebounds unrecorded).' : '.';
      describe(detail, p.name, `${fmt(p.pts)} PTS · ${fmt(p.ast)} AST · ${fmt(p.trb)} REB · ${fmt(p.g)} GP${note}`);
    }

    function render() {
      quickPills.set(QUICK.includes(active) ? active : '');
      holder.replaceChildren();
      const rings = [];
      const preview = p => {
        rings.forEach(([row, ring]) => ring.setAttribute('visibility', row.name === p.name ? 'visible' : 'hidden'));
        show(p);
      };

      ['ast', 'trb'].forEach(metric => {
        const panel = el('section', { class: 'lbj-scatter-panel', 'aria-label': metric === 'ast' ? 'Points and assists' : 'Points and rebounds' }, holder);
        const plot = el('div', {}, panel);
        const ymax = metric === 'ast' ? 16500 : 25500;
        const c = chart(plot, {
          height: 295, xmin: 0, xmax: 46000, ymin: 0, ymax,
          xticks: [0, 20000, 40000],
          yticks: metric === 'ast' ? [0, 5000, 10000, 15000] : [0, 5000, 10000, 15000, 20000, 25000],
          xfmt: v => (v ? v / 1000 + 'k' : '0'),
          yfmt: v => (v ? v / 1000 + 'k' : '0'),
          xlabel: 'Career points',
          ylabel: 'Career ' + STAT_NAMES[metric],
          label: `Career points vs ${STAT_NAMES[metric]} for 94 leaders.`
        });

        // 40k + 10k shaded upper-right quadrant & 10k threshold line
        svg('line', {
          x1: c.pad.left, x2: c.x(40000), y1: c.y(10000), y2: c.y(10000),
          stroke: metric === 'ast' ? 'var(--lbj-teal)' : 'var(--lbj-rival)',
          'stroke-opacity': 0.35, 'stroke-dasharray': '3 3'
        }, c.root);
        svg('rect', {
          x: c.x(40000), y: c.y(ymax),
          width: c.x(46000) - c.x(40000), height: c.y(10000) - c.y(ymax),
          fill: 'var(--lbj-wash)', 'aria-hidden': 'true'
        }, c.root);
        svg('path', {
          d: `M${c.x(40000)},${c.y(ymax)}V${c.y(10000)}H${c.x(46000)}`,
          fill: 'none', stroke: 'var(--accent)', 'stroke-opacity': 0.45, 'stroke-dasharray': '3 3'
        }, c.root);
        svg('text', {
          x: (c.x(40000) + c.x(46000)) / 2, y: c.pad.top + 13,
          'text-anchor': 'middle', text: '40k+10k',
          style: 'font:9.5px var(--mono);fill:var(--accent);opacity:0.75'
        }, c.root);

        const ordered = players.filter(p => p.name !== active && p.name !== BRON)
          .concat(players.filter(p => p.name === BRON && p.name !== active))
          .concat(players.filter(p => p.name === active));

        ordered.forEach(p => {
          const isBron = p.name === BRON, isAct = p.name === active;
          const g = svg('g', { 'data-player': p.name }, c.root);
          svg('circle', {
            cx: c.x(p.pts), cy: c.y(p[metric]),
            r: isBron ? 4.8 : isAct ? 4.3 : 3,
            fill: dotColor(p),
            'fill-opacity': isBron || isAct ? 1 : 0.72,
            stroke: 'var(--bg)', 'stroke-width': 0.9
          }, g);
          const ring = svg('circle', {
            cx: c.x(p.pts), cy: c.y(p[metric]), r: 8.5,
            fill: 'none', stroke: isBron ? 'var(--accent)' : 'var(--fg)', 'stroke-width': 1.2,
            visibility: isAct ? 'visible' : 'hidden', class: 'lbj-player-ring'
          }, g);
          rings.push([p, ring]);
          const hit = svg('circle', { cx: c.x(p.pts), cy: c.y(p[metric]), r: 10, fill: 'transparent', class: 'lbj-hit' }, g);
          hit.addEventListener('click', () => { active = p.name; render(); });
          hit.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') preview(p); });
          hit.addEventListener('pointerleave', () => preview(players.find(r => r.name === active)));
        });

        const landmarks = metric === 'ast'
          ? [BRON, 'John Stockton', 'Chris Paul', 'Jason Kidd', 'Magic Johnson', 'Michael Jordan', 'Kareem Abdul-Jabbar']
          : [BRON, 'Wilt Chamberlain', 'Bill Russell', 'Kareem Abdul-Jabbar', 'Karl Malone', 'Tim Duncan', 'Michael Jordan'];
        const placed = [];
        [active, ...landmarks.filter(n => n !== active)].forEach(name => {
          const p = players.find(r => r.name === name);
          if (!p) return;
          const isBron = name === BRON, isAct = name === active;
          const lbl = svg('text', {
            text: shortName(name),
            class: isBron ? 'lbj-bron-label' : isAct ? 'lbj-value-label' : 'lbj-direct-label'
          }, c.root);
          const wText = lbl.getComputedTextLength();
          const anchor = p.pts > 31000 ? 'end' : 'start';
          const rawX = c.x(p.pts) + (anchor === 'end' ? -9 : 9);
          const lx = Math.max(anchor === 'end' ? wText + 2 : 2, Math.min(c.w - 2 - (anchor === 'end' ? 0 : wText), rawX));
          const ly = Math.max(c.pad.top + 11, c.y(p[metric]) - 8);
          const box = { left: anchor === 'end' ? lx - wText : lx, right: anchor === 'end' ? lx : lx + wText, top: ly - 11, bottom: ly + 3 };
          if (!isBron && !isAct && placed.some(b => box.left < b.right + 4 && box.right > b.left - 4 && box.top < b.bottom + 2 && box.bottom > b.top - 2)) {
            lbl.remove();
            return;
          }
          lbl.setAttribute('x', lx);
          lbl.setAttribute('y', ly);
          lbl.setAttribute('text-anchor', anchor);
          placed.push(box);
        });
      });

      show(players.find(p => p.name === active));
    }

    controllers[fig.id] = o => { if (o.player && players.some(p => p.name === o.player)) active = o.player; render(); };
    responsive(holder, render);
    render();
  }

  /* -------------------------------- Figure 5: Playoff Logs & Series Duels */
  function playoffs(fig, data) {
    const b = mount(fig);
    let year = 2016, scope = 'finals', metric = 'pts', selected = 4, browseAll = false;

    const bar = el('div', { class: 'fig-controls' }, b);
    const presetTabs = tabs(bar, 'Featured playoff runs', [
      ['2016', '2016 Finals'],
      ['2013', '2013 Finals'],
      ['2018', '2018 run'],
      ['2011', '2011 Finals'],
      ['other', 'All years']
    ], '2016', v => {
      if (v === '2016') { browseAll = false; year = 2016; scope = 'finals'; metric = 'pts'; selected = 4; }
      else if (v === '2013') { browseAll = false; year = 2013; scope = 'finals'; metric = 'pts'; selected = 5; }
      else if (v === '2018') { browseAll = false; year = 2018; scope = 'all'; metric = 'pts'; selected = -1; }
      else if (v === '2011') { browseAll = false; year = 2011; scope = 'finals'; metric = 'pts'; selected = 3; }
      else { browseAll = true; }
      render();
    });

    const metricPills = pills(bar, 'Statistic', [
      ['pts', 'PTS'],
      ['trb', 'REB'],
      ['ast', 'AST']
    ], metric, v => { metric = v; render(); });

    const summary = el('span', { class: 'fig-num' }, bar);

    const subBar = el('div', { class: 'fig-controls sub', hidden: '' }, b);
    const yearSelect = el('select', { 'aria-label': 'Playoff year' }, subBar);
    data.seasons.filter(s => s.phase === 'po' && s.g).forEach(s => {
      el('option', { value: s.year, text: `${s.year} · ${s.team}` }, yearSelect);
    });
    yearSelect.addEventListener('change', () => { year = +yearSelect.value; selected = -1; render(); });
    const scopePills = pills(subBar, 'Round scope', [
      ['finals', 'Finals only'],
      ['all', 'Whole run']
    ], scope, v => { scope = v; selected = -1; render(); });

    const key = el('div', { class: 'lbj-legend' }, b);
    const holder = el('div', {}, b);
    const detail = readout(b);
    const leaders = el('div', { class: 'lbj-finals' }, b);

    function render() {
      const presetKey = !browseAll && year === 2016 && scope === 'finals' ? '2016'
        : !browseAll && year === 2013 && scope === 'finals' ? '2013'
        : !browseAll && year === 2018 && scope === 'all' ? '2018'
        : !browseAll && year === 2011 && scope === 'finals' ? '2011'
        : 'other';
      presetTabs.set(presetKey);
      subBar.hidden = presetKey !== 'other';
      yearSelect.value = String(year);
      scopePills.set(scope);
      metricPills.set(metric);

      const rows = data.games.filter(g => g.year === year && g.phase === 'po' && (scope === 'all' || g.game[7] === '4'));
      leaders.replaceChildren();
      key.replaceChildren();

      if (!rows.length) {
        summary.textContent = `${year} Finals · —`;
        holder.replaceChildren(el('p', { class: 'lbj-empty', text: `No NBA Finals appearance in ${year}. Switch to “Whole run” above to inspect this postseason.` }));
        detail.replaceChildren();
        return;
      }

      selected = selected < 0 ? rows.length - 1 : Math.min(selected, rows.length - 1);
      const rs = data.seasons.find(s => s.year === year && s.phase === 'rs');
      const progress = seriesProgress(rows);
      const ref = rs[metric] / rs.g;
      const lastProg = progress.at(-1);

      summary.innerHTML = scope === 'finals'
        ? `<b>${year} Finals</b> · <span class="accent">${dec(total(rows, metric) / rows.length)} ${metric.toUpperCase()}/G</span> · ${lastProg.wins === 4 ? 'Won' : 'Lost'} ${lastProg.wins}–${lastProg.losses}`
        : `<b>${year} Playoffs</b> · <span class="accent">${dec(total(rows, metric) / rows.length)} ${metric.toUpperCase()}/G</span> · ${rows.length} GP`;

      const kWin = el('span', {}, key);
      el('i', { style: 'background:var(--accent)' }, kWin);
      kWin.append(document.createTextNode('Win'));
      const kLoss = el('span', {}, key);
      el('i', { style: 'background:var(--lbj-loss);box-shadow:inset 0 0 0 1px var(--line-2)' }, kLoss);
      kLoss.append(document.createTextNode('Loss'));
      const kRef = el('span', {}, key);
      el('i', { class: 'dashed', style: 'color:var(--fg-3)' }, kRef);
      kRef.append(document.createTextNode(`Regular season (${dec(ref)})`));

      const ymax = metric === 'pts' ? 60 : 20;
      const c = chart(holder, {
        height: scope === 'finals' ? 300 : 275,
        bottom: scope === 'finals' ? 60 : 40,
        xmin: 0, xmax: rows.length, ymin: 0, ymax,
        xticks: [],
        yticks: metric === 'pts' ? [0, 20, 40, 60] : [0, 5, 10, 15, 20],
        ylabel: STAT_NAMES[metric][0].toUpperCase() + STAT_NAMES[metric].slice(1) + ' per game',
        xlabel: scope === 'finals' ? '' : 'Postseason games in chronological order',
        label: `${year} postseason ${STAT_NAMES[metric]} game log.`
      });

      if (scope === 'finals') {
        const firstElim = progress.findIndex(p => p.facingElimination);
        if (firstElim >= 0) {
          svg('rect', {
            x: c.x(firstElim), y: c.pad.top,
            width: c.x(rows.length) - c.x(firstElim), height: c.y(0) - c.pad.top,
            fill: 'var(--lbj-elim)', 'aria-hidden': 'true'
          }, c.root);
          if (rows.length - firstElim >= 2) {
            svg('text', {
              x: c.x((firstElim + rows.length) / 2), y: c.pad.top + 13,
              'text-anchor': 'middle', text: 'Facing elimination', class: 'lbj-elimination-label'
            }, c.root);
          }
        }
      }

      svg('line', { x1: c.x(0), x2: c.x(rows.length), y1: c.y(ref), y2: c.y(ref), class: 'lbj-benchmark' }, c.root);

      const barW = Math.min(48, (c.x(1) - c.x(0)) * 0.62);
      rows.forEach((g, i) => {
        const group = svg('g', { 'data-game': i + 1 }, c.root);
        const h = Math.max(1, c.y(0) - c.y(g[metric]));
        svg('rect', {
          x: c.x(i + 0.5) - barW / 2, y: c.y(g[metric]),
          width: barW, height: h, rx: 1.5,
          class: 'lbj-game-bar' + (g.win ? ' win' : '') + (selected === i ? ' selected' : '')
        }, group);
        const hit = svg('rect', {
          x: c.x(i), y: c.pad.top, width: c.x(1) - c.x(0), height: c.y(0) - c.pad.top,
          fill: 'transparent', class: 'lbj-hit'
        }, c.root);
        hit.addEventListener('click', () => { selected = i; render(); });
        if (rows.length <= 8 || selected === i || g[metric] >= 45) {
          svg('text', {
            x: c.x(i + 0.5), y: c.y(g[metric]) - 7,
            'text-anchor': 'middle', text: g[metric],
            class: selected === i ? 'lbj-bron-label' : 'lbj-value-label'
          }, group);
        }
      });

      if (scope === 'finals') {
        rows.forEach((g, i) => {
          svg('text', { x: c.x(i + 0.5), y: c.y(0) + 15, 'text-anchor': 'middle', text: 'G' + (i + 1), class: 'lbj-game-label' }, c.root);
          svg('text', { x: c.x(i + 0.5), y: c.y(0) + 28, 'text-anchor': 'middle', text: (g.home ? 'vs ' : '@') + g.opp, class: 'lbj-venue-label' }, c.root);
          svg('text', {
            x: c.x(i + 0.5), y: c.y(0) + 43, 'text-anchor': 'middle',
            text: progress[i].wins + '–' + progress[i].losses,
            class: 'lbj-series-score' + (progress[i].wins === 4 ? ' won' : '')
          }, c.root);
        });
      } else {
        let start = 0;
        rows.forEach((g, i) => {
          if (i === rows.length - 1 || rows[i + 1].opp !== g.opp) {
            if (start > 0) {
              svg('line', { x1: c.x(start), x2: c.x(start), y1: c.pad.top, y2: c.y(0) + 14, stroke: 'var(--line-2)', 'stroke-dasharray': '2 3' }, c.root);
            }
            svg('text', { x: c.x((start + i + 1) / 2), y: c.y(0) + 18, 'text-anchor': 'middle', text: g.opp, class: 'lbj-game-label' }, c.root);
            start = i + 1;
          }
        });
      }

      const g = rows[selected];
      describe(
        detail,
        `${scope === 'finals' ? 'Game ' + (selected + 1) : g.date} · ${g.win ? 'W' : 'L'} ${g.home ? 'vs' : '@'} ${g.opp}`,
        `${g.pts} PTS · ${g.trb} REB · ${g.ast} AST · ${g.stl} STL · ${g.blk} BLK (${g.fg}/${g.fga} FG).`
      );

      c.root.setAttribute('tabindex', '0');
      c.root.setAttribute('role', 'slider');
      c.root.setAttribute('aria-label', 'Inspect playoff game');
      c.root.setAttribute('aria-valuemin', '1');
      c.root.setAttribute('aria-valuemax', String(rows.length));
      c.root.setAttribute('aria-valuenow', String(selected + 1));
      c.root.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        selected = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, selected + (e.key === 'ArrowRight' ? 1 : -1)));
        render();
        holder.querySelector('svg')?.focus({ preventScroll: true });
      });

      if (scope === 'finals') {
        const f = data.finals.find(r => r.year === year);
        if (f) {
          const head = el('div', { class: 'lbj-compact-head' }, leaders);
          el('span', { text: 'Full-series totals (both teams)' }, head);
          el('span', { text: 'LeBron' }, head);
          el('span', { text: 'Best other' }, head);
          el('span', { text: 'Margin' }, head);

          const lbj = f.players.find(p => p.name === BRON);
          ['pts', 'trb', 'ast', 'stl', 'blk'].forEach(k => {
            const others = f.players.filter(p => p.name !== BRON);
            const best = Math.max(...others.map(p => p[k]));
            const rivals = others.filter(p => p[k] === best);
            const max = Math.max(best, lbj[k], 1);
            const diff = lbj[k] - best;

            const row = el('div', { class: 'lbj-compact-duel' }, leaders);
            el('span', { text: STAT_NAMES[k][0].toUpperCase() + STAT_NAMES[k].slice(1) }, row);
            const track = el('span', { class: 'lbj-compact-tracks', 'aria-hidden': 'true' }, row);
            el('i', { class: 'bron', style: `width:${(lbj[k] / max * 100).toFixed(1)}%` }, track);
            el('i', { style: `width:${(best / max * 100).toFixed(1)}%` }, track);
            el('strong', { class: 'lbj-compact-value', text: fmt(lbj[k]) }, row);
            const shortRivals = rivals.map(p => {
              const parts = p.name.split(' ');
              return parts[0][0] + '. ' + parts.at(-1);
            }).join(' / ');
            el('span', { class: 'lbj-compact-rival', text: `${shortRivals} ${fmt(best)}`, title: rivals.map(p => p.name).join(' / ') }, row);
            el('span', {
              class: 'lbj-compact-delta' + (diff > 0 ? ' lead' : ''),
              text: (diff > 0 ? '+' : diff < 0 ? '−' : '') + fmt(Math.abs(diff))
            }, row);
          });
        }
      }
    }

    controllers[fig.id] = o => {
      if (o.year) year = +o.year;
      if (o.scope) scope = o.scope;
      metric = o.metric || 'pts';
      const isPreset = (year === 2016 && scope === 'finals') || (year === 2013 && scope === 'finals') || (year === 2018 && scope === 'all') || (year === 2011 && scope === 'finals');
      browseAll = !isPreset;
      selected = o.game ? +o.game - 1 : year === 2016 && scope === 'finals' ? 4 : year === 2013 && scope === 'finals' ? 5 : -1;
      render();
    };
    responsive(holder, render);
    render();
  }

  /* ------------------------------------------------------------- Bootstrap */
  const init = {
    'lbj-career': career,
    'lbj-peak': peak,
    'lbj-two-jobs': scatter,
    'lbj-shots': shooting,
    'lbj-playoffs': playoffs
  };

  Object.entries(init).forEach(([id, fn]) => {
    const fig = document.getElementById(id);
    if (!fig) return;
    fig.dataset.src = new URL(fig.dataset.src, location.href).href;
    const loading = el('p', { class: 'lbj-loading', text: 'Loading archived career…' });
    fig.prepend(loading);
    function boot() {
      get(fig.dataset.src).then(data => {
        timeline(data);
        fn(fig, data);
        loading.remove();
      }).catch(err => {
        console.error('LeBron figure ' + id, err);
        fig.querySelector('.fig-body')?.remove();
        loading.textContent = 'The figure could not load. ';
        const retry = el('button', { class: 'btn', type: 'button', text: 'Retry' }, loading);
        retry.addEventListener('click', boot, { once: true });
      });
    }
    boot();
  });

  document.querySelectorAll('a.act[href^="#lbj-"]').forEach(a => a.addEventListener('click', event => {
    const id = a.getAttribute('href').slice(1);
    if (!controllers[id]) return;
    event.preventDefault();
    controllers[id](a.dataset);
    const target = document.getElementById(id);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }));
})();
