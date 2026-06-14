---
layout: post
title: "Samplers Belong in the Model"
description: "Diffusion and flow-matching models do not end at the neural network. Their path, vector field, and numerical solver decide what distribution actually appears."
date: 2026-06-13 03:18:00 -0400
categories: machine-learning
tags: [flow-matching, diffusion-models, generative-modeling, numerical-analysis, optimal-transport]
excerpt: "A generative model trained as a continuous-time vector field still has to be sampled by a finite numerical method. Path geometry, coupling, solver order, and function evaluations are part of the model's behavior."
---

The first time diffusion models became obviously good, the story was usually
told as a denoising story.

Take data. Add noise until it becomes almost Gaussian. Train a neural network to
undo a small piece of that corruption. Start from noise and run the learned
reverse process. Out comes an image.

That story is correct enough to be useful. It is also a little too discrete. It
makes generation sound like a long chain of denoising blocks, when much of the
modern theory wants to talk about continuous motion: stochastic differential
equations, probability-flow ODEs, rectified flows, stochastic interpolants, and
flow matching. The language changes from "remove noise step by step" to "learn a
time-dependent vector field that transports one distribution into another."

That shift is powerful because it exposes a hidden engineering truth:

```text
the sampler is part of the model
```

Not just the network. Not just the training loss. The path between noise and
data, the curvature of that path, the time parameterization, the numerical
solver, the number of function evaluations, and the error tolerance are all part
of the distribution the user actually samples from.

This post builds a small flow-matching lab to make that tangible. It does not
train a neural net. It learns a two-dimensional vector field from paired samples
using kernel regression, then samples by integrating an ODE. That is small
enough to inspect, but real enough to show the same failure modes: bad coupling
creates tangled paths, too few solver steps bend the distribution, too much
smoothing erases modes, and too little smoothing creates a noisy vector field.

## Three Objects, Not One

Continuous-time generative models often hide three distinct design choices under
one word: "model."

First, there is a **probability path** $$p_t$$. At $$t=0$$ it is a simple base
distribution, usually Gaussian noise. At $$t=1$$ it is the data distribution.
In between, it describes how mass should move.

Second, there is a **velocity field** $$v_\theta(x,t)$$ or score field. This is
the object the neural network learns. If the learned velocity were exact, it
would satisfy an ODE like

$$
\frac{d x_t}{dt} = v_\theta(x_t,t).
$$

Third, there is a **solver**. A computer does not solve this ODE continuously.
It takes finite steps:

$$
x_{t+\Delta t} \approx x_t + \Delta t \, v_\theta(x_t,t)
$$

for Euler, or a more accurate predictor-corrector update for a higher-order
method such as Heun.

The distinction matters because these choices trade off against each other. A
curvy path needs more solver steps than a straight path. A noisy vector field
may need smaller steps or more stochastic correction. A solver that looks cheap
at four steps may be expensive if each step needs a larger network or extra
correction. A beautiful training objective can still produce bad samples if the
deployed sampler is too crude.

DDPMs showed that a learned reverse denoising chain can produce high-quality
images without adversarial training.[^ddpm] DDIM then made the sampler itself a
first-class object, showing that a non-Markovian process with the same training
objective could sample much faster than the original DDPM chain.[^ddim]
Score-based SDEs made the continuous-time view explicit, connecting reverse SDEs
and probability-flow ODEs under a common framework.[^score]

Karras et al.'s EDM paper is still one of the clearest warnings that the details
are not cosmetic. It separates noise schedule, network preconditioning,
parameterization, and sampler design, and reports strong results with far fewer
network evaluations than earlier diffusion samplers.[^edm] That is the shape of
the field: generation quality is not produced by a loss alone. It is produced by
the whole numerical pipeline.

## Flow Matching, in One Toy Equation

Flow matching asks for a velocity field directly. Instead of simulating a
diffusion during training, define a family of probability paths and regress the
vector field that generates them.[^flow]

The simplest toy version pairs a base sample $$x_0$$ with a target sample
$$x_1$$, then draws the straight interpolation

$$
x_t = (1-t)x_0 + t x_1.
$$

The target velocity along that line is just

$$
u_t = x_1 - x_0.
$$

