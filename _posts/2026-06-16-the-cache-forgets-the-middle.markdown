---
layout: post
title: "The Cache Forgets the Middle"
description: "KV-cache eviction is a lossy attention policy. Sliding windows, attention sinks, heavy hitters, and observation-window voting each make a different prediction about which old tokens will matter."
date: 2026-06-16 18:18:00 -0400
categories: machine-learning
series: faster-llm-inference
tags: [kv-cache, llm-inference, attention-sinks, long-context, serving-systems, transformers]
excerpt: "A long-context model does not merely remember or forget. Under a KV-cache budget, it forgets by policy: recent tokens, first tokens, heavy hitters, or prompt positions that looked important before generation."
---

The last post about KV cache was an accounting note: every retained token leaves
keys and values in GPU memory. This one is about the crueler question.

When the cache is too small, which tokens get to keep existing?

Autoregressive attention is usually written as if the whole past is available:

$$
\operatorname{softmax}\left(q_t K_{<t}^{\top}/\sqrt{d}\right)V_{<t}.
$$

But a serving system with a bounded KV cache has to choose a subset $$S_t$$ of
old positions. The practical computation becomes closer to

$$
\operatorname{softmax}\left(q_t K_{S_t}^{\top}/\sqrt{d}\right)V_{S_t}.
$$

That subset is not an implementation detail. It is a memory policy. It is also
a bet about the future attention pattern.

The naive bet is:

```text
recent tokens are the useful tokens
```

That is often true. It is also dramatically incomplete.

In 2023, StreamingLLM made the failure mode unusually crisp. Plain window
attention keeps only the most recent keys and values. Xiao, Tian, Chen, Han, and
Lewis show that this can fail once the text length exceeds the cache size, and
that keeping a few initial tokens, called attention sinks, can recover much of
the behavior.[^streamingllm] Those first tokens may not be semantically useful.
They are structurally useful because many models put surprising attention mass
on them.

So the cache starts with a small embarrassment:

```text
the first token can be important even when it says nothing
```

## Eviction Is an Attention Approximation

Let $$a_{t,i}$$ be the full-cache attention mass from the current token $$t$$ to
an old token $$i$$. If a cache policy keeps subset $$S_t$$, then one crude
diagnostic is the retained mass

$$
R_t(S_t) = \sum_{i\in S_t} a_{t,i}.
$$

This is not a complete quality metric. Values can cancel. A token with small
attention can still matter if it carries a rare fact. Different heads and layers
serve different jobs. But retained attention mass is a useful first instrument:
if the policy repeatedly throws away the tokens that the full model would have
looked at, it is probably not a harmless memory optimization.

That framing explains three families of KV-cache policies.

**Sliding window.** Keep the most recent tokens. This is cheap, stable, and good
when attention is mostly local. It fails on old facts and attention sinks.

**Sink plus window.** Pin the first few positions and spend the rest of the
budget on recency. This is the StreamingLLM move: a small structural exception
to the recency rule.[^streamingllm]

**Heavy hitters plus recent tokens.** H2O observes that a small subset of tokens
contributes much of the attention value, and proposes a KV-cache eviction policy
that retains a balance of recent tokens and heavy hitters.[^h2o] This turns
eviction into an online scoring problem.

**Observation-window voting.** SnapKV attacks a related but different pain:
long prompts whose KV cache is already huge before generation begins. It finds
important prompt positions from an observation window near the end of the prompt
and keeps clustered important positions per head.[^snapkv] That is a
prompt-time prediction: before generation, ask what the prompt seems likely to
need.

These are not interchangeable tricks. They are different answers to:

```text
what evidence tells us an old key-value pair is still useful?
```

The lab below builds a small synthetic attention stream so those answers can be
compared without needing a real model checkpoint. It has:

1. first-token sink mass;
2. exponentially decaying recency mass;
3. old fact tokens that become relevant during generation;
4. a prompt observation window that can reveal future fact needs;
5. a fixed cache budget.

The policies are simplified versions of the ideas above. They are not
implementations of StreamingLLM, H2O, or SnapKV. The point is to expose the
shape of the tradeoff.

