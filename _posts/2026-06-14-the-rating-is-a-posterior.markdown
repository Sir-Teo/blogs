---
layout: post
title: "The Rating Is a Posterior"
description: "Elo-like ratings are not prizes. They are online estimates of latent skill from noisy pairwise comparisons, and the missing number is uncertainty."
date: 2026-06-14 00:55:00 -0400
categories: gaming
tags: [elo, glicko, trueskill, matchmaking, bayesian-inference, paired-comparisons, gaming, statistics]
excerpt: "A ladder should not only ask who is rated 1800. It should ask how much evidence supports 1800, how fast the player is changing, and whether the number is safe to use for matchmaking."
---

The leaderboard number looks like a fact.

`1847`.

It has the aesthetic of measurement: precise, sortable, public. It fits in a
badge. It can be used to seed tournaments, match opponents, gate ranked queues,
grant titles, and start arguments.

But a rating is not a prize.

It is an estimate of a hidden variable.

The hidden variable is skill. We do not observe it directly. We observe noisy
outcomes of games between players whose skill may be changing. A rating system
is an online inference machine that turns those outcomes into a belief about
skill.

Once you say it that way, the missing number becomes obvious.

```text
rating = estimate + uncertainty
```

Elo gives the estimate. Glicko and TrueSkill made the uncertainty harder to
ignore.[^glicko][^trueskill]

## The Paired-Comparison Contract

Most rating systems start with a paired-comparison model. Player `i` plays
player `j`. The system sees a result:

```text
win, loss, draw, rank, score, or team outcome
```

The simplest binary version says:

$$
\Pr(i \text{ beats } j)
=
\sigma(\theta_i - \theta_j),
$$

where $$\theta_i$$ and $$\theta_j$$ are latent skills and $$\sigma$$ is a
monotone link function. Bradley and Terry's 1952 model is the classic logistic
form.[^bradley-terry] Thurstone-style models use Gaussian performance noise.
The distinction matters, but the shared idea is more important: outcomes are
probabilistic evidence about relative strength.

Elo's chess rating system is an online version of this grammar.[^elo] In a
common logistic Elo form:

$$
E_i
=
\frac{1}{1 + 10^{-(R_i - R_j)/400}},
$$

and after the game:

$$
R_i \leftarrow R_i + K(S_i - E_i).
$$

Here $$S_i$$ is the observed score, usually 1 for win, 0.5 for draw, and 0 for
loss. The term $$S_i - E_i$$ is the surprise. Beat a stronger player and the
surprise is positive. Lose to a weaker player and it is negative. The parameter
$$K$$ decides how much the new evidence moves the estimate.

This is beautifully compact. It is also hiding several questions inside one
knob:

1. How uncertain is the player's current rating?
2. How uncertain is the opponent's rating?
3. How noisy is this game mode?
4. How quickly can skill change?
5. Is this player new, inactive, returning, sandbagging, improving, or stable?

A fixed $$K$$ has to answer all of them with one number.

That is too much responsibility for one letter.

## Reliability Is Part of the Rating

Glickman's Glicko system makes the reliability problem explicit. Its technical
description starts from the weakness of Elo when two players have the same
rating but very different evidence behind that rating.[^glicko]

Imagine two 1700-rated players:

1. one has played 400 recent games against known opponents;
2. one has played 3 games after returning from a long break.

The displayed rating is the same. The belief should not be.

Glicko attaches a rating deviation to the rating. TrueSkill uses a Gaussian
belief over player skill, often summarized as a mean $$\mu$$ and standard
deviation $$\sigma$$.[^trueskill] The public number can even be conservative:

$$
\mathrm{exposure} = \mu - c\sigma.
$$

That conservative value says:

```text
do not rank someone as elite until the uncertainty has been paid down
```

This matters for online games. New accounts, returning players, smurfs,
specialists, team modes, asymmetric roles, balance patches, and seasonal resets
all create uncertainty. A visible number without uncertainty encourages the
wrong social interpretation:

