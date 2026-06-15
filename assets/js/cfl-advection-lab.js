(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e8eef4",
    panel: "#f8fafc",
    white: "#ffffff",
    exact: "#172026",
    upwind: "#0f766e",
    lw: "#2563eb",
    centered: "#be123c",
    cfl: "#b45309",
    energy: "#8b5cf6"
  };

  var DEFAULTS = {
    shape: "packet",
    cells: 128,
    cfl: 82,
    steps: 96,
    mode: "all",
    viscosity: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var shape = String(raw.shape || DEFAULTS.shape);
    if (!/^(packet|square|gaussian|sine)$/.test(shape)) shape = DEFAULTS.shape;
    var mode = String(raw.mode || DEFAULTS.mode);
    if (!/^(all|upwind|laxWendroff|centered)$/.test(mode)) mode = DEFAULTS.mode;
    return {
      shape: shape,
      cells: clamp(Math.round(readNumber(raw, "cells")), 48, 256),
      cfl: clamp(Math.round(readNumber(raw, "cfl")), 5, 135),
      steps: clamp(Math.round(readNumber(raw, "steps")), 1, 260),
      mode: mode,
      viscosity: clamp(Math.round(readNumber(raw, "viscosity")), 0, 30)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    var d = digits == null ? 3 : digits;
    if (value === 0) return value.toFixed(d);
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(d);
    if (Math.abs(value) >= 0.1) return value.toFixed(d);
    if (Math.abs(value) >= 0.01) return value.toFixed(d + 1);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="cfl-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function wrap01(x) {
    x = x - Math.floor(x);
    return x < 0 ? x + 1 : x;
  }

  function initialValue(shape, x) {
    x = wrap01(x);
    if (shape === "sine") {
      return 0.5 + 0.35 * Math.sin(2 * Math.PI * x) + 0.12 * Math.sin(6 * Math.PI * x);
    }
    if (shape === "gaussian") {
      var d = Math.min(Math.abs(x - 0.34), 1 - Math.abs(x - 0.34));
      return Math.exp(-0.5 * Math.pow(d / 0.055, 2));
    }
    if (shape === "square") {
      return x > 0.18 && x < 0.42 ? 1 : 0;
    }
    var d1 = Math.min(Math.abs(x - 0.28), 1 - Math.abs(x - 0.28));
    var d2 = Math.min(Math.abs(x - 0.62), 1 - Math.abs(x - 0.62));
    return 0.9 * Math.exp(-0.5 * Math.pow(d1 / 0.045, 2)) + 0.45 * Math.exp(-0.5 * Math.pow(d2 / 0.085, 2));
  }

  function sampleInitial(params) {
    var u = [];
    for (var i = 0; i < params.cells; i += 1) {
      u.push(initialValue(params.shape, (i + 0.5) / params.cells));
    }
    return u;
  }

  function periodicLinearShift(u, shiftCells) {
    var n = u.length;
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) {
      var pos = i - shiftCells;
      var base = Math.floor(pos);
      var t = pos - base;
      var j0 = ((base % n) + n) % n;
      var j1 = (j0 + 1) % n;
      out[i] = (1 - t) * u[j0] + t * u[j1];
    }
    return out;
  }

  function exactSolution(params) {
    return periodicLinearShift(sampleInitial(params), params.steps * (params.cfl / 100));
  }

  function mass(u) {
    return u.reduce(function (sum, value) { return sum + value; }, 0) / u.length;
  }

  function l2(u) {
    var sum = 0;
    for (var i = 0; i < u.length; i += 1) sum += u[i] * u[i];
    return Math.sqrt(sum / u.length);
  }

  function totalVariation(u) {
    var tv = 0;
    for (var i = 0; i < u.length; i += 1) {
      var j = (i + 1) % u.length;
      tv += Math.abs(u[j] - u[i]);
    }
    return tv;
  }

  function maxAbs(u) {
    var m = 0;
    for (var i = 0; i < u.length; i += 1) m = Math.max(m, Math.abs(u[i]));
    return m;
  }

  function l1Error(u, exact) {
    var err = 0;
    for (var i = 0; i < u.length; i += 1) err += Math.abs(u[i] - exact[i]);
    return err / u.length;
  }

  function stepScheme(u, c, kind, viscosity) {
    var n = u.length;
    var v = new Array(n);
    var nu = viscosity || 0;
    for (var i = 0; i < n; i += 1) {
      var im = (i - 1 + n) % n;
      var ip = (i + 1) % n;
      if (kind === "upwind") {
        v[i] = u[i] - c * (u[i] - u[im]);
      } else if (kind === "laxWendroff") {
        v[i] = u[i] - 0.5 * c * (u[ip] - u[im]) + 0.5 * c * c * (u[ip] - 2 * u[i] + u[im]);
      } else {
        v[i] = u[i] - 0.5 * c * (u[ip] - u[im]);
      }
      if (nu > 0) v[i] += nu * (u[ip] - 2 * u[i] + u[im]);
    }
    return v;
  }

  function simulate(params, kind) {
    var c = params.cfl / 100;
    var nu = params.viscosity / 100;
    var u = sampleInitial(params);
    var m0 = mass(u);
    var e0 = l2(u);
    var tv0 = totalVariation(u);
    var history = [{ step: 0, mass: m0, l2: e0, tv: tv0, max: maxAbs(u), finite: true }];
    for (var s = 1; s <= params.steps; s += 1) {
      u = stepScheme(u, c, kind, nu);
      var finite = u.every(Number.isFinite);
      history.push({ step: s, mass: mass(u), l2: l2(u), tv: totalVariation(u), max: maxAbs(u), finite: finite });
      if (!finite || maxAbs(u) > 1e6) break;
    }
    return { history: history, kind: kind, solution: u };
  }

  function modesFor(params) {
    if (params.mode === "all") return ["upwind", "laxWendroff", "centered"];
    return [params.mode];
  }

  function schemeLabel(kind) {
    if (kind === "laxWendroff") return "Lax-Wendroff";
    if (kind === "centered") return "centered";
    return "upwind";
  }

  function schemeColor(kind) {
    if (kind === "laxWendroff") return COLORS.lw;
    if (kind === "centered") return COLORS.centered;
    return COLORS.upwind;
  }

  function amplification(kind, c, theta, viscosity) {
    var z;
    if (kind === "upwind") {
      z = { re: 1 - c + c * Math.cos(theta), im: -c * Math.sin(theta) };
    } else if (kind === "laxWendroff") {
      z = { re: 1 + c * c * (Math.cos(theta) - 1), im: -c * Math.sin(theta) };
    } else {
      z = { re: 1, im: -c * Math.sin(theta) };
    }
    if (viscosity > 0) z.re += 2 * viscosity * (Math.cos(theta) - 1);
    return Math.sqrt(z.re * z.re + z.im * z.im);
  }

  function maxAmplification(kind, c, viscosity) {
    var m = 0;
    for (var i = 0; i <= 512; i += 1) {
      m = Math.max(m, amplification(kind, c, Math.PI * i / 512, viscosity));
    }
    return m;
  }

  function sweep(params) {
    var out = [];
    for (var i = 0; i <= 26; i += 1) {
      var cfl = 0.1 + 1.3 * i / 26;
      var trial = cleanParams(Object.assign({}, params, { cfl: Math.round(cfl * 100), steps: Math.min(params.steps, 120), mode: "all" }));
      var exact = exactSolution(trial);
      var row = { cfl: cfl };
      ["upwind", "laxWendroff", "centered"].forEach(function (kind) {
        var run = simulate(trial, kind);
        row[kind] = Math.min(10, l1Error(run.solution, exact));
        row[kind + "Amp"] = maxAmplification(kind, cfl, trial.viscosity / 100);
      });
      out.push(row);
    }
    return out;
  }

  function audit(params, exact, runs) {
    var initial = sampleInitial(params);
    var exactMass = mass(exact);
    var initialMass = mass(initial);
    var finite = exact.every(Number.isFinite);
    var conservative = true;
    var expected = true;
    var c = params.cfl / 100;
    runs.forEach(function (run) {
      finite = finite && run.solution.every(Number.isFinite);
      conservative = conservative && Math.abs(mass(run.solution) - initialMass) < 1e-10;
    });
    if (c <= 1 && params.viscosity === 0) {
      var up = simulate(params, "upwind");
      var lw = simulate(params, "laxWendroff");
      expected = expected && maxAmplification("upwind", c, 0) <= 1 + 1e-12;
      expected = expected && maxAmplification("laxWendroff", c, 0) <= 1 + 1e-12;
      expected = expected && up.history[up.history.length - 1].l2 <= up.history[0].l2 + 1e-9;
      expected = expected && lw.history[lw.history.length - 1].l2 < lw.history[0].l2 * 1.15;
    }
    if (c > 1.02 && params.viscosity === 0) {
      expected = expected && maxAmplification("upwind", c, 0) > 1;
      expected = expected && maxAmplification("laxWendroff", c, 0) > 1;
    }
    var checks = {
      finite: finite,
      exactMassConserved: Math.abs(exactMass - initialMass) < 1e-3,
      schemeMassConserved: conservative,
      expectedAmplification: expected
    };
    return {
      checks: checks,
      passed: Object.keys(checks).every(function (key) { return checks[key]; })
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var exact = exactSolution(params);
    var runs = {};
    modesFor(params).forEach(function (kind) {
      runs[kind] = simulate(params, kind);
    });
    if (!runs.upwind) runs.upwind = simulate(params, "upwind");
    if (!runs.laxWendroff) runs.laxWendroff = simulate(params, "laxWendroff");
    if (!runs.centered) runs.centered = simulate(params, "centered");
    var errors = {};
    Object.keys(runs).forEach(function (kind) {
      errors[kind] = l1Error(runs[kind].solution, exact);
    });
    var c = params.cfl / 100;
    return {
      audit: audit(params, exact, [runs.upwind, runs.laxWendroff, runs.centered]),
      cfl: c,
      errors: errors,
      exact: exact,
      initial: sampleInitial(params),
      params: params,
      runs: runs,
      sweep: sweep(params),
      amplification: {
        upwind: maxAmplification("upwind", c, params.viscosity / 100),
        laxWendroff: maxAmplification("laxWendroff", c, params.viscosity / 100),
        centered: maxAmplification("centered", c, params.viscosity / 100)
      }
    };
  }

  function setCanvasSize(canvas) {
    var cssWidth = Math.max(320, Math.floor(canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 640));
    var height = cssWidth < 560 ? 1120 : 780;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, height);
    return { ctx: ctx, width: cssWidth, height: height };
  }

  function drawPanel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 40);
    }
  }

  function extent(values, pad) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function (value) {
      if (!Number.isFinite(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var extra = (max - min) * (pad == null ? 0.1 : pad);
    return { min: min - extra, max: max + extra };
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) / span * (range.max - range.min);
    };
  }

  function drawGrid(ctx, plot, xTicks, yTicks) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= xTicks; i += 1) {
      var x = plot.x + plot.w * i / xTicks;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    }
    for (var j = 0; j <= yTicks; j += 1) {
      var y = plot.y + plot.h * j / yTicks;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
  }

  function drawSeries(ctx, data, plot, sx, sy, color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    data.forEach(function (value, i) {
      var x = sx((i + 0.5) / data.length);
      var y = sy(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function selectedKinds(params) {
    return params.mode === "all" ? ["upwind", "laxWendroff", "centered"] : [params.mode];
  }

  function drawProfiles(ctx, box, result) {
    drawPanel(ctx, box, "Transport after " + result.params.steps + " steps", "exact shift versus numerical schemes");
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 62, h: box.h - 92 };
    var values = result.exact.concat(result.initial);
    selectedKinds(result.params).forEach(function (kind) { values = values.concat(result.runs[kind].solution); });
    var sy = scale(extent(values, 0.12), { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 0, max: 1 }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    drawSeries(ctx, result.initial, plot, sx, sy, COLORS.muted, 1.5, [3, 5]);
    drawSeries(ctx, result.exact, plot, sx, sy, COLORS.exact, 2.2);
    selectedKinds(result.params).forEach(function (kind) {
      drawSeries(ctx, result.runs[kind].solution, plot, sx, sy, schemeColor(kind), 2);
    });
    drawLegend(ctx, plot.x + 4, box.y + box.h - 18, selectedKinds(result.params));
  }

  function drawLegend(ctx, x, y, kinds) {
    var items = [{ label: "exact", color: COLORS.exact, dash: [] }, { label: "initial", color: COLORS.muted, dash: [3, 5] }];
    kinds.forEach(function (kind) { items.push({ label: schemeLabel(kind), color: schemeColor(kind), dash: [] }); });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    var offset = 0;
    items.forEach(function (item) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 3;
      ctx.setLineDash(item.dash);
      ctx.beginPath();
      ctx.moveTo(x + offset, y - 4);
      ctx.lineTo(x + offset + 18, y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item.label, x + offset + 23, y);
      offset += Math.max(74, item.label.length * 7 + 38);
    });
  }

  function drawHistory(ctx, box, result) {
    drawPanel(ctx, box, "Energy and variation", "centered grows; upwind diffuses; LW disperses");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 70, h: box.h - 92 };
    var rows = [];
    selectedKinds(result.params).forEach(function (kind) {
      result.runs[kind].history.forEach(function (row) { rows.push(row.l2); });
    });
    var sy = scale(extent(rows, 0.15), { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 0, max: result.params.steps }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 5, 4);
    selectedKinds(result.params).forEach(function (kind) {
      var hist = result.runs[kind].history;
      ctx.strokeStyle = schemeColor(kind);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      hist.forEach(function (row, i) {
        var x = sx(row.step);
        var y = sy(row.l2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("RMS amplitude", plot.x, box.y + box.h - 18);
  }

  function drawAmplification(ctx, box, result) {
    drawPanel(ctx, box, "Fourier amplification", "max above 1 means some mode grows");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 70, h: box.h - 92 };
    var c = result.cfl;
    var visc = result.params.viscosity / 100;
    var rows = [];
    for (var i = 0; i <= 128; i += 1) {
      var theta = Math.PI * i / 128;
      rows.push({
        theta: theta / Math.PI,
        upwind: amplification("upwind", c, theta, visc),
        laxWendroff: amplification("laxWendroff", c, theta, visc),
        centered: amplification("centered", c, theta, visc)
      });
    }
    var values = [];
    selectedKinds(result.params).forEach(function (kind) { rows.forEach(function (row) { values.push(Math.min(3, row[kind])); }); });
    values.push(1);
    var sy = scale(extent(values, 0.12), { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 0, max: 1 }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(1));
    ctx.lineTo(plot.x + plot.w, sy(1));
    ctx.stroke();
    selectedKinds(result.params).forEach(function (kind) {
      ctx.strokeStyle = schemeColor(kind);
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, idx) {
        var x = sx(row.theta);
        var y = sy(Math.min(3, row[kind]));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("wavenumber / pi", plot.x + plot.w - 92, box.y + box.h - 18);
  }

  function drawSweep(ctx, box, result) {
    drawPanel(ctx, box, "CFL sweep", "final L1 error versus Courant number");
    var plot = { x: box.x + 48, y: box.y + 58, w: box.w - 70, h: box.h - 92 };
    var values = [];
    result.sweep.forEach(function (row) {
      selectedKinds(result.params).forEach(function (kind) { values.push(Math.min(2, row[kind])); });
    });
    var sy = scale(extent(values.concat([0]), 0.15), { min: plot.y + plot.h, max: plot.y });
    var sx = scale({ min: 0.1, max: 1.4 }, { min: plot.x, max: plot.x + plot.w });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.cfl;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(1), plot.y);
    ctx.lineTo(sx(1), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    selectedKinds(result.params).forEach(function (kind) {
      ctx.strokeStyle = schemeColor(kind);
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.sweep.forEach(function (row, idx) {
        var x = sx(row.cfl);
        var y = sy(Math.min(2, row[kind]));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("CFL = 1", sx(1) + 4, plot.y + 14);
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, frame.width, frame.height);
    var pad = 14;
    if (frame.width < 560) {
      drawProfiles(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 300 }, result);
      drawHistory(ctx, { x: pad, y: 330, w: frame.width - pad * 2, h: 244 }, result);
      drawAmplification(ctx, { x: pad, y: 590, w: frame.width - pad * 2, h: 244 }, result);
      drawSweep(ctx, { x: pad, y: 850, w: frame.width - pad * 2, h: 254 }, result);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawProfiles(ctx, { x: pad, y: pad, w: col, h: 376 }, result);
      drawHistory(ctx, { x: pad * 2 + col, y: pad, w: col, h: 376 }, result);
      drawAmplification(ctx, { x: pad, y: 410, w: col, h: 354 }, result);
      drawSweep(ctx, { x: pad * 2 + col, y: 410, w: col, h: 354 }, result);
    }
  }

  function syncOutputs(root, result) {
    var values = {
      shape: result.params.shape,
      cells: result.params.cells,
      cfl: fmt(result.cfl, 2),
      steps: result.params.steps,
      mode: result.params.mode === "all" ? "all schemes" : schemeLabel(result.params.mode),
      viscosity: fmt(result.params.viscosity / 100, 2)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    var bestKind = "upwind";
    ["laxWendroff", "centered"].forEach(function (kind) {
      if (result.errors[kind] < result.errors[bestKind]) bestKind = kind;
    });
    metrics.innerHTML = [
      metric("CFL", fmt(result.cfl, 2)),
      metric("Upwind L1", fmt(result.errors.upwind, 3)),
      metric("LW L1", fmt(result.errors.laxWendroff, 3)),
      metric("Centered amp", fmt(result.amplification.centered, 3)),
      metric("Best", schemeLabel(bestKind)),
      metric("Audit", result.audit.passed ? "passed" : "check")
    ].join("");
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__cflAdvectionResult = result;
  }

  function init(root) {
    if (!root || root.__cflAdvectionReady) return;
    root.__cflAdvectionReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var timer = null;
    global.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-cfl-advection-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    exactSolution: exactSolution,
    initialValue: initialValue,
    maxAmplification: maxAmplification,
    simulate: simulate,
    stepScheme: stepScheme,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CflAdvectionLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
