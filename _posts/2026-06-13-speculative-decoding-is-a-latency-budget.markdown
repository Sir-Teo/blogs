---
layout: post
title: "Draft Tokens Have to Earn Their Keep"
description: "Speculative decoding is often sold as free speed. The real question is whether accepted draft tokens repay the draft model, verifier overhead, and scheduler tax."
date: 2026-06-13 01:50:00 -0400
categories: ai-systems
series: faster-llm-inference
tags: [llm-inference, speculative-decoding, latency, serving-systems, transformers]
excerpt: "The useful unit is not tokens proposed. It is accepted tokens per expensive verifier call, priced against draft work and scheduler overhead."
---

An autoregressive language model has a very plain bottleneck: to emit 100
tokens, it usually needs 100 sequential trips through the large model. The next
token depends on the previous token, so decoding looks less like matrix
multiplication and more like waiting in line.

Speculative decoding changes the line.

A smaller system proposes a few future tokens. The large model checks those
tokens in one verifier pass. If the draft agrees with the large model, several
tokens are accepted at once. If it disagrees, the large model corrects the first
bad token and the loop starts again.

That sounds almost too good: ask a cheap model to guess, ask the expensive model
to audit, keep the distribution. The original speculative decoding paper by
Leviathan, Kalman, and Matias framed exactly this kind of acceleration for
transformer inference, reporting 2x to 3x acceleration on T5-XXL with identical
outputs in their implementation.[^leviathan] Chen, Borgeaud, Irving, Lespiau,
Sifre, and Jumper developed speculative sampling for large language models and
reported 2x to 2.5x speedups on Chinchilla while preserving the target
distribution within hardware numerics.[^chen]

The mechanism is beautiful. The production decision is a budget.

## Tokens Have to Pay Rent

Suppose a draft proposes $$m$$ tokens and each proposed token is independently
accepted with probability $$p$$. That independence assumption is fake, but it is
useful enough for a first instrument. The expected number of accepted draft
tokens before the first rejection is

$$
\mathbb{E}[\text{accepted}] = p + p^2 + \cdots + p^m.
$$

The verifier usually contributes one committed token even when the draft fails:
either the correction at the first rejected position, or the extra token after
all $$m$$ drafts are accepted. So a simple expected token yield per verifier call
is

$$
\mathbb{E}[\text{output tokens per verifier call}]
= 1 + p + p^2 + \cdots + p^m.
$$

This is the core line in the ledger. It says why "draft 8 tokens" is not the
same claim as "get 8 tokens." With $$p = 0.7$$ and $$m = 8$$, the expected
accepted draft length is about 2.2 tokens, not 5.6. Most of the tail is wishful
thinking.

Now price the cycle:

```text
cycle latency =
  serial draft work
+ large-model verifier work
+ verification overhead from longer candidate blocks
+ scheduler / launch / sampling overhead
```

Speculation helps only when the output tokens bought by the verifier call are
worth more than those costs.

<div class="spec-lab" data-spec-lab>
  <div class="spec-lab__controls">
    <label>
      Lookahead tokens: <output data-value="lookahead">5</output>
      <input type="range" min="1" max="12" value="5" data-param="lookahead">
    </label>
    <label>
      Draft acceptance: <output data-value="acceptance">74%</output>
      <input type="range" min="20" max="98" value="74" data-param="acceptance">
    </label>
    <label>
      Draft token cost: <output data-value="draftCost">12%</output>
      <input type="range" min="2" max="45" value="12" data-param="draftCost">
    </label>
    <label>
      Verifier tax per extra token: <output data-value="verifyTax">3%</output>
      <input type="range" min="0" max="14" value="3" data-param="verifyTax">
    </label>
    <label>
      Target step latency: <output data-value="targetMs">80 ms</output>
      <input type="range" min="20" max="240" step="5" value="80" data-param="targetMs">
    </label>
    <label>
      Scheduler overhead: <output data-value="overheadMs">6 ms</output>
      <input type="range" min="0" max="80" step="2" value="6" data-param="overheadMs">
    </label>
  </div>
  <div class="spec-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="520" aria-label="Speculative decoding latency budget showing speedup heatmap and cycle accounting"></canvas>
  <div class="spec-lab__legend">
    <span><i style="background:#0f766e"></i> Faster than baseline</span>
    <span><i style="background:#be123c"></i> Slower than baseline</span>
    <span><i style="background:#2563eb"></i> Draft work</span>
    <span><i style="background:#b45309"></i> Verifier work</span>
    <span><i style="background:#7c3aed"></i> Selected setting</span>
  </div>
  <p class="spec-lab__note">
    Deterministic latency model. It assumes one serial draft pass per proposed
    token, one parallel target verification pass, and independent draft
    acceptance. Real systems should replace these knobs with measured traces.
    The visible audit counter is produced by the shared lab script and checks
    both this latency ledger and the exact rejection-sampling lab in part two.
  </p>
