(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    blue: "#2563eb",
    teal: "#0f766e",
    purple: "#7c3aed",
    amber: "#b45309",
    bad: "#be123c",
    green: "#15803d",
    white: "#ffffff"
  };

  var SAMPLES = {
    genome: {
      label: "toy genome",
      text: "GATTACAGATTACAAGTCGATGATTACA$",
      pattern: "GATTACA"
    },
    banana: {
      label: "banana",
      text: "banana$",
      pattern: "ana"
    },
    mississippi: {
      label: "mississippi",
      text: "mississippi$",
      pattern: "issi"
    },
    abracadabra: {
      label: "abracadabra",
      text: "abracadabra$",
      pattern: "abra"
    }
  };

  var DEFAULTS = {
    sample: "genome",
    pattern: "GATTACA",
    stride: 4,
    rowFocus: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cleanText(text) {
    text = String(text || "").replace(/\$/g, "");
    return text + "$";
  }

  function cleanPattern(pattern, sampleKey) {
    pattern = String(pattern || "").replace(/\$/g, "").trim();
    if (sampleKey === "genome") return pattern.toUpperCase().replace(/[^ACGTN]/g, "");
    return pattern.toLowerCase().replace(/[^a-z_]/g, "");
  }

  function cleanParams(raw) {
    raw = raw || {};
    var sample = String(raw.sample || DEFAULTS.sample);
    if (!SAMPLES[sample]) sample = DEFAULTS.sample;
    var fallback = SAMPLES[sample].pattern;
    var pattern = cleanPattern(raw.pattern == null ? fallback : raw.pattern, sample);
    if (!pattern) pattern = fallback;
    return {
      sample: sample,
      pattern: pattern,
      stride: clamp(Math.round(Number(raw.stride == null ? DEFAULTS.stride : raw.stride)), 1, 8),
      rowFocus: clamp(Math.round(Number(raw.rowFocus == null ? DEFAULTS.rowFocus : raw.rowFocus)), 0, 999)
    };
  }

  function suffixArray(text) {
    var rows = [];
    for (var i = 0; i < text.length; i += 1) rows.push(i);
    rows.sort(function (a, b) {
      var sa = text.slice(a);
      var sb = text.slice(b);
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return a - b;
    });
    return rows;
  }

  function alphabetOf(text) {
    var seen = {};
    var alphabet = [];
    for (var i = 0; i < text.length; i += 1) {
      var c = text[i];
      if (!seen[c]) {
        seen[c] = true;
        alphabet.push(c);
      }
    }
    alphabet.sort();
    return alphabet;
  }

  function buildIndex(text, stride) {
    text = cleanText(text);
    stride = clamp(Math.round(stride || 1), 1, 64);
    var sa = suffixArray(text);
    var n = text.length;
    var bwt = "";
    for (var i = 0; i < sa.length; i += 1) {
      bwt += text[(sa[i] + n - 1) % n];
    }

    var alphabet = alphabetOf(text);
    var counts = {};
    alphabet.forEach(function (c) { counts[c] = 0; });
    for (i = 0; i < text.length; i += 1) counts[text[i]] += 1;

    var cTable = {};
    var total = 0;
    alphabet.forEach(function (c) {
      cTable[c] = total;
      total += counts[c];
    });

    var fullOcc = [];
    var running = {};
    alphabet.forEach(function (c) { running[c] = 0; });
    fullOcc.push(Object.assign({}, running));
    for (i = 0; i < bwt.length; i += 1) {
      running[bwt[i]] += 1;
      fullOcc.push(Object.assign({}, running));
    }

    var checkpoints = [];
    for (i = 0; i <= bwt.length; i += stride) {
      checkpoints.push({ row: i, counts: Object.assign({}, fullOcc[i]) });
    }
    if (checkpoints[checkpoints.length - 1].row !== bwt.length) {
      checkpoints.push({ row: bwt.length, counts: Object.assign({}, fullOcc[bwt.length]) });
    }

    return {
      alphabet: alphabet,
      bwt: bwt,
      cTable: cTable,
      checkpoints: checkpoints,
      counts: counts,
      fullOcc: fullOcc,
      sa: sa,
      stride: stride,
      text: text
    };
  }

  function occ(index, char, fm) {
    index = clamp(Math.round(index), 0, fm.bwt.length);
    if (fm.alphabet.indexOf(char) === -1) return { value: 0, scanned: 0, checkpoint: 0 };
    var baseRow = Math.floor(index / fm.stride) * fm.stride;
    var checkpointIndex = Math.floor(index / fm.stride);
    var value = (fm.checkpoints[checkpointIndex] && fm.checkpoints[checkpointIndex].counts[char]) || 0;
    for (var i = baseRow; i < index; i += 1) {
      if (fm.bwt[i] === char) value += 1;
    }
    return { value: value, scanned: index - baseRow, checkpoint: baseRow };
  }

  function backwardSearch(pattern, fm) {
    pattern = String(pattern || "").replace(/\$/g, "");
    var left = 0;
    var right = fm.bwt.length;
    var trace = [];
    for (var i = pattern.length - 1; i >= 0; i -= 1) {
      var char = pattern[i];
      var before = { left: left, right: right };
      if (fm.alphabet.indexOf(char) === -1) {
        left = 0;
        right = 0;
        trace.push({ char: char, before: before, after: { left: left, right: right }, missing: true, scanned: 0 });
        break;
      }
      var occLeft = occ(left, char, fm);
      var occRight = occ(right, char, fm);
      left = fm.cTable[char] + occLeft.value;
      right = fm.cTable[char] + occRight.value;
      trace.push({
        char: char,
        before: before,
        after: { left: left, right: right },
        occLeft: occLeft.value,
        occRight: occRight.value,
        scanned: occLeft.scanned + occRight.scanned
      });
      if (left >= right) break;
    }
    return { left: left, right: right, trace: trace };
  }

  function naiveMatches(text, pattern) {
    var clean = text.replace(/\$/g, "");
    var out = [];
    if (!pattern) return out;
    for (var i = 0; i <= clean.length - pattern.length; i += 1) {
      if (clean.slice(i, i + pattern.length) === pattern) out.push(i);
    }
    return out;
  }

  function bwtRuns(bwt) {
    var runs = 0;
    var longest = 0;
    var current = 0;
    var previous = null;
    for (var i = 0; i < bwt.length; i += 1) {
      if (bwt[i] !== previous) {
        runs += 1;
        current = 1;
        previous = bwt[i];
      } else {
        current += 1;
      }
      longest = Math.max(longest, current);
    }
    return { runs: runs, longest: longest };
  }

  function inverseBwt(bwt) {
    var n = bwt.length;
    var ranks = {};
    var lPairs = [];
    for (var i = 0; i < n; i += 1) {
      var c = bwt[i];
      ranks[c] = (ranks[c] || 0) + 1;
      lPairs.push(c + ":" + ranks[c]);
    }
    var sorted = bwt.split("").sort();
    ranks = {};
    var fMap = {};
    for (i = 0; i < n; i += 1) {
      c = sorted[i];
      ranks[c] = (ranks[c] || 0) + 1;
      fMap[c + ":" + ranks[c]] = i;
    }
    var lf = lPairs.map(function (pair) { return fMap[pair]; });
    var row = bwt.indexOf("$");
    var out = new Array(n);
    for (i = n - 1; i >= 0; i -= 1) {
      out[i] = bwt[row];
      row = lf[row];
    }
    return out.join("");
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var sample = SAMPLES[params.sample];
    var text = cleanText(sample.text);
    var pattern = cleanPattern(params.pattern, params.sample);
    var fm = buildIndex(text, params.stride);
    var search = backwardSearch(pattern, fm);
    var matchPositions = fm.sa.slice(search.left, search.right).filter(function (pos) {
      return pos + pattern.length <= text.length - 1;
    }).sort(function (a, b) { return a - b; });
    var naive = naiveMatches(text, pattern);
    var runs = bwtRuns(fm.bwt);
    var fullOccCells = fm.alphabet.length * (fm.bwt.length + 1);
    var sampledCells = fm.alphabet.length * fm.checkpoints.length;
    return {
      fm: fm,
      params: params,
      sample: sample,
      search: search,
      summary: {
        alphabetSize: fm.alphabet.length,
        bwtRuns: runs.runs,
        checkpointCells: sampledCells,
        exact: JSON.stringify(matchPositions) === JSON.stringify(naive),
        fullOccCells: fullOccCells,
        longestRun: runs.longest,
        matchCount: matchPositions.length,
        matchPositions: matchPositions,
        naivePositions: naive,
        roundTrip: inverseBwt(fm.bwt) === text,
        scannedCells: search.trace.reduce(function (sum, step) { return sum + (step.scanned || 0); }, 0),
        textLength: text.length
      }
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value) {
    return '<div class="fm-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function updateOutputs(root, params) {
    var display = {
      pattern: params.pattern,
      rowFocus: String(params.rowFocus),
      sample: SAMPLES[params.sample].label,
      stride: String(params.stride)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, width: width, height: targetHeight };
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 12, box.y + 21);
  }

  function fitText(ctx, text, x, y, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }
    var out = text;
    while (out.length > 4 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    ctx.fillText(out + "...", x, y);
  }

  function charColor(char) {
    if (char === "$") return COLORS.bad;
    if ("ACGT".indexOf(char) >= 0) {
      return { A: "#0f766e", C: "#2563eb", G: "#7c3aed", T: "#b45309" }[char];
    }
    var palette = ["#0f766e", "#2563eb", "#7c3aed", "#b45309", "#64748b", "#15803d"];
    return palette[Math.abs(char.charCodeAt(0)) % palette.length];
  }

  function drawCell(ctx, char, x, y, w, h, highlighted) {
    ctx.fillStyle = highlighted ? charColor(char) : "rgba(255,255,255,0.86)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = highlighted ? COLORS.white : COLORS.text;
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, x + w / 2, y + h / 2 + 0.5);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function drawSuffixPanel(ctx, evaluation, box) {
    panel(ctx, box, "1. Suffix array and BWT rows");
    var fm = evaluation.fm;
    var interval = evaluation.search;
    var maxRows = Math.max(8, Math.floor((box.h - 58) / 18));
    var focus = Math.min(Math.max(0, evaluation.params.rowFocus), Math.max(0, fm.sa.length - maxRows));
    var y = box.y + 42;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    for (var row = focus; row < Math.min(fm.sa.length, focus + maxRows); row += 1) {
      var active = row >= interval.left && row < interval.right;
      ctx.fillStyle = active ? "rgba(15,118,110,0.14)" : COLORS.white;
      ctx.fillRect(box.x + 12, y - 12, box.w - 24, 16);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(row).padStart(2, " "), box.x + 16, y);
      ctx.fillStyle = COLORS.amber;
      ctx.fillText(fm.bwt[row], box.x + 44, y);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(fm.sa[row]).padStart(2, " "), box.x + 68, y);
      ctx.fillStyle = COLORS.text;
      fitText(ctx, fm.text.slice(fm.sa[row]), box.x + 96, y, box.w - 112);
      y += 18;
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("row | L | SA | suffix; green rows are the final interval", box.x + 14, box.y + box.h - 18);
  }

  function drawSearchPanel(ctx, evaluation, box) {
    panel(ctx, box, "2. Backward search narrows an interval");
    var trace = evaluation.search.trace;
    var n = evaluation.fm.bwt.length;
    var plot = { x: box.x + 42, y: box.y + 46, w: box.w - 64, h: box.h - 86 };
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);
    var rowH = Math.min(30, plot.h / Math.max(1, trace.length));
    trace.forEach(function (step, idx) {
      var y = plot.y + idx * rowH + 4;
      var bx = plot.x + step.before.left / n * plot.w;
      var bw = Math.max(2, (step.before.right - step.before.left) / n * plot.w);
      var ax = plot.x + step.after.left / n * plot.w;
      var aw = Math.max(2, (step.after.right - step.after.left) / n * plot.w);
      ctx.fillStyle = "rgba(124,58,237,0.18)";
      ctx.fillRect(bx, y, bw, rowH * 0.35);
      ctx.fillStyle = step.after.left < step.after.right ? COLORS.teal : COLORS.bad;
      ctx.fillRect(ax, y + rowH * 0.42, aw, rowH * 0.35);
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(step.char, box.x + 16, y + rowH * 0.62);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("purple before, green/red after each right-to-left character", plot.x, box.y + box.h - 18);
  }

  function drawOccPanel(ctx, evaluation, box) {
    panel(ctx, box, "3. Occ counts can be checkpointed");
    var fm = evaluation.fm;
    var maxCols = Math.min(fm.bwt.length, 36);
    var cell = Math.min((box.w - 46) / maxCols, 17);
    var x0 = box.x + 34;
    var y0 = box.y + 42;
    for (var i = 0; i < maxCols; i += 1) {
      var checkpoint = i % fm.stride === 0;
      drawCell(ctx, fm.bwt[i], x0 + i * cell, y0, cell, 18, checkpoint);
    }
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("BWT last column; colored cells are stored checkpoints", x0, y0 + 36);

    var chars = fm.alphabet.slice(0, 6);
    var heatY = y0 + 58;
    chars.forEach(function (char, row) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillText(char, box.x + 16, heatY + row * 22 + 13);
      var maxCount = Math.max(1, fm.counts[char]);
      for (var col = 0; col <= maxCols; col += 1) {
        var value = fm.fullOcc[col][char] || 0;
        var t = value / maxCount;
        ctx.fillStyle = "rgba(37,99,235," + (0.08 + 0.72 * t).toFixed(3) + ")";
        ctx.fillRect(x0 + col * cell, heatY + row * 22, Math.max(1, cell - 1), 16);
      }
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(evaluation.summary.checkpointCells + " sampled cells vs " + evaluation.summary.fullOccCells + " full Occ cells", x0, box.y + box.h - 18);
  }

  function drawMatchesPanel(ctx, evaluation, box) {
    panel(ctx, box, "4. The interval maps back to text positions");
    var text = evaluation.fm.text.replace("$", "");
    var pattern = evaluation.params.pattern;
    var matches = evaluation.summary.matchPositions;
    var cell = Math.min((box.w - 36) / Math.max(1, text.length), 20);
    var x0 = box.x + (box.w - cell * text.length) / 2;
    var y0 = box.y + 48;
    var covered = {};
    matches.forEach(function (pos) {
      for (var k = 0; k < pattern.length; k += 1) covered[pos + k] = true;
    });
    for (var i = 0; i < text.length; i += 1) {
      drawCell(ctx, text[i], x0 + i * cell, y0, cell, 22, !!covered[i]);
      if (cell >= 14) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = "9px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i), x0 + i * cell + cell / 2, y0 + 36);
        ctx.textAlign = "left";
      }
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 18px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(matches.length + " match" + (matches.length === 1 ? "" : "es"), box.x + 18, box.y + 116);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    fitText(ctx, "positions: " + (matches.length ? matches.join(", ") : "none"), box.x + 18, box.y + 138, box.w - 36);
    fitText(ctx, "BWT runs: " + evaluation.summary.bwtRuns + ", longest run: " + evaluation.summary.longestRun + ", round trip: " + (evaluation.summary.roundTrip ? "yes" : "no"), box.x + 18, box.y + box.h - 18, box.w - 36);
  }

  function drawCanvas(canvas, evaluation) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 620;
    var setup = setupCanvas(canvas, compact ? 1080 : 720);
    var ctx = setup.ctx;
    var pad = compact ? 18 : 28;
    var gap = compact ? 20 : 24;
    var innerW = setup.width - pad * 2;
    if (compact) {
      var h = 242;
      drawSuffixPanel(ctx, evaluation, { x: pad, y: 22, w: innerW, h: h });
      drawSearchPanel(ctx, evaluation, { x: pad, y: 22 + h + gap, w: innerW, h: h });
      drawOccPanel(ctx, evaluation, { x: pad, y: 22 + 2 * (h + gap), w: innerW, h: h });
      drawMatchesPanel(ctx, evaluation, { x: pad, y: 22 + 3 * (h + gap), w: innerW, h: h });
      return;
    }
    var colW = (innerW - gap) / 2;
    var rowH = 306;
    drawSuffixPanel(ctx, evaluation, { x: pad, y: 26, w: colW, h: rowH });
    drawSearchPanel(ctx, evaluation, { x: pad + colW + gap, y: 26, w: colW, h: rowH });
    drawOccPanel(ctx, evaluation, { x: pad, y: 26 + rowH + gap, w: colW, h: rowH });
    drawMatchesPanel(ctx, evaluation, { x: pad + colW + gap, y: 26 + rowH + gap, w: colW, h: rowH });
  }

  function renderMetrics(root, evaluation) {
    var s = evaluation.summary;
    var html = [
      metric("text length", String(s.textLength)),
      metric("alphabet", String(s.alphabetSize)),
      metric("BWT runs", String(s.bwtRuns)),
      metric("matches", String(s.matchCount)),
      metric("Occ storage", s.checkpointCells + "/" + s.fullOccCells),
      metric("checks", s.exact && s.roundTrip ? "passed" : "failed")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (key !== "pattern" && String(input.value) !== String(params[key])) input.value = params[key];
      if (key === "pattern" && input.value !== params.pattern) input.value = params.pattern;
    });
    var evaluation = evaluate(params);
    renderMetrics(root, evaluation);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, evaluation);
    root.__fmIndexLast = evaluation;
  }

  function initOne(root) {
    if (root.__fmIndexReady) return;
    root.__fmIndexReady = true;
    var pending = null;
    var schedule = function () {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () {
        pending = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render(root);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-fm-index-lab]")).forEach(initOne);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  global.FMIndexLab = {
    backwardSearch: backwardSearch,
    buildIndex: buildIndex,
    cleanParams: cleanParams,
    evaluate: evaluate,
    inverseBwt: inverseBwt,
    naiveMatches: naiveMatches
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.FMIndexLab;
  }
})(typeof window !== "undefined" ? window : globalThis);
