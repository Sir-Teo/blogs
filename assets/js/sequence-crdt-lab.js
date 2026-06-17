(function (global) {
  "use strict";

  var BASE = 32;
  var HEAD_ID = "HEAD";
  var TAIL_PATH = [BASE];
  var HEAD_PATH = [0];
  var COLORS = {
    alice: "#0f766e",
    bob: "#7c3aed",
    chandra: "#d97706",
    dana: "#be123c",
    axis: "#94a3b8",
    bg: "#f8fafc",
    border: "#dbe3ea",
    grid: "#e8eef5",
    muted: "#64748b",
    paper: "#ffffff",
    text: "#0f172a",
    warn: "#b45309"
  };

  var ACTORS = [
    { id: "A", name: "Alice", text: "vectorized", color: COLORS.alice },
    { id: "B", name: "Bob", text: "branching", color: COLORS.bob },
    { id: "C", name: "Chandra", text: "causality", color: COLORS.chandra },
    { id: "D", name: "Dana", text: "document", color: COLORS.dana }
  ];

  var ALLOCATORS = {
    tail: {
      label: "tail-biased",
      note: "Each local keystroke asks for an address close to the right boundary."
    },
    balanced: {
      label: "balanced",
      note: "Each local keystroke takes the midpoint of the remaining address gap."
    },
    left: {
      label: "left-biased",
      note: "Each local keystroke asks for an address close to the left boundary."
    }
  };

  var DEFAULTS = {
    actors: 2,
    letters: 7,
    allocator: "tail",
    seed: 19
  };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var allocator = ALLOCATORS[raw.allocator] ? raw.allocator : DEFAULTS.allocator;
    return {
      actors: Math.round(clamp(toNumber(raw.actors, DEFAULTS.actors), 2, ACTORS.length)),
      allocator: allocator,
      letters: Math.round(clamp(toNumber(raw.letters, DEFAULTS.letters), 3, 10)),
      seed: Math.round(clamp(toNumber(raw.seed, DEFAULTS.seed), 1, 9999))
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1, 0x9e3779b9) || 1;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return (state + 0.5) / 4294967297;
    };
  }

  function comparePath(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i += 1) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }

  function compareToken(a, b) {
    var pathCmp = comparePath(a.path, b.path);
    if (pathCmp !== 0) return pathCmp;
    if (a.actorIndex !== b.actorIndex) return a.actorIndex - b.actorIndex;
    return a.seq - b.seq;
  }

  function copyPath(path) {
    return path.slice();
  }

  function formatPath(path) {
    return path.join(".");
  }

  function allocateBetween(left, right, allocator) {
    var prefix = [];
    for (var level = 0; level < 32; level += 1) {
      var lo = level < left.length ? left[level] : 0;
      var hi = level < right.length ? right[level] : BASE;
      if (hi - lo > 1) {
        var digit;
        if (allocator === "left") digit = lo + 1;
        else if (allocator === "tail") digit = hi - 1;
        else digit = Math.floor((lo + hi) / 2);
        return prefix.concat([digit]);
      }
      prefix.push(lo);
    }
    return prefix.concat([Math.floor(BASE / 2)]);
  }

  function actorChar(actor, index) {
    return actor.text[index % actor.text.length];
  }

  function makeOperations(params) {
    var actors = ACTORS.slice(0, params.actors);
    var ops = [];
    actors.forEach(function (actor, actorIndex) {
      var leftPath = copyPath(HEAD_PATH);
      var leftId = HEAD_ID;
      for (var i = 0; i < params.letters; i += 1) {
        var path = allocateBetween(leftPath, TAIL_PATH, params.allocator);
        var op = {
          actor: actor,
          actorIndex: actorIndex,
          char: actorChar(actor, i),
          id: actor.id + ":" + (i + 1),
          leftId: leftId,
          path: path,
          seq: i + 1
        };
        ops.push(op);
        leftPath = path;
        leftId = op.id;
      }
    });
    return { actors: actors, ops: ops };
  }

  function shuffled(items, seed) {
    var rand = rng(seed);
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function positionMerge(ops) {
    return ops.slice().sort(compareToken).map(function (op, index) {
      return {
        actor: op.actor,
        actorIndex: op.actorIndex,
        char: op.char,
        id: op.id,
        index: index,
        path: op.path,
        seq: op.seq
      };
    });
  }

  function applyRga(order) {
    var nodes = {};
    var children = {};
    var pending = order.slice();
    var buffered = 0;
    var rounds = 0;
    nodes[HEAD_ID] = { id: HEAD_ID, actorIndex: -1, seq: 0 };
    children[HEAD_ID] = [];
    while (pending.length && rounds < order.length + 2) {
      var next = [];
      var progressed = false;
      pending.forEach(function (op) {
        if (nodes[op.leftId]) {
          nodes[op.id] = op;
          if (!children[op.leftId]) children[op.leftId] = [];
          children[op.leftId].push(op.id);
          if (!children[op.id]) children[op.id] = [];
          progressed = true;
        } else {
          buffered += 1;
          next.push(op);
        }
      });
      pending = next;
      rounds += 1;
      if (!progressed && pending.length) break;
    }

    Object.keys(children).forEach(function (parent) {
      children[parent].sort(function (aId, bId) {
        var a = nodes[aId];
        var b = nodes[bId];
        if (a.actorIndex !== b.actorIndex) return a.actorIndex - b.actorIndex;
        if (a.seq !== b.seq) return a.seq - b.seq;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    });

    var tokens = [];
    function visit(id) {
      var list = children[id] || [];
      list.forEach(function (childId) {
        var op = nodes[childId];
        tokens.push({
          actor: op.actor,
          actorIndex: op.actorIndex,
          char: op.char,
          id: op.id,
          leftId: op.leftId,
          seq: op.seq
        });
        visit(childId);
      });
    }
    visit(HEAD_ID);
    return {
      buffered: buffered,
      children: children,
      missing: pending.map(function (op) { return op.id; }),
      nodes: nodes,
      rounds: rounds,
      tokens: tokens
    };
  }

  function textOf(tokens) {
    return tokens.map(function (token) { return token.char; }).join("");
  }

  function segmentStats(tokens, actorCount) {
    if (!tokens.length) return { segments: 0, score: 0, changes: 0 };
    var segments = 1;
    for (var i = 1; i < tokens.length; i += 1) {
      if (tokens[i].actorIndex !== tokens[i - 1].actorIndex) segments += 1;
    }
    var denom = Math.max(1, tokens.length - actorCount);
    return {
      changes: segments - 1,
      score: clamp((segments - actorCount) / denom, 0, 1),
      segments: segments
    };
  }

  function idStats(ops) {
    var maxDepth = 0;
    var totalDepth = 0;
    ops.forEach(function (op) {
      maxDepth = Math.max(maxDepth, op.path.length);
      totalDepth += op.path.length;
    });
    return {
      averageDepth: totalDepth / Math.max(1, ops.length),
      maxDepth: maxDepth
    };
  }

  function convergenceAudit(params, ops) {
    var positionText = textOf(positionMerge(ops));
    var rgaText = textOf(applyRga(shuffled(ops, params.seed)).tokens);
    var variants = [];
    var ok = true;
    for (var i = 0; i < 8; i += 1) {
      var order = shuffled(ops, params.seed + 101 * (i + 1));
      var pText = textOf(positionMerge(order));
      var rText = textOf(applyRga(order).tokens);
      variants.push({ position: pText, rga: rText });
      ok = ok && pText === positionText && rText === rgaText;
    }
    return { ok: ok, variants: variants };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var made = makeOperations(params);
    var delivery = shuffled(made.ops, params.seed);
    var positionTokens = positionMerge(delivery);
    var rga = applyRga(delivery);
    var positionSegments = segmentStats(positionTokens, params.actors);
    var rgaSegments = segmentStats(rga.tokens, params.actors);
    var ids = idStats(made.ops);
    var convergence = convergenceAudit(params, made.ops);
    return {
      actors: made.actors,
      convergence: convergence,
      delivery: delivery,
      idStats: ids,
      ops: made.ops,
      params: params,
      position: {
        segments: positionSegments,
        text: textOf(positionTokens),
        tokens: positionTokens
      },
      rga: {
        buffered: rga.buffered,
        children: rga.children,
        missing: rga.missing,
        nodes: rga.nodes,
        segments: rgaSegments,
        text: textOf(rga.tokens),
        tokens: rga.tokens
      }
    };
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function number(value, digits) {
    return value.toFixed(digits == null ? 1 : digits);
  }

  function ellipsize(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 3)) + "...";
  }

  function metric(label, value, tone) {
    return '<div class="sequence-crdt-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function canvasContext(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    var width = Math.max(320, Math.round(rect.width));
    var height = Math.max(620, Math.round(rect.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.paper;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 22, COLORS.text, 13, 800);
    if (subtitle) label(ctx, subtitle, box.x + 14, box.y + 39, COLORS.muted, 10, 650);
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function actorColor(index, result) {
    return result.actors[index] ? result.actors[index].color : COLORS.muted;
  }

  function drawSequence(ctx, tokens, x, y, w, options, result) {
    var size = options.size || 24;
    var gap = options.gap || 4;
    var perRow = Math.max(1, Math.floor((w + gap) / (size + gap)));
    tokens.forEach(function (token, index) {
      var row = Math.floor(index / perRow);
      var col = index % perRow;
      var tx = x + col * (size + gap);
      var ty = y + row * (size + gap + 3);
      ctx.fillStyle = actorColor(token.actorIndex, result);
      roundRect(ctx, tx, ty, size, size, 5);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 " + Math.max(10, size * 0.55) + "px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(token.char.toUpperCase(), tx + size / 2, ty + size / 2 + 0.5);
    });
    return Math.ceil(tokens.length / perRow) * (size + gap + 3);
  }

  function drawMerged(ctx, box, result) {
    panel(ctx, box, "same cursor, different addresses", "convergent does not mean readable");
    var x = box.x + 16;
    var w = box.w - 32;
    var size = box.w < 420 ? 20 : 24;
    label(ctx, "fractional position IDs", x, box.y + 63, COLORS.muted, 11, 750);
    var h1 = drawSequence(ctx, result.position.tokens, x, box.y + 78, w, { size: size }, result);
    label(ctx, "left-origin list", x, box.y + 98 + h1, COLORS.muted, 11, 750);
    drawSequence(ctx, result.rga.tokens, x, box.y + 113 + h1, w, { size: size }, result);
  }

  function drawAddressLadder(ctx, box, result) {
    panel(ctx, box, "address ladder", "tail-biased allocation spends more identifier levels");
    var plot = { x: box.x + 42, y: box.y + 64, w: box.w - 66, h: box.h - 116 };
    var maxDepth = Math.max(1, result.idStats.maxDepth);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= maxDepth; i += 1) {
      var gy = plot.y + plot.h - plot.h * i / maxDepth;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
      label(ctx, String(i), plot.x - 10, gy, COLORS.muted, 10, 600, "right");
    }
    result.actors.forEach(function (actor, actorIndex) {
      var ops = result.ops.filter(function (op) { return op.actorIndex === actorIndex; });
      ctx.strokeStyle = actor.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ops.forEach(function (op, index) {
        var px = plot.x + (ops.length === 1 ? 0 : plot.w * index / (ops.length - 1));
        var py = plot.y + plot.h - plot.h * op.path.length / maxDepth;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ops.forEach(function (op, index) {
        var px = plot.x + (ops.length === 1 ? 0 : plot.w * index / (ops.length - 1));
        var py = plot.y + plot.h - plot.h * op.path.length / maxDepth;
        ctx.fillStyle = actor.color;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    label(ctx, "local keystroke", plot.x + plot.w, box.y + box.h - 19, COLORS.muted, 10, 650, "right");
    var sample = result.ops.filter(function (op) { return op.actorIndex === 0; }).slice(0, 4);
    var text = sample.map(function (op) { return formatPath(op.path); }).join("  ->  ");
    label(ctx, "A paths: " + ellipsize(text, box.w < 420 ? 30 : 64), box.x + 15, box.y + box.h - 43, COLORS.text, 10, 700);
  }

  function drawRgaTree(ctx, box, result) {
    panel(ctx, box, "left-origin forest", "each character remembers its left neighbor");
    var x0 = box.x + 62;
    var y0 = box.y + 84;
    var rowGap = Math.max(30, (box.h - 120) / result.actors.length);
    label(ctx, "HEAD", x0, y0 - 24, COLORS.muted, 11, 800);
    result.actors.forEach(function (actor, actorIndex) {
      var ops = result.ops.filter(function (op) { return op.actorIndex === actorIndex; });
      var y = y0 + actorIndex * rowGap;
      var maxColumns = Math.max(1, ops.length - 1);
      var step = Math.min(42, (box.w - 120) / maxColumns);
      ctx.strokeStyle = actor.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(x0 + 10, y);
      ctx.lineTo(x0 + 42, y);
      ops.forEach(function (op, index) {
        var cx = x0 + 42 + index * step;
        if (index > 0) {
          ctx.moveTo(cx - step + 11, y);
          ctx.lineTo(cx - 11, y);
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, actor.name, x0 - 8, y, actor.color, 10, 800, "right");
      ops.forEach(function (op, index) {
        var cx = x0 + 42 + index * step;
        ctx.fillStyle = actor.color;
        roundRect(ctx, cx - 11, y - 11, 22, 22, 5);
        ctx.fill();
        label(ctx, op.char.toUpperCase(), cx, y + 0.5, "#ffffff", 11, 850, "center");
      });
    });
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "shuffle audit", "shuffled delivery, same sequence");
    var rows = [
      { label: "position interleaving", value: result.position.segments.score, color: COLORS.warn, text: pct(result.position.segments.score, 0) },
      { label: "RGA interleaving", value: result.rga.segments.score, color: COLORS.alice, text: pct(result.rga.segments.score, 0) },
      { label: "convergence checks", value: result.convergence.ok ? 1 : 0, color: result.convergence.ok ? COLORS.alice : COLORS.warn, text: result.convergence.ok ? "8/8" : "fail" }
    ];
    var x = box.x + 18;
    var y = box.y + 56;
    var w = box.w - 42;
    rows.forEach(function (row, index) {
      var yy = y + index * 42;
      label(ctx, row.label, x, yy, COLORS.text, 11, 750);
      ctx.fillStyle = COLORS.grid;
      roundRect(ctx, x, yy + 14, w, 11, 6);
      ctx.fill();
      ctx.fillStyle = row.color;
      roundRect(ctx, x, yy + 14, Math.max(3, w * row.value), 11, 6);
      ctx.fill();
      label(ctx, row.text, x + w, yy + 19, COLORS.muted, 10, 700, "right");
    });
  }

  function drawCanvas(canvas, result) {
    if (!canvas) return;
    var size = canvasContext(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    var gap = 12;
    if (w < 700) {
      var mergedH = Math.round(h * 0.30);
      var pathH = Math.round(h * 0.23);
      var treeH = Math.round(h * 0.22);
      drawMerged(ctx, { x: 0, y: 0, w: w, h: mergedH }, result);
      drawAddressLadder(ctx, { x: 0, y: mergedH + gap, w: w, h: pathH }, result);
      drawRgaTree(ctx, { x: 0, y: mergedH + pathH + 2 * gap, w: w, h: treeH }, result);
      drawAudit(ctx, { x: 0, y: mergedH + pathH + treeH + 3 * gap, w: w, h: h - mergedH - pathH - treeH - 3 * gap }, result);
    } else {
      var top = Math.round(h * 0.43);
      var bottom = h - top - gap;
      var half = (w - gap) / 2;
      drawMerged(ctx, { x: 0, y: 0, w: w, h: top }, result);
      drawAddressLadder(ctx, { x: 0, y: top + gap, w: half, h: bottom }, result);
      drawRgaTree(ctx, { x: half + gap, y: top + gap, w: half, h: bottom * 0.58 - gap / 2 }, result);
      drawAudit(ctx, { x: half + gap, y: top + gap + bottom * 0.58 + gap / 2, w: half, h: bottom * 0.42 - gap / 2 }, result);
    }
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      var out = root.querySelector("[data-value='" + key + "']");
      if (!out) return;
      if (key === "allocator") out.textContent = ALLOCATORS[params.allocator].label;
      else out.textContent = String(params[key]);
    });
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-role='metrics']");
    if (!el) return;
    el.innerHTML = [
      metric("Position braid", pct(result.position.segments.score, 0), result.position.segments.score > 0.5 ? "sequence-crdt-lab__metric--warn" : ""),
      metric("RGA braid", pct(result.rga.segments.score, 0), result.rga.segments.score < result.position.segments.score ? "sequence-crdt-lab__metric--good" : ""),
      metric("Max depth", String(result.idStats.maxDepth), result.idStats.maxDepth > 4 ? "sequence-crdt-lab__metric--warn" : ""),
      metric("Avg depth", number(result.idStats.averageDepth, 1), ""),
      metric("Buffered", String(result.rga.buffered), ""),
      metric("OK", result.convergence.ok ? "yes" : "no", result.convergence.ok ? "sequence-crdt-lab__metric--good" : "sequence-crdt-lab__metric--warn")
    ].join("");
  }

  function renderNote(root, result) {
    var el = root.querySelector("[data-role='note']");
    if (!el) return;
    el.textContent = ALLOCATORS[result.params.allocator].note + " The position-ID merge reads \"" +
      result.position.text + "\", while the left-origin merge reads \"" + result.rga.text +
      "\". Both were replayed through eight deterministic shuffled deliveries.";
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function syncControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null && input.value !== String(params[key])) input.value = String(params[key]);
    });
  }

  function render(root) {
    var params = readParams(root);
    syncControls(root, params);
    updateOutputs(root, params);
    var result = evaluate(params);
    renderMetrics(root, result);
    renderNote(root, result);
    drawCanvas(root.querySelector("[data-role='canvas']"), result);
    root.__sequenceCrdtResult = result;
  }

  function init(root) {
    if (!root || root.__sequenceCrdtReady) return;
    root.__sequenceCrdtReady = true;
    var schedule = function () {
      if (root.__sequenceCrdtFrame) global.cancelAnimationFrame(root.__sequenceCrdtFrame);
      root.__sequenceCrdtFrame = global.requestAnimationFrame(function () {
        root.__sequenceCrdtFrame = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    schedule();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-sequence-crdt-lab]")).forEach(init);
  }

  function audit() {
    var checks = [];
    function record(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }
    var base = evaluate(DEFAULTS);
    var balanced = evaluate({ actors: 3, letters: 8, allocator: "balanced", seed: 47 });
    var left = evaluate({ actors: 4, letters: 10, allocator: "left", seed: 83 });
    [base, balanced, left].forEach(function (result, index) {
      var labelName = "case " + index + " ";
      record(labelName + "position convergence", result.convergence.variants.every(function (row) {
        return row.position === result.position.text;
      }));
      record(labelName + "rga convergence", result.convergence.variants.every(function (row) {
        return row.rga === result.rga.text;
      }));
      record(labelName + "no missing RGA parents", result.rga.missing.length === 0);
      record(labelName + "all tokens retained", result.position.tokens.length === result.params.actors * result.params.letters && result.rga.tokens.length === result.position.tokens.length);
    });
    record("default position IDs interleave more than RGA", base.position.segments.score > base.rga.segments.score + 0.5);
    record("tail-biased addresses grow with local run length", base.idStats.maxDepth === DEFAULTS.letters);
    record("cleanParams clamps actors", cleanParams({ actors: 99 }).actors === ACTORS.length);
    record("cleanParams clamps letters", cleanParams({ letters: 99 }).letters === 10);
    return {
      checks: checks,
      ok: checks.every(function (check) { return check.ok; }),
      sample: {
        position: base.position.text,
        rga: base.rga.text,
        positionInterleaving: base.position.segments.score,
        rgaInterleaving: base.rga.segments.score,
        maxDepth: base.idStats.maxDepth
      }
    };
  }

  var api = {
    ACTORS: ACTORS,
    ALLOCATORS: ALLOCATORS,
    allocateBetween: allocateBetween,
    audit: audit,
    cleanParams: cleanParams,
    comparePath: comparePath,
    evaluate: evaluate,
    makeOperations: makeOperations,
    positionMerge: positionMerge,
    applyRga: applyRga
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SequenceCrdtLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
