---
layout: post
title: "The Object Has More Than One Door"
description: "GFlowNets are easiest to misunderstand if you think they optimize for the single best object. Their stranger job is to sample objects in proportion to reward, without accidentally counting construction paths as extra evidence."
date: 2026-06-16 14:28:00 -0400
categories: machine-learning
tags: [gflownets, generative-models, active-learning, combinatorial-optimization, sampling, amortized-inference]
excerpt: "A molecule, set, graph, or program can often be built in many orders. If the sampler pays each construction path instead of each final object, the distribution is quietly wrong."
---

There is a kind of search problem where the single best answer is not enough.

Suppose you are designing a molecule, a peptide, a graph, a program sketch, or a
batch of experiments for an expensive lab. A score function tells you which
finished objects look promising. The usual optimization reflex says:

```text
find the maximum
```

But in a batch setting, one maximum can be a bad product. You may want a
portfolio of candidates: many high-scoring objects, spread across different
modes, so that one mistaken proxy model does not spend the entire budget on the
same fragile idea.

This is the promise that made GFlowNets interesting. They are not trained to
return the argmax. They are trained to sample terminal objects with probability
proportional to a positive reward:

$$
P(x) = \frac{R(x)}{Z},
\qquad
Z = \sum_x R(x).
$$

High-reward objects appear often. Lower-reward objects still appear sometimes.
The distribution, not the champion, is the object of learning.

That sounds almost too simple until you remember that a compositional object can
usually be built in more than one way.

## The Path Tax

Imagine the terminal object is a set:

```text
{A, B, C}
```

It has six construction orders:

```text
A -> B -> C
A -> C -> B
B -> A -> C
B -> C -> A
C -> A -> B
C -> B -> A
```

The set is one object. The trajectories are six histories.

If a generator samples ordered trajectories in proportion to the final reward
and then forgets the order, the induced object distribution is not
proportional to reward. It is proportional to reward times the number of doors
into the object:

$$
P_\text{ordered}(x)
\propto
R(x)\,N(x).
$$

For sets of size $$m$$, $$N(x)=m!$$. In graph generation, molecule generation,
program synthesis, and subset selection, the multiplicity can be much less tidy
than a factorial, but the danger is the same. Construction history can become a
hidden prior.

That is the path tax.

GFlowNets were built with this problem in view. The original NeurIPS paper
describes learning a stochastic policy over construction sequences so that the
finished object is sampled in proportion to reward, and explicitly calls out the
case where many action sequences lead to the same final state.[^bengio2021]
The later JMLR foundations paper develops the flow view more fully, including
detailed balance, marginalization, partition functions, and the connection to
amortized probabilistic inference over composite objects.[^foundations]

The mechanical idea is old-fashioned and beautiful: put flow on the directed
acyclic graph of partial objects.

## Conservation Is the Contract

Let $$s$$ be a partial object. Let $$F(s)$$ be the amount of flow through it.
For terminal states, the flow sent to the sink should equal the reward:

$$
F(s \to \text{stop}) = R(s).
$$

For intermediate states, the flow must conserve mass:

$$
F(s)
=
F(s \to \text{stop})
+
\sum_{s'} F(s \to s').
$$

Then the forward policy is just normalized outgoing flow:

