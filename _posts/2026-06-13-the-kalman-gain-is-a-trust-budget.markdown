---
layout: post
title: "The Kalman Gain Is a Trust Budget"
description: "A Kalman filter is not a smoothing trick. It is a recursive argument about how much to trust a model versus a noisy measurement."
date: 2026-06-13 17:43:00 -0400
categories: statistics
tags: [kalman-filter, state-space-models, time-series, signal-extraction, control, quantitative-finance]
excerpt: "The state is hidden, the sensor is noisy, and the model is only partly trusted. The Kalman gain is the number that says how much a new measurement is allowed to move belief."
---

A noisy line on a chart invites a familiar sin:

```text
smooth it until it looks like the thing you wanted to see
```

That is not a model. It is cosmetic signal processing.

The Kalman filter starts from a better question:

```text
what hidden state could have produced these measurements,
given a model of how states move and how sensors lie?
```

The state might be a vehicle position, an output gap, a latent efficient price,
a robot pose, a battery charge, a volatility component, or a slowly changing
quality score. The measurement might be a GPS fix, a macroeconomic release, a
trade print, a sensor packet, or a noisy metric. The filter does not say the
measurement is wrong. It says the measurement is evidence, and evidence has a
variance.

The beautiful object is the Kalman gain:

```text
how much can this measurement move my belief?
```

That number is not a tuning flourish. It is the trust budget implied by two
uncertainties: how uncertain the prediction is, and how noisy the measurement
is.

## The Smallest State-Space Model

Use the one-dimensional local-level model:

$$
x_t = x_{t-1} + w_t,
\qquad
w_t \sim N(0,Q),
$$

$$
y_t = x_t + v_t,
\qquad
v_t \sim N(0,R).
$$

The hidden state is $$x_t$$. The observation is $$y_t$$. The process variance
$$Q$$ says how much the state can genuinely move between observations. The
measurement variance $$R$$ says how noisy the sensor is.

The filter carries two beliefs before observing $$y_t$$:

$$
\hat{x}_{t|t-1},
\qquad
P_{t|t-1}.
$$

For the local-level model, prediction is simple:

$$
\hat{x}_{t|t-1} = \hat{x}_{t-1|t-1},
\qquad
P_{t|t-1} = P_{t-1|t-1} + Q.
$$

Then the measurement arrives. The innovation is the surprise:

$$
\nu_t = y_t - \hat{x}_{t|t-1}.
$$

Its predicted variance is:

$$
S_t = P_{t|t-1} + R.
$$

The scalar Kalman gain is:

$$
K_t
=
\frac{P_{t|t-1}}{P_{t|t-1}+R}.
$$

The update is:

$$
\hat{x}_{t|t}
=
\hat{x}_{t|t-1}
+ K_t \nu_t,
$$

$$
P_{t|t}
=
(1-K_t)P_{t|t-1}.
$$

If prediction uncertainty is large relative to measurement noise, $$K_t$$ is
large and the measurement gets a loud vote. If the sensor is noisy and the model
prediction is tight, $$K_t$$ is small and the measurement is mostly treated as
noise.

Kalman's original 1960 paper gave a recursive solution to the discrete-data
linear filtering and prediction problem using state-transition ideas.[^kalman]
Welch and Bishop's tutorial gives the now-standard practical description of the
filter as a predict-correct cycle.[^welch] That recursion is the engineering
miracle: the filter does not need to keep all past measurements around. The
current posterior is the sufficient summary under the linear-Gaussian model.

## A Kalman Filter Lab

The lab below simulates a hidden random-walk state, noisy measurements, a jump,
optional missing observations, and a filter that may or may not be correctly
tuned. The shaded band is the filter's 95 percent posterior interval. The red
innovation panel shows standardized surprises:

$$
z_t = \frac{\nu_t}{\sqrt{S_t}}.
$$

Under a well-specified linear-Gaussian model, these should look roughly centered
and scaled like unit normal noise. If they drift, cluster, or explode, the model
is arguing with the data.

Try three moves:

1. lower **Assumed process noise** and watch the filter become sluggish after
   the jump;
2. lower **Assumed sensor noise** and watch it chase measurements;
3. add **Sensor bias** and notice the uncomfortable fact that one biased sensor
   can be reinterpreted as a shifted state.

