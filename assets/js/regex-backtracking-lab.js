(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    backtrack: "#be123c",
    thompson: "#0f766e",
    rewrite: "#2563eb",
    tree: "#b45309",
    active: "#7c3aed",
    inactive: "#e2e8f0",
    trueLine: "#172026"
  };

  var DEFAULTS = {
    aCount: 18,
    suffix: "missing",
    maxPlot: 24,
    highlight: "backtrack"
  };

  var SUFFIXES = ["missing", "present"];
  var HIGHLIGHTS = ["backtrack", "thompson", "rewrite"];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      aCount: snap(raw.aCount, DEFAULTS.aCount, 4, 30, 1),
      suffix: nearest(raw.suffix, SUFFIXES, DEFAULTS.suffix),
      maxPlot: snap(raw.maxPlot, DEFAULTS.maxPlot, 8, 30, 1),
      highlight: nearest(raw.highlight, HIGHLIGHTS, DEFAULTS.highlight)
    };
  }

  function formatCompact(value) {
    if (!isFinite(value)) return "n/a";
    if (value < 1000) return String(Math.round(value));
    if (value < 1000000) return (value / 1000).toFixed(value < 10000 ? 1 : 0) + "k";
    if (value < 1000000000) return (value / 1000000).toFixed(value < 10000000 ? 1 : 0) + "M";
    return (value / 1000000000).toFixed(value < 10000000000 ? 1 : 0) + "B";
  }

  function formatRatio(value) {
    if (!isFinite(value)) return "n/a";
    if (value < 10) return value.toFixed(1) + "x";
    return formatCompact(value) + "x";
  }

  function inputString(params, n) {
    return "a".repeat(n) + (params.suffix === "present" ? "b" : "");
  }

  function backtrackingFailureWork(n) {
    var fail = Array(n + 1).fill(0);
    fail[n] = 2;
    for (var pos = n - 1; pos >= 0; pos -= 1) {
      var total = 2;
      for (var end = pos + 1; end <= n; end += 1) {
        total += (end - pos) + fail[end];
      }
      fail[pos] = total;
    }

    var start = 1;
    for (var firstEnd = 1; firstEnd <= n; firstEnd += 1) {
      start += firstEnd + fail[firstEnd];
    }
    return start;
  }

  function backtrackingSuccessWork(n) {
    return n + 3;
  }

  function backtrackingStats(params, n) {
    var hasB = params.suffix === "present";
    var work = hasB ? backtrackingSuccessWork(n) : backtrackingFailureWork(n);
    var segmentations = hasB ? 1 : Math.pow(2, Math.max(0, n - 1));
    return {
      engine: "backtrack",
      match: hasB,
      pattern: "^(a+)+b$",
      segmentations: segmentations,
      work: work
    };
  }

  function rewriteStats(params, n) {
    var hasB = params.suffix === "present";
    return {
      engine: "rewrite",
      match: hasB,
      pattern: "^a+b$",
      segmentations: 1,
      work: n + 2
    };
  }

  function epsilonClosure(states) {
    var stack = Array.from(states);
    var out = new Set(states);

    function add(state) {
      if (!out.has(state)) {
        out.add(state);
        stack.push(state);
      }
    }

    while (stack.length) {
      var state = stack.pop();
      if (state === 0) add(1);
      if (state === 2) {
        add(1);
        add(3);
      }
      if (state === 3) {
        add(0);
        add(4);
      }
    }
    return out;
  }

  function thompsonStats(params, n) {
    var text = inputString(params, n);
    var active = epsilonClosure(new Set([0]));
    var history = [Array.from(active).sort(function (a, b) { return a - b; })];
    var work = active.size;

    for (var i = 0; i < text.length; i += 1) {
      var ch = text[i];
      var next = new Set();
      active.forEach(function (state) {
        work += 1;
        if (state === 1 && ch === "a") next.add(2);
        if (state === 4 && ch === "b") next.add(5);
      });
      active = epsilonClosure(next);
      work += active.size;
      history.push(Array.from(active).sort(function (a, b) { return a - b; }));
    }

    return {
      engine: "thompson",
      history: history,
      match: active.has(5),
      pattern: "Thompson NFA for ^(a+)+b$",
      segmentations: 1,
      work: work
    };
  }

  function curve(params) {
    var points = [];
    for (var n = 1; n <= params.maxPlot; n += 1) {
      points.push({
        n: n,
        backtrack: backtrackingStats(params, n).work,
        thompson: thompsonStats(params, n).work,
        rewrite: rewriteStats(params, n).work
      });
    }
    return points;
  }

  function buildTree(depth) {
    var nodes = [{ id: 0, level: 0, xIndex: 0, label: "start" }];
    var edges = [];
    var frontier = [nodes[0]];
    var nextId = 1;
    for (var level = 1; level <= depth; level += 1) {
      var next = [];
      frontier.forEach(function (parent, index) {
        ["join", "cut"].forEach(function (choice, side) {
          var node = {
            id: nextId,
            level: level,
            xIndex: index * 2 + side,
            label: choice
          };
          nextId += 1;
          nodes.push(node);
          edges.push({ from: parent.id, to: node.id, label: choice });
          next.push(node);
        });
      });
      frontier = next;
    }
    return { nodes: nodes, edges: edges };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var selected = {
      backtrack: backtrackingStats(params, params.aCount),
      thompson: thompsonStats(params, params.aCount),
      rewrite: rewriteStats(params, params.aCount)
    };
    return {
      params: params,
      text: inputString(params, params.aCount),
      selected: selected,
      curve: curve(params),
      tree: buildTree(Math.min(6, Math.max(1, params.aCount - 1))),
      highlighted: selected[params.highlight]
    };
  }

  function metric(label, value, tone) {
    var klass = "regex-lab__metric";
    if (tone) klass += " regex-lab__metric--" + tone;
    return "<div class=\"" + klass + "\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var b = data.selected.backtrack;
    var t = data.selected.thompson;
    var r = data.selected.rewrite;
    var ratio = b.work / Math.max(1, t.work);
    var html = [
      metric("Backtracking work", formatCompact(b.work), b.work > 100000 ? "bad" : "warn"),
      metric("Thompson work", formatCompact(t.work), "good"),
      metric("Work ratio", formatRatio(ratio), ratio > 100 ? "bad" : "warn"),
      metric("Partitions tried", formatCompact(b.segmentations), b.segmentations > 100000 ? "bad" : "warn"),
      metric("Rewrite work", formatCompact(r.work), "good"),
      metric("Match result", b.match ? "match" : "no match", b.match ? "good" : "warn")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function labelFor(key, value) {
    if (key === "suffix") return value === "present" ? "a...ab" : "a...a";
    if (key === "highlight") {
      return {
        backtrack: "backtracking",
        thompson: "Thompson NFA",
        rewrite: "rewrite"
      }[value];
    }
    return String(value);
  }

  function updateControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null) input.value = String(params[key]);
    });
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (params[key] != null) output.textContent = labelFor(key, params[key]);
    });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function label(ctx, value, x, y, color, size, weight, align, baseline) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "middle";
    setFont(ctx, size || 12, weight || 500);
    ctx.fillText(value, x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = box.fill || "#ffffff";
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, title, box.x + 16, box.y + 23, COLORS.text, 13, 760);
    if (subtitle) label(ctx, subtitle, box.x + 16, box.y + 42, COLORS.muted, 10, 550);
  }

  function drawCurve(ctx, data, box) {
    panel(ctx, box, "Work grows with the wrong search", "log scale, same language");
    var left = box.x + 54;
    var right = box.x + box.w - 24;
    var top = box.y + 60;
    var bottom = box.y + box.h - 40;
    var w = right - left;
    var h = bottom - top;
    var maxWork = Math.max.apply(null, data.curve.map(function (point) {
      return Math.max(point.backtrack, point.thompson, point.rewrite);
    }));
    var minWork = 1;

    function px(n) {
      return left + w * (n - 1) / Math.max(1, data.params.maxPlot - 1);
    }

    function py(work) {
      var value = Math.log10(Math.max(minWork, work));
      var maxValue = Math.log10(maxWork);
      return bottom - h * value / Math.max(1, maxValue);
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [1, 100, 10000, 1000000, 100000000].forEach(function (tick) {
      if (tick > maxWork) return;
      var y = py(tick);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      label(ctx, formatCompact(tick), left - 8, y, COLORS.muted, 10, 550, "right");
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    function drawLine(key, color, name) {
      ctx.strokeStyle = color;
      ctx.lineWidth = key === data.params.highlight ? 3 : 2;
      ctx.beginPath();
      data.curve.forEach(function (point, index) {
        var x = px(point.n);
        var y = py(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      var last = data.curve[data.curve.length - 1];
      label(ctx, name, px(last.n) - 4, py(last[key]) - 12, color, 10, 760, "right");
    }

    drawLine("backtrack", COLORS.backtrack, "backtracking");
    drawLine("thompson", COLORS.thompson, "NFA");
    drawLine("rewrite", COLORS.rewrite, "rewrite");
    label(ctx, "number of a characters", right, box.y + box.h - 16, COLORS.muted, 10, 550, "right");
  }

  function drawTree(ctx, data, box) {
    panel(ctx, box, "The hidden binary choices", "each gap can be a cut or not");
    var depth = Math.min(6, Math.max(1, data.params.aCount - 1));
    var tree = data.tree;
    var left = box.x + 28;
    var right = box.x + box.w - 28;
    var top = box.y + 64;
    var bottom = box.y + box.h - 44;
    var levelH = (bottom - top) / Math.max(1, depth);
    var byId = {};
    tree.nodes.forEach(function (node) {
      var countAtLevel = Math.pow(2, node.level);
      var span = right - left;
      node.x = left + span * (node.xIndex + 0.5) / countAtLevel;
      node.y = top + levelH * node.level;
      byId[node.id] = node;
    });

    ctx.strokeStyle = "rgba(180, 83, 9, 0.26)";
    ctx.lineWidth = 1;
    tree.edges.forEach(function (edge) {
      var from = byId[edge.from];
      var to = byId[edge.to];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    tree.nodes.forEach(function (node) {
      ctx.fillStyle = node.level === depth ? "rgba(190, 18, 60, 0.22)" : "rgba(180, 83, 9, 0.70)";
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.level === depth ? 2.4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    });

    var shownLeaves = Math.pow(2, depth);
    var totalLeaves = Math.pow(2, Math.max(0, data.params.aCount - 1));
    label(ctx, "shown leaves: " + formatCompact(shownLeaves), left, box.y + box.h - 20, COLORS.muted, 10, 550);
    label(ctx, "actual partitions: " + formatCompact(totalLeaves), right, box.y + box.h - 20, COLORS.backtrack, 10, 760, "right");

    var chars = "a".repeat(Math.min(7, data.params.aCount));
    var x0 = box.x + 18;
    label(ctx, "input prefix: " + chars + (data.params.aCount > 7 ? "..." : ""), x0, box.y + 45, COLORS.muted, 10, 550);
  }

  function drawNfa(ctx, data, box) {
    panel(ctx, box, "Thompson simulation keeps a set", "active states after each character");
    var history = data.selected.thompson.history;
    var maxCols = Math.min(history.length, 22);
    var rows = [
      "start",
      "a",
      "split",
      "outer",
      "b",
      "accept"
    ];
    var left = box.x + 64;
    var top = box.y + 62;
    var cellW = Math.min(18, (box.w - 88) / maxCols);
    var cellH = Math.min(20, (box.h - 96) / rows.length);

    rows.forEach(function (row, i) {
      label(ctx, row, left - 8, top + i * cellH + cellH / 2, COLORS.muted, 9, 600, "right");
    });

    for (var col = 0; col < maxCols; col += 1) {
      var active = new Set(history[col]);
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        ctx.fillStyle = active.has(rowIndex) ? COLORS.active : COLORS.inactive;
        roundRect(ctx, left + col * cellW, top + rowIndex * cellH, Math.max(4, cellW - 2), Math.max(4, cellH - 2), 3);
        ctx.fill();
      }
    }

    var text = data.text;
    for (var i = 0; i < maxCols; i += 1) {
      var ch = i === 0 ? "0" : text[i - 1] || "";
      label(ctx, ch, left + i * cellW + cellW / 2, top - 12, COLORS.muted, 9, 600, "center");
    }

    if (history.length > maxCols) {
      label(ctx, "...", left + maxCols * cellW + 4, top + 2 * cellH, COLORS.muted, 12, 700);
    }
    label(ctx, "purple = state currently alive", box.x + box.w - 18, box.y + box.h - 20, COLORS.muted, 10, 550, "right");
  }

  function drawCanvas(canvas, data) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 700;
    var height = compact ? 850 : 610;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (compact) {
      drawCurve(ctx, data, { x: 8, y: 8, w: width - 16, h: 305, fill: COLORS.panel });
      drawTree(ctx, data, { x: 8, y: 328, w: width - 16, h: 245 });
      drawNfa(ctx, data, { x: 8, y: 588, w: width - 16, h: 254, fill: COLORS.panel });
    } else {
      drawCurve(ctx, data, { x: 8, y: 8, w: Math.round(width * 0.58) - 14, h: height - 16, fill: COLORS.panel });
      drawTree(ctx, data, { x: Math.round(width * 0.58) + 4, y: 8, w: width - Math.round(width * 0.58) - 12, h: 292 });
      drawNfa(ctx, data, { x: Math.round(width * 0.58) + 4, y: 314, w: width - Math.round(width * 0.58) - 12, h: height - 322, fill: COLORS.panel });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    updateControls(root, params);
    var data = simulate(params);
    renderMetrics(root, data);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, data);
  }

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll("[data-regex-lab]")).forEach(function (root) {
      var draw = function () {
        try {
          render(root);
        } catch (error) {
          var target = root.querySelector("[data-metrics]");
          if (target) target.innerHTML = metric("Lab error", error.message || String(error), "bad");
          throw error;
        }
      };
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", draw);
        input.addEventListener("change", draw);
      });
      draw();
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  global.RegexBacktrackingLab = {
    cleanParams: cleanParams,
    simulate: simulate
  };
})(typeof window !== "undefined" ? window : globalThis);
