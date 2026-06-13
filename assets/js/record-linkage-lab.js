(function (global) {
  "use strict";

  var COLORS = {
    match: "#0f766e",
    nonmatch: "#be123c",
    review: "#b45309",
    threshold: "#2563eb",
    block: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#edf2f7"
  };
  var FIRST_COMMON = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth"];
  var FIRST_RARE = ["Amara", "Bastien", "Chiara", "Dario", "Elian", "Farah", "Gideon", "Hana", "Ilya", "Jun", "Kaia", "Leona", "Marek", "Nadia", "Oren", "Priya", "Rafi", "Sana", "Talia", "Yara"];
  var LAST_COMMON = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Wilson"];
  var LAST_RARE = ["Adebayo", "Bianchi", "Chowdhury", "Dahl", "Esposito", "Farouk", "Gruber", "Haddad", "Iversen", "Kowalski", "Larsen", "Mensah", "Novak", "Okafor", "Petrov", "Quintero", "Rosen", "Silva", "Tanaka", "Varga"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, values) {
    return values[Math.floor(rng() * values.length)];
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(value < 10 ? 1 : 0) + "%";
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    return value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="linkage-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function mutateString(value, rng, rate) {
    if (rng() > rate || value.length < 3) return value;
    var chars = value.split("");
    var i = Math.floor(rng() * chars.length);
    var alphabet = "abcdefghijklmnopqrstuvwxyz";
    var mode = rng();
    if (mode < 0.34 && chars.length > 3) {
      chars.splice(i, 1);
    } else if (mode < 0.68) {
      chars[i] = alphabet[Math.floor(rng() * alphabet.length)];
    } else if (i < chars.length - 1) {
      var tmp = chars[i];
      chars[i] = chars[i + 1];
      chars[i + 1] = tmp;
    }
    var out = chars.join("");
    return out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
  }

  function mutateZip(zip, rng, rate) {
    if (rng() > rate) return zip;
    var chars = zip.split("");
    var i = Math.floor(rng() * chars.length);
    chars[i] = String(Math.floor(rng() * 10));
    return chars.join("");
  }

  function makeEntity(id, rng, params) {
    var common = rng() < params.commonNames / 100;
    var region = Math.floor(rng() * 12);
    var zip = String(10000 + region * 700 + Math.floor(rng() * 500)).padStart(5, "0");
    return {
      entityId: "E" + id,
      first: pick(rng, common ? FIRST_COMMON : FIRST_RARE),
      last: pick(rng, common ? LAST_COMMON : LAST_RARE),
      zip: zip,
      year: 1945 + Math.floor(rng() * 58)
    };
  }

  function dirtyCopy(entity, rng, params, side) {
    var rate = params.errorRate / 100;
    var record = {
      id: side + entity.entityId,
      entityId: entity.entityId,
      first: mutateString(entity.first, rng, rate),
      last: mutateString(entity.last, rng, rate),
      zip: mutateZip(entity.zip, rng, rate * 0.75),
      year: entity.year
    };
    if (rng() < rate * 0.55) record.year += rng() < 0.5 ? -1 : 1;
    return record;
  }

  function makeData(params) {
    var rng = makeRng(7301 + params.overlap * 101 + params.errorRate * 337 + params.commonNames * 17 + params.blocking * 19);
    var nA = 150;
    var matches = Math.round(nA * params.overlap / 100);
    var nUniqueB = 55;
    var entities = [];
    var a = [];
    var b = [];
    var i;

    for (i = 0; i < nA + nUniqueB + 20; i += 1) {
      entities.push(makeEntity(i, rng, params));
    }
    for (i = 0; i < nA; i += 1) {
      a.push(dirtyCopy(entities[i], rng, params, "A"));
    }
    for (i = 0; i < matches; i += 1) {
      b.push(dirtyCopy(entities[i], rng, params, "B"));
    }
    for (i = 0; i < nUniqueB; i += 1) {
      b.push(dirtyCopy(entities[nA + i], rng, params, "B"));
    }
    for (i = b.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = b[i];
      b[i] = b[j];
      b[j] = tmp;
    }
    return { a: a, b: b, trueLinks: matches };
  }

  function editDistance(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    var prev = [];
    var curr = [];
    var i;
    for (i = 0; i <= b.length; i += 1) prev[i] = i;
    for (i = 1; i <= a.length; i += 1) {
      curr[0] = i;
      for (var j = 1; j <= b.length; j += 1) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[b.length];
  }

  function stringSimilarity(a, b) {
    if (a === b) return 1;
    var maxLen = Math.max(a.length, b.length, 1);
    var base = 1 - editDistance(a, b) / maxLen;
    var prefix = 0;
    for (var i = 0; i < Math.min(4, a.length, b.length); i += 1) {
      if (a.charAt(i).toLowerCase() === b.charAt(i).toLowerCase()) prefix += 1;
      else break;
    }
    return clamp(base + prefix * 0.03 * (1 - base), 0, 1);
  }

  function weight(m, u) {
    return Math.log(m / u);
  }

  function nameWeight(sim, field) {
    var exact = field === "last" ? [0.86, 0.015] : [0.82, 0.020];
    var close = field === "last" ? [0.10, 0.030] : [0.13, 0.040];
    var weak = field === "last" ? [0.03, 0.100] : [0.04, 0.120];
    var miss = field === "last" ? [0.01, 0.855] : [0.01, 0.820];
    if (sim >= 0.985) return weight(exact[0], exact[1]);
    if (sim >= 0.90) return weight(close[0], close[1]);
    if (sim >= 0.78) return weight(weak[0], weak[1]);
    return weight(miss[0], miss[1]);
  }

  function compareRecords(a, b) {
    var firstSim = stringSimilarity(a.first, b.first);
    var lastSim = stringSimilarity(a.last, b.last);
    var zipScore;
    if (a.zip === b.zip) zipScore = weight(0.90, 0.010);
    else if (a.zip.slice(0, 3) === b.zip.slice(0, 3)) zipScore = weight(0.08, 0.060);
    else zipScore = weight(0.02, 0.930);

    var yearScore;
    var gap = Math.abs(a.year - b.year);
    if (gap === 0) yearScore = weight(0.94, 0.015);
    else if (gap === 1) yearScore = weight(0.04, 0.030);
    else yearScore = weight(0.02, 0.955);

    return {
      firstSim: firstSim,
      lastSim: lastSim,
      score: nameWeight(firstSim, "first") + nameWeight(lastSim, "last") + zipScore + yearScore,
      zipAgree: a.zip === b.zip,
      yearAgree: gap === 0
    };
  }

  function sameBlock(a, b, mode) {
    if (mode === 0) return true;
    if (mode === 1) return a.last.charAt(0) === b.last.charAt(0) || a.zip.slice(0, 3) === b.zip.slice(0, 3);
    if (mode === 2) return a.last.charAt(0) === b.last.charAt(0) && a.zip.slice(0, 2) === b.zip.slice(0, 2);
    return a.last.slice(0, 2).toLowerCase() === b.last.slice(0, 2).toLowerCase() && a.zip.slice(0, 3) === b.zip.slice(0, 3);
  }

  function blockingLabel(mode) {
    if (mode === 0) return "none";
    if (mode === 1) return "loose";
    if (mode === 2) return "balanced";
    return "strict";
  }

  function scorePairs(data, params) {
    var pairs = [];
    var candidateTrue = 0;
    for (var i = 0; i < data.a.length; i += 1) {
      for (var j = 0; j < data.b.length; j += 1) {
        var left = data.a[i];
        var right = data.b[j];
        var truth = left.entityId === right.entityId;
        if (!sameBlock(left, right, params.blocking)) continue;
        var cmp = compareRecords(left, right);
        if (truth) candidateTrue += 1;
        pairs.push({
          a: i,
          b: j,
          firstSim: cmp.firstSim,
          lastSim: cmp.lastSim,
          left: left,
          right: right,
          score: cmp.score,
          truth: truth,
          zipAgree: cmp.zipAgree,
          yearAgree: cmp.yearAgree
        });
      }
    }
    return { candidateTrue: candidateTrue, pairs: pairs };
  }

  function resolvePairs(scored, data, params) {
    var sorted = scored.pairs.slice().sort(function (x, y) { return y.score - x.score; });
    var usedA = {};
    var usedB = {};
    var selected = [];
    var review = [];
    sorted.forEach(function (pair) {
      if (pair.score >= params.threshold && !usedA[pair.a] && !usedB[pair.b]) {
        usedA[pair.a] = true;
        usedB[pair.b] = true;
        selected.push(pair);
      } else if (pair.score >= params.threshold - params.reviewBand && pair.score < params.threshold) {
        review.push(pair);
      }
    });

    var tp = selected.filter(function (pair) { return pair.truth; }).length;
    var fp = selected.length - tp;
    var fn = data.trueLinks - tp;
    var reviewTrue = review.filter(function (pair) { return pair.truth; }).length;
    var precision = selected.length ? tp / selected.length : 1;
    var recall = data.trueLinks ? tp / data.trueLinks : 1;
    var f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    return {
      f1: f1,
      fn: fn,
      fp: fp,
      precision: precision,
      recall: recall,
      review: review,
      reviewTrue: reviewTrue,
      selected: selected,
      tp: tp
    };
  }

  function evaluate(params) {
    var data = makeData(params);
    var scored = scorePairs(data, params);
    var resolved = resolvePairs(scored, data, params);
    var allPairs = data.a.length * data.b.length;
    var matchScores = scored.pairs.filter(function (pair) { return pair.truth; }).map(function (pair) { return pair.score; });
    var nonmatchScores = scored.pairs.filter(function (pair) { return !pair.truth; }).map(function (pair) { return pair.score; });
    var candidateRecall = data.trueLinks ? scored.candidateTrue / data.trueLinks : 1;
    var reduction = 1 - scored.pairs.length / allPairs;

    return {
      allPairs: allPairs,
      candidateRecall: candidateRecall,
      comparedPairs: scored.pairs.length,
      data: data,
      matchScores: matchScores,
      nonmatchScores: nonmatchScores,
      reduction: reduction,
      resolved: resolved,
      scored: scored
    };
  }

  function sweepThreshold(result, params) {
    var out = [];
    for (var threshold = -4; threshold <= 18; threshold += 0.5) {
      var next = Object.assign({}, params, { threshold: threshold });
      var resolved = resolvePairs(result.scored, result.data, next);
      out.push({
        f1: resolved.f1,
        precision: resolved.precision,
        recall: resolved.recall,
        threshold: threshold
      });
    }
    return out;
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, box) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
  }

  function histogram(values, min, max, bins) {
    var counts = Array(bins).fill(0);
    values.forEach(function (value) {
      var index = clamp(Math.floor((value - min) / (max - min) * bins), 0, bins - 1);
      counts[index] += 1;
    });
    return counts;
  }

  function drawScorePanel(ctx, result, params, box) {
    panelTitle(ctx, box, "Score distributions", "true links versus candidate non-links");
    var plot = { x: box.x + 40, y: box.y + 42, w: box.w - 52, h: box.h - 70 };
    var scores = result.matchScores.concat(result.nonmatchScores, [params.threshold, params.threshold - params.reviewBand]);
    var min = Math.min.apply(null, scores);
    var max = Math.max.apply(null, scores);
    if (max === min) max += 1;
    min = Math.floor(min - 1);
    max = Math.ceil(max + 1);
    var bins = 34;
    var mHist = histogram(result.matchScores, min, max, bins);
    var uHist = histogram(result.nonmatchScores, min, max, bins);
    var maxCount = Math.max.apply(null, mHist.concat(uHist, [1]));
    var barW = plot.w / bins;

    drawAxis(ctx, plot);
    for (var i = 0; i < bins; i += 1) {
      var x = plot.x + i * barW;
      var uH = plot.h * uHist[i] / maxCount;
      var mH = plot.h * mHist[i] / maxCount;
      ctx.fillStyle = "rgba(190,18,60,0.28)";
      ctx.fillRect(x + 1, plot.y + plot.h - uH, Math.max(1, barW - 2), uH);
      ctx.fillStyle = "rgba(15,118,110,0.62)";
      ctx.fillRect(x + 1, plot.y + plot.h - uH - mH, Math.max(1, barW - 2), mH);
    }

    function xScale(score) {
      return plot.x + (score - min) / (max - min) * plot.w;
    }
    var reviewX = xScale(params.threshold - params.reviewBand);
    var thresholdX = xScale(params.threshold);
    ctx.fillStyle = "rgba(180,83,9,0.12)";
    ctx.fillRect(reviewX, plot.y, Math.max(0, thresholdX - reviewX), plot.h);
    ctx.strokeStyle = COLORS.review;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(reviewX, plot.y);
    ctx.lineTo(reviewX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.threshold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(thresholdX, plot.y);
    ctx.lineTo(thresholdX, plot.y + plot.h);
    ctx.stroke();

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [min, (min + max) / 2, max].forEach(function (tick) {
      ctx.fillText(formatNumber(tick), xScale(tick), plot.y + plot.h + 12);
    });
    ctx.textAlign = "right";
    ctx.fillText("pairs", plot.x - 8, plot.y + 8);
    ctx.textAlign = "left";
  }

  function drawBlockingPanel(ctx, result, params, box) {
    panelTitle(ctx, box, "Blocking budget", "candidate generation before scoring");
    var plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 58 };
    var rows = [
      { label: "all possible", value: result.allPairs, color: COLORS.rule },
      { label: "compared", value: result.comparedPairs, color: COLORS.block },
      { label: "true links", value: result.data.trueLinks, color: COLORS.match },
      { label: "survive block", value: result.scored.candidateTrue, color: COLORS.threshold }
    ];
    var maxValue = Math.max.apply(null, rows.map(function (row) { return row.value; }));

    rows.forEach(function (row, index) {
      var y = plot.y + index * 34;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(row.label, plot.x, y + 11);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 88, y, plot.w - 140, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 88, y, (plot.w - 140) * row.value / maxValue, 18);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row.value.toLocaleString(), plot.x + plot.w, y + 12);
      ctx.textAlign = "left";
    });

    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(result.candidateRecall * 100), plot.x, plot.y + plot.h - 38);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("candidate recall at " + blockingLabel(params.blocking) + " blocking", plot.x + 78, plot.y + plot.h - 30);
  }

  function drawConfusionPanel(ctx, result, box) {
    panelTitle(ctx, box, "Resolution ledger", "after threshold and one-to-one assignment");
    var resolved = result.resolved;
    var plot = { x: box.x, y: box.y + 46, w: box.w, h: box.h - 58 };
    var cells = [
      { label: "true links kept", value: resolved.tp, color: COLORS.match },
      { label: "false links", value: resolved.fp, color: COLORS.nonmatch },
      { label: "missed links", value: resolved.fn, color: COLORS.review },
      { label: "true links in review", value: resolved.reviewTrue, color: COLORS.threshold }
    ];
    var maxValue = Math.max.apply(null, cells.map(function (cell) { return cell.value; }).concat([1]));
    cells.forEach(function (cell, index) {
      var col = index % 2;
      var row = Math.floor(index / 2);
      var x = plot.x + col * (plot.w / 2 + 8);
      var y = plot.y + row * 78;
      var w = plot.w / 2 - 12;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(x, y, w, 58);
      ctx.fillStyle = cell.color;
      ctx.fillRect(x, y + 48, w * cell.value / maxValue, 6);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(cell.label, x + 10, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(String(cell.value), x + 10, y + 40);
    });
  }

  function drawSweepPanel(ctx, result, params, box) {
    panelTitle(ctx, box, "Threshold sweep", "precision, recall, and F1 reuse the same scored candidates");
    var points = sweepThreshold(result, params);
    var plot = { x: box.x + 42, y: box.y + 42, w: box.w - 56, h: box.h - 72 };
    drawAxis(ctx, plot);
    function xScale(threshold) {
      return plot.x + (threshold + 4) / 22 * plot.w;
    }
    function yScale(value) {
      return plot.y + plot.h - clamp(value, 0, 1) * plot.h;
    }
    [0, 0.5, 1].forEach(function (tick) {
      var y = yScale(tick);
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(formatPercent(tick * 100), plot.x - 8, y + 4);
    });

    [
      { key: "precision", color: COLORS.nonmatch },
      { key: "recall", color: COLORS.match },
      { key: "f1", color: COLORS.threshold }
    ].forEach(function (series) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = series.key === "f1" ? 2.7 : 1.8;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var x = xScale(point.threshold);
        var y = yScale(point[series.key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    var currentX = xScale(params.threshold);
    ctx.strokeStyle = COLORS.threshold;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [-4, 7, 18].forEach(function (tick) {
      ctx.fillText(String(tick), xScale(tick), plot.y + plot.h + 12);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 880 : 650;
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

    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawScorePanel(ctx, result, params, { x: margin, y: 26, w: panelW, h: 230 });
      drawBlockingPanel(ctx, result, params, { x: margin, y: 288, w: panelW, h: 190 });
      drawConfusionPanel(ctx, result, { x: margin, y: 512, w: panelW, h: 170 });
      drawSweepPanel(ctx, result, params, { x: margin, y: 712, w: panelW, h: 140 });
    } else {
      var gap = 42;
      var topW = (width - margin * 2 - gap) / 2;
      drawScorePanel(ctx, result, params, { x: margin, y: 28, w: topW, h: 290 });
      drawBlockingPanel(ctx, result, params, { x: margin + topW + gap, y: 28, w: topW, h: 290 });
      drawConfusionPanel(ctx, result, { x: margin, y: 366, w: topW, h: 224 });
      drawSweepPanel(ctx, result, params, { x: margin + topW + gap, y: 366, w: topW, h: 224 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = evaluate(params);
    var values = {
      blocking: blockingLabel(params.blocking),
      commonNames: formatPercent(params.commonNames),
      errorRate: formatPercent(params.errorRate),
      overlap: formatPercent(params.overlap),
      reviewBand: formatNumber(params.reviewBand),
      threshold: formatNumber(params.threshold)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Precision", formatPercent(result.resolved.precision * 100)),
        metric("Recall", formatPercent(result.resolved.recall * 100)),
        metric("Candidate recall", formatPercent(result.candidateRecall * 100)),
        metric("Pair reduction", formatPercent(result.reduction * 100)),
        metric("Review pairs", result.resolved.review.length.toLocaleString()),
        metric("False links", String(result.resolved.fp))
      ].join("");
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result, params);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-linkage-lab]")).forEach(init);
  }

  var api = {
    compareRecords: compareRecords,
    evaluate: evaluate,
    sweepThreshold: sweepThreshold
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.RecordLinkageLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
