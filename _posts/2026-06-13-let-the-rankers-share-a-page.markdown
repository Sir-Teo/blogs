---
layout: post
title: "Let the Rankers Share a Page"
description: "A/B tests compare two rankers through different users and different queries. Interleaving compares them inside the same result page, turning ranking evaluation into a paired duel."
date: 2026-06-13 23:15:00 -0400
categories: machine-learning
tags: [online-evaluation, interleaving, search, ranking, ab-testing, information-retrieval, machine-learning]
excerpt: "When two search rankers are close, the loudest source of variance is often not the ranker. It is the query, the user, and the day. Interleaving makes the rankers fight on the same page."
---

The ordinary A/B test asks two rankers to fight through fog.

Half the users see ranker A. Half see ranker B. We compare clicks, purchases,
dwell time, reformulations, saves, or some product metric downstream. This is
the right experiment when the question is:

```text
Which whole experience should we ship?
```

But it is an expensive way to answer a narrower question:

```text
Which ranker places the better documents above the worse documents?
```

For that question, the query is a nuisance variable. Some queries are easy.
Some are hopeless. Some users click everything. Some click nothing. Some days
are strange. A split-user A/B test has to average over all of that before the
ranking difference becomes visible.

Interleaving changes the unit of comparison.

Instead of showing one user ranker A and another user ranker B, it builds one
shared result list from both rankers. The user clicks on that shared page. The
clicked documents are then credited back to the ranker that contributed them.

The rankers duel on the same query, in front of the same user, under the same
position bias.

That paired design is the whole trick.

## Clicks Are Not Labels

Search has always been tempted by clicks. They are abundant, cheap, timely, and
produced by real users with real information needs. Joachims's 2002 KDD paper
made clickthrough data a central object for learning retrieval functions from
preferences rather than from expensive expert judgments.[^joachims-2002]

The warning arrived almost immediately: clicks are informative, but not clean.

Joachims, Granka, Pan, Hembrooke, and Gay combined eye-tracking with manual
relevance judgments and concluded that click feedback is biased. Highly ranked
results get extra trust. A click depends on the surrounding page, not only on
the clicked document. Their useful conclusion was not "ignore clicks." It was
that relative preferences derived from clicks can be much more reliable than
absolute click-as-relevance judgments.[^joachims-2005]

Position bias is one reason. Craswell, Zoeter, Taylor, and Ramsey perturbed a
major search engine's rankings and compared models of click position bias. Their
best explanation for early ranks was a cascade-like user model: users move from
top to bottom and may stop after finding a worthwhile result.[^craswell]

This makes naive click counts dangerous. A document can get more clicks because
it is better, because it is higher, because its snippet is more attractive, or
because everything above it was bad enough to keep the user scanning.

Interleaving does not remove these biases from the universe. It tries to make
the two rankers experience them on the same page.

## A Ranking Experiment Can Be Paired

In a split-user A/B test, a session contributes something like:

```text
Y_i(A)  or  Y_i(B)
```

where `Y` might be clicks per search. The estimate is a difference of two
groups:

```text
mean(Y | B) - mean(Y | A)
```

Its variance includes query mix, user mix, session context, and ranker quality.
Randomization balances those terms in expectation, but the experiment may need
a lot of traffic before a small ranker improvement rises above them.

In an interleaving test, the session contributes a paired score:

```text
S_i = clicks credited to B - clicks credited to A
```

The same query and user produced both sides of the comparison. Query difficulty
has less room to masquerade as ranker quality.

Team Draft Interleaving is the clean folk algorithm. Two rankers are captains
drafting a team. A coin decides who picks first, then rankers alternate taking
their highest-ranked document that has not already appeared. The result page
keeps a hidden owner label for each document. When the user clicks, the owner
gets credit.[^radlinski-2008]

Radlinski, Kurup, and Joachims introduced Team Draft Interleaving to avoid
problems with earlier balanced interleaving when rankings are nearly identical.
In their arXiv user study, interleaving methods reflected known retrieval
quality differences more reliably than a set of absolute click metrics at the
sample sizes they considered.[^radlinski-2008]

Chapelle, Joachims, Radlinski, and Yue later analyzed interleaved evaluation
using data from two large commercial search engines and a scientific-literature
retrieval system, studying agreement with other quality signals and statistical
efficiency.[^chapelle] The broader survey by Hofmann, Li, and Radlinski places
interleaving inside the family of online information-retrieval experiments:
online evaluation measures real users in situ, complements offline judgments,
and supports both absolute and relative quality assessments.[^hofmann]

Recent large-system work is still finding the same pattern. Bi and coauthors
describe interleaving as far more sensitive than ordinary A/B testing in
industrial retrieval systems, while also emphasizing practical issues: comparing
many systems, interpreting raw interleaving magnitudes, and operationalizing the
method at scale.[^amazon]

That last clause matters. A fast test is not automatically an easy test.

