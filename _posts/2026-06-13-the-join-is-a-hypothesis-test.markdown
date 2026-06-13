---
layout: post
title: "The Join Is a Hypothesis Test"
description: "When there is no shared key, a data join becomes a statistical decision about identity under measurement error."
date: 2026-06-13 11:08:00 -0400
categories: computer-science
tags: [record-linkage, entity-resolution, data-quality, statistics, data-systems, probabilistic-matching]
excerpt: "The hard part of entity resolution is not string similarity. It is deciding when a possible match is good enough to become a fact in the database."
---

The most dangerous join in a data system is the one that looks almost like a
join.

Two tables arrive. They both seem to contain people, companies, transactions,
patients, papers, products, or addresses. There is no shared primary key, but
there are names, dates, locations, and a few identifiers with missing digits.
The product manager says "dedupe this." The analyst says "fuzzy match." The
engineer reaches for string similarity.

That is where the trouble begins.

String similarity answers a local question: how close are these two fields? The
data system needs a global decision: should these two records be treated as the
same entity, with all downstream consequences that follow?

Those are not the same question.

<div class="callout">
  <strong>Linkage rule:</strong> when the key is missing, the join is not an
  equality operator. It is a hypothesis test with operational costs.
</div>

## The Old Problem

Record linkage is older than most modern data infrastructure. Newcombe,
Kennedy, Axford, and James described automatic linkage of vital records in
1959, arguing that computers could connect routine administrative files to
produce follow-up statistics.[^newcombe] The problem has not changed much:
records are noisy shadows of entities, and the database usually stores the
shadows, not the entities.

Fellegi and Sunter gave the field its canonical statistical frame in 1969.[^fs]
For a pair of records, compute a comparison vector $$\gamma$$: first names
agree, last names approximately agree, dates differ by one year, zip codes share
a prefix, and so on. Then compare two probabilities:

$$
m(\gamma) = P(\gamma \mid M),
\qquad
u(\gamma) = P(\gamma \mid U),
$$

where $$M$$ means the pair is a true match and $$U$$ means it is not. The
record-pair weight is a likelihood ratio:

$$
w(\gamma)
=
\log \frac{m(\gamma)}{u(\gamma)}.
$$

Agreements that are common among true matches but rare among nonmatches receive
positive weight. Disagreements that are unlikely among true matches receive
negative weight. A match is not declared because the names are "pretty close."
It is declared because the evidence is sufficiently more likely under the
same-entity hypothesis than under the different-entity hypothesis.

The decision rule has three regions:

$$
\begin{cases}
\text{link}, & w(\gamma) \ge T_\text{link},\\
\text{review}, & T_\text{review} < w(\gamma) < T_\text{link},\\
\text{nonlink}, & w(\gamma) \le T_\text{review}.
\end{cases}
$$

That middle region matters. It says uncertainty is not a bug in the user
interface. It is part of the statistical decision.

## Blocking Is the First Model

Before scoring pairs, a linkage system usually performs blocking: compare only
records that share some cheap key, such as last-name initial, date bucket, zip
prefix, normalized phone fragment, phonetic code, or locality-sensitive hash.

Blocking is necessary because comparing every pair is quadratic. If file A has
one million records and file B has one million records, the Cartesian product
has one trillion pairs. Most are obvious nonmatches. The system must avoid
scoring them.

But blocking is not innocent. A true match missed by blocking can never be
recovered by a perfect scorer. Blocking recall is therefore a first-class
statistic:

$$
\text{candidate recall}
=
\frac{\text{true links that survive blocking}}
{\text{true links}}.
$$

Pair reduction is the companion statistic:

$$
\text{pair reduction}
=
1 -
\frac{\text{candidate pairs compared}}
{\text{all possible pairs}}.
$$

The linkage engineer is always trading these two. A strict block saves compute
and reduces false positives, but it silently turns typographical errors into
missed entities. A loose block preserves recall, but creates a larger and dirtier
candidate set. Christen and Goiser warn that measures in the pair-comparison
space can be deceptive; linkage quality has to be measured with attention to
both quality and complexity.[^christengoiser]

The first lesson is uncomfortable:

```text
the blocking rule can dominate the matching model
```

## A Small Linkage Laboratory

The lab below generates two dirty files from a hidden population. Some records
overlap across files; others are unique. Names can be common or rare. Fields can
be mistyped. Candidate pairs are created by a blocking rule, scored with
Fellegi-Sunter-style log weights, and resolved by a greedy one-to-one assignment.

The model is intentionally small. It is not a production entity-resolution
system. It is a microscope for three failure modes:

1. blocking can miss true links before scoring starts;
2. common names create false-link pressure;
3. a threshold converts uncertainty into database facts.

