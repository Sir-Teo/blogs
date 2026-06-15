---
layout: post
title: "Two Thirds Is Not a Vibe"
description: "Byzantine quorum certificates work because two possible histories are forced to share an honest voter, not because 67% has mystical distributed-systems power."
date: 2026-06-14 23:08:00 -0400
categories: data-systems
series: distributed-systems
tags: [byzantine-fault-tolerance, consensus, pbft, hotstuff, tendermint, quorums, distributed-systems]
excerpt: "A quorum certificate is a witness budget. Safety needs two certificates to overlap in more voters than the adversary can make lie."
---

The phrase "two-thirds majority" sounds political.

In Byzantine consensus it is arithmetic with a knife edge.

A quorum certificate says: enough replicas signed this value that no conflicting
value can also collect enough signatures without making at least one honest
replica sign twice. That is the entire trick hiding under a large amount of
protocol machinery.

<div class="callout">
  <strong>Thesis:</strong> the BFT quorum number is not about vibes, democracy,
  or a round-looking fraction. It is the unique place where safety overlap and
  liveness availability can both fit when up to \(f\) replicas may equivocate.
</div>

The classic Byzantine Generals line is older than blockchains, older than PBFT,
and older than the current fashion for quorum certificates. Lamport, Shostak,
and Pease framed the problem as agreement in the presence of traitors.[^byz]
Dwork, Lynch, and Stockmeyer later put consensus in the partial-synchrony
world: safety must survive bad timing, while termination waits for the network
to behave eventually.[^dls]

Modern protocols have different shapes. PBFT uses pre-prepare, prepare, commit,
and view-change logic.[^pbft] Tendermint uses prevotes, precommits, locks, and
gossip.[^tendermint] HotStuff reorganizes the same family of ideas around
quorum certificates and a chained commit rule with linear communication during
leader changes.[^hotstuff]

But the small arithmetic object is shared:

```text
a certificate is only useful if a conflicting certificate cannot be built
from the same fault budget
```

## Two Certificates Must Collide

Imagine \(n\) replicas. A certificate needs \(q\) votes.

Two different leaders try to certify two conflicting blocks, red and blue. The
smallest possible intersection between any two sets of size \(q\) is

$$
\max(0, 2q - n).
$$

That formula is just the pigeonhole principle. If the red certificate and blue
certificate together contain \(2q\) vote slots, but there are only \(n\) replicas
to occupy them, at least \(2q-n\) replicas must be in both.

If up to \(f\) replicas are Byzantine, those \(f\) replicas can sign both red
and blue. Honest replicas do not double-vote in the same consensus position. So
the forced overlap is not enough by itself. Safety needs:

$$
2q - n > f.
$$

Equivalently:

$$
q > \frac{n+f}{2}.
$$

That is the safety inequality. It says any two certificates must share at least
one honest signer.

## Liveness Pulls the Other Way

Now suppose the network has stabilized and all honest replicas can talk, but the
faulty replicas are silent, slow, or actively unhelpful. There are only \(n-f\)
reliable votes available. If the quorum is larger than that, a correct leader
may never gather a certificate.

So liveness wants:

$$
q \le n - f.
$$

Put the two inequalities together:

$$
\frac{n+f}{2} < q \le n-f.
$$

For such a \(q\) to exist, we need:

$$
n > 3f.
$$

The minimal integer version is the famous:

$$
n = 3f+1,
\qquad
q = 2f+1.
$$

With \(n=3f+1\), two quorums of size \(2f+1\) intersect in

$$
2(2f+1) - (3f+1) = f+1
$$

replicas. Since only \(f\) can be Byzantine, at least one signer in the
intersection is honest. The same quorum size is also exactly \(n-f\), the number
of honest replicas left when all faulty replicas refuse to help. There is no
slack. Move down and safety breaks. Move up and liveness can stall.

That is why "two thirds" keeps appearing.

## The Certificate Lab

The lab below constructs the worst-case pair of certificates for the selected
\((n,f,q)\). Orange-ringed replicas are Byzantine. Red voters sign one
certificate, blue voters sign the other, and purple voters are forced into both
certificates by the pigeonhole count.

The important number is **honest overlap**. If it is zero, a conflicting
certificate can be assembled with only Byzantine double-signers in the
intersection. If it is at least one, a conflict would require an honest replica
to sign both histories.

<style>
  .bft-quorum-lab {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .bft-quorum-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .bft-quorum-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .bft-quorum-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .bft-quorum-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .bft-quorum-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .bft-quorum-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.68rem;
  }

  .bft-quorum-lab__metric span,
  .bft-quorum-lab__legend,
  .bft-quorum-lab__note {
    color: #5d6872;
    font-size: 0.78rem;
  }

  .bft-quorum-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.08rem;
    line-height: 1.2;
    margin-top: 0.22rem;
  }

  .bft-quorum-lab canvas {
    display: block;
    height: 560px;
    max-width: 100%;
    width: 100%;
  }

  .bft-quorum-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.75rem;
  }

  .bft-quorum-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .bft-quorum-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.62rem;
    width: 0.62rem;
  }

  .bft-quorum-lab__note {
    line-height: 1.45;
    margin: 0.7rem 0 0;
  }

  @media (max-width: 560px) {
    .bft-quorum-lab {
      padding: 0.85rem;
    }

    .bft-quorum-lab canvas {
      height: 790px;
    }
  }
</style>

