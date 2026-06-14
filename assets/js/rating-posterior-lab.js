(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    trueSkill: "#172026",
    elo: "#2563eb",
    bayes: "#0f766e",
    interval: "rgba(15, 118, 110, 0.18)",
    conservative: "#7c3aed",
    warning: "#d97706",
    newcomer: "#be123c",
    bg: "#ffffff"
  };

  var DEFAULTS = {
    outcomeNoise: 420,
    drift: 26,
    kFactor: 32,
    uncertaintyGrowth: 38,
    matchmaking: 70,
    newcomerStrength: 620
  };

  var PLAYERS = 64;
  var MATCHES = 620;
  var NEWCOMER_ID = PLAYERS - 1;
  var NEWCOMER_MATCH = 210;
  var SCALE = 400;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      outcomeNoise: snap(raw.outcomeNoise, DEFAULTS.outcomeNoise, 240, 620, 10),
      drift: snap(raw.drift, DEFAULTS.drift, 0, 80, 1),
      kFactor: snap(raw.kFactor, DEFAULTS.kFactor, 8, 64, 1),
      uncertaintyGrowth: snap(raw.uncertaintyGrowth, DEFAULTS.uncertaintyGrowth, 0, 90, 1),
      matchmaking: snap(raw.matchmaking, DEFAULTS.matchmaking, 0, 100, 1),
      newcomerStrength: snap(raw.newcomerStrength, DEFAULTS.newcomerStrength, 0, 900, 10)
    };
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u = Math.max(1e-9, rng());
    var v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function logisticRating(diff, scale) {
    return 1 / (1 + Math.pow(10, -diff / scale));
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value) {
    return '<div class="rating-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function makePlayers(params) {
    var rng = makeRng(0x51A7E10);
    var players = [];
    for (var i = 0; i < PLAYERS; i += 1) {
      var trueSkill = 1500 + 260 * normal(rng);
      if (i === NEWCOMER_ID) trueSkill = 1500 + params.newcomerStrength;
      players.push({
        id: i,
        active: i !== NEWCOMER_ID,
        bayes: 1500,
        elo: 1500,
        games: 0,
        sigma: 350,
        trueSkill: trueSkill
      });
    }
    return players;
  }

  function activePlayers(players) {
    return players.filter(function (p) { return p.active; });
  }

  function pickPair(players, params, rng, matchIndex) {
    if (matchIndex === NEWCOMER_MATCH) players[NEWCOMER_ID].active = true;
    var active = activePlayers(players);
    var a;
    if (matchIndex >= NEWCOMER_MATCH && matchIndex < NEWCOMER_MATCH + 70 && rng() < 0.34) {
      a = players[NEWCOMER_ID];
    } else {
      a = active[Math.floor(rng() * active.length)];
    }

    var tightness = params.matchmaking / 100;
    var best = null;
    var bestScore = Infinity;
    for (var t = 0; t < 10; t += 1) {
      var candidate = active[Math.floor(rng() * active.length)];
      if (candidate.id === a.id) continue;
      var ratingGap = Math.abs(candidate.bayes - a.bayes);
      var uncertaintyBonus = 0.18 * (candidate.sigma + a.sigma);
      var randomSlack = (1 - tightness) * 600 * rng();
      var score = tightness * ratingGap - uncertaintyBonus + randomSlack;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best || best.id === a.id) {
      do {
        best = active[Math.floor(rng() * active.length)];
      } while (best.id === a.id);
    }
    return [a, best];
  }

  function applyDrift(players, params, rng) {
    var driftSigma = params.drift / 100 * 18;
    var sigmaGrowth = params.uncertaintyGrowth / 100 * 8;
    players.forEach(function (p) {
      if (!p.active) return;
      p.trueSkill += driftSigma * normal(rng);
      p.trueSkill += 0.012 * (1500 - p.trueSkill);
      p.sigma = clamp(Math.sqrt(p.sigma * p.sigma + sigmaGrowth * sigmaGrowth), 45, 420);
    });
  }

  function updateElo(a, b, scoreA, params) {
    var expectedA = logisticRating(a.elo - b.elo, SCALE);
    var delta = params.kFactor * (scoreA - expectedA);
    a.elo += delta;
    b.elo -= delta;
  }

  function updateBayes(a, b, scoreA, params) {
    var expectedA = logisticRating(a.bayes - b.bayes, SCALE);
    var residual = scoreA - expectedA;
    var info = expectedA * (1 - expectedA);
    var aUnc = Math.pow(a.sigma / 350, 1.25);
    var bUnc = Math.pow(b.sigma / 350, 0.35);
    var kA = params.kFactor * (0.36 + 1.65 * aUnc) * (0.85 + 0.30 * bUnc);
    var kB = params.kFactor * (0.36 + 1.65 * Math.pow(b.sigma / 350, 1.25)) * (0.85 + 0.30 * Math.pow(a.sigma / 350, 0.35));
    a.bayes += kA * residual;
    b.bayes -= kB * residual;
    var shrinkA = 1 - clamp(0.18 * info * (0.7 + b.sigma / 350), 0.015, 0.16);
    var shrinkB = 1 - clamp(0.18 * info * (0.7 + a.sigma / 350), 0.015, 0.16);
    a.sigma = clamp(a.sigma * shrinkA, 45, 420);
    b.sigma = clamp(b.sigma * shrinkB, 45, 420);
  }

  function rmse(players, key) {
    var rows = activePlayers(players);
    var sum = 0;
    rows.forEach(function (p) {
      var err = p[key] - p.trueSkill;
      sum += err * err;
    });
    return Math.sqrt(sum / Math.max(1, rows.length));
  }

  function rankError(players, key) {
    var rows = activePlayers(players).slice();
    var trueOrder = rows.slice().sort(function (a, b) { return b.trueSkill - a.trueSkill; });
    var rank = {};
    trueOrder.forEach(function (p, i) { rank[p.id] = i + 1; });
    var pred = rows.slice().sort(function (a, b) { return b[key] - a[key]; });
    var sum = 0;
    pred.slice(0, 12).forEach(function (p, i) {
      sum += Math.abs((i + 1) - rank[p.id]);
    });
    return sum / 12;
  }

  function conservative(p) {
    return p.bayes - 2 * p.sigma;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var players = makePlayers(params);
    var rng = makeRng(0xA11CE);
    var trace = [];
    var newcomer = [];
    var matches = [];

    for (var m = 0; m < MATCHES; m += 1) {
      if (m % 8 === 0) applyDrift(players, params, rng);
      var pair = pickPair(players, params, rng, m);
      var a = pair[0];
      var b = pair[1];
      var winProb = logisticRating(a.trueSkill - b.trueSkill, params.outcomeNoise);
      var scoreA = rng() < winProb ? 1 : 0;
      updateElo(a, b, scoreA, params);
      updateBayes(a, b, scoreA, params);
      a.games += 1;
      b.games += 1;
      matches.push({ a: a.id, b: b.id, scoreA: scoreA, winProb: winProb });

      if (m % 10 === 0 || m === MATCHES - 1) {
        trace.push({
          match: m,
          bayesRmse: rmse(players, "bayes"),
          eloRmse: rmse(players, "elo")
        });
      }
      if (m >= NEWCOMER_MATCH - 12 && m % 5 === 0) {
        var n = players[NEWCOMER_ID];
        newcomer.push({
          bayes: n.bayes,
          conservative: conservative(n),
          elo: n.elo,
          games: n.games,
          match: m,
          sigma: n.sigma,
          trueSkill: n.trueSkill
        });
      }
    }

    var rows = activePlayers(players).map(function (p) {
      return {
        bayes: p.bayes,
        conservative: conservative(p),
        elo: p.elo,
        games: p.games,
        id: p.id,
        sigma: p.sigma,
        trueSkill: p.trueSkill
      };
    });
    var trueTop = rows.slice().sort(function (a, b) { return b.trueSkill - a.trueSkill; }).slice(0, 12);
    var eloTop = rows.slice().sort(function (a, b) { return b.elo - a.elo; }).slice(0, 12);
    var bayesTop = rows.slice().sort(function (a, b) { return b.conservative - a.conservative; }).slice(0, 12);
    return {
      params: params,
      players: rows,
      trace: trace,
      newcomer: newcomer,
      matches: matches,
      summary: {
        bayesRmse: rmse(players, "bayes"),
        eloRmse: rmse(players, "elo"),
        eloRankError: rankError(players, "elo"),
        conservativeRankError: (function () {
          var rows2 = activePlayers(players).slice();
          rows2.forEach(function (p) { p._conservative = conservative(p); });
          return rankError(rows2, "_conservative");
        })(),
        newcomerGames: players[NEWCOMER_ID].games,
        newcomerSigma: players[NEWCOMER_ID].sigma
      },
      top: {
        trueTop: trueTop,
        eloTop: eloTop,
        bayesTop: bayesTop
      }
    };
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function label(ctx, text, x, y, align, color) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawLine(ctx, rows, sx, sy, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row);
      var y = sy(row);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawErrorPanel(ctx, result, box) {
    panelTitle(ctx, box, "Tracking error", "fixed K score versus uncertainty-aware mean");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 72, h: box.h - 90 };
    drawAxis(ctx, plot);
    var maxY = 1;
    result.trace.forEach(function (row) {
      maxY = Math.max(maxY, row.eloRmse, row.bayesRmse);
    });
    maxY *= 1.08;
    for (var i = 1; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    function sx(row) { return plot.x + row.match / (MATCHES - 1) * plot.w; }
    function sy(v) { return plot.y + plot.h - v / maxY * plot.h; }
    drawLine(ctx, result.trace, sx, function (row) { return sy(row.eloRmse); }, COLORS.elo, 2.3);
    drawLine(ctx, result.trace, sx, function (row) { return sy(row.bayesRmse); }, COLORS.bayes, 2.5);
    label(ctx, "Elo RMSE", plot.x + 8, plot.y + 16, "left", COLORS.elo);
    label(ctx, "uncertainty mean RMSE", plot.x + 8, plot.y + 34, "left", COLORS.bayes);
    label(ctx, "0", plot.x - 8, plot.y + plot.h, "right");
    label(ctx, formatNumber(maxY), plot.x - 8, plot.y, "right");
    label(ctx, "matches", plot.x + plot.w, plot.y + plot.h + 18, "right");
  }

  function drawNewcomerPanel(ctx, result, box) {
    panelTitle(ctx, box, "The late strong player", "wide uncertainty lets evidence move faster");
    var rows = result.newcomer;
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 72, h: box.h - 90 };
    drawAxis(ctx, plot);
    var minY = 1300;
    var maxY = 2300;
    rows.forEach(function (row) {
      minY = Math.min(minY, row.conservative, row.elo, row.trueSkill - 2 * row.sigma);
      maxY = Math.max(maxY, row.bayes + 2 * row.sigma, row.elo, row.trueSkill);
    });
    minY -= 30;
    maxY += 30;
    function sx(row) { return plot.x + (row.match - (NEWCOMER_MATCH - 12)) / (MATCHES - (NEWCOMER_MATCH - 12)) * plot.w; }
    function sy(v) { return plot.y + plot.h - (v - minY) / Math.max(1, maxY - minY) * plot.h; }
    ctx.fillStyle = COLORS.interval;
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var x = sx(row);
      var y = sy(row.bayes + 2 * row.sigma);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    rows.slice().reverse().forEach(function (row) {
      ctx.lineTo(sx(row), sy(row.bayes - 2 * row.sigma));
    });
    ctx.closePath();
    ctx.fill();
    drawLine(ctx, rows, sx, function (row) { return sy(row.trueSkill); }, COLORS.trueSkill, 2.2);
    drawLine(ctx, rows, sx, function (row) { return sy(row.elo); }, COLORS.elo, 2.2);
    drawLine(ctx, rows, sx, function (row) { return sy(row.bayes); }, COLORS.bayes, 2.4);
    drawLine(ctx, rows, sx, function (row) { return sy(row.conservative); }, COLORS.conservative, 1.8);
    label(ctx, "true", plot.x + 8, plot.y + 16, "left", COLORS.trueSkill);
    label(ctx, "Elo", plot.x + 8, plot.y + 34, "left", COLORS.elo);
    label(ctx, "mean", plot.x + 72, plot.y + 16, "left", COLORS.bayes);
    label(ctx, "mean - 2 sigma", plot.x + 72, plot.y + 34, "left", COLORS.conservative);
    label(ctx, "joins", plot.x, plot.y + plot.h + 18, "left", COLORS.newcomer);
  }

  function drawScatterPanel(ctx, result, box) {
    panelTitle(ctx, box, "Final calibration", "ratings should be estimates, not trophies");
    var plot = { x: box.x + 46, y: box.y + 54, w: box.w - 70, h: box.h - 88 };
    drawAxis(ctx, plot);
    var rows = result.players;
    var minV = 1200;
    var maxV = 2200;
    rows.forEach(function (p) {
      minV = Math.min(minV, p.trueSkill, p.elo, p.bayes);
      maxV = Math.max(maxV, p.trueSkill, p.elo, p.bayes);
    });
    minV -= 50;
    maxV += 50;
    function sx(v) { return plot.x + (v - minV) / (maxV - minV) * plot.w; }
    function sy(v) { return plot.y + plot.h - (v - minV) / (maxV - minV) * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(sx(minV), sy(minV));
    ctx.lineTo(sx(maxV), sy(maxV));
    ctx.stroke();
    rows.forEach(function (p) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.38)";
      ctx.beginPath();
      ctx.arc(sx(p.trueSkill), sy(p.elo), 3.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "rgba(15, 118, 110, 0.48)";
      ctx.beginPath();
      ctx.arc(sx(p.trueSkill), sy(p.bayes), 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "true skill", plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, "rated skill", plot.x - 8, plot.y, "right");
    label(ctx, "Elo", plot.x + 8, plot.y + 16, "left", COLORS.elo);
    label(ctx, "uncertainty mean", plot.x + 8, plot.y + 34, "left", COLORS.bayes);
  }

  function drawLeaderboardPanel(ctx, result, box) {
    panelTitle(ctx, box, "Top of ladder", "conservative rank refuses to over-trust uncertainty");
    var rows = result.top.bayesTop.slice(0, 10);
    var plot = { x: box.x + 16, y: box.y + 54, w: box.w - 32, h: box.h - 88 };
    var maxV = Math.max.apply(null, rows.map(function (p) { return Math.max(p.trueSkill, p.elo, p.conservative); }));
    var minV = Math.min.apply(null, rows.map(function (p) { return Math.min(p.trueSkill, p.elo, p.conservative); }));
    minV -= 30;
    maxV += 30;
    function sx(v) { return plot.x + (v - minV) / Math.max(1, maxV - minV) * plot.w; }
    rows.forEach(function (p, i) {
      var y = plot.y + i * (plot.h / 10) + 7;
      label(ctx, "#" + (i + 1) + " P" + p.id, plot.x, y + 7, "left", COLORS.muted);
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x + 52, y + 7);
      ctx.lineTo(plot.x + plot.w, y + 7);
      ctx.stroke();
      ctx.fillStyle = COLORS.trueSkill;
      ctx.fillRect(sx(p.trueSkill), y, 7, 14);
      ctx.fillStyle = COLORS.elo;
      ctx.fillRect(sx(p.elo), y + 4, 7, 10);
      ctx.fillStyle = COLORS.conservative;
      ctx.fillRect(sx(p.conservative), y + 8, 7, 10);
      label(ctx, p.games + "g", plot.x + plot.w, y + 7, "right", COLORS.muted);
    });
    label(ctx, "true", plot.x + 54, box.y + box.h - 32, "left", COLORS.trueSkill);
    label(ctx, "Elo", plot.x + 108, box.y + box.h - 32, "left", COLORS.elo);
    label(ctx, "conservative", plot.x + 156, box.y + box.h - 32, "left", COLORS.conservative);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 680;
    var height = compact ? 960 : 700;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    var gap = compact ? 22 : 26;
    var boxW = compact ? width - 24 : (width - 36 - gap) / 2;
    var boxH = compact ? 220 : 305;
    var left = 12;
    var right = compact ? 12 : left + boxW + gap;
    var top = 14;
    var boxes = compact ? [
      { x: left, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: left, y: top + 2 * (boxH + gap), w: boxW, h: boxH },
      { x: left, y: top + 3 * (boxH + gap), w: boxW, h: boxH }
    ] : [
      { x: left, y: top, w: boxW, h: boxH },
      { x: right, y: top, w: boxW, h: boxH },
      { x: left, y: top + boxH + gap, w: boxW, h: boxH },
      { x: right, y: top + boxH + gap, w: boxW, h: boxH }
    ];
    drawErrorPanel(ctx, result, boxes[0]);
    drawNewcomerPanel(ctx, result, boxes[1]);
    drawScatterPanel(ctx, result, boxes[2]);
    drawLeaderboardPanel(ctx, result, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateControls(root, params) {
    var values = {
      drift: params.drift + "%",
      kFactor: params.kFactor,
      matchmaking: params.matchmaking + "%",
      newcomerStrength: "+" + params.newcomerStrength,
      outcomeNoise: params.outcomeNoise,
      uncertaintyGrowth: params.uncertaintyGrowth + "%"
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
  }

  function render(root) {
    var result = evaluate(paramsFromRoot(root));
    updateControls(root, result.params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Elo RMSE", formatNumber(result.summary.eloRmse)),
        metric("Uncertain RMSE", formatNumber(result.summary.bayesRmse)),
        metric("Elo top error", formatNumber(result.summary.eloRankError, 1)),
        metric("Conservative top error", formatNumber(result.summary.conservativeRankError, 1)),
        metric("Newcomer games", result.summary.newcomerGames),
        metric("Newcomer sigma", formatNumber(result.summary.newcomerSigma))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas && canvas.getContext) drawChart(canvas, result);
  }

  function init(root) {
    var frame = 0;
    function requestRender() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = 0;
        render(root);
      });
    }
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function boot() {
    global.document.querySelectorAll("[data-rating-posterior-lab]").forEach(init);
  }

  global.RatingPosteriorLab = {
    evaluate: evaluate,
    cleanParams: cleanParams
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.RatingPosteriorLab;
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
