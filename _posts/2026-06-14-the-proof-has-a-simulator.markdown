---
layout: post
title: "One Transcript Can Be Fake"
description: "A zero-knowledge proof is not a magic blackout curtain. In a Sigma protocol, a fake transcript can look real, while two forked answers reveal the witness."
date: 2026-06-14 08:58:00 -0400
categories: computer-science
tags: [zero-knowledge, schnorr-protocol, sigma-protocols, cryptography, fiat-shamir, proofs-of-knowledge]
excerpt: "Schnorr identification is a tiny machine with three moods: honest proofs verify, simulated proofs reveal no witness, and forked proofs extract the secret."
---

Zero-knowledge is one of those phrases that arrives wearing stage fog.

It is not secrecy by vibes. It is not a promise that "nothing is visible." The
verifier sees messages. The verifier checks equations. The verifier is
convinced of something.

The claim is sharper:

```text
whatever the verifier sees could have been simulated without the witness
```

That is the sentence to hold onto.

Goldwasser, Micali, and Rackoff introduced zero-knowledge through the idea of
knowledge complexity: how much additional knowledge does a proof reveal beyond
the truth of the statement?[^gmr] The simulator is the formal pressure test.
If a transcript can be generated without the secret, then the transcript itself
is not evidence from which the secret was learned.

The smallest useful microscope for this idea is Schnorr's identification
protocol.[^schnorr] It proves knowledge of a discrete logarithm. In modern
language, it is a Sigma protocol: commit, challenge, respond.

Three messages. Three properties. A surprising amount of cryptography packed
into something you can still do on a napkin.

## The Claim on the Table

Work in a cyclic group of prime order $$q$$ with generator $$g$$. The prover
knows a secret

$$
x \in \mathbb{Z}_q
$$

and publishes

$$
y = g^x.
$$

The statement is:

```text
I know x such that y = g^x.
```

The prover should convince the verifier of this statement without sending
$$x$$.

Schnorr's interactive protocol is:

1. The prover samples a nonce $$r$$ and sends $$t=g^r$$.
2. The verifier samples a random challenge $$c$$.
3. The prover sends $$z=r+cx \pmod q$$.
4. The verifier checks

$$
g^z \stackrel{?}{=} t y^c.
$$

Completeness is the easy part:

$$
g^z = g^{r+cx} = g^r(g^x)^c = t y^c.
$$

An honest prover passes.

But zero-knowledge is not the same as passing.

## The Fake Transcript Is the Point

Here is the strange move. Suppose someone wants a transcript for a chosen
challenge $$c$$ but does not know $$x$$.

They can choose a random response $$z$$ first, then define

$$
t = g^z y^{-c}.
$$

Now the verifier's equation holds:

$$
t y^c = g^z y^{-c} y^c = g^z.
$$

This fake transcript passes the verifier's check. More importantly, under an
honest verifier that chooses $$c$$ uniformly, it has the same distribution as a
real transcript conditioned on that challenge. In a real run, $$r$$ is uniform,
so $$z=r+cx$$ is also uniform. The commitment is then forced by the same
equation.

That is honest-verifier zero knowledge. The transcript is not a confession. It
is something a simulator could have made after being told the challenge.

Sigma-protocol terminology packages this neatly:

- **completeness**: honest transcripts verify;
- **special honest-verifier zero knowledge**: accepting transcripts can be
  simulated for a given challenge;
- **special soundness**: two accepting transcripts with the same commitment and
  different challenges reveal a witness.

Damgard's notes on Sigma protocols make this simulator/extractor viewpoint
especially clean.[^sigma]

The next section is a toy lab for those three bullets.

## Put Schnorr on the Stand

The lab uses a very small prime-order subgroup:

```text
p = 1019, q = 509, g = 4
```

That is intentionally insecure. It is small enough that the numbers fit on the
screen and large enough to show the algebra. Do not use this code, group, hash,
or randomness for real cryptography.

The panels show four things:

1. an honest Schnorr transcript;
2. a simulated transcript that verifies without using the witness;
3. a fork extractor that recovers $$x$$ from two accepting answers to the same
   commitment;
4. the soundness curve as the challenge space and repetition count change.

