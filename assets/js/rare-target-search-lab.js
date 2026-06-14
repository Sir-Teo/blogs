(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    hit: "#0f766e",
    miss: "#be123c",
    fa: "#d97706",
    absent: "#64748b",
    fixed: "#2563eb",
    adapted: "#7c3aed",
    target: "#0f766e",
    distractor: "#cbd5df",
    inspected: "#172026"
  };

  var DEFAULTS = {
    prevalence: 2,
    setSize: 18,
    signal: 320,
    prevalencePressure: 75,
    caution: 82
  };

  var TRIALS = 9000;
  var CURVE_TRIALS = 12000;
  var PREVALENCE_GRID = [1, 2, 5, 10, 20, 50];

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
      prevalence: snap(raw.prevalence, DEFAULTS.prevalence, 1, 50, 1),
      setSize: snap(raw.setSize, DEFAULTS.setSize, 4, 32, 1),
      signal: snap(raw.signal, DEFAULTS.signal, 120, 420, 10),
      prevalencePressure: snap(raw.prevalencePressure, DEFAULTS.prevalencePressure, 0, 100, 1),
      caution: snap(raw.caution, DEFAULTS.caution, 35, 100, 1)
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

  function normal(rng) {
    var u = Math.max(1e-9, rng());
    var v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="rare-search-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function policy(params) {
    var p = clamp(params.prevalence / 100, 0.001, 0.999);
    var d = params.signal / 100;
    var pressure = params.prevalencePressure / 100;
    var setSizeCorrection = 0.45 * Math.log(params.setSize) / Math.max(0.3, d);
    var neutralCriterion = d / 2 + setSizeCorrection;
    var prevalenceCriterion = neutralCriterion + Math.log((1 - p) / p) / Math.max(0.3, d);
    var itemCriterion = lerp(neutralCriterion, prevalenceCriterion, pressure);

    var baseFraction = 0.35 + 0.65 * params.caution / 100;
    var prevalenceFraction = clamp(0.22 + 0.78 * Math.sqrt(p / 0.5), 0.18, 1);
    var lookFraction = baseFraction * lerp(1, prevalenceFraction, pressure);
    var maxLooks = clamp(Math.ceil(params.setSize * lookFraction), 1, params.setSize);

    return {
      d: d,
      itemCriterion: itemCriterion,
      maxLooks: maxLooks,
      neutralCriterion: neutralCriterion,
      prevalenceCriterion: prevalenceCriterion
    };
  }

  function makeTrial(params, rng, forcePresent) {
    var pol = policy(params);
    var present = forcePresent == null ? rng() < params.prevalence / 100 : !!forcePresent;
    var targetIndex = present ? Math.floor(rng() * params.setSize) : -1;
    var items = [];

    for (var i = 0; i < params.setSize; i += 1) {
      var isTarget = i === targetIndex;
      var evidence = normal(rng) + (isTarget ? pol.d : 0);
      var guidance = evidence + 0.65 * normal(rng);
      var angle = 2 * Math.PI * (i / params.setSize);
      var radius = 0.18 + 0.76 * ((hash32(i + 11, 0x51A7) % 1000) / 1000);
      items.push({
        evidence: evidence,
        guidance: guidance,
        index: i,
        inspected: false,
        isTarget: isTarget,
        x: 0.5 + 0.44 * radius * Math.cos(angle),
        y: 0.5 + 0.44 * radius * Math.sin(angle)
      });
    }

    var order = items.slice().sort(function (a, b) {
      if (b.guidance !== a.guidance) return b.guidance - a.guidance;
      return a.index - b.index;
    });

    var responsePresent = false;
    var looks = 0;
    for (var j = 0; j < Math.min(pol.maxLooks, order.length); j += 1) {
      looks += 1;
      order[j].inspected = true;
      if (order[j].evidence >= pol.itemCriterion) {
        responsePresent = true;
        break;
      }
    }

    var rt = 420 + 165 * looks + 40 * Math.max(0, params.setSize - 12) / 20 + 22 * normal(rng);
    return {
      hit: present && responsePresent,
      miss: present && !responsePresent,
      falseAlarm: !present && responsePresent,
      correctReject: !present && !responsePresent,
      items: items,
      looks: looks,
      policy: pol,
      present: present,
      responsePresent: responsePresent,
      rt: Math.max(120, rt),
      targetIndex: targetIndex
    };
  }

  function summarize(rows) {
    var counts = {
      correctReject: 0,
      falseAlarm: 0,
      hit: 0,
      miss: 0,
      present: 0,
      absent: 0,
      looks: 0,
      rt: 0,
      targetLooks: 0,
      absentLooks: 0
    };

    rows.forEach(function (row) {
      if (row.present) {
        counts.present += 1;
        counts.targetLooks += row.looks;
      } else {
        counts.absent += 1;
        counts.absentLooks += row.looks;
      }
      if (row.hit) counts.hit += 1;
      if (row.miss) counts.miss += 1;
      if (row.falseAlarm) counts.falseAlarm += 1;
      if (row.correctReject) counts.correctReject += 1;
      counts.looks += row.looks;
      counts.rt += row.rt;
    });

    return {
      correctRejectRate: counts.absent ? counts.correctReject / counts.absent : 0,
      falseAlarmRate: counts.absent ? counts.falseAlarm / counts.absent : 0,
      hitRate: counts.present ? counts.hit / counts.present : 0,
      missRate: counts.present ? counts.miss / counts.present : 0,
      avgLooks: counts.looks / Math.max(1, rows.length),
      avgRt: counts.rt / Math.max(1, rows.length),
      targetLooks: counts.present ? counts.targetLooks / counts.present : 0,
      absentLooks: counts.absent ? counts.absentLooks / counts.absent : 0,
      counts: counts
    };
  }

  function simulate(params, count, seed) {
    var rng = makeRng(seed);
    var rows = [];
    for (var t = 0; t < count; t += 1) rows.push(makeTrial(params, rng, null));
    return summarize(rows);
  }

  function evaluateAt(rawParams, prevalence, pressure, count, seed) {
    var params = cleanParams(rawParams);
    params.prevalence = prevalence;
    params.prevalencePressure = pressure;
    var summary = simulate(params, count, seed);
    var pol = policy(params);
    summary.prevalence = prevalence;
    summary.policy = pol;
    return summary;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var selected = evaluateAt(params, params.prevalence, params.prevalencePressure, TRIALS, 0xA11CE);
    var fixed = evaluateAt(params, params.prevalence, 0, TRIALS, 0xA11CE);
    var curve = PREVALENCE_GRID.map(function (p) {
      return {
        adapted: evaluateAt(params, p, params.prevalencePressure, CURVE_TRIALS, 0xBEEF + p * 101),
        fixed: evaluateAt(params, p, 0, CURVE_TRIALS, 0xBEEF + p * 101),
        prevalence: p
      };
    });
    var exampleParams = cleanParams(params);
    var example = makeTrial(exampleParams, makeRng(0x5EABC), true);
    return {
      curve: curve,
      fixed: fixed,
      params: params,
      selected: selected,
      example: example
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

  function drawPrevalencePanel(ctx, result, box) {
    panelTitle(ctx, box, "Misses versus prevalence", "same evidence, different policy");
    var plot = { x: box.x + 48, y: box.y + 54, w: box.w - 74, h: box.h - 88 };
    drawAxis(ctx, plot);
    function sx(row) {
      return plot.x + (Math.log10(row.prevalence) - Math.log10(1)) / (Math.log10(50) - Math.log10(1)) * plot.w;
    }
    function sy(v) { return plot.y + plot.h - v * plot.h; }
    for (var i = 1; i <= 4; i += 1) {
      var y = plot.y + plot.h * i / 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    var fixedPoints = result.curve.map(function (row) {
      return { prevalence: row.prevalence, value: row.fixed.missRate };
    });
    var adaptedPoints = result.curve.map(function (row) {
      return { prevalence: row.prevalence, value: row.adapted.missRate };
    });
    line(ctx, fixedPoints, sx, function (p) { return sy(p.value); }, COLORS.fixed, 2.2);
    line(ctx, adaptedPoints, sx, function (p) { return sy(p.value); }, COLORS.adapted, 2.5);
    label(ctx, "1%", plot.x, plot.y + plot.h + 18, "left");
    label(ctx, "50%", plot.x + plot.w, plot.y + plot.h + 18, "right");
    label(ctx, "100%", plot.x - 8, plot.y, "right");
    label(ctx, "0%", plot.x - 8, plot.y + plot.h, "right");
    label(ctx, "fixed criteria", plot.x + 8, plot.y + 16, "left", COLORS.fixed);
    label(ctx, "prevalence-adapted", plot.x + 8, plot.y + 34, "left", COLORS.adapted);
  }

  function drawCriteriaPanel(ctx, result, box) {
    panelTitle(ctx, box, "Two thresholds", "item evidence and search termination move separately");
    var plot = { x: box.x + 46, y: box.y + 54, w: box.w - 72, h: box.h - 88 };
    drawAxis(ctx, plot);
    var criterionMax = Math.max.apply(null, result.curve.map(function (row) {
      return row.adapted.policy.itemCriterion;
    }).concat([result.params.signal / 100]));
    function sx(row) {
      return plot.x + (Math.log10(row.prevalence) - Math.log10(1)) / (Math.log10(50) - Math.log10(1)) * plot.w;
    }
    function syCriterion(v) { return plot.y + plot.h - v / criterionMax * plot.h; }
    function syLooks(v) { return plot.y + plot.h - v / result.params.setSize * plot.h; }
    var criterionPoints = result.curve.map(function (row) {
      return { prevalence: row.prevalence, value: row.adapted.policy.itemCriterion };
    });
    var lookPoints = result.curve.map(function (row) {
      return { prevalence: row.prevalence, value: row.adapted.policy.maxLooks };
    });
    line(ctx, criterionPoints, sx, function (p) { return syCriterion(p.value); }, COLORS.miss, 2.4);
    line(ctx, lookPoints, sx, function (p) { return syLooks(p.value); }, COLORS.hit, 2.4);
    label(ctx, "stricter item criterion", plot.x + 8, plot.y + 16, "left", COLORS.miss);
    label(ctx, "items inspected", plot.x + 8, plot.y + 34, "left", COLORS.hit);
    label(ctx, "1%", plot.x, plot.y + plot.h + 18, "left");
    label(ctx, "50%", plot.x + plot.w, plot.y + plot.h + 18, "right");
  }

  function drawOutcomePanel(ctx, result, box) {
    panelTitle(ctx, box, "Selected condition", "target-present and target-absent outcomes");
    var x = box.x + 16;
    var y = box.y + 62;
    var w = box.w - 32;
    var h = 18;
    var selected = result.selected;
    var targetBars = [
      { label: "hits", value: selected.hitRate, color: COLORS.hit },
      { label: "misses", value: selected.missRate, color: COLORS.miss }
    ];
    var absentBars = [
      { label: "correct rejects", value: selected.correctRejectRate, color: COLORS.absent },
      { label: "false alarms", value: selected.falseAlarmRate, color: COLORS.fa }
    ];
    function stacked(row, yy, title) {
      label(ctx, title, x, yy - 18, "left", COLORS.text);
      var cursor = x;
      row.forEach(function (bar) {
        var bw = w * bar.value;
        ctx.fillStyle = bar.color;
        ctx.fillRect(cursor, yy, bw, h);
        cursor += bw;
      });
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(x, yy, w, h);
      var lx = x;
      row.forEach(function (bar) {
        ctx.fillStyle = bar.color;
        ctx.fillRect(lx, yy + 38, 10, 10);
        label(ctx, bar.label + " " + formatPct(bar.value), lx + 15, yy + 43, "left", COLORS.text);
        lx += Math.max(92, w / 2);
      });
    }
    stacked(targetBars, y, "When target is present");
    stacked(absentBars, y + 112, "When target is absent");
  }

  function drawDisplayPanel(ctx, result, box) {
    panelTitle(ctx, box, "One target-present display", "rings show inspected items before response or quitting");
    var cx = box.x + box.w / 2;
    var cy = box.y + 148;
    var r = Math.min(box.w, box.h) * 0.33;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();
    result.example.items.forEach(function (item) {
      var x = cx + (item.x - 0.5) * 2 * r;
      var y = cy + (item.y - 0.5) * 2 * r;
      var size = item.isTarget ? 7 : 5;
      ctx.fillStyle = item.isTarget ? COLORS.target : COLORS.distractor;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();
      if (item.inspected) {
        ctx.strokeStyle = COLORS.inspected;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
    label(ctx, "target", box.x + 16, box.y + box.h - 42, "left", COLORS.target);
    label(ctx, "inspected before stopping", box.x + 16, box.y + box.h - 23, "left", COLORS.inspected);
    label(ctx, result.example.responsePresent ? "response: present" : "response: absent", box.x + box.w - 16, box.y + box.h - 32, "right", result.example.responsePresent ? COLORS.hit : COLORS.miss);
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

    drawPrevalencePanel(ctx, result, boxes[0]);
    drawCriteriaPanel(ctx, result, boxes[1]);
    drawOutcomePanel(ctx, result, boxes[2]);
    drawDisplayPanel(ctx, result, boxes[3]);
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
      caution: params.caution + "%",
      prevalence: params.prevalence + "%",
      prevalencePressure: params.prevalencePressure + "%",
      setSize: params.setSize,
      signal: formatNumber(params.signal / 100, 1)
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
        metric("Miss rate", formatPct(result.selected.missRate)),
        metric("False alarms", formatPct(result.selected.falseAlarmRate, 1)),
        metric("Avg inspected", formatNumber(result.selected.avgLooks, 1)),
        metric("Quit depth", result.selected.policy.maxLooks + " / " + result.params.setSize),
        metric("Criterion", formatNumber(result.selected.policy.itemCriterion, 2))
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
    global.document.querySelectorAll("[data-rare-target-search-lab]").forEach(init);
  }

  global.RareTargetSearchLab = {
    evaluate: evaluate,
    policy: policy
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.RareTargetSearchLab;
  }

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