</div>
<script defer src="{{ '/assets/js/speculative-decoding-lab.js?v=20260615a' | relative_url }}"></script>

The static-site audit runner checks both halves of the proofroom contract: the
exact rejection sampler and the visible latency ledger.

```bash
node - <<'NODE'
const lab = require("./assets/js/speculative-decoding-lab.js");
const EXPECTED_AUDIT = "20:20:0:1296:0.000000000000:0.000000000000";
const EXPECTED_EXACT = [
  "64:9:5:96:72:23:0",
  "0.924730:0.075270:0.000000000000:0.027900",
  "0.928236:3.462866:3.310345",
  "20:100:77:7:12:4.800000",
  "0.007951:0.009476:0.028915"
].join(":");
const EXPECTED_LEGACY = [
  "74:12:5:6:80:3",
  "2.214590:3.214590:48.000000:89.600000",
  "143.600000:44.671321:1.790858:2.785410",
  "4:1.819264"
].join(":");

function fixed(value, digits = 6) {
  return Number(value).toFixed(digits);
}

function legacyAccepted(probability, lookahead) {
  let total = 0;
  let power = probability;
  for (let index = 1; index <= lookahead; index += 1) {
    total += power;
    power *= probability;
  }
  return total;
}

function legacyEvaluate(params, lookahead = params.lookahead) {
  const accepted = legacyAccepted(params.acceptance / 100, lookahead);
  const outputTokens = 1 + accepted;
  const draftMs = lookahead * params.targetMs * params.draftCost / 100;
  const verifyMs = params.targetMs * (1 + (lookahead - 1) * params.verifyTax / 100);
  const cycleMs = draftMs + verifyMs + params.overheadMs;
  const msPerToken = cycleMs / outputTokens;
  return {
    accepted,
    cycleMs,
    draftMs,
    lookahead,
    msPerToken,
    outputTokens,
    speedup: params.targetMs / msPerToken,
    verifyMs,
    wastedDrafts: Math.max(0, lookahead - accepted)
  };
}

const audit = lab.runAudit();
const result = lab.evaluate({
  certainty: 64,
  draftCost: 9,
  gamma: 5,
  length: 96,
  match: 72,
  seed: 23
});
const auditShape = [
  audit.checked,
  audit.passed,
  audit.failures.length,
  audit.settings,
  fixed(audit.maxExactTv, 12),
  fixed(audit.maxAlphaGap, 12)
].join(":");
const exactShape = [
  result.params.certainty,
  result.params.draftCost,
  result.params.gamma,
  result.params.length,
  result.params.match,
  result.params.seed,
  result.state,
  fixed(result.contract.alpha),
  fixed(result.contract.draftTv),
  fixed(result.contract.exactTv, 12),
  fixed(result.contract.wrongTv),
  fixed(result.summaryAlpha),
  fixed(result.theoreticalSpeedup),
  fixed(result.trace.speedup),
  result.trace.targetCalls,
  result.trace.draftCalls,
  result.trace.acceptedDraft,
  result.trace.rejectedDraft,
  result.trace.bonusTokens,
  fixed(result.trace.tokensPerTargetCall),
  fixed(result.samples.specEmpiricalTv),
  fixed(result.samples.targetEmpiricalTv),
  fixed(result.samples.wrongEmpiricalTv)
].join(":");
const legacyParams = {
  acceptance: 74,
  draftCost: 12,
  lookahead: 5,
  overheadMs: 6,
  targetMs: 80,
  verifyTax: 3
};
const legacy = legacyEvaluate(legacyParams);
let bestLegacy = legacyEvaluate(legacyParams, 1);
for (let lookahead = 2; lookahead <= 12; lookahead += 1) {
  const candidate = legacyEvaluate(legacyParams, lookahead);
  if (candidate.speedup > bestLegacy.speedup) bestLegacy = candidate;
}
const legacyShape = [
  legacyParams.acceptance,
  legacyParams.draftCost,
  legacyParams.lookahead,
  legacyParams.overheadMs,
  legacyParams.targetMs,
  legacyParams.verifyTax,
  fixed(legacy.accepted),
  fixed(legacy.outputTokens),
  fixed(legacy.draftMs),
  fixed(legacy.verifyMs),
  fixed(legacy.cycleMs),
  fixed(legacy.msPerToken),
  fixed(legacy.speedup),
  fixed(legacy.wastedDrafts),
  bestLegacy.lookahead,
  fixed(bestLegacy.speedup)
].join(":");

if (
  auditShape !== EXPECTED_AUDIT ||
  exactShape !== EXPECTED_EXACT ||
  legacyShape !== EXPECTED_LEGACY
) {
  throw new Error(JSON.stringify({ auditShape, exactShape, legacyShape }, null, 2));
}

console.log(`${audit.passed}/${audit.checked} speculative decoding checks passed`);
NODE
```

