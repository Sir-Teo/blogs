---
layout: post
title: "A Survival Curve Is a Missing-Data Contract"
description: "Kaplan-Meier curves do not magically solve missing follow-up. They encode an assumption about censored futures, and that assumption can be the result."
date: 2026-06-13 18:48:00 -0400
categories: statistics
tags: [survival-analysis, censoring, kaplan-meier, hazards, missing-data, churn, statistics]
excerpt: "Time-to-event analysis is not just about events. It is about the people whose futures leave the dataset before the event happens."
---

A survival curve looks like a calm object.

It starts at one. It steps down. It says:

```text
what fraction has not had the event yet?
```

That question appears in medicine, reliability engineering, credit risk,
subscription churn, user retention, unemployment spells, fraud investigations,
and machine-learning monitoring. How long until death, failure, default,
cancellation, reactivation, relapse, conversion, or escalation?

But a survival curve is not only a curve of events. It is a contract about
missing futures.

Some people have the event. Some reach the end of follow-up. Some disappear
before either happens. They move, unsubscribe, stop logging in, leave the study,
change insurers, switch devices, become unobservable, or simply have not been
watched long enough.

Those missing futures are called censoring. The hard question is not whether
censoring exists. It always exists. The hard question is whether the censored
people are exchangeable with the people who remained under observation.

## The Product-Limit Trick

Kaplan and Meier's 1958 estimator is one of the great small machines in
statistics.[^kaplan-meier] At each observed event time $$t_j$$, let:

- $$n_j$$ be the number still at risk just before $$t_j$$;
- $$d_j$$ be the number of events at $$t_j$$.

The Kaplan-Meier estimate is

$$
\widehat{S}(t)
=
\prod_{t_j \le t}
\left(1 - \frac{d_j}{n_j}\right).
$$

The estimator does not pretend censored people had no event. It keeps them in the
risk set until the last time they were known to be event-free, then removes them
from later denominators.

That is the brilliance. It is also the assumption.

If a censored person at month 8 had the same future risk, conditional on what we
know, as similar people still visible at month 8, the product-limit estimator is
doing the right accounting. If people disappear because their event risk changed,
the curve is now partly a model of disappearance.

Try the lab. It simulates a population where we know every true event time. Then
it hides some futures through censoring and asks what the measured survival curve
would say.

<div id="survival-censoring-lab" class="survival-censoring-lab" data-survival-censoring-lab>
  <div class="survival-censoring-lab__controls">
    <label>
      Cohort: <output data-value="cohort">420</output>
      <input type="range" min="80" max="1200" step="20" value="420" data-param="cohort">
    </label>
    <label>
      Follow-up: <output data-value="followup">24.0 mo</output>
      <input type="range" min="6" max="48" step="1" value="24" data-param="followup">
    </label>
    <label>
      Event hazard: <output data-value="eventHazard">3.50%</output>
      <input type="range" min="0.5" max="18" step="0.5" value="3.5" data-param="eventHazard">
    </label>
    <label>
      Censoring pressure: <output data-value="censorPressure">65.0%</output>
      <input type="range" min="0" max="80" step="1" value="65" data-param="censorPressure">
    </label>
    <label>
      Risk heterogeneity: <output data-value="riskSpread">100%</output>
      <input type="range" min="0" max="160" step="5" value="100" data-param="riskSpread">
    </label>
    <label>
      Informative censoring: <output data-value="informative">1.20</output>
      <input type="range" min="-120" max="120" step="5" value="120" data-param="informative">
    </label>
  </div>
  <div class="survival-censoring-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Survival analysis simulator comparing true survival, Kaplan-Meier survival, naive survival, risk set accounting, and censoring by latent risk"></canvas>
  <div class="survival-censoring-lab__legend">
    <span><i style="background:#7c3aed"></i> True survival</span>
    <span><i style="background:#0f766e"></i> Kaplan-Meier</span>
    <span><i style="background:#be123c"></i> Naive dashboard</span>
    <span><i style="background:#d97706"></i> Censored</span>
    <span><i style="background:#64748b"></i> Administrative end</span>
  </div>
  <p class="survival-censoring-lab__note">
    Deterministic synthetic experiment. Every subject has a latent risk score,
    a true event time, and a censoring time. Kaplan-Meier sees only the observed
    time and whether it ended in an event or censoring. Positive informative
    censoring makes higher-risk subjects more likely to disappear before the
    administrative follow-up horizon.
  </p>
