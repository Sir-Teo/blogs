(function (global) {
  "use strict";

  var COLORS = {
    sample: "#be123c",
    shrink: "#2563eb",
    clean: "#0f766e",
    oracle: "#7c3aed",
    equal: "#d97706",
    noise: "#dbeafe",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc"
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
    return '<div class="covariance-noise-lab__metric"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function hash32(value, seed) {
    var x = (value ^ seed) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function uniform(index, seed) {
    return (hash32(index + 1, seed) + 0.5) / 4294967297;
  }

  function normal(index, seed) {
    var u1 = Math.max(1e-12, uniform(index * 2, seed));
    var u2 = uniform(index * 2 + 1, seed);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });
    return params;
  }

  function cleanParams(params) {
    return {
      assets: clamp(Math.round(params.assets), 20, 110),
      observations: clamp(Math.round(params.observations), 35, 420),
      marketShare: clamp(params.marketShare, 0, 65) / 100,
      sectorShare: clamp(params.sectorShare, 0, 45) / 100,
      volDispersion: clamp(params.volDispersion, 0, 70) / 100,
      shrinkage: clamp(params.shrinkage, 0, 95) / 100
    };
  }

  function zeros(n) {
    var rows = [];
    for (var i = 0; i < n; i += 1) {
      var row = [];
      for (var j = 0; j < n; j += 1) row.push(0);
      rows.push(row);
    }
    return rows;
  }

  function identity(n) {
    var rows = zeros(n);
    for (var i = 0; i < n; i += 1) rows[i][i] = 1;
    return rows;
  }

  function buildModel(params) {
    var n = params.assets;
    var sectors = Math.min(7, Math.max(3, Math.round(Math.sqrt(n) / 1.45)));
    var market = [];
    var sector = [];
    var idio = [];
    var sectorId = [];
    for (var i = 0; i < n; i += 1) {
      var group = i % sectors;
      var logVol = (uniform(i + 31, 0xa11ce) - 0.5) * 2 * params.volDispersion;
      var volScale = Math.exp(logVol);
      var bMarket = Math.sqrt(params.marketShare) * (0.82 + 0.36 * uniform(i + 191, 0x51f15eed)) * volScale;
      var bSector = Math.sqrt(params.sectorShare) * (0.70 + 0.58 * uniform(i + 409, 0xbadc0de)) * volScale;
      var idioVar = Math.max(0.06 * volScale * volScale, volScale * volScale - bMarket * bMarket - bSector * bSector);
      market.push(bMarket);
      sector.push(bSector);
      idio.push(Math.sqrt(idioVar));
      sectorId.push(group);
    }
    var trueCov = zeros(n);
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) {
        trueCov[r][c] = market[r] * market[c];
        if (sectorId[r] === sectorId[c]) trueCov[r][c] += sector[r] * sector[c];
        if (r === c) trueCov[r][c] += idio[r] * idio[r];
      }
    }
    return { idio: idio, market: market, sectors: sectors, sector: sector, sectorId: sectorId, trueCov: trueCov };
  }

  function generateReturns(params, model) {
    var rows = [];
    var n = params.assets;
    var tMax = params.observations;
    for (var t = 0; t < tMax; t += 1) {
      var marketShock = normal(t + 13, 0x1001);
      var sectorShock = [];
      for (var s = 0; s < model.sectors; s += 1) {
        sectorShock.push(normal(t * 17 + s + 701, 0x2002));
      }
      var row = [];
      for (var i = 0; i < n; i += 1) {
        var noise = normal(t * n + i + 5003, 0x3003);
        row.push(model.market[i] * marketShock + model.sector[i] * sectorShock[model.sectorId[i]] + model.idio[i] * noise);
      }
      rows.push(row);
    }
    return rows;
  }

  function sampleCovariance(returns) {
    var tMax = returns.length;
    var n = returns[0].length;
    var means = [];
    for (var i = 0; i < n; i += 1) {
      var sum = 0;
      for (var t = 0; t < tMax; t += 1) sum += returns[t][i];
      means.push(sum / tMax);
    }
    var cov = zeros(n);
    var denom = Math.max(1, tMax - 1);
    for (var r = 0; r < n; r += 1) {
      for (var c = r; c < n; c += 1) {
        var s = 0;
        for (var k = 0; k < tMax; k += 1) s += (returns[k][r] - means[r]) * (returns[k][c] - means[c]);
        cov[r][c] = s / denom;
        cov[c][r] = cov[r][c];
      }
    }
    return cov;
  }

  function covarianceToCorrelation(cov) {
    var n = cov.length;
    var std = [];
    for (var i = 0; i < n; i += 1) std.push(Math.sqrt(Math.max(1e-12, cov[i][i])));
    var corr = zeros(n);
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) corr[r][c] = cov[r][c] / (std[r] * std[c]);
      corr[r][r] = 1;
    }
    return { corr: corr, std: std };
  }

  function correlationToCovariance(corr, std) {
    var n = corr.length;
    var cov = zeros(n);
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) cov[r][c] = corr[r][c] * std[r] * std[c];
    }
    return cov;
  }

  function diagonalShrinkage(cov, alpha) {
    var n = cov.length;
    var out = zeros(n);
    for (var r = 0; r < n; r += 1) {
      for (var c = 0; c < n; c += 1) out[r][c] = (1 - alpha) * cov[r][c];
      out[r][r] += alpha * cov[r][r];
    }
    return out;
  }

  function eigenSymmetric(matrix) {
    var n = matrix.length;
    var a = matrix.map(function (row) { return row.slice(); });
    var v = identity(n);
    var sweeps = n > 85 ? 10 : 14;
    for (var sweep = 0; sweep < sweeps; sweep += 1) {
      var changed = 0;
      var threshold = 1e-10 * (1 + sweep);
      for (var p = 0; p < n - 1; p += 1) {
        for (var q = p + 1; q < n; q += 1) {
          var apq = a[p][q];
          if (Math.abs(apq) <= threshold) continue;
          var app = a[p][p];
          var aqq = a[q][q];
          var angle = 0.5 * Math.atan2(2 * apq, aqq - app);
          var cosine = Math.cos(angle);
          var sine = Math.sin(angle);
          for (var k = 0; k < n; k += 1) {
            if (k !== p && k !== q) {
              var akp = a[k][p];
              var akq = a[k][q];
              var newKp = cosine * akp - sine * akq;
              var newKq = sine * akp + cosine * akq;
              a[k][p] = newKp;
              a[p][k] = newKp;
              a[k][q] = newKq;
              a[q][k] = newKq;
            }
            var vkp = v[k][p];
            var vkq = v[k][q];
            v[k][p] = cosine * vkp - sine * vkq;
            v[k][q] = sine * vkp + cosine * vkq;
          }
          var c2 = cosine * cosine;
          var s2 = sine * sine;
          var sc = sine * cosine;
          a[p][p] = c2 * app - 2 * sc * apq + s2 * aqq;
          a[q][q] = s2 * app + 2 * sc * apq + c2 * aqq;
          a[p][q] = 0;
          a[q][p] = 0;
          changed += 1;
        }
      }
      if (changed === 0) break;
    }
    var pairs = [];
    for (var i = 0; i < n; i += 1) {
      pairs.push({
        value: Math.max(0, a[i][i]),
        vector: v.map(function (row) { return row[i]; })
      });
    }
    pairs.sort(function (left, right) { return right.value - left.value; });
    return { values: pairs.map(function (p) { return p.value; }), vectors: pairs.map(function (p) { return p.vector; }) };
  }

  function cleanCorrelationWithMP(corr, eig, lambdaPlus) {
    var n = corr.length;
    var cleanValues = eig.values.slice();
    var noiseIndex = [];
    var noiseSum = 0;
    for (var i = 0; i < cleanValues.length; i += 1) {
      if (cleanValues[i] <= lambdaPlus) {
        noiseIndex.push(i);
        noiseSum += cleanValues[i];
      }
    }
    if (noiseIndex.length) {
      var replacement = noiseSum / noiseIndex.length;
      noiseIndex.forEach(function (idx) {
        cleanValues[idx] = replacement;
      });
    }
    var clean = zeros(n);
    for (var k = 0; k < n; k += 1) {
      var value = cleanValues[k];
      var vector = eig.vectors[k];
      for (var r = 0; r < n; r += 1) {
        for (var c = r; c < n; c += 1) {
          clean[r][c] += value * vector[r] * vector[c];
        }
      }
    }
    for (var rr = 0; rr < n; rr += 1) {
      for (var cc = rr + 1; cc < n; cc += 1) clean[cc][rr] = clean[rr][cc];
    }
    var scale = [];
    for (var d = 0; d < n; d += 1) scale.push(1 / Math.sqrt(Math.max(1e-9, clean[d][d])));
    for (var x = 0; x < n; x += 1) {
      for (var y = 0; y < n; y += 1) clean[x][y] *= scale[x] * scale[y];
      clean[x][x] = 1;
    }
    return { corr: clean, values: cleanValues, noiseCount: noiseIndex.length };
  }

  function solveLinear(matrix, rhs) {
    var n = matrix.length;
    var a = [];
    var trace = 0;
    for (var i = 0; i < n; i += 1) trace += matrix[i][i];
    var ridge = Math.max(1e-8, trace / Math.max(1, n) * 1e-5);
    for (var r = 0; r < n; r += 1) {
      var row = matrix[r].slice();
      row[r] += ridge;
      row.push(rhs[r]);
      a.push(row);
    }
    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      var best = Math.abs(a[col][col]);
      for (var pr = col + 1; pr < n; pr += 1) {
        var candidate = Math.abs(a[pr][col]);
        if (candidate > best) {
          best = candidate;
          pivot = pr;
        }
      }
      if (best < 1e-12) return null;
      if (pivot !== col) {
        var tmp = a[col];
        a[col] = a[pivot];
        a[pivot] = tmp;
      }
      var pivotValue = a[col][col];
      for (var pc = col; pc <= n; pc += 1) a[col][pc] /= pivotValue;
      for (var er = 0; er < n; er += 1) {
        if (er === col) continue;
        var factor = a[er][col];
        if (factor === 0) continue;
        for (var ec = col; ec <= n; ec += 1) a[er][ec] -= factor * a[col][ec];
      }
    }
    return a.map(function (row) { return row[n]; });
  }

  function minVarianceWeights(cov) {
    var n = cov.length;
    var ones = [];
    for (var i = 0; i < n; i += 1) ones.push(1);
    var raw = solveLinear(cov, ones);
    if (!raw) {
      return ones.map(function () { return 1 / n; });
    }
    var sum = raw.reduce(function (acc, value) { return acc + value; }, 0);
    if (!isFinite(sum) || Math.abs(sum) < 1e-12) {
      return ones.map(function () { return 1 / n; });
    }
    return raw.map(function (value) { return value / sum; });
  }

  function quadraticForm(cov, weights) {
    var n = weights.length;
    var sum = 0;
    for (var r = 0; r < n; r += 1) {
      var inner = 0;
      for (var c = 0; c < n; c += 1) inner += cov[r][c] * weights[c];
      sum += weights[r] * inner;
    }
    return sum;
  }

  function portfolioStats(name, color, estimateCov, trueCov, equalWeights) {
    var weights = equalWeights || minVarianceWeights(estimateCov);
    var predictedRisk = Math.sqrt(Math.max(0, quadraticForm(estimateCov, weights)));
    var trueRisk = Math.sqrt(Math.max(0, quadraticForm(trueCov, weights)));
    var gross = weights.reduce(function (sum, value) { return sum + Math.abs(value); }, 0);
    var shortSide = weights.reduce(function (sum, value) { return sum + Math.max(0, -value); }, 0);
    return {
      color: color,
      gross: gross,
      name: name,
      predictedRisk: predictedRisk,
      shortSide: shortSide,
      trueRisk: trueRisk,
      weights: weights
    };
  }

  function simulate(params) {
    var clean = cleanParams(params);
    var model = buildModel(clean);
    var returns = generateReturns(clean, model);
    var sampleCov = sampleCovariance(returns);
    var sampleCorr = covarianceToCorrelation(sampleCov);
    var eig = eigenSymmetric(sampleCorr.corr);
    var q = clean.assets / clean.observations;
    var lambdaMinus = Math.pow(1 - Math.sqrt(q), 2);
    var lambdaPlus = Math.pow(1 + Math.sqrt(q), 2);
    var mpClean = cleanCorrelationWithMP(sampleCorr.corr, eig, lambdaPlus);
    var cleanedCov = correlationToCovariance(mpClean.corr, sampleCorr.std);
    var shrinkCov = diagonalShrinkage(sampleCov, clean.shrinkage);
    var equalWeights = [];
    for (var i = 0; i < clean.assets; i += 1) equalWeights.push(1 / clean.assets);
    var oracle = portfolioStats("oracle", COLORS.oracle, model.trueCov, model.trueCov);
    var sample = portfolioStats("sample", COLORS.sample, sampleCov, model.trueCov);
    var shrink = portfolioStats("shrink", COLORS.shrink, shrinkCov, model.trueCov);
    var cleaned = portfolioStats("RMT clean", COLORS.clean, cleanedCov, model.trueCov);
    var equal = portfolioStats("1/N", COLORS.equal, model.trueCov, model.trueCov, equalWeights);
    var outliers = eig.values.filter(function (value) { return value > lambdaPlus; }).length;
    var positiveMin = eig.values.slice().reverse().find(function (value) { return value > 1e-8; }) || 1e-8;
    return {
      cleaned: cleaned,
      cleanNoiseCount: mpClean.noiseCount,
      equal: equal,
      eigen: eig,
      lambdaMinus: lambdaMinus,
      lambdaPlus: lambdaPlus,
      observations: returns,
      oracle: oracle,
      outliers: outliers,
      params: clean,
      q: q,
      sample: sample,
      sampleCondition: eig.values[0] / positiveMin,
      shrink: shrink,
      trueCov: model.trueCov
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

  function drawAxis(ctx, plot) {
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
  }

  function drawSpectrum(ctx, result, box) {
    panelTitle(ctx, box, "Correlation spectrum", "Marchenko-Pastur band marks where pure noise can live");
    var plot = { x: box.x + 42, y: box.y + 48, w: box.w - 58, h: box.h - 78 };
    var values = result.eigen.values;
    var maxEigen = Math.max(result.lambdaPlus * 1.15, values[0] * 1.08, 1.1);
    function xScale(i) { return plot.x + i / Math.max(1, values.length - 1) * plot.w; }
    function yScale(value) { return plot.y + plot.h - clamp(value / maxEigen, 0, 1) * plot.h; }
    drawAxis(ctx, plot);
    ctx.fillStyle = COLORS.noise;
    ctx.fillRect(plot.x, yScale(result.lambdaPlus), plot.w, Math.max(2, yScale(result.lambdaMinus) - yScale(result.lambdaPlus)));
    ctx.strokeStyle = COLORS.equal;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(result.lambdaPlus));
    ctx.lineTo(plot.x + plot.w, yScale(result.lambdaPlus));
    ctx.stroke();
    ctx.setLineDash([]);
    values.forEach(function (value, i) {
      ctx.fillStyle = value > result.lambdaPlus ? COLORS.oracle : COLORS.sample;
      ctx.globalAlpha = value > result.lambdaPlus ? 0.92 : 0.45;
      ctx.beginPath();
      ctx.arc(xScale(i), yScale(value), value > result.lambdaPlus ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(result.outliers + " spikes", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("lambda+ " + formatNumber(result.lambdaPlus) + ", q=N/T " + formatNumber(result.q), plot.x, plot.y + 38);
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(maxEigen), plot.x - 7, plot.y + 4);
    ctx.fillText("0", plot.x - 7, plot.y + plot.h);
    ctx.textAlign = "left";
  }

  function drawRiskBars(ctx, result, box) {
    panelTitle(ctx, box, "Risk: promised vs paid", "same optimizer, different covariance estimates");
    var plot = { x: box.x, y: box.y + 54, w: box.w, h: box.h - 78 };
    var rows = [result.equal, result.oracle, result.sample, result.shrink, result.cleaned];
    var maxRisk = Math.max.apply(null, rows.map(function (row) {
      return Math.max(row.predictedRisk, row.trueRisk);
    })) * 1.15;
    var rowGap = Math.min(34, Math.max(24, plot.h / rows.length));
    rows.forEach(function (row, i) {
      var y = plot.y + i * rowGap;
      var barW = plot.w - 142;
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(plot.x + 70, y, barW, 18);
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.23;
      ctx.fillRect(plot.x + 70, y + 3, barW * clamp(row.predictedRisk / maxRisk, 0, 1), 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = row.color;
      ctx.fillRect(plot.x + 70, y, barW * clamp(row.trueRisk / maxRisk, 0, 1), 18);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.name, plot.x, y + 13);
      ctx.textAlign = "right";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(formatPercent(row.trueRisk * 100), plot.x + plot.w, y + 13);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("solid = true risk, pale = in-sample estimate", plot.x + 70, plot.y + rows.length * rowGap + 10);
  }

  function drawWeights(ctx, result, box) {
    panelTitle(ctx, box, "Weights after inversion", "small eigenvalues become large long-short bets");
    var plot = { x: box.x + 42, y: box.y + 50, w: box.w - 58, h: box.h - 80 };
    var series = [result.sample, result.shrink, result.cleaned];
    var maxAbs = Math.max.apply(null, series.reduce(function (acc, row) {
      return acc.concat(row.weights.map(function (w) { return Math.abs(w); }));
    }, [1 / result.params.assets]));
    maxAbs = Math.max(maxAbs, 1 / result.params.assets) * 1.08;
    function xScale(i) { return plot.x + i / Math.max(1, result.params.assets - 1) * plot.w; }
    function yScale(value) { return plot.y + plot.h / 2 - value / maxAbs * (plot.h / 2); }
    drawAxis(ctx, plot);
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(plot.x, yScale(0));
    ctx.lineTo(plot.x + plot.w, yScale(0));
    ctx.stroke();
    series.forEach(function (row) {
      var sorted = row.weights.slice().sort(function (a, b) { return a - b; });
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      sorted.forEach(function (value, i) {
        var x = xScale(i);
        var y = yScale(value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("gross " + formatNumber(result.sample.gross) + "x", plot.x, plot.y + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("sample red, shrink blue, clean green", plot.x, plot.y + 38);
    ctx.textAlign = "right";
    ctx.fillText(formatPercent(maxAbs * 100), plot.x - 7, plot.y + 4);
    ctx.fillText("-" + formatPercent(maxAbs * 100), plot.x - 7, plot.y + plot.h - 9);
    ctx.textAlign = "left";
  }

  function drawLedger(ctx, result, box) {
    panelTitle(ctx, box, "Estimation ledger", "how many parameters asked for how much history");
    var plot = { x: box.x, y: box.y + 52, w: box.w, h: box.h - 64 };
    var sampleTax = result.sample.trueRisk / result.oracle.trueRisk - 1;
    var shrinkTax = result.shrink.trueRisk / result.oracle.trueRisk - 1;
    var cleanTax = result.cleaned.trueRisk / result.oracle.trueRisk - 1;
    var rows = [
      ["assets / observations", result.params.assets + " / " + result.params.observations],
      ["covariance entries", formatNumber(result.params.assets * (result.params.assets + 1) / 2)],
      ["sample condition", formatNumber(result.sampleCondition) + "x"],
      ["noise eigenvalues", result.cleanNoiseCount + " / " + result.params.assets],
      ["sample optimizer tax", formatPercent(sampleTax * 100)],
      ["shrink optimizer tax", formatPercent(shrinkTax * 100)],
      ["clean optimizer tax", formatPercent(cleanTax * 100)]
    ];
    var rowGap = Math.min(28, Math.max(21, plot.h / rows.length));
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
      drawSpectrum(ctx, result, { x: margin, y: 28, w: panelW, h: 286 });
      drawRiskBars(ctx, result, { x: margin, y: 342, w: panelW, h: 202 });
      drawWeights(ctx, result, { x: margin, y: 572, w: panelW, h: 202 });
      drawLedger(ctx, result, { x: margin, y: 804, w: panelW, h: 148 });
    } else {
      var gap = 42;
      var panelW2 = (width - margin * 2 - gap) / 2;
      drawSpectrum(ctx, result, { x: margin, y: 30, w: panelW2, h: 320 });
      drawRiskBars(ctx, result, { x: margin + panelW2 + gap, y: 30, w: panelW2, h: 320 });
      drawWeights(ctx, result, { x: margin, y: 398, w: panelW2, h: 244 });
      drawLedger(ctx, result, { x: margin + panelW2 + gap, y: 398, w: panelW2, h: 244 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var values = {
      assets: String(result.params.assets),
      observations: String(result.params.observations),
      marketShare: formatPercent(result.params.marketShare * 100),
      sectorShare: formatPercent(result.params.sectorShare * 100),
      shrinkage: formatPercent(result.params.shrinkage * 100),
      volDispersion: formatPercent(result.params.volDispersion * 100)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var sampleTax = result.sample.trueRisk / result.oracle.trueRisk - 1;
    var cleanTax = result.cleaned.trueRisk / result.oracle.trueRisk - 1;
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Sample tax", formatPercent(sampleTax * 100)),
        metric("Clean tax", formatPercent(cleanTax * 100)),
        metric("Sample gross", formatNumber(result.sample.gross) + "x"),
        metric("MP edge", formatNumber(result.lambdaPlus)),
        metric("Spectral spikes", result.outliers + " / " + result.params.assets),
        metric("q = N/T", formatNumber(result.q))
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
    Array.prototype.slice.call(global.document.querySelectorAll("[data-covariance-noise-lab]")).forEach(init);
  }

  var api = {
    eigenSymmetric: eigenSymmetric,
    minVarianceWeights: minVarianceWeights,
    simulate: simulate
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.CovarianceNoiseLab = api;

  if (global.document) {
    global.document.addEventListener("DOMContentLoaded", initAll);
  }
}(typeof window !== "undefined" ? window : globalThis));
