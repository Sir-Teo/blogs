// Figures for "Rendering twenty-two hours of math from code".
//
// Driven by /assets/data/explainer-videos-demo.json, explainer-barcodes.webp,
// and explainer-frames.webp, generated from the explainer-videos repository by
// _tools/explainer-videos-demo/build_data.py.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var LINK_ICONS_URL = new URL('../icons.svg', document.currentScript.src).href;
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICONS = { play: 'M5 3.5v9l7-4.5z', pause: 'M5 3.5v9M11 3.5v9' };

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (attrs[k] === undefined || attrs[k] === null) continue;
      if (k === 'font') n.style.font = attrs[k];
      else n.setAttribute(k, attrs[k]);
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
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c !== null && c !== undefined) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function mount(fig) {
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
  function iconButton(icon, label, onClick) {
    var b = h('button', { class: 'btn icon', type: 'button', 'aria-label': label, title: label, onclick: onClick });
    var s = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, b);
    var p = svg('path', { d: ICONS[icon] }, s);
    b.setIcon = function (name) { p.setAttribute('d', ICONS[name]); };
    return b;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtPrecise(sec) {
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60), s = (sec % 60).toFixed(1);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Shared image loaders for the barcode and keyframe atlases
  var barcodeImg = null, framesImg = null;
  var barcodeListeners = [], framesListeners = [];
  function loadAtlases(baseUrl) {
    var dir = baseUrl.replace(/\/[^/]+$/, '');
    if (!barcodeImg) {
      barcodeImg = new Image();
      barcodeImg.onload = function () { barcodeListeners.forEach(function (fn) { fn(); }); };
      barcodeImg.src = dir + '/explainer-barcodes.webp';
    }
    if (!framesImg) {
      framesImg = new Image();
      framesImg.onload = function () { framesListeners.forEach(function (fn) { fn(); }); };
      framesImg.src = dir + '/explainer-frames.webp';
    }
  }
  function onBarcodesReady(fn) {
    if (barcodeImg && barcodeImg.complete && barcodeImg.naturalWidth) fn();
    else barcodeListeners.push(fn);
  }
  function onFramesReady(fn) {
    if (framesImg && framesImg.complete && framesImg.naturalWidth) fn();
    else framesListeners.push(fn);
  }

  // =========================================================================
  // Figure 2: 24-Film Frame-Barcode Atlas (#ev-atlas)
  // =========================================================================
  function initAtlas(fig, data) {
    var body = mount(fig);
    var films = data.films;
    var maxDur = Math.max.apply(null, films.map(function (f) { return f.duration; }));
    var filterMode = 'all';
    var propWidth = true;
    var activeIdx = 3; // Open on Riemann Hypothesis (striking domain coloring & prime staircase)
    var activeSample = 2;
    var activeTime = films[activeIdx].samples[activeSample][0];

    var filterTabs = tabs('Series filter', [
      ['all', 'All 24 (16.4 h)'],
      ['standalone', 'Standalone (13)'],
      ['series', 'Series (11)'],
    ], filterMode, function (v) {
      filterMode = v;
      renderRows();
    });

    var widthCheck = h('label', { class: 'check' }, [
      h('input', {
        type: 'checkbox',
        checked: 'checked',
        onchange: function (e) { propWidth = e.target.checked; updateBarWidths(); }
      }),
      'Scale by length',
    ]);

    var summaryNum = h('span', {
      class: 'fig-num',
      text: data.totals.films + ' films · ' + data.totals.scenes + ' scenes · ' + data.totals.cues.toLocaleString() + ' cues'
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      filterTabs.el,
      widthCheck,
      h('span', { class: 'grow' }),
      summaryNum,
    ]));

    // Top inspection stage
    var screenCanvas = h('canvas', { class: 'atlas-screen', width: 384, height: 216 });
    var badgeEl = h('span', { class: 'atlas-badge' });
    var timeEl = h('span', { class: 'atlas-time' });
    var samplesBar = h('div', { class: 'atlas-samples', role: 'group', 'aria-label': 'Sampled keyframes' });
    var cueEl = h('div', { class: 'atlas-cue' });

    var screenCol = h('div', {}, [
      h('div', { class: 'atlas-screen-wrap' }, [
        screenCanvas,
        h('div', { class: 'atlas-hud' }, [badgeEl, timeEl]),
      ]),
      samplesBar,
      cueEl,
    ]);

    var titleEl = h('span', { class: 'atlas-title' });
    var watchEl = h('a', {
      class: 'atlas-watch', target: '_blank', rel: 'noopener', hreflang: 'en',
      title: 'Watch the English version on YouTube'
    }, [
      'YouTube (EN)', h('span', { 'aria-hidden': 'true', text: ' ↗' })
    ]);
    var watchIcon = svg('svg', {
      class: 'link-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false'
    });
    svg('use', { href: LINK_ICONS_URL + '#youtube' }, watchIcon);
    watchEl.insertBefore(watchIcon, watchEl.firstChild);
    var kpiEl = h('div', { class: 'atlas-kpis' });
    var sparkSvg = svg('svg', { class: 'atlas-spark', viewBox: '0 0 360 88', role: 'img', 'aria-label': 'Active pixel coverage across the film' });
    var chipsEl = h('div', { class: 'atlas-chips' });

    var metaCol = h('div', { class: 'atlas-meta' }, [
      h('div', { class: 'atlas-head' }, [titleEl, watchEl]),
      kpiEl,
      sparkSvg,
      chipsEl,
    ]);

    body.appendChild(h('div', { class: 'atlas-stage' }, [screenCol, metaCol]));

    var listWrap = h('div', { class: 'atlas-list' });
    body.appendChild(listWrap);

    var rowEls = [];

    function drawSingleBar(idx) {
      var r = rowEls[idx];
      if (!r) return;
      var f = films[idx];
      var c = r.canvas;
      var ctx = c.getContext('2d');
      var W = c.width, H = c.height;
      ctx.fillStyle = '#0e1117';
      ctx.fillRect(0, 0, W, H);
      if (barcodeImg && barcodeImg.complete && barcodeImg.naturalWidth) {
        ctx.drawImage(barcodeImg, 0, idx * 24, 300, 24, 0, 0, W, H);
      }
      // Subtle chapter ticks along top & bottom
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
      f.chapters.forEach(function (ch, ci) {
        if (ci === 0) return;
        var x = Math.round(ch[0] / f.duration * W);
        ctx.fillRect(x, 0, 1, 3);
        ctx.fillRect(x, H - 3, 1, 3);
      });
      // Playhead on active film
      if (idx === activeIdx) {
        var px = clamp(Math.round(activeTime / f.duration * W), 1, W - 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - 1, 0, 2, H);
      }
    }

    function updateBarWidths() {
      rowEls.forEach(function (r, idx) {
        var f = films[idx];
        var pct = propWidth ? Math.max(18, f.duration / maxDur * 100) : 100;
        r.canvas.style.width = pct.toFixed(1) + '%';
      });
    }

    function buildRows() {
      clear(listWrap);
      rowEls = films.map(function (f, idx) {
        var c = h('canvas', { class: 'atlas-bar', width: 300, height: 20 });
        var durTxt = fmtClock(f.duration) + (f.zh_duration ? ' · 中' : '');
        var row = h('div', { class: 'atlas-row' + (idx === activeIdx ? ' on' : '') }, [
          h('span', { class: 'name', text: f.short }),
          h('div', { class: 'atlas-bar-wrap' }, [c]),
          h('span', { class: 'dur', text: durTxt }),
        ]);

        function scrubFromEvent(e) {
          var rect = c.getBoundingClientRect();
          var u = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 0.999);
          selectFilmTime(idx, u * f.duration);
        }
        var dragging = false;
        c.addEventListener('pointerdown', function (e) {
          dragging = true;
          c.setPointerCapture(e.pointerId);
          scrubFromEvent(e);
        });
        c.addEventListener('pointermove', function (e) {
          if (dragging) scrubFromEvent(e);
        });
        c.addEventListener('pointerup', function () { dragging = false; });
        row.addEventListener('click', function (e) {
          if (e.target === c) return;
          selectFilmSample(idx, 2);
        });

        listWrap.appendChild(row);
        return { row: row, canvas: c };
      });
      updateBarWidths();
      rowEls.forEach(function (_, idx) { drawSingleBar(idx); });
    }

    function renderRows() {
      rowEls.forEach(function (r, idx) {
        var f = films[idx];
        var show = filterMode === 'all' || f.group === filterMode;
        r.row.style.display = show ? '' : 'none';
      });
    }

    function drawStage() {
      var f = films[activeIdx];
      // Nearest sample frame in f.samples
      var bestS = 0, bestDist = Infinity;
      f.samples.forEach(function (s, si) {
        var d = Math.abs(s[0] - activeTime);
        if (d < bestDist) { bestDist = d; bestS = si; }
      });
      activeSample = bestS;
      var samp = f.samples[bestS];

      // Draw frame from explainer-frames.webp (row = activeIdx, col = bestS)
      var ctx = screenCanvas.getContext('2d');
      ctx.fillStyle = '#0e1117';
      ctx.fillRect(0, 0, 384, 216);
      if (framesImg && framesImg.complete && framesImg.naturalWidth) {
        ctx.drawImage(framesImg, bestS * 384, activeIdx * 216, 384, 216, 0, 0, 384, 216);
      }

      // Chapter at activeTime
      var chTitle = f.chapters.length ? f.chapters[0][1] : f.short;
      for (var i = 0; i < f.chapters.length; i++) {
        if (f.chapters[i][0] <= activeTime + 0.5) {
          chTitle = f.chapters[i][1];
        }
      }
      badgeEl.textContent = chTitle;
      timeEl.textContent = fmtClock(activeTime) + ' / ' + fmtClock(f.duration);
      cueEl.innerHTML = '<b>Spoken (' + fmtClock(samp[0]) + '):</b> “' + samp[2] + '”';

      // 8-keyframe quick-jump pills
      clear(samplesBar);
      f.samples.forEach(function (s, si) {
        var btn = h('button', {
          type: 'button',
          class: 'atlas-samp-btn' + (si === bestS ? ' on' : ''),
          title: s[1] + ' (' + fmtClock(s[0]) + ')',
          text: fmtClock(s[0]),
          onclick: function () { selectFilmSample(activeIdx, si); }
        });
        samplesBar.appendChild(btn);
      });

      titleEl.textContent = f.title;
      if (f.url) {
        watchEl.href = f.url;
        watchEl.setAttribute('aria-label', 'Watch ' + f.title + ' in English on YouTube');
        watchEl.style.display = '';
      } else {
        watchEl.style.display = 'none';
      }

      var binIdx = clamp(Math.floor(activeTime / f.duration * f.coverage.length), 0, f.coverage.length - 1);
      var curCov = f.coverage[binIdx];
      kpiEl.innerHTML =
        '<span><b>' + (f.duration / 60).toFixed(0) + ' min</b>' + (f.zh_duration ? ' (EN & 中文)' : '') + '</span>' +
        '<span><b>' + f.scenes + '</b> scenes</span>' +
        '<span>Active pixels now: <b>' + curCov.toFixed(1) + '%</b> (mean <b>' + f.mean_cov.toFixed(1) + '%</b>)</span>';

      // Draw coverage sparkline
      clear(sparkSvg);
      var W = 360, H = 88, padL = 28, padR = 8, padT = 14, padB = 18;
      var pw = W - padL - padR, ph = H - padT - padB;
      var maxY = Math.max(16, Math.ceil(Math.max.apply(null, f.coverage) * 1.1));
      function xOf(u) { return padL + u * pw; }
      function yOf(v) { return padT + ph - clamp(v / maxY, 0, 1) * ph; }

      svg('text', { x: padL, y: 10 }, sparkSvg).textContent = 'Screen pixels drawn (% ≠ #0E1117) across chapters';
      [0, Math.round(maxY / 2), maxY].forEach(function (yv) {
        var y = yOf(yv);
        svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }, sparkSvg);
        svg('text', { x: padL - 4, y: y + 3, 'text-anchor': 'end' }, sparkSvg).textContent = yv + '%';
      });

      // Chapter ticks
      f.chapters.forEach(function (ch) {
        var cx = xOf(ch[0] / f.duration);
        svg('line', { class: 'chap-tick', x1: cx, x2: cx, y1: padT, y2: padT + ph + 3 }, sparkSvg);
      });

      // Area & line
      var pts = f.coverage.map(function (v, i) {
        var u = (i + 0.5) / f.coverage.length;
        return xOf(u).toFixed(1) + ',' + yOf(v).toFixed(1);
      });
      var areaD = 'M' + xOf(0).toFixed(1) + ',' + yOf(0).toFixed(1) + ' L' + pts.join(' L') + ' L' + xOf(1).toFixed(1) + ',' + yOf(0).toFixed(1) + ' Z';
      svg('path', { class: 'area', d: areaD }, sparkSvg);
      svg('path', { class: 'line', d: 'M' + pts.join(' L') }, sparkSvg);

      // 8 sample dots along the curve
      f.samples.forEach(function (s, si) {
        var sx = xOf(s[0] / f.duration);
        var bi = clamp(Math.floor(s[0] / f.duration * f.coverage.length), 0, f.coverage.length - 1);
        var sy = yOf(f.coverage[bi]);
        svg('circle', {
          cx: sx, cy: sy, r: si === bestS ? 3.6 : 2.2,
          fill: si === bestS ? 'var(--fg)' : 'var(--accent)',
          stroke: 'var(--bg)', 'stroke-width': 1
        }, sparkSvg);
      });

      // Playhead cursor
      var curX = xOf(clamp(activeTime / f.duration, 0, 1));
      svg('line', { class: 'cursor', x1: curX, x2: curX, y1: padT, y2: padT + ph }, sparkSvg);
      svg('text', { x: padL, y: H - 3 }, sparkSvg).textContent = '0:00';
      svg('text', { x: W - padR, y: H - 3, 'text-anchor': 'end' }, sparkSvg).textContent = fmtClock(f.duration);

      // Semantic palette chips
      clear(chipsEl);
      f.palette.forEach(function (p) {
        var chip = h('span', { class: 'atlas-chip', title: 'C.' + p[0] + ' (' + p[1] + ' uses in this film)' }, [
          h('i', { style: 'background:' + p[2] }),
          'C.' + p[0] + ' ×' + p[1],
        ]);
        chipsEl.appendChild(chip);
      });
    }

    // Sparkline scrubbing
    var sparkDrag = false;
    function scrubSpark(e) {
      var rect = sparkSvg.getBoundingClientRect();
      var u = clamp(((e.clientX - rect.left) / rect.width * 360 - 28) / (360 - 36), 0, 0.999);
      selectFilmTime(activeIdx, u * films[activeIdx].duration);
    }
    sparkSvg.addEventListener('pointerdown', function (e) {
      sparkDrag = true;
      sparkSvg.setPointerCapture(e.pointerId);
      scrubSpark(e);
    });
    sparkSvg.addEventListener('pointermove', function (e) { if (sparkDrag) scrubSpark(e); });
    sparkSvg.addEventListener('pointerup', function () { sparkDrag = false; });

    function selectFilmTime(idx, t) {
      var prev = activeIdx;
      activeIdx = idx;
      activeTime = clamp(t, 0, films[idx].duration);
      if (prev !== idx) {
        if (rowEls[prev]) rowEls[prev].row.classList.remove('on');
        if (rowEls[idx]) rowEls[idx].row.classList.add('on');
        drawSingleBar(prev);
      }
      drawSingleBar(idx);
      drawStage();
    }

    function selectFilmSample(idx, sIdx) {
      var f = films[idx];
      var s = f.samples[clamp(sIdx, 0, f.samples.length - 1)];
      selectFilmTime(idx, s[0]);
    }

    buildRows();
    drawStage();
    onBarcodesReady(function () { rowEls.forEach(function (_, idx) { drawSingleBar(idx); }); });
    onFramesReady(drawStage);

    // Prose action links: <a class="act" href="#ev-atlas" data-film="riemann" data-sample="2">
    document.querySelectorAll('a.act[href="#ev-atlas"]').forEach(function (a) {
      a.addEventListener('click', function () {
        var fid = a.getAttribute('data-film');
        var sIdx = Number(a.getAttribute('data-sample') || 2);
        var idx = films.findIndex(function (f) { return f.id === fid; });
        if (idx >= 0) {
          if (filterMode !== 'all' && films[idx].group !== filterMode) {
            filterMode = 'all';
            filterTabs.set('all', true);
            renderRows();
          }
          selectFilmSample(idx, sIdx);
        }
      });
    });
  }

  // =========================================================================
  // Figure 3: Bilingual Scene Conductor & Live Manim Stage (#ev-score)
  // =========================================================================
  function initScore(fig, data) {
    var body = mount(fig);
    var score = data.score;
    var segs = score.segments; // [en_start, en_dur, zh_start, zh_dur, kind, beat_idx]
    var mdata = score.math;
    var langMode = 'en';
    var BEAT_SHOWCASE_EN = { 1: 35.0, 2: 79.0, 3: 104.0, 4: 136.0 };
    var tCur = BEAT_SHOWCASE_EN[1]; // Open on complete Beat 1 cobweb & convergence table
    var playing = false;
    var rafId = null, lastTs = 0;

    var playBtn = iconButton('play', 'Play / pause scene', function () {
      if (playing) stopPlay(); else startPlay();
    });

    var beatTabs = tabs('Scene beat', [
      ['1', '1 · Cobweb'],
      ['2', '2 · Banach'],
      ['3', '3 · √2 hole'],
      ['4', '4 · Newton'],
    ], '1', function (v) {
      stopPlay();
      var baseT = BEAT_SHOWCASE_EN[Number(v)] || (score.beats[Number(v)].en_t + 12.0);
      tCur = langMode === 'en' ? baseT : mapTimeEnToZh(baseT);
      updateBeatTabHighlight();
      renderScore();
    });

    var langTabs = tabs('Narration language', [
      ['en', 'EN 2:25'],
      ['zh', '中文 2:31'],
    ], langMode, function (v) {
      if (v === langMode) return;
      tCur = v === 'zh' ? mapTimeEnToZh(tCur) : mapTimeZhToEn(tCur);
      langMode = v;
      renderScore();
    });

    var readoutEl = h('span', { class: 'fig-num' });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      playBtn,
      beatTabs.el,
      langTabs.el,
      h('span', { class: 'grow' }),
      readoutEl,
    ]));

    // 16:9 Live Vector Manim Canvas + 4K Reference PiP
    var stageSvg = svg('svg', {
      class: 'score-canvas',
      viewBox: '0 0 760 428',
      role: 'img',
      'aria-label': 'Live Manim vector canvas for Contraction (Analysis, Built Part 4)'
    });
    var pipCanvas = h('canvas', { width: 384, height: 216 });
    var pipLabel = h('span', { text: '4K render' });
    var pipWrap = h('div', { class: 'score-pip', title: 'Actual 2160p60 frame rendered by Manim' }, [pipCanvas, pipLabel]);

    body.appendChild(h('div', { class: 'score-stage' }, [stageSvg, pipWrap]));

    // Karaoke word-synced subtitle bar
    var karaokeEl = h('div', { class: 'score-karaoke' });
    body.appendChild(karaokeEl);

    // Dual-language 82-segment timeline
    var tlSvg = svg('svg', {
      class: 'score-timeline',
      viewBox: '0 0 760 112',
      role: 'img',
      'aria-label': '82 partial-movie segments in English (144.8 s) and Chinese (151.3 s)'
    });
    body.appendChild(tlSvg);

    var legendEl = h('div', { class: 'legend', style: 'margin-top:6px' }, [
      h('span', {}, [h('i', { style: 'background:var(--play-col)' }), 'self.play() · 57 segments (58.6 s in EN and 58.6 s in 中文 — identical)']),
      h('span', {}, [h('i', { style: 'background:var(--wait-col)' }), 'vo.wait_until() holds · 25 segments (86.2 s in EN vs. 92.7 s in 中文 — stretches to fit speech)']),
    ]);
    body.appendChild(legendEl);

    // Map time between EN and ZH segment-by-segment
    function mapTimeEnToZh(te) {
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (te <= s[0] + s[1] || i === segs.length - 1) {
          var u = s[1] > 0 ? clamp((te - s[0]) / s[1], 0, 1) : 0;
          return s[2] + u * s[3];
        }
      }
      return 0;
    }
    function mapTimeZhToEn(tz) {
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (tz <= s[2] + s[3] || i === segs.length - 1) {
          var u = s[3] > 0 ? clamp((tz - s[2]) / s[3], 0, 1) : 0;
          return s[0] + u * s[1];
        }
      }
      return 0;
    }
    function currentSegIndex(t, lang) {
      var startCol = lang === 'en' ? 0 : 2;
      var durCol = lang === 'en' ? 1 : 3;
      for (var i = 0; i < segs.length; i++) {
        if (t <= segs[i][startCol] + segs[i][durCol] || i === segs.length - 1) return i;
      }
      return 0;
    }

    function updateBeatTabHighlight() {
      var si = currentSegIndex(tCur, langMode);
      var bIdx = Math.max(1, segs[si][5]);
      beatTabs.set(String(bIdx), true);
    }

    // Draw static segment structure on tlSvg + dynamic playhead
    var playheadGroup = null;
    function buildTimelineStatic() {
      clear(tlSvg);
      var W = 760, padL = 58, padR = 14;
      var maxT = Math.max(score.en_duration, score.zh_duration);
      var tw = W - padL - padR;
      function xOf(t) { return padL + (t / maxT) * tw; }

      var yEn = 18, hBar = 18, yZh = 66;
      svg('text', { class: 'tl-lbl', x: 4, y: yEn + 13 }, tlSvg).textContent = 'EN 2:25';
      svg('text', { class: 'tl-lbl', x: 4, y: yZh + 13 }, tlSvg).textContent = '中文 2:31';

      // Connecting ribbons + segment blocks
      var linksG = svg('g', {}, tlSvg);
      var barsG = svg('g', {}, tlSvg);

      segs.forEach(function (s, idx) {
        var xe0 = xOf(s[0]), xe1 = xOf(s[0] + s[1]);
        var xz0 = xOf(s[2]), xz1 = xOf(s[2] + s[3]);
        var isPlay = s[4] === 'play';
        var dLink = 'M' + xe0.toFixed(1) + ',' + (yEn + hBar) +
                    ' L' + xe1.toFixed(1) + ',' + (yEn + hBar) +
                    ' L' + xz1.toFixed(1) + ',' + yZh +
                    ' L' + xz0.toFixed(1) + ',' + yZh + ' Z';
        svg('path', { class: isPlay ? 'link-play' : 'link-wait', d: dLink }, linksG);

        var re = svg('rect', {
          class: isPlay ? 'seg-play' : 'seg-wait',
          x: xe0.toFixed(1), y: yEn,
          width: Math.max(0.8, xe1 - xe0).toFixed(1), height: hBar, rx: 1.5
        }, barsG);
        svg('title', {}, re).textContent = 'Seg #' + idx + ' (' + s[4] + '): EN ' + s[1].toFixed(2) + 's / ZH ' + s[3].toFixed(2) + 's';

        var rz = svg('rect', {
          class: isPlay ? 'seg-play' : 'seg-wait',
          x: xz0.toFixed(1), y: yZh,
          width: Math.max(0.8, xz1 - xz0).toFixed(1), height: hBar, rx: 1.5
        }, barsG);
        svg('title', {}, rz).textContent = 'Seg #' + idx + ' (' + s[4] + '): ZH ' + s[3].toFixed(2) + 's / EN ' + s[1].toFixed(2) + 's';
      });

      // Bookmark pins on EN and ZH tracks
      score.en_lines.forEach(function (ln) {
        Object.keys(ln.marks).forEach(function (mk) {
          var tm = ln.marks[mk][1];
          var xm = xOf(tm);
          svg('line', { class: 'bm-pin', x1: xm, x2: xm, y1: yEn - 7, y2: yEn + hBar }, tlSvg);
          svg('circle', { class: 'bm-dot', cx: xm, cy: yEn - 7, r: 2.2 }, tlSvg);
        });
      });
      score.zh_lines.forEach(function (ln) {
        Object.keys(ln.marks).forEach(function (mk) {
          var tm = ln.marks[mk][1];
          var xm = xOf(tm);
          svg('line', { class: 'bm-pin', x1: xm, x2: xm, y1: yZh, y2: yZh + hBar + 7 }, tlSvg);
          svg('circle', { class: 'bm-dot', cx: xm, cy: yZh + hBar + 7, r: 2.2 }, tlSvg);
        });
      });

      // Time axis ticks
      [0, 30, 60, 90, 120, 150].forEach(function (sec) {
        var tx = xOf(sec);
        svg('text', { x: tx, y: 106, 'text-anchor': 'middle' }, tlSvg).textContent = fmtClock(sec);
      });

      playheadGroup = svg('g', {}, tlSvg);
    }

    // Draw the live Manim mathematical scene at English-equivalent timestamp te
    function drawManimStage(te) {
      clear(stageSvg);
      var W = 760, H = 428;
      svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#0e1117' }, stageSvg);

      var si = currentSegIndex(te, 'en');
      var beat = segs[si][5];

      // Draw 4K reference PiP for beats 1..4 (stored at row 24, cols 0..3 of explainer-frames.webp)
      var pipIdx = clamp(beat - 1, 0, 3);
      var pctx = pipCanvas.getContext('2d');
      pctx.fillStyle = '#0e1117';
      pctx.fillRect(0, 0, 384, 216);
      if (framesImg && framesImg.complete && framesImg.naturalWidth) {
        pctx.drawImage(framesImg, pipIdx * 384, 24 * 216, 384, 216, 0, 0, 384, 216);
      }
      pipLabel.textContent = '4K master · Beat ' + (pipIdx + 1);

      if (beat === 0) {
        // Chapter card (0..4.02 s)
        svg('text', { x: W / 2, y: 165, fill: '#f7d154', 'text-anchor': 'middle', font: '600 15px var(--mono)' }, stageSvg).textContent = 'PART 4 · CHAPTER 4';
        svg('text', { x: W / 2, y: 205, fill: '#ffffff', 'text-anchor': 'middle', font: '650 28px var(--sans)' }, stageSvg).textContent = 'The contraction principle';
        svg('text', { x: W / 2, y: 240, fill: '#9aa4b2', 'text-anchor': 'middle', font: '400 17px var(--sans)' }, stageSvg).textContent = 'When does iterating a map find a solution?';
        return;
      }

      if (beat === 1) {
        // Beat 1: Cobweb cos x = x (4.02..39.42 s)
        // Bookmarks in line 1: a=5.21s, b=11.09s, c=17.48s, d=33.89s
        svg('text', { x: W / 2, y: 32, fill: '#ffffff', 'text-anchor': 'middle', font: '600 18px var(--sans)' }, stageSvg)
          .textContent = 'Solve  cos x = x  by iterating:   xₙ₊₁ = cos xₙ';
        if (te >= 17.4) {
          svg('text', { x: W / 2, y: 54, fill: '#9aa4b2', 'text-anchor': 'middle', font: '400 13.5px var(--mono)' }, stageSvg)
            .textContent = "on [0, 1],  |cos' x| = |sin x| ≤ sin 1 = 0.8415 = c :  every distance shrinks by c";
        }

        // Left: square axes [0, 1.1] x [0, 1.1]
        var axX = 64, axY = 82, axS = 280;
        function cx(v) { return axX + (v / 1.1) * axS; }
        function cy(v) { return axY + axS - (v / 1.1) * axS; }

        svg('line', { x1: axX, x2: axX + axS, y1: axY + axS, y2: axY + axS, stroke: '#6b7280', 'stroke-width': 1.4 }, stageSvg);
        svg('line', { x1: axX, x2: axX, y1: axY, y2: axY + axS, stroke: '#6b7280', 'stroke-width': 1.4 }, stageSvg);
        [0, 0.5, 1.0].forEach(function (tv) {
          svg('text', { x: cx(tv), y: axY + axS + 16, fill: '#9aa4b2', 'text-anchor': 'middle', font: '11px var(--mono)' }, stageSvg).textContent = tv.toFixed(1);
          if (tv > 0) svg('text', { x: axX - 8, y: cy(tv) + 4, fill: '#9aa4b2', 'text-anchor': 'end', font: '11px var(--mono)' }, stageSvg).textContent = tv.toFixed(1);
        });

        // Diagonal y = x
        svg('line', { x1: cx(0), y1: cy(0), x2: cx(1.08), y2: cy(1.08), stroke: '#9aa4b2', 'stroke-width': 2 }, stageSvg);
        svg('text', { x: cx(0.36), y: cy(0.22), fill: '#9aa4b2', font: 'italic 13px var(--sans)' }, stageSvg).textContent = 'y = x';

        // Curve y = cos x (drawn after 5.2s)
        if (te >= 5.0) {
          var cPts = [];
          for (var i = 0; i <= 60; i++) {
            var xv = (i / 60) * 1.08;
            cPts.push(cx(xv).toFixed(1) + ',' + cy(Math.cos(xv)).toFixed(1));
          }
          svg('path', { d: 'M' + cPts.join(' L'), fill: 'none', stroke: '#58a6ff', 'stroke-width': 2.8 }, stageSvg);
          svg('text', { x: cx(0.22), y: cy(0.82), fill: '#58a6ff', font: 'italic 13.5px var(--sans)' }, stageSvg).textContent = 'y = cos x';
        }

        // Cobweb spiral (animates over 11.1s..15.5s)
        if (te >= 10.8) {
          var webFrac = clamp((te - 10.8) / 4.2, 0.05, 1);
          var xs = mdata.x;
          var totalSegs = 18;
          var segCount = Math.max(1, Math.round(webFrac * totalSegs));
          for (var k = 0; k < 9; k++) {
            var a = xs[k], b = xs[k + 1];
            if (2 * k < segCount) {
              svg('line', {
                x1: cx(a), y1: cy(k === 0 ? 0 : a),
                x2: cx(a), y2: cy(b),
                stroke: '#f7d154', 'stroke-width': 2
              }, stageSvg);
            }
            if (2 * k + 1 < segCount) {
              svg('line', {
                x1: cx(a), y1: cy(b),
                x2: cx(b), y2: cy(b),
                stroke: '#f7d154', 'stroke-width': 2
              }, stageSvg);
            }
          }
          if (te >= 15.0) {
            svg('circle', { cx: cx(mdata.fix), cy: cy(mdata.fix), r: 4.5, fill: '#ffffff' }, stageSvg);
          }
        }

        // Right: Table of iterates n, x_n, |x_n - x*|, bound (fades in after 17.5s)
        if (te >= 17.4) {
          var tx0 = 392, ty0 = 96;
          var cols = [0, 36, 126, 224];
          var hdrs = ['n', 'xₙ', '|xₙ − x*|', 'cⁿ/(1−c) |x₁−x₀|'];
          hdrs.forEach(function (hTxt, j) {
            svg('text', { x: tx0 + cols[j], y: ty0, fill: '#9aa4b2', font: '600 12px var(--mono)' }, stageSvg).textContent = hTxt;
          });
          var rowsN = [0, 1, 2, 3, 5, 10, 20, 30];
          var visRows = clamp(Math.floor((te - 17.8) / 0.45) + 1, 1, rowsN.length);
          rowsN.slice(0, visRows).forEach(function (nVal, ri) {
            var ry = ty0 + 24 + ri * 23;
            var cells = [
              String(nVal),
              mdata.x[nVal].toFixed(6),
              mdata.errs[nVal] < 1e-2 ? mdata.errs[nVal].toExponential(2) : mdata.errs[nVal].toFixed(4),
              mdata.bound[nVal] < 1e-1 ? mdata.bound[nVal].toExponential(2) : mdata.bound[nVal].toFixed(2),
            ];
            cells.forEach(function (cTxt, j) {
              svg('text', { x: tx0 + cols[j], y: ry, fill: '#ececec', font: '12px var(--mono)' }, stageSvg).textContent = cTxt;
            });
          });
          if (te >= 33.5) {
            svg('text', { x: tx0 + 36, y: ty0 + 224, fill: '#f7d154', font: '600 15px var(--mono)' }, stageSvg)
              .textContent = 'x* = ' + mdata.fix.toFixed(10);
          }
        }
        return;
      }

      if (beat === 2) {
        // Beat 2: Banach fixed-point proof & shrinking Cauchy discs (39.42..84.19 s)
        // Bookmarks in line 2: a=48.72s, b=53.04s, c=60.53s, d=72.24s, e=77.59s
        svg('text', { x: W / 2, y: 28, fill: '#ffffff', 'text-anchor': 'middle', font: '600 17px var(--sans)' }, stageSvg)
          .textContent = 'The contraction principle (Rudin 9.23)';
        svg('text', { x: W / 2, y: 48, fill: '#f7d154', 'text-anchor': 'middle', font: '13px var(--mono)' }, stageSvg)
          .textContent = 'X complete,  d(φx, φy) ≤ c d(x, y) with c < 1   ⇒   unique fixed point x*';

        // 4-box ProofMap bar
        var pmLabels = ['1. steps shrink like cⁿ', '2. so (xₙ) is Cauchy', '3. X complete: xₙ → x*', '4. φ(x*) = x*; unique'];
        var activeBox = te >= 77.4 ? 3 : te >= 72.0 ? 2 : te >= 60.4 ? 1 : te >= 52.9 ? 0 : -1;
        pmLabels.forEach(function (lbl, bi) {
          var bx = 34 + bi * 176, by = 60, bw = 164, bh = 28;
          var lit = bi === activeBox || te >= 78.5;
          svg('rect', {
            x: bx, y: by, width: bw, height: bh, rx: 4,
            fill: lit ? 'rgba(247, 209, 84, 0.14)' : '#161b22',
            stroke: lit ? '#f7d154' : '#30363d', 'stroke-width': lit ? 1.5 : 1
          }, stageSvg);
          svg('text', { x: bx + bw / 2, y: by + 18, fill: lit ? '#ffffff' : '#9aa4b2', 'text-anchor': 'middle', font: '500 11.5px var(--sans)' }, stageSvg)
            .textContent = lbl;
        });

        // Left: 2D spiral contraction R = 0.62 * rot(48 deg) around star = (0.5, -0.2)
        var cx0 = 185, cy0 = 260, scale = 54;
        var star = [0.5, -0.2];
        var pts2d = [[-2.0, 1.4]];
        var cVal = 0.62, th = 48 * Math.PI / 180;
        for (var i2 = 0; i2 < 10; i2++) {
          var prev = pts2d[pts2d.length - 1];
          var dx = prev[0] - star[0], dy = prev[1] - star[1];
          pts2d.push([
            star[0] + cVal * (dx * Math.cos(th) - dy * Math.sin(th)),
            star[1] + cVal * (dx * Math.sin(th) + dy * Math.cos(th)),
          ]);
        }
        function sx(p) { return cx0 + p[0] * scale; }
        function sy(p) { return cy0 - p[1] * scale; }
        var d10 = Math.hypot(pts2d[1][0] - pts2d[0][0], pts2d[1][1] - pts2d[0][1]);

        // Shrinking Cauchy disc (active after bookmark c = 60.5s)
        if (te >= 60.4) {
          var discIdx = clamp(3 + Math.floor((te - 60.5) / 3.5), 3, 6);
          var rWorld = Math.pow(cVal, discIdx) / (1 - cVal) * d10;
          svg('circle', {
            cx: sx(pts2d[discIdx]), cy: sy(pts2d[discIdx]), r: rWorld * scale,
            fill: 'rgba(91, 209, 122, 0.09)', stroke: '#5bd17a', 'stroke-width': 1.8
          }, stageSvg);
        }

        // Spiral steps and points
        var nVis = te < 48.5 ? 1 : clamp(Math.floor((te - 48.5) / 0.35) + 2, 1, pts2d.length);
        for (var j2 = 0; j2 < nVis - 1; j2++) {
          svg('line', {
            x1: sx(pts2d[j2]), y1: sy(pts2d[j2]),
            x2: sx(pts2d[j2 + 1]), y2: sy(pts2d[j2 + 1]),
            stroke: '#f7d154', 'stroke-width': 2.2
          }, stageSvg);
        }
        for (var m = 0; m < nVis; m++) {
          svg('circle', { cx: sx(pts2d[m]), cy: sy(pts2d[m]), r: m < 5 ? 4 : 3, fill: '#58a6ff' }, stageSvg);
        }
        svg('text', { x: sx(pts2d[0]) - 10, y: sy(pts2d[0]) - 8, fill: '#ececec', font: 'italic 13px var(--sans)' }, stageSvg).textContent = 'x₀';
        if (te >= 72.0) {
          svg('circle', { cx: sx(star), cy: sy(star), r: 5, fill: '#ffffff' }, stageSvg);
          svg('text', { x: sx(star) - 22, y: sy(star) + 5, fill: '#f7d154', font: '600 13px var(--mono)' }, stageSvg).textContent = 'x*';
        }

        // Right: Proof derivation ladder
        var ladder = [
          [53.0, 'd(xₙ₊₁, xₙ)  ≤  cⁿ d(x₁, x₀)', 'φ shrinks every distance by c'],
          [60.5, 'd(xₘ, xₙ)  ≤  [cⁿ / (1 − c)] d(x₁, x₀)', 'triangle inequality + geometric series: Cauchy'],
          [72.2, 'φ(x*) = lim φ(xₙ) = lim xₙ₊₁ = x*', 'X complete  &  φ continuous'],
          [77.5, 'd(x*, y*) = d(φx*, φy*) ≤ c d(x*, y*)  ⇒  x* = y*', 'uniqueness (since c < 1)'],
        ];
        ladder.forEach(function (row, ri) {
          if (te < row[0]) return;
          var ry = 132 + ri * 58;
          svg('text', { x: 378, y: ry, fill: '#ffffff', font: '500 12.5px var(--mono)' }, stageSvg).textContent = row[1];
          svg('text', { x: 378, y: ry + 18, fill: '#9aa4b2', font: '11.5px var(--sans)' }, stageSvg).textContent = row[2];
        });
        return;
      }

      if (beat === 3) {
        // Beat 3: Why completeness matters — phi(x) = x/2 + 1/x on Q n [1, 2] (84.19..111.34 s)
        // Bookmarks: a=87.48s, b=94.75s, c=101.29s
        svg('text', { x: W / 2, y: 30, fill: '#ffffff', 'text-anchor': 'middle', font: '600 17.5px var(--sans)' }, stageSvg)
          .textContent = 'Why completeness matters:   φ(x) = x/2 + 1/x  on  ℚ ∩ [1, 2]';
        if (te >= 87.3) {
          svg('text', { x: W / 2, y: 52, fill: '#9aa4b2', 'text-anchor': 'middle', font: '13px var(--mono)' }, stageSvg)
            .textContent = "maps rationals to rationals, and  |φ'(x)| = |1/2 − 1/x²| ≤ 1/2 :  a contraction";
        }

        // Main number line [1, 2]
        var nlX0 = 68, nlX1 = 692, nlY = 122;
        function nx(v) { return nlX0 + (v - 1.0) * (nlX1 - nlX0); }
        svg('line', { x1: nlX0, x2: nlX1, y1: nlY, y2: nlY, stroke: '#9aa4b2', 'stroke-width': 1.8 }, stageSvg);
        [1.0, 1.25, 1.5, 1.75, 2.0].forEach(function (tv) {
          var tx = nx(tv);
          svg('line', { x1: tx, x2: tx, y1: nlY - 5, y2: nlY + 5, stroke: '#9aa4b2', 'stroke-width': 1.4 }, stageSvg);
          svg('text', { x: tx, y: nlY + 19, fill: '#9aa4b2', 'text-anchor': 'middle', font: '11px var(--mono)' }, stageSvg).textContent = tv.toFixed(2);
        });

        var qPts = [
          [84.2, 1.0, '1'],
          [94.7, 1.5, '3/2'],
          [96.0, 17 / 12, '17/12'],
          [97.5, 577 / 408, '577/408'],
        ];
        qPts.forEach(function (qp, qi) {
          if (te < qp[0]) return;
          var qx = nx(qp[1]);
          svg('circle', { cx: qx, cy: nlY, r: 4.5, fill: '#58a6ff' }, stageSvg);
          if (qi < 2) {
            svg('text', { x: qx, y: nlY - 12, fill: '#58a6ff', 'text-anchor': 'middle', font: '600 12.5px var(--mono)' }, stageSvg).textContent = qp[2];
          }
        });

        // x127 Magnifier box around sqrt(2) = 1.41421356
        if (te >= 95.8) {
          var r2 = Math.SQRT2;
          var srcX = nx(r2);
          svg('rect', { x: srcX - 6, y: nlY - 9, width: 12, height: 18, rx: 2, fill: 'none', stroke: '#9aa4b2', 'stroke-width': 1.2 }, stageSvg);

          var mX = 264, mY = 188, mW = 296, mH = 148;
          svg('line', { x1: srcX - 4, y1: nlY + 9, x2: mX, y2: mY, stroke: '#4b5563', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, stageSvg);
          svg('line', { x1: srcX + 4, y1: nlY + 9, x2: mX + mW, y2: mY, stroke: '#4b5563', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, stageSvg);
          svg('rect', { x: mX, y: mY, width: mW, height: mH, rx: 6, fill: '#131822', stroke: '#6b7280', 'stroke-width': 1.4 }, stageSvg);
          svg('text', { x: mX + mW - 10, y: mY + 19, fill: '#9aa4b2', 'text-anchor': 'end', font: '600 11.5px var(--mono)' }, stageSvg).textContent = '×127';

          var inX0 = mX + 24, inX1 = mX + mW - 24, inY = mY + 76;
          function ix(v) { return inX0 + ((v - 1.413) / 0.004) * (inX1 - inX0); }
          svg('line', { x1: inX0, x2: inX1, y1: inY, y2: inY, stroke: '#9aa4b2', 'stroke-width': 1.6 }, stageSvg);
          [1.413, 1.414, 1.415, 1.416, 1.417].forEach(function (tv) {
            var tx = ix(tv);
            svg('line', { x1: tx, x2: tx, y1: inY - 4, y2: inY + 4, stroke: '#9aa4b2', 'stroke-width': 1.2 }, stageSvg);
            svg('text', { x: tx, y: inY + 17, fill: '#9aa4b2', 'text-anchor': 'middle', font: '10px var(--mono)' }, stageSvg).textContent = tv.toFixed(3);
          });

          // 17/12 and 577/408 inside magnifier
          var x17 = ix(17 / 12), x577 = ix(577 / 408);
          svg('circle', { cx: x17, cy: inY, r: 4.5, fill: '#58a6ff' }, stageSvg);
          svg('text', { x: x17, y: inY - 12, fill: '#58a6ff', 'text-anchor': 'middle', font: '600 11.5px var(--mono)' }, stageSvg).textContent = '17/12';
          if (te >= 97.4) {
            svg('circle', { cx: x577, cy: inY, r: 4.5, fill: '#58a6ff' }, stageSvg);
            svg('text', { x: x577 + 16, y: inY - 12, fill: '#58a6ff', 'text-anchor': 'middle', font: '600 11.5px var(--mono)' }, stageSvg).textContent = '577/408';
          }
          // Red hole at sqrt(2)
          if (te >= 101.2) {
            svg('circle', { cx: nx(r2), cy: nlY, r: 6.5, fill: '#0e1117', stroke: '#ff6b6b', 'stroke-width': 2.4 }, stageSvg);
            svg('circle', { cx: ix(r2), cy: inY, r: 7.5, fill: 'none', stroke: '#ff6b6b', 'stroke-width': 2.5 }, stageSvg);
            svg('text', { x: ix(r2), y: inY + 36, fill: '#ff6b6b', 'text-anchor': 'middle', font: '600 12px var(--mono)' }, stageSvg).textContent = '√2 ∉ ℚ';
            svg('text', { x: mX + mW - 4, y: mY + mH + 18, fill: '#9aa4b2', 'text-anchor': 'end', font: '11.5px var(--mono)' }, stageSvg)
              .textContent = '577/408 − √2 = 2.1 × 10⁻⁶';

            svg('text', { x: 46, y: 226, fill: '#ececec', font: '13.5px var(--sans)' }, stageSvg).textContent = 'The iterates are Cauchy,';
            svg('text', { x: 46, y: 248, fill: '#ececec', font: '13.5px var(--sans)' }, stageSvg).textContent = 'but their limit would be √2:';
            svg('text', { x: 46, y: 274, fill: '#ff6b6b', font: '600 14.5px var(--sans)' }, stageSvg).textContent = 'no fixed point in ℚ.';
            svg('text', { x: 46, y: 298, fill: '#9aa4b2', font: '11.5px var(--sans)' }, stageSvg).textContent = "(Part 1's hole: Newton for √2)";
          }
        }
        return;
      }

      // Beat 4: Newton's method is a contraction near a simple root (111.34..144.8 s)
      // Bookmarks: a=113.86s, b=119.56s, c=128.42s
      svg('text', { x: W / 2, y: 28, fill: '#ffffff', 'text-anchor': 'middle', font: '600 17px var(--sans)' }, stageSvg)
        .textContent = "Newton's method is a contraction near a simple root";
      if (te >= 113.7) {
        svg('text', { x: W / 2, y: 50, fill: '#ececec', 'text-anchor': 'middle', font: '13px var(--mono)' }, stageSvg)
          .textContent = "g(x) = x − f(x)/f'(x),    g'(x) = f(x)f''(x)/(f'(x))² = 0  at the root";
      }

      var nAxX = 64, nAxY = 82, nAxS = 250;
      function ncx(v) { return nAxX + (v - 1.0) * nAxS; }
      function ncy(v) { return nAxY + nAxS - (v - 1.0) * nAxS; }
      svg('line', { x1: nAxX, x2: nAxX + nAxS, y1: nAxY + nAxS, y2: nAxY + nAxS, stroke: '#6b7280', 'stroke-width': 1.4 }, stageSvg);
      svg('line', { x1: nAxX, x2: nAxX, y1: nAxY, y2: nAxY + nAxS, stroke: '#6b7280', 'stroke-width': 1.4 }, stageSvg);
      [1.0, 1.5, 2.0].forEach(function (tv) {
        svg('text', { x: ncx(tv), y: nAxY + nAxS + 15, fill: '#9aa4b2', 'text-anchor': 'middle', font: '10.5px var(--mono)' }, stageSvg).textContent = tv.toFixed(1);
        svg('text', { x: nAxX - 7, y: ncy(tv) + 4, fill: '#9aa4b2', 'text-anchor': 'end', font: '10.5px var(--mono)' }, stageSvg).textContent = tv.toFixed(1);
      });
      svg('line', { x1: ncx(1), y1: ncy(1), x2: ncx(2), y2: ncy(2), stroke: '#9aa4b2', 'stroke-width': 2 }, stageSvg);

      if (te >= 113.8) {
        var gPts = [];
        for (var gi = 0; gi <= 50; gi++) {
          var xv2 = 1.0 + (gi / 50) * 1.0;
          var yv2 = xv2 / 2 + 1 / xv2;
          gPts.push(ncx(xv2).toFixed(1) + ',' + ncy(yv2).toFixed(1));
        }
        svg('path', { d: 'M' + gPts.join(' L'), fill: 'none', stroke: '#58a6ff', 'stroke-width': 2.8 }, stageSvg);
        svg('text', { x: nAxX + nAxS / 2, y: nAxY - 7, fill: '#58a6ff', 'text-anchor': 'middle', font: '12px var(--mono)' }, stageSvg)
          .textContent = 'g(x) = x/2 + 1/x   (f = x² − 2)';
      }
      if (te >= 119.5) {
        var r2n = Math.SQRT2;
        svg('line', {
          x1: ncx(1.0), y1: ncy(r2n), x2: ncx(1.8), y2: ncy(r2n),
          stroke: '#f7d154', 'stroke-width': 1.8, 'stroke-dasharray': '4 4'
        }, stageSvg);
        svg('text', { x: ncx(1.82), y: ncy(r2n) + 4, fill: '#f7d154', font: '11.5px var(--mono)' }, stageSvg)
          .textContent = 'slope 0 at √2';
      }
      if (te >= 128.4) {
        var xn = mdata.xn;
        for (var nk = 0; nk < 3; nk++) {
          svg('line', { x1: ncx(xn[nk]), y1: ncy(xn[nk]), x2: ncx(xn[nk]), y2: ncy(xn[nk + 1]), stroke: '#f7d154', 'stroke-width': 2 }, stageSvg);
          svg('line', { x1: ncx(xn[nk]), y1: ncy(xn[nk + 1]), x2: ncx(xn[nk + 1]), y2: ncy(xn[nk + 1]), stroke: '#f7d154', 'stroke-width': 2 }, stageSvg);
        }
        svg('circle', { cx: ncx(Math.SQRT2), cy: ncy(Math.SQRT2), r: 4, fill: '#ffffff' }, stageSvg);

        // Quadratic error table on the right
        var txN = 376, tyN = 96;
        svg('text', { x: txN, y: tyN, fill: '#9aa4b2', font: '600 12px var(--mono)' }, stageSvg).textContent = 'n      |xₙ − √2|       quadratic rate';
        var rates = ['start at x₀ = 1', '1 digit', '2 digits', '5 digits (577/408)', '11 digits'];
        mdata.nerr.slice(0, 5).forEach(function (ev, ni) {
          var sErr = ev > 1e-3 ? ev.toFixed(4) : ev.toExponential(1);
          svg('text', { x: txN, y: tyN + 24 + ni * 23, fill: '#ececec', font: '12px var(--mono)' }, stageSvg)
            .textContent = ni + '      ' + sErr;
          svg('text', { x: txN + 148, y: tyN + 24 + ni * 23, fill: '#9aa4b2', font: '11.5px var(--sans)' }, stageSvg)
            .textContent = rates[ni];
        });
        svg('text', { x: txN, y: tyN + 154, fill: '#f7d154', font: '600 13px var(--sans)' }, stageSvg)
          .textContent = 'Error squares each step · correct digits double';
      }
    }

    function renderScore() {
      var lines = langMode === 'en' ? score.en_lines : score.zh_lines;
      var maxDur = langMode === 'en' ? score.en_duration : score.zh_duration;
      tCur = clamp(tCur, 0, maxDur);

      var te = langMode === 'en' ? tCur : mapTimeZhToEn(tCur);
      var tz = langMode === 'zh' ? tCur : mapTimeEnToZh(tCur);
      var si = currentSegIndex(tCur, langMode);
      var seg = segs[si];

      readoutEl.textContent = fmtPrecise(tCur) + ' / ' + fmtPrecise(maxDur) +
        ' · #' + si + ' ' + seg[4];

      drawManimStage(te);

      // Update karaoke subtitle bar
      var activeLine = lines[0];
      for (var i = 0; i < lines.length; i++) {
        if (tCur >= lines[i].start - 0.2) activeLine = lines[i];
      }
      clear(karaokeEl);
      var markAtWord = {};
      Object.keys(activeLine.marks).forEach(function (mk) {
        markAtWord[activeLine.marks[mk][0]] = mk;
      });
      activeLine.words.forEach(function (w, wi) {
        if (markAtWord[wi]) {
          var mkName = markAtWord[wi];
          var bm = h('span', {
            class: 'bm',
            title: 'Jump to <bookmark mark=\'' + mkName + '\'/>',
            text: '<' + mkName + '/>',
            onclick: function () {
              stopPlay();
              tCur = activeLine.marks[mkName][1];
              updateBeatTabHighlight();
              renderScore();
            }
          });
          karaokeEl.appendChild(bm);
        }
        var cls = 'w';
        if (tCur >= w[1] && tCur <= w[2] + 0.08) cls += ' now';
        else if (tCur > w[2]) cls += ' past';
        var span = h('span', {
          class: cls,
          text: w[0] + (langMode === 'en' ? ' ' : ''),
          onclick: function () {
            stopPlay();
            tCur = w[1] + 0.01;
            updateBeatTabHighlight();
            renderScore();
          }
        });
        karaokeEl.appendChild(span);
      });

      // Update playhead on dual timeline
      if (playheadGroup) {
        clear(playheadGroup);
        var W = 760, padL = 58, padR = 14;
        var maxT = Math.max(score.en_duration, score.zh_duration);
        var tw = W - padL - padR;
        var xe = padL + (te / maxT) * tw;
        var xz = padL + (tz / maxT) * tw;
        svg('path', {
          class: 'head-line',
          d: 'M' + xe.toFixed(1) + ',12 L' + xe.toFixed(1) + ',38 L' + xz.toFixed(1) + ',64 L' + xz.toFixed(1) + ',90',
          fill: 'none'
        }, playheadGroup);
        svg('circle', { cx: xe, cy: 12, r: 3, fill: 'var(--fg)' }, playheadGroup);
        svg('circle', { cx: xz, cy: 90, r: 3, fill: 'var(--fg)' }, playheadGroup);
      }
    }

    function tick(now) {
      if (!playing) return;
      var dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      var maxDur = langMode === 'en' ? score.en_duration : score.zh_duration;
      tCur += dt;
      if (tCur >= maxDur) {
        tCur = 0;
        stopPlay();
      }
      updateBeatTabHighlight();
      renderScore();
      if (playing) rafId = requestAnimationFrame(tick);
    }
    function startPlay() {
      // If sitting at a beat's showcase timestamp, start playing from the beginning of that beat so the build-up animates
      var te = langMode === 'en' ? tCur : mapTimeZhToEn(tCur);
      var si = currentSegIndex(te, 'en');
      var bIdx = segs[si][5];
      if (bIdx >= 1 && BEAT_SHOWCASE_EN[bIdx] && Math.abs(te - BEAT_SHOWCASE_EN[bIdx]) < 1.0) {
        var bStart = score.beats[bIdx].en_t + 0.2;
        tCur = langMode === 'en' ? bStart : mapTimeEnToZh(bStart);
      }
      playing = true;
      playBtn.setIcon('pause');
      lastTs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function stopPlay() {
      playing = false;
      playBtn.setIcon('play');
      if (rafId) cancelAnimationFrame(rafId);
    }

    // Timeline scrubbing
    var tlDrag = false;
    function scrubTimeline(e) {
      var rect = tlSvg.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width * 760;
      var y = (e.clientY - rect.top) / rect.height * 112;
      var maxT = Math.max(score.en_duration, score.zh_duration);
      var t = clamp((x - 58) / (760 - 72) * maxT, 0, maxT);
      if (y > 52 && langMode === 'en') tCur = mapTimeZhToEn(t);
      else if (y <= 52 && langMode === 'zh') tCur = mapTimeEnToZh(t);
      else tCur = t;
      updateBeatTabHighlight();
      renderScore();
    }
    tlSvg.addEventListener('pointerdown', function (e) {
      stopPlay();
      tlDrag = true;
      tlSvg.setPointerCapture(e.pointerId);
      scrubTimeline(e);
    });
    tlSvg.addEventListener('pointermove', function (e) { if (tlDrag) scrubTimeline(e); });
    tlSvg.addEventListener('pointerup', function () { tlDrag = false; });

    buildTimelineStatic();
    renderScore();
    onFramesReady(renderScore);

    // Prose action links: <a class="act" href="#ev-score" data-beat="3" data-lang="zh">
    document.querySelectorAll('a.act[href="#ev-score"]').forEach(function (a) {
      a.addEventListener('click', function () {
        stopPlay();
        var nl = a.getAttribute('data-lang');
        if (nl && nl !== langMode) {
          langMode = nl;
          langTabs.set(nl, true);
        }
        var bNum = a.getAttribute('data-beat');
        var tSet = a.getAttribute('data-time');
        if (tSet !== null && tSet !== '') {
          var te = Number(tSet);
          tCur = langMode === 'en' ? te : mapTimeEnToZh(te);
        } else if (bNum) {
          var baseT = BEAT_SHOWCASE_EN[Number(bNum)] || (score.beats[Number(bNum)].en_t + 12.0);
          tCur = langMode === 'en' ? baseT : mapTimeEnToZh(baseT);
        }
        updateBeatTabHighlight();
        renderScore();
      });
    });
  }

  // =========================================================================
  // Figure 4: Semantic Palette & Pronunciation Lexicon (#ev-palette)
  // =========================================================================
  function wcagContrastVsManimBg(hex) {
    var clean = (hex || '#ffffff').replace('#', '');
    var r = parseInt(clean.slice(0, 2), 16) / 255;
    var g = parseInt(clean.slice(2, 4), 16) / 255;
    var b = parseInt(clean.slice(4, 6), 16) / 255;
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var L1 = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // #0E1117 relative luminance
    var L2 = 0.2126 * lin(14 / 255) + 0.7152 * lin(17 / 255) + 0.0722 * lin(23 / 255);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }

  function initPalette(fig, data) {
    var body = mount(fig);
    var pal = data.palette;
    var lex = data.lexicon;
    var viewMode = 'palette';
    var grpFilter = 'All';
    var selectedToken = pal.tokens[0];
    var selectedRule = lex.rules[0];

    var modeTabs = tabs('View mode', [
      ['palette', 'Semantic colors (' + pal.total_tokens + ' tokens · ' + pal.total_refs.toLocaleString() + ' uses)'],
      ['lexicon', 'IPA lexicon (' + lex.total_rules + ' rules · ' + lex.total_hits.toLocaleString() + ' fixes)'],
    ], viewMode, function (v) {
      viewMode = v;
      renderView();
    });

    var grpTabs = tabs('Domain group', [
      ['All', 'All domains'],
      ['Analysis, Built', 'Analysis'],
      ['AI, Built', 'AI, Built'],
      ['Language Models & RL', 'LLMs & RL'],
      ['Physics & Fluids', 'Physics & Fluids'],
      ['Number Theory & Stochastics', 'Math & Stochastics'],
      ['Markets & Trading', 'Markets'],
    ], grpFilter, function (v) {
      grpFilter = v;
      renderView();
    });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      modeTabs.el,
      grpTabs.el,
    ]));

    var inspectorWrap = h('div', { class: 'pal-inspector' });
    var contentWrap = h('div');
    body.appendChild(inspectorWrap);
    body.appendChild(contentWrap);

    function renderInspector() {
      clear(inspectorWrap);
      if (viewMode === 'palette' && selectedToken) {
        var t = selectedToken;
        var ratio = wcagContrastVsManimBg(t.hex);
        var grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'AA Large';

        // Mini #0E1117 Manim stage preview
        var pSvg = svg('svg', { viewBox: '0 0 250 74', role: 'img', 'aria-label': 'Manim dark stage preview for C.' + t.name });
        svg('rect', { x: 0, y: 0, width: 250, height: 74, rx: 5, fill: '#0e1117', stroke: 'rgba(255,255,255,0.12)' }, pSvg);
        svg('line', { x1: 18, x2: 234, y1: 58, y2: 58, stroke: '#4b5563', 'stroke-width': 1 }, pSvg);
        svg('line', { x1: 18, x2: 18, y1: 12, y2: 58, stroke: '#4b5563', 'stroke-width': 1 }, pSvg);

        var pts = [];
        for (var i = 0; i <= 36; i++) {
          var u = i / 36;
          var x = 22 + u * 206;
          var y = 38 - Math.sin(u * Math.PI * 2.4) * Math.exp(-u * 0.6) * 20;
          pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        var areaD = 'M22,58 L' + pts.join(' L') + ' L228,58 Z';
        svg('path', { d: areaD, fill: t.hex, 'fill-opacity': 0.16 }, pSvg);
        svg('path', { d: 'M' + pts.join(' L'), fill: 'none', stroke: t.hex, 'stroke-width': 2.4 }, pSvg);
        [0.18, 0.48, 0.78].forEach(function (u) {
          var x = 22 + u * 206;
          var y = 38 - Math.sin(u * Math.PI * 2.4) * Math.exp(-u * 0.6) * 20;
          svg('circle', { cx: x, cy: y, r: 3.2, fill: t.hex, stroke: '#0e1117', 'stroke-width': 1 }, pSvg);
        });
        svg('text', { x: 228, y: 20, fill: t.hex, 'text-anchor': 'end', font: '600 11px var(--mono)' }, pSvg).textContent = 'color=C.' + t.name;

        var meta = h('div', { class: 'pal-insp-meta' }, [
          h('div', { class: 'pal-insp-head' }, [
            h('span', { class: 'pal-insp-title', style: 'color:' + t.hex, text: 'C.' + t.name }),
            h('span', { class: 'pal-insp-badge', text: t.hex }),
            h('span', { class: 'pal-insp-badge', text: ratio.toFixed(1) + ':1 vs #0E1117 (' + grade + ')' }),
            h('span', { class: 'pal-insp-badge', text: t.group }),
          ]),
          h('div', { class: 'pal-insp-desc', text: t.desc }),
          h('div', {
            class: 'pal-insp-sub',
            html: 'Referenced <b>' + t.count + ' times</b> across <b>' + t.videos + '</b> video packages in <code>explainer/style.py</code>.'
          }),
        ]);

        inspectorWrap.appendChild(pSvg);
        inspectorWrap.appendChild(meta);
      } else if (selectedRule) {
        var r = selectedRule;
        var pSvg2 = svg('svg', { viewBox: '0 0 250 74', role: 'img', 'aria-label': 'G2P to IPA override preview' });
        svg('rect', { x: 0, y: 0, width: 250, height: 74, rx: 5, fill: '#0e1117', stroke: 'rgba(255,255,255,0.12)' }, pSvg2);
        svg('text', { x: 14, y: 24, fill: '#f87171', font: '500 11.5px var(--sans)' }, pSvg2).textContent = 'Default G2P:  ' + r.wrong;
        svg('text', { x: 14, y: 44, fill: '#4ade80', font: '600 12px var(--sans)' }, pSvg2).textContent = 'IPA override: ' + r.right;
        svg('text', { x: 14, y: 63, fill: '#9aa4b2', font: '10.5px var(--mono)' }, pSvg2).textContent = r.ipa;

        var meta2 = h('div', { class: 'pal-insp-meta' }, [
          h('div', { class: 'pal-insp-head' }, [
            h('span', { class: 'pal-insp-title', text: r.label }),
            h('span', { class: 'pal-insp-badge', text: 'regex: ' + r.pattern }),
            h('span', { class: 'pal-insp-badge', text: r.hits + (r.hits === 1 ? ' narration line' : ' narration lines') }),
          ]),
          h('div', { class: 'pal-insp-desc', text: r.note }),
          h('div', {
            class: 'pal-insp-sub',
            html: r.example ? 'In <code>' + r.video + '</code>: “' + r.example + '”' : ''
          }),
        ]);

        inspectorWrap.appendChild(pSvg2);
        inspectorWrap.appendChild(meta2);
      }
    }

    function renderView() {
      clear(contentWrap);
      grpTabs.el.style.display = viewMode === 'palette' ? '' : 'none';

      if (viewMode === 'palette') {
        var list = pal.tokens.filter(function (t) {
          return grpFilter === 'All' || t.group === grpFilter;
        });
        if (list.indexOf(selectedToken) < 0 && list.length) selectedToken = list[0];
        var maxCnt = Math.max.apply(null, list.map(function (t) { return t.count; }));

        var grid = h('div', { class: 'pal-grid' });
        list.forEach(function (t) {
          var card = h('button', {
            type: 'button',
            class: 'pal-card' + (t === selectedToken ? ' on' : ''),
            style: '--c:' + t.hex,
            onclick: function () {
              selectedToken = t;
              renderView();
            }
          }, [
            h('div', { class: 'pal-top' }, [
              h('span', { class: 'pal-name' }, [
                h('i', { class: 'pal-dot' }),
                'C.' + t.name,
              ]),
              h('span', { class: 'pal-cnt', text: '×' + t.count }),
            ]),
            h('div', { class: 'pal-desc', text: t.desc }),
            h('div', { class: 'pal-bar' }, [
              h('i', { style: 'width:' + Math.max(6, (t.count / maxCnt) * 100).toFixed(1) + '%' }),
            ]),
          ]);
          grid.appendChild(card);
        });
        contentWrap.appendChild(grid);
      } else {
        var lgrid = h('div', { class: 'lex-table' });
        lex.rules.forEach(function (r) {
          var card = h('button', {
            type: 'button',
            class: 'lex-card' + (r === selectedRule ? ' on' : ''),
            onclick: function () {
              selectedRule = r;
              renderView();
            }
          }, [
            h('div', { class: 'lex-head' }, [
              h('span', { class: 'lex-term', text: r.label }),
              h('span', { class: 'lex-hits', text: r.hits + (r.hits === 1 ? ' line' : ' lines') }),
            ]),
            h('div', { class: 'lex-pair' }, [
              h('span', { class: 'lex-wrong', text: r.wrong }),
              h('span', { class: 'lex-arrow', text: '→' }),
              h('span', { class: 'lex-right', text: r.right }),
            ]),
            h('div', { class: 'lex-ipa', text: r.ipa }),
          ]);
          lgrid.appendChild(card);
        });
        contentWrap.appendChild(lgrid);
      }
      renderInspector();
    }

    renderView();

    // Prose action links: <a class="act" href="#ev-palette" data-mode="lexicon" data-rule="Poisson">
    document.querySelectorAll('a.act[href="#ev-palette"]').forEach(function (a) {
      a.addEventListener('click', function () {
        var m = a.getAttribute('data-mode');
        if (m) {
          viewMode = m;
          modeTabs.set(m, true);
        }
        var grp = a.getAttribute('data-group');
        if (grp) {
          grpFilter = grp;
          grpTabs.set(grp, true);
        }
        var rName = a.getAttribute('data-rule');
        if (rName) {
          var found = lex.rules.find(function (r) { return r.label === rName; });
          if (found) selectedRule = found;
        }
        renderView();
      });
    });
  }

  // =========================================================================
  // Figure 5: dead_air.py Pixel-Coverage Scanner (#ev-qa)
  // =========================================================================
  function initQa(fig, data) {
    var body = mount(fig);
    var cases = data.qa.cases;
    var activeCaseIdx = 0;
    var showMask = false;
    var thr = 0.30; // --sparse 0.003 = 0.30%
    var tScrub = 0.5 * (cases[0].line_start + 1.5 + cases[0].mark_time);

    var caseTabs = tabs('Visual pass commit', cases.map(function (c, i) {
      return [String(i), c.short_title || c.title];
    }), '0', function (v) {
      activeCaseIdx = Number(v);
      var c = cases[activeCaseIdx];
      tScrub = 0.5 * (c.line_start + 1.5 + c.mark_time);
      renderQa();
    });

    var maskCheck = h('label', { class: 'check' }, [
      h('input', {
        type: 'checkbox',
        onchange: function (e) { showMask = e.target.checked; drawCanvases(); }
      }),
      '320×180 diff mask',
    ]);

    var commitReadout = h('span', { class: 'fig-num' });

    body.appendChild(h('div', { class: 'fig-controls' }, [
      caseTabs.el,
      maskCheck,
      h('span', { class: 'grow' }),
      commitReadout,
    ]));

    // Side-by-side Before & After 16:9 canvases
    var beforeCanvas = h('canvas', { width: 384, height: 216 });
    var beforeTag = h('span', { class: 'qa-tag bad' });
    var beforeCov = h('span', { class: 'qa-cov' });

    var afterCanvas = h('canvas', { width: 384, height: 216 });
    var afterTag = h('span', { class: 'qa-tag good' });
    var afterCov = h('span', { class: 'qa-cov' });

    body.appendChild(h('div', { class: 'qa-pair' }, [
      h('div', { class: 'qa-box' }, [beforeCanvas, beforeTag, beforeCov]),
      h('div', { class: 'qa-box' }, [afterCanvas, afterTag, afterCov]),
    ]));

    var legendEl = h('div', { class: 'legend', style: 'margin-bottom:4px' }, [
      h('span', {}, [h('i', { class: 'dash' }), 'Before fix (held < 0.30% bare header until <bookmark/>)']),
      h('span', {}, [h('i', { style: 'background:var(--accent)' }), 'After fix (self.play() runs on word 1)']),
    ]);
    body.appendChild(legendEl);

    var chartSvg = svg('svg', {
      class: 'qa-chart',
      viewBox: '0 0 760 156',
      role: 'img',
      'aria-label': 'Active-pixel percentage before and after moving vo.wait_until()'
    });
    body.appendChild(chartSvg);

    var diffWrap = h('div', { class: 'qa-diff' });
    body.appendChild(diffWrap);

    var noteEl = h('p', { class: 'fig-note' });
    body.appendChild(noteEl);

    function drawFrameOrMask(canvas, caseIdx, isAfter) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0e1117';
      ctx.fillRect(0, 0, 384, 216);
      if (!framesImg || !framesImg.complete || !framesImg.naturalWidth) return;

      // In explainer-frames.webp:
      // caseIdx 0..1 are in row 24 cols 4..7; caseIdx 2..3 are in row 25 cols 0..3
      var row = caseIdx < 2 ? 24 : 25;
      var col = (caseIdx < 2 ? 4 + caseIdx * 2 : (caseIdx - 2) * 2) + (isAfter ? 1 : 0);
      ctx.drawImage(framesImg, col * 384, row * 216, 384, 216, 0, 0, 384, 216);

      if (showMask) {
        var imgData = ctx.getImageData(0, 0, 384, 216);
        var d = imgData.data;
        for (var i = 0; i < d.length; i += 4) {
          var diff = Math.max(Math.abs(d[i] - 0x0e), Math.abs(d[i + 1] - 0x11), Math.abs(d[i + 2] - 0x17));
          if (diff > 24) {
            d[i] = 110; d[i + 1] = 162; d[i + 2] = 255; d[i + 3] = 255;
          } else {
            d[i] = 14; d[i + 1] = 17; d[i + 2] = 23; d[i + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    function drawCanvases() {
      var c = cases[activeCaseIdx];
      var w0 = c.window[0], w1 = c.window[1];
      var idx = clamp(Math.round((tScrub - w0) * c.fps), 0, c.after.length - 1);
      var bVal = c.before[idx];
      var aVal = c.after[idx];

      // Before commit: if tScrub is inside [line_start + 1.0, mark_time], show the bare-header frame
      var inSparseGap = tScrub >= c.line_start + 1.0 && tScrub <= c.mark_time;
      drawFrameOrMask(beforeCanvas, activeCaseIdx, !inSparseGap);
      drawFrameOrMask(afterCanvas, activeCaseIdx, true);

      beforeTag.textContent = 'Before ' + c.commit + (bVal < thr ? ' · SPARSE (< 0.30%)' : '');
      beforeCov.textContent = bVal.toFixed(2) + '% pixels drawn';
      afterTag.textContent = 'After ' + c.commit + ' · visual plays on word 1';
      afterCov.textContent = aVal.toFixed(2) + '% pixels drawn';
    }

    function renderCodeBlock(title, lines) {
      var box = h('div', { class: 'qa-code' }, [
        h('div', { class: 'qa-code-hdr', text: title }),
      ]);
      (lines || []).forEach(function (pair) {
        var cls = pair[1] === 'bad' ? 'hl-bad' : pair[1] === 'good' ? 'hl-good' : '';
        box.appendChild(h('div', { class: cls, text: pair[0] }));
      });
      return box;
    }

    function renderQa() {
      var c = cases[activeCaseIdx];
      var w0 = c.window[0], w1 = c.window[1];
      tScrub = clamp(tScrub, w0, w1);

      var baseFile = c.file.split('/').pop();
      commitReadout.textContent = baseFile + ' · −' + c.sparse_gap_sec.toFixed(1) + ' s gap';

      drawCanvases();

      clear(chartSvg);
      var W = 760, H = 156, padL = 42, padR = 14, padT = 18, padB = 24;
      var pw = W - padL - padR, ph = H - padT - padB;
      var maxY = Math.max(8, Math.ceil(Math.max.apply(null, c.after) * 1.15));
      function xOf(t) { return padL + ((t - w0) / (w1 - w0)) * pw; }
      function yOf(v) { return padT + ph - clamp(v / maxY, 0, 1) * ph; }

      // Grid lines
      [0, Math.round(maxY / 2), maxY].forEach(function (yv) {
        var y = yOf(yv);
        svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }, chartSvg);
        svg('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end' }, chartSvg).textContent = yv + '%';
      });

      // Shaded red gap band where vo.wait_until held the bare screen before the commit
      var gx0 = xOf(c.line_start + 1.0), gx1 = xOf(c.mark_time);
      svg('rect', { class: 'gap-band', x: gx0, y: padT, width: Math.max(2, gx1 - gx0), height: ph }, chartSvg);
      svg('text', { x: 0.5 * (gx0 + gx1), y: padT + 13, fill: 'var(--bad)', 'text-anchor': 'middle', font: '600 10.5px var(--sans)' }, chartSvg)
        .textContent = c.sparse_gap_sec.toFixed(1) + ' s below 0.30% before ' + c.commit + ' (waiting for <' + c.mark + '/>)';

      // After area & line
      var aPts = c.after.map(function (v, i) {
        return xOf(w0 + i / c.fps).toFixed(1) + ',' + yOf(v).toFixed(1);
      });
      var bPts = c.before.map(function (v, i) {
        return xOf(w0 + i / c.fps).toFixed(1) + ',' + yOf(v).toFixed(1);
      });
      var areaD = 'M' + xOf(w0).toFixed(1) + ',' + yOf(0).toFixed(1) + ' L' + aPts.join(' L') + ' L' + xOf(w1).toFixed(1) + ',' + yOf(0).toFixed(1) + ' Z';
      svg('path', { class: 'after-area', d: areaD }, chartSvg);
      svg('path', { class: 'after-line', d: 'M' + aPts.join(' L') }, chartSvg);
      svg('path', { class: 'before-line', d: 'M' + bPts.join(' L') }, chartSvg);

      // 0.30% threshold line
      var yThr = yOf(thr);
      svg('line', { class: 'thr-line', x1: padL, x2: W - padR, y1: yThr, y2: yThr }, chartSvg);
      svg('text', { x: W - padR - 4, y: yThr - 4, fill: 'var(--bad)', 'text-anchor': 'end', font: '500 9.5px var(--mono)' }, chartSvg)
        .textContent = '0.30% dead-air threshold';

      // Scrub cursor
      var cx = xOf(tScrub);
      svg('line', { class: 'cursor', x1: cx, x2: cx, y1: padT, y2: padT + ph }, chartSvg);

      // X axis labels
      for (var t = Math.ceil(w0 / 5) * 5; t <= w1; t += 5) {
        svg('text', { x: xOf(t), y: H - 6, 'text-anchor': 'middle' }, chartSvg).textContent = fmtClock(t);
      }

      // Side-by-side Python diff
      clear(diffWrap);
      diffWrap.appendChild(renderCodeBlock('Before commit ' + c.commit + ' (' + c.file + ')', c.before_code));
      diffWrap.appendChild(renderCodeBlock('After commit ' + c.commit + ' (' + c.file + ')', c.after_code));

      noteEl.innerHTML = '<b>' + c.title + '</b> (<code>' + c.commit + '</code>): ' + c.summary;
    }

    var qaDrag = false;
    function scrubQa(e) {
      var c = cases[activeCaseIdx];
      var rect = chartSvg.getBoundingClientRect();
      var u = clamp(((e.clientX - rect.left) / rect.width * 760 - 42) / (760 - 56), 0, 1);
      tScrub = c.window[0] + u * (c.window[1] - c.window[0]);
      renderQa();
    }
    chartSvg.addEventListener('pointerdown', function (e) {
      qaDrag = true;
      chartSvg.setPointerCapture(e.pointerId);
      scrubQa(e);
    });
    chartSvg.addEventListener('pointermove', function (e) { if (qaDrag) scrubQa(e); });
    chartSvg.addEventListener('pointerup', function () { qaDrag = false; });

    renderQa();
    onFramesReady(drawCanvases);

    // Prose action links: <a class="act" href="#ev-qa" data-case="width">
    document.querySelectorAll('a.act[href="#ev-qa"]').forEach(function (a) {
      a.addEventListener('click', function () {
        var cid = a.getAttribute('data-case');
        var idx = cases.findIndex(function (c) { return c.id === cid; });
        if (idx >= 0) {
          activeCaseIdx = idx;
          caseTabs.set(String(idx), true);
          var c = cases[idx];
          tScrub = 0.5 * (c.line_start + 1.5 + c.mark_time);
          renderQa();
        }
      });
    });
  }

  // =========================================================================
  // Bootstrap
  // =========================================================================
  var figs = document.querySelectorAll('figure.fig[data-src]');
  if (!figs.length) return;
  var srcUrl = figs[0].getAttribute('data-src');
  loadAtlases(srcUrl);

  fetch(srcUrl)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var fAtlas = document.getElementById('ev-atlas');
      if (fAtlas) initAtlas(fAtlas, data);
      var fScore = document.getElementById('ev-score');
      if (fScore) initScore(fScore, data);
      var fPalette = document.getElementById('ev-palette');
      if (fPalette) initPalette(fPalette, data);
      var fQa = document.getElementById('ev-qa');
      if (fQa) initQa(fQa, data);
    });
})();
