(function () {
  var COLORS = {
    ccdf: "#0f766e",
    fit: "#7c3aed",
    cutoff: "#b45309",
    unstable: "#be123c",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
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

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits);
  }

  function ordinal(value) {
    var mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return value + "th";
    if (value % 10 === 1) return value + "st";
    if (value % 10 === 2) return value + "nd";
    if (value % 10 === 3) return value + "rd";
    return value + "th";
  }

  function log10(value) {
    return Math.log(value) / Math.LN10;
  }

  function samplePareto(rand, alpha) {
    var u = Math.max(1e-9, 1 - rand());
    return Math.pow(u, -1 / (alpha - 1));
  }

  function sampleData(params) {
    var rand = rng(3889 + params.samples * 3 + params.shape * 17 + params.noise * 41 + params.distribution.length * 101);
    var alpha = params.shape / 100;
    var sigma = 0.45 + (params.shape - 120) / 300 * 1.75;
    var weibullK = clamp(2.6 / alpha, 0.42, 1.9);
    var data = [];

    for (var i = 0; i < params.samples; i += 1) {
      var value;
      if (params.distribution === "pareto") {
        value = samplePareto(rand, alpha);
      } else if (params.distribution === "lognormal") {
        value = Math.exp(sigma * normal(rand));
      } else if (params.distribution === "stretched") {
        value = Math.pow(-Math.log(Math.max(1e-9, 1 - rand())), 1 / weibullK);
      } else {
        value = rand() < 0.08 ? 3.5 * samplePareto(rand, alpha) : Math.exp(0.72 * normal(rand));
      }
      if (params.noise > 0) value *= Math.exp(params.noise / 100 * normal(rand));
      data.push(Math.max(value, 1e-9));
    }

    return data.sort(function (a, b) { return a - b; });
  }

  function tailFromCutoff(sorted, cutoffPercent) {
    var index = Math.min(sorted.length - 2, Math.max(0, Math.floor(sorted.length * cutoffPercent / 100)));
    var xmin = sorted[index];
    var tail = sorted.filter(function (value) { return value >= xmin; });
    return { xmin: xmin, tail: tail, index: index };
  }

  function fitPareto(tail, xmin) {
    var sum = 0;
    tail.forEach(function (value) { sum += Math.log(value / xmin); });
    return 1 + tail.length / Math.max(sum, 1e-12);
  }

  function paretoKs(tail, xmin, alpha) {
    var n = tail.length;
    var ks = 0;
    tail.forEach(function (value, i) {
      var model = 1 - Math.pow(value / xmin, 1 - alpha);
      var empiricalUpper = (i + 1) / n;
      var empiricalLower = i / n;
      ks = Math.max(ks, Math.abs(empiricalUpper - model), Math.abs(model - empiricalLower));
    });
    return ks;
  }

  function olsAlpha(tail, totalN) {
    var xs = [];
    var ys = [];
    tail.forEach(function (value, i) {
      var ccdf = (tail.length - i) / totalN;
      if (ccdf > 0 && value > 0) {
        xs.push(log10(value));
        ys.push(log10(ccdf));
      }
    });
    var meanX = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    var meanY = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
    var num = 0;
    var den = 0;
    for (var i = 0; i < xs.length; i += 1) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) * (xs[i] - meanX);
    }
    var slope = den > 0 ? num / den : 0;
    return 1 - slope;
  }

  function lognormalParams(tail) {
    var logs = tail.map(Math.log);
    var mu = logs.reduce(function (a, b) { return a + b; }, 0) / logs.length;
    var variance = logs.reduce(function (sum, value) {
      return sum + (value - mu) * (value - mu);
    }, 0) / logs.length;
    return { mu: mu, sigma: Math.sqrt(Math.max(variance, 1e-12)) };
  }

  function llPareto(tail, xmin, alpha) {
    return tail.reduce(function (sum, value) {
      return sum + Math.log(alpha - 1) + (alpha - 1) * Math.log(xmin) - alpha * Math.log(value);
    }, 0);
  }

  function llLognormal(tail, params) {
    var c = -Math.log(params.sigma) - 0.5 * Math.log(2 * Math.PI);
    return tail.reduce(function (sum, value) {
      var z = (Math.log(value) - params.mu) / params.sigma;
      return sum + c - Math.log(value) - 0.5 * z * z;
    }, 0);
  }

  function stability(sorted) {
    var points = [];
    for (var cutoff = 55; cutoff <= 94; cutoff += 3) {
      var fit = tailFromCutoff(sorted, cutoff);
      if (fit.tail.length > 8) {
        points.push({
          alpha: fitPareto(fit.tail, fit.xmin),
          cutoff: cutoff,
          n: fit.tail.length
        });
      }
    }
    var alphas = points.map(function (point) { return point.alpha; });
    var minAlpha = Math.min.apply(null, alphas);
    var maxAlpha = Math.max.apply(null, alphas);
    return { points: points, swing: maxAlpha - minAlpha, minAlpha: minAlpha, maxAlpha: maxAlpha };
  }

  function evaluate(params) {
    var sorted = sampleData(params);
    var selected = tailFromCutoff(sorted, params.cutoff);
    var alpha = fitPareto(selected.tail, selected.xmin);
    var ks = paretoKs(selected.tail, selected.xmin, alpha);
    var visualAlpha = olsAlpha(selected.tail, sorted.length);
    var lognormal = lognormalParams(selected.tail);
    var llEdge = (llPareto(selected.tail, selected.xmin, alpha) - llLognormal(selected.tail, lognormal)) / selected.tail.length;
    var stable = stability(sorted);

    return {
      alpha: alpha,
      data: sorted,
      ks: ks,
      llEdge: llEdge,
      selected: selected,
      stability: stable,
      visualAlpha: visualAlpha
    };
  }

  function metric(label, value) {
    return '<div class="tail-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(330, parentWidth);
    var height = width < 560 ? 570 : 520;
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

    var compact = width < 560;
    var left = compact ? 48 : 60;
    var right = compact ? 20 : 34;
    var top = 38;
    var plotW = width - left - right;
    var ccdfH = compact ? 245 : 260;
    var data = result.data;
    var minX = Math.max(1e-9, data[0]);
    var maxX = data[data.length - 1];
    var x0 = log10(minX);
    var x1 = log10(maxX);
    if (x1 - x0 < 0.5) {
      x0 -= 0.25;
      x1 += 0.25;
    }
    var y0 = log10(1 / data.length);
    var y1 = 0;

    function xScale(value) {
      return left + (log10(value) - x0) / (x1 - x0) * plotW;
    }

    function yScale(ccdf) {
      return top + (y1 - log10(ccdf)) / (y1 - y0) * ccdfH;
    }

    drawLabel(ctx, "Empirical complementary CDF on log-log axes", left, top - 14, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + ccdfH);
    ctx.lineTo(width - right, top + ccdfH);
    ctx.stroke();

    ctx.strokeStyle = COLORS.ccdf;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    data.forEach(function (value, i) {
      var ccdf = (data.length - i) / data.length;
      var x = xScale(value);
      var y = yScale(ccdf);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    var cutoffX = xScale(result.selected.xmin);
    ctx.strokeStyle = COLORS.cutoff;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cutoffX, top);
    ctx.lineTo(cutoffX, top + ccdfH);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, "xmin", cutoffX + 5, top + 14, "left", "middle", COLORS.cutoff);

    var ccdfAtXmin = result.selected.tail.length / data.length;
    var fitStartY = yScale(ccdfAtXmin);
    var fitEndY = yScale(ccdfAtXmin * Math.pow(maxX / result.selected.xmin, 1 - result.alpha));
    ctx.strokeStyle = COLORS.fit;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cutoffX, fitStartY);
    ctx.lineTo(xScale(maxX), fitEndY);
    ctx.stroke();
    ctx.lineWidth = 1;

    drawLabel(ctx, "value", left + plotW / 2, top + ccdfH + 28, "center", "top", COLORS.muted);
    drawLabel(ctx, "Pr(X >= x)", left - 8, top + ccdfH / 2, "right", "middle", COLORS.muted);

    var hillTop = top + ccdfH + (compact ? 76 : 84);
    var hillH = compact ? 160 : 150;
    var points = result.stability.points;
    var minA = Math.min(result.stability.minAlpha, result.alpha) - 0.15;
    var maxA = Math.max(result.stability.maxAlpha, result.alpha) + 0.15;
    if (maxA - minA < 0.4) {
      minA -= 0.15;
      maxA += 0.15;
    }

    function hx(cutoff) {
      return left + (cutoff - 55) / (94 - 55) * plotW;
    }

    function hy(alpha) {
      return hillTop + (maxA - alpha) / (maxA - minA) * hillH;
    }

    drawLabel(ctx, "Exponent estimate as the cutoff moves", left, hillTop - 14, "left", "bottom", COLORS.text);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, hillTop);
    ctx.lineTo(left, hillTop + hillH);
    ctx.lineTo(width - right, hillTop + hillH);
    ctx.stroke();

    ctx.strokeStyle = COLORS.unstable;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = hx(point.cutoff);
      var y = hy(point.alpha);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    points.forEach(function (point) {
      ctx.fillStyle = Math.abs(point.cutoff - params.cutoff) < 1.5 ? COLORS.fit : COLORS.unstable;
      ctx.beginPath();
      ctx.arc(hx(point.cutoff), hy(point.alpha), Math.abs(point.cutoff - params.cutoff) < 1.5 ? 4 : 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });

    [minA, (minA + maxA) / 2, maxA].forEach(function (tick) {
      var y = hy(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      drawLabel(ctx, formatNumber(tick, 1), left - 8, y, "right", "middle", COLORS.muted);
    });
    drawLabel(ctx, "cutoff percentile", left + plotW / 2, hillTop + hillH + 26, "center", "top", COLORS.muted);
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });

    var result = evaluate(params);
    var outputs = {
      samples: String(params.samples),
      cutoff: ordinal(params.cutoff),
      shape: formatNumber(params.shape / 100, 2),
      noise: params.noise + "%"
    };
    Object.keys(outputs).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = outputs[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Pareto alpha MLE", formatNumber(result.alpha, 2)),
        metric("Tail observations", String(result.selected.tail.length)),
        metric("KS distance", formatNumber(result.ks, 3)),
        metric("Visual alpha", formatNumber(result.visualAlpha, 2)),
        metric("Cutoff alpha swing", formatNumber(result.stability.swing, 2)),
        metric("Pareto vs lognormal LL", formatNumber(result.llEdge, 3))
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result, params);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-tail-lab]").forEach(init);
  });
}());
