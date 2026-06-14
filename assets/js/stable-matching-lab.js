(function (root) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    student: "#0f766e",
    program: "#7c3aed",
    random: "#b45309",
    bad: "#be123c",
    blue: "#2563eb",
    gray: "#64748b"
  };

  var DEFAULTS = {
    agents: 14,
    common: 30,
    mutual: 30,
    seed: 20,
    trials: 30
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32((index + 1) | 0, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2 + 1, seed));
    var u2 = uniform(index * 2 + 2, seed ^ 0x9e3779b9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    var places = digits == null ? 2 : digits;
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(places);
  }

  function metric(label, value) {
    return '<div class="stable-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      agents: clamp(Math.round(raw.agents == null ? DEFAULTS.agents : raw.agents), 6, 32),
      common: clamp(Number(raw.common == null ? DEFAULTS.common : raw.common), 0, 100),
      mutual: clamp(Number(raw.mutual == null ? DEFAULTS.mutual : raw.mutual), 0, 100),
      seed: clamp(Math.round(raw.seed == null ? DEFAULTS.seed : raw.seed), 1, 999),
      trials: clamp(Math.round(raw.trials == null ? DEFAULTS.trials : raw.trials), 6, 80)
    };
  }

  function readState(container, previous) {
    var raw = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = Number(input.value);
    });
    return cleanParams(raw);
  }

  function updateOutputs(container, params) {
    var display = {
      agents: String(params.agents),
      common: Math.round(params.common) + "%",
      mutual: Math.round(params.mutual) + "%",
      seed: String(params.seed),
      trials: String(params.trials)
    };
    Object.keys(display).forEach(function (key) {
      container.querySelectorAll('[data-value="' + key + '"]').forEach(function (output) {
        output.textContent = display[key];
      });
    });
  }

  function sortedOrder(values) {
    return values.map(function (value, index) {
      return { index: index, value: value };
    }).sort(function (a, b) {
      if (b.value !== a.value) return b.value - a.value;
      return a.index - b.index;
    }).map(function (item) {
      return item.index;
    });
  }

  function rankFromPreference(pref, n) {
    var rank = new Array(n);
    for (var i = 0; i < n; i += 1) rank[i] = 0;
    for (var r = 0; r < pref.length; r += 1) rank[pref[r]] = r;
    return rank;
  }

  function makeMarket(rawParams) {
    var params = cleanParams(rawParams);
    var n = params.agents;
    var common = params.common / 100;
    var mutual = params.mutual / 100;
    var idiosyncratic = Math.max(0.22, 1.18 - 0.72 * common - 0.45 * mutual);
    var seed = params.seed * 1000003 + n * 9176 + Math.round(params.common) * 131 + Math.round(params.mutual) * 17;
    var studentQuality = [];
    var programQuality = [];
    var prefS = [];
    var prefP = [];
    var rankS = [];
    var rankP = [];
    var studentUtility = [];
    var programUtility = [];
    var i;
    var j;

    for (i = 0; i < n; i += 1) studentQuality.push(normal(10000 + i * 19, seed ^ 0xa511e9b3));
    for (j = 0; j < n; j += 1) programQuality.push(normal(20000 + j * 23, seed ^ 0x63d83595));

    for (i = 0; i < n; i += 1) {
      var sScores = [];
      var pScores = [];
      for (j = 0; j < n; j += 1) {
        var pairKey = 40000 + i * 1009 + j * 9173;
        var sharedFit = normal(pairKey, seed ^ 0x4754ab35);
        var studentNoise = normal(pairKey + 137, seed ^ 0x3c6ef372);
        var programNoise = normal(pairKey + 271, seed ^ 0xbb67ae85);
        var sValue = common * programQuality[j] + mutual * sharedFit + idiosyncratic * studentNoise;
        var pValue = common * studentQuality[i] + mutual * sharedFit + idiosyncratic * programNoise;
        sScores[j] = sValue;
        pScores[j] = pValue;
      }
      studentUtility.push(sScores);
      programUtility.push(pScores);
      prefS.push(sortedOrder(sScores));
    }

    for (j = 0; j < n; j += 1) {
      var programScores = [];
      for (i = 0; i < n; i += 1) programScores.push(programUtility[i][j]);
      prefP.push(sortedOrder(programScores));
    }

    for (i = 0; i < n; i += 1) rankS.push(rankFromPreference(prefS[i], n));
    for (j = 0; j < n; j += 1) rankP.push(rankFromPreference(prefP[j], n));

    return {
      idiosyncratic: idiosyncratic,
      n: n,
      params: params,
      prefP: prefP,
      prefS: prefS,
      programQuality: programQuality,
      programUtility: programUtility,
      rankP: rankP,
      rankS: rankS,
      studentQuality: studentQuality,
      studentUtility: studentUtility
    };
  }

  function deferredAcceptance(market, proposerSide) {
    var n = market.n;
    var proposeStudents = proposerSide !== "program";
    var proposerPrefs = proposeStudents ? market.prefS : market.prefP;
    var receiverRanks = proposeStudents ? market.rankP : market.rankS;
    var next = new Array(n).fill(0);
    var proposerMatch = new Array(n).fill(-1);
    var receiverMatch = new Array(n).fill(-1);
    var free = [];
    var proposals = [];
    var rounds = 0;
    var i;

    for (i = 0; i < n; i += 1) free.push(i);

    while (free.length) {
      var current = free;
      free = [];
      rounds += 1;

      for (i = 0; i < current.length; i += 1) {
        var proposer = current[i];
        if (next[proposer] >= n) continue;
        var receiver = proposerPrefs[proposer][next[proposer]];
        next[proposer] += 1;

        var incumbent = receiverMatch[receiver];
        var accepted = incumbent === -1 || receiverRanks[receiver][proposer] < receiverRanks[receiver][incumbent];
        var replaced = -1;

        if (accepted) {
          receiverMatch[receiver] = proposer;
          proposerMatch[proposer] = receiver;
          if (incumbent !== -1) {
            proposerMatch[incumbent] = -1;
            free.push(incumbent);
            replaced = incumbent;
          }
        } else {
          free.push(proposer);
        }

        proposals.push({
          accepted: accepted,
          from: proposer,
          replaced: replaced,
          round: rounds,
          to: receiver
        });
      }
    }

    var matchS = new Array(n).fill(-1);
    var matchP = new Array(n).fill(-1);
    if (proposeStudents) {
      matchS = proposerMatch.slice();
      matchP = receiverMatch.slice();
    } else {
      matchP = proposerMatch.slice();
      matchS = receiverMatch.slice();
    }

    return {
      matchP: matchP,
      matchS: matchS,
      proposals: proposals,
      proposerSide: proposeStudents ? "student" : "program",
      rounds: rounds
    };
  }

  function shuffledPermutation(n, seed) {
    var values = [];
    for (var i = 0; i < n; i += 1) values.push(i);
    for (var j = n - 1; j > 0; j -= 1) {
      var k = Math.floor(uniform(j * 991 + 17, seed ^ 0x125aa2d5) * (j + 1));
      var tmp = values[j];
      values[j] = values[k];
      values[k] = tmp;
    }
    return values;
  }

  function randomMatching(market, seedOffset) {
    var n = market.n;
    var perm = shuffledPermutation(n, market.params.seed * 8191 + n * 97 + (seedOffset || 0));
    var matchS = new Array(n);
    var matchP = new Array(n);
    for (var i = 0; i < n; i += 1) {
      matchS[i] = perm[i];
      matchP[perm[i]] = i;
    }
    return { matchP: matchP, matchS: matchS, proposals: [], proposerSide: "random", rounds: 0 };
  }

  function blockingPairs(market, matchS, matchP, limit) {
    var pairs = [];
    var count = 0;
    for (var s = 0; s < market.n; s += 1) {
      var currentP = matchS[s];
      for (var r = 0; r < market.rankS[s][currentP]; r += 1) {
        var p = market.prefS[s][r];
        var currentS = matchP[p];
        if (market.rankP[p][s] < market.rankP[p][currentS]) {
          count += 1;
          if (!limit || pairs.length < limit) pairs.push({ program: p, student: s });
        }
      }
    }
    return { count: count, pairs: pairs };
  }

  function rankStats(market, matchS, matchP) {
    var n = market.n;
    var totalS = 0;
    var totalP = 0;
    var worstS = 0;
    var worstP = 0;
    var topS = 0;
    var topP = 0;
    for (var s = 0; s < n; s += 1) {
      var sr = market.rankS[s][matchS[s]] + 1;
      totalS += sr;
      worstS = Math.max(worstS, sr);
      if (sr === 1) topS += 1;
    }
    for (var p = 0; p < n; p += 1) {
      var pr = market.rankP[p][matchP[p]] + 1;
      totalP += pr;
      worstP = Math.max(worstP, pr);
      if (pr === 1) topP += 1;
    }
    return {
      avgP: totalP / n,
      avgS: totalS / n,
      topP: topP,
      topS: topS,
      worstP: worstP,
      worstS: worstS
    };
  }

  function summarizeMatching(market, matching) {
    var blocking = blockingPairs(market, matching.matchS, matching.matchP, 80);
    var ranks = rankStats(market, matching.matchS, matching.matchP);
    return Object.assign({}, matching, {
      blocking: blocking,
      ranks: ranks
    });
  }

  function evaluateOnce(rawParams, seedOffset) {
    var params = cleanParams(rawParams);
    params.seed += seedOffset || 0;
    var market = makeMarket(params);
    return {
      market: market,
      random: summarizeMatching(market, randomMatching(market, seedOffset || 0)),
      programDA: summarizeMatching(market, deferredAcceptance(market, "program")),
      studentDA: summarizeMatching(market, deferredAcceptance(market, "student"))
    };
  }

  function aggregateTrials(params) {
    var trials = params.trials;
    var totals = {
      randomBlocking: 0,
      programGain: 0,
      proposals: 0,
      stableBlocking: 0,
      studentGain: 0,
      studentRank: 0,
      programRank: 0
    };

    for (var t = 0; t < trials; t += 1) {
      var result = evaluateOnce(params, t * 29 + 1);
      totals.randomBlocking += result.random.blocking.count;
      totals.stableBlocking += result.studentDA.blocking.count + result.programDA.blocking.count;
      totals.proposals += result.studentDA.proposals.length;
      totals.studentRank += result.studentDA.ranks.avgS;
      totals.programRank += result.studentDA.ranks.avgP;
      totals.studentGain += result.programDA.ranks.avgS - result.studentDA.ranks.avgS;
      totals.programGain += result.studentDA.ranks.avgP - result.programDA.ranks.avgP;
    }

    Object.keys(totals).forEach(function (key) {
      totals[key] /= trials;
    });
    return totals;
  }

  function sweepCommon(params) {
    var points = [];
    var values = [0, 20, 40, 60, 80, 100];
    var baseTrials = Math.max(6, Math.round(params.trials / 2));
    for (var i = 0; i < values.length; i += 1) {
      var next = Object.assign({}, params, { common: values[i], trials: baseTrials, seed: params.seed + i * 11 });
      var totals = aggregateTrials(next);
      points.push({
        common: values[i],
        randomBlocking: totals.randomBlocking,
        sideGap: Math.max(0, totals.studentGain + totals.programGain),
        stableBlocking: totals.stableBlocking
      });
    }
    return points;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var current = evaluateOnce(params, 0);
    return Object.assign(current, {
      params: params,
      sweep: sweepCommon(params),
      trials: aggregateTrials(params)
    });
  }

  function prepareCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || canvas.parentNode.clientWidth || 720);
    var height = width < 680 ? 780 : 560;
    var ratio = root.devicePixelRatio || 1;
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawText(ctx, title, x + 14, y + 24, 13, COLORS.text, 750);
    if (subtitle) drawText(ctx, subtitle, x + 14, y + 42, 11, COLORS.muted, 550);
  }

  function drawMatrix(ctx, result, x, y, w, h) {
    var market = result.market;
    var n = market.n;
    var top = y + 56;
    var left = x + 42;
    var grid = Math.min(w - 56, h - 72);
    var cell = grid / n;
    var blocking = {};
    result.random.blocking.pairs.slice(0, 90).forEach(function (pair) {
      blocking[pair.student + ":" + pair.program] = true;
    });

    drawPanel(ctx, x, y, w, h, "preference grid", "student-proposing match; red dots block a random pairing");
    for (var s = 0; s < n; s += 1) {
      for (var p = 0; p < n; p += 1) {
        var desirability = 1 - (market.rankS[s][p] + market.rankP[p][s]) / (2 * Math.max(1, n - 1));
        var light = Math.round(246 - 42 * desirability);
        ctx.fillStyle = "rgb(" + light + "," + Math.round(light + 4) + "," + Math.round(light + 8) + ")";
        ctx.fillRect(left + p * cell, top + s * cell, Math.max(1, cell - 0.5), Math.max(1, cell - 0.5));
        if (result.studentDA.matchS[s] === p) {
          ctx.fillStyle = COLORS.student;
          ctx.fillRect(left + p * cell + cell * 0.18, top + s * cell + cell * 0.18, cell * 0.64, cell * 0.64);
        } else if (result.programDA.matchS[s] === p) {
          ctx.strokeStyle = COLORS.program;
          ctx.lineWidth = Math.max(1.4, cell * 0.11);
          ctx.strokeRect(left + p * cell + cell * 0.22, top + s * cell + cell * 0.22, cell * 0.56, cell * 0.56);
        }
        if (blocking[s + ":" + p]) {
          ctx.fillStyle = COLORS.bad;
          ctx.beginPath();
          ctx.arc(left + (p + 0.5) * cell, top + (s + 0.5) * cell, Math.max(1.5, cell * 0.18), 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(left, top, grid, grid);
    drawText(ctx, "programs", left + grid / 2, top - 8, 10, COLORS.muted, 650, "center");
    ctx.save();
    ctx.translate(left - 20, top + grid / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, "students", 0, 0, 10, COLORS.muted, 650, "center");
    ctx.restore();
  }

  function drawProposalBars(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "deferred acceptance trace", "how many proposals each student needed");
    var n = result.market.n;
    var counts = new Array(n).fill(0);
    result.studentDA.proposals.forEach(function (proposal) {
      counts[proposal.from] += 1;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    var left = x + 36;
    var right = x + w - 18;
    var top = y + 60;
    var bottom = y + h - 36;
    var bw = (right - left) / n;

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    for (var i = 0; i < n; i += 1) {
      var bh = (bottom - top) * counts[i] / maxCount;
      ctx.fillStyle = i % 2 ? COLORS.blue : COLORS.student;
      ctx.fillRect(left + i * bw + Math.max(1, bw * 0.15), bottom - bh, Math.max(2, bw * 0.7), bh);
    }

    drawText(ctx, String(maxCount), left - 8, top + 4, 10, COLORS.muted, 600, "right");
    drawText(ctx, "1", left - 8, bottom, 10, COLORS.muted, 600, "right");
    drawText(ctx, result.studentDA.proposals.length + " proposals in " + result.studentDA.rounds + " rounds", left, y + h - 12, 11, COLORS.text, 700);
  }

  function drawRankLedger(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "rank ledger", "lower average rank is better");
    var rows = [
      { color: COLORS.student, label: "students propose", stats: result.studentDA.ranks },
      { color: COLORS.program, label: "programs propose", stats: result.programDA.ranks },
      { color: COLORS.random, label: "random pairing", stats: result.random.ranks }
    ];
    var left = x + 112;
    var right = x + w - 22;
    var top = y + 64;
    var rowH = Math.max(34, (h - 94) / rows.length);
    var scale = result.market.n;

    for (var i = 0; i < rows.length; i += 1) {
      var yy = top + i * rowH;
      drawText(ctx, rows[i].label, x + 14, yy + 15, 11, COLORS.text, 700);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left, yy, right - left, 9);
      ctx.fillRect(left, yy + 16, right - left, 9);
      ctx.fillStyle = COLORS.student;
      ctx.fillRect(left, yy, (right - left) * rows[i].stats.avgS / scale, 9);
      ctx.fillStyle = COLORS.program;
      ctx.fillRect(left, yy + 16, (right - left) * rows[i].stats.avgP / scale, 9);
      drawText(ctx, "S " + formatNumber(rows[i].stats.avgS, 2), right, yy + 9, 10, COLORS.student, 700, "right");
      drawText(ctx, "P " + formatNumber(rows[i].stats.avgP, 2), right, yy + 25, 10, COLORS.program, 700, "right");
    }
  }

  function drawSweep(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "market texture sweep", "averaged across seeds as shared prestige changes");
    var points = result.sweep;
    var left = x + 42;
    var right = x + w - 22;
    var top = y + 62;
    var bottom = y + h - 38;
    var maxBlocking = Math.max.apply(null, points.map(function (p) { return p.randomBlocking; }).concat([1]));
    var maxGap = Math.max.apply(null, points.map(function (p) { return p.sideGap; }).concat([1]));

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, top);
    ctx.stroke();

    function px(point) {
      return left + (right - left) * point.common / 100;
    }

    function pyBlocking(point) {
      return bottom - (bottom - top) * point.randomBlocking / maxBlocking;
    }

    function pyGap(point) {
      return bottom - (bottom - top) * point.sideGap / maxGap;
    }

    function line(color, projector) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var xx = px(point);
        var yy = projector(point);
        if (index === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.stroke();
      points.forEach(function (point) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px(point), projector(point), 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    line(COLORS.bad, pyBlocking);
    line(COLORS.blue, pyGap);
    drawText(ctx, "0%", left, bottom + 18, 10, COLORS.muted, 600, "center");
    drawText(ctx, "100%", right, bottom + 18, 10, COLORS.muted, 600, "center");
    drawText(ctx, "random blocking", left + 4, top - 8, 10, COLORS.bad, 750);
    drawText(ctx, "side gap", right, top - 8, 10, COLORS.blue, 750, "right");
  }

  function draw(result, canvas) {
    var prepared = prepareCanvas(canvas);
    if (!prepared) return;
    var ctx = prepared.ctx;
    var width = prepared.width;
    var height = prepared.height;
    var pad = 14;
    var gap = 14;

    if (width < 680) {
      var panelH = (height - pad * 2 - gap * 3) / 4;
      drawMatrix(ctx, result, pad, pad, width - pad * 2, panelH);
      drawProposalBars(ctx, result, pad, pad + panelH + gap, width - pad * 2, panelH);
      drawRankLedger(ctx, result, pad, pad + 2 * (panelH + gap), width - pad * 2, panelH);
      drawSweep(ctx, result, pad, pad + 3 * (panelH + gap), width - pad * 2, panelH);
      return;
    }

    var halfW = (width - pad * 2 - gap) / 2;
    var halfH = (height - pad * 2 - gap) / 2;
    drawMatrix(ctx, result, pad, pad, halfW, halfH);
    drawProposalBars(ctx, result, pad + halfW + gap, pad, halfW, halfH);
    drawRankLedger(ctx, result, pad, pad + halfH + gap, halfW, halfH);
    drawSweep(ctx, result, pad + halfW + gap, pad + halfH + gap, halfW, halfH);
  }

  function updateMetrics(metrics, result) {
    var studentGain = result.programDA.ranks.avgS - result.studentDA.ranks.avgS;
    var programGain = result.studentDA.ranks.avgP - result.programDA.ranks.avgP;
    metrics.innerHTML = [
      metric("stable blocking pairs", String(result.studentDA.blocking.count)),
      metric("random blocking pairs", String(result.random.blocking.count)),
      metric("student avg rank", formatNumber(result.studentDA.ranks.avgS, 2)),
      metric("program avg rank", formatNumber(result.studentDA.ranks.avgP, 2)),
      metric("student proposer gain", formatNumber(studentGain, 2) + " ranks"),
      metric("program proposer gain", formatNumber(programGain, 2) + " ranks"),
      metric("student proposals", String(result.studentDA.proposals.length)),
      metric("trial avg random blocks", formatNumber(result.trials.randomBlocking, 1))
    ].join("");
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS);
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var latest = null;
    var timer = null;

    function renderNow() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      draw(latest, canvas);
    }

    function render() {
      clearTimeout(timer);
      timer = setTimeout(renderNow, 20);
    }

    container.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", render);
      input.addEventListener("change", render);
    });

    if (root.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      root.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    renderNow();
  }

  function init() {
    var labs = document.querySelectorAll("[data-stable-matching-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    blockingPairs: blockingPairs,
    cleanParams: cleanParams,
    deferredAcceptance: deferredAcceptance,
    evaluate: evaluate,
    evaluateOnce: evaluateOnce,
    makeMarket: makeMarket,
    randomMatching: randomMatching,
    rankStats: rankStats
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StableMatchingLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
