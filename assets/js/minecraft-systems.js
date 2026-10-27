/* Minecraft 26.3 systems figures. Algorithms and assumptions are documented
 * alongside the article. No Minecraft assets or decompiled source are shipped. */
(function (root) {
  'use strict';

  function paletteConfig(states, size) {
    size = size === undefined ? 4096 : size;
    if (!Number.isInteger(states) || states < 1 || states > 256) throw new RangeError('The local block palette has 1–256 states.');
    var bits = states === 1 ? 0 : Math.max(4, Math.ceil(Math.log2(states)));
    var entries = bits ? Math.floor(64 / bits) : 0;
    var words = bits ? Math.ceil(size / entries) : 0;
    return { states: states, bits: bits, entriesPerLong: entries, words: words, bytes: words * 8, paddingPerLong: bits ? 64 - entries * bits : 0 };
  }

  // Put a local palette ID in its slot. Entries never cross a long boundary.
  function packIndex(word, slot, value, bits) {
    if (!bits) return 0n;
    var shift = BigInt(slot * bits), mask = ((1n << BigInt(bits)) - 1n) << shift;
    return (BigInt(word) & ~mask) | ((BigInt(value) << shift) & mask);
  }

  function unpackIndex(word, slot, bits) {
    return bits ? Number((BigInt(word) >> BigInt(slot * bits)) & ((1n << BigInt(bits)) - 1n)) : 0;
  }

  // A deliberately two-dimensional, unit-dampening flood fill. The actual
  // engine also handles 3D shapes, storage boundaries, and decrease queues.
  function propagateLight(walls, width, height, sources, maxWave) {
    var values = new Uint8Array(width * height), distance = new Int16Array(width * height);
    distance.fill(-1);
    var queue = [], head = 0, waveLimit = maxWave === undefined ? Infinity : maxWave;
    sources.forEach(function (s) {
      var i = s.y * width + s.x;
      if (!walls[i] && s.level > values[i]) { values[i] = s.level; distance[i] = 0; queue.push([i, s.level, 0]); }
    });
    var frontier = new Set();
    while (head < queue.length) {
      var q = queue[head++], i = q[0], level = q[1], wave = q[2];
      if (wave >= waveLimit) { frontier.add(i); continue; }
      if (level <= 1 || level < values[i]) continue;
      var x = i % width, y = Math.floor(i / width);
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (p) {
        if (p[0] < 0 || p[0] >= width || p[1] < 0 || p[1] >= height) return;
        var n = p[1] * width + p[0];
        if (!walls[n] && values[n] < level - 1) {
          values[n] = level - 1; distance[n] = wave + 1; queue.push([n, level - 1, wave + 1]);
        }
      });
    }
    return { values: values, distance: distance, frontier: Array.from(frontier), processed: head, lit: values.reduce(function (n, v) { return n + (v > 0 ? 1 : 0); }, 0) };
  }

  function tickModel(workMs, fps, timeMs) {
    var interval = Math.max(50, workMs), tick = Math.floor(timeMs / interval);
    var alpha = (timeMs % interval) / interval;
    return { interval: interval, tps: 1000 / interval, frameMs: 1000 / fps, tick: tick, alpha: alpha,
      current: tick, previous: Math.max(0, tick - 1), interpolated: Math.max(0, tick - 1 + alpha) };
  }

  var api = { paletteConfig: paletteConfig, packIndex: packIndex, unpackIndex: unpackIndex, propagateLight: propagateLight, tickModel: tickModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MinecraftSystems = api;
  if (typeof document === 'undefined') return;

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, text, parent) {
    var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n); return n;
  }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n); return n;
  }
  function txt(parent, x, y, text, cls, anchor) {
    var n = svg('text', { x: x, y: y, 'class': cls || '', 'text-anchor': anchor || 'start' }, parent); n.textContent = text; return n;
  }
  function line(parent, x1, y1, x2, y2, cls, more) { return svg('line', Object.assign({ x1: x1, y1: y1, x2: x2, y2: y2, 'class': cls || '' }, more || {}), parent); }
  function rect(parent, x, y, w, h, cls, more) { return svg('rect', Object.assign({ x: x, y: y, width: w, height: h, 'class': cls || '' }, more || {}), parent); }
  function mount(id, title) {
    var fig = document.getElementById(id); if (!fig || fig.dataset.story === 'true' || fig.dataset.figureMounted || fig.closest('details:not([open])')) return null; fig.dataset.figureMounted = 'true';
    fig.classList.add('mc-systems');
    var body = el('div', 'mc-system-body'); fig.insertBefore(body, fig.querySelector('figcaption'));
    var head = el('div', 'mc-system-head', undefined, body); el('span', 'mc-eyebrow', title, head);
    var reset = el('button', 'btn', 'Reset', head); reset.type = 'button';
    fig.classList.add('ready'); return { fig: fig, body: body, reset: reset };
  }
  function slider(parent, label, min, max, value, step, change, unit) {
    var wrap = el('label', 'mc-system-slider', undefined, parent);
    el('span', '', label, wrap); var out = el('output', '', value + (unit || ''), wrap);
    var input = el('input', '', undefined, wrap); input.type = 'range'; input.min = min; input.max = max; input.step = step || 1; input.value = value; input.setAttribute('aria-label', label);
    input.addEventListener('input', function () { out.textContent = input.value + (unit || ''); change(+input.value); });
    return { input: input, output: out, set: function (v) { input.value = v; out.textContent = v + (unit || ''); } };
  }
  function tabs(parent, label, options, value, change) {
    var wrap = el('div', 'tabs', undefined, parent); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', label);
    var buttons = options.map(function (o) {
      var b = el('button', '', o[1], wrap); b.type = 'button'; b.setAttribute('aria-pressed', String(o[0] === value));
      b.addEventListener('click', function () { set(o[0]); change(o[0]); }); return [o[0], b];
    });
    function set(v) { buttons.forEach(function (b) { b[1].setAttribute('aria-pressed', String(b[0] === v)); }); }
    return { set: set };
  }
  function stats(parent, items) {
    var list = el('dl', 'mc-system-stats', undefined, parent);
    return items.map(function (item) { var cell = el('div', '', undefined, list); el('dt', '', item[0], cell); return el('dd', '', item[1], cell); });
  }
  function note(parent, text) { return el('p', 'mc-system-note', text, parent); }
  function plot(parent, w, h, label) {
    var n = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, 'class': 'mc-system-svg', role: 'img', 'aria-label': label }, parent); return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function paletteFigure() {
    var m = mount('mc-palette', 'A section, a palette, a word'); if (!m) return;
    var states = 16, index = 1057;
    var controls = el('div', 'mc-system-controls', undefined, m.body);
    var stateSlider = slider(controls, 'Unique block states', 1, 256, states, 1, function (v) { states = v; draw(); });
    var presets = tabs(controls, 'Palette boundary presets', [[1, 'One state'], [16, '16 states'], [17, '17 states'], [33, '33 states']], states, function (v) { states = v; stateSlider.set(v); draw(); });
    var columns = el('div', 'mc-palette-columns', undefined, m.body);
    var left = el('div', '', undefined, columns), right = el('div', '', undefined, columns);
    var grid = plot(left, 330, 326, 'A horizontal layer of a synthetic block section. Select a cell to inspect its packed palette ID.');
    grid.setAttribute('tabindex', '0');
    var coord = el('p', 'mc-palette-coordinate', '', left);
    var swatches = el('div', 'mc-palette-key', undefined, right);
    var fact = stats(right, [['Bits per index', '4'], ['Index payload', '2,048 B'], ['64-bit words', '256']]);
    var selected = el('div', 'mc-palette-selected', '', right);
    var wordLabel = el('p', 'mc-word-label', '', m.body), word = el('div', 'mc-packed-word', undefined, m.body);
    var wordHex = el('p', 'mc-word-hex', '', m.body);
    var indexSlider = slider(m.body, 'Block index · x fastest, then z, then y', 0, 4095, index, 1, function (v) { index = v; draw(); });
    note(m.body, 'Select a cell or scrub the index. This is the 4,096-entry block-state payload only; palette entries, NBT, and compression add other bytes.');
    function color(id) { return 'hsl(' + (205 + (id * 47) % 140) + ' ' + (24 + (id * 9) % 22) + '% ' + (43 + (id * 7) % 25) + '%)'; }
    function idAt(i) { return i % states; }
    function draw() {
      var cfg = paletteConfig(states), x = index & 15, z = (index >> 4) & 15, y = index >> 8, localID = idAt(index);
      presets.set(states); clear(grid); clear(swatches); clear(word);
      txt(grid, 18, 17, 'y = ' + y + ' · one 16 × 16 horizontal layer', 'mc-svg-small');
      for (var zz = 0; zz < 16; zz++) for (var xx = 0; xx < 16; xx++) {
        var i = (y << 8) | (zz << 4) | xx, active = i === index;
        rect(grid, 20 + xx * 18, 30 + zz * 18, 17, 17, active ? 'mc-palette-cell mc-selected' : 'mc-palette-cell', { fill: color(idAt(i)), 'data-index': i, rx: 1 });
      }
      txt(grid, 20, 325, 'x →', 'mc-svg-small'); txt(grid, 307, 325, 'z ↓', 'mc-svg-small', 'end');
      coord.textContent = '(' + x + ', ' + y + ', ' + z + ') → (' + y + ' × 256) + (' + z + ' × 16) + ' + x + ' = ' + index;
      var shown = Math.min(states, 16);
      el('p', 'mc-system-note', 'Local palette · IDs, not global block IDs', swatches);
      for (var p = 0; p < shown; p++) {
        var sw = el('span', 'mc-palette-swatch' + (p === localID ? ' active' : ''), undefined, swatches);
        var chip = el('i', '', undefined, sw); chip.style.backgroundColor = color(p); el('span', '', String(p), sw);
      }
      if (states > shown) el('span', 'mc-palette-more', '+ ' + (states - shown) + ' more', swatches);
      fact[0].textContent = cfg.bits; fact[1].textContent = cfg.bytes.toLocaleString() + ' B'; fact[2].textContent = cfg.words.toLocaleString();
      selected.textContent = 'Selected palette ID ' + localID + (cfg.bits ? ' = ' + localID.toString(2).padStart(cfg.bits, '0') + '₂' : ' · no index bits needed');
      if (!cfg.bits) {
        wordLabel.textContent = 'One state: every position resolves to palette entry 0.';
        wordHex.textContent = 'ZeroBitStorage · no 64-bit payload words';
        for (var b0 = 0; b0 < 64; b0++) el('span', 'mc-bit padding', '·', word);
        return;
      }
      var wordIndex = Math.floor(index / cfg.entriesPerLong), slot = index % cfg.entriesPerLong, packed = 0n;
      for (var k = 0; k < cfg.entriesPerLong; k++) {
        var blockI = wordIndex * cfg.entriesPerLong + k;
        if (blockI < 4096) packed = packIndex(packed, k, idAt(blockI), cfg.bits);
      }
      // High bit at left, low bit at right, exactly as in the hex integer.
      for (var bit = 63; bit >= 0; bit--) {
        var entry = Math.floor(bit / cfg.bits), isPadding = entry >= cfg.entriesPerLong;
        var activeBit = !isPadding && entry === slot;
        var cell = el('span', 'mc-bit' + (isPadding ? ' padding' : '') + (activeBit ? ' active' : ''), ((packed >> BigInt(bit)) & 1n).toString(), word);
        cell.title = 'Bit ' + bit + (isPadding ? ' · padding' : ' · slot ' + entry);
        if (!isPadding) cell.style.setProperty('--mc-bit-color', color(idAt(wordIndex * cfg.entriesPerLong + entry)));
      }
      wordLabel.textContent = 'Word ' + wordIndex + ' · selected slot ' + slot + ' · ' + cfg.entriesPerLong + ' indices × ' + cfg.bits + ' bits' + (cfg.paddingPerLong ? ' + ' + cfg.paddingPerLong + ' unused bits' : '');
      wordHex.textContent = '0x' + packed.toString(16).padStart(16, '0') + ' · high bit ← 63 … 0 → low bit';
    }
    grid.addEventListener('click', function (event) { var i = event.target.getAttribute('data-index'); if (i !== null) { index = +i; indexSlider.set(index); draw(); } });
    grid.addEventListener('keydown', function (event) {
      var delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16, PageUp: 256, PageDown: -256 }[event.key];
      if (delta) { event.preventDefault(); index = Math.max(0, Math.min(4095, index + delta)); indexSlider.set(index); draw(); }
    });
    m.reset.addEventListener('click', function () { states = 16; index = 1057; stateSlider.set(states); indexSlider.set(index); draw(); });
    draw();
  }

  function lightFigure() {
    var m = mount('mc-light', 'Light is a local dependency'); if (!m) return;
    var w = 24, h = 14, gate = false, remove = false, wave = 14, numbers = false;
    var controls = el('div', 'mc-system-controls', undefined, m.body);
    var gateTabs = tabs(controls, 'Doorway', [[false, 'Door closed'], [true, 'Door open']], gate, function (v) { gate = v; draw(); });
    var sourceTabs = tabs(controls, 'Light sources', [[false, 'Two torches'], [true, 'Remove left torch']], remove, function (v) { remove = v; draw(); });
    var check = el('label', 'check', undefined, controls), checkbox = el('input', '', undefined, check); checkbox.type = 'checkbox'; check.appendChild(document.createTextNode('Show levels'));
    checkbox.addEventListener('change', function () { numbers = checkbox.checked; draw(); });
    var board = plot(m.body, 720, 436, 'Two-dimensional cave. A closed doorway separates two light sources. Open the doorway, remove a torch, and step the propagation frontier.');
    var waveSlider = slider(m.body, 'Propagation wave', 0, 14, wave, 1, function (v) { wave = v; draw(); });
    var fact = stats(m.body, [['Lit air cells', ''], ['Frontier cells', ''], ['Source emission', '14']]);
    note(m.body, 'A 2D, unit-dampening model, recomputed from the surviving sources. Minecraft uses six directions in 3D and processes decreases before increases; this drawing does not reproduce that invalidation queue.');
    function map() {
      var a = new Uint8Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        a[y * w + x] = (x === 0 || x === w - 1 || y === 0 || y === h - 1 || (x === 12 && !(gate && (y === 6 || y === 7))) || (y === 3 && x > 3 && x < 9) || (y === 10 && x > 15 && x < 21)) ? 1 : 0;
      }
      return a;
    }
    function draw() {
      clear(board); var walls = map(), sources = [{ x: 19, y: 8, level: 14 }]; if (!remove) sources.push({ x: 5, y: 7, level: 14 });
      var compact = m.body.clientWidth < 500, cell = compact ? 15.5 : 28, ox = 24, oy = 24;
      var width = compact ? 420 : 720, height = oy + h * cell + 20;
      board.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      var result = propagateLight(walls, w, h, sources, wave), frontier = new Set(result.frontier);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = y * w + x, v = result.values[i], isWall = walls[i];
        rect(board, ox + x * cell, oy + y * cell, cell - 1, cell - 1, isWall ? 'mc-light-wall' : 'mc-light-cell', isWall ? {} : { fill: 'hsl(39 85% ' + (10 + v * 4.7) + '%)' });
        if (frontier.has(i)) rect(board, ox + x * cell + 2, oy + y * cell + 2, cell - 5, cell - 5, 'mc-light-frontier');
        if (numbers && !isWall) txt(board, ox + x * cell + (cell - 1) / 2, oy + y * cell + cell / 2 + 3, String(v), v > 6 ? 'mc-light-value bright' : 'mc-light-value', 'middle');
      }
      sources.forEach(function (s) {
        var cx = ox + s.x * cell + cell / 2 - .5, cy = oy + s.y * cell + cell / 2 - .5, scale = compact ? .65 : 1;
        svg('circle', { cx: cx, cy: cy, r: 8 * scale, 'class': 'mc-torch-ring' }, board);
        svg('path', { d: 'M' + (cx - 2 * scale) + ',' + (cy + 7 * scale) + ' l' + 4 * scale + ',' + -13 * scale, 'class': 'mc-torch-stick' }, board);
        svg('circle', { cx: cx + 2 * scale, cy: cy - 5 * scale, r: 3.5 * scale, 'class': 'mc-torch-flame' }, board);
      });
      if (remove) {
        var rx = ox + 5 * cell + cell / 2 - .5, ry = oy + 7 * cell + cell / 2 - .5, rr = compact ? 5 : 8;
        svg('circle', { cx: rx, cy: ry, r: rr, 'class': 'mc-removed-torch' }, board); line(board, rx - rr + 2, ry + rr - 2, rx + rr - 2, ry - rr + 2, 'mc-removed-torch');
      }
      var keyY = height - 2;
      txt(board, ox, keyY, 'Air', 'mc-svg-small'); rect(board, ox + 25, keyY - 10, 10, 10, 'mc-light-cell', { fill: 'hsl(39 85% 10%)' });
      txt(board, ox + 55, keyY, 'Light 14', 'mc-svg-small'); rect(board, ox + 105, keyY - 10, 10, 10, 'mc-light-cell', { fill: 'hsl(39 85% 75.8%)' });
      rect(board, width - 140, keyY - 10, 10, 10, 'mc-light-frontier'); txt(board, width - 122, keyY, 'Current frontier', 'mc-svg-small');
      fact[0].textContent = result.lit; fact[1].textContent = result.frontier.length;
    }
    m.reset.addEventListener('click', function () { gate = false; remove = false; wave = 14; numbers = false; checkbox.checked = false; gateTabs.set(false); sourceTabs.set(false); waveSlider.set(wave); draw(); }); window.addEventListener('resize', draw); draw();
  }

  function ticksFigure() {
    var m = mount('mc-ticks', 'Two clocks, one world'); if (!m) return;
    var work = 20, fps = 60, time = 225;
    var controls = el('div', 'mc-system-controls', undefined, m.body);
    var workSlider = slider(controls, 'Work per server tick', 10, 100, work, 1, function (v) { work = v; draw(); }, ' ms');
    var fpsSlider = slider(controls, 'Render rate', 30, 144, fps, 1, function (v) { fps = v; draw(); }, ' fps');
    var graph = plot(m.body, 720, 330, 'Separate server tick and render frame timelines, and a comparison of discrete simulation states with interpolated rendering.');
    var scrub = slider(m.body, 'Wall-clock cursor', 0, 500, time, 1, function (v) { time = v; draw(); }, ' ms');
    var fact = stats(m.body, [['Nominal / achieved', ''], ['Frame interval', ''], ['Interpolation α', '']]);
    note(m.body, 'An idealized constant-work model at the default tick rate, with a one-tick-delayed linear interpolation of a toy entity. No measurements; real scheduling, pauses, network arrivals, and per-entity interpolation differ.');
    function draw() {
      clear(graph); var compact = m.body.clientWidth < 500, model = tickModel(work, fps, time), x0 = compact ? 76 : 105, span = compact ? 322 : 570, sx = function (t) { return x0 + t / 500 * span; };
      graph.setAttribute('viewBox', '0 0 ' + (compact ? 420 : 720) + ' 330');
      txt(graph, 10, 35, 'SERVER', 'mc-svg-kicker'); txt(graph, 10, 53, 'game ticks', 'mc-svg-small');
      txt(graph, 10, 109, 'CLIENT', 'mc-svg-kicker'); txt(graph, 10, 127, 'render frames', 'mc-svg-small');
      line(graph, x0, 62, x0 + span, 62, 'mc-grid-line'); line(graph, x0, 136, x0 + span, 136, 'mc-grid-line');
      for (var t = 0, count = 0; t < 500; t += model.interval, count++) {
        rect(graph, sx(t), 27, Math.min(work, 500 - t) / 500 * span, 28, 'mc-tick-work', { rx: 3 });
        txt(graph, sx(t) + 6, 46, String(count), 'mc-tick-number');
      }
      for (var f = 0; f <= 500; f += model.frameMs) line(graph, sx(f), 100, sx(f), 127, 'mc-frame-mark');
      for (var tick = 0; tick <= 500; tick += 100) { line(graph, sx(tick), 146, sx(tick), 151, 'mc-grid-line'); txt(graph, sx(tick), 169, tick + (tick === 500 ? ' ms' : ''), 'mc-svg-small', 'middle'); }
      line(graph, sx(time), 17, sx(time), 145, 'mc-time-cursor');
      txt(graph, 10, 212, 'POSITION', 'mc-svg-kicker');
      var trackX = x0, trackY = 239, trackW = span, px = function (p) { return trackX + p / 10 * trackW; };
      line(graph, trackX, trackY, trackX + trackW, trackY, 'mc-motion-track');
      for (var n = 0; n <= 10; n++) { line(graph, px(n), trackY - 4, px(n), trackY + 4, 'mc-grid-line'); txt(graph, px(n), trackY + 23, String(n), 'mc-svg-small', 'middle'); }
      var current = model.current, previous = model.previous, interp = model.interpolated;
      line(graph, px(previous), trackY, px(current), trackY, 'mc-interpolation-span');
      rect(graph, px(current) - 5, trackY - 5, 10, 10, 'mc-discrete-position');
      svg('circle', { cx: px(interp), cy: trackY, r: 8, 'class': 'mc-interpolated-position' }, graph);
      svg('circle', { cx: px(previous), cy: trackY, r: 4, 'class': 'mc-previous-position' }, graph);
      txt(graph, trackX, 299, '○ rendered: ' + interp.toFixed(2), 'mc-svg-small');
      txt(graph, trackX + (compact ? 164 : 230), 299, '■ latest tick: ' + current, 'mc-svg-small');
      txt(graph, trackX, 322, compact ? (work > 50 ? 'Late ticks slow the game.' : 'Frames sample between states.') : (work > 50 ? 'The server is late. Extra frames cannot advance game time.' : 'Unused tick time is headroom. Extra frames sample between states.'), 'mc-svg-small');
      fact[0].textContent = '20 / ' + model.tps.toFixed(model.tps === 20 ? 0 : 1) + ' TPS';
      fact[1].textContent = model.frameMs.toFixed(1) + ' ms'; fact[2].textContent = model.alpha.toFixed(2);
    }
    m.reset.addEventListener('click', function () { work = 20; fps = 60; time = 225; workSlider.set(work); fpsSlider.set(fps); scrub.set(time); draw(); }); window.addEventListener('resize', draw); draw();
  }

  function networkFigure() {
    var m = mount('mc-network', 'One break, two copies of the world'); if (!m) return;
    var latency = 120, accepts = true, cursor = 60;
    var controls = el('div', 'mc-system-controls', undefined, m.body);
    var latencySlider = slider(controls, 'Round-trip transport time', 0, 400, latency, 10, function (v) { latency = v; draw(); }, ' ms');
    var validationTabs = tabs(controls, 'Server validation result', [[true, 'Accepted'], [false, 'Rejected']], accepts, function (v) { accepts = v; draw(); });
    var graph = plot(m.body, 720, 306, 'Illustrative client-server block-break timeline with a predicted edit, server validation, a state update and an acknowledgement.');
    var scrub = slider(m.body, 'Follow the action', 0, 100, cursor, 1, function (v) { cursor = v; draw(); }, '%');
    var cards = el('div', 'mc-network-cards', undefined, m.body);
    var clientCard = el('div', '', undefined, cards), serverCard = el('div', '', undefined, cards), renderCard = el('div', '', undefined, cards);
    var textClient = stats(clientCard, [['Client block', '']])[0], textServer = stats(serverCard, [['Server block', '']])[0], textRender = stats(renderCard, [['Client prediction', '']])[0];
    note(m.body, 'Starts when a local break completes. Timing is illustrative: 30 ms of server scheduling, then 10 ms of message dispatch. State updates and sequence acknowledgements are separate messages; an acknowledgement is not a block-state payload.');
    function draw() {
      clear(graph); var compact = m.body.clientWidth < 500, out = latency / 2, validate = out + 30, dispatch = validate + 10, received = dispatch + latency / 2, duration = Math.max(220, received + 100), now = cursor / 100 * duration;
      var left = compact ? 69 : 112, width = compact ? 328 : 558, sx = function (t) { return left + t / duration * width; };
      graph.setAttribute('viewBox', '0 0 ' + (compact ? 420 : 720) + ' 306');
      var clientY = 51, serverY = 155, renderY = 250;
      var defs = svg('defs', {}, graph), marker = svg('marker', { id: 'mc-network-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
      svg('path', { d: 'M0,0 L10,5 L0,10 Z', 'class': 'mc-arrow-head' }, marker);
      [['CLIENT', clientY], ['SERVER', serverY], ['RENDER', renderY]].forEach(function (a) { txt(graph, 5, a[1] + 4, a[0], 'mc-svg-kicker'); line(graph, left, a[1], left + width, a[1], 'mc-network-lane'); });
      rect(graph, left, clientY - 11, sx(received) - left, 22, 'mc-prediction-band', { rx: 4 });
      rect(graph, sx(validate), serverY - 11, left + width - sx(validate), 22, accepts ? 'mc-authority-band' : 'mc-rejection-band', { rx: 4 });
      function arrow(t1, y1, t2, y2, label, above) {
        line(graph, sx(t1), y1, sx(t2), y2, now >= t2 ? 'mc-packet-line arrived' : 'mc-packet-line', { 'marker-end': 'url(#mc-network-arrow)' });
        txt(graph, (sx(t1) + sx(t2)) / 2 + (above ? -6 : 6), (y1 + y2) / 2 + (above ? -10 : 14), label, 'mc-packet-label', above ? 'end' : 'start');
        if (now >= t1 && now < t2) { var f = (now - t1) / (t2 - t1); svg('circle', { cx: sx(t1) + (sx(t2) - sx(t1)) * f, cy: y1 + (y2 - y1) * f, r: 5, 'class': 'mc-packet-dot' }, graph); }
      }
      arrow(0, clientY + 13, out, serverY - 13, compact ? 'action' : 'action + sequence', false);
      line(graph, sx(out), serverY - 18, sx(validate), serverY - 18, 'mc-server-wait');
      arrow(dispatch, serverY - 10, received, clientY + 10, compact ? 'state' : 'state update', true);
      // Offset this arrow so the acknowledgement stays visibly independent.
      arrow(dispatch, serverY + 10, received, clientY + 30, compact ? 'ack' : 'sequence ack', false);
      line(graph, sx(0), clientY + 2, sx(12), renderY - 8, 'mc-render-link');
      svg('circle', { cx: sx(12), cy: renderY, r: 5, 'class': 'mc-predicted-dot' }, graph);
      if (!accepts) { line(graph, sx(received), clientY - 2, sx(received + 16), renderY - 8, 'mc-render-link'); svg('circle', { cx: sx(received + 16), cy: renderY, r: 5, 'class': 'mc-rejected-dot' }, graph); }
      txt(graph, sx(0), 22, 'Predict air', 'mc-svg-small');
      txt(graph, sx(validate), 191, accepts ? 'Validate → air' : compact ? 'Keep solid' : 'Validate → keep solid', 'mc-svg-small', 'middle');
      txt(graph, sx(received), 22, accepts ? 'Reconcile' : 'Restore block', 'mc-svg-small', 'middle');
      txt(graph, left, renderY + 28, 'Predicted mesh', 'mc-svg-small');
      if (!accepts) txt(graph, sx(received + 16), renderY + 28, 'Corrected mesh', 'mc-svg-small', 'middle');
      line(graph, sx(now), 31, sx(now), 266, 'mc-time-cursor');
      txt(graph, sx(now), 300, Math.round(now) + ' ms', 'mc-svg-small', 'middle');
      textClient.textContent = !accepts && now >= received ? 'Solid · corrected' : 'Air · ' + (now < received ? 'predicted' : 'confirmed');
      textServer.textContent = accepts && now >= validate ? 'Air · authoritative' : 'Solid · authoritative';
      textRender.textContent = now < received ? 'Pending sequence' : 'State + ack received';
    }
    m.reset.addEventListener('click', function () { latency = 120; accepts = true; cursor = 60; latencySlider.set(latency); validationTabs.set(accepts); scrub.set(cursor); draw(); }); window.addEventListener('resize', draw); draw();
  }

  function init() { paletteFigure(); lightFigure(); ticksFigure(); networkFigure(); }
  document.addEventListener('minecraft:notebook-open', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
