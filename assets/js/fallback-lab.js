(function () {
  var COLORS = {
    global: "#94a3b8",
    local: "#b45309",
    cascade: "#0f766e",
    shrink: "#2563eb",
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

  function poisson(rand, lambda) {
    if (lambda > 35) {
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
    }
    var limit = Math.exp(-lambda);
    var k = 0;
    var p = 1;
    do {
      k += 1;
      p *= rand();
    } while (p > limit);
    return k - 1;
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) {
      return sum + value;
    }, 0) / values.length;
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function keyFor(row, level) {
    if (level === 0) return "global";
    return [row.carrier, row.cabin, row.route, row.flight]
      .slice(0, level)
      .join("|");
  }

  function makeWorld(params) {
    var rand = rng(20250827);
    var carriers = [
      { id: "A", effect: 24, demand: 1.15 },
      { id: "B", effect: -8, demand: 0.95 },
      { id: "C", effect: 42, demand: 0.75 },
      { id: "D", effect: 12, demand: 0.6 }
    ];
    var cabins = [
      { id: "Y", effect: 0, demand: 1.25 },
      { id: "W", effect: 38, demand: 0.75 },
      { id: "J", effect: 116, demand: 0.42 }
    ];
    var routes = [
      { id: "JFK-LHR", effect: 82, demand: 1.2 },
      { id: "LAX-NRT", effect: 96, demand: 0.8 },
      { id: "SFO-CDG", effect: 58, demand: 0.75 },
      { id: "ORD-MEX", effect: 22, demand: 1.05 },
      { id: "SEA-AMS", effect: 68, demand: 0.7 },
      { id: "MIA-GRU", effect: 74, demand: 0.65 },
      { id: "BOS-DUB", effect: 34, demand: 0.85 },
      { id: "DFW-MAD", effect: 49, demand: 0.8 }
    ];
    var training = [];
    var test = [];
    var density = 1 - params.sparsity / 100;
    var outlierRate = params.outliers / 100;

    carriers.forEach(function (carrier) {
      cabins.forEach(function (cabin) {
        routes.forEach(function (route, routeIndex) {
          for (var flightIndex = 0; flightIndex < 4; flightIndex += 1) {
            var flight = "F" + (routeIndex + 1) + "-" + (flightIndex + 1);
            var flightEffect = normal(rand) * 11 + (flightIndex - 1.5) * 3;
            var trueValue = 92 + carrier.effect + cabin.effect + route.effect + flightEffect;
            var demand = carrier.demand * cabin.demand * route.demand * (0.75 + rand() * 0.65);
            var lambda = Math.max(0.4, (3 + 34 * density) * demand);
            var count = poisson(rand, lambda);
            var rowBase = {
              carrier: carrier.id,
              cabin: cabin.id,
              route: route.id,
              flight: flight,
              truth: trueValue
            };

            for (var i = 0; i < count; i += 1) {
              var observed = trueValue + normal(rand) * 9;
              if (rand() < outlierRate) observed += 130 + rand() * 360;
              training.push(Object.assign({}, rowBase, { y: Math.max(0, observed) }));
            }

            test.push(rowBase);
            test.push(Object.assign({}, rowBase, { truth: trueValue + normal(rand) * 2.5 }));
          }
        });
      });
    });

    return { training: training, test: test };
  }

  function buildCache(training) {
    var buckets = new Map();
    training.forEach(function (row) {
      for (var level = 0; level <= 4; level += 1) {
        var key = level + ":" + keyFor(row, level);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(row.y);
      }
    });

    var cache = new Map();
    buckets.forEach(function (values, key) {
      cache.set(key, {
        n: values.length,
        mean: mean(values),
        median: median(values)
      });
    });
    return cache;
  }

  function cell(cache, row, level) {
    return cache.get(level + ":" + keyFor(row, level));
  }

  function globalMean(cache) {
    var global = cache.get("0:global");
    return global ? global.mean : 0;
  }

  function globalMedian(cache) {
    var global = cache.get("0:global");
    return global ? global.median : 0;
  }

  function localMean(row, cache) {
    var exact = cell(cache, row, 4);
    return exact && exact.n ? exact.mean : globalMean(cache);
  }

  function medianCascade(row, cache, nMin) {
    for (var level = 4; level >= 0; level -= 1) {
      var found = cell(cache, row, level);
      if (found && found.n >= nMin) return { estimate: found.median, level: level };
    }
    return { estimate: globalMedian(cache), level: 0 };
  }

  function shrinkage(row, cache, skepticism) {
    function estimate(level) {
      if (level === 0) return globalMedian(cache);
      var parent = estimate(level - 1);
      var found = cell(cache, row, level);
      if (!found || !found.n) return parent;
      var weight = found.n / (found.n + skepticism);
      return weight * found.median + (1 - weight) * parent;
    }
    return estimate(4);
  }

  function evaluate(params) {
    var world = makeWorld(params);
    var cache = buildCache(world.training);
    var nMin = 25;
    var sums = {
      global: 0,
      local: 0,
      cascade: 0,
      shrink: 0
    };
    var cascadeLevels = [0, 0, 0, 0, 0];
    var sparseExactCells = 0;
    var exactKeys = new Set();

    world.test.forEach(function (row) {
      exactKeys.add(keyFor(row, 4));
      var truth = row.truth;
      var cascade = medianCascade(row, cache, nMin);
      sums.global += Math.abs(globalMean(cache) - truth);
      sums.local += Math.abs(localMean(row, cache) - truth);
      sums.cascade += Math.abs(cascade.estimate - truth);
      sums.shrink += Math.abs(shrinkage(row, cache, params.skepticism) - truth);
      cascadeLevels[cascade.level] += 1;
    });

    exactKeys.forEach(function (key) {
      var found = cache.get("4:" + key);
      if (!found || found.n < nMin) sparseExactCells += 1;
    });

    var count = world.test.length || 1;
    return {
      errors: {
        global: sums.global / count,
        local: sums.local / count,
        cascade: sums.cascade / count,
        shrink: sums.shrink / count
      },
      trainingCount: world.training.length,
      sparseExactCells: sparseExactCells,
      exactCells: exactKeys.size,
      cascadeLevels: cascadeLevels
    };
  }

  function formatMoney(value) {
    return "$" + value.toFixed(1);
  }

  function drawChart(canvas, errors) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 760;
    var width = Math.max(320, parentWidth);
    var height = 300;
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

    var bars = [
      { label: "Global", value: errors.global, color: COLORS.global },
      { label: "Local", value: errors.local, color: COLORS.local },
      { label: "Cascade", value: errors.cascade, color: COLORS.cascade },
      { label: "Shrink", value: errors.shrink, color: COLORS.shrink }
    ];
    var max = Math.max.apply(null, bars.map(function (bar) { return bar.value; })) * 1.18;
    var left = 54;
    var right = 18;
    var top = 28;
    var bottom = 54;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var barGap = 18;
    var barWidth = Math.max(34, (chartWidth - barGap * (bars.length - 1)) / bars.length);

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + chartHeight);
    ctx.lineTo(width - right, top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (var tick = 0; tick <= 3; tick += 1) {
      var value = (max / 3) * tick;
      var y = top + chartHeight - (value / max) * chartHeight;
      ctx.strokeStyle = tick === 0 ? COLORS.rule : "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(formatMoney(value), left - 8, y);
    }

    bars.forEach(function (bar, index) {
      var x = left + index * (barWidth + barGap);
      var h = (bar.value / max) * chartHeight;
      var y = top + chartHeight - h;
      ctx.fillStyle = bar.color;
      ctx.fillRect(x, y, barWidth, h);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(formatMoney(bar.value), x + barWidth / 2, y - 6);
      ctx.fillStyle = COLORS.muted;
      ctx.textBaseline = "top";
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(bar.label, x + barWidth / 2, top + chartHeight + 14);
    });
  }

  function metric(label, value) {
    return '<div class="fallback-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderLab(lab) {
    var params = {
      sparsity: Number(lab.querySelector('[data-param="sparsity"]').value),
      outliers: Number(lab.querySelector('[data-param="outliers"]').value),
      skepticism: Number(lab.querySelector('[data-param="skepticism"]').value)
    };
    lab.querySelector('[data-value="sparsity"]').textContent = params.sparsity + "%";
    lab.querySelector('[data-value="outliers"]').textContent = params.outliers + "%";
    lab.querySelector('[data-value="skepticism"]').textContent = String(params.skepticism);

    var result = evaluate(params);
    var metrics = lab.querySelector("[data-metrics]");
    var cascadeTotal = result.cascadeLevels.reduce(function (a, b) { return a + b; }, 0);
    var exactShare = result.cascadeLevels[4] / cascadeTotal;
    metrics.innerHTML = [
      metric("Shrinkage MAE", formatMoney(result.errors.shrink)),
      metric("Median cascade MAE", formatMoney(result.errors.cascade)),
      metric("Local mean MAE", formatMoney(result.errors.local)),
      metric("Sparse exact cells", result.sparseExactCells + "/" + result.exactCells),
      metric("Training rows", result.trainingCount.toLocaleString()),
      metric("Exact-level hits", Math.round(exactShare * 100) + "%")
    ].join("");

    drawChart(lab.querySelector("[data-canvas]"), result.errors);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-fallback-lab]"));
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
