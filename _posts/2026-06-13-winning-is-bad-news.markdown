---
layout: post
title: "Winning Can Be Bad News"
description: "In a common-value auction, winning is not just success. It is evidence that your estimate was unusually optimistic."
date: 2026-06-13 19:12:00 -0400
categories: quantitative-finance
tags: [auctions, winners-curse, common-value, mechanism-design, selection-bias, quantitative-finance]
excerpt: "The winner's curse is not folk wisdom about greedy bidders. It is the moment the event of winning changes what your signal means."
---

The cruelest sentence in auction theory is:

```text
congratulations, you won
```

In a private-value auction, that may simply mean you valued the object more than
everyone else did. A painting fits this story well enough. If it will hang on
your wall, your willingness to pay can be personal.

In a common-value auction, the object is worth roughly the same thing to
everyone, but nobody sees that value perfectly. Oil leases, mortgage pools,
takeover targets, ad inventory, distressed debt, cloud capacity, and crowded
alpha signals all have this flavor. Each bidder sees a noisy signal about one
shared value.

Now winning means something sharper. It means your bid beat the field. If bids
are increasing in signals, that means your signal was one of the most optimistic
signals in the room.

Winning is information about your error.

## Do Not Export Vickrey Too Far

Vickrey's second-price auction is one of the most beautiful mechanisms in
economics.[^vickrey] With independent private values, bidding your true value is
a dominant strategy. If you win, you pay the second-highest bid, not your own.
Raising your bid cannot lower the price you pay, and lowering your bid can only
make you lose objects you would have wanted.

That theorem is real. It is also easy to overexport.

The word "value" is doing a lot of work. In the private-value model, my value is
my payoff from owning the object. If I win at a price below that value, I am
happy. Your value is different from mine.

In a common-value model, my "value estimate" is not my payoff. It is a noisy
measurement of a payoff that everyone shares. If I bid that measurement, I am
not bidding my value. I am bidding an estimate that has already survived a
selection process.

Wilson's early common-value model made the strategic problem explicit: bidders
must shade bids because the act of winning says their information was
favorable.[^wilson] Milgrom and Weber later gave the classic affiliated-values
framework, where bidders' signals are statistically linked and auction formats
can reveal or conceal useful information.[^milgrom-weber]

The small but dangerous mistake is to say:

```text
second price means truthful bidding
```

The better sentence is:

```text
second price makes truthful bidding dominant under independent private values
```

Those extra words are the guardrail.

## A Small Auction House

Here is a synthetic auction house.

Each auction sells one object with true value

$$
V \sim N(100, \tau^2).
$$

Each bidder $$i$$ observes

$$
S_i = V + \epsilon_i,\qquad \epsilon_i \sim N(0, \sigma^2).
$$

The auction is sealed-bid second price with an optional reserve. The lab compares
three deliberately simple bidding rules:

- **signal** bids $$S_i$$ directly;
- **posterior** bids $$E[V \mid S_i]$$, shrinking the signal toward 100;
- **winner-aware** subtracts a crude order-statistic adjustment for the fact
  that the winner's signal is selected from the high tail.

The third rule is not an equilibrium solver. It is a didactic correction. The
point is to make the conditioning visible: your estimate should change after you
learn that your estimate won.

<div id="winners-curse-lab" class="winners-curse-lab" data-winners-curse-lab>
  <div class="winners-curse-lab__controls">
    <label>
      Bidders: <output data-value="bidders">7</output>
      <input type="range" min="2" max="12" step="1" value="7" data-param="bidders">
    </label>
    <label>
      Auctions: <output data-value="trials">2.4k</output>
      <input type="range" min="400" max="6000" step="200" value="2400" data-param="trials">
    </label>
    <label>
      Value volatility: <output data-value="valueVol">$20.0</output>
      <input type="range" min="2" max="50" step="1" value="20" data-param="valueVol">
    </label>
    <label>
      Signal noise: <output data-value="signalNoise">$25.0</output>
      <input type="range" min="1" max="60" step="1" value="25" data-param="signalNoise">
    </label>
    <label>
      Winner adjustment: <output data-value="adjustment">100.0%</output>
      <input type="range" min="0" max="160" step="5" value="100" data-param="adjustment">
    </label>
    <label>
      Reserve: <output data-value="reserve">$0.00</output>
      <input type="range" min="0" max="130" step="5" value="0" data-param="reserve">
    </label>
  </div>
  <div class="winners-curse-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="700" aria-label="Common-value auction simulator showing winner profit, winner signal selection, bidder-count effects, and auction diagnostics"></canvas>
  <div class="winners-curse-lab__legend">
    <span><i style="background:#be123c"></i> Signal bid</span>
    <span><i style="background:#2563eb"></i> Posterior bid</span>
    <span><i style="background:#0f766e"></i> Winner-aware bid</span>
    <span><i style="background:#d97706"></i> Winner signal bias</span>
  </div>
  <p class="winners-curse-lab__note">
    Deterministic synthetic common-value auctions. In each counterfactual market,
    every bidder uses the same rule. The winner-aware rule is a transparent
    posterior-minus-selection adjustment, not a claim about equilibrium bidding.
  </p>
