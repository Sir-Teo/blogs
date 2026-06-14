(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    grid: "#e7edf3",
    blue: "#2563eb",
    teal: "#0f766e",
    purple: "#7c3aed",
    amber: "#b45309",
    bad: "#be123c",
    white: "#ffffff"
  };

  var TILE = {
    "~": { name: "water", color: "#2563eb", text: "#ffffff" },
    "=": { name: "shore", color: "#f2cc72", text: "#3a2a05" },
    ".": { name: "ground", color: "#9ccf85", text: "#193316" },
    "T": { name: "trees", color: "#0f766e", text: "#ffffff" },
    "^": { name: "rock", color: "#8b93a3", text: "#ffffff" },
    "#": { name: "wall", color: "#334155", text: "#ffffff" },
    "+": { name: "door", color: "#b45309", text: "#ffffff" },
    " ": { name: "floor", color: "#e8d9b7", text: "#382b12" }
  };

  var SAMPLES = {
    coast: {
      label: "coast",
      rows: [
        "~~~~~~~~~~~~",
        "~~~~~~~=====",
        "~~~~~~==....",
        "~~~~~==..^^.",
        "~~~===..^^^^",
        "~~==...TT^^^",
        "~==...TTT^^.",
        "==...TTT....",
        "...TTT...===",
        "..TT....==~~",
        "......===~~~",
        "...=====~~~~"
      ]
    },
    rooms: {
      label: "rooms",
      rows: [
        "############",
        "#    #     #",
        "#    #     #",
        "#    +     #",
        "### ### ####",
        "#     #    #",
        "#     +    #",
        "#     #    #",
        "#### ### ###",
        "#    +     #",
        "#    #     #",
        "############"
      ]
    },
    tracks: {
      label: "tracks",
      rows: [
        "...T...T....",
        "..TT..TT..^.",
        "..T..====^^.",
        "....=~~=^^..",
        "..===~~===..",
        "..=~~~~~=...",
        "===~~=~~~===",
        "..=~~===~~=.",
        "..=~~=..==..",
        ".TT==..TTT..",
        ".T.....TT...",
        "...^^......."
      ]
    }
  };

  var DEFAULTS = {
    sample: "coast",
    order: 3,
    size: 24,
    seed: 31,
    bias: 72,
    restarts: 8
  };

  var DIRS = [
    { name: "north", dx: 0, dy: -1, opposite: 2 },
    { name: "east", dx: 1, dy: 0, opposite: 3 },
    { name: "south", dx: 0, dy: 1, opposite: 0 },
    { name: "west", dx: -1, dy: 0, opposite: 1 }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value) {
    var x = value >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function makeRng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function number(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    raw = raw || {};
    var sample = String(raw.sample || DEFAULTS.sample);
    if (!SAMPLES[sample]) sample = DEFAULTS.sample;
    return {
      sample: sample,
      order: clamp(Math.round(number(raw, "order")), 2, 4),
      size: clamp(Math.round(number(raw, "size")), 14, 34),
      seed: clamp(Math.round(number(raw, "seed")), 1, 999),
      bias: clamp(Math.round(number(raw, "bias")), 0, 100),
      restarts: clamp(Math.round(number(raw, "restarts")), 0, 20)
    };
  }

  function keyFor(cells) {
    return cells.join("");
  }

  function patternAt(rows, x, y, order) {
    var cells = [];
    for (var yy = 0; yy < order; yy += 1) {
      for (var xx = 0; xx < order; xx += 1) {
        cells.push(rows[y + yy][x + xx]);
      }
    }
    return cells;
  }

  function compatible(a, b, dir, order) {
    var x;
    var y;
    if (dir === 1) {
      for (y = 0; y < order; y += 1) {
        for (x = 1; x < order; x += 1) {
          if (a.cells[y * order + x] !== b.cells[y * order + x - 1]) return false;
        }
      }
      return true;
    }
    if (dir === 3) {
      for (y = 0; y < order; y += 1) {
        for (x = 0; x < order - 1; x += 1) {
          if (a.cells[y * order + x] !== b.cells[y * order + x + 1]) return false;
        }
      }
      return true;
    }
    if (dir === 2) {
      for (y = 1; y < order; y += 1) {
        for (x = 0; x < order; x += 1) {
          if (a.cells[y * order + x] !== b.cells[(y - 1) * order + x]) return false;
        }
      }
      return true;
    }
    for (y = 0; y < order - 1; y += 1) {
      for (x = 0; x < order; x += 1) {
        if (a.cells[y * order + x] !== b.cells[(y + 1) * order + x]) return false;
      }
    }
    return true;
  }

  function extractPatterns(rows, order, bias) {
    var h = rows.length;
    var w = rows[0].length;
    var byKey = {};
    var patterns = [];
    var x;
    var y;
    var cells;
    var key;
    var i;
    var exponent = 0.25 + bias / 42;

    for (y = 0; y <= h - order; y += 1) {
      for (x = 0; x <= w - order; x += 1) {
        cells = patternAt(rows, x, y, order);
        key = keyFor(cells);
        if (!byKey[key]) {
          byKey[key] = { id: patterns.length, cells: cells, count: 0, key: key };
          patterns.push(byKey[key]);
        }
        byKey[key].count += 1;
      }
    }

    patterns.forEach(function (pattern) {
      pattern.weight = Math.pow(pattern.count, exponent);
      pattern.topLeft = pattern.cells[0];
    });

    var compat = [[], [], [], []];
    for (var dir = 0; dir < 4; dir += 1) {
      for (i = 0; i < patterns.length; i += 1) {
        compat[dir][i] = new Uint8Array(patterns.length);
      }
    }
    for (i = 0; i < patterns.length; i += 1) {
      for (var j = 0; j < patterns.length; j += 1) {
        for (dir = 0; dir < 4; dir += 1) {
          if (compatible(patterns[i], patterns[j], dir, order)) compat[dir][i][j] = 1;
        }
      }
    }

    return {
      compat: compat,
      exponent: exponent,
      height: h,
      order: order,
      patterns: patterns,
      rows: rows,
      width: w
    };
  }

  function makeDomains(cellCount, patternCount) {
    var domains = [];
    var counts = [];
    for (var i = 0; i < cellCount; i += 1) {
      var mask = new Uint8Array(patternCount);
      mask.fill(1);
      domains.push(mask);
      counts.push(patternCount);
    }
    return { counts: counts, domains: domains };
  }

  function cellIndex(x, y, size) {
    return y * size + x;
  }

  function summarizeDomains(domains, counts) {
    var unresolved = 0;
    var decided = 0;
    var zeros = 0;
    var sum = 0;
    var min = Infinity;
    for (var i = 0; i < counts.length; i += 1) {
      var count = counts[i];
      if (count === 0) zeros += 1;
      if (count === 1) decided += 1;
      if (count > 1) {
        unresolved += 1;
        min = Math.min(min, count);
      }
      sum += count;
    }
    return {
      decided: decided,
      meanChoices: sum / Math.max(1, counts.length),
      minChoices: min === Infinity ? 1 : min,
      unresolved: unresolved,
      zeros: zeros
    };
  }

  function entropyFor(mask, patterns) {
    var sum = 0;
    var sumLog = 0;
    var count = 0;
    for (var i = 0; i < patterns.length; i += 1) {
      if (!mask[i]) continue;
      var weight = patterns[i].weight;
      count += 1;
      sum += weight;
      sumLog += weight * Math.log(weight);
    }
    if (count <= 1 || sum <= 0) return 0;
    return Math.log(sum) - sumLog / sum;
  }

  function chooseCell(state, context, rand) {
    var best = -1;
    var bestScore = Infinity;
    for (var i = 0; i < state.counts.length; i += 1) {
      var count = state.counts[i];
      if (count <= 1) continue;
      var score = entropyFor(state.domains[i], context.patterns) + 1e-5 * rand();
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function choosePattern(mask, patterns, rand) {
    var total = 0;
    var i;
    for (i = 0; i < patterns.length; i += 1) {
      if (mask[i]) total += patterns[i].weight;
    }
    var pick = rand() * total;
    for (i = 0; i < patterns.length; i += 1) {
      if (!mask[i]) continue;
      pick -= patterns[i].weight;
      if (pick <= 0) return i;
    }
    for (i = patterns.length - 1; i >= 0; i -= 1) if (mask[i]) return i;
    return -1;
  }

  function hasSupport(candidate, neighborDir, sourceMask, context) {
    var opposite = DIRS[neighborDir].opposite;
    for (var source = 0; source < context.patterns.length; source += 1) {
      if (sourceMask[source] && context.compat[opposite][candidate][source]) return true;
    }
    return false;
  }

  function propagate(state, context, queue) {
    var size = state.size;
    var bans = 0;
    var checks = 0;
    while (queue.length) {
      var index = queue.shift();
      var x = index % size;
      var y = Math.floor(index / size);
      var sourceMask = state.domains[index];

      for (var d = 0; d < DIRS.length; d += 1) {
        var nx = x + DIRS[d].dx;
        var ny = y + DIRS[d].dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        var ni = cellIndex(nx, ny, size);
        var neighborMask = state.domains[ni];
        var removed = false;
        for (var p = 0; p < context.patterns.length; p += 1) {
          if (!neighborMask[p]) continue;
          checks += 1;
          if (!hasSupport(p, d, sourceMask, context)) {
            neighborMask[p] = 0;
            state.counts[ni] -= 1;
            bans += 1;
            removed = true;
          }
        }
        if (state.counts[ni] === 0) {
          return { bans: bans, checks: checks, contradiction: true };
        }
        if (removed) queue.push(ni);
      }
    }
    return { bans: bans, checks: checks, contradiction: false };
  }

  function collapseOne(state, context, index, pattern) {
    var removed = 0;
    var mask = state.domains[index];
    for (var p = 0; p < context.patterns.length; p += 1) {
      if (p !== pattern && mask[p]) {
        mask[p] = 0;
        removed += 1;
      }
    }
    state.counts[index] = 1;
    return removed;
  }

  function runAttempt(context, params, attempt) {
    var size = params.size;
    var cellCount = size * size;
    var made = makeDomains(cellCount, context.patterns.length);
    var state = {
      counts: made.counts,
      domains: made.domains,
      size: size
    };
    var rand = makeRng(hash32(params.seed * 1000003 + attempt * 9176 + params.order * 409 + params.bias * 37));
    var trace = [];
    var observations = 0;
    var bans = 0;
    var checks = 0;
    trace.push(Object.assign({ step: 0, bans: bans, checks: checks }, summarizeDomains(state.domains, state.counts)));

    while (observations <= cellCount) {
      var summary = summarizeDomains(state.domains, state.counts);
      if (summary.zeros > 0) {
        return { attempt: attempt, bans: bans, checks: checks, contradiction: true, observations: observations, state: state, trace: trace };
      }
      if (summary.unresolved === 0) {
        return { attempt: attempt, bans: bans, checks: checks, contradiction: false, observations: observations, state: state, trace: trace };
      }

      var cell = chooseCell(state, context, rand);
      if (cell < 0) {
        return { attempt: attempt, bans: bans, checks: checks, contradiction: false, observations: observations, state: state, trace: trace };
      }
      var chosen = choosePattern(state.domains[cell], context.patterns, rand);
      if (chosen < 0) {
        return { attempt: attempt, bans: bans, checks: checks, contradiction: true, observations: observations, state: state, trace: trace };
      }
      bans += collapseOne(state, context, cell, chosen);
      observations += 1;

      var prop = propagate(state, context, [cell]);
      bans += prop.bans;
      checks += prop.checks;
      trace.push(Object.assign({ step: observations, bans: bans, checks: checks }, summarizeDomains(state.domains, state.counts)));
      if (prop.contradiction) {
        return { attempt: attempt, bans: bans, checks: checks, contradiction: true, observations: observations, state: state, trace: trace };
      }
    }

    return { attempt: attempt, bans: bans, checks: checks, contradiction: true, observations: observations, state: state, trace: trace };
  }

  function averageChar(mask, patterns) {
    var counts = {};
    var best = ".";
    var bestWeight = -1;
    for (var i = 0; i < patterns.length; i += 1) {
      if (!mask[i]) continue;
      var char = patterns[i].topLeft;
      counts[char] = (counts[char] || 0) + patterns[i].weight;
      if (counts[char] > bestWeight) {
        bestWeight = counts[char];
        best = char;
      }
    }
    return best;
  }

  function outputRows(state, context) {
    var rows = [];
    for (var y = 0; y < state.size; y += 1) {
      var row = "";
      for (var x = 0; x < state.size; x += 1) {
        var index = cellIndex(x, y, state.size);
        var mask = state.domains[index];
        var char = "?";
        if (state.counts[index] === 1) {
          for (var p = 0; p < context.patterns.length; p += 1) {
            if (mask[p]) {
              char = context.patterns[p].topLeft;
              break;
            }
          }
        } else if (state.counts[index] > 1) {
          char = averageChar(mask, context.patterns);
        }
        row += char;
      }
      rows.push(row);
    }
    return rows;
  }

  function tileHistogram(rows) {
    var counts = {};
    var total = 0;
    rows.forEach(function (row) {
      for (var i = 0; i < row.length; i += 1) {
        counts[row[i]] = (counts[row[i]] || 0) + 1;
        total += 1;
      }
    });
    return Object.keys(counts).sort().map(function (key) {
      return { char: key, share: counts[key] / total };
    });
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var sample = SAMPLES[params.sample];
    var context = extractPatterns(sample.rows, params.order, params.bias);
    var best = null;
    var attempts = [];
    for (var attempt = 0; attempt <= params.restarts; attempt += 1) {
      var result = runAttempt(context, params, attempt);
      attempts.push({
        attempt: attempt,
        bans: result.bans,
        contradiction: result.contradiction,
        observations: result.observations,
        resolved: summarizeDomains(result.state.domains, result.state.counts).decided
      });
      if (!best || summarizeDomains(result.state.domains, result.state.counts).decided > summarizeDomains(best.state.domains, best.state.counts).decided) best = result;
      if (!result.contradiction) {
        best = result;
        break;
      }
    }
    var finalSummary = summarizeDomains(best.state.domains, best.state.counts);
    var rows = outputRows(best.state, context);
    return {
      attempts: attempts,
      context: {
        exponent: context.exponent,
        order: context.order,
        patternCount: context.patterns.length,
        sample: sample.label,
        sampleRows: sample.rows,
        tileHistogram: tileHistogram(sample.rows)
      },
      params: params,
      result: {
        attempt: best.attempt,
        bans: best.bans,
        checks: best.checks,
        contradiction: best.contradiction,
        entropyTrace: best.trace,
        observations: best.observations,
        outputRows: rows,
        summary: finalSummary
      }
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPct(value) {
    return (100 * value).toFixed(value < 0.995 ? 1 : 0) + "%";
  }

  function metric(label, value) {
    return '<div class="wfc-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
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
      bias: params.bias + "%",
      order: String(params.order),
      restarts: String(params.restarts),
      sample: params.sample,
      seed: String(params.seed),
      size: String(params.size)
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
    ctx.fillStyle = COLORS.faint;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(title, box.x + 12, box.y + 21);
  }

  function tileColor(char) {
    return (TILE[char] || TILE["."]).color;
  }

  function drawRows(ctx, rows, box, options) {
    options = options || {};
    var nY = rows.length;
    var nX = rows[0].length;
    var cell = Math.min(box.w / nX, box.h / nY);
    var offsetX = box.x + (box.w - cell * nX) / 2;
    var offsetY = box.y + (box.h - cell * nY) / 2;
    for (var y = 0; y < nY; y += 1) {
      for (var x = 0; x < nX; x += 1) {
        var char = rows[y][x];
        ctx.fillStyle = tileColor(char);
        ctx.fillRect(offsetX + x * cell, offsetY + y * cell, Math.ceil(cell), Math.ceil(cell));
        if (options.grid && cell >= 8) {
          ctx.strokeStyle = "rgba(255,255,255,0.26)";
          ctx.strokeRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
        }
      }
    }
    return { cell: cell, x: offsetX, y: offsetY, w: cell * nX, h: cell * nY };
  }

  function drawSample(ctx, evaluation, box) {
    panel(ctx, box, "1. The tiny example");
    var grid = drawRows(ctx, evaluation.context.sampleRows, { x: box.x + 16, y: box.y + 42, w: box.w - 32, h: box.h - 76 }, { grid: true });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(evaluation.context.patternCount + " distinct " + evaluation.params.order + "x" + evaluation.params.order + " patterns", box.x + 16, box.y + box.h - 22);
    ctx.strokeStyle = COLORS.text;
    ctx.strokeRect(grid.x, grid.y, grid.w, grid.h);
  }

  function drawOutput(ctx, evaluation, box) {
    panel(ctx, box, "2. Collapse result");
    var grid = drawRows(ctx, evaluation.result.outputRows, { x: box.x + 16, y: box.y + 42, w: box.w - 32, h: box.h - 78 }, { grid: false });
    ctx.strokeStyle = evaluation.result.contradiction ? COLORS.bad : COLORS.teal;
    ctx.lineWidth = 2;
    ctx.strokeRect(grid.x, grid.y, grid.w, grid.h);
    ctx.fillStyle = evaluation.result.contradiction ? COLORS.bad : COLORS.teal;
    ctx.font = "700 11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(evaluation.result.contradiction ? "contradiction: best partial field" : "locally consistent sample", box.x + 16, box.y + box.h - 24);
  }

  function blend(a, b, t) {
    function c(hex, i) { return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16); }
    var r = Math.round(c(a, 0) * (1 - t) + c(b, 0) * t);
    var g = Math.round(c(a, 1) * (1 - t) + c(b, 1) * t);
    var bb = Math.round(c(a, 2) * (1 - t) + c(b, 2) * t);
    return "rgb(" + r + "," + g + "," + bb + ")";
  }

  function drawEntropy(ctx, evaluation, box) {
    panel(ctx, box, "3. Remaining choices after propagation");
    var trace = evaluation.result.entropyTrace;
    var last = trace[trace.length - 1];
    var size = evaluation.params.size;
    var cell = Math.min((box.w - 32) / size, (box.h - 74) / size);
    var ox = box.x + (box.w - cell * size) / 2;
    var oy = box.y + 42;
    var maxChoices = evaluation.context.patternCount;
    var domains = evaluation.result.summary;

    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var row = evaluation.result.outputRows[y];
        var char = row[x];
        var t = last.unresolved === 0 ? 0 : 0.5;
        if (char === "?") {
          ctx.fillStyle = COLORS.bad;
        } else {
          var local = last.meanChoices / Math.max(1, maxChoices);
          ctx.fillStyle = blend(tileColor(char), COLORS.white, clamp(local + t * 0.25, 0, 0.72));
        }
        ctx.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(ox, oy, cell * size, cell * size);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("mean choices: " + formatNumber(domains.meanChoices, 2), box.x + 16, box.y + box.h - 24);
  }

  function drawTrace(ctx, evaluation, box) {
    panel(ctx, box, "4. Search trace");
    var plot = { x: box.x + 42, y: box.y + 44, w: box.w - 62, h: box.h - 84 };
    var trace = evaluation.result.entropyTrace;
    var maxStep = Math.max(1, trace[trace.length - 1].step);
    var maxUnresolved = evaluation.params.size * evaluation.params.size;
    var maxBans = Math.max.apply(null, trace.map(function (row) { return row.bans; }).concat([1]));
    function px(step) { return plot.x + step / maxStep * plot.w; }
    function pyUnresolved(value) { return plot.y + plot.h - value / maxUnresolved * plot.h; }
    function pyBans(value) { return plot.y + plot.h - value / maxBans * plot.h; }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var gx = plot.x + plot.w * i / 4;
      var gy = plot.y + plot.h * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, plot.y); ctx.lineTo(gx, plot.y + plot.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.x, gy); ctx.lineTo(plot.x + plot.w, gy); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    function path(key, yFn, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach(function (row, index) {
        var x = px(row.step);
        var y = yFn(row[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    path("unresolved", pyUnresolved, COLORS.purple);
    path("bans", pyBans, COLORS.amber);

    evaluation.attempts.forEach(function (attempt, index) {
      var w = Math.max(4, plot.w / Math.max(1, evaluation.params.restarts + 1) - 3);
      var x = plot.x + index * (plot.w / Math.max(1, evaluation.params.restarts + 1));
      var h = attempt.contradiction ? 18 : 28;
      ctx.fillStyle = attempt.contradiction ? "rgba(190,18,60,0.55)" : "rgba(15,118,110,0.70)";
      ctx.fillRect(x, plot.y + plot.h + 8, w, h);
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("purple unresolved cells, amber banned patterns", plot.x, box.y + box.h - 18);
  }

  function drawCanvas(canvas, evaluation) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 620;
    var setup = setupCanvas(canvas, compact ? 1060 : 720);
    var ctx = setup.ctx;
    var pad = compact ? 18 : 28;
    var gap = compact ? 20 : 24;
    var innerW = setup.width - pad * 2;
    if (compact) {
      var h = 238;
      drawSample(ctx, evaluation, { x: pad, y: 22, w: innerW, h: h });
      drawOutput(ctx, evaluation, { x: pad, y: 22 + h + gap, w: innerW, h: h });
      drawEntropy(ctx, evaluation, { x: pad, y: 22 + 2 * (h + gap), w: innerW, h: h });
      drawTrace(ctx, evaluation, { x: pad, y: 22 + 3 * (h + gap), w: innerW, h: h });
      return;
    }
    var colW = (innerW - gap) / 2;
    var rowH = 306;
    drawSample(ctx, evaluation, { x: pad, y: 26, w: colW, h: rowH });
    drawOutput(ctx, evaluation, { x: pad + colW + gap, y: 26, w: colW, h: rowH });
    drawEntropy(ctx, evaluation, { x: pad, y: 26 + rowH + gap, w: colW, h: rowH });
    drawTrace(ctx, evaluation, { x: pad + colW + gap, y: 26 + rowH + gap, w: colW, h: rowH });
  }

  function renderMetrics(root, evaluation) {
    var summary = evaluation.result.summary;
    var cells = evaluation.params.size * evaluation.params.size;
    var status = evaluation.result.contradiction ? "partial" : "solved";
    var html = [
      metric("status", status),
      metric("patterns", String(evaluation.context.patternCount)),
      metric("observations", String(evaluation.result.observations)),
      metric("banned patterns", String(evaluation.result.bans)),
      metric("resolved", formatPct(summary.decided / cells)),
      metric("restarts used", String(evaluation.result.attempt))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function render(root) {
    var params = parseParams(root);
    updateOutputs(root, params);
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (String(input.value) !== String(params[key])) input.value = params[key];
    });
    var evaluation = evaluate(params);
    renderMetrics(root, evaluation);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, evaluation);
    root.__wfcLast = evaluation;
  }

  function initOne(root) {
    if (root.__wfcReady) return;
    root.__wfcReady = true;
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
    Array.prototype.slice.call(document.querySelectorAll("[data-wfc-lab]")).forEach(initOne);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  global.WFCConstraintLab = {
    cleanParams: cleanParams,
    evaluate: evaluate,
    extractPatterns: extractPatterns
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.WFCConstraintLab;
  }
})(typeof window !== "undefined" ? window : globalThis);
