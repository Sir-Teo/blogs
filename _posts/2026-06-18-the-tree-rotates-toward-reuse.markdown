---
layout: post
title: "The Tree Rotates Toward Reuse"
description: "A splay tree keeps no balance bits. It pays rotations after each access so the next access can be cheaper if the trace has locality."
date: 2026-06-18 09:38:00 -0400
categories: computer-science
tags: [splay-trees, self-adjusting-trees, binary-search-trees, amortized-analysis, working-set, data-structures, algorithms]
excerpt: "A splay tree is a binary search tree that moves the accessed key to the root. The theorem is amortized; the engineering question is whether the trace pays back the rotations."
---

A balanced binary search tree carries a visible promise.

Red-black colors, AVL heights, B-tree page sizes, treap priorities: some extra
state says why the next path should be short.

A splay tree makes a stranger bargain. It stores no balance metadata. It lets
the shape drift. After every successful access, it rotates the accessed node to
the root.

That sounds almost too eager. Why spend rotations on a lookup that already
found its key?

Because lookup traces are rarely independent uniform samples. Programs ask for
the same object again. They walk around a neighborhood of keys. They change
phases. They scan. A splay tree is a binary search tree that bets on this
temporal structure by editing the tree after the fact.

The slogan is not "splay trees are faster." A more honest slogan is:

```text
pay now to make the recent path shallow
```

Sometimes the bet wins. Sometimes the rotations are just overhead.

## The Local Rule

Search as usual. When the key is found, repeatedly rotate it upward until it
becomes the root.

The cases are classified by the accessed node `x`, its parent `p`, and its
grandparent `g`.

```text
zig      x has no grandparent: rotate x over p
zig-zig  x and p are both left children or both right children:
         rotate p over g, then x over p
zig-zag  x is a left child and p is a right child, or the reverse:
         rotate x over p, then x over g
```

The important detail is the double rotation. A naive "rotate the accessed node
one edge at a time" rule is tempting, but Sleator and Tarjan showed that this
simple move-to-root heuristic does not get the same amortized guarantees.[^sleator-tarjan]
The zig-zig and zig-zag steps are the accounting trick. They pull `x` up while
also compressing a chunk of the old search path.

After an access, the last key is at the root. If the exact same key is accessed
again, the search is one comparison and no rotations. If nearby keys are
accessed next, many of the same ancestors have also been pulled closer.

## The Accounting Is Not Stored In The Tree

Splay analysis assigns arbitrary positive weights to items. These weights are
not fields in the nodes. They are a proof device.

For a node `x`, define:

$$
s(x)=\sum_{y\in subtree(x)} w(y)
$$

and

$$
r(x)=\log_2 s(x).
$$

The potential of the tree is the sum of ranks:

$$
\Phi(T)=\sum_x r(x).
$$

Sleator and Tarjan's access lemma says that splaying a node `x` in a tree with
root `t` has amortized cost at most[^sleator-tarjan]

$$
3(r(t)-r(x))+1.
$$

Equivalently, up to constants, the cost is controlled by

$$
\log {s(t)\over s(x)}.
$$

That line is the machine room. Choose all weights equal and the lemma gives the
ordinary logarithmic amortized bound. Choose weights proportional to long-run
access frequencies and it gives static optimality. Change weights as the access
sequence unfolds and it gives a working-set bound.

The algorithm did not change. Only the analysis did.

## What The Theorems Say

For a sequence of `m` accesses on `n` keys, the original paper proves a balance
theorem:

$$
O((m+n)\log n + m).
$$

So over a long enough sequence, splaying is within a constant factor of ordinary
balanced search trees in total access time.

It also proves a static optimality theorem. If key `i` is accessed `q(i)` times,
then the total access time is bounded by

$$
O\left(m+\sum_i q(i)\log {m\over q(i)}\right),
$$

assuming every item appears at least once. That resembles an entropy bound: a
key that is asked for often is allowed to become cheap without the tree being
told its frequency in advance.

The working-set theorem is even closer to a systems intuition. Let `t(j)` be the
number of distinct keys accessed since the previous access to the key requested
at time `j`, or since the beginning of the sequence if this is the key's first
access. Splay trees have total access time

$$
O\left(n\log n + m + \sum_{j=1}^{m}\log(t(j)+1)\right).
$$

Recent keys are cheap. Stale keys are allowed to be expensive.

There are also important boundaries. Sleator and Tarjan conjectured dynamic
optimality: roughly, that splay trees are within a constant factor of any binary
search tree algorithm that can also rotate between accesses, even one tailored
to the whole sequence. That remains a conjecture. Later work proved pieces of
the adaptive picture, including Tarjan's linear-time theorem for one sequential
in-order pass and Cole's dynamic-finger theorem, which bounds access cost by
the rank distance from the previous access.[^tarjan-scan][^cole-finger]