<style>
  .kv-evict-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    max-width: 100%;
    overflow: hidden;
    padding: 1rem;
  }

  .kv-evict-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    margin-bottom: 1rem;
  }

  .kv-evict-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .kv-evict-lab output {
    color: #172026;
    display: block;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    min-height: 1.2rem;
  }

  .kv-evict-lab input[type="range"],
  .kv-evict-lab select {
    accent-color: #0f766e;
    width: 100%;
  }

  .kv-evict-lab select {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    padding: 0.36rem 0.45rem;
  }

  .kv-evict-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .kv-evict-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .kv-evict-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .kv-evict-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .kv-evict-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .kv-evict-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .kv-evict-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .kv-evict-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .kv-evict-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="kv-evict-lab" data-kv-evict-lab>
  <div class="kv-evict-lab__controls">
    <label>
      Scenario <output data-value="scenario">streaming chat</output>
      <select data-param="scenario">
        <option value="0" selected>streaming chat</option>
        <option value="1">needle QA</option>
        <option value="2">topic drift</option>
        <option value="3">diffuse attention</option>
      </select>
    </label>
    <label>
      Cache budget <output data-value="budget">96</output>
      <input type="range" data-param="budget" min="24" max="180" step="4" value="96">
    </label>
    <label>
      Pinned sink tokens <output data-value="sinkKeep">4</output>
      <input type="range" data-param="sinkKeep" min="0" max="8" step="1" value="4">
    </label>
    <label>
      Topic pressure <output data-value="topicPressure">70%</output>
      <input type="range" data-param="topicPressure" min="0" max="100" step="5" value="70">
    </label>
    <label>
      Recency half-life <output data-value="halfLife">28</output>
      <input type="range" data-param="halfLife" min="8" max="80" step="2" value="28">
    </label>
    <label>
      View step <output data-value="viewStep">56</output>
      <input type="range" data-param="viewStep" min="0" max="100" step="1" value="56">
    </label>
    <label>
      Seed <output data-value="seed">17</output>
      <input type="range" data-param="seed" min="1" max="999" step="1" value="17">
    </label>
  </div>
  <div class="kv-evict-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="760" aria-label="KV cache eviction lab comparing sliding windows, attention sinks, heavy hitters, and observation-window voting"></canvas>
  <div class="kv-evict-lab__legend">
    <span><i style="background:#2563eb"></i> Sliding window</span>
    <span><i style="background:#0f766e"></i> Sink + window</span>
    <span><i style="background:#b45309"></i> Heavy + recent</span>
    <span><i style="background:#7c3aed"></i> Observation vote</span>
    <span><i style="background:#be123c"></i> Active old fact</span>
  </div>
  <p class="kv-evict-lab__note">
    Deterministic synthetic attention stream. The audit checks normalized
    attention, cache-budget invariants, bounded retained mass, sink-window
    recovery, heavy-hitter recovery, and observation-window fact retention.
  </p>
</div>
<script defer src="{{ '/assets/js/kv-eviction-lab.js?v=20260616a' | relative_url }}"></script>

The top-left panel is the retained attention mass over generated tokens. The
cache map shows what each policy still remembers at the selected step. Vertical
red marks are old facts; if the selected step is querying one, the active fact
is drawn more strongly. The lower-right panel shows the full attention
distribution in gray and the part retained by the observation-window policy in
purple.

Start with **streaming chat**. Sliding window does not keep the first tokens, so
it loses the sink mass. Sink plus window recovers that structural mass. Heavy
hitters and observation voting also keep old fact positions when the observation
window has revealed them.

Switch to **needle QA** and shrink the budget. Recency looks especially foolish:
the fact can be hundreds of tokens back, and no amount of recent-token loyalty
will resurrect it after eviction.

Switch to **diffuse attention**. Now the old facts are weaker. A policy that
spends budget on high-scoring old positions can lose average retained mass
relative to a boring sliding window. That is not a contradiction. It is the
point. A cache policy is a hypothesis about the attention distribution.

## Why the First Token Becomes Infrastructure

Attention sinks are strange because they are not just old facts.

StreamingLLM argues that initial tokens receive strong attention scores as a
sink even when they are not semantically important.[^streamingllm] In a pure
sliding window, those positions disappear. The model is then asked to operate
with a different attention substrate from the one it learned.

That suggests a useful distinction:

```text
semantic memory: tokens kept because their content may be needed
structural memory: tokens kept because the computation expects them
```

The first few tokens can be structural memory. A cited paragraph, function
definition, or financial figure is semantic memory. Recency can be either.

This is why "just keep the last 8k tokens" is too blunt. It treats all old
tokens as equally stale. But attention has roles, and some roles are not
monotone in position.

## Heavy Hitters Are Online Evidence

H2O's phrase "heavy hitter" is wonderfully concrete. If a small portion of
tokens receives most of the attention value, then eviction should not be blind
to that concentration.[^h2o]

The lab's heavy-hitter policy is intentionally simple:

```text
score each cached token by accumulated attention received
reserve some cache for recent tokens
evict low-score non-recent tokens first
```

