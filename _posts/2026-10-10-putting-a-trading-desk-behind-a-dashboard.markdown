---
layout: post
title: "Putting a trading desk behind a dashboard"
description: >-
  How FinOS-AgentLab isolates a LangGraph trading desk and a vectorbt quant
  worker behind FastAPI, routes 138 copilot tools under strict token ceilings,
  caches prompt prefixes, and tests its agent loop offline.
image: /assets/social/putting-a-trading-desk-behind-a-dashboard.png
date: 2026-10-10 08:00:00 -0400
excerpt: >-
  A self-hosted finance workspace with a copilot on every page and a
  multi-agent trading desk behind it. The interesting work is the plumbing:
  keeping 138 tools inside a prompt budget, keeping the cache warm, and testing
  the agent loop without a model.
links:
  - title: Source
    url: https://github.com/Sir-Teo/FinOS-AgentLab
styles:
  - /assets/css/finos-agentlab.css
scripts:
  - /assets/js/finos-agentlab.js
---

**FinOS-AgentLab** is a self-hosted research workspace for markets: dashboards, watchlists, stock pages, a portfolio view, and a copilot on every page that knows which page you're on. Behind the copilot sit five specialist sub-agents and a "trading desk" built on TradingAgents, an open-source multi-agent framework in which analyst, bull, bear, and risk agents debate a stock until it reaches a buy, sell, or hold.

This post is mostly about the plumbing around those agents: separate processes so their dependencies don't collide, a budget for how many tools each turn can carry, a prompt ordered so the provider's cache stays warm, a scheduler that survives a reboot, and tests that run without a model. Each figure either runs the backend's own Python routing, prompt-assembly, and scheduler code offline, or replays the 22 desk transcripts and scripted test runs recorded in the repository.

## Four processes

<figure class="fig" id="fa-arch">
<svg class="arch" viewBox="0 0 680 318" role="img" aria-label="Architecture: a Next.js app talks to a FastAPI backend over REST, server-sent events and a WebSocket; the backend starts a TradingAgents subprocess per desk run and keeps one warm quant worker, both speaking JSON lines; SQLite and provider caches sit underneath.">
<defs>
<marker id="fa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="24" y="24" width="632" height="42" rx="6"/>
<text class="t" x="340" y="38">Next.js app</text>
<text class="st" x="340" y="55">agent chat, home, dashboards, markets, stock pages, portfolio, watchlists, world, data</text>
<path class="edge-strong" data-flow="both" d="M340 68 V98" marker-start="url(#fa-arrow)" marker-end="url(#fa-arrow)"/>
<text class="el" x="430" y="87">REST · SSE · WebSocket</text>
<rect class="box em" x="24" y="100" width="632" height="60" rx="6"/>
<text class="t" x="340" y="116">FastAPI backend</text>
<text class="st" x="340" y="134">543 routes · 454 service modules · one scheduler</text>
<text class="st" x="340" y="150">copilot: 138 tools, 21 of them core · 5 specialists · 150 shipped commands</text>
<path class="edge-strong" data-flow="up" d="M176 162 V190" marker-start="url(#fa-arrow)"/>
<text class="el" x="252" y="181" style="font-size:9.5px">JSONL, one event per line</text>
<path class="edge-strong" data-flow="both" d="M504 162 V190" marker-start="url(#fa-arrow)" marker-end="url(#fa-arrow)"/>
<text class="el" x="582" y="181" style="font-size:9.5px">JSONL, request and reply</text>
<rect class="box" x="24" y="192" width="304" height="58" rx="6"/>
<text class="t" x="176" y="208">agents-runtime</text>
<text class="st" x="176" y="225">TradingAgents 0.6.0 on LangGraph, its own venv</text>
<text class="st" x="176" y="240">one subprocess per run, at most five at once</text>
<rect class="box" x="352" y="192" width="304" height="58" rx="6"/>
<text class="t" x="504" y="208">quant-runtime</text>
<text class="st" x="504" y="225">vectorbt and numba, its own venv</text>
<text class="st" x="504" y="240">one warm worker, respawned when it stalls</text>
<rect class="box" x="24" y="274" width="632" height="38" rx="6"/>
<text class="t" x="340" y="287">On disk</text>
<text class="st" x="340" y="303">SQLite: dashboards, watchlists, runs, chats, specialists, settings · provider caches · the desk’s memory log</text>
</svg>
<figcaption>The desk and the quant engine run in their own virtual environments and talk to the backend one JSON line at a time.</figcaption>
</figure>