$$
P_F(s' \mid s)
=
\frac{F(s \to s')}{F(s)}.
$$

If every terminal object had exactly one path, this would already be enough.
The interesting part is shared state. If a child state $$t$$ has several parents,
its incoming flow must be split among them according to a backward policy
$$P_B(s\mid t)$$:

$$
F(s \to t) = F(t)P_B(s\mid t).
$$

For unordered sets, the simplest backward policy removes one chosen element
uniformly. If $$t$$ has size $$|t|$$, then each parent receives

$$
\frac{F(t)}{|t|}.
$$

That single division is the small correction that keeps path multiplicity out of
the terminal distribution.

In the set-building lab below, the exact flow recursion is:

$$
F(S)
=
R(S)
+
\sum_{a\notin S}
\frac{F(S\cup\{a\})}{|S|+1}.
$$

The empty-set flow equals the partition function $$Z$$. If a terminal set has
size $$m$$, each of its $$m!$$ construction orders receives probability
$$R(x)/(m!Z)$$. Sum over the orders and the object receives probability
$$R(x)/Z$$.

That is the contract.

## A Browser-Sized Flow Network

The lab uses eight candidate ingredients. A terminal object is any nonempty set
up to a chosen maximum size. The reward surface has two clusters, a bridge
bonus, item qualities, and a size penalty.

There are three distributions on the same objects:

- **Target / exact GFlowNet:** terminal probability proportional to reward.
- **Ordered trajectory sampler:** terminal probability proportional to reward
  times the number of construction orders.
- **Max-only:** all mass on the single highest-reward object.

The exact GFlowNet is computed by dynamic programming over all set states. This
is not a neural training run; it is the small finite reference problem a trained
GFlowNet would be trying to approximate.

<style>
  .gfn-lab {
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

  .gfn-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    margin-bottom: 1rem;
  }

  .gfn-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .gfn-lab output {
    color: #172026;
    float: right;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }

  .gfn-lab input[type="range"] {
    accent-color: #0f766e;
    width: 100%;
  }

  .gfn-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    margin: 0.6rem 0 1rem;
  }

  .gfn-lab__metric {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-family: var(--font-ui);
    padding: 0.6rem 0.7rem;
  }

  .gfn-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.72rem;
    line-height: 1.15;
    text-transform: uppercase;
  }

  .gfn-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.3;
    margin-top: 0.18rem;
  }

  .gfn-lab canvas {
    background: #ffffff;
    border: 1px solid #eef2f5;
    display: block;
    height: auto;
    max-width: 100%;
  }

  .gfn-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.9rem;
    margin-top: 0.75rem;
  }

  .gfn-lab__legend span {
    align-items: center;
    color: #4b5563;
    display: inline-flex;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    gap: 0.35rem;
  }

  .gfn-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.7rem;
    width: 0.7rem;
  }

  .gfn-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
    margin: 0.85rem 0 0;
  }
</style>

<div class="gfn-lab" data-gfn-lab>
  <div class="gfn-lab__controls">
    <label>
      Max set size <output data-value="maxSize">5</output>
      <input type="range" data-param="maxSize" min="3" max="6" step="1" value="5">
    </label>
    <label>
      Reward sharpness <output data-value="sharpness">1.35</output>
      <input type="range" data-param="sharpness" min="0.4" max="2.4" step="0.05" value="1.35">
    </label>
    <label>
      Size penalty <output data-value="sizeCost">0.58</output>
      <input type="range" data-param="sizeCost" min="0.1" max="1.4" step="0.02" value="0.58">
    </label>
    <label>
      Synergy <output data-value="synergy">1.00</output>
      <input type="range" data-param="synergy" min="0" max="1.8" step="0.05" value="1">
    </label>
  </div>
  <div class="gfn-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="720" aria-label="GFlowNet path tax lab showing reward surface, target distribution, ordered trajectory bias, path tax by set size, and merging construction orders"></canvas>
  <div class="gfn-lab__legend">
    <span><i style="background:#2563eb"></i> Target / exact GFlowNet</span>
    <span><i style="background:#be123c"></i> Ordered trajectories</span>
    <span><i style="background:#0f766e"></i> Flow correction</span>
    <span><i style="background:#7c3aed"></i> Max-only object</span>
  </div>
  <p class="gfn-lab__note">
    Deterministic finite DAG. The audit in the exported JavaScript checks flow
    conservation, exact terminal-distribution agreement, and the ordered
    sampler's size bias over 27 parameter settings.
  </p>
</div>
<script defer src="{{ '/assets/js/gflownet-path-tax-lab.js?v=20260616a' | relative_url }}"></script>

With the default settings, the exact GFlowNet distribution has KL divergence
`3.7e-16` from the reward target, which is just floating-point noise. The
ordered-trajectory sampler has KL divergence `0.84` from the same target.

The average set size moves from `3.67` under the reward target to `4.69` under
the ordered sampler. The reason is not that larger sets are intrinsically
better. It is that size-five sets have `120` construction orders. A sampler that
counts histories has quietly changed the prior.

The max-only policy is the other failure mode. It finds `EFG`, the single
highest reward set in the default surface. That is useful if the product is one
candidate. It is not the same as sampling a diverse batch of high-reward
candidates.

## What Training Adds Back

The lab cheats in a productive way: it computes every state flow exactly.

