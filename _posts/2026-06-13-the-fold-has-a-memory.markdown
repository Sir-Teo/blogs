---
layout: post
title: "Cross-Validation With a Memory"
description: "Random cross-validation can leak through time even when every feature is legal. The culprit is often the label interval, not an obviously forbidden future column."
date: 2026-06-13 23:06:00 -0400
categories: quantitative-finance
tags: [cross-validation, purged-cv, embargo, time-series, backtesting, machine-learning, quantitative-finance]
excerpt: "A time-series validation split is not a shape drawn on a dataframe. It is a claim about what information cannot cross from train to test."
---

A validation split is not just a partition.

It is a firewall.

When the observations are independent, the firewall is easy to draw: shuffle the
rows, hold out some rows, train on the rest. But financial labels often have a
different geometry. A sample is not a point in time. It is an interval.

At trade time `t`, you observe features. The label might be the sign of the
next 20 trading days:

```text
y_t = sign(r_{t+1} + r_{t+2} + ... + r_{t+20})
```

That label consumes the future interval `(t, t + 20]`. The next sample,
`y_{t+1}`, consumes almost the same interval. If `y_t` is in the test fold and
`y_{t+1}` is in the training fold, the training set has not used a forbidden
feature column. It has still seen nearly the same realized future path.

The leak is not in the matrix.

It is in the label.

## Rows Are the Wrong Primitive

Most machine-learning tooling thinks in rows. Time-series validation has to
think in events.

For a financial event `i`, keep two timestamps:

```text
trade_time_i = when the features are known
event_time_i = when the label is fully known
```

For a fixed-horizon return, `event_time_i = trade_time_i + H`. For a triple
barrier label, the event time is whichever comes first: profit target, stop
loss, or vertical barrier. In both cases, the label is formed over an interval:

```text
[trade_time_i, event_time_i]
```

Two rows can be far apart in a shuffled dataframe and adjacent in information
time. Two labels overlap if their event intervals intersect. That overlap is
the object the split has to police.

This is why Lopez de Prado's financial ML treatment puts labeling, overlapping
outcomes, sample uniqueness, and purged K-fold cross-validation in the same
pipeline.[^afml] The cross-validation chapter is not merely about respecting
chronological order. It is about preventing the test label's event interval
from being represented inside the training labels.

Scikit-learn's `TimeSeriesSplit` documentation gives the ordinary chronological
warning: other cross-validation methods can train on future data and evaluate
on past data; the splitter also exposes a `gap` parameter that excludes samples
from the end of each training fold before the test fold.[^sklearn] That is a
useful primitive. It is not the whole contract. A gap between trade times is
not always the same thing as a purge between event intervals.

## The Split Is a Claim

Here is the strongest way I know to say it:

```text
Validation is a conditional independence claim.
```

It claims the evaluation rows were not made easier by information available in
the training rows. For independent tabular data, row disjointness may be a
reasonable approximation. For time series, spatial data, panels, recommender
logs, user histories, and market events, row disjointness can be theater.

This is an old problem with many dialects.

Burman, Chow, and Nolan proposed `h`-block cross-validation for dependent data:
leave a neighborhood around the test observation out of the training set so
nearby dependent observations cannot make the evaluation too easy.[^hblock]
Racine later proposed `hv`-block cross-validation for dependent-data model
selection.[^racine] Roberts and coauthors reviewed cross-validation strategies
for temporal, spatial, hierarchical, and phylogenetic structure and argued for
blocking when dependence structures matter.[^roberts]

There is also a useful caution against over-correction. Bergmeir, Hyndman, and
Koo show that standard K-fold can be valid for purely autoregressive time-series
forecasting when the candidate models have uncorrelated errors.[^bergmeir]
So the right lesson is not "never use K-fold on time series." The right lesson
is:

```text
validate the split against the dependence created by your prediction problem
```

For a one-step autoregression with clean residuals, the danger is different
from a 20-day overlapping financial label. For a panel of users, the danger is
different again. The split has to match the data-generating graph.

## Purging and Embargoing

Suppose a test fold contains events with intervals:

```text
[trade_time_j, event_time_j], for j in test
```

Purging removes every training event whose interval overlaps any test interval:

```text
[trade_time_i, event_time_i] intersects [trade_time_j, event_time_j]
```

Embargoing removes a buffer after the test fold. It is a cruder defense against
downstream dependence: market impact, delayed reaction, feature construction,
data-vendor revisions, overlapping holdings, or simply residual serial
correlation that a strict interval-overlap rule does not capture.

They solve different problems.

Purging says: "Do not let the training labels share the test label's realized
future."

Embargoing says: "Do not assume dependence stops exactly at the boundary I drew
on the chart."

Walk-forward validation is even stricter in one dimension: it trains only on
the past and evaluates in the future. That matches deployment time, but it can
use less data per fold and gives fewer paths through market history. Purged
K-fold uses more historical slices while trying to remove event-overlap
contamination. Combinatorial purged CV extends this idea by creating multiple
out-of-sample paths from combinations of test groups, which is useful when the
market gives you only one history.[^afml]