<div id="linkage-lab" class="linkage-lab" data-linkage-lab>
  <div class="linkage-lab__controls">
    <label>
      Overlap: <output data-value="overlap">65%</output>
      <input type="range" min="25" max="90" step="5" value="65" data-param="overlap">
    </label>
    <label>
      Field error rate: <output data-value="errorRate">12%</output>
      <input type="range" min="0" max="35" step="1" value="12" data-param="errorRate">
    </label>
    <label>
      Common-name pressure: <output data-value="commonNames">35%</output>
      <input type="range" min="0" max="80" step="5" value="35" data-param="commonNames">
    </label>
    <label>
      Blocking strictness: <output data-value="blocking">balanced</output>
      <input type="range" min="0" max="3" step="1" value="2" data-param="blocking">
    </label>
    <label>
      Link threshold: <output data-value="threshold">6.50</output>
      <input type="range" min="-4" max="18" step="0.5" value="6.5" data-param="threshold">
    </label>
    <label>
      Review band: <output data-value="reviewBand">2.00</output>
      <input type="range" min="0" max="8" step="0.5" value="2" data-param="reviewBand">
    </label>
  </div>
  <div class="linkage-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="650" aria-label="Record linkage simulator showing score distributions, blocking budget, resolution ledger, and threshold sweep"></canvas>
  <div class="linkage-lab__legend">
    <span><i style="background:#0f766e"></i> True links</span>
    <span><i style="background:#be123c"></i> Non-links</span>
    <span><i style="background:#b45309"></i> Review band</span>
    <span><i style="background:#2563eb"></i> Link threshold</span>
    <span><i style="background:#7c3aed"></i> Candidate pairs</span>
  </div>
  <p class="linkage-lab__note">
    Deterministic synthetic experiment. The scorer uses fixed illustrative
    m/u weights for name similarity, zip agreement, and birth-year agreement.
    The resolver enforces one-to-one links greedily by descending score.
  </p>
</div>
<script defer src="{{ '/assets/js/record-linkage-lab.js?v=20260613a' | relative_url }}"></script>

Start by raising **field error rate**. If blocking is balanced or strict,
candidate recall falls before the score threshold has any chance to help. Lower
the blocking strictness and candidate recall recovers, but the number of
compared pairs grows.

Now raise **common-name pressure**. Nonmatch scores move upward because two
different people are more likely to share ordinary names. Precision starts to
depend on the threshold and the one-to-one resolver. This is why "John Smith"
does not carry the same evidence as "Amara Adebayo." Agreement on a rare value
is more informative than agreement on a common value.

Finally move the **link threshold**. Recall rises when the threshold falls, but
false links rise too. The review band is a pressure valve: it keeps uncertain
pairs out of the automatic merge, at the cost of human or downstream work.

The lab is not trying to be clever. It is trying to make a humble fact visible:
entity resolution is a pipeline of irreversible decisions. Normalize, block,
score, review, resolve, merge. A mistake early in the pipeline can look like
confidence later.

## String Similarity Is Evidence, Not Truth

Jaro's work on matching the 1985 Tampa census helped move record linkage from
exact character agreement toward probabilistic comparison of noisy fields.[^jaro]
Winkler's string-comparator work extended this practical machinery, including
comparators that partially account for typographical variation in names.[^winkler]

These tools are useful, but they should be treated as evidence generators. A
string comparator emits a feature. The linkage model decides how much that
feature means.

For example, suppose two records agree exactly on last name. The evidence
depends on frequency:

$$
\log\frac{P(\text{same last name}\mid M)}
{P(\text{same last name}\mid U)}.
$$

If the last name is rare, the denominator is small and the agreement is strong
evidence. If the last name is common, the denominator is larger and the same
agreement is weaker evidence. This is one reason frequency-based matching was
important in Fellegi-Sunter systems: common values should not get the same
weight as rare values.

This also explains why learned embedding similarity can be dangerous when used
alone. An embedding may know that "IBM" and "International Business Machines"
are close. It may also know that two hospitals, papers, or vendors are
semantically similar. Semantic similarity is not identity. A linkage system must
still ask whether the comparison pattern is more likely under the same-entity
hypothesis.

## Pair Decisions Are Not Entity Decisions

The Fellegi-Sunter model scores record pairs. Real databases contain entities.
Those are different geometries.

If record A1 links to B7, and A2 also links to B7, the system has a conflict.
If A1 links to B7 and B7 links to C3, should A1 link to C3? Pairwise decisions
do not automatically produce a consistent entity graph. A threshold can create
many local truths that cannot all be globally true.

