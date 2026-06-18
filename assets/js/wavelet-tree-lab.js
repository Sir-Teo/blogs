(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    grid: "#edf2f7",
    panel: "#f8fafc",
    white: "#ffffff",
    zero: "#2563eb",
    one: "#b45309",
    focus: "#0f766e",
    purple: "#7c3aed",
    bad: "#be123c",
    good: "#15803d",
    range: "rgba(15, 118, 110, 0.13)",
    prefix: "rgba(37, 99, 235, 0.13)",
    selected: "rgba(180, 83, 9, 0.16)"
  };

  var SAMPLES = {
    genome: {
      label: "toy genome",
      sequence: "GATTACAGATTACAAGTCGATTA#",
      symbol: "A",
      position: 7,
      prefixEnd: 16,
      selectK: 5,
      rangeStart: 3,
      rangeEnd: 18,
      kth: 7
    },
    mississippi: {
      label: "mississippi",
      sequence: "mississippi#",
      symbol: "i",
      position: 4,
      prefixEnd: 8,
      selectK: 3,
      rangeStart: 1,
      rangeEnd: 10,
      kth: 5
    },
    abracadabra: {
      label: "abracadabra",
      sequence: "abracadabra#",
      symbol: "a",
      position: 5,
      prefixEnd: 9,
      selectK: 4,
      rangeStart: 2,
      rangeEnd: 11,
      kth: 4
    },
    prices: {
      label: "price codes",
      sequence: "64792935584176309258",
      symbol: "5",
      position: 11,
      prefixEnd: 14,
      selectK: 2,
      rangeStart: 4,
      rangeEnd: 17,
      kth: 6
    }
  };

  var DEFAULTS = {
    sample: "genome"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function ceilLog2(value) {
    return Math.max(1, Math.ceil(Math.log(Math.max(2, value)) / Math.log(2)));
  }

  function log2(value) {
    return Math.log(value) / Math.log(2);
  }

  function alphabetOf(sequence) {
    var seen = {};
    var alphabet = [];
    for (var i = 0; i < sequence.length; i += 1) {
      var symbol = sequence[i];
      if (!seen[symbol]) {
        seen[symbol] = true;
        alphabet.push(symbol);
      }
    }
    alphabet.sort();
    return alphabet;
  }

  function setOf(values) {
    var out = {};
    values.forEach(function (value) {
      out[value] = true;
    });
    return out;
  }

  function alphabetLabel(symbols) {
    if (!symbols.length) return "{}";
    if (symbols.length === 1) return symbols[0];
    return symbols[0] + ".." + symbols[symbols.length - 1];
  }

  function buildWavelet(sequence) {
    sequence = String(sequence || "");
    if (!sequence.length) sequence = "#";

    var alphabet = alphabetOf(sequence);
    var nodes = [];

    function buildNode(subsequence, symbols, depth, parent, side) {
      var node = {
        id: nodes.length,
        depth: depth,
        parent: parent,
        side: side,
        alphabet: symbols.slice(),
        alphabetSet: setOf(symbols),
        label: alphabetLabel(symbols),
        length: subsequence.length,
        bits: [],
        prefixOnes: [0],
        left: null,
        right: null,
        leaf: symbols.length === 1,
        symbol: symbols.length === 1 ? symbols[0] : null
      };
      nodes.push(node);

      if (!node.leaf) {
        var split = Math.ceil(symbols.length / 2);
        var leftSymbols = symbols.slice(0, split);
        var rightSymbols = symbols.slice(split);
        var leftSet = setOf(leftSymbols);
        var leftSequence = "";
        var rightSequence = "";
        var ones = 0;

        for (var i = 0; i < subsequence.length; i += 1) {
          var symbol = subsequence[i];
          var bit = leftSet[symbol] ? 0 : 1;
          node.bits.push(bit);
          if (bit) {
            ones += 1;
            rightSequence += symbol;
          } else {
            leftSequence += symbol;
          }
          node.prefixOnes.push(ones);
        }

        node.leftAlphabet = leftSymbols;
        node.rightAlphabet = rightSymbols;
        node.leftSet = leftSet;
        node.rightSet = setOf(rightSymbols);
        node.left = buildNode(leftSequence, leftSymbols, depth + 1, node.id, 0);
        node.right = buildNode(rightSequence, rightSymbols, depth + 1, node.id, 1);
      }

      return node;
    }

    var root = buildNode(sequence, alphabet, 0, -1, -1);
    return {
      sequence: sequence,
      alphabet: alphabet,
      root: root,
      nodes: nodes
    };
  }

  function rank1(node, pos) {
    pos = clamp(Math.round(pos), 0, node.bits.length);
    return node.prefixOnes[pos];
  }

  function rank0(node, pos) {
    pos = clamp(Math.round(pos), 0, node.bits.length);
    return pos - rank1(node, pos);
  }

  function rankSymbol(tree, symbol, pos) {
    pos = clamp(Math.round(pos), 0, tree.sequence.length);
    if (!tree.root.alphabetSet[symbol]) return { value: 0, steps: [] };

    var node = tree.root;
    var steps = [];

    while (!node.leaf) {
      var before = pos;
      var goLeft = !!node.leftSet[symbol];
      var zeroPrefix = rank0(node, pos);
      var onePrefix = rank1(node, pos);
      pos = goLeft ? zeroPrefix : onePrefix;
      steps.push({
        nodeId: node.id,
        alphabet: node.label,
        symbol: symbol,
        branch: goLeft ? 0 : 1,
        before: before,
        zeroPrefix: zeroPrefix,
        onePrefix: onePrefix,
        after: pos
      });
      node = goLeft ? node.left : node.right;
    }

    return { value: pos, steps: steps };
  }

  function accessSymbol(tree, pos) {
    pos = clamp(Math.round(pos), 0, tree.sequence.length - 1);
    var node = tree.root;
    var steps = [];

    while (!node.leaf) {
      var before = pos;
      var bit = node.bits[pos];
      var zeroPrefix = rank0(node, pos);
      var onePrefix = rank1(node, pos);
      pos = bit ? onePrefix : zeroPrefix;
      steps.push({
        nodeId: node.id,
        alphabet: node.label,
        bit: bit,
        before: before,
        zeroPrefix: zeroPrefix,
        onePrefix: onePrefix,
        after: pos
      });
      node = bit ? node.right : node.left;
    }

    return {
      symbol: node.symbol,
      steps: steps
    };
  }

  function selectBit(bits, bit, kth) {
    var seen = 0;
    for (var i = 0; i < bits.length; i += 1) {
      if (bits[i] === bit) {
        seen += 1;
        if (seen === kth) return i;
      }
    }
    return -1;
  }

  function selectSymbol(tree, symbol, kth) {
    var total = rankSymbol(tree, symbol, tree.sequence.length).value;
    kth = clamp(Math.round(kth), 1, Math.max(1, total));
    if (!total) return { position: -1, steps: [] };

    function descend(node, target, occurrence) {
      if (node.leaf) return { pos: occurrence - 1, steps: [] };

      var goLeft = !!node.leftSet[target];
      var child = descend(goLeft ? node.left : node.right, target, occurrence);
      var parentPos = selectBit(node.bits, goLeft ? 0 : 1, child.pos + 1);
      child.steps.unshift({
        nodeId: node.id,
        alphabet: node.label,
        branch: goLeft ? 0 : 1,
        childPos: child.pos,
        parentPos: parentPos
      });
      child.pos = parentPos;
      return child;
    }

    var result = descend(tree.root, symbol, kth);
    return {
      position: result.pos,
      steps: result.steps
    };
  }

  function rangeQuantile(tree, left, right, kth) {
    var n = tree.sequence.length;
    left = clamp(Math.round(left), 0, Math.max(0, n - 1));
    right = clamp(Math.round(right), left + 1, n);
    kth = clamp(Math.round(kth), 1, right - left);

    var node = tree.root;
    var steps = [];
    var l = left;
    var r = right;
    var k = kth;

    while (!node.leaf) {
      var zerosL = rank0(node, l);
      var zerosR = rank0(node, r);
      var onesL = rank1(node, l);
      var onesR = rank1(node, r);
      var zeroCount = zerosR - zerosL;
      var oneCount = onesR - onesL;
      var goLeft = k <= zeroCount;
      var nextL = goLeft ? zerosL : onesL;
      var nextR = goLeft ? zerosR : onesR;
      var nextK = goLeft ? k : k - zeroCount;

      steps.push({
        nodeId: node.id,
        alphabet: node.label,
        left: l,
        right: r,
        kth: k,
        zeroCount: zeroCount,
        oneCount: oneCount,
        branch: goLeft ? 0 : 1,
        nextLeft: nextL,
        nextRight: nextR,
        nextK: nextK
      });

      l = nextL;
      r = nextR;
      k = nextK;
      node = goLeft ? node.left : node.right;
    }

    return {
      symbol: node.symbol,
      steps: steps,
      leafId: node.id
    };
  }

  function countSymbols(sequence) {
    var counts = {};
    for (var i = 0; i < sequence.length; i += 1) {
      counts[sequence[i]] = (counts[sequence[i]] || 0) + 1;
    }
    return counts;
  }

  function entropyFromCounts(counts) {
    var total = 0;
    Object.keys(counts).forEach(function (key) {
      total += counts[key];
    });
    if (!total) return 0;
    var bits = 0;
    Object.keys(counts).forEach(function (key) {
      var count = counts[key];
      if (count > 0) bits += count * log2(total / count);
    });
    return bits;
  }

  function bitmapEntropyBits(node) {
    if (node.leaf) return 0;
    var zeros = rank0(node, node.bits.length);
    var ones = rank1(node, node.bits.length);
    return entropyFromCounts({ zero: zeros, one: ones }) +
      bitmapEntropyBits(node.left) +
      bitmapEntropyBits(node.right);
  }

  function waveletBitCount(node) {
    if (node.leaf) return 0;
    return node.bits.length + waveletBitCount(node.left) + waveletBitCount(node.right);
  }

  function maxDepth(node) {
    if (node.leaf) return node.depth;
    return Math.max(maxDepth(node.left), maxDepth(node.right));
  }

  function naiveRank(sequence, symbol, pos) {
    var count = 0;
    for (var i = 0; i < pos; i += 1) {
      if (sequence[i] === symbol) count += 1;
    }
    return count;
  }

  function naiveSelect(sequence, symbol, kth) {
    var seen = 0;
    for (var i = 0; i < sequence.length; i += 1) {
      if (sequence[i] === symbol) {
        seen += 1;
        if (seen === kth) return i;
      }
    }
    return -1;
  }

  function naiveQuantile(sequence, left, right, kth) {
    return sequence.slice(left, right).split("").sort()[kth - 1];
  }

  function normalize(raw) {
    raw = raw || {};
    var sample = String(raw.sample || DEFAULTS.sample);
    if (!SAMPLES[sample]) sample = DEFAULTS.sample;

    var preset = SAMPLES[sample];
    var sequence = preset.sequence;
    var alphabet = alphabetOf(sequence);
    var symbol = raw.symbol == null ? String(preset.symbol || alphabet[0]) : String(raw.symbol);
    if (alphabet.indexOf(symbol) === -1) {
      symbol = alphabet.indexOf(preset.symbol) === -1 ? alphabet[0] : preset.symbol;
    }

    var count = naiveRank(sequence, symbol, sequence.length);
    var rangeStart = Math.round(clamp(finite(Number(raw.rangeStart), preset.rangeStart), 0, Math.max(0, sequence.length - 1)));
    var rangeEnd = Math.round(clamp(finite(Number(raw.rangeEnd), preset.rangeEnd), rangeStart + 1, sequence.length));
    var rangeLength = rangeEnd - rangeStart;

    return {
      sample: sample,
      sequence: sequence,
      symbol: symbol,
      position: Math.round(clamp(finite(Number(raw.position), preset.position), 0, sequence.length - 1)),
      prefixEnd: Math.round(clamp(finite(Number(raw.prefixEnd), preset.prefixEnd), 0, sequence.length)),
      selectK: Math.round(clamp(finite(Number(raw.selectK), preset.selectK), 1, Math.max(1, count))),
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      kth: Math.round(clamp(finite(Number(raw.kth), preset.kth), 1, Math.max(1, rangeLength)))
    };
  }

  function audit(result) {
    var checks = [];
    function check(name, ok) {
      checks.push({ name: name, ok: !!ok });
    }

    var tree = result.tree;
    var sequence = tree.sequence;
    var alphabet = tree.alphabet;

    check("access agrees with the original sequence", sequence.split("").every(function (symbol, pos) {
      return accessSymbol(tree, pos).symbol === symbol;
    }));

    check("rank agrees with naive prefix counts", alphabet.every(function (symbol) {
      for (var pos = 0; pos <= sequence.length; pos += 1) {
        if (rankSymbol(tree, symbol, pos).value !== naiveRank(sequence, symbol, pos)) return false;
      }
      return true;
    }));

    check("select agrees with naive occurrence positions", alphabet.every(function (symbol) {
      var count = naiveRank(sequence, symbol, sequence.length);
      for (var kth = 1; kth <= count; kth += 1) {
        if (selectSymbol(tree, symbol, kth).position !== naiveSelect(sequence, symbol, kth)) return false;
      }
      return true;
    }));

    check("range quantile agrees with sorting every slice", (function () {
      for (var left = 0; left < sequence.length; left += 1) {
        for (var right = left + 1; right <= sequence.length; right += 1) {
          for (var kth = 1; kth <= right - left; kth += 1) {
            if (rangeQuantile(tree, left, right, kth).symbol !== naiveQuantile(sequence, left, right, kth)) return false;
          }
        }
      }
      return true;
    }()));

    check("internal bitmaps preserve stable partition lengths", tree.nodes.every(function (node) {
      if (node.leaf) return true;
      return rank0(node, node.bits.length) === node.left.length &&
        rank1(node, node.bits.length) === node.right.length &&
        node.length === node.left.length + node.right.length;
    }));

    check("raw bitmap budget is bounded by fixed-width storage", result.stats.waveletBits <= result.stats.fixedBits);
    check("compressed bitmap entropy sums to sequence H0", Math.abs(result.stats.bitmapEntropyBits - result.stats.entropyBits) < 1e-9);

    return {
      passed: checks.every(function (row) { return row.ok; }),
      checks: checks
    };
  }

  function evaluate(raw) {
    var params = normalize(raw);
    var tree = buildWavelet(params.sequence);
    var symbolCount = naiveRank(params.sequence, params.symbol, params.sequence.length);
    params.selectK = clamp(params.selectK, 1, Math.max(1, symbolCount));

    var access = accessSymbol(tree, params.position);
    var rank = rankSymbol(tree, params.symbol, params.prefixEnd);
    var select = selectSymbol(tree, params.symbol, params.selectK);
    var quantile = rangeQuantile(tree, params.rangeStart, params.rangeEnd, params.kth);
    var fixedBits = tree.sequence.length * ceilLog2(tree.alphabet.length);
    var waveletBits = waveletBitCount(tree.root);
    var entropyBits = entropyFromCounts(countSymbols(tree.sequence));
    var bitmapEntropy = bitmapEntropyBits(tree.root);

    var result = {
      params: params,
      tree: tree,
      queries: {
        access: access,
        rank: rank,
        select: select,
        quantile: quantile,
        symbolCount: symbolCount,
        rangeLength: params.rangeEnd - params.rangeStart
      },
      stats: {
        length: tree.sequence.length,
        alphabet: tree.alphabet.length,
        fixedBits: fixedBits,
        waveletBits: waveletBits,
        entropyBits: entropyBits,
        bitmapEntropyBits: bitmapEntropy,
        maxDepth: maxDepth(tree.root),
        nodeCount: tree.nodes.length
      }
    };
    result.audit = audit(result);
    return result;
  }

  function auditWaveletTreeLab() {
    var rows = [];
    Object.keys(SAMPLES).forEach(function (sample) {
      var base = evaluate({ sample: sample });
      rows.push({
        sample: sample,
        ok: base.audit.passed,
        length: base.stats.length,
        alphabet: base.stats.alphabet,
        waveletBits: base.stats.waveletBits,
        entropyBits: Number(base.stats.entropyBits.toFixed(6))
      });
      base.tree.alphabet.forEach(function (symbol) {
        rows.push({
          sample: sample,
          symbol: symbol,
          ok: evaluate({
            sample: sample,
            symbol: symbol,
            prefixEnd: base.stats.length,
            selectK: 1,
            rangeStart: 0,
            rangeEnd: base.stats.length,
            kth: Math.ceil(base.stats.length / 2)
          }).audit.passed
        });
      });
    });
    return rows;
  }

  function fmt(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits == null ? 2 : digits) : "n/a";
  }

  function metric(label, value, className) {
    return '<div class="wavelet-tree-lab__metric ' + (className || "") + '"><span>' +
      label + "</span><strong>" + value + "</strong></div>";
  }

  function text(ctx, value, x, y, options) {
    options = options || {};
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = (options.weight || 650) + " " + (options.size || 11) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(value, x, y);
  }

  function fitText(ctx, value, x, y, maxWidth, size, color, weight) {
    value = String(value);
    size = size || 11;
    ctx.font = (weight || 650) + " " + size + "px system-ui, -apple-system, Segoe UI, sans-serif";
    while (ctx.measureText(value).width > maxWidth && value.length > 3) {
      value = value.slice(0, -2) + ".";
    }
    text(ctx, value, x, y, { size: size, color: color, weight: weight });
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    roundedRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    text(ctx, title, box.x + 14, box.y + 19, { size: 12, weight: 820 });
    if (subtitle) text(ctx, subtitle, box.x + 14, box.y + 39, { size: 10, color: COLORS.muted, weight: 650 });
  }

  function layoutWavelet(tree) {
    var leaves = [];
    function collect(node) {
      if (node.leaf) leaves.push(node);
      else {
        collect(node.left);
        collect(node.right);
      }
    }
    collect(tree.root);

    var leafX = {};
    leaves.forEach(function (leaf, index) {
      leafX[leaf.id] = leaves.length <= 1 ? 0.5 : (index + 0.5) / leaves.length;
    });

    var positions = [];
    function place(node) {
      if (node.leaf) {
        positions[node.id] = { x: leafX[node.id], y: node.depth };
        return positions[node.id].x;
      }
      var lx = place(node.left);
      var rx = place(node.right);
      positions[node.id] = { x: (lx + rx) / 2, y: node.depth };
      return positions[node.id].x;
    }
    place(tree.root);

    var depth = maxDepth(tree.root);
    positions.forEach(function (pos) {
      pos.y = depth === 0 ? 0.5 : pos.y / depth;
    });

    return { positions: positions, leaves: leaves.length, depth: depth };
  }

  function queryNodeSet(result) {
    var set = {};
    result.queries.quantile.steps.forEach(function (step) {
      set[step.nodeId] = COLORS.focus;
    });
    result.queries.rank.steps.forEach(function (step) {
      if (!set[step.nodeId]) set[step.nodeId] = COLORS.purple;
    });
    set[result.queries.quantile.leafId] = COLORS.focus;
    return set;
  }

  function drawTree(ctx, result, box) {
    panel(ctx, box, "alphabet decision tree", "each internal node stores one stable-partition bitmap");
    var plot = { x: box.x + 30, y: box.y + 66, w: box.w - 60, h: box.h - 98 };
    var layout = layoutWavelet(result.tree);
    var marked = queryNodeSet(result);

    result.tree.nodes.forEach(function (node) {
      if (node.leaf) return;
      [node.left, node.right].forEach(function (child) {
        var a = layout.positions[node.id];
        var b = layout.positions[child.id];
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(plot.x + a.x * plot.w, plot.y + a.y * plot.h);
        ctx.lineTo(plot.x + b.x * plot.w, plot.y + b.y * plot.h);
        ctx.stroke();
      });
    });

    result.tree.nodes.forEach(function (node) {
      var pos = layout.positions[node.id];
      var x = plot.x + pos.x * plot.w;
      var y = plot.y + pos.y * plot.h;
      var color = marked[node.id];
      ctx.fillStyle = color || COLORS.white;
      ctx.strokeStyle = color || COLORS.rule;
      ctx.lineWidth = color ? 2.4 : 1.2;
      roundedRect(ctx, x - 30, y - 16, 60, 32, 8);
      ctx.fill();
      ctx.stroke();
      fitText(ctx, node.label, x - 22, y - 4, 44, 10, color ? COLORS.white : COLORS.text, 850);
      text(ctx, String(node.length), x, y + 10, { align: "center", size: 9, color: color ? COLORS.white : COLORS.muted, weight: 750 });
    });

    text(ctx, "green = range quantile path, violet = rank path", plot.x, box.y + box.h - 18, { color: COLORS.muted, size: 10 });
  }

  function drawBitmaps(ctx, result, box) {
    panel(ctx, box, "stored bitmaps", "0 goes left, 1 goes right; leaves store no bitmap");
    var x = box.x + 18;
    var y = box.y + 64;
    var rowH = 34;
    var rows = result.tree.nodes.filter(function (node) { return !node.leaf; }).slice(0, 6);
    rows.forEach(function (node, row) {
      var yy = y + row * rowH;
      fitText(ctx, node.label, x, yy + 12, 58, 10, COLORS.text, 800);
      var maxCells = Math.min(node.bits.length, 26);
      var cellW = Math.min(13, (box.w - 98) / Math.max(1, maxCells));
      for (var i = 0; i < maxCells; i += 1) {
        var bit = node.bits[i];
        ctx.fillStyle = bit ? COLORS.one : COLORS.zero;
        ctx.fillRect(x + 72 + i * (cellW + 1), yy, cellW, 20);
      }
      if (node.bits.length > maxCells) {
        text(ctx, "+" + (node.bits.length - maxCells), box.x + box.w - 34, yy + 10, { color: COLORS.muted, size: 9, align: "right" });
      }
      text(ctx, "len " + node.bits.length, x + 72, yy + 28, { color: COLORS.muted, size: 8 });
    });
    text(ctx, "blue cells count rank0, amber cells count rank1", x, box.y + box.h - 18, { color: COLORS.muted, size: 10 });
  }

  function drawSequence(ctx, result, box) {
    panel(ctx, box, "sequence queries", "prefix rank, point access, and range selection share the same tree");
    var sequence = result.tree.sequence;
    var x = box.x + 18;
    var y = box.y + 70;
    var cols = Math.min(sequence.length, 26);
    var cellW = Math.min(24, (box.w - 36) / cols - 1);
    var cellH = 28;
    for (var i = 0; i < sequence.length; i += 1) {
      var xx = x + (i % cols) * (cellW + 2);
      var yy = y + Math.floor(i / cols) * 46;
      var inPrefix = i < result.params.prefixEnd;
      var inRange = i >= result.params.rangeStart && i < result.params.rangeEnd;
      var isAccess = i === result.params.position;
      ctx.fillStyle = isAccess ? COLORS.selected : inRange ? COLORS.range : inPrefix ? COLORS.prefix : COLORS.white;
      ctx.strokeStyle = isAccess ? COLORS.one : inRange ? COLORS.focus : COLORS.rule;
      ctx.lineWidth = isAccess || inRange ? 1.6 : 1;
      roundedRect(ctx, xx, yy, cellW, cellH, 5);
      ctx.fill();
      ctx.stroke();
      text(ctx, sequence[i], xx + cellW / 2, yy + 10, { align: "center", size: 12, weight: 850 });
      text(ctx, String(i), xx + cellW / 2, yy + 32, { align: "center", size: 8, color: COLORS.muted });
    }

    var rows = [
      ["access(" + result.params.position + ")", result.queries.access.symbol],
      ["rank(" + result.params.symbol + ", " + result.params.prefixEnd + ")", String(result.queries.rank.value)],
      ["select(" + result.params.symbol + ", " + result.params.selectK + ")", String(result.queries.select.position)],
      ["quantile range", "[" + result.params.rangeStart + ", " + result.params.rangeEnd + ") kth " + result.params.kth + " -> " + result.queries.quantile.symbol]
    ];
    rows.forEach(function (row, index) {
      var yy = box.y + box.h - 86 + index * 20;
      text(ctx, row[0], x, yy, { color: COLORS.muted, size: 10, weight: 720 });
      text(ctx, row[1], box.x + box.w - 18, yy, { align: "right", size: 11, weight: 850 });
    });
  }

  function drawRankLedger(ctx, result, box) {
    panel(ctx, box, "rank and select ledger", "rank goes down; select comes back up through select0/select1");
    var rows = result.queries.rank.steps.slice(0, 5).map(function (step) {
      return [
        "#" + step.nodeId + " " + step.alphabet,
        "bit " + step.branch,
        step.before + " -> " + step.after
      ];
    });
    if (!rows.length) rows.push(["leaf", "done", String(result.queries.rank.value)]);
    rows.forEach(function (row, index) {
      var y = box.y + 72 + index * 30;
      text(ctx, row[0], box.x + 18, y, { size: 10, weight: 800 });
      text(ctx, row[1], box.x + box.w - 120, y, { size: 10, color: row[1] === "bit 0" ? COLORS.zero : COLORS.one, weight: 800 });
      text(ctx, row[2], box.x + box.w - 18, y, { align: "right", size: 10, weight: 800 });
    });

    var selectRows = result.queries.select.steps.slice(-4);
    text(ctx, "select unwind", box.x + 18, box.y + box.h - 92, { color: COLORS.muted, size: 10, weight: 820 });
    selectRows.forEach(function (row, index) {
      var y = box.y + box.h - 68 + index * 20;
      text(ctx, "#" + row.nodeId + " select" + row.branch, box.x + 18, y, { size: 9, color: COLORS.muted, weight: 750 });
      text(ctx, row.childPos + " -> " + row.parentPos, box.x + box.w - 18, y, { align: "right", size: 9, weight: 820 });
    });
  }

  function drawQuantile(ctx, result, box) {
    panel(ctx, box, "range quantile descent", "count zeros inside the active range before deciding which half owns kth");
    var headers = ["node", "range", "k", "zeros", "ones", "branch", "next"];
    var widths = [105, 118, 50, 72, 72, 70, 125];
    var x = box.x + 18;
    var y = box.y + 68;
    var cx = x;
    headers.forEach(function (header, index) {
      text(ctx, header, cx, y, { color: COLORS.muted, size: 9, weight: 820 });
      cx += widths[index];
    });
    result.queries.quantile.steps.slice(0, 5).forEach(function (step, row) {
      var yy = y + 28 + row * 28;
      var values = [
        "#" + step.nodeId + " " + step.alphabet,
        "[" + step.left + ", " + step.right + ")",
        String(step.kth),
        String(step.zeroCount),
        String(step.oneCount),
        "bit " + step.branch,
        "[" + step.nextLeft + ", " + step.nextRight + "), " + step.nextK
      ];
      cx = x;
      values.forEach(function (value, index) {
        var color = index === 5 ? (step.branch ? COLORS.one : COLORS.zero) : COLORS.text;
        fitText(ctx, value, cx, yy, widths[index] - 8, 10, color, index === 5 ? 850 : 720);
        cx += widths[index];
      });
    });
    text(ctx, "answer: " + result.queries.quantile.symbol, box.x + box.w - 20, box.y + box.h - 20, { align: "right", color: COLORS.focus, size: 13, weight: 900 });
  }

  function drawCanvas(canvas, result) {
    var width = 980;
    var height = 770;
    var dpr = global.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, width, height);

    drawTree(ctx, result, { x: 14, y: 14, w: 468, h: 252 });
    drawBitmaps(ctx, result, { x: 498, y: 14, w: 468, h: 252 });
    drawSequence(ctx, result, { x: 14, y: 286, w: 468, h: 230 });
    drawRankLedger(ctx, result, { x: 498, y: 286, w: 468, h: 230 });
    drawQuantile(ctx, result, { x: 14, y: 536, w: 952, h: 218 });
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (control) {
      raw[control.getAttribute("data-param")] = control.value;
    });
    return raw;
  }

  function setOutput(root, key, value) {
    var node = root.querySelector('[data-value="' + key + '"]');
    if (node) node.textContent = value;
  }

  function syncSymbolOptions(root, result) {
    var select = root.querySelector('[data-param="symbol"]');
    if (!select) return;
    var existing = Array.prototype.map.call(select.options, function (option) { return option.value; }).join("");
    var wanted = result.tree.alphabet.join("");
    if (existing !== wanted) {
      select.innerHTML = "";
      result.tree.alphabet.forEach(function (symbol) {
        var option = document.createElement("option");
        option.value = symbol;
        option.textContent = symbol;
        select.appendChild(option);
      });
    }
    select.value = result.params.symbol;
  }

  function syncControls(root, result) {
    syncSymbolOptions(root, result);
    var n = result.stats.length;
    var count = Math.max(1, result.queries.symbolCount);
    var rangeLength = Math.max(1, result.params.rangeEnd - result.params.rangeStart);
    var limits = {
      position: [0, n - 1],
      prefixEnd: [0, n],
      selectK: [1, count],
      rangeStart: [0, n - 1],
      rangeEnd: [1, n],
      kth: [1, rangeLength]
    };

    root.querySelectorAll("[data-param]").forEach(function (control) {
      var key = control.getAttribute("data-param");
      if (limits[key]) {
        control.min = limits[key][0];
        control.max = limits[key][1];
      }
      if (result.params[key] != null) control.value = result.params[key];
    });

    setOutput(root, "sample", SAMPLES[result.params.sample].label);
    setOutput(root, "symbol", result.params.symbol + " (" + result.queries.symbolCount + " total)");
    setOutput(root, "position", result.params.position + " -> " + result.queries.access.symbol);
    setOutput(root, "prefixEnd", result.params.prefixEnd + " chars");
    setOutput(root, "selectK", result.params.selectK + " -> pos " + result.queries.select.position);
    setOutput(root, "rangeStart", String(result.params.rangeStart));
    setOutput(root, "rangeEnd", String(result.params.rangeEnd));
    setOutput(root, "kth", result.params.kth + " -> " + result.queries.quantile.symbol);
  }

  function render(root) {
    var result = evaluate(readParams(root));
    syncControls(root, result);

    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("n / alphabet", result.stats.length + " / " + result.stats.alphabet),
        metric("raw bitmaps", result.stats.waveletBits + " bits"),
        metric("fixed width", result.stats.fixedBits + " bits"),
        metric("H0 ledger", fmt(result.stats.bitmapEntropyBits, 2) + " bits"),
        metric("range answer", result.queries.quantile.symbol),
        metric("audit", result.audit.passed ? "passed" : "failed", result.audit.passed ? "wavelet-tree-lab__metric--good" : "wavelet-tree-lab__metric--bad")
      ].join("");
    }

    var note = root.querySelector("[data-note]");
    if (note) {
      note.textContent = "Bitmap entropy " + fmt(result.stats.bitmapEntropyBits, 3) +
        " equals sequence H0 " + fmt(result.stats.entropyBits, 3) +
        " for this static sequence; the lab uses prefix arrays, not compressed RRR bitvectors.";
    }

    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawCanvas(canvas, result);
  }

  function init(root) {
    if (!root || root.__waveletTreeLabReady) return;
    root.__waveletTreeLabReady = true;
    root.querySelectorAll("[data-param]").forEach(function (control) {
      control.addEventListener("input", function () { render(root); });
      control.addEventListener("change", function () { render(root); });
    });
    render(root);
  }

  function initAll() {
    if (!global.document) return;
    document.querySelectorAll("[data-wavelet-tree-lab]").forEach(init);
  }

  var api = {
    accessSymbol: accessSymbol,
    auditWaveletTreeLab: auditWaveletTreeLab,
    buildWavelet: buildWavelet,
    evaluate: evaluate,
    rangeQuantile: rangeQuantile,
    rankSymbol: rankSymbol,
    selectSymbol: selectSymbol
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.WaveletTreeLab = api;

  if (global.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
