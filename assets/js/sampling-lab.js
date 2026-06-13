(function () {
  var COLORS = {
    correct: "#0f766e",
    wrong: "#b45309",
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

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function gamma(rand, shape) {
    if (shape < 1) {
      return gamma(rand, shape + 1) * Math.pow(rand(), 1 / shape);
    }
    var d = shape - 1 / 3;
    var c = 1 / Math.sqrt(9 * d);
    while (true) {
      var x = normal(rand);
      var v = Math.pow(1 + c * x, 3);
      if (v <= 0) continue;
      var u = rand();
      if (u < 1 - 0.0331 * Math.pow(x, 4)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  function beta(rand, alpha, betaShape) {
    var x = gamma(rand, alpha);
    var y = gamma(rand, betaShape);
    return x / (x + y);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function makeAttempts(rand, params) {
    var p = clamp(params.pass1 / 100, 0.001, 0.999);
    var rho = clamp(params.correlation / 100, 0.001, 0.95);
    var concentration = Math.max(0.08, 1 / rho - 1);
    var alpha = Math.max(0.05, p * concentration);
    var betaShape = Math.max(0.05, (1 - p) * concentration);
    var theta = beta(rand, alpha, betaShape);
    var trapProbability = params.traps / 100;
    var attempts = [];

    for (var i = 0; i < params.samples; i += 1) {
      var correct = rand() < theta;
      var label;
      if (correct) {
        label = "gold";
      } else if (rand() < trapProbability) {
        label = "trap";
      } else {
        label = "wrong-" + Math.floor(rand() * 24);
      }
      attempts.push({
        correct: correct,
        label: label,
        score: verifierScore(rand, correct, params.verifier)
      });
    }

    return attempts;
  }

  function verifierScore(rand, correct, separation) {
    var sep = separation / 100;
    var mean = correct ? 0.42 + 1.15 * sep : 0.58 - 0.28 * sep;
    var scale = 0.58 - 0.32 * sep;
    return mean + normal(rand) * Math.max(0.12, scale);
  }

  function labelCounts(attempts) {
    var counts = new Map();
    attempts.forEach(function (attempt) {
      var item = counts.get(attempt.label) || { label: attempt.label, count: 0, correct: attempt.correct };
      item.count += 1;
      item.correct = item.correct || attempt.correct;
      counts.set(attempt.label, item);
    });
    return Array.from(counts.values());
  }

  function singlePolicy(attempts) {
    return attempts[0].correct
      ? { correct: 1, wrong: 0, abstain: 0 }
      : { correct: 0, wrong: 1, abstain: 0 };
  }

  function majorityPolicy(attempts) {
    var counts = labelCounts(attempts).sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.label === "gold") return -1;
      if (b.label === "gold") return 1;
      return a.label < b.label ? -1 : 1;
    });
    return counts[0].correct
      ? { correct: 1, wrong: 0, abstain: 0 }
      : { correct: 0, wrong: 1, abstain: 0 };
  }

  function verifierPolicy(attempts, params) {
    var best = attempts.slice().sort(function (a, b) { return b.score - a.score; })[0];
    var threshold = 1.38 - 0.30 * (params.verifier / 100);
    if (best.score < threshold) return { correct: 0, wrong: 0, abstain: 1 };
    return best.correct
      ? { correct: 1, wrong: 0, abstain: 0 }
      : { correct: 0, wrong: 1, abstain: 0 };
  }

  function oraclePolicy(attempts) {
    return attempts.some(function (attempt) { return attempt.correct; })
      ? { correct: 1, wrong: 0, abstain: 0 }
      : { correct: 0, wrong: 0, abstain: 1 };
  }

  function add(target, result) {
    target.correct += result.correct;
    target.wrong += result.wrong;
    target.abstain += result.abstain;
  }

  function summarize(row, n) {
    return {
      label: row.label,
      key: row.key,
      correct: row.correct / n,
      wrong: row.wrong / n,
      abstain: row.abstain / n
    };
  }

  function independentOracle(pass1, samples) {
    var p = pass1 / 100;
    return 1 - Math.pow(1 - p, samples);
  }

  function effectiveSamples(samples, correlation) {
    var rho = correlation / 100;
    return samples / (1 + (samples - 1) * rho);
  }

  function evaluate(params) {
    var seed = 20260613
      + params.samples * 7
      + params.pass1 * 13
      + params.correlation * 17
      + params.traps * 19
      + params.verifier * 23;
    var rand = rng(seed);
    var rows = [
      { key: "single", label: "One sample", correct: 0, wrong: 0, abstain: 0 },
      { key: "majority", label: "Majority vote", correct: 0, wrong: 0, abstain: 0 },
      { key: "verifier", label: "Verifier gate", correct: 0, wrong: 0, abstain: 0 },
      { key: "oracle", label: "Oracle checker", correct: 0, wrong: 0, abstain: 0 }
    ];
    var problemCount = 900;

    for (var i = 0; i < problemCount; i += 1) {
      var attempts = makeAttempts(rand, params);
      add(rows[0], singlePolicy(attempts));
      add(rows[1], majorityPolicy(attempts));
      add(rows[2], verifierPolicy(attempts, params));
      add(rows[3], oraclePolicy(attempts));
    }

    var summaries = rows.map(function (row) { return summarize(row, problemCount); });
    var oracle = summaries.find(function (row) { return row.key === "oracle"; });
    var verifier = summaries.find(function (row) { return row.key === "verifier"; });
    var majority = summaries.find(function (row) { return row.key === "majority"; });

    return {
      summaries: summaries,
      independentOracle: independentOracle(params.pass1, params.samples),
      effectiveSamples: effectiveSamples(params.samples, params.correlation),
      oracleGap: independentOracle(params.pass1, params.samples) - oracle.correct,
      verifierYield: oracle.correct ? verifier.correct / oracle.correct : 0,
      majorityRegret: oracle.correct - majority.correct
    };
  }

  function formatPercent(value) {
    return (value * 100).toFixed(1) + "%";
  }

  function metric(label, value) {
    return '<div class="sampling-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
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
    var bottom = width < 520 ? 86 : 66;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var groupWidth = chartWidth / summaries.length;
    var barWidth = Math.max(32, Math.min(64, groupWidth * 0.44));

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
      var x = left + groupWidth * index + groupWidth / 2 - barWidth / 2;
      var currentY = top + chartHeight;
      [
        { value: row.abstain, color: COLORS.abstain },
        { value: row.wrong, color: COLORS.wrong },
        { value: row.correct, color: COLORS.correct }
      ].forEach(function (segment) {
        var h = segment.value * chartHeight;
        currentY -= h;
        ctx.fillStyle = segment.color;
        ctx.fillRect(x, currentY, barWidth, h);
      });

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, top + chartHeight - chartHeight, barWidth, chartHeight);

      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatPercent(row.correct), x + barWidth / 2, top + chartHeight - row.correct * chartHeight - 6);

      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textBaseline = "top";
      if (width < 520 && row.label.indexOf(" ") >= 0) {
        row.label.split(" ").forEach(function (line, lineIndex) {
          ctx.fillText(line, x + barWidth / 2, top + chartHeight + 16 + lineIndex * 14);
        });
      } else {
        ctx.fillText(row.label, x + barWidth / 2, top + chartHeight + 18);
      }
    });
  }

  function renderLab(lab) {
    var params = {
      samples: Number(lab.querySelector('[data-param="samples"]').value),
      pass1: Number(lab.querySelector('[data-param="pass1"]').value),
      correlation: Number(lab.querySelector('[data-param="correlation"]').value),
      traps: Number(lab.querySelector('[data-param="traps"]').value),
      verifier: Number(lab.querySelector('[data-param="verifier"]').value)
    };

    lab.querySelector('[data-value="samples"]').textContent = params.samples.toLocaleString();
    lab.querySelector('[data-value="pass1"]').textContent = params.pass1 + "%";
    lab.querySelector('[data-value="correlation"]').textContent = params.correlation + "%";
    lab.querySelector('[data-value="traps"]').textContent = params.traps + "%";
    lab.querySelector('[data-value="verifier"]').textContent = params.verifier + "%";

    var result = evaluate(params);
    var oracle = result.summaries.find(function (row) { return row.key === "oracle"; });
    var majority = result.summaries.find(function (row) { return row.key === "majority"; });
    var verifier = result.summaries.find(function (row) { return row.key === "verifier"; });

    lab.querySelector("[data-metrics]").innerHTML = [
      metric("Independent oracle", formatPercent(result.independentOracle)),
      metric("Correlated oracle", formatPercent(oracle.correct)),
      metric("Effective samples", result.effectiveSamples.toFixed(1)),
      metric("Majority correct", formatPercent(majority.correct)),
      metric("Verifier correct", formatPercent(verifier.correct)),
      metric("Verifier wrong accepts", formatPercent(verifier.wrong))
    ].join("");

    drawChart(lab.querySelector("[data-canvas]"), result.summaries);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-sampling-lab]"));
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
