(function () {
  var COLORS = {
    test: "#0f766e",
    train: "#b45309",
    threshold: "#2563eb",
    norm: "#7c3aed",
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5"
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatPercent(value) {
    return Math.round(value) + "%";
  }

  function formatMse(value) {
    if (!isFinite(value)) return "n/a";
    if (value >= 10) return value.toFixed(1);
    if (value >= 1) return value.toFixed(2);
    return value.toFixed(3);
  }

  function ridgeValue(raw) {
    if (raw === 0) return 1e-8;
    return Math.pow(10, -7 + raw / 10);
  }

  function formatRidge(raw) {
    var value = ridgeValue(raw);
    if (value < 0.0001) return value.toExponential(0).replace("+", "");
    if (value < 0.01) return value.toExponential(1).replace("+", "");
    return value.toFixed(2);
  }

  function trueFunction(x, wiggle) {
    return Math.sin(Math.PI * x) + 0.45 * wiggle * Math.sin(3 * Math.PI * x + 0.25);
  }

  function makeData(params) {
    var seed = 20260613
      + params.rows * 3
      + params.noise * 5
      + params.ridge * 7
      + params.scale * 11
      + params.wiggle * 13
      + (params.shift + 80) * 17;
    var rand = rng(seed);
    var rows = params.rows;
    var noise = params.noise / 100;
    var wiggle = params.wiggle / 100;
    var shift = params.shift / 100;
    var train = [];
    var test = [];

    for (var i = 0; i < rows; i += 1) {
      var x = -1 + 2 * rand();
      var clean = trueFunction(x, wiggle);
      train.push({ x: x, y: clean + noise * normal(rand), clean: clean });
    }

    for (var j = 0; j < 260; j += 1) {
      var xt = -1 + 2 * (j + 0.5) / 260 + shift;
      var cleanTest = trueFunction(xt, wiggle);
      test.push({ x: xt, y: cleanTest, clean: cleanTest });
    }

    return { train: train, test: test };
  }

  function makeFeatureBank(maxFeatures, params) {
    var rand = rng(90617 + params.scale * 31 + params.wiggle * 17);
    var scale = params.scale / 100;
    var bank = [];

    bank.push({ type: "constant", w: 0, b: 0 });
    bank.push({ type: "linear", w: 1, b: 0 });
    for (var j = 2; j < maxFeatures; j += 1) {
      var lowBand = j % 5 === 0;
      var w = (lowBand ? 1.2 + 2.4 * rand() : 1.2 + 8.5 * rand()) * scale;
      if (rand() < 0.5) w *= -1;
      bank.push({ type: "cos", w: w, b: 2 * Math.PI * rand() });
    }

    return bank;
  }

  function featureValue(feature, x) {
    if (feature.type === "constant") return 1;
    if (feature.type === "linear") return x;
    return Math.cos(Math.PI * feature.w * x + feature.b);
  }

  function designMatrix(data, bank, p) {
    var scale = Math.sqrt(2 / Math.max(1, p));
    return data.map(function (row) {
      var values = [];
      for (var j = 0; j < p; j += 1) {
        var value = featureValue(bank[j], row.x);
        values.push(j < 2 ? value / Math.sqrt(p) : scale * value);
      }
      return values;
    });
  }

  function transposeMultiply(A) {
    var n = A.length;
    var p = A[0].length;
    var out = Array.from({ length: p }, function () { return Array(p).fill(0); });
    for (var i = 0; i < n; i += 1) {
      for (var a = 0; a < p; a += 1) {
        var va = A[i][a];
        for (var b = a; b < p; b += 1) {
          out[a][b] += va * A[i][b];
        }
      }
    }
    for (var r = 0; r < p; r += 1) {
      for (var c = 0; c < r; c += 1) {
        out[r][c] = out[c][r];
      }
    }
    return out;
  }

  function rowMultiply(A) {
    var n = A.length;
    var p = A[0].length;
    var out = Array.from({ length: n }, function () { return Array(n).fill(0); });
    for (var i = 0; i < n; i += 1) {
      for (var j = i; j < n; j += 1) {
        var sum = 0;
        for (var k = 0; k < p; k += 1) sum += A[i][k] * A[j][k];
        out[i][j] = sum;
        out[j][i] = sum;
      }
    }
    return out;
  }

  function transposeVector(A, y) {
    var p = A[0].length;
    var out = Array(p).fill(0);
    for (var i = 0; i < A.length; i += 1) {
      for (var j = 0; j < p; j += 1) out[j] += A[i][j] * y[i];
    }
    return out;
  }

  function matrixVector(A, v) {
    return A.map(function (row) {
      var sum = 0;
      for (var j = 0; j < row.length; j += 1) sum += row[j] * v[j];
      return sum;
    });
  }

  function solveLinear(A, b) {
    var n = A.length;
    var M = A.map(function (row, i) { return row.slice().concat([b[i]]); });

    for (var col = 0; col < n; col += 1) {
      var pivot = col;
      var pivotAbs = Math.abs(M[col][col]);
      for (var r = col + 1; r < n; r += 1) {
        var candidate = Math.abs(M[r][col]);
        if (candidate > pivotAbs) {
          pivotAbs = candidate;
          pivot = r;
        }
      }
      if (pivot !== col) {
        var tmp = M[col];
        M[col] = M[pivot];
        M[pivot] = tmp;
      }

      var diag = M[col][col];
      if (Math.abs(diag) < 1e-10) diag = diag < 0 ? -1e-10 : 1e-10;
      for (var c = col; c <= n; c += 1) M[col][c] /= diag;

      for (var rr = 0; rr < n; rr += 1) {
        if (rr === col) continue;
        var factor = M[rr][col];
        if (factor === 0) continue;
        for (var cc = col; cc <= n; cc += 1) {
          M[rr][cc] -= factor * M[col][cc];
        }
      }
    }

    return M.map(function (row) { return row[n]; });
  }

  function addRidge(A, lambda) {
    var out = A.map(function (row) { return row.slice(); });
    for (var i = 0; i < out.length; i += 1) out[i][i] += lambda;
    return out;
  }

  function fitWeights(X, y, lambda) {
    var n = X.length;
    var p = X[0].length;

    if (p <= n) {
      var XtX = addRidge(transposeMultiply(X), lambda);
      var Xty = transposeVector(X, y);
      return solveLinear(XtX, Xty);
    }

    var XXt = addRidge(rowMultiply(X), lambda);
    var alpha = solveLinear(XXt, y);
    return transposeVector(X, alpha);
  }

  function mse(predictions, rows, useClean) {
    var sum = 0;
    for (var i = 0; i < predictions.length; i += 1) {
      var target = useClean ? rows[i].clean : rows[i].y;
      var error = predictions[i] - target;
      sum += error * error;
    }
    return sum / predictions.length;
  }

  function norm(weights) {
    return Math.sqrt(weights.reduce(function (sum, value) { return sum + value * value; }, 0));
  }

  function featureCounts(rows) {
    var maxFeatures = Math.min(260, Math.max(80, Math.round(rows * 3.2)));
    var values = [2, 4, 6, 8, 12, 16, 24, 32];
    [0.45, 0.6, 0.75, 0.88, 0.95, 1, 1.05, 1.12, 1.25, 1.5, 1.8, 2.2, 2.7, 3.2].forEach(function (ratio) {
      values.push(Math.max(2, Math.round(rows * ratio)));
    });
    [maxFeatures].forEach(function (value) { values.push(value); });
    return values
      .filter(function (value) { return value <= maxFeatures; })
      .sort(function (a, b) { return a - b; })
      .filter(function (value, index, array) { return index === 0 || value !== array[index - 1]; });
  }

  function evaluate(params) {
    var data = makeData(params);
    var counts = featureCounts(params.rows);
    var maxFeatures = Math.max.apply(null, counts);
    var bank = makeFeatureBank(maxFeatures, params);
    var y = data.train.map(function (row) { return row.y; });
    var lambda = ridgeValue(params.ridge);
    var points = counts.map(function (p) {
      var X = designMatrix(data.train, bank, p);
      var Xtest = designMatrix(data.test, bank, p);
      var weights = fitWeights(X, y, lambda);
      var trainPred = matrixVector(X, weights);
      var testPred = matrixVector(Xtest, weights);
      return {
        p: p,
        trainMse: mse(trainPred, data.train, false),
        testMse: mse(testPred, data.test, true),
        norm: norm(weights)
      };
    });

    var best = points.reduce(function (winner, point) {
      return point.testMse < winner.testMse ? point : winner;
    }, points[0]);
    var threshold = points.reduce(function (winner, point) {
      return Math.abs(point.p - params.rows) < Math.abs(winner.p - params.rows) ? point : winner;
    }, points[0]);
    var over = points.filter(function (point) { return point.p >= params.rows * 1.5; });
    var overBest = over.length ? over.reduce(function (winner, point) {
      return point.testMse < winner.testMse ? point : winner;
    }, over[0]) : best;

    return {
      points: points,
      rows: params.rows,
      best: best,
      threshold: threshold,
      overBest: overBest
    };
  }

  function metric(label, value) {
    return '<div class="double-descent-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(canvas, result) {
    var points = result.points;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 430;
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

    var left = width < 560 ? 48 : 60;
    var right = width < 560 ? 28 : 42;
    var top = 34;
    var chartHeight = 250;
    var bottom = top + chartHeight;
    var normTop = 326;
    var normHeight = 62;
    var plotWidth = width - left - right;
    var maxP = Math.max.apply(null, points.map(function (point) { return point.p; }));
    var maxMse = Math.max.apply(null, points.map(function (point) { return Math.max(point.testMse, point.trainMse); }));
    maxMse = Math.max(0.12, Math.min(12, maxMse * 1.16));
    var maxNorm = Math.max.apply(null, points.map(function (point) { return point.norm; }));
    maxNorm = Math.max(1, maxNorm);

    function xScale(p) {
      return left + (p - 2) / (maxP - 2) * plotWidth;
    }

    function yScale(value) {
      var clipped = Math.min(maxMse, Math.max(0, value));
      return bottom - (clipped / maxMse) * chartHeight;
    }

    function normY(value) {
      return normTop + normHeight - (value / maxNorm) * normHeight;
    }

    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(width - right, bottom);
    ctx.stroke();

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Mean squared error by feature count", left, top - 10);

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      var value = maxMse * tick;
      var y = yScale(value);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(formatMse(value), left - 8, y);
    });

    var thresholdX = xScale(result.rows);
    ctx.strokeStyle = COLORS.threshold;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, top);
    ctx.lineTo(thresholdX, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    function drawLine(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach(function (point, index) {
        var x = xScale(point.p);
        var y = yScale(point[key]);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      points.forEach(function (point) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(xScale(point.p), yScale(point[key]), 2.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawLine("testMse", COLORS.test);
    drawLine("trainMse", COLORS.train);

    ctx.fillStyle = COLORS.threshold;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("p = n", thresholdX + 5, top + 6);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, normTop);
    ctx.lineTo(left, normTop + normHeight);
    ctx.lineTo(width - right, normTop + normHeight);
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Selected weight norm", left, normTop - 9);

    ctx.strokeStyle = COLORS.norm;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function (point, index) {
      var x = xScale(point.p);
      var y = normY(point.norm);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    [2, result.rows, maxP].forEach(function (tick) {
      var x = xScale(clamp(tick, 2, maxP));
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(Math.round(tick)), x, normTop + normHeight + 8);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var result = evaluate(params);
    var values = {
      rows: String(params.rows),
      noise: formatPercent(params.noise),
      ridge: formatRidge(params.ridge),
      scale: (params.scale / 100).toFixed(1),
      wiggle: formatPercent(params.wiggle),
      shift: (params.shift / 100).toFixed(2)
    };

    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Best test MSE", formatMse(result.best.testMse)),
        metric("Best features", String(result.best.p)),
        metric("Threshold MSE", formatMse(result.threshold.testMse)),
        metric("Overparam MSE", formatMse(result.overBest.testMse)),
        metric("Threshold norm", formatMse(result.threshold.norm)),
        metric("Train MSE at best", formatMse(result.best.trainMse))
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
    window.addEventListener("resize", redraw);
    redraw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-double-descent-lab]").forEach(init);
  });
}());