No splitter is a sacrament. Each one encodes a different claim.

## A Small Leak Detector

The lab below generates a synthetic market. There is a persistent latent signal,
noisy features observed at trade time, and a forward return label over `H`
days. A simple kernel classifier predicts the sign of the forward return.

The important quantity is not only accuracy. The lab also counts whether a test
label's event interval overlaps any training label's event interval.

The four splitters are:

- **Shuffled K-fold**, which randomly distributes rows across folds.
- **Blocked K-fold**, which uses contiguous test blocks but still trains on
  both sides of the test block.
- **Purged + embargo**, which starts with blocked folds and removes overlapping
  event intervals plus a post-test buffer.
- **Walk-forward**, which trains on earlier history only, with the same gap.

The final holdout is the last 18 percent of the synthetic history, evaluated
as if time only moves forward. It is not perfect ground truth. It is a useful
anchor because it was not part of the cross-validation folds.

<style>
  .purged-cv-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .purged-cv-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .purged-cv-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .purged-cv-lab__controls select {
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

  .purged-cv-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.8rem;
  }

  .purged-cv-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.15rem;
    padding: 0.62rem 0.7rem;
  }

  .purged-cv-lab__metric--good {
    border-color: rgba(15, 118, 110, 0.38);
  }

  .purged-cv-lab__metric--warn {
    border-color: rgba(217, 119, 6, 0.42);
  }

  .purged-cv-lab__metric--bad {
    border-color: rgba(190, 18, 60, 0.35);
  }

  .purged-cv-lab__metric span,
  .purged-cv-lab__note,
  .purged-cv-lab__legend {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .purged-cv-lab__metric span {
    display: block;
  }

  .purged-cv-lab__metric strong {
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .purged-cv-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .purged-cv-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.65rem;
  }

  .purged-cv-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .purged-cv-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.65rem;
    width: 0.65rem;
  }

  .purged-cv-lab__note {
    margin: 0.8rem 0 0;
  }
</style>

<div class="purged-cv-lab" id="purged-cv-lab" data-purged-cv-lab>
  <div class="purged-cv-lab__controls">
    <label>
      Label horizon
      <select data-param="horizon">
        <option value="5">5 days</option>
        <option value="10">10 days</option>
        <option value="20" selected>20 days</option>
        <option value="30">30 days</option>
      </select>
    </label>
    <label>
      Serial persistence
      <select data-param="serial">
        <option value="0.55">low</option>
        <option value="0.75">medium</option>
        <option value="0.86" selected>high</option>
        <option value="0.93">very high</option>
      </select>
    </label>
    <label>
      Feature noise
      <select data-param="noise">
        <option value="0.45">low</option>
        <option value="0.75" selected>medium</option>
        <option value="1.05">high</option>
      </select>
    </label>
    <label>
      Folds
      <select data-param="folds">
        <option value="4">4</option>
        <option value="5" selected>5</option>
        <option value="6">6</option>
        <option value="8">8</option>
      </select>
    </label>
    <label>
      Embargo
      <select data-param="embargo">
        <option value="0">0 days</option>
        <option value="5">5 days</option>
        <option value="10" selected>10 days</option>
        <option value="20">20 days</option>
      </select>
    </label>
    <label>
      Model bandwidth
      <select data-param="bandwidth">
        <option value="0.45">narrow</option>
        <option value="0.65" selected>medium</option>
        <option value="0.9">wide</option>
      </select>
    </label>
    <label>
      Highlight
      <select data-param="highlight">
        <option value="random" selected>Shuffled K-fold</option>
        <option value="block">Blocked K-fold</option>
        <option value="purged">Purged + embargo</option>
        <option value="walk">Walk-forward</option>
      </select>
    </label>
  </div>
  <div class="purged-cv-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Cross-validation leakage lab comparing shuffled, blocked, purged, and walk-forward splits"></canvas>
  <div class="purged-cv-lab__legend">
    <span><i style="background:#0f766e"></i> Train</span>
    <span><i style="background:#be123c"></i> Test or leakage</span>
    <span><i style="background:#7c3aed"></i> Shuffled</span>
    <span><i style="background:#2563eb"></i> Blocked</span>
    <span><i style="background:#475569"></i> Walk-forward</span>
  </div>
  <p class="purged-cv-lab__note">
    Deterministic synthetic experiment. The point is not that the kernel model
    is a good trading model; the point is that the same legal feature matrix can
    produce very different validation estimates when labels overlap in event
    time.
  </p>
</div>
<script defer src="{{ '/assets/js/purged-cv-lab.js?v=20260613a' | relative_url }}"></script>

With the default settings, shuffled K-fold looks wonderful. It usually reports
around 72 percent accuracy while the final forward holdout is around 56
percent. The giveaway is the leakage counter: almost every shuffled test label
has at least one overlapping training label.

