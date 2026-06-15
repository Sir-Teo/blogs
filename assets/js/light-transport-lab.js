(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#eef2f5",
    faint: "#f8fafc",
    uniform: "#64748b",
    brdf: "#2563eb",
    light: "#d97706",
    mis: "#0f766e",
    truth: "#be123c",
    lobe: "#7c3aed"
  };

  var METHODS = [
    { key: "uniform", name: "uniform angles", short: "uniform", color: COLORS.uniform },
    { key: "brdf", name: "BRDF-shaped", short: "BRDF", color: COLORS.brdf },
    { key: "light", name: "light-shaped", short: "light", color: COLORS.light },
    { key: "mis", name: "MIS mixture", short: "MIS", color: COLORS.mis }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mix32(x) {
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function rng(seed) {
    var state = mix32(seed || 1);
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function deg(value) {
    return value * Math.PI / 180;
  }

  function degrees(value) {
    return value * 180 / Math.PI;
  }

  function cleanParams(raw) {
    return {
      seed: clamp(Math.round(raw.seed || 19), 1, 99),
      samples: clamp(Math.round(raw.samples || 256), 16, 2048),
      lightAngle: deg(clamp(raw.lightAngle == null ? 34 : raw.lightAngle, -72, 72)),
      lightSize: deg(clamp(raw.lightSize == null ? 12 : raw.lightSize, 3, 42)),
      lightPower: clamp(raw.lightPower == null ? 9 : raw.lightPower, 1, 24),
      environment: clamp(raw.environment == null ? 0.11 : raw.environment, 0, 0.70),
      lobeAngle: deg(clamp(raw.lobeAngle == null ? 24 : raw.lobeAngle, -72, 72)),
      roughness: deg(clamp(raw.roughness == null ? 18 : raw.roughness, 4, 62))
    };
  }

  function angularDistance(a, b) {
    return Math.abs(a - b);
  }

  function surfaceResponse(theta, params) {
    var c = Math.max(0, Math.cos(theta));
    var lobe = Math.exp(-0.5 * Math.pow(angularDistance(theta, params.lobeAngle) / params.roughness, 2));
    return c * (0.22 + 0.78 * lobe);
  }

  function lightInterval(params) {
    var a = clamp(params.lightAngle - params.lightSize, -Math.PI / 2, Math.PI / 2);
    var b = clamp(params.lightAngle + params.lightSize, -Math.PI / 2, Math.PI / 2);
    return { a: a, b: b, width: Math.max(1e-8, b - a) };
  }

  function incomingLight(theta, params) {
    var iv = lightInterval(params);
    var direct = theta >= iv.a && theta <= iv.b ? params.lightPower : 0;
    return params.environment + direct;
  }

  function integrand(theta, params) {
    return incomingLight(theta, params) * surfaceResponse(theta, params);
  }

  function makeCdf(params) {
    var n = 1024;
    var min = -Math.PI / 2;
    var max = Math.PI / 2;
    var dx = (max - min) / n;
    var cdf = [];
    var total = 0;
    for (var i = 0; i < n; i += 1) {
      var theta = min + (i + 0.5) * dx;
      total += Math.max(1e-8, surfaceResponse(theta, params)) * dx;
      cdf.push(total);
    }
    for (var j = 0; j < cdf.length; j += 1) cdf[j] /= total;
    return { cdf: cdf, dx: dx, max: max, min: min, total: total };
  }

  function sampleFromCdf(cdf, u) {
    var lo = 0;
    var hi = cdf.cdf.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (cdf.cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return cdf.min + (lo + 0.5) * cdf.dx;
  }

  function pdfUniform() {
    return 1 / Math.PI;
  }

  function pdfBrdf(theta, params, cdf) {
    return Math.max(1e-8, surfaceResponse(theta, params)) / cdf.total;
  }

  function pdfLight(theta, params) {
    var iv = lightInterval(params);
    var inside = theta >= iv.a && theta <= iv.b;
    return 0.86 * (inside ? 1 / iv.width : 0) + 0.14 / Math.PI;
  }

  function sampleLight(random, params) {
    var iv = lightInterval(params);
    if (random() < 0.86) return iv.a + random() * iv.width;
    return -Math.PI / 2 + Math.PI * random();
  }

  function sample(method, random, params, cdf) {
    if (method === "uniform") {
      var thetaU = -Math.PI / 2 + Math.PI * random();
      return { pdf: pdfUniform(thetaU, params, cdf), theta: thetaU };
    }
    if (method === "brdf") {
      var thetaB = sampleFromCdf(cdf, random());
      return { pdf: pdfBrdf(thetaB, params, cdf), theta: thetaB };
    }
    if (method === "light") {
      var thetaL = sampleLight(random, params);
      return { pdf: pdfLight(thetaL, params, cdf), theta: thetaL };
    }
    var useBrdf = random() < 0.5;
    var thetaM = useBrdf ? sampleFromCdf(cdf, random()) : sampleLight(random, params);
    var pdfM = 0.5 * pdfBrdf(thetaM, params, cdf) + 0.5 * pdfLight(thetaM, params, cdf);
    return { pdf: pdfM, theta: thetaM };
  }

  function truth(params) {
    var n = 8192;
    var min = -Math.PI / 2;
    var max = Math.PI / 2;
    var dx = (max - min) / n;
    var sum = 0;
    for (var i = 0; i < n; i += 1) {
      sum += integrand(min + (i + 0.5) * dx, params) * dx;
    }
    return sum;
  }

  function estimate(params, method, sampleCount, seedOffset) {
    var random = rng(params.seed * 1000003 + seedOffset * 9176 + method.length * 131);
    var cdf = makeCdf(params);
    var running = [];
    var rays = [];
    var sum = 0;
    for (var i = 0; i < sampleCount; i += 1) {
      var s = sample(method, random, params, cdf);
      var value = integrand(s.theta, params) / Math.max(1e-12, s.pdf);
      sum += value;
      if (i < 96) rays.push({ theta: s.theta, value: value });
      if (i < 32 || (i + 1) % Math.max(1, Math.floor(sampleCount / 48)) === 0 || i === sampleCount - 1) {
        running.push({ n: i + 1, value: sum / (i + 1) });
      }
    }
    return { estimate: sum / Math.max(1, sampleCount), running: running, rays: rays };
  }

  function summarize(params) {
    var clean = cleanParams(params);
    var exact = truth(clean);
    var methods = METHODS.map(function (method) {
      var main = estimate(clean, method.key, clean.samples, 1);
      var errors = [];
      for (var r = 0; r < 42; r += 1) {
        var run = estimate(clean, method.key, clean.samples, 19 + r);
        errors.push(run.estimate - exact);
      }
      var meanError = errors.reduce(function (sum, e) { return sum + e; }, 0) / errors.length;
      var rmse = Math.sqrt(errors.reduce(function (sum, e) { return sum + e * e; }, 0) / errors.length);
      return Object.assign({}, method, {
        absError: Math.abs(main.estimate - exact),
        bias: meanError,
        estimate: main.estimate,
        rays: main.rays,
        rmse: rmse,
        running: main.running
      });
    });
    var best = methods.slice().sort(function (a, b) { return a.rmse - b.rmse; })[0];
    return {
      audit: runAudit(),
      best: best,
      exact: exact,
      methods: methods,
      params: clean,
      profile: profile(clean)
    };
  }

  function profile(params) {
    var cdf = makeCdf(params);
    var out = [];
    var n = 220;
    for (var i = 0; i <= n; i += 1) {
      var theta = -Math.PI / 2 + Math.PI * i / n;
      out.push({
        brdfPdf: pdfBrdf(theta, params, cdf),
        f: integrand(theta, params),
        light: incomingLight(theta, params),
        lightPdf: pdfLight(theta, params, cdf),
        surface: surfaceResponse(theta, params),
        theta: theta
      });
    }
    return out;
  }

  function runAudit() {
    var ok = 0;
    var cases = 0;
    [5, 19, 73].forEach(function (seed) {
      [64, 256].forEach(function (samples) {
        [8, 18, 34].forEach(function (lightSize) {
          [6, 14].forEach(function (lightPower) {
            cases += 1;
            var run = summarizeNoAudit({
              seed: seed,
              samples: samples,
              lightAngle: 34,
              lightSize: lightSize,
              lightPower: lightPower,
              environment: 0.11,
              lobeAngle: 24,
              roughness: 18
            });
            var finite = isFinite(run.exact) && run.exact > 0 &&
              run.methods.every(function (method) {
                return isFinite(method.estimate) && isFinite(method.rmse) && method.rmse >= 0;
              });
            if (finite) ok += 1;
          });
        });
      });
    });
    var base = summarizeNoAudit({
      seed: 19,
      samples: 256,
      lightAngle: 34,
      lightSize: 12,
      lightPower: 9,
      environment: 0.11,
      lobeAngle: 24,
      roughness: 18
    });
    var uniform = base.methods.filter(function (m) { return m.key === "uniform"; })[0];
    var mis = base.methods.filter(function (m) { return m.key === "mis"; })[0];
    return {
      cases: cases + 1,
      ok: ok + (mis.rmse < uniform.rmse ? 1 : 0),
      misRmse: mis.rmse,
      uniformRmse: uniform.rmse
    };
  }

  function summarizeNoAudit(params) {
    var clean = cleanParams(params);
    var exact = truth(clean);
    var methods = METHODS.map(function (method) {
      var main = estimate(clean, method.key, clean.samples, 1);
      var errors = [];
      for (var r = 0; r < 20; r += 1) {
        var run = estimate(clean, method.key, clean.samples, 19 + r);
        errors.push(run.estimate - exact);
      }
      var rmse = Math.sqrt(errors.reduce(function (sum, e) { return sum + e * e; }, 0) / errors.length);
      return Object.assign({}, method, {
        absError: Math.abs(main.estimate - exact),
        estimate: main.estimate,
        rays: main.rays,
        rmse: rmse,
        running: main.running
      });
    });
    return { exact: exact, methods: methods, params: clean };
  }

  function fmt(value, digits) {
    return value.toFixed(digits == null ? 3 : digits);
  }

  function metric(label, value) {
    return '<div class="light-transport-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function text(ctx, value, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + (size || 12) + "px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(value, x, y);
  }

  function panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.faint;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, x + 12, y + 20, COLORS.text, 13, 750);
  }

  function drawProfile(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "integrand and sampling densities");
    var plot = { x: box.x + 42, y: box.y + 34, w: box.w - 58, h: box.h - 56 };
    var maxF = run.profile.reduce(function (m, p) { return Math.max(m, p.f); }, 1e-6);
    var maxPdf = run.profile.reduce(function (m, p) { return Math.max(m, p.brdfPdf, p.lightPdf); }, 1e-6);
    function x(theta) { return plot.x + (theta + Math.PI / 2) / Math.PI * plot.w; }
    function yF(value) { return plot.y + (1 - value / maxF) * plot.h; }
    function yPdf(value) { return plot.y + (1 - value / maxPdf) * plot.h; }
    [0.25, 0.5, 0.75].forEach(function (v) {
      var yy = plot.y + plot.h * v;
      line(ctx, plot.x, yy, plot.x + plot.w, yy, COLORS.grid, 1);
    });
    line(ctx, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, COLORS.rule, 1);
    line(ctx, plot.x, plot.y, plot.x, plot.y + plot.h, COLORS.rule, 1);
    var iv = lightInterval(run.params);
    ctx.fillStyle = "rgba(217,119,6,0.13)";
    ctx.fillRect(x(iv.a), plot.y, Math.max(2, x(iv.b) - x(iv.a)), plot.h);
    [
      { key: "f", color: COLORS.truth, y: yF },
      { key: "brdfPdf", color: COLORS.brdf, y: yPdf },
      { key: "lightPdf", color: COLORS.light, y: yPdf }
    ].forEach(function (series) {
      ctx.beginPath();
      run.profile.forEach(function (p, i) {
        var px = x(p.theta);
        var py = series.y(p[series.key]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = series.color;
      ctx.lineWidth = series.key === "f" ? 2.2 : 1.6;
      if (series.key !== "f") ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    text(ctx, "integrand", plot.x + plot.w - 64, yF(run.profile[run.profile.length - 1].f) - 6, COLORS.truth, 11, 750);
    text(ctx, "-90 deg", plot.x, plot.y + plot.h + 17, COLORS.muted, 10, 500);
    text(ctx, "90 deg", plot.x + plot.w, plot.y + plot.h + 17, COLORS.muted, 10, 500, "right");
  }

  function drawConvergence(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "running estimate");
    var plot = { x: box.x + 48, y: box.y + 34, w: box.w - 64, h: box.h - 56 };
    var values = [run.exact];
    run.methods.forEach(function (m) { m.running.forEach(function (p) { values.push(p.value); }); });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = Math.max(0.08, (max - min) * 0.15);
    min -= pad;
    max += pad;
    function x(n) { return plot.x + (Math.log(n) / Math.log(run.params.samples)) * plot.w; }
    function y(value) { return plot.y + (1 - (value - min) / (max - min)) * plot.h; }
    line(ctx, plot.x, y(run.exact), plot.x + plot.w, y(run.exact), COLORS.truth, 1.4, [4, 4]);
    run.methods.forEach(function (method) {
      ctx.beginPath();
      method.running.forEach(function (p, i) {
        var px = x(p.n);
        var py = y(p.value);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = method.color;
      ctx.lineWidth = method.key === "mis" ? 2.4 : 1.4;
      ctx.stroke();
    });
    text(ctx, "truth " + fmt(run.exact, 2), plot.x + 4, y(run.exact) - 7, COLORS.truth, 11, 750);
    text(ctx, "samples", plot.x + plot.w, plot.y + plot.h + 18, COLORS.muted, 10, 500, "right");
  }

  function drawErrors(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "replicate RMSE at selected sample count");
    var plot = { x: box.x + 42, y: box.y + 40, w: box.w - 58, h: box.h - 64 };
    var max = Math.max.apply(null, run.methods.map(function (m) { return m.rmse; }));
    max = Math.max(max, 1e-6);
    run.methods.forEach(function (method, i) {
      var slot = plot.w / run.methods.length;
      var x = plot.x + i * slot + slot * 0.5;
      var h = plot.h * method.rmse / max;
      ctx.fillStyle = method.color;
      ctx.fillRect(x - 18, plot.y + plot.h - h, 36, h);
      text(ctx, method.short, x, plot.y + plot.h + 18, method.color, 10, 750, "center");
      text(ctx, fmt(method.rmse, 2), x, plot.y + plot.h - h - 7, COLORS.text, 10, 600, "center");
    });
    text(ctx, "lower is better", plot.x, box.y + box.h - 12, COLORS.muted, 10, 500);
  }

  function drawRays(ctx, run, box) {
    panel(ctx, box.x, box.y, box.w, box.h, "first MIS sample directions");
    var center = { x: box.x + box.w * 0.50, y: box.y + box.h - 38 };
    var radius = Math.min(box.w * 0.42, box.h * 0.68);
    line(ctx, center.x - radius, center.y, center.x + radius, center.y, COLORS.rule, 1);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, Math.PI, 2 * Math.PI);
    ctx.stroke();
    var iv = lightInterval(run.params);
    ctx.strokeStyle = "rgba(217,119,6,0.28)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, Math.PI + iv.a + Math.PI / 2, Math.PI + iv.b + Math.PI / 2);
    ctx.stroke();
    var mis = run.methods.filter(function (method) { return method.key === "mis"; })[0];
    mis.rays.forEach(function (ray, i) {
      var a = -Math.PI / 2 + (ray.theta + Math.PI / 2);
      var x = center.x + Math.sin(ray.theta) * radius * 0.92;
      var y = center.y - Math.cos(ray.theta) * radius * 0.92;
      line(ctx, center.x, center.y, x, y, i % 5 === 0 ? COLORS.mis : "rgba(15,118,110,0.24)", i % 5 === 0 ? 1.3 : 0.7);
      void a;
    });
    text(ctx, "surface", center.x, center.y + 18, COLORS.muted, 10, 600, "center");
    text(ctx, "orange arc = light", center.x, box.y + 38, COLORS.light, 11, 750, "center");
  }

  function draw(run, canvas) {
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawProfile(ctx, run, { x: 18, y: 18, w: 424, h: 318 });
    drawConvergence(ctx, run, { x: 462, y: 18, w: 420, h: 318 });
    drawErrors(ctx, run, { x: 18, y: 356, w: 424, h: 322 });
    drawRays(ctx, run, { x: 462, y: 356, w: 420, h: 322 });
  }

  function readParams(lab) {
    function number(name, fallback) {
      var input = lab.querySelector('[data-param="' + name + '"]');
      if (!input) return fallback;
      var value = Number(input.value);
      return isFinite(value) ? value : fallback;
    }
    return {
      seed: number("seed", 19),
      samples: number("samples", 256),
      lightAngle: number("lightAngle", 34),
      lightSize: number("lightSize", 12),
      lightPower: number("lightPower", 9),
      environment: number("environment", 11) / 100,
      lobeAngle: number("lobeAngle", 24),
      roughness: number("roughness", 18)
    };
  }

  function updateOutputs(lab, params) {
    var labels = {
      seed: String(params.seed),
      samples: String(params.samples),
      lightAngle: Math.round(degrees(params.lightAngle)) + " deg",
      lightSize: Math.round(degrees(params.lightSize)) + " deg",
      lightPower: fmt(params.lightPower, 1),
      environment: Math.round(params.environment * 100) + "%",
      lobeAngle: Math.round(degrees(params.lobeAngle)) + " deg",
      roughness: Math.round(degrees(params.roughness)) + " deg"
    };
    Object.keys(labels).forEach(function (key) {
      var out = lab.querySelector('[data-value="' + key + '"]');
      if (out) out.textContent = labels[key];
    });
  }

  function render(lab) {
    var rawParams = readParams(lab);
    var params = cleanParams(rawParams);
    updateOutputs(lab, params);
    var run = summarize(rawParams);
    var mis = run.methods.filter(function (method) { return method.key === "mis"; })[0];
    var metrics = lab.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("true integral", fmt(run.exact, 3)),
        metric("MIS estimate", fmt(mis.estimate, 3)),
        metric("MIS RMSE", fmt(mis.rmse, 3)),
        metric("best RMSE", run.best.short),
        metric("audit grid", run.audit.ok + "/" + run.audit.cases)
      ].join("");
    }
    var canvas = lab.querySelector("[data-canvas]");
    if (canvas) draw(run, canvas);
  }

  function init(lab) {
    Array.prototype.slice.call(lab.querySelectorAll("[data-param]")).forEach(function (input) {
      input.addEventListener("input", function () { render(lab); });
      input.addEventListener("change", function () { render(lab); });
    });
    render(lab);
  }

  function initAll() {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-light-transport-lab]")).forEach(init);
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }

  var api = {
    METHODS: METHODS,
    cleanParams: cleanParams,
    estimate: estimate,
    integrand: integrand,
    runAudit: runAudit,
    summarize: summarize,
    truth: truth
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LightTransportLab = api;
})(typeof window !== "undefined" ? window : globalThis);