The lab handles this with a simple greedy one-to-one resolver. Production
systems may use bipartite matching, clustering, constraints, active review, or
Bayesian entity models. Steorts, Hall, and Fienberg represent records as linked
to latent true individuals, which lets uncertainty propagate into later
analysis.[^steorts] Sadinle argues that pairwise matching-status independence is
unreasonable in bipartite linkage and proposes Bayesian estimates that can leave
uncertain regions unresolved.[^sadinle]

That unresolved option is powerful. It says a data system can represent "we do
not know" instead of fabricating a primary key because downstream code wants one.

The operational question is not:

```text
Which algorithm gives the highest match score?
```

It is:

```text
Which links are safe enough to materialize, which need review,
and which uncertainty should remain visible downstream?
```

## The Audit I Would Want

For a serious linkage job, I would ask for a run sheet.

Define the entity. A person, household, account, device, address, company,
facility, product, article, and legal organization are not the same unit. Define
the allowed cardinality: one-to-one, one-to-many, many-to-one, or many-to-many.
Define the consequence of a false link and a missed link. In medicine, policing,
credit, benefits, sanctions, or fraud detection, those costs are not symmetric.

Then report the pipeline as measurements:

1. input completeness by field and source;
2. normalization rules and irreversible transformations;
3. blocking rules, candidate recall, and pair reduction;
4. comparison features and frequency adjustments;
5. score distributions for labeled or audited pairs;
6. automatic-link threshold, review band, and nonlink threshold;
7. one-to-one or clustering constraints;
8. precision, recall, false-link rate, and missed-link rate on an audited set;
9. subgroup performance by language, region, name frequency, source, and time;
10. the downstream metric's sensitivity to linkage uncertainty.

The last line is the one that keeps getting skipped. If a later model predicts
patient risk, household income, customer churn, or sanctions exposure from linked
data, linkage uncertainty should not disappear. It should become uncertainty in
the analysis.

## A Research Direction

The blog-sized experiment I want next is a linkage stress test for ML datasets.

Take a public entity-resolution benchmark. Build several linkage pipelines:
classic Fellegi-Sunter weights, a learned pair classifier, an embedding
similarity model, and a Bayesian or constrained resolver. Then feed the linked
data into a downstream estimator. Instead of only asking "which linker has the
best F1?", ask:

```text
which downstream conclusions change when linkage uncertainty is propagated?
```

That is the research question that matters for real systems. A linkage model is
not usually the final product. It is a data-generating step for something else.
If linkage errors are structured by language, geography, class, institution, or
name frequency, the downstream model inherits that structure.

Record linkage looks like plumbing. It is really epistemology with indexes.

The join is a hypothesis test. Treating it as an equality operator just hides
the p-value in the warehouse.

## Notes

[^newcombe]: Howard B. Newcombe, James M. Kennedy, S. J. Axford, and A. P. James, ["Automatic Linkage of Vital Records"](https://pubmed.ncbi.nlm.nih.gov/14426783/), *Science*, 1959. The [Science record](https://www.science.org/doi/10.1126/science.130.3381.954) is also available.

[^fs]: Ivan P. Fellegi and Alan B. Sunter, ["A Theory for Record Linkage"](https://www.cs.cornell.edu/~shmat/courses/cs6434/fellegi-sunter.pdf), *Journal of the American Statistical Association*, 1969. See also the [Taylor & Francis record](https://www.tandfonline.com/doi/abs/10.1080/01621459.1969.10501049).

[^christengoiser]: Peter Christen and Karl Goiser, ["Quality and Complexity Measures for Data Linkage and Deduplication"](https://users.cecs.anu.edu.au/~Peter.Christen/publications/qmdm2007christen.pdf), in *Quality Measures in Data Mining*, 2007.

[^jaro]: Matthew A. Jaro, ["Advances in Record-Linkage Methodology as Applied to Matching the 1985 Census of Tampa, Florida"](https://www.jstor.org/stable/2289924), *Journal of the American Statistical Association*, 1989.

[^winkler]: William E. Winkler, ["String Comparator Metrics and Enhanced Decision Rules in the Fellegi-Sunter Model of Record Linkage"](https://files.eric.ed.gov/fulltext/ED325505.pdf), American Statistical Association, Section on Survey Research Methods, 1990.

[^steorts]: Rebecca C. Steorts, Rob Hall, and Stephen E. Fienberg, ["A Bayesian Approach to Graphical Record Linkage and De-duplication"](https://proceedings.mlr.press/v33/steorts14.html), AISTATS 2014.

[^sadinle]: Mauricio Sadinle, ["Bayesian Estimation of Bipartite Matchings for Record Linkage"](https://arxiv.org/abs/1601.06630), *Journal of the American Statistical Association*, 2017.
