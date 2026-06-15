(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    picard: "#64748b",
    relaxed: "#d97706",
    anderson: "#2563eb",
    guard: "#dc2626",
    best: "#0f766e",
    heatLow: "#ecfeff",
    heatMid: "#bfdbfe",
    heatHigh: "#7c3aed"
  };

  var DEFAULTS = {
    slow: 94,
    shear: 48,
    curve: 18,
    memory: 4,
    beta: 100,
    start: 140,
    angle: 125,
    steps: 24
  };

  var TARGET = { x: 0.35, y: -0.22 };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      slow: clamp(Math.round(readNumber(raw, "slow")), 70, 98),
      shear: clamp(Math.round(readNumber(raw, "shear")), 0, 80),
      curve: clamp(Math.round(readNumber(raw, "curve")), 0, 45),
      memory: clamp(Math.round(readNumber(raw, "memory")), 0, 7),
      beta: clamp(Math.round(readNumber(raw, "beta")), 35, 120),
      start: clamp(Math.round(readNumber(raw, "start")), 45, 210),
      angle: clamp(Math.round(readNumber(raw, "angle")), 0, 360),
      steps: clamp(Math.round(readNumber(raw, "steps")), 8, 50)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 2 : digits);
    if (Math.abs(value) >= 1) return value.toFixed(digits == null ? 3 : digits);
    if (Math.abs(value) >= 0.01) return value.toFixed(digits == null ? 4 : digits);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="aa-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scale(a, s) {
    return { x: a.x * s, y: a.y * s };
  }

  function norm(a) {
    return Math.sqrt(a.x * a.x + a.y * a.y);
  }

  function makeModel(params) {
    var slow = params.slow / 100;
    var fast = 0.33 + 0.19 * (1 - slow);
    var shear = params.shear / 100;
    var curve = params.curve / 100;
    return {
      params: params,
      slow: slow,
      fast: fast,
      shear: shear,
      curve: curve,
      beta: params.beta / 100
    };
  }

  function startPoint(params) {
    var r = params.start / 100;
    var a = params.angle * Math.PI / 180;
    return {
      x: TARGET.x + r * Math.cos(a),
      y: TARGET.y + r * Math.sin(a)
    };
  }

  function fixedMap(model, x) {
    var u = x.x - TARGET.x;
    var v = x.y - TARGET.y;
    var nonlinearX = model.curve * Math.tanh(1.15 * v) * (1 - 0.18 * Math.tanh(u * u));
    var nonlinearY = -0.62 * model.curve * Math.tanh(1.05 * u);
    return {
      x: TARGET.x + model.slow * u + model.shear * v + nonlinearX,
      y: TARGET.y + model.fast * v + nonlinearY
    };
  }

  function residual(model, x) {
    return sub(fixedMap(model, x), x);
  }

  function residualNorm(model, x) {
    return norm(residual(model, x));
  }

  function relaxedStep(model, x, beta) {
    return add(x, scale(residual(model, x), beta));
  }

  function solveLinear(a, b) {
    var n = b.length;
    var m = [];
    var i;
    for (i = 0; i < n; i += 1) m.push(a[i].slice().concat([b[i]]));
    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (i = col + 1; i < n; i += 1) {
        if (Math.abs(m[i][col]) > Math.abs(m[pivot][col])) pivot = i;
      }
      if (Math.abs(m[pivot][col]) < 1e-12) return null;
      if (pivot !== col) {
        var tmp = m[pivot];
        m[pivot] = m[col];
        m[col] = tmp;
      }
      var div = m[col][col];
      for (var j = col; j <= n; j += 1) m[col][j] /= div;
      for (i = 0; i < n; i += 1) {
        if (i === col) continue;
        var factor = m[i][col];
        for (j = col; j <= n; j += 1) m[i][j] -= factor * m[col][j];
      }
    }
    return m.map(function (row) { return row[n]; });
  }

  function andersonWeights(items, ridge) {
    var q = items.length;
    if (q === 1) return [1];
    var h = [];
    var rhs = [];
    var i;
    for (i = 0; i < q + 1; i += 1) {
      h.push([]);
      rhs.push(i === q ? 1 : 0);
      for (var j = 0; j < q + 1; j += 1) h[i].push(0);
    }
    for (i = 0; i < q; i += 1) {
      for (j = 0; j < q; j += 1) {
        h[i][j] = items[i].r.x * items[j].r.x + items[i].r.y * items[j].r.y;
      }
      h[i][i] += ridge;
      h[i][q] = 1;
      h[q][i] = 1;
    }
    var solution = solveLinear(h, rhs);
    if (!solution) {
      var fallback = [];
      for (i = 0; i < q - 1; i += 1) fallback.push(0);
      fallback.push(1);
      return fallback;
    }
    return solution.slice(0, q);
  }

  function mix(items, weights, beta) {
    var x = { x: 0, y: 0 };
    for (var i = 0; i < items.length; i += 1) {
      var candidate = add(items[i].x, scale(items[i].r, beta));
      x.x += weights[i] * candidate.x;
      x.y += weights[i] * candidate.y;
    }
    return x;
  }

  function runMethod(model, kind, memoryOverride) {
    var params = model.params;
    var beta = kind === "relaxed" ? 0.55 : model.beta;
    var x = startPoint(params);
    var rows = [];
    var history = [];
    var safeguards = 0;
    var maxCoeffL1 = 1;
    var lastWeights = [1];
    var bestRes = Infinity;
    var memory = memoryOverride == null ? params.memory : memoryOverride;
    for (var step = 0; step <= params.steps; step += 1) {
      var r = residual(model, x);
      var rn = norm(r);
      rows.push({ step: step, x: x.x, y: x.y, residual: rn, guarded: false });
      bestRes = Math.min(bestRes, rn);
      if (step === params.steps) break;

      var next;
      if (kind === "picard") {
        next = add(x, r);
      } else if (kind === "relaxed") {
        next = add(x, scale(r, beta));
      } else {
        history.push({ x: x, r: r });
        if (history.length > memory + 1) history.shift();
        var ridge = 1e-8 + 1e-5 * Math.pow(Math.max(0, 1 - model.slow), 2);
        var weights = andersonWeights(history, ridge);
        var coeffL1 = weights.reduce(function (s, v) { return s + Math.abs(v); }, 0);
        maxCoeffL1 = Math.max(maxCoeffL1, coeffL1);
        next = mix(history, weights, model.beta);
        var trialRes = residualNorm(model, next);
        if (!Number.isFinite(trialRes) || coeffL1 > 40 || trialRes > Math.max(rn * 1.35, bestRes * 2.2 + 1e-9)) {
          next = relaxedStep(model, x, Math.min(0.85, model.beta));
          history = [{ x: x, r: r }];
          weights = [1];
          safeguards += 1;
          rows[rows.length - 1].guarded = true;
        }
        lastWeights = weights;
      }
      x = next;
      if (!Number.isFinite(x.x) || !Number.isFinite(x.y) || norm(sub(x, TARGET)) > 40) {
        x = relaxedStep(model, rows.length ? { x: rows[rows.length - 1].x, y: rows[rows.length - 1].y } : startPoint(params), 0.25);
        safeguards += 1;
      }
    }
    return {
      kind: kind,
      rows: rows,
      final: rows[rows.length - 1],
      safeguards: safeguards,
      maxCoeffL1: maxCoeffL1,
      lastWeights: lastWeights
    };
  }

  function memorySweep(model) {
    var out = [];
    for (var m = 0; m <= 7; m += 1) {
      var run = runMethod(model, "anderson", m);
      out.push({
        memory: m,
        residual: run.final.residual,
        safeguards: run.safeguards,
        coeff: run.maxCoeffL1
      });
    }
    return out;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = makeModel(params);
    var picard = runMethod(model, "picard");
    var relaxed = runMethod(model, "relaxed");
    var anderson = runMethod(model, "anderson");
    var sweep = memorySweep(model);
    var speedup = picard.final.residual / Math.max(anderson.final.residual, 1e-14);
    var checks = {
      finite: [picard.final.residual, relaxed.final.residual, anderson.final.residual, speedup].every(Number.isFinite),
      boundedPath: [picard, relaxed, anderson].every(function (run) {
        return run.rows.every(function (row) {
          return Number.isFinite(row.x) && Number.isFinite(row.y) && Math.abs(row.x) < 50 && Math.abs(row.y) < 50;
        });
      }),
      residualImproves: anderson.final.residual < picard.rows[0].residual,
      sweepCount: sweep.length === 8,
      weightsSum: Math.abs(anderson.lastWeights.reduce(function (a, b) { return a + b; }, 0) - 1) < 1e-6
    };
    return {
      params: params,
      model: model,
      picard: picard,
      relaxed: relaxed,
      anderson: anderson,
      sweep: sweep,
      speedup: speedup,
      checks: checks
    };
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      slow: p.slow + "%",
      shear: p.shear + "%",
      curve: p.curve + "%",
      memory: p.memory,
      beta: (p.beta / 100).toFixed(2),
      start: (p.start / 100).toFixed(2),
      angle: p.angle + " deg",
      steps: p.steps
    };
    root.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (values[key] != null) node.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    node.innerHTML = [
      metric("Picard residual", fmt(result.picard.final.residual)),
      metric("Anderson residual", fmt(result.anderson.final.residual)),
      metric("Speedup", fmt(result.speedup, 1) + "x"),
      metric("Safeguards", String(result.anderson.safeguards)),
      metric("Coeff L1 max", fmt(result.anderson.maxCoeffL1, 2)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 620 ? 1120 : 780;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 4 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    return out.trim() + "...";
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    if (t < 0.5) {
      var a = t / 0.5;
      return "rgb(" + Math.round(236 + (191 - 236) * a) + "," + Math.round(254 + (219 - 254) * a) + "," + Math.round(255 + (254 - 255) * a) + ")";
    }
    var b = (t - 0.5) / 0.5;
    return "rgb(" + Math.round(191 + (124 - 191) * b) + "," + Math.round(219 + (58 - 219) * b) + "," + Math.round(254 + (237 - 254) * b) + ")";
  }

  function pathBounds(result) {
    var rows = result.picard.rows.concat(result.relaxed.rows, result.anderson.rows);
    var minX = TARGET.x - 1.2;
    var maxX = TARGET.x + 1.2;
    var minY = TARGET.y - 1.2;
    var maxY = TARGET.y + 1.2;
    rows.forEach(function (row) {
      minX = Math.min(minX, row.x);
      maxX = Math.max(maxX, row.x);
      minY = Math.min(minY, row.y);
      maxY = Math.max(maxY, row.y);
    });
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    var span = Math.max(maxX - minX, maxY - minY, 1.8) * 1.08;
    return { minX: cx - span / 2, maxX: cx + span / 2, minY: cy - span / 2, maxY: cy + span / 2 };
  }

  function drawTerrain(ctx, rect, result) {
    panel(ctx, rect, "Residual terrain", "paths through ||g(x) - x||");
    var bounds = pathBounds(result);
    var plot = { x: rect.x + 44, y: rect.y + 58, w: rect.w - 64, h: rect.h - 92 };
    var nx = 42;
    var ny = 42;
    var logs = [];
    var minLog = Infinity;
    var maxLog = -Infinity;
    for (var j = 0; j < ny; j += 1) {
      for (var i = 0; i < nx; i += 1) {
        var x = bounds.minX + (bounds.maxX - bounds.minX) * i / (nx - 1);
        var y = bounds.maxY - (bounds.maxY - bounds.minY) * j / (ny - 1);
        var l = Math.log10(residualNorm(result.model, { x: x, y: y }) + 1e-7);
        logs.push(l);
        minLog = Math.min(minLog, l);
        maxLog = Math.max(maxLog, l);
      }
    }
    logs.forEach(function (l, idx) {
      var i = idx % nx;
      var j = Math.floor(idx / nx);
      ctx.fillStyle = heatColor((l - minLog) / Math.max(1e-9, maxLog - minLog));
      ctx.fillRect(plot.x + i * plot.w / nx, plot.y + j * plot.h / ny, Math.ceil(plot.w / nx), Math.ceil(plot.h / ny));
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function sx(x) { return plot.x + (x - bounds.minX) / (bounds.maxX - bounds.minX) * plot.w; }
    function sy(y) { return plot.y + (bounds.maxY - y) / (bounds.maxY - bounds.minY) * plot.h; }
    function drawPath(run, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      run.rows.forEach(function (row, index) {
        var x = sx(row.x);
        var y = sy(row.y);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      var last = run.rows[run.rows.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx(last.x), sy(last.y), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPath(result.picard, COLORS.picard, 1.6);
    drawPath(result.relaxed, COLORS.relaxed, 1.8);
    drawPath(result.anderson, COLORS.anderson, 2.5);
    ctx.fillStyle = COLORS.best;
    ctx.beginPath();
    ctx.arc(sx(TARGET.x), sy(TARGET.y), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("fixed point", sx(TARGET.x) + 7, sy(TARGET.y) - 7);
  }

  function drawResiduals(ctx, rect, result) {
    panel(ctx, rect, "Residual history", "log scale; lower is better");
    var plot = { x: rect.x + 50, y: rect.y + 60, w: rect.w - 72, h: rect.h - 100 };
    var all = result.picard.rows.concat(result.relaxed.rows, result.anderson.rows).map(function (row) { return row.residual; });
    var minLog = Math.floor(Math.log10(Math.max(1e-10, Math.min.apply(null, all))));
    var maxLog = Math.ceil(Math.log10(Math.max.apply(null, all)));
    if (maxLog <= minLog) maxLog = minLog + 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function sx(row) { return plot.x + row.step / result.params.steps * plot.w; }
    function sy(value) {
      var l = Math.log10(Math.max(1e-10, value));
      return plot.y + plot.h * (1 - (l - minLog) / (maxLog - minLog));
    }
    function line(run, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      run.rows.forEach(function (row, index) {
        var x = sx(row);
        var y = sy(row.residual);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line(result.picard, COLORS.picard, 1.8);
    line(result.relaxed, COLORS.relaxed, 1.8);
    line(result.anderson, COLORS.anderson, 2.5);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("1e" + minLog, plot.x - 40, plot.y + plot.h + 4);
    ctx.fillText("1e" + maxLog, plot.x - 40, plot.y + 4);
    ctx.fillText("iteration", plot.x + plot.w - 50, plot.y + plot.h + 24);
  }

  function drawWeights(ctx, rect, result) {
    panel(ctx, rect, "Last Anderson mix", "affine weights on recent residuals");
    var plot = { x: rect.x + 44, y: rect.y + 66, w: rect.w - 66, h: rect.h - 110 };
    var weights = result.anderson.lastWeights;
    var maxAbs = Math.max(1, Math.max.apply(null, weights.map(function (w) { return Math.abs(w); })));
    var zeroY = plot.y + plot.h * 0.5;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    weights.forEach(function (w, i) {
      var bw = plot.w / Math.max(1, weights.length) * 0.62;
      var x = plot.x + (i + 0.19) / weights.length * plot.w;
      var h = Math.abs(w) / maxAbs * plot.h * 0.46;
      var y = w >= 0 ? zeroY - h : zeroY;
      ctx.fillStyle = w >= 0 ? COLORS.anderson : COLORS.guard;
      ctx.fillRect(x, y, bw, h);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(i - weights.length + 1), x + bw * 0.3, plot.y + plot.h + 18);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("sum = " + fmt(weights.reduce(function (a, b) { return a + b; }, 0), 2), plot.x, rect.y + rect.h - 18);
    ctx.fillText("negative bars extrapolate", plot.x + plot.w - 126, rect.y + rect.h - 18);
  }

  function drawSweep(ctx, rect, result) {
    panel(ctx, rect, "Memory sweep", "same problem, different window sizes");
    var plot = { x: rect.x + 48, y: rect.y + 64, w: rect.w - 70, h: rect.h - 104 };
    var logs = result.sweep.map(function (row) { return Math.log10(Math.max(1e-10, row.residual)); });
    var minLog = Math.floor(Math.min.apply(null, logs));
    var maxLog = Math.ceil(Math.max.apply(null, logs));
    if (maxLog <= minLog) maxLog = minLog + 1;
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    result.sweep.forEach(function (row, i) {
      var x = plot.x + (i + 0.18) / result.sweep.length * plot.w;
      var bw = plot.w / result.sweep.length * 0.62;
      var l = Math.log10(Math.max(1e-10, row.residual));
      var h = (maxLog - l) / (maxLog - minLog) * plot.h;
      ctx.fillStyle = row.memory === result.params.memory ? COLORS.anderson : COLORS.best;
      ctx.fillRect(x, plot.y + plot.h - h, bw, h);
      if (row.safeguards > 0) {
        ctx.fillStyle = COLORS.guard;
        ctx.beginPath();
        ctx.arc(x + bw / 2, plot.y + plot.h - h - 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(row.memory), x + bw * 0.34, plot.y + plot.h + 18);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("window m", plot.x + plot.w - 58, plot.y + plot.h + 20);
  }

  function drawLegend(ctx, x, y) {
    var items = [
      ["Picard", COLORS.picard],
      ["damped", COLORS.relaxed],
      ["Anderson", COLORS.anderson],
      ["fixed point", COLORS.best],
      ["safeguard", COLORS.guard]
    ];
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + i * 88;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(ox, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], ox + 8, y);
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var pad = 14;
    if (frame.width < 620) {
      drawTerrain(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 300 }, result);
      drawResiduals(ctx, { x: pad, y: 330, w: frame.width - pad * 2, h: 248 }, result);
      drawWeights(ctx, { x: pad, y: 594, w: frame.width - pad * 2, h: 230 }, result);
      drawSweep(ctx, { x: pad, y: 840, w: frame.width - pad * 2, h: frame.height - 856 }, result);
      drawLegend(ctx, pad + 14, frame.height - 16);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawTerrain(ctx, { x: pad, y: pad, w: col, h: 370 }, result);
      drawResiduals(ctx, { x: pad * 2 + col, y: pad, w: col, h: 370 }, result);
      drawWeights(ctx, { x: pad, y: 402, w: col, h: frame.height - 418 }, result);
      drawSweep(ctx, { x: pad * 2 + col, y: 402, w: col, h: frame.height - 418 }, result);
      drawLegend(ctx, pad + 18, frame.height - 18);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__andersonAccelerationResult = result;
  }

  function init(root) {
    if (!root || root.__andersonAccelerationReady) return;
    root.__andersonAccelerationReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var timer = null;
    global.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-anderson-acceleration-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    fixedMap: fixedMap,
    residual: residual,
    residualNorm: residualNorm,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AndersonAccelerationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