Four processes and three Python environments is a truce with dependency management. TradingAgents pulls in the LangChain and LangGraph stack. The backtesting engine relies on `vectorbt` and `numba`. Both pin packages that clash with the FastAPI backend's own.

So instead of forcing three incompatible dependency trees into one environment, the backend runs each runtime as a separate process and talks to it in JSON lines (`JSONL`, one JSON object per line) over standard input and output. The two runtimes live opposite lives:

- **The desk is disposable.** Each run starts a fresh `agents-runtime` process and relays its output lines to the browser as server-sent events. A LangGraph process claims a few hundred megabytes, so a semaphore caps the desk at five runs at once and queues the rest.
- **The quant worker stays warm.** Importing `numba` and `vectorbt` is slow, so the backend starts one worker at boot, keeps it across requests, and respawns it if a calculation stalls.

## The desk

<figure class="fig wide" id="fa-firm" style="--reserve: 900px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>TradingAgents 0.6.0's graph as the runner builds it, and the 22 desk runs recorded in the project's static export, each event a block sized by its bytes.</figcaption>
</figure>

Convening the desk used to be a tool the chat copilot could call on its own judgment, which meant a casual question could set off a multi-minute, twelve-node debate. Now a desk run is always deliberate: typing `@TradingAgents NVDA` in chat starts the graph directly and streams every analyst report, bull and bear rebuttal, and risk-committee turn into the thread, with no model in the middle deciding whether to.

Ten of the 22 recorded runs reached a final verdict (3 `BUY`, 5 `SELL`, 2 `HOLD`). Replaying the transcripts turned up two bugs that only appear when real model providers meet LangGraph's state.

The first was a missing bull. In <a class="act" href="#fa-firm" data-run="e35b83">one NVDA run</a> and <a class="act" href="#fa-firm" data-run="a730e0">one MU run</a>, a free upstream model router intercepted the Bull Researcher's turn and returned a content-safety label, `safety: safe`, instead of an argument. With nobody making the case for the stock, both desks marched to `SELL`. Since September, the runner checks every turn against a classifier pattern and asks again, up to three times, before any later agent reads it:

```py
_CLASSIFIER_REPLY = re.compile(
    r"^\s*(?:(?:user|response|prompt|agent)\s+)?safety\s*:\s*(?:un)?safe\b", re.IGNORECASE
)
```

The second was a missing risk committee. Every finished run in the recordings streamed only the `Neutral` risk analyst's turn. All three risk analysts had run, but the runner looked up `risky` and `safe` in the state where `TradingAgents 0.6.0` writes `aggressive` and `conservative`, so two of the three risk views were dropped without an error. A contract test now pins those state keys.

## What a turn carries

<figure class="fig wide" id="fa-pay" style="--reserve: 505px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Prompt and tool schemas routed for one question on each of the app's pages, each tool a block, measured with the backend's <code>tools_for_request</code> against the ceilings its tests pin.</figcaption>
</figure>

A model API call pays for every tool definition it carries, on every round of every turn. Sending all 138 tools each time would spend tens of thousands of characters before the user had asked anything. Instead, `tools_for_request` picks a slice per turn: 21 core tools always, the current page's own group, and any groups whose keywords appear in the question.

To stop that budget from creeping back up, a test pins a character ceiling for a plain question on each page, and raising a ceiling requires a written note in the test file. The dashboards page already sits at 28,923 characters against its 28,950 ceiling before any keywords fire. Asking <a class="act" href="#fa-pay" data-q="1">a question about the portfolio</a> ("how is my book doing?") pulls in enough portfolio and risk tools to push almost every page past its baseline.

## Ordered by how often it changes

