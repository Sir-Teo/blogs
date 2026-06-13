(function () {
  var COLORS = {
    usable: "#0f766e",
    falseSupport: "#b45309",
    abstain: "#64748b",
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = (sorted.length - 1) * q;
    var lo = Math.floor(index);
    var hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - index) + sorted[hi] * (index - lo);
  }

  function geometricRank(rand, top20Recall, corpusSize) {
    var target = clamp(top20Recall, 0.02, 0.995);
    var p = 1 - Math.pow(1 - target, 1 / 20);
    var rank = Math.ceil(Math.log(1 - rand()) / Math.log(1 - p));
    return clamp(rank, 1, corpusSize);
  }

  function positionUseProbability(position, contextSize, distractorPressure) {
    if (contextSize <= 1) return 0.96;
    var center = (contextSize + 1) / 2;
    var distance = Math.abs(position - center) / Math.max(1, center - 1);
    var middlePenalty = 0.18 + 0.28 * clamp((contextSize - 24) / 136, 0, 1);
    var placement = 1 - middlePenalty * (1 - Math.pow(distance, 0.55));
    var noise = 1 - 0.34 * distractorPressure * clamp((contextSize - 1) / contextSize, 0, 1);
    return clamp(placement * noise, 0.08, 0.98);
  }

  function falseSupportProbability(contextSize, hasGold, useFailed, distractorPressure, policy) {
    var crowding = clamp(contextSize / 120, 0.05, 1);
    var base = distractorPressure * (0.12 + 0.46 * crowding);
    if (hasGold && !useFailed) return base * 0.12;
    if (policy === "stuff") return base * 1.18;
    if (policy === "gated") return base * 0.24;
    if (policy === "rerank") return base * 0.58;
    return base * 0.78;
  }

  function makeQuery(rand, params) {
    var ambiguity = Math.pow(rand(), 0.72);
    var distractors = params.distractors / 100;
    var recall = params.recall / 100;
    var effectiveRecall = clamp(recall - 0.24 * distractors * ambiguity, 0.03, 0.985);
    var hybridRecall = clamp(effectiveRecall + 0.12 + 0.08 * (1 - ambiguity), 0.04, 0.995);

    return {
      ambiguity: ambiguity,
      rawRank: geometricRank(rand, effectiveRecall, params.corpus),
      hybridRank: geometricRank(rand, hybridRecall, params.corpus),
      sourcePosition: 1 + Math.floor(rand() * params.corpus)
    };
  }

  function evaluatePolicy(rand, query, params, policy) {
    var budget = Math.min(params.budget, params.corpus);
    var distractorPressure = params.distractors / 100;
    var contextSize = budget;
    var hasGold = false;
    var position = 0;
    var abstained = false;

    if (policy === "stuff") {
      hasGold = query.sourcePosition <= budget;
      position = query.sourcePosition;
    } else if (policy === "topk") {
      hasGold = query.rawRank <= budget;
      position = query.rawRank;
    } else if (policy === "rerank") {
      var candidateSize = Math.min(params.corpus, Math.max(budget * 4, 64));
      contextSize = Math.min(budget, 28);
      hasGold = query.rawRank <= candidateSize;
      if (hasGold) {
        var improved = 1 + Math.floor(Math.pow(rand(), 1.65) * contextSize);
        var conservative = Math.ceil(query.rawRank / Math.max(1, candidateSize / contextSize));
        position = clamp(Math.min(improved, conservative), 1, contextSize);
      }
    } else if (policy === "gated") {
      var hybridCandidateSize = Math.min(params.corpus, Math.max(budget * 5, 96));
      contextSize = Math.min(budget, 18);
      hasGold = query.hybridRank <= hybridCandidateSize;
      if (hasGold) {
        var hybridPosition = 1 + Math.floor(Math.pow(rand(), 1.95) * contextSize);
        position = clamp(hybridPosition, 1, contextSize);
      }
      var supportScore = hasGold
        ? clamp(0.62 + 0.35 * (1 - position / (contextSize + 1)) - 0.20 * query.ambiguity, 0, 1)
        : clamp(0.34 - 0.18 * query.ambiguity + 0.18 * distractorPressure * rand(), 0, 1);
      abstained = supportScore < 0.52;
    }

    if (abstained) {
      return {
        usable: 0,
        falseSupport: 0,
        abstain: 1,
        waste: 1,
        included: hasGold ? 1 : 0,
        contextSize: contextSize,
        rank: hasGold ? position : 0
      };
    }

    var usable = 0;
    var useFailed = true;
    if (hasGold) {
      var useProbability = positionUseProbability(position, contextSize, distractorPressure);
      usable = rand() < useProbability ? 1 : 0;
      useFailed = usable === 0;
    }

    var falseProb = falseSupportProbability(contextSize, hasGold, useFailed, distractorPressure, policy);
    var falseSupport = usable ? 0 : (rand() < falseProb ? 1 : 0);
    var waste = hasGold ? (contextSize - 1) / contextSize : 1;

    return {
      usable: usable,
      falseSupport: falseSupport,
      abstain: 0,
      waste: waste,
      included: hasGold ? 1 : 0,
      contextSize: contextSize,
      rank: hasGold ? position : 0
    };
  }

  function summarize(rows) {
    var n = rows.length || 1;
    var includedRanks = rows.filter(function (row) { return row.rank > 0; }).map(function (row) { return row.rank; });
    return {
      usable: rows.reduce(function (sum, row) { return sum + row.usable; }, 0) / n,
      falseSupport: rows.reduce(function (sum, row) { return sum + row.falseSupport; }, 0) / n,
      abstain: rows.reduce(function (sum, row) { return sum + row.abstain; }, 0) / n,
      waste: rows.reduce(function (sum, row) { return sum + row.waste; }, 0) / n,
      included: rows.reduce(function (sum, row) { return sum + row.included; }, 0) / n,
      medianRank: quantile(includedRanks, 0.5),
      contextSize: rows.reduce(function (sum, row) { return sum + row.contextSize; }, 0) / n
    };
  }

  function evaluate(params) {
    var seed = 20260612
      + params.corpus * 7
      + params.budget * 13
      + params.recall * 17
      + params.distractors * 19;
    var rand = rng(seed);
    var policies = [
      { key: "stuff", label: "Stuffing" },
      { key: "topk", label: "Top-k RAG" },
      { key: "rerank", label: "Reranked" },
      { key: "gated", label: "Gated hybrid" }
    ];
    var rows = {};
    policies.forEach(function (policy) {
      rows[policy.key] = [];
    });

    for (var i = 0; i < 600; i += 1) {
      var query = makeQuery(rand, params);
      policies.forEach(function (policy) {
        rows[policy.key].push(evaluatePolicy(rand, query, params, policy.key));
      });
    }

    return policies.map(function (policy) {
      return Object.assign({ key: policy.key, label: policy.label }, summarize(rows[policy.key]));
    });
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function formatDocs(value) {
    return Math.round(value).toLocaleString();
  }

  function metric(label, value) {
    return '<div class="rag-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, summaries) {
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

    var left = width < 520 ? 44 : 58;
    var right = 18;
    var top = 30;
    var bottom = width < 520 ? 82 : 66;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var groupWidth = chartWidth / summaries.length;
    var barWidth = Math.max(9, Math.min(22, groupWidth / 5.2));

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
    for (var tick = 0; tick <= 4; tick += 1) {
      var value = tick / 4;
      var y = top + chartHeight - value * chartHeight;
      ctx.strokeStyle = tick === 0 ? COLORS.rule : "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = value === 0 ? COLORS.text : COLORS.muted;
      ctx.fillText(String(Math.round(value * 100)) + "%", left - 8, y);
    }

    summaries.forEach(function (row, index) {
      var center = left + groupWidth * index + groupWidth / 2;
      var bars = [
        { key: "usable", value: row.usable, color: COLORS.usable },
        { key: "falseSupport", value: row.falseSupport, color: COLORS.falseSupport },
        { key: "abstain", value: row.abstain, color: COLORS.abstain }
      ];
      bars.forEach(function (bar, barIndex) {
        var x = center + (barIndex - 1) * (barWidth + 4) - barWidth / 2;
        var h = bar.value * chartHeight;
        var y = top + chartHeight - h;
        ctx.fillStyle = bar.color;
        ctx.fillRect(x, y, barWidth, h);
      });

      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatPercent(row.usable), center, top + chartHeight - row.usable * chartHeight - 6);

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
      corpus: Number(lab.querySelector('[data-param="corpus"]').value),
      budget: Number(lab.querySelector('[data-param="budget"]').value),
      recall: Number(lab.querySelector('[data-param="recall"]').value),
      distractors: Number(lab.querySelector('[data-param="distractors"]').value)
    };

    lab.querySelector('[data-value="corpus"]').textContent = params.corpus.toLocaleString() + " docs";
    lab.querySelector('[data-value="budget"]').textContent = params.budget + " docs";
    lab.querySelector('[data-value="recall"]').textContent = params.recall + "%";
    lab.querySelector('[data-value="distractors"]').textContent = params.distractors + "%";

    var summaries = evaluate(params);
    var reranked = summaries.find(function (row) { return row.key === "rerank"; });
    var gated = summaries.find(function (row) { return row.key === "gated"; });
    var stuffing = summaries.find(function (row) { return row.key === "stuff"; });

    lab.querySelector("[data-metrics]").innerHTML = [
      metric("Reranked usable", formatPercent(reranked.usable)),
      metric("Gated false support", formatPercent(gated.falseSupport)),
      metric("Stuffing evidence hit", formatPercent(stuffing.included)),
      metric("Gated abstain", formatPercent(gated.abstain)),
      metric("Reranked waste", formatPercent(reranked.waste)),
      metric("Reranked median rank", formatDocs(reranked.medianRank || 0))
    ].join("");

    drawChart(lab.querySelector("[data-canvas]"), summaries);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-rag-lab]"));
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
