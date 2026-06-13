(function () {
  var GIB = Math.pow(1024, 3);
  var TIB = Math.pow(1024, 4);
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    weights: "#64748b",
    kv: "#0f766e",
    page: "#f59e0b",
    free: "#e2e8f0",
    overflow: "#be123c",
    read: "#7c3aed",
    prompt: "#2563eb",
    generated: "#e11d48",
    shared: "#14b8a6"
  };

  var MODELS = {
    "7b-mha": {
      label: "7B class, MHA",
      paramsB: 7,
      layers: 32,
      qHeads: 32,
      kvHeads: 32,
      headDim: 128
    },
    "7b-gqa": {
      label: "7B class, GQA",
      paramsB: 7,
      layers: 32,
      qHeads: 32,
      kvHeads: 8,
      headDim: 128
    },
    "70b-gqa": {
      label: "70B class, GQA",
      paramsB: 70,
      layers: 80,
      qHeads: 64,
      kvHeads: 8,
      headDim: 128
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatBytes(bytes) {
    var gib = bytes / GIB;
    if (gib >= 100) return gib.toFixed(0) + " GiB";
    if (gib >= 10) return gib.toFixed(1) + " GiB";
    if (gib >= 1) return gib.toFixed(2) + " GiB";
    if (bytes >= Math.pow(1024, 2)) return (bytes / Math.pow(1024, 2)).toFixed(1) + " MiB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KiB";
    return bytes.toFixed(0) + " B";
  }

  function formatTokens(tokens) {
    if (tokens >= 1000) return (tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1) + "k";
    return String(Math.round(tokens));
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value) {
    return '<div class="kv-cache-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function modelFor(params) {
    return MODELS[params.model] || MODELS["7b-gqa"];
  }

  function bytesPerToken(model, kvBytes) {
    return 2 * model.layers * model.kvHeads * model.headDim * kvBytes;
  }

  function retainedParts(params) {
    var totalPrompt = params.promptTokens;
    var sharedPrompt = totalPrompt * params.sharedPrefix / 100;
    var privatePrompt = Math.max(0, totalPrompt - sharedPrompt);
    var privateTail = privatePrompt + params.generatedTokens;
    var window = params.windowTokens;
    if (!isFinite(window)) {
      return {
        shared: sharedPrompt,
        private: privateTail,
        perRequest: sharedPrompt + privateTail
      };
    }
    var perRequest = Math.min(totalPrompt + params.generatedTokens, window);
    var retainedShared = clamp(window - privateTail, 0, sharedPrompt);
    var retainedPrivate = Math.max(0, perRequest - retainedShared);
    return {
      shared: retainedShared,
      private: retainedPrivate,
      perRequest: perRequest
    };
  }

  function ceilBlocks(tokens, blockSize) {
    if (tokens <= 0) return 0;
    return Math.ceil(tokens / blockSize) * blockSize;
  }

  function simulate(params) {
    var model = modelFor(params);
    var tokenBytes = bytesPerToken(model, params.kvBytes);
    var parts = retainedParts(params);
    var uniqueTokens = parts.shared + params.requests * parts.private;
    var allocatedTokens = ceilBlocks(parts.shared, params.blockSize) +
      params.requests * ceilBlocks(parts.private, params.blockSize);
    var perRequestNoShare = parts.perRequest;
    var noShareTokens = params.requests * ceilBlocks(perRequestNoShare, params.blockSize);
    var usedBytes = uniqueTokens * tokenBytes;
    var allocatedBytes = allocatedTokens * tokenBytes;
    var pageSlackBytes = Math.max(0, allocatedBytes - usedBytes);
    var noShareBytes = noShareTokens * tokenBytes;
    var weightBytes = model.paramsB * 1e9 * params.weightBytes;
    var totalBytes = weightBytes + allocatedBytes;
    var gpuBytes = params.gpuMemory * GIB;
    var decodeReadBytes = params.requests * parts.perRequest * tokenBytes;
    var decodeWriteBytes = params.requests * tokenBytes;
    var bandwidthBytes = params.bandwidth * TIB;
    var lowerBoundTokensPerSecond = bandwidthBytes / Math.max(1, decodeReadBytes + decodeWriteBytes);
    var perRequestAllocBytes = ceilBlocks(parts.perRequest, params.blockSize) * tokenBytes;
    var capacityRequests = weightBytes >= gpuBytes ? 0 : Math.floor((gpuBytes - weightBytes) / Math.max(1, perRequestAllocBytes));
    var prefillPairs = params.requests * params.promptTokens * Math.min(params.promptTokens, parts.perRequest);

    return {
      allocatedBytes: allocatedBytes,
      allocatedTokens: allocatedTokens,
      capacityRequests: capacityRequests,
      decodeReadBytes: decodeReadBytes,
      decodeWriteBytes: decodeWriteBytes,
      gpuBytes: gpuBytes,
      lowerBoundTokensPerSecond: lowerBoundTokensPerSecond,
      model: model,
      noShareBytes: noShareBytes,
      pageSlackBytes: pageSlackBytes,
      params: params,
      parts: parts,
      prefillPairs: prefillPairs,
      tokenBytes: tokenBytes,
      totalBytes: totalBytes,
      uniqueTokens: uniqueTokens,
      usedBytes: usedBytes,
      weightBytes: weightBytes
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

  function drawStack(ctx, x, y, w, h, rows) {
    var total = rows.reduce(function (sum, row) { return sum + row.value; }, 0);
    var cursor = x;
    rows.forEach(function (row) {
      var width = total > 0 ? w * row.value / total : 0;
      ctx.fillStyle = row.color;
      ctx.fillRect(cursor, y, width, h);
      if (width > 46) label(ctx, row.label, cursor + 7, y + h / 2, "left", "middle", row.textColor || "#ffffff");
      cursor += width;
    });
  }

  function drawMemory(ctx, result, box) {
    panel(ctx, box, "Memory bill", "weights, KV, page slack, free budget");
    var gpu = result.gpuBytes;
    var weights = Math.min(result.weightBytes, gpu);
    var kv = Math.min(result.allocatedBytes, Math.max(0, gpu - weights));
    var slack = Math.min(result.pageSlackBytes, Math.max(0, gpu - weights - kv));
    var free = Math.max(0, gpu - weights - kv - slack);
    var overflow = Math.max(0, result.totalBytes - gpu);
    var rows = [
      { label: "weights", value: weights, color: COLORS.weights },
      { label: "KV", value: kv, color: COLORS.kv },
      { label: "page slack", value: slack, color: COLORS.page },
      { label: "free", value: free, color: COLORS.free, textColor: COLORS.muted }
    ];
    if (overflow > 0) rows.push({ label: "overflow", value: overflow, color: COLORS.overflow });
    drawStack(ctx, box.x + 14, box.y + 32, box.w - 28, 42, rows);
    label(ctx, "total: " + formatBytes(result.totalBytes) + " / budget: " + formatBytes(gpu), box.x + 14, box.y + 100, "left", "middle", result.totalBytes > gpu ? COLORS.overflow : COLORS.text);
    label(ctx, "KV token: " + formatBytes(result.tokenBytes) + " per token per request", box.x + 14, box.y + 126, "left", "middle", COLORS.muted);
    label(ctx, "stored KV: " + formatBytes(result.usedBytes) + " useful + " + formatBytes(result.pageSlackBytes) + " block slack", box.x + 14, box.y + 150, "left", "middle", COLORS.muted);
  }

  function drawGrowth(ctx, result, box) {
    panel(ctx, box, "KV growth", "paged/shared versus no sharing");
    var params = result.params;
    var maxGen = Math.max(512, params.generatedTokens);
    var samples = [];
    var maxBytes = 1;
    for (var i = 0; i <= 40; i += 1) {
      var gen = maxGen * i / 40;
      var sampled = simulate(Object.assign({}, params, { generatedTokens: gen }));
      samples.push(sampled);
      maxBytes = Math.max(maxBytes, sampled.allocatedBytes, sampled.noShareBytes);
    }
    function sx(index) {
      return box.x + 36 + index / 40 * (box.w - 56);
    }
    function sy(bytes) {
      return box.y + box.h - 30 - bytes / maxBytes * (box.h - 62);
    }
    ctx.strokeStyle = COLORS.faint;
    [0.25, 0.5, 0.75].forEach(function (tick) {
      var y = sy(maxBytes * tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 36, y);
      ctx.lineTo(box.x + box.w - 20, y);
      ctx.stroke();
    });
    [
      { key: "allocatedBytes", color: COLORS.kv },
      { key: "noShareBytes", color: COLORS.overflow }
    ].forEach(function (line) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach(function (sample, index) {
        var x = sx(index);
        var y = sy(sample[line.key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    });
    label(ctx, "paged/shared", box.x + 42, box.y + 18, "left", "middle", COLORS.kv);
    label(ctx, "no sharing", box.x + box.w - 24, box.y + 18, "right", "middle", COLORS.overflow);
    label(ctx, "0", box.x + 36, box.y + box.h - 12, "center", "middle", COLORS.muted);
    label(ctx, formatTokens(maxGen) + " generated", box.x + box.w - 20, box.y + box.h - 12, "right", "middle", COLORS.muted);
    label(ctx, formatBytes(maxBytes), box.x + 4, sy(maxBytes), "left", "middle", COLORS.muted);
  }

  function drawBlocks(ctx, result, box) {
    panel(ctx, box, "Paged KV layout", "one shared prefix, repeated private tails");
    var params = result.params;
    var shared = result.parts.shared;
    var privateTokens = result.parts.private;
    var rows = Math.min(params.requests, 6);
    var maxTokens = Math.max(1, shared + privateTokens);
    var left = box.x + 42;
    var right = box.x + box.w - 16;
    var y = box.y + 28;
    var rowH = Math.min(28, (box.h - 54) / Math.max(1, rows + 1));
    function segWidth(tokens) {
      return (right - left) * tokens / maxTokens;
    }
    if (shared > 0) {
      var sharedWidth = segWidth(shared);
      ctx.fillStyle = COLORS.shared;
      ctx.fillRect(left, y, sharedWidth, rowH);
      if (sharedWidth > 110) label(ctx, "shared prefix", left + 6, y + rowH / 2, "left", "middle", "#ffffff");
      else if (sharedWidth > 58) label(ctx, "shared", left + 6, y + rowH / 2, "left", "middle", "#ffffff");
    }
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(left + segWidth(shared), y, right - left - segWidth(shared), rowH);
    y += rowH + 12;
    for (var r = 0; r < rows; r += 1) {
      var retainedGenerated = Math.min(params.generatedTokens, privateTokens);
      var privatePrompt = Math.max(0, privateTokens - retainedGenerated);
      ctx.fillStyle = COLORS.prompt;
      ctx.fillRect(left, y, segWidth(privatePrompt), rowH);
      ctx.fillStyle = COLORS.generated;
      ctx.fillRect(left + segWidth(privatePrompt), y, segWidth(retainedGenerated), rowH);
      var allocated = ceilBlocks(privateTokens, params.blockSize);
      var slack = Math.max(0, allocated - privateTokens);
      if (slack > 0) {
        ctx.fillStyle = COLORS.page;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(left + segWidth(privateTokens), y, segWidth(slack), rowH);
        ctx.globalAlpha = 1;
      }
      label(ctx, "req " + (r + 1), box.x + 10, y + rowH / 2, "left", "middle", COLORS.muted);
      y += rowH + 6;
    }
    label(ctx, "blue private prompt, red generated tokens, amber block slack", left, box.y + box.h - 10, "left", "bottom", COLORS.muted);
  }

  function drawTraffic(ctx, result, box) {
    panel(ctx, box, "Decode traffic", "attention reads old KV every new token");
    var params = result.params;
    var model = result.model;
    var tokenBytes = bytesPerToken(model, params.kvBytes);
    var maxContext = Math.max(1024, params.promptTokens + params.generatedTokens);
    var maxBytes = Math.max(1, params.requests * maxContext * tokenBytes);
    function sx(index) {
      return box.x + 34 + index / 36 * (box.w - 54);
    }
    function sy(bytes) {
      return box.y + box.h - 34 - bytes / maxBytes * (box.h - 64);
    }
    ctx.strokeStyle = COLORS.faint;
    [0.25, 0.5, 0.75].forEach(function (tick) {
      var y = sy(maxBytes * tick);
      ctx.beginPath();
      ctx.moveTo(box.x + 34, y);
      ctx.lineTo(box.x + box.w - 20, y);
      ctx.stroke();
    });
    ctx.strokeStyle = COLORS.read;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i <= 36; i += 1) {
      var context = maxContext * i / 36;
      var bytes = params.requests * context * tokenBytes;
      if (i === 0) ctx.moveTo(sx(i), sy(bytes));
      else ctx.lineTo(sx(i), sy(bytes));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    var pointX = sx(36 * result.parts.perRequest / maxContext);
    var pointY = sy(result.decodeReadBytes);
    ctx.fillStyle = COLORS.read;
    ctx.beginPath();
    ctx.arc(pointX, pointY, 4, 0, 2 * Math.PI);
    ctx.fill();
    label(ctx, formatBytes(result.decodeReadBytes) + " read/token", box.x + 38, box.y + 20, "left", "middle", COLORS.read);
    label(ctx, "HBM lower bound: " + formatNumber(result.lowerBoundTokensPerSecond, 1) + " tok/s", box.x + 38, box.y + 44, "left", "middle", COLORS.muted);
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
      var margin = 40;
      var plotW = width - margin - 18;
      drawMemory(ctx, result, { x: margin, y: 38, w: plotW, h: 180 });
      drawGrowth(ctx, result, { x: margin, y: 282, w: plotW, h: 180 });
      drawBlocks(ctx, result, { x: margin, y: 528, w: plotW, h: 170 });
      drawTraffic(ctx, result, { x: margin, y: 770, w: plotW, h: 140 });
    } else {
      var left = 54;
      var gap = 42;
      var topW = (width - left - 24 - gap) / 2;
      drawMemory(ctx, result, { x: left, y: 42, w: topW, h: 180 });
      drawGrowth(ctx, result, { x: left + topW + gap, y: 42, w: topW, h: 180 });
      drawBlocks(ctx, result, { x: left, y: 300, w: topW, h: 220 });
      drawTraffic(ctx, result, { x: left + topW + gap, y: 300, w: topW, h: 220 });
    }
  }

  function parseParams(root) {
    var params = {
      bandwidth: 1.6,
      blockSize: 16,
      generatedTokens: 1024,
      gpuMemory: 80,
      kvBytes: 2,
      model: "7b-gqa",
      promptTokens: 8192,
      requests: 8,
      sharedPrefix: 30,
      weightBytes: 2,
      windowTokens: Infinity
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = input.tagName === "SELECT" ? input.value : Number(input.value);
      if (key === "model") params.model = value;
      else if (key === "windowTokens") params.windowTokens = value === "full" ? Infinity : Number(value);
      else params[key] = Number(value);
    });
    params.requests = Math.max(1, Math.round(params.requests));
    params.promptTokens = Math.max(1, Math.round(params.promptTokens));
    params.generatedTokens = Math.max(0, Math.round(params.generatedTokens));
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "promptTokens" || key === "generatedTokens") output.textContent = formatTokens(params[key]);
      else if (key === "sharedPrefix") output.textContent = params[key] + "%";
      else if (key === "bandwidth") output.textContent = formatNumber(params[key], 1) + " TiB/s";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    updateOutputs(root, params);
    metrics.innerHTML = [
      metric("KV per token", formatBytes(result.tokenBytes)),
      metric("KV cache", formatBytes(result.allocatedBytes)),
      metric("weights", formatBytes(result.weightBytes)),
      metric("total", formatBytes(result.totalBytes)),
      metric("decode read", formatBytes(result.decodeReadBytes)),
      metric("GPU capacity", result.capacityRequests + " req")
    ].join("");
    drawChart(root.querySelector("[data-canvas]"), result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-kv-cache-lab]"));
    labs.forEach(function (root) {
      if (root.__kvCacheLabReady) return;
      root.__kvCacheLabReady = true;
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
      bytesPerToken: bytesPerToken,
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
