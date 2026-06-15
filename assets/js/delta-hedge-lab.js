(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#eef2f5",
    faint: "#f8fafc",
    spot: "#2563eb",
    option: "#7c3aed",
    pnl: "#0f766e",
    loss: "#be123c",
    cost: "#d97706",
    realized: "#64748b"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(random) {
    var u1 = Math.max(1e-12, random());
    var u2 = random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var p = 0.3275911;
    var ax = Math.abs(x);
    var t = 1 / (1 + p * ax);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return sign * y;
  }

  function cdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function pdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  function bsCall(spot, strike, tau, vol, rate) {
    if (tau <= 1e-8 || vol <= 1e-8) {
      var intrinsic = Math.max(0, spot - strike * Math.exp(-rate * Math.max(0, tau)));
      return {
        price: intrinsic,
        delta: spot > strike ? 1 : 0,
        gamma: 0,
        theta: 0,
        vega: 0
      };
    }
    var rootT = Math.sqrt(tau);
    var d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * tau) / (vol * rootT);
    var d2 = d1 - vol * rootT;
    var discount = Math.exp(-rate * tau);
    var price = spot * cdf(d1) - strike * discount * cdf(d2);
    var gamma = pdf(d1) / (spot * vol * rootT);
    return {
      price: price,
      delta: cdf(d1),
      gamma: gamma,
      theta: -spot * pdf(d1) * vol / (2 * rootT) - rate * strike * discount * cdf(d2),
      vega: spot * pdf(d1) * rootT
    };
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="delta-hedge-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function cleanParams(raw) {
    return {
      seed: clamp(Math.round(raw.seed || 42), 1, 99),
      days: clamp(Math.round(raw.days || 60), 20, 126),
      hedgeEvery: clamp(Math.round(raw.hedgeEvery || 1), 1, 21),
      impliedVol: clamp(raw.impliedVol == null ? 0.22 : raw.impliedVol, 0.05, 0.70),
      realizedVol: clamp(raw.realizedVol == null ? 0.18 : raw.realizedVol, 0.05, 0.80),
      jumpIntensity: clamp(raw.jumpIntensity == null ? 0.06 : raw.jumpIntensity, 0, 0.40),
      spreadBps: clamp(raw.spreadBps == null ? 4 : raw.spreadBps, 0, 60),
      strike: clamp(raw.strike == null ? 100 : raw.strike, 80, 120)
    };
  }

  function simulatePath(params) {
    var random = rng(params.seed * 10007 + params.days * 97);
    var dt = 1 / 252;
    var spot = 100;
    var rows = [{ day: 0, spot: spot, logReturn: 0, jump: false }];
    for (var day = 1; day <= params.days; day += 1) {
      var jump = false;
      var jumpLog = 0;
      if (random() < params.jumpIntensity / 252) {
        jump = true;
        jumpLog = (random() < 0.62 ? -1 : 1) * (0.055 + 0.085 * random());
      }
      var shock = (params.realizedVol * Math.sqrt(dt) * normal(random)) - 0.5 * params.realizedVol * params.realizedVol * dt + jumpLog;
      spot = Math.max(1, spot * Math.exp(shock));
      rows.push({ day: day, spot: spot, logReturn: shock, jump: jump });
    }
    return rows;
  }

  function hedge(params) {
    var clean = cleanParams(params);
    var path = simulatePath(clean);
    var rate = 0;
    var dt = 1 / 252;
    var strike = clean.strike;
    var initial = bsCall(path[0].spot, strike, clean.days / 252, clean.impliedVol, rate);
    var shortOptionCash = initial.price;
    var shares = initial.delta;
    var cash = shortOptionCash - shares * path[0].spot;
    var costs = Math.abs(shares) * path[0].spot * clean.spreadBps / 10000;
    cash -= costs;
    var rows = [{
      day: 0,
      spot: path[0].spot,
      option: initial.price,
      delta: initial.delta,
      gamma: initial.gamma,
      theta: initial.theta,
      shares: shares,
      cash: cash,
      cost: costs,
      hedgePnl: 0,
      gammaTheta: 0,
      portfolio: cash + shares * path[0].spot - initial.price,
      jump: false
    }];
    var cumulativeCost = costs;
    var cumulativeGammaTheta = 0;
    var cumulativeHedge = 0;
    var realizedVariance = 0;

    for (var i = 1; i < path.length; i += 1) {
      var prev = rows[rows.length - 1];
      var tau = Math.max(0, (clean.days - i) / 252);
      var greeksPrev = bsCall(prev.spot, strike, Math.max(dt, (clean.days - i + 1) / 252), clean.impliedVol, rate);
      var greeks = bsCall(path[i].spot, strike, tau, clean.impliedVol, rate);
      var dS = path[i].spot - prev.spot;
      var hedgePnl = prev.shares * dS;
      var gammaTheta = -0.5 * greeksPrev.gamma * dS * dS - greeksPrev.theta * dt;
      cumulativeHedge += hedgePnl;
      cumulativeGammaTheta += gammaTheta;
      realizedVariance += path[i].logReturn * path[i].logReturn;

      if (i % clean.hedgeEvery === 0 && i < clean.days) {
        var targetShares = greeks.delta;
        var trade = targetShares - prev.shares;
        var tradeCost = Math.abs(trade) * path[i].spot * clean.spreadBps / 10000;
        cash = prev.cash - trade * path[i].spot - tradeCost;
        shares = targetShares;
        cumulativeCost += tradeCost;
      } else {
        cash = prev.cash;
        shares = prev.shares;
      }

      var portfolio = cash + shares * path[i].spot - greeks.price;
      rows.push({
        day: i,
        spot: path[i].spot,
        option: greeks.price,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        shares: shares,
        cash: cash,
        cost: cumulativeCost,
        hedgePnl: cumulativeHedge,
        gammaTheta: cumulativeGammaTheta,
        portfolio: portfolio,
        jump: path[i].jump
      });
    }

    var final = rows[rows.length - 1];
    var payoff = Math.max(0, final.spot - strike);
    var terminalWealth = cash + shares * final.spot - payoff;
    var realizedVol = Math.sqrt(realizedVariance * 252 / Math.max(1, clean.days));
    return {
      params: clean,
      rows: rows,
      initialPrice: initial.price,
      initialDelta: initial.delta,
      payoff: payoff,
      terminalWealth: terminalWealth,
      realizedVol: realizedVol,
      realizedVariance: realizedVariance,
      cumulativeCost: cumulativeCost,
      cumulativeHedge: cumulativeHedge,
      cumulativeGammaTheta: cumulativeGammaTheta,
      jumpCount: path.filter(function (row) { return row.jump; }).length
    };
  }

  function sweep(params) {
    var clean = cleanParams(params);
    return [1, 2, 3, 5, 10, 21].map(function (h) {
      var run = hedge(Object.assign({}, clean, { hedgeEvery: h }));
      return {
        hedgeEvery: h,
        pnl: run.terminalWealth,
        cost: run.cumulativeCost,
        realizedVol: run.realizedVol
      };
    });
  }

  function simulate(params) {
    var run = hedge(params);
    run.sweep = sweep(run.params);
    run.audit = runAudit();
    return run;
  }

  function runAudit() {
    var ok = 0;
    var cases = 0;
    [7, 42, 81].forEach(function (seed) {
      [0.14, 0.24, 0.44].forEach(function (realizedVol) {
        [1, 5, 21].forEach(function (hedgeEvery) {
          [0, 8, 35].forEach(function (spreadBps) {
            cases += 1;
            var run = hedge({
              seed: seed,
              days: 60,
              hedgeEvery: hedgeEvery,
              impliedVol: 0.22,
              realizedVol: realizedVol,
              jumpIntensity: 0.06,
              spreadBps: spreadBps,
              strike: 100
            });
            var finite = isFinite(run.terminalWealth) &&
              isFinite(run.realizedVol) &&
              isFinite(run.cumulativeCost) &&
              run.rows.length === 61;
            var bounded = run.realizedVol >= 0 &&
              run.cumulativeCost >= 0 &&
              Math.abs(run.terminalWealth) < 100;
            if (finite && bounded) ok += 1;
          });
        });
      });
    });
    var calm = hedge({ seed: 42, days: 60, hedgeEvery: 1, impliedVol: 0.22, realizedVol: 0.16, jumpIntensity: 0, spreadBps: 0, strike: 100 });
    var wild = hedge({ seed: 42, days: 60, hedgeEvery: 1, impliedVol: 0.22, realizedVol: 0.34, jumpIntensity: 0, spreadBps: 0, strike: 100 });
    return {
      cases: cases + 1,
      ok: ok + (wild.terminalWealth < calm.terminalWealth ? 1 : 0),
      calmPnl: calm.terminalWealth,
      wildPnl: wild.terminalWealth
    };
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, x + 12, y + 20, COLORS.text, 13, 750);
  }

  function extent(rows, key, pad) {
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      min = Math.min(min, row[key]);
      max = Math.max(max, row[key]);
    });
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var extra = (max - min) * (pad == null ? 0.08 : pad);
    return [min - extra, max + extra];
  }

  function drawPath(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "spot path and hedge shares");
    var plot = { x: box.x + 42, y: box.y + 34, w: box.w - 58, h: box.h - 56 };
    var spotExtent = extent(run.rows, "spot", 0.10);
    var deltaExtent = [0, 1];
    function x(day) { return plot.x + day / run.params.days * plot.w; }
    function ySpot(spot) { return plot.y + (1 - (spot - spotExtent[0]) / (spotExtent[1] - spotExtent[0])) * plot.h; }
    function yDelta(delta) { return plot.y + (1 - (delta - deltaExtent[0]) / (deltaExtent[1] - deltaExtent[0])) * plot.h; }
    [0.25, 0.5, 0.75].forEach(function (v) {
      var yy = plot.y + plot.h * v;
      line(ctx, plot.x, yy, plot.x + plot.w, yy, COLORS.grid, 1);
    });
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, COLORS.rule, 1);
    ctx.beginPath();
    run.rows.forEach(function (row, i) {
      var px = x(row.day);
      var py = ySpot(row.spot);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = COLORS.spot;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    run.rows.forEach(function (row, i) {
      var px = x(row.day);
      var py = yDelta(row.shares);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = COLORS.option;
    ctx.lineWidth = 1.7;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    run.rows.forEach(function (row) {
      if (!row.jump) return;
      var px = x(row.day);
      line(ctx, px, plot.y, px, plot.y + plot.h, COLORS.loss, 1, [3, 4]);
    });
    text(ctx, "spot", plot.x + plot.w - 38, ySpot(run.rows[run.rows.length - 1].spot) - 7, COLORS.spot, 11, 750);
    text(ctx, "shares", plot.x + plot.w - 52, yDelta(run.rows[run.rows.length - 1].shares) + 14, COLORS.option, 11, 750);
    text(ctx, "day 0", plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 500);
    text(ctx, "expiry", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 500, "right");
  }

  function drawPnl(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "short-call hedge P&L");
    var plot = { x: box.x + 48, y: box.y + 34, w: box.w - 64, h: box.h - 56 };
    var rows = run.rows.map(function (row) {
      return {
        day: row.day,
        portfolio: row.portfolio,
        gammaTheta: row.gammaTheta - row.cost
      };
    });
    var all = [];
    rows.forEach(function (row) {
      all.push({ value: row.portfolio });
      all.push({ value: row.gammaTheta });
    });
    var min = Math.min.apply(null, all.map(function (row) { return row.value; }));
    var max = Math.max.apply(null, all.map(function (row) { return row.value; }));
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var pad = 0.12 * (max - min);
    min -= pad;
    max += pad;
    function x(day) { return plot.x + day / run.params.days * plot.w; }
    function y(value) { return plot.y + (1 - (value - min) / (max - min)) * plot.h; }
    var zero = y(0);
    line(ctx, plot.x, zero, plot.x + plot.w, zero, COLORS.rule, 1);
    line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, COLORS.rule, 1);
    ctx.beginPath();
    run.rows.forEach(function (row, i) {
      var px = x(row.day);
      var py = y(row.portfolio);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = run.terminalWealth >= 0 ? COLORS.pnl : COLORS.loss;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    run.rows.forEach(function (row, i) {
      var px = x(row.day);
      var py = y(row.gammaTheta - row.cost);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = COLORS.cost;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, "actual", plot.x + plot.w - 42, y(run.rows[run.rows.length - 1].portfolio) - 7, run.terminalWealth >= 0 ? COLORS.pnl : COLORS.loss, 11, 750);
    text(ctx, "gamma/theta-cost", plot.x + plot.w - 96, y(run.rows[run.rows.length - 1].gammaTheta - run.rows[run.rows.length - 1].cost) + 14, COLORS.cost, 11, 750);
  }

  function drawSweep(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "rebalance interval sweep");
    var plot = { x: box.x + 46, y: box.y + 36, w: box.w - 62, h: box.h - 58 };
    var min = Math.min.apply(null, run.sweep.map(function (row) { return row.pnl; }));
    var max = Math.max.apply(null, run.sweep.map(function (row) { return row.pnl; }));
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var pad = 0.18 * (max - min);
    min -= pad;
    max += pad;
    function x(i) { return plot.x + (i + 0.5) / run.sweep.length * plot.w; }
    function y(value) { return plot.y + (1 - (value - min) / (max - min)) * plot.h; }
    line(ctx, plot.x, y(0), plot.x + plot.w, y(0), COLORS.rule, 1);
    run.sweep.forEach(function (row, i) {
      var xx = x(i);
      var yy = y(row.pnl);
      ctx.fillStyle = row.pnl >= 0 ? COLORS.pnl : COLORS.loss;
      ctx.fillRect(xx - 10, Math.min(yy, y(0)), 20, Math.max(2, Math.abs(y(0) - yy)));
      text(ctx, String(row.hedgeEvery), xx, plot.y + plot.h + 16, COLORS.muted, 10, 600, "center");
      text(ctx, fmt(row.pnl, 1), xx, yy + (row.pnl >= 0 ? -7 : 14), COLORS.text, 10, 600, "center");
    });
    text(ctx, "days between hedges", plot.x + plot.w / 2, box.y + box.h - 8, COLORS.muted, 10, 600, "center");
  }

  function drawVariance(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "variance and costs");
    var x0 = box.x + 28;
    var y0 = box.y + 54;
    var w = box.w - 56;
    var rows = [
      { label: "implied vol", value: run.params.impliedVol, color: COLORS.option, suffix: "vol" },
      { label: "realized vol", value: run.realizedVol, color: COLORS.realized, suffix: "vol" },
      { label: "trade cost", value: run.cumulativeCost / Math.max(1, run.initialPrice), color: COLORS.cost, suffix: "cost/option" },
      { label: "final P&L", value: Math.abs(run.terminalWealth) / Math.max(1, run.initialPrice), color: run.terminalWealth >= 0 ? COLORS.pnl : COLORS.loss, suffix: run.terminalWealth >= 0 ? "gain/option" : "loss/option" }
    ];
    var max = Math.max(0.02, rows.reduce(function (m, row) { return Math.max(m, row.value); }, 0));
    rows.forEach(function (row, i) {
      var y = y0 + i * 46;
      text(ctx, row.label, x0, y - 6, COLORS.text, 11, 700);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, y, w, 10);
      ctx.fillStyle = row.color;
      ctx.fillRect(x0, y, w * row.value / max, 10);
      var value = row.suffix === "vol" ? pct(row.value, 1) : pct(row.value, 0);
      text(ctx, value, x0 + w, y + 9, row.color, 11, 750, "right");
    });
    text(ctx, run.jumpCount ? "jump days: " + run.jumpCount : "no jump days", x0, box.y + box.h - 20, run.jumpCount ? COLORS.loss : COLORS.muted, 11, 750);
  }

  function draw(run, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawPath(ctx, run, { x: 18, y: 18, w: 424, h: 318 });
    drawPnl(ctx, run, { x: 462, y: 18, w: 420, h: 318 });
    drawSweep(ctx, run, { x: 18, y: 356, w: 424, h: 322 });
    drawVariance(ctx, run, { x: 462, y: 356, w: 420, h: 322 });
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return isFinite(value) ? value : fallback;
    }
    return cleanParams({
      seed: number("seed", 42),
      days: number("days", 60),
      hedgeEvery: number("hedgeEvery", 1),
      impliedVol: number("impliedVol", 22) / 100,
      realizedVol: number("realizedVol", 18) / 100,
      jumpIntensity: number("jumpIntensity", 6) / 100,
      spreadBps: number("spreadBps", 4),
      strike: number("strike", 100)
    });
  }

  function updateOutputs(lab, params) {
    var labels = {
      seed: String(params.seed),
      days: String(params.days),
      hedgeEvery: String(params.hedgeEvery),
      impliedVol: pct(params.impliedVol, 0),
      realizedVol: pct(params.realizedVol, 0),
      jumpIntensity: pct(params.jumpIntensity, 0),
      spreadBps: String(params.spreadBps),
      strike: String(params.strike)
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var params = readParams(lab);
    updateOutputs(lab, params);
    var run = simulate(params);
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("short option P&L", fmt(run.terminalWealth, 2)),
        metric("realized vol", pct(run.realizedVol, 1)),
        metric("cost paid", fmt(run.cumulativeCost, 2)),
        metric("jump days", String(run.jumpCount)),
        metric("audit grid", run.audit.ok + "/" + run.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(run, canvas);
  }

  function init(lab) {
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-delta-hedge-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }

  var api = {
    bsCall: bsCall,
    cleanParams: cleanParams,
    hedge: hedge,
    runAudit: runAudit,
    simulate: simulate,
    sweep: sweep
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.DeltaHedgeLab = api;
})(typeof window !== "undefined" ? window : globalThis);
