---
layout: page
title: About
permalink: /about/
---

I'm Teo. I build things, mostly ones that run in a browser tab, and write them up here with figures that run the real code. More at [teozeng.dev](https://teozeng.dev), code on [GitHub](https://github.com/Sir-Teo), and long-form math and science films on [YouTube](https://www.youtube.com/@teozeng3999).

## What's here

Most posts follow one project. The figures in them run that project's own code, so when you change an input you see what the real thing does, not a sketch of it.

- **Game engines in a browser tab.** [KataGo]({{ site.baseurl }}{% post_url 2026-10-09-putting-katago-in-a-browser-tab %}), [Stockfish]({{ site.baseurl }}{% post_url 2026-10-09-grading-chess-moves-in-a-browser-tab %}), and [Pikafish]({{ site.baseurl }}{% post_url 2026-10-09-compiling-a-xiangqi-engine-for-the-browser %}): Go, chess, and xiangqi engines running in a web page with no server.
- **Games rebuilt for the browser.** [San Andreas streamed into a tab]({{ site.baseurl }}{% post_url 2026-10-09-porting-san-andreas-to-a-browser-tab %}), and [a village raider whose battles replay from a 10 KB log]({{ site.baseurl }}{% post_url 2026-10-09-replaying-a-village-raid %}).
- **How Minecraft works.** [Part 1]({{ site.baseurl }}{% post_url 2026-10-26-taking-minecraft-apart-one-block-at-a-time %}) rebuilds a playable world one system at a time; [Part 2]({{ site.baseurl }}{% post_url 2026-10-26-one-world-two-players %}) lets a second player in.
- **Tools at scale.** [A finance workspace with a trading desk of agents]({{ site.baseurl }}{% post_url 2026-10-10-putting-a-trading-desk-behind-a-dashboard %}), [twenty-two hours of math films rendered from code]({{ site.baseurl }}{% post_url 2026-10-18-rendering-twenty-two-hours-of-math-from-code %}), and [an atlas of 6,684 ideas]({{ site.baseurl }}{% post_url 2026-10-18-drawing-six-thousand-ideas-in-one-dependency-graph %}).
- **Reading my own data.** What [Duolingo]({{ site.baseurl }}{% post_url 2026-11-09-reading-my-own-duolingo-export %}), [OpenAI]({{ site.baseurl }}{% post_url 2026-11-15-reading-my-own-openai-export %}), and [Google]({{ site.baseurl }}{% post_url 2026-11-24-reading-my-own-google-export %}) kept about me.
- **Lean proof walkthroughs.** [Walking through the Lean proof of the Riemann Hypothesis]({{ site.baseurl }}{% post_url 2026-11-21-walking-through-the-lean-proof-of-the-riemann-hypothesis %}) and [Walking through the Lean proof of Navier–Stokes blow-up]({{ site.baseurl }}{% post_url 2026-11-22-walking-through-the-lean-proof-of-navier-stokes-blow-up %}), each putting the full Lean codebase in one interactive dependency map.
- **Everything else.** [The case for LeBron James]({{ site.baseurl }}{% post_url 2026-10-25-making-the-goat-case-for-lebron-james %}), and two posts on airline pricing: [a demand forecast]({{ site.baseurl }}{% post_url 2026-10-26-telling-more-shoppers-from-earlier-shoppers %}) and [a pricing analysis product]({{ site.baseurl }}{% post_url 2026-10-26-turning-millions-of-fare-searches-into-a-pricing-alert %}).

## How the posts are made

The figures are written by hand in plain JavaScript, SVG, canvas, and WebGL, with no chart library, and the data behind them lives in [this site's repository](https://github.com/Sir-Teo/blogs). Posts built on data end with a note on sources and methods, with the files to check the numbers yourself.
