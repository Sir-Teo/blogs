(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    truth: "#64748b",
    mean: "#0f766e",
    band: "#99f6e4",
    acq: "#7c3aed",
    point: "#be123c",
    random: "#b45309",
    regret: "#2563eb"
  };

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var p = 0.3275911;
    var z = Math.abs(x);
    var t = 1 / (1 + p * z);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return sign * y;
  }

  function phi(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function normalPdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="bayesopt-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function objectiveValue(kind, x) {
    var y;
    if (kind === "needle") {
      y = 0.72 * Math.exp(-Math.pow((x - 0.30) / 0.16, 2))
        + 1.42 * Math.exp(-Math.pow((x - 0.81) / 0.038, 2))
        + 0.05 * Math.sin(20 * Math.PI * x);
    } else if (kind === "rugged") {
      y = 0.42 * Math.sin(7 * Math.PI * x + 0.4)
        + 0.32 * Math.sin(17 * Math.PI * x)
        + 0.95 * Math.exp(-Math.pow((x - 0.67) / 0.075, 2))
        + 0.42 * Math.exp(-Math.pow((x - 0.18) / 0.07, 2));
    } else {
      y = 1.10 * Math.exp(-Math.pow((x - 0.68) / 0.12, 2))
        + 0.72 * Math.exp(-Math.pow((x - 0.28) / 0.18, 2))
        + 0.07 * Math.sin(10 * Math.PI * x);
    }
    return y;
  }

  function kernel(a, b, lengthscale) {
    var d = (a - b) / Math.max(0.015, lengthscale);
    return Math.exp(-0.5 * d * d);
  }

  function cholesky(matrix) {
    var n = matrix.length;
    var L = [];
    var i;
    var j;
    var k;
    for (i = 0; i < n; i += 1) {
      L.push(new Array(n).fill(0));
      for (j = 0; j <= i; j += 1) {
        var sum = matrix[i][j];
        for (k = 0; k < j; k += 1) sum -= L[i][k] * L[j][k];
        if (i === j) L[i][j] = Math.sqrt(Math.max(sum, 1e-10));
        else L[i][j] = sum / L[j][j];
      }
    }
    return L;
  }

  function solveLower(L, b) {
    var n = L.length;
    var x = new Array(n).fill(0);
    for (var i = 0; i < n; i += 1) {
      var sum = b[i];
      for (var j = 0; j < i; j += 1) sum -= L[i][j] * x[j];
      x[i] = sum / L[i][i];
    }
    return x;
  }

  function solveUpperFromLower(L, b) {
    var n = L.length;
    var x = new Array(n).fill(0);
    for (var i = n - 1; i >= 0; i -= 1) {
      var sum = b[i];
      for (var j = i + 1; j < n; j += 1) sum -= L[j][i] * x[j];
      x[i] = sum / L[i][i];
    }
    return x;
  }

  function gpPosterior(points, grid, params) {
    var n = points.length;
    var lengthscale = params.lengthscale / 100;
    var noise = params.noise / 100;
    var y = points.map(function (point) { return point.y; });
    var K = [];
    var i;
    var j;
    for (i = 0; i < n; i += 1) {
      K.push([]);
      for (j = 0; j < n; j += 1) {
        K[i].push(kernel(points[i].x, points[j].x, lengthscale) + (i === j ? noise * noise + 1e-6 : 0));
      }
    }
    var L = cholesky(K);
    var alpha = solveUpperFromLower(L, solveLower(L, y));
    return grid.map(function (x) {
      var k = points.map(function (point) { return kernel(x, point.x, lengthscale); });
      var mean = 0;
      for (i = 0; i < n; i += 1) mean += k[i] * alpha[i];
      var v = solveLower(L, k);
      var variance = 1;
      for (i = 0; i < n; i += 1) variance -= v[i] * v[i];
      return {
        mean: mean,
        sigma: Math.sqrt(Math.max(1e-8, variance)),
        x: x
      };
    });
  }

  function acquisitionValue(policy, posteriorPoint, bestY, params, rand) {
    var sigma = Math.max(1e-6, posteriorPoint.sigma);
    var xi = params.exploration / 250;
    var imp = posteriorPoint.mean - bestY - xi;
    var z = imp / sigma;
    if (policy === "ucb") return posteriorPoint.mean + (0.45 + 3.2 * params.exploration / 100) * sigma;
    if (policy === "pi") return phi(z);
    if (policy === "exploit") return posteriorPoint.mean;
    if (policy === "random") return rand();
    if (policy === "grid") return 0;
    return Math.max(0, imp * phi(z) + sigma * normalPdf(z));
  }

  function trueGrid(kind, grid) {
    var values = grid.map(function (x) { return objectiveValue(kind, x); });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    return values.map(function (v) { return (v - min) / Math.max(1e-9, max - min); });
  }

  function pickGridPoint(points, grid) {
    var selected = {};
    points.forEach(function (point) {
      selected[Math.round(point.x * 1000)] = true;
    });
    var bestX = grid[0];
    var bestDistance = -1;
    grid.forEach(function (x) {
      var key = Math.round(x * 1000);
      if (selected[key]) return;
      var nearest = Infinity;
      points.forEach(function (point) {
        nearest = Math.min(nearest, Math.abs(x - point.x));
      });
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestX = x;
      }
    });
    return bestX;
  }

  function pickNext(points, posterior, grid, params, rand) {
    if (params.policy === "grid") return pickGridPoint(points, grid);
    var bestY = Math.max.apply(null, points.map(function (point) { return point.y; }));
    var taken = {};
    points.forEach(function (point) {
      taken[Math.round(point.x * 1000)] = true;
    });
    var best = posterior[0].x;
    var bestScore = -Infinity;
    posterior.forEach(function (p) {
      var key = Math.round(p.x * 1000);
      if (taken[key]) return;
      var score = acquisitionValue(params.policy, p, bestY, params, rand);
      if (score > bestScore) {
        bestScore = score;
        best = p.x;
      }
    });
    return best;
  }

  function simulate(params) {
    var grid = [];
    var i;
    for (i = 0; i <= 180; i += 1) grid.push(i / 180);
    var truth = trueGrid(params.objective, grid);
    var trueBest = Math.max.apply(null, truth);
    var trueBestX = grid[truth.indexOf(trueBest)];
    var rand = rng(20260613 + params.budget * 13 + params.noise * 17 + params.lengthscale * 19 + params.exploration * 23 + params.objective.length * 29 + params.policy.length * 31);
    var noise = params.noise / 100;
    var initial = [0.08, 0.46, 0.74];
    var points = initial.map(function (x) {
      return { x: x, y: objectiveValue(params.objective, x) + noise * normal(rand), initial: true };
    });
    var minTruth = Math.min.apply(null, grid.map(function (x) { return objectiveValue(params.objective, x); }));
    var maxTruth = Math.max.apply(null, grid.map(function (x) { return objectiveValue(params.objective, x); }));
    points.forEach(function (point) {
      point.y = (point.y - minTruth) / Math.max(1e-9, maxTruth - minTruth);
    });
    var trace = [];
    while (points.length < params.budget) {
      var posteriorNow = gpPosterior(points, grid, params);
      var nextX = pickNext(points, posteriorNow, grid, params, rand);
      var observed = objectiveValue(params.objective, nextX) + noise * normal(rand);
      var y = (observed - minTruth) / Math.max(1e-9, maxTruth - minTruth);
      points.push({ x: nextX, y: y, initial: false });
      var bestObserved = Math.max.apply(null, points.map(function (point) { return objectiveValue(params.objective, point.x); }));
      trace.push({
        best: (bestObserved - minTruth) / Math.max(1e-9, maxTruth - minTruth),
        n: points.length,
        regret: trueBest - (bestObserved - minTruth) / Math.max(1e-9, maxTruth - minTruth)
      });
    }
    var posterior = gpPosterior(points, grid, params);
    var bestPoint = points.reduce(function (best, point) {
      return objectiveValue(params.objective, point.x) > objectiveValue(params.objective, best.x) ? point : best;
    }, points[0]);
    var acq = posterior.map(function (p) {
      return acquisitionValue(params.policy, p, Math.max.apply(null, points.map(function (point) { return point.y; })), params, rand);
    });
    var maxAcq = Math.max.apply(null, acq);
    var minAcq = Math.min.apply(null, acq);
    return {
      acq: acq.map(function (v) { return (v - minAcq) / Math.max(1e-9, maxAcq - minAcq); }),
      best: (objectiveValue(params.objective, bestPoint.x) - minTruth) / Math.max(1e-9, maxTruth - minTruth),
      bestPoint: bestPoint,
      bestTruth: (objectiveValue(params.objective, bestPoint.x) - minTruth) / Math.max(1e-9, maxTruth - minTruth),
      grid: grid,
      posterior: posterior,
      points: points,
      regret: trueBest - (objectiveValue(params.objective, bestPoint.x) - minTruth) / Math.max(1e-9, maxTruth - minTruth),
      trace: trace,
      trueBestX: trueBestX,
      truth: truth
    };
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawLabel(ctx, title, box.x, box.y - 14, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      drawLabel(ctx, subtitle, box.x + box.w, box.y - 14, "right", "bottom", COLORS.muted);
    }
  }

  function xScale(box, x) {
    return box.x + x * box.w;
  }

  function yScale(box, y) {
    return box.y + box.h - clamp(y, -0.1, 1.25) / 1.25 * box.h;
  }

  function pathLine(ctx, box, xs, ys, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    xs.forEach(function (x, index) {
      var px = xScale(box, x);
      var py = yScale(box, ys[index]);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawPosterior(ctx, result, box) {
    panel(ctx, box, "Posterior search map", "truth, GP mean, uncertainty, samples");
    var xs = result.grid;
    var mean = result.posterior.map(function (p) { return p.mean; });
    var upper = result.posterior.map(function (p) { return p.mean + 1.65 * p.sigma; });
    var lower = result.posterior.map(function (p) { return p.mean - 1.65 * p.sigma; });
    ctx.fillStyle = COLORS.band;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    xs.forEach(function (x, index) {
      var px = xScale(box, x);
      var py = yScale(box, upper[index]);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (var i = xs.length - 1; i >= 0; i -= 1) ctx.lineTo(xScale(box, xs[i]), yScale(box, lower[i]));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    pathLine(ctx, box, xs, result.truth, COLORS.truth, 1.6);
    pathLine(ctx, box, xs, mean, COLORS.mean, 2);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xScale(box, result.trueBestX), box.y);
    ctx.lineTo(xScale(box, result.trueBestX), box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);

    result.points.forEach(function (point) {
      ctx.fillStyle = point.initial ? COLORS.random : COLORS.point;
      ctx.beginPath();
      ctx.arc(xScale(box, point.x), yScale(box, point.y), point.initial ? 3.5 : 4.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    drawLabel(ctx, "true best", xScale(box, result.trueBestX) + 6, box.y + 14, "left", "middle", COLORS.muted);
  }

  function drawAcquisition(ctx, result, box) {
    panel(ctx, box, "Acquisition surface", "normalized score for next sample");
    pathLine(ctx, box, result.grid, result.acq, COLORS.acq, 2);
    result.points.forEach(function (point) {
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(xScale(box, point.x), box.y);
      ctx.lineTo(xScale(box, point.x), box.y + box.h);
      ctx.stroke();
    });
  }

  function drawTrace(ctx, result, box) {
    panel(ctx, box, "Best-so-far regret", "lower is better");
    var values = result.trace.length ? result.trace.map(function (p) { return p.regret; }) : [result.regret];
    var max = Math.max.apply(null, values.concat([0.05]));
    function tx(index) {
      return box.x + index / Math.max(1, values.length - 1) * box.w;
    }
    function ty(value) {
      return box.y + box.h - (max - value) / Math.max(1e-9, max) * box.h;
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = box.y + tick * box.h;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.regret;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach(function (value, index) {
      if (index === 0) ctx.moveTo(tx(index), ty(value));
      else ctx.lineTo(tx(index), ty(value));
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "Run ledger", "final outcome");
    var rows = [
      { label: "best value", value: clamp(result.bestTruth, 0, 1), color: COLORS.mean, text: formatPercent(result.bestTruth, 0) },
      { label: "regret", value: clamp(1 - result.regret, 0, 1), color: COLORS.regret, text: formatPercent(result.regret, 1) },
      { label: "samples", value: clamp(result.points.length / 30, 0, 1), color: COLORS.point, text: String(result.points.length) },
      { label: "best x", value: clamp(result.bestPoint.x, 0, 1), color: COLORS.acq, text: formatNumber(result.bestPoint.x, 2) }
    ];
    var h = (box.h - 28) / rows.length;
    rows.forEach(function (row, index) {
      var y = box.y + 12 + index * h;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, h - 8);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x, y, box.w * row.value, h - 8);
      drawLabel(ctx, row.label, box.x + 7, y + (h - 8) / 2, "left", "middle", row.value > 0.36 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, row.text, box.x + box.w - 7, y + (h - 8) / 2, "right", "middle", row.value > 0.7 ? "#ffffff" : COLORS.text);
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 840 : 620;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 46 : 54;
    var right = compact ? 18 : 24;
    var plotW = width - left - right;

    if (compact) {
      drawPosterior(ctx, result, { x: left, y: 44, w: plotW, h: 240 });
      drawAcquisition(ctx, result, { x: left, y: 360, w: plotW, h: 125 });
      drawTrace(ctx, result, { x: left, y: 560, w: plotW, h: 105 });
      drawBars(ctx, result, { x: left, y: 735, w: plotW, h: 82 });
    } else {
      drawPosterior(ctx, result, { x: left, y: 44, w: plotW * 0.63, h: 310 });
      drawAcquisition(ctx, result, { x: left + plotW * 0.70, y: 44, w: plotW * 0.30, h: 145 });
      drawTrace(ctx, result, { x: left + plotW * 0.70, y: 274, w: plotW * 0.30, h: 120 });
      drawBars(ctx, result, { x: left, y: 448, w: plotW, h: 100 });
    }
  }

  function parseParams(root) {
    var params = {
      budget: 16,
      exploration: 35,
      lengthscale: 12,
      noise: 4,
      objective: "needle",
      policy: "ei"
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    params.budget = Math.max(4, Math.round(params.budget));
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "noise" || key === "lengthscale" || key === "exploration") output.textContent = params[key] + "%";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("best value", formatPercent(result.bestTruth, 1)),
      metric("regret", formatPercent(result.regret, 1)),
      metric("best x", formatNumber(result.bestPoint.x, 2)),
      metric("true best x", formatNumber(result.trueBestX, 2)),
      metric("evaluations", String(result.points.length)),
      metric("policy", params.policy.toUpperCase())
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-bayesopt-lab]"));
    labs.forEach(function (root) {
      if (root.__bayesoptLabReady) return;
      root.__bayesoptLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      gpPosterior: gpPosterior,
      simulate: simulate,
      objectiveValue: objectiveValue
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    }
    else init();
  }
}());
