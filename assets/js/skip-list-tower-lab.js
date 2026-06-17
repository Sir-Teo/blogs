(function (global) {
  "use strict";

  var COLORS = {
    axis: "#cbd5e1",
    budget: "#7c3aed",
    drop: "#f97316",
    expected: "#64748b",
    grid: "#e6edf3",
    header: "#475569",
    link: "#cfd8e3",
    muted: "#5d6872",
    node: "#2563eb",
    panel: "#f8fafc",
    path: "#f97316",
    range: "#0f766e",
    rule: "#d7dee5",
    target: "#be123c",
    text: "#172026",
    white: "#ffffff"
  };

  var DEFAULTS = {
    n: 96,
    p: 0.25,
    query: 67,
    scan: 18,
    seed: 41
  };

  var P_OPTIONS = [0.5, 1 / 3, 0.25, 0.125];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function nearestP(value) {
    var best = P_OPTIONS[0];
    var dist = Infinity;
    P_OPTIONS.forEach(function (p) {
      var d = Math.abs(value - p);
      if (d < dist) {
        dist = d;
        best = p;
      }
    });
    return best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var n = Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 24, 176) / 8) * 8;
    var p = nearestP(finite(Number(raw.p), DEFAULTS.p));
    var query = Math.round(clamp(finite(Number(raw.query), DEFAULTS.query), 1, n));
    var scan = Math.round(clamp(finite(Number(raw.scan), DEFAULTS.scan), 1, 48));
    scan = Math.min(scan, n - query + 1);
    return {
      n: n,
      p: p,
      query: query,
      scan: scan,
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997))
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomLevel(rng, p, maxHeight) {
    var level = 1;
    while (level < maxHeight && rng() < p) level += 1;
    return level;
  }

  function generateKeys(n, rng) {
    var keys = [];
    var value = 3;
    for (var i = 0; i < n; i += 1) {
      value += 2 + Math.floor(rng() * 7);
      keys.push(value);
    }
    return keys;
  }

  function expectedSearchBudget(n, p) {
    var l = Math.log(n) / Math.log(1 / p);
    return l / p + 1 / (1 - p) + 1;
  }

  function buildSkipList(params) {
    var rng = makeRng(params.seed * 8191 + Math.round(params.p * 1000));
    var maxHeight = Math.ceil(Math.log(Math.max(2, params.n)) / Math.log(1 / params.p)) + 8;
    maxHeight = clamp(maxHeight, 8, 28);
    var keys = generateKeys(params.n, rng);
    var nodes = keys.map(function (key, i) {
      return {
        forward: [],
        index: i,
        key: key,
        level: randomLevel(rng, params.p, maxHeight)
      };
    });
    var levelCount = nodes.reduce(function (max, node) {
      return Math.max(max, node.level);
    }, 1);
    var header = {
      forward: [],
      header: true,
      index: -1,
      key: -Infinity,
      level: levelCount
    };
    for (var level = 0; level < levelCount; level += 1) {
      var prev = header;
      nodes.forEach(function (node) {
        if (node.level > level) {
          prev.forward[level] = node;
          prev = node;
        }
      });
      prev.forward[level] = null;
    }
    return {
      header: header,
      keys: keys,
      levelCount: levelCount,
      maxHeightCap: maxHeight,
      nodes: nodes
    };
  }

  function search(model, targetKey) {
    var x = model.header;
    var path = [];
    var forwardChecks = 0;
    var forwardHops = 0;
    var drops = 0;
    for (var level = model.levelCount - 1; level >= 0; level -= 1) {
      while (x.forward[level] && x.forward[level].key < targetKey) {
        var next = x.forward[level];
        forwardChecks += 1;
        forwardHops += 1;
        path.push({ from: x.index, level: level, to: next.index, type: "forward" });
        x = next;
      }
      forwardChecks += 1;
      if (level > 0) {
        drops += 1;
        path.push({ from: x.index, level: level, to: x.index, type: "drop" });
      }
    }
    var candidate = x.forward[0] || null;
    var hit = candidate && candidate.key === targetKey;
    if (candidate) {
      path.push({ from: x.index, level: 0, to: candidate.index, type: "hit" });
    }
    return {
      candidate: candidate,
      drops: drops,
      forwardChecks: forwardChecks,
      forwardHops: forwardHops,
      hit: Boolean(hit),
      path: path,
      predecessor: x,
      targetKey: targetKey,
      visualSteps: forwardHops + drops + (candidate ? 1 : 0)
    };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var idx = clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[idx];
  }

  function summarizeCosts(model) {
    var costs = model.keys.map(function (key) {
      return search(model, key).visualSteps;
    });
    var sorted = costs.slice().sort(function (a, b) { return a - b; });
    var mean = costs.reduce(function (sum, value) { return sum + value; }, 0) / costs.length;
    return {
      costs: costs,
      max: sorted[sorted.length - 1],
      mean: mean,
      p90: quantile(sorted, 0.9)
    };
  }

  function heightHistogram(nodes, levelCount) {
    var exact = [];
    var atLeast = [];
    for (var level = 1; level <= levelCount; level += 1) {
      exact.push(0);
      atLeast.push(0);
    }
    nodes.forEach(function (node) {
      exact[node.level - 1] += 1;
      for (var level = 1; level <= node.level; level += 1) atLeast[level - 1] += 1;
    });
    return { atLeast: atLeast, exact: exact };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = buildSkipList(params);
    var targetKey = model.keys[params.query - 1];
    var selected = search(model, targetKey);
    var costs = summarizeCosts(model);
    var pointers = model.nodes.reduce(function (sum, node) { return sum + node.level; }, 0);
    var scanEndRank = params.query + params.scan - 1;
    var repeated = 0;
    for (var rank = params.query; rank <= scanEndRank; rank += 1) {
      repeated += search(model, model.keys[rank - 1]).visualSteps;
    }
    var seekOnce = selected.visualSteps + params.scan - 1;
    var linked = scanEndRank;
    var budget = expectedSearchBudget(params.n, params.p);
    return {
      budget: budget,
      costs: costs,
      expectedPointers: 1 / (1 - params.p),
      histogram: heightHistogram(model.nodes, model.levelCount),
      linkedRange: linked,
      model: model,
      params: params,
      pointerAvg: pointers / params.n,
      pointers: pointers,
      repeatedRange: repeated,
      scanEndRank: scanEndRank,
      seekOnceRange: seekOnce,
      selected: selected,
      targetKey: targetKey
    };
  }

  function audit() {
    var result = evaluate(DEFAULTS);
    return {
      averagePointers: Number(result.pointerAvg.toFixed(2)),
      expectedPointers: Number(result.expectedPointers.toFixed(2)),
      linkedRange: result.linkedRange,
      maxHeight: result.model.levelCount,
      meanSearchSteps: Number(result.costs.mean.toFixed(1)),
      p90SearchSteps: result.costs.p90,
      pughBudget: Number(result.budget.toFixed(1)),
      searchSteps: result.selected.visualSteps,
      seekOnceRange: result.seekOnceRange,
      targetRank: result.params.query
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function pLabel(p) {
    if (Math.abs(p - 0.5) < 1e-9) return "1/2";
    if (Math.abs(p - 1 / 3) < 1e-9) return "1/3";
    if (Math.abs(p - 0.25) < 1e-9) return "1/4";
    if (Math.abs(p - 0.125) < 1e-9) return "1/8";
    return p.toFixed(2);
  }

  function fmt(value, digits) {
    return Number(value).toFixed(digits);
  }

  function setOutputs(root, params) {
    var queryInput = root.querySelector('[data-param="query"]');
    if (queryInput) {
      queryInput.max = String(params.n);
      queryInput.value = String(params.query);
    }
    var scanInput = root.querySelector('[data-param="scan"]');
    if (scanInput) {
      scanInput.max = String(Math.min(48, params.n - params.query + 1));
      scanInput.value = String(params.scan);
    }
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "p") value = pLabel(value);
        if (key === "n") value += " keys";
        if (key === "query") value = "rank " + value;
        if (key === "scan") value += " keys";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var rows = [
      ["target key", String(result.targetKey)],
      ["search steps", String(result.selected.visualSteps)],
      ["mean search", fmt(result.costs.mean, 1)],
      ["p90 search", String(result.costs.p90)],
      ["pointer avg", fmt(result.pointerAvg, 2)],
      ["Pugh budget", fmt(result.budget, 1)]
    ];
    metrics.innerHTML = rows.map(function (row) {
      return '<div class="sl-lab__metric"><span>' + row[0] + '</span><strong>' + row[1] + "</strong></div>";
    }).join("");
  }

  function clear(ctx) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, x + 14, y + 23);
  }

  function grid(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 1; i < rows; i += 1) {
      var yy = y + h * i / rows;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }
  }

  function range(values) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    return { max: max, min: min };
  }

  function drawTower(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "tower map and search path");
    var model = result.model;
    var px = x + 34;
    var py = y + 48;
    var pw = w - 62;
    var ph = h - 82;
    var levelCount = model.levelCount;
    var gap = levelCount <= 1 ? ph : ph / (levelCount - 1);

    function xFor(index) {
      if (index < 0) return px;
      return px + 28 + (pw - 34) * index / Math.max(1, result.params.n - 1);
    }

    function yFor(level) {
      return py + ph - gap * level;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var level = 0; level < levelCount; level += 1) {
      ctx.beginPath();
      ctx.moveTo(px, yFor(level));
      ctx.lineTo(px + pw, yFor(level));
      ctx.stroke();
    }

    for (level = 0; level < levelCount; level += 1) {
      var prev = model.header;
      while (prev && prev.forward[level]) {
        var next = prev.forward[level];
        ctx.strokeStyle = COLORS.link;
        ctx.lineWidth = level === 0 ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(xFor(prev.index), yFor(level));
        ctx.lineTo(xFor(next.index), yFor(level));
        ctx.stroke();
        prev = next;
      }
    }

    model.nodes.forEach(function (node) {
      var xx = xFor(node.index);
      ctx.strokeStyle = node.index === result.params.query - 1 ? COLORS.target : COLORS.axis;
      ctx.lineWidth = node.index === result.params.query - 1 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(xx, yFor(0));
      ctx.lineTo(xx, yFor(node.level - 1));
      ctx.stroke();
      for (var level = 0; level < node.level; level += 1) {
        ctx.fillStyle = node.index === result.params.query - 1 ? COLORS.target : COLORS.node;
        ctx.beginPath();
        ctx.arc(xx, yFor(level), level === 0 ? 3.3 : 2.7, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    ctx.fillStyle = COLORS.header;
    ctx.fillRect(xFor(-1) - 5, yFor(0) - 5, 10, 10);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("H", xFor(-1) - 4, yFor(0) + 19);

    result.selected.path.forEach(function (seg) {
      var fromX = xFor(seg.from);
      var toX = xFor(seg.to);
      var yy = yFor(seg.level);
      ctx.strokeStyle = seg.type === "drop" ? COLORS.drop : COLORS.path;
      ctx.lineWidth = seg.type === "hit" ? 3.3 : 2.6;
      ctx.beginPath();
      if (seg.type === "drop") {
        ctx.moveTo(fromX, yy);
        ctx.lineTo(fromX, yFor(seg.level - 1));
      } else {
        ctx.moveTo(fromX, yy);
        ctx.lineTo(toX, yy);
      }
      ctx.stroke();
    });

    var targetX = xFor(result.params.query - 1);
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(targetX, yFor(0), 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(String(result.targetKey), Math.min(targetX + 8, x + w - 54), yFor(0) - 9);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("promotion p=" + pLabel(result.params.p) + "; max observed height " + result.model.levelCount, px, y + h - 16);
  }

  function drawHistogram(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "height census");
    var px = x + 38;
    var py = y + 42;
    var pw = w - 58;
    var ph = h - 72;
    var exact = result.histogram.exact;
    var max = Math.max.apply(null, exact.concat([1]));
    grid(ctx, px, py, pw, ph, 4);
    exact.forEach(function (count, i) {
      var slot = pw / exact.length;
      var barW = Math.max(3, slot * 0.48);
      var bh = ph * count / max;
      var xx = px + slot * i + slot * 0.5;
      ctx.fillStyle = i === 0 ? COLORS.node : COLORS.range;
      ctx.fillRect(xx - barW / 2, py + ph - bh, barW, bh);
      var expected = result.params.n * (1 - result.params.p) * Math.pow(result.params.p, i);
      if (i === exact.length - 1) expected = result.params.n * Math.pow(result.params.p, i);
      var ey = py + ph - ph * Math.min(max, expected) / max;
      ctx.fillStyle = COLORS.expected;
      ctx.beginPath();
      ctx.arc(xx, ey, 3, 0, 2 * Math.PI);
      ctx.fill();
      if (i < 6 || i === exact.length - 1) {
        ctx.fillStyle = COLORS.text;
        ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(String(i + 1), xx - 3, py + ph + 16);
      }
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("bars = realized tower heights; gray dots = geometric expectation", px, y + h - 15);
  }

  function drawCosts(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "search cost by rank");
    var px = x + 38;
    var py = y + 42;
    var pw = w - 58;
    var ph = h - 72;
    var values = result.costs.costs;
    var r = range(values.concat([result.budget, result.costs.mean, 0]));
    r.max += 2;
    grid(ctx, px, py, pw, ph, 4);

    function yFor(value) {
      return py + ph - ph * (value - r.min) / (r.max - r.min);
    }

    ctx.strokeStyle = COLORS.node;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    values.forEach(function (value, i) {
      var xx = px + pw * i / Math.max(1, values.length - 1);
      var yy = yFor(value);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    var budgetY = yFor(result.budget);
    ctx.strokeStyle = COLORS.budget;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(px, budgetY);
    ctx.lineTo(px + pw, budgetY);
    ctx.stroke();
    ctx.setLineDash([]);

    var qx = px + pw * (result.params.query - 1) / Math.max(1, values.length - 1);
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(qx, yFor(result.selected.visualSteps), 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("blue = all successful searches; purple = expected-cost budget", px, y + h - 15);
  }

  function drawRange(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "range query budget");
    var px = x + 34;
    var py = y + 44;
    var pw = w - 54;
    var ph = h - 78;
    var rows = [
      { color: COLORS.axis, label: "plain list", value: result.linkedRange },
      { color: COLORS.budget, label: "search each", value: result.repeatedRange },
      { color: COLORS.range, label: "seek once", value: result.seekOnceRange }
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row.value; }));
    rows.forEach(function (row, i) {
      var yy = py + i * 46;
      var bw = pw * row.value / max;
      ctx.fillStyle = row.color;
      ctx.fillRect(px, yy, bw, 20);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(String(row.value), px + bw + 8, yy + 15);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, px, yy + 36);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("rank " + result.params.query + " through " + result.scanEndRank, px, y + h - 15);
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    clear(ctx);
    drawTower(ctx, result, 18, 18, 884, 300);
    drawHistogram(ctx, result, 18, 342, 278, 230);
    drawCosts(ctx, result, 320, 342, 278, 230);
    drawRange(ctx, result, 622, 342, 280, 230);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__skipListTowerLabResult = result;
  }

  function init(root) {
    if (!root || root.__skipListTowerLabInitialized) return;
    root.__skipListTowerLabInitialized = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    document.querySelectorAll("[data-skip-list-tower-lab]").forEach(init);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SkipListTowerLab = api;
})(typeof window !== "undefined" ? window : globalThis);
