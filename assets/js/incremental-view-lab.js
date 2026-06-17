(function (global) {
  "use strict";

  var COLORS = {
    aux: "#0f766e",
    bg: "#ffffff",
    delta: "#2563eb",
    full: "#be123c",
    grid: "#e6edf3",
    heatNeg: "#be123c",
    heatPos: "#0f766e",
    muted: "#5d6872",
    panel: "#f8fafc",
    rule: "#d7dee5",
    text: "#172026",
    warm: "#d97706"
  };

  var DEFAULTS = {
    batch: 18,
    itemsPerOrder: 5,
    mode: "mixed",
    ordersPerUser: 4,
    seed: 31,
    skew: 55,
    skus: 70,
    users: 180
  };

  var REGIONS = ["na", "eu", "apac", "latam", "mea"];
  var CATEGORIES = ["infra", "games", "tools", "media", "risk", "ai"];
  var MODES = ["mixed", "inserts", "status", "sku", "user"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var mode = MODES.indexOf(raw.mode) >= 0 ? raw.mode : DEFAULTS.mode;
    return {
      batch: Math.round(clamp(finiteNumber(Number(raw.batch), DEFAULTS.batch), 1, 80)),
      itemsPerOrder: Math.round(clamp(finiteNumber(Number(raw.itemsPerOrder), DEFAULTS.itemsPerOrder), 1, 12)),
      mode: mode,
      ordersPerUser: Math.round(clamp(finiteNumber(Number(raw.ordersPerUser), DEFAULTS.ordersPerUser), 1, 8)),
      seed: Math.round(clamp(finiteNumber(Number(raw.seed), DEFAULTS.seed), 1, 999)),
      skew: Math.round(clamp(finiteNumber(Number(raw.skew), DEFAULTS.skew), 0, 90)),
      skus: Math.round(clamp(finiteNumber(Number(raw.skus), DEFAULTS.skus), 20, 180)),
      users: Math.round(clamp(finiteNumber(Number(raw.users), DEFAULTS.users), 40, 420))
    };
  }

  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedIndex(weights, rng) {
    var total = 0;
    for (var i = 0; i < weights.length; i += 1) total += weights[i];
    var r = rng() * total;
    for (var j = 0; j < weights.length; j += 1) {
      r -= weights[j];
      if (r <= 0) return j;
    }
    return weights.length - 1;
  }

  function key2(a, b) {
    return a + "|" + b;
  }

  function addToMap(map, key, value) {
    map[key] = (map[key] || 0) + value;
    if (Math.abs(map[key]) < 1e-9) delete map[key];
  }

  function addNested(map, outer, inner, value) {
    if (!map[outer]) map[outer] = {};
    addToMap(map[outer], inner, value);
  }

  function nestedSize(map) {
    var n = 0;
    Object.keys(map).forEach(function (outer) {
      n += Object.keys(map[outer]).length;
    });
    return n;
  }

  function mapValuesTotal(map) {
    var total = 0;
    Object.keys(map).forEach(function (key) { total += Math.abs(map[key]); });
    return total;
  }

  function generateDatabase(params) {
    var rng = mulberry32(params.seed * 1009 + 17);
    var users = [];
    var orders = [];
    var items = [];
    var products = [];
    var skuWeights = [];
    var alpha = 0.25 + params.skew / 70;
    var orderId = 0;
    var itemId = 0;

    for (var s = 0; s < params.skus; s += 1) {
      skuWeights.push(1 / Math.pow(s + 1, alpha));
      products.push({
        category: CATEGORIES[(s + Math.floor(rng() * CATEGORIES.length)) % CATEGORIES.length],
        price: 12 + Math.floor(rng() * 130) + (s % 7) * 3,
        sku: s
      });
    }

    for (var u = 0; u < params.users; u += 1) {
      var region = REGIONS[weightedIndex([35, 25, 20, 12, 8], rng)];
      users.push({ id: u, region: region });
      var localOrders = Math.max(1, Math.round(params.ordersPerUser + (rng() - 0.5) * 2.2));
      for (var o = 0; o < localOrders; o += 1) {
        var paid = rng() < 0.68;
        orders.push({ id: orderId, paid: paid, userId: u });
        var localItems = Math.max(1, Math.round(params.itemsPerOrder + (rng() - 0.5) * 3.0));
        for (var k = 0; k < localItems; k += 1) {
          var sku = weightedIndex(skuWeights, rng);
          var qty = 1 + Math.floor(rng() * 4);
          var amount = qty * products[sku].price * (0.85 + rng() * 0.35);
          items.push({ amount: amount, id: itemId, orderId: orderId, sku: sku });
          itemId += 1;
        }
        orderId += 1;
      }
    }

    return {
      items: items,
      nextItemId: itemId,
      orders: orders,
      products: products,
      users: users
    };
  }

  function cloneDb(db) {
    return {
      items: db.items.map(function (x) { return Object.assign({}, x); }),
      nextItemId: db.nextItemId,
      orders: db.orders.map(function (x) { return Object.assign({}, x); }),
      products: db.products.map(function (x) { return Object.assign({}, x); }),
      users: db.users.map(function (x) { return Object.assign({}, x); })
    };
  }

  function buildIndexes(db) {
    var orderById = {};
    var userById = {};
    var productBySku = {};
    var itemsByOrder = {};
    var itemsBySku = {};
    var ordersByUser = {};

    db.users.forEach(function (user) { userById[user.id] = user; });
    db.products.forEach(function (product) { productBySku[product.sku] = product; });
    db.orders.forEach(function (order) {
      orderById[order.id] = order;
      if (!ordersByUser[order.userId]) ordersByUser[order.userId] = [];
      ordersByUser[order.userId].push(order);
    });
    db.items.forEach(function (item) {
      if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = [];
      if (!itemsBySku[item.sku]) itemsBySku[item.sku] = [];
      itemsByOrder[item.orderId].push(item);
      itemsBySku[item.sku].push(item);
    });

    return {
      itemsByOrder: itemsByOrder,
      itemsBySku: itemsBySku,
      orderById: orderById,
      ordersByUser: ordersByUser,
      productBySku: productBySku,
      userById: userById
    };
  }

  function computeFullView(db) {
    var idx = buildIndexes(db);
    var view = {};
    var work = 0;
    db.items.forEach(function (item) {
      var order = idx.orderById[item.orderId]; work += 1;
      if (!order || !order.paid) return;
      var user = idx.userById[order.userId]; work += 1;
      var product = idx.productBySku[item.sku]; work += 1;
      if (user && product) addToMap(view, key2(user.region, product.category), item.amount);
    });
    return { view: view, work: work };
  }

  function computeAuxiliary(db) {
    var idx = buildIndexes(db);
    var orderCategory = {};
    var skuRegion = {};
    var userCategory = {};
    var work = 0;

    db.items.forEach(function (item) {
      var order = idx.orderById[item.orderId]; work += 1;
      var product = idx.productBySku[item.sku]; work += 1;
      if (order && product) addNested(orderCategory, order.id, product.category, item.amount);
      if (!order || !order.paid || !product) return;
      var user = idx.userById[order.userId]; work += 1;
      if (!user) return;
      addNested(skuRegion, item.sku, user.region, item.amount);
      addNested(userCategory, user.id, product.category, item.amount);
    });

    return {
      entries: nestedSize(orderCategory) + nestedSize(skuRegion) + nestedSize(userCategory),
      orderCategory: orderCategory,
      skuRegion: skuRegion,
      userCategory: userCategory,
      work: work
    };
  }

  function chooseDifferent(list, current, rng) {
    var next = current;
    var guard = 0;
    while (next === current && guard < 20) {
      next = list[Math.floor(rng() * list.length)];
      guard += 1;
    }
    return next === current ? list[(list.indexOf(current) + 1) % list.length] : next;
  }

  function makeOperations(db, params, count) {
    var rng = mulberry32(params.seed * 7919 + params.batch * 17 + params.skew);
    var idx = buildIndexes(db);
    var ops = [];
    var usedOrders = {};
    var usedSkus = {};
    var usedUsers = {};
    var modeCycle = params.mode === "mixed" ? ["inserts", "status", "sku", "user"] : [params.mode];

    function pickUnique(list, used, getKey) {
      for (var tries = 0; tries < 50; tries += 1) {
        var item = list[Math.floor(rng() * list.length)];
        var key = getKey(item);
        if (!used[key]) {
          used[key] = true;
          return item;
        }
      }
      return list[Math.floor(rng() * list.length)];
    }

    for (var i = 0; i < count; i += 1) {
      var mode = modeCycle[i % modeCycle.length];
      if (mode === "inserts") {
        var order = db.orders[Math.floor(rng() * db.orders.length)];
        var sku = Math.floor(Math.pow(rng(), 1.0 + params.skew / 60) * db.products.length);
        var product = db.products[sku];
        var amount = (1 + Math.floor(rng() * 4)) * product.price * (0.85 + rng() * 0.35);
        ops.push({ amount: amount, mode: mode, orderId: order.id, sku: sku });
      } else if (mode === "status") {
        var statusOrder = pickUnique(db.orders, usedOrders, function (x) { return x.id; });
        ops.push({ mode: mode, newPaid: !statusOrder.paid, orderId: statusOrder.id });
      } else if (mode === "sku") {
        var hotSku = Math.min(db.products.length - 1, Math.floor(Math.pow(rng(), 1.8 + params.skew / 60) * db.products.length));
        if (usedSkus[hotSku]) hotSku = (hotSku + i * 7 + 3) % db.products.length;
        usedSkus[hotSku] = true;
        ops.push({
          mode: mode,
          newCategory: chooseDifferent(CATEGORIES, db.products[hotSku].category, rng),
          sku: hotSku
        });
      } else {
        var user = pickUnique(db.users, usedUsers, function (x) { return x.id; });
        ops.push({
          mode: mode,
          newRegion: chooseDifferent(REGIONS, user.region, rng),
          userId: user.id
        });
      }
    }
    return ops;
  }

  function estimateWork(db, ops) {
    var idx = buildIndexes(db);
    var aux = computeAuxiliary(db);
    var first = 0;
    var advanced = 0;

    ops.forEach(function (op) {
      if (op.mode === "inserts") {
        first += 4;
        advanced += 7;
      } else if (op.mode === "status") {
        var items = idx.itemsByOrder[op.orderId] || [];
        var cats = Object.keys(aux.orderCategory[op.orderId] || {});
        first += 1 + items.length * 2;
        advanced += 1 + Math.max(1, cats.length) * 3;
      } else if (op.mode === "sku") {
        var skuItems = idx.itemsBySku[op.sku] || [];
        var regions = Object.keys(aux.skuRegion[op.sku] || {});
        first += 1 + skuItems.length * 2;
        advanced += 1 + Math.max(1, regions.length) * 3;
      } else if (op.mode === "user") {
        var orders = idx.ordersByUser[op.userId] || [];
        var fanout = 0;
        orders.forEach(function (order) {
          fanout += (idx.itemsByOrder[order.id] || []).length;
        });
        var catsForUser = Object.keys(aux.userCategory[op.userId] || {});
        first += 1 + fanout * 2;
        advanced += 1 + Math.max(1, catsForUser.length) * 3;
      }
    });

    return {
      auxiliary: advanced,
      auxiliaryEntries: aux.entries,
      firstOrder: first
    };
  }

  function applyOperations(db, ops) {
    var copy = cloneDb(db);
    ops.forEach(function (op) {
      if (op.mode === "inserts") {
        copy.items.push({
          amount: op.amount,
          id: copy.nextItemId,
          orderId: op.orderId,
          sku: op.sku
        });
        copy.nextItemId += 1;
      } else if (op.mode === "status") {
        var order = copy.orders[op.orderId];
        if (order) order.paid = op.newPaid;
      } else if (op.mode === "sku") {
        var product = copy.products[op.sku];
        if (product) product.category = op.newCategory;
      } else if (op.mode === "user") {
        var user = copy.users[op.userId];
        if (user) user.region = op.newRegion;
      }
    });
    return copy;
  }

  function diffViews(before, after) {
    var out = {};
    Object.keys(before).forEach(function (key) { addToMap(out, key, -before[key]); });
    Object.keys(after).forEach(function (key) { addToMap(out, key, after[key]); });
    return out;
  }

  function summarizeDiff(diff) {
    var keys = Object.keys(diff);
    var maxAbs = 0;
    var totalAbs = 0;
    keys.forEach(function (key) {
      var abs = Math.abs(diff[key]);
      maxAbs = Math.max(maxAbs, abs);
      totalAbs += abs;
    });
    return {
      maxAbs: maxAbs,
      touched: keys.length,
      totalAbs: totalAbs
    };
  }

  function workForBatch(db, ops) {
    var after = applyOperations(db, ops);
    var full = computeFullView(after).work;
    var estimates = estimateWork(db, ops);
    return {
      auxiliary: estimates.auxiliary,
      firstOrder: estimates.firstOrder,
      full: full
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var db = generateDatabase(params);
    var maxBatch = Math.max(params.batch, 80);
    var ops = makeOperations(db, params, maxBatch);
    var activeOps = ops.slice(0, params.batch);
    var beforeFull = computeFullView(db);
    var afterDb = applyOperations(db, activeOps);
    var afterFull = computeFullView(afterDb);
    var diff = diffViews(beforeFull.view, afterFull.view);
    var diffSummary = summarizeDiff(diff);
    var estimates = estimateWork(db, activeOps);
    var aux = computeAuxiliary(db);
    var sweepSizes = [1, 2, 4, 8, 16, 32, 48, 64, 80].filter(function (n) {
      return n <= maxBatch;
    });
    if (sweepSizes.indexOf(params.batch) < 0) sweepSizes.push(params.batch);
    sweepSizes.sort(function (a, b) { return a - b; });
    var sweep = sweepSizes.map(function (n) {
      var w = workForBatch(db, ops.slice(0, n));
      return {
        auxiliary: w.auxiliary,
        batch: n,
        firstOrder: w.firstOrder,
        full: w.full
      };
    });

    return {
      afterView: afterFull.view,
      beforeView: beforeFull.view,
      db: {
        items: db.items.length,
        orders: db.orders.length,
        products: db.products.length,
        users: db.users.length
      },
      diff: diff,
      ops: activeOps,
      params: params,
      summary: {
        auxiliaryEntries: aux.entries,
        auxiliaryWork: estimates.auxiliary,
        firstOrderWork: estimates.firstOrder,
        fullWork: afterFull.work,
        maxDelta: diffSummary.maxAbs,
        totalDelta: diffSummary.totalAbs,
        touchedCells: diffSummary.touched,
        viewCells: Object.keys(afterFull.view).length
      },
      sweep: sweep
    };
  }

  function audit() {
    var mixed = evaluate(DEFAULTS);
    var large = evaluate(Object.assign({}, DEFAULTS, { batch: 60 }));
    var sku = evaluate(Object.assign({}, DEFAULTS, { mode: "sku", skew: 80, batch: 20 }));
    function finiteResult(result) {
      return [result.summary.fullWork, result.summary.firstOrderWork, result.summary.auxiliaryWork, result.summary.totalDelta].every(Number.isFinite);
    }
    return {
      auxBeatsFirstOnSku: sku.summary.auxiliaryWork < sku.summary.firstOrderWork,
      auxEntriesPositive: mixed.summary.auxiliaryEntries > 0,
      deltaTouchesSubset: mixed.summary.touchedCells <= REGIONS.length * CATEGORIES.length,
      finite: finiteResult(mixed) && finiteResult(large) && finiteResult(sku),
      fullRefreshLarge: large.summary.fullWork > mixed.summary.fullWork * 0.95,
      mixedAuxSpeedup: Number((mixed.summary.fullWork / mixed.summary.auxiliaryWork).toFixed(2)),
      mixedFirstSpeedup: Number((mixed.summary.fullWork / mixed.summary.firstOrderWork).toFixed(2)),
      viewCells: mixed.summary.viewCells
    };
  }

  function fmtInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function fmtMoney(value) {
    if (!Number.isFinite(value)) return "n/a";
    var sign = value < 0 ? "-" : "";
    var abs = Math.abs(value);
    if (abs >= 1000000) return sign + "$" + (abs / 1000000).toFixed(2) + "m";
    if (abs >= 1000) return sign + "$" + (abs / 1000).toFixed(1) + "k";
    return sign + "$" + abs.toFixed(0);
  }

  function metric(label, value, klass) {
    return '<div class="ivm-lab__metric ' + (klass || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      root.querySelectorAll('[data-value="' + key + '"]').forEach(function (out) {
        var value = params[key];
        if (key === "skew") value += "%";
        out.textContent = value;
      });
    });
  }

  function renderMetrics(root, result) {
    var box = root.querySelector("[data-metrics]");
    if (!box) return;
    var s = result.summary;
    box.innerHTML = [
      metric("full refresh", fmtInt(s.fullWork) + " probes", "warn"),
      metric("first-order delta", fmtInt(s.firstOrderWork) + " probes"),
      metric("auxiliary delta", fmtInt(s.auxiliaryWork) + " probes", "good"),
      metric("aux speedup", (s.fullWork / Math.max(1, s.auxiliaryWork)).toFixed(1) + "x", "good"),
      metric("touched cells", s.touchedCells + "/" + (REGIONS.length * CATEGORIES.length)),
      metric("largest move", fmtMoney(s.maxDelta))
    ].join("");
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var ratio = global.devicePixelRatio || 1;
    var width = Math.max(320, Math.round(rect.width || canvas.width || 900));
    var height = width < 560 ? Math.round(width * 1.55) : Math.round(width * 0.78);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function clear(ctx, width, height) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
  }

  function label(ctx, text, x, y, opts) {
    opts = opts || {};
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.font = (opts.weight || 650) + " " + (opts.size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    label(ctx, title, box.x + 14, box.y + 24, { size: 14, weight: 850 });
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 42, { color: COLORS.muted, size: 11, weight: 600 });
  }

  function drawQuery(ctx, result, box) {
    panel(ctx, box, "query as stored state", "revenue by region and category");
    var nodes = [
      ["users", result.db.users, COLORS.delta],
      ["orders", result.db.orders, COLORS.warm],
      ["items", result.db.items, COLORS.full],
      ["products", result.db.products, COLORS.aux],
      ["view", result.summary.viewCells, COLORS.text]
    ];
    var y = box.y + 72;
    var gap = Math.max(8, (box.w - 38 - nodes.length * 62) / (nodes.length - 1));
    nodes.forEach(function (node, index) {
      var x = box.x + 18 + index * (62 + gap);
      ctx.fillStyle = node[2] + "22";
      ctx.strokeStyle = node[2];
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, 62, 48);
      ctx.strokeRect(x + 0.5, y + 0.5, 61, 47);
      label(ctx, node[0], x + 31, y + 19, { align: "center", color: node[2], size: 11, weight: 850 });
      label(ctx, fmtInt(node[1]), x + 31, y + 37, { align: "center", size: 10, weight: 700 });
      if (index < nodes.length - 1) {
        ctx.strokeStyle = COLORS.rule;
        ctx.beginPath();
        ctx.moveTo(x + 64, y + 24);
        ctx.lineTo(x + 62 + gap - 4, y + 24);
        ctx.stroke();
      }
    });
    var auxText = "auxiliary entries: " + fmtInt(result.summary.auxiliaryEntries);
    label(ctx, auxText, box.x + 18, box.y + box.h - 24, { color: COLORS.muted, size: 11, weight: 700 });
  }

  function drawWork(ctx, result, box) {
    panel(ctx, box, "maintenance work", "same answer, different unit of work");
    var rows = [
      ["full refresh", result.summary.fullWork, COLORS.full],
      ["tuple delta", result.summary.firstOrderWork, COLORS.delta],
      ["auxiliary delta", result.summary.auxiliaryWork, COLORS.aux]
    ];
    var max = Math.max.apply(null, rows.map(function (row) { return row[1]; }));
    var plot = { x: box.x + 116, y: box.y + 66, w: box.w - 150, h: box.h - 108 };
    rows.forEach(function (row, index) {
      var y = plot.y + index * 36;
      label(ctx, row[0], box.x + 18, y + 14, { color: row[2], size: 11, weight: 800 });
      var w = Math.max(2, row[1] / max * plot.w);
      ctx.fillStyle = row[2];
      ctx.fillRect(plot.x, y, w, 14);
      label(ctx, fmtInt(row[1]), plot.x + w + 7, y + 12, { color: COLORS.text, size: 10, weight: 700 });
    });
    var speed = result.summary.fullWork / Math.max(1, result.summary.auxiliaryWork);
    label(ctx, "full / auxiliary = " + speed.toFixed(1) + "x", box.x + 18, box.y + box.h - 24, { color: COLORS.aux, size: 12, weight: 850 });
  }

  function heatColor(value, maxAbs) {
    if (!value) return "#eef2f5";
    var t = Math.min(1, Math.abs(value) / Math.max(1, maxAbs));
    var color = value > 0 ? [15, 118, 110] : [190, 18, 60];
    var base = [248, 250, 252];
    var rgb = color.map(function (c, i) { return Math.round(base[i] + (c - base[i]) * (0.18 + 0.72 * t)); });
    return "rgb(" + rgb.join(",") + ")";
  }

  function drawHeatmap(ctx, result, box) {
    panel(ctx, box, "view delta", "only changed cells need to move");
    var plot = { x: box.x + 62, y: box.y + 60, w: box.w - 82, h: box.h - 96 };
    var cellW = plot.w / CATEGORIES.length;
    var cellH = plot.h / REGIONS.length;
    var maxAbs = Math.max(1, result.summary.maxDelta);
    CATEGORIES.forEach(function (cat, c) {
      label(ctx, cat, plot.x + c * cellW + cellW / 2, plot.y - 8, { align: "center", color: COLORS.muted, size: 10, weight: 750 });
    });
    REGIONS.forEach(function (region, r) {
      label(ctx, region, box.x + 16, plot.y + r * cellH + cellH / 2 + 4, { color: COLORS.muted, size: 10, weight: 800 });
      CATEGORIES.forEach(function (cat, c) {
        var key = key2(region, cat);
        var value = result.diff[key] || 0;
        var x = plot.x + c * cellW;
        var y = plot.y + r * cellH;
        ctx.fillStyle = heatColor(value, maxAbs);
        ctx.fillRect(x, y, cellW - 3, cellH - 3);
        if (Math.abs(value) > maxAbs * 0.22) {
          label(ctx, value > 0 ? "+" : "-", x + cellW / 2, y + cellH / 2 + 4, { align: "center", color: "#ffffff", size: 13, weight: 900 });
        }
      });
    });
    label(ctx, "positive revenue delta", plot.x, box.y + box.h - 18, { color: COLORS.aux, size: 10, weight: 800 });
    label(ctx, "negative delta", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.full, size: 10, weight: 800 });
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "batch sweep", "deltas win while change is sparse");
    var rows = result.sweep;
    var plot = { x: box.x + 44, y: box.y + 62, w: box.w - 72, h: box.h - 98 };
    var maxWork = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.full, row.firstOrder, row.auxiliary);
    }));
    function sx(batch) {
      var maxBatch = rows[rows.length - 1].batch;
      return plot.x + (batch - 1) / Math.max(1, maxBatch - 1) * plot.w;
    }
    function sy(value) {
      return plot.y + plot.h - value / Math.max(1, maxWork) * plot.h;
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    [
      ["full", "full", COLORS.full],
      ["firstOrder", "tuple delta", COLORS.delta],
      ["auxiliary", "aux delta", COLORS.aux]
    ].forEach(function (spec) {
      ctx.strokeStyle = spec[2];
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach(function (row, index) {
        var x = sx(row.batch);
        var y = sy(row[spec[0]]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    var currentX = sx(result.params.batch);
    ctx.strokeStyle = COLORS.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(currentX, plot.y);
    ctx.lineTo(currentX, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "full", plot.x + 4, plot.y + 16, { color: COLORS.full, size: 10, weight: 850 });
    label(ctx, "tuple delta", plot.x + 4, plot.y + 32, { color: COLORS.delta, size: 10, weight: 850 });
    label(ctx, "aux delta", plot.x + 4, plot.y + 48, { color: COLORS.aux, size: 10, weight: 850 });
    label(ctx, "batch size", plot.x + plot.w, box.y + box.h - 18, { align: "right", color: COLORS.muted, size: 10, weight: 750 });
  }

  function draw(root, result) {
    var canvas = root.querySelector("canvas[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    clear(ctx, width, height);
    var margin = 18;
    var gap = 18;
    if (width < 560) {
      var h = (height - 2 * margin - 3 * gap) / 4;
      drawQuery(ctx, result, { x: margin, y: margin, w: width - 2 * margin, h: h });
      drawWork(ctx, result, { x: margin, y: margin + h + gap, w: width - 2 * margin, h: h });
      drawHeatmap(ctx, result, { x: margin, y: margin + 2 * (h + gap), w: width - 2 * margin, h: h });
      drawSweep(ctx, result, { x: margin, y: margin + 3 * (h + gap), w: width - 2 * margin, h: h });
    } else {
      var colW = (width - 2 * margin - gap) / 2;
      var rowH = (height - 2 * margin - gap) / 2;
      drawQuery(ctx, result, { x: margin, y: margin, w: colW, h: rowH });
      drawWork(ctx, result, { x: margin + colW + gap, y: margin, w: colW, h: rowH });
      drawHeatmap(ctx, result, { x: margin, y: margin + rowH + gap, w: colW, h: rowH });
      drawSweep(ctx, result, { x: margin + colW + gap, y: margin + rowH + gap, w: colW, h: rowH });
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    draw(root, result);
    root.__incrementalViewLabResult = result;
  }

  function init(root) {
    if (!root || root.__incrementalViewLabReady) return;
    root.__incrementalViewLabReady = true;
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
    requestRender();
  }

  function initAll() {
    global.document.querySelectorAll("[data-incremental-view-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.IncrementalViewLab = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
