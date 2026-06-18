(function (global) {
  "use strict";

  var EPS = 1e-10;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    point: "#94a3b8",
    hull: "#2563eb",
    best: "#be123c",
    current: "#0f766e",
    edge: "#b45309",
    paleBest: "rgba(190, 18, 60, 0.11)",
    paleCurrent: "rgba(15, 118, 110, 0.13)",
    paleHull: "rgba(37, 99, 235, 0.11)",
    paleEdge: "rgba(180, 83, 9, 0.13)"
  };

  var SHAPES = {
    cloud: "tilted cloud",
    crescent: "crescent",
    rectangle: "boxy outline",
    clusters: "two clusters",
    thin: "nearly flat"
  };

  var DEFAULTS = {
    shape: "cloud",
    count: 44,
    seed: 23,
    step: null
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var hasStep = Object.prototype.hasOwnProperty.call(raw, "step") && raw.step !== "";
    return {
      shape: SHAPES[raw.shape] ? raw.shape : DEFAULTS.shape,
      count: Math.round(clamp(finite(Number(raw.count), DEFAULTS.count), 8, 96)),
      seed: Math.round(clamp(finite(Number(raw.seed), DEFAULTS.seed), 1, 9999)),
      step: hasStep ? Math.round(finite(Number(raw.step), 0)) : null
    };
  }

  function makeRng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function jitter(rng, scale) {
    return (rng() - 0.5) * scale;
  }

  function point(id, x, y, role) {
    return { id: id, x: x, y: y, role: role || "sample" };
  }

  function generatePoints(raw) {
    var params = normalize(raw);
    var rng = makeRng(params.seed + params.shape.length * 8191);
    var points = [];
    var n = params.count;

    function add(x, y, role) {
      points.push(point(points.length, x, y, role));
    }

    if (params.shape === "rectangle") {
      var perimeter = Math.max(8, Math.round(n * 0.58));
      for (var i = 0; i < perimeter; i += 1) {
        var t = i / perimeter;
        var side = Math.floor(t * 4);
        var u = t * 4 - side;
        var x = side === 0 ? u : side === 1 ? 1 : side === 2 ? 1 - u : 0;
        var y = side === 0 ? 0 : side === 1 ? u : side === 2 ? 1 : 1 - u;
        add(0.12 + 0.76 * x + jitter(rng, 0.018), 0.12 + 0.68 * y + jitter(rng, 0.018), "rim");
      }
      while (points.length < n) {
        add(0.22 + 0.56 * rng(), 0.22 + 0.44 * rng(), "interior");
      }
    } else if (params.shape === "crescent") {
      for (var c = 0; c < n; c += 1) {
        var angle = -2.55 + 5.1 * c / Math.max(1, n - 1);
        var band = c % 3 === 0 ? 0.17 + 0.08 * rng() : 0.03 + 0.16 * rng();
        var radius = 0.36 + band;
        add(
          0.5 + Math.cos(angle) * radius + jitter(rng, 0.028),
          0.5 + Math.sin(angle) * radius * 0.72 + 0.08 * Math.cos(angle) + jitter(rng, 0.028),
          c % 3 === 0 ? "rim" : "interior"
        );
      }
    } else if (params.shape === "clusters") {
      for (var k = 0; k < n; k += 1) {
        var left = k < n * 0.5;
        var cx = left ? 0.31 : 0.69;
        var cy = left ? 0.42 : 0.58;
        var r = Math.sqrt(rng()) * (left ? 0.24 : 0.21);
        var a = rng() * Math.PI * 2;
        add(cx + Math.cos(a) * r * 0.95 + jitter(rng, 0.015), cy + Math.sin(a) * r * 0.78 + jitter(rng, 0.015), "sample");
      }
      add(0.08 + jitter(rng, 0.01), 0.18 + jitter(rng, 0.01), "anchor");
      add(0.92 + jitter(rng, 0.01), 0.82 + jitter(rng, 0.01), "anchor");
    } else if (params.shape === "thin") {
      for (var q = 0; q < n; q += 1) {
        var tx = q / Math.max(1, n - 1);
        var bow = Math.sin(tx * Math.PI * 2) * 0.045;
        add(0.08 + 0.84 * tx + jitter(rng, 0.018), 0.48 + bow + jitter(rng, 0.042), q % 9 === 0 ? "rim" : "sample");
      }
      add(0.09, 0.38 + jitter(rng, 0.02), "anchor");
      add(0.91, 0.62 + jitter(rng, 0.02), "anchor");
    } else {
      for (var p = 0; p < n; p += 1) {
        var theta = p * 2.39996323 + rng() * 0.22;
        var rr = Math.sqrt(rng());
        var stretch = p % 7 === 0 ? 0.96 : 0.36 + 0.55 * rr;
        var ox = Math.cos(theta) * stretch;
        var oy = Math.sin(theta) * stretch;
        var rotX = ox * 0.78 - oy * 0.32;
        var rotY = ox * 0.23 + oy * 0.56;
        add(0.5 + rotX * 0.44 + jitter(rng, 0.016), 0.5 + rotY * 0.48 + jitter(rng, 0.016), p % 7 === 0 ? "rim" : "interior");
      }
    }

    points.forEach(function (pt) {
      pt.x = clamp(pt.x, 0.04, 0.96);
      pt.y = clamp(pt.y, 0.04, 0.96);
    });
    return { params: params, points: points };
  }

  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function dist2(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function monotoneHull(points) {
    if (points.length <= 1) return points.slice();
    var sorted = points.slice().sort(function (a, b) {
      return a.x === b.x ? a.y - b.y : a.x - b.x;
    });
    var unique = [];
    sorted.forEach(function (p) {
      var last = unique[unique.length - 1];
      if (!last || Math.abs(last.x - p.x) > EPS || Math.abs(last.y - p.y) > EPS) unique.push(p);
    });
    if (unique.length <= 1) return unique;

    var lower = [];
    unique.forEach(function (p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= EPS) {
        lower.pop();
      }
      lower.push(p);
    });

    var upper = [];
    for (var i = unique.length - 1; i >= 0; i -= 1) {
      var p = unique[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= EPS) {
        upper.pop();
      }
      upper.push(p);
    }

    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  function area2(a, b, c) {
    return Math.abs(cross(a, b, c));
  }

  function bruteDiameter(points) {
    var best = { i: 0, j: 0, d2: 0, checked: 0 };
    for (var i = 0; i < points.length; i += 1) {
      for (var j = i + 1; j < points.length; j += 1) {
        var d = dist2(points[i], points[j]);
        best.checked += 1;
        if (d > best.d2) best = { i: i, j: j, a: points[i], b: points[j], d2: d, checked: best.checked };
      }
    }
    return best;
  }

  function rotatingDiameter(hull) {
    var n = hull.length;
    var events = [];
    var candidates = [];
    var seen = {};
    var best = { a: 0, b: 0, d2: 0, step: 0 };

    function addEvent(event) {
      event.step = events.length;
      events.push(event);
      return event;
    }

    function addCandidate(a, b, edge, reason) {
      if (a === b) return;
      var lo = Math.min(a, b);
      var hi = Math.max(a, b);
      var key = lo + ":" + hi;
      var d = dist2(hull[a], hull[b]);
      if (!seen[key]) {
        seen[key] = true;
        var candidate = {
          a: a,
          b: b,
          d2: d,
          edge: edge,
          reason: reason,
          step: events.length
        };
        candidates.push(candidate);
        addEvent({ type: "candidate", a: a, b: b, j: b, edge: edge, d2: d, reason: reason });
        if (d > best.d2 + EPS) best = { a: a, b: b, d2: d, step: candidate.step };
      }
    }

    if (n === 0) return { events: events, candidates: candidates, best: best, rotations: 0 };
    if (n === 1) {
      addEvent({ type: "single", a: 0, b: 0, j: 0, edge: 0, d2: 0, reason: "one hull vertex" });
      return { events: events, candidates: candidates, best: best, rotations: 0 };
    }
    if (n === 2) {
      addCandidate(0, 1, 0, "two-point hull");
      return { events: events, candidates: candidates, best: best, rotations: 0 };
    }

    var j = 1;
    var rotations = 0;
    for (var i = 0; i < n; i += 1) {
      var ni = (i + 1) % n;
      var guard = 0;
      while (area2(hull[i], hull[ni], hull[(j + 1) % n]) > area2(hull[i], hull[ni], hull[j]) + EPS && guard <= n + 1) {
        var next = (j + 1) % n;
        addEvent({
          type: "advance",
          edge: i,
          a: i,
          b: next,
          j: j,
          nextJ: next,
          area: area2(hull[i], hull[ni], hull[j]),
          nextArea: area2(hull[i], hull[ni], hull[next]),
          reason: "opposite support area still increases"
        });
        j = next;
        rotations += 1;
        guard += 1;
      }
      addCandidate(i, j, i, "edge start");
      addCandidate(ni, j, i, "edge end");

      var tied = (j + 1) % n;
      if (tied !== i && tied !== ni && Math.abs(area2(hull[i], hull[ni], hull[tied]) - area2(hull[i], hull[ni], hull[j])) <= EPS) {
        addCandidate(i, tied, i, "parallel support tie");
        addCandidate(ni, tied, i, "parallel support tie");
      }
    }

    return {
      events: events,
      candidates: candidates,
      best: best,
      rotations: rotations
    };
  }

  function isHullConvex(hull) {
    if (hull.length < 3) return true;
    for (var i = 0; i < hull.length; i += 1) {
      if (cross(hull[i], hull[(i + 1) % hull.length], hull[(i + 2) % hull.length]) <= -EPS) return false;
    }
    return true;
  }

  function pointOnSegment(a, b, p) {
    var minX = Math.min(a.x, b.x) - EPS;
    var maxX = Math.max(a.x, b.x) + EPS;
    var minY = Math.min(a.y, b.y) - EPS;
    var maxY = Math.max(a.y, b.y) + EPS;
    return Math.abs(cross(a, b, p)) <= 1e-8 && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  }

  function allPointsInsideHull(points, hull) {
    if (hull.length < 3) {
      return points.every(function (p) { return pointOnSegment(hull[0], hull[hull.length - 1], p); });
    }
    return points.every(function (p) {
      return hull.every(function (a, i) {
        return cross(a, hull[(i + 1) % hull.length], p) >= -1e-8;
      });
    });
  }

  function hullIdSet(hull) {
    var set = {};
    hull.forEach(function (p) { set[p.id] = true; });
    return set;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, passed: !!ok });
    }
    var set = hullIdSet(result.hull);
    check("hull has at least two endpoints when the input does", result.points.length < 2 || result.hull.length >= 2);
    check("hull orientation is convex", isHullConvex(result.hull));
    check("all generated points are inside the hull", allPointsInsideHull(result.points, result.hull));
    check("brute-force diameter endpoints are hull vertices", result.brute.a ? !!set[result.brute.a.id] && !!set[result.brute.b.id] : true);
    check("calipers diameter matches all-pairs brute force", Math.abs(result.calipers.best.d2 - result.brute.d2) <= 1e-9);
    check("calipers inspected only a linear number of candidates", result.calipers.candidates.length <= Math.max(2, result.hull.length * 4));
    check("candidate ledger contains the chosen best pair", result.calipers.candidates.some(function (row) {
      return Math.abs(row.d2 - result.calipers.best.d2) <= 1e-12;
    }));
    check("selected event is valid", !!result.selected);
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function evaluate(raw) {
    var generated = generatePoints(raw);
    var params = generated.params;
    var points = generated.points;
    var hull = monotoneHull(points);
    var brute = bruteDiameter(points);
    var hullBrute = bruteDiameter(hull);
    var calipers = rotatingDiameter(hull);
    var maxStep = Math.max(0, calipers.events.length - 1);
    params.step = params.step == null ? calipers.best.step : Math.round(clamp(params.step, 0, maxStep));
    var selected = calipers.events[params.step] || calipers.events[0] || { type: "none", a: 0, b: 0, edge: 0, reason: "no event" };
    var result = {
      params: params,
      points: points,
      hull: hull,
      brute: brute,
      hullBrute: hullBrute,
      calipers: calipers,
      selected: selected,
      stats: {
        points: points.length,
        hull: hull.length,
        brutePairs: brute.checked,
        hullPairs: hullBrute.checked,
        candidates: calipers.candidates.length,
        rotations: calipers.rotations,
        diameter: Math.sqrt(calipers.best.d2)
      }
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var cases = [];
    var shapes = Object.keys(SHAPES);
    var counts = [8, 17, 31, 64, 96];
    var seeds = [1, 7, 23, 91];
    shapes.forEach(function (shape) {
      counts.forEach(function (count) {
        seeds.forEach(function (seed) {
          var result = evaluate({ shape: shape, count: count, seed: seed });
          cases.push({
            shape: shape,
            count: count,
            seed: seed,
            hull: result.hull.length,
            candidates: result.calipers.candidates.length,
            brutePairs: result.brute.checked,
            diameter: result.stats.diameter,
            passed: result.audit.passed,
            failedChecks: result.audit.checks.filter(function (row) { return !row.passed; }).map(function (row) { return row.name; })
          });
        });
      });
    });
    var byShape = {};
    cases.forEach(function (row) {
      if (!byShape[row.shape]) byShape[row.shape] = { shape: row.shape, cases: 0, passed: 0, hullTotal: 0, candidateTotal: 0, brutePairTotal: 0 };
      byShape[row.shape].cases += 1;
      if (row.passed) byShape[row.shape].passed += 1;
      byShape[row.shape].hullTotal += row.hull;
      byShape[row.shape].candidateTotal += row.candidates;
      byShape[row.shape].brutePairTotal += row.brutePairs;
    });
    var summary = shapes.map(function (shape) {
      var row = byShape[shape];
      return {
        shape: row.shape,
        cases: row.cases,
        passed: row.passed,
        avgHull: row.hullTotal / row.cases,
        avgCandidates: row.candidateTotal / row.cases,
        avgBrutePairs: row.brutePairTotal / row.cases
      };
    });
    return {
      byShape: summary,
      cases: cases,
      passed: cases.filter(function (row) { return row.passed; }).length,
      total: cases.length
    };
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "NaN";
    return Number(value.toFixed(digits == null ? 3 : digits)).toString();
  }

  function metric(label, value, cls) {
    return '<div class="calipers-lab__metric ' + (cls || "") + '">' +
      '<span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "shape") output.textContent = SHAPES[result.params.shape];
      else if (key === "count") output.textContent = String(result.params.count);
      else if (key === "seed") output.textContent = String(result.params.seed);
      else if (key === "step") output.textContent = result.params.step + " / " + Math.max(0, result.calipers.events.length - 1);
    });
    var step = root.querySelector('[data-param="step"]');
    if (step) {
      step.max = String(Math.max(0, result.calipers.events.length - 1));
      step.value = String(result.params.step);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("points", String(result.stats.points)),
        metric("hull vertices", String(result.stats.hull)),
        metric("brute pairs", String(result.stats.brutePairs)),
        metric("caliper candidates", String(result.stats.candidates), "calipers-lab__metric--good"),
        metric("diameter", formatNumber(result.stats.diameter, 3)),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "calipers-lab__metric--good" : "calipers-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = describeEvent(result);
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__rotatingCalipersResult = result;
    return result;
  }

  function describeEvent(result) {
    var event = result.selected;
    if (!event) return "No caliper event is selected.";
    if (event.type === "advance") {
      return "The opposite support vertex advances because the triangle area against the current edge is still increasing.";
    }
    if (event.type === "candidate") {
      return "Candidate pair " + hullLabel(result, event.a) + " - " + hullLabel(result, event.b) +
        " has distance " + formatNumber(Math.sqrt(event.d2), 3) + ".";
    }
    return event.reason || "Selected caliper event.";
  }

  function hullLabel(result, index) {
    var p = result.hull[index];
    return p ? "h" + index + "/p" + p.id : "h?";
  }

  function init(root) {
    if (!root || root.__rotatingCalipersReady) return;
    root.__rotatingCalipersReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 35);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function prepareCanvas(canvas) {
    var dpr = global.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || canvas.width || 940;
    var cssHeight = canvas.clientHeight || Math.max(640, Math.round(cssWidth * 0.72));
    var pixelWidth = Math.round(cssWidth * dpr);
    var pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    var ctx = canvas.getContext("2d");
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else if (ctx.scale) ctx.scale(dpr, dpr);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 400) + " " + size + "px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function drawText(ctx, text, x, y, size, color, maxWidth, align, weight) {
    setFont(ctx, size, weight);
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    if (maxWidth && ctx.measureText) {
      var fitted = size;
      while (fitted > 9 && ctx.measureText(text).width > maxWidth) {
        fitted -= 1;
        setFont(ctx, fitted, weight);
      }
    }
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 12, 14, COLORS.text, box.w - 28, "left", 700);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 33, 11, COLORS.muted, box.w - 28);
  }

  function bounds(points) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    points.forEach(function (p) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    var pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 0.02;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function transform(box, b) {
    var sx = box.w / Math.max(EPS, b.maxX - b.minX);
    var sy = box.h / Math.max(EPS, b.maxY - b.minY);
    var s = Math.min(sx, sy);
    var ox = box.x + (box.w - (b.maxX - b.minX) * s) / 2;
    var oy = box.y + (box.h - (b.maxY - b.minY) * s) / 2;
    return function (p) {
      return {
        x: ox + (p.x - b.minX) * s,
        y: oy + (b.maxY - p.y) * s
      };
    };
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    var margin = 22;
    var gap = 16;
    var top = 22;
    var plotH = Math.max(380, height - 190);
    var plotW = Math.round((width - margin * 2 - gap) * 0.62);
    var sideW = width - margin * 2 - gap - plotW;
    drawPlot(ctx, result, { x: margin, y: top, w: plotW, h: plotH });
    drawLedger(ctx, result, { x: margin + plotW + gap, y: top, w: sideW, h: plotH });
    drawSweep(ctx, result, { x: margin, y: top + plotH + gap, w: width - margin * 2, h: height - top - plotH - gap - margin });
  }

  function drawSupportLine(ctx, map, pointOnLine, direction, color, dash) {
    var len = 2.2;
    var a = map({ x: pointOnLine.x - direction.x * len, y: pointOnLine.y - direction.y * len });
    var b = map({ x: pointOnLine.x + direction.x * len, y: pointOnLine.y + direction.y * len });
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dash && ctx.setLineDash) ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlot(ctx, result, box) {
    panel(ctx, box, "convex hull diameter", "interior points cannot be endpoints of the farthest pair");
    var inner = { x: box.x + 22, y: box.y + 58, w: box.w - 44, h: box.h - 78 };
    var map = transform(inner, bounds(result.points));
    var hull = result.hull;
    var selected = result.selected || {};
    var edge = typeof selected.edge === "number" ? selected.edge : result.calipers.best.a;
    var edgeNext = hull.length ? (edge + 1) % hull.length : edge;
    var currentA = typeof selected.a === "number" ? selected.a : result.calipers.best.a;
    var currentB = typeof selected.b === "number" ? selected.b : result.calipers.best.b;

    ctx.fillStyle = COLORS.white;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);

    if (hull.length >= 2) {
      ctx.fillStyle = COLORS.paleHull;
      ctx.strokeStyle = COLORS.hull;
      ctx.lineWidth = 2;
      ctx.beginPath();
      hull.forEach(function (p, index) {
        var q = map(p);
        if (index === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (hull.length >= 2 && hull[edge] && hull[edgeNext]) {
      var e0 = hull[edge];
      var e1 = hull[edgeNext];
      var dx = e1.x - e0.x;
      var dy = e1.y - e0.y;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var dir = { x: dx / length, y: dy / length };
      drawSupportLine(ctx, map, e0, dir, COLORS.edge, false);
      if (hull[currentB]) drawSupportLine(ctx, map, hull[currentB], dir, COLORS.current, true);
    }

    if (hull[result.calipers.best.a] && hull[result.calipers.best.b]) {
      drawPair(ctx, map, hull[result.calipers.best.a], hull[result.calipers.best.b], COLORS.best, 3);
    }
    if (hull[currentA] && hull[currentB]) {
      drawPair(ctx, map, hull[currentA], hull[currentB], COLORS.current, 2);
    }

    result.points.forEach(function (p) {
      var q = map(p);
      ctx.fillStyle = p.role === "anchor" || p.role === "rim" ? COLORS.point : "#cbd5e1";
      ctx.beginPath();
      ctx.arc(q.x, q.y, p.role === "interior" ? 2.4 : 3.3, 0, Math.PI * 2);
      ctx.fill();
    });

    hull.forEach(function (p, i) {
      var q = map(p);
      ctx.fillStyle = i === result.calipers.best.a || i === result.calipers.best.b ? COLORS.best : COLORS.hull;
      if (i === currentA || i === currentB) ctx.fillStyle = COLORS.current;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5.2, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, "h" + i, q.x + 6, q.y - 9, 10, COLORS.text, 28, "left", 700);
    });
  }

  function drawPair(ctx, map, a, b, color, width) {
    var pa = map(a);
    var pb = map(b);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "candidate ledger", "calipers compare a linear set of hull pairs");
    var rows = result.calipers.candidates.slice().sort(function (a, b) { return b.d2 - a.d2; });
    var maxRows = Math.max(5, Math.floor((box.h - 115) / 25));
    var x = box.x + 14;
    var y = box.y + 58;
    drawText(ctx, "rank", x, y, 11, COLORS.muted, 34, "left", 700);
    drawText(ctx, "pair", x + 44, y, 11, COLORS.muted, 64, "left", 700);
    drawText(ctx, "distance", x + 116, y, 11, COLORS.muted, 70, "left", 700);
    drawText(ctx, "reason", x + 194, y, 11, COLORS.muted, box.w - 214, "left", 700);
    rows.slice(0, maxRows).forEach(function (row, i) {
      var yy = y + 24 + i * 25;
      var active = row.step === result.params.step;
      var best = Math.abs(row.d2 - result.calipers.best.d2) <= EPS;
      ctx.fillStyle = active ? COLORS.paleCurrent : best ? COLORS.paleBest : i % 2 ? COLORS.white : "rgba(255,255,255,0.58)";
      ctx.fillRect(x - 6, yy - 5, box.w - 28, 23);
      drawText(ctx, String(i + 1), x, yy, 11, best ? COLORS.best : COLORS.muted, 34, "left", 700);
      drawText(ctx, "h" + row.a + "-h" + row.b, x + 44, yy, 12, active ? COLORS.current : COLORS.text, 60, "left", 700);
      drawText(ctx, formatNumber(Math.sqrt(row.d2), 3), x + 116, yy, 12, best ? COLORS.best : COLORS.text, 68, "left", 700);
      drawText(ctx, row.reason, x + 194, yy, 11, COLORS.muted, box.w - 214);
    });

    var selected = result.selected;
    var bottom = box.y + box.h - 68;
    ctx.fillStyle = selected && selected.type === "advance" ? COLORS.paleEdge : COLORS.paleCurrent;
    ctx.fillRect(x - 6, bottom, box.w - 28, 44);
    drawText(ctx, "selected step " + result.params.step, x, bottom + 8, 11, COLORS.muted, box.w - 36, "left", 700);
    drawText(ctx, describeEvent(result), x, bottom + 24, 12, COLORS.text, box.w - 36);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "distance sweep", "the red maximum agrees with exhaustive all-pairs search");
    var rows = result.calipers.candidates;
    if (!rows.length) return;
    var inner = { x: box.x + 42, y: box.y + 54, w: box.w - 72, h: box.h - 78 };
    var maxD = Math.sqrt(result.calipers.best.d2) || 1;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y + inner.h);
    ctx.lineTo(inner.x + inner.w, inner.y + inner.h);
    ctx.stroke();

    rows.forEach(function (row, i) {
      var x = inner.x + (rows.length === 1 ? inner.w / 2 : i * inner.w / (rows.length - 1));
      var h = Math.sqrt(row.d2) / maxD * inner.h;
      var active = row.step === result.params.step;
      var best = Math.abs(row.d2 - result.calipers.best.d2) <= EPS;
      ctx.fillStyle = best ? COLORS.best : active ? COLORS.current : COLORS.hull;
      ctx.fillRect(x - 3, inner.y + inner.h - h, 6, h);
    });
    drawText(ctx, "brute: " + result.stats.brutePairs + " pairs", box.x + box.w - 230, box.y + 16, 11, COLORS.muted, 100, "left", 700);
    drawText(ctx, "calipers: " + result.stats.candidates + " pairs", box.x + box.w - 118, box.y + 16, 11, COLORS.current, 100, "left", 700);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-rotating-calipers-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-rotating-calipers-lab]")).forEach(init);
    }
  }

  var api = {
    generatePoints: generatePoints,
    monotoneHull: monotoneHull,
    rotatingDiameter: rotatingDiameter,
    bruteDiameter: bruteDiameter,
    evaluate: evaluate,
    auditGrid: auditGrid,
    cross: cross,
    dist2: dist2,
    render: render
  };

  global.RotatingCalipersLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