</div>
<script defer src="{{ '/assets/js/winners-curse-lab.js?v=20260613a' | relative_url }}"></script>

At the default setting, the signal bidder wins often and loses money. That is
not because the auctioneer is cheating. It is because the highest signal is
usually too high.

Increase **Bidders**. The signal bidder's winner overestimate rises. With more
draws from the same noisy distribution, the maximum noise term becomes more
extreme. The price is not just a market-clearing number; it is an order
statistic of other people's errors.

Lower **Signal noise**. The curse almost disappears. When signals are precise,
winning tells you much less about being lucky. The winner still has the high
signal, but the signal does not contain much noise to select on.

Set **Winner adjustment** to zero. The winner-aware rule collapses to the plain
posterior rule. That rule knows the signal is noisy, but it does not know that
the winning signal is special.

## Winning Changes the Posterior

The whole idea fits in one inequality:

$$
E[V \mid S_i=s,\ i\text{ wins}] < E[V \mid S_i=s].
$$

The right side says: "I observed signal $$s$$."

The left side says: "I observed signal $$s$$ and also learned that every rival's
bid was lower."

In a common-value world, those are different events. If everyone's signal is
noisy evidence about the same hidden value, then rivals' lower signals are bad
news about the object. Winning reveals that bad news indirectly.

The Bayesian posterior from one Gaussian signal is simple. If the prior variance
is $$\tau^2$$ and the signal noise variance is $$\sigma^2$$, then

$$
E[V \mid S=s] = 100 +
\frac{\tau^2}{\tau^2 + \sigma^2}(s - 100).
$$

This is just shrinkage. A signal of 140 does not mean the object is worth 140 if
signals are noisy. Some of that number is value, and some is measurement error.

The winner's curse is the next layer. The winning bidder's signal is not a
typical signal. It is the top signal among bidders who were all sampling the
same object. Even after shrinkage, the event "this signal won" carries
additional information.

This is why the curse gets worse with bidder count. The expected maximum of
independent noise grows with the number of bidders. Competition does not merely
raise prices. It selects more aggressively for optimism.

## The Lab Results Hurt

The winner's curse became famous partly because people kept falling into it.

Kagel and Levin's laboratory common-value auctions found that bidders often bid
too aggressively and earned negative profits, especially as the number of
bidders increased.[^kagel-levin] The result is uncomfortable because the setup is
clean. Participants are not buying oil fields with geological ambiguity,
political risk, and debt covenants. They are playing a controlled auction with a
well-defined value process.

The lesson is not that humans are uniquely foolish. The lesson is that the
conditioning is cognitively unnatural. We are good at thinking:

```text
my signal is high, so the object is likely good
```

We are worse at thinking:

```text
my signal is high enough to beat other signals, so part of its height is likely luck
```

Markets institutionalize this mistake whenever a process rewards the most
optimistic estimate and then treats the winning estimate as if it were unbiased.

## Finance Keeps Wearing Auction Costumes

Many finance problems are common-value auctions with different stationery.

An acquisition auction is the obvious case. The target has one uncertain value.
Each bidder has a model. The winner is likely to be the bidder whose synergy
estimate, revenue forecast, cost-cutting plan, or financing assumption was most
optimistic. Paying the second-highest bid does not remove the problem if the
second-highest bid is also conditioned on a noisy common value.

A distressed-debt process has the same smell. Everyone is underwriting recovery
value, legal timing, liquidity, and macro outcomes. The buyer who wins may be
the buyer whose model was least bothered by the ugly tail.

Quant research has a cousin of the same problem. A team tests many signals, and
the one that survives is the one with the highest estimated Sharpe. The strategy
did not "bid" in an auction, but selection chose the most optimistic estimate.
The backtest winner is an order statistic too.

Even cloud spot markets and ad auctions can inherit common-value components.
The private value of a unit may differ across buyers, but shared uncertainty
about future demand, conversion quality, or resale value creates a common-value
layer. A mechanism can be truthful for private values and still leave bidders
with a forecasting problem about the common part.

The practical question is not "is this auction private value or common value?"
Most real settings are mixed. The question is:

```text
how much of my bid is my idiosyncratic value, and how much is a noisy estimate of a shared value?
```

The second part deserves a winner's-curse discount.

## Revenue Is Not Buyer Wisdom

From the seller's point of view, the winner's curse is not automatically bad.
Competition and noisy information can raise expected payments. Auction design is
partly about extracting surplus, partly about allocating the object efficiently,
and partly about making participation robust enough that informed bidders show
up.

