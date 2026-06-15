(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    random: "#be123c",
    two: "#2563eb",
    d: "#0f766e",
    oracle: "#7c3aed",
    stale: "#d97706"
  };

  var DEFAULTS = {
    servers: 192,
    load: 150,
    choices: 2,
    reportEvery: 1,
    seed: 41
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      servers: snap(raw.servers, DEFAULTS.servers, 32, 512, 1),
      load: snap(raw.load, DEFAULTS.load, 25, 400, 5),
      choices: snap(raw.choices, DEFAULTS.choices, 2, 8, 1),
      reportEvery: snap(raw.reportEvery, DEFAULTS.reportEvery, 1, 96, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var index = clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function std(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var v = values.reduce(function (sum, value) {
      var d = value - m;
      return sum + d * d;
    }, 0) / values.length;
    return Math.sqrt(v);
  }

  function histogram(loads) {
    var maxLoad = Math.max.apply(null, loads);
    var bins = [];
    var i;
    for (i = 0; i <= maxLoad; i += 1) bins.push(0);
    for (i = 0; i < loads.length; i += 1) bins[loads[i]] += 1;
    return bins;
  }

  function summarize(loads, jobs, snapshots) {
    var avg = jobs / Math.max(1, loads.length);
    var sorted = loads.slice().sort(function (a, b) { return a - b; });
    var maxLoad = sorted[sorted.length - 1] || 0;
    var overloadLine = Math.ceil(avg) + 2;
    var overloaded = loads.filter(function (load) { return load >= overloadLine; }).length;
    var empty = loads.filter(function (load) { return load === 0; }).length;
    return {
      avg: avg,
      cv: avg > 0 ? std(loads) / avg : 0,
      empty: empty,
      gap: maxLoad - avg,
      histogram: histogram(loads),
      loads: loads,
      max: maxLoad,
      overloaded: overloaded,
      overloadLine: overloadLine,
      p50: percentile(loads, 0.5),
      p90: percentile(loads, 0.9),
      p99: percentile(loads, 0.99),
      snapshots: snapshots || []
    };
  }

  function cloneArray(values) {
    return values.slice();
  }

  function chooseByVisible(candidates, visible, rng) {
    var best = candidates[0];
    var bestLoad = visible[best];
    var tied = 1;
    for (var i = 1; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      var load = visible[candidate];
      if (load < bestLoad) {
        best = candidate;
        bestLoad = load;
        tied = 1;
      } else if (load === bestLoad) {
        tied += 1;
        if (rng() < 1 / tied) best = candidate;
      }
    }
    return best;
  }

  function chooseOracle(visible, rng) {
    var best = 0;
    var bestLoad = visible[0];
    var tied = 1;
    for (var i = 1; i < visible.length; i += 1) {
      var load = visible[i];
      if (load < bestLoad) {
        best = i;
        bestLoad = load;
        tied = 1;
      } else if (load === bestLoad) {
        tied += 1;
        if (rng() < 1 / tied) best = i;
      }
    }
    return best;
  }

  function simulatePolicy(params, policy) {
    var n = params.servers;
    var jobs = Math.round(n * params.load / 100);
    var rng = makeRng(params.seed * 1000003 + policy.seedSalt);
    var loads = [];
    var visible = [];
    var snapshots = [];
    var snapshotEvery = Math.max(1, Math.floor(jobs / 80));
    var i;
    for (i = 0; i < n; i += 1) loads.push(0);
    visible = cloneArray(loads);

    for (var job = 0; job < jobs; job += 1) {
      if (job % params.reportEvery === 0) visible = cloneArray(loads);

      var server;
      if (policy.kind === "oracle") {
        server = chooseOracle(visible, rng);
      } else {
        var d = policy.choices;
        var candidates = [];
        for (i = 0; i < d; i += 1) candidates.push(Math.floor(rng() * n));
        server = chooseByVisible(candidates, visible, rng);
      }

      loads[server] += 1;
      if (params.reportEvery === 1) visible[server] += 1;

      if ((job + 1) % snapshotEvery === 0 || job === jobs - 1) {
        snapshots.push({
          jobs: job + 1,
          max: Math.max.apply(null, loads),
          p99: percentile(loads, 0.99),
          cv: mean(loads) > 0 ? std(loads) / mean(loads) : 0
        });
      }
    }

    var summary = summarize(loads, jobs, snapshots);
    summary.jobs = jobs;
    summary.policy = policy.label;
    summary.choices = policy.kind === "oracle" ? n : policy.choices;
    return summary;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var random = simulatePolicy(params, { kind: "choice", choices: 1, label: "random", seedSalt: 17 });
    var two = simulatePolicy(params, { kind: "choice", choices: 2, label: "two choices", seedSalt: 29 });
    var d = simulatePolicy(params, { kind: "choice", choices: params.choices, label: params.choices + " choices", seedSalt: 43 + params.choices });
    var oracle = simulatePolicy(params, { kind: "oracle", choices: params.servers, label: "least-loaded snapshot", seedSalt: 61 });
    var logLog = Math.log(Math.max(3, Math.log(params.servers)));
    var randomYardstick = Math.log(params.servers) / Math.max(1e-9, Math.log(Math.log(params.servers)));
    var dYardstick = Math.log(Math.log(params.servers)) / Math.max(1e-9, Math.log(params.choices));

    return {
      params: params,
      jobs: random.jobs,
      policies: {
        random: random,
        two: two,
        d: d,
        oracle: oracle
      },
      selected: params.choices === 2 ? two : d,
      yardsticks: {
        logLog: logLog,
        randomMaxAtUnitLoad: randomYardstick,
        choiceGapAtUnitLoad: dYardstick
      },
      ratios: {
        maxGap: random.gap / Math.max(1e-9, (params.choices === 2 ? two : d).gap),
        p99Gap: (random.p99 - random.avg) / Math.max(1e-9, ((params.choices === 2 ? two : d).p99 - (params.choices === 2 ? two : d).avg))
      }
    };
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function finiteSummary(summary) {
    return summary.loads.length > 0 &&
      summary.loads.every(function (load) { return Number.isInteger(load) && load >= 0; }) &&
      summary.loads.reduce(function (a, b) { return a + b; }, 0) === summary.jobs &&
      summary.p50 <= summary.p90 &&
      summary.p90 <= summary.p99 &&
      summary.p99 <= summary.max &&
      summary.histogram.reduce(function (a, b) { return a + b; }, 0) === summary.loads.length &&
      isFinite(summary.cv) &&
      isFinite(summary.gap);
  }

  function runAudit() {
    var checked = 0;
    var failures = [];

    function check(name, ok, detail) {
      checked += 1;
      if (!ok) failures.push({ name: name, detail: detail || null });
    }

    var cleaned = cleanParams({ servers: 9999, load: -20, choices: 99, reportEvery: 500, seed: "x" });
    check("parameters snap into supported ranges", cleaned.servers === 512 &&
      cleaned.load === 25 &&
      cleaned.choices === 8 &&
      cleaned.reportEvery === 96 &&
      cleaned.seed === DEFAULTS.seed, cleaned);

    var defaultResult = evaluate(DEFAULTS);
    check("default jobs equal rounded offered load", defaultResult.jobs === Math.round(DEFAULTS.servers * DEFAULTS.load / 100), defaultResult.jobs);
    check("random policy conserves jobs and has valid percentiles", finiteSummary(defaultResult.policies.random));
    check("two-choice policy conserves jobs and has valid percentiles", finiteSummary(defaultResult.policies.two));
    check("selected policy conserves jobs and has valid percentiles", finiteSummary(defaultResult.selected));
    check("least-loaded snapshot policy conserves jobs and has valid percentiles", finiteSummary(defaultResult.policies.oracle));
    check("default two choices improves max load over random", defaultResult.policies.two.max < defaultResult.policies.random.max, {
      random: defaultResult.policies.random.max,
      two: defaultResult.policies.two.max
    });
    check("default two choices improves p99 over random", defaultResult.policies.two.p99 <= defaultResult.policies.random.p99, {
      random: defaultResult.policies.random.p99,
      two: defaultResult.policies.two.p99
    });
    check("fresh least-loaded snapshot is no worse than two choices", defaultResult.policies.oracle.max <= defaultResult.policies.two.max, {
      oracle: defaultResult.policies.oracle.max,
      two: defaultResult.policies.two.max
    });

    var repeat = evaluate(DEFAULTS);
    check("simulation is deterministic for a fixed seed", arraysEqual(defaultResult.policies.two.loads, repeat.policies.two.loads));

    var oneChoice = simulatePolicy(cleanParams(DEFAULTS), { kind: "choice", choices: 1, label: "one", seedSalt: 17 });
    check("one-choice helper matches random policy", arraysEqual(defaultResult.policies.random.loads, oneChoice.loads));

    var stale = evaluate({ servers: 192, load: 150, choices: 2, reportEvery: 48, seed: 41 });
    check("stale reporting still conserves all jobs", finiteSummary(stale.policies.two));
    check("stale load signal is finite and visible in metrics", isFinite(stale.policies.two.max) && stale.params.reportEvery === 48);

    var highD = evaluate({ servers: 192, load: 150, choices: 4, reportEvery: 1, seed: 41 });
    check("four choices improves or matches two-choice max in default scale", highD.policies.d.max <= defaultResult.policies.two.max, {
      four: highD.policies.d.max,
      two: defaultResult.policies.two.max
    });

    check("asymptotic yardsticks are positive", defaultResult.yardsticks.randomMaxAtUnitLoad > 0 &&
      defaultResult.yardsticks.choiceGapAtUnitLoad > 0, defaultResult.yardsticks);

    var gridCases = 0;
    var gridOk = 0;
    [32, 64, 193, 512].forEach(function (servers) {
      [50, 100, 175, 300].forEach(function (load) {
        [2, 3, 5].forEach(function (choices) {
          [1, 24].forEach(function (reportEvery) {
            [7, 83].forEach(function (seed) {
              gridCases += 1;
              var result = evaluate({
                servers: servers,
                load: load,
                choices: choices,
                reportEvery: reportEvery,
                seed: seed
              });
              var ok = result.jobs === Math.round(result.params.servers * result.params.load / 100) &&
                finiteSummary(result.policies.random) &&
                finiteSummary(result.policies.two) &&
                finiteSummary(result.policies.d) &&
                finiteSummary(result.policies.oracle) &&
                result.policies.random.histogram.length > 0;
              if (ok) gridOk += 1;
            });
          });
        });
      });
    });
    check("192-case allocation grid is numerically valid", gridCases === 192 && gridOk === 192, {
      gridCases: gridCases,
      gridOk: gridOk
    });

    return {
      ok: checked - failures.length,
      cases: checked,
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        jobs: defaultResult.jobs,
        randomMax: defaultResult.policies.random.max,
        twoMax: defaultResult.policies.two.max,
        oracleMax: defaultResult.policies.oracle.max,
        randomP99: defaultResult.policies.random.p99,
        twoP99: defaultResult.policies.two.p99,
        randomCv: defaultResult.policies.random.cv,
        twoCv: defaultResult.policies.two.cv,
        maxGapRatio: defaultResult.ratios.maxGap,
        randomYardstick: defaultResult.yardsticks.randomMaxAtUnitLoad,
        twoYardstick: defaultResult.yardsticks.choiceGapAtUnitLoad
      }
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits == null ? 2 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function formatPercent(value, digits) {
    return (value * 100).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="two-choice-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 620 ? 1080 : 820;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 21, COLORS.text, 13, 800);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, COLORS.muted, 11, 600);
  }

  function maxHistogramCount(histograms) {
    var best = 1;
    histograms.forEach(function (hist) {
      hist.forEach(function (count) { best = Math.max(best, count); });
    });
    return best;
  }

  function drawHistogram(ctx, box, result) {
    var random = result.policies.random.histogram;
    var selected = result.selected.histogram;
    var maxLoad = Math.max(random.length, selected.length) - 1;
    var maxCount = maxHistogramCount([random, selected]);
    var x = box.x + 34;
    var y = box.y + 68;
    var w = box.w - 54;
    var h = box.h - 104;
    var barW = Math.max(2, w / (maxLoad + 1));

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Final load histogram", "server counts by queue length");

    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var yy = y + h - g * h / 4;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
    }

    for (var load = 0; load <= maxLoad; load += 1) {
      var rx = x + load * barW;
      var rCount = random[load] || 0;
      var sCount = selected[load] || 0;
      ctx.fillStyle = "rgba(190, 18, 60, 0.48)";
      ctx.fillRect(rx, y + h - h * rCount / maxCount, Math.max(1, barW * 0.45), h * rCount / maxCount);
      ctx.fillStyle = "rgba(15, 118, 110, 0.70)";
      ctx.fillRect(rx + barW * 0.46, y + h - h * sCount / maxCount, Math.max(1, barW * 0.45), h * sCount / maxCount);
      if (barW > 15 && load % 2 === 0) drawText(ctx, String(load), rx + barW / 2, y + h + 14, COLORS.muted, 9, 700, "center");
    }

    drawText(ctx, "random", x + 2, box.y + box.h - 22, COLORS.random, 11, 800);
    drawText(ctx, result.selected.policy, x + 78, box.y + box.h - 22, COLORS.d, 11, 800);
    drawText(ctx, "load", x + w, y + h + 32, COLORS.muted, 10, 650, "right");
  }

  function drawTimeline(ctx, box, result) {
    var series = [
      { label: "random", data: result.policies.random.snapshots, color: COLORS.random },
      { label: "two choices", data: result.policies.two.snapshots, color: COLORS.two },
      { label: result.selected.policy, data: result.selected.snapshots, color: COLORS.d }
    ];
    var x = box.x + 42;
    var y = box.y + 68;
    var w = box.w - 62;
    var h = box.h - 102;
    var maxJob = Math.max(1, result.jobs);
    var maxLoad = Math.max(result.policies.random.max, result.policies.two.max, result.selected.max);

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Maximum load while jobs arrive", "the tail separates early");

    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var yy = y + h - g * h / 4;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      drawText(ctx, String(Math.round(g * maxLoad / 4)), x - 8, yy, COLORS.muted, 9, 700, "right");
    }

    series.forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      line.data.forEach(function (point, i) {
        var px = x + w * point.jobs / maxJob;
        var py = y + h - h * point.max / Math.max(1, maxLoad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    var lx = x + 4;
    series.forEach(function (line, i) {
      ctx.fillStyle = line.color;
      ctx.fillRect(lx + i * 110, box.y + box.h - 24, 12, 4);
      drawText(ctx, line.label, lx + i * 110 + 18, box.y + box.h - 22, COLORS.muted, 10, 750);
    });
  }

  function drawSortedLoads(ctx, box, result) {
    var loads = result.selected.loads.slice().sort(function (a, b) { return a - b; });
    var x = box.x + 20;
    var y = box.y + 66;
    var w = box.w - 40;
    var h = box.h - 100;
    var maxLoad = Math.max(1, loads[loads.length - 1]);
    var barW = Math.max(1, w / loads.length);
    var avgY = y + h - h * result.selected.avg / maxLoad;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Sorted selected-policy loads", "how much of the fleet sits near the mean");

    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(x, avgY);
    ctx.lineTo(x + w, avgY);
    ctx.stroke();
    drawText(ctx, "avg " + formatNumber(result.selected.avg, 2), x + w, avgY - 10, COLORS.muted, 10, 650, "right");

    loads.forEach(function (load, i) {
      var bx = x + i * barW;
      var bh = h * load / maxLoad;
      var t = load / maxLoad;
      ctx.fillStyle = t > 0.9 ? COLORS.random : (t > 0.75 ? COLORS.stale : COLORS.d);
      ctx.fillRect(bx, y + h - bh, Math.max(1, barW - 0.25), bh);
    });

    drawText(ctx, "server rank", x + w, y + h + 22, COLORS.muted, 10, 650, "right");
  }

  function drawPolicyTable(ctx, box, result) {
    var rows = [
      { name: "random", item: result.policies.random, color: COLORS.random },
      { name: "two", item: result.policies.two, color: COLORS.two },
      { name: result.selected.policy, item: result.selected, color: COLORS.d },
      { name: "least-loaded", item: result.policies.oracle, color: COLORS.oracle }
    ];
    var x = box.x + 18;
    var y = box.y + 66;
    var col = [0, box.w * 0.31, box.w * 0.50, box.w * 0.67, box.w * 0.83];
    var rowH = 31;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Policy ledger", "final load statistics after " + result.jobs + " arrivals");
    ["policy", "max", "p99", "cv", "hot"].forEach(function (head, i) {
      drawText(ctx, head, x + col[i], y - 14, COLORS.muted, 10, 800);
    });

    rows.forEach(function (row, i) {
      var yy = y + i * rowH;
      ctx.fillStyle = i % 2 ? "#ffffff" : "rgba(237,242,247,0.6)";
      ctx.fillRect(box.x + 10, yy - 13, box.w - 20, rowH - 2);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy - 6, 8, 8);
      drawText(ctx, row.name, x + 14, yy, COLORS.text, 11, 750);
      drawText(ctx, String(row.item.max), x + col[1], yy, COLORS.text, 11, 750);
      drawText(ctx, String(row.item.p99), x + col[2], yy, COLORS.text, 11, 750);
      drawText(ctx, formatNumber(row.item.cv, 2), x + col[3], yy, COLORS.text, 11, 750);
      drawText(ctx, String(row.item.overloaded), x + col[4], yy, COLORS.text, 11, 750);
    });

    var noteY = y + rows.length * rowH + 18;
    drawText(ctx, "report interval: " + result.params.reportEvery + " arrivals", x, noteY, COLORS.muted, 11, 650);
    drawText(ctx, "unit-load yardsticks: random max ~ " +
      formatNumber(result.yardsticks.randomMaxAtUnitLoad, 2) +
      ", d-choice gap ~ " + formatNumber(result.yardsticks.choiceGapAtUnitLoad, 2),
      x, noteY + 20, COLORS.muted, 11, 650);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    var gap = 14;
    if (w < 620) {
      var panelH = (h - 5 * gap) / 4;
      drawHistogram(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawTimeline(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawSortedLoads(ctx, { x: 0, y: 2 * (panelH + gap), w: w, h: panelH }, result);
      drawPolicyTable(ctx, { x: 0, y: 3 * (panelH + gap), w: w, h: panelH }, result);
      return;
    }

    var topH = 382;
    var bottomH = h - topH - gap;
    drawHistogram(ctx, { x: 0, y: 0, w: w * 0.52 - gap / 2, h: topH }, result);
    drawTimeline(ctx, { x: w * 0.52 + gap / 2, y: 0, w: w * 0.48 - gap / 2, h: topH }, result);
    drawSortedLoads(ctx, { x: 0, y: topH + gap, w: w * 0.48 - gap / 2, h: bottomH }, result);
    drawPolicyTable(ctx, { x: w * 0.48 + gap / 2, y: topH + gap, w: w * 0.52 - gap / 2, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      var value = params[key];
      if (key === "load") value = params.load + "%";
      output.textContent = value;
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(container, result.params);

    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      var audit = cachedAudit();
      metrics.innerHTML = [
        metric("jobs", formatNumber(result.jobs, 0)),
        metric("random max", String(result.policies.random.max)),
        metric(result.selected.policy + " max", String(result.selected.max)),
        metric("p99 gap ratio", formatNumber(result.ratios.p99Gap, 1) + "x"),
        metric("hot servers", String(result.selected.overloaded)),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }

    draw(result, container.querySelector("canvas[data-canvas]"));
  }

  function mount(container) {
    var schedule = null;
    function requestRender() {
      if (schedule != null) root.cancelAnimationFrame(schedule);
      schedule = root.requestAnimationFrame(function () {
        schedule = null;
        render(container);
      });
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });

    root.addEventListener("resize", requestRender);
    requestRender();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cleanParams: cleanParams,
    evaluate: evaluate,
    runAudit: runAudit,
    simulatePolicy: simulatePolicy
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TwoChoiceLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-two-choice-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-two-choice-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
