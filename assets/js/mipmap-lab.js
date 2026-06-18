(function (global) {
  "use strict";

  var SIZE = 256;
  var OUT_W = 160;
  var OUT_H = 84;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    point: "#be123c",
    mip: "#0f766e",
    ref: "#2563eb",
    level: "#7c3aed",
    white: "#ffffff"
  };

  var DEFAULTS = {
    frequency: 18,
    footprint: 6,
    phase: 17,
    contrast: 85,
    levels: 8
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      frequency: clamp(Math.round(Number(raw.frequency == null ? DEFAULTS.frequency : raw.frequency)), 4, 48),
      footprint: clamp(Number(raw.footprint == null ? DEFAULTS.footprint : raw.footprint), 1, 32),
      phase: clamp(Math.round(Number(raw.phase == null ? DEFAULTS.phase : raw.phase)), 0, 255),
      contrast: clamp(Math.round(Number(raw.contrast == null ? DEFAULTS.contrast : raw.contrast)), 20, 100),
      levels: clamp(Math.round(Number(raw.levels == null ? DEFAULTS.levels : raw.levels)), 1, 8)
    };
  }

  function wrap(value, size) {
    value = value % size;
    return value < 0 ? value + size : value;
  }

  function makeTexture(params) {
    var data = new Float32Array(SIZE * SIZE);
    var contrast = params.contrast / 100;
    for (var y = 0; y < SIZE; y += 1) {
      for (var x = 0; x < SIZE; x += 1) {
        var checker = ((Math.floor(x * params.frequency / SIZE) + Math.floor(y * params.frequency / SIZE)) & 1) ? 1 : -1;
        var diagonal = Math.sin(2 * Math.PI * params.frequency * 0.73 * (x + 0.61 * y) / SIZE);
        var rings = Math.sin(2 * Math.PI * params.frequency * Math.sqrt((x - 128) * (x - 128) + (y - 128) * (y - 128)) / (SIZE * 0.9));
        var value = 0.5 + 0.22 * contrast * checker + 0.16 * contrast * diagonal + 0.09 * contrast * rings;
        data[y * SIZE + x] = clamp(value, 0, 1);
      }
    }
    return { size: SIZE, data: data };
  }

  function buildPyramid(base, maxLevels) {
    var levels = [base];
    while (levels.length < maxLevels && levels[levels.length - 1].size > 1) {
      var prev = levels[levels.length - 1];
      var size = Math.max(1, prev.size >> 1);
      var data = new Float32Array(size * size);
      for (var y = 0; y < size; y += 1) {
        for (var x = 0; x < size; x += 1) {
          var sx = x * 2;
          var sy = y * 2;
          var a = prev.data[wrap(sy, prev.size) * prev.size + wrap(sx, prev.size)];
          var b = prev.data[wrap(sy, prev.size) * prev.size + wrap(sx + 1, prev.size)];
          var c = prev.data[wrap(sy + 1, prev.size) * prev.size + wrap(sx, prev.size)];
          var d = prev.data[wrap(sy + 1, prev.size) * prev.size + wrap(sx + 1, prev.size)];
          data[y * size + x] = (a + b + c + d) * 0.25;
        }
      }
      levels.push({ size: size, data: data });
    }
    return levels;
  }

  function sampleNearest(level, u, v) {
    var x = Math.floor(wrap(u, level.size));
    var y = Math.floor(wrap(v, level.size));
    return level.data[y * level.size + x];
  }

  function sampleBilinear(level, u, v) {
    var size = level.size;
    var x = wrap(u - 0.5, size);
    var y = wrap(v - 0.5, size);
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var tx = x - x0;
    var ty = y - y0;
    var x1 = wrap(x0 + 1, size);
    var y1 = wrap(y0 + 1, size);
    x0 = wrap(x0, size);
    y0 = wrap(y0, size);
    var a = level.data[y0 * size + x0];
    var b = level.data[y0 * size + x1];
    var c = level.data[y1 * size + x0];
    var d = level.data[y1 * size + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  function sampleMipmap(levels, u, v, footprint) {
    var lod = Math.max(0, Math.log(footprint) / Math.LN2);
    var lo = Math.min(levels.length - 1, Math.floor(lod));
    var hi = Math.min(levels.length - 1, lo + 1);
    var t = Math.min(1, Math.max(0, lod - lo));
    var scaleLo = levels[lo].size / SIZE;
    var scaleHi = levels[hi].size / SIZE;
    var a = sampleBilinear(levels[lo], u * scaleLo, v * scaleLo);
    var b = sampleBilinear(levels[hi], u * scaleHi, v * scaleHi);
    return a * (1 - t) + b * t;
  }

  function sampleReference(base, u, v, footprint) {
    var n = footprint <= 2 ? 5 : (footprint <= 10 ? 7 : 9);
    var sum = 0;
    for (var y = 0; y < n; y += 1) {
      for (var x = 0; x < n; x += 1) {
        var ox = ((x + 0.5) / n - 0.5) * footprint;
        var oy = ((y + 0.5) / n - 0.5) * footprint;
        sum += sampleBilinear(base, u + ox, v + oy);
      }
    }
    return sum / (n * n);
  }

  function renderImages(params, levels) {
    var point = new Float32Array(OUT_W * OUT_H);
    var mip = new Float32Array(OUT_W * OUT_H);
    var ref = new Float32Array(OUT_W * OUT_H);
    for (var y = 0; y < OUT_H; y += 1) {
      for (var x = 0; x < OUT_W; x += 1) {
        var u = params.phase + (x + 0.5) * params.footprint + y * params.footprint * 0.13;
        var v = params.phase * 0.67 + (y + 0.5) * params.footprint * 0.82 + x * params.footprint * 0.07;
        var i = y * OUT_W + x;
        point[i] = sampleNearest(levels[0], u, v);
        mip[i] = sampleMipmap(levels, u, v, params.footprint);
        ref[i] = sampleReference(levels[0], u, v, params.footprint);
      }
    }
    return { point: point, mip: mip, ref: ref, width: OUT_W, height: OUT_H };
  }

  function rms(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) {
      var d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum / Math.max(1, a.length));
  }

  function mean(data) {
    var sum = 0;
    for (var i = 0; i < data.length; i += 1) sum += data[i];
    return sum / Math.max(1, data.length);
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var base = makeTexture(params);
    var levels = buildPyramid(base, params.levels);
    var images = renderImages(params, levels);
    var result = {
      params: params,
      levels: levels,
      images: images,
      selectedLod: Math.max(0, Math.log(params.footprint) / Math.LN2),
      pointRms: rms(images.point, images.ref),
      mipRms: rms(images.mip, images.ref),
      pointMean: mean(images.point),
      mipMean: mean(images.mip),
      refMean: mean(images.ref)
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    check("pyramid starts with 256 square texture", result.levels[0].size === SIZE);
    check("pyramid sizes halve", result.levels.every(function (level, i, arr) {
      return i === 0 || level.size === Math.max(1, arr[i - 1].size >> 1);
    }));
    check("mipmap beats point on default minification", result.params.footprint < 2 || result.mipRms <= result.pointRms);
    check("sample means remain bounded", [result.pointMean, result.mipMean, result.refMean].every(function (value) {
      return value >= 0 && value <= 1 && Number.isFinite(value);
    }));
    check("selected LOD matches footprint", Math.abs(result.selectedLod - Math.log(result.params.footprint) / Math.LN2) < 1e-12);

    var flat = { size: 4, data: new Float32Array(16) };
    for (var i = 0; i < 16; i += 1) flat.data[i] = 0.375;
    var pyr = buildPyramid(flat, 3);
    check("downsampling preserves constants", Math.abs(pyr[2].data[0] - 0.375) < 1e-12);

    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    return [
      {},
      { frequency: 8, footprint: 2, phase: 0, contrast: 60, levels: 6 },
      { frequency: 28, footprint: 12, phase: 91, contrast: 90, levels: 8 },
      { frequency: 40, footprint: 24, phase: 43, contrast: 75, levels: 8 }
    ].map(function (row) {
      var result = evaluate(row);
      return {
        params: result.params,
        pointRms: result.pointRms,
        mipRms: result.mipRms,
        selectedLod: result.selectedLod,
        passed: result.audit.passed,
        checks: result.audit.checks
      };
    });
  }

  function metric(label, value, className) {
    return '<div class="mipmap-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 700 ? 860 : 660;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function imageDataFromFloat(ctx, data, width, height) {
    var image = ctx.createImageData(width, height);
    for (var i = 0; i < data.length; i += 1) {
      var c = Math.round(clamp(data[i], 0, 1) * 255);
      image.data[i * 4] = c;
      image.data[i * 4 + 1] = c;
      image.data[i * 4 + 2] = c;
      image.data[i * 4 + 3] = 255;
    }
    return image;
  }

  function drawFloatImage(ctx, data, width, height, x, y, w, h) {
    var off = global.document ? global.document.createElement("canvas") : null;
    if (!off) return;
    off.width = width;
    off.height = height;
    var octx = off.getContext("2d");
    octx.putImageData(imageDataFromFloat(octx, data, width, height), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  function drawSourcePanel(ctx, box, result) {
    panel(ctx, box, "source texture and pyramid", "each level averages 2x2 texel neighborhoods");
    var left = box.x + 16;
    var top = box.y + 58;
    var size = Math.min(box.w * 0.45, box.h - 78);
    drawFloatImage(ctx, result.levels[0].data, result.levels[0].size, result.levels[0].size, left, top, size, size);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, size, size);
    var px = left + size + 18;
    var py = top;
    result.levels.slice(1, 7).forEach(function (level, i) {
      var s = Math.max(12, Math.round(size / Math.pow(2, i + 1)));
      drawFloatImage(ctx, level.data, level.size, level.size, px, py, s, s);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(px, py, s, s);
      text(ctx, level.size + "x" + level.size, px + s + 8, py + Math.min(14, s), COLORS.muted, 10, 650);
      py += s + 10;
    });
    text(ctx, "chosen LOD " + formatNumber(result.selectedLod, 2), left, box.y + box.h - 18, COLORS.level, 12, 760);
  }

  function drawSamplesPanel(ctx, box, result) {
    panel(ctx, box, "minified render", "point sample, mip sample, and supersampled reference");
    var labels = [
      ["point", result.images.point, COLORS.point, result.pointRms],
      ["mipmap", result.images.mip, COLORS.mip, result.mipRms],
      ["reference", result.images.ref, COLORS.ref, 0]
    ];
    var gap = 10;
    var left = box.x + 14;
    var top = box.y + 60;
    var rowH = Math.floor((box.h - 88 - gap * 2) / 3);
    labels.forEach(function (row, i) {
      var y = top + i * (rowH + gap);
      drawFloatImage(ctx, row[1], result.images.width, result.images.height, left + 76, y, box.w - 96, rowH);
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(left + 76, y, box.w - 96, rowH);
      text(ctx, row[0], left, y + 18, row[2], 12, 760);
      text(ctx, i < 2 ? "RMS " + formatNumber(row[3], 4) : "truth", left, y + 36, COLORS.muted, 10, 650);
    });
  }

  function drawErrorPanel(ctx, box, result) {
    panel(ctx, box, "error ledger", "lower RMS against the supersampled image is better");
    var left = box.x + 34;
    var top = box.y + 74;
    var right = box.x + box.w - 26;
    var max = Math.max(result.pointRms, result.mipRms, 0.001);
    [
      ["point sample", result.pointRms, COLORS.point],
      ["mipmap sample", result.mipRms, COLORS.mip]
    ].forEach(function (row, i) {
      var y = top + i * 58;
      var w = (right - left - 100) * row[1] / max;
      text(ctx, row[0], left, y, COLORS.text, 12, 700);
      ctx.fillStyle = row[2];
      ctx.fillRect(left, y + 12, Math.max(1, w), 18);
      text(ctx, formatNumber(row[1], 4), left + Math.max(1, w) + 10, y + 27, row[2], 12, 760);
    });
    var improvement = result.pointRms > 0 ? 1 - result.mipRms / result.pointRms : 0;
    text(ctx, "mipmap error reduction: " + Math.round(100 * improvement) + "%", left, box.y + box.h - 28, improvement >= 0 ? COLORS.mip : COLORS.point, 12, 760);
  }

  function drawFootprintPanel(ctx, box, result) {
    panel(ctx, box, "pixel footprint", "one screen pixel covers many texels when the texture is minified");
    var left = box.x + 30;
    var top = box.y + 70;
    var scale = Math.min(7, (box.w - 80) / Math.max(16, result.params.footprint * 3));
    var texels = Math.ceil(Math.max(8, result.params.footprint * 2.5));
    for (var y = 0; y < texels; y += 1) {
      for (var x = 0; x < texels; x += 1) {
        ctx.fillStyle = ((x + y) & 1) ? "#edf2f7" : "#d7dee5";
        ctx.fillRect(left + x * scale, top + y * scale, scale - 0.5, scale - 0.5);
      }
    }
    var fp = result.params.footprint * scale;
    ctx.strokeStyle = COLORS.level;
    ctx.lineWidth = 2;
    ctx.strokeRect(left + texels * scale * 0.5 - fp * 0.5, top + texels * scale * 0.5 - fp * 0.5, fp, fp);
    text(ctx, formatNumber(result.params.footprint, 1) + " texels per screen pixel", left, box.y + box.h - 34, COLORS.level, 12, 760);
    text(ctx, "LOD = log2(footprint)", left, box.y + box.h - 16, COLORS.muted, 11, 650);
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    if (width < 700) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawSourcePanel(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawSamplesPanel(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawErrorPanel(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawFootprintPanel(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.47);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawSourcePanel(ctx, { x: 0, y: 0, w: leftW, h: height }, result);
      drawSamplesPanel(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawErrorPanel(ctx, { x: leftW + gap2, y: upperH + gap2, w: Math.round((rightW - gap2) * 0.55), h: height - upperH - gap2 }, result);
      drawFootprintPanel(ctx, { x: leftW + gap2 + Math.round((rightW - gap2) * 0.55) + gap2, y: upperH + gap2, w: rightW - Math.round((rightW - gap2) * 0.55) - gap2, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      frequency: String(result.params.frequency),
      footprint: result.params.footprint.toFixed(1),
      phase: String(result.params.phase),
      contrast: result.params.contrast + "%",
      levels: String(result.params.levels)
    };
    Object.keys(values).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input && input.value !== String(result.params[key])) input.value = String(result.params[key]);
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Point RMS", formatNumber(result.pointRms, 4), "mipmap-lab__metric--bad"),
        metric("Mipmap RMS", formatNumber(result.mipRms, 4), result.mipRms <= result.pointRms ? "mipmap-lab__metric--good" : "mipmap-lab__metric--bad"),
        metric("Selected LOD", formatNumber(result.selectedLod, 2)),
        metric("Levels built", String(result.levels.length)),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "mipmap-lab__metric--good" : "mipmap-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "The reference image averages many samples over the pixel footprint. The mipmap approximates that prefilter with a small pyramid lookup.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__mipmapResult = result;
  }

  function init(root) {
    if (!root || root.__mipmapReady) return;
    root.__mipmapReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-mipmap-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    buildPyramid: buildPyramid,
    evaluate: evaluate,
    makeTexture: makeTexture,
    sampleMipmap: sampleMipmap,
    sampleReference: sampleReference
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.MipmapLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
