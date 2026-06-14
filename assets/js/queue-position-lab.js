(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    fill: "#0f766e",
    adverse: "#be123c",
    miss: "#d97706",
    pull: "#2563eb",
    timeout: "#94a3b8",
    value: "#7c3aed",
    implementation: "#64748b",
    ask: "#b45309",
    bid: "#0f766e",
    mid: "#172026"
  };

  var DEFAULTS = {
    position: 65,
    bidDepth: 80,
    askDepth: 70,
    toxicity: 62,
    cancelRate: 32,
    pullSpeed: 20,
    horizon: 120
  };

  var PATHS = 900;
  var CURVE_PATHS = 420;
  var MARKOUT_EVENTS = 42;

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
      position: snap(raw.position, DEFAULTS.position, 0, 100, 1),
      bidDepth: snap(raw.bidDepth, DEFAULTS.bidDepth, 12, 180, 1),
      askDepth: snap(raw.askDepth, DEFAULTS.askDepth, 12, 180, 1),
      toxicity: snap(raw.toxicity, DEFAULTS.toxicity, 0, 100, 1),
      cancelRate: snap(raw.cancelRate, DEFAULTS.cancelRate, 0, 70, 1),
      pullSpeed: snap(raw.pullSpeed, DEFAULTS.pullSpeed, 0, 90, 1),
      horizon: snap(raw.horizon, DEFAULTS.horizon, 30, 240, 5)
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
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

  function choose(rng, weights) {
    var total = 0;
    for (var i = 0; i < weights.length; i += 1) total += Math.max(0, weights[i].w);
    var u = rng() * total;
    for (var j = 0; j < weights.length; j += 1) {
      u -= Math.max(0, weights[j].w);
      if (u <= 0) return weights[j].k;
    }
    return weights[weights.length - 1].k;
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatTick(value) {
    if (!isFinite(value)) return "n/a";
    var sign = value > 0 ? "+" : "";
    return sign + value.toFixed(Math.abs(value) < 1 ? 2 : 1) + " ticks";
  }

  function formatEvents(value) {
    if (!isFinite(value) || value <= 0) return "n/a";
    return value.toFixed(0) + " events";
  }

  function metric(label, value) {
    return '<div class="queue-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function startingAhead(params, positionPct) {
    return Math.round((params.bidDepth - 1) * clamp(positionPct, 0, 100) / 100);
  }

  function basePressure(params, rng) {
    var imbalance = (params.bidDepth - params.askDepth) / Math.max(1, params.bidDepth + params.askDepth);
    var pUp = clamp(0.5 + 0.35 * imbalance, 0.12, 0.88);
    return rng() < pUp ? 1 : -1;
  }

  function maybeFlipPressure(params, pressure, rng) {
    var tox = params.toxicity / 100;
    var flip = 0.18 * (1 - tox) + 0.018;
    if (rng() < flip) return -pressure;
    return pressure;
  }

  function eventWeights(params, pressure, bidCanCancel, askDepth) {
    var tox = params.toxicity / 100;
    var lean = 1 + 2.8 * tox;
    var cancel = 0.18 + 1.25 * params.cancelRate / 70;
    var sell = pressure < 0 ? lean : 1 / lean;
    var buy = pressure > 0 ? lean : 1 / lean;

    return [
      { k: "sell", w: sell },
      { k: "buy", w: buy },
      { k: "cancelBid", w: bidCanCancel ? cancel * (pressure < 0 ? 1.35 : 0.72) : 0 },
      { k: "cancelAsk", w: askDepth > 0 ? cancel * (pressure > 0 ? 1.35 : 0.72) : 0 },
      { k: "limitBid", w: 0.55 * (pressure > 0 ? 1.12 : 0.78) },
      { k: "limitAsk", w: 0.55 * (pressure < 0 ? 1.12 : 0.78) }
    ];
  }

  function marketOrderSize(params, pressure, side, rng) {
    var tox = params.toxicity / 100;
    var directional = (side === "sell" && pressure < 0) || (side === "buy" && pressure > 0);
    var maxSize = directional ? 2 + Math.round(9 * tox) : 3;
    var continueProb = directional ? 0.28 + 0.42 * tox : 0.12;
    var size = 1;
    while (size < maxSize && rng() < continueProb) size += 1;
    return size;
  }

  function replenishDepth(params, side, rng) {
    var base = side === "bid" ? params.bidDepth : params.askDepth;
    var jitter = Math.round((rng() - 0.5) * 0.35 * base);
    return Math.max(4, base + jitter);
  }

  function recordPoint(trace, event, ahead, askDepth, mid, outcome) {
    if (!trace) return;
    trace.push({
      ahead: Math.max(0, ahead),
      ask: Math.max(0, askDepth),
      event: event,
      mid: mid,
      outcome: outcome || ""
    });
  }

  function simulateOne(params, positionPct, seed, keepTrace) {
    var rng = makeRng(seed);
    var ahead = startingAhead(params, positionPct);
    var behind = Math.max(0, params.bidDepth - ahead - 1);
    var askDepth = params.askDepth;
    var pressure = basePressure(params, rng);
    var mid = 0;
    var fillPrice = -0.5;
    var fillEvent = 0;
    var trace = keepTrace ? [] : null;
    var outcome = "timeout";
    var pulled = false;

    recordPoint(trace, 0, ahead, askDepth, mid);

    for (var t = 1; t <= params.horizon; t += 1) {
      pressure = maybeFlipPressure(params, pressure, rng);
      var event = choose(rng, eventWeights(params, pressure, ahead > 0, askDepth));

      if (event === "sell") {
        var sellSize = marketOrderSize(params, pressure, "sell", rng);
        if (ahead >= sellSize) {
          ahead -= sellSize;
        } else {
          if (pressure < 0 && rng() < params.pullSpeed / 100) {
            pulled = true;
            outcome = "pulled";
            recordPoint(trace, t, ahead, askDepth, mid, outcome);
            break;
          }
          var residual = Math.max(0, sellSize - ahead - 1);
          behind = Math.max(0, behind - residual);
          fillEvent = t;
          outcome = "filled";
          recordPoint(trace, t, ahead, askDepth, mid, outcome);
          break;
        }
      } else if (event === "cancelBid") {
        if (ahead > 0) ahead -= 1;
      } else if (event === "buy") {
        askDepth -= marketOrderSize(params, pressure, "buy", rng);
        if (askDepth <= 0) {
          mid += 1;
          outcome = "missUp";
          recordPoint(trace, t, ahead, askDepth, mid, outcome);
          break;
        }
      } else if (event === "cancelAsk") {
        askDepth -= 1;
        if (askDepth <= 0) {
          mid += 1;
          outcome = "missUp";
          recordPoint(trace, t, ahead, askDepth, mid, outcome);
          break;
        }
      } else if (event === "limitBid") {
        behind += 1;
      } else if (event === "limitAsk") {
        askDepth += 1;
      }

      if (keepTrace && (t < 40 || t % 3 === 0)) recordPoint(trace, t, ahead, askDepth, mid);
    }

    var markout = 0;
    var finalMid = mid;
    var filled = outcome === "filled";
    var bidDepthAfterFill = Math.max(1, behind);

    if (filled) {
      for (var m = 1; m <= MARKOUT_EVENTS; m += 1) {
        pressure = maybeFlipPressure(params, pressure, rng);
        var markEvent = choose(rng, eventWeights(params, pressure, bidDepthAfterFill > 0, askDepth));
        if (markEvent === "sell") {
          bidDepthAfterFill -= marketOrderSize(params, pressure, "sell", rng);
        } else if (markEvent === "cancelBid") {
          bidDepthAfterFill -= 1;
        } else if (markEvent === "buy") {
          askDepth -= marketOrderSize(params, pressure, "buy", rng);
        } else if (markEvent === "cancelAsk") {
          askDepth -= 1;
        } else if (markEvent === "limitBid") {
          bidDepthAfterFill += 1;
        } else if (markEvent === "limitAsk") {
          askDepth += 1;
        }

        if (bidDepthAfterFill <= 0) {
          finalMid -= 1;
          bidDepthAfterFill = replenishDepth(params, "bid", rng);
          askDepth = Math.max(4, Math.round(0.85 * askDepth + 0.15 * replenishDepth(params, "ask", rng)));
        }
        if (askDepth <= 0) {
          finalMid += 1;
          askDepth = replenishDepth(params, "ask", rng);
          bidDepthAfterFill = Math.max(4, Math.round(0.85 * bidDepthAfterFill + 0.15 * replenishDepth(params, "bid", rng)));
        }

        if (keepTrace && (m % 3 === 0 || m === MARKOUT_EVENTS)) {
          recordPoint(trace, fillEvent + m, bidDepthAfterFill, askDepth, finalMid, "markout");
        }
      }
      markout = finalMid - fillPrice;
    }

    var implementationEdge = 0;
    if (filled) implementationEdge = 1;
    else if (outcome === "missUp") implementationEdge = -1;
    else implementationEdge = 0;

    return {
      adverse: filled && markout < 0,
      fillEvent: fillEvent,
      filled: filled,
      finalMid: finalMid,
      implementationEdge: implementationEdge,
      makerValue: filled ? markout : 0,
      markout: markout,
      outcome: pulled ? "pulled" : outcome,
      trace: trace
    };
  }

  function summarize(paths) {
    var out = {
      adverse: 0,
      filled: 0,
      fillTimes: 0,
      goodFill: 0,
      implementationEdge: 0,
      makerValue: 0,
      missUp: 0,
      pulled: 0,
      timeout: 0
    };
    paths.forEach(function (row) {
      out.implementationEdge += row.implementationEdge;
      out.makerValue += row.makerValue;
      if (row.filled) {
        out.filled += 1;
        out.fillTimes += row.fillEvent;
        if (row.adverse) out.adverse += 1;
        else out.goodFill += 1;
      } else if (row.outcome === "missUp") {
        out.missUp += 1;
      } else if (row.outcome === "pulled") {
        out.pulled += 1;
      } else {
        out.timeout += 1;
      }
    });
    var n = Math.max(1, paths.length);
    return {
      adverseFillRate: out.filled ? out.adverse / out.filled : 0,
      avgFillTime: out.filled ? out.fillTimes / out.filled : 0,
      fillRate: out.filled / n,
      implementationEdge: out.implementationEdge / n,
      makerValue: out.makerValue / n,
      outcomes: {
        adverse: out.adverse / n,
        goodFill: out.goodFill / n,
        missUp: out.missUp / n,
        pulled: out.pulled / n,
        timeout: out.timeout / n
      }
    };
  }

  function evaluateAt(params, positionPct, count, salt) {
    var paths = [];
    for (var i = 0; i < count; i += 1) {
      paths.push(simulateOne(params, positionPct, hash32(i + 1, salt), false));
    }
    return summarize(paths);
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var selected = evaluateAt(params, params.position, PATHS, 0x51554555);
    var curve = [];
    for (var pos = 0; pos <= 100; pos += 10) {
      var row = evaluateAt(params, pos, CURVE_PATHS, 0xA11CE + pos * 1009);
      row.position = pos;
      curve.push(row);
    }
    var trace = simulateOne(params, params.position, 0xBADC0DE, true);
    return {
      curve: curve,
      params: params,
      selected: selected,
      trace: trace
    };
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

  function line(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, i) {
      var x = xScale(point);
      var y = yScale(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function drawValuePanel(ctx, result, box) {
    panelTitle(ctx, box, "Queue value curve", "later positions fill less often and more selectively");
    var plot = { x: box.x + 46, y: box.y + 52, w: box.w - 70, h: box.h - 86 };
    drawAxis(ctx, plot);
    var values = result.curve.reduce(function (acc, row) {
      acc.push(row.makerValue);
      acc.push(row.implementationEdge);
      return acc;
    }, [-1, 1]);
    var minY = Math.min.apply(null, values);
    var maxY = Math.max.apply(null, values);
    minY = Math.min(-0.35, minY - 0.15);
    maxY = Math.max(0.35, maxY + 0.15);
    function sx(row) { return plot.x + row.position / 100 * plot.w; }
    function sy(v) { return plot.y + plot.h - (v - minY) / Math.max(1e-9, maxY - minY) * plot.h; }
    for (var i = 0; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    var zeroY = sy(0);
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, zeroY);
    ctx.lineTo(plot.x + plot.w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    line(ctx, result.curve, sx, function (row) { return sy(row.makerValue); }, COLORS.value, 2.4);
    line(ctx, result.curve, sx, function (row) { return sy(row.implementationEdge); }, COLORS.implementation, 2);
    label(ctx, "front", plot.x, plot.y + plot.h + 18, "left");
    label(ctx, "back", plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, formatTick(maxY), plot.x - 8, plot.y, "right");
    label(ctx, formatTick(minY), plot.x - 8, plot.y + plot.h, "right");
    label(ctx, "maker markout", plot.x + 8, plot.y + 16, "left", COLORS.value);
    label(ctx, "post-vs-cross", plot.x + 8, plot.y + 34, "left", COLORS.implementation);
  }

  function drawOutcomePanel(ctx, result, box) {
    panelTitle(ctx, box, "Selected-position outcomes", "one passive bid order, one simulated life");
    var outcomes = [
      { key: "goodFill", label: "good fill", color: COLORS.fill },
      { key: "adverse", label: "adverse fill", color: COLORS.adverse },
      { key: "missUp", label: "missed uptick", color: COLORS.miss },
      { key: "pulled", label: "pulled", color: COLORS.pull },
      { key: "timeout", label: "timeout", color: COLORS.timeout }
    ];
    var x = box.x + 10;
    var y = box.y + 58;
    var w = box.w - 20;
    var barH = 18;
    var cursor = x;
    outcomes.forEach(function (item) {
      var width = w * result.selected.outcomes[item.key];
      ctx.fillStyle = item.color;
      ctx.fillRect(cursor, y, width, barH);
      cursor += width;
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, w, barH);
    var yy = y + 42;
    outcomes.forEach(function (item) {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, yy - 6, 10, 10);
      label(ctx, item.label + " " + formatPct(result.selected.outcomes[item.key]), x + 16, yy, "left", COLORS.text);
      yy += 19;
    });
  }

  function drawProbabilityPanel(ctx, result, box) {
    panelTitle(ctx, box, "Fill and adverse selection", "conditional adverse share rises when only strong waves reach you");
    var plot = { x: box.x + 46, y: box.y + 52, w: box.w - 70, h: box.h - 84 };
    drawAxis(ctx, plot);
    function sx(row) { return plot.x + row.position / 100 * plot.w; }
    function sy(v) { return plot.y + plot.h - v * plot.h; }
    for (var i = 1; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    line(ctx, result.curve, sx, function (row) { return sy(row.fillRate); }, COLORS.fill, 2.4);
    line(ctx, result.curve, sx, function (row) { return sy(row.adverseFillRate); }, COLORS.adverse, 2);
    label(ctx, "100%", plot.x - 7, plot.y, "right");
    label(ctx, "0%", plot.x - 7, plot.y + plot.h, "right");
    label(ctx, "fill probability", plot.x + 8, plot.y + 16, "left", COLORS.fill);
    label(ctx, "adverse | filled", plot.x + 8, plot.y + 34, "left", COLORS.adverse);
  }

  function drawTracePanel(ctx, result, box) {
    panelTitle(ctx, box, "One order life", "queue ahead versus opposite-side depth");
    var trace = result.trace.trace || [];
    var plot = { x: box.x + 46, y: box.y + 52, w: box.w - 70, h: box.h - 84 };
    drawAxis(ctx, plot);
    if (!trace.length) return;
    var maxT = Math.max.apply(null, trace.map(function (row) { return row.event; }));
    var maxDepth = Math.max.apply(null, trace.map(function (row) { return Math.max(row.ahead, row.ask); }).concat([1]));
    function sx(row) { return plot.x + row.event / Math.max(1, maxT) * plot.w; }
    function sy(v) { return plot.y + plot.h - v / Math.max(1, maxDepth) * plot.h; }
    line(ctx, trace, sx, function (row) { return sy(row.ahead); }, COLORS.bid, 2.2);
    line(ctx, trace, sx, function (row) { return sy(row.ask); }, COLORS.ask, 2);
    var eventRow = trace.filter(function (row) { return row.outcome && row.outcome !== "markout"; })[0];
    if (eventRow) {
      var ex = sx(eventRow);
      ctx.strokeStyle = eventRow.outcome === "filled" ? COLORS.fill : eventRow.outcome === "missUp" ? COLORS.miss : COLORS.pull;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(ex, plot.y);
      ctx.lineTo(ex, plot.y + plot.h);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, eventRow.outcome, ex + 5, plot.y + 12, "left", ctx.strokeStyle);
    }
    label(ctx, "queue ahead", plot.x + 8, plot.y + 16, "left", COLORS.bid);
    label(ctx, "ask depth", plot.x + 8, plot.y + 34, "left", COLORS.ask);
    label(ctx, "events", plot.x + plot.w, plot.y + plot.h + 18, "right");
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 680;
    var height = compact ? 920 : 650;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var gap = compact ? 22 : 26;
    var boxW = compact ? width - 24 : (width - 36 - gap) / 2;
    var boxH = compact ? 205 : 280;
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

    drawValuePanel(ctx, result, boxes[0]);
    drawOutcomePanel(ctx, result, boxes[1]);
    drawProbabilityPanel(ctx, result, boxes[2]);
    drawTracePanel(ctx, result, boxes[3]);
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
      askDepth: params.askDepth + " units",
      bidDepth: params.bidDepth + " units",
      cancelRate: params.cancelRate + "%",
      horizon: params.horizon + " events",
      position: params.position + "%",
      pullSpeed: params.pullSpeed + "%",
      toxicity: params.toxicity + "%"
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
        metric("Fill probability", formatPct(result.selected.fillRate)),
        metric("Adverse fills", formatPct(result.selected.adverseFillRate)),
        metric("Maker value", formatTick(result.selected.makerValue)),
        metric("Post vs cross", formatTick(result.selected.implementationEdge)),
        metric("Avg fill time", formatEvents(result.selected.avgFillTime))
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
    global.document.querySelectorAll("[data-queue-position-lab]").forEach(init);
  }

  global.QueuePositionLab = {
    evaluate: evaluate,
    simulateOne: simulateOne
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.QueuePositionLab;
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