If we had infinitely many paired examples, a model could learn the conditional
average velocity:

$$
v(x,t) = \mathbb{E}[x_1 - x_0 \mid x_t = x].
$$

The lab below approximates that conditional expectation with a Gaussian kernel.
For paired examples $$\{(x_0^i, x_1^i)\}_{i=1}^n$$, it computes

$$
\hat{v}(x,t)
=
\frac{
\sum_i K_h(x - x_t^i)(x_1^i - x_0^i)
}{
\sum_i K_h(x - x_t^i)
},
\quad
x_t^i=(1-t)x_0^i+t x_1^i.
$$

Then it samples by numerically integrating $$dx/dt=\hat{v}(x,t)$$ from fresh
Gaussian noise.

This is not a competitive generative model. It is a glass box. You can see the
training pairs, the vector field, the solver, and the resulting sample cloud.

<div class="flow-lab" data-flow-lab>
  <div class="flow-lab__controls">
    <label>
      Target
      <select data-param="target">
        <option value="modes">Four modes</option>
        <option value="ring">Two rings</option>
        <option value="moons">Two moons</option>
      </select>
    </label>
    <label>
      Coupling
      <select data-param="coupling">
        <option value="sorted">Angle-sorted</option>
        <option value="random">Random pairs</option>
      </select>
    </label>
    <label>
      Solver
      <select data-param="solver">
        <option value="heun">Heun</option>
        <option value="euler">Euler</option>
      </select>
    </label>
    <label>
      Steps: <output data-value="steps">24</output>
      <input type="range" min="3" max="72" step="1" value="24" data-param="steps">
    </label>
    <label>
      Kernel bandwidth: <output data-value="bandwidth">0.70</output>
      <input type="range" min="25" max="130" step="5" value="70" data-param="bandwidth">
    </label>
    <label>
      Training pairs: <output data-value="pairs">220</output>
      <input type="range" min="80" max="420" step="20" value="220" data-param="pairs">
    </label>
    <label>
      Particles: <output data-value="particles">120</output>
      <input type="range" min="50" max="220" step="10" value="120" data-param="particles">
    </label>
    <label>
      Field time: <output data-value="fieldTime">0.50</output>
      <input type="range" min="0" max="100" step="5" value="50" data-param="fieldTime">
    </label>
  </div>
  <div class="flow-lab__metrics" data-metrics></div>
  <canvas data-canvas width="800" height="560" aria-label="Flow matching toy simulator showing learned transport paths, vector field, and sampler metrics"></canvas>
  <div class="flow-lab__legend">
    <span><i style="background:#94a3b8"></i> Target samples</span>
    <span><i style="background:#0f766e"></i> Generated endpoints</span>
    <span><i style="background:#2563eb"></i> Sample paths</span>
    <span><i style="background:#7c3aed"></i> Learned velocity field</span>
  </div>
  <p class="flow-lab__note">
    Deterministic toy experiment. It learns a conditional velocity field with
    kernel regression from paired base and target samples, then integrates that
    field with Euler or Heun. Lower sliced W2 and nearest-target distance are
    better; path stretch near 1 means nearly straight trajectories.
  </p>
</div>
<script defer src="{{ '/assets/js/flow-matching-lab.js' | relative_url }}"></script>

Try the rude settings.

Switch from angle-sorted coupling to random pairs. The marginal target
distribution has not changed, but the transport problem did. The vector field is
now trying to average many arbitrary chords from the Gaussian cloud to the
target cloud. Some generated points still land near the data, but the paths get
longer and more tangled. The sampler paid for a bad coupling.

Lower the number of steps. With a very straight field, Euler can be surprisingly
good. With a curved or noisy field, it cuts corners. Heun spends two function
evaluations per step, but often needs fewer steps for the same visual quality.
The right unit is not "steps." It is network evaluations at a target error.

Move the kernel bandwidth. A tiny bandwidth memorizes local chords and creates a
rough field. A huge bandwidth averages incompatible velocities and washes out
structure. In a real neural model this slider becomes architecture, data,
regularization, conditioning, and training time. The failure is the same:
sampling quality is controlled by the smoothness and accuracy of the learned
field, not just by the endpoint distribution in the training story.

