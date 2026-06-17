(function (global) {
  "use strict";

  var COLORS = {
    accepted: "#0f766e",
    amber: "#d97706",
    axis: "#d7dee5",
    blue: "#2563eb",
    dropped: "#be123c",
    fill: "#f8fafc",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    purple: "#7c3aed",
    softAccepted: "rgba(15, 118, 110, 0.13)",
    softAmber: "rgba(217, 119, 6, 0.15)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softDropped: "rgba(190, 18, 60, 0.13)",
    softPurple: "rgba(124, 58, 237, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    allowedLateness: 8,
    disorder: 58,
    events: 190,
    scenario: "mobile",
    seed: 23,
    watermarkDelay: 12,
    windowSize: 10
  };

  var SCENARIOS = {
    checkout: {
      duration: 180,
      label: "checkout bursts",
      note: "Mostly fresh point-of-sale events with a few store-network stalls.",
      keys: ["north", "south", "web", "kiosk"],
      baseLag: 0.8,
      meanLag: 1.4,
      tailBase: 0.025,
      tailScale: 0.0018,
      tailMin: 8,
      tailRange: 36
    },
    mobile: {
      duration: 180,
      label: "mobile offline",
      note: "Phone events arrive in synchronized batches after pockets of offline use.",
      keys: ["ios", "android", "web-lite", "sync"],
      baseLag: 1.1,
      meanLag: 2.2,
      tailBase: 0.055,
      tailScale: 0.0038,
      tailMin: 18,
      tailRange: 84
    },
    market: {
      duration: 120,
      label: "market feed",
      note: "Tick data is usually quick, except during small replay and gateway bursts.",
      keys: ["arca", "bats", "nasdaq", "dark"],
      baseLag: 0.25,
      meanLag: 0.7,
      tailBase: 0.02,
      tailScale: 0.0025,
      tailMin: 4,
      tailRange: 42
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    return {
      allowedLateness: snap(raw.allowedLateness, DEFAULTS.allowedLateness, 0, 60, 1),
      disorder: snap(raw.disorder, DEFAULTS.disorder, 0, 100, 1),
      events: snap(raw.events, DEFAULTS.events, 80, 360, 10),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      watermarkDelay: snap(raw.watermarkDelay, DEFAULTS.watermarkDelay, 0, 240, 1),
      windowSize: snap(raw.windowSize, DEFAULTS.windowSize, 5, 30, 5)
    };
  }

  function hash32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1);
    return function () {
      state = hash32(state + 0x9e3779b9);
      return state / 4294967296;
    };
  }

  function expSample(rand, mean) {
    return -Math.log(Math.max(1e-9, 1 - rand())) * mean;
  }

  function bell(rand) {
    return rand() + rand() + rand() - 1.5;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, tone) {
    return '<div class="watermark-stream-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function eventTimeForScenario(name, scenario, rand, duration) {
    var u = rand();
    var t;
    if (name === "checkout") {
      if (u < 0.5) {
        var centers = [42, 105, 154];
        var center = centers[Math.floor(rand() * centers.length) % centers.length];
        t = center + bell(rand) * 16;
      } else {
        t = rand() * duration;
      }
    } else if (name === "market") {
      if (u < 0.58) {
        var marketCenters = [18, 19.5, 20.5, 72, 73.5, 96];
        var mc = marketCenters[Math.floor(rand() * marketCenters.length) % marketCenters.length];
        t = mc + bell(rand) * 4.8;
      } else {
        t = rand() * duration;
      }
    } else {
      if (u < 0.62) {
        var mobileCenters = [24, 58, 113, 148];
        var mobileCenter = mobileCenters[Math.floor(rand() * mobileCenters.length) % mobileCenters.length];
        t = mobileCenter + bell(rand) * 18;
      } else {
        t = rand() * duration;
      }
    }
    return clamp(t, 0, duration - 0.001);
  }

  function generateEvents(rawParams) {
    var params = cleanParams(rawParams);
    var scenario = SCENARIOS[params.scenario];
    var rand = rng(params.seed * 1009 + params.events * 17 + params.disorder * 31);
    var events = [];
    var disorder = params.disorder / 100;
    for (var i = 0; i < params.events; i += 1) {
      var eventTime = eventTimeForScenario(params.scenario, scenario, rand, scenario.duration);
      var key = scenario.keys[Math.floor(rand() * scenario.keys.length) % scenario.keys.length];
      var lag = scenario.baseLag + expSample(rand, scenario.meanLag * (0.8 + disorder));
      var tailChance = scenario.tailBase + scenario.tailScale * params.disorder;
      var tail = rand() < tailChance;
      if (tail) {
        lag += scenario.tailMin + rand() * scenario.tailRange * (0.45 + disorder);
      }
      if (params.scenario === "market" && eventTime > 70 && eventTime < 78 && rand() < disorder * 0.22) {
        lag += 10 + rand() * 22;
        tail = true;
      }
      if (params.scenario === "mobile" && key === "sync" && rand() < 0.16 + disorder * 0.2) {
        lag += 14 + rand() * 44;
        tail = true;
      }
      var processingTime = eventTime + lag + bell(rand) * 0.12;
      events.push({
        eventTime: eventTime,
        id: i,
        key: key,
        lag: Math.max(0, processingTime - eventTime),
        processingTime: Math.max(0, processingTime),
        tail: tail
      });
    }
    events.sort(function (a, b) {
      if (a.processingTime !== b.processingTime) return a.processingTime - b.processingTime;
      return a.id - b.id;
    });
    events.forEach(function (event, index) {
      event.arrivalIndex = index;
    });
    return events;
  }

  function windowStartFor(eventTime, windowSize) {
    return Math.floor(eventTime / windowSize) * windowSize;
  }

  function windowKey(start) {
    return String(Math.round(start * 1000) / 1000);
  }

  function makeWindows(events, params) {
    var scenario = SCENARIOS[params.scenario];
    var n = Math.ceil(scenario.duration / params.windowSize);
    var windows = [];
    var byKey = {};
    for (var i = 0; i < n; i += 1) {
      var start = i * params.windowSize;
      var key = windowKey(start);
      var item = {
        accepted: 0,
        corrections: 0,
        dropped: 0,
        end: start + params.windowSize,
        exact: 0,
        finalized: false,
        finalizedAt: null,
        firstPaneAt: null,
        key: key,
        onTimeCount: 0,
        onTimeFired: false,
        start: start
      };
      windows.push(item);
      byKey[key] = item;
    }
    events.forEach(function (event) {
      var start = windowStartFor(event.eventTime, params.windowSize);
      var key = windowKey(start);
      if (!byKey[key]) {
        byKey[key] = {
          accepted: 0,
          corrections: 0,
          dropped: 0,
          end: start + params.windowSize,
          exact: 0,
          finalized: false,
          finalizedAt: null,
          firstPaneAt: null,
          key: key,
          onTimeCount: 0,
          onTimeFired: false,
          start: start
        };
        windows.push(byKey[key]);
      }
      byKey[key].exact += 1;
    });
    windows.sort(function (a, b) { return a.start - b.start; });
    return { byKey: byKey, windows: windows };
  }

  function emitReady(state, processingTime, watermark) {
    state.windows.forEach(function (win) {
      if (!win.onTimeFired && win.exact > 0 && watermark + 1e-9 >= win.end) {
        win.onTimeFired = true;
        win.onTimeCount = win.accepted;
        win.firstPaneAt = processingTime;
        state.emissions.push({
          accepted: win.accepted,
          exact: win.exact,
          processingTime: processingTime,
          type: "on-time",
          watermark: watermark,
          windowEnd: win.end,
          windowStart: win.start
        });
      }
      if (!win.finalized && watermark + 1e-9 >= win.end + state.params.allowedLateness) {
        win.finalized = true;
        win.finalizedAt = processingTime;
      }
    });
  }

  function simulateEvents(events, rawParams) {
    var params = cleanParams(rawParams);
    var made = makeWindows(events, params);
    var state = {
      byKey: made.byKey,
      emissions: [],
      params: params,
      steps: [],
      watermarkPath: [],
      windows: made.windows
    };
    var watermark = -1e9;
    var maxEventSeen = -1e9;
    var lastProcessingTime = 0;
    var maxDisorder = 0;
    var trailSum = 0;
    var trailCount = 0;
    var totals = {
      accepted: 0,
      behindWatermark: 0,
      corrections: 0,
      dropped: 0,
      onTime: 0
    };

    state.watermarkPath.push({ maxEventSeen: null, processingTime: 0, watermark: -params.watermarkDelay });

    events.forEach(function (event) {
      var priorWatermark = watermark;
      var priorMax = maxEventSeen;
      if (priorMax > -1e8) maxDisorder = Math.max(maxDisorder, priorMax - event.eventTime);
      var start = windowStartFor(event.eventTime, params.windowSize);
      var win = state.byKey[windowKey(start)];
      var afterWindow = priorWatermark + 1e-9 >= win.end;
      var afterGc = priorWatermark + 1e-9 >= win.end + params.allowedLateness;
      var status;
      var lateByWindow = Math.max(0, priorWatermark - win.end);
      var behindBy = Math.max(0, priorWatermark - event.eventTime);
      if (afterGc) {
        status = "dropped";
        win.dropped += 1;
        totals.dropped += 1;
      } else {
        win.accepted += 1;
        totals.accepted += 1;
        if (afterWindow || win.onTimeFired) {
          status = "correction";
          win.corrections += 1;
          totals.corrections += 1;
          state.emissions.push({
            accepted: win.accepted,
            delta: 1,
            exact: win.exact,
            processingTime: event.processingTime,
            type: "late",
            watermark: priorWatermark,
            windowEnd: win.end,
            windowStart: win.start
          });
        } else if (behindBy > 1e-9) {
          status = "behind";
          totals.behindWatermark += 1;
        } else {
          status = "on-time";
          totals.onTime += 1;
        }
      }

      maxEventSeen = Math.max(maxEventSeen, event.eventTime);
      watermark = Math.max(watermark, maxEventSeen - params.watermarkDelay);
      lastProcessingTime = Math.max(lastProcessingTime, event.processingTime);
      if (maxEventSeen > -1e8) {
        trailSum += Math.max(0, maxEventSeen - watermark);
        trailCount += 1;
      }

      state.steps.push({
        arrivalIndex: event.arrivalIndex,
        eventId: event.id,
        eventTime: event.eventTime,
        key: event.key,
        lateByWindow: lateByWindow,
        lag: event.lag,
        processingTime: event.processingTime,
        status: status,
        tail: event.tail,
        watermarkAfter: watermark,
        watermarkBefore: priorWatermark,
        windowEnd: win.end,
        windowStart: win.start
      });
      state.watermarkPath.push({
        maxEventSeen: maxEventSeen,
        processingTime: event.processingTime,
        watermark: watermark
      });
      emitReady(state, event.processingTime, watermark);
    });

    var finalWatermark = Math.max(watermark, SCENARIOS[params.scenario].duration + params.windowSize + params.allowedLateness + 1);
    var finalProcessingTime = lastProcessingTime + 0.25;
    watermark = finalWatermark;
    state.watermarkPath.push({
      maxEventSeen: maxEventSeen,
      processingTime: finalProcessingTime,
      watermark: watermark
    });
    emitReady(state, finalProcessingTime, watermark);

    var exactTotal = 0;
    var acceptedTotal = 0;
    var onTimeTotal = 0;
    var finalError = 0;
    var latencySum = 0;
    var latencyCount = 0;
    state.windows.forEach(function (win) {
      exactTotal += win.exact;
      acceptedTotal += win.accepted;
      onTimeTotal += win.onTimeCount;
      finalError += Math.abs(win.exact - win.accepted);
      if (win.exact > 0 && win.firstPaneAt != null) {
        latencySum += Math.max(0, win.firstPaneAt - win.end);
        latencyCount += 1;
      }
    });

    state.summary = {
      accepted: acceptedTotal,
      avgLatency: latencyCount ? latencySum / latencyCount : 0,
      avgTrail: trailCount ? trailSum / trailCount : 0,
      behindWatermark: totals.behindWatermark,
      corrections: totals.corrections,
      dropped: totals.dropped,
      exactTotal: exactTotal,
      finalError: finalError,
      maxDisorder: Math.max(0, maxDisorder),
      onTimeCompleteness: exactTotal ? onTimeTotal / exactTotal : 1,
      onTimeEvents: onTimeTotal,
      processed: events.length,
      scenarioNote: SCENARIOS[params.scenario].note
    };
    return state;
  }

  function frontier(events, params) {
    var out = [];
    var maxDelay = Math.max(30, Math.min(90, params.watermarkDelay + 28));
    for (var delay = 0; delay <= maxDelay; delay += 3) {
      var trial = simulateEvents(events, {
        allowedLateness: params.allowedLateness,
        disorder: params.disorder,
        events: params.events,
        scenario: params.scenario,
        seed: params.seed,
        watermarkDelay: delay,
        windowSize: params.windowSize
      });
      out.push({
        avgLatency: trial.summary.avgLatency,
        delay: delay,
        dropped: trial.summary.dropped,
        finalError: trial.summary.finalError,
        onTimeCompleteness: trial.summary.onTimeCompleteness
      });
    }
    return out;
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var events = generateEvents(params);
    var state = simulateEvents(events, params);
    state.events = events;
    state.frontier = frontier(events, params);
    state.params = params;
    state.scenario = SCENARIOS[params.scenario];
    return state;
  }

  function drawText(ctx, text, x, y, color, size, maxWidth, weight) {
    ctx.save();
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    if (!maxWidth) {
      ctx.fillText(text, x, y);
      ctx.restore();
      return y + size + 4;
    }
    var words = String(text).split(/\s+/);
    var line = "";
    var yy = y;
    var lineHeight = (size || 12) * 1.32;
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        yy += lineHeight;
        line = word;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, yy);
    ctx.restore();
    return yy + lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.stroke();
    drawText(ctx, title, rect.x + 14, rect.y + 12, COLORS.ink, 13, rect.w - 28, 720);
    if (subtitle) drawText(ctx, subtitle, rect.x + 14, rect.y + 31, COLORS.muted, 11, rect.w - 28, 520);
    ctx.restore();
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    var span = Math.max(1e-9, domainMax - domainMin);
    return function (value) {
      return rangeMin + (value - domainMin) / span * (rangeMax - rangeMin);
    };
  }

  function statusColor(status) {
    if (status === "dropped") return COLORS.dropped;
    if (status === "correction") return COLORS.amber;
    if (status === "behind") return COLORS.blue;
    return COLORS.accepted;
  }

  function drawScatter(ctx, rect, state) {
    panel(ctx, rect, "two clocks, one promise", "x = processing time, y = event time; the purple line is the watermark");
    var gx = rect.x + 48;
    var gy = rect.y + 62;
    var gw = rect.w - 72;
    var gh = rect.h - 88;
    var maxProc = Math.max.apply(null, state.steps.map(function (s) { return s.processingTime; }).concat([1]));
    var duration = SCENARIOS[state.params.scenario].duration;
    var x = scaleLinear(0, maxProc + 4, gx, gx + gw);
    var y = scaleLinear(0, duration, gy + gh, gy);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      var xx = gx + gw * i / 4;
      var yy = gy + gh * i / 4;
      ctx.beginPath();
      ctx.moveTo(xx, gy);
      ctx.lineTo(xx, gy + gh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(gx + gw, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();

    ctx.strokeStyle = COLORS.purple;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    var started = false;
    state.watermarkPath.forEach(function (p) {
      var wm = clamp(p.watermark, 0, duration);
      var xx = x(p.processingTime);
      var yy = y(wm);
      if (!started) {
        ctx.moveTo(xx, yy);
        started = true;
      } else {
        ctx.lineTo(xx, yy);
      }
    });
    ctx.stroke();

    state.steps.forEach(function (step) {
      var px = x(step.processingTime);
      var py = y(step.eventTime);
      ctx.fillStyle = statusColor(step.status);
      ctx.globalAlpha = step.tail ? 0.95 : 0.75;
      ctx.beginPath();
      ctx.arc(px, py, step.tail ? 3.4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "processing time", gx + gw - 92, gy + gh + 16, COLORS.muted, 10);
    drawText(ctx, "event time", gx - 38, gy - 20, COLORS.muted, 10);
    drawText(ctx, "accepted", gx + 4, gy + gh + 16, COLORS.accepted, 10);
    drawText(ctx, "behind", gx + 70, gy + gh + 16, COLORS.blue, 10);
    drawText(ctx, "correction", gx + 126, gy + gh + 16, COLORS.amber, 10);
    drawText(ctx, "dropped", gx + 204, gy + gh + 16, COLORS.dropped, 10);
    ctx.restore();
  }

  function drawWindows(ctx, rect, state) {
    panel(ctx, rect, "window ledger", "dark bars are accepted events; red caps are final batch error from dropped late data");
    var gx = rect.x + 22;
    var gy = rect.y + 58;
    var gw = rect.w - 44;
    var gh = rect.h - 82;
    var maxCount = Math.max.apply(null, state.windows.map(function (w) { return w.exact; }).concat([1]));
    var duration = SCENARIOS[state.params.scenario].duration;
    var x = scaleLinear(0, duration, gx, gx + gw);
    var barGap = Math.max(1, Math.min(5, gw / Math.max(1, state.windows.length) * 0.18));
    ctx.save();
    state.windows.forEach(function (win) {
      var x0 = x(win.start) + barGap / 2;
      var x1 = x(win.end) - barGap / 2;
      var bw = Math.max(2, x1 - x0);
      var exactH = gh * (win.exact / maxCount);
      var acceptedH = gh * (win.accepted / maxCount);
      var droppedH = gh * (win.dropped / maxCount);
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x0, gy + gh - exactH, bw, exactH);
      ctx.fillStyle = win.corrections ? COLORS.amber : COLORS.accepted;
      ctx.fillRect(x0, gy + gh - acceptedH, bw, acceptedH);
      if (droppedH > 0) {
        ctx.fillStyle = COLORS.dropped;
        ctx.fillRect(x0, gy + gh - exactH, bw, Math.max(2, droppedH));
      }
      if (win.onTimeFired && win.exact > 0) {
        var paneH = gh * (win.onTimeCount / maxCount);
        ctx.strokeStyle = COLORS.purple;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0, gy + gh - paneH);
        ctx.lineTo(x0 + bw, gy + gh - paneH);
        ctx.stroke();
      }
    });
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();
    drawText(ctx, "purple tick = first pane count", gx, rect.y + rect.h - 22, COLORS.purple, 10);
    drawText(ctx, "window size " + state.params.windowSize + " min", gx + gw - 104, rect.y + rect.h - 22, COLORS.muted, 10);
    ctx.restore();
  }

  function drawFrontier(ctx, rect, state) {
    panel(ctx, rect, "latency/error frontier", "sweeping only the watermark delay; the marked point is the current setting");
    var gx = rect.x + 44;
    var gy = rect.y + 58;
    var gw = rect.w - 72;
    var gh = rect.h - 92;
    var maxLatency = Math.max.apply(null, state.frontier.map(function (p) { return p.avgLatency; }).concat([1]));
    var maxError = Math.max.apply(null, state.frontier.map(function (p) { return p.finalError; }).concat([1]));
    var x = scaleLinear(0, maxLatency * 1.08 + 0.5, gx, gx + gw);
    var y = scaleLinear(0, maxError * 1.08 + 0.5, gy + gh, gy);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var xx = gx + gw * i / 4;
      var yy = gy + gh * i / 4;
      ctx.beginPath();
      ctx.moveTo(xx, gy);
      ctx.lineTo(xx, gy + gh);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(gx + gw, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.frontier.forEach(function (p, index) {
      var px = x(p.avgLatency);
      var py = y(p.finalError);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    state.frontier.forEach(function (p) {
      var px = x(p.avgLatency);
      var py = y(p.finalError);
      ctx.fillStyle = Math.abs(p.delay - state.params.watermarkDelay) <= 1.5 ? COLORS.dropped : COLORS.blue;
      ctx.beginPath();
      ctx.arc(px, py, Math.abs(p.delay - state.params.watermarkDelay) <= 1.5 ? 4.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
    drawText(ctx, "avg pane latency", gx + gw - 96, gy + gh + 16, COLORS.muted, 10);
    drawText(ctx, "error", gx - 18, gy - 18, COLORS.muted, 10);
    ctx.restore();
  }

  function drawLateLedger(ctx, rect, state) {
    panel(ctx, rect, "late-data ledger", "largest corrections and drops, ordered by how far the watermark had already moved");
    var interesting = state.steps.filter(function (s) {
      return s.status === "correction" || s.status === "dropped" || s.status === "behind";
    }).sort(function (a, b) {
      return (b.lateByWindow + b.lag * 0.02) - (a.lateByWindow + a.lag * 0.02);
    }).slice(0, 7);
    if (!interesting.length) interesting = state.steps.slice(-7);
    var x = rect.x + 16;
    var y = rect.y + 58;
    var colW = [44, 72, 72, 72, rect.w - 276];
    ctx.save();
    drawText(ctx, "id", x, y, COLORS.muted, 10, colW[0], 680);
    drawText(ctx, "event", x + colW[0], y, COLORS.muted, 10, colW[1], 680);
    drawText(ctx, "arrival", x + colW[0] + colW[1], y, COLORS.muted, 10, colW[2], 680);
    drawText(ctx, "wm - end", x + colW[0] + colW[1] + colW[2], y, COLORS.muted, 10, colW[3], 680);
    drawText(ctx, "status", x + colW[0] + colW[1] + colW[2] + colW[3], y, COLORS.muted, 10, colW[4], 680);
    y += 20;
    interesting.forEach(function (s, index) {
      var yy = y + index * 20;
      ctx.fillStyle = index % 2 ? COLORS.white : COLORS.fill;
      ctx.fillRect(rect.x + 12, yy - 3, rect.w - 24, 18);
      drawText(ctx, "#" + s.eventId, x, yy, COLORS.ink, 10, colW[0], 540);
      drawText(ctx, fmt(s.eventTime, 1), x + colW[0], yy, COLORS.ink, 10, colW[1], 540);
      drawText(ctx, fmt(s.processingTime, 1), x + colW[0] + colW[1], yy, COLORS.ink, 10, colW[2], 540);
      drawText(ctx, fmt(s.lateByWindow, 1), x + colW[0] + colW[1] + colW[2], yy, COLORS.ink, 10, colW[3], 540);
      drawText(ctx, s.status, x + colW[0] + colW[1] + colW[2] + colW[3], yy, statusColor(s.status), 10, colW[4], 700);
    });
    ctx.restore();
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || canvas.width || 960);
    var cssH = cssW >= 760 ? Math.max(680, cssW * 0.78) : (cssW < 460 ? 980 : 940);
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
    if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx: ctx, h: cssH, w: cssW };
  }

  function draw(root, state) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.w;
    var h = setup.h;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var pad = 18;
    var scatter = { x: pad, y: pad, w: w - pad * 2, h: Math.max(250, h * 0.38) };
    var windows = { x: pad, y: scatter.y + scatter.h + 16, w: w - pad * 2, h: 150 };
    var bottomY = windows.y + windows.h + 16;
    if (w >= 760) {
      var half = (w - pad * 3) / 2;
      drawScatter(ctx, scatter, state);
      drawWindows(ctx, windows, state);
      drawFrontier(ctx, { x: pad, y: bottomY, w: half, h: h - bottomY - pad }, state);
      drawLateLedger(ctx, { x: pad * 2 + half, y: bottomY, w: half, h: h - bottomY - pad }, state);
    } else {
      var bottomH = (h - bottomY - pad - 14) / 2;
      drawScatter(ctx, scatter, state);
      drawWindows(ctx, windows, state);
      drawFrontier(ctx, { x: pad, y: bottomY, w: w - pad * 2, h: bottomH }, state);
      drawLateLedger(ctx, { x: pad, y: bottomY + bottomH + 14, w: w - pad * 2, h: bottomH }, state);
    }
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function setValue(root, name, value) {
    root.querySelectorAll('[data-value="' + name + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function updateControls(root, state) {
    var params = state.params;
    setValue(root, "scenario", SCENARIOS[params.scenario].label);
    setValue(root, "events", String(params.events));
    setValue(root, "disorder", params.disorder + "%");
    setValue(root, "watermarkDelay", params.watermarkDelay + " min");
    setValue(root, "allowedLateness", params.allowedLateness + " min");
    setValue(root, "windowSize", params.windowSize + " min");
    setValue(root, "seed", String(params.seed));
  }

  function render(root) {
    var params = readParams(root);
    var state = evaluate(params);
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var errorTone = state.summary.finalError ? "bad" : "good";
      var correctionTone = state.summary.corrections ? "warn" : "good";
      metrics.innerHTML = [
        metric("scenario", state.scenario.label),
        metric("events", String(state.summary.processed)),
        metric("on-time pane", fmt(state.summary.onTimeCompleteness * 100, 0) + "%", state.summary.onTimeCompleteness > 0.9 ? "good" : "warn"),
        metric("corrections", String(state.summary.corrections), correctionTone),
        metric("dropped", String(state.summary.dropped), state.summary.dropped ? "bad" : "good"),
        metric("avg latency", fmt(state.summary.avgLatency, 1) + " min"),
        metric("batch error", String(state.summary.finalError), errorTone),
        metric("max disorder", fmt(state.summary.maxDisorder, 1) + " min")
      ].join("");
    }
    draw(root, state);
    root.__eventTimeWatermarkState = state;
  }

  function init(root) {
    if (!root || root.__eventTimeWatermarkReady) return;
    root.__eventTimeWatermarkReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function finite(value) {
    return Number.isFinite(value);
  }

  function statusCounts(steps) {
    return steps.reduce(function (counts, step) {
      counts[step.status] = (counts[step.status] || 0) + 1;
      return counts;
    }, {});
  }

  function audit() {
    var checked = 0;
    function check(condition, message) {
      checked += 1;
      assert(condition, message);
    }
    function checkMonotoneWatermark(state, label) {
      var last = -Infinity;
      state.watermarkPath.forEach(function (point) {
        check(point.watermark + 1e-9 >= last, label + " watermark should be monotone");
        last = Math.max(last, point.watermark);
      });
    }
    function checkState(state, events, params, label) {
      var exactSum = state.windows.reduce(function (sum, win) { return sum + win.exact; }, 0);
      var acceptedSum = state.windows.reduce(function (sum, win) { return sum + win.accepted; }, 0);
      var droppedSum = state.windows.reduce(function (sum, win) { return sum + win.dropped; }, 0);
      var onTimeSum = state.windows.reduce(function (sum, win) { return sum + win.onTimeCount; }, 0);
      var correctionSum = state.windows.reduce(function (sum, win) { return sum + win.corrections; }, 0);
      var counts = statusCounts(state.steps);
      check(state.steps.length === events.length, label + " should produce one step per event");
      check(exactSum === events.length, label + " exact windows should partition the stream");
      check(acceptedSum === state.summary.accepted, label + " accepted window sum should match summary");
      check(droppedSum === state.summary.dropped, label + " dropped window sum should match summary");
      check(onTimeSum === state.summary.onTimeEvents, label + " on-time pane sum should match summary");
      check(correctionSum === state.summary.corrections, label + " correction window sum should match summary");
      check(state.summary.processed === events.length, label + " processed count should match events");
      check(state.summary.accepted + state.summary.dropped === events.length, label + " accepted plus dropped should match events");
      check(state.summary.exactTotal === events.length, label + " exact total should equal event count");
      check(state.summary.finalError === state.summary.dropped, label + " count error should equal dropped events");
      check((counts.dropped || 0) === state.summary.dropped, label + " dropped step count should match summary");
      check((counts.correction || 0) === state.summary.corrections, label + " correction step count should match summary");
      check((counts.behind || 0) === state.summary.behindWatermark, label + " behind-watermark count should match summary");
      check((counts["on-time"] || 0) + (counts.behind || 0) + (counts.correction || 0) + (counts.dropped || 0) === events.length, label + " statuses should partition events");
      check(state.summary.onTimeCompleteness >= 0 && state.summary.onTimeCompleteness <= 1, label + " completeness should be a fraction");
      check(state.summary.avgLatency >= 0 && finite(state.summary.avgLatency), label + " average latency should be finite");
      check(state.summary.maxDisorder >= 0 && finite(state.summary.maxDisorder), label + " max disorder should be finite");
      check(state.windows.every(function (win) { return win.accepted + win.dropped === win.exact; }), label + " each window should reconcile exact = accepted + dropped");
      check(state.windows.every(function (win) { return win.exact === 0 || win.onTimeFired; }), label + " nonempty windows should fire an on-time pane by final flush");
      check(state.windows.every(function (win) { return win.finalized; }), label + " all windows should be finalized by final flush");
      check(state.steps.every(function (step, index) { return index === 0 || step.processingTime + 1e-9 >= state.steps[index - 1].processingTime; }), label + " processing time should be nondecreasing");
      check(state.steps.every(function (step) {
        if (step.status === "dropped") return step.watermarkBefore + 1e-9 >= step.windowEnd + params.allowedLateness;
        if (step.status === "correction") return step.watermarkBefore + 1e-9 >= step.windowEnd;
        if (step.status === "behind") return step.watermarkBefore > step.eventTime + 1e-9 && step.watermarkBefore < step.windowEnd + 1e-9;
        return step.watermarkBefore <= step.eventTime + 1e-9;
      }), label + " statuses should match watermark position");
      check(state.emissions.every(function (emission) {
        if (emission.type === "on-time") return emission.watermark + 1e-9 >= emission.windowEnd;
        if (emission.type === "late") return emission.watermark + 1e-9 >= emission.windowEnd && emission.watermark < emission.windowEnd + params.allowedLateness + 1e-9;
        return false;
      }), label + " emissions should obey on-time and late-pane boundaries");
      checkMonotoneWatermark(state, label);
    }
    var summary = {};
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var cases = 0;
      var totalDropped = 0;
      var maxDisorder = 0;
      [3, 23, 91].forEach(function (seed) {
        [15, 58, 90].forEach(function (disorder) {
          [5, 15].forEach(function (windowSize) {
            [0, 8, 24].forEach(function (allowedLateness) {
              var params = cleanParams({
                allowedLateness: allowedLateness,
                disorder: disorder,
                events: 160,
                scenario: scenario,
                seed: seed,
                watermarkDelay: 10,
                windowSize: windowSize
              });
              var events = generateEvents(params);
              var state = simulateEvents(events, params);
              checkState(state, events, params, scenario);
              var slowParams = {
                allowedLateness: 0,
                disorder: params.disorder,
                events: params.events,
                scenario: params.scenario,
                seed: params.seed,
                watermarkDelay: Math.ceil(state.summary.maxDisorder) + 2,
                windowSize: params.windowSize
              };
              var slow = simulateEvents(events, slowParams);
              check(slow.summary.dropped === 0, scenario + " sufficiently slow watermark should not drop data");
              var curve = frontier(events, params);
              check(curve.length > 0, scenario + " frontier should have points");
              for (var i = 1; i < curve.length; i += 1) {
                check(curve[i].delay > curve[i - 1].delay, scenario + " frontier delay should increase");
                check(curve[i].dropped <= curve[i - 1].dropped, scenario + " dropped events should not increase with more delay");
                check(curve[i].finalError === curve[i].dropped, scenario + " frontier error should equal dropped events");
                check(curve[i].onTimeCompleteness >= 0 && curve[i].onTimeCompleteness <= 1, scenario + " frontier completeness should be a fraction");
              }
              cases += 1;
              totalDropped += state.summary.dropped;
              maxDisorder = Math.max(maxDisorder, state.summary.maxDisorder);
            });
          });
        });
      });
      summary[scenario] = {
        cases: cases,
        maxDisorder: maxDisorder,
        totalDropped: totalDropped
      };
    });
    var defaultState = evaluate(DEFAULTS);
    check(defaultState.summary.processed === 190, "default scenario should generate 190 records");
    check(defaultState.summary.dropped === 53, "default scenario should preserve documented dropped count");
    check(Math.round(defaultState.summary.onTimeCompleteness * 100) === 70, "default scenario should preserve documented on-time completeness");
    check(cleanParams({ allowedLateness: -4, disorder: 222, events: 1, scenario: "unknown", seed: NaN, watermarkDelay: 999, windowSize: 17 }).scenario === DEFAULTS.scenario, "sanitizer should fall back to default scenario");
    check(cleanParams({ allowedLateness: -4, disorder: 222, events: 1, scenario: "unknown", seed: NaN, watermarkDelay: 999, windowSize: 17 }).allowedLateness === 0, "sanitizer should clamp allowed lateness");
    check(cleanParams({ allowedLateness: -4, disorder: 222, events: 1, scenario: "unknown", seed: NaN, watermarkDelay: 999, windowSize: 17 }).events === 80, "sanitizer should clamp event count");
    return { checked: checked, ok: true, summary: summary };
  }

  var api = {
    DEFAULTS: DEFAULTS,
    SCENARIOS: SCENARIOS,
    audit: audit,
    cleanParams: cleanParams,
    evaluate: evaluate,
    frontier: frontier,
    generateEvents: generateEvents,
    simulateEvents: simulateEvents
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.EventTimeWatermarkLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-event-time-watermark-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
