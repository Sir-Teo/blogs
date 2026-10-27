# Building the volume and timing method

The article tells the story of developing a method through controlled synthetic experiments:
construct a baseline, reveal a partial curve, test a scale-only forecast,
add a normalized timing tilt, match average arrival times, and evaluate the hidden
tail. Short formulas appear beside the corresponding visuals. Figures show normalized experimental
results rather than measurements from a source document.

`assets/js/volume-timing-fit.js` is the standalone fitting function used by
the article. The figure renderer is `assets/js/two-step.js`; the original
internal folder slug is retained so existing local tooling continues to work.

## Reproduce

Run from the repository root:

```sh
node _tools/two-step-demo/build_experiment.cjs
node _tools/two-step-demo/verify_experiment.cjs
node _tools/two-step-demo/verify.cjs
```

The generator reads no source documents. It chooses generating parameters,
draws independent observed and hidden counts, fits only observed counts,
and writes `assets/data/two-step/experiment.json`. The known generating mean
is the reference shown in the forecast figure. Displaying normalized units
does not change the fit.

The experiment check covers unchanged shape, volume alone, timing alone,
combined changes, identifiable cutoffs, and an unidentifiable narrow window.
The numerical suite also checks likelihood profiling, derivatives, total
conservation, and time-unit invariance.

The fixed daily-count realization preserves the original observed and hidden
interval totals. The two Move Now controls reveal this same history at a new
cutoff, update all intermediate forecasts together and hide the future again.
The fit only sees elapsed days. With one observed interval it abstains and
keeps the baseline. The volume/timing figure adds three visible presets while
remaining a separate controlled-pattern sandbox. Tests check every daily
cutoff, count conservation and invariance to changes in the hidden tail.

## Browser verification

Build and serve the site, then run:

```sh
node _tools/two-step-demo/verify-browser.cjs
```

Set `BLOG_URL` to override the local article URL. The check covers figure
controls, symbolic prose, normalized readouts, mobile layouts, both themes,
keyboard and touch interaction, aligned average-time markers, hidden-future reveal, equation rendering, and data-loading failure.
Screenshots are kept in the ignored `screenshots/` directory.

The site-wide equation check is `node _tools/check-math.cjs`. Set
`BLOG_ORIGIN` and `BLOG_SITE` to the served origin and compiled site
directory. It verifies the shared renderer, dynamic insertion, accessible
math, and code and currency handling.
