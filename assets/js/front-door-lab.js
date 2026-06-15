(function (root) {
  "use strict";

  var COLORS = {
    truth: "#0f766e",
    front: "#2563eb",
    naive: "#be123c",
    bad: "#be123c",
    leak: "#d97706",
    mediator: "#7c3aed",
    hidden: "#64748b",
    panel: "#f8fafc",
    rule: "#d7dee5",
    text: "#172026",
    muted: "#5d6872"
  };

  var DEFAULTS = {
    confounding: 75,
    mediator: 72,
    outcome: 72,
    direct: 0,
    mediatorLeak: 0
  };

  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }

  function sign01(value) {
    return value ? 1 : -1;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      confounding: clamp(Math.round(finite(raw.confounding == null ? DEFAULTS.confounding : raw.confounding, DEFAULTS.confounding)), 0, 100),
      mediator: clamp(Math.round(finite(raw.mediator == null ? DEFAULTS.mediator : raw.mediator, DEFAULTS.mediator)), 0, 100),
      outcome: clamp(Math.round(finite(raw.outcome == null ? DEFAULTS.outcome : raw.outcome, DEFAULTS.outcome)), 0, 100),
      direct: clamp(Math.round(finite(raw.direct == null ? DEFAULTS.direct : raw.direct, DEFAULTS.direct)), 0, 100),
      mediatorLeak: clamp(Math.round(finite(raw.mediatorLeak == null ? DEFAULTS.mediatorLeak : raw.mediatorLeak, DEFAULTS.mediatorLeak)), 0, 100)
    };
  }

  function scales(params) {
    return {
      confounding: 2.2 * params.confounding / 100,
      mediator: 2.35 * params.mediator / 100,
      outcome: 2.15 * params.outcome / 100,
      direct: 1.65 * params.direct / 100,
      mediatorLeak: 1.65 * params.mediatorLeak / 100
    };
  }

  function mechanisms(params) {
    var s = scales(params);
    return {
      pX: function (u) {
        return sigmoid(-0.05 + s.confounding * sign01(u));
      },
      pM: function (x, u) {
        return sigmoid(-0.15 + s.mediator * sign01(x) + s.mediatorLeak * sign01(u));
      },
      pY: function (m, x, u) {
        return sigmoid(-0.45 + s.outcome * sign01(m) + 0.9 * s.confounding * sign01(u) + s.direct * sign01(x));
      }
    };
  }

  function jointDistribution(params) {
    var mech = mechanisms(params);
    var rows = [];
    for (var u = 0; u <= 1; u += 1) {
      var pu = 0.5;
      var px1 = mech.pX(u);
      for (var x = 0; x <= 1; x += 1) {
        var px = x ? px1 : 1 - px1;
        var pm1 = mech.pM(x, u);
        for (var m = 0; m <= 1; m += 1) {
          var pm = m ? pm1 : 1 - pm1;
          var py1 = mech.pY(m, x, u);
          for (var y = 0; y <= 1; y += 1) {
            rows.push({
              u: u,
              x: x,
              m: m,
              y: y,
              p: pu * px * pm * (y ? py1 : 1 - py1)
            });
          }
        }
      }
    }
    return rows;
  }

  function sumWhere(rows, predicate) {
    var total = 0;
    for (var i = 0; i < rows.length; i += 1) {
      if (predicate(rows[i])) total += rows[i].p;
    }
    return total;
  }

  function ratio(num, den) {
    return den <= 1e-14 ? 0 : num / den;
  }

  function observed(rows) {
    function pX(x) {
      return sumWhere(rows, function (r) { return r.x === x; });
    }
    function pMGivenX(m, x) {
      return ratio(
        sumWhere(rows, function (r) { return r.m === m && r.x === x; }),
        pX(x)
      );
    }
    function pYGivenX(x) {
      return ratio(
        sumWhere(rows, function (r) { return r.y === 1 && r.x === x; }),
        pX(x)
      );
    }
    function pYGivenMX(m, x) {
      return ratio(
        sumWhere(rows, function (r) { return r.y === 1 && r.m === m && r.x === x; }),
        sumWhere(rows, function (r) { return r.m === m && r.x === x; })
      );
    }
    function pM(m) {
      return sumWhere(rows, function (r) { return r.m === m; });
    }
    return {
      pX: pX,
      pMGivenX: pMGivenX,
      pYGivenX: pYGivenX,
      pYGivenMX: pYGivenMX,
      pM: pM
    };
  }

  function doY(params, x) {
    var mech = mechanisms(params);
    var total = 0;
    for (var u = 0; u <= 1; u += 1) {
      var pu = 0.5;
      var pm1 = mech.pM(x, u);
      for (var m = 0; m <= 1; m += 1) {
        total += pu * (m ? pm1 : 1 - pm1) * mech.pY(m, x, u);
      }
    }
    return total;
  }

  function frontDoor(rows, x) {
    var obs = observed(rows);
    var total = 0;
    for (var m = 0; m <= 1; m += 1) {
      var yDoM = 0;
      for (var xp = 0; xp <= 1; xp += 1) {
        yDoM += obs.pYGivenMX(m, xp) * obs.pX(xp);
      }
      total += obs.pMGivenX(m, x) * yDoM;
    }
    return total;
  }

  function mediatedAdjustment(rows, x) {
    var obs = observed(rows);
    var total = 0;
    for (var m = 0; m <= 1; m += 1) {
      total += obs.pYGivenMX(m, x) * obs.pM(m);
    }
    return total;
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var rows = jointDistribution(params);
    var obs = observed(rows);
    var trueDo0 = doY(params, 0);
    var trueDo1 = doY(params, 1);
    var fd0 = frontDoor(rows, 0);
    var fd1 = frontDoor(rows, 1);
    var naive0 = obs.pYGivenX(0);
    var naive1 = obs.pYGivenX(1);
    var med0 = mediatedAdjustment(rows, 0);
    var med1 = mediatedAdjustment(rows, 1);
    return {
      params: params,
      rows: rows,
      obs: {
        pX0: obs.pX(0),
        pX1: obs.pX(1),
        pM1X0: obs.pMGivenX(1, 0),
        pM1X1: obs.pMGivenX(1, 1),
        pY1X0: naive0,
        pY1X1: naive1,
        yTable: [
          [obs.pYGivenMX(0, 0), obs.pYGivenMX(0, 1)],
          [obs.pYGivenMX(1, 0), obs.pYGivenMX(1, 1)]
        ]
      },
      estimates: {
        trueDo0: trueDo0,
        trueDo1: trueDo1,
        trueEffect: trueDo1 - trueDo0,
        frontDoor0: fd0,
        frontDoor1: fd1,
        frontDoorEffect: fd1 - fd0,
        naive0: naive0,
        naive1: naive1,
        naiveEffect: naive1 - naive0,
        mediated0: med0,
        mediated1: med1,
        mediatedEffect: med1 - med0,
        frontDoorBias: (fd1 - fd0) - (trueDo1 - trueDo0),
        naiveBias: (naive1 - naive0) - (trueDo1 - trueDo0),
        mediatedBias: (med1 - med0) - (trueDo1 - trueDo0)
      }
    };
  }

  function roundedFacts(result) {
    function rounded(value) {
      var out = Number(value.toFixed(4));
      return Object.is(out, -0) ? 0 : out;
    }
    return {
      trueEffect: rounded(result.estimates.trueEffect),
      frontDoorEffect: rounded(result.estimates.frontDoorEffect),
      naiveEffect: rounded(result.estimates.naiveEffect),
      mediatedEffect: rounded(result.estimates.mediatedEffect),
      frontDoorBias: rounded(result.estimates.frontDoorBias),
      naiveBias: rounded(result.estimates.naiveBias),
      pM1X1: rounded(result.obs.pM1X1),
      pM1X0: rounded(result.obs.pM1X0)
    };
  }

  function check(name, condition, failures) {
    if (!condition) failures.push(name);
  }

  function runAudit() {
    var failures = [];
    var checked = 0;
    function record(name, condition) {
      checked += 1;
      check(name, condition, failures);
    }

    var clean = cleanParams({ confounding: -5, mediator: 999, outcome: "x", direct: 200, mediatorLeak: -8 });
    record("sanitizes parameter bounds", clean.confounding === 0 && clean.mediator === 100 && clean.outcome === DEFAULTS.outcome && clean.direct === 100 && clean.mediatorLeak === 0);

    var defaults = evaluate(DEFAULTS);
    var totalP = defaults.rows.reduce(function (s, r) { return s + r.p; }, 0);
    record("joint sums to one", Math.abs(totalP - 1) < 1e-12);
    record("front-door recovers default truth", Math.abs(defaults.estimates.frontDoorEffect - defaults.estimates.trueEffect) < 1e-12);
    record("naive default is confounded", Math.abs(defaults.estimates.naiveBias) > 0.1);
    record("mediator probabilities ordered", defaults.obs.pM1X1 > defaults.obs.pM1X0);
    record("probabilities in range", defaults.rows.every(function (row) { return row.p >= -1e-14 && row.p <= 1 + 1e-14; }));

    var directBreak = evaluate({ confounding: 75, mediator: 72, outcome: 72, direct: 45, mediatorLeak: 0 });
    record("direct path breaks front-door", Math.abs(directBreak.estimates.frontDoorBias) > 0.05);
    var mediatorBreak = evaluate({ confounding: 75, mediator: 72, outcome: 72, direct: 0, mediatorLeak: 45 });
    record("mediator leak breaks front-door", Math.abs(mediatorBreak.estimates.frontDoorBias) > 0.04);

    var gridCases = 0;
    [0, 35, 75, 100].forEach(function (confounding) {
      [20, 70, 100].forEach(function (mediator) {
        [25, 70, 100].forEach(function (outcome) {
          var out = evaluate({ confounding: confounding, mediator: mediator, outcome: outcome, direct: 0, mediatorLeak: 0 });
          gridCases += 1;
          if (Math.abs(out.estimates.frontDoorEffect - out.estimates.trueEffect) > 1e-10) {
            failures.push("front-door grid " + JSON.stringify({ confounding: confounding, mediator: mediator, outcome: outcome }));
          }
          if (!Object.keys(roundedFacts(out)).every(function (key) { return Number.isFinite(roundedFacts(out)[key]); })) {
            failures.push("finite grid " + JSON.stringify({ confounding: confounding, mediator: mediator, outcome: outcome }));
          }
        });
      });
    });
    record("valid grid executed", gridCases === 36);

    var invalidCases = 0;
    [25, 60, 90].forEach(function (direct) {
      [0, 40, 80].forEach(function (leak) {
        var out = evaluate({ confounding: 75, mediator: 72, outcome: 72, direct: direct, mediatorLeak: leak });
        invalidCases += 1;
        if (![out.estimates.trueEffect, out.estimates.frontDoorEffect, out.estimates.naiveEffect].every(Number.isFinite)) {
          failures.push("finite invalid grid " + JSON.stringify({ direct: direct, leak: leak }));
        }
      });
    });
    record("invalid grid executed", invalidCases === 9);

    return {
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases + invalidCases,
      failures: failures,
      defaultFacts: roundedFacts(defaults)
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function fmt(value, digits) {
    digits = digits == null ? 3 : digits;
    if (Math.abs(value) < 0.5 * Math.pow(10, -digits)) value = 0;
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    });
  }

  function fmtPct(value, digits) {
    return fmt(100 * value, digits == null ? 1 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="front-door-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 620 ? 1120 : 760;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 600) + " " + (options.size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 22, { size: 13, weight: 820 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 43, { size: 10.5, color: COLORS.muted, weight: 650 });
  }

  function arrow(ctx, x1, y1, x2, y2, color, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    var angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(angle - 0.45), y2 - 8 * Math.sin(angle - 0.45));
    ctx.lineTo(x2 - 8 * Math.cos(angle + 0.45), y2 - 8 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function node(ctx, x, y, label, color, hidden) {
    ctx.fillStyle = hidden ? "#eef2f7" : "#ffffff";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 34, y - 22, 68, 44, 10);
    ctx.fill();
    ctx.stroke();
    text(ctx, label, x, y, { align: "center", color: color, size: 13, weight: 850 });
  }

  function drawGraph(ctx, box, result) {
    panel(ctx, box, "Causal story", "U is hidden; M is observed after treatment");
    var cx = box.x + box.w / 2;
    var y = box.y + box.h * 0.54;
    var u = { x: cx, y: box.y + 88 };
    var x = { x: box.x + box.w * 0.20, y: y };
    var m = { x: box.x + box.w * 0.50, y: y };
    var yy = { x: box.x + box.w * 0.80, y: y };
    arrow(ctx, x.x + 34, x.y, m.x - 34, m.y, COLORS.mediator, false);
    arrow(ctx, m.x + 34, m.y, yy.x - 34, yy.y, COLORS.mediator, false);
    arrow(ctx, u.x - 12, u.y + 22, x.x + 10, x.y - 22, COLORS.hidden, false);
    arrow(ctx, u.x + 12, u.y + 22, yy.x - 10, yy.y - 22, COLORS.hidden, false);
    if (result.params.direct > 0) arrow(ctx, x.x + 26, x.y + 18, yy.x - 28, yy.y + 18, COLORS.bad, true);
    if (result.params.mediatorLeak > 0) arrow(ctx, u.x, u.y + 23, m.x, m.y - 23, COLORS.leak, true);
    node(ctx, u.x, u.y, "U", COLORS.hidden, true);
    node(ctx, x.x, x.y, "X", COLORS.truth, false);
    node(ctx, m.x, m.y, "M", COLORS.mediator, false);
    node(ctx, yy.x, yy.y, "Y", COLORS.truth, false);
    text(ctx, "observed path", m.x, y + 48, { align: "center", color: COLORS.mediator, size: 10, weight: 750 });
    text(ctx, "hidden common cause", u.x, u.y - 34, { align: "center", color: COLORS.hidden, size: 10, weight: 750 });
    if (result.params.direct > 0) text(ctx, "direct leak", cx, y + 78, { align: "center", color: COLORS.bad, size: 10, weight: 800 });
    if (result.params.mediatorLeak > 0) text(ctx, "mediator leak", m.x + 42, (u.y + y) / 2, { color: COLORS.leak, size: 10, weight: 800 });
  }

  function drawBars(ctx, box, result) {
    panel(ctx, box, "Effect estimates", "P(Y=1 | do(X=1)) minus P(Y=1 | do(X=0))");
    var rows = [
      { label: "true do-effect", value: result.estimates.trueEffect, color: COLORS.truth },
      { label: "front-door", value: result.estimates.frontDoorEffect, color: COLORS.front },
      { label: "naive association", value: result.estimates.naiveEffect, color: COLORS.naive },
      { label: "condition on M", value: result.estimates.mediatedEffect, color: COLORS.leak }
    ];
    var values = rows.map(function (row) { return row.value; }).concat([0]);
    var lo = Math.min.apply(null, values);
    var hi = Math.max.apply(null, values);
    var pad = Math.max(0.05, 0.16 * (hi - lo));
    lo -= pad;
    hi += pad;
    var x0 = box.x + 34;
    var x1 = box.x + box.w - 18;
    var zero = x0 + (0 - lo) / (hi - lo) * (x1 - x0);
    var y = box.y + 76;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zero, box.y + 62);
    ctx.lineTo(zero, box.y + box.h - 22);
    ctx.stroke();
    rows.forEach(function (row, i) {
      var yy = y + i * 44;
      var end = x0 + (row.value - lo) / (hi - lo) * (x1 - x0);
      ctx.fillStyle = row.color;
      ctx.fillRect(Math.min(zero, end), yy, Math.max(2, Math.abs(end - zero)), 24);
      text(ctx, row.label, x0, yy - 12, { color: COLORS.muted, size: 10.5, weight: 730 });
      text(ctx, fmt(row.value, 3), x1 - 2, yy + 12, { align: "right", color: COLORS.text, size: 11, weight: 820 });
    });
  }

  function drawMechanisms(ctx, box, result) {
    panel(ctx, box, "Observed pieces", "the front-door formula uses these conditionals");
    var rows = [
      { label: "P(M=1 | X=0)", value: result.obs.pM1X0, color: COLORS.mediator },
      { label: "P(M=1 | X=1)", value: result.obs.pM1X1, color: COLORS.mediator },
      { label: "P(Y=1 | M=0,X=0)", value: result.obs.yTable[0][0], color: COLORS.truth },
      { label: "P(Y=1 | M=1,X=1)", value: result.obs.yTable[1][1], color: COLORS.truth }
    ];
    var x = box.x + 22;
    var y = box.y + 76;
    var w = box.w - 44;
    rows.forEach(function (row, i) {
      var yy = y + i * 42;
      ctx.fillStyle = COLORS.rule;
      ctx.fillRect(x, yy, w, 22);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, yy, w * row.value, 22);
      text(ctx, row.label, x, yy - 11, { color: COLORS.muted, size: 10.5, weight: 730 });
      text(ctx, fmtPct(row.value, 1), x + w - 7, yy + 11, { align: "right", color: "#ffffff", size: 11, weight: 850 });
    });
  }

  function drawBias(ctx, box, result) {
    panel(ctx, box, "Bias ledger", "zero is what an identifying formula should hit");
    var rows = [
      { label: "front-door bias", value: result.estimates.frontDoorBias, color: COLORS.front },
      { label: "naive bias", value: result.estimates.naiveBias, color: COLORS.naive },
      { label: "condition-on-M bias", value: result.estimates.mediatedBias, color: COLORS.leak }
    ];
    var maxAbs = Math.max.apply(null, rows.map(function (row) { return Math.abs(row.value); }).concat([0.02]));
    var x = box.x + 34;
    var w = box.w - 60;
    var zero = x + w / 2;
    var y = box.y + 82;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(zero, box.y + 62);
    ctx.lineTo(zero, box.y + box.h - 24);
    ctx.stroke();
    rows.forEach(function (row, i) {
      var yy = y + i * 52;
      var half = w / 2;
      var end = zero + half * row.value / maxAbs;
      ctx.fillStyle = row.color;
      ctx.fillRect(Math.min(zero, end), yy, Math.max(2, Math.abs(end - zero)), 25);
      text(ctx, row.label, x, yy - 13, { color: COLORS.muted, size: 10.5, weight: 730 });
      text(ctx, fmt(row.value, 3), x + w - 2, yy + 12, { align: "right", color: COLORS.text, size: 11, weight: 820 });
    });
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.width;
    var h = setup.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    var gap = 14;
    if (w < 620) {
      var panelH = (h - 5 * gap) / 4;
      drawGraph(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawBars(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawMechanisms(ctx, { x: 0, y: 2 * (panelH + gap), w: w, h: panelH }, result);
      drawBias(ctx, { x: 0, y: 3 * (panelH + gap), w: w, h: panelH }, result);
      return;
    }
    var leftW = w * 0.52 - gap / 2;
    var rightW = w - leftW - gap;
    var topH = h * 0.52 - gap / 2;
    var bottomH = h - topH - gap;
    drawGraph(ctx, { x: 0, y: 0, w: leftW, h: topH }, result);
    drawBars(ctx, { x: leftW + gap, y: 0, w: rightW, h: topH }, result);
    drawMechanisms(ctx, { x: 0, y: topH + gap, w: leftW, h: bottomH }, result);
    drawBias(ctx, { x: leftW + gap, y: topH + gap, w: rightW, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      output.textContent = params[key] + "%";
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    var audit = cachedAudit();
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true do-effect", fmt(result.estimates.trueEffect, 3)),
        metric("front-door", fmt(result.estimates.frontDoorEffect, 3)),
        metric("naive", fmt(result.estimates.naiveEffect, 3)),
        metric("front-door bias", fmt(result.estimates.frontDoorBias, 3)),
        metric("assumption leaks", result.params.direct + "%/" + result.params.mediatorLeak + "%"),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    draw(result, container.querySelector("canvas[data-canvas]"));
  }

  function mount(container) {
    var schedule = null;
    function requestRender() {
      if (schedule != null) root.cancelAnimationFrame(schedule);
      schedule = root.requestAnimationFrame(function () {
        schedule = null;
        render(container);
      });
    }
    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    root.addEventListener("resize", requestRender);
    requestRender();
  }

  var api = {
    DEFAULTS: DEFAULTS,
    cleanParams: cleanParams,
    jointDistribution: jointDistribution,
    observed: observed,
    doY: doY,
    frontDoor: frontDoor,
    evaluate: evaluate,
    roundedFacts: roundedFacts,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FrontDoorLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-front-door-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-front-door-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
