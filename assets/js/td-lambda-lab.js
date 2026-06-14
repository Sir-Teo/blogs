(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    trueValue: "#172026",
    td0: "#64748b",
    tdlambda: "#0f766e",
    mc: "#be123c",
    sweep: "#2563eb",
    trace: "#7c3aed",
    path: "#b45309"
  };

  var DEFAULT_PARAMS = {
    alpha: 4,
    episodes: 60,
    lambda: 40,
    rightProb: 50,
    runs: 80,
    states: 19,
    traceMode: "replace"
  };

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numericParam(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULT_PARAMS[key];
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return "unstable";
    if (Math.abs(value) >= 1000) return value.toExponential(1);
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="td-lambda-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      alpha: clamp(numericParam(raw, "alpha"), 2, 45) / 100,
      episodes: clamp(numericParam(raw, "episodes"), 5, 160),
      lambda: clamp(numericParam(raw, "lambda"), 0, 100) / 100,
      rightProb: clamp(numericParam(raw, "rightProb"), 35, 65) / 100,
      runs: clamp(numericParam(raw, "runs"), 20, 160),
      states: clamp(numericParam(raw, "states"), 5, 25),
      traceMode: raw.traceMode === "accumulate" ? "accumulate" : DEFAULT_PARAMS.traceMode
    };
  }

  function trueValues(params) {
    var n = params.states;
    var p = params.rightProb;
    var q = 1 - p;
    var values = new Array(n + 2).fill(0);
    values[n + 1] = 1;

    for (var s = 1; s <= n; s += 1) {
      if (Math.abs(p - 0.5) < 1e-9) values[s] = s / (n + 1);
      else {
        var ratio = q / p;
        values[s] = (1 - Math.pow(ratio, s)) / (1 - Math.pow(ratio, n + 1));
      }
    }
    return values;
  }

  function rmsError(values, truth) {
    var total = 0;
    var n = truth.length - 2;
    for (var s = 1; s <= n; s += 1) total += Math.pow(values[s] - truth[s], 2);
    return Math.sqrt(total / n);
  }

  function safeError(value) {
    return Number.isFinite(value) ? value : Infinity;
  }

  function robustMax(values, fallback, multiplier) {
    var finite = values.filter(function (value) {
      return Number.isFinite(value) && value >= 0;
    }).sort(function (a, b) { return a - b; });
    if (!finite.length) return fallback * (multiplier || 1);
    var high = finite[Math.floor(0.9 * (finite.length - 1))];
    var largest = finite[finite.length - 1];
    var cap = Math.max(fallback, high * 1.8);
    return Math.max(fallback, Math.min(largest, cap)) * (multiplier || 1);
  }

  function initialValues(params) {
    var values = new Array(params.states + 2).fill(0.5);
    values[0] = 0;
    values[params.states + 1] = 1;
    return values;
  }

  function generateEpisode(params, rand) {
    var n = params.states;
    var state = Math.ceil(n / 2);
    var transitions = [];
    var guard = 0;

    while (state > 0 && state < n + 1 && guard < 10000) {
      var next = state + (rand() < params.rightProb ? 1 : -1);
      var reward = next === n + 1 ? 1 : 0;
      transitions.push({ state: state, next: next, reward: reward });
      state = next;
      guard += 1;
    }
    return transitions;
  }

  function makeEpisodes(params, runIndex) {
    var rand = rng(
      20260614
      + runIndex * 104729
      + params.states * 13
      + Math.round(params.rightProb * 1000) * 17
      + params.episodes * 19
    );
    var episodes = [];
    for (var i = 0; i < params.episodes; i += 1) episodes.push(generateEpisode(params, rand));
    return episodes;
  }

  function trainTDLambda(params, episodes, lambdaOverride) {
    var lambda = lambdaOverride == null ? params.lambda : lambdaOverride;
    var values = initialValues(params);
    var truth = trueValues(params);
    var errors = [];
    var n = params.states;

    episodes.forEach(function (episode) {
      var traces = new Array(n + 2).fill(0);
      episode.forEach(function (step) {
        var state = step.state;
        var next = step.next;
        var delta = step.reward + values[next] - values[state];
        if (params.traceMode === "replace") traces[state] = 1;
        else traces[state] += 1;
        for (var s = 1; s <= n; s += 1) {
          values[s] += params.alpha * delta * traces[s];
          traces[s] *= lambda;
        }
        values[0] = 0;
        values[n + 1] = 1;
      });
      errors.push(rmsError(values, truth));
    });

    return { values: values, errors: errors };
  }

  function trainMonteCarlo(params, episodes) {
    var values = initialValues(params);
    var truth = trueValues(params);
    var errors = [];

    episodes.forEach(function (episode) {
      var terminalReward = episode.length && episode[episode.length - 1].next === params.states + 1 ? 1 : 0;
      episode.forEach(function (step) {
        values[step.state] += params.alpha * (terminalReward - values[step.state]);
      });
      errors.push(rmsError(values, truth));
    });

    return { values: values, errors: errors };
  }

  function addCurve(target, values) {
    for (var i = 0; i < values.length; i += 1) target[i] += safeError(values[i]);
  }

  function averageCurve(values, runs) {
    return values.map(function (value) { return value / Math.max(1, runs); });
  }

  function averageValues(rows, count) {
    var out = new Array(count).fill(0);
    rows.forEach(function (values) {
      for (var i = 0; i < count; i += 1) out[i] += values[i] / rows.length;
    });
    return out;
  }

  function lambdaSweep(params) {
    var lambdas = [];
    for (var i = 0; i <= 10; i += 1) lambdas.push(i / 10);
    return lambdas.map(function (lambda) {
      var total = 0;
      var unstable = false;
      for (var run = 0; run < params.runs; run += 1) {
        var episodes = makeEpisodes(params, run);
        var error = safeError(trainTDLambda(params, episodes, lambda).errors[params.episodes - 1]);
        if (!Number.isFinite(error)) unstable = true;
        else total += error;
      }
      return { lambda: lambda, error: unstable ? Infinity : total / params.runs };
    });
  }

  function traceSnapshot(params) {
    var rand = rng(919191 + params.states * 3 + Math.round(params.lambda * 1000));
    var episode = generateEpisode(params, rand);
    var traces = new Array(params.states + 2).fill(0);
    var snapshots = [];
    episode.forEach(function (step, index) {
      if (params.traceMode === "replace") traces[step.state] = 1;
      else traces[step.state] += 1;
      snapshots.push({
        index: index,
        next: step.next,
        reward: step.reward,
        state: step.state,
        traces: traces.slice()
      });
      for (var s = 1; s <= params.states; s += 1) traces[s] *= params.lambda;
    });
    var chosen = snapshots.length ? snapshots[snapshots.length - 1] : {
      index: 0,
      next: Math.ceil(params.states / 2),
      reward: 0,
      state: Math.ceil(params.states / 2),
      traces: traces
    };
    return { episode: episode, snapshot: chosen };
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var truth = trueValues(params);
    var td0Curve = new Array(params.episodes).fill(0);
    var tdLambdaCurve = new Array(params.episodes).fill(0);
    var mcCurve = new Array(params.episodes).fill(0);
    var td0Values = [];
    var tdLambdaValues = [];
    var mcValues = [];
    var lengths = [];

    for (var run = 0; run < params.runs; run += 1) {
      var episodes = makeEpisodes(params, run);
      episodes.forEach(function (episode) { lengths.push(episode.length); });
      var td0 = trainTDLambda(params, episodes, 0);
      var tdl = trainTDLambda(params, episodes, params.lambda);
      var mc = trainMonteCarlo(params, episodes);
      addCurve(td0Curve, td0.errors);
      addCurve(tdLambdaCurve, tdl.errors);
      addCurve(mcCurve, mc.errors);
      td0Values.push(td0.values);
      tdLambdaValues.push(tdl.values);
      mcValues.push(mc.values);
    }

    td0Curve = averageCurve(td0Curve, params.runs);
    tdLambdaCurve = averageCurve(tdLambdaCurve, params.runs);
    mcCurve = averageCurve(mcCurve, params.runs);
    var sweep = lambdaSweep(params);
    var bestSweep = sweep.reduce(function (best, row) {
      return safeError(row.error) < safeError(best.error) ? row : best;
    }, sweep[0]);
    var selectedSweep = sweep.reduce(function (best, row) {
      return Math.abs(row.lambda - params.lambda) < Math.abs(best.lambda - params.lambda) ? row : best;
    }, sweep[0]);
    var trace = traceSnapshot(params);
    var avgLength = lengths.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, lengths.length);
    var traceHalfLife = params.lambda > 0 && params.lambda < 1
      ? Math.log(0.5) / Math.log(params.lambda)
      : params.lambda === 0 ? 0 : Infinity;

    return {
      curves: {
        mc: mcCurve,
        td0: td0Curve,
        tdlambda: tdLambdaCurve
      },
      params: params,
      sweep: sweep,
      trace: trace,
      truth: truth,
      values: {
        mc: averageValues(mcValues, params.states + 2),
        td0: averageValues(td0Values, params.states + 2),
        tdlambda: averageValues(tdLambdaValues, params.states + 2)
      },
      summary: {
        avgLength: avgLength,
        bestLambda: bestSweep.lambda,
        bestLambdaError: bestSweep.error,
        mcFinal: mcCurve[mcCurve.length - 1],
        selectedLambdaGrid: selectedSweep.lambda,
        selectedLambdaGridError: selectedSweep.error,
        td0Final: td0Curve[td0Curve.length - 1],
        tdLambdaFinal: tdLambdaCurve[tdLambdaCurve.length - 1],
        traceHalfLife: traceHalfLife
      }
    };
  }

  function label(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    label(ctx, title, box.x, box.y - 13, "left", "bottom", COLORS.text);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 18 < box.w) {
      label(ctx, subtitle, box.x + box.w, box.y - 13, "right", "bottom", COLORS.muted);
    }
  }

  function line(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point, index);
      var y = yScale(point, index);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawValues(ctx, result, box) {
    panel(ctx, box, "Value estimates", "terminal reward probability");
    var n = result.params.states;
    function sx(state) {
      return box.x + 34 + (state - 1) / Math.max(1, n - 1) * (box.w - 54);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp(value, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 30, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      label(ctx, tick.toFixed(1), box.x + 24, y, "right", "middle", COLORS.muted);
    });
    var states = [];
    for (var s = 1; s <= n; s += 1) states.push(s);
    line(ctx, states, sx, function (state) { return sy(result.truth[state]); }, COLORS.trueValue, 2);
    line(ctx, states, sx, function (state) { return sy(result.values.td0[state]); }, COLORS.td0, 1.6);
    line(ctx, states, sx, function (state) { return sy(result.values.tdlambda[state]); }, COLORS.tdlambda, 2.2);
    line(ctx, states, sx, function (state) { return sy(result.values.mc[state]); }, COLORS.mc, 1.6);
    states.forEach(function (state) {
      ctx.fillStyle = COLORS.tdlambda;
      ctx.beginPath();
      ctx.arc(sx(state), sy(result.values.tdlambda[state]), 2.6, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "true", box.x + 38, box.y + 18, "left", "middle", COLORS.trueValue);
    label(ctx, "TD(lambda)", box.x + box.w - 20, box.y + 18, "right", "middle", COLORS.tdlambda);
  }

  function drawLearning(ctx, result, box) {
    panel(ctx, box, "Learning curve", "average RMS value error");
    var curves = result.curves;
    var maxY = robustMax(curves.td0.concat(curves.tdlambda).concat(curves.mc), 0.12, 1.08);
    function sx(_, index) {
      return box.x + 36 + index / Math.max(1, result.params.episodes - 1) * (box.w - 56);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp(safeError(value) / maxY, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = sy(tick * maxY);
      ctx.beginPath();
      ctx.moveTo(box.x + 32, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      label(ctx, formatNumber(tick * maxY, 2), box.x + 26, y, "right", "middle", COLORS.muted);
    });
    line(ctx, curves.td0, sx, sy, COLORS.td0, 1.8);
    line(ctx, curves.tdlambda, sx, sy, COLORS.tdlambda, 2.4);
    line(ctx, curves.mc, sx, sy, COLORS.mc, 1.8);
    label(ctx, "episode 1", box.x + 36, box.y + box.h - 12, "center", "middle", COLORS.muted);
    label(ctx, String(result.params.episodes), box.x + box.w - 18, box.y + box.h - 12, "right", "middle", COLORS.muted);
  }

  function drawSweep(ctx, result, box) {
    panel(ctx, box, "Lambda sweep", "final RMS after same budget");
    var rows = result.sweep;
    var maxY = robustMax(rows.map(function (row) { return row.error; }), 0.12, 1.12);
    function sx(index) {
      return box.x + 36 + index / Math.max(1, rows.length - 1) * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp(safeError(value) / maxY, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = sy(tick * maxY);
      ctx.beginPath();
      ctx.moveTo(box.x + 32, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
    });
    line(ctx, rows, function (_, index) { return sx(index); }, function (row) { return sy(row.error); }, COLORS.sweep, 2.2);
    rows.forEach(function (row, index) {
      var selected = Math.abs(row.lambda - result.params.lambda) < 0.055;
      ctx.fillStyle = selected ? COLORS.tdlambda : COLORS.sweep;
      ctx.beginPath();
      ctx.arc(sx(index), sy(row.error), selected ? 5 : 3, 0, 2 * Math.PI);
      ctx.fill();
      if (index % 2 === 0) label(ctx, formatNumber(row.lambda, 1), sx(index), box.y + box.h - 12, "center", "middle", COLORS.muted);
    });
    label(ctx, "best " + formatNumber(result.summary.bestLambda, 1), box.x + box.w - 20, box.y + 18, "right", "middle", COLORS.sweep);
  }

  function drawTrace(ctx, result, box) {
    panel(ctx, box, "Eligibility trace at reward", "who receives the terminal error?");
    var traces = result.trace.snapshot.traces;
    var n = result.params.states;
    var maxTrace = Math.max.apply(null, traces.slice(1, n + 1).concat([1e-6]));
    var barW = (box.w - 62) / n * 0.72;
    for (var s = 1; s <= n; s += 1) {
      var x = box.x + 34 + (s - 1) / Math.max(1, n - 1) * (box.w - 58);
      var h = traces[s] / maxTrace * (box.h - 64);
      ctx.fillStyle = s === result.trace.snapshot.state ? COLORS.path : COLORS.trace;
      ctx.fillRect(x - barW / 2, box.y + box.h - 30 - h, barW, h);
      if (s === 1 || s === Math.ceil(n / 2) || s === n) {
        label(ctx, String(s), x, box.y + box.h - 12, "center", "middle", COLORS.muted);
      }
    }
    var episodeStates = result.trace.episode.map(function (step) { return step.state; });
    var shown = episodeStates.slice(Math.max(0, episodeStates.length - 9)).join(" -> ");
    label(ctx, shown, box.x + 14, box.y + 18, "left", "middle", COLORS.muted);
    label(ctx, "reward " + result.trace.snapshot.reward, box.x + box.w - 16, box.y + 18, "right", "middle", COLORS.path);
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 940 : 650;
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

    if (compact) {
      var left = 42;
      var plotW = width - left - 18;
      drawValues(ctx, result, { x: left, y: 42, w: plotW, h: 175 });
      drawLearning(ctx, result, { x: left, y: 288, w: plotW, h: 170 });
      drawSweep(ctx, result, { x: left, y: 530, w: plotW, h: 158 });
      drawTrace(ctx, result, { x: left, y: 760, w: plotW, h: 145 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawValues(ctx, result, { x: margin, y: 42, w: w, h: 210 });
      drawLearning(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 210 });
      drawSweep(ctx, result, { x: margin, y: 338, w: w, h: 185 });
      drawTrace(ctx, result, { x: margin + w + gap, y: 338, w: w, h: 185 });
    }
  }

  function parseParams(root) {
    var params = {
      alpha: DEFAULT_PARAMS.alpha,
      episodes: DEFAULT_PARAMS.episodes,
      lambda: DEFAULT_PARAMS.lambda,
      rightProb: DEFAULT_PARAMS.rightProb,
      runs: DEFAULT_PARAMS.runs,
      states: DEFAULT_PARAMS.states,
      traceMode: DEFAULT_PARAMS.traceMode
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "alpha" || key === "lambda" || key === "rightProb") output.textContent = params[key] + "%";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var raw = parseParams(root);
    var result = evaluate(raw);
    updateOutputs(root, raw);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("TD(lambda) final RMS", formatNumber(result.summary.tdLambdaFinal, 3)),
      metric("TD(0) final RMS", formatNumber(result.summary.td0Final, 3)),
      metric("MC final RMS", formatNumber(result.summary.mcFinal, 3)),
      metric("best lambda grid", formatNumber(result.summary.bestLambda, 1)),
      metric("avg episode length", formatNumber(result.summary.avgLength, 1)),
      metric("trace half-life", result.summary.traceHalfLife === Infinity ? "infinite" : formatNumber(result.summary.traceHalfLife, 1) + " steps")
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-td-lambda-lab]"));
    labs.forEach(function (root) {
      if (root.__tdLambdaReady) return;
      root.__tdLambdaReady = true;
      var schedule = null;
      var scheduledWithTimeout = false;
      function requestRender() {
        if (schedule) {
          if (scheduledWithTimeout) window.clearTimeout(schedule);
          else if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(schedule);
        }
        scheduledWithTimeout = typeof window.requestAnimationFrame !== "function";
        var scheduleRender = scheduledWithTimeout
          ? function (callback) { return window.setTimeout(callback, 16); }
          : window.requestAnimationFrame;
        schedule = scheduleRender(function () {
          schedule = null;
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      cleanParams: cleanParams,
      evaluate: evaluate,
      generateEpisode: generateEpisode,
      trainMonteCarlo: trainMonteCarlo,
      trainTDLambda: trainTDLambda,
      trueValues: trueValues
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      window.setTimeout(init, 0);
    } else {
      init();
    }
  }
}());
