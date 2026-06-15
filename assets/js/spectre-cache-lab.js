(function (global) {
  "use strict";

  var LINES = 16;
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    grid: "#eef2f5",
    hit: "#be123c",
    miss: "#64748b",
    secret: "#7c3aed",
    train: "#2563eb",
    spec: "#b45309",
    safe: "#0f766e",
    all: "#14b8a6"
  };

  var POLICIES = [
    { key: "naive", label: "naive bounds check", short: "naive", overhead: 1.00, color: "#be123c" },
    { key: "fence", label: "fence before load", short: "fence", overhead: 1.42, color: "#2563eb" },
    { key: "mask", label: "mask unsafe index", short: "mask", overhead: 1.12, color: "#0f766e" },
    { key: "constant", label: "touch every line", short: "all-lines", overhead: 1.85, color: "#7c3aed" },
    { key: "invisible", label: "invisible speculation", short: "invisible", overhead: 1.18, color: "#14b8a6" }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    var u1 = Math.max(1e-12, random());
    var u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="spectre-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function readParams(lab) {
    function read(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = input.tagName === "SELECT" ? input.value : Number(input.value);
      return value == null || value === "" ? fallback : value;
    }
    return {
      seed: Math.round(Number(read("seed", 23))),
      secret: clamp(Math.round(Number(read("secret", 11))), 0, LINES - 1),
      rounds: clamp(Math.round(Number(read("rounds", 36))), 4, 160),
      training: clamp(Math.round(Number(read("training", 6))), 0, 16),
      window: clamp(Number(read("window", 62)), 0, 100) / 100,
      noise: clamp(Number(read("noise", 25)), 0, 100) / 100,
      flush: clamp(Number(read("flush", 88)), 0, 100) / 100,
      policy: String(read("policy", "naive"))
    };
  }

  function policyByKey(key) {
    return POLICIES.filter(function (policy) { return policy.key === key; })[0] || POLICIES[0];
  }

  function touchSet(params, policy, speculates) {
    var touched = new Array(LINES).fill(false);
    if (!speculates) return touched;
    if (policy.key === "fence" || policy.key === "invisible") return touched;
    if (policy.key === "constant") {
      for (var i = 0; i < LINES; i += 1) touched[i] = true;
    } else if (policy.key === "mask") {
      touched[0] = true;
    } else {
      touched[params.secret] = true;
    }
    return touched;
  }

  function speculationChance(params, policy) {
    if (policy.key === "fence") return 0;
    var trained = 1 - Math.exp(-params.training / 2.6);
    var window = sigmoid((params.window - 0.38) * 9.5);
    var chance = trained * window;
    if (policy.key === "mask") chance *= 0.95;
    if (policy.key === "constant") chance *= 0.90;
    if (policy.key === "invisible") chance *= 0.95;
    return clamp(chance, 0, 0.995);
  }

  function measureLine(random, touched, params) {
    var hitMean = 42;
    var missMean = 138;
    var sigma = 5 + 42 * params.noise;
    var falseHit = !touched && random() < (1 - params.flush) * 0.16;
    var falseMiss = touched && random() < (1 - params.flush) * 0.10;
    var isHit = (touched && !falseMiss) || falseHit;
    var mean = isHit ? hitMean : missMean;
    return clamp(mean + sigma * normal(random), 12, 260);
  }

  function runRound(params, policy, round) {
    var random = rng(params.seed * 1000003 + round * 7919 + policy.key.length * 173);
    var specChance = speculationChance(params, policy);
    var speculates = random() < specChance;
    var touched = touchSet(params, policy, speculates);
    var timings = [];
    var best = { line: 0, time: Infinity };
    for (var i = 0; i < LINES; i += 1) {
      var t = measureLine(random, touched[i], params);
      timings.push(t);
      if (t < best.time) best = { line: i, time: t };
    }
    var threshold = 82 + 28 * params.noise;
    var vote = best.time < threshold ? best.line : -1;
    return {
      best: best,
      speculates: speculates,
      threshold: threshold,
      timings: timings,
      touched: touched,
      vote: vote
    };
  }

  function simulatePolicy(params, policy) {
    var votes = new Array(LINES).fill(0);
    var hitSums = new Array(LINES).fill(0);
    var rounds = [];
    var speculations = 0;
    for (var r = 0; r < params.rounds; r += 1) {
      var row = runRound(params, policy, r);
      rounds.push(row);
      if (row.speculates) speculations += 1;
      if (row.vote >= 0) votes[row.vote] += 1;
      for (var i = 0; i < LINES; i += 1) hitSums[i] += row.timings[i];
    }
    var ranked = votes.map(function (count, line) {
      return { line: line, count: count };
    }).sort(function (a, b) {
      return b.count - a.count || a.line - b.line;
    });
    var top = ranked[0];
    var second = ranked[1] || { count: 0 };
    return {
      averageTimings: hitSums.map(function (sum) { return sum / params.rounds; }),
      confidence: top.count / Math.max(1, params.rounds),
      margin: (top.count - second.count) / Math.max(1, params.rounds),
      policy: policy,
      rounds: rounds,
      specRate: speculations / params.rounds,
      success: top.line === params.secret && top.count > second.count,
      top: top,
      votes: votes
    };
  }

  function frontier(params) {
    return POLICIES.map(function (policy) {
      var p = Object.assign({}, params, { policy: policy.key, rounds: Math.max(60, params.rounds) });
      var result = simulatePolicy(p, policy);
      return {
        confidence: result.confidence,
        leak: policy.key === "naive" ? (result.success ? result.confidence : 0) : (result.top.line === params.secret ? result.confidence : 0),
        overhead: policy.overhead,
        policy: policy,
        success: result.success
      };
    });
  }

  function simulate(params) {
    var selected = policyByKey(params.policy);
    var selectedResult = simulatePolicy(params, selected);
    var policies = POLICIES.map(function (policy) {
      return simulatePolicy(params, policy);
    });
    return {
      audit: runAudit(),
      params: params,
      policies: policies,
      result: selectedResult,
      selected: selected,
      frontier: frontier(params)
    };
  }

  function runAudit() {
    var cases = 0;
    var ok = 0;
    [3, 23, 61].forEach(function (seed) {
      [0.10, 0.35].forEach(function (noise) {
        [0.55, 0.90].forEach(function (flush) {
          [4, 8, 13].forEach(function (secret) {
            cases += 1;
            var params = {
              seed: seed,
              secret: secret,
              rounds: 80,
              training: 8,
              window: 0.72,
              noise: noise,
              flush: flush,
              policy: "naive"
            };
            var naive = simulatePolicy(params, policyByKey("naive"));
            var fence = simulatePolicy(Object.assign({}, params, { policy: "fence" }), policyByKey("fence"));
            var constant = simulatePolicy(Object.assign({}, params, { policy: "constant" }), policyByKey("constant"));
            var finite = [naive, fence, constant].every(function (result) {
              return Number.isFinite(result.confidence) &&
                Number.isFinite(result.margin) &&
                Number.isFinite(result.specRate) &&
                result.averageTimings.every(Number.isFinite) &&
                result.votes.reduce(function (sum, count) { return sum + count; }, 0) <= params.rounds;
            });
            var naiveWorksWhenClean = noise > 0.20 || flush < 0.75 || naive.success;
            var mitigationsNotSecret = fence.top.line !== secret || fence.confidence < naive.confidence;
            var constantNotSharp = constant.margin <= naive.margin + 1e-9;
            if (finite && naiveWorksWhenClean && mitigationsNotSecret && constantNotSharp) ok += 1;
          });
        });
      });
    });
    return { ok: ok, cases: cases };
  }

  function syncOutputs(lab, params) {
    var values = {
      seed: String(params.seed),
      secret: String(params.secret),
      rounds: String(params.rounds),
      training: String(params.training),
      window: formatPercent(params.window),
      noise: formatPercent(params.noise),
      flush: formatPercent(params.flush)
    };
    Object.keys(values).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = values[key];
    });
  }

  function drawText(ctx, text, x, y, color, size, weight, align, maxWidth) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 550) + " " + (size || 12) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    if (maxWidth) ctx.fillText(text, x, y, maxWidth);
    else ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawText(ctx, title, box.x, box.y - 14, COLORS.text, 12, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + box.w, box.y - 14, COLORS.muted, 11, 550, "right");
  }

  function drawTimeline(ctx, result, box) {
    panel(ctx, box, "Transient trace", "architectural rollback is not cache rollback");
    var steps = [
      ["train", COLORS.train],
      ["predict taken", COLORS.spec],
      ["read secret", result.selected.key === "naive" ? COLORS.hit : COLORS.miss],
      ["touch probe", result.selected.key === "constant" ? COLORS.all : COLORS.hit],
      ["squash", COLORS.muted],
      ["reload", COLORS.secret]
    ];
    var y = box.y + 64;
    var gap = (box.w - 64) / (steps.length - 1);
    for (var i = 0; i < steps.length; i += 1) {
      var x = box.x + 32 + i * gap;
      if (i > 0) {
        ctx.strokeStyle = COLORS.rule;
        ctx.beginPath();
        ctx.moveTo(x - gap + 16, y);
        ctx.lineTo(x - 16, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = steps[i][1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;
      drawText(ctx, String(i + 1), x, y, steps[i][1], 11, 750, "center");
      drawText(ctx, steps[i][0], x, y + 30, COLORS.text, 10, 650, "center", 78);
    }
    var note = result.selected.key === "naive"
      ? "secret-dependent probe line survives the squash"
      : result.selected.key === "fence"
        ? "fence waits before the unsafe load"
        : result.selected.key === "mask"
          ? "unsafe index is mapped to a non-secret line"
          : result.selected.key === "constant"
            ? "every line looks hot, so the secret is not singled out"
            : "speculative line is kept out of the visible cache";
    drawText(ctx, note, box.x + 18, box.y + box.h - 22, result.selected.color, 11, 700, "left", box.w - 36);
  }

  function drawTimings(ctx, result, box) {
    panel(ctx, box, "Flush+reload ledger", "lower time means a hotter cache line");
    var timings = result.result.averageTimings;
    var plot = { x: box.x + 42, y: box.y + 26, w: box.w - 64, h: box.h - 62 };
    ctx.strokeStyle = COLORS.grid;
    [50, 100, 150, 200].forEach(function (tick) {
      var y = plot.y + (tick - 20) / 220 * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(tick), plot.x - 8, y, COLORS.muted, 9, 550, "right");
    });
    var bw = plot.w / LINES - 3;
    for (var i = 0; i < LINES; i += 1) {
      var h = clamp((timings[i] - 20) / 220, 0, 1) * plot.h;
      var x = plot.x + i * (plot.w / LINES);
      ctx.fillStyle = i === result.params.secret ? COLORS.secret : (i === result.result.top.line ? COLORS.hit : COLORS.miss);
      ctx.fillRect(x, plot.y + h, bw, plot.h - h);
      drawText(ctx, String(i), x + bw / 2, plot.y + plot.h + 15, COLORS.muted, 9, 550, "center");
    }
    drawText(ctx, "cycles", plot.x, box.y + 12, COLORS.muted, 10, 550);
  }

  function drawVotes(ctx, result, box) {
    panel(ctx, box, "Posterior by repetition", "the attacker votes for the fastest line");
    var votes = result.result.votes;
    var maxVote = Math.max.apply(Math, votes.concat([1]));
    var plot = { x: box.x + 38, y: box.y + 30, w: box.w - 58, h: box.h - 62 };
    for (var i = 0; i < LINES; i += 1) {
      var x = plot.x + i * (plot.w / LINES);
      var bw = plot.w / LINES - 3;
      var h = votes[i] / maxVote * plot.h;
      ctx.fillStyle = i === result.params.secret ? COLORS.secret : (i === result.result.top.line ? COLORS.hit : COLORS.miss);
      ctx.globalAlpha = i === result.params.secret || i === result.result.top.line ? 0.95 : 0.50;
      ctx.fillRect(x, plot.y + plot.h - h, bw, h);
      ctx.globalAlpha = 1;
      drawText(ctx, String(i), x + bw / 2, plot.y + plot.h + 15, COLORS.muted, 9, 550, "center");
    }
    drawText(ctx, "guess " + result.result.top.line + ", secret " + result.params.secret, plot.x + 8, box.y + 16, COLORS.text, 11, 750);
  }

  function drawFrontier(ctx, result, box) {
    panel(ctx, box, "Mitigation frontier", "leak signal versus rough cost");
    var plot = { x: box.x + 44, y: box.y + 28, w: box.w - 68, h: box.h - 62 };
    ctx.strokeStyle = COLORS.grid;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(Math.round(tick * 100)), plot.x - 8, y, COLORS.muted, 9, 550, "right");
    });
    result.frontier.forEach(function (point, i) {
      var x = plot.x + (point.overhead - 1) / 0.90 * plot.w;
      var y = plot.y + plot.h - point.leak * plot.h;
      ctx.fillStyle = point.policy.color;
      ctx.beginPath();
      ctx.arc(x, y, point.policy.key === result.selected.key ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, point.policy.short, x + 8, y - 8 + (i % 2) * 16, point.policy.color, 9.5, 700);
    });
    drawText(ctx, "overhead", plot.x + plot.w, plot.y + plot.h + 18, COLORS.muted, 10, 550, "right");
    drawText(ctx, "leak signal", plot.x + 5, plot.y + 12, COLORS.muted, 10, 550);
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawTimeline(ctx, result, { x: 24, y: 36, w: 852, h: 160 });
    drawTimings(ctx, result, { x: 24, y: 242, w: 416, h: 218 });
    drawVotes(ctx, result, { x: 476, y: 242, w: 400, h: 218 });
    drawFrontier(ctx, result, { x: 24, y: 506, w: 852, h: 170 });
  }

  function render(lab) {
    var params = readParams(lab);
    syncOutputs(lab, params);
    var result = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("top guess", String(result.result.top.line)),
        metric("secret line", String(params.secret)),
        metric("confidence", formatPercent(result.result.confidence, 0)),
        metric("spec rounds", formatPercent(result.result.specRate, 0)),
        metric("margin", formatPercent(result.result.margin, 0)),
        metric("audit grid", result.audit.ok + "/" + result.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function schedule() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
    });
    render(lab);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      POLICIES: POLICIES,
      runAudit: runAudit,
      simulate: simulate,
      simulatePolicy: simulatePolicy,
      runRound: runRound
    };
  }

  if (global && global.document) {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-spectre-cache-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
