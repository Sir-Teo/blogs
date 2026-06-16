(function () {
  "use strict";

  var CASES = [
    {
      label: "canonical accent",
      existing: "éclair",
      candidate: "e\u0301clair",
      note: "same abstract accent, different code points"
    },
    {
      label: "compatibility letter",
      existing: "kilo",
      candidate: "\u212Ailo",
      note: "Kelvin sign normalizes to K"
    },
    {
      label: "invisible joiner",
      existing: "admin",
      candidate: "ad\u200Dmin",
      note: "zero-width joiner survives raw equality"
    },
    {
      label: "Cyrillic lookalike",
      existing: "paypal",
      candidate: "\u0440\u0430\u0443\u0440\u0430l",
      note: "Cyrillic letters imitate Latin ones"
    },
    {
      label: "whole-script lookalike",
      existing: "scope",
      candidate: "\u0455\u0441\u043E\u0440\u0435",
      note: "single-script Cyrillic can still spoof Latin"
    },
    {
      label: "sharp s",
      existing: "strasse",
      candidate: "straße",
      note: "case folding is not just lowercasing"
    },
    {
      label: "Roman numeral",
      existing: "IV",
      candidate: "\u2163",
      note: "compatibility form expands to two letters"
    },
    {
      label: "Greek first letter",
      existing: "amazon",
      candidate: "\u0391mazon",
      note: "one script switch inside a familiar name"
    }
  ];

  var POLICIES = [
    { id: "raw", label: "raw equality" },
    { id: "nfc", label: "NFC" },
    { id: "nfkc-fold", label: "NFKC + fold" },
    { id: "identifier", label: "identifier key" },
    { id: "skeleton", label: "skeleton guard" }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    raw: "#64748b",
    nfc: "#2563eb",
    nfkc: "#0f766e",
    ident: "#b45309",
    skeleton: "#be123c",
    ok: "#0f766e",
    warn: "#be123c",
    panel: "#f8fafc",
    mixed: "#7c3aed"
  };

  var CONFUSABLES = {
    "\u0391": "a",
    "\u03B1": "a",
    "\u0410": "a",
    "\u0430": "a",
    "\u03BF": "o",
    "\u041E": "o",
    "\u043E": "o",
    "\u03A1": "p",
    "\u0440": "p",
    "\u0420": "p",
    "\u0441": "c",
    "\u0421": "c",
    "\u0455": "s",
    "\u0405": "s",
    "\u0435": "e",
    "\u0415": "e",
    "\u0443": "y",
    "\u03A5": "y",
    "\u04CF": "l",
    "\u2163": "iv",
    "\u2160": "i",
    "\u2170": "i",
    "\u212A": "k"
  };

  var CASEFOLD = {
    "\u00DF": "ss",
    "\u1E9E": "ss",
    "\u0130": "i\u0307",
    "\u03C2": "\u03C3"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chars(str) {
    return Array.from(str);
  }

  function hex(cp) {
    return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  }

  function codePoints(str) {
    return chars(str).map(function (ch) {
      return hex(ch.codePointAt(0));
    });
  }

  function isIgnorable(ch) {
    var cp = ch.codePointAt(0);
    return cp === 0x00AD ||
      cp === 0x034F ||
      cp === 0x061C ||
      (cp >= 0x200B && cp <= 0x200F) ||
      (cp >= 0x202A && cp <= 0x202E) ||
      (cp >= 0x2060 && cp <= 0x206F) ||
      (cp >= 0xFE00 && cp <= 0xFE0F) ||
      cp === 0xFEFF;
  }

  function stripIgnorables(str) {
    return chars(str).filter(function (ch) {
      return !isIgnorable(ch);
    }).join("");
  }

  function foldCase(str) {
    return chars(str.normalize("NFKC")).map(function (ch) {
      return Object.prototype.hasOwnProperty.call(CASEFOLD, ch) ? CASEFOLD[ch] : ch.toLowerCase();
    }).join("").normalize("NFC");
  }

  function skeleton(str) {
    return chars(stripIgnorables(foldCase(str)).normalize("NFD")).map(function (ch) {
      return Object.prototype.hasOwnProperty.call(CONFUSABLES, ch) ? CONFUSABLES[ch] : ch;
    }).join("").normalize("NFC");
  }

  function scriptOf(ch) {
    if (isIgnorable(ch)) return "Ignorable";
    if (/^[A-Za-z0-9_.-]$/.test(ch)) return "Latin";
    var cp = ch.codePointAt(0);
    if ((cp >= 0x0300 && cp <= 0x036F) || cp === 0x200C || cp === 0x200D) return "Inherited";
    if (cp <= 0x024F || (cp >= 0x1E00 && cp <= 0x1EFF)) return "Latin";
    if (cp >= 0x0370 && cp <= 0x03FF) return "Greek";
    if (cp >= 0x0400 && cp <= 0x052F) return "Cyrillic";
    if (cp >= 0x0590 && cp <= 0x05FF) return "Hebrew";
    if (cp >= 0x0600 && cp <= 0x06FF) return "Arabic";
    if ((cp >= 0x2000 && cp <= 0x206F) || (cp >= 0xFE00 && cp <= 0xFE0F)) return "Common";
    return "Other";
  }

  function scripts(str) {
    var seen = {};
    chars(str).forEach(function (ch) {
      var s = scriptOf(ch);
      if (s !== "Common" && s !== "Inherited" && s !== "Ignorable") seen[s] = true;
    });
    return Object.keys(seen).sort();
  }

  function mixedScript(str) {
    return scripts(str).length > 1;
  }

  function keyFor(policy, str) {
    if (policy === "raw") return str;
    if (policy === "nfc") return str.normalize("NFC");
    if (policy === "nfkc-fold") return foldCase(str);
    if (policy === "identifier") return stripIgnorables(foldCase(str));
    return skeleton(str);
  }

  function policyFlags(policy, candidate) {
    return {
      mixed: policy === "skeleton" && mixedScript(candidate),
      invisible: policy !== "raw" && chars(candidate).some(isIgnorable)
    };
  }

  function evaluateCase(item, policyIndex) {
    var policy = POLICIES[policyIndex].id;
    var existingKey = keyFor(policy, item.existing);
    var candidateKey = keyFor(policy, item.candidate);
    var flags = policyFlags(policy, item.candidate);
    var keyCollision = existingKey === candidateKey;
    return {
      accepted: !(keyCollision || flags.mixed),
      candidateKey: candidateKey,
      existingKey: existingKey,
      flags: flags,
      keyCollision: keyCollision,
      policy: policy,
      policyLabel: POLICIES[policyIndex].label
    };
  }

  function layersFor(item) {
    return POLICIES.map(function (policy, index) {
      return {
        index: index,
        label: policy.label,
        result: evaluateCase(item, index)
      };
    });
  }

  function allStats(policyIndex) {
    var collisions = 0;
    var mixed = 0;
    var invisible = 0;
    CASES.forEach(function (item) {
      var e = evaluateCase(item, policyIndex);
      if (e.keyCollision) collisions += 1;
      if (e.flags.mixed) mixed += 1;
      if (e.flags.invisible) invisible += 1;
    });
    return { collisions: collisions, mixed: mixed, invisible: invisible };
  }

  function formatList(values) {
    return values.length ? values.join(", ") : "none";
  }

  function shortText(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
  }

  function metric(label, value) {
    return '<div class="unicode-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle && ctx.measureText(title).width + ctx.measureText(subtitle).width + 24 < box.w) {
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.fillText(subtitle, box.x + box.w, box.y - 12);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
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

  function fillCard(ctx, x, y, w, h, color) {
    ctx.fillStyle = color || COLORS.panel;
    roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = COLORS.rule;
    ctx.stroke();
  }

  function drawSpecimen(ctx, item, result, box) {
    panel(ctx, box, "Candidate inspection", item.label);
    fillCard(ctx, box.x + 12, box.y + 18, box.w - 24, 62, "#ffffff");
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("existing", box.x + 24, box.y + 26);
    ctx.fillText("candidate", box.x + box.w * 0.52, box.y + 26);
    ctx.fillStyle = COLORS.text;
    ctx.font = "22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(item.existing, box.x + 24, box.y + 48);
    ctx.fillText(item.candidate, box.x + box.w * 0.52, box.y + 48);
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    var rows = [
      ["scripts", formatList(scripts(item.candidate))],
      ["policy key", shortText(result.candidateKey, 30)],
      ["decision", result.accepted ? "accept" : "block / review"]
    ];
    rows.forEach(function (row, i) {
      var y = box.y + 108 + i * 26;
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "left";
      ctx.fillText(row[0], box.x + 14, y);
      ctx.fillStyle = i === 2 ? (result.accepted ? COLORS.ok : COLORS.warn) : COLORS.text;
      ctx.fillText(row[1], box.x + box.w * 0.34, y);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(item.note, box.x + 14, box.y + box.h - 22);
  }

  function drawLayerTable(ctx, item, box) {
    panel(ctx, box, "Layers catch different bugs", "collision by policy");
    var rows = layersFor(item);
    var rowH = (box.h - 22) / rows.length;
    rows.forEach(function (row, i) {
      var y = box.y + 12 + i * rowH;
      var hit = row.result.keyCollision || row.result.flags.mixed;
      ctx.fillStyle = hit ? "rgba(190,18,60,0.12)" : "rgba(15,118,110,0.10)";
      ctx.fillRect(box.x + 8, y, box.w - 16, rowH - 6);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(row.label, box.x + 16, y + (rowH - 6) / 2);
      ctx.fillStyle = hit ? COLORS.warn : COLORS.ok;
      ctx.textAlign = "right";
      ctx.fillText(hit ? "blocked" : "missed", box.x + box.w - 18, y + (rowH - 6) / 2);
    });
  }

  function drawRegistry(ctx, activeIndex, box) {
    panel(ctx, box, "Registry audit", "8 example collisions");
    var max = CASES.length;
    POLICIES.forEach(function (policy, pIndex) {
      var stats = allStats(pIndex);
      var y = box.y + 24 + pIndex * 33;
      var w = (box.w - 126) * stats.collisions / max;
      ctx.fillStyle = pIndex === activeIndex ? COLORS.faint : "#ffffff";
      ctx.fillRect(box.x + 8, y - 13, box.w - 16, 25);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(policy.label, box.x + 16, y);
      ctx.fillStyle = [COLORS.raw, COLORS.nfc, COLORS.nfkc, COLORS.ident, COLORS.skeleton][pIndex];
      ctx.fillRect(box.x + 128, y - 7, Math.max(2, w), 14);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.fillText(String(stats.collisions), box.x + box.w - 18, y);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.fillText("bars count key collisions", box.x + 12, box.y + box.h - 18);
  }

  function drawCodePoints(ctx, item, box) {
    panel(ctx, box, "What the renderer hides", "glyphs vs code points");
    var cps = codePoints(item.candidate);
    var charsList = chars(item.candidate);
    var cellW = Math.min(64, (box.w - 24) / Math.max(1, charsList.length));
    charsList.forEach(function (ch, i) {
      var x = box.x + 12 + i * cellW;
      var y = box.y + 20;
      fillCard(ctx, x, y, cellW - 5, 78, isIgnorable(ch) ? "rgba(190,18,60,0.10)" : "#ffffff");
      ctx.fillStyle = isIgnorable(ch) ? COLORS.warn : COLORS.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(isIgnorable(ch) ? "·" : ch, x + (cellW - 5) / 2, y + 27);
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(cps[i], x + (cellW - 5) / 2, y + 56);
    });
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "left";
    ctx.fillText("Glyphs are not code points.", box.x + 12, box.y + box.h - 18);
  }

  function drawChart(canvas, item, policyIndex, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 570;
    var height = compact ? 980 : 720;
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
      drawSpecimen(ctx, item, result, { x: left, y: 46, w: plotW, h: 230 });
      drawLayerTable(ctx, item, { x: left, y: 348, w: plotW, h: 178 });
      drawRegistry(ctx, policyIndex, { x: left, y: 596, w: plotW, h: 190 });
      drawCodePoints(ctx, item, { x: left, y: 850, w: plotW, h: 100 });
    } else {
      drawSpecimen(ctx, item, result, { x: left, y: 48, w: plotW * 0.52, h: 245 });
      drawLayerTable(ctx, item, { x: left + plotW * 0.60, y: 48, w: plotW * 0.40, h: 245 });
      drawRegistry(ctx, policyIndex, { x: left, y: 390, w: plotW * 0.48, h: 190 });
      drawCodePoints(ctx, item, { x: left + plotW * 0.56, y: 390, w: plotW * 0.44, h: 190 });
    }
  }

  function render(root) {
    var candidateInput = root.querySelector('[data-param="case"]');
    var policyInput = root.querySelector('[data-param="policy"]');
    var caseIndex = Math.round(clamp(Number(candidateInput.value), 0, CASES.length - 1));
    var policyIndex = Math.round(clamp(Number(policyInput.value), 0, POLICIES.length - 1));
    var item = CASES[caseIndex];
    var result = evaluateCase(item, policyIndex);
    var stats = allStats(policyIndex);
    var canvas = root.querySelector("[data-canvas]");
    var metrics = root.querySelector("[data-metrics]");

    root.querySelector('[data-value="case"]').textContent = item.label;
    root.querySelector('[data-value="policy"]').textContent = result.policyLabel;

    metrics.innerHTML = [
      metric("decision", result.accepted ? "accept" : "block"),
      metric("key collision", result.keyCollision ? "yes" : "no"),
      metric("candidate scripts", formatList(scripts(item.candidate))),
      metric("mixed script", mixedScript(item.candidate) ? "yes" : "no"),
      metric("invisible chars", chars(item.candidate).filter(isIgnorable).length),
      metric("registry hits", stats.collisions + "/" + CASES.length)
    ].join("");
    drawChart(canvas, item, policyIndex, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-unicode-lab]"));
    labs.forEach(function (root) {
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
    var checks = [
      ["NFC catches combining accent", evaluateCase(CASES[0], 1).keyCollision],
      ["NFKC catches Kelvin sign", evaluateCase(CASES[1], 2).keyCollision],
      ["identifier key strips ZWJ", evaluateCase(CASES[2], 3).keyCollision],
      ["skeleton catches Cyrillic paypal", evaluateCase(CASES[3], 4).keyCollision],
      ["whole-script skeleton catches scope", evaluateCase(CASES[4], 4).keyCollision],
      ["casefold catches sharp s", evaluateCase(CASES[5], 2).keyCollision],
      ["NFKC catches Roman numeral", evaluateCase(CASES[6], 2).keyCollision],
      ["mixed script flags Greek Amazon", evaluateCase(CASES[7], 4).flags.mixed],
      ["skeleton idempotent", skeleton(skeleton(CASES[3].candidate)) === skeleton(CASES[3].candidate)]
    ];
    var passed = checks.filter(function (row) { return row[1]; }).length;
    return { passed: passed, total: checks.length, checks: checks };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      audit: audit,
      CASES: CASES,
      codePoints: codePoints,
      evaluateCase: evaluateCase,
      keyFor: keyFor,
      mixedScript: mixedScript,
      scripts: scripts,
      skeleton: skeleton,
      stripIgnorables: stripIgnorables
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
