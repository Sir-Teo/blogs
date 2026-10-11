// Figures for "Putting a trading desk behind a dashboard".
//
// Everything drawn here came out of FinOS-AgentLab's own code, run offline
// (see _tools/finos-agentlab-demo): the desk's graph as its runner builds it,
// the 22 desk runs its static export recorded, the copilot's routed tool
// payload and prompt rungs, a week on its scheduler, and its scripted eval
// suite. Saved to /assets/data/finos-agentlab-demo.json; nothing here calls
// a model.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  function text(parent, x, y, s, cls, anchor) {
    var t = svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor }, parent);
    t.textContent = s;
    return t;
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function kb(bytes) { return bytes >= 10000 ? (bytes / 1000).toFixed(0) + ' KB' : bytes >= 1000 ? (bytes / 1000).toFixed(1) + ' KB' : bytes + ' B'; }
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
  function legend(items) {
    var el = h('div', { class: 'legend' });
    items.forEach(function (it) {
      var sw = h('i', { class: it[2] || '' });
      sw.style.background = it[0];
      el.appendChild(h('span', {}, [sw, it[1]]));
    });
    return el;
  }
  function mount(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }
  function loadData(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function marker(defs, id, cls) {
    var m = svg('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
    svg('path', { class: cls, d: 'M0,1 L9,5 L0,9 z' }, m);
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  // Runs fn once when el is first half on screen.
  function onView(el, fn, threshold) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.45 });
    io.observe(el);
  }
  // A cancellable timeline: each item gets fn(p) with p eased from 0 to 1
  // between its own start and end, in milliseconds from the start.
  function timeline() {
    var raf = null;
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
    function run(items, done) {
      stop();
      var end = 0;
      items.forEach(function (it) { it.p = -1; end = Math.max(end, it.at + (it.dur || 0)); });
      if (REDUCE) { items.forEach(function (it) { it.fn(1); }); if (done) done(); return; }
      items.forEach(function (it) { it.p = 0; it.fn(0); });
      var t0 = null;
      function tick(now) {
        if (t0 === null) t0 = now;
        var t = now - t0;
        items.forEach(function (it) {
          var p = it.dur ? Math.max(0, Math.min(1, (t - it.at) / it.dur)) : (t >= it.at ? 1 : 0);
          if (p !== it.p) { it.p = p; it.fn(it.linear ? p : ease(p)); }
        });
        if (t < end) raf = requestAnimationFrame(tick);
        else { raf = null; if (done) done(); }
      }
      raf = requestAnimationFrame(tick);
    }
    return { run: run, stop: stop };
  }

  // ---- The desk -------------------------------------------------------------
  // The vertical layout of TradingAgents' graph: one row per stage.
  var ROWS = [
    ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst', 'Memory Log'],
    ['Bull Researcher', 'Bear Researcher'],
    ['Research Manager'],
    ['Trader'],
    ['Aggressive Analyst', 'Conservative Analyst', 'Neutral Analyst'],
    ['Portfolio Manager'],
  ];
  var STAGE = {
    'Market Analyst': 'analyst', 'Sentiment Analyst': 'analyst', 'Social Analyst': 'analyst', 'News Analyst': 'analyst',
    'Fundamentals Analyst': 'analyst', 'Memory Log': 'analyst', 'Bull Researcher': 'research', 'Bear Researcher': 'research',
    'Research Manager': 'research', 'Trader': 'trader', 'Aggressive Analyst': 'risk', 'Conservative Analyst': 'risk',
    'Neutral Analyst': 'risk', 'Risk Judge': 'decision', 'Portfolio Manager': 'decision', 'Decision': 'decision',
  };
  // Names the older runner used for the same nodes.
  var ALIAS = { 'Risk Judge': 'Portfolio Manager', 'Social Analyst': 'Sentiment Analyst' };
  var ANALYST = { market: 'Market Analyst', social: 'Sentiment Analyst', news: 'News Analyst', fundamentals: 'Fundamentals Analyst' };
  // After the analysts, the path TradingAgents' conditional edges take with one
  // round of each debate: bull, bear, manager, trader; aggressive,
  // conservative, neutral, then the judge.
  var AFTER = ['Bull Researcher', 'Bear Researcher', 'Research Manager', 'Trader', 'Aggressive Analyst', 'Conservative Analyst', 'Neutral Analyst', 'Portfolio Manager'];
  function errLabel(msg) {
    return msg.indexOf('cancelled') >= 0 ? 'cancelled' : msg.indexOf('restarted') >= 0 ? 'server restarted'
      : msg.indexOf('stalled') >= 0 ? 'stalled 600 s' : msg.indexOf('NoMarketData') >= 0 ? 'stale data'
      : msg.indexOf('JSON') >= 0 ? 'bad JSON' : 'exited';
  }

  // Where one recorded run went in the graph: the steps it took, what each
  // node streamed, which nodes ran without streaming, and where it stopped.
  function trace(r) {
    var by = {}, total = 0;
    r.events.forEach(function (e) {
      if (e.k === 'error') return;
      total += e.b;
      if (e.k !== 'decision') by[ALIAS[e.a] || e.a] = e;
    });
    var analysts = r.analysts.map(function (a) { return ANALYST[a]; }).filter(Boolean);
    var steps = [analysts].concat(AFTER.map(function (n) { return [n]; }));
    var last = -1;
    steps.forEach(function (s, i) { if (s.some(function (n) { return by[n]; })) last = i; });
    var errors = r.events.filter(function (e) { return e.k === 'error'; });
    var stop = -1;
    if (errors.length) {
      for (var i = 0; i < steps.length; i++) if (!steps[i].every(function (n) { return by[n]; })) { stop = i; break; }
    }
    var state = {}, stepOf = {};
    steps.forEach(function (s, i) {
      s.forEach(function (n) {
        stepOf[n] = i;
        if (by[n]) state[n] = by[n].junk ? 'junk' : 'lit';
        else if (i === stop) state[n] = 'dead';
        else if (i < last) state[n] = 'silent';
      });
    });
    ['Market Analyst', 'Sentiment Analyst', 'News Analyst', 'Fundamentals Analyst'].forEach(function (n) {
      if (analysts.indexOf(n) < 0) state[n] = 'off';
    });
    // Hops between consecutive steps, as far as the run got.
    var reach = Math.max(last, stop), hops = [];
    for (var k = 1; k <= reach; k++) {
      steps[k - 1].forEach(function (a) {
        steps[k].forEach(function (b) {
          if (state[a] !== 'dead') hops.push({ a: a, b: b, step: k });
        });
      });
    }
    return { by: by, total: total, steps: steps, last: last, stop: stop, reach: reach, state: state, stepOf: stepOf, hops: hops, error: errors[0] };
  }

  function firm(fig, data) {
    var body = mount(fig);
    var graph = data.graph, runs = data.runs.runs, maxEvent = data.runs.summary.largest_event;
    var W = 840, BW = 128, BH = 38, ROWY = [26, 100, 174, 248, 322, 396], GH = 446;
    var pos = {};
    ROWS.forEach(function (row, r) {
      // Debating voices sit further apart, so the arrows between them read.
      var GAP = row.length > 3 ? 14 : 40;
      var total = row.length * BW + (row.length - 1) * GAP, x0 = (W - total) / 2;
      row.forEach(function (name, i) {
        var x = x0 + i * (BW + GAP);
        pos[name] = { x: x, y: ROWY[r], cx: x + BW / 2, cy: ROWY[r] + BH / 2 };
      });
    });
    runs.forEach(function (r) { r.t = trace(r); });
    var finished = runs.filter(function (r) { return r.action; }).length;

    var top = h('div', { class: 'fig-controls' });
    top.appendChild(legend([
      ['var(--s-analyst)', 'analysts'], ['var(--s-research)', 'research'], ['var(--s-trader)', 'trader'],
      ['var(--s-risk)', 'risk'], ['var(--s-decision)', 'decision'], ['var(--bad)', 'a classifier’s verdict'],
      ['transparent', 'ran, streamed nothing', 'dashed'],
    ]));
    body.appendChild(top);

    var pane = h('div', { class: 'pan' });
    body.appendChild(pane);
    var el = svg('svg', { class: 'chart firm', viewBox: '0 0 ' + W + ' ' + GH, role: 'img',
      'aria-label': 'TradingAgents ' + graph.version + ': the analysts fan out from the start and meet at the researchers, whose debate loops; the research manager hands to the trader, three risk voices debate, and the portfolio manager decides.' }, pane);
    var defs = svg('defs', {}, el);
    marker(defs, 'firm-arrow', 'head');
    marker(defs, 'firm-arrow-on', 'head on');

    // Edges, keyed "from>to"; a debate pair shares one line drawn both ways.
    var edges = svg('g', {}, el), edgeOf = {};
    var seen = {};
    graph.edges.forEach(function (e) {
      var s = pos[e[0]], t = pos[e[1]];
      if (!s || !t) return;
      var cls = 'e' + (e[2] ? ' cond' : ''), path;
      if (e[0] === e[1]) {
        // A voice that may speak again: a small loop off the box's lower
        // right corner, clear of the arrows to its neighbours.
        var lx = s.x + BW, ly = s.y + BH;
        svg('path', { class: 'e cond', d: 'M' + (lx + 1) + ' ' + (ly - 9) + ' c 14 0 14 22 -9 10', 'marker-end': 'url(#firm-arrow)' }, edges);
        return;
      }
      if (s.y === t.y) {
        var key = [e[0], e[1]].sort().join('|');
        if (seen[key]) { edgeOf[e[0] + '>' + e[1]] = { path: seen[key].path, rev: seen[key].left !== e[0] }; return; }
        var left = s.x < t.x ? s : t, right = s.x < t.x ? t : s;
        var leftName = s.x < t.x ? e[0] : e[1];
        if (Math.abs(left.x - right.x) > BW * 1.5) {
          // The outer pair of three arcs over the middle box.
          path = svg('path', { class: cls, d: 'M' + (left.cx + 20) + ' ' + left.y + ' C ' + (left.cx + 40) + ' ' + (left.y - 20) + ', ' + (right.cx - 40) + ' ' + (right.y - 20) + ', ' + (right.cx - 20) + ' ' + right.y }, edges);
        } else {
          path = svg('path', { class: cls, d: 'M' + (left.x + BW + 1) + ' ' + left.cy + ' H' + (right.x - 1) }, edges);
        }
        path.setAttribute('marker-start', 'url(#firm-arrow)');
        path.setAttribute('marker-end', 'url(#firm-arrow)');
        seen[key] = { path: path, left: leftName };
        edgeOf[e[0] + '>' + e[1]] = { path: path, rev: leftName !== e[0] };
        return;
      }
      var y1 = s.y + BH + 1, y2 = t.y - 1;
      path = svg('path', { class: cls, d: 'M' + s.cx + ' ' + y1 + ' C ' + s.cx + ' ' + (y1 + 22) + ', ' + t.cx + ' ' + (y2 - 22) + ', ' + t.cx + ' ' + y2, 'marker-end': 'url(#firm-arrow)' }, edges);
      edgeOf[e[0] + '>' + e[1]] = { path: path, rev: false };
    });
    text(el, W - 4, ROWY[0] + 22, 'in parallel', 'lbl', 'end');
    text(el, W - 4, ROWY[1] + 22, 'debate', 'lbl', 'end');
    text(el, W - 4, ROWY[4] + 22, 'debate', 'lbl', 'end');

    var nodes = {};
    graph.nodes.forEach(function (name, k) {
      var p = pos[name];
      var g = svg('g', { class: 'ng' }, el);
      var box = svg('rect', { class: 'node', x: p.x, y: p.y, width: BW, height: BH, rx: 5 }, g);
      // The stage's colour as the box's left edge, following its rounded corners.
      var clip = svg('clipPath', { id: 'firm-clip-' + k }, defs);
      svg('rect', { x: p.x, y: p.y, width: BW, height: BH, rx: 5 }, clip);
      var sw = svg('rect', { x: p.x, y: p.y, width: 3, height: BH, class: 'sw', 'clip-path': 'url(#firm-clip-' + k + ')' }, g);
      sw.style.fill = 'var(--s-' + (STAGE[name] || 'analyst') + ')';
      var t = text(g, p.cx + 1, p.y + 14, name, 'nt dim', 'middle');
      var sub = text(g, p.cx + 1, p.y + 27, '', 'ns', 'middle');
      // A hairline of the node's bytes against the longest turn on record.
      var track = svg('rect', { class: 'track', x: p.x + 10, y: p.y + BH - 5, width: BW - 20, height: 1.5 }, g);
      var bar = svg('rect', { class: 'bytes', x: p.x + 10, y: p.y + BH - 5, width: 0, height: 1.5 }, g);
      bar.style.fill = 'var(--s-' + (STAGE[name] || 'analyst') + ')';
      nodes[name] = { g: g, box: box, t: t, sub: sub, bar: bar, track: track };
      g.addEventListener('mouseenter', function () { focusNode(name); });
      g.addEventListener('mouseleave', function () { focusNode(null); });
    });

    // The classifier's verdict, quoted beside the bull researcher.
    var bull = pos['Bull Researcher'];
    var said = svg('g', { class: 'said' }, el);
    var saidLine = svg('path', { class: 'said-l', d: 'M' + (bull.x - 4) + ' ' + bull.cy + ' h-12' }, said);
    var saidText = svg('text', { x: bull.x - 20, y: bull.cy, 'text-anchor': 'end' }, said);

    // The outcome, beside the portfolio manager.
    var pm = pos['Portfolio Manager'];
    var out = svg('g', { class: 'out' }, el);
    var outBig = text(out, pm.x + BW + 18, pm.cy, '', 'ob', 'start');
    var outSmall = text(out, pm.x + BW + 18, pm.cy + 15, '', 'os', 'start');
    var pulses = svg('g', {}, el);

    // ---- the recorded runs, each event a block sized by its bytes
    var RH = 15, LW = 118, RW = W - LW - 60, maxBytes = 0;
    runs.forEach(function (r) { maxBytes = Math.max(maxBytes, r.t.total); });
    var scale = RW / maxBytes;
    var HEAD = 26, RSH = HEAD + runs.length * RH + 6;
    var rel = svg('svg', { class: 'runs', viewBox: '0 0 ' + W + ' ' + RSH, role: 'img', 'aria-label': 'The ' + runs.length + ' recorded desk runs, each event a block sized by its bytes.' }, pane);
    rel.style.marginTop = '10px';
    svg('line', { class: 'scale', x1: LW, y1: 9, x2: LW + 10000 * scale, y2: 9 }, rel);
    svg('line', { class: 'scale', x1: LW, y1: 6, x2: LW, y2: 12 }, rel);
    svg('line', { class: 'scale', x1: LW + 10000 * scale, y1: 6, x2: LW + 10000 * scale, y2: 12 }, rel);
    text(rel, LW + 10000 * scale + 6, 12, '10 KB', '', 'start');
    var tally = {};
    runs.forEach(function (r) { var k = r.action || 'none'; tally[k] = (tally[k] || 0) + 1; });
    text(rel, W - 4, 12, runs.length + ' runs · ' + finished + ' decided · ' + (runs.length - finished) + ' did not', 'tally', 'end');
    var rowEls = [], lastDate = null;
    runs.forEach(function (r, i) {
      var y = HEAD + i * RH;
      var row = svg('rect', { class: 'row', x: 0, y: y, width: W, height: RH }, rel);
      var lab = text(rel, 4, y + 11, r.symbol, 'sym', 'start');
      if (r.date !== lastDate) text(rel, 52, y + 11, r.date.slice(5), 'date', 'start');
      lastDate = r.date;
      var x = LW, blocks = [];
      r.events.forEach(function (e) {
        if (e.k === 'error') {
          var g = svg('g', { class: 'errg' }, rel);
          svg('rect', { class: 'err', x: x + 2, y: y + 3.5, width: 8, height: RH - 7, rx: 1.5 }, g);
          var label = text(g, x + 15, y + 11, errLabel(e.msg), 'errl', 'start');
          blocks.push({ el: g, err: true, step: r.t.stop >= 0 ? r.t.stop : r.t.reach + 1 });
          x += 15 + label.getComputedTextLength() + 8;
          return;
        }
        var w = Math.max(3, e.b * scale);
        var stage = e.junk ? 'junk' : (STAGE[e.a] || 'analyst');
        var b = svg('rect', { class: 'blk ' + stage, x: x, y: y + 2, width: w, height: RH - 4 }, rel);
        var node = e.k === 'decision' ? 'Portfolio Manager' : (ALIAS[e.a] || e.a);
        blocks.push({ el: b, w: w, node: node, step: r.t.stepOf[node] !== undefined ? r.t.stepOf[node] : r.t.reach });
        if (e.junk) svg('line', { class: 'junkmark', x1: x + 1.5, y1: y - 0.5, x2: x + 1.5, y2: y + RH + 0.5 }, rel);
        x += w;
      });
      var act = r.action ? text(rel, x + 6, y + 11, r.action, 'act', 'start') : null;
      rowEls.push({ row: row, lab: lab, blocks: blocks, act: act });
      row.addEventListener('mouseenter', function () { if (!state.playing) show(i); });
      row.addEventListener('click', function () { select(i, true); });
    });
    rel.addEventListener('mouseleave', function () { if (!state.playing) show(state.i); });
    var note = h('p', { class: 'fig-note readout' });
    body.appendChild(note);
    var state = { i: 0 };
    var tl = timeline();

    function readout(r) {
      clear(note);
      note.appendChild(h('b', { text: r.symbol }));
      var bits = [r.date];
      if (r.t.total) bits.push(r.events.filter(function (e) { return e.k !== 'error' && e.k !== 'decision'; }).length + ' turns', kb(r.t.total));
      if (r.action) {
        var parsed = r.events.filter(function (e) { return e.k === 'decision'; })[0];
        bits.push(r.action + (parsed && parsed.parsed === r.action ? ', parse_action agrees' : ''));
      }
      if (r.t.error) bits.push(r.events.filter(function (e) { return e.k === 'error'; }).map(function (e) { return e.msg.replace(/\s+/g, ' '); }).join('; '));
      note.appendChild(document.createTextNode('  ' + bits.join(' · ')));
    }
    function paintNode(name, r, p) {
      var n = nodes[name], st = r.t.state[name] || '', ev = r.t.by[name];
      n.box.setAttribute('class', 'node' + (p > 0 && st ? ' ' + st : '') + (st === 'off' ? ' off' : ''));
      n.g.setAttribute('class', 'ng' + (st === 'off' ? ' off' : ''));
      n.t.setAttribute('class', 'nt' + (p > 0 && (st === 'lit' || st === 'junk') ? '' : ' dim'));
      n.sub.textContent = ev && p > 0 ? kb(ev.b) : '';
      n.sub.setAttribute('class', 'ns' + (st === 'junk' ? ' bad' : ''));
      n.bar.setAttribute('width', ev ? Math.max(1.5, (BW - 20) * Math.min(1, ev.b / maxEvent) * p) : 0);
      n.bar.style.fill = st === 'junk' ? 'var(--bad)' : 'var(--s-' + (STAGE[name] || 'analyst') + ')';
      n.track.setAttribute('class', 'track' + (ev && p > 0 ? ' on' : ''));
    }
    // A travelled edge darkens, its arrowheads with it.
    function lightEdge(path, on) {
      path.classList.toggle('on', on);
      ['marker-start', 'marker-end'].forEach(function (m) {
        if (path.hasAttribute(m)) path.setAttribute(m, on ? 'url(#firm-arrow-on)' : 'url(#firm-arrow)');
      });
    }
    function paintEdges(r, upTo) {
      var on = new Set();
      r.t.hops.forEach(function (hp) {
        var e = edgeOf[hp.a + '>' + hp.b];
        if (e && hp.step <= upTo) on.add(e.path);
      });
      Object.keys(edgeOf).forEach(function (k) { lightEdge(edgeOf[k].path, on.has(edgeOf[k].path)); });
    }
    function paintSaid(r, p) {
      var junk = r.t.by['Bull Researcher'] && r.t.by['Bull Researcher'].junk ? r.t.by['Bull Researcher'] : null;
      clear(saidText);
      said.style.opacity = junk ? p : 0;
      if (!junk) return;
      var lines = junk.said.split('\n');
      lines.forEach(function (ln, i) {
        var ts = svg('tspan', { x: bull.x - 20, dy: i === 0 ? (lines.length === 1 ? '0.35em' : (0.35 - 0.6 * (lines.length - 1)) + 'em') : '1.2em' }, saidText);
        ts.textContent = (i === 0 ? '“' : '') + ln + (i === lines.length - 1 ? '”' : '');
      });
    }
    function paintOut(r, p) {
      out.style.opacity = p;
      outBig.setAttribute('class', 'ob' + (r.action ? '' : ' bad'));
      outBig.textContent = r.action || (r.t.error ? '× ' + errLabel(r.t.error.msg) : '');
      var parsed = r.events.filter(function (e) { return e.k === 'decision'; })[0];
      outSmall.textContent = parsed ? 'parse_action: ' + parsed.parsed : '';
      // The call and the parser's reading as a pair, centred on the box.
      outBig.setAttribute('y', parsed ? pm.cy - 6 : pm.cy);
    }
    function paintRow(i, p) {
      rowEls.forEach(function (o, k) {
        o.row.setAttribute('class', 'row' + (k === state.i ? ' on' : ''));
        o.lab.setAttribute('class', 'sym' + (k === state.i ? ' on' : ''));
      });
    }
    // Draws run i at once: hover previews, selection settles.
    function show(i) {
      var r = runs[i];
      tl.stop();
      state.playing = false;
      clear(pulses);
      graph.nodes.forEach(function (n) { paintNode(n, r, 1); });
      paintEdges(r, Infinity);
      paintSaid(r, 1);
      paintOut(r, 1);
      rowEls.forEach(function (o, k) {
        o.row.setAttribute('class', 'row' + (k === state.i ? ' on' : '') + (k === i && k !== state.i ? ' peek' : ''));
        o.lab.setAttribute('class', 'sym' + (k === i ? ' on' : ''));
        o.blocks.forEach(function (b) { if (b.err) b.el.style.opacity = 1; else b.el.setAttribute('width', b.w); });
        if (o.act) o.act.style.opacity = 1;
      });
      readout(r);
    }
    // Replays run i through the graph: the hops in order, each node lighting
    // as its turn arrives, the run's row filling with it. Order only; the
    // recording has no timings.
    function select(i, animate) {
      state.i = i;
      show(i);
      if (!animate || REDUCE) return;
      var r = runs[i], STEP = 340, items = [];
      clear(pulses);
      graph.nodes.forEach(function (n) {
        var st = r.t.state[n], step = r.t.stepOf[n];
        if (!st || st === 'off' || step === undefined) return;
        items.push({ at: step * STEP + (step ? STEP * 0.55 : 0), dur: STEP * 0.6, fn: function (p) { paintNode(n, r, p); } });
      });
      items.push({ at: 0, dur: (r.t.reach + 1) * STEP, linear: true, fn: function (p) { paintEdges(r, p * (r.t.reach + 1) - 0.45); } });
      r.t.hops.forEach(function (hp) {
        var e = edgeOf[hp.a + '>' + hp.b];
        if (!e) return;
        var dot = null, len = e.path.getTotalLength();
        items.push({ at: (hp.step - 1) * STEP + STEP * 0.45, dur: STEP * 0.75, fn: function (p) {
          if (p <= 0 || p >= 1) { if (dot) { dot.remove(); dot = null; } return; }
          if (!dot) dot = svg('circle', { class: 'pulse' + (r.t.state[hp.b] === 'dead' ? ' bad' : ''), r: 3 }, pulses);
          var pt = e.path.getPointAtLength(len * (e.rev ? 1 - p : p));
          dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        } });
      });
      var bullStep = r.t.stepOf['Bull Researcher'];
      items.push({ at: bullStep * STEP + STEP * 0.8, dur: STEP, fn: function (p) { paintSaid(r, p); } });
      var end = (r.t.reach + 1) * STEP + STEP * 0.4, act = rowEls[i].act;
      items.push({ at: end, dur: STEP, fn: function (p) { paintOut(r, p); if (act) act.style.opacity = p; } });
      rowEls[i].blocks.forEach(function (b) {
        var at = b.step * STEP + (b.step ? STEP * 0.55 : 0);
        if (b.err) items.push({ at: end, dur: STEP * 0.6, fn: function (p) { b.el.style.opacity = p; } });
        else items.push({ at: at, dur: STEP * 0.8, fn: function (p) { b.el.setAttribute('width', b.w * p); } });
      });
      state.playing = true;
      tl.run(items, function () { state.playing = false; });
    }
    // Hovering a node picks out its turns across all 22 runs.
    function focusNode(name) {
      rowEls.forEach(function (o) {
        o.blocks.forEach(function (b) {
          if (b.err) return;
          b.el.classList.toggle('faded', !!name && b.node !== name);
        });
      });
      if (!name) { readout(runs[state.i]); return; }
      var streamed = runs.filter(function (r) { return r.t.by[name]; });
      var ran = runs.filter(function (r) { return r.t.state[name] && r.t.state[name] !== 'off' && r.t.state[name] !== 'dead'; });
      clear(note);
      note.appendChild(h('b', { text: name }));
      var bits = ['streamed in ' + streamed.length + ' of ' + runs.length + ' runs'];
      if (streamed.length) {
        var sizes = streamed.map(function (r) { return r.t.by[name].b; }).sort(function (a, b) { return a - b; });
        bits.push('median ' + kb(sizes[Math.floor(sizes.length / 2)]));
      }
      var silent = runs.filter(function (r) { return r.t.state[name] === 'silent'; }).length;
      if (silent) bits.push('ran without streaming in ' + silent);
      note.appendChild(document.createTextNode('  ' + bits.join(' · ')));
    }
    fig.fa = {
      set: function (o) {
        if (o.run) {
          var i = runs.map(function (r) { return r.id; }).indexOf(o.run);
          if (i >= 0) select(i, true);
        }
      },
    };
    // Open on the run whose bull case is the shortest classifier's verdict,
    // and play it once when the figure comes into view.
    var junkRun = 0, junkBytes = Infinity;
    runs.forEach(function (r, i) {
      r.events.forEach(function (e) { if (e.junk && e.b < junkBytes) { junkBytes = e.b; junkRun = i; } });
    });
    select(junkRun, false);
    onView(el, function () { if (state.i === junkRun) select(junkRun, true); });
  }

  // ---- What a turn carries ----------------------------------------------------
  function payload(fig, data) {
    var body = mount(fig);
    var d = data.copilot, pages = d.pages, prompt = d.rungs.system;
    // Questions that route the same tools on every page as an earlier one add nothing.
    var qs = [];
    d.questions.forEach(function (q, i) {
      var sig = d.combos.filter(function (c) { return c.q === i; }).map(function (c) {
        return c.tools.map(function (t) { return t[0]; }).sort().join(',');
      }).join('|');
      if (!qs.some(function (o) { return o.sig === sig; })) qs.push({ i: i, text: q, sig: sig });
    });
    function combo(q, p) { return d.combos.filter(function (c) { return c.q === q && c.p === p; })[0]; }
    var W = 800, LW = 96, RIGHT = 128, RW = W - LW - RIGHT, RH = 25, top = 30;
    var maxX = 0;
    qs.forEach(function (o) { pages.forEach(function (_, p) { maxX = Math.max(maxX, prompt + combo(o.i, p).chars); }); });
    d.ceilings.forEach(function (c) { if (c) maxX = Math.max(maxX, c); });
    var scale = RW / (maxX * 1.02);
    var H = top + (pages.length + 1) * RH + 10;

    var ctl = h('div', { class: 'fig-controls' });
    var tb = tabs('Question', qs.map(function (o) { return [o.i, o.text]; }), qs[0].i, function (v) { draw(v, true); });
    tb.el.classList.add('q');
    ctl.appendChild(tb.el);
    body.appendChild(ctl);
    body.appendChild(legend([
      ['var(--r-system)', 'system prompt'], ['color-mix(in srgb, var(--fg) 42%, transparent)', 'the 21 core tools'],
      ['var(--accent)', 'the page’s own group'], ['color-mix(in srgb, var(--accent) 38%, transparent)', 'groups the question’s words trip'], ['var(--bad)', 'the ceiling a test pins'],
    ]));
    var pane = h('div', { class: 'pan' });
    pane.style.marginTop = '14px';
    body.appendChild(pane);
    var el = svg('svg', { class: 'chart pay', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Prompt and tool schema characters per page, each routed tool a block, against each page’s pinned ceiling.' }, pane);
    var note = h('p', { class: 'fig-note readout' });
    body.appendChild(note);
    var gl = svg('g', {}, el);
    [10000, 20000, 30000, 40000].forEach(function (v) {
      if (v * scale > RW) return;
      svg('line', { class: 'gl', x1: LW + v * scale, y1: top - 4, x2: LW + v * scale, y2: H - 6 }, gl);
      text(gl, LW + v * scale, top - 10, (v / 1000) + 'k' + (v === 10000 ? ' chars' : ''), '', 'middle');
    });

    // The whole catalogue, unrouted, runs off the chart.
    var y0 = top;
    text(el, LW - 8, y0 + 16, 'unrouted', 'pl dim', 'end');
    var allEnd = LW + RW + 12;
    svg('rect', { class: 'bar all', x: LW, y: y0 + 6, width: allEnd - LW, height: RH - 12 }, el);
    svg('path', { class: 'brk', d: 'M' + (allEnd - 7) + ' ' + (y0 + 3) + ' l4 ' + (RH - 6) + ' M' + (allEnd - 2) + ' ' + (y0 + 3) + ' l4 ' + (RH - 6) }, el);
    text(el, allEnd - 14, y0 + 16, 'all ' + d.full.count + ' tools, ' + fmt(prompt + d.full.chars) + ' chars', 'n', 'end');

    var rows = pages.map(function (page, i) {
      var y = top + (i + 1) * RH;
      var g = svg('g', { class: 'prow' }, el);
      var hit = svg('rect', { class: 'hit', x: 0, y: y, width: W, height: RH }, g);
      var lab = text(g, LW - 8, y + 16, page, 'pl', 'end');
      svg('rect', { class: 'bar prompt', x: LW, y: y + 6, width: prompt * scale, height: RH - 12 }, g);
      var blocks = svg('g', {}, g);
      var ceil = d.ceilings[i];
      var gapLine = svg('line', { class: 'gap', y1: y + RH / 2, y2: y + RH / 2 }, g);
      if (ceil) svg('line', { class: 'ceil', x1: LW + ceil * scale, y1: y + 2, x2: LW + ceil * scale, y2: y + RH - 2 }, g);
      var val = text(g, 0, y + 16, '', 'n', 'start');
      var room = text(g, 0, y + 16, '', 'room', 'start');
      var row = { y: y, g: g, blocks: blocks, rects: {}, ceil: ceil, val: val, room: room, gap: gapLine, lab: lab, page: page, i: i };
      hit.addEventListener('mouseenter', function () { describe(row); });
      hit.addEventListener('mouseleave', function () { describe(null); });
      return row;
    });
    var state = { q: qs[0].i }, anim = null;

    function layout(c) {
      // Core first, then the page's group, then what the words trip; each
      // tool's width is its schema's share of the measured total.
      var order = { core: 0, page: 1 };
      var items = c.tools.map(function (t) { return { id: t[0], why: t[1], chars: d.tools[t[0]][1] + 2 }; });
      items.sort(function (a, b) { return (order[a.why] !== undefined ? order[a.why] : 2) - (order[b.why] !== undefined ? order[b.why] : 2) || a.id - b.id; });
      var sum = items.reduce(function (a, it) { return a + it.chars; }, 0), k = c.chars / sum, x = LW + prompt * scale;
      items.forEach(function (it) { it.x = x; it.w = it.chars * k * scale; x += it.w; });
      return { items: items, end: x };
    }
    function draw(q, animate) {
      state.q = q;
      if (anim) anim.stop();
      var tweens = [];
      rows.forEach(function (row) {
        var c = combo(q, row.i), lay = layout(c), keep = {};
        row.c = c;
        lay.items.forEach(function (it) {
          keep[it.id] = true;
          var cls = 'bar ' + (it.why === 'core' ? 'core' : it.why === 'page' ? 'page' : 'intent');
          var r = row.rects[it.id];
          if (!r) {
            r = row.rects[it.id] = { el: svg('rect', { y: row.y + 6, height: RH - 12, x: it.x, width: 0 }, row.blocks), x: it.x, w: 0 };
            r.el.addEventListener('mouseenter', function () { describeTool(row, r); });
          }
          r.el.setAttribute('class', cls);
          r.tool = it;
          tweens.push({ r: r, x0: r.x, w0: r.w, x1: it.x, w1: it.w });
        });
        Object.keys(row.rects).forEach(function (id) {
          if (keep[id]) return;
          var r = row.rects[id];
          delete row.rects[id];
          tweens.push({ r: r, x0: r.x, w0: r.w, x1: r.x, w1: 0, gone: true });
        });
        var total = prompt + c.chars;
        row.total = total;
        // The total sits at the bar's end; the headroom runs as a hairline
        // from it to the ceiling, with the margin past the ceiling.
        row.val.textContent = fmt(total);
        var valW = row.val.getComputedTextLength(), ceilX = row.ceil ? LW + row.ceil * scale : 0;
        var over = row.ceil && total > row.ceil;
        var apart = row.ceil && !over && ceilX - lay.end > valW + 30;
        row.val.setAttribute('x', (apart || !row.ceil || over ? lay.end : ceilX) + 7);
        row.gap.setAttribute('x1', lay.end + valW + 13);
        row.gap.setAttribute('x2', ceilX - 5);
        row.gap.style.display = apart ? '' : 'none';
        if (row.ceil) {
          row.room.textContent = (over ? '+' + fmt(total - row.ceil) + ' over' : fmt(row.ceil - total) + ' under');
          row.room.setAttribute('class', 'room' + (over ? ' over' : ''));
          row.room.setAttribute('x', apart ? ceilX + 7 : Math.max(lay.end, ceilX) + 7 + valW + 6);
        } else row.room.textContent = '';
      });
      function frame(p) {
        tweens.forEach(function (t) {
          t.r.x = t.x0 + (t.x1 - t.x0) * p;
          t.r.w = t.w0 + (t.w1 - t.w0) * p;
          t.r.el.setAttribute('x', t.r.x);
          t.r.el.setAttribute('width', Math.max(0, t.r.w));
          if (p === 1 && t.gone) t.r.el.remove();
        });
      }
      if (animate && !REDUCE) {
        anim = timeline();
        anim.run([{ at: 0, dur: 520, fn: frame }]);
      } else frame(1);
      describe(null);
    }
    function describe(row) {
      var r = row || rows.filter(function (x) { return x.page === '/dashboards'; })[0] || rows[0];
      rows.forEach(function (x) { x.lab.setAttribute('class', 'pl' + (x === r ? ' on' : '')); });
      clear(note);
      var by = {};
      r.c.tools.forEach(function (t) { by[t[1]] = (by[t[1]] || 0) + 1; });
      var parts = Object.keys(by).map(function (g) { return by[g] + (g === 'core' ? ' core' : g === 'page' ? ' for the page' : ' for “' + g + '”'); });
      note.appendChild(h('b', { text: r.page }));
      note.appendChild(document.createTextNode('  ' + r.c.tools.length + ' tools (' + parts.join(', ') + ') · ' + fmt(r.total) + ' chars' + (r.ceil ? ', pinned at ' + fmt(r.ceil) : '')));
    }
    function describeTool(row, r) {
      rows.forEach(function (x) { x.lab.setAttribute('class', 'pl' + (x === row ? ' on' : '')); });
      clear(note);
      var t = r.tool, name = d.tools[t.id][0];
      note.appendChild(h('b', { text: name }));
      note.appendChild(document.createTextNode('  ' + fmt(d.tools[t.id][1]) + ' chars of schema · ' + (t.why === 'core' ? 'core, every turn' : t.why === 'page' ? 'routed for ' + row.page : 'routed by the word group “' + t.why + '”')));
    }
    draw(state.q, false);
    fig.fa = { set: function (o) { if (o.q !== undefined) tb.set(parseInt(o.q, 10)); } };
  }

  // ---- The prompt's rungs -----------------------------------------------------
  function rungs(fig, data) {
    var body = mount(fig);
    var d = data.copilot, r = d.rungs, turns = d.turns;
    var fixed = [['system', r.system], ['commands', r.commands], ['policy', r.policy.agent]];
    var fixedSum = fixed.reduce(function (a, s) { return a + s[1]; }, 0);
    // Each request in both orders: its segments, and how much of it the
    // previous request already began with, byte for byte.
    function requests(order) {
      var hist = 0, prevHist = 0, out = [];
      turns.forEach(function (t, i) {
        var tail = order === 'new'
          ? [['history', hist], ['context', r.context], ['question', t.user]]
          : [['context', r.context], ['history', hist], ['question', t.user]];
        var tailSum = hist + r.context + t.user;
        var cachedTail = i === 0 ? 0 : (order === 'new' ? prevHist : 0);
        out.push({ tail: tail, tailSum: tailSum, cachedTail: cachedTail, cached: i === 0 ? 0 : fixedSum + cachedTail, anew: i === 0 ? fixedSum + tailSum : tailSum - cachedTail });
        prevHist = hist;
        hist += t.user + t.tools + t.assistant;
      });
      return out;
    }
    var R = { new: requests('new'), old: requests('old') };
    function followups(o) { return R[o].slice(1).reduce(function (a, q) { return a + q.anew; }, 0); }

    var W = 680, LW = 52, FW = 128, BRK = 18, RIGHT = 92, RH = 26, top = 40;
    var TX = LW + FW + BRK, TW = W - TX - RIGHT;
    var maxTail = Math.max.apply(null, R.old.map(function (q) { return q.tailSum; }));
    var ts = TW / maxTail, fs = FW / fixedSum;
    var SUMY = top + turns.length * RH + 30, SRH = 22;
    var H = SUMY + 2 * SRH + 8;

    var ctl = h('div', { class: 'fig-controls' });
    var tb = tabs('Order', [['new', 'the order shipped'], ['old', 'the order before it']], 'new', function (v) { draw(v, true); });
    ctl.appendChild(tb.el);
    body.appendChild(ctl);
    body.appendChild(legend([
      ['var(--r-system)', 'system prompt'], ['var(--r-commands)', 'command listing'], ['var(--r-policy)', 'policy'],
      ['var(--r-history)', 'the conversation so far'], ['var(--r-context)', 'context, with its clock'],
      ['var(--bg)', 'the newest question', 'hollow'], ['color-mix(in srgb, var(--ok) 30%, transparent)', 'the previous request, unchanged'], ['transparent', 'sent anew', 'redline'],
    ]));
    var el = svg('svg', { class: 'chart rungs', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Six requests of one conversation: a fixed block of system messages, then the conversation, context and question, with the part identical to the previous request marked, in the order shipped and the order before it.' }, body);
    el.style.marginTop = '14px';

    // Axis: the fixed rungs squeezed into one block, then a break, then the
    // part that moves at a readable scale.
    text(el, LW, top - 22, fmt(fixedSum) + ' chars', 'ax strong', 'start');
    text(el, LW, top - 10, 'identical every turn', 'ax', 'start');
    [0, 1000, 2000].forEach(function (v) {
      if (v * ts > TW) return;
      svg('line', { class: 'gl', x1: TX + v * ts, y1: top - 4, x2: TX + v * ts, y2: top + turns.length * RH }, el);
      text(el, TX + v * ts, top - 10, v ? '+' + (v / 1000) + 'k' : '+0', 'ax', 'middle');
    });
    svg('path', { class: 'brk', d: 'M' + (LW + FW + 5) + ' ' + (top - 4) + ' l5 ' + (turns.length * RH + 4) + ' M' + (LW + FW + 10) + ' ' + (top - 4) + ' l5 ' + (turns.length * RH + 4) }, el);

    var rowsG = svg('g', {}, el);
    var rows = turns.map(function (t, i) {
      var y = top + i * RH;
      text(rowsG, LW - 8, y + 17, 'turn ' + (i + 1), 'tl', 'end');
      var cache = svg('rect', { class: 'cache', x: LW, y: y + 2, width: 0, height: RH - 4, rx: 2 }, rowsG);
      var cacheT = svg('rect', { class: 'cache', x: TX, y: y + 2, width: 0, height: RH - 4, rx: 2 }, rowsG);
      var x = LW;
      fixed.forEach(function (f) {
        svg('rect', { class: 'seg ' + f[0], x: x, y: y + 7, width: f[1] * fs, height: RH - 14 }, rowsG);
        x += f[1] * fs;
      });
      var segs = {};
      ['history', 'context', 'question'].forEach(function (k) {
        segs[k] = svg('rect', { class: 'seg ' + k, x: TX, y: y + 7, width: 0, height: RH - 14 }, rowsG);
      });
      var resend = svg('rect', { class: 'resend', x: TX, y: y + 4, width: 0, height: RH - 8, rx: 2 }, rowsG);
      var val = text(rowsG, W - RIGHT + 10, y + 17, '', 'tn', 'start');
      return { y: y, cache: cache, cacheT: cacheT, segs: segs, resend: resend, val: val, cur: null };
    });

    // The total sent anew over the five follow-ups, both orders, always.
    var sumMax = Math.max(followups('new'), followups('old'));
    var sscale = (W - LW - FW - 120) / sumMax;
    text(el, LW, SUMY - 10, 'sent anew over turns 2 to 6', 'ax strong', 'start');
    var sums = ['new', 'old'].map(function (o, k) {
      var y = SUMY + k * SRH;
      var g = svg('g', { class: 'sum' }, el);
      var hit = svg('rect', { class: 'hit', x: 0, y: y, width: W, height: SRH }, g);
      text(g, LW + FW - 8, y + 15, o === 'new' ? 'the order shipped' : 'the order before it', 'sl', 'end');
      var bar = svg('rect', { class: 'sbar', x: LW + FW, y: y + 5, width: followups(o) * sscale, height: SRH - 10, rx: 1 }, g);
      text(g, LW + FW + followups(o) * sscale + 8, y + 15, fmt(followups(o)), 'sn', 'start');
      hit.addEventListener('click', function () { tb.set(o); });
      return { o: o, g: g };
    });

    var anim = null;
    function target(q) {
      var x = TX, segs = {};
      q.tail.forEach(function (s) { segs[s[0]] = { x: x, w: s[1] * ts }; x += s[1] * ts; });
      return {
        segs: segs, end: x,
        cachedF: q.cached ? FW : 0,
        cachedT: q.cachedTail * ts,
        resendX: TX + q.cachedTail * ts, resendW: (q.tailSum - q.cachedTail) * ts,
      };
    }
    function draw(order, animate) {
      if (anim) anim.stop();
      var qsx = R[order];
      var from = rows.map(function (row) { return row.cur; });
      var to = qsx.map(target);
      rows.forEach(function (row, i) {
        row.val.textContent = i === 0 ? fmt(qsx[i].anew) + ' sent' : fmt(qsx[i].anew) + ' anew';
        row.val.setAttribute('class', 'tn' + (order === 'old' && i > 0 ? ' bad' : ''));
      });
      sums.forEach(function (s) { s.g.setAttribute('class', 'sum' + (s.o === order ? ' on' : '')); });
      function lerp(a, b, p) { return a + (b - a) * p; }
      function frame(p) {
        rows.forEach(function (row, i) {
          var a = from[i] || to[i], b = to[i];
          ['history', 'context', 'question'].forEach(function (k) {
            row.segs[k].setAttribute('x', lerp(a.segs[k].x, b.segs[k].x, p));
            row.segs[k].setAttribute('width', Math.max(k === 'question' ? 1.5 : 0, lerp(a.segs[k].w, b.segs[k].w, p)));
          });
          row.cache.setAttribute('width', lerp(a.cachedF, b.cachedF, p) + (b.cachedF ? 4 : 0));
          row.cacheT.setAttribute('width', lerp(a.cachedT, b.cachedT, p));
          row.cacheT.setAttribute('x', TX - (b.cachedF && b.cachedT ? 2 : 0));
          row.resend.setAttribute('x', lerp(a.resendX, b.resendX, p) - 1);
          row.resend.setAttribute('width', i === 0 ? 0 : lerp(a.resendW, b.resendW, p) + 2);
          if (p === 1) row.cur = b;
        });
      }
      if (animate && !REDUCE && from[0]) { anim = timeline(); anim.run([{ at: 0, dur: 650, fn: frame }]); }
      else frame(1);
    }
    draw('new', false);
    fig.fa = { set: function (o) { if (o.order) tb.set(o.order); } };
  }

  // ---- Specialists -------------------------------------------------------------
  function specialists(fig, data) {
    var body = mount(fig);
    var d = data.specialists, cat = d.catalogue, lim = d.limits;
    function set(list) { var o = {}; list.forEach(function (i) { o[i] = true; }); return o; }
    var parent = set(d.parent.tools);
    var turns = { parent: { name: 'parent', tools: d.parent.tools, chars: d.parent.chars } };
    d.specialists.forEach(function (s) { turns[s.name] = s; });
    var REFUSED = 'research_subagent';

    var ctl = h('div', { class: 'fig-controls' });
    var tb = tabs('Turn', [['parent', 'the parent turn']].concat(d.specialists.map(function (s) { return [s.name, s.name]; })), 'market', function (v) { draw(v, true); });
    ctl.appendChild(tb.el);
    body.appendChild(ctl);
    body.appendChild(legend([
      ['var(--accent)', 'handed to the specialist'], ['color-mix(in srgb, var(--fg) 62%, transparent)', 'handed to the parent'],
      ['transparent', 'the parent’s, withheld', 'hollow'], ['transparent', 'writes or acts: never a specialist’s', 'hatch'],
    ]));

    // The catalogue, column by column, grouped by what a tool may do. The
    // core group is the copilot's 21, ask_choice among them, though asking
    // the user is an act on the screen no specialist is handed.
    var core = {};
    data.copilot.combos[0].tools.forEach(function (t) { if (t[1] === 'core') core[data.copilot.tools[t[0]][0]] = true; });
    function groupOf(c) { return core[c[0]] ? 'core' : c[2]; }
    var GROUPS = [['core', 'core'], ['read', 'that read'], ['write', 'that write'], ['action', 'that act on the screen']];
    var CELL = 17, GAP = 3, ROWS_N = 7, GG = 18, W = 800, top = 8;
    var x = 0, cells = [], groupX = [];
    GROUPS.forEach(function (g) {
      var members = [];
      cat.forEach(function (c, i) { if (groupOf(c) === g[0]) members.push(i); });
      // Within core, the reads first and the one that acts last.
      members.sort(function (a, b) { return (cat[a][2] === 'core' ? 0 : 1) - (cat[b][2] === 'core' ? 0 : 1) || a - b; });
      var cols = Math.ceil(members.length / ROWS_N);
      groupX.push({ x: x, w: cols * (CELL + GAP) - GAP, n: members.length, label: g[1], kind: g[0] });
      members.forEach(function (i, k) {
        cells.push({ i: i, kind: cat[i][2], x: x + Math.floor(k / ROWS_N) * (CELL + GAP), y: top + (k % ROWS_N) * (CELL + GAP), col: Math.floor(x / (CELL + GAP)) + Math.floor(k / ROWS_N) });
      });
      x += cols * (CELL + GAP) - GAP + GG;
    });
    var gridW = x - GG, gridH = ROWS_N * (CELL + GAP) - GAP;
    var SX = gridW + 44, H = top + gridH + 34;
    var pane = h('div', { class: 'pan' });
    pane.style.marginTop = '14px';
    body.appendChild(pane);
    var el = svg('svg', { class: 'chart spec', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'The copilot’s ' + cat.length + ' tools as cells, grouped into core, reading, writing and screen-acting tools, with the ones a turn is handed filled in.' }, pane);
    var defs = svg('defs', {}, el);
    var pat = svg('pattern', { id: 'spec-hatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svg('line', { class: 'hatchl', x1: 0, y1: 0, x2: 0, y2: 4 }, pat);
    groupX.forEach(function (g) {
      text(el, g.x, top + gridH + 18, g.n + ' ' + g.label, 'gl-l', 'start');
    });
    var cellEls = cells.map(function (c) {
      var r = svg('rect', { class: 'cell', x: c.x, y: c.y, width: CELL, height: CELL, rx: 2.5 }, el);
      r.style.transitionDelay = (c.col * 14) + 'ms';
      r.addEventListener('mouseenter', function () { describe(c); });
      r.addEventListener('mouseleave', function () { describe(null); });
      return r;
    });
    var slashes = svg('g', {}, el);

    // The size of what the turn is handed, against the parent's.
    var BW = W - SX - 8, maxC = d.parent.chars;
    text(el, SX, top + 10, 'tools handed over', 'ax', 'start');
    var nTools = text(el, SX, top + 40, '', 'big', 'start');
    var nOf = text(el, SX, top + 40, '', 'ax', 'start');
    text(el, SX, top + 70, 'characters of schema, every round', 'ax', 'start');
    svg('rect', { class: 'strack', x: SX, y: top + 80, width: BW, height: 10 }, el);
    var sbar = svg('rect', { class: 'sbar', x: SX, y: top + 80, width: 0, height: 10 }, el);
    var nChars = text(el, SX, top + 108, '', 'n', 'start');
    var nParent = text(el, SX + BW, top + 108, 'parent ' + fmt(maxC), 'ax', 'end');

    var decl = h('div', { class: 'decl' });
    body.appendChild(decl);
    var note = h('p', { class: 'fig-note readout' });
    body.appendChild(note);
    var state = { t: 'market', shown: { n: 0, c: 0 } }, anim = null;

    function draw(name, animate) {
      state.t = name;
      var t = turns[name], have = set(t.tools), spec = name !== 'parent';
      clear(slashes);
      cells.forEach(function (c, k) {
        var cls = 'cell';
        if (have[c.i]) cls += spec ? ' on' : ' par';
        else if (spec && (c.kind === 'write' || c.kind === 'action')) cls += ' never';
        else if (spec && parent[c.i]) cls += ' was';
        cellEls[k].setAttribute('class', cls);
        if (spec && have[c.i] && cat[c.i][0] === REFUSED) {
          svg('path', { class: 'refused', d: 'M' + (c.x + 3) + ' ' + (c.y + CELL - 3) + ' L' + (c.x + CELL - 3) + ' ' + (c.y + 3) }, slashes);
        }
      });
      var n0 = state.shown.n, c0 = state.shown.c, n1 = t.tools.length, c1 = t.chars;
      function frame(p) {
        var n = Math.round(n0 + (n1 - n0) * p), c = c0 + (c1 - c0) * p;
        nTools.textContent = n;
        nOf.setAttribute('x', SX + nTools.getComputedTextLength() + 8);
        nOf.textContent = 'of ' + cat.length;
        sbar.setAttribute('width', BW * c / maxC);
        sbar.setAttribute('class', 'sbar' + (spec ? ' spec' : ''));
        nChars.textContent = fmt(c);
        state.shown = { n: n, c: c };
      }
      if (anim) anim.stop();
      if (animate && !REDUCE) { anim = timeline(); anim.run([{ at: 0, dur: 600, fn: frame }]); } else frame(1);
      // The declaration, as the code ships it, and the rules no declaration changes.
      clear(decl);
      if (spec) {
        decl.appendChild(h('div', { class: 'decl-h' }, [h('b', { text: t.name }), t.description ? '  “' + t.description + '”' : '']));
        decl.appendChild(h('div', { class: 'decl-i', text: t.instructions }));
        decl.appendChild(h('div', { class: 'decl-r', text: (t.declared.length ? t.declared.length + ' tools declared' : 'no tools declared: the whole read-only catalogue, routed') + ' · ask mode · actions off · ' + lim.ask_rounds + ' rounds · one level deep' }));
      } else {
        decl.appendChild(h('div', { class: 'decl-h' }, [h('b', { text: 'the parent turn' }), '  “' + d.question + '”']));
        decl.appendChild(h('div', { class: 'decl-r', text: 'agent mode · ' + lim.agent_rounds + ' rounds, raised to ' + lim.agent_cap + ' · may hand a sub-question to a specialist' }));
      }
      describe(null);
    }
    function describe(c) {
      clear(note);
      if (!c) return;
      var t = turns[state.t], have = set(t.tools), name = cat[c.i][0];
      var who = d.specialists.filter(function (s) { return set(s.tools)[c.i]; }).map(function (s) { return s.name; });
      note.appendChild(h('b', { text: name }));
      var bits = [fmt(cat[c.i][1]) + ' chars', (core[name] && c.kind !== 'core' ? 'core, ' : '') + (c.kind === 'action' ? 'acts on the screen' : c.kind)];
      if (state.t !== 'parent' && have[c.i] && name === REFUSED) bits.push('handed over, and refused if called: one level deep');
      else if (who.length) bits.push('handed to ' + who.join(', '));
      else if (c.kind === 'write' || c.kind === 'action') bits.push('never handed to a specialist');
      if (parent[c.i]) bits.push('and to the parent');
      note.appendChild(document.createTextNode('  ' + bits.join(' · ')));
    }
    draw('market', false);
    fig.fa = { set: function (o) { if (o.agent) tb.set(o.agent); } };
  }

  // ---- The scheduler ----------------------------------------------------------
  function jobs(fig, data) {
    var body = mount(fig);
    var d = data.jobs;
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // The window the zoom opens on, per scenario: where the scenario happens.
    // The outage's is its last hour: three tries a minute apart, the provider
    // back at 23:30, and the next hour's passes running.
    var FOCUS = { normal: [345, 435], outage: [2805, 2890], restart: [3230, 3640], holiday: [405, 615] };
    var W = 840, LW = 184, RW = W - LW - 16, RH = 27, top = 22;
    var WEEK_B = top + d.jobs.length * RH;
    var ZT = WEEK_B + 52, ZRH = 18, ZB = ZT + d.jobs.length * ZRH, H = ZB + 26;
    var scale = RW / d.minutes;

    var ctl = h('div', { class: 'fig-controls' });
    var tb = tabs('Scenario', [['normal', 'a plain week'], ['outage', 'a provider outage'], ['restart', 'a restart'], ['holiday', 'a market holiday']], 'outage', function (v) { draw(v, true); });
    ctl.appendChild(tb.el);
    ctl.appendChild(h('span', { class: 'grow' }));
    var counts = h('span', { class: 'counts' });
    ctl.appendChild(counts);
    body.appendChild(ctl);
    body.appendChild(legend([
      ['color-mix(in srgb, var(--fg) 55%, transparent)', 'ran', 'round'], ['var(--bad)', 'failed', 'round'], ['var(--skip)', 'slot spent without running', 'round hollow'],
      ['color-mix(in srgb, var(--bad) 16%, transparent)', 'every pass fails'], ['color-mix(in srgb, var(--fg) 12%, transparent)', 'the box is down'], ['color-mix(in srgb, var(--skip) 24%, transparent)', 'the market is closed'],
    ]));
    var pane = h('div', { class: 'pan' });
    pane.style.marginTop = '12px';
    body.appendChild(pane);
    var el = svg('svg', { class: 'chart jobs', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'One week of the ten system jobs, a mark for every pass that ran, failed or was skipped, with a minute-by-minute zoom of one window below.' }, pane);
    var note = h('p', { class: 'fig-note readout' });
    body.appendChild(note);

    function label(m) {
      var day = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
      return DAYS[day] + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    function hhmm(m) { return label(m).slice(4); }

    // ---- the week
    var bands = svg('g', {}, el), grid = svg('g', {}, el);
    DAYS.forEach(function (day, i) {
      var x = LW + i * 1440 * scale;
      svg('line', { class: 'day', x1: x, y1: top - 4, x2: x, y2: WEEK_B }, grid);
      text(grid, x + 4, top - 8, day, 'dl', 'start');
    });
    d.jobs.forEach(function (j, i) {
      var y = top + i * RH;
      text(el, 4, y + 12, j.title, 'jl', 'start');
      var when = j.cadence === 'daily' ? (j.skip_closed ? 'trading days' : 'daily') + ' at ' + j.hour + ':00' : j.cadence === 'hourly' ? 'hourly' : j.cadence.indexOf('weekly') === 0 ? 'Saturdays at ' + j.hour + ':00' : j.cadence;
      if (j.catchup) when += ', ' + j.catchup + ' h catch-up';
      text(el, 4, y + 23, when, 'js', 'start');
      svg('line', { class: 'gl', x1: LW, y1: y + RH - 1, x2: W - 16, y2: y + RH - 1 }, el);
    });
    var marks = svg('g', {}, el);
    var clock = text(el, W - 16, top - 8, '', 'clock', 'end');

    // ---- the zoom: a bracket on the week, a funnel, the window minute by minute
    var lens = svg('rect', { class: 'lens', y: top - 4, height: WEEK_B - top + 4, rx: 2 }, el);
    var funnel = svg('path', { class: 'funnel' }, el);
    var zgrid = svg('g', {}, el), zmarks = svg('g', {}, el);
    d.jobs.forEach(function (j, i) {
      var y = ZT + i * ZRH;
      text(el, 4, y + 12, j.title, 'zl', 'start');
      svg('line', { class: 'gl', x1: LW, y1: y + ZRH - 0.5, x2: W - 16, y2: y + ZRH - 0.5 }, el);
    });
    var zbands = svg('g', {}, el);
    el.insertBefore(zbands, zgrid);
    var state = { name: 'outage', win: FOCUS.outage.slice(), shown: { ok: 0, fail: 0, skip: 0 } };

    function weekX(m) { return LW + m * scale; }
    function drawZoom() {
      var s = d.scenarios[state.name], a = state.win[0], b = state.win[1];
      var zs = RW / (b - a);
      function zx(m) { return LW + (m - a) * zs; }
      lens.setAttribute('x', weekX(a) - 1);
      lens.setAttribute('width', Math.max(3, (b - a) * scale + 2));
      funnel.setAttribute('d', 'M' + (weekX(a) - 1) + ' ' + WEEK_B + ' L' + LW + ' ' + (ZT - 4) + ' M' + (weekX(b) + 1) + ' ' + WEEK_B + ' L' + (W - 16) + ' ' + (ZT - 4));
      clear(zgrid); clear(zmarks); clear(zbands);
      // Ticks at a step that leaves room for their labels.
      var span = b - a, step = [1, 5, 10, 15, 30, 60, 120, 240].filter(function (st) { return span / st <= 14; })[0] || 360;
      // The day goes in the gutter, and a tick on midnight carries the next.
      text(zgrid, 4, ZB + 14, DAYS[Math.floor(a / 1440)], 'ztl', 'start');
      for (var m = Math.ceil(a / step) * step; m <= b; m += step) {
        svg('line', { class: 'zt' + (m % 1440 === 0 ? ' mid' : ''), x1: zx(m), y1: ZT - 4, x2: zx(m), y2: ZB }, zgrid);
        text(zgrid, zx(m), ZB + 14, m % 1440 === 0 ? DAYS[m / 1440] : hhmm(m), 'ztl' + (m % 1440 === 0 ? ' dn' : ''), 'middle');
      }
      function band(w, cls) {
        var x0 = Math.max(a, w[0]), x1 = Math.min(b, w[1]);
        if (x1 > x0) svg('rect', { class: cls, x: zx(x0), y: ZT - 4, width: (x1 - x0) * zs, height: ZB - ZT + 4 }, zbands);
      }
      (s.down || []).forEach(function (w) { band(w, 'down'); });
      (s.outage || []).forEach(function (w) { band(w, 'outage'); });
      (s.closed_days || []).forEach(function (day) { band([day * 1440, day * 1440 + 1440], 'closed'); });
      var slots = {}, r = Math.max(2.2, Math.min(4, zs * 0.42));
      s.events.forEach(function (e) {
        if (e[1] < a || e[1] > b) return;
        var kind = ['ok', 'fail', 'skip'][e[2]], j = d.jobs[e[0]], y = ZT + e[0] * ZRH + 9, x = zx(e[1]);
        if (kind === 'fail') {
          // Attempts in one slot, joined, so three-a-minute-apart reads as one try.
          var key = e[0] + ':' + (e[1] - (e[3] - 1));
          if (slots[key] !== undefined) svg('line', { class: 'chain', x1: slots[key], y1: y, x2: x, y2: y }, zmarks);
          slots[key] = x;
          if (zs >= 7) text(zmarks, x, y - 6, String(e[3]), 'att', 'middle');
        }
        svg('circle', { class: 'm ' + kind, cx: x, cy: y, r: r }, zmarks);
        var hit = svg('circle', { class: 'hit', cx: x, cy: y, r: 7 }, zmarks);
        hit.addEventListener('mouseenter', function () { say(e, j, kind); });
      });
    }
    function say(e, j, kind) {
      clear(note);
      note.appendChild(h('b', { text: label(e[1]) }));
      note.appendChild(document.createTextNode('  ' + j.title + ' · ' + (kind === 'ok' ? (e[3] > 1 ? 'ran again, fire ' + e[3] + ' of the slot' : 'ran') : kind === 'fail' ? 'failed, attempt ' + e[3] + ' of ' + d.cap + ' in this slot' : 'slot spent without running, ' + (j.catchup ? 'past its ' + j.catchup + '-hour catch-up' : 'past its hour'))));
    }
    var weekMarks = [];
    function draw(name, animate) {
      state.name = name;
      state.win = FOCUS[name].slice();
      var s = d.scenarios[name];
      clear(bands); clear(marks); weekMarks = [];
      (s.down || []).forEach(function (w) { svg('rect', { class: 'down', x: weekX(w[0]), y: top - 4, width: (w[1] - w[0]) * scale, height: WEEK_B - top + 4 }, bands); });
      (s.outage || []).forEach(function (w) { svg('rect', { class: 'outage', x: weekX(w[0]), y: top - 4, width: (w[1] - w[0]) * scale, height: WEEK_B - top + 4 }, bands); });
      (s.closed_days || []).forEach(function (day) { svg('rect', { class: 'closed', x: weekX(day * 1440), y: top - 4, width: 1440 * scale, height: WEEK_B - top + 4 }, bands); });
      var c = { ok: 0, fail: 0, skip: 0 };
      s.events.forEach(function (e) {
        var j = d.jobs[e[0]], y = top + e[0] * RH + 14, kind = ['ok', 'fail', 'skip'][e[2]];
        c[kind]++;
        // The attempts in one slot stack upward, so a cap of three reads as three.
        var dy = kind === 'fail' ? -(e[3] - 1) * 4 : 0;
        // Hourly passes sit four pixels apart on the week: smaller, so they
        // read as a dotted line rather than a rope.
        var r = kind !== 'ok' ? 2.6 : j.cadence === 'hourly' ? 1.4 : 2.1;
        var m = svg('circle', { class: 'm ' + kind, cx: weekX(e[1]), cy: y + dy, r: r }, marks);
        weekMarks.push({ el: m, t: e[1] });
        var hit = svg('circle', { class: 'hit', cx: weekX(e[1]), cy: y + dy, r: 5 }, marks);
        hit.addEventListener('mouseenter', function () { say(e, j, kind); });
      });
      drawZoom();
      clear(note);
      var c0 = state.shown;
      function frame(p) {
        var v = {};
        ['ok', 'fail', 'skip'].forEach(function (k) { v[k] = Math.round(c0[k] + (c[k] - c0[k]) * p); });
        clear(counts);
        counts.appendChild(h('b', { text: fmt(v.ok) })); counts.appendChild(document.createTextNode(' ran   '));
        counts.appendChild(h('b', { class: v.fail ? 'bad' : '', text: fmt(v.fail) })); counts.appendChild(document.createTextNode(' failed   '));
        counts.appendChild(h('b', { class: v.skip ? 'skipc' : '', text: fmt(v.skip) })); counts.appendChild(document.createTextNode(' skipped'));
        if (p === 1) state.shown = c;
      }
      var tl = timeline();
      if (animate && !REDUCE) tl.run([{ at: 0, dur: 500, fn: frame }]); else frame(1);
    }

    // Drag the bracket, or put it down anywhere on the week.
    var drag = null;
    function minuteAt(ev) {
      var pt = el.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(el.getScreenCTM().inverse());
      return { m: (p.x - LW) / scale, y: p.y };
    }
    function moveTo(start) {
      var span = state.win[1] - state.win[0];
      start = Math.max(0, Math.min(d.minutes - span, Math.round(start)));
      state.win = [start, start + span];
      drawZoom();
    }
    el.addEventListener('pointerdown', function (ev) {
      var at = minuteAt(ev);
      if (at.y > WEEK_B || at.y < top - 4 || at.m < 0) return;
      var span = state.win[1] - state.win[0], slack = (ev.pointerType === 'touch' ? 16 : 6) / scale;
      var inside = at.m >= state.win[0] - slack && at.m <= state.win[1] + slack;
      // A finger elsewhere on the week is scrolling the figure, not aiming.
      if (!inside && ev.pointerType === 'touch') return;
      drag = { off: inside ? at.m - state.win[0] : span / 2 };
      if (!inside) moveTo(at.m - drag.off);
      el.setPointerCapture(ev.pointerId);
      el.classList.add('dragging');
      ev.preventDefault();
    });
    el.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      moveTo(minuteAt(ev).m - drag.off);
    });
    function endDrag() { drag = null; el.classList.remove('dragging'); }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    draw('outage', false);
    // Once, on first sight: the week's clock runs and the marks land as it passes.
    onView(el, function () {
      if (REDUCE || state.name !== 'outage') return;
      var sorted = weekMarks.slice().sort(function (a, b) { return a.t - b.t; });
      sorted.forEach(function (o) { o.el.style.opacity = 0; });
      zmarks.style.opacity = 0;
      var k = 0, tl = timeline();
      tl.run([{ at: 0, dur: 2600, linear: true, fn: function (p) {
        var now = p * d.minutes;
        while (k < sorted.length && sorted[k].t <= now) { sorted[k].el.style.opacity = ''; k++; }
        clock.textContent = p < 1 ? label(Math.min(d.minutes - 1, Math.floor(now))) : '';
        if (now >= state.win[1]) zmarks.style.opacity = '';
      } }]);
    }, 0.5);
    fig.fa = { set: function (o) { if (o.scenario) tb.set(o.scenario); } };
  }

  // ---- The scripted evals -----------------------------------------------------
  function evals(fig, data) {
    var body = mount(fig);
    var d = data.evals, sm = d.summary, kinds = sm.check_kinds, runs = d.results, skipped = d.skipped;
    var W = 840, LW = 332, CW = 17, RH = 16, top = 92;
    var nx = LW + kinds.length * CW + 12;
    var COLS = 3, LRH = 14, LROWS = Math.ceil(skipped.length / COLS);
    var MID, LT, H;
    function size() {
      MID = top + runs.length * RH;
      LT = MID + 34;
      H = LT + LROWS * LRH + 6;
    }
    size();

    var ctl = h('div', { class: 'fig-controls' });
    var counts = h('span', { class: 'counts' });
    ctl.appendChild(counts);
    ctl.appendChild(h('span', { class: 'grow' }));
    var timer = h('button', { type: 'button', class: 'timer', 'aria-label': 'Replay the run', title: 'Replay the run' });
    ctl.appendChild(timer);
    body.appendChild(ctl);
    body.appendChild(legend([
      ['color-mix(in srgb, var(--fg) 72%, transparent)', 'check passed'], ['var(--bad)', 'check failed'], ['var(--line)', 'not checked here'],
    ]));
    var pane = h('div', { class: 'pan' });
    pane.style.marginTop = '8px';
    body.appendChild(pane);
    var el = svg('svg', { class: 'chart evals', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'A matrix of the scripted scenarios against the kinds of check, with calls, rounds and tokens, and the scenarios that need a live model listed below.' }, pane);
    var note = h('p', { class: 'fig-note readout' });
    body.appendChild(note);

    // The header is as tall as the longest check's name, slanted.
    var heads = kinds.map(function (k) { return text(el, 0, 0, k, 'cl', 'start'); });
    var longest = Math.max.apply(null, heads.map(function (t) { return t.getComputedTextLength(); }));
    top = Math.max(top, Math.ceil(longest * Math.sin(55 * Math.PI / 180)) + 18);
    size();
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    heads.forEach(function (t, i) {
      var x = LW + i * CW + CW / 2;
      t.setAttribute('x', x);
      t.setAttribute('y', top - 6);
      t.setAttribute('transform', 'rotate(-55 ' + x + ' ' + (top - 6) + ')');
    });
    text(el, nx, top - 6, 'calls', 'num', 'start');
    text(el, nx + 104, top - 6, 'rounds', 'num', 'end');
    text(el, W - 4, top - 6, 'tokens', 'num', 'end');

    var rows = runs.map(function (r, i) {
      var y = top + i * RH;
      var hit = svg('rect', { class: 'hit', x: 0, y: y, width: W, height: RH }, el);
      var lab = text(el, 4, y + 11.5, r.id, 'sl', 'start');
      var have = {};
      r.checks.forEach(function (c) {
        // `called(get_quote)` is a `called` check; two of a kind pass only together.
        var k = c[0].replace(/\(.*$/, '');
        have[k] = (have[k] === undefined ? true : have[k]) && c[1];
      });
      var cells = [];
      kinds.forEach(function (k, j) {
        var cls = have[k] === undefined ? 'none' : have[k] ? 'pass' : 'fail';
        var c = svg('rect', { class: 'cell ' + cls, x: LW + j * CW + 3.5, y: y + 3.5, width: CW - 7, height: RH - 7, rx: 1.5 }, el);
        if (cls !== 'none') cells.push({ el: c, cls: cls });
      });
      for (var k = 0; k < r.calls; k++) svg('line', { class: 'call', x1: nx + 1 + k * 2.8, y1: y + 4, x2: nx + 1 + k * 2.8, y2: y + RH - 4 }, el);
      if (r.calls) text(el, nx + 4 + r.calls * 2.8, y + 11.5, String(r.calls), 'num' + (r.calls >= 10 ? ' strong' : ''), 'start');
      text(el, nx + 104, y + 11.5, String(r.rounds), 'num', 'end');
      text(el, W - 4, y + 11.5, fmt(r.tokens), 'num', 'end');
      hit.addEventListener('mouseenter', function () { show(i); });
      hit.addEventListener('click', function () { select(i); });
      return { y: y, hit: hit, lab: lab, cells: cells, r: r };
    });
    svg('line', { class: 'rule', x1: 0, y1: MID + 12, x2: W, y2: MID + 12 }, el);
    text(el, 4, MID + 26, skipped.length + ' more need a live model', 'grp', 'start');
    // Columns as wide as their longest id, spread across the width.
    var live = skipped.map(function (s, i) {
      var col = Math.floor(i / LROWS), row = i % LROWS;
      return { s: s, col: col, row: row, t: text(el, 0, LT + row * LRH + 10, s.id, 'sl skip', 'start') };
    });
    var widths = [];
    live.forEach(function (o) { widths[o.col] = Math.max(widths[o.col] || 0, o.t.getComputedTextLength()); });
    var used = widths.reduce(function (a, w) { return a + w; }, 0);
    var gap = Math.max(16, (W - 8 - used) / Math.max(1, COLS - 1)), colX = [4];
    for (var c = 1; c < COLS; c++) colX[c] = colX[c - 1] + widths[c - 1] + gap;
    live.forEach(function (o) {
      o.t.setAttribute('x', colX[o.col]);
      var hit = svg('rect', { class: 'hit plain', x: colX[o.col] - 4, y: LT + o.row * LRH, width: widths[o.col] + 8, height: LRH }, el);
      hit.addEventListener('mouseenter', function () { sayGuard(o.s.id, null, o.s.guards, true); });
    });
    el.addEventListener('mouseleave', function () { show(state.i); });

    var state = { i: 0 };
    function sayGuard(id, r, guards, live) {
      clear(note);
      note.appendChild(h('b', { text: id }));
      var g = (guards || '').replace(/\s+/g, ' ');
      var cut = g.search(/[.;:]\s|\s—\s/);
      if (cut > 40) g = g.slice(0, cut);
      var bits = [];
      if (r) bits.push('“' + r.prompt + '”', r.checks.length + ' checks, ' + r.calls + (r.calls === 1 ? ' call' : ' calls') + ' in ' + r.rounds + (r.rounds === 1 ? ' round, ' : ' rounds, ') + r.seconds + ' s');
      if (live) bits.push('needs a live model');
      bits.push('guards ' + g.replace(/…$/, ''));
      // Backticked spans in the guard's docstring are code.
      ('  ' + bits.join(' · ')).split('`').forEach(function (s, k) {
        note.appendChild(k % 2 ? h('code', { text: s }) : document.createTextNode(s));
      });
    }
    function show(i) {
      rows.forEach(function (o, k) {
        o.hit.setAttribute('class', 'hit' + (k === state.i ? ' on' : ''));
        o.lab.setAttribute('class', 'sl' + (k === i ? ' on' : ''));
      });
      sayGuard(runs[i].id, runs[i], runs[i].guards, false);
    }
    function select(i) { state.i = i; show(i); }

    // The run, replayed at the pace it was recorded: each scenario gets its
    // own seconds, its checks landing across them.
    var tl = timeline(), total = runs.reduce(function (a, r) { return a + r.seconds; }, 0);
    function paintCounts(nScen, nChecks, secs) {
      clear(counts);
      counts.appendChild(h('b', { text: String(nScen) }));
      counts.appendChild(document.createTextNode(' of ' + sm.scenarios + ' scenarios passed   '));
      counts.appendChild(h('b', { text: fmt(nChecks) }));
      counts.appendChild(document.createTextNode(' of ' + fmt(sm.checks) + ' checks'));
      timer.textContent = secs.toFixed(1) + ' s';
    }
    function replay() {
      var items = [], at = 0, done = { s: 0, c: 0 };
      rows.forEach(function (o) {
        var ms = o.r.seconds * 1000, start = at;
        o.cells.forEach(function (c, k) {
          items.push({ at: start + ms * (k + 1) / (o.cells.length + 1), dur: 0, fn: function (p) {
            c.el.setAttribute('class', 'cell ' + (p ? c.cls : 'pending'));
          } });
        });
        items.push({ at: start, dur: ms, linear: true, fn: function (p) {
          o.lab.setAttribute('class', 'sl' + (p > 0 && p < 1 ? ' run' : '') + (p === 0 ? ' wait' : ''));
        } });
        at += ms;
      });
      items.push({ at: 0, dur: at, linear: true, fn: function (p) {
        var t = p * at, s = 0, c = 0, acc = 0;
        rows.forEach(function (o) {
          var ms = o.r.seconds * 1000;
          var n = o.r.checks.filter(function (x) { return x[1]; }).length;
          if (t >= acc + ms) { s += o.r.ok ? 1 : 0; c += n; }
          else if (t > acc) c += Math.floor(n * (t - acc) / ms);
          acc += ms;
        });
        paintCounts(s, Math.min(c, sm.checks_passed), Math.min(sm.seconds, t / 1000));
      } });
      timer.classList.add('running');
      tl.run(items, function () {
        timer.classList.remove('running');
        paintCounts(sm.scenarios_passed, sm.checks_passed, sm.seconds);
        show(state.i);
      });
    }
    timer.addEventListener('click', replay);
    paintCounts(sm.scenarios_passed, sm.checks_passed, sm.seconds);
    var start = runs.map(function (r) { return r.id; }).indexOf('leaked_call.retried_not_shipped');
    select(start >= 0 ? start : 0);
    onView(el, function () { if (!REDUCE) replay(); }, 0.35);
    fig.fa = {
      set: function (o) {
        if (o.id) {
          var i = runs.map(function (r) { return r.id; }).indexOf(o.id);
          if (i >= 0) select(i);
        }
      },
    };
  }

  // ---- Four processes ---------------------------------------------------------
  // Lines moving along the diagram's edges while it is on screen: both ways
  // between app and backend and with the quant worker, upward only from the
  // desk, whose events the backend relays.
  function arch(fig) {
    var el = fig.querySelector('svg.arch');
    if (!el || REDUCE) return;
    var lanes = [].slice.call(el.querySelectorAll('[data-flow]')).map(function (path) {
      return { path: path, len: path.getTotalLength(), flow: path.getAttribute('data-flow'), dots: [], next: Math.random() * 600 };
    });
    var layer = svg('g', {}, el), raf = null, last = null, visible = false;
    function tick(now) {
      var dt = last === null ? 16 : Math.min(64, now - last);
      last = now;
      lanes.forEach(function (ln) {
        ln.next -= dt;
        if (ln.next <= 0) {
          var up = ln.flow === 'up' || (ln.flow === 'both' && Math.random() < 0.5);
          ln.dots.push({ t: 0, up: up, el: svg('circle', { class: 'dot', r: 2.2 }, layer) });
          ln.next = (ln.flow === 'up' ? 260 : 520) + Math.random() * 500;
        }
        ln.dots = ln.dots.filter(function (d) {
          d.t += dt / 520;
          if (d.t >= 1) { d.el.remove(); return false; }
          // The path runs top to bottom; an upward line walks it backwards.
          var pt = ln.path.getPointAtLength(ln.len * (d.up ? 1 - d.t : d.t));
          d.el.setAttribute('cx', pt.x + (d.up ? 2.5 : -2.5));
          d.el.setAttribute('cy', pt.y);
          d.el.style.opacity = Math.min(1, Math.min(d.t, 1 - d.t) * 6);
          return true;
        });
      });
      raf = visible ? requestAnimationFrame(tick) : null;
    }
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !raf) { last = null; raf = requestAnimationFrame(tick); }
    }, { threshold: 0.2 }).observe(el);
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    var a = document.getElementById('fa-arch');
    if (a) arch(a);
    var builders = { 'fa-firm': firm, 'fa-pay': payload, 'fa-rungs': rungs, 'fa-spec': specialists, 'fa-jobs': jobs, 'fa-evals': evals };
    var figs = Object.keys(builders).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!figs.length) return;
    loadData(figs[0].getAttribute('data-src')).then(function (data) {
      figs.forEach(function (fig) {
        try { builders[fig.id](fig, data); } catch (err) {
          mount(fig).appendChild(h('p', { class: 'fig-loading', text: 'This figure failed to draw (' + err.message + ').' }));
        }
      });
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
    if (!fig || !fig.fa) return;
    e.preventDefault();
    fig.fa.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      fig.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
