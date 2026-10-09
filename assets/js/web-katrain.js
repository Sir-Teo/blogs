// Figures for "Putting KataGo in a browser tab".
//
// The numbers come from web-katrain's own engine code, run offline with the
// bundled g170 b6c96 network (CPU backend for the golden board, WASM for the
// searched game; see _tools/web-katrain-demo) and saved to
// /assets/data/web-katrain-demo.json. Nothing here runs a neural network.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var COLS = 'ABCDEFGHJKLMNOPQRST';

  // KaTrain's move classes: thresholds on points lost, theme:normal colours.
  var THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];
  var CLASS_NAMES = ['Blunder', 'Mistake', 'Inaccuracy', 'Slight loss', 'Good', 'Best'];
  var CLASS_COLORS = [
    [0.447, 0.129, 0.42], [0.8, 0, 0], [0.9, 0.4, 0.1],
    [0.95, 0.95, 0], [0.67, 0.9, 0.18], [0.117, 0.588, 0],
  ].map(function (c) {
    return 'rgb(' + c.map(function (v) { return Math.round(v * 255); }).join(',') + ')';
  });

  function evalClass(pointsLost) {
    var loss = isFinite(pointsLost) ? pointsLost : 0;
    var i = 0;
    while (i < THRESHOLDS.length - 1 && loss < THRESHOLDS[i]) i++;
    return i;
  }

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

  function pct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function signed(v, d) {
    var s = Math.abs(v).toFixed(d === undefined ? 1 : d);
    if (+s === 0) return s;
    return (v > 0 ? '+' : '−') + s;
  }
  function coordName(x, y, n) { return x < 0 ? 'pass' : COLS[x] + (n - y); }
  function parseGtp(s, n) {
    if (!s || s === 'pass') return null;
    return [COLS.indexOf(s[0]), n - parseInt(s.slice(1), 10)];
  }

  // Text tabs. Returns the element and set(value), which also fires onChange.
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

  var ICONS = {
    first: 'M11.5 4 7.5 8l4 4M4.5 4v8',
    prev: 'M10 4 6 8l4 4',
    next: 'M6 4l4 4-4 4',
    last: 'M4.5 4l4 4-4 4M11.5 4v8',
  };
  function iconButton(icon, label, onClick) {
    var b = h('button', { class: 'btn icon', type: 'button', 'aria-label': label, title: label, onclick: onClick });
    svg('path', { d: ICONS[icon] }, svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, b));
    return b;
  }
  function checkbox(label, checked, onChange) {
    var input = h('input', { type: 'checkbox' });
    input.checked = checked;
    input.addEventListener('change', function () { onChange(input.checked); });
    return h('label', { class: 'check' }, [input, label]);
  }
  // Interactive content goes above the figure's caption.
  function mount(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }

  // ---- Board ---------------------------------------------------------------
  function makeBoard(n, label) {
    var m = 0.9;
    var span = n - 1 + 2 * m;
    var el = svg('svg', { class: 'board', viewBox: [-m, -m, span, span].join(' '), role: 'img', 'aria-label': label });
    svg('rect', { class: 'wood', x: -m, y: -m, width: span, height: span, rx: 0.1 }, el);
    var grid = svg('g', { class: 'grid' }, el);
    for (var i = 0; i < n; i++) {
      svg('line', { x1: 0, y1: i, x2: n - 1, y2: i }, grid);
      svg('line', { x1: i, y1: 0, x2: i, y2: n - 1 }, grid);
    }
    var stars = n === 9 ? [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]] : n === 19 ? [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]] : [];
    stars.forEach(function (s) { svg('circle', { class: 'star', cx: s[0], cy: s[1], r: 0.07 }, el); });
    for (var c = 0; c < n; c++) {
      svg('text', { class: 'coord', x: c, y: -0.56 }, el).textContent = COLS[c];
      svg('text', { class: 'coord', x: -0.58, y: c }, el).textContent = String(n - c);
    }
    var L = {};
    ['under', 'stones', 'dead', 'over', 'labels', 'hits'].forEach(function (k) { L[k] = svg('g', {}, el); });
    return { el: el, n: n, L: L };
  }

  function drawStones(b, rows, dim) {
    clear(b.L.stones);
    for (var y = 0; y < b.n; y++) for (var x = 0; x < b.n; x++) {
      var ch = rows[y][x];
      if (ch === '.') continue;
      svg('circle', { cx: x, cy: y, r: 0.46, class: (ch === 'x' ? 'sb' : 'sw') + (dim ? ' dim' : '') }, b.L.stones);
    }
  }

  // Who owns each point, as a square whose area follows the strength of the
  // claim. Values are Black-positive; `size` maps a value to 0..1 (0 = none).
  // On a stone, a square only appears when the other colour owns the point,
  // which is how KaTrain marks dead stones.
  function drawSquares(b, rows, values, size) {
    clear(b.L.under);
    clear(b.L.dead);
    if (!values) return;
    for (var i = 0; i < b.n * b.n; i++) {
      var v = values[i];
      var s = v ? size(v) : 0;
      if (!(s > 0)) continue;
      var x = i % b.n, y = Math.floor(i / b.n), ch = rows[y][x];
      var side, layer;
      if (ch === '.') { side = 0.78 * s; layer = b.L.under; }
      else if ((ch === 'x') !== (v > 0)) { side = 0.44 * s; layer = b.L.dead; }
      else continue;
      svg('rect', { class: v > 0 ? 'ob' : 'ow', x: x - side / 2, y: y - side / 2, width: side, height: side }, layer);
    }
  }
  function ownershipSize(v) { var a = Math.abs(v); return a < 0.05 ? 0 : Math.sqrt(Math.min(1, a)); }

  function drawLast(b, rows, mv) {
    if (!mv || mv === 'pass') return;
    var black = rows[mv[1]][mv[0]] === 'x';
    svg('circle', { class: 'last', cx: mv[0], cy: mv[1], r: 0.19, stroke: black ? '#fff' : '#111' }, b.L.over);
  }

  function label(b, x, y, text, cls) {
    svg('text', { class: 'label ' + cls, x: x, y: y }, b.L.labels).textContent = text;
  }

  // ---- Data ----------------------------------------------------------------
  var dataPromise = null;
  function loadData(url) {
    if (!dataPromise) dataPromise = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    return dataPromise;
  }

  // =========================================================================
  // Which backend would web-katrain pick in this browser?
  // =========================================================================
  function envCheck(fig) {
    var body = mount(fig);
    body.appendChild(h('p', { class: 'fig-loading', text: 'Checking this browser…' }));

    var simdProbe = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
    var wasm = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
    var simd = false;
    try { simd = wasm && WebAssembly.validate(simdProbe); } catch (e) {}
    var sab = typeof SharedArrayBuffer !== 'undefined';
    var isolated = self.crossOriginIsolated === true;
    var threads = wasm && sab && isolated;
    var cores = navigator.hardwareConcurrency || 0;

    var gpu = !('gpu' in navigator)
      ? Promise.resolve(false)
      : navigator.gpu.requestAdapter().then(function (a) { return !!a; }, function () { return false; });

    gpu.then(function (hasGpu) {
      var pick = hasGpu ? 'webgpu' : wasm ? 'wasm' : 'cpu';
      var wasmDetail = (threads ? 'threaded' : 'one thread') + (simd ? ', SIMD' : '');
      clear(body);

      var chain = h('p', { class: 'env-chain' });
      [
        ['webgpu', 'WebGPU', hasGpu, 'GPU shaders'],
        ['wasm', 'WebAssembly', wasm, wasmDetail],
        ['cpu', 'CPU', true, 'plain JavaScript'],
      ].forEach(function (s, i) {
        if (i) chain.appendChild(h('span', { class: 'sep', 'aria-hidden': 'true', text: '→' }));
        var picked = s[0] === pick;
        chain.appendChild(h('span', {
          class: 'step' + (picked ? ' picked' : s[2] ? '' : ' off'),
          'aria-label': s[1] + (picked ? ', picked' : s[2] ? ', available' : ', unavailable'),
        }, [s[1], picked ? h('span', { class: 'detail', text: s[3] }) : null]));
      });
      body.appendChild(chain);

      var yes = function (ok) { return h('dd', { class: ok ? '' : 'no', text: ok ? 'yes' : 'no' }); };
      var list = h('dl', { class: 'env-list' });
      [
        ['WebGPU adapter', yes(hasGpu)],
        ['WebAssembly', yes(wasm)],
        ['WASM SIMD', yes(simd)],
        ['SharedArrayBuffer', yes(sab)],
        ['Cross-origin isolated', yes(isolated)],
        ['Logical cores', h('dd', { text: cores ? String(cores) : 'hidden' })],
      ].forEach(function (row) { list.appendChild(h('div', {}, [h('dt', { text: row[0] }), row[1]])); });
      body.appendChild(list);
    });
  }

  // =========================================================================
  // KataGo's golden 5x5 position: KataGo against web-katrain.
  // =========================================================================
  // KataGo's own recorded output (cpp/tests/results/runNNOnTinyBoardTest.txt):
  // g170-b6c96, white to play, Tromp-Taylor, komi 7.5, symmetry 3. Permille from
  // White's side; -1 marks an occupied point.
  var KATAGO_REF = {
    win: 0.9025, lead: 7.87,
    policy: [[0, 0, 0, 0, 0], [0, 3, 150, -1, 0], [0, 237, -1, 607, 0], [0, -1, -1, -1, 0], [0, 0, 0, 1, 0]],
    ownership: [[-21, -257, 64, -419, 121], [-129, -354, -489, -148, 241], [-341, -367, -294, 46, 292], [-322, -457, -80, 559, 277], [-247, -395, -127, -132, 91]],
  };

  function golden(fig, data) {
    var g = data.golden;
    var n = g.diagram.length;
    var body = mount(fig);
    var state = { layer: 'policy', source: 'katago' };
    var board = makeBoard(n, 'KataGo golden test position, 5 by 5, white to play');
    drawStones(board, g.diagram);
    var note = h('p', { class: 'board-note' });
    var DEFAULT_NOTE = '';

    var gap = { policy: 0, ownership: 0 };
    ['policy', 'ownership'].forEach(function (k) {
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        if (k === 'policy' && KATAGO_REF.policy[y][x] < 0) continue;
        gap[k] = Math.max(gap[k], Math.abs(g.ours[k][y][x] - KATAGO_REF[k][y][x]));
      }
    });

    function render() {
      clear(board.L.over);
      clear(board.L.labels);
      var ref = KATAGO_REF[state.layer], ours = g.ours[state.layer];
      var grid = state.source === 'ours' ? ours : ref;
      var squares = null;
      if (state.layer === 'ownership' && state.source !== 'gap') {
        squares = [];
        for (var i = 0; i < n * n; i++) squares.push(-grid[Math.floor(i / n)][i % n] / 1000); // to Black-positive
      }
      drawSquares(board, g.diagram, squares, ownershipSize);

      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var occupied = g.diagram[y][x] !== '.';
        if (state.source === 'gap') {
          if (state.layer === 'policy' && occupied) continue;
          var d = ours[y][x] - ref[y][x];
          if (d) label(board, x, y, (d > 0 ? '+' : '−') + Math.abs(d), occupied ? (g.diagram[y][x] === 'x' ? 'on-b' : 'on-w') : 'on-board');
        } else if (state.layer === 'policy' && !occupied && grid[y][x] > 0) {
          var r = 0.1 + 0.34 * Math.sqrt(grid[y][x] / 1000);
          svg('circle', { class: 'policy', cx: x, cy: y, r: r }, board.L.over);
          label(board, x, y, String(grid[y][x]), r > 0.24 ? 'on-b' : 'on-board');
        }
      }
    }

    // Per-point readout on hover or tap.
    for (var i = 0; i < n * n; i++) (function (x, y) {
      var hit = svg('rect', { class: 'hit', x: x - 0.5, y: y - 0.5, width: 1, height: 1 }, board.L.hits);
      hit.addEventListener('pointerenter', function () {
        var name = COLS[x] + (n - y);
        var k = state.layer;
        if (k === 'policy' && KATAGO_REF.policy[y][x] < 0) { note.textContent = name + ' is occupied.'; return; }
        note.textContent = name + ' ' + k + ': KataGo ' + KATAGO_REF[k][y][x] + '‰, web-katrain ' + g.ours[k][y][x] + '‰';
      });
      hit.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') note.textContent = DEFAULT_NOTE; });
    })(i % n, Math.floor(i / n));
    note.textContent = DEFAULT_NOTE;

    var row = function (name, a, b) {
      return h('tr', {}, [h('td', { text: name }), h('td', { class: 'r', text: a }), b === null ? null : h('td', { class: 'r', text: b })]);
    };
    var table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', { text: '' }), h('th', { class: 'r', text: 'KataGo' }), h('th', { class: 'r', text: 'web-katrain' })])]),
      h('tbody', {}, [
        row('White win rate', pct(KATAGO_REF.win, 2), pct(g.ours.win, 2)),
        row('White score lead', KATAGO_REF.lead.toFixed(2), g.ours.lead.toFixed(3)),
        h('tr', {}, [h('td', { text: 'Largest policy gap' }), h('td', { class: 'r', colspan: '2', text: gap.policy + '‰' })]),
        h('tr', {}, [h('td', { text: 'Largest ownership gap' }), h('td', { class: 'r', colspan: '2', text: gap.ownership + '‰' })]),
      ]),
    ]);

    var layerTabs = tabs('Network output', [['policy', 'Policy'], ['ownership', 'Ownership']], state.layer, function (v) { state.layer = v; note.textContent = DEFAULT_NOTE; render(); });
    var sourceTabs = tabs('Source', [['katago', 'KataGo'], ['ours', 'web-katrain'], ['gap', 'Difference']], state.source, function (v) { state.source = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [layerTabs.el, sourceTabs.el]));
    body.appendChild(h('div', { class: 'golden' }, [h('div', {}, [board.el, note]), table]));
    render();

    fig.wk = {
      set: function (o) {
        if (o.layer) layerTabs.set(o.layer);
        if (o.source) sourceTabs.set(o.source);
      },
    };
  }

  // =========================================================================
  // PUCT playground
  // =========================================================================
  function puct(fig, data) {
    var game = data.game;
    var n = game.size;
    var at = data.puct.at;
    var frame = game.frames[at];
    var body = mount(fig);
    var moverIsBlack = frame.toPlay === 'b';
    var toMover = function (wB) { return moverIsBlack ? wB : 1 - wB; };
    var arms = frame.cands.filter(function (c) { return c.x >= 0; }).slice(0, 6).map(function (c, i) {
      return { x: c.x, y: c.y, prior: c.p, win: toMover(c.w), real: c.v, tag: String.fromCharCode(65 + i), n: 0, sum: 0 };
    });
    var rawUtility = 2 * toMover(frame.rawWinB) - 1;
    var realTotal = arms.reduce(function (s, a) { return s + a.real; }, 0);
    var maxPrior = Math.max.apply(null, arms.map(function (a) { return a.prior; }));
    var NOISE = 0.35;
    var state = { c: 1.0, showReal: false, total: 0 };

    var seed;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function gauss() { var u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function reset() { seed = 12345; arms.forEach(function (a) { a.n = 0; a.sum = 0; }); }
    reset();

    // KataGo's root selection without the utility-stdev factor.
    function scores() {
      var W = 0, sum = 0, visitedMass = 0;
      arms.forEach(function (a) { W += a.n; sum += a.sum; if (a.n) visitedMass += a.prior; });
      var parent = (rawUtility + sum) / (1 + W);
      var w = Math.min(1, visitedMass * visitedMass);
      var fpu = w * parent + (1 - w) * rawUtility - 0.1 * Math.sqrt(visitedMass);
      var explore = (state.c + 0.45 * Math.log((W + 500) / 500)) * Math.sqrt(W + 0.01);
      return arms.map(function (a) {
        var q = a.n ? a.sum / a.n : fpu;
        return { q: q, total: q + explore * a.prior / (1 + a.n) };
      });
    }
    function nextIndex(sc) {
      var best = 0;
      for (var i = 1; i < sc.length; i++) if (sc[i].total > sc[best].total) best = i;
      return best;
    }
    function playout() {
      var a = arms[nextIndex(scores())];
      a.n += 1;
      a.sum += Math.max(-1, Math.min(1, 2 * a.win - 1 + NOISE * gauss()));
    }

    var board = makeBoard(n, 'Move ' + at + ' position with six lettered candidate moves');
    drawStones(board, frame.board);
    drawLast(board, frame.board, game.frames[at - 1] && game.frames[at - 1].move);
    var markers = arms.map(function (a) {
      var m = {
        c: svg('circle', { class: 'marker', cx: a.x, cy: a.y, r: 0.36 }, board.L.over),
        t: svg('text', { class: 'marker-label', x: a.x, y: a.y }, board.L.labels),
      };
      m.t.textContent = a.tag;
      return m;
    });

    var rows = arms.map(function (a) {
      var prior = h('i'), visits = h('i'), tick = h('b');
      var nEl = h('span', { class: 'n' }), qEl = h('span', { class: 'q' });
      var row = h('div', { class: 'arm' }, [
        h('span', { class: 'ptr', 'aria-hidden': 'true', text: '→' }),
        h('span', { class: 'tag', text: a.tag }),
        h('span', { class: 'mv', text: coordName(a.x, a.y, n) }),
        h('div', { class: 'bars' }, [h('div', { class: 'prior' }, [prior]), h('div', { class: 'visits' }, [visits, tick])]),
        nEl,
        qEl,
      ]);
      prior.style.width = (100 * a.prior / maxPrior).toFixed(1) + '%';
      return { row: row, visits: visits, tick: tick, n: nEl, q: qEl };
    });

    var counter = h('span', { class: 'fig-num', 'aria-live': 'polite' });
    function render() {
      var sc = scores();
      var next = nextIndex(sc);
      var W = arms.reduce(function (s, a) { return s + a.n; }, 0);
      arms.forEach(function (a, i) {
        var r = rows[i];
        r.row.classList.toggle('next', i === next);
        markers[i].c.classList.toggle('next', i === next);
        markers[i].t.classList.toggle('next', i === next);
        r.visits.style.width = (W ? 100 * a.n / W : 0).toFixed(1) + '%';
        r.tick.style.display = state.showReal ? 'block' : 'none';
        r.tick.style.left = (100 * a.real / realTotal).toFixed(1) + '%';
        r.n.textContent = String(a.n);
        r.q.textContent = a.n ? pct((sc[i].q + 1) / 2, 0) : '—';
        r.q.title = a.n ? 'Average win rate over this move’s playouts' : 'Unvisited: first-play urgency';
      });
      counter.textContent = W + (W === 1 ? ' playout' : ' playouts');
    }
    // The figure always shows `total` playouts at the current constant, so moving
    // the slider replays the same budget instead of mixing two settings.
    function replay() {
      reset();
      for (var i = 0; i < state.total; i++) playout();
      render();
    }
    var run = function (k) { return function () { state.total += k; for (var i = 0; i < k; i++) playout(); render(); }; };

    var cOut = h('output', { text: state.c.toFixed(2) });
    var cInput = h('input', { type: 'range', min: '0.1', max: '4', step: '0.05', value: String(state.c), 'aria-label': 'Exploration constant' });
    function setC(c) {
      state.c = c;
      cInput.value = String(c);
      cOut.textContent = c.toFixed(2);
      replay();
    }
    cInput.addEventListener('input', function () { setC(parseFloat(cInput.value)); });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      h('div', { class: 'group' }, [
        h('button', { class: 'btn', type: 'button', text: 'Step', onclick: run(1) }),
        h('button', { class: 'btn', type: 'button', text: '+10', onclick: run(10) }),
        h('button', { class: 'btn', type: 'button', text: '+100', onclick: run(100) }),
        h('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () { state.total = 0; replay(); } }),
      ]),
      h('span', { class: 'grow' }),
      counter,
    ]));
    body.appendChild(h('div', { class: 'puct' }, [
      board.el,
      h('div', { class: 'arms' }, [
        h('div', { class: 'arm arm-head', 'aria-hidden': 'true' }, [
          h('span'), h('span'), h('span', { text: 'Move' }),
          h('span', { text: 'Prior (thin) and share of visits' }),
          h('span', { class: 'n', text: 'N' }), h('span', { class: 'q', text: 'Win' }),
        ]),
      ].concat(rows.map(function (r) { return r.row; }))),
    ]));
    var realBox = checkbox('Mark the full search (' + frame.visits + ' visits)', false, function (v) { state.showReal = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls', style: 'margin:20px 0 0' }, [
      h('label', { class: 'slider' }, ['Exploration', cInput, cOut]),
      realBox,
    ]));
    render();

    fig.wk = {
      set: function (o) {
        if (o.playouts !== undefined) state.total = parseInt(o.playouts, 10) || 0;
        if (o.real !== undefined) { realBox.firstChild.checked = o.real === 'true'; state.showReal = realBox.firstChild.checked; }
        setC(o.c !== undefined ? parseFloat(o.c) : state.c);
      },
    };
  }

  // =========================================================================
  // Game review
  // =========================================================================
  function review(fig, data) {
    var game = data.game;
    var n = game.size;
    var F = game.frames;
    var last = F.length - 1;
    var body = mount(fig);
    var state = { k: Math.min((data.review && data.review.start) || 0, last), overlay: 'none', top: true, hover: null };
    var endedByPasses = last >= 2 && F[last - 1].move === 'pass' && F[last - 2].move === 'pass';

    // Points lost by the move that reached frame k, from the mover's side.
    var lost = F.map(function (f, k) {
      if (k === 0 || F[k - 1].move === 'pass') return null;
      var sign = F[k - 1].toPlay === 'b' ? 1 : -1;
      return sign * (F[k - 1].leadB - f.leadB);
    });

    var board = makeBoard(n, '9 by 9 self-play game');
    var note = h('p', { class: 'board-note' });
    var head = h('div', { class: 'move-head', 'aria-live': 'polite' });
    var sub = h('div', { class: 'move-sub' });
    var sub2 = h('div', { class: 'move-sub' });

    // Transport
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', max: String(last), step: '1', 'aria-label': 'Move number' });
    slider.addEventListener('input', function () { go(parseInt(slider.value, 10)); });
    var transport = h('div', { class: 'transport' }, [
      iconButton('first', 'First move', function () { go(0); }),
      iconButton('prev', 'Previous move', function () { go(state.k - 1); }),
      slider,
      iconButton('next', 'Next move', function () { go(state.k + 1); }),
      iconButton('last', 'Last move', function () { go(last); }),
      counter,
    ]);

    // Score graph
    var GW = 360, GH = 132, PAD = { l: 30, r: 4, t: 8, b: 16 };
    var graph = svg('svg', { class: 'graph', viewBox: '0 0 ' + GW + ' ' + GH, role: 'img', 'aria-label': 'Score lead by move; dots mark moves that lost 1.5 points or more' });
    var leads = F.map(function (f) { return f.leadB; });
    var span = Math.max(4, Math.ceil(Math.max.apply(null, leads.map(Math.abs)) / 4) * 4);
    var gx = function (k) { return PAD.l + (GW - PAD.l - PAD.r) * k / last; };
    var gy = function (v) { return PAD.t + (GH - PAD.t - PAD.b) * (span - v) / (2 * span); };
    svg('line', { class: 'zero', x1: PAD.l, x2: GW - PAD.r, y1: gy(0), y2: gy(0) }, graph);
    svg('text', { x: 0, y: gy(span) + 4 }, graph).textContent = 'B+' + span;
    svg('text', { x: 0, y: gy(-span) + 3 }, graph).textContent = 'W+' + span;
    svg('text', { x: GW - PAD.r, y: GH - 2, 'text-anchor': 'end' }, graph).textContent = String(last);
    var pts = leads.map(function (v, k) { return gx(k).toFixed(1) + ',' + gy(v).toFixed(1); });
    svg('polygon', { class: 'area', points: [gx(0) + ',' + gy(0)].concat(pts, [gx(last) + ',' + gy(0)]).join(' ') }, graph);
    svg('polyline', { class: 'line', points: pts.join(' ') }, graph);
    lost.forEach(function (pl, k) {
      if (pl === null) return;
      var cls = evalClass(pl);
      if (cls < 4) svg('circle', { class: 'mark', cx: gx(k), cy: gy(leads[k]), r: cls <= 1 ? 3.6 : 2.8, fill: CLASS_COLORS[cls] }, graph);
    });
    var cursor = svg('line', { class: 'cursor', y1: PAD.t, y2: GH - PAD.b }, graph);
    var scrub = function (e) {
      var r = graph.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * GW;
      go(Math.round((px - PAD.l) / (GW - PAD.l - PAD.r) * last));
    };
    graph.addEventListener('pointerdown', function (e) { graph.setPointerCapture(e.pointerId); scrub(e); });
    graph.addEventListener('pointermove', function (e) { if (e.buttons) scrub(e); });

    // Candidates
    var capt = h('div', { class: 'cands-cap' });
    var tbody = h('tbody');
    var table = h('table', { class: 'cands' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', { text: '#' }), h('th', { text: 'Move' }), h('th', { class: 'r', text: 'Win' }),
        h('th', { class: 'r', text: 'Lead' }), h('th', { class: 'r', text: 'Loss' }), h('th', { class: 'r', text: 'Visits' }),
      ])]),
      tbody,
    ]);
    var scale = h('div', { class: 'scale', 'aria-label': 'Move classes by points lost' }, CLASS_NAMES.map(function (name, i) {
      return h('span', {}, [h('i', { class: 'dot', style: 'background:' + CLASS_COLORS[i] }), i < 5 ? name + ' ' + THRESHOLDS[i] + '+' : name]);
    }));

    var rowEls = [];

    function candidates() {
      return state.k < last ? F[state.k].cands.filter(function (c) { return c.x >= 0; }).slice(0, 5) : [];
    }
    function setHover(i) {
      if (state.hover === i) return;
      state.hover = i;
      drawBoard();
    }
    function go(k) {
      k = Math.max(0, Math.min(last, k));
      if (k === state.k && state.hover === null) return;
      state.k = k;
      state.hover = null;
      render();
    }
    function leadText(f) {
      var black = f.leadB >= 0;
      return (black ? 'Black' : 'White') + ' leads by ' + Math.abs(f.leadB).toFixed(1) + ', ' + pct(black ? f.winB : 1 - f.winB, 0) + ' to win';
    }

    // Everything that changes with the move number.
    function render() {
      var k = state.k, f = F[k], cands = candidates();
      slider.value = String(k);
      counter.textContent = k + ' / ' + last;
      cursor.setAttribute('x1', gx(k));
      cursor.setAttribute('x2', gx(k));

      var prev = k > 0 ? F[k - 1] : null;
      var who = prev ? (prev.toPlay === 'b' ? 'Black' : 'White') : '';
      clear(sub);
      if (!prev) {
        head.textContent = 'Start, Black to play';
        sub.appendChild(h('span', { text: 'Komi ' + game.komi + ', Chinese rules' }));
      } else if (prev.move === 'pass') {
        head.textContent = 'Move ' + k + ', ' + who + ' passes';
      } else {
        var pl = lost[k], cls = evalClass(pl);
        head.textContent = 'Move ' + k + ', ' + who + ' ' + coordName(prev.move[0], prev.move[1], n);
        sub.appendChild(h('span', {}, [h('i', { class: 'dot', style: 'background:' + CLASS_COLORS[cls] }),
          CLASS_NAMES[cls] + ', ' + (pl > 0 ? 'lost ' + pl.toFixed(1) : 'gained ' + (-pl).toFixed(1))]));
        if (prev.slip) sub.appendChild(h('span', { text: 'planted slip' }));
      }
      sub2.textContent = leadText(f);

      var side = f.toPlay === 'b' ? 'Black' : 'White';
      capt.textContent = cands.length ? 'Engine candidates for ' + side + ', from ' + side + '’s side.' : '';
      clear(tbody);
      rowEls = cands.map(function (c, i) {
        var mine = f.toPlay === 'b';
        var tr = h('tr', {}, [
          h('td', { text: String(i + 1) }),
          h('td', {}, [h('i', { class: 'dot', style: 'background:' + CLASS_COLORS[evalClass(c.pl)] }), coordName(c.x, c.y, n)]),
          h('td', { class: 'r', text: pct(mine ? c.w : 1 - c.w, 0) }),
          h('td', { class: 'r', text: signed(mine ? c.s : -c.s) }),
          h('td', { class: 'r', text: c.pl > 0.05 ? '−' + c.pl.toFixed(1) : '0.0' }),
          h('td', { class: 'r', text: String(c.v) }),
        ]);
        tr.addEventListener('pointerenter', function () { setHover(i); });
        tr.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') setHover(null); });
        tbody.appendChild(tr);
        return tr;
      });
      if (!cands.length) {
        tbody.appendChild(h('tr', { class: 'empty' }, [h('td', { colspan: '6', text: endedByPasses ? 'Both players passed. Game over.' : 'End of the recorded game.' })]));
      }

      clear(board.L.hits);
      cands.forEach(function (c, i) {
        var hit = svg('circle', { class: 'hit', cx: c.x, cy: c.y, r: 0.48 }, board.L.hits);
        hit.addEventListener('pointerenter', function () { setHover(i); });
        hit.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') setHover(null); });
      });
      drawBoard();
    }

    // The board alone: overlay, stones, candidates or the hovered line.
    function drawBoard() {
      var k = state.k, f = F[k], rows = f.board, cands = candidates();
      clear(board.L.over);
      clear(board.L.labels);
      rowEls.forEach(function (tr, i) { tr.classList.toggle('hover', i === state.hover); });
      var pv = state.hover !== null && cands[state.hover] ? cands[state.hover].pv : null;

      var noteText = '';
      if (state.overlay === 'own') {
        drawSquares(board, rows, f.own, ownershipSize);
        noteText = 'Squares show who the engine expects to own each point. Bigger means surer.';
      } else if (state.overlay === 'swing' && k > 0) {
        var before = F[k - 1].own, diff = [], peak = 0, toB = 0, toW = 0;
        for (var i = 0; i < n * n; i++) {
          var d = f.own[i] - before[i];
          diff.push(d);
          peak = Math.max(peak, Math.abs(d));
          if (d >= 0.25) toB++; else if (d <= -0.25) toW++;
        }
        drawSquares(board, rows, diff, function (v) {
          var a = Math.abs(v);
          if (a < 0.25 || peak < 0.25) return 0;
          var s = peak - 0.25;
          return 0.45 + 0.55 * (s > 1e-6 ? Math.min(1, (a - 0.25) / s) : 1);
        });
        noteText = toB + toW
          ? 'This move shifted ' + toB + ' point' + (toB === 1 ? '' : 's') + ' toward Black and ' + toW + ' toward White.'
          : 'No point changed hands by more than 0.25.';
      } else {
        drawSquares(board, rows, null);
        if (state.overlay === 'swing') noteText = 'No move has been played yet.';
      }

      drawStones(board, rows, !!pv);
      if (!pv) drawLast(board, rows, k > 0 ? F[k - 1].move : null);

      if (state.overlay === 'policy' && !pv) {
        for (var p = 0; p < n * n; p++) {
          var pr = f.pol[p];
          if (pr < 0.005) continue;
          var x = p % n, y = Math.floor(p / n), r = 0.1 + 0.34 * Math.sqrt(pr);
          svg('circle', { class: 'policy', cx: x, cy: y, r: r }, board.L.over);
          if (pr >= 0.03) label(board, x, y, String(Math.round(pr * 100)), r > 0.24 ? 'on-b' : 'on-board');
        }
        noteText = 'The network’s first impression, in percent, before any search.';
      }

      if (pv) {
        var blackFirst = f.toPlay === 'b';
        var shown = 0;
        pv.forEach(function (mv, j) {
          var c = parseGtp(mv, n);
          if (!c || rows[c[1]][c[0]] !== '.') return;
          var isB = (j % 2 === 0) === blackFirst;
          svg('circle', { class: isB ? 'sb' : 'sw', cx: c[0], cy: c[1], r: 0.46 }, board.L.over);
          label(board, c[0], c[1], String(j + 1), isB ? 'on-b' : 'on-w');
          shown++;
        });
        noteText = 'Engine line after ' + coordName(cands[state.hover].x, cands[state.hover].y, n) + ', ' + shown + ' moves.';
      } else if (state.top && state.overlay !== 'policy') {
        cands.forEach(function (c, i) {
          if (i === 0) svg('circle', { class: 'best', cx: c.x, cy: c.y, r: 0.3 }, board.L.over);
          svg('circle', { cx: c.x, cy: c.y, r: 0.17, fill: CLASS_COLORS[evalClass(c.pl)] }, board.L.over);
        });
      }
      note.textContent = noteText;
    }

    body.setAttribute('tabindex', '0');
    body.setAttribute('aria-label', 'Game review. Use the left and right arrow keys to step through moves.');
    body.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
      var to = { ArrowLeft: state.k - 1, ArrowRight: state.k + 1, Home: 0, End: last }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go(to);
    });

    var overlayTabs = tabs('Board overlay', [['none', 'Stones'], ['own', 'Territory'], ['policy', 'Policy'], ['swing', 'Swing']], state.overlay, function (v) { state.overlay = v; drawBoard(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [
      overlayTabs.el,
      h('span', { class: 'grow' }),
      checkbox('Top moves', true, function (v) { state.top = v; drawBoard(); }),
    ]));
    body.appendChild(h('div', { class: 'review' }, [
      h('div', { class: 'col' }, [board.el, transport, note]),
      h('div', { class: 'col' }, [
        h('div', {}, [head, sub, sub2]),
        graph,
        h('div', { class: 'cands-wrap' }, [capt, table]),
        scale,
      ]),
    ]));
    render();

    fig.wk = {
      set: function (o) {
        if (o.move !== undefined) { state.k = -1; go(parseInt(o.move, 10)); }
        if (o.overlay) overlayTabs.set(o.overlay);
      },
    };
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    var env = document.getElementById('wk-env');
    if (env) envCheck(env);

    var figs = ['wk-golden', 'wk-puct', 'wk-review'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!figs.length) return;
    loadData(figs[0].getAttribute('data-src')).then(function (data) {
      var builders = { 'wk-golden': golden, 'wk-puct': puct, 'wk-review': review };
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
    if (!fig || !fig.wk) return;
    e.preventDefault();
    fig.wk.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      fig.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
