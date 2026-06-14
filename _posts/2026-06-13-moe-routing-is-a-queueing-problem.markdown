---
layout: post
title: "Every Expert Has a Line Outside"
description: "Sparse mixture-of-experts models promise cheap active compute, but the router is really allocating scarce expert capacity under bursty demand."
date: 2026-06-13 02:24:00 -0400
categories: ai-systems
tags: [mixture-of-experts, routing, transformers, queueing, load-balancing, inference]
excerpt: "A mixture-of-experts layer is not just a bag of specialists. It is a little dispatch desk inside the forward pass: tokens arrive, experts fill up, and the router decides who gets served."
---

The sales pitch for mixture-of-experts is beautifully simple. Keep the dense
model's per-token compute roughly fixed, replace some feed-forward blocks with
many expert blocks, and route each token through only one or two of them. The
model owns far more parameters than it spends on a given token. In the best
case, this buys capacity without paying dense-model cost.

That story is true enough to matter. Sparse-gated MoE layers made conditional
computation work at neural-network scale.[^shazeer] GShard used sparsely gated
experts and automatic sharding to train a multilingual translation model with
more than 600 billion parameters.[^gshard] Switch Transformer simplified the
router to top-1 selection and reported large pretraining speedups at the same
FLOPs per token.[^switch] GLaM and Mixtral later made the same bargain vivid:
large parameter count, much smaller active parameter count per token.[^glam],
[^mixtral]

But the bargain has a clause that is easy to under-read:

<div class="callout">
  <strong>Thesis:</strong> an MoE layer is a queueing system. Tokens arrive in
  bursts. Experts have finite capacity. The router is not merely choosing the
  "best" expert; it is doing admission control under load, noise, communication
  cost, and specialization pressure.
</div>

If the router sends too many tokens to the same expert, something has to give.
During training, implementations often cap expert buffers and drop or reroute
overflowing tokens. During serving, overload may show up as padding, all-to-all
communication, stragglers, expert replication, or a scheduler problem. Either
way, load balance is not a cosmetic auxiliary loss. It is part of the
conditional-computation contract.

The router is where the sparse model becomes a system. When I read an MoE
result now, I look for the line outside the expert, not just the expert.

## The Expert Is Also a Queue

In a dense transformer feed-forward block, every token uses the same parameters.
In a sparse MoE block, each token $$x$$ is sent to a small subset of experts:

$$
y(x) = \sum_{e \in S(x)} g_e(x) f_e(x),
\qquad
S(x) = \operatorname{TopK}(r(x)).
$$

Here $$r(x)$$ is the router score vector, $$S(x)$$ is the selected expert set,
$$g_e(x)$$ is the gate weight, and $$f_e$$ is expert $$e$$. If there are $$E$$
experts and only $$k$$ are active per token, the compute can be closer to a
$$k$$-expert model than an $$E$$-expert model.

The missing variable is the batch.

Suppose a batch contains $$B$$ tokens. A top-k router creates about $$kB$$ expert
assignments. If those assignments were perfectly balanced, each expert would see
$$kB/E$$ tokens. Real routers are not perfectly balanced. Some token types are
common. Some experts are attractive. Some router logits are noisy. Some
specialists become hot because the current batch is mostly code, math, or one
language family.

So practical MoE systems introduce an expert capacity. A common abstraction is:

$$
C = \left\lceil \alpha \frac{kB}{E} \right\rceil,
$$

where $$\alpha$$ is the capacity factor. Higher $$\alpha$$ gives the router more
room to be imbalanced, but it spends memory and compute on slack. Lower
$$\alpha$$ is efficient only if routing is balanced enough.

This turns a modeling problem into an allocation problem. The router maps tokens
to queues:

$$
N_e = \sum_{i=1}^{B} \mathbf{1}\{e \in S(x_i)\}.
$$

If $$N_e > C$$, the system either loses tokens, reroutes tokens, waits for a hot
expert, pads cold experts, or provisions more capacity than the average case
requires. The overloaded expert becomes the small bottleneck that disproves the
big scaling slogan.

## Two Ways the Router Lies

MoE routing has two objectives that are friendly in the abstract and hostile in
the details.

First, route tokens to useful experts. A math token should probably not be sent
to the expert that mostly learned HTML boilerplate. A multilingual model should
not wash away language-specific expertise merely because uniform traffic is easy
to schedule.

Second, keep the hardware fed evenly. An expert that receives no tokens does not
learn. An expert that receives too many tokens becomes a throughput bottleneck.
If the system caps capacity, hot experts silently become a quality problem:
tokens that wanted the hot expert get dropped or sent somewhere worse.

The original sparse MoE work used noisy top-k gating and auxiliary losses to
encourage balanced use.[^shazeer] GShard and Switch continued this line with
capacity factors, local dispatching, and simpler routers.[^gshard], [^switch]
Expert Choice routing flipped the assignment direction: instead of each token
choosing experts, each expert chooses tokens, which guarantees balanced expert
load while allowing tokens to receive a variable number of experts.[^expertchoice]

