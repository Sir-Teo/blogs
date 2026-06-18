(function (global) {
  "use strict";

  var DEFAULTS = {
    items: 128,
    minRun: 16,
    pattern: "runs",
    disorder: 34,
    seed: 29
  };

  var PATTERNS = [
    { key: "runs", label: "natural runs" },
    { key: "nearly", label: "nearly sorted" },
    { key: "sawtooth", label: "sawtooth" },
    { key: "descending", label: "descending" },
    { key: "random", label: "random" }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    white: "#ffffff",
    blue: "#2563eb",
    good: "#0f766e",
    bad: "#be123c",
    amber: "#b45309",
    purple: "#6d28d9",
    teal: "#0891b2"
  };

  var RUN_COLORS = ["#0f766e", "#2563eb", "#b45309", "#6d28d9", "#0891b2", "#be123c"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hasPattern(key) {
    return PATTERNS.some(function (row) { return row.key === key; });
  }

  function normalize(raw) {
    raw = raw || {};
    var items = clamp(Math.round(Number(raw.items == null ? DEFAULTS.items : raw.items)), 32, 256);
    var minRun = clamp(Math.round(Number(raw.minRun == null ? DEFAULTS.minRun : raw.minRun)), 4, 64);
    return {
      items: items,
      minRun: Math.min(items, minRun),
      pattern: hasPattern(raw.pattern) ? raw.pattern : DEFAULTS.pattern,
      disorder: clamp(Math.round(Number(raw.disorder == null ? DEFAULTS.disorder : raw.disorder)), 0, 100),
      seed: clamp(Math.round(Number(raw.seed == null ? DEFAULTS.seed : raw.seed)), 1, 9999)
    };
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function makeItem(key, id) {
    return { key: key, id: id };
  }

  function cloneItems(items) {
    return items.map(function (item) { return makeItem(item.key, item.id); });
  }

  function sortedRun(length, startKey, random, jitter) {
    var keys = [];
    var value = startKey;
    for (var i = 0; i < length; i += 1) {
      value += Math.floor(random() * (jitter + 1));
      if (random() < 0.22) value -= 1;
      keys.push(value);
      if (random() < 0.56) value += 1;
    }
    keys.sort(function (a, b) { return a - b; });
    return keys;
  }

  function generateItems(raw) {
    var params = normalize(raw);
    var random = rng(params.seed);
    var items = [];
    var i;

    if (params.pattern === "random") {
      for (i = 0; i < params.items; i += 1) {
        items.push(makeItem(Math.floor(random() * params.items * 1.35), i));
      }
      return { params: params, items: items };
    }

    if (params.pattern === "descending") {
      for (i = 0; i < params.items; i += 1) {
        items.push(makeItem(params.items - i, i));
      }
      return { params: params, items: items };
    }

    if (params.pattern === "sawtooth") {
      var tooth = clamp(Math.round(params.minRun * (0.45 + params.disorder / 140)), 4, 48);
      for (i = 0; i < params.items; i += 1) {
        items.push(makeItem((i % tooth) * 3 + Math.floor(random() * 2), i));
      }
      return { params: params, items: items };
    }

    if (params.pattern === "nearly") {
      for (i = 0; i < params.items; i += 1) items.push(makeItem(i + Math.floor(i / 9), i));
      var swaps = Math.round(params.items * params.disorder / 130);
      for (var s = 0; s < swaps; s += 1) {
        var a = Math.floor(random() * params.items);
        var span = 1 + Math.floor(random() * Math.max(2, params.minRun));
        var b = clamp(a + (random() < 0.5 ? -span : span), 0, params.items - 1);
        var tmp = items[a];
        items[a] = items[b];
        items[b] = tmp;
      }
      return { params: params, items: items };
    }

    var remaining = params.items;
    var id = 0;
    var runIndex = 0;
    var nominal = clamp(Math.round(params.minRun * (0.75 + (100 - params.disorder) / 120)), 6, 44);
    while (remaining > 0) {
      var len = Math.min(remaining, Math.max(3, Math.round(nominal * (0.55 + random() * 1.25))));
      var wave = Math.sin((runIndex + params.seed * 0.17) * 1.7);
      var base = Math.round(44 + 30 * wave + (random() - 0.5) * params.disorder);
      var keys = sortedRun(len, base, random, 3);
      for (i = 0; i < keys.length; i += 1) {
        items.push(makeItem(keys[i], id));
        id += 1;
      }
      remaining -= len;
      runIndex += 1;
    }
    return { params: params, items: items };
  }

  function newStats() {
    return { comparisons: 0, moves: 0, insertionMoves: 0, reversalMoves: 0 };
  }

  function compareItems(a, b, stats) {
    if (stats) stats.comparisons += 1;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  }

  function reverseRange(items, start, end, stats) {
    var left = start;
    var right = end - 1;
    while (left < right) {
      var tmp = items[left];
      items[left] = items[right];
      items[right] = tmp;
      if (stats) {
        stats.moves += 2;
        stats.reversalMoves += 2;
      }
      left += 1;
      right -= 1;
    }
  }

  function binaryInsertionSort(items, start, end, sortedEnd, stats) {
    for (var i = sortedEnd; i < end; i += 1) {
      var pivot = items[i];
      var left = start;
      var right = i;
      while (left < right) {
        var mid = (left + right) >> 1;
        if (compareItems(pivot, items[mid], stats) < 0) right = mid;
        else left = mid + 1;
      }
      for (var j = i; j > left; j -= 1) {
        items[j] = items[j - 1];
        stats.moves += 1;
        stats.insertionMoves += 1;
      }
      items[left] = pivot;
      stats.moves += 1;
      stats.insertionMoves += 1;
    }
  }

  function detectRuns(input, minRun) {
    var items = cloneItems(input);
    var stats = newStats();
    var runs = [];
    var n = items.length;
    var lo = 0;

    while (lo < n) {
      var start = lo;
      var naturalLen = 1;
      var direction = "single";

      if (lo + 1 < n) {
        if (compareItems(items[lo + 1], items[lo], stats) < 0) {
          direction = "descending";
          lo += 2;
          while (lo < n && compareItems(items[lo], items[lo - 1], stats) < 0) lo += 1;
          naturalLen = lo - start;
          reverseRange(items, start, lo, stats);
        } else {
          direction = "ascending";
          lo += 2;
          while (lo < n && compareItems(items[lo], items[lo - 1], stats) >= 0) lo += 1;
          naturalLen = lo - start;
        }
      } else {
        lo += 1;
      }

      var forceEnd = Math.min(n, start + minRun);
      if (lo < forceEnd) {
        binaryInsertionSort(items, start, forceEnd, start + naturalLen, stats);
        lo = forceEnd;
      }

      runs.push({
        start: start,
        len: lo - start,
        naturalLen: naturalLen,
        direction: direction,
        extended: lo - start > naturalLen
      });
    }

    return { array: items, runs: runs, stats: stats };
  }

  function mergeArrays(left, right, stats) {
    var out = new Array(left.length + right.length);
    var i = 0;
    var j = 0;
    var k = 0;
    while (i < left.length && j < right.length) {
      if (compareItems(left[i], right[j], stats) <= 0) {
        out[k] = left[i];
        i += 1;
      } else {
        out[k] = right[j];
        j += 1;
      }
      k += 1;
      stats.moves += 1;
    }
    while (i < left.length) {
      out[k] = left[i];
      i += 1;
      k += 1;
      stats.moves += 1;
    }
    while (j < right.length) {
      out[k] = right[j];
      j += 1;
      k += 1;
      stats.moves += 1;
    }
    return out;
  }

  function mergeSortRange(items, stats) {
    if (items.length <= 1) return cloneItems(items);
    var mid = items.length >> 1;
    var left = mergeSortRange(items.slice(0, mid), stats);
    var right = mergeSortRange(items.slice(mid), stats);
    return mergeArrays(left, right, stats);
  }

  function fixedMergeSort(input) {
    var stats = newStats();
    var output = mergeSortRange(input, stats);
    return {
      key: "fixed",
      label: "fixed merge sort",
      color: COLORS.blue,
      output: output,
      stats: stats,
      runs: [{ start: 0, len: input.length, naturalLen: input.length, direction: "fixed", extended: false }],
      history: [],
      maxStackDepth: 0,
      initialRuns: 1
    };
  }

  function preparedRunArrays(detected) {
    return detected.runs.map(function (run) {
      return detected.array.slice(run.start, run.start + run.len);
    });
  }

  function naturalQueueSort(input, minRun) {
    var detected = detectRuns(input, minRun);
    var stats = detected.stats;
    var runs = preparedRunArrays(detected);
    var history = [];
    var pass = 0;
    while (runs.length > 1) {
      var next = [];
      for (var i = 0; i < runs.length; i += 2) {
        if (i + 1 >= runs.length) {
          next.push(runs[i]);
        } else {
          var leftLen = runs[i].length;
          var rightLen = runs[i + 1].length;
          var merged = mergeArrays(runs[i], runs[i + 1], stats);
          history.push({
            left: leftLen,
            right: rightLen,
            out: merged.length,
            depthBefore: runs.length,
            policy: "queue",
            pass: pass
          });
          next.push(merged);
        }
      }
      runs = next;
      pass += 1;
    }
    return {
      key: "queue",
      label: "natural queue",
      color: COLORS.amber,
      output: runs[0] || [],
      stats: stats,
      runs: detected.runs,
      history: history,
      maxStackDepth: detected.runs.length,
      initialRuns: detected.runs.length
    };
  }

  function stackRunSort(input, minRun) {
    var detected = detectRuns(input, minRun);
    var stats = detected.stats;
    var runArrays = preparedRunArrays(detected);
    var stack = [];
    var history = [];
    var snapshots = [];
    var maxStackDepth = 0;

    function lengths() {
      return stack.map(function (run) { return run.length; });
    }

    function mergeAt(index, policy) {
      var left = stack[index];
      var right = stack[index + 1];
      var before = lengths();
      var merged = mergeArrays(left, right, stats);
      history.push({
        left: left.length,
        right: right.length,
        out: merged.length,
        depthBefore: stack.length,
        policy: policy,
        stackBefore: before
      });
      stack.splice(index, 2, merged);
      snapshots.push({ policy: policy, stack: lengths() });
    }

    function mergeCollapse() {
      while (stack.length > 1) {
        var n = stack.length - 2;
        if (n > 0 && stack[n - 1].length <= stack[n].length + stack[n + 1].length) {
          if (stack[n - 1].length < stack[n + 1].length) n -= 1;
          mergeAt(n, "invariant");
        } else if (stack[n].length <= stack[n + 1].length) {
          mergeAt(n, "descending");
        } else {
          break;
        }
      }
    }

    function forceCollapse() {
      while (stack.length > 1) {
        var n = stack.length - 2;
        if (n > 0 && stack[n - 1].length < stack[n + 1].length) n -= 1;
        mergeAt(n, "force");
      }
    }

    for (var i = 0; i < runArrays.length; i += 1) {
      stack.push(runArrays[i]);
      maxStackDepth = Math.max(maxStackDepth, stack.length);
      snapshots.push({ policy: "push", stack: lengths() });
      mergeCollapse();
      maxStackDepth = Math.max(maxStackDepth, stack.length);
    }
    forceCollapse();

    return {
      key: "stack",
      label: "run stack",
      color: COLORS.good,
      output: stack[0] || [],
      stats: stats,
      runs: detected.runs,
      history: history,
      snapshots: snapshots,
      maxStackDepth: maxStackDepth,
      initialRuns: detected.runs.length
    };
  }

  function ids(items) {
    return items.map(function (item) { return item.id; });
  }

  function referenceSort(input) {
    return cloneItems(input).sort(function (a, b) {
      if (a.key !== b.key) return a.key - b.key;
      return a.id - b.id;
    });
  }

  function sameIds(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i].id !== b[i].id) return false;
    }
    return true;
  }

  function isSorted(items) {
    for (var i = 1; i < items.length; i += 1) {
      if (items[i - 1].key > items[i].key) return false;
      if (items[i - 1].key === items[i].key && items[i - 1].id > items[i].id) return false;
    }
    return true;
  }

  function runsAreSorted(prepared, runs) {
    return runs.every(function (run) {
      for (var i = run.start + 1; i < run.start + run.len; i += 1) {
        if (prepared[i - 1].key > prepared[i].key) return false;
        if (prepared[i - 1].key === prepared[i].key && prepared[i - 1].id > prepared[i].id) return false;
      }
      return true;
    });
  }

  function coverageOk(runs, n) {
    var cursor = 0;
    for (var i = 0; i < runs.length; i += 1) {
      if (runs[i].start !== cursor || runs[i].len <= 0) return false;
      cursor += runs[i].len;
    }
    return cursor === n;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    var reference = result.reference;
    check("fixed merge sort matches stable reference", sameIds(result.methods.fixed.output, reference));
    check("natural queue matches stable reference", sameIds(result.methods.queue.output, reference));
    check("run stack matches stable reference", sameIds(result.methods.stack.output, reference));
    check("all outputs are sorted and stable", Object.keys(result.methods).every(function (key) {
      return isSorted(result.methods[key].output);
    }));
    check("detected runs cover the input", coverageOk(result.detected.runs, result.input.length));
    check("detected runs are sorted after extension", runsAreSorted(result.detected.array, result.detected.runs));
    check("stack performs one merge per pending-run reduction", result.methods.stack.history.length === Math.max(0, result.methods.stack.initialRuns - 1));
    check("queue performs one merge per pending-run reduction", result.methods.queue.history.length === Math.max(0, result.methods.queue.initialRuns - 1));
    check("stack merge records conserve run length", result.methods.stack.history.every(function (row) {
      return row.left + row.right === row.out && row.depthBefore >= 2;
    }));
    check("run-aware methods include finite accounting", ["queue", "stack"].every(function (key) {
      var stats = result.methods[key].stats;
      return Number.isFinite(stats.comparisons) && Number.isFinite(stats.moves) && stats.comparisons >= 0 && stats.moves >= 0;
    }));
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function evaluate(raw) {
    var generated = generateItems(raw);
    var params = generated.params;
    var input = generated.items;
    var detected = detectRuns(input, params.minRun);
    var methods = {
      fixed: fixedMergeSort(input),
      queue: naturalQueueSort(input, params.minRun),
      stack: stackRunSort(input, params.minRun)
    };
    var reference = referenceSort(input);
    var result = {
      params: params,
      input: input,
      detected: detected,
      methods: methods,
      reference: reference
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    return [
      {},
      { pattern: "nearly", items: 128, minRun: 16, disorder: 22, seed: 11 },
      { pattern: "sawtooth", items: 144, minRun: 12, disorder: 55, seed: 43 },
      { pattern: "descending", items: 128, minRun: 16, disorder: 0, seed: 5 },
      { pattern: "random", items: 128, minRun: 16, disorder: 80, seed: 71 },
      { pattern: "runs", items: 224, minRun: 24, disorder: 48, seed: 202 }
    ].map(function (row) {
      var result = evaluate(row);
      return {
        params: result.params,
        runs: result.detected.runs.length,
        naturalComparisons: result.detected.stats.comparisons,
        fixedComparisons: result.methods.fixed.stats.comparisons,
        queueComparisons: result.methods.queue.stats.comparisons,
        stackComparisons: result.methods.stack.stats.comparisons,
        fixedMoves: result.methods.fixed.stats.moves,
        stackMoves: result.methods.stack.stats.moves,
        stackDepth: result.methods.stack.maxStackDepth,
        passed: result.audit.passed,
        checks: result.audit.checks
      };
    });
  }

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(digits == null ? 1 : digits);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 2 : digits);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value, className) {
    return '<div class="timsort-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 720 ? 860 : 630;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 24, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 42, COLORS.muted, 11, 560);
  }

  function drawInputRuns(ctx, box, result) {
    panel(ctx, box, "natural runs", "monotone pieces after descending reversal and min-run extension");
    var left = box.x + 18;
    var right = box.x + box.w - 18;
    var top = box.y + 68;
    var h = Math.max(32, box.h - 112);
    var n = result.input.length;
    result.detected.runs.forEach(function (run, i) {
      var x = left + run.start / n * (right - left);
      var w = Math.max(2, run.len / n * (right - left) - 1);
      ctx.fillStyle = RUN_COLORS[i % RUN_COLORS.length];
      ctx.globalAlpha = run.extended ? 0.78 : 0.56;
      ctx.fillRect(x, top, w, h);
      ctx.globalAlpha = 1;
      var naturalW = Math.max(1, run.naturalLen / n * (right - left) - 1);
      ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
      ctx.fillRect(x, top + h - 12, naturalW, 12);
    });
    text(ctx, result.detected.runs.length + " prepared runs", left, box.y + box.h - 22, COLORS.text, 11, 760);
    text(ctx, "light stripe = natural portion", right, box.y + box.h - 22, COLORS.muted, 11, 650, "right");
  }

  function drawBars(ctx, box, result) {
    panel(ctx, box, "comparison accounting", "key comparisons and item writes for this deterministic input");
    var rows = [
      result.methods.fixed,
      result.methods.queue,
      result.methods.stack
    ];
    var maxComp = Math.max.apply(null, rows.map(function (row) { return row.stats.comparisons; }).concat([1]));
    var maxMoves = Math.max.apply(null, rows.map(function (row) { return row.stats.moves; }).concat([1]));
    var left = box.x + 26;
    var right = box.x + box.w - 24;
    var top = box.y + 74;
    var barMax = Math.max(60, right - left - 154);
    rows.forEach(function (row, i) {
      var y = top + i * 48;
      var cw = barMax * row.stats.comparisons / maxComp;
      var mw = barMax * row.stats.moves / maxMoves;
      text(ctx, row.label, left, y, COLORS.text, 11, 740);
      ctx.fillStyle = row.color;
      ctx.fillRect(left + 118, y - 12, Math.max(1, cw), 12);
      ctx.fillStyle = "rgba(93, 104, 114, 0.28)";
      ctx.fillRect(left + 118, y + 5, Math.max(1, mw), 8);
      text(ctx, fmt(row.stats.comparisons, 0) + " cmp", right, y - 1, row.color, 11, 760, "right");
      text(ctx, fmt(row.stats.moves, 0) + " writes", right, y + 15, COLORS.muted, 10, 650, "right");
    });
  }

  function drawStack(ctx, box, result) {
    panel(ctx, box, "stack merges", "each circle is one adjacent-run merge chosen by the stack policy");
    var history = result.methods.stack.history;
    var left = box.x + 28;
    var right = box.x + box.w - 24;
    var top = box.y + 72;
    var bottom = box.y + box.h - 42;
    var maxOut = Math.max.apply(null, history.map(function (row) { return row.out; }).concat([1]));
    var maxDepth = Math.max.apply(null, history.map(function (row) { return row.depthBefore; }).concat([1]));
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    if (history.length === 0) {
      text(ctx, "one run: no merge needed", left, top + 30, COLORS.good, 12, 760);
      return;
    }
    history.forEach(function (row, i) {
      var x = left + (history.length === 1 ? 0.5 : i / (history.length - 1)) * (right - left);
      var y = bottom - row.depthBefore / maxDepth * (bottom - top);
      var radius = 4 + 11 * Math.sqrt(row.out / maxOut);
      ctx.fillStyle = row.policy === "force" ? "rgba(180, 83, 9, 0.62)" : "rgba(15, 118, 110, 0.62)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, "max stack depth " + result.methods.stack.maxStackDepth, left, box.y + box.h - 18, COLORS.text, 11, 760);
    text(ctx, "amber = final forced merge", right, box.y + box.h - 18, COLORS.muted, 11, 650, "right");
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "correctness ledger", "the toy sorter must match stable key-then-index order");
    var stack = result.methods.stack;
    var fixed = result.methods.fixed;
    var rows = [
      ["items", String(result.params.items), COLORS.text],
      ["min run", String(result.params.minRun), COLORS.purple],
      ["prepared runs", String(result.detected.runs.length), COLORS.teal],
      ["run detection cmp", fmt(result.detected.stats.comparisons, 0), COLORS.amber],
      ["stack / fixed cmp", fmt(stack.stats.comparisons / Math.max(1, fixed.stats.comparisons), 3), stack.stats.comparisons <= fixed.stats.comparisons ? COLORS.good : COLORS.amber],
      ["audit", result.audit.passed ? "passed" : "check", result.audit.passed ? COLORS.good : COLORS.bad]
    ];
    var y = box.y + 70;
    rows.forEach(function (row) {
      text(ctx, row[0], box.x + 18, y, COLORS.muted, 11, 650);
      text(ctx, row[1], box.x + box.w - 18, y, row[2], 12, 780, "right");
      y += 29;
    });
  }

  function draw(canvas, result) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    if (width < 720) {
      var gap = 14;
      var h = Math.floor((height - 3 * gap) / 4);
      drawInputRuns(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawBars(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawStack(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.56);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawInputRuns(ctx, { x: 0, y: 0, w: leftW, h: upperH }, result);
      drawBars(ctx, { x: 0, y: upperH + gap2, w: leftW, h: height - upperH - gap2 }, result);
      drawStack(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
      drawLedger(ctx, { x: leftW + gap2, y: upperH + gap2, w: rightW, h: height - upperH - gap2 }, result);
    }
  }

  function render(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    var result = evaluate(raw);
    var values = {
      items: String(result.params.items),
      minRun: String(result.params.minRun),
      disorder: String(result.params.disorder),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Prepared Runs", String(result.detected.runs.length)),
        metric("Fixed Comparisons", fmt(result.methods.fixed.stats.comparisons, 0)),
        metric("Stack Comparisons", fmt(result.methods.stack.stats.comparisons, 0), result.methods.stack.stats.comparisons <= result.methods.fixed.stats.comparisons ? "timsort-lab__metric--good" : "timsort-lab__metric--warn"),
        metric("Max Stack Depth", String(result.methods.stack.maxStackDepth)),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "timsort-lab__metric--good" : "timsort-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "This is a small model of natural-run detection and the classic run-stack policy. It omits galloping, temp-buffer trimming, exception paths, and modern Powersort merge ordering.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__timsortRunResult = result;
  }

  function init(root) {
    if (!root || root.__timsortRunReady) return;
    root.__timsortRunReady = true;
    var redraw = function () { render(root); };
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function boot() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-timsort-lab]")).forEach(init);
  }

  var api = {
    auditGrid: auditGrid,
    detectRuns: detectRuns,
    evaluate: evaluate,
    generateItems: generateItems,
    ids: ids
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TimsortRunLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
