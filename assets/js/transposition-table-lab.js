(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    tree: "#be123c",
    dag: "#0f766e",
    exact: "#2563eb",
    table: "#7c3aed",
    warn: "#b45309",
    bad: "#dc2626",
    white: "#ffffff"
  };

  var DEFAULTS = {
    piles: 5,
    stones: 4,
    depth: 10,
    ordering: "helpful",
    tableSize: 512,
    keyBits: 16,
    verify: "yes"
  };

  var ORDERINGS = ["helpful", "natural", "hostile"];
  var VERIFY = ["yes", "no"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function nearest(value, allowed, fallback) {
    value = String(value == null ? fallback : value);
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function numeric(raw, key) {
    var value = Number(raw && raw[key]);
    return Number.isFinite(value) ? value : DEFAULTS[key];
  }

  function cleanParams(raw) {
    var piles = Math.round(clamp(numeric(raw, "piles"), 3, 6));
    var stones = Math.round(clamp(numeric(raw, "stones"), 2, 6));
    var depth = Math.round(clamp(numeric(raw, "depth"), 4, Math.min(14, piles * stones)));
    var tableSize = Math.round(clamp(numeric(raw, "tableSize"), 64, 4096));
    tableSize = Math.pow(2, Math.round(Math.log(tableSize) / Math.log(2)));
    return {
      piles: piles,
      stones: stones,
      depth: depth,
      ordering: nearest(raw && raw.ordering, ORDERINGS, DEFAULTS.ordering),
      tableSize: tableSize,
      keyBits: Math.round(clamp(numeric(raw, "keyBits"), 8, 32)),
      verify: nearest(raw && raw.verify, VERIFY, DEFAULTS.verify)
    };
  }

  function hash32(a, b) {
    var x = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }

  function rootState(params) {
    var state = [];
    for (var i = 0; i < params.piles; i += 1) {
      state.push(params.stones);
    }
    return state;
  }

  function stateKey(state, side) {
    return state.join(".") + "|" + side;
  }

  function legalMoves(state) {
    var moves = [];
    for (var i = 0; i < state.length; i += 1) {
      if (state[i] > 0) moves.push(i);
    }
    return moves;
  }

  function applyMove(state, move) {
    var next = state.slice();
    next[move] -= 1;
    return next;
  }

  function sumState(state) {
    var sum = 0;
    for (var i = 0; i < state.length; i += 1) sum += state[i];
    return sum;
  }

  function rootEvaluation(state, params) {
    var total = sumState(state);
    var score = 0;
    for (var i = 0; i < state.length; i += 1) {
      var used = params.stones - state[i];
      var phase = (i + 1) * 1.73 + used * 0.91 + total * 0.37;
      score += Math.sin(phase) * (0.42 + 0.08 * i);
      score += Math.cos((state[i] + 1) * (i + 2) * 0.41) * 0.18;
      if (i > 0) score += 0.07 * (state[i - 1] - state[i]);
    }
    score += (total % 2 ? 0.18 : -0.10);
    return Math.tanh(score / Math.max(1.2, state.length * 0.45));
  }

  function moveScore(state, move, side, params) {
    var child = applyMove(state, move);
    return side * rootEvaluation(child, params) + (move + 1) * 0.0001;
  }

  function orderMoves(state, moves, side, params) {
    var out = moves.slice();
    if (params.ordering === "natural") return out;
    out.sort(function (a, b) {
      var diff = moveScore(state, b, side, params) - moveScore(state, a, side, params);
      if (Math.abs(diff) < 1e-12) return a - b;
      return params.ordering === "helpful" ? diff : -diff;
    });
    return out;
  }

  function makeZobrist(params) {
    var table = [];
    for (var i = 0; i < params.piles; i += 1) {
      var row = [];
      for (var v = 0; v <= params.stones; v += 1) {
        row.push(hash32((i + 1) * 1009 + v * 9176, 0x5a17c0de));
      }
      table.push(row);
    }
    return {
      max: hash32(0x41fa, 0x13579bdf),
      min: hash32(0x91bc, 0x2468ace0),
      table: table
    };
  }

  function zobristKey(state, side, z) {
    var h = side > 0 ? z.max : z.min;
    for (var i = 0; i < state.length; i += 1) {
      h = (h ^ z.table[i][state[i]]) >>> 0;
    }
    return h >>> 0;
  }

  function truncateKey(key, bits) {
    if (bits >= 32) return key >>> 0;
    return key % Math.pow(2, bits);
  }

  function makeStats() {
    return {
      nodes: 0,
      leaves: 0,
      cutoffs: 0,
      ttHits: 0,
      ttCuts: 0,
      ttStores: 0,
      ttMisses: 0,
      indexCollisions: 0,
      keyCollisions: 0,
      verificationRejects: 0,
      falseHits: 0,
      overwrites: 0,
      byPly: []
    };
  }

  function notePly(stats, ply, skey) {
    stats.byPly[ply] = stats.byPly[ply] || { visits: 0, unique: Object.create(null) };
    stats.byPly[ply].visits += 1;
    stats.byPly[ply].unique[skey] = true;
  }

  function nullTable() {
    return {
      size: 0,
      slots: [],
      lookup: function () { return null; },
      store: function () {}
    };
  }

  function mapTable(stats) {
    var map = Object.create(null);
    return {
      size: Infinity,
      slots: [],
      lookup: function (state, side, depth, alpha, beta) {
        var entry = map[stateKey(state, side)];
        if (!entry || entry.depth < depth) {
          stats.ttMisses += 1;
          return null;
        }
        stats.ttHits += 1;
        var a = alpha;
        var b = beta;
        if (entry.bound === "exact") return { value: entry.value, cutoff: true, move: entry.move };
        if (entry.bound === "lower") a = Math.max(a, entry.value);
        if (entry.bound === "upper") b = Math.min(b, entry.value);
        if (a >= b) {
          stats.ttCuts += 1;
          return { value: entry.value, cutoff: true, move: entry.move };
        }
        return { alpha: a, beta: b, move: entry.move };
      },
      store: function (state, side, depth, value, bound, move) {
        var key = stateKey(state, side);
        var old = map[key];
        if (!old || old.depth <= depth) {
          map[key] = { depth: depth, value: value, bound: bound, move: move };
          stats.ttStores += 1;
        }
      }
    };
  }

  function directTable(params, stats) {
    var z = makeZobrist(params);
    var slots = new Array(params.tableSize);
    var verify = params.verify === "yes";
    function slotFor(state, side) {
      var full = zobristKey(state, side, z);
      var key = truncateKey(full, params.keyBits);
      return {
        full: full,
        key: key,
        stateKey: stateKey(state, side),
        index: key % params.tableSize
      };
    }
    return {
      size: params.tableSize,
      slots: slots,
      lookup: function (state, side, depth, alpha, beta) {
        var s = slotFor(state, side);
        var entry = slots[s.index];
        if (!entry) {
          stats.ttMisses += 1;
          return null;
        }
        if (entry.key !== s.key) {
          stats.indexCollisions += 1;
          stats.ttMisses += 1;
          return null;
        }
        if (entry.stateKey !== s.stateKey) {
          stats.keyCollisions += 1;
          if (verify) {
            stats.verificationRejects += 1;
            stats.ttMisses += 1;
            return null;
          }
          stats.falseHits += 1;
        }
        if (entry.depth < depth) {
          stats.ttMisses += 1;
          return null;
        }
        stats.ttHits += 1;
        var a = alpha;
        var b = beta;
        if (entry.bound === "exact") return { value: entry.value, cutoff: true, move: entry.move };
        if (entry.bound === "lower") a = Math.max(a, entry.value);
        if (entry.bound === "upper") b = Math.min(b, entry.value);
        if (a >= b) {
          stats.ttCuts += 1;
          return { value: entry.value, cutoff: true, move: entry.move };
        }
        return { alpha: a, beta: b, move: entry.move };
      },
      store: function (state, side, depth, value, bound, move) {
        var s = slotFor(state, side);
        var old = slots[s.index];
        if (old && old.stateKey !== s.stateKey) {
          stats.overwrites += 1;
        }
        if (!old || old.depth <= depth || old.stateKey !== s.stateKey) {
          slots[s.index] = {
            key: s.key,
            full: s.full,
            stateKey: s.stateKey,
            depth: depth,
            value: value,
            bound: bound,
            move: move
          };
          stats.ttStores += 1;
        }
      }
    };
  }

  function alphaBeta(state, depth, alpha, beta, side, params, table, stats, ply) {
    var skey = stateKey(state, side);
    stats.nodes += 1;
    notePly(stats, ply, skey);

    var lookup = table.lookup(state, side, depth, alpha, beta);
    if (lookup) {
      if (lookup.cutoff) return lookup.value;
      if (lookup.alpha != null) alpha = lookup.alpha;
      if (lookup.beta != null) beta = lookup.beta;
    }

    var moves = legalMoves(state);
    if (depth <= 0 || moves.length === 0) {
      stats.leaves += 1;
      if (moves.length === 0) return -1;
      return side * rootEvaluation(state, params);
    }

    var alpha0 = alpha;
    var beta0 = beta;
    var best = -Infinity;
    var bestMove = null;
    var ordered = orderMoves(state, moves, side, params);

    if (lookup && lookup.move != null && ordered.indexOf(lookup.move) >= 0) {
      ordered = [lookup.move].concat(ordered.filter(function (m) { return m !== lookup.move; }));
    }

    for (var i = 0; i < ordered.length; i += 1) {
      var move = ordered[i];
      var child = applyMove(state, move);
      var value = -alphaBeta(child, depth - 1, -beta, -alpha, -side, params, table, stats, ply + 1);
      if (value > best) {
        best = value;
        bestMove = move;
      }
      if (value > alpha) alpha = value;
      if (alpha >= beta) {
        stats.cutoffs += 1;
        break;
      }
    }

    var bound = "exact";
    if (best <= alpha0) bound = "upper";
    else if (best >= beta0) bound = "lower";
    table.store(state, side, depth, best, bound, bestMove);
    return best;
  }

  function summarizeByPly(stats) {
    return stats.byPly.map(function (row, ply) {
      return {
        ply: ply,
        visits: row ? row.visits : 0,
        unique: row ? Object.keys(row.unique).length : 0
      };
    });
  }

  function makeTableForKind(params, kind, stats) {
    return kind === "map" ? mapTable(stats) : (kind === "direct" ? directTable(params, stats) : nullTable());
  }

  function computeRootMoveValues(params, kind) {
    var stats = makeStats();
    var table = makeTableForKind(params, kind, stats);
    var root = rootState(params);
    return legalMoves(root).map(function (move) {
      return {
        move: move,
        value: -alphaBeta(applyMove(root, move), params.depth - 1, -Infinity, Infinity, -1, params, table, stats, 1)
      };
    }).sort(function (a, b) {
      if (Math.abs(b.value - a.value) < 1e-12) return a.move - b.move;
      return b.value - a.value;
    });
  }

  function runSearch(params, kind) {
    var stats = makeStats();
    var table = makeTableForKind(params, kind, stats);
    var root = rootState(params);
    var value = alphaBeta(root, params.depth, -Infinity, Infinity, 1, params, table, stats, 0);
    var moveValues = kind === "none" ? [] : computeRootMoveValues(params, kind);
    return {
      kind: kind,
      value: value,
      bestMove: moveValues[0] ? moveValues[0].move : null,
      moveValues: moveValues,
      stats: stats,
      byPly: summarizeByPly(stats),
      slots: table.slots || []
    };
  }

  function frontierRows(params) {
    var current = Object.create(null);
    current[rootState(params).join(".")] = 1;
    var rows = [{ ply: 0, paths: 1, unique: 1 }];
    for (var d = 1; d <= params.depth; d += 1) {
      var next = Object.create(null);
      var paths = 0;
      Object.keys(current).forEach(function (key) {
        var count = current[key];
        var state = key.split(".").map(Number);
        legalMoves(state).forEach(function (move) {
          var child = applyMove(state, move).join(".");
          next[child] = (next[child] || 0) + count;
          paths += count;
        });
      });
      rows.push({ ply: d, paths: paths, unique: Object.keys(next).length });
      current = next;
      if (!Object.keys(current).length) break;
    }
    return rows;
  }

  function tableSummary(slots) {
    var occupied = 0;
    var depths = Object.create(null);
    for (var i = 0; i < slots.length; i += 1) {
      if (slots[i]) {
        occupied += 1;
        depths[slots[i].depth] = (depths[slots[i].depth] || 0) + 1;
      }
    }
    return { occupied: occupied, depths: depths };
  }

  function evaluate(raw) {
    var params = cleanParams(raw || {});
    var frontier = frontierRows(params);
    var noTable = runSearch(params, "none");
    var full = runSearch(params, "map");
    var limited = runSearch(params, "direct");
    var rootError = Math.abs(limited.value - full.value);
    var bestError = limited.bestMove !== full.bestMove;
    return {
      params: params,
      frontier: frontier,
      noTable: noTable,
      full: full,
      limited: limited,
      table: tableSummary(limited.slots),
      rootError: rootError,
      bestError: bestError
    };
  }

  function formatInt(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (value >= 1000000) return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1) + "M";
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "k";
    return String(Math.round(value));
  }

  function formatPct(value) {
    return (100 * value).toFixed(value >= 0.1 ? 0 : 1) + "%";
  }

  function formatValue(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(3);
  }

  function moveName(index) {
    return "pile " + String.fromCharCode(65 + index);
  }

  function metric(label, value, tone) {
    var klass = "transposition-lab__metric";
    if (tone) klass = "transposition-lab__metric--" + tone + " " + klass;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function setupCanvas(canvas, targetHeight) {
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 900));
    var height = targetHeight;
    var ratio = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);
    return { ctx: ctx, width: width, height: height };
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
    ctx.fillText(title, box.x + 13, box.y + 22);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.fillText(subtitle, box.x + 13, box.y + 39);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "left";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  function drawFrontier(ctx, result, box) {
    panel(ctx, box, "Tree paths versus positions", "move orders collapse into the same state");
    var plot = { x: box.x + 46, y: box.y + 55, w: box.w - 66, h: box.h - 88 };
    var max = result.frontier.reduce(function (m, row) {
      return Math.max(m, row.paths, row.unique);
    }, 1);
    var logMax = Math.log10(max + 1);
    var rows = result.frontier;
    var step = plot.w / Math.max(1, rows.length - 1);
    ctx.strokeStyle = COLORS.grid;
    for (var g = 0; g <= 3; g += 1) {
      var y = plot.y + plot.h - g * plot.h / 3;
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }
    function py(v) {
      return plot.y + plot.h - Math.log10(v + 1) / logMax * plot.h;
    }
    function pathFor(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      rows.forEach(function (row, i) {
        var x = plot.x + i * step;
        var y = py(row[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    pathFor("paths", COLORS.tree);
    pathFor("unique", COLORS.dag);
    label(ctx, "paths", plot.x + 4, py(rows[rows.length - 1].paths) - 6, "left", COLORS.tree, "700 11px system-ui, sans-serif");
    label(ctx, "positions", plot.x + 4, py(rows[rows.length - 1].unique) + 14, "left", COLORS.dag, "700 11px system-ui, sans-serif");
    label(ctx, "ply", plot.x + plot.w - 12, plot.y + plot.h + 24, "right");
    label(ctx, "log scale", plot.x - 34, plot.y + 4, "left");
  }

  function drawWork(ctx, result, box) {
    panel(ctx, box, "Search work", "same root, same depth, different memory");
    var rows = [
      { label: "alpha-beta", value: result.noTable.stats.nodes, color: COLORS.tree },
      { label: "full table", value: result.full.stats.nodes, color: COLORS.exact },
      { label: "limited table", value: result.limited.stats.nodes, color: COLORS.table }
    ];
    var max = rows.reduce(function (m, row) { return Math.max(m, row.value); }, 1);
    var left = box.x + 102;
    var top = box.y + 62;
    var barH = 24;
    rows.forEach(function (row, i) {
      var y = top + i * 48;
      label(ctx, row.label, box.x + 14, y + 16, "left", COLORS.text, "700 11px system-ui, sans-serif");
      ctx.fillStyle = row.color;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(left, y, Math.max(2, row.value / max * (box.w - 140)), barH);
      ctx.globalAlpha = 1;
      label(ctx, formatInt(row.value) + " nodes", left + Math.max(2, row.value / max * (box.w - 140)) + 6, y + 16);
    });
    var reuse = 1 - result.full.stats.nodes / Math.max(1, result.noTable.stats.nodes);
    label(ctx, "full-table reduction " + formatPct(Math.max(0, reuse)), box.x + 14, box.y + box.h - 18, "left", COLORS.dag);
  }

  function drawTable(ctx, result, box) {
    panel(ctx, box, "Direct-mapped table", "slots are memory, keys are trust");
    var slots = result.limited.slots;
    var cols = Math.min(32, Math.max(8, Math.floor((box.w - 28) / 10)));
    var cell = Math.min(10, (box.w - 28) / cols);
    var rows = Math.min(8, Math.ceil(slots.length / cols));
    var start = box.x + 14;
    var top = box.y + 58;
    for (var r = 0; r < rows; r += 1) {
      for (var c = 0; c < cols; c += 1) {
        var index = r * cols + c;
        var slotIndex = Math.floor(index / Math.max(1, rows * cols) * slots.length);
        var slot = slots[slotIndex];
        ctx.fillStyle = slot ? COLORS.table : COLORS.white;
        ctx.globalAlpha = slot ? 0.68 : 1;
        ctx.fillRect(start + c * cell, top + r * cell, cell - 1, cell - 1);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.rule;
        ctx.strokeRect(start + c * cell, top + r * cell, cell - 1, cell - 1);
      }
    }
    var s = result.limited.stats;
    var y = top + rows * cell + 28;
    label(ctx, "occupied " + formatInt(result.table.occupied) + " / " + formatInt(result.params.tableSize), start, y, "left", COLORS.table, "700 11px system-ui, sans-serif");
    label(ctx, "overwrites " + formatInt(s.overwrites), start, y + 18);
    label(ctx, "rejected collisions " + formatInt(s.verificationRejects), start, y + 36, "left", COLORS.warn);
    if (s.falseHits > 0) label(ctx, "unsafe false hits " + formatInt(s.falseHits), start, y + 54, "left", COLORS.bad, "700 11px system-ui, sans-serif");
    else label(ctx, "unsafe false hits 0", start, y + 54, "left", COLORS.dag);
  }

  function drawMoves(ctx, result, box) {
    panel(ctx, box, "Root move ledger", "cached value must still name the same position");
    var full = result.full.moveValues.slice().sort(function (a, b) { return a.move - b.move; });
    var limitedByMove = Object.create(null);
    result.limited.moveValues.forEach(function (row) { limitedByMove[row.move] = row.value; });
    var maxAbs = full.reduce(function (m, row) {
      return Math.max(m, Math.abs(row.value), Math.abs(limitedByMove[row.move] || 0));
    }, 0.1);
    var plot = { x: box.x + 42, y: box.y + 58, w: box.w - 62, h: box.h - 94 };
    var zero = plot.x + plot.w / 2;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(zero, plot.y - 6);
    ctx.lineTo(zero, plot.y + plot.h + 6);
    ctx.stroke();
    var rowH = plot.h / Math.max(1, full.length);
    full.forEach(function (row, i) {
      var y = plot.y + i * rowH + 6;
      var fv = row.value;
      var lv = limitedByMove[row.move] == null ? 0 : limitedByMove[row.move];
      function bar(v, yy, color) {
        var w = Math.abs(v) / maxAbs * (plot.w * 0.46);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.72;
        ctx.fillRect(v >= 0 ? zero : zero - w, yy, Math.max(2, w), Math.max(5, rowH * 0.28));
        ctx.globalAlpha = 1;
      }
      label(ctx, String.fromCharCode(65 + row.move), box.x + 16, y + 10, "left", COLORS.text, "700 12px system-ui, sans-serif");
      bar(fv, y, COLORS.exact);
      bar(lv, y + Math.max(8, rowH * 0.34), COLORS.table);
    });
    label(ctx, "full table", plot.x, box.y + box.h - 20, "left", COLORS.exact, "700 11px system-ui, sans-serif");
    label(ctx, "limited table", plot.x + 84, box.y + box.h - 20, "left", COLORS.table, "700 11px system-ui, sans-serif");
  }

  function drawCanvas(canvas, result) {
    var width = Math.round(canvas.getBoundingClientRect().width || canvas.width || 900);
    var compact = width < 700;
    var setup = setupCanvas(canvas, compact ? 980 : 700);
    var ctx = setup.ctx;
    if (compact) {
      drawFrontier(ctx, result, { x: 8, y: 8, w: setup.width - 16, h: 226 });
      drawWork(ctx, result, { x: 8, y: 246, w: setup.width - 16, h: 218 });
      drawTable(ctx, result, { x: 8, y: 476, w: setup.width - 16, h: 226 });
      drawMoves(ctx, result, { x: 8, y: 714, w: setup.width - 16, h: 258 });
    } else {
      var col = Math.round((setup.width - 28) / 2);
      drawFrontier(ctx, result, { x: 8, y: 8, w: col, h: 330 });
      drawWork(ctx, result, { x: col + 20, y: 8, w: setup.width - col - 28, h: 330 });
      drawTable(ctx, result, { x: 8, y: 354, w: col, h: 338 });
      drawMoves(ctx, result, { x: col + 20, y: 354, w: setup.width - col - 28, h: 338 });
    }
  }

  function renderMetrics(root, result) {
    var s = result.limited.stats;
    var hitRate = s.ttHits / Math.max(1, s.ttHits + s.ttMisses);
    var html = [
      metric("full table nodes", formatInt(result.full.stats.nodes)),
      metric("alpha-beta nodes", formatInt(result.noTable.stats.nodes)),
      metric("limited hit rate", formatPct(hitRate)),
      metric("hash overwrites", formatInt(s.overwrites), s.overwrites ? "warn" : ""),
      metric("false hits", formatInt(s.falseHits), s.falseHits ? "bad" : ""),
      metric("best move", moveName(result.limited.bestMove), result.bestError ? "bad" : "good")
    ].join("");
    var target = root.querySelector("[data-metrics]");
    if (target) target.innerHTML = html;
  }

  function updateOutputs(root, params) {
    var display = {
      piles: String(params.piles),
      stones: String(params.stones),
      depth: String(params.depth),
      tableSize: formatInt(params.tableSize),
      keyBits: String(params.keyBits)
    };
    root.querySelectorAll("[data-value]").forEach(function (output) {
      output.textContent = display[output.getAttribute("data-value")] || "";
    });
  }

  function parseParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      raw[key] = input.tagName === "SELECT" ? input.value : Number(input.value);
    });
    return raw;
  }

  function render(root) {
    var result = evaluate(parseParams(root));
    updateOutputs(root, result.params);
    renderMetrics(root, result);
    var canvas = root.querySelector("[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function initOne(root) {
    if (root.__transpositionLabReady) return;
    root.__transpositionLabReady = true;
    var schedule = null;
    function requestRender() {
      if (schedule && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(schedule);
      schedule = typeof global.requestAnimationFrame === "function"
        ? global.requestAnimationFrame(function () {
          schedule = null;
          render(root);
        })
        : global.setTimeout(function () {
          schedule = null;
          render(root);
        }, 16);
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    requestRender();
    global.addEventListener("resize", requestRender);
  }

  function init() {
    Array.prototype.slice.call(document.querySelectorAll("[data-transposition-lab]")).forEach(initOne);
  }

  var api = {
    alphaBeta: alphaBeta,
    cleanParams: cleanParams,
    evaluate: evaluate,
    frontierRows: frontierRows,
    rootEvaluation: rootEvaluation,
    zobristKey: zobristKey
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TranspositionTableLab = api;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