Read the heatmap horizontally. More lookahead is useful until the rejected tail
and verifier overhead eat the benefit. Read it vertically. Acceptance quality is
not a cosmetic metric; it decides whether speculation is acceleration or
expensive theater. The purple outline is the current slider setting.

## The Mean Hides the Queue

The expectation above hides two production facts.

First, acceptance is contextual. Code completion, repetitive agent traces, and
formulaic templates often have long easy stretches. Open-ended writing, high
temperature sampling, tool boundaries, and rare-domain tokens may be much less
draftable. A static lookahead length spends the same budget in both regimes.
Mamou, Pereg, Korat, Berchansky, Timor, Wasserblat, and Schwartz studied this
directly: they argue that fixed speculation lookahead is suboptimal and propose
dynamic speculation lookahead, reporting a 10% average speedup over the best
static baseline while generating the same text.[^mamou]

Second, latency and throughput are not the same objective. Speculation can reduce
inter-token latency under low or medium query load, especially when target-model
decoding is memory-bound. But it may also add draft-model work, larger verifier
batches, extra key-value cache pressure, and more scheduling complexity. The
current vLLM documentation makes this split explicit: it presents speculative
decoding as a way to reduce inter-token latency for medium-to-low QPS,
memory-bound workloads, and notes that real gains depend on model family,
traffic, hardware, and sampling settings.[^vllm]

A good benchmark therefore needs at least two views:

- time-to-first-token and inter-token latency for a single request;
- serving throughput and tail latency at the traffic level where the cluster
  actually runs.

The first can look wonderful while the second quietly gets worse.

## Exactness Is the Contract

The strongest version of speculative decoding is not "the draft is probably
right." It is "the final samples follow the same distribution as the target
decoder." That is why the rejection sampler matters. The draft can be wrong
often; the verifier and acceptance rule are what preserve the target behavior.

This distinction matters in product language. A draft model is not a smaller
replacement model. It is a proposal mechanism. If the target verifier is removed,
the method is no longer speculative decoding in the exact sense. It is model
distillation, approximation, routing, or a different product with a different
quality contract.