Blocked K-fold fixes the most cartoonish error: it stops scattering adjacent
rows into every fold. But it still trains on both sides of a test block. The
labels near the test boundary can overlap. Purged + embargo removes those
training rows. Walk-forward removes even more history because it refuses to
train on anything after the test fold.

Now change **Label horizon** from 5 to 30 days. Longer horizons create longer
event intervals. The same row split becomes more contaminated. Increase
**Serial persistence**. Neighboring features become more similar, so label
overlap becomes easier for the model to exploit. Increase **Embargo**. The
purged splitter keeps less training data, but its leakage counter remains at
zero.

The loss of training data is not a bug. It is the price of the claim.

## The Audit I Want in Every Backtest

A serious time-series validation report should not only print a score. It
should print the split hygiene:

- trade time and event time for every labeled sample;
- number of test labels whose event interval overlaps training labels;
- fraction of train/test event-interval pairs that overlap;
- embargo length and why it was chosen;
- number of training samples discarded by purging and embargoing;
- whether any fold trains on observations after the test fold;
- final untouched chronological holdout;
- sensitivity of the score to a larger gap.

That report changes the tone of a research conversation. Instead of arguing
whether random K-fold is "allowed" for time series in the abstract, you can ask:

```text
Which test labels are represented in the training labels?
```

If the answer is "many," the validation score is not a forecast of deployment.
It is a measurement of a contaminated experiment.

## A Split Can Be Too Honest Too

There is a real trade-off here. Purging and embargoing throw away data. A
walk-forward split can have high variance because early folds train on little
history. A very large embargo can make the model look worse simply because it
starves the learner. That is why the correct output is not one blessed number.

The correct output is a curve:

```text
score as a function of purge width, embargo width, horizon, and regime
```

If the research conclusion survives that curve, I trust it more. If the alpha
exists only when the gap is zero, it is probably not alpha. It is the shape of
the split.

This is especially important for machine-learning finance because the model is
often flexible enough to exploit weak artifacts. A linear model may merely be
fooled. A nearest-neighbor model, random forest, boosted tree, or transformer
can quietly become an index of local history. The model does not need to know
that it is cheating. It only needs a feature representation in which nearby
events are close.

## The Unfinished Part

I would like backtesting libraries to treat label intervals as first-class
objects. Not optional metadata. Not comments in a notebook. Objects.

Every labeled sample should carry:

```text
feature_time
label_start_time
label_end_time
asset_or_entity_id
construction_version
```

Then splitters could refuse invalid folds by construction. Model-selection
reports could include a leakage matrix. Hyperparameter searches could carry the
same event-time firewall that the final backtest uses. Feature-importance
plots could be annotated with the actual split contract under which they were
estimated.

The most dangerous validation bugs are the ones that look statistically
professional. A five-fold score with confidence intervals feels rigorous. If
the folds share label intervals, the rigor is decorative.

A fold has a memory. The validation job is to decide how much of that memory
must be erased before the score deserves to be believed.

## Reading Notes

[^afml]: Marcos Lopez de Prado, *Advances in Financial Machine Learning*, Wiley, 2018. The table of contents includes chapters on labeling, overlapping outcomes, sample uniqueness, and "Why K-Fold CV Fails in Finance" with "Purged K-Fold CV," purging, and embargo. [PhilPapers entry](https://philpapers.org/rec/LPEAIF), [Wiley](https://www.wiley.com/en-us/Advances%2Bin%2BFinancial%2BMachine%2BLearning-p-9781119482086).

[^sklearn]: scikit-learn, `TimeSeriesSplit` documentation. The splitter is for time-ordered data and includes a `gap` parameter excluding samples before the test set. [Documentation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).

[^hblock]: Prabir Burman, Edmond Chow, and Deborah Nolan, "A Cross-Validatory Method for Dependent Data," *Biometrika*, 1994. [PDF](https://users.ssc.wisc.edu/~behansen/718/BurmanChowNolan1994.pdf).

[^racine]: Jeff Racine, "Consistent Cross-Validatory Model-Selection for Dependent Data: hv-Block Cross-Validation," *Journal of Econometrics*, 2000. [IDEAS/RePEc](https://ideas.repec.org/a/eee/econom/v99y2000i1p39-61.html).

[^roberts]: David R. Roberts et al., "Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure," *Ecography*, 2017. [Publication page](https://research.wright.edu/en/publications/cross-validation-strategies-for-data-with-temporal-spatial-hierar/), [DOI](https://doi.org/10.1111/ecog.02881).

[^bergmeir]: Christoph Bergmeir, Rob J. Hyndman, and Bonsoo Koo, "A Note on the Validity of Cross-Validation for Evaluating Autoregressive Time Series Prediction," *Computational Statistics & Data Analysis*, 2018. [Rob Hyndman's publication page](https://robjhyndman.com/publications/cv-time-series/), [PDF](https://robjhyndman.com/papers/cv-wp.pdf).
