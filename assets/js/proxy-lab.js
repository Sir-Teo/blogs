(function () {
  var COLORS = {
    trueValue: "#0f766e",
    proxy: "#b45309",
    zero: "#2563eb",
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

  function makeCandidate(rand, params) {
    var reliability = params.reliability / 100;
    var gaming = params.gaming / 100;
    var trueSignal = normal(rand);
    var measurementNoise = normal(rand);
    var gamingSurface = -Math.log(Math.max(1e-6, 1 - rand()));
    var proxy = reliability * trueSignal
      + Math.sqrt(Math.max(0, 1 - reliability * reliability)) * measurementNoise
      + 1.55 * gaming * gamingSurface;
    var trueValue = trueSignal - 0.70 * gaming * gamingSurface + normal(rand) * 0.08;
    var audited = proxy
      - (params.audit / 100) * 1.90 * gaming * gamingSurface
      + (params.audit / 100) * 0.25 * trueSignal;

    return {
      trueValue: trueValue,
      proxy: proxy,
      audited: audited,
      gaming: gamingSurface
    };
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function selectTop(candidates, count, key) {
    return candidates.slice().sort(function (a, b) {
      return b[key] - a[key];
    }).slice(0, count);
  }

  function summarizeSelection(label, key, selected) {
    return {
      label: label,
      key: key,
      trueValue: mean(selected.map(function (row) { return row.trueValue; })),
      proxy: mean(selected.map(function (row) { return row.proxy; })),
      gaming: mean(selected.map(function (row) { return row.gaming; }))
    };
  }

  function addTotals(totals, summary) {
    totals.trueValue += summary.trueValue;
    totals.proxy += summary.proxy;
    totals.gaming += summary.gaming;
  }

  function evaluate(params) {
    var seed = 20260613
      + params.pool * 7
      + params.finalists * 11
      + params.reliability * 13
      + params.gaming * 17
      + params.audit * 19;
    var rand = rng(seed);
    var rounds = 500;
    var selectedCount = Math.max(1, Math.min(params.pool, params.finalists));
    var policies = [
      { key: "random", label: "Random" },
      { key: "proxy", label: "Proxy target" },
      { key: "audited", label: "Audited" },
      { key: "oracle", label: "Oracle" }
    ];
    var totals = {};
    policies.forEach(function (policy) {
      totals[policy.key] = { trueValue: 0, proxy: 0, gaming: 0 };
    });

    for (var round = 0; round < rounds; round += 1) {
      var candidates = [];
      for (var i = 0; i < params.pool; i += 1) {
        candidates.push(makeCandidate(rand, params));
      }

      addTotals(totals.random, summarizeSelection("Random", "random", candidates.slice(0, selectedCount)));
      addTotals(totals.proxy, summarizeSelection("Proxy target", "proxy", selectTop(candidates, selectedCount, "proxy")));
      addTotals(totals.audited, summarizeSelection("Audited", "audited", selectTop(candidates, selectedCount, "audited")));
      addTotals(totals.oracle, summarizeSelection("Oracle", "oracle", selectTop(candidates, selectedCount, "trueValue")));
    }

    var summaries = policies.map(function (policy) {
      return {
        key: policy.key,
        label: policy.label,
        trueValue: totals[policy.key].trueValue / rounds,
        proxy: totals[policy.key].proxy / rounds,
        gaming: totals[policy.key].gaming / rounds
      };
    });
    var proxy = summaries.find(function (row) { return row.key === "proxy"; });
    var audited = summaries.find(function (row) { return row.key === "audited"; });
    var oracle = summaries.find(function (row) { return row.key === "oracle"; });

    return {
      selectedCount: selectedCount,
      summaries: summaries,
      goodhartGap: proxy.proxy - proxy.trueValue,
      auditLift: audited.trueValue - proxy.trueValue,
      oracleRegret: oracle.trueValue - proxy.trueValue,
      proxyGaming: proxy.gaming
    };
  }

  function formatScore(value) {
    var sign = value > 0 ? "+" : "";
    return sign + value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="proxy-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
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

    var left = width < 520 ? 42 : 58;
    var right = 18;
    var top = 28;
    var bottom = width < 520 ? 84 : 66;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var values = [];
    summaries.forEach(function (row) {
      values.push(row.trueValue);
      values.push(row.proxy);
    });
    values.push(0);
    var minValue = Math.min.apply(null, values) - 0.25;
    var maxValue = Math.max.apply(null, values) + 0.35;
    if (maxValue - minValue < 1) {
      maxValue += 0.5;
      minValue -= 0.5;
    }

    function yFor(value) {
      return top + (maxValue - value) / (maxValue - minValue) * chartHeight;
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
    for (var tick = 0; tick <= 4; tick += 1) {
      var tickValue = minValue + (maxValue - minValue) * tick / 4;
      var y = yFor(tickValue);
      ctx.strokeStyle = Math.abs(tickValue) < 0.08 ? COLORS.zero : "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(formatScore(tickValue), left - 8, y);
    }

    var zeroY = yFor(0);
    ctx.strokeStyle = COLORS.zero;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, zeroY);
    ctx.lineTo(width - right, zeroY);
    ctx.stroke();

    var groupWidth = chartWidth / summaries.length;
    var barWidth = Math.max(12, Math.min(26, groupWidth / 5));
    summaries.forEach(function (row, index) {
      var center = left + groupWidth * index + groupWidth / 2;
      [
        { value: row.trueValue, color: COLORS.trueValue, offset: -barWidth * 0.65 },
        { value: row.proxy, color: COLORS.proxy, offset: barWidth * 0.65 }
      ].forEach(function (bar) {
        var x = center + bar.offset - barWidth / 2;
        var y = yFor(Math.max(0, bar.value));
        var h = Math.abs(yFor(bar.value) - zeroY);
        if (bar.value < 0) y = zeroY;
        ctx.fillStyle = bar.color;
        ctx.fillRect(x, y, barWidth, h);
      });

      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatScore(row.trueValue), center - barWidth * 0.65, yFor(row.trueValue) - 6);

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
      pool: Number(lab.querySelector('[data-param="pool"]').value),
      finalists: Number(lab.querySelector('[data-param="finalists"]').value),
      reliability: Number(lab.querySelector('[data-param="reliability"]').value),
      gaming: Number(lab.querySelector('[data-param="gaming"]').value),
      audit: Number(lab.querySelector('[data-param="audit"]').value)
    };

    lab.querySelector('[data-value="pool"]').textContent = params.pool.toLocaleString();
    lab.querySelector('[data-value="finalists"]').textContent = params.finalists.toLocaleString();
    lab.querySelector('[data-value="reliability"]').textContent = params.reliability + "%";
    lab.querySelector('[data-value="gaming"]').textContent = params.gaming + "%";
    lab.querySelector('[data-value="audit"]').textContent = params.audit + "%";

    var result = evaluate(params);
    var proxy = result.summaries.find(function (row) { return row.key === "proxy"; });
    var audited = result.summaries.find(function (row) { return row.key === "audited"; });

    lab.querySelector("[data-metrics]").innerHTML = [
      metric("Selected finalists", result.selectedCount.toLocaleString()),
      metric("Proxy-selected true", formatScore(proxy.trueValue)),
      metric("Proxy-reported score", formatScore(proxy.proxy)),
      metric("Goodhart gap", formatScore(result.goodhartGap)),
      metric("Audit true lift", formatScore(result.auditLift)),
      metric("Audited true", formatScore(audited.trueValue))
    ].join("");

    drawChart(lab.querySelector("[data-canvas]"), result.summaries);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-proxy-lab]"));
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
