(function (global) {
  "use strict";

  var BITS = 16;
  var SPACE = 1 << BITS;
  var MASK = SPACE - 1;

  var COLORS = {
    amber: "#d97706",
    axis: "#d7dee5",
    blue: "#2563eb",
    found: "#0f766e",
    grid: "#edf2f7",
    ink: "#172026",
    miss: "#be123c",
    muted: "#5d6872",
    panel: "#f8fafc",
    purple: "#7c3aed",
    softAmber: "rgba(217, 119, 6, 0.14)",
    softBlue: "rgba(37, 99, 235, 0.11)",
    softFound: "rgba(15, 118, 110, 0.13)",
    softMiss: "rgba(190, 18, 60, 0.12)",
    white: "#ffffff"
  };

  var DEFAULTS = {
    alpha: 2,
    bucketSize: 4,
    nodes: 220,
    scenario: "patchy",
    seed: 41,
    stalePct: 35
  };

  var SCENARIOS = {
    uniform: {
      label: "uniform ids",
      note: "Nodes are spread uniformly across the ID space."
    },
    hotkey: {
      label: "hot prefix",
      note: "Many nodes share the target's high bits, making the final prefix buckets crowded."
    },
    patchy: {
      label: "patchy table",
      note: "The network has uneven neighborhoods and more stale contacts near the target."
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
      alpha: snap(raw.alpha, DEFAULTS.alpha, 1, 8, 1),
      bucketSize: snap(raw.bucketSize, DEFAULTS.bucketSize, 2, 32, 1),
      nodes: snap(raw.nodes, DEFAULTS.nodes, 40, 420, 10),
      scenario: SCENARIOS[raw.scenario] ? raw.scenario : DEFAULTS.scenario,
      seed: snap(raw.seed, DEFAULTS.seed, 1, 9999, 1),
      stalePct: snap(raw.stalePct, DEFAULTS.stalePct, 0, 55, 1)
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

  function xorDistance(a, b) {
    return (a ^ b) & MASK;
  }

  function bucketIndex(a, b) {
    var d = xorDistance(a, b);
    if (d === 0) return BITS;
    return 31 - Math.clz32(d);
  }

  function sharedPrefixBits(a, b) {
    var d = xorDistance(a, b);
    if (d === 0) return BITS;
    return BITS - 1 - bucketIndex(a, b);
  }

  function hex(id) {
    return id.toString(16).toUpperCase().padStart(4, "0");
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "n/a";
    return Number(value).toFixed(digits == null ? 1 : digits);
  }

  function metric(label, value, tone) {
    return '<div class="kad-lab__metric ' + (tone || "") + '">' +
      "<span>" + label + "</span><strong>" + value + "</strong></div>";
  }

  function uniqueId(rand, used, preferred) {
    var id = preferred == null ? Math.floor(rand() * SPACE) : (preferred & MASK);
    var guard = 0;
    while (used[id] && guard < SPACE) {
      id = (id + 1 + Math.floor(rand() * 97)) & MASK;
      guard += 1;
    }
    used[id] = true;
    return id;
  }

  function generateNodes(params) {
    var rand = rng(params.seed * 1009 + params.nodes * 17);
    var target = Math.floor(rand() * SPACE) & MASK;
    var used = {};
    var nodes = [];
    for (var i = 0; i < params.nodes; i += 1) {
      var id;
      if (params.scenario === "hotkey" && rand() < 0.62) {
        var prefixBits = 8 + Math.floor(rand() * 5);
        var mask = (MASK << (BITS - prefixBits)) & MASK;
        id = (target & mask) | Math.floor(rand() * (1 << (BITS - prefixBits)));
      } else if (params.scenario === "patchy" && rand() < 0.42) {
        var flip = 1 << (7 + Math.floor(rand() * 7));
        id = (target ^ flip ^ Math.floor(rand() * 256)) & MASK;
      } else {
        id = Math.floor(rand() * SPACE);
      }
      nodes.push({
        alive: true,
        id: uniqueId(rand, used, id),
        index: i,
        uptime: 5 + Math.floor(rand() * 5000)
      });
    }
    var source = nodes[Math.floor(rand() * nodes.length) % nodes.length];
    var owner = closestAlive(nodes, target, null);
    if (owner && owner.id === source.id) {
      source = nodes.reduce(function (best, node) {
        if (node.id === owner.id) return best;
        if (!best) return node;
        return xorDistance(node.id, target) > xorDistance(best.id, target) ? node : best;
      }, null) || source;
    }
    var staleTarget = Math.floor(nodes.length * params.stalePct / 100);
    var staleRank = nodes.filter(function (node) {
      return node.id !== source.id && (!owner || node.id !== owner.id);
    }).sort(function (a, b) {
      var as = hash32(a.id ^ (params.seed * 313));
      var bs = hash32(b.id ^ (params.seed * 313));
      if (params.scenario === "patchy") {
        as -= Math.max(0, 18 - sharedPrefixBits(a.id, target)) * 7000000;
        bs -= Math.max(0, 18 - sharedPrefixBits(b.id, target)) * 7000000;
      }
      return as - bs;
    });
    staleRank.slice(0, staleTarget).forEach(function (node) {
      node.alive = false;
    });
    owner = closestAlive(nodes, target, null);
    if (!owner) {
      nodes[0].alive = true;
      owner = nodes[0];
    }
    source.alive = true;
    return { nodes: nodes, owner: owner, source: source, target: target };
  }

  function compareByDistance(target) {
    return function (a, b) {
      var da = xorDistance(a.id, target);
      var db = xorDistance(b.id, target);
      if (da !== db) return da - db;
      return a.id - b.id;
    };
  }

  function closestAlive(nodes, target, excludeId) {
    return nodes.filter(function (node) {
      return node.alive && node.id !== excludeId;
    }).sort(compareByDistance(target))[0] || null;
  }

  function contactScore(owner, contact, seed) {
    var mixed = hash32(owner.id * 131 + contact.id * 977 + seed * 8191);
    var ageBonus = clamp(contact.uptime / 5000, 0, 1) * 0.22;
    return mixed / 4294967296 - ageBonus;
  }

  function buildRoutingTable(node, nodes, params) {
    var buckets = [];
    for (var i = 0; i < BITS; i += 1) buckets.push([]);
    nodes.forEach(function (contact) {
      if (contact.id === node.id) return;
      var b = bucketIndex(node.id, contact.id);
      if (b >= BITS) return;
      buckets[b].push({
        id: contact.id,
        alive: contact.alive,
        bucket: b,
        node: contact,
        score: contactScore(node, contact, params.seed)
      });
    });
    buckets = buckets.map(function (bucket) {
      return bucket.sort(function (a, b) {
        if (a.score !== b.score) return a.score - b.score;
        return a.id - b.id;
      }).slice(0, params.bucketSize);
    });
    return buckets;
  }

  function flattenTable(table) {
    var out = [];
    table.forEach(function (bucket) {
      bucket.forEach(function (contact) {
        out.push(contact.node);
      });
    });
    return out;
  }

  function uniqueClosest(nodes, target, limit, excludeId) {
    var seen = {};
    var out = [];
    nodes.sort(compareByDistance(target)).forEach(function (node) {
      if (node.id === excludeId || seen[node.id]) return;
      seen[node.id] = true;
      out.push(node);
    });
    return out.slice(0, limit);
  }

  function buildTables(nodes, params) {
    var tables = {};
    nodes.forEach(function (node) {
      tables[node.id] = buildRoutingTable(node, nodes, params);
    });
    return tables;
  }

  function queryNode(node, target, tables, params) {
    if (!node.alive) {
      return { contacts: [], ok: false };
    }
    return {
      contacts: uniqueClosest(flattenTable(tables[node.id]), target, params.bucketSize, node.id),
      ok: true
    };
  }

  function simulateLookup(network, tables, params) {
    var source = network.source;
    var target = network.target;
    var owner = network.owner;
    var candidateMap = {};
    var queried = {};
    var timedOut = {};
    var rounds = [];
    var bestHistory = [];
    var initial = uniqueClosest(flattenTable(tables[source.id]), target, params.bucketSize, source.id);
    initial.forEach(function (node) {
      candidateMap[node.id] = node;
    });

    function sortedCandidates() {
      return Object.keys(candidateMap).map(function (id) {
        return candidateMap[id];
      }).sort(compareByDistance(target));
    }

    function bestSeenAlive() {
      return sortedCandidates().filter(function (node) { return node.alive; })[0] || null;
    }

    var maxRounds = 2 * BITS;
    for (var round = 0; round < maxRounds; round += 1) {
      var sorted = sortedCandidates();
      var best = bestSeenAlive();
      bestHistory.push(best ? xorDistance(best.id, target) : Infinity);
      var closestSeen = sorted.slice(0, params.bucketSize);
      var done = closestSeen.length > 0 && closestSeen.every(function (node) {
        return queried[node.id] || timedOut[node.id];
      });
      var toQuery = sorted.filter(function (node) {
        return node.id !== source.id && !queried[node.id] && !timedOut[node.id];
      }).slice(0, params.alpha);
      if (!toQuery.length || (done && round > 0)) break;
      var beforeBest = best ? xorDistance(best.id, target) : Infinity;
      var newContacts = 0;
      var newCloser = 0;
      var timeouts = 0;
      var queriedIds = [];
      toQuery.forEach(function (node) {
        queried[node.id] = true;
        queriedIds.push(node.id);
        var response = queryNode(node, target, tables, params);
        if (!response.ok) {
          timedOut[node.id] = true;
          timeouts += 1;
          return;
        }
        response.contacts.forEach(function (contact) {
          if (contact.id === source.id || candidateMap[contact.id]) return;
          candidateMap[contact.id] = contact;
          newContacts += 1;
          if (xorDistance(contact.id, target) < beforeBest) newCloser += 1;
        });
      });
      var afterBest = bestSeenAlive();
      rounds.push({
        bestAfter: afterBest ? afterBest.id : null,
        bestDistance: afterBest ? xorDistance(afterBest.id, target) : Infinity,
        newCloser: newCloser,
        newContacts: newContacts,
        queried: queriedIds,
        round: round + 1,
        timeouts: timeouts
      });
      if (candidateMap[owner.id] && queried[owner.id]) {
        bestHistory.push(xorDistance(owner.id, target));
        break;
      }
    }
    var finalCandidates = sortedCandidates();
    var finalAlive = finalCandidates.filter(function (node) { return node.alive; });
    var globalAlive = network.nodes.filter(function (node) { return node.alive; }).sort(compareByDistance(target));
    var bestSeen = finalAlive[0] || null;
    var ownerSeen = Boolean(candidateMap[owner.id]);
    var ownerQueried = Boolean(queried[owner.id]);
    var bestRank = bestSeen ? globalAlive.findIndex(function (node) { return node.id === bestSeen.id; }) + 1 : Infinity;
    var queriedCount = Object.keys(queried).length;
    var timeoutCount = Object.keys(timedOut).length;
    return {
      bestHistory: bestHistory,
      bestRank: bestRank,
      bestSeen: bestSeen,
      candidateCount: finalCandidates.length,
      candidates: finalCandidates,
      foundOwner: ownerSeen || ownerQueried,
      ownerQueried: ownerQueried,
      ownerSeen: ownerSeen,
      queried: queried,
      queriedCount: queriedCount,
      rounds: rounds,
      sharedPrefix: bestSeen ? sharedPrefixBits(bestSeen.id, target) : 0,
      timedOut: timedOut,
      timeoutCount: timeoutCount
    };
  }

  function runTrial(rawParams) {
    var params = cleanParams(rawParams);
    var network = generateNodes(params);
    var tables = buildTables(network.nodes, params);
    var lookup = simulateLookup(network, tables, params);
    return {
      lookup: lookup,
      network: network,
      params: params,
      sourceBuckets: tables[network.source.id],
      tables: tables
    };
  }

  function frontier(params) {
    var ks = [2, 4, 6, 8, 12, 16, 24];
    return ks.map(function (k) {
      var successes = 0;
      var queries = 0;
      var timeouts = 0;
      var cases = 0;
      for (var i = 0; i < 18; i += 1) {
        var trial = runTrial({
          alpha: params.alpha,
          bucketSize: k,
          nodes: params.nodes,
          scenario: params.scenario,
          seed: params.seed + i * 37,
          stalePct: params.stalePct
        });
        successes += trial.lookup.foundOwner ? 1 : 0;
        queries += trial.lookup.queriedCount;
        timeouts += trial.lookup.timeoutCount;
        cases += 1;
      }
      return {
        avgQueries: queries / cases,
        avgTimeouts: timeouts / cases,
        bucketSize: k,
        cases: cases,
        successRate: successes / cases
      };
    });
  }

  function evaluate(rawParams) {
    var trial = runTrial(rawParams);
    trial.frontier = frontier(trial.params);
    return trial;
  }

  function drawText(ctx, text, x, y, color, size, maxWidth, weight, align) {
    ctx.save();
    ctx.fillStyle = color || COLORS.ink;
    ctx.font = (weight || 500) + " " + (size || 12) + "px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    if (!maxWidth) {
      ctx.fillText(text, x, y);
      ctx.restore();
      return y + size + 4;
    }
    var words = String(text).split(/\s+/);
    var line = "";
    var yy = y;
    var lineHeight = (size || 12) * 1.32;
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        yy += lineHeight;
        line = word;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, x, yy);
    ctx.restore();
    return yy + lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function panel(ctx, rect, title, subtitle) {
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = COLORS.white;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.stroke();
    drawText(ctx, title, rect.x + 14, rect.y + 12, COLORS.ink, 13, rect.w - 28, 720);
    if (subtitle) drawText(ctx, subtitle, rect.x + 14, rect.y + 31, COLORS.muted, 11, rect.w - 28, 520);
    ctx.restore();
  }

  function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
    var span = Math.max(1e-9, domainMax - domainMin);
    return function (value) {
      return rangeMin + (value - domainMin) / span * (rangeMax - rangeMin);
    };
  }

  function drawIdSpace(ctx, rect, state) {
    panel(ctx, rect, "id-space trace", "linear ID space for orientation; lookup closeness is XOR distance to the target");
    var network = state.network;
    var lookup = state.lookup;
    var x = scaleLinear(0, MASK, rect.x + 28, rect.x + rect.w - 28);
    var y = rect.y + rect.h * 0.52;
    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(rect.x + 24, y);
    ctx.lineTo(rect.x + rect.w - 24, y);
    ctx.stroke();

    network.nodes.forEach(function (node) {
      var px = x(node.id);
      var wasQueried = lookup.queried[node.id];
      ctx.fillStyle = node.alive ? COLORS.axis : COLORS.softMiss;
      if (wasQueried) ctx.fillStyle = node.alive ? COLORS.blue : COLORS.miss;
      ctx.beginPath();
      ctx.arc(px, y + (wasQueried ? -15 : 0), wasQueried ? 3.4 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    });

    function marker(id, label, color, offset) {
      var px = x(id);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, y - 44 + offset);
      ctx.lineTo(px, y + 34 + offset);
      ctx.stroke();
      drawText(ctx, label + " " + hex(id), px, y - 64 + offset, color, 10, 88, 720, "center");
    }
    marker(network.target, "target", COLORS.purple, 0);
    marker(network.source.id, "source", COLORS.blue, -8);
    marker(network.owner.id, "owner", COLORS.found, 8);

    var best = lookup.bestSeen;
    if (best && best.id !== network.owner.id) {
      marker(best.id, "best seen", COLORS.amber, 16);
    }
    drawText(ctx, SCENARIOS[state.params.scenario].note, rect.x + 14, rect.y + rect.h - 31, COLORS.muted, 10, rect.w - 28, 520);
    ctx.restore();
  }

  function drawBuckets(ctx, rect, state) {
    panel(ctx, rect, "source k-buckets", "bucket i stores contacts with XOR distance in [2^i, 2^(i+1))");
    var buckets = state.sourceBuckets;
    var gx = rect.x + 26;
    var gy = rect.y + 62;
    var gw = rect.w - 52;
    var gh = rect.h - 94;
    var barW = gw / BITS;
    ctx.save();
    for (var i = 0; i < BITS; i += 1) {
      var bucket = buckets[i] || [];
      var live = bucket.filter(function (c) { return c.alive; }).length;
      var stale = bucket.length - live;
      var hLive = gh * live / Math.max(1, state.params.bucketSize);
      var hStale = gh * stale / Math.max(1, state.params.bucketSize);
      var x = gx + i * barW + 1;
      ctx.fillStyle = COLORS.grid;
      ctx.fillRect(x, gy, Math.max(1, barW - 2), gh);
      ctx.fillStyle = COLORS.found;
      ctx.fillRect(x, gy + gh - hLive, Math.max(1, barW - 2), hLive);
      if (stale) {
        ctx.fillStyle = COLORS.miss;
        ctx.fillRect(x, gy + gh - hLive - hStale, Math.max(1, barW - 2), hStale);
      }
      if (i % 3 === 0) drawText(ctx, String(i), x + barW / 2, gy + gh + 8, COLORS.muted, 9, null, 500, "center");
    }
    drawText(ctx, "close", gx, rect.y + rect.h - 22, COLORS.muted, 10);
    drawText(ctx, "far", gx + gw - 18, rect.y + rect.h - 22, COLORS.muted, 10);
    drawText(ctx, "green live / red stale", gx + 72, rect.y + rect.h - 22, COLORS.muted, 10);
    ctx.restore();
  }

  function drawRounds(ctx, rect, state) {
    panel(ctx, rect, "iterative lookup ledger", "each round queries up to alpha closest unqueried candidates");
    var rows = state.lookup.rounds.slice(0, 8);
    var x = rect.x + 14;
    var y = rect.y + 58;
    ctx.save();
    drawText(ctx, "r", x, y, COLORS.muted, 10, 24, 680);
    drawText(ctx, "queried", x + 28, y, COLORS.muted, 10, 112, 680);
    drawText(ctx, "new", x + 145, y, COLORS.muted, 10, 42, 680);
    drawText(ctx, "closer", x + 190, y, COLORS.muted, 10, 46, 680);
    drawText(ctx, "best", x + 242, y, COLORS.muted, 10, rect.w - 254, 680);
    y += 21;
    if (!rows.length) {
      drawText(ctx, "source already had no useful candidates", x, y, COLORS.muted, 11, rect.w - 28);
    }
    rows.forEach(function (round, index) {
      var yy = y + index * 23;
      ctx.fillStyle = index % 2 ? COLORS.white : COLORS.panel;
      ctx.fillRect(rect.x + 10, yy - 4, rect.w - 20, 20);
      drawText(ctx, String(round.round), x, yy, COLORS.ink, 10, 24, 600);
      drawText(ctx, round.queried.map(hex).join(" "), x + 28, yy, COLORS.ink, 10, 112, 540);
      drawText(ctx, String(round.newContacts), x + 145, yy, COLORS.ink, 10, 42, 540);
      drawText(ctx, String(round.newCloser), x + 190, yy, round.newCloser ? COLORS.found : COLORS.muted, 10, 46, 650);
      drawText(ctx, round.bestAfter == null ? "none" : hex(round.bestAfter) + " d=" + round.bestDistance, x + 242, yy, COLORS.ink, 10, rect.w - 254, 540);
      if (round.timeouts) drawText(ctx, "+" + round.timeouts + " timeout", rect.x + rect.w - 82, yy, COLORS.miss, 10);
    });
    ctx.restore();
  }

  function drawFrontier(ctx, rect, state) {
    panel(ctx, rect, "bucket-size frontier", "same scenario swept across k; bars show success, line shows queries");
    var data = state.frontier;
    var gx = rect.x + 36;
    var gy = rect.y + 62;
    var gw = rect.w - 62;
    var gh = rect.h - 96;
    var maxQ = Math.max.apply(null, data.map(function (p) { return p.avgQueries; }).concat([1]));
    var x = scaleLinear(0, data.length, gx, gx + gw);
    var yRate = scaleLinear(0, 1, gy + gh, gy);
    var yQ = scaleLinear(0, maxQ, gy + gh, gy);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    for (var i = 0; i <= 4; i += 1) {
      var yy = gy + gh * i / 4;
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(gx + gw, yy);
      ctx.stroke();
    }
    var barW = gw / data.length * 0.55;
    data.forEach(function (point, index) {
      var cx = x(index + 0.5);
      ctx.fillStyle = point.bucketSize === state.params.bucketSize ? COLORS.purple : COLORS.blue;
      var y0 = yRate(point.successRate);
      ctx.fillRect(cx - barW / 2, y0, barW, gy + gh - y0);
      drawText(ctx, String(point.bucketSize), cx, gy + gh + 10, COLORS.muted, 9, null, 560, "center");
    });
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach(function (point, index) {
      var px = x(index + 0.5);
      var py = yQ(point.avgQueries);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    drawText(ctx, "success", gx, rect.y + rect.h - 24, COLORS.blue, 10);
    drawText(ctx, "avg queries", gx + 58, rect.y + rect.h - 24, COLORS.amber, 10);
    ctx.restore();
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || canvas.width || 960);
    var cssH = cssW >= 760 ? Math.max(660, cssW * 0.72) : (cssW < 460 ? 980 : 920);
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr)) canvas.width = Math.round(cssW * dpr);
    if (canvas.height !== Math.round(cssH * dpr)) canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx: ctx, h: cssH, w: cssW };
  }

  function draw(root, state) {
    var canvas = root.querySelector("[data-canvas]");
    if (!canvas) return;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var w = setup.w;
    var h = setup.h;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, w, h);
    var pad = 18;
    if (w >= 760) {
      var topH = h * 0.52;
      var half = (w - pad * 3) / 2;
      drawIdSpace(ctx, { x: pad, y: pad, w: half, h: topH - pad }, state);
      drawBuckets(ctx, { x: pad * 2 + half, y: pad, w: half, h: topH - pad }, state);
      drawRounds(ctx, { x: pad, y: topH + 8, w: half, h: h - topH - pad - 8 }, state);
      drawFrontier(ctx, { x: pad * 2 + half, y: topH + 8, w: half, h: h - topH - pad - 8 }, state);
    } else {
      var sectionH = (h - pad * 5) / 4;
      drawIdSpace(ctx, { x: pad, y: pad, w: w - pad * 2, h: sectionH }, state);
      drawBuckets(ctx, { x: pad, y: pad * 2 + sectionH, w: w - pad * 2, h: sectionH }, state);
      drawRounds(ctx, { x: pad, y: pad * 3 + sectionH * 2, w: w - pad * 2, h: sectionH }, state);
      drawFrontier(ctx, { x: pad, y: pad * 4 + sectionH * 3, w: w - pad * 2, h: sectionH }, state);
    }
  }

  function readParams(root) {
    var raw = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      raw[input.getAttribute("data-param")] = input.value;
    });
    return cleanParams(raw);
  }

  function setValue(root, name, value) {
    root.querySelectorAll('[data-value="' + name + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function updateControls(root, state) {
    setValue(root, "scenario", SCENARIOS[state.params.scenario].label);
    setValue(root, "nodes", String(state.params.nodes));
    setValue(root, "bucketSize", String(state.params.bucketSize));
    setValue(root, "alpha", String(state.params.alpha));
    setValue(root, "stalePct", state.params.stalePct + "%");
    setValue(root, "seed", String(state.params.seed));
  }

  function render(root) {
    var state = evaluate(readParams(root));
    updateControls(root, state);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      var found = state.lookup.foundOwner;
      metrics.innerHTML = [
        metric("scenario", SCENARIOS[state.params.scenario].label),
        metric("target", hex(state.network.target)),
        metric("owner", hex(state.network.owner.id), found ? "good" : "bad"),
        metric("status", found ? "found" : "missed", found ? "good" : "bad"),
        metric("rounds", String(state.lookup.rounds.length)),
        metric("queries", String(state.lookup.queriedCount)),
        metric("timeouts", String(state.lookup.timeoutCount), state.lookup.timeoutCount ? "warn" : "good"),
        metric("best rank", isFinite(state.lookup.bestRank) ? "#" + state.lookup.bestRank : "none", state.lookup.bestRank <= 1 ? "good" : "warn")
      ].join("");
    }
    draw(root, state);
    root.__kademliaXorState = state;
  }

  function init(root) {
    if (!root || root.__kademliaXorReady) return;
    root.__kademliaXorReady = true;
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

  function audit() {
    var summary = {};
    assert(xorDistance(0x1234, 0xBEEF) === xorDistance(0xBEEF, 0x1234), "xor distance should be symmetric");
    assert((0x1234 ^ xorDistance(0x1234, 0xBEEF)) === 0xBEEF, "xor distance should be unidirectional");
    assert(bucketIndex(0x0000, 0x0001) === 0, "low bit bucket");
    assert(bucketIndex(0x0000, 0x8000) === 15, "high bit bucket");
    Object.keys(SCENARIOS).forEach(function (scenario) {
      var cases = 0;
      var found = 0;
      [5, 41, 137, 911].forEach(function (seed) {
        [0, 18, 35].forEach(function (stalePct) {
          var state = runTrial({ alpha: 3, bucketSize: 8, nodes: 140, scenario: scenario, seed: seed, stalePct: stalePct });
          var sourceId = state.network.source.id;
          state.sourceBuckets.forEach(function (bucket, b) {
            bucket.forEach(function (contact) {
              assert(bucketIndex(sourceId, contact.id) === b, scenario + " contact should live in matching bucket");
            });
          });
          state.network.nodes.filter(function (node) { return node.alive; }).forEach(function (node) {
            var response = queryNode(node, state.network.target, state.tables, state.params);
            assert(response.contacts.length <= state.params.bucketSize, scenario + " response should cap at k");
            for (var i = 1; i < response.contacts.length; i += 1) {
              assert(xorDistance(response.contacts[i - 1].id, state.network.target) <= xorDistance(response.contacts[i].id, state.network.target), scenario + " response contacts should be distance sorted");
            }
          });
          for (var h = 1; h < state.lookup.bestHistory.length; h += 1) {
            assert(state.lookup.bestHistory[h] <= state.lookup.bestHistory[h - 1], scenario + " best seen distance should not increase");
          }
          if (state.lookup.foundOwner) found += 1;
          cases += 1;
        });
      });
      var perfect = runTrial({ alpha: 4, bucketSize: 32, nodes: 40, scenario: scenario, seed: 99, stalePct: 0 });
      assert(perfect.lookup.foundOwner, scenario + " perfect small routing tables should find the owner");
      summary[scenario] = { cases: cases, found: found, perfectFound: perfect.lookup.foundOwner };
    });
    return { ok: true, summary: summary };
  }

  var api = {
    BITS: BITS,
    DEFAULTS: DEFAULTS,
    SCENARIOS: SCENARIOS,
    audit: audit,
    bucketIndex: bucketIndex,
    cleanParams: cleanParams,
    evaluate: evaluate,
    frontier: frontier,
    runTrial: runTrial,
    sharedPrefixBits: sharedPrefixBits,
    xorDistance: xorDistance
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.KademliaXorLab = api;

  if (typeof global.document !== "undefined") {
    Array.prototype.slice.call(global.document.querySelectorAll("[data-kademlia-xor-lab]")).forEach(init);
  }
})(typeof window !== "undefined" ? window : globalThis);
