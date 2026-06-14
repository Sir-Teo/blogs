(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    classic: "#2563eb",
    hpp: "#0f766e",
    exact: "#be123c",
    spectrum: "#7c3aed",
    heat: "#b45309",
    tail: "#94a3b8"
  };

  var DEFAULTS = {
    dimension: 72,
    matrix: "spiked",
    probe: "rademacher",
    probes: 36,
    seed: 29,
    trials: 72
  };

  var MATRICES = {
    diagonal: "diagonal smoother",
    flat: "flat spectrum",
    power: "slow power tail",
    spiked: "spiked low rank"
  };

  var PROBES = {
    gaussian: "Gaussian",
    rademacher: "Rademacher"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function gaussian(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 17, seed));
    var u2 = uniform(index * 2 + 18, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var matrix = String(raw.matrix || DEFAULTS.matrix);
    var probe = String(raw.probe || DEFAULTS.probe);
    if (!MATRICES[matrix]) matrix = DEFAULTS.matrix;
    if (!PROBES[probe]) probe = DEFAULTS.probe;
    return {
      dimension: clamp(Math.round(number(raw, "dimension")), 36, 108),
      matrix: matrix,
      probe: probe,
      probes: clamp(Math.round(number(raw, "probes")), 6, 72),
      seed: clamp(Math.round(number(raw, "seed")), 1, 9999),
      trials: clamp(Math.round(number(raw, "trials")), 24, 144)
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (digits != null) return value.toFixed(digits);
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="hutch-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function norm(a) {
    return Math.sqrt(Math.max(0, dot(a, a)));
  }

  function scaledAdd(target, source, scale) {
    for (var i = 0; i < target.length; i += 1) target[i] += scale * source[i];
  }

  function makeVector(n, type, seed) {
    var out = [];
    for (var i = 0; i < n; i += 1) {
      out.push(type === "rademacher" ? (uniform(i + 11, seed) < 0.5 ? -1 : 1) : gaussian(i + 11, seed));
    }
    return out;
  }

  function spectrum(params) {
    var n = params.dimension;
    var values = [];
    var i;
    if (params.matrix === "flat") {
      for (i = 0; i < n; i += 1) values.push(1.1 + 0.16 * Math.sin(i * 0.73 + params.seed * 0.01));
      return values;
    }
    if (params.matrix === "power") {
      for (i = 0; i < n; i += 1) values.push(7.5 / Math.pow(i + 1, 0.58) + 0.035);
      return values;
    }
    if (params.matrix === "spiked") {
      for (i = 0; i < n; i += 1) {
        if (i === 0) values.push(22);
        else if (i === 1) values.push(13);
        else if (i === 2) values.push(8);
        else if (i === 3) values.push(4.8);
        else values.push(0.75 * Math.exp(-(i - 4) / 18) + 0.035);
      }
      return values;
    }
    for (i = 0; i < n; i += 1) values.push(2.4 * Math.exp(-i / 30) + 0.08);
    return values;
  }

  function identityColumns(n) {
    var cols = [];
    for (var j = 0; j < n; j += 1) {
      var v = [];
      for (var i = 0; i < n; i += 1) v.push(i === j ? 1 : 0);
      cols.push(v);
    }
    return cols;
  }

  function orthonormalizeColumns(cols) {
    var basis = [];
    cols.forEach(function (col) {
      var v = col.slice();
      basis.forEach(function (q) {
        scaledAdd(v, q, -dot(v, q));
      });
      var len = norm(v);
      if (len > 1e-9) {
        for (var i = 0; i < v.length; i += 1) v[i] /= len;
        basis.push(v);
      }
    });
    return basis;
  }

  function randomOrthonormalColumns(n, seed) {
    var cols = [];
    for (var j = 0; j < n; j += 1) {
      var col = [];
      for (var i = 0; i < n; i += 1) col.push(gaussian(i * 131 + j * 977, seed + 404));
      cols.push(col);
    }
    return orthonormalizeColumns(cols);
  }

  function buildMatrix(params) {
    var n = params.dimension;
    var eig = spectrum(params);
    var cols = params.matrix === "diagonal" ? identityColumns(n) : randomOrthonormalColumns(n, params.seed);
    var A = [];
    var i;
    var j;
    var k;
    for (i = 0; i < n; i += 1) {
      var row = [];
      for (j = 0; j < n; j += 1) {
        var value = 0;
        for (k = 0; k < n; k += 1) value += cols[k][i] * eig[k] * cols[k][j];
        row.push(value);
      }
      A.push(row);
    }

    var trace = 0;
    var diagTrace = 0;
    var fro2 = 0;
    var diag2 = 0;
    var symmetry = 0;
    for (i = 0; i < n; i += 1) {
      trace += eig[i];
      diagTrace += A[i][i];
      diag2 += A[i][i] * A[i][i];
      for (j = 0; j < n; j += 1) {
        fro2 += A[i][j] * A[i][j];
        symmetry = Math.max(symmetry, Math.abs(A[i][j] - A[j][i]));
      }
    }
    var topCount = Math.min(5, eig.length);
    var topMass = eig.slice(0, topCount).reduce(function (sum, value) { return sum + value; }, 0) / trace;
    var hppRank = Math.max(1, Math.floor(params.probes / 3));
    var residualTrace = eig.slice(Math.min(hppRank, eig.length)).reduce(function (sum, value) { return sum + value; }, 0);
    var residualFro2 = eig.slice(Math.min(hppRank, eig.length)).reduce(function (sum, value) { return sum + value * value; }, 0);
    return {
      A: A,
      diag2: diag2,
      diagTrace: diagTrace,
      effectiveRank: trace * trace / Math.max(1e-12, fro2),
      eigenvalues: eig,
      fro2: fro2,
      hppRank: hppRank,
      n: n,
      offdiagFro2: Math.max(0, fro2 - diag2),
      residualFro2: residualFro2,
      residualTrace: residualTrace,
      symmetryError: symmetry,
      topMass: topMass,
      trace: trace
    };
  }

  function matvec(model, x) {
    var A = model.A;
    var y = [];
    for (var i = 0; i < A.length; i += 1) {
      var sum = 0;
      for (var j = 0; j < x.length; j += 1) sum += A[i][j] * x[j];
      y.push(sum);
    }
    return y;
  }

  function quadratic(model, z) {
    return dot(z, matvec(model, z));
  }

  function projectOut(basis, vector) {
    var v = vector.slice();
    basis.forEach(function (q) {
      scaledAdd(v, q, -dot(v, q));
    });
    return v;
  }

  function hutchinsonPath(model, params, budget, seed) {
    var rows = [];
    var forms = [];
    var sum = 0;
    for (var i = 0; i < budget; i += 1) {
      var z = makeVector(model.n, params.probe, seed + i * 8191);
      var value = quadratic(model, z);
      forms.push(value);
      sum += value;
      rows.push({
        budget: i + 1,
        estimate: sum / (i + 1),
        relError: (sum / (i + 1) - model.trace) / model.trace
      });
    }
    return { estimate: sum / budget, forms: forms, rows: rows };
  }

  function hutchinsonEstimate(model, probe, budget, seed) {
    var sum = 0;
    for (var i = 0; i < budget; i += 1) {
      sum += quadratic(model, makeVector(model.n, probe, seed + i * 8191));
    }
    return sum / budget;
  }

  function hutchPlusPlus(model, budget, seed) {
    var k = Math.max(1, Math.floor(budget / 3));
    var sketch = [];
    var i;
    for (i = 0; i < k; i += 1) sketch.push(matvec(model, makeVector(model.n, "gaussian", seed + i * 3571)));
    var basis = orthonormalizeColumns(sketch);
    var low = 0;
    basis.forEach(function (q) {
      low += dot(q, matvec(model, q));
    });
    var residual = 0;
    for (i = 0; i < k; i += 1) {
      var g = makeVector(model.n, "gaussian", seed + 100000 + i * 4447);
      var r = projectOut(basis, g);
      residual += dot(r, matvec(model, r));
    }
    return {
      estimate: low + residual / k,
      k: k,
      lowRankTrace: low,
      rank: basis.length,
      residualEstimate: residual / k,
      used: k + basis.length + k
    };
  }

  function hutchPlusPlusPath(model, budget, seed) {
    var rows = [];
    for (var b = 6; b <= budget; b += 3) {
      var run = hutchPlusPlus(model, b, seed + b * 53);
      rows.push({
        budget: run.used,
        estimate: run.estimate,
        relError: (run.estimate - model.trace) / model.trace
      });
    }
    return rows;
  }

  function summarize(values, truth) {
    var mean = values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
    var mse = values.reduce(function (sum, value) {
      var err = (value - truth) / truth;
      return sum + err * err;
    }, 0) / Math.max(1, values.length);
    var absErrors = values.map(function (value) { return Math.abs((value - truth) / truth); }).sort(function (a, b) { return a - b; });
    var p90 = absErrors[Math.min(absErrors.length - 1, Math.floor(0.9 * absErrors.length))] || 0;
    return {
      mean: mean,
      relBias: (mean - truth) / truth,
      relRmse: Math.sqrt(mse),
      p90Abs: p90
    };
  }

  function repeatedRuns(model, params) {
    var classic = [];
    var hpp = [];
    for (var t = 0; t < params.trials; t += 1) {
      classic.push(hutchinsonEstimate(model, params.probe, params.probes, params.seed + 20000 + t * 997));
      hpp.push(hutchPlusPlus(model, params.probes, params.seed + 80000 + t * 1291).estimate);
    }
    return {
      classic: classic,
      classicSummary: summarize(classic, model.trace),
      hpp: hpp,
      hppSummary: summarize(hpp, model.trace)
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = buildMatrix(params);
    var path = hutchinsonPath(model, params, params.probes, params.seed + 3000);
    var hpp = hutchPlusPlus(model, params.probes, params.seed + 5000);
    var hppPath = hutchPlusPlusPath(model, params.probes, params.seed + 7000);
    var repeated = repeatedRuns(model, params);
    var singleVariance = params.probe === "gaussian" ? 2 * model.fro2 : 2 * model.offdiagFro2;
    var predictedSe = Math.sqrt(singleVariance / Math.max(1, params.probes)) / model.trace;
    return {
      checks: {
        finiteTrace: Number.isFinite(model.trace) && model.trace > 0,
        hppBudgetRespected: hpp.used <= params.probes,
        symmetry: model.symmetryError < 1e-8,
        traceConsistent: Math.abs(model.diagTrace - model.trace) / Math.max(1, model.trace) < 1e-8
      },
      hpp: hpp,
      hppPath: hppPath,
      model: model,
      params: params,
      path: path,
      predictedSe: predictedSe,
      repeated: repeated
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var values = {
      dimension: String(params.dimension),
      matrix: MATRICES[params.matrix],
      probe: PROBES[params.probe],
      probes: String(params.probes),
      seed: String(params.seed),
      trials: String(params.trials)
    };
    Object.keys(values).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = values[key];
      });
    });
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && String(input.value) !== String(params[key])) input.value = params[key];
    });
  }

  function updateMetrics(root, result) {
    var checksPassed = Object.keys(result.checks).every(function (key) { return result.checks[key]; });
    var html = [
      metric("Exact trace", formatNumber(result.model.trace, 2)),
      metric("Hutchinson", formatNumber(result.path.estimate, 2)),
      metric("Hutch++", formatNumber(result.hpp.estimate, 2)),
      metric("Classic RMSE", formatPercent(result.repeated.classicSummary.relRmse, 1)),
      metric("Hutch++ RMSE", formatPercent(result.repeated.hppSummary.relRmse, 1)),
      metric("Checks", checksPassed ? "passed" : "inspect")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, cssHeight) {
    var width = Math.max(320, Math.round(canvas.getBoundingClientRect().width || canvas.clientWidth || 900));
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);
    return { ctx: ctx, height: cssHeight, width: width };
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

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, 11, COLORS.muted, 560);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawSpectrumPanel(ctx, result, box) {
    panel(ctx, box, "matrix spectrum", "trace is the sum of eigenvalues; probes see quadratic forms");
    var eig = result.model.eigenvalues;
    var plot = { x: box.x + 34, y: box.y + 58, w: box.w * 0.56, h: box.h - 104 };
    var max = Math.max.apply(null, eig);
    var barW = plot.w / eig.length;
    var rank = result.model.hppRank;
    for (var i = 0; i < eig.length; i += 1) {
      var h = plot.h * eig[i] / max;
      ctx.fillStyle = i < rank ? COLORS.hpp : COLORS.spectrum;
      ctx.globalAlpha = i < rank ? 0.9 : 0.45;
      ctx.fillRect(plot.x + i * barW, plot.y + plot.h - h, Math.max(1, barW - 0.5), h);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    drawText(ctx, "ideal top-" + rank + " deflation", plot.x, box.y + box.h - 26, 10, COLORS.hpp, 760);

    var heat = { x: plot.x + plot.w + 28, y: plot.y, w: box.w - (plot.w + 76), h: plot.h };
    var cells = Math.max(6, Math.min(18, Math.floor(Math.min(heat.w, heat.h) / 8)));
    var cell = Math.min(heat.w, heat.h) / cells;
    var maxAbs = 0;
    var A = result.model.A;
    for (i = 0; i < cells; i += 1) {
      for (var j = 0; j < cells; j += 1) maxAbs = Math.max(maxAbs, Math.abs(A[i][j]));
    }
    for (i = 0; i < cells; i += 1) {
      for (j = 0; j < cells; j += 1) {
        var value = Math.abs(A[i][j]) / Math.max(1e-12, maxAbs);
        ctx.fillStyle = "rgba(180,83,9," + (0.08 + 0.86 * value).toFixed(3) + ")";
        ctx.fillRect(heat.x + j * cell, heat.y + i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(heat.x, heat.y, cells * cell, cells * cell);
    drawText(ctx, "top-left entries", heat.x, box.y + box.h - 26, 10, COLORS.heat, 760);
    drawText(ctx, "trace " + formatNumber(result.model.trace, 2), box.x + 14, box.y + box.h - 58, 11, COLORS.text, 700);
    drawText(ctx, "effective rank " + formatNumber(result.model.effectiveRank, 1), box.x + 14, box.y + box.h - 40, 11, COLORS.muted, 650);
  }

  function drawSeries(ctx, rows, plot, maxBudget, yMin, yMax, color, width) {
    if (!rows.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, index) {
      var x = plot.x + row.budget / maxBudget * plot.w;
      var y = plot.y + plot.h - (row.estimate - yMin) / Math.max(1e-9, yMax - yMin) * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawConvergencePanel(ctx, result, box) {
    panel(ctx, box, "one run as queries accumulate", "classic probes average down; Hutch++ starts after sketching");
    var rows = result.path.rows;
    var hRows = result.hppPath;
    var values = rows.map(function (row) { return row.estimate; }).concat(hRows.map(function (row) { return row.estimate; }), [result.model.trace]);
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    var padY = Math.max(1e-6, (hi - lo) * 0.16);
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 68, h: box.h - 104 };
    drawAxis(ctx, plot);
    var truthY = plot.y + plot.h - (result.model.trace - lo + padY) / Math.max(1e-9, hi - lo + 2 * padY) * plot.h;
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(plot.x, truthY);
    ctx.lineTo(plot.x + plot.w, truthY);
    ctx.stroke();
    drawSeries(ctx, rows, plot, result.params.probes, lo - padY, hi + padY, COLORS.classic, 2.3);
    drawSeries(ctx, hRows, plot, result.params.probes, lo - padY, hi + padY, COLORS.hpp, 2.3);
    drawText(ctx, "Hutchinson", plot.x + 8, plot.y + 16, 10, COLORS.classic, 760);
    drawText(ctx, "Hutch++", plot.x + 88, plot.y + 16, 10, COLORS.hpp, 760);
    drawText(ctx, "truth", plot.x + 144, plot.y + 16, 10, COLORS.exact, 760);
    drawText(ctx, "matvecs", plot.x + plot.w, box.y + box.h - 18, 10, COLORS.muted, 650, "right");
  }

  function drawErrorPanel(ctx, result, box) {
    panel(ctx, box, "repeated-trial relative error", "each dot is one independent estimate at this budget");
    var c = result.repeated.classic.map(function (value) { return (value - result.model.trace) / result.model.trace; });
    var h = result.repeated.hpp.map(function (value) { return (value - result.model.trace) / result.model.trace; });
    var all = c.concat(h).map(Math.abs);
    var max = Math.max(0.02, Math.min(1.2, all.sort(function (a, b) { return a - b; })[Math.floor(0.96 * all.length)] || 0.02) * 1.2);
    var plot = { x: box.x + 48, y: box.y + 74, w: box.w - 76, h: box.h - 126 };
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = -2; g <= 2; g += 1) {
      var gx = plot.x + (g / 2 * max + max) / (2 * max) * plot.w;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
    }
    var zeroX = plot.x + plot.w / 2;
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zeroX, plot.y - 6);
    ctx.lineTo(zeroX, plot.y + plot.h + 6);
    ctx.stroke();
    function drawDots(values, y, color, seedOffset) {
      values.forEach(function (value, index) {
        var clipped = clamp(value, -max, max);
        var x = plot.x + (clipped + max) / (2 * max) * plot.w;
        var jitter = (uniform(index * 19 + seedOffset, result.params.seed) - 0.5) * 30;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y + jitter, 2.3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    drawDots(c, plot.y + plot.h * 0.3, COLORS.classic, 33);
    drawDots(h, plot.y + plot.h * 0.72, COLORS.hpp, 77);
    drawText(ctx, "classic", plot.x, plot.y + plot.h * 0.3 - 24, 11, COLORS.classic, 760);
    drawText(ctx, "Hutch++", plot.x, plot.y + plot.h * 0.72 - 24, 11, COLORS.hpp, 760);
    drawText(ctx, "-" + formatPercent(max, 0), plot.x, box.y + box.h - 28, 10, COLORS.muted, 650);
    drawText(ctx, "0", zeroX, box.y + box.h - 28, 10, COLORS.exact, 650, "center");
    drawText(ctx, "+" + formatPercent(max, 0), plot.x + plot.w, box.y + box.h - 28, 10, COLORS.muted, 650, "right");
  }

  function drawVariancePanel(ctx, result, box) {
    panel(ctx, box, "where the variance lives", "Rademacher ignores diagonal variance; Hutch++ attacks spectral spikes");
    var plot = { x: box.x + 36, y: box.y + 68, w: box.w - 64, h: box.h - 122 };
    var bars = [
      { label: "diag", value: result.model.diag2, color: COLORS.tail },
      { label: "offdiag", value: result.model.offdiagFro2, color: COLORS.classic },
      { label: "tail frob", value: result.model.residualFro2, color: COLORS.hpp }
    ];
    var max = Math.max.apply(null, bars.map(function (row) { return row.value; }).concat([1e-9]));
    var slot = plot.w / bars.length;
    bars.forEach(function (row, index) {
      var h = plot.h * row.value / max;
      var x = plot.x + index * slot + slot * 0.2;
      var w = slot * 0.52;
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      ctx.globalAlpha = 1;
      drawText(ctx, row.label, x + w / 2, plot.y + plot.h + 18, 10, COLORS.muted, 650, "center");
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var seText = "predicted classic SE " + formatPercent(result.predictedSe, 1);
    drawText(ctx, seText, box.x + 14, box.y + box.h - 58, 11, COLORS.classic, 760);
    drawText(ctx, "top-5 mass " + formatPercent(result.model.topMass, 1), box.x + 14, box.y + box.h - 40, 11, COLORS.hpp, 760);
    drawText(ctx, "Hutch++ used " + result.hpp.used + " of " + result.params.probes + " matvecs", box.x + 14, box.y + box.h - 22, 11, COLORS.muted, 650);
  }

  function draw(result, canvas) {
    var width = Math.round(canvas.getBoundingClientRect().width || 900);
    var compact = width < 650;
    var prepared = setupCanvas(canvas, compact ? 1100 : 760);
    var ctx = prepared.ctx;
    var pad = compact ? 16 : 24;
    var gap = compact ? 18 : 22;
    var inner = prepared.width - 2 * pad;
    if (compact) {
      var h = (prepared.height - 2 * pad - 3 * gap) / 4;
      drawSpectrumPanel(ctx, result, { x: pad, y: pad, w: inner, h: h });
      drawConvergencePanel(ctx, result, { x: pad, y: pad + h + gap, w: inner, h: h });
      drawErrorPanel(ctx, result, { x: pad, y: pad + 2 * (h + gap), w: inner, h: h });
      drawVariancePanel(ctx, result, { x: pad, y: pad + 3 * (h + gap), w: inner, h: h });
      return;
    }
    var col = (inner - gap) / 2;
    var row = (prepared.height - 2 * pad - gap) / 2;
    drawSpectrumPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawConvergencePanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawErrorPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawVariancePanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function renderOne(root) {
    var result = evaluate(readParams(root));
    updateControls(root, result.params);
    updateOutputs(root, result.params);
    updateMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__hutchResult = result;
  }

  function initOne(root) {
    if (root.__hutchReady) return;
    root.__hutchReady = true;
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { renderOne(root); }, 70);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    if (global.ResizeObserver) {
      var observer = new ResizeObserver(function () {
        if (root.__hutchResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__hutchResult, canvas);
        }
      });
      observer.observe(root);
    } else {
      global.addEventListener("resize", function () {
        if (root.__hutchResult) {
          var canvas = root.querySelector("[data-canvas]");
          if (canvas) draw(root.__hutchResult, canvas);
        }
      });
    }
    renderOne(root);
  }

  function init() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-hutchinson-trace-lab]")).forEach(initOne);
  }

  var api = {
    buildMatrix: buildMatrix,
    cleanParams: cleanParams,
    evaluate: evaluate,
    hutchPlusPlus: hutchPlusPlus,
    hutchinsonEstimate: hutchinsonEstimate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HutchinsonTraceLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
