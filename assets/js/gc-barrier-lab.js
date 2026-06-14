(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    white: "#f8fafc",
    whiteStroke: "#94a3b8",
    gray: "#fbbf24",
    grayStroke: "#d97706",
    black: "#172026",
    live: "#0f766e",
    good: "#0f766e",
    bad: "#be123c",
    barrier: "#2563eb",
    floating: "#7c3aed"
  };

  var INITIAL_EDGES = {
    A: ["B", "C"],
    B: ["D"],
    C: [],
    D: ["E"],
    E: [],
    U: ["V"],
    V: ["U"]
  };

  var POSITIONS = {
    A: [0.18, 0.26],
    B: [0.38, 0.18],
    C: [0.38, 0.38],
    D: [0.60, 0.18],
    E: [0.80, 0.18],
    U: [0.62, 0.58],
    V: [0.80, 0.58]
  };

  var LABELS = {
    A: "root object",
    B: "list head",
    C: "cache",
    D: "node D",
    E: "node E",
    U: "cycle U",
    V: "cycle V"
  };

  function cloneEdges(edges) {
    var out = {};
    Object.keys(edges).forEach(function (id) {
      out[id] = edges[id].slice();
    });
    return out;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var barrier = String(raw.barrier || "none");
    var mutation = String(raw.mutation || "hide");
    if (["none", "incremental", "snapshot"].indexOf(barrier) < 0) barrier = "none";
    if (["none", "hide", "delete"].indexOf(mutation) < 0) mutation = "hide";
    return { barrier: barrier, mutation: mutation };
  }

  function reachable(edges, roots) {
    var seen = {};
    var stack = roots.slice();
    while (stack.length) {
      var id = stack.pop();
      if (seen[id]) continue;
      seen[id] = true;
      (edges[id] || []).forEach(function (next) {
        if (!seen[next]) stack.push(next);
      });
    }
    return Object.keys(seen).sort();
  }

  function makeColors() {
    return { A: "white", B: "white", C: "white", D: "white", E: "white", U: "white", V: "white" };
  }

  function colorRank(color) {
    if (color === "black") return 3;
    if (color === "gray") return 2;
    return 1;
  }

  function edgeKey(from, to) {
    return from + "->" + to;
  }

  function scanObject(id, edges, colors, queue, events) {
    colors[id] = "black";
    events.push("scan " + id + ": blacken it and shade its outgoing references");
    (edges[id] || []).forEach(function (child) {
      if (colors[child] === "white") {
        colors[child] = "gray";
        queue.push(child);
        events.push("  shade " + child + " gray from " + id);
      }
    });
  }

  function shade(id, colors, queue, events, why) {
    if (colors[id] === "white") {
      colors[id] = "gray";
      queue.push(id);
      events.push(why + ": shade " + id + " gray");
      return true;
    }
    events.push(why + ": " + id + " was already " + colors[id]);
    return false;
  }

  function applyMutation(params, edges, colors, queue, events) {
    var highlighted = {};
    var barrierEvents = 0;
    if (params.mutation === "none") {
      events.push("mutator does not change the graph during this collection");
      return { barrierEvents: 0, highlighted: highlighted, mutationLabel: "no mutation" };
    }

    if (params.mutation === "hide") {
      events.push("mutator moves D: A gets a pointer to D, then B drops its pointer");
      edges.A = ["B", "C", "D"];
      highlighted[edgeKey("A", "D")] = true;
      if (params.barrier === "incremental" && colors.A === "black") {
        if (shade("D", colors, queue, events, "incremental-update barrier on A := D")) barrierEvents += 1;
      }
      var oldB = edges.B.slice();
      edges.B = [];
      highlighted[edgeKey("B", "D")] = true;
      if (params.barrier === "snapshot") {
        oldB.forEach(function (oldChild) {
          if (shade(oldChild, colors, queue, events, "snapshot-at-beginning barrier on B overwrite")) barrierEvents += 1;
        });
      }
      return { barrierEvents: barrierEvents, highlighted: highlighted, mutationLabel: "black A receives white D; B drops D" };
    }

    events.push("mutator deletes B's pointer to D while collection is in flight");
    var old = edges.B.slice();
    edges.B = [];
    highlighted[edgeKey("B", "D")] = true;
    if (params.barrier === "snapshot") {
      old.forEach(function (oldChild) {
        if (shade(oldChild, colors, queue, events, "snapshot-at-beginning barrier on B overwrite")) barrierEvents += 1;
      });
    }
    return { barrierEvents: barrierEvents, highlighted: highlighted, mutationLabel: "B drops D" };
  }

  function blackToWhiteEdges(edges, colors) {
    var out = [];
    Object.keys(edges).forEach(function (from) {
      if (colors[from] !== "black") return;
      edges[from].forEach(function (to) {
        if (colors[to] === "white") out.push(edgeKey(from, to));
      });
    });
    return out.sort();
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var edges = cloneEdges(INITIAL_EDGES);
    var roots = ["A"];
    var colors = makeColors();
    var events = [];
    var beginningReachable = reachable(edges, roots);
    var queue = [];
    shade("A", colors, queue, events, "root scan");
    scanObject(queue.shift(), edges, colors, queue, events);
    var mutation = applyMutation(params, edges, colors, queue, events);
    while (queue.length) {
      scanObject(queue.shift(), edges, colors, queue, events);
    }
    var currentReachable = reachable(edges, roots);
    var kept = Object.keys(colors).filter(function (id) { return colors[id] !== "white"; }).sort();
    var swept = Object.keys(colors).filter(function (id) { return colors[id] === "white"; }).sort();
    var unsafeWhite = currentReachable.filter(function (id) { return colors[id] === "white"; });
    var floating = kept.filter(function (id) { return currentReachable.indexOf(id) < 0; });
    var blackWhite = blackToWhiteEdges(edges, colors);
    var verdict = "exact collection";
    if (unsafeWhite.length) verdict = "unsound: live object would be swept";
    else if (floating.length) verdict = "safe but conservative";
    return {
      barrierEvents: mutation.barrierEvents,
      beginningReachable: beginningReachable,
      blackToWhiteEdges: blackWhite,
      colors: colors,
      currentReachable: currentReachable,
      edges: edges,
      events: events,
      floating: floating,
      highlighted: mutation.highlighted,
      kept: kept,
      mutationLabel: mutation.mutationLabel,
      params: params,
      swept: swept,
      unsafeWhite: unsafeWhite,
      verdict: verdict
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function metric(label, value, tone) {
    var klass = "gc-lab__metric";
    if (tone) klass += " gc-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x + 14, box.y + 12);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 31);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines < maxLines)) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function nodeStyle(color) {
    if (color === "black") return { fill: COLORS.black, stroke: COLORS.black, text: "#ffffff" };
    if (color === "gray") return { fill: COLORS.gray, stroke: COLORS.grayStroke, text: COLORS.text };
    return { fill: COLORS.white, stroke: COLORS.whiteStroke, text: COLORS.text };
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, dashed) {
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var radius = 21;
    var sx = x1 + Math.cos(angle) * radius;
    var sy = y1 + Math.sin(angle) * radius;
    var ex = x2 - Math.cos(angle) * radius;
    var ey = y2 - Math.sin(angle) * radius;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - 0.45) * 8, ey - Math.sin(angle - 0.45) * 8);
    ctx.lineTo(ex - Math.cos(angle + 0.45) * 8, ey - Math.sin(angle + 0.45) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGraph(ctx, result, box) {
    panel(ctx, box, "Heap graph after collection", result.mutationLabel);
    var graphBox = { x: box.x + 18, y: box.y + 58, w: box.w - 36, h: box.h - 88 };
    label(ctx, "root", graphBox.x, graphBox.y - 18, "left", COLORS.live, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    Object.keys(result.edges).forEach(function (from) {
      result.edges[from].forEach(function (to) {
        var a = POSITIONS[from];
        var b = POSITIONS[to];
        var key = edgeKey(from, to);
        var color = result.blackToWhiteEdges.indexOf(key) >= 0 ? COLORS.bad : result.highlighted[key] ? COLORS.barrier : COLORS.rule;
        drawArrow(ctx, graphBox.x + a[0] * graphBox.w, graphBox.y + a[1] * graphBox.h, graphBox.x + b[0] * graphBox.w, graphBox.y + b[1] * graphBox.h, color, result.highlighted[key]);
      });
    });
    drawArrow(ctx, graphBox.x - 10, graphBox.y + 0.26 * graphBox.h, graphBox.x + POSITIONS.A[0] * graphBox.w, graphBox.y + POSITIONS.A[1] * graphBox.h, COLORS.live, false);
    Object.keys(POSITIONS).forEach(function (id) {
      var p = POSITIONS[id];
      var x = graphBox.x + p[0] * graphBox.w;
      var y = graphBox.y + p[1] * graphBox.h;
      var style = nodeStyle(result.colors[id]);
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(ctx, id, x, y - 3, "center", style.text, "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, result.colors[id], x, y + 15, "center", style.text, "9px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, LABELS[id], x, y + 34, "center");
    });
  }

  function drawLedger(ctx, result, box) {
    panel(ctx, box, "Collector ledger", "what survives the sweep");
    var rows = [
      ["current reachable", result.currentReachable.join(", ") || "none", COLORS.live],
      ["kept marked", result.kept.join(", ") || "none", COLORS.text],
      ["would sweep", result.swept.join(", ") || "none", result.unsafeWhite.length ? COLORS.bad : COLORS.muted],
      ["unsafe white", result.unsafeWhite.join(", ") || "none", result.unsafeWhite.length ? COLORS.bad : COLORS.good],
      ["floating garbage", result.floating.join(", ") || "none", result.floating.length ? COLORS.floating : COLORS.good],
      ["black -> white", result.blackToWhiteEdges.join(", ") || "none", result.blackToWhiteEdges.length ? COLORS.bad : COLORS.good]
    ];
    var y = box.y + 64;
    rows.forEach(function (row, index) {
      var rowY = y + index * 31;
      ctx.fillStyle = index % 2 ? "rgba(215,222,229,0.22)" : "transparent";
      ctx.fillRect(box.x + 10, rowY - 13, box.w - 20, 25);
      label(ctx, row[0], box.x + 16, rowY, "left", COLORS.text, "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, row[1], box.x + box.w - 16, rowY, "right", row[2], "11px ui-monospace, SFMono-Regular, Menlo, monospace");
    });
  }

  function drawEvents(ctx, result, box) {
    panel(ctx, box, "Interleaving", "collector and mutator steps");
    var rows = result.events.slice(0, 11);
    rows.forEach(function (event, index) {
      var y = box.y + 58 + index * 22;
      var color = event.indexOf("barrier") >= 0 || event.indexOf("shade") >= 0 ? COLORS.barrier : event.indexOf("mutator") >= 0 ? COLORS.warn : COLORS.muted;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(box.x + 21, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      wrapText(ctx, event, box.x + 34, y - 5, box.w - 48, 12, 2);
    });
    if (result.events.length > rows.length) label(ctx, "+" + (result.events.length - rows.length) + " more events", box.x + box.w / 2, box.y + box.h - 18, "center");
  }

  function drawInvariant(ctx, result, box) {
    panel(ctx, box, "Invariant", "black objects must not hide white live objects");
    var ok = result.unsafeWhite.length === 0;
    var badge = ok ? "safe to sweep" : "collector would free live data";
    ctx.fillStyle = ok ? "rgba(15,118,110,0.10)" : "rgba(190,18,60,0.10)";
    ctx.strokeStyle = ok ? COLORS.good : COLORS.bad;
    drawRoundRect(ctx, box.x + 20, box.y + 68, box.w - 40, 48, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, badge, box.x + box.w / 2, box.y + 92, "center", ok ? COLORS.good : COLORS.bad, "700 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    var text = ok ?
      "Every currently reachable object is marked. The collector may keep extra objects, but it will not reclaim live ones." :
      "A reachable object stayed white. If the sweep runs now, the program can retain a pointer to reclaimed storage.";
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    wrapText(ctx, text, box.x + 20, box.y + 146, box.w - 40, 16, 5);
  }

  function drawChart(canvas, result) {
    var ratio = global.devicePixelRatio || 1;
    var parentWidth = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 900;
    var cssWidth = Math.max(320, parentWidth);
    var compact = cssWidth < 620;
    var cssHeight = compact ? 1000 : 650;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    var margin = compact ? 14 : 20;
    if (compact) {
      var w = cssWidth - margin * 2;
      drawGraph(ctx, result, { x: margin, y: 16, w: w, h: 320 });
      drawLedger(ctx, result, { x: margin, y: 356, w: w, h: 245 });
      drawEvents(ctx, result, { x: margin, y: 621, w: w, h: 205 });
      drawInvariant(ctx, result, { x: margin, y: 846, w: w, h: 134 });
    } else {
      var gap = 18;
      var leftW = Math.max(390, cssWidth * 0.58);
      var rightW = cssWidth - margin * 2 - gap - leftW;
      drawGraph(ctx, result, { x: margin, y: 20, w: leftW, h: 390 });
      drawLedger(ctx, result, { x: margin + leftW + gap, y: 20, w: rightW, h: 280 });
      drawEvents(ctx, result, { x: margin, y: 430, w: leftW, h: 190 });
      drawInvariant(ctx, result, { x: margin + leftW + gap, y: 320, w: rightW, h: 300 });
    }
  }

  function barrierLabel(value) {
    if (value === "incremental") return "incremental update";
    if (value === "snapshot") return "snapshot at beginning";
    return "none";
  }

  function mutationLabel(value) {
    if (value === "none") return "none";
    if (value === "delete") return "delete subtree";
    return "hide white object";
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("barrier", barrierLabel(result.params.barrier)),
        metric("mutation", mutationLabel(result.params.mutation)),
        metric("barrier events", String(result.barrierEvents)),
        metric("reachable now", String(result.currentReachable.length)),
        metric("kept", String(result.kept.length)),
        metric("unsafe whites", String(result.unsafeWhite.length), result.unsafeWhite.length ? "bad" : "good"),
        metric("floating", String(result.floating.length), result.floating.length ? "warn" : "good"),
        metric("verdict", result.verdict, result.unsafeWhite.length ? "bad" : "good")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-gc-lab]")).forEach(init);
  }

  var api = {
    blackToWhiteEdges: blackToWhiteEdges,
    reachable: reachable,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.GCBarrierLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