<div class="bft-quorum-lab" data-bft-quorum-lab>
  <div class="bft-quorum-lab__controls">
    <label>
      Replicas n: <output data-value="n">10</output>
      <input type="range" min="4" max="31" step="1" value="10" data-param="n">
    </label>
    <label>
      Byzantine budget f: <output data-value="f">3</output>
      <input type="range" min="0" max="10" step="1" value="3" data-param="f">
    </label>
    <label>
      Certificate quorum q: <output data-value="q">7</output>
      <input type="range" min="1" max="31" step="1" value="7" data-param="q">
    </label>
  </div>
  <div class="bft-quorum-lab__metrics" data-metrics></div>
  <canvas data-canvas width="860" height="560" aria-label="Byzantine quorum certificate simulator showing certificate overlap, safety, and liveness"></canvas>
  <div class="bft-quorum-lab__legend">
    <span><i style="background:#be123c"></i> Certificate A</span>
    <span><i style="background:#2563eb"></i> Certificate B</span>
    <span><i style="background:#7c3aed"></i> Forced overlap</span>
    <span><i style="background:#b45309"></i> Byzantine signer</span>
    <span><i style="background:#0f766e"></i> Safe and live quorum choices</span>
  </div>
  <p class="bft-quorum-lab__note">
    Deterministic construction. The displayed certificates are worst-case sets:
    they minimize overlap for the chosen \(n\) and \(q\), then spend the
    Byzantine budget inside that overlap first. The audit counter is computed
    by the same JavaScript model before the metrics are shown.
  </p>
</div>

<script defer src="{{ '/assets/js/bft-quorum-lab.js?v=20260615a' | relative_url }}"></script>

At the default setting, \(n=10\), \(f=3\), and \(q=7\). Two certificates must
overlap in \(2q-n=4\) voters. The adversary can account for at most three of
those voters, so at least one overlap voter is honest. The conflict is blocked.
The live slack is zero because \(n-f-q=0\): if the three faulty replicas refuse
to vote, all seven honest replicas are needed.

Now lower **Certificate quorum q** to 6. Liveness becomes easier, but the forced
overlap drops to 2. Those two overlap voters can both be Byzantine, so the lab
can construct red and blue certificates for conflicting histories. Raise \(q\)
above 7 instead. Safety remains, but liveness can fail because a correct leader
may need a faulty signature to finish.

The refreshed lab exports `runAudit()`, and the visible counter should read
`5634/5634`. The audit checks the default case, the unsafe \(q=6\) witness, the
stalling \(q=8\) case, every finite row in the UI's \(4 \le n \le 31\) grid,
and the ten minimal clusters \(n=3f+1, q=2f+1\) for \(1 \le f \le 10\). It also
checks the edge case \(f=0\), which is easy to mishandle in UI normalization:
zero faults should remain zero faults, not silently turn into the default
Byzantine budget.

## Protocols Add Locks, Timing, and View Changes

The quorum arithmetic is necessary, not sufficient.

A real BFT protocol also has to decide when votes are allowed, what happens when
leaders equivocate, what evidence gets carried into the next view, and when a
replica is locked against voting for a conflicting branch. That is why PBFT's
view-change protocol matters, why Tendermint has locks and rounds, and why
HotStuff's chained certificates are more than decorative signatures.

The arithmetic explains what certificates can prove. The protocol explains when
certificates are produced and how safety survives leader changes.

This distinction is useful in design reviews. When someone proposes changing a
threshold, batching votes, skipping a phase, or accepting a new kind of
certificate, ask two questions separately:

1. Do any two certificates for conflicting histories force an honest overlap?
2. Can a correct leader still gather a certificate after the network stabilizes
   with up to \(f\) faulty replicas not helping?

If the answer to the first question is no, the system can fork. If the answer to
the second question is no, the system can freeze.

## The Missing Signer Is the Point

Crash-fault protocols can often live with majorities. A crashed process is
silent; it does not sign both sides of a fork. Byzantine faults are worse
because a faulty replica can be present in two histories at once.

The certificate therefore needs one extra witness beyond the adversary's double
signing budget. Not "many honest nodes in expectation." Not "roughly enough."
One forced honest signer in the intersection is the smallest unit of safety.

That is the quiet beauty of the \(3f+1\) rule. It is not large because the
protocol is paranoid. It is large because the same replicas must pay for two
opposite things: enough overlap to remember the past, and enough availability to
move after the network calms down.

[^byz]: Leslie Lamport, Robert Shostak, and Marshall Pease, "The Byzantine Generals Problem," *ACM Transactions on Programming Languages and Systems*, 1982. [PDF](https://lamport.azurewebsites.net/pubs/byz.pdf), [DOI](https://doi.org/10.1145/357172.357176).

[^dls]: Cynthia Dwork, Nancy Lynch, and Larry Stockmeyer, "Consensus in the Presence of Partial Synchrony," *Journal of the ACM*, 1988. [PDF](https://groups.csail.mit.edu/tds/papers/Lynch/jacm88.pdf), [DOI](https://doi.org/10.1145/42282.42283).

[^pbft]: Miguel Castro and Barbara Liskov, "Practical Byzantine Fault Tolerance," *OSDI*, 1999. [USENIX](https://www.usenix.org/conference/osdi-99/practical-byzantine-fault-tolerance), [PDF](https://css.csail.mit.edu/6.824/2014/papers/castro-practicalbft.pdf).

[^tendermint]: Ethan Buchman, Jae Kwon, and Zarko Milosevic, "The latest gossip on BFT consensus," arXiv:1807.04938, 2018. [arXiv](https://arxiv.org/abs/1807.04938).

[^hotstuff]: Maofan Yin, Dahlia Malkhi, Michael K. Reiter, Guy Golan Gueta, and Ittai Abraham, "HotStuff: BFT Consensus in the Lens of Blockchain," arXiv:1803.05069, 2018; PODC 2019. [arXiv](https://arxiv.org/abs/1803.05069), [ACM](https://dl.acm.org/doi/10.1145/3293611.3331591).
