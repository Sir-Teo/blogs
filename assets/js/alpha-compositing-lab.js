(function (root) {
  "use strict";

  var COLORS = {
    ink: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    ideal: "#0f766e",
    straight: "#be123c",
    premul: "#2563eb",
    gamma: "#d97706",
    linear: "#7c3aed"
  };

  var MATTE_COLORS = {
    cyan: [0.02, 0.68, 1.00],
    magenta: [0.95, 0.08, 0.85],
    black: [0.00, 0.00, 0.00],
    white: [1.00, 1.00, 1.00]
  };

  var BACKDROPS = {
    paper: [1.00, 1.00, 1.00],
    night: [0.05, 0.07, 0.10],
    sky: [0.10, 0.24, 0.72]
  };

  var DEFAULTS = {
    edge: 50,
    opacity: 50,
    matte: "cyan",
    backdrop: "paper"
  };

  var FOREGROUND = [1.00, 0.18, 0.04];
  var GAMMA_DEST = [0.08, 0.22, 1.00];
  var AUDIT_CACHE = null;

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var matte = Object.prototype.hasOwnProperty.call(MATTE_COLORS, raw.matte) ? raw.matte : DEFAULTS.matte;
    var backdrop = Object.prototype.hasOwnProperty.call(BACKDROPS, raw.backdrop) ? raw.backdrop : DEFAULTS.backdrop;
    return {
      edge: clamp(Math.round(finite(raw.edge == null ? DEFAULTS.edge : raw.edge, DEFAULTS.edge)), 0, 100),
      opacity: clamp(Math.round(finite(raw.opacity == null ? DEFAULTS.opacity : raw.opacity, DEFAULTS.opacity)), 1, 100),
      matte: matte,
      backdrop: backdrop
    };
  }

  function mix(a, b, t) {
    return a.map(function (x, i) { return x * (1 - t) + b[i] * t; });
  }

  function scale(a, s) {
    return a.map(function (x) { return x * s; });
  }

  function add(a, b) {
    return a.map(function (x, i) { return x + b[i]; });
  }

  function overPremul(srcPremul, srcA, dstPremul, dstA) {
    var outA = srcA + dstA * (1 - srcA);
    return {
      rgb: add(srcPremul, scale(dstPremul, 1 - srcA)),
      a: outA
    };
  }

  function overStraight(srcRgb, srcA, dstRgb, dstA) {
    var dstPremul = scale(dstRgb, dstA);
    var out = overPremul(scale(srcRgb, srcA), srcA, dstPremul, dstA);
    return {
      rgb: out.a > 1e-12 ? scale(out.rgb, 1 / out.a) : [0, 0, 0],
      premul: out.rgb,
      a: out.a
    };
  }

  function compositeOverOpaque(srcRgb, srcA, backdrop) {
    return add(scale(srcRgb, srcA), scale(backdrop, 1 - srcA));
  }

  function sampledStraight(edge, matte) {
    var t = clamp(edge, 0, 1);
    return {
      rgb: mix(FOREGROUND, matte, t),
      a: 1 - t
    };
  }

  function sampledPremul(edge, matte) {
    var t = clamp(edge, 0, 1);
    var inside = scale(FOREGROUND, 1);
    var outside = scale(matte, 0);
    return {
      premul: mix(inside, outside, t),
      a: 1 - t
    };
  }

  function edgeComparison(params) {
    var edge = params.edge / 100;
    var matte = MATTE_COLORS[params.matte];
    var backdrop = BACKDROPS[params.backdrop];
    var straight = sampledStraight(edge, matte);
    var premul = sampledPremul(edge, matte);
    var ideal = compositeOverOpaque(FOREGROUND, premul.a, backdrop);
    var straightOut = compositeOverOpaque(straight.rgb, straight.a, backdrop);
    var premulOut = add(premul.premul, scale(backdrop, 1 - premul.a));
    return {
      edge: edge,
      matte: matte,
      backdrop: backdrop,
      alpha: premul.a,
      straightSample: straight.rgb,
      straightOut: straightOut,
      premulOut: premulOut,
      idealOut: ideal,
      fringeError: rms(straightOut, ideal),
      premulError: rms(premulOut, ideal)
    };
  }

  function srgbToLinear(c) {
    c = clamp(c, 0, 1);
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    c = clamp(c, 0, 1);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  function blendSrgbCode(src, dst, alpha) {
    return add(scale(src, alpha), scale(dst, 1 - alpha));
  }

  function blendLinearLight(src, dst, alpha) {
    var mixed = src.map(function (c, i) {
      return srgbToLinear(c) * alpha + srgbToLinear(dst[i]) * (1 - alpha);
    });
    return mixed.map(linearToSrgb);
  }

  function luminance(rgb) {
    var r = srgbToLinear(rgb[0]);
    var g = srgbToLinear(rgb[1]);
    var b = srgbToLinear(rgb[2]);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function gammaComparison(params) {
    var alpha = params.opacity / 100;
    var code = blendSrgbCode(FOREGROUND, GAMMA_DEST, alpha);
    var linear = blendLinearLight(FOREGROUND, GAMMA_DEST, alpha);
    return {
      alpha: alpha,
      code: code,
      linear: linear,
      rmsDelta: rms(code, linear),
      codeLuminance: luminance(code),
      linearLuminance: luminance(linear),
      luminanceRatio: luminance(code) / Math.max(1e-12, luminance(linear))
    };
  }

  function rms(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i += 1) {
      total += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(total / a.length);
  }

  function hex(rgb) {
    return "#" + rgb.map(function (x) {
      var n = clamp(Math.round(x * 255), 0, 255);
      return n.toString(16).padStart(2, "0");
    }).join("");
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var edge = edgeComparison(params);
    var gamma = gammaComparison(params);
    var srcA = params.opacity / 100;
    var dstA = 0.72;
    var sourceOver = overPremul(scale(FOREGROUND, srcA), srcA, scale(BACKDROPS[params.backdrop], dstA), dstA);
    return {
      params: params,
      foreground: FOREGROUND.slice(),
      gammaDest: GAMMA_DEST.slice(),
      edge: edge,
      gamma: gamma,
      sourceOver: sourceOver,
      colors: {
        ideal: hex(edge.idealOut),
        straight: hex(edge.straightOut),
        premul: hex(edge.premulOut),
        srgbCode: hex(gamma.code),
        linearLight: hex(gamma.linear)
      }
    };
  }

  function round(value, places) {
    var scaleValue = Math.pow(10, places == null ? 3 : places);
    var out = Math.round(value * scaleValue) / scaleValue;
    return Object.is(out, -0) ? 0 : out;
  }

  function roundedFacts(result) {
    return {
      edgeAlpha: round(result.edge.alpha, 3),
      fringeError: round(result.edge.fringeError, 4),
      premulError: round(result.edge.premulError, 6),
      srgbDelta: round(result.gamma.rmsDelta, 4),
      codeLuminance: round(result.gamma.codeLuminance, 4),
      linearLuminance: round(result.gamma.linearLuminance, 4),
      luminanceRatio: round(result.gamma.luminanceRatio, 3),
      straightHex: result.colors.straight,
      premulHex: result.colors.premul,
      linearHex: result.colors.linearLight
    };
  }

  function nearly(a, b, eps) {
    return Math.abs(a - b) <= (eps || 1e-9);
  }

  function runAudit() {
    if (AUDIT_CACHE) return AUDIT_CACHE;
    var failures = [];
    function record(name, ok) {
      if (!ok) failures.push(name);
    }

    var result = evaluate({});
    var facts = roundedFacts(result);
    record("source over alpha formula", nearly(result.sourceOver.a, 0.5 + 0.72 * 0.5));
    record("premultiplied edge matches ideal", result.edge.premulError < 1e-12);
    record("straight edge leaks hidden matte", result.edge.fringeError > 0.08);
    record("default straight and premul differ", facts.straightHex !== facts.premulHex);
    record("linear light is brighter than code blend", result.gamma.linearLuminance > result.gamma.codeLuminance);
    record("sRGB delta visible", result.gamma.rmsDelta > 0.08);

    var black = evaluate({ matte: "black" });
    var cyan = evaluate({ matte: "cyan" });
    record("straight edge depends on transparent color", rms(black.edge.straightOut, cyan.edge.straightOut) > 0.1);
    record("premul edge ignores transparent color", rms(black.edge.premulOut, cyan.edge.premulOut) < 1e-12);

    var hardInside = evaluate({ edge: 0 });
    var hardOutside = evaluate({ edge: 100 });
    record("opaque edge has no fringe", hardInside.edge.fringeError < 1e-12);
    record("transparent edge premul over backdrop", rms(hardOutside.edge.premulOut, hardOutside.edge.backdrop) < 1e-12);

    var neutralGamma = evaluate({ opacity: 100 });
    record("opaque blend has no gamma disagreement", neutralGamma.gamma.rmsDelta < 1e-12);

    var bad = evaluate({ edge: -99, opacity: Infinity, matte: "bogus", backdrop: "bogus" });
    record("bad inputs sanitize", bad.params.edge === 0 && bad.params.opacity === DEFAULTS.opacity && bad.params.matte === DEFAULTS.matte);

    record("sRGB round trip midpoint", nearly(linearToSrgb(srgbToLinear(0.5)), 0.5, 1e-12));
    record("hex output is valid", /^#[0-9a-f]{6}$/.test(result.colors.linearLight));
    record("facts are finite", Object.keys(facts).every(function (key) {
      return typeof facts[key] === "string" || Number.isFinite(facts[key]);
    }));

    AUDIT_CACHE = {
      passed: 15 - failures.length,
      checked: 15,
      failures: failures,
      defaultFacts: facts
    };
    return AUDIT_CACHE;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  }

  function metric(label, value) {
    return '<div class="alpha-lab__metric"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function option(value, label, selected) {
    return '<option value="' + escapeHtml(value) + '"' + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function range(label, role, min, max, step, value, suffix) {
    return [
      '<label>',
      '<span>' + escapeHtml(label) + ' <output data-out="' + escapeHtml(role) + '">' + escapeHtml(value + suffix) + '</output></span>',
      '<input type="range" data-role="' + escapeHtml(role) + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + escapeHtml(value) + '">',
      '</label>'
    ].join("");
  }

  function mount(el) {
    var state = cleanParams({
      edge: el.getAttribute("data-edge") || DEFAULTS.edge,
      opacity: el.getAttribute("data-opacity") || DEFAULTS.opacity,
      matte: el.getAttribute("data-matte") || DEFAULTS.matte,
      backdrop: el.getAttribute("data-backdrop") || DEFAULTS.backdrop
    });

    el.innerHTML = [
      '<div class="alpha-lab__controls">',
      '<label><span>Hidden matte</span><select data-role="matte">',
      option("cyan", "cyan", state.matte === "cyan"),
      option("magenta", "magenta", state.matte === "magenta"),
      option("black", "black", state.matte === "black"),
      option("white", "white", state.matte === "white"),
      '</select></label>',
      '<label><span>Backdrop</span><select data-role="backdrop">',
      option("paper", "paper", state.backdrop === "paper"),
      option("night", "night", state.backdrop === "night"),
      option("sky", "sky", state.backdrop === "sky"),
      '</select></label>',
      range("Edge sample", "edge", 0, 100, 1, state.edge, "%"),
      range("Layer opacity", "opacity", 1, 100, 1, state.opacity, "%"),
      '</div>',
      '<div class="alpha-lab__summary" data-role="summary"></div>',
      '<canvas class="alpha-lab__canvas" data-role="canvas" aria-label="Alpha compositing visualization"></canvas>',
      '<div class="alpha-lab__legend" data-role="legend"></div>'
    ].join("");

    function read() {
      state = cleanParams({
        matte: el.querySelector('[data-role="matte"]').value,
        backdrop: el.querySelector('[data-role="backdrop"]').value,
        edge: el.querySelector('[data-role="edge"]').value,
        opacity: el.querySelector('[data-role="opacity"]').value
      });
    }

    function update() {
      read();
      setOutput(el, "edge", state.edge + "%");
      setOutput(el, "opacity", state.opacity + "%");
      var result = evaluate(state);
      renderSummary(el.querySelector('[data-role="summary"]'), result);
      renderCanvas(el.querySelector('[data-role="canvas"]'), result);
      renderLegend(el.querySelector('[data-role="legend"]'), result);
    }

    Array.from(el.querySelectorAll("input, select")).forEach(function (input) {
      input.addEventListener(input.tagName === "SELECT" ? "change" : "input", update);
    });
    window.addEventListener("resize", update);
    update();
  }

  function setOutput(rootEl, role, text) {
    var out = rootEl.querySelector('[data-out="' + role + '"]');
    if (out) out.textContent = text;
  }

  function renderSummary(target, result) {
    var facts = roundedFacts(result);
    target.innerHTML = [
      '<div class="alpha-lab__metrics">',
      metric("edge alpha", facts.edgeAlpha),
      metric("straight error", facts.fringeError),
      metric("premul error", facts.premulError),
      metric("sRGB delta", facts.srgbDelta),
      metric("luma ratio", facts.luminanceRatio),
      metric("linear blend", facts.linearHex),
      '</div>'
    ].join("");
  }

  function renderLegend(target, result) {
    var audit = runAudit();
    target.innerHTML = [
      '<span><i class="is-ideal"></i> ideal edge</span>',
      '<span><i class="is-straight"></i> straight alpha sample</span>',
      '<span><i class="is-premul"></i> premultiplied sample</span>',
      '<span><i class="is-gamma"></i> sRGB-code blend</span>',
      '<span><i class="is-linear"></i> linear-light blend</span>',
      '<span>Audit ' + audit.passed + '/' + audit.checked + '</span>',
      '<span>' + escapeHtml(result.edge.fringeError > 0.02 ? "hidden color is visible" : "edge is clean") + '</span>'
    ].join("");
  }

  function resizeCanvas(canvas, cssHeight) {
    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || canvas.parentNode.clientWidth || 640));
    var height = cssHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fillRgb(ctx, rgb) {
    ctx.fillStyle = hex(rgb);
  }

  function panel(ctx, x, y, w, h, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(title, x + 12, y + 19);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(subtitle, x + 12, y + 36);
    }
  }

  function swatch(ctx, x, y, w, h, rgb, label, color) {
    fillRgb(ctx, rgb);
    drawRoundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = color || COLORS.rule;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = luminance(rgb) > 0.45 ? COLORS.ink : "#ffffff";
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.fillText(label, x + 9, y + 20);
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(hex(rgb), x + 9, y + h - 11);
  }

  function drawEdgePanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Filtered edge", "transparent pixels still have RGB in straight-alpha textures");
    var top = y + 52;
    var rowH = 34;
    drawGradientRow(ctx, result, x + 14, top, w - 28, rowH, "straight");
    drawGradientRow(ctx, result, x + 14, top + 48, w - 28, rowH, "premul");
    var markerX = x + 14 + (w - 28) * result.edge.edge;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(markerX, top - 5);
    ctx.lineTo(markerX, top + rowH * 2 + 53);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("sample", markerX + 5, top + rowH * 2 + 53);
  }

  function drawGradientRow(ctx, result, x, y, w, h, mode) {
    var steps = Math.max(40, Math.floor(w));
    for (var i = 0; i < steps; i += 1) {
      var edge = i / Math.max(1, steps - 1);
      var local = edgeComparison({
        edge: edge * 100,
        matte: result.params.matte,
        backdrop: result.params.backdrop
      });
      fillRgb(ctx, mode === "straight" ? local.straightOut : local.premulOut);
      ctx.fillRect(x + i * w / steps, y, Math.ceil(w / steps) + 1, h);
    }
    ctx.strokeStyle = mode === "straight" ? COLORS.straight : COLORS.premul;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.fillText(mode === "straight" ? "straight sample" : "premultiplied sample", x + 8, y + 21);
  }

  function drawSwatchPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "The selected edge sample", "same alpha, different stored color meaning");
    var sw = (w - 42) / 3;
    var top = y + 54;
    swatch(ctx, x + 14, top, sw, 78, result.edge.idealOut, "ideal", COLORS.ideal);
    swatch(ctx, x + 21 + sw, top, sw, 78, result.edge.straightOut, "straight", COLORS.straight);
    swatch(ctx, x + 28 + sw * 2, top, sw, 78, result.edge.premulOut, "premul", COLORS.premul);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("RMS straight error " + roundedFacts(result).fringeError + "; premul error " + roundedFacts(result).premulError, x + 14, top + 105);
  }

  function drawGammaPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Blending in code values", "sRGB numbers are not linear light");
    var left = x + 16;
    var top = y + 55;
    var barW = w - 32;
    drawBlendRamp(ctx, result, left, top, barW, 34, "code");
    drawBlendRamp(ctx, result, left, top + 54, barW, 34, "linear");
    var markerX = left + barW * result.gamma.alpha;
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath();
    ctx.moveTo(markerX, top - 5);
    ctx.lineTo(markerX, top + 98);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("code luminance / linear luminance = " + roundedFacts(result).luminanceRatio, left, top + 122);
  }

  function drawBlendRamp(ctx, result, x, y, w, h, mode) {
    var steps = Math.max(40, Math.floor(w));
    for (var i = 0; i < steps; i += 1) {
      var a = i / Math.max(1, steps - 1);
      var rgb = mode === "code" ? blendSrgbCode(FOREGROUND, GAMMA_DEST, a) : blendLinearLight(FOREGROUND, GAMMA_DEST, a);
      fillRgb(ctx, rgb);
      ctx.fillRect(x + i * w / steps, y, Math.ceil(w / steps) + 1, h);
    }
    ctx.strokeStyle = mode === "code" ? COLORS.gamma : COLORS.linear;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.fillText(mode === "code" ? "sRGB-code blend" : "linear-light blend", x + 8, y + 21);
  }

  function drawFormulaPanel(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Source-over ledger", "associated color keeps color and coverage together");
    var lines = [
      "co = cs + cb(1 - alpha_s)",
      "alpha_o = alpha_s + alpha_b(1 - alpha_s)",
      "default alpha_o = " + round(result.sourceOver.a, 3),
      "premul stores RGB already multiplied by alpha"
    ];
    ctx.fillStyle = COLORS.ink;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (var i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], x + 14, y + 56 + i * 25);
    }
  }

  function renderCanvas(canvas, result) {
    var box = resizeCanvas(canvas, 720);
    var ctx = box.ctx;
    var w = box.width;
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, box.width, box.height);
    var pad = 14;
    var gap = 12;
    var twoCol = w >= 620;
    if (twoCol) {
      var col = (w - pad * 2 - gap) / 2;
      drawEdgePanel(ctx, result, pad, 16, col, 190);
      drawSwatchPanel(ctx, result, pad + col + gap, 16, col, 190);
      drawGammaPanel(ctx, result, pad, 222, col, 205);
      drawFormulaPanel(ctx, result, pad + col + gap, 222, col, 205);
      drawTakeaway(ctx, result, pad, 445, w - pad * 2, 240);
    } else {
      drawEdgePanel(ctx, result, pad, 16, w - pad * 2, 160);
      drawSwatchPanel(ctx, result, pad, 190, w - pad * 2, 160);
      drawGammaPanel(ctx, result, pad, 364, w - pad * 2, 170);
      drawFormulaPanel(ctx, result, pad, 548, w - pad * 2, 145);
    }
  }

  function drawTakeaway(ctx, result, x, y, w, h) {
    panel(ctx, x, y, w, h, "Read the edge, not the center", "most alpha bugs live where alpha is neither zero nor one");
    var facts = roundedFacts(result);
    var lines = [
      "At this sample the edge alpha is " + facts.edgeAlpha + ". Premultiplication gives the ideal over result exactly.",
      "Straight RGBA lets the hidden " + result.params.matte + " matte tint leak into filtering: error " + facts.fringeError + ".",
      "The same source-over blend in sRGB code values has RMS color delta " + facts.srgbDelta + " from linear-light blending.",
      "If a pipeline says alpha is just opacity, ask: associated with which color space?"
    ];
    ctx.fillStyle = COLORS.ink;
    ctx.font = "12px system-ui, sans-serif";
    for (var i = 0; i < lines.length; i += 1) {
      wrapText(ctx, lines[i], x + 14, y + 54 + i * 38, w - 28, 16, 2);
    }
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = text.split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines += 1;
        line = words[i];
        if (lines >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
  }

  function init() {
    var nodes = document.querySelectorAll("[data-alpha-lab]");
    for (var i = 0; i < nodes.length; i += 1) mount(nodes[i]);
  }

  var api = {
    evaluate: evaluate,
    runAudit: runAudit,
    roundedFacts: roundedFacts,
    overPremul: overPremul,
    overStraight: overStraight,
    srgbToLinear: srgbToLinear,
    linearToSrgb: linearToSrgb,
    blendSrgbCode: blendSrgbCode,
    blendLinearLight: blendLinearLight
  };

  root.AlphaCompositingLab = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
