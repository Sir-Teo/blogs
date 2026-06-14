(function (root) {
  "use strict";

  var SEP = "\x1f";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    general: "#64748b",
    domain: "#0f766e",
    accent: "#2563eb",
    warn: "#b45309",
    purple: "#7c3aed",
    faint: "#f8fafc"
  };

  var DEFAULTS = {
    codeShare: 55,
    numberShare: 35,
    merges: 96,
    probe: "code"
  };

  var PROBES = {
    code: "attention_scores = query @ key_cache.T / sqrt(head_dim)",
    market: "2026-06-14 09:30:00 AAPL bid=193.42 ask=193.45 qty=300",
    english: "the model remembers the examples that the tokenizer made cheap",
    rare: "xqzv protocol foo_bar_baz checksum=0x9f3a retry_count=07",
    custom: "attention_scores = query @ key_cache.T / sqrt(head_dim)"
  };

  var PROBE_LABELS = {
    code: "Code",
    market: "Market log",
    english: "English",
    rare: "Rare string"
  };

  var GENERAL_ROWS = [
    "the model predicts the next token from context",
    "a probability distribution is a contract over future observations",
    "the researcher measures calibration before trusting the score",
    "language models convert strings into vectors and vectors into logits",
    "the experiment needs a control group and a clean measurement plan",
    "the essay explains the idea with a small reproducible simulation",
    "the optimizer follows gradients through a noisy objective",
    "the benchmark is useful only when the sampling process is known",
    "a useful abstraction hides details without hiding the bill",
    "memory bandwidth can dominate arithmetic in modern machine learning"
  ];

  var CODE_ROWS = [
    "attention_scores = query @ key_cache.T / sqrt(head_dim)",
    "def update_cache(key_cache, value_cache, token_index):",
    "for token_index in range(num_tokens):",
    "if retry_count > max_retries: raise TimeoutError",
    "batch_size, num_heads, head_dim = query.shape",
    "loss.backward(); optimizer.step(); optimizer.zero_grad()",
    "return logits[:, -1, :] / temperature",
    "kv_cache[layer_id][token_index] = key_value",
    "request_id = hash(user_id + session_id + timestamp)",
    "class RollingWindowAttention(nn.Module):"
  ];

  var NUMBER_ROWS = [
    "2026-06-14 09:30:00 price=104.25 qty=300 spread=0.03",
    "pnl=-1284.50 beta=1.17 vol=0.22 drawdown=0.08",
    "order_id=884291 side=buy limit=193.45 fill=193.42",
    "latency_ms=18 p50=21 p95=74 p99=143 timeout=200",
    "risk_limit=0.025 leverage=1.8 cash=124000.00",
    "seed=1729 step=4096 loss=2.381 grad_norm=0.92",
    "2026-06-14T13:45:02Z retry_count=07 status=429",
    "a=314159 b=271828 c=161803 checksum=0x9f3a",
    "feature_017 mean=0.013 std=0.871 missing=0.004",
    "episode=512 reward=18.7 value=17.9 advantage=0.8"
  ];

  var RARE_ROWS = [
    "xqzv packet framing has no convenient morpheme",
    "foo_bar_baz and quuxify are names before they are words",
    "checksum fields mix letters numbers and punctuation",
    "identifiers often compress badly outside their home corpus",
    "rare strings fall back to smaller pieces",
    "a tokenizer cannot merge a pattern it almost never sees"
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function snap(value, fallback, min, max, step) {
    var raw = Number(value);
    if (!isFinite(raw)) raw = fallback;
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var probe = PROBES[raw.probe] ? raw.probe : DEFAULTS.probe;
    var customText = typeof raw.customText === "string" ? raw.customText : PROBES[probe];
    return {
      codeShare: snap(raw.codeShare, DEFAULTS.codeShare, 0, 100, 5),
      numberShare: snap(raw.numberShare, DEFAULTS.numberShare, 0, 100, 5),
      merges: snap(raw.merges, DEFAULTS.merges, 12, 180, 4),
      probe: probe,
      customText: customText.slice(0, 180)
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (Math.abs(value) >= 1000) return (value / 1000).toFixed(1) + "k";
    return value.toFixed(digits == null ? 1 : digits);
  }

  function chars(text) {
    return Array.from(String(text));
  }

  function byteLength(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function addRows(out, rows, weight) {
    for (var i = 0; i < rows.length; i += 1) {
      out.push({ text: rows[i], weight: weight });
    }
  }

  function buildCorpus(codeShare, numberShare) {
    var rows = [];
    var generalWeight = 9 + (100 - codeShare) * 0.07 + (100 - numberShare) * 0.04;
    var codeWeight = 1.2 + codeShare * 0.16;
    var numberWeight = 1.1 + numberShare * 0.15;
    addRows(rows, GENERAL_ROWS, generalWeight);
    addRows(rows, CODE_ROWS, codeWeight);
    addRows(rows, NUMBER_ROWS, numberWeight);
    addRows(rows, RARE_ROWS, 2.4);
    return rows;
  }

  function pairKey(left, right) {
    return left + SEP + right;
  }

  function splitKey(key) {
    var idx = key.indexOf(SEP);
    return [key.slice(0, idx), key.slice(idx + 1)];
  }

  function weightedTokenCount(corpus) {
    var count = 0;
    for (var i = 0; i < corpus.length; i += 1) {
      count += corpus[i].tokens.length * corpus[i].weight;
    }
    return count;
  }

  function mergeOnce(tokens, left, right) {
    var merged = [];
    for (var i = 0; i < tokens.length; i += 1) {
      if (i < tokens.length - 1 && tokens[i] === left && tokens[i + 1] === right) {
        merged.push(left + right);
        i += 1;
      } else {
        merged.push(tokens[i]);
      }
    }
    return merged;
  }

  function learnBpe(rows, mergeBudget) {
    var corpus = rows.map(function (row) {
      return {
        tokens: chars(row.text),
        weight: row.weight
      };
    });
    var initialTokenCount = weightedTokenCount(corpus);
    var initialVocab = Object.create(null);
    for (var r = 0; r < corpus.length; r += 1) {
      for (var t = 0; t < corpus[r].tokens.length; t += 1) {
        initialVocab[corpus[r].tokens[t]] = true;
      }
    }

    var merges = [];
    for (var step = 0; step < mergeBudget; step += 1) {
      var counts = Object.create(null);
      for (var i = 0; i < corpus.length; i += 1) {
        var tokens = corpus[i].tokens;
        var weight = corpus[i].weight;
        for (var j = 0; j < tokens.length - 1; j += 1) {
          var key = pairKey(tokens[j], tokens[j + 1]);
          counts[key] = (counts[key] || 0) + weight;
        }
      }

      var bestKey = null;
      var bestCount = 0;
      Object.keys(counts).forEach(function (key) {
        var value = counts[key];
        if (value > bestCount || (value === bestCount && (bestKey == null || key < bestKey))) {
          bestKey = key;
          bestCount = value;
        }
      });
      if (!bestKey || bestCount <= 1) break;

      var parts = splitKey(bestKey);
      var left = parts[0];
      var right = parts[1];
      for (var rowIndex = 0; rowIndex < corpus.length; rowIndex += 1) {
        corpus[rowIndex].tokens = mergeOnce(corpus[rowIndex].tokens, left, right);
      }
      merges.push({
        rank: merges.length + 1,
        left: left,
        right: right,
        token: left + right,
        count: bestCount
      });
    }

    return {
      corpusTokenCount: weightedTokenCount(corpus),
      initialTokenCount: initialTokenCount,
      merges: merges,
      vocabSize: Object.keys(initialVocab).length + merges.length
    };
  }

  function encode(text, merges) {
    var tokens = chars(text);
    for (var i = 0; i < merges.length; i += 1) {
      tokens = mergeOnce(tokens, merges[i].left, merges[i].right);
    }
    return tokens;
  }

  function scoreTokens(text, tokens) {
    var bytes = byteLength(text);
    return {
      bytes: bytes,
      tokens: tokens.length,
      bytesPerToken: bytes / Math.max(1, tokens.length),
      attentionProxy: tokens.length * tokens.length
    };
  }

  function probeText(params) {
    if (params.probe === "custom") return params.customText || "";
    return PROBES[params.probe] || PROBES.code;
  }

  function suiteRows(general, domain) {
    return Object.keys(PROBE_LABELS).map(function (key) {
      var text = PROBES[key];
      var generalTokens = encode(text, general.merges);
      var domainTokens = encode(text, domain.merges);
      return {
        key: key,
        label: PROBE_LABELS[key],
        general: generalTokens.length,
        domain: domainTokens.length,
        text: text
      };
    });
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var general = learnBpe(buildCorpus(15, 15), params.merges);
    var domain = learnBpe(buildCorpus(params.codeShare, params.numberShare), params.merges);
    var text = probeText(params);
    var generalTokens = encode(text, general.merges);
    var domainTokens = encode(text, domain.merges);
    var generalScore = scoreTokens(text, generalTokens);
    var domainScore = scoreTokens(text, domainTokens);
    var suite = suiteRows(general, domain);
    var suiteGeneral = suite.reduce(function (sum, row) { return sum + row.general; }, 0) / suite.length;
    var suiteDomain = suite.reduce(function (sum, row) { return sum + row.domain; }, 0) / suite.length;

    return {
      domain: domain,
      domainScore: domainScore,
      domainTokens: domainTokens,
      general: general,
      generalScore: generalScore,
      generalTokens: generalTokens,
      params: params,
      suite: suite,
      suiteDomain: suiteDomain,
      suiteGeneral: suiteGeneral,
      text: text
    };
  }

  function tokenText(token) {
    if (token === " ") return "[space]";
    return token.replace(/ /g, "[space]");
  }

  function renderTokens(tokens) {
    return tokens.map(function (token) {
      var cls = "bpe-lab__token";
      if (/^[0-9.\-:=TZ]+$/.test(token)) cls += " bpe-lab__token--number";
      else if (/[_@().,;[\]{}]+/.test(token)) cls += " bpe-lab__token--punct";
      else if (token.indexOf(" ") >= 0) cls += " bpe-lab__token--space";
      return '<span class="' + cls + '">' + escapeHtml(tokenText(token)) + "</span>";
    }).join("");
  }

  function renderMergeToken(value) {
    return escapeHtml(tokenText(value));
  }

  function metric(label, value) {
    return '<div class="bpe-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function updateMetrics(el, result) {
    var saved = 100 * (1 - result.domain.corpusTokenCount / result.domain.initialTokenCount);
    var tokenDelta = result.domainScore.tokens - result.generalScore.tokens;
    var attentionRatio = result.domainScore.attentionProxy / Math.max(1, result.generalScore.attentionProxy);
    el.innerHTML = [
      metric("Probe tokens", result.generalScore.tokens + " -> " + result.domainScore.tokens),
      metric("Token delta", (tokenDelta > 0 ? "+" : "") + tokenDelta),
      metric("Dense attention proxy", formatNumber(attentionRatio, 2) + "x"),
      metric("Corpus compression", formatNumber(saved, 1) + "%")
    ].join("");
  }

  function updateMergeList(el, result) {
    var rows = result.domain.merges.slice(0, 12).map(function (merge) {
      return '<li><span class="bpe-lab__rank">' + merge.rank + '</span><code>' +
        renderMergeToken(merge.left) + " + " + renderMergeToken(merge.right) +
        "</code><span>" + formatNumber(merge.count, 1) + "</span></li>";
    });
    el.innerHTML = rows.join("");
  }

  function updateTokenRows(rootEl, result) {
    var generalEl = rootEl.querySelector("[data-general-tokens]");
    var domainEl = rootEl.querySelector("[data-domain-tokens]");
    var textEl = rootEl.querySelector("[data-current-probe]");
    if (textEl) textEl.textContent = result.text;
    if (generalEl) generalEl.innerHTML = renderTokens(result.generalTokens);
    if (domainEl) domainEl.innerHTML = renderTokens(result.domainTokens);
  }

  function setCanvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssWidth = Math.max(320, rect.width || canvas.clientWidth || 800);
    var cssHeight = Math.max(520, Math.min(760, cssWidth * 0.72));
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.height = cssHeight + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx: ctx, width: cssWidth, height: cssHeight };
  }

  function drawLabel(ctx, text, x, y, color, size, weight) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 600) + " " + (size || 12) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(text, x, y);
  }

  function drawPanel(ctx, x, y, w, h, title) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    drawLabel(ctx, title, x + 14, y + 24, COLORS.text, 13, 700);
  }

  function drawBars(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Probe token counts");
    var plotX = x + 92;
    var plotY = y + 44;
    var plotW = w - 122;
    var rowH = Math.min(46, (h - 70) / result.suite.length);
    var maxValue = result.suite.reduce(function (max, row) {
      return Math.max(max, row.general, row.domain);
    }, 1);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var tick = 0; tick <= 4; tick += 1) {
      var tx = plotX + plotW * tick / 4;
      ctx.beginPath();
      ctx.moveTo(tx, plotY - 8);
      ctx.lineTo(tx, plotY + rowH * result.suite.length - 2);
      ctx.stroke();
      drawLabel(ctx, String(Math.round(maxValue * tick / 4)), tx - 6, plotY + rowH * result.suite.length + 15, COLORS.muted, 10, 500);
    }

    result.suite.forEach(function (row, i) {
      var yy = plotY + i * rowH;
      drawLabel(ctx, row.label, x + 14, yy + 17, COLORS.muted, 11, 650);
      var gw = plotW * row.general / maxValue;
      var dw = plotW * row.domain / maxValue;
      ctx.fillStyle = COLORS.general;
      ctx.fillRect(plotX, yy + 4, gw, 10);
      ctx.fillStyle = COLORS.domain;
      ctx.fillRect(plotX, yy + 18, dw, 10);
      drawLabel(ctx, row.general + " / " + row.domain, plotX + Math.max(gw, dw) + 6, yy + 25, COLORS.muted, 10, 600);
    });
  }

  function drawMergeCurve(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Greedy merge savings");
    var history = result.domain.merges;
    var plotX = x + 42;
    var plotY = y + 44;
    var plotW = w - 70;
    var plotH = h - 74;
    var maxCount = history.reduce(function (max, row) { return Math.max(max, row.count); }, 1);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var grid = 0; grid <= 3; grid += 1) {
      var gy = plotY + plotH * grid / 3;
      ctx.beginPath();
      ctx.moveTo(plotX, gy);
      ctx.lineTo(plotX + plotW, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach(function (row, i) {
      var px = plotX + (history.length <= 1 ? 0 : plotW * i / (history.length - 1));
      var py = plotY + plotH - plotH * row.count / maxCount;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.lineTo(plotX, plotY + plotH);
    ctx.closePath();
    ctx.fill();

    drawLabel(ctx, "rank 1", plotX, plotY + plotH + 18, COLORS.muted, 10, 500);
    drawLabel(ctx, "rank " + history.length, plotX + plotW - 44, plotY + plotH + 18, COLORS.muted, 10, 500);
    drawLabel(ctx, formatNumber(maxCount, 0), plotX, plotY - 8, COLORS.muted, 10, 500);
  }

  function drawCost(ctx, result, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "Selected prompt cost");
    var general = result.generalScore.tokens;
    var domain = result.domainScore.tokens;
    var maxTokens = Math.max(general, domain, 1);
    var baseX = x + 36;
    var baseY = y + h - 44;
    var barW = Math.min(70, (w - 120) / 3);
    var scale = (h - 92) / maxTokens;
    var generalH = general * scale;
    var domainH = domain * scale;

    ctx.fillStyle = COLORS.general;
    ctx.fillRect(baseX + 32, baseY - generalH, barW, generalH);
    ctx.fillStyle = COLORS.domain;
    ctx.fillRect(baseX + 112, baseY - domainH, barW, domainH);
    drawLabel(ctx, String(general), baseX + 42, baseY - generalH - 8, COLORS.general, 12, 700);
    drawLabel(ctx, String(domain), baseX + 122, baseY - domainH - 8, COLORS.domain, 12, 700);
    drawLabel(ctx, "general", baseX + 25, baseY + 18, COLORS.muted, 10, 650);
    drawLabel(ctx, "domain", baseX + 108, baseY + 18, COLORS.muted, 10, 650);

    var ratio = result.domainScore.attentionProxy / Math.max(1, result.generalScore.attentionProxy);
    var sentence = "n^2 proxy: " + formatNumber(ratio, 2) + "x";
    drawLabel(ctx, sentence, x + w - 150, y + 58, ratio <= 1 ? COLORS.domain : COLORS.warn, 13, 750);
    drawLabel(ctx, "same text, different coordinates", x + w - 188, y + 80, COLORS.muted, 11, 600);
  }

  function draw(result, canvas) {
    if (!canvas || !canvas.getContext) return;
    var fitted = setCanvasSize(canvas);
    var ctx = fitted.ctx;
    var w = fitted.width;
    var h = fitted.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.faint;
    ctx.fillRect(0, 0, w, h);

    var pad = 16;
    var gap = 14;
    var topH = Math.max(260, h * 0.52);
    var leftW = Math.max(360, w * 0.58);
    var rightW = w - leftW - pad * 2 - gap;

    if (rightW < 260) {
      drawBars(ctx, result, pad, pad, w - pad * 2, topH);
      drawMergeCurve(ctx, result, pad, pad + topH + gap, w - pad * 2, h - topH - gap - pad * 2);
    } else {
      drawBars(ctx, result, pad, pad, leftW, h - pad * 2);
      drawMergeCurve(ctx, result, pad + leftW + gap, pad, rightW, (h - pad * 2 - gap) * 0.55);
      drawCost(ctx, result, pad + leftW + gap, pad + (h - pad * 2 - gap) * 0.55 + gap, rightW, (h - pad * 2 - gap) * 0.45);
    }
  }

  function updateOutputs(container, params) {
    Object.keys(params).forEach(function (key) {
      var out = container.querySelector('[data-value="' + key + '"]');
      if (!out) return;
      out.textContent = key === "merges" ? params[key] : params[key] + "%";
    });
  }

  function readState(container, previous) {
    var state = Object.assign({}, previous || DEFAULTS);
    container.querySelectorAll("[data-param]").forEach(function (el) {
      var key = el.getAttribute("data-param");
      if (el.tagName === "SELECT") state[key] = el.value;
      else if (el.tagName === "TEXTAREA") state[key] = el.value;
      else state[key] = el.value;
    });
    return cleanParams(state);
  }

  function writeProbeText(container, state) {
    var textarea = container.querySelector('[data-param="customText"]');
    if (!textarea) return;
    if (state.probe !== "custom") {
      textarea.value = PROBES[state.probe];
      state.customText = textarea.value;
    }
  }

  function initOne(container) {
    var state = Object.assign({}, DEFAULTS, { customText: PROBES[DEFAULTS.probe] });
    var canvas = container.querySelector("canvas[data-canvas]");
    var metrics = container.querySelector("[data-metrics]");
    var mergeList = container.querySelector("[data-merge-list]");
    var latest = null;

    function render() {
      state = readState(container, state);
      updateOutputs(container, state);
      latest = evaluate(state);
      if (metrics) updateMetrics(metrics, latest);
      if (mergeList) updateMergeList(mergeList, latest);
      updateTokenRows(container, latest);
      draw(latest, canvas);
    }

    container.querySelectorAll("[data-param]").forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.getAttribute("data-param") === "customText") {
          var select = container.querySelector('[data-param="probe"]');
          if (select) select.value = "custom";
        }
        render();
      });
      el.addEventListener("change", function () {
        state = readState(container, state);
        writeProbeText(container, state);
        render();
      });
    });

    if (window.ResizeObserver && canvas) {
      var observer = new ResizeObserver(function () {
        if (latest) draw(latest, canvas);
      });
      observer.observe(container);
    } else {
      window.addEventListener("resize", function () {
        if (latest) draw(latest, canvas);
      });
    }

    writeProbeText(container, state);
    render();
  }

  function init() {
    var labs = document.querySelectorAll("[data-bpe-prior-lab]");
    for (var i = 0; i < labs.length; i += 1) initOne(labs[i]);
  }

  var api = {
    buildCorpus: buildCorpus,
    cleanParams: cleanParams,
    encode: encode,
    evaluate: evaluate,
    learnBpe: learnBpe
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BPEPriorLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
