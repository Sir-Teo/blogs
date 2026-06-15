(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e8eef4",
    panel: "#f8fafc",
    white: "#ffffff",
    lqr: "#0f766e",
    coast: "#64748b",
    velocity: "#b45309",
    gain: "#2563eb",
    value: "#8b5cf6",
    energy: "#be123c",
    gust: "#dc2626"
  };

  var DEFAULTS = {
    horizon: 42,
    positionCost: 34,
    velocityCost: 8,
    controlCost: 46,
    terminalWeight: 24,
    startPos: 210,
    startVel: -45,
    gust: 42,
    drag: 2
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
    return {
      horizon: clamp(Math.round(readNumber(raw, "horizon")), 16, 80),
      positionCost: clamp(Math.round(readNumber(raw, "positionCost")), 4, 120),
      velocityCost: clamp(Math.round(readNumber(raw, "velocityCost")), 0, 80),
      controlCost: clamp(Math.round(readNumber(raw, "controlCost")), 4, 260),
      terminalWeight: clamp(Math.round(readNumber(raw, "terminalWeight")), 2, 80),
      startPos: clamp(Math.round(readNumber(raw, "startPos")), -300, 300),
      startVel: clamp(Math.round(readNumber(raw, "startVel")), -180, 180),
      gust: clamp(Math.round(readNumber(raw, "gust")), -120, 120),
      drag: clamp(Math.round(readNumber(raw, "drag")), 0, 12)
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
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(d);
    if (Math.abs(value) >= 0.01) return value.toFixed(d + 1);
    return value.toExponential(2);
  }

  function metric(label, value) {
    return '<div class="lqr-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function makeModel(params) {
    var dt = 0.12;
    var drag = 1 - params.drag / 100;
    var qPos = params.positionCost / 10;
    var qVel = params.velocityCost / 10;
    var r = params.controlCost / 100;
    var terminal = params.terminalWeight / 10;
    return {
      A: [[1, dt], [0, drag]],
      B: [0.5 * dt * dt, dt],
      Q: [[qPos, 0], [0, qVel]],
      Qf: [[qPos * terminal, 0], [0, qVel * terminal]],
      R: r,
      dt: dt,
      gust: params.gust / 100,
      gustStep: Math.max(2, Math.min(params.horizon - 2, Math.round(params.horizon * 0.45))),
      horizon: params.horizon,
      initial: [params.startPos / 100, params.startVel / 100],
      params: params
    };
  }

  function add2(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function scale2(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function matVec(A, x) {
    return [
      A[0][0] * x[0] + A[0][1] * x[1],
      A[1][0] * x[0] + A[1][1] * x[1]
    ];
  }

  function quad(P, x) {
    return P[0][0] * x[0] * x[0] + (P[0][1] + P[1][0]) * x[0] * x[1] + P[1][1] * x[1] * x[1];
  }

  function norm2(x) {
    return Math.sqrt(x[0] * x[0] + x[1] * x[1]);
  }

  function matMul(A, B) {
    return [
      [
        A[0][0] * B[0][0] + A[0][1] * B[1][0],
        A[0][0] * B[0][1] + A[0][1] * B[1][1]
      ],
      [
        A[1][0] * B[0][0] + A[1][1] * B[1][0],
        A[1][0] * B[0][1] + A[1][1] * B[1][1]
      ]
    ];
  }

  function transpose(A) {
    return [[A[0][0], A[1][0]], [A[0][1], A[1][1]]];
  }

  function minEigenSym(P) {
    var a = 0.5 * (P[0][0] + P[0][0]);
    var b = 0.5 * (P[0][1] + P[1][0]);
    var d = 0.5 * (P[1][1] + P[1][1]);
    var center = 0.5 * (a + d);
    var spread = Math.sqrt(Math.pow(0.5 * (a - d), 2) + b * b);
    return center - spread;
  }

  function solveLqr(model) {
    var N = model.horizon;
    var A = model.A;
    var B = model.B;
    var At = transpose(A);
    var P = new Array(N + 1);
    var K = new Array(N);
    var denominators = new Array(N);
    P[N] = [[model.Qf[0][0], model.Qf[0][1]], [model.Qf[1][0], model.Qf[1][1]]];

    for (var t = N - 1; t >= 0; t -= 1) {
      var S = P[t + 1];
      var SB = [
        S[0][0] * B[0] + S[0][1] * B[1],
        S[1][0] * B[0] + S[1][1] * B[1]
      ];
      var denom = model.R + B[0] * SB[0] + B[1] * SB[1];
      var g = [
        SB[0] * A[0][0] + SB[1] * A[1][0],
        SB[0] * A[0][1] + SB[1] * A[1][1]
      ];
      var gain = [g[0] / denom, g[1] / denom];
      var SA = matMul(S, A);
      var AtSA = matMul(At, SA);
      var nextP = [
        [
          model.Q[0][0] + AtSA[0][0] - g[0] * g[0] / denom,
          model.Q[0][1] + AtSA[0][1] - g[0] * g[1] / denom
        ],
        [
          model.Q[1][0] + AtSA[1][0] - g[1] * g[0] / denom,
          model.Q[1][1] + AtSA[1][1] - g[1] * g[1] / denom
        ]
      ];
      var off = 0.5 * (nextP[0][1] + nextP[1][0]);
      nextP[0][1] = off;
      nextP[1][0] = off;
      P[t] = nextP;
      K[t] = gain;
      denominators[t] = denom;
    }

    return { P: P, K: K, denominators: denominators };
  }

  function step(model, x, u) {
    return add2(matVec(model.A, x), scale2(model.B, u));
  }

  function simulate(model, policy, kind, useGust) {
    var x = model.initial.slice();
    var states = [{ t: 0, x: x[0], v: x[1], u: 0, cost: 0 }];
    var controls = [];
    var stageCost = 0;
    var energy = 0;
    var peakU = 0;

    for (var t = 0; t < model.horizon; t += 1) {
      var gain = kind === "lqr" ? policy.K[t] : [0, 0];
      var u = -(gain[0] * x[0] + gain[1] * x[1]);
      var cost = quad(model.Q, x) + model.R * u * u;
      stageCost += cost;
      energy += u * u;
      peakU = Math.max(peakU, Math.abs(u));
      x = step(model, x, u);
      if (useGust && t === model.gustStep) x[1] += model.gust;
      controls.push({ t: t, u: u, kPos: gain[0], kVel: gain[1], cost: cost });
      states.push({ t: t + 1, x: x[0], v: x[1], u: u, cost: cost });
    }

    var terminalCost = quad(model.Qf, x);
    return {
      controls: controls,
      cost: stageCost + terminalCost,
      energy: energy,
      peakU: peakU,
      stageCost: stageCost,
      states: states,
      terminal: x,
      terminalCost: terminalCost,
      terminalNorm: norm2(x)
    };
  }

  function audit(model, policy, nominal) {
    var states = [
      model.initial,
      [1, 0],
      [0, 1],
      [-0.7, 0.35],
      [0.4, -0.9]
    ];
    var finite = true;
    var minDenom = Infinity;
    var minEig = Infinity;
    var maxSym = 0;
    var maxIdentity = 0;

    policy.P.forEach(function (P) {
      minEig = Math.min(minEig, minEigenSym(P));
      maxSym = Math.max(maxSym, Math.abs(P[0][1] - P[1][0]));
      P.forEach(function (row) {
        row.forEach(function (value) {
          if (!Number.isFinite(value)) finite = false;
        });
      });
    });
    policy.K.forEach(function (gain, t) {
      minDenom = Math.min(minDenom, policy.denominators[t]);
      if (!Number.isFinite(gain[0]) || !Number.isFinite(gain[1]) || !Number.isFinite(policy.denominators[t])) finite = false;
      states.forEach(function (x) {
        var u = -(gain[0] * x[0] + gain[1] * x[1]);
        var next = step(model, x, u);
        var lhs = quad(policy.P[t], x);
        var rhs = quad(model.Q, x) + model.R * u * u + quad(policy.P[t + 1], next);
        maxIdentity = Math.max(maxIdentity, Math.abs(lhs - rhs));
      });
    });

    var value0 = quad(policy.P[0], model.initial);
    var costError = Math.abs(value0 - nominal.cost);
    var checks = {
      finite: finite,
      positiveDenominator: minDenom > 1e-10,
      symmetric: maxSym < 1e-9,
      positiveSemidefinite: minEig > -1e-8,
      bellmanIdentity: maxIdentity < 1e-8,
      nominalCostMatches: costError < 1e-8
    };
    var passed = Object.keys(checks).every(function (key) { return checks[key]; });
    return {
      checks: checks,
      costError: costError,
      maxIdentity: maxIdentity,
      minDenom: minDenom,
      minEigen: minEig,
      passed: passed,
      value0: value0
    };
  }

  function buildPareto(params) {
    var values = [];
    var minRaw = 5;
    var maxRaw = 240;
    for (var i = 0; i < 18; i += 1) {
      var a = i / 17;
      var raw = Math.round(minRaw * Math.pow(maxRaw / minRaw, a));
      var trial = cleanParams(Object.assign({}, params, { controlCost: raw }));
      var model = makeModel(trial);
      var policy = solveLqr(model);
      var run = simulate(model, policy, "lqr", true);
      values.push({
        controlCost: model.R,
        energy: run.energy,
        terminalNorm: run.terminalNorm,
        current: raw === params.controlCost
      });
    }
    return values;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var model = makeModel(params);
    var policy = solveLqr(model);
    var nominal = simulate(model, policy, "lqr", false);
    var lqr = simulate(model, policy, "lqr", true);
    var coast = simulate(model, policy, "coast", true);
    var report = audit(model, policy, nominal);
    return {
      audit: report,
      coast: coast,
      lqr: lqr,
      model: model,
      nominal: nominal,
      params: params,
      pareto: buildPareto(params),
      policy: policy
    };
  }

  function setCanvasSize(canvas) {
    var cssWidth = Math.max(320, Math.floor(canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 640));
    var height = cssWidth < 560 ? 1110 : 780;
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
    var extra = (max - min) * (pad == null ? 0.12 : pad);
    return { min: min - extra, max: max + extra };
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) / span * (range.max - range.min);
    };
  }

  function strokeLine(ctx, rows, sx, sy, keyX, keyY, color, width, dash) {
    if (!rows.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row[keyX]);
      var y = sy(row[keyY]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
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

  function drawLegend(ctx, x, y, items) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + item.offset;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 3;
      ctx.setLineDash(item.dash || []);
      ctx.beginPath();
      ctx.moveTo(ox, y - 4);
      ctx.lineTo(ox + 18, y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item.label, ox + 24, y);
    });
  }

  function drawValueEllipses(ctx, result, sx, sy) {
    var P = result.policy.P[0];
    var base = Math.max(0.25, quad(P, result.model.initial));
    var levels = [0.2 * base, 0.45 * base, 0.75 * base];
    ctx.strokeStyle = COLORS.value;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    levels.forEach(function (level) {
      ctx.beginPath();
      for (var i = 0; i <= 144; i += 1) {
        var a = 2 * Math.PI * i / 144;
        var dir = [Math.cos(a), Math.sin(a)];
        var denom = Math.max(1e-9, quad(P, dir));
        var radius = Math.sqrt(level / denom);
        var point = [dir[0] * radius, dir[1] * radius];
        if (i === 0) ctx.moveTo(sx(point[0]), sy(point[1]));
        else ctx.lineTo(sx(point[0]), sy(point[1]));
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawPhase(ctx, box, result) {
    drawPanel(ctx, box, "State space", "feedback follows value contours after the kick");
    var plot = { x: box.x + 44, y: box.y + 56, w: box.w - 64, h: box.h - 86 };
    var xs = [];
    var vs = [];
    [result.lqr.states, result.coast.states].forEach(function (rows) {
      rows.forEach(function (row) {
        xs.push(row.x);
        vs.push(row.v);
      });
    });
    xs.push(-0.2, 0.2);
    vs.push(-0.2, 0.2);
    var dx = extent(xs, 0.18);
    var dy = extent(vs, 0.18);
    var sx = scale(dx, { min: plot.x, max: plot.x + plot.w });
    var sy = scale(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(sx(0), plot.y);
    ctx.lineTo(sx(0), plot.y + plot.h);
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    drawValueEllipses(ctx, result, sx, sy);
    strokeLine(ctx, result.coast.states, sx, sy, "x", "v", COLORS.coast, 2, [5, 5]);
    strokeLine(ctx, result.lqr.states, sx, sy, "x", "v", COLORS.lqr, 2.5);
    var kick = result.lqr.states[result.model.gustStep + 1];
    ctx.fillStyle = COLORS.gust;
    ctx.beginPath();
    ctx.arc(sx(kick.x), sy(kick.v), 4, 0, Math.PI * 2);
    ctx.fill();
    var start = result.lqr.states[0];
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(sx(start.x), sy(start.v), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.lqr;
    ctx.beginPath();
    ctx.arc(sx(0), sy(0), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("position", plot.x + plot.w - 52, plot.y + plot.h + 22);
    ctx.save();
    ctx.translate(plot.x - 28, plot.y + 18);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("velocity", 0, 0);
    ctx.restore();
  }

  function drawTimeSeries(ctx, box, result) {
    drawPanel(ctx, box, "Closed-loop trace", "position, velocity, and control over time");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 62, h: box.h - 88 };
    var values = [];
    result.lqr.states.forEach(function (row) {
      values.push(row.x, row.v);
    });
    result.lqr.controls.forEach(function (row) { values.push(row.u); });
    var dy = extent(values, 0.15);
    var sx = scale({ min: 0, max: result.model.horizon }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 5, 4);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, sy(0));
    ctx.lineTo(plot.x + plot.w, sy(0));
    ctx.stroke();
    strokeLine(ctx, result.lqr.states, sx, sy, "t", "x", COLORS.lqr, 2.4);
    strokeLine(ctx, result.lqr.states, sx, sy, "t", "v", COLORS.velocity, 2);
    strokeLine(ctx, result.lqr.controls, sx, sy, "t", "u", COLORS.gain, 1.8, [4, 4]);
    var gx = sx(result.model.gustStep + 1);
    ctx.strokeStyle = COLORS.gust;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(gx, plot.y);
    ctx.lineTo(gx, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLegend(ctx, plot.x + 6, box.y + box.h - 18, [
      { label: "position", color: COLORS.lqr, offset: 0 },
      { label: "velocity", color: COLORS.velocity, offset: 98 },
      { label: "control", color: COLORS.gain, offset: 194, dash: [4, 4] }
    ]);
  }

  function drawGains(ctx, box, result) {
    drawPanel(ctx, box, "Backward pass", "Riccati gains from now to horizon");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 62, h: box.h - 86 };
    var rows = result.policy.K.map(function (gain, t) {
      return { t: t, kp: gain[0], kv: gain[1] };
    });
    var dy = extent(rows.flatMap(function (row) { return [row.kp, row.kv]; }), 0.16);
    var sx = scale({ min: 0, max: result.model.horizon - 1 }, { min: plot.x, max: plot.x + plot.w });
    var sy = scale(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 5, 4);
    strokeLine(ctx, rows, sx, sy, "t", "kp", COLORS.gain, 2.3);
    strokeLine(ctx, rows, sx, sy, "t", "kv", COLORS.value, 2.1);
    drawLegend(ctx, plot.x + 6, box.y + box.h - 17, [
      { label: "K position", color: COLORS.gain, offset: 0 },
      { label: "K velocity", color: COLORS.value, offset: 112 }
    ]);
  }

  function drawPareto(ctx, box, result) {
    drawPanel(ctx, box, "Control price sweep", "terminal error vs actuation energy");
    var plot = { x: box.x + 48, y: box.y + 56, w: box.w - 72, h: box.h - 90 };
    var dx = extent(result.pareto.map(function (row) { return row.energy; }), 0.12);
    var dy = extent(result.pareto.map(function (row) { return row.terminalNorm; }), 0.12);
    var sx = scale(dx, { min: plot.x, max: plot.x + plot.w });
    var sy = scale(dy, { min: plot.y + plot.h, max: plot.y });
    drawGrid(ctx, plot, 4, 4);
    ctx.strokeStyle = COLORS.energy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.pareto.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(sx(row.energy), sy(row.terminalNorm));
      else ctx.lineTo(sx(row.energy), sy(row.terminalNorm));
    });
    ctx.stroke();
    result.pareto.forEach(function (row) {
      var isCurrent = Math.abs(row.controlCost - result.model.R) < 1e-9;
      ctx.fillStyle = isCurrent ? COLORS.text : COLORS.energy;
      ctx.beginPath();
      ctx.arc(sx(row.energy), sy(row.terminalNorm), isCurrent ? 4.8 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("energy", plot.x + plot.w - 42, plot.y + plot.h + 22);
    ctx.save();
    ctx.translate(plot.x - 32, plot.y + 58);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("terminal error", 0, 0);
    ctx.restore();
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, frame.width, frame.height);
    var pad = 14;
    if (frame.width < 560) {
      drawPhase(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 310 }, result);
      drawTimeSeries(ctx, { x: pad, y: 340, w: frame.width - pad * 2, h: 250 }, result);
      drawGains(ctx, { x: pad, y: 606, w: frame.width - pad * 2, h: 234 }, result);
      drawPareto(ctx, { x: pad, y: 856, w: frame.width - pad * 2, h: 238 }, result);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawPhase(ctx, { x: pad, y: pad, w: col, h: 380 }, result);
      drawTimeSeries(ctx, { x: pad * 2 + col, y: pad, w: col, h: 380 }, result);
      drawGains(ctx, { x: pad, y: 410, w: col, h: 354 }, result);
      drawPareto(ctx, { x: pad * 2 + col, y: 410, w: col, h: 354 }, result);
    }
  }

  function syncOutputs(root, result) {
    var values = {
      horizon: result.params.horizon,
      positionCost: fmt(result.model.Q[0][0], 2),
      velocityCost: fmt(result.model.Q[1][1], 2),
      controlCost: fmt(result.model.R, 2),
      terminalWeight: fmt(result.params.terminalWeight / 10, 2) + "x",
      startPos: fmt(result.model.initial[0], 2),
      startVel: fmt(result.model.initial[1], 2),
      gust: fmt(result.model.gust, 2),
      drag: fmt(result.params.drag, 0) + "%"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var ratio = result.coast.cost / Math.max(1e-12, result.lqr.cost);
    var k0 = result.policy.K[0];
    var metrics = root.querySelector("[data-metrics]");
    if (!metrics) return;
    metrics.innerHTML = [
      metric("DP cost", fmt(result.audit.value0, 2)),
      metric("Coast / LQR", fmt(ratio, 2) + "x"),
      metric("Terminal norm", fmt(result.lqr.terminalNorm, 2)),
      metric("Peak |u|", fmt(result.lqr.peakU, 2)),
      metric("K0", "[" + fmt(k0[0], 2) + ", " + fmt(k0[1], 2) + "]"),
      metric("Audit", result.audit.passed ? "passed" : "check")
    ].join("");
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__lqrRiccatiResult = result;
  }

  function init(root) {
    if (!root || root.__lqrRiccatiReady) return;
    root.__lqrRiccatiReady = true;
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
    global.document.querySelectorAll("[data-lqr-riccati-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    makeModel: makeModel,
    simulate: simulate,
    solveLqr: solveLqr,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LqrRiccatiLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