</div>
<script defer src="{{ '/assets/js/survival-censoring-lab.js?v=20260613a' | relative_url }}"></script>

With the default settings, the purple curve is the truth because the simulator
knows the future. The green curve is Kaplan-Meier. The red curve is a common
dashboard mistake: count recorded events and treat everyone else as still
surviving.

The red curve is not a survival estimator. It is a logging artifact.

Kaplan-Meier is much better. But when censoring is informative, even the green
curve can bend. Move **Informative censoring** toward zero and the green curve
usually moves closer to truth. Move it negative and lower-risk subjects disappear
first; now the observed risk set becomes too sick, and Kaplan-Meier can become
pessimistic.

This is the lesson:

```text
censoring is not deletion
censoring is a claim about the unobserved continuation
```

## At Risk Means Actually at Risk

The phrase "at risk" is doing real work.

A person is at risk at time $$t$$ if they have not yet had the event and are
still under observation just before $$t$$. They are not at risk after an event.
They are not at risk after censoring. They are not at risk after the study ends.

This is why a survival table should never report only a curve. It should also
report how many people remain at risk over time. A smooth-looking tail with
three people still under observation is not the same object as the first month
of a thousand-person cohort.

The risk-set panel in the lab is deliberately unromantic. It shows the
denominator being spent. Events remove people because the endpoint happened.
Censoring removes people because the endpoint became unobservable. Those are not
the same scientific fact, even if both remove rows from later denominators.

## Hazard Is Not Probability

Survival analysis also talks in hazards. Informally, the hazard is the
instantaneous event rate among those still at risk:

$$
h(t)
=
\lim_{\Delta t \to 0}
\frac{\Pr(t \le T < t+\Delta t \mid T \ge t)}{\Delta t}.
$$

The hazard is not the probability of the event by time $$t$$. It is a local rate
conditioned on still being event-free at $$t$$.

Cox's proportional hazards model made this language central.[^cox] It writes:

$$
h(t \mid x)
=
h_0(t)\exp(x^\top\beta).
$$

The baseline hazard $$h_0(t)$$ is left unspecified; covariates multiply the
hazard. This is powerful because it compares risk sets at event times without
requiring a fully parametric survival distribution.

But the same missing-data issue remains. A Cox model does not make informative
censoring disappear. It typically needs censoring to be independent conditional
on the covariates and history included in the analysis. If the reason someone
vanished is unmeasured and related to their future event time, the model is
estimating through a hole.

## The Hazard Ratio Is a Strange Creature

The hazard ratio is useful, but it is easy to over-read.

A hazard ratio of 0.75 does not mean "25% more people survive." It means the
instantaneous event rate among those still at risk is multiplied by 0.75 under
the model. That conditioning matters because the risk set changes over time.

Two curves can have the same hazard ratio and different absolute survival at a
horizon. Two curves can cross, making one constant hazard ratio a poor summary.
Two products can have the same monthly churn hazard but very different retention
value if one population starts with much higher baseline risk.

This is why restricted mean survival time is often refreshing. For a horizon
$$\tau$$,

$$
\operatorname{RMST}(\tau)
=
\int_0^\tau S(t)\,dt.
$$

It is the expected event-free time up to a chosen horizon. Royston and Parmar,
and later Uno and coauthors, argued for RMST as a more interpretable complement
or alternative when proportional hazards are doubtful.[^rmst][^uno]

In product language, RMST is close to:

```text
how many customer-months did this cohort keep before tau?
```

That is not always the only estimand you need. But it is hard to confuse with a
conditional instantaneous rate.

## Missingness Can Be the Product

Survival analysis was born in life testing and medical follow-up, but the same
trap appears in software and finance.