Even exact methods have implementation caveats. vLLM describes speculative
decoding as theoretically lossless up to hardware numerical precision, validates
greedy equality and rejection-sampler convergence, and still warns that floating
point, batch size, and log-probability stability can create variations in
practice.[^vllm-lossless] Hugging Face's assisted decoding documentation gives
the same draft-and-verify picture and notes practical constraints such as using a
significantly smaller assistant model and, for its standard speculative decoding
path, the same tokenizer.[^hf]

The right mental model is not "free speed." It is "a contract whose assumptions
must survive the serving stack."

## Buying Futures in Batches

Once the basic idea exists, there are several ways to spend the budget.

SpecInfer organizes draft predictions as a token tree and verifies candidate
sequences in parallel, reporting 1.5x to 2.8x speedups for distributed inference
and 2.6x to 3.5x for offloading-based inference in its evaluation.[^specinfer]
Medusa avoids maintaining a separate draft model by adding multiple decoding
heads to the model and using tree-based attention to verify candidate
continuations; its paper reports over 2.2x for Medusa-1 and 2.3x to 3.6x for
Medusa-2 in their experiments.[^medusa]

Those methods differ architecturally, but the accounting is the same:

```text
How many target-model steps did we avoid?
How much extra work did we add?
How often did proposed futures survive contact with the verifier?
What happened to the tail of the serving distribution?
```

The most interesting research direction is not merely better average acceptance.
It is budget-aware speculation: choose the draft depth, tree shape, and proposer
based on local uncertainty, hardware pressure, and queue state. A request in an
empty queue can afford a different speculative shape than a request arriving
during a latency incident. A code block can afford a different shape than a
poem. A greedy decode can afford a different contract than high-temperature
sampling.

Autoregressive decoding used to mean one future at a time. Speculative decoding
lets the system buy several futures, inspect them in parallel, and keep only the
ones the target model would have chosen. The engineering question is not whether
guessing is clever. It is whether the guesses clear the ledger.

## Sources Worth Keeping

[^leviathan]: Yaniv Leviathan, Matan Kalman, and Yossi Matias, "Fast Inference from Transformers via Speculative Decoding," ICML 2023. [arXiv](https://arxiv.org/abs/2211.17192).

[^chen]: Charlie Chen, Sebastian Borgeaud, Geoffrey Irving, Jean-Baptiste Lespiau, Laurent Sifre, and John Jumper, "Accelerating Large Language Model Decoding with Speculative Sampling," 2023. [arXiv](https://arxiv.org/abs/2302.01318).

[^mamou]: Jonathan Mamou, Oren Pereg, Daniel Korat, Moshe Berchansky, Nadav Timor, Moshe Wasserblat, and Roy Schwartz, "Dynamic Speculation Lookahead Accelerates Speculative Decoding of Large Language Models," 2024. [arXiv](https://arxiv.org/abs/2405.04304).

[^vllm]: vLLM documentation, "Speculative Decoding," accessed June 13, 2026. [Docs](https://docs.vllm.ai/en/stable/features/speculative_decoding/).

[^vllm-lossless]: vLLM documentation, "Lossless guarantees of Speculative Decoding," accessed June 13, 2026. [Docs](https://docs.vllm.ai/en/stable/features/speculative_decoding/#lossless-guarantees-of-speculative-decoding).

[^hf]: Hugging Face Transformers documentation, "Assisted decoding," accessed June 13, 2026. [Docs](https://huggingface.co/docs/transformers/en/assisted_decoding).

[^specinfer]: Xupeng Miao et al., "SpecInfer: Accelerating Generative Large Language Model Serving with Tree-based Speculative Inference and Verification," ASPLOS 2024. [arXiv](https://arxiv.org/abs/2305.09781).

[^medusa]: Tianle Cai, Yuhong Li, Zhengyang Geng, Hongwu Peng, Jason D. Lee, Deming Chen, and Tri Dao, "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads," 2024. [arXiv](https://arxiv.org/abs/2401.10774).