The safe statement is:

> Splaying has strong amortized guarantees and several proven locality-sensitive
> bounds, but not every finite trace beats a well-tuned balanced tree under every
> cost model.

## Lab: Charge The Rotations

The lab below implements a bottom-up splay tree with parent pointers and a
fixed balanced binary search tree over the same keys.

For each access, it records:

- splay search comparisons;
- splay rotations;
- splay primitive cost, defined here as comparisons plus rotations;
- fixed balanced-tree comparisons;
- working-set distance in the generated trace.

That cost model is intentionally unsentimental. The theorem is amortized and
abstract. Real code still pays for pointer writes, cache behavior, branch
prediction, allocator layout, and concurrency constraints. Counting comparisons
plus rotations is not a full CPU model, but it keeps the rotation bill visible.

<style>
  .splay-tree-lab {
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
  .splay-tree-lab__controls {
    display: grid;
    gap: 0.8rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
    margin-bottom: 1rem;
  }
  .splay-tree-lab label {
    color: #39444e;
    display: grid;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 700;
    gap: 0.35rem;
    line-height: 1.25;
  }
  .splay-tree-lab input,
  .splay-tree-lab select {
    accent-color: #0f766e;
    width: 100%;
  }
  .splay-tree-lab select {
    background: #ffffff;
    border: 1px solid #d7dee5;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2rem;
    padding: 0.25rem 0.45rem;
  }
  .splay-tree-lab output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  .splay-tree-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
    margin: 0.85rem 0 0.95rem;
  }
  .splay-tree-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4rem;
    padding: 0.6rem 0.68rem;
  }
  .splay-tree-lab__metric span {
    color: #5d6872;
    display: block;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .splay-tree-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 1.08rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.28rem;
    overflow-wrap: anywhere;
  }
  .splay-tree-lab__metric--good strong {
    color: #0f766e;
  }
  .splay-tree-lab__metric--bad strong {
    color: #be123c;
  }
  .splay-tree-lab canvas {
    aspect-ratio: 940 / 650;
    border: 1px solid #d7dee5;
    border-radius: 8px;
    box-sizing: border-box;
    display: block;
    height: auto;
    max-width: 100%;
    width: 100%;
  }
  .splay-tree-lab__legend {
    align-items: center;
    color: #5d6872;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.78rem;
    font-weight: 800;
    gap: 0.8rem;
    margin-top: 0.75rem;
  }
  .splay-tree-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }
  .splay-tree-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }
  .splay-tree-lab__note {
    color: #5d6872;
    font-size: 0.88rem;
    margin: 0.75rem 0 0;
  }
</style>

<div class="splay-tree-lab" data-splay-tree-lab>
  <div class="splay-tree-lab__controls">
    <label>
      Trace
      <select data-param="scenario" aria-label="Access trace">
        <option value="walk" selected>Local walk</option>
        <option value="phase">Phase shift</option>
        <option value="hot">Stable hot set</option>
        <option value="scan">Sequential scan</option>
        <option value="zipf">Zipf-like</option>
      </select>
    </label>
    <label>
      Keys <output data-value="keys">63</output>
      <input type="range" data-param="keys" min="15" max="255" step="1" value="63" aria-label="Number of keys">
    </label>
    <label>
      Accesses <output data-value="accesses">1200</output>
      <input type="range" data-param="accesses" min="120" max="5000" step="20" value="1200" aria-label="Number of accesses">
    </label>
    <label>
      Hot/recent keys <output data-value="hotSet">8</output>
      <input type="range" data-param="hotSet" min="2" max="64" step="1" value="8" aria-label="Hot set or recent-key threshold">
    </label>
    <label>
      Seed <output data-value="seed">31</output>
      <input type="range" data-param="seed" min="1" max="9999" step="1" value="31" aria-label="Random seed">
    </label>
  </div>
  <div class="splay-tree-lab__metrics" data-metrics></div>
  <canvas data-canvas width="940" height="650" aria-label="Splay tree trace lab comparing a self-adjusting tree with a fixed balanced binary search tree"></canvas>
  <div class="splay-tree-lab__legend">
    <span><i style="background:#0f766e"></i>Splay primitive cost</span>
    <span><i style="background:#2563eb"></i>Fixed balanced comparisons</span>
    <span><i style="background:#b45309"></i>Last access path</span>
    <span><i style="background:#7c3aed"></i>Recent working set</span>
  </div>
  <p class="splay-tree-lab__note" data-note>
    Local walk over 63 keys and 1200 accesses. Splay averages 4.98 primitive
    actions; the fixed balanced tree averages 5.10 comparisons.
  </p>
