(function (global) {
  "use strict";

  var POLICIES = ["massed", "fixed", "leitner", "halflife"];
  var HORIZONS = [45, 90, 180];
  var NEW_PER_DAY = [2, 4, 6];
  var BUDGETS = [10, 18, 30];
  var TARGETS = [0.7, 0.8, 0.9];
  var LEITNER_INTERVALS = [1, 3, 7, 14, 30, 60];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    massed: "#172026",
    fixed: "#7c3aed",
    leitner: "#2563eb",
    halflife: "#0f766e",
    debt: "#d97706",
    bad: "#be123c",
    background: "#ffffff"
  };

  var POLICY_LABELS = {
    massed: "Massed",
    fixed: "Fixed",
    leitner: "Leitner",
    halflife: "Half-life"
  };

  function nearestAllowed(value, allowed, fallback) {
    var raw = Number(value);
    if (!isFinite(raw)) return fallback;
    var best = allowed[0];
    var bestDistance = Infinity;
    allowed.forEach(function (candidate) {
      var distance = Math.abs(candidate - raw);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best == null ? fallback : best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var highlight = String(raw.highlight || "halflife");
    if (POLICIES.indexOf(highlight) < 0) highlight = "halflife";
    return {
      horizon: nearestAllowed(raw.horizon == null ? 90 : raw.horizon, HORIZONS, 90),
      newPerDay: nearestAllowed(raw.newPerDay == null ? 4 : raw.newPerDay, NEW_PER_DAY, 4),
      budget: nearestAllowed(raw.budget == null ? 18 : raw.budget, BUDGETS, 18),
      target: nearestAllowed(raw.target == null ? 0.8 : raw.target, TARGETS, 0.8),
      highlight: highlight
    };
  }

  function hashString(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      var t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function makeDeck(params) {
    var count = params.horizon * params.newPerDay;
    var deck = [];
    for (var i = 0; i < count; i += 1) {
      var wave = Math.sin((i + 1) * 1.91) + 0.45 * Math.cos((i + 3) * 0.61);
      var difficulty = clamp(1 + 0.26 * wave + (i % 7 === 0 ? 0.18 : 0), 0.62, 1.58);
      deck.push({
        id: i,
        difficulty: difficulty,
        introduced: Math.floor(i / params.newPerDay)
      });
    }
    return deck;
  }

  function cloneForPolicy(base, policy) {
    return base.map(function (item) {
      return {
        id: item.id,
        difficulty: item.difficulty,
        introduced: item.introduced,
        halfLife: 0.78 / item.difficulty,
        lastReview: null,
        reviewCount: 0,
        due: item.introduced,
        box: 0,
        active: false,
        doneMassed: false,
        policy: policy
      };
    });
  }

  function recallProbability(item, day) {
    if (item.lastReview === null) return 0;
    var elapsed = Math.max(0, day - item.lastReview);
    return Math.pow(2, -elapsed / Math.max(item.halfLife, 0.05));
  }

  function intervalForTarget(halfLife, target) {
    return Math.max(1, halfLife * Math.log(target) / Math.log(0.5));
  }

  function fixedInterval(params) {
    if (params.horizon <= 45) return 5;
    if (params.horizon <= 90) return 9;
    return 16;
  }

  function updateAfterReview(item, day, remembered, predicted, policy, params) {
    var effort = Math.pow(clamp(1 - predicted, 0.02, 0.98), 0.72);
    var difficultyDiscount = 1 / Math.sqrt(item.difficulty);
    var multiplier = remembered
      ? 1 + 1.55 * effort * difficultyDiscount + 0.08 * Math.log(item.reviewCount + 2)
      : 1 + 0.45 * difficultyDiscount + 0.05 * Math.log(item.reviewCount + 2);
    item.halfLife = clamp(item.halfLife * multiplier + (remembered ? 0.08 : 0.02), 0.08, 220);
    item.lastReview = day;
    item.reviewCount += 1;

    if (policy === "massed") {
      item.due = item.reviewCount < 4 && day - item.introduced < 6 ? day + 1 : Infinity;
      item.doneMassed = item.due === Infinity;
    } else if (policy === "fixed") {
      item.due = day + fixedInterval(params);
    } else if (policy === "leitner") {
      item.box = remembered ? Math.min(LEITNER_INTERVALS.length - 1, item.box + 1) : Math.max(0, item.box - 1);
      item.due = day + LEITNER_INTERVALS[item.box];
    } else {
      item.due = day + Math.ceil(intervalForTarget(item.halfLife, params.target));
    }
  }

  function priority(item, day, policy, params) {
    if (!item.active || item.due > day) return -Infinity;
    if (policy === "massed") return 10000 - item.reviewCount * 100 - item.id;
    var predicted = recallProbability(item, day);
    if (policy === "halflife") return (params.target - predicted) * 1000 + (day - item.due) * 5 - item.difficulty;
    if (policy === "leitner") return (day - item.due) * 10 + (1 - predicted) * 100 - item.box;
    return (day - item.due) * 10 + (1 - predicted) * 50;
  }

  function chooseDue(items, day, policy, params, budgetLeft) {
    return items
      .filter(function (item) { return item.active && item.due <= day && item.reviewCount > 0; })
      .sort(function (a, b) { return priority(b, day, policy, params) - priority(a, day, policy, params); })
      .slice(0, budgetLeft);
  }

  function introduceItems(items, day, params, budgetLeft) {
    return items
      .filter(function (item) { return !item.active && item.introduced <= day; })
      .sort(function (a, b) { return a.id - b.id; })
      .slice(0, budgetLeft);
  }

  function summarizeDay(items, day, target) {
    var active = items.filter(function (item) { return item.active; });
    if (!active.length) {
      return { active: 0, meanRecall: 1, aboveTarget: 1, dueDebt: 0, p10: 1 };
    }
    var recalls = active.map(function (item) { return recallProbability(item, day); }).sort(function (a, b) { return a - b; });
    var total = recalls.reduce(function (sum, value) { return sum + value; }, 0);
    var above = recalls.filter(function (value) { return value >= target; }).length;
    var debt = active.filter(function (item) { return item.due <= day && recallProbability(item, day) < target; }).length;
    var p10Index = Math.min(recalls.length - 1, Math.floor(recalls.length * 0.1));
    return {
      active: active.length,
      meanRecall: total / active.length,
      aboveTarget: above / active.length,
      dueDebt: debt,
      p10: recalls[p10Index]
    };
  }

  function runPolicy(policy, params, baseDeck) {
    var rng = mulberry32(hashString(policy + ":" + params.horizon + ":" + params.newPerDay + ":" + params.budget + ":" + params.target));
    var items = cloneForPolicy(baseDeck, policy);
    var daily = [];
    var reviews = 0;
    var correct = 0;
    var tooEasy = 0;
    var tooLate = 0;
    var newSeen = 0;
    var missedDue = 0;

    for (var day = 0; day < params.horizon; day += 1) {
      var budgetLeft = params.budget;
      var reviewedToday = 0;
      var dueAtStart = items.filter(function (item) { return item.active && item.due <= day && item.reviewCount > 0; }).length;
      var dueItems = chooseDue(items, day, policy, params, budgetLeft);
      dueItems.forEach(function (item) {
        var predicted = recallProbability(item, day);
        var remembered = rng() < predicted;
        if (remembered) correct += 1;
        if (predicted > 0.93) tooEasy += 1;
        if (predicted < 0.35) tooLate += 1;
        updateAfterReview(item, day, remembered, predicted, policy, params);
        reviews += 1;
        reviewedToday += 1;
        budgetLeft -= 1;
      });

      var newItems = introduceItems(items, day, params, budgetLeft);
      newItems.forEach(function (item) {
        item.active = true;
        item.lastReview = day;
        item.reviewCount = 1;
        item.halfLife = 0.9 / item.difficulty;
        item.box = 0;
        item.due = policy === "massed" ? day + 1 : policy === "fixed" ? day + fixedInterval(params) : policy === "leitner" ? day + 1 : day + Math.ceil(intervalForTarget(item.halfLife, params.target));
        reviews += 1;
        correct += 1;
        newSeen += 1;
        reviewedToday += 1;
        budgetLeft -= 1;
      });

      missedDue += Math.max(0, dueAtStart - dueItems.length);
      var summary = summarizeDay(items, day, params.target);
      daily.push({
        day: day,
        reviews: reviewedToday,
        active: summary.active,
        meanRecall: summary.meanRecall,
        aboveTarget: summary.aboveTarget,
        dueDebt: summary.dueDebt,
        p10: summary.p10
      });
    }

    var final = summarizeDay(items, params.horizon, params.target);
    var reviewedItems = items.filter(function (item) { return item.active; });
    var finalRecalls = reviewedItems.map(function (item) { return recallProbability(item, params.horizon); }).sort(function (a, b) { return a - b; });
    return {
      policy: policy,
      label: POLICY_LABELS[policy],
      daily: daily,
      final: final,
      items: reviewedItems,
      finalRecalls: finalRecalls,
      reviews: reviews,
      correct: correct,
      accuracy: reviews ? correct / reviews : 0,
      tooEasy: tooEasy,
      tooLate: tooLate,
      newSeen: newSeen,
      missedDue: missedDue,
      averageReviews: reviews / params.horizon
    };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var baseDeck = makeDeck(params);
    var policies = {};
    POLICIES.forEach(function (policy) {
      policies[policy] = runPolicy(policy, params, baseDeck);
    });
    var best = POLICIES.slice().sort(function (a, b) {
      return policies[b].final.meanRecall - policies[a].final.meanRecall;
    })[0];
    return {
      params: params,
      policies: policies,
      best: best,
      highlight: policies[params.highlight]
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, tone) {
    var klass = "spacing-lab__metric";
    if (tone) klass += " spacing-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input) input.value = String(params[key]);
    });
  }

  function renderMetrics(root, data) {
    var h = data.highlight;
    var best = data.policies[data.best];
    var html = [
      metric("Best final recall", best.label + " " + formatPercent(best.final.meanRecall), "good"),
      metric("Highlighted recall", formatPercent(h.final.meanRecall), h.final.meanRecall >= data.params.target ? "good" : "warn"),
      metric("Above target", formatPercent(h.final.aboveTarget), h.final.aboveTarget > 0.75 ? "good" : "warn"),
      metric("Reviews / day", formatNumber(h.averageReviews, 1)),
      metric("Too easy", String(h.tooEasy), h.tooEasy > h.reviews * 0.2 ? "warn" : ""),
      metric("Too late", String(h.tooLate), h.tooLate > h.reviews * 0.2 ? "bad" : ""),
      metric("Review debt", String(h.missedDue), h.missedDue ? "warn" : "good"),
      metric("Cards introduced", String(h.newSeen))
    ].join("");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = html;
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 400) + " " + size + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
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

  function fillPanel(ctx, x, y, w, h) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  function drawLine(ctx, points, color, width, dash) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(ctx, x, y, title, subtitle) {
    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(title, x, y);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtitle, x, y + 19);
  }

  function drawRetentionChart(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    drawTitle(ctx, x + 18, y + 28, "Recall over time", "mean predicted recall across introduced cards");

    var px = x + 50;
    var py = y + 76;
    var pw = w - 78;
    var ph = h - 125;

    function sx(day) {
      return px + day / Math.max(1, data.params.horizon - 1) * pw;
    }

    function sy(value) {
      return py + ph - value * ph;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    setFont(ctx, 11, 500);
    ctx.fillStyle = COLORS.muted;
    for (var gy = 0; gy <= 4; gy += 1) {
      var value = gy / 4;
      var yy = sy(value);
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
      ctx.fillText(formatPercent(value, 0), x + 14, yy + 4);
    }

    var targetY = sy(data.params.target);
    ctx.strokeStyle = "rgba(15, 118, 110, 0.42)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, targetY);
    ctx.lineTo(px + pw, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.halflife;
    setFont(ctx, 11, 650);
    ctx.fillText("target", px + pw - 42, targetY - 6);

    POLICIES.forEach(function (policy) {
      var result = data.policies[policy];
      var color = COLORS[policy];
      var width = policy === data.params.highlight ? 3.4 : 1.9;
      var points = result.daily.map(function (row) {
        return { x: sx(row.day), y: sy(row.meanRecall) };
      });
      drawLine(ctx, points, color, width, policy === "fixed" ? [6, 4] : null);
    });

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    var lx = x + 18;
    var ly = y + h - 36;
    POLICIES.forEach(function (policy) {
      ctx.strokeStyle = COLORS[policy];
      ctx.lineWidth = policy === data.params.highlight ? 4 : 2.4;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 22, ly);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      setFont(ctx, 12, 650);
      ctx.fillText(POLICY_LABELS[policy], lx + 29, ly + 4);
      lx += policy === "halflife" ? 104 : 94;
    });
  }

  function drawWorkloadChart(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    drawTitle(ctx, x + 18, y + 28, "Review workload", "bars are highlighted policy; orange is due debt");

    var result = data.highlight;
    var px = x + 44;
    var py = y + 72;
    var pw = w - 74;
    var ph = h - 110;
    var maxY = Math.max(data.params.budget, result.daily.reduce(function (m, row) { return Math.max(m, row.dueDebt); }, 0));
    var stride = Math.max(1, Math.ceil(result.daily.length / 56));

    function sx(index) {
      return px + index / Math.max(1, result.daily.length - 1) * pw;
    }

    function sy(value) {
      return py + ph - value / Math.max(1, maxY) * ph;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 3; gy += 1) {
      var yy = sy(maxY * gy / 3);
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
    }

    result.daily.forEach(function (row, index) {
      if (index % stride !== 0) return;
      var xx = sx(index);
      var nextX = sx(Math.min(result.daily.length - 1, index + stride));
      var bw = Math.max(2, nextX - xx - 1);
      ctx.fillStyle = COLORS[data.params.highlight];
      ctx.fillRect(xx, sy(row.reviews), bw, py + ph - sy(row.reviews));
      if (row.dueDebt > 0) {
        ctx.fillStyle = "rgba(217, 119, 6, 0.65)";
        ctx.fillRect(xx, sy(row.dueDebt), bw, py + ph - sy(row.dueDebt));
      }
    });

    var budgetY = sy(data.params.budget);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, budgetY);
    ctx.lineTo(px + pw, budgetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    setFont(ctx, 11, 600);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("day 0", px, py + ph + 20);
    ctx.fillText("day " + data.params.horizon, px + pw - 48, py + ph + 20);
  }

  function drawFinalPanel(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    drawTitle(ctx, x + 18, y + 28, "Final exam day", "retention, effort, and badly timed reviews");

    var rows = POLICIES.map(function (policy) {
      return data.policies[policy];
    });
    var left = x + 18;
    var top = y + 74;
    var barW = w - 180;
    var rowH = 38;
    rows.forEach(function (row, index) {
      var yy = top + index * rowH;
      setFont(ctx, 12, 750);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(row.label, left, yy + 15);
      ctx.fillStyle = "#eef3f7";
      drawRoundRect(ctx, left + 76, yy, barW, 16, 8);
      ctx.fill();
      ctx.fillStyle = COLORS[row.policy];
      drawRoundRect(ctx, left + 76, yy, Math.max(2, barW * row.final.meanRecall), 16, 8);
      ctx.fill();
      setFont(ctx, 11, 650);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(formatPercent(row.final.meanRecall), left + 84 + barW, yy + 13);
      ctx.fillText("late " + row.tooLate + " / easy " + row.tooEasy, left + 76, yy + 32);
    });

    var hrow = data.highlight;
    setFont(ctx, 12, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Highlighted policy", x + 18, y + h - 78);
    setFont(ctx, 12, 550);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(
      hrow.label + ": " + hrow.newSeen + " cards, " + hrow.reviews + " reviews, " + formatPercent(hrow.accuracy) + " review accuracy",
      x + 18,
      y + h - 52
    );
    ctx.fillText("Mean final recall " + formatPercent(hrow.final.meanRecall) + "; bottom-decile recall " + formatPercent(hrow.final.p10), x + 18, y + h - 30);
  }

  function drawLab(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRetentionChart(ctx, data, { x: 18, y: 18, w: 864, h: 330 });
    drawWorkloadChart(ctx, data, { x: 18, y: 368, w: 420, h: 314 });
    drawFinalPanel(ctx, data, { x: 458, y: 368, w: 424, h: 314 });
  }

  function init(root) {
    if (root.__spacedRepetitionInitialized) return;
    root.__spacedRepetitionInitialized = true;

    var canvas = root.querySelector("[data-canvas]");
    var scheduled = false;

    function render() {
      scheduled = false;
      var data = simulate(paramsFromRoot(root));
      updateControls(root, data.params);
      renderMetrics(root, data);
      drawLab(canvas, data);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      if (global.requestAnimationFrame) global.requestAnimationFrame(render);
      else setTimeout(render, 0);
    }

    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("change", schedule);
      input.addEventListener("input", schedule);
    });
    schedule();
  }

  var api = {
    cleanParams: cleanParams,
    simulate: simulate,
    runPolicy: runPolicy,
    recallProbability: recallProbability,
    intervalForTarget: intervalForTarget
  };

  global.SpacedRepetitionLab = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    var boot = function () {
      global.document.querySelectorAll("[data-spaced-repetition-lab]").forEach(init);
    };
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
