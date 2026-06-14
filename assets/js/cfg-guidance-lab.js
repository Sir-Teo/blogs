(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    prompt: "#0f766e",
    distractor: "#64748b",
    guided: "#7c3aed",
    curve: "#2563eb",
    warn: "#b45309",
    bad: "#be123c"
  };

  var DEFAULTS = {
    ambiguity: 42,
    distractor: 55,
    guidance: 30,
    seed: 19,
    sigma: 62,
    steps: 24
  };

  var BASE_COMPONENTS = [
    { cx: -1.2, cy: 0.62, label: "prompt A", type: "prompt" },
    { cx: 1.12, cy: 0.82, label: "prompt B", type: "prompt" },
    { cx: 0.0, cy: -1.23, label: "prompt C", type: "prompt" },
    { cx: -1.92, cy: -1.42, label: "background L", type: "distractor" },
    { cx: 1.86, cy: -1.32, label: "background R", type: "distractor" },
    { cx: 0.0, cy: 1.98, label: "background T", type: "distractor" }
  ];

  var VIEW = {
    xMax: 3,
    xMin: -3,
    yMax: 2.65,
    yMin: -2.65
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      ambiguity: clamp(Number(raw.ambiguity == null ? DEFAULTS.ambiguity : raw.ambiguity), 0, 100),
      distractor: clamp(Number(raw.distractor == null ? DEFAULTS.distractor : raw.distractor), 0, 85),
      guidance: clamp(Number(raw.guidance == null ? DEFAULTS.guidance : raw.guidance), 0, 80) / 10,
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      sigma: clamp(Number(raw.sigma == null ? DEFAULTS.sigma : raw.sigma), 30, 120) / 100,
      steps: clamp(Math.round(raw.steps == null ? DEFAULTS.steps : raw.steps), 6, 48)
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="cfg-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function normalize(weights) {
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    return weights.map(function (value) { return value / Math.max(1e-12, total); });
  }

  function makeComponents(params) {
    var ambiguity = params.ambiguity / 100;
    var promptWeights = normalize([
      0.78 - 0.28 * ambiguity,
      0.18 + 0.05 * ambiguity,
      0.04 + 0.23 * ambiguity
    ]);
    var distractorWeights = normalize([0.42, 0.36, 0.22]);
    var distractorMass = params.distractor / 100;
    var promptMass = 1 - distractorMass;
    var conditional = [];
    var unconditional = [];
    var all = [];
    var i;

    for (i = 0; i < 3; i += 1) {
      conditional.push(Object.assign({}, BASE_COMPONENTS[i], { index: i, weight: promptWeights[i] }));
      unconditional.push(Object.assign({}, BASE_COMPONENTS[i], { index: i, weight: promptMass * promptWeights[i] }));
      all.push(Object.assign({}, BASE_COMPONENTS[i], { index: i, condWeight: promptWeights[i], uncondWeight: promptMass * promptWeights[i] }));
    }

    for (i = 0; i < 3; i += 1) {
      unconditional.push(Object.assign({}, BASE_COMPONENTS[i + 3], { index: i + 3, weight: distractorMass * distractorWeights[i] }));
      all.push(Object.assign({}, BASE_COMPONENTS[i + 3], { index: i + 3, condWeight: 0, uncondWeight: distractorMass * distractorWeights[i] }));
    }

    return {
      all: all,
      conditional: conditional,
      unconditional: unconditional
    };
  }

  function componentLogWeight(component, x, y, sigma) {
    var dx = x - component.cx;
    var dy = y - component.cy;
    return Math.log(Math.max(1e-12, component.weight)) - (dx * dx + dy * dy) / (2 * sigma * sigma);
  }

  function logMixture(x, y, components, sigma) {
    var logs = [];
    var maxLog = -Infinity;
    var i;
    for (i = 0; i < components.length; i += 1) {
      logs[i] = componentLogWeight(components[i], x, y, sigma);
      if (logs[i] > maxLog) maxLog = logs[i];
    }
    var total = 0;
    for (i = 0; i < logs.length; i += 1) total += Math.exp(logs[i] - maxLog);
    return maxLog + Math.log(Math.max(1e-300, total));
  }

  function posterior(x, y, components, sigma) {
    var logs = [];
    var maxLog = -Infinity;
    var weights = [];
    var total = 0;
    var i;
    for (i = 0; i < components.length; i += 1) {
      logs[i] = componentLogWeight(components[i], x, y, sigma);
      if (logs[i] > maxLog) maxLog = logs[i];
    }
    for (i = 0; i < components.length; i += 1) {
      weights[i] = Math.exp(logs[i] - maxLog);
      total += weights[i];
    }
    for (i = 0; i < components.length; i += 1) weights[i] /= Math.max(1e-300, total);
    return weights;
  }

  function scoreMixture(x, y, components, sigma) {
    var weights = posterior(x, y, components, sigma);
    var sx = 0;
    var sy = 0;
    var invVar = 1 / (sigma * sigma);
    for (var i = 0; i < components.length; i += 1) {
      sx += weights[i] * (components[i].cx - x) * invVar;
      sy += weights[i] * (components[i].cy - y) * invVar;
    }
    return [sx, sy];
  }

  function guidedScoreAt(x, y, params, components) {
    var uncond = scoreMixture(x, y, components.unconditional, params.sigma);
    var cond = scoreMixture(x, y, components.conditional, params.sigma);
    return [
      uncond[0] + params.guidance * (cond[0] - uncond[0]),
      uncond[1] + params.guidance * (cond[1] - uncond[1])
    ];
  }

  function guidedLogDensityAt(x, y, params, components) {
    var logUncond = logMixture(x, y, components.unconditional, params.sigma);
    var logCond = logMixture(x, y, components.conditional, params.sigma);
    return logUncond + params.guidance * (logCond - logUncond);
  }

  function computeGrid(params, components, resolution) {
    var nx = resolution && resolution.nx ? resolution.nx : 66;
    var ny = resolution && resolution.ny ? resolution.ny : 58;
    var cells = [];
    var maxLog = -Infinity;
    var i;
    var ix;
    var iy;

    for (iy = 0; iy < ny; iy += 1) {
      for (ix = 0; ix < nx; ix += 1) {
        var x = VIEW.xMin + (VIEW.xMax - VIEW.xMin) * (ix + 0.5) / nx;
        var y = VIEW.yMin + (VIEW.yMax - VIEW.yMin) * (iy + 0.5) / ny;
        var logQ = guidedLogDensityAt(x, y, params, components);
        if (logQ > maxLog) maxLog = logQ;
        cells.push({ ix: ix, iy: iy, logQ: logQ, x: x, y: y });
      }
    }

    var total = 0;
    for (i = 0; i < cells.length; i += 1) {
      cells[i].raw = Math.exp(cells[i].logQ - maxLog);
      total += cells[i].raw;
    }

    var entropy = 0;
    var promptAlignment = 0;
    var scoreEnergy = 0;
    var guidanceEnergy = 0;
    var maxMass = 0;
    var componentMass = new Array(components.unconditional.length).fill(0);
    var promptMassByComponent = [0, 0, 0];

    for (i = 0; i < cells.length; i += 1) {
      var cell = cells[i];
      cell.mass = cell.raw / Math.max(1e-300, total);
      maxMass = Math.max(maxMass, cell.mass);
      entropy -= cell.mass * Math.log(Math.max(1e-300, cell.mass));

      var resp = posterior(cell.x, cell.y, components.unconditional, params.sigma);
      var promptResp = 0;
      for (var j = 0; j < resp.length; j += 1) {
        componentMass[j] += cell.mass * resp[j];
        if (j < 3) {
          promptResp += resp[j];
          promptMassByComponent[j] += cell.mass * resp[j];
        }
      }
      promptAlignment += cell.mass * promptResp;

      var uncond = scoreMixture(cell.x, cell.y, components.unconditional, params.sigma);
      var cond = scoreMixture(cell.x, cell.y, components.conditional, params.sigma);
      var guided = [uncond[0] + params.guidance * (cond[0] - uncond[0]), uncond[1] + params.guidance * (cond[1] - uncond[1])];
      scoreEnergy += cell.mass * (guided[0] * guided[0] + guided[1] * guided[1]);
      guidanceEnergy += cell.mass * (Math.pow(cond[0] - uncond[0], 2) + Math.pow(cond[1] - uncond[1], 2));
    }

    var promptTotal = promptMassByComponent.reduce(function (sum, value) { return sum + value; }, 0);
    var promptEntropy = 0;
    promptMassByComponent.forEach(function (value) {
      var p = value / Math.max(1e-12, promptTotal);
      if (p > 0) promptEntropy -= p * Math.log(p);
    });

    return {
      cells: cells,
      componentMass: componentMass,
      maxMass: maxMass,
      metrics: {
        effectiveArea: Math.exp(entropy) / cells.length,
        fieldRms: Math.sqrt(scoreEnergy),
        guidanceRms: Math.sqrt(guidanceEnergy),
        peakRatio: maxMass * cells.length,
        promptAlignment: promptAlignment,
        promptModes: Math.exp(promptEntropy)
      },
      nx: nx,
      ny: ny
    };
  }

  function computeCurve(params, components) {
    var curve = [];
    var original = params.guidance;
    for (var g = 0; g <= 80; g += 4) {
      params.guidance = g / 10;
      var grid = computeGrid(params, components, { nx: 34, ny: 30 });
      curve.push({
        alignment: grid.metrics.promptAlignment,
        area: grid.metrics.effectiveArea,
        guidance: params.guidance,
        modes: grid.metrics.promptModes
      });
    }
    params.guidance = original;
    return curve;
  }

  function samplePaths(params, components) {
    var rand = rng(20260614 + params.seed * 97);
    var paths = [];
    var count = 22;
    var stepSize = 0.075 * params.sigma * params.sigma;
    for (var i = 0; i < count; i += 1) {
      var start = [2.15 * normal(rand), 1.9 * normal(rand)];
      var point = [clamp(start[0], VIEW.xMin + 0.15, VIEW.xMax - 0.15), clamp(start[1], VIEW.yMin + 0.15, VIEW.yMax - 0.15)];
      var path = [point.slice()];
      for (var t = 0; t < params.steps; t += 1) {
        var score = guidedScoreAt(point[0], point[1], params, components);
        var norm = Math.sqrt(score[0] * score[0] + score[1] * score[1]);
        var maxNorm = 7.5 / Math.max(0.3, params.sigma);
        if (norm > maxNorm) {
          score[0] *= maxNorm / norm;
          score[1] *= maxNorm / norm;
        }
        point = [
          clamp(point[0] + stepSize * score[0], VIEW.xMin + 0.05, VIEW.xMax - 0.05),
          clamp(point[1] + stepSize * score[1], VIEW.yMin + 0.05, VIEW.yMax - 0.05)
        ];
        path.push(point.slice());
      }
      paths.push(path);
    }
    return paths;
  }

  function evaluate(rawParams, options) {
    var params = cleanParams(rawParams);
    var components = makeComponents(params);
    var grid = computeGrid(params, components, options && options.resolution);
    return {
      components: components,
      curve: options && options.curve === false ? [] : computeCurve(Object.assign({}, params), components),
      grid: grid,
      params: params,
      paths: options && options.paths === false ? [] : samplePaths(params, components),
      view: VIEW
    };
  }

  function readState(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var values = {
      ambiguity: Math.round(params.ambiguity) + "%",
      distractor: Math.round(params.distractor) + "%",
      guidance: formatNumber(params.guidance, 1),
      seed: String(params.seed),
      sigma: formatNumber(params.sigma, 2),
      steps: String(params.steps)
    };
    Object.keys(values).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = values[key];
      });
    });
  }

  function updateMetrics(metrics, result) {
    var m = result.grid.metrics;
    metrics.innerHTML = [
      metric("prompt alignment", formatPercent(m.promptAlignment, 1)),
      metric("effective area", formatPercent(m.effectiveArea, 1)),
      metric("prompt modes", formatNumber(m.promptModes, 2) + " / 3"),
      metric("peak concentration", formatNumber(m.peakRatio, 1) + "x"),
      metric("field RMS", formatNumber(m.fieldRms, 2)),
      metric("guidance RMS", formatNumber(m.guidanceRms, 2))
    ].join("");
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 980 : 680;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 760);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 43, 11, COLORS.muted, 550);
  }

  function project(view, x, y, left, top, width, height) {
    return [
      left + (x - view.xMin) / (view.xMax - view.xMin) * width,
      top + (view.yMax - y) / (view.yMax - view.yMin) * height
    ];
  }

  function densityColor(t) {
    var alpha = 0.08 + 0.62 * Math.sqrt(clamp(t, 0, 1));
    return "rgba(15,118,110," + alpha.toFixed(3) + ")";
  }

  function drawCenters(ctx, result, left, top, width, height) {
    result.components.all.forEach(function (component) {
      var p = project(result.view, component.cx, component.cy, left, top, width, height);
      ctx.fillStyle = component.type === "prompt" ? COLORS.prompt : COLORS.distractor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], component.type === "prompt" ? 5.5 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawDensity(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "guided density", "q_w is proportional to p(prompt)^w p(uncond)^(1-w)");
    var left = x + 28;
    var top = y + 58;
    var width = w - 52;
    var height = h - 84;
    var cellW = width / result.grid.nx + 0.7;
    var cellH = height / result.grid.ny + 0.7;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(left, top, width, height);
    result.grid.cells.forEach(function (cell) {
      var p = project(result.view, cell.x, cell.y, left, top, width, height);
      ctx.fillStyle = densityColor(cell.mass / Math.max(1e-12, result.grid.maxMass));
      ctx.fillRect(p[0] - cellW / 2, p[1] - cellH / 2, cellW, cellH);
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);
    drawCenters(ctx, result, left, top, width, height);
  }

  function drawArrow(ctx, x, y, vx, vy, color, scale) {
    var len = Math.sqrt(vx * vx + vy * vy);
    if (len < 1e-8) return;
    var ux = vx / len;
    var uy = vy / len;
    var l = Math.min(15, scale * Math.sqrt(len));
    var x2 = x + ux * l;
    var y2 = y - uy * l;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - ux * 4 + uy * 3, y2 + uy * 4 + ux * 3);
    ctx.lineTo(x2 - ux * 4 - uy * 3, y2 + uy * 4 - ux * 3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawField(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "score field and paths", "deterministic score-ascent paths from noisy starts");
    var left = x + 28;
    var top = y + 58;
    var width = w - 52;
    var height = h - 84;
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(left, top, width, height);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, width, height);

    for (var gy = 0; gy < 9; gy += 1) {
      for (var gx = 0; gx < 12; gx += 1) {
        var px = result.view.xMin + (result.view.xMax - result.view.xMin) * (gx + 0.5) / 12;
        var py = result.view.yMin + (result.view.yMax - result.view.yMin) * (gy + 0.5) / 9;
        var score = guidedScoreAt(px, py, result.params, result.components);
        var screen = project(result.view, px, py, left, top, width, height);
        drawArrow(ctx, screen[0], screen[1], score[0], score[1], "rgba(124,58,237,0.45)", 4.8);
      }
    }

    result.paths.forEach(function (path, index) {
      ctx.strokeStyle = index % 3 === 0 ? "rgba(37,99,235,0.72)" : "rgba(15,118,110,0.48)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      path.forEach(function (point, i) {
        var p = project(result.view, point[0], point[1], left, top, width, height);
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    });
    drawCenters(ctx, result, left, top, width, height);
  }

  function drawCurve(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "what the knob trades", "alignment rises while area and mode coverage shrink");
    var left = x + 44;
    var right = x + w - 18;
    var top = y + 62;
    var bottom = y + h - 40;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    function px(guidance) {
      return left + (right - left) * guidance / 8;
    }

    function py01(value) {
      return bottom - (bottom - top) * clamp(value, 0, 1);
    }

    function line(key, color, transform) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.curve.forEach(function (point, index) {
        var xx = px(point.guidance);
        var yy = py01(transform(point[key]));
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
    }

    line("alignment", COLORS.prompt, function (v) { return v; });
    line("area", COLORS.bad, function (v) { return v; });
    line("modes", COLORS.curve, function (v) { return v / 3; });

    var currentX = px(result.params.guidance);
    ctx.strokeStyle = COLORS.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, top);
    ctx.lineTo(currentX, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    drawText(ctx, "alignment", left + 6, top + 14, 10, COLORS.prompt, 750);
    drawText(ctx, "area", left + 6, top + 30, 10, COLORS.bad, 750);
    drawText(ctx, "modes", left + 6, top + 46, 10, COLORS.curve, 750);
    drawText(ctx, "guidance scale", (left + right) / 2, y + h - 13, 10, COLORS.muted, 650, "center");
  }

  function drawMassBars(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "where the mass goes", "guided density assigned back to unconditional components");
    var left = x + 116;
    var right = x + w - 24;
    var top = y + 64;
    var rowH = Math.max(22, (h - 92) / result.components.all.length);
    var maxMass = Math.max.apply(null, result.grid.componentMass.concat([0.01]));
    result.components.all.forEach(function (component, i) {
      var yy = top + i * rowH;
      var mass = result.grid.componentMass[i];
      var color = component.type === "prompt" ? COLORS.prompt : COLORS.distractor;
      drawText(ctx, component.label, x + 16, yy + 12, 10, COLORS.text, 700);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 12);
      ctx.fillStyle = color;
      ctx.fillRect(left, yy, (right - left) * mass / maxMass, 12);
      drawText(ctx, formatPercent(mass, 1), right, yy + 11, 10, color, 750, "right");
    });
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawDensity(ctx, result, pad, pad, width - 2 * pad, panelH);
      drawField(ctx, result, pad, pad + panelH + gap, width - 2 * pad, panelH);
      drawCurve(ctx, result, pad, pad + 2 * (panelH + gap), width - 2 * pad, panelH);
      drawMassBars(ctx, result, pad, pad + 3 * (panelH + gap), width - 2 * pad, panelH);
      return;
    }

    var halfW = (width - 2 * pad - gap) / 2;
    var halfH = (height - 2 * pad - gap) / 2;
    drawDensity(ctx, result, pad, pad, halfW, halfH);
    drawField(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawCurve(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawMassBars(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function initOne(container) {
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      var params = readState(container);
      updateOutputs(container, params);
      latest = evaluate({
        ambiguity: params.ambiguity,
        distractor: params.distractor,
        guidance: params.guidance * 10,
        seed: params.seed,
        sigma: params.sigma * 100,
        steps: params.steps
      });
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-cfg-guidance-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    cleanParams: cleanParams,
    computeGrid: computeGrid,
    evaluate: evaluate,
    guidedLogDensityAt: guidedLogDensityAt,
    guidedScoreAt: guidedScoreAt,
    logMixture: logMixture,
    makeComponents: makeComponents,
    scoreMixture: scoreMixture
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CfgGuidanceLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