```text
1847 means this person is exactly 1847-good
```

No. It means the current evidence has been compressed into a point estimate.
Sometimes that compression is harmless. Sometimes it is the bug.

## A Rating Lab

The lab below simulates a small ladder. Each player has a hidden true skill.
Match outcomes are noisy paired comparisons. True skill drifts slowly over
time. A strong new player enters partway through the season with no rating
history.

Two online systems see the same matches:

1. **Fixed-K Elo:** one rating per player, one update size.
2. **Uncertainty-aware filter:** a toy Gaussian-style mean and uncertainty. New
   or uncertain players move faster; stable players move slower; uncertainty
   shrinks with informative games and grows with drift.

The second system is not exact Glicko or exact TrueSkill. It is a deliberately
small executable model of their central lesson: a rating should carry
reliability.

<style>
  .rating-lab {
    background: #ffffff;
    border: 1px solid #d8e0e8;
    border-radius: 8px;
    box-sizing: border-box;
    color: #172026;
    margin: 2rem 0;
    padding: 1rem;
  }

  .rating-lab__controls {
    display: grid;
    gap: 0.85rem 1rem;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }

  .rating-lab__controls label {
    color: #46515c;
    display: grid;
    font-size: 0.86rem;
    font-weight: 650;
    gap: 0.35rem;
    line-height: 1.25;
  }

  .rating-lab__controls input {
    accent-color: #0f766e;
    width: 100%;
  }

  .rating-lab__controls output {
    color: #172026;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .rating-lab__metrics {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    margin: 1rem 0 0.85rem;
  }

  .rating-lab__metric {
    background: #f8fafc;
    border: 1px solid #e3e9ef;
    border-radius: 6px;
    min-height: 4.1rem;
    padding: 0.62rem 0.7rem;
  }

  .rating-lab__metric span,
  .rating-lab__legend,
  .rating-lab__note {
    color: #5d6872;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .rating-lab__metric span {
    display: block;
  }

  .rating-lab__metric strong {
    color: #172026;
    display: block;
    font-size: 0.98rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    margin-top: 0.25rem;
  }

  .rating-lab canvas {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .rating-lab__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.9rem;
    margin-top: 0.8rem;
  }

  .rating-lab__legend span {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .rating-lab__legend i {
    border-radius: 999px;
    display: inline-block;
    height: 0.68rem;
    width: 0.68rem;
  }

  .rating-lab__note {
    margin: 0.85rem 0 0;
  }
</style>

<div class="rating-lab" data-rating-posterior-lab>
  <div class="rating-lab__controls">
    <label>
      Outcome noise: <output data-value="outcomeNoise">420</output>
      <input type="range" min="240" max="620" step="10" value="420" data-param="outcomeNoise">
    </label>
    <label>
      Skill drift: <output data-value="drift">26%</output>
      <input type="range" min="0" max="80" step="1" value="26" data-param="drift">
    </label>
    <label>
      Elo K factor: <output data-value="kFactor">32</output>
      <input type="range" min="8" max="64" step="1" value="32" data-param="kFactor">
    </label>
    <label>
      Uncertainty growth: <output data-value="uncertaintyGrowth">38%</output>
      <input type="range" min="0" max="90" step="1" value="38" data-param="uncertaintyGrowth">
    </label>
    <label>
      Matchmaking tightness: <output data-value="matchmaking">70%</output>
      <input type="range" min="0" max="100" step="1" value="70" data-param="matchmaking">
    </label>
    <label>
      Late entrant strength: <output data-value="newcomerStrength">+620</output>
      <input type="range" min="0" max="900" step="10" value="620" data-param="newcomerStrength">
    </label>
  </div>
  <div class="rating-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Rating system simulator comparing fixed-K Elo and an uncertainty-aware rating filter under drift, noisy outcomes, matchmaking, and a late strong entrant"></canvas>
  <div class="rating-lab__legend">
    <span><i style="background:#172026"></i> True skill</span>
    <span><i style="background:#2563eb"></i> Elo</span>
    <span><i style="background:#0f766e"></i> Uncertainty mean</span>
    <span><i style="background:#7c3aed"></i> Conservative rating</span>
    <span><i style="background:#be123c"></i> Late entrant</span>
  </div>
  <p class="rating-lab__note">
    Deterministic toy model. The uncertainty-aware filter is inspired by
    Glicko/TrueSkill ideas, but it is not a faithful implementation of either
    production system.
  </p>
</div>
<script src="{{ '/assets/js/rating-posterior-lab.js?v=20260614a' | relative_url }}"></script>

Start with the default. The uncertainty-aware mean usually tracks hidden skill
with lower error than fixed-K Elo. More interestingly, the late strong player
moves quickly because the system admits it knows little. But the conservative
rating, mean minus uncertainty, does not instantly place that player at the top
of the ladder.

That is the right tension:

```text
matchmaking wants the mean
leaderboards want caution
```

Raise **late entrant strength**. Elo adapts, but slowly, because the same $$K$$
is used for a new account and a well-measured veteran. The uncertainty-aware
filter gives the new account larger updates, then shrinks uncertainty as games
arrive.

Raise **skill drift**. Stable historical evidence becomes less trustworthy. A
rating system that never re-opens uncertainty becomes overconfident about old
information. This is one reason seasons, decay, inactivity inflation, and
volatility parameters exist.

Raise **outcome noise**. A game with high randomness should move ratings less
per match than a game with low randomness. If outcomes are noisy, a single upset
is weak evidence. If outcomes are sharp, the same upset is stronger evidence
that the rating was wrong.

Raise **matchmaking tightness**. Close matches are fun and informative near the
decision boundary, but they also make it harder to sort the very top if strong
players rarely meet enough diverse opponents. A ladder is not just a model. It
is also an experimental design.

## Matchmaking and Ranking Are Different Products

A common mistake is to use one public number for every job.

For matchmaking, the system wants a predictive distribution:

$$
\Pr(i \text{ beats } j \mid \mathcal{D}).
$$

The mean matters because it predicts game balance. The uncertainty matters
because a wide distribution says the next game is also a measurement.

For a public leaderboard, the product question changes. The cost of over-ranking
an uncertain player can be high. A conservative exposure like $$\mu - 2\sigma$$
or $$\mu - 3\sigma$$ says: put the player where the evidence can defend them.

This is not cowardice. It is epistemic accounting.

The same player can have:

1. a matchmaking mean,
2. a conservative public rank,
3. a provisional badge,
4. a role-specific rating,
5. a team-mode posterior,
6. a decay/inactivity state.

Compressing all of that into one integer is sometimes good interface design.
It is rarely good statistical thinking.

## The Ladder Is an Experiment

Ratings are not learned from neutral data. The ladder chooses who plays whom.

If the matchmaker mostly pairs equal visible ratings, the system gets many close
games, which are good for player experience. But it may get fewer direct tests
between separated regions of the ladder. If parties, regions, queues, roles,
time zones, smurf detection, or avoidance systems constrain pairings, the
comparison graph becomes uneven.

Bradley-Terry is a model for paired comparisons. The ladder decides which pairs
exist.

That is why rating-system engineering is not only about the update formula. It
is about data collection:

1. How connected is the comparison graph?
2. Are new players tested broadly or only against other uncertain players?
3. Do high-rated players mostly play each other?
4. Does the system observe teams, roles, maps, patches, and parties?
5. How fast does evidence expire after balance changes?

A rating can be mathematically elegant and operationally blind.

## Why Games Are Harder Than Chess

Chess is already difficult: draws, color advantage, inactivity, junior
improvement, rating inflation, changing pools. Online games add more trouble.

Players can queue in teams. A support player and a carry player may contribute
in different ways. Maps and patches change the game. Matchmaking itself changes
the data distribution. A player can have different strengths by character,
role, region, input device, mode, or time of day. Anti-cheat and smurf detection
become part of measurement.

TrueSkill was built for this world: online multiplayer games with teams,
multiple competitors, draws, and the need to infer individual skill from team
results.[^trueskill] Herbrich's summary of the system emphasizes that the goal
is not merely ranking, but identifying and tracking skills so players can be
matched into competitive games.[^herbrich]

The key word is tracking.

Skill is not a fixed label. It is a state.

That makes rating closer to filtering than accounting. The system observes a
noisy stream, updates a belief, and decides what action to take next.

## What I Want From a Rating System

If I were auditing a ranked ladder, I would not start with the prettiness of the
leaderboard. I would ask for calibration and uncertainty evidence.

1. For players rated near 1600, do they win about the predicted amount against
   1500, 1600, and 1700 opponents?
2. Do 90% intervals contain the future estimated skill about 90% of the time?
3. How many games does a strong new player need before matchmaking stops
   harming opponents?
4. How often does the conservative leaderboard later reverse itself?
5. How does rating error vary by games played, role, party size, region, queue,
   and patch?
6. How much of the update comes from skill evidence versus matchmaker
   selection?

The public argument is usually about whether someone "deserves" a number. The
engineering question is better:

```text
what decisions is this number safe enough to support?
```

Matchmaking, prestige, tournament seeding, anti-smurfing, rewards, and balance
analytics may need different safety thresholds.

## A Rating Is a Promise

A rating system makes a promise to players:

```text
we will put you in games that make sense
```

The leaderboard is only the visible surface of that promise. Underneath it is a
model of uncertainty, a policy for exploration, a memory of drift, and a graph
of who was allowed to compare against whom.

Elo's great gift was not the exact constant 400 or the ritual of a K factor. It
was the idea that pairwise outcomes could be turned into a portable measurement
system. The modern lesson is that the measurement is incomplete without
reliability.

The rating is not the player.

The rating is the current posterior summary of what the ladder has managed to
learn.

[^bradley-terry]: Ralph Allan Bradley and Milton E. Terry, "Rank Analysis of Incomplete Block Designs: I. The Method of Paired Comparisons," *Biometrika* 39, no. 3/4, 1952, 324-345. DOI: [10.1093/biomet/39.3-4.324](https://doi.org/10.1093/biomet/39.3-4.324). JSTOR: [2334029](https://www.jstor.org/stable/2334029).

[^elo]: Arpad E. Elo, *The Rating of Chessplayers, Past and Present*, Arco, 1978. Google Books record: [The Rating of Chessplayers, Past and Present](https://books.google.com/books/about/The_Rating_of_Chessplayers_Past_and_Pres.html?id=8pMnAQAAMAAJ). A scanned copy is mirrored at [gwern.net](https://gwern.net/doc/statistics/order/comparison/1978-elo-theratingofchessplayerspastandpresent.pdf).

[^glicko]: Mark E. Glickman, "The Glicko System," technical description, 1995/1999. PDF: [glicko.net/research/gdescrip.pdf](https://www.glicko.net/research/gdescrip.pdf). See also Glickman, "Rating the Chess Rating System," *Chance*, 1999: [math.bu.edu/people/mg/research/chance.pdf](https://math.bu.edu/people/mg/research/chance.pdf).

[^trueskill]: Ralf Herbrich, Tom Minka, and Thore Graepel, "TrueSkill: A Bayesian Skill Rating System," *Advances in Neural Information Processing Systems* 19, 2006/2007. PDF: [papers.neurips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system.pdf](https://papers.neurips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system.pdf).

[^herbrich]: Ralf Herbrich, "Computer Gaming: Ranking and Matchmaking," summary of TrueSkill research and gaming applications: [herbrich.me/computer-gaming](https://herbrich.me/computer-gaming/).

[^review]: Mark E. Glickman and Albyn C. Jones, "Models and Rating Systems for Head-to-Head Competition," *Annual Review of Statistics and Its Application* 12, 2025, 259-282. DOI: [10.1146/annurev-statistics-040722-061813](https://doi.org/10.1146/annurev-statistics-040722-061813).
