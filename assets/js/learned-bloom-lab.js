(function () {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    panel: "#f8fafc",
    key: "#2563eb",
    nonkey: "#be123c",
    classic: "#64748b",
    learned: "#0f766e",
    sandwich: "#7c3aed",
    backup: "#b45309",
    model: "#14b8a6",
    front: "#8b5cf6"
  };
  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random, mean, sd) {
    var u = Math.max(1e-12, random());
    var v = Math.max(1e-12, random());
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function defaultParams(input) {
    var params = {
      adversary: 4,
      frontShare: 40,
      keyCount: 1000,
      modelBits: 1100,
      negativeOverlap: 12,
      seed: 19,
      threshold: 84,
      totalBits: 7000
    };
    if (input) {
      Object.keys(input).forEach(function (key) {
        params[key] = input[key];
      });
    }
    params.adversary = clamp(finite(params.adversary, 4), 0, 80);
    params.frontShare = clamp(finite(params.frontShare, 40), 0, 70);
    params.keyCount = Math.round(clamp(finite(params.keyCount, 1000), 400, 1800));
    params.modelBits = Math.round(clamp(finite(params.modelBits, 1100), 0, 3600));
    params.negativeOverlap = clamp(finite(params.negativeOverlap, 12), 0, 80);
    params.seed = Math.round(clamp(finite(params.seed, 19), 1, 999));
    params.threshold = clamp(finite(params.threshold, 84), 5, 95) / 100;
    params.totalBits = Math.round(clamp(finite(params.totalBits, 7000), 3000, 18000));
    if (params.modelBits > params.totalBits - 256) params.modelBits = Math.max(0, params.totalBits - 256);
    params.queryCount = 5000;
    return params;
  }

  function fnv1a(str, seed) {
    var h = (2166136261 ^ seed) >>> 0;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function BloomFilter(bits, expected, seed) {
    this.bits = Math.max(8, Math.round(bits));
    this.bytes = new Uint8Array(Math.ceil(this.bits / 8));
    this.k = Math.max(1, Math.min(12, Math.round((this.bits / Math.max(1, expected)) * Math.LN2)));
    this.seed = seed >>> 0;
  }

  BloomFilter.prototype._set = function (index) {
    this.bytes[index >> 3] |= 1 << (index & 7);
  };

  BloomFilter.prototype._get = function (index) {
    return (this.bytes[index >> 3] & (1 << (index & 7))) !== 0;
  };

  BloomFilter.prototype._indexes = function (id) {
    var h1 = fnv1a(id, this.seed) || 1;
    var h2 = fnv1a(id, this.seed ^ 0x9E3779B9) || 0x85EBCA6B;
    var out = [];
    for (var i = 0; i < this.k; i += 1) {
      out.push((h1 + Math.imul(i, h2) + Math.imul(i * i, 0x27D4EB2D)) >>> 0);
    }
    return out;
  };

  BloomFilter.prototype.add = function (id) {
    var indexes = this._indexes(id);
    for (var i = 0; i < indexes.length; i += 1) this._set(indexes[i] % this.bits);
  };

  BloomFilter.prototype.has = function (id) {
    var indexes = this._indexes(id);
    for (var i = 0; i < indexes.length; i += 1) {
      if (!this._get(indexes[i] % this.bits)) return false;
    }
    return true;
  };

  BloomFilter.prototype.fillRatio = function () {
    var ones = 0;
    for (var i = 0; i < this.bytes.length; i += 1) {
      var b = this.bytes[i];
      while (b) {
        b &= b - 1;
        ones += 1;
      }
    }
    return ones / this.bits;
  };

  function centers() {
    return [0.18, 0.36, 0.61, 0.82];
  }

  function nearestCenter(x) {
    var cs = centers();
    var best = cs[0];
    var dist = Math.abs(x - best);
    for (var i = 1; i < cs.length; i += 1) {
      var d = Math.abs(x - cs[i]);
      if (d < dist) {
        best = cs[i];
        dist = d;
      }
    }
    return { center: best, dist: dist };
  }

  function scoreFor(x, salt) {
    var near = nearestCenter(x);
    var base = Math.exp(-0.5 * Math.pow(near.dist / 0.018, 2));
    var shoulder = 0.07 * Math.exp(-0.5 * Math.pow(near.dist / 0.050, 2));
    var ripple = 0.026 * Math.sin(37 * x + salt * 0.013) + 0.018 * Math.cos(91 * x + salt * 0.007);
    return clamp(0.025 + 0.86 * base + shoulder + ripple, 0, 1);
  }

  function sampleKey(random, index, seed) {
    var cs = centers();
    var c = cs[index % cs.length];
    var x = normal(random, c, 0.013 + 0.004 * (index % 3));
    x = clamp(x, 0.002, 0.998);
    return { id: "k:" + index, kind: "key", score: scoreFor(x, seed + index), x: x };
  }

  function sampleNonKey(random, index, params) {
    var mode = random() * 100;
    var cs = centers();
    var x;
    if (mode < params.adversary) {
      x = normal(random, cs[Math.floor(random() * cs.length)], 0.030);
    } else if (mode < params.adversary + params.negativeOverlap) {
      x = normal(random, cs[Math.floor(random() * cs.length)], 0.080);
    } else {
      x = random();
    }
    x = clamp(x, 0.002, 0.998);
    return { id: "q:" + index + ":" + params.seed, kind: "nonkey", score: scoreFor(x, params.seed + index * 17), x: x };
  }

  function makeData(params) {
    var random = rng(0xC0FFEE ^ params.seed * 2654435761);
    var keys = [];
    var nonkeys = [];
    for (var i = 0; i < params.keyCount; i += 1) keys.push(sampleKey(random, i, params.seed));
    for (var j = 0; j < params.queryCount; j += 1) nonkeys.push(sampleNonKey(random, j, params));
    return { keys: keys, nonkeys: nonkeys };
  }

  function buildBloom(items, bits, expected, seed) {
    var filter = new BloomFilter(Math.max(8, bits), Math.max(1, expected || items.length), seed);
    items.forEach(function (item) {
      filter.add(item.id);
    });
    return filter;
  }

  function evaluateAt(paramsInput, thresholdOverride, frontShareOverride, dataOverride) {
    var params = defaultParams(paramsInput);
    if (thresholdOverride != null) params.threshold = thresholdOverride;
    if (frontShareOverride != null) params.frontShare = frontShareOverride;
    var data = dataOverride || makeData(params);
    var keys = data.keys;
    var nonkeys = data.nonkeys;
    var totalBits = params.totalBits;
    var modelBits = Math.min(params.modelBits, totalBits - 256);
    var filterBits = Math.max(8, totalBits - modelBits);
    var frontBits = Math.round(filterBits * params.frontShare / 100);
    var sandwichBackupBits = Math.max(8, filterBits - frontBits);

    var rejectedKeys = keys.filter(function (item) { return item.score < params.threshold; });
    var acceptedKeyCount = keys.length - rejectedKeys.length;
    var classifierFalsePositives = nonkeys.filter(function (item) { return item.score >= params.threshold; }).length;
    var classifierFpr = classifierFalsePositives / nonkeys.length;

    var classic = buildBloom(keys, totalBits, keys.length, params.seed ^ 0x1234);
    var backup = buildBloom(rejectedKeys, filterBits, rejectedKeys.length || 1, params.seed ^ 0xBEEF);
    var front = buildBloom(keys, frontBits || 8, keys.length, params.seed ^ 0xFACE);
    var sandwichBackup = buildBloom(rejectedKeys, sandwichBackupBits, rejectedKeys.length || 1, params.seed ^ 0xD00D);

    var classicFp = 0;
    var learnedFp = 0;
    var sandwichFp = 0;
    nonkeys.forEach(function (item) {
      if (classic.has(item.id)) classicFp += 1;
      if (item.score >= params.threshold || backup.has(item.id)) learnedFp += 1;
      if (front.has(item.id) && (item.score >= params.threshold || sandwichBackup.has(item.id))) sandwichFp += 1;
    });

    var classicFn = 0;
    var learnedFn = 0;
    var sandwichFn = 0;
    keys.forEach(function (item) {
      if (!classic.has(item.id)) classicFn += 1;
      if (!(item.score >= params.threshold || backup.has(item.id))) learnedFn += 1;
      if (!(front.has(item.id) && (item.score >= params.threshold || sandwichBackup.has(item.id)))) sandwichFn += 1;
    });

    return {
      acceptedKeyCount: acceptedKeyCount,
      backup: backup,
      backupBits: filterBits,
      classic: classic,
      classicFn: classicFn,
      classicFpr: classicFp / nonkeys.length,
      classifierFpr: classifierFpr,
      data: data,
      filterBits: filterBits,
      front: front,
      frontBits: frontBits,
      learnedFn: learnedFn,
      learnedFpr: learnedFp / nonkeys.length,
      modelBits: modelBits,
      params: params,
      rejectedKeys: rejectedKeys,
      sandwichBackup: sandwichBackup,
      sandwichBackupBits: sandwichBackupBits,
      sandwichFn: sandwichFn,
      sandwichFpr: sandwichFp / nonkeys.length,
      totalBits: totalBits
    };
  }

  function sweep(paramsInput, data) {
    var params = defaultParams(paramsInput);
    var points = [];
    for (var i = 0; i < 25; i += 1) {
      var threshold = 0.10 + i * 0.84 / 24;
      var result = evaluateAt(params, threshold, params.frontShare, data);
      points.push({
        backupKeys: result.rejectedKeys.length,
        classicFpr: result.classicFpr,
        classifierFpr: result.classifierFpr,
        learnedFpr: result.learnedFpr,
        sandwichFpr: result.sandwichFpr,
        threshold: threshold
      });
    }
    return points;
  }

  function compute(input) {
    var params = defaultParams(input);
    var data = makeData(params);
    var current = evaluateAt(params, params.threshold, params.frontShare, data);
    current.sweep = sweep(params, data);
    return current;
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value) {
    return String(Math.round(value));
  }

  function metric(label, value) {
    return '<div class="learned-bloom-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle) {
      var titleW = ctx.measureText(title).width;
      var subW = ctx.measureText(subtitle).width;
      if (titleW + subW + 24 < box.w) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(subtitle, box.x + box.w, box.y - 12);
      }
    }
  }

  function histogram(items, bins) {
    var out = new Array(bins);
    for (var i = 0; i < bins; i += 1) out[i] = 0;
    items.forEach(function (item) {
      out[Math.min(bins - 1, Math.floor(clamp(item.score, 0, 0.999999) * bins))] += 1;
    });
    return out;
  }

  function drawScorePanel(ctx, result, box) {
    panel(ctx, box, "Classifier score", "threshold creates key misses and query hits");
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var bins = 34;
    var keyHist = histogram(result.data.keys, bins);
    var nonHist = histogram(result.data.nonkeys, bins);
    var maxCount = 1;
    keyHist.concat(nonHist).forEach(function (value) { maxCount = Math.max(maxCount, value); });
    var mid = box.y + box.h * 0.52;
    var binW = box.w / bins;
    for (var i = 0; i < bins; i += 1) {
      var x = box.x + i * binW + 1;
      var kh = keyHist[i] / maxCount * box.h * 0.42;
      var nh = nonHist[i] / maxCount * box.h * 0.42;
      ctx.fillStyle = COLORS.key;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x, mid - kh, Math.max(1, binW - 2), kh);
      ctx.fillStyle = COLORS.nonkey;
      ctx.fillRect(x, mid, Math.max(1, binW - 2), nh);
      ctx.globalAlpha = 1;
    }
    var tx = box.x + result.params.threshold * box.w;
    ctx.strokeStyle = COLORS.backup;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, box.y);
    ctx.lineTo(tx, box.y + box.h);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = COLORS.backup;
    ctx.textAlign = tx > box.x + box.w * 0.78 ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.fillText("threshold", tx + (ctx.textAlign === "left" ? 7 : -7), box.y + 8);
    ctx.fillStyle = COLORS.key;
    ctx.textAlign = "left";
    ctx.fillText("keys", box.x + 8, box.y + 8);
    ctx.fillStyle = COLORS.nonkey;
    ctx.fillText("nonkeys", box.x + 8, box.y + box.h - 24);
  }

  function drawMemoryPanel(ctx, result, box) {
    panel(ctx, box, "Memory ledger", "same total bits, different jobs");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var rows = [
      {
        label: "classic",
        parts: [
          { color: COLORS.classic, label: "Bloom", value: result.totalBits }
        ]
      },
      {
        label: "learned",
        parts: [
          { color: COLORS.model, label: "model", value: result.modelBits },
          { color: COLORS.backup, label: "backup", value: result.backupBits }
        ]
      },
      {
        label: "sandwich",
        parts: [
          { color: COLORS.model, label: "model", value: result.modelBits },
          { color: COLORS.front, label: "front", value: result.frontBits },
          { color: COLORS.backup, label: "backup", value: result.sandwichBackupBits }
        ]
      }
    ];
    var footerH = 24;
    var rowH = (box.h - footerH) / rows.length;
    rows.forEach(function (row, rowIndex) {
      var y = box.y + rowIndex * rowH + 13;
      var x = box.x + 70;
      var w = box.w - 82;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(row.label, box.x + 62, y + 12);
      var cursor = x;
      row.parts.forEach(function (part) {
        var partW = w * part.value / result.totalBits;
        ctx.fillStyle = part.color;
        ctx.fillRect(cursor, y, Math.max(1, partW), 24);
        if (partW > 38) {
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(part.label, cursor + partW / 2, y + 12);
        }
        cursor += partW;
      });
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(result.rejectedKeys.length + " rejected keys in backup", box.x + 8, box.y + box.h - 8);
  }

  function drawSweepPanel(ctx, result, box) {
    panel(ctx, box, "Threshold sweep", "lower is better");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var points = result.sweep;
    var maxY = points.reduce(function (m, point) {
      return Math.max(m, point.classicFpr, point.learnedFpr, point.sandwichFpr);
    }, 1e-6);
    maxY = Math.max(maxY, 0.02);
    function sx(t) {
      return box.x + (t - 0.10) / 0.84 * box.w;
    }
    function sy(v) {
      return box.y + box.h - clamp(v / maxY, 0, 1) * (box.h - 16) - 8;
    }
    [0.25, 0.5, 0.75].forEach(function (grid) {
      var y = box.y + box.h - grid * box.h;
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    });
    [
      ["classicFpr", COLORS.classic],
      ["learnedFpr", COLORS.learned],
      ["sandwichFpr", COLORS.sandwich]
    ].forEach(function (series) {
      ctx.beginPath();
      points.forEach(function (point, index) {
        var x = sx(point.threshold);
        var y = sy(point[series[0]]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = series[1];
      ctx.lineWidth = series[0] === "learnedFpr" ? 2.2 : 1.8;
      ctx.stroke();
    });
    ctx.lineWidth = 1;
    var tx = sx(result.params.threshold);
    ctx.strokeStyle = COLORS.backup;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(tx, box.y);
    ctx.lineTo(tx, box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("false positive rate", box.x + 8, box.y + box.h - 6);
  }

  function drawFeaturePanel(ctx, result, box) {
    panel(ctx, box, "Feature space", "what the model thinks it recognizes");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    function xMap(x) {
      return box.x + x * box.w;
    }
    centers().forEach(function (center) {
      var x = xMap(center);
      ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
      ctx.fillRect(x - box.w * 0.055, box.y, box.w * 0.11, box.h);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.stroke();
    });
    var sampleKeys = result.data.keys.filter(function (_, i) { return i % 14 === 0; });
    var sampleNon = result.data.nonkeys.filter(function (_, i) { return i % 38 === 0; });
    sampleNon.forEach(function (item) {
      ctx.fillStyle = item.score >= result.params.threshold ? COLORS.nonkey : "#f3b4c0";
      ctx.globalAlpha = item.score >= result.params.threshold ? 0.8 : 0.38;
      ctx.beginPath();
      ctx.arc(xMap(item.x), box.y + box.h * (0.68 + 0.22 * (item.score - 0.5)), 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    sampleKeys.forEach(function (item) {
      ctx.fillStyle = item.score < result.params.threshold ? COLORS.backup : COLORS.key;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(xMap(item.x), box.y + box.h * (0.32 - 0.22 * (item.score - 0.5)), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("blue keys; red nonkeys; ocher backup", box.x + 8, box.y + 8);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 590;
    var height = compact ? 1040 : 760;
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
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 44 : 52;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;
    if (compact) {
      drawScorePanel(ctx, result, { x: left, y: 48, w: plotW, h: 185 });
      drawMemoryPanel(ctx, result, { x: left, y: 306, w: plotW, h: 170 });
      drawSweepPanel(ctx, result, { x: left, y: 552, w: plotW, h: 180 });
      drawFeaturePanel(ctx, result, { x: left, y: 808, w: plotW, h: 150 });
    } else {
      drawScorePanel(ctx, result, { x: left, y: 54, w: plotW * 0.48, h: 230 });
      drawMemoryPanel(ctx, result, { x: left + plotW * 0.56, y: 54, w: plotW * 0.44, h: 230 });
      drawSweepPanel(ctx, result, { x: left, y: 390, w: plotW * 0.48, h: 205 });
      drawFeaturePanel(ctx, result, { x: left + plotW * 0.56, y: 390, w: plotW * 0.44, h: 205 });
    }
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = Number(input.value);
      if (Number.isFinite(value)) params[key] = value;
    });
    return params;
  }

  function updateOutputs(root, result) {
    root.querySelector('[data-value="keyCount"]').textContent = String(result.params.keyCount);
    root.querySelector('[data-value="totalBits"]').textContent = String(result.params.totalBits);
    root.querySelector('[data-value="modelBits"]').textContent = String(result.modelBits);
    root.querySelector('[data-value="threshold"]').textContent = result.params.threshold.toFixed(2);
    root.querySelector('[data-value="frontShare"]').textContent = result.params.frontShare + "%";
    root.querySelector('[data-value="negativeOverlap"]').textContent = result.params.negativeOverlap + "%";
    root.querySelector('[data-value="adversary"]').textContent = result.params.adversary + "%";
    root.querySelector('[data-value="seed"]').textContent = String(result.params.seed);
  }

  function render(root) {
    var result = compute(paramsFromRoot(root));
    var audit = cachedAudit();
    updateOutputs(root, result);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("classic FPR", formatPercent(result.classicFpr, 2)),
      metric("learned FPR", formatPercent(result.learnedFpr, 2)),
      metric("sandwich FPR", formatPercent(result.sandwichFpr, 2)),
      metric("classifier FPR", formatPercent(result.classifierFpr, 2)),
      metric("backup keys", formatNumber(result.rejectedKeys.length)),
      metric("false negatives", result.learnedFn + "/" + result.data.keys.length),
      metric("Audit", audit.passed + "/" + audit.total)
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-learned-bloom-lab]"));
    labs.forEach(function (root) {
      if (root.__learnedBloomReady) return;
      root.__learnedBloomReady = true;
      var frame = null;
      function requestRender() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          frame = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  function recomputeCounts(result) {
    var counts = {
      classicFp: 0,
      learnedFp: 0,
      sandwichFp: 0,
      classifierFp: 0,
      acceptedKeys: 0,
      rejectedKeys: 0,
      classicFn: 0,
      learnedFn: 0,
      sandwichFn: 0
    };
    result.data.nonkeys.forEach(function (item) {
      var modelAccepts = item.score >= result.params.threshold;
      if (modelAccepts) counts.classifierFp += 1;
      if (result.classic.has(item.id)) counts.classicFp += 1;
      if (modelAccepts || result.backup.has(item.id)) counts.learnedFp += 1;
      if (result.front.has(item.id) && (modelAccepts || result.sandwichBackup.has(item.id))) counts.sandwichFp += 1;
    });
    result.data.keys.forEach(function (item) {
      var modelAccepts = item.score >= result.params.threshold;
      if (modelAccepts) counts.acceptedKeys += 1;
      else counts.rejectedKeys += 1;
      if (!result.classic.has(item.id)) counts.classicFn += 1;
      if (!(modelAccepts || result.backup.has(item.id))) counts.learnedFn += 1;
      if (!(result.front.has(item.id) && (modelAccepts || result.sandwichBackup.has(item.id)))) counts.sandwichFn += 1;
    });
    return counts;
  }

  function uniqueCount(items) {
    var seen = Object.create(null);
    items.forEach(function (item) { seen[item.id] = true; });
    return Object.keys(seen).length;
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];
    var gridCases = 0;

    function check(name, condition, details) {
      checked += 1;
      if (condition) passed += 1;
      else failures.push({ name: name, details: details || null });
    }

    function checkClose(name, actual, expected, tolerance) {
      check(name, Math.abs(actual - expected) <= tolerance, {
        actual: actual,
        expected: expected,
        tolerance: tolerance
      });
    }

    function checkProbability(name, value) {
      check(name, Number.isFinite(value) && value >= 0 && value <= 1, { value: value });
    }

    function checkResult(name, result) {
      gridCases += 1;
      var counts = recomputeCounts(result);
      check(name + " key count matches params", result.data.keys.length === result.params.keyCount);
      check(name + " query count matches params", result.data.nonkeys.length === result.params.queryCount);
      check(name + " key ids are unique", uniqueCount(result.data.keys) === result.data.keys.length);
      check(name + " nonkey ids are unique", uniqueCount(result.data.nonkeys) === result.data.nonkeys.length);
      check(name + " key scores are bounded", result.data.keys.every(function (item) { return item.x >= 0 && item.x <= 1 && item.score >= 0 && item.score <= 1; }));
      check(name + " nonkey scores are bounded", result.data.nonkeys.every(function (item) { return item.x >= 0 && item.x <= 1 && item.score >= 0 && item.score <= 1; }));
      check(name + " model and backup bits add to total", result.modelBits + result.filterBits === result.totalBits);
      check(name + " sandwich bits add to filter budget", result.frontBits + result.sandwichBackupBits === result.filterBits);
      check(name + " backup bit count equals filter budget", result.backupBits === result.filterBits);
      check(name + " Bloom probe counts are positive", result.classic.k > 0 && result.backup.k > 0 && result.front.k > 0 && result.sandwichBackup.k > 0);
      check(name + " Bloom fill ratios are bounded", [result.classic, result.backup, result.front, result.sandwichBackup].every(function (filter) {
        var ratio = filter.fillRatio();
        return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;
      }));
      check(name + " classic has no false negatives", result.classicFn === 0 && counts.classicFn === 0);
      check(name + " learned has no false negatives", result.learnedFn === 0 && counts.learnedFn === 0);
      check(name + " sandwich has no false negatives", result.sandwichFn === 0 && counts.sandwichFn === 0);
      check(name + " rejected plus accepted keys is the key set", result.rejectedKeys.length + result.acceptedKeyCount === result.data.keys.length);
      check(name + " rejected key count recomputes", counts.rejectedKeys === result.rejectedKeys.length);
      check(name + " accepted key count recomputes", counts.acceptedKeys === result.acceptedKeyCount);
      check(name + " rejected keys are in backup", result.rejectedKeys.every(function (item) { return result.backup.has(item.id); }));
      check(name + " all keys are in front and classic filters", result.data.keys.every(function (item) {
        return result.front.has(item.id) && result.classic.has(item.id);
      }));
      checkClose(name + " classic FPR recomputes", result.classicFpr, counts.classicFp / result.data.nonkeys.length, 1e-15);
      checkClose(name + " learned FPR recomputes", result.learnedFpr, counts.learnedFp / result.data.nonkeys.length, 1e-15);
      checkClose(name + " sandwich FPR recomputes", result.sandwichFpr, counts.sandwichFp / result.data.nonkeys.length, 1e-15);
      checkClose(name + " classifier FPR recomputes", result.classifierFpr, counts.classifierFp / result.data.nonkeys.length, 1e-15);
      [result.classicFpr, result.learnedFpr, result.sandwichFpr, result.classifierFpr].forEach(function (rate, index) {
        checkProbability(name + " rate " + index + " is bounded", rate);
      });
    }

    var dirty = defaultParams({
      adversary: Infinity,
      frontShare: -40,
      keyCount: "bad",
      modelBits: 999999,
      negativeOverlap: NaN,
      seed: -1,
      threshold: "x",
      totalBits: 3000
    });
    check("bad adversary input falls back before clamping", dirty.adversary === 4);
    check("bad front share input clamps low", dirty.frontShare === 0);
    check("bad key count input falls back", dirty.keyCount === 1000);
    check("model bits leave room for backup filter", dirty.modelBits === 2744);
    check("bad overlap input falls back", dirty.negativeOverlap === 12);
    check("bad seed input clamps low", dirty.seed === 1);
    check("bad threshold input falls back to default", dirty.threshold === 0.84);

    var randomA = rng(123);
    var randomB = rng(123);
    for (var r = 0; r < 12; r += 1) checkClose("rng is deterministic draw " + r, randomA(), randomB(), 0);

    [0.002, 0.18, 0.36, 0.61, 0.82, 0.998].forEach(function (x) {
      checkProbability("score is bounded at " + x, scoreFor(x, 19));
    });
    check("center score exceeds nearby shoulder", scoreFor(0.18, 19) > scoreFor(0.25, 19));

    [16, 128, 2048].forEach(function (bits) {
      var filter = new BloomFilter(bits, 12, bits ^ 17);
      var items = [];
      for (var i = 0; i < 12; i += 1) items.push({ id: "bf:" + bits + ":" + i });
      items.forEach(function (item) { filter.add(item.id); });
      check("Bloom filter has no false negatives at " + bits + " bits", items.every(function (item) { return filter.has(item.id); }));
      check("Bloom filter index count matches k at " + bits + " bits", filter._indexes(items[0].id).length === filter.k);
      check("Bloom filter fill ratio bounded at " + bits + " bits", filter.fillRatio() >= 0 && filter.fillRatio() <= 1);
    });

    var defaultResult = compute({});
    checkResult("default", defaultResult);
    checkClose("default classic FPR matches prose", defaultResult.classicFpr, 0.0396, 1e-15);
    checkClose("default learned FPR matches prose", defaultResult.learnedFpr, 0.0898, 1e-15);
    checkClose("default sandwich FPR matches prose", defaultResult.sandwichFpr, 0.039, 1e-15);
    check("default rejected-key count matches prose", defaultResult.rejectedKeys.length === 565);
    check("default naive learned can lose to classic", defaultResult.learnedFpr > defaultResult.classicFpr);
    check("default sandwich beats classic", defaultResult.sandwichFpr < defaultResult.classicFpr);
    check("default sandwich beats learned", defaultResult.sandwichFpr <= defaultResult.learnedFpr);
    var low = evaluateAt({}, 0.25, 40, defaultResult.data);
    var high = evaluateAt({}, 0.78, 40, defaultResult.data);
    check("higher threshold sends more keys to backup", high.rejectedKeys.length > low.rejectedKeys.length);
    check("higher threshold lowers classifier false positives", high.classifierFpr < low.classifierFpr);

    [3, 19, 211].forEach(function (seed) {
      [0, 30, 70].forEach(function (overlap) {
        [0, 20, 60].forEach(function (adversary) {
          [0, 40].forEach(function (frontShare) {
            [0.25, 0.55, 0.84, 0.92].forEach(function (threshold) {
              checkResult("grid s" + seed + " o" + overlap + " a" + adversary + " f" + frontShare + " t" + threshold,
                evaluateAt({
                  negativeOverlap: overlap,
                  adversary: adversary,
                  threshold: threshold * 100,
                  keyCount: 650,
                  totalBits: 5600,
                  modelBits: adversary >= 60 ? 1200 : 800,
                  seed: seed
                }, threshold, frontShare));
            });
          });
        });
      });
    });

    [1, 19, 97].forEach(function (seed) {
      var params = defaultParams({ keyCount: 650, totalBits: 5600, modelBits: 800, seed: seed, negativeOverlap: 30, adversary: 20 });
      var data = makeData(params);
      var points = sweep(params, data);
      check("sweep has 25 threshold points for seed " + seed, points.length === 25);
      for (var i = 1; i < points.length; i += 1) {
        check("sweep thresholds increase for seed " + seed + " row " + i, points[i].threshold > points[i - 1].threshold);
        check("sweep backup keys are nondecreasing for seed " + seed + " row " + i, points[i].backupKeys >= points[i - 1].backupKeys);
        check("sweep classifier FPR is nonincreasing for seed " + seed + " row " + i, points[i].classifierFpr <= points[i - 1].classifierFpr + 1e-15);
        checkClose("sweep classic FPR is threshold-invariant for seed " + seed + " row " + i, points[i].classicFpr, points[0].classicFpr, 1e-15);
        [points[i].classicFpr, points[i].learnedFpr, points[i].sandwichFpr, points[i].classifierFpr].forEach(function (rate, j) {
          checkProbability("sweep rate bounded seed " + seed + " row " + i + " rate " + j, rate);
        });
      }
    });

    return {
      passed: passed,
      total: checked,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        classicFpr: defaultResult.classicFpr,
        learnedFpr: defaultResult.learnedFpr,
        sandwichFpr: defaultResult.sandwichFpr,
        classifierFpr: defaultResult.classifierFpr,
        rejectedKeys: defaultResult.rejectedKeys.length,
        falseNegatives: defaultResult.learnedFn
      }
    };
  }

  var api = {
    BloomFilter: BloomFilter,
    audit: runAudit,
    compute: compute,
    defaultParams: defaultParams,
    evaluateAt: evaluateAt,
    makeData: makeData,
    runAudit: runAudit,
    scoreFor: scoreFor,
    sweep: sweep
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined") {
    window.LearnedBloomLab = api;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
