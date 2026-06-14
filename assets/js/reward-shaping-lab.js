(function (global) {
  "use strict";

  var WIDTH = 6;
  var HEIGHT = 5;
  var START = "0,4";
  var GOAL = "5,0";
  var BEACON = "1,3";
  var STEP_COST = -0.03;
  var GOAL_REWARD = 1;
  var WALLS = { "1,1": true, "2,1": true, "3,1": true, "3,2": true };
  var ACTIONS = [
    { id: "U", label: "up", dx: 0, dy: -1 },
    { id: "R", label: "right", dx: 1, dy: 0 },
    { id: "D", label: "down", dx: 0, dy: 1 },
    { id: "L", label: "left", dx: -1, dy: 0 }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    wall: "#27323d",
    start: "#2563eb",
    goal: "#0f766e",
    beacon: "#7c3aed",
    path: "#f59e0b",
    bad: "#be123c",
    good: "#0f766e",
    background: "#ffffff"
  };

  function stateId(x, y) {
    return x + "," + y;
  }

  function coords(id) {
    var parts = id.split(",");
    return { x: Number(parts[0]), y: Number(parts[1]) };
  }

  function isWall(id) {
    return !!WALLS[id];
  }

  function isState(id) {
    var p = coords(id);
    return p.x >= 0 && p.x < WIDTH && p.y >= 0 && p.y < HEIGHT && !isWall(id);
  }

  function allStates() {
    var out = [];
    for (var y = 0; y < HEIGHT; y += 1) {
      for (var x = 0; x < WIDTH; x += 1) {
        var id = stateId(x, y);
        if (!isWall(id)) out.push(id);
      }
    }
    return out;
  }

  var STATES = allStates();

  function cleanParams(raw) {
    raw = raw || {};
    var mode = String(raw.mode || "potential");
    var gamma = Number(raw.gamma == null || raw.gamma === "" ? 0.95 : raw.gamma);
    var bonus = Number(raw.bonus == null || raw.bonus === "" ? 0.45 : raw.bonus);
    if (["base", "potential", "bonus"].indexOf(mode) < 0) mode = "potential";
    if (![0.85, 0.9, 0.95, 0.99].some(function (x) { return Math.abs(x - gamma) < 1e-9; })) gamma = 0.95;
    if (!isFinite(bonus)) bonus = 0.45;
    bonus = Math.max(0, Math.min(0.8, bonus));
    return { mode: mode, gamma: gamma, bonus: bonus };
  }

  function manhattanToGoal(id) {
    var p = coords(id);
    var g = coords(GOAL);
    return Math.abs(p.x - g.x) + Math.abs(p.y - g.y);
  }

  function potential(id) {
    if (id === GOAL) return 0;
    return -0.18 * manhattanToGoal(id);
  }

  function transition(id, actionId) {
    if (id === GOAL) return GOAL;
    var action = ACTIONS.filter(function (a) { return a.id === actionId; })[0] || ACTIONS[0];
    var p = coords(id);
    var next = stateId(p.x + action.dx, p.y + action.dy);
    return isState(next) ? next : id;
  }

  function baseReward(next) {
    return next === GOAL ? GOAL_REWARD : STEP_COST;
  }

  function shapedReward(state, actionId, next, params) {
    var reward = baseReward(next);
    if (params.mode === "potential") {
      reward += params.gamma * potential(next) - potential(state);
    }
    if (params.mode === "bonus" && next === BEACON) {
      reward += params.bonus;
    }
    return reward;
  }

  function qValuesForState(state, values, params) {
    var out = {};
    ACTIONS.forEach(function (action) {
      var next = transition(state, action.id);
      out[action.id] = shapedReward(state, action.id, next, params) + params.gamma * values[next];
    });
    return out;
  }

  function bestActions(qValues) {
    var best = -Infinity;
    ACTIONS.forEach(function (action) {
      if (qValues[action.id] > best) best = qValues[action.id];
    });
    return ACTIONS
      .filter(function (action) { return Math.abs(qValues[action.id] - best) < 1e-8; })
      .map(function (action) { return action.id; });
  }

  function solve(raw) {
    var params = cleanParams(raw);
    var values = {};
    STATES.forEach(function (state) { values[state] = 0; });
    var iterations = 0;
    var residual = 0;
    for (iterations = 0; iterations < 10000; iterations += 1) {
      var nextValues = {};
      residual = 0;
      STATES.forEach(function (state) {
        if (state === GOAL) {
          nextValues[state] = 0;
          return;
        }
        var q = qValuesForState(state, values, params);
        var best = -Infinity;
        ACTIONS.forEach(function (action) {
          if (q[action.id] > best) best = q[action.id];
        });
        nextValues[state] = best;
        residual = Math.max(residual, Math.abs(best - values[state]));
      });
      values = nextValues;
      if (residual < 1e-11) break;
    }

    var qValues = {};
    var policy = {};
    STATES.forEach(function (state) {
      if (state === GOAL) {
        qValues[state] = {};
        policy[state] = [];
        return;
      }
      qValues[state] = qValuesForState(state, values, params);
      policy[state] = bestActions(qValues[state]);
    });

    return {
      params: params,
      values: values,
      qValues: qValues,
      policy: policy,
      iterations: iterations,
      residual: residual
    };
  }

  function sameActionSet(a, b) {
    return a.slice().sort().join("|") === b.slice().sort().join("|");
  }

  function tracePolicy(solution) {
    var state = START;
    var path = [];
    var seen = {};
    var loopAt = null;
    for (var step = 0; step < 40; step += 1) {
      path.push(state);
      if (state === GOAL) return { path: path, status: "reaches goal", loopAt: null };
      if (seen[state]) {
        loopAt = state;
        return { path: path, status: "loops before goal", loopAt: loopAt };
      }
      seen[state] = true;
      var action = solution.policy[state][0];
      if (!action) return { path: path, status: "stops", loopAt: null };
      state = transition(state, action);
    }
    return { path: path, status: "not resolved", loopAt: null };
  }

  function maxPotentialOffsetError(base, shaped) {
    var maxError = 0;
    STATES.forEach(function (state) {
      if (state === GOAL) return;
      ACTIONS.forEach(function (action) {
        var error = Math.abs((shaped.qValues[state][action.id] - base.qValues[state][action.id]) + potential(state));
        if (error > maxError) maxError = error;
      });
    });
    return maxError;
  }

  function analyze(raw) {
    var params = cleanParams(raw);
    var base = solve({ mode: "base", gamma: params.gamma, bonus: params.bonus });
    var current = solve(params);
    var policyChanges = 0;
    STATES.forEach(function (state) {
      if (state === GOAL) return;
      if (!sameActionSet(base.policy[state], current.policy[state])) policyChanges += 1;
    });
    return {
      params: params,
      base: base,
      current: current,
      policyChanges: policyChanges,
      baseTrace: tracePolicy(base),
      currentTrace: tracePolicy(current),
      potentialOffsetError: maxPotentialOffsetError(base, current)
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      if (input.type === "range") params[input.getAttribute("data-param")] = input.value;
      else params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value, tone) {
    var klass = "reward-lab__metric";
    if (tone) klass += " reward-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = font || "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var candidate = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines) return;
      } else {
        line = candidate;
      }
    }
    if (line && (!maxLines || lines < maxLines)) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function valueColor(value, min, max) {
    if (max <= min) return "rgba(37,99,235,0.10)";
    var t = (value - min) / (max - min);
    var r = Math.round(239 - 224 * t);
    var g = Math.round(246 - 128 * t);
    var b = Math.round(255 - 143 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawArrow(ctx, x, y, size, actionId, color) {
    var dx = 0;
    var dy = 0;
    if (actionId === "U") dy = -1;
    if (actionId === "D") dy = 1;
    if (actionId === "L") dx = -1;
    if (actionId === "R") dx = 1;
    var len = size * 0.28;
    var x2 = x + dx * len;
    var y2 = y + dy * len;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - dx * len * 0.45, y - dy * len * 0.45);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    var angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - 0.55) * 7, y2 - Math.sin(angle - 0.55) * 7);
    ctx.lineTo(x2 - Math.cos(angle + 0.55) * 7, y2 - Math.sin(angle + 0.55) * 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function cellCenter(grid, id) {
    var p = coords(id);
    return {
      x: grid.x + p.x * grid.cell + grid.cell / 2,
      y: grid.y + p.y * grid.cell + grid.cell / 2
    };
  }

  function drawGrid(ctx, analysis, box) {
    label(ctx, "Gridworld value iteration", box.x, box.y + 14, "left", COLORS.text, "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    var current = analysis.current;
    var values = STATES.filter(function (state) { return state !== GOAL; }).map(function (state) { return current.values[state]; });
    var minValue = Math.min.apply(null, values);
    var maxValue = Math.max.apply(null, values);
    var cell = Math.min((box.w - 26) / WIDTH, (box.h - 58) / HEIGHT);
    var grid = { x: box.x + 10, y: box.y + 38, cell: cell };

    for (var y = 0; y < HEIGHT; y += 1) {
      for (var x = 0; x < WIDTH; x += 1) {
        var id = stateId(x, y);
        var px = grid.x + x * cell;
        var py = grid.y + y * cell;
        ctx.fillStyle = isWall(id) ? COLORS.wall : valueColor(current.values[id] || 0, minValue, maxValue);
        if (id === GOAL) ctx.fillStyle = "rgba(15,118,110,0.16)";
        if (id === BEACON) ctx.fillStyle = "rgba(124,58,237,0.15)";
        ctx.strokeStyle = COLORS.rule;
        ctx.lineWidth = 1;
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeRect(px, py, cell, cell);
        if (isWall(id)) continue;
        if (id === START) label(ctx, "S", px + 10, py + 15, "left", COLORS.start, "800 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        if (id === GOAL) label(ctx, "G", px + 10, py + 15, "left", COLORS.goal, "800 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        if (id === BEACON) label(ctx, "B", px + 10, py + 15, "left", COLORS.beacon, "800 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
        if (id !== GOAL) {
          var center = cellCenter(grid, id);
          drawArrow(ctx, center.x, center.y, cell, current.policy[id][0], analysis.policyChanges ? COLORS.text : COLORS.good);
        }
        label(ctx, formatNumber(current.values[id] || 0, 2), px + cell - 8, py + cell - 10, "right", COLORS.muted, "10px ui-monospace, SFMono-Regular, Menlo, monospace");
      }
    }

    var trace = analysis.currentTrace.path;
    ctx.save();
    ctx.strokeStyle = analysis.currentTrace.status === "loops before goal" ? COLORS.bad : COLORS.path;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    trace.forEach(function (state, index) {
      var c = cellCenter(grid, state);
      if (index === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
    trace.forEach(function (state, index) {
      var c = cellCenter(grid, state);
      ctx.beginPath();
      ctx.arc(c.x, c.y, index === 0 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPanel(ctx, analysis, box) {
    ctx.fillStyle = COLORS.background;
    ctx.strokeStyle = COLORS.rule;
    drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, "What changed?", box.x + 16, box.y + 20, "left", COLORS.text, "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    var modeText = "Base reward only.";
    if (analysis.params.mode === "potential") {
      modeText = "Potential shaping adds gamma Phi(next) - Phi(state). The return shifts by a state-only constant, so action rankings survive.";
    }
    if (analysis.params.mode === "bonus") {
      modeText = "The beacon bonus is not a potential difference. It creates reward on a cycle, so the optimal policy can prefer the loop.";
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    wrapText(ctx, modeText, box.x + 16, box.y + 50, box.w - 32, 17, 5);

    var y = box.y + 142;
    var rows = [
      ["base path", analysis.baseTrace.status],
      ["current path", analysis.currentTrace.status],
      ["changed states", String(analysis.policyChanges)],
      ["V(start)", formatNumber(analysis.current.values[START], 3)],
      ["Bellman sweeps", String(analysis.current.iterations)]
    ];
    rows.forEach(function (row, index) {
      var rowY = y + index * 30;
      ctx.fillStyle = index % 2 ? "rgba(215,222,229,0.24)" : "transparent";
      ctx.fillRect(box.x + 12, rowY - 13, box.w - 24, 25);
      label(ctx, row[0], box.x + 18, rowY, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, row[1], box.x + box.w - 18, rowY, "right", row[1].indexOf("loop") >= 0 ? COLORS.bad : COLORS.good, "11px ui-monospace, SFMono-Regular, Menlo, monospace");
    });

    var checkY = box.y + box.h - 58;
    ctx.fillStyle = analysis.params.mode === "potential" && analysis.policyChanges === 0 ? "rgba(15,118,110,0.10)" : analysis.policyChanges ? "rgba(190,18,60,0.10)" : "rgba(37,99,235,0.10)";
    ctx.strokeStyle = analysis.params.mode === "bonus" && analysis.policyChanges ? COLORS.bad : COLORS.good;
    drawRoundRect(ctx, box.x + 16, checkY, box.w - 32, 38, 8);
    ctx.fill();
    ctx.stroke();
    var verdict = analysis.policyChanges === 0 ? "same greedy action sets" : "policy changed";
    label(ctx, verdict, box.x + box.w / 2, checkY + 20, "center", analysis.policyChanges ? COLORS.bad : COLORS.good, "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawChart(canvas, analysis) {
    var ratio = global.devicePixelRatio || 1;
    var parentWidth = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 900;
    var cssWidth = Math.max(320, parentWidth);
    var compact = cssWidth < 700;
    var cssHeight = compact ? 760 : 520;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    if (compact) {
      drawGrid(ctx, analysis, { x: 10, y: 10, w: cssWidth - 20, h: 420 });
      drawPanel(ctx, analysis, { x: 10, y: 448, w: cssWidth - 20, h: 292 });
    } else {
      var leftW = Math.min(570, cssWidth * 0.64);
      drawGrid(ctx, analysis, { x: 14, y: 14, w: leftW, h: cssHeight - 28 });
      drawPanel(ctx, analysis, { x: leftW + 32, y: 22, w: cssWidth - leftW - 46, h: cssHeight - 44 });
    }
  }

  function modeLabel(mode) {
    if (mode === "base") return "base reward";
    if (mode === "bonus") return "beacon bonus";
    return "potential hint";
  }

  function render(root) {
    var analysis = analyze(paramsFromRoot(root));
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("reward mode", modeLabel(analysis.params.mode)),
        metric("gamma", formatNumber(analysis.params.gamma, 2)),
        metric("bonus", formatNumber(analysis.params.bonus, 2)),
        metric("policy changes", String(analysis.policyChanges), analysis.policyChanges ? "bad" : "good"),
        metric("path", analysis.currentTrace.status, analysis.currentTrace.status.indexOf("loop") >= 0 ? "bad" : "good"),
        metric("V(start)", formatNumber(analysis.current.values[START], 3)),
        metric("iterations", String(analysis.current.iterations)),
        metric("gauge error", analysis.params.mode === "potential" ? analysis.potentialOffsetError.toExponential(1) : "n/a", analysis.params.mode === "potential" && analysis.potentialOffsetError < 1e-9 ? "good" : "")
      ].join("");
    }
    var bonusReadout = root.querySelector("[data-bonus-readout]");
    if (bonusReadout) bonusReadout.textContent = formatNumber(analysis.params.bonus, 2);
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, analysis);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-reward-shaping-lab]")).forEach(init);
  }

  var api = {
    ACTIONS: ACTIONS,
    BEACON: BEACON,
    GOAL: GOAL,
    START: START,
    analyze: analyze,
    cleanParams: cleanParams,
    potential: potential,
    solve: solve,
    transition: transition
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.RewardShapingLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