<figure class="fig" id="fa-rungs" style="--reserve: 420px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Six turns of one conversation as the loop assembles them, measured with the backend's own prompt, command, policy and context builders, with turn sizes from its scripted scenarios.</figcaption>
</figure>

Routing fewer tools shrinks each request. Ordering the prompt keeps it cheap across turns. Model providers cache the start of a prompt: if a request begins with exactly the same text as the last one, that shared prefix is cheaper and faster to process. Anything that changes invalidates the cache for everything after it.

So the loop sends its system messages in order of how often they change. The base system prompt (about 5,000 characters), the list of 150 slash commands (about 16,000), and the mode policy (about 1,000) never change within a conversation, so they go first, followed by the growing history.

The page-context block is small (687 characters), but it carries a timestamp that changes every minute, so it goes last, just before the newest question. <a class="act" href="#fa-rungs" data-order="old">It used to sit before the history</a>, which meant that each time the clock ticked over a minute, one changed line invalidated the cache for the entire conversation behind it.

## Building an agent

<figure class="fig wide" id="fa-spec" style="--reserve: 450px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The copilot's 138 tools, one cell each, and what the loop's <code>plan_tools</code> hands the parent turn and each shipped specialist for the same question.</figcaption>
</figure>

When a question needs several rounds of lookups, the copilot can hand a sub-question to a specialist: a smaller loop with its own instructions and a narrower set of tools, which does the lookups on its own and returns one paragraph. Five specialists ship with the app (`general`, `market`, `filings`, `web`, and `portfolio`), and you can declare up to eight of your own in settings, each with a `@name`, up to 4,000 characters of instructions, a tool allowlist, a model, and at most eight rounds.

Some limits no declaration can override, because they live in the loop itself. Every specialist runs in read-only `ask` mode. Its tools can only narrow the parent's read-only tools. And a specialist can't delegate again. <a class="act" href="#fa-spec" data-agent="general">The general specialist</a> declares no tool filter, so `plan_tools` hands it the full read-only slice for the question, delegation tool included, and the loop refuses the call if it tries to use it.

## One run per slot

<figure class="fig wide" id="fa-jobs" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>A week of the ten system jobs on the backend's own scheduler, stepped a minute at a time, with one window of it drawn minute by minute.</figcaption>
</figure>

One scheduler drives the backend's ten recurring jobs (market snapshots, nightly syncs, thesis scans, and morning and evening briefs), checking once a minute. Each job is keyed to a slot, a calendar date or an hour, and may succeed at most once per slot. During an <a class="act" href="#fa-jobs" data-scenario="outage">upstream outage</a>, a failing job retries up to three times in its slot, a minute apart, then waits for the next one.

A self-hosted box can reboot or sleep at any hour. After a <a class="act" href="#fa-jobs" data-scenario="restart">restart</a>, any job still marked `running` in SQLite is treated as failed and runs again at once, but a morning brief whose window has closed is skipped instead of delivering a pre-market summary at noon.

## Tests without a key

<figure class="fig wide" id="fa-evals" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The core suite run scripted on this machine and replayed at its recorded pace: the real loop, catalogue and checks against a model that plays a fixed script, with no network.</figcaption>
</figure>

Half of the core evaluation suite (17 of 34 scenarios, 144 checks) runs in five seconds with no API key and outbound network blocked, because what it tests is the loop, not the model. A scripted fake model plays back fixed tool calls and failures against the real `CopilotLoop`, tool registry, and permission checks. It confirms that <a class="act" href="#fa-evals" data-id="permission.attempt_is_refused">an action attempted in read-only mode is stopped</a> before it touches disk, that <a class="act" href="#fa-evals" data-id="leaked_call.retried_not_shipped">a tool call the model wrote out as prose</a> is sent back for a retry instead of shown to the user, and that <a class="act" href="#fa-evals" data-id="horizon.early_lookup_survives">a turn with sixteen lookups</a> compacts old results out of its context as it goes and still answers with the very first one.

None of this makes the models smarter. It makes the system around them cheaper per turn, harder to set off by accident, and testable on a laptop with the network unplugged.