<div id="kalman-lab" class="kalman-lab" data-kalman-lab>
  <div class="kalman-lab__controls">
    <label>
      Truth volatility: <output data-value="truthVol">0.45</output>
      <input type="range" min="0.05" max="1.50" step="0.05" value="0.45" data-param="truthVol">
    </label>
    <label>
      Sensor noise: <output data-value="sensorNoise">1.40</output>
      <input type="range" min="0.20" max="3.00" step="0.05" value="1.40" data-param="sensorNoise">
    </label>
    <label>
      Assumed process noise: <output data-value="modelProcess">0.45</output>
      <input type="range" min="0.01" max="2.00" step="0.01" value="0.45" data-param="modelProcess">
    </label>
    <label>
      Assumed sensor noise: <output data-value="modelSensor">1.40</output>
      <input type="range" min="0.10" max="3.50" step="0.05" value="1.40" data-param="modelSensor">
    </label>
    <label>
      Jump size: <output data-value="shock">4.00</output>
      <input type="range" min="-8" max="8" step="0.25" value="4" data-param="shock">
    </label>
    <label>
      Sensor bias: <output data-value="bias">0.00</output>
      <input type="range" min="-3" max="3" step="0.10" value="0" data-param="bias">
    </label>
    <label>
      Missing observations: <output data-value="dropout">0.000%</output>
      <input type="range" min="0" max="60" step="5" value="0" data-param="dropout">
    </label>
  </div>
  <div class="kalman-lab__metrics" data-metrics></div>
  <canvas data-canvas width="900" height="680" aria-label="Kalman filter simulator showing hidden state, noisy measurements, posterior interval, Kalman gain, innovations, and scoring diagnostics"></canvas>
  <div class="kalman-lab__legend">
    <span><i style="background:#0f766e"></i> Hidden state</span>
    <span><i style="background:#2563eb"></i> Filter estimate</span>
    <span><i style="background:#dbeafe"></i> Posterior band</span>
    <span><i style="background:#94a3b8"></i> Measurement</span>
    <span><i style="background:#be123c"></i> Innovation</span>
    <span><i style="background:#7c3aed"></i> Kalman gain</span>
  </div>
  <p class="kalman-lab__note">
    Deterministic synthetic experiment. The model is scalar and linear:
    x_t = x_{t-1} + w_t, y_t = x_t + v_t. The filter may use noise values
    different from the truth, so bad tuning is visible in RMSE, coverage, and
    standardized innovations.
  </p>
</div>
<script defer src="{{ '/assets/js/kalman-lab.js?v=20260613a' | relative_url }}"></script>

The default setting is intentionally friendly: the filter's assumed process and
sensor noise match the data-generating process. The filter beats the raw
measurements because it pools time. The posterior interval is not perfect in one
finite simulation, but it is at least trying to mean something.

Now lower assumed process noise. You are telling the filter that the state is
nearly constant. The gain falls. The estimate looks smooth, but after the jump
the innovation panel complains. The filter is surprised for too long because it
has been instructed that real jumps are unlikely.

Now lower assumed sensor noise. You are telling the filter that measurements are
precise. The gain rises. The estimate becomes lively, but it starts importing
sensor noise into the state. This is the smoothing tradeoff in its honest form:

```text
lag is often under-trusting the state equation
noise chasing is often over-trusting the measurement equation
```

Add missing observations. The filter does not freeze. It predicts forward and
lets uncertainty grow because the state equation still runs. This is one reason
state-space models are so practical for time series: missingness can be handled
inside the recursion rather than patched afterward.

Add sensor bias. The filter may not scream. In a one-sensor local-level model, a
constant sensor bias can look exactly like a shifted latent state. This is not a
bug in the code. It is an identifiability problem. To separate state from sensor
bias, the model needs more information: another sensor, calibration data, a
strong prior, or a state equation that makes the bias implausible.

## The Innovation Is the Audit Trail

The filtered state is the glamorous line. The innovation is the audit trail.

For the scalar model:

$$
\nu_t = y_t - \hat{x}_{t|t-1},
\qquad
S_t = P_{t|t-1} + R.
$$

If the model is right, the one-step-ahead predictive distribution is:

$$
y_t \mid y_{1:t-1}
\sim
N(\hat{x}_{t|t-1}, S_t).
$$

That gives a log likelihood contribution:

$$
\ell_t
=
-\frac{1}{2}
\left[
\log(2\pi S_t)
+ \frac{\nu_t^2}{S_t}
\right].
$$

This matters in practice. Kalman filtering is not only a way to draw a smoother
line. It gives the likelihood used to estimate unknown state-space parameters,
compare models, detect breakage, and forecast honestly. Modern time-series and
econometric state-space workflows lean heavily on this innovations form of the
likelihood.[^aea-state-space]

The lab reports negative log likelihood per observation, standardized innovation
standard deviation, and interval coverage. They are crude in one short
simulation, but they point at the right habit:

```text
do not judge a filter only by how calm its estimate looks
judge the surprises it leaves behind
```

## Filtering, Smoothing, and Backtests

A filter estimates the current state using data available up to now:

$$
E[x_t \mid y_1,\dots,y_t].
$$

A smoother estimates a past state using future data too:

$$
E[x_t \mid y_1,\dots,y_T].
$$

Both are legitimate. Confusing them is not. If you are reconstructing history,
smoothing can be exactly what you want. If you are trading, controlling a robot,
triggering an alert, or running an online experiment, smoothing can smuggle in
future information and make a backtest glow.

In finance this distinction is everywhere. A trade print is not the efficient
price. A quote is not the state of liquidity. A volatility estimate is not
volatility itself. A Kalman filter can be a disciplined way to separate latent
state from noisy observation, but only if the timing, measurement equation, and
execution assumptions match the decision being tested.

