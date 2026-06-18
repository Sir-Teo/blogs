(function (global) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    good: "#0f766e",
    blue: "#2563eb",
    purple: "#7c3aed",
    amber: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    memory: 64,
    passes: 3,
    lanes: 4,
    attackerMemory: 24,
    tradeoff: "full",
    bits: 40,
    accounts: 10000,
    salt: "unique"
  };

  var TRADEOFFS = {
    full: { label: "full memory", alpha: 1 },
    half: { label: "1/2 memory", alpha: 0.5 },
    quarter: { label: "1/4 memory", alpha: 0.25 },
    eighth: { label: "1/8 memory", alpha: 0.125 }
  };

  var SERVER_EFFECTIVE_MIB_PER_MS = 1.35;
  var ATTACKER_EFFECTIVE_MIB_PER_SEC = 140000;
  var SERVER_MEMORY_BUDGET_MIB = 8192;
  var LOGIN_RPS = 30;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function number(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var tradeoff = TRADEOFFS[raw.tradeoff] ? raw.tradeoff : DEFAULTS.tradeoff;
    var salt = raw.salt === "shared" ? "shared" : "unique";
    return {
      memory: Math.round(clamp(number(raw.memory, DEFAULTS.memory), 16, 2048)),
      passes: Math.round(clamp(number(raw.passes, DEFAULTS.passes), 1, 6)),
      lanes: Math.round(clamp(number(raw.lanes, DEFAULTS.lanes), 1, 8)),
      attackerMemory: Math.round(clamp(number(raw.attackerMemory, DEFAULTS.attackerMemory), 4, 512)),
      tradeoff: tradeoff,
      bits: Math.round(clamp(number(raw.bits, DEFAULTS.bits), 24, 64)),
      accounts: Math.round(clamp(number(raw.accounts, DEFAULTS.accounts), 1, 1000000)),
      salt: salt
    };
  }

  function defenderLatencyMs(params) {
    var laneFactor = Math.sqrt(params.lanes);
    return 24 + params.passes * params.memory / (SERVER_EFFECTIVE_MIB_PER_MS * laneFactor) + params.lanes * 2.5;
  }

  function timeMemoryPenalty(alpha) {
    if (alpha >= 1) return 1;
    return Math.pow(1 / alpha, 1.45);
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var latency = defenderLatencyMs(params);
    var tradeoff = TRADEOFFS[params.tradeoff];
    var alpha = tradeoff.alpha;
    var penalty = timeMemoryPenalty(alpha);
    var perGuessMemory = Math.max(1, params.memory * alpha);
    var attackerMemoryMiB = params.attackerMemory * 1024;
    var slots = Math.max(1, Math.floor(attackerMemoryMiB / perGuessMemory));
    var slotLimitedRate = slots / ((latency * penalty) / 1000);
    var workMiB = params.memory * params.passes * penalty;
    var bandwidthLimitedRate = ATTACKER_EFFECTIVE_MIB_PER_SEC / Math.max(1, workMiB);
    var hashRate = Math.max(0.000001, Math.min(slotLimitedRate, bandwidthLimitedRate));
    var searchSpace = Math.pow(2, params.bits);
    var singleMedianSeconds = (searchSpace / 2) / hashRate;
    var evalsPerDictionaryWord = params.salt === "unique" ? params.accounts : 1;
    var breachMedianSeconds = params.salt === "unique"
      ? Math.log(2) * searchSpace / hashRate
      : Math.log(2) * searchSpace / (hashRate * params.accounts);
    var maxConcurrentLogins = Math.max(1, Math.floor(SERVER_MEMORY_BUDGET_MIB / params.memory));
    var steadyConcurrent = LOGIN_RPS * latency / 1000;
    var steadyMemoryMiB = steadyConcurrent * params.memory;
    var serverBudgetOk = steadyMemoryMiB <= SERVER_MEMORY_BUDGET_MIB;

    return {
      params: params,
      tradeoff: tradeoff,
      latencyMs: latency,
      alpha: alpha,
      tradeoffPenalty: penalty,
      perGuessMemoryMiB: perGuessMemory,
      attackerSlots: slots,
      hashRate: hashRate,
      slotLimitedRate: slotLimitedRate,
      bandwidthLimitedRate: bandwidthLimitedRate,
      searchSpace: searchSpace,
      singleMedianSeconds: singleMedianSeconds,
      breachMedianSeconds: breachMedianSeconds,
      evalsPerDictionaryWord: evalsPerDictionaryWord,
      maxConcurrentLogins: maxConcurrentLogins,
      steadyMemoryMiB: steadyMemoryMiB,
      serverBudgetOk: serverBudgetOk
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(digits == null ? 1 : digits) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(digits == null ? 1 : digits) + "k";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function formatMiB(value) {
    if (value >= 1024) return (value / 1024).toFixed(value >= 10240 ? 0 : 1) + " GiB";
    return value.toFixed(0) + " MiB";
  }

  function formatRate(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(2) + "M/s";
    if (value >= 1000) return (value / 1000).toFixed(2) + "k/s";
    if (value >= 1) return value.toFixed(1) + "/s";
    return value.toPrecision(2) + "/s";
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "n/a";
    if (seconds < 60) return seconds.toFixed(seconds < 10 ? 1 : 0) + " s";
    var minutes = seconds / 60;
    if (minutes < 60) return minutes.toFixed(minutes < 10 ? 1 : 0) + " min";
    var hours = minutes / 60;
    if (hours < 48) return hours.toFixed(hours < 10 ? 1 : 0) + " h";
    var days = hours / 24;
    if (days < 365 * 2) return days.toFixed(days < 10 ? 1 : 0) + " d";
    var years = days / 365.25;
    if (years < 1000) return years.toFixed(years < 10 ? 1 : 0) + " y";
    return (years / 1000).toFixed(years < 10000 ? 1 : 0) + " ky";
  }

  function setText(root, selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function metric(label, value, tone) {
    var klass = "password-lab__metric" + (tone ? " password-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("defender latency", result.latencyMs.toFixed(0) + " ms", result.latencyMs <= 250 ? "good" : "warn"),
      metric("attacker evals", formatRate(result.hashRate), ""),
      metric("parallel guesses", formatNumber(result.attackerSlots, 0), ""),
      metric("single target 50%", formatDuration(result.singleMedianSeconds), ""),
      metric("breach any 50%", formatDuration(result.breachMedianSeconds), result.params.salt === "unique" ? "good" : "warn"),
      metric("server mem @30/s", formatMiB(result.steadyMemoryMiB), result.serverBudgetOk ? "good" : "warn")
    ].join("");
  }

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.ink;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 11) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, { size: 13, weight: 800 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, { size: 10, color: COLORS.muted, weight: 600 });
  }

  function drawGrid(ctx, plot, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    yTicks.forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
  }

  function drawDefender(ctx, result, box) {
    panel(ctx, box, "Defender latency", "memory and passes spend login time");
    var plot = { x: box.x + 42, y: box.y + 62, w: box.w - 68, h: box.h - 104 };
    drawGrid(ctx, plot, [0, 0.25, 0.5, 0.75, 1]);
    var maxLatency = 900;
    function xFor(memory) {
      var lo = Math.log2(16), hi = Math.log2(2048);
      return plot.x + (Math.log2(memory) - lo) / (hi - lo) * plot.w;
    }
    function yFor(ms) {
      return plot.y + plot.h - clamp(ms / maxLatency, 0, 1) * plot.h;
    }
    ctx.strokeStyle = COLORS.good;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048].forEach(function (memory, i) {
      var ms = defenderLatencyMs(Object.assign({}, result.params, { memory: memory }));
      var x = xFor(memory), y = yFor(ms);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.strokeStyle = COLORS.amber;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yFor(250));
    ctx.lineTo(plot.x + plot.w, yFor(250));
    ctx.stroke();
    ctx.setLineDash([]);
    var cx = xFor(result.params.memory), cy = yFor(result.latencyMs);
    ctx.fillStyle = COLORS.blue;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, "250 ms guide", plot.x + plot.w, yFor(250) - 5, { align: "right", color: COLORS.amber, size: 10 });
    text(ctx, "16 MiB", plot.x, plot.y + plot.h + 22, { color: COLORS.muted, size: 10 });
    text(ctx, "2 GiB", plot.x + plot.w, plot.y + plot.h + 22, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, result.latencyMs.toFixed(0) + " ms at " + formatMiB(result.params.memory), box.x + 14, box.y + box.h - 18, { color: COLORS.ink, size: 11, weight: 800 });
  }

  function drawAttacker(ctx, result, box) {
    panel(ctx, box, "Attacker memory", "offline guesses fill many slots");
    var x = box.x + 18, y = box.y + 62;
    var cols = 16;
    var cell = Math.min(18, (box.w - 36) / cols - 3);
    var gap = 3;
    var visible = Math.min(80, result.attackerSlots);
    for (var i = 0; i < 80; i += 1) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      ctx.fillStyle = i < visible ? (result.alpha < 1 ? COLORS.purple : COLORS.blue) : COLORS.grid;
      ctx.fillRect(x + col * (cell + gap), y + row * (cell + gap), cell, cell);
    }
    if (result.attackerSlots > 80) {
      text(ctx, "+" + formatNumber(result.attackerSlots - 80, 0), x + cols * (cell + gap) - 4, y + 5 * (cell + gap) + 12, { align: "right", color: COLORS.muted, size: 10 });
    }
    text(ctx, "per guess: " + formatMiB(result.perGuessMemoryMiB), box.x + 18, box.y + box.h - 54, { color: COLORS.muted, size: 11 });
    text(ctx, "time penalty: " + result.tradeoffPenalty.toFixed(2) + "x", box.x + 18, box.y + box.h - 34, { color: result.alpha < 1 ? COLORS.purple : COLORS.muted, size: 11 });
    text(ctx, "rate: " + formatRate(result.hashRate), box.x + 18, box.y + box.h - 14, { color: COLORS.ink, size: 12, weight: 800 });
  }

  function logDuration(seconds) {
    return Math.log10(clamp(seconds, 1, 365.25 * 24 * 3600 * 1000000));
  }

  function drawHorizon(ctx, result, box) {
    panel(ctx, box, "Search horizon", "median time in the toy offline model");
    var plot = { x: box.x + 28, y: box.y + 68, w: box.w - 56, h: box.h - 118 };
    var minLog = 0;
    var maxLog = Math.log10(365.25 * 24 * 3600 * 1000000);
    var rows = [
      { label: "single target", seconds: result.singleMedianSeconds, color: COLORS.good },
      { label: "breach any", seconds: result.breachMedianSeconds, color: result.params.salt === "unique" ? COLORS.blue : COLORS.amber }
    ];
    rows.forEach(function (row, i) {
      var yy = plot.y + i * 54;
      var frac = (logDuration(row.seconds) - minLog) / (maxLog - minLog);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(plot.x, yy + 18, plot.w, 12);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, yy + 18, clamp(frac, 0, 1) * plot.w, 12);
      text(ctx, row.label, plot.x, yy + 10, { size: 11, color: COLORS.ink, weight: 800 });
      text(ctx, formatDuration(row.seconds), plot.x + plot.w, yy + 10, { align: "right", size: 11, color: row.color, weight: 800 });
    });
    text(ctx, "1 s", plot.x, plot.y + plot.h + 28, { color: COLORS.muted, size: 10 });
    text(ctx, "1 My", plot.x + plot.w, plot.y + plot.h + 28, { align: "right", color: COLORS.muted, size: 10 });
    text(ctx, result.params.bits + "-bit search space, " + result.params.accounts.toLocaleString() + " accounts", box.x + 14, box.y + box.h - 18, { color: COLORS.muted, size: 10, weight: 650 });
  }

  function drawSalt(ctx, result, box) {
    panel(ctx, box, "Salt ledger", "one word across a breach");
    var left = box.x + 20;
    var top = box.y + 66;
    var accounts = result.params.accounts;
    var evals = result.evalsPerDictionaryWord;
    var accountFrac = Math.log10(accounts) / 6;
    var evalFrac = Math.log10(evals) / 6;
    function bar(y, frac, color, label, value) {
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(left, y, box.w - 40, 16);
      ctx.fillStyle = color;
      ctx.fillRect(left, y, clamp(frac, 0, 1) * (box.w - 40), 16);
      text(ctx, label, left, y - 7, { size: 10, color: COLORS.muted });
      text(ctx, value, left + box.w - 40, y - 7, { size: 10, color: color, align: "right", weight: 800 });
    }
    bar(top, accountFrac, COLORS.blue, "accounts in breach", accounts.toLocaleString());
    bar(top + 56, evalFrac, result.params.salt === "unique" ? COLORS.good : COLORS.amber, "KDF evals per dictionary word", evals.toLocaleString());
    var note = result.params.salt === "unique"
      ? "unique salts force per-account work"
      : "shared salt lets one eval check all accounts";
    text(ctx, note, left, box.y + box.h - 36, { color: result.params.salt === "unique" ? COLORS.good : COLORS.amber, size: 11, weight: 800 });
    text(ctx, "salt does not make one target's password stronger", left, box.y + box.h - 16, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function draw(canvas, result) {
    var ctx = canvas.getContext("2d");
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var width = Math.max(320, rect.width || canvas.clientWidth || 900);
    var height = width < 600 ? 980 : 640;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    var margin = 18;
    var gap = 16;
    if (width < 600) {
      var h = (height - margin * 2 - gap * 3) / 4;
      drawDefender(ctx, result, { x: margin, y: margin, w: width - margin * 2, h: h });
      drawAttacker(ctx, result, { x: margin, y: margin + h + gap, w: width - margin * 2, h: h });
      drawHorizon(ctx, result, { x: margin, y: margin + (h + gap) * 2, w: width - margin * 2, h: h });
      drawSalt(ctx, result, { x: margin, y: margin + (h + gap) * 3, w: width - margin * 2, h: h });
    } else {
      var panelW = (width - margin * 2 - gap) / 2;
      var panelH = (height - margin * 2 - gap) / 2;
      drawDefender(ctx, result, { x: margin, y: margin, w: panelW, h: panelH });
      drawAttacker(ctx, result, { x: margin + panelW + gap, y: margin, w: panelW, h: panelH });
      drawHorizon(ctx, result, { x: margin, y: margin + panelH + gap, w: panelW, h: panelH });
      drawSalt(ctx, result, { x: margin + panelW + gap, y: margin + panelH + gap, w: panelW, h: panelH });
    }
  }

  function readParams(root) {
    return {
      memory: root.querySelector('[data-param="memory"]') && root.querySelector('[data-param="memory"]').value,
      passes: root.querySelector('[data-param="passes"]') && root.querySelector('[data-param="passes"]').value,
      lanes: root.querySelector('[data-param="lanes"]') && root.querySelector('[data-param="lanes"]').value,
      attackerMemory: root.querySelector('[data-param="attackerMemory"]') && root.querySelector('[data-param="attackerMemory"]').value,
      tradeoff: root.querySelector('[data-param="tradeoff"]') && root.querySelector('[data-param="tradeoff"]').value,
      bits: root.querySelector('[data-param="bits"]') && root.querySelector('[data-param="bits"]').value,
      accounts: root.querySelector('[data-param="accounts"]') && root.querySelector('[data-param="accounts"]').value,
      salt: root.querySelector('[data-param="salt"]') && root.querySelector('[data-param="salt"]').value
    };
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setText(root, '[data-value="memory"]', formatMiB(result.params.memory));
    setText(root, '[data-value="passes"]', String(result.params.passes));
    setText(root, '[data-value="lanes"]', String(result.params.lanes));
    setText(root, '[data-value="attackerMemory"]', result.params.attackerMemory + " GiB");
    setText(root, '[data-value="bits"]', result.params.bits + " bits");
    setText(root, '[data-value="accounts"]', result.params.accounts.toLocaleString());
    setText(root, '[data-value="tradeoff"]', result.tradeoff.label);
    setText(root, '[data-value="salt"]', result.params.salt === "unique" ? "unique salts" : "shared salt");
    renderMetrics(root, result);
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Toy economics model: " + formatRate(result.hashRate) + " hash evaluations, " +
        formatDuration(result.singleMedianSeconds) + " median for one target, " +
        (result.params.salt === "unique" ? "unique salts require " : "shared salt requires ") +
        result.evalsPerDictionaryWord.toLocaleString() + " KDF evaluation" +
        (result.evalsPerDictionaryWord === 1 ? "" : "s") + " per dictionary word across the breach.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__passwordHashResult = result;
  }

  function mount(root) {
    if (!root || root.__passwordHashReady) return;
    root.__passwordHashReady = true;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
    global.addEventListener("resize", function () { render(root); });
  }

  function auditPasswordHashLab() {
    var checks = [];
    var criticalChecks = [];
    var cases = [];
    function check(ok, name, extra) {
      var row = { ok: !!ok, name: name, extra: extra || null };
      checks.push(row);
      return row.ok;
    }
    function addCritical(ok, name, extra) {
      criticalChecks.push({
        check: name,
        passed: check(ok, name, extra)
      });
    }
    var base = evaluate(DEFAULTS);
    var moreMemory = evaluate(Object.assign({}, DEFAULTS, { memory: 256 }));
    var morePasses = evaluate(Object.assign({}, DEFAULTS, { passes: 5 }));
    var shared = evaluate(Object.assign({}, DEFAULTS, { salt: "shared" }));
    var unique = evaluate(Object.assign({}, DEFAULTS, { salt: "unique" }));
    var quarter = evaluate(Object.assign({}, DEFAULTS, { tradeoff: "quarter" }));

    addCritical(base.latencyMs > 0 && Number.isFinite(base.latencyMs), "default latency is finite");
    addCritical(moreMemory.latencyMs > base.latencyMs, "raising memory raises defender latency");
    addCritical(moreMemory.hashRate < base.hashRate, "raising memory lowers attacker rate in model");
    addCritical(morePasses.latencyMs > base.latencyMs, "raising passes raises defender latency");
    addCritical(morePasses.hashRate < base.hashRate, "raising passes lowers attacker rate in model");
    addCritical(unique.evalsPerDictionaryWord === unique.params.accounts, "unique salts force one KDF per account per word");
    addCritical(shared.evalsPerDictionaryWord === 1, "shared salt lets one KDF cover the breach word");
    addCritical(shared.breachMedianSeconds < unique.breachMedianSeconds, "shared salt accelerates breach-wide search");
    addCritical(quarter.tradeoffPenalty > 1 / quarter.alpha, "toy tradeoff penalty is memory-hard shaped");
    addCritical(quarter.hashRate < base.hashRate, "quarter-memory tradeoff does not improve total rate in toy model");
    addCritical(base.maxConcurrentLogins === Math.floor(SERVER_MEMORY_BUDGET_MIB / base.params.memory), "server concurrency budget is memory divided by per-login memory");

    var grid = 0;
    [16, 64, 256, 1024].forEach(function (memory) {
      [1, 3, 6].forEach(function (passes) {
        ["full", "half", "quarter"].forEach(function (tradeoff) {
          ["unique", "shared"].forEach(function (salt) {
            var row = evaluate({ memory: memory, passes: passes, tradeoff: tradeoff, salt: salt, accounts: 1000, bits: 36, lanes: 4, attackerMemory: 24 });
            var failedChecks = [];
            var label;
            grid += 1;
            label = "grid " + grid + " hash rate finite";
            if (!check(Number.isFinite(row.hashRate) && row.hashRate > 0, label)) failedChecks.push(label);
            label = "grid " + grid + " target horizon finite";
            if (!check(Number.isFinite(row.singleMedianSeconds) && row.singleMedianSeconds > 0, label)) failedChecks.push(label);
            label = "grid " + grid + " tradeoff memory does not exceed full memory";
            if (!check(row.perGuessMemoryMiB <= row.params.memory, label)) failedChecks.push(label);
            cases.push({
              attackerSlots: row.attackerSlots,
              breachMedianSeconds: row.breachMedianSeconds,
              evalsPerDictionaryWord: row.evalsPerDictionaryWord,
              failedChecks: failedChecks,
              hashRate: row.hashRate,
              latencyMs: row.latencyMs,
              memory: memory,
              passed: failedChecks.length === 0,
              passes: passes,
              perGuessMemoryMiB: row.perGuessMemoryMiB,
              salt: salt,
              serverBudgetOk: row.serverBudgetOk ? 1 : 0,
              singleMedianSeconds: row.singleMedianSeconds,
              tradeoff: tradeoff,
              tradeoffPenalty: row.tradeoffPenalty
            });
          });
        });
      });
    });
    addCritical(grid === 72, "72-case password hash grid completed", { grid: grid });

    function summarize(groupBy) {
      var groups = {};
      cases.forEach(function (row) {
        var key = String(row[groupBy]);
        if (!groups[key]) {
          groups[key] = {
            avgBreachMedianSeconds: 0,
            avgEvalsPerDictionaryWord: 0,
            avgHashRate: 0,
            avgLatencyMs: 0,
            avgSingleMedianSeconds: 0,
            cases: 0,
            maxLatencyMs: 0,
            minHashRate: Infinity,
            passed: 0,
            serverBudgetOk: 0
          };
          groups[key][groupBy] = row[groupBy];
        }
        groups[key].avgBreachMedianSeconds += row.breachMedianSeconds;
        groups[key].avgEvalsPerDictionaryWord += row.evalsPerDictionaryWord;
        groups[key].avgHashRate += row.hashRate;
        groups[key].avgLatencyMs += row.latencyMs;
        groups[key].avgSingleMedianSeconds += row.singleMedianSeconds;
        groups[key].cases += 1;
        groups[key].maxLatencyMs = Math.max(groups[key].maxLatencyMs, row.latencyMs);
        groups[key].minHashRate = Math.min(groups[key].minHashRate, row.hashRate);
        groups[key].serverBudgetOk += row.serverBudgetOk;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort(function (a, b) {
        return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) ? Number(a) - Number(b) : a.localeCompare(b);
      }).map(function (key) {
        var group = groups[key];
        group.avgBreachMedianSeconds /= group.cases;
        group.avgEvalsPerDictionaryWord /= group.cases;
        group.avgHashRate /= group.cases;
        group.avgLatencyMs /= group.cases;
        group.avgSingleMedianSeconds /= group.cases;
        return group;
      });
    }

    var passedChecks = checks.filter(function (row) { return row.ok; }).length;
    var errors = checks.filter(function (row) { return !row.ok; }).map(function (row) { return row.name; });
    var ok = errors.length === 0;

    return {
      byMemory: summarize("memory"),
      byPasses: summarize("passes"),
      bySalt: summarize("salt"),
      byTradeoff: summarize("tradeoff"),
      cases: cases,
      checks: checks,
      criticalChecks: criticalChecks,
      defaultResult: base,
      errors: errors,
      ok: ok,
      passed: ok,
      passedChecks: passedChecks,
      total: checks.length
    };
  }

  var api = {
    evaluate: evaluate,
    cleanParams: cleanParams,
    auditPasswordHashLab: auditPasswordHashLab
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global.document) {
    if (!CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        return this;
      };
    }
    global.PasswordHashLab = api;
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-password-hash-lab]")).forEach(mount);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-password-hash-lab]")).forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
