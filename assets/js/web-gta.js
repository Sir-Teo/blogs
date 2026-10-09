// Figures for "Porting San Andreas to a browser tab".
//
// Every figure runs web-gta's own code, bundled from the port's source into
// web-gta-core.js and web-gta-vm.js (see _tools/web-gta-demo), on inputs made
// up for this page: a straight road, a hand-assembled script, two cars, a
// made-up phone, a single texture block. Nothing from the game's data is used.
(function () {
  'use strict';

  var G = window.WebGtaCore;
  var NS = 'http://www.w3.org/2000/svg';

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
  function slider(label, min, max, step, value, fmt, onInput) {
    var out = h('output');
    var input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label });
    input.value = String(value);
    out.textContent = fmt(value);
    input.addEventListener('input', function () { out.textContent = fmt(Number(input.value)); onInput(Number(input.value)); });
    return {
      el: h('label', { class: 'slider' }, [label, input, out]),
      set: function (v) { input.value = String(v); out.textContent = fmt(v); onInput(v); },
    };
  }
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAN_HOVER = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
  function mount(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }
  function facts(rows) {
    var dl = h('dl', { class: 'facts' });
    rows.forEach(function (r) { dl.appendChild(h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])); });
    return dl;
  }
  function local(el, e, w, hgt) {
    var r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * hgt];
  }

  // =========================================================================
  // Streaming the world ahead of the car
  // =========================================================================
  var RADIUS = 180;
  function driveSim(speed, latency, adaptive) {
    var f = new G.SceneRegionFollower({ x: 0, y: 0, radius: RADIUS, lodRadius: 1000 });
    f.leadSeconds = adaptive ? Math.min(4, Math.max(2, latency + 0.8)) : 2;
    var x = 0, t = 0, pending = null, frames = [], installs = [], holds = 0, heldSteps = 0, wasHeld = false;
    for (var step = 0; step < 600; step++) {
      t += 100;
      var pos = { x: x, z: 0 };
      var req = f.request(pos, true, { x: speed, z: 0 }, t);
      if (req) pending = { id: req.id, at: t + latency * 1000, region: req.region };
      if (pending && t >= pending.at) { f.finish(pending.id, true, t); installs.push(t / 1000); pending = null; }
      var held = f.needsPause(pos);
      if (held) { heldSteps++; if (!wasHeld) holds++; } else x += speed * 0.1;
      wasHeld = held;
      frames.push({ t: t / 1000, x: x, held: held, rx: f.region.x, pend: pending ? pending.region.x : null });
    }
    return { frames: frames, installs: installs, holds: holds, held: heldSteps / 10, distance: x, lead: f.leadSeconds };
  }

  function stream(fig) {
    var body = mount(fig);
    var state = { speed: 70, latency: 1.6, adaptive: false, k: 0, playing: false };
    var sim;
    var W = 640, H = 300;
    var road = svg('svg', { class: 'road', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Top-down view of the car, its loaded window and the next one' });
    var TW = 640, TH = 58, TP = { l: 8, r: 8 };
    var timeline = svg('svg', { class: 'chart', viewBox: '0 0 ' + TW + ' ' + TH, role: 'img', 'aria-label': 'Sixty seconds of driving; red marks time the game held for loading' });
    var factsBox = h('div');
    var speedS = slider('Speed', 10, 80, 1, state.speed, function (v) { return v + ' m/s'; }, function (v) { state.speed = v; restart(); });
    var latS = slider('Loading time', 0.2, 4, 0.1, state.latency, function (v) { return v.toFixed(1) + ' s'; }, function (v) { state.latency = v; restart(); });
    var leadTabs = tabs('Look-ahead', [['fixed', 'Look 2 s ahead'], ['adaptive', 'Look ahead by loading time']], 'fixed', function (v) { state.adaptive = v === 'adaptive'; restart(); });
    var play = h('button', { class: 'btn', type: 'button', text: 'Drive again', onclick: function () { state.k = 0; run(); } });

    function restart() {
      sim = driveSim(state.speed, state.latency, state.adaptive);
      drawTimeline();
      clear(factsBox);
      factsBox.appendChild(facts([
        ['Distance in 60 s', Math.round(sim.distance) + ' m'],
        ['Windows loaded', String(sim.installs.length)],
        ['Holds', sim.holds + (sim.holds ? ', ' + sim.held.toFixed(1) + ' s' : '')],
      ]));
      state.k = Math.min(state.k, sim.frames.length - 1);
      if (!state.playing) draw(state.k);
    }
    function drawTimeline() {
      clear(timeline);
      var gx = function (t) { return TP.l + (TW - TP.l - TP.r) * t / 60; };
      svg('line', { class: 'gl', x1: TP.l, x2: TW - TP.r, y1: 26, y2: 26 }, timeline);
      sim.installs.forEach(function (t) { svg('line', { class: 'tick', x1: gx(t), x2: gx(t), y1: 18, y2: 34 }, timeline); });
      var start = null;
      sim.frames.forEach(function (f, i) {
        if (f.held && start === null) start = f.t - 0.1;
        if ((!f.held || i === sim.frames.length - 1) && start !== null) {
          svg('rect', { class: 'held', x: gx(start), y: 14, width: Math.max(1.5, gx(f.t) - gx(start)), height: 24, rx: 1 }, timeline);
          start = null;
        }
      });
      [0, 15, 30, 45, 60].forEach(function (t) { svg('text', { x: gx(t), y: 52, 'text-anchor': t === 0 ? 'start' : t === 60 ? 'end' : 'middle' }, timeline).textContent = t + ' s'; });
      timeline.cursor = svg('line', { class: 'cursor', y1: 10, y2: 40 }, timeline);
      timeline.gx = gx;
    }
    function draw(k) {
      var f = sim.frames[k];
      var span = 900, x0 = f.x - 300, s = W / span;
      var X = function (x) { return (x - x0) * s; }, cy = H / 2;
      clear(road);
      svg('rect', { class: 'bg', x: 0, y: cy - 16, width: W, height: 32 }, road);
      svg('line', { class: 'lane', x1: 0, x2: W, y1: cy, y2: cy }, road);
      svg('circle', { class: 'win', cx: X(f.rx), cy: cy, r: RADIUS * s }, road);
      svg('circle', { class: 'hold', cx: X(f.rx), cy: cy, r: RADIUS * 0.85 * s }, road);
      if (f.pend !== null) svg('circle', { class: 'pend', cx: X(f.pend), cy: cy, r: RADIUS * s }, road);
      var lead = Math.min(state.speed * sim.lead, RADIUS * 0.8);
      svg('line', { class: 'lead', x1: X(f.x), x2: X(f.x + lead), y1: cy - 22, y2: cy - 22 }, road);
      svg('rect', { class: 'car' + (f.held ? ' held' : ''), x: X(f.x) - 9, y: cy - 5, width: 18, height: 10, rx: 2 }, road);
      svg('text', { x: 8, y: 16 }, road).textContent = f.held ? 'Held: the car is past 85% of the loaded window and the next is not in' : f.pend !== null ? 'Next window requested, loading…' : 'Inside the loaded window';
      if (timeline.cursor) { timeline.cursor.setAttribute('x1', timeline.gx(f.t)); timeline.cursor.setAttribute('x2', timeline.gx(f.t)); }
    }
    function run() {
      if (REDUCE) { state.k = sim.frames.length - 1; draw(state.k); return; }
      state.playing = true;
      var last = performance.now();
      function tick(now) {
        if (!state.playing) return;
        var adv = Math.max(1, Math.round((now - last) / 1000 * 30)); // three simulated seconds per real second
        if (now - last < 30) { requestAnimationFrame(tick); return; }
        last = now;
        state.k = Math.min(sim.frames.length - 1, state.k + adv);
        draw(state.k);
        if (state.k >= sim.frames.length - 1) { state.playing = false; return; }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    timeline.addEventListener('pointerdown', function (e) {
      state.playing = false;
      var p = local(timeline, e, TW, TH);
      state.k = Math.max(0, Math.min(sim.frames.length - 1, Math.round((p[0] - TP.l) / (TW - TP.l - TP.r) * 600) - 1));
      draw(state.k);
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [speedS.el, latS.el]));
    body.appendChild(h('div', { class: 'fig-controls' }, [leadTabs.el, h('span', { class: 'grow' }), play]));
    body.appendChild(road);
    body.appendChild(timeline);
    body.appendChild(h('p', { class: 'fig-note', style: 'margin-top:4px', text: 'Solid circle: the loaded window. Dotted: the hold line at 85% of it. Dashed: a window still loading. The line above the car reaches to the point it asks for. Below, each tick is a window arriving and red is time held.' }));
    body.appendChild(factsBox);
    restart();
    draw(0);
    var seen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && !seen) { seen = true; run(); } }, { threshold: 0.5 }).observe(road);
    }

    fig.gta = {
      set: function (o) {
        if (o.speed) speedS.set(Number(o.speed));
        if (o.latency) latS.set(Number(o.latency));
        if (o.lead) leadTabs.set(o.lead);
        state.k = 0;
        run();
      },
    };
  }

  // =========================================================================
  // The script interpreter, one instruction at a time
  // =========================================================================
  function assemble(waitMs, countTo) {
    var w = Math.max(0, Math.min(32767, waitMs));
    return [
      0x06, 0x00, 0x03, 0x00, 0x00, 0x04, 0x00,               // SET_LVAR_INT 0@ = 0
      0x01, 0x00, 0x05, w & 0xff, w >> 8,                      // WAIT w
      0x0a, 0x00, 0x03, 0x00, 0x00, 0x04, 0x01,               // ADD_VAL_TO_INT_LVAR 0@ += 1
      0x19, 0x00, 0x03, 0x00, 0x00, 0x04, countTo - 1,        // IS_INT_LVAR_GREATER_THAN_NUMBER 0@ > n - 1
      0x4d, 0x00, 0x01, 0x07, 0x00, 0x00, 0x00,               // GOTO_IF_FALSE 7
      0x4e, 0x00,                                             // TERMINATE_THIS_SCRIPT
    ];
  }
  var CENSUS = [
    ['Faithful', 1244, 'var(--accent)'], ['Core', 153, 'var(--fg)'], ['No-op', 26, 'var(--fg-3)'], ['Authored', 18, 'var(--warm)'],
    ['Skipped', 127, 'var(--line-2)'], ['Silent', 1, 'var(--line-2)'], ['Stops', 1, 'var(--held)'],
  ];
  function vmFigure(fig) {
    var V = window.WebGtaVm;
    var body = mount(fig);
    if (!V) { body.appendChild(h('p', { class: 'fig-note', text: 'The interpreter did not load.' })); return; }
    var state = { wait: 250, count: 5, now: 0, frame: 33 };
    var bytes, space, listing, thread, trace = [], ranThisFrame = {};
    var listEl = h('div', { class: 'listing', role: 'list' });
    var stateEl = h('dl', { class: 'vmstate' });
    var traceEl = h('div', { class: 'trace', 'aria-live': 'polite' });
    var playing = false;

    function param(p, name) {
      if (p.type === 3) return p.value + '@';
      if (name === 'GOTO_IF_FALSE' || name === 'GOTO') return '→ ' + p.value;
      return String(p.value);
    }
    function load() {
      bytes = assemble(state.wait, state.count);
      space = new Uint8Array(64);
      space.set(bytes);
      listing = V.decodeScmInstructions(space, 0, bytes.length);
      thread = new V.ScmThread(space, 0);
      state.now = 0;
      trace = [];
      ranThisFrame = {};
      render();
    }
    // One instruction: the interpreter's own watchdog stops it after a budget
    // of one, with the instruction pointer already moved on.
    function stepOne() {
      var at = thread.ip;
      try { thread.run(state.now, 1); }
      catch (e) { if (!/watchdog/.test(String(e && e.message))) throw e; }
      return at;
    }
    function runFrame() {
      ranThisFrame = {};
      var ran = [], guard = 0;
      while (!thread.terminated && state.now >= thread.wakeTime && guard++ < 50) {
        var at = stepOne();
        ran.push(at);
        ranThisFrame[at] = 1;
        if (state.now < thread.wakeTime) break;
      }
      if (ran.length) trace.unshift(state.now + ' ms: ' + ran.map(function (o) { return nameAt(o); }).join(', '));
    }
    function nameAt(off) {
      for (var i = 0; i < listing.length; i++) if (listing[i].offset === off) return listing[i].name;
      return '?';
    }
    function render() {
      clear(listEl);
      listing.forEach(function (ins, i) {
        var end = i + 1 < listing.length ? listing[i + 1].offset : bytes.length;
        var hex = bytes.slice(ins.offset, end).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(' ');
        var row = h('div', { class: 'row' + (thread.ip === ins.offset && !thread.terminated ? ' on' : '') + (ranThisFrame[ins.offset] ? ' ran' : ''), role: 'listitem' }, [
          h('span', { class: 'ptr', text: '▸' }),
          h('span', { class: 'off', text: String(ins.offset) }),
          h('span', { class: 'hex', text: hex, title: hex }),
          h('span', { class: 'op' }, [ins.name + ' ', h('small', { text: ins.parameters.map(function (p) { return param(p, ins.name); }).join(' ') })]),
        ]);
        listEl.appendChild(row);
      });
      clear(stateEl);
      var status = thread.terminated ? 'terminated' : state.now < thread.wakeTime ? 'waiting until ' + thread.wakeTime + ' ms' : 'running';
      [
        ['0@', String(thread.locals.getInt32(0, true)), 'big'],
        ['Game clock', state.now + ' ms'],
        ['Status', status],
        ['Condition', thread.condition ? 'true' : 'false'],
      ].forEach(function (r) { stateEl.appendChild(h('dt', { text: r[0] })); stateEl.appendChild(h('dd', { class: r[2] || '', text: r[1] })); });
      clear(traceEl);
      trace.slice(0, 12).forEach(function (t) { traceEl.appendChild(h('div', { text: t })); });
      if (!trace.length) traceEl.appendChild(h('div', { text: 'Each frame, the instructions that ran.' }));
    }
    function nextFrame() {
      if (thread.terminated) return;
      runFrame();
      render();
      state.now += state.frame;
    }
    function play() {
      if (playing) return;
      playing = true;
      playBtn.textContent = 'Pause';
      var last = performance.now(), acc = 0;
      function tick(now) {
        if (!playing) return;
        acc += now - last; last = now;
        while (acc >= state.frame) { acc -= state.frame; nextFrame(); }
        if (thread.terminated) { stop(); return; }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    function stop() { playing = false; playBtn.textContent = 'Play'; }
    var playBtn = h('button', { class: 'btn', type: 'button', text: 'Play', onclick: function () { if (playing) stop(); else { if (thread.terminated) load(); play(); } } });
    var waitS = slider('WAIT', 50, 1000, 50, state.wait, function (v) { return v + ' ms'; }, function (v) { state.wait = v; stop(); load(); });
    var countS = slider('Count to', 2, 9, 1, state.count, String, function (v) { state.count = v; stop(); load(); });

    var census = svg('svg', { class: 'census', viewBox: '0 0 640 24', role: 'img', 'aria-label': 'How the port handles the 1,570 distinct commands the original scripts use' });
    var total = CENSUS.reduce(function (s, c) { return s + c[1]; }, 0), x = 0;
    CENSUS.forEach(function (c) {
      var w = 640 * c[1] / total;
      svg('rect', { class: 'seg', x: x, y: 4, width: Math.max(1, w), height: 16, fill: c[2] }, census);
      x += w;
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      h('div', { class: 'group' }, [
        h('button', { class: 'btn', type: 'button', text: 'Step', onclick: function () {
          stop();
          if (thread.terminated) return;
          if (state.now < thread.wakeTime) state.now = thread.wakeTime;
          ranThisFrame = {};
          var at = stepOne();
          ranThisFrame[at] = 1;
          trace.unshift(state.now + ' ms: ' + nameAt(at));
          render();
        } }),
        h('button', { class: 'btn', type: 'button', text: 'Next frame', onclick: function () { stop(); nextFrame(); } }),
        playBtn,
        h('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () { stop(); load(); } }),
      ]),
    ]));
    body.appendChild(h('div', { class: 'vm' }, [h('div', {}, [listEl, h('div', { class: 'fig-controls', style: 'margin:14px 0 0' }, [waitS.el, countS.el])]), h('div', {}, [stateEl, traceEl])]));
    body.appendChild(h('p', { class: 'fig-note', style: 'margin-top:18px', text: 'Below: what the port does with every command the original scripts use, from its census of October 8.' }));
    body.appendChild(census);
    body.appendChild(h('div', { class: 'census-key' }, CENSUS.map(function (c) {
      return h('span', {}, [h('i', { style: 'background:' + c[2] }), c[0] + ' ' + c[1].toLocaleString('en-US')]);
    })));
    load();
    fig.gta = { set: function (o) { if (o.wait) waitS.set(Number(o.wait)); if (o.count) countS.set(Number(o.count)); if (o.play) play(); } };
  }

  // =========================================================================
  // Braking for the car ahead (CCarCtrl::SlowCarDownForOtherCar)
  // =========================================================================
  function traffic(fig) {
    var body = mount(fig);
    var state = { gap: 14, cruise: 20, lead: 0 };
    var car = { position: { x: 0, y: 0 }, forward: { x: 0, y: 1 }, front: 2.4, back: 2.4, halfWidth: 1 };
    function target(gap) {
      var other = { position: { x: 0, y: gap }, forward: { x: 0, y: 1 }, front: 2.4, back: 2.4, halfWidth: 1, moveSpeed: { x: 0, y: state.lead / 60 } };
      var r = G.slowCarDownForOtherCar(car, other, state.cruise, state.cruise);
      return r ? r.speed : state.cruise;
    }
    var LW = 12, LH = 56, base = 50;
    var lane = svg('svg', { class: 'lane-view', viewBox: '0 0 ' + LW + ' ' + LH, role: 'img', 'aria-label': 'Two cars in a lane; drag the car ahead' });
    var W = 440, H = 220, P = { l: 34, r: 10, t: 12, b: 30 }, GMAX = 45, GMIN = 5;
    var chart = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Target speed against the gap to the car ahead' });
    var readout = h('div', { class: 'readout', 'aria-live': 'polite' });
    var gx = function (g) { return P.l + (W - P.l - P.r) * (g - GMIN) / (GMAX - GMIN); };
    function gy(v) { return P.t + (H - P.t - P.b) * (1 - v / Math.max(1, state.cruise)); }
    function render() {
      clear(lane);
      svg('rect', { class: 'bg', x: 2, y: 0, width: 8, height: LH }, lane);
      svg('line', { class: 'mark', x1: 2, x2: 2, y1: 0, y2: LH }, lane);
      svg('line', { class: 'mark', x1: 10, x2: 10, y1: 0, y2: LH }, lane);
      var me = svg('rect', { class: 'me', x: 5, y: base - 2.4, width: 2, height: 4.8, rx: 0.4 }, lane);
      void me;
      var y = base - Math.min(state.gap, base - 3);
      var them = svg('rect', { class: 'them', x: 5, y: y - 2.4, width: 2, height: 4.8, rx: 0.4 }, lane);
      svg('text', { x: 6, y: base + 5 }, lane).textContent = 'you';
      void them;

      clear(chart);
      [0, 0.5, 1].forEach(function (f) {
        var v = state.cruise * f;
        svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: gy(v), y2: gy(v) }, chart);
        svg('text', { x: P.l - 6, y: gy(v) + 3.5, 'text-anchor': 'end' }, chart).textContent = v.toFixed(0);
      });
      [5, 15, 25, 35, 45].forEach(function (g) { svg('text', { x: gx(g), y: H - 12, 'text-anchor': 'middle' }, chart).textContent = String(g); });
      svg('text', { x: W - P.r, y: H - 1, 'text-anchor': 'end' }, chart).textContent = 'gap between the cars’ centres';
      var d = '';
      for (var g = GMIN; g <= GMAX + 1e-9; g += 0.05) d += (g === GMIN ? 'M' : 'L') + gx(g).toFixed(1) + ' ' + gy(target(g)).toFixed(1);
      svg('path', { class: 'ln acc', d: d }, chart);
      var v = target(state.gap);
      svg('circle', { class: 'knob', cx: gx(state.gap), cy: gy(v), r: 6 }, chart);
      clear(readout);
      readout.appendChild(document.createTextNode('Target speed ' + v.toFixed(2) + ' of ' + state.cruise));
      readout.appendChild(h('span', { class: 'sub', text: v === 0 ? 'Stopped: contact would come within one unit.' : v === 1 && state.gap < 12 ? 'Crawling at 1: contact within three units.' : v < state.cruise * 0.61 ? 'Slowing in proportion to how soon the cars would touch.' : 'A car in the zone ahead: capped at about 62% of cruise.' }));
    }
    function setGap(g) { state.gap = Math.max(GMIN, Math.min(GMAX, g)); render(); }
    var drag = false;
    chart.addEventListener('pointerdown', function (e) { drag = true; chart.setPointerCapture(e.pointerId); var p = local(chart, e, W, H); setGap((p[0] - P.l) / (W - P.l - P.r) * (GMAX - GMIN) + GMIN); });
    chart.addEventListener('pointermove', function (e) { if (!drag) return; var p = local(chart, e, W, H); setGap((p[0] - P.l) / (W - P.l - P.r) * (GMAX - GMIN) + GMIN); });
    chart.addEventListener('pointerup', function () { drag = false; });
    lane.addEventListener('pointerdown', function (e) { lane.setPointerCapture(e.pointerId); var p = local(lane, e, LW, LH); setGap(base - p[1]); drag = true; });
    lane.addEventListener('pointermove', function (e) { if (!drag || !e.buttons) return; var p = local(lane, e, LW, LH); setGap(base - p[1]); });
    lane.addEventListener('pointerup', function () { drag = false; });
    var cruiseS = slider('Cruise speed', 10, 40, 1, state.cruise, String, function (v) { state.cruise = v; state.lead = Math.min(state.lead, v); render(); });
    var leadS = slider('Car ahead moving at', 0, 30, 1, state.lead, String, function (v) { state.lead = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [cruiseS.el, leadS.el]));
    body.appendChild(h('div', { class: 'traffic' }, [lane, h('div', {}, [readout, chart, h('p', { class: 'fig-note', text: 'Drag the car ahead, or along the curve.' })])]));
    render();
    fig.gta = { set: function (o) { if (o.gap) setGap(Number(o.gap)); if (o.cruise) cruiseS.set(Number(o.cruise)); if (o.lead !== undefined) leadS.set(Number(o.lead)); } };
  }

  // =========================================================================
  // Adaptive resolution on a made-up phone
  // =========================================================================
  var SCENARIOS = {
    gpu: { label: 'GPU-bound', fn: function (base, s) { return base * s * s; } },
    cpu: { label: 'CPU-bound', fn: function (base) { return base; } },
    warm: { label: 'Warming up', fn: function (base, s, t) { return t < 60000 ? base * 0.7 : base * 1.15 * s * s; } },
  };
  function resSim(kind, base) {
    var d = new G.DynamicResolution();
    var t = 0, pts = [], events = [];
    for (var i = 0; i < 40000 && t < 180000; i++) {
      var ms = SCENARIOS[kind].fn(base, d.scale, t);
      t += ms;
      var r = d.frame(t, true);
      pts.push([t, ms, d.scale]);
      if (r !== undefined) events.push([t, r, ms]);
    }
    return { pts: pts, events: events };
  }
  function resolution(fig) {
    var body = mount(fig);
    var state = { kind: 'gpu', base: 45 };
    var W = 640, H = 250, P = { l: 40, r: 10, t: 12, b: 28 }, SPLIT = 150;
    var chart = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Frame time and resolution scale over three minutes' });
    var list = h('div', { class: 'fig-note' });
    function render() {
      var sim = resSim(state.kind, state.base);
      clear(chart);
      var gx = function (t) { return P.l + (W - P.l - P.r) * t / 180000; };
      var maxMs = 80;
      var fy = function (ms) { return P.t + (SPLIT - P.t - 10) * (1 - Math.min(ms, maxMs) / maxMs); };
      var sy = function (s) { return SPLIT + 14 + (H - P.b - SPLIT - 14) * (1 - (s - 0.55) / 0.45); };
      svg('rect', { class: 'warn', x: P.l, y: fy(maxMs), width: W - P.l - P.r, height: fy(1000 / 26) - fy(maxMs) }, chart);
      [0, 20, 40, 60, 80].forEach(function (ms) {
        svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: fy(ms), y2: fy(ms) }, chart);
        svg('text', { x: P.l - 6, y: fy(ms) + 3.5, 'text-anchor': 'end' }, chart).textContent = ms + ' ms';
      });
      svg('text', { x: W - P.r, y: fy(1000 / 26) - 4, 'text-anchor': 'end' }, chart).textContent = 'slower than 26 fps';
      [1, 0.85, 0.72, 0.6].forEach(function (s) {
        svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: sy(s), y2: sy(s) }, chart);
        svg('text', { x: P.l - 6, y: sy(s) + 3.5, 'text-anchor': 'end' }, chart).textContent = Math.round(s * 100) + '%';
      });
      [0, 60, 120, 180].forEach(function (t) { svg('text', { x: gx(t * 1000), y: H - 8, 'text-anchor': t === 0 ? 'start' : t === 180 ? 'end' : 'middle' }, chart).textContent = t + ' s'; });
      // Frame times, averaged per quarter second so the line is legible.
      var d = '', bucket = -1, sum = 0, n = 0, ds = '', lastS = null;
      sim.pts.forEach(function (p, i) {
        var b = Math.floor(p[0] / 250);
        if (b !== bucket && n) { d += (d ? 'L' : 'M') + gx(bucket * 250 + 125).toFixed(1) + ' ' + fy(sum / n).toFixed(1); sum = 0; n = 0; }
        bucket = b; sum += p[1]; n++;
        if (p[2] !== lastS) { ds += (ds ? 'L' + gx(p[0]).toFixed(1) + ' ' + sy(lastS).toFixed(1) : 'M' + gx(p[0]).toFixed(1) + ' ' + sy(p[2]).toFixed(1)) + 'L' + gx(p[0]).toFixed(1) + ' ' + sy(p[2]).toFixed(1); lastS = p[2]; }
        if (i === sim.pts.length - 1) ds += 'L' + gx(p[0]).toFixed(1) + ' ' + sy(p[2]).toFixed(1);
      });
      svg('path', { class: 'ln faint', d: d }, chart);
      svg('path', { class: 'ln acc', d: ds }, chart);
      sim.events.forEach(function (e) { svg('circle', { class: 'dot', cx: gx(e[0]), cy: sy(e[1]), r: 3 }, chart); });
      svg('text', { x: P.l + 4, y: SPLIT + 8 }, chart).textContent = 'resolution scale';
      list.textContent = sim.events.length
        ? sim.events.slice(0, 8).map(function (e) { return (e[0] / 1000).toFixed(1) + ' s → ' + Math.round(e[1] * 100) + '%'; }).join(' · ') + (sim.events.length > 8 ? ' · …' : '')
        : 'No change: the game keeps up at full resolution.';
    }
    var kindTabs = tabs('Device', [['gpu', 'GPU-bound phone'], ['cpu', 'CPU-bound phone'], ['warm', 'A phone that warms up']], state.kind, function (v) { state.kind = v; render(); });
    var baseS = slider('Frame at full resolution', 20, 70, 1, state.base, function (v) { return v + ' ms'; }, function (v) { state.base = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [kindTabs.el]));
    body.appendChild(h('div', { class: 'fig-controls' }, [baseS.el]));
    body.appendChild(chart);
    body.appendChild(list);
    render();
    fig.gta = { set: function (o) { if (o.kind) kindTabs.set(o.kind); if (o.base) baseS.set(Number(o.base)); } };
  }

  // =========================================================================
  // One DXT1 block, decoded two ways
  // =========================================================================
  function rgb565(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (Math.round(r * 31 / 255) << 11) | (Math.round(g * 63 / 255) << 5) | Math.round(b * 31 / 255);
  }
  function dxt(fig) {
    var body = mount(fig);
    var state = { c0: '#e4572e', c1: '#2e86ab', idx: [0, 0, 2, 3, 0, 2, 3, 1, 2, 3, 1, 1, 3, 1, 1, 1] };
    var e0 = h('input', { type: 'color', value: state.c0, 'aria-label': 'First endpoint colour' });
    var e1 = h('input', { type: 'color', value: state.c1, 'aria-label': 'Second endpoint colour' });
    e0.addEventListener('input', function () { state.c0 = e0.value; render(); });
    e1.addEventListener('input', function () { state.c1 = e1.value; render(); });
    var swap = h('button', { class: 'btn', type: 'button', text: 'Swap endpoints', onclick: function () { var t = state.c0; state.c0 = state.c1; state.c1 = t; e0.value = state.c0; e1.value = state.c1; render(); } });
    var gIdx = h('div', { class: 'blk idx' }), gRgba = h('div', { class: 'blk' }), g5551 = h('div', { class: 'blk' });
    var pal = h('div', { class: 'pal' });
    var mode = h('p', { class: 'fig-note' });
    function render() {
      var a = rgb565(state.c0), b = rgb565(state.c1);
      var block = new Uint8Array(8);
      block[0] = a & 255; block[1] = a >> 8; block[2] = b & 255; block[3] = b >> 8;
      var bits = 0;
      for (var i = 0; i < 16; i++) bits |= (state.idx[i] & 3) << (i * 2);
      block[4] = bits & 255; block[5] = bits >>> 8 & 255; block[6] = bits >>> 16 & 255; block[7] = bits >>> 24 & 255;
      var rgba = G.decodeDxt(block, 4, 4, 'DXT1');
      var narrow = G.decodeDxt1To5551(block, 4, 4);
      clear(gIdx); clear(gRgba); clear(g5551);
      for (var p = 0; p < 16; p++) (function (p) {
        var cell = h('span', { text: String(state.idx[p]), title: 'Click to change' });
        cell.addEventListener('click', function () { state.idx[p] = (state.idx[p] + 1) % 4; render(); });
        gIdx.appendChild(cell);
        var A = rgba[p * 4 + 3];
        gRgba.appendChild(h('span', { class: A ? '' : 'clear', style: A ? 'background:rgb(' + rgba[p * 4] + ',' + rgba[p * 4 + 1] + ',' + rgba[p * 4 + 2] + ')' : '' }));
        var v = narrow[p];
        var on = v & 1;
        var r5 = v >> 11 & 31, g5 = v >> 6 & 31, b5 = v >> 1 & 31;
        g5551.appendChild(h('span', { class: on ? '' : 'clear', style: on ? 'background:rgb(' + (r5 << 3 | r5 >> 2) + ',' + (g5 << 3 | g5 >> 2) + ',' + (b5 << 3 | b5 >> 2) + ')' : '' }));
      })(p);
      // The palette, read off the decoded pixels for the first use of each index.
      clear(pal);
      for (var k = 0; k < 4; k++) {
        var at = state.idx.indexOf(k);
        var cell;
        if (at < 0) {
          var probe = block.slice();
          var fill = 0;
          for (var q = 0; q < 16; q++) fill |= k << (q * 2);
          probe[4] = fill & 255; probe[5] = fill >>> 8 & 255; probe[6] = fill >>> 16 & 255; probe[7] = fill >>> 24 & 255;
          cell = { rgba: G.decodeDxt(probe, 4, 4, 'DXT1'), n: G.decodeDxt1To5551(probe, 4, 4), i: 0 };
        } else cell = { rgba: rgba, n: narrow, i: at };
        var o = cell.i * 4, A2 = cell.rgba[o + 3];
        pal.appendChild(h('div', {}, [
          h('i', { class: A2 ? '' : 'clear', style: A2 ? 'background:rgb(' + cell.rgba[o] + ',' + cell.rgba[o + 1] + ',' + cell.rgba[o + 2] + ')' : '' }),
          h('span', { text: k + ': ' + (A2 ? cell.rgba[o] + ',' + cell.rgba[o + 1] + ',' + cell.rgba[o + 2] : 'clear') }),
          h('code', { text: '0x' + ('000' + cell.n[cell.i].toString(16)).slice(-4) }),
        ]));
      }
      mode.textContent = (a > b ? 'Four colours: the first endpoint is the larger 16-bit number, so indices 2 and 3 are blends.' : 'Three colours and clear: the first endpoint is not the larger, so index 3 means transparent.') +
        ' 8 bytes on disk; 64 decoded to RGBA, 32 decoded to 16-bit 5551.';
    }
    body.appendChild(h('div', { class: 'fig-controls' }, [h('span', { class: 'ends' }, ['Endpoints', e0, e1]), swap]));
    body.appendChild(h('div', { class: 'dxt' }, [
      h('div', {}, [h('h4', { text: 'Index per pixel (click)' }), gIdx]),
      h('div', {}, [h('h4', { text: 'Decoded to RGBA, 32 bits' }), gRgba]),
      h('div', {}, [h('h4', { text: 'Decoded to 5551, 16 bits' }), g5551]),
    ]));
    body.appendChild(pal);
    body.appendChild(mode);
    render();
    fig.gta = { set: function (o) { if (o.swap) swap.click(); } };
  }

  // =========================================================================
  // Touch stick to steering
  // =========================================================================
  function steering(fig) {
    var body = mount(fig);
    var state = { v: 1 / 3 };
    var W = 440, H = 260, P = { l: 40, r: 12, t: 12, b: 30 };
    var chart = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Steering against stick deflection' });
    var readout = h('div', { class: 'readout', 'aria-live': 'polite' });
    var gx = function (v) { return P.l + (W - P.l - P.r) * v; };
    var gy = function (v) { return P.t + (H - P.t - P.b) * (1 - v); };
    function render() {
      clear(chart);
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: gy(f), y2: gy(f) }, chart);
        svg('text', { x: P.l - 6, y: gy(f) + 3.5, 'text-anchor': 'end' }, chart).textContent = Math.round(f * 100) + '%';
        svg('text', { x: gx(f), y: H - 12, 'text-anchor': 'middle' }, chart).textContent = Math.round(f * 100) + '%';
      });
      svg('text', { x: W - P.r, y: H - 1, 'text-anchor': 'end' }, chart).textContent = 'how far the thumb pushes the stick';
      svg('rect', { class: 'band', x: gx(0), y: P.t, width: gx(0.35) - gx(0), height: H - P.t - P.b }, chart);
      svg('path', { class: 'ln faint dash', d: 'M' + gx(0) + ' ' + gy(0) + 'L' + gx(1) + ' ' + gy(1) }, chart);
      var d = '';
      for (var v = 0; v <= 1.0001; v += 0.01) d += (v === 0 ? 'M' : 'L') + gx(v).toFixed(1) + ' ' + gy(G.stickSteering(v)).toFixed(1);
      svg('path', { class: 'ln acc', d: d }, chart);
      var out = G.stickSteering(state.v);
      svg('line', { class: 'cursor', x1: gx(state.v), x2: gx(state.v), y1: gy(0), y2: gy(out) }, chart);
      svg('circle', { class: 'knob', cx: gx(state.v), cy: gy(out), r: 6 }, chart);
      svg('text', { x: gx(0.175), y: P.t + 14, 'text-anchor': 'middle' }, chart).textContent = 'fine-control zone';
      clear(readout);
      readout.appendChild(document.createTextNode('Stick ' + Math.round(state.v * 100) + '% → steering ' + (out * 100).toFixed(1) + '%'));
      readout.appendChild(h('span', { class: 'sub', text: 'Dashed: steering that follows the stick one for one.' }));
    }
    var drag = false;
    function at(e) { var p = local(chart, e, W, H); state.v = Math.max(0, Math.min(1, (p[0] - P.l) / (W - P.l - P.r))); render(); }
    chart.addEventListener('pointerdown', function (e) { drag = true; chart.setPointerCapture(e.pointerId); at(e); });
    chart.addEventListener('pointermove', function (e) { if (drag || (CAN_HOVER && e.pointerType === 'mouse')) at(e); });
    chart.addEventListener('pointerup', function () { drag = false; });
    body.appendChild(h('div', { class: 'traffic', style: 'grid-template-columns:minmax(0,1fr)' }, [readout, chart]));
    render();
    fig.gta = { set: function (o) { if (o.stick !== undefined) { state.v = Number(o.stick); render(); } } };
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    if (!G) return;
    var builders = { 'gta-stream': stream, 'gta-vm': vmFigure, 'gta-traffic': traffic, 'gta-res': resolution, 'gta-dxt': dxt, 'gta-steer': steering };
    Object.keys(builders).forEach(function (id) {
      var fig = document.getElementById(id);
      if (fig) builders[id](fig);
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.act');
    if (!a) return;
    var fig = document.querySelector(a.getAttribute('href'));
    if (!fig || !fig.gta) return;
    e.preventDefault();
    fig.gta.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) fig.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
