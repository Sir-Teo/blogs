(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#ffffff",
    bg: "#f8fafc",
    best: "#0f766e",
    greedy: "#be123c",
    shared: "#7c3aed",
    node: "#2563eb",
    warn: "#b45309"
  };

  function variable(name) {
    return { op: "var", value: String(name) };
  }

  function number(value) {
    return { op: "num", value: Number(value) };
  }

  function wild(name) {
    return { op: "wild", value: String(name) };
  }

  function call(op, args) {
    return { op: op, args: args };
  }

  function clone(expr) {
    if (expr.op === "var" || expr.op === "num" || expr.op === "wild") return { op: expr.op, value: expr.value };
    return { op: expr.op, args: expr.args.map(clone) };
  }

  function key(expr) {
    if (expr.op === "var") return expr.value;
    if (expr.op === "num") return String(expr.value);
    return "(" + expr.op + " " + expr.args.map(key).join(" ") + ")";
  }

  function pretty(expr) {
    if (expr.op === "var") return expr.value;
    if (expr.op === "num") return String(expr.value);
    if (expr.op === "shl") return "(" + pretty(expr.args[0]) + " << " + pretty(expr.args[1]) + ")";
    var op = expr.op === "add" ? " + " : expr.op === "mul" ? " * " : " / ";
    return "(" + expr.args.map(pretty).join(op) + ")";
  }

  function shortPretty(expr, maxLen) {
    var text = pretty(expr);
    if (text.length <= maxLen) return text;
    return text.slice(0, Math.max(8, maxLen - 1)) + "...";
  }

  function size(expr) {
    if (expr.op === "var" || expr.op === "num") return 1;
    return 1 + expr.args.reduce(function (sum, child) { return sum + size(child); }, 0);
  }

  function cost(expr) {
    if (expr.op === "var" || expr.op === "num") return 1;
    var opCost = { add: 1, mul: 3, div: 3, shl: 1 }[expr.op] || 2;
    return opCost + expr.args.reduce(function (sum, child) { return sum + cost(child); }, 0);
  }

  function sameExpr(a, b) {
    return key(a) === key(b);
  }

  function match(pattern, expr, env) {
    env = env || {};
    if (pattern.op === "wild") {
      var name = pattern.value;
      if (env[name]) return sameExpr(env[name], expr) ? env : null;
      var next = {};
      Object.keys(env).forEach(function (k) { next[k] = env[k]; });
      next[name] = expr;
      return next;
    }
    if (pattern.op !== expr.op) return null;
    if (pattern.op === "var" || pattern.op === "num") return pattern.value === expr.value ? env : null;
    if (!pattern.args || !expr.args || pattern.args.length !== expr.args.length) return null;
    var out = env;
    for (var i = 0; i < pattern.args.length; i += 1) {
      out = match(pattern.args[i], expr.args[i], out);
      if (!out) return null;
    }
    return out;
  }

  function substitute(pattern, env) {
    if (pattern.op === "wild") return clone(env[pattern.value]);
    if (pattern.op === "var" || pattern.op === "num") return clone(pattern);
    return call(pattern.op, pattern.args.map(function (child) { return substitute(child, env); }));
  }

  function staticRule(id, label, from, to) {
    return {
      id: id,
      label: label,
      apply: function (expr) {
        var env = match(from, expr, {});
        if (!env) return [];
        return [{ expr: substitute(to, env), rule: id, label: label }];
      }
    };
  }

  function algebraRules() {
    return [
      staticRule("mul-one-right", "x * 1 -> x", call("mul", [wild("x"), number(1)]), wild("x")),
      staticRule("mul-one-left", "1 * x -> x", call("mul", [number(1), wild("x")]), wild("x")),
      staticRule("add-zero-right", "x + 0 -> x", call("add", [wild("x"), number(0)]), wild("x")),
      staticRule("add-zero-left", "0 + x -> x", call("add", [number(0), wild("x")]), wild("x")),
      {
        id: "const-fold",
        label: "fold constants",
        apply: function (expr) {
          if (!expr.args || expr.args.length !== 2) return [];
          var a = expr.args[0];
          var b = expr.args[1];
          if (a.op !== "num" || b.op !== "num") return [];
          if (expr.op === "add") return [{ expr: number(a.value + b.value), rule: "const-fold", label: "fold constants" }];
          if (expr.op === "mul") return [{ expr: number(a.value * b.value), rule: "const-fold", label: "fold constants" }];
          if (expr.op === "div" && b.value !== 0 && a.value % b.value === 0) {
            return [{ expr: number(a.value / b.value), rule: "const-fold", label: "fold constants" }];
          }
          return [];
        }
      },
      {
        id: "cancel",
        label: "x / x -> 1",
        apply: function (expr) {
          if (expr.op === "div" && sameExpr(expr.args[0], expr.args[1])) return [{ expr: number(1), rule: "cancel", label: "x / x -> 1" }];
          return [];
        }
      }
    ];
  }

  var SCENARIOS = {
    phase: {
      label: "Phase-ordering trap",
      initial: call("div", [call("mul", [variable("a"), number(2)]), number(2)]),
      rules: function () {
        return [
          staticRule("strength-reduce", "x * 2 -> x << 1", call("mul", [wild("x"), number(2)]), call("shl", [wild("x"), number(1)])),
          staticRule("divide-product", "(x * y) / z -> x * (y / z)", call("div", [call("mul", [wild("x"), wild("y")]), wild("z")]), call("mul", [wild("x"), call("div", [wild("y"), wild("z")])]))
        ].concat(algebraRules());
      },
      note: "A local optimizer likes strength reduction, but the saturation search keeps the cancellation path alive."
    },
    factor: {
      label: "Common-factor cleanup",
      initial: call("add", [call("mul", [variable("x"), number(2)]), call("mul", [variable("x"), number(3)])]),
      rules: function () {
        return [
          staticRule("factor-left", "x*a + x*b -> x*(a+b)", call("add", [call("mul", [wild("x"), wild("a")]), call("mul", [wild("x"), wild("b")])]), call("mul", [wild("x"), call("add", [wild("a"), wild("b")])])),
          staticRule("factor-right", "a*x + b*x -> (a+b)*x", call("add", [call("mul", [wild("a"), wild("x")]), call("mul", [wild("b"), wild("x")])]), call("mul", [call("add", [wild("a"), wild("b")]), wild("x")]))
        ].concat(algebraRules());
      },
      note: "Here a greedy local optimizer is fine; the point is not that greedy always fails, only that it has to choose."
    }
  };

  function cleanParams(raw) {
    raw = raw || {};
    var scenario = String(raw.scenario || "phase");
    var rounds = Number(raw.rounds == null || raw.rounds === "" ? 5 : raw.rounds);
    var maxSize = Number(raw.maxSize == null || raw.maxSize === "" ? 13 : raw.maxSize);
    if (!SCENARIOS[scenario]) scenario = "phase";
    if (![3, 4, 5, 6].some(function (x) { return x === rounds; })) rounds = 5;
    if (![9, 11, 13, 15].some(function (x) { return x === maxSize; })) maxSize = 13;
    return { scenario: scenario, rounds: rounds, maxSize: maxSize };
  }

  function rewriteAtRoot(expr, rules) {
    var out = [];
    rules.forEach(function (rule) {
      rule.apply(expr).forEach(function (result) {
        if (!sameExpr(result.expr, expr)) out.push(result);
      });
    });
    return out;
  }

  function rewriteAnywhere(expr, rules) {
    var out = rewriteAtRoot(expr, rules);
    if (!expr.args) return out;
    expr.args.forEach(function (child, index) {
      rewriteAnywhere(child, rules).forEach(function (result) {
        var args = expr.args.map(clone);
        args[index] = result.expr;
        out.push({ expr: call(expr.op, args), rule: result.rule, label: result.label });
      });
    });
    return out;
  }

  function expressionSummary(entry) {
    return {
      cost: entry.cost,
      depth: entry.depth,
      key: entry.key,
      label: entry.label,
      parent: entry.parent,
      rule: entry.rule,
      text: pretty(entry.expr)
    };
  }

  function reconstruct(entries, keyValue) {
    var path = [];
    var cursor = keyValue;
    var guard = 0;
    while (cursor && entries[cursor] && guard < 80) {
      path.push(expressionSummary(entries[cursor]));
      cursor = entries[cursor].parent;
      guard += 1;
    }
    return path.reverse();
  }

  function chooseBest(entries) {
    var best = null;
    Object.keys(entries).forEach(function (k) {
      var entry = entries[k];
      if (!best || entry.cost < best.cost || (entry.cost === best.cost && entry.text < best.text)) best = entry;
    });
    return best;
  }

  function saturate(raw) {
    var params = cleanParams(raw);
    var scenario = SCENARIOS[params.scenario];
    var rules = scenario.rules();
    var initial = clone(scenario.initial);
    var initialKey = key(initial);
    var entries = {};
    entries[initialKey] = {
      cost: cost(initial),
      depth: 0,
      expr: initial,
      key: initialKey,
      label: pretty(initial),
      parent: null,
      rule: "input"
    };
    var roundBuckets = [[initialKey]];
    var stoppedByBudget = false;
    var maxExpressions = 240;

    for (var round = 1; round <= params.rounds; round += 1) {
      var additions = [];
      var keys = Object.keys(entries);
      for (var i = 0; i < keys.length; i += 1) {
        var parentKey = keys[i];
        var parent = entries[parentKey];
        var candidates = rewriteAnywhere(parent.expr, rules);
        for (var j = 0; j < candidates.length; j += 1) {
          var expr = candidates[j].expr;
          if (size(expr) > params.maxSize) continue;
          var k = key(expr);
          if (entries[k]) continue;
          entries[k] = {
            cost: cost(expr),
            depth: round,
            expr: expr,
            key: k,
            label: pretty(expr),
            parent: parentKey,
            rule: candidates[j].label
          };
          additions.push(k);
          if (Object.keys(entries).length >= maxExpressions) {
            stoppedByBudget = true;
            break;
          }
        }
        if (stoppedByBudget) break;
      }
      if (!additions.length) break;
      roundBuckets.push(additions);
      if (stoppedByBudget) break;
    }

    var best = chooseBest(entries);
    return {
      best: expressionSummary(best),
      bestPath: reconstruct(entries, best.key),
      entries: entries,
      initial: expressionSummary(entries[initialKey]),
      params: params,
      roundBuckets: roundBuckets,
      scenario: scenario,
      stoppedByBudget: stoppedByBudget
    };
  }

  function greedy(raw) {
    var params = cleanParams(raw);
    var scenario = SCENARIOS[params.scenario];
    var rules = scenario.rules();
    var current = clone(scenario.initial);
    var path = [{ expr: current, rule: "input", cost: cost(current), text: pretty(current) }];
    for (var step = 0; step < 12; step += 1) {
      var currentCost = cost(current);
      var candidates = rewriteAnywhere(current, rules)
        .filter(function (result) { return size(result.expr) <= params.maxSize && cost(result.expr) < currentCost; })
        .sort(function (a, b) {
          var dc = cost(a.expr) - cost(b.expr);
          if (dc) return dc;
          return pretty(a.expr) < pretty(b.expr) ? -1 : 1;
        });
      if (!candidates.length) break;
      current = candidates[0].expr;
      path.push({ expr: current, rule: candidates[0].label, cost: cost(current), text: pretty(current) });
    }
    return {
      result: { cost: cost(current), key: key(current), text: pretty(current) },
      path: path.map(function (item) {
        return { cost: item.cost, rule: item.rule, text: item.text };
      })
    };
  }

  function analyze(raw) {
    var sat = saturate(raw);
    var g = greedy(raw);
    return {
      best: sat.best,
      bestPath: sat.bestPath,
      greedy: g.result,
      greedyPath: g.path,
      initial: sat.initial,
      nodeCount: Object.keys(sat.entries).length,
      params: sat.params,
      roundBuckets: sat.roundBuckets,
      scenario: sat.scenario,
      stoppedByBudget: sat.stoppedByBudget,
      win: sat.best.cost < g.result.cost
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
    var klass = "eqsat-lab__metric";
    if (tone) klass += " eqsat-lab__metric--" + tone;
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

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = font || "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var next = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(next).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines) return;
      } else {
        line = next;
      }
    }
    if (line && (!maxLines || lines < maxLines)) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function drawPanel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 18, "left", COLORS.text, "700 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawPath(ctx, box, title, path, color) {
    drawPanel(ctx, box, title);
    var y = box.y + 48;
    path.slice(0, 6).forEach(function (item, index) {
      var rowY = y + index * 36;
      ctx.fillStyle = index % 2 ? "rgba(215,222,229,0.22)" : "transparent";
      ctx.fillRect(box.x + 10, rowY - 15, box.w - 20, 31);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(box.x + 22, rowY, 4, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, "c" + item.cost, box.x + box.w - 14, rowY, "right", COLORS.muted, "11px ui-monospace, SFMono-Regular, Menlo, monospace");
      label(ctx, shortPretty(item.expr || { op: "var", value: item.text }, 34), box.x + 34, rowY - 6, "left", COLORS.text, "11px ui-monospace, SFMono-Regular, Menlo, monospace");
      label(ctx, item.rule, box.x + 34, rowY + 9, "left", COLORS.muted, "10px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    if (path.length > 6) label(ctx, "+" + (path.length - 6) + " more", box.x + box.w - 16, box.y + box.h - 18, "right", COLORS.muted);
  }

  function drawFrontier(ctx, analysis, box) {
    drawPanel(ctx, box, "Saturation frontier");
    var buckets = analysis.roundBuckets;
    var gap = 10;
    var colW = Math.max(68, (box.w - 28 - gap * (buckets.length - 1)) / buckets.length);
    var entries = saturate(analysis.params).entries;
    for (var i = 0; i < buckets.length; i += 1) {
      var x = box.x + 14 + i * (colW + gap);
      label(ctx, "r" + i, x, box.y + 44, "left", COLORS.muted, "10px ui-monospace, SFMono-Regular, Menlo, monospace");
      var sorted = buckets[i].slice().sort(function (a, b) {
        return entries[a].cost - entries[b].cost;
      }).slice(0, 5);
      sorted.forEach(function (k, j) {
        var entry = entries[k];
        var y = box.y + 66 + j * 42;
        var isBest = k === analysis.best.key;
        var isGreedy = k === analysis.greedy.key;
        ctx.fillStyle = isBest && isGreedy ? "rgba(124,58,237,0.12)" : isBest ? "rgba(15,118,110,0.12)" : isGreedy ? "rgba(190,18,60,0.10)" : COLORS.bg;
        ctx.strokeStyle = isBest ? COLORS.best : isGreedy ? COLORS.greedy : COLORS.rule;
        drawRoundRect(ctx, x, y, colW, 34, 6);
        ctx.fill();
        ctx.stroke();
        label(ctx, shortPretty(entry.expr, Math.max(10, Math.floor(colW / 7))), x + 7, y + 12, "left", COLORS.text, "10px ui-monospace, SFMono-Regular, Menlo, monospace");
        label(ctx, "c" + entry.cost, x + 7, y + 25, "left", COLORS.muted, "9px ui-monospace, SFMono-Regular, Menlo, monospace");
      });
    }
  }

  function drawChart(canvas, analysis) {
    var ratio = global.devicePixelRatio || 1;
    var parentWidth = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 900;
    var cssWidth = Math.max(320, parentWidth);
    var compact = cssWidth < 720;
    var cssHeight = compact ? 940 : 650;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (compact) {
      drawFrontier(ctx, analysis, { x: 10, y: 12, w: cssWidth - 20, h: 330 });
      drawPath(ctx, { x: 10, y: 360, w: cssWidth - 20, h: 250 }, "Greedy destructive path", analysis.greedyPath, COLORS.greedy);
      drawPath(ctx, { x: 10, y: 630, w: cssWidth - 20, h: 290 }, "Best extracted path", analysis.bestPath, COLORS.best);
    } else {
      drawFrontier(ctx, analysis, { x: 14, y: 16, w: cssWidth - 28, h: 310 });
      drawPath(ctx, { x: 14, y: 348, w: (cssWidth - 42) / 2, h: 280 }, "Greedy destructive path", analysis.greedyPath, COLORS.greedy);
      drawPath(ctx, { x: 28 + (cssWidth - 42) / 2, y: 348, w: (cssWidth - 42) / 2, h: 280 }, "Best extracted path", analysis.bestPath, COLORS.best);
    }
  }

  function render(root) {
    var analysis = analyze(paramsFromRoot(root));
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("scenario", analysis.scenario.label),
        metric("expressions", String(analysis.nodeCount)),
        metric("greedy result", analysis.greedy.text, analysis.win ? "bad" : "good"),
        metric("greedy cost", String(analysis.greedy.cost), analysis.win ? "bad" : "good"),
        metric("best result", analysis.best.text, "good"),
        metric("best cost", String(analysis.best.cost), "good"),
        metric("cost gap", String(analysis.greedy.cost - analysis.best.cost), analysis.win ? "warn" : "good"),
        metric("budget stop", analysis.stoppedByBudget ? "yes" : "no", analysis.stoppedByBudget ? "warn" : "good")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) note.textContent = analysis.scenario.note;
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, analysis);
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-eqsat-lab]")).forEach(init);
  }

  var api = {
    SCENARIOS: SCENARIOS,
    analyze: analyze,
    cleanParams: cleanParams,
    cost: cost,
    key: key,
    pretty: pretty,
    rewriteAnywhere: rewriteAnywhere,
    saturate: saturate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.EqualitySaturationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
