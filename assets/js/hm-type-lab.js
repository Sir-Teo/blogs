(function (global) {
  "use strict";

  var COLORS = {
    app: "#2563eb",
    bad: "#be123c",
    bind: "#0f766e",
    fresh: "#7c3aed",
    generalize: "#b45309",
    grid: "#e8edf3",
    muted: "#5f6d7a",
    panel: "#f8fafc",
    rule: "#d7dee5",
    text: "#172026",
    white: "#ffffff"
  };

  var PRESETS = [
    {
      key: "poly-id",
      label: "let-polymorphic identity",
      code: "let id = \\x -> x in pair (id 1) (id true)",
      expr: Let("id", Lam("x", Var("x")), Pair(App(Var("id"), IntLit(1)), App(Var("id"), BoolLit(true))))
    },
    {
      key: "compose",
      label: "compose",
      code: "\\f -> \\g -> \\x -> f (g x)",
      expr: Lam("f", Lam("g", Lam("x", App(Var("f"), App(Var("g"), Var("x"))))))
    },
    {
      key: "self-app",
      label: "self application",
      code: "\\x -> x x",
      expr: Lam("x", App(Var("x"), Var("x")))
    },
    {
      key: "const",
      label: "constant function",
      code: "let const = \\x -> \\y -> x in const true 3",
      expr: Let("const", Lam("x", Lam("y", Var("x"))), App(App(Var("const"), BoolLit(true)), IntLit(3)))
    },
    {
      key: "apply-inc",
      label: "higher-order apply",
      code: "let apply = \\f -> \\x -> f x in apply inc 41",
      expr: Let("apply", Lam("f", Lam("x", App(Var("f"), Var("x")))), App(App(Var("apply"), Var("inc")), IntLit(41)))
    },
    {
      key: "bad-inc",
      label: "bad primitive call",
      code: "pair (inc true) 0",
      expr: Pair(App(Var("inc"), BoolLit(true)), IntLit(0))
    },
    {
      key: "rank-two-shadow",
      label: "needs rank-2 polymorphism",
      code: "\\f -> pair (f 1) (f true)",
      expr: Lam("f", Pair(App(Var("f"), IntLit(1)), App(Var("f"), BoolLit(true))))
    }
  ];

  var DEFAULTS = {
    letPolymorphism: "on",
    occursCheck: "on",
    preset: "poly-id"
  };

  var BOOLS = ["on", "off"];
  var PRESET_KEYS = PRESETS.map(function (preset) { return preset.key; });

  function Var(name) {
    return { kind: "var", name: name };
  }

  function IntLit(value) {
    return { kind: "int", value: value };
  }

  function BoolLit(value) {
    return { kind: "bool", value: value };
  }

  function Lam(param, body) {
    return { kind: "lam", param: param, body: body };
  }

  function App(fn, arg) {
    return { kind: "app", fn: fn, arg: arg };
  }

  function Let(name, value, body) {
    return { kind: "let", name: name, value: value, body: body };
  }

  function Pair(left, right) {
    return { kind: "pair", left: left, right: right };
  }

  function TVar(name) {
    return { kind: "var", name: name };
  }

  function TCon(name) {
    return { kind: "con", name: name };
  }

  function TFun(from, to) {
    return { kind: "fun", from: from, to: to };
  }

  function TPair(left, right) {
    return { kind: "pair", left: left, right: right };
  }

  function cloneType(type) {
    if (type.kind === "var") return TVar(type.name);
    if (type.kind === "con") return TCon(type.name);
    if (type.kind === "fun") return TFun(cloneType(type.from), cloneType(type.to));
    return TPair(cloneType(type.left), cloneType(type.right));
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      letPolymorphism: BOOLS.indexOf(String(raw.letPolymorphism)) >= 0 ? String(raw.letPolymorphism) : DEFAULTS.letPolymorphism,
      occursCheck: BOOLS.indexOf(String(raw.occursCheck)) >= 0 ? String(raw.occursCheck) : DEFAULTS.occursCheck,
      preset: PRESET_KEYS.indexOf(String(raw.preset)) >= 0 ? String(raw.preset) : DEFAULTS.preset
    };
  }

  function presetByKey(key) {
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].key === key) return PRESETS[i];
    }
    return PRESETS[0];
  }

  function newState(params) {
    return {
      bindings: [],
      counter: 0,
      error: null,
      events: [],
      generalized: [],
      instantiations: 0,
      letPolymorphism: params.letPolymorphism === "on",
      occursCheck: params.occursCheck === "on",
      recursiveBindings: [],
      subst: {},
      unifications: 0
    };
  }

  function scheme(vars, type) {
    return { vars: vars.slice(), type: type };
  }

  function baseEnv() {
    return {
      inc: scheme([], TFun(TCon("Int"), TCon("Int"))),
      not: scheme([], TFun(TCon("Bool"), TCon("Bool")))
    };
  }

  function fresh(state) {
    var name = "t" + state.counter;
    state.counter += 1;
    logEvent(state, "fresh", "fresh variable", "'" + name);
    return TVar(name);
  }

  function logEvent(state, kind, title, detail) {
    state.events.push({
      detail: detail || "",
      kind: kind,
      title: title
    });
    if (state.events.length > 80) state.events.shift();
  }

  function typeVars(type, out, seen) {
    out = out || {};
    seen = seen || {};
    if (!type || seen[type.name + ":" + type.kind]) {
      if (!type || type.kind !== "var") return out;
    }
    if (type.kind === "var") {
      out[type.name] = true;
      return out;
    }
    if (type.kind === "fun") {
      typeVars(type.from, out, seen);
      typeVars(type.to, out, seen);
      return out;
    }
    if (type.kind === "pair") {
      typeVars(type.left, out, seen);
      typeVars(type.right, out, seen);
    }
    return out;
  }

  function schemeVars(sch) {
    var vars = typeVars(sch.type);
    sch.vars.forEach(function (name) { delete vars[name]; });
    return vars;
  }

  function envVars(env) {
    var vars = {};
    Object.keys(env).forEach(function (name) {
      var local = schemeVars(env[name]);
      Object.keys(local).forEach(function (v) { vars[v] = true; });
    });
    return vars;
  }

  function applySubst(type, subst, visiting) {
    visiting = visiting || {};
    if (type.kind === "var" && subst[type.name]) {
      if (visiting[type.name]) return TVar(type.name);
      visiting[type.name] = true;
      var next = applySubst(subst[type.name], subst, visiting);
      delete visiting[type.name];
      return next;
    }
    if (type.kind === "fun") return TFun(applySubst(type.from, subst, visiting), applySubst(type.to, subst, visiting));
    if (type.kind === "pair") return TPair(applySubst(type.left, subst, visiting), applySubst(type.right, subst, visiting));
    return cloneType(type);
  }

  function applySubstToScheme(sch, subst) {
    var filtered = {};
    Object.keys(subst).forEach(function (name) {
      if (sch.vars.indexOf(name) < 0) filtered[name] = subst[name];
    });
    return scheme(sch.vars, applySubst(sch.type, filtered));
  }

  function applySubstToEnv(env, subst) {
    var next = {};
    Object.keys(env).forEach(function (name) {
      next[name] = applySubstToScheme(env[name], subst);
    });
    return next;
  }

  function instantiate(state, sch, label) {
    var mapping = {};
    sch.vars.forEach(function (name) {
      mapping[name] = fresh(state);
    });
    state.instantiations += 1;
    var type = applySubst(sch.type, mapping);
    logEvent(state, "instantiate", "instantiate " + label, formatScheme(sch) + " => " + formatType(type));
    return type;
  }

  function generalize(state, env, type, label) {
    var appliedEnv = applySubstToEnv(env, state.subst);
    var envFree = envVars(appliedEnv);
    var free = typeVars(applySubst(type, state.subst));
    var vars = Object.keys(free).filter(function (name) { return !envFree[name]; }).sort();
    var sch = scheme(vars, applySubst(type, state.subst));
    if (vars.length) {
      state.generalized.push({
        label: label,
        scheme: sch
      });
    }
    logEvent(state, "generalize", state.letPolymorphism ? "generalize " + label : "keep " + label + " monomorphic", formatScheme(sch));
    return sch;
  }

  function occursIn(name, type, subst, seen) {
    type = applySubst(type, subst);
    seen = seen || {};
    if (type.kind === "var") return type.name === name;
    if (type.kind === "fun") return occursIn(name, type.from, subst, seen) || occursIn(name, type.to, subst, seen);
    if (type.kind === "pair") return occursIn(name, type.left, subst, seen) || occursIn(name, type.right, subst, seen);
    return false;
  }

  function bindVar(state, name, type) {
    type = applySubst(type, state.subst);
    if (type.kind === "var" && type.name === name) return;
    if (state.occursCheck && occursIn(name, type, state.subst)) {
      throw new Error("occurs check: '" + name + " would contain itself in " + formatType(type));
    }
    if (!state.occursCheck && occursIn(name, type, state.subst)) {
      state.recursiveBindings.push("'" + name + " = " + formatType(type));
      logEvent(state, "bad", "recursive type allowed", "'" + name + " = " + formatType(type));
    }
    state.subst[name] = type;
    state.bindings.push({
      name: name,
      type: type
    });
    logEvent(state, "bind", "bind '" + name, formatType(type));
  }

  function unify(state, left, right) {
    left = applySubst(left, state.subst);
    right = applySubst(right, state.subst);
    state.unifications += 1;
    logEvent(state, "app", "unify", formatType(left) + " ~ " + formatType(right));
    if (left.kind === "var") {
      bindVar(state, left.name, right);
      return;
    }
    if (right.kind === "var") {
      bindVar(state, right.name, left);
      return;
    }
    if (left.kind === "con" && right.kind === "con" && left.name === right.name) return;
    if (left.kind === "fun" && right.kind === "fun") {
      unify(state, left.from, right.from);
      unify(state, left.to, right.to);
      return;
    }
    if (left.kind === "pair" && right.kind === "pair") {
      unify(state, left.left, right.left);
      unify(state, left.right, right.right);
      return;
    }
    throw new Error("cannot unify " + formatType(left) + " with " + formatType(right));
  }

  function infer(state, env, expr) {
    if (expr.kind === "int") return TCon("Int");
    if (expr.kind === "bool") return TCon("Bool");

    if (expr.kind === "var") {
      if (!env[expr.name]) throw new Error("unbound variable " + expr.name);
      logEvent(state, "lookup", "lookup " + expr.name, formatScheme(env[expr.name]));
      return instantiate(state, env[expr.name], expr.name);
    }

    if (expr.kind === "lam") {
      var paramType = fresh(state);
      var nextEnv = Object.assign({}, env);
      nextEnv[expr.param] = scheme([], paramType);
      var bodyType = infer(state, nextEnv, expr.body);
      return TFun(applySubst(paramType, state.subst), bodyType);
    }

    if (expr.kind === "app") {
      var fnType = infer(state, env, expr.fn);
      var argType = infer(state, applySubstToEnv(env, state.subst), expr.arg);
      var resultType = fresh(state);
      unify(state, fnType, TFun(argType, resultType));
      return applySubst(resultType, state.subst);
    }

    if (expr.kind === "let") {
      var valueType = infer(state, env, expr.value);
      var envAfter = applySubstToEnv(env, state.subst);
      var valueScheme = state.letPolymorphism
        ? generalize(state, envAfter, valueType, expr.name)
        : scheme([], applySubst(valueType, state.subst));
      if (!state.letPolymorphism) {
        logEvent(state, "generalize", "monomorphic let " + expr.name, formatScheme(valueScheme));
      }
      var bodyEnv = Object.assign({}, envAfter);
      bodyEnv[expr.name] = valueScheme;
      return infer(state, bodyEnv, expr.body);
    }

    if (expr.kind === "pair") {
      var leftType = infer(state, env, expr.left);
      var rightType = infer(state, applySubstToEnv(env, state.subst), expr.right);
      return TPair(applySubst(leftType, state.subst), applySubst(rightType, state.subst));
    }

    throw new Error("unknown expression kind " + expr.kind);
  }

  function canonicalize(type) {
    var names = {};
    var next = 0;
    function rename(name) {
      if (!names[name]) {
        names[name] = String.fromCharCode(97 + next);
        next += 1;
      }
      return names[name];
    }
    function rec(node) {
      if (node.kind === "var") return TVar(rename(node.name));
      if (node.kind === "con") return TCon(node.name);
      if (node.kind === "fun") return TFun(rec(node.from), rec(node.to));
      return TPair(rec(node.left), rec(node.right));
    }
    return rec(type);
  }

  function principalScheme(state, env, type) {
    var cleaned = canonicalize(applySubst(type, state.subst));
    var vars = Object.keys(typeVars(cleaned)).sort();
    var envFree = envVars(env);
    vars = vars.filter(function (name) { return !envFree[name]; });
    return scheme(vars, cleaned);
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var state = newState(params);
    var preset = presetByKey(params.preset);
    var env = baseEnv();
    var resultType = null;
    var finalScheme = null;
    try {
      resultType = infer(state, env, preset.expr);
      resultType = applySubst(resultType, state.subst);
      finalScheme = principalScheme(state, env, resultType);
      if (state.recursiveBindings.length) {
        logEvent(state, "bad", "recursive result", state.recursiveBindings[0]);
      } else {
        logEvent(state, "bind", "final type", formatScheme(finalScheme));
      }
    } catch (err) {
      state.error = err.message;
      logEvent(state, "bad", "type error", err.message);
    }

    return {
      env: env,
      params: params,
      preset: preset,
      resultType: resultType,
      scheme: finalScheme,
      state: state,
      stats: {
        bindings: state.bindings.length,
        generalized: state.generalized.length,
        instantiations: state.instantiations,
        recursive: state.recursiveBindings.length,
        status: state.error ? "type error" : (state.recursiveBindings.length ? "recursive type" : "principal type"),
        substitutions: Object.keys(state.subst).length,
        unifications: state.unifications
      }
    };
  }

  function audit() {
    var failures = [];
    function record(name, condition) {
      if (!condition) failures.push(name);
    }

    var clean = cleanParams({ preset: "nope", letPolymorphism: "bad", occursCheck: "sideways" });
    record("sanitizes parameters", clean.preset === DEFAULTS.preset && clean.letPolymorphism === DEFAULTS.letPolymorphism && clean.occursCheck === DEFAULTS.occursCheck);

    function run(raw) {
      var result = evaluate(raw);
      record("finite events " + JSON.stringify(raw), result.state.events.length > 0 && result.state.events.length <= 80);
      record("finite unifications " + JSON.stringify(raw), Number.isFinite(result.stats.unifications));
      return result;
    }

    var poly = run({ preset: "poly-id", letPolymorphism: "on", occursCheck: "on" });
    record("polymorphic id succeeds", !poly.state.error && formatScheme(poly.scheme) === "(Int, Bool)");
    record("polymorphic id generalizes", poly.state.generalized.length === 1);

    var mono = run({ preset: "poly-id", letPolymorphism: "off", occursCheck: "on" });
    record("monomorphic let rejects id reuse", !!mono.state.error && mono.state.error.indexOf("cannot unify Int with Bool") >= 0);

    var compose = run({ preset: "compose", letPolymorphism: "on", occursCheck: "on" });
    record("compose succeeds", !compose.state.error && formatScheme(compose.scheme) === "forall 'a 'b 'c. ('a -> 'b) -> ('c -> 'a) -> 'c -> 'b");

    var self = run({ preset: "self-app", letPolymorphism: "on", occursCheck: "on" });
    record("occurs check rejects self application", !!self.state.error && self.state.error.indexOf("occurs check") >= 0);

    var selfRecursive = run({ preset: "self-app", letPolymorphism: "on", occursCheck: "off" });
    record("disabled occurs check exposes recursive binding", !selfRecursive.state.error && selfRecursive.stats.recursive > 0);

    var constResult = run({ preset: "const", letPolymorphism: "on", occursCheck: "on" });
    record("const returns Bool", !constResult.state.error && formatScheme(constResult.scheme) === "Bool");

    var applyInc = run({ preset: "apply-inc", letPolymorphism: "on", occursCheck: "on" });
    record("apply inc returns Int", !applyInc.state.error && formatScheme(applyInc.scheme) === "Int");

    var badInc = run({ preset: "bad-inc", letPolymorphism: "on", occursCheck: "on" });
    record("bad primitive call fails", !!badInc.state.error && badInc.state.error.indexOf("Bool") >= 0);

    var rankTwo = run({ preset: "rank-two-shadow", letPolymorphism: "on", occursCheck: "on" });
    record("rank-2 shaped lambda fails in HM", !!rankTwo.state.error && rankTwo.state.error.indexOf("cannot unify Int with Bool") >= 0);

    PRESET_KEYS.forEach(function (preset) {
      BOOLS.forEach(function (letPolymorphism) {
        BOOLS.forEach(function (occursCheck) {
          run({ preset: preset, letPolymorphism: letPolymorphism, occursCheck: occursCheck });
        });
      });
    });

    return { failures: failures, ok: failures.length === 0 };
  }

  function formatScheme(sch) {
    if (!sch) return "n/a";
    if (!sch.vars.length) return formatType(sch.type);
    return "forall " + sch.vars.map(function (name) { return "'" + name; }).join(" ") + ". " + formatType(sch.type);
  }

  function formatType(type, parent, seen) {
    if (!type) return "n/a";
    seen = seen || {};
    if (type.kind === "var") return "'" + type.name;
    if (type.kind === "con") return type.name;
    if (type.kind === "pair") return "(" + formatType(type.left, "pair", seen) + ", " + formatType(type.right, "pair", seen) + ")";
    if (type.kind === "fun") {
      var left = formatType(type.from, "fun-left", seen);
      var right = formatType(type.to, "fun-right", seen);
      var body = left + " -> " + right;
      return parent === "fun-left" || parent === "pair" ? "(" + body + ")" : body;
    }
    return "?";
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.type === "checkbox" ? (input.checked ? "on" : "off") : input.value;
    });
    return raw;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function metric(label, value, accent) {
    return '<div class="hm-type-lab__metric' + (accent ? " is-" + accent : "") + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var statusAccent = result.state.error ? "bad" : (result.state.recursiveBindings.length ? "warn" : "good");
    var resultText = result.state.error
      ? result.state.error
      : (result.state.recursiveBindings.length ? result.state.recursiveBindings[0] : formatScheme(result.scheme));
    var html = [
      metric("status", result.stats.status, statusAccent),
      metric(result.state.recursiveBindings.length ? "recursive equation" : "principal result", resultText, statusAccent),
      metric("unifications", result.stats.unifications),
      metric("substitutions", result.stats.substitutions),
      metric("instantiations", result.stats.instantiations),
      metric("generalized lets", result.stats.generalized),
      metric("recursive bindings", result.stats.recursive, result.stats.recursive ? "warn" : "")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function updateOutputs(root, result) {
    var code = root.querySelector("[data-code]");
    if (code) code.textContent = result.preset.code;
    var letToggle = root.querySelector('[data-param="letPolymorphism"]');
    var occursToggle = root.querySelector('[data-param="occursCheck"]');
    if (letToggle) letToggle.checked = result.params.letPolymorphism === "on";
    if (occursToggle) occursToggle.checked = result.params.occursCheck === "on";
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
    return { ctx: ctx, height: targetHeight, width: width };
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

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillText(subtitle, box.x + 13, box.y + 40);
    }
  }

  function label(ctx, text, x, y, color, align, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function clipText(ctx, text, maxWidth) {
    text = String(text);
    if (ctx.measureText(text).width <= maxWidth) return text;
    var suffix = "...";
    var lo = 0;
    var hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + suffix).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + suffix;
  }

  function eventColor(kind) {
    if (kind === "bad") return COLORS.bad;
    if (kind === "bind") return COLORS.bind;
    if (kind === "fresh") return COLORS.fresh;
    if (kind === "generalize") return COLORS.generalize;
    if (kind === "app") return COLORS.app;
    return COLORS.muted;
  }

  function drawTrace(ctx, result, box) {
    panel(ctx, box, "Inference trace", "Algorithm W as equations and substitutions");
    var events = result.state.events.slice(-12);
    var top = box.y + 58;
    var rowH = Math.max(19, (box.h - 76) / Math.max(1, events.length));
    events.forEach(function (event, index) {
      var y = top + index * rowH;
      var color = eventColor(event.kind);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12;
      roundRect(ctx, box.x + 13, y - 13, box.w - 26, rowH - 4, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, event.title, box.x + 24, y + 1, color, "left", "700 11px system-ui, sans-serif");
      label(ctx, clipText(ctx, event.detail, box.w - 168), box.x + 138, y + 1, COLORS.text, "left", "11px ui-monospace, Menlo, monospace");
    });
  }

  function drawSubstitutions(ctx, result, box) {
    panel(ctx, box, "Substitution ledger", "the current solution for type variables");
    var rows = result.state.bindings.slice(-12);
    if (!rows.length) {
      label(ctx, "no substitutions yet", box.x + 18, box.y + 66, COLORS.muted);
      return;
    }
    var top = box.y + 58;
    var rowH = Math.max(18, (box.h - 78) / rows.length);
    rows.forEach(function (row, index) {
      var y = top + index * rowH;
      label(ctx, "'" + row.name, box.x + 20, y, COLORS.fresh, "left", "700 12px ui-monospace, Menlo, monospace");
      label(ctx, "=", box.x + 68, y, COLORS.muted, "left", "12px ui-monospace, Menlo, monospace");
      label(ctx, clipText(ctx, formatType(applySubst(row.type, result.state.subst)), box.w - 96), box.x + 88, y, COLORS.text, "left", "12px ui-monospace, Menlo, monospace");
    });
  }

  function drawSchemes(ctx, result, box) {
    panel(ctx, box, "Where polymorphism enters", "only let-bound values are generalized");
    var top = box.y + 60;
    var envRows = Object.keys(result.env).map(function (name) {
      return name + " : " + formatScheme(result.env[name]);
    });
    label(ctx, "prelude", box.x + 18, top, COLORS.muted, "left", "700 11px system-ui, sans-serif");
    envRows.forEach(function (row, index) {
      label(ctx, clipText(ctx, row, box.w - 36), box.x + 18, top + 22 + index * 20, COLORS.text, "left", "12px ui-monospace, Menlo, monospace");
    });
    var y = top + 78;
    label(ctx, "let schemes", box.x + 18, y, COLORS.muted, "left", "700 11px system-ui, sans-serif");
    if (!result.state.generalized.length) {
      label(ctx, result.params.letPolymorphism === "on" ? "none in this expression" : "generalization disabled", box.x + 18, y + 24, COLORS.generalize);
    } else {
      result.state.generalized.slice(-5).forEach(function (row, index) {
        var text = row.label + " : " + formatScheme(row.scheme);
        label(ctx, clipText(ctx, text, box.w - 36), box.x + 18, y + 24 + index * 21, COLORS.generalize, "left", "12px ui-monospace, Menlo, monospace");
      });
    }
  }

  function drawComparison(ctx, result, box) {
    panel(ctx, box, "Counterfactual switches", "same program under nearby rules");
    var cases = [
      { label: "HM", params: { preset: result.params.preset, letPolymorphism: "on", occursCheck: "on" } },
      { label: "mono let", params: { preset: result.params.preset, letPolymorphism: "off", occursCheck: "on" } },
      { label: "no occurs", params: { preset: result.params.preset, letPolymorphism: result.params.letPolymorphism, occursCheck: "off" } }
    ];
    var top = box.y + 60;
    var rowH = Math.max(44, (box.h - 82) / cases.length);
    cases.forEach(function (entry, index) {
      var local = evaluate(entry.params);
      var y = top + index * rowH;
      var ok = !local.state.error && !local.state.recursiveBindings.length;
      var warn = !local.state.error && local.state.recursiveBindings.length;
      var color = ok ? COLORS.bind : (warn ? COLORS.generalize : COLORS.bad);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12;
      roundRect(ctx, box.x + 14, y - 22, box.w - 28, rowH - 8, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, entry.label, box.x + 24, y, color, "left", "700 12px system-ui, sans-serif");
      var text = local.state.error
        ? local.state.error
        : (local.state.recursiveBindings.length ? local.state.recursiveBindings[0] : formatScheme(local.scheme));
      label(ctx, clipText(ctx, text, box.w - 126), box.x + 106, y, COLORS.text, "left", "12px ui-monospace, Menlo, monospace");
      label(ctx, local.stats.unifications + " unifies", box.x + 106, y + 18, COLORS.muted, "left", "11px system-ui, sans-serif");
    });
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 1040 : 720);
    var ctx = setup.ctx;
    if (compact) {
      drawTrace(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 252 });
      drawSubstitutions(ctx, result, { x: 8, y: 270, w: setup.width - 16, h: 244 });
      drawSchemes(ctx, result, { x: 8, y: 524, w: setup.width - 16, h: 244 });
      drawComparison(ctx, result, { x: 8, y: 778, w: setup.width - 16, h: 252 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawTrace(ctx, result, { x: 8, y: 8, w: col, h: 350 });
      drawSubstitutions(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 350 });
      drawSchemes(ctx, result, { x: 8, y: 374, w: col, h: 338 });
      drawComparison(ctx, result, { x: col + 20, y: 374, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-hm-type-lab]")).forEach(function (root) {
      if (root.__hmTypeLabReady) return;
      root.__hmTypeLabReady = true;
      var scheduled = null;
      function requestRender() {
        if (scheduled && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(scheduled);
        scheduled = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            scheduled = null;
            render(root);
          })
          : global.setTimeout(function () {
            scheduled = null;
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
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    formatScheme: formatScheme,
    formatType: formatType
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.HMTypeLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
