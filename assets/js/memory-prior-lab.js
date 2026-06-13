(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    target: "#0f766e",
    lure: "#be123c",
    unrelated: "#64748b",
    omit: "#d97706",
    prior: "#7c3aed",
    cue: "#2563eb",
    band: "#ccfbf1",
    bg: "#ffffff"
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

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="memory-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function sd(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var v = values.reduce(function (sum, value) {
      var d = value - m;
      return sum + d * d;
    }, 0) / (values.length - 1);
    return Math.sqrt(v);
  }

  function makeParams(raw) {
    return {
      criterion: raw.criterion == null ? 48 : raw.criterion,
      delay: raw.delay == null ? 45 : raw.delay,
      encodingNoise: raw.encodingNoise == null ? 42 : raw.encodingNoise,
      gistStrength: raw.gistStrength == null ? 55 : raw.gistStrength,
      suggestion: raw.suggestion == null ? 25 : raw.suggestion,
      trials: raw.trials == null ? 900 : raw.trials
    };
  }

  function evidenceMeans(params, delayOverride) {
    var delay = delayOverride == null ? params.delay : delayOverride;
    var verbatim = 2.45 * Math.exp(-delay / 115);
    var gist = 0.18 + 1.7 * (params.gistStrength / 100) * (0.72 + 0.28 * Math.exp(-delay / 260));
    var suggestion = 1.25 * params.suggestion / 100;
    var criterion = -0.35 + 2.15 * params.criterion / 100;
    var sigma = 0.55 + 1.05 * params.encodingNoise / 100 + 0.45 * (1 - Math.exp(-delay / 150));
    return {
      criterion: criterion,
      gist: gist,
      lure: gist + suggestion,
      sigma: sigma,
      suggestion: suggestion,
      target: verbatim + 0.45 * gist,
      unrelated: -0.7 + 0.05 * suggestion,
      verbatim: verbatim
    };
  }

  function runOne(params, delayOverride) {
    var p = makeParams(params);
    var m = evidenceMeans(p, delayOverride);
    var seed = 20260613
      + Math.round(p.criterion * 11)
      + Math.round(p.delay * 17)
      + Math.round(p.encodingNoise * 23)
      + Math.round(p.gistStrength * 29)
      + Math.round(p.suggestion * 31)
      + Math.round((delayOverride || 0) * 37)
      + p.trials;
    var rand = rng(seed);
    var target = [];
    var lure = [];
    var unrelated = [];
    var targetReports = 0;
    var lureReports = 0;
    var unrelatedReports = 0;
    var omissions = 0;
    var targetConf = [];
    var lureConf = [];
    var unrelatedConf = [];
    for (var i = 0; i < p.trials; i += 1) {
      var targetEvidence = m.target + m.sigma * normal(rand);
      var lureEvidence = m.lure + m.sigma * normal(rand);
      var unrelatedEvidence = m.unrelated + m.sigma * normal(rand);
      target.push(targetEvidence);
      lure.push(lureEvidence);
      unrelated.push(unrelatedEvidence);
      if (targetEvidence >= m.criterion) {
        targetReports += 1;
        targetConf.push(sigmoid(1.35 * (targetEvidence - m.criterion)));
      } else {
        omissions += 1;
      }
      if (lureEvidence >= m.criterion) {
        lureReports += 1;
        lureConf.push(sigmoid(1.35 * (lureEvidence - m.criterion)));
      }
      if (unrelatedEvidence >= m.criterion) {
        unrelatedReports += 1;
        unrelatedConf.push(sigmoid(1.35 * (unrelatedEvidence - m.criterion)));
      }
    }
    var hitRate = targetReports / p.trials;
    var lureRate = lureReports / p.trials;
    var unrelatedRate = unrelatedReports / p.trials;
    var precision = targetReports / Math.max(1, targetReports + lureReports + unrelatedReports);
    return {
      means: m,
      omissions: omissions / p.trials,
      precision: precision,
      rates: {
        hit: hitRate,
        lure: lureRate,
        unrelated: unrelatedRate
      },
      samples: {
        target: target,
        lure: lure,
        unrelated: unrelated
      },
      confidence: {
        target: mean(targetConf),
        lure: mean(lureConf),
        unrelated: mean(unrelatedConf)
      },
      spread: {
        target: sd(target),
        lure: sd(lure),
        unrelated: sd(unrelated)
      }
    };
  }

  function simulate(params) {
    var p = makeParams(params);
    var current = runOne(p);
    var delays = [0, 15, 45, 90, 180, 360];
    var curve = delays.map(function (delay) {
      var row = runOne(p, delay);
      return {
        delay: delay,
        hit: row.rates.hit,
        lure: row.rates.lure,
        precision: row.precision,
        omission: row.omissions
      };
    });
    return {
      params: p,
      current: current,
      curve: curve
    };
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function path(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point);
      var y = yScale(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function density(x, mu, sigma) {
    var z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / Math.max(0.001, sigma);
  }

  function drawEvidence(ctx, result, box) {
    panel(ctx, box, "Recognition evidence", "criterion decides report");
    var m = result.current.means;
    var minX = -2.2;
    var maxX = Math.max(4.2, m.target + 2.8 * m.sigma, m.lure + 2.8 * m.sigma);
    function sx(value) {
      return box.x + 34 + (value - minX) / (maxX - minX) * (box.w - 54);
    }
    var maxD = Math.max(
      density(m.target, m.target, m.sigma),
      density(m.lure, m.lure, m.sigma),
      density(m.unrelated, m.unrelated, m.sigma)
    );
    function sy(value) {
      return box.y + box.h - 30 - value / maxD * (box.h - 58);
    }
    var xs = [];
    for (var i = 0; i <= 120; i += 1) xs.push(minX + (maxX - minX) * i / 120);
    path(ctx, xs, sx, function (x) { return sy(density(x, m.target, m.sigma)); }, COLORS.target, 2.2);
    path(ctx, xs, sx, function (x) { return sy(density(x, m.lure, m.sigma)); }, COLORS.lure, 2.2);
    path(ctx, xs, sx, function (x) { return sy(density(x, m.unrelated, m.sigma)); }, COLORS.unrelated, 1.6);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(m.criterion), box.y + 20);
    ctx.lineTo(sx(m.criterion), box.y + box.h - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "criterion", sx(m.criterion) + 4, box.y + 26, "left", "middle", COLORS.text);
    label(ctx, "target", box.x + 40, box.y + 22, "left", "middle", COLORS.target);
    label(ctx, "gist lure", box.x + 100, box.y + 22, "left", "middle", COLORS.lure);
    label(ctx, "unrelated", box.x + 176, box.y + 22, "left", "middle", COLORS.unrelated);
    label(ctx, "weak", box.x + 34, box.y + box.h - 12, "left", "middle", COLORS.muted);
    label(ctx, "strong", box.x + box.w - 20, box.y + box.h - 12, "right", "middle", COLORS.muted);
  }

  function drawRates(ctx, result, box) {
    panel(ctx, box, "Report rates", "same trace, different claims");
    var rows = [
      { label: "true target", value: result.current.rates.hit, color: COLORS.target },
      { label: "gist lure", value: result.current.rates.lure, color: COLORS.lure },
      { label: "unrelated lure", value: result.current.rates.unrelated, color: COLORS.unrelated },
      { label: "omission", value: result.current.omissions, color: COLORS.omit }
    ];
    var rowH = (box.h - 50) / rows.length;
    rows.forEach(function (row, index) {
      var y = box.y + 30 + index * rowH;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x + 110, y, box.w - 134, rowH - 10);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x + 110, y, (box.w - 134) * row.value, rowH - 10);
      label(ctx, row.label, box.x + 12, y + (rowH - 10) / 2, "left", "middle", COLORS.text);
      label(ctx, formatPct(row.value, 0), box.x + box.w - 16, y + (rowH - 10) / 2, "right", "middle", row.value > 0.68 ? "#ffffff" : COLORS.text);
    });
  }

  function drawDelay(ctx, result, box) {
    panel(ctx, box, "Delay curve", "verbatim fades faster than gist");
    var curve = result.curve;
    var maxDelay = curve[curve.length - 1].delay;
    function sx(point) {
      return box.x + 36 + point.delay / maxDelay * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp(value, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0.25, 0.5, 0.75].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 36, y);
      ctx.lineTo(box.x + box.w - 22, y);
      ctx.stroke();
    });
    path(ctx, curve, sx, function (p) { return sy(p.hit); }, COLORS.target, 2.2);
    path(ctx, curve, sx, function (p) { return sy(p.lure); }, COLORS.lure, 2.2);
    path(ctx, curve, sx, function (p) { return sy(p.precision); }, COLORS.prior, 1.8);
    label(ctx, "hit", box.x + 42, box.y + 20, "left", "middle", COLORS.target);
    label(ctx, "false", box.x + 84, box.y + 20, "left", "middle", COLORS.lure);
    label(ctx, "precision", box.x + 140, box.y + 20, "left", "middle", COLORS.prior);
    label(ctx, "now", box.x + 36, box.y + box.h - 12, "left", "middle", COLORS.muted);
    label(ctx, maxDelay + "m", box.x + box.w - 22, box.y + box.h - 12, "right", "middle", COLORS.muted);
  }

  function drawPipeline(ctx, result, box) {
    panel(ctx, box, "Reconstruction ledger", "evidence plus prior plus cue");
    var m = result.current.means;
    var rows = [
      { label: "verbatim trace", value: m.verbatim / 2.45, color: COLORS.target },
      { label: "schema gist", value: m.gist / 1.9, color: COLORS.prior },
      { label: "suggestion cue", value: m.suggestion / 1.25, color: COLORS.cue },
      { label: "noise width", value: clamp((m.sigma - 0.55) / 1.5, 0, 1), color: COLORS.omit }
    ];
    var rowH = (box.h - 50) / rows.length;
    rows.forEach(function (row, index) {
      var y = box.y + 32 + index * rowH;
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(box.x + 122, y, box.w - 148, rowH - 12);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x + 122, y, (box.w - 148) * clamp(row.value, 0, 1), rowH - 12);
      label(ctx, row.label, box.x + 12, y + (rowH - 12) / 2, "left", "middle", COLORS.text);
    });
    var confText = "target conf " + formatPct(result.current.confidence.target, 0)
      + " / lure conf " + formatPct(result.current.confidence.lure, 0);
    label(ctx, confText, box.x + 12, box.y + box.h - 18, "left", "middle", COLORS.muted);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 900 : 620;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawEvidence(ctx, result, { x: left, y: 42, w: plotW, h: 170 });
      drawRates(ctx, result, { x: left, y: 284, w: plotW, h: 160 });
      drawDelay(ctx, result, { x: left, y: 516, w: plotW, h: 150 });
      drawPipeline(ctx, result, { x: left, y: 738, w: plotW, h: 130 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawEvidence(ctx, result, { x: margin, y: 42, w: w, h: 210 });
      drawRates(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 210 });
      drawDelay(ctx, result, { x: margin, y: 338, w: w, h: 170 });
      drawPipeline(ctx, result, { x: margin + w + gap, y: 338, w: w, h: 170 });
    }
  }

  function parseParams(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return makeParams(params);
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "delay") output.textContent = params[key] + "m";
      else if (key === "trials") output.textContent = params[key];
      else output.textContent = params[key] + "%";
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    updateOutputs(root, params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("target hit", formatPct(result.current.rates.hit, 0)),
      metric("gist false alarm", formatPct(result.current.rates.lure, 0)),
      metric("unrelated false alarm", formatPct(result.current.rates.unrelated, 0)),
      metric("precision", formatPct(result.current.precision, 0)),
      metric("omission", formatPct(result.current.omissions, 0)),
      metric("lure confidence", formatPct(result.current.confidence.lure, 0))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-memory-lab]"));
    labs.forEach(function (root) {
      if (root.__memoryLabReady) return;
      root.__memoryLabReady = true;
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
      evidenceMeans: evidenceMeans,
      runOne: runOne,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