That flip is conceptually important. It reveals that "balanced experts" and
"every token gets its preferred expert" are different constraints. You can
guarantee one and still have work to do on the other.

## The Dispatch Ledger

The simulator below is deliberately not a neural network. It is the accounting
ledger inside one MoE layer:

- a batch of tokens, each with a latent type;
- a set of experts, each with specialties;
- noisy router scores between every token and expert;
- a finite capacity per expert;
- either token-choice top-k routing or expert-choice routing.

The batch score gives dropped tokens zero credit, so it is a quality-throughput
number rather than a pure accuracy number. The heatmap shows which token types
actually got served by which experts. The capacity sweep holds the synthetic
batch fixed and asks how much slack the selected routing policy needs before it
stops hurting itself.

<div class="moe-lab" data-moe-lab>
  <div class="moe-lab__controls">
    <label>
      Policy
      <select data-param="policy">
        <option value="token">Token-choice top-k</option>
        <option value="expert">Expert-choice</option>
      </select>
    </label>
    <label>
      Tokens: <output data-value="tokens">384</output>
      <input type="range" min="96" max="768" step="32" value="384" data-param="tokens">
    </label>
    <label>
      Experts: <output data-value="experts">8</output>
      <input type="range" min="4" max="12" step="1" value="8" data-param="experts">
    </label>
    <label>
      Top k: <output data-value="topK">2</output>
      <input type="range" min="1" max="2" step="1" value="2" data-param="topK">
    </label>
    <label>
      Capacity factor: <output data-value="capacity">1.15x</output>
      <input type="range" min="60" max="200" step="5" value="115" data-param="capacity">
    </label>
    <label>
      Demand skew: <output data-value="skew">55%</output>
      <input type="range" min="0" max="90" step="5" value="55" data-param="skew">
    </label>
    <label>
      Router noise: <output data-value="noise">28%</output>
      <input type="range" min="0" max="90" step="5" value="28" data-param="noise">
    </label>
    <label>
      Specialization: <output data-value="specialization">72%</output>
      <input type="range" min="20" max="100" step="4" value="72" data-param="specialization">
    </label>
    <label>
      Balance pressure: <output data-value="balance">30%</output>
      <input type="range" min="0" max="90" step="5" value="30" data-param="balance">
    </label>
  </div>
  <div class="moe-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="650" aria-label="Synthetic mixture-of-experts routing simulation"></canvas>
  <div class="moe-lab__legend">
    <span><i style="background:#0f766e"></i> Served or high score</span>
    <span><i style="background:#2563eb"></i> Load and multi-route budget</span>
    <span><i style="background:#be123c"></i> Saturated or unserved</span>
    <span><i style="background:#b45309"></i> Batch quality</span>
  </div>
  <p class="moe-lab__note">
    Deterministic toy model. It does not estimate any real model's accuracy;
    it isolates the dispatch arithmetic that every sparse MoE implementation
    has to solve somewhere.
  </p>
</div>
<script defer src="{{ '/assets/js/moe-routing-lab.js' | relative_url }}"></script>

Try a high demand-skew setting with token-choice routing and a low capacity
factor. The hot expert fills up. The load CV can look tolerable after the cap
because the queue is clipped, but the unserved-token count tells the real story.
The router did not become balanced by learning a better allocation; the
accounting system stopped accepting excess work.

Now switch to expert-choice. Expert loads become perfectly balanced by
construction. That is a real advantage. But the token-side problem changes:
some tokens receive no expert, while attractive tokens may receive several. The
system has solved expert capacity by allowing heterogeneous token treatment.
That may be exactly what you want, but it should be measured as a modeling
choice, not hidden inside a throughput number.

Finally, raise balance pressure in token-choice routing. The hot queue relaxes,
but quality can fall if the pressure forces tokens away from their strongest
specialists. This is the routing tradeoff in miniature:

$$
\text{specialization} \quad \text{versus} \quad \text{balanced service}.
$$

Dense models avoid this specific tradeoff by paying every expert for every
token. Sparse models make the tradeoff explicit.

## Flat Utilization Can Still Be Bad

It is tempting to log only expert utilization. A flat utilization chart feels
like health. But a router can be balanced and bad.

Hash routing is balanced if the hash is uniform, but it ignores context. Expert
choice can guarantee expert-side balance, but it can leave the coverage
distribution uneven across tokens. A strong auxiliary loss can prevent collapse,
but it can also fight specialization if it is stronger than the task signal.

The right diagnostic set has to see both sides of the market:

1. Expert load: how much work each expert receives.
2. Token coverage: how many experts each token receives.
3. Overflow: which token families are dropped, delayed, or rerouted.
4. Regret: how far routed experts are from the best available expert for that
   token type.
5. Stability: whether small router-logit perturbations cause large dispatch
   changes.
6. Locality: whether the routed experts live on devices that make communication
   cheap.
7. Sequence-level concentration: whether one sequence monopolizes a hot expert
   while the batch average looks fine.

