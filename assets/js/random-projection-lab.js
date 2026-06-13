(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5c6670",
    rule: "#d7dee5",
    faint: "#f7f8fa",
    gaussian: "#2563eb",
    rademacher: "#be123c",
    sparse: "#0f766e",
    amber: "#d97706",
    violet: "#7c3aed",
    same: "#0f766e",
    cross: "#9ca3af"
  };

  var K_GRID = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 3, seed));
    var u2 = uniform(index * 2 + 4, seed ^ 0xa53a9a5b);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    return value.toFixed(places);
  }

  function formatPercent(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 1 : digits;
    return value.toFixed(places) + "%";
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var idx = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
    return sorted[idx];
  }

  function metric(label, value) {
    return '<div class="rp-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    root.querySelectorAll("select[data-param]").forEach(function (select) {
      params[select.getAttribute("data-param")] = select.value;
    });
    return params;
  }

  function cleanParams(raw) {
    var dimension = clamp(Math.round(raw.dimension || 160), 32, 512);
    var k = clamp(Math.round(raw.k || 32), 4, Math.min(128, dimension));
    var type = raw.type === "gaussian" || raw.type === "rademacher" || raw.type === "sparse" ? raw.type : "rademacher";
    return {
      clusters: 4,
      dimension: dimension,
      gap: clamp(raw.gap || 170, 20, 420) / 100,
      k: k,
      noise: clamp(raw.noise || 80, 20, 180) / 100,
      points: clamp(Math.round(raw.points || 140), 40, 220),
      type: type
    };
  }

  function makeCenters(params) {
    var centers = [];
    for (var c = 0; c < params.clusters; c += 1) {
      var raw = [];
      var norm = 0;
      for (var j = 0; j < params.dimension; j += 1) {
        var v = normal(c * 100003 + j * 17, 0x91e10da5);
        raw.push(v);
        norm += v * v;
      }
      norm = Math.sqrt(norm) || 1;
      centers.push(raw.map(function (v) {
        return params.gap * v / norm;
      }));
    }
    return centers;
  }

  function makeData(params) {
    var centers = makeCenters(params);
    var points = [];
    var labels = [];
    for (var i = 0; i < params.points; i += 1) {
      var label = i % params.clusters;
      var center = centers[label];
      var row = [];
      for (var j = 0; j < params.dimension; j += 1) {
        var noise = params.noise * normal(i * 7001 + j * 101, 0x5eedc0de) / Math.sqrt(params.dimension);
        row.push(center[j] + noise);
      }
      points.push(row);
      labels.push(label);
    }
    return { labels: labels, params: params, points: points };
  }

  function squaredDistance(a, b, length) {
    var sum = 0;
    for (var j = 0; j < length; j += 1) {
      var diff = a[j] - b[j];
      sum += diff * diff;
    }
    return sum;
  }

  function pairLedger(data) {
    var n = data.points.length;
    var nearest = new Array(n);
    var nearestDist = new Array(n);
    var secondDist = new Array(n);
    var pairs = [];
    for (var i = 0; i < n; i += 1) {
      nearest[i] = -1;
      nearestDist[i] = Infinity;
      secondDist[i] = Infinity;
    }
    for (var a = 0; a < n; a += 1) {
      for (var b = a + 1; b < n; b += 1) {
        var dist2 = squaredDistance(data.points[a], data.points[b], data.params.dimension);
        var dist = Math.sqrt(dist2);
        pairs.push({
          a: a,
          b: b,
          dist: dist,
          same: data.labels[a] === data.labels[b]
        });
        if (dist < nearestDist[a]) {
          secondDist[a] = nearestDist[a];
          nearestDist[a] = dist;
          nearest[a] = b;
        } else if (dist < secondDist[a]) {
          secondDist[a] = dist;
        }
        if (dist < nearestDist[b]) {
          secondDist[b] = nearestDist[b];
          nearestDist[b] = dist;
          nearest[b] = a;
        } else if (dist < secondDist[b]) {
          secondDist[b] = dist;
        }
      }
    }
    var margins = nearestDist.map(function (d, i) {
      return secondDist[i] / Math.max(1e-12, d);
    }).sort(function (x, y) { return x - y; });
    return {
      margins: margins,
      medianMargin: quantile(margins, 0.5),
      nearest: nearest,
      nearestDist: nearestDist,
      pairs: pairs
    };
  }

  function projectionEntry(type, sourceDim, targetDim, k, seed) {
    var index = Math.imul(sourceDim + 1, 1000003) ^ Math.imul(targetDim + 1, 9176);
    if (type === "gaussian") {
      return normal(index, seed) / Math.sqrt(k);
    }
    var h = hash32(index, seed);
    if (type === "sparse") {
      var bucket = h % 6;
      if (bucket === 0) return Math.sqrt(3 / k);
      if (bucket === 1) return -Math.sqrt(3 / k);
      return 0;
    }
    return (h & 1 ? 1 : -1) / Math.sqrt(k);
  }

  function project(data, k, type, seed) {
    var rows = [];
    for (var i = 0; i < data.points.length; i += 1) {
      var out = new Array(k);
      for (var r = 0; r < k; r += 1) {
        var sum = 0;
        for (var j = 0; j < data.params.dimension; j += 1) {
          sum += data.points[i][j] * projectionEntry(type, j, r, k, seed);
        }
        out[r] = sum;
      }
      rows.push(out);
    }
    return rows;
  }

  function evaluateProjection(data, ledger, k, type, seed, keepScatter) {
    var projected = project(data, k, type, seed);
    var n = data.points.length;
    var projNearest = new Array(n);
    var projNearestDist = new Array(n);
    var ratios = [];
    var absErrors = [];
    var sameErrors = [];
    var crossErrors = [];
    var scatter = [];
    for (var i = 0; i < n; i += 1) {
      projNearest[i] = -1;
      projNearestDist[i] = Infinity;
    }
    ledger.pairs.forEach(function (pair, idx) {
      var dist = Math.sqrt(squaredDistance(projected[pair.a], projected[pair.b], k));
      var ratio = dist / Math.max(1e-12, pair.dist);
      var abs = Math.abs(ratio - 1);
      ratios.push(ratio);
      absErrors.push(abs);
      if (pair.same) sameErrors.push(abs);
      else crossErrors.push(abs);
      if (dist < projNearestDist[pair.a]) {
        projNearestDist[pair.a] = dist;
        projNearest[pair.a] = pair.b;
      }
      if (dist < projNearestDist[pair.b]) {
        projNearestDist[pair.b] = dist;
        projNearest[pair.b] = pair.a;
      }
      if (keepScatter && scatter.length < 640 && (hash32(idx + k * 97, 0x51f15eed) % 7 === 0)) {
        scatter.push({ original: pair.dist, projected: dist, same: pair.same });
      }
    });
    var preserved = 0;
    var sameClusterPreserved = 0;
    for (var p = 0; p < n; p += 1) {
      if (projNearest[p] === ledger.nearest[p]) preserved += 1;
      if (data.labels[projNearest[p]] === data.labels[ledger.nearest[p]]) sameClusterPreserved += 1;
    }
    absErrors.sort(function (a, b) { return a - b; });
    ratios.sort(function (a, b) { return a - b; });
    sameErrors.sort(function (a, b) { return a - b; });
    crossErrors.sort(function (a, b) { return a - b; });
    return {
      absErrors: absErrors,
      crossP90: quantile(crossErrors, 0.9),
      histogram: ratioHistogram(ratios),
      medianAbs: quantile(absErrors, 0.5),
      nnPreserved: preserved / n,
      pairCount: ledger.pairs.length,
      p90Abs: quantile(absErrors, 0.9),
      p99Abs: quantile(absErrors, 0.99),
      ratios: ratios,
      sameClusterPreserved: sameClusterPreserved / n,
      sameP90: quantile(sameErrors, 0.9),
      scatter: scatter,
      worstAbs: absErrors[absErrors.length - 1] || 0
    };
  }

  function ratioHistogram(ratios) {
    var bins = [
      { count: 0, label: "<0.70", max: 0.7, min: -Infinity },
      { count: 0, label: "0.70-0.85", max: 0.85, min: 0.7 },
      { count: 0, label: "0.85-0.95", max: 0.95, min: 0.85 },
      { count: 0, label: "0.95-1.05", max: 1.05, min: 0.95 },
      { count: 0, label: "1.05-1.15", max: 1.15, min: 1.05 },
      { count: 0, label: "1.15-1.30", max: 1.3, min: 1.15 },
      { count: 0, label: ">1.30", max: Infinity, min: 1.3 }
    ];
    ratios.forEach(function (ratio) {
      for (var i = 0; i < bins.length; i += 1) {
        if (ratio >= bins[i].min && ratio < bins[i].max) {
          bins[i].count += 1;
          return;
        }
      }
    });
    return bins;
  }

  function dimensionGrid(k, dimension) {
    var seen = {};
    var grid = [];
    K_GRID.concat([k]).forEach(function (value) {
      var clean = clamp(value, 4, Math.min(128, dimension));
      if (!seen[clean]) {
        seen[clean] = true;
        grid.push(clean);
      }
    });
    grid.sort(function (a, b) { return a - b; });
    return grid;
  }

  function simulate(rawParams) {
    var params = cleanParams(rawParams || {});
    var data = makeData(params);
    var ledger = pairLedger(data);
    var grid = dimensionGrid(params.k, params.dimension);
    var curve = grid.map(function (k) {
      var result = evaluateProjection(data, ledger, k, params.type, 0x20260613 + k * 97, false);
      return {
        k: k,
        medianAbs: result.medianAbs,
        nnPreserved: result.nnPreserved,
        p90Abs: result.p90Abs,
        worstAbs: result.worstAbs
      };
    });
    var selected = evaluateProjection(data, ledger, params.k, params.type, 0x20260613 + params.k * 97, true);
    return {
      curve: curve,
      data: {
        medianMargin: ledger.medianMargin,
        pairCount: ledger.pairs.length
      },
      params: params,
      selected: selected
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

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawCurvePanel(ctx, result, box) {
    panelTitle(ctx, box, "Distortion envelope", "empirical pairwise error shrinks as k rises");
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 88 };
    var maxY = Math.max.apply(null, result.curve.map(function (row) { return row.worstAbs; }).concat([0.25]));
    maxY = Math.min(1.6, Math.max(0.25, maxY * 1.08));
    drawAxis(ctx, plot);
    [0.1, 0.25, 0.5, 1.0].forEach(function (level) {
      if (level > maxY) return;
      var y = plot.y + plot.h - level / maxY * plot.h;
      ctx.strokeStyle = COLORS.rule;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      label(ctx, formatPercent(level * 100, 0), plot.x - 7, y, "right");
    });
    function xScale(k) {
      var minK = result.curve[0].k;
      var maxK = result.curve[result.curve.length - 1].k;
      return plot.x + (k - minK) / Math.max(1, maxK - minK) * plot.w;
    }
    function yScale(v) {
      return plot.y + plot.h - v / maxY * plot.h;
    }
    function path(key, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      result.curve.forEach(function (row, i) {
        var x = xScale(row.k);
        var y = yScale(row[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    path("worstAbs", COLORS.amber, 1.9);
    path("p90Abs", COLORS[result.params.type], 2.4);
    path("medianAbs", COLORS.violet, 1.8);
    result.curve.forEach(function (row) {
      var x = xScale(row.k);
      if (row.k === result.params.k) {
        ctx.strokeStyle = COLORS.text;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.h);
        ctx.stroke();
      }
    });
    label(ctx, "violet median, color p90, amber worst", plot.x, plot.y + plot.h + 26, "left");
    label(ctx, "k", plot.x + plot.w, plot.y + plot.h + 26, "right");
  }

  function drawHistogramPanel(ctx, result, box) {
    panelTitle(ctx, box, "Distance ratios", "projected distance divided by original distance");
    var bins = result.selected.histogram;
    var max = Math.max.apply(null, bins.map(function (bin) { return bin.count; }).concat([1]));
    var plot = { x: box.x + 34, y: box.y + 54, w: box.w - 48, h: box.h - 88 };
    drawAxis(ctx, plot);
    var gap = plot.w / bins.length;
    bins.forEach(function (bin, i) {
      var x = plot.x + i * gap + gap * 0.17;
      var w = gap * 0.58;
      var h = bin.count / max * plot.h;
      ctx.fillStyle = bin.label === "0.95-1.05" ? COLORS[result.params.type] : COLORS.cross;
      ctx.fillRect(x, plot.y + plot.h - h, w, h);
      label(ctx, formatPercent(bin.count / result.selected.pairCount * 100, 0), x + w / 2, plot.y + plot.h - h - 10, "center", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, bin.label, x + w / 2, plot.y + plot.h + 18, "center");
    });
  }

  function drawScatterPanel(ctx, result, box) {
    panelTitle(ctx, box, "What the map does to pairs", "diagonal means distance was preserved");
    var points = result.selected.scatter;
    var max = Math.max.apply(null, points.map(function (p) {
      return Math.max(p.original, p.projected);
    }).concat([1]));
    var plot = { x: box.x + 42, y: box.y + 54, w: box.w - 58, h: box.h - 84 };
    drawAxis(ctx, plot);
    function xScale(v) { return plot.x + v / max * plot.w; }
    function yScale(v) { return plot.y + plot.h - v / max * plot.h; }
    ctx.strokeStyle = COLORS.rule;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    ctx.setLineDash([]);
    points.forEach(function (p) {
      ctx.fillStyle = p.same ? "rgba(15, 118, 110, 0.62)" : "rgba(156, 163, 175, 0.48)";
      ctx.beginPath();
      ctx.arc(xScale(p.original), yScale(p.projected), p.same ? 2.5 : 2.0, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "original", plot.x + plot.w, plot.y + plot.h + 24, "right");
    label(ctx, "projected", plot.x - 8, plot.y - 12, "left");
    label(ctx, "green same cluster, gray cross cluster", plot.x, plot.y + plot.h + 24, "left");
  }

  function drawDecisionPanel(ctx, result, box) {
    panelTitle(ctx, box, "Decision margin", "nearest neighbors fail first where ties are close");
    var plot = { x: box.x + 36, y: box.y + 58, w: box.w - 50, h: box.h - 92 };
    var rows = [
      { color: COLORS[result.params.type], label: "exact nearest neighbor", value: result.selected.nnPreserved },
      { color: COLORS.same, label: "same-cluster nearest", value: result.selected.sameClusterPreserved },
      { color: COLORS.violet, label: "median NN margin", value: Math.min(1, result.data.medianMargin - 1), suffix: " over tie" }
    ];
    rows.forEach(function (row, i) {
      var y = plot.y + i * 48;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x, y, plot.w, 16);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x, y, clamp(row.value, 0, 1) * plot.w, 16);
      label(ctx, row.label, plot.x, y - 12, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      var text = row.suffix ? formatPercent(row.value * 100, 1) + row.suffix : formatPercent(row.value * 100, 1);
      label(ctx, text, plot.x + plot.w, y - 12, "right", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    label(ctx, "p90 same-pair error " + formatPercent(result.selected.sameP90 * 100, 1), plot.x, plot.y + 166, "left");
    label(ctx, "p90 cross-pair error " + formatPercent(result.selected.crossP90 * 100, 1), plot.x, plot.y + 186, "left");
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 1050 : 690;
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
    var margin = compact ? 22 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawCurvePanel(ctx, result, { x: margin, y: 28, w: panelW, h: 250 });
      drawHistogramPanel(ctx, result, { x: margin, y: 308, w: panelW, h: 220 });
      drawScatterPanel(ctx, result, { x: margin, y: 558, w: panelW, h: 235 });
      drawDecisionPanel(ctx, result, { x: margin, y: 824, w: panelW, h: 198 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawCurvePanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 310 });
      drawHistogramPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 310 });
      drawScatterPanel(ctx, result, { x: margin, y: 390, w: panelW2, h: 250 });
      drawDecisionPanel(ctx, result, { x: margin + panelW2 + gap, y: 390, w: panelW2, h: 250 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      dimension: formatNumber(result.params.dimension, 0),
      gap: formatNumber(result.params.gap, 2),
      k: formatNumber(result.params.k, 0),
      noise: formatNumber(result.params.noise, 2),
      points: formatNumber(result.params.points, 0)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
      var input = root.querySelector('input[data-param="' + key + '"]');
      if (input) input.value = String(result.params[key] * (key === "gap" || key === "noise" ? 100 : 1));
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("median pair error", formatPercent(result.selected.medianAbs * 100, 1)),
        metric("p90 pair error", formatPercent(result.selected.p90Abs * 100, 1)),
        metric("worst pair error", formatPercent(result.selected.worstAbs * 100, 1)),
        metric("exact NN kept", formatPercent(result.selected.nnPreserved * 100, 1)),
        metric("same cluster kept", formatPercent(result.selected.sameClusterPreserved * 100, 1)),
        metric("pairs checked", formatNumber(result.selected.pairCount, 0))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param], select[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-rp-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.RandomProjectionLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
