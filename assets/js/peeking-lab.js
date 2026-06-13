(function () {
  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    fixed: "#64748b",
    naive: "#be123c",
    bonf: "#2563eb",
    obf: "#0f766e",
    path: "#7c3aed",
    warn: "#b45309"
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

  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var p = 0.3275911;
    var z = Math.abs(x);
    var t = 1 / (1 + p * z);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return sign * y;
  }

  function phi(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function invNorm(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var plow = 0.02425;
    var phigh = 1 - plow;
    var q;
    var r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (phigh < p) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, values.length);
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="peeking-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function binomial(rand, n, p) {
    var i;
    var count = 0;
    if (n <= 70) {
      for (i = 0; i < n; i += 1) if (rand() < p) count += 1;
      return count;
    }
    var value = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(rand));
    return clamp(value, 0, n);
  }

  function zTest(successA, successB, n) {
    var pA = successA / n;
    var pB = successB / n;
    var pooled = (successA + successB) / (2 * n);
    var se = Math.sqrt(Math.max(1e-12, pooled * (1 - pooled) * 2 / n));
    var z = (pB - pA) / se;
    var p = 1 - phi(z);
    return {
      lift: pB - pA,
      p: clamp(p, 1e-12, 1),
      z: z
    };
  }

  function policyMeta(alpha, looks) {
    var zAlpha = invNorm(1 - alpha);
    return {
      fixed: { color: COLORS.fixed, label: "Fixed horizon" },
      naive: { color: COLORS.naive, label: "Naive peeking" },
      bonf: { color: COLORS.bonf, label: "Bonferroni looks" },
      obf: { color: COLORS.obf, label: "OBF boundary", zAlpha: zAlpha, looks: looks }
    };
  }

  function shouldReject(policy, look, looks, p, z, alpha, meta) {
    var info = look / looks;
    if (policy === "fixed") return look === looks && p <= alpha;
    if (policy === "naive") return p <= alpha;
    if (policy === "bonf") return p <= alpha / looks;
    if (policy === "obf") return z >= meta.obf.zAlpha / Math.sqrt(Math.max(info, 1e-9));
    return false;
  }

  function oneExperiment(rand, params, pathsWanted) {
    var base = params.baseRate / 100;
    var lift = params.lift / 10000;
    var treatment = clamp(base + lift, 0.0001, 0.999);
    var control = clamp(base, 0.0001, 0.999);
    var maxN = params.maxUsers;
    var looks = params.looks;
    var alpha = params.alpha / 100;
    var meta = policyMeta(alpha, looks);
    var state = {
      fixed: null,
      naive: null,
      bonf: null,
      obf: null
    };
    var successA = 0;
    var successB = 0;
    var lastN = 0;
    var path = [];
    var policies = Object.keys(state);

    for (var look = 1; look <= looks; look += 1) {
      var n = Math.max(1, Math.round(maxN * look / looks));
      var addN = n - lastN;
      successA += binomial(rand, addN, control);
      successB += binomial(rand, addN, treatment);
      lastN = n;
      var test = zTest(successA, successB, n);
      if (pathsWanted) {
        path.push({
          lift: test.lift,
          look: look,
          n: n,
          p: test.p,
          z: test.z
        });
      }
      policies.forEach(function (policy) {
        if (state[policy]) return;
        if (shouldReject(policy, look, looks, test.p, test.z, alpha, meta)) {
          state[policy] = {
            lift: test.lift,
            look: look,
            n: n,
            p: test.p,
            z: test.z
          };
        }
      });
    }

    policies.forEach(function (policy) {
      if (!state[policy]) {
        var final = path.length ? path[path.length - 1] : zTest(successA, successB, maxN);
        state[policy] = {
          lift: final.lift,
          look: looks,
          n: maxN,
          p: final.p,
          rejected: false,
          z: final.z
        };
      } else {
        state[policy].rejected = true;
      }
    });

    return { path: path, state: state };
  }

  function summarizePolicy(records, params) {
    var rejected = records.filter(function (record) { return record.rejected; });
    var trueLift = params.lift / 10000;
    var shippedBad = records.filter(function (record) {
      return record.rejected && trueLift <= 0;
    }).length;
    return {
      exaggeration: rejected.length ? mean(rejected.map(function (record) {
        return trueLift > 0 ? record.lift / trueLift : record.lift;
      })) : 0,
      medianN: rejected.length ? median(rejected.map(function (record) { return record.n; })) : params.maxUsers,
      meanLiftIfShipped: rejected.length ? mean(rejected.map(function (record) { return record.lift; })) : 0,
      rejectionRate: rejected.length / records.length,
      shippedBadRate: shippedBad / records.length
    };
  }

  function simulate(params) {
    var rand = rng(
      20260613
      + params.baseRate * 11
      + params.lift * 17
      + params.maxUsers * 19
      + params.looks * 23
      + params.alpha * 29
      + params.sims * 31
    );
    var policies = ["fixed", "naive", "bonf", "obf"];
    var records = { fixed: [], naive: [], bonf: [], obf: [] };
    var samplePath = null;
    for (var sim = 0; sim < params.sims; sim += 1) {
      var experiment = oneExperiment(rand, params, sim === 0);
      if (sim === 0) samplePath = experiment.path;
      policies.forEach(function (policy) {
        records[policy].push(experiment.state[policy]);
      });
    }

    var summary = {};
    policies.forEach(function (policy) {
      summary[policy] = summarizePolicy(records[policy], params);
    });
    return {
      meta: policyMeta(params.alpha / 100, params.looks),
      path: samplePath,
      records: records,
      summary: summary
    };
  }

  function drawLabel(ctx, text, x, y, align, baseline, color) {
    ctx.fillStyle = color || COLORS.text;
    ctx.textAlign = align || "left";
    ctx.textBaseline = baseline || "alphabetic";
    ctx.fillText(text, x, y);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    drawLabel(ctx, title, box.x, box.y - 14, "left", "bottom", COLORS.text);
    if (subtitle) drawLabel(ctx, subtitle, box.x + box.w, box.y - 14, "right", "bottom", COLORS.muted);
  }

  function drawPath(ctx, result, params, box) {
    var alpha = params.alpha / 100;
    panel(ctx, box, "One running experiment", "one-sided p-value by look");
    function xScale(look) {
      return box.x + (look - 1) / Math.max(1, params.looks - 1) * box.w;
    }
    function yScale(p) {
      return box.y + clamp(-Math.log10(p), 0, 4) / 4 * box.h;
    }

    [1, 0.1, 0.05, 0.01, 0.001].forEach(function (p) {
      var y = yScale(p);
      ctx.strokeStyle = p === alpha ? COLORS.naive : COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      drawLabel(ctx, String(p), box.x - 8, y, "right", "middle", p === alpha ? COLORS.naive : COLORS.muted);
    });

    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.beginPath();
    result.path.forEach(function (point, index) {
      var x = xScale(point.look);
      var y = yScale(point.p);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    result.path.forEach(function (point) {
      var x = xScale(point.look);
      var y = yScale(point.p);
      ctx.fillStyle = point.p <= alpha ? COLORS.naive : COLORS.path;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, 2 * Math.PI);
      ctx.fill();
    });

    drawLabel(ctx, "looks", box.x + box.w / 2, box.y + box.h + 24, "center", "top", COLORS.muted);
  }

  function drawBars(ctx, result, params, box) {
    var policies = ["fixed", "naive", "bonf", "obf"];
    panel(ctx, box, params.lift === 0 ? "False positive rate" : "Detection rate", "Monte Carlo");
    var barH = (box.h - 18) / policies.length;
    policies.forEach(function (policy, index) {
      var item = result.summary[policy];
      var meta = result.meta[policy];
      var y = box.y + 9 + index * barH;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, barH - 8);
      ctx.fillStyle = meta.color;
      ctx.fillRect(box.x, y, box.w * clamp(item.rejectionRate, 0, 1), barH - 8);
      drawLabel(ctx, meta.label, box.x + 8, y + (barH - 8) / 2, "left", "middle", item.rejectionRate > 0.35 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, formatPercent(item.rejectionRate, 1), box.x + box.w - 8, y + (barH - 8) / 2, "right", "middle", item.rejectionRate > 0.72 ? "#ffffff" : COLORS.text);
    });
  }

  function drawMedianN(ctx, result, params, box) {
    var policies = ["fixed", "naive", "bonf", "obf"];
    panel(ctx, box, "Stopping cost", "median users per arm if shipped");
    var barH = (box.h - 18) / policies.length;
    policies.forEach(function (policy, index) {
      var item = result.summary[policy];
      var meta = result.meta[policy];
      var y = box.y + 9 + index * barH;
      var value = item.medianN / params.maxUsers;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, barH - 8);
      ctx.fillStyle = meta.color;
      ctx.fillRect(box.x, y, box.w * clamp(value, 0, 1), barH - 8);
      drawLabel(ctx, meta.label, box.x + 8, y + (barH - 8) / 2, "left", "middle", value > 0.35 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, String(Math.round(item.medianN)), box.x + box.w - 8, y + (barH - 8) / 2, "right", "middle", value > 0.72 ? "#ffffff" : COLORS.text);
    });
  }

  function drawWinnerBias(ctx, result, params, box) {
    var policies = ["fixed", "naive", "bonf", "obf"];
    var maxLift = Math.max.apply(null, policies.map(function (policy) {
      return Math.abs(result.summary[policy].meanLiftIfShipped);
    }).concat([Math.abs(params.lift / 10000), 0.001]));
    panel(ctx, box, "Winner's estimate", "observed lift among shipped tests");
    var barH = (box.h - 18) / policies.length;
    policies.forEach(function (policy, index) {
      var item = result.summary[policy];
      var meta = result.meta[policy];
      var y = box.y + 9 + index * barH;
      var value = Math.abs(item.meanLiftIfShipped) / maxLift;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x, y, box.w, barH - 8);
      ctx.fillStyle = meta.color;
      ctx.fillRect(box.x, y, box.w * clamp(value, 0, 1), barH - 8);
      drawLabel(ctx, meta.label, box.x + 8, y + (barH - 8) / 2, "left", "middle", value > 0.35 ? "#ffffff" : COLORS.text);
      drawLabel(ctx, formatPercent(item.meanLiftIfShipped, 2), box.x + box.w - 8, y + (barH - 8) / 2, "right", "middle", value > 0.72 ? "#ffffff" : COLORS.text);
    });
    if (params.lift !== 0) {
      drawLabel(ctx, "true lift " + formatPercent(params.lift / 10000, 2), box.x + box.w, box.y + box.h + 16, "right", "top", COLORS.muted);
    }
  }

  function drawChart(canvas, result, params) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var compact = width < 560;
    var height = compact ? 840 : 590;
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

    var left = compact ? 54 : 58;
    var right = compact ? 18 : 24;
    var plotW = width - left - right;

    if (compact) {
      drawPath(ctx, result, params, { x: left, y: 44, w: plotW, h: 220 });
      drawBars(ctx, result, params, { x: left, y: 330, w: plotW, h: 140 });
      drawMedianN(ctx, result, params, { x: left, y: 540, w: plotW, h: 120 });
      drawWinnerBias(ctx, result, params, { x: left, y: 730, w: plotW, h: 90 });
    } else {
      drawPath(ctx, result, params, { x: left, y: 44, w: plotW * 0.54, h: 300 });
      drawBars(ctx, result, params, { x: left + plotW * 0.62, y: 44, w: plotW * 0.38, h: 150 });
      drawMedianN(ctx, result, params, { x: left + plotW * 0.62, y: 266, w: plotW * 0.38, h: 126 });
      drawWinnerBias(ctx, result, params, { x: left, y: 438, w: plotW, h: 92 });
    }
  }

  function parseParams(root) {
    var params = {
      alpha: 5,
      baseRate: 8,
      lift: 0,
      looks: 20,
      maxUsers: 12000,
      sims: 800
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    params.looks = Math.max(1, Math.round(params.looks));
    params.maxUsers = Math.max(params.looks, Math.round(params.maxUsers));
    params.sims = Math.max(100, Math.round(params.sims));
    return params;
  }

  function updateOutputs(root, params) {
    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "baseRate" || key === "alpha") output.textContent = params[key] + "%";
      else if (key === "lift") output.textContent = formatNumber(params[key] / 100, 2) + " pp";
      else output.textContent = String(params[key]);
    });
  }

  function render(root) {
    var params = parseParams(root);
    var result = simulate(params);
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");
    var naive = result.summary.naive;
    var fixed = result.summary.fixed;
    var obf = result.summary.obf;

    updateOutputs(root, params);
    metrics.innerHTML = [
      metric(params.lift === 0 ? "fixed false +" : "fixed power", formatPercent(fixed.rejectionRate, 1)),
      metric(params.lift === 0 ? "peek false +" : "peek power", formatPercent(naive.rejectionRate, 1)),
      metric("OBF rate", formatPercent(obf.rejectionRate, 1)),
      metric("peek median n", String(Math.round(naive.medianN))),
      metric("peek winner lift", formatPercent(naive.meanLiftIfShipped, 2)),
      metric("simulations", String(params.sims))
    ].join("");
    drawChart(canvas, result, params);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-peeking-lab]"));
    labs.forEach(function (root) {
      var schedule = null;
      function requestRender() {
        if (schedule) window.cancelAnimationFrame(schedule);
        schedule = window.requestAnimationFrame(function () {
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
      simulate: simulate,
      zTest: zTest
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
