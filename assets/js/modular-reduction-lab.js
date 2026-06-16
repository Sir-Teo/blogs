(function (global) {
  "use strict";

  var COLORS = {
    barrett: "#2563eb",
    bad: "#be123c",
    correction0: "#dbeafe",
    correction1: "#93c5fd",
    correction2: "#2563eb",
    grid: "#e8edf3",
    montgomery: "#0f766e",
    muted: "#5f6d7a",
    panel: "#f8fafc",
    precompute: "#b45309",
    rule: "#d7dee5",
    selected: "#7c3aed",
    text: "#172026",
    white: "#ffffff"
  };

  var RADIX_BITS = [2, 4, 5, 6, 8];
  var DEFAULTS = {
    a: 37,
    b: 54,
    chain: 12,
    modulus: 97,
    radixBits: 4
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function cleanParams(raw) {
    raw = raw || {};
    var modulus = Math.round(clamp(finite(Number(raw.modulus), DEFAULTS.modulus), 5, 251));
    var radixBits = Math.round(finite(Number(raw.radixBits), DEFAULTS.radixBits));
    if (RADIX_BITS.indexOf(radixBits) < 0) radixBits = DEFAULTS.radixBits;
    return {
      a: Math.round(clamp(finite(Number(raw.a), DEFAULTS.a), 0, modulus - 1)),
      b: Math.round(clamp(finite(Number(raw.b), DEFAULTS.b), 0, modulus - 1)),
      chain: Math.round(clamp(finite(Number(raw.chain), DEFAULTS.chain), 1, 32)),
      modulus: modulus,
      radixBits: radixBits
    };
  }

  function big(value) {
    return BigInt(value);
  }

  function pow(base, exp) {
    var out = 1n;
    for (var i = 0; i < exp; i += 1) out *= base;
    return out;
  }

  function mod(value, modulus) {
    var out = value % modulus;
    return out < 0n ? out + modulus : out;
  }

  function digitLength(value, base) {
    var k = 1;
    var p = base;
    while (p <= value) {
      p *= base;
      k += 1;
    }
    return k;
  }

  function egcd(a, b) {
    var oldR = a;
    var r = b;
    var oldS = 1n;
    var s = 0n;
    var oldT = 0n;
    var t = 1n;
    while (r !== 0n) {
      var q = oldR / r;
      var nextR = oldR - q * r;
      oldR = r;
      r = nextR;
      var nextS = oldS - q * s;
      oldS = s;
      s = nextS;
      var nextT = oldT - q * t;
      oldT = t;
      t = nextT;
    }
    return { gcd: oldR, x: oldS, y: oldT };
  }

  function modInv(a, modulus) {
    var row = egcd(mod(a, modulus), modulus);
    if (row.gcd !== 1n) return null;
    return mod(row.x, modulus);
  }

  function baseInfo(n, radixBits) {
    var beta = 1n << BigInt(radixBits);
    var k = digitLength(n, beta);
    return {
      beta: beta,
      betaK: pow(beta, k),
      betaKMinus1: pow(beta, k - 1),
      betaKPlus1: pow(beta, k + 1),
      k: k
    };
  }

  function barrettReduce(x, n, radixBits) {
    var info = baseInfo(n, radixBits);
    var beta2k = pow(info.beta, 2 * info.k);
    var mu = beta2k / n;
    var qTrue = x / n;
    var rTrue = x % n;
    var q1 = x / info.betaKMinus1;
    var q2 = q1 * mu;
    var q3 = q2 / info.betaKPlus1;
    var r1 = x % info.betaKPlus1;
    var r2 = (q3 * n) % info.betaKPlus1;
    var rawR = r1 - r2;
    var lifted = false;
    var r = rawR;
    if (r < 0n) {
      r += info.betaKPlus1;
      lifted = true;
    }
    var corrections = 0;
    while (r >= n) {
      r -= n;
      corrections += 1;
      if (corrections > 8) break;
    }
    return {
      beta: info.beta,
      betaK: info.betaK,
      betaKPlus1: info.betaKPlus1,
      corrections: corrections,
      lifted: lifted,
      mu: mu,
      q1: q1,
      q2: q2,
      q3: q3,
      qError: qTrue - q3,
      qTrue: qTrue,
      r: r,
      r1: r1,
      r2: r2,
      rBeforeCorrections: lifted ? rawR + info.betaKPlus1 : rawR,
      rTrue: rTrue,
      rawR: rawR,
      validInput: x < beta2k
    };
  }

  function montgomeryParams(n, radixBits) {
    var info = baseInfo(n, radixBits);
    if (n % 2n === 0n) {
      return {
        available: false,
        beta: info.beta,
        k: info.k,
        reason: "modulus shares a factor with R"
      };
    }
    var inverse = modInv(n, info.betaK);
    if (inverse == null) {
      return {
        available: false,
        beta: info.beta,
        k: info.k,
        reason: "no inverse modulo R"
      };
    }
    return {
      available: true,
      beta: info.beta,
      k: info.k,
      nPrime: mod(-inverse, info.betaK),
      r: info.betaK
    };
  }

  function redc(t, n, params) {
    var factor = ((t % params.r) * params.nPrime) % params.r;
    var numerator = t + factor * n;
    var u = numerator / params.r;
    var subtracted = false;
    if (u >= n) {
      u -= n;
      subtracted = true;
    }
    return {
      factor: factor,
      numerator: numerator,
      subtracted: subtracted,
      value: u
    };
  }

  function montgomeryMultiply(a, b, n, radixBits) {
    var params = montgomeryParams(n, radixBits);
    if (!params.available) {
      return {
        available: false,
        params: params,
        reason: params.reason
      };
    }
    var abar = (a * params.r) % n;
    var bbar = (b * params.r) % n;
    var first = redc(abar * bbar, n, params);
    var out = redc(first.value, n, params);
    return {
      abar: abar,
      available: true,
      bbar: bbar,
      first: first,
      out: out,
      params: params,
      trueR: (a * b) % n,
      value: out.value
    };
  }

  function sampleResidues(n, count) {
    var rows = [];
    if (n <= BigInt(count)) {
      for (var i = 0n; i < n; i += 1n) rows.push(i);
      return rows;
    }
    for (var j = 0; j < count; j += 1) {
      rows.push((BigInt(j) * (n - 1n)) / BigInt(count - 1));
    }
    return rows;
  }

  function correctionGrid(n, radixBits, a, b) {
    var residues = sampleResidues(n, 15);
    var cells = [];
    var maxCorrections = 0;
    residues.forEach(function (left) {
      residues.forEach(function (right) {
        var row = barrettReduce(left * right, n, radixBits);
        maxCorrections = Math.max(maxCorrections, row.corrections);
        cells.push({
          a: left,
          b: right,
          corrections: row.corrections,
          qError: row.qError,
          selected: left === a && right === b
        });
      });
    });
    return {
      cells: cells,
      maxCorrections: maxCorrections,
      residues: residues
    };
  }

  function costModel(chain, barrett, montgomery) {
    var correctionCost = Math.max(0, barrett.corrections);
    var classicPer = 16;
    var barrettPre = 12;
    var barrettPer = 10 + correctionCost;
    var montPre = montgomery.available ? 24 : 0;
    var montPer = montgomery.available ? 10 + (montgomery.first.subtracted ? 1 : 0) : 0;
    return {
      barrett: barrettPre + chain * barrettPer,
      barrettHotDivides: 0,
      classic: chain * classicPer,
      classicHotDivides: chain,
      montgomery: montgomery.available ? montPre + chain * montPer : null,
      montgomeryHotDivides: montgomery.available ? 0 : null
    };
  }

  function evaluate(raw) {
    var params = cleanParams(raw);
    var n = big(params.modulus);
    var a = big(params.a);
    var b = big(params.b);
    var x = a * b;
    var barrett = barrettReduce(x, n, params.radixBits);
    var montgomery = montgomeryMultiply(a, b, n, params.radixBits);
    return {
      barrett: barrett,
      cost: costModel(params.chain, barrett, montgomery),
      grid: correctionGrid(n, params.radixBits, a, b),
      montgomery: montgomery,
      params: params,
      values: {
        a: a,
        b: b,
        modulus: n,
        product: x,
        trueR: x % n
      }
    };
  }

  function audit() {
    var failures = [];
    function record(name, condition, detail) {
      if (!condition) failures.push(detail ? name + ": " + detail : name);
    }

    var clean = cleanParams({ a: -1, b: 999, chain: 999, modulus: "bad", radixBits: 7 });
    record("sanitizes parameters", clean.modulus === DEFAULTS.modulus && clean.a === 0 && clean.b === DEFAULTS.modulus - 1 && clean.chain === 32 && clean.radixBits === DEFAULTS.radixBits);

    var hac = barrettReduce(3561n, 47n, 2);
    record("HAC Barrett example", hac.r === 36n && hac.mu === 87n && hac.q3 === 75n, "r=" + hac.r + " mu=" + hac.mu + " q3=" + hac.q3);

    RADIX_BITS.forEach(function (radixBits) {
      for (var n = 5; n <= 137; n += 1) {
        for (var left = 0; left < n; left += Math.max(1, Math.floor(n / 17))) {
          for (var right = 0; right < n; right += Math.max(1, Math.floor(n / 19))) {
            var row = evaluate({ a: left, b: right, modulus: n, radixBits: radixBits, chain: 9 });
            record("Barrett matches true residue", row.barrett.r === row.values.trueR, "n=" + n + " a=" + left + " b=" + right + " radix=" + radixBits);
            record("Barrett quotient low by at most two", row.barrett.qError >= 0n && row.barrett.qError <= 2n, "n=" + n + " qError=" + row.barrett.qError);
            record("Barrett correction bound", row.barrett.corrections <= 2, "n=" + n + " corrections=" + row.barrett.corrections);
            if (n % 2 === 1) {
              record("Montgomery matches true residue", row.montgomery.available && row.montgomery.value === row.values.trueR, "n=" + n + " a=" + left + " b=" + right);
            } else {
              record("Montgomery rejects even modulus", !row.montgomery.available, "n=" + n);
            }
            record("finite costs", Number.isFinite(row.cost.classic) && Number.isFinite(row.cost.barrett), "n=" + n);
          }
        }
      }
    });

    [97, 101, 127, 251].forEach(function (n) {
      for (var a = 0; a < n; a += 1) {
        var b = (a * 37 + 11) % n;
        var row = evaluate({ a: a, b: b, modulus: n, radixBits: 8, chain: 12 });
        record("dense odd modulus Barrett", row.barrett.r === row.values.trueR, "n=" + n + " a=" + a);
        record("dense odd modulus Montgomery", row.montgomery.value === row.values.trueR, "n=" + n + " a=" + a);
      }
    });

    return { failures: failures, ok: failures.length === 0 };
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return raw;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBig(value) {
    value = BigInt(value);
    if (value < 0n) return "-" + formatBig(-value);
    if (value < 1000000n) return value.toString();
    var text = value.toString();
    return text.slice(0, 4) + "..." + text.slice(-4);
  }

  function metric(label, value, accent) {
    return '<div class="modred-lab__metric' + (accent ? " is-" + accent : "") + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + "</strong></div>";
  }

  function updateOutputs(root, result) {
    var display = {
      a: result.params.a,
      b: result.params.b,
      chain: result.params.chain,
      modulus: result.params.modulus,
      radixBits: result.params.radixBits
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")];
    });
    root.querySelectorAll('[data-param="a"], [data-param="b"]').forEach(function (input) {
      input.max = String(result.params.modulus - 1);
      if (Number(input.value) > result.params.modulus - 1) input.value = String(result.params.modulus - 1);
    });
  }

  function renderMetrics(root, result) {
    var mont = result.montgomery.available ? formatBig(result.montgomery.value) : result.montgomery.reason;
    var html = [
      metric("product x", formatBig(result.values.product)),
      metric("true x mod n", formatBig(result.values.trueR), "good"),
      metric("Barrett result", formatBig(result.barrett.r), result.barrett.r === result.values.trueR ? "good" : "bad"),
      metric("q - qhat", formatBig(result.barrett.qError)),
      metric("corrections", result.barrett.corrections + (result.barrett.lifted ? " + lift" : "")),
      metric("Montgomery result", mont, result.montgomery.available ? "good" : "warn"),
      metric("R", formatBig(result.barrett.betaK)),
      metric("mu", formatBig(result.barrett.mu))
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = targetHeight + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(targetHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, targetHeight);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, targetHeight);
    return { ctx: ctx, height: targetHeight, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, box.x + 13, box.y + 23);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillText(subtitle, box.x + 13, box.y + 40);
    }
  }

  function label(ctx, text, x, y, color, align, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "12px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
  }

  function clipText(ctx, text, maxWidth) {
    text = String(text);
    if (ctx.measureText(text).width <= maxWidth) return text;
    var suffix = "...";
    var lo = 0;
    var hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + suffix).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + suffix;
  }

  function drawBarrett(ctx, result, box) {
    panel(ctx, box, "Barrett: estimate the quotient", "precompute a fixed-point reciprocal of n");
    var b = result.barrett;
    var left = box.x + 18;
    var y = box.y + 66;
    var lines = [
      "x = " + formatBig(result.values.a) + " * " + formatBig(result.values.b) + " = " + formatBig(result.values.product),
      "mu = floor(beta^(2k) / n) = " + formatBig(b.mu),
      "qhat = floor(floor(x / beta^(k-1)) * mu / beta^(k+1))",
      "q = " + formatBig(b.qTrue) + ", qhat = " + formatBig(b.q3) + ", miss = " + formatBig(b.qError),
      "r before correction = " + formatBig(b.rBeforeCorrections),
      "subtract n " + b.corrections + " time" + (b.corrections === 1 ? "" : "s") + " -> " + formatBig(b.r)
    ];
    lines.forEach(function (line, index) {
      label(ctx, clipText(ctx, line, box.w - 36), left, y + index * 23, index === 3 ? COLORS.barrett : COLORS.text, "left", "12px ui-monospace, Menlo, monospace");
    });
    var plot = { x: left, y: box.y + box.h - 76, w: box.w - 36, h: 32 };
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    var maxQ = Number(b.qTrue + 3n);
    function sx(q) {
      return plot.x + Number(q) / Math.max(1, maxQ) * plot.w;
    }
    [
      { color: COLORS.text, label: "true q", value: b.qTrue },
      { color: COLORS.barrett, label: "qhat", value: b.q3 }
    ].forEach(function (mark, index) {
      var x = sx(mark.value);
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, plot.y + 2);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      label(ctx, mark.label, x + (index ? 6 : -6), plot.y - 6, mark.color, index ? "left" : "right", "11px system-ui, sans-serif");
    });
  }

  function drawMontgomery(ctx, result, box) {
    panel(ctx, box, "Montgomery: change the representation", "REDC divides by R, not by n");
    var m = result.montgomery;
    var left = box.x + 18;
    var y = box.y + 66;
    if (!m.available) {
      label(ctx, "Unavailable: " + m.reason, left, y, COLORS.bad, "left", "700 13px system-ui, sans-serif");
      label(ctx, "R is a power of two, so n must be odd.", left, y + 26, COLORS.muted);
      return;
    }
    var rows = [
      "R = beta^k = " + formatBig(m.params.r),
      "nprime = -n^(-1) mod R = " + formatBig(m.params.nPrime),
      "aR mod n = " + formatBig(m.abar),
      "bR mod n = " + formatBig(m.bbar),
      "REDC(aR*bR) = " + formatBig(m.first.value) + "  (still in Montgomery form)",
      "REDC(previous) = " + formatBig(m.value)
    ];
    rows.forEach(function (line, index) {
      var color = index >= 4 ? COLORS.montgomery : COLORS.text;
      label(ctx, clipText(ctx, line, box.w - 36), left, y + index * 23, color, "left", "12px ui-monospace, Menlo, monospace");
    });
    var stepY = box.y + box.h - 66;
    [
      { label: "ordinary", value: formatBig(result.values.a) + " * " + formatBig(result.values.b), color: COLORS.muted },
      { label: "inside", value: formatBig(m.abar) + " * " + formatBig(m.bbar), color: COLORS.montgomery },
      { label: "out", value: formatBig(m.value), color: COLORS.montgomery }
    ].forEach(function (item, index) {
      var w = (box.w - 48) / 3;
      var x = left + index * w;
      ctx.fillStyle = item.color;
      ctx.globalAlpha = 0.12;
      roundRect(ctx, x, stepY, w - 10, 38, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
      label(ctx, item.label, x + 8, stepY + 15, item.color, "left", "700 11px system-ui, sans-serif");
      label(ctx, clipText(ctx, item.value, w - 26), x + 8, stepY + 31, COLORS.text, "left", "11px ui-monospace, Menlo, monospace");
    });
  }

  function correctionColor(count) {
    if (count <= 0) return COLORS.correction0;
    if (count === 1) return COLORS.correction1;
    return COLORS.correction2;
  }

  function drawGrid(ctx, result, box) {
    panel(ctx, box, "Correction map", "how often Barrett has to subtract n");
    var grid = result.grid;
    var n = grid.residues.length;
    var size = Math.min((box.w - 64) / n, (box.h - 94) / n);
    var left = box.x + 46;
    var top = box.y + 58;
    grid.cells.forEach(function (cell) {
      var ix = grid.residues.findIndex(function (v) { return v === cell.a; });
      var iy = grid.residues.findIndex(function (v) { return v === cell.b; });
      var x = left + ix * size;
      var y = top + iy * size;
      ctx.fillStyle = correctionColor(cell.corrections);
      ctx.fillRect(x, y, Math.max(1, size - 1), Math.max(1, size - 1));
      if (cell.selected) {
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, Math.max(1, size - 3), Math.max(1, size - 3));
      }
    });
    label(ctx, "a", left + n * size + 8, top + n * size + 2, COLORS.muted);
    label(ctx, "b", left - 20, top - 8, COLORS.muted);
    label(ctx, "0", left, top + n * size + 18, COLORS.muted, "center");
    label(ctx, formatBig(result.values.modulus - 1n), left + (n - 1) * size, top + n * size + 18, COLORS.muted, "center");
    [
      { c: 0, label: "0 subtractions" },
      { c: 1, label: "1 subtraction" },
      { c: 2, label: "2 subtractions" }
    ].forEach(function (item, index) {
      var x = box.x + 18 + index * 104;
      var y = box.y + box.h - 22;
      ctx.fillStyle = correctionColor(item.c);
      ctx.fillRect(x, y - 10, 12, 12);
      label(ctx, item.label, x + 18, y, COLORS.muted, "left", "11px system-ui, sans-serif");
    });
  }

  function drawCost(ctx, result, box) {
    panel(ctx, box, "Amortization sketch", "toy cost model; hot loop avoids division by n");
    var rows = [
      { color: COLORS.muted, label: "classical", value: result.cost.classic, divides: result.cost.classicHotDivides },
      { color: COLORS.barrett, label: "Barrett", value: result.cost.barrett, divides: result.cost.barrettHotDivides }
    ];
    if (result.cost.montgomery != null) rows.push({ color: COLORS.montgomery, label: "Montgomery", value: result.cost.montgomery, divides: result.cost.montgomeryHotDivides });
    var max = rows.reduce(function (best, row) { return Math.max(best, row.value); }, 1);
    var left = box.x + 102;
    var top = box.y + 70;
    var rowH = 52;
    rows.forEach(function (row, index) {
      var y = top + index * rowH;
      label(ctx, row.label, box.x + 18, y + 18, row.color, "left", "700 12px system-ui, sans-serif");
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.72;
      ctx.fillRect(left, y, Math.max(2, row.value / max * (box.w - 140)), 22);
      ctx.globalAlpha = 1;
      label(ctx, Math.round(row.value) + " toy units", left + row.value / max * (box.w - 140) + 6, y + 16, COLORS.text);
      label(ctx, row.divides + " hot-loop n-divides", left, y + 39, COLORS.muted, "left", "11px system-ui, sans-serif");
    });
    label(ctx, "chain length " + result.params.chain + "; costs are explanatory, not hardware timings", box.x + 18, box.y + box.h - 18, COLORS.muted, "left", "11px system-ui, sans-serif");
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 1040 : 720);
    var ctx = setup.ctx;
    if (compact) {
      drawBarrett(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 252 });
      drawMontgomery(ctx, result, { x: 8, y: 270, w: setup.width - 16, h: 244 });
      drawGrid(ctx, result, { x: 8, y: 524, w: setup.width - 16, h: 244 });
      drawCost(ctx, result, { x: 8, y: 778, w: setup.width - 16, h: 252 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawBarrett(ctx, result, { x: 8, y: 8, w: col, h: 350 });
      drawMontgomery(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 350 });
      drawGrid(ctx, result, { x: 8, y: 374, w: col, h: 338 });
      drawCost(ctx, result, { x: col + 20, y: 374, w: setup.width - col - 28, h: 338 });
    }
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-modular-reduction-lab]")).forEach(function (root) {
      if (root.__modularReductionReady) return;
      root.__modularReductionReady = true;
      var scheduled = null;
      function requestRender() {
        if (scheduled && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(scheduled);
        scheduled = typeof global.requestAnimationFrame === "function"
          ? global.requestAnimationFrame(function () {
            scheduled = null;
            render(root);
          })
          : global.setTimeout(function () {
            scheduled = null;
            render(root);
          }, 16);
      }
      root.querySelectorAll("[data-param]").forEach(function (input) {
        input.addEventListener("input", requestRender);
        input.addEventListener("change", requestRender);
      });
      requestRender();
      global.addEventListener("resize", requestRender);
    });
  }

  var api = {
    audit: audit,
    barrettReduce: barrettReduce,
    cleanParams: cleanParams,
    evaluate: evaluate,
    montgomeryMultiply: montgomeryMultiply
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ModularReductionLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
