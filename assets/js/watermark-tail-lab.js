(function (global) {
  "use strict";

  var V = 64;
  var DISPLAY_TRIALS = 96;
  var SWEEP_TRIALS = 32;
  var QUALITY_POINTS = 18;
  var QUALITY_TRIALS = 14;
  var AUDIT_CACHE = null;
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    null: "#64748b",
    marked: "#0f766e",
    attacked: "#be123c",
    threshold: "#7c3aed",
    green: "#0f766e",
    red: "#e2e8f0",
    edit: "#f59e0b",
    human: "#2563eb",
    quality: "#b45309"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function randUnit(seed, a, b, c) {
    var x = seed >>> 0;
    x ^= Math.imul((a + 1) >>> 0, 0x9e3779b1);
    x ^= Math.imul((b + 17) >>> 0, 0x85ebca6b);
    x ^= Math.imul((c + 97) >>> 0, 0xc2b2ae35);
    return mix32(x) / 4294967296;
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

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="watermark-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function paramsFromLab(lab) {
    function read(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return Number.isFinite(value) ? value : fallback;
    }
    return {
      seed: Math.round(read("seed", 7)),
      tokens: Math.round(read("tokens", 240)),
      gamma: clamp(read("gamma", 25), 5, 50) / 100,
      bias: clamp(read("bias", 1.6), 0, 3.5),
      entropy: clamp(read("entropy", 68), 0, 100) / 100,
      edits: clamp(read("edits", 20), 0, 90) / 100,
      human: clamp(read("human", 25), 0, 90) / 100,
      threshold: clamp(read("threshold", 4.0), 1.5, 6.0)
    };
  }

  function baseDistribution(pos, params) {
    var center = Math.floor(randUnit(params.seed + 311, pos, 0, 0) * V);
    var sharpness = 0.08 + 3.15 * (1 - params.entropy);
    var logits = [];
    var i;
    for (i = 0; i < V; i += 1) {
      var d = Math.abs(i - center);
      d = Math.min(d, V - d);
      var ripple = (randUnit(params.seed + 911, pos, i, 0) * 2 - 1) * (0.10 + 0.30 * params.entropy);
      logits.push(-sharpness * d + ripple);
    }
    var maxLogit = Math.max.apply(Math, logits);
    var exps = logits.map(function (l) { return Math.exp(l - maxLogit); });
    var total = exps.reduce(function (sum, v) { return sum + v; }, 0);
    return exps.map(function (v) { return v / total; });
  }

  function isGreen(pos, token, params) {
    return randUnit(params.seed + 1709, pos, token, 5) < params.gamma;
  }

  function biasedDistribution(base, pos, params) {
    if (params.bias <= 0) return base.slice();
    var out = [];
    var total = 0;
    var boost = Math.exp(params.bias);
    for (var i = 0; i < base.length; i += 1) {
      var v = base[i] * (isGreen(pos, i, params) ? boost : 1);
      out.push(v);
      total += v;
    }
    return out.map(function (v) { return v / total; });
  }

  function sample(dist, random) {
    var r = random();
    var acc = 0;
    for (var i = 0; i < dist.length; i += 1) {
      acc += dist[i];
      if (r <= acc) return i;
    }
    return dist.length - 1;
  }

  function kl(q, p) {
    var total = 0;
    for (var i = 0; i < q.length; i += 1) {
      if (q[i] > 0 && p[i] > 0) total += q[i] * Math.log(q[i] / p[i]);
    }
    return total;
  }

  function normalCdf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    var t = 1 / (1 + 0.3275911 * x);
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
  }

  function normalTail(z) {
    return Math.max(0, Math.min(1, 1 - normalCdf(z)));
  }

  function score(greenCount, tokens, gamma) {
    return (greenCount - gamma * tokens) / Math.sqrt(Math.max(1e-9, tokens * gamma * (1 - gamma)));
  }

  function generate(mode, params, trial) {
    var random = rng(params.seed * 1000003 + trial * 9176 + (mode === "null" ? 11 : mode === "marked" ? 29 : 53));
    var greenCount = 0;
    var tax = 0;
    var tape = [];
    var active = 0;
    var edited = 0;
    var human = 0;
    for (var pos = 0; pos < params.tokens; pos += 1) {
      var base = baseDistribution(pos, params);
      var markedPosition = mode !== "null";
      var isHuman = false;
      var isEdit = false;
      if (mode === "attacked" && random() < params.human) {
        markedPosition = false;
        isHuman = true;
        human += 1;
      }
      var dist = markedPosition ? biasedDistribution(base, pos, params) : base;
      if (markedPosition) {
        active += 1;
        tax += kl(dist, base);
      }
      var token = sample(dist, random);
      if (mode === "attacked" && markedPosition && random() < params.edits) {
        token = sample(base, random);
        isEdit = true;
        edited += 1;
      }
      var green = isGreen(pos, token, params);
      if (green) greenCount += 1;
      if (pos < 180) {
        tape.push({
          token: token,
          green: green,
          human: isHuman,
          edit: isEdit,
          marked: markedPosition
        });
      }
    }
    return {
      mode: mode,
      z: score(greenCount, params.tokens, params.gamma),
      greenCount: greenCount,
      greenShare: greenCount / params.tokens,
      pValue: normalTail(score(greenCount, params.tokens, params.gamma)),
      qualityTax: active ? tax / active : 0,
      activeShare: active / params.tokens,
      editShare: edited / params.tokens,
      humanShare: human / params.tokens,
      tape: tape
    };
  }

  function monteCarlo(params, trials) {
    var n = trials || 240;
    var rows = {
      nulls: [],
      marked: [],
      attacked: []
    };
    for (var i = 0; i < n; i += 1) {
      rows.nulls.push(generate("null", params, i));
      rows.marked.push(generate("marked", params, i));
      rows.attacked.push(generate("attacked", params, i));
    }
    return rows;
  }

  function summarize(rows, threshold) {
    function power(list) {
      return list.reduce(function (sum, row) { return sum + (row.z >= threshold ? 1 : 0); }, 0) / list.length;
    }
    function mean(list, key) {
      return list.reduce(function (sum, row) { return sum + row[key]; }, 0) / list.length;
    }
    return {
      falsePositive: power(rows.nulls),
      markedPower: power(rows.marked),
      attackedPower: power(rows.attacked),
      meanMarkedZ: mean(rows.marked, "z"),
      meanAttackedZ: mean(rows.attacked, "z"),
      meanTax: mean(rows.marked, "qualityTax")
    };
  }

  function sweepTokens(params) {
    var values = [40, 80, 120, 180, 260, 380, 560, 800, 1100];
    return values.map(function (tokens) {
      var p = Object.assign({}, params, { tokens: tokens });
      var rows = monteCarlo(p, SWEEP_TRIALS);
      var s = summarize(rows, params.threshold);
      return {
        tokens: tokens,
        markedPower: s.markedPower,
        attackedPower: s.attackedPower,
        falsePositive: s.falsePositive
      };
    });
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function simulate(params) {
    var rows = monteCarlo(params, DISPLAY_TRIALS);
    var one = {
      nulls: generate("null", params, 1001),
      marked: generate("marked", params, 1002),
      attacked: generate("attacked", params, 1003)
    };
    return {
      params: params,
      rows: rows,
      one: one,
      summary: summarize(rows, params.threshold),
      sweep: sweepTokens(params),
      audit: cachedAudit()
    };
  }

  function runAudit() {
    var ok = 0;
    var cases = 0;
    [3, 7, 19, 31].forEach(function (seed) {
      [0.15, 0.25, 0.40].forEach(function (gamma) {
        [0.0, 1.2, 2.4].forEach(function (bias) {
          [0.25, 0.75].forEach(function (entropy) {
            [0, 0.35].forEach(function (edits) {
              cases += 1;
              var params = {
                seed: seed,
                tokens: 160,
                gamma: gamma,
                bias: bias,
                entropy: entropy,
                edits: edits,
                human: 0.20,
                threshold: 3.0
              };
              var nullRun = generate("null", params, 1);
              var markedRun = generate("marked", params, 2);
              var attackedRun = generate("attacked", params, 3);
              var valid = [nullRun, markedRun, attackedRun].every(function (row) {
                return Number.isFinite(row.z) &&
                  Number.isFinite(row.greenShare) &&
                  row.greenShare >= 0 &&
                  row.greenShare <= 1 &&
                  Number.isFinite(row.pValue) &&
                  row.pValue >= 0 &&
                  row.pValue <= 1 &&
                  row.tape.length <= 180;
              }) && Math.abs(score(params.gamma * params.tokens, params.tokens, params.gamma)) < 1e-9;
              if (valid) ok += 1;
            });
          });
        });
      });
    });
    return { ok: ok, cases: cases };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawText(ctx, title, box.x, box.y - 14, COLORS.text, 12, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + box.w, box.y - 14, COLORS.muted, 11, 550, "right");
  }

  function histogram(ctx, lists, box, threshold) {
    panel(ctx, box, "Detector tail", "z-score distributions over repeated documents");
    var minZ = -4;
    var maxZ = 10;
    var bins = 28;
    var maxCount = 1;
    var hist = lists.map(function (entry) {
      var counts = new Array(bins).fill(0);
      entry.rows.forEach(function (row) {
        var idx = Math.floor((clamp(row.z, minZ, maxZ - 1e-9) - minZ) / (maxZ - minZ) * bins);
        counts[idx] += 1;
      });
      maxCount = Math.max(maxCount, Math.max.apply(Math, counts));
      return { label: entry.label, color: entry.color, counts: counts };
    });
    var plot = { x: box.x + 38, y: box.y + 22, w: box.w - 58, h: box.h - 54 };
    ctx.strokeStyle = COLORS.faint;
    [-2, 0, 2, 4, 6, 8].forEach(function (tick) {
      var x = plot.x + (tick - minZ) / (maxZ - minZ) * plot.w;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      drawText(ctx, String(tick), x, plot.y + plot.h + 16, COLORS.muted, 10, 550, "center");
    });
    hist.forEach(function (entry, j) {
      ctx.fillStyle = entry.color;
      ctx.globalAlpha = 0.48;
      entry.counts.forEach(function (count, i) {
        var x = plot.x + i / bins * plot.w + j * 2;
        var bw = plot.w / bins - 2;
        var h = count / maxCount * plot.h;
        ctx.fillRect(x, plot.y + plot.h - h, bw, h);
      });
      ctx.globalAlpha = 1;
    });
    var tx = plot.x + (threshold - minZ) / (maxZ - minZ) * plot.w;
    ctx.strokeStyle = COLORS.threshold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, plot.y - 3);
    ctx.lineTo(tx, plot.y + plot.h + 4);
    ctx.stroke();
    ctx.lineWidth = 1;
    drawText(ctx, "threshold", tx + 6, plot.y + 10, COLORS.threshold, 10, 750);
    lists.forEach(function (entry, i) {
      drawText(ctx, entry.label, plot.x + 8 + i * 104, box.y + 16, entry.color, 11, 750);
    });
    drawText(ctx, "z-score", plot.x + plot.w, box.y + box.h - 12, COLORS.muted, 10, 550, "right");
  }

  function drawSweep(ctx, rows, box) {
    panel(ctx, box, "Power needs length", "short text is evidence-poor");
    var plot = { x: box.x + 42, y: box.y + 25, w: box.w - 62, h: box.h - 56 };
    ctx.strokeStyle = COLORS.faint;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(Math.round(tick * 100)), plot.x - 8, y, COLORS.muted, 10, 550, "right");
    });
    var minT = rows[0].tokens;
    var maxT = rows[rows.length - 1].tokens;
    function sx(t) {
      return plot.x + (Math.log(t) - Math.log(minT)) / (Math.log(maxT) - Math.log(minT)) * plot.w;
    }
    function sy(p) {
      return plot.y + plot.h - p * plot.h;
    }
    function line(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        var x = sx(row.tokens);
        var y = sy(row[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      rows.forEach(function (row) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx(row.tokens), sy(row[key]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.lineWidth = 1;
    }
    line("markedPower", COLORS.marked);
    line("attackedPower", COLORS.attacked);
    drawText(ctx, "clean", plot.x + 8, plot.y + 12, COLORS.marked, 11, 750);
    drawText(ctx, "edited/mixed", plot.x + 70, plot.y + 12, COLORS.attacked, 11, 750);
    drawText(ctx, String(minT), plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 550, "center");
    drawText(ctx, maxT + " tokens", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 550, "right");
  }

  function drawTape(ctx, row, box) {
    panel(ctx, box, "One attacked document", "green hits, edits, and human spans");
    var cols = 45;
    var size = 8;
    var gap = 4;
    var x0 = box.x + 16;
    var y0 = box.y + 26;
    row.tape.forEach(function (item, i) {
      var col = i % cols;
      var rowIndex = Math.floor(i / cols);
      var x = x0 + col * (size + gap);
      var y = y0 + rowIndex * (size + gap);
      if (item.human) ctx.fillStyle = COLORS.human;
      else if (item.edit) ctx.fillStyle = COLORS.edit;
      else ctx.fillStyle = item.green ? COLORS.green : COLORS.red;
      ctx.fillRect(x, y, size, size);
    });
    drawText(ctx, "z = " + formatNumber(row.z, 2) + ", green share = " + formatPercent(row.greenShare, 1), box.x + 16, box.y + box.h - 24, COLORS.text, 12, 750);
    drawText(ctx, "blue = non-watermarked mix, amber = edited token", box.x + 16, box.y + box.h - 8, COLORS.muted, 10, 550);
  }

  function drawQuality(ctx, result, box) {
    panel(ctx, box, "Quality tax", "bias buys detectability by moving probability");
    var params = result.params;
    var samples = [];
    var maxTax = 0.001;
    for (var i = 0; i <= QUALITY_POINTS; i += 1) {
      var bias = 3.5 * i / QUALITY_POINTS;
      var p = Object.assign({}, params, { bias: bias });
      var totalTax = 0;
      var totalZ = 0;
      for (var j = 0; j < QUALITY_TRIALS; j += 1) {
        var run = generate("marked", p, 500 + j);
        totalTax += run.qualityTax;
        totalZ += run.z;
      }
      var row = { bias: bias, tax: totalTax / QUALITY_TRIALS, z: totalZ / QUALITY_TRIALS };
      maxTax = Math.max(maxTax, row.tax);
      samples.push(row);
    }
    var plot = { x: box.x + 40, y: box.y + 26, w: box.w - 62, h: box.h - 56 };
    ctx.strokeStyle = COLORS.faint;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.quality;
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach(function (row, idx) {
      var x = plot.x + row.bias / 3.5 * plot.w;
      var y = plot.y + plot.h - row.tax / maxTax * plot.h;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
    var curX = plot.x + params.bias / 3.5 * plot.w;
    ctx.strokeStyle = COLORS.threshold;
    ctx.beginPath();
    ctx.moveTo(curX, plot.y - 3);
    ctx.lineTo(curX, plot.y + plot.h + 3);
    ctx.stroke();
    drawText(ctx, "0", plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 550, "center");
    drawText(ctx, "bias", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 550, "right");
    drawText(ctx, "mean KL " + formatNumber(result.summary.meanTax, 3) + " nats/token", plot.x + 8, plot.y + 12, COLORS.quality, 11, 750);
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    histogram(ctx, [
      { label: "null", color: COLORS.null, rows: result.rows.nulls },
      { label: "watermarked", color: COLORS.marked, rows: result.rows.marked },
      { label: "attacked", color: COLORS.attacked, rows: result.rows.attacked }
    ], { x: 24, y: 34, w: 852, h: 220 }, result.params.threshold);
    drawSweep(ctx, result.sweep, { x: 24, y: 298, w: 416, h: 168 });
    drawQuality(ctx, result, { x: 476, y: 298, w: 400, h: 168 });
    drawTape(ctx, result.one.attacked, { x: 24, y: 510, w: 852, h: 126 });
  }

  function syncOutputs(lab, params) {
    var values = {
      seed: params.seed,
      tokens: params.tokens,
      gamma: formatPercent(params.gamma, 0),
      bias: formatNumber(params.bias, 1),
      entropy: formatPercent(params.entropy, 0),
      edits: formatPercent(params.edits, 0),
      human: formatPercent(params.human, 0),
      threshold: formatNumber(params.threshold, 1)
    };
    Object.keys(values).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = values[key];
    });
  }

  function render(lab) {
    var params = paramsFromLab(lab);
    syncOutputs(lab, params);
    var result = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("clean power", formatPercent(result.summary.markedPower, 0)),
        metric("attacked power", formatPercent(result.summary.attackedPower, 0)),
        metric("false positives", formatPercent(result.summary.falsePositive, 1)),
        metric("one-doc z", formatNumber(result.one.attacked.z, 2)),
        metric("p-value", result.one.attacked.pValue < 0.001 ? result.one.attacked.pValue.toExponential(1) : formatNumber(result.one.attacked.pValue, 3)),
        metric("audit grid", result.audit.ok + "/" + result.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function scheduleRender() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", scheduleRender);
    });
    render(lab);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      baseDistribution: baseDistribution,
      generate: generate,
      monteCarlo: monteCarlo,
      normalTail: normalTail,
      runAudit: runAudit,
      simulate: simulate,
      sweepTokens: sweepTokens
    };
  }

  if (global && global.document) {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-watermark-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
