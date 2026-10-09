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
      svg('text', { class: f.held ? 'st held' : 'st', x: X(f.x), y: cy + 30, 'text-anchor': 'middle' }, road).textContent = f.held ? 'held' : f.pend !== null ? 'loading' : '';
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
    body.appendChild(h('div', { class: 'key' }, [
      h('span', {}, [h('i', { class: 'k-win' }), 'loaded window']), h('span', {}, [h('i', { class: 'k-hold' }), 'hold line']),
      h('span', {}, [h('i', { class: 'k-pend' }), 'loading']), h('span', {}, [h('i', { class: 'k-tick' }), 'window arrives']),
      h('span', {}, [h('i', { class: 'k-held' }), 'held']),
    ]));
    body.appendChild(factsBox);

    // What the port's own probe measured in the game (from its notes): window
    // load times and holds on a scripted 90-second drive, before and after the
    // streaming worker stopped re-decoding models it already had.
    var MW = 640, MH = 78;
    var meas = svg('svg', { class: 'chart measured', viewBox: '0 0 ' + MW + ' ' + MH, role: 'img', 'aria-label': 'In the game, on a scripted 90-second drive: windows took 1.3 to 1.9 seconds and the game held 53 times; after the fix, 60 to 350 milliseconds and one hold' });
    var mx = function (s) { return 96 + 200 * s / 2; };
    svg('text', { class: 'mh', x: 8, y: 12 }, meas).textContent = 'In the game, a 90 s drive';
    svg('text', { x: 96, y: 72 }, meas).textContent = '0';
    svg('text', { x: mx(2), y: 72, 'text-anchor': 'end' }, meas).textContent = '2 s to load a window';
    svg('text', { x: 350, y: 72 }, meas).textContent = 'holds';
    [['before', 1.3, 1.9, 53], ['after', 0.06, 0.35, 1]].forEach(function (r, i) {
      var y = 30 + i * 22;
      svg('text', { class: 'ml', x: 8, y: y + 3.5 }, meas).textContent = r[0];
      svg('line', { class: 'gl', x1: mx(0), x2: mx(2), y1: y, y2: y }, meas);
      svg('rect', { class: 'range', x: mx(r[1]), y: y - 4, width: Math.max(2, mx(r[2]) - mx(r[1])), height: 8, rx: 1 }, meas);
      svg('text', { x: mx(r[2]) + 6, y: y + 3.5 }, meas).textContent = r[1] >= 1 ? r[1] + ' to ' + r[2] + ' s' : Math.round(r[1] * 1000) + ' to ' + Math.round(r[2] * 1000) + ' ms';
      for (var k = 0; k < r[3]; k++) svg('line', { class: 'held', x1: 350 + k * 4.6, x2: 350 + k * 4.6, y1: y - 7, y2: y + 7 }, meas);
      svg('text', { x: 350 + r[3] * 4.6 + 4, y: y + 3.5 }, meas).textContent = r[3] + (r[3] === 1 ? ' hold' : ' holds');
    });
    body.appendChild(meas);

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
    var anatEl = h('div', { class: 'anat', 'aria-live': 'polite' });
    var hoverAt = null;
    var TYPE = { 1: ['32-bit', 4], 2: ['global var', 2], 3: ['local var', 2], 4: ['8-bit', 1], 5: ['16-bit', 2], 6: ['float', 4] };
    // One instruction's bytes, split the way the decoder reads them.
    function anatomy(ins) {
      clear(anatEl);
      var end = ins.offset, parts = [];
      var hex = function (b) { return (b < 16 ? '0' : '') + b.toString(16); };
      var op = bytes[end] | bytes[end + 1] << 8;
      parts.push({ b: [bytes[end], bytes[end + 1]], k: 'op', l: 'opcode 0x' + ('000' + op.toString(16)).slice(-4) });
      end += 2;
      ins.parameters.forEach(function (p) {
        var t = TYPE[bytes[end]] || ['type ' + bytes[end], 0];
        parts.push({ b: [bytes[end]], k: 'ty', l: t[0] });
        end += 1;
        parts.push({ b: bytes.slice(end, end + t[1]), k: 'va', l: p.type === 3 ? p.value + '@' : String(p.value) });
        end += t[1];
      });
      anatEl.appendChild(h('div', { class: 'anat-name', text: ins.offset + ': ' + ins.name }));
      var row = h('div', { class: 'anat-row' });
      parts.forEach(function (p) {
        row.appendChild(h('span', { class: 'part ' + p.k }, [h('code', { text: p.b.map(hex).join(' ') }), h('small', { text: p.l })]));
      });
      anatEl.appendChild(row);
    }
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
    function current() {
      for (var i = 0; i < listing.length; i++) if (listing[i].offset === thread.ip) return listing[i];
      return listing[listing.length - 1];
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
        row.addEventListener('pointerenter', function () { hoverAt = ins.offset; anatomy(ins); });
        row.addEventListener('pointerleave', function () { hoverAt = null; anatomy(current()); });
        listEl.appendChild(row);
      });
      anatomy(hoverAt !== null ? listing.filter(function (x) { return x.offset === hoverAt; })[0] : current());
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
      if (!trace.length) traceEl.appendChild(h('div', { text: '—' }));
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
    body.appendChild(h('div', { class: 'vm' }, [h('div', {}, [listEl, anatEl, h('div', { class: 'fig-controls', style: 'margin:14px 0 0' }, [waitS.el, countS.el])]), h('div', {}, [stateEl, traceEl])]));
    body.appendChild(census);
    body.appendChild(h('div', { class: 'census-key' }, CENSUS.map(function (c) {
      return h('span', {}, [h('i', { style: 'background:' + c[2] }), c[0] + ' ' + c[1].toLocaleString('en-US')]);
    })));
    load();
    fig.gta = { set: function (o) { if (o.wait) waitS.set(Number(o.wait)); if (o.count) countS.set(Number(o.count)); if (o.play) play(); } };
  }

  // =========================================================================
  // Braking for the car ahead (CCarCtrl::SlowCarDownForOtherCar), live
  // =========================================================================
  // Each simulated frame the blue car asks the port's function for a target
  // speed and accelerates or brakes toward it; positions are in game units.
  function traffic(fig) {
    var body = mount(fig);
    var CRUISE = 20, SPAN = 64, LEN = 4.8, K = 0.5; // K: speed units to units per second, for the picture only
    var state = { lead: 52, x: 12, v: CRUISE, trail: [], running: false };
    function targetAt(gap) {
      var me = { position: { x: 0, y: 0 }, forward: { x: 0, y: 1 }, front: LEN / 2, back: LEN / 2, halfWidth: 1 };
      var other = { position: { x: 0, y: gap }, forward: { x: 0, y: 1 }, front: LEN / 2, back: LEN / 2, halfWidth: 1, moveSpeed: { x: 0, y: 0 } };
      var r = G.slowCarDownForOtherCar(me, other, CRUISE, CRUISE);
      return r ? r.speed : CRUISE;
    }
    var RW = 640, RH = 96, sx = RW / SPAN;
    var road = svg('svg', { class: 'road2', viewBox: '0 0 ' + RW + ' ' + RH, role: 'img', 'aria-label': 'A lane with two cars; drag the grey car' });
    svg('rect', { class: 'bg', x: 0, y: 30, width: RW, height: 36 }, road);
    svg('line', { class: 'edge', x1: 0, x2: RW, y1: 30, y2: 30 }, road);
    svg('line', { class: 'edge', x1: 0, x2: RW, y1: 66, y2: 66 }, road);
    var gapLine = svg('line', { class: 'gapl', y1: 22, y2: 22 }, road);
    var gapText = svg('text', { class: 'gapt', y: 16 }, road);
    var me = svg('rect', { class: 'me', y: 38, height: 20, rx: 4, width: LEN * sx }, road);
    var them = svg('rect', { class: 'them', y: 38, height: 20, rx: 4, width: LEN * sx }, road);
    var speedText = svg('text', { class: 'spd', y: 86 }, road);

    var W = 640, H = 190, P = { l: 34, r: 10, t: 10, b: 26 }, GMIN = 5, GMAX = 40;
    var chart = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Target speed by gap, with the blue car’s path' });
    var gx = function (g) { return P.l + (W - P.l - P.r) * (Math.max(GMIN, Math.min(GMAX, g)) - GMIN) / (GMAX - GMIN); };
    var gy = function (v) { return P.t + (H - P.t - P.b) * (1 - v / CRUISE); };
    [0, 10, 20].forEach(function (v) {
      svg('line', { class: 'gl', x1: P.l, x2: W - P.r, y1: gy(v), y2: gy(v) }, chart);
      svg('text', { x: P.l - 6, y: gy(v) + 3.5, 'text-anchor': 'end' }, chart).textContent = String(v);
    });
    [5, 10, 20, 30, 40].forEach(function (g) { svg('text', { x: gx(g), y: H - 8, 'text-anchor': 'middle' }, chart).textContent = String(g); });
    svg('text', { x: P.l + 6, y: P.t + 10 }, chart).textContent = 'target speed, by gap';
    // The formula's branches, as bands: where it says stop, crawl, brake or cruise.
    var zones = [], cur = null;
    for (var z = GMIN; z <= GMAX + 1e-9; z += 0.05) {
      var tz = targetAt(z), flat = Math.abs(targetAt(z + 0.05) - tz) < 0.02;
      var kind = tz <= 0.01 ? 'stop' : tz >= CRUISE - 0.01 ? 'cruise' : flat && tz < CRUISE * 0.15 ? 'crawl' : 'brake';
      if (!cur || cur.kind !== kind) { cur = { kind: kind, from: z, to: z }; zones.push(cur); } else cur.to = z;
    }
    // Slivers at a boundary belong to the zone before them.
    zones = zones.filter(function (zn, i) {
      if (i && zn.to - zn.from < 0.2) { zones[i - 1].to = zn.to; return false; }
      return true;
    });
    zones.forEach(function (zn) {
      var x0 = gx(zn.from), x1 = gx(Math.min(GMAX, zn.to + 0.05));
      svg('rect', { class: 'zone ' + zn.kind, x: x0, y: P.t, width: Math.max(0, x1 - x0), height: H - P.t - P.b }, chart);
      // Narrow neighbouring zones get their labels on two lines.
      if (zn.kind !== 'cruise') svg('text', { class: 'zl', x: (x0 + x1) / 2, y: H - P.b - (zn.kind === 'crawl' ? 18 : 6), 'text-anchor': 'middle' }, chart).textContent = zn.kind;
    });
    var d = '';
    for (var g = GMIN; g <= GMAX + 1e-9; g += 0.05) d += (g === GMIN ? 'M' : 'L') + gx(g).toFixed(1) + ' ' + gy(targetAt(g)).toFixed(1);
    svg('path', { class: 'ln faint', d: d }, chart);
    var trail = svg('polyline', { class: 'ln acc' }, chart);
    var dot = svg('circle', { class: 'knob', r: 5 }, chart);

    function draw() {
      var gap = state.lead - state.x;
      me.setAttribute('x', ((state.x - LEN / 2) * sx).toFixed(1));
      them.setAttribute('x', ((state.lead - LEN / 2) * sx).toFixed(1));
      gapLine.setAttribute('x1', ((state.x + LEN / 2) * sx).toFixed(1));
      gapLine.setAttribute('x2', ((state.lead - LEN / 2) * sx).toFixed(1));
      gapText.setAttribute('x', (((state.x + state.lead) / 2) * sx).toFixed(1));
      gapText.textContent = 'gap ' + gap.toFixed(1);
      speedText.setAttribute('x', ((state.x - LEN / 2) * sx).toFixed(1));
      speedText.textContent = 'speed ' + state.v.toFixed(1) + (state.v < 0.05 ? ', stopped' : '');
      trail.setAttribute('points', state.trail.map(function (p) { return gx(p[0]).toFixed(1) + ',' + gy(p[1]).toFixed(1); }).join(' '));
      dot.setAttribute('cx', gx(gap)); dot.setAttribute('cy', gy(state.v));
    }
    function step(dt) {
      var gap = state.lead - state.x;
      var t = targetAt(gap);
      var dv = t - state.v;
      state.v += Math.max(-40 * dt, Math.min(12 * dt, dv));
      if (state.v < 0) state.v = 0;
      state.x += state.v * K * dt;
      state.trail.push([state.lead - state.x, state.v]);
      if (state.trail.length > 2000) state.trail.shift();
    }
    function run() {
      if (state.running) return;
      state.running = true;
      var last = performance.now(), quiet = 0;
      function tick(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        for (var i = 0; i < 4; i++) step(dt / 4);
        draw();
        quiet = state.v < 0.02 ? quiet + dt : 0;
        if (quiet > 1.5) { state.running = false; return; }
        requestAnimationFrame(tick);
      }
      if (REDUCE) { for (var j = 0; j < 4000 && !(state.v < 0.02 && j > 50); j++) step(1 / 60); draw(); state.running = false; return; }
      requestAnimationFrame(tick);
    }
    function restart(gap, v) {
      state.x = state.lead - gap;
      state.v = v;
      state.trail = [];
      draw();
      run();
    }
    var dragging = false;
    function dragTo(e) {
      var p = local(road, e, RW, RH);
      state.lead = Math.max(state.x + LEN + 0.3, Math.min(SPAN - LEN / 2, p[0] / sx));
      draw();
      run();
    }
    them.addEventListener('pointerdown', function (e) { dragging = true; road.setPointerCapture(e.pointerId); dragTo(e); });
    road.addEventListener('pointermove', function (e) { if (dragging) dragTo(e); });
    road.addEventListener('pointerup', function () { dragging = false; });
    var again = h('button', { class: 'btn', type: 'button', text: 'From the back', onclick: function () { restart(40, CRUISE); } });
    body.appendChild(h('div', { class: 'fig-controls' }, [h('span', { class: 'grow' }), again]));
    body.appendChild(road);
    body.appendChild(chart);
    restart(40, CRUISE);
    var seen = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && !seen) { seen = true; restart(40, CRUISE); } }, { threshold: 0.6 }).observe(road);
    }
    fig.gta = { set: function (o) { if (o.place) restart(Number(o.place), 0); } };
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
      // Each change the controller made: a step down, or a step undone. The
      // wait between an undo and the next try is drawn, since it doubles.
      var prevScale = 1, firstDown = true, firstUp = true, lastUp = null;
      sim.events.forEach(function (e) {
        var down = e[1] < prevScale;
        prevScale = e[1];
        svg('circle', { class: 'dot' + (down ? '' : ' up'), cx: gx(e[0]), cy: sy(e[1]), r: 3 }, chart);
        if (down && firstDown) { firstDown = false; svg('text', { class: 'ev', x: gx(e[0]) + 6, y: sy(e[1]) + 13 }, chart).textContent = 'step down'; }
        if (!down && firstUp) { firstUp = false; svg('text', { class: 'ev', x: gx(e[0]) + 6, y: sy(e[1]) - 6 }, chart).textContent = 'undone'; }
        if (down && lastUp !== null) {
          var y = sy(1) - 15, wait = (e[0] - lastUp) / 1000;
          svg('line', { class: 'wait', x1: gx(lastUp), x2: gx(e[0]), y1: y, y2: y }, chart);
          if (gx(e[0]) - gx(lastUp) > 22) svg('text', { class: 'ev', x: (gx(lastUp) + gx(e[0])) / 2, y: y - 3, 'text-anchor': 'middle' }, chart).textContent = (wait < 10 ? wait.toFixed(1) : Math.round(wait)) + ' s';
        }
        lastUp = down ? null : e[0];
      });
      svg('text', { x: W - P.r, y: SPLIT + 8, 'text-anchor': 'end' }, chart).textContent = 'resolution scale';
      if (!sim.events.length) svg('text', { class: 'ev', x: W - P.r, y: sy(1) - 6, 'text-anchor': 'end' }, chart).textContent = 'keeps up at full resolution';
    }
    var kindTabs = tabs('Device', [['gpu', 'GPU-bound phone'], ['cpu', 'CPU-bound phone'], ['warm', 'A phone that warms up']], state.kind, function (v) { state.kind = v; render(); });
    var baseS = slider('Frame at full resolution', 20, 70, 1, state.base, function (v) { return v + ' ms'; }, function (v) { state.base = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [kindTabs.el]));
    body.appendChild(h('div', { class: 'fig-controls' }, [baseS.el]));
    body.appendChild(chart);
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
        var cell = h('span', { text: String(state.idx[p]) });
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
      mode.textContent = a > b ? 'Four colours, since the first endpoint is the larger 16-bit number' : 'Three colours and clear, since the first endpoint is not the larger';
    }
    body.appendChild(h('div', { class: 'fig-controls' }, [h('span', { class: 'ends' }, ['Endpoints', e0, e1]), swap]));
    body.appendChild(h('div', { class: 'dxt' }, [
      h('div', {}, [h('h4', { text: 'Index per pixel · 8 bytes with the endpoints' }), gIdx]),
      h('div', {}, [h('h4', { text: 'RGBA, 32 bits · 64 bytes' }), gRgba]),
      h('div', {}, [h('h4', { text: '5551, 16 bits · 32 bytes' }), g5551]),
    ]));
    body.appendChild(pal);
    body.appendChild(mode);
    // What that halving comes to in the game, from the port's notes.
    var sz = svg('svg', { class: 'chart sizes', viewBox: '0 0 640 54', role: 'img', 'aria-label': 'The textures around Grove Street: 93 megabytes at 32 bits, 46 at 16' });
    svg('text', { class: 'mh', x: 8, y: 12 }, sz).textContent = 'Textures around Grove Street';
    [['32-bit', 93], ['16-bit', 46]].forEach(function (r, i) {
      var y = 24 + i * 14;
      svg('text', { class: 'ml', x: 8, y: y + 8 }, sz).textContent = r[0];
      svg('rect', { class: 'range' + (i ? ' acc' : ''), x: 64, y: y, width: 560 * r[1] / 93, height: 10, rx: 1 }, sz);
      svg('text', { class: 'in', x: 64 + 560 * r[1] / 93 - 5, y: y + 8, 'text-anchor': 'end' }, sz).textContent = r[1] + ' MB';
    });
    body.appendChild(sz);
    render();
    fig.gta = { set: function (o) { if (o.swap) swap.click(); } };
  }

  // =========================================================================
  // Touch stick to steering: a thumbstick and two wheels
  // =========================================================================
  function wheel(parent, label) {
    var s = svg('svg', { class: 'wheel', viewBox: '-60 -60 120 136', role: 'img', 'aria-label': label }, parent);
    var g = svg('g', {}, s);
    svg('circle', { class: 'rim', r: 46 }, g);
    svg('circle', { class: 'hub', r: 9 }, g);
    svg('path', { class: 'spoke', d: 'M-46 0H-9M9 0H46M0 9V46' }, g);
    svg('rect', { class: 'top', x: -3, y: -50, width: 6, height: 10, rx: 2 }, g);
    var t = svg('text', { class: 'wl', y: 66, 'text-anchor': 'middle' }, s);
    return { g: g, t: t };
  }
  function steering(fig) {
    var body = mount(fig);
    var R = 70, state = { x: 0, dragging: false };
    var pad = svg('svg', { class: 'stick', viewBox: '-100 -100 200 200', role: 'img', 'aria-label': 'A touch stick; drag the knob left or right' });
    svg('circle', { class: 'base', r: R + 26 }, pad);
    svg('line', { class: 'axis', x1: -R, x2: R, y1: 0, y2: 0 }, pad);
    var knob = svg('circle', { class: 'nub', r: 26 }, pad);
    var wheels = h('div', { class: 'wheels' });
    var flat = wheel(wheels, 'Steering one for one');
    var port = wheel(wheels, 'The port’s steering');
    var W = 200, H = 110, P = 8;
    var inset = svg('svg', { class: 'chart inset', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'The steering curve' });
    var gx = function (v) { return P + (W - 2 * P) * v; }, gy = function (v) { return H - P - (H - 2 * P) * v; };
    svg('path', { class: 'ln faint dash', d: 'M' + gx(0) + ' ' + gy(0) + 'L' + gx(1) + ' ' + gy(1) }, inset);
    var d = '';
    for (var v = 0; v <= 1.0001; v += 0.02) d += (v === 0 ? 'M' : 'L') + gx(v).toFixed(1) + ' ' + gy(G.stickSteering(v)).toFixed(1);
    svg('path', { class: 'ln acc', d: d }, inset);
    var mark = svg('circle', { class: 'dot', r: 4 }, inset);

    function draw() {
      var out = G.stickSteering(state.x);
      knob.setAttribute('cx', (state.x * R).toFixed(1));
      flat.g.setAttribute('transform', 'rotate(' + (state.x * 120).toFixed(1) + ')');
      port.g.setAttribute('transform', 'rotate(' + (out * 120).toFixed(1) + ')');
      flat.t.textContent = 'one for one: ' + Math.round(Math.abs(state.x) * 100) + '%';
      port.t.textContent = 'web-gta: ' + Math.round(Math.abs(out) * 100) + '%';
      var a = Math.abs(state.x);
      mark.setAttribute('cx', gx(a)); mark.setAttribute('cy', gy(Math.abs(out)));
    }
    function at(e) {
      var p = local(pad, e, 200, 200);
      state.x = Math.max(-1, Math.min(1, (p[0] - 100) / R));
      draw();
    }
    // Let go and the stick springs back to the centre, as a thumbstick does.
    function release() {
      state.dragging = false;
      if (REDUCE) { state.x = 0; draw(); return; }
      (function spring() {
        if (state.dragging) return;
        state.x *= 0.78;
        if (Math.abs(state.x) < 0.004) state.x = 0;
        draw();
        if (state.x) requestAnimationFrame(spring);
      })();
    }
    pad.addEventListener('pointerdown', function (e) { state.dragging = true; pad.setPointerCapture(e.pointerId); at(e); });
    pad.addEventListener('pointermove', function (e) { if (state.dragging) at(e); });
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    pad.setAttribute('tabindex', '0');
    pad.addEventListener('keydown', function (e) {
      var step = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key];
      if (!step) return;
      e.preventDefault();
      state.x = Math.max(-1, Math.min(1, state.x + step));
      draw();
    });
    body.appendChild(h('div', { class: 'steer' }, [pad, wheels, inset]));
    draw();
    // A slow push to the right and back, once, so the difference shows before anyone touches it.
    var shown = false;
    if ('IntersectionObserver' in window && !REDUCE) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting || shown) return;
        shown = true;
        var t0 = performance.now();
        (function demo(now) {
          if (state.dragging) return;
          var t = (now - t0) / 1000;
          state.x = t < 2.4 ? Math.sin(Math.min(1, t / 2.4) * Math.PI) * 0.7 : 0;
          draw();
          if (t < 2.4) requestAnimationFrame(demo);
        })(t0);
      }, { threshold: 0.6 }).observe(pad);
    }
    fig.gta = { set: function (o) { if (o.stick !== undefined) { state.x = Number(o.stick); draw(); } } };
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