In subscription analytics, a user who stops opening the app may be censored from
some behavioral event but not from churn. In credit, a borrower who prepays is no
longer at risk of default under the original loan, but prepayment may be related
to credit quality. In fraud operations, an account that becomes unobservable
after platform migration may not be missing at random. In model monitoring, a
case that leaves the feedback loop before label arrival can make latency-to-label
look better than it is.

The event process and observation process are often coupled. People disappear
for reasons.

Robins, Rotnitzky, and Zhao developed inverse probability of censoring weighted
estimators for missing follow-up settings.[^robins] The broad idea is to weight
observed people by the inverse probability that their follow-up remained
observable, conditional on measured history. This does not solve unmeasured
informative censoring. It makes the missing-data contract explicit.

That is already a major improvement.

## Competing Events Are Not Ordinary Censoring

Another common mistake is treating a competing event as if it were ordinary
censoring.

If a patient dies before relapse, they are not merely "lost" for relapse
follow-up. If a borrower prepays before default, the original loan can no longer
default. If a user deletes an account before conversion, conversion under that
account has become impossible.

Kaplan-Meier answers a counterfactual question if competing events are censored:
what would happen if the competing event did not remove people from risk? That
can be useful for some scientific questions. It is not the same as the cumulative
incidence actually observed in a world with competing events. The Aalen-Johansen
estimator is the classic nonparametric tool for multi-state and competing-risk
settings.[^aalen-johansen]

The operational test is simple:

```text
after this event, can the endpoint still happen in the same system?
```

If no, do not casually call it loss to follow-up.

## A Run Sheet for Time-to-Event Reports

Before I trust a survival, retention, failure, or default curve, I want to know:

- what the time origin is;
- what exact event ends survival;
- what censoring means operationally;
- whether censoring is plausibly independent conditional on measured history;
- how many subjects are at risk at each displayed time;
- whether administrative censoring is separated from dropout;
- whether competing risks exist;
- whether median survival is estimable or "not reached";
- RMST at a predeclared horizon, not only hazard ratios;
- how sensitive results are to censoring assumptions;
- whether delayed labels or feedback-loop exits are counted as missing futures.

A censored subject is not a row to throw away. It is a person, loan, device,
session, machine, or account whose future became unobserved.

The survival curve is the visible part. The missing-data contract is the part
that decides what the visible part means.

## Notes

[^kaplan-meier]: E. L. Kaplan and Paul Meier, ["Nonparametric Estimation from Incomplete Observations"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1958.10501452), *Journal of the American Statistical Association*, 1958. DOI: [10.1080/01621459.1958.10501452](https://doi.org/10.1080/01621459.1958.10501452).

[^cox]: D. R. Cox, ["Regression Models and Life-Tables"](https://rss.onlinelibrary.wiley.com/doi/10.1111/j.2517-6161.1972.tb00899.x), *Journal of the Royal Statistical Society: Series B*, 1972. DOI: [10.1111/j.2517-6161.1972.tb00899.x](https://doi.org/10.1111/j.2517-6161.1972.tb00899.x).

[^rmst]: Patrick Royston and Mahesh K. B. Parmar, ["Restricted mean survival time: an alternative to the hazard ratio for the design and analysis of randomized trials with a time-to-event outcome"](https://link.springer.com/article/10.1186/1471-2288-13-152), *BMC Medical Research Methodology*, 2013.

[^uno]: Hajime Uno and coauthors, ["Moving beyond the hazard ratio in quantifying the between-group difference in survival analysis"](https://ascopubs.org/doi/abs/10.1200/JCO.2014.55.2208), *Journal of Clinical Oncology*, 2014.

[^robins]: James M. Robins, Andrea Rotnitzky, and Lue Ping Zhao, ["Analysis of Semiparametric Regression Models for Repeated Outcomes in the Presence of Missing Data"](https://www.tandfonline.com/doi/abs/10.1080/01621459.1995.10476493), *Journal of the American Statistical Association*, 1995.

[^aalen-johansen]: Odd O. Aalen and Soren Johansen, "An empirical transition matrix for non-homogeneous Markov chains based on censored observations," *Scandinavian Journal of Statistics*, 1978. JSTOR record: [4615704](https://www.jstor.org/stable/4615704).
