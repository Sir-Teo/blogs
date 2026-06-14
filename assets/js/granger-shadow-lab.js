(function (root) {
  "use strict";

  var COLORS = {
    h: "#7c3aed",
    x: "#2563eb",
    y: "#0f766e",
    pairwise: "#be123c",
    conditioned: "#0f766e",
    reverse: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    soft: "#f8fafc"
  };

  var DEFAULTS = {
    direct: 0,
    common: 75,
    lagOrder: 2,
    length: 420,
    noise: 55,
    seed: 23
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      direct: snap(raw.direct, DEFAULTS.direct, 0, 90, 5),
      common: snap(raw.common, DEFAULTS.common, 0, 100, 5),
      lagOrder: snap(raw.lagOrder, DEFAULTS.lagOrder, 1, 4, 1),
      length: snap(raw.length, DEFAULTS.length, 180, 1200, 20),
      noise: snap(raw.noise, DEFAULTS.noise, 20, 140, 5),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function simulateSeries(raw) {
    var params = cleanParams(raw);
    var rand = makeRng(20260614 + params.seed * 1009 + params.length * 17);
    var burn = 80;
    var total = params.length + burn + 8;
    var h = [];
    var x = [];
    var y = [];
    var direct = 0.72 * params.direct / 100;
    var common = 0.92 * params.common / 100;
    var noise = 0.2 + 1.15 * params.noise / 100;

    for (var t = 0; t < total; t += 1) {
      h[t] = 0;
      x[t] = 0;
      y[t] = 0;
    }

    for (var i = 2; i < total; i += 1) {
      h[i] = 0.78 * h[i - 1] + normal(rand);
      x[i] = 0.42 * x[i - 1] + common * h[i - 1] + noise * normal(rand);
      y[i] = 0.38 * y[i - 1] + common * h[i - 2] + direct * x[i - 2] + noise * normal(rand);
    }

    var start = burn;
    return {
      H: h.slice(start, start + params.length),
      X: x.slice(start, start + params.length),
      Y: y.slice(start, start + params.length),
      coefficients: {
        common: common,
        direct: direct,
        noise: noise
      },
      params: params
    };
  }

  function mean(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) sum += values[i];
    return sum / Math.max(1, values.length);
  }

  function variance(values) {
    var m = mean(values);
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      var d = values[i] - m;
      sum += d * d;
    }
    return sum / Math.max(1, values.length - 1);
  }

  function solveLinear(a, b) {
    var n = b.length;
    var m = [];
    var i;
    var j;
    var k;
    for (i = 0; i < n; i += 1) {
      m[i] = a[i].slice();
      m[i].push(b[i]);
    }

    for (i = 0; i < n; i += 1) {
      var pivot = i;
      for (j = i + 1; j < n; j += 1) {
        if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
      }
      if (pivot !== i) {
        var tmp = m[i];
        m[i] = m[pivot];
        m[pivot] = tmp;
      }
      var div = Math.abs(m[i][i]) < 1e-10 ? (m[i][i] < 0 ? -1e-10 : 1e-10) : m[i][i];
      for (j = i; j <= n; j += 1) m[i][j] /= div;
      for (k = 0; k < n; k += 1) {
        if (k === i) continue;
        var factor = m[k][i];
        for (j = i; j <= n; j += 1) m[k][j] -= factor * m[i][j];
      }
    }

    var out = [];
    for (i = 0; i < n; i += 1) out.push(m[i][n]);
    return out;
  }

  function ols(y, x) {
    var n = y.length;
    var k = x[0] ? x[0].length : 0;
    var xtx = [];
    var xty = [];
    var i;
    var j;
    var c;
    for (i = 0; i < k; i += 1) {
      xtx[i] = [];
      xty[i] = 0;
      for (j = 0; j < k; j += 1) xtx[i][j] = i === j ? 1e-8 : 0;
    }
    for (i = 0; i < n; i += 1) {
      for (j = 0; j < k; j += 1) {
        xty[j] += x[i][j] * y[i];
        for (c = 0; c < k; c += 1) xtx[j][c] += x[i][j] * x[i][c];
      }
    }
    var beta = solveLinear(xtx, xty);
    var yMean = mean(y);
    var sse = 0;
    var tss = 0;
    for (i = 0; i < n; i += 1) {
      var fit = 0;
      for (j = 0; j < k; j += 1) fit += beta[j] * x[i][j];
      var err = y[i] - fit;
      sse += err * err;
      var dev = y[i] - yMean;
      tss += dev * dev;
    }
    return {
      beta: beta,
      df: Math.max(1, n - k),
      k: k,
      n: n,
      r2: tss > 0 ? 1 - sse / tss : 0,
      sse: Math.max(0, sse),
      tss: tss
    };
  }

  function logGamma(z) {
    var coeffs = [
      676.5203681218851,
      -1259.1392167224028,
      771.3234287776531,
      -176.6150291621406,
      12.507343278686905,
      -0.13857109526572012,
      9.984369578019572e-6,
      1.5056327351493116e-7
    ];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    var x = 0.9999999999998099;
    for (var i = 0; i < coeffs.length; i += 1) x += coeffs[i] / (z + i + 1);
    var t = z + coeffs.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function betaContinuedFraction(a, b, x) {
    var maxIter = 160;
    var eps = 3e-12;
    var fpmin = 1e-30;
    var qab = a + b;
    var qap = a + 1;
    var qam = a - 1;
    var c = 1;
    var d = 1 - qab * x / qap;
    if (Math.abs(d) < fpmin) d = fpmin;
    d = 1 / d;
    var h = d;

    for (var m = 1; m <= maxIter; m += 1) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h;
  }

  function regularizedBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) {
      return bt * betaContinuedFraction(a, b, x) / a;
    }
    return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
  }

  function fSurvival(f, df1, df2) {
    if (!isFinite(f)) return 0;
    if (f <= 0) return 1;
    var x = df2 / (df2 + df1 * f);
    return clamp(regularizedBeta(x, df2 / 2, df1 / 2), 0, 1);
  }

  function buildRows(series, target, predictors, lags, startLag) {
    var y = [];
    var x = [];
    var maxLag = startLag || lags;
    for (var t = maxLag; t < series[target].length; t += 1) {
      var row = [1];
      predictors.forEach(function (item) {
        item.lags.forEach(function (lag) {
          row.push(series[item.name][t - lag]);
        });
      });
      x.push(row);
      y.push(series[target][t]);
    }
    return { x: x, y: y };
  }

  function lagList(count) {
    var out = [];
    for (var i = 1; i <= count; i += 1) out.push(i);
    return out;
  }

  function grangerTest(series, target, cause, conditioned, lagOrder) {
    var basePredictors = [{ name: target, lags: lagList(lagOrder) }];
    (conditioned || []).forEach(function (name) {
      basePredictors.push({ name: name, lags: lagList(lagOrder) });
    });
    var unrestricted = basePredictors.concat([{ name: cause, lags: lagList(lagOrder) }]);
    var maxLag = lagOrder;
    var restrictedRows = buildRows(series, target, basePredictors, lagOrder, maxLag);
    var unrestrictedRows = buildRows(series, target, unrestricted, lagOrder, maxLag);
    var restricted = ols(restrictedRows.y, restrictedRows.x);
    var full = ols(unrestrictedRows.y, unrestrictedRows.x);
    var q = Math.max(1, full.k - restricted.k);
    var numerator = Math.max(0, restricted.sse - full.sse) / q;
    var denominator = full.sse / Math.max(1, full.df);
    var f = denominator > 0 ? numerator / denominator : 0;
    return {
      deltaR2: Math.max(0, full.r2 - restricted.r2),
      df1: q,
      df2: full.df,
      f: f,
      full: full,
      p: fSurvival(f, q, full.df),
      restricted: restricted
    };
  }

  function singleLagTest(series, target, cause, conditioned, lag) {
    var basePredictors = [{ name: target, lags: [1, 2] }];
    (conditioned || []).forEach(function (name) {
      basePredictors.push({ name: name, lags: [1, 2] });
    });
    var unrestricted = basePredictors.concat([{ name: cause, lags: [lag] }]);
    var maxLag = Math.max(2, lag);
    var restrictedRows = buildRows(series, target, basePredictors, 2, maxLag);
    var unrestrictedRows = buildRows(series, target, unrestricted, 2, maxLag);
    var restricted = ols(restrictedRows.y, restrictedRows.x);
    var full = ols(unrestrictedRows.y, unrestrictedRows.x);
    var numerator = Math.max(0, restricted.sse - full.sse);
    var denominator = full.sse / Math.max(1, full.df);
    var f = denominator > 0 ? numerator / denominator : 0;
    return {
      deltaR2: Math.max(0, full.r2 - restricted.r2),
      f: f,
      p: fSurvival(f, 1, full.df)
    };
  }

  function lagScan(series) {
    var rows = [];
    for (var lag = 1; lag <= 5; lag += 1) {
      rows.push({
        conditional: singleLagTest(series, "Y", "X", ["H"], lag),
        lag: lag,
        pairwise: singleLagTest(series, "Y", "X", [], lag)
      });
    }
    return rows;
  }

  function evaluate(raw) {
    var sim = simulateSeries(raw);
    var params = sim.params;
    var series = { H: sim.H, X: sim.X, Y: sim.Y };
    var pairwiseXY = grangerTest(series, "Y", "X", [], params.lagOrder);
    var conditionalXY = grangerTest(series, "Y", "X", ["H"], params.lagOrder);
    var pairwiseYX = grangerTest(series, "X", "Y", [], params.lagOrder);
    var conditionalHX = grangerTest(series, "X", "H", [], params.lagOrder);
    var conditionalHY = grangerTest(series, "Y", "H", [], params.lagOrder);
    return {
      coefficients: sim.coefficients,
      conditionalHX: conditionalHX,
      conditionalHY: conditionalHY,
      conditionalXY: conditionalXY,
      lagScan: lagScan(series),
      pairwiseXY: pairwiseXY,
      pairwiseYX: pairwiseYX,
      params: params,
      series: series,
      shadowRatio: conditionalXY.deltaR2 > 1e-9 ? pairwiseXY.deltaR2 / conditionalXY.deltaR2 : Infinity
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "inf";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function formatP(value) {
    if (value < 0.001) return "<0.001";
    return value.toFixed(3);
  }

  function metric(label, value) {
    return '<div class="granger-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, rect.width || canvas.clientWidth || 760);
    var height = width < 620 ? 1140 : 820;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 25);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 43);
    }
  }

  function drawSeries(ctx, box, result) {
    panel(ctx, box, "Three clocks", "hidden driver H moves X first, then Y");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 60, h: box.h - 92 };
    var n = result.series.X.length;
    var start = Math.max(0, Math.floor(n * 0.18));
    var end = Math.min(n, start + 120);
    var all = [];
    ["H", "X", "Y"].forEach(function (name) {
      for (var i = start; i < end; i += 1) all.push(result.series[name][i]);
    });
    var lo = Math.min.apply(null, all);
    var hi = Math.max.apply(null, all);
    var span = Math.max(1e-9, hi - lo);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + g * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }

    function drawLine(name, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = start; i < end; i += 1) {
        var x = plot.x + (i - start) / Math.max(1, end - start - 1) * plot.w;
        var y = plot.y + plot.h - (result.series[name][i] - lo) / span * plot.h;
        if (i === start) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawLine("H", COLORS.h);
    drawLine("X", COLORS.x);
    drawLine("Y", COLORS.y);
    ctx.fillStyle = COLORS.h;
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("H", plot.x + 4, plot.y + 13);
    ctx.fillStyle = COLORS.x;
    ctx.fillText("X", plot.x + 24, plot.y + 13);
    ctx.fillStyle = COLORS.y;
    ctx.fillText("Y", plot.x + 44, plot.y + 13);
  }

  function drawTests(ctx, box, result) {
    panel(ctx, box, "Does X improve forecasts of Y?", "nested VAR tests with and without H");
    var rows = [
      { label: "pairwise X -> Y", color: COLORS.pairwise, test: result.pairwiseXY },
      { label: "conditioned on H", color: COLORS.conditioned, test: result.conditionalXY },
      { label: "reverse Y -> X", color: COLORS.reverse, test: result.pairwiseYX }
    ];
    var maxDelta = Math.max.apply(null, rows.map(function (row) { return row.test.deltaR2; }).concat([0.01]));
    var x0 = box.x + 18;
    var y0 = box.y + 72;
    var barW = box.w - 190;
    var rowH = 54;
    rows.forEach(function (row, index) {
      var y = y0 + index * rowH;
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, x0, y + 12);
      ctx.fillStyle = "rgba(215,222,229,0.72)";
      roundedRect(ctx, x0, y + 20, barW, 13, 6);
      ctx.fill();
      ctx.fillStyle = row.color;
      roundedRect(ctx, x0, y + 20, Math.max(2, row.test.deltaR2 / maxDelta * barW), 13, 6);
      ctx.fill();
      ctx.fillStyle = row.test.p < 0.05 ? row.color : COLORS.muted;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("dR2 " + formatNumber(row.test.deltaR2, 4), x0 + barW + 12, y + 17);
      ctx.fillText("p " + formatP(row.test.p), x0 + barW + 12, y + 34);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("True X -> Y coefficient: " + formatNumber(result.coefficients.direct, 2), x0, box.y + box.h - 18);
  }

  function drawLagScan(ctx, box, result) {
    panel(ctx, box, "Lag profile", "single-lag X predictors before and after conditioning");
    var plot = { x: box.x + 40, y: box.y + 70, w: box.w - 66, h: box.h - 112 };
    var rows = result.lagScan;
    var maxF = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.pairwise.f, row.conditional.f);
    }).concat([1]));
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h - g * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillText(formatNumber(maxF * g / 4, 1), plot.x - 4, y - 3);
    }
    var slot = plot.w / rows.length;
    rows.forEach(function (row, index) {
      var cx = plot.x + index * slot + slot * 0.5;
      var ph = row.pairwise.f / maxF * plot.h;
      var ch = row.conditional.f / maxF * plot.h;
      ctx.fillStyle = COLORS.pairwise;
      ctx.fillRect(cx - slot * 0.22, plot.y + plot.h - ph, slot * 0.18, ph);
      ctx.fillStyle = COLORS.conditioned;
      ctx.fillRect(cx + slot * 0.04, plot.y + plot.h - ch, slot * 0.18, ch);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("lag " + row.lag, cx - 16, plot.y + plot.h + 18);
    });
    ctx.fillStyle = COLORS.pairwise;
    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("pairwise", plot.x, box.y + box.h - 22);
    ctx.fillStyle = COLORS.conditioned;
    ctx.fillText("conditioned", plot.x + 76, box.y + box.h - 22);
  }

  function arrow(ctx, from, to, color, dashed) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var angle = Math.atan2(dy, dx);
    var endX = to.x - Math.cos(angle) * 32;
    var endY = to.y - Math.sin(angle) * 22;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    if (dashed) ctx.setLineDash([5, 4]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 9 * Math.cos(angle - 0.42), endY - 9 * Math.sin(angle - 0.42));
    ctx.lineTo(endX - 9 * Math.cos(angle + 0.42), endY - 9 * Math.sin(angle + 0.42));
    ctx.closePath();
    ctx.fill();
  }

  function node(ctx, point, label, color, sublabel) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    roundedRect(ctx, point.x - 42, point.y - 24, 84, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "800 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(label, point.x - ctx.measureText(label).width / 2, point.y - 2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(sublabel, point.x - ctx.measureText(sublabel).width / 2, point.y + 14);
  }

  function drawGraph(ctx, box, result) {
    panel(ctx, box, "What the arrow means", "forecast improvement is not intervention");
    var h = { x: box.x + box.w * 0.50, y: box.y + 90 };
    var x = { x: box.x + box.w * 0.28, y: box.y + box.h - 86 };
    var y = { x: box.x + box.w * 0.72, y: box.y + box.h - 86 };
    arrow(ctx, h, x, COLORS.h, true);
    arrow(ctx, h, y, COLORS.h, true);
    if (result.coefficients.direct > 0.005) arrow(ctx, x, y, COLORS.y, false);
    else arrow(ctx, x, y, "rgba(190,18,60,0.45)", true);
    node(ctx, h, "H", COLORS.h, "driver");
    node(ctx, x, "X", COLORS.x, "witness");
    node(ctx, y, "Y", COLORS.y, "target");
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    var message = result.coefficients.direct > 0.005
      ? "Direct link is present; conditioning asks whether it survives H."
      : "Direct link is zero; any X -> Y signal is a lagged shadow.";
    ctx.fillText(message, box.x + 18, box.y + box.h - 30);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    var margin = 12;
    var gap = 12;
    var boxes = [];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (width < 620) {
      var h = (height - margin * 2 - gap * 3) / 4;
      for (var i = 0; i < 4; i += 1) boxes.push({ x: margin, y: margin + i * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - margin * 2 - gap) / 2;
      var rowH = (height - margin * 2 - gap) / 2;
      boxes.push({ x: margin, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin, w: colW, h: rowH });
      boxes.push({ x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      boxes.push({ x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
    drawSeries(ctx, boxes[0], result);
    drawTests(ctx, boxes[1], result);
    drawLagScan(ctx, boxes[2], result);
    drawGraph(ctx, boxes[3], result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (key === "direct") node.textContent = formatNumber(0.72 * params.direct / 100, 2);
      else if (key === "common") node.textContent = formatNumber(0.92 * params.common / 100, 2);
      else if (key === "noise") node.textContent = String(params.noise) + "%";
      else if (key === "length") node.textContent = params.length.toLocaleString();
      else node.textContent = String(params[key]);
    });
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (node) {
      raw[node.getAttribute("data-param")] = node.value;
    });
    return cleanParams(raw);
  }

  function render(container) {
    var params = readParams(container);
    updateOutputs(container, params);
    var result = evaluate(params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true X -> Y", formatNumber(result.coefficients.direct, 2)),
        metric("pairwise p", formatP(result.pairwiseXY.p)),
        metric("conditioned p", formatP(result.conditionalXY.p)),
        metric("pairwise dR2", formatNumber(result.pairwiseXY.deltaR2, 4)),
        metric("conditioned dR2", formatNumber(result.conditionalXY.deltaR2, 4)),
        metric("reverse p", formatP(result.pairwiseYX.p))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
    container.__grangerShadowResult = result;
  }

  function mount(container) {
    if (container.__grangerShadowMounted) return;
    container.__grangerShadowMounted = true;
    container.querySelectorAll("[data-param]").forEach(function (node) {
      node.addEventListener("input", function () { render(container); });
      node.addEventListener("change", function () { render(container); });
    });
    render(container);
    root.addEventListener("resize", function () { render(container); });
  }

  function mountAll() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-granger-shadow-lab]").forEach(mount);
  }

  root.GrangerShadowLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    fSurvival: fSurvival,
    grangerTest: grangerTest,
    ols: ols,
    regularizedBeta: regularizedBeta,
    simulateSeries: simulateSeries
  };

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", mountAll);
    } else {
      mountAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
