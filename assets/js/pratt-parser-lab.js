(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    blue: "#2563eb",
    green: "#0f766e",
    violet: "#7c3aed",
    amber: "#b45309",
    red: "#be123c",
    paleBlue: "rgba(37, 99, 235, 0.12)",
    paleGreen: "rgba(15, 118, 110, 0.13)",
    paleAmber: "rgba(180, 83, 9, 0.13)"
  };

  var EXAMPLES = {
    simple: {
      label: "a + b * c",
      source: "a + b * c"
    },
    ladder: {
      label: "a + b * c ^ d",
      source: "a + b * c ^ d"
    },
    grouped: {
      label: "(a + b) * c",
      source: "(a + b) * c"
    },
    leftChain: {
      label: "a - b - c",
      source: "a - b - c"
    },
    powerChain: {
      label: "a ^ b ^ c",
      source: "a ^ b ^ c"
    },
    unaryPostfix: {
      label: "-a ^ b!",
      source: "-a ^ b!"
    }
  };

  var MODES = {
    standard: {
      label: "standard powers",
      plus: 10,
      times: 20,
      power: 30,
      prefix: 29,
      postfix: 40,
      powerAssoc: "right"
    },
    flat: {
      label: "flat + and *",
      plus: 20,
      times: 20,
      power: 30,
      prefix: 29,
      postfix: 40,
      powerAssoc: "right"
    },
    leftPower: {
      label: "left-assoc ^",
      plus: 10,
      times: 20,
      power: 30,
      prefix: 29,
      postfix: 40,
      powerAssoc: "left"
    }
  };

  var DEFAULTS = {
    example: "simple",
    mode: "standard",
    traceStep: null
  };

  var ENV = {
    a: 2,
    b: 3,
    c: 4,
    d: 2,
    x: 5,
    y: 7,
    z: 11
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalize(raw) {
    raw = raw || {};
    var example = EXAMPLES[raw.example] ? raw.example : DEFAULTS.example;
    var mode = MODES[raw.mode] ? raw.mode : DEFAULTS.mode;
    var hasStep = Object.prototype.hasOwnProperty.call(raw, "traceStep") && raw.traceStep !== "";
    return {
      example: example,
      mode: mode,
      traceStep: hasStep ? Math.round(finite(Number(raw.traceStep), 0)) : null
    };
  }

  function token(type, text, start, end) {
    return {
      type: type,
      text: text,
      start: start,
      end: end,
      index: -1
    };
  }

  function tokenize(source) {
    var tokens = [];
    var i = 0;
    while (i < source.length) {
      var ch = source[i];
      if (/\s/.test(ch)) {
        i += 1;
      } else if (/[0-9]/.test(ch)) {
        var n0 = i;
        i += 1;
        while (i < source.length && /[0-9]/.test(source[i])) i += 1;
        if (source[i] === ".") {
          i += 1;
          while (i < source.length && /[0-9]/.test(source[i])) i += 1;
        }
        tokens.push(token("number", source.slice(n0, i), n0, i));
      } else if (/[A-Za-z_]/.test(ch)) {
        var id0 = i;
        i += 1;
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i += 1;
        tokens.push(token("name", source.slice(id0, i), id0, i));
      } else if ("+-*/^!()".indexOf(ch) !== -1) {
        tokens.push(token("op", ch, i, i + 1));
        i += 1;
      } else {
        throw new Error("Unexpected character '" + ch + "' at offset " + i + ".");
      }
    }
    tokens.push(token("end", "(end)", source.length, source.length));
    tokens.forEach(function (t, index) {
      t.index = index;
    });
    return tokens;
  }

  function makeParser(tokens, modeKey) {
    return new Parser(tokens, MODES[modeKey] || MODES.standard);
  }

  function Parser(tokens, powers) {
    this.tokens = tokens;
    this.powers = powers;
    this.pos = 0;
    this.trace = [];
    this.maxDepth = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  };

  Parser.prototype.advance = function (expected) {
    var t = this.peek();
    if (expected && t.text !== expected) {
      throw new Error("Expected '" + expected + "' but saw '" + t.text + "'.");
    }
    this.pos += 1;
    return t;
  };

  Parser.prototype.record = function (kind, depth, fields) {
    fields = fields || {};
    var entry = {
      step: this.trace.length,
      kind: kind,
      depth: depth,
      pos: typeof fields.pos === "number" ? fields.pos : this.peek().index,
      token: fields.token || this.peek().text,
      rbp: fields.rbp,
      lbp: fields.lbp,
      decision: fields.decision || "",
      ast: fields.ast || "",
      message: fields.message || ""
    };
    this.trace.push(entry);
    return entry;
  };

  Parser.prototype.lbp = function (t) {
    return this.rule(t).lbp || 0;
  };

  Parser.prototype.rule = function (t) {
    var powers = this.powers;
    if (!t || t.type === "end") {
      return { lbp: 0 };
    }
    if (t.type === "number") {
      return {
        lbp: 0,
        nud: function (_parser, tok) {
          return {
            kind: "number",
            value: Number(tok.text),
            text: tok.text,
            start: tok.start,
            end: tok.end
          };
        }
      };
    }
    if (t.type === "name") {
      return {
        lbp: 0,
        nud: function (_parser, tok) {
          return {
            kind: "name",
            value: tok.text,
            text: tok.text,
            start: tok.start,
            end: tok.end
          };
        }
      };
    }
    if (t.text === "(") {
      return {
        lbp: 0,
        nud: function (parser, tok, depth) {
          parser.record("group", depth, {
            pos: tok.index,
            token: tok.text,
            message: "parse the parenthesized expression at rbp 0"
          });
          var inside = parser.parseExpression(0, depth + 1, "group");
          parser.advance(")");
          parser.record("close", depth, {
            pos: parser.tokens[parser.pos - 1].index,
            token: ")",
            ast: astToString(inside),
            message: "closing parenthesis returns " + astToString(inside)
          });
          return inside;
        }
      };
    }
    if (t.text === ")") {
      return { lbp: 0 };
    }
    if (t.text === "+" || t.text === "-") {
      return {
        lbp: powers.plus,
        nud: function (parser, tok, depth) {
          parser.record("prefix", depth, {
            pos: tok.index,
            token: tok.text,
            rbp: powers.prefix,
            message: "prefix " + tok.text + " asks for a right operand at rbp " + powers.prefix
          });
          return {
            kind: "prefix",
            op: tok.text,
            right: parser.parseExpression(powers.prefix, depth + 1, "prefix " + tok.text),
            start: tok.start
          };
        },
        led: function (parser, left, tok, depth) {
          var rightBp = powers.plus;
          parser.record("led-call", depth, {
            pos: tok.index,
            token: tok.text,
            rbp: rightBp,
            message: "left-assoc " + tok.text + " parses its right side at rbp " + rightBp
          });
          return {
            kind: "binary",
            op: tok.text,
            left: left,
            right: parser.parseExpression(rightBp, depth + 1, "right of " + tok.text),
            lbp: powers.plus,
            rbp: rightBp
          };
        }
      };
    }
    if (t.text === "*" || t.text === "/") {
      return {
        lbp: powers.times,
        led: function (parser, left, tok, depth) {
          var rightBp = powers.times;
          parser.record("led-call", depth, {
            pos: tok.index,
            token: tok.text,
            rbp: rightBp,
            message: "left-assoc " + tok.text + " parses its right side at rbp " + rightBp
          });
          return {
            kind: "binary",
            op: tok.text,
            left: left,
            right: parser.parseExpression(rightBp, depth + 1, "right of " + tok.text),
            lbp: powers.times,
            rbp: rightBp
          };
        }
      };
    }
    if (t.text === "^") {
      return {
        lbp: powers.power,
        led: function (parser, left, tok, depth) {
          var rightBp = powers.powerAssoc === "right" ? powers.power - 1 : powers.power;
          parser.record("led-call", depth, {
            pos: tok.index,
            token: tok.text,
            rbp: rightBp,
            message: powers.powerAssoc + "-assoc ^ parses its right side at rbp " + rightBp
          });
          return {
            kind: "binary",
            op: tok.text,
            left: left,
            right: parser.parseExpression(rightBp, depth + 1, "right of ^"),
            lbp: powers.power,
            rbp: rightBp
          };
        }
      };
    }
    if (t.text === "!") {
      return {
        lbp: powers.postfix,
        led: function (_parser, left, tok) {
          return {
            kind: "postfix",
            op: tok.text,
            left: left,
            lbp: powers.postfix
          };
        }
      };
    }
    return { lbp: 0 };
  };

  Parser.prototype.parseExpression = function (rbp, depth, reason) {
    depth = depth || 0;
    this.maxDepth = Math.max(this.maxDepth, depth);
    this.record("enter", depth, {
      rbp: rbp,
      token: this.peek().text,
      message: "enter expression(rbp=" + rbp + ")" + (reason ? " for " + reason : "")
    });

    var t = this.advance();
    var prefix = this.rule(t).nud;
    if (!prefix) {
      throw new Error("Token '" + t.text + "' cannot start an expression.");
    }

    this.record("nud", depth, {
      pos: t.index,
      token: t.text,
      message: "run nud(" + t.text + ")"
    });
    var left = prefix(this, t, depth);
    this.record("left", depth, {
      pos: t.index,
      token: t.text,
      ast: astToString(left),
      message: "left is now " + astToString(left)
    });

    while (true) {
      var look = this.peek();
      var lbp = this.lbp(look);
      var take = rbp < lbp;
      this.record("test", depth, {
        pos: look.index,
        token: look.text,
        rbp: rbp,
        lbp: lbp,
        decision: take ? "take" : "stop",
        ast: astToString(left),
        message: "test " + rbp + " < lbp(" + look.text + ")=" + lbp + ": " + (take ? "take" : "stop")
      });
      if (!take) break;
      t = this.advance();
      var infix = this.rule(t).led;
      if (!infix) {
        throw new Error("Token '" + t.text + "' cannot follow an expression.");
      }
      this.record("led", depth, {
        pos: t.index,
        token: t.text,
        message: "run led(" + t.text + ") with left " + astToString(left)
      });
      left = infix(this, left, t, depth);
      this.record("left", depth, {
        pos: t.index,
        token: t.text,
        ast: astToString(left),
        message: "left is now " + astToString(left)
      });
    }

    this.record("return", depth, {
      ast: astToString(left),
      message: "return " + astToString(left)
    });
    return left;
  };

  function astToString(ast) {
    if (!ast) return "";
    if (ast.kind === "name") return ast.value;
    if (ast.kind === "number") return String(ast.value);
    if (ast.kind === "prefix") return "(" + ast.op + " " + astToString(ast.right) + ")";
    if (ast.kind === "postfix") return "(" + ast.op + " " + astToString(ast.left) + ")";
    if (ast.kind === "binary") return "(" + ast.op + " " + astToString(ast.left) + " " + astToString(ast.right) + ")";
    if (ast.kind === "error") return "(error)";
    return "?";
  }

  function astNodeCount(ast) {
    if (!ast) return 0;
    if (ast.kind === "name" || ast.kind === "number") return 1;
    if (ast.kind === "prefix") return 1 + astNodeCount(ast.right);
    if (ast.kind === "postfix") return 1 + astNodeCount(ast.left);
    if (ast.kind === "binary") return 1 + astNodeCount(ast.left) + astNodeCount(ast.right);
    return 1;
  }

  function astHeight(ast) {
    if (!ast) return 0;
    if (ast.kind === "name" || ast.kind === "number") return 1;
    if (ast.kind === "prefix") return 1 + astHeight(ast.right);
    if (ast.kind === "postfix") return 1 + astHeight(ast.left);
    if (ast.kind === "binary") return 1 + Math.max(astHeight(ast.left), astHeight(ast.right));
    return 1;
  }

  function astChildren(ast) {
    if (!ast) return [];
    if (ast.kind === "prefix") return [ast.right];
    if (ast.kind === "postfix") return [ast.left];
    if (ast.kind === "binary") return [ast.left, ast.right];
    return [];
  }

  function labelAst(ast) {
    if (!ast) return "?";
    if (ast.kind === "name") return ast.value;
    if (ast.kind === "number") return ast.text;
    if (ast.kind === "prefix") return "pre " + ast.op;
    if (ast.kind === "postfix") return "post " + ast.op;
    if (ast.kind === "binary") return ast.op;
    return "?";
  }

  function factorial(n) {
    var rounded = Math.round(n);
    if (rounded < 0 || rounded > 8 || Math.abs(rounded - n) > 1e-9) return NaN;
    var out = 1;
    for (var i = 2; i <= rounded; i += 1) out *= i;
    return out;
  }

  function evalAst(ast, env) {
    env = env || ENV;
    if (!ast) return NaN;
    if (ast.kind === "number") return ast.value;
    if (ast.kind === "name") return Object.prototype.hasOwnProperty.call(env, ast.value) ? env[ast.value] : NaN;
    if (ast.kind === "prefix") {
      var r = evalAst(ast.right, env);
      return ast.op === "-" ? -r : r;
    }
    if (ast.kind === "postfix") {
      return factorial(evalAst(ast.left, env));
    }
    if (ast.kind === "binary") {
      var left = evalAst(ast.left, env);
      var right = evalAst(ast.right, env);
      if (ast.op === "+") return left + right;
      if (ast.op === "-") return left - right;
      if (ast.op === "*") return left * right;
      if (ast.op === "/") return left / right;
      if (ast.op === "^") return Math.pow(left, right);
    }
    return NaN;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "NaN";
    if (Math.abs(value) >= 1000000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
      return value.toExponential(2);
    }
    return Number(value.toFixed(digits == null ? 2 : digits)).toString();
  }

  function precedenceRows(modeKey) {
    var p = MODES[modeKey] || MODES.standard;
    return [
      { syntax: "postfix !", lbp: p.postfix, rbp: "-", note: "left only" },
      { syntax: "prefix + -", lbp: "nud", rbp: p.prefix, note: "right operand" },
      { syntax: "^", lbp: p.power, rbp: p.powerAssoc === "right" ? p.power - 1 : p.power, note: p.powerAssoc + " assoc" },
      { syntax: "* /", lbp: p.times, rbp: p.times, note: "left assoc" },
      { syntax: "+ -", lbp: p.plus, rbp: p.plus, note: "left assoc" },
      { syntax: ") end", lbp: 0, rbp: "-", note: "stop" }
    ];
  }

  function auditResult(result, expected) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, passed: !!ok });
    }
    check("token stream ends with sentinel", result.tokens.length > 0 && result.tokens[result.tokens.length - 1].type === "end");
    check("parse consumed exactly the expression", !result.errors.length && result.parserPos === result.tokens.length - 1);
    check("AST string is non-empty", typeof result.astString === "string" && result.astString.length > 0);
    check("trace records nud and binding tests", result.trace.some(function (r) { return r.kind === "nud"; }) &&
      result.trace.some(function (r) { return r.kind === "test"; }));
    check("trace has a stop decision", result.trace.some(function (r) { return r.kind === "test" && r.decision === "stop"; }));
    check("node and depth counts are finite", Number.isFinite(result.stats.nodes) && Number.isFinite(result.stats.height));
    check("evaluation is finite for the teaching environment", Number.isFinite(result.value));
    if (expected && expected.ast) check("expected AST: " + expected.ast, result.astString === expected.ast);
    if (expected && Object.prototype.hasOwnProperty.call(expected, "value")) {
      check("expected value: " + expected.value, Math.abs(result.value - expected.value) < 1e-9);
    }
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var source = EXAMPLES[params.example].source;
    var tokens = [];
    var parser = null;
    var ast = null;
    var errors = [];

    try {
      tokens = tokenize(source);
      parser = makeParser(tokens, params.mode);
      ast = parser.parseExpression(0, 0, "top level");
      if (parser.peek().type !== "end") {
        throw new Error("Unconsumed token '" + parser.peek().text + "'.");
      }
    } catch (error) {
      errors.push(error.message);
      if (!tokens.length) {
        try {
          tokens = tokenize(source);
        } catch (_ignored) {
          tokens = [token("end", "(end)", source.length, source.length)];
        }
      }
      ast = { kind: "error" };
      parser = parser || { trace: [], maxDepth: 0, pos: 0 };
    }

    var astString = astToString(ast);
    var trace = parser.trace || [];
    var maxStep = Math.max(0, trace.length - 1);
    params.traceStep = params.traceStep == null ? maxStep : clamp(params.traceStep, 0, maxStep);
    var value = evalAst(ast, ENV);
    var result = {
      params: params,
      source: source,
      exampleLabel: EXAMPLES[params.example].label,
      modeLabel: MODES[params.mode].label,
      powers: MODES[params.mode],
      precedence: precedenceRows(params.mode),
      tokens: tokens,
      ast: ast,
      astString: astString,
      value: value,
      trace: trace,
      selectedTrace: trace[params.traceStep] || null,
      parserPos: parser.pos,
      errors: errors,
      stats: {
        nodes: astNodeCount(ast),
        height: astHeight(ast),
        maxDepth: parser.maxDepth || 0,
        traceSteps: trace.length
      }
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditGrid() {
    var cases = [];
    var criticalByName = {};

    function recordCase(row, checks) {
      checks.forEach(function (check) {
        if (!criticalByName[check.name]) {
          criticalByName[check.name] = {
            check: check.name,
            failedCases: [],
            passed: 0,
            total: 0
          };
        }
        criticalByName[check.name].total += 1;
        if (check.passed) criticalByName[check.name].passed += 1;
        else criticalByName[check.name].failedCases.push(row.caseId);
      });
      row.passedChecks = checks.filter(function (check) { return check.passed; }).length;
      row.totalChecks = checks.length;
      row.failedChecks = checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; });
      cases.push(row);
    }

    function add(name, raw, expected) {
      var result = evaluate(raw);
      var audit = auditResult(result, expected);
      recordCase({
        caseId: cases.length + 1,
        name: name,
        source: result.source,
        example: result.params.example,
        mode: result.params.mode,
        ast: result.astString,
        nodes: result.stats.nodes,
        traceSteps: result.stats.traceSteps,
        value: result.value,
        passed: audit.passed
      }, audit.checks);
    }

    Object.keys(MODES).forEach(function (mode) {
      Object.keys(EXAMPLES).forEach(function (example) {
        add(mode + " / " + example, { mode: mode, example: example });
      });
    });

    add("standard multiplication binds tighter", { mode: "standard", example: "simple" }, {
      ast: "(+ a (* b c))",
      value: 14
    });
    add("flat table changes the tree", { mode: "flat", example: "simple" }, {
      ast: "(* (+ a b) c)",
      value: 20
    });
    add("parentheses override table", { mode: "standard", example: "grouped" }, {
      ast: "(* (+ a b) c)",
      value: 20
    });
    add("minus chains associate left", { mode: "standard", example: "leftChain" }, {
      ast: "(- (- a b) c)",
      value: -5
    });
    add("power chains associate right", { mode: "standard", example: "powerChain" }, {
      ast: "(^ a (^ b c))"
    });
    add("left power mode changes only caret", { mode: "leftPower", example: "powerChain" }, {
      ast: "(^ (^ a b) c)",
      value: 4096
    });
    add("prefix and postfix compose through rbp", { mode: "standard", example: "unaryPostfix" }, {
      ast: "(- (^ a (! b)))",
      value: -64
    });

    function summarize(groupBy) {
      var groups = {};
      cases.forEach(function (row) {
        var key = row[groupBy];
        if (!groups[key]) {
          groups[key] = {
            cases: 0,
            maxTraceSteps: 0,
            nodes: 0,
            passed: 0,
            passedChecks: 0,
            totalChecks: 0
          };
          groups[key][groupBy] = key;
        }
        groups[key].cases += 1;
        groups[key].maxTraceSteps = Math.max(groups[key].maxTraceSteps, row.traceSteps);
        groups[key].nodes += row.nodes;
        groups[key].passedChecks += row.passedChecks;
        groups[key].totalChecks += row.totalChecks;
        if (row.passed) groups[key].passed += 1;
      });
      return Object.keys(groups).sort().map(function (key) {
        return groups[key];
      });
    }

    var criticalChecks = Object.keys(criticalByName).sort().map(function (key) {
      var row = criticalByName[key];
      row.ok = row.passed === row.total;
      return row;
    });
    var passed = cases.filter(function (row) { return row.passed; }).length;
    var passedChecks = cases.reduce(function (sum, row) { return sum + row.passedChecks; }, 0);
    var totalChecks = cases.reduce(function (sum, row) { return sum + row.totalChecks; }, 0);
    var errors = cases.reduce(function (out, row) {
      row.failedChecks.forEach(function (check) {
        out.push("case " + row.caseId + ": " + check);
      });
      return out;
    }, []);

    var byMode = {};
    cases.forEach(function (row) {
      if (!byMode[row.mode]) byMode[row.mode] = { mode: row.mode, cases: 0, maxTraceSteps: 0, nodes: 0, passed: 0, passedChecks: 0, totalChecks: 0 };
      byMode[row.mode].cases += 1;
      byMode[row.mode].maxTraceSteps = Math.max(byMode[row.mode].maxTraceSteps, row.traceSteps);
      byMode[row.mode].nodes += row.nodes;
      byMode[row.mode].passedChecks += row.passedChecks;
      byMode[row.mode].totalChecks += row.totalChecks;
      if (row.passed) byMode[row.mode].passed += 1;
    });
    return {
      byMode: Object.keys(MODES).map(function (mode) { return byMode[mode]; }),
      byExample: summarize("example"),
      cases: cases,
      checked: totalChecks,
      criticalChecks: criticalChecks,
      errors: errors,
      ok: errors.length === 0,
      passed: passed,
      passedChecks: passedChecks,
      total: cases.length,
      totalChecks: totalChecks
    };
  }

  function readParams(root) {
    var raw = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function metric(label, value, cls) {
    return '<div class="pratt-lab__metric ' + (cls || "") + '">' +
      '<span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setOutputs(root, result) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "example") output.textContent = result.exampleLabel;
      else if (key === "mode") output.textContent = result.modeLabel;
      else if (key === "traceStep") output.textContent = result.params.traceStep + " / " + Math.max(0, result.trace.length - 1);
    });
    var trace = root.querySelector('[data-param="traceStep"]');
    if (trace) {
      trace.max = String(Math.max(0, result.trace.length - 1));
      trace.value = String(result.params.traceStep);
    }
  }

  function render(root) {
    var result = evaluate(readParams(root));
    setOutputs(root, result);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("AST", result.astString),
        metric("value", formatNumber(result.value, 2)),
        metric("nodes", String(result.stats.nodes)),
        metric("trace", result.stats.traceSteps + " steps"),
        metric("audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "pratt-lab__metric--good" : "pratt-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      var selected = result.selectedTrace;
      note.textContent = selected ? selected.message : "The parser trace is empty.";
    }
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
    root.__prattParserResult = result;
    return result;
  }

  function init(root) {
    if (!root || root.__prattParserReady) return;
    root.__prattParserReady = true;
    var timer = null;
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { render(root); }, 35);
      });
      input.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function prepareCanvas(canvas) {
    var dpr = global.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || canvas.width || 940;
    var cssHeight = canvas.clientHeight || Math.max(620, Math.round(cssWidth * 0.72));
    var pixelWidth = Math.round(cssWidth * dpr);
    var pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    var ctx = canvas.getContext("2d");
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else if (ctx.scale) ctx.scale(dpr, dpr);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    drawHeader(ctx, result, 22, 22, width - 44, 82);
    var gap = 16;
    var top = 122;
    var midH = Math.max(240, Math.round((height - top - 110) * 0.48));
    var leftW = Math.round((width - 44 - gap) * 0.53);
    var rightW = width - 44 - gap - leftW;
    drawAst(ctx, result.ast, { x: 22, y: top, w: leftW, h: midH });
    drawPowers(ctx, result, { x: 22 + leftW + gap, y: top, w: rightW, h: midH });
    drawTrace(ctx, result, { x: 22, y: top + midH + gap, w: width - 44, h: height - top - midH - gap - 22 });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 400) + " " + size + "px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function drawText(ctx, text, x, y, size, color, maxWidth, align, weight) {
    setFont(ctx, size, weight);
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    if (maxWidth && ctx.measureText) {
      var fitted = size;
      while (fitted > 9 && ctx.measureText(text).width > maxWidth) {
        fitted -= 1;
        setFont(ctx, fitted, weight);
      }
    }
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, box.x + 14, box.y + 12, 14, COLORS.text, box.w - 28, "left", 700);
    if (subtitle) drawText(ctx, subtitle, box.x + 14, box.y + 33, 11, COLORS.muted, box.w - 28);
  }

  function drawHeader(ctx, result, x, y, w, h) {
    panel(ctx, { x: x, y: y, w: w, h: h }, "token stream", "the selected trace step highlights the token being inspected");
    var tokens = result.tokens;
    var step = result.selectedTrace;
    var active = step ? step.pos : -1;
    var usable = w - 28;
    var boxW = Math.min(86, Math.max(54, Math.floor((usable - (tokens.length - 1) * 7) / tokens.length)));
    var tx = x + 14;
    var ty = y + 52;
    tokens.forEach(function (tok) {
      ctx.fillStyle = tok.index === active ? COLORS.paleGreen : COLORS.white;
      ctx.strokeStyle = tok.index === active ? COLORS.green : COLORS.rule;
      ctx.lineWidth = tok.index === active ? 2 : 1;
      ctx.beginPath();
      ctx.rect(tx, ty, boxW, 22);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, tok.text, tx + boxW / 2, ty + 4, 11, tok.type === "end" ? COLORS.muted : COLORS.text, boxW - 8, "center", tok.index === active ? 700 : 500);
      tx += boxW + 7;
    });
    drawText(ctx, result.source + "  ->  " + result.astString, x + Math.min(w - 330, 330), y + 15, 12, COLORS.muted, Math.max(240, w - 360));
  }

  function layoutAst(ast, box) {
    var leaf = 0;
    var maxDepth = 0;
    function assign(node, depth) {
      maxDepth = Math.max(maxDepth, depth);
      var children = astChildren(node);
      var item = { node: node, depth: depth, children: [], leaf: 0, x: 0, y: 0 };
      if (!children.length) {
        item.leaf = leaf;
        leaf += 1;
      } else {
        item.children = children.map(function (child) { return assign(child, depth + 1); });
        item.leaf = item.children.reduce(function (sum, child) { return sum + child.leaf; }, 0) / item.children.length;
      }
      return item;
    }
    var root = assign(ast, 0);
    var leaves = Math.max(1, leaf);
    var x0 = box.x + 28;
    var y0 = box.y + 70;
    var innerW = box.w - 56;
    var innerH = box.h - 92;
    function position(item) {
      item.x = x0 + (leaves === 1 ? innerW / 2 : item.leaf * innerW / (leaves - 1));
      item.y = y0 + (maxDepth === 0 ? 0 : item.depth * innerH / maxDepth);
      item.children.forEach(position);
    }
    position(root);
    return root;
  }

  function drawAst(ctx, ast, box) {
    panel(ctx, box, "abstract syntax tree", "prefix, infix, and postfix tokens all become ordinary nodes");
    var root = layoutAst(ast, box);
    function edges(item) {
      item.children.forEach(function (child) {
        ctx.strokeStyle = COLORS.rule;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(item.x, item.y + 16);
        ctx.lineTo(child.x, child.y - 16);
        ctx.stroke();
        edges(child);
      });
    }
    function nodes(item) {
      var isOp = item.node.kind === "binary" || item.node.kind === "prefix" || item.node.kind === "postfix";
      ctx.fillStyle = isOp ? COLORS.paleBlue : COLORS.white;
      ctx.strokeStyle = isOp ? COLORS.blue : COLORS.rule;
      ctx.lineWidth = isOp ? 2 : 1;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawText(ctx, labelAst(item.node), item.x, item.y - 7, 11, COLORS.text, 34, "center", 700);
      item.children.forEach(nodes);
    }
    edges(root);
    nodes(root);
  }

  function drawPowers(ctx, result, box) {
    panel(ctx, box, "binding powers", "the loop continues exactly while rbp < next lbp");
    var rows = result.precedence;
    var x = box.x + 16;
    var y = box.y + 58;
    drawText(ctx, "syntax", x, y, 11, COLORS.muted, 70, "left", 700);
    drawText(ctx, "lbp", x + 94, y, 11, COLORS.muted, 40, "left", 700);
    drawText(ctx, "right rbp", x + 146, y, 11, COLORS.muted, 70, "left", 700);
    drawText(ctx, "meaning", x + 226, y, 11, COLORS.muted, box.w - 250, "left", 700);
    rows.forEach(function (row, i) {
      var yy = y + 24 + i * 28;
      ctx.fillStyle = i % 2 ? COLORS.white : "rgba(255,255,255,0.55)";
      ctx.fillRect(x - 6, yy - 5, box.w - 28, 24);
      drawText(ctx, row.syntax, x, yy, 12, COLORS.text, 80, "left", 600);
      drawText(ctx, String(row.lbp), x + 94, yy, 12, COLORS.blue, 42, "left", 700);
      drawText(ctx, String(row.rbp), x + 146, yy, 12, COLORS.green, 64, "left", 700);
      drawText(ctx, row.note, x + 226, yy, 12, COLORS.muted, box.w - 250);
    });
    var selected = result.selectedTrace;
    var text = selected && selected.kind === "test"
      ? selected.message
      : "selected step: " + (selected ? selected.message : "none");
    ctx.fillStyle = COLORS.paleAmber;
    ctx.fillRect(x - 6, box.y + box.h - 52, box.w - 28, 32);
    drawText(ctx, text, x, box.y + box.h - 43, 12, COLORS.amber, box.w - 36, "left", 700);
  }

  function drawTrace(ctx, result, box) {
    panel(ctx, box, "trace ledger", "nud starts an expression; led extends the expression on the left");
    var rows = result.trace;
    var selected = result.params.traceStep;
    var maxRows = Math.max(5, Math.floor((box.h - 62) / 24));
    var start = clamp(selected - Math.floor(maxRows / 2), 0, Math.max(0, rows.length - maxRows));
    var x = box.x + 14;
    var y = box.y + 52;
    for (var i = 0; i < maxRows && start + i < rows.length; i += 1) {
      var row = rows[start + i];
      var yy = y + i * 24;
      var active = row.step === selected;
      ctx.fillStyle = active ? COLORS.paleGreen : (i % 2 ? COLORS.white : "rgba(255,255,255,0.55)");
      ctx.fillRect(x - 6, yy - 5, box.w - 28, 22);
      drawText(ctx, String(row.step), x, yy, 11, active ? COLORS.green : COLORS.muted, 30, "left", 700);
      drawText(ctx, row.kind, x + 38, yy, 11, active ? COLORS.green : COLORS.blue, 74, "left", 700);
      drawText(ctx, Array(row.depth + 1).join("  ") + row.message, x + 118, yy, 12, COLORS.text, box.w - 250);
      if (row.ast) drawText(ctx, row.ast, box.x + box.w - 122, yy, 11, COLORS.muted, 108);
    }
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", function () {
        Array.prototype.slice.call(global.document.querySelectorAll("[data-pratt-parser-lab]")).forEach(init);
      });
    } else {
      Array.prototype.slice.call(global.document.querySelectorAll("[data-pratt-parser-lab]")).forEach(init);
    }
  }

  var api = {
    tokenize: tokenize,
    parse: function (source, mode) {
      var tokens = tokenize(source);
      var parser = makeParser(tokens, mode || "standard");
      var ast = parser.parseExpression(0, 0, "top level");
      if (parser.peek().type !== "end") throw new Error("Unconsumed token '" + parser.peek().text + "'.");
      return {
        ast: ast,
        astString: astToString(ast),
        trace: parser.trace,
        tokens: tokens,
        value: evalAst(ast, ENV)
      };
    },
    evaluate: evaluate,
    auditGrid: auditGrid,
    astToString: astToString,
    evalAst: evalAst,
    precedenceRows: precedenceRows,
    examples: EXAMPLES,
    modes: MODES,
    render: render
  };

  global.PrattParserLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
