(function () {
  "use strict";

  var POLICIES = [
    { id: "sliding", label: "sliding window", color: "#2563eb" },
    { id: "sink", label: "sink + window", color: "#0f766e" },
    { id: "heavy", label: "heavy + recent", color: "#b45309" },
    { id: "snap", label: "observe + window", color: "#7c3aed" }
  ];

  var SCENARIOS = [
    {
      id: "chat",
      label: "streaming chat",
      promptLen: 280,
      genLen: 150,
      factCount: 7,
      sinkMass: 0.12,
      factMass: 0.25,
      recencyMass: 0.52,
      queryEvery: 13,
      querySpan: 7
    },
    {
      id: "needle",
      label: "needle QA",
      promptLen: 430,
      genLen: 120,
      factCount: 5,
      sinkMass: 0.09,
      factMass: 0.43,
      recencyMass: 0.38,
      queryEvery: 9,
      querySpan: 6
    },
    {
      id: "topic",
      label: "topic drift",
      promptLen: 360,
      genLen: 150,
      factCount: 9,
      sinkMass: 0.10,
      factMass: 0.34,
      recencyMass: 0.43,
      queryEvery: 11,
      querySpan: 8
    },
    {
      id: "flat",
      label: "diffuse attention",
      promptLen: 300,
      genLen: 130,
      factCount: 6,
      sinkMass: 0.03,
      factMass: 0.09,
      recencyMass: 0.42,
      queryEvery: 19,
      querySpan: 4
    }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    panel: "#f8fafc",
    sink: "#f59e0b",
    fact: "#be123c",
    recent: "#2563eb",
    generated: "#64748b",
    attention: "#94a3b8",
    miss: "#ef4444"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function scenarioByIndex(index) {
    return SCENARIOS[clamp(Math.round(index), 0, SCENARIOS.length - 1)];
  }

  function defaultParams(input) {
    var params = {
      budget: 96,
      halfLife: 28,
      scenario: 0,
      seed: 17,
      sinkKeep: 4,
      topicPressure: 70,
      viewStep: 56
    };
    if (input) {
      Object.keys(input).forEach(function (key) {
        params[key] = input[key];
      });
    }
    params.budget = Math.round(clamp(Number(params.budget), 24, 180));
    params.halfLife = clamp(Number(params.halfLife), 8, 80);
    params.scenario = Math.round(clamp(Number(params.scenario), 0, SCENARIOS.length - 1));
    params.seed = Math.round(clamp(Number(params.seed), 1, 999));
    params.sinkKeep = Math.round(clamp(Number(params.sinkKeep), 0, 8));
    params.topicPressure = clamp(Number(params.topicPressure), 0, 100);
    params.viewStep = clamp(Number(params.viewStep), 0, 100);
    return params;
  }

  function makeWorld(paramsInput) {
    var params = defaultParams(paramsInput);
    var profile = scenarioByIndex(params.scenario);
    var random = rng(params.seed * 2654435761 ^ params.scenario * 1013904223);
    var facts = [];
    var used = {};
    for (var i = 0; i < profile.factCount; i += 1) {
      var base = 0.13 + (i + 0.5) * 0.72 / profile.factCount;
      var jitter = (random() - 0.5) * 0.045;
      var pos = Math.round(clamp((base + jitter) * profile.promptLen, params.sinkKeep + 10, profile.promptLen - 44));
      while (used[pos]) pos += 1;
      used[pos] = true;
      facts.push({ id: i, pos: pos, label: "F" + (i + 1) });
    }
    facts.sort(function (a, b) { return a.pos - b.pos; });
    return {
      facts: facts,
      genLen: profile.genLen,
      params: params,
      profile: profile,
      promptLen: profile.promptLen,
      totalLen: profile.promptLen + profile.genLen
    };
  }

  function activeFact(world, absT) {
    var profile = world.profile;
    var step = absT - world.promptLen;
    var observation = 36;
    if (absT >= world.promptLen - observation && absT < world.promptLen) {
      var obsStep = absT - (world.promptLen - observation);
      return world.facts[obsStep % world.facts.length];
    }
    if (step < 0) return null;
    var phase = ((step + world.params.seed) % profile.queryEvery + profile.queryEvery) % profile.queryEvery;
    if (phase >= profile.querySpan) return null;
    var drift = profile.id === "topic" ? Math.floor(step / 37) : 0;
    return world.facts[(Math.floor(step / profile.queryEvery) + drift + world.params.seed) % world.facts.length];
  }

  function normalize(weights) {
    var sum = weights.reduce(function (acc, value) { return acc + value; }, 0);
    if (sum <= 0) return weights;
    for (var i = 0; i < weights.length; i += 1) weights[i] /= sum;
    return weights;
  }

  function attentionAt(world, absT) {
    var n = absT;
    var weights = new Array(n);
    for (var i = 0; i < n; i += 1) weights[i] = 0;
    if (n <= 0) return { active: null, weights: weights };

    var profile = world.profile;
    var params = world.params;
    var topicScale = params.topicPressure / 70;
    var active = activeFact(world, absT);
    var factMass = active ? clamp(profile.factMass * topicScale, 0, 0.68) : profile.factMass * 0.12 * topicScale;
    var sinkMass = profile.sinkMass;
    var recencyMass = profile.recencyMass;
    if (profile.id === "flat") {
      sinkMass *= 0.6;
      recencyMass *= 0.85;
    }
    var reserved = clamp(sinkMass + recencyMass + factMass, 0.12, 0.92);
    var background = 1 - reserved;

    var sinkCount = Math.min(params.sinkKeep, n);
    if (sinkCount > 0 && sinkMass > 0) {
      for (var s = 0; s < sinkCount; s += 1) {
        weights[s] += sinkMass / sinkCount * (1 + 0.18 * (sinkCount - s) / sinkCount);
      }
    }

    var recencySum = 0;
    var start = Math.max(0, n - 140);
    for (var r = start; r < n; r += 1) {
      recencySum += Math.exp(-(n - 1 - r) / params.halfLife);
    }
    if (recencySum > 0) {
      for (var rr = start; rr < n; rr += 1) {
        weights[rr] += recencyMass * Math.exp(-(n - 1 - rr) / params.halfLife) / recencySum;
      }
    }

    if (factMass > 0) {
      var targets = active ? [active] : world.facts;
      var factNorm = 0;
      targets.forEach(function (fact) {
        for (var d = -2; d <= 2; d += 1) {
          var pos = fact.pos + d;
          if (pos >= 0 && pos < n) factNorm += Math.exp(-0.5 * d * d);
        }
      });
      if (factNorm > 0) {
        targets.forEach(function (fact) {
          for (var d = -2; d <= 2; d += 1) {
            var pos = fact.pos + d;
            if (pos >= 0 && pos < n) weights[pos] += factMass * Math.exp(-0.5 * d * d) / factNorm;
          }
        });
      }
    }

    for (var b = 0; b < n; b += 1) weights[b] += background / n;
    return { active: active, weights: normalize(weights) };
  }

  function topByScore(candidates, scores, limit, protectedSet) {
    var protectedCount = protectedSet ? protectedSet.size : 0;
    if (limit <= protectedCount) {
      return candidates.filter(function (pos) {
        return protectedSet && protectedSet.has(pos);
      }).slice(0, limit);
    }
    var picked = [];
    if (protectedSet) {
      candidates.forEach(function (pos) {
        if (protectedSet.has(pos)) picked.push(pos);
      });
    }
    candidates.filter(function (pos) {
      return !protectedSet || !protectedSet.has(pos);
    }).sort(function (a, b) {
      var d = (scores[b] || 0) - (scores[a] || 0);
      return Math.abs(d) > 1e-12 ? d : b - a;
    }).slice(0, Math.max(0, limit - picked.length)).forEach(function (pos) {
      picked.push(pos);
    });
    return picked;
  }

  function latestPositions(maxExclusive, count, exclude) {
    var out = [];
    for (var pos = maxExclusive - 1; pos >= 0 && out.length < count; pos -= 1) {
      if (!exclude || !exclude.has(pos)) out.push(pos);
    }
    return out;
  }

  function setFrom(items) {
    var set = new Set();
    items.forEach(function (item) { set.add(item); });
    return set;
  }

  function observationScores(world) {
    var scores = {};
    var start = Math.max(1, world.promptLen - 36);
    for (var t = start; t < world.promptLen; t += 1) {
      var attn = attentionAt(world, t).weights;
      for (var i = 0; i < attn.length; i += 1) scores[i] = (scores[i] || 0) + attn[i];
    }
    return scores;
  }

  function initializePolicy(world, policy, scores) {
    var budget = Math.min(world.params.budget, world.promptLen);
    var sinkPins = setFrom(latestPositions(world.params.sinkKeep, world.params.sinkKeep));
    if (policy.id === "sliding") return setFrom(latestPositions(world.promptLen, budget));
    if (policy.id === "sink") {
      var sinkCount = Math.min(world.params.sinkKeep, budget);
      var pins = setFrom([]);
      for (var s = 0; s < sinkCount; s += 1) pins.add(s);
      latestPositions(world.promptLen, budget - pins.size, pins).forEach(function (pos) { pins.add(pos); });
      return pins;
    }
    var recentReserve = Math.max(8, Math.round(budget * 0.32));
    var protectedSet = setFrom([]);
    latestPositions(world.promptLen, Math.min(recentReserve, budget - protectedSet.size), protectedSet).forEach(function (pos) {
      protectedSet.add(pos);
    });
    var candidates = [];
    for (var i = 0; i < world.promptLen; i += 1) candidates.push(i);
    return setFrom(topByScore(candidates, scores, budget, protectedSet));
  }

  function evict(world, policy, state, nextMaxExclusive) {
    var budget = Math.min(world.params.budget, nextMaxExclusive);
    if (state.cache.size <= budget) return;
    if (policy.id === "sliding") {
      state.cache = setFrom(latestPositions(nextMaxExclusive, budget));
      return;
    }
    if (policy.id === "sink") {
      var pins = setFrom([]);
      for (var s = 0; s < Math.min(world.params.sinkKeep, budget); s += 1) pins.add(s);
      latestPositions(nextMaxExclusive, budget - pins.size, pins).forEach(function (pos) { pins.add(pos); });
      state.cache = pins;
      return;
    }
    var protectedSet = setFrom([]);
    var recentReserve = Math.max(8, Math.round(budget * 0.32));
    latestPositions(nextMaxExclusive, Math.min(recentReserve, budget - protectedSet.size), protectedSet).forEach(function (pos) {
      protectedSet.add(pos);
    });
    var candidates = Array.from(state.cache);
    state.cache = setFrom(topByScore(candidates, policy.id === "snap" ? state.baseScores : state.scores, budget, protectedSet));
  }

  function retainedMass(weights, cache) {
    var mass = 0;
    cache.forEach(function (pos) {
      if (pos >= 0 && pos < weights.length) mass += weights[pos];
    });
    return mass;
  }

  function cacheSnapshot(cache) {
    return Array.from(cache).sort(function (a, b) { return a - b; });
  }

  function simulate(input) {
    var world = makeWorld(input);
    var baseScores = observationScores(world);
    var states = {};
    var traces = {};
    POLICIES.forEach(function (policy) {
      states[policy.id] = {
        cache: initializePolicy(world, policy, baseScores),
        baseScores: Object.assign({}, baseScores),
        scores: Object.assign({}, baseScores)
      };
      traces[policy.id] = {
        factHits: 0,
        masses: [],
        minMass: 1,
        queryCount: 0,
        snapshots: []
      };
    });

    var attentionFrames = [];
    for (var step = 0; step < world.genLen; step += 1) {
      var absT = world.promptLen + step;
      var frame = attentionAt(world, absT);
      attentionFrames.push(frame);
      POLICIES.forEach(function (policy) {
        var state = states[policy.id];
        var mass = retainedMass(frame.weights, state.cache);
        var trace = traces[policy.id];
        trace.masses.push(mass);
        trace.minMass = Math.min(trace.minMass, mass);
        if (frame.active) {
          trace.queryCount += 1;
          if (state.cache.has(frame.active.pos)) trace.factHits += 1;
        }
        trace.snapshots.push(cacheSnapshot(state.cache));
        state.cache.forEach(function (pos) {
          state.scores[pos] = (state.scores[pos] || 0) * 0.995 + (frame.weights[pos] || 0);
        });
        state.cache.add(absT);
        if (!state.scores[absT]) state.scores[absT] = 0;
        evict(world, policy, state, absT + 1);
      });
    }

    var summary = {};
    POLICIES.forEach(function (policy) {
      var trace = traces[policy.id];
      var avg = trace.masses.reduce(function (sum, value) { return sum + value; }, 0) / trace.masses.length;
      summary[policy.id] = {
        avgMass: avg,
        factHitRate: trace.queryCount ? trace.factHits / trace.queryCount : 1,
        minMass: trace.minMass
      };
    });
    var selectedStep = Math.round((world.params.viewStep / 100) * (world.genLen - 1));
    return {
      attentionFrames: attentionFrames,
      policies: POLICIES,
      selectedStep: selectedStep,
      summary: summary,
      traces: traces,
      world: world
    };
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="kv-evict-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function policyColor(id) {
    for (var i = 0; i < POLICIES.length; i += 1) {
      if (POLICIES[i].id === id) return POLICIES[i].color;
    }
    return COLORS.text;
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle) {
      var titleW = ctx.measureText(title).width;
      var subW = ctx.measureText(subtitle).width;
      if (titleW + subW + 24 < box.w) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(subtitle, box.x + box.w, box.y - 12);
      }
    }
  }

  function drawRetention(ctx, result, box) {
    panel(ctx, box, "Attention retained", "one line per eviction policy");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    for (var y = 0; y <= 4; y += 1) {
      var yy = box.y + box.h - y * box.h / 4;
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(box.x, yy);
      ctx.lineTo(box.x + box.w, yy);
      ctx.stroke();
    }
    POLICIES.forEach(function (policy) {
      var masses = result.traces[policy.id].masses;
      ctx.beginPath();
      masses.forEach(function (mass, index) {
        var x = box.x + index / (masses.length - 1) * box.w;
        var y = box.y + box.h - mass * box.h;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = policy.color;
      ctx.lineWidth = policy.id === "heavy" ? 2.4 : 1.7;
      ctx.stroke();
    });
    ctx.lineWidth = 1;
    var sx = box.x + result.selectedStep / (result.world.genLen - 1) * box.w;
    ctx.strokeStyle = COLORS.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, box.y);
    ctx.lineTo(sx, box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("0", box.x + 4, box.y + box.h - 16);
    ctx.textAlign = "right";
    ctx.fillText("1", box.x + box.w - 4, box.y + 5);
  }

  function drawCacheMap(ctx, result, box) {
    var step = result.selectedStep;
    var absT = result.world.promptLen + step;
    var frame = result.attentionFrames[step];
    panel(ctx, box, "Cache contents at step " + step, frame.active ? "querying " + frame.active.label : "recency-only step");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var rowH = box.h / POLICIES.length;
    function xMap(pos) {
      return box.x + pos / Math.max(1, result.world.totalLen - 1) * box.w;
    }
    result.world.facts.forEach(function (fact) {
      var x = xMap(fact.pos);
      ctx.strokeStyle = frame.active && fact.pos === frame.active.pos ? COLORS.miss : COLORS.fact;
      ctx.globalAlpha = frame.active && fact.pos === frame.active.pos ? 0.95 : 0.35;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (result.world.params.sinkKeep > 0) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.14)";
      ctx.fillRect(box.x, box.y, xMap(result.world.params.sinkKeep) - box.x, box.h);
    }
    POLICIES.forEach(function (policy, index) {
      var y = box.y + index * rowH;
      ctx.strokeStyle = COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(box.x, y + rowH);
      ctx.lineTo(box.x + box.w, y + rowH);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(policy.label, box.x + 8, y + rowH * 0.5);
      result.traces[policy.id].snapshots[step].forEach(function (pos) {
        var x = xMap(pos);
        var color = pos < result.world.params.sinkKeep ? COLORS.sink :
          (frame.active && pos === frame.active.pos ? COLORS.miss :
            (pos >= absT - 40 ? COLORS.recent : policy.color));
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + 20);
        ctx.lineTo(x, y + rowH - 8);
        ctx.stroke();
      });
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("prompt | generation", box.x + box.w - 5, box.y + box.h - 5);
    var split = xMap(result.world.promptLen);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(split, box.y);
    ctx.lineTo(split, box.y + box.h);
    ctx.stroke();
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "Average score", "retained mass and fact hit rate");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var gap = 10;
    var groupW = (box.w - gap * (POLICIES.length - 1)) / POLICIES.length;
    POLICIES.forEach(function (policy, index) {
      var x = box.x + index * (groupW + gap);
      var summary = result.summary[policy.id];
      var massH = summary.avgMass * (box.h - 42);
      var hitH = summary.factHitRate * (box.h - 42);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(x, box.y + 8, groupW, box.h - 42);
      ctx.fillStyle = policy.color;
      ctx.fillRect(x + groupW * 0.18, box.y + box.h - 34 - massH, groupW * 0.26, massH);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + groupW * 0.58, box.y + box.h - 34 - hitH, groupW * 0.26, hitH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(policy.label.split(" ")[0], x + groupW / 2, box.y + box.h - 25);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.fillText("solid: mass", box.x + 8, box.y + 10);
    ctx.textAlign = "right";
    ctx.fillText("pale: fact hit", box.x + box.w - 8, box.y + 10);
  }

  function drawAttention(ctx, result, box) {
    var step = result.selectedStep;
    var frame = result.attentionFrames[step];
    panel(ctx, box, "Full attention at selected step", frame.active ? "active old fact marked red" : "no long-range query");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var bins = 70;
    var counts = new Array(bins);
    var kept = new Array(bins);
    for (var i = 0; i < bins; i += 1) {
      counts[i] = 0;
      kept[i] = 0;
    }
    var snapCache = setFrom(result.traces.snap.snapshots[step]);
    frame.weights.forEach(function (value, pos) {
      var bin = Math.min(bins - 1, Math.floor(pos / Math.max(1, result.world.totalLen) * bins));
      counts[bin] += value;
      if (snapCache.has(pos)) kept[bin] += value;
    });
    var maxCount = counts.reduce(function (m, value) { return Math.max(m, value); }, 1e-9);
    var barW = box.w / bins;
    counts.forEach(function (value, index) {
      var h = value / maxCount * (box.h - 28);
      var kh = kept[index] / maxCount * (box.h - 28);
      ctx.fillStyle = COLORS.attention;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(box.x + index * barW, box.y + box.h - 20 - h, Math.max(1, barW - 1), h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = policyColor("snap");
      ctx.fillRect(box.x + index * barW, box.y + box.h - 20 - kh, Math.max(1, barW - 1), kh);
    });
    if (frame.active) {
      var x = box.x + frame.active.pos / result.world.totalLen * box.w;
      ctx.strokeStyle = COLORS.miss;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h - 20);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("gray: full; purple: observed", box.x + 8, box.y + box.h - 5);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 590;
    var height = compact ? 1040 : 760;
    var ratio = window.devicePixelRatio || 1;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    var left = compact ? 44 : 52;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;
    if (compact) {
      drawRetention(ctx, result, { x: left, y: 48, w: plotW, h: 190 });
      drawCacheMap(ctx, result, { x: left, y: 314, w: plotW, h: 220 });
      drawBars(ctx, result, { x: left, y: 610, w: plotW, h: 170 });
      drawAttention(ctx, result, { x: left, y: 856, w: plotW, h: 135 });
    } else {
      drawRetention(ctx, result, { x: left, y: 54, w: plotW * 0.48, h: 240 });
      drawCacheMap(ctx, result, { x: left + plotW * 0.56, y: 54, w: plotW * 0.44, h: 240 });
      drawBars(ctx, result, { x: left, y: 400, w: plotW * 0.48, h: 190 });
      drawAttention(ctx, result, { x: left + plotW * 0.56, y: 400, w: plotW * 0.44, h: 190 });
    }
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = Number(input.value);
      if (Number.isFinite(value)) params[key] = value;
    });
    return defaultParams(params);
  }

  function updateOutputs(root, result) {
    root.querySelector('[data-value="scenario"]').textContent = result.world.profile.label;
    root.querySelector('[data-value="budget"]').textContent = String(result.world.params.budget);
    root.querySelector('[data-value="sinkKeep"]').textContent = String(result.world.params.sinkKeep);
    root.querySelector('[data-value="topicPressure"]').textContent = result.world.params.topicPressure + "%";
    root.querySelector('[data-value="halfLife"]').textContent = result.world.params.halfLife.toFixed(0);
    root.querySelector('[data-value="viewStep"]').textContent = String(result.selectedStep);
    root.querySelector('[data-value="seed"]').textContent = String(result.world.params.seed);
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    updateOutputs(root, result);
    var sliding = result.summary.sliding;
    var sink = result.summary.sink;
    var heavy = result.summary.heavy;
    var snap = result.summary.snap;
    var metrics = root.querySelector("[data-metrics]");
    metrics.innerHTML = [
      metric("sliding retained", formatPercent(sliding.avgMass, 1)),
      metric("sink+window", formatPercent(sink.avgMass, 1)),
      metric("heavy+recent", formatPercent(heavy.avgMass, 1)),
      metric("observed retained", formatPercent(snap.avgMass, 1)),
      metric("observed fact hits", formatPercent(snap.factHitRate, 0)),
      metric("budget / prompt", result.world.params.budget + "/" + result.world.promptLen)
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-kv-evict-lab]"));
    labs.forEach(function (root) {
      if (root.__kvEvictLabReady) return;
      root.__kvEvictLabReady = true;
      var frame = null;
      function requestRender() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          frame = null;
          render(root);
        });
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      window.addEventListener("resize", requestRender);
    });
  }

  function audit() {
    var checks = [];
    [0, 1, 2, 3].forEach(function (scenario) {
      var result = simulate({ scenario: scenario, budget: 72, sinkKeep: 4, seed: 23 });
      for (var t = 0; t < result.attentionFrames.length; t += 17) {
        var weights = result.attentionFrames[t].weights;
        var sum = weights.reduce(function (acc, value) { return acc + value; }, 0);
        checks.push(["attention sums to one scenario " + scenario + " step " + t, Math.abs(sum - 1) < 1e-9]);
        checks.push(["attention nonnegative scenario " + scenario + " step " + t, weights.every(function (value) { return value >= 0; })]);
      }
      POLICIES.forEach(function (policy) {
        var trace = result.traces[policy.id];
        checks.push(["cache budget held " + policy.id + " scenario " + scenario, trace.snapshots.every(function (snap) {
          return snap.length <= result.world.params.budget;
        })]);
        checks.push(["retained mass bounded " + policy.id + " scenario " + scenario, trace.masses.every(function (mass) {
          return mass >= -1e-12 && mass <= 1 + 1e-12;
        })]);
      });
    });
    var sinky = simulate({ scenario: 0, budget: 48, sinkKeep: 4, topicPressure: 70, seed: 17 });
    checks.push(["sink policy beats sliding when sinks matter", sinky.summary.sink.avgMass > sinky.summary.sliding.avgMass]);
    checks.push(["heavy hitters beat sliding on fact-heavy chat", sinky.summary.heavy.avgMass > sinky.summary.sliding.avgMass]);
    var needle = simulate({ scenario: 1, budget: 56, sinkKeep: 4, topicPressure: 90, seed: 9 });
    checks.push(["observation vote fact hit rate beats sliding on needle", needle.summary.snap.factHitRate >= needle.summary.sliding.factHitRate]);
    checks.push(["observation scores locate at least one fact", (function () {
      var scores = observationScores(needle.world);
      var top = topByScore(Object.keys(scores).map(Number), scores, 20, setFrom([]));
      return needle.world.facts.some(function (fact) { return top.indexOf(fact.pos) !== -1; });
    }())]);
    var passed = checks.filter(function (row) { return row[1]; }).length;
    return { passed: passed, total: checks.length, checks: checks };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      activeFact: activeFact,
      attentionAt: attentionAt,
      audit: audit,
      defaultParams: defaultParams,
      makeWorld: makeWorld,
      observationScores: observationScores,
      simulate: simulate
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
