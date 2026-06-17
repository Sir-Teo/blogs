(function (global) {
  "use strict";

  var COLORS = {
    axis: "#d7dee5",
    barrier: "#0f766e",
    blue: "#2563eb",
    current: "#be123c",
    fill: "rgba(15, 118, 110, 0.10)",
    gold: "#d97706",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    optimum: "#7c3aed",
    panel: "#f8fafc",
    redSoft: "rgba(190, 18, 60, 0.12)",
    tealSoft: "rgba(15, 118, 110, 0.13)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    growth: 30,
    logT: 20,
    scenario: "blend",
    tilt: 0
  };

  var SCENARIOS = {
    blend: {
      angle: 42,
      label: "factory blend",
      note: "A resource-allocation polygon with two resource walls and box limits.",
      constraints: [
        { a: [-1, 0], b: 0, label: "x >= 0" },
        { a: [0, -1], b: 0, label: "y >= 0" },
        { a: [1, 0], b: 6.0, label: "x <= 6" },
        { a: [0, 1], b: 4.8, label: "y <= 4.8" },
        { a: [1.25, 1.0], b: 7.2, label: "mix A" },
        { a: [0.45, 1.65], b: 6.7, label: "mix B" }
      ]
    },
    corridor: {
      angle: 28,
      label: "narrow corridor",
      note: "A thin feasible region where the central path bends before choosing a vertex.",
      constraints: [
        { a: [-1, 0], b: 0, label: "x >= 0" },
        { a: [0, -1], b: 0, label: "y >= 0" },
        { a: [1, 0], b: 7.2, label: "x <= 7.2" },
        { a: [0, 1], b: 5.0, label: "y <= 5" },
        { a: [-0.58, 1], b: 1.05, label: "upper lane" },
        { a: [0.22, -1], b: 0.18, label: "lower lane" },
        { a: [0.72, 1], b: 6.15, label: "cap" }
      ]
    },
    redundant: {
      angle: 50,
      label: "redundant walls",
      note: "Several constraints are loose near the answer; the barrier still accounts for them.",
      constraints: [
        { a: [-1, 0], b: 0, label: "x >= 0" },
        { a: [0, -1], b: 0, label: "y >= 0" },
        { a: [1, 0], b: 5.4, label: "x <= 5.4" },
        { a: [0, 1], b: 4.6, label: "y <= 4.6" },
        { a: [1, 1], b: 6.35, label: "budget" },
        { a: [1.02, 0.98], b: 6.55, label: "near duplicate" },
        { a: [1.8, 0.35], b: 8.25, label: "machine" },
        { a: [0.25, 1.55], b: 6.15, label: "storage" }
      ]
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      growth: snap(raw.growth, DEFAULTS.growth, 15, 60, 1),
      logT: snap(raw.logT, DEFAULTS.logT, 0, 30, 1),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      tilt: snap(raw.tilt, DEFAULTS.tilt, -30, 30, 1)
    };
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function scale(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function objectiveVector(problem, tilt) {
    var theta = (problem.angle + tilt) * Math.PI / 180;
    return [-Math.cos(theta), -Math.sin(theta)];
  }

  function slacks(problem, x) {
    return problem.constraints.map(function (con) {
      return con.b - dot(con.a, x);
    });
  }

  function minValue(values) {
    return Math.min.apply(null, values);
  }

  function isFeasible(problem, x, eps) {
    eps = eps == null ? 1e-9 : eps;
    return slacks(problem, x).every(function (s) { return s >= -eps; });
  }

  function vertices(problem) {
    var out = [];
    var seen = {};
    var cons = problem.constraints;
    for (var i = 0; i < cons.length; i += 1) {
      for (var j = i + 1; j < cons.length; j += 1) {
        var a = cons[i].a;
        var b = cons[j].a;
        var det = a[0] * b[1] - a[1] * b[0];
        if (Math.abs(det) < 1e-10) continue;
        var x = [
          (cons[i].b * b[1] - a[1] * cons[j].b) / det,
          (a[0] * cons[j].b - cons[i].b * b[0]) / det
        ];
        if (!isFeasible(problem, x, 1e-7)) continue;
        var key = x.map(function (v) { return Math.round(v * 1e8); }).join("|");
        if (!seen[key]) {
          seen[key] = true;
          out.push(x);
        }
      }
    }
    var center = out.reduce(function (sum, x) { return add(sum, x); }, [0, 0]);
    center = out.length ? scale(center, 1 / out.length) : [0, 0];
    out.sort(function (a, b) {
      return Math.atan2(a[1] - center[1], a[0] - center[0]) - Math.atan2(b[1] - center[1], b[0] - center[0]);
    });
    return out;
  }

  function interiorPoint(poly) {
    var x = poly.reduce(function (sum, v) { return add(sum, v); }, [0, 0]);
    return scale(x, 1 / Math.max(1, poly.length));
  }

  function optimumVertex(problem, c, poly) {
    var best = poly[0];
    var bestValue = dot(c, best);
    poly.forEach(function (v) {
      var value = dot(c, v);
      if (value < bestValue) {
        best = v;
        bestValue = value;
      }
    });
    return { point: best, value: bestValue };
  }

  function barrierValue(problem, c, t, x) {
    var ss = slacks(problem, x);
    if (ss.some(function (s) { return s <= 0; })) return Infinity;
    var out = t * dot(c, x);
    ss.forEach(function (s) { out -= Math.log(s); });
    return out;
  }

  function barrierDerivatives(problem, c, t, x) {
    var g = [t * c[0], t * c[1]];
    var h00 = 0;
    var h01 = 0;
    var h11 = 0;
    var ss = slacks(problem, x);
    problem.constraints.forEach(function (con, i) {
      var inv = 1 / ss[i];
      var inv2 = inv * inv;
      var a = con.a;
      g[0] += a[0] * inv;
      g[1] += a[1] * inv;
      h00 += a[0] * a[0] * inv2;
      h01 += a[0] * a[1] * inv2;
      h11 += a[1] * a[1] * inv2;
    });
    return { grad: g, h: [h00, h01, h11], slacks: ss };
  }

  function solve2(h, g) {
    var det = h[0] * h[2] - h[1] * h[1];
    if (Math.abs(det) < 1e-14) return [0, 0];
    return [
      -(h[2] * g[0] - h[1] * g[1]) / det,
      -(-h[1] * g[0] + h[0] * g[1]) / det
    ];
  }

  function maxFeasibleStep(problem, x, p) {
    var ss = slacks(problem, x);
    var alpha = 1;
    problem.constraints.forEach(function (con, i) {
      var towardWall = dot(con.a, p);
      if (towardWall > 0) alpha = Math.min(alpha, 0.995 * ss[i] / towardWall);
    });
    return clamp(alpha, 0, 1);
  }

  function solveBarrier(problem, c, t, start) {
    var x = [start[0], start[1]];
    var iterations = 0;
    var decrement = Infinity;
    for (var iter = 0; iter < 80; iter += 1) {
      var d = barrierDerivatives(problem, c, t, x);
      var p = solve2(d.h, d.grad);
      var gp = dot(d.grad, p);
      decrement = Math.sqrt(Math.max(0, -gp));
      if (decrement * decrement / 2 < 1e-12) break;
      var alpha = maxFeasibleStep(problem, x, p);
      var f0 = barrierValue(problem, c, t, x);
      while (alpha > 1e-10) {
        var candidate = add(x, scale(p, alpha));
        var f1 = barrierValue(problem, c, t, candidate);
        if (isFinite(f1) && f1 <= f0 + 0.02 * alpha * gp) {
          x = candidate;
          break;
        }
        alpha *= 0.5;
      }
      iterations += 1;
      if (alpha <= 1e-10) break;
    }
    return { decrement: decrement, iterations: iterations, point: x };
  }

  function targetSequence(tMax, growth) {
    var t = 0.25;
    var out = [t];
    while (t * growth < tMax * 0.999) {
      t *= growth;
      out.push(t);
    }
    if (out[out.length - 1] !== tMax) out.push(tMax);
    return out;
  }

  function logSpace(tMax, count) {
    var lo = Math.log(0.25);
    var hi = Math.log(tMax);
    var out = [];
    for (var i = 0; i < count; i += 1) {
      var u = count === 1 ? 1 : i / (count - 1);
      out.push(Math.exp(lo + u * (hi - lo)));
    }
    return out;
  }

  function solvePath(problem, c, ts, start, optimum) {
    var x = start;
    var totalNewton = 0;
    return ts.map(function (t) {
      var solved = solveBarrier(problem, c, t, x);
      x = solved.point;
      totalNewton += solved.iterations;
      var ss = slacks(problem, x);
      return {
        decrement: solved.decrement,
        gap: problem.constraints.length / t,
        minSlack: minValue(ss),
        objective: dot(c, x),
        point: x,
        regret: dot(c, x) - optimum.value,
        slacks: ss,
        t: t,
        totalNewton: totalNewton,
        iterations: solved.iterations
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var problem = SCENARIOS[params.scenario];
    var c = objectiveVector(problem, params.tilt);
    var poly = vertices(problem);
    var start = interiorPoint(poly);
    var optimum = optimumVertex(problem, c, poly);
    var tMax = Math.pow(10, params.logT / 10);
    var growth = params.growth / 10;
    var stages = solvePath(problem, c, targetSequence(tMax, growth), start, optimum);
    var path = solvePath(problem, c, logSpace(tMax, 32), start, optimum);
    var current = path[path.length - 1];
    var scheduleCurrent = stages[stages.length - 1];
    var lambdas = current.slacks.map(function (s) { return 1 / (tMax * s); });
    var active = current.slacks.map(function (s, index) {
      return { index: index, label: problem.constraints[index].label, lambda: lambdas[index], slack: s };
    }).sort(function (a, b) { return b.lambda - a.lambda; });
    return {
      active: active,
      c: c,
      current: current,
      growth: growth,
      lambdas: lambdas,
      optimum: optimum,
      params: params,
      path: path,
      polygon: poly,
      problem: problem,
      scheduleCurrent: scheduleCurrent,
      stages: stages,
      start: start,
      tMax: tMax
    };
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return String(value);
    if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
    return String(Number(value.toFixed(digits == null ? 3 : digits)));
  }

  function fmtPct(value) {
    return fmt(100 * value, 2) + "%";
  }

  function metric(label, value, tone) {
    return '<div class="barrier-lab__metric ' + (tone || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 940));
    var compact = width < 700;
    var height = compact ? 1120 : 760;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { compact: compact, ctx: ctx, height: height, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 650) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function wrapLabel(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var line = "";
    ctx.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    words.forEach(function (word) {
      var next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    var limit = Math.min(maxLines || lines.length, lines.length);
    for (var i = 0; i < limit; i += 1) {
      var out = lines[i];
      if (i === limit - 1 && lines.length > limit) out = out.replace(/[.,;:]?$/, "") + "...";
      label(ctx, out, x, y + i * lineHeight, COLORS.muted, 12, 600);
    }
  }

  function panel(ctx, box, title, subtitle) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 12, COLORS.ink, 14, 790);
    if (subtitle) wrapLabel(ctx, subtitle, box.x + 14, box.y + 34, box.w - 28, 15, 2);
  }

  function bounds(points) {
    var xs = points.map(function (p) { return p[0]; });
    var ys = points.map(function (p) { return p[1]; });
    return {
      maxX: Math.max.apply(null, xs),
      maxY: Math.max.apply(null, ys),
      minX: Math.min.apply(null, xs),
      minY: Math.min.apply(null, ys)
    };
  }

  function pointMapper(poly, box) {
    var b = bounds(poly);
    var dx = Math.max(1e-6, b.maxX - b.minX);
    var dy = Math.max(1e-6, b.maxY - b.minY);
    var margin = 0.16;
    b.minX -= dx * margin;
    b.maxX += dx * margin;
    b.minY -= dy * margin;
    b.maxY += dy * margin;
    dx = b.maxX - b.minX;
    dy = b.maxY - b.minY;
    var sx = box.w / dx;
    var sy = box.h / dy;
    var s = Math.min(sx, sy);
    var ox = box.x + (box.w - dx * s) / 2;
    var oy = box.y + (box.h - dy * s) / 2;
    return function (p) {
      return [ox + (p[0] - b.minX) * s, oy + box.h - (p[1] - b.minY) * s];
    };
  }

  function drawDot(ctx, p, r, color, stroke) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawGeometry(ctx, state, box) {
    panel(ctx, box, "Feasible set", state.problem.note);
    var plot = { x: box.x + 30, y: box.y + 70, w: box.w - 60, h: box.h - 112 };
    var map = pointMapper(state.polygon, plot);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y + g * plot.h / 4);
      ctx.lineTo(plot.x + plot.w, plot.y + g * plot.h / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x + g * plot.w / 4, plot.y);
      ctx.lineTo(plot.x + g * plot.w / 4, plot.y + plot.h);
      ctx.stroke();
    }
    ctx.beginPath();
    state.polygon.forEach(function (v, i) {
      var p = map(v);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fillStyle = COLORS.fill;
    ctx.fill();
    ctx.strokeStyle = COLORS.barrier;
    ctx.lineWidth = 2;
    ctx.stroke();

    var center = map(state.start);
    var dir = [-state.c[0], -state.c[1]];
    ctx.strokeStyle = "rgba(215, 119, 6, 0.34)";
    ctx.lineWidth = 1;
    for (var k = -3; k <= 3; k += 1) {
      var base = [state.start[0] + dir[0] * k, state.start[1] + dir[1] * k];
      var normal = [-dir[1], dir[0]];
      var a = map(add(base, scale(normal, -20)));
      var b = map(add(base, scale(normal, 20)));
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    var arrowA = [center[0] - 34 * dir[0], center[1] + 34 * dir[1]];
    var arrowB = [center[0] + 34 * dir[0], center[1] - 34 * dir[1]];
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowA[0], arrowA[1]);
    ctx.lineTo(arrowB[0], arrowB[1]);
    ctx.stroke();
    label(ctx, "better", arrowB[0] + 4, arrowB[1] - 8, COLORS.gold, 11, 760);

    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    state.path.forEach(function (row, i) {
      var p = map(row.point);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
    state.path.forEach(function (row, i) {
      if (i % 6 === 0 || i === state.path.length - 1) drawDot(ctx, map(row.point), 3, COLORS.blue);
    });
    drawDot(ctx, map(state.optimum.point), 6, COLORS.optimum, COLORS.white);
    drawDot(ctx, map(state.current.point), 6, COLORS.current, COLORS.white);
    ctx.restore();
    label(ctx, "central path", plot.x + 4, box.y + box.h - 30, COLORS.blue, 11, 760);
    label(ctx, "optimum", plot.x + 110, box.y + box.h - 30, COLORS.optimum, 11, 760);
    label(ctx, "current", plot.x + 188, box.y + box.h - 30, COLORS.current, 11, 760);
  }

  function drawConvergence(ctx, state, box) {
    panel(ctx, box, "Gap ledger", "Barrier gap m/t and exact vertex regret on a log scale.");
    var plot = { x: box.x + 48, y: box.y + 82, w: box.w - 76, h: box.h - 136 };
    var rows = state.path;
    var values = rows.reduce(function (all, r) { return all.concat([r.gap, Math.max(r.regret, 1e-12)]); }, []);
    var minY = Math.log10(Math.max(1e-12, Math.min.apply(null, values) * 0.6));
    var maxY = Math.log10(Math.max.apply(null, values) * 1.25);
    function sx(i) { return plot.x + i / Math.max(1, rows.length - 1) * plot.w; }
    function sy(v) { return plot.y + plot.h - (Math.log10(Math.max(v, 1e-12)) - minY) / (maxY - minY || 1) * plot.h; }
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var yy = plot.y + g * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, yy);
      ctx.lineTo(plot.x + plot.w, yy);
      ctx.stroke();
    }
    [
      { color: COLORS.current, key: "regret", label: "regret" },
      { color: COLORS.barrier, key: "gap", label: "m/t" }
    ].forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      rows.forEach(function (r, i) {
        var x = sx(i);
        var y = sy(r[s.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      label(ctx, s.label, plot.x + (s.key === "gap" ? 72 : 8), plot.y + 10, s.color, 11, 780);
    });
    label(ctx, "central-path samples", plot.x + plot.w, box.y + box.h - 34, COLORS.muted, 11, 650, "right");
    label(ctx, "log scale", plot.x, box.y + box.h - 34, COLORS.muted, 11, 650);
  }

  function drawSlacks(ctx, state, box) {
    panel(ctx, box, "Slack prices", "Small slack gets a large multiplier; each product lambda_i s_i = 1/t.");
    var maxRows = Math.max(3, Math.floor((box.h - 132) / 26));
    var rows = state.active.slice(0, Math.min(maxRows, state.active.length));
    var rowGap = Math.min(28, (box.h - 136) / Math.max(1, rows.length));
    var maxLambda = Math.max.apply(null, rows.map(function (r) { return r.lambda; }).concat([1e-9]));
    var maxSlack = Math.max.apply(null, rows.map(function (r) { return r.slack; }).concat([1e-9]));
    var x = box.x + 18;
    var y = box.y + 86;
    var w = box.w - 36;
    rows.forEach(function (r, i) {
      var yy = y + i * rowGap;
      label(ctx, r.label, x, yy, COLORS.muted, 11, 650);
      roundRect(ctx, x + 104, yy + 2, w - 180, 10, 5);
      ctx.fillStyle = COLORS.panel;
      ctx.fill();
      roundRect(ctx, x + 104, yy + 2, (w - 180) * r.slack / maxSlack, 10, 5);
      ctx.fillStyle = COLORS.tealSoft;
      ctx.fill();
      roundRect(ctx, x + 104, yy + 14, w - 180, 5, 3);
      ctx.fillStyle = COLORS.panel;
      ctx.fill();
      roundRect(ctx, x + 104, yy + 14, (w - 180) * r.lambda / maxLambda, 5, 3);
      ctx.fillStyle = COLORS.current;
      ctx.fill();
      label(ctx, fmt(r.lambda, 2), box.x + box.w - 18, yy, COLORS.current, 11, 760, "right");
    });
    label(ctx, "teal: slack, red: multiplier", x, box.y + box.h - 34, COLORS.muted, 11, 650);
  }

  function drawSchedule(ctx, state, box) {
    panel(ctx, box, "Centering schedule", "Warm-started Newton solves as t grows.");
    var x = box.x + 18;
    var y = box.y + 78;
    var rows = [
      ["scenario", state.problem.label],
      ["barrier t", fmt(state.tMax, 2)],
      ["duality gap m/t", fmt(state.current.gap, 4)],
      ["exact regret", fmt(state.current.regret, 4)],
      ["min slack", fmt(state.current.minSlack, 4)],
      ["growth factor", fmt(state.growth, 1) + "x"],
      ["schedule Newton steps", String(state.scheduleCurrent.totalNewton)]
    ];
    rows.forEach(function (r, i) {
      var yy = y + i * 30;
      label(ctx, r[0], x, yy, COLORS.muted, 12, 650);
      label(ctx, r[1], box.x + box.w - 18, yy, i === 3 ? COLORS.current : COLORS.ink, 13, 800, "right");
    });
    var ok = state.current.regret <= state.current.gap * 1.05 + 1e-7;
    roundRect(ctx, x, box.y + box.h - 58, box.w - 36, 36, 8);
    ctx.fillStyle = ok ? COLORS.tealSoft : COLORS.redSoft;
    ctx.fill();
    label(ctx, ok ? "audit: regret <= m/t" : "audit: check centering tolerance", x + 12, box.y + box.h - 48, ok ? COLORS.barrier : COLORS.current, 13, 820);
  }

  function boxesFor(setup) {
    var pad = 16;
    var gap = 14;
    if (setup.compact) {
      var w = setup.width - pad * 2;
      return [
        { x: pad, y: pad, w: w, h: 314 },
        { x: pad, y: 344, w: w, h: 244 },
        { x: pad, y: 604, w: w, h: 250 },
        { x: pad, y: 870, w: w, h: 234 }
      ];
    }
    var w2 = (setup.width - pad * 2 - gap) / 2;
    return [
      { x: pad, y: pad, w: w2, h: 352 },
      { x: pad + w2 + gap, y: pad, w: w2, h: 352 },
      { x: pad, y: 382, w: w2, h: 352 },
      { x: pad + w2 + gap, y: 382, w: w2, h: 352 }
    ];
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = boxesFor(setup);
    drawGeometry(ctx, state, boxes[0]);
    drawConvergence(ctx, state, boxes[1]);
    drawSlacks(ctx, state, boxes[2]);
    drawSchedule(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, state) {
    var values = {
      growth: fmt(state.growth, 1) + "x",
      logT: "10^" + fmt(state.params.logT / 10, 1),
      scenario: state.problem.label,
      tilt: String(state.params.tilt) + " deg"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.value = String(state.params[input.getAttribute("data-param")]);
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("scenario", state.problem.label),
        metric("barrier t", fmt(state.tMax, 2)),
        metric("duality gap", fmt(state.current.gap, 4), "good"),
        metric("exact regret", fmt(state.current.regret, 4), state.current.regret <= state.current.gap ? "good" : "bad"),
        metric("min slack", fmt(state.current.minSlack, 4)),
        metric("Newton steps", String(state.scheduleCurrent.totalNewton))
      ].join("");
    }
    draw(root, state);
    root.__barrierState = state;
  }

  function init(root) {
    if (!root || root.__barrierReady) return;
    root.__barrierReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var summary = {};
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var low = evaluate({ scenario: scenario, tilt: 0, logT: 8, growth: 30 });
      var high = evaluate({ scenario: scenario, tilt: 0, logT: 30, growth: 30 });
      assert(low.polygon.length >= 3, scenario + " should have a polygon");
      assert(high.current.minSlack > 0, scenario + " central path should stay strictly feasible");
      assert(high.current.regret <= high.current.gap * 1.05 + 1e-7, scenario + " regret should be bounded by m/t");
      assert(high.current.regret < low.current.regret, scenario + " regret should fall as t grows");
      assert(high.scheduleCurrent.totalNewton > 0, scenario + " should spend Newton steps");
      summary[scenario] = {
        highRegret: high.current.regret,
        highGap: high.current.gap,
        lowRegret: low.current.regret,
        newtonSteps: high.scheduleCurrent.totalNewton,
        vertices: high.polygon.length
      };
    });
    return { ok: true, summary: summary };
  }

  var api = {
    SCENARIOS: SCENARIOS,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    solveBarrier: solveBarrier,
    vertices: vertices
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BarrierLPLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-barrier-lp-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
