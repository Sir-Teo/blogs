(function () {
  var TRADING_DAYS = 252;

  var DEFAULTS = {
    autocorrelation: 25,
    baseSharpe: 65,
    clustering: 40,
    smoothing: 40,
    trials: 300,
    years: 6
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    naive: "#0f766e",
    hac: "#be123c",
    clock: "#2563eb",
    lag: "#b45309",
    band: "#dbeafe",
    purple: "#7c3aed"
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

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      autocorrelation: clamp(Math.round(numberParam(raw, "autocorrelation")), -35, 75),
      baseSharpe: clamp(Math.round(numberParam(raw, "baseSharpe")), 20, 150),
      clustering: clamp(Math.round(numberParam(raw, "clustering")), 0, 100),
      smoothing: clamp(Math.round(numberParam(raw, "smoothing")), 0, 85),
      trials: clamp(Math.round(numberParam(raw, "trials")), 100, 700),
      years: clamp(Math.round(numberParam(raw, "years")), 2, 15)
    };
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function variance(values) {
    if (values.length < 2) return 0;
    var mu = mean(values);
    var total = values.reduce(function (sum, value) {
      return sum + Math.pow(value - mu, 2);
    }, 0);
    return total / values.length;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[index];
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="sharpe-clock-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function autocovariance(values, lag, mu) {
    var n = values.length;
    if (n <= lag) return 0;
    var total = 0;
    for (var i = lag; i < n; i += 1) {
      total += (values[i] - mu) * (values[i - lag] - mu);
    }
    return total / n;
  }

  function autocorrelations(values, maxLag) {
    var mu = mean(values);
    var gamma0 = autocovariance(values, 0, mu);
    var rows = [];
    for (var lag = 1; lag <= maxLag; lag += 1) {
      rows.push({
        lag: lag,
        value: gamma0 > 1e-18 ? autocovariance(values, lag, mu) / gamma0 : 0
      });
    }
    return rows;
  }

  function neweyWestBandwidth(n) {
    return clamp(Math.floor(4 * Math.pow(n / 100, 2 / 9)), 1, 60);
  }

  function longRunVariance(values, bandwidth) {
    var mu = mean(values);
    var gamma0 = autocovariance(values, 0, mu);
    var lrv = gamma0;
    var limit = Math.min(bandwidth, values.length - 1);
    for (var lag = 1; lag <= limit; lag += 1) {
      var weight = 1 - lag / (limit + 1);
      lrv += 2 * weight * autocovariance(values, lag, mu);
    }
    return Math.max(lrv, Math.max(gamma0, 1e-14) * 0.01);
  }

  function sharpeStats(returns, periodsPerYear, bandwidth) {
    var mu = mean(returns);
    var gamma0 = variance(returns);
    var naiveVol = Math.sqrt(Math.max(gamma0, 1e-16) * periodsPerYear);
    var naiveSharpe = naiveVol > 0 ? mu * periodsPerYear / naiveVol : 0;
    var lrv = longRunVariance(returns, bandwidth == null ? neweyWestBandwidth(returns.length) : bandwidth);
    var hacVol = Math.sqrt(Math.max(lrv, 1e-16) * periodsPerYear);
    var hacSharpe = hacVol > 0 ? mu * periodsPerYear / hacVol : 0;
    return {
      annualMean: mu * periodsPerYear,
      hacSharpe: hacSharpe,
      hacVol: hacVol,
      lrv: lrv,
      naiveSharpe: naiveSharpe,
      naiveVol: naiveVol,
      varianceInflation: gamma0 > 1e-18 ? lrv / gamma0 : 1
    };
  }

  function aggregateReturns(returns, block) {
    var out = [];
    for (var i = 0; i + block <= returns.length; i += block) {
      var total = 0;
      for (var j = 0; j < block; j += 1) total += returns[i + j];
      out.push(total);
    }
    return out;
  }

  function clockSharpes(returns) {
    var blocks = [1, 5, 21, 63, 126, 252].filter(function (block) {
      return returns.length >= block * 4;
    });
    return blocks.map(function (block) {
      var rows = aggregateReturns(returns, block);
      var stats = sharpeStats(rows, TRADING_DAYS / block, 0);
      return {
        block: block,
        label: block === 1 ? "1d" : block === 5 ? "1w" : block === 21 ? "1m" : block === 63 ? "1q" : block === 126 ? "6m" : "1y",
        sharpe: stats.naiveSharpe,
        volRatio: Math.sqrt(Math.max(variance(rows), 1e-16) / Math.max(block * variance(returns), 1e-16))
      };
    });
  }

  function simulatePath(params, runIndex) {
    params = cleanParams(params);
    var years = params.years;
    var days = Math.round(years * TRADING_DAYS);
    var annualVol = 0.16;
    var dailyVol = annualVol / Math.sqrt(TRADING_DAYS);
    var baseSharpe = params.baseSharpe / 100;
    var dailyMean = baseSharpe * annualVol / TRADING_DAYS;
    var rho = clamp(params.autocorrelation / 100, -0.85, 0.92);
    var smoothing = clamp(params.smoothing / 100, 0, 0.95);
    var clustering = clamp(params.clustering / 100, 0, 1);
    var rand = rng(
      20260614
      + runIndex * 7919
      + params.baseSharpe * 11
      + params.autocorrelation * 13
      + params.smoothing * 17
      + params.clustering * 19
      + params.years * 23
    );
    var returns = [];
    var latent = [];
    var arState = 0;
    var reportedState = 0;
    var varianceState = 1;
    var previousShockSq = 1;
    var alpha = 0.08 * clustering;
    var beta = 0.88 * clustering;
    var omega = Math.max(0.01, 1 - alpha - beta);
    var innovationScale = Math.sqrt(Math.max(0.01, 1 - rho * rho));

    for (var day = 0; day < days; day += 1) {
      varianceState = clamp(omega + alpha * previousShockSq + beta * varianceState, 0.15, 7.5);
      var eps = normal(rand);
      previousShockSq = eps * eps;
      arState = rho * arState + innovationScale * dailyVol * Math.sqrt(varianceState) * eps;
      var raw = dailyMean + arState;
      reportedState = smoothing * reportedState + (1 - smoothing) * (raw - dailyMean);
      latent.push(raw);
      returns.push(dailyMean + reportedState);
    }

    return {
      latentReturns: latent,
      returns: returns,
      years: years
    };
  }

  function histogram(values, binCount, fixedMin, fixedMax) {
    var min = fixedMin == null ? Math.min.apply(null, values) : fixedMin;
    var max = fixedMax == null ? Math.max.apply(null, values) : fixedMax;
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = -1;
      max = 1;
    }
    var bins = [];
    for (var i = 0; i < binCount; i += 1) {
      bins.push({ x0: min + i / binCount * (max - min), x1: min + (i + 1) / binCount * (max - min), count: 0 });
    }
    values.forEach(function (value) {
      var index = clamp(Math.floor((value - min) / Math.max(1e-12, max - min) * binCount), 0, binCount - 1);
      bins[index].count += 1;
    });
    return bins;
  }

  function evaluate(params) {
    params = cleanParams(params);
    var path = simulatePath(params, 0);
    var stats = sharpeStats(path.returns, TRADING_DAYS);
    var lags = autocorrelations(path.returns, 12);
    var clocks = clockSharpes(path.returns);
    var trials = Math.round(params.trials);
    var naiveSamples = [];
    var hacSamples = [];

    for (var trial = 0; trial < trials; trial += 1) {
      var sample = simulatePath(params, trial + 1).returns;
      var row = sharpeStats(sample, TRADING_DAYS);
      naiveSamples.push(row.naiveSharpe);
      hacSamples.push(row.hacSharpe);
    }

    var histMin = Math.min(quantile(naiveSamples, 0.02), quantile(hacSamples, 0.02));
    var histMax = Math.max(quantile(naiveSamples, 0.98), quantile(hacSamples, 0.98));
    var effectiveDays = path.returns.length / Math.max(stats.varianceInflation, 0.05);
    return {
      acf: lags,
      clocks: clocks,
      hacSamples: hacSamples,
      hacHistogram: histogram(hacSamples, 28, histMin, histMax),
      naiveHistogram: histogram(naiveSamples, 28, histMin, histMax),
      naiveSamples: naiveSamples,
      path: path,
      stats: stats,
      summary: {
        bandwidth: neweyWestBandwidth(path.returns.length),
        effectiveDays: effectiveDays,
        hacMedian: quantile(hacSamples, 0.5),
        lag1: lags.length ? lags[0].value : 0,
        naiveMedian: quantile(naiveSamples, 0.5),
        p90Gap: quantile(naiveSamples, 0.9) - quantile(hacSamples, 0.9),
        ratio: stats.hacSharpe !== 0 ? stats.naiveSharpe / stats.hacSharpe : 0,
        varianceInflation: stats.varianceInflation
      }
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
    label(ctx, title, box.x, box.y - 13, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 13, "right", "bottom", COLORS.muted);
    }
  }

  function line(ctx, points, xScale, yScale, color, width) {
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

  function drawClockSharpes(ctx, result, box) {
    panel(ctx, box, "Sharpe by sampling clock", "same path, different bars");
    var points = result.clocks;
    var hac = result.stats.hacSharpe;
    var values = points.map(function (p) { return p.sharpe; }).concat([hac]);
    var minY = Math.min(-0.2, Math.min.apply(null, values) - 0.2);
    var maxY = Math.max(1.2, Math.max.apply(null, values) + 0.2);
    function sx(point) {
      var index = points.indexOf(point);
      return box.x + 38 + index / Math.max(1, points.length - 1) * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - (value - minY) / Math.max(1e-9, maxY - minY) * (box.h - 58);
    }

    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1, 1.5].forEach(function (tick) {
      if (tick < minY || tick > maxY) return;
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 34, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      label(ctx, tick.toFixed(1), box.x + 27, y, "right", "middle", COLORS.muted);
    });
    ctx.strokeStyle = COLORS.hac;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(box.x + 34, sy(hac));
    ctx.lineTo(box.x + box.w - 18, sy(hac));
    ctx.stroke();
    ctx.setLineDash([]);
    line(ctx, points, sx, function (p) { return sy(p.sharpe); }, COLORS.clock, 2.4);
    points.forEach(function (point) {
      ctx.fillStyle = COLORS.clock;
      ctx.beginPath();
      ctx.arc(sx(point), sy(point.sharpe), 3.6, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, point.label, sx(point), box.y + box.h - 12, "center", "middle", COLORS.muted);
    });
    label(ctx, "HAC " + formatNumber(hac, 2), box.x + box.w - 20, sy(hac) - 6, "right", "bottom", COLORS.hac);
  }

  function drawAutocorrelation(ctx, result, box) {
    panel(ctx, box, "Autocorrelation ledger", "lags make variance travel");
    var rows = result.acf;
    var zeroY = box.y + box.h - 32 - (0.5) * (box.h - 62);
    function sx(index) {
      return box.x + 36 + index / rows.length * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 32 - clamp((value + 0.5) / 1, 0, 1) * (box.h - 62);
    }
    ctx.strokeStyle = COLORS.faint;
    [-0.25, 0, 0.25, 0.5].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 32, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      if (tick !== 0) label(ctx, tick.toFixed(2), box.x + 27, y, "right", "middle", COLORS.muted);
    });
    rows.forEach(function (row, index) {
      var x = sx(index);
      var w = Math.max(5, (box.w - 72) / rows.length * 0.62);
      ctx.fillStyle = row.value >= 0 ? COLORS.lag : COLORS.purple;
      ctx.fillRect(x - w / 2, Math.min(zeroY, sy(row.value)), w, Math.abs(sy(row.value) - zeroY));
      if (row.lag === 1 || row.lag === 6 || row.lag === 12) {
        label(ctx, String(row.lag), x, box.y + box.h - 13, "center", "middle", COLORS.muted);
      }
    });
    label(ctx, "lag", box.x + box.w - 18, box.y + box.h - 13, "right", "middle", COLORS.muted);
  }

  function drawHistogram(ctx, result, box) {
    panel(ctx, box, "Monte Carlo Sharpe estimates", "naive vs long-run variance");
    var naive = result.naiveHistogram;
    var hac = result.hacHistogram;
    var maxCount = Math.max.apply(null, naive.concat(hac).map(function (bin) { return bin.count; }));
    var minX = naive[0].x0;
    var maxX = naive[naive.length - 1].x1;
    function sx(value) {
      return box.x + 34 + (value - minX) / Math.max(1e-9, maxX - minX) * (box.w - 54);
    }
    function barHeight(count) {
      return count / Math.max(1, maxCount) * (box.h - 60);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1, 1.5, 2].forEach(function (tick) {
      if (tick < minX || tick > maxX) return;
      var x = sx(tick);
      ctx.beginPath();
      ctx.moveTo(x, box.y + 22);
      ctx.lineTo(x, box.y + box.h - 30);
      ctx.stroke();
      label(ctx, tick.toFixed(1), x, box.y + box.h - 12, "center", "middle", COLORS.muted);
    });
    naive.forEach(function (bin) {
      var h = barHeight(bin.count);
      ctx.fillStyle = "rgba(15, 118, 110, 0.48)";
      ctx.fillRect(sx(bin.x0), box.y + box.h - 30 - h, Math.max(1, sx(bin.x1) - sx(bin.x0) - 1), h);
    });
    hac.forEach(function (bin) {
      var h = barHeight(bin.count);
      ctx.fillStyle = "rgba(190, 18, 60, 0.44)";
      ctx.fillRect(sx(bin.x0), box.y + box.h - 30 - h, Math.max(1, sx(bin.x1) - sx(bin.x0) - 1), h);
    });
    label(ctx, "median naive " + formatNumber(result.summary.naiveMedian, 2), box.x + 40, box.y + 22, "left", "middle", COLORS.naive);
    label(ctx, "median HAC " + formatNumber(result.summary.hacMedian, 2), box.x + box.w - 20, box.y + 22, "right", "middle", COLORS.hac);
  }

  function drawVarianceScaling(ctx, result, box) {
    panel(ctx, box, "Square-root rule check", "volatility of h-day sums");
    var points = result.clocks;
    var maxY = Math.max(1.6, Math.max.apply(null, points.map(function (p) { return p.volRatio; })) + 0.12);
    function sx(point) {
      var index = points.indexOf(point);
      return box.x + 38 + index / Math.max(1, points.length - 1) * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp(value / maxY, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0.5, 1, 1.5, 2].forEach(function (tick) {
      if (tick > maxY) return;
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 34, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      label(ctx, tick.toFixed(1) + "x", box.x + 27, y, "right", "middle", COLORS.muted);
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(box.x + 34, sy(1));
    ctx.lineTo(box.x + box.w - 18, sy(1));
    ctx.stroke();
    ctx.setLineDash([]);
    line(ctx, points, sx, function (p) { return sy(p.volRatio); }, COLORS.purple, 2.4);
    points.forEach(function (point) {
      ctx.fillStyle = COLORS.purple;
      ctx.beginPath();
      ctx.arc(sx(point), sy(point.volRatio), 3.4, 0, 2 * Math.PI);
      ctx.fill();
      label(ctx, point.label, sx(point), box.y + box.h - 12, "center", "middle", COLORS.muted);
    });
    label(ctx, "iid baseline", box.x + box.w - 20, sy(1) - 5, "right", "bottom", COLORS.muted);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 940 : 650;
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
    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawClockSharpes(ctx, result, { x: left, y: 42, w: plotW, h: 176 });
      drawAutocorrelation(ctx, result, { x: left, y: 288, w: plotW, h: 160 });
      drawHistogram(ctx, result, { x: left, y: 520, w: plotW, h: 160 });
      drawVarianceScaling(ctx, result, { x: left, y: 752, w: plotW, h: 150 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawClockSharpes(ctx, result, { x: margin, y: 42, w: w, h: 210 });
      drawAutocorrelation(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 210 });
      drawHistogram(ctx, result, { x: margin, y: 338, w: w, h: 185 });
      drawVarianceScaling(ctx, result, { x: margin + w + gap, y: 338, w: w, h: 185 });
    }
  }

  function parseParams(root) {
    var params = {
      autocorrelation: 25,
      baseSharpe: 65,
      clustering: 40,
      smoothing: 40,
      trials: 300,
      years: 6
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "baseSharpe") output.textContent = formatNumber(params[key] / 100, 2);
      else if (key === "autocorrelation" || key === "smoothing" || key === "clustering") output.textContent = params[key] + "%";
      else if (key === "years") output.textContent = params[key] + "y";
      else output.textContent = params[key];
    });
  }

  function render(root) {
    var params = cleanParams(parseParams(root));
    var result = evaluate(params);
    updateOutputs(root, params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("daily-clock Sharpe", formatNumber(result.stats.naiveSharpe, 2)),
      metric("HAC Sharpe", formatNumber(result.stats.hacSharpe, 2)),
      metric("naive / HAC", formatNumber(result.summary.ratio, 2) + "x"),
      metric("lag-1 autocorr", formatPercent(result.summary.lag1, 0)),
      metric("variance inflation", formatNumber(result.summary.varianceInflation, 2) + "x"),
      metric("effective days", Math.round(result.summary.effectiveDays).toLocaleString())
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-sharpe-clock-lab]"));
    labs.forEach(function (root) {
      if (root.__sharpeClockReady) return;
      root.__sharpeClockReady = true;
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
      aggregateReturns: aggregateReturns,
      autocorrelations: autocorrelations,
      clockSharpes: clockSharpes,
      cleanParams: cleanParams,
      evaluate: evaluate,
      longRunVariance: longRunVariance,
      sharpeStats: sharpeStats,
      simulatePath: simulatePath
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