<style>
  .schnorr-zk-lab {
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

  .schnorr-zk-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  }

  .schnorr-zk-lab__controls label {
    color: #46515c;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
    min-width: 0;
  }

  .schnorr-zk-lab__controls input {
    accent-color: #2563eb;
    box-sizing: border-box;
    margin: 0;
    min-width: 0;
    width: 100%;
  }

  .schnorr-zk-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
  }

  .schnorr-zk-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .schnorr-zk-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.62rem 0.7rem;
  }

  .schnorr-zk-lab__metric span,
  .schnorr-zk-lab__legend,
  .schnorr-zk-lab__note {
    color: #5d6872;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .schnorr-zk-lab__metric span {
    display: block;
  }

  .schnorr-zk-lab__metric strong {
    display: block;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .schnorr-zk-lab canvas {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: 700px;
    margin-top: 0.75rem;
    width: 100%;
  }

  .schnorr-zk-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 1rem;
    margin-top: 0.8rem;
  }

  .schnorr-zk-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .schnorr-zk-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .schnorr-zk-lab__note {
    margin: 0.65rem 0 0;
  }

  @media (max-width: 700px) {
    .schnorr-zk-lab {
      padding: 0.82rem;
    }

    .schnorr-zk-lab__controls,
    .schnorr-zk-lab__metrics {
      grid-template-columns: 1fr 1fr;
    }

    .schnorr-zk-lab canvas {
      height: 1060px;
    }
  }
</style>

<div class="schnorr-zk-lab" data-schnorr-zk-lab>
  <div class="schnorr-zk-lab__controls">
    <label>
      Secret x <output data-value="secret">137</output>
      <input type="range" min="1" max="508" step="1" value="137" data-param="secret">
    </label>
    <label>
      Nonce r <output data-value="nonce">123</output>
      <input type="range" min="0" max="508" step="1" value="123" data-param="nonce">
    </label>
    <label>
      Challenge bits <output data-value="challengeBits">3</output>
      <input type="range" min="1" max="7" step="1" value="3" data-param="challengeBits">
    </label>
    <label>
      Challenge c <output data-value="challenge">5</output>
      <input type="range" min="0" max="127" step="1" value="5" data-param="challenge">
    </label>
    <label>
      Repetitions <output data-value="repetitions">4</output>
      <input type="range" min="1" max="10" step="1" value="4" data-param="repetitions">
    </label>
    <label>
      Seed <output data-value="seed">29</output>
      <input type="range" min="1" max="999" step="1" value="29" data-param="seed">
    </label>
  </div>
  <div class="schnorr-zk-lab__metrics" data-metrics></div>
  <canvas data-canvas aria-label="Schnorr zero-knowledge protocol lab showing honest transcript, simulator transcript, fork extractor, and soundness curve"></canvas>
  <div class="schnorr-zk-lab__legend">
    <span><i style="background:#0f766e"></i> Prover values</span>
    <span><i style="background:#2563eb"></i> Verifier challenges</span>
    <span><i style="background:#7c3aed"></i> Simulator</span>
    <span><i style="background:#d97706"></i> Extractor</span>
  </div>
  <p class="schnorr-zk-lab__note">
    Educational toy only. The group is tiny, the hash is not cryptographic, and
    the challenge space is deliberately small so the probabilities are visible.
  </p>
</div>
<script defer src="{{ '/assets/js/schnorr-zk-lab.js?v=20260614a' | relative_url }}"></script>

In the default run, the toy group has `p = 1019`, `q = 509`, and `g = 4`; I
checked that `g` has order `509`. With `x = 137`, the public key is `y = 465`.
The honest transcript uses `t = 504`, `c = 5`, and `z = 299`, and it accepts.
The simulator, without using `x`, builds an accepting transcript with `t = 929`
and `z = 376`. The fork panel changes the challenge to `7`, gets `z = 64`, and
extracts `137` back out.

The default cheating experiment reports a one-round success rate of `12.13%`
against the `12.50%` theory for an eight-value challenge space. I also swept 576
parameter combinations across secrets, nonces, challenge sizes, challenges, and
repetition counts; every honest transcript, simulated transcript, forked
transcript, and extracted witness checked out.

Try these moves.

First, change **Secret x**. The public key changes. The honest transcript still
accepts, the simulator still accepts, and the extractor still recovers the new
witness.

Second, change **Nonce r**. The commitment changes. If the same nonce is reused
under two challenges, the fork panel recovers $$x$$. This is not a fake danger.
Nonce reuse is exactly the kind of arithmetic mistake that breaks Schnorr-like
signature systems.

Third, increase **Challenge bits** and **Repetitions**. A prover who does not
know $$x$$ can prepare a commitment for one challenge. If the verifier samples
from $$|\mathcal C|$$ possibilities, one round succeeds with probability
$$1/|\mathcal C|$$. Independent repetitions multiply the pain.

Fourth, move **Challenge c** beyond the current challenge space. The lab reduces
it into range. This is mundane UI plumbing, but it echoes a real implementation
requirement: challenge domains must be specified exactly.

## Two Futures Break Open the Secret

The simulator explains why the transcript does not leak the witness.

The extractor explains why the proof is still meaningful.

