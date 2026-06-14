(function (global) {
  "use strict";

  var DEPTH = 10;
  var ALLOWED = {
    lift: [0, 0.12, 0.22, 0.32],
    sessions: [300, 800, 1200, 3000],
    positionBias: [0.35, 0.72, 1.05],
    heterogeneity: [0.2, 0.75, 1.2],
    noise: [0.25, 0.42, 0.65],
    highlight: ["interleaving", "ab"]
  };

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d8e0e8",
    grid: "#edf2f7",
    panel: "#f8fafc",
    a: "#2563eb",
    b: "#0f766e",
    interleaving: "#0f766e",
    ab: "#7c3aed",
    win: "#0f766e",
    lose: "#be123c",
    tie: "#94a3b8",
    background: "#ffffff"
  };

  function nearest(value, allowed, fallback) {
    if (typeof allowed[0] === "string") {
      value = String(value == null ? fallback : value);
      return allowed.indexOf(value) >= 0 ? value : fallback;
    }
    var raw = Number(value);
    if (!isFinite(raw)) return fallback;
    var best = allowed[0];
    var bestDistance = Infinity;
    allowed.forEach(function (candidate) {
      var distance = Math.abs(candidate - raw);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    });
    return best == null ? fallback : best;
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      lift: nearest(raw.lift == null ? 0.22 : raw.lift, ALLOWED.lift, 0.22),
      sessions: nearest(raw.sessions == null ? 1200 : raw.sessions, ALLOWED.sessions, 1200),
      positionBias: nearest(raw.positionBias == null ? 0.72 : raw.positionBias, ALLOWED.positionBias, 0.72),
      heterogeneity: nearest(raw.heterogeneity == null ? 0.75 : raw.heterogeneity, ALLOWED.heterogeneity, 0.75),
      noise: nearest(raw.noise == null ? 0.42 : raw.noise, ALLOWED.noise, 0.42),
      highlight: nearest(raw.highlight == null ? "interleaving" : raw.highlight, ALLOWED.highlight, "interleaving")
    };
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x, 0x45d9f3b) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x45d9f3b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function makeQueries(params) {
    var queryCount = 320;
    var docCount = 18;
    var queries = [];

    for (var q = 0; q < queryCount; q += 1) {
      var intent = normal(q, 0xABC);
      var difficulty = 0.70 + 0.55 * sigmoid(normal(q, 0xDEF));
      var popularity = Math.pow(q + 1, -(0.65 + params.heterogeneity * 0.55));
      var docs = [];

      for (var d = 0; d < docCount; d += 1) {
        var topical = normal(q * 97 + d, 0x123);
        var relevance = sigmoid(1.05 * topical + 0.75 * intent + normal(q * 19 + d, 0x456) * 0.75 - 0.25);
        var freshness = sigmoid(normal(q * 43 + d, 0x789));
        var rankNoise = normal(q * 197 + d, 0x987) * params.noise;
        var aScore = relevance + 0.25 * freshness + rankNoise;
        var bScore = relevance
          + (1 - params.lift) * rankNoise
          + 0.25 * freshness * (1 - 0.45 * params.lift)
          + 0.18 * params.lift * relevance;
        docs.push({
          id: q + "-" + d,
          relevance: relevance,
          freshness: freshness,
          aScore: aScore,
          bScore: bScore
        });
      }

      queries.push({
        id: q,
        difficulty: difficulty,
        popularity: popularity,
        docs: docs
      });
    }

    var totalPopularity = queries.reduce(function (sum, query) {
      return sum + query.popularity;
    }, 0);
    var cumulative = 0;
    queries.forEach(function (query) {
      query.popularity /= totalPopularity;
      cumulative += query.popularity;
      query.cumulative = cumulative;
      query.rankA = query.docs.slice().sort(function (a, b) {
        return b.aScore - a.aScore;
      });
      query.rankB = query.docs.slice().sort(function (a, b) {
        return b.bScore - a.bScore;
      });
      query.ndcgA = ndcg(query.rankA, DEPTH);
      query.ndcgB = ndcg(query.rankB, DEPTH);
    });
    return queries;
  }

  function pickQuery(queries, session) {
    var u = uniform(session, 0xBEEF);
    for (var i = 0; i < queries.length; i += 1) {
      if (u <= queries[i].cumulative) return queries[i];
    }
    return queries[queries.length - 1];
  }

  function dcg(list, depth) {
    var total = 0;
    for (var i = 0; i < Math.min(depth, list.length); i += 1) {
      total += (Math.pow(2, list[i].relevance) - 1) / Math.log2(i + 2);
    }
    return total;
  }

  function ndcg(list, depth) {
    var ideal = list.slice().sort(function (a, b) {
      return b.relevance - a.relevance;
    });
    var best = dcg(ideal, depth);
    return best > 0 ? dcg(list, depth) / best : 0;
  }

  function clickList(query, list, session, params) {
    var clicks = [];
    var satisfied = false;
    var limit = Math.min(DEPTH, list.length);
    for (var pos = 0; pos < limit; pos += 1) {
      var doc = list[pos];
      var examination = Math.exp(-params.positionBias * pos) * (satisfied ? 0.35 : 1);
      var attraction = 0.02 + 0.84 * Math.pow(doc.relevance, 1.35);
      var probability = Math.min(0.98, examination * attraction * query.difficulty);
      if (uniform(session * 101 + pos * 17, 0xC11C) < probability) {
        clicks.push({ pos: pos, doc: doc });
        if (uniform(session * 103 + pos * 31, 0x5A7) < doc.relevance * 0.55) {
          satisfied = true;
        }
      }
    }
    return clicks;
  }

  function teamDraft(query, session) {
    var used = new Set();
    var list = [];
    var owner = [];
    var aIndex = 0;
    var bIndex = 0;

    while (list.length < DEPTH && (aIndex < query.rankA.length || bIndex < query.rankB.length)) {
      var first = uniform(session * 13 + list.length, 0x71D) < 0.5 ? "A" : "B";
      [first, first === "A" ? "B" : "A"].forEach(function (side) {
        var ranking = side === "A" ? query.rankA : query.rankB;
        var index = side === "A" ? aIndex : bIndex;
        while (index < ranking.length && used.has(ranking[index].id)) index += 1;
        if (side === "A") aIndex = index;
        else bIndex = index;

        if (index < ranking.length && list.length < DEPTH) {
          var doc = ranking[index];
          used.add(doc.id);
          list.push(doc);
          owner.push(side);
          if (side === "A") aIndex += 1;
          else bIndex += 1;
        }
      });
    }

    return { list: list, owner: owner };
  }

  function summarize(values) {
    var n = values.length;
    if (!n) return { n: 0, mean: 0, sd: 0, se: 0, z: 0 };
    var mean = values.reduce(function (sum, value) {
      return sum + value;
    }, 0) / n;
    var variance = values.reduce(function (sum, value) {
      return sum + Math.pow(value - mean, 2);
    }, 0) / Math.max(1, n - 1);
    var sd = Math.sqrt(variance);
    var se = sd / Math.sqrt(n);
    return { n: n, mean: mean, sd: sd, se: se, z: se > 0 ? mean / se : 0 };
  }

  function evaluateAb(aValues, bValues) {
    var a = summarize(aValues);
    var b = summarize(bValues);
    var diff = b.mean - a.mean;
    var se = Math.sqrt((a.sd * a.sd) / Math.max(1, a.n) + (b.sd * b.sd) / Math.max(1, b.n));
    return {
      a: a,
      b: b,
      diff: diff,
      se: se,
      z: se > 0 ? diff / se : 0
    };
  }

  function runExperiment(params, sessionCount) {
    var queries = makeQueries(params);
    var aClicks = [];
    var bClicks = [];
    var duelScores = [];
    var creditScores = [];
    var wins = 0;
    var losses = 0;
    var ties = 0;
    var ndcgA = 0;
    var ndcgB = 0;
    var weightedQueries = 0;
    var sampleInterleaving = null;

    queries.forEach(function (query) {
      ndcgA += query.ndcgA * query.popularity;
      ndcgB += query.ndcgB * query.popularity;
      weightedQueries += query.popularity;
    });
    ndcgA /= weightedQueries || 1;
    ndcgB /= weightedQueries || 1;

    for (var session = 0; session < sessionCount; session += 1) {
      var query = pickQuery(queries, session);
      var bucketB = session % 2 === 1;
      var shown = bucketB ? query.rankB : query.rankA;
      var observedClicks = clickList(query, shown, session, params).length;
      if (bucketB) bClicks.push(observedClicks);
      else aClicks.push(observedClicks);

      var interleaved = teamDraft(query, session + 99991);
      var interleavedClicks = clickList(query, interleaved.list, session + 31337, params);
      var aCredit = 0;
      var bCredit = 0;
      interleavedClicks.forEach(function (click) {
        if (interleaved.owner[click.pos] === "A") aCredit += 1;
        else bCredit += 1;
      });
      var credit = bCredit - aCredit;
      creditScores.push(credit);
      var duel = credit > 0 ? 1 : credit < 0 ? -1 : 0;
      duelScores.push(duel);
      if (duel > 0) wins += 1;
      else if (duel < 0) losses += 1;
      else ties += 1;

      if (!sampleInterleaving && session > 30 && interleavedClicks.length) {
        sampleInterleaving = {
          query: query.id,
          list: interleaved.list.map(function (doc, pos) {
            return {
              id: doc.id.split("-")[1],
              relevance: doc.relevance,
              owner: interleaved.owner[pos],
              clicked: interleavedClicks.some(function (click) {
                return click.pos === pos;
              })
            };
          })
        };
      }
    }

    return {
      sessions: sessionCount,
      ab: evaluateAb(aClicks, bClicks),
      interleaving: {
        preference: summarize(duelScores),
        credit: summarize(creditScores),
        wins: wins,
        losses: losses,
        ties: ties,
        decisive: wins + losses,
        winShare: (wins + losses) > 0 ? wins / (wins + losses) : 0.5
      },
      offline: {
        ndcgA: ndcgA,
        ndcgB: ndcgB,
        ndcgDiff: ndcgB - ndcgA
      },
      sampleInterleaving: sampleInterleaving
    };
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var result = runExperiment(params, params.sessions);
    var checkpoints = [150, 300, 800, 1200, 3000]
      .filter(function (n) { return n <= params.sessions; })
      .map(function (n) {
        var partial = runExperiment(params, n);
        return {
          sessions: n,
          abZ: partial.ab.z,
          interleavingZ: partial.interleaving.preference.z,
          abDiff: partial.ab.diff,
          winShare: partial.interleaving.winShare
        };
      });

    return {
      params: params,
      result: result,
      checkpoints: checkpoints,
      highlight: params.highlight === "ab" ? result.ab : result.interleaving
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function signed(value, digits) {
    return (value >= 0 ? "+" : "") + formatNumber(value, digits);
  }

  function metric(label, value, tone) {
    var klass = "interleaving-lab__metric";
    if (tone) klass += " interleaving-lab__metric--" + tone;
    return "<div class=\"" + klass + "\"><span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, data) {
    var result = data.result;
    var abZ = result.ab.z;
    var intZ = result.interleaving.preference.z;
    var ratio = Math.abs(abZ) > 0.1 ? Math.abs(intZ / abZ) : Infinity;
    var html = [
      metric("Offline NDCG lift", signed(result.offline.ndcgDiff * 100, 2) + " pts", result.offline.ndcgDiff > 0 ? "good" : "warn"),
      metric("A/B click delta", signed(result.ab.diff, 3) + " clicks", Math.abs(abZ) >= 2 ? "good" : "warn"),
      metric("A/B z-score", signed(abZ, 2), Math.abs(abZ) >= 2 ? "good" : "warn"),
      metric("Interleaving z-score", signed(intZ, 2), Math.abs(intZ) >= 2 ? "good" : "warn"),
      metric("B duel win share", formatPercent(result.interleaving.winShare), result.interleaving.winShare > 0.55 ? "good" : "warn"),
      metric("Decisive duels", String(result.interleaving.decisive)),
      metric("Sensitivity ratio", ratio === Infinity ? "large" : formatNumber(ratio, 1) + "x", ratio > 1.5 ? "good" : "warn"),
      metric("Tie sessions", formatPercent(result.interleaving.ties / result.sessions), "warn")
    ].join("");
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) metrics.innerHTML = html;
  }

  function paramsFromRoot(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function updateControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null) input.value = String(params[key]);
    });
  }

  function setFont(ctx, size, weight) {
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    setFont(ctx, size || 12, weight || 500);
    ctx.fillText(text, x, y);
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

  function panel(ctx, box, title) {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, title, box.x + 16, box.y + 22, COLORS.text, 13, 750);
  }

  function drawZChart(ctx, data, box) {
    panel(ctx, box, "Evidence accumulates differently");
    var points = data.checkpoints;
    var left = box.x + 48;
    var top = box.y + 52;
    var w = box.w - 80;
    var h = box.h - 92;
    var maxN = Math.max.apply(null, points.map(function (point) { return point.sessions; }));
    var maxZ = Math.max(2.5, points.reduce(function (m, point) {
      return Math.max(m, Math.abs(point.abZ), Math.abs(point.interleavingZ));
    }, 0));

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    [-2, 0, 2].forEach(function (z) {
      var y = top + h * (1 - (z + maxZ) / (2 * maxZ));
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + w, y);
      ctx.stroke();
      label(ctx, String(z), left - 10, y, COLORS.muted, 10, 550, "right");
    });

    function pointToXY(point, key) {
      return {
        x: left + w * point.sessions / maxN,
        y: top + h * (1 - (point[key] + maxZ) / (2 * maxZ))
      };
    }

    [
      ["abZ", COLORS.ab, "A/B"],
      ["interleavingZ", COLORS.interleaving, "interleaving"]
    ].forEach(function (series) {
      ctx.strokeStyle = series[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var xy = pointToXY(point, series[0]);
        if (index === 0) ctx.moveTo(xy.x, xy.y);
        else ctx.lineTo(xy.x, xy.y);
      });
      ctx.stroke();
      points.forEach(function (point) {
        var xy = pointToXY(point, series[0]);
        ctx.fillStyle = series[1];
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      var last = pointToXY(points[points.length - 1], series[0]);
      label(ctx, series[2], last.x - 8, last.y - 12, series[1], 11, 750, "right");
    });
    label(ctx, "sessions", left + w, box.y + box.h - 20, COLORS.muted, 10, 550, "right");
    label(ctx, "z", left - 28, top - 12, COLORS.muted, 10, 550, "left");
  }

  function drawDuel(ctx, data, box) {
    panel(ctx, box, "A single shared result page");
    var sample = data.result.sampleInterleaving;
    var list = sample ? sample.list : [];
    var left = box.x + 22;
    var top = box.y + 52;
    var rowH = 24;
    list.forEach(function (item, index) {
      var y = top + index * rowH;
      ctx.fillStyle = item.owner === "A" ? "rgba(37, 99, 235, 0.12)" : "rgba(15, 118, 110, 0.12)";
      roundRect(ctx, left, y - 9, box.w - 44, 18, 5);
      ctx.fill();
      label(ctx, String(index + 1), left + 12, y, COLORS.muted, 10, 600, "center");
      label(ctx, item.owner, left + 38, y, item.owner === "A" ? COLORS.a : COLORS.b, 12, 800, "center");
      label(ctx, "doc " + item.id, left + 68, y, COLORS.text, 11, 650);
      label(ctx, formatPercent(item.relevance, 0), left + 134, y, COLORS.muted, 10, 550);
      if (item.clicked) {
        ctx.fillStyle = COLORS.win;
        ctx.beginPath();
        ctx.arc(box.x + box.w - 34, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    label(ctx, "dot = clicked", box.x + box.w - 22, box.y + box.h - 20, COLORS.muted, 10, 550, "right");
  }

  function drawOutcomeBars(ctx, data, box) {
    panel(ctx, box, "Same users, different estimands");
    var result = data.result;
    var rows = [
      { label: "A/B delta", value: result.ab.diff, color: COLORS.ab, text: signed(result.ab.diff, 3) + " clicks" },
      { label: "Duel mean", value: result.interleaving.preference.mean, color: COLORS.interleaving, text: signed(result.interleaving.preference.mean, 3) },
      { label: "B wins", value: result.interleaving.winShare - 0.5, color: COLORS.b, text: formatPercent(result.interleaving.winShare) },
      { label: "NDCG lift", value: result.offline.ndcgDiff, color: COLORS.a, text: signed(result.offline.ndcgDiff * 100, 2) + " pts" }
    ];
    var maxAbs = rows.reduce(function (maxValue, row) {
      return Math.max(maxValue, Math.abs(row.value));
    }, 0.001);
    var left = box.x + 118;
    var mid = box.x + box.w / 2 + 40;
    var top = box.y + 58;
    var maxW = box.w - 190;

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(mid, top - 18);
    ctx.lineTo(mid, box.y + box.h - 24);
    ctx.stroke();
    rows.forEach(function (row, index) {
      var y = top + index * 42;
      label(ctx, row.label, box.x + 18, y, COLORS.text, 12, 700);
      var w = Math.abs(row.value) / maxAbs * (maxW / 2);
      var x = row.value >= 0 ? mid : mid - w;
      ctx.fillStyle = row.value >= 0 ? row.color : COLORS.lose;
      roundRect(ctx, x, y - 8, w, 16, 6);
      ctx.fill();
      label(ctx, row.text, row.value >= 0 ? x + w + 8 : x - 8, y, COLORS.muted, 11, 650, row.value >= 0 ? "left" : "right");
    });
  }

  function drawWinTally(ctx, data, box) {
    panel(ctx, box, "Duel accounting");
    var result = data.result.interleaving;
    var total = Math.max(1, result.wins + result.losses + result.ties);
    var segments = [
      { label: "B wins", value: result.wins, color: COLORS.win },
      { label: "A wins", value: result.losses, color: COLORS.lose },
      { label: "ties", value: result.ties, color: COLORS.tie }
    ];
    var x = box.x + 26;
    var y = box.y + 68;
    var w = box.w - 52;
    var offset = 0;
    segments.forEach(function (segment) {
      var sw = w * segment.value / total;
      ctx.fillStyle = segment.color;
      roundRect(ctx, x + offset, y, sw, 22, 8);
      ctx.fill();
      offset += sw;
    });
    segments.forEach(function (segment, index) {
      var ly = y + 52 + index * 28;
      ctx.fillStyle = segment.color;
      ctx.beginPath();
      ctx.arc(x + 8, ly, 5, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, segment.label, x + 22, ly, COLORS.text, 12, 700);
      label(ctx, String(segment.value), box.x + box.w - 28, ly, COLORS.muted, 12, 650, "right");
    });
  }

  function drawLab(canvas, data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawZChart(ctx, data, { x: 18, y: 18, w: 540, h: 280 });
    drawDuel(ctx, data, { x: 578, y: 18, w: 304, h: 280 });
    drawOutcomeBars(ctx, data, { x: 18, y: 318, w: 540, h: 224 });
    drawWinTally(ctx, data, { x: 578, y: 318, w: 304, h: 224 });
    label(
      ctx,
      "click model: position-biased examination, relevance-dependent attraction, deterministic finite sample",
      32,
      674,
      COLORS.muted,
      11,
      550
    );
  }

  function init(root) {
    if (root.__interleavingDuelInitialized) return;
    root.__interleavingDuelInitialized = true;
    var canvas = root.querySelector("[data-canvas]");
    var scheduled = false;

    function render() {
      scheduled = false;
      var data = simulate(paramsFromRoot(root));
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
    cleanParams: cleanParams,
    simulate: simulate,
    makeQueries: makeQueries,
    teamDraft: teamDraft,
    clickList: clickList
  };

  global.InterleavingDuelLab = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.document) {
    var boot = function () {
      global.document.querySelectorAll("[data-interleaving-duel-lab]").forEach(init);
    };
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
