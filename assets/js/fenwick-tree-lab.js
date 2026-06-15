(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    value: "#2563eb",
    tree: "#0f766e",
    query: "#7c3aed",
    update: "#d97706",
    rank: "#be123c",
    faint: "#eef3f7"
  };

  var DEFAULTS = {
    size: 24,
    seed: 17,
    query: 19,
    updateIndex: 7,
    delta: 5,
    target: 62
  };

  var AUDIT_CACHE = null;

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
    var size = snap(raw.size, DEFAULTS.size, 8, 48, 1);
    return {
      size: size,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 999, 1),
      query: snap(raw.query, Math.min(DEFAULTS.query, size), 1, size, 1),
      updateIndex: snap(raw.updateIndex, Math.min(DEFAULTS.updateIndex, size), 1, size, 1),
      delta: snap(raw.delta, DEFAULTS.delta, -6, 9, 1),
      target: snap(raw.target, DEFAULTS.target, 5, 95, 1)
    };
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

  function lowbit(index) {
    return index & -index;
  }

  function makeValues(params) {
    params = cleanParams(params);
    var rand = makeRng(params.seed * 1009 + params.size * 917);
    var values = [];
    for (var i = 1; i <= params.size; i += 1) {
      var wave = 0.5 + 0.5 * Math.sin((i + params.seed * 0.13) * 1.41);
      var bump = (i % 7 === 0) ? 0.22 : 0;
      values.push(1 + Math.floor(9 * clamp(0.58 * rand() + 0.42 * wave + bump, 0, 0.999)));
    }
    return values;
  }

  function buildFenwick(values) {
    var n = values.length;
    var tree = new Array(n + 1);
    var i;
    for (i = 0; i <= n; i += 1) tree[i] = 0;
    for (i = 1; i <= n; i += 1) tree[i] = values[i - 1];
    for (i = 1; i <= n; i += 1) {
      var parent = i + lowbit(i);
      if (parent <= n) tree[parent] += tree[i];
    }
    return tree;
  }

  function buildByUpdates(values) {
    var tree = new Array(values.length + 1).fill(0);
    for (var i = 1; i <= values.length; i += 1) add(tree, i, values[i - 1]);
    return tree;
  }

  function intervalFor(index) {
    return {
      left: index - lowbit(index) + 1,
      right: index,
      width: lowbit(index)
    };
  }

  function prefix(tree, index) {
    var sum = 0;
    var path = [];
    var i = index;
    while (i > 0) {
      sum += tree[i];
      path.push(i);
      i -= lowbit(i);
    }
    return { sum: sum, path: path };
  }

  function add(tree, index, delta) {
    var n = tree.length - 1;
    var path = [];
    var i = index;
    while (i <= n) {
      tree[i] += delta;
      path.push(i);
      i += lowbit(i);
    }
    return path;
  }

  function naivePrefix(values, index) {
    var sum = 0;
    for (var i = 0; i < index; i += 1) sum += values[i];
    return sum;
  }

  function rangeSum(tree, left, right) {
    return prefix(tree, right).sum - prefix(tree, left - 1).sum;
  }

  function total(values) {
    return values.reduce(function (a, b) { return a + b; }, 0);
  }

  function highestPowerOfTwoAtMost(n) {
    var bit = 1;
    while (bit * 2 <= n) bit *= 2;
    return bit;
  }

  function findByPrefix(tree, target) {
    var n = tree.length - 1;
    var bit = highestPowerOfTwoAtMost(n);
    var index = 0;
    var remaining = target;
    var path = [];

    while (bit > 0) {
      var next = index + bit;
      var take = next <= n && tree[next] < remaining;
      path.push({
        bit: bit,
        index: index,
        next: next,
        treeValue: next <= n ? tree[next] : null,
        remaining: remaining,
        take: take
      });
      if (take) {
        index = next;
        remaining -= tree[next];
      }
      bit = Math.floor(bit / 2);
    }

    return {
      index: Math.min(n, index + 1),
      path: path,
      target: target
    };
  }

  function applyDelta(values, index, rawDelta) {
    var updated = values.slice();
    var minDelta = 1 - updated[index - 1];
    var delta = Math.max(minDelta, rawDelta);
    updated[index - 1] += delta;
    return { values: updated, delta: delta };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var values = makeValues(params);
    var tree = buildFenwick(values);
    var query = prefix(tree, params.query);
    var applied = applyDelta(values, params.updateIndex, params.delta);
    var updatedTree = tree.slice();
    var updatePath = add(updatedTree, params.updateIndex, applied.delta);
    var updatedQuery = prefix(updatedTree, params.query);
    var updatedTotal = total(applied.values);
    var targetValue = Math.max(1, Math.ceil(updatedTotal * params.target / 100));
    var rank = findByPrefix(updatedTree, targetValue);
    var intervals = [];

    for (var i = 1; i <= params.size; i += 1) {
      var span = intervalFor(i);
      intervals.push({
        index: i,
        left: span.left,
        right: span.right,
        width: span.width,
        value: tree[i],
        updatedValue: updatedTree[i],
        query: query.path.indexOf(i) >= 0,
        update: updatePath.indexOf(i) >= 0,
        rank: rank.path.some(function (step) { return step.next === i; })
      });
    }

    return {
      params: params,
      values: values,
      tree: tree,
      intervals: intervals,
      query: query,
      appliedDelta: applied.delta,
      updatedValues: applied.values,
      updatedTree: updatedTree,
      updatedQuery: updatedQuery,
      updatePath: updatePath,
      total: total(values),
      updatedTotal: updatedTotal,
      targetValue: targetValue,
      rank: rank,
      rangeCheck: rangeSum(updatedTree, Math.min(params.query, params.updateIndex), Math.max(params.query, params.updateIndex))
    };
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function validTree(values, tree) {
    if (tree.length !== values.length + 1 || tree[0] !== 0) return false;
    for (var i = 1; i <= values.length; i += 1) {
      var span = intervalFor(i);
      var sum = 0;
      for (var j = span.left; j <= span.right; j += 1) sum += values[j - 1];
      if (tree[i] !== sum) return false;
    }
    return true;
  }

  function validRank(values, index, target) {
    var before = naivePrefix(values, index - 1);
    var at = naivePrefix(values, index);
    return before < target && target <= at;
  }

  function pathCoversIndex(path, values, changedIndex) {
    return path.every(function (node) {
      var span = intervalFor(node);
      return span.left <= changedIndex && changedIndex <= span.right && node <= values.length;
    });
  }

  function runAudit() {
    var checked = 0;
    var failures = [];

    function check(name, ok, detail) {
      checked += 1;
      if (!ok) failures.push({ name: name, detail: detail || null });
    }

    var cleaned = cleanParams({ size: 100, seed: "x", query: 200, updateIndex: -3, delta: -99, target: 500 });
    check("parameters snap into supported ranges", cleaned.size === 48 &&
      cleaned.seed === DEFAULTS.seed &&
      cleaned.query === 48 &&
      cleaned.updateIndex === 1 &&
      cleaned.delta === -6 &&
      cleaned.target === 95, cleaned);

    check("lowbit isolates powers of two", lowbit(1) === 1 && lowbit(6) === 2 &&
      lowbit(16) === 16 && lowbit(40) === 8);

    var result = evaluate(DEFAULTS);
    check("linear build equals repeated updates", arraysEqual(result.tree, buildByUpdates(result.values)));
    check("tree intervals reconstruct every stored cell", validTree(result.values, result.tree));
    check("default query equals naive prefix", result.query.sum === naivePrefix(result.values, result.params.query), result.query);
    check("query path removes one set bit per step", result.query.path.every(function (node, i, path) {
      return i === path.length - 1 || path[i + 1] === node - lowbit(node);
    }), result.query.path);
    check("update path visits cells whose intervals cover the edited point",
      pathCoversIndex(result.updatePath, result.values, result.params.updateIndex), result.updatePath);
    check("updated tree remains a valid interval table", validTree(result.updatedValues, result.updatedTree));
    check("updated query equals naive prefix", result.updatedQuery.sum === naivePrefix(result.updatedValues, result.params.query), result.updatedQuery);
    check("range sum by prefix difference is correct", result.rangeCheck === (function () {
      var left = Math.min(result.params.query, result.params.updateIndex);
      var right = Math.max(result.params.query, result.params.updateIndex);
      var sum = 0;
      for (var i = left; i <= right; i += 1) sum += result.updatedValues[i - 1];
      return sum;
    })(), result.rangeCheck);
    check("rank search finds the first prefix crossing", validRank(result.updatedValues, result.rank.index, result.targetValue), result.rank);
    check("rank search examines logarithmically many bits", result.rank.path.length === Math.floor(Math.log2(result.params.size)) + 1, result.rank.path.length);

    var clipped = evaluate({ size: 16, seed: 3, query: 9, updateIndex: 4, delta: -99, target: 50 });
    check("negative updates are clipped to keep positive frequencies", clipped.updatedValues[3] === 1 && clipped.appliedDelta >= -9, {
      value: clipped.updatedValues[3],
      delta: clipped.appliedDelta
    });
    check("non-power-of-two sizes support rank search", (function () {
      var odd = evaluate({ size: 31, seed: 12, query: 27, updateIndex: 30, delta: 4, target: 81 });
      return odd.params.size === 31 && validTree(odd.updatedValues, odd.updatedTree) &&
        validRank(odd.updatedValues, odd.rank.index, odd.targetValue);
    })());

    var gridCases = 0;
    var gridOk = 0;
    [8, 15, 24, 31, 48].forEach(function (size) {
      [1, 29, 137].forEach(function (seed) {
        [1, Math.ceil(size / 2), size].forEach(function (query) {
          [1, Math.max(1, Math.floor(size * 0.37)), size].forEach(function (updateIndex) {
            [-4, 3, 8].forEach(function (delta) {
              [12, 50, 91].forEach(function (target) {
                gridCases += 1;
                var item = evaluate({
                  size: size,
                  seed: seed,
                  query: query,
                  updateIndex: updateIndex,
                  delta: delta,
                  target: target
                });
                var ok = validTree(item.values, item.tree) &&
                  validTree(item.updatedValues, item.updatedTree) &&
                  item.query.sum === naivePrefix(item.values, item.params.query) &&
                  item.updatedQuery.sum === naivePrefix(item.updatedValues, item.params.query) &&
                  validRank(item.updatedValues, item.rank.index, item.targetValue) &&
                  pathCoversIndex(item.updatePath, item.values, item.params.updateIndex) &&
                  item.updatedValues.every(function (value) { return value > 0; });
                if (ok) gridOk += 1;
              });
            });
          });
        });
      });
    });
    check("1215-case Fenwick grid is valid", gridCases === 1215 && gridOk === 1215, {
      gridCases: gridCases,
      gridOk: gridOk
    });

    return {
      ok: checked - failures.length,
      cases: checked,
      passed: checked - failures.length,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        size: result.params.size,
        total: result.total,
        queryIndex: result.params.query,
        querySum: result.query.sum,
        queryTouches: result.query.path.length,
        updateIndex: result.params.updateIndex,
        appliedDelta: result.appliedDelta,
        updateTouches: result.updatePath.length,
        updatedQuerySum: result.updatedQuery.sum,
        targetValue: result.targetValue,
        rankIndex: result.rank.index,
        rankTouches: result.rank.path.length
      }
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString(undefined, {
      maximumFractionDigits: digits == null ? 0 : digits,
      minimumFractionDigits: digits == null ? 0 : digits
    });
  }

  function metric(label, value) {
    return '<div class="fenwick-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.floor(rect.width || 900));
    var height = width < 620 ? 1050 : 820;
    var dpr = Math.max(1, Math.min(2, root.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawText(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 21, COLORS.text, 13, 800);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, COLORS.muted, 11, 600);
  }

  function drawArray(ctx, box, result) {
    var values = result.updatedValues;
    var n = values.length;
    var maxValue = Math.max.apply(null, values);
    var x = box.x + 22;
    var y = box.y + 72;
    var w = box.w - 44;
    var h = box.h - 114;
    var gap = n > 34 ? 1 : 2;
    var barW = Math.max(3, (w - gap * (n - 1)) / n);

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Edited frequency table", "bars are symbol counts after the selected update");
    for (var i = 0; i < n; i += 1) {
      var bx = x + i * (barW + gap);
      var bh = h * values[i] / maxValue;
      ctx.fillStyle = i + 1 === result.params.updateIndex ? COLORS.update : COLORS.value;
      ctx.fillRect(bx, y + h - bh, barW, bh);
      if (n <= 28 || i % 4 === 0) drawText(ctx, String(i + 1), bx + barW / 2, y + h + 16, COLORS.muted, 9, 700, "center");
    }
    drawText(ctx, "total " + result.updatedTotal, x + w, box.y + box.h - 22, COLORS.muted, 11, 700, "right");
  }

  function drawIntervals(ctx, box, result) {
    var intervals = result.intervals;
    var n = result.params.size;
    var x = box.x + 22;
    var y = box.y + 70;
    var w = box.w - 44;
    var rowH = Math.max(8, Math.min(18, (box.h - 104) / n));
    var scale = w / n;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Fenwick cells store suffix blocks", "tree[i] covers i-lowbit(i)+1 through i");
    intervals.forEach(function (cell, idx) {
      var yy = y + idx * rowH;
      var left = x + (cell.left - 1) * scale;
      var right = x + cell.right * scale;
      ctx.fillStyle = cell.query ? "rgba(124,58,237,0.62)" :
        (cell.update ? "rgba(217,119,6,0.58)" : "rgba(15,118,110,0.28)");
      if (cell.rank) ctx.fillStyle = "rgba(190,18,60,0.52)";
      ctx.fillRect(left, yy, Math.max(2, right - left), Math.max(4, rowH - 2));
      if (n <= 32 || idx % 2 === 0) drawText(ctx, String(cell.index), x - 6, yy + rowH / 2, COLORS.muted, 9, 700, "right");
    });
    drawText(ctx, "index", x - 6, y - 14, COLORS.muted, 10, 700, "right");
    drawText(ctx, "array position", x + w, box.y + box.h - 22, COLORS.muted, 11, 700, "right");
  }

  function drawPaths(ctx, box, result) {
    var rows = [
      { label: "prefix(" + result.params.query + ")", path: result.query.path, color: COLORS.query, value: result.query.sum },
      { label: "add(" + result.params.updateIndex + ", " + result.appliedDelta + ")", path: result.updatePath, color: COLORS.update, value: result.updateTouches },
      { label: "find prefix " + result.targetValue, path: result.rank.path.map(function (step) { return step.next; }).filter(function (v) { return v <= result.params.size; }), color: COLORS.rank, value: result.rank.index }
    ];
    var x = box.x + 18;
    var y = box.y + 72;
    var w = box.w - 36;
    var rowH = 56;
    var n = result.params.size;

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Bit walks", "query clears low bits; update adds them; rank descends powers");
    rows.forEach(function (row, r) {
      var yy = y + r * rowH;
      drawText(ctx, row.label, x, yy - 16, COLORS.text, 11, 800);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, yy + 12);
      ctx.lineTo(x + w, yy + 12);
      ctx.stroke();
      row.path.forEach(function (node, i) {
        var px = x + (node - 0.5) * w / n;
        ctx.fillStyle = row.color;
        ctx.beginPath();
        ctx.arc(px, yy + 12, 6, 0, Math.PI * 2);
        ctx.fill();
        drawText(ctx, String(node), px, yy + 31, COLORS.muted, 9, 700, "center");
        if (i > 0) {
          var prev = x + (row.path[i - 1] - 0.5) * w / n;
          ctx.strokeStyle = row.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(prev, yy + 12);
          ctx.lineTo(px, yy + 12);
          ctx.stroke();
        }
      });
    });
  }

  function drawRankTable(ctx, box, result) {
    var steps = result.rank.path;
    var x = box.x + 18;
    var y = box.y + 68;
    var rowH = Math.min(24, (box.h - 96) / Math.max(1, steps.length));
    var cols = [0, box.w * 0.20, box.w * 0.38, box.w * 0.58, box.w * 0.78];

    drawPanel(ctx, box.x, box.y, box.w, box.h, "Rank search ledger", "walk down the implicit binary tree of cumulative counts");
    ["bit", "next", "tree", "remaining", "move"].forEach(function (head, i) {
      drawText(ctx, head, x + cols[i], y - 15, COLORS.muted, 10, 800);
    });
    steps.forEach(function (step, i) {
      var yy = y + i * rowH;
      ctx.fillStyle = i % 2 ? "#ffffff" : "rgba(237,242,247,0.62)";
      ctx.fillRect(box.x + 10, yy - rowH / 2 + 1, box.w - 20, rowH - 2);
      drawText(ctx, String(step.bit), x + cols[0], yy, COLORS.text, 10, 700);
      drawText(ctx, String(step.next), x + cols[1], yy, COLORS.text, 10, 700);
      drawText(ctx, step.treeValue == null ? "-" : String(step.treeValue), x + cols[2], yy, COLORS.text, 10, 700);
      drawText(ctx, String(step.remaining), x + cols[3], yy, COLORS.text, 10, 700);
      drawText(ctx, step.take ? "right" : "left", x + cols[4], yy, step.take ? COLORS.rank : COLORS.tree, 10, 800);
    });
    drawText(ctx, "first prefix crossing: " + result.rank.index, x, box.y + box.h - 22, COLORS.rank, 11, 800);
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
      drawArray(ctx, { x: 0, y: 0, w: w, h: panelH }, result);
      drawIntervals(ctx, { x: 0, y: panelH + gap, w: w, h: panelH }, result);
      drawPaths(ctx, { x: 0, y: 2 * (panelH + gap), w: w, h: panelH }, result);
      drawRankTable(ctx, { x: 0, y: 3 * (panelH + gap), w: w, h: panelH }, result);
      return;
    }

    var topH = 365;
    var bottomH = h - topH - gap;
    drawArray(ctx, { x: 0, y: 0, w: w * 0.44 - gap / 2, h: topH }, result);
    drawIntervals(ctx, { x: w * 0.44 + gap / 2, y: 0, w: w * 0.56 - gap / 2, h: topH }, result);
    drawPaths(ctx, { x: 0, y: topH + gap, w: w * 0.47 - gap / 2, h: bottomH }, result);
    drawRankTable(ctx, { x: w * 0.47 + gap / 2, y: topH + gap, w: w * 0.53 - gap / 2, h: bottomH }, result);
  }

  function updateOutputs(container, params) {
    container.querySelectorAll("[data-output]").forEach(function (output) {
      var key = output.getAttribute("data-output");
      output.textContent = params[key];
    });
  }

  function render(container) {
    var raw = {};
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    var result = evaluate(raw);
    updateOutputs(container, result.params);
    var metrics = container.querySelector("[data-metrics]");
    if (metrics) {
      var audit = cachedAudit();
      metrics.innerHTML = [
        metric("prefix sum", formatNumber(result.query.sum)),
        metric("query touches", String(result.query.path.length)),
        metric("update touches", String(result.updatePath.length)),
        metric("new prefix", formatNumber(result.updatedQuery.sum)),
        metric("rank index", String(result.rank.index)),
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
    lowbit: lowbit,
    makeValues: makeValues,
    buildFenwick: buildFenwick,
    prefix: prefix,
    add: add,
    findByPrefix: findByPrefix,
    evaluate: evaluate,
    runAudit: runAudit
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FenwickTreeLab = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", function () {
        root.document.querySelectorAll("[data-fenwick-lab]").forEach(mount);
      });
    } else {
      root.document.querySelectorAll("[data-fenwick-lab]").forEach(mount);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
