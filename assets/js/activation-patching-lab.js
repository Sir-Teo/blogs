(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    node: "#0f766e",
    path: "#2563eb",
    bad: "#be123c",
    warn: "#b45309",
    purple: "#7c3aed",
    clean: "#0f766e",
    corrupt: "#64748b"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function tanh(value) {
    if (Math.tanh) return Math.tanh(value);
    var e = Math.exp(2 * value);
    return (e - 1) / (e + 1);
  }

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) total += a[i] * b[i];
    return total;
  }

  function norm(a) {
    return Math.sqrt(Math.max(1e-12, dot(a, a)));
  }

  function mix(a, b, t) {
    return a.map(function (value, index) {
      return (1 - t) * value + t * b[index];
    });
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 0 : digits) + "%";
  }

  function metric(label, value) {
    return '<div class="activation-patching-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function cleanParams(raw) {
    return {
      backup: clamp(Number(raw.backup), 0, 140) / 100,
      mediator: clamp(Number(raw.mediator), 20, 180) / 100,
      mixing: clamp(Number(raw.mixing), 0, 100) / 100,
      nuisance: clamp(Number(raw.nuisance), 0, 160) / 100,
      saturation: clamp(Number(raw.saturation), 0, 160) / 100,
      shortcut: clamp(Number(raw.shortcut), 0, 150) / 100
    };
  }

  function baseState(kind) {
    var sign = kind === "clean" ? 1 : -1;
    return {
      nuisance: sign,
      task: sign
    };
  }

  function computeExpected(nodes, params, name) {
    var m = params.mixing;
    if (name === "S") {
      return [
        nodes.input.task,
        (1 - m) * nodes.input.nuisance + m * nodes.input.task
      ];
    }
    if (name === "M") {
      return [
        nodes.S[0] + 0.42 * m * nodes.S[1],
        nodes.S[1] + 0.22 * m * nodes.S[0]
      ];
    }
    if (name === "B") {
      return [
        nodes.S[0] + 0.18 * m * nodes.S[1],
        nodes.S[1] - 0.12 * nodes.S[0]
      ];
    }
    if (name === "C") {
      return [
        -nodes.S[0] + 0.55 * m * nodes.S[1],
        nodes.S[1] - 0.18 * nodes.S[0]
      ];
    }
    if (name === "G") {
      return [computePreactivation(nodes, params).total];
    }
    return [0, 0];
  }

  function applyPatchValue(expected, cleanValue, corruptValue, patch) {
    if (!patch) return expected;
    if (patch.kind === "whole") return cleanValue.slice();
    if (patch.kind === "feature") {
      var out = corruptValue.slice();
      out[0] = cleanValue[0];
      return out;
    }
    return expected;
  }

  function computePreactivation(nodes, params, edgePatch) {
    var m = params.mediator;
    var backup = params.backup;
    var shortcut = params.shortcut;
    var nuisance = params.nuisance;
    var saturation = params.saturation;

    var contribs = {
      M: m * nodes.M[0],
      B: 0.56 * backup * nodes.B[0],
      C: -0.68 * nodes.C[0],
      S: 0.44 * shortcut * nodes.S[0],
      N: 0.36 * nuisance * (0.58 * nodes.S[1] + 0.42 * nodes.M[1])
    };

    if (edgePatch) contribs[edgePatch.edge] = edgePatch.value;

    var total = contribs.M + contribs.B + contribs.C + contribs.S + contribs.N;
    var gain = 0.85 + 1.8 * saturation;
    return {
      contribs: contribs,
      gate: tanh(gain * total),
      total: total
    };
  }

  function forward(kind, params, patch, edgePatch) {
    var input = baseState(kind);
    var clean = kind === "clean" ? null : forward("clean", params);
    var nodes = { input: input };
    var corruptValues = {};
    var cleanValues = {};
    var nodeNames = ["S", "M", "B", "C", "G"];

    if (kind !== "clean" && clean) {
      nodeNames.forEach(function (name) {
        cleanValues[name] = clean.nodes[name].slice();
      });
    }

    ["S", "M", "B", "C"].forEach(function (name) {
      var expected = computeExpected(nodes, params, name);
      corruptValues[name] = expected.slice();
      var patchHere = patch && patch.node === name ? patch : null;
      nodes[name] = kind === "clean" || !patchHere
        ? expected
        : applyPatchValue(expected, cleanValues[name], corruptValues[name], patchHere);
    });

    var pre = computePreactivation(nodes, params, edgePatch);
    var gExpected = [pre.total];
    corruptValues.G = gExpected.slice();
    if (kind !== "clean" && patch && patch.node === "G") {
      nodes.G = applyPatchValue(gExpected, cleanValues.G, corruptValues.G, patch);
      pre = {
        contribs: pre.contribs,
        gate: tanh((0.85 + 1.8 * params.saturation) * nodes.G[0]),
        total: nodes.G[0]
      };
    } else {
      nodes.G = gExpected;
    }

    var logit = pre.gate + 0.18 * pre.total;
    return {
      contribs: pre.contribs,
      logit: logit,
      nodes: nodes
    };
  }

  function recovery(cleanLogit, corruptLogit, patchedLogit) {
    var denom = cleanLogit - corruptLogit;
    if (Math.abs(denom) < 1e-9) return 0;
    return (patchedLogit - corruptLogit) / denom;
  }

  function consistencyPenalty(node, patched, corrupt, params) {
    if (node === "S") return 0;
    var expected = computeExpected(corrupt.nodes, params, node);
    var cleanValue = patched.nodes[node];
    return norm(cleanValue.map(function (value, index) { return value - expected[index]; })) / Math.max(1e-9, norm(expected));
  }

  function edgeValue(edge, run, params) {
    return computePreactivation(run.nodes, params).contribs[edge];
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var clean = forward("clean", params);
    var corrupt = forward("corrupt", params);
    var nodeNames = ["S", "M", "B", "C", "G"];
    var edges = ["M", "B", "C", "S", "N"];
    var nodePatches = [];
    var featurePatches = [];
    var pathPatches = [];

    nodeNames.forEach(function (node) {
      var patched = forward("corrupt", params, { node: node, kind: "whole" });
      nodePatches.push({
        family: "whole",
        label: node,
        logit: patched.logit,
        offManifold: consistencyPenalty(node, patched, corrupt, params),
        recovery: recovery(clean.logit, corrupt.logit, patched.logit)
      });
      if (node !== "G") {
        var feature = forward("corrupt", params, { node: node, kind: "feature" });
        featurePatches.push({
          family: "feature",
          label: node + "[0]",
          logit: feature.logit,
          offManifold: consistencyPenalty(node, feature, corrupt, params),
          recovery: recovery(clean.logit, corrupt.logit, feature.logit)
        });
      }
    });

    edges.forEach(function (edge) {
      var patchedEdge = forward("corrupt", params, null, {
        edge: edge,
        value: edgeValue(edge, clean, params)
      });
      pathPatches.push({
        family: "path",
        label: edge + "->G",
        logit: patchedEdge.logit,
        offManifold: edge === "N" ? 0.08 : 0.05,
        recovery: recovery(clean.logit, corrupt.logit, patchedEdge.logit)
      });
    });

    function best(rows) {
      return rows.reduce(function (winner, row) {
        return row.recovery > winner.recovery ? row : winner;
      }, rows[0]);
    }

    var all = nodePatches.concat(featurePatches).concat(pathPatches);
    var internalNodePatches = nodePatches.filter(function (row) {
      return row.label !== "S" && row.label !== "G";
    });
    var bestWhole = best(internalNodePatches);
    var bestFeature = best(featurePatches);
    var bestPath = best(pathPatches);
    var falsePositiveGap = bestWhole.recovery - bestPath.recovery;
    var directShare = Math.abs(corrupt.contribs.S) + Math.abs(corrupt.contribs.N);
    var totalShare = Object.keys(corrupt.contribs).reduce(function (sum, key) {
      return sum + Math.abs(corrupt.contribs[key]);
    }, 1e-9);

    return {
      allPatches: all,
      bestFeature: bestFeature,
      bestPath: bestPath,
      bestWhole: bestWhole,
      clean: clean,
      corrupt: corrupt,
      featurePatches: featurePatches,
      nodePatches: nodePatches,
      params: params,
      pathPatches: pathPatches,
      summary: {
        cleanLogit: clean.logit,
        corruptLogit: corrupt.logit,
        directShare: directShare / totalShare,
        falsePositiveGap: falsePositiveGap,
        logitGap: clean.logit - corrupt.logit,
        offManifoldBestWhole: bestWhole.offManifold,
        pathRecovery: bestPath.recovery,
        wholeRecovery: bestWhole.recovery
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

  function colorForRecovery(value) {
    if (value < 0) return COLORS.bad;
    if (value < 0.25) return COLORS.muted;
    if (value < 0.65) return COLORS.warn;
    if (value < 1.1) return COLORS.node;
    return COLORS.purple;
  }

  function drawGraph(ctx, result, box) {
    panel(ctx, box, "Patch map", "whole-node recovery");
    var positions = {
      S: [box.x + 58, box.y + box.h * 0.50],
      M: [box.x + box.w * 0.42, box.y + 44],
      B: [box.x + box.w * 0.42, box.y + box.h * 0.50],
      C: [box.x + box.w * 0.42, box.y + box.h - 44],
      G: [box.x + box.w - 62, box.y + box.h * 0.50]
    };
    var edges = [["S", "M"], ["S", "B"], ["S", "C"], ["M", "G"], ["B", "G"], ["C", "G"], ["S", "G"]];
    ctx.strokeStyle = COLORS.rule;
    edges.forEach(function (edge) {
      var a = positions[edge[0]];
      var b = positions[edge[1]];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });

    result.nodePatches.forEach(function (row) {
      var p = positions[row.label];
      var r = 22;
      ctx.fillStyle = colorForRecovery(row.recovery);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      label(ctx, row.label, p[0], p[1] - 4, "center", "middle", "#ffffff");
      label(ctx, formatPercent(row.recovery, 0), p[0], p[1] + 10, "center", "middle", "#ffffff");
    });
    label(ctx, "S = source residual", box.x + 14, box.y + box.h - 16, "left", "middle", COLORS.muted);
    label(ctx, "G = merge/logit site", box.x + box.w - 14, box.y + box.h - 16, "right", "middle", COLORS.muted);
  }

  function drawBars(ctx, result, box) {
    panel(ctx, box, "Node patches vs path patches", "restored logit gap");
    var rows = result.nodePatches.map(function (row) {
      return { label: row.label, value: row.recovery, color: COLORS.node };
    }).concat(result.pathPatches.map(function (row) {
      return { label: row.label, value: row.recovery, color: COLORS.path };
    }));
    var rowH = (box.h - 42) / rows.length;
    var x0 = box.x + 74;
    var w = box.w - 98;
    var zero = x0 + w * 0.12;
    function sx(value) {
      return zero + clamp(value, -0.25, 1.35) / 1.35 * (w * 0.84);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var x = sx(tick);
      ctx.beginPath();
      ctx.moveTo(x, box.y + 18);
      ctx.lineTo(x, box.y + box.h - 18);
      ctx.stroke();
      label(ctx, formatPercent(tick, 0), x, box.y + box.h - 5, "center", "bottom", COLORS.muted);
    });
    rows.forEach(function (row, index) {
      var y = box.y + 24 + index * rowH;
      var x = sx(row.value);
      ctx.fillStyle = row.color;
      ctx.fillRect(Math.min(zero, x), y, Math.max(2, Math.abs(x - zero)), Math.max(5, rowH - 4));
      label(ctx, row.label, box.x + 10, y + rowH * 0.36, "left", "middle", COLORS.text);
    });
  }

  function drawLogits(ctx, result, box) {
    panel(ctx, box, "Behavior metric", "logit difference");
    var rows = [
      { label: "clean", value: result.clean.logit, color: COLORS.clean },
      { label: "corrupt", value: result.corrupt.logit, color: COLORS.corrupt },
      { label: "best node", value: result.bestWhole.logit, color: COLORS.node },
      { label: "best path", value: result.bestPath.logit, color: COLORS.path }
    ];
    var min = Math.min.apply(null, rows.map(function (r) { return r.value; }).concat([-1]));
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    function sy(value) {
      return box.y + box.h - 34 - (value - min) / Math.max(1e-9, max - min) * (box.h - 62);
    }
    var baseY = sy(0);
    ctx.strokeStyle = COLORS.faint;
    ctx.beginPath();
    ctx.moveTo(box.x + 32, baseY);
    ctx.lineTo(box.x + box.w - 18, baseY);
    ctx.stroke();
    var barW = (box.w - 78) / rows.length * 0.58;
    rows.forEach(function (row, index) {
      var x = box.x + 48 + index / rows.length * (box.w - 72) + (box.w - 72) / rows.length / 2;
      var y = sy(row.value);
      ctx.fillStyle = row.color;
      ctx.fillRect(x - barW / 2, Math.min(baseY, y), barW, Math.max(2, Math.abs(baseY - y)));
      label(ctx, row.label, x, box.y + box.h - 14, "center", "middle", COLORS.muted);
      label(ctx, formatNumber(row.value, 2), x, y - 5, "center", "bottom", COLORS.text);
    });
  }

  function drawScatter(ctx, result, box) {
    panel(ctx, box, "Consistency check", "whole patches can go off-manifold");
    var rows = result.nodePatches.concat(result.featurePatches);
    var maxOff = Math.max(0.4, Math.max.apply(null, rows.map(function (r) { return r.offManifold; })) * 1.1);
    function sx(value) {
      return box.x + 38 + clamp(value / maxOff, 0, 1) * (box.w - 58);
    }
    function sy(value) {
      return box.y + box.h - 30 - clamp((value + 0.1) / 1.35, 0, 1) * (box.h - 58);
    }
    ctx.strokeStyle = COLORS.faint;
    [0, 0.5, 1].forEach(function (tick) {
      var y = sy(tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 34, y);
      ctx.lineTo(box.x + box.w - 18, y);
      ctx.stroke();
      label(ctx, formatPercent(tick, 0), box.x + 28, y, "right", "middle", COLORS.muted);
    });
    rows.forEach(function (row) {
      ctx.fillStyle = row.family === "whole" ? COLORS.purple : COLORS.warn;
      ctx.beginPath();
      ctx.arc(sx(row.offManifold), sy(row.recovery), row.family === "whole" ? 4 : 3, 0, 2 * Math.PI);
      ctx.fill();
      if (row.family === "whole") label(ctx, row.label, sx(row.offManifold) + 5, sy(row.recovery), "left", "middle", COLORS.text);
    });
    label(ctx, "off-manifold penalty", box.x + box.w - 18, box.y + box.h - 12, "right", "middle", COLORS.muted);
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
      drawGraph(ctx, result, { x: left, y: 42, w: plotW, h: 178 });
      drawBars(ctx, result, { x: left, y: 290, w: plotW, h: 220 });
      drawLogits(ctx, result, { x: left, y: 582, w: plotW, h: 145 });
      drawScatter(ctx, result, { x: left, y: 796, w: plotW, h: 110 });
    } else {
      var margin = 54;
      var gap = 42;
      var w = (width - margin - 24 - gap) / 2;
      drawGraph(ctx, result, { x: margin, y: 42, w: w, h: 220 });
      drawBars(ctx, result, { x: margin + w + gap, y: 42, w: w, h: 220 });
      drawLogits(ctx, result, { x: margin, y: 352, w: w, h: 170 });
      drawScatter(ctx, result, { x: margin + w + gap, y: 352, w: w, h: 170 });
    }
  }

  function parseParams(root) {
    var params = {
      backup: 35,
      mediator: 100,
      mixing: 45,
      nuisance: 70,
      saturation: 70,
      shortcut: 45
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      output.textContent = key === "saturation" || key === "mixing"
        ? params[key] + "%"
        : formatNumber(params[key] / 100, 2);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = evaluate(params);
    updateOutputs(root, params);
    root.querySelector("[data-metrics]").innerHTML = [
      metric("clean logit diff", formatNumber(result.summary.cleanLogit, 2)),
      metric("corrupt logit diff", formatNumber(result.summary.corruptLogit, 2)),
      metric("best node patch", result.bestWhole.label + " " + formatPercent(result.bestWhole.recovery, 0)),
      metric("best path patch", result.bestPath.label + " " + formatPercent(result.bestPath.recovery, 0)),
      metric("direct/nuisance share", formatPercent(result.summary.directShare, 0)),
      metric("off-manifold penalty", formatNumber(result.summary.offManifoldBestWhole, 2))
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-activation-patching-lab]"));
    labs.forEach(function (root) {
      if (root.__activationPatchingReady) return;
      root.__activationPatchingReady = true;
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
      forward: forward
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
