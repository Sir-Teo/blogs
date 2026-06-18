(function (global) {
  "use strict";

  var NEG = -1e12;

  var DEFAULTS = {
    length: 52,
    substitutions: 10,
    gapEvents: 2,
    gapMean: 6,
    pattern: "clustered",
    seed: 37
  };

  var PATTERNS = [
    { key: "clustered", label: "clustered gaps" },
    { key: "longGap", label: "one long gap" },
    { key: "scattered", label: "scattered gaps" },
    { key: "substitution", label: "substitution drift" },
    { key: "repeat", label: "repeat trap" }
  ];

  var SCORING = {
    match: 2,
    mismatch: -1,
    linearGap: -2,
    gapOpen: -5,
    gapExtend: -1
  };

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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hasPattern(key) {
    return PATTERNS.some(function (row) { return row.key === key; });
  }

  function normalize(raw) {
    raw = raw || {};
    return {
      length: clamp(Math.round(Number(raw.length == null ? DEFAULTS.length : raw.length)), 20, 96),
      substitutions: clamp(Math.round(Number(raw.substitutions == null ? DEFAULTS.substitutions : raw.substitutions)), 0, 35),
      gapEvents: clamp(Math.round(Number(raw.gapEvents == null ? DEFAULTS.gapEvents : raw.gapEvents)), 0, 8),
      gapMean: clamp(Math.round(Number(raw.gapMean == null ? DEFAULTS.gapMean : raw.gapMean)), 1, 14),
      pattern: hasPattern(raw.pattern) ? raw.pattern : DEFAULTS.pattern,
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

  function randomBase(random, avoid) {
    var bases = ["A", "C", "G", "T"];
    var base = bases[Math.floor(random() * bases.length)];
    if (avoid && base === avoid) base = bases[(bases.indexOf(base) + 1 + Math.floor(random() * 3)) % bases.length];
    return base;
  }

  function randomDNA(length, random) {
    var out = "";
    for (var i = 0; i < length; i += 1) out += randomBase(random);
    return out;
  }

  function repeatDNA(length) {
    var motif = "ACGTGCA";
    var out = "";
    while (out.length < length) out += motif;
    return out.slice(0, length);
  }

  function spliceString(value, start, deleteCount, insert) {
    return value.slice(0, start) + (insert || "") + value.slice(start + deleteCount);
  }

  function applySubstitutions(seq, rate, random, events) {
    var chars = seq.split("");
    var count = Math.round(chars.length * rate / 100);
    var used = {};
    for (var k = 0; k < count && chars.length > 0; k += 1) {
      var pos = Math.floor(random() * chars.length);
      var guard = 0;
      while (used[pos] && guard < chars.length + 2) {
        pos = (pos + 1) % chars.length;
        guard += 1;
      }
      used[pos] = true;
      var before = chars[pos];
      chars[pos] = randomBase(random, before);
      events.push({ type: "substitution", pos: pos, before: before, after: chars[pos], len: 1 });
    }
    return chars.join("");
  }

  function mutate(params) {
    var random = rng(params.seed);
    var source = params.pattern === "repeat" ? repeatDNA(params.length) : randomDNA(params.length, random);
    var target = source;
    var events = [];

    function deletion(pos, len) {
      len = Math.min(len, Math.max(0, target.length - pos));
      if (len <= 0) return;
      events.push({ type: "deletion", pos: pos, len: len, bases: target.slice(pos, pos + len) });
      target = spliceString(target, pos, len, "");
    }

    function insertion(pos, len) {
      if (len <= 0) return;
      var bases = randomDNA(len, random);
      events.push({ type: "insertion", pos: pos, len: len, bases: bases });
      target = spliceString(target, pos, 0, bases);
    }

    if (params.pattern === "longGap") {
      deletion(Math.floor(params.length * 0.43), Math.min(params.gapMean + 5, Math.floor(params.length / 3)));
      if (params.gapEvents > 1) insertion(Math.floor(target.length * 0.68), Math.max(2, params.gapMean - 2));
    } else if (params.pattern === "scattered") {
      for (var s = 0; s < params.gapEvents; s += 1) {
        if (target.length < 3) break;
        if (random() < 0.5) deletion(Math.floor(random() * target.length), 1);
        else insertion(Math.floor(random() * (target.length + 1)), 1);
      }
    } else if (params.pattern === "substitution") {
      // Gaps intentionally absent unless the user turns on many events.
      for (var q = 0; q < Math.max(0, params.gapEvents - 4); q += 1) insertion(Math.floor(random() * (target.length + 1)), 1);
    } else if (params.pattern === "repeat") {
      deletion(Math.floor(params.length * 0.34), Math.max(2, params.gapMean));
      insertion(Math.floor(target.length * 0.62), Math.max(1, Math.floor(params.gapMean / 2)), random);
    } else {
      for (var e = 0; e < params.gapEvents; e += 1) {
        var len = Math.max(1, Math.round(params.gapMean * (0.5 + random())));
        if (random() < 0.62) deletion(Math.floor(random() * Math.max(1, target.length)), len);
        else insertion(Math.floor(random() * (target.length + 1)), len);
      }
    }

    target = applySubstitutions(target, params.substitutions, random, events);
    return { source: source, target: target, events: events };
  }

  function substitutionScore(a, b) {
    return a === b ? SCORING.match : SCORING.mismatch;
  }

  function matrix(rows, cols, fill) {
    var out = new Array(rows);
    for (var i = 0; i < rows; i += 1) {
      out[i] = new Array(cols);
      for (var j = 0; j < cols; j += 1) out[i][j] = fill;
    }
    return out;
  }

  function best(candidates) {
    var winner = candidates[0];
    for (var i = 1; i < candidates.length; i += 1) {
      if (candidates[i].score > winner.score) winner = candidates[i];
    }
    return winner;
  }

  function pathStats(alignedA, alignedB) {
    var matches = 0;
    var mismatches = 0;
    var gapChars = 0;
    var gapRuns = 0;
    var prevGap = "";
    for (var k = 0; k < alignedA.length; k += 1) {
      var a = alignedA[k];
      var b = alignedB[k];
      var gap = "";
      if (a === "-" && b === "-") {
        gap = "double";
      } else if (a === "-") {
        gap = "a";
        gapChars += 1;
      } else if (b === "-") {
        gap = "b";
        gapChars += 1;
      } else if (a === b) {
        matches += 1;
      } else {
        mismatches += 1;
      }
      if (gap && gap !== prevGap) gapRuns += 1;
      prevGap = gap;
      if (!gap) prevGap = "";
    }
    return {
      matches: matches,
      mismatches: mismatches,
      gapChars: gapChars,
      gapRuns: gapRuns,
      alignedLength: alignedA.length,
      identity: matches / Math.max(1, matches + mismatches)
    };
  }

  function stripGaps(value) {
    return value.replace(/-/g, "");
  }

  function scoreAlignmentLinear(alignedA, alignedB) {
    var score = 0;
    for (var k = 0; k < alignedA.length; k += 1) {
      var a = alignedA[k];
      var b = alignedB[k];
      if (a === "-" || b === "-") score += SCORING.linearGap;
      else score += substitutionScore(a, b);
    }
    return score;
  }

  function scoreAlignmentAffine(alignedA, alignedB) {
    var score = 0;
    var gapState = "";
    for (var k = 0; k < alignedA.length; k += 1) {
      var a = alignedA[k];
      var b = alignedB[k];
      if (a === "-" || b === "-") {
        var next = a === "-" ? "a" : "b";
        score += gapState === next ? SCORING.gapExtend : SCORING.gapOpen;
        gapState = next;
      } else {
        score += substitutionScore(a, b);
        gapState = "";
      }
    }
    return score;
  }

  function alignLinear(a, b) {
    var n = a.length;
    var m = b.length;
    var score = matrix(n + 1, m + 1, NEG);
    var trace = matrix(n + 1, m + 1, -1);
    score[0][0] = 0;
    trace[0][0] = 3;
    for (var i = 1; i <= n; i += 1) {
      score[i][0] = score[i - 1][0] + SCORING.linearGap;
      trace[i][0] = 1;
    }
    for (var j = 1; j <= m; j += 1) {
      score[0][j] = score[0][j - 1] + SCORING.linearGap;
      trace[0][j] = 2;
    }
    for (i = 1; i <= n; i += 1) {
      for (j = 1; j <= m; j += 1) {
        var choice = best([
          { score: score[i - 1][j - 1] + substitutionScore(a[i - 1], b[j - 1]), step: 0 },
          { score: score[i - 1][j] + SCORING.linearGap, step: 1 },
          { score: score[i][j - 1] + SCORING.linearGap, step: 2 }
        ]);
        score[i][j] = choice.score;
        trace[i][j] = choice.step;
      }
    }

    var alignedA = [];
    var alignedB = [];
    var path = [{ i: n, j: m }];
    i = n;
    j = m;
    while (i > 0 || j > 0) {
      var step = trace[i][j];
      if (step === 0) {
        alignedA.push(a[i - 1]);
        alignedB.push(b[j - 1]);
        i -= 1;
        j -= 1;
      } else if (step === 1) {
        alignedA.push(a[i - 1]);
        alignedB.push("-");
        i -= 1;
      } else {
        alignedA.push("-");
        alignedB.push(b[j - 1]);
        j -= 1;
      }
      path.push({ i: i, j: j });
    }
    alignedA.reverse();
    alignedB.reverse();
    path.reverse();

    return {
      key: "linear",
      label: "linear gap",
      color: COLORS.blue,
      score: score[n][m],
      scoreMatrix: score,
      trace: trace,
      alignedA: alignedA.join(""),
      alignedB: alignedB.join(""),
      path: path,
      stats: pathStats(alignedA, alignedB)
    };
  }

  function alignAffine(a, b) {
    var n = a.length;
    var m = b.length;
    var M = matrix(n + 1, m + 1, NEG);
    var X = matrix(n + 1, m + 1, NEG);
    var Y = matrix(n + 1, m + 1, NEG);
    var tM = matrix(n + 1, m + 1, -1);
    var tX = matrix(n + 1, m + 1, -1);
    var tY = matrix(n + 1, m + 1, -1);
    M[0][0] = 0;
    tM[0][0] = 0;

    for (var i = 1; i <= n; i += 1) {
      if (i === 1) {
        X[i][0] = M[i - 1][0] + SCORING.gapOpen;
        tX[i][0] = 0;
      } else {
        X[i][0] = X[i - 1][0] + SCORING.gapExtend;
        tX[i][0] = 1;
      }
    }
    for (var j = 1; j <= m; j += 1) {
      if (j === 1) {
        Y[0][j] = M[0][j - 1] + SCORING.gapOpen;
        tY[0][j] = 0;
      } else {
        Y[0][j] = Y[0][j - 1] + SCORING.gapExtend;
        tY[0][j] = 2;
      }
    }

    for (i = 1; i <= n; i += 1) {
      for (j = 1; j <= m; j += 1) {
        var prev = best([
          { score: M[i - 1][j - 1], state: 0 },
          { score: X[i - 1][j - 1], state: 1 },
          { score: Y[i - 1][j - 1], state: 2 }
        ]);
        M[i][j] = prev.score + substitutionScore(a[i - 1], b[j - 1]);
        tM[i][j] = prev.state;

        var gx = best([
          { score: M[i - 1][j] + SCORING.gapOpen, state: 0 },
          { score: X[i - 1][j] + SCORING.gapExtend, state: 1 }
        ]);
        X[i][j] = gx.score;
        tX[i][j] = gx.state;

        var gy = best([
          { score: M[i][j - 1] + SCORING.gapOpen, state: 0 },
          { score: Y[i][j - 1] + SCORING.gapExtend, state: 2 }
        ]);
        Y[i][j] = gy.score;
        tY[i][j] = gy.state;
      }
    }

    var finalChoice = best([
      { score: M[n][m], state: 0 },
      { score: X[n][m], state: 1 },
      { score: Y[n][m], state: 2 }
    ]);
    var state = finalChoice.state;
    var alignedA = [];
    var alignedB = [];
    var path = [{ i: n, j: m, state: state }];
    i = n;
    j = m;
    while (i > 0 || j > 0) {
      var previous;
      if (state === 0) {
        previous = tM[i][j];
        alignedA.push(a[i - 1]);
        alignedB.push(b[j - 1]);
        i -= 1;
        j -= 1;
      } else if (state === 1) {
        previous = tX[i][j];
        alignedA.push(a[i - 1]);
        alignedB.push("-");
        i -= 1;
      } else {
        previous = tY[i][j];
        alignedA.push("-");
        alignedB.push(b[j - 1]);
        j -= 1;
      }
      state = previous;
      path.push({ i: i, j: j, state: state });
    }
    alignedA.reverse();
    alignedB.reverse();
    path.reverse();

    var bestMatrix = matrix(n + 1, m + 1, NEG);
    for (i = 0; i <= n; i += 1) {
      for (j = 0; j <= m; j += 1) bestMatrix[i][j] = Math.max(M[i][j], X[i][j], Y[i][j]);
    }

    return {
      key: "affine",
      label: "affine gap",
      color: COLORS.good,
      score: finalChoice.score,
      finalState: finalChoice.state,
      matrices: { M: M, X: X, Y: Y },
      scoreMatrix: bestMatrix,
      traces: { M: tM, X: tX, Y: tY },
      alignedA: alignedA.join(""),
      alignedB: alignedB.join(""),
      path: path,
      stats: pathStats(alignedA, alignedB)
    };
  }

  function bruteForceScores(a, b) {
    var bestLinear = NEG;
    var bestAffine = NEG;

    function rec(i, j, linear, affine, gapState) {
      if (i === a.length && j === b.length) {
        if (linear > bestLinear) bestLinear = linear;
        if (affine > bestAffine) bestAffine = affine;
        return;
      }
      if (i < a.length && j < b.length) {
        var sub = substitutionScore(a[i], b[j]);
        rec(i + 1, j + 1, linear + sub, affine + sub, "");
      }
      if (i < a.length) {
        rec(
          i + 1,
          j,
          linear + SCORING.linearGap,
          affine + (gapState === "b" ? SCORING.gapExtend : SCORING.gapOpen),
          "b"
        );
      }
      if (j < b.length) {
        rec(
          i,
          j + 1,
          linear + SCORING.linearGap,
          affine + (gapState === "a" ? SCORING.gapExtend : SCORING.gapOpen),
          "a"
        );
      }
    }

    rec(0, 0, 0, 0, "");
    return { linear: bestLinear, affine: bestAffine };
  }

  function validAlignment(result, a, b, scorer) {
    if (result.alignedA.length !== result.alignedB.length) return false;
    if (stripGaps(result.alignedA) !== a) return false;
    if (stripGaps(result.alignedB) !== b) return false;
    for (var i = 0; i < result.alignedA.length; i += 1) {
      if (result.alignedA[i] === "-" && result.alignedB[i] === "-") return false;
    }
    return scorer(result.alignedA, result.alignedB) === result.score;
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var data = mutate(params);
    var linear = alignLinear(data.source, data.target);
    var affine = alignAffine(data.source, data.target);
    var result = {
      params: params,
      source: data.source,
      target: data.target,
      events: data.events,
      linear: linear,
      affine: affine
    };
    result.audit = auditResult(result);
    return result;
  }

  function auditResult(result) {
    var checks = [];
    function check(name, passed) {
      checks.push({ name: name, passed: !!passed });
    }
    check("linear backtrace is a valid alignment", validAlignment(result.linear, result.source, result.target, scoreAlignmentLinear));
    check("affine backtrace is a valid alignment", validAlignment(result.affine, result.source, result.target, scoreAlignmentAffine));
    check("linear matrix has expected shape", result.linear.scoreMatrix.length === result.source.length + 1 && result.linear.scoreMatrix[0].length === result.target.length + 1);
    check("affine matrix has expected shape", result.affine.scoreMatrix.length === result.source.length + 1 && result.affine.scoreMatrix[0].length === result.target.length + 1);
    check("affine final score is max of end states", result.affine.score === Math.max(
      result.affine.matrices.M[result.source.length][result.target.length],
      result.affine.matrices.X[result.source.length][result.target.length],
      result.affine.matrices.Y[result.source.length][result.target.length]
    ));
    [["ACGT", "AGT"], ["GATT", "GCT"], ["AACG", "ACCG"], ["TGA", "TGACA"]].forEach(function (pair) {
      var brute = bruteForceScores(pair[0], pair[1]);
      var linear = alignLinear(pair[0], pair[1]);
      var affine = alignAffine(pair[0], pair[1]);
      check("linear DP matches brute force for " + pair[0] + "/" + pair[1], linear.score === brute.linear);
      check("affine DP matches brute force for " + pair[0] + "/" + pair[1], affine.score === brute.affine);
    });
    check("scores are finite", Number.isFinite(result.linear.score) && Number.isFinite(result.affine.score));
    return {
      passed: checks.every(function (row) { return row.passed; }),
      checks: checks
    };
  }

  function auditGrid() {
    var criticalByName = {};
    var cases = [
      {},
      { pattern: "longGap", length: 54, substitutions: 8, gapEvents: 2, gapMean: 8, seed: 12 },
      { pattern: "scattered", length: 48, substitutions: 12, gapEvents: 7, gapMean: 1, seed: 92 },
      { pattern: "substitution", length: 52, substitutions: 24, gapEvents: 0, gapMean: 3, seed: 5 },
      { pattern: "repeat", length: 56, substitutions: 7, gapEvents: 2, gapMean: 7, seed: 4 },
      { pattern: "clustered", length: 80, substitutions: 6, gapEvents: 4, gapMean: 5, seed: 211 }
    ].map(function (row, index) {
      var result = evaluate(row);
      var caseId = index + 1;
      result.audit.checks.forEach(function (check) {
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
        else criticalByName[check.name].failedCases.push(caseId);
      });
      return {
        caseId: caseId,
        params: result.params,
        pattern: result.params.pattern,
        substitutions: result.params.substitutions,
        gapEvents: result.params.gapEvents,
        gapMean: result.params.gapMean,
        seed: result.params.seed,
        sourceLength: result.source.length,
        targetLength: result.target.length,
        linearScore: result.linear.score,
        affineScore: result.affine.score,
        linearGapRuns: result.linear.stats.gapRuns,
        affineGapRuns: result.affine.stats.gapRuns,
        affineGapChars: result.affine.stats.gapChars,
        affineIdentity: result.affine.stats.identity,
        passed: result.audit.passed,
        passedChecks: result.audit.checks.filter(function (check) { return check.passed; }).length,
        totalChecks: result.audit.checks.length,
        failedChecks: result.audit.checks.filter(function (check) { return !check.passed; }).map(function (check) { return check.name; })
      };
    });
    function summarize(groupBy) {
      var groups = {};
      cases.forEach(function (row) {
        var key = row[groupBy];
        if (!groups[key]) {
          groups[key] = {
            affineGapChars: 0,
            affineGapRuns: 0,
            affineScore: 0,
            cases: 0,
            linearGapRuns: 0,
            linearScore: 0,
            passed: 0,
            passedChecks: 0,
            totalChecks: 0
          };
          groups[key][groupBy] = key;
        }
        groups[key].affineGapChars += row.affineGapChars;
        groups[key].affineGapRuns += row.affineGapRuns;
        groups[key].affineScore += row.affineScore;
        groups[key].cases += 1;
        groups[key].linearGapRuns += row.linearGapRuns;
        groups[key].linearScore += row.linearScore;
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
    return {
      byPattern: summarize("pattern"),
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

  function fmt(value, digits) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    if (Math.abs(value) >= 100) return value.toFixed(digits == null ? 1 : digits);
    if (Math.abs(value) >= 10) return value.toFixed(digits == null ? 2 : digits);
    return value.toFixed(digits == null ? 3 : digits);
  }

  function pct(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function metric(label, value, className) {
    return '<div class="alignment-lab__metric ' + (className || "") + '"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 900));
    var cssHeight = cssWidth < 720 ? 900 : 650;
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

  function mono(ctx, value, x, y, color, size, weight) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 650) + " " + (size || 12) + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
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

  function clipMiddle(value, max) {
    if (value.length <= max) return value;
    var left = Math.floor((max - 3) * 0.58);
    var right = max - 3 - left;
    return value.slice(0, left) + "..." + value.slice(value.length - right);
  }

  function markerLine(a, b) {
    var out = "";
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] === "-" || b[i] === "-") out += " ";
      else out += a[i] === b[i] ? "|" : ".";
    }
    return out;
  }

  function drawAlignment(ctx, box, result) {
    panel(ctx, box, "alignment backtrace", "same sequences, different gap accounting");
    var maxChars = Math.max(24, Math.floor((box.w - 120) / 8.2));
    var lineA = clipMiddle(result.affine.alignedA, maxChars);
    var lineB = clipMiddle(result.affine.alignedB, maxChars);
    var marks = markerLine(lineA, lineB);
    var y = box.y + 76;
    text(ctx, "source", box.x + 18, y, COLORS.muted, 11, 700);
    mono(ctx, lineA, box.x + 76, y, COLORS.text, 12, 720);
    mono(ctx, marks, box.x + 76, y + 22, COLORS.muted, 12, 720);
    text(ctx, "target", box.x + 18, y + 44, COLORS.muted, 11, 700);
    mono(ctx, lineB, box.x + 76, y + 44, COLORS.text, 12, 720);
    var rows = [
      ["linear score", String(result.linear.score), COLORS.blue],
      ["affine score", String(result.affine.score), COLORS.good],
      ["affine identity", pct(result.affine.stats.identity, 1), COLORS.purple],
      ["gap runs", result.affine.stats.gapRuns + " runs / " + result.affine.stats.gapChars + " chars", COLORS.amber]
    ];
    var ly = box.y + box.h - 72;
    rows.forEach(function (row, i) {
      var x = box.x + 18 + (i % 2) * Math.max(170, box.w * 0.46);
      var yy = ly + Math.floor(i / 2) * 26;
      text(ctx, row[0], x, yy, COLORS.muted, 10, 650);
      text(ctx, row[1], x + 92, yy, row[2], 11, 780);
    });
  }

  function drawMatrix(ctx, box, result) {
    panel(ctx, box, "affine DP surface", "max of match, insertion, and deletion states");
    var matrixData = result.affine.scoreMatrix;
    var rows = matrixData.length;
    var cols = matrixData[0].length;
    var left = box.x + 42;
    var top = box.y + 62;
    var size = Math.min(box.w - 68, box.h - 104);
    var cellW = size / cols;
    var cellH = size / rows;
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; i < rows; i += 1) {
      for (var j = 0; j < cols; j += 1) {
        var value = matrixData[i][j];
        if (value > NEG / 2) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }
    }
    for (i = 0; i < rows; i += 1) {
      for (j = 0; j < cols; j += 1) {
        value = matrixData[i][j];
        var t = value <= NEG / 2 ? 0 : (value - min) / Math.max(1, max - min);
        ctx.fillStyle = "rgba(15, 118, 110, " + (0.10 + 0.75 * t).toFixed(3) + ")";
        ctx.fillRect(left + j * cellW, top + i * cellH, Math.max(1, cellW + 0.2), Math.max(1, cellH + 0.2));
      }
    }
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    result.affine.path.forEach(function (point, idx) {
      var x = left + (point.j + 0.5) * cellW;
      var y = top + (point.i + 0.5) * cellH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    text(ctx, "red path = chosen affine alignment", left, box.y + box.h - 20, COLORS.bad, 11, 700);
    text(ctx, rows - 1 + " x " + (cols - 1) + " cells", left + size, box.y + box.h - 20, COLORS.muted, 11, 650, "right");
  }

  function drawPenalty(ctx, box) {
    panel(ctx, box, "gap cost curve", "affine gaps pay to open, then pay less to extend");
    var plot = { x: box.x + 42, y: box.y + 66, w: box.w - 68, h: box.h - 110 };
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    var maxLen = 16;
    var maxPenalty = Math.max(-SCORING.linearGap * maxLen, -SCORING.gapOpen - SCORING.gapExtend * (maxLen - 1));
    function sx(len) { return plot.x + (len - 1) / (maxLen - 1) * plot.w; }
    function sy(penalty) { return plot.y + plot.h - penalty / maxPenalty * plot.h; }
    function line(color, fn) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (var len = 1; len <= maxLen; len += 1) {
        var x = sx(len);
        var y = sy(fn(len));
        if (len === 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    line(COLORS.blue, function (len) { return -SCORING.linearGap * len; });
    line(COLORS.good, function (len) { return -SCORING.gapOpen - SCORING.gapExtend * (len - 1); });
    text(ctx, "linear", plot.x, box.y + box.h - 24, COLORS.blue, 11, 760);
    text(ctx, "affine", plot.x + 70, box.y + box.h - 24, COLORS.good, 11, 760);
    text(ctx, "gap length", plot.x + plot.w, box.y + box.h - 24, COLORS.muted, 11, 650, "right");
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "audit ledger", "DP scores are recomputed from the backtrace");
    var rows = [
      ["source length", String(result.source.length), COLORS.text],
      ["target length", String(result.target.length), COLORS.text],
      ["linear gaps", result.linear.stats.gapRuns + " / " + result.linear.stats.gapChars, COLORS.blue],
      ["affine gaps", result.affine.stats.gapRuns + " / " + result.affine.stats.gapChars, COLORS.good],
      ["events", String(result.events.length), COLORS.amber],
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
      drawAlignment(ctx, { x: 0, y: 0, w: width, h: h }, result);
      drawMatrix(ctx, { x: 0, y: h + gap, w: width, h: h }, result);
      drawPenalty(ctx, { x: 0, y: 2 * (h + gap), w: width, h: h }, result);
      drawLedger(ctx, { x: 0, y: 3 * (h + gap), w: width, h: height - 3 * (h + gap) }, result);
    } else {
      var gap2 = 16;
      var leftW = Math.round(width * 0.56);
      var rightW = width - leftW - gap2;
      var upperH = Math.round(height * 0.52);
      drawAlignment(ctx, { x: 0, y: 0, w: leftW, h: upperH }, result);
      drawMatrix(ctx, { x: 0, y: upperH + gap2, w: leftW, h: height - upperH - gap2 }, result);
      drawPenalty(ctx, { x: leftW + gap2, y: 0, w: rightW, h: upperH }, result);
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
      length: String(result.params.length),
      substitutions: String(result.params.substitutions),
      gapEvents: String(result.params.gapEvents),
      gapMean: String(result.params.gapMean),
      seed: String(result.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Linear Score", String(result.linear.score), "alignment-lab__metric--linear"),
        metric("Affine Score", String(result.affine.score), "alignment-lab__metric--good"),
        metric("Affine Gap Runs", result.affine.stats.gapRuns + " / " + result.affine.stats.gapChars),
        metric("Identity", pct(result.affine.stats.identity, 1)),
        metric("Audit", result.audit.passed ? "passed" : "check", result.audit.passed ? "alignment-lab__metric--good" : "alignment-lab__metric--bad")
      ].join("");
    }
    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Scores use match +2, mismatch -1, linear gap -2, and affine gap open -5 then extend -1. The audit also compares small cases with exhaustive enumeration.";
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) draw(canvas, result);
    root.__alignmentResult = result;
  }

  function init(root) {
    if (!root || root.__alignmentReady) return;
    root.__alignmentReady = true;
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-affine-alignment-lab]")).forEach(init);
  }

  var api = {
    alignAffine: alignAffine,
    alignLinear: alignLinear,
    auditGrid: auditGrid,
    bruteForceScores: bruteForceScores,
    evaluate: evaluate,
    scoreAlignmentAffine: scoreAlignmentAffine,
    scoreAlignmentLinear: scoreAlignmentLinear
  };

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AffineAlignmentLab = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
