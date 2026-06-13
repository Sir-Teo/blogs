(function () {
  var COLORS = {
    coverage: "#0f766e",
    width: "#b45309",
    target: "#2563eb",
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

  function sigmoid(x) {
    if (x > 35) return 1;
    if (x < -35) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function trueMean(x) {
    return 0.55 * x + 0.45 * Math.sin(1.6 * x);
  }

  function trueSigma(x, hetero) {
    return 0.48 + 1.25 * hetero * sigmoid(1.35 * (x - 0.15));
  }

  function sigmaHat(x, hetero, scaleError) {
    var trueScale = trueSigma(x, hetero);
    var distortion = 1 + scaleError * (0.35 * Math.sin(1.2 * x) - 0.20 * sigmoid(x - 1));
    return Math.max(0.18, trueScale * distortion);
  }

  function makeRow(rand, shift, hetero) {
    var x = normal(rand) + shift;
    var mu = trueMean(x);
    var sigma = trueSigma(x, hetero);
    var y = mu + sigma * normal(rand);
    return { x: x, mu: mu, sigma: sigma, y: y, residual: Math.abs(y - mu) };
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.ceil(q * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function weightedQuantile(items, q) {
    if (!items.length) return 0;
    var sorted = items.slice().sort(function (a, b) { return a.value - b.value; });
    var total = sorted.reduce(function (sum, item) { return sum + item.weight; }, 0);
    var threshold = q * total;
    var running = 0;
    for (var i = 0; i < sorted.length; i += 1) {
      running += sorted[i].weight;
      if (running >= threshold) return sorted[i].value;
    }
    return sorted[sorted.length - 1].value;
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatWidth(value) {
    return value.toFixed(2);
  }

  function evaluate(params) {
    var alpha = 1 - params.coverage / 100;
    var target = params.coverage / 100;
    var shift = params.shift / 10;
    var hetero = params.hetero / 100;
    var scaleError = params.scaleError / 100;
    var seed = 20260613
      + params.coverage * 7
      + params.calibration * 11
      + params.shift * 13
      + params.hetero * 17
      + params.scaleError * 19;
    var rand = rng(seed);
    var calibration = [];
    var test = [];
    for (var i = 0; i < params.calibration; i += 1) {
      calibration.push(makeRow(rand, 0, hetero));
    }
    for (var j = 0; j < 1200; j += 1) {
      test.push(makeRow(rand, shift, hetero));
    }

    var qLevel = Math.ceil((params.calibration + 1) * (1 - alpha)) / params.calibration;
    qLevel = clamp(qLevel, 0, 1);
    var residuals = calibration.map(function (row) { return row.residual; });
    var qSplit = quantile(residuals, qLevel);
    var constantScale = Math.sqrt(calibration.reduce(function (sum, row) {
      return sum + row.residual * row.residual;
    }, 0) / calibration.length);
    var gaussianMultiplier = params.coverage >= 95 ? 1.96 : params.coverage >= 90 ? 1.64 : params.coverage >= 80 ? 1.28 : 1.15;
    var qLocal = quantile(calibration.map(function (row) {
      return row.residual / sigmaHat(row.x, hetero, scaleError);
    }), qLevel);
    var weightedItems = calibration.map(function (row) {
      return {
        value: row.residual,
        weight: Math.exp(shift * row.x - 0.5 * shift * shift)
      };
    });
    var qWeighted = weightedQuantile(weightedItems, qLevel);
    var oracleMultiplier = quantile(Array.from({ length: 5000 }, function () {
      return Math.abs(normal(rand));
    }), qLevel);

    function summarize(label, key, widthFn) {
      var covered = 0;
      var widths = [];
      var highCovered = 0;
      var highCount = 0;
      test.forEach(function (row) {
        var halfWidth = widthFn(row);
        var ok = Math.abs(row.y - row.mu) <= halfWidth;
        if (ok) covered += 1;
        if (row.x > 1.2) {
          highCount += 1;
          if (ok) highCovered += 1;
        }
        widths.push(2 * halfWidth);
      });
      return {
        label: label,
        key: key,
        coverage: covered / test.length,
        highCoverage: highCount ? highCovered / highCount : 0,
        width: median(widths)
      };
    }

    var summaries = [
      summarize("Model only", "model", function () { return gaussianMultiplier * constantScale; }),
      summarize("Split", "split", function () { return qSplit; }),
      summarize("Local scale", "local", function (row) { return qLocal * sigmaHat(row.x, hetero, scaleError); }),
      summarize("Weighted", "weighted", function () { return qWeighted; }),
      summarize("Oracle local", "oracle", function (row) { return oracleMultiplier * row.sigma; })
    ];

    return {
      target: target,
      qSplit: qSplit,
      qWeighted: qWeighted,
      summaries: summaries
    };
  }

  function metric(label, value) {
    return '<div class="conformal-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var summaries = result.summaries;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 360;
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

    var left = width < 520 ? 46 : 62;
    var right = width < 520 ? 42 : 54;
    var top = 30;
    var bottom = width < 520 ? 88 : 66;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var maxWidth = Math.max.apply(null, summaries.map(function (row) { return row.width; })) * 1.18;
    var groupWidth = chartWidth / summaries.length;
    var barWidth = Math.max(10, Math.min(22, groupWidth / 5.5));

    function yCoverage(value) {
      return top + (1 - value) * chartHeight;
    }

    function yWidth(value) {
      return top + (1 - value / maxWidth) * chartHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + chartHeight);
    ctx.lineTo(width - right, top + chartHeight);
    ctx.stroke();

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = yCoverage(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(tick * 100)) + "%", left - 8, y);
    });

    ctx.textAlign = "left";
    [0, 0.5, 1].forEach(function (fraction) {
      var value = maxWidth * fraction;
      var y = yWidth(value);
      ctx.fillStyle = COLORS.warm || COLORS.muted;
      ctx.fillText(formatWidth(value), width - right + 8, y);
    });

    var targetY = yCoverage(result.target);
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, targetY);
    ctx.lineTo(width - right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    summaries.forEach(function (row, index) {
      var center = left + groupWidth * index + groupWidth / 2;
      var coverageX = center - barWidth - 3;
      var widthX = center + 3;
      var coverageY = yCoverage(row.coverage);
      var widthY = yWidth(row.width);

      ctx.fillStyle = COLORS.coverage;
      ctx.fillRect(coverageX, coverageY, barWidth, top + chartHeight - coverageY);
      ctx.fillStyle = COLORS.width;
      ctx.fillRect(widthX, widthY, barWidth, top + chartHeight - widthY);

      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatPercent(row.coverage), center, coverageY - 6);

      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textBaseline = "top";
      if (width < 520 && row.label.indexOf(" ") >= 0) {
        row.label.split(" ").forEach(function (line, lineIndex) {
          ctx.fillText(line, center, top + chartHeight + 16 + lineIndex * 14);
        });
      } else {
        ctx.fillText(row.label, center, top + chartHeight + 18);
      }
    });
  }

  function renderLab(lab) {
    var params = {
      coverage: Number(lab.querySelector('[data-param="coverage"]').value),
      calibration: Number(lab.querySelector('[data-param="calibration"]').value),
      shift: Number(lab.querySelector('[data-param="shift"]').value),
      hetero: Number(lab.querySelector('[data-param="hetero"]').value),
      scaleError: Number(lab.querySelector('[data-param="scaleError"]').value)
    };

    lab.querySelector('[data-value="coverage"]').textContent = params.coverage + "%";
    lab.querySelector('[data-value="calibration"]').textContent = params.calibration.toLocaleString();
    lab.querySelector('[data-value="shift"]').textContent = (params.shift / 10).toFixed(1);
    lab.querySelector('[data-value="hetero"]').textContent = params.hetero + "%";
    lab.querySelector('[data-value="scaleError"]').textContent = params.scaleError + "%";

    var result = evaluate(params);
    var split = result.summaries.find(function (row) { return row.key === "split"; });
    var weighted = result.summaries.find(function (row) { return row.key === "weighted"; });
    var local = result.summaries.find(function (row) { return row.key === "local"; });

    lab.querySelector("[data-metrics]").innerHTML = [
      metric("Target coverage", params.coverage + "%"),
      metric("Split coverage", formatPercent(split.coverage)),
      metric("Weighted coverage", formatPercent(weighted.coverage)),
      metric("Local high-x coverage", formatPercent(local.highCoverage)),
      metric("Split median width", formatWidth(split.width)),
      metric("Weighted median width", formatWidth(weighted.width))
    ].join("");

    drawChart(lab.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-conformal-lab]"));
    labs.forEach(function (lab) {
      var render = function () {
        renderLab(lab);
      };
      Array.prototype.slice.call(lab.querySelectorAll("input")).forEach(function (input) {
        input.addEventListener("input", render);
      });
      window.addEventListener("resize", render);
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
