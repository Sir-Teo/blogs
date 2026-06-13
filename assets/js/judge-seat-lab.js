(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    human: "#0f766e",
    raw: "#be123c",
    swap: "#2563eb",
    control: "#7c3aed",
    length: "#d97706",
    bg: "#ffffff",
    band: "#ccfbf1"
  };

  var MODELS = [
    { name: "Compact", ability: [0.58, 0.52, 0.54], length: 0.30, style: 0.25 },
    { name: "Steady", ability: [0.70, 0.62, 0.66], length: 0.48, style: 0.45 },
    { name: "Verbose", ability: [0.64, 0.58, 0.60], length: 0.92, style: 0.78 },
    { name: "Careful", ability: [0.74, 0.78, 0.72], length: 0.66, style: 0.52 },
    { name: "Sharp", ability: [0.86, 0.82, 0.80], length: 0.56, style: 0.42 },
    { name: "Fluent", ability: [0.72, 0.65, 0.84], length: 0.84, style: 0.88 }
  ];

  var TASKS = [
    { name: "reasoning", weight: [1.00, 0.40, 0.20], length: 0.15 },
    { name: "coding", weight: [0.35, 1.00, 0.15], length: -0.05 },
    { name: "writing", weight: [0.20, 0.25, 1.00], length: 0.25 }
  ];

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

  function clamp(value, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function clampInt(value, min, max) {
    return Math.round(clamp(value, min, max));
  }

  function percentParam(value, fallback) {
    if (value == null) return fallback;
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return number > 1 ? number / 100 : number;
  }

  function sigmoid(x) {
    if (x >= 0) {
      var z = Math.exp(-x);
      return 1 / (1 + z);
    }
    var e = Math.exp(x);
    return e / (1 + e);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function dot(left, right) {
    var out = 0;
    for (var i = 0; i < left.length; i += 1) out += left[i] * right[i];
    return out;
  }

  function rank(values) {
    var order = values.map(function (value, index) {
      return { index: index, value: value };
    }).sort(function (a, b) {
      return b.value - a.value;
    });
    var ranks = new Array(values.length);
    order.forEach(function (row, position) {
      ranks[row.index] = position + 1;
    });
    return ranks;
  }

  function spearman(a, b) {
    var ra = rank(a);
    var rb = rank(b);
    var ma = mean(ra);
    var mb = mean(rb);
    var num = 0;
    var da = 0;
    var db = 0;
    for (var i = 0; i < ra.length; i += 1) {
      var xa = ra[i] - ma;
      var xb = rb[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    if (da <= 0 || db <= 0) return 0;
    return num / Math.sqrt(da * db);
  }

  function argmax(values) {
    var best = 0;
    for (var i = 1; i < values.length; i += 1) {
      if (values[i] > values[best]) best = i;
    }
    return best;
  }

  function makePrompts(params) {
    var rand = rng(0x51EAD202 ^ Math.imul(params.prompts, 17) ^ Math.imul(params.taskMix, 31));
    var prompts = [];
    var writingShare = params.taskMix / 100;
    var codingShare = 0.34 * (1 - writingShare);
    for (var i = 0; i < params.prompts; i += 1) {
      var u = rand();
      var task = u < codingShare ? 1 : (u < codingShare + writingShare ? 2 : 0);
      prompts.push({
        difficulty: 0.32 + 0.55 * rand(),
        id: i,
        noise: normal(rand) * 0.035,
        task: task
      });
    }
    return prompts;
  }

  function response(prompt, modelIndex) {
    var model = MODELS[modelIndex];
    var task = TASKS[prompt.task];
    var ability = dot(model.ability, task.weight) / dot(task.weight, [1, 1, 1]);
    var promptBump = 0.05 * Math.sin((prompt.id + 3) * (modelIndex + 1) * 0.91);
    var quality = ability - 0.35 * prompt.difficulty + prompt.noise + promptBump;
    var length = 95 + 155 * model.length + 90 * task.length + 18 * prompt.difficulty + 13 * Math.cos((prompt.id + 5) * (modelIndex + 2));
    return {
      length: Math.max(40, length),
      quality: quality,
      style: model.style
    };
  }

  function paramsFromRaw(raw) {
    return {
      closeOnly: clampInt(raw.closeOnly == null ? 0 : raw.closeOnly, 0, 100),
      judgeNoise: clamp(percentParam(raw.judgeNoise, 0.16), 0, 0.45),
      positionBias: clamp(percentParam(raw.positionBias, 0.22), 0, 0.65),
      prompts: clampInt(raw.prompts == null ? 240 : raw.prompts, 60, 640),
      selfStyleBias: clamp(percentParam(raw.selfStyleBias, 0.12), 0, 0.45),
      taskMix: clampInt(raw.taskMix == null ? 42 : raw.taskMix, 10, 80),
      verbosityBias: clamp(percentParam(raw.verbosityBias, 0.30), 0, 0.80)
    };
  }

  function judgeLogit(respA, respB, params, firstSign, noise) {
    var qualityTerm = 4.2 * (respA.quality - respB.quality);
    var lengthTerm = params.verbosityBias * (respA.length - respB.length) / 45;
    var styleTerm = params.selfStyleBias * (respA.style - respB.style) * 2.2;
    var positionTerm = params.positionBias * firstSign * 2.4;
    return qualityTerm + lengthTerm + styleTerm + positionTerm + noise;
  }

  function addWin(scores, i, j, pWinI) {
    scores[i].wins += pWinI;
    scores[i].games += 1;
    scores[j].wins += 1 - pWinI;
    scores[j].games += 1;
  }

  function scoreArray(scores) {
    return scores.map(function (row) {
      return row.games > 0 ? row.wins / row.games : 0;
    });
  }

  function fitSlope(rows) {
    var xs = rows.map(function (row) { return row.lengthDelta; });
    var ys = rows.map(function (row) { return row.logit; });
    var mx = mean(xs);
    var my = mean(ys);
    var num = 0;
    var den = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var x = xs[i] - mx;
      num += x * (ys[i] - my);
      den += x * x;
    }
    return den > 0 ? num / den : 0;
  }

  function matrix(n) {
    var out = [];
    for (var i = 0; i < n; i += 1) out.push(new Array(n).fill(0));
    return out;
  }

  function simulate(input) {
    var params = paramsFromRaw(input || {});
    var prompts = makePrompts(params);
    var n = MODELS.length;
    var rand = rng(0xA11CE ^ Math.imul(params.prompts, 101) ^ Math.imul(Math.round(params.positionBias * 100), 103) ^ Math.imul(Math.round(params.verbosityBias * 100), 107));
    var humanScores = MODELS.map(function () { return { wins: 0, games: 0 }; });
    var rawScores = MODELS.map(function () { return { wins: 0, games: 0 }; });
    var swapScores = MODELS.map(function () { return { wins: 0, games: 0 }; });
    var controlledScores = MODELS.map(function () { return { wins: 0, games: 0 }; });
    var pairRows = [];
    var firstSeatEdges = [[], [], [], []];
    var disagreement = matrix(n);
    var controlledDisagreement = matrix(n);

    prompts.forEach(function (prompt) {
      var responses = MODELS.map(function (_, i) { return response(prompt, i); });
      for (var i = 0; i < n; i += 1) {
        for (var j = i + 1; j < n; j += 1) {
          var a = responses[i];
          var b = responses[j];
          var humanP = sigmoid(5.1 * (a.quality - b.quality));
          var trueGap = Math.abs(a.quality - b.quality);
          if (params.closeOnly > 0) {
            var keepProb = 1 - params.closeOnly / 100 * Math.min(1, trueGap / 0.18);
            if (rand() > keepProb) continue;
          }
          addWin(humanScores, i, j, humanP);

          var iFirst = rand() < 0.5;
          var noise = normal(rand) * params.judgeNoise;
          var rawLogit = iFirst
            ? judgeLogit(a, b, params, 1, noise)
            : -judgeLogit(b, a, params, 1, noise);
          var rawP = sigmoid(rawLogit);
          addWin(rawScores, i, j, rawP);

          var forward = judgeLogit(a, b, params, 1, normal(rand) * params.judgeNoise * 0.35);
          var reverse = -judgeLogit(b, a, params, 1, normal(rand) * params.judgeNoise * 0.35);
          var swappedLogit = 0.5 * (forward + reverse);
          var swappedP = sigmoid(swappedLogit);
          addWin(swapScores, i, j, swappedP);

          var firstWinsForward = sigmoid(forward);
          var firstWinsReverse = sigmoid(judgeLogit(b, a, params, 1, 0));
          var edge = 0.5 * (firstWinsForward + firstWinsReverse) - 0.5;
          var gapBin = Math.min(firstSeatEdges.length - 1, Math.floor(trueGap / 0.08));
          firstSeatEdges[gapBin].push(edge);

          pairRows.push({
            humanP: humanP,
            i: i,
            j: j,
            lengthDelta: (a.length - b.length) / 45,
            logit: swappedLogit
          });
        }
      }
    });

    var slope = fitSlope(pairRows);
    pairRows.forEach(function (row) {
      var controlledLogit = row.logit - slope * row.lengthDelta;
      var controlledP = sigmoid(controlledLogit);
      addWin(controlledScores, row.i, row.j, controlledP);
      disagreement[row.i][row.j] += Math.abs(sigmoid(row.logit) - row.humanP);
      disagreement[row.j][row.i] = disagreement[row.i][row.j];
      controlledDisagreement[row.i][row.j] += Math.abs(controlledP - row.humanP);
      controlledDisagreement[row.j][row.i] = controlledDisagreement[row.i][row.j];
    });

    var human = scoreArray(humanScores);
    var raw = scoreArray(rawScores);
    var swap = scoreArray(swapScores);
    var controlled = scoreArray(controlledScores);
    var games = pairRows.length / (n * (n - 1) / 2);
    for (var x = 0; x < n; x += 1) {
      for (var y = 0; y < n; y += 1) {
        if (x !== y && games > 0) {
          disagreement[x][y] /= games;
          controlledDisagreement[x][y] /= games;
        }
      }
    }

    var avgLengths = MODELS.map(function (_, i) {
      return mean(prompts.map(function (prompt) { return response(prompt, i).length; }));
    });
    var firstEdge = mean(firstSeatEdges.reduce(function (acc, bin) {
      return acc.concat(bin);
    }, []));
    return {
      avgLengths: avgLengths,
      controlled: controlled,
      controlledDisagreement: controlledDisagreement,
      disagreement: disagreement,
      firstSeatEdges: firstSeatEdges.map(mean),
      human: human,
      metrics: {
        controlledTop: MODELS[argmax(controlled)].name,
        firstSeatEdge: firstEdge,
        humanTop: MODELS[argmax(human)].name,
        lengthSlope: slope,
        rawRho: spearman(human, raw),
        rawTop: MODELS[argmax(raw)].name,
        swapRho: spearman(human, swap),
        controlledRho: spearman(human, controlled)
      },
      models: MODELS,
      params: params,
      raw: raw,
      rows: pairRows.length,
      swap: swap
    };
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return paramsFromRaw(raw);
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="judge-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function updateOutputs(root, params) {
    var values = {
      closeOnly: params.closeOnly + "%",
      judgeNoise: formatPct(params.judgeNoise, 0),
      positionBias: formatPct(params.positionBias, 0),
      prompts: String(params.prompts),
      selfStyleBias: formatPct(params.selfStyleBias, 0),
      taskMix: params.taskMix + "% writing",
      verbosityBias: formatPct(params.verbosityBias, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.font = "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, title, box.x, box.y - 12, "left", "bottom", COLORS.text);
    if (subtitle) {
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, subtitle, box.x + box.w, box.y - 12, "right", "bottom", COLORS.muted);
    }
  }

  function gridLine(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawLeaderboard(ctx, box, result) {
    panel(ctx, box, "leaderboard", "win rate vs other models");
    var left = box.x + 96;
    var top = box.y + 24;
    var width = box.w - 124;
    var rowH = 31;
    var rows = result.models.map(function (model, i) {
      return { i: i, model: model, value: result.human[i] };
    }).sort(function (a, b) { return b.value - a.value; });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    rows.forEach(function (row, rankIndex) {
      var y = top + rankIndex * rowH;
      label(ctx, row.model.name, box.x + 14, y + 10, "left", "middle", COLORS.text);
      [
        { color: COLORS.human, dx: -6, value: result.human[row.i] },
        { color: COLORS.raw, dx: 4, value: result.raw[row.i] },
        { color: COLORS.swap, dx: 14, value: result.swap[row.i] },
        { color: COLORS.control, dx: 24, value: result.controlled[row.i] }
      ].forEach(function (bar) {
        var barW = Math.max(1, bar.value * width);
        ctx.fillStyle = bar.color;
        ctx.fillRect(left, y + bar.dx, barW, 7);
      });
      label(ctx, formatPct(result.human[row.i], 0), left + width + 8, y + 12, "left", "middle", COLORS.muted);
    });
    label(ctx, "human", left, box.y + box.h - 14, "left", "middle", COLORS.human);
    label(ctx, "raw", left + 72, box.y + box.h - 14, "left", "middle", COLORS.raw);
    label(ctx, "swap", left + 126, box.y + box.h - 14, "left", "middle", COLORS.swap);
    label(ctx, "length-control", left + 188, box.y + box.h - 14, "left", "middle", COLORS.control);
  }

  function drawPositionPanel(ctx, box, result) {
    panel(ctx, box, "seat audit", "first-position edge by quality gap");
    var left = box.x + 44;
    var top = box.y + 24;
    var width = box.w - 64;
    var height = box.h - 58;
    var maxAbs = Math.max(0.04, Math.max.apply(null, result.firstSeatEdges.map(function (v) { return Math.abs(v || 0); })) * 1.3);
    var y = function (value) { return top + height / 2 - value / maxAbs * height / 2; };
    gridLine(ctx, left, y(0), left + width, y(0));
    ctx.fillStyle = COLORS.band;
    ctx.fillRect(left, y(0.02), width, y(-0.02) - y(0.02));
    result.firstSeatEdges.forEach(function (edge, i) {
      var barW = width / result.firstSeatEdges.length - 8;
      var x = left + i * width / result.firstSeatEdges.length + 4;
      var yy = y(Math.max(0, edge));
      ctx.fillStyle = edge >= 0 ? COLORS.raw : COLORS.control;
      ctx.fillRect(x, yy, barW, Math.abs(y(edge) - y(0)));
      ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, ["tiny", "small", "med", "large"][i], x + barW / 2, top + height + 16, "center", "top", COLORS.muted);
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "+" + formatPct(maxAbs, 0), left - 8, top, "right", "top", COLORS.muted);
    label(ctx, "0", left - 8, y(0), "right", "middle", COLORS.muted);
  }

  function drawLengthPanel(ctx, box, result) {
    panel(ctx, box, "verbosity residual", "raw judge minus human");
    var left = box.x + 48;
    var top = box.y + 24;
    var width = box.w - 70;
    var height = box.h - 58;
    var minLen = Math.min.apply(null, result.avgLengths) - 10;
    var maxLen = Math.max.apply(null, result.avgLengths) + 10;
    var residuals = result.raw.map(function (value, i) { return value - result.human[i]; });
    var maxAbs = Math.max(0.04, Math.max.apply(null, residuals.map(function (v) { return Math.abs(v); })) * 1.25);
    var x = function (length) { return left + (length - minLen) / (maxLen - minLen) * width; };
    var y = function (value) { return top + height / 2 - value / maxAbs * height / 2; };
    gridLine(ctx, left, y(0), left + width, y(0));
    result.models.forEach(function (model, i) {
      ctx.fillStyle = residuals[i] >= 0 ? COLORS.raw : COLORS.swap;
      ctx.beginPath();
      ctx.arc(x(result.avgLengths[i]), y(residuals[i]), 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
      label(ctx, model.name, x(result.avgLengths[i]) + 7, y(residuals[i]), "left", "middle", COLORS.muted);
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "short", left, top + height + 16, "left", "top", COLORS.muted);
    label(ctx, "long", left + width, top + height + 16, "right", "top", COLORS.muted);
  }

  function drawMatrixPanel(ctx, box, result) {
    panel(ctx, box, "pairwise error", "raw judge absolute error");
    var n = result.models.length;
    var size = Math.min(25, Math.floor((box.w - 90) / n), Math.floor((box.h - 72) / n));
    var left = box.x + 76;
    var top = box.y + 34;
    var max = 0.001;
    for (var i = 0; i < n; i += 1) {
      for (var j = 0; j < n; j += 1) max = Math.max(max, result.disagreement[i][j]);
    }
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) {
        var value = result.disagreement[r][c] / max;
        var red = Math.round(245 - 45 * value);
        var green = Math.round(245 - 155 * value);
        var blue = Math.round(245 - 160 * value);
        ctx.fillStyle = r === c ? COLORS.faint : "rgb(" + red + "," + green + "," + blue + ")";
        ctx.fillRect(left + c * size, top + r * size, size - 1, size - 1);
      }
    }
    ctx.font = "10px system-ui, -apple-system, Segoe UI, sans-serif";
    result.models.forEach(function (model, i) {
      label(ctx, model.name.slice(0, 5), left - 8, top + i * size + size / 2, "right", "middle", COLORS.muted);
      label(ctx, String(i + 1), left + i * size + size / 2, top - 8, "center", "bottom", COLORS.muted);
    });
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "darker = larger judge-human gap", box.x + 16, box.y + box.h - 18, "left", "middle", COLORS.muted);
  }

  function drawChart(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1;
    ctx.font = "700 20px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, "An LLM judge is a measurement protocol", 54, 28, "left", "top", COLORS.text);
    ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
    label(ctx, result.rows + " pairwise comparisons; rankings are win rates against the field.", 54, 54, "left", "top", COLORS.muted);
    drawLeaderboard(ctx, { x: 54, y: 86, w: 792, h: 246 }, result);
    drawPositionPanel(ctx, { x: 54, y: 400, w: 248, h: 190 }, result);
    drawLengthPanel(ctx, { x: 342, y: 400, w: 248, h: 190 }, result);
    drawMatrixPanel(ctx, { x: 630, y: 400, w: 216, h: 190 }, result);
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("human top", result.metrics.humanTop),
        metric("raw judge top", result.metrics.rawTop),
        metric("controlled top", result.metrics.controlledTop),
        metric("raw rank rho", formatNumber(result.metrics.rawRho, 2)),
        metric("controlled rho", formatNumber(result.metrics.controlledRho, 2)),
        metric("first-seat edge", formatPct(result.metrics.firstSeatEdge, 1))
      ].join("");
    }
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-judge-lab]"));
    labs.forEach(function (root) {
      if (root.__judgeLabReady) return;
      root.__judgeLabReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      makePrompts: makePrompts,
      response: response,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
