(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    latent: "#64748b",
    sync: "#0f766e",
    hy: "#7c3aed",
    lead: "#be123c",
    fast: "#2563eb",
    slow: "#f59e0b",
    band: "#ccfbf1"
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

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPct(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function formatSeconds(seconds) {
    if (Math.abs(seconds) >= 60) return (seconds / 60).toFixed(1) + "m";
    return Math.round(seconds) + "s";
  }

  function metric(label, value) {
    return '<div class="epps-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function correlation(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    var sx = 0;
    var sy = 0;
    var i;
    for (i = 0; i < n; i += 1) {
      sx += x[i];
      sy += y[i];
    }
    var mx = sx / n;
    var my = sy / n;
    var cov = 0;
    var vx = 0;
    var vy = 0;
    for (i = 0; i < n; i += 1) {
      var dx = x[i] - mx;
      var dy = y[i] - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    if (vx <= 1e-18 || vy <= 1e-18) return 0;
    return cov / Math.sqrt(vx * vy);
  }

  function sampleAtGrid(series, gridTimes, dt) {
    return gridTimes.map(function (time) {
      var index = clamp(Math.round(time / dt), 0, series.length - 1);
      return series[index];
    });
  }

  function previousTickSeries(ticks, gridTimes) {
    var out = [];
    var j = 0;
    for (var i = 0; i < gridTimes.length; i += 1) {
      var time = gridTimes[i];
      while (j + 1 < ticks.length && ticks[j + 1].t <= time) j += 1;
      out.push(ticks[j].p);
    }
    return out;
  }

  function diffs(values) {
    var out = [];
    for (var i = 1; i < values.length; i += 1) out.push(values[i] - values[i - 1]);
    return out;
  }

  function gridTimes(totalSeconds, interval) {
    var out = [];
    for (var t = 0; t <= totalSeconds + 1e-9; t += interval) out.push(t);
    if (out[out.length - 1] < totalSeconds) out.push(totalSeconds);
    return out;
  }

  function returnsForInterval(sim, interval, observed) {
    var grid = gridTimes(sim.totalSeconds, interval);
    var a = observed ? previousTickSeries(sim.ticksA, grid) : sampleAtGrid(sim.latentA, grid, sim.dt);
    var b = observed ? previousTickSeries(sim.ticksB, grid) : sampleAtGrid(sim.latentB, grid, sim.dt);
    return { a: diffs(a), b: diffs(b) };
  }

  function hayashiYoshida(ticksA, ticksB) {
    var a = [];
    var b = [];
    var i;
    for (i = 1; i < ticksA.length; i += 1) {
      a.push({ start: ticksA[i - 1].t, end: ticksA[i].t, r: ticksA[i].p - ticksA[i - 1].p });
    }
    for (i = 1; i < ticksB.length; i += 1) {
      b.push({ start: ticksB[i - 1].t, end: ticksB[i].t, r: ticksB[i].p - ticksB[i - 1].p });
    }
    var cov = 0;
    var ia = 0;
    var ib = 0;
    while (ia < a.length && ib < b.length) {
      if (a[ia].start < b[ib].end && b[ib].start < a[ia].end) cov += a[ia].r * b[ib].r;
      if (a[ia].end < b[ib].end) ia += 1;
      else ib += 1;
    }
    var varA = a.reduce(function (sum, row) { return sum + row.r * row.r; }, 0);
    var varB = b.reduce(function (sum, row) { return sum + row.r * row.r; }, 0);
    return varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;
  }

  function lagCurve(ra, rb, interval, maxLagSeconds) {
    var maxLag = Math.max(1, Math.round(maxLagSeconds / interval));
    var curve = [];
    for (var lag = -maxLag; lag <= maxLag; lag += 1) {
      var x = [];
      var y = [];
      for (var i = 0; i < ra.length; i += 1) {
        var j = i + lag;
        if (j >= 0 && j < rb.length) {
          x.push(ra[i]);
          y.push(rb[j]);
        }
      }
      curve.push({ lagSeconds: lag * interval, value: correlation(x, y) });
    }
    return curve;
  }

  function buildTicks(latent, totalSeconds, dt, ratePerMinute, noiseScale, rand) {
    var ticks = [{ t: 0, p: latent[0] + noiseScale * normal(rand) }];
    var probability = clamp(ratePerMinute / 60 * dt, 0, 0.95);
    for (var i = 1; i < latent.length - 1; i += 1) {
      if (rand() < probability) ticks.push({ t: i * dt, p: latent[i] + noiseScale * normal(rand) });
    }
    ticks.push({ t: totalSeconds, p: latent[latent.length - 1] + noiseScale * normal(rand) });
    return ticks;
  }

  function simulatePath(params) {
    var dt = 0.5;
    var totalSeconds = params.minutes * 60;
    var steps = Math.round(totalSeconds / dt);
    var rand = rng(20260613 + params.correlation * 13 + params.fastRate * 17 + params.slowRate * 19 + params.lagSeconds * 23 + params.noiseBps * 29 + params.minutes * 31);
    var rho = clamp(params.correlation / 100, 0, 0.98);
    var lagSteps = Math.max(0, Math.round(params.lagSeconds / dt));
    var common = new Array(steps + 1).fill(0);
    var latentA = new Array(steps + 1).fill(0);
    var latentB = new Array(steps + 1).fill(0);
    var sigma = 0.00042;
    for (var i = 1; i <= steps; i += 1) {
      common[i] = normal(rand);
      var sharedA = common[i];
      var sharedB = common[Math.max(1, i - lagSteps)];
      var rA = sigma * Math.sqrt(dt) * (Math.sqrt(rho) * sharedA + Math.sqrt(1 - rho) * normal(rand));
      var rB = sigma * Math.sqrt(dt) * (Math.sqrt(rho) * sharedB + Math.sqrt(1 - rho) * normal(rand));
      latentA[i] = latentA[i - 1] + rA;
      latentB[i] = latentB[i - 1] + rB;
    }
    var noiseScale = params.noiseBps / 10000;
    return {
      dt: dt,
      latentA: latentA,
      latentB: latentB,
      ticksA: buildTicks(latentA, totalSeconds, dt, params.fastRate, noiseScale, rand),
      ticksB: buildTicks(latentB, totalSeconds, dt, params.slowRate, noiseScale, rand),
      totalSeconds: totalSeconds
    };
  }

  function simulate(params) {
    var sim = simulatePath(params);
    var intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300].filter(function (x) {
      return x <= sim.totalSeconds / 3;
    });
    var epps = intervals.map(function (interval) {
      var obs = returnsForInterval(sim, interval, true);
      var latent = returnsForInterval(sim, interval, false);
      return {
        interval: interval,
        observed: correlation(obs.a, obs.b),
        latent: correlation(latent.a, latent.b)
      };
    });
    var selected = returnsForInterval(sim, params.barSeconds, true);
    var latentSelected = returnsForInterval(sim, params.barSeconds, false);
    var lags = lagCurve(selected.a, selected.b, params.barSeconds, Math.min(300, sim.totalSeconds / 5));
    var peak = lags.reduce(function (best, row) {
      return Math.abs(row.value) > Math.abs(best.value) ? row : best;
    }, lags[0]);
    var shortPoint = epps[0];
    var longPoint = epps[epps.length - 1];
    return {
      epps: epps,
      hayashiYoshida: hayashiYoshida(sim.ticksA, sim.ticksB),
      latentSelected: correlation(latentSelected.a, latentSelected.b),
      lagCurve: lags,
      longInterval: longPoint.interval,
      peakLag: peak,
      selectedCorr: correlation(selected.a, selected.b),
      shortCorr: shortPoint.observed,
      longCorr: longPoint.observed,
      sim: sim
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

  function path(ctx, points, xScale, yScale, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point);
      var y = yScale(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawEpps(ctx, result, box) {
    panel(ctx, box, "Correlation versus sampling interval", "the Epps curve");
    var points = result.epps;
    var minLog = Math.log(points[0].interval);
    var maxLog = Math.log(points[points.length - 1].interval);
    function sx(point) {
      return box.x + 38 + (Math.log(point.interval) - minLog) / Math.max(1e-9, maxLog - minLog) * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp((value + 0.15) / 1.1, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.25, 0.5, 0.75].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 38, y);
      ctx.lineTo(box.x + box.w - 20, y);
      ctx.stroke();
    });
    path(ctx, points, sx, function (p) { return sy(p.latent); }, COLORS.latent, 1.5);
    path(ctx, points, sx, function (p) { return sy(p.observed); }, COLORS.sync, 2.3);
    points.forEach(function (point) {
      ctx.fillStyle = COLORS.sync;
      ctx.beginPath();
      ctx.arc(sx(point), sy(point.observed), 3.2, 0, 2 * Math.PI);
      ctx.fill();
    });
    label(ctx, "observed previous-tick", box.x + 44, box.y + 18, "left", "middle", COLORS.sync);
    label(ctx, "latent clock", box.x + box.w - 24, box.y + 18, "right", "middle", COLORS.latent);
    label(ctx, formatSeconds(points[0].interval), box.x + 38, box.y + box.h - 12, "center", "middle", COLORS.muted);
    label(ctx, formatSeconds(points[points.length - 1].interval), box.x + box.w - 20, box.y + box.h - 12, "right", "middle", COLORS.muted);
  }

  function drawLag(ctx, result, box) {
    panel(ctx, box, "Lead-lag scan", "corr(A_t, B_{t+lag})");
    var points = result.lagCurve;
    var maxAbsLag = Math.max.apply(null, points.map(function (p) { return Math.abs(p.lagSeconds); }));
    function sx(point) {
      return box.x + 36 + (point.lagSeconds + maxAbsLag) / Math.max(1, 2 * maxAbsLag) * (box.w - 56);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp((value + 0.35) / 1.2, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(sx({ lagSeconds: 0 }), box.y + 20);
    ctx.lineTo(sx({ lagSeconds: 0 }), box.y + box.h - 30);
    ctx.stroke();
    path(ctx, points, sx, function (p) { return sy(p.value); }, COLORS.lead, 2.2);
    ctx.fillStyle = COLORS.lead;
    ctx.beginPath();
    ctx.arc(sx(result.peakLag), sy(result.peakLag.value), 4, 0, 2 * Math.PI);
    ctx.fill();
    label(ctx, "peak " + formatSeconds(result.peakLag.lagSeconds), sx(result.peakLag) + 5, sy(result.peakLag.value) - 8, "left", "bottom", COLORS.lead);
    label(ctx, "-" + formatSeconds(maxAbsLag), box.x + 36, box.y + box.h - 12, "center", "middle", COLORS.muted);
    label(ctx, "+" + formatSeconds(maxAbsLag), box.x + box.w - 20, box.y + box.h - 12, "right", "middle", COLORS.muted);
  }

  function drawTimeline(ctx, result, box) {
    panel(ctx, box, "Observation clocks", "same latent market, different ticks");
    var sim = result.sim;
    var start = sim.totalSeconds * 0.36;
    var end = start + Math.min(180, sim.totalSeconds * 0.32);
    function sx(time) {
      return box.x + 44 + (time - start) / (end - start) * (box.w - 64);
    }
    var yA = box.y + 52;
    var yB = box.y + 104;
    ctx.strokeStyle = COLORS.rule;
    [yA, yB].forEach(function (y) {
      ctx.beginPath();
      ctx.moveTo(box.x + 44, y);
      ctx.lineTo(box.x + box.w - 20, y);
      ctx.stroke();
    });
    label(ctx, "fast", box.x + 12, yA, "left", "middle", COLORS.fast);
    label(ctx, "slow", box.x + 12, yB, "left", "middle", COLORS.slow);
    sim.ticksA.forEach(function (tick) {
      if (tick.t < start || tick.t > end) return;
      ctx.strokeStyle = COLORS.fast;
      ctx.beginPath();
      ctx.moveTo(sx(tick.t), yA - 18);
      ctx.lineTo(sx(tick.t), yA + 18);
      ctx.stroke();
    });
    sim.ticksB.forEach(function (tick) {
      if (tick.t < start || tick.t > end) return;
      ctx.strokeStyle = COLORS.slow;
      ctx.beginPath();
      ctx.moveTo(sx(tick.t), yB - 18);
      ctx.lineTo(sx(tick.t), yB + 18);
      ctx.stroke();
    });
    label(ctx, formatSeconds(end - start) + " slice", box.x + box.w - 20, box.y + box.h - 14, "right", "middle", COLORS.muted);
  }

  function drawScoreboard(ctx, result, box) {
    panel(ctx, box, "Estimator ledger", "same path, different clocks");
    var rows = [
      { label: "latent bar corr", value: result.latentSelected, color: COLORS.latent },
      { label: "previous-tick corr", value: result.selectedCorr, color: COLORS.sync },
      { label: "Hayashi-Yoshida", value: result.hayashiYoshida, color: COLORS.hy },
      { label: "short/long ratio", value: result.longCorr ? result.shortCorr / result.longCorr : 0, color: COLORS.lead, ratio: true }
    ];
    var top = box.y + 32;
    var rowH = (box.h - 54) / rows.length;
    rows.forEach(function (row, index) {
      var y = top + index * rowH;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x + 126, y, box.w - 150, rowH - 9);
      var value = row.ratio ? clamp(row.value, 0, 1.2) / 1.2 : clamp((row.value + 0.1) / 1.1, 0, 1);
      ctx.fillStyle = row.color;
      ctx.fillRect(box.x + 126, y, (box.w - 150) * value, rowH - 9);
      label(ctx, row.label, box.x + 12, y + (rowH - 9) / 2, "left", "middle", COLORS.text);
      label(ctx, row.ratio ? row.value.toFixed(2) + "x" : formatPct(row.value, 0), box.x + box.w - 16, y + (rowH - 9) / 2, "right", "middle", value > 0.72 ? "#ffffff" : COLORS.text);
    });
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 900 : 640;
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
      drawEpps(ctx, result, { x: left, y: 42, w: plotW, h: 170 });
      drawLag(ctx, result, { x: left, y: 282, w: plotW, h: 160 });
      drawTimeline(ctx, result, { x: left, y: 514, w: plotW, h: 145 });
      drawScoreboard(ctx, result, { x: left, y: 746, w: plotW, h: 120 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawEpps(ctx, result, { x: margin, y: 42, w: w, h: 210 });
      drawLag(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 210 });
      drawTimeline(ctx, result, { x: margin, y: 338, w: w, h: 170 });
      drawScoreboard(ctx, result, { x: margin + w + gap, y: 338, w: w, h: 170 });
    }
  }

  function parseParams(root) {
    var params = {
      barSeconds: 10,
      correlation: 75,
      fastRate: 80,
      lagSeconds: 2,
      minutes: 30,
      noiseBps: 1,
      slowRate: 15
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      params[key] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "correlation") output.textContent = params[key] + "%";
      else if (key === "noiseBps") output.textContent = params[key].toFixed(1) + " bps";
      else if (key === "fastRate" || key === "slowRate") output.textContent = params[key] + "/min";
      else if (key === "minutes") output.textContent = params[key] + "m";
      else output.textContent = formatSeconds(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    updateOutputs(root, params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("latent corr", formatPct(result.latentSelected, 0)),
      metric("previous-tick", formatPct(result.selectedCorr, 0)),
      metric("HY corr", formatPct(result.hayashiYoshida, 0)),
      metric("1s corr", formatPct(result.shortCorr, 0)),
      metric(formatSeconds(result.longInterval) + " corr", formatPct(result.longCorr, 0)),
      metric("peak lag", formatSeconds(result.peakLag.lagSeconds))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-epps-lab]"));
    labs.forEach(function (root) {
      if (root.__eppsLabReady) return;
      root.__eppsLabReady = true;
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
      correlation: correlation,
      hayashiYoshida: hayashiYoshida,
      simulate: simulate
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
