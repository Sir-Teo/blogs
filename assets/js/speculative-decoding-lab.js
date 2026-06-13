(function () {
  var COLORS = {
    accepted: "#0f766e",
    bad: "#be123c",
    baseline: "#64748b",
    draft: "#2563eb",
    overhead: "#475569",
    selected: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    verify: "#b45309",
    waste: "#94a3b8"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits);
  }

  function formatMs(value) {
    if (value >= 100) return value.toFixed(0) + " ms";
    return value.toFixed(1) + " ms";
  }

  function expectedAccepted(probability, lookahead) {
    var total = 0;
    var power = probability;
    for (var i = 1; i <= lookahead; i += 1) {
      total += power;
      power *= probability;
    }
    return total;
  }

  function evaluate(params, overrideLookahead, overrideAcceptance) {
    var lookahead = overrideLookahead || params.lookahead;
    var probability = typeof overrideAcceptance === "number" ? overrideAcceptance : params.acceptance / 100;
    var accepted = expectedAccepted(probability, lookahead);
    var outputTokens = 1 + accepted;
    var targetMs = params.targetMs;
    var draftMs = lookahead * targetMs * params.draftCost / 100;
    var verifyMs = targetMs * (1 + (lookahead - 1) * params.verifyTax / 100);
    var cycleMs = draftMs + verifyMs + params.overheadMs;
    var msPerToken = cycleMs / outputTokens;
    var speedup = targetMs / msPerToken;
    var wastedDrafts = Math.max(0, lookahead - accepted);
    return {
      accepted: accepted,
      cycleMs: cycleMs,
      draftMs: draftMs,
      lookahead: lookahead,
      msPerToken: msPerToken,
      outputTokens: outputTokens,
      probability: probability,
      speedup: speedup,
      targetMs: targetMs,
      verifyMs: verifyMs,
      overheadMs: params.overheadMs,
      wastedDrafts: wastedDrafts
    };
  }

  function bestLookahead(params) {
    var best = evaluate(params, 1);
    for (var lookahead = 2; lookahead <= 12; lookahead += 1) {
      var candidate = evaluate(params, lookahead);
      if (candidate.speedup > best.speedup) best = candidate;
    }
    return best;
  }

  function metric(label, value) {
    return '<div class="spec-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function mixChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function mixColor(from, to, t) {
    var a = hexToRgb(from);
    var b = hexToRgb(to);
    return "rgb(" + mixChannel(a.r, b.r, t) + "," + mixChannel(a.g, b.g, t) + "," + mixChannel(a.b, b.b, t) + ")";
  }

  function speedColor(speedup) {
    if (speedup < 1) return mixColor("#fff1f2", COLORS.bad, clamp((1 - speedup) / 0.45, 0, 1));
    return mixColor("#ecfdf5", COLORS.accepted, clamp((speedup - 1) / 2.4, 0, 1));
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function drawStack(ctx, x, y, width, height, parts, total) {
    var cursor = x;
    parts.forEach(function (part) {
      var partWidth = total > 0 ? width * part.value / total : 0;
      ctx.fillStyle = part.color;
      ctx.fillRect(cursor, y, partWidth, height);
      if (partWidth > 36) {
        drawLabel(ctx, part.label, cursor + partWidth / 2, y + height / 2, "center", "middle", "#ffffff");
      }
      cursor += partWidth;
    });
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, width, height);
  }

  function drawChart(canvas, params, result, best) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(330, parentWidth);
    var height = width < 560 ? 560 : 520;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var compact = width < 560;
    var left = compact ? 42 : 58;
    var right = compact ? 18 : 34;
    var top = 38;
    var heatWidth = width - left - right;
    var heatHeight = compact ? 220 : 230;
    var columns = 12;
    var rows = 9;
    var cellW = heatWidth / columns;
    var cellH = heatHeight / rows;
    var minP = 0.2;
    var maxP = 1.0;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawLabel(ctx, "Speedup by lookahead and acceptance", left, top - 14, "left", "bottom", COLORS.text);

    for (var row = 0; row < rows; row += 1) {
      var p = maxP - row * (maxP - minP) / (rows - 1);
      for (var col = 0; col < columns; col += 1) {
        var lookahead = col + 1;
        var candidate = evaluate(params, lookahead, p);
        var x = left + col * cellW;
        var y = top + row * cellH;
        ctx.fillStyle = speedColor(candidate.speedup);
        ctx.fillRect(x, y, Math.ceil(cellW), Math.ceil(cellH));
        if (!compact || (lookahead % 2 === 0 && row % 2 === 0)) {
          drawLabel(ctx, formatNumber(candidate.speedup, 1), x + cellW / 2, y + cellH / 2, "center", "middle", candidate.speedup < 0.86 || candidate.speedup > 2.0 ? "#ffffff" : COLORS.text);
        }
      }
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, heatWidth, heatHeight);
    var selectedCol = params.lookahead - 1;
    var selectedRow = Math.round((maxP - params.acceptance / 100) / ((maxP - minP) / (rows - 1)));
    selectedRow = clamp(selectedRow, 0, rows - 1);
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 3;
    ctx.strokeRect(left + selectedCol * cellW + 1.5, top + selectedRow * cellH + 1.5, cellW - 3, cellH - 3);
    ctx.lineWidth = 1;

    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (var tick = 1; tick <= columns; tick += compact ? 2 : 1) {
      drawLabel(ctx, String(tick), left + (tick - 0.5) * cellW, top + heatHeight + 8, "center", "top", COLORS.muted);
    }
    drawLabel(ctx, "lookahead tokens", left + heatWidth / 2, top + heatHeight + 28, "center", "top", COLORS.muted);

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0.2, 0.5, 0.8, 1.0].forEach(function (pTick) {
      var y = top + (maxP - pTick) / (maxP - minP) * heatHeight;
      drawLabel(ctx, Math.round(pTick * 100) + "%", left - 8, y, "right", "middle", COLORS.muted);
    });

    var detailTop = compact ? top + heatHeight + 72 : top + heatHeight + 82;
    var plotW = width - left - right;
    drawLabel(ctx, "Selected cycle ledger", left, detailTop - 18, "left", "bottom", COLORS.text);

    var latencyTotal = result.cycleMs;
    var latencyParts = [
      { label: "draft", value: result.draftMs, color: COLORS.draft },
      { label: "verify", value: result.verifyMs, color: COLORS.verify },
      { label: "overhead", value: result.overheadMs, color: COLORS.overhead }
    ];
    drawLabel(ctx, "cycle latency", left, detailTop + 12, "left", "middle", COLORS.muted);
    drawStack(ctx, left + (compact ? 0 : 118), detailTop + 30, compact ? plotW : plotW - 118, 30, latencyParts, latencyTotal);
    drawLabel(ctx, formatMs(result.cycleMs), width - right, detailTop + 14, "right", "middle", COLORS.text);

    var tokenTop = detailTop + 94;
    var tokenTotal = result.outputTokens + result.wastedDrafts;
    var tokenParts = [
      { label: "accepted", value: result.accepted, color: COLORS.accepted },
      { label: "correction", value: 1, color: COLORS.selected },
      { label: "wasted", value: result.wastedDrafts, color: COLORS.waste }
    ];
    drawLabel(ctx, "draft token fate", left, tokenTop + 12, "left", "middle", COLORS.muted);
    drawStack(ctx, left + (compact ? 0 : 118), tokenTop + 30, compact ? plotW : plotW - 118, 30, tokenParts, tokenTotal);
    drawLabel(ctx, formatNumber(result.outputTokens, 2) + " output", width - right, tokenTop + 14, "right", "middle", COLORS.text);

    var baselineTop = tokenTop + 94;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, baselineTop);
    ctx.lineTo(width - right, baselineTop);
    ctx.stroke();

    drawLabel(ctx, "Baseline target-only cost", left, baselineTop + 28, "left", "middle", COLORS.muted);
    drawLabel(ctx, formatMs(result.targetMs) + " / token", width - right, baselineTop + 28, "right", "middle", COLORS.text);
    drawLabel(ctx, "Best static lookahead at this acceptance: " + best.lookahead + " tokens (" + formatNumber(best.speedup, 2) + "x)", left, baselineTop + 58, "left", "middle", COLORS.text);
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var outputs = {
      lookahead: String(params.lookahead),
      acceptance: params.acceptance + "%",
      draftCost: params.draftCost + "%",
      verifyTax: params.verifyTax + "%",
      targetMs: params.targetMs + " ms",
      overheadMs: params.overheadMs + " ms"
    };
    Object.keys(outputs).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = outputs[key];
    });

    var result = evaluate(params);
    var best = bestLookahead(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Latency speedup", formatNumber(result.speedup, 2) + "x"),
        metric("Expected tokens/call", formatNumber(result.outputTokens, 2)),
        metric("Accepted draft tokens", formatNumber(result.accepted, 2)),
        metric("Wasted draft tokens", formatNumber(result.wastedDrafts, 2)),
        metric("Milliseconds/token", formatMs(result.msPerToken)),
        metric("Best static lookahead", String(best.lookahead))
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, params, result, best);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-spec-lab]").forEach(init);
  });
}());
