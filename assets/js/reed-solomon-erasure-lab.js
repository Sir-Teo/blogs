(function (root) {
  "use strict";

  var COLORS = {
    data: "#2563eb",
    parity: "#0f766e",
    missing: "#be123c",
    recovered: "#d97706",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    raw: "#7c3aed"
  };

  var DEFAULTS = {
    data: 5,
    parity: 3,
    erasures: 3,
    pattern: "cluster",
    failure: 6,
    seed: 3
  };

  var SHARD_BYTES = 24;
  var PHRASE = "REED SOLOMON STORES A FILE AS POINTS ON A POLYNOMIAL. ERASURES NAME THE HOLES; LINEAR ALGEBRA FILLS THEM. ";
  var EXP = [];
  var LOG = [];

  function initField() {
    var x = 1;
    for (var i = 0; i < 255; i += 1) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j += 1) EXP[j] = EXP[j - 255];
    LOG[0] = -Infinity;
  }

  initField();

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
    var data = snap(raw.data, DEFAULTS.data, 3, 8, 1);
    var parity = snap(raw.parity, DEFAULTS.parity, 1, 5, 1);
    var pattern = raw.pattern || DEFAULTS.pattern;
    if (["cluster", "random", "data", "parity"].indexOf(pattern) < 0) pattern = DEFAULTS.pattern;
    return {
      data: data,
      parity: parity,
      erasures: snap(raw.erasures, DEFAULTS.erasures, 0, data + parity, 1),
      pattern: pattern,
      failure: snap(raw.failure, DEFAULTS.failure, 1, 30, 1) / 100,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1)
    };
  }

  function lcg(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function gfAdd(a, b) {
    return a ^ b;
  }

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function gfDiv(a, b) {
    if (b === 0) throw new Error("division by zero in GF(256)");
    if (a === 0) return 0;
    return EXP[(LOG[a] - LOG[b] + 255) % 255];
  }

  function gfPow(a, power) {
    if (power === 0) return 1;
    if (a === 0) return 0;
    return EXP[(LOG[a] * power) % 255];
  }

  function toHex(value) {
    return (value < 16 ? "0" : "") + value.toString(16).toUpperCase();
  }

  function identity(n) {
    var out = [];
    for (var r = 0; r < n; r += 1) {
      var row = [];
      for (var c = 0; c < n; c += 1) row.push(r === c ? 1 : 0);
      out.push(row);
    }
    return out;
  }

  function vandermondeRow(x, width) {
    var row = [];
    for (var c = 0; c < width; c += 1) row.push(gfPow(x, c));
    return row;
  }

  function multiplyRowMatrix(row, matrix) {
    var out = [];
    for (var c = 0; c < matrix[0].length; c += 1) {
      var sum = 0;
      for (var i = 0; i < row.length; i += 1) sum = gfAdd(sum, gfMul(row[i], matrix[i][c]));
      out.push(sum);
    }
    return out;
  }

  function invertMatrix(matrix) {
    var n = matrix.length;
    if (!n || matrix[0].length !== n) return null;
    var left = matrix.map(function (row) { return row.slice(); });
    var right = identity(n);
    for (var col = 0; col < n; col += 1) {
      var pivot = -1;
      for (var r = col; r < n; r += 1) {
        if (left[r][col] !== 0) {
          pivot = r;
          break;
        }
      }
      if (pivot < 0) return null;
      if (pivot !== col) {
        var tmp = left[pivot];
        left[pivot] = left[col];
        left[col] = tmp;
        tmp = right[pivot];
        right[pivot] = right[col];
        right[col] = tmp;
      }
      var invPivot = gfDiv(1, left[col][col]);
      for (var c = 0; c < n; c += 1) {
        left[col][c] = gfMul(left[col][c], invPivot);
        right[col][c] = gfMul(right[col][c], invPivot);
      }
      for (var rr = 0; rr < n; rr += 1) {
        if (rr === col) continue;
        var factor = left[rr][col];
        if (factor === 0) continue;
        for (var cc = 0; cc < n; cc += 1) {
          left[rr][cc] = gfAdd(left[rr][cc], gfMul(factor, left[col][cc]));
          right[rr][cc] = gfAdd(right[rr][cc], gfMul(factor, right[col][cc]));
        }
      }
    }
    return right;
  }

  function buildGenerator(dataCount, parityCount) {
    var total = dataCount + parityCount;
    var base = [];
    for (var r = 0; r < total; r += 1) base.push(vandermondeRow(r + 1, dataCount));
    var top = base.slice(0, dataCount);
    var topInverse = invertMatrix(top);
    if (!topInverse) throw new Error("could not invert Vandermonde prefix");
    return base.map(function (row) { return multiplyRowMatrix(row, topInverse); });
  }

  function makePayload(dataCount, seed) {
    var length = dataCount * SHARD_BYTES;
    var bytes = [];
    for (var i = 0; i < length; i += 1) {
      var ch = PHRASE.charCodeAt((i + seed) % PHRASE.length);
      bytes.push(ch & 255);
    }
    return bytes;
  }

  function splitData(bytes, dataCount) {
    var shards = [];
    for (var s = 0; s < dataCount; s += 1) {
      shards.push(bytes.slice(s * SHARD_BYTES, (s + 1) * SHARD_BYTES));
    }
    return shards;
  }

  function encode(dataShards, generator) {
    var total = generator.length;
    var dataCount = dataShards.length;
    var shards = [];
    for (var r = 0; r < total; r += 1) {
      var shard = [];
      for (var b = 0; b < SHARD_BYTES; b += 1) {
        var sum = 0;
        for (var c = 0; c < dataCount; c += 1) {
          sum = gfAdd(sum, gfMul(generator[r][c], dataShards[c][b]));
        }
        shard.push(sum);
      }
      shards.push(shard);
    }
    return shards;
  }

  function chooseErasures(params) {
    var total = params.data + params.parity;
    var count = Math.min(params.erasures, total);
    var missing = [];
    if (params.pattern === "data") {
      for (var d = 0; d < count; d += 1) missing.push(d % total);
    } else if (params.pattern === "parity") {
      for (var p = 0; p < count; p += 1) missing.push((params.data + p) % total);
    } else if (params.pattern === "random") {
      var order = [];
      for (var i = 0; i < total; i += 1) order.push(i);
      var rand = lcg(params.seed * 2654435761 + count * 97);
      for (var j = order.length - 1; j > 0; j -= 1) {
        var swap = Math.floor(rand() * (j + 1));
        var tmp = order[j];
        order[j] = order[swap];
        order[swap] = tmp;
      }
      missing = order.slice(0, count);
    } else {
      var start = params.seed % total;
      for (var c = 0; c < count; c += 1) missing.push((start + c) % total);
    }
    var seen = {};
    return missing.filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  function decode(shards, generator, missing, dataCount) {
    var missingSet = {};
    missing.forEach(function (index) { missingSet[index] = true; });
    var available = [];
    for (var i = 0; i < shards.length; i += 1) {
      if (!missingSet[i]) available.push(i);
    }
    if (available.length < dataCount) {
      return { ok: false, reason: "not enough surviving shards", available: available, selected: [] };
    }
    var selected = available.slice(0, dataCount);
    var matrix = selected.map(function (index) { return generator[index].slice(); });
    var inverse = invertMatrix(matrix);
    if (!inverse) return { ok: false, reason: "surviving rows were singular", available: available, selected: selected };
    var data = [];
    for (var row = 0; row < dataCount; row += 1) {
      var shard = [];
      for (var b = 0; b < SHARD_BYTES; b += 1) {
        var sum = 0;
        for (var c = 0; c < dataCount; c += 1) {
          sum = gfAdd(sum, gfMul(inverse[row][c], shards[selected[c]][b]));
        }
        shard.push(sum);
      }
      data.push(shard);
    }
    return {
      ok: true,
      reason: "decoded from " + dataCount + " surviving shards",
      available: available,
      selected: selected,
      inverse: inverse,
      data: data,
      allShards: encode(data, generator)
    };
  }

  function checksum(bytes) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < bytes.length; i += 1) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function flatten(shards, count) {
    var out = [];
    for (var i = 0; i < count; i += 1) out = out.concat(shards[i]);
    return out;
  }

  function combinations(n, r) {
    if (r < 0 || r > n) return 0;
    r = Math.min(r, n - r);
    var out = 1;
    for (var i = 1; i <= r; i += 1) out = out * (n - r + i) / i;
    return out;
  }

  function stripeLossProbability(dataCount, parityCount, p) {
    var total = dataCount + parityCount;
    var sum = 0;
    for (var lost = parityCount + 1; lost <= total; lost += 1) {
      sum += combinations(total, lost) * Math.pow(p, lost) * Math.pow(1 - p, total - lost);
    }
    return sum;
  }

  function rawLossProbability(dataCount, p) {
    return 1 - Math.pow(1 - p, dataCount);
  }

  function reliabilityCurve(params) {
    var points = [];
    for (var i = 1; i <= 30; i += 1) {
      var p = i / 100;
      points.push({
        p: p,
        rs: stripeLossProbability(params.data, params.parity, p),
        raw: rawLossProbability(params.data, p)
      });
    }
    return points;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var generator = buildGenerator(params.data, params.parity);
    var payload = makePayload(params.data, params.seed);
    var dataShards = splitData(payload, params.data);
    var shards = encode(dataShards, generator);
    var missing = chooseErasures(params);
    var decoded = decode(shards, generator, missing, params.data);
    var recoveredPayload = decoded.ok ? flatten(decoded.data, params.data) : [];
    var ok = decoded.ok && checksum(recoveredPayload) === checksum(payload);
    return {
      params: params,
      generator: generator,
      payload: payload,
      dataShards: dataShards,
      shards: shards,
      missing: missing,
      decoded: decoded,
      recoveredOk: ok,
      checksum: checksum(payload),
      recoveredChecksum: decoded.ok ? checksum(recoveredPayload) : null,
      curve: reliabilityCurve(params),
      lossProbability: stripeLossProbability(params.data, params.parity, params.failure),
      rawLossProbability: rawLossProbability(params.data, params.failure)
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 2 : digits) + "%";
  }

  function formatProbability(value) {
    if (value === 0) return "0";
    if (value < 0.0001) return value.toExponential(2);
    if (value < 0.01) return formatPercent(value, 3);
    return formatPercent(value, 2);
  }

  function metric(label, value) {
    return '<div class="rs-erasure-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width));
    var height = width < 620 ? 1260 : 780;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, COLORS.muted, 11, 600);
  }

  function shardName(index, dataCount) {
    return index < dataCount ? "D" + index : "P" + (index - dataCount);
  }

  function isMissing(result, index) {
    return result.missing.indexOf(index) >= 0;
  }

  function bytePreview(bytes, count) {
    var out = [];
    for (var i = 0; i < Math.min(count, bytes.length); i += 1) out.push(toHex(bytes[i]));
    return out.join(" ");
  }

  function drawShards(ctx, box, result) {
    panel(ctx, box, "Stripe shards", "systematic data plus parity evaluations");
    var total = result.params.data + result.params.parity;
    var top = box.y + 62;
    var gap = 8;
    var rowH = Math.min(36, Math.max(25, (box.h - 92 - gap * (total - 1)) / total));
    for (var i = 0; i < total; i += 1) {
      var y = top + i * (rowH + gap);
      var missing = isMissing(result, i);
      var recovered = missing && result.recoveredOk;
      var baseColor = i < result.params.data ? COLORS.data : COLORS.parity;
      ctx.fillStyle = missing ? (recovered ? "#fff7ed" : "#fff1f2") : "#ffffff";
      ctx.strokeStyle = missing ? (recovered ? COLORS.recovered : COLORS.missing) : COLORS.rule;
      ctx.lineWidth = missing ? 1.6 : 1;
      roundedRect(ctx, box.x + 14, y, box.w - 28, rowH, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = missing ? (recovered ? COLORS.recovered : COLORS.missing) : baseColor;
      roundedRect(ctx, box.x + 22, y + 7, 42, rowH - 14, 5);
      ctx.fill();
      drawText(ctx, shardName(i, result.params.data), box.x + 43, y + rowH / 2 + 4, "#ffffff", 11, 800, "center");
      var label = missing ? (recovered ? "erased -> reconstructed" : "erased") : (i < result.params.data ? "original data" : "parity shard");
      drawText(ctx, label, box.x + 74, y + 15, missing ? (recovered ? COLORS.recovered : COLORS.missing) : COLORS.muted, 10, 750);
      var bytes = missing && recovered ? result.decoded.allShards[i] : result.shards[i];
      drawText(ctx, bytePreview(bytes, box.w < 360 ? 7 : 11), box.x + 74, y + rowH - 8, COLORS.text, 10, 650);
    }
  }

  function drawMatrix(ctx, box, result) {
    panel(ctx, box, "Generator matrix", "top rows are identity; parity rows are finite-field mixtures");
    var data = result.params.data;
    var total = data + result.params.parity;
    var left = box.x + 18;
    var top = box.y + 62;
    var cell = Math.min(30, Math.floor((box.w - 42) / (data + 1)));
    var rowGap = Math.min(7, Math.max(3, (box.h - 88 - total * cell) / Math.max(1, total - 1)));
    for (var c = 0; c < data; c += 1) {
      drawText(ctx, "c" + c, left + 52 + c * cell + cell / 2, top - 10, COLORS.muted, 10, 700, "center");
    }
    for (var r = 0; r < total; r += 1) {
      var y = top + r * (cell + rowGap);
      var selected = result.decoded.selected && result.decoded.selected.indexOf(r) >= 0;
      var missing = isMissing(result, r);
      drawText(ctx, shardName(r, data), left, y + cell / 2 + 4, missing ? COLORS.missing : (selected ? COLORS.recovered : COLORS.muted), 11, 800);
      for (var cc = 0; cc < data; cc += 1) {
        var x = left + 40 + cc * cell;
        ctx.fillStyle = missing ? "#fff1f2" : (selected ? "#fff7ed" : "#ffffff");
        ctx.strokeStyle = result.generator[r][cc] === 0 ? "#e5e7eb" : "#cbd5e1";
        roundedRect(ctx, x, y, cell - 3, cell - 3, 4);
        ctx.fill();
        ctx.stroke();
        drawText(ctx, toHex(result.generator[r][cc]), x + (cell - 3) / 2, y + cell / 2 + 3, result.generator[r][cc] === 0 ? "#94a3b8" : COLORS.text, 9, 720, "center");
      }
    }
  }

  function drawDecode(ctx, box, result) {
    panel(ctx, box, "Recovery equation", "erasures are solved because their locations are known");
    var x = box.x + 18;
    var y = box.y + 76;
    var statusColor = result.recoveredOk ? COLORS.recovered : COLORS.missing;
    drawText(ctx, result.recoveredOk ? "decoded exactly" : "not recoverable", x, y, statusColor, 19, 820);
    drawText(ctx, result.decoded.reason, x, y + 25, COLORS.muted, 12, 650);
    var selected = result.decoded.selected || [];
    var names = selected.map(function (index) { return shardName(index, result.params.data); }).join("  ");
    drawText(ctx, "selected rows:", x, y + 58, COLORS.muted, 11, 750);
    drawText(ctx, names || "none", x + 96, y + 58, COLORS.text, 11, 750);
    drawText(ctx, "checksum:", x, y + 86, COLORS.muted, 11, 750);
    drawText(ctx, "0x" + result.checksum.toString(16).toUpperCase(), x + 82, y + 86, COLORS.text, 11, 750);
    drawText(ctx, "recovered:", x, y + 114, COLORS.muted, 11, 750);
    drawText(ctx, result.recoveredChecksum == null ? "n/a" : "0x" + result.recoveredChecksum.toString(16).toUpperCase(), x + 82, y + 114, statusColor, 11, 750);
    var miniY = box.y + box.h - 64;
    var total = result.params.data + result.params.parity;
    var w = Math.min(30, (box.w - 36 - 5 * (total - 1)) / total);
    for (var i = 0; i < total; i += 1) {
      ctx.fillStyle = isMissing(result, i) ? (result.recoveredOk ? COLORS.recovered : COLORS.missing) : (i < result.params.data ? COLORS.data : COLORS.parity);
      roundedRect(ctx, x + i * (w + 5), miniY, w, 28, 5);
      ctx.fill();
      drawText(ctx, shardName(i, result.params.data), x + i * (w + 5) + w / 2, miniY + 18, "#ffffff", 9, 800, "center");
    }
  }

  function drawReliability(ctx, box, result) {
    panel(ctx, box, "Independent-loss sketch", "stripe unavailable probability versus shard loss rate");
    var plot = {
      x: box.x + 52,
      y: box.y + 66,
      w: box.w - 76,
      h: box.h - 112
    };
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    for (var i = 1; i < 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    var maxY = 0;
    result.curve.forEach(function (p) { maxY = Math.max(maxY, p.rs, p.raw); });
    maxY = Math.max(maxY, 0.001);
    function xScale(p) { return plot.x + (p - 0.01) / 0.29 * plot.w; }
    function yScale(v) { return plot.y + plot.h - clamp(v / maxY, 0, 1) * plot.h; }
    function drawCurve(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      result.curve.forEach(function (point, index) {
        var x = xScale(point.p);
        var y = yScale(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawCurve("raw", COLORS.raw);
    drawCurve("rs", COLORS.parity);
    var currentX = xScale(result.params.failure);
    ctx.strokeStyle = COLORS.missing;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "raw data", plot.x + 8, plot.y + 18, COLORS.raw, 11, 750);
    drawText(ctx, "RS stripe", plot.x + 8, plot.y + 36, COLORS.parity, 11, 750);
    drawText(ctx, "1%", plot.x, box.y + box.h - 20, COLORS.muted, 10, 650);
    drawText(ctx, "30%", plot.x + plot.w, box.y + box.h - 20, COLORS.muted, 10, 650, "right");
    drawText(ctx, "shard loss probability", plot.x + plot.w / 2, box.y + box.h - 20, COLORS.muted, 10, 650, "center");
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    if (width < 620) {
      var gap = 16;
      var h = 294;
      drawShards(ctx, { x: 12, y: 12, w: width - 24, h: h }, result);
      drawMatrix(ctx, { x: 12, y: 12 + h + gap, w: width - 24, h: h }, result);
      drawDecode(ctx, { x: 12, y: 12 + 2 * (h + gap), w: width - 24, h: h }, result);
      drawReliability(ctx, { x: 12, y: 12 + 3 * (h + gap), w: width - 24, h: h }, result);
      return;
    }
    var margin = 18;
    var gapX = 18;
    var gapY = 18;
    var boxW = (width - 2 * margin - gapX) / 2;
    var boxH = (setup.height - 2 * margin - gapY) / 2;
    drawShards(ctx, { x: margin, y: margin, w: boxW, h: boxH }, result);
    drawMatrix(ctx, { x: margin + boxW + gapX, y: margin, w: boxW, h: boxH }, result);
    drawDecode(ctx, { x: margin, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
    drawReliability(ctx, { x: margin + boxW + gapX, y: margin + boxH + gapY, w: boxW, h: boxH }, result);
  }

  function readParams(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(container, params) {
    var values = {
      data: String(params.data),
      parity: String(params.parity),
      erasures: String(params.erasures),
      failure: formatPercent(params.failure, 0),
      seed: String(params.seed)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function render(container) {
    var result = evaluate(readParams(container));
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("storage overhead", ((result.params.data + result.params.parity) / result.params.data).toFixed(2) + "x"),
        metric("erasures tolerated", String(result.params.parity)),
        metric("current erasures", String(result.missing.length)),
        metric("recovery", result.recoveredOk ? "exact" : "failed"),
        metric("RS loss @ p", formatProbability(result.lossProbability)),
        metric("raw loss @ p", formatProbability(result.rawLossProbability))
      ].join("");
    }
    var canvas = container.querySelector("canvas[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function mount(container) {
    var redraw = function () { render(container); };
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    render(container);
    if (root.ResizeObserver) {
      var observer = new root.ResizeObserver(function () { render(container); });
      observer.observe(container);
    }
  }

  function init() {
    if (!root.document) return;
    root.document.querySelectorAll("[data-reed-solomon-erasure-lab]").forEach(mount);
  }

  root.ReedSolomonErasureLab = {
    buildGenerator: buildGenerator,
    cleanParams: cleanParams,
    decode: decode,
    encode: encode,
    evaluate: evaluate,
    gf: {
      add: gfAdd,
      div: gfDiv,
      mul: gfMul,
      pow: gfPow
    },
    invertMatrix: invertMatrix,
    stripeLossProbability: stripeLossProbability
  };

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : this);
