// Figures for "Replaying a village raid".
//
// Every battle, route and result here was produced by Crown & Clan's own
// simulation (web-coc's GameModel, stepped at 20 Hz in Node; see
// _tools/web-coc-demo) on the project's own authored villages, and saved to
// /assets/data/web-coc-demo.json as positions, footprints and hit-point
// fractions. This page only plays them back; it draws no game art.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DEF = { cannon: 1, archertower: 1, mortar: 1, airdefense: 1, wizardtower: 1, tesla: 1, bombtower: 1, airsweeper: 1 };
  var GOLD = { goldstorage: 1, goldmine: 1 };
  var ELIXIR = { elixirstorage: 1, collector: 1 };
  var TRAPS = { bomb: 1, airbomb: 1, springtrap: 1, giantbomb: 1, skeletontrap: 1, seekingairmine: 1 };
  var NAMES = {
    townhall: 'Town Hall', cannon: 'Cannon', archertower: 'Archer Tower', mortar: 'Mortar', airdefense: 'Air Defense',
    wizardtower: 'Wizard Tower', tesla: 'Hidden Tesla', bombtower: 'Bomb Tower', airsweeper: 'Air Sweeper',
    goldstorage: 'Gold Storage', goldmine: 'Gold Mine', elixirstorage: 'Elixir Storage', collector: 'Elixir Collector',
    barracks: 'Barracks', camp: 'Army Camp', builder: 'Builder’s Hut', laboratory: 'Laboratory', wall: 'Wall',
  };
  // Troops by their index in the game's troop list.
  var TROOP_STYLE = [
    { c: 'var(--t-barb)', r: 0.3 }, { c: 'var(--t-archer)', r: 0.27 }, { c: 'var(--t-giant)', r: 0.5 },
    { c: '#8b5cf6', r: 0.34 }, { c: 'var(--t-air)', r: 0.42 }, { c: '#65a30d', r: 0.28 }, { c: 'var(--t-wb)', r: 0.32 },
    { c: '#f472b6', r: 0.4 }, { c: 'var(--t-air)', r: 0.6 }, { c: '#334155', r: 0.55 },
  ];

  // ---- DOM helpers ---------------------------------------------------------
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, attrs, children) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v === undefined || v === null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c !== null && c !== undefined) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function tabs(label, options, value, onChange) {
    var wrap = h('div', { class: 'tabs', role: 'group', 'aria-label': label });
    var buttons = options.map(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': String(o[0] === value), text: o[1] });
      b.addEventListener('click', function () { select(o[0]); });
      wrap.appendChild(b);
      return b;
    });
    function select(v) {
      buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', String(options[i][0] === v)); });
      onChange(v);
    }
    return { el: wrap, set: select };
  }
  var CAN_HOVER = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
  var POINT = CAN_HOVER ? 'Hover over' : 'Tap';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICONS = { play: 'M5 3.5v9l7-4.5z', pause: 'M5 3.5v9M11 3.5v9', first: 'M11.5 4 7.5 8l4 4M4.5 4v8' };
  function iconButton(icon, label, onClick) {
    var b = h('button', { class: 'btn icon', type: 'button', 'aria-label': label, title: label, onclick: onClick });
    var s = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, b);
    var p = svg('path', { d: ICONS[icon] }, s);
    b.setIcon = function (name) { p.setAttribute('d', ICONS[name]); };
    return b;
  }
  function mount(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }
  function local(el, e, w, hgt) {
    var r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * hgt];
  }
  function stars(n) {
    var s = h('span', { class: 'stars', 'aria-label': n + (n === 1 ? ' star' : ' stars') });
    for (var i = 0; i < 3; i++) s.appendChild(h('span', { class: i < n ? '' : 'off', text: '★' }));
    return s;
  }

  // ---- Village -------------------------------------------------------------
  function family(kind) {
    if (TRAPS[kind]) return null;
    if (kind === 'wall') return 'wall';
    if (kind === 'townhall') return 'th';
    if (DEF[kind]) return 'def';
    if (GOLD[kind]) return 'gold';
    if (ELIXIR[kind]) return 'elixir';
    return 'other';
  }
  function bounds(layout, pad) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    layout.forEach(function (b) { x0 = Math.min(x0, b[1]); y0 = Math.min(y0, b[2]); x1 = Math.max(x1, b[1] + b[3]); y1 = Math.max(y1, b[2] + b[3]); });
    return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(48, x1 + pad) - Math.max(0, x0 - pad), h: Math.min(48, y1 + pad) - Math.max(0, y0 - pad) };
  }
  function makeVillage(layout, label, pad) {
    var bb = bounds(layout, pad === undefined ? 3.2 : pad);
    var el = svg('svg', { class: 'vil', viewBox: [bb.x, bb.y, bb.w, bb.h].join(' '), role: 'img', 'aria-label': label });
    svg('rect', { class: 'ground', x: bb.x, y: bb.y, width: bb.w, height: bb.h }, el);
    var g = svg('g', { class: 'gridl' }, el);
    var d = '';
    for (var x = Math.ceil(bb.x); x <= bb.x + bb.w; x++) d += 'M' + x + ' ' + bb.y + 'V' + (bb.y + bb.h);
    for (var y = Math.ceil(bb.y); y <= bb.y + bb.h; y++) d += 'M' + bb.x + ' ' + y + 'H' + (bb.x + bb.w);
    svg('path', { d: d }, g);
    var L = {};
    ['under', 'b', 'over', 'units', 'shots', 'pts', 'hits'].forEach(function (k) { L[k] = svg('g', {}, el); });
    var rects = layout.map(function (b) {
      var f = family(b[0]);
      if (!f) return null;
      var inset = f === 'wall' ? 0.12 : 0.14;
      var r = svg('rect', { class: 'b ' + f, x: b[1] + inset, y: b[2] + inset, width: b[3] - 2 * inset, height: b[3] - 2 * inset, rx: f === 'wall' ? 0.08 : 0.22 }, L.b);
      var t = svg('title', {}, r);
      t.textContent = NAMES[b[0]] || b[0];
      return { r: r, f: f, b: b };
    });
    return { el: el, L: L, rects: rects, bb: bb };
  }
  function setBuildingHp(v, i, hp) {
    var o = v.rects[i];
    if (!o) return;
    if (hp <= 0) o.r.setAttribute('class', 'b ' + o.f + ' dead');
    else {
      o.r.setAttribute('class', 'b ' + o.f);
      o.r.setAttribute('fill-opacity', String(0.35 + 0.65 * hp / 100));
    }
  }

  // A recorded battle, decoded for playback.
  function decodeRun(run, frameSeconds) {
    var units = run.units.map(function (u) {
      var xs = [], ys = [], x = 0, y = 0;
      for (var i = 0; i < u.xy.length; i += 2) {
        x += u.xy[i]; y += u.xy[i + 1];
        xs.push(x / 10); ys.push(y / 10);
      }
      return { id: u.id, k: u.k, f0: u.f0, xs: xs, ys: ys, hp: u.hp };
    });
    var byId = {};
    units.forEach(function (u) { byId[u.id] = u; });
    return { run: run, units: units, byId: byId, dt: frameSeconds, frames: run.frames, seconds: (run.frames - 1) * frameSeconds };
  }
  function hpAt(list, f) {
    var hp = 100;
    for (var i = 0; i < list.length; i += 2) { if (list[i] <= f) hp = list[i + 1]; else break; }
    return hp;
  }
  function unitAt(u, f) {
    var i = f - u.f0;
    if (i < 0 || i > u.xs.length - 1) return null;
    var a = Math.floor(i), b = Math.min(u.xs.length - 1, a + 1), t = i - a;
    return { x: u.xs[a] + (u.xs[b] - u.xs[a]) * t, y: u.ys[a] + (u.ys[b] - u.ys[a]) * t, hp: u.hp[a] };
  }
  function drawBattle(v, D, seconds, opts) {
    opts = opts || {};
    var f = Math.min(D.frames - 1, seconds / D.dt), fi = Math.floor(f);
    D.run.bhp.forEach(function (list, i) { setBuildingHp(v, i, hpAt(list, fi)); });
    clear(v.L.units);
    D.units.forEach(function (u) {
      var p = unitAt(u, f);
      if (!p) return;
      var st = TROOP_STYLE[u.k] || TROOP_STYLE[0];
      if (p.hp <= 0) return;
      svg('circle', { class: 'u', cx: p.x, cy: p.y, r: st.r, fill: st.c }, v.L.units);
    });
    clear(v.L.shots);
    var s = D.run.shots || [];
    for (var i = 0; i < s.length; i += 3) {
      if (Math.abs(s[i] - f) > 0.6) continue;
      var u = D.byId[s[i + 2]], b = v.rects[s[i + 1]];
      if (!u || !b) continue;
      var p = unitAt(u, f);
      if (!p) continue;
      svg('line', { class: 'shot', x1: b.b[1] + b.b[3] / 2, y1: b.b[2] + b.b[3] / 2, x2: p.x, y2: p.y }, v.L.shots);
    }
    if (opts.trails) {
      clear(v.L.under);
      D.units.forEach(function (u) {
        var n = Math.min(u.xs.length, Math.floor(f - u.f0) + 1);
        if (n < 2) return;
        var d = '';
        for (var j = 0; j < n; j++) d += (j ? 'L' : 'M') + u.xs[j].toFixed(2) + ' ' + u.ys[j].toFixed(2);
        svg('path', { class: 'trail ' + opts.trails, d: d }, v.L.under);
      });
    }
    var sc = D.run.score;
    return { destruction: sc[fi * 2], stars: sc[fi * 2 + 1] };
  }
  function legend(items) {
    return h('div', { class: 'legend' }, items.map(function (it) {
      return h('span', {}, [h('i', { class: it[2] ? 'round' : '', style: 'background:' + it[1] }), it[0]]);
    }));
  }
  var BUILDING_LEGEND = [['Defense', 'var(--v-def)'], ['Town Hall', 'var(--v-th)'], ['Gold', 'var(--v-gold)'], ['Elixir', 'var(--v-elixir)'], ['Other', 'var(--v-other)'], ['Wall', 'var(--v-wall)']];
  var TROOP_LEGEND = [['Giant', 'var(--t-giant)', 1], ['Wall Breaker', 'var(--t-wb)', 1], ['Barbarian', 'var(--t-barb)', 1], ['Archer', 'var(--t-archer)', 1]];

  // A playback clock driven by requestAnimationFrame.
  function player(onTime, getEnd) {
    var state = { t: 0, playing: false, speed: 4, last: 0 };
    function tick(now) {
      if (!state.playing) return;
      var dt = Math.min(0.1, (now - state.last) / 1000);
      state.last = now;
      state.t = Math.min(getEnd(), state.t + dt * state.speed);
      onTime(state.t);
      if (state.t >= getEnd()) { stop(); return; }
      requestAnimationFrame(tick);
    }
    function play() {
      if (state.t >= getEnd()) state.t = 0;
      state.playing = true;
      state.last = performance.now();
      if (btn) btn.setIcon('pause');
      requestAnimationFrame(tick);
    }
    function stop() { state.playing = false; if (btn) btn.setIcon('play'); }
    var btn = iconButton('play', 'Play or pause', function () { if (state.playing) stop(); else play(); });
    return { state: state, play: play, stop: stop, button: btn, seek: function (t) { state.t = Math.max(0, Math.min(getEnd(), t)); onTime(state.t); } };
  }

  // =========================================================================
  // Where you attack from
  // =========================================================================
  function raid(fig, data) {
    var body = mount(fig);
    var R = data.raids[0];
    var layout = data.villages[R.index].layout;
    var v = makeVillage(layout, data.villages[R.index].name + ': twelve landing points around the village');
    var runs = R.runs.map(function (r) { return decodeRun(r, 0.4); });
    var state = { i: 0 };
    var score = h('div', { class: 'score', 'aria-live': 'polite' });
    var where = h('div', { class: 'fig-num' });
    var sum = h('p', { class: 'ring-sum' });
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', max: '100', step: '0.1', 'aria-label': 'Battle time' });
    var W = 360, H = 120, P = { l: 38, r: 6, t: 8, b: 18 };
    var maxT = Math.max.apply(null, runs.map(function (r) { return r.seconds; }));
    var chart = svg('svg', { class: 'dchart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Destruction over time for each landing point' });
    var gx = function (t) { return P.l + (W - P.l - P.r) * t / maxT; };
    var gy = function (d) { return P.t + (H - P.t - P.b) * (1 - d / 100); };
    [50, 100].forEach(function (d) {
      svg('line', { class: 'mark', x1: P.l, x2: W - P.r, y1: gy(d), y2: gy(d) }, chart);
      svg('text', { x: P.l - 5, y: gy(d) + 3.5, 'text-anchor': 'end' }, chart).textContent = d + '%';
    });
    svg('text', { x: W - P.r, y: H - 3, 'text-anchor': 'end' }, chart).textContent = Math.round(maxT) + ' s';
    svg('text', { x: P.l, y: H - 3 }, chart).textContent = '0';
    var curves = runs.map(function (D) {
      var pts = [];
      for (var f = 0; f < D.frames; f++) pts.push(gx(f * D.dt).toFixed(1) + ',' + gy(D.run.score[f * 2]).toFixed(1));
      return svg('polyline', { class: 'other', points: pts.join(' ') }, chart);
    });
    var cursor = svg('line', { class: 'cursor', y1: P.t, y2: H - P.b }, chart);

    var clock = player(function (t) { show(t); }, function () { return runs[state.i].seconds; });
    slider.addEventListener('input', function () { clock.stop(); clock.seek(Number(slider.value) / 100 * runs[state.i].seconds); });
    var scrub = function (e) { var p = local(chart, e, W, H); clock.stop(); clock.seek((p[0] - P.l) / (W - P.l - P.r) * maxT); };
    chart.addEventListener('pointerdown', function (e) { chart.setPointerCapture(e.pointerId); scrub(e); });
    chart.addEventListener('pointermove', function (e) { if (e.buttons) scrub(e); });

    // Landing points, coloured by the stars each raid took.
    R.runs.forEach(function (r, i) {
      var c = svg('circle', { class: 'pt s' + r.stars, cx: r.at[0], cy: r.at[1], r: 0.75 }, v.L.pts);
      svg('text', { class: 'ptl', x: r.at[0], y: r.at[1] + 1.45 }, v.L.pts).textContent = r.stars + '★';
      c.addEventListener('click', function () { select(i, true); });
      runs[i].dot = c;
    });

    function show(t) {
      var D = runs[state.i];
      var s = drawBattle(v, D, t);
      slider.value = String(D.seconds ? 100 * t / D.seconds : 0);
      counter.textContent = t.toFixed(1) + ' s';
      cursor.setAttribute('x1', gx(Math.min(t, D.seconds))); cursor.setAttribute('x2', gx(Math.min(t, D.seconds)));
      clear(score);
      score.appendChild(h('span', { class: 'pct', text: s.destruction + '%' }));
      score.appendChild(stars(s.stars));
      score.appendChild(h('span', { class: 'time', text: t >= D.seconds - 1e-6 ? 'final, ' + D.run.seconds.toFixed(0) + ' s' + (D.run.ended ? ', ended by hand' : '') : 'at ' + t.toFixed(0) + ' s' }));
    }
    function select(i, autoplay) {
      state.i = i;
      runs.forEach(function (D, j) {
        D.dot.setAttribute('class', 'pt s' + D.run.stars + (j === i ? ' on' : ''));
        curves[j].setAttribute('class', j === i ? 'this' : 'other');
      });
      chart.appendChild(curves[i]);
      chart.appendChild(cursor);
      var r = R.runs[i];
      where.textContent = 'Landing point ' + (i + 1) + ' of ' + R.runs.length + ': ' + r.stars + (r.stars === 1 ? ' star, ' : ' stars, ') + r.destruction + '% in ' + r.seconds.toFixed(0) + ' s';
      clock.stop();
      clock.seek(0);
      if (autoplay && !REDUCE) clock.play();
    }

    var counts = [0, 0, 0, 0];
    R.runs.forEach(function (r) { counts[r.stars]++; });
    sum.textContent = 'Same army, same village, twelve landing points: three stars from ' + counts[3] + ', two from ' + counts[2] + ', one from ' + counts[1] + ', none from ' + counts[0] + '.';

    var speedTabs = tabs('Speed', [['2', '2×'], ['4', '4×'], ['8', '8×']], '4', function (s) { clock.state.speed = Number(s); });
    body.appendChild(h('div', { class: 'two' }, [
      h('div', { class: 'col' }, [v.el, h('div', { class: 'transport' }, [clock.button, slider, counter])]),
      h('div', { class: 'col' }, [
        score, where, chart,
        h('div', { class: 'fig-controls', style: 'margin:0' }, [h('span', { class: 'fig-num', text: 'Speed' }), speedTabs.el]),
        sum,
        legend(TROOP_LEGEND), legend(BUILDING_LEGEND),
      ]),
    ]));
    select(0, false);
    show(0);

    fig.coc = {
      set: function (o) {
        if (o.point !== undefined) select(Number(o.point), true);
      },
    };
  }

  // =========================================================================
  // Routes through walls
  // =========================================================================
  function paths(fig, data) {
    var body = mount(fig);
    var P = data.paths;
    var layout = data.villages[P.index].layout;
    var v = makeVillage(layout, data.villages[P.index].name + ': routes from the edge');
    var walls = {};
    layout.forEach(function (b) { if (b[0] === 'wall') walls[b[1] + ',' + b[2]] = 1; });
    var state = { troop: 'giant', i: 40 };
    var note = h('p', { class: 'fig-note' });
    var head = h('div', { class: 'ring-sum' });
    var LABEL = { barbarian: 'Barbarian', giant: 'Giant', goblin: 'Goblin' };
    var WANTS = { barbarian: 'the nearest building', giant: 'the nearest defense', goblin: 'the nearest resource building' };

    function render() {
      var routes = P.routes[state.troop];
      clear(v.L.under); clear(v.L.over); clear(v.L.pts); clear(v.L.hits);
      routes.forEach(function (r, i) {
        svg('polyline', { class: 'route faint', points: [r.s].concat(r.p).map(function (p) { return p[0] + ',' + p[1]; }).join(' ') }, v.L.under);
        var dot = svg('circle', { class: 'start', cx: r.s[0], cy: r.s[1], r: i === state.i ? 0.42 : 0.18, opacity: i === state.i ? 1 : 0.45 }, v.L.pts);
        var hit = svg('circle', { class: 'hit', cx: r.s[0], cy: r.s[1], r: 0.9 }, v.L.hits);
        hit.addEventListener('pointerenter', function () { state.i = i; render(); });
        hit.addEventListener('click', function () { state.i = i; render(); });
        void dot;
      });
      var r = routes[state.i];
      var t = layout[r.t];
      svg('rect', { class: 'tgt', x: t[1] - 0.1, y: t[2] - 0.1, width: t[3] + 0.2, height: t[3] + 0.2, rx: 0.3 }, v.L.over);
      svg('polyline', { class: 'route', points: [r.s].concat(r.p).map(function (p) { return p[0] + ',' + p[1]; }).join(' ') }, v.L.over);
      var crossed = 0;
      r.p.forEach(function (p) {
        var key = Math.floor(p[0]) + ',' + Math.floor(p[1]);
        if (walls[key]) { crossed++; svg('rect', { class: 'breach', x: Math.floor(p[0]) + 0.05, y: Math.floor(p[1]) + 0.05, width: 0.9, height: 0.9 }, v.L.over); }
      });
      var through = routes.filter(function (x) { return x.walls > 0; }).length;
      head.textContent = LABEL[state.troop] + ' heads for ' + WANTS[state.troop] + '. ' + through + ' of ' + routes.length + ' starting points route through a wall.';
      note.textContent = 'From this point: ' + r.p.length + ' waypoints to the ' + (NAMES[t[0]] || t[0]) + (crossed ? ', breaking ' + crossed + (crossed === 1 ? ' wall' : ' walls') + ' on the way.' : ', around every wall.') + ' ' + POINT + ' another dot on the edge.';
    }
    var troopTabs = tabs('Troop', [['barbarian', 'Barbarian'], ['giant', 'Giant'], ['goblin', 'Goblin']], state.troop, function (t) { state.troop = t; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [troopTabs.el]));
    body.appendChild(h('div', { class: 'two' }, [
      h('div', { class: 'col' }, [v.el, note]),
      h('div', { class: 'col' }, [head, legend(BUILDING_LEGEND), legend([['Route', 'var(--accent)'], ['Wall it breaks', 'var(--q-blunder, #dc2626)']])]),
    ]));
    render();
    fig.coc = { set: function (o) { if (o.troop) troopTabs.set(o.troop); if (o.start !== undefined) { state.i = Number(o.start); render(); } } };
  }

  // =========================================================================
  // One army against twelve villages
  // =========================================================================
  function sweep(fig, data) {
    var body = mount(fig);
    var S = data.sweep;
    var W = 640, H = 220, P = { l: 36, r: 8, t: 12, b: 30 };
    var n = data.villages.length;
    var chart = svg('svg', { class: 'sweep', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Destruction by village for three armies' });
    var cw = (W - P.l - P.r) / n;
    var gx = function (i) { return P.l + cw * (i + 0.5); };
    var gy = function (d) { return P.t + (H - P.t - P.b) * (1 - d / 100); };
    [0, 50, 100].forEach(function (d) {
      svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: gy(d), y2: gy(d) }, chart);
      svg('text', { x: P.l - 6, y: gy(d) + 3.5, 'text-anchor': 'end' }, chart).textContent = d + '%';
    });
    var bars = [];
    for (var i = 0; i < n; i++) {
      bars.push(svg('rect', { class: 'bar', x: P.l + cw * i + 2, y: P.t, width: cw - 4, height: H - P.t - P.b, rx: 3, opacity: 0 }, chart));
      svg('text', { x: gx(i), y: H - 12, 'text-anchor': 'middle' }, chart).textContent = String(i + 1);
    }
    svg('text', { x: W - P.r, y: H - 1, 'text-anchor': 'end' }, chart).textContent = 'village, easiest to hardest';
    S.forEach(function (a, ai) {
      var pts = a.results.map(function (r, i) { return gx(i).toFixed(1) + ',' + gy(r.destruction).toFixed(1); });
      svg('polyline', { class: 'ln a' + ai, points: pts.join(' ') }, chart);
      a.results.forEach(function (r, i) { svg('circle', { class: 'dt a' + ai, cx: gx(i), cy: gy(r.destruction), r: 3 }, chart); });
    });
    var side = h('div', { class: 'sweep-side' });
    var thumb = h('div');
    var info = h('div');
    side.appendChild(thumb);
    side.appendChild(info);
    function select(i) {
      bars.forEach(function (b, j) { b.setAttribute('opacity', j === i ? '1' : '0'); b.setAttribute('class', j === i ? 'bar on' : 'bar'); });
      clear(thumb);
      var vv = makeVillage(data.villages[i].layout, data.villages[i].name, 1.2);
      thumb.appendChild(vv.el);
      clear(info);
      info.appendChild(h('div', { class: 'sweep-name' }, [(i + 1) + '. ' + data.villages[i].name, h('small', { text: data.villages[i].difficulty + ' · ' + data.villages[i].layout.filter(function (b) { return DEF[b[0]]; }).length + ' defenses, ' + data.villages[i].layout.filter(function (b) { return b[0] === 'wall'; }).length + ' walls' })]));
      var tb = h('tbody');
      S.forEach(function (a, ai) {
        var r = a.results[i];
        tb.appendChild(h('tr', {}, [
          h('td', {}, [h('span', { class: 'swatch', style: 'background:' + ['var(--fg-3)', 'var(--fg)', 'var(--accent)'][ai] }), a.name]),
          h('td', { class: 'r' }, [stars(r.stars)]),
          h('td', { class: 'r', text: r.destruction + '%' }),
          h('td', { class: 'r', text: r.seconds.toFixed(0) + ' s' + (r.ended ? '*' : '') }),
        ]));
      });
      info.appendChild(h('table', {}, [tb]));
    }
    for (var j = 0; j < n; j++) (function (j) {
      var hit = svg('rect', { class: 'hit', x: P.l + cw * j, y: 0, width: cw, height: H }, chart);
      hit.addEventListener('pointerenter', function () { select(j); });
      hit.addEventListener('click', function () { select(j); });
    })(j);
    body.appendChild(chart);
    body.appendChild(legend(S.map(function (a, ai) { return [a.name + ': ' + Object.keys(a.army).map(function (k) { return a.army[k] + ' ' + troopName(data, k); }).join(', ') + ', level ' + a.level, ['var(--fg-3)', 'var(--fg)', 'var(--accent)'][ai]]; })));
    body.appendChild(side);
    select(5);
    fig.coc = { set: function (o) { if (o.village !== undefined) select(Number(o.village)); } };
  }
  function troopName(data, key) {
    var map = { swordsman: 'Barbarians', archer: 'Archers', giant: 'Giants', wizard: 'Wizards', balloon: 'Balloons', dragon: 'Dragons', wallbreaker: 'Wall Breakers' };
    return map[key] || key;
  }

  // =========================================================================
  // The same raid at two step sizes
  // =========================================================================
  function determinism(fig, data) {
    var body = mount(fig);
    var T = data.determinism;
    var layout = data.villages[T.index].layout;
    var fine = decodeRun(T.fine, 0.4), coarse = decodeRun(T.coarse, 0.8);
    var a = makeVillage(layout, 'The raid stepped every 0.05 s');
    var b = makeVillage(layout, 'The same raid stepped every 0.1 s');
    var capA = h('p', { class: 'cap' }), capB = h('p', { class: 'cap' });
    var end = Math.max(fine.seconds, coarse.seconds);
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', max: String(end), step: '0.05', 'aria-label': 'Battle time' });
    var clock = player(function (t) { show(t); }, function () { return end; });
    slider.addEventListener('input', function () { clock.stop(); clock.seek(Number(slider.value)); });
    function show(t) {
      var sa = drawBattle(a, fine, Math.min(t, fine.seconds), { trails: 'a' });
      var sb = drawBattle(b, coarse, Math.min(t, coarse.seconds), { trails: 'b' });
      slider.value = String(t);
      counter.textContent = t.toFixed(1) + ' s';
      capA.innerHTML = '';
      capA.appendChild(h('b', { text: 'Every 0.05 s' }));
      capA.appendChild(document.createTextNode(': ' + sa.destruction + '%' + (t >= fine.seconds ? ', done at ' + T.fine.seconds + ' s' : '')));
      capB.innerHTML = '';
      capB.appendChild(h('b', { text: 'Every 0.1 s' }));
      capB.appendChild(document.createTextNode(': ' + sb.destruction + '%' + (t >= coarse.seconds ? ', done at ' + T.coarse.seconds + ' s' : '')));
    }
    var facts = h('dl', { class: 'facts' });
    [
      ['Steps', T.fine.ticks + ' against ' + T.coarse.ticks],
      ['Battle length', T.fine.seconds + ' s against ' + T.coarse.seconds + ' s'],
      ['Final state hash', h('code', { text: T.fine.hash + ' / ' + T.coarse.hash })],
      ['Same input, run again', T.rerunHash === T.fine.hash ? 'identical' : 'differs'],
      ['Replayed from the recording', T.replayHash === T.fine.hash ? 'identical' : 'differs'],
      ['Recording', T.replay.actions + ' actions, ' + T.replay.steps + ' step sizes, ' + (T.replay.bytes / 1024).toFixed(1) + ' KB'],
    ].forEach(function (r) { facts.appendChild(h('div', {}, [h('dt', { text: r[0] }), h('dd', {}, [r[1]])])); });
    body.appendChild(h('div', { class: 'pair' }, [h('div', {}, [a.el, capA]), h('div', {}, [b.el, capB])]));
    body.appendChild(h('div', { class: 'transport', style: 'margin-top:12px' }, [clock.button, slider, counter]));
    body.appendChild(facts);
    show(0);
    fig.coc = { set: function (o) { if (o.time !== undefined) { clock.stop(); clock.seek(Number(o.time)); } } };
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    var ids = ['coc-raid', 'coc-paths', 'coc-sweep', 'coc-det'];
    var figs = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!figs.length) return;
    fetch(figs[0].getAttribute('data-src')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var builders = { 'coc-raid': raid, 'coc-paths': paths, 'coc-sweep': sweep, 'coc-det': determinism };
      figs.forEach(function (fig) { builders[fig.id](fig, data); });
    }, function (err) {
      figs.forEach(function (fig) {
        mount(fig).appendChild(h('p', { class: 'fig-loading', text: 'The figure data did not load (' + err.message + ').' }));
      });
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.act');
    if (!a) return;
    var fig = document.querySelector(a.getAttribute('href'));
    if (!fig || !fig.coc) return;
    e.preventDefault();
    fig.coc.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) fig.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