Myerson's optimal auction theory shows how reserve prices and allocation rules
can maximize expected revenue under private values using virtual valuations.[^myerson]
Riley and Samuelson developed related optimal-auction results around reserve
pricing and entry.[^riley-samuelson] Klemperer's surveys emphasize that real
auction design also turns on entry, collusion, information, and the risk that a
format deters precisely the bidders the seller needs.[^klemperer]

Common values add another design tension. If bidders fear severe adverse
selection, they shade aggressively or stay home. Revealing more public
information can reduce the winner's curse, but it may also change revenue and
participation. Milgrom and Weber's linkage principle formalizes one version of
this idea: when signals are affiliated, committing to reveal information can
raise expected revenue in important auction environments.[^milgrom-weber]

So the seller's dream is not simply "make everyone bid naively." That can work
once. A market that repeatedly punishes winners may train bidders to disappear,
collude, or demand wider discounts.

## Questions Before Raising the Paddle

Before bidding on a noisy common-value object, I want a separate memo answering:

- What is the shared-value component of the asset?
- Which parts of our model are private synergies and which parts are common
  forecasts?
- How many serious bidders are in the process?
- What information will we learn if we win?
- What information would we infer if we lose narrowly?
- How correlated are bidders' information sources?
- Does the auction reveal rival signals, interim prices, reserve levels, or
  only the final allocation?
- What bid would be optimal under our standalone posterior?
- What discount is required after conditioning on winning?
- How sensitive is the bid to signal noise, bidder count, and reserve price?

The most important line is the fourth one. A bid committee should explicitly ask
what winning would teach it. If the answer is "nothing," the committee is
silently assuming private values.

Sometimes that assumption is fine. Sometimes it is expensive.

## The Sentence to Keep

The winner's curse is not a proverb about overpaying.

It is a selection-bias theorem with a price tag. When values are common and
signals are noisy, the winner is selected partly for favorable error. The higher
the noise and the more intense the competition, the more suspicious the winning
signal should become.

This is why "we won the auction" should not end the analysis. It should start a
post-mortem:

```text
what did winning reveal about the estimate that made us win?
```

If the answer lowers the value, that is not pessimism. It is Bayes being polite.

## Further Reading

[^vickrey]: William Vickrey, ["Counterspeculation, Auctions, and Competitive Sealed Tenders"](https://cramton.umd.edu/market-design-papers/vickrey-counterspeculation-auctions-and-competitive-sealed-tenders.pdf), *Journal of Finance*, 1961. DOI: [10.1111/j.1540-6261.1961.tb02789.x](https://doi.org/10.1111/j.1540-6261.1961.tb02789.x).

[^wilson]: Robert B. Wilson, ["Competitive Bidding with Asymmetric Information"](https://cramton.umd.edu/market-design-papers/wilson-competitive-bidding-with-asymmetric-information.pdf), *Management Science*, 1967. DOI page: [INFORMS](https://pubsonline.informs.org/doi/10.1287/mnsc.13.11.816).

[^milgrom-weber]: Paul R. Milgrom and Robert J. Weber, ["A Theory of Auctions and Competitive Bidding"](https://cramton.umd.edu/market-design-papers/milgrom-weber-a-theory-of-auctions-and-competitive-bidding.pdf), *Econometrica*, 1982. A course-hosted copy is also available from [Princeton](https://www.cs.princeton.edu/courses/archive/spr10/cos444/papers/milgrom_weber82.pdf).

[^kagel-levin]: John H. Kagel and Dan Levin, ["The Winner's Curse and Public Information in Common Value Auctions"](https://econpapers.repec.org/RePEc%3Aaea%3Aaecrev%3Av%3A76%3Ay%3A1986%3Ai%3A5%3Ap%3A894-920), *American Economic Review*, 1986.

[^myerson]: Roger B. Myerson, ["Optimal Auction Design"](https://cramton.umd.edu/market-design-papers/myerson-optimal-auction-design.pdf), *Mathematics of Operations Research*, 1981. DOI: [10.1287/moor.6.1.58](https://doi.org/10.1287/moor.6.1.58).

[^riley-samuelson]: John G. Riley and William F. Samuelson, ["Optimal Auctions"](https://www.cs.princeton.edu/courses/archive/spr08/cos444/papers/riley_samuelson81.pdf), *American Economic Review*, 1981. RePEc entry: [EconPapers](https://econpapers.repec.org/RePEc%3Aaea%3Aaecrev%3Av%3A71%3Ay%3A1981%3Ai%3A3%3Ap%3A381-92).

[^klemperer]: Paul Klemperer, ["What Really Matters in Auction Design"](https://regulationbodyofknowledge.org/wp-content/uploads/2013/03/Klemperer_What_Really_Matters.pdf), *Journal of Economic Perspectives*, 2002. See also his survey ["Auction Theory: A Guide to the Literature"](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=172650).
