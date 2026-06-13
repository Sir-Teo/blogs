(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    target: "#94a3b8",
    generated: "#0f766e",
    path: "#2563eb",
    field: "#7c3aed",
    warn: "#b45309",
    bad: "#be123c"
  };

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
    return Math.max(min, Math.min(max, value));
  }

  function dist(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerp(a, b, t) {
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
  }

  function mul(a, s) {
    return [a[0] * s, a[1] * s];
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="flow-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function sampleBase(rand) {
    return [0.88 * normal(rand), 0.88 * normal(rand)];
  }

  function sampleModes(rand) {
    var centers = [[-1.9, -1.25], [1.85, -1.1], [-1.55, 1.45], [1.65, 1.35]];
    var c = centers[Math.floor(rand() * centers.length)];
    return [c[0] + 0.26 * normal(rand), c[1] + 0.26 * normal(rand)];
  }

  function sampleRing(rand) {
    var theta = 2 * Math.PI * rand();
    var inner = rand() < 0.28;
    var radius = inner ? 0.82 + 0.06 * normal(rand) : 1.85 + 0.10 * normal(rand);
    return [radius * Math.cos(theta) + 0.04 * normal(rand), radius * Math.sin(theta) + 0.04 * normal(rand)];
  }

  function sampleMoons(rand) {
    var theta = Math.PI * rand();
    var upper = rand() < 0.5;
    var x;
    var y;
    if (upper) {
      x = 1.45 * Math.cos(theta) - 0.15;
      y = 0.75 * Math.sin(theta) + 0.55;
    } else {
      x = 1.45 * (1 - Math.cos(theta)) - 1.3;
      y = -0.75 * Math.sin(theta) - 0.55;
    }
    return [x + 0.10 * normal(rand), y + 0.10 * normal(rand)];
  }

  function sampleTarget(rand, target) {
    if (target === "ring") return sampleRing(rand);
    if (target === "moons") return sampleMoons(rand);
    return sampleModes(rand);
  }

  function angleKey(point) {
    return Math.atan2(point[1], point[0]) + 0.08 * Math.sqrt(point[0] * point[0] + point[1] * point[1]);
  }

  function makePairs(params) {
    var targetId = params.target === "ring" ? 37 : params.target === "moons" ? 71 : 11;
    var couplingId = params.coupling === "random" ? 101 : 503;
    var rand = rng(20260613 + targetId + couplingId + params.pairs * 17);
    var bases = [];
    var targets = [];
    var pairs = [];
    var i;

    for (i = 0; i < params.pairs; i += 1) {
      bases.push(sampleBase(rand));
      targets.push(sampleTarget(rand, params.target));
    }

    if (params.coupling === "sorted") {
      var baseOrder = bases.map(function (point, index) {
        return { index: index, key: angleKey(point) };
      }).sort(function (a, b) {
        return a.key - b.key;
      });
      var targetOrder = targets.map(function (point, index) {
        return { index: index, key: angleKey(point) };
      }).sort(function (a, b) {
        return a.key - b.key;
      });

      for (i = 0; i < params.pairs; i += 1) {
        pairs.push({ x0: bases[baseOrder[i].index], x1: targets[targetOrder[i].index] });
      }
    } else {
      for (i = 0; i < params.pairs; i += 1) pairs.push({ x0: bases[i], x1: targets[i] });
    }

    return pairs;
  }

  function velocityAt(pairs, x, t, bandwidth) {
    var h2 = 2 * bandwidth * bandwidth;
    var wx = 0;
    var wy = 0;
    var total = 0;
    var bestW = 0;
    var bestV = [0, 0];

    for (var i = 0; i < pairs.length; i += 1) {
      var pair = pairs[i];
      var xt = lerp(pair.x0, pair.x1, t);
      var dx = x[0] - xt[0];
      var dy = x[1] - xt[1];
      var w = Math.exp(-(dx * dx + dy * dy) / h2);
      var vx = pair.x1[0] - pair.x0[0];
      var vy = pair.x1[1] - pair.x0[1];
      wx += w * vx;
      wy += w * vy;
      total += w;
      if (w > bestW) {
        bestW = w;
        bestV = [vx, vy];
      }
    }

    if (total < 1e-9) return bestV;
    return [wx / total, wy / total];
  }

  function slicedW2(a, b) {
    var directions = 16;
    var n = Math.min(a.length, b.length);
    var total = 0;

    for (var d = 0; d < directions; d += 1) {
      var theta = Math.PI * d / directions;
      var cx = Math.cos(theta);
      var cy = Math.sin(theta);
      var pa = a.map(function (point) { return point[0] * cx + point[1] * cy; }).sort(function (x, y) { return x - y; });
      var pb = b.map(function (point) { return point[0] * cx + point[1] * cy; }).sort(function (x, y) { return x - y; });
      for (var i = 0; i < n; i += 1) total += Math.pow(pa[i] - pb[i], 2);
    }

    return Math.sqrt(total / Math.max(1, n * directions));
  }

  function meanNearest(points, reference) {
    var total = 0;
    for (var i = 0; i < points.length; i += 1) {
      var best = Infinity;
      for (var j = 0; j < reference.length; j += 1) {
        best = Math.min(best, dist(points[i], reference[j]));
      }
      total += best;
    }
    return total / Math.max(1, points.length);
  }

  function entropyCoverage(points, target) {
    var counts;
    var i;
    if (target === "modes") {
      var centers = [[-1.9, -1.25], [1.85, -1.1], [-1.55, 1.45], [1.65, 1.35]];
      counts = [0, 0, 0, 0];
      points.forEach(function (point) {
        var best = 0;
        var bestDistance = Infinity;
        for (var c = 0; c < centers.length; c += 1) {
          var d = dist(point, centers[c]);
          if (d < bestDistance) {
            bestDistance = d;
            best = c;
          }
        }
        counts[best] += 1;
      });
    } else {
      counts = new Array(12).fill(0);
      points.forEach(function (point) {
        var angle = Math.atan2(point[1], point[0]);
        var bucket = Math.floor((angle + Math.PI) / (2 * Math.PI) * counts.length);
        counts[clamp(bucket, 0, counts.length - 1)] += 1;
      });
    }

    var h = 0;
    var total = points.length || 1;
    for (i = 0; i < counts.length; i += 1) {
      if (counts[i] > 0) {
        var p = counts[i] / total;
        h -= p * Math.log(p);
      }
    }
    return Math.exp(h) / counts.length;
  }

  function simulate(params) {
    var pairs = makePairs(params);
    var randParticles = rng(707070 + params.steps * 31 + params.particles * 13 + params.bandwidth * 7);
    var randTarget = rng(808080 + params.particles * 19 + params.pairs * 23 + (params.target === "ring" ? 3 : params.target === "moons" ? 5 : 7));
    var bandwidth = params.bandwidth / 100;
    var dt = 1 / params.steps;
    var starts = [];
    var endpoints = [];
    var targetRef = [];
    var paths = [];
    var pathLength = 0;
    var straightLength = 0;
    var storeEvery = Math.max(1, Math.floor(params.steps / 12));

    for (var i = 0; i < params.particles; i += 1) {
      starts.push(sampleBase(randParticles));
      targetRef.push(sampleTarget(randTarget, params.target));
    }

    starts.forEach(function (start, index) {
      var x = [start[0], start[1]];
      var path = [[x[0], x[1]]];
      var length = 0;

      for (var step = 0; step < params.steps; step += 1) {
        var t = step / params.steps;
        var v = velocityAt(pairs, x, t, bandwidth);
        var delta;
        if (params.solver === "heun") {
          var trial = add(x, mul(v, dt));
          var v2 = velocityAt(pairs, trial, Math.min(1, t + dt), bandwidth);
          delta = mul(add(v, v2), 0.5 * dt);
        } else {
          delta = mul(v, dt);
        }
        x = add(x, delta);
        length += Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1]);
        if ((step + 1) % storeEvery === 0 || step === params.steps - 1) path.push([x[0], x[1]]);
      }

      endpoints.push(x);
      paths.push(index < 42 ? path : null);
      pathLength += length;
      straightLength += dist(start, x);
    });

    var sw2 = slicedW2(endpoints, targetRef);
    var nearest = meanNearest(endpoints, targetRef);
    var coverage = entropyCoverage(endpoints, params.target);
    var stretch = pathLength / Math.max(1e-9, straightLength);

    return {
      coverage: coverage,
      endpoints: endpoints,
      nearest: nearest,
      nfe: params.steps * (params.solver === "heun" ? 2 : 1),
      pairs: pairs,
      paths: paths.filter(Boolean),
      startRef: starts,
      stretch: stretch,
      sw2: sw2,
      targetRef: targetRef
    };
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function worldToPanel(point, box) {
    var min = -3.25;
    var max = 3.25;
    return [
      box.x + (point[0] - min) / (max - min) * box.w,
      box.y + box.h - (point[1] - min) / (max - min) * box.h
    ];
  }

  function drawPanelFrame(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawLabel(ctx, title, box.x, box.y - 14, "left", "bottom", COLORS.text);
    if (subtitle) drawLabel(ctx, subtitle, box.x + box.w, box.y - 14, "right", "bottom", COLORS.muted);
    ctx.strokeStyle = COLORS.faint;
    var zeroX = worldToPanel([0, 0], box)[0];
    var zeroY = worldToPanel([0, 0], box)[1];
    ctx.beginPath();
    ctx.moveTo(box.x, zeroY);
    ctx.lineTo(box.x + box.w, zeroY);
    ctx.moveTo(zeroX, box.y);
    ctx.lineTo(zeroX, box.y + box.h);
    ctx.stroke();
  }

  function drawFlow(ctx, result, box) {
    drawPanelFrame(ctx, box, "Learned transport", "target cloud + generated endpoints");

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = COLORS.target;
    result.targetRef.forEach(function (point) {
      var p = worldToPanel(point, box);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.2, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = COLORS.path;
    result.paths.forEach(function (path) {
      ctx.beginPath();
      path.forEach(function (point, index) {
        var p = worldToPanel(point, box);
        if (index === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    });

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COLORS.generated;
    result.endpoints.forEach(function (point) {
      var p = worldToPanel(point, box);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function arrow(ctx, x1, y1, x2, y2, color) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var head = 5;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.55), y2 - head * Math.sin(angle - 0.55));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.55), y2 - head * Math.sin(angle + 0.55));
    ctx.closePath();
    ctx.fill();
  }

  function drawField(ctx, result, params, box) {
    drawPanelFrame(ctx, box, "Vector field", "t = " + formatNumber(params.fieldTime / 100, 2));
    var bandwidth = params.bandwidth / 100;
    var grid = 9;
    for (var ix = 0; ix < grid; ix += 1) {
      for (var iy = 0; iy < grid; iy += 1) {
        var x = -2.7 + ix * 5.4 / (grid - 1);
        var y = -2.7 + iy * 5.4 / (grid - 1);
        var v = velocityAt(result.pairs, [x, y], params.fieldTime / 100, bandwidth);
        var speed = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
        var scale = speed > 1e-6 ? Math.min(0.34, 0.17 * speed) / speed : 0;
        var p1 = worldToPanel([x, y], box);
        var p2 = worldToPanel([x + v[0] * scale, y + v[1] * scale], box);
        ctx.globalAlpha = clamp(0.2 + speed / 4, 0.25, 0.9);
        arrow(ctx, p1[0], p1[1], p2[0], p2[1], COLORS.field);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBars(ctx, result, box) {
    drawLabel(ctx, "Sampler ledger", box.x, box.y - 14, "left", "bottom", COLORS.text);
    var rows = [
      { label: "distribution match", value: clamp(1 - result.sw2 / 1.6, 0, 1), color: COLORS.generated, text: "SW2 " + formatNumber(result.sw2, 2) },
      { label: "nearest target", value: clamp(1 - result.nearest / 1.15, 0, 1), color: COLORS.path, text: formatNumber(result.nearest, 2) },
      { label: "coverage", value: clamp(result.coverage, 0, 1), color: COLORS.warn, text: formatPercent(result.coverage, 0) },
      { label: "straightness", value: clamp(1 / result.stretch, 0, 1), color: COLORS.field, text: formatNumber(result.stretch, 2) + "x" }
    ];
    var gap = 11;
    var h = (box.h - gap * (rows.length - 1)) / rows.length;
    rows.forEach(function (row, index) {
      var y = box.y + index * (h + gap);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, h);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x, y, box.w * row.value, h);
      drawLabel(ctx, row.label, box.x + 8, y + h / 2, "left", "middle", row.value > 0.36 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, row.text, box.x + box.w - 8, y + h / 2, "right", "middle", row.value > 0.62 ? "#ffffff" : COLORS.text);
    });
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 830 : 560;
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
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var left = compact ? 44 : 54;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;

    if (compact) {
      drawFlow(ctx, result, { x: left, y: 44, w: plotW, h: 310 });
      drawField(ctx, result, params, { x: left, y: 420, w: plotW, h: 210 });
      drawBars(ctx, result, { x: left, y: 700, w: plotW, h: 92 });
    } else {
      drawFlow(ctx, result, { x: left, y: 44, w: plotW * 0.6, h: 360 });
      drawField(ctx, result, params, { x: left + plotW * 0.66, y: 44, w: plotW * 0.34, h: 240 });
      drawBars(ctx, result, { x: left + plotW * 0.66, y: 354, w: plotW * 0.34, h: 126 });
      drawLabel(ctx, "NFE per sample: " + result.nfe, left, 518, "left", "middle", COLORS.muted);
      drawLabel(ctx, "Kernel bandwidth controls smoothness; solver steps control integration error.", left + plotW, 518, "right", "middle", COLORS.muted);
    }
  }

  function parseParams(root) {
    var params = {
      bandwidth: 70,
      coupling: "sorted",
      fieldTime: 50,
      pairs: 220,
      particles: 120,
      solver: "heun",
      steps: 24,
      target: "modes"
    };

    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    params.pairs = Math.max(40, params.pairs);
    params.particles = Math.max(30, params.particles);
    params.steps = Math.max(2, params.steps);
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "bandwidth") output.textContent = formatNumber(params.bandwidth / 100, 2);
      else if (key === "fieldTime") output.textContent = formatNumber(params.fieldTime / 100, 2);
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("sliced W2", formatNumber(result.sw2, 2)),
      metric("nearest target", formatNumber(result.nearest, 2)),
      metric("coverage", formatPercent(result.coverage, 0)),
      metric("path stretch", formatNumber(result.stretch, 2) + "x"),
      metric("NFE / sample", String(result.nfe)),
      metric("pairs", String(params.pairs))
    ].join("");
    drawChart(canvas, result, params);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-flow-lab]"));
    labs.forEach(function (root) {
      var schedule = null;
      function requestRender() {
        if (schedule) window.cancelAnimationFrame(schedule);
        schedule = window.requestAnimationFrame(function () {
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
      makePairs: makePairs,
      sampleTarget: sampleTarget,
      simulate: simulate,
      slicedW2: slicedW2,
      velocityAt: velocityAt
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
