(function (global) {
  "use strict";

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#f8fafc",
    root: "#2563eb",
    proof: "#7c3aed",
    leaf: "#0f766e",
    warn: "#d97706",
    bad: "#be123c",
    good: "#0f766e"
  };

  var NAMES = [
    "atlas", "banyan", "cobalt", "delta", "ember", "fable", "garnet", "harbor",
    "iris", "juniper", "kepler", "lumen", "mango", "nova", "onyx", "prairie"
  ];
  var ISSUERS = ["ca-alpha", "ca-beta", "ca-gamma", "ca-delta"];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cleanParams(raw) {
    raw = raw || {};
    var entryCount = clamp(Number(raw.entryCount == null ? 32 : raw.entryCount), 4, 128) | 0;
    var oldSize = clamp(Number(raw.oldSize == null ? 8 : raw.oldSize), 1, entryCount) | 0;
    var leafIndex = clamp(Number(raw.leafIndex == null ? 6 : raw.leafIndex), 0, entryCount - 1) | 0;
    var attack = String(raw.attack || "honest");
    if (["honest", "tamper", "rewrite", "split"].indexOf(attack) < 0) attack = "honest";
    return {
      attack: attack,
      entryCount: entryCount,
      leafIndex: leafIndex,
      oldSize: oldSize
    };
  }

  function hex64(value) {
    var text = value.toString(16);
    return "0".repeat(Math.max(0, 16 - text.length)) + text;
  }

  function toyHash(input) {
    var hash = 0xcbf29ce484222325n;
    var prime = 0x100000001b3n;
    var mask = 0xffffffffffffffffn;
    for (var i = 0; i < input.length; i += 1) {
      hash ^= BigInt(input.charCodeAt(i) & 0xff);
      hash = (hash * prime) & mask;
    }
    return hex64(hash);
  }

  function leafHash(data) {
    return toyHash("leaf\u0000" + data);
  }

  function nodeHash(left, right) {
    return toyHash("node\u0000" + left + "\u0000" + right);
  }

  function emptyHash() {
    return toyHash("empty");
  }

  function largestPowerOfTwoLessThan(n) {
    var k = 1;
    while (k * 2 < n) k *= 2;
    return k;
  }

  function shortHash(hash) {
    return hash.slice(0, 6) + "." + hash.slice(-4);
  }

  function makeEntry(index) {
    var name = NAMES[index % NAMES.length];
    var issuer = ISSUERS[index % ISSUERS.length];
    var serial = (100000 + index * 7919).toString(16);
    var key = toyHash("key|" + index + "|" + name).slice(0, 12);
    return "cert:" + name + index + ".example|issuer=" + issuer + "|serial=" + serial + "|key=" + key;
  }

  function makeEntries(count) {
    var entries = [];
    for (var i = 0; i < count; i += 1) entries.push(makeEntry(i));
    return entries;
  }

  function merkleRoot(entries) {
    if (!entries.length) return emptyHash();
    if (entries.length === 1) return leafHash(entries[0]);
    var split = largestPowerOfTwoLessThan(entries.length);
    return nodeHash(merkleRoot(entries.slice(0, split)), merkleRoot(entries.slice(split)));
  }

  function inclusionPath(entries, index) {
    if (entries.length <= 1) return [];
    var split = largestPowerOfTwoLessThan(entries.length);
    if (index < split) {
      return inclusionPath(entries.slice(0, split), index).concat([{
        side: "right",
        hash: merkleRoot(entries.slice(split)),
        range: [split, entries.length]
      }]);
    }
    return inclusionPath(entries.slice(split), index - split).concat([{
      side: "left",
      hash: merkleRoot(entries.slice(0, split)),
      range: [0, split]
    }]);
  }

  function verifyInclusion(entry, index, treeSize, root, path) {
    if (index < 0 || index >= treeSize) return false;
    var current = leafHash(entry);
    path.forEach(function (node) {
      current = node.side === "left" ? nodeHash(node.hash, current) : nodeHash(current, node.hash);
    });
    return current === root;
  }

  function applyAttack(params, honestEntries) {
    var presentedEntries = honestEntries.slice();
    var publicRoot = merkleRoot(honestEntries);
    var oldRoot = merkleRoot(honestEntries.slice(0, params.oldSize));
    var receiptRoot = publicRoot;
    var claimedEntry = honestEntries[params.leafIndex];
    var attackLabel = "honest log";
    if (params.attack === "tamper") {
      claimedEntry = claimedEntry.replace("|key=", "|key=evil-");
      attackLabel = "client-side receipt tamper";
    } else if (params.attack === "rewrite") {
      var rewriteIndex = Math.min(params.oldSize - 1, 1);
      presentedEntries[rewriteIndex] = presentedEntries[rewriteIndex] + "|retroactive-rewrite";
      claimedEntry = presentedEntries[params.leafIndex];
      receiptRoot = merkleRoot(presentedEntries);
      attackLabel = "rewritten old prefix";
    } else if (params.attack === "split") {
      presentedEntries[params.leafIndex] = presentedEntries[params.leafIndex] + "|split-view-key";
      claimedEntry = presentedEntries[params.leafIndex];
      receiptRoot = merkleRoot(presentedEntries);
      attackLabel = "split-view tree head";
    }
    return {
      attackLabel: attackLabel,
      claimedEntry: claimedEntry,
      honestEntries: honestEntries,
      oldRoot: oldRoot,
      presentedEntries: presentedEntries,
      publicRoot: publicRoot,
      receiptRoot: receiptRoot
    };
  }

  function byteCount(entries) {
    return entries.reduce(function (sum, entry) { return sum + entry.length; }, 0);
  }

  function buildPathRows(entry, path) {
    var rows = [{
      kind: "leaf",
      label: "leaf",
      hash: leafHash(entry),
      side: "self"
    }];
    path.forEach(function (node, index) {
      rows.push({
        kind: "proof",
        label: node.side + " sibling " + (index + 1),
        hash: node.hash,
        side: node.side
      });
    });
    return rows;
  }

  function simulate(raw) {
    var params = cleanParams(raw);
    var honestEntries = makeEntries(params.entryCount);
    var attacked = applyAttack(params, honestEntries);
    var path = inclusionPath(attacked.presentedEntries, params.leafIndex);
    var inclusionOk = verifyInclusion(attacked.claimedEntry, params.leafIndex, params.entryCount, attacked.receiptRoot, path);
    var currentPrefixRoot = merkleRoot(attacked.presentedEntries.slice(0, params.oldSize));
    var appendOnlyOk = currentPrefixRoot === attacked.oldRoot;
    var rootsMatch = attacked.receiptRoot === attacked.publicRoot;
    var proofBytes = path.length * 32;
    var fullLogBytes = byteCount(attacked.presentedEntries);
    var verdict = inclusionOk && appendOnlyOk && rootsMatch ? "receipt accepted" : "audit failed";
    if (inclusionOk && !appendOnlyOk) verdict = "append-only check rejects";
    if (inclusionOk && appendOnlyOk && !rootsMatch) verdict = "local proof accepts, gossip rejects";
    if (!inclusionOk) verdict = "inclusion proof rejects";
    return {
      appendOnlyOk: appendOnlyOk,
      attackLabel: attacked.attackLabel,
      claimedEntry: attacked.claimedEntry,
      currentPrefixRoot: currentPrefixRoot,
      fullLogBytes: fullLogBytes,
      inclusionOk: inclusionOk,
      oldRoot: attacked.oldRoot,
      params: params,
      path: path,
      pathRows: buildPathRows(attacked.claimedEntry, path),
      proofBytes: proofBytes,
      publicRoot: attacked.publicRoot,
      receiptRoot: attacked.receiptRoot,
      rootsMatch: rootsMatch,
      verdict: verdict
    };
  }

  function paramsFromRoot(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = input.value;
    });
    return params;
  }

  function formatBytes(value) {
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
    return value + " B";
  }

  function metric(label, value, tone) {
    var klass = "merkle-lab__metric";
    if (tone) klass += " merkle-lab__metric--" + tone;
    return '<div class="' + klass + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, box, title, subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(title, box.x + 14, box.y + 12);
    if (subtitle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(subtitle, box.x + 14, box.y + 31);
    }
  }

  function label(ctx, text, x, y, align, color, font) {
    ctx.fillStyle = color || COLORS.muted;
    ctx.font = font || "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/\s+/);
    var line = "";
    var lines = 0;
    for (var i = 0; i < words.length; i += 1) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = words[i];
        if (maxLines && lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines < maxLines)) ctx.fillText(line, x, y + lines * lineHeight);
  }

  function drawReceiptPanel(ctx, result, box) {
    panel(ctx, box, "Signed checkpoint", "a tree size plus one root hash");
    var rows = [
      ["public root", shortHash(result.publicRoot), COLORS.root],
      ["presented root", shortHash(result.receiptRoot), result.rootsMatch ? COLORS.good : COLORS.bad],
      ["old prefix root", shortHash(result.oldRoot), COLORS.warn],
      ["entry", "#" + result.params.leafIndex + " of " + result.params.entryCount, COLORS.leaf]
    ];
    rows.forEach(function (row, index) {
      var y = box.y + 66 + index * 34;
      label(ctx, row[0], box.x + 16, y, "left");
      label(ctx, row[1], box.x + box.w - 18, y, "right", row[2], "700 13px ui-monospace, SFMono-Regular, Menlo, monospace");
    });
    ctx.fillStyle = COLORS.text;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    wrapText(ctx, result.claimedEntry, box.x + 16, box.y + box.h - 48, box.w - 32, 13, 3);
  }

  function drawProofPanel(ctx, result, box) {
    panel(ctx, box, "Inclusion path", "one leaf plus logarithmic sibling hashes");
    var rows = result.pathRows.slice(0, 8);
    var start = box.y + 66;
    var rowH = Math.min(28, Math.max(20, (box.h - 92) / Math.max(1, rows.length)));
    rows.forEach(function (row, index) {
      var y = start + index * rowH;
      ctx.fillStyle = row.kind === "leaf" ? "rgba(15,118,110,0.08)" : "rgba(124,58,237,0.08)";
      ctx.strokeStyle = row.kind === "leaf" ? COLORS.leaf : COLORS.proof;
      drawRoundRect(ctx, box.x + 14, y - 11, box.w - 28, 21, 5);
      ctx.fill();
      ctx.stroke();
      label(ctx, row.label, box.x + 24, y, "left", COLORS.text);
      label(ctx, shortHash(row.hash), box.x + box.w - 24, y, "right", row.kind === "leaf" ? COLORS.leaf : COLORS.proof, "700 11px ui-monospace, SFMono-Regular, Menlo, monospace");
    });
    if (result.pathRows.length > rows.length) {
      label(ctx, "+" + (result.pathRows.length - rows.length) + " more nodes", box.x + box.w / 2, box.y + box.h - 18, "center");
    }
  }

  function drawAuditPanel(ctx, result, box) {
    panel(ctx, box, "Audit checks", result.attackLabel);
    var checks = [
      ["inclusion proof", result.inclusionOk],
      ["append-only prefix", result.appendOnlyOk],
      ["same public root", result.rootsMatch]
    ];
    checks.forEach(function (check, index) {
      var y = box.y + 72 + index * 44;
      ctx.fillStyle = check[1] ? "rgba(15,118,110,0.10)" : "rgba(190,18,60,0.10)";
      ctx.strokeStyle = check[1] ? COLORS.good : COLORS.bad;
      drawRoundRect(ctx, box.x + 16, y - 17, box.w - 32, 31, 6);
      ctx.fill();
      ctx.stroke();
      label(ctx, check[0], box.x + 28, y, "left", COLORS.text, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
      label(ctx, check[1] ? "pass" : "fail", box.x + box.w - 28, y, "right", check[1] ? COLORS.good : COLORS.bad, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
    });
    label(ctx, result.verdict, box.x + box.w / 2, box.y + box.h - 30, "center", result.inclusionOk && result.appendOnlyOk && result.rootsMatch ? COLORS.good : COLORS.bad, "700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif");
  }

  function drawCostPanel(ctx, result, box) {
    panel(ctx, box, "Why the tree matters", "proof size grows by height, not by log length");
    var left = box.x + 44;
    var bottom = box.y + box.h - 48;
    var width = box.w - 80;
    var maxEntries = 128;
    var maxNodes = Math.ceil(Math.log2(maxEntries));
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, box.y + 62);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left + width, bottom);
    ctx.stroke();
    ctx.strokeStyle = COLORS.proof;
    ctx.lineWidth = 2;
    ctx.beginPath();
    [4, 8, 16, 32, 64, 128].forEach(function (n, index) {
      var x = left + Math.log2(n / 4) / Math.log2(maxEntries / 4) * width;
      var y = bottom - Math.ceil(Math.log2(n)) / maxNodes * (bottom - box.y - 70);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      if (n === result.params.entryCount) {
        ctx.fillStyle = COLORS.proof;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.stroke();
    label(ctx, "entries", left + width, bottom + 15, "right");
    label(ctx, "proof nodes", left - 8, box.y + 65, "right");
    label(ctx, result.path.length + " nodes, " + formatBytes(result.proofBytes) + " at SHA-256 size", box.x + 16, box.y + box.h - 20, "left", COLORS.text);
  }

  function drawChart(canvas, result) {
    var ratio = global.devicePixelRatio || 1;
    var parentWidth = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 900;
    var cssWidth = Math.max(320, parentWidth);
    var compact = cssWidth < 620;
    var cssHeight = compact ? 960 : 620;
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    var margin = compact ? 14 : 20;
    if (compact) {
      var w = cssWidth - margin * 2;
      drawReceiptPanel(ctx, result, { x: margin, y: 16, w: w, h: 210 });
      drawProofPanel(ctx, result, { x: margin, y: 244, w: w, h: 238 });
      drawAuditPanel(ctx, result, { x: margin, y: 500, w: w, h: 210 });
      drawCostPanel(ctx, result, { x: margin, y: 728, w: w, h: 210 });
    } else {
      var gap = 18;
      var panelW = (cssWidth - margin * 2 - gap) / 2;
      drawReceiptPanel(ctx, result, { x: margin, y: 20, w: panelW, h: 270 });
      drawProofPanel(ctx, result, { x: margin + panelW + gap, y: 20, w: panelW, h: 270 });
      drawAuditPanel(ctx, result, { x: margin, y: 312, w: panelW, h: 270 });
      drawCostPanel(ctx, result, { x: margin + panelW + gap, y: 312, w: panelW, h: 270 });
    }
  }

  function render(root) {
    var result = simulate(paramsFromRoot(root));
    var maxLeaf = root.querySelector('[data-param="leafIndex"]');
    var maxOld = root.querySelector('[data-param="oldSize"]');
    if (maxLeaf) {
      maxLeaf.max = String(result.params.entryCount - 1);
      if (Number(maxLeaf.value) !== result.params.leafIndex) maxLeaf.value = String(result.params.leafIndex);
    }
    if (maxOld) {
      maxOld.max = String(result.params.entryCount);
      if (Number(maxOld.value) !== result.params.oldSize) maxOld.value = String(result.params.oldSize);
    }
    var values = {
      entryCount: String(result.params.entryCount),
      leafIndex: String(result.params.leafIndex),
      oldSize: String(result.params.oldSize)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("tree root", shortHash(result.receiptRoot), result.rootsMatch ? "good" : "bad"),
        metric("proof nodes", String(result.path.length)),
        metric("proof bytes", formatBytes(result.proofBytes)),
        metric("full log bytes", formatBytes(result.fullLogBytes)),
        metric("inclusion", result.inclusionOk ? "pass" : "fail", result.inclusionOk ? "good" : "bad"),
        metric("append-only", result.appendOnlyOk ? "pass" : "fail", result.appendOnlyOk ? "good" : "bad"),
        metric("root gossip", result.rootsMatch ? "match" : "mismatch", result.rootsMatch ? "good" : "bad"),
        metric("verdict", result.verdict, result.verdict === "receipt accepted" ? "good" : "bad")
      ].join("");
    }
    var canvas = root.querySelector("canvas[data-canvas]");
    if (canvas) drawChart(canvas, result);
  }

  function init(root) {
    var redraw = function () { render(root); };
    root.querySelectorAll("[data-param]").forEach(function (input) {
      input.addEventListener("input", redraw);
      input.addEventListener("change", redraw);
    });
    global.addEventListener("resize", redraw);
    redraw();
  }

  function initAll() {
    if (!global.document) return;
    Array.prototype.slice.call(global.document.querySelectorAll("[data-merkle-lab]")).forEach(init);
  }

  var api = {
    cleanParams: cleanParams,
    inclusionPath: inclusionPath,
    leafHash: leafHash,
    makeEntries: makeEntries,
    merkleRoot: merkleRoot,
    nodeHash: nodeHash,
    simulate: simulate,
    toyHash: toyHash,
    verifyInclusion: verifyInclusion
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.MerkleReceiptLab = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", initAll);
    else initAll();
  }
}(typeof window !== "undefined" ? window : globalThis));
