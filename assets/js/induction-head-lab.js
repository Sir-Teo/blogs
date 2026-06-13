(function () {
  var COLORS = {
    induction: "#0f766e",
    copy: "#b45309",
    unigram: "#5d6872",
    query: "#2563eb",
    attention: "#7c3aed",
    target: "#0b5f59",
    rule: "#d7dee5",
    text: "#172026",
    muted: "#5d6872"
  };

  var TOKENS = [
    "red", "moon", "fish", "lime", "bird", "ship", "rose", "dust",
    "ring", "wolf", "mint", "star", "lake", "fern", "gold", "rain",
    "coal", "wind", "clay", "moss", "byte", "node", "wave", "seed",
    "iron", "salt", "echo", "kite"
  ];

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

  function choice(rand, n) {
    return Math.floor(rand() * n);
  }

  function pickDifferent(rand, n, avoid) {
    var value = choice(rand, n - avoid.length);
    var sorted = avoid.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < sorted.length; i += 1) {
      if (value >= sorted[i]) value += 1;
    }
    return value;
  }

  function tokenName(id) {
    return TOKENS[id % TOKENS.length];
  }

  function tokenColor(id) {
    var hue = (id * 47) % 360;
    return "hsl(" + hue + " 65% 92%)";
  }

  function formatPercent(value) {
    return Math.round(value * 100) + "%";
  }

  function softmax(scores, temperature) {
    var temp = Math.max(0.05, temperature);
    var maxScore = Math.max.apply(null, scores);
    var exps = scores.map(function (score) { return Math.exp((score - maxScore) / temp); });
    var total = exps.reduce(function (sum, value) { return sum + value; }, 0);
    return exps.map(function (value) { return value / total; });
  }

  function makePrompt(params, trial) {
    var seed = 20260613
      + params.vocab * 13
      + params.length * 17
      + params.demos * 19
      + params.distractors * 23
      + trial * 7919;
    var rand = rng(seed);
    var vocab = params.vocab;
    var prefix = choice(rand, vocab);
    var current = pickDifferent(rand, vocab, [prefix]);
    var target = pickDifferent(rand, vocab, [prefix, current]);
    var distractorTarget = pickDifferent(rand, vocab, [prefix, current, target]);
    var length = params.length;
    var queryStart = length - 2;
    var seq = [];

    for (var i = 0; i < length; i += 1) seq.push(choice(rand, vocab));

    seq[queryStart] = prefix;
    seq[queryStart + 1] = current;

    var usable = [];
    for (var j = 1; j < queryStart - 1; j += 1) usable.push(j);

    function placeTriple(center, a, b, c) {
      seq[center - 1] = a;
      seq[center] = b;
      seq[center + 1] = c;
    }

    for (var d = 0; d < params.demos; d += 1) {
      if (!usable.length) break;
      var pick = choice(rand, usable.length);
      var center = usable.splice(pick, 1)[0];
      placeTriple(center, prefix, current, target);
      usable = usable.filter(function (pos) { return Math.abs(pos - center) > 2; });
    }

    for (var k = 0; k < params.distractors; k += 1) {
      if (!usable.length) break;
      var pickD = choice(rand, usable.length);
      var centerD = usable.splice(pickD, 1)[0];
      placeTriple(centerD, pickDifferent(rand, vocab, [prefix]), current, distractorTarget);
      usable = usable.filter(function (pos) { return Math.abs(pos - centerD) > 2; });
    }

    return {
      current: current,
      prefix: prefix,
      queryStart: queryStart,
      seq: seq,
      target: target,
      vocab: vocab
    };
  }

  function unigramPredict(prompt) {
    var counts = Array(prompt.vocab).fill(0);
    for (var i = 0; i < prompt.queryStart; i += 1) counts[prompt.seq[i]] += 1;
    var best = 0;
    for (var j = 1; j < counts.length; j += 1) {
      if (counts[j] > counts[best]) best = j;
    }
    return best;
  }

  function attentionPredict(prompt, params, usePrefix) {
    var candidates = [];
    var scores = [];
    var prefixWeight = usePrefix ? params.prefix / 100 : 0;
    for (var j = 1; j < prompt.queryStart - 1; j += 1) {
      var currentMatch = prompt.seq[j] === prompt.current ? 2.2 : -1.2;
      var prefixMatch = prompt.seq[j - 1] === prompt.prefix ? 2.0 : -1.0;
      var recency = 0.18 * j / prompt.queryStart;
      candidates.push(j);
      scores.push(currentMatch + prefixWeight * prefixMatch + recency);
    }

    var weights = softmax(scores, params.temperature / 100);
    var dist = Array(prompt.vocab).fill(0);
    var massOnRule = 0;
    var entropy = 0;
    var bestCandidate = candidates[0];
    var bestWeight = -Infinity;

    for (var i = 0; i < candidates.length; i += 1) {
      var position = candidates[i];
      var weight = weights[i];
      var value = prompt.seq[position + 1];
      dist[value] += weight;
      if (
        prompt.seq[position] === prompt.current
        && prompt.seq[position - 1] === prompt.prefix
        && prompt.seq[position + 1] === prompt.target
      ) {
        massOnRule += weight;
      }
      if (weight > bestWeight) {
        bestWeight = weight;
        bestCandidate = position;
      }
      entropy -= weight > 0 ? weight * Math.log(weight) : 0;
    }

    var prediction = 0;
    for (var d = 1; d < dist.length; d += 1) {
      if (dist[d] > dist[prediction]) prediction = d;
    }

    return {
      bestCandidate: bestCandidate,
      dist: dist,
      entropy: entropy / Math.log(Math.max(2, candidates.length)),
      massOnRule: massOnRule,
      prediction: prediction,
      positions: candidates,
      weights: weights
    };
  }

  function evaluate(params) {
    var trials = 240;
    var wins = { unigram: 0, copy: 0, induction: 0 };
    var mass = 0;
    var entropy = 0;

    for (var i = 0; i < trials; i += 1) {
      var prompt = makePrompt(params, i);
      var unigram = unigramPredict(prompt);
      var copy = attentionPredict(prompt, params, false);
      var induction = attentionPredict(prompt, params, true);
      if (unigram === prompt.target) wins.unigram += 1;
      if (copy.prediction === prompt.target) wins.copy += 1;
      if (induction.prediction === prompt.target) wins.induction += 1;
      mass += induction.massOnRule;
      entropy += induction.entropy;
    }

    var example = makePrompt(params, 999);
    var exampleCopy = attentionPredict(example, params, false);
    var exampleInduction = attentionPredict(example, params, true);

    return {
      accuracy: {
        unigram: wins.unigram / trials,
        copy: wins.copy / trials,
        induction: wins.induction / trials
      },
      attentionEntropy: entropy / trials,
      attentionMass: mass / trials,
      copy: exampleCopy,
      example: example,
      induction: exampleInduction
    };
  }

  function metric(label, value) {
    return '<div class="induction-lab__metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function drawToken(ctx, label, x, y, width, height, fill, stroke, textColor) {
    roundedRect(ctx, x, y, width, height, 6);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke || COLORS.rule;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = textColor || COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + width / 2, y + height / 2);
  }

  function drawChart(canvas, result) {
    var prompt = result.example;
    var induction = result.induction;
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
    var width = Math.max(320, parentWidth);
    var height = 520;
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

    var compact = width < 560;
    var left = compact ? 18 : 28;
    var right = compact ? 16 : 28;
    var tokenGap = 4;
    var columns = compact ? 8 : 12;
    var tokenWidth = (width - left - right - tokenGap * (columns - 1)) / columns;
    var tokenHeight = compact ? 24 : 28;
    var rowGap = 7;
    var startY = 42;
    var visible = prompt.seq.slice(Math.max(0, prompt.seq.length - (compact ? 32 : 48)));
    var offset = prompt.seq.length - visible.length;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("One generated prompt, ending in the query pair", left, 26);

    visible.forEach(function (token, index) {
      var absolute = offset + index;
      var col = index % columns;
      var row = Math.floor(index / columns);
      var x = left + col * (tokenWidth + tokenGap);
      var y = startY + row * (tokenHeight + rowGap);
      var isQuery = absolute === prompt.queryStart || absolute === prompt.queryStart + 1;
      var isBest = absolute === induction.bestCandidate || absolute === induction.bestCandidate + 1;
      var fill = isQuery ? "#dbeafe" : tokenColor(token);
      var stroke = isQuery ? COLORS.query : isBest ? COLORS.attention : COLORS.rule;
      drawToken(ctx, tokenName(token), x, y, tokenWidth, tokenHeight, fill, stroke, COLORS.text);
    });

    var tokenRows = Math.ceil(visible.length / columns);
    var attentionTop = startY + tokenRows * (tokenHeight + rowGap) + 26;
    var plotWidth = width - left - right;
    var attentionHeight = compact ? 82 : 98;

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Attention over earlier positions", left, attentionTop - 10);

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(left, attentionTop + attentionHeight);
    ctx.lineTo(width - right, attentionTop + attentionHeight);
    ctx.stroke();

    var bars = induction.positions.filter(function (position) { return position >= offset; });
    var maxWeight = Math.max.apply(null, induction.weights);
    bars.forEach(function (position) {
      var weight = induction.weights[induction.positions.indexOf(position)];
      var x = left + (position - offset) / Math.max(1, visible.length - 1) * plotWidth;
      var h = Math.max(1, weight / maxWeight * attentionHeight);
      var isRule = prompt.seq[position] === prompt.current
        && prompt.seq[position - 1] === prompt.prefix
        && prompt.seq[position + 1] === prompt.target;
      ctx.fillStyle = isRule ? COLORS.induction : COLORS.attention;
      ctx.globalAlpha = isRule ? 0.95 : 0.45;
      ctx.fillRect(x - 2, attentionTop + attentionHeight - h, 4, h);
      ctx.globalAlpha = 1;
    });

    var labelY = attentionTop + attentionHeight + 24;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Rule: " + tokenName(prompt.prefix) + " " + tokenName(prompt.current)
      + " -> " + tokenName(prompt.target),
      left,
      labelY
    );
    ctx.fillText(
      "Prediction: " + tokenName(induction.prediction)
      + "   copy-only: " + tokenName(result.copy.prediction),
      left,
      labelY + 20
    );

    var barTop = labelY + 58;
    var barHeight = 118;
    var labels = [
      { key: "unigram", label: "unigram", color: COLORS.unigram },
      { key: "copy", label: "copy current", color: COLORS.copy },
      { key: "induction", label: "induction", color: COLORS.induction }
    ];
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Accuracy over 240 generated prompts", left, barTop - 12);

    labels.forEach(function (item, index) {
      var rowY = barTop + index * 36;
      var value = result.accuracy[item.key];
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, left + 92, rowY + 11);
      ctx.fillStyle = "#edf2f7";
      ctx.fillRect(left + 104, rowY, plotWidth - 150, 22);
      ctx.fillStyle = item.color;
      ctx.fillRect(left + 104, rowY, (plotWidth - 150) * value, 22);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = "left";
      ctx.fillText(formatPercent(value), left + 112 + (plotWidth - 150) * value, rowY + 11);
    });
  }

  function render(root) {
    var params = {};
    root.querySelectorAll("input[data-param]").forEach(function (input) {
      params[input.getAttribute("data-param")] = Number(input.value);
    });

    var values = {
      vocab: String(params.vocab),
      length: String(params.length),
      demos: String(params.demos),
      distractors: String(params.distractors),
      prefix: params.prefix + "%",
      temperature: (params.temperature / 100).toFixed(2)
    };
    Object.keys(values).forEach(function (key) {
      var output = root.querySelector('[data-value="' + key + '"]');
      if (output) output.textContent = values[key];
    });

    var result = evaluate(params);
    var metrics = root.querySelector("[data-metrics]");
    if (metrics) {
      metrics.innerHTML = [
        metric("Induction accuracy", formatPercent(result.accuracy.induction)),
        metric("Copy-only accuracy", formatPercent(result.accuracy.copy)),
        metric("Unigram accuracy", formatPercent(result.accuracy.unigram)),
        metric("Mass on rule", formatPercent(result.attentionMass)),
        metric("Attention entropy", formatPercent(result.attentionEntropy)),
        metric("Example target", tokenName(result.example.target))
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
    document.querySelectorAll("[data-induction-lab]").forEach(init);
  });
}());
