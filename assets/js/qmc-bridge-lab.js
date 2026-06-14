(function (root) {
  "use strict";

  var COLORS = {
    bg: "#ffffff",
    panel: "#f8fafc",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    mc: "#be123c",
    qmc: "#2563eb",
    bridge: "#0f766e",
    ref: "#b45309",
    accent: "#7c3aed",
    point: "rgba(37, 99, 235, 0.62)",
    pointMc: "rgba(190, 18, 60, 0.42)"
  };

  var DEFAULTS = {
    maxPaths: 2048,
    steps: 16,
    strike: 100,
    vol: 30,
    rate: 4,
    reps: 6,
    seed: 23
  };

  var S0 = 100;
  var T = 1;
  var BASES = [
    2, 3, 5, 7, 11, 13, 17, 19,
    23, 29, 31, 37, 41, 43, 47, 53,
    59, 61, 67, 71, 73, 79, 83, 89,
    97, 101, 103, 107, 109, 113, 127, 131
  ];

  var SAMPLE_SIZES = [64, 128, 256, 512, 1024, 2048, 4096, 8192];

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
      maxPaths: snap(raw.maxPaths, DEFAULTS.maxPaths, 512, 8192, 512),
      steps: snap(raw.steps, DEFAULTS.steps, 8, 32, 8),
      strike: snap(raw.strike, DEFAULTS.strike, 80, 120, 1),
      vol: snap(raw.vol, DEFAULTS.vol, 5, 70, 1),
      rate: snap(raw.rate, DEFAULTS.rate, 0, 10, 0.25),
      reps: snap(raw.reps, DEFAULTS.reps, 2, 10, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 99, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = Math.max(1e-12, rand());
    var v = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Peter J. Acklam's rational approximation, coefficients in the public domain.
  function invNorm(p) {
    p = clamp(p, 1e-12, 1 - 1e-12);
    var a = [
      -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02,
      -3.066479806614716e+01, 2.506628277459239e+00
    ];
    var b = [
      -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01,
      -1.328068155288572e+01
    ];
    var c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
      4.374664141464968e+00, 2.938163982698783e+00
    ];
    var d = [
      7.784695709041462e-03, 3.224671290700398e-01,
      2.445134137142996e+00, 3.754408661907416e+00
    ];
    var plow = 0.02425;
    var phigh = 1 - plow;
    var q;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    var r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function radicalInverse(index, base) {
    var f = 1 / base;
    var result = 0;
    var i = index;
    while (i > 0) {
      result += f * (i % base);
      i = Math.floor(i / base);
      f /= base;
    }
    return result;
  }

  function haltonNormal(index, dim, shift) {
    var u = radicalInverse(index + 1, BASES[dim]);
    if (shift) u = (u + shift[dim]) % 1;
    return invNorm(clamp(u, 1e-10, 1 - 1e-10));
  }

  function makeShift(dim, seed) {
    var rand = lcg(seed);
    var out = [];
    for (var i = 0; i < dim; i += 1) out.push(rand());
    return out;
  }

  function sequentialBrownian(z, steps) {
    var dt = T / steps;
    var sdt = Math.sqrt(dt);
    var w = new Array(steps + 1);
    w[0] = 0;
    for (var i = 1; i <= steps; i += 1) {
      w[i] = w[i - 1] + sdt * z[i - 1];
    }
    return w;
  }

  function bridgeBrownian(z, steps) {
    var w = new Array(steps + 1);
    var known = new Array(steps + 1).fill(false);
    w[0] = 0;
    known[0] = true;
    w[steps] = Math.sqrt(T) * z[0];
    known[steps] = true;
    var next = 1;
    var queue = [{ left: 0, right: steps }];
    while (queue.length && next < steps) {
      var interval = queue.shift();
      var left = interval.left;
      var right = interval.right;
      if (right - left <= 1) continue;
      var mid = Math.floor((left + right) / 2);
      if (known[mid]) continue;
      var tl = left / steps;
      var tm = mid / steps;
      var tr = right / steps;
      var mean = ((tr - tm) * w[left] + (tm - tl) * w[right]) / (tr - tl);
      var variance = (tm - tl) * (tr - tm) / (tr - tl);
      w[mid] = mean + Math.sqrt(variance) * z[next];
      known[mid] = true;
      next += 1;
      queue.push({ left: left, right: mid });
      queue.push({ left: mid, right: right });
    }
    return w;
  }

  function payoffFromBrownian(w, params) {
    var steps = params.steps;
    var sigma = params.vol / 100;
    var r = params.rate / 100;
    var sum = 0;
    for (var i = 1; i <= steps; i += 1) {
      var t = i / steps;
      var st = S0 * Math.exp((r - 0.5 * sigma * sigma) * t + sigma * w[i]);
      sum += st;
    }
    var avg = sum / steps;
    return Math.exp(-r * T) * Math.max(avg - params.strike, 0);
  }

  function pathPayoffFromZ(z, params, bridge) {
    var w = bridge ? bridgeBrownian(z, params.steps) : sequentialBrownian(z, params.steps);
    return payoffFromBrownian(w, params);
  }

  function estimate(method, n, params, rep) {
    var steps = params.steps;
    var sum = 0;
    if (method === "mc") {
      var rand = lcg(params.seed * 1000003 + rep * 9176 + n * 131 + steps * 17);
      for (var i = 0; i < n; i += 1) {
        var z = [];
        for (var d = 0; d < steps; d += 1) z.push(normal(rand));
        sum += pathPayoffFromZ(z, params, false);
      }
      return sum / n;
    }
    var bridge = method === "bridge";
    var shift = makeShift(steps, params.seed * 8101 + rep * 104729 + (bridge ? 17 : 3));
    for (var j = 0; j < n; j += 1) {
      var zq = [];
      for (var k = 0; k < steps; k += 1) zq.push(haltonNormal(j + rep * 8192, k, shift));
      sum += pathPayoffFromZ(zq, params, bridge);
    }
    return sum / n;
  }

  function referencePrice(params) {
    var n = Math.max(32768, params.maxPaths * 8);
    var reps = 3;
    var total = 0;
    for (var r = 0; r < reps; r += 1) {
      total += estimate("bridge", n, params, 100 + r);
    }
    return total / reps;
  }

  function rmse(values, ref) {
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) {
      var e = values[i] - ref;
      sum += e * e;
    }
    return Math.sqrt(sum / values.length);
  }

  function mean(values) {
    return values.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, values.length);
  }

  function convergence(params, ref) {
    var sizes = SAMPLE_SIZES.filter(function (n) { return n <= params.maxPaths; });
    var methods = ["mc", "qmc", "bridge"];
    var rows = sizes.map(function (n) {
      var row = { n: n };
      methods.forEach(function (method) {
        var values = [];
        for (var rep = 0; rep < params.reps; rep += 1) {
          values.push(estimate(method, n, params, rep));
        }
        row[method] = {
          error: rmse(values, ref),
          estimate: mean(values),
          values: values
        };
      });
      return row;
    });
    return rows;
  }

  function bridgeOrder(steps) {
    var order = [steps];
    var queue = [{ left: 0, right: steps }];
    while (queue.length && order.length < steps) {
      var interval = queue.shift();
      if (interval.right - interval.left <= 1) continue;
      var mid = Math.floor((interval.left + interval.right) / 2);
      order.push(mid);
      queue.push({ left: interval.left, right: mid });
      queue.push({ left: mid, right: interval.right });
    }
    return order;
  }

  function averageBrownianCoefficients(params, bridge) {
    var steps = params.steps;
    var coeffs = [];
    for (var k = 0; k < steps; k += 1) {
      var z = new Array(steps).fill(0);
      z[k] = 1;
      var w = bridge ? bridgeBrownian(z, steps) : sequentialBrownian(z, steps);
      var sum = 0;
      for (var i = 1; i <= steps; i += 1) sum += w[i];
      coeffs.push(sum / steps);
    }
    var variances = coeffs.map(function (c) { return c * c; });
    var total = variances.reduce(function (a, b) { return a + b; }, 0) || 1;
    var cumulative = [];
    var running = 0;
    for (var j = 0; j < variances.length; j += 1) {
      running += variances[j];
      cumulative.push(running / total);
    }
    return cumulative;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var ref = referencePrice(params);
    var curve = convergence(params, ref);
    var last = curve[curve.length - 1];
    return {
      bridgeCumulative: averageBrownianCoefficients(params, true),
      curve: curve,
      last: last,
      params: params,
      reference: ref,
      sequentialCumulative: averageBrownianCoefficients(params, false)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="qmc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateMetrics(el, result) {
    var last = result.last;
    var ratio = last.mc.error / Math.max(1e-9, last.bridge.error);
    el.innerHTML = [
      metric("Reference price", formatNumber(result.reference, 3)),
      metric("MC RMSE", formatNumber(last.mc.error, 3)),
      metric("Bridge QMC RMSE", formatNumber(last.bridge.error, 3)),
      metric("Error ratio", formatNumber(ratio, 1) + "x")
    ].join("");
  }

  function updateOutputs(container, params) {
    var labels = {
      maxPaths: params.maxPaths.toLocaleString(),
      steps: String(params.steps),
      strike: String(params.strike),
      vol: params.vol + "%",
      rate: formatNumber(params.rate, 2) + "%",
      reps: String(params.reps),
      seed: String(params.seed)
    };
    Object.keys(labels).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function readState(container, previous) {
    var state = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (el) {
      state[el.getAttribute("data-param")] = el.value;
    });
    return cleanParams(state);
  }

  function setCanvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, rect.width || canvas.clientWidth || 900);
    var cssHeight = Math.max(660, Math.min(820, cssWidth * 0.86));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, color, size, weight, maxWidth) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(text), x, y, maxWidth);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.bg;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, COLORS.muted, 10, 600, w - 28);
  }

  function drawAxes(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawConvergence(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Convergence against reference", "RMSE over deterministic replicates");
    var plot = { x: x + 48, y: y + 58, w: w - 78, h: h - 92 };
    drawAxes(ctx, plot);
    var rows = result.curve;
    var minN = rows[0].n;
    var maxN = rows[rows.length - 1].n;
    var errors = [];
    rows.forEach(function (row) {
      errors.push(row.mc.error, row.qmc.error, row.bridge.error);
    });
    var minE = Math.max(1e-5, Math.min.apply(null, errors));
    var maxE = Math.max.apply(null, errors);
    minE /= 1.4;
    maxE *= 1.4;
    function px(n) {
      return plot.x + plot.w * (Math.log(n) - Math.log(minN)) / (Math.log(maxN) - Math.log(minN));
    }
    function py(e) {
      return plot.y + plot.h - plot.h * (Math.log(e) - Math.log(minE)) / (Math.log(maxE) - Math.log(minE));
    }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var xx = px(row.n);
        var yy = py(row[key].error);
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      rows.forEach(function (row) {
        ctx.beginPath();
        ctx.arc(px(row.n), py(row[key].error), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g += 1) {
      var gy = plot.y + plot.h * g / 3;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    line("mc", COLORS.mc);
    line("qmc", COLORS.qmc);
    line("bridge", COLORS.bridge);
    drawText(ctx, "MC", plot.x + plot.w - 78, plot.y + 18, COLORS.mc, 11, 750);
    drawText(ctx, "QMC", plot.x + plot.w - 48, plot.y + 18, COLORS.qmc, 11, 750);
    drawText(ctx, "bridge", plot.x + plot.w - 82, plot.y + 34, COLORS.bridge, 11, 750);
    drawText(ctx, String(minN), plot.x - 4, plot.y + plot.h + 18, COLORS.muted, 10, 500);
    drawText(ctx, String(maxN), plot.x + plot.w - 30, plot.y + plot.h + 18, COLORS.muted, 10, 500);
    drawText(ctx, formatNumber(maxE, 2), plot.x - 42, plot.y + 5, COLORS.muted, 10, 500);
    drawText(ctx, formatNumber(minE, 3), plot.x - 42, plot.y + plot.h, COLORS.muted, 10, 500);
  }

  function drawDimension(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Where the variance goes", "cumulative variance of average Brownian level");
    var plot = { x: x + 44, y: y + 58, w: w - 72, h: h - 88 };
    drawAxes(ctx, plot);
    function drawCurve(values, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      values.forEach(function (v, index) {
        var xx = plot.x + plot.w * index / Math.max(1, values.length - 1);
        var yy = plot.y + plot.h - plot.h * v;
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    drawCurve(result.sequentialCumulative, COLORS.qmc);
    drawCurve(result.bridgeCumulative, COLORS.bridge);
    drawText(ctx, "sequential", plot.x + plot.w - 84, plot.y + 18, COLORS.qmc, 11, 750);
    drawText(ctx, "bridge", plot.x + plot.w - 84, plot.y + 34, COLORS.bridge, 11, 750);
    drawText(ctx, "coordinate", plot.x + plot.w - 62, plot.y + plot.h + 18, COLORS.muted, 10, 500);
    drawText(ctx, "100%", plot.x - 38, plot.y + 4, COLORS.muted, 10, 500);
  }

  function drawScatter(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Random points versus low-discrepancy points", "first two coordinates only");
    var plot = { x: x + 36, y: y + 54, w: w - 58, h: h - 78 };
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var rand = lcg(result.params.seed * 4441 + 77);
    var n = 96;
    for (var i = 0; i < n; i += 1) {
      var x1 = rand();
      var y1 = rand();
      ctx.fillStyle = COLORS.pointMc;
      ctx.beginPath();
      ctx.arc(plot.x + x1 * plot.w, plot.y + y1 * plot.h, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (var j = 0; j < n; j += 1) {
      var hx = radicalInverse(j + 1, 2);
      var hy = radicalInverse(j + 1, 3);
      ctx.fillStyle = COLORS.point;
      ctx.beginPath();
      ctx.arc(plot.x + hx * plot.w, plot.y + hy * plot.h, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    drawText(ctx, "red: pseudo-random", plot.x + 8, plot.y + 18, COLORS.mc, 10, 750);
    drawText(ctx, "blue: Halton", plot.x + 8, plot.y + 34, COLORS.qmc, 10, 750);
  }

  function drawEstimates(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Price estimates at max budget", "mean across replicates");
    var plot = { x: x + 30, y: y + 58, w: w - 60, h: h - 88 };
    var rows = [
      { label: "MC", value: result.last.mc.estimate, color: COLORS.mc },
      { label: "QMC", value: result.last.qmc.estimate, color: COLORS.qmc },
      { label: "Bridge", value: result.last.bridge.estimate, color: COLORS.bridge }
    ];
    var values = rows.map(function (row) { return row.value; }).concat([result.reference]);
    var minV = Math.min.apply(null, values) - 0.4;
    var maxV = Math.max.apply(null, values) + 0.4;
    rows.forEach(function (row, index) {
      var yy = plot.y + index * 48;
      drawText(ctx, row.label, plot.x, yy + 18, COLORS.text, 11, 750, 60);
      ctx.fillStyle = COLORS.grid;
      drawRoundRect(ctx, plot.x + 66, yy + 6, plot.w - 98, 13, 5);
      ctx.fill();
      ctx.fillStyle = row.color;
      var frac = (row.value - minV) / (maxV - minV);
      drawRoundRect(ctx, plot.x + 66, yy + 6, (plot.w - 98) * clamp(frac, 0, 1), 13, 5);
      ctx.fill();
      drawText(ctx, formatNumber(row.value, 3), plot.x + plot.w - 28, yy + 18, row.color, 11, 750, 60);
    });
    var refX = plot.x + 66 + (plot.w - 98) * (result.reference - minV) / (maxV - minV);
    ctx.strokeStyle = COLORS.ref;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(refX, plot.y);
    ctx.lineTo(refX, plot.y + 145);
    ctx.stroke();
    drawText(ctx, "reference", refX - 24, plot.y + 164, COLORS.ref, 10, 700, 70);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var fitted = setCanvasSize(canvas);
    var ctx = fitted.ctx;
    var width = fitted.width;
    var height = fitted.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    var pad = 16;
    var gap = 14;
    if (width < 700) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawConvergence(ctx, result, pad, pad, width - pad * 2, panelH);
      drawDimension(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawScatter(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawEstimates(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }
    var leftW = width * 0.58;
    var rightW = width - leftW - pad * 2 - gap;
    var halfH = (height - pad * 2 - gap) / 2;
    drawConvergence(ctx, result, pad, pad, leftW, halfH);
    drawDimension(ctx, result, pad, pad + halfH + gap, leftW, halfH);
    drawScatter(ctx, result, pad + leftW + gap, pad, rightW, halfH);
    drawEstimates(ctx, result, pad + leftW + gap, pad + halfH + gap, rightW, halfH);
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var renderTimer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (el) {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    if (window.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      window.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-qmc-bridge-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    bridgeBrownian: bridgeBrownian,
    cleanParams: cleanParams,
    evaluate: evaluate,
    invNorm: invNorm,
    radicalInverse: radicalInverse,
    sequentialBrownian: sequentialBrownian
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QMCBridgeLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
