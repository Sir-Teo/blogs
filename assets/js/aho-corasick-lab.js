(function (global) {
  "use strict";

  var COLORS = {
    ac: "#0f766e",
    axis: "#d7dee5",
    blue: "#2563eb",
    fail: "#be123c",
    fill: "#f8fafc",
    gold: "#d97706",
    grid: "#edf2f7",
    ink: "#172026",
    match: "#7c3aed",
    muted: "#5d6872",
    softAc: "rgba(15, 118, 110, 0.12)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softFail: "rgba(190, 18, 60, 0.11)",
    softGold: "rgba(217, 119, 6, 0.13)",
    softMatch: "rgba(124, 58, 237, 0.13)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    dictionary: "classic",
    length: 120,
    overlap: 55,
    seed: 17
  };

  var DICTIONARIES = {
    classic: {
      alphabet: "ahersi",
      label: "classic overlaps",
      patterns: ["he", "she", "his", "hers"],
      seeds: ["ushers", "shershe", "ahishers", "shehis"]
    },
    logs: {
      alphabet: "abcdefghijklmnopqrstuvwxyz",
      label: "log alarms",
      patterns: ["error", "timeout", "retry", "panic", "oom", "reset", "deadline", "refused"],
      seeds: ["worker timeout retry", "panic reset error", "deadline refused", "oom error retry"]
    },
    dna: {
      alphabet: "ACGT",
      label: "dna motifs",
      patterns: ["ATG", "TATA", "GATA", "GAT", "CGCG", "ACGT", "GTAC"],
      seeds: ["ATGACGT", "GATATA", "CGCGTAC", "GATGATA"]
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
    return {
      dictionary: DICTIONARIES[raw.dictionary] ? raw.dictionary : DEFAULTS.dictionary,
      length: snap(raw.length, DEFAULTS.length, 48, 240, 4),
      overlap: snap(raw.overlap, DEFAULTS.overlap, 0, 100, 1),
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1)
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

  function pick(rand, items) {
    return items[Math.floor(rand() * items.length) % items.length];
  }

  function randomChar(rand, alphabet) {
    return alphabet[Math.floor(rand() * alphabet.length) % alphabet.length];
  }

  function generateText(dict, params) {
    var rand = rng(params.seed * 131 + params.length * 17 + params.overlap);
    var out = "";
    var target = params.length;
    var injectionRate = 0.08 + 0.34 * params.overlap / 100;
    while (out.length < target) {
      if (rand() < injectionRate) {
        var seed = pick(rand, dict.seeds);
        if (params.overlap > 50 && out.length && rand() < 0.7) {
          var maxOverlap = Math.min(out.length, seed.length - 1);
          var used = 0;
          for (var k = maxOverlap; k >= 1; k -= 1) {
            if (out.slice(out.length - k) === seed.slice(0, k)) {
              used = k;
              break;
            }
          }
          out += seed.slice(used);
        } else {
          out += seed;
        }
      } else {
        out += randomChar(rand, dict.alphabet);
      }
      if (dict === DICTIONARIES.logs && rand() < 0.13) out += " ";
    }
    return out.slice(0, target);
  }

  function makeNode(parent, char, depth) {
    return { char: char, depth: depth, fail: 0, id: 0, next: {}, out: [], parent: parent };
  }

  function buildAutomaton(patterns) {
    var nodes = [makeNode(-1, "", 0)];
    nodes[0].id = 0;
    patterns.forEach(function (pattern, pid) {
      var state = 0;
      for (var i = 0; i < pattern.length; i += 1) {
        var ch = pattern[i];
        if (nodes[state].next[ch] == null) {
          var node = makeNode(state, ch, nodes[state].depth + 1);
          node.id = nodes.length;
          nodes[state].next[ch] = node.id;
          nodes.push(node);
        }
        state = nodes[state].next[ch];
      }
      nodes[state].out.push({ id: pid, pattern: pattern });
    });

    var queue = [];
    Object.keys(nodes[0].next).forEach(function (ch) {
      var child = nodes[0].next[ch];
      nodes[child].fail = 0;
      queue.push(child);
    });
    for (var q = 0; q < queue.length; q += 1) {
      var r = queue[q];
      Object.keys(nodes[r].next).forEach(function (ch) {
        var u = nodes[r].next[ch];
        queue.push(u);
        var v = nodes[r].fail;
        while (v && nodes[v].next[ch] == null) v = nodes[v].fail;
        nodes[u].fail = nodes[v].next[ch] == null ? 0 : nodes[v].next[ch];
        nodes[u].out = nodes[u].out.concat(nodes[nodes[u].fail].out);
      });
    }
    return { nodes: nodes, patterns: patterns.slice() };
  }

  function alphabetFor(dict, text) {
    var seen = {};
    dict.alphabet.split("").forEach(function (ch) { seen[ch] = true; });
    text.split("").forEach(function (ch) { if (ch !== " ") seen[ch] = true; });
    return Object.keys(seen).sort();
  }

  function nextSparse(machine, state, ch) {
    var failSteps = 0;
    while (state && machine.nodes[state].next[ch] == null) {
      state = machine.nodes[state].fail;
      failSteps += 1;
    }
    if (machine.nodes[state].next[ch] != null) state = machine.nodes[state].next[ch];
    else state = 0;
    return { failSteps: failSteps, state: state };
  }

  function buildDfa(machine, alphabet) {
    var table = machine.nodes.map(function () { return {}; });
    machine.nodes.forEach(function (node) {
      alphabet.forEach(function (ch) {
        table[node.id][ch] = nextSparse(machine, node.id, ch).state;
      });
    });
    return table;
  }

  function scanAC(machine, text) {
    var state = 0;
    var matches = [];
    var trace = [];
    var failSteps = 0;
    for (var i = 0; i < text.length; i += 1) {
      var ch = text[i];
      var before = state;
      var next = nextSparse(machine, state, ch);
      state = next.state;
      failSteps += next.failSteps;
      var emitted = machine.nodes[state].out.map(function (out) {
        return { end: i, pattern: out.pattern, start: i - out.pattern.length + 1 };
      });
      matches = matches.concat(emitted);
      trace.push({ before: before, char: ch, emitted: emitted, failSteps: next.failSteps, index: i, state: state });
    }
    return {
      failSteps: failSteps,
      matches: matches,
      steps: text.length + failSteps,
      trace: trace
    };
  }

  function scanNaive(patterns, text) {
    var comparisons = 0;
    var matches = [];
    for (var i = 0; i < text.length; i += 1) {
      patterns.forEach(function (pattern) {
        if (i + pattern.length > text.length) return;
        var ok = true;
        for (var j = 0; j < pattern.length; j += 1) {
          comparisons += 1;
          if (text[i + j] !== pattern[j]) {
            ok = false;
            break;
          }
        }
        if (ok) matches.push({ end: i + pattern.length - 1, pattern: pattern, start: i });
      });
    }
    return { comparisons: comparisons, matches: matches };
  }

  function matchKey(match) {
    return match.start + "|" + match.end + "|" + match.pattern;
  }

  function sameMatches(a, b) {
    var aa = a.map(matchKey).sort();
    var bb = b.map(matchKey).sort();
    return aa.length === bb.length && aa.every(function (key, i) { return key === bb[i]; });
  }

  function summarizeMatches(patterns, matches) {
    var counts = {};
    patterns.forEach(function (p) { counts[p] = 0; });
    matches.forEach(function (m) { counts[m.pattern] = (counts[m.pattern] || 0) + 1; });
    return patterns.map(function (p) { return { count: counts[p] || 0, pattern: p }; });
  }

  function wordForState(machine, id) {
    var chars = [];
    while (id > 0) {
      chars.push(machine.nodes[id].char);
      id = machine.nodes[id].parent;
    }
    return chars.reverse().join("");
  }

  function evaluate(rawParams) {
    var params = cleanParams(rawParams);
    var dict = DICTIONARIES[params.dictionary];
    var machine = buildAutomaton(dict.patterns);
    var text = generateText(dict, params);
    var alphabet = alphabetFor(dict, text);
    var dfa = buildDfa(machine, alphabet);
    var ac = scanAC(machine, text);
    var naive = scanNaive(dict.patterns, text);
    var ok = sameMatches(ac.matches, naive.matches);
    var trieEdges = machine.nodes.length - 1;
    var explicitTransitions = machine.nodes.reduce(function (sum, node) {
      return sum + Object.keys(node.next).length;
    }, 0);
    return {
      ac: ac,
      alphabet: alphabet,
      denseEntries: machine.nodes.length * alphabet.length,
      dfa: dfa,
      dict: dict,
      explicitTransitions: explicitTransitions,
      matchCounts: summarizeMatches(dict.patterns, ac.matches),
      naive: naive,
      ok: ok,
      params: params,
      machine: machine,
      text: text,
      trieEdges: trieEdges
    };
  }

  function fmtInt(value) {
    value = Math.round(value);
    if (Math.abs(value) >= 1000000) return value.toExponential(2);
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return String(value);
    return String(Number(value.toFixed(digits == null ? 2 : digits)));
  }

  function metric(label, value, tone) {
    return '<div class="ac-lab__metric ' + (tone || "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function setupCanvas(canvas) {
    if (!canvas || !canvas.getContext) return null;
    var rect = canvas.getBoundingClientRect();
    var width = Math.max(320, Math.round(rect.width || canvas.clientWidth || canvas.width || 940));
    var compact = width < 700;
    var height = compact ? 1120 : 760;
    var ratio = Math.max(1, global.devicePixelRatio || 1);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { compact: compact, ctx: ctx, height: height, width: width };
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function label(ctx, text, x, y, color, size, weight, align) {
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 650) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y);
  }

  function wrapLabel(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var line = "";
    ctx.font = "600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    words.forEach(function (word) {
      var next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    var limit = Math.min(maxLines || lines.length, lines.length);
    for (var i = 0; i < limit; i += 1) {
      var out = lines[i];
      if (i === limit - 1 && lines.length > limit) out = out.replace(/[.,;:]?$/, "") + "...";
      label(ctx, out, x, y + i * lineHeight, COLORS.muted, 12, 600);
    }
  }

  function panel(ctx, box, title, subtitle) {
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    label(ctx, title, box.x + 14, box.y + 12, COLORS.ink, 14, 790);
    if (subtitle) wrapLabel(ctx, subtitle, box.x + 14, box.y + 34, box.w - 28, 15, 2);
  }

  function automatonLayout(machine, box) {
    var levels = [];
    machine.nodes.forEach(function (node) {
      if (!levels[node.depth]) levels[node.depth] = [];
      levels[node.depth].push(node.id);
    });
    var maxDepth = levels.length - 1;
    var positions = {};
    levels.forEach(function (ids, depth) {
      ids.forEach(function (id, i) {
        positions[id] = [
          box.x + (maxDepth ? depth / maxDepth : 0) * box.w,
          box.y + (ids.length === 1 ? 0.5 : (i + 0.5) / ids.length) * box.h
        ];
      });
    });
    return positions;
  }

  function drawAutomaton(ctx, state, box) {
    panel(ctx, box, "Trie plus failure links", "Solid edges consume characters; red links recover the longest live suffix.");
    var plot = { x: box.x + 26, y: box.y + 76, w: box.w - 52, h: box.h - 122 };
    var pos = automatonLayout(state.machine, plot);
    ctx.lineWidth = 1.5;
    state.machine.nodes.forEach(function (node) {
      Object.keys(node.next).forEach(function (ch) {
        var child = state.machine.nodes[node.next[ch]];
        var a = pos[node.id];
        var b = pos[child.id];
        ctx.strokeStyle = COLORS.ac;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        label(ctx, ch, (a[0] + b[0]) / 2 + 3, (a[1] + b[1]) / 2 - 8, COLORS.ac, 10, 760);
      });
    });
    state.machine.nodes.forEach(function (node) {
      if (node.id === 0 || node.fail === 0) return;
      var a = pos[node.id];
      var b = pos[node.fail];
      ctx.strokeStyle = COLORS.fail;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 18, b[0], b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    state.machine.nodes.forEach(function (node) {
      var p = pos[node.id];
      var hasOut = node.out.length > 0;
      ctx.beginPath();
      ctx.arc(p[0], p[1], hasOut ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = hasOut ? COLORS.softMatch : COLORS.white;
      ctx.fill();
      ctx.strokeStyle = hasOut ? COLORS.match : COLORS.axis;
      ctx.lineWidth = hasOut ? 2 : 1.2;
      ctx.stroke();
      label(ctx, String(node.id), p[0], p[1] - 5, hasOut ? COLORS.match : COLORS.muted, 9, 760, "center");
    });
    label(ctx, "states: " + state.machine.nodes.length + " / outputs: " + state.ac.matches.length, plot.x, box.y + box.h - 32, COLORS.muted, 11, 650);
  }

  function drawStream(ctx, state, box) {
    panel(ctx, box, "One-pass stream", "The automaton never rewinds the text; outputs can stack at one position.");
    var trace = state.ac.trace;
    var start = Math.max(0, trace.length - 56);
    var rows = trace.slice(start);
    var x = box.x + 20;
    var y = box.y + 82;
    var cell = Math.max(10, Math.min(18, (box.w - 40) / Math.max(1, rows.length)));
    rows.forEach(function (row, i) {
      var xx = x + i * cell;
      var hit = row.emitted.length > 0;
      roundRect(ctx, xx, y, cell - 1, 24, 3);
      ctx.fillStyle = hit ? COLORS.softMatch : row.failSteps ? COLORS.softFail : COLORS.fill;
      ctx.fill();
      label(ctx, row.char === " " ? "_" : row.char, xx + cell / 2, y + 6, hit ? COLORS.match : COLORS.ink, 10, 780, "center");
      var h = Math.max(2, row.state ? state.machine.nodes[row.state].depth * 9 : 2);
      ctx.fillStyle = row.failSteps ? COLORS.fail : COLORS.blue;
      ctx.fillRect(xx + cell * 0.25, y + 44 - h, cell * 0.5, h);
      if (hit) {
        ctx.fillStyle = COLORS.match;
        ctx.fillRect(xx + 2, y + 50, cell - 5, 4);
      }
    });
    var lastMatches = state.ac.matches.slice(-5);
    if (!lastMatches.length) {
      label(ctx, "no matches in this stream", x, box.y + box.h - 34, COLORS.muted, 11, 650);
    } else {
      label(ctx, lastMatches.map(function (m) { return m.pattern + "@" + m.start; }).join("  "), x, box.y + box.h - 34, COLORS.match, 11, 760);
    }
  }

  function drawWork(ctx, state, box) {
    panel(ctx, box, "Work ledger", "Naive matching rechecks prefixes; AC pays failure links once per stream step.");
    var rows = [
      { color: COLORS.fail, label: "naive char comparisons", value: state.naive.comparisons },
      { color: COLORS.ac, label: "AC sparse steps", value: state.ac.steps },
      { color: COLORS.blue, label: "DFA transitions", value: state.text.length },
      { color: COLORS.gold, label: "dense table entries", value: state.denseEntries },
      { color: COLORS.match, label: "explicit trie edges", value: state.explicitTransitions }
    ];
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var x = box.x + 18;
    var y = box.y + 78;
    var w = box.w - 36;
    var rowGap = Math.min(36, (box.h - 104) / rows.length);
    rows.forEach(function (row, i) {
      var yy = y + i * rowGap;
      label(ctx, row.label, x, yy, COLORS.muted, 12, 650);
      roundRect(ctx, x, yy + 18, w - 76, 10, 5);
      ctx.fillStyle = COLORS.fill;
      ctx.fill();
      roundRect(ctx, x, yy + 18, (w - 76) * row.value / max, 10, 5);
      ctx.fillStyle = row.color;
      ctx.fill();
      label(ctx, fmtInt(row.value), box.x + box.w - 18, yy + 11, row.color, 12, 800, "right");
    });
    var speedup = state.naive.comparisons / Math.max(1, state.ac.steps);
    if (box.h > 300) {
      label(ctx, "comparison ratio: " + fmt(speedup, 1) + "x", x, box.y + box.h - 34, speedup > 2 ? COLORS.ac : COLORS.gold, 12, 800);
    }
  }

  function drawMatches(ctx, state, box) {
    panel(ctx, box, "Output function", "A state can report its own pattern and patterns inherited through failure links.");
    var rows = state.matchCounts;
    var max = Math.max.apply(null, rows.map(function (r) { return r.count; }).concat([1]));
    var x = box.x + 18;
    var y = box.y + 82;
    var w = box.w - 36;
    rows.forEach(function (row, i) {
      var yy = y + i * Math.min(30, (box.h - 136) / Math.max(1, rows.length));
      label(ctx, row.pattern, x, yy, COLORS.ink, 12, 760);
      roundRect(ctx, x + 96, yy + 2, w - 152, 12, 6);
      ctx.fillStyle = COLORS.fill;
      ctx.fill();
      roundRect(ctx, x + 96, yy + 2, (w - 152) * row.count / max, 12, 6);
      ctx.fillStyle = COLORS.match;
      ctx.fill();
      label(ctx, String(row.count), box.x + box.w - 18, yy, COLORS.match, 12, 800, "right");
    });
    label(ctx, state.ok ? "audit: AC matches naive scan" : "audit failed", x, box.y + box.h - 34, state.ok ? COLORS.ac : COLORS.fail, 12, 820);
  }

  function boxesFor(setup) {
    var pad = 16;
    var gap = 14;
    if (setup.compact) {
      var w = setup.width - pad * 2;
      return [
        { x: pad, y: pad, w: w, h: 314 },
        { x: pad, y: 344, w: w, h: 230 },
        { x: pad, y: 590, w: w, h: 262 },
        { x: pad, y: 868, w: w, h: 236 }
      ];
    }
    var w2 = (setup.width - pad * 2 - gap) / 2;
    return [
      { x: pad, y: pad, w: w2, h: 352 },
      { x: pad + w2 + gap, y: pad, w: w2, h: 352 },
      { x: pad, y: 382, w: w2, h: 352 },
      { x: pad + w2 + gap, y: 382, w: w2, h: 352 }
    ];
  }

  function draw(root, state) {
    var canvas = root.querySelector("canvas[data-canvas]");
    var setup = setupCanvas(canvas);
    if (!setup) return;
    var ctx = setup.ctx;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, setup.width, setup.height);
    var boxes = boxesFor(setup);
    drawAutomaton(ctx, state, boxes[0]);
    drawStream(ctx, state, boxes[1]);
    drawWork(ctx, state, boxes[2]);
    drawMatches(ctx, state, boxes[3]);
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function updateControls(root, state) {
    var values = {
      dictionary: state.dict.label,
      length: String(state.params.length),
      overlap: String(state.params.overlap) + "%",
      seed: String(state.params.seed)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.value = String(state.params[input.getAttribute("data-param")]);
    });
  }

  function render(root) {
    var state = evaluate(paramsFromRoot(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var ratio = state.naive.comparisons / Math.max(1, state.ac.steps);
      metrics.innerHTML = [
        metric("dictionary", state.dict.label),
        metric("patterns", String(state.dict.patterns.length)),
        metric("states", String(state.machine.nodes.length)),
        metric("matches", String(state.ac.matches.length), state.ac.matches.length ? "good" : ""),
        metric("naive / AC", fmt(ratio, 1) + "x", ratio > 2 ? "good" : "warn"),
        metric("audit", state.ok ? "passed" : "failed", state.ok ? "good" : "bad")
      ].join("");
    }
    draw(root, state);
    root.__ahoCorasickState = state;
  }

  function init(root) {
    if (!root || root.__ahoCorasickReady) return;
    root.__ahoCorasickReady = true;
    var scheduled = null;
    function requestRender() {
      if (scheduled) global.cancelAnimationFrame(scheduled);
      scheduled = global.requestAnimationFrame(function () {
        scheduled = null;
        render(root);
      });
    }
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", requestRender);
      input.addEventListener("change", requestRender);
    });
    global.addEventListener("resize", requestRender);
    render(root);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function auditMachine(machine, alphabet, label) {
    machine.nodes.forEach(function (node) {
      var word = wordForState(machine, node.id);
      if (node.id === 0) {
        assert(node.fail === 0, label + " root should fail to root");
      } else {
        var failWord = wordForState(machine, node.fail);
        assert(machine.nodes[node.fail].depth < node.depth, label + " failure link should reduce depth");
        assert(word.slice(word.length - failWord.length) === failWord, label + " failure link should name a suffix");
      }
      node.out.forEach(function (out) {
        assert(word.slice(word.length - out.pattern.length) === out.pattern, label + " output should be a suffix of state word");
      });
      alphabet.forEach(function (ch) {
        var sparse = nextSparse(machine, node.id, ch).state;
        assert(sparse >= 0 && sparse < machine.nodes.length, label + " sparse transition should land in machine");
      });
    });
  }

  function auditDfa(machine, alphabet, dfa, label) {
    machine.nodes.forEach(function (node) {
      alphabet.forEach(function (ch) {
        assert(dfa[node.id][ch] === nextSparse(machine, node.id, ch).state, label + " dense DFA should match sparse failure walk");
      });
    });
  }

  function auditKnownExamples() {
    var classic = buildAutomaton(DICTIONARIES.classic.patterns);
    var she = scanAC(classic, "she");
    var ushers = scanAC(classic, "ushers");
    var dna = buildAutomaton(DICTIONARIES.dna.patterns);
    var gata = scanAC(dna, "GATA");

    assert(sameMatches(she.matches, [
      { start: 0, end: 2, pattern: "she" },
      { start: 1, end: 2, pattern: "he" }
    ]), "classic example should stack she and he at one endpoint");
    assert(sameMatches(ushers.matches, [
      { start: 1, end: 3, pattern: "she" },
      { start: 2, end: 3, pattern: "he" },
      { start: 2, end: 5, pattern: "hers" }
    ]), "ushers should report overlapping textbook matches");
    assert(sameMatches(gata.matches, [
      { start: 0, end: 2, pattern: "GAT" },
      { start: 0, end: 3, pattern: "GATA" }
    ]), "standard semantics should preserve prefix-overlap DNA matches");

    return {
      gata: gata.matches.length,
      she: she.matches.length,
      ushers: ushers.matches.length
    };
  }

  function audit() {
    var known = auditKnownExamples();
    var summary = {};
    Object.keys(DICTIONARIES).forEach(function (key) {
      var totalMatches = 0;
      var maxFailSteps = 0;
      var maxRatio = 0;
      var maxSparseRatio = 0;
      var cases = 0;
      [1, 9, 17, 91, 403].forEach(function (seed) {
        [48, 96, 180].forEach(function (length) {
          [0, 50, 90].forEach(function (overlap) {
            var state = evaluate({ dictionary: key, length: length, overlap: overlap, seed: seed });
            assert(state.ok, key + " matches should agree with naive scan");
            auditMachine(state.machine, state.alphabet, key);
            auditDfa(state.machine, state.alphabet, state.dfa, key);
            assert(state.machine.nodes.length <= 1 + state.dict.patterns.join("").length, key + " trie state bound");
            assert(state.denseEntries >= state.explicitTransitions, key + " dense table should dominate sparse edges");
            assert(state.ac.steps >= state.text.length, key + " sparse scan reads at least one step per char");
            assert(state.ac.failSteps <= state.text.length, key + " failure transitions should amortize under one per character");
            totalMatches += state.ac.matches.length;
            maxFailSteps = Math.max(maxFailSteps, state.ac.failSteps);
            maxRatio = Math.max(maxRatio, state.naive.comparisons / Math.max(1, state.ac.steps));
            maxSparseRatio = Math.max(maxSparseRatio, state.ac.steps / Math.max(1, state.text.length));
            cases += 1;
          });
        });
      });
      summary[key] = {
        cases: cases,
        maxFailSteps: maxFailSteps,
        maxNaiveToSparseRatio: maxRatio,
        maxSparseStepsPerChar: maxSparseRatio,
        totalMatches: totalMatches
      };
    });
    return { knownExamples: known, ok: true, summary: summary };
  }

  var api = {
    DICTIONARIES: DICTIONARIES,
    audit: audit,
    buildAutomaton: buildAutomaton,
    evaluate: evaluate,
    scanAC: scanAC,
    scanNaive: scanNaive
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AhoCorasickLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-aho-corasick-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