## A Duel Lab

The lab below simulates a search product with a hidden relevance landscape.
Each query has a set of candidate documents. Ranker A sees relevance through a
noisy scoring function. Ranker B is a controlled improvement: it uses slightly
less noisy evidence and therefore lifts offline NDCG when **Ranker B lift** is
positive.

Users follow a simple position-biased click model. Higher positions are examined
more often; attractive and relevant documents are clicked more often; after a
satisfying click, later positions receive less attention.

The same finite user sessions are evaluated two ways:

- **A/B:** split users between A and B and compare clicks per search.
- **Interleaving:** show a Team Draft page and compare click credit inside that
  page.

<style>
  .interleaving-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .interleaving-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  }

  .interleaving-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .interleaving-lab__controls select {
    appearance: none;
    background: #ffffff;
    border: 1px solid #cbd5df;
    border-radius: 6px;
    color: #172026;
    font: inherit;
    min-height: 2.25rem;
    padding: 0.35rem 0.55rem;
    width: 100%;
  }

  .interleaving-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .interleaving-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .interleaving-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .interleaving-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.42);
  }

  .interleaving-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .interleaving-lab__metric span,
  .interleaving-lab__note,
  .interleaving-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .interleaving-lab__metric span {
    display: block;
  }

  .interleaving-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .interleaving-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .interleaving-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.65rem;
  }

  .interleaving-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .interleaving-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .interleaving-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="interleaving-lab" id="interleaving-lab" data-interleaving-duel-lab>
  <div class="interleaving-lab__controls">
    <label>
      Ranker B lift
      <select data-param="lift">
        <option value="0">none</option>
        <option value="0.12">small</option>
        <option value="0.22" selected>medium</option>
        <option value="0.32">large</option>
      </select>
    </label>
    <label>
      Sessions
      <select data-param="sessions">
        <option value="300">300</option>
        <option value="800">800</option>
        <option value="1200" selected>1,200</option>
        <option value="3000">3,000</option>
      </select>
    </label>
    <label>
      Position bias
      <select data-param="positionBias">
        <option value="0.35">mild</option>
        <option value="0.72" selected>strong</option>
        <option value="1.05">severe</option>
      </select>
    </label>
    <label>
      Query mix
      <select data-param="heterogeneity">
        <option value="0.2">flat</option>
        <option value="0.75" selected>skewed</option>
        <option value="1.2">very skewed</option>
      </select>
    </label>
    <label>
      Ranker noise
      <select data-param="noise">
        <option value="0.25">low</option>
        <option value="0.42" selected>medium</option>
        <option value="0.65">high</option>
      </select>
    </label>
    <label>
      Highlight
      <select data-param="highlight">
        <option value="interleaving" selected>Interleaving</option>
        <option value="ab">A/B</option>
      </select>
    </label>
  </div>
  <div class="interleaving-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Interleaving duel lab comparing A/B click tests with Team Draft Interleaving for ranker evaluation"></canvas>
  <div class="interleaving-lab__legend">
    <span><i style="background:#2563eb"></i> Ranker A</span>
    <span><i style="background:#0f766e"></i> Ranker B</span>
    <span><i style="background:#7c3aed"></i> A/B evidence</span>
    <span><i style="background:#be123c"></i> A wins / loss</span>
    <span><i style="background:#94a3b8"></i> Tie</span>
  </div>
  <p class="interleaving-lab__note">
    Deterministic synthetic experiment. Clicks are generated from a simple
    position-biased examination model, not from real users. The useful object is
    the comparison between estimators under the same simulated traffic.
  </p>
</div>
<script defer src="{{ '/assets/js/interleaving-duel-lab.js?v=20260613a' | relative_url }}"></script>

With the default settings, ranker B improves offline top-10 NDCG by about five
points. The ordinary A/B click delta is positive but just under the usual
two-sigma line in this finite sample. The interleaved duel sees the same
traffic and produces a much stronger preference for B.

Set **Ranker B lift** to `none`. Both tests become neutral. That is important:
the interleaving procedure is not simply biased toward the challenger in this
toy. It gets power by pairing, not by magic.

Now make **Query mix** very skewed. A/B has to fight the fact that the traffic
stream is dominated by a few query types. Interleaving still sees the same
query on both sides of the comparison. Increase **Position bias**. The absolute
click metric becomes more fragile, because top positions dominate. Team Draft
does not abolish position bias, but it alternates ownership on the same page,
so the bias is shared more symmetrically.

This is why interleaving can feel unfairly effective. It is not measuring
everything. It is measuring a narrower thing with less nuisance variance.

## The Thing Interleaving Does Not Tell You

Interleaving answers:

```text
When these two rankers share a page, whose contributed documents attract more
click credit?
```

That is not the same as:

```text
What is the product impact of shipping ranker B?
```

Shipping can change latency, result diversity, freshness, ad load, trust,
long-term satisfaction, downstream conversion, abandonment, and user learning.
Interleaving is a sensitive ranker-preference test, not a complete business
experiment.

