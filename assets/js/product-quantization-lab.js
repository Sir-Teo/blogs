(function (global) {
  "use strict";

  var DIMS = 8;
  var TOP_K = 10;
  var KMEANS_ITERS = 13;

  var COLORS = {
    amber: "#d97706",
    axis: "#d7dee5",
    blue: "#2563eb",
    green: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    red: "#be123c",
    softAmber: "rgba(217, 119, 6, 0.16)",
    softBlue: "rgba(37, 99, 235, 0.12)",
    softGreen: "rgba(15, 118, 110, 0.15)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    codewords: 16,
    geometry: "spiky",
    points: 520,
    rotation: "spread",
    seed: 37,
    subquantizers: 4
  };

  var GEOMETRIES = {
    spiky: {
      label: "spiky covariance",
      note: "Most signal lives in the first two coordinates, so raw axis slices waste several codebooks on quiet dimensions."
    },
    entangled: {
      label: "entangled clusters",
      note: "The signal is mixed across coordinates, making every subspace matter."
    },
    ring: {
      label: "curved manifold",
      note: "Vectors lie near a bent two-dimensional manifold with local neighborhoods along the ring."
    }
  };

  var ROTATIONS = {
    raw: {
      label: "raw axes",
      note: "Split the coordinates exactly as stored."
    },
    spread: {
      label: "spread rotation",
      note: "Apply a fixed orthonormal mixing before splitting, a toy version of the rotation idea behind optimized PQ."
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function snap(value, fallback, min, max, step) {
    var raw = number(value, fallback);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  }

  function cleanParams(raw) {
    raw = raw || {};
    var m = snap(raw.subquantizers, DEFAULTS.subquantizers, 2, 8, 1);
    if (DIMS % m !== 0) m = m < 4 ? 2 : 4;
    var k = snap(raw.codewords, DEFAULTS.codewords, 4, 32, 1);
    if ([4, 8, 16, 32].indexOf(k) === -1) {
      k = [4, 8, 16, 32].reduce(function (best, value) {
        return Math.abs(value - k) < Math.abs(best - k) ? value : best;
      }, 16);
    }
    return {
      codewords: k,
      geometry: GEOMETRIES[raw.geometry] ? raw.geometry : DEFAULTS.geometry,
      points: snap(raw.points, DEFAULTS.points, 180, 760, 20),
      rotation: ROTATIONS[raw.rotation] ? raw.rotation : DEFAULTS.rotation,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      subquantizers: m
    };
  }

  function hash32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rng(seed) {
    var state = hash32(seed || 1);
    return function () {
      state = hash32(state + 0x9e3779b9);
      return state / 4294967296;
    };
  }

  function normal(rand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formatPercent(value) {
    if (!isFinite(value)) return "n/a";
    return Math.round(value * 100) + "%";
  }

  function formatNumber(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function formatCompact(value) {
    if (!isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  function fmtRank(value) {
    return value > 999 ? ">999" : String(value);
  }

  function dot(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  }

  function dist2(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i += 1) {
      var d = a[i] - b[i];
      sum += d * d;
    }
    return sum;
  }

  function add(a, b) {
    var out = [];
    for (var i = 0; i < a.length; i += 1) out.push(a[i] + b[i]);
    return out;
  }

  function scale(a, s) {
    var out = [];
    for (var i = 0; i < a.length; i += 1) out.push(a[i] * s);
    return out;
  }

  function zeroVector() {
    var out = [];
    for (var i = 0; i < DIMS; i += 1) out.push(0);
    return out;
  }

  function subvector(vector, start, length) {
    var out = [];
    for (var i = 0; i < length; i += 1) out.push(vector[start + i]);
    return out;
  }

  function makeHadamard() {
    var h = [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, -1, 1, -1, 1, -1, 1, -1],
      [1, 1, -1, -1, 1, 1, -1, -1],
      [1, -1, -1, 1, 1, -1, -1, 1],
      [1, 1, 1, 1, -1, -1, -1, -1],
      [1, -1, 1, -1, -1, 1, -1, 1],
      [1, 1, -1, -1, -1, -1, 1, 1],
      [1, -1, -1, 1, -1, 1, 1, -1]
    ];
    return h.map(function (row) {
      return row.map(function (value) {
        return value / Math.sqrt(DIMS);
      });
    });
  }

  var SPREAD_ROTATION = makeHadamard();

  function applyRotation(vector, mode) {
    if (mode === "raw") return vector.slice();
    var out = [];
    for (var i = 0; i < DIMS; i += 1) out.push(dot(SPREAD_ROTATION[i], vector));
    return out;
  }

  function inverseRotation(vector, mode) {
    if (mode === "raw") return vector.slice();
    var out = [];
    for (var j = 0; j < DIMS; j += 1) {
      var sum = 0;
      for (var i = 0; i < DIMS; i += 1) sum += SPREAD_ROTATION[i][j] * vector[i];
      out.push(sum);
    }
    return out;
  }

  function clusterCenter(cluster, count, geometry) {
    var angle = 2 * Math.PI * cluster / count + 0.35 * Math.sin(cluster * 1.7);
    var radius = geometry === "ring" ? 2.25 : 2.0 + 0.35 * Math.sin(cluster * 2.1);
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }

  function embedLatent(z, cluster, geometry, rand) {
    var x = zeroVector();
    if (geometry === "spiky") {
      x[0] = 2.45 * z[0] + 0.12 * normal(rand);
      x[1] = 2.10 * z[1] + 0.12 * normal(rand);
      x[2] = 0.28 * z[0] - 0.10 * z[1] + 0.36 * normal(rand);
      x[3] = 0.12 * z[0] + 0.24 * normal(rand);
      x[4] = 0.18 * z[1] + 0.28 * normal(rand);
      x[5] = 0.15 * normal(rand);
      x[6] = 0.11 * z[0] + 0.22 * normal(rand);
      x[7] = 0.10 * z[1] + 0.22 * normal(rand);
    } else if (geometry === "entangled") {
      x[0] = 1.05 * z[0] + 0.70 * z[1] + 0.28 * normal(rand);
      x[1] = -0.60 * z[0] + 0.95 * z[1] + 0.28 * normal(rand);
      x[2] = 0.75 * z[0] - 0.45 * z[1] + 0.30 * normal(rand);
      x[3] = 0.45 * z[0] + 0.85 * z[1] + 0.30 * normal(rand);
      x[4] = -0.80 * z[0] + 0.35 * z[1] + 0.28 * normal(rand);
      x[5] = 0.35 * z[0] - 0.95 * z[1] + 0.28 * normal(rand);
      x[6] = 0.55 * z[0] + 0.20 * z[1] + 0.32 * normal(rand);
      x[7] = -0.20 * z[0] + 0.65 * z[1] + 0.32 * normal(rand);
    } else {
      var theta = Math.atan2(z[1], z[0]);
      var radial = Math.sqrt(z[0] * z[0] + z[1] * z[1]);
      x[0] = radial * Math.cos(theta) + 0.18 * normal(rand);
      x[1] = radial * Math.sin(theta) + 0.18 * normal(rand);
      x[2] = Math.cos(2 * theta) + 0.20 * normal(rand);
      x[3] = Math.sin(2 * theta) + 0.20 * normal(rand);
      x[4] = 0.45 * Math.cos(3 * theta) + 0.22 * normal(rand);
      x[5] = 0.45 * Math.sin(3 * theta) + 0.22 * normal(rand);
      x[6] = 0.22 * radial + 0.22 * normal(rand);
      x[7] = (cluster % 2 ? 0.22 : -0.22) + 0.25 * normal(rand);
    }
    return x;
  }

  function generateDataset(params) {
    var rand = rng(params.seed * 104729 + params.points * 17);
    var clusters = params.geometry === "ring" ? 7 : 6;
    var vectors = [];
    for (var i = 0; i < params.points; i += 1) {
      var cluster = Math.floor(rand() * clusters);
      var center = clusterCenter(cluster, clusters, params.geometry);
      var localScale = params.geometry === "ring" ? 0.22 : 0.42 + 0.05 * (cluster % 3);
      var z = [
        center[0] + localScale * normal(rand),
        center[1] + localScale * normal(rand)
      ];
      vectors.push({
        cluster: cluster,
        id: i,
        latent: z,
        vector: embedLatent(z, cluster, params.geometry, rand)
      });
    }
    var queryRand = rng(params.seed * 7919 + params.points * 37);
    var anchorIndex = Math.floor(queryRand() * vectors.length);
    var anchor = vectors[anchorIndex];
    var query = anchor.vector.map(function (value, d) {
      return value + (d < 2 ? 0.13 : 0.06) * normal(queryRand);
    });
    return {
      anchorIndex: anchorIndex,
      clusters: clusters,
      query: query,
      queryLatent: anchor.latent.slice(),
      vectors: vectors
    };
  }

  function rankDistances(values) {
    return values.slice().sort(function (a, b) {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.index - b.index;
    });
  }

  function exactRanking(vectors, query) {
    return rankDistances(vectors.map(function (item, index) {
      return { distance: dist2(item.vector, query), index: index };
    }));
  }

  function chooseInitialCentroids(rows, k, subSeed) {
    var scored = rows.map(function (row, index) {
      var score = 0;
      for (var d = 0; d < row.length; d += 1) {
        score += row[d] * (d + 1.37);
      }
      score += (hash32(index * 1009 + subSeed * 9176) / 4294967296) * 1e-5;
      return { index: index, row: row, score: score };
    }).sort(function (a, b) {
      return a.score - b.score;
    });
    var centroids = [];
    for (var i = 0; i < k; i += 1) {
      var pick = Math.round((i + 0.5) * scored.length / k - 0.5);
      pick = clamp(pick, 0, scored.length - 1);
      centroids.push(scored[pick].row.slice());
    }
    return centroids;
  }

  function assignRows(rows, centroids) {
    var assignments = [];
    var distortion = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var best = 0;
      var bestDistance = Infinity;
      for (var c = 0; c < centroids.length; c += 1) {
        var d = dist2(rows[i], centroids[c]);
        if (d < bestDistance) {
          best = c;
          bestDistance = d;
        }
      }
      assignments.push(best);
      distortion += bestDistance;
    }
    return { assignments: assignments, distortion: distortion / rows.length };
  }

  function updateCentroids(rows, assignments, centroids) {
    var sums = [];
    var counts = [];
    var dims = rows[0].length;
    for (var c = 0; c < centroids.length; c += 1) {
      sums.push(Array(dims).fill(0));
      counts.push(0);
    }
    for (var i = 0; i < rows.length; i += 1) {
      var a = assignments[i];
      counts[a] += 1;
      for (var d = 0; d < dims; d += 1) sums[a][d] += rows[i][d];
    }
    return centroids.map(function (centroid, c) {
      if (counts[c] === 0) return centroid.slice();
      return sums[c].map(function (value) {
        return value / counts[c];
      });
    });
  }

  function trainKMeans(rows, k, subSeed) {
    var centroids = chooseInitialCentroids(rows, k, subSeed);
    var history = [];
    var assigned = assignRows(rows, centroids);
    history.push(assigned.distortion);
    for (var iter = 0; iter < KMEANS_ITERS; iter += 1) {
      centroids = updateCentroids(rows, assigned.assignments, centroids);
      assigned = assignRows(rows, centroids);
      history.push(assigned.distortion);
    }
    return {
      assignments: assigned.assignments,
      centroids: centroids,
      history: history
    };
  }

  function trainProductQuantizer(rotatedVectors, params) {
    var m = params.subquantizers;
    var subDim = DIMS / m;
    var codebooks = [];
    var histories = [];
    var assignmentsBySubspace = [];
    for (var s = 0; s < m; s += 1) {
      var start = s * subDim;
      var rows = rotatedVectors.map(function (vector) {
        return subvector(vector, start, subDim);
      });
      var trained = trainKMeans(rows, params.codewords, params.seed * 113 + s * 17);
      codebooks.push(trained.centroids);
      histories.push(trained.history);
      assignmentsBySubspace.push(trained.assignments);
    }
    var codes = rotatedVectors.map(function (_, index) {
      var code = [];
      for (var s = 0; s < m; s += 1) code.push(assignmentsBySubspace[s][index]);
      return code;
    });
    return {
      codebooks: codebooks,
      codes: codes,
      histories: histories,
      subDim: subDim
    };
  }

  function makeDistanceTable(rotatedQuery, pq) {
    var table = [];
    for (var s = 0; s < pq.codebooks.length; s += 1) {
      var start = s * pq.subDim;
      var q = subvector(rotatedQuery, start, pq.subDim);
      table.push(pq.codebooks[s].map(function (centroid) {
        return dist2(q, centroid);
      }));
    }
    return table;
  }

  function adcDistance(code, table) {
    var sum = 0;
    for (var s = 0; s < code.length; s += 1) sum += table[s][code[s]];
    return sum;
  }

  function decodeRotated(code, pq) {
    var out = [];
    for (var s = 0; s < code.length; s += 1) {
      var centroid = pq.codebooks[s][code[s]];
      for (var d = 0; d < centroid.length; d += 1) out.push(centroid[d]);
    }
    return out;
  }

  function reconstructError(rotatedVectors, pq) {
    var sum = 0;
    var energy = 0;
    for (var i = 0; i < rotatedVectors.length; i += 1) {
      var recon = decodeRotated(pq.codes[i], pq);
      sum += dist2(rotatedVectors[i], recon);
      energy += dist2(rotatedVectors[i], Array(DIMS).fill(0));
    }
    return {
      relRmse: Math.sqrt(sum / Math.max(energy, 1e-12)),
      mse: sum / rotatedVectors.length
    };
  }

  function codeUsage(pq) {
    return pq.codebooks.map(function (book, s) {
      var counts = Array(book.length).fill(0);
      pq.codes.forEach(function (code) {
        counts[code[s]] += 1;
      });
      return counts;
    });
  }

  function evaluate(params, options) {
    params = cleanParams(params);
    options = options || {};
    var dataset = generateDataset(params);
    var rotatedVectors = dataset.vectors.map(function (item) {
      return applyRotation(item.vector, params.rotation);
    });
    var rotatedQuery = applyRotation(dataset.query, params.rotation);
    var pq = trainProductQuantizer(rotatedVectors, params);
    var table = makeDistanceTable(rotatedQuery, pq);
    var exact = exactRanking(dataset.vectors, dataset.query);
    var approx = rankDistances(pq.codes.map(function (code, index) {
      return { distance: adcDistance(code, table), index: index };
    }));
    var exactTop = exact.slice(0, TOP_K).map(function (item) { return item.index; });
    var exactSet = {};
    exactTop.forEach(function (index) { exactSet[index] = true; });
    var overlap = approx.slice(0, TOP_K).reduce(function (sum, item) {
      return sum + (exactSet[item.index] ? 1 : 0);
    }, 0);
    var exactTop1 = exact[0].index;
    var approxTop1 = approx[0].index;
    var exactTopRankInApprox = approx.findIndex(function (item) {
      return item.index === exactTop1;
    }) + 1;
    if (exactTopRankInApprox <= 0) exactTopRankInApprox = 9999;
    var recon = reconstructError(rotatedVectors, pq);
    var codeBits = params.subquantizers * Math.ceil(Math.log(params.codewords) / Math.log(2));
    var infoBytes = codeBits / 8;
    var rawBytes = DIMS * 4;
    var codebookBytes = params.subquantizers * params.codewords * pq.subDim * 4;
    var exactWork = params.points * DIMS;
    var adcWork = params.codewords * DIMS + params.points * params.subquantizers;
    var result = {
      approx: approx,
      codebookBytes: codebookBytes,
      codeBits: codeBits,
      compression: rawBytes / infoBytes,
      dataset: dataset,
      exact: exact,
      exactTop1: exactTop1,
      exactTopRankInApprox: exactTopRankInApprox,
      infoBytes: infoBytes,
      overlap: overlap,
      params: params,
      pq: pq,
      rawBytes: rawBytes,
      recallAt10: overlap / TOP_K,
      recon: recon,
      rotatedQuery: rotatedQuery,
      rotatedVectors: rotatedVectors,
      table: table,
      tableWorkRatio: exactWork / adcWork,
      usage: codeUsage(pq)
    };
    if (options.frontier !== false) result.frontier = makeFrontier(params);
    return result;
  }

  function makeFrontier(params) {
    var out = [];
    [2, 4, 8].forEach(function (m) {
      [4, 8, 16, 32].forEach(function (k) {
        var trialParams = cleanParams({
          codewords: k,
          geometry: params.geometry,
          points: params.points,
          rotation: params.rotation,
          seed: params.seed,
          subquantizers: m
        });
        var trial = evaluate(trialParams, { frontier: false });
        out.push({
          codewords: k,
          compression: trial.compression,
          m: m,
          recallAt10: trial.recallAt10,
          relRmse: trial.recon.relRmse
        });
      });
    });
    return out;
  }

  function maxAbsAdcIdentity(result, limit) {
    var maxErr = 0;
    var count = Math.min(limit || result.pq.codes.length, result.pq.codes.length);
    for (var i = 0; i < count; i += 1) {
      var recon = decodeRotated(result.pq.codes[i], result.pq);
      var fromRecon = dist2(result.rotatedQuery, recon);
      var fromTable = adcDistance(result.pq.codes[i], result.table);
      maxErr = Math.max(maxErr, Math.abs(fromRecon - fromTable));
    }
    return maxErr;
  }

  function historyNonIncreasing(history) {
    for (var i = 1; i < history.length; i += 1) {
      if (history[i] > history[i - 1] + 1e-9) return false;
    }
    return true;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function finiteArray(values) {
    return values.every(function (value) { return Number.isFinite(value); });
  }

  function sortedByDistance(rows) {
    for (var i = 1; i < rows.length; i += 1) {
      if (rows[i].distance < rows[i - 1].distance - 1e-12) return false;
      if (near(rows[i].distance, rows[i - 1].distance, 1e-12) && rows[i].index < rows[i - 1].index) return false;
    }
    return true;
  }

  function audit() {
    var cases = [];
    ["spiky", "entangled", "ring"].forEach(function (geometry) {
      ["raw", "spread"].forEach(function (rotation) {
        [
          { codewords: 8, points: 280, seed: 11, subquantizers: 2 },
          { codewords: 16, points: 320, seed: 17, subquantizers: 4 },
          { codewords: 8, points: 300, seed: 23, subquantizers: 8 }
        ].forEach(function (base) {
          cases.push({
            codewords: base.codewords,
            geometry: geometry,
            points: base.points,
            rotation: rotation,
            seed: base.seed,
            subquantizers: base.subquantizers
          });
        });
      });
    });

    var checked = 0;
    var maxIdentityError = 0;
    var maxRelRmse = 0;
    var minRecallAt10 = 1;
    var maxExactTopRankInApprox = 0;
    var reports = cases.map(function (params) {
      var result = evaluate(params, { frontier: false });
      var expectedBits = result.params.subquantizers * Math.ceil(Math.log(result.params.codewords) / Math.log(2));
      assert(result.dataset.vectors.length === result.params.points, "dataset should honor sanitized point count");
      assert(result.pq.codebooks.length === result.params.subquantizers, "one codebook per subquantizer");
      assert(result.table.length === result.params.subquantizers, "distance table should have one row per subquantizer");
      assert(result.table.every(function (row) { return row.length === result.params.codewords && finiteArray(row); }), "distance table rows should be finite and have codeword width");
      assert(result.pq.codes.length === result.params.points, "one product code per database vector");
      result.pq.codes.forEach(function (code) {
        assert(code.length === result.params.subquantizers, "code length should equal subquantizer count");
        code.forEach(function (value) {
          assert(value >= 0 && value < result.params.codewords, "code index should stay inside codebook");
        });
        checked += code.length;
      });
      assert(result.pq.histories.every(historyNonIncreasing), "k-means distortion histories should not increase after assignment");
      assert(result.usage.every(function (counts) {
        return counts.reduce(function (sum, count) { return sum + count; }, 0) === result.params.points;
      }), "code usage counts should sum to database size");
      assert(sortedByDistance(result.exact), "exact ranking should be distance sorted");
      assert(sortedByDistance(result.approx), "ADC ranking should be distance sorted");
      assert(result.approx.every(function (row) {
        return near(row.distance, adcDistance(result.pq.codes[row.index], result.table), 1e-10);
      }), "ADC ranking distances should match table lookups");
      assert(result.codeBits === expectedBits, "code bit ledger");
      assert(near(result.infoBytes, expectedBits / 8, 1e-12), "code byte ledger");
      assert(result.rawBytes === DIMS * 4, "raw byte ledger");
      assert(near(result.compression, result.rawBytes / result.infoBytes, 1e-12), "compression should be raw bytes divided by code bytes");
      assert(result.codebookBytes === result.params.subquantizers * result.params.codewords * result.pq.subDim * 4, "codebook byte ledger");
      var identityError = maxAbsAdcIdentity(result, 80);
      assert(identityError < 1e-8, "ADC should equal distance to reconstructed vector");
      assert(result.recallAt10 >= 0 && result.recallAt10 <= 1, "recall should be a fraction");
      assert(result.exactTopRankInApprox >= 1 && result.exactTopRankInApprox <= result.params.points, "exact top rank should be finite");
      assert(result.recon.relRmse >= 0 && result.recon.relRmse < 1.2, "relative RMSE should be finite and bounded");
      assert(result.tableWorkRatio > 0, "work ratio should be positive");
      checked += 14;
      maxIdentityError = Math.max(maxIdentityError, identityError);
      maxRelRmse = Math.max(maxRelRmse, result.recon.relRmse);
      minRecallAt10 = Math.min(minRecallAt10, result.recallAt10);
      maxExactTopRankInApprox = Math.max(maxExactTopRankInApprox, result.exactTopRankInApprox);
      return {
        identityError: identityError,
        params: result.params,
        recallAt10: result.recallAt10,
        relRmse: result.recon.relRmse
      };
    });

    var defaultResult = evaluate(DEFAULTS);
    var frontier = defaultResult.frontier.slice().sort(function (a, b) {
      if (a.m !== b.m) return a.m - b.m;
      return a.codewords - b.codewords;
    });
    var byM = {};
    frontier.forEach(function (point) {
      if (!byM[point.m]) byM[point.m] = [];
      byM[point.m].push(point);
      assert(point.recallAt10 >= 0 && point.recallAt10 <= 1, "frontier recall should be a fraction");
      assert(point.relRmse >= 0 && point.relRmse < 1.2, "frontier RMSE should be bounded");
      assert(near(point.compression, defaultResult.rawBytes / (point.m * Math.ceil(Math.log(point.codewords) / Math.log(2)) / 8), 1e-12), "frontier compression ledger");
      checked += 3;
    });
    Object.keys(byM).forEach(function (m) {
      var rows = byM[m];
      for (var i = 1; i < rows.length; i += 1) {
        assert(rows[i].compression < rows[i - 1].compression, "more codewords should spend more bytes at fixed subquantizer count");
        assert(rows[i].relRmse <= rows[i - 1].relRmse + 1e-9, "more codewords should not worsen deterministic frontier RMSE");
        checked += 2;
      }
    });

    return {
      checked: checked,
      frontier: {
        points: frontier.length,
        rawBytes: defaultResult.rawBytes
      },
      maxExactTopRankInApprox: maxExactTopRankInApprox,
      maxIdentityError: maxIdentityError,
      maxRelRmse: maxRelRmse,
      minRecallAt10: minRecallAt10,
      ok: true,
      reports: reports
    };
  }

  function canvasSize(canvas) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.width || 640));
    var ratio = Number(canvas.getAttribute("data-ratio")) || 0.52;
    var height = Math.max(220, Math.round(width * ratio));
    var dpr = global.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, height: height, width: width };
  }

  function drawText(ctx, text, x, y, size, color, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = "600 " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawMap(canvas, result) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);

    var pad = { bottom: 30, left: 34, right: 20, top: 24 };
    var xs = result.dataset.vectors.map(function (item) { return item.latent[0]; }).concat([result.dataset.queryLatent[0]]);
    var ys = result.dataset.vectors.map(function (item) { return item.latent[1]; }).concat([result.dataset.queryLatent[1]]);
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var dx = Math.max(maxX - minX, 1e-6);
    var dy = Math.max(maxY - minY, 1e-6);
    minX -= dx * 0.08;
    maxX += dx * 0.08;
    minY -= dy * 0.08;
    maxY += dy * 0.08;
    function sx(x) {
      return pad.left + (x - minX) / (maxX - minX) * (w - pad.left - pad.right);
    }
    function sy(y) {
      return h - pad.bottom - (y - minY) / (maxY - minY) * (h - pad.top - pad.bottom);
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= 4; gx += 1) {
      var x = pad.left + gx / 4 * (w - pad.left - pad.right);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
    }
    for (var gy = 0; gy <= 4; gy += 1) {
      var y = pad.top + gy / 4 * (h - pad.top - pad.bottom);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    var clusterColors = ["#2563eb", "#0f766e", "#d97706", "#7c3aed", "#be123c", "#0891b2", "#4d7c0f"];
    result.dataset.vectors.forEach(function (item) {
      ctx.fillStyle = clusterColors[item.cluster % clusterColors.length];
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(sx(item.latent[0]), sy(item.latent[1]), 3.1, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    var exactTop = {};
    result.exact.slice(0, TOP_K).forEach(function (item) { exactTop[item.index] = true; });
    var approxTop = {};
    result.approx.slice(0, TOP_K).forEach(function (item) { approxTop[item.index] = true; });
    result.dataset.vectors.forEach(function (item, index) {
      if (!exactTop[index] && !approxTop[index]) return;
      var x = sx(item.latent[0]);
      var y = sy(item.latent[1]);
      if (exactTop[index]) {
        ctx.strokeStyle = COLORS.green;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, 6.4, 0, 2 * Math.PI);
        ctx.stroke();
      }
      if (approxTop[index]) {
        ctx.strokeStyle = COLORS.amber;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.rect(x - 5.8, y - 5.8, 11.6, 11.6);
        ctx.stroke();
      }
    });

    var qx = sx(result.dataset.queryLatent[0]);
    var qy = sy(result.dataset.queryLatent[1]);
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.moveTo(qx, qy - 9);
    ctx.lineTo(qx + 8, qy);
    ctx.lineTo(qx, qy + 9);
    ctx.lineTo(qx - 8, qy);
    ctx.closePath();
    ctx.fill();
    drawText(ctx, "latent map: exact circles, PQ squares", 14, 14, 12, COLORS.muted);
  }

  function heatColor(t) {
    t = clamp(t, 0, 1);
    var r = Math.round(245 * (1 - t) + 37 * t);
    var g = Math.round(158 * (1 - t) + 99 * t);
    var b = Math.round(11 * (1 - t) + 235 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawTable(canvas, result) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var pad = { bottom: 34, left: 48, right: 18, top: 30 };
    var rows = result.table.length;
    var cols = result.table[0].length;
    var flat = [];
    result.table.forEach(function (row) {
      row.forEach(function (value) { flat.push(value); });
    });
    var min = Math.min.apply(null, flat);
    var max = Math.max.apply(null, flat);
    var cellW = (w - pad.left - pad.right) / cols;
    var cellH = (h - pad.top - pad.bottom) / rows;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var t = (result.table[r][c] - min) / Math.max(max - min, 1e-12);
        ctx.fillStyle = heatColor(1 - t);
        ctx.fillRect(pad.left + c * cellW, pad.top + r * cellH, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
      }
      drawText(ctx, "q" + (r + 1), pad.left - 10, pad.top + (r + 0.5) * cellH, 11, COLORS.muted, "right");
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(pad.left, pad.top, w - pad.left - pad.right, h - pad.top - pad.bottom);
    drawText(ctx, "ADC distance table: query slice to each codeword", 14, 15, 12, COLORS.muted);
    drawText(ctx, "codeword", pad.left + (w - pad.left - pad.right) / 2, h - 13, 11, COLORS.muted, "center");
  }

  function drawFrontier(canvas, result) {
    if (!canvas) return;
    var size = canvasSize(canvas);
    var ctx = size.ctx;
    var w = size.width;
    var h = size.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var pad = { bottom: 38, left: 45, right: 22, top: 28 };
    var points = result.frontier || [];
    var xs = points.map(function (p) { return p.compression; }).concat([result.compression]);
    var minX = Math.max(1, Math.min.apply(null, xs) * 0.82);
    var maxX = Math.max.apply(null, xs) * 1.12;
    function sx(x) {
      return pad.left + (x - minX) / Math.max(maxX - minX, 1e-9) * (w - pad.left - pad.right);
    }
    function sy(y) {
      return h - pad.bottom - y * (h - pad.top - pad.bottom);
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= 4; gx += 1) {
      var x = pad.left + gx / 4 * (w - pad.left - pad.right);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, h - pad.bottom);
      ctx.stroke();
    }
    for (var gy = 0; gy <= 4; gy += 1) {
      var y = pad.top + gy / 4 * (h - pad.top - pad.bottom);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      drawText(ctx, String(100 - gy * 25) + "%", pad.left - 8, y, 10, COLORS.muted, "right");
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();
    points.forEach(function (p) {
      var isCurrent = p.m === result.params.subquantizers && p.codewords === result.params.codewords;
      ctx.fillStyle = isCurrent ? COLORS.green : (p.m === 8 ? COLORS.purple : p.m === 4 ? COLORS.blue : COLORS.amber);
      ctx.globalAlpha = isCurrent ? 1 : 0.62;
      ctx.beginPath();
      ctx.arc(sx(p.compression), sy(p.recallAt10), isCurrent ? 6 : 4, 0, 2 * Math.PI);
      ctx.fill();
      if (isCurrent) drawText(ctx, "current", sx(p.compression) + 8, sy(p.recallAt10) - 8, 10, COLORS.green);
    });
    ctx.globalAlpha = 1;
    drawText(ctx, "recall/compression sweep", 14, 15, 12, COLORS.muted);
    drawText(ctx, "more compression", w - pad.right, h - 14, 11, COLORS.muted, "right");
  }

  function metric(label, value, tone) {
    return '<div class="pq-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function renderMetrics(root, result) {
    var el = root.querySelector("[data-role='metrics']");
    if (!el) return;
    var recallTone = result.recallAt10 >= 0.7 ? "pq-lab__metric--good" : result.recallAt10 >= 0.45 ? "pq-lab__metric--warn" : "pq-lab__metric--bad";
    el.innerHTML = [
      metric("Recall@10", formatPercent(result.recallAt10), recallTone),
      metric("Code payload", formatNumber(result.infoBytes, 1) + " B / vector", "pq-lab__metric--good"),
      metric("Compression", formatNumber(result.compression, 1) + "x", ""),
      metric("Exact #1 rank under PQ", fmtRank(result.exactTopRankInApprox), result.exactTopRankInApprox <= 10 ? "pq-lab__metric--good" : "pq-lab__metric--warn"),
      metric("Reconstruction RMSE", formatPercent(result.recon.relRmse), ""),
      metric("Distance work ratio", formatNumber(result.tableWorkRatio, 1) + "x fewer", "")
    ].join("");
  }

  function renderNotes(root, result) {
    var el = root.querySelector("[data-role='note']");
    if (!el) return;
    var identity = maxAbsAdcIdentity(result, 24);
    el.textContent = GEOMETRIES[result.params.geometry].note + " " +
      ROTATIONS[result.params.rotation].note + " The shared codebooks occupy about " +
      formatCompact(result.codebookBytes) + " bytes here; the per-vector payload is only " +
      formatNumber(result.infoBytes, 1) + " bytes. ADC identity check on 24 vectors: max error " +
      identity.toExponential(1) + ".";
  }

  function renderUsage(root, result) {
    var el = root.querySelector("[data-role='usage']");
    if (!el) return;
    var rows = result.usage.map(function (counts, s) {
      var max = Math.max.apply(null, counts);
      var cells = counts.map(function (count) {
        var h = max ? 8 + 28 * count / max : 8;
        return '<i style="height:' + h.toFixed(1) + 'px" title="' + count + ' vectors"></i>';
      }).join("");
      return '<div><span>slice ' + (s + 1) + '</span><b>' + cells + '</b></div>';
    }).join("");
    el.innerHTML = rows;
  }

  function updateOutputs(root, params) {
    Object.keys(params).forEach(function (key) {
      var output = root.querySelector("[data-value='" + key + "']");
      if (!output) return;
      if (key === "geometry") output.textContent = GEOMETRIES[params.geometry].label;
      else if (key === "rotation") output.textContent = ROTATIONS[params.rotation].label;
      else output.textContent = String(params[key]);
    });
  }

  function readParams(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(params);
  }

  function syncControls(root, params) {
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      if (params[key] != null && input.value !== String(params[key])) input.value = String(params[key]);
    });
  }

  function render(root) {
    var params = readParams(root);
    syncControls(root, params);
    updateOutputs(root, params);
    var result = evaluate(params);
    renderMetrics(root, result);
    renderNotes(root, result);
    renderUsage(root, result);
    drawMap(root.querySelector("[data-role='map']"), result);
    drawTable(root.querySelector("[data-role='table']"), result);
    drawFrontier(root.querySelector("[data-role='frontier']"), result);
    root.__pqResult = result;
  }

  function init(root) {
    if (!root || root.__pqLabReady) return;
    root.__pqLabReady = true;
    var schedule = function () {
      if (root.__pqFrame) global.cancelAnimationFrame(root.__pqFrame);
      root.__pqFrame = global.requestAnimationFrame(function () {
        root.__pqFrame = null;
        render(root);
      });
    };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    });
    global.addEventListener("resize", schedule);
    schedule();
  }

  function initAll() {
    if (!global.document) return;
    global.document.querySelectorAll("[data-product-quantization-lab]").forEach(init);
  }

  var api = {
    audit: audit,
    cleanParams: cleanParams,
    decodeRotated: decodeRotated,
    evaluate: evaluate,
    initAll: initAll
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ProductQuantizationLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
