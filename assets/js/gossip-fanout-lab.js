(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    push: "#2563eb",
    pull: "#b45309",
    both: "#0f766e",
    waste: "#94a3b8",
    lost: "#be123c",
    good: "#0f766e",
    bad: "#be123c"
  };

  var DEFAULTS = {
    nodes: 512,
    fanout: 1,
    loss: 4,
    trials: 32,
    seed: 23
  };

  var POLICIES = [
    { color: COLORS.push, id: "push", label: "push" },
    { color: COLORS.pull, id: "pull", label: "pull" },
    { color: COLORS.both, id: "pushpull", label: "push-pull" }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function normalizeParams(raw) {
    raw = raw || {};
    return {
      fanout: snap(raw.fanout, DEFAULTS.fanout, 1, 4, 1),
      loss: snap(raw.loss, DEFAULTS.loss, 0, 35, 1),
      nodes: snap(raw.nodes, DEFAULTS.nodes, 128, 2048, 128),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      trials: snap(raw.trials, DEFAULTS.trials, 8, 64, 4)
    };
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickOther(rand, n, self) {
    var peer = Math.floor(rand() * (n - 1));
    return peer >= self ? peer + 1 : peer;
  }

  function maxRounds(params) {
    return clamp(Math.ceil(Math.log(params.nodes) / Math.log(2) * 4 + 12 + params.loss * 0.35), 24, 88);
  }

  function firstRoundAt(curve, target) {
    for (var i = 0; i < curve.length; i += 1) {
      if (curve[i].fraction >= target) return curve[i].round;
    }
    return null;
  }

  function valueAtRound(curve, round, key) {
    for (var i = 0; i < curve.length; i += 1) {
      if (curve[i].round === round) return curve[i][key];
    }
    return curve.length ? curve[curve.length - 1][key] : 0;
  }

  function simulateOne(params, policyId, trialIndex) {
    var rand = rng(20260618 + params.seed * 1009 + trialIndex * 9176 + policyId.length * 131);
    var n = params.nodes;
    var informed = new Uint8Array(n);
    informed[0] = 1;
    var limit = maxRounds(params);
    var curve = [{
      contacts: 0,
      dropped: 0,
      fraction: 1 / n,
      informed: 1,
      redundant: 0,
      round: 0
    }];
    var totalContacts = 0;
    var totalDropped = 0;
    var totalRedundant = 0;

    function call(next, from, to) {
      totalContacts += 1;
      if (rand() < params.loss / 100) {
        totalDropped += 1;
        return;
      }

      if (policyId === "push") {
        if (informed[from] && !informed[to]) next[to] = 1;
        else totalRedundant += 1;
        return;
      }

      if (policyId === "pull") {
        if (!informed[from] && informed[to]) next[from] = 1;
        else totalRedundant += 1;
        return;
      }

      if (informed[from] && !informed[to]) next[to] = 1;
      else if (!informed[from] && informed[to]) next[from] = 1;
      else totalRedundant += 1;
    }

    for (var round = 1; round <= limit; round += 1) {
      var next = new Uint8Array(informed);
      for (var node = 0; node < n; node += 1) {
        if (policyId === "push" && !informed[node]) continue;
        if (policyId === "pull" && informed[node]) continue;
        for (var f = 0; f < params.fanout; f += 1) {
          call(next, node, pickOther(rand, n, node));
        }
      }
      informed = next;

      var count = 0;
      for (var i = 0; i < n; i += 1) count += informed[i];
      curve.push({
        contacts: totalContacts,
        dropped: totalDropped,
        fraction: count / n,
        informed: count,
        redundant: totalRedundant,
        round: round
      });
      if (count === n) {
        for (var fill = round + 1; fill <= limit; fill += 1) {
          curve.push({
            contacts: totalContacts,
            dropped: totalDropped,
            fraction: 1,
            informed: n,
            redundant: totalRedundant,
            round: fill
          });
        }
        break;
      }
    }

    return {
      contacts: totalContacts,
      curve: curve,
      dropped: totalDropped,
      finalFraction: curve[curve.length - 1].fraction,
      policy: policyId,
      redundant: totalRedundant,
      t50: firstRoundAt(curve, 0.5),
      t90: firstRoundAt(curve, 0.9),
      t99: firstRoundAt(curve, 0.99)
    };
  }

  function quantile(values, p) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.ceil(sorted.length * p) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function summarizePolicy(params, policy) {
    var limit = maxRounds(params);
    var trials = [];
    for (var t = 0; t < params.trials; t += 1) {
      trials.push(simulateOne(params, policy.id, t));
    }

    var avgCurve = [];
    for (var round = 0; round <= limit; round += 1) {
      avgCurve.push({
        contacts: average(trials.map(function (trial) { return valueAtRound(trial.curve, round, "contacts"); })),
        dropped: average(trials.map(function (trial) { return valueAtRound(trial.curve, round, "dropped"); })),
        fraction: average(trials.map(function (trial) { return valueAtRound(trial.curve, round, "fraction"); })),
        redundant: average(trials.map(function (trial) { return valueAtRound(trial.curve, round, "redundant"); })),
        round: round
      });
    }

    var reached = trials.filter(function (trial) { return trial.t99 != null; });
    var t99Values = reached.map(function (trial) { return trial.t99; });
    var contactsAt99 = reached.map(function (trial) { return valueAtRound(trial.curve, trial.t99, "contacts") / params.nodes; });
    var redundantAt99 = reached.map(function (trial) {
      var contacts = valueAtRound(trial.curve, trial.t99, "contacts");
      var redundant = valueAtRound(trial.curve, trial.t99, "redundant");
      return contacts > 0 ? redundant / contacts : 0;
    });

    return {
      avgCurve: avgCurve,
      color: policy.color,
      contactsPerNode99: average(contactsAt99),
      finalFraction: average(trials.map(function (trial) { return trial.finalFraction; })),
      id: policy.id,
      label: policy.label,
      p90Round99: quantile(t99Values, 0.9),
      reached99: reached.length,
      redundantShare99: average(redundantAt99),
      t50: average(trials.map(function (trial) { return trial.t50 == null ? limit + 1 : trial.t50; })),
      t90: average(trials.map(function (trial) { return trial.t90 == null ? limit + 1 : trial.t90; })),
      t99: average(trials.map(function (trial) { return trial.t99 == null ? limit + 1 : trial.t99; })),
      trials: trials
    };
  }

  function evaluate(raw) {
    var params = normalizeParams(raw);
    var summaries = POLICIES.map(function (policy) {
      return summarizePolicy(params, policy);
    });
    var result = {
      audit: null,
      maxRounds: maxRounds(params),
      params: params,
      policies: summaries
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var monotone = true;
    var bounded = true;
    var startsAtOne = true;
    result.policies.forEach(function (policy) {
      policy.trials.forEach(function (trial) {
        if (trial.curve[0].informed !== 1) startsAtOne = false;
        for (var i = 1; i < trial.curve.length; i += 1) {
          if (trial.curve[i].informed < trial.curve[i - 1].informed) monotone = false;
          if (trial.curve[i].informed < 1 || trial.curve[i].informed > result.params.nodes) bounded = false;
        }
      });
    });
    var pushPull = result.policies.filter(function (policy) { return policy.id === "pushpull"; })[0];
    var enoughDefaultCoverage = result.params.loss > 25 || pushPull.reached99 >= Math.ceil(result.params.trials * 0.75);
    return {
      bounded: bounded,
      enoughDefaultCoverage: enoughDefaultCoverage,
      monotone: monotone,
      passed: bounded && monotone && startsAtOne && enoughDefaultCoverage,
      startsAtOne: startsAtOne
    };
  }

  function auditGossipFanoutLab() {
    var cases = [
      { nodes: 256, fanout: 1, loss: 0, trials: 12, seed: 5 },
      { nodes: 512, fanout: 2, loss: 5, trials: 12, seed: 11 },
      { nodes: 1024, fanout: 1, loss: 18, trials: 12, seed: 23 },
      { nodes: 128, fanout: 4, loss: 30, trials: 8, seed: 71 }
    ];
    var passed = 0;
    cases.forEach(function (params) {
      if (evaluate(params).audit.passed) passed += 1;
    });
    return { passed: passed, total: cases.length };
  }

  function formatNumber(value, digits) {
    if (value == null || !isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function formatRound(value) {
    if (value == null || !isFinite(value)) return "n/a";
    return value.toFixed(value >= 10 ? 1 : 2);
  }

  function metric(label, value, tone) {
    var klass = "gossip-lab__metric" + (tone ? " gossip-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 650 ? 900 : 640;
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 520);
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) * (range.max - range.min) / span;
    };
  }

  function drawGrid(ctx, plot) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 6; i += 1) {
      var x = plot.x + plot.w * i / 6;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= 4; j += 1) {
      var y = plot.y + plot.h * j / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawCurve(ctx, box, result) {
    panel(ctx, box, "spread curve", "average fraction informed across trials");
    var plot = { x: box.x + 46, y: box.y + 62, w: box.w - 72, h: box.h - 102 };
    var sx = scale({ min: 0, max: result.maxRounds }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale({ min: 0, max: 1 }, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot);

    result.policies.forEach(function (policy) {
      ctx.strokeStyle = policy.color;
      ctx.lineWidth = policy.id === "pushpull" ? 3 : 2;
      ctx.beginPath();
      policy.avgCurve.forEach(function (point, index) {
        var x = sx(point.round);
        var y = sy(point.fraction);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    [0.5, 0.9, 0.99].forEach(function (level) {
      var y = sy(level);
      ctx.strokeStyle = "rgba(93, 104, 114, 0.25)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, Math.round(level * 100) + "%", plot.x - 8, y - 7, COLORS.muted, 10, 650, "right");
    });

    text(ctx, "rounds", plot.x + plot.w / 2, box.y + box.h - 26, COLORS.muted, 11, 520, "center");
    result.policies.forEach(function (policy, i) {
      text(ctx, policy.label, plot.x + i * 88, box.y + box.h - 45, policy.color, 11, 760);
    });
  }

  function drawWork(ctx, box, result) {
    panel(ctx, box, "time versus contact work", "rounds and contact attempts to reach 99%");
    var plot = { x: box.x + 132, y: box.y + 68, w: box.w - 164, h: box.h - 108 };
    var maxRoundsValue = Math.max.apply(null, result.policies.map(function (p) { return p.t99; }).concat([1]));
    var maxWork = Math.max.apply(null, result.policies.map(function (p) { return p.contactsPerNode99 || 0; }).concat([1]));
    var rowH = plot.h / result.policies.length;
    result.policies.forEach(function (policy, i) {
      var y = plot.y + i * rowH + 8;
      text(ctx, policy.label, box.x + 16, y + 7, COLORS.text, 11, 760);
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y, plot.w, 12);
      ctx.fillStyle = policy.color;
      ctx.fillRect(plot.x, y, plot.w * policy.t99 / maxRoundsValue, 12);
      text(ctx, formatRound(policy.t99) + " rounds", plot.x + plot.w + 8, y - 1, policy.color, 10, 760);

      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(plot.x, y + 22, plot.w, 12);
      ctx.fillStyle = COLORS.waste;
      ctx.fillRect(plot.x, y + 22, plot.w * (policy.contactsPerNode99 || 0) / maxWork, 12);
      text(ctx, formatNumber(policy.contactsPerNode99, 1) + " calls/node", plot.x + plot.w + 8, y + 21, COLORS.muted, 10, 650);
    });
    text(ctx, "colored bar: time, gray bar: contact work", box.x + 16, box.y + box.h - 24, COLORS.muted, 11, 520);
  }

  function drawWaste(ctx, box, result) {
    panel(ctx, box, "tail cost", "late rounds spend calls on peers that already know");
    var plot = { x: box.x + 50, y: box.y + 68, w: box.w - 76, h: box.h - 112 };
    var maxY = 1;
    result.policies.forEach(function (policy) {
      maxY = Math.max(maxY, policy.redundantShare99 || 0);
    });
    result.policies.forEach(function (policy, i) {
      var barW = plot.w / result.policies.length * 0.56;
      var x = plot.x + (i + 0.22) * plot.w / result.policies.length;
      var h = plot.h * (policy.redundantShare99 || 0) / maxY;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, plot.y, barW, plot.h);
      ctx.fillStyle = policy.color;
      ctx.fillRect(x, plot.y + plot.h - h, barW, h);
      text(ctx, policy.label, x + barW / 2, plot.y + plot.h + 12, COLORS.muted, 10, 650, "center");
      text(ctx, Math.round((policy.redundantShare99 || 0) * 100) + "%", x + barW / 2, plot.y + plot.h - h - 18, policy.color, 11, 760, "center");
    });
    text(ctx, "redundant share by the 99% mark", plot.x, box.y + box.h - 28, COLORS.muted, 11, 520);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "simulation audit", "deterministic trials, monotone coverage, bounded state");
    var rows = [
      ["starts with one informed node", result.audit.startsAtOne],
      ["informed count never decreases", result.audit.monotone],
      ["informed count stays within population", result.audit.bounded],
      ["push-pull reaches broad coverage", result.audit.enoughDefaultCoverage]
    ];
    var y = box.y + 66;
    rows.forEach(function (row) {
      ctx.fillStyle = row[1] ? "rgba(15, 118, 110, 0.11)" : "rgba(190, 18, 60, 0.10)";
      ctx.strokeStyle = row[1] ? "rgba(15, 118, 110, 0.28)" : "rgba(190, 18, 60, 0.28)";
      ctx.beginPath();
      ctx.roundRect(box.x + 16, y - 5, box.w - 32, 25, 6);
      ctx.fill();
      ctx.stroke();
      text(ctx, row[0], box.x + 28, y, COLORS.text, 11, 650);
      text(ctx, row[1] ? "pass" : "fail", box.x + box.w - 28, y, row[1] ? COLORS.good : COLORS.bad, 11, 760, "right");
      y += 34;
    });
    var both = result.policies.filter(function (policy) { return policy.id === "pushpull"; })[0];
    text(ctx, "push-pull 99% success: " + both.reached99 + "/" + result.params.trials + " trials", box.x + 18, box.y + box.h - 32, both.reached99 === result.params.trials ? COLORS.good : COLORS.muted, 11, 650);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 650) {
      var pad = 14;
      var gap = 14;
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawCurve(ctx, { x: pad, y: pad, w: width - 2 * pad, h: panelH }, result);
      drawWork(ctx, { x: pad, y: pad + panelH + gap, w: width - 2 * pad, h: panelH }, result);
      drawWaste(ctx, { x: pad, y: pad + 2 * (panelH + gap), w: width - 2 * pad, h: panelH }, result);
      drawAudit(ctx, { x: pad, y: pad + 3 * (panelH + gap), w: width - 2 * pad, h: panelH }, result);
      return;
    }

    var outer = 16;
    var gap2 = 14;
    var halfW = (width - outer * 2 - gap2) / 2;
    var halfH = (height - outer * 2 - gap2) / 2;
    drawCurve(ctx, { x: outer, y: outer, w: halfW, h: halfH }, result);
    drawWork(ctx, { x: outer + halfW + gap2, y: outer, w: halfW, h: halfH }, result);
    drawWaste(ctx, { x: outer, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
    drawAudit(ctx, { x: outer + halfW + gap2, y: outer + halfH + gap2, w: halfW, h: halfH }, result);
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    var push = result.policies.filter(function (policy) { return policy.id === "push"; })[0];
    var pull = result.policies.filter(function (policy) { return policy.id === "pull"; })[0];
    var both = result.policies.filter(function (policy) { return policy.id === "pushpull"; })[0];
    holder.innerHTML = [
      metric("Push-pull to 99%", formatRound(both.t99) + " rounds", "good"),
      metric("Push to 99%", formatRound(push.t99) + " rounds"),
      metric("Pull to 99%", formatRound(pull.t99) + " rounds"),
      metric("Calls per node", formatNumber(both.contactsPerNode99, 1)),
      metric("Tail redundancy", Math.round((both.redundantShare99 || 0) * 100) + "%", both.redundantShare99 > 0.45 ? "warn" : ""),
      metric("Audit", result.audit.passed ? "pass" : "fail", result.audit.passed ? "good" : "bad")
    ].join("");
  }

  function updateOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "nodes") output.textContent = params.nodes.toLocaleString();
      if (key === "fanout") output.textContent = String(params.fanout);
      if (key === "loss") output.textContent = params.loss + "%";
      if (key === "trials") output.textContent = String(params.trials);
      if (key === "seed") output.textContent = String(params.seed);
    });
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      values[input.getAttribute("data-param")] = input.value;
    });
    return normalizeParams(values);
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      updateOutputs(root, params);
      var result = evaluate(params);
      root.__gossipFanoutResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-gossip-fanout-lab]")).forEach(init);
  }

  var api = {
    auditGossipFanoutLab: auditGossipFanoutLab,
    evaluate: evaluate,
    normalizeParams: normalizeParams,
    simulateOne: simulateOne
  };

  global.GossipFanoutLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
