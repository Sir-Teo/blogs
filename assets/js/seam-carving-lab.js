(function (root) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    low: "#2b6cb0",
    mid: "#0f766e",
    high: "#d97706",
    seam: "#e11d48",
    subject: "#7c3aed",
    forward: "#2563eb"
  };

  var SCENES = {
    plaza: {
      label: "plaza",
      cx: 0.56,
      cy: 0.58,
      rx: 0.115,
      ry: 0.215
    },
    poster: {
      label: "poster wall",
      cx: 0.43,
      cy: 0.56,
      rx: 0.14,
      ry: 0.22
    },
    shore: {
      label: "shoreline",
      cx: 0.62,
      cy: 0.55,
      rx: 0.13,
      ry: 0.18
    }
  };

  var DEFAULTS = {
    scene: "plaza",
    seams: 34,
    protection: 650,
    mode: "backward",
    width: 104,
    height: 70
  };

  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var scene = Object.prototype.hasOwnProperty.call(SCENES, raw.scene) ? raw.scene : DEFAULTS.scene;
    var mode = raw.mode === "forward" ? "forward" : DEFAULTS.mode;
    var maxSeams = DEFAULTS.width - 28;
    return {
      scene: scene,
      mode: mode,
      seams: clamp(Math.round(finite(raw.seams == null ? DEFAULTS.seams : raw.seams, DEFAULTS.seams)), 0, maxSeams),
      protection: clamp(Math.round(finite(raw.protection == null ? DEFAULTS.protection : raw.protection, DEFAULTS.protection)), 0, 1000),
      width: DEFAULTS.width,
      height: DEFAULTS.height
    };
  }

  function mix(a, b, t) {
    return [
      a[0] * (1 - t) + b[0] * t,
      a[1] * (1 - t) + b[1] * t,
      a[2] * (1 - t) + b[2] * t
    ];
  }

  function shade(rgb, k) {
    return [
      clamp(rgb[0] * k, 0, 1),
      clamp(rgb[1] * k, 0, 1),
      clamp(rgb[2] * k, 0, 1)
    ];
  }

  function luminanceAt(image, x, y) {
    x = clamp(x, 0, image.width - 1);
    y = clamp(y, 0, image.height - 1);
    var i = (y * image.width + x) * 3;
    return 0.2126 * image.pixels[i] + 0.7152 * image.pixels[i + 1] + 0.0722 * image.pixels[i + 2];
  }

  function rgbDistanceAt(image, ax, ay, bx, by) {
    ax = clamp(ax, 0, image.width - 1);
    ay = clamp(ay, 0, image.height - 1);
    bx = clamp(bx, 0, image.width - 1);
    by = clamp(by, 0, image.height - 1);
    var ai = (ay * image.width + ax) * 3;
    var bi = (by * image.width + bx) * 3;
    var dr = image.pixels[ai] - image.pixels[bi];
    var dg = image.pixels[ai + 1] - image.pixels[bi + 1];
    var db = image.pixels[ai + 2] - image.pixels[bi + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function pattern(x, y) {
    return Math.sin(x * 47.0 + y * 13.0) * 0.5 + Math.sin(x * 17.0 - y * 31.0) * 0.5;
  }

  function makeBaseImage(sceneName) {
    var scene = SCENES[sceneName] || SCENES.plaza;
    var w = DEFAULTS.width;
    var h = DEFAULTS.height;
    var pixels = new Float64Array(w * h * 3);
    var mask = new Float64Array(w * h);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var nx = x / (w - 1);
        var ny = y / (h - 1);
        var rgb;
        var m = 0;
        if (sceneName === "shore") {
          rgb = shorePixel(nx, ny);
          m = boatMask(nx, ny, scene);
          if (m > 0) rgb = boatPixel(nx, ny, scene, m);
        } else if (sceneName === "poster") {
          rgb = posterPixel(nx, ny);
          m = statueMask(nx, ny, scene);
          if (m > 0) rgb = statuePixel(nx, ny, scene, m);
        } else {
          rgb = plazaPixel(nx, ny);
          m = umbrellaMask(nx, ny, scene);
          if (m > 0) rgb = umbrellaPixel(nx, ny, scene, m);
        }
        var i = (y * w + x) * 3;
        pixels[i] = rgb[0];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[2];
        mask[y * w + x] = m;
      }
    }
    return {
      width: w,
      height: h,
      pixels: pixels,
      mask: mask,
      scene: sceneName,
      originalSubject: countMask(mask)
    };
  }

  function plazaPixel(nx, ny) {
    var sky = mix([0.70, 0.86, 0.96], [0.96, 0.82, 0.58], clamp((ny - 0.02) / 0.44, 0, 1));
    var pavement = mix([0.84, 0.80, 0.69], [0.62, 0.60, 0.55], clamp((ny - 0.45) / 0.55, 0, 1));
    var rgb = ny < 0.46 ? sky : pavement;
    if (ny > 0.43) {
      var grid = Math.abs(Math.sin((nx + ny * 0.28) * 94)) < 0.055 || Math.abs(Math.sin(ny * 145)) < 0.035;
      if (grid) rgb = mix(rgb, [0.48, 0.49, 0.48], 0.42);
      rgb = shade(rgb, 0.93 + 0.08 * pattern(nx, ny));
    }
    if (nx < 0.19 && ny > 0.15 && ny < 0.78) {
      rgb = mix([0.45, 0.52, 0.57], [0.18, 0.25, 0.30], (nx % 0.055) / 0.055);
      if (Math.abs(Math.sin(ny * 78)) < 0.08) rgb = mix(rgb, [0.93, 0.96, 0.96], 0.45);
    }
    if (nx > 0.77 && ny > 0.12 && ny < 0.70) {
      rgb = mix([0.77, 0.66, 0.47], [0.39, 0.26, 0.19], (nx - 0.77) / 0.23);
      if (Math.abs(Math.sin(ny * 92)) < 0.07) rgb = mix(rgb, [0.98, 0.91, 0.55], 0.48);
    }
    return rgb;
  }

  function umbrellaMask(nx, ny, scene) {
    var dx = (nx - scene.cx) / scene.rx;
    var dy = (ny - scene.cy) / scene.ry;
    var canopy = dx * dx + dy * dy < 1 && ny < scene.cy + scene.ry * 0.18;
    var handle = Math.abs(nx - scene.cx) < 0.018 && ny > scene.cy - 0.02 && ny < scene.cy + 0.25;
    return canopy || handle ? 1 : 0;
  }

  function umbrellaPixel(nx, ny, scene, m) {
    var dx = (nx - scene.cx) / scene.rx;
    var dy = (ny - scene.cy) / scene.ry;
    if (Math.abs(nx - scene.cx) < 0.018 && ny > scene.cy - 0.02) return [0.31, 0.22, 0.18];
    var stripe = Math.floor((dx + 1) * 3.2) % 2 === 0;
    var base = stripe ? [0.91, 0.14, 0.16] : [0.98, 0.57, 0.13];
    return shade(base, 0.88 + 0.10 * (1 - dy));
  }

  function posterPixel(nx, ny) {
    var rgb = mix([0.88, 0.84, 0.74], [0.45, 0.48, 0.52], ny);
    if (ny < 0.32) rgb = mix([0.58, 0.71, 0.86], [0.90, 0.86, 0.75], ny / 0.32);
    var col = Math.floor(nx * 9);
    if (ny > 0.22 && ny < 0.84 && col % 2 === 0) {
      rgb = mix(rgb, [0.18, 0.25, 0.35], 0.38);
    }
    if (ny > 0.22 && ny < 0.84 && Math.abs(Math.sin(nx * 38)) < 0.12) {
      rgb = mix(rgb, [0.99, 0.90, 0.36], 0.42);
    }
    if (ny > 0.72 && Math.abs(Math.sin((nx - ny * 0.1) * 88)) < 0.05) {
      rgb = mix(rgb, [0.22, 0.19, 0.15], 0.5);
    }
    return shade(rgb, 0.94 + 0.06 * pattern(nx, ny));
  }

  function statueMask(nx, ny, scene) {
    var dx = (nx - scene.cx) / scene.rx;
    var dy = (ny - scene.cy) / scene.ry;
    var body = dx * dx + dy * dy < 1;
    var plinth = Math.abs(nx - scene.cx) < scene.rx * 0.9 && ny > scene.cy + scene.ry * 0.78 && ny < scene.cy + scene.ry * 1.08;
    return body || plinth ? 1 : 0;
  }

  function statuePixel(nx, ny, scene, m) {
    if (ny > scene.cy + scene.ry * 0.78) return [0.30, 0.30, 0.32];
    var glow = 1 - Math.abs(nx - scene.cx) / scene.rx;
    return shade([0.74, 0.74, 0.70], 0.78 + 0.20 * clamp(glow, 0, 1));
  }

  function shorePixel(nx, ny) {
    var rgb = ny < 0.50 ? mix([0.58, 0.77, 0.94], [0.90, 0.92, 0.87], ny / 0.5) : mix([0.18, 0.46, 0.60], [0.08, 0.30, 0.45], (ny - 0.5) / 0.5);
    if (ny > 0.49) {
      if (Math.abs(Math.sin((nx * 5 + ny) * 22)) < 0.10) rgb = mix(rgb, [0.90, 0.95, 0.94], 0.42);
      rgb = shade(rgb, 0.95 + 0.08 * pattern(nx, ny));
    }
    if (nx < 0.22 && ny > 0.35 && ny < 0.68) rgb = mix(rgb, [0.29, 0.34, 0.28], 0.55);
    if (nx > 0.78 && ny > 0.30 && ny < 0.72) rgb = mix(rgb, [0.55, 0.46, 0.34], 0.52);
    return rgb;
  }

  function boatMask(nx, ny, scene) {
    var hull = Math.abs(nx - scene.cx) / scene.rx + Math.abs(ny - (scene.cy + 0.12)) / (scene.ry * 0.32) < 1;
    var sail = nx > scene.cx - scene.rx * 0.18 && nx < scene.cx + scene.rx * 0.85 && ny < scene.cy + 0.09 && ny > scene.cy - scene.ry;
    var mast = Math.abs(nx - scene.cx) < 0.014 && ny > scene.cy - scene.ry * 0.95 && ny < scene.cy + 0.15;
    return hull || sail || mast ? 1 : 0;
  }

  function boatPixel(nx, ny, scene, m) {
    var mast = Math.abs(nx - scene.cx) < 0.014;
    if (mast) return [0.22, 0.18, 0.14];
    if (ny > scene.cy + 0.05) return [0.76, 0.18, 0.13];
    return shade([0.96, 0.94, 0.82], 0.85 + 0.18 * clamp((nx - scene.cx + scene.rx) / (2 * scene.rx), 0, 1));
  }

  function countMask(mask) {
    var total = 0;
    for (var i = 0; i < mask.length; i += 1) total += mask[i] > 0.5 ? 1 : 0;
    return total;
  }

  function cloneImage(image) {
    return {
      width: image.width,
      height: image.height,
      pixels: new Float64Array(image.pixels),
      mask: new Float64Array(image.mask),
      scene: image.scene,
      originalSubject: image.originalSubject
    };
  }

  function computeEnergy(image, protection) {
    var w = image.width;
    var h = image.height;
    var energy = new Float64Array(w * h);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var dx = luminanceAt(image, x + 1, y) - luminanceAt(image, x - 1, y);
        var dy = luminanceAt(image, x, y + 1) - luminanceAt(image, x, y - 1);
        var colorEdge = rgbDistanceAt(image, x + 1, y, x - 1, y) + rgbDistanceAt(image, x, y + 1, x, y - 1);
        energy[y * w + x] = Math.sqrt(dx * dx + dy * dy) + 0.34 * colorEdge + image.mask[y * w + x] * protection / 100;
      }
    }
    return energy;
  }

  function forwardPenalty(image, x, y, fromX) {
    var cU = rgbDistanceAt(image, x - 1, y, x + 1, y);
    if (fromX < x) return cU + rgbDistanceAt(image, fromX, y - 1, x - 1, y);
    if (fromX > x) return cU + rgbDistanceAt(image, fromX, y - 1, x + 1, y);
    return cU;
  }

  function findVerticalSeam(image, options) {
    options = options || {};
    var w = image.width;
    var h = image.height;
    var energy = options.energy || computeEnergy(image, options.protection || 0);
    var mode = options.mode === "forward" ? "forward" : "backward";
    var cost = new Float64Array(w * h);
    var back = new Int16Array(w * h);
    for (var x = 0; x < w; x += 1) {
      cost[x] = energy[x];
      back[x] = x;
    }
    for (var y = 1; y < h; y += 1) {
      for (x = 0; x < w; x += 1) {
        var bestX = x;
        var bestCost = Infinity;
        for (var px = x - 1; px <= x + 1; px += 1) {
          if (px < 0 || px >= w) continue;
          var candidate = cost[(y - 1) * w + px];
          if (mode === "forward") candidate += forwardPenalty(image, x, y, px);
          if (candidate < bestCost) {
            bestCost = candidate;
            bestX = px;
          }
        }
        cost[y * w + x] = energy[y * w + x] + bestCost;
        back[y * w + x] = bestX;
      }
    }
    var endX = 0;
    var minCost = Infinity;
    for (x = 0; x < w; x += 1) {
      var tail = cost[(h - 1) * w + x];
      if (tail < minCost) {
        minCost = tail;
        endX = x;
      }
    }
    var seam = new Int16Array(h);
    seam[h - 1] = endX;
    for (y = h - 1; y > 0; y -= 1) {
      seam[y - 1] = back[y * w + seam[y]];
    }
    var energySum = 0;
    var subjectHits = 0;
    for (y = 0; y < h; y += 1) {
      var sx = seam[y];
      energySum += energy[y * w + sx];
      subjectHits += image.mask[y * w + sx] > 0.5 ? 1 : 0;
    }
    return {
      seam: seam,
      cost: minCost,
      energyCost: energySum,
      energy: energy,
      subjectHits: subjectHits,
      scar: seamScarEnergy(image, seam)
    };
  }

  function seamScarEnergy(image, seam) {
    var total = 0;
    for (var y = 0; y < image.height; y += 1) {
      var x = seam[y];
      if (x <= 0 || x >= image.width - 1) continue;
      total += rgbDistanceAt(image, x - 1, y, x + 1, y);
    }
    return total;
  }

  function removeVerticalSeam(image, seam) {
    var w = image.width;
    var h = image.height;
    var nextW = w - 1;
    var pixels = new Float64Array(nextW * h * 3);
    var mask = new Float64Array(nextW * h);
    for (var y = 0; y < h; y += 1) {
      var dstX = 0;
      for (var x = 0; x < w; x += 1) {
        if (x === seam[y]) continue;
        var src = (y * w + x) * 3;
        var dst = (y * nextW + dstX) * 3;
        pixels[dst] = image.pixels[src];
        pixels[dst + 1] = image.pixels[src + 1];
        pixels[dst + 2] = image.pixels[src + 2];
        mask[y * nextW + dstX] = image.mask[y * w + x];
        dstX += 1;
      }
    }
    return {
      width: nextW,
      height: h,
      pixels: pixels,
      mask: mask,
      scene: image.scene,
      originalSubject: image.originalSubject
    };
  }

  function carveImage(base, params) {
    var image = cloneImage(base);
    var first = null;
    var seamRows = [];
    var totalEnergy = 0;
    var totalScar = 0;
    var subjectHits = 0;
    for (var i = 0; i < params.seams; i += 1) {
      if (image.width <= 2) break;
      var found = findVerticalSeam(image, { protection: params.protection, mode: params.mode });
      if (!first) first = found;
      seamRows.push({
        cost: found.cost,
        energyCost: found.energyCost,
        scar: found.scar,
        subjectHits: found.subjectHits,
        width: image.width
      });
      totalEnergy += found.energyCost;
      totalScar += found.scar;
      subjectHits += found.subjectHits;
      image = removeVerticalSeam(image, found.seam);
    }
    if (!first) first = findVerticalSeam(image, { protection: params.protection, mode: params.mode });
    return {
      image: image,
      first: first,
      rows: seamRows,
      removed: seamRows.length,
      totalEnergy: totalEnergy,
      totalScar: totalScar,
      subjectHits: subjectHits
    };
  }

  function cropImage(base, seams) {
    var keep = Math.max(1, base.width - seams);
    var left = Math.floor((base.width - keep) / 2);
    var pixels = new Float64Array(keep * base.height * 3);
    var mask = new Float64Array(keep * base.height);
    for (var y = 0; y < base.height; y += 1) {
      for (var x = 0; x < keep; x += 1) {
        var srcX = left + x;
        var src = (y * base.width + srcX) * 3;
        var dst = (y * keep + x) * 3;
        pixels[dst] = base.pixels[src];
        pixels[dst + 1] = base.pixels[src + 1];
        pixels[dst + 2] = base.pixels[src + 2];
        mask[y * keep + x] = base.mask[y * base.width + srcX];
      }
    }
    return {
      width: keep,
      height: base.height,
      pixels: pixels,
      mask: mask,
      scene: base.scene,
      originalSubject: base.originalSubject
    };
  }

  function summarize(base, carved, crop, params) {
    var originalSubject = Math.max(1, base.originalSubject);
    var carvedSubject = countMask(carved.image.mask);
    var cropSubject = countMask(crop.mask);
    var uniformRatio = carved.image.width / base.width;
    var meanEnergy = carved.removed ? carved.totalEnergy / carved.removed / base.height : 0;
    var meanScar = carved.removed ? carved.totalScar / carved.removed / base.height : carved.first.scar / base.height;
    var subjectSeamRate = carved.removed ? carved.subjectHits / (carved.removed * base.height) : 0;
    return {
      originalSubject: originalSubject,
      carvedSubject: carvedSubject,
      cropSubject: cropSubject,
      carvedSubjectPct: carvedSubject / originalSubject,
      cropSubjectPct: cropSubject / originalSubject,
      uniformSubjectPct: uniformRatio,
      meanEnergy: meanEnergy,
      meanScar: meanScar,
      subjectSeamRate: subjectSeamRate,
      newWidth: carved.image.width,
      removedPixels: carved.removed * base.height,
      mode: params.mode,
      scene: params.scene
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var base = makeBaseImage(params.scene);
    var carved = carveImage(base, params);
    var crop = cropImage(base, carved.removed);
    return {
      params: params,
      base: base,
      carved: carved,
      crop: crop,
      summary: summarize(base, carved, crop, params)
    };
  }

  function round(value, digits) {
    var scale = Math.pow(10, digits == null ? 2 : digits);
    var out = Math.round(value * scale) / scale;
    return Object.is(out, -0) ? 0 : out;
  }

  function facts(result) {
    return {
      scene: SCENES[result.params.scene].label,
      mode: result.params.mode,
      removedSeams: result.carved.removed,
      newWidth: result.summary.newWidth,
      subjectKeptPct: round(result.summary.carvedSubjectPct * 100, 1),
      cropSubjectKeptPct: round(result.summary.cropSubjectPct * 100, 1),
      uniformSubjectPct: round(result.summary.uniformSubjectPct * 100, 1),
      meanSeamEnergy: round(result.summary.meanEnergy, 3),
      meanJoinCost: round(result.summary.meanScar, 3),
      subjectSeamRate: round(result.summary.subjectSeamRate * 100, 2)
    };
  }

  function nearly(a, b, eps) {
    return Math.abs(a - b) <= (eps || 1e-9);
  }

  function isValidSeam(seam, width) {
    if (!seam || seam.length === 0) return false;
    for (var i = 0; i < seam.length; i += 1) {
      if (seam[i] < 0 || seam[i] >= width) return false;
      if (i > 0 && Math.abs(seam[i] - seam[i - 1]) > 1) return false;
    }
    return true;
  }

  function runAudit() {
    if (AUDIT_CACHE) return AUDIT_CACHE;
    var checks = [];
    function record(name, ok, details) {
      checks.push({ name: name, ok: Boolean(ok), details: details || "" });
    }

    var bad = cleanParams({ scene: "unknown", seams: -5, protection: Infinity, mode: "x" });
    record("parameter cleanup clamps and falls back", bad.scene === DEFAULTS.scene && bad.seams === 0 && bad.protection === DEFAULTS.protection && bad.mode === DEFAULTS.mode);

    var base = makeBaseImage("plaza");
    record("synthetic scene dimensions are stable", base.width === DEFAULTS.width && base.height === DEFAULTS.height && base.pixels.length === base.width * base.height * 3);
    record("synthetic scene has protected subject pixels", base.originalSubject > 150);

    var energy = computeEnergy(base, 0);
    var seam = findVerticalSeam(base, { energy: energy, protection: 0, mode: "backward" });
    var seamEnergy = 0;
    for (var y = 0; y < base.height; y += 1) seamEnergy += energy[y * base.width + seam.seam[y]];
    record("vertical seam is monotone and in bounds", isValidSeam(seam.seam, base.width));
    record("reported seam energy matches selected pixels", nearly(seam.energyCost, seamEnergy, 1e-8));

    var removed = removeVerticalSeam(base, seam.seam);
    record("seam removal shrinks every row by one", removed.width === base.width - 1 && removed.height === base.height && removed.pixels.length === (base.width - 1) * base.height * 3);

    var zero = evaluate({ seams: 0, protection: 0 });
    record("zero seams leaves width and subject count unchanged", zero.summary.newWidth === DEFAULTS.width && zero.summary.carvedSubjectPct === 1);

    var protectedResult = evaluate({ seams: 38, protection: 900, mode: "backward", scene: "plaza" });
    var unprotectedResult = evaluate({ seams: 38, protection: 0, mode: "backward", scene: "plaza" });
    record("protection preserves at least as much subject as raw gradient", protectedResult.summary.carvedSubjectPct >= unprotectedResult.summary.carvedSubjectPct);
    record("default carving keeps more subject area than uniform squeeze", protectedResult.summary.carvedSubjectPct > protectedResult.summary.uniformSubjectPct);

    var forward = evaluate({ seams: 26, protection: 500, mode: "forward", scene: "poster" });
    var backward = evaluate({ seams: 26, protection: 500, mode: "backward", scene: "poster" });
    record("forward mode returns a finite valid result", Number.isFinite(forward.summary.meanScar) && forward.summary.newWidth === DEFAULTS.width - 26);
    record("mode switch changes seam accounting on textured scene", Math.abs(forward.summary.meanScar - backward.summary.meanScar) > 1e-5 || Math.abs(forward.summary.meanEnergy - backward.summary.meanEnergy) > 1e-5);

    var crop = cropImage(base, 12);
    record("center crop preserves consistent dimensions", crop.width === base.width - 12 && crop.height === base.height && crop.mask.length === (base.width - 12) * base.height);

    var defaultFacts = facts(evaluate({}));
    record("facts are finite", Object.keys(defaultFacts).every(function (key) {
      return typeof defaultFacts[key] === "string" || Number.isFinite(defaultFacts[key]);
    }));

    AUDIT_CACHE = {
      ok: checks.every(function (row) { return row.ok; }),
      checked: checks.length,
      passed: checks.filter(function (row) { return row.ok; }).length,
      failures: checks.filter(function (row) { return !row.ok; }),
      defaultFacts: defaultFacts
    };
    return AUDIT_CACHE;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  }

  function metric(label, value) {
    return '<div class="carve-lab__metric"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  function mount(node) {
    var params = cleanParams({
      scene: node.getAttribute("data-scene"),
      seams: node.getAttribute("data-seams"),
      protection: node.getAttribute("data-protection"),
      mode: node.getAttribute("data-mode")
    });
    node.innerHTML =
      '<div class="carve-lab__controls">' +
        '<label>Scene<select data-field="scene">' +
          '<option value="plaza">plaza</option>' +
          '<option value="poster">poster wall</option>' +
          '<option value="shore">shoreline</option>' +
        '</select></label>' +
        '<label>Energy<select data-field="mode">' +
          '<option value="backward">backward</option>' +
          '<option value="forward">forward</option>' +
        '</select></label>' +
        '<label>Seams removed <output data-output="seams"></output><input data-field="seams" type="range" min="0" max="64" step="1"></label>' +
        '<label>Subject protection <output data-output="protection"></output><input data-field="protection" type="range" min="0" max="1000" step="25"></label>' +
      '</div>' +
      '<div class="carve-lab__metrics" data-metrics></div>' +
      '<canvas class="carve-lab__canvas" data-canvas></canvas>' +
      '<div class="carve-lab__legend">' +
        '<span><i class="is-seam"></i>selected seam</span>' +
        '<span><i class="is-low"></i>low energy</span>' +
        '<span><i class="is-high"></i>high energy</span>' +
        '<span><i class="is-subject"></i>protected subject</span>' +
      '</div>';
    var fields = node.querySelectorAll("[data-field]");
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i].getAttribute("data-field");
      fields[i].value = params[field];
      fields[i].addEventListener("input", function () {
        render(node);
      });
    }
    render(node);
    root.addEventListener("resize", function () {
      render(node);
    });
  }

  function readParams(node) {
    var raw = {};
    var fields = node.querySelectorAll("[data-field]");
    for (var i = 0; i < fields.length; i += 1) {
      raw[fields[i].getAttribute("data-field")] = fields[i].value;
    }
    return cleanParams(raw);
  }

  function render(node) {
    var params = readParams(node);
    var result = evaluate(params);
    syncControls(node, result);
    var metrics = node.querySelector("[data-metrics]");
    var f = facts(result);
    metrics.innerHTML = [
      metric("new width", f.newWidth + " px"),
      metric("subject kept", f.subjectKeptPct + "%"),
      metric("uniform would keep", f.uniformSubjectPct + "%"),
      metric("mean join cost", f.meanJoinCost)
    ].join("");
    renderCanvas(node.querySelector("[data-canvas]"), result);
  }

  function syncControls(node, result) {
    var fields = node.querySelectorAll("[data-field]");
    for (var i = 0; i < fields.length; i += 1) {
      var field = fields[i].getAttribute("data-field");
      if (String(fields[i].value) !== String(result.params[field])) fields[i].value = result.params[field];
    }
    var seamOut = node.querySelector('[data-output="seams"]');
    var protectionOut = node.querySelector('[data-output="protection"]');
    if (seamOut) seamOut.textContent = result.params.seams;
    if (protectionOut) protectionOut.textContent = result.params.protection;
  }

  function setupCanvas(canvas, minHeight) {
    var rect = canvas.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 760));
    var height = Math.max(minHeight || 720, Math.round(rect.height || canvas.clientHeight || minHeight || 720));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return { ctx: ctx, width: width, height: height };
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

  function text(ctx, value, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.ink;
    ctx.font = (opts.weight || 600) + " " + (opts.size || 12) + "px " + (opts.family || "system-ui, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 12, box.y + 22, { size: 12, weight: 780 });
    if (subtitle) text(ctx, subtitle, box.x + 12, box.y + 39, { color: COLORS.muted, size: 10, weight: 600 });
  }

  function fillRgb(ctx, rgb) {
    ctx.fillStyle = "rgb(" + Math.round(clamp(rgb[0], 0, 1) * 255) + "," + Math.round(clamp(rgb[1], 0, 1) * 255) + "," + Math.round(clamp(rgb[2], 0, 1) * 255) + ")";
  }

  function drawImagePixels(ctx, image, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    var sx = w / image.width;
    var sy = h / image.height;
    for (var py = 0; py < image.height; py += 1) {
      for (var px = 0; px < image.width; px += 1) {
        var i = (py * image.width + px) * 3;
        fillRgb(ctx, [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]);
        ctx.fillRect(x + px * sx, y + py * sy, Math.ceil(sx) + 0.5, Math.ceil(sy) + 0.5);
      }
    }
    ctx.restore();
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, w, h);
  }

  function drawMaskOutline(ctx, image, x, y, w, h) {
    var sx = w / image.width;
    var sy = h / image.height;
    ctx.fillStyle = "rgba(124,58,237,0.22)";
    for (var py = 0; py < image.height; py += 1) {
      for (var px = 0; px < image.width; px += 1) {
        if (image.mask[py * image.width + px] > 0.5) {
          ctx.fillRect(x + px * sx, y + py * sy, Math.ceil(sx), Math.ceil(sy));
        }
      }
    }
  }

  function drawSeam(ctx, seam, imageWidth, imageHeight, x, y, w, h) {
    if (!seam) return;
    ctx.save();
    ctx.strokeStyle = COLORS.seam;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (var row = 0; row < seam.length; row += 1) {
      var px = x + (seam[row] + 0.5) * w / imageWidth;
      var py = y + (row + 0.5) * h / imageHeight;
      if (row === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawEnergyMap(ctx, image, energy, seam, x, y, w, h) {
    var max = percentile(energy, 0.94);
    var sx = w / image.width;
    var sy = h / image.height;
    for (var py = 0; py < image.height; py += 1) {
      for (var px = 0; px < image.width; px += 1) {
        var t = clamp(energy[py * image.width + px] / Math.max(1e-9, max), 0, 1);
        var rgb = energyColor(t);
        fillRgb(ctx, rgb);
        ctx.fillRect(x + px * sx, y + py * sy, Math.ceil(sx) + 0.5, Math.ceil(sy) + 0.5);
      }
    }
    drawSeam(ctx, seam, image.width, image.height, x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, w, h);
  }

  function percentile(values, p) {
    var copy = Array.prototype.slice.call(values);
    copy.sort(function (a, b) { return a - b; });
    return copy[Math.min(copy.length - 1, Math.max(0, Math.floor(copy.length * p)))] || 1;
  }

  function energyColor(t) {
    if (t < 0.5) return mix([0.09, 0.20, 0.36], [0.10, 0.55, 0.50], t / 0.5);
    return mix([0.10, 0.55, 0.50], [0.97, 0.74, 0.24], (t - 0.5) / 0.5);
  }

  function drawOriginalPanel(ctx, result, box) {
    panel(ctx, box, "Original with first seam", SCENES[result.params.scene].label + ", " + result.params.protection + " protection");
    var imgBox = imageBox(box, result.base.width, result.base.height);
    drawImagePixels(ctx, result.base, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
    drawMaskOutline(ctx, result.base, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
    drawSeam(ctx, result.carved.first.seam, result.base.width, result.base.height, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
  }

  function drawEnergyPanel(ctx, result, box) {
    panel(ctx, box, "Energy ledger", result.params.mode === "forward" ? "transition cost also charges new neighbors" : "backward energy removes the cheapest path");
    var imgBox = imageBox(box, result.base.width, result.base.height);
    drawEnergyMap(ctx, result.base, result.carved.first.energy, result.carved.first.seam, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
  }

  function drawCarvedPanel(ctx, result, box) {
    var f = facts(result);
    panel(ctx, box, "After carving", f.removedSeams + " seams, width " + result.base.width + " -> " + result.summary.newWidth);
    var imgBox = imageBox(box, result.carved.image.width, result.carved.image.height);
    drawImagePixels(ctx, result.carved.image, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
    drawMaskOutline(ctx, result.carved.image, imgBox.x, imgBox.y, imgBox.w, imgBox.h);
    text(ctx, "subject kept " + f.subjectKeptPct + "%", box.x + 12, box.y + box.h - 14, { color: COLORS.muted, size: 11 });
  }

  function drawChartPanel(ctx, result, box) {
    panel(ctx, box, "Seam costs over time", "low paths get used first, then the image gets more expensive");
    var rows = result.carved.rows;
    if (!rows.length) {
      text(ctx, "no seam removed", box.x + 16, box.y + 72, { color: COLORS.muted, size: 12 });
      return;
    }
    var x0 = box.x + 34;
    var y0 = box.y + box.h - 34;
    var w = box.w - 54;
    var h = box.h - 78;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, box.y + 48);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + w, y0);
    ctx.stroke();
    var maxCost = rows.reduce(function (m, row) { return Math.max(m, row.energyCost / result.base.height); }, 0);
    var maxScar = rows.reduce(function (m, row) { return Math.max(m, row.scar / result.base.height); }, 0);
    drawSeries(ctx, rows, x0, y0, w, h, maxCost, function (row) {
      return row.energyCost / result.base.height;
    }, COLORS.seam);
    drawSeries(ctx, rows, x0, y0, w, h, maxScar || 1, function (row) {
      return row.scar / result.base.height;
    }, COLORS.forward);
    text(ctx, "energy", x0 + 6, box.y + 63, { color: COLORS.seam, size: 10 });
    text(ctx, "new-neighbor cost", x0 + 6, box.y + 78, { color: COLORS.forward, size: 10 });
    text(ctx, rows.length + " removals", x0 + w - 76, y0 + 20, { color: COLORS.muted, size: 10 });
  }

  function drawSeries(ctx, rows, x0, y0, w, h, maxValue, valueFn, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < rows.length; i += 1) {
      var x = x0 + (rows.length === 1 ? 0 : i * w / (rows.length - 1));
      var y = y0 - clamp(valueFn(rows[i]) / Math.max(1e-9, maxValue), 0, 1) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function imageBox(box, imageW, imageH) {
    var top = box.y + 52;
    var maxW = box.w - 24;
    var maxH = box.h - 76;
    var aspect = imageW / imageH;
    var w = maxW;
    var h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return {
      x: box.x + (box.w - w) / 2,
      y: top + (maxH - h) / 2,
      w: w,
      h: h
    };
  }

  function renderCanvas(canvas, result) {
    var mobile = (canvas.getBoundingClientRect().width || 720) < 620;
    var box = setupCanvas(canvas, mobile ? 980 : 760);
    var ctx = box.ctx;
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.width, box.height);
    var pad = 14;
    var gap = 12;
    if (mobile) {
      var panelH = (box.height - pad * 2 - gap * 3) / 4;
      var full = box.width - pad * 2;
      drawOriginalPanel(ctx, result, { x: pad, y: pad, w: full, h: panelH });
      drawEnergyPanel(ctx, result, { x: pad, y: pad + (panelH + gap), w: full, h: panelH });
      drawCarvedPanel(ctx, result, { x: pad, y: pad + 2 * (panelH + gap), w: full, h: panelH });
      drawChartPanel(ctx, result, { x: pad, y: pad + 3 * (panelH + gap), w: full, h: panelH });
      return;
    }
    var col = (box.width - pad * 2 - gap) / 2;
    var row = (box.height - pad * 2 - gap) / 2;
    drawOriginalPanel(ctx, result, { x: pad, y: pad, w: col, h: row });
    drawEnergyPanel(ctx, result, { x: pad + col + gap, y: pad, w: col, h: row });
    drawCarvedPanel(ctx, result, { x: pad, y: pad + row + gap, w: col, h: row });
    drawChartPanel(ctx, result, { x: pad + col + gap, y: pad + row + gap, w: col, h: row });
  }

  function init() {
    var nodes = document.querySelectorAll("[data-seam-carving-lab]");
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  var api = {
    cleanParams: cleanParams,
    computeEnergy: computeEnergy,
    cropImage: cropImage,
    evaluate: evaluate,
    facts: facts,
    findVerticalSeam: findVerticalSeam,
    makeBaseImage: makeBaseImage,
    removeVerticalSeam: removeVerticalSeam,
    runAudit: runAudit
  };

  root.SeamCarvingLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
