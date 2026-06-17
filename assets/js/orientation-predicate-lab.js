(function (global) {
  "use strict";

  var EPS = Math.pow(2, -53);

  var COLORS = {
    axis: "#d7dee5",
    bad: "#be123c",
    blue: "#2563eb",
    gold: "#d97706",
    good: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    softBad: "rgba(190, 18, 60, 0.12)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softGold: "rgba(217, 119, 6, 0.14)",
    softGood: "rgba(15, 118, 110, 0.12)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    scenario: "product",
    scale: 27,
    tolerance: 0
  };

  var SCENARIOS = {
    product: {
      label: "wide-product cancellation",
      maxScale: 32,
      minScale: 20,
      note: "The coordinates fit in binary64, but the two products are too wide to subtract safely.",
      scaleLabel: "power of two"
    },
    input: {
      label: "lost input bit",
      maxScale: 18,
      minScale: 12,
      note: "The intended grid has a tiny triangle, but binary64 rounds two vertices together.",
      scaleLabel: "power of ten"
    },
    safe: {
      label: "well-spaced control",
      maxScale: 12,
      minScale: 0,
      note: "The determinant is far from zero, so the fast floating-point answer is trustworthy.",
      scaleLabel: "scale"
    }
  };

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
    var scenario = SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario;
    var meta = SCENARIOS[scenario];
    var fallbackScale = scenario === "input" ? 16 : scenario === "safe" ? 0 : DEFAULTS.scale;
    return {
      scale: snap(raw.scale, fallbackScale, meta.minScale, meta.maxScale, 1),
      scenario: scenario,
      tolerance: snap(raw.tolerance, DEFAULTS.tolerance, 0, 8, 1)
    };
  }

  function sign(value) {
    return value < 0 ? -1 : value > 0 ? 1 : 0;
  }

  function signText(value) {
    return value < 0 ? "right turn" : value > 0 ? "left turn" : "collinear";
  }

  function shortSign(value) {
    return value < 0 ? "-" : value > 0 ? "+" : "0";
  }

  function fmtBig(value) {
    value = BigInt(value);
    var s = value.toString();
    if (s.length <= 10) return s;
    return s.slice(0, 4) + "..." + s.slice(-4) + " (" + s.length + " digits)";
  }

  function fmtNumber(value) {
    if (!isFinite(value)) return String(value);
    if (value === 0) return "0";
    var abs = Math.abs(value);
    if (abs >= 1e6 || abs < 1e-3) return value.toExponential(3);
    return String(Math.round(value * 1000) / 1000);
  }

  function bitLength(value) {
    value = BigInt(value);
    if (value < 0n) value = -value;
    if (value === 0n) return 0;
    return value.toString(2).length;
  }

  function pow10(exp) {
    var out = 1n;
    for (var i = 0; i < exp; i += 1) out *= 10n;
    return out;
  }

  function makePoints(params) {
    if (params.scenario === "safe") {
      return {
        baseDescription: "small integer grid",
        points: [
          { id: "A", x: 0n, y: 0n },
          { id: "B", x: 8n, y: 1n },
          { id: "C", x: 2n, y: 7n }
        ]
      };
    }
    if (params.scenario === "input") {
      var base = pow10(params.scale);
      return {
        baseDescription: "10^" + params.scale,
        points: [
          { id: "A", x: base, y: base },
          { id: "B", x: base + 1n, y: base + 1n },
          { id: "C", x: base + 2n, y: base + 3n }
        ]
      };
    }
    var m = 1n << BigInt(params.scale);
    return {
      baseDescription: "2^" + params.scale,
      points: [
        { id: "A", x: 0n, y: 0n },
        { id: "B", x: m, y: m + 1n },
        { id: "C", x: m + 1n, y: m + 2n }
      ]
    };
  }

  function toNumberPoint(point) {
    return {
      id: point.id,
      x: Number(point.x),
      y: Number(point.y)
    };
  }

  function orientBig(points) {
    var ax = points[0].x;
    var ay = points[0].y;
    var bx = points[1].x;
    var by = points[1].y;
    var cx = points[2].x;
    var cy = points[2].y;
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function determinantTermsBig(points) {
    var ax = points[0].x;
    var ay = points[0].y;
    var bx = points[1].x;
    var by = points[1].y;
    var cx = points[2].x;
    var cy = points[2].y;
    return {
      left: (bx - ax) * (cy - ay),
      right: (by - ay) * (cx - ax)
    };
  }

  function orientDouble(points) {
    var ax = points[0].x;
    var ay = points[0].y;
    var bx = points[1].x;
    var by = points[1].y;
    var cx = points[2].x;
    var cy = points[2].y;
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function determinantTermsDouble(points) {
    var ax = points[0].x;
    var ay = points[0].y;
    var bx = points[1].x;
    var by = points[1].y;
    var cx = points[2].x;
    var cy = points[2].y;
    return {
      left: (bx - ax) * (cy - ay),
      right: (by - ay) * (cx - ax)
    };
  }

  function doubleToRational(value) {
    if (!isFinite(value)) throw new Error("non-finite coordinate");
    if (value === 0) return { exp: 0, num: 0n };
    var buffer = new ArrayBuffer(8);
    var view = new DataView(buffer);
    view.setFloat64(0, value, false);
    var bits = view.getBigUint64(0, false);
    var negative = (bits >> 63n) === 1n;
    var exponent = Number((bits >> 52n) & 0x7ffn);
    var fraction = bits & ((1n << 52n) - 1n);
    var num;
    var exp;
    if (exponent === 0) {
      num = fraction;
      exp = -1074;
    } else {
      num = (1n << 52n) + fraction;
      exp = exponent - 1023 - 52;
    }
    return { exp: exp, num: negative ? -num : num };
  }

  function addRat(a, b) {
    if (a.num === 0n) return { exp: b.exp, num: b.num };
    if (b.num === 0n) return { exp: a.exp, num: a.num };
    var exp = Math.min(a.exp, b.exp);
    return {
      exp: exp,
      num: (a.num << BigInt(a.exp - exp)) + (b.num << BigInt(b.exp - exp))
    };
  }

  function negRat(a) {
    return { exp: a.exp, num: -a.num };
  }

  function subRat(a, b) {
    return addRat(a, negRat(b));
  }

  function mulRat(a, b) {
    return { exp: a.exp + b.exp, num: a.num * b.num };
  }

  function signRat(a) {
    return a.num < 0n ? -1 : a.num > 0n ? 1 : 0;
  }

  function orientRoundedExact(numberPoints) {
    var ax = doubleToRational(numberPoints[0].x);
    var ay = doubleToRational(numberPoints[0].y);
    var bx = doubleToRational(numberPoints[1].x);
    var by = doubleToRational(numberPoints[1].y);
    var cx = doubleToRational(numberPoints[2].x);
    var cy = doubleToRational(numberPoints[2].y);
    var termLeft = mulRat(subRat(bx, ax), subRat(cy, ay));
    var termRight = mulRat(subRat(by, ay), subRat(cx, ax));
    return subRat(termLeft, termRight);
  }

  function filterDecision(det, terms) {
    var permanent = Math.abs(terms.left) + Math.abs(terms.right);
    var errBound = (3 + 16 * EPS) * EPS * permanent;
    return {
      errBound: errBound,
      permanent: permanent,
      trusted: Math.abs(det) > errBound
    };
  }

  function toleranceDecision(det, tolerancePower) {
    var tolerance = tolerancePower === 0 ? 0 : Math.pow(10, tolerancePower - 9);
    return {
      sign: Math.abs(det) <= tolerance ? 0 : sign(det),
      tolerance: tolerance
    };
  }

  function roundedLosses(exactPoints, numberPoints) {
    return exactPoints.map(function (point, index) {
      var rounded = numberPoints[index];
      return {
        dx: BigInt(Math.trunc(rounded.x)) - point.x,
        dy: BigInt(Math.trunc(rounded.y)) - point.y,
        id: point.id,
        xChanged: Number(point.x) !== rounded.x || BigInt(Math.trunc(rounded.x)) !== point.x,
        yChanged: Number(point.y) !== rounded.y || BigInt(Math.trunc(rounded.y)) !== point.y
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var generated = makePoints(params);
    var exactPoints = generated.points;
    var numberPoints = exactPoints.map(toNumberPoint);
    var exactDet = orientBig(exactPoints);
    var exactTerms = determinantTermsBig(exactPoints);
    var roundedExact = orientRoundedExact(numberPoints);
    var doubleTerms = determinantTermsDouble(numberPoints);
    var doubleDet = orientDouble(numberPoints);
    var filter = filterDecision(doubleDet, doubleTerms);
    var tolerance = toleranceDecision(doubleDet, params.tolerance);
    var sourceSign = sign(exactDet);
    var roundedSign = signRat(roundedExact);
    var doubleSign = sign(doubleDet);
    var filterSign = filter.trusted ? doubleSign : sourceSign;
    var losses = roundedLosses(exactPoints, numberPoints);
    var inputChanged = losses.some(function (loss) { return loss.xChanged || loss.yChanged; });
    var failureMode = "none";
    if (roundedSign !== sourceSign) failureMode = "input rounding";
    else if (doubleSign !== roundedSign) failureMode = "determinant rounding";
    else if (tolerance.sign !== sourceSign) failureMode = "tolerance collapse";
    return {
      doubleDet: doubleDet,
      doubleSign: doubleSign,
      doubleTerms: doubleTerms,
      exactDet: exactDet,
      exactPoints: exactPoints,
      exactTerms: exactTerms,
      failureMode: failureMode,
      filter: filter,
      filterSign: filterSign,
      generated: generated,
      inputChanged: inputChanged,
      losses: losses,
      numberPoints: numberPoints,
      params: params,
      roundedExact: roundedExact,
      roundedSign: roundedSign,
      scenario: SCENARIOS[params.scenario],
      sourceSign: sourceSign,
      tolerance: tolerance
    };
  }

  function metric(label, value, tone) {
    return '<div class="orient-lab__metric ' + (tone || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 940));
    var compact = width < 680;
    var height = compact ? 1120 : 760;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { compact: compact, ctx: ctx, height: height, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = [];
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    var limit = maxLines || lines.length;
    for (var i = 0; i < Math.min(limit, lines.length); i += 1) {
      var out = lines[i];
      if (i === limit - 1 && lines.length > limit) out = out.replace(/[.,;:]?$/, "") + "...";
      fillText(ctx, out, x, y + i * lineHeight, COLORS.muted, 12, 550);
    }
  }

  function panel(ctx, box, title, subtitle) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    fillText(ctx, title, box.x + 14, box.y + 12, COLORS.ink, 14, 760);
    if (subtitle) wrapText(ctx, subtitle, box.x + 14, box.y + 33, box.w - 28, 15, 2);
  }

  function localPoints(state) {
    var a = state.exactPoints[0];
    return state.exactPoints.map(function (point) {
      return {
        id: point.id,
        x: point.x - a.x,
        y: point.y - a.y
      };
    });
  }

  function drawGeometry(ctx, state, box) {
    panel(ctx, box, "The turn predicate", state.scenario.note);
    var pts = localPoints(state);
    var xs = pts.map(function (p) { return Number(p.x); });
    var ys = pts.map(function (p) { return Number(p.y); });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }
    var pad = 36;
    var plot = {
      x: box.x + pad,
      y: box.y + 76,
      w: box.w - 2 * pad,
      h: box.h - 130
    };
    function px(x) {
      return plot.x + (x - minX) / (maxX - minX) * plot.w;
    }
    function py(y) {
      return plot.y + plot.h - (y - minY) / (maxY - minY) * plot.h;
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + i * plot.w / 4;
      var gy = plot.y + i * plot.h / 4;
      ctx.beginPath();
      ctx.moveTo(gx, plot.y);
      ctx.lineTo(gx, plot.y + plot.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(px(xs[0]), py(ys[0]));
    ctx.lineTo(px(xs[1]), py(ys[1]));
    ctx.lineTo(px(xs[2]), py(ys[2]));
    ctx.closePath();
    ctx.fillStyle = state.sourceSign < 0 ? COLORS.softBad : state.sourceSign > 0 ? COLORS.softGood : COLORS.softGold;
    ctx.fill();
    ctx.strokeStyle = state.sourceSign < 0 ? COLORS.bad : state.sourceSign > 0 ? COLORS.good : COLORS.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    pts.forEach(function (point, index) {
      var x = px(Number(point.x));
      var y = py(Number(point.y));
      ctx.beginPath();
      ctx.fillStyle = [COLORS.blue, COLORS.purple, COLORS.gold][index];
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.white;
      ctx.lineWidth = 2;
      ctx.stroke();
      fillText(ctx, point.id, x, y - 7, COLORS.white, 11, 800, "center");
    });
    fillText(ctx, "local coordinates after subtracting A", plot.x, box.y + box.h - 43, COLORS.muted, 11, 650);
    fillText(ctx, "source exact sign: " + signText(state.sourceSign), plot.x, box.y + box.h - 25, state.sourceSign < 0 ? COLORS.bad : state.sourceSign > 0 ? COLORS.good : COLORS.gold, 12, 800);
  }

  function drawLedgerRow(ctx, label, left, right, det, x, y, w, tone) {
    roundRect(ctx, x, y, w, 48, 7);
    ctx.fillStyle = tone === "bad" ? COLORS.softBad : tone === "warn" ? COLORS.softGold : COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = tone === "bad" ? "#f0b7b7" : tone === "warn" ? "#f1c889" : COLORS.axis;
    ctx.stroke();
    fillText(ctx, label, x + 10, y + 8, COLORS.ink, 12, 760);
    fillText(ctx, "L " + left, x + 112, y + 8, COLORS.blue, 11, 700);
    fillText(ctx, "R " + right, x + 112, y + 26, COLORS.purple, 11, 700);
    fillText(ctx, "det " + det, x + w - 10, y + 17, tone === "bad" ? COLORS.bad : COLORS.ink, 12, 800, "right");
  }

  function drawLedger(ctx, state, box) {
    panel(ctx, box, "The determinant ledger", "orientation(A,B,C) = (Bx-Ax)(Cy-Ay) - (By-Ay)(Cx-Ax)");
    var x = box.x + 16;
    var y = box.y + 82;
    var w = box.w - 32;
    var exactTone = state.sourceSign === state.doubleSign ? "" : "warn";
    drawLedgerRow(ctx, "exact grid", fmtBig(state.exactTerms.left), fmtBig(state.exactTerms.right), fmtBig(state.exactDet), x, y, w, exactTone);
    drawLedgerRow(ctx, "binary64", fmtNumber(state.doubleTerms.left), fmtNumber(state.doubleTerms.right), fmtNumber(state.doubleDet), x, y + 58, w, state.doubleSign !== state.roundedSign ? "bad" : "");
    var rounded = "exact sign of rounded inputs: " + signText(state.roundedSign);
    wrapText(ctx, rounded, x, y + 124, w, 15, 2);
    var bits = Math.max(bitLength(state.exactTerms.left), bitLength(state.exactTerms.right));
    fillText(ctx, "largest exact product width: " + bits + " bits", x, box.y + box.h - 30, COLORS.muted, 12, 650);
  }

  function drawVote(ctx, label, value, x, y, w, expected) {
    var ok = value === expected;
    roundRect(ctx, x, y, w, 42, 7);
    ctx.fillStyle = ok ? COLORS.softGood : COLORS.softBad;
    ctx.fill();
    ctx.strokeStyle = ok ? "#9ed8c5" : "#f0b7b7";
    ctx.stroke();
    fillText(ctx, label, x + 10, y + 7, COLORS.muted, 11, 700);
    fillText(ctx, shortSign(value) + " " + signText(value), x + 10, y + 22, ok ? COLORS.good : COLORS.bad, 12, 820);
  }

  function drawVotes(ctx, state, box) {
    panel(ctx, box, "Four sign votes", "A geometry algorithm branches on this sign, not on the determinant's magnitude.");
    var x = box.x + 16;
    var y = box.y + 78;
    var w = box.w - 32;
    var gap = 10;
    drawVote(ctx, "source exact", state.sourceSign, x, y, w, state.sourceSign);
    drawVote(ctx, "rounded-input exact", state.roundedSign, x, y + 42 + gap, w, state.sourceSign);
    drawVote(ctx, "naive double", state.doubleSign, x, y + 2 * (42 + gap), w, state.sourceSign);
    drawVote(ctx, "epsilon tolerance", state.tolerance.sign, x, y + 3 * (42 + gap), w, state.sourceSign);
  }

  function drawFilter(ctx, state, box) {
    panel(ctx, box, "The filtered predicate", "Try the cheap determinant first; pay for exact arithmetic only when the error bound cannot certify the sign.");
    var x = box.x + 18;
    var y = box.y + 80;
    var w = box.w - 36;
    var ratio = Math.abs(state.doubleDet) / Math.max(state.filter.errBound, Number.MIN_VALUE);
    var capped = Math.min(1, ratio / 4);
    fillText(ctx, "|double det|", x, y, COLORS.ink, 12, 750);
    roundRect(ctx, x, y + 22, w, 18, 8);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.fillStyle = state.filter.trusted ? COLORS.good : COLORS.gold;
    ctx.fillRect(x, y + 22, Math.max(2, w * capped), 18);
    ctx.strokeStyle = COLORS.axis;
    ctx.stroke();
    fillText(ctx, fmtNumber(Math.abs(state.doubleDet)), x + w, y + 49, COLORS.muted, 11, 700, "right");
    fillText(ctx, "error bound " + fmtNumber(state.filter.errBound), x, y + 49, COLORS.muted, 11, 700);
    var verdict = state.filter.trusted ? "fast sign is certified" : "fallback to exact sign";
    roundRect(ctx, x, y + 82, w, 58, 8);
    ctx.fillStyle = state.filter.trusted ? COLORS.softGood : COLORS.softGold;
    ctx.fill();
    fillText(ctx, verdict, x + 12, y + 94, state.filter.trusted ? COLORS.good : COLORS.gold, 14, 820);
    wrapText(ctx, state.failureMode === "input rounding" ? "Caveat: a robust predicate over binary64 inputs cannot recover source coordinates already rounded away." : "The exact fallback restores the predicate sign for this source-coordinate model.", x + 12, y + 116, w - 24, 15, 2);
    fillText(ctx, "final filtered sign: " + signText(state.filterSign), x, box.y + box.h - 30, state.filterSign === state.sourceSign ? COLORS.good : COLORS.bad, 12, 800);
  }

  function boxesFor(setup) {
    var pad = 16;
    var gap = 14;
    if (setup.compact) {
      var w = setup.width - pad * 2;
      return [
        { x: pad, y: pad, w: w, h: 286 },
        { x: pad, y: 318, w: w, h: 238 },
        { x: pad, y: 572, w: w, h: 276 },
        { x: pad, y: 864, w: w, h: 238 }
      ];
    }
    var w2 = (setup.width - pad * 2 - gap) / 2;
    return [
      { x: pad, y: pad, w: w2, h: 352 },
      { x: pad + w2 + gap, y: pad, w: w2, h: 246 },
      { x: pad + w2 + gap, y: 276, w: w2, h: 428 },
      { x: pad, y: 382, w: w2, h: 322 }
    ];
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = boxesFor(setup);
    drawGeometry(ctx, state, boxes[0]);
    drawLedger(ctx, state, boxes[1]);
    drawVotes(ctx, state, boxes[2]);
    drawFilter(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function setScaleBounds(root, params) {
    var meta = SCENARIOS[params.scenario];
    var input = root.querySelector('[data-param="scale"]');
    if (!input) return;
    input.min = String(meta.minScale);
    input.max = String(meta.maxScale);
    input.value = String(params.scale);
  }

  function updateControls(root, state) {
    setScaleBounds(root, state.params);
    var values = {
      scale: state.scenario.scaleLabel + " " + state.params.scale,
      scenario: state.scenario.label,
      tolerance: state.params.tolerance === 0 ? "off" : "1e-" + (9 - state.params.tolerance)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      input.value = String(state.params[key]);
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("case", state.scenario.label),
        metric("source exact", signText(state.sourceSign), "good"),
        metric("rounded input", signText(state.roundedSign), state.roundedSign === state.sourceSign ? "good" : "bad"),
        metric("naive double", signText(state.doubleSign), state.doubleSign === state.sourceSign ? "good" : "bad"),
        metric("failure mode", state.failureMode, state.failureMode === "none" ? "good" : "warn"),
        metric("filter", state.filter.trusted ? "trusted fast path" : "exact fallback", state.filter.trusted ? "good" : "warn")
      ].join("");
    }
    draw(root, state);
    root.__orientationPredicateState = state;
  }

  function init(root) {
    if (!root || root.__orientationPredicateReady) return;
    root.__orientationPredicateReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function audit() {
    var productHard = evaluate({ scenario: "product", scale: 27, tolerance: 0 });
    var productEasy = evaluate({ scenario: "product", scale: 24, tolerance: 0 });
    var inputHard = evaluate({ scenario: "input", scale: 16, tolerance: 0 });
    var inputEasy = evaluate({ scenario: "input", scale: 14, tolerance: 0 });
    var safe = evaluate({ scenario: "safe", scale: 0, tolerance: 0 });
    var tolerance = evaluate({ scenario: "safe", scale: 0, tolerance: 8 });

    assert(productHard.sourceSign === -1, "wide product exact sign should be clockwise");
    assert(productHard.roundedSign === -1, "wide product rounded inputs should preserve the sign");
    assert(productHard.doubleSign === 0, "wide product naive double should collapse to zero at 2^27");
    assert(!productHard.filter.trusted && productHard.filterSign === productHard.sourceSign, "wide product filter should fall back to exact sign");
    assert(productEasy.doubleSign === productEasy.sourceSign, "smaller product case should be safe in double");
    assert(inputHard.sourceSign === 1, "input-rounding exact source sign should be positive");
    assert(inputHard.roundedSign === 0 && inputHard.doubleSign === 0, "input-rounding case should collapse after binary64 conversion");
    assert(inputHard.failureMode === "input rounding", "input case should report input rounding");
    assert(inputEasy.sourceSign === inputEasy.doubleSign && inputEasy.roundedSign === inputEasy.sourceSign, "smaller decimal base should preserve offsets");
    assert(safe.sourceSign === safe.roundedSign && safe.roundedSign === safe.doubleSign, "safe case should agree across methods");
    assert(tolerance.tolerance.sign === safe.sourceSign, "safe tolerance should not flip a large determinant");
    return {
      inputHard: signText(inputHard.sourceSign) + " -> " + signText(inputHard.roundedSign),
      ok: true,
      productHard: signText(productHard.sourceSign) + " -> " + signText(productHard.doubleSign),
      productScale: productHard.params.scale,
      safeSign: signText(safe.sourceSign)
    };
  }

  var api = {
    SCENARIOS: SCENARIOS,
    audit: audit,
    cleanParams: cleanParams,
    doubleToRational: doubleToRational,
    evaluate: evaluate,
    filterDecision: filterDecision,
    orientBig: orientBig,
    orientDouble: orientDouble,
    orientRoundedExact: orientRoundedExact
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.OrientationPredicateLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-orientation-predicate-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
