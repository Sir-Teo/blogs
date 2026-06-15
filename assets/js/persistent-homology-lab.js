(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#e7edf3",
    panel: "#f8fafc",
    white: "#ffffff",
    h0: "#64748b",
    h1: "#0f766e",
    accent: "#2563eb",
    radius: "#dc2626",
    point: "#172026",
    outlier: "#b45309",
    fill: "rgba(37, 99, 235, 0.08)",
    edge: "rgba(15, 23, 42, 0.22)"
  };

  var SHAPES = ["ring", "figure8", "clusters", "crescent"];

  var DEFAULTS = {
    shape: "ring",
    points: 24,
    noise: 8,
    outliers: 1,
    radius: 28,
    seed: 17
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readNumber(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var shape = SHAPES.indexOf(raw.shape) >= 0 ? raw.shape : DEFAULTS.shape;
    var points = clamp(Math.round(readNumber(raw, "points")), 14, 28);
    var outliers = clamp(Math.round(readNumber(raw, "outliers")), 0, Math.min(5, points - 8));
    return {
      shape: shape,
      points: points,
      noise: clamp(Math.round(readNumber(raw, "noise")), 0, 28),
      outliers: outliers,
      radius: clamp(Math.round(readNumber(raw, "radius")), 4, 95),
      seed: clamp(Math.round(readNumber(raw, "seed")), 1, 9999)
    };
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function makeRng(seed) {
    var state = (seed >>> 0) + 0x9e3779b9;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rng) {
    var u1 = Math.max(1e-12, rng());
    var u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "inf";
    if (value >= 100) return value.toFixed(0);
    if (value >= 10) return value.toFixed(digits == null ? 1 : digits);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="ph-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pushPoint(points, x, y, kind) {
    points.push({
      x: clamp(x, 0.04, 0.96),
      y: clamp(y, 0.04, 0.96),
      kind: kind || "sample"
    });
  }

  function ringPoint(points, rng, cx, cy, radius, angle, noise, kind) {
    var radial = radius + normal(rng) * noise * 0.34;
    var tangential = angle + normal(rng) * noise * 0.45;
    pushPoint(points, cx + radial * Math.cos(tangential), cy + radial * Math.sin(tangential), kind);
  }

  function generatePoints(params) {
    var rng = makeRng(params.seed + params.shape.length * 131);
    var points = [];
    var core = params.points - params.outliers;
    var noise = params.noise / 100;
    var i;
    if (params.shape === "figure8") {
      var left = Math.ceil(core / 2);
      var right = core - left;
      for (i = 0; i < left; i += 1) {
        ringPoint(points, rng, 0.38, 0.52, 0.205, 2 * Math.PI * i / left, noise, "sample");
      }
      for (i = 0; i < right; i += 1) {
        ringPoint(points, rng, 0.62, 0.52, 0.205, 2 * Math.PI * i / Math.max(1, right) + 0.18, noise, "sample");
      }
    } else if (params.shape === "clusters") {
      var centers = [
        { x: 0.30, y: 0.35 },
        { x: 0.67, y: 0.40 },
        { x: 0.49, y: 0.72 }
      ];
      for (i = 0; i < core; i += 1) {
        var c = centers[i % centers.length];
        var spread = 0.035 + noise * 0.20;
        pushPoint(points, c.x + normal(rng) * spread, c.y + normal(rng) * spread, "sample");
      }
    } else if (params.shape === "crescent") {
      for (i = 0; i < core; i += 1) {
        var t = -0.15 * Math.PI + 1.3 * Math.PI * i / Math.max(1, core - 1);
        var r = 0.33 + 0.055 * Math.sin(2.2 * t);
        pushPoint(points, 0.52 + r * Math.cos(t) + normal(rng) * noise * 0.08, 0.53 + 0.72 * r * Math.sin(t) + normal(rng) * noise * 0.08, "sample");
      }
    } else {
      for (i = 0; i < core; i += 1) {
        ringPoint(points, rng, 0.50, 0.52, 0.325, 2 * Math.PI * i / core, noise, "sample");
      }
    }
    for (i = 0; i < params.outliers; i += 1) {
      pushPoint(points, 0.10 + 0.80 * rng(), 0.10 + 0.80 * rng(), "outlier");
    }
    return points;
  }

  function simplexKey(verts) {
    return verts.join("-");
  }

  function buildComplex(points) {
    var simplices = [];
    var n = points.length;
    var d = [];
    var i;
    for (i = 0; i < n; i += 1) d.push([]);
    for (i = 0; i < n; i += 1) {
      simplices.push({ verts: [i], dim: 0, filt: 0, key: String(i) });
      for (var j = i + 1; j < n; j += 1) {
        d[i][j] = dist(points[i], points[j]);
        d[j][i] = d[i][j];
      }
    }
    for (i = 0; i < n; i += 1) {
      for (j = i + 1; j < n; j += 1) {
        simplices.push({ verts: [i, j], dim: 1, filt: d[i][j], key: simplexKey([i, j]) });
      }
    }
    for (i = 0; i < n; i += 1) {
      for (j = i + 1; j < n; j += 1) {
        for (var k = j + 1; k < n; k += 1) {
          simplices.push({
            verts: [i, j, k],
            dim: 2,
            filt: Math.max(d[i][j], d[i][k], d[j][k]),
            key: simplexKey([i, j, k])
          });
        }
      }
    }
    simplices.sort(function (a, b) {
      if (Math.abs(a.filt - b.filt) > 1e-12) return a.filt - b.filt;
      if (a.dim !== b.dim) return a.dim - b.dim;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    var index = {};
    simplices.forEach(function (s, idx) {
      s.index = idx;
      index[s.key] = idx;
    });
    simplices.forEach(function (s) {
      if (s.dim === 0) {
        s.boundary = [];
      } else {
        var faces = [];
        for (var drop = 0; drop < s.verts.length; drop += 1) {
          var face = s.verts.filter(function (_, idx) { return idx !== drop; });
          faces.push(index[simplexKey(face)]);
        }
        faces.sort(function (a, b) { return a - b; });
        s.boundary = faces;
      }
    });
    return { simplices: simplices, distances: d };
  }

  function xorSorted(a, b) {
    var out = [];
    var i = 0;
    var j = 0;
    while (i < a.length || j < b.length) {
      var av = i < a.length ? a[i] : Infinity;
      var bv = j < b.length ? b[j] : Infinity;
      if (av === bv) {
        i += 1;
        j += 1;
      } else if (av < bv) {
        out.push(av);
        i += 1;
      } else {
        out.push(bv);
        j += 1;
      }
    }
    return out;
  }

  function reduceComplex(simplices) {
    var lowToColumn = {};
    var reduced = [];
    var pair = {};
    var births = [];
    for (var j = 0; j < simplices.length; j += 1) {
      var column = simplices[j].boundary.slice();
      while (column.length) {
        var low = column[column.length - 1];
        if (lowToColumn[low] == null) break;
        column = xorSorted(column, reduced[lowToColumn[low]]);
      }
      reduced[j] = column;
      if (!column.length) {
        births.push(j);
      } else {
        low = column[column.length - 1];
        lowToColumn[low] = j;
        pair[low] = j;
      }
    }
    var intervals = [];
    births.forEach(function (birthIndex) {
      var birth = simplices[birthIndex];
      if (birth.dim > 1) return;
      var deathIndex = pair[birthIndex];
      var death = deathIndex == null ? Infinity : simplices[deathIndex].filt;
      intervals.push({
        dim: birth.dim,
        birth: birth.filt,
        death: death,
        persistence: Number.isFinite(death) ? Math.max(0, death - birth.filt) : Infinity,
        birthIndex: birthIndex,
        deathIndex: deathIndex == null ? -1 : deathIndex
      });
    });
    return intervals;
  }

  function bettiAt(intervals, radius) {
    var b0 = 0;
    var b1 = 0;
    intervals.forEach(function (bar) {
      if (bar.birth <= radius + 1e-10 && bar.death > radius + 1e-10) {
        if (bar.dim === 0) b0 += 1;
        if (bar.dim === 1) b1 += 1;
      }
    });
    return { b0: b0, b1: b1 };
  }

  function bettiCurve(intervals, maxRadius) {
    var rows = [];
    for (var i = 0; i <= 64; i += 1) {
      var r = maxRadius * i / 64;
      var b = bettiAt(intervals, r);
      rows.push({ r: r, b0: b.b0, b1: b.b1 });
    }
    return rows;
  }

  function finiteBars(intervals, dim) {
    return intervals.filter(function (bar) {
      return bar.dim === dim && Number.isFinite(bar.death) && bar.persistence > 1e-8;
    }).sort(function (a, b) {
      return b.persistence - a.persistence || a.birth - b.birth;
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var points = generatePoints(params);
    var complex = buildComplex(points);
    var intervals = reduceComplex(complex.simplices);
    var maxEdge = 0;
    for (var i = 0; i < points.length; i += 1) {
      for (var j = i + 1; j < points.length; j += 1) maxEdge = Math.max(maxEdge, complex.distances[i][j]);
    }
    var maxRadius = Math.max(0.55, Math.min(1.25, maxEdge * 0.92));
    var radius = params.radius / 100;
    var betti = bettiAt(intervals, radius);
    var h1 = finiteBars(intervals, 1);
    var h0 = finiteBars(intervals, 0);
    var longestH1 = h1.length ? h1[0].persistence : 0;
    var secondH1 = h1.length > 1 ? h1[1].persistence : 0;
    var curve = bettiCurve(intervals, maxRadius);
    var checks = {
      finite: Number.isFinite(longestH1) && Number.isFinite(maxEdge) && Number.isFinite(radius),
      pointCount: points.length === params.points,
      simplexCount: complex.simplices.length > points.length,
      filtrationOrder: complex.simplices.every(function (s, idx) {
        return !s.boundary || s.boundary.every(function (face) { return face < idx && complex.simplices[face].filt <= s.filt + 1e-10; });
      }),
      intervalsValid: intervals.every(function (bar) { return bar.death === Infinity || bar.death + 1e-10 >= bar.birth; }),
      bettiNonnegative: betti.b0 >= 0 && betti.b1 >= 0
    };
    return {
      params: params,
      points: points,
      complex: complex,
      intervals: intervals,
      h0: h0,
      h1: h1,
      betti: betti,
      curve: curve,
      radius: radius,
      maxRadius: maxRadius,
      summary: {
        longestH1: longestH1,
        secondH1: secondH1,
        h1Bars: h1.length,
        h0Bars: h0.length,
        signalGap: secondH1 > 1e-9 ? longestH1 / secondH1 : (longestH1 > 0 ? Infinity : 0),
        simplices: complex.simplices.length
      },
      checks: checks
    };
  }

  function syncOutputs(root, result) {
    var p = result.params;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (p[key] != null && String(input.value) !== String(p[key])) input.value = p[key];
    });
    var values = {
      points: p.points,
      noise: p.noise + "%",
      outliers: p.outliers,
      radius: formatNumber(p.radius / 100, 2),
      seed: p.seed
    };
    root.querySelectorAll("[data-value]").forEach(function (node) {
      var key = node.getAttribute("data-value");
      if (values[key] != null) node.textContent = values[key];
    });
  }

  function renderMetrics(root, result) {
    var node = root.querySelector("[data-metrics]");
    if (!node) return;
    var audit = Object.keys(result.checks).every(function (key) { return result.checks[key]; }) ? "passed" : "check";
    node.innerHTML = [
      metric("Beta0 at r", String(result.betti.b0)),
      metric("Beta1 at r", String(result.betti.b1)),
      metric("Longest H1", formatNumber(result.summary.longestH1, 3)),
      metric("H1 bars", String(result.summary.h1Bars)),
      metric("Simplices", String(result.summary.simplices)),
      metric("Audit", audit)
    ].join("");
  }

  function setCanvasSize(canvas) {
    var box = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.round(box.width || canvas.parentNode.clientWidth || 900));
    var cssHeight = cssWidth < 560 ? 1120 : 780;
    var ratio = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    var out = text;
    while (out.length > 4 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    return out.trim() + "...";
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, rect.x + 14, rect.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(fitText(ctx, subtitle, rect.w - 28), rect.x + 14, rect.y + 42);
    }
  }

  function squarePlot(rect) {
    var pad = 46;
    var size = Math.min(rect.w - 2 * pad, rect.h - 78);
    return {
      x: rect.x + (rect.w - size) / 2,
      y: rect.y + 58 + (rect.h - 78 - size) / 2,
      size: size
    };
  }

  function drawComplex(ctx, rect, result) {
    panel(ctx, rect, "Growing the complex", "Vietoris-Rips edges and filled triangles at r");
    var plot = squarePlot(rect);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(plot.x, plot.y, plot.size, plot.size);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.size, plot.size);
    function sx(p) { return plot.x + p.x * plot.size; }
    function sy(p) { return plot.y + (1 - p.y) * plot.size; }

    ctx.fillStyle = COLORS.fill;
    result.complex.simplices.forEach(function (s) {
      if (s.dim !== 2 || s.filt > result.radius) return;
      ctx.beginPath();
      s.verts.forEach(function (idx, i) {
        var p = result.points[idx];
        if (i === 0) ctx.moveTo(sx(p), sy(p));
        else ctx.lineTo(sx(p), sy(p));
      });
      ctx.closePath();
      ctx.fill();
    });

    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1;
    result.complex.simplices.forEach(function (s) {
      if (s.dim !== 1 || s.filt > result.radius) return;
      var a = result.points[s.verts[0]];
      var b = result.points[s.verts[1]];
      ctx.beginPath();
      ctx.moveTo(sx(a), sy(a));
      ctx.lineTo(sx(b), sy(b));
      ctx.stroke();
    });

    result.points.forEach(function (p) {
      ctx.fillStyle = p.kind === "outlier" ? COLORS.outlier : COLORS.point;
      ctx.beginPath();
      ctx.arc(sx(p), sy(p), p.kind === "outlier" ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("r = " + formatNumber(result.radius, 2), plot.x, plot.y + plot.size + 20);
  }

  function barcodeRows(result) {
    var rows = [];
    result.h0.slice(0, 10).forEach(function (bar) { rows.push(bar); });
    result.h1.slice(0, 12).forEach(function (bar) { rows.push(bar); });
    var infinite = result.intervals.filter(function (bar) { return bar.dim === 0 && bar.death === Infinity; });
    if (infinite.length) rows.unshift(infinite[0]);
    return rows.slice(0, 23);
  }

  function drawBarcode(ctx, rect, result) {
    panel(ctx, rect, "Barcode", "birth and death across radius");
    var plot = { x: rect.x + 50, y: rect.y + 64, w: rect.w - 72, h: rect.h - 100 };
    var rows = barcodeRows(result);
    var maxR = result.maxRadius;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var xg = plot.x + plot.w * g / 4;
      ctx.beginPath();
      ctx.moveTo(xg, plot.y);
      ctx.lineTo(xg, plot.y + plot.h);
      ctx.stroke();
    }
    function sx(r) { return plot.x + clamp(r / maxR, 0, 1) * plot.w; }
    rows.forEach(function (bar, i) {
      var y = plot.y + 8 + i * Math.min(12, (plot.h - 16) / Math.max(1, rows.length));
      ctx.strokeStyle = bar.dim === 0 ? COLORS.h0 : COLORS.h1;
      ctx.lineWidth = bar.dim === 0 ? 2 : 3;
      ctx.beginPath();
      ctx.moveTo(sx(bar.birth), y);
      ctx.lineTo(sx(Number.isFinite(bar.death) ? bar.death : maxR), y);
      ctx.stroke();
      if (!Number.isFinite(bar.death)) {
        ctx.fillStyle = COLORS.h0;
        ctx.fillText("inf", sx(maxR) - 16, y - 4);
      }
    });
    ctx.strokeStyle = COLORS.radius;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(result.radius), plot.y);
    ctx.lineTo(sx(result.radius), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("H0 gray, H1 green", plot.x, rect.y + rect.h - 18);
    ctx.fillText("radius", sx(result.radius) + 4, plot.y + 12);
  }

  function drawDiagram(ctx, rect, result) {
    panel(ctx, rect, "Persistence diagram", "far from diagonal means long-lived");
    var plot = { x: rect.x + 50, y: rect.y + 62, w: rect.w - 76, h: rect.h - 100 };
    var maxR = result.maxRadius;
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();
    function sx(r) { return plot.x + clamp(r / maxR, 0, 1) * plot.w; }
    function sy(r) { return plot.y + plot.h - clamp(r / maxR, 0, 1) * plot.h; }
    result.h0.slice(0, 32).forEach(function (bar) {
      ctx.fillStyle = COLORS.h0;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(sx(bar.birth), sy(bar.death), 2.3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    result.h1.slice(0, 28).forEach(function (bar, i) {
      ctx.fillStyle = i === 0 ? COLORS.radius : COLORS.h1;
      ctx.beginPath();
      ctx.arc(sx(bar.birth), sy(bar.death), i === 0 ? 4.2 : 3.1, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("birth", plot.x + plot.w - 30, plot.y + plot.h + 22);
    ctx.save();
    ctx.translate(plot.x - 32, plot.y + 32);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("death", 0, 0);
    ctx.restore();
  }

  function drawBetti(ctx, rect, result) {
    panel(ctx, rect, "Betti curves", "how many components and loops are alive");
    var plot = { x: rect.x + 48, y: rect.y + 62, w: rect.w - 72, h: rect.h - 100 };
    var maxY = Math.max.apply(null, result.curve.map(function (row) { return Math.max(row.b0, row.b1); }).concat([1]));
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var y = plot.y + plot.h * g / 4;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    function sx(row) { return plot.x + row.r / result.maxRadius * plot.w; }
    function sy(value) { return plot.y + plot.h - value / maxY * plot.h; }
    function line(key, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      result.curve.forEach(function (row, i) {
        var x = sx(row);
        var y = sy(row[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    line("b0", COLORS.h0, 1.9);
    line("b1", COLORS.h1, 2.5);
    var xr = plot.x + result.radius / result.maxRadius * plot.w;
    ctx.strokeStyle = COLORS.radius;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xr, plot.y);
    ctx.lineTo(xr, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("beta0", plot.x + 8, plot.y + 15);
    ctx.fillStyle = COLORS.h1;
    ctx.fillText("beta1", plot.x + 58, plot.y + 15);
  }

  function drawLegend(ctx, x, y) {
    var items = [
      ["points", COLORS.point],
      ["outliers", COLORS.outlier],
      ["H0", COLORS.h0],
      ["H1", COLORS.h1],
      ["chosen r", COLORS.radius]
    ];
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    items.forEach(function (item, i) {
      var ox = x + i * 82;
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(ox, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(item[0], ox + 8, y);
    });
  }

  function draw(canvas, result) {
    if (!canvas || !canvas.getContext) return;
    var frame = setCanvasSize(canvas);
    var ctx = frame.ctx;
    var pad = 14;
    if (frame.width < 560) {
      drawComplex(ctx, { x: pad, y: pad, w: frame.width - pad * 2, h: 290 }, result);
      drawBarcode(ctx, { x: pad, y: 320, w: frame.width - pad * 2, h: 250 }, result);
      drawDiagram(ctx, { x: pad, y: 586, w: frame.width - pad * 2, h: 250 }, result);
      drawBetti(ctx, { x: pad, y: 852, w: frame.width - pad * 2, h: frame.height - 868 }, result);
      drawLegend(ctx, pad + 14, frame.height - 16);
    } else {
      var col = (frame.width - pad * 3) / 2;
      drawComplex(ctx, { x: pad, y: pad, w: col, h: 370 }, result);
      drawBarcode(ctx, { x: pad * 2 + col, y: pad, w: col, h: 370 }, result);
      drawDiagram(ctx, { x: pad, y: 402, w: col, h: frame.height - 418 }, result);
      drawBetti(ctx, { x: pad * 2 + col, y: 402, w: col, h: frame.height - 418 }, result);
      drawLegend(ctx, pad + 18, frame.height - 18);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncOutputs(root, result);
    renderMetrics(root, result);
    draw(root.querySelector("[data-canvas]"), result);
    root.__persistentHomologyResult = result;
  }

  function init(root) {
    if (!root || root.__persistentHomologyReady) return;
    root.__persistentHomologyReady = true;
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", function () { render(root); });
      input.addEventListener("change", function () { render(root); });
    });
    var timer = null;
    global.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(root); }, 120);
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-persistent-homology-lab]").forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    generatePoints: generatePoints,
    buildComplex: buildComplex,
    reduceComplex: reduceComplex,
    bettiAt: bettiAt,
    evaluate: evaluate,
    init: init,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PersistentHomologyLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