</div>

<script defer src="{{ '/assets/js/splay-tree-lab.js?v=20260618c' | relative_url }}"></script>

## The Default Run

The default local-walk trace has 63 keys and 1,200 accesses. It starts near the
middle key and mostly moves by small rank steps, with occasional wider jumps.

The measured result:

| Measure | Splay tree | Fixed balanced tree |
| --- | ---: | ---: |
| Average search comparisons | `2.99` | `5.10` |
| Average rotations | `1.99` | `0.00` |
| Average primitive cost | `4.98` | `5.10` |
| 95th percentile cost | `11` | `6` |

The average barely favors splaying under this deliberately simple cost model,
but the distribution is different. The splay tree has cheaper repeated and local
accesses, and more expensive cold jumps.

Bucketed by working-set distance:

| Distinct keys since previous access | Count | Splay primitive avg | Fixed balanced avg |
| --- | ---: | ---: | ---: |
| same key | `233` | `1.04` | `5.24` |
| 1-2 | `260` | `3.81` | `5.09` |
| 3-7 | `279` | `5.78` | `5.08` |
| 8-31 | `326` | `7.18` | `5.02` |
| 32+ | `102` | `7.67` | `5.12` |

That is the working-set theorem in miniature, not as a proof but as a diagnostic
shape. The recent buckets are where the rotations pay rent. The stale buckets
are where the tree admits it has been optimized for something else.

Switch to the phase-shift trace and the bill becomes more visible. The tree
adapts, but it can spend rotations chasing the new hot region. Switch to the
sequential scan and remember that the classic sequential-access theorem is about
one sorted pass from an arbitrary starting tree, not about every possible
cyclic-scan workload under a comparisons-plus-rotations accounting.

## Implementation Notes

The browser code builds the splay tree as an initially balanced tree over
`1..n`, then uses bottom-up parent-pointer rotations:

```text
while x is not root:
    if x has no grandparent:
        rotate x
    else if x and parent are on the same side:
        rotate parent
        rotate x
    else:
        rotate x
        rotate x
```

The audit checks that:

- inorder traversal remains exactly `1..n`;
- the root has no parent pointer;
- parent pointers agree with child links;
- every accessed key is found;
- every accessed key becomes the root after access;
- rolling averages remain finite;
- rotations are nonnegative;
- the fixed balanced baseline stays within its comparison bound;
- a repeated access costs one comparison and zero rotations.

Those checks do not prove the theorem. They make the visualization less likely
to be a decorative lie. The exported sweep reports 51 named checks: ten
invariants across each trace, plus one scan-specific generation check.

To reproduce the deterministic audit cases from the repository root:

