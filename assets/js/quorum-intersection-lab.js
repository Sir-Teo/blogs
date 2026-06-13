(function (global) {
  "use strict";

  var COLORS = {
    read: "#2563eb",
    write: "#be123c",
    overlap: "#0f766e",
    phase1: "#d97706",
    phase2: "#7c3aed",
    live: "#0f766e",
    down: "#94a3b8",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    warn: "#fff7ed"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatNumber(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 10) return value.toFixed(1) + "%";
    if (Math.abs(value) >= 1) return value.toFixed(2) + "%";
    return value.toFixed(3) + "%";
  }

  function metric(label, value) {
    return '<div class="quorum-intersection-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    var nodes = clamp(Math.round(params.nodes), 3, 9);
    return {
      live: clamp(Math.round(params.live), 0, nodes),
      nodes: nodes,
      phase1: clamp(Math.round(params.phase1), 1, nodes),
      phase2: clamp(Math.round(params.phase2), 1, nodes),
      read: clamp(Math.round(params.read), 1, nodes),
      write: clamp(Math.round(params.write), 1, nodes)
    };
  }

  function range(start, count) {
    var rows = [];
    for (var i = 0; i < count; i += 1) rows.push(start + i);
    return rows;
  }

  function setFrom(values) {
    var out = {};
    values.forEach(function (value) { out[value] = true; });
    return out;
  }

  function intersect(a, b) {
    var bs = setFrom(b);
    return a.filter(function (value) { return Boolean(bs[value]); });
  }

  function disjointWitness(firstSize, secondSize, n) {
    if (firstSize + secondSize > n) return null;
    return {
      first: range(0, firstSize),
      second: range(firstSize, secondSize)
    };
  }

  function overlappingExample(firstSize, secondSize, n) {
    var first = range(0, firstSize);
    var start = Math.max(0, n - secondSize);
    return {
      first: first,
      second: range(start, secondSize)
    };
  }

  function chooseRegisterExample(params) {
    var stale = disjointWitness(params.write, params.read, params.nodes);
    if (stale) return { kind: "stale read", write: stale.first, read: stale.second };
    var split = disjointWitness(params.write, params.write, params.nodes);
    if (split) return { kind: "split writes", write: split.first, read: split.second };
    var ok = overlappingExample(params.write, params.read, params.nodes);
    return { kind: "intersecting", write: ok.first, read: ok.second };
  }

  function choosePaxosExample(params) {
    var miss = disjointWitness(params.phase2, params.phase1, params.nodes);
    if (miss) return { kind: "forgotten value", phase2: miss.first, phase1: miss.second };
    var ok = overlappingExample(params.phase2, params.phase1, params.nodes);
    return { kind: "cross-phase intersection", phase2: ok.first, phase1: ok.second };
  }

  function binomial(n, k) {
    if (k < 0 || k > n) return 0;
    var result = 1;
    for (var i = 1; i <= k; i += 1) {
      result *= (n - k + i) / i;
    }
    return result;
  }

  function quorumAvailability(n, quorum, p) {
    var sum = 0;
    for (var live = quorum; live <= n; live += 1) {
      sum += binomial(n, live) * Math.pow(p, live) * Math.pow(1 - p, n - live);
    }
    return sum;
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var registerExample = chooseRegisterExample(clean);
    var paxosExample = choosePaxosExample(clean);
    var registerReadWrite = clean.read + clean.write > clean.nodes;
    var registerWriteWrite = clean.write * 2 > clean.nodes;
    var paxosCross = clean.phase1 + clean.phase2 > clean.nodes;
    return {
      live: {
        election: clean.live >= clean.phase1,
        read: clean.live >= clean.read,
        steady: clean.live >= clean.phase2,
        write: clean.live >= clean.write
      },
      params: clean,
      paxos: {
        availabilityPhase1: quorumAvailability(clean.nodes, clean.phase1, 0.95),
        availabilityPhase2: quorumAvailability(clean.nodes, clean.phase2, 0.95),
        cross: paxosCross,
        electionTolerance: clean.nodes - clean.phase1,
        example: paxosExample,
        safe: paxosCross,
        steadyTolerance: clean.nodes - clean.phase2
      },
      register: {
        availabilityRead: quorumAvailability(clean.nodes, clean.read, 0.95),
        availabilityWrite: quorumAvailability(clean.nodes, clean.write, 0.95),
        example: registerExample,
        readTolerance: clean.nodes - clean.read,
        readWrite: registerReadWrite,
        safe: registerReadWrite && registerWriteWrite,
        writeTolerance: clean.nodes - clean.write,
        writeWrite: registerWriteWrite
      }
    };
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

  function drawNodeRing(ctx, box, n, sets, labels) {
    var cx = box.x + box.w / 2;
    var cy = box.y + box.h / 2 + 8;
    var radius = Math.min(box.w, box.h) * 0.34;
    for (var i = 0; i < n; i += 1) {
      var angle = -Math.PI / 2 + i / n * Math.PI * 2;
      var x = cx + Math.cos(angle) * radius;
      var y = cy + Math.sin(angle) * radius;
      var inA = sets.a.indexOf(i) >= 0;
      var inB = sets.b.indexOf(i) >= 0;
      ctx.fillStyle = inA && inB ? COLORS.overlap : inA ? sets.aColor : inB ? sets.bColor : COLORS.faint;
      ctx.strokeStyle = COLORS.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = inA || inB ? "#ffffff" : COLORS.muted;
      ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, y);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(labels.a, box.x, box.y + box.h - 18);
    ctx.fillText(labels.b, box.x + box.w / 2, box.y + box.h - 18);
  }

  function drawRegisterPanel(ctx, result, box) {
    var subtitle = result.register.safe ? "read/write and write/write quorums intersect" : "a concrete non-intersection witness";
    panelTitle(ctx, box, "Read/write register", subtitle);
    var ex = result.register.example;
    var drawBox = { x: box.x, y: box.y + 34, w: box.w, h: box.h - 58 };
    drawNodeRing(ctx, drawBox, result.params.nodes, {
      a: ex.write,
      aColor: COLORS.write,
      b: ex.read,
      bColor: COLORS.read
    }, { a: "red = write quorum", b: "blue = read or second write" });
    ctx.fillStyle = result.register.safe ? COLORS.overlap : COLORS.write;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.register.safe ? "safe" : ex.kind, box.x, box.y + 58);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("R+W>N: " + yesNo(result.register.readWrite) + ", 2W>N: " + yesNo(result.register.writeWrite), box.x, box.y + 84);
  }

  function drawPaxosPanel(ctx, result, box) {
    var subtitle = result.paxos.safe ? "phase-1 quorums meet phase-2 quorums" : "a new leader can miss an accepted value";
    panelTitle(ctx, box, "Paxos cross-phase rule", subtitle);
    var ex = result.paxos.example;
    var drawBox = { x: box.x, y: box.y + 34, w: box.w, h: box.h - 58 };
    drawNodeRing(ctx, drawBox, result.params.nodes, {
      a: ex.phase2,
      aColor: COLORS.phase2,
      b: ex.phase1,
      bColor: COLORS.phase1
    }, { a: "purple = phase 2 quorum", b: "orange = later phase 1 quorum" });
    ctx.fillStyle = result.paxos.safe ? COLORS.overlap : COLORS.write;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.paxos.safe ? "safe" : ex.kind, box.x, box.y + 58);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Q1+Q2>N: " + yesNo(result.paxos.cross), box.x, box.y + 84);
  }

  function yesNo(value) {
    return value ? "yes" : "no";
  }

  function drawAvailabilityPanel(ctx, result, box) {
    panelTitle(ctx, box, "Crash availability", "an operation can run when enough replicas are live");
    var plot = { x: box.x, y: box.y + 54, w: box.w, h: box.h - 76 };
    var rows = [
      { color: COLORS.read, label: "read", ok: result.live.read, q: result.params.read, tol: result.register.readTolerance },
      { color: COLORS.write, label: "write", ok: result.live.write, q: result.params.write, tol: result.register.writeTolerance },
      { color: COLORS.phase1, label: "phase 1", ok: result.live.election, q: result.params.phase1, tol: result.paxos.electionTolerance },
      { color: COLORS.phase2, label: "phase 2", ok: result.live.steady, q: result.params.phase2, tol: result.paxos.steadyTolerance }
    ];
    var rowGap = Math.min(38, Math.max(26, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barW = plot.w - 168;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 78, y, barW, 18);
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 78, y, barW * row.q / result.params.nodes, 18);
      ctx.fillStyle = row.ok ? COLORS.overlap : COLORS.write;
      ctx.font = "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.label, plot.x, y + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText("q=" + row.q + ", f<=" + row.tol + ", " + (row.ok ? "live" : "blocked"), plot.x + plot.w, y + 13);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(result.params.live + " of " + result.params.nodes + " replicas currently live", plot.x + 78, plot.y + rows.length * rowGap + 12);
  }

  function drawLedgerPanel(ctx, result, box) {
    panelTitle(ctx, box, "Quorum ledger", "intersection buys safety, quorum size spends availability");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var rows = [
      ["nodes", String(result.params.nodes)],
      ["register safe", yesNo(result.register.safe)],
      ["Paxos safe", yesNo(result.paxos.safe)],
      ["R+W", result.params.read + result.params.write + " > " + result.params.nodes + " is " + yesNo(result.register.readWrite)],
      ["2W", result.params.write * 2 + " > " + result.params.nodes + " is " + yesNo(result.register.writeWrite)],
      ["Q1+Q2", result.params.phase1 + result.params.phase2 + " > " + result.params.nodes + " is " + yesNo(result.paxos.cross)],
      ["read avail @95%", formatPercent(result.register.availabilityRead * 100)],
      ["write avail @95%", formatPercent(result.register.availabilityWrite * 100)],
      ["phase1 avail @95%", formatPercent(result.paxos.availabilityPhase1 * 100)],
      ["phase2 avail @95%", formatPercent(result.paxos.availabilityPhase2 * 100)]
    ];
    var rowGap = Math.min(24, Math.max(17, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      ctx.fillStyle = i % 2 ? "rgba(215, 222, 229, 0.25)" : "transparent";
      ctx.fillRect(plot.x, y - 2, plot.w, rowGap);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row[0], plot.x + 4, y + 13);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(row[1], plot.x + plot.w - 4, y + 13);
    });
    ctx.textAlign = "left";
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 900;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 980 : 700;
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
      drawRegisterPanel(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawPaxosPanel(ctx, result, { x: margin, y: 342, w: panelW, h: 202 });
      drawAvailabilityPanel(ctx, result, { x: margin, y: 572, w: panelW, h: 202 });
      drawLedgerPanel(ctx, result, { x: margin, y: 804, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawRegisterPanel(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawPaxosPanel(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawAvailabilityPanel(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedgerPanel(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      live: String(result.params.live),
      nodes: String(result.params.nodes),
      phase1: String(result.params.phase1),
      phase2: String(result.params.phase2),
      read: String(result.params.read),
      write: String(result.params.write)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Register safe", yesNo(result.register.safe)),
        metric("Paxos safe", yesNo(result.paxos.safe)),
        metric("Read failures", String(result.register.readTolerance)),
        metric("Write failures", String(result.register.writeTolerance)),
        metric("Steady failures", String(result.paxos.steadyTolerance)),
        metric("Election failures", String(result.paxos.electionTolerance))
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-quorum-intersection-lab]")).forEach(init);
  }

  var api = {
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.QuorumIntersectionLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
