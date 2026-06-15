(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    target: "#111827",
    start: "#94a3b8",
    euclid: "#be123c",
    natural: "#0f766e",
    logit: "#2563eb",
    tail: "#7c3aed",
    amber: "#d97706"
  };

  var LABELS = ["anchor", "syntax", "fact", "style", "rare-a", "rare-b", "rare-c"];
  var EPS = 1e-12;
  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sum(values) {
    return values.reduce(function (acc, value) { return acc + value; }, 0);
  }

  function normalize(values) {
    var total = sum(values);
    return values.map(function (value) { return value / total; });
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "inf";
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "inf";
    var places = digits == null ? 3 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="natural-gradient-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    return {
      eta: clamp(raw.eta == null ? 12 : raw.eta, 2, 40) / 100,
      startTail: clamp(raw.startTail == null ? 30 : raw.startTail, 1, 60) / 100,
      steps: clamp(Math.round(raw.steps == null ? 24 : raw.steps), 1, 60),
      targetTail: clamp(raw.targetTail == null ? 8 : raw.targetTail, 1, 30) / 100
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function targetDistribution(params) {
    var head = 1 - params.targetTail;
    return normalize([
      0.62 * head,
      0.22 * head,
      0.10 * head,
      0.06 * head,
      0.50 * params.targetTail,
      0.30 * params.targetTail,
      0.20 * params.targetTail
    ]);
  }

  function initialDistribution(params) {
    var head = 1 - params.startTail;
    return normalize([
      0.25 * head,
      0.25 * head,
      0.25 * head,
      0.25 * head,
      params.startTail / 3,
      params.startTail / 3,
      params.startTail / 3
    ]);
  }

  function klTarget(q, p) {
    var value = 0;
    for (var i = 0; i < q.length; i += 1) {
      if (q[i] <= 0) continue;
      if (p[i] <= 0) return Infinity;
      value += q[i] * Math.log(q[i] / p[i]);
    }
    return Math.max(0, value);
  }

  function clippedKl(q, p) {
    var floored = p.map(function (value) { return Math.max(value, 1e-9); });
    return klTarget(q, normalize(floored));
  }

  function l1(q, p) {
    var value = 0;
    for (var i = 0; i < q.length; i += 1) value += Math.abs(q[i] - p[i]);
    return value;
  }

  function projectSimplex(values) {
    var sorted = values.slice().sort(function (a, b) { return b - a; });
    var cumulative = 0;
    var rho = -1;
    for (var i = 0; i < sorted.length; i += 1) {
      cumulative += sorted[i];
      if (sorted[i] - (cumulative - 1) / (i + 1) > 0) rho = i;
    }
    var activeSum = 0;
    for (var j = 0; j <= rho; j += 1) activeSum += sorted[j];
    var theta = (activeSum - 1) / (rho + 1);
    return values.map(function (value) { return Math.max(0, value - theta); });
  }

  function softmax(logits) {
    var maxLogit = Math.max.apply(null, logits);
    var exps = logits.map(function (value) { return Math.exp(value - maxLogit); });
    var total = sum(exps);
    return exps.map(function (value) { return value / total; });
  }

  function stateFor(t, q, p) {
    var tail = p[4] + p[5] + p[6];
    return {
      clippedLoss: clippedKl(q, p),
      loss: klTarget(q, p),
      l1: l1(q, p),
      minProb: Math.min.apply(null, p),
      p: p.slice(),
      tail: tail,
      t: t,
      zeros: p.filter(function (value) { return value < 1e-10; }).length
    };
  }

  function naturalStep(p, q, eta) {
    return p.map(function (value, i) {
      return (1 - eta) * value + eta * q[i];
    });
  }

  function euclideanStep(p, q, eta) {
    var gradient = p.map(function (value, i) {
      return -q[i] / Math.max(value, EPS);
    });
    return projectSimplex(p.map(function (value, i) {
      return value - eta * gradient[i];
    }));
  }

  function logitStep(logits, q, eta) {
    var p = softmax(logits);
    return logits.map(function (value, i) {
      return value - eta * (p[i] - q[i]);
    });
  }

  function runMethod(key, q, p0, eta, steps) {
    var p = p0.slice();
    var logits = p0.map(function (value) { return Math.log(value); });
    var rows = [stateFor(0, q, p)];
    for (var t = 1; t <= steps; t += 1) {
      if (key === "euclid") {
        p = euclideanStep(p, q, eta);
      } else if (key === "natural") {
        p = naturalStep(p, q, eta);
      } else {
        logits = logitStep(logits, q, eta);
        p = softmax(logits);
      }
      rows.push(stateFor(t, q, p));
    }
    return {
      key: key,
      label: key === "euclid" ? "Euclidean PGD" : (key === "natural" ? "natural step" : "logit SGD"),
      color: COLORS[key],
      rows: rows,
      final: rows[rows.length - 1]
    };
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var q = targetDistribution(params);
    var p0 = initialDistribution(params);
    var methods = {
      euclid: runMethod("euclid", q, p0, params.eta, params.steps),
      natural: runMethod("natural", q, p0, params.eta, params.steps),
      logit: runMethod("logit", q, p0, params.eta, params.steps)
    };
    return {
      initial: p0,
      methods: methods,
      params: params,
      target: q
    };
  }

  function approx(value, expected, tol) {
    return Math.abs(value - expected) <= (tol == null ? 1e-9 : tol);
  }

  function vectorOk(values) {
    return values.every(function (value) { return isFinite(value) && value >= -1e-10; }) && approx(sum(values), 1, 1e-9);
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];

    function record(name, ok, details) {
      checked += 1;
      if (ok) {
        passed += 1;
      } else if (failures.length < 8) {
        failures.push({ name: name, details: details || "" });
      }
    }

    record("simplex projection known case", projectSimplex([0.6, 0.6, -0.2]).every(function (value, i) {
      return approx(value, [0.5, 0.5, 0][i], 1e-12);
    }));
    record("softmax sums to one", vectorOk(softmax([2, -1, 0.5, 4])));

    [
      { eta: 12, steps: 24, targetTail: 8, startTail: 30 },
      { eta: 5, steps: 40, targetTail: 15, startTail: 10 },
      { eta: 25, steps: 12, targetTail: 4, startTail: 55 }
    ].forEach(function (raw, caseIndex) {
      var result = simulate(raw);
      record("target distribution case " + caseIndex, vectorOk(result.target));
      record("initial distribution case " + caseIndex, vectorOk(result.initial));
      Object.keys(result.methods).forEach(function (key) {
        var method = result.methods[key];
        record(key + " history length case " + caseIndex, method.rows.length === result.params.steps + 1);
        method.rows.forEach(function (row, rowIndex) {
          record(key + " simplex row " + caseIndex + "." + rowIndex, vectorOk(row.p));
          record(key + " clipped loss finite " + caseIndex + "." + rowIndex, isFinite(row.clippedLoss) && row.clippedLoss >= -1e-10);
        });
      });
      record(
        "natural loss decreases case " + caseIndex,
        result.methods.natural.final.loss <= result.methods.natural.rows[0].loss + 1e-12
      );
      record("logit keeps support case " + caseIndex, result.methods.logit.final.minProb > 0);
    });

    var params = cleanParams({ eta: 20, steps: 7, targetTail: 8, startTail: 30 });
    var q = targetDistribution(params);
    var p = initialDistribution(params);
    var pNatural = p.slice();
    for (var t = 0; t < 7; t += 1) pNatural = naturalStep(pNatural, q, params.eta);
    var factor = Math.pow(1 - params.eta, 7);
    record("natural closed form", pNatural.every(function (value, i) {
      return approx(value - q[i], factor * (p[i] - q[i]), 1e-12);
    }));
    record("natural eta one reaches target", naturalStep(p, q, 1).every(function (value, i) {
      return approx(value, q[i], 1e-12);
    }));

    var defaultResult = simulate({});
    record("default Euclidean exposes boundary risk", defaultResult.methods.euclid.final.zeros > 0);
    record("default natural stays finite", isFinite(defaultResult.methods.natural.final.loss));
    record("default logit stays finite", isFinite(defaultResult.methods.logit.final.loss));

    return {
      checked: checked,
      failures: failures,
      ok: failures.length === 0,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function groupDistribution(p) {
    return [p[0], p[1] + p[2] + p[3], p[4] + p[5] + p[6]];
  }

  function trianglePoint(group, box) {
    var a = { x: box.x + box.w * 0.50, y: box.y + 50 };
    var b = { x: box.x + 24, y: box.y + box.h - 28 };
    var c = { x: box.x + box.w - 24, y: box.y + box.h - 28 };
    return {
      x: group[0] * a.x + group[1] * b.x + group[2] * c.x,
      y: group[0] * a.y + group[1] * b.y + group[2] * c.y
    };
  }

  function drawSimplexPanel(ctx, result, box) {
    panelTitle(ctx, box, "Simplex paths", "same loss, different ruler");
    var a = { x: box.x + box.w * 0.50, y: box.y + 58 };
    var b = { x: box.x + 24, y: box.y + box.h - 32 };
    var c = { x: box.x + box.w - 24, y: box.y + box.h - 32 };
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.stroke();
    label(ctx, "anchor", a.x, a.y - 13, "center", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    label(ctx, "other common", b.x, b.y + 15, "left");
    label(ctx, "tail", c.x, c.y + 15, "right", COLORS.tail);

    Object.keys(result.methods).forEach(function (key) {
      var method = result.methods[key];
      ctx.strokeStyle = method.color;
      ctx.lineWidth = key === "natural" ? 2.4 : 1.8;
      ctx.beginPath();
      method.rows.forEach(function (row, i) {
        var pt = trianglePoint(groupDistribution(row.p), box);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      var end = trianglePoint(groupDistribution(method.final.p), box);
      ctx.fillStyle = method.color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    var start = trianglePoint(groupDistribution(result.initial), box);
    var target = trianglePoint(groupDistribution(result.target), box);
    ctx.fillStyle = COLORS.start;
    ctx.beginPath();
    ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "start", start.x + 7, start.y - 8, "left");
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, "target", target.x + 7, target.y + 10, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawLossPanel(ctx, result, box) {
    panelTitle(ctx, box, "Cross-entropy gap", "KL(target || model), floored only for drawing");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 88 };
    drawAxis(ctx, plot);
    var maxLoss = 0;
    Object.keys(result.methods).forEach(function (key) {
      result.methods[key].rows.forEach(function (row) {
        maxLoss = Math.max(maxLoss, row.clippedLoss);
      });
    });
    maxLoss = Math.max(maxLoss, 0.05);
    function xScale(t) { return plot.x + t / result.params.steps * plot.w; }
    function yScale(value) { return plot.y + plot.h - value / maxLoss * plot.h; }
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = yScale(maxLoss * f);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, formatNumber(maxLoss * f, 2), plot.x - 7, y, "right");
    });
    Object.keys(result.methods).forEach(function (key) {
      var method = result.methods[key];
      ctx.strokeStyle = method.color;
      ctx.lineWidth = key === "natural" ? 2.5 : 1.8;
      ctx.beginPath();
      method.rows.forEach(function (row, i) {
        var x = xScale(row.t);
        var y = yScale(row.clippedLoss);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    label(ctx, "red PGD, green natural, blue logits", plot.x, plot.y + plot.h + 26, "left");
  }

  function drawDistributionPanel(ctx, result, box) {
    panelTitle(ctx, box, "Final probabilities", "black target, colored final estimates");
    var plot = { x: box.x + 38, y: box.y + 58, w: box.w - 54, h: box.h - 92 };
    var maxP = Math.max.apply(null, result.target.concat(
      result.methods.euclid.final.p,
      result.methods.natural.final.p,
      result.methods.logit.final.p
    ));
    var groupW = plot.w / LABELS.length;
    LABELS.forEach(function (name, i) {
      var x = plot.x + i * groupW + 4;
      var base = plot.y + plot.h;
      var barW = Math.max(3, groupW / 6);
      var bars = [
        { value: result.target[i], color: COLORS.target },
        { value: result.methods.euclid.final.p[i], color: COLORS.euclid },
        { value: result.methods.natural.final.p[i], color: COLORS.natural },
        { value: result.methods.logit.final.p[i], color: COLORS.logit }
      ];
      bars.forEach(function (bar, j) {
        var h = bar.value / maxP * plot.h;
        ctx.fillStyle = bar.color;
        ctx.fillRect(x + j * (barW + 1), base - h, barW, h);
      });
      label(ctx, String(i + 1), x + groupW * 0.26, base + 14, "center");
    });
    label(ctx, "tokens 5-7 carry the rare tail", plot.x, plot.y + plot.h + 34, "left");
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Geometry ledger", "flat projection can leave the statistical model");
    var rows = [
      ["step size", formatNumber(result.params.eta, 2)],
      ["target tail", formatPercent(result.params.targetTail, 1)],
      ["start tail", formatPercent(result.params.startTail, 1)],
      ["PGD KL", formatNumber(result.methods.euclid.final.loss, 3)],
      ["PGD zero bins", String(result.methods.euclid.final.zeros)],
      ["natural KL", formatNumber(result.methods.natural.final.loss, 4)],
      ["logit KL", formatNumber(result.methods.logit.final.loss, 4)],
      ["natural L1", formatPercent(result.methods.natural.final.l1 / 2, 2)]
    ];
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rowGap = Math.min(25, Math.max(18, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      label(ctx, row[0], plot.x + 4, y + 12, "left");
      label(ctx, row[1], plot.x + plot.w - 4, y + 12, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1040 : 700;
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
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawSimplexPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawLossPanel(ctx, result, { x: margin, y: 306, w: panelW, h: 224 });
      drawDistributionPanel(ctx, result, { x: margin, y: 562, w: panelW, h: 224 });
      drawLedgerPanel(ctx, result, { x: margin, y: 816, w: panelW, h: 194 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawSimplexPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 318 });
      drawLossPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 318 });
      drawDistributionPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 246 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 246 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var audit = cachedAudit();
    var values = {
      eta: formatNumber(result.params.eta, 2),
      startTail: formatPercent(result.params.startTail, 0),
      steps: String(result.params.steps),
      targetTail: formatPercent(result.params.targetTail, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Euclidean KL", formatNumber(result.methods.euclid.final.loss, 3)),
        metric("natural KL", formatNumber(result.methods.natural.final.loss, 4)),
        metric("logit KL", formatNumber(result.methods.logit.final.loss, 4)),
        metric("PGD zero bins", String(result.methods.euclid.final.zeros)),
        metric("natural tail", formatPercent(result.methods.natural.final.tail, 1)),
        metric("audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-natural-gradient-lab]")).forEach(init);
  }

  var api = {
    euclideanStep: euclideanStep,
    initialDistribution: initialDistribution,
    klTarget: klTarget,
    naturalStep: naturalStep,
    projectSimplex: projectSimplex,
    runAudit: runAudit,
    simulate: simulate,
    softmax: softmax,
    targetDistribution: targetDistribution
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.NaturalGradientLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
