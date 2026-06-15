(function (global) {
  "use strict";

  var COLORS = {
    shared: "#0f766e",
    leftOnly: "#2563eb",
    rightOnly: "#d97706",
    mismatch: "#e2e8f0",
    current: "#be123c",
    background: "#64748b",
    threshold: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc"
  };
  var AUDIT_CACHE = null;

  var WORDS = [
    "model", "vector", "policy", "cache", "query", "index", "signal", "market",
    "token", "router", "gradient", "sample", "window", "memory", "rank", "graph",
    "feature", "latent", "search", "batch", "stream", "posterior", "risk", "price",
    "ledger", "state", "metric", "shard", "trace", "bucket", "kernel", "schema",
    "proof", "matrix", "solver", "agent", "reward", "noise", "drift", "filter",
    "clock", "venue", "spread", "quote", "match", "review", "threshold", "prior",
    "belief", "control", "estimate", "hash", "cluster", "phrase", "domain", "cursor",
    "commit", "rollout", "label", "anchor", "path", "error", "budget", "table"
  ];

  var BOILER = [
    "home", "about", "contact", "privacy", "subscribe", "copyright", "share",
    "login", "archive", "terms", "navigation", "footer", "newsletter", "updated"
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 10) return value.toFixed(1) + "%";
    if (value >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000000) return (value / 1000000000).toFixed(1) + "B";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function metric(label, value) {
    return '<div class="minhash-lab__metric"><span>' + label + '</span><strong>' + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function hashString(text, seed) {
    var h = (0x811c9dc5 ^ seed) >>> 0;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return hash32(h, seed ^ 0x9e3779b9);
  }

  function wordAt(index, salt) {
    var h = hash32(index + 1, salt);
    return WORDS[h % WORDS.length] + String((h >>> 7) % 19);
  }

  function boilerAt(index) {
    return BOILER[index % BOILER.length] + String(Math.floor(index / BOILER.length) % 7);
  }

  function makeDocument(params, variant) {
    var contentCount = 132;
    var boilerShare = clamp(params.boilerplate / 100, 0, 0.75);
    var boilerCount = Math.round(contentCount * boilerShare / Math.max(0.05, 1 - boilerShare));
    var tokens = [];
    var boilerSpacing = Math.max(12, Math.floor(contentCount / Math.max(1, boilerCount || 1)));
    var boilerIndex = 0;

    function maybeBoiler(i) {
      while (boilerIndex < boilerCount && i >= boilerIndex * boilerSpacing) {
        tokens.push(boilerAt(boilerIndex));
        boilerIndex += 1;
      }
    }

    for (var i = 0; i < contentCount; i += 1) {
      maybeBoiler(i);
      var base = wordAt(i, 0x6d2b79f5);
      if (variant === "background") {
        tokens.push(wordAt(i, 0xa54ff53a));
      } else if (variant === "mutated") {
        var h = hash32(i + 3, 0x1f123bb5);
        if (h % 100 < params.editRate) {
          if ((h >>> 8) % 5 === 0) {
            tokens.push(wordAt(i, 0xba5eba11));
            tokens.push(base);
          } else if ((h >>> 8) % 5 === 1) {
            tokens.push(base);
            tokens.push(wordAt(i + 211, 0x9e4c6f31));
          } else {
            tokens.push(wordAt(i, 0xba5eba11));
          }
        } else {
          tokens.push(base);
        }
      } else {
        tokens.push(base);
      }
    }
    while (boilerIndex < boilerCount) {
      tokens.push(boilerAt(boilerIndex));
      boilerIndex += 1;
    }
    return tokens;
  }

  function shingleSet(tokens, width) {
    var map = Object.create(null);
    var arr = [];
    if (tokens.length < width) return { array: arr, map: map };
    for (var i = 0; i <= tokens.length - width; i += 1) {
      var shingle = tokens.slice(i, i + width).join(" ");
      if (!map[shingle]) {
        map[shingle] = true;
        arr.push(shingle);
      }
    }
    return { array: arr, map: map };
  }

  function setStats(left, right) {
    var shared = 0;
    for (var i = 0; i < left.array.length; i += 1) {
      if (right.map[left.array[i]]) shared += 1;
    }
    var leftOnly = left.array.length - shared;
    var rightOnly = right.array.length - shared;
    var union = shared + leftOnly + rightOnly;
    return {
      background: false,
      jaccard: union ? shared / union : 1,
      leftOnly: leftOnly,
      rightOnly: rightOnly,
      shared: shared,
      union: union
    };
  }

  function shingleHashes(set) {
    return set.array.map(function (shingle) {
      return hashString(shingle, 0x20260613);
    });
  }

  function minhashSignature(hashes, rows, salt) {
    var sig = [];
    for (var r = 0; r < rows; r += 1) {
      var seed = (salt ^ Math.imul(r + 1, 0x45d9f3b)) >>> 0;
      var min = 0xffffffff;
      for (var i = 0; i < hashes.length; i += 1) {
        var h = hash32(hashes[i], seed);
        if (h < min) min = h;
      }
      sig.push(min);
    }
    return sig;
  }

  function signatureAgreement(left, right) {
    var matches = 0;
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] === right[i]) matches += 1;
    }
    return left.length ? matches / left.length : 1;
  }

  function bandMatches(left, right, bands, rowsPerBand) {
    var out = [];
    for (var band = 0; band < bands; band += 1) {
      var start = band * rowsPerBand;
      var match = true;
      for (var r = 0; r < rowsPerBand; r += 1) {
        if (left[start + r] !== right[start + r]) {
          match = false;
          break;
        }
      }
      out.push(match);
    }
    return out;
  }

  function lshProbability(similarity, bands, rowsPerBand) {
    var s = clamp(similarity, 0, 1);
    return 1 - Math.pow(1 - Math.pow(s, rowsPerBand), bands);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function simulate(params) {
    var bands = Math.max(1, Math.round(params.bands));
    var rowsPerBand = Math.max(1, Math.round(params.rowsPerBand));
    var rows = bands * rowsPerBand;
    var shingleSize = Math.max(2, Math.round(params.shingleSize));
    var docA = makeDocument(params, "base");
    var docB = makeDocument(params, "mutated");
    var docC = makeDocument(params, "background");
    var setA = shingleSet(docA, shingleSize);
    var setB = shingleSet(docB, shingleSize);
    var setC = shingleSet(docC, shingleSize);
    var exact = setStats(setA, setB);
    var background = setStats(setA, setC);
    background.background = true;
    var hashA = shingleHashes(setA);
    var hashB = shingleHashes(setB);
    var hashC = shingleHashes(setC);
    var sigA = minhashSignature(hashA, rows, 0x72657365);
    var sigB = minhashSignature(hashB, rows, 0x72657365);
    var sigC = minhashSignature(hashC, rows, 0x72657365);
    var estimate = signatureAgreement(sigA, sigB);
    var backgroundEstimate = signatureAgreement(sigA, sigC);
    var matches = bandMatches(sigA, sigB, bands, rowsPerBand);
    var bgMatches = bandMatches(sigA, sigC, bands, rowsPerBand);
    var candidate = matches.some(Boolean);
    var backgroundCandidate = bgMatches.some(Boolean);
    var candidateProbability = lshProbability(exact.jaccard, bands, rowsPerBand);
    var backgroundProbability = lshProbability(background.jaccard, bands, rowsPerBand);
    var threshold = Math.pow(1 / bands, 1 / rowsPerBand);
    var corpus = Math.max(2, Math.round(params.corpus));
    var allPairs = corpus * (corpus - 1) / 2;
    var expectedBackgroundCandidates = allPairs * backgroundProbability;

    return {
      allPairs: allPairs,
      background: background,
      backgroundCandidate: backgroundCandidate,
      backgroundEstimate: backgroundEstimate,
      backgroundMatches: bgMatches,
      backgroundProbability: backgroundProbability,
      bands: bands,
      candidate: candidate,
      candidateProbability: candidateProbability,
      corpus: corpus,
      exact: exact,
      expectedBackgroundCandidates: expectedBackgroundCandidates,
      estimate: estimate,
      matches: matches,
      params: params,
      rows: rows,
      rowsPerBand: rowsPerBand,
      shingleSize: shingleSize,
      signatureA: sigA,
      signatureB: sigB,
      threshold: threshold
    };
  }

  function close(left, right, tolerance) {
    return Math.abs(left - right) <= tolerance;
  }

  function probability(value) {
    return Number.isFinite(value) && value >= 0 && value <= 1;
  }

  function auditSet(array) {
    var map = Object.create(null);
    array.forEach(function (value) { map[value] = true; });
    return { array: array, map: map };
  }

  function runAudit() {
    var checked = 0;
    var passed = 0;
    var failures = [];

    function record(name, ok, details) {
      checked += 1;
      if (ok) {
        passed += 1;
      } else if (failures.length < 8) {
        failures.push({ name: name, details: details || "" });
      }
    }

    var shingles = shingleSet(["a", "b", "c", "a", "b", "c"], 2);
    record("shingleSet deduplicates", shingles.array.length === 3);
    record("shingleSet keeps expected shingle", shingles.map["a b"] && shingles.map["b c"] && shingles.map["c a"]);
    record("short document has no shingles", shingleSet(["a"], 2).array.length === 0);

    var sameStats = setStats(auditSet(["x", "y"]), auditSet(["x", "y"]));
    record("identical sets have Jaccard one", sameStats.jaccard === 1 && sameStats.shared === 2 && sameStats.union === 2);
    var disjointStats = setStats(auditSet(["x", "y"]), auditSet(["a", "b"]));
    record("disjoint sets have Jaccard zero", disjointStats.jaccard === 0 && disjointStats.union === 4);
    var partialStats = setStats(auditSet(["x", "y", "z"]), auditSet(["y", "z", "w"]));
    record("partial set ledger closes", partialStats.shared === 2 && partialStats.leftOnly === 1 && partialStats.rightOnly === 1 && partialStats.union === 4);
    record("partial Jaccard formula", partialStats.jaccard === 0.5);

    var hashes = shingleHashes(auditSet(["alpha", "beta", "gamma"]));
    var sigA = minhashSignature(hashes, 12, 0x12345678);
    var sigB = minhashSignature(hashes, 12, 0x12345678);
    record("identical signatures match", signatureAgreement(sigA, sigB) === 1);
    record("signature length matches rows", sigA.length === 12);
    var emptySig = minhashSignature([], 5, 0x12345678);
    record("empty signatures use max sentinel", emptySig.every(function (value) { return value === 0xffffffff; }));
    record("empty signature agreement is one", signatureAgreement(emptySig, emptySig) === 1);

    var bandedLeft = [1, 2, 3, 4, 5, 6];
    var bandedRight = [1, 2, 7, 4, 8, 6];
    var banded = bandMatches(bandedLeft, bandedRight, 3, 2);
    record("band match length", banded.length === 3);
    record("band matching requires every row", banded[0] === true && banded[1] === false && banded[2] === false);

    record("lsh zero boundary", lshProbability(0, 20, 5) === 0);
    record("lsh one boundary", lshProbability(1, 20, 5) === 1);
    record("lsh formula", close(lshProbability(0.5, 20, 5), 1 - Math.pow(1 - Math.pow(0.5, 5), 20), 1e-12));
    record("lsh clamps similarity low", lshProbability(-2, 20, 5) === 0);
    record("lsh clamps similarity high", lshProbability(2, 20, 5) === 1);
    record("more bands raise candidate probability", lshProbability(0.6, 30, 5) > lshProbability(0.6, 10, 5));
    record("more rows lower candidate probability", lshProbability(0.6, 20, 6) < lshProbability(0.6, 20, 3));

    function auditScenario(name, params) {
      var result = simulate(params);
      var trueMatchCount = result.matches.filter(Boolean).length;
      var trueBackgroundMatchCount = result.backgroundMatches.filter(Boolean).length;
      record(name + " rows ledger", result.rows === result.bands * result.rowsPerBand);
      record(name + " signature lengths", result.signatureA.length === result.rows && result.signatureB.length === result.rows);
      record(name + " estimate recomputes", close(result.estimate, signatureAgreement(result.signatureA, result.signatureB), 1e-12));
      record(name + " band length", result.matches.length === result.bands && result.backgroundMatches.length === result.bands);
      record(name + " candidate flag", result.candidate === (trueMatchCount > 0));
      record(name + " background candidate flag", result.backgroundCandidate === (trueBackgroundMatchCount > 0));
      record(name + " exact ledger closes", result.exact.union === result.exact.shared + result.exact.leftOnly + result.exact.rightOnly);
      record(name + " background ledger closes", result.background.union === result.background.shared + result.background.leftOnly + result.background.rightOnly);
      record(name + " exact probability", probability(result.exact.jaccard));
      record(name + " estimate probability", probability(result.estimate));
      record(name + " background probability", probability(result.background.jaccard) && probability(result.backgroundEstimate));
      record(name + " LSH probability formula", close(result.candidateProbability, lshProbability(result.exact.jaccard, result.bands, result.rowsPerBand), 1e-12));
      record(name + " background LSH formula", close(result.backgroundProbability, lshProbability(result.background.jaccard, result.bands, result.rowsPerBand), 1e-12));
      record(name + " threshold formula", close(result.threshold, Math.pow(1 / result.bands, 1 / result.rowsPerBand), 1e-12));
      record(name + " pair count formula", result.allPairs === result.corpus * (result.corpus - 1) / 2);
      record(name + " expected background formula", close(result.expectedBackgroundCandidates, result.allPairs * result.backgroundProbability, 1e-9));
      record(name + " synthetic estimate near exact", Math.abs(result.estimate - result.exact.jaccard) <= 0.16);
      return result;
    }

    var defaultCase = auditScenario("default", {
      bands: 20,
      boilerplate: 15,
      corpus: 2000,
      editRate: 16,
      rowsPerBand: 5,
      shingleSize: 4
    });
    record("default near pair becomes candidate", defaultCase.candidate);
    record("default background is filtered", !defaultCase.backgroundCandidate);

    var identical = auditScenario("identical", {
      bands: 20,
      boilerplate: 0,
      corpus: 2000,
      editRate: 0,
      rowsPerBand: 5,
      shingleSize: 4
    });
    record("identical exact one", identical.exact.jaccard === 1 && identical.estimate === 1 && identical.candidateProbability === 1);
    record("identical all bands match", identical.matches.every(Boolean));

    var dissimilar = auditScenario("dissimilar", {
      bands: 20,
      boilerplate: 0,
      corpus: 2000,
      editRate: 70,
      rowsPerBand: 5,
      shingleSize: 8
    });
    record("dissimilar exact zero", dissimilar.exact.jaccard === 0 && dissimilar.estimate === 0 && dissimilar.candidateProbability === 0);
    record("dissimilar no bands match", !dissimilar.matches.some(Boolean));

    var noBoiler = simulate({ bands: 20, boilerplate: 0, corpus: 2000, editRate: 20, rowsPerBand: 5, shingleSize: 3 });
    var withBoiler = simulate({ bands: 20, boilerplate: 60, corpus: 2000, editRate: 20, rowsPerBand: 5, shingleSize: 3 });
    record("boilerplate raises background resemblance", withBoiler.background.jaccard > noBoiler.background.jaccard);
    record("boilerplate raises background candidate probability", withBoiler.backgroundProbability > noBoiler.backgroundProbability);

    return {
      checked: checked,
      failures: failures,
      ok: failures.length === 0,
      passed: passed
    };
  }

  function cachedAudit() {
    if (!AUDIT_CACHE) AUDIT_CACHE = runAudit();
    return AUDIT_CACHE;
  }

  function panelTitle(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x, box.y);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x, box.y + 18);
    }
  }

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawSetPanel(ctx, result, box) {
    panelTitle(ctx, box, "Shingle sets", "exact overlap before sampling");
    var stats = result.exact;
    var bg = result.background;
    var plot = { x: box.x, y: box.y + 48, w: box.w, h: box.h - 64 };
    var segments = [
      { label: "shared", value: stats.shared, color: COLORS.shared },
      { label: "A only", value: stats.leftOnly, color: COLORS.leftOnly },
      { label: "B only", value: stats.rightOnly, color: COLORS.rightOnly }
    ];
    var x = plot.x;
    segments.forEach(function (seg) {
      var width = stats.union ? plot.w * seg.value / stats.union : 0;
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, plot.y, Math.max(0, width - 1), 28);
      x += width;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(formatPercent(stats.jaccard * 100), plot.x, plot.y + 54);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(stats.shared + " shared shingles over " + stats.union + " in the union", plot.x + 102, plot.y + 62);
    ctx.fillText("background Jaccard from shared boilerplate: " + formatPercent(bg.jaccard * 100), plot.x, plot.y + 96);

    var legendY = plot.y + 126;
    var legendX = plot.x;
    segments.forEach(function (seg) {
      ctx.fillStyle = seg.color;
      ctx.fillRect(legendX, legendY, 10, 10);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(seg.label + " " + seg.value, legendX + 15, legendY - 1);
      legendX += 96;
    });
  }

  function drawSignaturePanel(ctx, result, box) {
    panelTitle(ctx, box, "MinHash signature", "green cells are row collisions");
    var plot = { x: box.x, y: box.y + 44, w: box.w, h: box.h - 62 };
    var gap = 1;
    var cell = Math.min((plot.w - gap * (result.rowsPerBand - 1)) / result.rowsPerBand, (plot.h - gap * (result.bands - 1)) / result.bands);
    cell = Math.max(2, Math.min(22, cell));
    var gridW = result.rowsPerBand * cell + (result.rowsPerBand - 1) * gap;
    var gridH = result.bands * cell + (result.bands - 1) * gap;
    var startX = plot.x + (plot.w - gridW) / 2;
    var startY = plot.y;
    for (var b = 0; b < result.bands; b += 1) {
      var bandMatch = result.matches[b];
      for (var r = 0; r < result.rowsPerBand; r += 1) {
        var index = b * result.rowsPerBand + r;
        var same = result.signatureA[index] === result.signatureB[index];
        ctx.fillStyle = same ? COLORS.shared : COLORS.mismatch;
        ctx.fillRect(startX + r * (cell + gap), startY + b * (cell + gap), Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
      }
      if (bandMatch) {
        ctx.strokeStyle = COLORS.current;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX - 2, startY + b * (cell + gap) - 2, gridW + 4, cell + 4);
      }
    }
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(formatPercent(result.estimate * 100), plot.x, plot.y + plot.h - 32);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("signature agreement across " + result.rows + " rows", plot.x + 96, plot.y + plot.h - 26);
  }

  function drawCurvePanel(ctx, result, box) {
    panelTitle(ctx, box, "Banding curve", "candidate probability after OR over bands");
    var plot = { x: box.x + 42, y: box.y + 44, w: box.w - 58, h: box.h - 74 };
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.faint;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(function (tick) {
      var x = plot.x + tick * plot.w;
      var y = plot.y + plot.h - tick * plot.h;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
    });
    function xScale(s) { return plot.x + clamp(s, 0, 1) * plot.w; }
    function yScale(p) { return plot.y + plot.h - clamp(p, 0, 1) * plot.h; }
    ctx.strokeStyle = COLORS.shared;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var i = 0; i <= 120; i += 1) {
      var s = i / 120;
      var p = lshProbability(s, result.bands, result.rowsPerBand);
      if (i === 0) ctx.moveTo(xScale(s), yScale(p));
      else ctx.lineTo(xScale(s), yScale(p));
    }
    ctx.stroke();
    ctx.strokeStyle = COLORS.threshold;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xScale(result.threshold), plot.y);
    ctx.lineTo(xScale(result.threshold), plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);

    [
      { s: result.background.jaccard, p: result.backgroundProbability, color: COLORS.background },
      { s: result.exact.jaccard, p: result.candidateProbability, color: COLORS.current }
    ].forEach(function (point) {
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(xScale(point.s), yScale(point.p), 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), xScale(tick), plot.y + plot.h + 13);
    });
    ctx.textAlign = "right";
    [0, 0.5, 1].forEach(function (tick) {
      ctx.fillText(formatPercent(tick * 100), plot.x - 7, yScale(tick) + 4);
    });
    ctx.textAlign = "left";
  }

  function drawWorkPanel(ctx, result, box) {
    panelTitle(ctx, box, "Screening work", "what banding leaves for exact verification");
    var plot = { x: box.x, y: box.y + 50, w: box.w, h: box.h - 62 };
    var rows = [
      { label: "all pairs", value: result.allPairs, color: COLORS.rule },
      { label: "background candidates", value: result.expectedBackgroundCandidates, color: COLORS.background },
      { label: "near-pair probability", value: result.candidateProbability * result.allPairs, color: COLORS.current }
    ];
    var maxLog = Math.log10(result.allPairs + 1);
    rows.forEach(function (row, index) {
      var y = plot.y + index * 44;
      var width = plot.w * (Math.log10(row.value + 1) / Math.max(1, maxLog));
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 118, y, plot.w - 150, 20);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 118, y, Math.max(1, width * (plot.w - 150) / plot.w), 20);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 14);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(index === 2 ? formatPercent(result.candidateProbability * 100) : formatNumber(row.value), plot.x + plot.w, y + 14);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("bars use a log scale; exact checks still decide final duplicates", plot.x, plot.y + plot.h - 8);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 900 : 660;
    var ratio = global.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    var margin = compact ? 24 : 34;
    if (compact) {
      var panelW = width - margin * 2;
      drawSetPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 210 });
      drawSignaturePanel(ctx, result, { x: margin, y: 264, w: panelW, h: 234 });
      drawCurvePanel(ctx, result, { x: margin, y: 526, w: panelW, h: 202 });
      drawWorkPanel(ctx, result, { x: margin, y: 756, w: panelW, h: 126 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawSetPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 274 });
      drawSignaturePanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 274 });
      drawCurvePanel(ctx, result, { x: margin, y: 352, w: panelW2, h: 242 });
      drawWorkPanel(ctx, result, { x: margin + panelW2 + gap, y: 352, w: panelW2, h: 242 });
    }
  }

  function render(root) {
    var params = paramsFromRoot(root);
    var result = simulate(params);
    var audit = cachedAudit();
    var values = {
      bands: String(result.bands),
      boilerplate: formatPercent(params.boilerplate),
      corpus: Math.round(params.corpus).toLocaleString(),
      editRate: formatPercent(params.editRate),
      rowsPerBand: String(result.rowsPerBand),
      shingleSize: String(result.shingleSize)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Exact Jaccard", formatPercent(result.exact.jaccard * 100)),
        metric("MinHash estimate", formatPercent(result.estimate * 100)),
        metric("Signature rows", String(result.rows)),
        metric("Candidate chance", formatPercent(result.candidateProbability * 100)),
        metric("Background chance", formatPercent(result.backgroundProbability * 100)),
        metric("Sig bytes/doc", formatNumber(result.rows * 4) + " B"),
        metric("Audit", audit.passed + "/" + audit.checked)
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    if (root.__minhashLabReady) return;
    root.__minhashLabReady = true;
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-minhash-lab]")).forEach(init);
  }

  var api = {
    lshProbability: lshProbability,
    minhashSignature: minhashSignature,
    runAudit: runAudit,
    shingleSet: shingleSet,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MinHashLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
