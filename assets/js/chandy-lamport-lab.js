(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    lane: "#edf2f7",
    app: "#0f766e",
    marker: "#7c3aed",
    record: "#2563eb",
    channel: "#b45309",
    bad: "#be123c",
    good: "#0f766e",
    softGood: "#d9f2e8",
    softWarn: "#fff2d8",
    softBad: "#fee2e2"
  };

  var DEFAULTS = {
    starter: 0,
    snapshotAt: 8,
    appDelay: 5,
    markerDelay: 2,
    traffic: 8,
    fifo: true,
    seed: 37
  };

  var INITIAL_BALANCES = [18, 14, 12];
  var PROCESS_COUNT = INITIAL_BALANCES.length;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rng(seed) {
    var state = seed >>> 0;
    return function () {
      state += 0x6d2b79f5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeParams(input) {
    input = input || {};
    var fifo = input.fifo;
    if (fifo == null) fifo = DEFAULTS.fifo;
    return {
      appDelay: clamp(Math.round(Number(input.appDelay == null ? DEFAULTS.appDelay : input.appDelay)), 2, 9),
      fifo: fifo === true || fifo === "true" || fifo === "on" || fifo === 1 || fifo === "1",
      markerDelay: clamp(Math.round(Number(input.markerDelay == null ? DEFAULTS.markerDelay : input.markerDelay)), 1, 8),
      seed: clamp(Math.round(Number(input.seed == null ? DEFAULTS.seed : input.seed)), 1, 999),
      snapshotAt: clamp(Math.round(Number(input.snapshotAt == null ? DEFAULTS.snapshotAt : input.snapshotAt)), 4, 16),
      starter: clamp(Math.round(Number(input.starter == null ? DEFAULTS.starter : input.starter)), 0, PROCESS_COUNT - 1),
      traffic: clamp(Math.round(Number(input.traffic == null ? DEFAULTS.traffic : input.traffic)), 4, 12)
    };
  }

  function channelKey(from, to) {
    return from + "->" + to;
  }

  function channels() {
    var out = [];
    for (var from = 0; from < PROCESS_COUNT; from += 1) {
      for (var to = 0; to < PROCESS_COUNT; to += 1) {
        if (from !== to) out.push({ from: from, key: channelKey(from, to), to: to });
      }
    }
    return out;
  }

  function initialTotal() {
    return INITIAL_BALANCES.reduce(function (sum, value) { return sum + value; }, 0);
  }

  function routeJitter(params, from, to, ordinal) {
    return ((params.seed * 17 + from * 11 + to * 7 + ordinal * 5) % 4) * 0.55;
  }

  function markerJitter(params, from, to, ordinal) {
    return ((params.seed * 13 + from * 5 + to * 3 + ordinal) % 3) * 0.35;
  }

  function makeAppPlan(params) {
    var rand = rng(20260618 + params.seed * 1009 + params.traffic * 97);
    var count = params.traffic * 3;
    var duration = params.snapshotAt + 15;
    var plan = [];

    for (var i = 0; i < count; i += 1) {
      var baseTime = 1.15 + i * duration / Math.max(1, count);
      var from = Math.floor(rand() * PROCESS_COUNT);
      var jump = 1 + Math.floor(rand() * (PROCESS_COUNT - 1));
      var to = (from + jump) % PROCESS_COUNT;
      var amount = 1 + Math.floor(rand() * 3);
      plan.push({
        amount: amount,
        from: from,
        ordinal: i,
        time: baseTime + rand() * 0.72,
        to: to
      });
    }

    plan.push({ amount: 3, from: params.starter, ordinal: count + 1, time: params.snapshotAt - 0.9, to: (params.starter + 1) % PROCESS_COUNT });
    plan.push({ amount: 2, from: (params.starter + 2) % PROCESS_COUNT, ordinal: count + 2, time: params.snapshotAt + 0.35, to: params.starter });
    plan.sort(function (a, b) { return a.time - b.time || a.ordinal - b.ordinal; });
    return plan;
  }

  function simulate(input) {
    var params = normalizeParams(input);
    var processes = INITIAL_BALANCES.map(function (balance, id) {
      return {
        balance: balance,
        id: id,
        recorded: false,
        recordedBalance: null,
        recordReason: "",
        recordTime: null
      };
    });
    var allChannels = channels();
    var channelClosed = {};
    var channelStates = {};
    var channelTails = {};
    allChannels.forEach(function (ch) {
      channelClosed[ch.key] = true;
      channelStates[ch.key] = [];
      channelTails[ch.key] = 0;
    });

    var eventQueue = [];
    var events = [];
    var messages = [];
    var order = 0;
    var messageId = 0;
    var markerOrdinal = 0;
    var snapshotDoneAt = null;

    function enqueue(type, time, data) {
      eventQueue.push({ data: data || {}, order: order += 1, time: time, type: type });
    }

    function log(kind, time, process, label, data) {
      events.push({
        data: data || {},
        kind: kind,
        label: label,
        process: process,
        time: time
      });
    }

    function scheduleMessage(type, from, to, sendTime, delay, payload) {
      var key = channelKey(from, to);
      var arrival = sendTime + Math.max(0.05, delay);
      if (params.fifo) arrival = Math.max(arrival, channelTails[key] + 0.18);
      channelTails[key] = arrival;

      var message = {
        amount: payload && payload.amount ? payload.amount : 0,
        deliveryTime: arrival,
        from: from,
        id: messageId += 1,
        recordedInChannel: false,
        sendTime: sendTime,
        to: to,
        type: type
      };
      messages.push(message);
      log(type === "marker" ? "marker-send" : "app-send", sendTime, from, type === "marker" ? "marker to P" + to : "-" + message.amount + " to P" + to, { message: message });
      enqueue("deliver", arrival, { message: message });
      return message;
    }

    function sendMarkers(from, time) {
      for (var to = 0; to < PROCESS_COUNT; to += 1) {
        if (to === from) continue;
        markerOrdinal += 1;
        scheduleMessage("marker", from, to, time + 0.03, params.markerDelay + markerJitter(params, from, to, markerOrdinal), {});
      }
    }

    function recordProcess(id, time, reason, markerFrom) {
      var proc = processes[id];
      if (proc.recorded) return;
      proc.recorded = true;
      proc.recordedBalance = proc.balance;
      proc.recordReason = reason;
      proc.recordTime = time;
      log("record", time, id, "record $" + proc.balance, { markerFrom: markerFrom });

      for (var src = 0; src < PROCESS_COUNT; src += 1) {
        if (src === id) continue;
        var key = channelKey(src, id);
        channelClosed[key] = src === markerFrom;
      }
      sendMarkers(id, time);
    }

    function maybeComplete(time) {
      if (snapshotDoneAt != null) return;
      var allRecorded = processes.every(function (proc) { return proc.recorded; });
      var allClosed = allChannels.every(function (ch) { return channelClosed[ch.key]; });
      if (allRecorded && allClosed) snapshotDoneAt = time;
    }

    function deliverMessage(message, time) {
      var receiver = processes[message.to];
      var key = channelKey(message.from, message.to);

      if (message.type === "marker") {
        log("marker-receive", time, message.to, "marker from P" + message.from, { message: message });
        if (!receiver.recorded) {
          recordProcess(message.to, time, "first marker from P" + message.from, message.from);
        } else {
          channelClosed[key] = true;
          log("channel-close", time, message.to, key + " closes", { message: message });
        }
        maybeComplete(time);
        return;
      }

      if (receiver.recorded && !channelClosed[key]) {
        message.recordedInChannel = true;
        channelStates[key].push(message);
      }
      receiver.balance += message.amount;
      log("app-receive", time, message.to, "+" + message.amount + " from P" + message.from, { message: message });
    }

    makeAppPlan(params).forEach(function (item) {
      enqueue("app-send", item.time, item);
    });
    enqueue("initiate", params.snapshotAt + 0.5, { starter: params.starter });

    while (eventQueue.length) {
      eventQueue.sort(function (a, b) { return a.time - b.time || a.order - b.order; });
      var event = eventQueue.shift();
      if (event.type === "initiate") {
        recordProcess(event.data.starter, event.time, "spontaneous", null);
        maybeComplete(event.time);
      } else if (event.type === "app-send") {
        var sender = processes[event.data.from];
        if (sender.balance <= 0) continue;
        var amount = Math.min(event.data.amount, sender.balance);
        sender.balance -= amount;
        scheduleMessage(
          "app",
          event.data.from,
          event.data.to,
          event.time,
          params.appDelay + routeJitter(params, event.data.from, event.data.to, event.data.ordinal),
          { amount: amount }
        );
      } else if (event.type === "deliver") {
        deliverMessage(event.data.message, event.time);
      }
    }

    events.sort(function (a, b) { return a.time - b.time || a.process - b.process; });
    messages.sort(function (a, b) { return a.sendTime - b.sendTime || a.id - b.id; });

    var result = {
      channelClosed: channelClosed,
      channelStates: channelStates,
      channels: allChannels,
      events: events,
      initialBalances: INITIAL_BALANCES.slice(),
      initialTotal: initialTotal(),
      messages: messages,
      params: params,
      processes: processes,
      snapshotDoneAt: snapshotDoneAt
    };
    result.analysis = analyze(result);
    return result;
  }

  function analyze(result) {
    var appMessages = result.messages.filter(function (message) { return message.type === "app"; });
    var markerMessages = result.messages.filter(function (message) { return message.type === "marker"; });
    var channelMessageCount = 0;
    var channelAmount = 0;
    Object.keys(result.channelStates).forEach(function (key) {
      result.channelStates[key].forEach(function (message) {
        channelMessageCount += 1;
        channelAmount += message.amount;
      });
    });

    var recordedLocalTotal = result.processes.reduce(function (sum, proc) {
      return sum + (proc.recordedBalance == null ? 0 : proc.recordedBalance);
    }, 0);
    var snapshotTotal = recordedLocalTotal + channelAmount;

    var cutRows = [];
    var receiveWithoutSend = 0;
    var missingChannel = 0;
    var extraChannel = 0;

    appMessages.forEach(function (message) {
      var fromRecord = result.processes[message.from].recordTime;
      var toRecord = result.processes[message.to].recordTime;
      var sendInCut = fromRecord != null && message.sendTime < fromRecord;
      var receiveInCut = toRecord != null && message.deliveryTime < toRecord;
      var shouldBeInChannel = sendInCut && !receiveInCut;
      if (receiveInCut && !sendInCut) receiveWithoutSend += 1;
      if (shouldBeInChannel && !message.recordedInChannel) missingChannel += 1;
      if (!shouldBeInChannel && message.recordedInChannel) extraChannel += 1;
      cutRows.push({
        expectedChannel: shouldBeInChannel,
        message: message,
        ok: !(receiveInCut && !sendInCut) && message.recordedInChannel === shouldBeInChannel,
        receiveInCut: receiveInCut,
        sendInCut: sendInCut
      });
    });

    var markerOvertakes = 0;
    markerMessages.forEach(function (marker) {
      appMessages.forEach(function (message) {
        if (message.from === marker.from && message.to === marker.to && message.sendTime < marker.sendTime && message.deliveryTime > marker.deliveryTime) {
          markerOvertakes += 1;
        }
      });
    });

    var complete = result.snapshotDoneAt != null && result.processes.every(function (proc) { return proc.recorded; });
    var pass = complete
      && receiveWithoutSend === 0
      && missingChannel === 0
      && extraChannel === 0
      && snapshotTotal === result.initialTotal;

    cutRows.sort(function (a, b) {
      var aScore = a.expectedChannel || !a.ok ? 0 : 1;
      var bScore = b.expectedChannel || !b.ok ? 0 : 1;
      return aScore - bScore || a.message.sendTime - b.message.sendTime;
    });

    return {
      appMessages: appMessages.length,
      channelAmount: channelAmount,
      channelMessageCount: channelMessageCount,
      complete: complete,
      cutRows: cutRows,
      extraChannel: extraChannel,
      markerMessages: markerMessages.length,
      markerOvertakes: markerOvertakes,
      missingChannel: missingChannel,
      pass: pass,
      receiveWithoutSend: receiveWithoutSend,
      recordedLocalTotal: recordedLocalTotal,
      snapshotTotal: snapshotTotal
    };
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return value.toFixed(digits == null ? 0 : digits);
  }

  function metric(label, value, tone) {
    var klass = "snapshot-lab__metric" + (tone ? " snapshot-lab__metric--" + tone : "");
    return '<div class="' + klass + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || 900);
    var height = width < 640 ? 900 : 640;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx: ctx, height: height, width: width };
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 12, COLORS.text, 13, 760);
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 31, COLORS.muted, 11, 520);
  }

  function scale(domain, range) {
    var span = domain.max - domain.min || 1;
    return function (value) {
      return range.min + (value - domain.min) * (range.max - range.min) / span;
    };
  }

  function maxTime(result) {
    var max = result.params.snapshotAt + 4;
    result.messages.forEach(function (message) {
      max = Math.max(max, message.deliveryTime, message.sendTime);
    });
    result.events.forEach(function (event) { max = Math.max(max, event.time); });
    return max + 0.8;
  }

  function processY(box, id) {
    if (PROCESS_COUNT === 1) return box.y + box.h / 2;
    return box.y + 54 + id * (box.h - 82) / (PROCESS_COUNT - 1);
  }

  function drawTrace(ctx, box, result) {
    panel(ctx, box, "space-time trace", "markers record local state without stopping application messages");
    var plot = { x: box.x + 42, y: box.y + 56, w: box.w - 62, h: box.h - 88 };
    var sx = scale({ min: 0, max: maxTime(result) }, { min: plot.x, max: plot.x + plot.w });

    for (var p = 0; p < PROCESS_COUNT; p += 1) {
      var y = processY(plot, p);
      ctx.strokeStyle = COLORS.lane;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
      text(ctx, "P" + p, box.x + 16, y - 7, COLORS.muted, 11, 760);
      var rt = result.processes[p].recordTime;
      if (rt != null) {
        var rx = sx(rt);
        ctx.strokeStyle = COLORS.record;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx, y - 24);
        ctx.lineTo(rx, y + 24);
        ctx.stroke();
        ctx.fillStyle = COLORS.record;
        ctx.beginPath();
        ctx.arc(rx, y, 5, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, "record", rx + 6, y - 26, COLORS.record, 10, 740);
      }
    }

    result.messages.forEach(function (message) {
      var x1 = sx(message.sendTime);
      var x2 = sx(message.deliveryTime);
      var y1 = processY(plot, message.from);
      var y2 = processY(plot, message.to);
      ctx.strokeStyle = message.type === "marker" ? COLORS.marker : message.recordedInChannel ? COLORS.channel : COLORS.app;
      ctx.lineWidth = message.recordedInChannel ? 3 : 1.6;
      ctx.globalAlpha = message.type === "marker" ? 0.72 : 0.58;
      if (message.type === "marker") ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = message.type === "marker" ? COLORS.marker : COLORS.app;
      ctx.beginPath();
      ctx.arc(x1, y1, message.type === "marker" ? 3.2 : 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, message.type === "marker" ? 3.2 : 3.8, 0, Math.PI * 2);
      ctx.fill();
    });

    var startX = sx(result.params.snapshotAt + 0.5);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, plot.y + 10);
    ctx.lineTo(startX, plot.y + plot.h - 6);
    ctx.stroke();
    text(ctx, "initiate", startX + 5, plot.y + 6, COLORS.record, 10, 760);

    text(ctx, "solid app message", plot.x, box.y + box.h - 24, COLORS.app, 10, 760);
    text(ctx, "dashed marker", plot.x + 116, box.y + box.h - 24, COLORS.marker, 10, 760);
    text(ctx, "amber app message is recorded as channel state", plot.x + 218, box.y + box.h - 24, COLORS.channel, 10, 760);
  }

  function drawLedger(ctx, box, result) {
    panel(ctx, box, "recorded global state", "local balances plus messages caught in channels");
    var top = box.y + 62;
    var left = box.x + 18;
    var right = box.x + box.w - 18;
    var maxBalance = Math.max.apply(null, result.processes.map(function (p) { return p.recordedBalance || 0; }).concat([1]));
    var barW = (right - left - 22) / PROCESS_COUNT;
    result.processes.forEach(function (proc, i) {
      var x = left + i * barW;
      var h = 78 * (proc.recordedBalance || 0) / maxBalance;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(x, top, barW - 14, 84);
      ctx.fillStyle = COLORS.record;
      ctx.fillRect(x, top + 84 - h, barW - 14, h);
      text(ctx, "P" + i, x + (barW - 14) / 2, top + 92, COLORS.muted, 10, 720, "center");
      text(ctx, String(proc.recordedBalance), x + (barW - 14) / 2, top + 84 - h - 17, COLORS.text, 11, 760, "center");
    });

    var y = top + 126;
    text(ctx, "channel state", left, y, COLORS.text, 12, 760);
    y += 22;
    var channelRows = result.channels.filter(function (ch) { return result.channelStates[ch.key].length > 0; });
    if (!channelRows.length) {
      text(ctx, "empty", left, y, COLORS.muted, 11, 560);
    } else {
      channelRows.slice(0, 5).forEach(function (ch) {
        var msgs = result.channelStates[ch.key];
        var amount = msgs.reduce(function (sum, message) { return sum + message.amount; }, 0);
        ctx.fillStyle = COLORS.softWarn;
        ctx.strokeStyle = "rgba(180, 83, 9, 0.28)";
        ctx.beginPath();
        ctx.roundRect(left, y - 5, right - left, 25, 6);
        ctx.fill();
        ctx.stroke();
        text(ctx, ch.key, left + 10, y, COLORS.channel, 11, 780);
        text(ctx, msgs.length + " msg, amount " + amount, right - 10, y, COLORS.text, 11, 650, "right");
        y += 31;
      });
    }

    var totalLine = "snapshot total = " + result.analysis.recordedLocalTotal + " local + " + result.analysis.channelAmount + " channel = " + result.analysis.snapshotTotal;
    text(ctx, totalLine, left, box.y + box.h - 42, result.analysis.pass ? COLORS.good : COLORS.bad, 12, 780);
    text(ctx, "initial total = " + result.initialTotal, left, box.y + box.h - 23, COLORS.muted, 11, 560);
  }

  function drawAudit(ctx, box, result) {
    panel(ctx, box, "cut audit", "receives in the cut must have sends in the cut");
    var rows = result.analysis.cutRows.slice(0, 8);
    var left = box.x + 16;
    var top = box.y + 62;
    var cols = [left, left + 78, left + 158, left + 238, box.x + box.w - 20];
    text(ctx, "message", cols[0], top - 22, COLORS.muted, 10, 720);
    text(ctx, "send", cols[1], top - 22, COLORS.muted, 10, 720);
    text(ctx, "receive", cols[2], top - 22, COLORS.muted, 10, 720);
    text(ctx, "channel", cols[3], top - 22, COLORS.muted, 10, 720);
    text(ctx, "status", cols[4], top - 22, COLORS.muted, 10, 720, "right");

    rows.forEach(function (row, i) {
      var y = top + i * 26;
      ctx.fillStyle = row.ok ? (row.expectedChannel ? COLORS.softWarn : COLORS.faint) : COLORS.softBad;
      ctx.fillRect(left - 6, y - 5, box.w - 28, 22);
      text(ctx, "m" + row.message.id + " P" + row.message.from + "->P" + row.message.to, cols[0], y, COLORS.text, 10, 680);
      text(ctx, row.sendInCut ? "before" : "after", cols[1], y, row.sendInCut ? COLORS.good : COLORS.muted, 10, 680);
      text(ctx, row.receiveInCut ? "before" : "after", cols[2], y, row.receiveInCut ? COLORS.good : COLORS.muted, 10, 680);
      text(ctx, row.message.recordedInChannel ? "yes" : "no", cols[3], y, row.message.recordedInChannel ? COLORS.channel : COLORS.muted, 10, 680);
      text(ctx, row.ok ? "ok" : "fail", cols[4], y, row.ok ? COLORS.good : COLORS.bad, 10, 780, "right");
    });

    var summaryColor = result.analysis.pass ? COLORS.good : COLORS.bad;
    text(ctx, "receive-without-send: " + result.analysis.receiveWithoutSend, left, box.y + box.h - 55, summaryColor, 11, 740);
    text(ctx, "missing channel messages: " + result.analysis.missingChannel, left, box.y + box.h - 38, summaryColor, 11, 740);
    text(ctx, "extra channel messages: " + result.analysis.extraChannel, left, box.y + box.h - 21, summaryColor, 11, 740);
  }

  function drawAssumptions(ctx, box, result) {
    panel(ctx, box, "assumption check", "FIFO channels keep markers behind older app messages");
    var left = box.x + 18;
    var top = box.y + 66;
    var bg = result.analysis.markerOvertakes === 0 ? COLORS.softGood : COLORS.softBad;
    ctx.fillStyle = bg;
    ctx.strokeStyle = result.analysis.markerOvertakes === 0 ? "rgba(15, 118, 110, 0.32)" : "rgba(190, 18, 60, 0.32)";
    ctx.beginPath();
    ctx.roundRect(left, top, box.w - 36, 54, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, result.params.fifo ? "FIFO channels on" : "FIFO channels off", left + 14, top + 10, COLORS.text, 13, 780);
    text(ctx, "marker overtakes older app messages: " + result.analysis.markerOvertakes, left + 14, top + 31, result.analysis.markerOvertakes === 0 ? COLORS.good : COLORS.bad, 11, 720);
    text(ctx, "audit " + (result.analysis.pass ? "passes" : "fails") + " when the recorded cut preserves token mass", left, top + 86, result.analysis.pass ? COLORS.good : COLORS.bad, 12, 760);

    var baseY = top + 125;
    var maxVal = Math.max(1, result.analysis.appMessages, result.analysis.markerMessages, result.analysis.channelMessageCount);
    [
      { color: COLORS.app, label: "app messages", value: result.analysis.appMessages },
      { color: COLORS.marker, label: "marker messages", value: result.analysis.markerMessages },
      { color: COLORS.channel, label: "channel-state messages", value: result.analysis.channelMessageCount }
    ].forEach(function (row, i) {
      var y = baseY + i * 31;
      text(ctx, row.label, left, y, COLORS.text, 11, 680);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(left + 150, y, box.w - 222, 13);
      ctx.fillStyle = row.color;
      ctx.fillRect(left + 150, y, (box.w - 222) * row.value / maxVal, 13);
      text(ctx, String(row.value), box.x + box.w - 22, y - 1, row.color, 11, 780, "right");
    });

    text(ctx, "snapshot completed at t=" + (result.snapshotDoneAt == null ? "n/a" : formatNumber(result.snapshotDoneAt, 2)), left, box.y + box.h - 24, COLORS.muted, 11, 580);
  }

  function draw(result, canvas) {
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (width < 640) {
      var pad = 14;
      var gap = 14;
      var h = (height - pad * 2 - gap * 3) / 4;
      drawTrace(ctx, { x: pad, y: pad, w: width - 2 * pad, h: h }, result);
      drawLedger(ctx, { x: pad, y: pad + h + gap, w: width - 2 * pad, h: h }, result);
      drawAudit(ctx, { x: pad, y: pad + 2 * (h + gap), w: width - 2 * pad, h: h }, result);
      drawAssumptions(ctx, { x: pad, y: pad + 3 * (h + gap), w: width - 2 * pad, h: h }, result);
      return;
    }

    var outerPad = 16;
    var panelGap = 14;
    var halfW = (width - outerPad * 2 - panelGap) / 2;
    var halfH = (height - outerPad * 2 - panelGap) / 2;
    drawTrace(ctx, { x: outerPad, y: outerPad, w: halfW, h: halfH }, result);
    drawLedger(ctx, { x: outerPad + halfW + panelGap, y: outerPad, w: halfW, h: halfH }, result);
    drawAudit(ctx, { x: outerPad, y: outerPad + halfH + panelGap, w: halfW, h: halfH }, result);
    drawAssumptions(ctx, { x: outerPad + halfW + panelGap, y: outerPad + halfH + panelGap, w: halfW, h: halfH }, result);
  }

  function renderMetrics(root, result) {
    var holder = root.querySelector("[data-metrics]");
    if (!holder) return;
    holder.innerHTML = [
      metric("Snapshot total", result.analysis.snapshotTotal + " / " + result.initialTotal, result.analysis.snapshotTotal === result.initialTotal ? "good" : "bad"),
      metric("Channel state", result.analysis.channelMessageCount + " msg", result.analysis.channelMessageCount ? "warn" : ""),
      metric("Cut audit", result.analysis.pass ? "pass" : "fail", result.analysis.pass ? "good" : "bad"),
      metric("Marker overtakes", String(result.analysis.markerOvertakes), result.analysis.markerOvertakes ? "bad" : "good"),
      metric("Completed", result.snapshotDoneAt == null ? "n/a" : "t=" + formatNumber(result.snapshotDoneAt, 1)),
      metric("App messages", String(result.analysis.appMessages))
    ].join("");
  }

  function readControls(root) {
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      if (input.type === "checkbox") values[input.getAttribute("data-param")] = input.checked;
      else values[input.getAttribute("data-param")] = input.value;
    });
    return normalizeParams(values);
  }

  function updateOutputs(root, params) {
    Array.prototype.slice.call(root.querySelectorAll("[data-value]")).forEach(function (out) {
      var key = out.getAttribute("data-value");
      if (key === "starter") out.textContent = "P" + params.starter;
      if (key === "snapshotAt") out.textContent = "t=" + params.snapshotAt;
      if (key === "appDelay") out.textContent = String(params.appDelay);
      if (key === "markerDelay") out.textContent = String(params.markerDelay);
      if (key === "traffic") out.textContent = String(params.traffic);
      if (key === "seed") out.textContent = String(params.seed);
      if (key === "fifo") out.textContent = params.fifo ? "on" : "off";
    });
  }

  function init(root) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var pending = false;

    function render() {
      pending = false;
      var params = readControls(root);
      updateOutputs(root, params);
      var result = simulate(params);
      root.__chandyLamportResult = result;
      renderMetrics(root, result);
      draw(result, canvas);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      global.requestAnimationFrame(render);
    }

    Array.prototype.slice.call(root.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    render();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-chandy-lamport-lab]")).forEach(init);
  }

  function auditChandyLamportLab() {
    var cases = [
      { expectOvertake: false, expectPass: true, label: "default FIFO", params: { starter: 0, snapshotAt: 8, appDelay: 5, markerDelay: 2, traffic: 8, fifo: true, seed: 37 } },
      { expectOvertake: false, expectPass: true, label: "late starter FIFO", params: { starter: 1, snapshotAt: 10, appDelay: 7, markerDelay: 2, traffic: 10, fifo: true, seed: 11 } },
      { expectOvertake: false, expectPass: true, label: "early starter FIFO", params: { starter: 2, snapshotAt: 6, appDelay: 4, markerDelay: 3, traffic: 6, fifo: true, seed: 91 } },
      { expectOvertake: true, expectPass: false, label: "non-FIFO marker overtake", params: { starter: 0, snapshotAt: 8, appDelay: 8, markerDelay: 1, traffic: 8, fifo: false, seed: 37 } }
    ];
    var rows = cases.map(function (entry) {
      var result = simulate(entry.params);
      var checks = [
        { name: "snapshot completes", passed: result.analysis.complete },
        { name: "pass state matches expectation", passed: result.analysis.pass === entry.expectPass },
        { name: "token ledger matches pass state", passed: (result.analysis.snapshotTotal === result.initialTotal) === entry.expectPass },
        { name: "no receive without send", passed: result.analysis.receiveWithoutSend === 0 },
        { name: "marker overtake matches expectation", passed: entry.expectOvertake ? result.analysis.markerOvertakes > 0 : result.analysis.markerOvertakes === 0 }
      ];
      if (entry.expectPass) {
        checks.push({ name: "no missing channel messages", passed: result.analysis.missingChannel === 0 });
        checks.push({ name: "no extra channel messages", passed: result.analysis.extraChannel === 0 });
      } else {
        checks.push({ name: "missing channel messages expose FIFO violation", passed: result.analysis.missingChannel > 0 });
      }
      return {
        appMessages: result.analysis.appMessages,
        channelAmount: result.analysis.channelAmount,
        channelMessages: result.analysis.channelMessageCount,
        checks: checks,
        expectedPass: entry.expectPass,
        label: entry.label,
        markerOvertakes: result.analysis.markerOvertakes,
        missingChannel: result.analysis.missingChannel,
        passed: checks.every(function (check) { return check.passed; }),
        snapshotTotal: result.analysis.snapshotTotal
      };
    });
    return {
      cases: rows,
      passed: rows.every(function (row) { return row.passed; }),
      total: rows.length
    };
  }

  var api = {
    auditChandyLamportLab: auditChandyLamportLab,
    analyze: analyze,
    normalizeParams: normalizeParams,
    simulate: simulate
  };

  global.ChandyLamportLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
