(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    hll: "#0f766e",
    bitmap: "#7c3aed",
    exact: "#be123c",
    fm: "#d97706",
    blue: "#2563eb",
    bg: "#ffffff",
    band: "#ccfbf1",
    softPurple: "#ede9fe",
    softAmber: "#fef3c7"
  };

  function clampInt(value, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function hash32(value, seed) {
    var h = (value ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function alpha(m) {
    if (m === 16) return 0.673;
    if (m === 32) return 0.697;
    if (m === 64) return 0.709;
    return 0.7213 / (1 + 1.079 / m);
  }

  function rho(hash, precision) {
    var word = (hash << precision) >>> 0;
    var max = 32 - precision + 1;
    if (word === 0) return max;
    return Math.min(max, Math.clz32(word) + 1);
  }

  function addHash(registers, precision, hash) {
    var index = hash >>> (32 - precision);
    var rank = rho(hash, precision);
    if (rank > registers[index]) registers[index] = rank;
  }

  function estimateHll(registers) {
    var m = registers.length;
    var sum = 0;
    var zeros = 0;
    for (var i = 0; i < m; i += 1) {
      var value = registers[i];
      if (value === 0) zeros += 1;
      sum += Math.pow(2, -value);
    }
    var raw = alpha(m) * m * m / sum;
    var estimate = raw;
    var correction = "raw";
    if (raw <= 2.5 * m && zeros > 0) {
      estimate = m * Math.log(m / zeros);
      correction = "linear";
    }
    return {
      correction: correction,
      estimate: estimate,
      raw: raw,
      zeros: zeros
    };
  }

  function mergeRegisters(target, source) {
    for (var i = 0; i < target.length; i += 1) {
      if (source[i] > target[i]) target[i] = source[i];
    }
  }

  function sameRegisters(left, right) {
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function buildSketch(precision, uniques, seed, shards) {
    var m = 1 << precision;
    var direct = new Uint8Array(m);
    var shardCount = Math.max(1, shards || 1);
    var shardRegisters = null;
    if (shardCount > 1) {
      shardRegisters = [];
      for (var s = 0; s < shardCount; s += 1) shardRegisters.push(new Uint8Array(m));
    }

    for (var i = 1; i <= uniques; i += 1) {
      var hash = hash32(i, seed);
      addHash(direct, precision, hash);
      if (shardRegisters) {
        var shard = hash32(i, seed ^ 0x9e3779b9) % shardCount;
        addHash(shardRegisters[shard], precision, hash);
      }
    }

    var merged = direct;
    var mergeEqual = true;
    if (shardRegisters) {
      merged = new Uint8Array(m);
      shardRegisters.forEach(function (registers) {
        mergeRegisters(merged, registers);
      });
      mergeEqual = sameRegisters(direct, merged);
    }

    var directEstimate = estimateHll(direct);
    var mergedEstimate = shardRegisters ? estimateHll(merged) : directEstimate;
    return {
      direct: direct,
      directEstimate: directEstimate,
      mergeDelta: Math.abs(mergedEstimate.estimate - directEstimate.estimate) / Math.max(1, uniques),
      mergeEqual: mergeEqual,
      merged: merged,
      mergedEstimate: mergedEstimate,
      shards: shardCount
    };
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function sd(values) {
    if (values.length < 2) return 0;
    var m = mean(values);
    var variance = values.reduce(function (sum, value) {
      var d = value - m;
      return sum + d * d;
    }, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var position = (sorted.length - 1) * q;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function trialSummary(errors) {
    var sorted = errors.slice().sort(function (a, b) { return a - b; });
    return {
      errors: errors,
      mean: mean(errors),
      p05: quantile(sorted, 0.05),
      p50: quantile(sorted, 0.50),
      p95: quantile(sorted, 0.95),
      sd: sd(errors)
    };
  }

  function runTrials(precision, uniques, trials) {
    var errors = [];
    for (var i = 0; i < trials; i += 1) {
      var seed = (0x51f15eED ^ Math.imul(i + 1, 0x45d9f3b)) >>> 0;
      var sketch = buildSketch(precision, uniques, seed, 1);
      errors.push((sketch.directEstimate.estimate - uniques) / uniques);
    }
    return trialSummary(errors);
  }

  function setBit(bitset, position) {
    var byte = position >>> 3;
    var mask = 1 << (position & 7);
    if ((bitset[byte] & mask) !== 0) return false;
    bitset[byte] |= mask;
    return true;
  }

  function bitmapEstimate(bits, zeros) {
    if (zeros <= 0) return Infinity;
    return -bits * Math.log(zeros / bits);
  }

  function makeLoadCurve(precision, uniques) {
    var m = 1 << precision;
    var maxN = Math.max(4000, Math.min(240000, Math.ceil(Math.max(uniques * 2, m * 12))));
    var registers = new Uint8Array(m);
    var bitmapBits = Math.max(64, m * 6);
    var bitmap = new Uint8Array(Math.ceil(bitmapBits / 8));
    var bitmapZeros = bitmapBits;
    var milestones = [];
    for (var s = 1; s <= 22; s += 1) {
      milestones.push(Math.max(1, Math.round(maxN * s / 22)));
    }
    var next = 0;
    var curve = [];
    for (var i = 1; i <= maxN; i += 1) {
      addHash(registers, precision, hash32(i, 0xC0FFEE));
      var bit = hash32(i, 0xA5A5A5A5) % bitmapBits;
      if (setBit(bitmap, bit)) bitmapZeros -= 1;
      while (next < milestones.length && i >= milestones[next]) {
        curve.push({
          bitmap: bitmapEstimate(bitmapBits, bitmapZeros),
          hll: estimateHll(registers).estimate,
          trueCount: i,
          zeros: bitmapZeros
        });
        next += 1;
      }
    }
    return {
      bitmapBits: bitmapBits,
      maxN: maxN,
      points: curve
    };
  }

  function registerHistogram(registers) {
    var max = 0;
    for (var i = 0; i < registers.length; i += 1) {
      if (registers[i] > max) max = registers[i];
    }
    var hist = new Array(max + 1).fill(0);
    for (var j = 0; j < registers.length; j += 1) hist[registers[j]] += 1;
    return hist;
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return {
      duplicates: clampInt(raw.duplicates, 1, 20),
      exactBytes: clampInt(raw.exactBytes, 8, 48),
      precision: clampInt(raw.precision, 4, 14),
      shards: clampInt(raw.shards, 1, 16),
      trials: clampInt(raw.trials, 8, 40),
      uniques: clampInt(raw.uniques, 1000, 160000)
    };
  }

  function simulate(params) {
    var p = {
      duplicates: clampInt(params.duplicates, 1, 20),
      exactBytes: clampInt(params.exactBytes, 8, 48),
      precision: clampInt(params.precision, 4, 14),
      shards: clampInt(params.shards, 1, 16),
      trials: clampInt(params.trials, 8, 40),
      uniques: clampInt(params.uniques, 1000, 160000)
    };
    var m = 1 << p.precision;
    var sketch = buildSketch(p.precision, p.uniques, 0x20260613, p.shards);
    var trials = runTrials(p.precision, p.uniques, p.trials);
    var curve = makeLoadCurve(p.precision, p.uniques);
    var hllBytes = m * 6 / 8;
    return {
      bitmapBytes: curve.bitmapBits / 8,
      curve: curve,
      expectedSe: 1.04 / Math.sqrt(m),
      exactBytes: p.uniques * p.exactBytes,
      hllBytes: hllBytes,
      histogram: registerHistogram(sketch.direct),
      m: m,
      params: p,
      sketch: sketch,
      streamEvents: p.uniques * p.duplicates,
      trials: trials
    };
  }

  function formatInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "saturated";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return formatNumber(bytes, bytes < 10 && bytes !== Math.round(bytes) ? 1 : 0) + " B";
    if (bytes < 1024 * 1024) return formatNumber(bytes / 1024, bytes < 10 * 1024 ? 1 : 0) + " KB";
    return formatNumber(bytes / (1024 * 1024), bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  function metric(label, value) {
    return '<div class="hll-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function updateOutputs(root, params) {
    var values = {
      duplicates: params.duplicates + "x",
      exactBytes: params.exactBytes + " B/key",
      precision: "p=" + params.precision + " / " + formatInt(1 << params.precision) + " regs",
      shards: String(params.shards),
      trials: String(params.trials),
      uniques: formatInt(params.uniques)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.font = "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle) {
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function gridLine(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPath(ctx, points, xScale, yScale, color, width, dashed) {
    ctx.save();
    if (dashed) ctx.setLineDash([6, 5]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    var started = false;
    points.forEach(function (point) {
      var yValue = yScale(point);
      if (!Number.isFinite(yValue)) return;
      var x = xScale(point);
      var y = yValue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawErrorPanel(ctx, box, result) {
    panel(ctx, box, "trial error", "+/-" + formatPct(result.expectedSe, 1) + " theory");
    var pad = { left: 48, right: 18, top: 18, bottom: 36 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var errors = result.trials.errors;
    var maxAbs = errors.reduce(function (max, value) {
      return Math.max(max, Math.abs(value));
    }, result.expectedSe * 3);
    var range = Math.max(0.035, maxAbs * 1.15, result.expectedSe * 3.1);
    var bins = new Array(18).fill(0);
    errors.forEach(function (error) {
      var index = Math.floor(((error + range) / (2 * range)) * bins.length);
      index = Math.max(0, Math.min(bins.length - 1, index));
      bins[index] += 1;
    });
    var maxBin = Math.max(1, Math.max.apply(null, bins));
    var x = function (value) { return left + ((value + range) / (2 * range)) * width; };
    var y = function (count) { return top + height - (count / maxBin) * height; };

    ctx.fillStyle = COLORS.band;
    ctx.fillRect(x(-result.expectedSe), top, x(result.expectedSe) - x(-result.expectedSe), height);
    gridLine(ctx, x(0), top, x(0), top + height);
    bins.forEach(function (count, i) {
      var x0 = left + i * width / bins.length + 2;
      var bw = width / bins.length - 4;
      ctx.fillStyle = COLORS.hll;
      ctx.fillRect(x0, y(count), bw, top + height - y(count));
    });
    ctx.strokeStyle = COLORS.exact;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(result.trials.mean), top);
    ctx.lineTo(x(result.trials.mean), top + height);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "-" + formatPct(range, 0), left, top + height + 18, "left", "top", COLORS.muted);
    label(ctx, "0", x(0), top + height + 18, "center", "top", COLORS.muted);
    label(ctx, "+" + formatPct(range, 0), left + width, top + height + 18, "right", "top", COLORS.muted);
    label(ctx, "mean " + formatPct(result.trials.mean, 2), left + width, top + 4, "right", "top", COLORS.exact);
  }

  function drawHistogramPanel(ctx, box, result) {
    panel(ctx, box, "registers", "max rho histogram");
    var hist = result.histogram;
    var pad = { left: 36, right: 12, top: 18, bottom: 34 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var maxCount = Math.max(1, Math.max.apply(null, hist));
    hist.forEach(function (count, i) {
      var x = left + i * width / hist.length + 1;
      var bw = Math.max(2, width / hist.length - 2);
      var h = count / maxCount * height;
      ctx.fillStyle = i === 0 ? COLORS.faint : COLORS.blue;
      ctx.fillRect(x, top + height - h, bw, h);
    });
    gridLine(ctx, left, top + height, left + width, top + height);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "0", left, top + height + 18, "left", "top", COLORS.muted);
    label(ctx, String(hist.length - 1), left + width, top + height + 18, "right", "top", COLORS.muted);
    label(ctx, formatInt(result.sketch.directEstimate.zeros) + " empty", left + width, top + 4, "right", "top", COLORS.muted);
  }

  function drawCurvePanel(ctx, box, result) {
    panel(ctx, box, "load curve", "HLL vs same-bit bitmap");
    var pad = { left: 54, right: 18, top: 20, bottom: 38 };
    var left = box.x + pad.left;
    var top = box.y + pad.top;
    var width = box.w - pad.left - pad.right;
    var height = box.h - pad.top - pad.bottom;
    var maxN = result.curve.maxN;
    var yMax = maxN * 1.15;
    var x = function (point) { return left + point.trueCount / maxN * width; };
    var yFor = function (value) {
      if (!Number.isFinite(value)) return NaN;
      return top + height - Math.min(yMax, Math.max(0, value)) / yMax * height;
    };
    [0.25, 0.5, 0.75, 1].forEach(function (fraction) {
      var yy = top + height - fraction * height;
      gridLine(ctx, left, yy, left + width, yy);
    });
    drawPath(ctx, result.curve.points, x, function (point) { return yFor(point.trueCount); }, COLORS.muted, 1.5, true);
    drawPath(ctx, result.curve.points, x, function (point) { return yFor(point.hll); }, COLORS.hll, 2.5, false);
    drawPath(ctx, result.curve.points, x, function (point) { return yFor(point.bitmap); }, COLORS.bitmap, 2.5, false);
    result.curve.points.forEach(function (point) {
      if (!Number.isFinite(point.bitmap)) {
        ctx.fillStyle = COLORS.bitmap;
        ctx.beginPath();
        ctx.arc(x(point), top + 8, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    gridLine(ctx, left, top + height, left + width, top + height);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "0", left, top + height + 18, "left", "top", COLORS.muted);
    label(ctx, formatInt(maxN), left + width, top + height + 18, "right", "top", COLORS.muted);
    label(ctx, "true distinct", left + width / 2, top + height + 30, "center", "top", COLORS.muted);
    label(ctx, "ideal", left + 6, top + 16, "left", "top", COLORS.muted);
    label(ctx, "HLL", left + width - 92, top + 16, "left", "top", COLORS.hll);
    label(ctx, "bitmap", left + width - 92, top + 34, "left", "top", COLORS.bitmap);
  }

  function drawMemoryPanel(ctx, box, result) {
    panel(ctx, box, "memory ledger", "log scale");
    var rows = [
      { color: COLORS.exact, label: "exact set", value: result.exactBytes },
      { color: COLORS.hll, label: "HLL registers", value: result.hllBytes },
      { color: COLORS.bitmap, label: "bitmap", value: result.bitmapBytes },
      { color: COLORS.fm, label: "one FM max", value: 4 }
    ];
    var max = rows.reduce(function (m, row) { return Math.max(m, row.value); }, 1);
    var minLog = 0;
    var maxLog = Math.log10(Math.max(10, max));
    var left = box.x + 116;
    var top = box.y + 30;
    var width = box.w - 142;
    var rowH = 38;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    rows.forEach(function (row, i) {
      var y = top + i * rowH;
      var logValue = Math.log10(Math.max(1, row.value));
      var barW = Math.max(2, (logValue - minLog) / Math.max(1, maxLog - minLog) * width);
      label(ctx, row.label, box.x + 14, y + 9, "left", "middle", COLORS.muted);
      ctx.fillStyle = row.color;
      ctx.fillRect(left, y, barW, 18);
      label(ctx, formatBytes(row.value), left + Math.min(width, barW) + 6, y + 9, "left", "middle", COLORS.text);
    });
    ctx.fillStyle = COLORS.softAmber;
    ctx.fillRect(box.x + 14, box.y + box.h - 52, box.w - 28, 32);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, formatInt(result.streamEvents) + " stream events, " + formatInt(result.params.uniques) + " unique keys", box.x + 24, box.y + box.h - 36, "left", "middle", COLORS.text);
  }

  function drawChart(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";

    var boxes = [
      { x: 54, y: 68, w: 370, h: 210 },
      { x: 486, y: 68, w: 360, h: 210 },
      { x: 54, y: 352, w: 370, h: 250 },
      { x: 486, y: 352, w: 360, h: 250 }
    ];

    ctx.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "Approximate distinct counting", 54, 30, "left", "top", COLORS.text);
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "m=" + formatInt(result.m) + ", standard error about " + formatPct(result.expectedSe, 2), 54, 54, "left", "top", COLORS.muted);

    drawErrorPanel(ctx, boxes[0], result);
    drawHistogramPanel(ctx, boxes[1], result);
    drawCurvePanel(ctx, boxes[2], result);
    drawMemoryPanel(ctx, boxes[3], result);
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    var result = simulate(params);
    var estimate = result.sketch.directEstimate.estimate;
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("HLL estimate", formatInt(estimate)),
        metric("relative error", formatPct((estimate - result.params.uniques) / result.params.uniques, 2)),
        metric("expected SE", "+/-" + formatPct(result.expectedSe, 2)),
        metric("HLL memory", formatBytes(result.hllBytes)),
        metric("exact set", formatBytes(result.exactBytes)),
        metric("merge delta", result.sketch.mergeEqual ? "0" : formatPct(result.sketch.mergeDelta, 4))
      ].join("");
    }
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-hll-lab]"));
    labs.forEach(function (root) {
      if (root.__hllLabReady) return;
      root.__hllLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildSketch: buildSketch,
      estimateHll: estimateHll,
      hash32: hash32,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
