// Figures for "Compiling a xiangqi engine for the browser".
//
// The rules, the move notation, the winning-chance curve and the repetition
// check run live from web-xiangqi's own source, bundled into
// web-xiangqi-core.js (its move generator matches Pikafish's perft counts).
// The game, the evaluations and the rule judgements come from Pikafish, as the
// app ships it, run offline in Node (see _tools/web-xiangqi-demo) and saved to
// /assets/data/web-xiangqi-demo.json. Nothing here runs an engine.
(function () {
  'use strict';

  var X = window.WebXiangqiCore;
  var NS = 'http://www.w3.org/2000/svg';
  var LABELS = { best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
  var ORDER = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  var GLYPH = { inaccuracy: '?!', mistake: '?', blunder: '??' };
  var BAD = { inaccuracy: 1, mistake: 1, blunder: 1 };
  var CN = '一二三四五六七八九';
  var STYLES = [['chinese', '中文'], ['wxf', 'WXF'], ['uci', 'Coordinates']];
  var NAMES = { K: 'general', A: 'advisor', B: 'elephant', N: 'horse', R: 'chariot', C: 'cannon', P: 'soldier' };

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
  function dot(q) { return h('i', { class: 'dot q-' + q }); }
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
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function onView(el, fn) {
    if (!('IntersectionObserver' in window)) return;
    var done = false;
    new IntersectionObserver(function (es) { if (es[0].isIntersecting && !done) { done = true; fn(); } }, { threshold: 0.5 }).observe(el);
  }
  var CAN_HOVER = window.matchMedia ? window.matchMedia('(hover: hover)').matches : true;
  var POINT = CAN_HOVER ? 'Hover over' : 'Tap';
  var ICONS = {
    play: 'M5 3.5v9l7-4.5z',
    pause: 'M5 3.5v9M11 3.5v9',
    first: 'M11.5 4 7.5 8l4 4M4.5 4v8',
    prev: 'M10 4 6 8l4 4',
    next: 'M6 4l4 4-4 4',
    last: 'M4.5 4l4 4-4 4M11.5 4v8',
  };
  function iconButton(icon, label, onClick) {
    var b = h('button', { class: 'btn icon', type: 'button', 'aria-label': label, title: label, onclick: onClick });
    var path = svg('path', { d: ICONS[icon] }, svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, b));
    b.setIcon = function (name) { path.setAttribute('d', ICONS[name]); };
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
  function transport(onGo, getK, getLast, interval) {
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', step: '1', 'aria-label': 'Move number' });
    var timer = null;
    function stop() { if (timer) { clearInterval(timer); timer = null; } playBtn.setIcon('play'); }
    function play() {
      if (getK() >= getLast()) onGo(0);
      playBtn.setIcon('pause');
      timer = setInterval(function () { if (getK() >= getLast()) { stop(); return; } onGo(getK() + 1); }, interval || 800);
    }
    var playBtn = iconButton('play', 'Play or pause', function () { if (timer) stop(); else play(); });
    slider.addEventListener('input', function () { stop(); onGo(Number(slider.value)); });
    var el = h('div', { class: 'transport' }, [
      playBtn,
      iconButton('first', 'First move', function () { stop(); onGo(0); }),
      iconButton('prev', 'Previous move', function () { onGo(getK() - 1); }),
      slider,
      iconButton('next', 'Next move', function () { onGo(getK() + 1); }),
      iconButton('last', 'Last move', function () { onGo(getLast()); }),
      counter,
    ]);
    return {
      el: el,
      play: play,
      stop: stop,
      update: function () {
        slider.max = String(getLast());
        slider.value = String(getK());
        counter.textContent = getK() + ' / ' + getLast();
      },
    };
  }

  // ---- Positions -------------------------------------------------------------
  // Boards are web-xiangqi's own: board[rank][file], rank 0 is Red's back rank.
  function boardFromFen(fen) { return X.parseFenBoard(fen.split(' ')[0]); }
  function sq(s) { return { file: s.charCodeAt(0) - 97, rank: Number(s[1]) }; }
  function play(board, uci) {
    var a = sq(uci.slice(0, 2)), b = sq(uci.slice(2, 4));
    var next = X.cloneBoardState(board);
    next[b.rank][b.file] = next[a.rank][a.file];
    next[a.rank][a.file] = '';
    return next;
  }
  function isRed(p) { return p && p === p.toUpperCase(); }
  function moveText(board, uci, style) {
    var t = X.formatMoveInStyle(board, uci, style);
    return style === 'uci' ? t.toLowerCase() : t;
  }

  // ---- Board ---------------------------------------------------------------
  // x is the file from Red's left, y is 9 at Red's back rank.
  function XY(file, rank) { return [file, 9 - rank]; }

  function makeBoard(label) {
    var m = 1.0;
    var el = svg('svg', { class: 'xb', viewBox: [-m, -m, 8 + 2 * m, 9 + 2 * m].join(' '), role: 'img', 'aria-label': label });
    svg('rect', { class: 'wood', x: -m, y: -m, width: 8 + 2 * m, height: 9 + 2 * m, rx: 0.12 }, el);
    svg('rect', { class: 'frame', x: -0.14, y: -0.14, width: 8.28, height: 9.28 }, el);
    var g = svg('g', { class: 'grid' }, el);
    var d = '';
    for (var y = 0; y <= 9; y++) d += 'M0 ' + y + 'H8';
    d += 'M0 0V9M8 0V9';
    for (var x = 1; x < 8; x++) d += 'M' + x + ' 0V4M' + x + ' 5V9';
    d += 'M3 0L5 2M5 0L3 2M3 7L5 9M5 7L3 9';
    svg('path', { d: d }, g);
    svg('text', { class: 'river', x: 2, y: 4.52 }, el).textContent = '楚 河';
    svg('text', { class: 'river', x: 6, y: 4.52 }, el).textContent = '漢 界';
    var L = {};
    ['coords', 'marks', 'pieces', 'over', 'arrows', 'badges', 'hits'].forEach(function (k) { L[k] = svg('g', {}, el); });
    return { el: el, L: L };
  }
  // File numbers as each player counts them, from their own right.
  function drawCoords(b, style) {
    clear(b.L.coords);
    for (var f = 0; f < 9; f++) {
      if (style === 'uci') {
        svg('text', { class: 'coord', x: f, y: 9.74 }, b.L.coords).textContent = 'abcdefghi'[f];
      } else {
        svg('text', { class: 'coord', x: f, y: -0.74 }, b.L.coords).textContent = String(f + 1);
        svg('text', { class: 'coord' + (style === 'chinese' ? ' cjk' : ''), x: f, y: 9.74 }, b.L.coords).textContent = style === 'chinese' ? CN[8 - f] : String(9 - f);
      }
    }
    if (style === 'uci') for (var r = 0; r <= 9; r++) svg('text', { class: 'coord', x: -0.74, y: 9 - r }, b.L.coords).textContent = String(r);
  }
  function drawPieces(b, board, pieceStyle, opts) {
    opts = opts || {};
    clear(b.L.pieces);
    for (var r = 0; r <= 9; r++) for (var f = 0; f < 9; f++) {
      var p = board[r][f];
      if (!p) continue;
      var xy = XY(f, r);
      var sel = opts.sel && opts.sel.file === f && opts.sel.rank === r;
      var g = svg('g', { class: 'pc ' + (isRed(p) ? 'r' : 'b') + (pieceStyle === 'letters' ? ' letters' : '') + (sel ? ' sel' : '') + (opts.dim ? ' dim' : '') }, b.L.pieces);
      svg('circle', { cx: xy[0], cy: xy[1], r: 0.44 }, g);
      svg('circle', { class: 'ring', cx: xy[0], cy: xy[1], r: 0.36 }, g);
      svg('text', { x: xy[0], y: xy[1] + 0.02 }, g).textContent = X.pieceLabel(p, pieceStyle);
      if (opts.anim && !REDUCE) slideIn(g, opts.anim, f, r);
    }
  }
  // The piece that just moved starts on its old point and slides to its new one.
  function slideIn(g, uci, f, r) {
    var a = sq(uci.slice(0, 2)), z = sq(uci.slice(2, 4));
    if (z.file !== f || z.rank !== r) return;
    var from = XY(a.file, a.rank), to = XY(f, r);
    g.style.transform = 'translate(' + (from[0] - to[0]) + 'px,' + (from[1] - to[1]) + 'px)';
    g.getBoundingClientRect();
    requestAnimationFrame(function () {
      g.style.transition = 'transform 0.22s ease';
      g.style.transform = 'translate(0px,0px)';
    });
  }
  function markLast(b, uci) {
    clear(b.L.marks);
    if (!uci) return;
    [uci.slice(0, 2), uci.slice(2, 4)].forEach(function (s) {
      var a = sq(s), xy = XY(a.file, a.rank);
      svg('rect', { class: 'last', x: xy[0] - 0.47, y: xy[1] - 0.47, width: 0.94, height: 0.94, rx: 0.1 }, b.L.marks);
    });
  }
  function arrow(b, uci, cls) {
    var a = sq(uci.slice(0, 2)), z = sq(uci.slice(2, 4));
    var p1 = XY(a.file, a.rank), p2 = XY(z.file, z.rank);
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    var w = 0.08, hw = 0.22, hl = 0.38, s = 0.2;
    var sx = p1[0] + ux * s, sy = p1[1] + uy * s, bx = p2[0] - ux * hl, by = p2[1] - uy * hl;
    var pts = [[sx + nx * w, sy + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], p2,
      [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [sx - nx * w, sy - ny * w]];
    svg('polygon', { class: 'arrow ' + (cls || ''), points: pts.map(function (p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join(' ') }, b.L.arrows);
  }
  function badge(b, s, q) {
    var a = sq(s), xy = XY(a.file, a.rank);
    var g = svg('g', { class: 'badge q-' + q }, b.L.badges);
    svg('circle', { cx: xy[0] + 0.34, cy: xy[1] - 0.34, r: 0.17 }, g);
    if (GLYPH[q]) svg('text', { x: xy[0] + 0.34, y: xy[1] - 0.335 }, g).textContent = GLYPH[q];
  }

  // =========================================================================
  // The rules, played out
  // =========================================================================
  // Refusals worth drawing: a move the piece's pattern allows that a rule
  // forbids. The pattern refusals ("horse moves in an L") are the empty board.
  var SHOWN = {
    'horse leg blocked': 1, 'elephant eye blocked': 1, 'elephant cannot cross river': 1,
    'cannon capture needs one screen': 1, 'advisor must stay in palace': 1, 'general must stay in palace': 1,
    'generals cannot face each other': 1, 'move leaves general in check': 1, 'pawn move is illegal': 1,
  };
  var PRESETS = {
    start: { fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', select: 'h2' },
    horse: { fen: '3k5/9/9/9/9/4P4/4Np3/9/9/4K4 w', select: 'e3', say: 'A horse steps one point straight, then one diagonally, and a piece on the straight step blocks it. Here the soldier and the black soldier each block two of its eight moves.' },
    elephant: { fen: '4k4/9/9/9/9/6B2/3n5/4B4/9/3K5 w', select: 'e2', say: 'An elephant moves exactly two points diagonally, and a piece on the point between, its eye, blocks it. Pick up the other elephant to see the river stop it.' },
    cannon: { fen: '4k4/9/9/9/4r4/9/4P4/9/4C4/3K5 w', select: 'e1', say: 'A cannon moves like a chariot but captures by jumping exactly one piece, its screen.' },
    general: { fen: '4k4/9/9/9/9/9/9/4N4/9/4K4 w', select: 'e2', say: 'The two generals may never face each other on an open file, so this horse cannot move at all.' },
    stack: { fen: '3k5/9/9/9/9/9/9/4R4/4R4/3AK4 w', select: 'e2', say: 'Two chariots on one file are told apart as front and rear: 前俥 and 後俥, or +R and −R.' },
  };

  function rules(fig) {
    var body = mount(fig);
    var board = makeBoard('Xiangqi board');
    var state = { style: 'chinese', pieces: 'traditional', hover: null };
    var game; // { board, side, sel, history: [{board, side, uci}] }
    var say = h('div', { class: 'say' });
    var names = h('dl', { class: 'names' });
    var record = h('div', { class: 'record', 'aria-live': 'polite' });
    var note = h('p', { class: 'fig-note' });

    function load(key) {
      var p = PRESETS[key];
      game = { board: boardFromFen(p.fen), side: p.fen.split(' ')[1], sel: p.select ? sq(p.select) : null, history: [], say: p.say };
      state.hover = null;
      render();
    }

    function targets() {
      if (!game.sel) return { legal: [], blocked: [] };
      var f = game.sel.file, r = game.sel.rank, piece = game.board[r][f];
      var legal = X.legalMovesFrom(game.board, f, r, game.side);
      var blocked = [];
      for (var tr = 0; tr <= 9; tr++) for (var tf = 0; tf < 9; tf++) {
        if (tf === f && tr === r) continue;
        if (legal.some(function (t) { return t.file === tf && t.rank === tr; })) continue;
        var res = X.validatePieceMove(game.board, { fromFile: f, fromRank: r, toFile: tf, toRank: tr, raw: '' }, game.side);
        if (res.ok || !SHOWN[res.reason]) continue;
        if (res.reason === 'pawn move is illegal' && Math.abs(tf - f) + Math.abs(tr - r) !== 1) continue;
        if (res.reason === 'cannon capture needs one screen' && !game.board[tr][tf]) continue;
        blocked.push({ file: tf, rank: tr, reason: res.reason, blockers: blockersFor(piece, f, r, tf, tr, res.reason) });
      }
      return { legal: legal, blocked: blocked };
    }
    function blockersFor(piece, f, r, tf, tr, reason) {
      var df = tf - f, dr = tr - r, sg = function (n) { return n > 0 ? 1 : n < 0 ? -1 : 0; };
      if (reason === 'horse leg blocked') return [Math.abs(df) === 2 ? { file: f + sg(df), rank: r } : { file: f, rank: r + sg(dr) }];
      if (reason === 'elephant eye blocked') return [{ file: f + sg(df), rank: r + sg(dr) }];
      if (reason === 'cannon capture needs one screen') {
        var out = [];
        for (var i = 1; i < Math.max(Math.abs(df), Math.abs(dr)); i++) {
          var a = { file: f + sg(df) * i, rank: r + sg(dr) * i };
          if (game.board[a.rank][a.file]) out.push(a);
        }
        return out;
      }
      if (reason === 'generals cannot face each other') {
        var gs = [];
        for (var rr = 0; rr <= 9; rr++) for (var ff = 3; ff <= 5; ff++) if (game.board[rr][ff] && game.board[rr][ff].toUpperCase() === 'K') gs.push({ file: ff, rank: rr });
        return gs;
      }
      return [];
    }

    function render() {
      drawCoords(board, state.style);
      drawPieces(board, game.board, state.pieces, { sel: game.sel, anim: game.anim });
      game.anim = null;
      var last = game.history.length ? game.history[game.history.length - 1].uci : null;
      markLast(board, last);
      clear(board.L.hits);
      var t = targets();
      drawOverlay(t);
      // Hit areas: every point.
      for (var r = 0; r <= 9; r++) for (var f = 0; f < 9; f++) (function (f, r) {
        var xy = XY(f, r);
        var hit = svg('rect', { class: 'hit', x: xy[0] - 0.5, y: xy[1] - 0.5, width: 1, height: 1 }, board.L.hits);
        hit.addEventListener('pointerenter', function () { hoverAt(f, r, t); });
        hit.addEventListener('pointerleave', function (e) {
          if (e.pointerType === 'touch') return;
          state.hover = null;
          drawOverlay(t);
          paintInfo(t);
        });
        hit.addEventListener('click', function () { clickAt(f, r, t); });
      })(f, r);
      paintInfo(t);
    }
    function drawOverlay(t) {
      clear(board.L.over);
      t.legal.forEach(function (m) {
        var xy = XY(m.file, m.rank);
        svg('circle', { class: 'target' + (m.capture ? ' cap' : ''), cx: xy[0], cy: xy[1], r: m.capture ? 0.47 : 0.12 }, board.L.over);
      });
      t.blocked.forEach(function (m) {
        var xy = XY(m.file, m.rank), s = 0.13;
        svg('path', { class: 'no', d: 'M' + (xy[0] - s) + ' ' + (xy[1] - s) + 'L' + (xy[0] + s) + ' ' + (xy[1] + s) + 'M' + (xy[0] + s) + ' ' + (xy[1] - s) + 'L' + (xy[0] - s) + ' ' + (xy[1] + s) }, board.L.over);
      });
      if (state.hover && state.hover.blockers) {
        state.hover.blockers.forEach(function (bk) {
          var xy = XY(bk.file, bk.rank);
          svg('circle', { class: 'blocker', cx: xy[0], cy: xy[1], r: 0.5 }, board.L.over);
        });
      }
    }
    function hoverAt(f, r, t) {
      var legal = t.legal.filter(function (m) { return m.file === f && m.rank === r; })[0];
      var blocked = t.blocked.filter(function (m) { return m.file === f && m.rank === r; })[0];
      state.hover = legal ? { legal: true, file: f, rank: r } : blocked || null;
      paintInfo(t);
      drawOverlay(t);
    }
    function clickAt(f, r, t) {
      var p = game.board[r][f];
      var legal = t.legal.filter(function (m) { return m.file === f && m.rank === r; })[0];
      if (legal) {
        var uci = X.squareToUci(game.sel.file, game.sel.rank) + X.squareToUci(f, r);
        game.history.push({ board: game.board, side: game.side, uci: uci });
        game.board = play(game.board, uci);
        game.side = game.side === 'w' ? 'b' : 'w';
        game.sel = null;
        game.say = null;
        game.anim = uci;
        state.hover = null;
        render();
        return;
      }
      if (p && (isRed(p) ? 'w' : 'b') === game.side) {
        game.sel = game.sel && game.sel.file === f && game.sel.rank === r ? null : { file: f, rank: r };
        game.say = null;
      } else {
        game.sel = null;
      }
      state.hover = null;
      render();
    }

    function paintInfo(t) {
      var sideName = game.side === 'w' ? 'Red' : 'Black';
      clear(say);
      if (game.sel) {
        var p = game.board[game.sel.rank][game.sel.file];
        say.appendChild(document.createTextNode(cap(NAMES[p.toUpperCase()]) + ' on ' + X.squareToUci(game.sel.file, game.sel.rank) + ': ' +
          t.legal.length + (t.legal.length === 1 ? ' move' : ' moves') + (t.blocked.length ? ', ' + t.blocked.length + ' refused' : '')));
      } else if (!X.hasAnyLegalMove(game.board, game.side)) {
        say.appendChild(document.createTextNode(sideName + ' has no legal move and loses.'));
      } else {
        say.appendChild(document.createTextNode(sideName + ' to move. Pick up a ' + (game.side === 'w' ? 'red' : 'black') + ' piece.'));
      }
      if (game.say) say.appendChild(h('span', { class: 'sub', text: game.say }));

      clear(names);
      var hv = state.hover;
      if (hv && hv.legal) {
        var uci = X.squareToUci(game.sel.file, game.sel.rank) + X.squareToUci(hv.file, hv.rank);
        STYLES.forEach(function (s) {
          names.appendChild(h('dt', { text: s[1] }));
          names.appendChild(h('dd', { class: s[0] === 'chinese' ? 'big cjk' : 'big', text: moveText(game.board, uci, s[0]) }));
        });
        note.textContent = 'Click to play it.';
      } else if (hv && hv.reason) {
        names.appendChild(h('dt', { text: 'Refused' }));
        names.appendChild(h('dd', { text: X.formatMoveRuleHint(hv.reason) }));
        note.textContent = 'The rule is web-xiangqi’s own: “' + hv.reason + '”.';
      } else if (!game.sel && game.history.length) {
        var lastMove = game.history[game.history.length - 1];
        STYLES.forEach(function (st) {
          names.appendChild(h('dt', { text: st[1] }));
          names.appendChild(h('dd', { class: st[0] === 'chinese' ? 'big cjk' : 'big', text: moveText(lastMove.board, lastMove.uci, st[0]) }));
        });
        note.textContent = 'The last move, three ways.';
      } else if (game.sel && t.legal.length) {
        // Nothing hovered: name one of the selected piece's moves, the
        // central cannon when it is on offer.
        var from = X.squareToUci(game.sel.file, game.sel.rank);
        var pick = t.legal.filter(function (m) { return from + X.squareToUci(m.file, m.rank) === 'h2e2'; })[0] || t.legal[0];
        var pu = from + X.squareToUci(pick.file, pick.rank);
        STYLES.forEach(function (st) {
          names.appendChild(h('dt', { text: st[1] }));
          names.appendChild(h('dd', { class: st[0] === 'chinese' ? 'big cjk' : 'big', text: moveText(game.board, pu, st[0]) }));
        });
        var pxy = XY(pick.file, pick.rank);
        svg('circle', { class: 'preview', cx: pxy[0], cy: pxy[1], r: 0.3 }, board.L.over);
        note.textContent = '';
      } else {
        note.textContent = '';
      }

      clear(record);
      var pair = null, num = 0;
      game.history.forEach(function (m, i) {
        if (m.side === 'w' || i === 0) {
          num++;
          pair = h('span', { class: 'pair' }, [h('span', { class: 'n', text: num + (m.side === 'w' ? '.' : '…') })]);
          record.appendChild(pair);
          record.appendChild(document.createTextNode(' '));
        }
        pair.appendChild(h('span', { class: 'm' + (state.style === 'chinese' ? ' cjk' : ''), text: moveText(m.board, m.uci, state.style) }));
      });

    }
    function cap(s) { return s[0].toUpperCase() + s.slice(1); }

    var styleTabs = tabs('Notation', STYLES, state.style, function (v) { state.style = v; render(); });
    var pieceTabs = tabs('Pieces', [['traditional', 'Characters'], ['letters', 'Letters']], state.pieces, function (v) { state.pieces = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [styleTabs.el, pieceTabs.el]));
    body.appendChild(h('div', { class: 'rules' }, [
      h('div', {}, [board.el, note]),
      h('div', { class: 'side' }, [
        say, names, record,
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn', type: 'button', text: 'Undo', onclick: function () {
            var m = game.history.pop();
            if (!m) return;
            game.board = m.board; game.side = m.side; game.sel = null; state.hover = null; render();
          } }),
          h('button', { class: 'btn', type: 'button', text: 'Start position', onclick: function () { load('start'); } }),
        ]),
      ]),
    ]));
    load('start');

    fig.xq = {
      set: function (o) {
        if (o.preset) load(o.preset);
        if (o.play) {
          o.play.split(' ').forEach(function (uci) {
            game.history.push({ board: game.board, side: game.side, uci: uci });
            game.board = play(game.board, uci);
            game.side = game.side === 'w' ? 'b' : 'w';
            game.anim = uci;
          });
          game.sel = null;
          setTimeout(render, 350);
        }
        if (o.style) styleTabs.set(o.style);
        if (o.pieces) pieceTabs.set(o.pieces);
      },
    };
  }

  // =========================================================================
  // The halfmove clock in the FEN
  // =========================================================================
  function clock(fig, data) {
    var body = mount(fig);
    var state = { c: 0, k: 115 };
    var board = makeBoard('Endgame position');
    drawCoords(board, 'uci');
    var W = 640, H = 170, P = { l: 40, r: 8, t: 12, b: 30 };
    var chart = svg('svg', { class: 'cchart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Pikafish’s evaluation at every value of the halfmove clock' });
    var plot = svg('g', {}, chart);
    var cursor = svg('line', { class: 'cursor', y1: P.t, y2: H - P.b }, chart);
    var readout = h('div', { class: 'readout', 'aria-live': 'polite' });
    var out = h('output');
    var input = h('input', { type: 'range', min: '0', max: '120', step: '1', 'aria-label': 'Halfmove clock' });
    input.addEventListener('input', function () { state.k = Number(input.value); render(); });
    var gx = function (c) { return P.l + (W - P.l - P.r) * c / 120; };
    var TOP = 700;
    var gy = function (v) { return P.t + (H - P.t - P.b) * (1 - Math.max(0, Math.min(TOP, v)) / TOP); };
    var scrub = function (e) { var p = local(chart, e, W, H); state.k = Math.max(0, Math.min(120, Math.round((p[0] - P.l) / (W - P.l - P.r) * 120))); render(); };
    chart.addEventListener('pointerdown', function (e) { chart.setPointerCapture(e.pointerId); scrub(e); });
    chart.addEventListener('pointermove', function (e) { if (e.buttons) scrub(e); });

    function draw() {
      var c = data.clocks[state.c];
      clear(plot);
      var grid = svg('g', { class: 'grid' }, plot);
      [0, 200, 400, 600].forEach(function (v) {
        svg('line', { x1: P.l, x2: W - P.r, y1: gy(v), y2: gy(v) }, grid);
        svg('text', { x: P.l - 6, y: gy(v) + 3.5, 'text-anchor': 'end' }, plot).textContent = '+' + v / 100;
      });
      svg('text', { x: P.l - 6, y: gy(TOP) + 3.5, 'text-anchor': 'end' }, plot).textContent = 'mate';
      [0, 30, 60, 90, 120].forEach(function (v) {
        svg('text', { x: gx(v), y: H - P.b + 15, 'text-anchor': 'middle' }, plot).textContent = String(v);
      });
      svg('line', { class: 'limit', x1: gx(120), x2: gx(120), y1: P.t, y2: H - P.b }, plot);
      svg('text', { x: W - P.r, y: H - 3, 'text-anchor': 'end' }, plot).textContent = 'halfmove clock (plies without a capture)';
      c.rows.forEach(function (r) {
        var v = r.mate !== null ? TOP : r.cp;
        svg('rect', { class: 'val' + (r.mate !== null ? ' mate' : ''), x: gx(r.clock) - 1.8, y: gy(v), width: 3.6, height: Math.max(1, gy(0) - gy(v)) }, plot);
      });
    }
    function render() {
      var c = data.clocks[state.c], r = c.rows[state.k];
      input.value = String(state.k);
      out.textContent = String(state.k);
      cursor.setAttribute('x1', gx(state.k)); cursor.setAttribute('x2', gx(state.k));
      var b = boardFromFen(c.fen);
      drawPieces(board, b, 'traditional');
      clear(board.L.arrows);
      var line = [], bb = b;
      r.pv.slice(0, 6).forEach(function (u, i) {
        if (i === 0) arrow(board, u, r.mate !== null ? 'best' : '');
        line.push(moveText(bb, u, 'wxf'));
        bb = play(bb, u);
      });
      clear(readout);
      readout.appendChild(document.createTextNode('Clock ' + state.k + ': ' + (r.mate !== null ? 'mate in ' + r.mate : r.cp === 0 ? '0.00, a draw' : '+' + (r.cp / 100).toFixed(2))));
      readout.appendChild(h('span', { class: 'sub', text: 'Pikafish’s line: ' + line.join(' ') + (r.pv.length > 6 ? ' …' : '') }));
    }
    var sweeping = null;
    function sweep() {
      if (sweeping) { cancelAnimationFrame(sweeping); sweeping = null; sweepBtn.setIcon('play'); return; }
      if (REDUCE) { state.k = 116; render(); return; }
      sweepBtn.setIcon('pause');
      var t0 = performance.now();
      (function tick(now) {
        state.k = Math.min(120, Math.round((now - t0) / 1000 * 32));
        render();
        if (state.k < 120) sweeping = requestAnimationFrame(tick);
        else { sweeping = null; sweepBtn.setIcon('play'); }
      })(t0);
    }
    var sweepBtn = iconButton('play', 'Sweep the clock from 0 to 120', sweep);
    var picker = tabs('Position', data.clocks.map(function (c, i) { return [String(i), c.tab]; }), '0', function (v) { state.c = Number(v); draw(); render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [picker.el, h('span', { class: 'grow' }), sweepBtn, h('label', { class: 'slider' }, ['Clock', input, out])]));
    body.appendChild(h('div', { class: 'clockfig' }, [board.el, readout]));
    body.appendChild(chart);
    draw();
    render();
    onView(chart, function () { state.k = 0; sweep(); });

    fig.xq = {
      set: function (o) {
        if (sweeping) sweep();
        if (o.position !== undefined) picker.set(o.position);
        if (o.clock !== undefined) { state.k = Number(o.clock); render(); }
      },
    };
  }

  // =========================================================================
  // Repetition: perpetual check and perpetual chase
  // =========================================================================
  function repetition(fig, data) {
    var body = mount(fig);
    var state = { line: 'check', k: 0, style: 'chinese' };
    var board = makeBoard('A repeating line');
    var head = h('div', { class: 'move-head', 'aria-live': 'polite' });
    var local = h('div', { class: 'verdict-box' });
    var engine = h('div', { class: 'verdict-box' });
    var list = h('div', { class: 'record' });
    var line, boards, plies;

    function load(key) {
      state.line = key;
      line = data.repetition[key];
      boards = [boardFromFen(line.fen)];
      plies = [];
      line.moves.forEach(function (u, i) {
        var next = play(boards[i], u);
        boards.push(next);
        var sideToMove = i % 2 === 0 ? 'b' : 'w';
        plies.push({ board: next, sideToMove: sideToMove, inCheck: X.isInCheck(next, sideToMove) });
      });
      go(state.k);
    }
    var prevK = -1;
    function go(k) {
      prevK = state.k;
      state.k = Math.max(0, Math.min(line.moves.length, k));
      render();
    }
    var tp = transport(go, function () { return state.k; }, function () { return line.moves.length; }, 700);

    function render() {
      var k = state.k, b = boards[k];
      tp.update();
      drawCoords(board, state.style);
      drawPieces(board, b, 'traditional', { anim: k && k === prevK + 1 ? line.moves[k - 1] : null });
      prevK = k;
      markLast(board, k ? line.moves[k - 1] : null);
      clear(board.L.badges);
      if (k && plies[k - 1].inCheck) {
        var side = plies[k - 1].sideToMove;
        for (var r = 0; r <= 9; r++) for (var f = 3; f <= 5; f++) {
          var p = b[r][f];
          if (p && p.toUpperCase() === 'K' && (isRed(p) ? 'w' : 'b') === side) {
            var xy = XY(f, r);
            svg('circle', { class: 'blocker', cx: xy[0], cy: xy[1], r: 0.52 }, board.L.badges);
          }
        }
      }
      head.textContent = k ? 'After ' + (Math.floor((k - 1) / 2) + 1) + (k % 2 ? '.' : '…') + moveText(boards[k - 1], line.moves[k - 1], state.style) +
        (plies[k - 1].inCheck ? ', check' : '') : 'Red to move';

      var report = X.describeRepetition(boards[0], 'w', plies.slice(0, k));
      clear(local);
      local.appendChild(h('div', { class: 'vb-h', text: 'web-xiangqi, in the browser' }));
      if (X.shouldReportRepetition(report)) {
        local.appendChild(h('div', { class: 'vb-v', text: X.formatRepetitionHeadline(report) }));
        local.appendChild(h('div', { class: 'vb-s', text: X.formatRepetitionRule(report) }));
      } else {
        local.appendChild(h('div', { class: 'vb-v quiet', text: report.occurrences > 1 ? 'Position seen ' + report.occurrences + ' times; nothing to report yet' : 'Nothing to report' }));
      }
      var j = line.judged[k];
      clear(engine);
      engine.appendChild(h('div', { class: 'vb-h', text: 'Pikafish’s own rule judge' }));
      var mover = k % 2 === 0 ? 'Red' : 'Black';
      var other = mover === 'Red' ? 'Black' : 'Red';
      engine.appendChild(h('div', { class: 'vb-v' + (j ? '' : ' quiet'), text: j === 'win' ? other + ' loses by the repetition rules' : j === 'loss' ? mover + ' loses by the repetition rules' : j === 'draw' ? 'Drawn by repetition' : 'No ruling' }));

      clear(list);
      var pair = null;
      line.moves.forEach(function (u, i) {
        if (i % 2 === 0) {
          pair = h('span', { class: 'pair' }, [h('span', { class: 'n', text: (i / 2 + 1) + '.' })]);
          list.appendChild(pair);
          list.appendChild(document.createTextNode(' '));
        }
        var s = h('span', { class: 'm' + (state.style === 'chinese' ? ' cjk' : '') + (i + 1 === k ? ' on' : '') + (i >= k ? ' later' : ''), text: moveText(boards[i], u, state.style) + (plies[i].inCheck ? '+' : '') });
        s.addEventListener('click', function () { go(i + 1); });
        pair.appendChild(s);
      });
    }

    var lineTabs = tabs('Line', [['check', 'Perpetual check'], ['chase', 'Perpetual chase']], 'check', function (v) { load(v); });
    var styleTabs = tabs('Notation', STYLES, state.style, function (v) { state.style = v; render(); });
    body.setAttribute('tabindex', '0');
    body.setAttribute('aria-label', 'Repeating line. Use the left and right arrow keys to step.');
    body.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var to = { ArrowLeft: state.k - 1, ArrowRight: state.k + 1, Home: 0, End: line.moves.length }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go(to);
    });
    body.appendChild(h('div', { class: 'fig-controls' }, [lineTabs.el, h('span', { class: 'grow' }), styleTabs.el]));
    body.appendChild(h('div', { class: 'rules' }, [
      h('div', {}, [board.el, h('div', { style: 'margin-top:12px' }, [tp.el])]),
      h('div', { class: 'side' }, [head, list, local, engine]),
    ]));
    load('check');
    onView(board.el, function () { if (!REDUCE) { go(0); tp.play(); } });

    fig.xq = {
      set: function (o) {
        tp.stop();
        if (o.line && o.line !== state.line) lineTabs.set(o.line);
        if (o.move !== undefined) go(Number(o.move));
      },
    };
  }

  // =========================================================================
  // The review
  // =========================================================================
  function review(fig, data) {
    var body = mount(fig);
    var g = data.game;
    var last = g.moves.length;
    var boards = [boardFromFen(X.START_POSITION_FEN)];
    g.moves.forEach(function (u, i) { boards.push(play(boards[i], u)); });
    var score = function (e) { return e.mate !== null ? (e.mate > 0 ? 30000 - e.mate : -30000 - e.mate) : e.cp; };
    var wins = g.evals.map(function (e) { return X.getWinningChancePercent(score(e), 'red'); });
    var state = { k: 0, hover: null, style: 'chinese', best: true };
    var board = makeBoard('Xiangqi game under review');
    var head = h('div', { class: 'move-head', 'aria-live': 'polite' });
    var sub = h('div', { class: 'move-sub' });
    var evalLine = h('div', { class: 'move-sub' });
    var note = h('p', { class: 'fig-note' });
    var tp = transport(go, function () { return state.k; }, function () { return last; }, 900);
    var prevK = -1;

    var GW = 360, GH = 120, PAD = { l: 30, r: 4, t: 8, b: 16 };
    var graph = svg('svg', { class: 'graph', viewBox: '0 0 ' + GW + ' ' + GH, role: 'img', 'aria-label': 'Red’s winning chances by move; dots mark inaccuracies and mistakes' });
    var gx = function (k) { return PAD.l + (GW - PAD.l - PAD.r) * k / last; };
    var gy = function (wp) { return PAD.t + (GH - PAD.t - PAD.b) * (100 - wp) / 100; };
    svg('line', { class: 'zero', x1: PAD.l, x2: GW - PAD.r, y1: gy(50), y2: gy(50) }, graph);
    svg('text', { x: 0, y: gy(100) + 4 }, graph).textContent = 'Red';
    svg('text', { x: 0, y: gy(0) + 1 }, graph).textContent = 'Black';
    svg('text', { x: GW - PAD.r, y: GH - 2, 'text-anchor': 'end' }, graph).textContent = String(last);
    var pts = wins.map(function (v, k) { return gx(k).toFixed(1) + ',' + gy(v).toFixed(1); });
    svg('polygon', { class: 'area', points: [gx(0) + ',' + gy(50)].concat(pts, [gx(last) + ',' + gy(50)]).join(' ') }, graph);
    svg('polyline', { class: 'line', points: pts.join(' ') }, graph);
    g.rows.forEach(function (r) {
      if (!BAD[r.quality]) return;
      svg('circle', { class: 'mark q-' + r.quality, cx: gx(r.ply), cy: gy(wins[r.ply]), r: r.quality === 'inaccuracy' ? 2.8 : 3.6 }, graph);
    });
    var cursor = svg('line', { class: 'cursor', y1: PAD.t, y2: GH - PAD.b }, graph);
    var scrub = function (e) { var p = local(graph, e, GW, GH); go(Math.round((p[0] - PAD.l) / (GW - PAD.l - PAD.r) * last)); };
    graph.addEventListener('pointerdown', function (e) { graph.setPointerCapture(e.pointerId); scrub(e); });
    graph.addEventListener('pointermove', function (e) { if (e.buttons) scrub(e); });

    var capt = h('div', { class: 'cands-cap' });
    var tbody = h('tbody');
    var table = h('table', { class: 'cands' }, [
      h('thead', {}, [h('tr', {}, [h('th', { text: '#' }), h('th', { text: 'Engine line' }), h('th', { class: 'r', text: 'Eval' })])]),
      tbody,
    ]);
    var summary = h('div', { class: 'summary' });
    var moves = h('div', { class: 'moves' });
    var legend = h('div', { class: 'legend' });
    var moveButtons = [];

    function evalText(cp, mate) {
      if (mate !== null) return mate === 0 ? (cp > 0 ? '1-0' : '0-1') : (mate > 0 ? '+M' : '−M') + Math.abs(mate);
      var v = cp / 100;
      return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
    }
    function moveLabel(k) {
      return (Math.floor((k - 1) / 2) + 1) + (k % 2 ? '.' : '…') + moveText(boards[k - 1], g.moves[k - 1], state.style);
    }

    function buildMoves() {
      clear(moves);
      moveButtons = [];
      var pair = null;
      g.moves.forEach(function (u, i) {
        if (i % 2 === 0) {
          pair = h('span', { class: 'pair' }, [h('span', { class: 'n', text: (i / 2 + 1) + '.' })]);
          moves.appendChild(pair);
          moves.appendChild(document.createTextNode(' '));
        }
        var r = g.rows[i];
        var b = h('button', { type: 'button', class: state.style === 'chinese' ? 'cjk' : '', onclick: function () { go(i + 1); } },
          [moveText(boards[i], u, state.style), BAD[r.quality] ? dot(r.quality) : null]);
        moveButtons.push(b);
        pair.appendChild(b);
      });
    }

    function go(k) {
      k = Math.max(0, Math.min(last, k));
      prevK = state.k;
      state.k = k;
      state.hover = null;
      render();
    }

    function render() {
      var k = state.k, e = g.evals[k];
      tp.update();
      cursor.setAttribute('x1', gx(k)); cursor.setAttribute('x2', gx(k));
      moveButtons.forEach(function (b, i) { b.classList.toggle('on', i + 1 === k); });
      var on = moveButtons[k - 1];
      if (on && on.offsetParent) {
        var top = on.offsetTop - moves.offsetTop;
        if (top < moves.scrollTop || top > moves.scrollTop + moves.clientHeight - 24) moves.scrollTop = top - 24;
      }

      clear(sub);
      if (k === 0) {
        head.textContent = g.levels.red.label + ' against ' + g.levels.black.label;
        sub.appendChild(h('span', { text: 'web-xiangqi’s opponent levels, seed ' + g.seed }));
        if (CAN_HOVER) sub.appendChild(h('span', { text: 'step with ← →' }));
      } else {
        var r = g.rows[k - 1];
        head.textContent = moveLabel(k);
        if (state.style === 'chinese') head.classList.add('cjk'); else head.classList.remove('cjk');
        sub.appendChild(h('span', {}, [dot(r.quality), LABELS[r.quality]]));
        if (r.quality !== 'best') sub.appendChild(h('span', { text: (r.swing >= 1000 ? 'a forced mate' : (r.swing / 100).toFixed(1) + ' pawns') + ', ' + r.winLoss.toFixed(1) + ' points' }));
        if (r.best && r.best !== g.moves[k - 1] && r.quality !== 'best') sub.appendChild(h('span', { class: state.style === 'chinese' ? 'cjk' : '', text: 'best ' + moveText(boards[k - 1], r.best, state.style) }));
      }
      evalLine.textContent = evalText(e.cp === null ? score(e) : e.cp, e.mate) + ' · Red ' + wins[k].toFixed(0) + '% by the eval bar’s curve';

      var lines = g.lines[k] || [];
      var toMove = k % 2 === 0 ? 'Red' : 'Black';
      capt.textContent = lines.length ? 'Pikafish’s top lines for ' + toMove + ' · depth ' + g.reviewDepth : '';
      clear(tbody);
      lines.forEach(function (ln, i) {
        var tok = X.formatLineTokensInStyle(boards[k], ln.pv, state.style, 6).tokens;
        if (state.style === 'uci') tok = tok.map(function (t) { return t.toLowerCase(); });
        var tr = h('tr', {}, [
          h('td', { text: String(i + 1) }),
          h('td', { class: state.style === 'chinese' ? 'cjk' : '' }, [h('span', { class: 'first', text: tok[0] }), h('span', { class: 'rest', text: ' ' + tok.slice(1).join(' ') })]),
          h('td', { class: 'r', text: evalText(ln.cp === null ? 0 : ln.cp, ln.mate) }),
        ]);
        tr.addEventListener('pointerenter', function () { setHover(i); });
        tr.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') setHover(null); });
        tr.addEventListener('click', function () { setHover(state.hover === i ? null : i); });
        tbody.appendChild(tr);
      });
      if (!lines.length) tbody.appendChild(h('tr', { class: 'empty' }, [h('td', { colspan: '3', text: 'Red has no legal move: Black wins.' })]));
      drawBoard();
    }
    function setHover(i) {
      state.hover = i;
      Array.prototype.forEach.call(tbody.children, function (tr, j) { tr.classList.toggle('hover', j === i); });
      drawBoard();
    }
    function drawBoard() {
      var k = state.k;
      drawCoords(board, state.style);
      drawPieces(board, boards[k], state.pieces || 'traditional', { anim: k && k === prevK + 1 ? g.moves[k - 1] : null });
      prevK = k;
      markLast(board, k ? g.moves[k - 1] : null);
      clear(board.L.arrows);
      clear(board.L.badges);
      var ln = state.hover !== null ? (g.lines[k] || [])[state.hover] : null;
      if (ln) {
        arrow(board, ln.pv[0]);
        if (ln.pv[1]) arrow(board, ln.pv[1], 'alt2');
        note.textContent = 'Line ' + (state.hover + 1) + ', first two moves drawn.';
      } else {
        var best = g.evals[k].best;
        if (state.best && best) arrow(board, best, 'best');
        note.textContent = '';
      }
      if (k > 0) badge(board, g.moves[k - 1].slice(2, 4), g.rows[k - 1].quality);
    }

    var s = g.summary;
    summary.appendChild(document.createTextNode('Accuracy '));
    summary.appendChild(h('b', { text: 'Red ' + s.red }));
    summary.appendChild(document.createTextNode(' · '));
    summary.appendChild(h('b', { text: 'Black ' + s.black }));
    summary.appendChild(document.createTextNode(' · ' + g.result + ', ' + g.ending));
    ORDER.forEach(function (q) { if (s.counts[q]) legend.appendChild(h('span', {}, [dot(q), LABELS[q] + ' ' + s.counts[q]])); });

    var styleTabs = tabs('Notation', STYLES, state.style, function (v) { state.style = v; buildMoves(); render(); });
    var pieceTabs = tabs('Pieces', [['traditional', 'Characters'], ['letters', 'Letters']], 'traditional', function (v) { state.pieces = v; drawBoard(); });
    body.setAttribute('tabindex', '0');
    body.setAttribute('aria-label', 'Game review. Use the left and right arrow keys to step through moves.');
    body.addEventListener('keydown', function (ev) {
      if (ev.target.tagName === 'INPUT' && ev.target.type === 'range') return;
      var to = { ArrowLeft: state.k - 1, ArrowRight: state.k + 1, Home: 0, End: last }[ev.key];
      if (to === undefined) return;
      ev.preventDefault();
      go(to);
    });
    body.appendChild(h('div', { class: 'fig-controls' }, [styleTabs.el, pieceTabs.el]));
    body.appendChild(h('div', { class: 'review' }, [
      h('div', { class: 'col' }, [board.el, tp.el, note]),
      h('div', { class: 'col' }, [
        h('div', {}, [head, sub, evalLine]),
        graph,
        h('div', {}, [capt, table]),
        h('div', {}, [summary, moves]),
        legend,
      ]),
    ]));
    buildMoves();
    // Open on the move that decided the game.
    var worst = g.rows.reduce(function (a, r) { return r.winLoss > a.winLoss ? r : a; }, g.rows[0]);
    go(worst.ply);

    fig.xq = {
      set: function (o) {
        tp.stop();
        if (o.style) styleTabs.set(o.style);
        if (o.move !== undefined) go(Number(o.move));
      },
    };
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    if (!X) return;
    var r = document.getElementById('xq-rules');
    if (r) rules(r);
    var ids = ['xq-clock', 'xq-repetition', 'xq-review'];
    var figs = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!figs.length) return;
    fetch(figs[0].getAttribute('data-src')).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      var builders = { 'xq-clock': clock, 'xq-repetition': repetition, 'xq-review': review };
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
    if (!fig || !fig.xq) return;
    e.preventDefault();
    fig.xq.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      fig.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