The filter gives you a posterior at time $$t$$. It does not forgive using a
posterior that was computed with time $$t+1$$ data.

## The Matrix Version Is the Same Story

The general linear state-space model is:

$$
x_t = F_t x_{t-1} + B_t u_t + w_t,
\qquad
w_t \sim N(0,Q_t),
$$

$$
y_t = H_t x_t + v_t,
\qquad
v_t \sim N(0,R_t).
$$

The gain becomes:

$$
K_t =
P_{t|t-1}H_t^\top
\left(H_t P_{t|t-1}H_t^\top + R_t\right)^{-1}.
$$

The scalar intuition survives. The gain maps measurement surprise into state
correction. The covariance update says how uncertainty shrinks after seeing the
measurement. Kalman and Bucy's continuous-time work extended the same filtering
logic and linked stochastic estimation with control theory through a duality
principle.[^kalman-bucy]

The matrix notation can make the filter look like a machine made of letters. It
is better to keep the mental picture:

```text
predict with dynamics
measure surprise
spend trust according to uncertainty
carry the posterior forward
```

## Failure Modes Worth Respecting

The Gaussian assumption is not decoration. Heavy-tailed measurement errors,
outliers, censored observations, and adversarial sensors can make the ordinary
Kalman update too trusting. Robust filters, outlier gates, Student-t models, or
particle filters may be more appropriate.

The state equation is a claim. If it says the state is smooth, the filter will
resist jumps. If it says the state jumps constantly, the filter will chase noise.
Tuning $$Q$$ and $$R$$ is not merely "make the line look nice." It is specifying
how the world is allowed to move and how the sensor is allowed to lie.

The measurement equation is a claim too. If the sensor has bias, nonlinear
distortion, regime-dependent noise, stale timestamps, or selection effects, the
filter can confidently estimate the wrong state.

Initialization matters early. A diffuse prior lets early measurements move the
state more; a tight prior makes the filter stubborn. In long series this may
wash out. In short online decisions it can dominate.

Finally, the posterior variance is model variance. It is not a universal
uncertainty certificate. If the model omits important risks, the band can be
narrow and wrong.

## A Run Sheet for Using One

Before I trust a Kalman filter in a real system, I want to know:

- what latent state the filter claims to estimate;
- why the state equation is plausible at the decision horizon;
- what the measurement equation says about each sensor;
- how $$Q$$ and $$R$$ were estimated or chosen;
- whether innovations are centered, scaled, and uncorrelated out of sample;
- how missing observations and stale timestamps are handled;
- whether sensor bias is identifiable;
- whether filtering or smoothing is being used;
- whether downstream decisions use only information available at that time;
- what happens under jumps, outliers, and regime changes.

The Kalman filter is powerful because it is explicit. It asks you to write down
the dynamics, the sensor, and the uncertainty. Then it updates belief with a
number that says exactly how much trust remains to spend.

## The Feeling of the Algorithm

A measurement is a rumor from the world.

A state equation is a rumor from the model.

The Kalman filter listens to both. It asks how uncertain each rumor is, computes
the surprise, spends a trust budget, and carries forward not only an estimate
but also its doubt.

That is why the gain is the soul of the filter. It is the little number where
epistemology becomes arithmetic:

```text
I expected this.
I observed that.
Given what I believe about motion and noise,
how far should I move?
```

Smoothing is easy to fake. Trust accounting is harder. The Kalman filter earns
its place because it makes the accounting recursive, inspectable, and honest
enough to argue with.

## Notes

[^kalman]: R. E. Kalman, ["A New Approach to Linear Filtering and Prediction Problems"](https://courses.cs.duke.edu/compsci527/cps274/fall11/papers/Kalman60.pdf), *Transactions of the ASME--Journal of Basic Engineering*, 1960. [ASME record](https://asmedigitalcollection.asme.org/fluidsengineering/article/82/1/35/397706/A-New-Approach-to-Linear-Filtering-and-Prediction).

[^welch]: Greg Welch and Gary Bishop, ["An Introduction to the Kalman Filter"](https://www.cs.unc.edu/~welch/media/pdf/kalman_intro.pdf), UNC Chapel Hill Technical Report TR 95-041, updated 2006.

[^kalman-bucy]: R. E. Kalman and R. S. Bucy, ["New Results in Linear Filtering and Prediction Theory"](https://people.duke.edu/~hpgavin/SystemID/References/KalmanBucy-ASME-JBE-1961.pdf), *Journal of Basic Engineering*, 1961. [ASME record](https://asmedigitalcollection.asme.org/fluidsengineering/article/83/1/95/426820/New-Results-in-Linear-Filtering-and-Prediction).

[^aea-state-space]: Oscar Jorda and Karel Mertens, ["State-space methods and the Kalman filter"](https://www.aeaweb.org/content/file?id=17941), AEA Continuing Education notes, 2023. For book-length treatments, see Harvey's *Forecasting, Structural Time Series Models and the Kalman Filter* and Durbin and Koopman's *Time Series Analysis by State Space Methods*.
