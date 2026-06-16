(function () {
  "use strict";

  var ITEMS = [
    { id: "A", x: 0.15, y: 0.24, group: "red", quality: 0.82 },
    { id: "B", x: 0.29, y: 0.35, group: "red", quality: 0.76 },
    { id: "C", x: 0.18, y: 0.58, group: "red", quality: 0.68 },
    { id: "D", x: 0.48, y: 0.22, group: "bridge", quality: 0.62 },
    { id: "E", x: 0.72, y: 0.36, group: "blue", quality: 0.80 },
    { id: "F", x: 0.85, y: 0.23, group: "blue", quality: 0.73 },
    { id: "G", x: 0.77, y: 0.60, group: "blue", quality: 0.69 },
    { id: "H", x: 0.50, y: 0.76, group: "bridge", quality: 0.64 }
  ];

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    faint: "#eef2f5",
    target: "#2563eb",
    gfn: "#0f766e",
    ordered: "#be123c",
    maxOnly: "#7c3aed",
    red: "#dc4668",
    blue: "#2d72d9",
    bridge: "#b7791f",
    fill: "#f8fafc"
  };

  var FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function bitCount(mask) {
    var n = 0;
    while (mask) {
      mask &= mask - 1;
      n += 1;
    }
    return n;
  }

  function has(mask, index) {
    return (mask & (1 << index)) !== 0;
  }

  function maskName(mask) {
    if (!mask) return "empty";
    var out = [];
    for (var i = 0; i < ITEMS.length; i += 1) {
      if (has(mask, i)) out.push(ITEMS[i].id);
    }
    return out.join("");
  }

  function enumerateMasks(maxSize) {
    var masks = [];
    var limit = 1 << ITEMS.length;
    for (var mask = 0; mask < limit; mask += 1) {
      if (bitCount(mask) <= maxSize) masks.push(mask);
    }
    return masks;
  }

  function scoreMask(mask, params) {
    var size = bitCount(mask);
    if (size === 0) return 0;

    var quality = 0;
    var red = 0;
    var blue = 0;
    var bridge = 0;
    for (var i = 0; i < ITEMS.length; i += 1) {
      if (!has(mask, i)) continue;
      quality += ITEMS[i].quality;
      if (ITEMS[i].group === "red") red += 1;
      if (ITEMS[i].group === "blue") blue += 1;
      if (ITEMS[i].group === "bridge") bridge += 1;
    }

    var redPairs = red * Math.max(0, red - 1) / 2;
    var bluePairs = blue * Math.max(0, blue - 1) / 2;
    var bridgeBonus = bridge > 0 && red > 0 && blue > 0 ? 1.25 : 0;
    var raw = 0.42 * quality +
      params.synergy * (0.48 * redPairs + 0.52 * bluePairs + 0.42 * bridgeBonus) -
      params.sizeCost * Math.pow(Math.max(0, size - 2), 1.28) -
      0.18 * Math.max(0, size - 5);
    return Math.exp(params.sharpness * raw);
  }

  function terminalReward(mask, params) {
    if (bitCount(mask) === 0 || bitCount(mask) > params.maxSize) return 0;
    return scoreMask(mask, params);
  }

  function paramsWithDefaults(input) {
    var params = {
      maxSize: 5,
      sharpness: 1.35,
      sizeCost: 0.58,
      synergy: 1.0
    };
    if (input) {
      Object.keys(input).forEach(function (key) {
        params[key] = input[key];
      });
    }
    params.maxSize = Math.round(clamp(params.maxSize, 3, 6));
    params.sharpness = clamp(params.sharpness, 0.4, 2.4);
    params.sizeCost = clamp(params.sizeCost, 0.1, 1.4);
    params.synergy = clamp(params.synergy, 0, 1.8);
    return params;
  }

  function compute(paramsInput) {
    var params = paramsWithDefaults(paramsInput);
    var masks = enumerateMasks(params.maxSize);
    var rewards = {};
    var flow = {};
    var orderedFlow = {};
    var target = {};
    var ordered = {};
    var gfn = {};
    var bySize = {};
    var z = 0;
    var zOrdered = 0;
    var maxMask = 0;
    var maxReward = -Infinity;

    masks.forEach(function (mask) {
      var r = terminalReward(mask, params);
      rewards[mask] = r;
      if (r > 0) {
        z += r;
        zOrdered += r * FACT[bitCount(mask)];
        if (r > maxReward) {
          maxReward = r;
          maxMask = mask;
        }
      }
    });

    masks.slice().sort(function (a, b) {
      return bitCount(b) - bitCount(a);
    }).forEach(function (mask) {
      var size = bitCount(mask);
      var f = rewards[mask] || 0;
      var h = rewards[mask] || 0;
      if (size < params.maxSize) {
        for (var i = 0; i < ITEMS.length; i += 1) {
          if (has(mask, i)) continue;
          var child = mask | (1 << i);
          if (bitCount(child) <= params.maxSize) {
            f += (flow[child] || 0) / bitCount(child);
            h += orderedFlow[child] || 0;
          }
        }
      }
      flow[mask] = f;
      orderedFlow[mask] = h;
    });

    masks.forEach(function (mask) {
      var size = bitCount(mask);
      if (rewards[mask] > 0) {
        target[mask] = rewards[mask] / z;
        ordered[mask] = rewards[mask] * FACT[size] / zOrdered;
      } else {
        target[mask] = 0;
        ordered[mask] = 0;
      }
      gfn[mask] = 0;
      if (!bySize[size]) bySize[size] = { target: 0, ordered: 0, reward: 0, count: 0 };
      bySize[size].target += target[mask];
      bySize[size].ordered += ordered[mask];
      bySize[size].reward += rewards[mask] || 0;
      bySize[size].count += rewards[mask] > 0 ? 1 : 0;
    });

    enumeratePolicy(0, 1, params, flow, rewards, "gfn", gfn);

    return {
      bySize: bySize,
      flow: flow,
      gfn: gfn,
      maxMask: maxMask,
      maxReward: maxReward,
      masks: masks,
      ordered: ordered,
      orderedFlow: orderedFlow,
      params: params,
      rewards: rewards,
      target: target,
      z: z,
      zOrdered: zOrdered
    };
  }

  function enumeratePolicy(mask, probability, params, flow, rewards, mode, out) {
    var f = flow[mask] || 0;
    if (f <= 0) return;
    var r = rewards[mask] || 0;
    if (r > 0) {
      out[mask] = (out[mask] || 0) + probability * r / f;
    }
    if (bitCount(mask) >= params.maxSize) return;
    for (var i = 0; i < ITEMS.length; i += 1) {
      if (has(mask, i)) continue;
      var child = mask | (1 << i);
      var edge = mode === "gfn" ? (flow[child] || 0) / bitCount(child) : (flow[child] || 0);
      if (edge > 0) enumeratePolicy(child, probability * edge / f, params, flow, rewards, mode, out);
    }
  }

  function entropy(dist, masks) {
    return masks.reduce(function (sum, mask) {
      var p = dist[mask] || 0;
      return p > 0 ? sum - p * Math.log(p) : sum;
    }, 0);
  }

  function kl(p, q, masks) {
    return masks.reduce(function (sum, mask) {
      var a = p[mask] || 0;
      var b = q[mask] || 0;
      return a > 0 ? sum + a * Math.log(a / Math.max(1e-15, b)) : sum;
    }, 0);
  }

  function avgSize(dist, masks) {
    return masks.reduce(function (sum, mask) {
      return sum + (dist[mask] || 0) * bitCount(mask);
    }, 0);
  }

  function topMasks(result, n) {
    return result.masks.filter(function (mask) {
      return result.rewards[mask] > 0;
    }).sort(function (a, b) {
      return (result.target[b] || 0) - (result.target[a] || 0);
    }).slice(0, n);
  }

  function formatPercent(value, digits) {
    return (100 * value).toFixed(digits == null ? 1 : digits) + "%";
  }

  function formatNumber(value, digits) {
    return value.toFixed(digits == null ? 2 : digits);
  }

  function metric(label, value) {
    return '<div class="gfn-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function panel(ctx, box, title, subtitle) {
    ctx.strokeStyle = COLORS.rule;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(title, box.x, box.y - 12);
    if (subtitle) {
      var titleW = ctx.measureText(title).width;
      var subW = ctx.measureText(subtitle).width;
      if (titleW + subW + 24 < box.w) {
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(subtitle, box.x + box.w, box.y - 12);
      }
    }
  }

  function drawItems(ctx, result, box) {
    panel(ctx, box, "Reward surface", "items and best object");
    ctx.fillStyle = COLORS.fill;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    var top = result.maxMask;

    ITEMS.forEach(function (item, index) {
      var x = box.x + item.x * box.w;
      var y = box.y + item.y * box.h;
      var color = COLORS[item.group];
      ctx.beginPath();
      ctx.arc(x, y, has(top, index) ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = has(top, index) ? color : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = has(top, index) ? 3 : 2;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = has(top, index) ? "#ffffff" : color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.id, x, y);
    });

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("max-only: " + maskName(top), box.x + 10, box.y + box.h - 44);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("reward " + formatNumber(result.maxReward, 2), box.x + 10, box.y + box.h - 25);
  }

  function drawDistribution(ctx, result, box) {
    panel(ctx, box, "Object distribution", "top target states");
    var masks = topMasks(result, 14);
    var maxP = masks.reduce(function (m, mask) {
      return Math.max(m, result.target[mask], result.ordered[mask]);
    }, 1e-6);
    var rowH = box.h / masks.length;
    var labelW = 46;
    var barW = box.w - labelW - 10;
    masks.forEach(function (mask, index) {
      var y = box.y + index * rowH + 2;
      var h = Math.max(3, rowH - 5);
      ctx.fillStyle = COLORS.faint;
      ctx.fillRect(box.x + labelW, y, barW, h);
      ctx.fillStyle = COLORS.target;
      ctx.fillRect(box.x + labelW, y, barW * result.target[mask] / maxP, h * 0.44);
      ctx.fillStyle = COLORS.ordered;
      ctx.fillRect(box.x + labelW, y + h * 0.52, barW * result.ordered[mask] / maxP, h * 0.44);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(maskName(mask), box.x + labelW - 7, y + h / 2);
    });
  }

  function drawPathTax(ctx, result, box) {
    panel(ctx, box, "Path tax", "ordered sampler sees m! paths");
    var sizes = Object.keys(result.bySize).map(Number).filter(function (size) {
      return size > 0 && result.bySize[size].count > 0;
    });
    var maxMass = sizes.reduce(function (m, size) {
      return Math.max(m, result.bySize[size].target, result.bySize[size].ordered);
    }, 1e-6);
    var gap = 8;
    var groupW = (box.w - gap * (sizes.length - 1)) / sizes.length;
    sizes.forEach(function (size, index) {
      var x = box.x + index * (groupW + gap);
      var targetH = result.bySize[size].target / maxMass * (box.h - 35);
      var orderedH = result.bySize[size].ordered / maxMass * (box.h - 35);
      ctx.fillStyle = COLORS.target;
      ctx.fillRect(x + groupW * 0.16, box.y + box.h - 24 - targetH, groupW * 0.26, targetH);
      ctx.fillStyle = COLORS.ordered;
      ctx.fillRect(x + groupW * 0.58, box.y + box.h - 24 - orderedH, groupW * 0.26, orderedH);
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(size), x + groupW / 2, box.y + box.h - 18);
      ctx.fillText(size + "!", x + groupW / 2, box.y + 8);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText("set size", box.x + box.w - 4, box.y + box.h - 5);
  }

  function drawFlowLedger(ctx, result, box) {
    var top = result.maxMask;
    var ids = [];
    for (var i = 0; i < ITEMS.length; i += 1) {
      if (has(top, i)) ids.push(i);
      if (ids.length === 3) break;
    }
    if (ids.length < 3) {
      ids = [0, 1, 2];
    }
    var a = ids[0];
    var b = ids[1];
    var c = ids[2];
    var ab = (1 << a) | (1 << b);
    var ac = (1 << a) | (1 << c);
    var bc = (1 << b) | (1 << c);
    var abc = (1 << a) | (1 << b) | (1 << c);
    panel(ctx, box, "Merging construction orders", "backward policy splits child flow");
    var nodes = [
      { mask: 0, x: 0.08, y: 0.50 },
      { mask: 1 << a, x: 0.30, y: 0.18 },
      { mask: 1 << b, x: 0.30, y: 0.50 },
      { mask: 1 << c, x: 0.30, y: 0.82 },
      { mask: ab, x: 0.58, y: 0.28 },
      { mask: ac, x: 0.58, y: 0.50 },
      { mask: bc, x: 0.58, y: 0.72 },
      { mask: abc, x: 0.86, y: 0.50 }
    ];
    var byMask = {};
    nodes.forEach(function (node) { byMask[node.mask] = node; });
    [
      [0, 1 << a], [0, 1 << b], [0, 1 << c],
      [1 << a, ab], [1 << b, ab],
      [1 << a, ac], [1 << c, ac],
      [1 << b, bc], [1 << c, bc],
      [ab, abc], [ac, abc], [bc, abc]
    ].forEach(function (edge) {
      drawEdge(ctx, box, byMask[edge[0]], byMask[edge[1]]);
    });
    nodes.forEach(function (node) {
      drawNode(ctx, box, node, node.mask === abc ? COLORS.gfn : COLORS.fill);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("edge to child of size k carries F(child)/k", box.x + box.w / 2, box.y + box.h - 26);
  }

  function drawEdge(ctx, box, from, to) {
    var x1 = box.x + from.x * box.w;
    var y1 = box.y + from.y * box.h;
    var x2 = box.x + to.x * box.w;
    var y2 = box.y + to.y * box.h;
    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(x1 + 22, y1);
    ctx.lineTo(x2 - 22, y2);
    ctx.stroke();
  }

  function drawNode(ctx, box, node, fill) {
    var x = box.x + node.x * box.w;
    var y = box.y + node.y * box.h;
    ctx.fillStyle = fill;
    ctx.strokeStyle = node.mask ? COLORS.rule : COLORS.muted;
    roundRect(ctx, x - 24, y - 13, 48, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fill === COLORS.gfn ? "#ffffff" : COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(maskName(node.mask), x, y);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawChart(canvas, result) {
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 820;
    var width = Math.max(320, parentWidth);
    var compact = width < 570;
    var height = compact ? 980 : 720;
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

    var left = compact ? 46 : 52;
    var right = compact ? 16 : 22;
    var plotW = width - left - right;
    if (compact) {
      drawItems(ctx, result, { x: left, y: 42, w: plotW, h: 190 });
      drawDistribution(ctx, result, { x: left, y: 300, w: plotW, h: 260 });
      drawPathTax(ctx, result, { x: left, y: 630, w: plotW, h: 150 });
      drawFlowLedger(ctx, result, { x: left, y: 846, w: plotW, h: 100 });
    } else {
      drawItems(ctx, result, { x: left, y: 48, w: plotW * 0.38, h: 245 });
      drawDistribution(ctx, result, { x: left + plotW * 0.46, y: 48, w: plotW * 0.54, h: 245 });
      drawPathTax(ctx, result, { x: left, y: 385, w: plotW * 0.38, h: 190 });
      drawFlowLedger(ctx, result, { x: left + plotW * 0.46, y: 380, w: plotW * 0.54, h: 200 });
    }
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("[data-param]").forEach(function (input) {
      var key = input.getAttribute("data-param");
      var value = Number(input.value);
      if (Number.isFinite(value)) params[key] = value;
    });
    var result = compute(params);
    var masks = result.masks;
    var metrics = root.querySelector("[data-metrics]");
    var canvas = root.querySelector("[data-canvas]");
    var targetEff = Math.exp(entropy(result.target, masks));
    var orderedEff = Math.exp(entropy(result.ordered, masks));
    var gfnErr = Math.max(0, kl(result.target, result.gfn, masks));
    var orderedErr = kl(result.target, result.ordered, masks);
    var targetSize = avgSize(result.target, masks);
    var orderedSize = avgSize(result.ordered, masks);

    root.querySelectorAll("[data-value]").forEach(function (output) {
      var key = output.getAttribute("data-value");
      if (key === "maxSize") output.textContent = String(result.params.maxSize);
      if (key === "sharpness") output.textContent = result.params.sharpness.toFixed(2);
      if (key === "sizeCost") output.textContent = result.params.sizeCost.toFixed(2);
      if (key === "synergy") output.textContent = result.params.synergy.toFixed(2);
    });

    metrics.innerHTML = [
      metric("target support", formatNumber(targetEff, 1) + " sets"),
      metric("ordered support", formatNumber(orderedEff, 1) + " sets"),
      metric("GFN KL", gfnErr.toExponential(1)),
      metric("ordered KL", formatNumber(orderedErr, 2)),
      metric("avg size target", formatNumber(targetSize, 2)),
      metric("avg size ordered", formatNumber(orderedSize, 2))
    ].join("");
    drawChart(canvas, result);
  }

  function init() {
    var labs = Array.prototype.slice.call(document.querySelectorAll("[data-gfn-lab]"));
    labs.forEach(function (root) {
      var frame = null;
      function requestRender() {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          frame = null;
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

  function audit() {
    var passed = 0;
    var total = 0;
    [0.4, 0.58, 0.85].forEach(function (sizeCost) {
      [0.6, 1.0, 1.4].forEach(function (synergy) {
        [3, 4, 5].forEach(function (maxSize) {
          var result = compute({ sizeCost: sizeCost, synergy: synergy, maxSize: maxSize });
          result.masks.forEach(function (mask) {
            total += 1;
            var rhs = result.rewards[mask] || 0;
            if (bitCount(mask) < result.params.maxSize) {
              for (var i = 0; i < ITEMS.length; i += 1) {
                if (!has(mask, i)) {
                  var child = mask | (1 << i);
                  if (bitCount(child) <= result.params.maxSize) rhs += (result.flow[child] || 0) / bitCount(child);
                }
              }
            }
            if (Math.abs((result.flow[mask] || 0) - rhs) < 1e-9) passed += 1;
          });
          var maxErr = result.masks.reduce(function (m, mask) {
            return Math.max(m, Math.abs((result.gfn[mask] || 0) - (result.target[mask] || 0)));
          }, 0);
          total += 1;
          if (maxErr < 1e-10) passed += 1;
          total += 1;
          if (avgSize(result.ordered, result.masks) >= avgSize(result.target, result.masks) - 1e-9) passed += 1;
        });
      });
    });
    return { passed: passed, total: total };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      audit: audit,
      bitCount: bitCount,
      compute: compute,
      maskName: maskName,
      paramsWithDefaults: paramsWithDefaults
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
}());
