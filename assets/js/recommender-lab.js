(function () {
  var COLORS = {
    click: "#0f766e",
    value: "#b45309",
    diversity: "#2563eb",
    drift: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
  };

  var CATEGORIES = ["News", "Science", "Finance", "Art", "Fitness", "Games"];
  var POLICIES = [
    { key: "random", label: "Random", short: "R" },
    { key: "popularity", label: "Popularity", short: "P" },
    { key: "click", label: "Click-only", short: "C" },
    { key: "audit", label: "Causal audit", short: "A" },
    { key: "diversity", label: "Diversity", short: "D" }
  ];

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

  function normalize(values) {
    var total = values.reduce(function (sum, value) { return sum + Math.max(0, value); }, 0);
    if (total <= 0) return values.map(function () { return 1 / values.length; });
    return values.map(function (value) { return Math.max(0, value) / total; });
  }

  function entropy(counts) {
    var total = counts.reduce(function (sum, value) { return sum + value; }, 0);
    if (!total) return 0;
    var h = counts.reduce(function (sum, count) {
      if (!count) return sum;
      var p = count / total;
      return sum - p * Math.log(p);
    }, 0);
    return h / Math.log(counts.length);
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatScore(value) {
    return value.toFixed(3);
  }

  function initialTaste() {
    return normalize([0.30, 0.23, 0.17, 0.13, 0.10, 0.07]);
  }

  function makeCatalog(params) {
    var rand = rng(20260613 + params.catalogSkew * 19 + params.sessions * 3);
    var skew = params.catalogSkew / 100;
    var weights = CATEGORIES.map(function (_, index) {
      return Math.exp(-skew * index * 0.62);
    });
    weights = normalize(weights);
    var cumulative = [];
    weights.reduce(function (sum, weight, index) {
      cumulative[index] = sum + weight;
      return cumulative[index];
    }, 0);

    var catalog = [];
    for (var i = 0; i < 180; i += 1) {
      var draw = rand();
      var category = 0;
      while (category < cumulative.length - 1 && draw > cumulative[category]) category += 1;
      var quality = clamp(0.50 + 0.18 * normal(rand) + 0.10 * rand(), 0.05, 0.95);
      var popularity = weights[category] * (0.72 + 0.56 * rand()) + 0.025 * rand();
      catalog.push({
        id: i,
        category: category,
        quality: quality,
        popularity: popularity
      });
    }
    return catalog;
  }

  function latentValue(item, anchorTaste) {
    return sigmoid(2.35 * (1.8 * anchorTaste[item.category] + 0.55 * item.quality - 0.42));
  }

  function makeState(catalog) {
    return {
      taste: initialTaste(),
      familiarity: CATEGORIES.map(function () { return 0; }),
      itemClicks: catalog.map(function () { return 0; }),
      itemExposures: catalog.map(function () { return 0; }),
      catClicks: CATEGORIES.map(function () { return 0; }),
      catExposures: CATEGORIES.map(function () { return 0; }),
      ipsClicks: CATEGORIES.map(function () { return 0; }),
      ipsExposures: CATEGORIES.map(function () { return 0; }),
      exposureCounts: CATEGORIES.map(function () { return 0; }),
      clicks: 0,
      exposures: 0,
      latentSum: 0,
      attentionSum: 0
    };
  }

  function attentionAt(position, positionBias) {
    return Math.exp(-(positionBias / 100) * position * 0.24);
  }

  function policyScore(policyKey, item, state, selectedCounts, params, rand) {
    var category = item.category;
    var itemRate = (state.itemClicks[item.id] + 0.8) / (state.itemExposures[item.id] + 4);
    var catRate = (state.catClicks[category] + 1.2) / (state.catExposures[category] + 6);
    var ipsRate = (state.ipsClicks[category] + 1.2) / (state.ipsExposures[category] + 6);
    var uncertainty = 1 / Math.sqrt(state.catExposures[category] + 2);
    var underExposure = 1 / Math.sqrt(state.exposureCounts[category] + 8);

    if (policyKey === "random") return rand();
    if (policyKey === "popularity") return 0.78 * item.popularity + 0.22 * item.quality + 0.03 * rand();
    if (policyKey === "click") return 0.62 * itemRate + 0.44 * catRate + 0.16 * item.popularity + 0.02 * rand();
    if (policyKey === "audit") return 0.72 * ipsRate + 0.22 * item.quality + 0.12 * uncertainty + 0.02 * rand();
    if (policyKey === "diversity") {
      var penalty = selectedCounts[category] * (0.20 + params.feedback / 550);
      return 0.66 * ipsRate + 0.22 * item.quality + 0.22 * underExposure - penalty + 0.02 * rand();
    }
    return 0;
  }

  function chooseSlate(policyKey, catalog, state, params, rand) {
    var slate = [];
    var selected = {};
    var selectedCounts = CATEGORIES.map(function () { return 0; });
    var slateSize = 8;
    var exploration = (policyKey === "audit" || policyKey === "diversity") ? params.exploration / 100 : 0;

    for (var slot = 0; slot < slateSize; slot += 1) {
      var pick = null;

      if (exploration > 0 && rand() < exploration) {
        for (var tries = 0; tries < 40; tries += 1) {
          var candidate = catalog[Math.floor(rand() * catalog.length)];
          if (!selected[candidate.id]) {
            pick = candidate;
            break;
          }
        }
      }

      if (!pick) {
        var bestScore = -Infinity;
        catalog.forEach(function (item) {
          if (selected[item.id]) return;
          var score = policyScore(policyKey, item, state, selectedCounts, params, rand);
          if (score > bestScore) {
            bestScore = score;
            pick = item;
          }
        });
      }

      if (!pick) break;
      selected[pick.id] = true;
      selectedCounts[pick.category] += 1;
      slate.push(pick);
    }

    return slate;
  }

  function updateTaste(state, exposureDist, clickDist, params) {
    var feedback = params.feedback / 100;
    var driftRate = feedback * 0.035;
    var target = CATEGORIES.map(function (_, index) {
      return 0.72 * exposureDist[index] + 0.28 * clickDist[index];
    });

    state.taste = normalize(state.taste.map(function (taste, index) {
      return (1 - driftRate) * taste + driftRate * target[index];
    }));

    state.familiarity = state.familiarity.map(function (value, index) {
      return clamp(0.985 * value + feedback * 0.08 * exposureDist[index], 0, 1.4);
    });
  }

  function runPolicy(policy, catalog, params, seedOffset) {
    var rand = rng(20260613 + seedOffset * 101 + params.feedback * 7 + params.positionBias * 11 + params.exploration * 13);
    var anchorTaste = initialTaste();
    var state = makeState(catalog);

    for (var session = 0; session < params.sessions; session += 1) {
      var slate = chooseSlate(policy.key, catalog, state, params, rand);
      var exposureByCategory = CATEGORIES.map(function () { return 0; });
      var clickByCategory = CATEGORIES.map(function () { return 0; });
      var clicksThisSession = 0;

      slate.forEach(function (item, position) {
        var category = item.category;
        var attention = attentionAt(position, params.positionBias);
        var familiarityLift = (params.familiarity / 100) * state.familiarity[category];
        var clickSignal = state.taste[category] + 0.36 * item.quality + 0.20 * familiarityLift - 0.22;
        var clickProbability = clamp(attention * (0.035 + 0.78 * sigmoid(2.6 * clickSignal)), 0.002, 0.96);
        var clicked = rand() < clickProbability;

        state.exposures += 1;
        state.itemExposures[item.id] += 1;
        state.catExposures[category] += 1;
        state.exposureCounts[category] += 1;
        state.ipsExposures[category] += 1;
        exposureByCategory[category] += 1;
        state.latentSum += attention * latentValue(item, anchorTaste);
        state.attentionSum += attention;

        if (clicked) {
          state.clicks += 1;
          clicksThisSession += 1;
          state.itemClicks[item.id] += 1;
          state.catClicks[category] += 1;
          clickByCategory[category] += 1;
        }
        state.ipsClicks[category] += clicked ? 1 / Math.max(0.08, attention) : 0;
      });

      exposureByCategory = exposureByCategory.map(function (count) { return count / Math.max(1, slate.length); });
      if (clicksThisSession > 0) {
        clickByCategory = clickByCategory.map(function (count) { return count / clicksThisSession; });
      } else {
        clickByCategory = exposureByCategory.slice();
      }
      updateTaste(state, exposureByCategory, clickByCategory, params);
    }

    var drift = 0.5 * state.taste.reduce(function (sum, taste, index) {
      return sum + Math.abs(taste - anchorTaste[index]);
    }, 0);
    var headShare = (state.exposureCounts[0] + state.exposureCounts[1]) / Math.max(1, state.exposures);

    return {
      key: policy.key,
      label: policy.label,
      short: policy.short,
      clickRate: state.clicks / Math.max(1, state.exposures),
      latentValue: state.latentSum / Math.max(1, state.attentionSum),
      diversity: entropy(state.exposureCounts),
      drift: drift,
      headShare: headShare
    };
  }

  function evaluate(params) {
    var catalog = makeCatalog(params);
    var results = POLICIES.map(function (policy, index) {
      return runPolicy(policy, catalog, params, index + 1);
    });
    var byKey = {};
    results.forEach(function (row) { byKey[row.key] = row; });
    var bestValue = results.slice().sort(function (a, b) { return b.latentValue - a.latentValue; })[0];

    return {
      results: results,
      byKey: byKey,
      bestValue: bestValue
    };
  }

  function metric(label, value) {
    return '<div class="recommender-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var rows = result.results;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 430;
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

    var left = width < 560 ? 46 : 60;
    var right = width < 560 ? 24 : 36;
    var top = 34;
    var barHeight = 205;
    var lowerTop = 296;
    var lowerHeight = 92;
    var plotWidth = width - left - right;
    var groupWidth = plotWidth / rows.length;
    var barWidth = Math.max(10, Math.min(22, groupWidth / 5.2));

    function yBar(value) {
      return top + barHeight - value * (barHeight - 18);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + barHeight);
    ctx.lineTo(width - right, top + barHeight);
    ctx.stroke();

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Observed click rate vs latent value", left, top - 9);

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = yBar(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(Math.round(tick * 100)) + "%", left - 8, y);
    });

    rows.forEach(function (row, index) {
      var center = left + index * groupWidth + groupWidth / 2;
      [
        { value: row.clickRate, color: COLORS.click, offset: -barWidth * 0.65 },
        { value: row.latentValue, color: COLORS.value, offset: barWidth * 0.65 }
      ].forEach(function (bar) {
        var y = yBar(clamp(bar.value, 0, 1));
        ctx.fillStyle = bar.color;
        ctx.fillRect(center + bar.offset - barWidth / 2, y, barWidth, top + barHeight - y);
      });

      ctx.save();
      ctx.translate(center, top + barHeight + 18);
      if (width < 600) {
        ctx.rotate(-Math.PI / 5);
        ctx.textAlign = "right";
      } else {
        ctx.textAlign = "center";
      }
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(row.label, 0, 0);
      ctx.restore();
    });

    function xDiversity(value) {
      return left + value * plotWidth;
    }

    function yDrift(value) {
      return lowerTop + lowerHeight - value * lowerHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, lowerTop);
    ctx.lineTo(left, lowerTop + lowerHeight);
    ctx.lineTo(width - right, lowerTop + lowerHeight);
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Diversity vs preference drift", left, lowerTop - 10);

    [0, 0.5, 1].forEach(function (tick) {
      var x = xDiversity(tick);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(x, lowerTop);
      ctx.lineTo(x, lowerTop + lowerHeight);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(Math.round(tick * 100)) + "%", x, lowerTop + lowerHeight + 8);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(String(Math.round(tick * 100)) + "%", left - 8, yDrift(tick));
    });

    rows.forEach(function (row) {
      var x = xDiversity(row.diversity);
      var y = yDrift(clamp(row.drift, 0, 1));
      ctx.fillStyle = row.key === "diversity" ? COLORS.diversity : row.key === "click" ? COLORS.drift : COLORS.text;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.short, x, y + 0.5);
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var result = evaluate(params);
    var values = {
      feedback: params.feedback + "%",
      positionBias: params.positionBias + "%",
      exploration: params.exploration + "%",
      catalogSkew: params.catalogSkew + "%",
      familiarity: params.familiarity + "%",
      sessions: String(params.sessions)
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    var byKey = result.byKey;
    if (metrics) {
      metrics.innerHTML = [
        metric("Click-only clicks", formatPercent(byKey.click.clickRate)),
        metric("Click-only value", formatScore(byKey.click.latentValue)),
        metric("Audit value", formatScore(byKey.audit.latentValue)),
        metric("Diversity value", formatScore(byKey.diversity.latentValue)),
        metric("Click drift", formatPercent(byKey.click.drift)),
        metric("Best latent policy", result.bestValue.label)
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-recommender-lab]").forEach(init);
  });
}());
