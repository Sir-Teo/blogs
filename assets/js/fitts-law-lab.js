(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    target: "#0f766e",
    path: "#2563eb",
    miss: "#be123c",
    endpoint: "#7c3aed",
    width: "#b45309",
    throughput: "#0f766e",
    warning: "#d97706",
    white: "#ffffff"
  };

  var DEFAULTS = {
    amplitude: 420,
    width: 44,
    urgency: 28,
    motorNoise: 6,
    trials: 180
  };

  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function close(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  function finiteNumber(value) {
    return Number.isFinite(value);
  }

  function monotoneNonincreasing(values, tolerance) {
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] > values[i - 1] + tolerance) return false;
    }
    return true;
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      amplitude: Math.round(clamp(numeric(raw, "amplitude"), 120, 760)),
      width: Math.round(clamp(numeric(raw, "width"), 12, 160)),
      urgency: Math.round(clamp(numeric(raw, "urgency"), 0, 100)),
      motorNoise: Math.round(clamp(numeric(raw, "motorNoise"), 0, 28)),
      trials: Math.round(clamp(numeric(raw, "trials"), 60, 420))
    };
  }

  function log2(value) {
    return Math.log(value) / Math.LN2;
  }

  function indexOfDifficulty(amplitude, width) {
    return log2(amplitude / Math.max(1, width) + 1);
  }

  function hash32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rand(seed, index) {
    return (hash32((seed + index * 0x9e3779b9) | 0) + 0.5) / 4294967297;
  }

  function normal(seed, index) {
    var u = Math.max(1e-9, rand(seed, index * 2));
    var v = rand(seed, index * 2 + 1);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function sd(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var variance = values.reduce(function (sum, value) {
      return sum + (value - m) * (value - m);
    }, 0) / (values.length - 1);
    return Math.sqrt(Math.max(0, variance));
  }

  function countHits(rows) {
    return rows.reduce(function (hits, row) { return hits + (row.hit ? 1 : 0); }, 0);
  }

  function finiteRows(rows) {
    return rows.every(function (row) {
      return finiteNumber(row.x) && finiteNumber(row.y) && finiteNumber(row.mt) && typeof row.hit === "boolean";
    });
  }

  function correlation(xs, ys) {
    var xMean = mean(xs);
    var yMean = mean(ys);
    var numerator = 0;
    var xVar = 0;
    var yVar = 0;
    xs.forEach(function (x, i) {
      var dx = x - xMean;
      var dy = ys[i] - yMean;
      numerator += dx * dy;
      xVar += dx * dx;
      yVar += dy * dy;
    });
    return numerator / Math.max(1e-12, Math.sqrt(xVar * yVar));
  }

  function movementModel(params) {
    var id = indexOfDifficulty(params.amplitude, params.width);
    var urgency = params.urgency / 100;
    var baselineMt = 125 + 150 * id;
    var meanMt = baselineMt * (1 - 0.48 * urgency);
    var targetSpread = params.width / 4.133 * (0.74 + 0.55 * urgency);
    var noiseSpread = params.motorNoise * (0.55 + 1.85 * urgency);
    var endpointSd = Math.sqrt(targetSpread * targetSpread + noiseSpread * noiseSpread);
    var bias = params.motorNoise * urgency * urgency * 0.32;
    return {
      id: id,
      baselineMt: baselineMt,
      meanMt: Math.max(95, meanMt),
      endpointSd: Math.max(0.2, endpointSd),
      bias: bias
    };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var model = movementModel(params);
    var seed = Math.round(params.amplitude * 13 + params.width * 41 + params.urgency * 101 + params.motorNoise * 409);
    var rows = [];
    var xs = [];
    var mts = [];
    var hits = 0;
    for (var i = 0; i < params.trials; i += 1) {
      var nx = normal(seed, i + 17);
      var ny = normal(seed ^ 0x51f15, i + 31);
      var nt = normal(seed ^ 0xa11ce, i + 43);
      var x = model.bias + model.endpointSd * nx;
      var y = model.endpointSd * 0.42 * ny;
      var hit = Math.abs(x) <= params.width / 2;
      var mt = model.meanMt * (1 + 0.055 * nt + 0.018 * Math.max(0, Math.abs(nx) - 0.8));
      mt = clamp(mt, 80, 1800);
      if (hit) hits += 1;
      xs.push(x);
      mts.push(mt);
      rows.push({ x: x, y: y, hit: hit, mt: mt });
    }
    var observedSd = sd(xs);
    var effectiveWidth = Math.max(1, 4.133 * observedSd);
    var effectiveId = indexOfDifficulty(params.amplitude, effectiveWidth);
    var meanMt = mean(mts);
    return {
      params: params,
      model: model,
      rows: rows,
      summary: {
        id: model.id,
        meanMt: meanMt,
        missRate: 1 - hits / params.trials,
        effectiveWidth: effectiveWidth,
        effectiveId: effectiveId,
        throughput: effectiveId / Math.max(0.001, meanMt / 1000),
        endpointSd: observedSd,
        plannedEndpointSd: model.endpointSd,
        hitCount: hits
      }
    };
  }

  function urgencySweep(params) {
    var rows = [];
    for (var u = 0; u <= 100; u += 5) {
      var sim = simulate(Object.assign({}, params, { urgency: u, trials: 160 }));
      rows.push({
        urgency: u,
        throughput: sim.summary.throughput,
        missRate: sim.summary.missRate,
        meanMt: sim.summary.meanMt
      });
    }
    return rows;
  }

  function geometrySweep(params) {
    var rows = [];
    var amplitudes = [160, 240, 340, 480, 660];
    var widths = [18, 28, 44, 70, 110];
    amplitudes.forEach(function (amplitude) {
      widths.forEach(function (width) {
        var p = Object.assign({}, params, { amplitude: amplitude, width: width, urgency: 20, trials: 120 });
        var sim = simulate(p);
        rows.push({
          amplitude: amplitude,
          width: width,
          id: sim.summary.id,
          mt: sim.summary.meanMt
        });
      });
    });
    return rows;
  }

  function evaluate(raw) {
    var result = simulate(raw);
    result.urgencySweep = urgencySweep(result.params);
    result.geometrySweep = geometrySweep(result.params);
    return result;
  }

  function runAudit() {
    var checks = [];
    var tolerance = 1e-9;
    function check(name, passed, detail) {
      checks.push({ name: name, passed: Boolean(passed), detail: detail || "" });
    }

    var clamped = cleanParams({ amplitude: 999, width: -4, urgency: 333, motorNoise: 99, trials: 999 });
    check("parameter clamps", clamped.amplitude === 760 && clamped.width === 12 && clamped.urgency === 100 && clamped.motorNoise === 28 && clamped.trials === 420);

    var fallback = cleanParams({ amplitude: "x", width: "x", urgency: "x", motorNoise: "x", trials: "x" });
    check("default fallbacks", fallback.amplitude === DEFAULTS.amplitude && fallback.width === DEFAULTS.width && fallback.urgency === DEFAULTS.urgency && fallback.motorNoise === DEFAULTS.motorNoise && fallback.trials === DEFAULTS.trials);

    check("Shannon ID formula", close(indexOfDifficulty(420, 44), log2(420 / 44 + 1), tolerance));
    check("ID rises with amplitude", indexOfDifficulty(760, 44) > indexOfDifficulty(120, 44));
    check("ID falls with width", indexOfDifficulty(420, 12) > indexOfDifficulty(420, 160));

    var defaultA = simulate(DEFAULTS);
    var defaultB = simulate(DEFAULTS);
    check("deterministic replay", JSON.stringify(defaultA.summary) === JSON.stringify(defaultB.summary) && JSON.stringify(defaultA.rows.slice(0, 8)) === JSON.stringify(defaultB.rows.slice(0, 8)));
    check("trial ledger length", defaultA.rows.length === defaultA.params.trials);
    check("finite trial ledger", finiteRows(defaultA.rows));

    var hits = countHits(defaultA.rows);
    check("hit count ledger", hits === defaultA.summary.hitCount);
    check("miss-rate arithmetic", close(defaultA.summary.missRate, 1 - hits / defaultA.params.trials, tolerance));
    check("effective-width arithmetic", close(defaultA.summary.effectiveWidth, Math.max(1, 4.133 * defaultA.summary.endpointSd), tolerance));
    check("effective-ID arithmetic", close(defaultA.summary.effectiveId, indexOfDifficulty(defaultA.params.amplitude, defaultA.summary.effectiveWidth), tolerance));
    check("throughput arithmetic", close(defaultA.summary.throughput, defaultA.summary.effectiveId / (defaultA.summary.meanMt / 1000), tolerance));
    check("movement-time bounds", defaultA.rows.every(function (row) { return row.mt >= 80 && row.mt <= 1800; }));

    var wide = simulate({ width: 160 });
    var narrow = simulate({ width: 12 });
    check("narrow targets are harder", narrow.summary.id > wide.summary.id && narrow.summary.meanMt > wide.summary.meanMt && narrow.summary.missRate > wide.summary.missRate);

    var short = simulate({ amplitude: 120, width: 44 });
    var long = simulate({ amplitude: 760, width: 44 });
    check("longer amplitudes are slower", long.summary.id > short.summary.id && long.summary.meanMt > short.summary.meanMt);

    var calm = simulate({ urgency: 0, motorNoise: 6 });
    var urgent = simulate({ urgency: 100, motorNoise: 6 });
    check("urgency spends accuracy", urgent.summary.meanMt < calm.summary.meanMt && urgent.summary.endpointSd > calm.summary.endpointSd && urgent.summary.missRate > calm.summary.missRate);

    var noNoise = simulate({ motorNoise: 0 });
    var highNoise = simulate({ motorNoise: 28 });
    check("motor noise widens endpoints", highNoise.summary.endpointSd > noNoise.summary.endpointSd && highNoise.summary.missRate > noNoise.summary.missRate && highNoise.summary.throughput < noNoise.summary.throughput);

    var urgencyRows = urgencySweep(DEFAULTS);
    check("urgency sweep shape", urgencyRows.length === 21 && urgencyRows[0].urgency === 0 && urgencyRows[urgencyRows.length - 1].urgency === 100);
    check("urgency sweep finite", urgencyRows.every(function (row) {
      return finiteNumber(row.throughput) && finiteNumber(row.missRate) && finiteNumber(row.meanMt);
    }));
    check("urgency sweep shortens movement", monotoneNonincreasing(urgencyRows.map(function (row) { return row.meanMt; }), tolerance));
    check("urgency endpoint tradeoff", urgencyRows[urgencyRows.length - 1].missRate > urgencyRows[0].missRate);

    var geometryRows = geometrySweep(DEFAULTS);
    check("geometry sweep shape", geometryRows.length === 25);
    check("geometry sweep finite", geometryRows.every(function (row) {
      return finiteNumber(row.amplitude) && finiteNumber(row.width) && finiteNumber(row.id) && finiteNumber(row.mt);
    }));
    check("geometry predicts movement time", correlation(
      geometryRows.map(function (row) { return row.id; }),
      geometryRows.map(function (row) { return row.mt; })
    ) > 0.97);

    var failures = checks.filter(function (item) { return !item.passed; });
    return {
      ok: failures.length === 0,
      passed: checks.length - failures.length,
      checked: checks.length,
      failures: failures,
      checks: checks
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatMs(value) {
    return Math.round(value) + " ms";
  }

  function formatPx(value) {
    return value.toFixed(value >= 100 ? 0 : 1) + " px";
  }

  function formatBits(value) {
    return value.toFixed(2) + " bits";
  }

  function formatPct(value) {
    return (100 * value).toFixed(value >= 0.1 ? 0 : 1) + "%";
  }

  function metric(label, value) {
    return '<div class="fitts-law-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(root, params) {
    var display = {
      amplitude: formatPx(params.amplitude),
      width: formatPx(params.width),
      urgency: params.urgency + "%",
      motorNoise: formatPx(params.motorNoise),
      trials: String(params.trials)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, width: width, height: targetHeight };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 12, box.y + 21);
  }

  function fitText(ctx, text, x, y, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    var out = text;
    while (out.length > 4 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    ctx.fillText(out + "...", x, y);
  }

  function drawGeometry(ctx, result, box) {
    panel(ctx, box, "1. A pointing task is distance plus tolerance");
    var params = result.params;
    var left = box.x + 36;
    var right = box.x + box.w - 38;
    var midY = box.y + box.h * 0.53;
    var scale = (right - left) / params.amplitude;
    var targetX = left + params.amplitude * scale;
    var targetW = Math.max(8, params.width * scale);
    var targetH = Math.min(92, Math.max(42, targetW * 1.9));

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(targetX, midY);
    ctx.stroke();
    ctx.fillStyle = COLORS.path;
    ctx.beginPath();
    ctx.arc(left, midY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(15,118,110,0.12)";
    ctx.fillRect(targetX - targetW / 2, midY - targetH / 2, targetW, targetH);
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 2;
    ctx.strokeRect(targetX - targetW / 2, midY - targetH / 2, targetW, targetH);

    result.rows.slice(0, 140).forEach(function (row) {
      var x = targetX + row.x * scale;
      var y = midY + row.y * scale;
      ctx.fillStyle = row.hit ? "rgba(124,58,237,0.52)" : "rgba(190,18,60,0.75)";
      ctx.beginPath();
      ctx.arc(x, y, row.hit ? 2.3 : 3.1, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, "A = " + formatPx(params.amplitude), left + 16, midY - 15, box.w - 70);
    fitText(ctx, "W = " + formatPx(params.width), Math.max(box.x + 12, targetX - 34), midY + targetH / 2 + 18, 100);
  }

  function drawFit(ctx, result, box) {
    panel(ctx, box, "2. Difficulty predicts movement time");
    var plot = { x: box.x + 44, y: box.y + 42, w: box.w - 62, h: box.h - 76 };
    var rows = result.geometrySweep;
    var maxId = Math.max.apply(null, rows.map(function (row) { return row.id; }).concat([result.summary.id])) * 1.08;
    var maxMt = Math.max.apply(null, rows.map(function (row) { return row.mt; }).concat([result.summary.meanMt])) * 1.08;
    var x = function (id) { return plot.x + id / maxId * plot.w; };
    var y = function (mt) { return plot.y + plot.h - mt / maxMt * plot.h; };

    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    rows.forEach(function (row) {
      ctx.fillStyle = "rgba(37,99,235,0.42)";
      ctx.beginPath();
      ctx.arc(x(row.id), y(row.mt), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var id = 0.5; id <= maxId; id += 0.1) {
      var mt = 125 + 150 * id;
      var px = x(id);
      var py = y(mt * (1 - 0.48 * 0.2));
      if (id === 0.5) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = COLORS.miss;
    ctx.beginPath();
    ctx.arc(x(result.summary.id), y(result.summary.meanMt), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("ID (bits)", plot.x + plot.w - 45, plot.y + plot.h + 26);
    ctx.save();
    ctx.translate(plot.x - 28, plot.y + 76);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("movement time", 0, 0);
    ctx.restore();
  }

  function drawEndpointSpread(ctx, result, box) {
    panel(ctx, box, "3. Effective width comes from what users actually do");
    var plot = { x: box.x + 34, y: box.y + 52, w: box.w - 56, h: box.h - 90 };
    var half = Math.max(result.params.width, result.summary.effectiveWidth) * 0.9;
    var bins = 28;
    var counts = new Array(bins).fill(0);
    result.rows.forEach(function (row) {
      var t = clamp((row.x + half) / (2 * half), 0, 0.999999);
      counts[Math.floor(t * bins)] += 1;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    counts.forEach(function (count, i) {
      var x = plot.x + i / bins * plot.w;
      var w = Math.ceil(plot.w / bins);
      var h = count / maxCount * plot.h;
      ctx.fillStyle = "rgba(124,58,237,0.58)";
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
    });
    var zero = plot.x + plot.w / 2;
    var targetLeft = zero - result.params.width / 2 / half * plot.w / 2;
    var targetRight = zero + result.params.width / 2 / half * plot.w / 2;
    var effLeft = zero - result.summary.effectiveWidth / 2 / half * plot.w / 2;
    var effRight = zero + result.summary.effectiveWidth / 2 / half * plot.w / 2;
    ctx.strokeStyle = COLORS.target;
    ctx.lineWidth = 2;
    ctx.strokeRect(targetLeft, plot.y, targetRight - targetLeft, plot.h);
    ctx.strokeStyle = COLORS.width;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(effLeft, plot.y + 6, effRight - effLeft, plot.h - 12);
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, "green = target width, amber = 4.133 x observed SD", plot.x, box.y + box.h - 24, plot.w);
  }

  function drawUrgency(ctx, result, box) {
    panel(ctx, box, "4. Going faster can spend accuracy");
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 62, h: box.h - 76 };
    var rows = result.urgencySweep;
    var maxTp = Math.max.apply(null, rows.map(function (row) { return row.throughput; })) * 1.15;
    var maxMiss = Math.max(0.05, Math.max.apply(null, rows.map(function (row) { return row.missRate; })) * 1.15);
    var x = function (u) { return plot.x + u / 100 * plot.w; };
    var yTp = function (tp) { return plot.y + plot.h - tp / maxTp * plot.h; };
    var yMiss = function (m) { return plot.y + plot.h - m / maxMiss * plot.h; };
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    function path(key, yFn, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var px = x(row.urgency);
        var py = yFn(row[key]);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    path("throughput", yTp, COLORS.throughput);
    path("missRate", yMiss, COLORS.miss);
    var cx = x(result.params.urgency);
    ctx.strokeStyle = COLORS.text;
    ctx.beginPath();
    ctx.moveTo(cx, plot.y);
    ctx.lineTo(cx, plot.y + plot.h);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("green throughput, red miss rate", plot.x, plot.y + plot.h + 26);
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 620;
    var setup = setupCanvas(canvas, compact ? 1040 : 720);
    var ctx = setup.ctx;
    var pad = compact ? 18 : 28;
    var gap = compact ? 20 : 24;
    var innerW = setup.width - pad * 2;
    if (compact) {
      var h = 232;
      drawGeometry(ctx, result, { x: pad, y: 22, w: innerW, h: h });
      drawFit(ctx, result, { x: pad, y: 22 + h + gap, w: innerW, h: h });
      drawEndpointSpread(ctx, result, { x: pad, y: 22 + 2 * (h + gap), w: innerW, h: h });
      drawUrgency(ctx, result, { x: pad, y: 22 + 3 * (h + gap), w: innerW, h: h });
      return;
    }
    var colW = (innerW - gap) / 2;
    var rowH = 306;
    drawGeometry(ctx, result, { x: pad, y: 26, w: colW, h: rowH });
    drawFit(ctx, result, { x: pad + colW + gap, y: 26, w: colW, h: rowH });
    drawEndpointSpread(ctx, result, { x: pad, y: 26 + rowH + gap, w: colW, h: rowH });
    drawUrgency(ctx, result, { x: pad + colW + gap, y: 26 + rowH + gap, w: colW, h: rowH });
  }

  function renderMetrics(root, result) {
    var audit = cachedAudit();
    var html = [
      metric("nominal ID", formatBits(result.summary.id)),
      metric("mean movement", formatMs(result.summary.meanMt)),
      metric("miss rate", formatPct(result.summary.missRate)),
      metric("effective width", formatPx(result.summary.effectiveWidth)),
      metric("effective ID", formatBits(result.summary.effectiveId)),
      metric("throughput", result.summary.throughput.toFixed(2) + " bps"),
      metric("audit", audit.passed + "/" + audit.checked)
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (String(input.value) !== String(params[key])) input.value = params[key];
    });
    var result = evaluate(params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
    root.__fittsLawLast = result;
  }

  function initOne(root) {
    if (root.__fittsLawReady) return;
    root.__fittsLawReady = true;
    var pending = null;
    var schedule = function () {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () {
        pending = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render(root);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-fitts-law-lab]")).forEach(initOne);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  global.FittsLawLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    indexOfDifficulty: indexOfDifficulty,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FittsLawLab;
  }
})(typeof window !== "undefined" ? window : globalThis);
