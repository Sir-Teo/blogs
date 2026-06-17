(function (global) {
  "use strict";

  var WIDTH = 9;
  var HEIGHT = 7;
  var START = "0,3";
  var TOP_GOAL = "8,0";
  var BOTTOM_GOAL = "8,6";
  var STEP_COST = -0.04;
  var TOP_REWARD = 10;
  var WALLS = {
    "1,1": true,
    "2,1": true,
    "3,1": true,
    "4,1": true,
    "5,1": true,
    "6,1": true,
    "3,3": true,
    "4,3": true,
    "5,3": true,
    "1,5": true,
    "2,5": true,
    "3,5": true,
    "4,5": true,
    "5,5": true,
    "6,5": true
  };

  var ACTIONS = [
    { dx: 0, dy: -1, id: "U", label: "up", symbol: "^" },
    { dx: 1, dy: 0, id: "R", label: "right", symbol: ">" },
    { dx: 0, dy: 1, id: "D", label: "down", symbol: "v" },
    { dx: -1, dy: 0, id: "L", label: "left", symbol: "<" }
  ];

  var DEFAULTS = {
    alpha: 15,
    episodes: 900,
    gap: 45,
    gamma: 96,
    rewardScale: 100,
    seed: 41,
    slip: 8
  };

  var COLORS = {
    background: "#ffffff",
    bottom: "#7c3aed",
    grid: "#e6edf3",
    hard: "#64748b",
    heat: "#0f766e",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    soft: "#2563eb",
    start: "#d97706",
    text: "#172026",
    timeout: "#be123c",
    top: "#0f766e",
    wall: "#26323d"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      alpha: clamp(finite(Number(raw.alpha), DEFAULTS.alpha), 5, 220),
      episodes: Math.round(clamp(finite(Number(raw.episodes), DEFAULTS.episodes), 120, 1800)),
      gap: clamp(finite(Number(raw.gap), DEFAULTS.gap), 0, 250),
      gamma: clamp(finite(Number(raw.gamma), DEFAULTS.gamma), 80, 99),
      rewardScale: clamp(finite(Number(raw.rewardScale), DEFAULTS.rewardScale), 35, 220),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 999)),
      slip: clamp(finite(Number(raw.slip), DEFAULTS.slip), 0, 35)
    };
  }

  function modelParams(raw) {
    var p = cleanParams(raw);
    return {
      alpha: p.alpha / 100,
      bottomReward: TOP_REWARD - p.gap / 100,
      episodes: p.episodes,
      gamma: p.gamma / 100,
      raw: p,
      rewardScale: p.rewardScale / 100,
      seed: p.seed,
      slip: p.slip / 100
    };
  }

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

  function isTerminal(id) {
    return id === TOP_GOAL || id === BOTTOM_GOAL;
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

  function actionById(id) {
    for (var i = 0; i < ACTIONS.length; i += 1) {
      if (ACTIONS[i].id === id) return ACTIONS[i];
    }
    return ACTIONS[0];
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function transitionState(state, actionId) {
    if (isTerminal(state)) return state;
    var p = coords(state);
    var action = actionById(actionId);
    var next = stateId(p.x + action.dx, p.y + action.dy);
    return isState(next) ? next : state;
  }

  function perpendicular(actionId) {
    if (actionId === "U" || actionId === "D") return ["L", "R"];
    return ["U", "D"];
  }

  function transitionDistribution(state, actionId, params) {
    if (isTerminal(state)) return [{ next: state, prob: 1 }];
    var weights = {};
    function add(id, prob) {
      var next = transitionState(state, id);
      weights[next] = (weights[next] || 0) + prob;
    }
    var slip = params.slip;
    add(actionId, 1 - slip);
    perpendicular(actionId).forEach(function (id) {
      add(id, slip / 2);
    });
    return Object.keys(weights).map(function (next) {
      return { next: next, prob: weights[next] };
    });
  }

  function reward(next, params, scaled) {
    if (next === TOP_GOAL) return (STEP_COST + TOP_REWARD) * (scaled ? params.rewardScale : 1);
    if (next === BOTTOM_GOAL) return (STEP_COST + params.bottomReward) * (scaled ? params.rewardScale : 1);
    return STEP_COST * (scaled ? params.rewardScale : 1);
  }

  function logSumExp(values, alpha) {
    var max = Math.max.apply(null, values);
    var sum = 0;
    values.forEach(function (value) {
      sum += Math.exp((value - max) / alpha);
    });
    return max + alpha * Math.log(sum);
  }

  function qValuesForState(state, values, params) {
    var out = {};
    ACTIONS.forEach(function (action) {
      var q = 0;
      transitionDistribution(state, action.id, params).forEach(function (row) {
        q += row.prob * (reward(row.next, params, true) + params.gamma * values[row.next]);
      });
      out[action.id] = q;
    });
    return out;
  }

  function softPolicyFromQ(qValues, alpha) {
    var max = -Infinity;
    ACTIONS.forEach(function (action) {
      max = Math.max(max, qValues[action.id]);
    });
    var sum = 0;
    var raw = {};
    ACTIONS.forEach(function (action) {
      raw[action.id] = Math.exp((qValues[action.id] - max) / alpha);
      sum += raw[action.id];
    });
    var out = {};
    ACTIONS.forEach(function (action) {
      out[action.id] = raw[action.id] / Math.max(1e-12, sum);
    });
    return out;
  }

  function hardPolicyFromQ(qValues) {
    var best = -Infinity;
    ACTIONS.forEach(function (action) {
      best = Math.max(best, qValues[action.id]);
    });
    var winners = ACTIONS.filter(function (action) {
      return Math.abs(qValues[action.id] - best) < 1e-9;
    });
    var out = {};
    ACTIONS.forEach(function (action) {
      out[action.id] = 0;
    });
    winners.forEach(function (action) {
      out[action.id] = 1 / winners.length;
    });
    return out;
  }

  function solve(raw, hard) {
    var params = modelParams(raw);
    var values = {};
    var nextValues;
    var residual = 0;
    STATES.forEach(function (state) {
      values[state] = 0;
    });
    var iterations = 0;
    for (iterations = 0; iterations < 800; iterations += 1) {
      nextValues = {};
      residual = 0;
      STATES.forEach(function (state) {
        if (isTerminal(state)) {
          nextValues[state] = 0;
          return;
        }
        var q = qValuesForState(state, values, params);
        var qList = ACTIONS.map(function (action) { return q[action.id]; });
        var nextValue = hard ? Math.max.apply(null, qList) : logSumExp(qList, params.alpha);
        nextValues[state] = nextValue;
        residual = Math.max(residual, Math.abs(nextValue - values[state]));
      });
      values = nextValues;
      if (residual < 1e-9) break;
    }

    var policy = {};
    var qValues = {};
    STATES.forEach(function (state) {
      if (isTerminal(state)) {
        policy[state] = {};
        qValues[state] = {};
        return;
      }
      qValues[state] = qValuesForState(state, values, params);
      policy[state] = hard ? hardPolicyFromQ(qValues[state]) : softPolicyFromQ(qValues[state], params.alpha);
    });
    return {
      hard: !!hard,
      iterations: iterations,
      params: params,
      policy: policy,
      qValues: qValues,
      residual: residual,
      values: values
    };
  }

  function entropy(policyRow) {
    var h = 0;
    ACTIONS.forEach(function (action) {
      var p = policyRow[action.id] || 0;
      if (p > 0) h -= p * Math.log(p);
    });
    return h;
  }

  function sampleFromDistribution(rows, rand) {
    var u = rand();
    var acc = 0;
    for (var i = 0; i < rows.length; i += 1) {
      acc += rows[i].prob;
      if (u <= acc + 1e-12) return rows[i].next || rows[i].id;
    }
    return rows[rows.length - 1].next || rows[rows.length - 1].id;
  }

  function sampleAction(policyRow, rand) {
    var rows = ACTIONS.map(function (action) {
      return { id: action.id, prob: policyRow[action.id] || 0 };
    });
    return sampleFromDistribution(rows, rand);
  }

  function simulate(solution, episodes, seed) {
    var params = solution.params;
    var rand = mulberry32(seed);
    var visits = {};
    var paths = [];
    var outcomes = { bottom: 0, timeout: 0, top: 0 };
    var totalReturn = 0;
    var totalEntropy = 0;
    var totalSteps = 0;
    STATES.forEach(function (state) { visits[state] = 0; });
    for (var episode = 0; episode < episodes; episode += 1) {
      var state = START;
      var discount = 1;
      var path = [state];
      for (var step = 0; step < 80; step += 1) {
        visits[state] = (visits[state] || 0) + 1;
        if (isTerminal(state)) break;
        var policyRow = solution.policy[state];
        totalEntropy += discount * entropy(policyRow);
        var action = sampleAction(policyRow, rand);
        var next = sampleFromDistribution(transitionDistribution(state, action, params), rand);
        totalReturn += discount * reward(next, params, false);
        totalSteps += 1;
        state = next;
        path.push(state);
        discount *= params.gamma;
        if (isTerminal(state)) break;
      }
      if (state === TOP_GOAL) outcomes.top += 1;
      else if (state === BOTTOM_GOAL) outcomes.bottom += 1;
      else outcomes.timeout += 1;
      if (paths.length < 24) paths.push(path);
    }
    var n = Math.max(1, episodes);
    return {
      avgEntropyReturn: totalEntropy / n,
      avgReturn: totalReturn / n,
      avgSteps: totalSteps / n,
      outcomes: {
        bottom: outcomes.bottom / n,
        timeout: outcomes.timeout / n,
        top: outcomes.top / n
      },
      paths: paths,
      visits: visits
    };
  }

  function sweep(raw) {
    var params = modelParams(raw);
    var alphas = [0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30, 0.36, 0.45, 0.60];
    var episodes = Math.min(360, params.episodes);
    return alphas.map(function (alpha, index) {
      var localRaw = Object.assign({}, params.raw, { alpha: Math.round(alpha * 100) });
      var solution = solve(localRaw, false);
      var sim = simulate(solution, episodes, params.seed * 1009 + index * 97 + 13);
      return {
        alpha: alpha,
        entropy: entropy(solution.policy[START]),
        top: sim.outcomes.top,
        value: solution.values[START]
      };
    });
  }

  function evaluate(raw) {
    var params = modelParams(raw);
    var soft = solve(params.raw, false);
    var hard = solve(params.raw, true);
    var softSim = simulate(soft, params.episodes, params.seed * 1009 + 17);
    var hardSim = simulate(hard, Math.min(params.episodes, 900), params.seed * 1009 + 31);
    var startEntropy = entropy(soft.policy[START]);
    return {
      hard: hard,
      hardSim: hardSim,
      params: params,
      raw: params.raw,
      soft: soft,
      softSim: softSim,
      summary: {
        bottomRate: softSim.outcomes.bottom,
        entropyBonus: params.alpha * softSim.avgEntropyReturn,
        hardTopRate: hardSim.outcomes.top,
        softBonus: soft.values[START] - hard.values[START],
        startEntropy: startEntropy,
        topRate: softSim.outcomes.top,
        value: soft.values[START],
        extrinsicReturn: softSim.avgReturn
      },
      sweep: sweep(params.raw)
    };
  }

  function audit() {
    var def = evaluate(DEFAULTS);
    var cold = evaluate(Object.assign({}, DEFAULTS, { alpha: 8, episodes: 420 }));
    var hot = evaluate(Object.assign({}, DEFAULTS, { alpha: 30, episodes: 420 }));
    var tie = evaluate(Object.assign({}, DEFAULTS, { gap: 0, alpha: 12, episodes: 520 }));
    var wideGap = evaluate(Object.assign({}, DEFAULTS, { gap: 190, alpha: 12, episodes: 520 }));
    function finiteSummary(result) {
      return [
        result.summary.topRate,
        result.summary.bottomRate,
        result.summary.startEntropy,
        result.summary.softBonus,
        result.summary.value,
        result.summary.extrinsicReturn
      ].every(Number.isFinite);
    }
    return {
      coldIsSharper: cold.summary.startEntropy < hot.summary.startEntropy,
      finiteDefault: finiteSummary(def),
      gapMovesMassTop: wideGap.summary.topRate > tie.summary.topRate + 0.2,
      policySums: STATES.filter(function (state) { return !isTerminal(state); }).every(function (state) {
        var sum = ACTIONS.reduce(function (acc, action) {
          return acc + (def.soft.policy[state][action.id] || 0);
        }, 0);
        return Math.abs(sum - 1) < 1e-9;
      }),
      softAtLeastHard: def.summary.softBonus >= -1e-8,
      sweepEntropiesFinite: def.sweep.every(function (row) {
        return Number.isFinite(row.entropy) && row.entropy >= -1e-9;
      })
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value, klass) {
    return '<div class="soft-bellman-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    drawText(ctx, title, box.x + 14, box.y + 24, COLORS.text, 14, 850);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 43, COLORS.muted, 11, 650);
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawArrow(ctx, cx, cy, actionId, length, color, alpha) {
    var action = actionById(actionId);
    var ex = cx + action.dx * length;
    var ey = cy + action.dy * length;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    var angle = Math.atan2(action.dy, action.dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 6 * Math.cos(angle - 0.55), ey - 6 * Math.sin(angle - 0.55));
    ctx.lineTo(ex - 6 * Math.cos(angle + 0.55), ey - 6 * Math.sin(angle + 0.55));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.72) : Math.round(width * 0.78);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawGrid(ctx, result, box) {
    panel(ctx, box, "soft policy footprint", "occupancy heat and action probabilities");
    var margin = 14;
    var top = box.y + 58;
    var availableW = box.w - margin * 2;
    var availableH = box.h - 82;
    var cell = Math.floor(Math.min(availableW / WIDTH, availableH / HEIGHT));
    var x0 = box.x + (box.w - cell * WIDTH) / 2;
    var y0 = top + (availableH - cell * HEIGHT) / 2;
    var maxVisit = Math.max.apply(null, Object.keys(result.softSim.visits).map(function (state) {
      return result.softSim.visits[state];
    }).concat([1]));
    for (var y = 0; y < HEIGHT; y += 1) {
      for (var x = 0; x < WIDTH; x += 1) {
        var id = stateId(x, y);
        var px = x0 + x * cell;
        var py = y0 + y * cell;
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(px, py, cell, cell);
        if (isWall(id)) {
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(px, py, cell, cell);
        } else {
          var heat = Math.sqrt((result.softSim.visits[id] || 0) / maxVisit);
          if (heat > 0) {
            ctx.save();
            ctx.globalAlpha = 0.10 + 0.55 * heat;
            ctx.fillStyle = COLORS.heat;
            ctx.fillRect(px, py, cell, cell);
            ctx.restore();
          }
        }
        ctx.strokeStyle = COLORS.grid;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
        if (id === START || id === TOP_GOAL || id === BOTTOM_GOAL) {
          ctx.fillStyle = id === START ? COLORS.start : id === TOP_GOAL ? COLORS.top : COLORS.bottom;
          ctx.beginPath();
          ctx.arc(px + cell / 2, py + cell / 2, Math.max(7, cell * 0.24), 0, Math.PI * 2);
          ctx.fill();
          drawText(ctx, id === START ? "S" : id === TOP_GOAL ? "A" : "B", px + cell / 2, py + cell / 2 + 4, "#ffffff", 12, 850, "center");
        }
        if (!isWall(id) && !isTerminal(id)) {
          var row = result.soft.policy[id];
          ACTIONS.forEach(function (action) {
            var prob = row[action.id] || 0;
            if (prob > 0.11) drawArrow(ctx, px + cell / 2, py + cell / 2, action.id, cell * (0.12 + 0.26 * prob), COLORS.soft, 0.25 + 0.75 * prob);
          });
        }
      }
    }
    drawText(ctx, "A reward " + formatNumber(TOP_REWARD, 1), x0, box.y + box.h - 14, COLORS.top, 11, 800);
    drawText(ctx, "B reward " + formatNumber(result.params.bottomReward, 1), x0 + cell * WIDTH, box.y + box.h - 14, COLORS.bottom, 11, 800, "right");
  }

  function drawBackup(ctx, result, box) {
    panel(ctx, box, "one Bellman backup", "start-state action values");
    var q = result.soft.qValues[START];
    var hardMax = result.hard.values[START];
    var softV = result.soft.values[START];
    var values = ACTIONS.map(function (action) { return q[action.id]; });
    var min = Math.min.apply(null, values.concat([hardMax, softV]));
    var max = Math.max.apply(null, values.concat([hardMax, softV]));
    var pad = Math.max(0.2, (max - min) * 0.10);
    min -= pad;
    max += pad;
    var plot = { x: box.x + 86, y: box.y + 66, w: box.w - 118, h: box.h - 116 };
    ACTIONS.forEach(function (action, index) {
      var y = plot.y + index * (plot.h / ACTIONS.length) + 4;
      var p = result.soft.policy[START][action.id] || 0;
      var barW = (q[action.id] - min) / Math.max(1e-9, max - min) * plot.w;
      drawText(ctx, action.label, box.x + 18, y + 13, COLORS.muted, 11, 750);
      ctx.fillStyle = action.id === "U" ? COLORS.top : action.id === "D" ? COLORS.bottom : COLORS.soft;
      ctx.fillRect(plot.x, y, Math.max(1, barW), 13);
      drawText(ctx, formatNumber(q[action.id], 2), plot.x + barW + 6, y + 12, COLORS.text, 10, 700);
      drawText(ctx, formatPercent(p, 0), box.x + box.w - 18, y + 12, COLORS.muted, 10, 750, "right");
    });
    var baseY = box.y + box.h - 47;
    drawText(ctx, "hard max V(S) = " + formatNumber(hardMax, 2), box.x + 18, baseY, COLORS.hard, 11, 800);
    drawText(ctx, "soft V(S) = " + formatNumber(softV, 2), box.x + 18, baseY + 20, COLORS.soft, 11, 800);
    drawText(ctx, "bonus " + formatNumber(result.summary.softBonus, 2), box.x + box.w - 18, baseY + 20, COLORS.soft, 11, 800, "right");
  }

  function drawOutcomes(ctx, result, box) {
    panel(ctx, box, "sampled trajectories", result.raw.episodes + " rollouts from S");
    var rows = [
      { label: "soft", outcomes: result.softSim.outcomes, color: COLORS.soft },
      { label: "hard max", outcomes: result.hardSim.outcomes, color: COLORS.hard }
    ];
    var labels = [
      { color: COLORS.top, key: "top", label: "A" },
      { color: COLORS.bottom, key: "bottom", label: "B" },
      { color: COLORS.timeout, key: "timeout", label: "timeout" }
    ];
    var x = box.x + 80;
    var y = box.y + 82;
    var w = box.w - 112;
    rows.forEach(function (row, index) {
      var yy = y + index * 56;
      drawText(ctx, row.label, box.x + 18, yy + 17, row.color, 12, 850);
      var acc = x;
      labels.forEach(function (entry) {
        var bw = row.outcomes[entry.key] * w;
        ctx.fillStyle = entry.color;
        ctx.fillRect(acc, yy, bw, 20);
        if (bw > 32) drawText(ctx, entry.label, acc + bw / 2, yy + 14, "#ffffff", 10, 850, "center");
        acc += bw;
      });
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, 19);
      drawText(ctx, formatPercent(row.outcomes.top, 0) + " / " + formatPercent(row.outcomes.bottom, 0), x + w, yy + 36, COLORS.muted, 10, 750, "right");
    });
    var y2 = box.y + box.h - 48;
    drawText(ctx, "extrinsic return " + formatNumber(result.summary.extrinsicReturn, 2), box.x + 18, y2, COLORS.text, 11, 800);
    drawText(ctx, "entropy term " + formatNumber(result.summary.entropyBonus, 2), box.x + 18, y2 + 20, COLORS.soft, 11, 800);
    drawText(ctx, "avg steps " + formatNumber(result.softSim.avgSteps, 1), box.x + box.w - 18, y2 + 20, COLORS.muted, 11, 750, "right");
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "temperature sweep", "same rewards, different log-sum-exp smoothness");
    var plot = { x: box.x + 46, y: box.y + 66, w: box.w - 74, h: box.h - 102 };
    function sx(alpha) {
      var min = Math.log(0.05);
      var max = Math.log(2.2);
      return plot.x + (Math.log(alpha) - min) / (max - min) * plot.w;
    }
    function sy(value) {
      return plot.y + plot.h - clamp(value, 0, 1) * plot.h;
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    [
      { color: COLORS.top, key: "top", scale: 1 },
      { color: COLORS.soft, key: "entropy", scale: Math.log(ACTIONS.length) }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      result.sweep.forEach(function (row, index) {
        var x = sx(row.alpha);
        var y = sy(row[line.key] / line.scale);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    result.sweep.forEach(function (row) {
      ctx.fillStyle = COLORS.top;
      ctx.beginPath();
      ctx.arc(sx(row.alpha), sy(row.top), 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "P(A)", plot.x + 7, plot.y + 16, COLORS.top, 10, 850);
    drawText(ctx, "H(start)/log4", plot.x + 7, plot.y + 32, COLORS.soft, 10, 850);
    drawText(ctx, "temperature alpha", plot.x + plot.w, box.y + box.h - 18, COLORS.muted, 10, 750, "right");
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);
    var margin = 18;
    var gap = 18;
    if (width < 560) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawGrid(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawBackup(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawOutcomes(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawGrid(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawBackup(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawOutcomes(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, result) {
    var values = {
      alpha: formatNumber(result.params.alpha, 2),
      episodes: String(result.raw.episodes),
      gap: formatNumber(result.raw.gap / 100, 2),
      gamma: formatNumber(result.params.gamma, 2),
      rewardScale: result.raw.rewardScale + "%",
      seed: String(result.raw.seed),
      slip: result.raw.slip + "%"
    };
    Object.keys(values).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (node) {
        node.textContent = values[key];
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    box.innerHTML = [
      metric("top goal A", formatPercent(result.summary.topRate, 1), "good"),
      metric("bottom goal B", formatPercent(result.summary.bottomRate, 1)),
      metric("start entropy", formatNumber(result.summary.startEntropy, 2)),
      metric("soft value bonus", formatNumber(result.summary.softBonus, 2), "good"),
      metric("extrinsic return", formatNumber(result.summary.extrinsicReturn, 2)),
      metric("hard chooses A", formatPercent(result.summary.hardTopRate, 0))
    ].join("");
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result);
    renderMetrics(root, result);
    draw(root, result);
    root.__softBellmanResult = result;
  }

  function init(root) {
    if (!root || root.__softBellmanReady) return;
    root.__softBellmanReady = true;
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
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-soft-bellman-lab]").forEach(init);
  }

  var api = {
    ACTIONS: ACTIONS,
    STATES: STATES,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    solve: solve
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SoftBellmanLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
