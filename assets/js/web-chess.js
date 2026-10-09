// Figures for "Grading chess moves in a browser tab".
//
// The games, evaluations and lines come from web-chess's own review code run
// offline with Stockfish 18 Lite, the WASM build the app ships (see
// _tools/web-chess-demo), saved to /assets/data/web-chess-demo.json. The
// formulas the figures recompute as you drag (winning chances, move accuracy,
// labels, game accuracy, the device plan) are web-chess's source, bundled into
// web-chess-core.js. Nothing here runs an engine.
(function () {
  'use strict';

  var C = window.WebChessCore;
  var NS = 'http://www.w3.org/2000/svg';
  var LABELS = {
    book: 'Book', best: 'Best', excellent: 'Excellent', good: 'Good',
    inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder', pending: 'Pending',
  };
  var ORDER = ['book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  var GLYPH = { inaccuracy: '?!', mistake: '?', blunder: '??' };
  var BAD = { inaccuracy: 1, mistake: 1, blunder: 1 };

  // Cburnett's pieces, as react-chessboard draws them in web-chess.
  var PIECES = {"wP":"<path d=\"m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z\" style=\"opacity:1;fill:#ffffff;fill-opacity:1;fill-rule:nonzero;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"></path>","wR":"<g style=\"opacity:1;fill:#ffffff;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14\" style=\"stroke-linecap:butt\"></path><path d=\"M 34,14 L 31,17 L 14,17 L 11,14\"></path><path d=\"M 31,17 L 31,29.5 L 14,29.5 L 14,17\" style=\"stroke-linecap:butt;stroke-linejoin:miter\"></path><path d=\"M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5\"></path><path d=\"M 11,14 L 34,14\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path></g>","wN":"<g style=\"opacity:1;fill:none;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18\" style=\"fill:#ffffff;stroke:#000000\"></path><path d=\"M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10\" style=\"fill:#ffffff;stroke:#000000\"></path><path d=\"M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z\" style=\"fill:#000000;stroke:#000000\"></path><path d=\"M 15 15.5 A 0.5 1.5 0 1 1  14,15.5 A 0.5 1.5 0 1 1  15 15.5 z\" transform=\"matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)\" style=\"fill:#000000;stroke:#000000\"></path></g>","wB":"<g style=\"opacity:1;fill:none;fill-rule:evenodd;fill-opacity:1;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><g style=\"fill:#ffffff;stroke:#000000;stroke-linecap:butt\"><path d=\"M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z\"></path><path d=\"M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z\"></path><path d=\"M 25 8 A 2.5 2.5 0 1 1  20,8 A 2.5 2.5 0 1 1  25 8 z\"></path></g><path d=\"M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path></g>","wQ":"<g style=\"fill:#ffffff;stroke:#000000;stroke-width:1.5;stroke-linejoin:round\"><path d=\"M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z\"></path><path d=\"M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z\"></path><path d=\"M 11.5,30 C 15,29 30,29 33.5,30\" style=\"fill:none\"></path><path d=\"M 12,33.5 C 18,32.5 27,32.5 33,33.5\" style=\"fill:none\"></path><circle cx=\"6\" cy=\"12\" r=\"2\"></circle><circle cx=\"14\" cy=\"9\" r=\"2\"></circle><circle cx=\"22.5\" cy=\"8\" r=\"2\"></circle><circle cx=\"31\" cy=\"9\" r=\"2\"></circle><circle cx=\"39\" cy=\"12\" r=\"2\"></circle></g>","wK":"<g style=\"fill:none;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 22.5,11.63 L 22.5,6\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path><path d=\"M 20,8 L 25,8\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path><path d=\"M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25\" style=\"fill:#ffffff;stroke:#000000;stroke-linecap:butt;stroke-linejoin:miter\"></path><path d=\"M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37\" style=\"fill:#ffffff;stroke:#000000\"></path><path d=\"M 12.5,30 C 18,27 27,27 32.5,30\" style=\"fill:none;stroke:#000000\"></path><path d=\"M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5\" style=\"fill:none;stroke:#000000\"></path><path d=\"M 12.5,37 C 18,34 27,34 32.5,37\" style=\"fill:none;stroke:#000000\"></path></g>","bP":"<path d=\"m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 H 34 C 34,31.58 29.59,27.09 26.59,26.03 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z\" style=\"opacity:1;fill:#000000;fill-opacity:1;fill-rule:nonzero;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:miter;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"></path>","bR":"<g style=\"opacity:1;fill:#000000;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 12.5,32 L 14,29.5 L 31,29.5 L 32.5,32 L 12.5,32 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z \" style=\"stroke-linecap:butt;stroke-linejoin:miter\"></path><path d=\"M 14,16.5 L 11,14 L 34,14 L 31,16.5 L 14,16.5 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 L 11,14 z \" style=\"stroke-linecap:butt\"></path><path d=\"M 12,35.5 L 33,35.5 L 33,35.5\" style=\"fill:none;stroke:#ffffff;stroke-width:1;stroke-linejoin:miter\"></path><path d=\"M 13,31.5 L 32,31.5\" style=\"fill:none;stroke:#ffffff;stroke-width:1;stroke-linejoin:miter\"></path><path d=\"M 14,29.5 L 31,29.5\" style=\"fill:none;stroke:#ffffff;stroke-width:1;stroke-linejoin:miter\"></path><path d=\"M 14,16.5 L 31,16.5\" style=\"fill:none;stroke:#ffffff;stroke-width:1;stroke-linejoin:miter\"></path><path d=\"M 11,14 L 34,14\" style=\"fill:none;stroke:#ffffff;stroke-width:1;stroke-linejoin:miter\"></path></g>","bN":"<g style=\"opacity:1;fill:none;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18\" style=\"fill:#000000;stroke:#000000\"></path><path d=\"M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10\" style=\"fill:#000000;stroke:#000000\"></path><path d=\"M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z\" style=\"fill:#ffffff;stroke:#ffffff\"></path><path d=\"M 15 15.5 A 0.5 1.5 0 1 1  14,15.5 A 0.5 1.5 0 1 1  15 15.5 z\" transform=\"matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)\" style=\"fill:#ffffff;stroke:#ffffff\"></path><path d=\"M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z \" style=\"fill:#ffffff;stroke:none\"></path></g>","bB":"<g style=\"opacity:1;fill:none;fill-rule:evenodd;fill-opacity:1;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><g style=\"fill:#000000;stroke:#000000;stroke-linecap:butt\"><path d=\"M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z\"></path><path d=\"M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z\"></path><path d=\"M 25 8 A 2.5 2.5 0 1 1  20,8 A 2.5 2.5 0 1 1  25 8 z\"></path></g><path d=\"M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18\" style=\"fill:none;stroke:#ffffff;stroke-linejoin:miter\"></path></g>","bQ":"<g style=\"fill:#000000;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round\"><path d=\"M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z\" style=\"stroke-linecap:butt;fill:#000000\"></path><path d=\"m 9,26 c 0,2 1.5,2 2.5,4 1,1.5 1,1 0.5,3.5 -1.5,1 -1,2.5 -1,2.5 -1.5,1.5 0,2.5 0,2.5 6.5,1 16.5,1 23,0 0,0 1.5,-1 0,-2.5 0,0 0.5,-1.5 -1,-2.5 -0.5,-2.5 -0.5,-2 0.5,-3.5 1,-2 2.5,-2 2.5,-4 -8.5,-1.5 -18.5,-1.5 -27,0 z\"></path><path d=\"M 11.5,30 C 15,29 30,29 33.5,30\"></path><path d=\"m 12,33.5 c 6,-1 15,-1 21,0\"></path><circle cx=\"6\" cy=\"12\" r=\"2\"></circle><circle cx=\"14\" cy=\"9\" r=\"2\"></circle><circle cx=\"22.5\" cy=\"8\" r=\"2\"></circle><circle cx=\"31\" cy=\"9\" r=\"2\"></circle><circle cx=\"39\" cy=\"12\" r=\"2\"></circle><path d=\"M 11,38.5 A 35,35 1 0 0 34,38.5\" style=\"fill:none;stroke:#000000;stroke-linecap:butt\"></path><g style=\"fill:none;stroke:#ffffff\"><path d=\"M 11,29 A 35,35 1 0 1 34,29\"></path><path d=\"M 12.5,31.5 L 32.5,31.5\"></path><path d=\"M 11.5,34.5 A 35,35 1 0 0 33.5,34.5\"></path><path d=\"M 10.5,37.5 A 35,35 1 0 0 34.5,37.5\"></path></g></g>","bK":"<g style=\"fill:none;fill-opacity:1;fill-rule:evenodd;stroke:#000000;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1\"><path d=\"M 22.5,11.63 L 22.5,6\" id=\"path6570\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path><path d=\"M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25\" style=\"fill:#000000;fill-opacity:1;stroke-linecap:butt;stroke-linejoin:miter\"></path><path d=\"M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37\" style=\"fill:#000000;stroke:#000000\"></path><path d=\"M 20,8 L 25,8\" style=\"fill:none;stroke:#000000;stroke-linejoin:miter\"></path><path d=\"M 32,29.5 C 32,29.5 40.5,25.5 38.03,19.85 C 34.15,14 25,18 22.5,24.5 L 22.5,26.6 L 22.5,24.5 C 20,18 10.85,14 6.97,19.85 C 4.5,25.5 13,29.5 13,29.5\" style=\"fill:none;stroke:#ffffff\"></path><path d=\"M 12.5,30 C 18,27 27,27 32.5,30 M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5 M 12.5,37 C 18,34 27,34 32.5,37\" style=\"fill:none;stroke:#ffffff\"></path></g>"};

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
  function pawns(cp) { return (cp / 100).toFixed(cp >= 995 ? 0 : 1); }

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
    return { el: h('label', { class: 'check' }, [input, label]), input: input };
  }
  function mount(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }
  // Pointer position inside an SVG, in viewBox units.
  function local(el, e, w, hgt) {
    var r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * hgt];
  }

  // ---- Board ---------------------------------------------------------------
  function installPieces() {
    if (document.getElementById('wc-pieces')) return;
    var defs = svg('svg', { id: 'wc-pieces', width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
    var d = svg('defs', {}, defs);
    Object.keys(PIECES).forEach(function (k) {
      var s = svg('symbol', { id: 'wc-' + k, viewBox: '0 0 45 45' }, d);
      s.innerHTML = PIECES[k];
    });
    document.body.appendChild(defs);
  }
  function sqXY(sq) { return [sq.charCodeAt(0) - 97, 8 - Number(sq[1])]; }

  function makeBoard(label) {
    var el = svg('svg', { class: 'cb', viewBox: '0 0 8 8', role: 'img', 'aria-label': label });
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      svg('rect', { class: (x + y) % 2 ? 'd' : 'l', x: x, y: y, width: 1, height: 1 }, el);
    }
    var L = {};
    ['marks', 'coords', 'pieces', 'arrows', 'badges', 'hits'].forEach(function (k) { L[k] = svg('g', {}, el); });
    for (var i = 0; i < 8; i++) {
      svg('text', { class: 'coord', x: i + 0.94, y: 7.95, 'text-anchor': 'end' }, L.coords).textContent = 'abcdefgh'[i];
      svg('text', { class: 'coord', x: 0.05, y: i + 0.22 }, L.coords).textContent = String(8 - i);
    }
    return { el: el, L: L };
  }
  function drawFen(b, fen) {
    clear(b.L.pieces);
    var rows = fen.split(' ')[0].split('/');
    rows.forEach(function (row, y) {
      var x = 0;
      for (var i = 0; i < row.length; i++) {
        var ch = row[i];
        if (/\d/.test(ch)) { x += Number(ch); continue; }
        var key = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase();
        svg('use', { href: '#wc-' + key, x: x, y: y, width: 1, height: 1 }, b.L.pieces);
        x++;
      }
    });
  }
  function markSquares(b, squares) {
    clear(b.L.marks);
    squares.forEach(function (sq) {
      var p = sqXY(sq);
      svg('rect', { class: 'lm', x: p[0], y: p[1], width: 1, height: 1 }, b.L.marks);
    });
  }
  function arrow(b, uci, cls) {
    var a = sqXY(uci.slice(0, 2)), z = sqXY(uci.slice(2, 4));
    var x1 = a[0] + 0.5, y1 = a[1] + 0.5, x2 = z[0] + 0.5, y2 = z[1] + 0.5;
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    var w = 0.075, hw = 0.21, hl = 0.36, s = 0.18;
    var sx = x1 + ux * s, sy = y1 + uy * s, bx = x2 - ux * hl, by = y2 - uy * hl;
    var pts = [
      [sx + nx * w, sy + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x2, y2],
      [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [sx - nx * w, sy - ny * w],
    ];
    svg('polygon', { class: 'arrow ' + cls, points: pts.map(function (p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join(' ') }, b.L.arrows);
  }
  function badge(b, sq, q) {
    var p = sqXY(sq);
    var g = svg('g', { class: 'badge q-' + q }, b.L.badges);
    svg('circle', { cx: p[0] + 0.84, cy: p[1] + 0.16, r: 0.16 }, g);
    if (GLYPH[q]) svg('text', { x: p[0] + 0.84, y: p[1] + 0.165 }, g).textContent = GLYPH[q];
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
  function moveLabel(game, ply) {
    var r = game.rows[ply - 1];
    return Math.ceil(ply / 2) + (r.side === 'w' ? '.' : '…') + r.san;
  }
  function evalText(ev) {
    if (ev.mate !== null) return ev.mate === 0 ? (ev.cp > 0 ? '1-0' : '0-1') : (ev.mate > 0 ? '+M' : '−M') + Math.abs(ev.mate);
    var v = ev.cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  }

  // =========================================================================
  // What web-chess would set up on a device
  // =========================================================================
  var DEVICES = {
    phone: { cores: 8, memory: 4, mobile: true, isolated: true },
    laptop: { cores: 4, memory: 8, mobile: false, isolated: true },
    desktop: { cores: 18, memory: 8, mobile: false, isolated: true },
    pages: { cores: 18, memory: 8, mobile: false, isolated: false },
  };
  function device(fig) {
    var body = mount(fig);
    var seen = C.detectEngineCapabilities();
    var QUEUE = 33;
    var state = {
      cores: Math.max(1, Math.min(32, seen.hardwareConcurrency || 4)),
      memory: typeof seen.deviceMemoryGb === 'number' ? Math.min(8, seen.deviceMemoryGb) : null,
      mobile: seen.isMobile,
      isolated: true,
    };

    var coreOut = h('output');
    var coreIn = h('input', { type: 'range', min: '1', max: '32', step: '1', 'aria-label': 'Logical cores' });
    coreIn.addEventListener('input', function () { state.cores = Number(coreIn.value); render(); });
    var memTabs = tabs('Memory', [['2', '2 GB'], ['4', '4 GB'], ['8', '8 GB or more'], ['none', 'Not reported']],
      state.memory === null ? 'none' : String(state.memory <= 2 ? 2 : state.memory <= 4 ? 4 : 8),
      function (v) { state.memory = v === 'none' ? null : Number(v); render(); });
    var mobileBox = checkbox('Phone or tablet', state.mobile, function (v) { state.mobile = v; render(); });
    var isoBox = checkbox('Cross-origin isolated', state.isolated, function (v) { state.isolated = v; render(); });

    body.appendChild(h('p', { class: 'dev-detected', text:
      'Starts from this browser: ' + (seen.hardwareConcurrency || '?') + ' logical cores, ' +
      (typeof seen.deviceMemoryGb === 'number' ? seen.deviceMemoryGb + ' GB reported' : 'memory not reported') +
      (seen.isMobile ? ', a mobile browser' : '') + '. This blog page is not cross-origin isolated' +
      (self.crossOriginIsolated ? ' (here it is)' : '') + '; the app’s own page is, through its service worker.' }));
    body.appendChild(h('div', { class: 'dev-inputs' }, [
      h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Cores' }), h('label', { class: 'slider' }, [coreIn, coreOut])]),
      h('div', { class: 'row' }, [h('span', { class: 'lbl', text: 'Memory' }), memTabs.el]),
      h('div', { class: 'row' }, [mobileBox.el, isoBox.el]),
    ]));
    var out = h('dl', { class: 'dev-out' });
    var coreCap = h('p', { class: 'strip-cap' });
    var cores = h('div', { class: 'cells', 'aria-hidden': 'true' });
    var queueCap = h('p', { class: 'strip-cap' });
    var queue = h('div', { class: 'cells queue', 'aria-hidden': 'true' });
    body.appendChild(out);
    body.appendChild(coreCap);
    body.appendChild(cores);
    body.appendChild(queueCap);
    body.appendChild(queue);

    function render() {
      coreIn.value = String(state.cores);
      coreOut.textContent = String(state.cores);
      var caps = {
        sharedArrayBuffer: true,
        crossOriginIsolated: state.isolated,
        hardwareConcurrency: state.cores,
        deviceMemoryGb: state.memory === null ? undefined : state.memory,
        isMobile: state.mobile,
      };
      var profile = C.resolveProfile('auto', caps);
      var threads = C.recommendedThreadCount(profile, caps);
      var hash = C.recommendedHashMb(caps);
      var lines = C.recommendedMultiPv(caps);
      var plan = C.planReviewPool({ profile: profile, capabilities: caps, queueLength: QUEUE, hashMb: hash, maxWorkers: 4 });
      var threaded = profile.requiresIsolation;

      clear(out);
      [
        ['Engine build', threaded ? 'Lite, multithreaded' : 'Lite, one thread'],
        ['Threads', String(threads)],
        ['Hash table', hash + ' MB'],
        ['Lines shown', String(lines)],
        ['Review engines', String(plan.workers)],
        ['Each review engine', plan.threadsPerWorker + (plan.threadsPerWorker === 1 ? ' thread, ' : ' threads, ') + plan.hashMbPerWorker + ' MB'],
      ].forEach(function (r) { out.appendChild(h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])); });

      // Which cores the review's engines occupy.
      clear(cores);
      var used = plan.workers * plan.threadsPerWorker;
      for (var c = 0; c < state.cores; c++) {
        var w = Math.floor(c / plan.threadsPerWorker);
        cores.appendChild(h('i', { class: c < used ? 'on w' + (w + 1) : '', text: c < used ? String(w + 1) : '' }));
      }
      coreCap.textContent = plan.workers > 1
        ? 'During a review: ' + plan.workers + ' engines on ' + used + ' of ' + state.cores + ' cores.'
        : 'During a review: one engine on ' + used + (used === 1 ? ' core' : ' cores') + ' of ' + state.cores + '.';

      // Which positions each engine takes: contiguous blocks.
      clear(queue);
      var idx = []; for (var i = 0; i < QUEUE; i++) idx.push(i);
      var blocks = C.splitReviewQueue(idx, plan.workers);
      blocks.forEach(function (block, bi) {
        block.forEach(function () { queue.appendChild(h('i', { class: 'on w' + (bi + 1) })); });
      });
      queueCap.textContent = 'The ' + QUEUE + ' positions of the Opera Game, split ' +
        (blocks.length > 1 ? 'into ' + blocks.map(function (b) { return b.length; }).join(' + ') + ', in order.' : 'nowhere: one engine takes them all.');
    }
    render();

    fig.wc = {
      set: function (o) {
        var d = DEVICES[o.device];
        if (!d) return;
        state.cores = d.cores; state.memory = d.memory; state.mobile = d.mobile; state.isolated = d.isolated;
        memTabs.set(state.memory === null ? 'none' : String(state.memory));
        mobileBox.input.checked = d.mobile;
        isoBox.input.checked = d.isolated;
        render();
      },
    };
  }

  // =========================================================================
  // Grading one move: centipawns, winning chances, and the milder reading
  // =========================================================================
  var CP_RUNGS = [20, 70, 140, 260];
  var WIN_RUNGS = CP_RUNGS.map(function (cp) { return C.winPercentFromCp(0) - C.winPercentFromCp(-cp); });
  var GRADED = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  function rung(v, rungs) { var i = 0; while (i < rungs.length && v > rungs[i]) i++; return i; }

  function grade(fig, data) {
    var body = mount(fig);
    var W = 420, H = 270, P = { l: 34, r: 12, t: 14, b: 30 }, LIM = 1200;
    var state = { before: 0, after: -300 };
    var X = function (cp) { return P.l + (W - P.l - P.r) * (Math.max(-LIM, Math.min(LIM, cp)) + LIM) / (2 * LIM); };
    var Y = function (wp) { return P.t + (H - P.t - P.b) * (100 - wp) / 100; };
    var chart = svg('svg', { class: 'curve', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Winning chances against the engine score, with the positions before and after a move' });
    var grid = svg('g', { class: 'grid' }, chart);
    [-1200, -600, 0, 600, 1200].forEach(function (cp) {
      svg('line', { class: cp === 0 ? 'mid' : '', x1: X(cp), x2: X(cp), y1: P.t, y2: H - P.b }, grid);
      svg('text', { x: X(cp), y: H - P.b + 14, 'text-anchor': 'middle' }, chart).textContent = (cp > 0 ? '+' : cp < 0 ? '−' : '') + Math.abs(cp / 100);
    });
    [0, 50, 100].forEach(function (wp) {
      svg('line', { class: wp === 50 ? 'mid' : '', x1: P.l, x2: W - P.r, y1: Y(wp), y2: Y(wp) }, grid);
      svg('text', { x: P.l - 6, y: Y(wp) + 3.5, 'text-anchor': 'end' }, chart).textContent = wp + '%';
    });
    svg('text', { x: W - P.r, y: H - 2, 'text-anchor': 'end' }, chart).textContent = 'pawns, for the side moving';
    var d = '';
    for (var cp = -LIM; cp <= LIM; cp += 10) d += (cp === -LIM ? 'M' : 'L') + X(cp).toFixed(1) + ' ' + Y(C.winPercentFromCp(cp)).toFixed(1);
    svg('path', { class: 'fn', d: d }, chart);
    var G = svg('g', {}, chart);
    var handles = ['before', 'after'].map(function (k) {
      var c = svg('circle', { class: 'handle ' + k, r: 7, tabindex: '0', role: 'slider', 'aria-label': k === 'before' ? 'Score before the move' : 'Score after the move' }, chart);
      var t = svg('text', { class: 'hl ' + k, 'text-anchor': 'middle' }, chart);
      t.textContent = k;
      c.addEventListener('keydown', function (e) {
        var step = { ArrowLeft: -10, ArrowRight: 10, ArrowDown: -10, ArrowUp: 10, PageDown: -100, PageUp: 100 }[e.key];
        if (!step) return;
        e.preventDefault();
        state[k] = Math.max(-LIM, Math.min(LIM, state[k] + step));
        render();
      });
      return { k: k, c: c, t: t };
    });
    var drag = null;
    chart.addEventListener('pointerdown', function (e) {
      var p = local(chart, e, W, H);
      var db = Math.abs(p[0] - X(state.before)) + Math.abs(p[1] - Y(C.winPercentFromCp(state.before))) * 0.3;
      var da = Math.abs(p[0] - X(state.after)) + Math.abs(p[1] - Y(C.winPercentFromCp(state.after))) * 0.3;
      drag = db <= da ? 'before' : 'after';
      chart.setPointerCapture(e.pointerId);
      move(e);
    });
    chart.addEventListener('pointermove', function (e) { if (drag) move(e); });
    chart.addEventListener('pointerup', function () { drag = null; });
    function move(e) {
      var p = local(chart, e, W, H);
      var cp = (p[0] - P.l) / (W - P.l - P.r) * 2 * LIM - LIM;
      state[drag] = Math.round(Math.max(-LIM, Math.min(LIM, cp)) / 5) * 5;
      render();
    }

    function ladder(title) {
      var head = h('div', { class: 'ladder-head' }, [h('span', { text: title }), h('b')]);
      var rungs = h('div', { class: 'rungs' });
      var spans = GRADED.map(function (q) {
        var s = h('span', { class: 'q-' + q }, [LABELS[q], h('small')]);
        rungs.appendChild(s);
        return s;
      });
      return { el: h('div', { class: 'ladder' }, [head, rungs]), value: head.lastChild, spans: spans };
    }
    var raw = ladder('Pawns given up');
    var practical = ladder('Winning chances given up');
    raw.spans.forEach(function (s, i) { s.lastChild.textContent = i < 4 ? '≤ ' + (CP_RUNGS[i] / 100).toFixed(1) : 'more'; });
    practical.spans.forEach(function (s, i) { s.lastChild.textContent = i < 4 ? '≤ ' + WIN_RUNGS[i].toFixed(1) : 'more'; });
    var verdict = h('div', { class: 'verdict' }, [h('div', { class: 'big' }), h('div', { class: 'sub' })]);
    var note = h('p', { class: 'fig-note' });

    function render() {
      var b = state.before, a = state.after;
      var wb = C.winPercentFromCp(b), wa = C.winPercentFromCp(a);
      var deltaCp = a - b; // negative when the mover gave something up
      var winLoss = Math.max(0, wb - wa);
      var q = C.qualityForLoss(deltaCp, winLoss);
      clear(G);
      svg('line', { class: 'guide', x1: P.l, x2: X(b), y1: Y(wb), y2: Y(wb) }, G);
      svg('line', { class: 'guide', x1: P.l, x2: X(a), y1: Y(wa), y2: Y(wa) }, G);
      svg('line', { class: 'guide', x1: X(b), x2: X(b), y1: Y(wb), y2: H - P.b }, G);
      svg('line', { class: 'guide', x1: X(a), x2: X(a), y1: Y(wa), y2: H - P.b }, G);
      if (winLoss > 0) svg('line', { class: 'span-y', x1: P.l + 1.5, x2: P.l + 1.5, y1: Y(wb), y2: Y(wa) }, G);
      if (a !== b) svg('line', { class: 'span-x', x1: X(b), x2: X(a), y1: H - P.b - 1.5, y2: H - P.b - 1.5 }, G);
      handles.forEach(function (hd) {
        var v = state[hd.k], x = X(v), y = Y(C.winPercentFromCp(v));
        hd.c.setAttribute('cx', x); hd.c.setAttribute('cy', y);
        hd.c.setAttribute('aria-valuetext', (v / 100).toFixed(2) + ' pawns');
        var above = hd.k === 'before' ? y > 40 : y > 40 && Math.abs(X(state.before) - x) > 30;
        hd.t.setAttribute('x', x); hd.t.setAttribute('y', above ? y - 12 : y + 20);
      });

      var lost = Math.max(0, -deltaCp);
      raw.value.textContent = pawns(lost);
      practical.value.textContent = winLoss.toFixed(1) + ' points';
      var ri = rung(lost, CP_RUNGS), pi = rung(winLoss, WIN_RUNGS);
      raw.spans.forEach(function (s, i) { s.classList.toggle('on', i === ri); });
      practical.spans.forEach(function (s, i) { s.classList.toggle('on', i === pi); });
      verdict.firstChild.className = 'big q-' + q;
      clear(verdict.firstChild);
      verdict.firstChild.appendChild(dot(q));
      verdict.firstChild.appendChild(document.createTextNode(LABELS[q] + (ri !== pi ? ', the milder of the two' : '')));
      verdict.lastChild.textContent = 'Move accuracy ' + C.accuracyFromWinPercentLoss(winLoss).toFixed(1) +
        ' · ' + wb.toFixed(1) + '% → ' + wa.toFixed(1) + '% to win';
    }
    note.textContent = 'Drag either point along the curve' + (CAN_HOVER ? ', or focus one and use the arrow keys.' : '.');
    body.appendChild(h('div', { class: 'grade' }, [h('div', {}, [chart, note]), h('div', {}, [raw.el, practical.el, verdict])]));
    render();

    fig.wc = {
      set: function (o) {
        if (o.game) {
          var g = data.games.filter(function (x) { return x.id === o.game; })[0];
          var ply = Number(o.ply), row = g.rows[ply - 1];
          var sign = row.side === 'w' ? 1 : -1;
          state.before = sign * g.frames[ply - 1].eval.cp;
          state.after = sign * g.frames[ply].eval.cp;
          note.textContent = moveLabel(g, ply) + ': ' + pawns(state.before) + ' before, ' +
            (Math.abs(state.after) >= 10000 ? 'mated after' : pawns(state.after) + ' after') + ', for the side that moved.';
        } else {
          state.before = Number(o.before); state.after = Number(o.after);
        }
        render();
      },
    };
  }

  // =========================================================================
  // One number for a game
  // =========================================================================
  function accuracy(fig, data) {
    var body = mount(fig);
    var sets = {
      one: { label: 'One blunder in forty', acc: [], w: [] },
    };
    for (var i = 0; i < 40; i++) { sets.one.acc.push(i === 26 ? 9.5 : 95); sets.one.w.push(1); }
    data.games.forEach(function (g) {
      ['w', 'b'].forEach(function (side) {
        var rows = g.rows.filter(function (r) { return r.side === side && r.accuracy !== null; });
        sets[g.id + '-' + side] = {
          acc: rows.map(function (r) { return r.accuracy; }),
          w: rows.map(function (r) { return r.weight; }),
        };
      });
    });
    var state = { key: 'one', acc: sets.one.acc.slice(), w: sets.one.w.slice(), hover: -1 };
    var W = 600, H = 170, P = { l: 30, r: 4, t: 8, b: 34 };
    var chart = svg('svg', { class: 'acc-bars', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Accuracy of each move, with its weight below' });
    var under = svg('g', {}, chart), barsG = svg('g', {}, chart), wG = svg('g', {}, chart);
    var Y = function (v) { return P.t + (H - P.t - P.b - 18) * (100 - v) / 100; };
    [0, 50, 100].forEach(function (v) {
      svg('text', { x: P.l - 6, y: Y(v) + 3.5, 'text-anchor': 'end' }, chart).textContent = String(v);
    });
    svg('line', { class: 'base', x1: P.l, x2: W - P.r, y1: Y(0), y2: Y(0) }, chart);
    svg('text', { x: P.l - 6, y: H - P.b + 13, 'text-anchor': 'end' }, chart).textContent = 'wt';
    var means = h('div', { class: 'means', 'aria-live': 'polite' });
    var note = h('p', { class: 'fig-note' });

    function geom() {
      var n = state.acc.length, span = (W - P.l - P.r) / n;
      return { n: n, span: span, bw: Math.max(1.5, span * 0.72) };
    }
    function render() {
      var g = geom();
      clear(under); clear(barsG); clear(wG);
      var wMax = 12;
      state.acc.forEach(function (v, i) {
        var x = P.l + i * g.span + (g.span - g.bw) / 2;
        if (i === state.hover) svg('rect', { class: 'hover', x: P.l + i * g.span, y: P.t, width: g.span, height: Y(0) - P.t }, under);
        svg('rect', { class: 'bar' + (v < 50 ? ' low' : ''), x: x, y: Y(v), width: g.bw, height: Math.max(0.5, Y(0) - Y(v)) }, barsG);
        var wh = 16 * Math.min(1, state.w[i] / wMax);
        svg('rect', { class: 'wt', x: x, y: H - P.b + 2 + (16 - wh), width: g.bw, height: Math.max(0.6, wh) }, wG);
      });
      var mean = state.acc.reduce(function (s, v) { return s + v; }, 0) / state.acc.length;
      var weighted = C.weightedMean(state.acc, state.w);
      var harmonic = C.harmonicMean(state.acc);
      var game = C.aggregateAccuracy(state.acc, state.w);
      clear(means);
      [['Plain mean', mean, ''], ['Volatility-weighted', weighted, ''], ['Harmonic', harmonic, ''], ['Game accuracy', game, ' final']].forEach(function (m) {
        means.appendChild(h('div', { class: 'mrow' + m[2] }, [
          h('span', { class: 'mname', text: m[0] }),
          h('span', { class: 'mtrack' }, [h('i', { style: 'width:' + m[1].toFixed(2) + '%' })]),
          h('b', { text: m[1].toFixed(1) }),
        ]));
      });
    }
    function setAt(e) {
      var g = geom();
      var p = local(chart, e, W, H);
      var i = Math.floor((p[0] - P.l) / g.span);
      if (i < 0 || i >= g.n) return;
      var v = Math.max(0, Math.min(100, 100 - (p[1] - P.t) / (Y(0) - P.t) * 100));
      state.acc[i] = Math.round(v * 10) / 10;
      state.hover = i;
      note.textContent = 'Move ' + (i + 1) + ' of ' + g.n + ': accuracy ' + state.acc[i].toFixed(1) + ', weight ' + state.w[i].toFixed(2) + '.';
      render();
    }
    var dragging = false;
    chart.addEventListener('pointerdown', function (e) { dragging = true; chart.setPointerCapture(e.pointerId); setAt(e); });
    chart.addEventListener('pointermove', function (e) {
      if (dragging) { setAt(e); return; }
      var g = geom(), p = local(chart, e, W, H), i = Math.floor((p[0] - P.l) / g.span);
      if (i >= 0 && i < g.n && i !== state.hover) {
        state.hover = i;
        note.textContent = 'Move ' + (i + 1) + ' of ' + g.n + ': accuracy ' + state.acc[i].toFixed(1) + ', weight ' + state.w[i].toFixed(2) + '.';
        render();
      }
    });
    chart.addEventListener('pointerup', function () { dragging = false; });
    chart.addEventListener('pointerleave', function () { if (!dragging) { state.hover = -1; render(); } });

    var opts = [['one', 'One blunder in forty']];
    data.games.forEach(function (g) {
      opts.push([g.id + '-w', g.nick + ', White']);
      opts.push([g.id + '-b', g.nick + ', Black']);
    });
    var picker = tabs('Moves', opts, state.key, function (v) { load(v); });
    function load(k) {
      state.key = k;
      state.acc = sets[k].acc.slice();
      state.w = sets[k].w.slice();
      state.hover = -1;
      note.textContent = k === 'one'
        ? 'Thirty-nine moves at 95 and one at 9.5, all weighted alike. Drag any bar up or down.'
        : 'Each move’s accuracy from the review, and below it the weight from how much the game was swinging around it. Drag any bar.';
      render();
    }
    body.appendChild(h('div', { class: 'fig-controls' }, [picker.el, h('span', { class: 'grow' }),
      h('button', { class: 'btn', type: 'button', text: 'Reset', onclick: function () { load(state.key); } })]));
    body.appendChild(chart);
    body.appendChild(means);
    body.appendChild(note);
    load('one');

    fig.wc = { set: function (o) { if (o.set) picker.set(o.set); } };
  }

  // =========================================================================
  // The review
  // =========================================================================
  function review(fig, data) {
    var body = mount(fig);
    var state = { g: 0, k: 0, hover: null, best: true };
    var board = makeBoard('Chess position under review');
    var head = h('div', { class: 'move-head', 'aria-live': 'polite' });
    var sub = h('div', { class: 'move-sub' });
    var evalLine = h('div', { class: 'move-sub' });
    var wdl = h('div', { class: 'wdl', 'aria-hidden': 'true' }, [h('i', { class: 'w' }), h('i', { class: 'dr' }), h('i', { class: 'b' })]);
    var note = h('p', { class: 'fig-note' });
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', step: '1', 'aria-label': 'Move number' });
    slider.addEventListener('input', function () { go(Number(slider.value)); });
    var transport = h('div', { class: 'transport' }, [
      iconButton('first', 'First move', function () { go(0); }),
      iconButton('prev', 'Previous move', function () { go(state.k - 1); }),
      slider,
      iconButton('next', 'Next move', function () { go(state.k + 1); }),
      iconButton('last', 'Last move', function () { go(last()); }),
      counter,
    ]);
    var GW = 360, GH = 120, PAD = { l: 30, r: 4, t: 8, b: 16 };
    var graph = svg('svg', { class: 'graph', viewBox: '0 0 ' + GW + ' ' + GH, role: 'img', 'aria-label': 'White’s winning chances by move; dots mark inaccuracies, mistakes and blunders' });
    var graphG = svg('g', {}, graph);
    var cursor = svg('line', { class: 'cursor', y1: PAD.t, y2: GH - PAD.b }, graph);
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

    function game() { return data.games[state.g]; }
    function last() { return game().frames.length - 1; }
    var gx = function (k) { return PAD.l + (GW - PAD.l - PAD.r) * k / last(); };
    var gy = function (wp) { return PAD.t + (GH - PAD.t - PAD.b) * (100 - wp) / 100; };
    function scrub(e) {
      var p = local(graph, e, GW, GH);
      go(Math.round((p[0] - PAD.l) / (GW - PAD.l - PAD.r) * last()));
    }
    graph.addEventListener('pointerdown', function (e) { graph.setPointerCapture(e.pointerId); scrub(e); });
    graph.addEventListener('pointermove', function (e) { if (e.buttons) scrub(e); });

    function loadGame(i) {
      state.g = i;
      var g = game();
      slider.max = String(last());
      clear(graphG);
      var wps = g.frames.map(function (f) { return C.winPercentFromCp(f.eval.cp); });
      svg('line', { class: 'zero', x1: PAD.l, x2: GW - PAD.r, y1: gy(50), y2: gy(50) }, graphG);
      svg('text', { x: 0, y: gy(100) + 4 }, graphG).textContent = 'White';
      svg('text', { x: 0, y: gy(0) + 1 }, graphG).textContent = 'Black';
      svg('text', { x: GW - PAD.r, y: GH - 2, 'text-anchor': 'end' }, graphG).textContent = String(last());
      var pts = wps.map(function (v, k) { return gx(k).toFixed(1) + ',' + gy(v).toFixed(1); });
      svg('polygon', { class: 'area', points: [gx(0) + ',' + gy(50)].concat(pts, [gx(last()) + ',' + gy(50)]).join(' ') }, graphG);
      svg('polyline', { class: 'line', points: pts.join(' ') }, graphG);
      g.rows.forEach(function (r) {
        if (!BAD[r.quality]) return;
        svg('circle', { class: 'mark q-' + r.quality, cx: gx(r.ply), cy: gy(wps[r.ply]), r: r.quality === 'inaccuracy' ? 2.8 : 3.6 }, graphG);
      });

      clear(moves);
      moveButtons = [];
      var pair = null;
      g.rows.forEach(function (r) {
        if (r.side === 'w' || !pair) {
          pair = h('span', { class: 'pair' }, [h('span', { class: 'n', text: Math.ceil(r.ply / 2) + (r.side === 'w' ? '.' : '…') })]);
          moves.appendChild(pair);
          moves.appendChild(document.createTextNode(' '));
        }
        var b = h('button', { type: 'button', onclick: function () { go(r.ply); } }, [r.san, BAD[r.quality] ? dot(r.quality) : null]);
        moveButtons.push(b);
        pair.appendChild(b);
      });

      var s = g.summary;
      clear(summary);
      summary.appendChild(document.createTextNode('Accuracy '));
      summary.appendChild(h('b', { text: 'White ' + s.white.toFixed(1) }));
      summary.appendChild(document.createTextNode(' · '));
      summary.appendChild(h('b', { text: 'Black ' + s.black.toFixed(1) }));
      summary.appendChild(document.createTextNode(' · ' + g.result));
      clear(legend);
      ORDER.forEach(function (q) {
        var n = g.counts[q] || 0;
        if (n) legend.appendChild(h('span', {}, [dot(q), LABELS[q] + ' ' + n]));
      });
      state.k = -1;
      go(g.start || 0);
    }

    function go(k) {
      k = Math.max(0, Math.min(last(), k));
      if (k === state.k) return;
      state.k = k;
      state.hover = null;
      render();
    }

    function render() {
      var g = game(), k = state.k, f = g.frames[k];
      slider.value = String(k);
      counter.textContent = k + ' / ' + last();
      cursor.setAttribute('x1', gx(k)); cursor.setAttribute('x2', gx(k));
      moveButtons.forEach(function (b, i) { b.classList.toggle('on', i + 1 === k); });

      clear(sub);
      if (k === 0) {
        head.textContent = g.title;
        sub.appendChild(h('span', { text: g.subtitle }));
        if (CAN_HOVER) sub.appendChild(h('span', { text: 'step with ← →' }));
      } else {
        var r = g.rows[k - 1];
        head.textContent = moveLabel(g, k);
        sub.appendChild(h('span', {}, [dot(r.quality), LABELS[r.quality]]));
        if (r.deltaCp !== null && r.quality !== 'best' && r.quality !== 'book') {
          var sign = r.side === 'w' ? 1 : -1;
          var before = sign * g.frames[k - 1].eval.cp, after = sign * f.eval.cp;
          var what = before >= 10000 && after < 10000 ? 'let a forced mate go'
            : after <= -10000 && before > -10000 ? 'walked into a forced mate'
            : 'gave up ' + pawns(Math.max(0, -r.deltaCp)) + ' pawns';
          sub.appendChild(h('span', { text: what + ', ' + r.winLoss.toFixed(1) + ' points of winning chances' }));
        }
        if (r.best && r.quality !== 'best' && r.best !== r.san) sub.appendChild(h('span', { text: 'best was ' + r.best }));
      }
      var ev = f.eval;
      var wp = C.winPercentFromCp(ev.cp);
      evalLine.textContent = evalText(ev) + ' · White ' + wp.toFixed(0) + '% to win by the score' +
        (ev.wdl ? ' · Stockfish’s own split ' + (ev.wdl[0] / 10).toFixed(0) + ' / ' + (ev.wdl[1] / 10).toFixed(0) + ' / ' + (ev.wdl[2] / 10).toFixed(0) : '');
      if (ev.wdl) {
        wdl.children[0].style.width = ev.wdl[0] / 10 + '%';
        wdl.children[1].style.width = ev.wdl[1] / 10 + '%';
        wdl.children[2].style.width = ev.wdl[2] / 10 + '%';
      }

      var lines = f.lines || [];
      var toMove = f.fen.split(' ')[1] === 'w' ? 'White' : 'Black';
      capt.textContent = lines.length ? 'Stockfish’s top lines for ' + toMove + ', depth ' + data.depth + '. ' + POINT + ' a row to draw it.' : '';
      clear(tbody);
      lines.forEach(function (ln, i) {
        var tr = h('tr', {}, [
          h('td', { text: String(i + 1) }),
          h('td', {}, [h('span', { class: 'first', text: ln.san[0] }), h('span', { class: 'rest', text: ' ' + ln.san.slice(1, 6).join(' ') })]),
          h('td', { class: 'r', text: evalText({ cp: ln.cp, mate: ln.mate }) }),
        ]);
        tr.addEventListener('pointerenter', function () { setHover(i); });
        tr.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') setHover(null); });
        tr.addEventListener('click', function () { setHover(state.hover === i ? null : i); });
        tbody.appendChild(tr);
      });
      if (!lines.length) tbody.appendChild(h('tr', { class: 'empty' }, [h('td', { colspan: '3', text: 'The game is over.' })]));
      drawBoard();
    }

    function setHover(i) {
      state.hover = i;
      Array.prototype.forEach.call(tbody.children, function (tr, j) { tr.classList.toggle('hover', j === i); });
      drawBoard();
    }

    function drawBoard() {
      var g = game(), k = state.k, f = g.frames[k];
      drawFen(board, f.fen);
      markSquares(board, f.move ? [f.move.from, f.move.to] : []);
      clear(board.L.arrows);
      clear(board.L.badges);
      var ln = state.hover !== null && f.lines ? f.lines[state.hover] : null;
      if (ln) {
        arrow(board, ln.uci[0], 'alt');
        if (ln.uci[1]) arrow(board, ln.uci[1], 'alt2');
        note.textContent = 'Line ' + (state.hover + 1) + ': ' + ln.san.slice(0, 8).join(' ') + (ln.san.length > 8 ? ' …' : '');
      } else {
        if (state.best && f.best) arrow(board, f.best, 'best');
        note.textContent = state.best && f.best ? 'The green arrow is Stockfish’s choice for the side to move.' : '';
      }
      if (k > 0) badge(board, f.move.to, g.rows[k - 1].quality);
    }

    body.setAttribute('tabindex', '0');
    body.setAttribute('aria-label', 'Game review. Use the left and right arrow keys to step through moves.');
    body.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
      var to = { ArrowLeft: state.k - 1, ArrowRight: state.k + 1, Home: 0, End: last() }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go(to);
    });

    var gameTabs = tabs('Game', data.games.map(function (g, i) { return [String(i), g.tab]; }), '0', function (v) { loadGame(Number(v)); });
    var bestBox = checkbox('Best move', true, function (v) { state.best = v; drawBoard(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [gameTabs.el, h('span', { class: 'grow' }), bestBox.el]));
    body.appendChild(h('div', { class: 'review' }, [
      h('div', { class: 'col' }, [board.el, transport, note]),
      h('div', { class: 'col' }, [
        h('div', {}, [head, sub, evalLine, wdl]),
        graph,
        h('div', {}, [capt, table]),
        h('div', {}, [summary, moves]),
        legend,
      ]),
    ]));
    loadGame(0);

    fig.wc = {
      set: function (o) {
        if (o.game !== undefined) {
          var i = data.games.map(function (g) { return g.id; }).indexOf(o.game);
          if (i !== state.g) gameTabs.set(String(i));
        }
        if (o.move !== undefined) { state.k = -1; go(Number(o.move)); }
      },
    };
  }

  // =========================================================================
  // How the weak levels choose a move
  // =========================================================================
  var VARIETY = { 1: { name: 'Beginner', chance: 0.38, windowCp: 180, lines: 4 }, 2: { name: 'Novice', chance: 0.20, windowCp: 90, lines: 4 } };

  // Chance of each move under the old rule (any legal move) and the current one
  // (another of the top lines, no further below the best than the window).
  function policies(moves, level) {
    var v = VARIETY[level], n = moves.length, top = moves[0].cp;
    var alts = [];
    for (var i = 1; i < Math.min(v.lines, n); i++) if (moves[i].cp >= top - v.windowCp && Math.abs(moves[i].cp) < 10000) alts.push(i);
    return moves.map(function (m, i) {
      var old = (i === 0 ? 1 - v.chance : 0) + v.chance / n;
      var now = alts.length ? (i === 0 ? 1 - v.chance : alts.indexOf(i) >= 0 ? v.chance / alts.length : 0) : (i === 0 ? 1 : 0);
      return { old: old, now: now };
    });
  }
  function costOf(moves, i) { return Math.min(1000, moves[0].cp - moves[i].cp); }
  function stats(positions, level) {
    var s = { old: { loss: 0, big: 0 }, now: { loss: 0, big: 0 } };
    positions.forEach(function (p) {
      var pr = policies(p.moves, level);
      p.moves.forEach(function (m, i) {
        var c = costOf(p.moves, i);
        ['old', 'now'].forEach(function (k) {
          s[k].loss += pr[i][k] * c;
          if (c >= 300) s[k].big += pr[i][k];
        });
      });
    });
    ['old', 'now'].forEach(function (k) { s[k].loss /= positions.length; s[k].big /= positions.length; });
    return s;
  }

  function variety(fig, data) {
    var body = mount(fig);
    var all = [];
    data.games.forEach(function (g) {
      g.allMoves.forEach(function (p) { all.push({ g: g, ply: p.ply, moves: p.moves }); });
    });
    var state = { i: data.variety.start, level: '1', hover: null };
    var board = makeBoard('The position whose moves are scored');
    var W = 380, H = 150, P = { l: 30, r: 4, t: 10, b: 20 };
    var chart = svg('svg', { class: 'cols', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'What each legal move costs, best first' });
    var head = h('div', { class: 'move-head' });
    var rules = h('div', { class: 'rules-bars' });
    var note = h('p', { class: 'fig-note' });
    var table = h('table', { class: 'vstats' });
    var counter = h('span', { class: 'fig-num' });
    var slider = h('input', { type: 'range', min: '0', max: String(all.length - 1), step: '1', 'aria-label': 'Position' });
    slider.addEventListener('input', function () { state.i = Number(slider.value); state.hover = null; render(); });

    function hoverable(el, i) {
      el.addEventListener('pointerenter', function () { if (state.hover !== i) { state.hover = i; render(); } });
      el.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && state.hover === i) { state.hover = null; render(); } });
      el.addEventListener('click', function () { state.hover = state.hover === i ? null : i; render(); });
    }

    function render() {
      var p = all[state.i], moves = p.moves, n = moves.length;
      var v = VARIETY[state.level];
      var pr = policies(moves, state.level);
      var f = p.g.frames[p.ply];
      slider.value = String(state.i);
      counter.textContent = (state.i + 1) + ' / ' + all.length;
      drawFen(board, f.fen);
      markSquares(board, f.move ? [f.move.from, f.move.to] : []);
      clear(board.L.arrows);
      head.textContent = p.g.short + ', ' + (f.fen.split(' ')[1] === 'w' ? 'White' : 'Black') + ' to play' +
        (p.ply ? ' after ' + moveLabel(p.g, p.ply) : '') + ' · ' + n + ' legal moves';

      var wb = C.winPercentFromCp(moves[0].cp);
      var labels = moves.map(function (m, i) {
        return i === 0 ? 'best' : C.qualityForLoss(-costOf(moves, i), Math.max(0, wb - C.winPercentFromCp(m.cp)));
      });

      // What each move costs.
      clear(chart);
      var span = (W - P.l - P.r) / n, bw = Math.max(2, span * 0.72);
      var Y = function (cp) { return P.t + (H - P.t - P.b) * (1 - Math.min(1000, cp) / 1000); };
      [0, 500, 1000].forEach(function (cp) {
        svg('text', { x: P.l - 6, y: Y(cp) + 3.5, 'text-anchor': 'end' }, chart).textContent = cp === 1000 ? '10+' : String(cp / 100);
      });
      var inWindow = 0;
      for (var w = 1; w < Math.min(v.lines, n); w++) if (moves[w].cp >= moves[0].cp - v.windowCp && Math.abs(moves[w].cp) < 10000) inWindow = w;
      svg('rect', { class: 'win', x: P.l, y: P.t, width: span * Math.min(v.lines, n), height: H - P.t - P.b }, chart);
      svg('line', { class: 'win-edge', x1: P.l, x2: P.l + span * (inWindow + 1), y1: Y(v.windowCp), y2: Y(v.windowCp) }, chart);
      svg('line', { class: 'base', x1: P.l, x2: W - P.r, y1: Y(0), y2: Y(0) }, chart);
      moves.forEach(function (m, i) {
        var x = P.l + i * span + (span - bw) / 2, c = costOf(moves, i);
        svg('rect', { class: 'col-bar q-' + labels[i] + (state.hover === i ? ' hover' : ''), x: x, y: Math.min(Y(c), Y(0) - 1.5), width: bw, height: Math.max(1.5, Y(0) - Y(c)) }, chart);
        hoverable(svg('rect', { class: 'col-hit', x: P.l + i * span, y: P.t, width: span, height: H - P.t - P.b }, chart), i);
      });
      svg('text', { x: P.l, y: H - 5 }, chart).textContent = 'best';
      svg('text', { x: P.l + span * Math.min(v.lines, n) + 4, y: P.t + 10 }, chart).textContent = 'top ' + v.lines + ' lines';
      svg('text', { x: W - P.r, y: H - 5, 'text-anchor': 'end' }, chart).textContent = 'worst';

      // Where each rule's moves go, as one bar per rule.
      clear(rules);
      [['old', 'Any legal move (before)'], ['now', 'Top lines only (now)']].forEach(function (rule) {
        var bar = h('div', { class: 'rbar' });
        moves.forEach(function (m, i) {
          var share = pr[i][rule[0]];
          if (share <= 0) return;
          var seg = h('span', { class: 'q-' + labels[i] + (state.hover === i ? ' hover' : ''), style: 'width:' + (share * 100).toFixed(3) + '%' });
          if (share >= 0.12) seg.textContent = m.san + ' ' + Math.round(share * 100) + '%';
          hoverable(seg, i);
          bar.appendChild(seg);
        });
        var big = 0;
        moves.forEach(function (m, i) { if (costOf(moves, i) >= 300) big += pr[i][rule[0]]; });
        rules.appendChild(h('div', { class: 'rrow' }, [
          h('div', { class: 'rhead' }, [h('span', { text: rule[1] }), h('span', { class: 'rbig', text: (big * 100).toFixed(0) + '% lose 3+ pawns' })]),
          bar,
        ]));
      });

      if (state.hover !== null) {
        var mv = moves[state.hover];
        arrow(board, mv.uci, state.hover === 0 ? 'best' : 'alt');
        note.textContent = mv.san + ': ' + (state.hover === 0 ? 'Stockfish’s first choice' : 'costs ' + pawns(costOf(moves, state.hover)) + ' pawns, ' + LABELS[labels[state.hover]]) +
          '. Played ' + (pr[state.hover].old * 100).toFixed(1) + '% of the time before, ' + (pr[state.hover].now * 100).toFixed(1) + '% now.';
      } else {
        arrow(board, moves[0].uci, 'best');
        note.textContent = POINT + ' a column or a segment to see its move.';
      }

      var here = stats([p], state.level), every = stats(all, state.level);
      clear(table);
      table.appendChild(h('thead', {}, [h('tr', {}, [h('th', { text: v.name }), h('th', { class: 'r', text: 'Before' }), h('th', { class: 'r', text: 'Now' })])]));
      var tb = h('tbody');
      [
        ['Pawns lost per move, here', pawns(here.old.loss), pawns(here.now.loss)],
        ['Pawns lost per move, all ' + all.length + ' positions', pawns(every.old.loss), pawns(every.now.loss)],
        ['Moves losing 3+ pawns, all positions', (every.old.big * 100).toFixed(1) + '%', (every.now.big * 100).toFixed(1) + '%'],
      ].forEach(function (r) { tb.appendChild(h('tr', {}, [h('td', { text: r[0] }), h('td', { class: 'r', text: r[1] }), h('td', { class: 'r', text: r[2] })])); });
      table.appendChild(tb);
    }

    var levelTabs = tabs('Level', [['1', 'Beginner'], ['2', 'Novice']], state.level, function (v) { state.level = v; render(); });
    body.appendChild(h('div', { class: 'fig-controls' }, [levelTabs.el]));
    body.appendChild(h('div', { class: 'variety' }, [
      h('div', {}, [board.el, h('div', { class: 'transport', style: 'margin-top:12px' }, [
        iconButton('prev', 'Previous position', function () { state.i = Math.max(0, state.i - 1); state.hover = null; render(); }),
        slider,
        iconButton('next', 'Next position', function () { state.i = Math.min(all.length - 1, state.i + 1); state.hover = null; render(); }),
        counter,
      ])]),
      h('div', { class: 'vcol' }, [head, chart, rules, note, table]),
    ]));
    render();

    fig.wc = {
      set: function (o) {
        if (o.level) levelTabs.set(o.level);
        if (o.position !== undefined) { state.i = Number(o.position); state.hover = null; render(); }
      },
    };
  }

  // ---- Boot ------------------------------------------------------------------
  function boot() {
    if (!C) return;
    installPieces();
    var dev = document.getElementById('wc-device');
    if (dev) device(dev);
    var ids = ['wc-grade', 'wc-accuracy', 'wc-review', 'wc-variety'];
    var figs = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!figs.length) return;
    loadData(figs[0].getAttribute('data-src')).then(function (data) {
      var builders = { 'wc-grade': grade, 'wc-accuracy': accuracy, 'wc-review': review, 'wc-variety': variety };
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
    if (!fig || !fig.wc) return;
    e.preventDefault();
    fig.wc.set(Object.assign({}, a.dataset));
    var r = fig.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      fig.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