```bash
node - <<'NODE'
const lab = require("./assets/js/splay-tree-lab.js");
const EXPECTED_CASE_SHAPE = [
  "1:hot:keys=31:accesses=300:hot=5:seed=7:5.73/3.37/2.37/3.85:rot=710:repeat=1:10/10",
  "2:phase:keys=63:accesses=1200:hot=8:seed=31:7.47/4.24/3.24/5.07:rot=3885:repeat=1:10/10",
  "3:scan:keys=63:accesses=256:hot=6:seed=11:8.83/4.91/3.91/5.10:rot=1002:repeat=none:11/11",
  "4:walk:keys=127:accesses=1600:hot=12:seed=19:5.03/3.01/2.01/6.02:rot=3223:repeat=1:10/10",
  "5:zipf:keys=127:accesses=2000:hot=10:seed=23:11.89/6.45/5.45/6.27:rot=10890:repeat=1:10/10"
];
const EXPECTED_COMMON_CHECK_NAMES = [
  "inorder key count",
  "inorder sorted",
  "root parent is null",
  "parent pointers",
  "all accesses found",
  "accessed key becomes root",
  "finite averages",
  "nonnegative rotations",
  "balanced comparison bound",
  "repeat access becomes root-cheap"
];
const EXPECTED_SCAN_CHECK_NAMES = EXPECTED_COMMON_CHECK_NAMES.concat([
  "scan generated in order"
]);
const EXPECTED_CASES = EXPECTED_CASE_SHAPE.length;
const EXPECTED_CHECKS =
  EXPECTED_CASES * EXPECTED_COMMON_CHECK_NAMES.length +
  (EXPECTED_SCAN_CHECK_NAMES.length - EXPECTED_COMMON_CHECK_NAMES.length);

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function repeatCost(value) {
  return value == null ? "none" : String(value);
}

function caseShape(row) {
  return `${row.caseId}:${row.scenario}:keys=${row.keys}:` +
    `accesses=${row.accesses}:hot=${row.hotSet}:seed=${row.seed}:` +
    `${row.splayAveragePrimitive.toFixed(2)}/${row.splayAverageSearch.toFixed(2)}/` +
    `${row.splayAverageRotations.toFixed(2)}/${row.balancedAverageSearch.toFixed(2)}:` +
    `rot=${row.totalRotations}:repeat=${repeatCost(row.repeatedSameKeyCost)}:` +
    `${row.passedChecks}/${row.totalChecks}`;
}

const audit = lab.auditGrid();
const failed = audit.cases.filter(
  (row) => !row.passed || row.passedChecks !== row.totalChecks
);
const shape = audit.cases.map(caseShape);
const shapeErrors = [];
if (!sameList(shape, EXPECTED_CASE_SHAPE)) {
  shapeErrors.push({ name: "cases", actual: shape, expected: EXPECTED_CASE_SHAPE });
}
audit.cases.forEach((row) => {
  const names = row.checks.map((check) => check.name);
  const expected =
    row.scenario === "scan" ? EXPECTED_SCAN_CHECK_NAMES : EXPECTED_COMMON_CHECK_NAMES;
  if (!sameList(names, expected)) {
    shapeErrors.push({
      name: `case ${row.caseId} check names`,
      actual: names,
      expected
    });
  }
});
console.table(audit.cases.map((row) => ({
  scenario: row.scenario,
  keys: row.keys,
  accesses: row.accesses,
  splayAvg: row.splayAveragePrimitive.toFixed(2),
  balancedAvg: row.balancedAverageSearch.toFixed(2),
  rotations: row.splayAverageRotations.toFixed(2),
  checks: `${row.passedChecks}/${row.totalChecks}`,
  passed: row.passed
})));
const summary =
  `${audit.passed}/${audit.total} cases and ${audit.passedChecks}/${audit.totalChecks} checks passed`;
if (
  shapeErrors.length ||
  failed.length ||
  !audit.ok ||
  audit.total !== EXPECTED_CASES ||
  audit.totalChecks !== EXPECTED_CHECKS ||
  audit.passed !== audit.total ||
  audit.passedChecks !== audit.totalChecks
) {
  throw new Error(JSON.stringify({
    summary,
    shapeErrors,
    failed,
    errors: audit.errors,
    totals: {
      total: audit.total,
      passed: audit.passed,
      passedChecks: audit.passedChecks,
      totalChecks: audit.totalChecks
    }
  }, null, 2));
}
console.log(summary);
NODE
```

## When Would I Use This?

Splay trees are appealing when:

- access locality is strong and changes over time;
- amortized bounds are acceptable;
- storing balance metadata is unattractive;
- simple split, join, and "move this thing to the top" behavior is useful.

They are less appealing when:

- individual-operation latency must be tightly bounded;
- reads must not mutate the structure;
- concurrent readers are common;
- memory layout and cache behavior dominate pointer-level comparison counts;
- a B-tree, hash table, radix tree, or sorted array better matches the workload.

The most useful lesson is broader than the data structure. A splay tree is an
online adaptation rule. It has no model of the future, only a disciplined way to
make the recent past cheap. Amortized analysis explains why that discipline does
not collapse into arbitrary thrashing.

The tree rotates toward reuse. Whether reuse is actually there is a property of
the trace.

## Sources

[^sleator-tarjan]: Daniel D. Sleator and Robert E. Tarjan, ["Self-Adjusting Binary Search Trees"](https://www.cs.cmu.edu/~sleator/papers/self-adjusting.pdf), *Journal of the ACM* 32(3), 652-686, 1985. ACM DOI page: <https://dl.acm.org/doi/10.1145/3828.3835>. The paper introduces splay trees, the access lemma, balance theorem, static optimality theorem, working-set theorem, and dynamic-optimality conjecture.

[^tarjan-scan]: Robert E. Tarjan, ["Sequential access in splay trees takes linear time"](https://link.springer.com/article/10.1007/BF02579253), *Combinatorica* 5, 367-378, 1985. The paper proves the sequential-access theorem for splay trees.

[^cole-finger]: Richard Cole, ["On the Dynamic Finger Conjecture for Splay Trees. Part II: The Proof"](https://epubs.siam.org/doi/10.1137/S009753979732699X), *SIAM Journal on Computing* 30(1), 44-85, 2000. The abstract states the dynamic-finger bound: amortized access cost `O(log(d+1))` for rank distance `d` from the preceding access, after an `O(n)` initialization cost.
