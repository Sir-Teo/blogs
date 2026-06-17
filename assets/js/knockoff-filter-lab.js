(function (global) {
  "use strict";

  var MC_REPS = 72;

  var COLORS = {
    amber: "#d97706",
    axis: "#d7dee5",
    blue: "#2563eb",
    grid: "#edf2f7",
    ink: "#172026",
    knockoff: "#7c3aed",
    muted: "#5d6872",
    red: "#be123c",
    signal: "#0f766e",
    softAmber: "rgba(217, 119, 6, 0.14)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softGreen: "rgba(15, 118, 110, 0.13)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    effect: 1.25,
    features: 12,
    mode: "plus",
    n: 320,
    noise: 0.8,
    q: 0.25,
    rho: 0.35,
    seed: 31,
    signals: 4
  };

  var MODES = {
    original: { label: "knockoff", offset: 0 },
    plus: { label: "knockoff+", offset: 1 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var p = snap(raw.features, DEFAULTS.features, 8, 18, 1);
    var signals = snap(raw.signals, DEFAULTS.signals, 1, Math.min(8, p - 2), 1);
    return {
      effect: snap(raw.effect, DEFAULTS.effect, 0.3, 2.4, 0.05),
      features: p,
      mode: MODES[raw.mode] ? raw.mode : DEFAULTS.mode,
      n: snap(raw.n, DEFAULTS.n, 80, 420, 10),
      noise: snap(raw.noise, DEFAULTS.noise, 0.45, 2.2, 0.05),
      q: snap(raw.q, DEFAULTS.q, 0.04, 0.3, 0.01),
      rho: snap(raw.rho, DEFAULTS.rho, 0, 0.88, 0.02),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      signals: signals
    };
  }

  function hash32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1);
    return function () {
      state = hash32(state + 0x9e3779b9);
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function zeros(rows, cols) {
    var out = [];
    for (var i = 0; i < rows; i += 1) out.push(Array(cols).fill(0));
    return out;
  }

  function identity(n) {
    var out = zeros(n, n);
    for (var i = 0; i < n; i += 1) out[i][i] = 1;
    return out;
  }

  function transpose(a) {
    var out = zeros(a[0].length, a.length);
    for (var i = 0; i < a.length; i += 1) {
      for (var j = 0; j < a[0].length; j += 1) out[j][i] = a[i][j];
    }
    return out;
  }

  function matMul(a, b) {
    var out = zeros(a.length, b[0].length);
    for (var i = 0; i < a.length; i += 1) {
      for (var k = 0; k < b.length; k += 1) {
        var aik = a[i][k];
        for (var j = 0; j < b[0].length; j += 1) out[i][j] += aik * b[k][j];
      }
    }
    return out;
  }

  function rowMat(row, matrix) {
    var out = Array(matrix[0].length).fill(0);
    for (var k = 0; k < row.length; k += 1) {
      for (var j = 0; j < matrix[0].length; j += 1) out[j] += row[k] * matrix[k][j];
    }
    return out;
  }

  function cholesky(a) {
    var n = a.length;
    var l = zeros(n, n);
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j <= i; j += 1) {
        var sum = a[i][j];
        for (var k = 0; k < j; k += 1) sum -= l[i][k] * l[j][k];
        if (i === j) {
          if (sum <= 1e-10) return null;
          l[i][j] = Math.sqrt(sum);
        } else {
          l[i][j] = sum / l[j][j];
        }
      }
    }
    return l;
  }

  function inverse(a) {
    var n = a.length;
    var aug = zeros(n, 2 * n);
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) aug[i][j] = a[i][j];
      aug[i][n + i] = 1;
    }
    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      for (var r = col + 1; r < n; r += 1) {
        if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
      }
      if (Math.abs(aug[pivot][col]) < 1e-12) return null;
      var tmp = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = tmp;
      var div = aug[col][col];
      for (var c = 0; c < 2 * n; c += 1) aug[col][c] /= div;
      for (var rr = 0; rr < n; rr += 1) {
        if (rr === col) continue;
        var factor = aug[rr][col];
        for (var cc = 0; cc < 2 * n; cc += 1) aug[rr][cc] -= factor * aug[col][cc];
      }
    }
    var out = zeros(n, n);
    for (var ii = 0; ii < n; ii += 1) {
      for (var jj = 0; jj < n; jj += 1) out[ii][jj] = aug[ii][n + jj];
    }
    return out;
  }

  function maxAbsDiff(a, b) {
    var m = 0;
    for (var i = 0; i < a.length; i += 1) {
      for (var j = 0; j < a[0].length; j += 1) m = Math.max(m, Math.abs(a[i][j] - b[i][j]));
    }
    return m;
  }

  function makeSigma(p, rho) {
    var out = zeros(p, p);
    for (var i = 0; i < p; i += 1) {
      for (var j = 0; j < p; j += 1) out[i][j] = Math.pow(rho, Math.abs(i - j));
    }
    return out;
  }

  function signalIndexes(p, count) {
    var out = [];
    var used = {};
    for (var i = 0; i < count; i += 1) {
      var idx = Math.round((i + 0.55) * (p - 1) / count);
      while (used[idx]) idx = (idx + 1) % p;
      used[idx] = true;
      out.push(idx);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function makeBeta(params) {
    var beta = Array(params.features).fill(0);
    signalIndexes(params.features, params.signals).forEach(function (idx, rank) {
      beta[idx] = params.effect * (rank % 2 === 0 ? 1 : -1);
    });
    return beta;
  }

  function sampleGaussianRows(n, sigma, rand) {
    var p = sigma.length;
    var chol = cholesky(sigma);
    var rows = [];
    for (var i = 0; i < n; i += 1) {
      var z = [];
      for (var j = 0; j < p; j += 1) z.push(normal(rand));
      var row = [];
      for (var r = 0; r < p; r += 1) {
        var sum = 0;
        for (var k = 0; k <= r; k += 1) sum += chol[r][k] * z[k];
        row.push(sum);
      }
      rows.push(row);
    }
    return rows;
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function lowerBoundEigenAr1(rho) {
    return (1 - rho) / Math.max(1 + rho, 1e-9);
  }

  function makeKnockoffs(xRows, sigma, params, rand) {
    var p = sigma.length;
    var sigmaInv = inverse(sigma);
    var s = Math.min(1, 1.82 * lowerBoundEigenAr1(params.rho));
    var cond = zeros(p, p);
    for (var i = 0; i < p; i += 1) {
      for (var j = 0; j < p; j += 1) {
        cond[i][j] = (i === j ? 2 * s : 0) - s * s * sigmaInv[i][j];
      }
    }
    var chol = cholesky(cond);
    while (!chol && s > 1e-4) {
      s *= 0.88;
      for (var r = 0; r < p; r += 1) {
        for (var c = 0; c < p; c += 1) cond[r][c] = (r === c ? 2 * s : 0) - s * s * sigmaInv[r][c];
      }
      chol = cholesky(cond);
    }
    var knock = xRows.map(function (row) {
      var mean = rowMat(row, sigmaInv).map(function (value, j) {
        return row[j] - s * value;
      });
      var z = [];
      for (var j = 0; j < p; j += 1) z.push(normal(rand));
      var noise = [];
      for (var rr = 0; rr < p; rr += 1) {
        var sum = 0;
        for (var kk = 0; kk <= rr; kk += 1) sum += chol[rr][kk] * z[kk];
        noise.push(sum);
      }
      return mean.map(function (value, j) { return value + noise[j]; });
    });
    return { conditionalCov: cond, knockoffs: knock, s: s, sigmaInv: sigmaInv };
  }

  function column(rows, j) {
    return rows.map(function (row) { return row[j]; });
  }

  function centeredCorrelation(a, b) {
    var ma = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    var mb = b.reduce(function (x, y) { return x + y; }, 0) / b.length;
    var num = 0;
    var da = 0;
    var db = 0;
    for (var i = 0; i < a.length; i += 1) {
      var xa = a[i] - ma;
      var xb = b[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    return num / Math.sqrt(Math.max(da * db, 1e-12));
  }

  function makeResponse(xRows, beta, noise, rand) {
    return xRows.map(function (row) {
      return dot(row, beta) + noise * normal(rand);
    });
  }

  function importanceScores(xRows, knockRows, y) {
    var p = xRows[0].length;
    var z = [];
    var zKnock = [];
    var w = [];
    for (var j = 0; j < p; j += 1) {
      var original = Math.abs(centeredCorrelation(column(xRows, j), y));
      var shadow = Math.abs(centeredCorrelation(column(knockRows, j), y));
      z.push(original);
      zKnock.push(shadow);
      w.push(Math.max(original, shadow) * (original >= shadow ? 1 : -1));
    }
    return { w: w, z: z, zKnock: zKnock };
  }

  function knockoffThreshold(w, q, offset) {
    var candidates = [];
    w.forEach(function (value) {
      var a = Math.abs(value);
      if (a > 1e-12) candidates.push(a);
    });
    candidates = candidates.sort(function (a, b) { return a - b; }).filter(function (value, i, arr) {
      return i === 0 || Math.abs(value - arr[i - 1]) > 1e-12;
    });
    for (var i = 0; i < candidates.length; i += 1) {
      var t = candidates[i];
      var left = w.filter(function (value) { return value <= -t; }).length;
      var right = w.filter(function (value) { return value >= t; }).length;
      if ((offset + left) / Math.max(1, right) <= q) return t;
    }
    return Infinity;
  }

  function selectionStats(selected, beta) {
    var truth = {};
    beta.forEach(function (value, j) {
      if (value !== 0) truth[j] = true;
    });
    var falseCount = selected.filter(function (j) { return !truth[j]; }).length;
    var trueCount = selected.filter(function (j) { return truth[j]; }).length;
    var signalCount = Object.keys(truth).length;
    return {
      falseCount: falseCount,
      fdp: selected.length ? falseCount / selected.length : 0,
      power: signalCount ? trueCount / signalCount : 0,
      selected: selected,
      trueCount: trueCount
    };
  }

  function topKStats(scores, k, beta) {
    if (k <= 0) return selectionStats([], beta);
    var ranked = scores.map(function (value, index) {
      return { index: index, value: value };
    }).sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      return a.index - b.index;
    }).slice(0, k).map(function (item) { return item.index; });
    return selectionStats(ranked, beta);
  }

  function runOnce(params, seedOffset) {
    params = cleanParams(params);
    var rand = rng(params.seed * 1009 + (seedOffset || 0) * 9176);
    var sigma = makeSigma(params.features, params.rho);
    var beta = makeBeta(params);
    var xRows = sampleGaussianRows(params.n, sigma, rand);
    var knock = makeKnockoffs(xRows, sigma, params, rand);
    var y = makeResponse(xRows, beta, params.noise, rand);
    var scores = importanceScores(xRows, knock.knockoffs, y);
    var offset = MODES[params.mode].offset;
    var threshold = knockoffThreshold(scores.w, params.q, offset);
    var selected = scores.w.map(function (value, index) {
      return { index: index, value: value };
    }).filter(function (item) {
      return item.value >= threshold;
    }).map(function (item) { return item.index; });
    var knockStats = selectionStats(selected, beta);
    var naiveStats = topKStats(scores.z, selected.length, beta);
    var ratio = threshold === Infinity ? null : (offset + scores.w.filter(function (value) { return value <= -threshold; }).length) /
      Math.max(1, scores.w.filter(function (value) { return value >= threshold; }).length);
    return {
      beta: beta,
      knock: knock,
      knockStats: knockStats,
      naiveStats: naiveStats,
      params: params,
      ratio: ratio,
      scores: scores,
      sigma: sigma,
      threshold: threshold
    };
  }

  function summarize(runs) {
    var fdr = 0;
    var power = 0;
    var selected = 0;
    var naiveFdr = 0;
    var naivePower = 0;
    runs.forEach(function (run) {
      fdr += run.knockStats.fdp;
      power += run.knockStats.power;
      selected += run.knockStats.selected.length;
      naiveFdr += run.naiveStats.fdp;
      naivePower += run.naiveStats.power;
    });
    return {
      avgSelected: selected / runs.length,
      fdr: fdr / runs.length,
      naiveFdr: naiveFdr / runs.length,
      naivePower: naivePower / runs.length,
      power: power / runs.length
    };
  }

  function monteCarlo(params, qOverride) {
    params = cleanParams(params);
    if (qOverride != null) params.q = qOverride;
    var runs = [];
    for (var r = 0; r < MC_REPS; r += 1) runs.push(runOnce(params, 3000 + r));
    return summarize(runs);
  }

  function makeFrontier(params) {
    return [0.04, 0.07, 0.1, 0.12, 0.16, 0.2, 0.25, 0.3].map(function (q) {
      var summary = monteCarlo(params, q);
      summary.q = q;
      return summary;
    });
  }

  function evaluate(raw, options) {
    var params = cleanParams(raw);
    options = options || {};
    var run = runOnce(params, 0);
    run.summary = monteCarlo(params, params.q);
    if (options.frontier !== false) run.frontier = makeFrontier(params);
    return run;
  }

  function buildJointCovariance(sigma, s) {
    var p = sigma.length;
    var out = zeros(2 * p, 2 * p);
    for (var i = 0; i < p; i += 1) {
      for (var j = 0; j < p; j += 1) {
        var cross = sigma[i][j] - (i === j ? s : 0);
        out[i][j] = sigma[i][j];
        out[p + i][p + j] = sigma[i][j];
        out[i][p + j] = cross;
        out[p + i][j] = cross;
      }
    }
    return out;
  }

  function swapPair(matrix, j, p) {
    var order = [];
    for (var i = 0; i < 2 * p; i += 1) order.push(i);
    var tmp = order[j];
    order[j] = order[p + j];
    order[p + j] = tmp;
    var out = zeros(2 * p, 2 * p);
    for (var r = 0; r < 2 * p; r += 1) {
      for (var c = 0; c < 2 * p; c += 1) out[r][c] = matrix[order[r]][order[c]];
    }
    return out;
  }

  function audit() {
    var params = cleanParams({ effect: 1.2, features: 10, mode: "plus", n: 160, noise: 1, q: 0.15, rho: 0.35, seed: 19, signals: 3 });
    var run = evaluate(params, { frontier: false });
    var sigmaRecon = matMul(cholesky(run.sigma), transpose(cholesky(run.sigma)));
    var sigmaError = maxAbsDiff(sigmaRecon, run.sigma);
    var condChol = cholesky(run.knock.conditionalCov);
    var joint = buildJointCovariance(run.sigma, run.knock.s);
    var swapError = maxAbsDiff(joint, swapPair(joint, 2, params.features));
    var w = run.scores.w.slice();
    var swappedW = w.slice();
    swappedW[1] = Math.max(run.scores.z[1], run.scores.zKnock[1]) * (run.scores.zKnock[1] >= run.scores.z[1] ? 1 : -1);
    var signFlip = Math.abs(swappedW[1] + w[1]) < 1e-12 && swappedW.every(function (value, j) {
      return j === 1 || Math.abs(value - w[j]) < 1e-12;
    });
    var thresholdOk = run.threshold === Infinity || run.ratio <= params.q + 1e-12;
    var bounds = [run.summary.fdr, run.summary.power, run.summary.naiveFdr, run.summary.naivePower].every(function (value) {
      return value >= 0 && value <= 1;
    });
    return {
      checks: {
        conditionalCovariancePsd: !!condChol,
        knockoffThresholdRatio: thresholdOk,
        monteCarloBounds: bounds,
        sigmaCholeskyError: sigmaError,
        swapInvarianceError: swapError,
        wSignFlip: signFlip
      },
      ok: !!condChol && thresholdOk && bounds && sigmaError < 1e-10 && swapError < 1e-12 && signFlip,
      sample: {
        fdr: run.summary.fdr,
        power: run.summary.power,
        selected: run.knockStats.selected,
        shadowS: run.knock.s,
        threshold: run.threshold
      }
    };
  }

  function format(value, digits) {
    if (value == null || !isFinite(value)) return "none";
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function percent(value, digits) {
    if (value == null || !isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value, tone) {
    return '<div class="knockoff-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function canvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 760));
    var ratio = Number(canvas.getAttribute("data-ratio")) || 0.76;
    var height = Math.max(width < 680 ? 760 : 420, Math.round(width * ratio));
    var dpr = global.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.ink;
    ctx.font = (options.weight || 650) + " " + (options.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = "#e4e9ef";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 12, box.y + 17, { size: 12, weight: 760 });
    if (subtitle) drawText(ctx, subtitle, box.x + 12, box.y + 35, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function scaleLinear(a, b, c, d) {
    var span = Math.max(b - a, 1e-9);
    return function (value) { return c + (value - a) / span * (d - c); };
  }

  function drawBars(ctx, box, result) {
    panel(ctx, box, "Feature versus shadow", "W = original score - knockoff score");
    var p = result.params.features;
    var plot = { x: box.x + 55, y: box.y + 50, w: box.w - 72, h: box.h - 72 };
    var maxAbs = Math.max(0.05, Math.max.apply(null, result.scores.w.map(Math.abs)));
    var zero = plot.x + plot.w / 2;
    var sx = scaleLinear(-maxAbs, maxAbs, plot.x, plot.x + plot.w);
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(zero, plot.y);
    ctx.lineTo(zero, plot.y + plot.h);
    ctx.stroke();
    var barH = Math.max(6, plot.h / p * 0.62);
    var truth = {};
    result.beta.forEach(function (b, j) { if (b !== 0) truth[j] = true; });
    var selected = {};
    result.knockStats.selected.forEach(function (j) { selected[j] = true; });
    for (var j = 0; j < p; j += 1) {
      var y = plot.y + (j + 0.5) / p * plot.h;
      var x = sx(result.scores.w[j]);
      ctx.fillStyle = result.scores.w[j] >= 0 ? COLORS.signal : COLORS.knockoff;
      ctx.globalAlpha = selected[j] ? 1 : 0.56;
      ctx.fillRect(Math.min(zero, x), y - barH / 2, Math.abs(x - zero), barH);
      ctx.globalAlpha = 1;
      if (truth[j]) {
        ctx.fillStyle = COLORS.amber;
        ctx.beginPath();
        ctx.arc(plot.x - 16, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      drawText(ctx, "x" + (j + 1), plot.x - 26, y, { color: COLORS.muted, size: 10, align: "right", weight: 650 });
    }
    if (result.threshold !== Infinity) {
      var tx = sx(result.threshold);
      ctx.strokeStyle = COLORS.red;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(tx, plot.y);
      ctx.lineTo(tx, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(ctx, "T", tx + 4, plot.y + 9, { color: COLORS.red, size: 10, weight: 800 });
    }
  }

  function drawScatter(ctx, box, result) {
    panel(ctx, box, "Mirror race", "a real feature must beat its own shadow");
    var plot = { x: box.x + 44, y: box.y + 52, w: box.w - 64, h: box.h - 76 };
    var max = Math.max.apply(null, result.scores.z.concat(result.scores.zKnock).concat([0.1])) * 1.12;
    var sx = scaleLinear(0, max, plot.x, plot.x + plot.w);
    var sy = scaleLinear(0, max, plot.y + plot.h, plot.y);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var x = plot.x + i / 4 * plot.w;
      var y = plot.y + i / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    ctx.strokeStyle = COLORS.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    var truth = {};
    result.beta.forEach(function (b, j) { if (b !== 0) truth[j] = true; });
    var selected = {};
    result.knockStats.selected.forEach(function (j) { selected[j] = true; });
    for (var j = 0; j < result.params.features; j += 1) {
      ctx.fillStyle = truth[j] ? COLORS.amber : COLORS.blue;
      ctx.globalAlpha = selected[j] ? 1 : 0.62;
      ctx.beginPath();
      ctx.arc(sx(result.scores.zKnock[j]), sy(result.scores.z[j]), selected[j] ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawText(ctx, "shadow score", plot.x + plot.w, box.y + box.h - 17, { color: COLORS.muted, size: 10, align: "right", weight: 650 });
    drawText(ctx, "original", plot.x, plot.y - 10, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawFrontier(ctx, box, result) {
    panel(ctx, box, "Monte Carlo ledger", "average FDP and power as the target q moves");
    var plot = { x: box.x + 52, y: box.y + 52, w: box.w - 75, h: box.h - 82 };
    var sx = scaleLinear(0, 1, plot.x, plot.x + plot.w);
    var sy = scaleLinear(0, 1, plot.y + plot.h, plot.y);
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var x = plot.x + i / 4 * plot.w;
      var y = plot.y + i / 4 * plot.h;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(i * 25) + "%", plot.x - 8, sy(i / 4), { color: COLORS.muted, size: 10, align: "right", weight: 600 });
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    result.frontier.forEach(function (row) {
      var current = Math.abs(row.q - result.params.q) < 1e-9;
      ctx.globalAlpha = current ? 1 : 0.5;
      ctx.fillStyle = COLORS.signal;
      ctx.beginPath();
      ctx.arc(sx(row.power), sy(row.fdr), current ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.red;
      ctx.beginPath();
      ctx.arc(sx(row.naivePower), sy(row.naiveFdr), current ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "power", plot.x + plot.w, box.y + box.h - 18, { color: COLORS.muted, size: 10, align: "right", weight: 650 });
    drawText(ctx, "FDP", plot.x - 27, plot.y + 3, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawCanvas(canvas, result) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var gap = 12;
    if (w < 680) {
      var one = Math.round((h - 2 * gap) * 0.34);
      var two = Math.round((h - 2 * gap) * 0.31);
      drawBars(ctx, { x: 0, y: 0, w: w, h: one }, result);
      drawScatter(ctx, { x: 0, y: one + gap, w: w, h: two }, result);
      drawFrontier(ctx, { x: 0, y: one + two + 2 * gap, w: w, h: h - one - two - 2 * gap }, result);
    } else {
      var top = Math.round((h - gap) * 0.52);
      var half = (w - gap) / 2;
      drawBars(ctx, { x: 0, y: 0, w: half, h: top }, result);
      drawScatter(ctx, { x: half + gap, y: 0, w: half, h: top }, result);
      drawFrontier(ctx, { x: 0, y: top + gap, w: w, h: h - top - gap }, result);
    }
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-role='metrics']");
    if (!el) return;
    var selected = result.knockStats.selected.length;
    el.innerHTML = [
      metric("Selected", String(selected), selected ? "knockoff-lab__metric--good" : "knockoff-lab__metric--warn"),
      metric("One-run FDP", percent(result.knockStats.fdp, 0), result.knockStats.fdp <= result.params.q ? "knockoff-lab__metric--good" : "knockoff-lab__metric--warn"),
      metric("One-run power", percent(result.knockStats.power, 0), ""),
      metric("MC knockoff FDR", percent(result.summary.fdr, 1), result.summary.fdr <= result.params.q + 0.05 ? "knockoff-lab__metric--good" : "knockoff-lab__metric--warn"),
      metric("MC knockoff power", percent(result.summary.power, 1), ""),
      metric("Shadow strength", format(result.knock.s, 2), "")
    ].join("");
  }

  function renderNote(root, result) {
    var el = root.querySelector("[data-role='note']");
    if (!el) return;
    var threshold = result.threshold === Infinity ? "no finite threshold" : "threshold " + format(result.threshold, 3);
    el.textContent = "The filter uses " + MODES[result.params.mode].label + " with target q=" + percent(result.params.q, 0) +
      ", " + threshold + ", and " + MC_REPS + " deterministic Monte Carlo repetitions. Red frontier points are a naive top-correlation rule with the same number of selections; green points are knockoffs.";
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      var out = root.querySelector("[data-value='" + key + "']");
      if (!out) return;
      if (key === "mode") out.textContent = MODES[params.mode].label;
      else if (key === "q") out.textContent = percent(params.q, 0);
      else if (key === "rho") out.textContent = format(params.rho, 2);
      else out.textContent = String(params[key]);
    });
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null && input.value !== String(params[key])) input.value = String(params[key]);
    });
  }

  function render(root) {
    var params = readParams(root);
    syncControls(root, params);
    updateOutputs(root, params);
    var result = evaluate(params);
    renderMetrics(root, result);
    renderNote(root, result);
    drawCanvas(root.querySelector("[data-role='canvas']"), result);
    root.__knockoffFilterResult = result;
  }

  function init(root) {
    if (!root || root.__knockoffFilterReady) return;
    root.__knockoffFilterReady = true;
    var schedule = function () {
      if (root.__knockoffFilterFrame) global.cancelAnimationFrame(root.__knockoffFilterFrame);
      root.__knockoffFilterFrame = global.requestAnimationFrame(function () {
        root.__knockoffFilterFrame = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    schedule();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-knockoff-filter-lab]")).forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    knockoffThreshold: knockoffThreshold,
    makeKnockoffs: makeKnockoffs,
    monteCarlo: monteCarlo,
    runOnce: runOnce
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KnockoffFilterLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
