(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    grid: "#eef2f5",
    success: "#0f766e",
    hijack: "#b45309",
    breach: "#be123c",
    blocked: "#2563eb",
    review: "#7c3aed",
    fail: "#64748b",
    untrusted: "#f59e0b",
    trusted: "#14b8a6"
  };

  var POLICIES = [
    {
      key: "concat",
      name: "naive concat",
      short: "concat",
      boundary: 0.02,
      secretMin: 0.00,
      toolGate: 0.00,
      review: 0.00,
      utilityCost: 0.00,
      color: "#be123c"
    },
    {
      key: "delimited",
      name: "delimited text",
      short: "delimit",
      boundary: 0.32,
      secretMin: 0.05,
      toolGate: 0.10,
      review: 0.02,
      utilityCost: 0.015,
      color: "#b45309"
    },
    {
      key: "structured",
      name: "structured data",
      short: "struct",
      boundary: 0.72,
      secretMin: 0.35,
      toolGate: 0.42,
      review: 0.05,
      utilityCost: 0.035,
      color: "#0f766e"
    },
    {
      key: "least",
      name: "least privilege",
      short: "least",
      boundary: 0.76,
      secretMin: 0.72,
      toolGate: 0.86,
      review: 0.28,
      utilityCost: 0.05,
      color: "#2563eb"
    }
  ];
  var AUDIT_CACHE = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function percent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function number(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="prompt-injection-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function readParams(lab) {
    function read(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return Number.isFinite(value) ? value : fallback;
    }
    return {
      seed: Math.round(read("seed", 17)),
      trials: Math.round(read("trials", 360)),
      poisoned: clamp(read("poisoned", 22), 0, 80) / 100,
      retrieval: clamp(read("retrieval", 55), 0, 100) / 100,
      attack: clamp(read("attack", 70), 0, 100) / 100,
      confusion: clamp(read("confusion", 45), 0, 100) / 100,
      toolPower: clamp(read("toolPower", 70), 0, 100) / 100,
      secretReach: clamp(read("secretReach", 55), 0, 100) / 100,
      approval: clamp(read("approval", 60), 0, 100) / 100
    };
  }

  function trialContext(params, trial) {
    var random = rng(params.seed * 1000003 + trial * 9176 + 11);
    return {
      attackRetrieved: random() < params.poisoned * (0.20 + 0.80 * params.retrieval),
      hasRelevant: random() > 0.10 + 0.24 * params.retrieval,
      secretVisible: random() < params.secretReach,
      taskNeedsAction: random() < (0.18 + 0.38 * params.toolPower)
    };
  }

  function simulateTrial(params, policy, trial, context) {
    var env = context || trialContext(params, trial);
    var random = rng(params.seed * 1000003 + trial * 9176 + Math.round(policy.boundary * 1000) * 131 + 29);

    var attackLogit =
      -1.20 +
      3.35 * params.attack +
      2.20 * params.confusion +
      1.10 * params.retrieval -
      4.25 * policy.boundary;
    var followsUntrusted = env.attackRetrieved && random() < sigmoid(attackLogit);

    var highRiskAsk = followsUntrusted && random() < (0.25 + 0.75 * params.toolPower);
    var gateStrength = policy.toolGate * (0.45 + 0.55 * params.approval);
    var blocked = highRiskAsk && random() < gateStrength;
    var compromised = followsUntrusted && !blocked;

    var leaksSecret = compromised && env.secretVisible && random() < params.secretReach * (1 - policy.secretMin);
    var abusesTool = compromised && highRiskAsk && random() < params.toolPower * (1 - 0.65 * policy.toolGate);
    var breach = leaksSecret || abusesTool;

    var review = false;
    if (!followsUntrusted && env.taskNeedsAction) {
      review = random() < policy.review * params.approval;
    } else if (blocked) {
      review = true;
    }

    var utilityProb = 0.91 - 0.24 * params.retrieval - policy.utilityCost;
    if (!env.hasRelevant) utilityProb -= 0.34;
    if (review) utilityProb -= 0.06;
    if (compromised) utilityProb = 0.06 + (env.hasRelevant ? 0.08 : 0);
    if (blocked) utilityProb = 0.47 + (env.hasRelevant ? 0.12 : 0);

    var taskSuccess = !breach && random() < clamp(utilityProb, 0.02, 0.98);
    var status = breach ? "breach" : blocked ? "blocked" : compromised ? "hijack" : taskSuccess ? "success" : "fail";

    return {
      attackRetrieved: env.attackRetrieved,
      blocked: blocked,
      breach: breach,
      compromised: compromised,
      followsUntrusted: followsUntrusted,
      hasRelevant: env.hasRelevant,
      leaksSecret: leaksSecret,
      review: review,
      status: status,
      taskNeedsAction: env.taskNeedsAction,
      taskSuccess: taskSuccess,
      toolAbuse: abusesTool
    };
  }

  function summarize(rows) {
    function mean(key) {
      return rows.reduce(function (sum, row) { return sum + (row[key] ? 1 : 0); }, 0) / rows.length;
    }
    return {
      attackRetrieved: mean("attackRetrieved"),
      blocked: mean("blocked"),
      breach: mean("breach"),
      compromised: mean("compromised"),
      followsUntrusted: mean("followsUntrusted"),
      review: mean("review"),
      taskSuccess: mean("taskSuccess"),
      toolAbuse: mean("toolAbuse")
    };
  }

  function defaultParams() {
    return {
      seed: 17,
      trials: 360,
      poisoned: 0.22,
      retrieval: 0.55,
      attack: 0.70,
      confusion: 0.45,
      toolPower: 0.70,
      secretReach: 0.55,
      approval: 0.60
    };
  }

  function simulatePolicy(params, policy) {
    var rows = [];
    for (var i = 0; i < params.trials; i += 1) {
      rows.push(simulateTrial(params, policy, i, trialContext(params, i)));
    }
    return {
      policy: policy,
      rows: rows,
      summary: summarize(rows)
    };
  }

  function sweepAttack(params) {
    var values = [];
    for (var i = 0; i <= 10; i += 1) values.push(i / 10);
    return POLICIES.map(function (policy) {
      return {
        policy: policy,
        points: values.map(function (attack) {
          var p = Object.assign({}, params, { attack: attack, trials: 180 });
          var run = simulatePolicy(p, policy).summary;
          return {
            attack: attack,
            breach: run.breach,
            compromised: run.compromised
          };
        })
      };
    });
  }

  function simulate(params) {
    var policies = POLICIES.map(function (policy) {
      return simulatePolicy(params, policy);
    });
    return {
      audit: cachedAudit(),
      params: params,
      policies: policies,
      sweep: sweepAttack(params)
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function runAudit() {
    var passed = 0;
    var checked = 0;
    var failures = [];
    var defaults = defaultParams();
    var defaultResult = POLICIES.map(function (policy) {
      return simulatePolicy(defaults, policy);
    });
    var concat = defaultResult[0].summary;
    var delimited = defaultResult[1].summary;
    var structured = defaultResult[2].summary;
    var least = defaultResult[3].summary;
    var defaultSweep = sweepAttack(defaults);
    var gridCases = 0;
    var gridValid = 0;

    function check(name, condition, details) {
      checked += 1;
      if (condition) {
        passed += 1;
      } else {
        failures.push({ name: name, details: details || null });
      }
    }

    function isProbability(value) {
      return Number.isFinite(value) && value >= 0 && value <= 1;
    }

    function summaryIsBounded(summary) {
      return Object.keys(summary).every(function (key) {
        return isProbability(summary[key]);
      });
    }

    function rowIsConsistent(row) {
      var statuses = ["breach", "blocked", "hijack", "success", "fail"];
      return statuses.indexOf(row.status) >= 0 &&
        row.breach === (row.leaksSecret || row.toolAbuse) &&
        (!row.breach || row.compromised) &&
        (!row.blocked || row.followsUntrusted) &&
        (!row.compromised || row.followsUntrusted) &&
        (!row.taskSuccess || !row.breach) &&
        (row.attackRetrieved || (!row.followsUntrusted && !row.compromised && !row.breach && !row.blocked));
    }

    function seriesIsNondecreasing(points, key) {
      for (var i = 1; i < points.length; i += 1) {
        if (points[i][key] + 1e-12 < points[i - 1][key]) return false;
      }
      return true;
    }

    function countRows(policy, params) {
      return simulatePolicy(params, policy).rows.reduce(function (acc, row) {
        acc.breach += row.breach ? 1 : 0;
        acc.blocked += row.blocked ? 1 : 0;
        acc.compromised += row.compromised ? 1 : 0;
        return acc;
      }, { breach: 0, blocked: 0, compromised: 0 });
    }

    check("policy order is fixed", POLICIES.map(function (p) { return p.key; }).join("|") === "concat|delimited|structured|least");
    check("policy controls increase authority separation", POLICIES[0].boundary < POLICIES[1].boundary &&
      POLICIES[1].boundary < POLICIES[2].boundary &&
      POLICIES[2].boundary <= POLICIES[3].boundary &&
      POLICIES[3].secretMin > POLICIES[2].secretMin &&
      POLICIES[3].toolGate > POLICIES[2].toolGate);
    check("trial context is deterministic", JSON.stringify(trialContext(defaults, 42)) === JSON.stringify(trialContext(defaults, 42)));
    check("shared sampled contexts match across policies", defaultResult.every(function (entry) {
      return entry.rows.every(function (row, i) {
        var first = defaultResult[0].rows[i];
        return row.attackRetrieved === first.attackRetrieved &&
          row.hasRelevant === first.hasRelevant &&
          row.taskNeedsAction === first.taskNeedsAction;
      });
    }));
    check("default summaries are bounded probabilities", defaultResult.every(function (entry) {
      return summaryIsBounded(entry.summary);
    }));
    check("default rows obey status invariants", defaultResult.every(function (entry) {
      return entry.rows.every(rowIsConsistent);
    }));
    check("default sampled facts match the post", concat.attackRetrieved === 0.125 &&
      Math.abs(concat.breach - 0.08055555555555556) < 1e-12 &&
      least.breach === 0 &&
      least.blocked > 0);
    check("delimiter does not create a hard boundary", delimited.compromised > structured.compromised &&
      delimited.breach > structured.breach, { delimited: delimited, structured: structured });
    check("structured channel lowers compromise", structured.compromised < concat.compromised &&
      structured.followsUntrusted < concat.followsUntrusted, { concat: concat, structured: structured });
    check("least privilege lowers breach severity", least.breach <= structured.breach &&
      least.breach <= concat.breach &&
      least.toolAbuse <= structured.toolAbuse, { concat: concat, structured: structured, least: least });
    check("least privilege trades some review for gates", least.review > structured.review &&
      least.blocked > structured.blocked, { structured: structured, least: least });
    check("zero poison removes untrusted following", POLICIES.every(function (policy) {
      var summary = simulatePolicy(Object.assign({}, defaults, { poisoned: 0 }), policy).summary;
      return summary.attackRetrieved === 0 && summary.followsUntrusted === 0 && summary.compromised === 0 && summary.breach === 0;
    }));
    check("no tools and no secrets remove breaches", POLICIES.every(function (policy) {
      return simulatePolicy(Object.assign({}, defaults, { toolPower: 0, secretReach: 0 }), policy).summary.breach === 0;
    }));
    check("secret minimization reduces leaks under matched randomness", (function () {
      var weak = Object.assign({}, POLICIES[2], { key: "weak-secret", secretMin: 0 });
      var strong = Object.assign({}, POLICIES[2], { key: "strong-secret", secretMin: 1 });
      return countRows(strong, defaults).breach <= countRows(weak, defaults).breach;
    })());
    check("tool gates increase blocked actions under matched randomness", (function () {
      var open = Object.assign({}, POLICIES[2], { key: "open-tool", toolGate: 0 });
      var gated = Object.assign({}, POLICIES[2], { key: "gated-tool", toolGate: 1 });
      return countRows(gated, defaults).blocked >= countRows(open, defaults).blocked &&
        countRows(gated, defaults).breach <= countRows(open, defaults).breach;
    })());
    check("higher attack strength raises breach or compromise in sweeps", defaultSweep.every(function (series) {
      return seriesIsNondecreasing(series.points, "breach") &&
        seriesIsNondecreasing(series.points, "compromised");
    }));
    check("sweep keeps least-privilege breach below concat", defaultSweep[3].points.every(function (point, i) {
      return point.breach <= defaultSweep[0].points[i].breach + 1e-12;
    }));
    check("approval gates lower least-privilege breach", (function () {
      var low = simulatePolicy(Object.assign({}, defaults, { approval: 0 }), POLICIES[3]).summary;
      var high = simulatePolicy(Object.assign({}, defaults, { approval: 1 }), POLICIES[3]).summary;
      return high.breach <= low.breach && high.blocked >= low.blocked;
    })());
    check("sample size controls row counts", [120, 360, 900].every(function (trials) {
      return simulatePolicy(Object.assign({}, defaults, { trials: trials }), POLICIES[0]).rows.length === trials;
    }));

    [3, 17, 41].forEach(function (seed) {
      [0.05, 0.25, 0.55].forEach(function (poisoned) {
        [0.20, 0.70].forEach(function (retrieval) {
          [0.25, 0.80].forEach(function (attack) {
            [0.20, 0.75].forEach(function (toolPower) {
              var params = {
                seed: seed,
                trials: 90,
                poisoned: poisoned,
                retrieval: retrieval,
                attack: attack,
                confusion: 0.45,
                toolPower: toolPower,
                secretReach: 0.55,
                approval: 0.60
              };
              var result = POLICIES.map(function (policy) { return simulatePolicy(params, policy).summary; });
              gridCases += 1;
              var finite = result.every(summaryIsBounded);
              var gatedNoWorse = result[3].breach <= result[0].breach + 1e-9;
              var structuredNoWorse = result[2].compromised <= result[0].compromised + 0.10;
              if (finite && gatedNoWorse && structuredNoWorse) gridValid += 1;
            });
          });
        });
      });
    });
    check("72-case policy grid is numerically valid", gridValid === 72 && gridCases === 72, {
      valid: gridValid,
      cases: gridCases
    });

    return {
      ok: passed,
      cases: checked,
      passed: passed,
      checked: checked,
      gridCases: gridCases,
      failures: failures,
      defaultFacts: {
        attackRetrieved: concat.attackRetrieved,
        concatBreach: concat.breach,
        leastBreach: least.breach,
        leastBlocked: least.blocked,
        leastUtility: least.taskSuccess,
        structuredCompromised: structured.compromised
      }
    };
  }

  function syncOutputs(lab, params) {
    var values = {
      seed: String(params.seed),
      trials: String(params.trials),
      poisoned: percent(params.poisoned),
      retrieval: percent(params.retrieval),
      attack: percent(params.attack),
      confusion: percent(params.confusion),
      toolPower: percent(params.toolPower),
      secretReach: percent(params.secretReach),
      approval: percent(params.approval)
    };
    Object.keys(values).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = values[key];
    });
  }

  function drawText(ctx, text, x, y, color, size, weight, align, maxWidth) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 550) + " " + (size || 12) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    if (maxWidth) ctx.fillText(text, x, y, maxWidth);
    else ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawText(ctx, title, box.x, box.y - 14, COLORS.text, 12, 750);
    if (subtitle) drawText(ctx, subtitle, box.x + box.w, box.y - 14, COLORS.muted, 11, 550, "right");
  }

  function roundedRect(ctx, x, y, w, h, r) {
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

  function drawStack(ctx, box) {
    panel(ctx, box, "Authority is not proximity", "higher rows outrank text retrieved later");
    var rows = [
      ["platform / system", "cannot be delegated by a web page", COLORS.trusted],
      ["developer", "application contract and tool policy", "#0f766e"],
      ["user", "task request", "#2563eb"],
      ["retrieved document", "untrusted data, no command authority", COLORS.untrusted],
      ["tool output", "observation, not a new boss", "#64748b"]
    ];
    var x = box.x + 18;
    var y = box.y + 24;
    var rowH = 30;
    rows.forEach(function (row, i) {
      var yy = y + i * 38;
      ctx.fillStyle = i < 3 ? "#ffffff" : COLORS.faint;
      roundedRect(ctx, x, yy, box.w - 36, rowH, 6);
      ctx.fill();
      ctx.strokeStyle = i < 3 ? row[2] : COLORS.rule;
      ctx.stroke();
      ctx.fillStyle = row[2];
      ctx.fillRect(x, yy, 5, rowH);
      drawText(ctx, row[0], x + 15, yy + 10, COLORS.text, 11, 750);
      drawText(ctx, row[1], x + 15, yy + 23, COLORS.muted, 9.5, 550);
    });
    ctx.strokeStyle = COLORS.untrusted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x + box.w - 74, y + 3 * 38 + 15);
    ctx.lineTo(x + box.w - 74, y + 1 * 38 + 15);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, "injection tries to climb", x + box.w - 80, y + 92, COLORS.untrusted, 10, 750, "right");
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "Policy outcomes", "task utility versus compromised actions");
    var plot = { x: box.x + 48, y: box.y + 28, w: box.w - 70, h: box.h - 66 };
    ctx.strokeStyle = COLORS.grid;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(Math.round(tick * 100)), plot.x - 8, y, COLORS.muted, 10, 550, "right");
    });
    var groupW = plot.w / result.policies.length;
    var keys = [
      ["taskSuccess", COLORS.success],
      ["compromised", COLORS.hijack],
      ["breach", COLORS.breach]
    ];
    result.policies.forEach(function (entry, i) {
      keys.forEach(function (key, j) {
        var value = entry.summary[key[0]];
        var bw = Math.min(18, groupW / 5);
        var x = plot.x + i * groupW + groupW * 0.24 + j * (bw + 4);
        var h = value * plot.h;
        ctx.fillStyle = key[1];
        ctx.fillRect(x, plot.y + plot.h - h, bw, h);
      });
      drawText(ctx, entry.policy.short, plot.x + i * groupW + groupW / 2, plot.y + plot.h + 17, COLORS.text, 10, 650, "center");
    });
    drawText(ctx, "success", plot.x + 8, box.y + 15, COLORS.success, 10, 750);
    drawText(ctx, "hijack", plot.x + 75, box.y + 15, COLORS.hijack, 10, 750);
    drawText(ctx, "breach", plot.x + 133, box.y + 15, COLORS.breach, 10, 750);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Attack strength sweep", "breach rate after tools and secrets are considered");
    var plot = { x: box.x + 42, y: box.y + 28, w: box.w - 62, h: box.h - 60 };
    ctx.strokeStyle = COLORS.grid;
    [0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      drawText(ctx, String(Math.round(tick * 100)), plot.x - 8, y, COLORS.muted, 10, 550, "right");
    });
    function sx(a) { return plot.x + a * plot.w; }
    function sy(v) { return plot.y + plot.h - v * plot.h; }
    result.sweep.forEach(function (series) {
      ctx.strokeStyle = series.policy.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.points.forEach(function (point, i) {
        if (i === 0) ctx.moveTo(sx(point.attack), sy(point.breach));
        else ctx.lineTo(sx(point.attack), sy(point.breach));
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    });
    result.sweep.forEach(function (series, i) {
      drawText(ctx, series.policy.short, plot.x + 10 + i * 70, box.y + 15, series.policy.color, 10, 750);
    });
    drawText(ctx, "0", plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 550, "center");
    drawText(ctx, "attack strength", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 550, "right");
  }

  function statusColor(status) {
    if (status === "success") return COLORS.success;
    if (status === "hijack") return COLORS.hijack;
    if (status === "breach") return COLORS.breach;
    if (status === "blocked") return COLORS.blocked;
    return COLORS.fail;
  }

  function drawTape(ctx, result, box) {
    panel(ctx, box, "Request tape", "top: naive concat, bottom: least privilege");
    var rows = [result.policies[0], result.policies[3]];
    var cols = 80;
    var size = 6;
    var gap = 4;
    rows.forEach(function (entry, rowIndex) {
      var x0 = box.x + 72;
      var y0 = box.y + 30 + rowIndex * 58;
      drawText(ctx, entry.policy.short, box.x + 16, y0 + 10, entry.policy.color, 11, 750);
      entry.rows.slice(0, 160).forEach(function (item, i) {
        var col = i % cols;
        var rr = Math.floor(i / cols);
        ctx.fillStyle = statusColor(item.status);
        ctx.fillRect(x0 + col * (size + gap), y0 + rr * (size + gap), size, size);
      });
    });
    drawText(ctx, "green success, amber hijack, red breach, blue blocked, gray miss", box.x + 16, box.y + box.h - 15, COLORS.muted, 10, 550);
  }

  function draw(result, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawStack(ctx, { x: 24, y: 36, w: 330, h: 228 });
    drawBars(ctx, result, { x: 386, y: 36, w: 490, h: 228 });
    drawSweep(ctx, result, { x: 24, y: 310, w: 420, h: 210 });
    drawTape(ctx, result, { x: 476, y: 310, w: 400, h: 210 });
    drawText(ctx, "Toy threat model: retrieved text can ask, but only trusted control flow should decide.", 24, 654, COLORS.muted, 11, 550);
  }

  function render(lab) {
    var params = readParams(lab);
    syncOutputs(lab, params);
    var result = simulate(params);
    var concat = result.policies[0].summary;
    var least = result.policies[3].summary;
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("attack retrieved", percent(concat.attackRetrieved, 0)),
        metric("concat breach", percent(concat.breach, 0)),
        metric("least breach", percent(least.breach, 1)),
        metric("least utility", percent(least.taskSuccess, 0)),
        metric("blocked actions", percent(least.blocked, 0)),
        metric("audit", result.audit.passed + "/" + result.audit.checked)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(result, canvas);
  }

  function init(lab) {
    var frame = null;
    function schedule() {
      if (frame) global.cancelAnimationFrame(frame);
      frame = global.requestAnimationFrame(function () {
        frame = null;
        render(lab);
      });
    }
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
    });
    render(lab);
  }

  var api = {
    POLICIES: POLICIES,
    defaultParams: defaultParams,
    runAudit: runAudit,
    simulate: simulate,
    simulatePolicy: simulatePolicy,
    simulateTrial: simulateTrial,
    summarize: summarize,
    sweepAttack: sweepAttack,
    trialContext: trialContext
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global) global.PromptInjectionLab = api;

  if (global && global.document) {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-prompt-injection-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
