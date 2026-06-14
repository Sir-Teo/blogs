(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    blue: "#2563eb",
    teal: "#0f766e",
    purple: "#7c3aed",
    amber: "#b45309",
    red: "#be123c",
    green: "#15803d"
  };

  var PALETTE = [
    "#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c",
    "#15803d", "#0891b2", "#c2410c", "#4f46e5", "#64748b"
  ];

  var DEFAULTS = {
    model: "bond",
    p: 50,
    seed: 37,
    size: 36,
    trials: 140
  };

  var MODEL_INFO = {
    bond: {
      label: "bond percolation",
      pc: 0.5,
      spread: 0.24
    },
    site: {
      label: "site percolation",
      pc: 0.592746,
      spread: 0.21
    }
  };

  var LEFT = 1;
  var RIGHT = 2;
  var TOP = 4;
  var BOTTOM = 8;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value) {
    var x = value >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function trialSeed(model, seed, size, p, trial, salt) {
    var modelSalt = model === "site" ? 0x9e3779b9 : 0x85ebca6b;
    var value = modelSalt ^
      Math.imul((seed || 1) >>> 0, 1000003) ^
      Math.imul((size || 1) >>> 0, 9176) ^
      Math.imul(Math.round(p * 1000000) >>> 0, 37) ^
      Math.imul((trial + 1) >>> 0, 2654435761) ^
      ((salt || 0) >>> 0);
    return hash32(value);
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var model = String(raw.model || DEFAULTS.model);
    if (!MODEL_INFO[model]) model = DEFAULTS.model;
    return {
      model: model,
      p: clamp(number(raw, "p"), 5, 95) / 100,
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999),
      size: clamp(Math.round(number(raw, "size")), 12, 64),
      trials: clamp(Math.round(number(raw, "trials")), 30, 260)
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="perc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function UnionFind(n) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n);
    this.flags = new Uint8Array(n);
    for (var i = 0; i < n; i += 1) this.parent[i] = i;
  }

  UnionFind.prototype.activate = function (i, flags) {
    this.parent[i] = i;
    this.size[i] = 1;
    this.flags[i] = flags;
  };

  UnionFind.prototype.find = function (i) {
    var parent = this.parent;
    var r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== i) {
      var next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };

  UnionFind.prototype.union = function (a, b) {
    var ra = this.find(a);
    var rb = this.find(b);
    if (ra === rb) return ra;
    if (this.size[ra] < this.size[rb]) {
      var tmp = ra;
      ra = rb;
      rb = tmp;
    }
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    this.flags[ra] |= this.flags[rb];
    return ra;
  };

  function indexOf(x, y, size) {
    return y * size + x;
  }

  function boundaryFlags(x, y, size) {
    var flags = 0;
    if (x === 0) flags |= LEFT;
    if (x === size - 1) flags |= RIGHT;
    if (y === 0) flags |= TOP;
    if (y === size - 1) flags |= BOTTOM;
    return flags;
  }

  function summarizeComponents(uf, present, totalUnits) {
    var seen = {};
    var clusters = [];
    var largest = 0;
    var hRoot = -1;
    var vRoot = -1;

    for (var i = 0; i < present.length; i += 1) {
      if (!present[i]) continue;
      var rootId = uf.find(i);
      if (seen[rootId]) continue;
      seen[rootId] = true;
      var size = uf.size[rootId];
      var flags = uf.flags[rootId];
      clusters.push({ root: rootId, size: size, flags: flags });
      if (size > largest) largest = size;
      if (hRoot < 0 && (flags & LEFT) && (flags & RIGHT)) hRoot = rootId;
      if (vRoot < 0 && (flags & TOP) && (flags & BOTTOM)) vRoot = rootId;
    }

    clusters.sort(function (a, b) {
      return b.size - a.size || a.root - b.root;
    });

    return {
      clusterCount: clusters.length,
      clusters: clusters,
      hRoot: hRoot,
      largest: largest,
      largestShare: largest / Math.max(1, totalUnits),
      spansEither: hRoot >= 0 || vRoot >= 0,
      spansH: hRoot >= 0,
      spansV: vRoot >= 0,
      vRoot: vRoot
    };
  }

  function simulateSite(size, p, seed) {
    var rand = rng(seed);
    var n = size * size;
    var active = new Uint8Array(n);
    var uf = new UnionFind(n);
    var occupied = 0;
    var x;
    var y;
    var i;

    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size; x += 1) {
        i = indexOf(x, y, size);
        if (rand() < p) {
          active[i] = 1;
          occupied += 1;
          uf.activate(i, boundaryFlags(x, y, size));
        }
      }
    }

    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size; x += 1) {
        i = indexOf(x, y, size);
        if (!active[i]) continue;
        if (x > 0 && active[i - 1]) uf.union(i, i - 1);
        if (y > 0 && active[i - size]) uf.union(i, i - size);
      }
    }

    return {
      active: active,
      model: "site",
      occupied: occupied,
      openShare: occupied / n,
      p: p,
      seed: seed,
      size: size,
      summary: summarizeComponents(uf, active, n),
      totalUnits: n,
      uf: uf
    };
  }

  function simulateBond(size, p, seed) {
    var rand = rng(seed);
    var n = size * size;
    var hCount = size * (size - 1);
    var vCount = (size - 1) * size;
    var hOpen = new Uint8Array(hCount);
    var vOpen = new Uint8Array(vCount);
    var present = new Uint8Array(n);
    var uf = new UnionFind(n);
    var open = 0;
    var x;
    var y;
    var i;

    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size; x += 1) {
        i = indexOf(x, y, size);
        present[i] = 1;
        uf.activate(i, boundaryFlags(x, y, size));
      }
    }

    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size - 1; x += 1) {
        i = y * (size - 1) + x;
        if (rand() < p) {
          hOpen[i] = 1;
          open += 1;
          uf.union(indexOf(x, y, size), indexOf(x + 1, y, size));
        }
      }
    }

    for (y = 0; y < size - 1; y += 1) {
      for (x = 0; x < size; x += 1) {
        i = y * size + x;
        if (rand() < p) {
          vOpen[i] = 1;
          open += 1;
          uf.union(indexOf(x, y, size), indexOf(x, y + 1, size));
        }
      }
    }

    return {
      hOpen: hOpen,
      model: "bond",
      occupied: open,
      openShare: open / (hCount + vCount),
      p: p,
      present: present,
      seed: seed,
      size: size,
      summary: summarizeComponents(uf, present, n),
      totalEdges: hCount + vCount,
      totalUnits: n,
      uf: uf,
      vOpen: vOpen
    };
  }

  function simulateModel(model, size, p, seed) {
    if (model === "site") return simulateSite(size, p, seed);
    return simulateBond(size, p, seed);
  }

  function crossingStats(model, size, p, trials, seed, salt) {
    var horizontal = 0;
    var either = 0;
    var largest = 0;
    var open = 0;
    var clusters = 0;
    for (var t = 0; t < trials; t += 1) {
      var sample = simulateModel(model, size, p, trialSeed(model, seed, size, p, t, salt || 0));
      if (sample.summary.spansH) horizontal += 1;
      if (sample.summary.spansEither) either += 1;
      largest += sample.summary.largestShare;
      open += sample.openShare;
      clusters += sample.summary.clusterCount;
    }
    return {
      clusterCount: clusters / Math.max(1, trials),
      either: either / Math.max(1, trials),
      horizontal: horizontal / Math.max(1, trials),
      largestShare: largest / Math.max(1, trials),
      openShare: open / Math.max(1, trials),
      p: p,
      size: size,
      trials: trials
    };
  }

  function pGrid(model, count) {
    var info = MODEL_INFO[model] || MODEL_INFO.bond;
    var n = count || 17;
    var lo = clamp(info.pc - info.spread, 0.04, 0.96);
    var hi = clamp(info.pc + info.spread, 0.04, 0.96);
    var values = [];
    for (var i = 0; i < n; i += 1) {
      values.push(lo + (hi - lo) * i / Math.max(1, n - 1));
    }
    return values;
  }

  function monotoneRows(rows) {
    var maxSoFar = 0;
    return rows.map(function (row) {
      maxSoFar = Math.max(maxSoFar, row.horizontal);
      return Object.assign({}, row, { horizontal: maxSoFar });
    });
  }

  function estimateQuantile(rows, q) {
    if (!rows.length) return NaN;
    var clean = monotoneRows(rows);
    if (clean[0].horizontal >= q) return clean[0].p;
    for (var i = 1; i < clean.length; i += 1) {
      var a = clean[i - 1];
      var b = clean[i];
      if (b.horizontal >= q) {
        var denom = b.horizontal - a.horizontal;
        if (Math.abs(denom) < 1e-9) return b.p;
        return a.p + (q - a.horizontal) * (b.p - a.p) / denom;
      }
    }
    return clean[clean.length - 1].p;
  }

  function transitionWidth(rows) {
    return Math.max(0, estimateQuantile(rows, 0.75) - estimateQuantile(rows, 0.25));
  }

  function sweep(model, size, seed, trials, values, salt) {
    var rows = values.map(function (p) {
      return crossingStats(model, size, p, trials, seed, salt || 0);
    });
    return {
      p50: estimateQuantile(rows, 0.5),
      rows: rows,
      width: transitionWidth(rows)
    };
  }

  function finiteSizes(size) {
    var values = [
      clamp(Math.round(size * 0.58), 10, 72),
      clamp(size, 10, 72),
      clamp(Math.round(size * 1.42), 10, 72)
    ];
    var seen = {};
    return values.filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function evaluate(raw, options) {
    options = options || {};
    var params = cleanParams(raw);
    var model = params.model;
    var info = MODEL_INFO[model];
    var sample = simulateModel(model, params.size, params.p, trialSeed(model, params.seed, params.size, params.p, 0, 0xabcddcba));
    var selectedTrials = Math.min(params.trials, params.size > 54 ? 140 : 220);
    var selected = crossingStats(model, params.size, params.p, selectedTrials, params.seed, 0x1001);
    var values = pGrid(model, 17);
    var curveTrials = Math.min(params.trials, params.size > 54 ? 90 : 130);
    var mainSweep = sweep(model, params.size, params.seed, curveTrials, values, 0x2002);
    var smallValues = pGrid(model, 13);
    var fTrials = Math.min(params.trials, 72);
    var finite = finiteSizes(params.size).map(function (size, idx) {
      var s = sweep(model, size, params.seed + 17 * idx, fTrials, smallValues, 0x3003 + idx);
      return Object.assign({ size: size }, s);
    });
    var empty = simulateModel(model, Math.min(params.size, 28), 0, trialSeed(model, params.seed, params.size, 0, 1, 0x4004));
    var full = simulateModel(model, Math.min(params.size, 28), 1, trialSeed(model, params.seed, params.size, 1, 2, 0x5005));

    return {
      checks: {
        emptyDoesNotSpan: !empty.summary.spansH,
        fullSpans: full.summary.spansH,
        ordered: selected.horizontal >= 0 && selected.horizontal <= 1,
        p50NearPc: Math.abs(mainSweep.p50 - info.pc) < 0.16
      },
      finite: finite,
      info: info,
      mainSweep: mainSweep,
      params: params,
      sample: sample,
      selected: selected
    };
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(container, params) {
    var outputs = {
      model: MODEL_INFO[params.model].label,
      p: formatNumber(params.p, 3),
      seed: String(params.seed),
      size: String(params.size),
      trials: String(params.trials)
    };
    Object.keys(outputs).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = outputs[key];
      });
    });
  }

  function updateControlValues(container, params) {
    container.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = key === "p" ? Math.round(params.p * 100) : params[key];
      if (String(input.value) !== String(value)) input.value = value;
    });
  }

  function updateMetrics(container, result) {
    var checksPassed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
    var html = [
      metric("known pc", formatNumber(result.info.pc, result.params.model === "bond" ? 1 : 6)),
      metric("Pr(cross at p)", formatPercent(result.selected.horizontal, 0)),
      metric("estimated p50", formatNumber(result.mainSweep.p50, 3)),
      metric("finite width", formatNumber(result.mainSweep.width, 3)),
      metric("largest cluster", formatPercent(result.sample.summary.largestShare, 1)),
      metric("checks", checksPassed ? "passed" : "inspect")
    ].join("");
    var target = container.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.width || 900));
    var ratio = root.devicePixelRatio || 1;
    var height = cssHeight || 760;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
  }

  function fitText(ctx, text, x, y, maxWidth, size, color, weight) {
    var label = String(text);
    ctx.font = (weight || 500) + " " + (size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    while (label.length > 4 && ctx.measureText(label).width > maxWidth) {
      label = label.slice(0, -4) + "...";
    }
    ctx.fillStyle = color || COLORS.muted;
    ctx.fillText(label, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, 13, COLORS.text, 760);
    if (subtitle) fitText(ctx, subtitle, box.x + 14, box.y + 43, box.w - 28, 11, COLORS.muted, 560);
  }

  function colorForRoot(rootId, highlight) {
    if (highlight) return COLORS.teal;
    return PALETTE[hash32(rootId * 1103515245) % PALETTE.length];
  }

  function drawSiteSample(ctx, sample, box) {
    var size = sample.size;
    var side = Math.min(box.w - 42, box.h - 86);
    var cell = side / size;
    var left = box.x + (box.w - side) / 2;
    var top = box.y + 58;
    var highlight = sample.summary.hRoot >= 0 ? sample.summary.hRoot : sample.summary.vRoot;

    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(left, top, side, side);
    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var i = indexOf(x, y, size);
        if (!sample.active[i]) continue;
        var rootId = sample.uf.find(i);
        var isSpan = rootId === highlight;
        ctx.fillStyle = colorForRoot(rootId, isSpan);
        ctx.globalAlpha = isSpan ? 0.92 : 0.58;
        ctx.fillRect(left + x * cell, top + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, side, side);
  }

  function drawBondSample(ctx, sample, box) {
    var size = sample.size;
    var side = Math.min(box.w - 42, box.h - 86);
    var gap = side / Math.max(1, size - 1);
    var left = box.x + (box.w - side) / 2;
    var top = box.y + 58;
    var highlight = sample.summary.hRoot >= 0 ? sample.summary.hRoot : sample.summary.vRoot;
    var x;
    var y;
    var i;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.7;
    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size - 1; x += 1) {
        ctx.beginPath();
        ctx.moveTo(left + x * gap, top + y * gap);
        ctx.lineTo(left + (x + 1) * gap, top + y * gap);
        ctx.stroke();
      }
    }
    for (y = 0; y < size - 1; y += 1) {
      for (x = 0; x < size; x += 1) {
        ctx.beginPath();
        ctx.moveTo(left + x * gap, top + y * gap);
        ctx.lineTo(left + x * gap, top + (y + 1) * gap);
        ctx.stroke();
      }
    }

    ctx.lineCap = "round";
    for (y = 0; y < size; y += 1) {
      for (x = 0; x < size - 1; x += 1) {
        i = y * (size - 1) + x;
        if (!sample.hOpen[i]) continue;
        var r = sample.uf.find(indexOf(x, y, size));
        var isSpan = r === highlight;
        ctx.strokeStyle = colorForRoot(r, isSpan);
        ctx.globalAlpha = isSpan ? 0.95 : 0.55;
        ctx.lineWidth = isSpan ? Math.max(2.2, gap * 0.18) : Math.max(1.2, gap * 0.11);
        ctx.beginPath();
        ctx.moveTo(left + x * gap, top + y * gap);
        ctx.lineTo(left + (x + 1) * gap, top + y * gap);
        ctx.stroke();
      }
    }
    for (y = 0; y < size - 1; y += 1) {
      for (x = 0; x < size; x += 1) {
        i = y * size + x;
        if (!sample.vOpen[i]) continue;
        r = sample.uf.find(indexOf(x, y, size));
        isSpan = r === highlight;
        ctx.strokeStyle = colorForRoot(r, isSpan);
        ctx.globalAlpha = isSpan ? 0.95 : 0.55;
        ctx.lineWidth = isSpan ? Math.max(2.2, gap * 0.18) : Math.max(1.2, gap * 0.11);
        ctx.beginPath();
        ctx.moveTo(left + x * gap, top + y * gap);
        ctx.lineTo(left + x * gap, top + (y + 1) * gap);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, side, side);
  }

  function drawSamplePanel(ctx, result, box) {
    var sample = result.sample;
    var subtitle = "L=" + sample.size + ", p=" + formatNumber(sample.p, 2) + ", " +
      (sample.summary.spansH ? "left-right crossing" : "no left-right crossing");
    panel(ctx, box, "one finite box", subtitle);
    if (sample.model === "site") drawSiteSample(ctx, sample, box);
    else drawBondSample(ctx, sample, box);
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i <= 4; i += 1) {
      var yy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
  }

  function xScale(plot, rows, p) {
    var lo = rows[0].p;
    var hi = rows[rows.length - 1].p;
    return plot.x + (p - lo) * plot.w / Math.max(1e-9, hi - lo);
  }

  function drawCurve(ctx, rows, plot, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    rows.forEach(function (row, idx) {
      var x = xScale(plot, rows, row.p);
      var y = plot.y + plot.h - row.horizontal * plot.h;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    rows.forEach(function (row) {
      var x = xScale(plot, rows, row.p);
      var y = plot.y + plot.h - row.horizontal * plot.h;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawCrossingPanel(ctx, result, box) {
    panel(ctx, box, "crossing probability", "Monte Carlo estimate over occupation probability");
    var rows = result.mainSweep.rows;
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 64, h: box.h - 100 };
    drawAxes(ctx, plot);
    drawCurve(ctx, rows, plot, COLORS.blue);

    var pcX = xScale(plot, rows, result.info.pc);
    ctx.strokeStyle = COLORS.red;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pcX, plot.y);
    ctx.lineTo(pcX, plot.y + plot.h);
    ctx.stroke();
    var pX = xScale(plot, rows, result.params.p);
    ctx.strokeStyle = COLORS.amber;
    ctx.beginPath();
    ctx.moveTo(pX, plot.y);
    ctx.lineTo(pX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText(ctx, "0", plot.x - 18, plot.y + plot.h + 4, 10, COLORS.muted, 600);
    drawText(ctx, "1", plot.x - 18, plot.y + 4, 10, COLORS.muted, 600);
    drawText(ctx, "pc", pcX - 6, plot.y + plot.h + 20, 10, COLORS.red, 760);
    drawText(ctx, "p", pX - 4, plot.y + 14, 10, COLORS.amber, 760);
    fitText(ctx, "p50=" + formatNumber(result.mainSweep.p50, 3) + ", width=" + formatNumber(result.mainSweep.width, 3), box.x + 14, box.y + box.h - 18, box.w - 28, 11, COLORS.muted, 600);
  }

  function drawFinitePanel(ctx, result, box) {
    panel(ctx, box, "finite-size sharpening", "larger boxes make the S-curve steeper");
    var allRows = result.finite[0].rows;
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 64, h: box.h - 102 };
    var colors = [COLORS.green, COLORS.purple, COLORS.amber];
    drawAxes(ctx, plot);
    result.finite.forEach(function (curve, idx) {
      drawCurve(ctx, curve.rows, plot, colors[idx % colors.length]);
      drawText(ctx, "L=" + curve.size, plot.x + 8 + idx * 54, box.y + box.h - 18, 10, colors[idx % colors.length], 760);
    });
    var pcX = xScale(plot, allRows, result.info.pc);
    ctx.strokeStyle = COLORS.red;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(pcX, plot.y);
    ctx.lineTo(pcX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawClusterPanel(ctx, result, box) {
    panel(ctx, box, "cluster spectrum", "ranked component sizes in the drawn sample");
    var clusters = result.sample.summary.clusters.slice(0, 28);
    var plot = { x: box.x + 40, y: box.y + 60, w: box.w - 64, h: box.h - 104 };
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();

    if (!clusters.length) {
      drawText(ctx, "no occupied sites", plot.x + 10, plot.y + 34, 12, COLORS.muted, 650);
      return;
    }

    var maxLog = Math.log(clusters[0].size + 1);
    var barW = plot.w / clusters.length;
    var highlight = result.sample.summary.hRoot >= 0 ? result.sample.summary.hRoot : result.sample.summary.vRoot;
    clusters.forEach(function (cluster, idx) {
      var h = plot.h * Math.log(cluster.size + 1) / Math.max(1e-9, maxLog);
      ctx.fillStyle = colorForRoot(cluster.root, cluster.root === highlight);
      ctx.globalAlpha = cluster.root === highlight ? 0.9 : 0.62;
      ctx.fillRect(plot.x + idx * barW + 1, plot.y + plot.h - h, Math.max(1, barW - 2), h);
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "rank", plot.x + plot.w / 2, box.y + box.h - 18, 10, COLORS.muted, 650, "center");
    drawText(ctx, String(clusters[0].size), plot.x - 4, plot.y + 4, 10, COLORS.muted, 650, "right");
    fitText(ctx, "clusters=" + result.sample.summary.clusterCount + ", occupied/open=" + formatPercent(result.sample.openShare, 1), plot.x, box.y + 42, plot.w, 11, COLORS.muted, 600);
  }

  function draw(result, canvas) {
    var compact = (canvas.getBoundingClientRect().width || canvas.width) < 650;
    var prepared = setupCanvas(canvas, compact ? 1120 : 760);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = width - 2 * pad;

    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawSamplePanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawCrossingPanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawFinitePanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawClusterPanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }

    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawSamplePanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawCrossingPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawFinitePanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawClusterPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(container) {
    var result = evaluate(readParams(container));
    var params = result.params;
    updateOutputs(container, params);
    updateControlValues(container, params);
    updateMetrics(container, result);
    var canvas = container.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__percolationResult = result;
  }

  function initOne(container) {
    if (container.__percolationReady) return;
    container.__percolationReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(container); }, 80);
    }
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (root.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (container.__percolationResult) {
          var canvas = container.querySelector("[data-canvas]");
          if (canvas) draw(container.__percolationResult, canvas);
        }
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (container.__percolationResult) {
          var canvas = container.querySelector("[data-canvas]");
          if (canvas) draw(container.__percolationResult, canvas);
        }
      });
    }
    renderOne(container);
  }

  function init() {
    var labs = document.querySelectorAll("[data-percolation-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    crossingStats: crossingStats,
    estimateQuantile: estimateQuantile,
    evaluate: evaluate,
    pGrid: pGrid,
    simulateModel: simulateModel,
    sweep: sweep,
    trialSeed: trialSeed
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PercolationThresholdLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
