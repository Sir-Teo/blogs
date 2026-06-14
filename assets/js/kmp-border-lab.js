(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    naive: "#b45309",
    kmp: "#0f766e",
    fallback: "#be123c",
    border: "#2563eb",
    match: "#7c3aed",
    faint: "#e6edf3",
    white: "#ffffff"
  };

  var DEFAULTS = {
    scenario: "run",
    textLength: 220,
    patternLength: 10,
    plants: "none",
    focus: 55
  };

  var SCENARIOS = ["run", "overlap", "logs", "dna"];
  var PLANTS = ["none", "sparse", "dense"];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function numberParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      scenario: nearest(raw.scenario, SCENARIOS, DEFAULTS.scenario),
      textLength: Math.round(clamp(numberParam(raw, "textLength"), 80, 360)),
      patternLength: Math.round(clamp(numberParam(raw, "patternLength"), 5, 18)),
      plants: nearest(raw.plants, PLANTS, DEFAULTS.plants),
      focus: Math.round(clamp(numberParam(raw, "focus"), 0, 100))
    };
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) < 1000) return String(Math.round(value));
    return (value / 1000).toFixed(value < 10000 ? 1 : 0) + "k";
  }

  function percent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return Math.round(100 * value) + "%";
  }

  function repeatToLength(seed, length) {
    var out = "";
    while (out.length < length) out += seed;
    return out.slice(0, length);
  }

  function overlapPattern(length) {
    if (length === 5) return "abaca";
    return repeatToLength("ab", Math.max(1, length - 2)) + "ca";
  }

  function logPattern(length) {
    if (length <= 7) return "ERR:" + repeatToLength("7", length - 4);
    return ("ERR:" + repeatToLength("CACHE", length - 5) + "!").slice(0, length);
  }

  function dnaPattern(length) {
    if (length <= 6) return repeatToLength("ACACG", length);
    return (repeatToLength("AC", length - 3) + "GTA").slice(0, length);
  }

  function patternFor(params) {
    if (params.scenario === "overlap") return overlapPattern(params.patternLength);
    if (params.scenario === "logs") return logPattern(params.patternLength);
    if (params.scenario === "dna") return dnaPattern(params.patternLength);
    return "a".repeat(Math.max(1, params.patternLength - 1)) + "b";
  }

  function baseText(params, pattern) {
    var n = params.textLength;
    if (params.scenario === "overlap") {
      return repeatToLength("ababababacabababx", n);
    }
    if (params.scenario === "logs") {
      return repeatToLength("INFO:cache-ok|WARN:queue-07|TRACE:evict|", n);
    }
    if (params.scenario === "dna") {
      return repeatToLength("ACACACACGTACACACCTACACAC", n);
    }
    return "a".repeat(n);
  }

  function spliceAt(text, insert, index) {
    if (index < 0 || index >= text.length) return text;
    var chars = text.split("");
    for (var j = 0; j < insert.length && index + j < chars.length; j += 1) {
      chars[index + j] = insert[j];
    }
    return chars.join("");
  }

  function plantMatches(text, pattern, mode) {
    if (mode === "none") return text;
    var slots = mode === "dense"
      ? [0.12, 0.28, 0.44, 0.60, 0.76]
      : [0.30, 0.68];
    var out = text;
    slots.forEach(function (fraction) {
      var at = Math.round(fraction * Math.max(0, out.length - pattern.length));
      out = spliceAt(out, pattern, at);
    });
    return out;
  }

  function makeScenario(raw) {
    var params = cleanParams(raw);
    var pattern = patternFor(params);
    var text = plantMatches(baseText(params, pattern), pattern, params.plants);
    return { params: params, pattern: pattern, text: text };
  }

  function prefixFunction(pattern) {
    var pi = new Array(pattern.length).fill(0);
    for (var i = 1; i < pattern.length; i += 1) {
      var j = pi[i - 1];
      while (j > 0 && pattern[i] !== pattern[j]) j = pi[j - 1];
      if (pattern[i] === pattern[j]) j += 1;
      pi[i] = j;
    }
    return pi;
  }

  function chainFrom(pi, length) {
    var chain = [];
    var q = length;
    while (q > 0) {
      chain.push(q);
      q = pi[q - 1];
    }
    chain.push(0);
    return chain;
  }

  function naiveSearch(text, pattern) {
    var comparisons = 0;
    var matches = [];
    var alignments = [];
    var limit = Math.max(0, text.length - pattern.length);

    for (var shift = 0; shift <= limit; shift += 1) {
      var cost = 0;
      var matched = 0;
      for (var j = 0; j < pattern.length; j += 1) {
        comparisons += 1;
        cost += 1;
        if (text[shift + j] !== pattern[j]) break;
        matched += 1;
      }
      if (matched === pattern.length) matches.push(shift);
      alignments.push({ shift: shift, cost: cost, matched: matched });
    }

    return { alignments: alignments, comparisons: comparisons, matches: matches };
  }

  function kmpSearch(text, pattern, suppliedPi) {
    var pi = suppliedPi || prefixFunction(pattern);
    var comparisons = 0;
    var fallbacks = 0;
    var matches = [];
    var events = [];
    var qTrace = [];
    var perPosition = new Array(text.length).fill(0);
    var q = 0;

    for (var i = 0; i < text.length; i += 1) {
      var ch = text[i];
      while (q > 0 && pattern[q] !== ch) {
        comparisons += 1;
        perPosition[i] += 1;
        events.push({ type: "fallback", i: i, char: ch, from: q, to: pi[q - 1] });
        q = pi[q - 1];
        fallbacks += 1;
      }

      comparisons += 1;
      perPosition[i] += 1;
      if (pattern[q] === ch) {
        q += 1;
        events.push({ type: "advance", i: i, char: ch, q: q });
      } else {
        events.push({ type: "root-miss", i: i, char: ch, q: q });
      }

      if (q === pattern.length) {
        matches.push(i - pattern.length + 1);
        events.push({ type: "emit", i: i, start: i - pattern.length + 1, q: q });
        q = pi[q - 1];
      }

      qTrace.push(q);
    }

    return {
      comparisons: comparisons,
      events: events,
      fallbacks: fallbacks,
      matches: matches,
      perPosition: perPosition,
      qTrace: qTrace
    };
  }

  function arraysEqual(left, right) {
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function selectedFallback(data) {
    var events = data.kmp.events.filter(function (event) {
      return event.type === "fallback";
    });
    if (!events.length) return null;
    var index = Math.round((data.params.focus / 100) * (events.length - 1));
    return events[clamp(index, 0, events.length - 1)];
  }

  function evaluate(raw) {
    var scenario = makeScenario(raw);
    var pi = prefixFunction(scenario.pattern);
    var naive = naiveSearch(scenario.text, scenario.pattern);
    var kmp = kmpSearch(scenario.text, scenario.pattern, pi);
    var saved = naive.comparisons - kmp.comparisons;
    var sameMatches = arraysEqual(naive.matches, kmp.matches);
    var longestBorder = pi.reduce(function (best, value) {
      return Math.max(best, value);
    }, 0);

    var data = {
      params: scenario.params,
      text: scenario.text,
      pattern: scenario.pattern,
      pi: pi,
      chain: chainFrom(pi, scenario.pattern.length),
      naive: naive,
      kmp: kmp,
      summary: {
        fallbackEvent: null,
        longestBorder: longestBorder,
        matchCount: kmp.matches.length,
        ratio: naive.comparisons / Math.max(1, kmp.comparisons),
        sameMatches: sameMatches,
        saved: saved,
        savedShare: saved / Math.max(1, naive.comparisons)
      }
    };
    data.summary.fallbackEvent = selectedFallback(data);
    return data;
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      output.textContent = String(params[key]);
    });
  }

  function metric(label, value) {
    return '<div class="kmp-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var metrics = [
      metric("naive comparisons", compactNumber(data.naive.comparisons)),
      metric("KMP comparisons", compactNumber(data.kmp.comparisons)),
      metric("saved", percent(data.summary.savedShare)),
      metric("matches", compactNumber(data.summary.matchCount)),
      metric("fallback jumps", compactNumber(data.kmp.fallbacks)),
      metric("longest border", compactNumber(data.summary.longestBorder))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = metrics;
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var height = targetHeight;
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
  }

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 14, box.y + 23);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawText(ctx, text, x, y, color, font) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = font || "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(text, x, y);
  }

  function drawPrefixPanel(ctx, data, box) {
    panel(ctx, box, "Prefix table: the border memory");
    var pad = 14;
    var x0 = box.x + pad;
    var y0 = box.y + 42;
    var w = box.w - pad * 2;
    var cell = Math.min(34, w / data.pattern.length);
    var left = x0 + Math.max(0, (w - cell * data.pattern.length) / 2);

    drawText(ctx, "P", x0, y0 + 20, COLORS.muted, "700 12px system-ui, sans-serif");
    drawText(ctx, "pi", x0, y0 + 55, COLORS.muted, "700 12px system-ui, sans-serif");

    for (var i = 0; i < data.pattern.length; i += 1) {
      var x = left + i * cell;
      ctx.fillStyle = COLORS.white;
      ctx.strokeStyle = COLORS.rule;
      ctx.strokeRect(x, y0, cell, 28);
      ctx.strokeRect(x, y0 + 35, cell, 28);
      drawText(ctx, data.pattern[i], x + cell / 2 - 4, y0 + 19, COLORS.text);
      drawText(ctx, String(data.pi[i]), x + cell / 2 - 4, y0 + 54, data.pi[i] ? COLORS.border : COLORS.muted);
    }

    var barY = y0 + 89;
    var barH = Math.max(28, box.h - 146);
    var maxPi = Math.max(1, data.pattern.length - 1);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, barY + barH);
    ctx.lineTo(left + cell * data.pattern.length, barY + barH);
    ctx.stroke();
    for (var b = 0; b < data.pi.length; b += 1) {
      var bh = (data.pi[b] / maxPi) * barH;
      ctx.fillStyle = data.pi[b] ? COLORS.border : COLORS.faint;
      ctx.fillRect(left + b * cell + 3, barY + barH - bh, Math.max(2, cell - 6), bh);
    }

    var chain = data.chain.join(" -> ");
    drawText(ctx, "full-pattern fallback chain: " + chain, x0, box.y + box.h - 16, COLORS.muted, "12px system-ui, sans-serif");
  }

  function drawTimelinePanel(ctx, data, box) {
    panel(ctx, box, "KMP scan: q rises, then falls along borders");
    var pad = 38;
    var x0 = box.x + pad;
    var y0 = box.y + 42;
    var w = box.w - pad - 16;
    var h = box.h - 72;
    var maxQ = Math.max(1, data.pattern.length);
    var n = Math.max(1, data.text.length - 1);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g += 1) {
      var gy = y0 + h - (g / 4) * h;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + w, gy);
      ctx.stroke();
    }

    var fallbacks = data.kmp.events.filter(function (event) {
      return event.type === "fallback";
    });
    ctx.strokeStyle = COLORS.fallback;
    ctx.globalAlpha = 0.45;
    fallbacks.forEach(function (event) {
      var x = x0 + (event.i / n) * w;
      var yFrom = y0 + h - (event.from / maxQ) * h;
      var yTo = y0 + h - (event.to / maxQ) * h;
      ctx.beginPath();
      ctx.moveTo(x, yFrom);
      ctx.lineTo(x, yTo);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    ctx.strokeStyle = COLORS.kmp;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.kmp.qTrace.forEach(function (q, i) {
      var x = x0 + (i / n) * w;
      var y = y0 + h - (q / maxQ) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = COLORS.match;
    data.kmp.matches.forEach(function (start) {
      var x = x0 + ((start + data.pattern.length - 1) / n) * w;
      ctx.beginPath();
      ctx.arc(x, y0 + 8, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    drawText(ctx, "text index", x0 + w - 58, y0 + h + 22, COLORS.muted, "12px system-ui, sans-serif");
    drawText(ctx, "q", box.x + 16, y0 + 8, COLORS.muted, "12px system-ui, sans-serif");
  }

  function drawCostPanel(ctx, data, box) {
    panel(ctx, box, "Alignment costs: what the naive scan rereads");
    var pad = 36;
    var x0 = box.x + pad;
    var y0 = box.y + 42;
    var w = box.w - pad - 16;
    var h = box.h - 72;
    var maxCost = Math.max(data.pattern.length, 1);
    var count = Math.max(1, data.naive.alignments.length);
    var barW = Math.max(1, w / count);

    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 4; g += 1) {
      var gy = y0 + h - (g / 4) * h;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + w, gy);
      ctx.stroke();
    }

    data.naive.alignments.forEach(function (row, index) {
      var bh = (row.cost / maxCost) * h;
      ctx.fillStyle = row.matched === data.pattern.length ? COLORS.match : COLORS.naive;
      ctx.globalAlpha = row.matched === data.pattern.length ? 0.9 : 0.62;
      ctx.fillRect(x0 + index * barW, y0 + h - bh, Math.max(1, barW - 0.4), bh);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = COLORS.kmp;
    data.kmp.perPosition.forEach(function (cost, index) {
      var x = x0 + (index / Math.max(1, data.text.length - 1)) * w;
      var bh = Math.min(h, (cost / maxCost) * h);
      ctx.fillRect(x, y0 + h - bh, Math.max(1.5, barW), bh);
    });

    drawText(ctx, "shift / text position", x0 + w - 108, y0 + h + 22, COLORS.muted, "12px system-ui, sans-serif");
    drawText(ctx, "comparisons", box.x + 12, y0 + 8, COLORS.muted, "12px system-ui, sans-serif");
  }

  function drawLedgerPanel(ctx, data, box) {
    panel(ctx, box, "Mismatch ledger");
    var event = data.summary.fallbackEvent;
    var x = box.x + 14;
    var y = box.y + 45;
    if (!event) {
      drawText(ctx, "No fallback occurs here: every mismatch happens at q=0.", x, y, COLORS.muted, "13px system-ui, sans-serif");
      drawText(ctx, "Plant fewer matches or choose a self-overlapping pattern to make the failure links work.", x, y + 22, COLORS.muted, "13px system-ui, sans-serif");
      return;
    }

    var chain = chainFrom(data.pi, event.from);
    drawText(ctx, "text[" + event.i + "] = " + JSON.stringify(event.char) + " mismatches P[" + event.from + "]", x, y, COLORS.text, "700 13px system-ui, sans-serif");
    drawText(ctx, "fallback: " + chain.join(" -> "), x, y + 24, COLORS.muted, "13px system-ui, sans-serif");

    var cell = Math.min(28, (box.w - 28) / data.pattern.length);
    var left = x;
    var top = y + 50;
    for (var i = 0; i < data.pattern.length; i += 1) {
      var inMatched = i < event.from;
      var inBorderPrefix = i < event.to;
      var inBorderSuffix = i >= event.from - event.to && i < event.from;
      ctx.fillStyle = inBorderPrefix ? "rgba(37,99,235,0.18)" : inMatched ? COLORS.white : "#f1f5f9";
      ctx.strokeStyle = inBorderSuffix ? COLORS.border : COLORS.rule;
      ctx.lineWidth = inBorderSuffix ? 2 : 1;
      ctx.fillRect(left + i * cell, top, cell, 30);
      ctx.strokeRect(left + i * cell, top, cell, 30);
      drawText(ctx, data.pattern[i], left + i * cell + cell / 2 - 4, top + 20, COLORS.text);
    }
    ctx.lineWidth = 1;

    drawText(ctx, "blue prefix is the reusable border; blue outline is the suffix we already matched", left, top + 55, COLORS.muted, "12px system-ui, sans-serif");
    var around = data.text.slice(Math.max(0, event.i - 16), Math.min(data.text.length, event.i + 17));
    drawText(ctx, "local text: " + around, left, top + 80, COLORS.muted);
  }

  function drawCanvas(canvas, data) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 980 : 700);
    var ctx = setup.ctx;

    if (compact) {
      drawPrefixPanel(ctx, data, { x: 8, y: 8, w: setup.width - 16, h: 222 });
      drawTimelinePanel(ctx, data, { x: 8, y: 242, w: setup.width - 16, h: 242 });
      drawCostPanel(ctx, data, { x: 8, y: 496, w: setup.width - 16, h: 228 });
      drawLedgerPanel(ctx, data, { x: 8, y: 736, w: setup.width - 16, h: 236 });
    } else {
      var leftW = Math.round(setup.width * 0.48);
      drawPrefixPanel(ctx, data, { x: 8, y: 8, w: leftW - 12, h: 330 });
      drawLedgerPanel(ctx, data, { x: 8, y: 354, w: leftW - 12, h: 338 });
      drawTimelinePanel(ctx, data, { x: leftW + 4, y: 8, w: setup.width - leftW - 12, h: 330 });
      drawCostPanel(ctx, data, { x: leftW + 4, y: 354, w: setup.width - leftW - 12, h: 338 });
    }
  }

  function render(root) {
    var raw = parseParams(root);
    var data = evaluate(raw);
    updateOutputs(root, data.params);
    renderMetrics(root, data);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, data);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-kmp-lab]")).forEach(function (root) {
      if (root.__kmpReady) return;
      root.__kmpReady = true;
      var schedule = null;
      function requestRender() {
        if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
        schedule = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            schedule = null;
            render(root);
          })
          : global.setTimeout(function () {
            schedule = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  var api = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    kmpSearch: kmpSearch,
    makeScenario: makeScenario,
    naiveSearch: naiveSearch,
    prefixFunction: prefixFunction
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KmpBorderLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