## Straightness Is a Computational Resource

Rectified flow makes a beautifully direct claim: learn an ODE whose trajectories
follow straight paths between samples from a base distribution and a target
distribution as much as possible.[^rectified] If the path is straight enough,
coarse Euler sampling can work well. The paper reports high-quality generation
even with very few Euler steps in some settings.

That claim is not merely aesthetic. It is numerical analysis.

Euler's local truncation error depends on how much the vector field changes
inside a step. If a path is nearly straight and the velocity is nearly constant,
one large step is not crazy. If the trajectory twists, crosses other streams, or
accelerates near the data manifold, a large step can jump to the wrong place.

This is why "straightness" belongs beside FID, likelihood, and wall-clock time.
It is not just a pretty visualization. It predicts how expensive sampling will
be after training.

Flow Matching for Generative Modeling makes this link explicit by supporting
different probability paths, including diffusion paths and optimal-transport
style displacement interpolation.[^flow] The 2024 Flow Matching guide frames
the area as a broad design space: paths, conditional objectives, solver choices,
and extensions across images, audio, video, biological structures, and discrete
domains.[^guide] Stochastic interpolants give a related unifying language for
bridging distributions with either deterministic probability flows or stochastic
dynamics.[^interpolants]

The common lesson is simple:

```text
path geometry decides sampler difficulty
```

A model that learns a hard path may still fit its training objective. It just
hands the bill to the sampler.

## Coupling Is Not an Implementation Detail

The toy lab has a coupling switch because pairing matters.

If $$x_0$$ and $$x_1$$ are paired independently, then the straight line between
them is an arbitrary chord between two distributions. The expected marginal
path can still be mathematically valid, but the induced vector field may average
incompatible directions. That averaging can create curved trajectories even
when every conditional training segment was straight.

If the pairs are more transport-like, the learned field tends to be smoother and
the paths shorter. The lab's angle-sorted coupling is a crude approximation,
not optimal transport. It is included only to make the qualitative point:
choosing which noise point corresponds to which data point changes the vector
field the model must learn.

This is why optimal-transport language keeps appearing in flow matching and
rectified-flow papers. It is not mathematical garnish. It is about making the
transport map easier to represent and cheaper to integrate.

There is an uncomfortable systems implication here. The user of a generator
sees only a sample and a latency number. But that latency number is downstream
of a training-time geometry choice:

$$
\text{coupling}
\rightarrow
\text{path curvature}
\rightarrow
\text{solver steps}
\rightarrow
\text{serving cost}.
$$

The cost did not appear at inference. It was encoded into the path.

## The Error Ledger

When a generated sample looks bad, "the model failed" is too coarse. At least
four errors can be hiding in the same artifact.

1. **Path error:** the chosen probability path is unnecessarily hard. It may
   twist through low-density regions or create crossings that require delicate
   averaging.
2. **Field error:** the learned vector field is wrong. It may be underfit,
   over-smoothed, poorly conditioned, or inaccurate near the data manifold.
3. **Solver error:** the field may be fine, but the finite integration steps are
   too large or the solver order is too low.
4. **Schedule error:** the same number of steps may be spent in the wrong places
   along time. Some intervals deserve more resolution than others.

The lab compresses these into a few sliders. Random coupling makes path error
louder. Bandwidth changes field error. Euler versus Heun and the step count
change solver error. Field time lets you inspect whether the vector field is
simple near the base, near the target, or only in the middle.

Real diffusion and flow systems add more layers: classifier-free guidance,
discrete schedulers, learned variance, prediction parameterization,
distillation, stochastic correctors, adaptive solvers, and hardware batching.
But the ledger remains useful. It prevents a common category mistake:

```text
judging a continuous-time model only by a discrete sampler's failure
```

or, just as dangerous:

```text
crediting the network for quality that came from an expensive sampler
```

Both happen.

## The Measurement List

For a serious generative-model report, I would like to see sampler diagnostics
next to sample-quality metrics.

Report quality as a curve over network function evaluations, not only at one
chosen sampler setting. Show whether the model degrades gracefully at low NFE or
falls off a cliff. Separate Euler, Heun, DPM-style solvers, and any stochastic
corrector rather than mixing them into one number.

