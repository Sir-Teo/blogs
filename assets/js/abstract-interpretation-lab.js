(function (global) {
  "use strict";

  var INF = Infinity;
  var PROGRAM_IDS = ["division", "counter", "widening", "correlation"];
  var DOMAINS = ["type", "sign", "interval"];
  var WIDENINGS = ["none", "plain", "threshold"];
  var BUDGETS = [8, 16, 32, 64];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    good: "#0f766e",
    warn: "#d97706",
    bad: "#be123c",
    accent: "#7c3aed",
    blue: "#2563eb",
    dark: "#27323d",
    background: "#ffffff"
  };

  var PROGRAMS = {
    division: {
      title: "Guarded division",
      code: [
        "x = input(1, 12)",
        "y = 10 / x",
        "assert(y <= 10)"
      ],
      thresholds: [0, 1, 10, 12],
      statements: [
        { kind: "input", variable: "x", lo: 1, hi: 12 },
        { kind: "div", variable: "y", numerator: 10, denominator: "x" },
        { kind: "assert", id: "y <= 10", relation: "lte", expr: { kind: "var", name: "y" }, value: 10 }
      ]
    },
    counter: {
      title: "Small counter loop",
      code: [
        "i = 0",
        "while (i < 10) {",
        "  i = i + 1",
        "}",
        "assert(i <= 10)"
      ],
      thresholds: [0, 1, 10],
      statements: [
        { kind: "assign", variable: "i", expr: { kind: "const", value: 0 } },
        {
          kind: "while",
          variable: "i",
          limit: 10,
          body: [
            { kind: "assign", variable: "i", expr: { kind: "add", left: { kind: "var", name: "i" }, right: { kind: "const", value: 1 } } }
          ]
        },
        { kind: "assert", id: "i <= 10", relation: "lte", expr: { kind: "var", name: "i" }, value: 10 }
      ]
    },
    widening: {
      title: "Widening staircase",
      code: [
        "i = 0",
        "while (i < 1000) {",
        "  i = i + 1",
        "}",
        "assert(i <= 1000)"
      ],
      thresholds: [0, 1, 10, 100, 1000],
      statements: [
        { kind: "assign", variable: "i", expr: { kind: "const", value: 0 } },
        {
          kind: "while",
          variable: "i",
          limit: 1000,
          body: [
            { kind: "assign", variable: "i", expr: { kind: "add", left: { kind: "var", name: "i" }, right: { kind: "const", value: 1 } } }
          ]
        },
        { kind: "assert", id: "i <= 1000", relation: "lte", expr: { kind: "var", name: "i" }, value: 1000 }
      ]
    },
    correlation: {
      title: "Lost correlation",
      code: [
        "x = input(0, 20)",
        "y = x",
        "assert(y - x == 0)"
      ],
      thresholds: [0, 20],
      statements: [
        { kind: "input", variable: "x", lo: 0, hi: 20 },
        { kind: "assign", variable: "y", expr: { kind: "var", name: "x" } },
        {
          kind: "assert",
          id: "y - x == 0",
          relation: "eq",
          expr: { kind: "sub", left: { kind: "var", name: "y" }, right: { kind: "var", name: "x" } },
          value: 0
        }
      ]
    }
  };

  function nearestAllowed(value, allowed, fallback) {
    var raw = Number(value);
    if (!isFinite(raw)) return fallback;
    var best = allowed[0];
    var distance = Infinity;
    allowed.forEach(function (candidate) {
      var d = Math.abs(candidate - raw);
      if (d < distance) {
        best = candidate;
        distance = d;
      }
    });
    return best == null ? fallback : best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var program = String(raw.program || "division");
    var domain = String(raw.domain || "interval");
    var widening = String(raw.widening || "threshold");
    if (PROGRAM_IDS.indexOf(program) < 0) program = "division";
    if (DOMAINS.indexOf(domain) < 0) domain = "interval";
    if (WIDENINGS.indexOf(widening) < 0) widening = "threshold";
    return {
      program: program,
      domain: domain,
      widening: widening,
      budget: nearestAllowed(raw.budget == null ? 16 : raw.budget, BUDGETS, 16)
    };
  }

  function bot() {
    return { bot: true, lo: 1, hi: 0 };
  }

  function interval(lo, hi) {
    if (lo > hi) return bot();
    return { bot: false, lo: lo, hi: hi };
  }

  function top() {
    return interval(-INF, INF);
  }

  function cloneInterval(value) {
    return value.bot ? bot() : interval(value.lo, value.hi);
  }

  function equalInterval(a, b) {
    if (a.bot || b.bot) return !!a.bot === !!b.bot;
    return a.lo === b.lo && a.hi === b.hi;
  }

  function joinInterval(a, b) {
    if (a.bot) return cloneInterval(b);
    if (b.bot) return cloneInterval(a);
    return interval(Math.min(a.lo, b.lo), Math.max(a.hi, b.hi));
  }

  function meetInterval(a, b) {
    if (a.bot || b.bot) return bot();
    return interval(Math.max(a.lo, b.lo), Math.min(a.hi, b.hi));
  }

  function addInterval(a, b) {
    if (a.bot || b.bot) return bot();
    return interval(a.lo + b.lo, a.hi + b.hi);
  }

  function subInterval(a, b) {
    if (a.bot || b.bot) return bot();
    return interval(a.lo - b.hi, a.hi - b.lo);
  }

  function mulInterval(a, b) {
    if (a.bot || b.bot) return bot();
    var candidates = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi];
    return interval(Math.min.apply(null, candidates), Math.max.apply(null, candidates));
  }

  function containsZero(value) {
    return !value.bot && value.lo <= 0 && value.hi >= 0;
  }

  function divInterval(a, b) {
    if (a.bot || b.bot) return { value: bot(), divideByZero: false };
    if (containsZero(b)) return { value: top(), divideByZero: true };
    var candidates = [a.lo / b.lo, a.lo / b.hi, a.hi / b.lo, a.hi / b.hi];
    return {
      value: interval(Math.min.apply(null, candidates), Math.max.apply(null, candidates)),
      divideByZero: false
    };
  }

  function abstractInterval(value, domain) {
    if (value.bot) return bot();
    if (domain === "interval") return cloneInterval(value);
    if (domain === "type") return top();
    if (value.lo === 0 && value.hi === 0) return interval(0, 0);
    if (value.lo > 0) return interval(1, INF);
    if (value.hi < 0) return interval(-INF, -1);
    if (value.lo >= 0) return interval(0, INF);
    if (value.hi <= 0) return interval(-INF, 0);
    return top();
  }

  function cloneEnv(env) {
    var out = {};
    Object.keys(env).forEach(function (key) {
      out[key] = cloneInterval(env[key]);
    });
    return out;
  }

  function getVar(env, name) {
    return env[name] ? cloneInterval(env[name]) : top();
  }

  function setVar(env, name, value, domain) {
    var out = cloneEnv(env);
    out[name] = abstractInterval(value, domain);
    return out;
  }

  function joinEnv(a, b) {
    var out = {};
    var keys = {};
    Object.keys(a).forEach(function (key) { keys[key] = true; });
    Object.keys(b).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (key) {
      out[key] = joinInterval(a[key] || bot(), b[key] || bot());
    });
    return out;
  }

  function equalEnv(a, b) {
    var keys = {};
    Object.keys(a).forEach(function (key) { keys[key] = true; });
    Object.keys(b).forEach(function (key) { keys[key] = true; });
    return Object.keys(keys).every(function (key) {
      return equalInterval(a[key] || bot(), b[key] || bot());
    });
  }

  function abstractEnv(env, domain) {
    var out = {};
    Object.keys(env).forEach(function (key) {
      out[key] = abstractInterval(env[key], domain);
    });
    return out;
  }

  function widenBoundLower(oldValue, nextValue, thresholds) {
    if (nextValue >= oldValue) return oldValue;
    for (var i = thresholds.length - 1; i >= 0; i -= 1) {
      if (thresholds[i] <= nextValue && thresholds[i] < oldValue) return thresholds[i];
    }
    return -INF;
  }

  function widenBoundUpper(oldValue, nextValue, thresholds) {
    if (nextValue <= oldValue) return oldValue;
    for (var i = 0; i < thresholds.length; i += 1) {
      if (thresholds[i] >= nextValue && thresholds[i] > oldValue) return thresholds[i];
    }
    return INF;
  }

  function widenInterval(oldValue, nextValue, mode, thresholds) {
    if (oldValue.bot) return cloneInterval(nextValue);
    if (nextValue.bot) return cloneInterval(oldValue);
    if (mode === "none") return cloneInterval(nextValue);
    if (mode === "plain") {
      return interval(
        nextValue.lo < oldValue.lo ? -INF : oldValue.lo,
        nextValue.hi > oldValue.hi ? INF : oldValue.hi
      );
    }
    return interval(
      widenBoundLower(oldValue.lo, nextValue.lo, thresholds),
      widenBoundUpper(oldValue.hi, nextValue.hi, thresholds)
    );
  }

  function widenEnv(oldEnv, nextEnv, mode, thresholds) {
    if (mode === "none") return cloneEnv(nextEnv);
    var out = {};
    var keys = {};
    Object.keys(oldEnv).forEach(function (key) { keys[key] = true; });
    Object.keys(nextEnv).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (key) {
      out[key] = widenInterval(oldEnv[key] || bot(), nextEnv[key] || bot(), mode, thresholds);
    });
    return out;
  }

  function evalExpr(expr, env) {
    if (expr.kind === "const") return interval(expr.value, expr.value);
    if (expr.kind === "var") return getVar(env, expr.name);
    if (expr.kind === "add") return addInterval(evalExpr(expr.left, env), evalExpr(expr.right, env));
    if (expr.kind === "sub") return subInterval(evalExpr(expr.left, env), evalExpr(expr.right, env));
    if (expr.kind === "mul") return mulInterval(evalExpr(expr.left, env), evalExpr(expr.right, env));
    return top();
  }

  function assumeLoopGuard(env, variable, limit, truth) {
    var current = getVar(env, variable);
    var refined = truth ? meetInterval(current, interval(-INF, limit - 1)) : meetInterval(current, interval(limit, INF));
    return setVar(env, variable, refined, "interval");
  }

  function statusTone(status) {
    if (status === "proved") return "good";
    if (status === "bug") return "bad";
    return "warn";
  }

  function analyzeAssert(statement, env, nonconverged) {
    var value = evalExpr(statement.expr, env);
    var status = "warn";
    var detail = "possible";
    if (nonconverged) {
      detail = "no fixed point";
    } else if (statement.relation === "lte") {
      if (!value.bot && value.hi <= statement.value) {
        status = "proved";
        detail = "proved";
      } else if (!value.bot && value.lo > statement.value) {
        status = "bug";
        detail = "violated";
      }
    } else if (statement.relation === "eq") {
      if (!value.bot && value.lo === statement.value && value.hi === statement.value) {
        status = "proved";
        detail = "proved";
      } else if (!value.bot && (value.hi < statement.value || value.lo > statement.value)) {
        status = "bug";
        detail = "violated";
      }
    }
    return {
      kind: "assert",
      id: statement.id,
      status: status,
      detail: detail,
      value: value
    };
  }

  function analyzeBlock(statements, env, params, program, state) {
    var current = cloneEnv(env);
    statements.forEach(function (statement) {
      if (statement.kind === "input") {
        current = setVar(current, statement.variable, interval(statement.lo, statement.hi), params.domain);
        state.steps.push({ kind: "assign", label: statement.variable + " = input", env: cloneEnv(current) });
      } else if (statement.kind === "assign") {
        current = setVar(current, statement.variable, evalExpr(statement.expr, current), params.domain);
        state.steps.push({ kind: "assign", label: statement.variable + " = ...", env: cloneEnv(current) });
      } else if (statement.kind === "div") {
        var numerator = interval(statement.numerator, statement.numerator);
        var denominator = getVar(current, statement.denominator);
        var div = divInterval(numerator, denominator);
        if (div.divideByZero) {
          state.alarms.push({
            kind: "runtime",
            id: "division by zero",
            status: "warn",
            detail: statement.denominator + " may include zero",
            value: denominator
          });
        }
        current = setVar(current, statement.variable, div.value, params.domain);
        state.steps.push({ kind: "assign", label: statement.variable + " = 10 / " + statement.denominator, env: cloneEnv(current) });
      } else if (statement.kind === "while") {
        current = analyzeWhile(statement, current, params, program, state);
      } else if (statement.kind === "assert") {
        var assertion = analyzeAssert(statement, current, state.nonconverged);
        state.alarms.push(assertion);
        state.steps.push({ kind: "assert", label: statement.id, status: assertion.status, env: cloneEnv(current) });
      }
    });
    return current;
  }

  function analyzeWhile(statement, env, params, program, state) {
    var head = abstractEnv(env, params.domain);
    var thresholds = program.thresholds.slice().sort(function (a, b) { return a - b; });
    var converged = false;

    for (var iter = 0; iter < params.budget; iter += 1) {
      var before = cloneEnv(head);
      var guarded = abstractEnv(assumeLoopGuard(head, statement.variable, statement.limit, true), params.domain);
      var bodyState = { steps: [], alarms: state.alarms, trace: state.trace, nonconverged: false };
      var afterBody = analyzeBlock(statement.body, guarded, params, program, bodyState);
      var candidate = abstractEnv(joinEnv(env, afterBody), params.domain);
      var next = abstractEnv(widenEnv(head, candidate, params.widening, thresholds), params.domain);
      state.trace.push({
        iteration: iter + 1,
        before: before[statement.variable] || bot(),
        candidate: candidate[statement.variable] || bot(),
        next: next[statement.variable] || bot()
      });
      if (equalEnv(head, next)) {
        converged = true;
        head = next;
        break;
      }
      head = next;
    }

    state.loop = {
      variable: statement.variable,
      limit: statement.limit,
      converged: converged,
      iterations: state.trace.length
    };
    if (!converged) state.nonconverged = true;

    var exitEnv = converged ? abstractEnv(assumeLoopGuard(head, statement.variable, statement.limit, false), params.domain) : head;
    state.steps.push({
      kind: "while",
      label: "while " + statement.variable + " < " + statement.limit,
      status: converged ? "proved" : "warn",
      env: cloneEnv(exitEnv)
    });
    return exitEnv;
  }

  function analyze(raw) {
    var params = cleanParams(raw);
    var program = PROGRAMS[params.program];
    var state = {
      params: params,
      program: program,
      steps: [],
      alarms: [],
      trace: [],
      loop: null,
      nonconverged: false
    };
    state.finalEnv = analyzeBlock(program.statements, {}, params, program, state);
    state.proved = state.alarms.filter(function (alarm) { return alarm.status === "proved"; }).length;
    state.warnings = state.alarms.filter(function (alarm) { return alarm.status === "warn"; }).length;
    state.bugs = state.alarms.filter(function (alarm) { return alarm.status === "bug"; }).length;
    return state;
  }

  function formatBound(value) {
    if (value === INF) return "inf";
    if (value === -INF) return "-inf";
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function formatInterval(value, domain) {
    if (!value || value.bot) return "empty";
    if (domain === "type") return "number";
    if (domain === "sign") {
      if (value.lo === 0 && value.hi === 0) return "zero";
      if (value.lo > 0) return "positive";
      if (value.hi < 0) return "negative";
      if (value.lo >= 0) return "nonnegative";
      if (value.hi <= 0) return "nonpositive";
      return "number";
    }
    return "[" + formatBound(value.lo) + ", " + formatBound(value.hi) + "]";
  }

  function envVariables(env) {
    return Object.keys(env).sort();
  }

  function intervalWidth(value) {
    if (!value || value.bot) return 0;
    if (!isFinite(value.lo) || !isFinite(value.hi)) return INF;
    return Math.max(0, value.hi - value.lo);
  }

  function precisionScore(env) {
    var vars = envVariables(env);
    if (!vars.length) return 0;
    var finite = 0;
    vars.forEach(function (key) {
      if (isFinite(intervalWidth(env[key]))) finite += 1;
    });
    return finite / vars.length;
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, params) {
    Object.keys(params).forEach(function (key) {
      var input = root.querySelector('[data-param="' + key + '"]');
      if (input) input.value = String(params[key]);
    });
  }

  function metric(label, value, tone) {
    var klass = "abstract-lab__metric";
    if (tone) klass += " abstract-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var loopText = data.loop ? (data.loop.converged ? data.loop.iterations + " iters" : "no fixed point") : "no loop";
    var loopTone = data.loop && !data.loop.converged ? "warn" : "good";
    var proofText = data.bugs ? "bug found" : (data.warnings ? "warnings" : "proved");
    var proofTone = data.bugs ? "bad" : (data.warnings ? "warn" : "good");
    var vars = envVariables(data.finalEnv);
    var finalText = vars.map(function (key) {
      return key + "=" + formatInterval(data.finalEnv[key], data.params.domain);
    }).join(", ") || "empty";
    var html = [
      metric("Result", proofText, proofTone),
      metric("Domain", data.params.domain),
      metric("Loop", loopText, loopTone),
      metric("Warnings", String(data.warnings), data.warnings ? "warn" : "good"),
      metric("Proved checks", String(data.proved), data.proved ? "good" : ""),
      metric("Finite facts", Math.round(precisionScore(data.finalEnv) * 100) + "%"),
      metric("Final state", finalText),
      metric("Strategy", data.params.widening)
    ].join("");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = html;
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 400) + " " + size + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
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

  function fillPanel(ctx, x, y, w, h) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  function drawPill(ctx, x, y, text, tone) {
    var color = tone === "good" ? COLORS.good : tone === "bad" ? COLORS.bad : COLORS.warn;
    setFont(ctx, 11, 700);
    var width = Math.max(58, ctx.measureText(text).width + 18);
    ctx.fillStyle = color;
    drawRoundRect(ctx, x, y, width, 23, 11);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x + 9, y + 15);
    return width;
  }

  function drawCodePanel(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(data.program.title, x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("program text and static checks", x + 18, y + 47);

    var lineY = y + 78;
    data.program.code.forEach(function (line, index) {
      ctx.fillStyle = index % 2 ? "#ffffff" : "#f2f6fa";
      drawRoundRect(ctx, x + 18, lineY - 18, w - 36, 30, 5);
      ctx.fill();
      setFont(ctx, 12, 650);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(String(index + 1).padStart(2, "0"), x + 31, lineY + 2);
      setFont(ctx, 13, 550);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(line, x + 58, lineY + 2);
      lineY += 36;
    });

    var y0 = y + h - 98;
    setFont(ctx, 12, 700);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Checks", x + 18, y0);
    var cx = x + 18;
    var cy = y0 + 13;
    data.alarms.forEach(function (alarm) {
      var label = alarm.status === "proved" ? "proved" : alarm.status === "bug" ? "bug" : "warning";
      var width = drawPill(ctx, cx, cy, label, statusTone(alarm.status));
      setFont(ctx, 12, 550);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(alarm.id, cx + width + 8, cy + 15);
      cy += 30;
    });
    if (!data.alarms.length) {
      setFont(ctx, 12, 550);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("No explicit assertions in this program.", x + 18, cy + 15);
    }
  }

  function drawDomainPanel(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Abstraction ladder", x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("smaller domains prove fewer properties", x + 18, y + 47);

    var rows = [
      { id: "concrete", label: "concrete values", detail: "all executions" },
      { id: "interval", label: "intervals", detail: "[lo, hi]" },
      { id: "sign", label: "signs", detail: "negative / zero / positive" },
      { id: "type", label: "types", detail: "number" }
    ];
    var rowY = y + 78;
    rows.forEach(function (row) {
      var active = row.id === data.params.domain;
      ctx.fillStyle = active ? "rgba(124, 58, 237, 0.12)" : "#ffffff";
      ctx.strokeStyle = active ? "rgba(124, 58, 237, 0.4)" : COLORS.rule;
      drawRoundRect(ctx, x + 18, rowY - 20, w - 36, 36, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? COLORS.accent : COLORS.text;
      setFont(ctx, 12, 750);
      ctx.fillText(row.label, x + 32, rowY - 1);
      ctx.fillStyle = COLORS.muted;
      setFont(ctx, 11, 500);
      ctx.fillText(row.detail, x + 162, rowY - 1);
      rowY += 45;
    });

    var vars = envVariables(data.finalEnv);
    setFont(ctx, 12, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Final abstract facts", x + 18, y + h - 78);
    var factY = y + h - 53;
    vars.forEach(function (key) {
      setFont(ctx, 12, 700);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(key, x + 18, factY);
      setFont(ctx, 12, 550);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(formatInterval(data.finalEnv[key], data.params.domain), x + 46, factY);
      factY += 20;
    });
  }

  function drawTracePanel(ctx, data, box) {
    var x = box.x;
    var y = box.y;
    var w = box.w;
    var h = box.h;
    fillPanel(ctx, x, y, w, h);
    setFont(ctx, 15, 750);
    ctx.fillStyle = COLORS.text;
    ctx.fillText("Fixed-point iteration", x + 18, y + 28);
    setFont(ctx, 12, 500);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("upper bound after each loop pass", x + 18, y + 47);

    if (!data.trace.length) {
      setFont(ctx, 13, 550);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText("This preset has no loop; the abstract interpreter runs straight through.", x + 18, y + 94);
      return;
    }

    var px = x + 50;
    var py = y + 75;
    var pw = w - 82;
    var ph = h - 125;
    var maxFinite = data.loop ? data.loop.limit : 10;
    data.trace.forEach(function (row) {
      if (isFinite(row.next.hi)) maxFinite = Math.max(maxFinite, row.next.hi);
    });
    var maxY = maxFinite * 1.08 || 1;

    function sx(index) {
      var denom = Math.max(1, data.trace.length - 1);
      return px + index / denom * pw;
    }

    function sy(value) {
      if (!isFinite(value)) return py + 7;
      return py + ph - Math.min(value, maxY) / maxY * ph;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    setFont(ctx, 11, 500);
    ctx.fillStyle = COLORS.muted;
    for (var gy = 0; gy <= 4; gy += 1) {
      var value = maxY * gy / 4;
      var yy = sy(value);
      ctx.beginPath();
      ctx.moveTo(px, yy);
      ctx.lineTo(px + pw, yy);
      ctx.stroke();
      ctx.fillText(formatBound(value), x + 14, yy + 4);
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    if (data.loop) {
      var limitY = sy(data.loop.limit);
      ctx.strokeStyle = "rgba(15, 118, 110, 0.48)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, limitY);
      ctx.lineTo(px + pw, limitY);
      ctx.stroke();
      ctx.setLineDash([]);
      setFont(ctx, 11, 650);
      ctx.fillStyle = COLORS.good;
      ctx.fillText("loop limit " + data.loop.limit, px + pw - 84, limitY - 6);
    }

    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    data.trace.forEach(function (row, index) {
      var xx = sx(index);
      var yy = sy(row.next.hi);
      if (index === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();

    data.trace.forEach(function (row, index) {
      var xx = sx(index);
      var yy = sy(row.next.hi);
      ctx.fillStyle = !isFinite(row.next.hi) ? COLORS.warn : COLORS.blue;
      ctx.beginPath();
      ctx.arc(xx, yy, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    var status = data.loop && data.loop.converged ? "fixed point reached" : "budget exhausted";
    ctx.fillStyle = data.loop && data.loop.converged ? COLORS.good : COLORS.warn;
    setFont(ctx, 12, 700);
    ctx.fillText(status, x + 18, y + h - 30);
    ctx.fillStyle = COLORS.muted;
    setFont(ctx, 11, 500);
    var last = data.trace[data.trace.length - 1];
    ctx.fillText("last upper bound: " + formatBound(last.next.hi), x + 170, y + h - 30);
  }

  function drawLab(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCodePanel(ctx, data, { x: 18, y: 18, w: 512, h: 410 });
    drawDomainPanel(ctx, data, { x: 548, y: 18, w: 334, h: 410 });
    drawTracePanel(ctx, data, { x: 18, y: 448, w: 864, h: 234 });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    var scheduled = false;

    function render() {
      scheduled = false;
      var data = analyze(paramsFromRoot(root));
      updateControls(root, data.params);
      renderMetrics(root, data);
      drawLab(canvas, data);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      if (global.requestAnimationFrame) global.requestAnimationFrame(render);
      else setTimeout(render, 0);
    }

    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("change", schedule);
      input.addEventListener("input", schedule);
    });
    schedule();
  }

  var api = {
    PROGRAMS: PROGRAMS,
    cleanParams: cleanParams,
    analyze: analyze,
    formatInterval: formatInterval,
    abstractInterval: abstractInterval
  };

  global.AbstractInterpretationLab = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", function () {
      global.document.querySelectorAll("[data-abstract-interpretation-lab]").forEach(init);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
