(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    blue: "#2563eb",
    gold: "#d97706",
    goldSoft: "rgba(217, 119, 6, 0.14)",
    good: "#0f766e",
    goodSoft: "rgba(15, 118, 110, 0.12)",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    red: "#be123c",
    redSoft: "rgba(190, 18, 60, 0.12)",
    violet: "#7c3aed",
    violetSoft: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var BASE_MAGIC = 0x5f3759df;
  var LOMONT_MAGIC = 0x5f375a86;
  var DEFAULTS = {
    lightAngle: 38,
    magicOffset: 0,
    samples: 4096,
    span: 16,
    steps: 1
  };
  var BUFFER = new ArrayBuffer(4);
  var FLOAT = new Float32Array(BUFFER);
  var UINT = new Uint32Array(BUFFER);
  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = finite(Number(value), fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      lightAngle: snap(raw.lightAngle, DEFAULTS.lightAngle, 0, 80, 1),
      magicOffset: snap(raw.magicOffset, DEFAULTS.magicOffset, -1024, 1024, 1),
      samples: snap(raw.samples, DEFAULTS.samples, 512, 8192, 512),
      span: snap(raw.span, DEFAULTS.span, 2, 24, 1),
      steps: snap(raw.steps, DEFAULTS.steps, 0, 2, 1)
    };
  }

  function f32(value) {
    return Math.fround(value);
  }

  function floatToBits(value) {
    FLOAT[0] = f32(value);
    return UINT[0] >>> 0;
  }

  function bitsToFloat(bits) {
    UINT[0] = bits >>> 0;
    return FLOAT[0];
  }

  function hex(value) {
    return "0x" + (value >>> 0).toString(16).padStart(8, "0");
  }

  function newtonStep(x, y) {
    var x2 = f32(f32(x) * 0.5);
    var yy = f32(f32(y) * f32(y));
    return f32(f32(y) * f32(1.5 - f32(x2 * yy)));
  }

  function invSqrt(x, magic, steps) {
    if (!(x > 0)) return NaN;
    var bits = floatToBits(x);
    var guessBits = (magic - (bits >>> 1)) >>> 0;
    var y = bitsToFloat(guessBits);
    for (var i = 0; i < steps; i += 1) y = newtonStep(x, y);
    return y;
  }

  function exactInvSqrt(x) {
    return 1 / Math.sqrt(x);
  }

  function sampleX(index, count, span) {
    if (count <= 1) return 1;
    var lo = -span / 2;
    var hi = span / 2;
    var t = index / (count - 1);
    return Math.pow(2, lo + (hi - lo) * t);
  }

  function errorStats(raw) {
    var params = cleanParams(raw);
    var magic = (BASE_MAGIC + params.magicOffset) >>> 0;
    var count = params.samples;
    var maxRel = 0;
    var minSigned = Infinity;
    var maxSigned = -Infinity;
    var rmsSum = 0;
    var seedMaxRel = 0;
    var twoStepMaxRel = 0;
    var worst = null;
    var shadeMax = 0;
    var baseShade = Math.cos(params.lightAngle * Math.PI / 180);

    for (var i = 0; i < count; i += 1) {
      var x = sampleX(i, count, params.span);
      var exact = exactInvSqrt(x);
      var seed = invSqrt(x, magic, 0);
      var y = invSqrt(x, magic, params.steps);
      var two = invSqrt(x, magic, 2);
      var signed = y / exact - 1;
      var rel = Math.abs(signed);
      var seedRel = Math.abs(seed / exact - 1);
      var twoRel = Math.abs(two / exact - 1);
      var shade = Math.abs(clamp(baseShade * (1 + signed), 0, 1) - baseShade);
      rmsSum += rel * rel;
      if (rel > maxRel) {
        maxRel = rel;
        worst = { exact: exact, rel: rel, signed: signed, x: x, y: y };
      }
      seedMaxRel = Math.max(seedMaxRel, seedRel);
      twoStepMaxRel = Math.max(twoStepMaxRel, twoRel);
      minSigned = Math.min(minSigned, signed);
      maxSigned = Math.max(maxSigned, signed);
      shadeMax = Math.max(shadeMax, shade);
    }

    return {
      baseShade: baseShade,
      count: count,
      magic: magic,
      maxRel: maxRel,
      maxSigned: maxSigned,
      minSigned: minSigned,
      params: params,
      rmsRel: Math.sqrt(rmsSum / count),
      seedMaxRel: seedMaxRel,
      shadeMax: shadeMax,
      twoStepMaxRel: twoStepMaxRel,
      worst: worst
    };
  }

  function curve(raw) {
    var params = cleanParams(raw);
    var magic = (BASE_MAGIC + params.magicOffset) >>> 0;
    var points = [];
    var n = 180;
    for (var i = 0; i < n; i += 1) {
      var x = sampleX(i, n, params.span);
      var exact = exactInvSqrt(x);
      points.push({
        x: x,
        seed: Math.abs(invSqrt(x, magic, 0) / exact - 1),
        selected: Math.abs(invSqrt(x, magic, params.steps) / exact - 1),
        two: Math.abs(invSqrt(x, magic, 2) / exact - 1)
      });
    }
    return points;
  }

  function constantSweep(raw) {
    var params = cleanParams(raw);
    var points = [];
    var best = null;
    for (var offset = -512; offset <= 512; offset += 8) {
      var stats = errorStats({
        lightAngle: params.lightAngle,
        magicOffset: offset,
        samples: 768,
        span: params.span,
        steps: params.steps
      });
      var row = { maxRel: stats.maxRel, offset: offset };
      points.push(row);
      if (!best || row.maxRel < best.maxRel) best = row;
    }
    return { best: best, points: points };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var stats = errorStats(params);
    var lomont = errorStats(Object.assign({}, params, { magicOffset: LOMONT_MAGIC - BASE_MAGIC }));
    return {
      curve: curve(params),
      lomont: lomont,
      params: params,
      probe: probeRecord(2, stats.magic, params.steps),
      stats: stats,
      sweep: constantSweep(params)
    };
  }

  function probeRecord(x, magic, steps) {
    var bits = floatToBits(x);
    var shifted = bits >>> 1;
    var guessBits = (magic - shifted) >>> 0;
    var seed = bitsToFloat(guessBits);
    var y = seed;
    for (var i = 0; i < steps; i += 1) y = newtonStep(x, y);
    return {
      bits: bits,
      exact: exactInvSqrt(x),
      guessBits: guessBits,
      magic: magic,
      seed: seed,
      shifted: shifted,
      steps: steps,
      x: x,
      y: y
    };
  }

  function formatPercent(value, digits) {
    return (value * 100).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }) + "%";
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  }

  function metric(label, value, tone) {
    return '<div class="fisr-lab__metric ' + (tone || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(lab, result) {
    var audit = cachedAudit();
    var stats = result.stats;
    var metrics = [
      metric("selected magic", hex(stats.magic), stats.magic === BASE_MAGIC ? "good" : "warn"),
      metric("max rel error", formatPercent(stats.maxRel, 4), stats.params.steps >= 1 ? "good" : "warn"),
      metric("RMS rel error", formatPercent(stats.rmsRel, 4), "good"),
      metric("seed max error", formatPercent(stats.seedMaxRel, 2), "warn"),
      metric("2-step max", formatPercent(stats.twoStepMaxRel, 6), "good"),
      metric("shade error", formatPercent(stats.shadeMax, 4), stats.shadeMax < 0.002 ? "good" : "warn"),
      metric("sweep best", (result.sweep.best.offset >= 0 ? "+" : "") + result.sweep.best.offset, "good"),
      metric("Audit", audit.passed + "/" + audit.checked, audit.ok ? "good" : "bad")
    ];
    lab.querySelector("[data-metrics]").innerHTML = metrics.join("");
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(title, rect.x + 16, rect.y + 24);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "500 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, rect.x + 16, rect.y + 42);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawBits(ctx, rect, result) {
    panel(ctx, rect, "Bit-level first guess", "x = 2.0, then reinterpret the bits as an integer");
    var rows = [
      { color: COLORS.blue, label: "float bits", value: hex(result.probe.bits) },
      { color: COLORS.violet, label: "bits >> 1", value: hex(result.probe.shifted) },
      { color: COLORS.gold, label: "magic", value: hex(result.probe.magic) },
      { color: COLORS.good, label: "guess bits", value: hex(result.probe.guessBits) }
    ];
    var x = rect.x + 18;
    var y = rect.y + 70;
    var barW = rect.w - 36;
    rows.forEach(function (row, index) {
      var yy = y + index * 39;
      label(ctx, row.label, x, yy, COLORS.muted, 11, 700);
      ctx.fillStyle = row.color;
      roundRect(ctx, x + 84, yy - 15, barW - 84, 23, 5);
      ctx.fill();
      label(ctx, row.value, x + 96, yy + 1, COLORS.white, 12, 800);
    });
    var seedErr = Math.abs(result.probe.seed / result.probe.exact - 1);
    var finalErr = Math.abs(result.probe.y / result.probe.exact - 1);
    if (rect.w < 330) {
      label(ctx, "seed error " + formatPercent(seedErr, 2), x, rect.y + rect.h - 42, COLORS.gold, 12, 800);
      label(ctx, "after " + result.probe.steps + " step(s) error " + formatPercent(finalErr, 5), x, rect.y + rect.h - 20, COLORS.good, 12, 800);
    } else {
      label(ctx, "seed y = " + formatNumber(result.probe.seed, 6) + "  error " + formatPercent(seedErr, 2), x, rect.y + rect.h - 42, COLORS.gold, 12, 800);
      label(ctx, result.probe.steps + " Newton step(s): y = " + formatNumber(result.probe.y, 8) + "  error " + formatPercent(finalErr, 5), x, rect.y + rect.h - 20, COLORS.good, 12, 800);
    }
  }

  function drawErrorCurve(ctx, rect, result) {
    panel(ctx, rect, "Error over scale", "log-spaced x values; lower is better");
    var gx = rect.x + 54;
    var gy = rect.y + 62;
    var gw = rect.w - 82;
    var gh = rect.h - 104;
    var maxY = Math.max.apply(null, result.curve.map(function (p) { return p.seed; }));
    maxY = Math.max(maxY, result.stats.maxRel) * 1.05;
    function xFor(point) {
      var lo = -result.params.span / 2;
      var hi = result.params.span / 2;
      return gx + gw * ((Math.log2(point.x) - lo) / (hi - lo));
    }
    function yFor(value) {
      return gy + gh - gh * clamp(value / maxY, 0, 1);
    }
    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      line(ctx, gx, yy, gx + gw, yy, COLORS.grid, 1);
      label(ctx, formatPercent(maxY * (1 - i / 4), 1), gx - 8, yy + 4, COLORS.muted, 10, 600, "right");
    }
    line(ctx, gx, gy, gx, gy + gh, COLORS.axis, 1);
    line(ctx, gx, gy + gh, gx + gw, gy + gh, COLORS.axis, 1);
    ["seed", "selected", "two"].forEach(function (key) {
      var color = key === "seed" ? COLORS.gold : key === "two" ? COLORS.violet : COLORS.good;
      ctx.beginPath();
      result.curve.forEach(function (point, index) {
        var x = xFor(point);
        var y = yFor(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = key === "selected" ? 3 : 2;
      ctx.stroke();
    });
    if (rect.w < 330) {
      label(ctx, "seed", gx + 8, gy + 16, COLORS.gold, 10, 800);
      label(ctx, "selected", gx + 58, gy + 16, COLORS.good, 10, 800);
      label(ctx, "2 steps", gx + 136, gy + 16, COLORS.violet, 10, 800);
    } else {
      label(ctx, "seed", gx + 8, gy + 16, COLORS.gold, 11, 800);
      label(ctx, "selected", gx + 56, gy + 16, COLORS.good, 11, 800);
      label(ctx, "2 steps", gx + 132, gy + 16, COLORS.violet, 11, 800);
    }
    [-result.params.span / 2, 0, result.params.span / 2].forEach(function (e) {
      var x = gx + gw * ((e + result.params.span / 2) / result.params.span);
      line(ctx, x, gy + gh, x, gy + gh + 5, COLORS.axis, 1);
      label(ctx, "2^" + e, x, gy + gh + 20, COLORS.muted, 10, 600, "center");
    });
  }

  function drawSweep(ctx, rect, result) {
    panel(ctx, rect, "Constant audition", "max relative error near 0x5f3759df");
    var points = result.sweep.points;
    var gx = rect.x + 48;
    var gy = rect.y + 60;
    var gw = rect.w - 76;
    var gh = rect.h - 104;
    var maxY = Math.max.apply(null, points.map(function (p) { return p.maxRel; })) * 1.03;
    var minY = Math.min.apply(null, points.map(function (p) { return p.maxRel; })) * 0.94;
    function xFor(offset) {
      return gx + gw * ((offset + 512) / 1024);
    }
    function yFor(value) {
      return gy + gh - gh * ((value - minY) / Math.max(1e-12, maxY - minY));
    }
    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      line(ctx, gx, yy, gx + gw, yy, COLORS.grid, 1);
    }
    line(ctx, gx, gy + gh, gx + gw, gy + gh, COLORS.axis, 1);
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xFor(point.offset);
      var y = yFor(point.maxRel);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.good;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    line(ctx, xFor(0), gy, xFor(0), gy + gh, COLORS.gold, 2);
    line(ctx, xFor(result.params.magicOffset), gy, xFor(result.params.magicOffset), gy + gh, COLORS.violet, 2);
    line(ctx, xFor(result.sweep.best.offset), gy, xFor(result.sweep.best.offset), gy + gh, COLORS.red, 1.5);
    label(ctx, "Quake", xFor(0) + 4, gy + 14, COLORS.gold, 10, 800);
    label(ctx, "selected", xFor(result.params.magicOffset) + 4, gy + 32, COLORS.violet, 10, 800);
    label(ctx, "best " + (result.sweep.best.offset >= 0 ? "+" : "") + result.sweep.best.offset, gx, rect.y + rect.h - 23, COLORS.red, 12, 800);
    label(ctx, "Lomont +167: " + formatPercent(result.lomont.maxRel, 4), rect.x + rect.w - 18, rect.y + rect.h - 23, COLORS.muted, 11, 650, "right");
  }

  function drawNormal(ctx, rect, result) {
    panel(ctx, rect, "Normal-length error", "one bad scale changes diffuse lighting");
    var cx = rect.x + rect.w * 0.32;
    var cy = rect.y + rect.h * 0.58;
    var r = Math.min(rect.w, rect.h) * 0.24;
    var signed = result.stats.worst.signed;
    var approxR = r * (1 + signed);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = signed >= 0 ? COLORS.red : COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, approxR, 0, Math.PI * 2);
    ctx.stroke();
    var angle = -Math.PI / 4;
    line(ctx, cx, cy, cx + r * Math.cos(angle), cy + r * Math.sin(angle), COLORS.good, 3);
    line(ctx, cx, cy, cx + approxR * Math.cos(angle), cy + approxR * Math.sin(angle), signed >= 0 ? COLORS.red : COLORS.gold, 3);
    var stripX = rect.x + rect.w * 0.60;
    var stripY = rect.y + 70;
    var stripW = rect.w * 0.30;
    var stripH = rect.h - 118;
    for (var i = 0; i < stripH; i += 1) {
      var t = 1 - i / stripH;
      var exactShade = clamp(t, 0, 1);
      var approxShade = clamp(t * (1 + signed), 0, 1);
      ctx.fillStyle = "rgb(" + Math.round(28 + 210 * exactShade) + "," + Math.round(34 + 190 * exactShade) + "," + Math.round(48 + 150 * exactShade) + ")";
      ctx.fillRect(stripX, stripY + i, stripW / 2 - 3, 1);
      ctx.fillStyle = "rgb(" + Math.round(28 + 210 * approxShade) + "," + Math.round(34 + 190 * approxShade) + "," + Math.round(48 + 150 * approxShade) + ")";
      ctx.fillRect(stripX + stripW / 2 + 3, stripY + i, stripW / 2 - 3, 1);
    }
    label(ctx, "exact", stripX + stripW * 0.25, stripY + stripH + 18, COLORS.muted, 10, 700, "center");
    label(ctx, "approx", stripX + stripW * 0.75, stripY + stripH + 18, COLORS.muted, 10, 700, "center");
    label(ctx, "worst x = " + formatNumber(result.stats.worst.x, 4), rect.x + 18, rect.y + rect.h - 44, COLORS.ink, 12, 800);
    label(ctx, "normal scale error " + formatPercent(signed, 4), rect.x + 18, rect.y + rect.h - 22, signed >= 0 ? COLORS.red : COLORS.gold, 12, 800);
  }

  function draw(ctx, result) {
    var canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var gap = 18;
    var left = 20;
    var top = 20;
    if (canvas.width < 540) {
      var panelW = canvas.width - left * 2;
      var panelH = (canvas.height - top * 2 - gap * 3) / 4;
      drawBits(ctx, { x: left, y: top, w: panelW, h: panelH }, result);
      drawErrorCurve(ctx, { x: left, y: top + (panelH + gap), w: panelW, h: panelH }, result);
      drawSweep(ctx, { x: left, y: top + (panelH + gap) * 2, w: panelW, h: panelH }, result);
      drawNormal(ctx, { x: left, y: top + (panelH + gap) * 3, w: panelW, h: panelH }, result);
    } else {
      var colW = (canvas.width - left * 2 - gap) / 2;
      var rowH = (canvas.height - top * 2 - gap) / 2;
      drawBits(ctx, { x: left, y: top, w: colW, h: rowH }, result);
      drawErrorCurve(ctx, { x: left + colW + gap, y: top, w: colW, h: rowH }, result);
      drawSweep(ctx, { x: left, y: top + rowH + gap, w: colW, h: rowH }, result);
      drawNormal(ctx, { x: left + colW + gap, y: top + rowH + gap, w: colW, h: rowH }, result);
    }
  }

  function resizeCanvas(canvas) {
    var cssWidth = canvas.clientWidth || canvas.width;
    var cssHeight = cssWidth < 540 ? 1160 : Math.max(620, Math.round(cssWidth * 0.78));
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth);
    canvas.height = cssHeight;
    return canvas.getContext("2d");
  }

  function readParams(lab) {
    var raw = {};
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncOutputs(lab, params) {
    Object.keys(params).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (!out) return;
      if (key === "magicOffset") out.textContent = (params[key] >= 0 ? "+" : "") + params[key];
      else if (key === "lightAngle") out.textContent = params[key] + " deg";
      else if (key === "span") out.textContent = "2^" + (-params[key] / 2) + " to 2^" + (params[key] / 2);
      else out.textContent = String(params[key]);
    });
  }

  function init(lab) {
    var canvas = lab.querySelector("canvas");
    function update() {
      var params = readParams(lab);
      syncOutputs(lab, params);
      var result = evaluate(params);
      renderMetrics(lab, result);
      draw(resizeCanvas(canvas), result);
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    global.addEventListener("resize", update);
    update();
  }

  function runAudit() {
    var checks = [];
    function record(name, ok, detail) {
      checks.push({ detail: detail || "", name: name, ok: Boolean(ok) });
    }

    var cleaned = cleanParams({ lightAngle: 200, magicOffset: 9999, samples: 11, span: 99, steps: 8 });
    record("parameter cleanup clamps", cleaned.lightAngle === 80 && cleaned.magicOffset === 1024 && cleaned.samples === 512 && cleaned.span === 24 && cleaned.steps === 2);
    record("float32 bit roundtrip", floatToBits(1) === 0x3f800000 && bitsToFloat(0x40000000) === 2);

    var probe = probeRecord(1, BASE_MAGIC, 1);
    record("quake seed bits for x=1", probe.guessBits === 0x3f7759df);
    record("one Newton step near known qrsqrt(1)", Math.abs(probe.y - 0.9983071684837341) < 1e-9, String(probe.y));

    var defaultStats = errorStats(DEFAULTS);
    record("default max error is the classic rough range", defaultStats.maxRel > 0.0016 && defaultStats.maxRel < 0.0019, String(defaultStats.maxRel));
    record("second Newton step sharply reduces error", defaultStats.twoStepMaxRel < defaultStats.maxRel / 250, String(defaultStats.twoStepMaxRel));

    var lomontStats = errorStats(Object.assign({}, DEFAULTS, { magicOffset: LOMONT_MAGIC - BASE_MAGIC }));
    record("Lomont constant is not worse on default grid", lomontStats.maxRel <= defaultStats.maxRel * 1.01, String(lomontStats.maxRel));

    var sweep = constantSweep(DEFAULTS);
    record("constant sweep finds a local improvement", sweep.best.maxRel <= defaultStats.maxRel && sweep.points.length === 129, String(sweep.best.offset));

    var noNewton = errorStats(Object.assign({}, DEFAULTS, { steps: 0 }));
    record("Newton improves seed by more than an order", defaultStats.maxRel < noNewton.maxRel / 10, String(noNewton.maxRel));

    return {
      checked: checks.length,
      failures: checks.filter(function (row) { return !row.ok; }),
      ok: checks.every(function (row) { return row.ok; }),
      passed: checks.filter(function (row) { return row.ok; }).length
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  var api = {
    BASE_MAGIC: BASE_MAGIC,
    LOMONT_MAGIC: LOMONT_MAGIC,
    bitsToFloat: bitsToFloat,
    cleanParams: cleanParams,
    errorStats: errorStats,
    evaluate: evaluate,
    floatToBits: floatToBits,
    invSqrt: invSqrt,
    runAudit: runAudit
  };

  global.FastInvSqrtLab = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-fisr-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-fisr-lab]")).forEach(init);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