It also needs careful engineering:

- Both rankers should draw from comparable candidate sets.
- Duplicate handling must be deterministic and audited.
- Snippets, badges, prices, and media treatments should not reveal ownership.
- Credit assignment should match the interaction surface.
- Guardrail metrics still need ordinary A/B tests.
- The result should be interpreted as a direction-of-preference signal, not as
  a direct revenue or retention estimate.

Generalized and optimized interleaving work makes this explicit. Kharitonov,
Macdonald, Serdyukov, and Ounis frame sensitivity as a central property of an
interleaving method and study ways to optimize both the interleaving policy and
credit assignment.[^kharitonov] Industrial work makes the same point from the
other direction: interleaving is powerful enough to be worth operational
complexity, but the raw measurement needs translation before it becomes a
launch decision.[^amazon]

## The Research Direction

The evaluation stack I want for ranking systems has three layers:

1. Offline judgments and counterfactual replay to catch obvious regressions
   before touching users.
2. Interleaved online duels to detect ranker preference quickly under real
   traffic.
3. Full A/B tests for product-level metrics, guardrails, and long-term effects.

Those layers should not compete for philosophical authority. They answer
different questions.

Offline evaluation asks whether the ranking agrees with a relevance model.
Interleaving asks whether users prefer one ranker's contributions under a
shared page. A/B testing asks whether the shipped experience changes the
system.

The failure mode is pretending that one layer answers all three.

Search, recommendations, marketplaces, feeds, and retrieval-augmented
generation all now contain rankers inside larger products. A reranker can
improve pairwise relevance while harming diversity. A diversity policy can
reduce clicks while improving satisfaction. A citation ranker can win clicks
and lose factuality. We need evaluators that say exactly what they measured.

Let the rankers share a page when the question is ranking preference.

Then make them face the whole product when the question is shipping.

## Notes

[^joachims-2002]: Thorsten Joachims, "Optimizing Search Engines using Clickthrough Data," *KDD*, 2002. [PDF](https://www.cs.cornell.edu/people/tj/publications/joachims_02c.pdf), [ACM](https://dl.acm.org/doi/10.1145/775047.775067).

[^joachims-2005]: Thorsten Joachims, Laura Granka, Bing Pan, Helene Hembrooke, and Geri Gay, "Accurately Interpreting Clickthrough Data as Implicit Feedback," *SIGIR*, 2005. [PDF](https://www.cs.cornell.edu/people/tj/publications/joachims_etal_05a.pdf), [ACM](https://dl.acm.org/doi/10.1145/1076034.1076063).

[^craswell]: Nick Craswell, Onno Zoeter, Michael Taylor, and Bill Ramsey, "An Experimental Comparison of Click Position-Bias Models," *WSDM*, 2008. [Microsoft Research](https://www.microsoft.com/en-us/research/publication/an-experimental-comparison-of-click-position-bias-models/), [ACM](https://dl.acm.org/doi/abs/10.1145/1341531.1341545).

[^radlinski-2008]: Filip Radlinski, Madhu Kurup, and Thorsten Joachims, "How Does Clickthrough Data Reflect Retrieval Quality?" *CIKM*, 2008. [PDF](https://www.cs.cornell.edu/people/tj/publications/radlinski_etal_08b.pdf).

[^chapelle]: Olivier Chapelle, Thorsten Joachims, Filip Radlinski, and Yisong Yue, "Large-scale Validation and Analysis of Interleaved Search Evaluation," *ACM Transactions on Information Systems*, 2012. [Microsoft Research](https://www.microsoft.com/en-us/research/publication/large-scale-validation-and-analysis-of-interleaved-search-evaluation/), [ACM PDF](https://dl.acm.org/doi/pdf/10.1145/2094072.2094078).

[^hofmann]: Katja Hofmann, Lihong Li, and Filip Radlinski, "Online Evaluation for Information Retrieval," *Foundations and Trends in Information Retrieval*, 2016. [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/06/ftir-online-evaluation-final-journal.pdf).

[^kharitonov]: Eugene Kharitonov, Craig Macdonald, Pavel Serdyukov, and Iadh Ounis, "Generalized Team Draft Interleaving," *CIKM*, 2015. [PDF](https://eprints.gla.ac.uk/108076/1/108076.pdf), [ACM](https://dl.acm.org/doi/10.1145/2806416.2806477).

[^amazon]: Nan Bi, Bai Li, Ruoyuan Gao, Graham Edge, and Sachin Ahuja, "Interleaved Online Testing in Large-Scale Systems," *WWW Companion*, 2023. [PDF](https://assets.amazon.science/c1/4d/7945330e47539fdd870cb5c73613/interleaved-online-testing-in-large-scale-systems.pdf), [ACM](https://dl.acm.org/doi/abs/10.1145/3543873.3587572).
