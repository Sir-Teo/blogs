(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    vol: "#2563eb",
    price: "#0f766e",
    density: "#7c3aed",
    bad: "#be123c",
    butterfly: "#b45309",
    forward: "#111827",
    white: "#ffffff"
  };

  var DEFAULTS = {
    atmVol: 22,
    curvature: 24,
    maturityDays: 180,
    quoteRoughness: 0,
    smoothing: 1,
    skew: 38
  };

  var S0 = 100;
  var RATE = 0.035;
  var STRIKE_MIN = 30;
  var STRIKE_MAX = 190;
  var STRIKE_COUNT = 129;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      atmVol: clamp(numberParam(raw, "atmVol"), 8, 65) / 100,
      curvature: clamp(numberParam(raw, "curvature"), 0, 90) / 130,
      maturityDays: Math.round(clamp(numberParam(raw, "maturityDays"), 21, 730)),
      quoteRoughness: clamp(numberParam(raw, "quoteRoughness"), 0, 100) / 100,
      smoothing: Math.round(clamp(numberParam(raw, "smoothing"), 0, 5)),
      skew: clamp(numberParam(raw, "skew"), -20, 90) / 220
    };
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var z = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * z);
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function blackScholesCall(spot, strike, rate, maturity, vol) {
    var sigma = Math.max(1e-6, vol);
    var sqrtT = Math.sqrt(Math.max(1e-9, maturity));
    var d1 = (Math.log(spot / strike) + (rate + 0.5 * sigma * sigma) * maturity) / (sigma * sqrtT);
    var d2 = d1 - sigma * sqrtT;
    return spot * normalCdf(d1) - strike * Math.exp(-rate * maturity) * normalCdf(d2);
  }

  function makeStrikes() {
    var strikes = [];
    var step = (STRIKE_MAX - STRIKE_MIN) / (STRIKE_COUNT - 1);
    for (var i = 0; i < STRIKE_COUNT; i += 1) strikes.push(STRIKE_MIN + i * step);
    return strikes;
  }

  function smileVol(params, strike, forward) {
    var m = Math.log(strike / forward);
    var wings = params.curvature * m * m;
    var skew = -params.skew * m;
    var leftCrash = 0.22 * params.skew * Math.pow(Math.max(0, -m), 2);
    var termDamp = 0.72 + 0.28 * Math.sqrt(Math.min(2, params.maturityDays / 365));
    var vol = params.atmVol + termDamp * (skew + wings + leftCrash);
    return clamp(vol, 0.03, 1.35);
  }

  function roughQuoteBump(params, strike, forward) {
    if (params.quoteRoughness <= 0) return 0;
    var m = Math.log(strike / forward);
    var envelope = Math.exp(-1.7 * m * m);
    var wave = Math.sin(18.5 * m + 0.4) + 0.55 * Math.sin(43 * m - 0.8);
    var saw = ((Math.floor((strike - STRIKE_MIN) / 5) % 2) ? -1 : 1) * 0.55;
    return params.quoteRoughness * envelope * (0.25 * wave + 0.08 * saw);
  }

  function smoothPrices(rows, passes) {
    var out = rows.map(function (row) {
      return Object.assign({}, row);
    });
    for (var pass = 0; pass < passes; pass += 1) {
      var next = out.map(function (row) {
        return Object.assign({}, row);
      });
      for (var i = 1; i < out.length - 1; i += 1) {
        next[i].call = 0.25 * out[i - 1].call + 0.5 * out[i].call + 0.25 * out[i + 1].call;
      }
      out = next;
    }
    return out;
  }

  function surfaceRows(params) {
    var maturity = params.maturityDays / 365;
    var forward = S0 * Math.exp(RATE * maturity);
    var discount = Math.exp(-RATE * maturity);
    var strikes = makeStrikes();
    var rows = strikes.map(function (strike) {
      var vol = smileVol(params, strike, forward);
      var cleanCall = blackScholesCall(S0, strike, RATE, maturity, vol);
      var call = cleanCall + roughQuoteBump(params, strike, forward);
      call = clamp(call, Math.max(0, S0 - strike * discount) - 0.02, S0 + 0.02);
      return {
        strike: strike,
        vol: vol,
        cleanCall: cleanCall,
        call: call
      };
    });

    return smoothPrices(rows, params.smoothing).map(function (row, index) {
      row.vol = rows[index].vol;
      row.cleanCall = rows[index].cleanCall;
      return row;
    });
  }

  function analyzeRows(rows, params) {
    var maturity = params.maturityDays / 365;
    var growth = Math.exp(RATE * maturity);
    var h = rows[1].strike - rows[0].strike;
    var density = [];
    var digital = [];
    var butterflies = [];
    var negativeMass = 0;
    var totalMass = 0;
    var mean = 0;
    var minButterfly = Infinity;
    var monotoneViolations = 0;

    for (var i = 1; i < rows.length - 1; i += 1) {
      var second = (rows[i - 1].call - 2 * rows[i].call + rows[i + 1].call) / (h * h);
      var dens = growth * second;
      var dCdK = (rows[i + 1].call - rows[i - 1].call) / (2 * h);
      var cdf = 1 + growth * dCdK;
      var butterfly = rows[i - 1].call - 2 * rows[i].call + rows[i + 1].call;
      density.push({ strike: rows[i].strike, density: dens });
      digital.push({ strike: rows[i].strike, cdf: cdf });
      butterflies.push({ strike: rows[i].strike, value: butterfly });
      totalMass += dens * h;
      mean += rows[i].strike * dens * h;
      if (dens < 0) negativeMass += -dens * h;
      minButterfly = Math.min(minButterfly, butterfly);
    }

    for (var j = 0; j < rows.length - 1; j += 1) {
      if (rows[j + 1].call - rows[j].call > 1e-8) monotoneViolations += 1;
    }

    var forward = S0 * growth;
    var maxDensity = density.reduce(function (best, row) {
      return Math.max(best, Math.abs(row.density));
    }, 1e-9);

    return {
      density: density,
      digital: digital,
      butterflies: butterflies,
      summary: {
        forward: forward,
        mean: mean,
        meanError: mean - forward,
        minButterfly: minButterfly,
        monotoneViolations: monotoneViolations,
        negativeMass: negativeMass,
        noArb: negativeMass < 0.005 && minButterfly >= -1e-4 && monotoneViolations === 0,
        totalMass: totalMass,
        maxDensity: maxDensity
      }
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rows = surfaceRows(params);
    var analysis = analyzeRows(rows, params);
    return {
      params: params,
      rows: rows,
      density: analysis.density,
      digital: analysis.digital,
      butterflies: analysis.butterflies,
      summary: analysis.summary
    };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toExponential(1);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function money(value) {
    var sign = value < 0 ? "-" : "";
    return sign + "$" + Math.abs(value).toFixed(3);
  }

  function metric(label, value) {
    return '<div class="smile-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = Number(input.value);
    });
    return raw;
  }

  function updateOutputs(root, params) {
    var display = {
      atmVol: pct(params.atmVol, 0),
      curvature: String(Math.round(params.curvature * 130)),
      maturityDays: String(params.maturityDays),
      quoteRoughness: String(Math.round(params.quoteRoughness * 100)),
      smoothing: String(params.smoothing),
      skew: String(Math.round(params.skew * 220))
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")];
    });
  }

  function renderMetrics(root, result) {
    var s = result.summary;
    var html = [
      metric("status", s.noArb ? "clean" : "arbitrage"),
      metric("probability mass", fmt(s.totalMass, 3)),
      metric("negative mass", pct(s.negativeMass, 2)),
      metric("density mean", fmt(s.mean, 2)),
      metric("forward", fmt(s.forward, 2)),
      metric("min butterfly", money(s.minButterfly))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var height = targetHeight;
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
  }

  function extent(rows, key, padFrac) {
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      var value = row[key];
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    if (min === Infinity) return [0, 1];
    if (Math.abs(max - min) < 1e-9) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * (padFrac == null ? 0.08 : padFrac);
    return [min - pad, max + pad];
  }

  function axis(ctx, box, yZero) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var y = box.y + box.h - (i / 4) * box.h;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    }
    if (Number.isFinite(yZero)) {
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(box.x, yZero);
      ctx.lineTo(box.x + box.w, yZero);
      ctx.stroke();
    }
  }

  function drawLine(ctx, rows, x, y, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var px = x(row);
      var py = y(row);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function label(ctx, text, x, y, align) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function strikeScale(box) {
    return function (strike) {
      return box.x + ((strike - STRIKE_MIN) / (STRIKE_MAX - STRIKE_MIN)) * box.w;
    };
  }

  function drawSmile(ctx, result, box) {
    panel(ctx, box, "Implied volatility smile");
    var plot = { x: box.x + 38, y: box.y + 42, w: box.w - 54, h: box.h - 74 };
    var yExt = extent(result.rows, "vol", 0.18);
    yExt[0] = Math.max(0, yExt[0]);
    var x = strikeScale(plot);
    var y = function (row) {
      return plot.y + plot.h - ((row.vol - yExt[0]) / (yExt[1] - yExt[0])) * plot.h;
    };
    axis(ctx, plot);
    drawLine(ctx, result.rows, function (row) { return x(row.strike); }, y, COLORS.vol, 2.3);
    var fX = x(result.summary.forward);
    ctx.strokeStyle = COLORS.forward;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(fX, plot.y);
    ctx.lineTo(fX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, pct(yExt[1], 0), box.x + 8, plot.y + 4);
    label(ctx, pct(yExt[0], 0), box.x + 8, plot.y + plot.h);
    label(ctx, "strike", plot.x + plot.w - 34, plot.y + plot.h + 22);
  }

  function drawCallPrice(ctx, result, box) {
    panel(ctx, box, "Call prices: monotone and convex or not?");
    var plot = { x: box.x + 38, y: box.y + 42, w: box.w - 54, h: box.h - 74 };
    var yExt = extent(result.rows, "call", 0.08);
    yExt[0] = Math.max(0, yExt[0]);
    var x = strikeScale(plot);
    var y = function (row) {
      return plot.y + plot.h - ((row.call - yExt[0]) / (yExt[1] - yExt[0])) * plot.h;
    };
    axis(ctx, plot);
    drawLine(ctx, result.rows, function (row) { return x(row.strike); }, y, COLORS.price, 2.4);
    drawLine(ctx, result.rows, function (row) { return x(row.strike); }, function (row) {
      return plot.y + plot.h - ((row.cleanCall - yExt[0]) / (yExt[1] - yExt[0])) * plot.h;
    }, COLORS.rule, 1.4);
    label(ctx, "$" + fmt(yExt[1], 0), box.x + 8, plot.y + 4);
    label(ctx, "$0", box.x + 14, plot.y + plot.h);
    label(ctx, "gray = pre-noise model price", plot.x, plot.y + plot.h + 22);
  }

  function drawDensity(ctx, result, box) {
    panel(ctx, box, "Breeden-Litzenberger density");
    var plot = { x: box.x + 38, y: box.y + 42, w: box.w - 54, h: box.h - 74 };
    var maxAbs = Math.max(result.summary.maxDensity, 1e-5);
    var yMin = result.summary.negativeMass > 1e-6 ? -0.32 * maxAbs : 0;
    var yMax = maxAbs * 1.08;
    var x = strikeScale(plot);
    var y = function (value) {
      return plot.y + plot.h - ((value - yMin) / (yMax - yMin)) * plot.h;
    };
    var zeroY = y(0);
    axis(ctx, plot, zeroY);
    var barW = plot.w / result.density.length;
    result.density.forEach(function (row) {
      var px = x(row.strike);
      var py = y(row.density);
      ctx.fillStyle = row.density < 0 ? COLORS.bad : COLORS.density;
      ctx.globalAlpha = row.density < 0 ? 0.8 : 0.55;
      ctx.fillRect(px - barW / 2, Math.min(py, zeroY), Math.max(1, barW * 0.9), Math.max(1, Math.abs(zeroY - py)));
    });
    ctx.globalAlpha = 1;
    var fX = x(result.summary.forward);
    var mX = x(result.summary.mean);
    ctx.strokeStyle = COLORS.forward;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(fX, plot.y);
    ctx.lineTo(fX, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = COLORS.bad;
    ctx.beginPath();
    ctx.moveTo(mX, plot.y);
    ctx.lineTo(mX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "forward", fX + 4, plot.y + 13);
    label(ctx, "density mean", mX + 4, plot.y + 29);
  }

  function drawButterflies(ctx, result, box) {
    panel(ctx, box, "One-step butterflies");
    var plot = { x: box.x + 38, y: box.y + 42, w: box.w - 54, h: box.h - 74 };
    var maxAbs = result.butterflies.reduce(function (best, row) {
      return Math.max(best, Math.abs(row.value));
    }, 1e-5);
    var y = function (value) {
      return plot.y + plot.h / 2 - (value / maxAbs) * (plot.h * 0.44);
    };
    var x = strikeScale(plot);
    var zeroY = y(0);
    axis(ctx, plot, zeroY);
    var barW = plot.w / result.butterflies.length;
    result.butterflies.forEach(function (row) {
      var px = x(row.strike);
      var py = y(row.value);
      ctx.fillStyle = row.value < -1e-8 ? COLORS.bad : COLORS.butterfly;
      ctx.globalAlpha = row.value < -1e-8 ? 0.86 : 0.55;
      ctx.fillRect(px - barW / 2, Math.min(py, zeroY), Math.max(1, barW * 0.86), Math.max(1, Math.abs(zeroY - py)));
    });
    ctx.globalAlpha = 1;
    label(ctx, "negative bars are convexity violations", plot.x, plot.y + plot.h + 22);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 980 : 700);
    var ctx = setup.ctx;
    if (compact) {
      drawSmile(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 226 });
      drawCallPrice(ctx, result, { x: 8, y: 246, w: setup.width - 16, h: 226 });
      drawDensity(ctx, result, { x: 8, y: 484, w: setup.width - 16, h: 236 });
      drawButterflies(ctx, result, { x: 8, y: 732, w: setup.width - 16, h: 240 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawSmile(ctx, result, { x: 8, y: 8, w: col, h: 330 });
      drawCallPrice(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 330 });
      drawDensity(ctx, result, { x: 8, y: 354, w: col, h: 338 });
      drawButterflies(ctx, result, { x: col + 20, y: 354, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-smile-lab]")).forEach(function (root) {
      if (root.__smileReady) return;
      root.__smileReady = true;
      var schedule = null;
      function requestRender() {
        if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
        schedule = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            schedule = null;
            render(root);
          })
          : global.setTimeout(function () {
            schedule = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  var api = {
    blackScholesCall: blackScholesCall,
    cleanParams: cleanParams,
    evaluate: evaluate,
    normalCdf: normalCdf,
    smileVol: smileVol
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SmileDensityLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