The real H2O paper goes much further: it studies the emergence of heavy hitters,
relates them to co-occurrence, frames eviction as a dynamic submodular problem,
and validates on multiple model families and tasks.[^h2o] But the toy policy
already shows the central move. Eviction becomes measurement.

There is an important asymmetry here. Once a token is evicted, an ordinary
decode step cannot observe its future attention because the key is gone. So the
policy must preserve enough candidates to keep learning. That is why recent
tokens remain in the budget. They are not always important yet, but they need a
probation period.

In production terms:

```text
recency is exploration
heavy-hitter score is exploitation
```

## Prompt-Time Voting Is a Different Bet

SnapKV is motivated by a different setting: long prompts with much shorter
generation. Think document QA, long summarization, codebase questions, or annual
reports. The prompt itself can dominate KV memory before the model has generated
many tokens.

SnapKV observes that attention heads often focus on specific prompt features
during generation, and that these patterns can be obtained from an observation
window near the end of the prompt.[^snapkv] It then selects clustered important
KV positions for each head.

The lab's observation-vote policy is a cartoon version:

```text
look at the end-of-prompt observation window
score old prompt positions by attention from that window
keep the high-vote prompt positions plus a rolling recent window
```

When the observation window asks the same kind of question generation will
answer, this works well. When the task drifts, it can be stale. In the
**topic drift** scenario, dynamic heavy hitters can adjust during generation,
while a purely prompt-time vote is slower to adapt.

This is a good example of a broader serving pattern:

```text
prefill knows the prompt
decode learns the response
```

A cache policy can use one or both.

## Layer Budgets Are Another Axis

The lab pretends there is one attention layer and one cache budget. Real
transformers are not that tidy.

PyramidKV reports a "pyramidal information funneling" pattern: lower layers
scatter attention more widely, while higher layers consolidate onto critical
tokens such as attention sinks.[^pyramidkv] Its policy allocates different cache
sizes across layers rather than using one uniform budget.

That should not be surprising. If layers do different work, a uniform retention
rule is another hidden assumption. A token might be useful in lower-layer local
composition but irrelevant in higher-layer answer selection, or vice versa.

The cache policy is not one question. It is a stack of questions:

```text
which layer?
which head?
which prompt segment?
which generation phase?
which quality failure are we willing to risk?
```

## What This Lab Verifies

The JavaScript backing the figure is not a benchmark. It is a controlled toy
world with known attention mass. That lets the audit check the mechanics:

```text
every synthetic attention vector sums to one
attention weights are nonnegative
each policy obeys the cache budget at every step
retained attention mass stays between zero and one
sink+window beats sliding when sink mass is present
heavy hitters beat sliding in the fact-heavy setting
observation voting retains old facts in the needle setting
```

Those are small claims, but they are falsifiable. They keep the visualization
honest.

The larger claim is architectural:

```text
KV-cache compression is not just smaller storage.
It is an approximation to the model's future attention computation.
```

That is why good methods look like memory managers, online algorithms, and
model interpretability tools at the same time. They are deciding what the model
is still allowed to look at.

The cache does not forget uniformly. It forgets by policy.

[^streamingllm]: Guangxuan Xiao, Yuandong Tian, Beidi Chen, Song Han, and Mike Lewis, "Efficient Streaming Language Models with Attention Sinks," ICLR 2024. [arXiv](https://arxiv.org/abs/2309.17453).

[^h2o]: Zhenyu Zhang, Ying Sheng, Tianyi Zhou, Tianlong Chen, Lianmin Zheng, Ruisi Cai, Zhao Song, Yuandong Tian, Christopher Re, Clark Barrett, Zhangyang Wang, and Beidi Chen, "H2O: Heavy-Hitter Oracle for Efficient Generative Inference of Large Language Models," NeurIPS 2023. [arXiv](https://arxiv.org/abs/2306.14048).

[^snapkv]: Yuhong Li, Yingbing Huang, Bowen Yang, Bharat Venkitesh, Acyr Locatelli, Hanchen Ye, Tianle Cai, Patrick Lewis, and Deming Chen, "SnapKV: LLM Knows What You are Looking for Before Generation," NeurIPS 2024. [OpenReview](https://openreview.net/forum?id=poE54GOq2l).

[^pyramidkv]: Zefan Cai, Yichi Zhang, Bofei Gao, Yuliang Liu, Yucheng Li, Tianyu Liu, Keming Lu, Wayne Xiong, Yue Dong, Junjie Hu, and Wen Xiao, "PyramidKV: Dynamic KV Cache Compression based on Pyramidal Information Funneling," 2024. [arXiv](https://arxiv.org/abs/2406.02069).