The sequence-level point is easy to miss. If a batch contains many independent
prompts, imbalance may average out. If it contains a long burst of one mode,
such as code or a low-resource language, the router can produce a local traffic
jam even when global utilization looks fine. Sparse inference is not only a
model-size question. It is a traffic question.

DeepSpeed-MoE framed this systems problem directly: MoE models can reduce
training cost relative to dense alternatives, but inference introduces model
size, communication, and latency challenges that need specialized systems
work.[^deepspeed] ST-MoE is a reminder from the training side that router
stability and transfer behavior are not automatic side effects of adding
experts.[^stmoe]

## Capacity Factor Is a Cheat Code and a Bill

The capacity factor $$\alpha$$ is a nice parameter because it makes the tradeoff
visible. It is also dangerous because it can hide bad routing.

If $$\alpha$$ is high, the model can tolerate imbalanced routing. Tokens get
served, but the implementation carries slack capacity. If $$\alpha$$ is low,
the model is efficient only when the router is balanced. Lowering the capacity
factor is therefore not a pure systems optimization. It changes the statistical
pressure on the router.

There are two bad ways to win the metric:

- Use a high capacity factor and call the sparse layer efficient even though
  the tail expert load sets the real cost.
- Use a low capacity factor and report clean utilization while overflow quietly
  removes hard or common tokens.

A serious MoE report should show the capacity curve, not just one selected
point. The curve says whether the router is naturally balanced, whether it needs
slack, and which token families pay for the efficiency claim.

## Make the Router Queue-Aware

The research direction I find interesting is queue-aware routing as online
control. Instead of treating the router as a local classifier over experts,
make the state explicit:

$$
\pi(x_i, q, d, h) \rightarrow S_i,
$$

where $$q$$ is current expert queue state, $$d$$ is device topology, and $$h$$
is recent routing history. The router is then optimizing something closer to:

$$
\max_{\pi}
\quad
\mathbb{E}[\text{quality}(x, S)]
-
\lambda_1 \mathbb{E}[\text{overflow}]
-
\lambda_2 \mathbb{E}[\text{latency}]
-
\lambda_3 \mathbb{E}[\text{specialization collapse}].
$$

That objective is uglier than top-k gating. It is also closer to the deployed
system. The correct expert is not only a semantic object. It is a semantic
object sitting behind a queue, on a device, inside an all-to-all collective,
under a latency budget.

Some concrete experiments I would want before trusting a new MoE router:

1. Capacity-factor sweeps by token family, not just aggregate perplexity.
2. Burst tests: long homogeneous spans, multilingual shifts, code-heavy
   batches, and tool-call-heavy batches.
3. Token coverage histograms for expert-choice and hybrid routers.
4. Expert regret curves: how often load balancing sends tokens to materially
   worse experts.
5. Straggler-aware latency measurements with real device placement.
6. Router calibration under distribution shift.
7. Ablations that separate better routing from simply buying more slack.

This is where MoE becomes intellectually fun. It connects representation
learning, online matching, queueing, scheduling, and distributed systems. The
router is a small policy living inside a giant model. It deserves the same
seriousness we give the model weights.

## The Sentence I Would Keep

Mixture-of-experts is not just a way to stuff more parameters into a model. It
is a conditional-computation system with an allocator in the middle.

The allocator has to answer a hard question every forward pass:

> Which tokens get scarce expert capacity right now?

If the answer is balanced but semantically careless, the model wastes its
experts. If the answer is semantically sharp but load-blind, the system develops
hot queues, dropped tokens, or stragglers. If the answer depends on a capacity
factor nobody reports, the benchmark is not telling the whole story.

Sparse compute is real. But the unit that matters is not parameter count. It is
served, well-routed tokens per unit of time.

That is a queueing metric wearing a neural-network jacket.

## References

[^shazeer]: Noam Shazeer et al., ["Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer"](https://arxiv.org/abs/1701.06538), ICLR 2017.

[^gshard]: Dmitry Lepikhin et al., ["GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding"](https://arxiv.org/abs/2006.16668), ICLR 2021.

[^switch]: William Fedus, Barret Zoph, and Noam Shazeer, ["Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity"](https://arxiv.org/abs/2101.03961), JMLR 2022.

[^glam]: Nan Du et al., ["GLaM: Efficient Scaling of Language Models with Mixture-of-Experts"](https://arxiv.org/abs/2112.06905), 2021.

[^mixtral]: Albert Q. Jiang et al., ["Mixtral of Experts"](https://arxiv.org/abs/2401.04088), 2024.

[^expertchoice]: Yanqi Zhou et al., ["Mixture-of-Experts with Expert Choice Routing"](https://arxiv.org/abs/2202.09368), NeurIPS 2022.

[^deepspeed]: Samyam Rajbhandari et al., ["DeepSpeed-MoE: Advancing Mixture-of-Experts Inference and Training to Power Next-Generation AI Scale"](https://arxiv.org/abs/2201.05596), ICML 2022.

[^stmoe]: Barret Zoph et al., ["ST-MoE: Designing Stable and Transferable Sparse Expert Models"](https://arxiv.org/abs/2202.08906), 2022.