Suppose the same commitment $$t$$ has two accepting responses:

$$
g^{z_1}=t y^{c_1}
$$

and

$$
g^{z_2}=t y^{c_2},
$$

with $$c_1 \ne c_2$$. Divide the equations:

$$
g^{z_1-z_2}=y^{c_1-c_2}.
$$

Because $$y=g^x$$,

$$
g^{z_1-z_2}=g^{x(c_1-c_2)}.
$$

In a prime-order group, this gives

$$
x = (z_1-z_2)(c_1-c_2)^{-1} \pmod q.
$$

That is special soundness. If a prover can answer two different challenges for
the same commitment, the witness is hiding in the fork.

This is also why the simulator is not a cheating prover. The simulator can
create a transcript for a challenge it already knows. In the live protocol, the
prover sends $$t$$ before seeing $$c$$. The order of messages matters.

The proof is a little trapdoor in time: harmless when you see one future,
revealing when you see two.

## The Challenge Becomes a Hash

Interactive identification is useful, but signatures and many proof systems
need a non-interactive transcript. Fiat and Shamir's classic heuristic replaces
the verifier's random challenge with a hash of the public statement, the
commitment, and the message.[^fiat-shamir]

In cartoon form:

$$
c = H(y, t, m).
$$

Then the prover publishes $$(t,z)$$, and the verifier recomputes $$c$$ from the
same public data. The transcript is now tied to the message.

The word "heuristic" matters. Security arguments usually model the hash as a
random oracle, and real-world schemes need careful domain separation, group
validation, nonce generation, and exact serialization. The lab's toy hash is
not even trying to be cryptographic. It is there only to show the dependency:
change the message, and the challenge should change, invalidating the response
unless a collision happens inside the tiny toy challenge space.

Fiat-Shamir did not remove the challenge. It made the challenge reproducible.

## What the Word Does Not Promise

Zero-knowledge does not say:

```text
no equations are checked
no information is exchanged
no assumptions are needed
```

It says that the verifier's view can be reproduced without the witness, under
the conditions in the definition.

For the basic Schnorr protocol, the clean simulator above is honest-verifier
zero knowledge. A malicious verifier is a harder object; broader zero-knowledge
definitions quantify over verifier strategies, and many real protocols use
additional transformations or assumptions to get the exact security property
they need.

The proof-of-knowledge side has its own conditions. The extractor argument
assumes a forking ability: get two accepting answers to the same commitment
under different challenges. This is not something an ordinary verifier sees in
one live conversation. It is an analysis tool for explaining why a successful
prover must, in a precise sense, contain the witness.

That is the lovely tension:

```text
one transcript can be simulated
two forked transcripts can extract
```

A transcript is harmless enough to fake. A prover that can survive the wrong
future is carrying something real.

## Why This Toy Still Has Teeth

Modern zero-knowledge systems can look nothing like this little three-message
exchange. They involve polynomial commitments, arithmetization, low-degree
tests, elliptic curves, hash-based commitments, recursion, virtual machines,
and too many acronyms to fit comfortably in a paragraph.

Still, the simulator/extractor pair keeps showing up.

The simulator says what privacy means. The extractor says what knowledge means.
Fiat-Shamir says how a public challenge can be made non-interactive. Soundness
amplification says why tiny challenge games become serious after enough bits.

The lab is small because the idea is small enough to hold:

```text
the verifier checks an equation
the simulator can fake one view
the extractor breaks two views open
```

That is zero-knowledge with the fog removed.

[^gmr]: Shafi Goldwasser, Silvio Micali, and Charles Rackoff, ["The Knowledge Complexity of Interactive Proof Systems"](https://people.csail.mit.edu/silvio/Selected%20Scientific%20Papers/Proof%20Systems/The_Knowledge_Complexity_Of_Interactive_Proof_Systems.pdf), *SIAM Journal on Computing*, 1989.

[^schnorr]: Claus-Peter Schnorr, ["Efficient Identification and Signatures for Smart Cards"](https://scispace.com/pdf/efficient-identification-and-signatures-for-smart-cards-3pbmjgn3y4.pdf), CRYPTO 1989; related Journal of Cryptology version: ["Efficient signature generation by smart cards"](https://link.springer.com/article/10.1007/BF00196725), 1991.

[^sigma]: Ivan Damgard, ["On Sigma-Protocols"](https://www.cs.au.dk/~ivan/Sigma.pdf), lecture notes, 2010.

[^fiat-shamir]: Amos Fiat and Adi Shamir, ["How To Prove Yourself: Practical Solutions to Identification and Signature Problems"](https://mit6875.github.io/PAPERS/Fiat-Shamir.pdf), CRYPTO 1986.