Measure path straightness or kinetic cost on held-out noise-data pairs when a
pairing exists. If no natural pairing exists, estimate trajectory curvature
during sampling. A sampler that gets good images through violent trajectories is
still interesting, but it should not be described as cheap until the curve says
so.

Stress the time schedule. Allocate the same NFE uniformly, with common
hand-designed schedules, and with adaptive or learned schedules. If all the
error lives near $$t=0$$ or $$t=1$$, a uniform grid is a bad experimental
default.

Finally, report the failure modes under under-sampling. What happens at four
steps? Does the model blur, collapse modes, create artifacts, or preserve global
structure while losing texture? The low-step regime is not just a product
constraint. It is a microscope for the learned dynamics.

## A Small Research Direction

The direction I find most attractive is sampler-aware training without making
the training loop painfully expensive.

Flow matching is appealing partly because the regression target is local and
simulation-free. But deployment uses a small finite solver. The research problem
is to keep the simple training signal while shaping the vector field for the
sampler that will actually be used.

One possible objective family:

$$
\mathcal{L}
=
\mathbb{E}\|v_\theta(x_t,t)-u_t\|^2
+
\lambda_1 \mathbb{E}[\text{curvature}(x_t)]
+
\lambda_2 \mathbb{E}[\text{solver residual}_{\Delta t}]
+
\lambda_3 \mathbb{E}[\text{coverage loss at low NFE}].
$$

The trick is not to overfit to one brittle solver. The model should be easy to
sample, but not merely hacked to one step grid. This suggests reporting a
frontier: sample quality versus NFE across solver families and schedules.

In that view, the best model is not the one with the prettiest continuous story.
It is the one whose continuous story survives discretization.

The sampler is not an accessory. It is the final layer of the generative model.

## Reading Notes

[^ddpm]: Jonathan Ho, Ajay Jain, and Pieter Abbeel, "Denoising Diffusion Probabilistic Models," NeurIPS 2020. [arXiv](https://arxiv.org/abs/2006.11239).

[^ddim]: Jiaming Song, Chenlin Meng, and Stefano Ermon, "Denoising Diffusion Implicit Models," ICLR 2021. [arXiv](https://arxiv.org/abs/2010.02502).

[^score]: Yang Song, Jascha Sohl-Dickstein, Diederik P. Kingma, Abhishek Kumar, Stefano Ermon, and Ben Poole, "Score-Based Generative Modeling through Stochastic Differential Equations," ICLR 2021. [arXiv](https://arxiv.org/abs/2011.13456).

[^edm]: Tero Karras, Miika Aittala, Timo Aila, and Samuli Laine, "Elucidating the Design Space of Diffusion-Based Generative Models," NeurIPS 2022. [arXiv](https://arxiv.org/abs/2206.00364).

[^flow]: Yaron Lipman, Ricky T. Q. Chen, Heli Ben-Hamu, Maximilian Nickel, and Matt Le, "Flow Matching for Generative Modeling," ICLR 2023. [arXiv](https://arxiv.org/abs/2210.02747), [OpenReview](https://openreview.net/forum?id=PqvMRDCJT9t).

[^rectified]: Xingchao Liu, Chengyue Gong, and Qiang Liu, "Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow," ICLR 2023. [arXiv](https://arxiv.org/abs/2209.03003).

[^guide]: Yaron Lipman, Marton Havasi, Peter Holderrieth, Neta Shaul, Matt Le, Brian Karrer, Ricky T. Q. Chen, David Lopez-Paz, Heli Ben-Hamu, and Itai Gat, "Flow Matching Guide and Code," 2024. [arXiv](https://arxiv.org/abs/2412.06264).

[^interpolants]: Michael S. Albergo, Nicholas M. Boffi, and Eric Vanden-Eijnden, "Stochastic Interpolants: A Unifying Framework for Flows and Diffusions," 2023. [arXiv](https://arxiv.org/abs/2303.08797). See also Michael S. Albergo and Eric Vanden-Eijnden, "Building Normalizing Flows with Stochastic Interpolants," ICLR 2023. [arXiv](https://arxiv.org/abs/2209.15571).
