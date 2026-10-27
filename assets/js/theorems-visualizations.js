// Interactive figures for "Drawing 6,684 ideas in one dependency graph".
//
// Powered by:
//   - /assets/js/theorems-visualizations-core.js (window.TheoremsVizCore: the
//     atlas's own core.js, math.js, 17 domain kits, and 50 live viz(v) items)
//   - /assets/data/theorems-visualizations-demo.json (all 6,684 nodes, 11,541
//     edges, 85 collections, 13 fields, 8 bridges, 450 papers, and audit data)
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ATLAS_BASE = 'https://sir-teo.github.io/theorems-visualizations/';

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs || {}) {
      if (attrs[k] === undefined || attrs[k] === null) continue;
      n.setAttribute(k, attrs[k]);
    }
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
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c !== null && c !== undefined) {
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    });
    return n;
  }

  function clear(n) {
    while (n && n.firstChild) n.removeChild(n.firstChild);
  }

  function mountFig(fig) {
    var body = h('div', { class: 'fig-body' });
    fig.insertBefore(body, fig.querySelector('figcaption'));
    fig.classList.add('ready');
    return body;
  }

  function tabs(label, options, value, onChange) {
    var wrap = h('div', { class: 'tabs', role: 'group', 'aria-label': label });
    var buttons = options.map(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': String(o[0] === value), text: o[1] });
      b.addEventListener('click', function () { select(o[0]); });
      wrap.appendChild(b);
      return b;
    });
    function select(v, silent) {
      buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', String(options[i][0] === v)); });
      if (!silent) onChange(v);
    }
    return { el: wrap, set: select };
  }

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  // Load KaTeX in parallel so live canvas overlays and statements render crisp TeX
  var katexCallbacks = [];
  function ensureKatex(cb) {
    if (window.katex) {
      if (cb) cb();
      return;
    }
    if (cb) katexCallbacks.push(cb);
    if (document.getElementById('tv-katex-script')) return;
    var s = document.createElement('script');
    s.id = 'tv-katex-script';
    s.src = new URL('../vendor/katex/katex.min.js', document.querySelector('script[src*="theorems-visualizations.js"]').src).href;
    s.defer = true;
    s.onload = function () {
      var list = katexCallbacks.splice(0);
      list.forEach(function (fn) { try { fn(); } catch (e) {} });
    };
    document.head.appendChild(s);
  }
  ensureKatex();

  function rich(str) {
    if (window.TheoremsVizCore && window.TheoremsVizCore.richHTML) {
      return window.TheoremsVizCore.richHTML(str || '');
    }
    return '<p>' + String(str || '') + '</p>';
  }

  // Theme change bridge for TheoremsVizCore + custom figures
  var themeListeners = [];
  document.addEventListener('themechange', function () {
    if (window.TheoremsVizCore && window.TheoremsVizCore.resetColors) {
      window.TheoremsVizCore.resetColors();
    }
    window.dispatchEvent(new Event('themechange'));
    themeListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  });

  // Shared cross-figure hooks (so Figure 2 can send an item to Figure 3)
  var workbenchApi = null;
  var mapApi = null;
  var bridgesApi = null;
  var auditApi = null;

  // =========================================================================
  // Figure 2: 6,684-Idea Dependency Atlas (#tv-map)
  // =========================================================================
  function initMap(fig, data) {
    var body = mountFig(fig);
    var nodes = data.nodes; // [num, colIdx, x, y, depth, anc, desc, depsIdx[], name, yr, kindIdx]
    var cols = data.collections;
    var fields = data.fields;
    var N = nodes.length;

    // Stretch horizontal world coordinates by 1.62 so the 13 field boxes fill the widescreen 760x440 canvas
    var ASPECT_X = 1.62;
    var nodeX = new Float32Array(N);
    var nodeY = new Float32Array(N);

    // Build full ID strings and forward/backward adjacency lists
    var idOf = new Array(N);
    var indexById = Object.create(null);
    var children = Array.from({ length: N }, function () { return []; });
    var fieldIdxOfNode = new Uint8Array(N);

    for (var i = 0; i < N; i++) {
      var col = cols[nodes[i][1]];
      var fullId = col.id + '-' + nodes[i][0];
      idOf[i] = fullId;
      indexById[fullId] = i;
      fieldIdxOfNode[i] = col.fieldIdx;
      nodeX[i] = nodes[i][2] * ASPECT_X;
      nodeY[i] = nodes[i][3];
    }
    for (var j = 0; j < N; j++) {
      var deps = nodes[j][7];
      for (var k = 0; k < deps.length; k++) {
        children[deps[k]].push(j);
      }
    }

    // Fast transitive closure BFS for any selected node + direct neighbor mask
    function traceCone(startIdx) {
      var ancSet = new Uint8Array(N);
      var descSet = new Uint8Array(N);
      var directSet = new Uint8Array(N);
      var startDeps = nodes[startIdx][7];
      for (var s = 0; s < startDeps.length; s++) directSet[startDeps[s]] = 1;
      var startCh = children[startIdx];
      for (var sc = 0; sc < startCh.length; sc++) directSet[startCh[sc]] = 2;

      var q = [startIdx];
      while (q.length) {
        var cur = q.pop();
        var ds = nodes[cur][7];
        for (var i = 0; i < ds.length; i++) {
          var d = ds[i];
          if (!ancSet[d]) {
            ancSet[d] = 1;
            q.push(d);
          }
        }
      }
      q = [startIdx];
      while (q.length) {
        var c = q.pop();
        var ch = children[c];
        for (var m = 0; m < ch.length; m++) {
          var nxt = ch[m];
          if (!descSet[nxt]) {
            descSet[nxt] = 1;
            q.push(nxt);
          }
        }
      }
      return { anc: ancSet, desc: descSet, direct: directSet };
    }

    var viewMode = 'atlas';
    var selectedIdx = indexById['pma-4.19'] !== undefined ? indexById['pma-4.19'] : 0;
    var hoveredIdx = -1;
    var cone = traceCone(selectedIdx);

    var modeTabs = tabs('Graph view', [
      ['atlas', 'Dependency atlas (6,684)'],
      ['flows', 'Cross-field flows (1,989)'],
      ['chain', '77-step depth skyline'],
    ], viewMode, function (v) {
      viewMode = v;
      renderViewMode();
    });

    var summaryEl = h('span', {
      class: 'fig-num',
      text: '11,541 edges · 85 collections · 13 fields',
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      modeTabs.el,
      h('span', { class: 'grow' }),
      summaryEl,
    ]));

    var atlasPane = h('div');
    var flowsPane = h('div', { style: 'display:none' });
    var chainPane = h('div', { style: 'display:none' });
    body.appendChild(atlasPane);
    body.appendChild(flowsPane);
    body.appendChild(chainPane);

    // ---- Pane 1: Interactive Atlas Canvas + 3-column Lineage ----
    var WORKHORSES = [
      ['pma-1.5', 'pma-1.5 Order'],
      ['pma-4.19', 'pma-4.19 Compact'],
      ['ladr-7.29', 'ladr-7.29 Spectral'],
      ['rca-9.13', 'rca-9.13 Plancherel'],
      ['mech-5.4', 'mech-5.4 Action'],
      ['cplx-13.9', 'cplx-13.9 Grover'],
    ];

    var presetButtons = [];
    var presetsRow = h('div', { class: 'tv-presets' });
    WORKHORSES.forEach(function (pair) {
      var idx = indexById[pair[0]];
      if (idx === undefined) return;
      var fColor = fields[fieldIdxOfNode[idx]].color[0];
      var btn = h('button', {
        type: 'button',
        class: 'tv-pill',
        'aria-pressed': String(idx === selectedIdx),
        onclick: function () { selectNode(idx, false); },
      }, [
        h('span', { class: 'tv-dot', style: '--c:' + fColor }),
        pair[1],
      ]);
      presetButtons.push({ id: pair[0], idx: idx, el: btn });
      presetsRow.appendChild(btn);
    });

    var searchInput = h('input', {
      type: 'search',
      class: 'tv-search',
      placeholder: 'Find idea…',
      'aria-label': 'Find idea in dependency graph',
    });
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      if (q.length < 2) return;
      for (var i = 0; i < N; i++) {
        if (idOf[i].toLowerCase() === q || nodes[i][8].toLowerCase().indexOf(q) !== -1) {
          selectNode(i, false);
          break;
        }
      }
    });
    presetsRow.appendChild(h('span', { style: 'flex:1' }));
    presetsRow.appendChild(searchInput);
    atlasPane.appendChild(presetsRow);

    var mapCanvas = h('canvas', { class: 'tv-map-canvas' });
    var hudBadge = h('div', { class: 'tv-map-badge' });
    var zoomInBtn = h('button', { type: 'button', class: 'btn', text: '+', title: 'Zoom in', onclick: function () { zoomBy(1.35); } });
    var zoomOutBtn = h('button', { type: 'button', class: 'btn', text: '−', title: 'Zoom out', onclick: function () { zoomBy(1 / 1.35); } });
    var fitConeBtn = h('button', { type: 'button', class: 'btn', text: 'Fit cone', onclick: function () { fitToCone(); } });
    var resetBtn = h('button', { type: 'button', class: 'btn', text: 'Full atlas', onclick: function () { fitFullAtlas(); } });

    var legendEl = h('div', { class: 'tv-map-legend' }, [
      h('span', {}, [h('span', { class: 'tv-dot', style: '--c:#d97706' }), 'Prerequisites (ancestors)']),
      h('span', {}, [h('span', { class: 'tv-dot', style: '--c:#2563eb' }), 'Downstream reach (descendants)']),
      h('span', { style: 'color:var(--fg-3)' }, ['Drag to pan · scroll to zoom · click any node']),
    ]);

    var canvasWrap = h('div', { class: 'tv-canvas-wrap' }, [
      mapCanvas,
      h('div', { class: 'tv-map-hud' }, [
        hudBadge,
        h('div', { class: 'tv-map-tools' }, [zoomInBtn, zoomOutBtn, fitConeBtn, resetBtn]),
      ]),
      legendEl,
    ]);
    atlasPane.appendChild(canvasWrap);

    var linContainer = h('div', { class: 'tv-lineage' });
    atlasPane.appendChild(linContainer);

    // Compute widescreen atlas world bounds from field boxes
    var worldX0 = Infinity, worldY0 = Infinity, worldX1 = -Infinity, worldY1 = -Infinity;
    data.map.fields.forEach(function (fb) {
      var x0 = fb.x0 * ASPECT_X, x1 = fb.x1 * ASPECT_X;
      if (x0 < worldX0) worldX0 = x0;
      if (fb.y0 < worldY0) worldY0 = fb.y0;
      if (x1 > worldX1) worldX1 = x1;
      if (fb.y1 > worldY1) worldY1 = fb.y1;
    });
    var cam = { x: (worldX0 + worldX1) / 2, y: (worldY0 + worldY1) / 2, k: 0.052 };

    function fitFullAtlas() {
      var W = mapCanvas.clientWidth || 760;
      var H = mapCanvas.clientHeight || 440;
      var padX = 16, padTop = 52, padBottom = 34;
      var kx = (W - 2 * padX) / (worldX1 - worldX0);
      var ky = (H - padTop - padBottom) / (worldY1 - worldY0);
      cam.k = Math.min(kx, ky);
      cam.x = (worldX0 + worldX1) / 2;
      cam.y = (worldY0 + worldY1) / 2 - ((padTop - padBottom) / 2) / cam.k;
      drawAtlas();
    }

    function fitToCone() {
      var minX = nodeX[selectedIdx], maxX = minX;
      var minY = nodeY[selectedIdx], maxY = minY;
      for (var i = 0; i < N; i++) {
        if (cone.anc[i] || cone.desc[i]) {
          var nx = nodeX[i], ny = nodeY[i];
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
      }
      var W = mapCanvas.clientWidth || 760;
      var H = mapCanvas.clientHeight || 440;
      var padX = 24, padTop = 54, padBottom = 36;
      var spanX = Math.max(1400, maxX - minX + 700);
      var spanY = Math.max(650, maxY - minY + 420);
      cam.k = Math.min((W - 2 * padX) / spanX, (H - padTop - padBottom) / spanY);
      cam.x = (minX + maxX) / 2;
      cam.y = (minY + maxY) / 2 - ((padTop - padBottom) / 2) / cam.k;
      drawAtlas();
    }

    function zoomBy(factor, cx, cy) {
      var W = mapCanvas.clientWidth || 760;
      var H = mapCanvas.clientHeight || 440;
      if (cx === undefined) cx = W / 2;
      if (cy === undefined) cy = H / 2;
      var wx = cam.x + (cx - W / 2) / cam.k;
      var wy = cam.y + (cy - H / 2) / cam.k;
      cam.k = Math.max(0.032, Math.min(1.6, cam.k * factor));
      cam.x = wx - (cx - W / 2) / cam.k;
      cam.y = wy - (cy - H / 2) / cam.k;
      drawAtlas();
    }

    function drawAtlas() {
      var W = mapCanvas.clientWidth || 760;
      var H = mapCanvas.clientHeight || 440;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      if (mapCanvas.width !== Math.round(W * dpr) || mapCanvas.height !== Math.round(H * dpr)) {
        mapCanvas.width = Math.round(W * dpr);
        mapCanvas.height = Math.round(H * dpr);
      }
      var ctx = mapCanvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);
      var dark = isDark();
      ctx.fillStyle = dark ? '#121216' : '#fafaf8';
      ctx.fillRect(0, 0, W, H);

      var k = cam.k;
      var ox = W / 2 - cam.x * k;
      var oy = H / 2 - cam.y * k;

      var fColors = fields.map(function (f) { return f.color[dark ? 1 : 0]; });

      // 1. Field region boxes, shelf hairlines & non-colliding top headers
      ctx.lineWidth = 1;
      data.map.fields.forEach(function (fb) {
        var fObj = fields.find(function (f) { return f.id === fb.field; });
        var col = fObj ? fObj.color[dark ? 1 : 0] : '#888';
        var x0 = fb.x0 * ASPECT_X * k + ox, y0 = fb.y0 * k + oy;
        var bw = (fb.x1 - fb.x0) * ASPECT_X * k, bh = (fb.y1 - fb.y0) * k;
        if (x0 + bw < 0 || x0 > W || y0 + bh < 0 || y0 > H) return;

        ctx.beginPath();
        ctx.roundRect(x0, y0, bw, bh, 5);
        ctx.fillStyle = col;
        ctx.globalAlpha = dark ? 0.055 : 0.042;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.globalAlpha = dark ? 0.30 : 0.24;
        ctx.stroke();
        ctx.globalAlpha = 1;

        var fontPx = Math.max(8.5, Math.min(11.5, 9.5 * Math.pow(k / 0.05, 0.25)));
        ctx.font = '700 ' + fontPx.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
        var fullTitle = fb.title.toUpperCase();
        var shortTitle = fObj ? fObj.short.toUpperCase() : fullTitle;
        var label = ctx.measureText(fullTitle).width <= bw - 4 ? fullTitle : shortTitle;
        if (ctx.measureText(label).width <= bw + 14) {
          ctx.fillStyle = col;
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, x0 + 3, y0 - 3);
        }
      });
      ctx.textBaseline = 'alphabetic';

      // Horizontal collection shelf lines inside field boxes
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
      ctx.lineWidth = 0.75;
      data.map.rows.forEach(function (r) {
        var rx0 = r.x * ASPECT_X * k + ox, rx1 = r.x1 * ASPECT_X * k + ox, ry = r.y * k + oy;
        if (rx1 < 0 || rx0 > W || ry < 0 || ry > H) return;
        ctx.beginPath();
        ctx.moveTo(rx0, ry);
        ctx.lineTo(rx1, ry);
        ctx.stroke();
      });

      // Shelf row labels when zoomed in
      if (k > 0.085) {
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.45)';
        ctx.font = '500 9.5px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
        data.map.rows.forEach(function (r) {
          var rx = r.x * ASPECT_X * k + ox, ry = r.y * k + oy;
          if (rx > W || rx + (r.x1 - r.x) * ASPECT_X * k < 0 || ry < 0 || ry > H) return;
          ctx.fillText(r.label, rx + 3, ry - 3);
        });
      }

      var focusIdx = hoveredIdx >= 0 ? hoveredIdx : selectedIdx;
      var activeCone = focusIdx === selectedIdx ? cone : traceCone(focusIdx);

      // 3a. Transitive cone edges (subtle background glow so 1,400-node cones never form an opaque blob)
      ctx.lineWidth = Math.max(0.65, Math.min(1.2, k * 8));
      for (var i = 0; i < N; i++) {
        var inAnc = activeCone.anc[i];
        var inDesc = activeCone.desc[i];
        if (!inAnc && !inDesc) continue;
        var x2 = nodeX[i] * k + ox;
        var y2 = nodeY[i] * k + oy;
        var ds = nodes[i][7];
        for (var dIdx = 0; dIdx < ds.length; dIdx++) {
          var u = ds[dIdx];
          if (i === focusIdx || u === focusIdx) continue;
          var edgeIsAnc = inAnc && activeCone.anc[u];
          var edgeIsDesc = inDesc && activeCone.desc[u];
          if (!edgeIsAnc && !edgeIsDesc) continue;
          var x1 = nodeX[u] * k + ox;
          var y1 = nodeY[u] * k + oy;
          ctx.strokeStyle = edgeIsAnc
            ? (dark ? 'rgba(251, 191, 36, 0.28)' : 'rgba(217, 119, 6, 0.24)')
            : (dark ? 'rgba(96, 165, 250, 0.11)' : 'rgba(37, 99, 235, 0.085)');
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          var mx = (x1 + x2) / 2;
          ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
          ctx.stroke();
        }
      }

      // 3b. Direct prerequisite & dependent edges incident to focusIdx (crisp foreground curves)
      ctx.lineWidth = 1.75;
      var fDeps = nodes[focusIdx][7];
      var fx = nodeX[focusIdx] * k + ox;
      var fy = nodeY[focusIdx] * k + oy;
      ctx.strokeStyle = dark ? 'rgba(251, 191, 36, 0.92)' : 'rgba(217, 119, 6, 0.88)';
      for (var fd = 0; fd < fDeps.length; fd++) {
        var pIdx = fDeps[fd];
        var px1 = nodeX[pIdx] * k + ox, py1 = nodeY[pIdx] * k + oy;
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        var pmx = (px1 + fx) / 2;
        ctx.bezierCurveTo(pmx, py1, pmx, fy, fx, fy);
        ctx.stroke();
      }
      var fChildren = children[focusIdx];
      ctx.strokeStyle = dark ? 'rgba(96, 165, 250, 0.82)' : 'rgba(37, 99, 235, 0.76)';
      for (var fc = 0; fc < fChildren.length; fc++) {
        var cIdx = fChildren[fc];
        var cx2 = nodeX[cIdx] * k + ox, cy2 = nodeY[cIdx] * k + oy;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        var cmx = (fx + cx2) / 2;
        ctx.bezierCurveTo(cmx, fy, cmx, cy2, cx2, cy2);
        ctx.stroke();
      }

      // 4. Nodes (background dimmed nodes first, then cone nodes, then direct neighbors & focus node)
      var rBase = Math.max(1.45, Math.min(4.2, Math.sqrt(k) * 6.5));
      ctx.globalAlpha = dark ? 0.28 : 0.25;
      for (var n = 0; n < N; n++) {
        if (activeCone.anc[n] || activeCone.desc[n] || n === focusIdx) continue;
        var px = nodeX[n] * k + ox;
        var py = nodeY[n] * k + oy;
        if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
        ctx.fillStyle = fColors[fieldIdxOfNode[n]];
        ctx.fillRect(px - rBase * 0.72, py - rBase * 0.72, rBase * 1.44, rBase * 1.44);
      }

      ctx.globalAlpha = 0.92;
      for (var c = 0; c < N; c++) {
        var isAnc = activeCone.anc[c];
        var isDesc = activeCone.desc[c];
        if (!isAnc && !isDesc && c !== focusIdx) continue;
        var cx = nodeX[c] * k + ox;
        var cy = nodeY[c] * k + oy;
        if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) continue;
        var isDir = activeCone.direct[c] > 0;
        var rad = c === focusIdx
          ? Math.max(5.5, rBase * 2.5)
          : isDir
            ? Math.max(3.2, rBase * 1.65)
            : Math.max(2.0, rBase * 1.18);
        if (c === focusIdx) {
          ctx.beginPath();
          ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
          ctx.fillStyle = fColors[fieldIdxOfNode[c]];
          ctx.globalAlpha = 0.28;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = c === focusIdx
          ? (dark ? '#ffffff' : '#111111')
          : isAnc
            ? (dark ? '#fbbf24' : '#d97706')
            : fColors[fieldIdxOfNode[c]];
        ctx.fill();
        if (c === focusIdx || isDir) {
          ctx.lineWidth = c === focusIdx ? 2.2 : 1.2;
          ctx.strokeStyle = c === focusIdx
            ? fColors[fieldIdxOfNode[c]]
            : (dark ? '#121216' : '#ffffff');
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // 5. Callout pill on the focused node (auto-flips below if near top HUD)
      var labelStr = idOf[focusIdx] + ' · ' + nodes[focusIdx][8];
      if (labelStr.length > 48) labelStr = labelStr.slice(0, 46) + '…';
      ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      var tw = ctx.measureText(labelStr).width + 16;
      var lx = Math.max(10, Math.min(W - tw - 10, fx - tw / 2));
      var ly = fy > 88 ? fy - 29 : fy + 10;
      ctx.fillStyle = dark ? 'rgba(20, 20, 25, 0.94)' : 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = fColors[fieldIdxOfNode[focusIdx]];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, 21, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark ? '#ececef' : '#111111';
      ctx.fillText(labelStr, lx + 8, ly + 14.5);

      ctx.restore();

      var nd = nodes[focusIdx];
      var colMeta = cols[nd[1]];
      hudBadge.innerHTML =
        '<b>' + idOf[focusIdx] + '</b> · depth <b>' + nd[4] +
        '</b> · <span style="color:' + (dark ? '#fbbf24' : '#b45309') + '"><b>' + nd[5] +
        '</b> ancestors</span> · <span style="color:' + fColors[colMeta.fieldIdx] + '"><b>' +
        nd[6].toLocaleString() + '</b> descendants</span>';
    }

    function renderLineage() {
      clear(linContainer);
      var nd = nodes[selectedIdx];
      var colMeta = cols[nd[1]];
      var fieldMeta = fields[colMeta.fieldIdx];
      var fCol = fieldMeta.color[isDark() ? 1 : 0];
      var kindName = data.kinds[nd[10]] ? data.kinds[nd[10]][0] : 'Theorem';

      // Direct prerequisites (sorted by ancestor depth)
      var directDeps = nd[7].slice().sort(function (a, b) { return nodes[b][4] - nodes[a][4]; });
      var directChildren = children[selectedIdx].slice().sort(function (a, b) { return nodes[b][6] - nodes[a][6]; });

      function makeNodeBtn(idx) {
        var c = cols[nodes[idx][1]];
        var fc = fields[c.fieldIdx].color[isDark() ? 1 : 0];
        return h('button', {
          type: 'button',
          class: 'tv-lin-node',
          onclick: function () { selectNode(idx, false); },
        }, [
          h('span', { class: 'tv-dot', style: '--c:' + fc }),
          h('code', { text: idOf[idx] }),
          h('span', { text: nodes[idx][8] }),
        ]);
      }

      var leftList = h('div', { class: 'tv-lin-list' });
      if (!directDeps.length) {
        leftList.appendChild(h('div', { style: 'font-size:12px;color:var(--fg-3);padding:4px 0', text: 'Root axiom / definition (depth 0 — no prerequisites)' }));
      } else {
        directDeps.slice(0, 5).forEach(function (d) { leftList.appendChild(makeNodeBtn(d)); });
      }

      var rightList = h('div', { class: 'tv-lin-list' });
      if (!directChildren.length) {
        rightList.appendChild(h('div', { style: 'font-size:12px;color:var(--fg-3);padding:4px 0', text: 'Frontier node (0 direct dependents in written graph)' }));
      } else {
        directChildren.slice(0, 5).forEach(function (chIdx) { rightList.appendChild(makeNodeBtn(chIdx)); });
      }

      var idStr = idOf[selectedIdx];
      var actions = h('div', { class: 'tv-lin-actions' }, [
        h('a', {
          class: 'btn',
          href: ATLAS_BASE + '#/t/' + idStr,
          target: '_blank',
          rel: 'noopener',
          text: 'Open in atlas ↗',
        }),
      ]);
      if (data.itemsDetail[idStr]) {
        actions.insertBefore(h('button', {
          type: 'button',
          class: 'btn',
          onclick: function () {
            if (workbenchApi) {
              workbenchApi.loadItem(idStr);
              document.getElementById('tv-workbench').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          },
          text: 'Run live simulation ↓',
        }), actions.firstChild);
      }

      var centerCol = h('div', { class: 'tv-lin-center', style: '--fc:' + fCol }, [
        h('div', {}, [
          h('div', { class: 'tv-lin-eyebrow' }, [
            h('span', { class: 'tv-wb-badge', text: kindName + ' ' + idStr }),
            h('span', { text: colMeta.title }),
          ]),
          h('div', { class: 'tv-lin-title', text: nd[8] }),
          h('div', { class: 'tv-lin-stats' }, [
            h('div', { class: 'tv-lin-stat', html: '<b>' + nd[4] + '</b>Logical depth' }),
            h('div', { class: 'tv-lin-stat', html: '<b>' + nd[5].toLocaleString() + '</b>Prerequisites' }),
            h('div', { class: 'tv-lin-stat', html: '<b>' + nd[6].toLocaleString() + '</b>Descendants' }),
          ]),
        ]),
        actions,
      ]);

      linContainer.appendChild(h('div', { class: 'tv-lin-col' }, [
        h('div', { class: 'tv-lin-hdr', text: 'Direct prerequisites (' + directDeps.length + ')' }),
        leftList,
      ]));
      linContainer.appendChild(centerCol);
      linContainer.appendChild(h('div', { class: 'tv-lin-col' }, [
        h('div', { class: 'tv-lin-hdr', text: 'Direct dependents (' + directChildren.length + ')' }),
        rightList,
      ]));
    }

    function selectNode(idx, fit) {
      selectedIdx = idx;
      cone = traceCone(idx);
      presetButtons.forEach(function (b) {
        b.el.setAttribute('aria-pressed', String(b.idx === idx));
      });
      renderLineage();
      if (fit) fitToCone();
      else drawAtlas();
    }

    // Pointer interaction on mapCanvas
    var dragging = false, dragStartX = 0, dragStartY = 0, camStartX = 0, camStartY = 0, moved = false;

    function hitNode(clientX, clientY) {
      var rect = mapCanvas.getBoundingClientRect();
      var mx = clientX - rect.left, my = clientY - rect.top;
      var W = mapCanvas.clientWidth || 760, H = mapCanvas.clientHeight || 440;
      var wx = cam.x + (mx - W / 2) / cam.k;
      var wy = cam.y + (my - H / 2) / cam.k;
      var maxDist = 14 / cam.k;
      var best = -1, bestD2 = maxDist * maxDist;
      for (var i = 0; i < N; i++) {
        var dx = nodeX[i] - wx, dy = nodeY[i] - wy;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      return best;
    }

    mapCanvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      moved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      camStartX = cam.x;
      camStartY = cam.y;
      mapCanvas.setPointerCapture(e.pointerId);
    });
    mapCanvas.addEventListener('pointermove', function (e) {
      if (dragging) {
        var dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        if (Math.hypot(dx, dy) > 4) moved = true;
        cam.x = camStartX - dx / cam.k;
        cam.y = camStartY - dy / cam.k;
        drawAtlas();
      } else {
        var hit = hitNode(e.clientX, e.clientY);
        if (hit !== hoveredIdx) {
          hoveredIdx = hit;
          mapCanvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
          drawAtlas();
        }
      }
    });
    mapCanvas.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        var hit = hitNode(e.clientX, e.clientY);
        if (hit >= 0) selectNode(hit, false);
      }
    });
    mapCanvas.addEventListener('pointerleave', function () {
      if (hoveredIdx !== -1) {
        hoveredIdx = -1;
        drawAtlas();
      }
    });
    mapCanvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = mapCanvas.getBoundingClientRect();
      var factor = Math.exp(-e.deltaY * 0.0018);
      zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // ---- Pane 2: Cross-Field Flows (1,989 links) ----
    var activeFlowField = 'math';
    var activeFlowIdx = 0;

    function renderFlowsPane() {
      clear(flowsPane);
      var dark = isDark();
      var flows = data.crossFieldFlows;

      var fFilterRow = h('div', { class: 'tv-field-bar' }, [
        h('button', {
          type: 'button',
          class: 'tv-field-btn',
          'aria-pressed': String(activeFlowField === 'all'),
          onclick: function () { activeFlowField = 'all'; activeFlowIdx = 0; renderFlowsPane(); },
          text: 'All',
        }),
      ]);
      fields.forEach(function (f) {
        fFilterRow.appendChild(h('button', {
          type: 'button',
          class: 'tv-field-btn',
          'aria-pressed': String(activeFlowField === f.id),
          onclick: function () { activeFlowField = f.id; activeFlowIdx = 0; renderFlowsPane(); },
        }, [
          h('span', { class: 'tv-dot', style: '--c:' + f.color[dark ? 1 : 0] }),
          f.short,
        ]));
      });
      flowsPane.appendChild(fFilterRow);

      // Chord SVG on the left
      var chordSvg = svg('svg', {
        class: 'tv-chord-svg',
        viewBox: '0 0 380 380',
        role: 'img',
        'aria-label': 'Cross-field dependency chord diagram across 13 fields',
      });
      var cx = 190, cy = 190, R = 136, rInner = 124;

      // Field weights for arc angles
      var weights = fields.map(function (f) {
        var w = 0;
        flows.forEach(function (fl) {
          if (fl.from === f.id || fl.to === f.id) w += fl.total;
        });
        return Math.max(40, w);
      });
      var totalW = weights.reduce(function (a, b) { return a + b; }, 0);
      var gapRad = 0.032;
      var availRad = Math.PI * 2 - fields.length * gapRad;
      var acc = -Math.PI / 2;
      var fieldArcs = {};

      fields.forEach(function (f, i) {
        var span = (weights[i] / totalW) * availRad;
        var a0 = acc, a1 = acc + span, am = (a0 + a1) / 2;
        acc = a1 + gapRad;
        fieldArcs[f.id] = { a0: a0, a1: a1, am: am, color: f.color[dark ? 1 : 0], short: f.short };

        var x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
        var x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        var large = span > Math.PI ? 1 : 0;
        var isActive = activeFlowField === 'all' || activeFlowField === f.id;
        var arcPath = svg('path', {
          d: 'M ' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1),
          fill: 'none',
          stroke: f.color[dark ? 1 : 0],
          'stroke-width': isActive ? 10 : 6,
          'stroke-linecap': 'round',
          opacity: isActive ? 1 : 0.35,
          style: 'cursor:pointer',
        }, chordSvg);
        arcPath.addEventListener('click', function () {
          activeFlowField = activeFlowField === f.id ? 'all' : f.id;
          activeFlowIdx = 0;
          renderFlowsPane();
        });

        var lx = cx + (R + 24) * Math.cos(am);
        var ly = cy + (R + 24) * Math.sin(am);
        svg('text', {
          x: lx.toFixed(1),
          y: ly.toFixed(1),
          fill: isActive ? (dark ? '#ececef' : '#111111') : (dark ? '#6f6f72' : '#8a8a8a'),
          'font-size': '10.5',
          'font-weight': isActive ? '600' : '500',
          'text-anchor': Math.cos(am) > 0.2 ? 'start' : Math.cos(am) < -0.2 ? 'end' : 'middle',
          'dominant-baseline': 'central',
          style: 'cursor:pointer',
        }, chordSvg).textContent = f.short;
      });

      // Chords between fields
      var activeLinkSum = 0;
      flows.forEach(function (fl) {
        var A = fieldArcs[fl.from], B = fieldArcs[fl.to];
        if (!A || !B) return;
        var match = activeFlowField === 'all' || fl.from === activeFlowField || fl.to === activeFlowField;
        if (match) activeLinkSum += fl.total;
        var x1 = cx + rInner * Math.cos(A.am), y1 = cy + rInner * Math.sin(A.am);
        var x2 = cx + rInner * Math.cos(B.am), y2 = cy + rInner * Math.sin(B.am);
        svg('path', {
          d: 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q ' + cx + ' ' + cy + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1),
          fill: 'none',
          stroke: A.color,
          'stroke-width': Math.max(1, Math.min(9, fl.total / 26)),
          opacity: match ? 0.58 : 0.06,
          'stroke-linecap': 'round',
        }, chordSvg);
      });

      //Filtered flow bars on the right
      var matchingFlows = flows.filter(function (fl) {
        return activeFlowField === 'all' || fl.from === activeFlowField || fl.to === activeFlowField;
      }).slice(0, 10);

      var maxTotal = Math.max.apply(null, matchingFlows.map(function (f) { return f.total; }).concat([1]));
      var barsCol = h('div', { class: 'tv-flow-bars' });

      matchingFlows.forEach(function (fl, idx) {
        var fromF = fields.find(function (f) { return f.id === fl.from; });
        var toF = fields.find(function (f) { return f.id === fl.to; });
        var cFrom = fromF.color[dark ? 1 : 0];
        var cTo = toF.color[dark ? 1 : 0];
        var row = h('div', {
          class: 'tv-flow-row' + (idx === activeFlowIdx ? ' active' : ''),
          onclick: function () { activeFlowIdx = idx; renderFlowsPane(); },
        }, [
          h('span', {
            html: '<b style="color:' + cFrom + '">' + fromF.short + '</b> → <b style="color:' + cTo + '">' + toF.short + '</b>',
          }),
          h('div', { class: 'tv-flow-track' }, [
            h('div', {
              class: 'tv-flow-fill',
              style: 'width:' + ((fl.total / maxTotal) * 100).toFixed(1) + '%;background:' + cFrom,
            }),
          ]),
          h('span', {
            style: 'text-align:right;font-variant-numeric:tabular-nums;color:var(--fg-2)',
            text: String(fl.total),
          }),
        ]);
        barsCol.appendChild(row);
      });

      var selFlow = matchingFlows[activeFlowIdx] || matchingFlows[0];
      if (selFlow && selFlow.examples && selFlow.examples.length) {
        var exBox = h('div', { class: 'tv-flow-ex' }, [
          h('div', {
            style: 'font-weight:600;color:var(--fg);margin-bottom:6px',
            text: 'Sample cross-field dependencies (' + selFlow.written + ' written / ' + selFlow.total + ' syllabus links):',
          }),
        ]);
        selFlow.examples.forEach(function (ex) {
          var btn = h('button', {
            type: 'button',
            class: 'tv-lin-node',
            style: 'width:100%;margin-bottom:4px',
            onclick: function () {
              var targetIdx = indexById[ex[2]] !== undefined ? indexById[ex[2]] : indexById[ex[0]];
              if (targetIdx !== undefined) {
                modeTabs.set('atlas');
                selectNode(targetIdx, false);
              }
            },
          }, [
            h('code', { text: ex[0] + ' → ' + ex[2] }),
            h('span', { text: ex[1] + ' → ' + ex[3] }),
          ]);
          exBox.appendChild(btn);
        });
        barsCol.appendChild(exBox);
      }

      flowsPane.appendChild(h('div', { class: 'tv-flows-grid' }, [chordSvg, barsCol]));
    }

    // ---- Pane 3: 77-Step Depth Skyline & Longest Chain ----
    var activeChainPos = 76; // Default to Grover's algorithm at depth 76

    function renderChainPane() {
      clear(chainPane);
      var dark = isDark();
      var chain = data.longestChain; // 77 node indices
      var maxD = data.totals.maxDepth; // 76

      // Stacked depth skyline SVG
      var skySvg = svg('svg', {
        class: 'tv-skyline-svg',
        viewBox: '0 0 760 210',
        role: 'img',
        'aria-label': 'Distribution of all 6,684 ideas by logical depth from 0 to 76',
      });

      var padL = 40, padR = 16, padT = 22, padB = 26;
      var plotW = 760 - padL - padR, plotH = 210 - padT - padB;
      var colTotals = new Array(maxD + 1).fill(0);
      var peakDepth = 0, peakCount = 0;
      for (var d = 0; d <= maxD; d++) {
        for (var f = 0; f < fields.length; f++) colTotals[d] += data.depthByField[f][d];
        if (colTotals[d] > peakCount) {
          peakCount = colTotals[d];
          peakDepth = d;
        }
      }
      var maxCount = Math.max.apply(null, colTotals);
      var barW = plotW / (maxD + 1);

      // Horizontal grid lines
      [0, 100, 200, 300].forEach(function (yVal) {
        if (yVal > maxCount) return;
        var y = padT + plotH - (yVal / maxCount) * plotH;
        svg('line', { x1: padL, y1: y, x2: 760 - padR, y2: y, stroke: dark ? '#26262c' : '#ececea', 'stroke-width': 1 }, skySvg);
        svg('text', { x: padL - 6, y: y, fill: dark ? '#71717a' : '#8a8a8a', 'font-size': '9.5', 'text-anchor': 'end', 'dominant-baseline': 'central' }, skySvg).textContent = yVal;
      });
      svg('text', {
        x: padL,
        y: 12,
        fill: dark ? '#8a8a92' : '#71717a',
        'font-size': '10',
        'font-weight': '600',
      }, skySvg).textContent = 'Ideas per logical depth d (stacked by 13 fields · peak at d=' + peakDepth + ' with ' + peakCount + ' ideas)';

      for (var depth = 0; depth <= maxD; depth++) {
        var x = padL + depth * barW;
        var yAcc = padT + plotH;
        for (var fi = 0; fi < fields.length; fi++) {
          var cnt = data.depthByField[fi][depth];
          if (!cnt) continue;
          var bh = (cnt / maxCount) * plotH;
          yAcc -= bh;
          var rect = svg('rect', {
            x: (x + 0.6).toFixed(1),
            y: yAcc.toFixed(1),
            width: Math.max(1.5, barW - 1.2).toFixed(1),
            height: bh.toFixed(1),
            fill: fields[fi].color[dark ? 1 : 0],
            style: 'cursor:pointer',
          }, skySvg);
          (function (dep) {
            rect.addEventListener('click', function () {
              activeChainPos = dep;
              renderChainPane();
            });
          })(depth);
        }
        if (depth % 10 === 0 || depth === maxD) {
          svg('text', {
            x: (x + barW / 2).toFixed(1),
            y: 210 - 8,
            fill: dark ? '#a1a1aa' : '#545454',
            'font-size': '10',
            'text-anchor': 'middle',
          }, skySvg).textContent = 'd=' + depth;
        }
      }

      // Highlight cursor at activeChainPos
      var cx = padL + (activeChainPos + 0.5) * barW;
      svg('line', {
        x1: cx.toFixed(1),
        y1: padT - 2,
        x2: cx.toFixed(1),
        y2: padT + plotH,
        stroke: dark ? '#ffffff' : '#111111',
        'stroke-width': 1.6,
        'stroke-dasharray': '3,2',
      }, skySvg);

      var curNodeIdx = chain[activeChainPos];
      var curNode = nodes[curNodeIdx];
      var curCol = cols[curNode[1]];
      var curField = fields[curCol.fieldIdx];

      var scrubSlider = h('input', {
        type: 'range',
        min: 0,
        max: chain.length - 1,
        value: activeChainPos,
        'aria-label': 'Dependency chain step',
        oninput: function (e) {
          activeChainPos = +e.target.value;
          renderChainPane();
        },
      });

      var stepCard = h('div', { class: 'tv-step-bar' }, [
        h('div', { class: 'tv-step-note' }, [
          h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:3px' }, [
            h('span', { class: 'tv-dot', style: '--c:' + curField.color[dark ? 1 : 0] }),
            h('b', { text: 'Step ' + (activeChainPos + 1) + ' / ' + chain.length + ' (depth ' + activeChainPos + ') · ' + idOf[curNodeIdx] + ' — ' + curNode[8] }),
          ]),
          h('div', {
            style: 'font-size:12.5px;color:var(--fg-2)',
            text: curCol.title + ' (' + curField.title + ') · ' + curNode[5] + ' transitive prerequisites · ' + curNode[6].toLocaleString() + ' downstream descendants · ' + colTotals[activeChainPos] + ' total atlas ideas at depth ' + activeChainPos,
          }),
        ]),
        h('button', {
          type: 'button',
          class: 'btn',
          onclick: function () {
            modeTabs.set('atlas');
            selectNode(curNodeIdx, false);
          },
          text: 'Inspect in map',
        }),
      ]);

      var ribbon = h('div', { class: 'tv-chain-ribbon' });
      chain.forEach(function (nIdx, pos) {
        var fCol = fields[fieldIdxOfNode[nIdx]].color[dark ? 1 : 0];
        var pill = h('button', {
          type: 'button',
          class: 'tv-chain-step' + (pos === activeChainPos ? ' active' : ''),
          title: 'Depth ' + pos + ': ' + nodes[nIdx][8],
          style: pos === activeChainPos ? '' : 'border-bottom:2px solid ' + fCol,
          onclick: function () { activeChainPos = pos; renderChainPane(); },
          text: idOf[nIdx],
        });
        ribbon.appendChild(pill);
      });

      var chainBox = h('div', { class: 'tv-chain-box' }, [
        h('div', { class: 'tv-chain-box-hdr' }, [
          h('span', { text: 'Longest dependency chain (77 ideas · click any step):' }),
          h('span', { html: '<b style="color:' + fields[0].color[dark ? 1 : 0] + '">Math</b> (39: pma → rca → fa) → <b style="color:' + fields[3].color[dark ? 1 : 0] + '">Physics</b> (25: mech → waves → qm) → <b style="color:' + fields[1].color[dark ? 1 : 0] + '">CS</b> (13: qinfo → cplx)' }),
        ]),
        ribbon,
      ]);

      chainPane.appendChild(h('div', { class: 'tv-chain-panel' }, [
        skySvg,
        h('div', { class: 'tv-slider-row' }, [
          h('span', { style: 'font-size:12.5px;color:var(--fg-2);white-space:nowrap', text: 'Scrub 77-step chain:' }),
          scrubSlider,
          h('span', { style: 'font-family:var(--mono);font-size:11.5px;color:var(--fg-2);white-space:nowrap', text: 'd = ' + activeChainPos + ' / ' + maxD }),
        ]),
        stepCard,
        chainBox,
      ]));
    }

    function renderViewMode() {
      atlasPane.style.display = viewMode === 'atlas' ? '' : 'none';
      flowsPane.style.display = viewMode === 'flows' ? '' : 'none';
      chainPane.style.display = viewMode === 'chain' ? '' : 'none';
      if (viewMode === 'atlas') drawAtlas();
      else if (viewMode === 'flows') renderFlowsPane();
      else if (viewMode === 'chain') renderChainPane();
    }

    renderLineage();
    requestAnimationFrame(function () { fitFullAtlas(); });
    window.addEventListener('resize', function () { if (viewMode === 'atlas') fitFullAtlas(); });
    themeListeners.push(function () {
      renderLineage();
      renderViewMode();
    });

    mapApi = {
      act: function (el) {
        var v = el.dataset.view || 'atlas';
        modeTabs.set(v);
        if (el.dataset.node && indexById[el.dataset.node] !== undefined) {
          selectNode(indexById[el.dataset.node], false);
        }
        if (el.dataset.field) {
          activeFlowField = el.dataset.field;
          activeFlowIdx = 0;
          renderFlowsPane();
        }
        if (el.dataset.step !== undefined) {
          activeChainPos = +el.dataset.step;
          renderChainPane();
        }
      },
    };
  }

  // =========================================================================
  // Figure 3: 13-Field Live Canvas Workbench (#tv-workbench)
  // =========================================================================
  function initWorkbench(fig, data) {
    var body = mountFig(fig);
    var fields = data.fields;
    var flagships = data.flagships;
    var details = data.itemsDetail;

    var activeId = flagships[0].id; // pma-4.19
    var showCode = false;
    var destroyCurrentViz = null;

    var fieldBar = h('div', { class: 'tv-field-bar', role: 'group', 'aria-label': 'Select field simulation' });
    var fieldButtons = [];

    flagships.forEach(function (fl) {
      var fMeta = fields.find(function (f) { return f.id === fl.field; });
      var btn = h('button', {
        type: 'button',
        class: 'tv-field-btn',
        'aria-pressed': String(fl.id === activeId),
        onclick: function () { loadItem(fl.id); },
      }, [
        h('span', { class: 'tv-dot', style: '--c:' + fMeta.color[0] }),
        fMeta.short,
      ]);
      fieldButtons.push({ id: fl.id, field: fl.field, el: btn });
      fieldBar.appendChild(btn);
    });
    body.appendChild(fieldBar);

    var cardEl = h('div', { class: 'tv-wb-card' });
    var headEl = h('div', { class: 'tv-wb-head' });
    var stmtEl = h('div', { class: 'tv-wb-stmt' });
    var capEl = h('div', { class: 'tv-wb-cap' });
    var vizHost = h('div', { class: 'tv-viz-mount' });
    var footEl = h('div', { class: 'tv-wb-foot' });
    var codeEl = h('div', { class: 'tv-code-drawer', style: 'display:none' });

    cardEl.appendChild(headEl);
    cardEl.appendChild(stmtEl);
    cardEl.appendChild(capEl);
    cardEl.appendChild(vizHost);
    cardEl.appendChild(footEl);
    cardEl.appendChild(codeEl);
    body.appendChild(cardEl);

    function mountActiveViz(presetOpts) {
      if (destroyCurrentViz) {
        try { destroyCurrentViz(); } catch (e) {}
        destroyCurrentViz = null;
      }
      clear(vizHost);
      var it = details[activeId];
      if (!it) return;
      var fMeta = fields.find(function (f) { return f.id === it.field; });
      var fCol = fMeta ? fMeta.color[isDark() ? 1 : 0] : '#2563eb';
      cardEl.style.setProperty('--fc', fCol);

      fieldButtons.forEach(function (b) {
        b.el.setAttribute('aria-pressed', String(b.id === activeId));
      });

      clear(headEl);
      headEl.appendChild(h('div', { class: 'tv-wb-eyebrow' }, [
        h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, [
          h('span', { class: 'tv-wb-badge', text: it.kind + ' ' + it.id }),
          h('span', { style: 'font-size:12px;font-weight:500;color:var(--fg-2)', text: (fMeta ? fMeta.title + ' · ' : '') + it.colTitle }),
        ]),
        h('div', { class: 'tv-wb-links' }, [
          it.credit ? h('span', { text: it.credit }) : null,
          h('a', { href: ATLAS_BASE + '#/t/' + it.id, target: '_blank', rel: 'noopener', text: 'Live page ↗' }),
        ]),
      ]));
      headEl.appendChild(h('div', { class: 'tv-wb-title', text: it.name }));

      stmtEl.innerHTML = rich(it.statement);
      capEl.innerHTML = rich(it.caption);

      if (window.TheoremsVizCore && window.TheoremsVizCore.VIZ[activeId]) {
        destroyCurrentViz = window.TheoremsVizCore.mount(vizHost, window.TheoremsVizCore.VIZ[activeId]);
      }

      if (presetOpts) {
        setTimeout(function () {
          if (presetOpts.seg !== undefined) {
            var segBtns = vizHost.querySelectorAll('.seg button');
            if (segBtns[presetOpts.seg]) segBtns[presetOpts.seg].click();
          }
          if (presetOpts.toggle !== undefined) {
            var togLabels = vizHost.querySelectorAll('.ctl-toggle label');
            if (togLabels[presetOpts.toggle]) togLabels[presetOpts.toggle].click();
          }
        }, 60);
      }

      clear(footEl);
      var apiTags = h('div', { class: 'tv-api-tags' }, [
        h('span', { style: 'margin-right:4px', text: 'depth ' + it.depth + ' · ' + it.anc + ' anc · ' + it.desc.toLocaleString() + ' desc · runtime:' }),
      ]);
      (it.apis || []).forEach(function (a) {
        apiTags.appendChild(h('span', { class: 'tv-api-tag', text: a }));
      });

      var codeBtn = h('button', {
        type: 'button',
        class: 'btn',
        onclick: function () {
          showCode = !showCode;
          codeEl.style.display = showCode ? '' : 'none';
          codeBtn.textContent = (showCode ? 'Hide' : 'Show') + ' viz(v) source (' + it.lines + ' lines)';
        },
        text: (showCode ? 'Hide' : 'Show') + ' viz(v) source (' + it.lines + ' lines)',
      });

      footEl.appendChild(apiTags);
      footEl.appendChild(codeBtn);
      codeEl.textContent = '// ' + it.file + ' (' + it.id + ')\n' + it.code;
    }

    function loadItem(id, presetOpts) {
      if (!details[id]) return;
      activeId = id;
      mountActiveViz(presetOpts);
    }

    var hadKatex = Boolean(window.katex);
    mountActiveViz();
    ensureKatex(function () {
      if (!hadKatex) {
        hadKatex = true;
        mountActiveViz();
      }
    });
    themeListeners.push(function () {
      var it = details[activeId];
      if (!it) return;
      var fMeta = fields.find(function (f) { return f.id === it.field; });
      if (fMeta) cardEl.style.setProperty('--fc', fMeta.color[isDark() ? 1 : 0]);
    });

    workbenchApi = {
      loadItem: loadItem,
      act: function (el) {
        var id = el.dataset.item || 'pma-4.19';
        var opts = {};
        if (el.dataset.seg !== undefined) opts.seg = +el.dataset.seg;
        if (el.dataset.toggle !== undefined) opts.toggle = +el.dataset.toggle;
        loadItem(id, opts);
      },
    };
  }

  // =========================================================================
  // Figure 4: Cross-Field Bridges & 450-Paper Timeline (#tv-bridges)
  // =========================================================================
  function initBridges(fig, data) {
    var body = mountFig(fig);
    var bridges = data.bridges;
    var fields = data.fields;
    var details = data.itemsDetail;
    var papers = data.papers; // [id, colIdx, yr, name, authors, intro[], written]

    var mode = 'bridges';
    var activeBridgeSlug = 'spectral';
    var activeStepIdx = 2; // ladr-7.29 Real spectral theorem
    var selectedPaperIdx = papers.findIndex(function (p) { return p[2] === 1948 && p[3].indexOf('Communication') !== -1; });
    if (selectedPaperIdx < 0) selectedPaperIdx = papers.findIndex(function (p) { return p[2] === 1948; });
    if (selectedPaperIdx < 0) selectedPaperIdx = Math.floor(papers.length * 0.7);
    var destroyBridgeViz = null;

    var SHORT_BRIDGE = {
      action: 'Least action',
      contagion: 'Contagion',
      diffusion: 'Diffusion',
      entropy: 'Entropy',
      'fixed-points': 'Fixed points',
      fourier: 'Fourier',
      spectral: 'Spectral',
      symmetry: 'Symmetry',
    };

    var topTabs = tabs('Connective view', [
      ['bridges', 'Cross-field bridges (8 walks)'],
      ['papers', 'Landmark papers (450 papers)'],
    ], mode, function (v) {
      mode = v;
      renderMode();
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      topTabs.el,
      h('span', { class: 'grow' }),
      h('span', { class: 'fig-num', text: '13 field lanes · 350 BCE – 2020' }),
    ]));

    var bridgesPane = h('div');
    var papersPane = h('div', { style: 'display:none' });
    body.appendChild(bridgesPane);
    body.appendChild(papersPane);

    function renderBridgesPane() {
      if (destroyBridgeViz) {
        try { destroyBridgeViz(); } catch (e) {}
        destroyBridgeViz = null;
      }
      clear(bridgesPane);
      var dark = isDark();
      var bridge = bridges.find(function (b) { return b.slug === activeBridgeSlug; }) || bridges[0];
      if (activeStepIdx >= bridge.steps.length) activeStepIdx = 0;

      // Bridge selector pills (all 8 on 1 single row)
      var pillsRow = h('div', { class: 'tv-bridge-pills' });
      bridges.forEach(function (b) {
        var shortLabel = SHORT_BRIDGE[b.slug] || b.title.split(':')[0];
        pillsRow.appendChild(h('button', {
          type: 'button',
          class: 'tv-pill',
          'aria-pressed': String(b.slug === bridge.slug),
          onclick: function () {
            activeBridgeSlug = b.slug;
            var firstLive = b.steps.findIndex(function (s) { return s.bundled; });
            activeStepIdx = firstLive >= 0 ? firstLive : 0;
            renderBridgesPane();
          },
          text: shortLabel + ' (' + b.steps.length + ')',
        }));
      });
      bridgesPane.appendChild(pillsRow);

      // 13-lane cross-field swimlane SVG (padR = 44 so rightmost step ID never clips)
      var laneH = 21, padL = 88, padR = 44, padT = 18, padB = 24;
      var W = 760, H = padT + fields.length * laneH + padB;
      var swimSvg = svg('svg', {
        class: 'tv-swimlane-svg',
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': 'Cross-field swimlane track for ' + bridge.title,
      });

      var fieldIndexMap = {};
      fields.forEach(function (f, idx) {
        fieldIndexMap[f.id] = idx;
        var y = padT + (idx + 0.5) * laneH;
        svg('line', {
          x1: padL,
          y1: y,
          x2: W - padR,
          y2: y,
          stroke: dark ? '#25252b' : '#ececea',
          'stroke-width': 1,
        }, swimSvg);
        svg('text', {
          x: padL - 8,
          y: y,
          fill: f.color[dark ? 1 : 0],
          'font-size': '10.5',
          'font-weight': '600',
          'text-anchor': 'end',
          'dominant-baseline': 'central',
        }, swimSvg).textContent = f.short;
      });

      // Faint background paths for the other 7 bridges
      bridges.forEach(function (b) {
        if (b.slug === bridge.slug) return;
        var pts = b.steps.map(function (st, si) {
          var x = padL + (si / Math.max(1, b.steps.length - 1)) * (W - padL - padR);
          var fy = padT + ((fieldIndexMap[st.field] || 0) + 0.5) * laneH;
          return (si === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + fy.toFixed(1);
        }).join(' ');
        svg('path', {
          d: pts,
          fill: 'none',
          stroke: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          'stroke-width': 1.2,
        }, swimSvg);
      });

      // Selected bridge path
      var stepCoords = bridge.steps.map(function (st, si) {
        var x = padL + (si / Math.max(1, bridge.steps.length - 1)) * (W - padL - padR);
        var fy = padT + ((fieldIndexMap[st.field] || 0) + 0.5) * laneH;
        return { x: x, y: fy, st: st, si: si };
      });

      for (var i = 0; i < stepCoords.length - 1; i++) {
        var p0 = stepCoords[i], p1 = stepCoords[i + 1];
        var mx = (p0.x + p1.x) / 2;
        var col0 = fields[fieldIndexMap[p0.st.field] || 0].color[dark ? 1 : 0];
        svg('path', {
          d: 'M ' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) + ' C ' + mx.toFixed(1) + ' ' + p0.y.toFixed(1) + ', ' + mx.toFixed(1) + ' ' + p1.y.toFixed(1) + ', ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1),
          fill: 'none',
          stroke: col0,
          'stroke-width': 2.4,
          opacity: 0.85,
        }, swimSvg);
      }

      stepCoords.forEach(function (pt) {
        var fCol = fields[fieldIndexMap[pt.st.field] || 0].color[dark ? 1 : 0];
        var isSel = pt.si === activeStepIdx;
        var g = svg('g', { style: 'cursor:pointer' }, swimSvg);
        if (isSel) {
          svg('circle', { cx: pt.x.toFixed(1), cy: pt.y.toFixed(1), r: 10, fill: fCol, opacity: 0.22 }, g);
        }
        svg('circle', {
          cx: pt.x.toFixed(1),
          cy: pt.y.toFixed(1),
          r: isSel ? 6.5 : pt.st.bundled ? 4.8 : 3.6,
          fill: pt.st.bundled ? fCol : (dark ? '#18181c' : '#ffffff'),
          stroke: isSel ? (dark ? '#ffffff' : '#111111') : fCol,
          'stroke-width': isSel ? 2.2 : 1.6,
        }, g);
        svg('text', {
          x: pt.x.toFixed(1),
          y: H - 7,
          fill: isSel ? (dark ? '#ffffff' : '#111111') : (dark ? '#71717a' : '#8a8a8a'),
          'font-size': isSel ? '10' : '9',
          'font-weight': isSel ? '700' : '500',
          'text-anchor': 'middle',
        }, g).textContent = pt.st.id;
        g.addEventListener('click', function () {
          activeStepIdx = pt.si;
          renderBridgesPane();
        });
      });

      bridgesPane.appendChild(swimSvg);

      var curStep = bridge.steps[activeStepIdx];
      var curF = fields[fieldIndexMap[curStep.field] || 0];
      var stepBar = h('div', { class: 'tv-step-bar' }, [
        h('div', { class: 'tv-step-note' }, [
          h('div', { style: 'display:flex;align-items:center;gap:7px;margin-bottom:3px' }, [
            h('span', { class: 'tv-dot', style: '--c:' + curF.color[dark ? 1 : 0] }),
            h('b', { text: 'Step ' + (activeStepIdx + 1) + ' / ' + bridge.steps.length + ' · ' + curStep.id + ' — ' + curStep.name + ' (' + curF.title + ')' }),
          ]),
          h('div', { html: rich(curStep.note) }),
        ]),
        h('div', { style: 'display:flex;gap:6px;align-items:center;flex-shrink:0' }, [
          h('button', {
            type: 'button',
            class: 'btn',
            onclick: function () {
              activeStepIdx = (activeStepIdx - 1 + bridge.steps.length) % bridge.steps.length;
              renderBridgesPane();
            },
            text: '← Prev',
          }),
          h('button', {
            type: 'button',
            class: 'btn',
            onclick: function () {
              activeStepIdx = (activeStepIdx + 1) % bridge.steps.length;
              renderBridgesPane();
            },
            text: 'Next →',
          }),
        ]),
      ]);
      bridgesPane.appendChild(stepBar);

      // Embedded live viz(v) for the selected bridge step!
      var vizCard = h('div', { class: 'tv-wb-card' });
      var vizMount = h('div', { class: 'tv-viz-mount' });
      if (curStep.bundled && window.TheoremsVizCore && window.TheoremsVizCore.VIZ[curStep.id]) {
        var det = details[curStep.id];
        if (det && det.caption) {
          var capDiv = h('div', { class: 'tv-wb-cap', html: rich(det.caption) });
          vizCard.appendChild(capDiv);
        }
        vizCard.appendChild(vizMount);
        bridgesPane.appendChild(vizCard);
        destroyBridgeViz = window.TheoremsVizCore.mount(vizMount, window.TheoremsVizCore.VIZ[curStep.id]);
      } else {
        // Find nearest bundled step on this bridge so reader can jump with 1 click
        var nearestIdx = bridge.steps.findIndex(function (s) { return s.bundled; });
        vizCard.appendChild(h('div', {
          style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;color:var(--fg-2)',
        }, [
          h('span', { text: curStep.id + ' (' + curStep.name + ') is a syllabus bridge node or external collection shard.' }),
          nearestIdx >= 0 ? h('button', {
            type: 'button',
            class: 'btn',
            onclick: function () { activeStepIdx = nearestIdx; renderBridgesPane(); },
            text: 'Jump to live simulation on this bridge (' + bridge.steps[nearestIdx].id + ')',
          }) : null,
        ]));
        bridgesPane.appendChild(vizCard);
      }
    }

    // Piecewise time warp for 450 landmark papers (-500 to 2025)
    function yearToX(yr, x0, x1) {
      var t;
      if (yr <= 1600) {
        t = 0.18 * ((Math.max(-500, yr) - (-500)) / 2100);
      } else if (yr <= 1850) {
        t = 0.18 + 0.27 * ((yr - 1600) / 250);
      } else {
        t = 0.45 + 0.55 * ((Math.min(2025, yr) - 1850) / 175);
      }
      return x0 + t * (x1 - x0);
    }

    var FAMOUS_PAPERS = [
      [-300, '300 BCE · Euclid'],
      [1687, '1687 · Newton'],
      [1822, '1822 · Fourier'],
      [1854, '1854 · Snow'],
      [1905, '1905 · Einstein'],
      [1948, '1948 · Shannon'],
      [1953, '1953 · Watson & Crick'],
      [1996, '1996 · Grover'],
    ];

    function renderPapersPane() {
      clear(papersPane);
      var dark = isDark();

      // Quick-select landmark paper pills
      var paperPills = h('div', { class: 'tv-bridge-pills' });
      FAMOUS_PAPERS.forEach(function (fp) {
        var pIdx = papers.findIndex(function (p) { return p[2] === fp[0]; });
        if (pIdx < 0) return;
        var colObj = data.collections[papers[pIdx][1]];
        var fCol = fields[colObj ? colObj.fieldIdx : 0].color[dark ? 1 : 0];
        paperPills.appendChild(h('button', {
          type: 'button',
          class: 'tv-pill',
          'aria-pressed': String(pIdx === selectedPaperIdx),
          onclick: function () {
            selectedPaperIdx = pIdx;
            renderPapersPane();
          },
        }, [
          h('span', { class: 'tv-dot', style: '--c:' + fCol }),
          fp[1],
        ]));
      });
      papersPane.appendChild(paperPills);

      var laneH = 21, padL = 88, padR = 26, padT = 18, padB = 26;
      var W = 760, H = padT + fields.length * laneH + padB;
      var timeSvg = svg('svg', {
        class: 'tv-swimlane-svg',
        viewBox: '0 0 ' + W + ' ' + H,
        role: 'img',
        'aria-label': '450 landmark papers from 350 BCE to 2020 across 13 fields',
      });

      // Non-colliding piecewise ticks across 350 BCE – 2020
      var ticks = [-300, 1600, 1700, 1800, 1850, 1900, 1950, 2000];
      ticks.forEach(function (yr) {
        var tx = yearToX(yr, padL, W - padR);
        svg('line', { x1: tx.toFixed(1), y1: padT - 4, x2: tx.toFixed(1), y2: H - padB + 4, stroke: dark ? '#222228' : '#f0f0ee', 'stroke-width': 1 }, timeSvg);
        svg('text', {
          x: tx.toFixed(1),
          y: H - 7,
          fill: dark ? '#8a8a92' : '#71717a',
          'font-size': '9.5',
          'text-anchor': 'middle',
        }, timeSvg).textContent = yr < 0 ? (-yr) + ' BCE' : String(yr);
      });

      fields.forEach(function (f, idx) {
        var y = padT + (idx + 0.5) * laneH;
        svg('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: dark ? '#25252b' : '#ececea', 'stroke-width': 1 }, timeSvg);
        svg('text', {
          x: padL - 8,
          y: y,
          fill: f.color[dark ? 1 : 0],
          'font-size': '10.5',
          'font-weight': '600',
          'text-anchor': 'end',
          'dominant-baseline': 'central',
        }, timeSvg).textContent = f.short;
      });

      var selX = 0, selY = 0, selColStr = '#2563eb';
      papers.forEach(function (p, pi) {
        var colObj = data.collections[p[1]];
        var fIdx = colObj ? colObj.fieldIdx : 0;
        var fCol = fields[fIdx].color[dark ? 1 : 0];
        var px = yearToX(p[2], padL, W - padR);
        var py = padT + (fIdx + 0.5) * laneH + ((pi % 3) - 1) * 3.2;
        var isSel = pi === selectedPaperIdx;
        if (isSel) {
          selX = px;
          selY = py;
          selColStr = fCol;
        }
        var c = svg('circle', {
          cx: px.toFixed(1),
          cy: py.toFixed(1),
          r: isSel ? 6.5 : p[6] ? 3.5 : 2.6,
          fill: p[6] ? fCol : (dark ? '#18181c' : '#ffffff'),
          stroke: isSel ? (dark ? '#ffffff' : '#111111') : fCol,
          'stroke-width': isSel ? 2.2 : 1.2,
          opacity: isSel ? 1 : 0.8,
          style: 'cursor:pointer',
        }, timeSvg);
        c.addEventListener('click', function () {
          selectedPaperIdx = pi;
          renderPapersPane();
        });
      });

      var selP = papers[selectedPaperIdx] || papers[0];
      var selCol = data.collections[selP[1]];
      var selField = fields[selCol ? selCol.fieldIdx : 0];
      var yrStr = selP[2] < 0 ? (-selP[2]) + ' BCE' : String(selP[2]);

      // Floating SVG callout pill on the selected paper dot
      var shortName = selP[3].length > 36 ? selP[3].slice(0, 34) + '…' : selP[3];
      var calloutTxt = yrStr + ' · ' + shortName;
      var pillW = Math.min(270, calloutTxt.length * 6.0 + 16);
      var pillX = Math.max(padL + 4, Math.min(W - padR - pillW - 4, selX - pillW / 2));
      var pillY = selY > 44 ? selY - 27 : selY + 10;
      svg('circle', { cx: selX.toFixed(1), cy: selY.toFixed(1), r: 10.5, fill: selColStr, opacity: 0.22, 'pointer-events': 'none' }, timeSvg);
      svg('rect', {
        x: pillX.toFixed(1),
        y: pillY.toFixed(1),
        width: pillW.toFixed(1),
        height: 19,
        rx: 4,
        fill: dark ? '#16161b' : '#ffffff',
        stroke: selColStr,
        'stroke-width': 1.3,
        'pointer-events': 'none',
      }, timeSvg);
      svg('text', {
        x: (pillX + 7).toFixed(1),
        y: (pillY + 13).toFixed(1),
        fill: dark ? '#ececef' : '#111111',
        'font-size': '10.5',
        'font-weight': '600',
        'pointer-events': 'none',
      }, timeSvg).textContent = calloutTxt;

      papersPane.appendChild(timeSvg);

      var pCard = h('div', { class: 'tv-step-bar' }, [
        h('div', { class: 'tv-step-note' }, [
          h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:3px' }, [
            h('span', { class: 'tv-dot', style: '--c:' + selField.color[dark ? 1 : 0] }),
            h('b', { text: yrStr + ' · ' + selP[3] }),
          ]),
          h('div', {
            style: 'font-size:12.5px;color:var(--fg-2)',
            text: (selP[4] ? selP[4] + ' · ' : '') + selCol.title + ' (' + selField.title + ')' +
              (selP[5] && selP[5].length ? ' · introduces ' + selP[5].join(', ') : ''),
          }),
        ]),
        h('a', {
          class: 'btn',
          href: ATLAS_BASE + '#/papers',
          target: '_blank',
          rel: 'noopener',
          text: 'All 450 papers ↗',
        }),
      ]);
      papersPane.appendChild(pCard);
    }

    function renderMode() {
      bridgesPane.style.display = mode === 'bridges' ? '' : 'none';
      papersPane.style.display = mode === 'papers' ? '' : 'none';
      if (mode === 'bridges') renderBridgesPane();
      else renderPapersPane();
    }

    renderMode();
    ensureKatex(function () { if (mode === 'bridges') renderBridgesPane(); });
    themeListeners.push(renderMode);

    bridgesApi = {
      act: function (el) {
        var m = el.dataset.mode || 'bridges';
        topTabs.set(m);
        if (el.dataset.bridge) activeBridgeSlug = el.dataset.bridge;
        if (el.dataset.step !== undefined) activeStepIdx = +el.dataset.step;
        renderMode();
      },
    };
  }

  // =========================================================================
  // Figure 5: Auditing 6,621 Canvases & Primary-Source Numerics (#tv-audit)
  // =========================================================================
  function initAudit(fig, data) {
    var body = mountFig(fig);
    var fields = data.fields;
    var prim = data.primitives;
    var activeCase = 'radon';

    // Audit case state
    var ndVal = 14; // detector count for Radon/Fourier audit
    var selS = 0.45; // selection coefficient for Bürger/Felsenstein logit audit

    var caseTabs = tabs('Verification case', [
      ['radon', 'Fourier CT slice (imaging-3.4)'],
      ['popgen', 'Discrete logit (popgen-4.2)'],
      ['harness', 'Headless gate (check.mjs)'],
    ], activeCase, function (v) {
      activeCase = v;
      renderCaseBox();
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      caseTabs.el,
      h('span', { class: 'grow' }),
      h('span', {
        class: 'fig-num',
        text: data.totals.verificationSuites + ' suites · ' + data.totals.verificationTests.toLocaleString() + ' tests · ' + data.totals.verificationChecks.toLocaleString() + ' checks',
      }),
    ]));

    var covBox = h('div', { class: 'tv-cov-box' });
    var caseBox = h('div', { class: 'tv-case-box' });
    body.appendChild(h('div', { class: 'tv-audit-grid' }, [covBox, caseBox]));

    function renderCovBox() {
      clear(covBox);
      var dark = isDark();
      covBox.appendChild(h('div', {
        style: 'font-size:13px;font-weight:600;color:var(--fg)',
        text: '85 collections across 13 fields (6,684 written vs 6,890 planned)',
      }));

      var rowsEl = h('div', { class: 'tv-cov-rows' });
      var maxFieldTotal = Math.max.apply(null, fields.map(function (f) { return f.count + f.planned; }));
      fields.forEach(function (f) {
        var fCol = f.color[dark ? 1 : 0];
        var wPct = ((f.count / maxFieldTotal) * 100).toFixed(1);
        var pPct = ((f.planned / maxFieldTotal) * 100).toFixed(1);
        rowsEl.appendChild(h('div', { class: 'tv-cov-row' }, [
          h('span', { style: 'font-weight:500;color:var(--fg)', text: f.short + ' (' + f.collections + ')' }),
          h('div', { class: 'tv-cov-bar' }, [
            h('div', { style: 'width:' + wPct + '%;background:' + fCol }),
            h('div', { style: 'width:' + pPct + '%;background:' + fCol + ';opacity:0.25' }),
          ]),
          h('span', { style: 'text-align:right;color:var(--fg-2)', text: f.count + ' / ' + (f.count + f.planned) }),
        ]));
      });
      covBox.appendChild(rowsEl);

      var primGrid = h('div', { class: 'tv-prim-grid' }, [
        h('div', { class: 'tv-prim-cell', html: '<b>' + (prim.stage2d + prim.stage3d).toLocaleString() + '</b>stages (2D + 3D)' }),
        h('div', { class: 'tv-prim-cell', html: '<b>' + prim.sliders.toLocaleString() + '</b>v.slider controls' }),
        h('div', { class: 'tv-prim-cell', html: '<b>' + prim.handles.toLocaleString() + '</b>draggable handles' }),
        h('div', { class: 'tv-prim-cell', html: '<b>' + prim.readouts.toLocaleString() + '</b>live KaTeX readouts' }),
        h('div', { class: 'tv-prim-cell', html: '<b>' + (prim.ode + prim.fft + prim.linalg).toLocaleString() + '</b>ODE / FFT / SVD calls' }),
        h('div', { class: 'tv-prim-cell', html: '<b>' + data.totals.verificationChecks.toLocaleString() + '</b>audit assertions' }),
      ]);
      covBox.appendChild(primGrid);
    }

    function renderCaseBox() {
      clear(caseBox);
      var dark = isDark();

      if (activeCase === 'radon') {
        caseBox.appendChild(h('div', {
          style: 'font-size:13.5px;font-weight:600;color:var(--fg);margin-bottom:3px',
          text: 'verification-imaging-radon.test.mjs — Bessel slice quadrature & negative-kx conjugacy',
        }));
        caseBox.appendChild(h('div', {
          style: 'font-size:12.5px;color:var(--fg-2);line-height:1.45',
          html: rich('Tests the finite-$N_d$ detector DFT of an ellipse phantom against the exact analytical Bessel slice $2J_1(\\omega)/\\omega$ and verifies Hermitian conjugacy $F(-k_x) = F^*(k_x)$ across the 2D Fourier grid.'),
        }));

        var cv = h('canvas', { class: 'tv-audit-canvas', width: 420, height: 205 });
        caseBox.appendChild(cv);

        var sliderRow = h('div', { class: 'tv-slider-row' }, [
          h('span', { style: 'color:var(--fg-2);white-space:nowrap', html: rich('Detectors $N_d$:') }),
          h('input', {
            type: 'range',
            min: 8,
            max: 64,
            step: 2,
            value: ndVal,
            'aria-label': 'Detector count',
            oninput: function (e) { ndVal = +e.target.value; drawRadon(); },
          }),
          h('span', { id: 'tv-nd-lbl', style: 'font-family:var(--mono);font-size:11.5px;white-space:nowrap;text-align:right' }),
        ]);
        caseBox.appendChild(sliderRow);

        var footNote = h('div', { style: 'font-size:12px;color:var(--fg-2);margin-top:7px;font-variant-numeric:tabular-nums;line-height:1.45' });
        caseBox.appendChild(footNote);

        function drawRadon() {
          var dpr = Math.min(2, window.devicePixelRatio || 1);
          var W = 420, H = 205;
          cv.width = W * dpr;
          cv.height = H * dpr;
          var ctx = cv.getContext('2d');
          ctx.scale(dpr, dpr);
          ctx.fillStyle = dark ? '#141418' : '#ffffff';
          ctx.fillRect(0, 0, W, H);

          var padL = 36, padR = 14, padT = 26, padB = 26;
          var pw = W - padL - padR, ph = H - padT - padB;
          var wMax = 22;
          // Detector array spans [-L, L] with L = 1.75 -> Nyquist omega_N = pi * N_d / (2L)
          var L = 1.75;
          var nyq = (Math.PI * ndVal) / (2 * L);

          // Y-axis gridlines & labels: y in [-0.25, 1.05]
          function yOf(val) {
            return padT + ((1.05 - val) / 1.30) * ph;
          }
          [1.0, 0.5, 0.0].forEach(function (yv) {
            var py = yOf(yv);
            ctx.strokeStyle = yv === 0 ? (dark ? '#32323c' : '#d8d8d4') : (dark ? '#222229' : '#f0f0ee');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padL, py);
            ctx.lineTo(padL + pw, py);
            ctx.stroke();
            ctx.fillStyle = dark ? '#71717a' : '#8a8a8a';
            ctx.font = '500 9.5px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(yv.toFixed(1), padL - 5, py + 3);
          });
          ctx.textAlign = 'left';

          // Nyquist cutoff band
          var nyqX = padL + Math.min(1, nyq / wMax) * pw;
          if (nyq < wMax) {
            ctx.fillStyle = dark ? 'rgba(248, 113, 113, 0.11)' : 'rgba(220, 38, 38, 0.07)';
            ctx.fillRect(nyqX, padT, padL + pw - nyqX, ph);
            ctx.strokeStyle = dark ? '#f87171' : '#dc2626';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(nyqX, padT);
            ctx.lineTo(nyqX, padT + ph);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = dark ? '#f87171' : '#dc2626';
            ctx.font = '600 9.5px -apple-system, sans-serif';
            ctx.fillText('Nyquist ω_N = ' + nyq.toFixed(1) + ' (aliasing above)', Math.min(W - 158, Math.max(padL + 4, nyqX + 5)), padT + ph - 6);
          }

          // Exact Bessel 2*J1(w)/w analytical curve vs finite N_d detector sum on [-L, L]
          function besselSlice(w) {
            if (w < 1e-5) return 1;
            var sum = 0, M = 80;
            for (var i = 0; i < M; i++) {
              var u = -1 + (i + 0.5) * (2 / M);
              sum += Math.sqrt(Math.max(0, 1 - u * u)) * Math.cos(w * u) * (2 / M);
            }
            return sum * (2 / Math.PI);
          }
          function sampledSlice(w, nd) {
            var ds = (2 * L) / nd;
            var sum = 0;
            for (var i = 0; i < nd; i++) {
              var u = -L + (i + 0.5) * ds;
              if (Math.abs(u) < 1) {
                sum += Math.sqrt(1 - u * u) * Math.cos(w * u) * ds;
              }
            }
            return sum * (2 / Math.PI);
          }

          // Exact curve (green)
          ctx.strokeStyle = dark ? '#4ade80' : '#16a34a';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          for (var k = 0; k <= 180; k++) {
            var w = (k / 180) * wMax;
            var val = besselSlice(w);
            var x = padL + (w / wMax) * pw;
            var y = yOf(val);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // Sampled finite-detector DFT (amber/orange when aliased, blue when converged)
          var maxErr = 0;
          var dftCol = ndVal < 28 ? (dark ? '#fbbf24' : '#d97706') : (dark ? '#60a5fa' : '#2563eb');
          ctx.strokeStyle = dftCol;
          ctx.lineWidth = 1.85;
          ctx.setLineDash([4, 2.5]);
          ctx.beginPath();
          for (var j = 0; j <= 180; j++) {
            var w2 = (j / 180) * wMax;
            var ex = besselSlice(w2);
            var sm = sampledSlice(w2, ndVal);
            maxErr = Math.max(maxErr, Math.abs(sm - ex));
            var x2 = padL + (w2 / wMax) * pw;
            var y2 = Math.max(padT, Math.min(padT + ph, yOf(sm)));
            if (j === 0) ctx.moveTo(x2, y2);
            else ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Top legend inside canvas
          ctx.font = '600 10px -apple-system, sans-serif';
          ctx.fillStyle = dark ? '#4ade80' : '#16a34a';
          ctx.fillText('— Exact 2J₁(ω)/ω', padL + 4, 15);
          ctx.fillStyle = dftCol;
          ctx.fillText('--- N_d = ' + ndVal + ' detector DFT (max err ' + maxErr.toFixed(3) + ')', padL + 108, 15);

          // X-axis ticks
          ctx.fillStyle = dark ? '#8a8a92' : '#71717a';
          ctx.font = '500 9.5px -apple-system, sans-serif';
          [0, 5, 10, 15, 20].forEach(function (wv) {
            var tx = padL + (wv / wMax) * pw;
            ctx.fillText('ω=' + wv, tx - 10, H - 7);
          });

          var lbl = caseBox.querySelector('#tv-nd-lbl');
          if (lbl) lbl.textContent = 'N_d = ' + ndVal + ' · ω_N = ' + nyq.toFixed(1);
          footNote.innerHTML = rich(
            '**Bessel quadrature error:** $' + maxErr.toFixed(3) +
            '$ at $N_d = ' + ndVal + '$ · **Hermitian $-k_x$ residual:** $1.42\\times 10^{-3}$ (unconjugated) $\\to 3.8\\times 10^{-13}$ (restored).'
          );
        }
        drawRadon();
      } else if (activeCase === 'popgen') {
        caseBox.appendChild(h('div', {
          style: 'font-size:13.5px;font-weight:600;color:var(--fg);margin-bottom:3px',
          text: 'verification-popgen-selection.test.mjs — Exact discrete logit slope ln(1+s) vs weak-selection s',
        }));
        caseBox.appendChild(h('div', {
          style: 'font-size:12.5px;color:var(--fg-2);line-height:1.45',
          html: rich('In discrete haploid selection $p_{t+1} = \\frac{(1+s)p_t}{1+sp_t}$, log-odds $\\ln\\!\\big(\\frac{p_t}{1-p_t}\\big)$ grows linearly with exact slope $\\ln(1+s)$ per generation; using slope $s$ overestimates fixation speed.'),
        }));

        var cv2 = h('canvas', { class: 'tv-audit-canvas', width: 420, height: 205 });
        caseBox.appendChild(cv2);

        caseBox.appendChild(h('div', { class: 'tv-slider-row' }, [
          h('span', { style: 'color:var(--fg-2);white-space:nowrap', html: rich('Selection $s$:') }),
          h('input', {
            type: 'range',
            min: 0.05,
            max: 0.90,
            step: 0.05,
            value: selS,
            'aria-label': 'Selection coefficient',
            oninput: function (e) { selS = +e.target.value; drawPopgen(); },
          }),
          h('span', { id: 'tv-s-lbl', style: 'font-family:var(--mono);font-size:11.5px;white-space:nowrap;text-align:right' }),
        ]));

        var popNote = h('div', { style: 'font-size:12px;color:var(--fg-2);margin-top:7px;font-variant-numeric:tabular-nums;line-height:1.45' });
        caseBox.appendChild(popNote);

        function drawPopgen() {
          var dpr = Math.min(2, window.devicePixelRatio || 1);
          var W = 420, H = 205;
          cv2.width = W * dpr;
          cv2.height = H * dpr;
          var ctx = cv2.getContext('2d');
          ctx.scale(dpr, dpr);
          ctx.fillStyle = dark ? '#141418' : '#ffffff';
          ctx.fillRect(0, 0, W, H);

          var p0 = 0.02, T = 25;
          var exactRate = Math.log(1 + selS);
          var logit0 = Math.log(p0 / (1 - p0)); // -3.89

          // Two side-by-side panels: Left = allele frequency p_t in [0,1]; Right = log-odds ln(p/(1-p))
          var padT = 26, padB = 24;
          var ph = H - padT - padB;
          var L_x0 = 32, L_w = 166;
          var R_x0 = 236, R_w = 168;

          // Left panel grid (p_t in [0, 1])
          [0, 0.5, 1.0].forEach(function (pv) {
            var py = padT + (1 - pv) * ph;
            ctx.strokeStyle = pv === 0.5 ? (dark ? '#2e2e38' : '#dcdcd8') : (dark ? '#222229' : '#f0f0ee');
            ctx.setLineDash(pv === 0.5 ? [2, 2] : []);
            ctx.beginPath();
            ctx.moveTo(L_x0, py);
            ctx.lineTo(L_x0 + L_w, py);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = dark ? '#71717a' : '#8a8a8a';
            ctx.font = '500 9px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(pv.toFixed(1), L_x0 - 4, py + 3);
          });

          // Right panel grid (log-odds in [-4, +8])
          var loMin = -4, loMax = 8;
          function yLogit(lv) {
            return padT + ((loMax - lv) / (loMax - loMin)) * ph;
          }
          [-4, 0, 4, 8].forEach(function (lv) {
            var py = yLogit(lv);
            ctx.strokeStyle = lv === 0 ? (dark ? '#2e2e38' : '#dcdcd8') : (dark ? '#222229' : '#f0f0ee');
            ctx.beginPath();
            ctx.moveTo(R_x0, py);
            ctx.lineTo(R_x0 + R_w, py);
            ctx.stroke();
            ctx.fillStyle = dark ? '#71717a' : '#8a8a8a';
            ctx.font = '500 9px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText((lv > 0 ? '+' : '') + lv, R_x0 - 4, py + 3);
          });
          ctx.textAlign = 'left';

          // Panel titles
          ctx.font = '600 10px -apple-system, sans-serif';
          ctx.fillStyle = dark ? '#ececef' : '#111111';
          ctx.fillText('Allele frequency p_t', L_x0, 15);
          ctx.fillText('Log-odds ln(p_t / (1−p_t))', R_x0, 15);

          // Left panel curves: exact (green) vs weak-s ODE (dashed red)
          ctx.strokeStyle = dark ? '#4ade80' : '#16a34a';
          ctx.lineWidth = 2.1;
          ctx.beginPath();
          for (var t = 0; t <= T; t++) {
            var odds = (p0 / (1 - p0)) * Math.pow(1 + selS, t);
            var p = odds / (1 + odds);
            var x = L_x0 + (t / T) * L_w;
            var y = padT + (1 - p) * ph;
            if (t === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          ctx.strokeStyle = dark ? '#f87171' : '#dc2626';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 2.5]);
          ctx.beginPath();
          for (var t2 = 0; t2 <= T; t2++) {
            var oddsW = (p0 / (1 - p0)) * Math.exp(selS * t2);
            var pwVal = oddsW / (1 + oddsW);
            var x2 = L_x0 + (t2 / T) * L_w;
            var y2 = padT + (1 - pwVal) * ph;
            if (t2 === 0) ctx.moveTo(x2, y2);
            else ctx.lineTo(x2, y2);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Right panel straight lines: slope ln(1+s) vs slope s
          ctx.strokeStyle = dark ? '#4ade80' : '#16a34a';
          ctx.lineWidth = 2.1;
          ctx.beginPath();
          for (var tr = 0; tr <= T; tr++) {
            var lvEx = Math.min(loMax, logit0 + exactRate * tr);
            var xr = R_x0 + (tr / T) * R_w;
            var yr = yLogit(lvEx);
            if (tr === 0) ctx.moveTo(xr, yr);
            else ctx.lineTo(xr, yr);
          }
          ctx.stroke();

          ctx.strokeStyle = dark ? '#f87171' : '#dc2626';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([4, 2.5]);
          ctx.beginPath();
          for (var tr2 = 0; tr2 <= T; tr2++) {
            var lvWk = Math.min(loMax, logit0 + selS * tr2);
            var xr2 = R_x0 + (tr2 / T) * R_w;
            var yr2 = yLogit(lvWk);
            if (tr2 === 0) ctx.moveTo(xr2, yr2);
            else ctx.lineTo(xr2, yr2);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // X-axis labels
          ctx.fillStyle = dark ? '#8a8a92' : '#71717a';
          ctx.font = '500 9px -apple-system, sans-serif';
          ctx.fillText('t = 0 … 25 gen', L_x0 + 48, H - 7);
          ctx.fillText('slope ln(1+s) vs s', R_x0 + 42, H - 7);

          var tHalfExact = (0 - logit0) / exactRate;
          var tHalfWeak = (0 - logit0) / selS;
          var lbl = caseBox.querySelector('#tv-s-lbl');
          if (lbl) lbl.textContent = 's=' + selS.toFixed(2) + ' · ln(1+s)=' + exactRate.toFixed(3);
          popNote.innerHTML = rich(
            '**Exact discrete slope** $\\ln(1+s) = ' + exactRate.toFixed(3) +
            '$ ($t_{1/2} = ' + tHalfExact.toFixed(1) + '$ gen) vs **weak-selection ODE** slope $s = ' +
            selS.toFixed(2) + '$ ($t_{1/2} = ' + tHalfWeak.toFixed(1) + '$ gen — **' +
            (((selS - exactRate) / exactRate) * 100).toFixed(1) + '%** rate overestimate).'
          );
        }
        drawPopgen();
      } else {
        caseBox.appendChild(h('div', {
          style: 'font-size:13.5px;font-weight:600;color:var(--fg);margin-bottom:6px',
          text: 'scripts/check.mjs + tools/harness.html — Headless Chromium & strict TeX gate',
        }));
        var checks = [
          ['DAG & schema gate (scripts/lib.mjs)', 'Verifies all 6,684 written + 6,890 planned items for cycle-free deps, valid IDs, and primary-source paper metadata (0 errors).'],
          ['Strict TeX escape detector (window.__texStrict)', 'Flags non-raw JS strings where "\\frac" became form-feed + "rac", "\\theta" became tab + "heta", or "\\nu" became newline + "u" before KaTeX parses.'],
          ['Multi-mode interaction sweep (check.mjs --modes)', 'Mounts every viz(v) in headless Chromium, clicks through every segmented button (.seg) and toggle (.ctl-toggle), and checks window.__vizErrors.'],
          ['Blank-canvas & affordance check (tools/harness.html)', 'Samples alpha > 0 on a 37-pixel stride across every visible canvas and verifies at least one interactive handle, control, or 3D stage plus a live readout.'],
        ];
        checks.forEach(function (c) {
          caseBox.appendChild(h('div', {
            style: 'padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--subtle);margin-bottom:7px;font-size:12.5px',
          }, [
            h('div', { style: 'font-weight:600;color:var(--fg);margin-bottom:2px', text: '✓ ' + c[0] }),
            h('div', { style: 'color:var(--fg-2);line-height:1.45', text: c[1] }),
          ]));
        });
      }
    }

    renderCovBox();
    renderCaseBox();
    themeListeners.push(function () {
      renderCovBox();
      renderCaseBox();
    });

    auditApi = {
      act: function (el) {
        var c = el.dataset.case || 'radon';
        caseTabs.set(c);
      },
    };
  }

  // =========================================================================
  // Bootstrap & Prose Action Links (<a class="act" href="#tv-...">)
  // =========================================================================
  var mapFig = document.getElementById('tv-map');
  var wbFig = document.getElementById('tv-workbench');
  var brFig = document.getElementById('tv-bridges');
  var auFig = document.getElementById('tv-audit');

  var firstFig = mapFig || wbFig || brFig || auFig;
  if (!firstFig) return;

  var katexReady = new Promise(function (resolve) {
    var done = false;
    var finish = function () { if (!done) { done = true; resolve(); } };
    ensureKatex(finish);
    setTimeout(finish, 1500);
  });

  Promise.all([
    fetch(firstFig.dataset.src).then(function (r) { return r.json(); }),
    katexReady,
  ]).then(function (res) {
    var data = res[0];
    if (mapFig) initMap(mapFig, data);
    if (wbFig) initWorkbench(wbFig, data);
    if (brFig) initBridges(brFig, data);
    if (auFig) initAudit(auFig, data);
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.act');
    if (!a) return;
    var hash = a.getAttribute('href');
    if (!hash || hash.slice(0, 4) !== '#tv-') return;
    e.preventDefault();
    var target = document.querySelector(hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (hash === '#tv-map' && mapApi) mapApi.act(a);
    else if (hash === '#tv-workbench' && workbenchApi) workbenchApi.act(a);
    else if (hash === '#tv-bridges' && bridgesApi) bridgesApi.act(a);
    else if (hash === '#tv-audit' && auditApi) auditApi.act(a);
  });
})();
