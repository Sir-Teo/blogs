(function (global) {
  "use strict";

  var COLORS = {
    bound: "#be123c",
    empirical: "#2563eb",
    grid: "#e6edf3",
    minus: "#b45309",
    muted: "#5d6872",
    panel: "#f8fafc",
    plus: "#0f766e",
    posterior: "#7c3aed",
    prior: "#64748b",
    rule: "#d7dee5",
    text: "#172026",
    trueRisk: "#0f766e",
    white: "#ffffff"
  };

  var DEFAULTS = {
    deltaPct: 5,
    n: 90,
    noisePct: 10,
    priorAngle: 20,
    priorSpread: 42,
    seed: 29,
    temperature: 42
  };

  var TRUE_ANGLE = 35 * Math.PI / 180;
  var TRUE_OFFSET = 0.04;
  var HYP_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      deltaPct: Math.round(clamp(finite(Number(raw.deltaPct), DEFAULTS.deltaPct), 1, 20)),
      n: Math.round(clamp(finite(Number(raw.n), DEFAULTS.n), 24, 260)),
      noisePct: Math.round(clamp(finite(Number(raw.noisePct), DEFAULTS.noisePct), 0, 35)),
      priorAngle: Math.round(clamp(finite(Number(raw.priorAngle), DEFAULTS.priorAngle), 0, 179)),
      priorSpread: Math.round(clamp(finite(Number(raw.priorSpread), DEFAULTS.priorSpread), 8, 90)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 997)),
      temperature: Math.round(clamp(finite(Number(raw.temperature), DEFAULTS.temperature), 0, 120))
    };
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

  function trueScore(x, y) {
    return Math.cos(TRUE_ANGLE) * x + Math.sin(TRUE_ANGLE) * y - TRUE_OFFSET;
  }

  function cleanLabel(x, y) {
    return trueScore(x, y) >= 0 ? 1 : -1;
  }

  function makeTrainingData(params) {
    var rows = [];
    var noise = params.noisePct / 100;
    var seed = params.seed * 1009;
    for (var i = 0; i < params.n; i += 1) {
      var u = uniform(4 * i + 0, seed);
      var v = uniform(4 * i + 1, seed);
      var x = 2 * u - 1;
      var y = 2 * v - 1;
      var clean = cleanLabel(x, y);
      var flipped = uniform(4 * i + 2, seed) < noise;
      rows.push({
        clean: clean,
        flipped: flipped,
        label: flipped ? -clean : clean,
        x: x,
        y: y
      });
    }
    return rows;
  }

  function makeTestGrid() {
    var rows = [];
    var side = 43;
    for (var iy = 0; iy < side; iy += 1) {
      for (var ix = 0; ix < side; ix += 1) {
        var x = -1 + 2 * (ix + 0.5) / side;
        var y = -1 + 2 * (iy + 0.5) / side;
        rows.push({ clean: cleanLabel(x, y), x: x, y: y });
      }
    }
    return rows;
  }

  function angleDistance(a, b) {
    var d = Math.abs(a - b);
    return Math.min(d, Math.PI - d);
  }

  function hypotheses() {
    if (HYP_CACHE) return HYP_CACHE;
    var out = [];
    var angleCount = 73;
    var offsetCount = 41;
    for (var ai = 0; ai < angleCount; ai += 1) {
      var angle = ai * Math.PI / angleCount;
      var wx = Math.cos(angle);
      var wy = Math.sin(angle);
      for (var oi = 0; oi < offsetCount; oi += 1) {
        var offset = -1.05 + 2.1 * oi / (offsetCount - 1);
        out.push({
          ai: ai,
          angle: angle,
          cos: wx,
          offset: offset,
          oi: oi,
          sin: wy
        });
      }
    }
    HYP_CACHE = {
      angleCount: angleCount,
      offsetCount: offsetCount,
      rows: out
    };
    return HYP_CACHE;
  }

  function prediction(h, point) {
    return h.cos * point.x + h.sin * point.y - h.offset >= 0 ? 1 : -1;
  }

  function priorWeights(params, hyp) {
    var center = params.priorAngle * Math.PI / 180;
    var spread = params.priorSpread * Math.PI / 180;
    var offsetSpread = 0.58;
    var logs = [];
    var maxLog = -Infinity;
    hyp.rows.forEach(function (h) {
      var ad = angleDistance(h.angle, center) / spread;
      var od = h.offset / offsetSpread;
      var logp = -0.5 * (ad * ad + od * od);
      logs.push(logp);
      if (logp > maxLog) maxLog = logp;
    });
    var weights = [];
    var total = 0;
    logs.forEach(function (logp) {
      var w = Math.exp(logp - maxLog);
      weights.push(w);
      total += w;
    });
    return weights.map(function (w) { return w / total; });
  }

  function evaluateHypotheses(params, train, test, hyp, prior) {
    var noise = params.noisePct / 100;
    return hyp.rows.map(function (h, index) {
      var trainErrors = 0;
      var trueLoss = 0;
      var i;
      for (i = 0; i < train.length; i += 1) {
        if (prediction(h, train[i]) !== train[i].label) trainErrors += 1;
      }
      for (i = 0; i < test.length; i += 1) {
        trueLoss += prediction(h, test[i]) === test[i].clean ? noise : 1 - noise;
      }
      return {
        h: h,
        logPrior: Math.log(prior[index]),
        prior: prior[index],
        trainRisk: trainErrors / train.length,
        trueRisk: trueLoss / test.length
      };
    });
  }

  function posteriorFromBeta(rows, beta, n) {
    var logs = rows.map(function (row) {
      return row.logPrior - beta * n * row.trainRisk;
    });
    var maxLog = Math.max.apply(null, logs);
    var raw = [];
    var total = 0;
    logs.forEach(function (logw) {
      var w = Math.exp(logw - maxLog);
      raw.push(w);
      total += w;
    });
    var q = raw.map(function (w) { return w / total; });
    var empirical = 0;
    var trueRisk = 0;
    var kl = 0;
    var entropy = 0;
    var topIndex = 0;
    var topWeight = -1;
    q.forEach(function (weight, i) {
      if (weight <= 0) return;
      empirical += weight * rows[i].trainRisk;
      trueRisk += weight * rows[i].trueRisk;
      kl += weight * (Math.log(weight) - rows[i].logPrior);
      entropy -= weight * Math.log(weight);
      if (weight > topWeight) {
        topWeight = weight;
        topIndex = i;
      }
    });
    return {
      beta: beta,
      empiricalRisk: empirical,
      effectiveCount: Math.exp(entropy),
      kl: Math.max(0, kl),
      q: q,
      topIndex: topIndex,
      topWeight: topWeight,
      trueRisk: trueRisk
    };
  }

  function binaryKl(q, p) {
    var eps = 1e-12;
    q = clamp(q, eps, 1 - eps);
    p = clamp(p, eps, 1 - eps);
    return q * Math.log(q / p) + (1 - q) * Math.log((1 - q) / (1 - p));
  }

  function klUpperBound(q, complexity) {
    q = clamp(q, 0, 1);
    if (complexity <= 0) return q;
    var hi = 1 - 1e-12;
    if (binaryKl(q, hi) <= complexity) return 1;
    var lo = q;
    for (var i = 0; i < 80; i += 1) {
      var mid = (lo + hi) / 2;
      if (binaryKl(q, mid) > complexity) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  function riskBound(empiricalRisk, kl, n, delta) {
    var complexity = (kl + Math.log(2 * Math.sqrt(n) / delta)) / n;
    return {
      bound: klUpperBound(empiricalRisk, complexity),
      complexity: complexity
    };
  }

  function voteRisk(rows, q, test, noise) {
    var loss = 0;
    for (var i = 0; i < test.length; i += 1) {
      var margin = 0;
      for (var j = 0; j < rows.length; j += 1) margin += q[j] * prediction(rows[j].h, test[i]);
      var vote = margin >= 0 ? 1 : -1;
      loss += vote === test[i].clean ? noise : 1 - noise;
    }
    return loss / test.length;
  }

  function curveForRows(rows, params) {
    var points = [];
    var delta = params.deltaPct / 100;
    for (var i = 0; i <= 42; i += 1) {
      var beta = 3 * i / 42;
      var post = posteriorFromBeta(rows, beta, params.n);
      var rb = riskBound(post.empiricalRisk, post.kl, params.n, delta);
      points.push({
        beta: beta,
        bound: rb.bound,
        complexity: rb.complexity,
        empiricalRisk: post.empiricalRisk,
        kl: post.kl,
        trueRisk: post.trueRisk
      });
    }
    return points;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var hyp = hypotheses();
    var train = makeTrainingData(params);
    var test = makeTestGrid();
    var prior = priorWeights(params, hyp);
    var rows = evaluateHypotheses(params, train, test, hyp, prior);
    var beta = params.temperature / 40;
    var post = posteriorFromBeta(rows, beta, params.n);
    var rb = riskBound(post.empiricalRisk, post.kl, params.n, params.deltaPct / 100);
    var top = rows[post.topIndex];
    return {
      bound: rb.bound,
      complexity: rb.complexity,
      curve: curveForRows(rows, params),
      hyp: hyp,
      params: params,
      posterior: post,
      rows: rows,
      test: test,
      top: top,
      train: train,
      voteRisk: voteRisk(rows, post.q, test, params.noisePct / 100)
    };
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNum(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="pac-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return raw;
  }

  function drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || "600") + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 23, { size: 13, weight: "800" });
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 40, { color: COLORS.muted, size: 10.5, weight: "650" });
    ctx.restore();
  }

  function scale(domain, range) {
    return function (value) {
      return range[0] + (value - domain[0]) / Math.max(1e-12, domain[1] - domain[0]) * (range[1] - range[0]);
    };
  }

  function mix(a, b, t) {
    return Math.round(a + (b - a) * clamp(t, 0, 1));
  }

  function colorMix(left, right, t) {
    return "rgb(" + mix(left[0], right[0], t) + "," + mix(left[1], right[1], t) + "," + mix(left[2], right[2], t) + ")";
  }

  function voteProbability(result, x, y) {
    var p = { x: x, y: y };
    var prob = 0;
    for (var i = 0; i < result.rows.length; i += 1) {
      if (prediction(result.rows[i].h, p) > 0) prob += result.posterior.q[i];
    }
    return prob;
  }

  function lineSegment(h, box, xS, yS) {
    var points = [];
    function add(x, y) {
      if (x >= -1 - 1e-9 && x <= 1 + 1e-9 && y >= -1 - 1e-9 && y <= 1 + 1e-9) {
        points.push({ x: clamp(x, -1, 1), y: clamp(y, -1, 1) });
      }
    }
    if (Math.abs(h.sin) > 1e-12) {
      add(-1, (h.offset - h.cos * -1) / h.sin);
      add(1, (h.offset - h.cos * 1) / h.sin);
    }
    if (Math.abs(h.cos) > 1e-12) {
      add((h.offset - h.sin * -1) / h.cos, -1);
      add((h.offset - h.sin * 1) / h.cos, 1);
    }
    if (points.length < 2) return null;
    return {
      x1: xS(points[0].x),
      y1: yS(points[0].y),
      x2: xS(points[1].x),
      y2: yS(points[1].y)
    };
  }

  function drawLineForHyp(ctx, h, xS, yS, color, width, dash) {
    var seg = lineSegment(h, null, xS, yS);
    if (!seg) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawData(ctx, result, box) {
    panel(ctx, box, "posterior vote", "sampled classifier distribution");
    var plot = { x: box.x + 44, y: box.y + 54, w: box.w - 68, h: box.h - 82 };
    var xS = scale([-1, 1], [plot.x, plot.x + plot.w]);
    var yS = scale([-1, 1], [plot.y + plot.h, plot.y]);
    var cells = 30;
    ctx.save();
    for (var iy = 0; iy < cells; iy += 1) {
      for (var ix = 0; ix < cells; ix += 1) {
        var x = -1 + 2 * (ix + 0.5) / cells;
        var y = -1 + 2 * (iy + 0.5) / cells;
        var prob = voteProbability(result, x, y);
        ctx.fillStyle = colorMix([190, 80, 40], [15, 118, 110], prob);
        ctx.globalAlpha = 0.15 + 0.42 * Math.abs(prob - 0.5) * 2;
        ctx.fillRect(plot.x + ix * plot.w / cells, plot.y + iy * plot.h / cells, plot.w / cells + 1, plot.h / cells + 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    drawLineForHyp(ctx, { cos: Math.cos(TRUE_ANGLE), sin: Math.sin(TRUE_ANGLE), offset: TRUE_OFFSET }, xS, yS, COLORS.text, 2.2, [6, 4]);
    drawLineForHyp(ctx, result.top.h, xS, yS, COLORS.posterior, 2.5);
    result.train.forEach(function (row) {
      ctx.fillStyle = row.label > 0 ? COLORS.plus : COLORS.minus;
      ctx.strokeStyle = row.flipped ? COLORS.bound : COLORS.white;
      ctx.lineWidth = row.flipped ? 1.8 : 1;
      ctx.beginPath();
      ctx.arc(xS(row.x), yS(row.y), row.flipped ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    drawText(ctx, "dashed true boundary", plot.x, box.y + box.h - 15, { color: COLORS.text, size: 10, weight: "750" });
    drawText(ctx, "purple top posterior h", plot.x + plot.w, box.y + box.h - 15, { align: "right", color: COLORS.posterior, size: 10, weight: "750" });
    ctx.restore();
  }

  function drawCurve(ctx, result, box) {
    panel(ctx, box, "risk bound path", "turn the posterior pressure knob");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 66, h: box.h - 88 };
    var values = [];
    result.curve.forEach(function (p) {
      values.push(p.empiricalRisk, p.trueRisk, p.bound);
    });
    var maxY = Math.min(1, Math.max(0.22, Math.ceil(Math.max.apply(null, values) * 10) / 10));
    var xS = scale([0, 3], [plot.x, plot.x + plot.w]);
    var yS = scale([0, maxY], [plot.y + plot.h, plot.y]);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 1].forEach(function (tick) {
      if (tick > maxY) return;
      var y = yS(tick);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, formatPct(tick, 0), plot.x - 7, y + 3, { align: "right", color: COLORS.muted, size: 9, weight: "650" });
    });
    function line(key, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 2;
      ctx.beginPath();
      result.curve.forEach(function (p, i) {
        var x = xS(p.beta);
        var y = yS(p[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line("bound", COLORS.bound, 2.4);
    line("trueRisk", COLORS.trueRisk, 2);
    line("empiricalRisk", COLORS.empirical, 2);
    var cx = xS(result.posterior.beta);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, plot.y);
    ctx.lineTo(cx, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "empirical", plot.x + 4, box.y + box.h - 17, { color: COLORS.empirical, size: 10, weight: "800" });
    drawText(ctx, "true", plot.x + 88, box.y + box.h - 17, { color: COLORS.trueRisk, size: 10, weight: "800" });
    drawText(ctx, "bound", plot.x + 136, box.y + box.h - 17, { color: COLORS.bound, size: 10, weight: "800" });
    drawText(ctx, "beta", plot.x + plot.w, box.y + box.h - 17, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    ctx.restore();
  }

  function drawPosterior(ctx, result, box) {
    panel(ctx, box, "posterior mass", "angle by threshold offset");
    var plot = { x: box.x + 38, y: box.y + 54, w: box.w - 60, h: box.h - 86 };
    var q = result.posterior.q;
    var maxQ = Math.max.apply(null, q);
    var hyp = result.hyp;
    var cellW = plot.w / hyp.angleCount;
    var cellH = plot.h / hyp.offsetCount;
    ctx.save();
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
    result.rows.forEach(function (row, index) {
      var h = row.h;
      var intensity = Math.log1p(q[index] / Math.max(1e-18, maxQ) * 24) / Math.log(25);
      ctx.fillStyle = colorMix([248, 250, 252], [124, 58, 237], intensity);
      ctx.fillRect(plot.x + h.ai * cellW, plot.y + (hyp.offsetCount - 1 - h.oi) * cellH, cellW + 0.3, cellH + 0.3);
    });
    var trueX = plot.x + (TRUE_ANGLE / Math.PI) * plot.w;
    var priorX = plot.x + (result.params.priorAngle / 180) * plot.w;
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(trueX, plot.y);
    ctx.lineTo(trueX, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.prior;
    ctx.beginPath();
    ctx.moveTo(priorX, plot.y);
    ctx.lineTo(priorX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    drawText(ctx, "0 deg", plot.x, box.y + box.h - 17, { color: COLORS.muted, size: 10, weight: "650" });
    drawText(ctx, "180 deg", plot.x + plot.w, box.y + box.h - 17, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    drawText(ctx, "true", trueX + 4, plot.y + 13, { color: COLORS.text, size: 9, weight: "800" });
    drawText(ctx, "prior", priorX + 4, plot.y + 28, { color: COLORS.prior, size: 9, weight: "800" });
    ctx.restore();
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "the receipt", "fit plus posterior complexity");
    var rows = [
      { label: "empirical Gibbs risk", value: result.posterior.empiricalRisk, max: 0.6, color: COLORS.empirical, text: formatPct(result.posterior.empiricalRisk, 1) },
      { label: "true Gibbs risk", value: result.posterior.trueRisk, max: 0.6, color: COLORS.trueRisk, text: formatPct(result.posterior.trueRisk, 1) },
      { label: "PAC-Bayes upper", value: result.bound, max: 0.6, color: COLORS.bound, text: formatPct(result.bound, 1) },
      { label: "KL / n", value: result.posterior.kl / result.params.n, max: 0.25, color: COLORS.posterior, text: formatNum(result.posterior.kl / result.params.n, 3) },
      { label: "effective hypotheses", value: Math.log(result.posterior.effectiveCount) / Math.log(result.rows.length), max: 1, color: COLORS.prior, text: formatNum(result.posterior.effectiveCount, 0) }
    ];
    var x0 = box.x + 22;
    var barX = box.x + 158;
    var barW = box.w - 180;
    var y0 = box.y + 64;
    var rowH = (box.h - 86) / rows.length;
    ctx.save();
    rows.forEach(function (row, i) {
      var y = y0 + i * rowH;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(barX, y, barW, 14);
      ctx.fillStyle = row.color;
      ctx.fillRect(barX, y, clamp(row.value / row.max, 0, 1) * barW, 14);
      drawText(ctx, row.label, x0, y + 12, { size: 10.5, weight: "750" });
      drawText(ctx, row.text, barX + barW, y + 31, { align: "right", color: COLORS.muted, size: 10, weight: "650" });
    });
    drawText(ctx, "top posterior weight " + formatPct(result.posterior.topWeight, 1), x0, box.y + box.h - 15, { color: COLORS.posterior, size: 10, weight: "800" });
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, "PAC-Bayes: the posterior has to pay rent", 18, 30, { size: 18, weight: "850" });
    drawText(ctx, result.params.n + " examples, beta " + formatNum(result.posterior.beta, 1) + ", delta " + result.params.deltaPct + "%", 18, 52, { color: COLORS.muted, size: 12, weight: "650" });
    drawData(ctx, result, { x: 18, y: 72, w: 440, h: 326 });
    drawCurve(ctx, result, { x: 480, y: 72, w: 422, h: 326 });
    drawPosterior(ctx, result, { x: 18, y: 422, w: 440, h: height - 442 });
    drawLedger(ctx, result, { x: 480, y: 422, w: 422, h: height - 442 });
  }

  function updateOutputs(root, params) {
    [
      ["n", String(params.n)],
      ["noisePct", params.noisePct + "%"],
      ["temperature", (params.temperature / 40).toFixed(2)],
      ["priorAngle", params.priorAngle + " deg"],
      ["priorSpread", params.priorSpread + " deg"],
      ["deltaPct", params.deltaPct + "%"],
      ["seed", String(params.seed)]
    ].forEach(function (pair) {
      var node = root.querySelector('[data-value="' + pair[0] + '"]');
      if (node) node.textContent = pair[1];
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateOutputs(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("empirical Gibbs", formatPct(result.posterior.empiricalRisk, 1)),
        metric("true Gibbs", formatPct(result.posterior.trueRisk, 1)),
        metric("PAC-Bayes upper", formatPct(result.bound, 1)),
        metric("KL(Q || P)", formatNum(result.posterior.kl, 1)),
        metric("vote true risk", formatPct(result.voteRisk, 1)),
        metric("effective count", formatNum(result.posterior.effectiveCount, 0))
      ].join("");
    }
    draw(root.querySelector("canvas[data-canvas]"), result);
  }

  function init(root) {
    if (!root || root.__pacBayesReady) return;
    root.__pacBayesReady = true;
    root.querySelectorAll("input[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function audit() {
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    var base = evaluate(DEFAULTS);
    assert(base.rows.length === base.hyp.angleCount * base.hyp.offsetCount, "hypothesis grid size");
    assert(base.posterior.q.length === base.rows.length, "posterior length");
    var sumQ = base.posterior.q.reduce(function (sum, value) { return sum + value; }, 0);
    assert(Math.abs(sumQ - 1) < 1e-10, "posterior sums to one");
    assert(base.bound >= base.posterior.empiricalRisk, "bound is above empirical risk");
    assert(base.bound <= 1, "bound is a probability");
    assert(base.posterior.trueRisk <= base.bound + 1e-9, "default synthetic true risk is below bound");

    var priorOnly = evaluate({ n: 80, noisePct: 10, temperature: 0, priorAngle: 20, priorSpread: 42, deltaPct: 5, seed: 29 });
    assert(priorOnly.posterior.kl < 1e-10, "temperature zero recovers prior");

    var low = evaluate({ n: 90, noisePct: 10, temperature: 5, priorAngle: 20, priorSpread: 42, deltaPct: 5, seed: 29 });
    var high = evaluate({ n: 90, noisePct: 10, temperature: 100, priorAngle: 20, priorSpread: 42, deltaPct: 5, seed: 29 });
    assert(high.posterior.empiricalRisk <= low.posterior.empiricalRisk + 1e-9, "higher beta lowers empirical risk");
    assert(high.posterior.kl >= low.posterior.kl, "higher beta spends more KL");

    var q = 0.12;
    var c = 0.04;
    var u = klUpperBound(q, c);
    assert(u >= q && u <= 1, "kl inverse range");
    assert(Math.abs(binaryKl(q, u) - c) < 1e-8, "kl inverse accuracy");

    return {
      defaultBound: Number(base.bound.toPrecision(4)),
      defaultTrueRisk: Number(base.posterior.trueRisk.toPrecision(4)),
      highBetaKl: Number(high.posterior.kl.toPrecision(4)),
      hypothesisCount: base.rows.length
    };
  }

  var api = {
    audit: audit,
    binaryKl: binaryKl,
    cleanParams: cleanParams,
    evaluate: evaluate,
    klUpperBound: klUpperBound
  };

  global.PacBayesLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-pac-bayes-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