Real GFlowNets do not get to tabulate every partial molecule, graph, program, or
sequence. They learn a parametric forward policy, often a backward policy, and
sometimes a normalizing constant estimate. The training objectives are different
ways to make the learned pieces satisfy the same global accounting.

The original flow-matching view uses local conservation constraints.[^bengio2021]
The foundations paper introduces detailed balance as a local edge condition,
analogous in spirit to detailed balance in MCMC.[^foundations] Malkin and
collaborators introduced trajectory balance, which puts the constraint on a
complete trajectory and improves long-horizon credit assignment in their
experiments.[^tb] Madan and collaborators later proposed subtrajectory balance,
explicitly framing objectives along a bias-variance tradeoff between local and
full-trajectory learning.[^subtb]

Those objectives are not cosmetic alternatives. They decide how reward signal
travels backward through a construction process whose terminal reward may be
sparse and delayed.

The active-learning applications are why this is worth the trouble. Biological
sequence design, for example, may have a proxy score, epistemic uncertainty,
limited wet-lab evaluations, and a need for batches that are both useful and
diverse. Jain and collaborators used GFlowNets in exactly that kind of loop and
reported more diverse and novel high-scoring batches than their baselines across
several biological sequence tasks.[^bio]

That does not make GFlowNets a universal search solvent. If the reward model is
wrong, sampling proportional to it faithfully samples the wrong thing. If
exploration fails, modes can be missed. If the construction space has awkward
symmetries, the backward policy and state representation matter. If the
application needs one certified optimum, a sampler is not a proof of optimality.

The point is narrower and cleaner:

```text
when the target is a distribution over objects,
do not let construction histories become the distribution
```

## What I Would Audit

For any serious GFlowNet-style system, I would want the report to separate five
things:

1. the reward definition and whether it is calibrated to the real objective;
2. the terminal object distribution, not just the best sampled object;
3. path multiplicity and other construction-order symmetries;
4. diversity across reward modes, not only pairwise novelty;
5. sensitivity to the backward policy, exploration policy, and off-policy data.

The third item is the quiet one. It is tempting to look only at terminal rewards.
But if an object can be reached through many doors, the sampler has to decide
whether those doors are evidence or just bookkeeping.

GFlowNets answer: bookkeeping.

The object should be paid for its reward, not for how many stories can be told
about how it was made.

## Works Cited

[^bengio2021]: Emmanuel Bengio, Moksh Jain, Maksym Korablyov, Doina Precup, and Yoshua Bengio, "Flow Network based Generative Models for Non-Iterative Diverse Candidate Generation," NeurIPS 2021. [NeurIPS](https://papers.nips.cc/paper_files/paper/2021/hash/e614f646836aaed9f89ce58e837e2310-Abstract.html), [arXiv](https://arxiv.org/abs/2106.04399).

[^foundations]: Yoshua Bengio, Salem Lahlou, Tristan Deleu, Edward J. Hu, Mo Tiwari, and Emmanuel Bengio, "GFlowNet Foundations," *Journal of Machine Learning Research* 24(210):1-55, 2023. [JMLR](https://jmlr.org/papers/v24/22-0364.html).

[^tb]: Nikolay Malkin, Moksh Jain, Emmanuel Bengio, Chen Sun, and Yoshua Bengio, "Trajectory Balance: Improved Credit Assignment in GFlowNets," NeurIPS 2022. [OpenReview](https://openreview.net/forum?id=5btWTw1vcw1), [arXiv](https://arxiv.org/abs/2201.13259).

[^subtb]: Kanika Madan, Jarrid Rector-Brooks, Maksym Korablyov, Emmanuel Bengio, Moksh Jain, Andrei Cristian Nica, Tom Bosc, Yoshua Bengio, and Nikolay Malkin, "Learning GFlowNets From Partial Episodes For Improved Convergence And Stability," ICML 2023. [PMLR](https://proceedings.mlr.press/v202/madan23a.html).

[^bio]: Moksh Jain, Emmanuel Bengio, Alex Hernandez-Garcia, Jarrid Rector-Brooks, Bonaventure F. P. Dossou, Chanakya Ajit Ekbote, Jie Fu, Tianyu Zhang, Michael Kilgour, Dinghuai Zhang, Lena Simine, Payel Das, and Yoshua Bengio, "Biological Sequence Design with GFlowNets," ICML 2022. [PMLR](https://proceedings.mlr.press/v162/jain22a.html).
